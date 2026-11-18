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
  Delete,
  Eye,
  EyeOff,
  Copy,
  Check,
  FileText,
  FileCode,
  FileSpreadsheet,
  Download,
  Plus,
  Trash2,
  Search,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import PpgWaveformCanvas from '../components/PpgWaveformCanvas';
import TemplateComparisonCard from '../components/TemplateComparisonCard';
import LCDDisplay from '../components/LCDDisplay';
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
  onLockVault = () => {},
  isVaultUnlocked = false,
  authenticatedUser = null,
  vaultSession = null,
  onOpenVaultFolder = () => {},
  onSetEnrolledTemplate = () => {},
  onSetScanningSubject = () => {},
  onSetTargetResult = () => {},
  onUpdateLcd = () => {},
  onSendSerial = () => {}
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
    matchScore = 0,
    lcdLine1 = 'PPG BIOMETRIC',
    lcdLine2 = 'READY - LOCKED'
  } = engineState;

  // Selected User for Multi-Auth
  const [selectedUserId, setSelectedUserId] = useState('');
  const selectedUser = registeredUsers.find(u => u.id === selectedUserId);

  // Stealth Imposter mode (Shift+Click, right-edge click, or hotkey 'I')
  const [stealthImposter, setStealthImposter] = useState(false);

  // Secret Hotkey Listener: 'I' for imposter rejection, 'O' for owner match
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
  // LOCKED | BIOMETRIC_PENDING | BIOMETRIC_FAILED | PIN_REQUIRED | PIN_FAILED | AUTHORIZED
  const [authStage, setAuthStage] = useState(isVaultUnlocked ? SYSTEM_STATES.AUTHORIZED : SYSTEM_STATES.LOCKED);
  const [stageMessage, setStageMessage] = useState('Select operator account and scan fingerprint to begin.');

  // Sync authStage with isVaultUnlocked prop
  useEffect(() => {
    if (isVaultUnlocked) {
      setAuthStage(SYSTEM_STATES.AUTHORIZED);
      setStageMessage('Multi-authenticator verified. Deadbolt retracted (Servo 90°).');
    } else if (authStage === SYSTEM_STATES.AUTHORIZED) {
      setAuthStage(SYSTEM_STATES.LOCKED);
      setStageMessage('Vault locked. Standby for fingerprint verification.');
    }
  }, [isVaultUnlocked]);

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

  // Advanced Technical Diagnostics toggle
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Decrypted Vault Files & Credentials State
  const [vaultFiles, setVaultFiles] = useState([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [activeFilePreview, setActiveFilePreview] = useState(null);
  const [copiedKey, setCopiedKey] = useState(null);
  const [visiblePasswords, setVisiblePasswords] = useState({});

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

  // Load Vault Files when unlocked
  const loadVaultFiles = async () => {
    setIsLoadingFiles(true);
    try {
      const res = await api.getVaultFiles();
      if (res && res.files) {
        setVaultFiles(res.files);
      }
    } catch (err) {
      console.warn('Failed to load vault files:', err.message);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  useEffect(() => {
    if (authStage === SYSTEM_STATES.AUTHORIZED || isVaultUnlocked) {
      loadVaultFiles();
    }
  }, [authStage, isVaultUnlocked]);

  // Challenge Countdown Timer (90s TTL)
  useEffect(() => {
    if (challengeData && challengeCountdown > 0) {
      const timer = setInterval(() => {
        setChallengeCountdown(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            setAuthStage(SYSTEM_STATES.BIOMETRIC_FAILED);
            setStageMessage('Biometric challenge session expired (90s window). Please rescan fingerprint.');
            onUpdateLcd('CHALLENGE EXPIRED', 'RESCAN PULSE');
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
            onUpdateLcd('LOCKOUT ENDED', 'PLACE FINGER');
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
      onUpdateLcd('PPG 2FA VERIFY', `HOLD STILL: ${scanCountdown}s`);
      timer = setInterval(() => {
        setScanCountdown(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            onUpdateLcd('PPG 2FA VERIFY', 'EVALUATING...');
            setTimeout(() => {
              performBiometricEvaluation();
            }, 300);
            return 0;
          }
          onUpdateLcd('PPG 2FA VERIFY', `HOLD STILL: ${prev - 1}s`);
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
    // 2. Clicked on the right edge of button (> 80% width)
    // 3. Secret 'I' hotkey pressed
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
      // Owner Mode: Genuine match with natural physiological variation (±2-3%)
      scanTemplate = selectedUser?.enrolledTemplate 
        ? selectedUser.enrolledTemplate.map(v => Math.max(15, Math.min(255, v + Math.round((Math.random() - 0.5) * 6))))
        : null;
    } else {
      // Imposter Mode: Phase shifted divergent pulse morphology (~38% score)
      scanTemplate = selectedUser?.enrolledTemplate
        ? selectedUser.enrolledTemplate.map((_, i, arr) => arr[(i + 9) % arr.length])
        : [10, 15, 20, 25, 30, 35, 40, 50, 70, 95, 120, 150, 180, 210, 240, 255, 220, 180, 120, 60];
    }

    if (onSetScanningSubject && scanTemplate) {
      onSetScanningSubject(scanTemplate);
    }

    if (onSetTargetResult) {
      onSetTargetResult(isImposterScan ? 'FAIL_MISMATCH' : 'SUCCESS');
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
    onUpdateLcd('PPG 2FA VERIFY', 'SCANNING 5s...');
    onStart('AUTHENTICATION');
  };

  const handleCancelScan = () => {
    setScanCountdown(0);
    setIsSubmitting(false);
    onStop();
    setAuthStage(SYSTEM_STATES.LOCKED);
    setStageMessage('Pulse acquisition cancelled. Ready to scan again.');
    onUpdateLcd('ACCESS LOCKED', 'PLACE FINGER');
  };

  // Perform genuine evaluation against Supabase-stored enrolled template
  const performBiometricEvaluation = async () => {
    setIsSubmitting(true);
    setStageMessage('Analyzing pulse wave morphology & cross-correlation against enrolled user...');
    onUpdateLcd('PPG 2FA VERIFY', 'EVALUATING...');

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

      // Stop the simulator AFTER extracting the template data (not before)
      // This preserves beatCount, bpm, and waveform data for the UI

      if (!candidate || candidate.length !== 20 || !candidate.some(v => v > 0)) {
        setIsSubmitting(false);
        onStop();
        setAuthStage(SYSTEM_STATES.BIOMETRIC_FAILED);
        setStageMessage('No clean pulse wave detected on sensor. Please keep finger steadily on HW-827 Pulse Sensor and retry.');
        onUpdateLcd('BAD SIGNAL', 'RETRY SCAN');
        return;
      }

      const result = await api.verifyBiometric({
        userId: selectedUserId,
        sampleTemplate: candidate,
        isHardwareSample: isHardwareConnected
      });

      setIsSubmitting(false);
      onStop(); // Stop simulator after getting results, preserving final waveform display

      if (result.success) {
        // Factor 1 Passed!
        setChallengeData({
          challengeId: result.challengeId,
          expiresInSec: result.expiresInSec
        });
        setChallengeCountdown(result.expiresInSec || 90);
        setAuthStage(SYSTEM_STATES.PIN_REQUIRED);
        setStageMessage(`✓ Factor 1 Verified (${result.score}% match)! Pulse matched ${selectedUser?.fullName || 'operator'}. Enter Vault PIN.`);
        onUpdateLcd('BIO VERIFIED', 'ENTER VAULT PIN');
        setEnteredPin('');
      } else {
        if (result.lockedOut) {
          setLockoutSec(result.remainingSec || 300);
        }
        setAuthStage(SYSTEM_STATES.BIOMETRIC_FAILED);
        setStageMessage(
          `🚫 Biometric Mismatch (${result.score || 0}% match): Pulse wave morphology does not match ${selectedUser?.fullName || 'enrolled operator'}. Access Denied!`
        );
        onUpdateLcd('BIO REJECTED', 'ACCESS DENIED');
        onSendSerial('CMD:DENY BIO_MISMATCH');
      }
    } catch (err) {
      setIsSubmitting(false);
      onStop();
      setAuthStage(SYSTEM_STATES.BIOMETRIC_FAILED);
      setStageMessage(err.message || 'Error communicating with verification service.');
      onUpdateLcd('AUTH ERROR', 'RETRY SCAN');
    }
  };

  // Factor 2: Backend PIN Verification
  const handleVerifyPin = async (e) => {
    if (e) e.preventDefault();
    if (!challengeData || !challengeData.challengeId) {
      setStageMessage('No active biometric challenge found. Please complete Factor 1 fingerprint scan first.');
      setAuthStage(SYSTEM_STATES.LOCKED);
      onUpdateLcd('NO CHALLENGE', 'SCAN FINGER');
      return;
    }

    if (!enteredPin || enteredPin.length < 4) {
      setStageMessage('Enter a valid 4-8 digit Vault PIN.');
      return;
    }

    setIsSubmitting(true);
    setStageMessage('Verifying salted PIN hash on backend...');
    onUpdateLcd('VERIFYING PIN', 'PLEASE WAIT...');

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
        onUpdateLcd('ACCESS GRANTED', 'VAULT UNLOCKED');
        onSendSerial('CMD:UNLOCK AUTH_AUTHORIZED');
        setChallengeData(null);
        setEnteredPin('');
        const currentUser = registeredUsers.find(u => u.id === selectedUserId);
        onAuthSuccess(currentUser, result);
        loadVaultFiles();
      }
    } catch (err) {
      setIsSubmitting(false);
      setEnteredPin('');
      const data = err.data || {};
      
      if (data.lockedOut) {
        setLockoutSec(data.remainingSec || 300);
        setAuthStage(SYSTEM_STATES.PIN_FAILED);
        setStageMessage(data.failureReason || 'Account locked out due to consecutive PIN failures.');
        onUpdateLcd('ACCOUNT LOCKED', 'PIN FAILURES');
        onSendSerial('CMD:DENY PIN_LOCKOUT');
        setChallengeData(null);
      } else if (data.expired) {
        setAuthStage(SYSTEM_STATES.BIOMETRIC_FAILED);
        setStageMessage(data.failureReason || 'Biometric challenge expired. Please rescan.');
        onUpdateLcd('EXPIRED 90s', 'RESCAN PULSE');
        setChallengeData(null);
      } else {
        setAuthStage(SYSTEM_STATES.PIN_FAILED);
        setPinAttemptsRemaining(data.remainingAttempts);
        setStageMessage(data.failureReason || 'Incorrect Vault PIN.');
        onUpdateLcd('WRONG PIN', 'ACCESS DENIED');
        onSendSerial('CMD:DENY WRONG_PIN');
      }
    }
  };

  const handleKeypadPress = (num) => {
    if (enteredPin.length < 8) {
      const nextPin = enteredPin + num;
      setEnteredPin(nextPin);
      onUpdateLcd('ENTER PIN:', '●'.repeat(nextPin.length));
    }
  };

  const handleKeypadBackspace = () => {
    const nextPin = enteredPin.slice(0, -1);
    setEnteredPin(nextPin);
    onUpdateLcd('ENTER PIN:', nextPin.length > 0 ? '●'.repeat(nextPin.length) : 'WAITING PIN');
  };

  const handleKeypadClear = () => {
    setEnteredPin('');
    onUpdateLcd('ENTER PIN:', 'WAITING PIN');
  };

  const handleCancelPinChallenge = () => {
    setChallengeData(null);
    setEnteredPin('');
    setAuthStage(SYSTEM_STATES.LOCKED);
    setStageMessage('Authentication cancelled. Place finger on sensor to begin.');
    onUpdateLcd('ACCESS LOCKED', 'PLACE FINGER');
  };

  // Keyboard shortcut listener for PIN entry
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

  // Relock Vault Handler
  const handlePerformRelock = () => {
    setAuthStage(SYSTEM_STATES.LOCKED);
    setStageMessage('System locked. Deadbolt engaged (Servo 0°).');
    onUpdateLcd('ACCESS LOCKED', 'PLACE FINGER');
    onSendSerial('CMD:LOCK');
    onLockVault();
  };

  // Copy helper
  const handleCopy = (text, key) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Toggle show/hide password
  const toggleShowPassword = (key) => {
    setVisiblePasswords(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Download decrypted file
  const handleDownloadFile = (file, e) => {
    if (e) e.stopPropagation();
    const element = document.createElement('a');
    const blob = new Blob([file.content || ''], { type: 'text/plain;charset=utf-8' });
    element.href = URL.createObjectURL(blob);
    element.download = file.name;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  // Open file preview
  const handleOpenFile = async (fileSummary) => {
    try {
      const res = await api.getVaultFileById(fileSummary.id);
      if (res && res.file) {
        setActiveFilePreview(res.file);
      } else {
        setActiveFilePreview(fileSummary);
      }
    } catch (err) {
      setActiveFilePreview(fileSummary);
    }
  };

  // Dynamic user credentials based on selected/authenticated user
  const currentUserName = authenticatedUser?.fullName || selectedUser?.fullName || 'Operator';
  const userTeamKey = (currentUserName || '').toLowerCase();

  const userPersonalCredentials = [
    {
      id: 'cred-1',
      title: 'AWS Production Infrastructure Root Key',
      category: 'Cloud Infrastructure',
      username: `${userTeamKey}-root-admin`,
      secret: `AKIA${userTeamKey.toUpperCase()}99482X99KQL`,
      isSecret: true
    },
    {
      id: 'cred-2',
      title: 'PostgreSQL Master Database Replica URI',
      category: 'Database Cluster',
      username: 'postgres_admin',
      secret: `postgres://biolock_${userTeamKey}:p@ssw0rd9942!@db-cluster.internal:5432/biovault`,
      isSecret: true
    },
    {
      id: 'cred-3',
      title: 'Hardware Token Enclave Signature',
      category: 'Cryptographic Token',
      username: `${userTeamKey}-hw827-enclave`,
      secret: `secp256k1:0x71a99f${userTeamKey.length}b4c8d2e1`,
      isSecret: true
    },
    {
      id: 'cred-4',
      title: 'Biometric Root Clearance Level',
      category: 'Access Control',
      username: `${currentUserName} (Class 5 Administrator)`,
      secret: 'FULL_CLEARANCE_ACTUATOR_UNLOCKED',
      isSecret: false
    }
  ];

  // Filtered files
  const filteredFiles = vaultFiles.filter(f => {
    const matchesSearch = f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          f.category.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'ALL' || f.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const categories = ['ALL', ...new Set(vaultFiles.map(f => f.category))];

  const isUnlocked = authStage === SYSTEM_STATES.AUTHORIZED || servoAngle > 45 || isVaultUnlocked;
  const isDenied = authStage === SYSTEM_STATES.BIOMETRIC_FAILED || authStage === SYSTEM_STATES.PIN_FAILED;
  const isVerifying = authStage === SYSTEM_STATES.BIOMETRIC_PENDING || scanCountdown > 0 || isRunning;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      
      {/* ========================================================
          UNIFIED MAIN WORKSPACE CARD (Matches DashboardView style)
          ======================================================== */}
      <div className="rounded-xl border border-zinc-800 bg-[#0e0e11] overflow-hidden">
        
        {/* Section 1: Lock State & Control Header */}
        <div className="p-6 border-b border-zinc-800/80 flex flex-col md:flex-row items-center justify-between gap-6 bg-[#121216]">
          
          <div className="flex items-center space-x-4">
            <div className={`w-12 h-12 rounded-lg flex items-center justify-center border transition-colors ${
              isUnlocked ? 'bg-emerald-950/40 border-emerald-800 text-emerald-400' :
              isDenied ? 'bg-rose-950/40 border-rose-800 text-rose-400' :
              isVerifying ? 'bg-cyan-950/40 border-cyan-800 text-cyan-400' :
              authStage === SYSTEM_STATES.PIN_REQUIRED ? 'bg-amber-950/40 border-amber-800 text-amber-400' :
              'bg-zinc-900 border-zinc-700 text-zinc-100'
            }`}>
              {isUnlocked ? (
                <Unlock className="w-6 h-6 text-emerald-400" />
              ) : isDenied ? (
                <AlertCircle className="w-6 h-6 text-rose-400" />
              ) : isVerifying ? (
                <Fingerprint className="w-6 h-6 text-cyan-400 animate-pulse" />
              ) : authStage === SYSTEM_STATES.PIN_REQUIRED ? (
                <KeyRound className="w-6 h-6 text-amber-400 animate-bounce" />
              ) : (
                <Lock className="w-6 h-6 text-zinc-100" />
              )}
            </div>

            <div>
              <div className="flex items-center space-x-2">
                <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded font-semibold ${
                  isUnlocked ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800' :
                  isDenied ? 'bg-rose-950/80 text-rose-300 border border-rose-800' :
                  isVerifying ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-800' :
                  authStage === SYSTEM_STATES.PIN_REQUIRED ? 'bg-amber-950/80 text-amber-300 border border-amber-800' :
                  'bg-zinc-900 text-zinc-400 border border-zinc-800'
                }`}>
                  {isUnlocked ? 'STATUS: UNLOCKED' :
                   isDenied ? 'STATUS: DENIED' :
                   isVerifying ? `STATUS: MEASURING (${scanCountdown}s)` :
                   authStage === SYSTEM_STATES.PIN_REQUIRED ? 'STATUS: PIN REQUIRED' : 'STATUS: LOCKED'}
                </span>
                <span className="text-xs font-mono text-zinc-500">
                  Servo: {servoAngle}°
                </span>
              </div>

              <h2 className="text-xl font-bold font-sans text-white tracking-tight mt-1">
                {isUnlocked ? 'Multi-Authenticator Verified • Vault Unlocked' :
                 isDenied ? 'Authentication Rejected • Access Denied' :
                 isVerifying ? 'Acquiring Live HW-827 PPG Pulses' :
                 authStage === SYSTEM_STATES.PIN_REQUIRED ? 'Factor 2 of 2: Enter Secret Vault PIN' :
                 'Two-Factor Authentication (Fingerprint + PIN)'}
              </h2>

              <p className="text-xs text-zinc-400 font-mono mt-0.5">
                {stageMessage}
              </p>
            </div>
          </div>

          {/* Primary Action Button */}
          <div className="flex items-center space-x-2.5">
            {isUnlocked ? (
              <button
                onClick={handlePerformRelock}
                className="px-5 py-2.5 rounded-lg font-sans font-semibold text-xs text-white bg-rose-600 hover:bg-rose-500 active:scale-95 transition-all flex items-center space-x-2 shadow-sm cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Relock Vault (Servo 0°)</span>
              </button>
            ) : isVerifying ? (
              <button
                onClick={handleCancelScan}
                className="px-5 py-2.5 rounded-lg font-sans font-medium text-xs text-zinc-300 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 transition-all flex items-center space-x-1.5 cursor-pointer"
              >
                <Square className="w-3.5 h-3.5 fill-current text-zinc-400" />
                <span>Cancel Scan</span>
              </button>
            ) : authStage === SYSTEM_STATES.PIN_REQUIRED ? (
              <button
                onClick={handleCancelPinChallenge}
                className="px-4 py-2.5 rounded-lg font-sans font-medium text-xs text-zinc-300 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 transition-all flex items-center space-x-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5 text-zinc-400" />
                <span>Rescan Fingerprint</span>
              </button>
            ) : (
              <button
                onClick={handleVerifyBiometric}
                disabled={lockoutSec > 0}
                className="px-6 py-2.5 rounded-lg font-sans font-semibold text-xs text-black bg-white hover:bg-zinc-200 active:scale-95 transition-all flex items-center space-x-2 shadow-sm cursor-pointer disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Scan Fingerprint / PPG Pulse (5s)</span>
              </button>
            )}

            {!isHardwareConnected && (
              <button
                onClick={onConnectHardware}
                className="px-4 py-2.5 rounded-lg border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-mono inline-flex items-center space-x-1.5 transition-colors cursor-pointer"
              >
                <Usb className="w-3.5 h-3.5 text-zinc-400" />
                <span>Connect Arduino</span>
              </button>
            )}
          </div>

        </div>

        {/* Account Selector Row */}
        <div className="px-6 py-3 bg-[#101014] border-b border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs font-mono">
          <div className="flex items-center space-x-2">
            <span className="text-zinc-500 uppercase tracking-wider font-semibold">Operator Account:</span>
            <select
              value={selectedUserId}
              disabled={authStage === SYSTEM_STATES.PIN_REQUIRED || isVerifying || isUnlocked}
              onChange={(e) => {
                const newId = e.target.value;
                setSelectedUserId(newId);
                const found = registeredUsers.find(u => u.id === newId);
                if (found?.enrolledTemplate) {
                  onSetEnrolledTemplate(found.enrolledTemplate);
                  onSendSerial(`CMD:SET_TEMPLATE ${found.enrolledTemplate.join(',')}`);
                }
                setAuthStage(SYSTEM_STATES.LOCKED);
                setStageMessage('Operator changed. Place finger on sensor to begin.');
                onUpdateLcd('ACCESS LOCKED', 'PLACE FINGER');
                setChallengeData(null);
                setEnteredPin('');
              }}
              className="bg-zinc-900 border border-zinc-700/80 rounded-md px-3 py-1.5 text-xs font-mono text-zinc-200 focus:outline-none focus:border-cyan-500 disabled:opacity-50 cursor-pointer"
            >
              {registeredUsers.length > 0 ? (
                registeredUsers.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.fullName} ({u.isPinConfigured ? 'PIN Configured' : 'Default PIN'})
                  </option>
                ))
              ) : (
                <option value="">No registered accounts available</option>
              )}
            </select>
          </div>

          <div className="flex items-center space-x-3 text-zinc-500">
            <span>2FA Protocol: <strong className="text-zinc-300 font-normal">PPG Pulse Morphology + Salted PIN</strong></span>
            <button
              onClick={onRefreshUsers}
              title="Refresh Accounts"
              className="p-1 rounded bg-zinc-900 border border-zinc-800 hover:text-zinc-200 text-zinc-500 transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Lockout Warning Banner */}
        {lockoutSec > 0 && (
          <div className="p-4 bg-rose-950/40 border-b border-rose-800 text-rose-300 font-mono text-xs flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
              <div>
                <strong className="block text-sm">Account Temporarily Locked Out</strong>
                <span>Excessive failed PIN attempts detected. Hardware actuator locked for security.</span>
              </div>
            </div>
            <div className="text-xl font-bold font-mono text-rose-400 px-3 py-1 rounded bg-rose-950/80 border border-rose-800">
              {lockoutSec}s
            </div>
          </div>
        )}

        {/* Section 2: Seamless Embedded PPG Waveform Oscilloscope */}
        <div className="p-6 bg-[#0a0a0c]">
          <div className="flex items-center justify-between mb-3 text-xs font-mono text-zinc-400">
            <div className="flex items-center space-x-2">
              <Activity className="w-3.5 h-3.5 text-zinc-300" />
              <span className="font-semibold text-zinc-200">HW-827 Pulse Sensor Oscilloscope (Analog Pin A0)</span>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-zinc-500">Signal: <strong className="text-zinc-300 font-normal">{signalQuality}</strong></span>
              <span className="text-zinc-500">100Hz Sample Rate</span>
            </div>
          </div>

          <PpgWaveformCanvas
            waveBuffer={waveBuffer}
            bpm={bpm}
            beatCount={beatCount}
            signalQuality={signalQuality}
            isRunning={isRunning || isVerifying}
            height={200}
          />
        </div>

        {/* Section 3: Integrated Live Telemetry Bar */}
        <div className="px-6 py-4 bg-[#101014] border-t border-zinc-800/80 grid grid-cols-2 sm:grid-cols-4 gap-4 font-mono text-xs">
          
          <div className="flex items-center space-x-3">
            <Heart className={`w-4 h-4 ${bpm > 0 ? 'text-rose-500' : 'text-zinc-600'}`} />
            <div>
              <div className="text-[10px] text-zinc-500 uppercase">Heart Rate</div>
              <div className="text-sm font-bold text-white">{bpm > 0 ? `${bpm} BPM` : '--'}</div>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <Activity className="w-4 h-4 text-zinc-500" />
            <div>
              <div className="text-[10px] text-zinc-500 uppercase">Heartbeats</div>
              <div className="text-sm font-bold text-white">{beatCount} beats</div>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <ShieldCheck className="w-4 h-4 text-zinc-500" />
            <div>
              <div className="text-[10px] text-zinc-500 uppercase">Match Score</div>
              <div className="text-sm font-bold text-white">
                {matchScore > 0 ? `${matchScore}%` : '--'}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <div className="w-2 h-2 rounded-full bg-emerald-500" />
            <div>
              <div className="text-[10px] text-zinc-500 uppercase">16x2 LCD Mirror</div>
              <div className="text-xs font-semibold text-zinc-200 truncate max-w-[140px]">
                {lcdLine1} | {lcdLine2}
              </div>
            </div>
          </div>

        </div>

      </div>

      {/* ========================================================
          FACTOR INTERACTION PANELS: PIN KEYPAD or VAULT FOLDER
          ======================================================== */}

      {authStage === SYSTEM_STATES.PIN_REQUIRED || authStage === SYSTEM_STATES.PIN_FAILED ? (
        
        /* --------------------------------------------------------
           FACTOR 2: VAULT PIN KEYPAD
           -------------------------------------------------------- */
        <div className="rounded-xl border border-zinc-800 bg-[#0e0e11] p-6 max-w-md mx-auto space-y-5 text-center shadow-2xl">
          
          {/* Challenge Timer Pill */}
          <div className="p-3 rounded-lg bg-cyan-950/40 border border-cyan-800/80 text-cyan-300 font-mono text-xs flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Factor 1 Verified • Session Active</span>
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
            <h3 className="text-lg font-bold text-white mt-0.5">Enter Secret Vault PIN</h3>
            <p className="text-xs font-mono text-zinc-400 mt-1 max-w-sm mx-auto">
              {stageMessage}
            </p>
          </div>

          {/* Masked PIN Display */}
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

          {/* Keypad */}
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

      ) : isUnlocked ? (

        /* --------------------------------------------------------
           AUTHORIZED / VAULT UNLOCKED: DIRECT FOLDER & CREDENTIALS VIEW
           (Displays all confidential files, keys, and passcodes right here!)
           -------------------------------------------------------- */
        <div className="space-y-6">
          
          {/* Unlocked Banner */}
          <div className="rounded-xl border border-emerald-800/80 bg-gradient-to-r from-emerald-950/40 via-[#0e0e11] to-[#121216] p-6 flex flex-col md:flex-row items-center justify-between gap-4 shadow-xl">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-950 border border-emerald-700/80 flex items-center justify-center text-emerald-400 shadow-inner">
                <FolderOpen className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] font-mono uppercase font-bold text-emerald-300 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800">
                    MULTI-AUTHENTICATOR AUTHORIZED • SERVO DEADBOLT RETRACTED (90°)
                  </span>
                </div>
                <h3 className="text-xl font-bold text-white tracking-tight mt-1">
                  {currentUserName}'s Confidential Vault & Decrypted Files
                </h3>
                <p className="text-xs text-zinc-400">
                  Full clearance granted. All protected credentials, root certificates, and confidential directory files are accessible below.
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2.5">
              <button
                onClick={handlePerformRelock}
                className="px-4 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-xs font-semibold text-white shadow-lg shadow-rose-900/40 transition-all flex items-center space-x-2 cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Relock Vault Deadbolt</span>
              </button>
            </div>
          </div>

          {/* Sub-Section 1: Operator Personal Credentials Table */}
          <div className="rounded-xl border border-zinc-800 bg-[#0e0e11] overflow-hidden">
            <div className="p-4 border-b border-zinc-800 bg-[#121216] flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Key className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                  Personal Secret Credentials & Access Keys ({userPersonalCredentials.length})
                </span>
              </div>
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800">
                AES-256 Decrypted
              </span>
            </div>

            <div className="divide-y divide-zinc-800/80">
              {userPersonalCredentials.map(cred => {
                const isVisible = visiblePasswords[cred.id];
                const isCopied = copiedKey === cred.id;

                return (
                  <div key={cred.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-zinc-900/40 transition-colors">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-semibold text-white">{cred.title}</span>
                        <span className="text-[10px] font-mono text-zinc-500 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                          {cred.category}
                        </span>
                      </div>
                      <div className="text-xs font-mono text-zinc-400">
                        Identity: <span className="text-zinc-200">{cred.username}</span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <div className="bg-[#0a0a0c] border border-zinc-800 rounded-lg px-3 py-1.5 font-mono text-xs text-amber-300 min-w-[220px] max-w-xs truncate">
                        {cred.isSecret && !isVisible ? '••••••••••••••••••••' : cred.secret}
                      </div>

                      {cred.isSecret && (
                        <button
                          onClick={() => toggleShowPassword(cred.id)}
                          className="p-1.5 rounded-md hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
                          title={isVisible ? 'Hide Secret' : 'Show Secret'}
                        >
                          {isVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      )}

                      <button
                        onClick={() => handleCopy(cred.secret, cred.id)}
                        className="px-2.5 py-1.5 rounded-md bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-mono text-zinc-300 flex items-center space-x-1.5 transition-colors cursor-pointer"
                        title="Copy to Clipboard"
                      >
                        {isCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{isCopied ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Sub-Section 2: Confidential Files & Folder Directory */}
          <div className="rounded-xl border border-zinc-800 bg-[#0e0e11] overflow-hidden">
            <div className="p-4 border-b border-zinc-800 bg-[#121216] flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center space-x-2">
                <FolderLock className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-mono font-bold text-white uppercase tracking-wider">
                  Confidential Vault Files Directory ({filteredFiles.length})
                </span>
              </div>

              {/* Search & Category Filter */}
              <div className="flex items-center space-x-2">
                <div className="relative w-48">
                  <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search files..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-md pl-8 pr-2.5 py-1 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-cyan-500 font-mono"
                  />
                </div>

                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="bg-zinc-900 border border-zinc-800 rounded-md px-2.5 py-1 text-xs font-mono text-zinc-300 focus:outline-none focus:border-cyan-500"
                >
                  {categories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Files List */}
            {isLoadingFiles ? (
              <div className="p-8 text-center text-zinc-500 text-xs font-mono flex items-center justify-center space-x-2">
                <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
                <span>Decrypting confidential directory files...</span>
              </div>
            ) : filteredFiles.length === 0 ? (
              <div className="p-8 text-center text-zinc-500 text-xs font-mono">
                No files found matching criteria.
              </div>
            ) : (
              <div className="divide-y divide-zinc-800/80">
                {filteredFiles.map((file) => {
                  const isJson = file.name.endsWith('.json');
                  const isPem = file.name.endsWith('.pem') || file.name.endsWith('.key');
                  const isCsv = file.name.endsWith('.csv');

                  return (
                    <div
                      key={file.id}
                      onClick={() => handleOpenFile(file)}
                      className="px-5 py-3.5 flex items-center justify-between hover:bg-zinc-900/50 transition-colors cursor-pointer group"
                    >
                      <div className="flex items-center space-x-3.5 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-700/80 flex items-center justify-center text-zinc-300 group-hover:text-cyan-400 group-hover:border-cyan-800 transition-colors shrink-0">
                          {isJson ? <FileCode className="w-4 h-4" /> :
                           isPem ? <Key className="w-4 h-4 text-amber-400" /> :
                           isCsv ? <FileSpreadsheet className="w-4 h-4 text-emerald-400" /> :
                           <FileText className="w-4 h-4" />}
                        </div>

                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-white truncate group-hover:text-cyan-300 transition-colors flex items-center space-x-2">
                            <span>{file.name}</span>
                            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-zinc-800 text-emerald-400 border border-emerald-900/60">
                              AES-256
                            </span>
                          </div>
                          <div className="text-[10px] text-zinc-500 font-mono mt-0.5">
                            Category: {file.category} • Size: {file.size} • Updated {file.updatedAt}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleOpenFile(file)}
                          className="px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-mono text-zinc-300 hover:text-cyan-300 flex items-center space-x-1 transition-colors"
                          title="Decrypt & View"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View</span>
                        </button>

                        <button
                          onClick={(e) => handleDownloadFile(file, e)}
                          className="px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-mono text-zinc-300 hover:text-emerald-300 flex items-center space-x-1 transition-colors"
                          title="Download Decrypted File"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Export</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

      ) : null}

      {/* Advanced Technical Diagnostics Toggle */}
      <div className="space-y-4">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center space-x-2 text-xs font-mono text-zinc-500 hover:text-zinc-300 transition-colors mx-auto cursor-pointer"
        >
          <span>{showAdvanced ? 'Hide Technical Diagnostics' : 'Show 20-Point Morphology & 16x2 Matrix Details'}</span>
          {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {showAdvanced && (
          <div className="space-y-4 animate-in fade-in duration-300">
            {/* 16x2 LCD Matrix Output */}
            <LCDDisplay line1={lcdLine1} line2={lcdLine2} />

            {/* 20-Point Template Comparison Card */}
            <TemplateComparisonCard
              enrolledTemplate={enrolledTemplate}
              currentTemplate={currentTemplate}
              matchScore={matchScore}
              threshold={70}
            />
          </div>
        )}
      </div>

      {/* Decrypted File Preview Modal */}
      {activeFilePreview && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-zinc-700 bg-[#0e0e14] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-700 flex items-center justify-center text-cyan-400">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white tracking-tight">{activeFilePreview.name}</h3>
                  <div className="text-[10px] font-mono text-zinc-400">
                    Category: {activeFilePreview.category} • Size: {activeFilePreview.size}
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleCopy(activeFilePreview.content, 'modal-preview')}
                  className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-mono text-zinc-200 flex items-center space-x-1.5 transition-colors cursor-pointer"
                >
                  {copiedKey === 'modal-preview' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey === 'modal-preview' ? 'Copied' : 'Copy'}</span>
                </button>

                <button
                  onClick={() => handleDownloadFile(activeFilePreview)}
                  className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-mono text-zinc-200 flex items-center space-x-1.5 transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Download</span>
                </button>

                <button
                  onClick={() => setActiveFilePreview(null)}
                  className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-4 flex-1 overflow-y-auto bg-[#08080a] font-mono text-xs text-zinc-300">
              <pre className="whitespace-pre-wrap leading-relaxed select-all">
                {activeFilePreview.content || 'No file content available.'}
              </pre>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
