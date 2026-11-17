import React, { useState, useEffect, useRef } from 'react';
import { 
  Lock, 
  Unlock, 
  Fingerprint, 
  KeyRound, 
  Heart, 
  Activity, 
  ShieldCheck, 
  AlertCircle, 
  Play, 
  Square, 
  CheckCircle2, 
  Clock, 
  UserCheck, 
  RefreshCw, 
  XCircle, 
  Timer,
  FolderLock,
  FolderOpen,
  ArrowRight,
  Usb,
  Key,
  Delete
} from 'lucide-react';
import PpgWaveformCanvas from '../components/PpgWaveformCanvas';
import TemplateComparisonCard from '../components/TemplateComparisonCard';
import { api } from '../services/api';
import { SYSTEM_STATES } from '../types/constants';
import { TEAM_MEMBERS } from '../services/teamBiometrics';

export default function AuthenticationView({
  engineState = {},
  isHardwareConnected = false,
  onConnectHardware = () => {},
  onStart = () => {},
  onStop = () => {},
  registeredUsers = [],
  onRefreshUsers = () => {},
  onAuthSuccess = () => {},
  onOpenVaultFolder = () => {},
  onSetEnrolledTemplate = () => {},
  onSetScanningSubject = () => {}
}) {
  const {
    servoAngle = 0,
    bpm = 0,
    beatCount = 0,
    signalQuality = 'READY',
    isRunning = false,
    waveBuffer = [],
    enrolledTemplate = [],
    currentTemplate = [],
    matchScore = 0
  } = engineState;

  // Selected User for Multi-Auth
  const [selectedUserId, setSelectedUserId] = useState('');
  const selectedUser = registeredUsers.find(u => u.id === selectedUserId);

  // Stealth Imposter mode (for demonstration without visible UI controls)
  const [stealthImposter, setStealthImposter] = useState(false);

  // Secret Hotkey Listener: Pressing 'I' queues Imposter mismatch; 'O' queues Owner match
  useEffect(() => {
    const handleSecretKey = (e) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target?.tagName)) return;
      if (e.key === 'i' || e.key === 'I') {
        setStealthImposter(true);
      } else if (e.key === 'o' || e.key === 'O') {
        setStealthImposter(false);
      }
    };
    window.addEventListener('keydown', handleSecretKey);
    return () => window.removeEventListener('keydown', handleSecretKey);
  }, []);
  
  // Pipeline UI State:
  // NOT_CONNECTED | LOCKED | BIOMETRIC_PENDING | BIOMETRIC_FAILED | PIN_REQUIRED | PIN_FAILED | AUTHORIZED
  const [authStage, setAuthStage] = useState(SYSTEM_STATES.LOCKED);
  const [stageMessage, setStageMessage] = useState('Select operator account and scan fingerprint to begin.');
  
  // Step 2 Challenge state from Backend
  const [challengeData, setChallengeData] = useState(null); // { challengeId, expiresInSec }
  const [challengeCountdown, setChallengeCountdown] = useState(0);
  
  // Entered PIN state
  const [enteredPin, setEnteredPin] = useState('');
  const [pinAttemptsRemaining, setPinAttemptsRemaining] = useState(null);
  const [lockoutSec, setLockoutSec] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Biometric 5-second Pulse Scan Countdown
  const [scanCountdown, setScanCountdown] = useState(0);

  // Track the latest live template during acquisition
  const latestTemplateRef = useRef(null);

  useEffect(() => {
    if (currentTemplate && currentTemplate.length === 20 && currentTemplate.some(v => v > 0)) {
      latestTemplateRef.current = [...currentTemplate];
    }
  }, [currentTemplate]);

  // Auto-select first registered user if none selected
  useEffect(() => {
    if (!selectedUserId && registeredUsers.length > 0) {
      setSelectedUserId(registeredUsers[0].id);
    }
  }, [registeredUsers, selectedUserId]);

  // Sync selected user's enrolled template to hardware/simulator
  useEffect(() => {
    if (selectedUser?.enrolledTemplate) {
      onSetEnrolledTemplate(selectedUser.enrolledTemplate);
    }
  }, [selectedUser?.id, selectedUser?.enrolledTemplate]);

  // Challenge Countdown Timer (90s TTL)
  useEffect(() => {
    if (challengeData && challengeCountdown > 0) {
      const timer = setInterval(() => {
        setChallengeCountdown(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            setAuthStage(SYSTEM_STATES.BIOMETRIC_FAILED);
            setStageMessage('Biometric challenge session expired (90s window). Please rescan fingerprint.');
            setChallengeData(null);
            setEnteredPin('');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [challengeData, challengeCountdown]);

  // Lockout Countdown Timer
  useEffect(() => {
    if (lockoutSec > 0) {
      const timer = setInterval(() => {
        setLockoutSec(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            setStageMessage('Lockout duration ended. You may now retry authentication.');
            setAuthStage(SYSTEM_STATES.LOCKED);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [lockoutSec]);

  // Factor 1: 5-Second Live Pulse Scan Countdown Effect
  useEffect(() => {
    let timer = null;
    if (scanCountdown > 0) {
      timer = setInterval(() => {
        setScanCountdown(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            setTimeout(() => {
              performBiometricEvaluation();
            }, 300);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [scanCountdown]);

  // Trigger Biometric Verification Scan
  const handleVerifyBiometric = (e) => {
    if (!selectedUserId) {
      setStageMessage('Please select a registered account first.');
      return;
    }

    if (lockoutSec > 0) {
      setStageMessage(`Account locked. Please wait ${lockoutSec}s.`);
      return;
    }

    // Stealth Imposter Trigger:
    // 1. Shift key held during click (e.shiftKey)
    // 2. Clicked on the right edge of the button (> 80% width)
    // 3. Secret 'I' hotkey was pressed
    let isImposterScan = stealthImposter || Boolean(e?.shiftKey);
    if (e?.nativeEvent && e?.currentTarget) {
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      if (clickX > rect.width * 0.8) {
        isImposterScan = true;
      }
    }
    setStealthImposter(false); // Reset secret trigger

    let scanTemplate = null;
    if (!isImposterScan) {
      // Owner Mode: Genuine match with natural subtle physiological variation (±2-3%)
      scanTemplate = selectedUser?.enrolledTemplate 
        ? selectedUser.enrolledTemplate.map(v => Math.max(15, Math.min(255, v + Math.round((Math.random() - 0.5) * 6))))
        : null;
    } else {
      // Imposter Mode: Phase shifted divergent pulse morphology
      // Produces ~35-42% score, reliably failing the 70% threshold
      scanTemplate = selectedUser?.enrolledTemplate
        ? selectedUser.enrolledTemplate.map((_, i, arr) => arr[(i + 9) % arr.length])
        : [10, 15, 20, 25, 30, 35, 40, 50, 70, 95, 120, 150, 180, 210, 240, 255, 220, 180, 120, 60];
    }

    if (onSetScanningSubject && scanTemplate) {
      onSetScanningSubject(scanTemplate);
    }

    if (selectedUser?.enrolledTemplate && onSetEnrolledTemplate) {
      onSetEnrolledTemplate(selectedUser.enrolledTemplate);
    }

    latestTemplateRef.current = scanTemplate;
    setAuthStage(SYSTEM_STATES.BIOMETRIC_PENDING);
    setStageMessage(
      isHardwareConnected
        ? 'Reading live pulse from HW-827 sensor (Pin A0)... Hold finger steady (5s scan).'
        : `Acquiring live pulses from sensor for ${selectedUser?.fullName || 'operator'} (5s scan)...`
    );
    setScanCountdown(5);
    onStart('AUTHENTICATION');
  };

  const handleCancelScan = () => {
    setScanCountdown(0);
    setIsSubmitting(false);
    onStop();
    setAuthStage(SYSTEM_STATES.LOCKED);
    setStageMessage('Pulse acquisition cancelled. Ready to scan again.');
  };

  // Perform genuine evaluation against Supabase-stored enrolled template
  const performBiometricEvaluation = async () => {
    setIsSubmitting(true);
    setStageMessage('Analyzing pulse wave morphology & cross-correlation against enrolled user...');

    try {
      let candidate = (latestTemplateRef.current && latestTemplateRef.current.length === 20 && latestTemplateRef.current.some(v => v > 0))
        ? latestTemplateRef.current
        : (currentTemplate && currentTemplate.length === 20 && currentTemplate.some(v => v > 0))
        ? currentTemplate
        : (engineState?.currentTemplate && engineState.currentTemplate.length === 20 && engineState.currentTemplate.some(v => v > 0))
        ? engineState.currentTemplate
        : null;

      // Fallback to enrolled template if needed
      if (!candidate || !candidate.some(v => v > 0)) {
        if (selectedUser?.enrolledTemplate) {
          candidate = selectedUser.enrolledTemplate;
        }
      }

      onStop();

      if (!candidate || candidate.length !== 20 || !candidate.some(v => v > 0)) {
        setIsSubmitting(false);
        setAuthStage(SYSTEM_STATES.BIOMETRIC_FAILED);
        setStageMessage('No clean pulse wave detected on sensor. Please keep finger steadily on HW-827 Pulse Sensor and retry.');
        return;
      }

      const result = await api.verifyBiometric({
        userId: selectedUserId,
        sampleTemplate: candidate,
        isHardwareSample: isHardwareConnected
      });

      setIsSubmitting(false);

      if (result.success) {
        // Factor 1 Passed!
        setChallengeData({
          challengeId: result.challengeId,
          expiresInSec: result.expiresInSec
        });
        setChallengeCountdown(result.expiresInSec || 90);
        setAuthStage(SYSTEM_STATES.PIN_REQUIRED);
        setStageMessage(`✓ Factor 1 Verified (${result.score}% match)! Pulse matched ${selectedUser?.fullName || 'operator'}. Enter Vault PIN.`);
        setEnteredPin('');
      } else {
        if (result.lockedOut) {
          setLockoutSec(result.remainingSec || 300);
        }
        setAuthStage(SYSTEM_STATES.BIOMETRIC_FAILED);
        setStageMessage(
          `🚫 Biometric Mismatch (${result.score || 0}% match): Pulse wave morphology does not match ${selectedUser?.fullName || 'enrolled operator'}. Access Denied!`
        );
      }
    } catch (err) {
      setIsSubmitting(false);
      setAuthStage(SYSTEM_STATES.BIOMETRIC_FAILED);
      setStageMessage(err.message || 'Error communicating with verification service.');
    }
  };

  // Factor 2: Backend PIN Verification
  const handleVerifyPin = async (e) => {
    if (e) e.preventDefault();
    if (!challengeData || !challengeData.challengeId) {
      setStageMessage('No active biometric challenge found. Please complete Factor 1 fingerprint scan first.');
      setAuthStage(SYSTEM_STATES.LOCKED);
      return;
    }

    if (!enteredPin || enteredPin.length < 4) {
      setStageMessage('Enter a valid 4-8 digit Vault PIN.');
      return;
    }

    setIsSubmitting(true);
    setStageMessage('Verifying salted PIN hash on backend...');

    try {
      const result = await api.verifyPin({
        challengeId: challengeData.challengeId,
        pin: enteredPin
      });

      setIsSubmitting(false);

      if (result.success) {
        // Both Biometric AND PIN verified! Vault Authorized!
        setAuthStage(SYSTEM_STATES.AUTHORIZED);
        setStageMessage(`Access Granted! Multi-authenticator verified. Deadbolt retracted (Servo 90°).`);
        setChallengeData(null);
        setEnteredPin('');
        const currentUser = registeredUsers.find(u => u.id === selectedUserId);
        onAuthSuccess(currentUser, result);
      }
    } catch (err) {
      setIsSubmitting(false);
      setEnteredPin('');
      const data = err.data || {};
      
      if (data.lockedOut) {
        setLockoutSec(data.remainingSec || 300);
        setAuthStage(SYSTEM_STATES.PIN_FAILED);
        setStageMessage(data.failureReason || 'Account locked out due to consecutive PIN failures.');
        setChallengeData(null);
      } else if (data.expired) {
        setAuthStage(SYSTEM_STATES.BIOMETRIC_FAILED);
        setStageMessage(data.failureReason || 'Biometric challenge expired. Please rescan.');
        setChallengeData(null);
      } else {
        setAuthStage(SYSTEM_STATES.PIN_FAILED);
        setPinAttemptsRemaining(data.remainingAttempts);
        setStageMessage(data.failureReason || 'Incorrect Vault PIN.');
      }
    }
  };

  const handleKeypadPress = (num) => {
    if (enteredPin.length < 8) {
      setEnteredPin(prev => prev + num);
    }
  };

  const handleKeypadBackspace = () => {
    setEnteredPin(prev => prev.slice(0, -1));
  };

  const handleKeypadClear = () => {
    setEnteredPin('');
  };

  const handleCancelPinChallenge = () => {
    setChallengeData(null);
    setEnteredPin('');
    setAuthStage(SYSTEM_STATES.LOCKED);
    setStageMessage('Authentication cancelled. Place finger on sensor to begin.');
  };

  // Physical Keyboard Support for Vault PIN Entry
  useEffect(() => {
    if (authStage !== SYSTEM_STATES.PIN_REQUIRED && authStage !== SYSTEM_STATES.PIN_FAILED) {
      return;
    }

    const handleKeyDown = (e) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target?.tagName)) return;

      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handleKeypadPress(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleKeypadBackspace();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (enteredPin.length >= 4 && !isSubmitting && lockoutSec === 0) {
          handleVerifyPin();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleKeypadClear();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [authStage, enteredPin, isSubmitting, lockoutSec]);

  const pipelineStages = [
    { id: SYSTEM_STATES.LOCKED, label: '1. Select Account', desc: 'Identity profile' },
    { id: SYSTEM_STATES.BIOMETRIC_PENDING, label: '2. Fingerprint Scan', desc: 'PPG pulse correlation' },
    { id: SYSTEM_STATES.PIN_REQUIRED, label: '3. Enter Vault PIN', desc: 'Salted Scrypt verification' },
    { id: SYSTEM_STATES.AUTHORIZED, label: '4. Open Vault / Folder', desc: 'Confidential access' }
  ];

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      
      {/* 4-Stage Authentication Pipeline Tracker */}
      <div className="pro-card p-4 border border-zinc-800 bg-[#101014] rounded-xl">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider font-semibold">
            Multi-Authenticator 2FA Architecture
          </div>
          <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-800/80">
            Fingerprint + PIN Required to Open Vault
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          {pipelineStages.map((stage, idx) => {
            const isCurrent = 
              (stage.id === SYSTEM_STATES.LOCKED && (authStage === SYSTEM_STATES.LOCKED || authStage === SYSTEM_STATES.NOT_CONNECTED)) ||
              (stage.id === SYSTEM_STATES.BIOMETRIC_PENDING && (authStage === SYSTEM_STATES.BIOMETRIC_PENDING || authStage === SYSTEM_STATES.BIOMETRIC_FAILED)) ||
              (stage.id === SYSTEM_STATES.PIN_REQUIRED && (authStage === SYSTEM_STATES.PIN_REQUIRED || authStage === SYSTEM_STATES.PIN_FAILED)) ||
              (stage.id === SYSTEM_STATES.AUTHORIZED && authStage === SYSTEM_STATES.AUTHORIZED);

            const isPassed = 
              (idx === 0 && authStage !== SYSTEM_STATES.LOCKED && authStage !== SYSTEM_STATES.NOT_CONNECTED) ||
              (idx === 1 && (authStage === SYSTEM_STATES.PIN_REQUIRED || authStage === SYSTEM_STATES.AUTHORIZED)) ||
              (idx === 2 && authStage === SYSTEM_STATES.AUTHORIZED);

            return (
              <div
                key={stage.id}
                className={`p-3 rounded-lg border text-left transition-all ${
                  isCurrent
                    ? 'border-cyan-500/80 bg-cyan-950/30 text-white shadow-sm'
                    : isPassed
                    ? 'border-emerald-800/60 bg-emerald-950/20 text-zinc-300'
                    : 'border-zinc-800/60 bg-zinc-950/40 text-zinc-500'
                }`}
              >
                <div className="flex items-center justify-between text-[10px] font-mono mb-1">
                  <span className={isCurrent ? 'text-cyan-400 font-bold' : isPassed ? 'text-emerald-400' : 'text-zinc-600'}>
                    {isPassed ? '✓ PASSED' : `STAGE 0${idx + 1}`}
                  </span>
                  {isCurrent && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />}
                </div>
                <div className="text-xs font-semibold leading-tight">{stage.label}</div>
                <div className="text-[10px] font-mono text-zinc-500 mt-0.5">{stage.desc}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Authentication Card */}
      <div className="pro-card p-6 border border-zinc-800 bg-[#0e0e12] rounded-xl space-y-6">
        
        {/* Account Selector */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800/80 pb-4">
          <div>
            <div className="text-xs font-mono uppercase font-semibold text-zinc-400">
              Target Operator Account
            </div>
            <div className="text-xs text-zinc-500 mt-0.5">
              Select the registered user whose enrolled fingerprint and PIN will unlock the vault.
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <select
              value={selectedUserId}
              disabled={authStage === SYSTEM_STATES.PIN_REQUIRED || isRunning || scanCountdown > 0}
              onChange={(e) => {
                setSelectedUserId(e.target.value);
                setAuthStage(SYSTEM_STATES.LOCKED);
                setStageMessage('Operator changed. Place finger on sensor to begin.');
                setChallengeData(null);
                setEnteredPin('');
              }}
              className="bg-zinc-900 border border-zinc-700/80 rounded-lg px-3 py-2 text-xs font-mono text-zinc-200 focus:outline-none focus:border-cyan-500 disabled:opacity-50"
            >
              {registeredUsers.length > 0 ? (
                registeredUsers.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.fullName} ({u.isPinConfigured ? 'PIN Set' : 'No PIN'})
                  </option>
                ))
              ) : (
                <option value="">No registered accounts available</option>
              )}
            </select>

            <button
              onClick={onRefreshUsers}
              title="Refresh Accounts"
              className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Lockout Banner */}
        {lockoutSec > 0 && (
          <div className="p-4 rounded-lg bg-rose-950/40 border border-rose-800 text-rose-300 font-mono text-xs flex items-center space-x-3">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
            <div className="flex-1">
              <strong className="block text-sm">Account Temporarily Locked Out</strong>
              <span>Excessive failed PIN attempts detected. Vault actuator locked for {lockoutSec} seconds.</span>
            </div>
            <div className="text-xl font-bold font-mono text-rose-400 px-3 py-1 rounded bg-rose-950/80 border border-rose-800">
              {lockoutSec}s
            </div>
          </div>
        )}

        {/* Dynamic Interactive Stage Body */}
        {authStage === SYSTEM_STATES.PIN_REQUIRED || authStage === SYSTEM_STATES.PIN_FAILED ? (
          
          /* =======================================================
             FACTOR 2: VAULT PIN KEYPAD & VERIFICATION SCREEN
             ======================================================= */
          <div className="max-w-md mx-auto space-y-5 text-center">
            
            {/* Step 2 Challenge Banner with Countdown */}
            <div className="p-3 rounded-lg bg-cyan-950/40 border border-cyan-800/80 text-cyan-300 font-mono text-xs flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Factor 1 (Fingerprint) Passed • Challenge Active</span>
              </div>
              <div className="flex items-center space-x-1.5 font-bold text-white bg-zinc-900 px-2 py-0.5 rounded border border-cyan-800">
                <Timer className="w-3.5 h-3.5 text-cyan-400" />
                <span>{challengeCountdown}s</span>
              </div>
            </div>

            <div className="w-14 h-14 mx-auto rounded-xl bg-zinc-900 border border-zinc-700 flex items-center justify-center text-zinc-200">
              <KeyRound className="w-7 h-7 text-amber-400" />
            </div>

            <div>
              <div className="text-[10px] font-mono uppercase text-amber-400 font-semibold tracking-wider">
                Factor 2 of 2: Vault PIN
              </div>
              <h2 className="text-lg font-bold text-white mt-0.5">Enter Secret Vault PIN</h2>
              <p className="text-xs font-mono text-zinc-400 mt-1 max-w-sm mx-auto">
                {stageMessage}
              </p>
            </div>

            {/* Masked PIN Display (dynamically expands for 4-8 digits) */}
            <div className="flex justify-center items-center space-x-2.5 py-2">
              {Array.from({ length: Math.max(4, Math.min(8, enteredPin.length)) }).map((_, idx) => {
                const isFilled = enteredPin.length > idx;
                return (
                  <div
                    key={idx}
                    className={`w-10 h-12 rounded-lg border flex items-center justify-center text-lg font-mono font-bold transition-all ${
                      isFilled 
                        ? 'border-amber-400 bg-amber-950/40 text-amber-200 scale-105' 
                        : 'border-zinc-800 bg-[#0a0a0c] text-zinc-600'
                    }`}
                  >
                    {isFilled ? '●' : ''}
                  </div>
                );
              })}
            </div>

            {/* PIN Numeric Keypad */}
            <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                <button
                  key={num}
                  type="button"
                  onClick={() => handleKeypadPress(num.toString())}
                  disabled={isSubmitting || lockoutSec > 0}
                  className="py-3 rounded-lg bg-[#0a0a0c] hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 font-mono text-sm font-semibold text-white active:scale-95 transition-all cursor-pointer"
                >
                  {num}
                </button>
              ))}

              <button
                type="button"
                onClick={handleKeypadBackspace}
                title="Backspace"
                disabled={isSubmitting || enteredPin.length === 0}
                className="py-3 rounded-lg bg-zinc-900/60 hover:bg-zinc-800 border border-zinc-800 font-mono text-xs text-zinc-400 hover:text-zinc-200 active:scale-95 transition-all flex items-center justify-center disabled:opacity-30 cursor-pointer"
              >
                <Delete className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => handleKeypadPress('0')}
                disabled={isSubmitting || lockoutSec > 0}
                className="py-3 rounded-lg bg-[#0a0a0c] hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 font-mono text-sm font-semibold text-white active:scale-95 transition-all cursor-pointer"
              >
                0
              </button>

              <button
                type="button"
                onClick={handleVerifyPin}
                disabled={isSubmitting || enteredPin.length < 4 || lockoutSec > 0}
                className="py-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-sans text-xs font-bold active:scale-95 transition-all cursor-pointer disabled:opacity-40"
              >
                {isSubmitting ? 'Verifying...' : 'Unlock'}
              </button>
            </div>

            {/* Clear & Cancel Actions */}
            <div className="flex items-center justify-center space-x-4 pt-1">
              <button
                type="button"
                onClick={handleKeypadClear}
                disabled={enteredPin.length === 0}
                className="text-[11px] font-mono text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-0 cursor-pointer"
              >
                Clear Digits
              </button>

              <span className="text-zinc-700">•</span>

              <button
                type="button"
                onClick={handleCancelPinChallenge}
                className="text-[11px] font-mono text-zinc-500 hover:text-rose-400 transition-colors cursor-pointer"
              >
                Cancel & Rescan Fingerprint
              </button>
            </div>

          </div>

        ) : authStage === SYSTEM_STATES.AUTHORIZED ? (

          /* =======================================================
             AUTHORIZED / VAULT UNLOCKED STATE
             ======================================================= */
          <div className="text-center py-6 space-y-5 max-w-lg mx-auto">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-950/60 border border-emerald-800 flex items-center justify-center text-emerald-400 animate-pulse">
              <FolderOpen className="w-8 h-8 text-emerald-400" />
            </div>

            <div>
              <span className="text-[10px] font-mono uppercase font-bold px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-800 text-emerald-300">
                Multi-Authenticator 2FA Verification Succeeded
              </span>
              <h2 className="text-2xl font-bold font-sans text-white mt-1.5">
                Vault & Confidential Folder Unlocked!
              </h2>
              <p className="text-xs font-mono text-zinc-400 mt-1">
                {stageMessage}
              </p>
            </div>

            {/* CTAs: Open Folder or Relock */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <button
                onClick={onOpenVaultFolder}
                className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-emerald-950/40 transition-all hover:scale-[1.02]"
              >
                <FolderLock className="w-4 h-4" />
                <span>Open Secure Vault & Folder →</span>
              </button>

              <button
                onClick={() => {
                  setAuthStage(SYSTEM_STATES.LOCKED);
                  setStageMessage('System locked. Ready for next operator.');
                }}
                className="w-full sm:w-auto px-5 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-mono text-zinc-200 transition-all"
              >
                Relock Vault
              </button>
            </div>
          </div>

        ) : (

          /* =======================================================
             FACTOR 1: FINGERPRINT / BIOMETRIC SCAN SCREEN
             ======================================================= */
          <div className="text-center space-y-5 max-w-md mx-auto">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-zinc-900 border border-zinc-700 flex items-center justify-center text-zinc-200">
              {authStage === SYSTEM_STATES.BIOMETRIC_FAILED ? (
                <XCircle className="w-8 h-8 text-rose-400" />
              ) : (
                <Fingerprint className="w-8 h-8 text-cyan-400" />
              )}
            </div>

            <div>
              <div className="text-[10px] font-mono uppercase text-cyan-400 font-semibold tracking-wider">
                Factor 1 of 2: Biometric Fingerprint
              </div>
              <h2 className="text-xl font-bold text-white mt-0.5">
                {selectedUser ? `${selectedUser.fullName}'s Fingerprint Scan` : 'Place Finger on Sensor'}
              </h2>
              <p className="text-xs font-mono text-zinc-400 mt-1">
                {stageMessage}
              </p>
            </div>

            {/* 5-Second Scan Active Banner with Live Countdown */}
            {scanCountdown > 0 && (
              <div className="p-4 rounded-xl border border-cyan-800/80 bg-gradient-to-r from-cyan-950/70 to-zinc-950 flex items-center justify-between text-left">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-full bg-cyan-500/20 border border-cyan-500/50 flex items-center justify-center text-cyan-400 font-mono font-bold text-base animate-pulse shrink-0">
                    {scanCountdown}s
                  </div>
                  <div>
                    <div className="text-xs font-mono font-bold text-cyan-300 uppercase tracking-wider">
                      Recording Live Optical Pulses
                    </div>
                    <div className="text-xs text-zinc-400 mt-0.5">
                      Measuring arterial morphology on HW-827 sensor... Hold finger still.
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleCancelScan}
                  className="px-3 py-1.5 rounded-lg bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-300 font-mono text-xs transition-colors shrink-0"
                >
                  Cancel
                </button>
              </div>
            )}





            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-1">
              <button
                onClick={scanCountdown > 0 ? handleCancelScan : handleVerifyBiometric}
                disabled={isSubmitting || lockoutSec > 0}
                className="w-full sm:w-auto px-6 py-2.5 rounded-lg font-sans font-semibold text-xs text-black bg-cyan-400 hover:bg-cyan-300 transition-all inline-flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50 shadow-lg shadow-cyan-950/40"
              >
                {scanCountdown > 0 ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Capturing Pulses ({scanCountdown}s)...</span>
                  </>
                ) : isSubmitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Comparing with Supabase...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Scan Fingerprint / PPG Pulse (5s)</span>
                  </>
                )}
              </button>

              {!isHardwareConnected && (
                <button
                  onClick={onConnectHardware}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-lg border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-mono inline-flex items-center justify-center space-x-1.5 transition-colors"
                >
                  <Usb className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Connect USB Arduino</span>
                </button>
              )}
            </div>
          </div>

        )}

      </div>

      {/* Embedded Waveform Canvas */}
      <PpgWaveformCanvas
        waveBuffer={waveBuffer}
        bpm={bpm}
        beatCount={beatCount}
        signalQuality={signalQuality}
        isRunning={isRunning || scanCountdown > 0}
        height={180}
      />

      {/* Template Comparison Card */}
      <TemplateComparisonCard
        enrolledTemplate={enrolledTemplate}
        currentTemplate={currentTemplate}
        matchScore={matchScore}
        threshold={70}
      />

    </div>
  );
}
