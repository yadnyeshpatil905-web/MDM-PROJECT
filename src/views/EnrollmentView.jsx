import React, { useState } from 'react';
import { 
  UserPlus, 
  Fingerprint, 
  KeyRound, 
  Mail, 
  Lock, 
  CheckCircle2, 
  AlertCircle, 
  Play, 
  Square, 
  RefreshCw, 
  ShieldCheck,
  Eye,
  EyeOff
} from 'lucide-react';
import PpgWaveformCanvas from '../components/PpgWaveformCanvas';
import TemplateComparisonCard from '../components/TemplateComparisonCard';
import { api, sessionAuth } from '../services/api';

export default function EnrollmentView({
  engineState = {},
  isHardwareConnected = false,
  onConnectHardware = () => {},
  onStartEnrollment = () => {},
  onStopEnrollment = () => {},
  onUserRegistered = () => {}
}) {
  const {
    bpm = 0,
    beatCount = 0,
    signalQuality = 'READY',
    isRunning = false,
    waveBuffer = [],
    currentTemplate = [],
    rawRecording = null,
    latestRed = 48500,
    latestIr = 53200,
    latestRaw = 512,
    latestAc = 0,
    signalAmplitude = 0
  } = engineState || {};

  // Form State
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: '',
    pin: '',
    pinConfirm: ''
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showPin, setShowPin] = useState(false);

  // Status State: 'IDLE' | 'ENROLLING_SENSOR' | 'SUBMITTING' | 'SUCCESS' | 'ERROR'
  const [enrollmentStatus, setEnrollmentStatus] = useState('IDLE');
  const [statusMessage, setStatusMessage] = useState('');
  const [capturedTemplate, setCapturedTemplate] = useState(null);
  const [capturedRawRecording, setCapturedRawRecording] = useState(null);
  const [enrolledUser, setEnrolledUser] = useState(null);

  // Check if sensor has acquired valid 20-point template
  const isTemplateReady = Array.isArray(capturedTemplate || currentTemplate) && 
    (capturedTemplate || currentTemplate).length === 20 &&
    (capturedTemplate || currentTemplate).some(v => v > 0);

  const activeTemplate = capturedTemplate || (isTemplateReady ? currentTemplate : null);
  const activeRawRecording = capturedRawRecording || rawRecording;


  const handleCaptureTemplate = () => {
    setCapturedTemplate(null);
    setCapturedRawRecording(null);
    onStartEnrollment();
    setEnrollmentStatus('ENROLLING_SENSOR');
    setStatusMessage('Acquiring clean pulse waves from HW-827 Pulse Sensor (Pin A0)...');
  };

  const handleCancelCapture = () => {
    onStopEnrollment();
    setEnrollmentStatus('IDLE');
    setStatusMessage('PPG capture cancelled. Click Acquire Biometric PPG to try again.');
  };

  // Check whenever currentTemplate or rawRecording updates during live acquisition
  React.useEffect(() => {
    if (enrollmentStatus === 'ENROLLING_SENSOR' && currentTemplate && currentTemplate.length === 20 && currentTemplate.some(v => v > 0)) {
      setCapturedTemplate([...currentTemplate]);
      if (rawRecording) {
        setCapturedRawRecording({ ...rawRecording });
      }
      setEnrollmentStatus('IDLE');
      setStatusMessage('Biometric pulse morphology & HW-827 Pulse Sensor raw waveforms captured! Complete form to register.');
    }
  }, [currentTemplate, rawRecording, enrollmentStatus]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatusMessage('');

    // Validations
    if (!formData.fullName.trim() || formData.fullName.trim().length < 2) {
      setEnrollmentStatus('ERROR');
      setStatusMessage('Full Name must be at least 2 characters.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!formData.email.trim() || !emailRegex.test(formData.email.trim())) {
      setEnrollmentStatus('ERROR');
      setStatusMessage('Please enter a valid email address.');
      return;
    }

    if (!formData.password || formData.password.length < 8) {
      setEnrollmentStatus('ERROR');
      setStatusMessage('Password must be at least 8 characters (Supabase Auth policy).');
      return;
    }

    const pinRegex = /^[0-9]{4,8}$/;
    if (!formData.pin || !pinRegex.test(formData.pin)) {
      setEnrollmentStatus('ERROR');
      setStatusMessage('Vault PIN must be 4 to 8 numeric digits.');
      return;
    }

    if (formData.pin !== formData.pinConfirm) {
      setEnrollmentStatus('ERROR');
      setStatusMessage('Vault PIN and Confirmation PIN do not match.');
      return;
    }

    const finalTemplate = activeTemplate || currentTemplate;
    if (!finalTemplate || finalTemplate.length !== 20 || !finalTemplate.some(v => v > 0)) {
      setEnrollmentStatus('ERROR');
      setStatusMessage('Biometric pulse capture required. Please acquire a clean PPG waveform before registering.');
      return;
    }

    try {
      setEnrollmentStatus('SUBMITTING');
      setStatusMessage('Hashing PIN securely and enrolling biometric credential into Supabase backend...');

      const response = await api.register({
        fullName: formData.fullName,
        email: formData.email,
        password: formData.password,
        pin: formData.pin,
        pinConfirm: formData.pinConfirm,
        templateData: finalTemplate,
        rawRecording: activeRawRecording
      });

      if (response.sessionToken) {
        sessionAuth.setToken(response.sessionToken);
      }

      setEnrollmentStatus('SUCCESS');
      setEnrolledUser(response);
      const rawNotice = response.rawRecordingEnrolled 
        ? ` • HW-827 Pulse Sensor waveform (${response.rawValidationStats?.sampleCount || activeRawRecording?.sample_count} samples @ ${response.rawValidationStats?.sampleRate || activeRawRecording?.sample_rate}Hz) committed to public.biometric_recordings`
        : '';
      setStatusMessage(`User ${response.fullName} registered! UUID: ${response.userId}${rawNotice}`);
      onUserRegistered(response);

      // Reset form
      setFormData({
        fullName: '',
        email: '',
        password: '',
        pin: '',
        pinConfirm: ''
      });
      setCapturedTemplate(null);
      setCapturedRawRecording(null);
    } catch (err) {
      setEnrollmentStatus('ERROR');
      setStatusMessage(err.message || 'Registration failed. Please check inputs.');
    }
  };


  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      
      {/* Header Banner */}
      <div className="pro-card p-5 border border-zinc-800 bg-[#101014] flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center space-x-3.5">
          <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-zinc-700 flex items-center justify-center text-zinc-200">
            <UserPlus className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-[10px] font-mono uppercase font-semibold text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/80">
                Registration & Enrollment Flow
              </span>
              <span className="text-xs font-mono text-zinc-500">Supabase Auth & Salted Vault PIN</span>
            </div>
            <h2 className="text-lg font-bold font-sans text-white mt-0.5">
              Enroll New Operator Credential
            </h2>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {!isHardwareConnected && (
            <button
              type="button"
              onClick={onConnectHardware}
              className="px-3 py-2 rounded-md font-sans text-xs text-zinc-400 bg-zinc-900 border border-zinc-800 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            >
              Connect USB
            </button>
          )}

          {!isRunning ? (
            <button
              type="button"
              onClick={handleCaptureTemplate}
              className="px-4 py-2 rounded-md font-sans font-semibold text-xs text-black bg-cyan-400 hover:bg-cyan-300 active:scale-95 transition-all inline-flex items-center space-x-1.5 shadow-sm cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{activeTemplate ? 'Re-scan Biometric PPG' : 'Acquire Biometric PPG'}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleCancelCapture}
              className="px-4 py-2 rounded-md font-sans font-medium text-xs text-zinc-300 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 transition-colors inline-flex items-center space-x-1.5 cursor-pointer"
            >
              <Square className="w-3.5 h-3.5 fill-current text-zinc-400" />
              <span>Cancel Capture</span>
            </button>
          )}
        </div>
      </div>

      {/* Status Notice */}
      {statusMessage && (
        <div className={`p-3.5 rounded-lg border font-mono text-xs flex items-center space-x-2.5 ${
          enrollmentStatus === 'SUCCESS' ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300' :
          enrollmentStatus === 'ERROR' ? 'bg-rose-950/40 border-rose-800 text-rose-300' :
          enrollmentStatus === 'SUBMITTING' ? 'bg-zinc-900 border-zinc-700 text-cyan-300' :
          'bg-zinc-900 border-zinc-800 text-zinc-300'
        }`}>
          {enrollmentStatus === 'SUCCESS' ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> :
           enrollmentStatus === 'ERROR' ? <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" /> :
           enrollmentStatus === 'SUBMITTING' ? <RefreshCw className="w-4 h-4 text-cyan-400 animate-spin shrink-0" /> :
           <ShieldCheck className="w-4 h-4 text-zinc-400 shrink-0" />}
          <span className="flex-1">{statusMessage}</span>
        </div>
      )}

      {/* Main 2-Column Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Form (5 Cols) */}
        <form onSubmit={handleSubmit} className="lg:col-span-5 pro-card p-5 border border-zinc-800 bg-[#101014] space-y-4">
          <div className="border-b border-zinc-800/80 pb-3">
            <h3 className="font-semibold text-sm text-zinc-100 flex items-center space-x-2">
              <KeyRound className="w-4 h-4 text-cyan-400" />
              <span>Operator Registration Form</span>
            </h3>
            <p className="text-[11px] font-mono text-zinc-500 mt-0.5">
              Identity will map to Supabase Auth UUID & Hash Store
            </p>
          </div>

          <div className="space-y-3 font-mono text-xs">
            {/* Full Name */}
            <div>
              <label className="text-zinc-400 block mb-1">Full Name</label>
              <input
                type="text"
                placeholder="e.g. Alex Morgan"
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                required
                className="w-full bg-[#0a0a0c] border border-zinc-800 rounded px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
              />
            </div>

            {/* Email */}
            <div>
              <label className="text-zinc-400 block mb-1">Email Address (Unique Identity)</label>
              <div className="relative">
                <Mail className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  placeholder="operator@internal.org"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  className="w-full bg-[#0a0a0c] border border-zinc-800 rounded pl-8 pr-3 py-2 text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            {/* Account Password */}
            <div>
              <label className="text-zinc-400 block mb-1">Account Password (Min 8 Chars)</label>
              <div className="relative">
                <Lock className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                  minLength={8}
                  className="w-full bg-[#0a0a0c] border border-zinc-800 rounded pl-8 pr-8 py-2 text-white focus:outline-none focus:border-cyan-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Vault PIN & Confirm PIN */}
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-zinc-800/60">
              <div>
                <label className="text-zinc-400 block mb-1">Vault PIN (4-8 Digits)</label>
                <div className="relative">
                  <input
                    type={showPin ? 'text' : 'password'}
                    placeholder="1234"
                    maxLength={8}
                    pattern="[0-9]{4,8}"
                    value={formData.pin}
                    onChange={(e) => setFormData({ ...formData, pin: e.target.value.replace(/\D/g, '') })}
                    required
                    className="w-full bg-[#0a0a0c] border border-zinc-800 rounded px-2.5 py-2 text-white text-center tracking-widest focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Confirm Vault PIN</label>
                <div className="relative">
                  <input
                    type={showPin ? 'text' : 'password'}
                    placeholder="1234"
                    maxLength={8}
                    pattern="[0-9]{4,8}"
                    value={formData.pinConfirm}
                    onChange={(e) => setFormData({ ...formData, pinConfirm: e.target.value.replace(/\D/g, '') })}
                    required
                    className="w-full bg-[#0a0a0c] border border-zinc-800 rounded px-2.5 py-2 text-white text-center tracking-widest focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-[10px] text-zinc-500">
              <span>PIN is hashed with Scrypt + random salt.</span>
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="text-zinc-400 hover:text-zinc-200"
              >
                {showPin ? 'Hide PINs' : 'Show PINs'}
              </button>
            </div>
          </div>

          {/* Biometric Status Indicator inside Form */}
          <div className="space-y-2">

            <div className="p-2.5 rounded bg-[#0a0a0c] border border-zinc-800 flex items-center justify-between font-mono text-xs">
              <div className="flex items-center space-x-2">
                <Fingerprint className={`w-3.5 h-3.5 ${activeTemplate ? 'text-emerald-400' : 'text-amber-400'}`} />
                <span className="text-zinc-300">Morphology Template:</span>
              </div>
              <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${
                activeTemplate 
                  ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800' 
                  : 'bg-amber-950/60 text-amber-300 border-amber-800'
              }`}>
                {activeTemplate ? '20 Points Ready' : 'Pending Scan'}
              </span>
            </div>

            <div className="p-2.5 rounded bg-[#0a0a0c] border border-zinc-800 flex items-center justify-between font-mono text-xs">
              <div className="flex items-center space-x-2">
                <ShieldCheck className={`w-3.5 h-3.5 ${activeRawRecording ? 'text-cyan-400' : 'text-zinc-500'}`} />
                <span className="text-zinc-300">HW-827 Pulse Sensor Raw Wave:</span>
              </div>
              <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${
                activeRawRecording 
                  ? 'bg-cyan-950/60 text-cyan-300 border-cyan-800' 
                  : 'bg-zinc-900 text-zinc-500 border-zinc-800'
              }`}>
                {activeRawRecording ? `${activeRawRecording.sample_count} Samples` : 'Auto-Packaged'}
              </span>
            </div>
          </div>

          <button
            type="submit"
            disabled={enrollmentStatus === 'SUBMITTING'}
            className="w-full py-2.5 rounded-md font-sans font-semibold text-xs text-black bg-cyan-400 hover:bg-cyan-300 active:scale-95 transition-all shadow-sm cursor-pointer disabled:opacity-50"
          >
            {enrollmentStatus === 'SUBMITTING' ? 'Enrolling Credential...' : 'Register Operator & Commit Credential'}
          </button>
        </form>

        {/* Right Column: Guided PPG Waveform & Vector Inspection (7 Cols) */}
        <div className="lg:col-span-7 space-y-4">
          
          {/* Live Sensor Waveform Canvas */}
          <PpgWaveformCanvas
            waveBuffer={waveBuffer}
            bpm={bpm}
            beatCount={beatCount}
            signalQuality={signalQuality}
            isRunning={isRunning || enrollmentStatus === 'ENROLLING_SENSOR'}
            height={190}
          />

          {/* HW-827 Pulse Sensor Raw Waveform Ingestion Card */}
          <div className="pro-card p-4 border border-zinc-800 bg-[#101014] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <ShieldCheck className="w-4 h-4 text-cyan-400" />
                <h3 className="font-semibold text-xs text-white">
                  HW-827 Pulse Sensor Raw PPG Waveform Ingestion (public.biometric_recordings)
                </h3>
              </div>
              <span className="text-[10px] font-mono text-zinc-400 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                HW-827 • 10-Bit ADC • Analog Pin A0
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono text-xs">
              <div className="p-2.5 rounded bg-[#0a0a0c] border border-zinc-800">
                <div className="text-[10px] text-zinc-500 uppercase">Raw ADC (0-1023)</div>
                <div className="text-cyan-400 font-bold text-sm mt-0.5">{latestRaw || latestRed || 512} LSB</div>
              </div>
              <div className="p-2.5 rounded bg-[#0a0a0c] border border-zinc-800">
                <div className="text-[10px] text-zinc-500 uppercase">AC Amplitude</div>
                <div className="text-rose-400 font-bold text-sm mt-0.5">{signalAmplitude || Math.abs(latestAc || 0)} LSB</div>
              </div>
              <div className="p-2.5 rounded bg-[#0a0a0c] border border-zinc-800">
                <div className="text-[10px] text-zinc-500 uppercase">Sampling Rate</div>
                <div className="text-white font-bold text-sm mt-0.5">100 Hz</div>
              </div>
              <div className="p-2.5 rounded bg-[#0a0a0c] border border-zinc-800">
                <div className="text-[10px] text-zinc-500 uppercase">Sample Count</div>
                <div className="text-emerald-400 font-bold text-sm mt-0.5">
                  {activeRawRecording ? activeRawRecording.sample_count : (isRunning ? 'Streaming...' : '100')}
                </div>
              </div>
            </div>

            <div className="text-[11px] font-mono text-zinc-400 bg-cyan-950/20 p-2.5 rounded border border-cyan-900/40 flex items-center justify-between">
              <span>Target Table: <code className="text-cyan-300">public.biometric_recordings</code></span>
              <span className="text-zinc-500">RLS Restricted • Service-Role Only</span>
            </div>
          </div>

          {/* Captured 20-Point Template Card */}
          <div className="pro-card p-4 border border-zinc-800 bg-[#101014] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Fingerprint className="w-4 h-4 text-cyan-400" />
                <h3 className="font-semibold text-xs text-white">
                  Acquired 20-Point Morphological Template
                </h3>
              </div>
              <span className="text-[10px] font-mono text-zinc-500">
                Normalized 0-255 Amplitude
              </span>
            </div>

            {activeTemplate ? (
              <div className="space-y-3 font-mono text-xs">
                {/* 20 points mini bar visualization */}
                <div className="grid grid-cols-20 gap-1 h-14 items-end bg-[#0a0a0c] p-2 rounded border border-zinc-800/80">
                  {activeTemplate.map((val, idx) => (
                    <div 
                      key={idx} 
                      className="bg-cyan-400/80 hover:bg-cyan-300 rounded-t transition-all group relative"
                      style={{ height: `${Math.max(4, Math.round((val / 255) * 100))}%` }}
                      title={`Point ${idx + 1}: ${val}`}
                    />
                  ))}
                </div>

                <div className="text-[10px] text-zinc-500 truncate">
                  Vector: [{activeTemplate.join(', ')}]
                </div>
              </div>
            ) : (
              <div className="p-4 text-center rounded bg-[#0a0a0c] border border-zinc-800/80 text-zinc-500 font-mono text-xs space-y-1">
                <div>No pulse wave captured yet.</div>
                <div className="text-[10px] text-zinc-600">
                  Click "Acquire Biometric PPG" to record clean heartbeats from the sensor.
                </div>
              </div>
            )}
          </div>

          {/* Scientific Disclaimer (Requirement 7) */}
          <div className="p-3.5 rounded-lg bg-amber-950/20 border border-amber-900/50 text-[11px] font-mono text-amber-300/90 space-y-1.5">
            <div className="font-semibold uppercase text-[10px] text-amber-400 flex items-center space-x-1.5">
              <span>Scientific Biometric Protocol Note (Requirement 7)</span>
            </div>
            <p className="leading-relaxed text-zinc-400">
              Raw HW-827 Pulse Sensor waveform enrollment stores raw 10-bit analog telemetry into the trusted database. Two-person cross-identification or 1:N biometric recognition is not claimed until independent cross-session matching algorithms are systematically evaluated across separate recordings.
            </p>
          </div>

          {/* Security Information Footnote */}
          <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800/80 text-[11px] font-mono text-zinc-500 space-y-1">
            <div className="text-zinc-400 font-semibold uppercase text-[10px]">Security Architecture</div>
            <div>â€¢ Identity is verified via cryptographic token; client-supplied user IDs are never trusted blindly.</div>
            <div>â€¢ Sensitive raw biometric arrays are revoked from public client access.</div>
            <div>â€¢ Supabase service-role secret keys are confined strictly to trusted backend operations.</div>
          </div>

        </div>

      </div>

    </div>
  );
}

