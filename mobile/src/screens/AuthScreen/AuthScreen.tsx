import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Image, SafeAreaView, KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { getSafeDb, doc, getDoc, setDoc, collection, query, where, getDocs, onSnapshot } from '../../utils/firebaseSafe';
import {
  auth, UserRole, CanonicalBranchId, resolveCanonicalBranchId, BRANCHES,
  resolveStrictAuth, RECEPTION_DESK_DIRECTORY, DOCTOR_DIRECTORY, DEFAULT_TELECALLERS
} from '@app/shared';
import { sendSmsOtp, generate4DigitOtp, normalizePhoneForSms } from '../../services/smsOtpService';

export interface LoginSuccessData {
  role: UserRole;
  userName?: string;
  branchId: CanonicalBranchId;
  branchName: string;
  branchPhone: string;
  staffId?: string;
}
interface AuthScreenProps {
  onLoginSuccess?: (data: LoginSuccessData) => void;
}

// Strictly authorized 4 Branch Receptionist phone numbers
export const AUTHORIZED_RECEPTION_BRANCHES = RECEPTION_DESK_DIRECTORY;

// Safe in-file fallback for branch directory to guarantee 0 runtime crashes
export const SAFE_BRANCHES: Record<CanonicalBranchId, { id: CanonicalBranchId; name: string; phone: string; address?: string }> = {
  kphb: { id: 'kphb', name: 'KPHB', phone: '+91 90301 76176' },
  chandanagar: { id: 'chandanagar', name: 'Chandanagar', phone: '+91 95531 76176' },
  dilshuknagar: { id: 'dilshuknagar', name: 'Dilshuknagar', phone: '+91 98041 76176' },
  nallagandla: { id: 'nallagandla', name: 'Nallagandla', phone: '+91 91321 76176' },
};

export function safeResolveCanonicalBranchId(input?: string | null): CanonicalBranchId {
  try {
    if (typeof resolveCanonicalBranchId === 'function') {
      const res = resolveCanonicalBranchId(input);
      if (res) return res;
    }
  } catch (_) {}

  if (!input || typeof input !== 'string') return 'kphb';
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length >= 10) {
    const last10 = digits.slice(-10);
    if (last10 === '9030176176') return 'kphb';
    if (last10 === '9553176176') return 'chandanagar';
    if (last10 === '9804176176') return 'dilshuknagar';
    if (last10 === '9132176176') return 'nallagandla';
  }
  const lower = trimmed.toLowerCase();
  if (lower.includes('kphb') || lower.includes('kpb')) return 'kphb';
  if (lower.includes('chanda') || lower.includes('chn') || lower.includes('cngr')) return 'chandanagar';
  if (lower.includes('dilshuk') || lower.includes('dsn')) return 'dilshuknagar';
  if (lower.includes('nalla') || lower.includes('ngl')) return 'nallagandla';
  return 'kphb';
}

export function getBranchRecord(canonical: CanonicalBranchId) {
  return (BRANCHES && BRANCHES[canonical]) || SAFE_BRANCHES[canonical] || SAFE_BRANCHES.kphb;
}


export function getInstantMobileAuthData(input: string, loginMethod: string = 'otp'): LoginSuccessData | null {
  if (loginMethod !== 'staff') {
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
  }
  return null;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onLoginSuccess }) => {
  const [loginMethod, setLoginMethod] = useState<'otp' | 'staff' | 'email' | 'telecaller'>('otp');
  const [telecallerLoginId, setTelecallerLoginId] = useState('');
  const [telecallerPassword, setTelecallerPassword] = useState('');
  const [showTelecallerPassword, setShowTelecallerPassword] = useState(false);
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [staffEmail, setStaffEmail] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [showStaffPassword, setShowStaffPassword] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [displayedOtp, setDisplayedOtp] = useState('');
  const [smsNotice, setSmsNotice] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [liveStaffChips, setLiveStaffChips] = useState<any[]>([]);
  const [verifiedAuthData, setVerifiedAuthData] = useState<LoginSuccessData | null>(null);
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

  useEffect(() => {
    const activeDb = getSafeDb();
    if (!activeDb) return;
    const unsubStaff = onSnapshot(collection(activeDb, 'staff'), (snap) => {
      const list: any[] = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() });
      });
      setLiveStaffChips(list);
    }, (err) => console.warn('Auth live staff listener notice:', err));

    return () => {
      unsubStaff();
    };
  }, []);

  // Helper to dynamically detect Role, User Name, and Branch from input or Firestore
  const detectRoleAndBranch = async (input: string): Promise<LoginSuccessData | null> => {
    const cleanInput = input.trim();
    const digits = cleanInput.replace(/\D/g, '');
    const clean10 = digits.length > 10 ? digits.slice(-10) : digits;
    const lower = cleanInput.toLowerCase();

    const activeDb = getSafeDb();

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

    // Check In-Memory Live Staff Chips (0ms delay)
    if (liveStaffChips && liveStaffChips.length > 0) {
      for (const item of liveStaffChips) {
        const sPhone = String(item.mobile || item.phone || '').replace(/\D/g, '');
        const sClean10 = sPhone.length > 10 ? sPhone.slice(-10) : sPhone;
        const sName = String(item.name || '').toLowerCase();

        if (
          (cleanInput && item.id === cleanInput) ||
          (clean10 && sClean10 && clean10 === sClean10) ||
          (lower && sName && (sName === lower || sName.includes(lower) || lower.includes(sName))) ||
          (digits && sPhone && digits.length >= 10 && (digits === sPhone || clean10 === sClean10))
        ) {
          let detectedRole = item.role || item.category || item.department;
          if (!detectedRole) {
            detectedRole = sName.includes('reception') ? 'reception' : 'staff';
          }
          const canonical = safeResolveCanonicalBranchId(item.branch);
          const branchItem = getBranchRecord(canonical);
          return {
            role: detectedRole as any,
            userName: item.name || (detectedRole === 'reception' ? 'Reception' : 'Staff Member'),
            branchId: canonical,
            branchName: item.branch ? (item.branch.includes('Branch') ? item.branch : `${item.branch} Branch`) : `${branchItem.name} Branch`,
            branchPhone: item.mobile || item.phone || digits,
            staffId: item.id
          };
        }
      }
    }


    // 5. Parallel Firestore Lookup as Fallback with 2s timeout (prevents hanging!)
    if (activeDb) {
      try {
        const timeoutPromise = new Promise<{ docs: any[]; empty: boolean }>((resolve) =>
          setTimeout(() => resolve({ docs: [], empty: true }), 2000)
        );
        const [staffSnap, docSnap] = await Promise.all([
          Promise.race([getDocs(collection(activeDb, 'staff')), timeoutPromise]),
          digits.length >= 8 ? Promise.race([getDocs(collection(activeDb, 'doctors')), timeoutPromise]) : Promise.resolve({ docs: [], empty: true } as any)
        ]);

        // Check staff results
        for (const d of staffSnap.docs) {
          const data = d.data();
          const sPhone = String(data.mobile || data.phone || '').replace(/\D/g, '');
          const sClean10 = sPhone.length > 10 ? sPhone.slice(-10) : sPhone;
          const sName = String(data.name || '').toLowerCase();

          if (sClean10 && RECEPTION_DESK_DIRECTORY[sClean10]) {
            const recInfo = RECEPTION_DESK_DIRECTORY[sClean10];
            return {
              role: 'reception',
              userName: recInfo.userName,
              branchId: recInfo.branchId,
              branchName: recInfo.branchName,
              branchPhone: recInfo.formattedPhone,
              staffId: d.id
            };
          }

          if (
            (cleanInput && d.id === cleanInput) ||
            (clean10 && sClean10 && clean10 === sClean10) ||
            (lower && sName && sName === lower) ||
            (digits && sPhone && digits.length >= 10 && (digits === sPhone || clean10 === sClean10))
          ) {
            let detectedRole = data.role || data.category || data.department;
            if (!detectedRole) {
              detectedRole = sName.includes('reception') ? 'reception' : 'staff';
            }
            const canonical = safeResolveCanonicalBranchId(data.branchId || data.branch || data.branchName);
            return {
              role: detectedRole as any,
              userName: data.name || (detectedRole === 'reception' ? 'Reception' : 'Staff Member'),
              branchId: canonical,
              branchName: data.branch ? (data.branch.includes('Branch') ? data.branch : `${data.branch} Branch`) : 'KPHB Branch',
              branchPhone: data.mobile || data.phone || digits,
              staffId: d.id
            };
          }
        }

        // Check doctor results
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
              const canonical = safeResolveCanonicalBranchId(data.branchId || data.branch || data.branchName);
              return {
                role: 'doctor',
                userName: data.name || 'Dr. Physician',
                branchId: canonical,
                branchName: data.branch || 'Medical Center',
                branchPhone: digits,
                staffId: d.id
              };
            }
          }
        }
      } catch (e) {
        console.warn('Firestore parallel lookup notice:', e);
      }
    }


    // Not found / Deleted / Unauthorized
    return null;

    // Not found / Deleted / Unauthorized
    return null;
  };

  // SEND 4-DIGIT REAL SMS OTP (Truly instant UI transition, zero loading delay!)
  const handleSendOTP = async () => {
    const rawInput = phoneNumber.trim();
    if (!rawInput) {
      Alert.alert('Phone Number Required', 'Please enter your registered mobile number.');
      return;
    }
    const { clean10 } = normalizePhoneForSms(rawInput);
    if (!clean10 || clean10.length < 10) {
      Alert.alert('Invalid Number', 'Please enter a valid 10-digit mobile number.');
      return;
    }

    setIsSubmitting(true);
    const authData = await detectRoleAndBranch(rawInput);
    setIsSubmitting(false);

    if (!authData) {
      Alert.alert(
        'Access Denied',
        `The mobile number +91 ${clean10} is not registered in the clinic database.\n\nPlease contact HR or Clinic Administrator.`
      );
      return;
    }

    // Role-specific constraints
    if (loginMethod === 'staff') {
      if (authData.role !== 'staff') {
        Alert.alert(
          'Access Denied',
          `The mobile number +91 ${clean10} is not registered in the clinic database.\n\nPlease contact HR or Clinic Administrator.`
        );
        return;
      }
    } else if (loginMethod === 'otp') {
      if (authData.role !== 'reception' && authData.role !== 'doctor') {
        Alert.alert(
          'Access Denied',
          `The mobile number +91 ${clean10} is not registered as a Doctor or Reception desk.\n\n${authData.role === 'staff' ? 'Staff members must use the "Staff Login" tab.' : 'Please contact HR or Clinic Administrator.'}`
        );
        return;
      }
    }

    const generatedOtp = generate4DigitOtp();
    const expiry = Date.now() + 5 * 60 * 1000; // 5 minutes validity

    setSentOtp(generatedOtp);
    setOtpExpiresAt(expiry);
    setVerifiedAuthData(authData);

    // 1. Transition to OTP step with default 1234
    setIsSubmitting(false);
    setOtpSent(true);
    setOtpCode('1234');
    setCountdown(30);
    setSmsNotice(`Default verification OTP is 1234 (dispatched to +91 ${clean10}).`);

    // 2. Save OTP to Firestore in background for audit & verification
    const activeDb = getSafeDb();
    if (activeDb && clean10) {
      setDoc(doc(activeDb, 'auth_otps', clean10), {
        phone: clean10,
        otp: generatedOtp,
        expiresAt: expiry,
        role: authData.role,
        staffId: authData.staffId || null,
        userName: authData.userName || 'Staff Member',
        branchName: authData.branchName || 'KPHB Branch',
        createdAt: new Date().toISOString()
      }).catch(e => console.warn('Error saving background OTP to Firestore:', e));
    }

    // 3. Dispatch real SMS via SMS gateway
    sendSmsOtp(clean10, generatedOtp).then(smsResult => {
      if (smsResult.success) {
        setSmsNotice(`A 4-digit verification code has been dispatched via SMS to +91 ${clean10}.`);
      } else {
        setSmsNotice(`SMS Dispatch: ${smsResult.message}`);
      }
    }).catch(() => {
      setSmsNotice(`SMS dispatch failed. Please request a new OTP.`);
    });
  };

  // VERIFY 4-DIGIT REAL SMS OTP
  const handleVerifyOTP = async () => {
    const cleanOtp = otpCode.trim();
    if (!cleanOtp || cleanOtp.length !== 4) {
      Alert.alert('OTP Required', 'Please enter the 4-digit OTP received via SMS.');
      return;
    }

    const rawInput = phoneNumber.trim();
    const { clean10 } = normalizePhoneForSms(rawInput);

    // 1. Check expiration (5 minutes validity)
    if (otpExpiresAt > 0 && Date.now() > otpExpiresAt) {
      Alert.alert('OTP Expired', 'The OTP has expired. Please click Resend OTP to receive a new code.');
      return;
    }

    // 2. In-Memory Match against dispatched SMS OTP or default 1234
    let isOtpValid = Boolean(cleanOtp === '1234' || (sentOtp && cleanOtp === sentOtp));

    // 3. Fallback to Firestore OTP check with 1.5s timeout
    if (!isOtpValid && clean10) {
      const activeDb = getSafeDb();
      if (activeDb) {
        try {
          const timeoutPromise = new Promise<null>(resolve => setTimeout(() => resolve(null), 1500));
          const otpSnap = await Promise.race([
            getDoc(doc(activeDb, 'auth_otps', clean10)),
            timeoutPromise
          ]);
          if (otpSnap && otpSnap.exists()) {
            const data = otpSnap.data();
            if (data.otp === cleanOtp && Date.now() <= (data.expiresAt || 0)) {
              isOtpValid = true;
            }
          }
        } catch (e) {
          console.warn('Error verifying Firestore OTP:', e);
        }
      }
    }

    if (!isOtpValid) {
      Alert.alert('Invalid OTP', 'The OTP code is incorrect. Please check your SMS and enter the correct 4-digit code.');
      return;
    }

    // 4. Instant Login Session (0ms delay!)
    const authData = verifiedAuthData || (await detectRoleAndBranch(rawInput));
    setIsSubmitting(false);

    if (!authData) {
      Alert.alert('Access Denied', 'Account not recognized or removed by Admin/HR.');
      return;
    }

    if (loginMethod === 'staff' && authData.role !== 'staff') {
      Alert.alert(
        'Access Denied',
        'Only registered clinic staff can sign in through the Staff tab.'
      );
      return;
    }

    if (loginMethod === 'otp' && authData.role !== 'reception' && authData.role !== 'doctor') {
      Alert.alert(
        'Access Denied',
        'Only authorized Doctors and Branch Receptionists can sign in through this tab.'
      );
      return;
    }

    if (onLoginSuccess) {
      // Direct Admin / HR to their dedicated credentials tab
      if (authData.role === 'admin' || authData.role === 'hr') {
        Alert.alert(
          'Admin / HR Account Detected',
          `Hello ${authData.userName}, please use the 'Admin / HR' tab to sign in.`,
          [
            {
              text: 'Switch to Admin / HR',
              onPress: () => {
                setLoginMethod('email');
              }
            },
            { text: 'Cancel', style: 'cancel' }
          ]
        );
        return;
      }
      onLoginSuccess(authData);
    } else {
      Alert.alert('Access Granted', `Welcome ${authData.userName} (${authData.role.toUpperCase()})`);
    }
  };

  // Helper to resolve staff login using Email ID and Password
  const handleStaffLogin = async () => {
    const cleanEmail = staffEmail.trim().toLowerCase();
    const cleanPass = staffPassword.trim();

    if (!cleanEmail) {
      Alert.alert('Email Required', 'Please enter your registered staff email ID (e.g. anil@sph.com).');
      return;
    }
    if (!cleanPass) {
      Alert.alert('Password Required', 'Please enter your staff login password.');
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Search live staff chips first (0ms delay)
      let matchedStaff = (liveStaffChips || []).find((s: any) => {
        const sEmail = String(s.email || '').trim().toLowerCase();
        const fallbackEmail = `${String(s.name || '').toLowerCase().replace(/[^a-z0-9]/g, '')}@sph.com`;
        return sEmail === cleanEmail || fallbackEmail === cleanEmail;
      });

      // 2. Fallback to Firestore staff collection if not found in chips
      if (!matchedStaff) {
        const activeDb = getSafeDb();
        if (activeDb) {
          const snap = await getDocs(collection(activeDb, 'staff'));
          for (const d of snap.docs) {
            const data = d.data();
            const sEmail = String(data.email || '').trim().toLowerCase();
            const fallbackEmail = `${String(data.name || '').toLowerCase().replace(/[^a-z0-9]/g, '')}@sph.com`;
            if (sEmail === cleanEmail || fallbackEmail === cleanEmail) {
              matchedStaff = { id: d.id, ...data };
              break;
            }
          }
        }
      }

      if (!matchedStaff) {
        setIsSubmitting(false);
        Alert.alert(
          'Staff Member Not Found',
          `No regular staff member found with email "${cleanEmail}".\n\nPlease check your email ID or contact HR / Admin.`
        );
        return;
      }

      // Check if this record is Doctor or Reception
      const matchedRole = String(matchedStaff.role || '').toLowerCase();
      if (matchedRole.includes('doctor') || matchedRole.includes('reception')) {
        setIsSubmitting(false);
        Alert.alert(
          'Access Denied',
          'Doctors and Receptionists must sign in using the "Doctor / Reception" tab with mobile OTP.'
        );
        return;
      }

      // 3. Verify Password (Standard default: email123)
      const expectedPassword = String(matchedStaff.password || 'email123').trim();
      if (cleanPass !== expectedPassword) {
        setIsSubmitting(false);
        Alert.alert(
          'Incorrect Password',
          'The password you entered is incorrect. Standard default password is email123, or contact HR if changed.'
        );
        return;
      }

      // 4. Success Login!
      setIsSubmitting(false);
      const canonical = safeResolveCanonicalBranchId(matchedStaff.branchId || matchedStaff.branch);
      const authData: LoginSuccessData = {
        role: 'staff',
        userName: matchedStaff.name || 'Staff Member',
        branchId: canonical,
        branchName: matchedStaff.branch ? (matchedStaff.branch.includes('Branch') ? matchedStaff.branch : `${matchedStaff.branch} Branch`) : 'KPHB Branch',
        branchPhone: matchedStaff.mobile || matchedStaff.phone || '',
        staffId: matchedStaff.id
      };

      if (onLoginSuccess) {
        onLoginSuccess(authData);
      } else {
        Alert.alert('Access Granted', `Welcome ${authData.userName} (Staff Portal)`);
      }
    } catch (err: any) {
      console.error('Staff login error:', err);
      setIsSubmitting(false);
      Alert.alert('Login Error', err?.message || 'Failed to authenticate staff.');
    }
  };

  const handleTelecallerLogin = async () => {
    const cleanId = telecallerLoginId.trim();
    const cleanPass = telecallerPassword.trim();

    if (!cleanId) {
      Alert.alert('Login ID Required', 'Please enter your Telecaller ID, Email, or registered Phone Number.');
      return;
    }
    if (!cleanPass) {
      Alert.alert('Password Required', 'Please enter your password.');
      return;
    }

    setIsSubmitting(true);
    try {
      const activeDb = getSafeDb();
      if (!activeDb) {
        setIsSubmitting(false);
        Alert.alert('Database Offline', 'Unable to connect to clinic database.');
        return;
      }

      let matchedTelecaller: any = null;
      const snap = await getDocs(collection(activeDb, 'telecallers'));
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
        const staffSnap = await getDocs(query(collection(activeDb, 'staff'), where('role', '==', 'telecaller')));
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
        const lowerClean = cleanId.toLowerCase();
        const digitsClean = cleanId.replace(/\D/g, '');
        matchedTelecaller = (DEFAULT_TELECALLERS || []).find((t: any) =>
          t.telecallerId.toLowerCase() === lowerClean ||
          t.email.toLowerCase() === lowerClean ||
          (digitsClean.length >= 10 && t.phone.endsWith(digitsClean.slice(-10)))
        );
      }

      if (!matchedTelecaller) {
        setIsSubmitting(false);
        Alert.alert(
          'Account Not Found',
          `No telecaller account found matching "${cleanId}".\n\nPlease check your credentials or contact Administrator / HR.`
        );
        return;
      }

      if (matchedTelecaller.isActive === false || matchedTelecaller.status === 'inactive' || matchedTelecaller.status === 'deactivated') {
        setIsSubmitting(false);
        Alert.alert(
          'Account Deactivated',
          'Your telecaller account has been deactivated. Please contact Administrator or HR to restore access.'
        );
        return;
      }

      const expectedPassword = String(matchedTelecaller.password || 'email123').trim();
      if (cleanPass !== expectedPassword) {
        setIsSubmitting(false);
        Alert.alert('Incorrect Password', 'The password you entered is incorrect. Please try again.');
        return;
      }

      setIsSubmitting(false);
      const canonical = safeResolveCanonicalBranchId(matchedTelecaller.assignedBranch || matchedTelecaller.branch);
      const authData: LoginSuccessData = {
        role: 'telecaller',
        userName: matchedTelecaller.name || 'Telecaller',
        branchId: canonical || 'kphb',
        branchName: matchedTelecaller.assignedBranch || 'All Branches',
        branchPhone: matchedTelecaller.phone || matchedTelecaller.mobile || '',
        staffId: matchedTelecaller.telecallerId || matchedTelecaller.id
      };

      if (onLoginSuccess) {
        onLoginSuccess(authData);
      } else {
        Alert.alert('Access Granted', `Welcome ${authData.userName} (Telecaller Portal)`);
      }
    } catch (err: any) {
      setIsSubmitting(false);
      Alert.alert('Login Error', err?.message || 'Failed to authenticate telecaller.');
    }
  };

  const handleEmailLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Required Fields', 'Please enter your email address and password.');
      return;
    }

    const cleanInput = email.trim().toLowerCase();
    const cleanPass = password.trim();

    if (cleanInput === 'hr@sph.com' || cleanInput.includes('hr')) {
      if (cleanPass !== 'hr@sph123') {
        Alert.alert('Incorrect Password', 'Invalid password for HR login. Expected password: hr@sph123');
        return;
      }
    } else if (cleanInput.includes('admin')) {
      if (cleanPass !== 'admin123') {
        Alert.alert('Incorrect Password', 'Invalid password for Admin login. Expected password: admin123');
        return;
      }
    }

    setIsSubmitting(true);
    const authData = await detectRoleAndBranch(email);
    setIsSubmitting(false);

    if (!authData) {
      Alert.alert('Access Denied', 'Account not recognized or removed by Admin/HR.');
      return;
    }

    // Strictly ensure only Admin and HR can log in through the Email tab
    if (authData.role !== 'admin' && authData.role !== 'hr') {
      const isDocOrRec = authData.role === 'doctor' || authData.role === 'reception';
      Alert.alert(
        'Incorrect Login Tab',
        `Hello ${authData.userName}, this tab is only for Admin & HR logins.\n\nPlease switch to the '${isDocOrRec ? 'Doctor / Reception' : 'Staff Login'}' tab to sign in.`,
        [
          {
            text: `Switch to ${isDocOrRec ? 'Doctor / Reception' : 'Staff Login'}`,
            onPress: () => {
              setLoginMethod(isDocOrRec ? 'otp' : 'staff');
              setPhoneNumber(authData.branchPhone ? authData.branchPhone.replace(/\D/g, '').slice(-10) : '');
              setOtpSent(false);
              setOtpCode('');
            }
          },
          { text: 'Cancel', style: 'cancel' }
        ]
      );
      return;
    }

    if (onLoginSuccess) {
      onLoginSuccess(authData);
    } else {
      Alert.alert('Access Granted', `Welcome to ${authData.role.toUpperCase()} Portal`);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Top Logo */}
          <View style={styles.logoWrapper}>
            <Image
              source={require('../../assets/sh_logo.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>

          {/* Page Headers */}
          <View style={styles.headerSection}>
            <Text style={styles.portalTitle}>Spiritual Homeopathy</Text>
            <Text style={styles.portalSubtitle}>Doctor, Staff, HR, Reception & Admin Portal</Text>
          </View>

          {/* White Card Box */}
          <View style={styles.whiteCard}>
            {/* 3 Unified Login Tabs: Mobile OTP vs Staff Login vs Email/Password */}
            <View style={styles.tabBarContainer}>
              <TouchableOpacity
                style={[styles.tabButton, loginMethod === 'otp' && styles.tabButtonActive]}
                onPress={() => { setLoginMethod('otp'); setOtpSent(false); }}
              >
                <Ionicons
                  name="call-outline"
                  size={15}
                  color={loginMethod === 'otp' ? '#258ec8' : '#64748b'}
                  style={{ marginRight: 4 }}
                />
                <Text style={[styles.tabButtonText, loginMethod === 'otp' && styles.tabButtonTextActive]}>
                  Doctor / Reception
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.tabButton, loginMethod === 'staff' && styles.tabButtonActive]}
                onPress={() => { setLoginMethod('staff'); setOtpCode(''); setOtpSent(false); }}
              >
                <Ionicons
                  name="person-outline"
                  size={15}
                  color={loginMethod === 'staff' ? '#258ec8' : '#64748b'}
                  style={{ marginRight: 4 }}
                />
                <Text style={[styles.tabButtonText, loginMethod === 'staff' && styles.tabButtonTextActive]}>
                  Staff Login
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.tabButton, loginMethod === 'email' && styles.tabButtonActive]}
                onPress={() => setLoginMethod('email')}
              >
                <Ionicons
                  name="mail-outline"
                  size={13}
                  color={loginMethod === 'email' ? '#258ec8' : '#64748b'}
                  style={{ marginRight: 3 }}
                />
                <Text style={[styles.tabButtonText, loginMethod === 'email' && styles.tabButtonTextActive]}>
                  Admin / HR
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.tabButton, loginMethod === 'telecaller' && styles.tabButtonActive]}
                onPress={() => setLoginMethod('telecaller')}
              >
                <Ionicons
                  name="headset-outline"
                  size={13}
                  color={loginMethod === 'telecaller' ? '#0284c7' : '#64748b'}
                  style={{ marginRight: 3 }}
                />
                <Text style={[styles.tabButtonText, loginMethod === 'telecaller' && styles.tabButtonTextActive]}>
                  Telecaller
                </Text>
              </TouchableOpacity>
            </View>

            {loginMethod === 'staff' && (
              <>
                <Text style={styles.sectionSubtitle}>Regular Staff Login (Email & Password)</Text>

                {/* Staff Email ID Input */}
                <View style={styles.inputContainer}>
                  <Ionicons name="mail-outline" size={18} color="#258ec8" style={{ marginRight: 8 }} />
                  <TextInput
                    style={styles.inputField}
                    placeholder="Staff Login Email (e.g. anil@sph.com)"
                    placeholderTextColor="#94a3b8"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    value={staffEmail}
                    onChangeText={setStaffEmail}
                  />
                </View>

                {/* Live Real-time Database Staff Match Badge */}
                {(() => {
                  const clean = staffEmail.trim().toLowerCase();
                  if (!clean || clean.length < 3) return null;

                  const matched = (liveStaffChips || []).find((s: any) => {
                    const sEmail = String(s.email || '').trim().toLowerCase();
                    const fallbackEmail = `${String(s.name || '').toLowerCase().replace(/[^a-z0-9]/g, '')}@sph.com`;
                    return sEmail === clean || fallbackEmail === clean;
                  });

                  if (matched) {
                    return (
                      <View style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingVertical: 7,
                        paddingHorizontal: 12,
                        borderRadius: 8,
                        backgroundColor: '#f0fdf4',
                        borderColor: '#bbf7d0',
                        borderWidth: 1,
                        marginBottom: 12
                      }}>
                        <Ionicons name="checkmark-circle" size={15} color="#16a34a" style={{ marginRight: 6 }} />
                        <Text style={{ fontSize: 12, color: '#15803d', fontWeight: '700' }}>
                          {matched.name || 'Staff Member'} ({matched.branch || 'Clinic'} Branch)
                        </Text>
                      </View>
                    );
                  }

                  return null;
                })()}

                {/* Staff Password Input */}
                <View style={styles.inputContainer}>
                  <Ionicons name="lock-closed-outline" size={18} color="#258ec8" style={{ marginRight: 8 }} />
                  <TextInput
                    style={[styles.inputField, { flex: 1 }]}
                    placeholder="Staff Password"
                    placeholderTextColor="#94a3b8"
                    secureTextEntry={!showStaffPassword}
                    value={staffPassword}
                    onChangeText={setStaffPassword}
                  />
                  <TouchableOpacity onPress={() => setShowStaffPassword(!showStaffPassword)} style={{ padding: 4 }}>
                    <Ionicons name={showStaffPassword ? "eye-off-outline" : "eye-outline"} size={18} color="#64748b" />
                  </TouchableOpacity>
                </View>

                <Text style={{ fontSize: 11, color: '#64748b', marginBottom: 14, marginTop: -4 }}>
                  Standard default password for all staff is <Text style={{ fontWeight: '700', color: '#0f172a' }}>email123</Text>
                </Text>

                <TouchableOpacity
                  style={[styles.primaryButton, { backgroundColor: '#258ec8' }]}
                  onPress={handleStaffLogin}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Sign In to Staff Portal</Text>
                  )}
                </TouchableOpacity>
              </>
            )}

            {loginMethod === 'otp' && (
              <>
                <Text style={styles.sectionSubtitle}>Doctor & Branch Receptionist Login</Text>

                {!otpSent ? (
                  <>
                    {/* Phone Input */}
                    <View style={styles.inputContainer}>
                      <Ionicons name="call-outline" size={18} color="#258ec8" style={{ marginRight: 8 }} />
                      <TextInput
                        style={styles.inputField}
                        placeholder="Mobile Number (e.g. 8125260176, 9030176176)"
                        placeholderTextColor="#94a3b8"
                        keyboardType="phone-pad"
                        value={phoneNumber}
                        onChangeText={setPhoneNumber}
                        maxLength={13}
                      />
                    </View>

                    {/* Live Detected Role Badge */}
                    {(() => {
                      const cleanDigits = phoneNumber.replace(/\D/g, '');
                      const clean10 = cleanDigits.length > 10 ? cleanDigits.slice(-10) : cleanDigits;
                      if (!clean10 || clean10.length < 10) return null;

                      const detected = resolveStrictAuth(phoneNumber);
                      if (detected && (detected.isDoctor || detected.isReception)) {
                        const isDoc = detected.isDoctor;
                        return (
                          <View style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            paddingVertical: 7,
                            paddingHorizontal: 12,
                            borderRadius: 8,
                            backgroundColor: isDoc ? '#eff6ff' : '#ecfdf5',
                            borderColor: isDoc ? '#bfdbfe' : '#a7f3d0',
                            borderWidth: 1,
                            marginBottom: 12
                          }}>
                            <Ionicons
                              name={isDoc ? 'medkit' : 'business'}
                              size={15}
                              color={isDoc ? '#2563eb' : '#059669'}
                              style={{ marginRight: 6 }}
                            />
                            <Text style={{
                              fontSize: 12,
                              fontWeight: '700',
                              color: isDoc ? '#1d4ed8' : '#047857'
                            }}>
                              {isDoc
                                ? `Doctor Profile: ${detected.userName} (${detected.branchName})`
                                : `Branch Reception: ${detected.userName}`}
                            </Text>
                          </View>
                        );
                      }

                      const isStaff = (liveStaffChips || []).some(s => {
                        const sPhone = String(s.mobile || s.phone || '').replace(/\D/g, '');
                        return sPhone.endsWith(clean10);
                      });

                      return (
                        <View style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          paddingVertical: 7,
                          paddingHorizontal: 12,
                          borderRadius: 8,
                          backgroundColor: '#fef2f2',
                          borderColor: '#fecaca',
                          borderWidth: 1,
                          marginBottom: 12
                        }}>
                          <Ionicons name="close-circle" size={15} color="#dc2626" style={{ marginRight: 6 }} />
                          <Text style={{ fontSize: 12, color: '#b91c1c', fontWeight: '600' }}>
                            {isStaff
                              ? 'Staff number - Please use "Staff Login" tab'
                              : 'Mobile number not registered as Doctor or Reception'}
                          </Text>
                        </View>
                      );
                    })()}

                    {/* Send OTP Primary Button */}
                    <TouchableOpacity style={styles.primaryButton} onPress={handleSendOTP} disabled={isSubmitting}>
                      {isSubmitting ? (
                        <ActivityIndicator color="#ffffff" />
                      ) : (
                        <Text style={styles.primaryButtonText}>Send Verification OTP</Text>
                      )}
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    {/* OTP Code Input */}
                    <View style={styles.inputContainer}>
                      <Ionicons name="lock-closed-outline" size={18} color="#258ec8" style={{ marginRight: 8 }} />
                      <TextInput
                        style={styles.inputField}
                        placeholder="Enter 4-Digit OTP"
                        placeholderTextColor="#94a3b8"
                        keyboardType="number-pad"
                        value={otpCode}
                        onChangeText={setOtpCode}
                        maxLength={4}
                      />
                    </View>

                    {/* 30-Second Countdown & Resend Option */}
                    <View style={{ alignItems: 'center', marginBottom: 12 }}>
                      {countdown > 0 ? (
                        <Text style={{ fontSize: 13, color: '#64748b', fontWeight: '500' }}>
                          OTP expires in <Text style={{ color: '#ef4444', fontWeight: '700' }}>{countdown}s</Text>
                        </Text>
                      ) : (
                        <TouchableOpacity
                          onPress={handleSendOTP}
                          style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 4 }}
                          disabled={isSubmitting}
                        >
                          <Ionicons name="refresh-outline" size={16} color="#258ec8" style={{ marginRight: 4 }} />
                          <Text style={{ fontSize: 13, color: '#258ec8', fontWeight: '700' }}>Resend 4-Digit OTP</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    <TouchableOpacity style={styles.primaryButton} onPress={handleVerifyOTP} disabled={isSubmitting}>
                      {isSubmitting ? (
                        <ActivityIndicator color="#ffffff" />
                      ) : (
                        <Text style={styles.primaryButtonText}>Verify & Sign In</Text>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity onPress={() => setOtpSent(false)} style={{ marginTop: 12 }}>
                      <Text style={styles.linkText}>Change Mobile Number</Text>
                    </TouchableOpacity>
                  </>
                )}
              </>
            )}

            {loginMethod === 'email' && (
              <>
                <Text style={styles.sectionSubtitle}>Admin & HR Management Login</Text>

                {/* Email Fields */}
                <View style={styles.inputContainer}>
                  <Ionicons name="mail-outline" size={18} color="#258ec8" style={{ marginRight: 8 }} />
                  <TextInput
                    style={styles.inputField}
                    placeholder="Email Address (e.g. admin@gmail.com)"
                    placeholderTextColor="#94a3b8"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    value={email}
                    onChangeText={setEmail}
                  />
                </View>

                <View style={styles.inputContainer}>
                  <Ionicons name="key-outline" size={18} color="#258ec8" style={{ marginRight: 8 }} />
                  <TextInput
                    style={styles.inputField}
                    placeholder="Password"
                    placeholderTextColor="#94a3b8"
                    secureTextEntry={!showPassword}
                    value={password}
                    onChangeText={setPassword}
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword(!showPassword)}
                    style={{ padding: 6, marginLeft: 4 }}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={20}
                      color="#64748b"
                    />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity style={styles.primaryButton} onPress={handleEmailLogin} disabled={isSubmitting}>
                  {isSubmitting ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Sign In to Portal</Text>
                  )}
                </TouchableOpacity>
              </>
            )}

            {loginMethod === 'telecaller' && (
              <>
                <Text style={styles.sectionSubtitle}>Telecaller Portal Sign In</Text>

                {/* Telecaller Login ID */}
                <View style={styles.inputContainer}>
                  <Ionicons name="headset-outline" size={18} color="#0284c7" style={{ marginRight: 8 }} />
                  <TextInput
                    style={styles.inputField}
                    placeholder="Telecaller ID, Email, or Phone (e.g. TC01)"
                    placeholderTextColor="#94a3b8"
                    autoCapitalize="none"
                    value={telecallerLoginId}
                    onChangeText={setTelecallerLoginId}
                  />
                </View>

                {/* Telecaller Password */}
                <View style={styles.inputContainer}>
                  <Ionicons name="lock-closed-outline" size={18} color="#64748b" style={{ marginRight: 8 }} />
                  <TextInput
                    style={[styles.inputField, { flex: 1 }]}
                    placeholder="Telecaller Password"
                    placeholderTextColor="#94a3b8"
                    secureTextEntry={!showTelecallerPassword}
                    value={telecallerPassword}
                    onChangeText={setTelecallerPassword}
                  />
                  <TouchableOpacity
                    onPress={() => setShowTelecallerPassword(!showTelecallerPassword)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons
                      name={showTelecallerPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={20}
                      color="#64748b"
                    />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={[styles.primaryButton, { backgroundColor: '#0284c7' }]}
                  onPress={handleTelecallerLogin}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Sign In to Telecaller Portal</Text>
                  )}
                </TouchableOpacity>
              </>
            )}

            {/* Role Info Footer */}
            <View style={styles.branchListContainer}>
              <Text style={styles.branchListHeading}>LOGIN ACCOUNTS ACCESS:</Text>
              <Text style={styles.branchItemText}>• Doctor, Staff & Reception: Mobile Number OTP</Text>
              <Text style={styles.branchItemText}>• Admin & HR: Email & Password Sign In</Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 36,
  },
  logoWrapper: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logoImage: {
    width: 220,
    height: 60,
  },
  headerSection: {
    alignItems: 'center',
    marginBottom: 28,
  },
  portalTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1e293b',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  portalSubtitle: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
  },
  whiteCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 20,
    elevation: 4,
  },
  tabBarContainer: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 2,
    borderRadius: 10,
  },
  tabButtonActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  tabButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
  },
  tabButtonTextActive: {
    color: '#258ec8',
    fontWeight: '800',
  },
  sectionSubtitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 14,
    textAlign: 'center',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 52,
    marginBottom: 18,
    backgroundColor: '#ffffff',
  },
  phoneIcon: {
    fontSize: 18,
    marginRight: 12,
    color: '#64748b',
  },
  inputField: {
    flex: 1,
    fontSize: 14.5,
    color: '#0f172a',
    height: '100%',
  },
  primaryButton: {
    backgroundColor: '#258ec8',
    borderRadius: 14,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#258ec8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 15.5,
    fontWeight: '700',
  },
  linkText: {
    color: '#258ec8',
    fontSize: 13.5,
    fontWeight: '600',
    textAlign: 'center',
  },
  branchListContainer: {
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  branchListHeading: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94a3b8',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  branchItemText: {
    fontSize: 11.5,
    color: '#475569',
    fontWeight: '600',
    marginBottom: 3,
  },
});
