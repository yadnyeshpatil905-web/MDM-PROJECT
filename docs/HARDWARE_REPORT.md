# Hardware Dependency and Physiological Limitation Analysis Report

**Project:** Smart Credential Lock — Optical PPG Biometric System  
**Hardware Stack:** Arduino UNO (ATmega328P), HW-827 / KY-039 Optical PPG Sensor, SG90 Servo Actuator  
**Scope:** Biometric Authentication, Hardware Actuation, and Production Readiness  

---

## 1. Executive Summary

This report documents the architectural findings, hardware dependencies, and physiological limitations identified during the preparation of the Smart Credential Lock system for Supabase database integration and multi-factor authentication.

Prior to this architectural alignment, biometric match alone (score $\ge$ 70%) opened the deadbolt directly, and the system used hardcoded mock identities. Under the new architecture, **two-step authentication** is enforced: biometric verification creates a temporary 90-second challenge session, which requires verified salted Vault PIN entry before any physical actuation is commanded.

---

## 2. Incomplete & Hardware-Dependent Functionality

| Subsystem | Existing State | Hardware Limitation / Dependency | Recommendation for Production |
|---|---|---|---|
| **Microcontroller Command Parsing** | Firmware previously operated in a simplex serial transmission mode (printing telemetry only). | Arduino UNO Serial buffer (`rx_buffer` = 64 bytes) can drop incoming tokens if flooded with 50Hz ADC debug output (`RAW:xxx,AC:yyy`). | Baud rate increased or telemetry rate-throttled via `CMD:STREAM:OFF`. Non-blocking `Serial.read()` implemented in `PPG_Biometric_Lock.ino`. |
| **Physical Actuation Security** | SG90 servo deadbolt connected directly to PWM Pin 9 with 5V power from Arduino 5V pin. | Servo current surges (up to 500mA under mechanical stall) can cause ATmega328P brownout resets, forcing the MCU back to initial boot state. | Power the SG90 servo through a dedicated external 5V 1A power supply with shared ground and 100µF decoupling capacitor. |
| **Tamper & Disconnect Detection** | Sensor Pin A0 floating state can be misinterpreted as weak pulse signal if optical cable is detached. | High ambient optical noise (sunlight or fluorescent flicker at 50/60Hz) can mimic systolic pulse waveforms. | Utilize optical shielding (shroud/finger clip housing) and hardware bandpass filtering (0.5Hz - 5.0Hz active op-amp filter stage). |
| **ATmega EEPROM Endurance** | Firmware writes 20-byte template using `EEPROM.update()`. | ATmega328P internal EEPROM is rated for ~100,000 write cycles. | Commit templates to Supabase PostgreSQL database; treat local MCU memory as a volatile verification cache only. |
| **Browser Web Serial API Support** | WebSerial relies on chromium browser permissions (`navigator.serial`). | WebSerial is unsupported in Safari (iOS/macOS) and Firefox. | Backend Node.js `serialport` service acts as the primary hardware gateway, while browser WebSerial is supported as a secondary direct console. |

---

## 3. Physiological Limitations of Optical PPG as a Biometric Identity

The system uses an optical photoplethysmograph (HW-827) to sample capillary blood volume changes at 100Hz and normalize 5 clean heartbeats into a 20-point morphological vector.

### Critical Security Findings:
1. **Heart Rate (BPM) & SpO2 are Not Cryptographic Identifiers:**
   Resting heart rate fluctuates between 50 and 100 BPM depending on physical exertion, caffeine, emotional stress, and circadian rhythm. Heart rate alone has zero identity-distinguishing capability.
2. **Contact Pressure Artifact:**
   Varying fingertip pressure against the LED/phototransistor alters the venous pool and arterial pulse wave contours. Excessive pressure occludes microcapillaries, while light pressure introduces baseline noise.
3. **Autonomic Vasoconstriction:**
   Peripheral arterial compliance shifts when ambient temperature changes. Cold hands increase wave reflection velocity, modifying the timing of the dicrotic notch.

### Architecture Conclusion:
Because PPG morphological curves demonstrate intra-individual variability over time, **PPG morphology must be treated as a live presence verification factor rather than a sole high-entropy credential**. Requiring Step 2 (Salted Vault PIN) ensures security cannot be breached by morphological drift or pulse replay.

---

## 4. Schema and Protocol Agreement Verification

| Entity / Concept | Frontend Type | API Request / Response | Backend Repository Field | Supabase SQL Column | Status |
|---|---|---|---|---|---|
| User ID | `user.id` (UUID) | `userId` | `profiles.id` | `profiles.id UUID` | Aligned |
| Email | `user.email` | `email` | `profiles.email` | `profiles.email TEXT UNIQUE` | Aligned |
| Vault PIN | `formData.pin` (Raw, client only) | `pin` (Over HTTPS) | `vault_credentials.pin_hash` | `vault_credentials.pin_hash TEXT` (Scrypt salted) | Aligned (Never stored raw) |
| Morphology Vector | `currentTemplate` (20 ints) | `templateData` | `biometric_credentials.template_data` | `biometric_credentials.template_data JSONB` (20 elements) | Aligned |
| Challenge Session | `challengeData.challengeId` | `challengeId` | In-Memory `activeChallenges` | Challenge TTL (90s window) | Aligned |
| Final Outcome | `result` (`GRANTED` / `DENIED`) | `final_result` | `authentication_attempts.final_result` | `final_result TEXT` | Aligned |
| Actuator State | `servoAngle` (0° / 90°) | `servoAngle` | `devices.connection_status` | `vault_events.event_type` | Aligned |
