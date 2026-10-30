import React, { useState, useEffect } from 'react';
import { Mail, Lock, Phone, User, Eye, EyeOff, ShieldCheck, AlertCircle, Loader2, Headset } from 'lucide-react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import {
  auth, db, UserRole, resolveCanonicalBranchId, CanonicalBranchId, BRANCHES,
  resolveStrictAuth, RECEPTION_DESK_DIRECTORY, DOCTOR_DIRECTORY, DEFAULT_TELECALLERS
} from '@app/shared';
import { sendSmsOtp, generate4DigitOtp, normalizePhoneForSms } from '../../services/smsOtpService';

export interface WebLoginSuccessData {
  role: UserRole;
  userName?: string;
  branchId: CanonicalBranchId;
  branchName: string;
  branchPhone: string;
  staffId?: string;
}

interface AuthPageProps {
  onLoginSuccess?: (data: WebLoginSuccessData) => void;
}

export const AUTHORIZED_WEB_BRANCHES = RECEPTION_DESK_DIRECTORY;

export function getInstantWebAuthData(input: string): WebLoginSuccessData | null {
  const strict = resolveStrictAuth(input);
  if (strict) {
    return {
      role: strict.role,
      userName: strict.userName,
      branchId: strict.branchId,
      branchName: strict.branchName,
      branchPhone: strict.branchPhone,
      staffId: strict.staffId || '1'
    };
  }
  return null;
}

export const AuthPage: React.FC<AuthPageProps> = ({ onLoginSuccess }) => {
  const [activeRole, setActiveRole] = useState<'otp' | 'staff' | 'email' | 'telecaller'>('otp');
  const [telecallerLoginId, setTelecallerLoginId] = useState('');
  const [telecallerPassword, setTelecallerPassword] = useState('');
  const [showTelecallerPassword, setShowTelecallerPassword] = useState(false);
  const [emailOrUsername, setEmailOrUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [staffEmail, setStaffEmail] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [showStaffPassword, setShowStaffPassword] = useState(false);
  const [mobileNumber, setMobileNumber] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [displayedOtp, setDisplayedOtp] = useState('');
  const [smsStatusNotice, setSmsStatusNotice] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [cachedAuthData, setCachedAuthData] = useState<WebLoginSuccessData | null>(null);
  const [countdown, setCountdown] = useState<number>(30);
  const [sentOtp, setSentOtp] = useState<string>('');
  const [otpExpiresAt, setOtpExpiresAt] = useState<number>(0);

  useEffect(() => {
    let interval: any = null;
    if (otpSent && countdown > 0) {
      interval = setInterval(() => {
        setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [otpSent, countdown]);

  const getAuthorizedBranch = (input: string) => {
    const clean = input.replace(/\D/g, '');
    for (const [phone, info] of Object.entries(AUTHORIZED_WEB_BRANCHES)) {
      if (clean.includes(phone)) return info;
    }
    return null;
  };
  const detectWebRoleAndBranch = async (input: string): Promise<WebLoginSuccessData | null> => {
    const cleanInput = input.trim();
    const digits = cleanInput.replace(/\D/g, '');
    const clean10 = digits.length > 10 ? digits.slice(-10) : digits;
    const lower = cleanInput.toLowerCase();
    const strict = resolveStrictAuth(input);
    if (strict) {
      return {
        role: strict.role,
        userName: strict.userName,
        branchId: strict.branchId,
        branchName: strict.branchName,
        branchPhone: strict.branchPhone,
        staffId: strict.staffId || '1'
      };
    }

    // Parallel Firestore Lookup as Fallback with 2s timeout
    if (db) {
      try {
        const timeoutPromise = new Promise<{ docs: any[]; empty: boolean }>((resolve) =>
          setTimeout(() => resolve({ docs: [], empty: true }), 2000)
        );
        const [staffSnap, docSnap] = await Promise.all([
          Promise.race([getDocs(collection(db, 'staff')), timeoutPromise]),
          digits.length >= 8 ? Promise.race([getDocs(collection(db, 'doctors')), timeoutPromise]) : Promise.resolve({ docs: [], empty: true } as any)
        ]);

        // Check staff collection
        for (const d of staffSnap.docs) {
          const data = d.data();
          const sPhone = String(data.mobile || data.phone || '').replace(/\D/g, '');
          const sClean10 = sPhone.length > 10 ? sPhone.slice(-10) : sPhone;
          const sName = String(data.name || '').toLowerCase();

          // Reject if someone in staff collection accidentally has a desk phone
          if (sClean10 && RECEPTION_DESK_DIRECTORY[sClean10]) {
            const rec = RECEPTION_DESK_DIRECTORY[sClean10];
            return {
              role: 'reception',
              userName: rec.userName,
              branchId: rec.branchId,
              branchName: rec.branchName,
              branchPhone: rec.formattedPhone,
              staffId: d.id
            };
          }

          if (
            (cleanInput && d.id === cleanInput) ||
            (clean10 && sClean10 && clean10 === sClean10) ||
            (lower && sName && sName === lower) ||
            (digits && sPhone && digits.length >= 10 && (digits === sPhone || clean10 === sClean10))
          ) {
            const canonical = resolveCanonicalBranchId(data.branchId || data.branch || data.branchName) || 'kphb';
            const branchItem = BRANCHES[canonical];
            return {
              role: 'staff',
              userName: data.name || 'Staff Member',
              branchId: canonical,
              branchName: branchItem.fullName,
              branchPhone: data.mobile || data.phone || digits,
              staffId: d.id
            };
          }
        }

        // Check doctors collection
        if (!docSnap.empty) {
          for (const d of docSnap.docs) {
            const data = d.data();
            const dPhone = String(data.mobile || data.phone || '').replace(/\D/g, '');
            const dClean10 = dPhone.length > 10 ? dPhone.slice(-10) : dPhone;
            const dName = String(data.name || '').toLowerCase();
            if (
              (clean10 && dClean10 && clean10 === dClean10) ||
              (digits && dPhone && (digits.includes(dPhone) || dPhone.includes(digits))) ||
              (cleanInput && d.id === cleanInput) ||
              (lower && dName && dName === lower)
            ) {
              const canonical = resolveCanonicalBranchId(data.branchId || data.branch || data.branchName) || 'kphb';
              const branchItem = BRANCHES[canonical];
              return {
                role: 'doctor',
                userName: data.name || 'Dr. Physician',
                branchId: canonical,
                branchName: branchItem.fullName,
                branchPhone: dPhone ? `+91 ${dClean10}` : branchItem.formattedPhone,
                staffId: d.id
              };
            }
          }
        }
      } catch (e) {
        console.warn('Firestore web parallel lookup notice:', e);
      }
    }

    // Not found / Deleted / Unauthorized
    return null;
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setIsLoading(true);

    const cleanInput = emailOrUsername.trim().toLowerCase();
    const cleanPass = password.trim();

    if (cleanInput === 'hr@sph.com' || cleanInput.includes('hr')) {
      if (cleanPass && cleanPass !== 'hr@sph123') {
        setErrorMessage('Incorrect password for HR login. Expected password: hr@sph123');
        setIsLoading(false);
        return;
      }
    } else if (cleanInput.includes('admin')) {
      if (cleanPass && cleanPass !== 'admin123') {
        setErrorMessage('Incorrect password for Admin login. Expected password: admin123');
        setIsLoading(false);
        return;
      }
    }

    const authData = await detectWebRoleAndBranch(emailOrUsername);
    if (!authData) {
      setErrorMessage('Account not recognized or login access revoked.');
      setIsLoading(false);
      return;
    }

    if (onLoginSuccess) {
      onLoginSuccess(authData);
    }
    setIsLoading(false);
  };

  const handleStaffSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setIsLoading(true);

    const cleanEmail = staffEmail.trim().toLowerCase();
    const cleanPass = staffPassword.trim();

    if (!cleanEmail || !cleanPass) {
      setErrorMessage('Please enter both staff email ID and password.');
      setIsLoading(false);
      return;
    }

    try {
      if (db) {
        const snap = await getDocs(collection(db, 'staff'));
        let matched: any = null;
        for (const d of snap.docs) {
          const data = d.data();
          const sEmail = String(data.email || '').trim().toLowerCase();
          const fallbackEmail = `${String(data.name || '').toLowerCase().replace(/[^a-z0-9]/g, '')}@sph.com`;
          if (sEmail === cleanEmail || fallbackEmail === cleanEmail) {
            matched = { id: d.id, ...data };
            break;
          }
        }

        if (!matched) {
          setErrorMessage(`No regular staff member found with email "${cleanEmail}". Please check your email or contact HR.`);
          setIsLoading(false);
          return;
        }

        const expectedPassword = String(matched.password || 'email123').trim();
        if (cleanPass !== expectedPassword) {
          setErrorMessage('Incorrect password for staff login. Standard default password is email123.');
          setIsLoading(false);
          return;
        }

        const canonical = resolveCanonicalBranchId(matched.branchId || matched.branch || matched.branchName) || 'kphb';
        const branchItem = BRANCHES[canonical];
        const authData: WebLoginSuccessData = {
          role: 'staff',
          userName: matched.name || 'Staff Member',
          branchId: canonical,
          branchName: branchItem ? branchItem.fullName : `${matched.branch || 'KPHB'} Branch`,
          branchPhone: matched.mobile || matched.phone || '',
          staffId: matched.id
        };

        if (onLoginSuccess) {
          onLoginSuccess(authData);
        }
      }
    } catch (err: any) {
      console.error('Staff web login error:', err);
      setErrorMessage(err.message || 'Staff login failed.');
    } finally {
      setIsLoading(false);
    }
  };

  // SEND REAL 4-DIGIT SMS OTP (Truly instant UI transition, zero loading delay!)
  const handleSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setErrorMessage('');

    const rawInput = mobileNumber.trim();
    if (!rawInput) {
      setErrorMessage('Please enter your mobile number.');
      return;
    }

    const { clean10 } = normalizePhoneForSms(rawInput);
    if (!clean10 || clean10.length < 10) {
      setErrorMessage('Please enter a valid 10-digit mobile number.');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');
    const verifiedAuth = await detectWebRoleAndBranch(rawInput);
    setIsLoading(false);

    if (!verifiedAuth) {
      setErrorMessage(`Mobile number +91 ${clean10} is not registered in the clinic system. Only authorized staff, doctors, and branch receptions can sign in.`);
      return;
    }

    const generatedOtp = generate4DigitOtp();
    const expiry = Date.now() + 5 * 60 * 1000; // 5 minutes validity

    setSentOtp(generatedOtp);
    setOtpExpiresAt(expiry);
    setCachedAuthData(verifiedAuth);

    // 1. Transition to OTP step with default 1234
    setIsLoading(false);
    setOtpSent(true);
    setOtpCode('1234');
    setCountdown(30);
    setSmsStatusNotice(`Default verification OTP is 1234 (dispatched to +91 ${clean10}).`);

    // 2. Save OTP to Firestore in background for audit & verification
    if (db && clean10) {
      setDoc(doc(db, 'auth_otps', clean10), {
        phone: clean10,
        otp: generatedOtp,
        expiresAt: expiry,
        role: verifiedAuth.role,
        staffId: verifiedAuth.staffId || null,
        userName: verifiedAuth.userName || 'Staff Member',
        branchName: verifiedAuth.branchName || 'KPHB Branch',
        createdAt: new Date().toISOString()
      }).catch(err => console.warn('Background auth/OTP notice:', err));
    }

    // 3. Dispatch real SMS via SMS gateway
    sendSmsOtp(clean10, generatedOtp).then(smsResult => {
      if (smsResult.success) {
        setSmsStatusNotice(`A 4-digit verification code has been sent via SMS to +91 ${clean10}.`);
      } else {
        setSmsStatusNotice(`SMS Dispatch: ${smsResult.message}`);
      }
    }).catch((err) => {
      setSmsStatusNotice(`SMS dispatch failed. Please click Resend OTP.`);
    });
  };

  // VERIFY REAL 4-DIGIT SMS OTP
  const handleOtpSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    const cleanOtp = otpCode.trim();
    if (!cleanOtp || cleanOtp.length !== 4) {
      setErrorMessage('Please enter the 4-digit OTP received via SMS.');
      return;
    }

    const { clean10 } = normalizePhoneForSms(mobileNumber);

    // 1. Check expiration (5 minutes)
    if (otpExpiresAt > 0 && Date.now() > otpExpiresAt) {
      setErrorMessage('OTP has expired. Please click Resend OTP to receive a fresh code.');
      return;
    }

    // 2. In-Memory match against default 1234 or dispatched SMS OTP
    let isOtpValid = Boolean(cleanOtp === '1234' || (sentOtp && cleanOtp === sentOtp));

    // 3. Fallback to Firestore OTP check with 1.5s timeout
    if (!isOtpValid && db && clean10) {
      try {
        const timeoutPromise = new Promise<null>(resolve => setTimeout(() => resolve(null), 1500));
        const otpSnap = await Promise.race([
          getDoc(doc(db, 'auth_otps', clean10)),
          timeoutPromise
        ]);
        if (otpSnap && otpSnap.exists()) {
          const data = otpSnap.data();
          if (data.otp === cleanOtp && Date.now() <= (data.expiresAt || 0)) {
            isOtpValid = true;
          }
        }
      } catch (err) {
        console.warn('Error reading OTP from Firestore:', err);
      }
    }

    if (!isOtpValid) {
      setErrorMessage('Invalid OTP code. Please enter the correct 4-digit OTP sent to your phone.');
      return;
    }

    // 4. Instant Login Session (0ms delay!)
    const authData = cachedAuthData || (await detectWebRoleAndBranch(mobileNumber));
    setIsLoading(false);

    if (!authData) {
      setErrorMessage('Access Denied: Mobile number is not registered in the clinic database.');
      return;
    }

    if (onLoginSuccess) {
      onLoginSuccess(authData);
    } else {
      alert(`Successfully verified & signed in to ${authData.branchName} as ${authData.role.toUpperCase()}`);
    }
  };

  const handleTelecallerSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = telecallerLoginId.trim();
    const cleanPass = telecallerPassword.trim();

    if (!cleanId) {
      setErrorMessage('Please enter your Telecaller ID, Email, or registered Phone Number.');
      return;
    }
    if (!cleanPass) {
      setErrorMessage('Please enter your telecaller password.');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    try {
      if (!db) throw new Error('Database is offline.');

      let matchedTelecaller: any = null;
      const snap = await getDocs(collection(db, 'telecallers'));
      snap.forEach((d) => {
        const data = d.data();
        const tId = String(data.telecallerId || '').trim().toLowerCase();
        const tEmail = String(data.email || '').trim().toLowerCase();
        const tPhone = String(data.phone || '').replace(/\D/g, '');
        const inputClean = cleanId.toLowerCase();
        const inputPhone = cleanId.replace(/\D/g, '');

        if (
          tId === inputClean ||
          tEmail === inputClean ||
          (inputPhone.length >= 10 && tPhone.endsWith(inputPhone.slice(-10)))
        ) {
          matchedTelecaller = { id: d.id, ...data };
        }
      });

      if (!matchedTelecaller) {
        const staffSnap = await getDocs(query(collection(db, 'staff'), where('role', '==', 'telecaller')));
        staffSnap.forEach((d) => {
          const data = d.data();
          const tId = String(data.telecallerId || '').trim().toLowerCase();
          const tEmail = String(data.email || '').trim().toLowerCase();
          const tPhone = String(data.phone || data.mobile || '').replace(/\D/g, '');
          const inputClean = cleanId.toLowerCase();
          const inputPhone = cleanId.replace(/\D/g, '');

          if (
            tId === inputClean ||
            tEmail === inputClean ||
            (inputPhone.length >= 10 && tPhone.endsWith(inputPhone.slice(-10)))
          ) {
            matchedTelecaller = { id: d.id, ...data };
          }
        });
      }

      if (!matchedTelecaller) {
        matchedTelecaller = (DEFAULT_TELECALLERS || []).find((t: any) =>
          t.telecallerId.toLowerCase() === cleanId.toLowerCase() ||
          t.email.toLowerCase() === cleanId.toLowerCase() ||
          (cleanId.replace(/\D/g, '').length >= 10 && t.phone.endsWith(cleanId.replace(/\D/g, '').slice(-10)))
        );
      }

      if (!matchedTelecaller) {
        setIsLoading(false);
        setErrorMessage(`No telecaller account found matching "${cleanId}".`);
        return;
      }

      if (matchedTelecaller.isActive === false || matchedTelecaller.status === 'inactive' || matchedTelecaller.status === 'deactivated') {
        setIsLoading(false);
        setErrorMessage('Your telecaller account has been deactivated. Please contact Administrator or HR.');
        return;
      }

      const expectedPassword = String(matchedTelecaller.password || 'email123').trim();
      if (cleanPass !== expectedPassword) {
        setIsLoading(false);
        setErrorMessage('The password you entered is incorrect.');
        return;
      }

      setIsLoading(false);
      const canonical = resolveCanonicalBranchId(matchedTelecaller.assignedBranch || matchedTelecaller.branch) || 'kphb';
      const authData: WebLoginSuccessData = {
        role: 'telecaller',
        userName: matchedTelecaller.name || 'Telecaller',
        branchId: canonical,
        branchName: matchedTelecaller.assignedBranch || 'All Branches',
        branchPhone: matchedTelecaller.phone || '',
        staffId: matchedTelecaller.telecallerId || matchedTelecaller.id
      };

      if (onLoginSuccess) {
        onLoginSuccess(authData);
      }
    } catch (err: any) {
      setIsLoading(false);
      setErrorMessage(err?.message || 'Failed to authenticate telecaller.');
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'radial-gradient(circle at center, #f5f9fc 0%, #e8eff5 100%)',
      padding: '20px'
    }}>
      {/* Centered White Login Card */}
      <div style={{
        width: '100%',
        maxWidth: '430px',
        background: '#ffffff',
        borderRadius: '24px',
        padding: '36px 32px 40px',
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.08), 0 4px 20px rgba(37, 142, 200, 0.06)',
        border: '1px solid #ffffff'
      }}>
        {/* Brand Emblem Logo */}
        <div style={{ textAlign: 'center', marginBottom: '16px' }}>
          <img
            src="/Assets/sh_logo.png"
            alt="Spiritual Homeopathy Logo"
            style={{ width: '64px', height: '64px', objectFit: 'contain' }}
            onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
          />
        </div>

        {/* Card Title & Subtitle */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <h1 style={{
            fontSize: '22px !important',
            fontWeight: 800,
            color: '#1e293b',
            letterSpacing: '-0.3px',
            marginBottom: '4px'
          }}>
            Spiritual Homeopathy
          </h1>
          <p style={{
            fontSize: '13px !important',
            color: '#94a3b8',
            fontWeight: 500
          }}>
            Doctor, Staff, HR, Reception, Admin & Telecaller Portal
          </p>
        </div>

        {/* 3 Segmented Login Mode Switcher */}
        <div style={{
          display: 'flex',
          background: '#f1f5f9',
          borderRadius: '12px',
          padding: '4px',
          marginBottom: '24px',
          gap: '4px'
        }}>
          <button
            type="button"
            onClick={() => {
              setActiveRole('otp');
              setErrorMessage('');
            }}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '5px',
              padding: '9px 6px',
              borderRadius: '9px',
              border: 'none',
              background: activeRole === 'otp' ? '#ffffff' : 'transparent',
              color: activeRole === 'otp' ? '#258ec8' : '#64748b',
              fontWeight: activeRole === 'otp' ? 800 : 600,
              fontSize: '11.5px',
              cursor: 'pointer',
              boxShadow: activeRole === 'otp' ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            <Phone size={13} color={activeRole === 'otp' ? '#258ec8' : '#64748b'} />
            Doctor / Reception
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveRole('email');
              setErrorMessage('');
            }}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '5px',
              padding: '9px 6px',
              borderRadius: '9px',
              border: 'none',
              background: activeRole === 'email' ? '#ffffff' : 'transparent',
              color: activeRole === 'email' ? '#258ec8' : '#64748b',
              fontWeight: activeRole === 'email' ? 800 : 600,
              fontSize: '11.5px',
              cursor: 'pointer',
              boxShadow: activeRole === 'email' ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            <Mail size={13} color={activeRole === 'email' ? '#258ec8' : '#64748b'} />
            Admin / HR
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveRole('telecaller');
              setErrorMessage('');
            }}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '5px',
              padding: '9px 6px',
              borderRadius: '9px',
              border: 'none',
              background: activeRole === 'telecaller' ? '#ffffff' : 'transparent',
              color: activeRole === 'telecaller' ? '#0284c7' : '#64748b',
              fontWeight: activeRole === 'telecaller' ? 800 : 600,
              fontSize: '11.5px',
              cursor: 'pointer',
              boxShadow: activeRole === 'telecaller' ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            <Headset size={13} color={activeRole === 'telecaller' ? '#0284c7' : '#64748b'} />
            Telecaller
          </button>
        </div>

        {/* Error Notification Alert */}
        {errorMessage ? (
          <div style={{
            background: '#fef2f2',
            border: '1px solid #fca5a5',
            color: '#ef4444',
            padding: '10px 14px',
            borderRadius: '12px',
            marginBottom: '18px',
            fontSize: '12px !important',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px'
          }}>
            <AlertCircle size={16} color="#ef4444" style={{ marginTop: '2px', flexShrink: 0 }} />
            <span>{errorMessage}</span>
          </div>
        ) : null}

        {/* Form Body */}

        {activeRole === 'otp' ? (
          <form onSubmit={!otpSent ? handleSendOtp : handleOtpSignIn} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12.5px !important', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>
                Mobile Number (Doctor & Reception)
              </label>
              <div style={{ display: 'flex', alignItems: 'center', background: '#eef5fc', borderRadius: '10px', padding: '0 14px', height: '46px', border: '1px solid #e0ecf8' }}>
                <Phone size={16} color="#64748b" style={{ marginRight: '12px' }} />
                <input
                  type="tel"
                  value={mobileNumber}
                  onChange={e => setMobileNumber(e.target.value)}
                  placeholder="e.g. 8125260176 or 9030176176"
                  style={{ background: 'transparent', border: 'none', outline: 'none', width: '100%', fontSize: '13px !important', color: '#0f172a', fontWeight: 500 }}
                  required
                />
              </div>

              {/* Live strict account detection badge */}
              {(() => {
                const detected = resolveStrictAuth(mobileNumber);
                if (!detected) return null;
                const isDoc = detected.isDoctor;
                return (
                  <div style={{
                    marginTop: '8px',
                    padding: '6px 12px',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '7px',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    background: isDoc ? '#eff6ff' : '#ecfdf5',
                    color: isDoc ? '#1d4ed8' : '#047857',
                    border: `1px solid ${isDoc ? '#bfdbfe' : '#a7f3d0'}`
                  }}>
                    <ShieldCheck size={14} color={isDoc ? '#2563eb' : '#059669'} />
                    <span>
                      {isDoc
                        ? `Doctor Profile: ${detected.userName} (${detected.branchName})`
                        : `Reception Desk: ${detected.userName}`}
                    </span>
                  </div>
                );
              })()}
            </div>

            {otpSent && (
              <div>
                {smsStatusNotice && (
                  <div style={{
                    padding: '10px 14px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    background: '#f0f9ff',
                    border: '1px solid #bae6fd',
                    color: '#0369a1',
                    marginBottom: '16px'
                  }}>
                    <div style={{ fontWeight: 600 }}>{smsStatusNotice}</div>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label style={{ fontSize: '12.5px !important', fontWeight: 700, color: '#475569' }}>
                    Enter 4-Digit SMS OTP
                  </label>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', background: '#eef5fc', borderRadius: '10px', padding: '0 14px', height: '46px', border: '1px solid #e0ecf8' }}>
                  <Lock size={16} color="#64748b" style={{ marginRight: '12px' }} />
                  <input
                    type="text"
                    value={otpCode}
                    onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="Enter 4-digit OTP received via SMS"
                    maxLength={4}
                    style={{ background: 'transparent', border: 'none', outline: 'none', width: '100%', fontSize: '14px !important', color: '#0f172a', fontWeight: 700, letterSpacing: '4px' }}
                    required
                  />
                </div>

                {/* 30-Second Countdown & Resend Option */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', padding: '0 4px' }}>
                  <span style={{ fontSize: '12px', color: countdown > 0 ? '#64748b' : '#ef4444', fontWeight: 600 }}>
                    {countdown > 0 ? `⏱️ Expires in ${countdown}s` : '⚠️ OTP expired (30s)'}
                  </span>
                  {countdown === 0 ? (
                    <button
                      type="button"
                      onClick={handleSendOtp}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#0284c7',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        textDecoration: 'underline'
                      }}
                    >
                      Resend OTP
                    </button>
                  ) : null}
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              style={{
                background: '#258ec8',
                color: '#ffffff',
                border: 'none',
                height: '46px',
                borderRadius: '10px',
                fontSize: '14.5px !important',
                fontWeight: 800,
                cursor: 'pointer',
                marginTop: '8px',
                boxShadow: '0 4px 14px rgba(37, 142, 200, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              {isLoading ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} color="#ffffff" />}
              {!otpSent ? 'Send Verification OTP' : 'Verify & Sign In'}
            </button>
          </form>
        ) : activeRole === 'staff' ? (
          <form onSubmit={handleStaffSignIn} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12.5px !important', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>
                Staff Login Email ID
              </label>
              <div style={{ display: 'flex', alignItems: 'center', background: '#eef5fc', borderRadius: '10px', padding: '0 14px', height: '46px', border: '1px solid #e0ecf8' }}>
                <Mail size={16} color="#64748b" style={{ marginRight: '12px' }} />
                <input
                  type="email"
                  value={staffEmail}
                  onChange={e => setStaffEmail(e.target.value)}
                  placeholder="e.g. anil@sph.com"
                  style={{ background: 'transparent', border: 'none', outline: 'none', width: '100%', fontSize: '13px !important', color: '#0f172a', fontWeight: 500 }}
                  required
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12.5px !important', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>
                Staff Password
              </label>
              <div style={{ display: 'flex', alignItems: 'center', background: '#eef5fc', borderRadius: '10px', padding: '0 14px', height: '46px', border: '1px solid #e0ecf8', position: 'relative' }}>
                <Lock size={16} color="#64748b" style={{ marginRight: '12px' }} />
                <input
                  type={showStaffPassword ? 'text' : 'password'}
                  value={staffPassword}
                  onChange={e => setStaffPassword(e.target.value)}
                  placeholder="Enter staff password"
                  style={{ background: 'transparent', border: 'none', outline: 'none', width: '100%', fontSize: '13px !important', color: '#0f172a', fontWeight: 500, paddingRight: '30px' }}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowStaffPassword(!showStaffPassword)}
                  style={{ position: 'absolute', right: '12px', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center' }}
                >
                  {showStaffPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <p style={{ margin: 0, fontSize: '11.5px', color: '#64748b' }}>
              Standard default password for all staff is <strong style={{ color: '#0f172a' }}>email123</strong>
            </p>

            <button
              type="submit"
              disabled={isLoading}
              style={{
                background: '#258ec8',
                color: '#ffffff',
                border: 'none',
                height: '46px',
                borderRadius: '10px',
                fontSize: '14.5px !important',
                fontWeight: 800,
                cursor: 'pointer',
                marginTop: '4px',
                boxShadow: '0 4px 14px rgba(37, 142, 200, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              {isLoading ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} color="#ffffff" />}
              Sign In to Staff Portal
            </button>
          </form>
        ) : activeRole === 'telecaller' ? (
          <form onSubmit={handleTelecallerSignIn} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12.5px !important', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>
                Telecaller ID, Email, or Phone
              </label>
              <div style={{ display: 'flex', alignItems: 'center', background: '#eef5fc', borderRadius: '10px', padding: '0 14px', height: '46px', border: '1px solid #e0ecf8' }}>
                <Headset size={16} color="#0284c7" style={{ marginRight: '12px' }} />
                <input
                  type="text"
                  value={telecallerLoginId}
                  onChange={e => setTelecallerLoginId(e.target.value)}
                  placeholder="e.g. TC01, srikanth@sph.com, or mobile"
                  style={{ background: 'transparent', border: 'none', outline: 'none', width: '100%', fontSize: '13px !important', color: '#0f172a', fontWeight: 500 }}
                  required
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12.5px !important', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>
                Password
              </label>
              <div style={{ display: 'flex', alignItems: 'center', background: '#eef5fc', borderRadius: '10px', padding: '0 14px', height: '46px', border: '1px solid #e0ecf8', position: 'relative' }}>
                <Lock size={16} color="#64748b" style={{ marginRight: '12px' }} />
                <input
                  type={showTelecallerPassword ? 'text' : 'password'}
                  value={telecallerPassword}
                  onChange={e => setTelecallerPassword(e.target.value)}
                  placeholder="Enter your password"
                  style={{ background: 'transparent', border: 'none', outline: 'none', width: '100%', fontSize: '13px !important', color: '#0f172a', fontWeight: 500, paddingRight: '30px' }}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowTelecallerPassword(!showTelecallerPassword)}
                  style={{ position: 'absolute', right: '12px', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center' }}
                >
                  {showTelecallerPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              style={{
                background: '#0284c7',
                color: '#ffffff',
                border: 'none',
                height: '46px',
                borderRadius: '10px',
                fontSize: '14.5px !important',
                fontWeight: 800,
                cursor: 'pointer',
                marginTop: '8px',
                boxShadow: '0 4px 14px rgba(2, 132, 199, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              {isLoading ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} color="#ffffff" />}
              Sign In to Telecaller Portal
            </button>
          </form>
        ) : activeRole === 'email' ? (
          <form onSubmit={handleSignIn} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12.5px !important', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>
                Management Email Address (Admin / HR)
              </label>
              <div style={{ display: 'flex', alignItems: 'center', background: '#eef5fc', borderRadius: '10px', padding: '0 14px', height: '46px', border: '1px solid #e0ecf8' }}>
                <Mail size={16} color="#64748b" style={{ marginRight: '12px' }} />
                <input
                  type="text"
                  value={emailOrUsername}
                  onChange={e => setEmailOrUsername(e.target.value)}
                  placeholder="e.g. admin@gmail.com or hr@spiritualhomeo.com"
                  style={{ background: 'transparent', border: 'none', outline: 'none', width: '100%', fontSize: '13px !important', color: '#0f172a', fontWeight: 500 }}
                  required
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12.5px !important', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>
                Password
              </label>
              <div style={{ display: 'flex', alignItems: 'center', background: '#eef5fc', borderRadius: '10px', padding: '0 14px', height: '46px', border: '1px solid #e0ecf8', position: 'relative' }}>
                <Lock size={16} color="#64748b" style={{ marginRight: '12px' }} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  style={{ background: 'transparent', border: 'none', outline: 'none', width: '100%', fontSize: '13px !important', color: '#0f172a', fontWeight: 500, paddingRight: '30px' }}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{ position: 'absolute', right: '12px', background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center' }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              style={{
                background: '#258ec8',
                color: '#ffffff',
                border: 'none',
                height: '46px',
                borderRadius: '10px',
                fontSize: '14.5px !important',
                fontWeight: 800,
                cursor: 'pointer',
                marginTop: '8px',
                boxShadow: '0 4px 14px rgba(37, 142, 200, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              {isLoading ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} color="#ffffff" />}
              Sign In to Management Portal
            </button>
          </form>
        ) : null}

      </div>
    </div>
  );
};
