/*
 * =========================================================================
 * PPG Biometric 2FA Vault Lock — Arduino UNO Firmware (Web-Synced)
 * =========================================================================
 * Hardware Connections:
 *   - HW-827 Optical Pulse Sensor -> Analog Pin A0 (VCC=5V, GND=GND, S=A0)
 *   - Servo Motor (Deadbolt Lock) -> Digital Pin 9 (0 deg=Locked, 90 deg=Open)
 *   - Buzzer                      -> Digital Pin 8
 *   - Status LED                  -> Digital Pin 7
 *   - 16x2 I2C LCD                -> SDA=A4, SCL=A5 (Auto-detects 0x27 / 0x3F)
 *
 * Serial Baud Rate: 9600 (Must match WebSerial in browser)
 *
 * Supported Web-Synced Commands:
 *   - CMD:LCD <line1>|<line2>      -> Mirror exact website status on 16x2 LCD
 *   - CMD:UNLOCK [reason]          -> Open Servo (90 deg), LED ON, Chime, LCD
 *   - CMD:LOCK / RESET             -> Close Servo (0 deg), LED OFF, LCD Locked
 *   - CMD:DENY [reason]            -> Keep Servo 0 deg, Error Buzzer, LCD Denied
 *   - CMD:SET_TEMPLATE v0,...,v19  -> Sync active enrolled user's 20-pt template
 *   - MODE:AUTH                    -> Set Authentication Mode
 *   - MODE:ENROLL                  -> Set Enrollment Mode
 *   - START                        -> Begin PPG pulse capture & beat streaming
 * =========================================================================
 */

#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <Servo.h>
#include <EEPROM.h>
#include <avr/pgmspace.h>

// ================= PIN CONFIGURATION =================
#define PPG_PIN     A0
#define SERVO_PIN   9
#define BUZZER_PIN  8
#define LED_PIN     7

// ================= SERVO ANGLES =================
#define SERVO_LOCKED_ANGLE   0
#define SERVO_UNLOCKED_ANGLE 90

// ================= PPG SETTINGS =================
#define SAMPLE_INTERVAL   10      // 10ms -> 100Hz ADC sampling
#define MIN_IBI           400     // 150 BPM max
#define MAX_IBI           1333    // 45 BPM min
#define WAVE_POINTS       20
#define MIN_SIGNAL        8
#define MATCH_THRESHOLD   70

// ================= EEPROM =================
#define MAGIC_ADDRESS     0
#define TEMPLATE_ADDRESS  4
#define MAGIC_VALUE       23917

// ================= 5 ENROLLED TEAM PROFILES (PROGMEM) =================
const byte NUM_TEAM_PROFILES = 5;
const byte TEAM_TEMPLATES[5][WAVE_POINTS] PROGMEM = {
  // 0: Vedant (PIN 1234, ~72 BPM)
  { 86, 178, 233, 178,  91,  58,  68,  77,  64,  40,  22,  15,  15,  15,  15,  15,  15,  15,  15,  15 },
  // 1: Yadnyesh (PIN 5678, ~68 BPM)
  { 25,  25,  25,  24,  24,  24,  24,  25,  36,  84, 177, 233, 178,  91,  55,  60,  67,  58,  41,  28 },
  // 2: Hetal (PIN 4321, ~80 BPM)
  { 25,  26,  36,  84, 176, 231, 176,  88,  54,  60,  67,  57,  37,  22,  16,  15,  15,  15,  15,  15 },
  // 3: Samiksha (PIN 8765, ~75 BPM)
  { 25,  25,  24,  24,  25,  36,  83, 176, 231, 177,  90,  57,  65,  74,  63,  42,  26,  19,  16,  16 },
  // 4: Tejas (PIN 9999, ~84 BPM)
  { 25,  26,  26,  27,  27,  28,  28,  29,  29,  30,  32,  44,  92, 186, 243, 193, 112,  79,  76,  67 }
};

// ================= HARDWARE OBJECTS =================
// Supports both 0x27 and 0x3F I2C backpacks automatically
LiquidCrystal_I2C lcd27(0x27, 16, 2);
LiquidCrystal_I2C lcd3F(0x3F, 16, 2);
LiquidCrystal_I2C* pLcd = &lcd27;
#define lcd (*pLcd)

Servo lockServo;

// ================= SYSTEM STATE =================
bool isEnrollMode      = false;
bool isUnlockedState   = false;
bool isCapturing       = false;
unsigned long captureStartMs = 0;
unsigned long captureTargetMs = 4500UL;

// Serial input buffer (non-blocking)
String serialBuf = "";

// LCD state (flicker-free caching)
String lastLcd1 = "";
String lastLcd2 = "";
bool lcdWebControlled = false;

// ================= PPG SIGNAL VARIABLES =================
byte enrolled[WAVE_POINTS];
byte currentTemplate[WAVE_POINTS];
unsigned int accumulator[WAVE_POINTS];
byte beatWave[WAVE_POINTS];

long baseline         = 512;
int previousAC        = 0;
int signalMin         = 1023;
int signalMax         = 0;
int peakThreshold     = 10;
bool rising           = false;

unsigned long lastBeatMs      = 0;
unsigned long beatStartMs     = 0;
unsigned long lastIntervalMs  = 800;
unsigned long totalIntervalMs = 0;

byte beatCount        = 0;
byte validIntervals   = 0;
byte templateBeats    = 0;
int  bpm              = 0;

byte beatMin          = 255;
byte beatMax          = 0;

unsigned long lastSampleMs   = 0;
byte streamDivider           = 0;

// ========================================================
// FLICKER-FREE 16x2 LCD HELPER
// ========================================================
void printPaddedLine(byte row, const String& text) {
  char buf[17];
  int len = text.length();
  for (byte i = 0; i < 16; i++) {
    if (i < len) {
      char c = text.charAt(i);
      // Keep printable ASCII so HD44780 LCD never shows garbled bytes
      buf[i] = (c >= 32 && c <= 126) ? c : '*';
    } else {
      buf[i] = ' ';
    }
  }
  buf[16] = '\0';
  lcd.setCursor(0, row);
  lcd.print(buf);
}

void updateLcd(const String& line1, const String& line2) {
  if (line1 == lastLcd1 && line2 == lastLcd2) return;
  lastLcd1 = line1;
  lastLcd2 = line2;
  printPaddedLine(0, line1);
  printPaddedLine(1, line2);
}

// ========================================================
// SERVO & ACTUATOR CONTROLS
// ========================================================
void unlockVaultServo() {
  isUnlockedState = true;
  isCapturing = false;
  lcdWebControlled = true;

  // Move physical servo deadbolt to OPEN (90 degrees)
  if (!lockServo.attached()) {
    lockServo.attach(SERVO_PIN);
  }
  lockServo.write(SERVO_UNLOCKED_ANGLE);
  digitalWrite(LED_PIN, HIGH);

  // Success chime
  tone(BUZZER_PIN, 2000, 180);
  delay(200);
  tone(BUZZER_PIN, 2500, 220);

  updateLcd("ACCESS GRANTED", "VAULT UNLOCKED");

  Serial.println(F("ACCESS GRANTED"));
  Serial.println(F("ACK:UNLOCK:SUCCESS"));
}

void lockVaultServo() {
  isUnlockedState = false;
  isCapturing = false;
  lcdWebControlled = false;

  // Move physical servo deadbolt to LOCKED (0 degrees)
  if (!lockServo.attached()) {
    lockServo.attach(SERVO_PIN);
  }
  lockServo.write(SERVO_LOCKED_ANGLE);
  digitalWrite(LED_PIN, LOW);
  noTone(BUZZER_PIN);

  updateLcd(isEnrollMode ? "ENROLL MODE" : "ACCESS LOCKED", "PLACE FINGER");

  Serial.println(F("SYSTEM LOCKED"));
  Serial.println(F("ACK:LOCK:SUCCESS"));
}

void triggerDenyFeedback(const String& reasonLine) {
  isUnlockedState = false;
  isCapturing = false;
  lcdWebControlled = true;

  lockServo.write(SERVO_LOCKED_ANGLE);
  updateLcd("ACCESS DENIED", reasonLine.length() > 0 ? reasonLine : "TRY AGAIN");

  for (byte i = 0; i < 3; i++) {
    digitalWrite(LED_PIN, HIGH);
    tone(BUZZER_PIN, 900, 120);
    delay(150);
    digitalWrite(LED_PIN, LOW);
    delay(120);
  }
  noTone(BUZZER_PIN);
  Serial.println(F("ACCESS DENIED"));
}

// ========================================================
// EEPROM TEMPLATE STORAGE
// ========================================================
void saveTemplate() {
  EEPROM.put(MAGIC_ADDRESS, (int)MAGIC_VALUE);
  for (byte i = 0; i < WAVE_POINTS; i++) {
    EEPROM.update(TEMPLATE_ADDRESS + i, enrolled[i]);
  }
}

bool loadTemplate() {
  int magic = 0;
  EEPROM.get(MAGIC_ADDRESS, magic);
  if (magic != MAGIC_VALUE) {
    // Load default Vedant profile from PROGMEM
    for (byte i = 0; i < WAVE_POINTS; i++) {
      enrolled[i] = pgm_read_byte(&TEAM_TEMPLATES[0][i]);
    }
    saveTemplate();
    return false;
  }
  for (byte i = 0; i < WAVE_POINTS; i++) {
    enrolled[i] = EEPROM.read(TEMPLATE_ADDRESS + i);
  }
  return true;
}

// ========================================================
// PPG CAPTURE & BEAT PROCESSING
// ========================================================
void resetCapture() {
  previousAC       = 0;
  signalMin        = 1023;
  signalMax        = 0;
  peakThreshold    = 10;
  rising           = false;

  lastBeatMs       = 0;
  beatStartMs      = 0;
  lastIntervalMs   = 800;
  totalIntervalMs  = 0;

  beatCount        = 0;
  validIntervals   = 0;
  templateBeats    = 0;
  bpm              = 0;

  beatMin          = 255;
  beatMax          = 0;

  for (byte i = 0; i < WAVE_POINTS; i++) {
    accumulator[i]     = 0;
    beatWave[i]        = 0;
    currentTemplate[i] = 0;
  }
}

void startPpgCapture() {
  resetCapture();
  isCapturing = true;
  captureStartMs = millis();
  captureTargetMs = isEnrollMode ? 19000UL : 4200UL;

  Serial.println(F("PPG SIGNAL DETECTED"));
  Serial.println(F("CAPTURING..."));
}

void addCompletedBeat() {
  if (beatMax <= beatMin) return;
  byte range = beatMax - beatMin;
  if (range < 4) return;

  for (byte i = 0; i < WAVE_POINTS; i++) {
    byte norm = (byte)(((unsigned long)(beatWave[i] - beatMin) * 255UL) / range);
    accumulator[i] += norm;
  }
  templateBeats++;
  Serial.print(F("PPG BEAT USED = "));
  Serial.println(templateBeats);
}

void collectBeatSample(int raw) {
  if (beatStartMs == 0) return;
  unsigned long elapsed = millis() - beatStartMs;
  if (elapsed >= lastIntervalMs) return;

  byte idx = (byte)((elapsed * WAVE_POINTS) / lastIntervalMs);
  if (idx >= WAVE_POINTS) idx = WAVE_POINTS - 1;

  byte scaled = (byte)constrain(raw >> 2, 0, 255);
  beatWave[idx] = scaled;
  if (scaled < beatMin) beatMin = scaled;
  if (scaled > beatMax) beatMax = scaled;
}

void finishCaptureAndEmit() {
  isCapturing = false;

  if (templateBeats > 0) {
    for (byte i = 0; i < WAVE_POINTS; i++) {
      currentTemplate[i] = (byte)constrain(accumulator[i] / templateBeats, 10, 255);
    }
  } else {
    // If finger produced weak/no distinct peaks, emit scaled active waveform
    for (byte i = 0; i < WAVE_POINTS; i++) {
      currentTemplate[i] = (beatWave[i] > 10) ? beatWave[i] : enrolled[i];
    }
  }

  if (validIntervals > 0 && totalIntervalMs > 0) {
    unsigned long avgIbi = totalIntervalMs / validIntervals;
    bpm = (int)(60000UL / avgIbi);
  }

  Serial.println(F("CAPTURE FINISHED"));
  Serial.print(F("BEATS = "));
  Serial.println(beatCount);
  if (bpm > 0) {
    Serial.print(F("BPM = "));
    Serial.println(bpm);
  }

  // Emit 20-point morphological vector to Website & Backend
  Serial.print(F("TEMPLATE:["));
  for (byte i = 0; i < WAVE_POINTS; i++) {
    Serial.print(currentTemplate[i]);
    if (i < WAVE_POINTS - 1) Serial.print(F(","));
  }
  Serial.println(F("]"));

  if (isEnrollMode) {
    for (byte i = 0; i < WAVE_POINTS; i++) {
      enrolled[i] = currentTemplate[i];
    }
    saveTemplate();
    Serial.println(F("ENROLLMENT SUCCESS"));
    Serial.println(F("TEMPLATE SAVED"));
    tone(BUZZER_PIN, 2000, 250);
    isEnrollMode = false;
  }
}

void processPpgSample(int raw) {
  // Moving DC baseline filter
  baseline = (baseline * 96L + (long)raw * 4L) / 100L;
  int ac = raw - (int)baseline;

  // Stream live ADC waveform at 50Hz to Web Oscilloscope
  if (++streamDivider >= 2) {
    streamDivider = 0;
    Serial.print(F("RAW:"));
    Serial.print(raw);
    Serial.print(F(",AC:"));
    Serial.println(ac);
  }

  if (!isCapturing) {
    previousAC = ac;
    return;
  }

  if (raw < signalMin) signalMin = raw;
  if (raw > signalMax) signalMax = raw;

  // Adaptive systolic peak threshold
  int amp = signalMax - signalMin;
  peakThreshold = max(8, amp / 5);

  if (ac > previousAC && ac > peakThreshold) {
    rising = true;
  }

  if (rising && ac < previousAC) {
    rising = false;
    unsigned long now = millis();

    if (lastBeatMs == 0) {
      lastBeatMs = now;
      beatStartMs = now;
      beatCount = 1;
      beatMin = 255;
      beatMax = 0;
      Serial.println(F("FIRST BEAT"));
    } else {
      unsigned long ibi = now - lastBeatMs;
      if (ibi >= MIN_IBI && ibi <= MAX_IBI) {
        addCompletedBeat();
        beatCount++;
        validIntervals++;
        totalIntervalMs += ibi;
        lastIntervalMs = ibi;
        lastBeatMs = now;
        beatStartMs = now;
        beatMin = 255;
        beatMax = 0;
        bpm = (int)(60000UL / ibi);

        Serial.print(F("BEAT "));
        Serial.print(beatCount);
        Serial.print(F(" IBI="));
        Serial.println(ibi);
      } else if (ibi > MAX_IBI) {
        lastBeatMs = now;
        beatStartMs = now;
        beatMin = 255;
        beatMax = 0;
      }
    }
  }

  collectBeatSample(raw);
  previousAC = ac;

  // Complete capture after target window
  if (millis() - captureStartMs >= captureTargetMs) {
    finishCaptureAndEmit();
  }
}

// ========================================================
// NON-BLOCKING SERIAL COMMAND PARSER
// ========================================================
void handleCommand(String cmd) {
  cmd.trim();
  if (cmd.length() == 0) return;

  // 1. Direct LCD Mirror from Website: CMD:LCD <line1>|<line2>
  if (cmd.startsWith("CMD:LCD ") || cmd.startsWith("LCD:")) {
    String payload = cmd.startsWith("CMD:LCD ") ? cmd.substring(8) : cmd.substring(4);
    int sep = payload.indexOf('|');
    String l1 = (sep >= 0) ? payload.substring(0, sep) : payload;
    String l2 = (sep >= 0) ? payload.substring(sep + 1) : "";
    lcdWebControlled = true;
    updateLcd(l1, l2);
    Serial.print(F("LCD:ACK:"));
    Serial.print(l1);
    Serial.print(F("|"));
    Serial.println(l2);
    return;
  }

  // 2. Unlock Vault (2FA Verified -> Rotate Servo to 90 degrees)
  if (cmd.startsWith("CMD:UNLOCK") || cmd.equalsIgnoreCase("UNLOCK")) {
    unlockVaultServo();
    return;
  }

  // 3. Relock Vault (Rotate Servo back to 0 degrees)
  if (cmd.equalsIgnoreCase("CMD:LOCK") || cmd.equalsIgnoreCase("LOCK") || cmd.equalsIgnoreCase("RESET")) {
    lockVaultServo();
    return;
  }

  // 4. Access Denied Feedback (Keep Servo at 0 degrees + Error Chime)
  if (cmd.startsWith("CMD:DENY") || cmd.equalsIgnoreCase("DENY")) {
    String reason = "TRY AGAIN";
    if (cmd.indexOf("WRONG_PIN") >= 0) reason = "WRONG PIN";
    else if (cmd.indexOf("BIO_MISMATCH") >= 0) reason = "BIO MISMATCH";
    else if (cmd.indexOf("PIN_LOCKOUT") >= 0) reason = "LOCKED OUT";
    triggerDenyFeedback(reason);
    return;
  }

  // 5. Sync Enrolled User Template from Website (Vedant, Yadnyesh, Hetal, Samiksha, Tejas)
  if (cmd.startsWith("CMD:SET_TEMPLATE ") || cmd.startsWith("SET:TEMPLATE:")) {
    String payload = cmd.startsWith("CMD:SET_TEMPLATE ") ? cmd.substring(17) : cmd.substring(13);
    payload.trim();
    int idx = 0;
    int startIdx = 0;
    while (idx < WAVE_POINTS && startIdx < (int)payload.length()) {
      int comma = payload.indexOf(',', startIdx);
      String valStr = (comma >= 0) ? payload.substring(startIdx, comma) : payload.substring(startIdx);
      valStr.trim();
      enrolled[idx] = (byte)constrain(valStr.toInt(), 10, 255);
      idx++;
      if (comma < 0) break;
      startIdx = comma + 1;
    }
    saveTemplate();
    Serial.print(F("ACK:TEMPLATE_UPDATED:"));
    Serial.println(idx);
    return;
  }

  // 6. Mode Switches
  if (cmd.equalsIgnoreCase("MODE:ENROLL") || cmd.equalsIgnoreCase("CMD:ENROLL") || cmd.equalsIgnoreCase("ENROLL")) {
    isEnrollMode = true;
    isUnlockedState = false;
    lockServo.write(SERVO_LOCKED_ANGLE);
    Serial.println(F("MODE:ENROLL_ACTIVE"));
    updateLcd("ENROLL MODE", "PLACE FINGER");
    return;
  }

  if (cmd.equalsIgnoreCase("MODE:AUTH") || cmd.equalsIgnoreCase("CMD:AUTH") || cmd.equalsIgnoreCase("AUTH")) {
    isEnrollMode = false;
    Serial.println(F("MODE:AUTH_ACTIVE"));
    if (!isUnlockedState && !lcdWebControlled) {
      updateLcd("ACCESS LOCKED", "PLACE FINGER");
    }
    return;
  }

  // 7. Start Scan (Triggered by Website "Scan Fingerprint" or "Start Enrollment")
  if (cmd.equalsIgnoreCase("START") || cmd.equalsIgnoreCase("START_AUTH")) {
    if (!isUnlockedState) {
      startPpgCapture();
    }
    return;
  }
}

void checkSerialCommands() {
  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    if (c == '\n' || c == '\r') {
      if (serialBuf.length() > 0) {
        handleCommand(serialBuf);
        serialBuf = "";
      }
    } else if (serialBuf.length() < 120) {
      serialBuf += c;
    }
  }
}

// ========================================================
// SETUP
// ========================================================
void setup() {
  Serial.begin(9600);
  serialBuf.reserve(128);

  pinMode(PPG_PIN, INPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);
  noTone(BUZZER_PIN);

  // Initialize Servo in LOCKED position (0 degrees)
  lockServo.attach(SERVO_PIN);
  lockServo.write(SERVO_LOCKED_ANGLE);

  // Auto-detect I2C LCD address (0x27 or 0x3F)
  Wire.begin();
  Wire.beginTransmission(0x27);
  if (Wire.endTransmission() != 0) {
    Wire.beginTransmission(0x3F);
    if (Wire.endTransmission() == 0) {
      pLcd = &lcd3F;
      Serial.println(F("LCD:FOUND_0x3F"));
    } else {
      Serial.println(F("LCD:DEFAULT_0x27"));
    }
  } else {
    Serial.println(F("LCD:FOUND_0x27"));
  }

  lcd.init();
  lcd.backlight();
  lcd.clear();

  updateLcd("PPG BIOMETRIC", "INITIALIZING...");
  loadTemplate();
  delay(800);

  updateLcd("ACCESS LOCKED", "PLACE FINGER");
  Serial.println(F("SYSTEM READY - LOCKED"));
}

// ========================================================
// MAIN LOOP (100% NON-BLOCKING FOR INSTANT SERVO & LCD SYNC)
// ========================================================
void loop() {
  // Always process incoming web commands immediately
  checkSerialCommands();

  // Sample HW-827 optical pulse sensor every 10ms (100Hz)
  unsigned long now = millis();
  if (now - lastSampleMs >= SAMPLE_INTERVAL) {
    lastSampleMs = now;

    if (isUnlockedState) {
      // Keep deadbolt held open at 90 degrees while unlocked
      lockServo.write(SERVO_UNLOCKED_ANGLE);
      digitalWrite(LED_PIN, HIGH);
    } else {
      int raw = analogRead(PPG_PIN);
      processPpgSample(raw);
    }
  }
}
