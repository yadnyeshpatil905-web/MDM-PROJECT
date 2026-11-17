# Arduino Serial Protocol & Safe Vault-Command Specification

**System:** Smart Credential Lock — Optical PPG Biometric System  
**Hardware Platform:** Arduino UNO (ATmega328P) / HW-827 PPG Sensor / SG90 Micro Servo  
**Baud Rate:** 9600 Baud (8-N-1, No Parity, 1 Stop Bit)  
**Security Architecture:** Fail-Closed, Two-Step Backend Authorized Actuation  

---

## 1. Overview and Security Principles

In previous revisions, the Arduino sketch acted autonomously: matching a template in local EEPROM immediately unlocked the physical servo. Under the two-step security model:

1. **Biometric verification alone MUST NEVER open the vault.**
2. **Actuator actuation (`CMD:UNLOCK`) is accepted ONLY from the trusted controller/backend after complete two-step authorization (Biometric Match + Salted PIN verification).**
3. **Fail-Closed by Design:** On boot, power cycle, serial disconnection, or command timeout, the servo deadbolt is maintained strictly at 0° (LOCKED).
4. **Command Acknowledgement (ACK/NACK):** All commands issued to the microcontroller return a formal acknowledgement.

---

## 2. Telemetry Stream (Arduino UNO -> Host Controller)

The Arduino continuously emits status, signal processing diagnostics, and morphological candidates across USB Serial:

| Prefix / Pattern | Description | Example Payload |
|---|---|---|
| `RAW:<adc>,AC:<ac>` | 50Hz Optical waveform ADC sample (Pin A0) | `RAW:542,AC:28` |
| `Signal amplitude = <val>` | Finger presence detection amplitude | `Signal amplitude = 64` |
| `NO FINGER / NO SIGNAL` | Indicates sensor baseline flatline | `NO FINGER / NO SIGNAL` |
| `PPG SIGNAL DETECTED` | AC amplitude > 15 LSB, acquisition started | `PPG SIGNAL DETECTED` |
| `FIRST BEAT` | Initial systolic peak detected | `FIRST BEAT` |
| `BEAT <n> IBI=<ms>` | Heartbeat sequence with Inter-Beat Interval | `BEAT 3 IBI=810` |
| `PPG BEAT USED = <n>` | Validated pulse added to template accumulator | `PPG BEAT USED = 4` |
| `HEART RATE = <bpm> BPM` | Computed average pulse rate | `HEART RATE = 74 BPM` |
| `TEMPLATE:[v0,v1,...,v19]` | Emitted 20-point morphology template | `TEMPLATE:[35,78,142,215,255,...]` |
| `BIOMETRIC_CANDIDATE:SCORE=<pct>` | Candidate match evaluation for host | `BIOMETRIC_CANDIDATE:SCORE=88` |
| `SYSTEM READY - LOCKED` | Actuator locked confirmation | `SYSTEM READY - LOCKED` |

---

## 3. Trusted Command Interface (Host Controller -> Arduino UNO)

All commands must be terminated with a newline (`\n`).

### 3.1 Vault Actuator Unlock
- **Command:** `CMD:UNLOCK <AUTHORIZATION_TOKEN>`
- **Description:** Instructs the servo to rotate from 0° to 90° for a temporary window (`AUTO_LOCK_DURATION_SEC`).
- **Prerequisite:** Sent strictly by the backend server after verifying both the 20-point biometric template and the salted vault PIN.
- **Success Response:** `ACK:UNLOCK:SUCCESS,ANGLE:90,AUTOLOCK_MS:5000`
- **Error Response:** `NACK:UNLOCK:INVALID_TOKEN` or `NACK:UNLOCK:DEVICE_BUSY`

### 3.2 Immediate Relock
- **Command:** `CMD:LOCK`
- **Description:** Forces the deadbolt servo immediately back to 0° (LOCKED) and deactivates confirmation LEDs.
- **Response:** `ACK:LOCK:SUCCESS,ANGLE:0`

### 3.3 Query Status
- **Command:** `CMD:STATUS`
- **Description:** Queries instantaneous hardware sensor and deadbolt status.
- **Response:** `STATUS:SERVO=LOCKED,ANGLE=0,SENSOR=READY,AMPLITUDE=58`

### 3.4 Telemetry Mode Control
- **Command:** `CMD:STREAM:ON` / `CMD:STREAM:OFF`
- **Description:** Enables or suppresses high-speed `RAW:xxx,AC:yyy` serial printing during high-throughput verification operations.
- **Response:** `ACK:STREAM:ENABLED` / `ACK:STREAM:DISABLED`

---

## 4. Hardware Fail-Safe Specifications

```
                       +-------------------------+
                       |      Power On / Boot    |
                       +------------+------------+
                                    |
                                    v
                       +-------------------------+
                       |  Initialize Servo to 0° |
                       |      (FAIL CLOSED)      |
                       +------------+------------+
                                    |
                                    v
+------------------+   Finger   +-------------------------+
| Live Oscilloscope|<-----------|   PPG Acquisition       |
| Stream to Browser|            |  (Accumulate 5 Beats)   |
+------------------+            +------------+------------+
                                             |
                                             v
                                +-------------------------+
                                | Emit 20-Point Template  |
                                |       to Backend        |
                                +------------+------------+
                                             |
                                             v
                                +-------------------------+
                                |  Step 1: Bio Verify     |
                                |  (Score >= 70%?)        |
                                +------------+------------+
                                             |
                      +----------------------+----------------------+
                      | (Denied)                                    | (Passed)
                      v                                             v
        +---------------------------+                 +---------------------------+
        |   Log Attempt as FAILED   |                 | Step 2: Issue Challenge   |
        |   Keep Vault Locked 0°    |                 | Display Vault PIN Screen  |
        +---------------------------+                 +-------------+-------------+
                                                                    |
                                                     +--------------+--------------+
                                                     | (Wrong PIN / Timeout)       | (Valid PIN)
                                                     v                             v
                                       +---------------------------+ +---------------------------+
                                       | Rate Limit / Temp Lockout | | Send CMD:UNLOCK to Arduino|
                                       |   Keep Vault Locked 0°    | | Rotate Servo to 90°       |
                                       +---------------------------+ | Auto-Relock after 5s      |
                                                                     +---------------------------+
```
