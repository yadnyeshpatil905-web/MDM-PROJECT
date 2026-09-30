# Smart Credential Lock – PPG Biometric Authentication System

A modern, high-precision biometric access control system combining Arduino UNO, HW-827 optical photoplethysmogram (PPG) pulse sensor, SG90 servo motor deadbolt, 16x2 I2C LCD, and a full-stack real-time web dashboard.

---

## 🚀 Key Features

- **Hardware Biometric Pipeline**:
  - Optical pulse acquisition via **HW-827 PPG** analog sensor (Pin A0).
  - Dynamic IIR baseline tracking filter (`98% * baseline + 2% * raw`).
  - Inter-beat interval (IBI) validation (400ms – 1333ms, 45 – 150 BPM).
  - 20-point normalized morphological waveform template generation.
  - Non-volatile template storage in ATmega328P EEPROM (Magic checksum: `23917`).
  - Least-squares cross-correlation matching with $\ge 70\%$ acceptance threshold.
- **Actuator & Sensory Feedback**:
  - **SG90 Servo Lock** (Pin 9 PWM): Unlocks to $90^\circ$ on valid authentication with automatic 5-second re-lock ($0^\circ$).
  - **Piezo Buzzer** (Pin 8): Confirmation tone (2000Hz) on access granted, 3x denial beeps (1000Hz).
  - **Status LED** (Pin 7): Active verification lighting.
  - **16x2 I2C LCD** (`0x27`): Real-time stage prompts mirroring the authentication lifecycle.
- **Modern Minimalist Black Dashboard**:
  - Direct **Web Serial API** connection to Arduino UNO over USB (9600 Baud).
  - 60 FPS real-time oscilloscope PPG waveform canvas.
  - Zero-hardcoding / strict hardware reactive telemetry.
  - Live serial monitor console.
  - 20-point morphological template comparator.
  - Authentication audit logs with CSV export.

---

## 🔌 Hardware Pin Mapping

| Hardware Component | Arduino UNO Pin | Interface / Protocol |
|--------------------|-----------------|----------------------|
| **HW-827 PPG Sensor** | Pin `A0` | Analog ADC (10-bit) |
| **SG90 Servo Motor** | Pin `9` | PWM Actuator (0° Locked / 90° Unlocked) |
| **Piezo Buzzer** | Pin `8` | Digital `tone()` Output |
| **Status LED** | Pin `7` | Digital Output (with 330Ω resistor) |
| **16x2 LCD Display** | `SDA (A4)`, `SCL (A5)` | I2C Bus (`0x27`) |

---

## 🛠️ Project Structure

```
├── arduino/
│   └── PPG_Biometric_Lock/
│       └── PPG_Biometric_Lock.ino   # Complete C++ Arduino firmware
├── server/
│   └── index.js                    # Express + Socket.IO serial gateway
├── src/
│   ├── audio/
│   │   └── soundEffects.js         # Web Audio API biometric synthesizer
│   ├── components/
│   │   ├── Header.jsx              # USB connection & mode toggle
│   │   ├── Sidebar.jsx             # Minimalist navigation
│   │   ├── LockStatusCard.jsx      # Central lock visualizer & trigger
│   │   ├── PpgWaveformCanvas.jsx   # 60fps canvas oscilloscope
│   │   ├── LCDDisplay.jsx          # 16x2 LCD mirror
│   │   ├── TemplateComparisonCard.jsx # 20-point template graph
│   │   └── SerialConsole.jsx       # Real-time serial monitor
│   ├── services/
│   │   ├── serialParser.js         # Arduino serial line decoder
│   │   └── webSerial.js            # W3C Web Serial USB driver
│   ├── views/
│   │   ├── DashboardView.jsx       # Unified clean dashboard
│   │   ├── AuthenticationView.jsx  # Detailed auth workflow
│   │   ├── EnrollmentView.jsx      # Biometric enrollment & EEPROM exporter
│   │   ├── LiveOscilloscopeView.jsx# Deep signal diagnostics
│   │   ├── HistoryView.jsx         # Searchable audit logs & CSV export
│   │   ├── DeviceStatusView.jsx    # Hardware topology & wiring
│   │   └── SettingsView.jsx        # Thresholds & security policies
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
├── package.json
├── tailwind.config.js
└── vite.config.js
```

---

## ⚡ Quick Start

### 1. Upload Arduino Firmware
1. Open [`arduino/PPG_Biometric_Lock/PPG_Biometric_Lock.ino`](arduino/PPG_Biometric_Lock/PPG_Biometric_Lock.ino) in Arduino IDE.
2. Select Board: **Arduino Uno** and your COM port.
3. Click **Upload**.
4. **Important**: Close the Arduino IDE Serial Monitor after flashing so the USB port is available for the web app.

### 2. Run Web Dashboard
```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:5173/](http://localhost:5173/) (or the port displayed in terminal) in **Google Chrome**, **Microsoft Edge**, or **Opera**.

### 3. Connect & Authenticate
1. Click **Connect Arduino USB** in the top navigation bar.
2. Select your **Arduino Uno** USB port from the browser prompt.
3. Place your finger on the **HW-827 optical sensor** to view your real-time cardiovascular pulse waveform and authenticate!
