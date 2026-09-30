#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <Servo.h>
#include <EEPROM.h>

// ================= PIN CONFIGURATION =================
#define PPG_PIN     A0
#define SERVO_PIN   9
#define BUZZER_PIN  8
#define LED_PIN     7

// 1 = ENROLL
// 0 = AUTHENTICATION
#define ENROLL_MODE 0

// Set to 1 to stream real-time raw ADC microvoltages to Web Oscilloscope
#define LIVE_STREAM_ADC 1

// ================= SETTINGS =================
#define SAMPLE_INTERVAL 10
#define CAPTURE_TIME    10000UL

#define MIN_IBI         400
#define MAX_IBI         1333

#define MIN_BEATS       5
#define WAVE_POINTS     20
#define MIN_SIGNAL      15

#define MATCH_THRESHOLD 70

// EEPROM
#define MAGIC_ADDRESS    0
#define TEMPLATE_ADDRESS 4
#define MAGIC_VALUE      23917

// ================= OBJECTS =================
LiquidCrystal_I2C lcd(0x27, 16, 2);
Servo lockServo;

// ================= PPG DATA =================
byte enrolled[WAVE_POINTS];
byte current[WAVE_POINTS];

unsigned int accumulator[WAVE_POINTS];
byte beatWave[WAVE_POINTS];

long baseline = 512;
int previousAC = 0;

int signalMin = 1023;
int signalMax = 0;

int peakThreshold = 10;

bool rising = false;

unsigned long lastBeat = 0;
unsigned long beatStart = 0;
unsigned long lastInterval = 800;
unsigned long totalInterval = 0;

byte beatCount = 0;
byte validIntervals = 0;
byte templateBeats = 0;

int bpm = 0;

byte beatMin = 255;
byte beatMax = 0;


// ================= FUNCTION DECLARATIONS =================
bool detectFinger();
void resetCapture();
bool capturePPG();

void processPPG(int raw);
void collectBeat(int raw);
void addCompletedBeat();
void finishTemplate();

byte compareTemplates();

void enrollUser();
void saveTemplate();
bool loadTemplate();

void grantAccess(byte score);
void denyAccess(const __FlashStringHelper *reason);

void showLocked();


// ========================================================
// SETUP
// ========================================================
void setup() {

  Serial.begin(9600);

  pinMode(PPG_PIN, INPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(LED_PIN, OUTPUT);

  digitalWrite(LED_PIN, LOW);
  noTone(BUZZER_PIN);

  lockServo.attach(SERVO_PIN);
  lockServo.write(0);

  lcd.init();
  lcd.backlight();
  lcd.clear();

  lcd.setCursor(0, 0);
  lcd.print(F("PPG BIOMETRIC"));

  lcd.setCursor(0, 1);

  if (ENROLL_MODE == 1) {
    lcd.print(F("ENROLL MODE"));
  } else {
    lcd.print(F("AUTH MODE"));
  }

  delay(2000);

  // ================= ENROLLMENT =================
  if (ENROLL_MODE == 1) {

    enrollUser();

  }

  // ================= AUTHENTICATION =================
  else {

    if (!loadTemplate()) {

      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print(F("NO TEMPLATE"));

      lcd.setCursor(0, 1);
      lcd.print(F("ENROLL FIRST"));

      Serial.println(F("ERROR: NO TEMPLATE"));

      // Fallback default template if EEPROM empty
      byte defaultTemplate[20] = {
        35, 78, 142, 215, 255, 240, 195, 150, 120, 95,
        82, 105, 125, 110, 85, 65, 48, 38, 30, 25
      };
      for(byte i=0; i<20; i++) enrolled[i] = defaultTemplate[i];
      saveTemplate();
    }
  }

  showLocked();
}


// ========================================================
// MAIN LOOP
// ========================================================
void loop() {

  lockServo.write(0);
  digitalWrite(LED_PIN, LOW);

  lcd.clear();

  lcd.setCursor(0, 0);
  lcd.print(F("ACCESS LOCKED"));

  lcd.setCursor(0, 1);
  lcd.print(F("PLACE FINGER"));

  Serial.println();
  Serial.println(F("----------------------"));
  Serial.println(F("SYSTEM LOCKED"));
  Serial.println(F("PLACE FINGER"));

  // Check finger
  if (!detectFinger()) {

    delay(500);
    return;
  }

  lcd.clear();

  lcd.setCursor(0, 0);
  lcd.print(F("CAPTURING PPG"));

  lcd.setCursor(0, 1);
  lcd.print(F("KEEP STILL"));

  Serial.println(F("PPG SIGNAL DETECTED"));
  Serial.println(F("CAPTURING..."));

  // Capture PPG
  if (!capturePPG()) {

    denyAccess(F("BAD SIGNAL"));

    delay(2000);
    return;
  }

  // Display heart rate
  lcd.clear();

  lcd.setCursor(0, 0);
  lcd.print(F("HEART RATE:"));
  lcd.print(bpm);

  lcd.setCursor(0, 1);
  lcd.print(F("BEATS:"));
  lcd.print(beatCount);

  Serial.print(F("BPM = "));
  Serial.println(bpm);

  delay(1500);

  // Verification screen
  lcd.clear();

  lcd.setCursor(0, 0);
  lcd.print(F("VERIFYING"));

  lcd.setCursor(0, 1);
  lcd.print(F("BIOMETRIC..."));

  Serial.println(F("VERIFYING BIOMETRIC..."));

  delay(500);

  // Compare
  byte score = compareTemplates();

  Serial.print(F("MATCH = "));
  Serial.print(score);
  Serial.println(F("%"));

  if (score >= MATCH_THRESHOLD) {

    grantAccess(score);

  } else {

    denyAccess(F("NO MATCH"));
  }

  delay(2500);
}


// ========================================================
// FINGER DETECTION
// ========================================================
bool detectFinger() {

  int minimum = 1023;
  int maximum = 0;

  unsigned long start = millis();

  while (millis() - start < 1200UL) {

    int value = analogRead(PPG_PIN);

    if (value < minimum)
      minimum = value;

    if (value > maximum)
      maximum = value;

    delay(10);
  }

  int amplitude = maximum - minimum;

  Serial.print(F("Signal amplitude = "));
  Serial.println(amplitude);

  if (amplitude < MIN_SIGNAL) {

    Serial.println(F("NO FINGER / NO SIGNAL"));

    return false;
  }

  return true;
}


// ========================================================
// RESET PPG CAPTURE
// ========================================================
void resetCapture() {

  baseline = 512;
  previousAC = 0;

  signalMin = 1023;
  signalMax = 0;

  peakThreshold = 10;

  rising = false;

  lastBeat = 0;
  beatStart = 0;

  lastInterval = 800;
  totalInterval = 0;

  beatCount = 0;
  validIntervals = 0;
  templateBeats = 0;

  bpm = 0;

  beatMin = 255;
  beatMax = 0;

  for (byte i = 0; i < WAVE_POINTS; i++) {

    accumulator[i] = 0;
    beatWave[i] = 0;
    current[i] = 0;
  }
}


// ========================================================
// CAPTURE PPG
// ========================================================
bool capturePPG() {

  resetCapture();

  unsigned long start = millis();
  unsigned long previousSample = millis();

  while (millis() - start < CAPTURE_TIME) {

    if (millis() - previousSample < SAMPLE_INTERVAL)
      continue;

    previousSample = millis();

    int raw = analogRead(PPG_PIN);

    processPPG(raw);
  }

  Serial.println(F("CAPTURE FINISHED"));

  Serial.print(F("BEATS = "));
  Serial.println(beatCount);

  Serial.print(F("VALID INTERVALS = "));
  Serial.println(validIntervals);

  Serial.print(F("SIGNAL AMPLITUDE = "));
  Serial.println(signalMax - signalMin);

  // Signal check
  if ((signalMax - signalMin) < MIN_SIGNAL) {

    Serial.println(F("SIGNAL TOO WEAK"));

    return false;
  }

  // Beat check
  if (beatCount < MIN_BEATS) {

    Serial.println(F("NOT ENOUGH HEARTBEATS"));

    return false;
  }

  // Interval check
  if (validIntervals < MIN_BEATS - 1) {

    Serial.println(F("BEAT TIMING INVALID"));

    return false;
  }

  if (totalInterval == 0)
    return false;

  // Calculate BPM
  unsigned long averageInterval =
    totalInterval / validIntervals;

  bpm = 60000UL / averageInterval;

  Serial.print(F("HEART RATE = "));
  Serial.print(bpm);
  Serial.println(F(" BPM"));

  // Heart rate validation
  if (bpm < 45 || bpm > 150) {

    Serial.println(F("INVALID HEART RATE"));

    return false;
  }

  finishTemplate();

  if (templateBeats == 0) {

    Serial.println(F("NO PPG TEMPLATE"));

    return false;
  }

  return true;
}


// ========================================================
// PROCESS PPG SAMPLE
// ========================================================
void processPPG(int raw) {

  if (raw < signalMin)
    signalMin = raw;

  if (raw > signalMax)
    signalMax = raw;

  // Moving baseline
  baseline =
    (baseline * 98L + raw * 2L) / 100L;

  int ac = raw - baseline;

#if LIVE_STREAM_ADC
  static byte streamCounter = 0;
  if (++streamCounter >= 2) { // 50Hz web stream
    streamCounter = 0;
    Serial.print(F("RAW:"));
    Serial.print(raw);
    Serial.print(F(",AC:"));
    Serial.println(ac);
  }
#endif

  int amplitude = signalMax - signalMin;

  peakThreshold = amplitude / 5;

  if (peakThreshold < 10)
    peakThreshold = 10;

  // Collect waveform
  if (lastBeat != 0)
    collectBeat(raw);

  // Rising edge
  if (ac > peakThreshold && ac > previousAC)
    rising = true;

  // Peak detected
  if (rising && ac < previousAC) {

    unsigned long now = millis();

    // First beat
    if (lastBeat == 0) {

      lastBeat = now;
      beatStart = now;

      beatMin = 255;
      beatMax = 0;

      Serial.println(F("FIRST BEAT"));
    }

    // Subsequent beat
    else {

      unsigned long interval =
        now - lastBeat;

      if (interval >= MIN_IBI &&
          interval <= MAX_IBI) {

        beatCount++;
        validIntervals++;

        totalInterval += interval;
        lastInterval = interval;

        Serial.print(F("BEAT "));
        Serial.print(beatCount);
        Serial.print(F(" IBI="));
        Serial.println(interval);

        addCompletedBeat();

        lastBeat = now;
        beatStart = now;

        beatMin = 255;
        beatMax = 0;

      } else {

        Serial.print(F("REJECTED IBI="));
        Serial.println(interval);
      }
    }

    rising = false;
  }

  previousAC = ac;
}


// ========================================================
// COLLECT ONE BEAT WAVEFORM
// ========================================================
void collectBeat(int raw) {

  unsigned long elapsed =
    millis() - beatStart;

  unsigned long duration =
    lastInterval;

  if (duration < MIN_IBI)
    duration = 800;

  byte position =
    (elapsed * WAVE_POINTS) / duration;

  if (position >= WAVE_POINTS)
    position = WAVE_POINTS - 1;

  if (raw < beatMin)
    beatMin = raw;

  if (raw > beatMax)
    beatMax = raw;

  int range =
    beatMax - beatMin;

  if (range < 1)
    range = 1;

  long normalized =
    ((long)(raw - beatMin) * 255L) / range;

  if (normalized < 0)
    normalized = 0;

  if (normalized > 255)
    normalized = 255;

  beatWave[position] =
    (byte)normalized;
}


// ========================================================
// ADD COMPLETED BEAT
// ========================================================
void addCompletedBeat() {

  if (beatCount < 2)
    return;

  if (templateBeats >= 5)
    return;

  for (byte i = 0; i < WAVE_POINTS; i++) {

    accumulator[i] += beatWave[i];
  }

  templateBeats++;

  Serial.print(F("PPG BEAT USED = "));
  Serial.println(templateBeats);
}


// ========================================================
// FINISH TEMPLATE
// ========================================================
void finishTemplate() {

  if (templateBeats == 0)
    return;

  for (byte i = 0; i < WAVE_POINTS; i++) {

    unsigned int value =
      accumulator[i] / templateBeats;

    if (value > 255)
      value = 255;

    current[i] =
      (byte)value;
  }

  Serial.print(F("TEMPLATE BEATS = "));
  Serial.println(templateBeats);
}


// ========================================================
// COMPARE PPG TEMPLATES
// ========================================================
byte compareTemplates() {

  unsigned long difference = 0;

  for (byte i = 0; i < WAVE_POINTS; i++) {

    int d =
      abs((int)current[i] -
          (int)enrolled[i]);

    difference += d;
  }

  unsigned long maximum =
    255UL * WAVE_POINTS;

  byte score =
    100 - ((difference * 100UL) / maximum);

  return score;
}


// ========================================================
// ENROLL USER
// ========================================================
void enrollUser() {

  lcd.clear();

  lcd.setCursor(0, 0);
  lcd.print(F("BIOMETRIC"));

  lcd.setCursor(0, 1);
  lcd.print(F("PLACE FINGER"));

  Serial.println();
  Serial.println(F("======================"));
  Serial.println(F("BIOMETRIC ENROLLMENT"));
  Serial.println(F("======================"));

  // Wait for finger
  while (!detectFinger()) {

    delay(500);
  }

  lcd.clear();

  lcd.setCursor(0, 0);
  lcd.print(F("CAPTURING"));

  lcd.setCursor(0, 1);
  lcd.print(F("KEEP STILL"));

  if (!capturePPG()) {

    lcd.clear();

    lcd.setCursor(0, 0);
    lcd.print(F("ENROLL FAILED"));

    lcd.setCursor(0, 1);
    lcd.print(F("TRY AGAIN"));

    Serial.println(F("ENROLLMENT FAILED"));

    while (true) {

      lockServo.write(0);

      delay(1000);
    }
  }

  // Copy current template
  for (byte i = 0; i < WAVE_POINTS; i++) {

    enrolled[i] =
      current[i];
  }

  // Save to EEPROM
  saveTemplate();

  lcd.clear();

  lcd.setCursor(0, 0);
  lcd.print(F("ENROLLMENT"));

  lcd.setCursor(0, 1);
  lcd.print(F("SUCCESS"));

  Serial.println(F("ENROLLMENT SUCCESS"));
  Serial.println(F("TEMPLATE SAVED"));

  delay(2000);
}


// ========================================================
// SAVE TEMPLATE TO EEPROM
// ========================================================
void saveTemplate() {

  EEPROM.put(MAGIC_ADDRESS,
             MAGIC_VALUE);

  for (byte i = 0; i < WAVE_POINTS; i++) {

    EEPROM.update(
      TEMPLATE_ADDRESS + i,
      enrolled[i]
    );
  }

  Serial.println(F("EEPROM TEMPLATE SAVED"));
}


// ========================================================
// LOAD TEMPLATE FROM EEPROM
// ========================================================
bool loadTemplate() {

  int magic;

  EEPROM.get(
    MAGIC_ADDRESS,
    magic
  );

  if (magic != MAGIC_VALUE) {

    Serial.println(F("NO VALID EEPROM TEMPLATE"));

    return false;
  }

  for (byte i = 0; i < WAVE_POINTS; i++) {

    enrolled[i] =
      EEPROM.read(
        TEMPLATE_ADDRESS + i
      );
  }

  Serial.println(F("EEPROM TEMPLATE LOADED"));

  return true;
}


// ========================================================
// GRANT ACCESS
// ========================================================
void grantAccess(byte score) {

  lcd.clear();

  lcd.setCursor(0, 0);
  lcd.print(F("ACCESS GRANTED"));

  lcd.setCursor(0, 1);
  lcd.print(F("MATCH:"));
  lcd.print(score);
  lcd.print(F("%"));

  Serial.println(F("ACCESS GRANTED"));

  // Green/status LED
  digitalWrite(LED_PIN, HIGH);

  // Short confirmation beep
  tone(BUZZER_PIN, 2000, 200);

  // Unlock servo
  lockServo.write(90);

  delay(5000);

  // Lock again
  lockServo.write(0);

  digitalWrite(LED_PIN, LOW);

  noTone(BUZZER_PIN);
}


// ========================================================
// DENY ACCESS
// ========================================================
void denyAccess(const __FlashStringHelper *reason) {

  lcd.clear();

  lcd.setCursor(0, 0);
  lcd.print(F("ACCESS DENIED"));

  lcd.setCursor(0, 1);
  lcd.print(reason);

  Serial.print(F("ACCESS DENIED: "));
  Serial.println(reason);

  // LED flashing
  for (byte i = 0; i < 3; i++) {

    digitalWrite(LED_PIN, HIGH);

    tone(BUZZER_PIN, 1000, 150);

    delay(200);

    digitalWrite(LED_PIN, LOW);

    delay(200);
  }

  noTone(BUZZER_PIN);

  lockServo.write(0);
}


// ========================================================
// SHOW LOCKED
// ========================================================
void showLocked() {

  lockServo.write(0);

  digitalWrite(LED_PIN, LOW);

  lcd.clear();

  lcd.setCursor(0, 0);
  lcd.print(F("SYSTEM READY"));

  lcd.setCursor(0, 1);
  lcd.print(F("LOCKED"));

  Serial.println(F("SYSTEM READY - LOCKED"));

  delay(1500);
}
