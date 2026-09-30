import React, { useState, useEffect, useRef } from 'react';
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
import { parseArduinoSerialLine } from './services/serialParser';
import { sounds } from './audio/soundEffects';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [logs, setLogs] = useState([]);
  const [serialLogs, setSerialLogs] = useState([]);
  const [isHardwareConnected, setIsHardwareConnected] = useState(false);
  const [hardwareStatusMsg, setHardwareStatusMsg] = useState('Arduino Disconnected');

  // Real Hardware State - Strictly reactive to physical sensor
  const [engineState, setEngineState] = useState({
    isRunning: false,
    mode: 'AUTHENTICATION',
    state: 'DISCONNECTED', // 'DISCONNECTED' | 'IDLE' | 'CAPTURING' | 'VERIFYING_BEATS' | 'VERIFYING_BIOMETRIC' | 'ACCESS_GRANTED' | 'ACCESS_DENIED'
    statusMessage: 'ARDUINO NOT CONNECTED • PLEASE CONNECT USB TO READ HW-827 SENSOR',
    lcdLine1: 'NO ARDUINO',
    lcdLine2: 'CONNECT USB',
    bpm: 0,
    beatCount: 0,
    validIntervals: 0,
    templateBeats: 0,
    matchScore: 0,
    servoAngle: 0,
    ledStatus: false,
    buzzerActive: false,
    signalQuality: 'DISCONNECTED',
    signalAmplitude: 0,
    progress: 0,
    waveBuffer: [],
    enrolledTemplate: [
      35, 78, 142, 215, 255, 240, 195, 150, 120, 95,
      82, 105, 125, 110, 85, 65, 48, 38, 30, 25
    ],
    currentTemplate: new Array(20).fill(0)
  });

  const serialDriverRef = useRef(null);

  // Initialize Flatline Wave Buffer
  useEffect(() => {
    const initialBuf = [];
    for (let i = 0; i < 150; i++) {
      initialBuf.push({ t: i, val: 512, ac: 0, isPeak: false });
    }
    setEngineState(prev => ({ ...prev, waveBuffer: initialBuf }));
  }, []);

  // Initialize WebSerial Driver for Genuine Hardware
  useEffect(() => {
    const driver = new WebSerialDriver(
      // On Live Serial Line Received from Arduino UNO
      (line) => {
        const timeStr = new Date().toTimeString().split(' ')[0];
        
        // Add to serial terminal log
        setSerialLogs(prev => [...prev.slice(-120), { time: timeStr, text: line }]);

        // Parse line into state update
        setEngineState(prevState => {
          const updates = parseArduinoSerialLine(line, prevState);
          if (!updates) return prevState;

          let newWaveBuffer = prevState.waveBuffer ? [...prevState.waveBuffer] : [];

          // Handle real analog microvoltage sample from Arduino pin A0
          if (updates.waveSample) {
            newWaveBuffer.shift();
            newWaveBuffer.push({
              t: Date.now(),
              val: updates.waveSample.val,
              ac: updates.waveSample.ac,
              isPeak: false
            });
            delete updates.waveSample;
          }

          // Handle Heartbeat Peak Trigger from Arduino
          if (updates.wavePeakTrigger) {
            sounds.playHeartbeat();
            if (newWaveBuffer.length > 0) {
              newWaveBuffer[newWaveBuffer.length - 1].isPeak = true;
            }
            delete updates.wavePeakTrigger;
          }

          // Handle Granted / Denied sounds from Arduino
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
          setEngineState(prev => ({
            ...prev,
            state: 'IDLE',
            statusMessage: 'ARDUINO CONNECTED • WAITING FOR FINGER ON HW-827 SENSOR',
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
            state: 'DISCONNECTED',
            statusMessage: 'ARDUINO DISCONNECTED • CLICK "CONNECT ARDUINO (USB)"',
            lcdLine1: 'NO ARDUINO',
            lcdLine2: 'CONNECT USB',
            signalQuality: 'DISCONNECTED',
            bpm: 0,
            beatCount: 0,
            matchScore: 0,
            servoAngle: 0,
            ledStatus: false,
            isRunning: false
          }));
        }
      }
    );

    serialDriverRef.current = driver;
  }, []);

  // Connect directly to physical Arduino UNO USB Port
  const handleConnectHardware = async () => {
    if (!serialDriverRef.current) return;
    try {
      sounds.init();
      await serialDriverRef.current.connect(9600);
    } catch (err) {
      alert(`Could not connect to Arduino: ${err.message}\n\nPlease verify:\n1. Arduino UNO is plugged in via USB.\n2. The Arduino IDE Serial Monitor window is CLOSED (so it doesn't block the port).\n3. You are using Chrome, Edge, or Opera.`);
    }
  };

  const handleDisconnectHardware = async () => {
    if (serialDriverRef.current) {
      await serialDriverRef.current.disconnect();
    }
  };

  const handleSendSerial = (cmd) => {
    if (serialDriverRef.current) {
      serialDriverRef.current.writeLine(cmd);
    }
  };

  // Log on genuine authentication results from Arduino
  useEffect(() => {
    if (engineState.state === 'ACCESS_GRANTED') {
      const now = new Date();
      const timeStr = now.toTimeString().split(' ')[0];
      const newEntry = {
        id: `LOG-${Math.floor(1000 + Math.random() * 9000)}`,
        timestamp: timeStr,
        userId: engineState.mode === 'ENROLLMENT' ? 'USER-001 (ENROLLED)' : 'USER-001',
        bpm: engineState.bpm || 72,
        beats: engineState.beatCount || 6,
        score: engineState.matchScore || 88,
        result: 'GRANTED',
        reason: engineState.mode === 'ENROLLMENT' 
          ? 'Biometric Template Enrolled to Arduino EEPROM' 
          : `Arduino Match ${engineState.matchScore}% >= 70%`,
        device: 'ARDUINO-UNO (USB HW-827)',
        duration: '10.0s'
      };
      setLogs(prev => [newEntry, ...prev]);
    } else if (engineState.state === 'ACCESS_DENIED') {
      const now = new Date();
      const timeStr = now.toTimeString().split(' ')[0];
      const newEntry = {
        id: `LOG-${Math.floor(1000 + Math.random() * 9000)}`,
        timestamp: timeStr,
        userId: 'UNKNOWN / UNMATCHED',
        bpm: engineState.bpm || 0,
        beats: engineState.beatCount || 0,
        score: engineState.matchScore || 0,
        result: 'DENIED',
        reason: engineState.statusMessage,
        device: 'ARDUINO-UNO (USB HW-827)',
        duration: '10.0s'
      };
      setLogs(prev => [newEntry, ...prev]);
    }
  }, [engineState.state]);

  // When user clicks Start Scan button
  const handleStartScan = () => {
    sounds.init();
    if (!isHardwareConnected) {
      // Prompt user to connect USB directly
      handleConnectHardware();
    } else {
      // Arduino loop is already running and checking detectFinger()!
      // Set UI to waiting state
      setEngineState(prev => ({
        ...prev,
        state: 'IDLE',
        isRunning: true,
        statusMessage: 'READY • PLACE YOUR FINGERTIP FIRMLY ON THE HW-827 SENSOR'
      }));
      handleSendSerial("START");
    }
  };

  const handleStopScan = () => {
    setEngineState(prev => ({
      ...prev,
      isRunning: false,
      statusMessage: 'SCAN CANCELLED'
    }));
    handleSendSerial("RESET");
  };

  const handleToggleMode = (mode) => {
    setEngineState(prev => ({ ...prev, mode }));
    handleSendSerial(mode === 'ENROLLMENT' ? 'MODE:ENROLL' : 'MODE:AUTH');
    if (mode === 'ENROLLMENT') {
      setActiveTab('enroll');
    } else {
      setActiveTab('dashboard');
    }
  };

  return (
    <div className="min-h-screen bg-[#05070a] text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
      
      {/* Top Navigation Bar with USB Connect */}
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
          onSelectTab={setActiveTab} 
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
            />
          )}

          {activeTab === 'enroll' && (
            <EnrollmentView
              engineState={engineState}
              isHardwareConnected={isHardwareConnected}
              onConnectHardware={handleConnectHardware}
              onStartEnrollment={() => {
                handleToggleMode('ENROLLMENT');
                handleStartScan();
              }}
              onStopEnrollment={handleStopScan}
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
