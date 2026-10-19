import React, { useState, useEffect, useRef } from 'react';
import {
  Users,
  MapPin,
  Stethoscope,
  Check,
  CheckCircle2,
  Clock,
  Calendar,
  UserCheck,
  X,
  Plus,
  Trash2,
  Save,
  FileText,
  Activity,
  Apple,
  FolderPlus,
  UploadCloud
} from 'lucide-react';
import { db } from '@app/shared';
import { collection, onSnapshot, updateDoc, doc, addDoc, query, limit, orderBy } from 'firebase/firestore';
import { PatientFileUI } from '../../../components/PatientFileUI';
import { receptionDataStore } from '../../../utils/receptionDataStore';

interface DoctorDashboardPageProps {
  doctorCategory?: string;
  doctorName?: string;
  onNavigateTab?: (tab: string, data?: any) => void;
}
interface MedicineItem {
  medicineName: string;
  medicineType?: string;
  dosage: string;
  frequency: string;
  timing: string;
  duration: string;
}
export const DOCTOR_MEDICINE_TYPES = [
  'Pills',
  'Tablet',
  'Syrup',
  'Powder',
  'Drops',
  'Mother Tincture',
  'Ointment',
  'Other'
]
export const DoctorDashboardPage: React.FC<DoctorDashboardPageProps> = ({
  doctorCategory = 'Head Doctor',
  doctorName = 'Dr. Prashanth K Vaidya',
  onNavigateTab,
}) => {
  const [selectedBranch, setSelectedBranch] = useState<string>('KPHB Branch');
  const [appointments, setAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeFilter, setActiveFilter] = useState<'all' | 'waiting' | 'completed'>('all');
  // Consultation Modal State
  const [activeConsultPatient, setActiveConsultPatient] = useState<any | null>(null);
  const [consultTab, setConsultTab] = useState<'clinical' | 'nutrition' | 'media'>('clinical');
  const [vitals, setVitals] = useState({ bp: '120/80', pulse: '72', temp: '98.6', weight: '68', spo2: '98' });
  const [chiefComplaints, setChiefComplaints] = useState('');
  const [medicalHistory, setMedicalHistory] = useState('');
  const [typedPrescriptions, setTypedPrescriptions] = useState<MedicineItem[]>([
    { medicineName: 'Allium Cepa 30C', medicineType: 'Pills', dosage: '4 pills', frequency: '1-0-1', timing: 'Before Food', duration: '15 Days' }
  ]);
  const [newMed, setNewMed] = useState<MedicineItem>({ medicineName: '', medicineType: 'Pills', dosage: '4 pills', frequency: '1-0-1', timing: 'Before Food', duration: '15 Days' });
  const [followUpInterval, setFollowUpInterval] = useState('15 Days');
  const [followUpDate, setFollowUpDate] = useState('');
  const [consultationFee, setConsultationFee] = useState<number>(500);
  const [medicineFeeRequested, setMedicineFeeRequested] = useState<number>(1200);
  const [dietNotes, setDietNotes] = useState('Homeopathic Diet: Avoid camphor, raw onion/garlic 30 mins before/after remedy.');
  const [selectedDietTemplate, setSelectedDietTemplate] = useState('General Homeopathy Diet');
  const [selectedMediaFolders, setSelectedMediaFolders] = useState<string[]>(['Patient Awareness Guide']);
  const [submitting, setSubmitting] = useState(false);
  const [successToast, setSuccessToast] = useState('');
  // Freehand Canvas State
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [canvasHasContent, setCanvasHasContent] = useState(false);

  const todayStr = new Date().toISOString().split('T')[0];
  const formattedToday = new Date().toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const getTodayISO = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const isTodayDate = (a: any) => {
    const todayISO = getTodayISO();
    const rawDate = a.appointmentDate || a.date || a.bookingDate || a.dateString || a.slotDate;
    if (!rawDate) {
      if (a.createdAt) {
        return String(a.createdAt).startsWith(todayISO);
      }
      return false;
    }
    const clean = String(rawDate).trim();
    if (!clean) return false;

    if (clean === todayISO || clean.startsWith(todayISO)) return true;

    // DD-MM-YYYY, DD/MM/YYYY, D/M/YYYY
    const partsISO = todayISO.split('-'); // [YYYY, MM, DD]
    if (partsISO.length === 3) {
      const [y, m, d] = partsISO;
      const ddmmyyyyHyphen = `${d}-${m}-${y}`;
      const ddmmyyyySlash = `${d}/${m}/${y}`;
      const dmySlash = `${parseInt(d, 10)}/${parseInt(m, 10)}/${y}`;
      const dmyHyphen = `${parseInt(d, 10)}-${parseInt(m, 10)}-${y}`;
      if (clean === ddmmyyyyHyphen || clean === ddmmyyyySlash || clean === dmySlash || clean === dmyHyphen) return true;
    }

    return false;
  };

  const isActualAppointment = (item: any, colName: string) => {
    if (colName === 'appointments') return true;
    const hasApptDate = Boolean(item.appointmentDate || item.date || item.slotDate);
    const hasApptStatus = Boolean(item.status && item.status !== 'registered');
    const hasDoctor = Boolean(item.doctorName || item.doctor || item.doctor_name);
    const hasQueueOrder = typeof item.queueOrder === 'number';
    return hasApptDate || hasApptStatus || hasDoctor || hasQueueOrder;
  };

  const isWaitingOrActiveStatus = (st: string) => {
    const s = (st || '').toLowerCase();
    return s === 'waiting' || s === 'booked' || s === 'scheduled' || s === 'active' || s === 'in_consultation' || s === 'in-consultation' || s === 'in consult';
  };

  // Ultra-fast zero-delay sync using cached receptionDataStore
  useEffect(() => {
    receptionDataStore.startListeners();

    const filterTodayDoctorApps = (list: any[]) => {
      const activeDocClean = (doctorName || '').toLowerCase().replace(/^dr\.\s*/i, '').replace(/^dr\s*/i, '').replace(/[^a-z0-9]/g, '').trim();
      const uniqueMap = new Map<string, any>();

      for (const item of list) {
        if (!item) continue;
        const statusStr = (item.status || '').toLowerCase();
        if (statusStr === 'cancelled' || statusStr === 'rejected') continue;
        if (!isActualAppointment(item, item.collectionName || 'appointments')) continue;
        // Strictly filter to TODAY'S consultations only
        if (!isTodayDate(item)) continue;

        const docName = String(item.doctorName || item.doctor || '').toLowerCase().replace(/^dr\.\s*/i, '').replace(/^dr\s*/i, '').replace(/[^a-z0-9]/g, '').trim();
        const docMatch =
          !docName ||
          docName === 'unassigned' ||
          docName.includes(activeDocClean) ||
          activeDocClean.includes(docName) ||
          docName.includes('spiritual') ||
          docName.includes('head') ||
          (docName.length >= 4 && activeDocClean.includes(docName.substring(0, 5)));

        if (docMatch) {
          const cleanPhone = String(item.phone || item.phoneNumber || '').replace(/\D/g, '').slice(-10);
          const cleanDate = String(item.appointmentDate || item.date || item.slotDate || item.dateString || '').trim();
          const cleanTime = String(item.appointmentTime || item.time || item.timeSlot || '').trim().toLowerCase();
          const cleanName = String(item.patientName || item.name || '').trim().toLowerCase();
          const cleanReg = String(item.registrationId || item.regId || '').trim().toLowerCase();

          const dedupKey = (cleanPhone && cleanDate && cleanTime)
            ? `${cleanPhone}_${cleanDate}_${cleanTime}`
            : (cleanReg && cleanDate)
              ? `${cleanReg}_${cleanDate}`
              : (cleanPhone && cleanName)
                ? `${cleanPhone}_${cleanName}`
                : (item.id || `${cleanPhone}_${cleanName}`);

          if (!uniqueMap.has(dedupKey)) {
            uniqueMap.set(dedupKey, item);
          } else {
            const existing = uniqueMap.get(dedupKey);
            uniqueMap.set(dedupKey, {
              ...item,
              ...existing,
              displayStatus: (existing.displayStatus && existing.displayStatus !== 'waiting') ? existing.displayStatus : (item.displayStatus || 'waiting')
            });
          }
        }
      }

      const resList = Array.from(uniqueMap.values());
      resList.sort((a, b) => {
        const timeA = a.appointmentTime || a.time || '00:00';
        const timeB = b.appointmentTime || b.time || '00:00';
        const strA = String(timeA).toLowerCase();
        const strB = String(timeB).toLowerCase();
        return strB.localeCompare(strA);
      });

      setAppointments(resList);
      setLoading(false);
    };

    // Instant zero-delay load from cached store
    const initialPool = receptionDataStore.getAppointments();
    if (initialPool && initialPool.length > 0) {
      filterTodayDoctorApps(initialPool);
    }

    const unsub = receptionDataStore.subscribe((state) => {
      filterTodayDoctorApps(state.appointments);
    });

    return () => unsub();
  }, [doctorName, todayStr]);

  // Set auto follow-up date based on interval picker
  useEffect(() => {
    const today = new Date();
    if (followUpInterval === '15 Days') {
      today.setDate(today.getDate() + 15);
      setFollowUpDate(today.toISOString().split('T')[0]);
    } else if (followUpInterval === '1 Month') {
      today.setMonth(today.getMonth() + 1);
      setFollowUpDate(today.toISOString().split('T')[0]);
    } else if (followUpInterval === '2 Months') {
      today.setMonth(today.getMonth() + 2);
      setFollowUpDate(today.toISOString().split('T')[0]);
    }
  }, [followUpInterval]);

  const handleUpdateStatus = async (appId: string, collectionName: string | undefined, newStatus: string) => {
    try {
      setAppointments((prev) =>
        prev.map((a) => (a.id === appId || a.docId === appId ? { ...a, displayStatus: newStatus.toLowerCase() } : a))
      );
      receptionDataStore.updateLocalAppointment(appId, { status: newStatus, displayStatus: newStatus.toLowerCase() });

      const payload = { status: newStatus, updatedAt: new Date().toISOString() };
      const targetCol = collectionName || 'appointments';
      await Promise.allSettled([
        updateDoc(doc(db, targetCol, appId), payload),
        updateDoc(doc(db, 'appointments', appId), payload),
        updateDoc(doc(db, 'allpatients', appId), payload),
        updateDoc(doc(db, 'patients', appId), payload)
      ]);
    } catch (err) {
      console.error('Error updating status on web:', err);
    }
  };

  const handleStartConsultation = (patient: any) => {
    handleUpdateStatus(patient.id, patient.collectionName, 'in_consultation');

    // Rule 6: Fee Auto-Zero Rule if follow-up or active package
    const isFollowUp = patient.isFollowUp || patient.type === 'Follow-up' || patient.hasActivePackage;
    setConsultationFee(isFollowUp ? 0 : 500);

    setChiefComplaints(patient.diseases || patient.subject || '');
    setMedicalHistory(patient.medicalHistory || 'No known allergies.');

    if (onNavigateTab) {
      onNavigateTab('patient_file', patient);
    } else {
      setActiveConsultPatient(patient);
      setConsultTab('clinical');
    }
  };

  const handleAddMedicine = () => {
    if (!newMed.medicineName.trim()) return;
    setTypedPrescriptions([...typedPrescriptions, newMed]);
    setNewMed({ medicineName: '', dosage: '4 pills', frequency: '1-0-1', timing: 'Before Food', duration: '15 Days' });
  };

  const handleRemoveMedicine = (idx: number) => {
    setTypedPrescriptions(typedPrescriptions.filter((_, i) => i !== idx));
  };

  // Canvas Handlers
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    setIsDrawing(true);
    const rect = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.strokeStyle = '#258ec8';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.stroke();
    setCanvasHasContent(true);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setCanvasHasContent(false);
  };

  const handleSubmitConsultation = async (consultData?: any) => {
    if (!activeConsultPatient) return;

    const patientId = activeConsultPatient.patientId || activeConsultPatient.id || 'PAT-' + Date.now();
    const patName = activeConsultPatient.patientName || activeConsultPatient.name || 'Patient';
    const patPhone = activeConsultPatient.phone || activeConsultPatient.phoneNumber || '';
    const patBranch = activeConsultPatient.branch || 'KPHB Branch';
    const appId = activeConsultPatient.id;
    const targetCol = activeConsultPatient.collectionName || 'appointments';

    let canvasUrl = '';
    if (canvasRef.current && canvasHasContent) {
      try {
        canvasUrl = canvasRef.current.toDataURL('image/png');
      } catch (e) { }
    }

    // 1. Calculate fees
    const mFee = Number(consultData?.pharmacyFee || consultData?.medicineFee || medicineFeeRequested) || 0;
    const cFee = mFee > 0 ? 0 : (Number(consultData?.consultationFee || consultationFee) || 0);
    const targetVal = Number(consultData?.targetAmount) || (mFee > 0 ? mFee : (Number(consultData?.consultationFee || consultationFee) || 500));

    const feePayload = {
      status: 'collect_fee',
      feeCollectionNeeded: true,
      paymentStatus: 'pending',
      consultationFee: cFee,
      medicineFee: mFee,
      pharmacyFee: mFee,
      medicineFeeRequested: mFee,
      targetAmount: targetVal,
      target_amount: targetVal,
      updatedAt: new Date().toISOString()
    };

    // 2. INSTANT UI UPDATE (0ms Delay)
    if (appId) {
      receptionDataStore.updateLocalAppointment(appId, feePayload);
      setAppointments((prev) =>
        prev.map((a) => (a.id === appId || a.docId === appId ? { ...a, displayStatus: 'collect_fee', ...feePayload } : a))
      );
    }

    // Close consultation modal & show confirmation toast immediately!
    setActiveConsultPatient(null);
    setSubmitting(false);
    setSuccessToast(`Prescription for ${patName} submitted successfully! Sent to Reception counter.`);
    setTimeout(() => {
      setSuccessToast('');
    }, 3000);

    // 3. BACKGROUND ASYNC FIRESTORE PERSISTENCE (Parallel writes)
    (async () => {
      try {
        const bgPromises: Promise<any>[] = [];

        // Update appointment collections
        const colsToUpdate = Array.from(new Set([targetCol, 'appointments', 'allpatients', 'patients']));
        for (const col of colsToUpdate) {
          bgPromises.push(updateDoc(doc(db, col, appId), feePayload).catch(() => { }));
        }

        // Create record in medicine_requests
        bgPromises.push(
          addDoc(collection(db, 'medicine_requests'), {
            appointmentId: appId,
            patientId,
            patientName: patName,
            phone: patPhone,
            doctorName: doctorName,
            branch: patBranch,
            items: typedPrescriptions,
            totalMedicineFee: mFee,
            consultationFee: cFee,
            canvasPrescriptionUrl: canvasUrl || `prescriptions/${patientId}_${Date.now()}_canvas.png`,
            status: 'pending_dispense',
            createdAt: new Date().toISOString()
          }).catch(() => { })
        );

        // Create record in followups if scheduled
        if (followUpDate) {
          const genuineReg = activeConsultPatient.registrationId || activeConsultPatient.regId || activeConsultPatient.uhid || '';
          bgPromises.push(
            addDoc(collection(db, 'followups'), {
              patientId,
              regId: genuineReg,
              registrationId: genuineReg,
              patientName: patName,
              phone: patPhone,
              doctorName,
              branch: patBranch,
              scheduledDate: followUpDate,
              interval: followUpInterval,
              status: 'scheduled',
              notes: chiefComplaints,
              createdAt: new Date().toISOString()
            }).catch(() => { })
          );
        }

        await Promise.allSettled(bgPromises);
      } catch (err) {
        console.error('Background consultation persistence notice:', err);
      }
    })();
  };

  const displayedList = appointments.filter((a) => {
    if (activeFilter === 'waiting') return isWaitingOrActiveStatus(a.displayStatus);
    if (activeFilter === 'completed') return !isWaitingOrActiveStatus(a.displayStatus);
    return true;
  });

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px', fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* Top Success Toast */}
      {successToast && (
        <div style={{ background: '#10b981', color: '#ffffff', padding: '14px 20px', borderRadius: '10px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '10px', boxShadow: '0 4px 12px rgba(16,185,129,0.3)' }}>
          <CheckCircle2 size={20} />
          <span>{successToast}</span>
        </div>
      )}

      {/* Top Banner Card: Doctor Info */}
      <div style={{
        backgroundColor: '#ffffff',
        borderRadius: '16px',
        border: '1px solid #e2e8f0',
        padding: '20px 24px',
        boxShadow: '0 2px 8px rgba(15, 23, 42, 0.03)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#258ec8', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: 800 }}>
            {(doctorName || 'D').replace(/^Dr\.\s*/i, '').charAt(0)}
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>{doctorName}</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
              <span style={{ backgroundColor: '#f1f5f9', color: '#475569', fontSize: '0.78rem', fontWeight: 700, padding: '2px 8px', borderRadius: '6px' }}>
                {doctorCategory}
              </span>
              <span style={{ fontSize: '0.82rem', color: '#64748b', fontWeight: 600 }}>
                📅 {formattedToday}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 3 Metric Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '18px' }}>
        <div
          onClick={() => setActiveFilter('all')}
          style={{
            background: activeFilter === 'all' ? '#f0f9ff' : '#ffffff',
            borderRadius: '16px',
            padding: '20px',
            border: activeFilter === 'all' ? '2px solid #258ec8' : '1px solid #e2e8f0',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(15, 23, 42, 0.03)'
          }}
        >
          <div style={{ color: '#64748b', fontSize: '13px', fontWeight: 700 }}>Today's Total Patients</div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#0f172a', marginTop: '6px' }}>{appointments.length}</div>
        </div>

        <div
          onClick={() => setActiveFilter('waiting')}
          style={{
            background: activeFilter === 'waiting' ? '#fffbeb' : '#ffffff',
            borderRadius: '16px',
            padding: '20px',
            border: activeFilter === 'waiting' ? '2px solid #f59e0b' : '1px solid #e2e8f0',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(15, 23, 42, 0.03)'
          }}
        >
          <div style={{ color: '#b45309', fontSize: '13px', fontWeight: 700 }}>Waiting / In Consult</div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#d97706', marginTop: '6px' }}>
            {appointments.filter(a => isWaitingOrActiveStatus(a.displayStatus)).length}
          </div>
        </div>

        <div
          onClick={() => setActiveFilter('completed')}
          style={{
            background: activeFilter === 'completed' ? '#f0fdf4' : '#ffffff',
            borderRadius: '16px',
            padding: '20px',
            border: activeFilter === 'completed' ? '2px solid #16a34a' : '1px solid #e2e8f0',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(15, 23, 42, 0.03)'
          }}
        >
          <div style={{ color: '#15803d', fontSize: '13px', fontWeight: 700 }}>Completed Consultations</div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: '#16a34a', marginTop: '6px' }}>
            {appointments.filter(a => !isWaitingOrActiveStatus(a.displayStatus)).length}
          </div>
        </div>
      </div>

      {/* Main Queue Section */}
      <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '24px', boxShadow: '0 2px 8px rgba(15, 23, 42, 0.03)' }}>
        <h3 style={{ fontSize: '17px', fontWeight: 800, color: '#0f172a', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <UserCheck size={20} color="#258ec8" /> Today's Consultation Queue
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {loading ? (
            <div style={{ padding: '20px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
              Syncing with Reception Queue...
            </div>
          ) : displayedList.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '13px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <UserCheck size={32} color="#cbd5e1" />
              <span>No patient queue today.</span>
            </div>
          ) : (
            displayedList.map((item, index) => {
              const isDone = item.displayStatus === 'completed' || item.displayStatus === 'done' || item.displayStatus === 'collect_fee';
              const isInConsult = item.displayStatus === 'in_consultation' || item.displayStatus === 'in consult' || item.displayStatus === 'in-consultation';

              return (
                <div
                  key={item.id}
                  style={{
                    padding: '16px',
                    borderRadius: '14px',
                    border: isInConsult ? '2px solid #258ec8' : '1px solid #e2e8f0',
                    background: isInConsult ? '#f0f9ff' : '#ffffff',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '12px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '18px', background: '#e0f2fe', color: '#258ec8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '12px' }}>
                      {(item.patientName || item.name || 'P').substring(0, 2).toUpperCase()}
                    </div>

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>
                          {item.patientName || item.name}
                        </span>
                        <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
                          Reg ID: <strong style={{ color: '#258ec8' }}>{item.registrationId || item.regId || `REG-${index + 1001}`}</strong> • +91 {item.phone || item.phoneNumber || 'N/A'}
                        </span>
                      </div>
                      {(item.diseases || item.subject) && (
                        <div style={{ marginTop: '6px', background: '#f8fafc', padding: '6px 10px', borderRadius: '6px', border: '1px solid #f1f5f9', fontSize: '11.5px', color: '#475569' }}>
                          Complaints: {item.diseases || item.subject}
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontSize: '10px',
                      fontWeight: 800,
                      background: isDone ? '#dcfce7' : isInConsult ? '#e0f2fe' : '#fef3c7',
                      color: isDone ? '#166534' : isInConsult ? '#0284c7' : '#b45309'
                    }}>
                      {isDone ? 'DONE ✓' : isInConsult ? 'IN CONSULT' : 'WAITING'}
                    </span>

                    {!isDone && (
                      <button
                        type="button"
                        onClick={() => handleStartConsultation(item)}
                        style={{
                          background: isInConsult ? '#16a34a' : '#258ec8',
                          color: '#ffffff',
                          border: 'none',
                          padding: '7px 14px',
                          borderRadius: '8px',
                          fontSize: '12px',
                          fontWeight: 800,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        <Stethoscope size={16} />
                        {isInConsult ? 'Resume Consultation' : 'Start Consultation'}
                      </button>
                    )}

                    {isDone && (
                      <div style={{ background: '#f0fdf4', padding: '5px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, color: '#16a34a' }}>
                        Consultation Finished ✓
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* DOCTOR CONSULTATION / PATIENT FILE UI MODAL */}
      {activeConsultPatient && (
        <PatientFileUI
          patient={activeConsultPatient}
          doctorName={doctorName}
          isDoctor={true}
          onClose={() => setActiveConsultPatient(null)}
          onSubmitConsultation={async (data) => {
            await handleSubmitConsultation(data);
          }}
        />
      )}

    </div>
  );
};
