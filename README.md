# Smart Credential Lock — Multi-Authenticator PPG Biometric & PIN System

A modern, high-precision biometric access control system combining Arduino UNO, HW-827 optical photoplethysmogram (PPG) pulse sensor, SG90 servo motor deadbolt, 16x2 I2C LCD, and a full-stack real-time web dashboard with encrypted file vault.

---

## 🚀 Key Features

### 1. Multi-Authenticator (2FA) Security Architecture
- **Sequential Two-Step Enrollment Wizard**:
  - **Step 1 (Biometric Fingerprint Enrollment)**: User touches the HW-827 Pulse Sensor (or clicks *Acquire Biometric / Fingerprint* in simulated mode). Real-time 60 FPS oscilloscope graphs the pulse wave, counts 5 heartbeat cycles, and extracts a normalized 20-point morphology template.
  - **Step 2 (Vault Security PIN Setup)**: User enters their 4–8 digit Vault Security PIN (with on-screen keypad and confirmation) and operator credentials. The PIN is hashed using salted Scrypt on the backend.
- **Two-Factor Authentication Pipeline**:
  - **Factor 1 (Biometric Pulse & Liveness)**: Real-time Pearson cross-correlation shape matching and systolic peak latency alignment against the enrolled template ($\ge 70\%$ acceptance threshold). On match, generates a secure 90-second challenge token.
  - **Factor 2 (Vault PIN Verification)**: User enters their secret PIN. Verified against stored salted hash with constant-time equality check and 3-attempt brute-force lockout protection (300-second lockout).
  - **Actuator Trigger**: The deadbolt unlocks only when **BOTH** factors verify in sequence.

### 2. Secure Vault & Confidential Folder Explorer
- **Encrypted Security Gate**: Explains the 2FA requirement and prevents unauthorized file access.
- **Decrypted Directory Explorer**: Once authenticated, opens the secure vault folder with classified files:
  - 📄 `Project_Titan_Vault_Passcodes.json` (Master encryption keys, database replicas)
  - 📄 `Confidential_Biometric_Keys.pem` (Hardware root verification key)
  - 📄 `Executive_Financial_Report_Q4.pdf` (Confidential executive audit)
  - 📄 `HW827_Raw_Biometric_Telemetry.csv` (Classified waveform vectors)
  - 📄 `Emergency_Recovery_Passcodes.txt` (One-time disaster recovery passcodes)
- **Decrypted File Viewer**: Monospace decrypted previewer with copy-to-clipboard and export/download capabilities.
- **Add Encrypted Secrets**: Create and save custom confidential files directly into the vault directory.
- **Relock Vault**: Instant manual relock that resets the servo back to $0^\circ$ and closes the folder.

### 3. Advanced Biometric Discriminator
- **Pearson Cross-Correlation ($r$)**: Compares the mathematical curvature and normalized derivative of the pulse wave rather than raw vertical magnitude.
- **Systolic Peak Latency Alignment**: Detects the phase index of the systolic peak and applies an $8\%$ penalty per shifted index, preventing different users with different arterial compliance from matching.
- **Anti-Spoofing Liveness**: Capillary pulsation verifies that a real living finger is present, defeating static silicone replicas or photo spoofing.

---

## 🔌 Hardware Pin Mapping

| Hardware Component | Arduino UNO Pin | Interface / Protocol |
|--------------------|-----------------|----------------------|
| **HW-827 Pulse Sensor** | Pin `A0` | Analog ADC (10-bit: 0–1023) |
| **SG90 Servo Motor** | Pin `9` | PWM Actuator (0° Locked / 90° Unlocked) |
| **Piezo Buzzer** | Pin `8` | Digital `tone()` Output |
| **Status LED** | Pin `7` | Digital Output (with 330Ω resistor) |
| **16x2 LCD Display** | `SDA (A4)`, `SCL (A5)` | I2C Bus (`0x27`) |

---

## 🛠️ Project Structure

```
├── arduino/
│   └── PPG_Biometric_Lock/
│       └── PPG_Biometric_Lock.ino   # Complete C++ Arduino firmware (90s PIN wait & relock)
├── server/
│   ├── index.js                    # Express + Socket.IO server
│   ├── routes/
│   │   └── api.js                  # Modular REST API endpoints (Auth, Biometrics, Vault)
│   └── services/
│       ├── authService.js          # Two-step challenge generation & Scrypt PIN verification
│       ├── biometricService.js     # Pearson cross-correlation & peak alignment comparator
│       ├── deviceService.js        # Actuator command & hardware state broadcaster
│       └── vaultFolderService.js   # Encrypted vault file directory and secrets store
├── src/
│   ├── audio/
│   │   └── soundEffects.js         # Web Audio API biometric synthesizer
│   ├── components/
│   │   ├── Header.jsx              # USB connection & mode toggle
│   │   ├── Sidebar.jsx             # Minimalist navigation with live vault status badge
│   │   ├── LockStatusCard.jsx      # Central lock visualizer & trigger
│   │   ├── PpgWaveformCanvas.jsx   # 60fps canvas oscilloscope
│   │   ├── LCDDisplay.jsx          # 16x2 LCD mirror
│   │   └── TemplateComparisonCard.jsx # 20-point template graph
│   ├── services/
│   │   ├── api.js                  # REST API client
│   │   ├── ppgEngine.js            # Simulated PPG engine & mathematical synthesizer
│   │   ├── serialParser.js         # Arduino serial line decoder
│   │   └── webSerial.js            # W3C Web Serial USB driver
│   ├── views/
│   │   ├── AuthenticationView.jsx  # Multi-authenticator 2FA unlock pipeline
│   │   ├── DashboardView.jsx       # Unified telemetry dashboard
│   │   ├── DeviceStatusView.jsx    # Hardware topology & wiring
│   │   ├── EnrollmentView.jsx      # Sequential 2-step enrollment wizard (Fingerprint + PIN)
│   │   ├── HistoryView.jsx         # Searchable audit logs & CSV export
│   │   ├── LiveOscilloscopeView.jsx# Deep signal diagnostics
│   │   ├── SettingsView.jsx        # Thresholds & security parameters
│   │   └── VaultFolderView.jsx     # Secure vault & confidential folder explorer
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
├── package.json
└── vite.config.js
```

---

## ⚡ Quick Start

### 1. Upload Arduino Firmware
1. Open [`arduino/PPG_Biometric_Lock/PPG_Biometric_Lock.ino`](arduino/PPG_Biometric_Lock/PPG_Biometric_Lock.ino) in Arduino IDE.
2. Select Board: **Arduino Uno** and your COM port.
3. Install required libraries: `LiquidCrystal_I2C`, `Servo`, `EEPROM`.
4. Click **Upload** ($\rightarrow$).
5. **Important**: Close the Arduino IDE Serial Monitor after flashing so the USB port is available for the browser Web Serial API.

### 2. Run Web Dashboard & Backend
```bash
# Install dependencies
npm install

# Start backend server (Port 5001)
PORT=5001 npm run server

# In another terminal, start development frontend (Port 5173)
npm run dev
```

Open [http://localhost:5173/](http://localhost:5173/) in **Google Chrome**, **Microsoft Edge**, or **Opera**.

### 3. Multi-Authenticator Workflow

1. **Enrollment**: Navigate to **"Enroll Fingerprint & PIN"**:
   - **Step 1**: Place finger on sensor or click *Acquire Biometric / Fingerprint* to capture 5 clean beats.
   - **Step 2**: Click *Next: Set Vault Security PIN*, choose your 4–8 digit PIN, enter operator details, and submit.
2. **Authentication**: Navigate to **"Multi-Auth Unlock"**:
   - Touch the sensor or click *Scan Fingerprint / PPG Pulse* (Factor 1 verified).
   - Enter your secret Vault PIN on the keypad (Factor 2 verified).
   - Click **"Open Secure Vault & Folder →"** to access your decrypted files!
