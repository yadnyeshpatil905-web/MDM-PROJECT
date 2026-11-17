# Smart Credential Lock â€“ PPG Biometric Authentication System

A modern, high-precision biometric access control system combining Arduino UNO, HW-827 optical photoplethysmogram (PPG) pulse sensor, SG90 servo motor deadbolt, 16x2 I2C LCD, and a full-stack real-time web dashboard.

---

## ðŸš€ Key Features

- **Hardware Biometric Pipeline**:
  - Optical pulse acquisition via **HW-827 Pulse Sensor** analog sensor (Pin A0).
  - Dynamic IIR baseline tracking filter (`98% * baseline + 2% * raw`).
  - Inter-beat interval (IBI) validation (400ms â€“ 1333ms, 45 â€“ 150 BPM).
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

## ðŸ”Œ Hardware Pin Mapping

| Hardware Component | Arduino UNO Pin | Interface / Protocol |
|--------------------|-----------------|----------------------|
| **HW-827 Pulse Sensor** | Pin `A0` | Analog ADC (10-bit) |
| **SG90 Servo Motor** | Pin `9` | PWM Actuator (0Â° Locked / 90Â° Unlocked) |
| **Piezo Buzzer** | Pin `8` | Digital `tone()` Output |
| **Status LED** | Pin `7` | Digital Output (with 330Î© resistor) |
| **16x2 LCD Display** | `SDA (A4)`, `SCL (A5)` | I2C Bus (`0x27`) |

---

## ðŸ› ï¸ Project Structure

```
â”œâ”€â”€ arduino/
â”‚   â””â”€â”€ PPG_Biometric_Lock/
â”‚       â””â”€â”€ PPG_Biometric_Lock.ino   # Complete C++ Arduino firmware
â”œâ”€â”€ server/
â”‚   â””â”€â”€ index.js                    # Express + Socket.IO serial gateway
â”œâ”€â”€ src/
â”‚   â”œâ”€â”€ audio/
â”‚   â”‚   â””â”€â”€ soundEffects.js         # Web Audio API biometric synthesizer
â”‚   â”œâ”€â”€ components/
â”‚   â”‚   â”œâ”€â”€ Header.jsx              # USB connection & mode toggle
â”‚   â”‚   â”œâ”€â”€ Sidebar.jsx             # Minimalist navigation
â”‚   â”‚   â”œâ”€â”€ LockStatusCard.jsx      # Central lock visualizer & trigger
â”‚   â”‚   â”œâ”€â”€ PpgWaveformCanvas.jsx   # 60fps canvas oscilloscope
â”‚   â”‚   â”œâ”€â”€ LCDDisplay.jsx          # 16x2 LCD mirror
â”‚   â”‚   â”œâ”€â”€ TemplateComparisonCard.jsx # 20-point template graph
â”‚   â”‚   â””â”€â”€ SerialConsole.jsx       # Real-time serial monitor
â”‚   â”œâ”€â”€ services/
â”‚   â”‚   â”œâ”€â”€ serialParser.js         # Arduino serial line decoder
â”‚   â”‚   â””â”€â”€ webSerial.js            # W3C Web Serial USB driver
â”‚   â”œâ”€â”€ views/
â”‚   â”‚   â”œâ”€â”€ DashboardView.jsx       # Unified clean dashboard
â”‚   â”‚   â”œâ”€â”€ AuthenticationView.jsx  # Detailed auth workflow
â”‚   â”‚   â”œâ”€â”€ EnrollmentView.jsx      # Biometric enrollment & EEPROM exporter
â”‚   â”‚   â”œâ”€â”€ LiveOscilloscopeView.jsx# Deep signal diagnostics
â”‚   â”‚   â”œâ”€â”€ HistoryView.jsx         # Searchable audit logs & CSV export
â”‚   â”‚   â”œâ”€â”€ DeviceStatusView.jsx    # Hardware topology & wiring
â”‚   â”‚   â””â”€â”€ SettingsView.jsx        # Thresholds & security policies
â”‚   â”œâ”€â”€ App.jsx
â”‚   â”œâ”€â”€ main.jsx
â”‚   â””â”€â”€ index.css
â”œâ”€â”€ package.json
â”œâ”€â”€ tailwind.config.js
â””â”€â”€ vite.config.js
```

---

## âš¡ Quick Start

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
3. Place your finger on the **HW-827 Pulse Sensor** to view your real-time cardiovascular pulse waveform and authenticate!
