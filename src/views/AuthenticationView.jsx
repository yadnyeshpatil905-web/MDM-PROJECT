import React, { useState, useEffect } from 'react';
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
  Timer
} from 'lucide-react';
import PpgWaveformCanvas from '../components/PpgWaveformCanvas';
import TemplateComparisonCard from '../components/TemplateComparisonCard';
import { api } from '../services/api';
import { SYSTEM_STATES } from '../types/constants';

export default function AuthenticationView({
  engineState = {},
  isHardwareConnected = false,
  onConnectHardware = () => {},
  onStart = () => {},
  onStop = () => {},
  registeredUsers = [],
  onRefreshUsers = () => {},
  onAuthSuccess = () => {}
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

  // Selected User for Two-Step Auth
  const [selectedUserId, setSelectedUserId] = useState('');
  
  // Pipeline UI State:
  // NOT_CONNECTED | LOCKED | BIOMETRIC_PENDING | BIOMETRIC_FAILED | PIN_REQUIRED | PIN_FAILED | AUTHORIZED
  const [authStage, setAuthStage] = useState(SYSTEM_STATES.LOCKED);
  const [stageMessage, setStageMessage] = useState('Select operator account to begin authentication.');
  
  // Step 2 Challenge state from Backend
  const [challengeData, setChallengeData] = useState(null); // { challengeId, expiresInSec, expiresAt }
  const [challengeCountdown, setChallengeCountdown] = useState(0);
  
  // Entered PIN state
  const [enteredPin, setEnteredPin] = useState('');
  const [pinAttemptsRemaining, setPinAttemptsRemaining] = useState(null);
  const [lockoutSec, setLockoutSec] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auto-select first registered user if none selected
  useEffect(() => {
    if (!selectedUserId && registeredUsers.length > 0) {
      setSelectedUserId(registeredUsers[0].id);
    }
  }, [registeredUsers, selectedUserId]);

  // Challenge Countdown Timer (90s TTL)
  useEffect(() => {
    if (challengeData && challengeCountdown > 0) {
      const timer = setInterval(() => {
        setChallengeCountdown(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            // Challenge expired!
            setAuthStage(SYSTEM_STATES.BIOMETRIC_FAILED);
            setStageMessage('Biometric challenge expired (90s window elapsed). Please scan again.');
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
            setStageMessage('Lockout duration ended. You may now retry biometric scan.');
            setAuthStage(SYSTEM_STATES.LOCKED);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [lockoutSec]);

  // When physical scan finishes or returns a template:
  // Step 1: Backend Biometric Verification
  const handleVerifyBiometric = async () => {
    if (!selectedUserId) {
      setStageMessage('Please select a registered account first.');
      return;
    }

    if (lockoutSec > 0) {
      setStageMessage(`Account locked. Please wait ${lockoutSec}s.`);
      return;
    }

    setAuthStage(SYSTEM_STATES.BIOMETRIC_PENDING);
    setStageMessage('Verifying pulse morphology against account enrolled template...');
    setIsSubmitting(true);

    try {
      // Use current live template from sensor or simulator
      const sample = (currentTemplate && currentTemplate.length === 20 && currentTemplate.some(v => v > 0))
        ? currentTemplate
        : enrolledTemplate; // fallback if simulated

      const result = await api.verifyBiometric({
        userId: selectedUserId,
        sampleTemplate: sample,
        isHardwareSample: isHardwareConnected
      });

      setIsSubmitting(false);

      if (result.success) {
        // Step 1 Passed! Challenge created. Transition to Step 2 PIN
        setChallengeData({
          challengeId: result.challengeId,
          expiresInSec: result.expiresInSec
        });
        setChallengeCountdown(result.expiresInSec || 90);
        setAuthStage(SYSTEM_STATES.PIN_REQUIRED);
        setStageMessage(`Biometric match verified (${result.score}% >= ${result.threshold}%). Enter Vault PIN to unlock.`);
        setEnteredPin('');
      } else {
        // Biometric Denied
        if (result.lockedOut) {
          setLockoutSec(result.remainingSec || 300);
        }
        setAuthStage(SYSTEM_STATES.BIOMETRIC_FAILED);
        setStageMessage(result.failureReason || 'Biometric verification failed.');
      }
    } catch (err) {
      setIsSubmitting(false);
      setAuthStage(SYSTEM_STATES.BIOMETRIC_FAILED);
      setStageMessage(err.message || 'Error communicating with backend verification service.');
    }
  };

  // Step 2: Backend PIN Verification
  const handleVerifyPin = async (e) => {
    if (e) e.preventDefault();
    if (!challengeData || !challengeData.challengeId) {
      setStageMessage('No active biometric challenge found. Please complete Step 1 first.');
      setAuthStage(SYSTEM_STATES.LOCKED);
      return;
    }

    if (!enteredPin || enteredPin.length < 4) {
      setStageMessage('Enter a valid 4-8 digit Vault PIN.');
      return;
    }

    setIsSubmitting(true);
    setStageMessage('Verifying salted PIN hash on trusted backend...');

    try {
      const result = await api.verifyPin({
        challengeId: challengeData.challengeId,
        pin: enteredPin
      });

      setIsSubmitting(false);

      if (result.success) {
        // Both Biometric AND PIN verified! Vault Authorized
        setAuthStage(SYSTEM_STATES.AUTHORIZED);
        setStageMessage(`Access Granted! Vault deadbolt unlocked (Servo 90Â°). Auto-relock in ${result.autoLockInSeconds || 5}s.`);
        setChallengeData(null);
        setEnteredPin('');
        onAuthSuccess();
      }
    } catch (err) {
      setIsSubmitting(false);
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

  const handleKeypadClear = () => {
    setEnteredPin('');
  };

  const selectedUser = registeredUsers.find(u => u.id === selectedUserId);

  const pipelineStages = [
    { id: SYSTEM_STATES.LOCKED, label: '1. Account Identity', desc: 'Select registered user' },
    { id: SYSTEM_STATES.BIOMETRIC_PENDING, label: '2. Live Biometric', desc: 'Optical PPG correlation' },
    { id: SYSTEM_STATES.PIN_REQUIRED, label: '3. Vault PIN Screen', desc: 'Salted Scrypt verification' },
    { id: SYSTEM_STATES.AUTHORIZED, label: '4. Vault Open', desc: 'Servo unlocked 90Â°' }
  ];

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      
      {/* 4-Stage Authentication Pipeline Tracker */}
      <div className="pro-card p-4 border border-zinc-800 bg-[#101014]">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider font-semibold">
            Two-Step Vault Authentication Architecture
          </div>
          <span className="text-[10px] font-mono text-zinc-400 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
            Biometric Alone Never Opens Vault
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
              (idx === 0 && authStage !== SYSTEM_STATES.LOCKED) ||
              (idx === 1 && (authStage === SYSTEM_STATES.PIN_REQUIRED || authStage === SYSTEM_STATES.PIN_FAILED || authStage === SYSTEM_STATES.AUTHORIZED)) ||
              (idx === 2 && authStage === SYSTEM_STATES.AUTHORIZED);

            return (
              <div 
                key={stage.id}
                className={`p-3 rounded-lg border transition-all ${
                  isCurrent 
                    ? 'bg-zinc-800 border-cyan-500/80 text-white shadow-sm' 
                    : isPassed
                    ? 'bg-[#0d0d10] border-emerald-900/60 text-zinc-300'
                    : 'bg-[#0a0a0c] border-zinc-900 text-zinc-600'
                }`}
              >
                <div className="flex items-center space-x-1.5 text-xs font-semibold">
                  {isPassed ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  ) : isCurrent ? (
                    <span className="w-2 h-2 rounded-full bg-cyan-400 shrink-0" />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-zinc-700 shrink-0" />
                  )}
                  <span className="truncate">{stage.label}</span>
                </div>
                <div className="text-[10px] font-mono text-zinc-500 mt-1 truncate">
                  {stage.desc}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Authentication Card */}
      <div className="pro-card p-6 border border-zinc-800 bg-[#101014] space-y-6">
        
        {/* Step 1: User Selection Header */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 pb-5 border-b border-zinc-800/80">
          <div className="flex items-center space-x-3 w-full md:w-auto">
            <div className="w-10 h-10 rounded-lg bg-zinc-900 border border-zinc-700 flex items-center justify-center text-zinc-200">
              <UserCheck className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <div className="text-[10px] font-mono uppercase text-zinc-500">Step 1: Account Selection</div>
              <h3 className="font-semibold text-sm text-white">Target Registered Identity</h3>
            </div>
          </div>

          <div className="flex items-center space-x-3 w-full md:w-auto">
            <select
              value={selectedUserId}
              onChange={(e) => {
                setSelectedUserId(e.target.value);
                setAuthStage(SYSTEM_STATES.LOCKED);
                setChallengeData(null);
                setEnteredPin('');
              }}
              disabled={authStage === SYSTEM_STATES.PIN_REQUIRED || authStage === SYSTEM_STATES.AUTHORIZED}
              className="bg-[#0a0a0c] border border-zinc-700 rounded-lg px-3.5 py-2 text-xs font-mono text-white focus:outline-none focus:border-cyan-500 flex-1 md:w-64"
            >
              {registeredUsers.length > 0 ? (
                registeredUsers.map(user => (
                  <option key={user.id} value={user.id}>
                    {user.fullName} ({user.email})
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
             STEP 2: VAULT PIN KEYPAD & VERIFICATION SCREEN
             ======================================================= */
          <div className="max-w-md mx-auto space-y-5 text-center">
            
            {/* Step 2 Challenge Banner with Countdown */}
            <div className="p-3 rounded-lg bg-cyan-950/40 border border-cyan-800/80 text-cyan-300 font-mono text-xs flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <ShieldCheck className="w-4 h-4 text-cyan-400" />
                <span>Biometric Passed â€¢ Step 2 Challenge Active</span>
              </div>
              <div className="flex items-center space-x-1.5 font-bold text-white bg-zinc-900 px-2 py-0.5 rounded border border-cyan-800">
                <Timer className="w-3.5 h-3.5 text-cyan-400" />
                <span>{challengeCountdown}s</span>
              </div>
            </div>

            <div className="w-14 h-14 mx-auto rounded-xl bg-zinc-900 border border-zinc-700 flex items-center justify-center text-zinc-200">
              <KeyRound className="w-7 h-7 text-cyan-400" />
            </div>

            <div>
              <h2 className="text-lg font-bold text-white">Enter Vault Security PIN</h2>
              <p className="text-xs font-mono text-zinc-400 mt-1 max-w-sm mx-auto">
                {stageMessage}
              </p>
            </div>

            {/* Masked PIN Display */}
            <div className="flex justify-center items-center space-x-3 py-2">
              {[0, 1, 2, 3].map((idx) => {
                const isFilled = enteredPin.length > idx;
                return (
                  <div
                    key={idx}
                    className={`w-10 h-12 rounded-lg border flex items-center justify-center text-lg font-mono font-bold transition-all ${
                      isFilled 
                        ? 'border-cyan-400 bg-cyan-950/40 text-cyan-200 scale-105' 
                        : 'border-zinc-800 bg-[#0a0a0c] text-zinc-600'
                    }`}
                  >
                    {isFilled ? 'â€¢' : ''}
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
                onClick={handleKeypadClear}
                className="py-3 rounded-lg bg-zinc-900/60 hover:bg-zinc-800 border border-zinc-800 font-mono text-xs text-zinc-400 active:scale-95 transition-all"
              >
                Clear
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
                className="py-3 rounded-lg bg-cyan-400 hover:bg-cyan-300 text-black font-sans text-xs font-bold active:scale-95 transition-all cursor-pointer disabled:opacity-40"
              >
                {isSubmitting ? 'Verifying...' : 'Unlock'}
              </button>
            </div>

            <div className="text-[11px] font-mono text-zinc-500 pt-2">
              Failure to enter valid PIN within {challengeCountdown}s will cancel biometric authorization.
            </div>

          </div>

        ) : authStage === SYSTEM_STATES.AUTHORIZED ? (

          /* =======================================================
             AUTHORIZED / VAULT UNLOCKED STATE
             ======================================================= */
          <div className="text-center py-8 space-y-4 max-w-md mx-auto">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-950/60 border border-emerald-800 flex items-center justify-center text-emerald-400 animate-pulse">
              <Unlock className="w-8 h-8" />
            </div>

            <div>
              <span className="text-[10px] font-mono uppercase font-bold px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-800 text-emerald-300">
                Two-Step Verification Authorized
              </span>
              <h2 className="text-2xl font-bold font-sans text-white mt-1.5">
                Vault Unlocked (Servo 90Â°)
              </h2>
              <p className="text-xs font-mono text-zinc-400 mt-1">
                {stageMessage}
              </p>
            </div>

            <button
              onClick={() => {
                setAuthStage(SYSTEM_STATES.LOCKED);
                setStageMessage('System locked. Ready for next operator.');
              }}
              className="px-5 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-mono text-zinc-200 transition-all inline-flex items-center space-x-2"
            >
              <span>Relock & Return to Standby</span>
            </button>
          </div>

        ) : (

          /* =======================================================
             STEP 1: BIOMETRIC SCAN / STANDBY SCREEN
             ======================================================= */
          <div className="text-center space-y-4 max-w-md mx-auto">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-zinc-900 border border-zinc-700 flex items-center justify-center text-zinc-200">
              {authStage === SYSTEM_STATES.BIOMETRIC_FAILED ? (
                <XCircle className="w-8 h-8 text-rose-400" />
              ) : (
                <Fingerprint className="w-8 h-8 text-cyan-400" />
              )}
            </div>

            <div>
              <div className="text-[10px] font-mono uppercase text-zinc-500 font-semibold">
                Step 1 of 2: Biometric Factor
              </div>
              <h2 className="text-xl font-bold text-white mt-0.5">
                {selectedUser ? `${selectedUser.fullName}'s Biometric Scan` : 'Place Finger on HW-827 Pulse Sensor'}
              </h2>
              <p className="text-xs font-mono text-zinc-400 mt-1">
                {stageMessage}
              </p>
            </div>

            <div className="flex justify-center space-x-3 pt-2">
              {!isHardwareConnected ? (
                <button
                  onClick={onConnectHardware}
                  className="px-5 py-2.5 rounded-lg font-sans font-semibold text-xs text-black bg-white hover:bg-zinc-200 transition-all cursor-pointer"
                >
                  Connect Arduino UNO (USB)
                </button>
              ) : (
                <button
                  onClick={isRunning ? onStop : () => {
                    onStart();
                    handleVerifyBiometric();
                  }}
                  disabled={isSubmitting || lockoutSec > 0}
                  className="px-6 py-2.5 rounded-lg font-sans font-semibold text-xs text-black bg-white hover:bg-zinc-200 transition-all inline-flex items-center space-x-2 cursor-pointer disabled:opacity-50"
                >
                  {isRunning ? <Square className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                  <span>{isRunning ? 'Cancel Scan' : 'Start Biometric Scan'}</span>
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
        isRunning={isRunning}
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
