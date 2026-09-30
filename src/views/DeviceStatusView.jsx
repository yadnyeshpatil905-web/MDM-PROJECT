import React from 'react';
import { 
  Cpu, 
  Activity, 
  Lock, 
  Monitor, 
  Bell, 
  Lightbulb, 
  Server, 
  Database,
  ArrowRight
} from 'lucide-react';

export default function DeviceStatusView({ engineState = {}, isHardwareConnected = false }) {
  const {
    servoAngle = 0,
    ledStatus = false,
    buzzerActive = false
  } = engineState;

  const hardwareNodes = [
    {
      id: 'hw827',
      name: 'HW-827 PPG Sensor',
      pin: 'Analog Pin A0',
      status: isHardwareConnected ? 'Active' : 'Offline',
      icon: Activity,
      desc: 'Optical phototransistor reading capillary blood volume changes'
    },
    {
      id: 'arduino',
      name: 'Arduino UNO (ATmega328P)',
      pin: 'USB Serial (9600 Baud)',
      status: isHardwareConnected ? 'Connected' : 'Offline',
      icon: Cpu,
      desc: '16MHz processor executing IBI detection & template comparison'
    },
    {
      id: 'servo',
      name: 'SG90 Servo Lock',
      pin: 'PWM Pin 9',
      status: servoAngle > 45 ? 'Unlocked (90°)' : 'Locked (0°)',
      icon: Lock,
      desc: 'Mechanical deadbolt actuator with auto-relock safety timer'
    },
    {
      id: 'lcd',
      name: '16x2 I2C Display',
      pin: 'I2C 0x27 (A4/A5)',
      status: isHardwareConnected ? 'Active' : 'Standby',
      icon: Monitor,
      desc: 'LiquidCrystal display displaying user status prompts'
    },
    {
      id: 'buzzer',
      name: 'Piezo Buzzer',
      pin: 'Digital Pin 8',
      status: buzzerActive ? 'Active' : 'Standby',
      icon: Bell,
      desc: 'Audio feedback (2000Hz confirm / 1000Hz denial)'
    },
    {
      id: 'led',
      name: 'Status LED',
      pin: 'Digital Pin 7',
      status: ledStatus ? 'Illuminated' : 'Low',
      icon: Lightbulb,
      desc: 'Visual access verification indicator'
    }
  ];

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      
      {/* Top Architecture */}
      <div className="pro-card p-4 border border-zinc-800 bg-[#101014]">
        <div className="flex items-center space-x-2 mb-3">
          <Cpu className="w-4 h-4 text-zinc-400" />
          <h2 className="text-sm font-bold text-white">
            Hardware Wiring Topology
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-center text-center font-mono text-xs">
          <div className="p-3 rounded bg-[#0a0a0c] border border-zinc-800">
            <Activity className="w-5 h-5 text-zinc-300 mx-auto mb-1" />
            <div className="font-semibold text-white">HW-827 PPG</div>
            <div className="text-[10px] text-zinc-500">Pin A0</div>
          </div>

          <div className="hidden md:flex justify-center text-zinc-600">
            <ArrowRight className="w-4 h-4" />
          </div>

          <div className="p-3 rounded bg-[#0a0a0c] border border-zinc-800">
            <Cpu className="w-5 h-5 text-zinc-300 mx-auto mb-1" />
            <div className="font-semibold text-white">Arduino UNO</div>
            <div className="text-[10px] text-zinc-500">ATmega328P</div>
          </div>

          <div className="hidden md:flex justify-center text-zinc-600">
            <ArrowRight className="w-4 h-4" />
          </div>

          <div className="p-3 rounded bg-[#0a0a0c] border border-zinc-800">
            <Lock className="w-5 h-5 text-zinc-300 mx-auto mb-1" />
            <div className="font-semibold text-white">SG90 Servo</div>
            <div className="text-[10px] text-zinc-500">Pin 9 (PWM)</div>
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
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-300">
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

    </div>
  );
}
