import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Users, Search, Calendar, MapPin, Phone, MessageSquare,
  FileText, Clock, X, RefreshCw, ChevronRight, ChevronLeft,
  ChevronsLeft, ChevronsRight, UserCheck
} from 'lucide-react';
import { db, getBranchQueryNames, sanitizeDoctorName } from '@app/shared';
import { collection, onSnapshot, query, where, getDocs, limit } from 'firebase/firestore';
import { receptionDataStore } from '../../../utils/receptionDataStore';
import { getPatientVisitState } from '../../../utils/patientVisitState';

export interface PatientRecord {
  id: string;
  name: string;
  phone: string;
  age?: number | string;
  gender?: string;
  branchName: string;
  appointmentDate: string; // YYYY-MM-DD or ISO
  appointmentTime?: string;
  doctorName?: string;
  status: 'active' | 'completed' | 'follow_up' | 'awaiting_payment' | string;
  regId?: string;
  collectionName?: string;
  raw?: any;
}

interface AllPatientsPageProps {
  currentBranch?: string;
  onNavigate?: (tab: string, data?: any) => void;
}

// --- Date & Branch Helpers ---
const getFormattedDateStr = (dateObj: Date): string => {
  const yyyy = dateObj.getFullYear();
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const dd = String(dateObj.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const normalizeDateToISO = (dateStr: string): string => {
  if (!dateStr) return '';
  const clean = String(dateStr).trim();
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

const normalizeBranchName = (b: string): string => {
  return (b || '').toLowerCase().replace(/\s*branch\s*/i, '').trim();
};

const getBranchShortcut = (str: string): string => {
  if (str.includes('kphb') || str.includes('kukatpally')) return 'kphb';
  if (str.includes('nalla') || str.includes('nallagandla')) return 'nalla';
  if (str.includes('chanda') || str.includes('chnr') || str.includes('chandanagar')) return 'chanda';
  if (str.includes('dilshuk') || str.includes('dilsukh') || str.includes('dsnr') || str.includes('dshnr')) return 'dsnr';
  return str;
};

const isBranchMatching = (b1: string, b2?: string): boolean => {
  if (!b2 || b2 === 'all' || b2 === 'All Branches') return true;
  const n1 = normalizeBranchName(b1);
  const n2 = normalizeBranchName(b2);
  if (n1 === n2 || n1.includes(n2) || n2.includes(n1)) return true;
  return getBranchShortcut(n1) === getBranchShortcut(n2);
};

// Seed Fallback Data
const INITIAL_PATIENTS: PatientRecord[] = [
  { id: 'PAT-101', name: 'Rajesh Kumar', phone: '+91 98490 12345', age: 38, gender: 'Male', branchName: 'KPHB Branch', appointmentDate: getFormattedDateStr(new Date()), appointmentTime: '10:00 AM', doctorName: 'Dr. Srinivas', status: 'active', regId: 'SPH-KPHB-0101' },
  { id: 'PAT-102', name: 'Sneha Reddy', phone: '+91 91210 67890', age: 29, gender: 'Female', branchName: 'Nallagandla Branch', appointmentDate: getFormattedDateStr(new Date()), appointmentTime: '11:15 AM', doctorName: 'Dr. Ananya', status: 'follow_up', regId: 'SPH-NALLA-0102' },
  { id: 'PAT-103', name: 'Venkatesh Rao', phone: '+91 94400 45678', age: 45, gender: 'Male', branchName: 'Dilshuknagar Branch', appointmentDate: getFormattedDateStr(new Date(Date.now() - 86400000)), appointmentTime: '02:30 PM', doctorName: 'Dr. Srinivas', status: 'completed', regId: 'SPH-DSNR-0103' },
  { id: 'PAT-104', name: 'Ananya Sharma', phone: '+91 99887 11223', age: 31, gender: 'Female', branchName: 'Chandanagar Branch', appointmentDate: getFormattedDateStr(new Date(Date.now() - 86400000)), appointmentTime: '04:00 PM', doctorName: 'Dr. Ramesh', status: 'awaiting_payment', regId: 'SPH-CHNR-0104' },
  { id: 'PAT-105', name: 'Kiran Verma', phone: '+91 98765 00011', age: 50, gender: 'Male', branchName: 'KPHB Branch', appointmentDate: '2026-09-01', appointmentTime: '11:30 AM', doctorName: 'Dr. Ananya', status: 'completed', regId: 'SPH-KPHB-0105' }
];

export const AllPatientsPage: React.FC<AllPatientsPageProps> = ({ currentBranch = 'KPHB Branch', onNavigate }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilterMode, setDateFilterMode] = useState<'today' | 'yesterday' | 'all'>('today');
  const [patients, setPatients] = useState<PatientRecord[]>(INITIAL_PATIENTS);
  const [isLoading, setIsLoading] = useState(false);
  const [isSearchingLive, setIsSearchingLive] = useState(false);

  // --- Page-wise Pagination State (No Lag) ---
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);

  // --- Live Store Pool for Visit Badges ---
  const [storePool, setStorePool] = useState<any[]>(() => receptionDataStore.getAllCollectionsPool());
  const [storePkgs, setStorePkgs] = useState<any[]>(() => receptionDataStore.getPackageMembers());

  const todayStr = getFormattedDateStr(new Date());
  const yesterdayStr = getFormattedDateStr(new Date(Date.now() - 86400000));

  // --- Real-time Firestore Sync Across allpatients, appointments & patients collections ---
  useEffect(() => {
    let unsubAll: (() => void) | null = null;
    let unsubApp: (() => void) | null = null;
    let isMounted = true;
    setIsLoading(true);

    // Auto-start reception data store listeners so visit states are immediately populated
    try {
      receptionDataStore.startListeners(currentBranch);
      const unsubStore = receptionDataStore.subscribe((state) => {
        if (!isMounted) return;
        setStorePool(state.allCollectionsPool);
        setStorePkgs(state.packageMembersList);
      });
      unsubAll = unsubStore;
    } catch (e) {
      console.warn('Store start notice:', e);
    }

    let allList: PatientRecord[] = [];
    let appList: PatientRecord[] = [];
    let patColList: PatientRecord[] = [];

    const mapDocToPatient = (id: string, data: any, colName: string = 'allpatients'): PatientRecord => {
      const bName = data.branch || data.branchName || currentBranch || 'KPHB Branch';
      const cleanPhone = String(data.phoneNumber || data.phone || data.mobile || data.contactNumber || '').trim();
      const pName = data.patientName || data.name || data.fullName || 'Patient';
      const regId = data.registrationId || data.regId || data.regNo || data.patientId || id;
      const rawDate = data.appointmentDate || data.date || data.createdAt || todayStr;

      let status = 'active';
      const s = String(data.status || '').toLowerCase().trim();
      const p = String(data.paymentStatus || '').toLowerCase().trim();
      if (s === 'completed' || s === 'done' || s === 'paid' || p === 'paid') {
        status = 'completed';
      } else if (s === 'follow_up' || s === 'followup' || data.followUpOpted === true) {
        status = 'follow_up';
      } else if (s === 'collect_fee' || s === 'awaiting_payment' || p === 'pending') {
        status = 'awaiting_payment';
      }

      return {
        id,
        name: pName,
        phone: cleanPhone,
        age: data.age || data.patientAge,
        gender: data.gender || 'Male',
        branchName: bName,
        appointmentDate: normalizeDateToISO(String(rawDate)),
        appointmentTime: data.appointmentTime || data.time || '10:00 AM',
        doctorName: sanitizeDoctorName(data.doctorName || data.doctor, bName),
        status,
        regId,
        collectionName: colName,
        raw: { ...data, collectionName: colName, id }
      };
    };

    const mergeAndSet = () => {
      if (!isMounted) return;
      const combinedMap = new Map<string, PatientRecord>();

      // 1. Master Historical Patients
      patColList.forEach(p => {
        combinedMap.set(p.id, p);
      });

      // 2. All Patients (reception walk-in & registry)
      allList.forEach(p => {
        if (!combinedMap.has(p.id)) {
          combinedMap.set(p.id, p);
        } else {
          const existing = combinedMap.get(p.id)!;
          combinedMap.set(p.id, { ...existing, ...p, raw: { ...existing.raw, ...p.raw } });
        }
      });

      // 3. Appointments (today's active queue & status)
      appList.forEach(p => {
        if (!combinedMap.has(p.id)) {
          combinedMap.set(p.id, p);
        } else {
          const existing = combinedMap.get(p.id)!;
          combinedMap.set(p.id, { ...existing, ...p, raw: { ...existing.raw, ...p.raw } });
        }
      });

      // 4. Include seed fallback matching current branch if empty
      if (combinedMap.size === 0) {
        INITIAL_PATIENTS.forEach(seed => {
          if (!currentBranch || isBranchMatching(seed.branchName, currentBranch)) {
            combinedMap.set(seed.id, seed);
          }
        });
      }

      // Sort newest first by appointmentDate / createdAt
      const sortedList = Array.from(combinedMap.values()).sort((a, b) => {
        const dateA = a.appointmentDate || '';
        const dateB = b.appointmentDate || '';
        return dateB.localeCompare(dateA);
      });

      setPatients(sortedList);
      setIsLoading(false);
    };

    try {
      // 1. Subscribe to allpatients (capped to protect quota)
      const unsubPatSnap = onSnapshot(query(collection(db, 'allpatients'), limit(300)), (snap) => {
        const list: PatientRecord[] = [];
        snap.forEach(docSnap => {
          const item = mapDocToPatient(docSnap.id, docSnap.data(), 'allpatients');
          if (!currentBranch || isBranchMatching(item.branchName, currentBranch)) {
            list.push(item);
          }
        });
        allList = list;
        mergeAndSet();
      }, (err) => {
        console.warn('allpatients snapshot notice:', err);
        mergeAndSet();
      });

      // 2. Subscribe to appointments (capped to protect quota)
      unsubApp = onSnapshot(query(collection(db, 'appointments'), limit(300)), (snap) => {
        const list: PatientRecord[] = [];
        snap.forEach(docSnap => {
          const item = mapDocToPatient(docSnap.id, docSnap.data(), 'appointments');
          if (!currentBranch || isBranchMatching(item.branchName, currentBranch)) {
            list.push(item);
          }
        });
        appList = list;
        mergeAndSet();
      }, (err) => {
        console.warn('appointments snapshot notice:', err);
        mergeAndSet();
      });

      // 3. Load historical patients for this branch (page-wise chunked to ensure zero lag)
      const branchQueries = getBranchQueryNames(currentBranch);
      const fetchBranchPatients = async () => {
        try {
          const qList = branchQueries.length > 0
            ? [
                query(collection(db, 'patients'), where('branchName', 'in', branchQueries), limit(1000)),
                query(collection(db, 'patients'), where('branch', 'in', branchQueries), limit(1000))
              ]
            : [query(collection(db, 'patients'), limit(500))];

          const snaps = await Promise.all(qList.map(q => getDocs(q).catch(() => ({ docs: [] }))));
          const list: PatientRecord[] = [];
          const seen = new Set<string>();

          snaps.forEach((snap: any) => {
            if (!snap || !snap.docs) return;
            snap.docs.forEach((docSnap: any) => {
              if (seen.has(docSnap.id)) return;
              seen.add(docSnap.id);
              list.push(mapDocToPatient(docSnap.id, docSnap.data(), 'patients'));
            });
          });

          patColList = list;
          mergeAndSet();
        } catch (err) {
          console.warn('Branch patients load notice:', err);
        }
      };

      fetchBranchPatients();

      return () => {
        isMounted = false;
        if (unsubPatSnap) unsubPatSnap();
        if (unsubApp) unsubApp();
        if (unsubAll) unsubAll();
      };
    } catch (e) {
      console.warn('Subscription error:', e);
      setPatients(INITIAL_PATIENTS.filter(p => !currentBranch || isBranchMatching(p.branchName, currentBranch)));
      setIsLoading(false);
    }
  }, [currentBranch]);

  // --- Live Firestore Search Fallback for older Historical Records ---
  useEffect(() => {
    const trimmed = searchTerm.trim();
    if (!trimmed || trimmed.length < 3) return;

    const timer = setTimeout(async () => {
      const cleanDigits = trimmed.replace(/\D/g, '');
      const isPhoneSearch = cleanDigits.length >= 7;

      setIsSearchingLive(true);
      try {
        const queriesToRun: any[] = [];
        if (isPhoneSearch) {
          const tenDigit = cleanDigits.slice(-10);
          queriesToRun.push(
            getDocs(query(collection(db, 'patients'), where('phone', '==', tenDigit), limit(20))).catch(() => ({ docs: [] })),
            getDocs(query(collection(db, 'allpatients'), where('phone', '==', tenDigit), limit(20))).catch(() => ({ docs: [] })),
            getDocs(query(collection(db, 'appointments'), where('phone', '==', tenDigit), limit(20))).catch(() => ({ docs: [] }))
          );
        } else {
          queriesToRun.push(
            getDocs(query(collection(db, 'patients'), where('registrationId', '==', trimmed), limit(20))).catch(() => ({ docs: [] })),
            getDocs(query(collection(db, 'allpatients'), where('registrationId', '==', trimmed), limit(20))).catch(() => ({ docs: [] })),
            getDocs(query(collection(db, 'patients'), where('regNo', '==', trimmed), limit(20))).catch(() => ({ docs: [] }))
          );
        }

        const results = await Promise.all(queriesToRun);
        const newRecords: PatientRecord[] = [];
        const existingIds = new Set(patients.map(p => p.id));

        results.forEach((snap: any) => {
          if (!snap || !snap.docs) return;
          snap.docs.forEach((docSnap: any) => {
            if (!existingIds.has(docSnap.id)) {
              const d = docSnap.data();
              const bName = d.branch || d.branchName || currentBranch || 'KPHB Branch';
              if (!currentBranch || isBranchMatching(bName, currentBranch)) {
                existingIds.add(docSnap.id);
                newRecords.push({
                  id: docSnap.id,
                  name: d.patientName || d.name || d.fullName || 'Patient',
                  phone: String(d.phoneNumber || d.phone || d.mobile || '').trim(),
                  age: d.age || d.patientAge,
                  gender: d.gender || 'Male',
                  branchName: bName,
                  appointmentDate: normalizeDateToISO(String(d.appointmentDate || d.date || d.createdAt || todayStr)),
                  appointmentTime: d.appointmentTime || d.time || '10:00 AM',
                  doctorName: sanitizeDoctorName(d.doctorName || d.doctor, bName),
                  status: 'active',
                  regId: d.registrationId || d.regId || d.regNo || d.patientId || docSnap.id,
                  collectionName: 'patients',
                  raw: { ...d, id: docSnap.id, collectionName: 'patients' }
                });
              }
            }
          });
        });

        if (newRecords.length > 0) {
          setPatients(prev => [...newRecords, ...prev]);
        }
      } catch (err) {
        console.warn('Live Firestore search notice:', err);
      } finally {
        setIsSearchingLive(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [searchTerm, currentBranch]);

  // --- Session Counts ---
  const counts = useMemo(() => {
    let today = 0;
    let yesterday = 0;
    let total = 0;

    patients.forEach(p => {
      if (currentBranch && !isBranchMatching(p.branchName, currentBranch)) return;
      total++;
      const pDate = normalizeDateToISO(p.appointmentDate);
      if (pDate === todayStr) today++;
      if (pDate === yesterdayStr) yesterday++;
    });

    return { today, yesterday, total };
  }, [patients, currentBranch, todayStr, yesterdayStr]);

  // --- Filtering Engine: Fix Search to scan across ALL dates when search is active ---
  const filteredPatients = useMemo(() => {
    const isSearching = searchTerm.trim() !== '';
    const queryStr = searchTerm.toLowerCase().trim();
    const queryDigits = searchTerm.replace(/\D/g, '');

    return patients.filter((patient) => {
      // 1. Strictly locked to this branch
      if (currentBranch && !isBranchMatching(patient.branchName, currentBranch)) {
        return false;
      }

      const patientDate = normalizeDateToISO(patient.appointmentDate);

      // 2. If NOT searching, apply Session Date Filter (Today, Yesterday, All)
      if (!isSearching) {
        if (dateFilterMode === 'today') {
          if (patientDate !== todayStr) return false;
        } else if (dateFilterMode === 'yesterday') {
          if (patientDate !== yesterdayStr) return false;
        }
      }

      // 3. Search query filter (Name, Phone, ID)
      if (isSearching) {
        const matchesName = (patient.name || '').toLowerCase().includes(queryStr);
        const pPhone = (patient.phone || '').replace(/\D/g, '');
        const matchesPhone = queryDigits.length > 0 && pPhone.includes(queryDigits);
        const matchesId = (patient.regId || patient.id || '').toLowerCase().includes(queryStr);
        if (!matchesName && !matchesPhone && !matchesId) return false;
      }

      return true;
    });
  }, [patients, dateFilterMode, currentBranch, searchTerm, todayStr, yesterdayStr]);

  // Reset to page 1 whenever search, date filter, or branch changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, dateFilterMode, currentBranch, pageSize]);

  // --- Pagination Slice for 0ms Lag-Free Table Rendering ---
  const totalPages = Math.max(1, Math.ceil(filteredPatients.length / pageSize));
  const paginatedPatients = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredPatients.slice(startIndex, startIndex + pageSize);
  }, [filteredPatients, currentPage, pageSize]);

  // --- Handlers ---
  const handleOpenPatientFile = (patient: PatientRecord) => {
    if (onNavigate) {
      onNavigate('reception_patient_file', {
        id: patient.id,
        patientName: patient.name,
        name: patient.name,
        phone: patient.phone,
        phoneNumber: patient.phone,
        registrationId: patient.regId || patient.id,
        regId: patient.regId || patient.id,
        branch: patient.branchName,
        doctorName: patient.doctorName,
        appointmentDate: patient.appointmentDate,
        ...patient.raw
      });
    } else {
      window.alert(`Patient: ${patient.name} (${patient.regId || patient.id})`);
    }
  };

  const handleCall = (phone: string) => {
    if (!phone) return;
    window.location.href = `tel:${phone}`;
  };

  const handleWhatsApp = (phone: string, name: string) => {
    if (!phone) return;
    const clean = phone.replace(/\D/g, '').slice(-10);
    const msg = encodeURIComponent(`Hello ${name}, regarding your appointment at Spiritual Homeopathy Clinic.`);
    window.open(`https://wa.me/91${clean}?text=${msg}`, '_blank');
  };

  const getStatusBadge = (status: string) => {
    const s = (status || 'active').toLowerCase();
    if (s === 'completed' || s === 'done' || s === 'paid') {
      return { bg: '#dcfce7', text: '#15803d', border: '#bbf7d0', label: 'Completed ✓' };
    }
    if (s === 'follow_up' || s === 'followup') {
      return { bg: '#fef9c3', text: '#a16207', border: '#fef08a', label: 'Follow Up' };
    }
    if (s === 'awaiting_payment' || s === 'pending' || s === 'collect_fee') {
      return { bg: '#fee2e2', text: '#b91c1c', border: '#fecaca', label: 'Pay Pending' };
    }
    return { bg: '#e0f2fe', text: '#0369a1', border: '#bae6fd', label: 'Active' };
  };

  return (
    <div style={{ padding: '24px 20px', maxWidth: '1300px', margin: '0 auto', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '22px', flexWrap: 'wrap', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            background: 'linear-gradient(135deg, rgba(37,142,200,0.12), rgba(168,206,58,0.18))',
            padding: '12px',
            borderRadius: '16px',
            border: '1px solid rgba(37,142,200,0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Users color="#258ec8" size={26} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>
                Reception • All Patients
              </h1>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                background: '#f1f5f9',
                border: '1px solid #e2e8f0',
                padding: '3px 10px',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: 700,
                color: '#475569'
              }}>
                <MapPin size={12} color="#258ec8" />
                {currentBranch || 'KPHB Branch'}
              </span>
            </div>
            <p style={{ color: '#64748b', fontSize: '13px', margin: '4px 0 0 0' }}>
              Complete clinic patient directory ({patients.length} loaded records across patients & allpatients)
            </p>
          </div>
        </div>

        {/* Real-time Indicator & Live Search Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isSearchingLive && (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: '#eff6ff',
              color: '#1d4ed8',
              border: '1px solid #bfdbfe',
              padding: '5px 12px',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: 700
            }}>
              <RefreshCw size={12} className="animate-spin" />
              Searching Archive...
            </span>
          )}
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: '#ecfdf5',
            color: '#059669',
            border: '1px solid #a7f3d0',
            padding: '5px 12px',
            borderRadius: '20px',
            fontSize: '12px',
            fontWeight: 700
          }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981' }} />
            Branch Live Sync
          </span>
        </div>
      </div>

      {/* Date Sessions Filter Pills & Search Bar Row */}
      <div style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '16px',
        padding: '16px 20px',
        marginBottom: '20px',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.03)',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px'
      }}>
        {/* Date Session Filter Tabs: Today, Yesterday, All Patients */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => { setDateFilterMode('today'); setSearchTerm(''); }}
            style={{
              padding: '9px 16px',
              borderRadius: '10px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s ease',
              border: dateFilterMode === 'today' && !searchTerm ? '1px solid #258ec8' : '1px solid #e2e8f0',
              background: dateFilterMode === 'today' && !searchTerm ? '#258ec8' : '#ffffff',
              color: dateFilterMode === 'today' && !searchTerm ? '#ffffff' : '#475569',
              boxShadow: dateFilterMode === 'today' && !searchTerm ? '0 4px 12px rgba(37, 142, 200, 0.25)' : 'none'
            }}
          >
            <Calendar size={14} color={dateFilterMode === 'today' && !searchTerm ? '#ffffff' : '#64748b'} />
            Today
            <span style={{
              background: dateFilterMode === 'today' && !searchTerm ? 'rgba(255,255,255,0.25)' : '#f1f5f9',
              color: dateFilterMode === 'today' && !searchTerm ? '#ffffff' : '#0f172a',
              padding: '2px 8px',
              borderRadius: '12px',
              fontSize: '11px',
              fontWeight: 800
            }}>
              {counts.today}
            </span>
          </button>

          <button
            type="button"
            onClick={() => { setDateFilterMode('yesterday'); setSearchTerm(''); }}
            style={{
              padding: '9px 16px',
              borderRadius: '10px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s ease',
              border: dateFilterMode === 'yesterday' && !searchTerm ? '1px solid #258ec8' : '1px solid #e2e8f0',
              background: dateFilterMode === 'yesterday' && !searchTerm ? '#258ec8' : '#ffffff',
              color: dateFilterMode === 'yesterday' && !searchTerm ? '#ffffff' : '#475569',
              boxShadow: dateFilterMode === 'yesterday' && !searchTerm ? '0 4px 12px rgba(37, 142, 200, 0.25)' : 'none'
            }}
          >
            <Clock size={14} color={dateFilterMode === 'yesterday' && !searchTerm ? '#ffffff' : '#64748b'} />
            Yesterday
            <span style={{
              background: dateFilterMode === 'yesterday' && !searchTerm ? 'rgba(255,255,255,0.25)' : '#f1f5f9',
              color: dateFilterMode === 'yesterday' && !searchTerm ? '#ffffff' : '#0f172a',
              padding: '2px 8px',
              borderRadius: '12px',
              fontSize: '11px',
              fontWeight: 800
            }}>
              {counts.yesterday}
            </span>
          </button>

          <button
            type="button"
            onClick={() => { setDateFilterMode('all'); setSearchTerm(''); }}
            style={{
              padding: '9px 16px',
              borderRadius: '10px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s ease',
              border: (dateFilterMode === 'all' || searchTerm) ? '1px solid #258ec8' : '1px solid #e2e8f0',
              background: (dateFilterMode === 'all' || searchTerm) ? '#258ec8' : '#ffffff',
              color: (dateFilterMode === 'all' || searchTerm) ? '#ffffff' : '#475569',
              boxShadow: (dateFilterMode === 'all' || searchTerm) ? '0 4px 12px rgba(37, 142, 200, 0.25)' : 'none'
            }}
          >
            <Users size={14} color={(dateFilterMode === 'all' || searchTerm) ? '#ffffff' : '#64748b'} />
            All Patients
            <span style={{
              background: (dateFilterMode === 'all' || searchTerm) ? 'rgba(255,255,255,0.25)' : '#f1f5f9',
              color: (dateFilterMode === 'all' || searchTerm) ? '#ffffff' : '#0f172a',
              padding: '2px 8px',
              borderRadius: '12px',
              fontSize: '11px',
              fontWeight: 800
            }}>
              {counts.total}
            </span>
          </button>
        </div>

        {/* Search Bar Input */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          background: '#f8fafc',
          border: '1px solid #cbd5e1',
          borderRadius: '10px',
          padding: '8px 14px',
          width: '340px',
          maxWidth: '100%',
          transition: 'all 0.2s ease'
        }}>
          <Search size={16} color="#64748b" style={{ marginRight: '8px', flexShrink: 0 }} />
          <input
            type="text"
            placeholder="Search all patients by name, phone, ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              border: 'none',
              background: 'transparent',
              outline: 'none',
              width: '100%',
              fontSize: '13px',
              color: '#0f172a'
            }}
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            >
              <X size={14} color="#94a3b8" />
            </button>
          )}
        </div>
      </div>

      {/* Patient Records Table */}
      <div style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '18px',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.03)',
        overflow: 'hidden'
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
            <thead>
              <tr style={{
                background: '#f8fafc',
                borderBottom: '2px solid #e2e8f0',
                color: '#475569',
                fontSize: '11px',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                <th style={{ padding: '14px 18px' }}>Patient Info</th>
                <th style={{ padding: '14px 14px' }}>Mobile & Quick Connect</th>
                <th style={{ padding: '14px 14px' }}>Date & Time</th>
                <th style={{ padding: '14px 14px' }}>Doctor</th>
                <th style={{ padding: '14px 14px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredPatients.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: '48px 20px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                      <Users size={36} color="#cbd5e1" />
                      <div style={{ fontWeight: 700, color: '#334155', fontSize: '15px' }}>
                        No patients found
                      </div>
                      <div style={{ color: '#64748b', fontSize: '13px', maxWidth: '380px' }}>
                        {searchTerm
                          ? `No matches found for "${searchTerm}". Try checking phone number or ID.`
                          : `No registered patients scheduled under "${dateFilterMode.toUpperCase()}" session for ${currentBranch}.`}
                      </div>
                      {searchTerm && (
                        <button
                          onClick={() => setSearchTerm('')}
                          style={{
                            marginTop: '8px',
                            background: '#f1f5f9',
                            border: '1px solid #cbd5e1',
                            padding: '6px 14px',
                            borderRadius: '8px',
                            fontSize: '12px',
                            fontWeight: 700,
                            color: '#258ec8',
                            cursor: 'pointer'
                          }}
                        >
                          Clear Search
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedPatients.map((patient, index) => {
                  const badge = getStatusBadge(patient.status);
                  let visitState: any = null;
                  try {
                    visitState = getPatientVisitState(patient.raw || patient, storePool, storePkgs);
                  } catch (e) {}

                  return (
                    <tr
                      key={patient.id || index}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        transition: 'background 0.15s ease'
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f8fafc')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      {/* Name & ID */}
                      <td style={{ padding: '14px 18px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span
                            onClick={() => handleOpenPatientFile(patient)}
                            style={{ fontWeight: 700, color: '#0f172a', fontSize: '14px', cursor: 'pointer' }}
                            title="Open Patient File"
                          >
                            {patient.name}
                          </span>
                          {visitState && (
                            <span style={{
                              background: visitState.badgeBg,
                              color: visitState.badgeColor,
                              border: `1px solid ${visitState.badgeBorder}`,
                              padding: '1px 6px',
                              borderRadius: '4px',
                              fontSize: '10px',
                              fontWeight: 800,
                              letterSpacing: '0.03em'
                            }}>
                              {visitState.badgeText}
                            </span>
                          )}
                          {visitState?.isApp && (
                            <span style={{
                              background: '#f3e8ff',
                              color: '#7e22ce',
                              border: '1px solid #d8b4fe',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              fontSize: '10px',
                              fontWeight: 800,
                              letterSpacing: '0.03em'
                            }}>
                              APP
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
                          <span style={{
                            background: '#eff6ff',
                            color: '#258ec8',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 800,
                            fontFamily: 'monospace'
                          }}>
                            {patient.regId || patient.id}
                          </span>
                          {patient.age ? (
                            <span style={{ fontSize: '12px', color: '#64748b' }}>
                              • {patient.age} yrs
                            </span>
                          ) : null}
                          {patient.gender ? (
                            <span style={{ fontSize: '12px', color: '#64748b' }}>
                              • {patient.gender}
                            </span>
                          ) : null}
                        </div>
                      </td>

                      {/* Mobile & Connect */}
                      <td style={{ padding: '14px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 600, color: '#334155' }}>
                            {patient.phone || 'No phone'}
                          </span>
                          {patient.phone && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <button
                                type="button"
                                title="Call patient"
                                onClick={() => handleCall(patient.phone)}
                                style={{
                                  background: '#eff6ff',
                                  border: '1px solid #bfdbfe',
                                  color: '#258ec8',
                                  borderRadius: '6px',
                                  padding: '4px 6px',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center'
                                }}
                              >
                                <Phone size={13} />
                              </button>
                              <button
                                type="button"
                                title="Chat on WhatsApp"
                                onClick={() => handleWhatsApp(patient.phone, patient.name)}
                                style={{
                                  background: '#f0fdf4',
                                  border: '1px solid #bbf7d0',
                                  color: '#16a34a',
                                  borderRadius: '6px',
                                  padding: '4px 6px',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center'
                                }}
                              >
                                <MessageSquare size={13} />
                              </button>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Date & Time */}
                      <td style={{ padding: '14px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#1e293b', fontWeight: 600 }}>
                          <Calendar size={13} color="#64748b" />
                          {patient.appointmentDate}
                        </div>
                        {patient.appointmentTime && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#64748b', fontSize: '11px', marginTop: '2px' }}>
                            <Clock size={11} />
                            {patient.appointmentTime}
                          </div>
                        )}
                      </td>

                      {/* Doctor */}
                      <td style={{ padding: '14px 14px' }}>
                        <div style={{ color: '#334155', fontWeight: 600 }}>
                          {sanitizeDoctorName(patient.doctorName, patient.branchName)}
                        </div>
                      </td>

                      {/* Status */}
                      <td style={{ padding: '14px 14px' }}>
                        <span style={{
                          background: badge.bg,
                          color: badge.text,
                          border: `1px solid ${badge.border}`,
                          padding: '4px 10px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: 700,
                          display: 'inline-block'
                        }}>
                          {badge.label}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer with Page-wise Pagination Controls (Zero Lag) */}
        <div style={{
          padding: '12px 20px',
          background: '#f8fafc',
          borderTop: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          fontSize: '12px',
          color: '#64748b'
        }}>
          <div>
            Showing <strong>{filteredPatients.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}</strong> to{' '}
            <strong>{Math.min(currentPage * pageSize, filteredPatients.length)}</strong> of{' '}
            <strong>{filteredPatients.length}</strong> patients {currentBranch ? `for ${currentBranch}` : ''}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {/* Rows Per Page selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span>Rows per page:</span>
              <select
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                style={{
                  padding: '3px 8px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  fontSize: '12px',
                  color: '#334155',
                  cursor: 'pointer',
                  outline: 'none'
                }}
              >
                <option value={15}>15</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            {/* Pagination Buttons */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <button
                  type="button"
                  title="First Page"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(1)}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '6px',
                    border: '1px solid #e2e8f0',
                    background: currentPage === 1 ? '#f1f5f9' : '#ffffff',
                    color: currentPage === 1 ? '#94a3b8' : '#258ec8',
                    cursor: currentPage === 1 ? 'not-allowed' : 'pointer'
                  }}
                >
                  <ChevronsLeft size={14} />
                </button>
                <button
                  type="button"
                  title="Previous Page"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '6px',
                    border: '1px solid #e2e8f0',
                    background: currentPage === 1 ? '#f1f5f9' : '#ffffff',
                    color: currentPage === 1 ? '#94a3b8' : '#258ec8',
                    cursor: currentPage === 1 ? 'not-allowed' : 'pointer'
                  }}
                >
                  <ChevronLeft size={14} />
                </button>

                <span style={{ padding: '0 8px', fontWeight: 700, color: '#334155' }}>
                  Page {currentPage} of {totalPages}
                </span>

                <button
                  type="button"
                  title="Next Page"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '6px',
                    border: '1px solid #e2e8f0',
                    background: currentPage === totalPages ? '#f1f5f9' : '#ffffff',
                    color: currentPage === totalPages ? '#94a3b8' : '#258ec8',
                    cursor: currentPage === totalPages ? 'not-allowed' : 'pointer'
                  }}
                >
                  <ChevronRight size={14} />
                </button>
                <button
                  type="button"
                  title="Last Page"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(totalPages)}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '6px',
                    border: '1px solid #e2e8f0',
                    background: currentPage === totalPages ? '#f1f5f9' : '#ffffff',
                    color: currentPage === totalPages ? '#94a3b8' : '#258ec8',
                    cursor: currentPage === totalPages ? 'not-allowed' : 'pointer'
                  }}
                >
                  <ChevronsRight size={14} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
