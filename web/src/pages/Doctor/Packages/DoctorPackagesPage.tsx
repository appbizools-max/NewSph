import React, { useState, useEffect } from 'react';
import {
  Package,
  CheckCircle2,
  Phone,
  User,
  IndianRupee,
  Calendar,
  CreditCard,
  QrCode,
  Search,
  Sparkles,
  ShieldCheck,
  Clock,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  ChevronRight,
  BadgeCheck,
  Check
} from 'lucide-react';
import {
  db,
  createRazorpayPaymentQr,
  checkRazorpayPaymentStatus,
  QrCodeResult,
  launchRazorpayStandardCheckout,
  launchRazorpayCardCheckout
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

interface DoctorPackagesPageProps {
  doctorName?: string;
  branchName?: string;
}

export const DoctorPackagesPage: React.FC<DoctorPackagesPageProps> = ({
  doctorName = 'Dr. Prashanth K Vaidya',
  branchName = 'KPHB Branch'
}) => {
  // Form State
  const [phone, setPhone] = useState('');
  const [patientName, setPatientName] = useState('');
  const [selectedBranch, setSelectedBranch] = useState(branchName);
  const [planName, setPlanName] = useState('Annual Family Health Shield');
  const [durationMonths, setDurationMonths] = useState(12);
  const [totalAmount, setTotalAmount] = useState<number | ''>('');
  const [advanceAmount, setAdvanceAmount] = useState<number | ''>('');
  const [paymentMode, setPaymentMode] = useState<'razorpay' | 'cash' | 'upi'>('razorpay');

  // Lookup / Auto-fill State
  const [isSearchingPatient, setIsSearchingPatient] = useState(false);
  const [foundPatient, setFoundPatient] = useState<any | null>(null);

  // Razorpay UPI QR State
  const [isGeneratingQr, setIsGeneratingQr] = useState(false);
  const [upiQrData, setUpiQrData] = useState<QrCodeResult | null>(null);
  const [isQrPaid, setIsQrPaid] = useState(false);
  const [razorpayPaymentId, setRazorpayPaymentId] = useState('');

  // Razorpay Card State
  const [isProcessingCard, setIsProcessingCard] = useState(false);

  // Submitting State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Package Members List State
  const [packageMembers, setPackageMembers] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'register' | 'members'>('register');

  // Calculated remaining amount
  const numTotal = Number(totalAmount) || 0;
  const numAdvance = Number(advanceAmount) || 0;
  const remainingAmount = Math.max(0, numTotal - numAdvance);

  // Auto-search patient by 10-digit mobile number
  useEffect(() => {
    const cleanPhone = phone.replace(/\D/g, '').slice(-10);
    if (cleanPhone.length !== 10 || !db) {
      setFoundPatient(null);
      return;
    }

    let isMounted = true;
    setIsSearchingPatient(true);

    const lookupPatient = async () => {
      try {
        const qPatients = query(collection(db, 'allpatients'), where('phoneNumber', '==', cleanPhone));
        const snap = await getDocs(qPatients);

        if (!snap.empty && isMounted) {
          const docData = snap.docs[0].data();
          const pName = docData.name || docData.fullName || docData.patientName || '';
          setFoundPatient({ id: snap.docs[0].id, ...docData });
          if (!patientName) setPatientName(pName);
          if (docData.branchName || docData.branch) setSelectedBranch(docData.branchName || docData.branch);
        } else {
          // Fallback check in appointments
          const qApt = query(collection(db, 'appointments'), where('phoneNumber', '==', cleanPhone));
          const aptSnap = await getDocs(qApt);
          if (!aptSnap.empty && isMounted) {
            const aptData = aptSnap.docs[0].data();
            const pName = aptData.patientName || aptData.name || '';
            setFoundPatient({ id: aptSnap.docs[0].id, ...aptData });
            if (!patientName) setPatientName(pName);
            if (aptData.branch || aptData.branchName) setSelectedBranch(aptData.branch || aptData.branchName);
          } else if (isMounted) {
            setFoundPatient(null);
          }
        }
      } catch (e) {
        console.warn('Patient lookup notice:', e);
      } finally {
        if (isMounted) setIsSearchingPatient(false);
      }
    };

    lookupPatient();
    return () => { isMounted = false; };
  }, [phone]);

  // Real-time listener for package_members
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
      console.warn('Package members listener notice:', e);
    }
  }, []);

  // Poll Razorpay UPI QR Status
  useEffect(() => {
    if (!upiQrData || !upiQrData.qrId || isQrPaid) return;

    let timer: any = null;
    let attempts = 0;
    const maxAttempts = 60; // Poll for 2 minutes (every 2 seconds)

    const checkStatus = async () => {
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
        console.warn('QR poll status notice:', err);
      }

      if (attempts >= maxAttempts) {
        clearInterval(timer);
      }
    };

    timer = setInterval(checkStatus, 2000);
    return () => clearInterval(timer);
  }, [upiQrData, isQrPaid]);

  // Generate Razorpay Dynamic UPI QR
  const handleGenerateUpiQr = async () => {
    if (!numAdvance || numAdvance <= 0) {
      setErrorMessage('Please enter a valid advance amount to generate QR code.');
      return;
    }
    setErrorMessage('');
    setIsGeneratingQr(true);
    setUpiQrData(null);
    setIsQrPaid(false);
    setRazorpayPaymentId('');

    try {
      const result = await createRazorpayPaymentQr({
        amount: numAdvance,
        patientName: patientName || 'Package Member',
        phone: phone || '9999999999',
        branch: selectedBranch || 'KPHB Branch',
        description: `Package: ${planName}`
      });

      if (result && result.imageUrl) {
        setUpiQrData(result);
      } else {
        setErrorMessage('Failed to generate dynamic Razorpay QR. Please try again.');
      }
    } catch (e: any) {
      setErrorMessage(e?.message || 'Error generating Razorpay QR.');
    } finally {
      setIsGeneratingQr(false);
    }
  };

  // Launch Razorpay Standard Gateway Checkout (UPI, QR, Cards, Netbanking)
  const handleLaunchRazorpayCheckout = async () => {
    if (!numAdvance || numAdvance <= 0) {
      setErrorMessage('Please enter a valid advance payment amount (₹).');
      return;
    }
    setErrorMessage('');
    setIsProcessingCard(true);

    try {
      await launchRazorpayStandardCheckout({
        amount: numAdvance,
        patientName: patientName.trim() || 'Package Member',
        phone: phone || '9999999999',
        branch: selectedBranch || 'KPHB Branch',
        description: `Package Advance - ${patientName.trim() || 'Member'}`,
        onSuccess: (paymentId: string) => {
          setRazorpayPaymentId(paymentId);
          setIsQrPaid(true);
          setIsProcessingCard(false);
        },
        onError: (err: any) => {
          setIsProcessingCard(false);
          setErrorMessage(err?.description || 'Razorpay checkout cancelled or failed.');
        }
      });
    } catch (e: any) {
      setIsProcessingCard(false);
      setErrorMessage(e?.message || 'Error opening Razorpay payment gateway.');
    }
  };

  // Submit and Enroll Patient in Package
  const handleSubmitEnrollment = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    const cleanPhone = phone.replace(/\D/g, '').slice(-10);
    if (!cleanPhone || cleanPhone.length !== 10) {
      setErrorMessage('Please enter a valid 10-digit mobile number.');
      return;
    }

    if (!patientName.trim()) {
      setErrorMessage('Please enter patient name.');
      return;
    }

    if (!numTotal || numTotal <= 0) {
      setErrorMessage('Please enter a valid total package amount.');
      return;
    }

    if (paymentMode.startsWith('razorpay') && !isQrPaid && !razorpayPaymentId) {
      setErrorMessage('Please complete Razorpay payment verification or choose Cash/Direct UPI.');
      return;
    }

    setIsSubmitting(true);

    try {
      const now = new Date();
      const expiryDate = new Date(now);
      expiryDate.setMonth(expiryDate.getMonth() + durationMonths);

      const pkgDocId = `pkg_${cleanPhone}_${Date.now()}`;
      const effectivePaymentMode = paymentMode === 'razorpay'
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
        phone: cleanPhone,
        branch: selectedBranch || 'KPHB Branch',
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
            paymentMode: effectivePaymentMode,
            razorpayPaymentId: razorpayPaymentId || undefined,
            note: 'Package Advance Registered'
          }
        ] : [],
        startDate: now.toISOString(),
        paymentDate: now.toISOString(),
        expiryDate: expiryDate.toISOString(),
        doctorName: doctorName || 'Dr. Prashanth K Vaidya',
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };

      await setDoc(doc(db, 'package_members', pkgDocId), pkgData);

      // 2. Update allpatients and appointments to attach PKG badge & package status
      const patientUpdates = {
        hasActivePackage: true,
        isPackageMember: true,
        packagePlanName: effectivePlanName,
        packageTotalAmount: numTotal,
        packageAdvancePaid: numAdvance,
        packageRemainingAmount: remainingAmount,
        packageDuration: `${durationMonths} Months`,
        packageExpiryDate: expiryDate.toISOString(),
        updatedAt: now.toISOString()
      };

      // Find matching allpatients docs
      const qPat = query(collection(db, 'allpatients'), where('phoneNumber', '==', cleanPhone));
      const patSnap = await getDocs(qPat);
      patSnap.forEach((d) => {
        updateDoc(doc(db, 'allpatients', d.id), patientUpdates).catch(() => {});
      });

      // Find matching appointments docs
      const qApt = query(collection(db, 'appointments'), where('phoneNumber', '==', cleanPhone));
      const aptSnap = await getDocs(qApt);
      aptSnap.forEach((d) => {
        updateDoc(doc(db, 'appointments', d.id), patientUpdates).catch(() => {});
      });

      // 3. Record transaction in alltransactions
      if (numAdvance > 0) {
        const txnDoc = {
          patientName: patientName.trim(),
          phoneNumber: cleanPhone,
          phone: cleanPhone,
          branchName: selectedBranch || 'KPHB Branch',
          branch: selectedBranch || 'KPHB Branch',
          revenueSplit: 'Package',
          planName: effectivePlanName,
          amount: numAdvance,
          totalAmount: numAdvance,
          totalPaid: numAdvance,
          paymentMethod: effectivePaymentMode.toLowerCase().includes('cash') ? 'cash' : 'upi',
          paymentMode: effectivePaymentMode,
          razorpayPaymentId: razorpayPaymentId || undefined,
          timestamp: now.toISOString().split('T')[0],
          date: now.toISOString(),
          status: 'PAID',
          createdAt: now.toISOString()
        };
        await addDoc(collection(db, 'alltransactions'), txnDoc).catch(() => {});
      }

      setSuccessMessage(`🎉 Patient ${patientName.trim()} successfully enrolled in ${effectivePlanName}! PKG badge is now active.`);
      
      // Reset form
      setPhone('');
      setPatientName('');
      setFoundPatient(null);
      setUpiQrData(null);
      setIsQrPaid(false);
      setRazorpayPaymentId('');
      setTotalAmount('');
      setAdvanceAmount('');

      // Switch to members tab after 1.5s
      setTimeout(() => {
        setActiveTab('members');
      }, 1500);

    } catch (err: any) {
      console.error('Package enrollment error:', err);
      setErrorMessage(err?.message || 'Failed to enroll package. Please check connection.');
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
      (m.planName && m.planName.toLowerCase().includes(q)) ||
      (m.branch && m.branch.toLowerCase().includes(q))
    );
  });

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto', fontFamily: 'Inter, system-ui, sans-serif' }}>
      
      {/* Header Banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 900, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ background: '#e0f2fe', padding: '8px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Package color="#0284c7" size={24} />
            </div>
            Treatment & Healing Package Registration
          </h1>
          <p style={{ color: '#64748b', fontSize: '13px', marginTop: '4px', margin: 0 }}>
            Enroll patients in curative treatment subscriptions with advance payment & Razorpay verification
          </p>
        </div>

        {/* Tab Switcher */}
        <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '12px', gap: '4px' }}>
          <button
            type="button"
            onClick={() => setActiveTab('register')}
            style={{
              padding: '8px 18px',
              borderRadius: '8px',
              border: 'none',
              fontSize: '12.5px',
              fontWeight: 700,
              cursor: 'pointer',
              background: activeTab === 'register' ? '#ffffff' : 'transparent',
              color: activeTab === 'register' ? '#0284c7' : '#64748b',
              boxShadow: activeTab === 'register' ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            ✍️ Enroll Patient in Package
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('members')}
            style={{
              padding: '8px 18px',
              borderRadius: '8px',
              border: 'none',
              fontSize: '12.5px',
              fontWeight: 700,
              cursor: 'pointer',
              background: activeTab === 'members' ? '#ffffff' : 'transparent',
              color: activeTab === 'members' ? '#0284c7' : '#64748b',
              boxShadow: activeTab === 'members' ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            📋 Active Package Members ({packageMembers.length})
          </button>
        </div>
      </div>

      {/* Success / Error Alerts */}
      {successMessage && (
        <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: '12px', padding: '14px 16px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px', color: '#166534', fontSize: '13px', fontWeight: 700 }}>
          <CheckCircle2 size={18} color="#16a34a" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '12px', padding: '14px 16px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px', color: '#991b1b', fontSize: '13px', fontWeight: 700 }}>
          <AlertCircle size={18} color="#dc2626" />
          <span>{errorMessage}</span>
        </div>
      )}

      {activeTab === 'register' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '24px', alignItems: 'start' }}>
          
          {/* LEFT COLUMN: ENROLLMENT FORM */}
          <div style={{ background: '#ffffff', borderRadius: '18px', border: '1px solid #e2e8f0', padding: '24px', boxShadow: '0 4px 16px rgba(0,0,0,0.03)' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', margin: '0 0 18px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={18} color="#0284c7" /> Patient Package Details
            </h2>

            <form onSubmit={handleSubmitEnrollment}>
              
              {/* Patient Phone, Name & Duration Row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 0.8fr', gap: '14px', marginBottom: '16px' }}>
                <div>
                  <label style={{ fontSize: '11px', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '5px' }}>
                    Patient Mobile Number *
                  </label>
                  <div style={{ position: 'relative' }}>
                    <div style={{ position: 'absolute', left: '10px', top: '10px', color: '#64748b' }}>
                      <Phone size={15} />
                    </div>
                    <input
                      type="tel"
                      placeholder="10-digit mobile number"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      maxLength={10}
                      required
                      style={{
                        width: '100%',
                        padding: '9px 12px 9px 34px',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        fontSize: '13px',
                        fontWeight: 600,
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                  {isSearchingPatient && (
                    <span style={{ fontSize: '10.5px', color: '#0284c7', marginTop: '4px', display: 'block' }}>
                      🔍 Checking patient database...
                    </span>
                  )}
                  {foundPatient && (
                    <span style={{ fontSize: '10.5px', color: '#16a34a', fontWeight: 700, marginTop: '4px', display: 'block' }}>
                      ✓ {foundPatient.name || foundPatient.patientName} ({foundPatient.branchName || foundPatient.branch || 'Clinic'})
                    </span>
                  )}
                </div>

                <div>
                  <label style={{ fontSize: '11px', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '5px' }}>
                    Patient Full Name *
                  </label>
                  <div style={{ position: 'relative' }}>
                    <div style={{ position: 'absolute', left: '10px', top: '10px', color: '#64748b' }}>
                      <User size={15} />
                    </div>
                    <input
                      type="text"
                      placeholder="Enter patient name"
                      value={patientName}
                      onChange={(e) => setPatientName(e.target.value)}
                      required
                      style={{
                        width: '100%',
                        padding: '9px 12px 9px 34px',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        fontSize: '13px',
                        fontWeight: 600,
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: '11px', fontWeight: 800, color: '#475569', display: 'block', marginBottom: '5px' }}>
                    Coverage Duration
                  </label>
                  <select
                    value={durationMonths}
                    onChange={(e) => setDurationMonths(Number(e.target.value))}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '13px',
                      fontWeight: 600,
                      outline: 'none',
                      background: '#ffffff',
                      boxSizing: 'border-box'
                    }}
                  >
                    <option value={3}>3 Months Care</option>
                    <option value={6}>6 Months Care</option>
                    <option value={12}>12 Months Care (1 Year)</option>
                    <option value={24}>24 Months Care (2 Years)</option>
                  </select>
                </div>
              </div>

              {/* Amount Breakdown Row */}
              <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0', marginBottom: '18px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', alignItems: 'flex-end' }}>
                  
                  {/* Total Amount */}
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 800, color: '#334155', display: 'block', marginBottom: '5px' }}>
                      Total Package Fee (₹) *
                    </label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: '10px', top: '9px', fontWeight: 800, color: '#64748b' }}>₹</span>
                      <input
                        type="number"
                        placeholder="0"
                        value={totalAmount}
                        onChange={(e) => setTotalAmount(e.target.value ? Number(e.target.value) : '')}
                        required
                        style={{
                          width: '100%',
                          padding: '8px 10px 8px 26px',
                          borderRadius: '8px',
                          border: '1px solid #cbd5e1',
                          fontSize: '14px',
                          fontWeight: 800,
                          color: '#0f172a',
                          outline: 'none',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  </div>

                  {/* Advance Amount */}
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 800, color: '#0369a1', display: 'block', marginBottom: '5px' }}>
                      Advance / Paying Now (₹) *
                    </label>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: '10px', top: '9px', fontWeight: 800, color: '#0369a1' }}>₹</span>
                      <input
                        type="number"
                        placeholder="0"
                        value={advanceAmount}
                        onChange={(e) => setAdvanceAmount(e.target.value ? Number(e.target.value) : '')}
                        required
                        style={{
                          width: '100%',
                          padding: '8px 10px 8px 26px',
                          borderRadius: '8px',
                          border: '1.5px solid #0284c7',
                          fontSize: '14px',
                          fontWeight: 800,
                          color: '#0284c7',
                          background: '#f0f9ff',
                          outline: 'none',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  </div>

                  {/* Remaining Amount */}
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', display: 'block', marginBottom: '5px' }}>
                      Remaining Balance
                    </label>
                    <div style={{
                      padding: '8px 12px',
                      borderRadius: '8px',
                      background: remainingAmount > 0 ? '#fef3c7' : '#dcfce7',
                      border: remainingAmount > 0 ? '1px solid #fde68a' : '1px solid #bbf7d0',
                      fontSize: '14px',
                      fontWeight: 800,
                      color: remainingAmount > 0 ? '#b45309' : '#15803d',
                      textAlign: 'center'
                    }}>
                      ₹{remainingAmount.toLocaleString('en-IN')}
                    </div>
                  </div>

                </div>
              </div>

              {/* Payment Mode Selector */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '8px' }}>
                  Select Payment Method
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  
                  {/* Razorpay Gateway */}
                  <button
                    type="button"
                    onClick={() => { setPaymentMode('razorpay'); }}
                    style={{
                      padding: '12px 8px',
                      borderRadius: '10px',
                      border: paymentMode === 'razorpay' ? '2px solid #0284c7' : '1px solid #e2e8f0',
                      background: paymentMode === 'razorpay' ? '#eff6ff' : '#ffffff',
                      cursor: 'pointer',
                      textAlign: 'center'
                    }}
                  >
                    <CreditCard size={18} color={paymentMode === 'razorpay' ? '#0284c7' : '#64748b'} style={{ margin: '0 auto 4px' }} />
                    <div style={{ fontSize: '11px', fontWeight: 700, color: paymentMode === 'razorpay' ? '#0284c7' : '#0f172a' }}>
                      Razorpay Gateway
                    </div>
                    <div style={{ fontSize: '9.5px', color: '#64748b', marginTop: '2px' }}>
                      UPI, QR, Cards
                    </div>
                  </button>

                  {/* Cash */}
                  <button
                    type="button"
                    onClick={() => { setPaymentMode('cash'); setIsQrPaid(true); }}
                    style={{
                      padding: '12px 8px',
                      borderRadius: '10px',
                      border: paymentMode === 'cash' ? '2px solid #16a34a' : '1px solid #e2e8f0',
                      background: paymentMode === 'cash' ? '#f0fdf4' : '#ffffff',
                      cursor: 'pointer',
                      textAlign: 'center'
                    }}
                  >
                    <IndianRupee size={18} color={paymentMode === 'cash' ? '#16a34a' : '#64748b'} style={{ margin: '0 auto 4px' }} />
                    <div style={{ fontSize: '11px', fontWeight: 700, color: paymentMode === 'cash' ? '#16a34a' : '#0f172a' }}>
                      Cash at Clinic
                    </div>
                    <div style={{ fontSize: '9.5px', color: '#64748b', marginTop: '2px' }}>
                      Manual Counter
                    </div>
                  </button>

                  {/* Direct UPI */}
                  <button
                    type="button"
                    onClick={() => { setPaymentMode('upi'); setIsQrPaid(true); }}
                    style={{
                      padding: '12px 8px',
                      borderRadius: '10px',
                      border: paymentMode === 'upi' ? '2px solid #16a34a' : '1px solid #e2e8f0',
                      background: paymentMode === 'upi' ? '#f0fdf4' : '#ffffff',
                      cursor: 'pointer',
                      textAlign: 'center'
                    }}
                  >
                    <Sparkles size={18} color={paymentMode === 'upi' ? '#16a34a' : '#64748b'} style={{ margin: '0 auto 4px' }} />
                    <div style={{ fontSize: '11px', fontWeight: 700, color: paymentMode === 'upi' ? '#16a34a' : '#0f172a' }}>
                      Direct Clinic UPI
                    </div>
                    <div style={{ fontSize: '9.5px', color: '#64748b', marginTop: '2px' }}>
                      Counter Standee
                    </div>
                  </button>

                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting}
                style={{
                  width: '100%',
                  height: '48px',
                  background: isSubmitting ? '#94a3b8' : '#0284c7',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '12px',
                  fontSize: '14px',
                  fontWeight: 800,
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 14px rgba(2, 132, 199, 0.3)',
                  transition: 'all 0.15s ease'
                }}
              >
                {isSubmitting ? (
                  <span>⏳ Activating Package Membership...</span>
                ) : (
                  <>
                    <ShieldCheck size={18} />
                    <span>Confirm & Activate Package Membership (Attach PKG)</span>
                  </>
                )}
              </button>

            </form>
          </div>

          {/* RIGHT COLUMN: RAZORPAY PAYMENT GATEWAY CARD */}
          <div style={{ background: '#ffffff', borderRadius: '18px', border: '1px solid #e2e8f0', padding: '24px', boxShadow: '0 4px 16px rgba(0,0,0,0.03)' }}>
            
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ background: '#e0f2fe', padding: '6px', borderRadius: '8px' }}>
                  <CreditCard size={18} color="#0284c7" />
                </div>
                <div>
                  <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                    Razorpay Payment Gateway
                  </h3>
                  <span style={{ fontSize: '11px', color: '#64748b' }}>
                    Pay advance ₹{numAdvance.toLocaleString('en-IN')} securely
                  </span>
                </div>
              </div>

              {isQrPaid && (
                <span style={{ background: '#dcfce7', color: '#166534', padding: '3px 8px', borderRadius: '8px', fontSize: '11px', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Check size={13} /> PAID
                </span>
              )}
            </div>

            {/* RAZORPAY STANDARD GATEWAY SECTION */}
            {paymentMode === 'razorpay' && (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                {isQrPaid ? (
                  <div style={{ background: '#f0fdf4', border: '1.5px solid #86efac', borderRadius: '14px', padding: '24px 16px' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                      <CheckCircle2 size={28} color="#16a34a" />
                    </div>
                    <h4 style={{ fontSize: '15px', fontWeight: 800, color: '#166534', margin: '0 0 6px 0' }}>
                      Payment of ₹{numAdvance.toLocaleString('en-IN')} Received!
                    </h4>
                    <p style={{ fontSize: '11.5px', color: '#15803d', margin: '0 0 8px 0' }}>
                      Verified via Razorpay Standard Gateway. You may now activate the package.
                    </p>
                    {razorpayPaymentId && (
                      <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#475569', background: '#e2e8f0', padding: '3px 8px', borderRadius: '6px' }}>
                        Ref: {razorpayPaymentId}
                      </span>
                    )}
                  </div>
                ) : (
                  <div style={{ padding: '24px 16px', background: '#f8fafc', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
                    <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: '#e0f2fe', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                      <CreditCard size={26} color="#0284c7" />
                    </div>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', marginBottom: '6px' }}>
                      Razorpay Standard Gateway
                    </div>
                    <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 16px 0', lineHeight: 1.5 }}>
                      Opens official Razorpay modal. Accepts <b>Google Pay, PhonePe, Paytm, Verified Razorpay QR, Credit/Debit Cards & Netbanking</b>.
                    </p>
                    <button
                      type="button"
                      disabled={isProcessingCard || numAdvance <= 0}
                      onClick={handleLaunchRazorpayCheckout}
                      style={{
                        width: '100%',
                        padding: '12px 20px',
                        background: numAdvance > 0 && !isProcessingCard ? '#0284c7' : '#94a3b8',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '10px',
                        fontSize: '13.5px',
                        fontWeight: 800,
                        cursor: numAdvance > 0 && !isProcessingCard ? 'pointer' : 'not-allowed',
                        boxShadow: '0 4px 14px rgba(2, 132, 199, 0.25)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px'
                      }}
                    >
                      {isProcessingCard ? (
                        <span>⏳ Opening Razorpay Gateway...</span>
                      ) : (
                        <>
                          <ExternalLink size={16} />
                          <span>Pay Advance ₹{numAdvance > 0 ? numAdvance.toLocaleString('en-IN') : '0'} via Razorpay</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* CASH / DIRECT UPI SECTION */}
            {(paymentMode === 'cash' || paymentMode === 'upi') && (
              <div style={{ textAlign: 'center', padding: '24px 12px', background: '#f0fdf4', borderRadius: '14px', border: '1.5px solid #bbf7d0' }}>
                <CheckCircle2 size={32} color="#16a34a" style={{ margin: '0 auto 8px' }} />
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#166534', marginBottom: '4px' }}>
                  {paymentMode === 'cash' ? 'Cash Payment Selected' : 'Direct Clinic UPI Selected'}
                </div>
                <p style={{ fontSize: '12px', color: '#15803d', margin: 0 }}>
                  Advance of ₹{numAdvance.toLocaleString('en-IN')} will be recorded directly.
                </p>
              </div>
            )}

            {/* Summary Box */}
            <div style={{ marginTop: '18px', borderTop: '1px solid #f1f5f9', paddingTop: '14px' }}>
              <div style={{ fontSize: '12px', fontWeight: 800, color: '#0f172a', marginBottom: '8px' }}>
                Membership Summary
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: '#64748b', marginBottom: '4px' }}>
                <span>Coverage Duration:</span>
                <span style={{ fontWeight: 700, color: '#0f172a' }}>{durationMonths} Months Treatment Care</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: '#64748b', marginBottom: '4px' }}>
                <span>Branch:</span>
                <span style={{ fontWeight: 700, color: '#0f172a' }}>{selectedBranch}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', fontWeight: 800, color: '#0f172a', borderTop: '1px dashed #e2e8f0', paddingTop: '6px', marginTop: '6px' }}>
                <span>Total Fee:</span>
                <span>₹{numTotal.toLocaleString('en-IN')}</span>
              </div>
            </div>

          </div>

        </div>
      ) : (
        /* MEMBERS TAB: LIST OF ACTIVE PACKAGE MEMBERS */
        <div style={{ background: '#ffffff', borderRadius: '18px', border: '1px solid #e2e8f0', padding: '24px', boxShadow: '0 4px 16px rgba(0,0,0,0.03)' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <BadgeCheck size={20} color="#0284c7" /> Active Care Package Members
            </h2>

            {/* Search Input */}
            <div style={{ display: 'flex', alignItems: 'center', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '6px 12px', width: '280px' }}>
              <Search size={14} color="#64748b" style={{ marginRight: '6px' }} />
              <input
                type="text"
                placeholder="Search name, phone, plan..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '12px', width: '100%' }}
              />
            </div>
          </div>

          {filteredMembers.length === 0 ? (
            <div style={{ padding: '40px 16px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
              No package members found. Enroll your first patient above!
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', textAlign: 'left' }}>
                    <th style={{ padding: '10px 14px', fontWeight: 800 }}>PATIENT & BADGE</th>
                    <th style={{ padding: '10px 14px', fontWeight: 800 }}>MOBILE NUMBER</th>
                    <th style={{ padding: '10px 14px', fontWeight: 800 }}>PLAN & DURATION</th>
                    <th style={{ padding: '10px 14px', fontWeight: 800 }}>TOTAL AMOUNT</th>
                    <th style={{ padding: '10px 14px', fontWeight: 800 }}>PAID ADVANCE</th>
                    <th style={{ padding: '10px 14px', fontWeight: 800 }}>REMAINING</th>
                    <th style={{ padding: '10px 14px', fontWeight: 800 }}>EXPIRY DATE</th>
                    <th style={{ padding: '10px 14px', fontWeight: 800 }}>BRANCH</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMembers.map((m) => {
                    const expiryStr = m.expiryDate ? new Date(m.expiryDate).toLocaleDateString() : 'N/A';
                    const isDue = (m.remainingAmount || 0) > 0;
                    return (
                      <tr key={m.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        
                        {/* Patient & PKG Badge */}
                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontWeight: 800, color: '#0f172a' }}>
                              {m.patientName || 'Unknown Patient'}
                            </span>
                            <span style={{
                              background: '#8b5cf6',
                              color: '#ffffff',
                              fontSize: '10px',
                              fontWeight: 900,
                              padding: '2px 6px',
                              borderRadius: '6px',
                              letterSpacing: '0.4px'
                            }}>
                              PKG
                            </span>
                          </div>
                        </td>

                        {/* Phone */}
                        <td style={{ padding: '12px 14px', color: '#475569', fontWeight: 600 }}>
                          {m.phone || 'N/A'}
                        </td>

                        {/* Plan */}
                        <td style={{ padding: '12px 14px' }}>
                          <span style={{ fontWeight: 700, color: '#0284c7' }}>{m.planName || 'Care Package'}</span>
                          <span style={{ color: '#94a3b8', fontSize: '11px', display: 'block' }}>{m.duration || '6 Months'}</span>
                        </td>

                        {/* Total */}
                        <td style={{ padding: '12px 14px', fontWeight: 800, color: '#0f172a' }}>
                          ₹{(m.totalAmount || 0).toLocaleString('en-IN')}
                        </td>

                        {/* Paid Advance */}
                        <td style={{ padding: '12px 14px', fontWeight: 800, color: '#16a34a' }}>
                          ₹{(m.paidAmount || 0).toLocaleString('en-IN')}
                        </td>

                        {/* Remaining */}
                        <td style={{ padding: '12px 14px' }}>
                          <span style={{
                            fontWeight: 800,
                            color: isDue ? '#b45309' : '#16a34a',
                            background: isDue ? '#fef3c7' : '#dcfce7',
                            padding: '3px 8px',
                            borderRadius: '6px'
                          }}>
                            ₹{(m.remainingAmount || 0).toLocaleString('en-IN')}
                          </span>
                        </td>

                        {/* Expiry */}
                        <td style={{ padding: '12px 14px', color: '#64748b' }}>
                          {expiryStr}
                        </td>

                        {/* Branch */}
                        <td style={{ padding: '12px 14px', color: '#475569', fontWeight: 600 }}>
                          {m.branch || 'KPHB Branch'}
                        </td>

                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

        </div>
      )}

    </div>
  );
};
