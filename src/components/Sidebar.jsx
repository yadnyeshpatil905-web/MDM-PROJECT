import React from 'react';
import { 
  LayoutDashboard, 
  Fingerprint, 
  UserPlus, 
  Activity, 
  History, 
  Cpu, 
  Settings, 
  ShieldCheck 
} from 'lucide-react';

export default function Sidebar({ activeTab = 'dashboard', onSelectTab = () => {} }) {
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'auth', label: 'Biometric Auth', icon: Fingerprint },
    { id: 'enroll', label: 'Enroll Credential', icon: UserPlus },
    { id: 'live_ppg', label: 'PPG Monitor', icon: Activity },
    { id: 'history', label: 'Audit History', icon: History },
    { id: 'device_status', label: 'Device Status', icon: Cpu },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <aside className="w-56 border-r border-zinc-800/80 bg-zinc-950 flex flex-col justify-between shrink-0 h-[calc(100vh-3.5rem)] sticky top-14">
      <div className="p-3 space-y-1">
        <div className="px-3 py-2 text-[10px] font-mono text-zinc-500 uppercase tracking-wider font-medium">
          Navigation
        </div>

        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-md font-medium text-xs transition-colors ${
                isActive
                  ? 'bg-zinc-800 text-white font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-zinc-100' : 'text-zinc-500'}`} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Footer info */}
      <div className="p-3 m-2 rounded-md bg-zinc-900/60 border border-zinc-800 text-xs text-zinc-400 space-y-1">
        <div className="flex items-center space-x-1.5 text-zinc-300 font-medium text-[11px]">
          <ShieldCheck className="w-3.5 h-3.5 text-zinc-400" />
          <span>Biometric Protection</span>
        </div>
        <p className="text-[10px] text-zinc-500 leading-tight">
          20-point morphological template stored in ATmega EEPROM.
        </p>
      </div>
    </aside>
  );
}
