import React from 'react';
import { 
  LayoutDashboard, 
  Fingerprint, 
  UserPlus, 
  Activity, 
  History, 
  Cpu, 
  Settings, 
  ShieldCheck,
  FolderLock,
  Lock,
  Unlock
} from 'lucide-react';

export default function Sidebar({ 
  activeTab = 'dashboard', 
  onSelectTab = () => {},
  isVaultUnlocked = false 
}) {
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'auth', label: 'Multi-Auth Unlock', icon: Fingerprint, badge: '2FA' },
    { id: 'vault', label: 'Secure Vault / Folder', icon: FolderLock, isVault: true },
    { id: 'enroll', label: 'Enroll Fingerprint & PIN', icon: UserPlus },
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
              className={`w-full flex items-center justify-between px-3 py-2 rounded-md font-medium text-xs transition-colors ${
                isActive
                  ? 'bg-zinc-800 text-white font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
              }`}
            >
              <div className="flex items-center space-x-2.5 truncate">
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-zinc-100' : 'text-zinc-500'}`} />
                <span className="truncate">{item.label}</span>
              </div>

              {item.isVault ? (
                <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded flex items-center space-x-1 ${
                  isVaultUnlocked 
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' 
                    : 'bg-zinc-900 text-zinc-500 border border-zinc-800'
                }`}>
                  {isVaultUnlocked ? (
                    <>
                      <Unlock className="w-2.5 h-2.5" />
                      <span>OPEN</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-2.5 h-2.5" />
                      <span>LOCKED</span>
                    </>
                  )}
                </span>
              ) : item.badge ? (
                <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
                  {item.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Footer info */}
      <div className="p-3 m-2 rounded-md bg-zinc-900/60 border border-zinc-800 text-xs text-zinc-400 space-y-1">
        <div className="flex items-center space-x-1.5 text-zinc-300 font-medium text-[11px]">
          <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
          <span>Multi-Authenticator</span>
        </div>
        <p className="text-[10px] text-zinc-500 leading-tight">
          HW-827 Biometric Fingerprint + Salted Vault PIN 2FA.
        </p>
      </div>
    </aside>
  );
}
