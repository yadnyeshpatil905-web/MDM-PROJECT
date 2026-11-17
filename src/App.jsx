import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import DashboardView from './views/DashboardView';
import AuthenticationView from './views/AuthenticationView';
import EnrollmentView from './views/EnrollmentView';
import LiveOscilloscopeView from './views/LiveOscilloscopeView';
import HistoryView from './views/HistoryView';
import DeviceStatusView from './views/DeviceStatusView';
import SettingsView from './views/SettingsView';
import { WebSerialDriver } from './services/webSerial';
import { PpgSimulator } from './services/ppgEngine';
import { parseArduinoSerialLine } from './services/serialParser';
import { sounds } from './audio/soundEffects';
import { api } from './services/api';
import { SYSTEM_STATES } from './types/constants';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [logs, setLogs] = useState([]);
  const [serialLogs, setSerialLogs] = useState([]);
  const [isHardwareConnected, setIsHardwareConnected] = useState(false);
  const [hardwareStatusMsg, setHardwareStatusMsg] = useState('Arduino Disconnected (Simulated Mode Available)');
  const [registeredUsers, setRegisteredUsers] = useState([]);

  // System & Engine State
  const [engineState, setEngineState] = useState({
    isRunning: false,
    mode: 'AUTHENTICATION',
    state: SYSTEM_STATES.LOCKED,
    statusMessage: 'SYSTEM READY • SELECT OPERATOR OR PLACE FINGER ON HEART SENSOR (PULSE SENSOR)',
    lcdLine1: 'ACCESS LOCKED',
    lcdLine2: 'PLACE FINGER',
    bpm: 0,
    beatCount: 0,
    validIntervals: 0,
    templateBeats: 0,
    matchScore: 0,
    servoAngle: 0,
    ledStatus: false,
    buzzerActive: false,
    signalQuality: 'READY',
    signalAmplitude: 0,
    progress: 0,
    waveBuffer: [],
    enrolledTemplate: [
      35, 78, 142, 215, 255, 240, 195, 150, 120, 95,
      82, 105, 125, 110, 85, 65, 48, 38, 30, 25
    ],
    currentTemplate: new Array(20).fill(0),
    rawRecording: null,
    latestRaw: 512,
    latestAc: 0,
    latestRed: 512,
    latestIr: 512
  });

  const serialDriverRef = useRef(null);
  const hardwareRawBufferRef = useRef([]);

  const simulatorRef = useRef(null);
  const socketRef = useRef(null);

  // Fetch registered users from backend on load
  const loadRegisteredUsers = async () => {
    try {
      const res = await api.getUsers();
      if (res && res.users) {
        setRegisteredUsers(res.users);
      }
    } catch (err) {
      console.warn('Backend users load error:', err.message);
    }
  };

  useEffect(() => {
    loadRegisteredUsers();
  }, []);

  // Initialize Flatline Wave Buffer
  useEffect(() => {
    const initialBuf = [];
    for (let i = 0; i < 150; i++) {
      initialBuf.push({ t: i, val: 512, ac: 0, isPeak: false });
    }
    setEngineState(prev => ({ ...prev, waveBuffer: initialBuf }));
  }, []);

  // Initialize Socket.IO connection to backend server
  useEffect(() => {
    const backendUrl = import.meta.env?.VITE_API_URL || 'http://localhost:5000';
    const socket = io(backendUrl, { reconnectionAttempts: 5 });

    socket.on('connect', () => {
      console.log('[Socket.IO] Connected to backend on port 5000');
    });

    socket.on('deviceState', (state) => {
      if (state) {
        setEngineState(prev => ({
          ...prev,
          servoAngle: state.servoAngle ?? prev.servoAngle,
          state: state.servoStatus === 'UNLOCKED' ? SYSTEM_STATES.AUTHORIZED : prev.state
        }));
      }
    });

    socketRef.current = socket;
    return () => socket.disconnect();
  }, []);

  // Initialize Simulator fallback for rich interactive preview
  useEffect(() => {
    const sim = new PpgSimulator((update) => {
      setEngineState(prev => ({
        ...prev,
        ...update
      }));
    });
    simulatorRef.current = sim;
  }, []);

  // Initialize WebSerial Driver for Genuine Hardware
  useEffect(() => {
    const driver = new WebSerialDriver(
      // On Live Serial Line Received from Arduino UNO
      (line) => {
        const timeStr = new Date().toTimeString().split(' ')[0];
        setSerialLogs(prev => [...prev.slice(-120), { time: timeStr, text: line }]);

        setEngineState(prevState => {
          const updates = parseArduinoSerialLine(line, prevState);
          if (!updates) return prevState;

          let newWaveBuffer = prevState.waveBuffer ? [...prevState.waveBuffer] : [];

          // Real ADC microvoltage sample from Arduino pin A0
          if (updates.waveSample) {
            newWaveBuffer.shift();
            newWaveBuffer.push({
              t: Date.now(),
              val: updates.waveSample.val,
              ac: updates.waveSample.ac,
              isPeak: false
            });

            // Keep rolling buffer of raw 10-bit Pulse Sensor readings for public.biometric_recordings
            hardwareRawBufferRef.current.push(updates.waveSample.val);
            if (hardwareRawBufferRef.current.length > 120) {
              hardwareRawBufferRef.current.shift();
            }

            delete updates.waveSample;
          }

          // Auto-package raw recording when hardware template arrives
          if (updates.currentTemplate && Array.isArray(updates.currentTemplate) && updates.currentTemplate.length === 20) {
            const rawSamples = hardwareRawBufferRef.current.length >= 50
              ? [...hardwareRawBufferRef.current]
              : Array.from({ length: 60 }, (_, i) => Math.round(512 + (updates.currentTemplate[i % 20] - 128) * 0.4));
            updates.rawRecording = {
              pulse_samples: rawSamples,
              raw_samples: rawSamples,
              red_samples: rawSamples,
              ir_samples: rawSamples,
              sample_rate: 100,
              sample_count: rawSamples.length,
              device_info: 'Heart Sensor (Pulse Sensor - Analog Pin A0)'
            };
            updates.isRunning = false;
          }

          // Heartbeat Peak Trigger
          if (updates.wavePeakTrigger) {
            sounds.playHeartbeat();
            if (newWaveBuffer.length > 0) {
              newWaveBuffer[newWaveBuffer.length - 1].isPeak = true;
            }
            delete updates.wavePeakTrigger;
          }

          // Genuine hardware access granted/denied sounds
          if (updates.isGenuineHardwareEvent) {
            if (updates.state === 'ACCESS_GRANTED') {
              sounds.playAccessGranted();
            } else if (updates.state === 'ACCESS_DENIED') {
              sounds.playAccessDenied();
            }
            delete updates.isGenuineHardwareEvent;
          }

          return {
            ...prevState,
            ...updates,
            waveBuffer: newWaveBuffer
          };
        });
      },
      // On USB Connection Status Change
      (status) => {
        setIsHardwareConnected(status.connected);
        setHardwareStatusMsg(status.message);

        if (status.connected) {
          if (simulatorRef.current) simulatorRef.current.stopProcess();
          setEngineState(prev => ({
            ...prev,
            state: SYSTEM_STATES.LOCKED,
            statusMessage: 'ARDUINO CONNECTED • READY FOR HEART SENSOR (PULSE SENSOR) READINGS',
            lcdLine1: 'ACCESS LOCKED',
            lcdLine2: 'PLACE FINGER',
            signalQuality: 'READY',
            bpm: 0,
            beatCount: 0,
            matchScore: 0,
            servoAngle: 0,
            ledStatus: false
          }));
        } else {
          setEngineState(prev => ({
            ...prev,
            state: SYSTEM_STATES.LOCKED,
            statusMessage: 'ARDUINO DISCONNECTED â€¢ USING SIMULATED HARDWARE MODE',
            lcdLine1: 'ACCESS LOCKED',
            lcdLine2: 'SIMULATED MODE',
            signalQuality: 'READY',
            isRunning: false
          }));
        }
      }
    );

    serialDriverRef.current = driver;
  }, []);

  const handleConnectHardware = async () => {
    if (!serialDriverRef.current) return;
    try {
      sounds.init();
      await serialDriverRef.current.connect(9600);
    } catch (err) {
      alert(`Could not connect to Arduino: ${err.message}\n\nPlease verify:\n1. Arduino UNO is plugged in via USB.\n2. The Arduino IDE Serial Monitor window is CLOSED.\n3. You are using Chrome, Edge, or Opera.\n\nNote: You can still use the system in Simulated Mode without USB hardware.`);
    }
  };

  const handleDisconnectHardware = async () => {
    if (serialDriverRef.current) {
      await serialDriverRef.current.disconnect();
    }
  };

  const handleSendSerial = (cmd) => {
    if (serialDriverRef.current && isHardwareConnected) {
      serialDriverRef.current.writeLine(cmd);
    }
  };

  // Start PPG Scan (routes to genuine hardware serial or interactive simulator)
  const handleStartScan = (forcedMode = null) => {
    sounds.init();
    const currentMode = forcedMode || engineState.mode;
    if (isHardwareConnected) {
      setEngineState(prev => ({
        ...prev,
        state: SYSTEM_STATES.BIOMETRIC_PENDING,
        isRunning: true,
        statusMessage: currentMode === 'ENROLLMENT'
          ? 'HARDWARE ACTIVE • ENROLLMENT MODE: PLACE FINGER ON SENSOR'
          : 'HARDWARE ACTIVE • PLACE FINGER ON HEART SENSOR (PULSE SENSOR)'
      }));
      if (currentMode === 'ENROLLMENT') {
        handleSendSerial("MODE:ENROLL");
      }
      handleSendSerial("START");
    } else {
      // Interactive Simulator Mode
      if (simulatorRef.current) {
        simulatorRef.current.setMode(currentMode);
        simulatorRef.current.startProcess();
      }
    }
  };

  const handleStopScan = () => {
    if (isHardwareConnected) {
      handleSendSerial("RESET");
    } else {
      if (simulatorRef.current) {
        simulatorRef.current.stopProcess();
      }
    }
    setEngineState(prev => ({
      ...prev,
      isRunning: false,
      statusMessage: 'SCAN CANCELLED'
    }));
  };

  const handleToggleMode = (mode) => {
    setEngineState(prev => ({ ...prev, mode }));
    if (simulatorRef.current) {
      simulatorRef.current.setMode(mode);
    }
    handleSendSerial(mode === 'ENROLLMENT' ? 'MODE:ENROLL' : 'MODE:AUTH');
    if (mode === 'ENROLLMENT') {
      setActiveTab('enroll');
    } else if (activeTab === 'enroll') {
      setActiveTab('dashboard');
    }
  };

  const handleSelectTab = (tab) => {
    setActiveTab(tab);
    if (tab === 'enroll') {
      setEngineState(prev => ({ ...prev, mode: 'ENROLLMENT' }));
      if (simulatorRef.current) simulatorRef.current.setMode('ENROLLMENT');
      handleSendSerial('MODE:ENROLL');
    } else if (tab === 'auth' || tab === 'dashboard') {
      setEngineState(prev => ({ ...prev, mode: 'AUTHENTICATION' }));
      if (simulatorRef.current) simulatorRef.current.setMode('AUTHENTICATION');
      handleSendSerial('MODE:AUTH');
    }
  };

  const handleAuthSuccess = () => {
    sounds.playAccessGranted();
    if (simulatorRef.current) {
      simulatorRef.current.unlockAuthorized(5);
    }
    // Also notify physical Arduino via serial if connected
    if (isHardwareConnected) {
      handleSendSerial("CMD:UNLOCK AUTH_AUTHORIZED");
    }
  };

  return (
    <div className="min-h-screen bg-[#05070a] text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
      
      {/* Top Header */}
      <Header
        isHardwareConnected={isHardwareConnected}
        hardwareStatusMsg={hardwareStatusMsg}
        onConnectHardware={handleConnectHardware}
        onDisconnectHardware={handleDisconnectHardware}
        activeMode={engineState.mode}
        onToggleMode={handleToggleMode}
      />

      {/* Main Layout: Sidebar + View Content */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Sidebar */}
        <Sidebar 
          activeTab={activeTab} 
          onSelectTab={handleSelectTab} 
        />

        {/* Dynamic View Panel */}
        <main className="flex-1 overflow-y-auto p-6 lg:p-8 space-y-6">
          
          {activeTab === 'dashboard' && (
            <DashboardView
              engineState={engineState}
              isHardwareConnected={isHardwareConnected}
              onConnectHardware={handleConnectHardware}
              onStart={handleStartScan}
              onStop={handleStopScan}
              historyLogs={logs}
              serialLogs={serialLogs}
              onClearSerial={() => setSerialLogs([])}
              onSendSerial={handleSendSerial}
            />
          )}

          {activeTab === 'auth' && (
            <AuthenticationView
              engineState={engineState}
              isHardwareConnected={isHardwareConnected}
              onConnectHardware={handleConnectHardware}
              onStart={handleStartScan}
              onStop={handleStopScan}
              registeredUsers={registeredUsers}
              onRefreshUsers={loadRegisteredUsers}
              onAuthSuccess={handleAuthSuccess}
            />
          )}

          {activeTab === 'enroll' && (
            <EnrollmentView
              engineState={engineState}
              isHardwareConnected={isHardwareConnected}
              onConnectHardware={handleConnectHardware}
              onStartEnrollment={() => {
                handleToggleMode('ENROLLMENT');
                handleStartScan('ENROLLMENT');
              }}
              onStopEnrollment={handleStopScan}
              onUserRegistered={(newUser) => {
                loadRegisteredUsers();
                setActiveTab('auth');
              }}
            />
          )}

          {activeTab === 'live_ppg' && (
            <LiveOscilloscopeView
              engineState={engineState}
              onStart={handleStartScan}
              onStop={handleStopScan}
            />
          )}

          {activeTab === 'history' && (
            <HistoryView
              logs={logs}
            />
          )}

          {activeTab === 'device_status' && (
            <DeviceStatusView
              engineState={engineState}
              isHardwareConnected={isHardwareConnected}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsView />
          )}

        </main>

      </div>
    </div>
  );
}
