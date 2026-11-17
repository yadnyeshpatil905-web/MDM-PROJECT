import React, { useState, useEffect } from 'react';
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
  EyeOff,
  ArrowRight,
  ArrowLeft,
  Key,
  FolderLock,
  Sparkles,
  Timer
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
  onUserRegistered = () => {},
  onNavigateToAuth = () => {}
}) {
  const {
    bpm = 0,
    beatCount = 0,
    signalQuality = 'READY',
    isRunning = false,
    waveBuffer = [],
    currentTemplate = [],
    rawRecording = null,
    latestRaw = 512,
    latestAc = 0,
    signalAmplitude = 0,
    progress = 0
  } = engineState || {};

  // Guided Wizard Step:
  // 1 = Enter User Details (Name, Email, Password, Vault PIN)
  // 2 = Biometric Pulse Capture (20s calibration)
  // 3 = Registration Complete
  const [wizardStep, setWizardStep] = useState(1);

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

  // 20-second Countdown Timer for Pulse Capture
  const [countdown, setCountdown] = useState(20);

  // Check if sensor has acquired valid 20-point template
  const isTemplateReady = Array.isArray(capturedTemplate) && 
    capturedTemplate.length === 20 &&
    capturedTemplate.some(v => v > 0);

  const activeTemplate = capturedTemplate;
  const activeRawRecording = capturedRawRecording || rawRecording;

  // Step 1 Validation -> Proceed to Step 2 (Pulse Capture)
  const handleProceedToPulseScan = (e) => {
    if (e) e.preventDefault();
    setStatusMessage('');

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

    if (formData.pinConfirm && formData.pin !== formData.pinConfirm) {
      setEnrollmentStatus('ERROR');
      setStatusMessage('Vault PIN and Confirmation PIN do not match.');
      return;
    }

    setEnrollmentStatus('IDLE');
    setWizardStep(2);
  };

  const handleCaptureTemplate = () => {
    setCapturedTemplate(null);
    setCapturedRawRecording(null);
    setCountdown(20);
    onStartEnrollment();
    setEnrollmentStatus('ENROLLING_SENSOR');
    setStatusMessage('Place finger on HW-827 Pulse Sensor (Pin A0). Recording 20-second biometric baseline...');
  };

  const handleCancelCapture = () => {
    onStopEnrollment();
    setEnrollmentStatus('IDLE');
    setStatusMessage('Biometric capture cancelled. Click button to restart.');
  };

  // 20s Countdown effect during ENROLLING_SENSOR
  useEffect(() => {
    let timer = null;
    if (enrollmentStatus === 'ENROLLING_SENSOR' || (wizardStep === 2 && isRunning)) {
      timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      setCountdown(20);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [enrollmentStatus, isRunning, wizardStep]);

  // Capture template once engine finishes 20s acquisition
  useEffect(() => {
    if (
      wizardStep === 2 && 
      (enrollmentStatus === 'ENROLLING_SENSOR' || isRunning) && 
      currentTemplate && 
      currentTemplate.length === 20 && 
      currentTemplate.some(v => v > 0) &&
      !isRunning
    ) {
      setCapturedTemplate([...currentTemplate]);
      if (rawRecording) {
        setCapturedRawRecording({ ...rawRecording });
      }
      setEnrollmentStatus('IDLE');
      setStatusMessage('✓ 20-second pulse morphology captured successfully! Ready to complete enrollment.');
    }
  }, [currentTemplate, rawRecording, enrollmentStatus, isRunning, wizardStep]);

  // Keypad numeric helper for PIN
  const handleKeypadPress = (digit) => {
    if (formData.pin.length < 8) {
      setFormData(prev => ({
        ...prev,
        pin: prev.pin + digit,
      }));
    }
  };

  const handleKeypadClear = () => {
    setFormData(prev => ({ ...prev, pin: '', pinConfirm: '' }));
  };

  const handleKeypadBackspace = () => {
    setFormData(prev => ({ ...prev, pin: prev.pin.slice(0, -1) }));
  };

  // Submit complete credentials (Form + Biometrics) to backend
  const handleFinalSubmit = async () => {
    setStatusMessage('');

    const finalTemplate = activeTemplate || currentTemplate;
    if (!finalTemplate || finalTemplate.length !== 20 || !finalTemplate.some(v => v > 0)) {
      setEnrollmentStatus('ERROR');
      setStatusMessage('20-second pulse capture required. Please acquire your pulse template before completing registration.');
      return;
    }

    try {
      setEnrollmentStatus('SUBMITTING');
      setStatusMessage('Registering operator credentials & storing 20-point pulse morphology in Supabase backend...');

      const response = await api.register({
        fullName: formData.fullName,
        email: formData.email,
        password: formData.password,
        pin: formData.pin,
        pinConfirm: formData.pinConfirm || formData.pin,
        templateData: finalTemplate,
        rawRecording: activeRawRecording
      });

      if (response.sessionToken) {
        sessionAuth.setToken(response.sessionToken);
      }

      setEnrollmentStatus('SUCCESS');
      setEnrolledUser(response);
      setWizardStep(3);
      setStatusMessage(`User ${response.fullName} successfully registered with Multi-Authenticator credentials!`);
      onUserRegistered({ ...response, templateData: finalTemplate });

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
    <div className="space-y-6 max-w-5xl mx-auto">
      
      {/* Header Banner */}
      <div className="pro-card p-5 border border-zinc-800 bg-[#101014] flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center space-x-3.5">
          <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-zinc-700 flex items-center justify-center text-zinc-200">
            <UserPlus className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-[10px] font-mono uppercase font-semibold text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/80">
                Multi-Authenticator Enrollment Wizard
              </span>
              <span className="text-xs font-mono text-zinc-500">Step 1: Account & PIN • Step 2: 20s Pulse Capture</span>
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight mt-0.5">
              Register Operator & Enroll Biometric Pulse
            </h1>
          </div>
        </div>

        {/* Arduino / Simulator Status */}
        <div className="flex items-center space-x-2 text-xs font-mono">
          <span className={`w-2 h-2 rounded-full ${isHardwareConnected ? 'bg-emerald-400 animate-pulse' : 'bg-cyan-400'}`} />
          <span className="text-zinc-400">
            {isHardwareConnected ? 'Arduino HW-827 Pulse Sensor Connected' : 'Simulated Sensor Mode Ready'}
          </span>
        </div>
      </div>

      {/* Sequential 2-Step Progress Indicator */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        {/* Step 1 Pill: Account Details & PIN */}
        <div 
          onClick={() => { if (wizardStep !== 3) setWizardStep(1); }}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            wizardStep === 1 
              ? 'border-cyan-500/80 bg-cyan-950/20 shadow-lg shadow-cyan-950/30' 
              : formData.fullName && formData.email && formData.pin
              ? 'border-emerald-800/80 bg-emerald-950/20'
              : 'border-zinc-800 bg-zinc-950 opacity-60'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-mono font-bold text-xs ${
                wizardStep === 1 
                  ? 'bg-cyan-500 text-black' 
                  : formData.fullName && formData.pin
                  ? 'bg-emerald-500 text-black' 
                  : 'bg-zinc-800 text-zinc-400'
              }`}>
                {formData.fullName && formData.pin ? '✓' : '1'}
              </div>
              <div>
                <div className="text-xs font-mono font-semibold uppercase tracking-wider text-cyan-400">
                  Step 1: Account & Credentials
                </div>
                <div className="text-sm font-bold text-white">
                  {formData.fullName ? `${formData.fullName} (PIN Set)` : 'Enter Name, Email & Password'}
                </div>
              </div>
            </div>
            <Key className={`w-5 h-5 ${formData.fullName && formData.pin ? 'text-emerald-400' : 'text-cyan-400'}`} />
          </div>
        </div>

        {/* Step 2 Pill: 20-Second Biometric Pulse Capture */}
        <div 
          onClick={() => { if (formData.fullName && formData.email && formData.pin && wizardStep !== 3) setWizardStep(2); }}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            wizardStep === 2 
              ? 'border-amber-500/80 bg-amber-950/20 shadow-lg shadow-amber-950/30' 
              : activeTemplate
              ? 'border-emerald-800/80 bg-emerald-950/20'
              : 'border-zinc-800 bg-zinc-950 opacity-60'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-mono font-bold text-xs ${
                wizardStep === 2 
                  ? 'bg-amber-500 text-black' 
                  : activeTemplate 
                  ? 'bg-emerald-500 text-black' 
                  : 'bg-zinc-800 text-zinc-400'
              }`}>
                {activeTemplate ? '✓' : '2'}
              </div>
              <div>
                <div className="text-xs font-mono font-semibold uppercase tracking-wider text-amber-400">
                  Step 2: 20s Pulse Acquisition
                </div>
                <div className="text-sm font-bold text-white">
                  {activeTemplate ? '20s Pulse Waveform Enrolled' : 'Record 20-Sec Pulse Waveform'}
                </div>
              </div>
            </div>
            <Fingerprint className={`w-5 h-5 ${activeTemplate ? 'text-emerald-400' : 'text-amber-400'}`} />
          </div>
        </div>

      </div>

      {/* Status Messages */}
      {statusMessage && (
        <div className={`p-3.5 rounded-lg border text-xs font-mono flex items-center space-x-2 ${
          enrollmentStatus === 'SUCCESS' ? 'bg-emerald-950/50 border-emerald-800 text-emerald-300' :
          enrollmentStatus === 'ERROR' ? 'bg-rose-950/50 border-rose-800 text-rose-300' :
          enrollmentStatus === 'ENROLLING_SENSOR' || isRunning ? 'bg-cyan-950/50 border-cyan-800 text-cyan-300 animate-pulse' :
          'bg-zinc-900 border-zinc-700 text-zinc-300'
        }`}>
          {enrollmentStatus === 'SUCCESS' ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> :
           enrollmentStatus === 'ERROR' ? <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" /> :
           <RefreshCw className="w-4 h-4 text-cyan-400 shrink-0 animate-spin" />}
          <span>{statusMessage}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STEP 1: OPERATOR DETAILS & VAULT PIN (FIRST)                             */}
      {/* ========================================================================= */}
      {wizardStep === 1 && (
        <div className="space-y-6">
          <form onSubmit={handleProceedToPulseScan} className="pro-card p-6 border border-zinc-800 bg-[#0e0e12] rounded-xl space-y-6">
            
            <div className="border-b border-zinc-800/80 pb-4">
              <div className="inline-flex items-center space-x-2 px-2.5 py-0.5 rounded bg-cyan-950/80 border border-cyan-800 text-cyan-300 text-[10px] font-mono uppercase font-semibold">
                <UserPlus className="w-3.5 h-3.5" />
                <span>Step 1 • Operator Identification & PIN</span>
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight mt-1">
                Enter Operator Credentials
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Provide the user details and secret vault PIN first before proceeding to 20-second biometric pulse calibration.
              </p>
            </div>

            {/* Form Fields Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Operator Details */}
              <div className="space-y-4">
                <div className="text-xs font-mono uppercase font-semibold text-zinc-400 tracking-wider">
                  Operator Identity
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Alex Morgan"
                    value={formData.fullName}
                    onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                    className="w-full bg-zinc-900 border border-zinc-700/80 rounded-lg p-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Email Address</label>
                  <input
                    type="email"
                    required
                    placeholder="e.g. operator@biolock.internal"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full bg-zinc-900 border border-zinc-700/80 rounded-lg p-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Account Password (8+ chars)</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      placeholder="Min 8 characters"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="w-full bg-zinc-900 border border-zinc-700/80 rounded-lg p-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Secure Vault PIN Configuration */}
              <div className="space-y-4">
                <div className="text-xs font-mono uppercase font-semibold text-amber-400 tracking-wider flex items-center justify-between">
                  <span>Vault PIN Configuration</span>
                  <span className="text-[10px] text-zinc-500">4 - 8 Numeric Digits</span>
                </div>

                {/* PIN Input with Mask & Keypad */}
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Secret Vault PIN</label>
                  <div className="relative">
                    <input
                      type={showPin ? 'text' : 'password'}
                      required
                      maxLength={8}
                      pattern="[0-9]{4,8}"
                      placeholder="Enter 4 to 8 digits"
                      value={formData.pin}
                      onChange={(e) => setFormData({ ...formData, pin: e.target.value.replace(/[^0-9]/g, '') })}
                      className="w-full bg-zinc-900 border border-zinc-700/80 rounded-lg p-2.5 text-sm font-mono tracking-widest text-center text-amber-300 placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPin(!showPin)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
                    >
                      {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Confirm Vault PIN</label>
                  <input
                    type={showPin ? 'text' : 'password'}
                    required
                    maxLength={8}
                    pattern="[0-9]{4,8}"
                    placeholder="Re-enter same digits"
                    value={formData.pinConfirm}
                    onChange={(e) => setFormData({ ...formData, pinConfirm: e.target.value.replace(/[^0-9]/g, '') })}
                    className="w-full bg-zinc-900 border border-zinc-700/80 rounded-lg p-2.5 text-sm font-mono tracking-widest text-center text-amber-300 placeholder-zinc-500 focus:outline-none focus:border-amber-500"
                  />
                </div>

                {/* On-Screen Numeric Keypad for fast PIN entry */}
                <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800 space-y-2">
                  <div className="text-[10px] font-mono text-zinc-500 uppercase text-center">Interactive Quick Keypad</div>
                  <div className="grid grid-cols-3 gap-1.5 max-w-[200px] mx-auto">
                    {['1','2','3','4','5','6','7','8','9'].map((digit) => (
                      <button
                        type="button"
                        key={digit}
                        onClick={() => handleKeypadPress(digit)}
                        className="py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white font-mono text-sm font-semibold transition-colors border border-zinc-800"
                      >
                        {digit}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={handleKeypadClear}
                      className="py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-rose-400 font-mono text-xs font-semibold transition-colors border border-zinc-800"
                    >
                      CLR
                    </button>
                    <button
                      type="button"
                      onClick={() => handleKeypadPress('0')}
                      className="py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white font-mono text-sm font-semibold transition-colors border border-zinc-800"
                    >
                      0
                    </button>
                    <button
                      type="button"
                      onClick={handleKeypadBackspace}
                      className="py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-amber-400 font-mono text-xs font-semibold transition-colors border border-zinc-800"
                    >
                      ⌫
                    </button>
                  </div>
                </div>

              </div>

            </div>

            {/* Step 1 Next Button */}
            <div className="pt-2 flex items-center justify-end space-x-4">
              <button
                type="submit"
                className="inline-flex items-center space-x-2 px-6 py-2.5 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-cyan-950/40 transition-all hover:scale-[1.02]"
              >
                <span>Continue to Step 2: 20s Pulse Capture</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

          </form>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STEP 2: 20-SECOND BIOMETRIC PULSE ACQUISITION (SECOND)                   */}
      {/* ========================================================================= */}
      {wizardStep === 2 && (
        <div className="space-y-6">
          <div className="pro-card p-6 border border-zinc-800 bg-[#0e0e12] rounded-xl space-y-5">
            
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
              <div>
                <div className="inline-flex items-center space-x-2 px-2.5 py-0.5 rounded bg-amber-950/80 border border-amber-800 text-amber-300 text-[10px] font-mono uppercase font-semibold">
                  <Fingerprint className="w-3.5 h-3.5" />
                  <span>Step 2 • 20-Second Biometric Pulse Calibration</span>
                </div>
                <h2 className="text-xl font-bold text-white tracking-tight mt-1">
                  Record Pulse for {formData.fullName || 'User'}
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Keep your finger placed steadily on the HW-827 Pulse Sensor (Pin A0). The acquisition takes exactly 20 seconds to establish your baseline.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center space-x-3">
                <button
                  type="button"
                  onClick={() => setWizardStep(1)}
                  className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-300 transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5 inline mr-1" />
                  <span>Edit Info</span>
                </button>

                {enrollmentStatus === 'ENROLLING_SENSOR' || isRunning ? (
                  <button
                    onClick={handleCancelCapture}
                    className="px-4 py-2 rounded-lg bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-300 font-semibold text-xs flex items-center space-x-1.5 transition-colors"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                    <span>Cancel ({countdown}s)</span>
                  </button>
                ) : (
                  <button
                    onClick={handleCaptureTemplate}
                    className="px-5 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs flex items-center space-x-2 shadow-lg shadow-amber-900/40 transition-all hover:scale-[1.02]"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>{activeTemplate ? 'Rescan 20s Pulse' : 'Start 20s Pulse Capture'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Countdown Banner during Capture */}
            {(enrollmentStatus === 'ENROLLING_SENSOR' || isRunning) && (
              <div className="p-4 rounded-xl border border-amber-800/80 bg-gradient-to-r from-amber-950/60 to-zinc-950 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-full bg-amber-500/20 border border-amber-500/50 flex items-center justify-center text-amber-400 font-mono font-bold text-base animate-pulse">
                    {countdown}
                  </div>
                  <div>
                    <div className="text-xs font-mono font-bold text-amber-300 uppercase tracking-wider">
                      20-Second Biometric Pulse Acquisition Active
                    </div>
                    <div className="text-xs text-zinc-400 mt-0.5">
                      Please keep your finger firmly on the HW-827 optical sensor. Time remaining: <strong className="text-amber-300">{countdown} seconds</strong>.
                    </div>
                  </div>
                </div>
                <div className="hidden sm:block text-right">
                  <div className="text-[10px] font-mono text-zinc-400 uppercase">Progress</div>
                  <div className="text-lg font-mono font-bold text-white">{Math.round(((20 - countdown) / 20) * 100)}%</div>
                </div>
              </div>
            )}

            {/* Live Waveform Canvas */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
                <span className="flex items-center space-x-1.5">
                  <span className={`w-2 h-2 rounded-full ${isRunning || enrollmentStatus === 'ENROLLING_SENSOR' ? 'bg-amber-400 animate-pulse' : 'bg-zinc-600'}`} />
                  <span>HW-827 Pulse Sensor Optical Oscilloscope (60 FPS)</span>
                </span>
                <span>{bpm > 0 ? `${bpm} BPM` : 'Baseline: 512 ADC'}</span>
              </div>
              <div className="h-44 rounded-lg overflow-hidden border border-zinc-800 bg-black">
                <PpgWaveformCanvas waveBuffer={waveBuffer} isRunning={isRunning || enrollmentStatus === 'ENROLLING_SENSOR'} height={176} />
              </div>
            </div>

            {/* Sensor Telemetry Badges */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
              <div className="p-3 rounded-lg border border-zinc-800/80 bg-zinc-950">
                <span className="text-[10px] text-zinc-500 uppercase">Signal Quality</span>
                <div className="text-white font-semibold mt-0.5">{signalQuality}</div>
              </div>
              <div className="p-3 rounded-lg border border-zinc-800/80 bg-zinc-950">
                <span className="text-[10px] text-zinc-500 uppercase">Beats Captured</span>
                <div className="text-cyan-400 font-semibold mt-0.5">{beatCount} Beats</div>
              </div>
              <div className="p-3 rounded-lg border border-zinc-800/80 bg-zinc-950">
                <span className="text-[10px] text-zinc-500 uppercase">ADC AC Amplitude</span>
                <div className="text-white font-semibold mt-0.5">{signalAmplitude} mV</div>
              </div>
              <div className="p-3 rounded-lg border border-zinc-800/80 bg-zinc-950">
                <span className="text-[10px] text-zinc-500 uppercase">Acquisition Window</span>
                <div className="text-amber-400 font-semibold mt-0.5">20.0 Seconds</div>
              </div>
            </div>

            {/* If template is already captured, show review card and Final Submit CTA */}
            {activeTemplate && (
              <div className="p-5 rounded-xl border border-emerald-800/70 bg-gradient-to-r from-emerald-950/40 via-zinc-900 to-zinc-950 space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-lg bg-emerald-950 border border-emerald-700 flex items-center justify-center text-emerald-400">
                      <CheckCircle2 className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                        <span>20-Second Pulse Waveform Enrolled!</span>
                        <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950 px-2 py-0.5 rounded border border-emerald-800">
                          20-Point Vector Ready
                        </span>
                      </h3>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        Biometric signature ready for operator <strong>{formData.fullName}</strong>.
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={handleFinalSubmit}
                    disabled={enrollmentStatus === 'SUBMITTING'}
                    className="inline-flex items-center space-x-2 px-6 py-3 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-emerald-950/40 transition-all hover:scale-[1.02] disabled:opacity-50"
                  >
                    {enrollmentStatus === 'SUBMITTING' ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Enrolling...</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4" />
                        <span>Complete Registration</span>
                      </>
                    )}
                  </button>
                </div>

                {/* 20-Point Template Visualization */}
                <div className="pt-2">
                  <TemplateComparisonCard
                    enrolledTemplate={activeTemplate}
                    currentTemplate={activeTemplate}
                    matchScore={100}
                  />
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STEP 3: ENROLLMENT SUCCESS & DIRECT VAULT ACCESS                          */}
      {/* ========================================================================= */}
      {wizardStep === 3 && (
        <div className="pro-card p-8 border border-emerald-800/80 bg-[#0e120e] rounded-2xl text-center space-y-6 max-w-2xl mx-auto shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-emerald-950 border border-emerald-700/80 mx-auto flex items-center justify-center text-emerald-400 shadow-inner">
            <ShieldCheck className="w-10 h-10 text-emerald-400" />
          </div>

          <div>
            <span className="text-[10px] font-mono uppercase px-2.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold">
              Multi-Authenticator Enrollment Completed
            </span>
            <h2 className="text-2xl font-bold text-white tracking-tight mt-2">
              User Credential Successfully Activated
            </h2>
            <p className="text-xs text-zinc-400 max-w-md mx-auto mt-2">
              Operator <strong className="text-emerald-300">{enrolledUser?.fullName}</strong> is now configured with two-factor biometric pulse and salted vault PIN protection.
            </p>
          </div>

          {/* Credential Card */}
          <div className="p-4 rounded-xl border border-zinc-800 bg-black/60 text-left space-y-2 text-xs font-mono">
            <div className="flex justify-between border-b border-zinc-800/80 pb-2">
              <span className="text-zinc-500">Operator ID:</span>
              <span className="text-zinc-200">{enrolledUser?.userId}</span>
            </div>
            <div className="flex justify-between border-b border-zinc-800/80 pb-2">
              <span className="text-zinc-500">Factor 1 (Biometric):</span>
              <span className="text-cyan-400 font-semibold">HW-827 20s Baseline & 20-Point Waveform Enrolled</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Factor 2 (PIN):</span>
              <span className="text-amber-400 font-semibold">Salted Scrypt Hash Configured</span>
            </div>
          </div>

          {/* Action CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              onClick={onNavigateToAuth}
              className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-cyan-950/40 transition-all hover:scale-[1.02]"
            >
              <FolderLock className="w-4 h-4" />
              <span>Open Vault / Folder with 2FA</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              onClick={() => {
                setWizardStep(1);
                setEnrolledUser(null);
                setCapturedTemplate(null);
              }}
              className="w-full sm:w-auto px-5 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-300 transition-colors"
            >
              Enroll Another Operator
            </button>
          </div>

        </div>
      )}

    </div>
  );
}
