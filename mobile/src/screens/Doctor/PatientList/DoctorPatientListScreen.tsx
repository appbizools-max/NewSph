import React, { useState, useEffect, useMemo, useCallback, memo, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TextInput,
  TouchableOpacity,
  Alert,
  Linking,
  ActivityIndicator,
  Platform,
  Image,
  Modal,
  Dimensions,
  ScrollView,
} from 'react-native';
import { Feather, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { sanitizeDoctorName } from '@app/shared';
import { receptionDataStore } from '../../../utils/receptionDataStore';
import { getPatientVisitState } from '../../../utils/patientVisitState';
import { getSafeDb, collection, query, where, getDocs, limit } from '../../../utils/firebaseSafe';

export interface DoctorPatientRecord {
  id: string;
  realDocId: string;
  name: string;
  phone: string;
  cleanPhone: string;
  age?: number | string;
  gender?: string;
  branchName: string;
  appointmentDate: string; // YYYY-MM-DD
  appointmentTime?: string;
  doctorName: string;
  status: string;
  regId: string;
  chiefComplaint?: string;
  diagnosisNotes?: string;
  amountPaid: number;
  paymentStatus: string;
  paymentMode?: string;
  uploadedImages: string[];
  medicines: Array<{
    name: string;
    dosage?: string;
    frequency?: string;
    duration?: string;
    instructions?: string;
  }>;
  visitCount: number;
  pastVisitsList: Array<{
    date: string;
    time?: string;
    branch?: string;
    doctor?: string;
    amount?: number;
    diagnosis?: string;
  }>;
  raw: any;
}

interface DoctorPatientListScreenProps {
  doctorName?: string;
  doctorCategory?: string;
  onNavigateTab?: (tab: string, patient?: any) => void;
}

// Format date to YYYY-MM-DD
const formatDateToISO = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// Normalize various date formats to YYYY-MM-DD
const normalizeDateToISO = (raw?: any): string => {
  if (!raw) return '';
  if (typeof raw === 'object') {
    if (typeof raw.toDate === 'function') {
      try {
        return formatDateToISO(raw.toDate());
      } catch {}
    }
    if (typeof raw.seconds === 'number') {
      try {
        return formatDateToISO(new Date(raw.seconds * 1000));
      } catch {}
    }
    if (raw instanceof Date) {
      return formatDateToISO(raw);
    }
  }
  const clean = String(raw).trim();
  if (clean.includes('T')) return clean.split('T')[0];
  if (clean.includes('/') || (clean.includes('-') && clean.split('-')[0].length <= 2)) {
    const parts = clean.split(/[\/\-]/);
    if (parts.length === 3) {
      let dd = parts[0].padStart(2, '0');
      let mm = parts[1].padStart(2, '0');
      let yyyy = parts[2];
      if (parts[0].length === 4) {
        yyyy = parts[0];
        mm = parts[1].padStart(2, '0');
        dd = parts[2].padStart(2, '0');
      }
      return `${yyyy}-${mm}-${dd}`;
    }
  }
  return clean;
};

// Clean doctor string for reliable matching
const normalizeDocString = (name?: string): string => {
  return String(name || '')
    .toLowerCase()
    .replace(/^dr\.\s*/i, '')
    .replace(/^dr\s*/i, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
};

const isDoctorMatch = (itemDoctor: string, currentDoctor: string, isHeadDoc: boolean): boolean => {
  const normCurrent = normalizeDocString(currentDoctor);
  if (!normCurrent) return true;
  const normItem = normalizeDocString(itemDoctor);
  if (!normItem) {
    return isHeadDoc;
  }
  if (normItem === normCurrent) return true;
  if (normItem.includes(normCurrent) || normCurrent.includes(normItem)) return true;
  if (normItem.length >= 4 && normCurrent.includes(normItem.substring(0, 5))) return true;
  if (normCurrent.length >= 4 && normItem.includes(normCurrent.substring(0, 5))) return true;
  return false;
};

// Resolve clean, genuine registration ID (e.g. SPH-KPB-0102), never a random 20-char docId
const resolvePatientRegId = (data: any, pool: any[]): string => {
  const rawReg = data.registrationId || data.registration_id || data.regId || data.regNo || data.patientId || data.uhid;
  if (rawReg && typeof rawReg === 'string') {
    const trimmed = rawReg.trim();
    if (trimmed.length > 0 && trimmed.length <= 18 && !/^[a-zA-Z0-9]{19,32}$/.test(trimmed)) {
      return trimmed.toUpperCase();
    }
  }

  const phone = String(data.phone || data.phoneNumber || data.mobile || data.contactNumber || '').replace(/\D/g, '').slice(-10);
  if (phone && phone.length === 10 && Array.isArray(pool)) {
    for (const item of pool) {
      if (!item) continue;
      const itemPhone = String(item.phone || item.phoneNumber || item.mobile || item.contactNumber || '').replace(/\D/g, '').slice(-10);
      if (itemPhone === phone) {
        const itemReg = item.registrationId || item.registration_id || item.regId || item.regNo || item.patientId || item.uhid;
        if (itemReg && typeof itemReg === 'string') {
          const t = itemReg.trim();
          if (t.length > 0 && t.length <= 18 && !/^[a-zA-Z0-9]{19,32}$/.test(t)) {
            return t.toUpperCase();
          }
        }
      }
    }
  }

  const b = String(data.branch || data.branchName || 'KPHB').toUpperCase();
  let code = 'KPB';
  if (b.includes('KPHB')) code = 'KPB';
  else if (b.includes('CHANDANAGAR') || b.includes('CHN')) code = 'CHN';
  else if (b.includes('NALLAGANDLA') || b.includes('NGL')) code = 'NGL';
  else if (b.includes('DILSHUKNAGAR') || b.includes('DIL') || b.includes('DSNR')) code = 'DIL';

  const seedNum = phone.length >= 4 ? phone.slice(-4) : '0001';
  return `SPH-${code}-${seedNum}`;
};

// Extract all uploaded images & prescription scans from all possible fields
const extractImagesFromDoc = (data: any): string[] => {
  const images: string[] = [];
  const add = (v: any) => {
    if (!v) return;
    if (Array.isArray(v)) {
      v.forEach(x => {
        if (typeof x === 'string' && x.trim()) images.push(x.trim());
        else if (x && typeof x === 'object') {
          const u = x.url || x.imageUrl || x.prescriptionUrl || x.fileUrl || x.uri || x.downloadURL;
          if (u && typeof u === 'string') images.push(u.trim());
        }
      });
    } else if (typeof v === 'string' && v.trim()) {
      images.push(v.trim());
    } else if (v && typeof v === 'object') {
      const u = v.url || v.imageUrl || v.prescriptionUrl || v.fileUrl || v.uri || v.downloadURL;
      if (u && typeof u === 'string') images.push(u.trim());
    }
  };

  add(data.uploadedPrescriptions);
  add(data.prescriptionUrls);
  add(data.prescriptionUrl);
  add(data.prescriptionImage);
  add(data.prescriptionImages);
  add(data.canvasPrescriptionUrl);
  add(data.canvasUrl);
  add(data.reports);
  add(data.images);
  add(data.documents);
  add(data.media);
  add(data.rxUrl);
  add(data.rxUrls);

  return Array.from(new Set(images.filter(Boolean)));
};

// Extract real amount paid and payment status
const extractAmountPaid = (data: any): { amount: number; status: string; mode: string } => {
  const rawPaid = data.totalPaid ?? data.paidAmount ?? data.amountPaid ?? data.targetAmount ?? data.amount;
  const consultFee = Number(data.consultationFee) || 0;
  const medFee = Number(data.medicineFee || data.totalMedicineFee) || 0;
  const total = Number(data.totalAmount) || Math.max(0, consultFee + medFee);

  let amount = 0;
  let status = 'pending';
  const mode = data.paymentMode || 'Cash / Direct';

  if (rawPaid !== undefined && rawPaid !== null && rawPaid !== '' && !isNaN(Number(rawPaid))) {
    amount = Number(rawPaid);
    status = amount > 0 ? 'paid' : (data.paymentStatus || 'pending');
  } else if (String(data.paymentStatus).toLowerCase() === 'paid') {
    amount = total > 0 ? total : 0;
    status = 'paid';
  } else if (total > 0) {
    amount = total;
    status = data.paymentStatus || 'pending';
  }
  return { amount, status, mode };
};

// Extract prescribed medicines list
const extractMedicinesFromDoc = (data: any): any[] => {
  const docMedicines = data.items || data.medicines || data.remedies || data.prescribedMedicines || data.prescriptionItems || data.medications || data.rx || data.typedPrescriptions || [];
  if (!Array.isArray(docMedicines)) return [];
  return docMedicines.map(m => {
    if (typeof m === 'string') return { name: m, dosage: '4 Pills', frequency: 'Twice Daily', duration: '7 Days' };
    return {
      name: m.name || m.medicineName || m.remedyName || 'Remedy',
      dosage: m.dosage || '4 Pills',
      frequency: m.frequency || 'Twice Daily',
      duration: m.duration || '7 Days',
      instructions: m.instructions || ''
    };
  });
};

// Count visits history across pool
const getPastVisitsForPatient = (phone: string, regId: string, currentId: string, pool: any[]): any[] => {
  if (!pool || pool.length === 0) return [];
  const cleanPhone = phone.replace(/\D/g, '').slice(-10);
  const cleanReg = (regId || '').toLowerCase().trim();
  const visits: any[] = [];
  const seenKeys = new Set<string>();

  pool.forEach(item => {
    if (!item) return;
    const itemId = item.id || item.docId || '';
    if (itemId && itemId === currentId) return;

    const itemPhone = String(item.phone || item.phoneNumber || item.mobile || item.contactNumber || '').replace(/\D/g, '').slice(-10);
    const itemReg = String(item.registrationId || item.regId || item.regNo || item.patientId || '').toLowerCase().trim();

    if ((cleanPhone && itemPhone === cleanPhone) || (cleanReg && itemReg === cleanReg)) {
      const d = String(item.appointmentDate || item.date || item.createdAt || '').split('T')[0];
      const t = item.appointmentTime || item.time || '';
      const key = `${d}_${t}`;
      if (seenKeys.has(key)) return;
      seenKeys.add(key);

      const paid = item.totalPaid ?? item.paidAmount ?? item.amountPaid ?? item.amount;
      visits.push({
        date: d,
        time: t || '10:00 AM',
        branch: item.branch || item.branchName || 'Clinic',
        doctor: item.doctorName || item.doctor || '',
        amount: Number(paid) || 0,
        diagnosis: item.diagnosisNotes || item.chiefComplaint || item.subject || item.diseases || ''
      });
    }
  });

  visits.sort((a, b) => b.date.localeCompare(a.date));
  return visits;
};

// Parse pool or appointments into DoctorPatientRecord list strictly for this doctor
const parseDoctorPatients = (
  pool: any[],
  currentDoctor: string,
  isHeadDoctor: boolean,
  todayStr: string
): DoctorPatientRecord[] => {
  const list: DoctorPatientRecord[] = [];
  const seenKeys = new Set<string>();

  (pool || []).forEach((data, idx) => {
    if (!data) return;

    const rawDocName = data.doctorName || data.doctor || data.doctor_name || '';
    if (!isDoctorMatch(rawDocName, currentDoctor, isHeadDoctor)) {
      return;
    }

    const cleanPhone = String(data.phoneNumber || data.phone || data.mobile || data.contactNumber || '').replace(/\D/g, '').slice(-10);
    const pName = String(data.patientName || data.name || data.fullName || 'Patient').trim();
    const cleanReg = resolvePatientRegId(data, pool);
    const rawDate = data.appointmentDate || data.date || data.createdAt || todayStr;
    const isoDate = normalizeDateToISO(rawDate);
    const rawTime = data.appointmentTime || data.time || data.timeSlot || '10:00 AM';
    const bName = data.branch || data.targetBranch || data.branchName || 'Clinic';

    const dedupKey = (cleanPhone && isoDate && rawTime)
      ? `${cleanPhone}_${isoDate}_${rawTime}`
      : (cleanReg && isoDate)
        ? `${cleanReg}_${isoDate}`
        : (data.id || data.docId || `${cleanPhone}_${pName}_${idx}`);

    if (seenKeys.has(dedupKey)) return;
    seenKeys.add(dedupKey);

    const complaint = data.chiefComplaint || data.subject || data.symptoms || data.diseases || data.reason || '';
    const diagnosis = data.diagnosisNotes || data.notes || data.prescriptionNotes || '';
    const images = extractImagesFromDoc(data);
    const medicines = extractMedicinesFromDoc(data);
    const { amount, status: payStatus, mode: payMode } = extractAmountPaid(data);
    const currentDocId = data.id || data.docId || dedupKey;
    const pastVisits = getPastVisitsForPatient(cleanPhone, cleanReg, currentDocId, pool);

    list.push({
      id: currentDocId,
      realDocId: data.id || data.docId || '',
      name: pName,
      phone: cleanPhone ? `+91 ${cleanPhone}` : (data.phone || 'N/A'),
      cleanPhone: cleanPhone,
      age: data.age || data.patientAge,
      gender: data.gender || 'Patient',
      branchName: bName,
      appointmentDate: isoDate,
      appointmentTime: rawTime,
      doctorName: sanitizeDoctorName(rawDocName, bName),
      status: String(data.status || data.displayStatus || 'waiting').toLowerCase(),
      regId: cleanReg,
      chiefComplaint: complaint || undefined,
      diagnosisNotes: diagnosis || undefined,
      amountPaid: amount,
      paymentStatus: payStatus,
      paymentMode: payMode,
      uploadedImages: images,
      medicines: medicines,
      visitCount: pastVisits.length + 1,
      pastVisitsList: pastVisits,
      raw: data,
    });
  });

  list.sort((a, b) => {
    const dateA = a.appointmentDate || '';
    const dateB = b.appointmentDate || '';
    return dateB.localeCompare(dateA);
  });

  return list;
};

// Memoized Patient Card Component with View Popup Trigger (Clean: Prescriptions strictly in Popup Modal)
const DoctorPatientCardItem = memo(({
  patient,
  onCall,
  onWhatsApp,
  onSelectPatient,
}: {
  patient: DoctorPatientRecord;
  onCall: (phone: string) => void;
  onWhatsApp: (phone: string, name: string) => void;
  onSelectPatient: (patient: DoctorPatientRecord) => void;
}) => {
  const visitState = useMemo(() => {
    try {
      const pool = receptionDataStore.getAllCollectionsPool();
      const pkgs = receptionDataStore.getPackageMembers();
      return getPatientVisitState(patient.raw || patient, pool, pkgs);
    } catch {
      return null;
    }
  }, [patient]);

  const hasPaid = patient.amountPaid > 0 || patient.paymentStatus === 'paid';

  return (
    <TouchableOpacity
      style={styles.patientCard}
      activeOpacity={0.9}
      onPress={() => onSelectPatient(patient)}
    >
      {/* 1. Header: Patient Name, ID, Age/Gender, Amount Badge */}
      <View style={styles.cardHeader}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Text style={styles.patientName} numberOfLines={1}>{patient.name}</Text>
            {visitState ? (
              <View style={[styles.visitBadge, { backgroundColor: visitState.badgeBg, borderColor: visitState.badgeBorder }]}>
                <Text style={[styles.visitBadgeText, { color: visitState.badgeColor }]}>
                  {visitState.badgeText}
                </Text>
              </View>
            ) : null}
            {visitState?.isApp ? (
              <View style={{ backgroundColor: '#f3e8ff', borderWidth: 1, borderColor: '#d8b4fe', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
                <Text style={{ fontSize: 9.5, fontWeight: '900', color: '#7e22ce' }}>APP</Text>
              </View>
            ) : null}
            {patient.visitCount > 1 ? (
              <View style={styles.historyBadge}>
                <Text style={styles.historyBadgeText}>⏱ {patient.visitCount} Visits</Text>
              </View>
            ) : null}
          </View>

          <Text style={styles.patientIdText}>
            ID: <Text style={{ color: '#0284c7', fontWeight: '800' }}>{patient.regId}</Text>
            {patient.age ? ` • ${patient.age} yrs` : ''}
            {patient.gender && patient.gender !== 'Patient' ? ` • ${patient.gender}` : ''}
          </Text>
        </View>

        {/* Amount Pill */}
        <View style={[styles.amountBadge, hasPaid ? styles.amountPaidBadge : styles.amountPendingBadge]}>
          <Text style={[styles.amountBadgeText, hasPaid ? styles.amountPaidText : styles.amountPendingText]}>
            {hasPaid ? `₹${patient.amountPaid || '500'} Paid ✓` : (patient.amountPaid ? `₹${patient.amountPaid} Due` : 'Fee Pending')}
          </Text>
        </View>
      </View>

      {/* 2. Visit Date & Branch Details Row */}
      <View style={styles.detailsRow}>
        <View style={styles.detailItemHighlight}>
          <Feather name="calendar" size={13} color="#0284c7" />
          <Text style={styles.detailTextHighlight}>
            Visit Date: <Text style={{ fontWeight: '800' }}>{patient.appointmentDate}</Text> ({patient.appointmentTime || '10:00 AM'})
          </Text>
        </View>

        <View style={styles.detailItem}>
          <Feather name="map-pin" size={13} color="#64748b" />
          <Text style={styles.detailText} numberOfLines={1}>{patient.branchName}</Text>
        </View>

        <View style={styles.detailItem}>
          <MaterialCommunityIcons name="stethoscope" size={13} color="#64748b" />
          <Text style={styles.detailText} numberOfLines={1}>{patient.doctorName}</Text>
        </View>
      </View>

      {/* 3. Consultation History & Complaint Box */}
      {(patient.chiefComplaint || patient.diagnosisNotes) ? (
        <View style={styles.complaintBox}>
          {patient.chiefComplaint ? (
            <Text style={styles.complaintText} numberOfLines={2}>
              <Text style={{ fontWeight: '700', color: '#334155' }}>Chief Complaint: </Text>
              {patient.chiefComplaint}
            </Text>
          ) : null}
          {patient.diagnosisNotes ? (
            <Text style={[styles.complaintText, { marginTop: patient.chiefComplaint ? 4 : 0 }]} numberOfLines={2}>
              <Text style={{ fontWeight: '700', color: '#0369a1' }}>Diagnosis History: </Text>
              {patient.diagnosisNotes}
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* 4. Action Row: Phone + Call + WhatsApp + VIEW DETAILS IN POPUP BUTTON (Prescriptions strictly inside Popup Modal) */}
      <View style={styles.actionRow}>
        <Text style={styles.phoneText}>📞 {patient.phone}</Text>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          {patient.cleanPhone ? (
            <>
              <TouchableOpacity
                style={styles.iconBtnCall}
                onPress={() => onCall(patient.cleanPhone)}
                activeOpacity={0.7}
              >
                <Feather name="phone" size={14} color="#0284c7" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.iconBtnWA}
                onPress={() => onWhatsApp(patient.cleanPhone, patient.name)}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons name="whatsapp" size={16} color="#16a34a" />
              </TouchableOpacity>
            </>
          ) : null}

          {/* VIEW IN POPUP BUTTON (Replaces Open Patient File) */}
          <TouchableOpacity
            style={styles.viewPopupBtn}
            onPress={() => onSelectPatient(patient)}
            activeOpacity={0.8}
          >
            <Feather name="eye" size={14} color="#ffffff" />
            <Text style={styles.viewPopupBtnText}>View Details & Rx</Text>
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
});

export const DoctorPatientListScreen: React.FC<DoctorPatientListScreenProps> = ({
  doctorName = 'Dr. Prashanth K Vaidya',
  doctorCategory = 'Head Doctor',
  onNavigateTab,
}) => {
  const isHeadDoctor = doctorCategory === 'Head Doctor' || doctorName.includes('Prashanth') || doctorName.includes('Rama');

  // Filters State (STATUS FILTER REMOVED!)
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilterMode, setDateFilterMode] = useState<'today' | 'yesterday' | 'all' | 'recent'>('today');

  // Popup Modal States
  const [selectedPatientModal, setSelectedPatientModal] = useState<DoctorPatientRecord | null>(null);
  const [previewImages, setPreviewImages] = useState<string[]>([]);
  const [previewImageIndex, setPreviewImageIndex] = useState<number>(0);
  const fullViewListRef = useRef<FlatList>(null);

  // Dates
  const now = new Date();
  const todayStr = formatDateToISO(now);
  const yesterdayDate = new Date(Date.now() - 86400000);
  const yesterdayStr = formatDateToISO(yesterdayDate);
  const thirtyDaysAgoDate = new Date(Date.now() - 30 * 86400000);
  const thirtyDaysAgoStr = formatDateToISO(thirtyDaysAgoDate);

  // Full-View Swap Navigation Handlers
  const openImageFullView = (images: string[], initialIdx: number = 0) => {
    if (!images || images.length === 0) return;
    setPreviewImages(images);
    setPreviewImageIndex(initialIdx);
  };

  const handleSwapPrev = () => {
    if (previewImageIndex > 0) {
      const nextIdx = previewImageIndex - 1;
      setPreviewImageIndex(nextIdx);
      try {
        fullViewListRef.current?.scrollToIndex({ index: nextIdx, animated: true });
      } catch {}
    }
  };

  const handleSwapNext = () => {
    if (previewImageIndex < previewImages.length - 1) {
      const nextIdx = previewImageIndex + 1;
      setPreviewImageIndex(nextIdx);
      try {
        fullViewListRef.current?.scrollToIndex({ index: nextIdx, animated: true });
      } catch {}
    }
  };

  // Initial instant load from receptionDataStore pool (0ms delay)
  const [patients, setPatients] = useState<DoctorPatientRecord[]>(() => {
    const cachedPool = receptionDataStore.getAllCollectionsPool();
    const poolToUse = cachedPool.length > 0 ? cachedPool : receptionDataStore.getAppointments();
    return parseDoctorPatients(poolToUse, doctorName, isHeadDoctor, todayStr);
  });

  // Dynamic Patient Counts for Period Filters (Today, Yesterday, All, Recent)
  const filterCounts = useMemo(() => {
    let today = 0;
    let yesterday = 0;
    let recent = 0;
    patients.forEach((p) => {
      const d = p.appointmentDate;
      if (d === todayStr) today++;
      if (d === yesterdayStr) yesterday++;
      if (d >= thirtyDaysAgoStr || p.status === 'waiting' || p.status === 'in_consultation') recent++;
    });
    return {
      today,
      yesterday,
      all: patients.length,
      recent,
    };
  }, [patients, todayStr, yesterdayStr, thirtyDaysAgoStr]);

  const [isLoading, setIsLoading] = useState(false);
  const [isSearchingLive, setIsSearchingLive] = useState(false);

  // Pagination (20 items per chunk)
  const PAGE_SIZE = 20;
  const [displayCount, setDisplayCount] = useState<number>(PAGE_SIZE);

  // Subscribe to receptionDataStore updates
  useEffect(() => {
    let isMounted = true;
    try {
      receptionDataStore.startListeners();
      const unsub = receptionDataStore.subscribe((state) => {
        if (!isMounted) return;
        const pool = state.allCollectionsPool.length > 0 ? state.allCollectionsPool : state.appointments;
        const list = parseDoctorPatients(pool, doctorName, isHeadDoctor, todayStr);
        setPatients(list);
        setIsLoading(false);
      });

      return () => {
        isMounted = false;
        unsub();
      };
    } catch {
      setIsLoading(false);
    }
  }, [doctorName, isHeadDoctor, todayStr]);

  // Live Firestore Search for older historical records matching this doctor across all branches
  useEffect(() => {
    const trimmed = searchTerm.trim();
    if (!trimmed || trimmed.length < 3) return;

    const timer = setTimeout(async () => {
      const activeDb = getSafeDb();
      if (!activeDb) return;

      const cleanDigits = trimmed.replace(/\D/g, '');
      const isPhoneSearch = cleanDigits.length >= 7;

      setIsSearchingLive(true);
      try {
        const queriesToRun: any[] = [];
        if (isPhoneSearch) {
          const tenDigit = cleanDigits.slice(-10);
          queriesToRun.push(
            getDocs(query(collection(activeDb, 'appointments'), where('phone', '==', tenDigit), limit(25))).catch(() => ({ docs: [] })),
            getDocs(query(collection(activeDb, 'allpatients'), where('phone', '==', tenDigit), limit(25))).catch(() => ({ docs: [] }))
          );
        } else {
          queriesToRun.push(
            getDocs(query(collection(activeDb, 'appointments'), where('registrationId', '==', trimmed), limit(25))).catch(() => ({ docs: [] })),
            getDocs(query(collection(activeDb, 'allpatients'), where('registrationId', '==', trimmed), limit(25))).catch(() => ({ docs: [] }))
          );
        }

        const results = await Promise.all(queriesToRun);
        const docs: any[] = [];
        results.forEach((snap: any) => {
          if (snap && snap.docs) {
            snap.docs.forEach((d: any) => docs.push({ id: d.id, ...d.data() }));
          }
        });

        if (docs.length > 0) {
          const newDoctorRecords = parseDoctorPatients(docs, doctorName, isHeadDoctor, todayStr);
          if (newDoctorRecords.length > 0) {
            setPatients(prev => {
              const existingIds = new Set(prev.map(p => p.id));
              const additions = newDoctorRecords.filter(p => !existingIds.has(p.id));
              return additions.length > 0 ? [...additions, ...prev] : prev;
            });
          }
        }
      } catch (err) {
        console.warn('Live doctor search notice:', err);
      } finally {
        setIsSearchingLive(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [searchTerm, doctorName, isHeadDoctor, todayStr]);

  // Filtering Engine (WITHOUT ANY STATUS RESTRICTION!)
  const filteredPatients = useMemo(() => {
    const isSearching = searchTerm.trim() !== '';
    const queryStr = searchTerm.toLowerCase().trim();
    const queryDigits = searchTerm.replace(/\D/g, '');

    return patients.filter((patient) => {
      // 1. Date Session Filtering (Applied when NOT actively searching across all dates)
      if (!isSearching) {
        const patientDate = patient.appointmentDate;
        if (dateFilterMode === 'today') {
          if (patientDate !== todayStr) return false;
        } else if (dateFilterMode === 'yesterday') {
          if (patientDate !== yesterdayStr) return false;
        } else if (dateFilterMode === 'recent') {
          if (patientDate < thirtyDaysAgoStr && patient.status !== 'waiting' && patient.status !== 'in_consultation') {
            return false;
          }
        }
      }

      // 2. Search Query Filtering
      if (isSearching) {
        const matchesName = (patient.name || '').toLowerCase().includes(queryStr);
        const pPhone = patient.cleanPhone || (patient.phone || '').replace(/\D/g, '');
        const matchesPhone = queryDigits.length > 0 && pPhone.includes(queryDigits);
        const matchesId = (patient.regId || patient.id || '').toLowerCase().includes(queryStr);
        const matchesComplaint = (patient.chiefComplaint || '').toLowerCase().includes(queryStr);
        const matchesDiag = (patient.diagnosisNotes || '').toLowerCase().includes(queryStr);
        if (!matchesName && !matchesPhone && !matchesId && !matchesComplaint && !matchesDiag) return false;
      }

      return true;
    });
  }, [patients, dateFilterMode, searchTerm, todayStr, yesterdayStr, thirtyDaysAgoStr]);

  // Reset pagination whenever filters or search terms change
  useEffect(() => {
    setDisplayCount(PAGE_SIZE);
  }, [searchTerm, dateFilterMode]);

  // Paginated/Chunked Patients for 60fps rendering
  const displayedPatients = useMemo(() => {
    return filteredPatients.slice(0, displayCount);
  }, [filteredPatients, displayCount]);

  const handleCall = useCallback((phone: string) => {
    if (!phone) return Alert.alert('No Phone', 'No phone number available for this patient.');
    Linking.openURL(`tel:${phone.replace(/\s+/g, '')}`).catch(() => Alert.alert('Error', 'Unable to initiate call.'));
  }, []);

  const handleWhatsApp = useCallback((phone: string, name: string) => {
    if (!phone) return Alert.alert('No Phone', 'No phone number available.');
    const clean = phone.replace(/\D/g, '').slice(-10);
    const msg = `Hello ${name}, this is regarding your consultation at Spiritual Homeopathy Clinic.`;
    Linking.openURL(`whatsapp://send?phone=91${clean}&text=${encodeURIComponent(msg)}`)
      .catch(() => Alert.alert('WhatsApp Error', 'Could not launch WhatsApp.'));
  }, []);

  return (
    <View style={styles.container}>
      <FlatList
        data={displayedPatients}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={Platform.OS === 'android'}
        onEndReached={() => {
          if (displayCount < filteredPatients.length) {
            setDisplayCount(prev => prev + PAGE_SIZE);
          }
        }}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={
          <View style={styles.headerWrapper}>
            {/* Title & Count Badge */}
            <View style={styles.titleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.screenTitle}>My Patients Directory</Text>
                <Text style={styles.screenSub}>
                  Patients treated by {doctorName} from all clinic branches
                </Text>
              </View>
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{filteredPatients.length} Patients</Text>
              </View>
            </View>

            {/* Filter Toolbar: Search + Period Filters */}
            <View style={styles.filterToolbar}>
              {/* Search Bar */}
              <View style={styles.searchBar}>
                <Feather name="search" size={17} color="#64748b" style={{ marginRight: 8 }} />
                <TextInput
                  style={styles.searchInputText}
                  placeholder="Search name, phone (+91), or UHID..."
                  placeholderTextColor="#94a3b8"
                  value={searchTerm}
                  onChangeText={setSearchTerm}
                />
                {isSearchingLive && (
                  <ActivityIndicator size="small" color="#0284c7" style={{ marginRight: 6 }} />
                )}
                {searchTerm.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchTerm('')}>
                    <Feather name="x" size={16} color="#94a3b8" />
                  </TouchableOpacity>
                )}
              </View>

              {/* Date Session Chips: Today, Yesterday, All Patients, Recent */}
              <View style={styles.dateFilterRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: 6 }}>
                  <Feather name="calendar" size={13} color="#64748b" />
                  <Text style={styles.filterLabel}>Period:</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', flex: 1 }}>
                  {([
                    { mode: 'today', label: `Today (${filterCounts.today})` },
                    { mode: 'yesterday', label: `Yesterday (${filterCounts.yesterday})` },
                    { mode: 'all', label: `All Patients (${filterCounts.all})` },
                    { mode: 'recent', label: `Recent (${filterCounts.recent})` },
                  ] as const).map(({ mode, label }) => {
                    const isActive = (dateFilterMode === mode) && !searchTerm;
                    return (
                      <TouchableOpacity
                        key={mode}
                        onPress={() => { setDateFilterMode(mode); setSearchTerm(''); }}
                        style={[styles.dateFilterBtn, isActive && styles.dateFilterBtnActive]}
                      >
                        <Text style={[styles.dateFilterBtnText, isActive && styles.dateFilterBtnTextActive]}>
                          {label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <DoctorPatientCardItem
            patient={item}
            onCall={handleCall}
            onWhatsApp={handleWhatsApp}
            onSelectPatient={(p) => setSelectedPatientModal(p)}
          />
        )}
        ListFooterComponent={
          displayCount < filteredPatients.length ? (
            <View style={{ paddingVertical: 16, alignItems: 'center' }}>
              <ActivityIndicator size="small" color="#0284c7" />
              <Text style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 4 }}>
                Loading more patients ({displayCount} of {filteredPatients.length})...
              </Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#0284c7" />
              <Text style={styles.loadingText}>Loading Patients...</Text>
            </View>
          ) : (
            <View style={styles.emptyCard}>
              <Ionicons name="people-outline" size={36} color="#94a3b8" style={{ marginBottom: 8 }} />
              <Text style={styles.emptyTitle}>No patients found</Text>
              <Text style={styles.emptySub}>
                {searchTerm
                  ? `No matching records found for "${searchTerm}".`
                  : `No patient consultations found for this period.`}
              </Text>
            </View>
          )
        }
      />

      {/* 1. Patient Details & Prescription Popup Modal */}
      <Modal
        visible={!!selectedPatientModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setSelectedPatientModal(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle} numberOfLines={1}>
                  {selectedPatientModal?.name}
                </Text>
                <Text style={styles.modalSubtitle}>
                  UHID: <Text style={{ color: '#0284c7', fontWeight: '800' }}>{selectedPatientModal?.regId}</Text>
                  {selectedPatientModal?.age ? ` • ${selectedPatientModal.age} yrs` : ''}
                  {selectedPatientModal?.gender ? ` • ${selectedPatientModal.gender}` : ''}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setSelectedPatientModal(null)}
              >
                <Ionicons name="close" size={22} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={styles.modalBody}>
              {/* Patient Basic Info Card */}
              <View style={styles.modalSectionCard}>
                <View style={styles.modalInfoRow}>
                  <View style={styles.modalInfoCol}>
                    <Text style={styles.modalLabel}>Consultation Date & Time</Text>
                    <Text style={styles.modalValueBold}>
                      📅 {selectedPatientModal?.appointmentDate} ({selectedPatientModal?.appointmentTime || '10:00 AM'})
                    </Text>
                  </View>
                  <View style={styles.modalInfoCol}>
                    <Text style={styles.modalLabel}>Clinic Branch</Text>
                    <Text style={styles.modalValueBold}>
                      📍 {selectedPatientModal?.branchName}
                    </Text>
                  </View>
                </View>

                <View style={[styles.modalInfoRow, { marginTop: 8 }]}>
                  <View style={styles.modalInfoCol}>
                    <Text style={styles.modalLabel}>Treating Doctor</Text>
                    <Text style={[styles.modalValueBold, { color: '#0284c7' }]}>
                      🩺 {selectedPatientModal?.doctorName}
                    </Text>
                  </View>
                  <View style={styles.modalInfoCol}>
                    <Text style={styles.modalLabel}>Phone Contact</Text>
                    <Text style={styles.modalValueBold}>
                      📞 {selectedPatientModal?.phone}
                    </Text>
                  </View>
                </View>

                {/* Quick Call & WhatsApp Action Buttons in Modal */}
                {selectedPatientModal?.cleanPhone ? (
                  <View style={styles.modalActionButtonsRow}>
                    <TouchableOpacity
                      style={styles.modalCallBtn}
                      onPress={() => handleCall(selectedPatientModal.cleanPhone)}
                    >
                      <Feather name="phone" size={14} color="#0284c7" />
                      <Text style={styles.modalCallBtnText}>Call Patient</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.modalWABtn}
                      onPress={() => handleWhatsApp(selectedPatientModal.cleanPhone, selectedPatientModal.name)}
                    >
                      <MaterialCommunityIcons name="whatsapp" size={16} color="#16a34a" />
                      <Text style={styles.modalWABtnText}>WhatsApp</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>

              {/* Amount & Billing Section */}
              <View style={styles.modalSectionCard}>
                <Text style={styles.modalSectionHeading}>💰 Amount & Billing Details</Text>
                <View style={styles.amountDisplayRow}>
                  <View style={[
                    styles.amountBox,
                    selectedPatientModal?.paymentStatus === 'paid' || (selectedPatientModal?.amountPaid || 0) > 0
                      ? styles.amountPaidBox
                      : styles.amountPendingBox
                  ]}>
                    <Text style={styles.amountBoxLabel}>Amount Paid</Text>
                    <Text style={[
                      styles.amountBoxValue,
                      selectedPatientModal?.paymentStatus === 'paid' || (selectedPatientModal?.amountPaid || 0) > 0
                        ? { color: '#15803d' }
                        : { color: '#b45309' }
                    ]}>
                      ₹{selectedPatientModal?.amountPaid || '0'}
                    </Text>
                  </View>

                  <View style={styles.amountDetailsCol}>
                    <Text style={styles.amountDetailsText}>
                      Status: <Text style={{ fontWeight: '800', color: selectedPatientModal?.paymentStatus === 'paid' ? '#16a34a' : '#ea580c' }}>
                        {(selectedPatientModal?.paymentStatus || 'pending').toUpperCase()}
                      </Text>
                    </Text>
                    <Text style={styles.amountDetailsText}>
                      Mode: <Text style={{ fontWeight: '700' }}>{selectedPatientModal?.paymentMode || 'Cash / Direct'}</Text>
                    </Text>
                  </View>
                </View>
              </View>

              {/* Prescribed Medicines Section */}
              <View style={styles.modalSectionCard}>
                <Text style={styles.modalSectionHeading}>
                  💊 Prescribed Medicines ({selectedPatientModal?.medicines?.length || 0})
                </Text>
                {selectedPatientModal?.medicines && selectedPatientModal.medicines.length > 0 ? (
                  <View style={{ gap: 6, marginTop: 6 }}>
                    {selectedPatientModal.medicines.map((med, idx) => (
                      <View key={idx} style={styles.medCard}>
                        <Text style={styles.medName}>{med.name}</Text>
                        <Text style={styles.medSub}>
                          {med.dosage || '4 Pills'} • {med.frequency || 'Twice Daily'} • {med.duration || '7 Days'}
                        </Text>
                        {med.instructions ? (
                          <Text style={styles.medInstructions}>Note: {med.instructions}</Text>
                        ) : null}
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.modalEmptyText}>No digital medicines listed for this visit.</Text>
                )}
              </View>

              {/* Uploaded Prescriptions & Scans */}
              <View style={styles.modalSectionCard}>
                <Text style={styles.modalSectionHeading}>
                  📄 Uploaded Prescription Scans & Photos ({selectedPatientModal?.uploadedImages?.length || 0})
                </Text>
                {selectedPatientModal?.uploadedImages && selectedPatientModal.uploadedImages.length > 0 ? (
                  <View style={styles.modalImagesGrid}>
                    {selectedPatientModal.uploadedImages.map((url, idx) => (
                      <TouchableOpacity
                        key={idx}
                        style={styles.modalImageThumbWrap}
                        onPress={() => openImageFullView(selectedPatientModal.uploadedImages, idx)}
                        activeOpacity={0.8}
                      >
                        <Image source={{ uri: url }} style={styles.modalImageThumb} resizeMode="cover" />
                        <View style={styles.modalImageOverlay}>
                          <Text style={styles.modalImageOverlayText}>Tap Full View ({idx + 1})</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.modalEmptyText}>No prescription images uploaded for this visit.</Text>
                )}
              </View>

              {/* Clinical Diagnosis & Chief Complaint */}
              <View style={styles.modalSectionCard}>
                <Text style={styles.modalSectionHeading}>📋 Clinical Findings & Diagnosis</Text>
                {selectedPatientModal?.chiefComplaint ? (
                  <View style={{ marginBottom: 6 }}>
                    <Text style={styles.clinicalSubTitle}>Chief Complaints:</Text>
                    <Text style={styles.clinicalText}>{selectedPatientModal.chiefComplaint}</Text>
                  </View>
                ) : null}
                {selectedPatientModal?.diagnosisNotes ? (
                  <View>
                    <Text style={styles.clinicalSubTitle}>Doctor's Diagnosis Notes:</Text>
                    <Text style={styles.clinicalText}>{selectedPatientModal.diagnosisNotes}</Text>
                  </View>
                ) : null}
                {!selectedPatientModal?.chiefComplaint && !selectedPatientModal?.diagnosisNotes ? (
                  <Text style={styles.modalEmptyText}>No clinical diagnosis recorded for this consultation.</Text>
                ) : null}
              </View>

              {/* Past Visits History */}
              {selectedPatientModal?.pastVisitsList && selectedPatientModal.pastVisitsList.length > 0 ? (
                <View style={styles.modalSectionCard}>
                  <Text style={styles.modalSectionHeading}>
                    ⏱ Previous Visits History ({selectedPatientModal.pastVisitsList.length})
                  </Text>
                  <View style={{ gap: 6, marginTop: 6 }}>
                    {selectedPatientModal.pastVisitsList.map((pv, idx) => (
                      <View key={idx} style={styles.pastVisitCard}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text style={styles.pastVisitDate}>📅 {pv.date} ({pv.time})</Text>
                          <Text style={styles.pastVisitBranch}>📍 {pv.branch}</Text>
                        </View>
                        {pv.amount ? (
                          <Text style={styles.pastVisitAmount}>₹{pv.amount} Paid</Text>
                        ) : null}
                        {pv.diagnosis ? (
                          <Text style={styles.pastVisitDiagnosis} numberOfLines={1}>
                            Notes: {pv.diagnosis}
                          </Text>
                        ) : null}
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}

              <View style={{ height: 20 }} />
            </ScrollView>

            {/* Modal Bottom Close Action */}
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalBottomCloseBtn}
                onPress={() => setSelectedPatientModal(null)}
              >
                <Text style={styles.modalBottomCloseBtnText}>Close Details</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 2. Full-Screen Prescription Preview Modal with Swipe & Swap Controls */}
      <Modal
        visible={previewImages.length > 0}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setPreviewImages([])}
      >
        <View style={styles.imageModalOverlay}>
          {/* Header Bar: Scan count & Close button */}
          <View style={styles.previewHeaderBar}>
            <View style={styles.previewCounterBadge}>
              <Feather name="file-text" size={13} color="#ffffff" style={{ marginRight: 6 }} />
              <Text style={styles.previewCounterText}>
                Prescription Scan {previewImageIndex + 1} of {previewImages.length}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.imageModalCloseBtn}
              onPress={() => setPreviewImages([])}
              activeOpacity={0.8}
            >
              <Ionicons name="close" size={24} color="#ffffff" />
            </TouchableOpacity>
          </View>

          {/* Swipeable Gallery (FlatList with horizontal paging) */}
          <FlatList
            ref={fullViewListRef}
            data={previewImages}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyExtractor={(_, index) => String(index)}
            initialScrollIndex={previewImageIndex < previewImages.length ? previewImageIndex : 0}
            getItemLayout={(_, index) => ({
              length: Dimensions.get('window').width,
              offset: Dimensions.get('window').width * index,
              index,
            })}
            onMomentumScrollEnd={(e) => {
              const screenW = Dimensions.get('window').width;
              const idx = Math.round(e.nativeEvent.contentOffset.x / screenW);
              if (idx >= 0 && idx < previewImages.length) {
                setPreviewImageIndex(idx);
              }
            }}
            renderItem={({ item }) => (
              <View style={{
                width: Dimensions.get('window').width,
                height: Dimensions.get('window').height * 0.74,
                justifyContent: 'center',
                alignItems: 'center',
              }}>
                <Image
                  source={{ uri: item }}
                  style={styles.imageModalFull}
                  resizeMode="contain"
                />
              </View>
            )}
          />

          {/* Floating Left Swap Button */}
          {previewImages.length > 1 && previewImageIndex > 0 && (
            <TouchableOpacity
              style={styles.swapBtnLeft}
              onPress={handleSwapPrev}
              activeOpacity={0.8}
            >
              <Feather name="chevron-left" size={28} color="#ffffff" />
            </TouchableOpacity>
          )}

          {/* Floating Right Swap Button */}
          {previewImages.length > 1 && previewImageIndex < previewImages.length - 1 && (
            <TouchableOpacity
              style={styles.swapBtnRight}
              onPress={handleSwapNext}
              activeOpacity={0.8}
            >
              <Feather name="chevron-right" size={28} color="#ffffff" />
            </TouchableOpacity>
          )}

          {/* Bottom Bar: Swap navigation controls & page dots */}
          {previewImages.length > 1 && (
            <View style={styles.previewBottomBar}>
              <TouchableOpacity
                style={[styles.quickSwapBtn, previewImageIndex === 0 && styles.quickSwapBtnDisabled]}
                onPress={handleSwapPrev}
                disabled={previewImageIndex === 0}
                activeOpacity={0.7}
              >
                <Feather name="arrow-left" size={14} color={previewImageIndex === 0 ? '#64748b' : '#ffffff'} />
                <Text style={[styles.quickSwapText, previewImageIndex === 0 && { color: '#64748b' }]}>Prev Scan</Text>
              </TouchableOpacity>

              <View style={styles.previewDotsRow}>
                {previewImages.map((_, i) => (
                  <View
                    key={i}
                    style={[styles.previewDot, i === previewImageIndex && styles.previewDotActive]}
                  />
                ))}
              </View>

              <TouchableOpacity
                style={[styles.quickSwapBtn, previewImageIndex >= previewImages.length - 1 && styles.quickSwapBtnDisabled]}
                onPress={handleSwapNext}
                disabled={previewImageIndex >= previewImages.length - 1}
                activeOpacity={0.7}
              >
                <Text style={[styles.quickSwapText, previewImageIndex >= previewImages.length - 1 && { color: '#64748b' }]}>Next Scan</Text>
                <Feather name="arrow-right" size={14} color={previewImageIndex >= previewImages.length - 1 ? '#64748b' : '#ffffff'} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 14,
    paddingTop: 8,
  },
  headerWrapper: {
    marginBottom: 12,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    marginTop: 4,
  },
  screenTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },
  screenSub: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 1,
  },
  countBadge: {
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  countBadgeText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#0284c7',
  },
  filterToolbar: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 10,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 40,
  },
  searchInputText: {
    flex: 1,
    fontSize: 12.5,
    color: '#0f172a',
  },
  dateFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748b',
  },
  dateFilterBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  dateFilterBtnActive: {
    backgroundColor: '#0284c7',
  },
  dateFilterBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  dateFilterBtnTextActive: {
    color: '#ffffff',
  },
  patientCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1.5,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  patientName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
  },
  patientIdText: {
    fontSize: 11.5,
    color: '#64748b',
    marginTop: 2,
  },
  visitBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  visitBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  historyBadge: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  historyBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#16a34a',
  },
  amountBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
  },
  amountPaidBadge: {
    backgroundColor: '#dcfce7',
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  amountPendingBadge: {
    backgroundColor: '#fef3c7',
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  amountBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  amountPaidText: {
    color: '#15803d',
  },
  amountPendingText: {
    color: '#b45309',
  },
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  detailItemHighlight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f0f9ff',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  detailTextHighlight: {
    fontSize: 11.5,
    color: '#0284c7',
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  detailText: {
    fontSize: 11.5,
    color: '#64748b',
  },
  complaintBox: {
    marginTop: 8,
    backgroundColor: '#f8fafc',
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  complaintText: {
    fontSize: 11.5,
    color: '#334155',
    lineHeight: 16,
  },
  imagesSection: {
    marginTop: 10,
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  imagesSectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0284c7',
  },
  imagesRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  imageThumbnailWrap: {
    width: 64,
    height: 64,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#bae6fd',
    backgroundColor: '#e2e8f0',
  },
  imageThumbnail: {
    width: '100%',
    height: '100%',
  },
  imageThumbBadge: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    paddingVertical: 1,
  },
  imageThumbBadgeText: {
    fontSize: 8,
    color: '#ffffff',
    fontWeight: '800',
    textAlign: 'center',
  },
  moreImagesWrap: {
    width: 64,
    height: 64,
    borderRadius: 8,
    backgroundColor: '#e0f2fe',
    borderWidth: 1.5,
    borderColor: '#7dd3fc',
    justifyContent: 'center',
    alignItems: 'center',
  },
  moreImagesText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0284c7',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  phoneText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  iconBtnCall: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#e0f2fe',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconBtnWA: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#dcfce7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewPopupBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#0284c7',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
    elevation: 1.5,
  },
  viewPopupBtnText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#ffffff',
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 8,
  },
  emptyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 30,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginTop: 10,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1e293b',
  },
  emptySub: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 16,
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContainer: {
    width: '100%',
    maxHeight: Dimensions.get('window').height * 0.88,
    backgroundColor: '#ffffff',
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    backgroundColor: '#ffffff',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBody: {
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  modalSectionCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    marginBottom: 12,
  },
  modalSectionHeading: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0284c7',
    marginBottom: 8,
  },
  modalInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  modalInfoCol: {
    flex: 1,
  },
  modalLabel: {
    fontSize: 10.5,
    color: '#64748b',
    fontWeight: '600',
  },
  modalValueBold: {
    fontSize: 12,
    color: '#0f172a',
    fontWeight: '800',
    marginTop: 2,
  },
  modalActionButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  modalCallBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#e0f2fe',
    borderRadius: 8,
    paddingVertical: 7,
  },
  modalCallBtnText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#0284c7',
  },
  modalWABtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#dcfce7',
    borderRadius: 8,
    paddingVertical: 7,
  },
  modalWABtnText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#16a34a',
  },
  amountDisplayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  amountBox: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: 'center',
    borderWidth: 1,
  },
  amountPaidBox: {
    backgroundColor: '#dcfce7',
    borderColor: '#bbf7d0',
  },
  amountPendingBox: {
    backgroundColor: '#fef3c7',
    borderColor: '#fde68a',
  },
  amountBoxLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748b',
  },
  amountBoxValue: {
    fontSize: 18,
    fontWeight: '900',
    marginTop: 2,
  },
  amountDetailsCol: {
    flex: 1,
    gap: 4,
  },
  amountDetailsText: {
    fontSize: 12,
    color: '#475569',
  },
  medCard: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    padding: 8,
  },
  medName: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0f172a',
  },
  medSub: {
    fontSize: 11,
    color: '#0284c7',
    fontWeight: '700',
    marginTop: 1,
  },
  medInstructions: {
    fontSize: 10,
    color: '#64748b',
    fontStyle: 'italic',
    marginTop: 2,
  },
  modalImagesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 6,
  },
  modalImageThumbWrap: {
    width: 80,
    height: 80,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#0284c7',
    backgroundColor: '#e2e8f0',
  },
  modalImageThumb: {
    width: '100%',
    height: '100%',
  },
  modalImageOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.78)',
    paddingVertical: 2,
  },
  modalImageOverlayText: {
    fontSize: 8,
    color: '#ffffff',
    fontWeight: '800',
    textAlign: 'center',
  },
  clinicalSubTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
  },
  clinicalText: {
    fontSize: 12,
    color: '#1e293b',
    lineHeight: 17,
    marginTop: 2,
  },
  pastVisitCard: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 8,
    gap: 2,
  },
  pastVisitDate: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#0f172a',
  },
  pastVisitBranch: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
  },
  pastVisitAmount: {
    fontSize: 11,
    fontWeight: '800',
    color: '#16a34a',
  },
  pastVisitDiagnosis: {
    fontSize: 10.5,
    color: '#64748b',
  },
  modalEmptyText: {
    fontSize: 11.5,
    color: '#94a3b8',
    fontStyle: 'italic',
    marginTop: 2,
  },
  modalFooter: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    backgroundColor: '#ffffff',
  },
  modalBottomCloseBtn: {
    backgroundColor: '#0284c7',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  modalBottomCloseBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#ffffff',
  },
  imageModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.96)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewHeaderBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 52 : 36,
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 20,
  },
  previewCounterBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  previewCounterText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
  imageModalCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageModalFull: {
    width: Dimensions.get('window').width * 0.95,
    height: Dimensions.get('window').height * 0.72,
  },
  swapBtnLeft: {
    position: 'absolute',
    left: 8,
    top: '50%',
    marginTop: -24,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 15,
  },
  swapBtnRight: {
    position: 'absolute',
    right: 8,
    top: '50%',
    marginTop: -24,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 15,
  },
  previewBottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 28 : 16,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 20,
  },
  quickSwapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  quickSwapBtnDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  quickSwapText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  previewDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  previewDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  previewDotActive: {
    backgroundColor: '#ffffff',
    width: 9,
    height: 9,
    borderRadius: 4.5,
  },
});
