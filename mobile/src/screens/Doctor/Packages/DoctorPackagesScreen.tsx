import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  ActivityIndicator,
  Alert,
  Linking
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  db,
  createRazorpayPaymentQr,
  checkRazorpayPaymentStatus,
  QrCodeResult,
  createRazorpayCardPaymentLink
} from '@app/shared';
import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  where,
  orderBy,
  onSnapshot,
  updateDoc,
  addDoc
} from 'firebase/firestore';

interface DoctorPackagesScreenProps {
  doctorName?: string;
  branchName?: string;
}

export const DoctorPackagesScreen: React.FC<DoctorPackagesScreenProps> = ({
  doctorName = 'Dr. Prashanth K Vaidya',
  branchName = 'KPHB Branch'
}) => {
  // Screen Tabs: Register vs Enrolled Members
  const [activeTab, setActiveTab] = useState<'register' | 'members'>('register');

  // Form Fields
  const [phone, setPhone] = useState('');
  const [patientName, setPatientName] = useState('');
  const [planName, setPlanName] = useState('Annual Family Health Shield');
  const [durationMonths, setDurationMonths] = useState(12);
  const [totalAmount, setTotalAmount] = useState('');
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState<'razorpay' | 'cash' | 'upi'>('razorpay');

  // Lookup / Auto-fill
  const [isSearchingPatient, setIsSearchingPatient] = useState(false);
  const [foundPatient, setFoundPatient] = useState<any | null>(null);

  // Razorpay Dynamic UPI QR
  const [isGeneratingQr, setIsGeneratingQr] = useState(false);
  const [upiQrData, setUpiQrData] = useState<QrCodeResult | null>(null);
  const [isQrPaid, setIsQrPaid] = useState(false);
  const [razorpayPaymentId, setRazorpayPaymentId] = useState('');

  // Razorpay Card Payment Link
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  const [cardPaymentLink, setCardPaymentLink] = useState('');

  // Submission State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successBanner, setSuccessBanner] = useState('');

  // Enrolled Members List
  const [packageMembers, setPackageMembers] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const numTotal = parseFloat(totalAmount) || 0;
  const numAdvance = parseFloat(advanceAmount) || 0;
  const remainingAmount = Math.max(0, numTotal - numAdvance);

  // Auto-search patient by 10-digit phone
  useEffect(() => {
    const clean = phone.replace(/\D/g, '').slice(-10);
    if (clean.length !== 10 || !db) {
      setFoundPatient(null);
      return;
    }

    let isMounted = true;
    setIsSearchingPatient(true);

    const lookup = async () => {
      try {
        const qPat = query(collection(db, 'allpatients'), where('phoneNumber', '==', clean));
        const snap = await getDocs(qPat);

        if (!snap.empty && isMounted) {
          const docData = snap.docs[0].data();
          const pName = docData.name || docData.fullName || docData.patientName || '';
          setFoundPatient({ id: snap.docs[0].id, ...docData });
          if (!patientName) setPatientName(pName);
        } else {
          // Check appointments
          const qApt = query(collection(db, 'appointments'), where('phoneNumber', '==', clean));
          const aptSnap = await getDocs(qApt);
          if (!aptSnap.empty && isMounted) {
            const aptData = aptSnap.docs[0].data();
            const pName = aptData.patientName || aptData.name || '';
            setFoundPatient({ id: aptSnap.docs[0].id, ...aptData });
            if (!patientName) setPatientName(pName);
          } else if (isMounted) {
            setFoundPatient(null);
          }
        }
      } catch (e) {
        console.warn('Patient lookup mobile notice:', e);
      } finally {
        if (isMounted) setIsSearchingPatient(false);
      }
    };

    lookup();
    return () => { isMounted = false; };
  }, [phone]);

  // Subscribe to package_members
  useEffect(() => {
    if (!db) return;
    try {
      const q = query(collection(db, 'package_members'), orderBy('createdAt', 'desc'));
      const unsub = onSnapshot(q, (snapshot) => {
        const list: any[] = [];
        snapshot.docs.forEach((d) => {
          list.push({ id: d.id, ...d.data() });
        });
        setPackageMembers(list);
      });
      return () => unsub();
    } catch (e) {
      console.warn('Mobile package_members listener notice:', e);
    }
  }, []);

  // Poll Razorpay Dynamic UPI QR Status
  useEffect(() => {
    if (!upiQrData || !upiQrData.qrId || isQrPaid) return;

    let timer: any = null;
    let attempts = 0;
    const maxAttempts = 60; // 2 minutes

    const check = async () => {
      attempts++;
      try {
        const res: any = await checkRazorpayPaymentStatus(upiQrData.qrId!);
        if (res && res.isPaid) {
          setIsQrPaid(true);
          setRazorpayPaymentId(res.paymentId || 'rzp_verified');
          clearInterval(timer);
          return;
        }
      } catch (err) {
        console.warn('Mobile QR poll notice:', err);
      }

      if (attempts >= maxAttempts) {
        clearInterval(timer);
      }
    };

    timer = setInterval(check, 2000);
    return () => clearInterval(timer);
  }, [upiQrData, isQrPaid]);

  // Generate Razorpay UPI QR
  const handleGenerateUpiQr = async () => {
    if (!numAdvance || numAdvance <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid advance payment amount.');
      return;
    }
    setIsGeneratingQr(true);
    setUpiQrData(null);
    setIsQrPaid(false);
    setRazorpayPaymentId('');

    try {
      const res = await createRazorpayPaymentQr({
        amount: numAdvance,
        patientName: patientName || 'Package Member',
        phone: phone || '9999999999',
        branch: branchName,
        description: `Package: ${planName}`
      });

      if (res && res.imageUrl) {
        setUpiQrData(res);
      } else {
        Alert.alert('Error', 'Could not generate Razorpay dynamic QR. Please try again.');
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Error creating Razorpay QR.');
    } finally {
      setIsGeneratingQr(false);
    }
  };

  // Create Razorpay Card Payment Link
  const handleCreateCardLink = async () => {
    if (!numAdvance || numAdvance <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid advance payment amount.');
      return;
    }
    setIsGeneratingLink(true);

    try {
      const res = await createRazorpayCardPaymentLink({
        amount: numAdvance,
        patientName: patientName || 'Package Member',
        phone: phone || '9999999999',
        branch: branchName
      });

      if (res && res.paymentUrl) {
        setCardPaymentLink(res.paymentUrl);
        Linking.openURL(res.paymentUrl);
      } else {
        Alert.alert('Notice', 'Payment gateway initialized. Please verify once patient pays.');
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not open Razorpay checkout.');
    } finally {
      setIsGeneratingLink(false);
    }
  };

  // Confirm and Enroll Patient
  const handleConfirmEnrollment = async () => {
    const clean = phone.replace(/\D/g, '').slice(-10);
    if (!clean || clean.length !== 10) {
      Alert.alert('Required', 'Please enter a valid 10-digit mobile number.');
      return;
    }

    if (!patientName.trim()) {
      Alert.alert('Required', 'Please enter the patient name.');
      return;
    }

    if (!numTotal || numTotal <= 0) {
      Alert.alert('Required', 'Please enter total package fee.');
      return;
    }

    if (paymentMode.startsWith('razorpay') && !isQrPaid && !razorpayPaymentId) {
      Alert.alert(
        'Verify Payment',
        'Razorpay payment is not confirmed yet. Mark as verified or switch to Cash / Direct UPI?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Force Verify & Enroll',
            onPress: () => submitEnrollment('Razorpay Verified')
          }
        ]
      );
      return;
    }

    submitEnrollment();
  };

  const submitEnrollment = async (overrideNote?: string) => {
    const clean = phone.replace(/\D/g, '').slice(-10);
    setIsSubmitting(true);

    try {
      const now = new Date();
      const expiry = new Date(now);
      expiry.setMonth(expiry.getMonth() + durationMonths);

      const pkgDocId = `pkg_${clean}_${Date.now()}`;
      const effectiveMode = paymentMode === 'razorpay'
        ? 'Razorpay Gateway'
        : paymentMode === 'cash'
          ? 'Cash'
          : 'Direct UPI';

      const effectivePlanName = `${durationMonths} Months Care Package`;

      // 1. Create document in package_members
      const pkgData = {
        id: pkgDocId,
        patientDocId: foundPatient?.id || null,
        patientName: patientName.trim(),
        phone: clean,
        branch: branchName || 'KPHB Branch',
        planName: effectivePlanName,
        duration: `${durationMonths} Months`,
        durationMonths: durationMonths,
        totalAmount: numTotal,
        paidAmount: numAdvance,
        remainingAmount: remainingAmount,
        status: 'Active',
        paymentHistory: numAdvance > 0 ? [
          {
            date: now.toISOString(),
            amount: numAdvance,
            paymentMode: effectiveMode,
            razorpayPaymentId: razorpayPaymentId || undefined,
            note: overrideNote || 'Package Advance Registered'
          }
        ] : [],
        startDate: now.toISOString(),
        paymentDate: now.toISOString(),
        expiryDate: expiry.toISOString(),
        doctorName: doctorName || 'Dr. Prashanth K Vaidya',
        createdAt: now.toISOString(),
        updatedAt: now.toISOString()
      };

      await setDoc(doc(db, 'package_members', pkgDocId), pkgData);

      // 2. Update patient profile and appointments with PKG status
      const patientUpdates = {
        hasActivePackage: true,
        isPackageMember: true,
        packagePlanName: effectivePlanName,
        packageTotalAmount: numTotal,
        packageAdvancePaid: numAdvance,
        packageRemainingAmount: remainingAmount,
        packageDuration: `${durationMonths} Months`,
        packageExpiryDate: expiry.toISOString(),
        updatedAt: now.toISOString()
      };

      const qPat = query(collection(db, 'allpatients'), where('phoneNumber', '==', clean));
      const patSnap = await getDocs(qPat);
      patSnap.forEach((d) => {
        updateDoc(doc(db, 'allpatients', d.id), patientUpdates).catch(() => {});
      });

      const qApt = query(collection(db, 'appointments'), where('phoneNumber', '==', clean));
      const aptSnap = await getDocs(qApt);
      aptSnap.forEach((d) => {
        updateDoc(doc(db, 'appointments', d.id), patientUpdates).catch(() => {});
      });

      // 3. Record transaction in alltransactions
      if (numAdvance > 0) {
        const txnDoc = {
          patientName: patientName.trim(),
          phoneNumber: clean,
          phone: clean,
          branchName: branchName || 'KPHB Branch',
          branch: branchName || 'KPHB Branch',
          revenueSplit: 'Package',
          planName: effectivePlanName,
          amount: numAdvance,
          totalAmount: numAdvance,
          totalPaid: numAdvance,
          paymentMethod: effectiveMode.toLowerCase().includes('cash') ? 'cash' : 'upi',
          paymentMode: effectiveMode,
          razorpayPaymentId: razorpayPaymentId || undefined,
          timestamp: now.toISOString().split('T')[0],
          date: now.toISOString(),
          status: 'PAID',
          createdAt: now.toISOString()
        };
        await addDoc(collection(db, 'alltransactions'), txnDoc).catch(() => {});
      }

      setSuccessBanner(`🎉 ${patientName.trim()} successfully enrolled in ${effectivePlanName}! "PKG" badge active.`);

      // Reset form
      setPhone('');
      setPatientName('');
      setFoundPatient(null);
      setUpiQrData(null);
      setIsQrPaid(false);
      setRazorpayPaymentId('');
      setTotalAmount('');
      setAdvanceAmount('');

      setTimeout(() => {
        setSuccessBanner('');
        setActiveTab('members');
      }, 1800);

    } catch (e: any) {
      console.error('Package save error:', e);
      Alert.alert('Error', e?.message || 'Failed to save package membership.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filter package members
  const filteredMembers = packageMembers.filter((m) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (m.patientName && m.patientName.toLowerCase().includes(q)) ||
      (m.phone && m.phone.includes(q)) ||
      (m.planName && m.planName.toLowerCase().includes(q))
    );
  });

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      
      {/* Top Header */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={styles.headerIcon}>
            <Ionicons name="cube-outline" size={20} color="#0284c7" />
          </View>
          <View style={{ marginLeft: 10 }}>
            <Text style={styles.title}>Treatment Packages</Text>
            <Text style={styles.subtitle}>Patient Package Enrollment & Razorpay Gateway</Text>
          </View>
        </View>

        {/* Tab Switcher */}
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'register' && styles.tabBtnActive]}
            onPress={() => setActiveTab('register')}
          >
            <Text style={[styles.tabBtnText, activeTab === 'register' && styles.tabBtnTextActive]}>
              Enroll Patient
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'members' && styles.tabBtnActive]}
            onPress={() => setActiveTab('members')}
          >
            <Text style={[styles.tabBtnText, activeTab === 'members' && styles.tabBtnTextActive]}>
              Members ({packageMembers.length})
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Success Notification Banner */}
      {successBanner ? (
        <View style={styles.successBanner}>
          <Ionicons name="checkmark-circle" size={18} color="#16a34a" />
          <Text style={styles.successBannerText}>{successBanner}</Text>
        </View>
      ) : null}

      {activeTab === 'register' ? (
        <View style={styles.formCard}>
          
          {/* Patient Mobile & Name */}
          <View style={styles.inputRow}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.inputLabel}>MOBILE NUMBER *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="10-digit number"
                placeholderTextColor="#94a3b8"
                keyboardType="phone-pad"
                maxLength={10}
                value={phone}
                onChangeText={setPhone}
              />
              {isSearchingPatient ? (
                <Text style={styles.searchHint}>Checking patient records...</Text>
              ) : foundPatient ? (
                <Text style={styles.foundHint}>✓ {foundPatient.name || foundPatient.patientName}</Text>
              ) : null}
            </View>

            <View style={{ flex: 1 }}>
              <Text style={styles.inputLabel}>PATIENT FULL NAME *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Patient name"
                placeholderTextColor="#94a3b8"
                value={patientName}
                onChangeText={setPatientName}
              />
            </View>
          </View>

          {/* Coverage Duration Row */}
          <View style={{ marginBottom: 12 }}>
            <Text style={styles.inputLabel}>COVERAGE DURATION</Text>
            <View style={styles.durationRow}>
              {[3, 6, 12, 24].map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[styles.durationChip, durationMonths === m && styles.durationChipActive]}
                  onPress={() => setDurationMonths(m)}
                >
                  <Text style={[styles.durationChipText, durationMonths === m && styles.durationChipTextActive]}>
                    {m} Months
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Amount Breakdown */}
          <View style={styles.amountBox}>
            <View style={styles.amountCol}>
              <Text style={styles.amountLabel}>TOTAL FEE (₹)</Text>
              <TextInput
                style={styles.amountInput}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor="#94a3b8"
                value={totalAmount}
                onChangeText={setTotalAmount}
              />
            </View>

            <View style={styles.amountCol}>
              <Text style={[styles.amountLabel, { color: '#0284c7' }]}>ADVANCE NOW (₹)</Text>
              <TextInput
                style={[styles.amountInput, { color: '#0284c7', borderColor: '#0284c7', backgroundColor: '#f0f9ff' }]}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor="#94a3b8"
                value={advanceAmount}
                onChangeText={setAdvanceAmount}
              />
            </View>

            <View style={styles.amountCol}>
              <Text style={styles.amountLabel}>REMAINING</Text>
              <View style={[styles.remainingBadge, remainingAmount > 0 ? styles.remainingDue : styles.remainingZero]}>
                <Text style={styles.remainingText}>₹{remainingAmount.toLocaleString('en-IN')}</Text>
              </View>
            </View>
          </View>

          {/* Payment Method Selector */}
          <Text style={[styles.sectionHeader, { marginTop: 14 }]}>PAYMENT METHOD:</Text>
          <View style={styles.payModeRow}>
            
            <TouchableOpacity
              style={[styles.payModeBtn, paymentMode === 'razorpay' && styles.payModeBtnActive]}
              onPress={() => { setPaymentMode('razorpay'); setIsQrPaid(false); }}
            >
              <Ionicons name="card-outline" size={16} color={paymentMode === 'razorpay' ? '#0284c7' : '#64748b'} />
              <Text style={[styles.payModeText, paymentMode === 'razorpay' && styles.payModeTextActive]}>
                Razorpay
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.payModeBtn, paymentMode === 'cash' && styles.payModeBtnActiveGreen]}
              onPress={() => { setPaymentMode('cash'); setIsQrPaid(true); }}
            >
              <Ionicons name="cash-outline" size={16} color={paymentMode === 'cash' ? '#16a34a' : '#64748b'} />
              <Text style={[styles.payModeText, paymentMode === 'cash' && { color: '#16a34a' }]}>
                Cash
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.payModeBtn, paymentMode === 'upi' && styles.payModeBtnActiveGreen]}
              onPress={() => { setPaymentMode('upi'); setIsQrPaid(true); }}
            >
              <Ionicons name="phone-portrait-outline" size={16} color={paymentMode === 'upi' ? '#16a34a' : '#64748b'} />
              <Text style={[styles.payModeText, paymentMode === 'upi' && { color: '#16a34a' }]}>
                Clinic UPI
              </Text>
            </TouchableOpacity>

          </View>

          {/* RAZORPAY STANDARD GATEWAY PANEL */}
          {paymentMode === 'razorpay' && (
            <View style={styles.razorpayPanel}>
              {isQrPaid ? (
                <View style={styles.paidSuccessCard}>
                  <Ionicons name="checkmark-circle" size={28} color="#16a34a" />
                  <Text style={styles.paidSuccessTitle}>Advance ₹{numAdvance.toLocaleString('en-IN')} Received!</Text>
                  <Text style={styles.paidSuccessSub}>Verified via Razorpay Gateway. You may now enroll.</Text>
                  {razorpayPaymentId ? (
                    <Text style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Ref: {razorpayPaymentId}</Text>
                  ) : null}
                </View>
              ) : (
                <View style={{ alignItems: 'center' }}>
                  <Ionicons name="card" size={32} color="#0284c7" />
                  <Text style={styles.genQrTitle}>Razorpay Standard Gateway</Text>
                  <Text style={styles.genQrSub}>Opens secure checkout for ₹{numAdvance.toLocaleString('en-IN')}</Text>
                  <Text style={[styles.qrAppsText, { marginBottom: 14 }]}>Accepts Google Pay, PhonePe, Paytm, Official QR, Cards & Netbanking</Text>
                  <TouchableOpacity
                    style={[styles.genQrBtn, (!numAdvance || numAdvance <= 0) && { backgroundColor: '#94a3b8' }]}
                    onPress={handleCreateCardLink}
                    disabled={isGeneratingLink || numAdvance <= 0}
                  >
                    {isGeneratingLink ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Text style={styles.genQrBtnText}>Launch Razorpay Gateway (₹{numAdvance.toLocaleString('en-IN')})</Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {/* Confirm & Activate Button */}
          <TouchableOpacity
            style={styles.submitBtn}
            onPress={handleConfirmEnrollment}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="shield-checkmark" size={18} color="#ffffff" style={{ marginRight: 8 }} />
                <Text style={styles.submitBtnText}>Activate Package Membership (Attach PKG)</Text>
              </View>
            )}
          </TouchableOpacity>

        </View>
      ) : (
        /* ENROLLED MEMBERS LIST */
        <View style={styles.membersContainer}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={16} color="#64748b" style={{ marginRight: 6 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by patient name, phone, plan..."
              placeholderTextColor="#94a3b8"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>

          {filteredMembers.length === 0 ? (
            <View style={styles.emptyMembers}>
              <Ionicons name="people-outline" size={36} color="#94a3b8" />
              <Text style={styles.emptyText}>No package members found.</Text>
            </View>
          ) : (
            filteredMembers.map((m) => {
              const isDue = (m.remainingAmount || 0) > 0;
              return (
                <View key={m.id} style={styles.memberCard}>
                  
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={styles.memberName}>{m.patientName || 'Patient'}</Text>
                        <View style={styles.pkgBadge}>
                          <Text style={styles.pkgBadgeText}>PKG</Text>
                        </View>
                      </View>
                      <Text style={styles.memberPhone}>{m.phone}</Text>
                    </View>

                    <Text style={styles.memberPlan}>{m.planName || 'Care Package'}</Text>
                  </View>

                  <View style={styles.memberDivider} />

                  <View style={styles.memberStatsRow}>
                    <View>
                      <Text style={styles.statLabel}>TOTAL</Text>
                      <Text style={styles.statVal}>₹{(m.totalAmount || 0).toLocaleString('en-IN')}</Text>
                    </View>
                    <View>
                      <Text style={[styles.statLabel, { color: '#16a34a' }]}>PAID</Text>
                      <Text style={[styles.statVal, { color: '#16a34a' }]}>₹{(m.paidAmount || 0).toLocaleString('en-IN')}</Text>
                    </View>
                    <View>
                      <Text style={[styles.statLabel, isDue ? { color: '#b45309' } : { color: '#16a34a' }]}>
                        {isDue ? 'DUE' : 'CLEARED'}
                      </Text>
                      <Text style={[styles.statVal, isDue ? { color: '#b45309' } : { color: '#16a34a' }]}>
                        ₹{(m.remainingAmount || 0).toLocaleString('en-IN')}
                      </Text>
                    </View>
                  </View>

                </View>
              );
            })
          )}
        </View>
      )}

      <View style={{ height: 50 }} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', paddingHorizontal: 14, paddingTop: 12 },
  header: { marginBottom: 14 },
  headerIcon: {
    backgroundColor: '#e0f2fe',
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center'
  },
  title: { fontSize: 18, fontWeight: '900', color: '#0f172a' },
  subtitle: { fontSize: 11.5, color: '#64748b' },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#e2e8f0',
    padding: 3,
    borderRadius: 10,
    marginTop: 10,
  },
  tabBtn: { flex: 1, paddingVertical: 7, alignItems: 'center', borderRadius: 8 },
  tabBtnActive: { backgroundColor: '#ffffff', elevation: 1 },
  tabBtnText: { fontSize: 12, fontWeight: '700', color: '#64748b' },
  tabBtnTextActive: { color: '#0284c7' },
  successBanner: {
    backgroundColor: '#dcfce7',
    borderWidth: 1,
    borderColor: '#86efac',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  successBannerText: { color: '#166534', fontSize: 12, fontWeight: '700', flex: 1 },
  formCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  sectionHeader: { fontSize: 10.5, fontWeight: '800', color: '#64748b', letterSpacing: 0.5, marginBottom: 8 },
  presetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  presetCard: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    width: '48%',
  },
  presetCardSelected: { borderColor: '#0284c7', backgroundColor: '#eff6ff' },
  presetTitle: { fontSize: 11.5, fontWeight: '700', color: '#0f172a' },
  presetPrice: { fontSize: 11, fontWeight: '800', color: '#0284c7', marginTop: 2 },
  inputRow: { flexDirection: 'row', marginBottom: 10 },
  inputLabel: { fontSize: 10.5, fontWeight: '800', color: '#475569', marginBottom: 4 },
  textInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a',
  },
  searchHint: { fontSize: 10, color: '#0284c7', marginTop: 2 },
  foundHint: { fontSize: 10, color: '#16a34a', fontWeight: '700', marginTop: 2 },
  durationRow: { flexDirection: 'row', gap: 4 },
  durationChip: {
    flex: 1,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: 'center',
  },
  durationChipActive: { backgroundColor: '#0284c7', borderColor: '#0284c7' },
  durationChipText: { fontSize: 11, fontWeight: '800', color: '#475569' },
  durationChipTextActive: { color: '#ffffff' },
  amountBox: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 10,
    flexDirection: 'row',
    gap: 8,
    marginVertical: 4,
  },
  amountCol: { flex: 1 },
  amountLabel: { fontSize: 9.5, fontWeight: '800', color: '#64748b', marginBottom: 4 },
  amountInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
  },
  remainingBadge: {
    height: 34,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  remainingDue: { backgroundColor: '#fef3c7', borderWidth: 1, borderColor: '#fde68a' },
  remainingZero: { backgroundColor: '#dcfce7', borderWidth: 1, borderColor: '#bbf7d0' },
  remainingText: { fontSize: 12, fontWeight: '800', color: '#0f172a' },
  payModeRow: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  payModeBtn: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  payModeBtnActive: { borderColor: '#0284c7', backgroundColor: '#eff6ff' },
  payModeBtnActiveGreen: { borderColor: '#16a34a', backgroundColor: '#f0fdf4' },
  payModeText: { fontSize: 10, fontWeight: '700', color: '#64748b', marginTop: 2 },
  payModeTextActive: { color: '#0284c7' },
  razorpayPanel: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
    alignItems: 'center',
  },
  qrImage: { width: 140, height: 140, borderRadius: 8, marginBottom: 6 },
  qrScanText: { fontSize: 12, fontWeight: '800', color: '#0f172a' },
  qrAppsText: { fontSize: 10.5, color: '#64748b', marginBottom: 6 },
  pollingBadge: { flexDirection: 'row', alignItems: 'center' },
  pollingText: { fontSize: 10.5, color: '#0284c7', fontWeight: '700' },
  genQrTitle: { fontSize: 12.5, fontWeight: '800', color: '#0f172a', marginTop: 4 },
  genQrSub: { fontSize: 11, color: '#64748b', marginBottom: 10 },
  genQrBtn: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 6,
  },
  genQrBtnText: { color: '#ffffff', fontSize: 11.5, fontWeight: '800' },
  paidSuccessCard: { alignItems: 'center', paddingVertical: 10 },
  paidSuccessTitle: { fontSize: 13, fontWeight: '800', color: '#166534', marginTop: 4 },
  paidSuccessSub: { fontSize: 11, color: '#15803d' },
  submitBtn: {
    backgroundColor: '#0284c7',
    borderRadius: 10,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
  },
  submitBtnText: { color: '#ffffff', fontSize: 13, fontWeight: '800' },
  membersContainer: { gap: 10 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 38,
    marginBottom: 6,
  },
  searchInput: { flex: 1, fontSize: 12, color: '#0f172a' },
  emptyMembers: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: { color: '#94a3b8', fontSize: 12.5, marginTop: 6 },
  memberCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 12,
  },
  memberName: { fontSize: 13, fontWeight: '800', color: '#0f172a' },
  pkgBadge: {
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
    marginLeft: 6,
  },
  pkgBadgeText: { color: '#ffffff', fontSize: 9.5, fontWeight: '900' },
  memberPhone: { fontSize: 11.5, color: '#64748b', marginTop: 2 },
  memberPlan: { fontSize: 11.5, fontWeight: '700', color: '#0284c7' },
  memberDivider: { height: 1, backgroundColor: '#f1f5f9', marginVertical: 8 },
  memberStatsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  statLabel: { fontSize: 9.5, fontWeight: '800', color: '#64748b' },
  statVal: { fontSize: 12, fontWeight: '800', color: '#0f172a', marginTop: 2 },
});
