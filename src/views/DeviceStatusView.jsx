import React, { useState, useEffect } from 'react';
import { 
  Cpu, 
  Activity, 
  Lock, 
  Monitor, 
  Bell, 
  Lightbulb, 
  Server, 
  Database,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  Clock
} from 'lucide-react';
import { api } from '../services/api';

export default function DeviceStatusView({ engineState = {}, isHardwareConnected = false }) {
  const {
    servoAngle = 0,
    ledStatus = false,
    buzzerActive = false
  } = engineState;

  const [backendStatus, setBackendStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchBackendDeviceStatus = async () => {
    try {
      setLoading(true);
      const data = await api.getDeviceStatus();
      setBackendStatus(data);
    } catch (e) {
      console.warn('Backend device status fetch error:', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBackendDeviceStatus();
    const interval = setInterval(fetchBackendDeviceStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const hardwareNodes = [
    {
      id: 'hw827',
      name: 'Heart Sensor (Pulse Sensor)',
      pin: 'Analog Pin A0 (10-Bit ADC, 100Hz Rate)',
      status: isHardwareConnected ? 'Hardware Active' : 'Simulated / Standby',
      icon: Activity,
      desc: 'Optical heart/pulse sensor capturing photoplethysmogram microvoltages from fingertip capillary blood volume'
    },
    {
      id: 'arduino',
      name: 'Arduino UNO (ATmega328P)',
      pin: 'USB Serial (9600 Baud, 8-N-1)',
      status: isHardwareConnected ? 'Connected via USB' : 'Simulated Controller',
      icon: Cpu,
      desc: '16MHz microcontroller calculating Inter-Beat Interval (IBI) & 20-point morphology'
    },
    {
      id: 'servo',
      name: 'SG90 Micro Servo Deadbolt',
      pin: 'PWM Pin 9 (Fail-Closed Default)',
      status: servoAngle > 45 ? 'UNLOCKED (90Â°)' : 'LOCKED (0Â°)',
      icon: Lock,
      desc: 'Physical deadbolt actuator. Opens ONLY on backend two-step authorization token.'
    },
    {
      id: 'lcd',
      name: '16x2 I2C Display',
      pin: 'I2C Address 0x27 (A4/SDA, A5/SCL)',
      status: isHardwareConnected ? 'Active Display' : 'Standby',
      icon: Monitor,
      desc: 'LiquidCrystal module displaying system prompts & PIN instructions'
    },
    {
      id: 'backend',
      name: 'Trusted Node.js / Express Server',
      pin: 'REST API & Socket.IO (Port 5000)',
      status: backendStatus ? 'Online (Supabase Ready)' : 'Connecting...',
      icon: Server,
      desc: 'Authorizes two-step authentication, generates salted Scrypt hashes, and controls deadbolt'
    },
    {
      id: 'database',
      name: 'Data Repository (Supabase-Ready)',
      pin: 'Public & Private Schemas',
      status: 'In-Memory Mock / SQL Ready',
      icon: Database,
      desc: 'Models: profiles, biometric_credentials, vault_credentials, authentication_attempts'
    }
  ];

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      
      {/* Top Architecture Topology */}
      <div className="pro-card p-4 border border-zinc-800 bg-[#101014]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <Cpu className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-bold text-white">
              End-to-End System & Hardware Topology
            </h2>
          </div>
          <button
            onClick={fetchBackendDeviceStatus}
            disabled={loading}
            className="p-1.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-center text-center font-mono text-xs">
          <div className="p-3 rounded bg-[#0a0a0c] border border-zinc-800">
            <Activity className="w-5 h-5 text-cyan-400 mx-auto mb-1" />
            <div className="font-semibold text-white">Pulse Sensor</div>
            <div className="text-[10px] text-zinc-500">Pin A0 (Analog)</div>
          </div>

          <div className="hidden md:flex justify-center text-zinc-600">
            <ArrowRight className="w-4 h-4" />
          </div>

          <div className="p-3 rounded bg-[#0a0a0c] border border-zinc-800">
            <Cpu className="w-5 h-5 text-cyan-400 mx-auto mb-1" />
            <div className="font-semibold text-white">Arduino UNO</div>
            <div className="text-[10px] text-zinc-500">9600 Baud USB</div>
          </div>

          <div className="hidden md:flex justify-center text-zinc-600">
            <ArrowRight className="w-4 h-4" />
          </div>

          <div className="p-3 rounded bg-[#0a0a0c] border border-zinc-800">
            <Lock className="w-5 h-5 text-cyan-400 mx-auto mb-1" />
            <div className="font-semibold text-white">SG90 Servo</div>
            <div className="text-[10px] text-zinc-500">Fail-Closed 0Â°</div>
          </div>
        </div>
      </div>

      {/* Grid of hardware node cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {hardwareNodes.map((node) => {
          const Icon = node.icon;
          return (
            <div 
              key={node.id} 
              className="pro-card p-3.5 border border-zinc-800 bg-[#101014] space-y-2 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="w-7 h-7 rounded bg-[#0a0a0c] border border-zinc-800 flex items-center justify-center text-zinc-400">
                    <Icon className="w-4 h-4 text-cyan-400" />
                  </div>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                    node.status.includes('UNLOCKED') ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800' :
                    node.status.includes('Connected') || node.status.includes('Active') || node.status.includes('Online') ? 'bg-zinc-900 border-zinc-700 text-zinc-300' :
                    'bg-zinc-900 border-zinc-800 text-zinc-500'
                  }`}>
                    {node.status}
                  </span>
                </div>

                <h3 className="font-semibold text-xs text-white mt-2.5">
                  {node.name}
                </h3>
                <div className="text-[11px] font-mono text-zinc-500">
                  {node.pin}
                </div>
              </div>

              <div className="text-[10px] text-zinc-500 pt-2 border-t border-zinc-800/60 font-mono">
                {node.desc}
              </div>
            </div>
          );
        })}
      </div>

      {/* Fail-Safe Audit Assurance */}
      <div className="pro-card p-4 border border-zinc-800 bg-[#101014] font-mono text-xs space-y-2 text-zinc-400">
        <div className="text-zinc-200 font-semibold flex items-center space-x-1.5">
          <ShieldCheck className="w-4 h-4 text-cyan-400" />
          <span>Fail-Closed Deadbolt Guarantee</span>
        </div>
        <p className="text-[11px] leading-relaxed">
          â€¢ Servo defaults to 0Â° (LOCKED) upon power-up, restart, communication loss, or session timeout.<br/>
          â€¢ Client browser cannot send raw actuator commands directly to Arduino without verified backend token.<br/>
          â€¢ Biometric verification challenge expires automatically after 90 seconds if PIN is not entered.
        </p>
      </div>

    </div>
  );
}
