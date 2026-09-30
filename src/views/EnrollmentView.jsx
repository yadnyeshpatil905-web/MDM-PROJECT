import React, { useState } from 'react';
import { 
  UserPlus, 
  Fingerprint, 
  HardDrive, 
  Copy, 
  Check, 
  Play, 
  Square 
} from 'lucide-react';
import PpgWaveformCanvas from '../components/PpgWaveformCanvas';
import TemplateComparisonCard from '../components/TemplateComparisonCard';

export default function EnrollmentView({
  engineState = {},
  isHardwareConnected = false,
  onConnectHardware = () => {},
  onStartEnrollment = () => {},
  onStopEnrollment = () => {}
}) {
  const {
    bpm = 0,
    beatCount = 0,
    signalQuality = 'READY',
    isRunning = false,
    waveBuffer = [],
    enrolledTemplate = [],
    currentTemplate = []
  } = engineState;

  const [formData, setFormData] = useState({
    userId: 'USER-001',
    fullName: 'Alex Morgan',
    credentialId: 'CR-9042',
    department: 'Robotics Laboratory'
  });

  const [copied, setCopied] = useState(false);

  const eepromSnippet = `// Enrolled Biometric Template (20-Bytes)
const byte ENROLLED_TEMPLATE[20] = {
  ${enrolledTemplate.join(', ')}
};`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(eepromSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      
      {/* Top Bar */}
      <div className="pro-card p-5 border border-zinc-800 bg-[#101014] flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center space-x-3.5">
          <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-zinc-700 flex items-center justify-center text-zinc-200">
            <UserPlus className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-[10px] font-mono uppercase font-semibold text-zinc-400 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                Enrollment Mode
              </span>
              <span className="text-xs font-mono text-zinc-500">ENROLL_MODE = 1</span>
            </div>
            <h2 className="text-lg font-bold font-sans text-white mt-0.5">
              Create Biometric Credential
            </h2>
          </div>
        </div>

        <div>
          {!isHardwareConnected ? (
            <button
              onClick={onConnectHardware}
              className="px-4 py-2 rounded-md font-sans font-semibold text-xs text-black bg-white hover:bg-zinc-200 transition-colors"
            >
              Connect Arduino USB
            </button>
          ) : !isRunning ? (
            <button
              onClick={onStartEnrollment}
              className="px-4 py-2 rounded-md font-sans font-semibold text-xs text-black bg-white hover:bg-zinc-200 transition-colors inline-flex items-center space-x-1.5"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Start Enrollment</span>
            </button>
          ) : (
            <button
              onClick={onStopEnrollment}
              className="px-4 py-2 rounded-md font-sans font-medium text-xs text-zinc-300 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 transition-colors"
            >
              <Square className="w-3.5 h-3.5 fill-current text-zinc-400 inline mr-1" />
              Cancel Enrollment
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        
        {/* Left Form: Metadata */}
        <div className="pro-card p-4 border border-zinc-800 bg-[#101014] space-y-3">
          <h3 className="font-semibold text-xs text-zinc-200 flex items-center space-x-2">
            <Fingerprint className="w-3.5 h-3.5 text-zinc-400" />
            <span>Operator Information</span>
          </h3>

          <div className="space-y-2.5 font-mono text-xs">
            <div>
              <label className="text-zinc-500 block mb-1">User ID</label>
              <input
                type="text"
                value={formData.userId}
                onChange={(e) => setFormData({ ...formData, userId: e.target.value })}
                className="w-full bg-[#0a0a0c] border border-zinc-800 rounded px-2.5 py-1.5 text-white focus:outline-none focus:border-zinc-600"
              />
            </div>

            <div>
              <label className="text-zinc-500 block mb-1">Full Name</label>
              <input
                type="text"
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                className="w-full bg-[#0a0a0c] border border-zinc-800 rounded px-2.5 py-1.5 text-white focus:outline-none focus:border-zinc-600"
              />
            </div>

            <div>
              <label className="text-zinc-500 block mb-1">Role / Department</label>
              <input
                type="text"
                value={formData.department}
                onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                className="w-full bg-[#0a0a0c] border border-zinc-800 rounded px-2.5 py-1.5 text-white focus:outline-none focus:border-zinc-600"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-zinc-800/80 text-[11px] font-mono text-zinc-500 space-y-1">
            <div className="text-zinc-400 font-semibold uppercase text-[10px]">Enrollment Steps</div>
            <div>1. Place fingertip on HW-827 sensor</div>
            <div>2. Acquire 5 clean consecutive beats</div>
            <div>3. Arduino compiles 20-point morphology</div>
            <div>4. Vector committed to EEPROM</div>
          </div>
        </div>

        {/* Right 2 Columns */}
        <div className="lg:col-span-2 space-y-4">
          <PpgWaveformCanvas
            waveBuffer={waveBuffer}
            bpm={bpm}
            beatCount={beatCount}
            signalQuality={signalQuality}
            isRunning={isRunning}
            height={180}
          />

          <TemplateComparisonCard
            enrolledTemplate={enrolledTemplate}
            currentTemplate={currentTemplate}
            matchScore={100}
            threshold={70}
          />

          {/* EEPROM array snippet */}
          <div className="pro-card p-3.5 border border-zinc-800 bg-[#101014]">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-mono font-semibold text-zinc-300 flex items-center space-x-1.5">
                <HardDrive className="w-3.5 h-3.5 text-zinc-400" />
                <span>EEPROM Template Vector (20 Bytes)</span>
              </span>
              <button
                onClick={copyToClipboard}
                className="px-2 py-1 rounded bg-zinc-900 border border-zinc-800 text-[11px] font-mono text-zinc-300 hover:text-white flex items-center space-x-1"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>

            <pre className="p-2.5 rounded bg-[#09090b] font-mono text-[11px] text-zinc-300 overflow-x-auto border border-zinc-800">
              {eepromSnippet}
            </pre>
          </div>
        </div>

      </div>
    </div>
  );
}
