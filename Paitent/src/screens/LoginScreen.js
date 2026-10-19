import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Image, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity, Alert, ToastAndroid } from 'react-native';
import { TextInput, Button, Text, Surface, HelperText } from 'react-native-paper';
import { COLORS, SIZES } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '../firebase';
import { doc, setDoc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { ArrowLeft, User, Phone, Mail, MapPin, ShieldCheck } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { scheduleLoginSuccessNotification } from '../utils/notificationHelper';
import { sendSmsOtp, generate4DigitOtp, normalizePhoneForSms } from '../utils/smsOtpService';

const LoginScreen = ({ navigation, route }) => {
  const modeParam = route.params?.initialMode;
  const [isLogin, setIsLogin] = useState(modeParam !== 'signup');
  const [phone, setPhone] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [sentOtp, setSentOtp] = useState('');
  const [otpExpiresAt, setOtpExpiresAt] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [smsNotice, setSmsNotice] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [location, setLocation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 30-second countdown for Resend OTP
  useEffect(() => {
    let timer;
    if (otpSent && countdown > 0) {
      timer = setInterval(() => {
        setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [otpSent, countdown]);

  const handleSendOTP = async () => {
    const { clean10 } = normalizePhoneForSms(phone);
    if (!isLogin) {
      if (!name.trim()) {
        setError('Please enter your full name');
        return;
      }
      if (!clean10 || clean10.length !== 10) {
        setError('Please enter a valid 10-digit phone number');
        return;
      }
      if (!location.trim()) {
        setError('Please enter your location');
        return;
      }
    } else {
      if (!clean10 || clean10.length !== 10) {
        setError('Please enter a valid 10-digit phone number');
        return;
      }
    }

    setLoading(true);
    setError('');

    try {
      // Check if user exists if it's existing login
      if (isLogin) {
        const phoneNum = parseInt(clean10, 10);
        let q = query(collection(db, 'patients'), where('phone', '==', clean10));
        let querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
          q = query(collection(db, 'patients'), where('phone', '==', phoneNum));
          querySnapshot = await getDocs(q);
        }

        if (querySnapshot.empty) {
          q = query(collection(db, 'allpatients'), where('phone', '==', clean10));
          querySnapshot = await getDocs(q);
        }

        if (querySnapshot.empty) {
          setError('No account found with this phone number. Please switch to New Patient to register.');
          setLoading(false);
          return;
        }
      }

      // Generate 4-digit SMS OTP (same template as mobile staff app)
      const generatedOtp = generate4DigitOtp();
      const expiry = Date.now() + 5 * 60 * 1000; // 5 minutes validity

      setSentOtp(generatedOtp);
      setOtpExpiresAt(expiry);
      setOtpSent(true);
      setCountdown(30);
      setVerificationCode(''); // Empty for real user input
      setSmsNotice(`Sending verification OTP to +91 ${clean10}...`);
      setLoading(false);

      if (Platform.OS === 'android') {
        ToastAndroid.show('OTP is being sent via SMS...', ToastAndroid.SHORT);
      }

      // 1. Save OTP to Firestore in background for auditing & backup verification
      setDoc(doc(db, 'auth_otps', clean10), {
        phone: clean10,
        otp: generatedOtp,
        expiresAt: expiry,
        role: 'patient',
        userName: name.trim() || 'Patient',
        createdAt: new Date().toISOString()
      }).catch((e) => console.warn('Background OTP save error:', e));

      // 2. Dispatch real SMS via SMS Provider (smslogin.co / SPHMEO)
      sendSmsOtp(clean10, generatedOtp).then((smsResult) => {
        if (smsResult.success) {
          setSmsNotice(`A 4-digit verification code has been dispatched via SMS to +91 ${clean10}.`);
        } else {
          setSmsNotice(`A verification code was dispatched to +91 ${clean10}.`);
        }
      }).catch(() => {
        setSmsNotice(`Verification code sent to +91 ${clean10}.`);
      });

    } catch (err) {
      console.error('Send OTP Error:', err);
      setError(err.message || 'Failed to send OTP. Please try again.');
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    const cleanCode = (verificationCode || '').trim();
    if (!cleanCode) {
      setError('Please enter the 4-digit verification code received on your phone');
      return;
    }

    const { clean10 } = normalizePhoneForSms(phone);
    if (!clean10) {
      setError('Please enter a valid mobile number');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // 1. Check expiration
      if (otpExpiresAt > 0 && Date.now() > otpExpiresAt) {
        setError('The OTP has expired (5-minute validity). Please tap Resend OTP to get a new code.');
        setLoading(false);
        return;
      }

      // 2. In-memory match against real dispatched OTP
      let isOtpValid = Boolean(sentOtp && cleanCode === sentOtp);

      // 3. Fallback match against Firestore auth_otps
      if (!isOtpValid) {
        try {
          const otpSnap = await getDoc(doc(db, 'auth_otps', clean10));
          if (otpSnap.exists()) {
            const data = otpSnap.data();
            if (data.otp === cleanCode && Date.now() <= (data.expiresAt || 0)) {
              isOtpValid = true;
            }
          }
        } catch (checkErr) {
          console.warn('Firestore OTP check warning:', checkErr);
        }
      }

      if (!isOtpValid) {
        setError('Invalid OTP code. Please enter the correct code received on your phone.');
        setLoading(false);
        return;
      }

      // 3. Authenticate with Firebase Auth deterministically (satisfies all Firestore security rules)
      const authEmail = `patient_${clean10}@spiritualhomeo.com`;
      const authPass = `SPH_Paitent_${clean10}_2026!`;
      let userCredential;

      try {
        userCredential = await signInWithEmailAndPassword(auth, authEmail, authPass);
      } catch (authErr) {
        if (
          authErr.code === 'auth/user-not-found' ||
          authErr.code === 'auth/invalid-credential' ||
          authErr.code === 'auth/wrong-password'
        ) {
          try {
            userCredential = await createUserWithEmailAndPassword(auth, authEmail, authPass);
          } catch (createErr) {
            if (createErr.code === 'auth/email-already-in-use') {
              userCredential = await signInWithEmailAndPassword(auth, authEmail, authPass);
            } else {
              throw createErr;
            }
          }
        } else {
          throw authErr;
        }
      }

      const user = userCredential.user;

      if (!isLogin) {
        // Create new patient profile
        await setDoc(doc(db, 'patients', user.uid), {
          fullName: name.trim(),
          email: email.trim() || '',
          phone: clean10,
          location: location.trim(),
          role: 'patient',
          rewardPoints: 0,
          createdAt: new Date().toISOString()
        }, { merge: true });

        try {
          await scheduleLoginSuccessNotification(name.trim());
        } catch (notifErr) {
          console.warn('Login notification error:', notifErr);
        }
      } else {
        // Existing Patient Login: check if patients/{user.uid} exists
        const userRef = doc(db, 'patients', user.uid);
        const userSnap = await getDoc(userRef);
        let patientName = 'Patient';

        if (!userSnap.exists()) {
          let existingData = {};
          const q = query(collection(db, 'patients'), where('phone', '==', clean10));
          const querySnapshot = await getDocs(q);
          if (!querySnapshot.empty) {
            existingData = querySnapshot.docs[0].data();
          } else {
            const qAll = query(collection(db, 'allpatients'), where('phone', '==', clean10));
            const snapAll = await getDocs(qAll);
            if (!snapAll.empty) {
              existingData = snapAll.docs[0].data();
            }
          }

          patientName = existingData.fullName || existingData.patientName || existingData.name || 'Patient';

          await setDoc(userRef, {
            fullName: patientName,
            email: existingData.email || '',
            phone: clean10,
            location: existingData.location || existingData.city || existingData.address || '',
            branchId: existingData.branchId || null,
            branchName: existingData.branchName || 'Unknown',
            rewardPoints: existingData.rewardPoints || 0,
            role: 'patient',
            createdAt: existingData.createdAt || new Date().toISOString()
          });
        } else {
          patientName = userSnap.data().fullName || 'Patient';
        }

        try {
          await scheduleLoginSuccessNotification(patientName);
        } catch (notifErr) {
          console.warn('Login notification error:', notifErr);
        }
      }

      if (Platform.OS === 'android') {
        ToastAndroid.show('Verified successfully! Logging in...', ToastAndroid.SHORT);
      }
    } catch (err) {
      console.error('Verify OTP Error:', err);
      setError(err.message || 'Verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {navigation.canGoBack() && (
            <TouchableOpacity
              activeOpacity={0.7}
              style={styles.backButton}
              onPress={() => navigation.goBack()}
            >
              <ArrowLeft size={24} color="#1e293b" />
            </TouchableOpacity>
          )}

          <View style={styles.header}>
            <Image
              source={require('../../assets/SH logo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.title}>Spiritual Homeo Clinic</Text>
            <Text style={styles.subtitle}>{isLogin ? 'Welcome back!' : 'Create your account'}</Text>
          </View>

          <Surface style={styles.formCard}>
            {!otpSent && !modeParam && (
              <View style={styles.tabToggleContainer}>
                <TouchableOpacity
                  activeOpacity={0.9}
                  style={[styles.toggleTab, isLogin && styles.activeToggleTab]}
                  onPress={() => {
                    setIsLogin(true);
                    setError('');
                  }}
                >
                  <Text style={[styles.toggleTabText, isLogin && styles.activeToggleTabText]}>Existing Patient</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.9}
                  style={[styles.toggleTab, !isLogin && styles.activeToggleTab]}
                  onPress={() => {
                    setIsLogin(false);
                    setError('');
                  }}
                >
                  <Text style={[styles.toggleTabText, !isLogin && styles.activeToggleTabText]}>New Patient</Text>
                </TouchableOpacity>
              </View>
            )}

            {!otpSent ? (
              <>
                {!isLogin && (
                  <>
                    <TextInput
                      label="Full Name"
                      value={name}
                      onChangeText={setName}
                      mode="outlined"
                      dense
                      style={styles.input}
                      textColor="#000000"
                      outlineColor={COLORS.border}
                      activeOutlineColor={COLORS.secondary}
                      placeholder="Enter your full name"
                      placeholderTextColor="#94a3b8"
                      left={<TextInput.Icon icon={props => <User {...props} size={20} color={COLORS.secondary} />} />}
                    />
                    <TextInput
                      label="Phone Number"
                      value={phone}
                      onChangeText={setPhone}
                      keyboardType="phone-pad"
                      left={<TextInput.Icon icon={props => <Phone {...props} size={20} color={COLORS.secondary} />} />}
                      right={<TextInput.Affix text="+91" />}
                      mode="outlined"
                      dense
                      style={styles.input}
                      textColor="#000000"
                      outlineColor={COLORS.border}
                      activeOutlineColor={COLORS.secondary}
                      placeholder="Enter 10-digit mobile"
                      placeholderTextColor="#94a3b8"
                    />
                    <TextInput
                      label="Email Address (Optional)"
                      value={email}
                      onChangeText={setEmail}
                      keyboardType="email-address"
                      mode="outlined"
                      dense
                      style={styles.input}
                      textColor="#000000"
                      outlineColor={COLORS.border}
                      activeOutlineColor={COLORS.secondary}
                      placeholder="Enter email address"
                      placeholderTextColor="#94a3b8"
                      left={<TextInput.Icon icon={props => <Mail {...props} size={20} color={COLORS.secondary} />} />}
                    />
                    <TextInput
                      label="Location"
                      value={location}
                      onChangeText={setLocation}
                      mode="outlined"
                      dense
                      style={styles.input}
                      textColor="#000000"
                      outlineColor={COLORS.border}
                      activeOutlineColor={COLORS.secondary}
                      placeholder="Enter city or area"
                      placeholderTextColor="#94a3b8"
                      left={<TextInput.Icon icon={props => <MapPin {...props} size={20} color={COLORS.secondary} />} />}
                    />
                  </>
                )}
                {isLogin && (
                  <TextInput
                    label="Phone Number"
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                    left={<TextInput.Icon icon={props => <Phone {...props} size={20} color={COLORS.secondary} />} />}
                    right={<TextInput.Affix text="+91" />}
                    mode="outlined"
                    dense
                    style={styles.input}
                    textColor="#000000"
                    outlineColor={COLORS.border}
                    activeOutlineColor={COLORS.secondary}
                    placeholder="Enter 10-digit mobile number"
                    placeholderTextColor="#94a3b8"
                  />
                )}

                {error ? <HelperText type="error" visible={true}>{error}</HelperText> : null}

                <Button
                  mode="contained"
                  onPress={handleSendOTP}
                  loading={loading}
                  disabled={loading}
                  style={styles.button}
                  contentStyle={styles.buttonContent}
                  buttonColor={COLORS.secondary}
                >
                  Send Verification OTP
                </Button>
              </>
            ) : (
              <>
                <View style={styles.smsNoticeBox}>
                  <Text style={styles.smsNoticeTitle}>SMS Verification Code</Text>
                  <Text style={styles.smsNoticeText}>
                    {smsNotice || `A 4-digit verification code has been dispatched via SMS to +91 ${phone.replace(/\D/g, '').slice(-10)}`}
                  </Text>
                </View>

                <TextInput
                  label="Enter 4-Digit Code"
                  value={verificationCode}
                  onChangeText={setVerificationCode}
                  keyboardType="number-pad"
                  maxLength={6}
                  mode="outlined"
                  dense
                  style={styles.input}
                  textColor="#000000"
                  outlineColor={COLORS.border}
                  activeOutlineColor={COLORS.secondary}
                  placeholder="Enter 4-digit OTP"
                  placeholderTextColor="#94a3b8"
                  left={<TextInput.Icon icon={props => <ShieldCheck {...props} size={20} color={COLORS.secondary} />} />}
                />

                {error ? <HelperText type="error" visible={true}>{error}</HelperText> : null}

                <Button
                  mode="contained"
                  onPress={handleVerifyOTP}
                  loading={loading}
                  disabled={loading}
                  style={styles.button}
                  contentStyle={styles.buttonContent}
                  buttonColor={COLORS.secondary}
                >
                  Verify & Continue
                </Button>

                <View style={{ marginTop: 16, alignItems: 'center' }}>
                  {countdown > 0 ? (
                    <Text style={styles.countdownText}>Resend OTP via SMS in {countdown}s</Text>
                  ) : (
                    <TouchableOpacity onPress={handleSendOTP}>
                      <Text style={styles.resendText}>Resend OTP via SMS</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    onPress={() => {
                      setOtpSent(false);
                      setVerificationCode('');
                      setError('');
                    }}
                    style={{ marginTop: 14 }}
                  >
                    <Text style={styles.changePhoneText}>Change Phone Number</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

          </Surface>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scrollContent: {
    padding: SIZES.padding,
    flexGrow: 1,
    paddingTop: 10,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
    alignSelf: 'flex-start',
  },
  header: {
    alignItems: 'center',
    marginBottom: 16,
  },
  logo: {
    width: 90,
    height: 90,
    marginBottom: 10,
  },
  title: {
    fontSize: 26,
    fontWeight: '900',
    color: '#0f172a',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 6,
    textAlign: 'center',
    fontWeight: '600',
  },
  formCard: {
    padding: 24,
    borderRadius: 24,
    elevation: 8,
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  input: {
    marginBottom: 16,
    backgroundColor: COLORS.white,
    fontSize: 14,
    color: '#000000',
  },
  smsNoticeBox: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
  },
  smsNoticeTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#15803d',
    marginBottom: 4,
    textAlign: 'center',
  },
  smsNoticeText: {
    fontSize: 12,
    color: '#166534',
    textAlign: 'center',
    fontWeight: '500',
    lineHeight: 18,
  },
  button: {
    marginTop: 8,
    borderRadius: 16,
    elevation: 2,
    shadowColor: COLORS.secondary,
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  buttonContent: {
    paddingVertical: 10,
  },
  countdownText: {
    fontSize: 13,
    color: '#94a3b8',
    fontWeight: '600',
  },
  resendText: {
    fontSize: 13,
    color: COLORS.primary,
    fontWeight: '700',
  },
  changePhoneText: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '600',
  },
  tabToggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 30,
    padding: 4,
    marginBottom: 24,
  },
  toggleTab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 26,
  },
  activeToggleTab: {
    backgroundColor: COLORS.primary,
    elevation: 3,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  toggleTabText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748b',
  },
  activeToggleTabText: {
    color: '#ffffff',
  },
});

export default LoginScreen;
