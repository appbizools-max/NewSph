import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  RotateCcw, Search, Calendar, Clock, User, Phone, Building2,
  Stethoscope, CheckCircle2, AlertCircle, ArrowRight, FileText,
  CreditCard, Plus, Trash2, Upload, X, ShieldCheck, Check, Info,
  Sparkles, ExternalLink
} from 'lucide-react';
import { db, sanitizeDoctorName, resolveCanonicalBranchId } from '@app/shared';
import { collection, doc, setDoc, updateDoc, addDoc, getDocs, query, where, limit } from 'firebase/firestore';
import { receptionDataStore } from '../../../utils/receptionDataStore';

interface RebackAppointmentPageProps {
  currentBranch?: string;
  userRole?: string;
  onNavigate?: (tab: string, patientData?: any) => void;
}

interface ExistingPatientItem {
  id: string;
  patientDocId?: string;
  patientId?: string;
  regId: string;
  name: string;
  phone: string;
  email?: string;
  diseases?: string;
  branch: string;
  gender?: string;
  age?: string | number;
}

const CLINIC_BRANCHES = [
  'KPHB Branch',
  'Nallagandla Branch',
  'Dilshuknagar Branch',
  'Chandanagar Branch',
];

const DOCTOR_OPTIONS = [
  'Dr. Prashanth K Vaidya',
  'Dr. Ramakrishna Chanduri',
  'Dr. Jobedah Parveej',
  'Dr. Padma Priya'
];

export const RebackAppointmentPage: React.FC<RebackAppointmentPageProps> = ({
  currentBranch = 'KPHB Branch',
  userRole = 'reception',
  onNavigate
}) => {
  // Helper to format YYYY-MM-DD
  const getYesterdayYMD = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const getTodayYMD = () => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  // State: Patient Search & Selection
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<ExistingPatientItem | null>(null);
  const [patientPool, setPatientPool] = useState<ExistingPatientItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // State: Historical Visit Details
  const [historicalDate, setHistoricalDate] = useState<string>(getYesterdayYMD);
  const [visitTime, setVisitTime] = useState<string>('11:00 AM');
  const [selectedBranch, setSelectedBranch] = useState<string>(() => {
    if (currentBranch && currentBranch !== 'All Branches') return currentBranch;
    return 'KPHB Branch';
  });
  const [selectedDoctor, setSelectedDoctor] = useState<string>('Dr. Prashanth K Vaidya');
  const [consultationMode, setConsultationMode] = useState<'In-Clinic' | 'Video'>('In-Clinic');
  const [visitNotes, setVisitNotes] = useState<string>('');

  // Submission State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [savedVisitResult, setSavedVisitResult] = useState<any | null>(null);

  // Direct Modals after Save
  const [showPrescriptionModal, setShowPrescriptionModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  // Direct Prescription State
  const [prescriptionNotes, setPrescriptionNotes] = useState('');
  const [prescriptionMedicines, setPrescriptionMedicines] = useState<Array<{ name: string; dosage: string; duration: string }>>([
    { name: '', dosage: 'M - - N (Morning & Night)', duration: '15 Days' }
  ]);
  const [isSavingPrescription, setIsSavingPrescription] = useState(false);
  const [prescriptionSavedSuccess, setPrescriptionSavedSuccess] = useState(false);

  // Direct Payment State (Recording Past Collection - NO RAZORPAY)
  const [paymentAmount, setPaymentAmount] = useState<number>(500);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'upi' | 'card'>('cash');
  const [paymentSplitType, setPaymentSplitType] = useState<string>('Consultation');
  const [paymentNotes, setPaymentNotes] = useState<string>('Previously collected during patient clinic visit');
  const [isSavingPayment, setIsSavingPayment] = useState(false);
  const [paymentSavedSuccess, setPaymentSavedSuccess] = useState(false);

  // Load Patient Pool from receptionDataStore and subscribe to live changes
  useEffect(() => {
    receptionDataStore.startListeners();
    const updatePool = () => {
      const pool = receptionDataStore.getAllCollectionsPool() || [];
      const dedupeMap = new Map<string, ExistingPatientItem>();

      for (const item of pool) {
        if (!item) continue;
        const phone = String(item.phoneNumber || item.phone || item.mobile || '').replace(/\D/g, '').slice(-10);
        const name = String(item.patientName || item.fullName || item.name || '').trim();
        const regId = String(item.registrationId || item.regId || item.uhid || item.patientId || '').trim();
        const docId = String(item.id || item.docId || '').trim();

        if (!name || name === 'Patient' || name === 'Appointment Patient') continue;
        const key = phone || regId.toLowerCase() || docId;
        if (!key) continue;

        if (!dedupeMap.has(key)) {
          dedupeMap.set(key, {
            id: docId || key,
            patientDocId: item.patientDocId || docId,
            patientId: regId || docId,
            regId: regId || `SPH-${(item.branch || 'KPHB').slice(0, 3).toUpperCase()}-PAT`,
            name,
            phone,
            email: item.email || item.emailAddress || '',
            diseases: item.diseases || item.complaints || item.subject || '',
            branch: item.branch || item.branchName || currentBranch,
            gender: item.gender || '',
            age: item.age || ''
          });
        }
      }
      setPatientPool(Array.from(dedupeMap.values()));
    };

    updatePool();
    const unsub = receptionDataStore.subscribe(updatePool);
    return () => unsub();
  }, [currentBranch]);

  // Click outside listener for patient search dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setShowSearchResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filtered patients for search
  const filteredPatients = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    const cleanDigits = q.replace(/\D/g, '');

    return patientPool.filter(p => {
      const matchName = p.name.toLowerCase().includes(q);
      const matchReg = p.regId.toLowerCase().includes(q);
      const matchPhone = cleanDigits.length >= 3 && p.phone.includes(cleanDigits);
      return matchName || matchReg || matchPhone;
    }).slice(0, 15);
  }, [searchQuery, patientPool]);

  // Trigger live Firestore query if local pool misses
  const handleLivePatientSearch = async (term: string) => {
    if (!term || term.length < 3 || !db) return;
    setIsSearching(true);
    try {
      const cleanDigits = term.replace(/\D/g, '').slice(-10);
      const queriesToRun = [];

      if (cleanDigits.length === 10) {
        queriesToRun.push(getDocs(query(collection(db, 'allpatients'), where('phoneNumber', '==', cleanDigits), limit(5))));
        queriesToRun.push(getDocs(query(collection(db, 'allpatients'), where('phone', '==', cleanDigits), limit(5))));
        queriesToRun.push(getDocs(query(collection(db, 'patients'), where('phone', '==', cleanDigits), limit(5))));
      } else {
        const upper = term.toUpperCase().trim();
        queriesToRun.push(getDocs(query(collection(db, 'allpatients'), where('registrationId', '==', upper), limit(5))));
        queriesToRun.push(getDocs(query(collection(db, 'allpatients'), where('regId', '==', upper), limit(5))));
      }

      const snapshots = await Promise.all(queriesToRun);
      const fetched: ExistingPatientItem[] = [];
      snapshots.forEach(snap => {
        snap.docs.forEach(d => {
          const data = d.data();
          const name = data.fullName || data.patientName || data.name || '';
          if (name) {
            fetched.push({
              id: d.id,
              patientDocId: d.id,
              patientId: data.registrationId || data.regId || d.id,
              regId: data.registrationId || data.regId || 'REG-ID',
              name,
              phone: String(data.phoneNumber || data.phone || '').replace(/\D/g, '').slice(-10),
              branch: data.branch || data.branchName || currentBranch,
              email: data.email || '',
              diseases: data.diseases || ''
            });
          }
        });
      });

      if (fetched.length > 0) {
        setPatientPool(prev => {
          const map = new Map(prev.map(p => [p.phone || p.regId, p]));
          fetched.forEach(f => {
            if (!map.has(f.phone || f.regId)) map.set(f.phone || f.regId, f);
          });
          return Array.from(map.values());
        });
      }
    } catch (err) {
      console.warn('Live patient search notice:', err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectPatient = (patient: ExistingPatientItem) => {
    setSelectedPatient(patient);
    setSearchQuery('');
    setShowSearchResults(false);
    setErrorMessage(null);
    if (patient.branch && CLINIC_BRANCHES.includes(patient.branch)) {
      setSelectedBranch(patient.branch);
    }
  };

  // Save Historical Visit
  const handleSaveRebackVisit = async () => {
    setErrorMessage(null);

    // Validation 1: Patient must be selected
    if (!selectedPatient) {
      setErrorMessage('Please search and select an existing patient first.');
      return;
    }

    // Validation 2: Date must be strictly in past or today (no future dates)
    const today = getTodayYMD();
    if (historicalDate > today) {
      setErrorMessage('Reback Appointment only allows past / historical visit dates. Future dates cannot be booked in Reback mode.');
      return;
    }

    if (!selectedDoctor) {
      setErrorMessage('Please select the consulting doctor who treated the patient.');
      return;
    }

    setIsSubmitting(true);
    try {
      const newDocRef = doc(collection(db, 'appointments'));
      const visitDocId = newDocRef.id;

      const appPayload = {
        id: visitDocId,
        appointmentId: visitDocId,
        patientId: selectedPatient.patientId || selectedPatient.regId || selectedPatient.id,
        patientDocId: selectedPatient.patientDocId || selectedPatient.id,
        registrationId: selectedPatient.regId,
        regId: selectedPatient.regId,
        patientName: selectedPatient.name,
        fullName: selectedPatient.name,
        name: selectedPatient.name,
        phone: selectedPatient.phone,
        phoneNumber: selectedPatient.phone,
        emailAddress: selectedPatient.email || '',
        diseases: visitNotes || selectedPatient.diseases || 'Consultation',
        branch: selectedBranch,
        branchName: selectedBranch,
        targetBranch: selectedBranch,
        doctorName: sanitizeDoctorName(selectedDoctor, selectedBranch),
        doctor: sanitizeDoctorName(selectedDoctor, selectedBranch),
        appointmentDate: historicalDate,
        date: historicalDate,
        appointmentTime: visitTime,
        time: visitTime,
        timeSlot: visitTime,
        consultationMode: consultationMode,
        // CRITICAL REQUIREMENTS:
        // 1. Strictly completed status so it NEVER appears in upcoming queue
        status: 'completed',
        // 2. Explicit Reback flags
        isReback: true,
        rebackVisit: true,
        isNewPatient: false,
        patientType: 'revisit',
        paymentStatus: 'pending',
        // 3. Clear audit timestamps: visit date vs data entry date
        historicalVisitDate: historicalDate,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        enteredByRole: userRole || 'reception'
      };

      // SAVE STRICTLY TO appointments COLLECTION
      // DO NOT call setDoc on 'patients' or 'allpatients' to PREVENT DUPLICATE PATIENTS!
      await setDoc(newDocRef, appPayload);

      // Successfully saved!
      setSavedVisitResult(appPayload);
      // Immediately open Collect Fee modal for reception to record past payment
      setShowPaymentModal(true);
    } catch (err: any) {
      console.error('Failed to save Reback Appointment:', err);
      setErrorMessage(err.message || 'Failed to save historical visit. Please check network connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Direct Prescription Save Handler
  const handleSaveDirectPrescription = async () => {
    if (!savedVisitResult || !db) return;
    setIsSavingPrescription(true);
    try {
      const cleanMedicines = prescriptionMedicines.filter(m => m.name.trim().length > 0);
      const presDocRef = doc(collection(db, 'prescriptions'));

      const presPayload = {
        id: presDocRef.id,
        appointmentId: savedVisitResult.id,
        patientId: savedVisitResult.patientId || savedVisitResult.regId,
        patientDocId: savedVisitResult.patientDocId,
        patientName: savedVisitResult.patientName,
        phone: savedVisitResult.phone,
        branch: savedVisitResult.branch,
        doctorName: savedVisitResult.doctorName,
        prescriptionDate: savedVisitResult.appointmentDate,
        date: savedVisitResult.appointmentDate,
        medicines: cleanMedicines,
        notes: prescriptionNotes,
        diagnosisNotes: prescriptionNotes || 'Clinical consultation & prescription recorded.',
        isReback: true,
        createdAt: new Date().toISOString()
      };

      await setDoc(presDocRef, presPayload);

      // Also link to the appointment doc
      await updateDoc(doc(db, 'appointments', savedVisitResult.id), {
        medicines: cleanMedicines,
        prescriptionNotes: prescriptionNotes,
        hasPrescription: true,
        prescriptionId: presDocRef.id,
        updatedAt: new Date().toISOString()
      }).catch(() => {});

      setPrescriptionSavedSuccess(true);
      setTimeout(() => setShowPrescriptionModal(false), 1500);
    } catch (err) {
      console.error('Error saving direct prescription:', err);
    } finally {
      setIsSavingPrescription(false);
    }
  };

  // Direct Payment Save Handler (Recording Past Collection - NO RAZORPAY, NO SMS/WHATSAPP)
  const handleSaveDirectPayment = async () => {
    if (!savedVisitResult || !db) return;
    setIsSavingPayment(true);
    try {
      const parsedAmount = Number(paymentAmount) || 0;
      const txnDocRef = doc(collection(db, 'alltransactions'));

      const txnPayload = {
        id: txnDocRef.id,
        appointmentId: savedVisitResult.id,
        patientDocId: savedVisitResult.patientDocId,
        patientId: savedVisitResult.patientId || savedVisitResult.regId,
        registrationId: savedVisitResult.registrationId,
        patientName: savedVisitResult.patientName,
        phone: savedVisitResult.phone,
        branchName: savedVisitResult.branch,
        doctorName: savedVisitResult.doctorName,
        amount: parsedAmount,
        totalAmount: parsedAmount,
        consultationFee: paymentSplitType === 'Consultation' ? parsedAmount : (paymentSplitType === 'Consultation & Medicine Fee' ? Math.min(parsedAmount, 800) : 0),
        medicineFee: paymentSplitType === 'Consultation & Medicine Fee' ? Math.max(0, parsedAmount - 800) : 0,
        packageFee: paymentSplitType === 'Package' ? parsedAmount : 0,
        dietFee: paymentSplitType === 'Diet Plan' ? parsedAmount : 0,
        paymentMethod: paymentMethod,
        paymentMode: paymentMethod.toUpperCase(),
        revenueSplit: paymentSplitType,
        source: 'Old Patient',
        status: 'PAID',
        notes: paymentNotes,
        isReback: true,
        // Preserve historical visit date as the financial transaction collection date
        paymentCollectedAt: savedVisitResult.appointmentDate,
        timestamp: savedVisitResult.appointmentDate,
        date: savedVisitResult.appointmentDate,
        createdAt: new Date().toISOString() // actual record creation timestamp
      };

      // 1. Write authoritative ledger entry to alltransactions
      await setDoc(txnDocRef, txnPayload);

      // 2. Update appointment payment status
      await updateDoc(doc(db, 'appointments', savedVisitResult.id), {
        paymentStatus: 'paid',
        paymentPending: false,
        feeCollectionNeeded: false,
        paidAmount: parsedAmount,
        totalPaid: parsedAmount,
        totalAmount: parsedAmount,
        paymentMethod: paymentMethod,
        paymentMode: paymentMethod.toUpperCase(),
        paymentCollectedAt: savedVisitResult.appointmentDate,
        isRebackPaymentRecorded: true,
        updatedAt: new Date().toISOString()
      }).catch(() => {});

      // CRITICAL: DO NOT SEND WHATSAPP, SMS, OR FCM NOTIFICATIONS FOR REBACK PAYMENTS!
      // NO RAZORPAY GATEWAY OR CHECKOUT FLOW!

      setPaymentSavedSuccess(true);
      setTimeout(() => setShowPaymentModal(false), 1500);
    } catch (err) {
      console.error('Error saving direct payment:', err);
    } finally {
      setIsSavingPayment(false);
    }
  };

  const handleResetForm = () => {
    setSelectedPatient(null);
    setSearchQuery('');
    setHistoricalDate(getYesterdayYMD());
    setVisitTime('11:00 AM');
    setVisitNotes('');
    setSavedVisitResult(null);
    setPrescriptionSavedSuccess(false);
    setPaymentSavedSuccess(false);
    setErrorMessage(null);
  };

  return (
    <div style={{ maxWidth: '1080px', margin: '0 auto', padding: '20px 16px', fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* Header Banner */}
      <div style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '16px',
        padding: '20px 24px',
        marginBottom: '20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '14px',
        boxShadow: '0 1px 4px rgba(0,0,0,0.03)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
            padding: '12px',
            borderRadius: '12px',
            color: '#ffffff',
            boxShadow: '0 4px 10px rgba(2, 132, 199, 0.25)'
          }}>
            <RotateCcw size={24} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                Reback Appointment — Historical Visit Entry
              </h1>
              <span style={{
                background: '#eff6ff',
                color: '#0284c7',
                border: '1px solid #bae6fd',
                padding: '2px 8px',
                borderRadius: '6px',
                fontSize: '10.5px',
                fontWeight: 700
              }}>
                Backdated Mode
              </span>
            </div>
            <p style={{ color: '#64748b', fontSize: '12px', margin: '4px 0 0 0' }}>
              Record a missed clinic visit from the past for an existing patient. The visit appears in previous history under its original date and will not appear in the upcoming queue.
            </p>
          </div>
        </div>

        {savedVisitResult && (
          <button
            onClick={handleResetForm}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              background: '#f8fafc',
              color: '#334155',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <RotateCcw size={14} /> Record Another Visit
          </button>
        )}
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div style={{
          background: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '12px',
          padding: '12px 16px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          color: '#b91c1c',
          fontSize: '12.5px',
          fontWeight: 600
        }}>
          <AlertCircle size={18} color="#dc2626" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* MAIN CONTAINER */}
      {!savedVisitResult ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* STEP 1: PATIENT SEARCH & SELECTION */}
          <div style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '16px',
            padding: '22px',
            boxShadow: '0 1px 4px rgba(0,0,0,0.02)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  background: '#0284c7',
                  color: '#ffffff',
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  fontWeight: 800
                }}>1</span>
                <h2 style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  Select Existing Registered Patient
                </h2>
              </div>
              <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>
                * Reback visits must attach to an already registered patient
              </span>
            </div>

            {!selectedPatient ? (
              <div ref={searchContainerRef} style={{ position: 'relative', width: '100%' }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  borderRadius: '10px',
                  padding: '10px 14px',
                  gap: '10px'
                }}>
                  <Search size={16} color="#64748b" />
                  <input
                    type="text"
                    placeholder="Search patient by Phone Number, Name, or Registration ID (e.g. SPH-KPB-0123)..."
                    value={searchQuery}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSearchQuery(val);
                      setShowSearchResults(true);
                      if (val.trim().length >= 3) {
                        handleLivePatientSearch(val);
                      }
                    }}
                    onFocus={() => setShowSearchResults(true)}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      outline: 'none',
                      width: '100%',
                      fontSize: '13px',
                      color: '#0f172a',
                      fontWeight: 600
                    }}
                  />
                  {searchQuery && (
                    <button
                      onClick={() => {
                        setSearchQuery('');
                        setShowSearchResults(false);
                      }}
                      style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
                    >
                      <X size={15} color="#94a3b8" />
                    </button>
                  )}
                </div>

                {/* Search Results Dropdown */}
                {showSearchResults && searchQuery.trim().length >= 2 && (
                  <div style={{
                    position: 'absolute',
                    top: '105%',
                    left: 0,
                    right: 0,
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '10px',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                    zIndex: 50,
                    maxHeight: '280px',
                    overflowY: 'auto'
                  }}>
                    {filteredPatients.length === 0 ? (
                      <div style={{ padding: '16px', textAlign: 'center', color: '#64748b', fontSize: '12px' }}>
                        {isSearching ? 'Searching database...' : `No registered patients found matching "${searchQuery}".`}
                      </div>
                    ) : (
                      filteredPatients.map(p => (
                        <div
                          key={p.id}
                          onClick={() => handleSelectPatient(p)}
                          style={{
                            padding: '12px 16px',
                            borderBottom: '1px solid #f1f5f9',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            cursor: 'pointer',
                            transition: 'background 0.15s ease'
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = '#ffffff')}
                        >
                          <div>
                            <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '13px' }}>
                              {p.name}
                            </div>
                            <div style={{ fontSize: '11px', color: '#64748b', display: 'flex', gap: '12px', marginTop: '2px' }}>
                              <span>📱 {p.phone || 'No phone'}</span>
                              <span>🏥 {p.branch}</span>
                            </div>
                          </div>
                          <span style={{
                            background: '#eff6ff',
                            color: '#0284c7',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            fontSize: '11px',
                            fontWeight: 700,
                            fontFamily: 'monospace'
                          }}>
                            {p.regId}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* Selected Patient Verified Card */
              <div style={{
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: '12px',
                padding: '16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ background: '#16a34a', color: '#ffffff', padding: '8px', borderRadius: '50%' }}>
                    <CheckCircle2 size={20} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>
                        {selectedPatient.name}
                      </span>
                      <span style={{ background: '#dcfce7', color: '#15803d', padding: '2px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 800 }}>
                        Verified Existing Profile
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '16px', fontSize: '11.5px', color: '#475569', marginTop: '4px', flexWrap: 'wrap' }}>
                      <span><b>Reg ID:</b> {selectedPatient.regId}</span>
                      <span><b>Phone:</b> {selectedPatient.phone || '-'}</span>
                      <span><b>Home Branch:</b> {selectedPatient.branch}</span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedPatient(null)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#475569',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Change Patient
                </button>
              </div>
            )}
          </div>

          {/* STEP 2: HISTORICAL VISIT DETAILS */}
          <div style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '16px',
            padding: '22px',
            boxShadow: '0 1px 4px rgba(0,0,0,0.02)',
            opacity: selectedPatient ? 1 : 0.65,
            pointerEvents: selectedPatient ? 'auto' : 'none'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <span style={{
                background: '#0284c7',
                color: '#ffffff',
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px',
                fontWeight: 800
              }}>2</span>
              <h2 style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                Enter Historical Visit Details
              </h2>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>

              {/* 1. Historical Visit Date (Cannot be in future) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#334155' }}>
                  Original Visit Date <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <div style={{ display: 'flex', alignItems: 'center', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '6px 10px', gap: '8px' }}>
                  <Calendar size={16} color="#0284c7" />
                  <input
                    type="date"
                    value={historicalDate}
                    max={getTodayYMD()}
                    onChange={(e) => setHistoricalDate(e.target.value)}
                    style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', fontSize: '12.5px', fontWeight: 700, color: '#0f172a' }}
                  />
                </div>
                <span style={{ fontSize: '10px', color: '#64748b' }}>
                  Select the actual past date the patient attended.
                </span>
              </div>

              {/* 2. Approximate Time / Shift */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#334155' }}>
                  Visit Time / Shift
                </label>
                <div style={{ display: 'flex', alignItems: 'center', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '6px 10px', gap: '8px' }}>
                  <Clock size={16} color="#64748b" />
                  <select
                    value={visitTime}
                    onChange={(e) => setVisitTime(e.target.value)}
                    style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', fontSize: '12.5px', fontWeight: 600, color: '#0f172a' }}
                  >
                    <option value="10:00 AM">Morning - 10:00 AM</option>
                    <option value="11:00 AM">Morning - 11:00 AM</option>
                    <option value="12:00 PM">Noon - 12:00 PM</option>
                    <option value="01:00 PM">Afternoon - 01:00 PM</option>
                    <option value="05:00 PM">Evening - 05:00 PM</option>
                    <option value="06:00 PM">Evening - 06:00 PM</option>
                    <option value="07:00 PM">Evening - 07:00 PM</option>
                    <option value="08:00 PM">Night - 08:00 PM</option>
                  </select>
                </div>
              </div>

              {/* 3. Branch Attended */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#334155' }}>
                  Branch Attended <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <div style={{ display: 'flex', alignItems: 'center', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '6px 10px', gap: '8px' }}>
                  <Building2 size={16} color="#64748b" />
                  <select
                    value={selectedBranch}
                    onChange={(e) => setSelectedBranch(e.target.value)}
                    style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', fontSize: '12.5px', fontWeight: 600, color: '#0f172a' }}
                  >
                    {CLINIC_BRANCHES.map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 4. Consulting Doctor Treated */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#334155' }}>
                  Consulting Doctor <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <div style={{ display: 'flex', alignItems: 'center', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '6px 10px', gap: '8px' }}>
                  <Stethoscope size={16} color="#64748b" />
                  <select
                    value={selectedDoctor}
                    onChange={(e) => setSelectedDoctor(e.target.value)}
                    style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', fontSize: '12.5px', fontWeight: 600, color: '#0f172a' }}
                  >
                    {DOCTOR_OPTIONS.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 5. Consultation Mode */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#334155' }}>
                  Consultation Mode
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {(['In-Clinic', 'Video'] as const).map(mode => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setConsultationMode(mode)}
                      style={{
                        flex: 1,
                        padding: '7px',
                        borderRadius: '8px',
                        border: consultationMode === mode ? '2px solid #0284c7' : '1px solid #cbd5e1',
                        background: consultationMode === mode ? '#eff6ff' : '#ffffff',
                        color: consultationMode === mode ? '#0284c7' : '#475569',
                        fontWeight: 700,
                        fontSize: '12px',
                        cursor: 'pointer'
                      }}
                    >
                      {mode === 'In-Clinic' ? '🏥 In-Clinic' : '📹 Video Call'}
                    </button>
                  ))}
                </div>
              </div>

              {/* 6. Chief Complaint / Visit Notes */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', gridColumn: 'span 2' }}>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#334155' }}>
                  Chief Complaints / Medical Notes (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Chronic acidity follow-up, allergic rhinitis consultation..."
                  value={visitNotes}
                  onChange={(e) => setVisitNotes(e.target.value)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '12px',
                    outline: 'none',
                    background: '#f8fafc'
                  }}
                />
              </div>

            </div>

            {/* CONFIRM BUTTON */}
            <div style={{ marginTop: '22px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={handleSaveRebackVisit}
                disabled={isSubmitting || !selectedPatient}
                style={{
                  padding: '11px 24px',
                  borderRadius: '10px',
                  border: 'none',
                  background: isSubmitting ? '#94a3b8' : 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                  color: '#ffffff',
                  fontWeight: 800,
                  fontSize: '13px',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: '0 2px 6px rgba(2, 132, 199, 0.3)'
                }}
              >
                {isSubmitting ? (
                  <>Saving Historical Visit...</>
                ) : (
                  <>Save Historical Visit & Proceed <ArrowRight size={16} /></>
                )}
              </button>
            </div>
          </div>

        </div>
      ) : (
        /* STEP 3 & 4: SUCCESS CONFIRMATION & DIRECT ACTIONS (PRESCRIPTION + PAYMENT) */
        <div style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
        }}>

          {/* Success Banner */}
          <div style={{
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            borderRadius: '12px',
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            marginBottom: '24px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ background: '#16a34a', color: '#ffffff', padding: '10px', borderRadius: '50%' }}>
                <CheckCircle2 size={24} />
              </div>
              <div>
                <h2 style={{ fontSize: '15px', fontWeight: 800, color: '#166534', margin: 0 }}>
                  Historical Visit Successfully Recorded!
                </h2>
                <p style={{ margin: '3px 0 0 0', fontSize: '12px', color: '#15803d' }}>
                  Saved under <b>{savedVisitResult.appointmentDate}</b> for <b>{savedVisitResult.patientName}</b> ({savedVisitResult.registrationId}).
                  It is marked as completed and will not appear in the upcoming queue.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              {onNavigate && (
                <button
                  type="button"
                  onClick={() => onNavigate('reception_patient_file', savedVisitResult)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '8px',
                    border: '1px solid #86efac',
                    background: '#ffffff',
                    color: '#166534',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <FileText size={14} /> Open Full Patient File
                </button>
              )}
            </div>
          </div>

          {/* Direct Action Cards Container */}
          <h3 style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '14px' }}>
            Direct Actions for this Historical Visit:
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>

            {/* ACTION CARD 1: DIRECT PRESCRIPTION OPTION */}
            <div style={{
              border: prescriptionSavedSuccess ? '1.5px solid #22c55e' : '1px solid #cbd5e1',
              borderRadius: '12px',
              padding: '18px',
              background: prescriptionSavedSuccess ? '#f0fdf4' : '#ffffff',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              boxShadow: '0 1px 4px rgba(0,0,0,0.02)'
            }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ background: '#e0f2fe', color: '#0284c7', padding: '8px', borderRadius: '8px' }}>
                      <FileText size={20} />
                    </div>
                    <span style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>
                      1. Prescription Option
                    </span>
                  </div>
                  {prescriptionSavedSuccess && (
                    <span style={{ background: '#dcfce7', color: '#15803d', padding: '2px 8px', borderRadius: '6px', fontSize: '10.5px', fontWeight: 800 }}>
                      ✓ Recorded
                    </span>
                  )}
                </div>
                <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 14px 0', lineHeight: 1.5 }}>
                  Enter digital homeopathic medicines, dosage instructions, or attach prescription notes given during this historical visit.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowPrescriptionModal(true)}
                  style={{
                    flex: 1,
                    padding: '9px',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#0284c7',
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  <Plus size={14} /> {prescriptionSavedSuccess ? 'Edit Prescription' : 'Enter Prescription'}
                </button>
              </div>
            </div>

            {/* ACTION CARD 2: DIRECT PAYMENT OPTION (RECORD PAST COLLECTION) */}
            <div style={{
              border: paymentSavedSuccess ? '1.5px solid #22c55e' : '1px solid #cbd5e1',
              borderRadius: '12px',
              padding: '18px',
              background: paymentSavedSuccess ? '#f0fdf4' : '#ffffff',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              boxShadow: '0 1px 4px rgba(0,0,0,0.02)'
            }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ background: '#dcfce7', color: '#16a34a', padding: '8px', borderRadius: '8px' }}>
                      <CreditCard size={20} />
                    </div>
                    <span style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>
                      2. Collect Fee / Record Past Payment
                    </span>
                  </div>
                  {paymentSavedSuccess && (
                    <span style={{ background: '#dcfce7', color: '#15803d', padding: '2px 8px', borderRadius: '6px', fontSize: '10.5px', fontWeight: 800 }}>
                      ✓ Recorded
                    </span>
                  )}
                </div>
                <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 14px 0', lineHeight: 1.5 }}>
                  Record the fee already collected during that historical visit. This updates financial reports without initiating Razorpay or sending automated messages.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(true)}
                  style={{
                    flex: 1,
                    padding: '9px',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#16a34a',
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  <CreditCard size={14} /> {paymentSavedSuccess ? 'Update Collected Fee' : 'Collect Fee / Record Payment'}
                </button>
              </div>
            </div>

          </div>

        </div>
      )}

      {/* POPUP MODAL 1: ENTER PRESCRIPTION FOR REBACK VISIT */}
      {showPrescriptionModal && savedVisitResult && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          padding: '16px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '640px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            overflow: 'hidden'
          }}>
            {/* Modal Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  Enter Prescription for {savedVisitResult.patientName}
                </h3>
                <span style={{ fontSize: '11px', color: '#64748b' }}>
                  Visit Date: {savedVisitResult.appointmentDate} | Doctor: {savedVisitResult.doctorName}
                </span>
              </div>
              <button
                onClick={() => setShowPrescriptionModal(false)}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>

              {/* Medicines List */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>
                    Prescribed Medicines & Dilutions:
                  </label>
                  <button
                    type="button"
                    onClick={() => setPrescriptionMedicines(prev => [...prev, { name: '', dosage: 'M - - N (Morning & Night)', duration: '15 Days' }])}
                    style={{
                      border: 'none',
                      background: '#eff6ff',
                      color: '#0284c7',
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '3px 8px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <Plus size={12} /> Add Remedy
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {prescriptionMedicines.map((med, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input
                        type="text"
                        placeholder="e.g. Nux Vomica 200CH or Thuja 1M"
                        value={med.name}
                        onChange={(e) => {
                          const val = e.target.value;
                          setPrescriptionMedicines(prev => {
                            const copy = [...prev];
                            copy[idx].name = val;
                            return copy;
                          });
                        }}
                        style={{ flex: 2, padding: '7px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                      />
                      <input
                        type="text"
                        placeholder="Dosage: M - - N"
                        value={med.dosage}
                        onChange={(e) => {
                          const val = e.target.value;
                          setPrescriptionMedicines(prev => {
                            const copy = [...prev];
                            copy[idx].dosage = val;
                            return copy;
                          });
                        }}
                        style={{ flex: 1.5, padding: '7px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                      />
                      <input
                        type="text"
                        placeholder="Duration"
                        value={med.duration}
                        onChange={(e) => {
                          const val = e.target.value;
                          setPrescriptionMedicines(prev => {
                            const copy = [...prev];
                            copy[idx].duration = val;
                            return copy;
                          });
                        }}
                        style={{ flex: 1, padding: '7px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                      />
                      {prescriptionMedicines.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setPrescriptionMedicines(prev => prev.filter((_, i) => i !== idx))}
                          style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Clinical Prescription Notes */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>
                  Doctor's Clinical Notes / Dietary Advice:
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g. Take medicines with warm water before meals. Avoid coffee and raw onion during treatment."
                  value={prescriptionNotes}
                  onChange={(e) => setPrescriptionNotes(e.target.value)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '12px',
                    outline: 'none',
                    resize: 'vertical'
                  }}
                />
              </div>

            </div>

            {/* Modal Footer */}
            <div style={{ padding: '14px 20px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setShowPrescriptionModal(false)}
                style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#ffffff', color: '#475569', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveDirectPrescription}
                disabled={isSavingPrescription}
                style={{
                  padding: '8px 20px',
                  borderRadius: '8px',
                  border: 'none',
                  background: isSavingPrescription ? '#94a3b8' : '#0284c7',
                  color: '#ffffff',
                  fontSize: '12px',
                  fontWeight: 800,
                  cursor: isSavingPrescription ? 'not-allowed' : 'pointer'
                }}
              >
                {isSavingPrescription ? 'Saving Prescription...' : 'Save Prescription for this Visit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POPUP MODAL 2: RECORD PAST PAYMENT (NO RAZORPAY, NO SMS/WHATSAPP) */}
      {showPaymentModal && savedVisitResult && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          padding: '16px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '560px',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            overflow: 'hidden'
          }}>
            {/* Modal Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  Record Already-Collected Payment
                </h3>
                <span style={{ fontSize: '11px', color: '#64748b' }}>
                  Patient: {savedVisitResult.patientName} | Historical Visit: {savedVisitResult.appointmentDate}
                </span>
              </div>
              <button
                onClick={() => setShowPaymentModal(false)}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

              {/* Informational Notice */}
              <div style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '10px 14px',
                fontSize: '11.5px',
                color: '#475569',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <ShieldCheck size={18} color="#16a34a" />
                <span>
                  This records previously collected revenue for clinic audit. <b>No Razorpay gateway is triggered</b> and <b>no automated messages are sent</b>.
                </span>
              </div>

              {/* Amount Previously Collected */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>
                  Amount Previously Collected (₹) <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <div style={{ display: 'flex', alignItems: 'center', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '6px 12px', gap: '8px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>₹</span>
                  <input
                    type="number"
                    min="0"
                    step="50"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(Math.max(0, Number(e.target.value)))}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      outline: 'none',
                      fontSize: '16px',
                      fontWeight: 800,
                      color: '#0f172a',
                      width: '100%'
                    }}
                  />
                </div>
              </div>

              {/* Payment Mode Selection */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>
                  Payment Method Collected Through:
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  {(['cash', 'upi', 'card'] as const).map(mode => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setPaymentMethod(mode)}
                      style={{
                        padding: '10px',
                        borderRadius: '8px',
                        border: paymentMethod === mode ? '2px solid #16a34a' : '1px solid #cbd5e1',
                        background: paymentMethod === mode ? '#f0fdf4' : '#ffffff',
                        color: paymentMethod === mode ? '#166534' : '#475569',
                        fontWeight: 800,
                        fontSize: '12px',
                        cursor: 'pointer',
                        textTransform: 'uppercase'
                      }}
                    >
                      {mode === 'cash' ? '💵 Cash' : mode === 'upi' ? '📱 UPI / GPay' : '💳 Card'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Revenue Split Type */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>
                  Revenue Split:
                </label>
                <select
                  value={paymentSplitType}
                  onChange={(e) => setPaymentSplitType(e.target.value)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '12px',
                    background: '#f8fafc',
                    color: '#0f172a',
                    fontWeight: 600
                  }}
                >
                  <option value="Consultation">Consultation Fee Only</option>
                  <option value="Consultation & Medicine Fee">Consultation & Medicine Fee</option>
                  <option value="Package">Healthcare Package</option>
                  <option value="Diet Plan">Diet / Nutrition Plan</option>
                </select>
              </div>

              {/* Collection Note */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>
                  Audit Reference / Note (Optional):
                </label>
                <input
                  type="text"
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '12px',
                    background: '#f8fafc'
                  }}
                />
              </div>

            </div>

            {/* Modal Footer */}
            <div style={{ padding: '14px 20px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setShowPaymentModal(false)}
                style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#ffffff', color: '#475569', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveDirectPayment}
                disabled={isSavingPayment}
                style={{
                  padding: '8px 20px',
                  borderRadius: '8px',
                  border: 'none',
                  background: isSavingPayment ? '#94a3b8' : '#16a34a',
                  color: '#ffffff',
                  fontSize: '12px',
                  fontWeight: 800,
                  cursor: isSavingPayment ? 'not-allowed' : 'pointer'
                }}
              >
                {isSavingPayment ? 'Saving Record...' : 'Confirm & Save Historical Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default RebackAppointmentPage;
