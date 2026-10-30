import React, { useState, useEffect, useMemo } from 'react';
import {
  Calculator,
  Users,
  IndianRupee,
  Calendar,
  Building2,
  TrendingUp,
  Download,
  Filter,
  Search,
  CheckCircle2,
  Clock,
  Layers,
  BarChart2,
  ArrowUpRight,
  ShieldCheck,
  Stethoscope
} from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@app/shared';
import { receptionDataStore } from '../../../utils/receptionDataStore';

// --- Types ---
export interface PatientAverageRecord {
  id: string;
  patientId: string;
  patientName: string;
  phone: string;
  branchName: string;
  branchKey: 'kphb' | 'nallagandla' | 'chandanagar' | 'dilshuknagar';
  doctorName: string;
  treatmentMonths: number;     // e.g. 1, 2, 3, 6, 12
  durationLabel: string;      // e.g. "1 Month", "2 Months", "3 Months"
  totalFeePaid: number;       // e.g. 1000, 2000, 3000
  monthlyFee: number;         // totalFeePaid / treatmentMonths e.g. 1000
  source: string;
  paymentMethod: string;
  date: string;
  timestamp: string;
  status: string;
}

export interface BranchAverageSummary {
  branchKey: 'kphb' | 'nallagandla' | 'chandanagar' | 'dilshuknagar';
  branchName: string;
  shortName: string;
  color: string;
  patientCount: number;
  totalRevenue: number;
  totalTreatmentMonths: number;
  avgDurationMonths: number;  // totalTreatmentMonths / patientCount
  avgRevenuePerPatient: number; // totalRevenue / patientCount (ARPU)
  avgMonthlyRealization: number; // totalRevenue / totalTreatmentMonths
  cohorts: {
    m1: number; // 1 Month
    m2: number; // 2 Months
    m3: number; // 3 Months
    m6: number; // 6 Months
    m12: number; // 12 Months
  };
}

const FOUR_BRANCHES = [
  { id: 'kphb' as const, name: 'KPHB Branch', short: 'KPHB', color: '#258ec8' },
  { id: 'nallagandla' as const, name: 'Nallagandla Branch', short: 'Nallagandla', color: '#10b981' },
  { id: 'chandanagar' as const, name: 'Chandanagar Branch', short: 'Chandanagar', color: '#f59e0b' },
  { id: 'dilshuknagar' as const, name: 'Dilshuknagar Branch', short: 'Dilshuknagar', color: '#8b5cf6' }
];

// Helpers
const isFirestoreAutoId = (id: any): boolean => {
  if (!id || typeof id !== 'string') return false;
  const s = id.trim();
  return s.length >= 16 && s.length <= 32 && /^[A-Za-z0-9]+$/.test(s) && !s.includes('-') && !s.includes('/') && !s.includes(' ');
};

const extractCleanRegId = (item: any): string => {
  if (!item || typeof item !== 'object') return '';
  const candidates = [
    item.regId, item.registrationId, item.regID, item.registration_id,
    item.registrationNo, item.regNo, item.uhid, item.UHID, item.oldRegId,
    item.customId, item.patientRegId, item.patientCode, item.mrn, item.fileNo,
    item.patientId, item.patient_id
  ];
  for (const c of candidates) {
    if (c && typeof c === 'string') {
      const clean = c.trim();
      if (clean && !isFirestoreAutoId(clean) && clean !== 'undefined' && clean !== 'null') {
        return clean;
      }
    }
  }
  return '';
};

const extractNum = (c: any): number => {
  if (c !== undefined && c !== null && c !== '') {
    const cleanStr = String(c).replace(/[^0-9.]/g, '');
    const num = Number(cleanStr);
    if (!isNaN(num) && num > 0) return num;
  }
  return 0;
};

const mapBranchKey = (raw: string = ''): 'kphb' | 'nallagandla' | 'chandanagar' | 'dilshuknagar' => {
  const s = String(raw || '').toLowerCase();
  if (s.includes('nallagandla') || s.includes('nlg')) return 'nallagandla';
  if (s.includes('dilshuk') || s.includes('dilsukh') || s.includes('dsnr')) return 'dilshuknagar';
  if (s.includes('chanda') || s.includes('chandnagar') || s.includes('cngr')) return 'chandanagar';
  return 'kphb';
};

const mapBranchFullName = (key: string): string => {
  if (key === 'nallagandla') return 'Nallagandla Branch';
  if (key === 'chandanagar') return 'Chandanagar Branch';
  if (key === 'dilshuknagar') return 'Dilshuknagar Branch';
  return 'KPHB Branch';
};

const cleanDoctorName = (name: string): string => {
  if (!name || typeof name !== 'string') return 'Dr. Ramakrishna Chanduri';
  const lower = name.toLowerCase();
  if (lower.includes('prashan') || lower.includes('vaidya')) return 'Dr. Prashanth K Vaidya';
  if (lower.includes('ramakrishna') || lower.includes('chanduri')) return 'Dr. Ramakrishna Chanduri';
  if (lower.includes('jobed') || lower.includes('parveej') || lower.includes('parveez')) return 'Dr. Jobedah Parveej';
  if (lower.includes('padma') || lower.includes('priya')) return 'Dr. Padma Priya';
  return name.startsWith('Dr.') ? name : `Dr. ${name}`;
};

const cleanPatientSource = (raw: any): string => {
  if (!raw || typeof raw !== 'string') return 'Walk-in';
  const s = raw.trim().toLowerCase();
  if (s === 'select source' || s === 'undefined' || s === 'null') return 'Walk-in';
  if (s.includes('old') || s.includes('follow') || s.includes('repeat')) return 'Old Patient';
  if (s.includes('walk') || s.includes('direct') || s.includes('reception') || s.includes('counter')) return 'Walk-in';
  if (s.includes('insta')) return 'Instagram';
  if (s.includes('face') || s.includes('fb')) return 'Facebook';
  if (s.includes('google') || s.includes('web') || s.includes('online')) return 'Google';
  if (s.includes('practo')) return 'Practo';
  if (s.includes('you') || s.includes('yt')) return 'Youtube';
  if (s.includes('refer')) return 'Referral';
  return 'Walk-in';
};

// Parse treatment duration in months from text or numbers
const parseDurationInMonths = (item: any, totalFee: number): { months: number; label: string } => {
  const candidates = [
    item.medicineDuration,
    item.packageDuration,
    item.duration,
    item.treatmentDuration,
    item.treatmentMonths,
    item.followUpMonths,
    item.months,
    item.period
  ];

  for (const c of candidates) {
    if (c !== undefined && c !== null && c !== '') {
      const str = String(c).toLowerCase().trim();
      const numMatch = str.match(/(\d+)\s*(month|m|day|d)?/i);
      if (numMatch) {
        let n = parseInt(numMatch[1], 10);
        if (str.includes('day') || str.includes('d') && !str.includes('month')) {
          n = Math.max(1, Math.round(n / 30));
        }
        if (n >= 1 && n <= 36) {
          return {
            months: n,
            label: n === 1 ? '1 Month' : `${n} Months`
          };
        }
      }
    }
  }

  // Tiered duration fallback based on fee brackets
  // E.g. Standard 1 month medicine/follow-up is ~1000 - 1500, 2 months is ~2000, 3 months is ~3000
  if (totalFee <= 1500) return { months: 1, label: '1 Month' };
  if (totalFee <= 2500) return { months: 2, label: '2 Months' };
  if (totalFee <= 4500) return { months: 3, label: '3 Months' };
  if (totalFee <= 7500) return { months: 6, label: '6 Months' };
  return { months: 12, label: '12 Months' };
};

const normalizeToYMD = (raw: any): string => {
  if (!raw) return '';
  let val = raw;
  if (typeof val === 'object') {
    if (typeof val.toDate === 'function') val = val.toDate();
    else if (typeof val.seconds === 'number') val = new Date(val.seconds * 1000);
  }
  if (val instanceof Date) {
    if (!isNaN(val.getTime())) {
      const y = val.getFullYear();
      const m = String(val.getMonth() + 1).padStart(2, '0');
      const d = String(val.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    return '';
  }
  const str = String(val).trim();
  if (!str || str === '[object Object]') return '';
  const isoMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
  const ddmmyyyyMatch = str.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  if (ddmmyyyyMatch) return `${ddmmyyyyMatch[3]}-${ddmmyyyyMatch[2].padStart(2, '0')}-${ddmmyyyyMatch[1].padStart(2, '0')}`;
  return '';
};

export interface AveragePatientAnalyticsPageProps {
  liveTransactions?: any[];
}

export const AveragePatientAnalyticsPage: React.FC<AveragePatientAnalyticsPageProps> = ({ liveTransactions }) => {
  const [cachedTransactions, setCachedTransactions] = useState<any[]>(() => {
    try {
      const cached = localStorage.getItem('sph_revenue_cached_records_v6');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (_) {}
    try {
      const pool = receptionDataStore.getAllCollectionsPool();
      if (pool && pool.length > 0) return pool;
      return receptionDataStore.getAppointments() || [];
    } catch (_) {}
    return [];
  });

  useEffect(() => {
    try {
      receptionDataStore.startListeners();
    } catch (_) {}

    const unsub = receptionDataStore.subscribe((state) => {
      if (state.allCollectionsPool && state.allCollectionsPool.length > 0) {
        setCachedTransactions(state.allCollectionsPool);
      } else if (state.appointments && state.appointments.length > 0) {
        setCachedTransactions(state.appointments);
      }
    });

    return () => unsub();
  }, []);

  const effectiveTransactions = useMemo(() => {
    if (liveTransactions && liveTransactions.length > 0) return liveTransactions;
    if (cachedTransactions && cachedTransactions.length > 0) return cachedTransactions;
    return [];
  }, [liveTransactions, cachedTransactions]);
  // Live Raw Collection Data
  const [colDocs, setColDocs] = useState<Record<string, any[]>>({});
  const [isLoading, setIsLoading] = useState(true);

  // Filters State
  const [selectedBranch, setSelectedBranch] = useState<string>('all');
  const [selectedDuration, setSelectedDuration] = useState<string>('all');
  const [selectedTimeframe, setSelectedTimeframe] = useState<'this_month' | 'last_month' | 'last_3_months' | 'all'>('this_month');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  // Today string YYYY-MM
  const currentMonthPrefix = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  const lastMonthPrefix = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  // Listen to the 5 Core Firestore Collections
  useEffect(() => {
    if (!db) return;
    const collections = ['alltransactions', 'allpatients', 'patients', 'appointments', 'nutrition_plans'];
    const unsubs: Array<() => void> = [];

    collections.forEach((colName) => {
      try {
        const unsub = onSnapshot(
          collection(db, colName),
          (snap) => {
            const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            setColDocs((prev) => ({ ...prev, [colName]: docs }));
            setIsLoading(false);
          },
          (err) => {
            console.warn(`AveragePatientAnalyticsPage notice for ${colName}:`, err);
            setIsLoading(false);
          }
        );
        unsubs.push(unsub);
      } catch (e) {
        console.warn(`AveragePatientAnalyticsPage setup notice:`, e);
      }
    });

    return () => unsubs.forEach((u) => u());
  }, []);

  // Pre-Index Metadata & Consolidate Unique Patient Treatment Records
  const allPatientRecords = useMemo(() => {
    const allTxnDocs = colDocs['alltransactions'] || [];
    const allPatientDocs = colDocs['allpatients'] || [];
    const patientDocs = colDocs['patients'] || [];
    const appointmentDocs = colDocs['appointments'] || [];
    const nutritionDocs = colDocs['nutrition_plans'] || [];

    // Pre-index patient metadata
    const patientRegIdMap = new Map<string, string>();
    const patientSourceMap = new Map<string, string>();

    const scanDocForMeta = (doc: any) => {
      if (!doc) return;
      const cleanReg = extractCleanRegId(doc);
      const phone = String(doc.phoneNumber || doc.phone || doc.mobile || '').replace(/\D/g, '').slice(-10);
      const docId = String(doc.id || '').trim();
      const name = String(doc.patientName || doc.name || doc.fullName || '').toLowerCase().trim();

      if (cleanReg) {
        if (docId) patientRegIdMap.set(docId, cleanReg);
        if (phone) patientRegIdMap.set(phone, cleanReg);
        if (doc.patientId && !isFirestoreAutoId(doc.patientId)) patientRegIdMap.set(doc.patientId, cleanReg);
        if (name) patientRegIdMap.set(name, cleanReg);
      }

      const src = cleanPatientSource(doc.marketingSource || doc.source || doc.patientSource || doc.leadSource);
      if (src) {
        if (phone) patientSourceMap.set(phone, src);
        if (cleanReg) patientSourceMap.set(cleanReg.toLowerCase(), src);
        if (docId) patientSourceMap.set(docId, src);
        if (name) patientSourceMap.set(name, src);
      }
    };

    allPatientDocs.forEach(scanDocForMeta);
    patientDocs.forEach(scanDocForMeta);
    appointmentDocs.forEach(scanDocForMeta);

    // Grouping by unique patient identifier (Phone or Reg ID)
    const patientGroups = new Map<string, PatientAverageRecord>();
    const seenTxnIds = new Set<string>();

    const processItem = (item: any, defaultSource: string = 'Walk-in') => {
      if (!item) return;
      if (item.id && seenTxnIds.has(item.id)) return;
      if (item.id) seenTxnIds.add(String(item.id));

      const rawDate = item.timestamp || item.date || item.createdAt || item.paymentCollectedAt || item.appointmentDate;
      const ymd = normalizeToYMD(rawDate);
      const phone = String(item.phone || item.phoneNumber || item.mobile || '').replace(/\D/g, '').slice(-10);

      // Resolve Reg ID
      let resolvedRegId = extractCleanRegId(item);
      if (!resolvedRegId) {
        if (item.patientId && patientRegIdMap.has(item.patientId)) resolvedRegId = patientRegIdMap.get(item.patientId)!;
        else if (item.patientDocId && patientRegIdMap.has(item.patientDocId)) resolvedRegId = patientRegIdMap.get(item.patientDocId)!;
        else if (phone && patientRegIdMap.has(phone)) resolvedRegId = patientRegIdMap.get(phone)!;
      }
      const bKey = mapBranchKey(item.branchName || item.branchId || item.branch);
      if (!resolvedRegId || isFirestoreAutoId(resolvedRegId)) {
        resolvedRegId = phone ? `863rk/${bKey.slice(0, 3)}` : `SPH-${bKey.toUpperCase().slice(0, 3)}-001`;
      }

      const patientName = String(item.patientName || item.name || item.fullName || 'Patient');
      const docName = cleanDoctorName(item.doctorName || item.doctor || item.doctorTreated);

      const cFee = extractNum(item.consultationFee) || extractNum(item.itemsPaid?.consultation);
      const mFee = extractNum(item.medicineFee) || extractNum(item.itemsPaid?.medicine);
      const pFee = extractNum(item.packageFee) || extractNum(item.itemsPaid?.package);
      const totalFee = extractNum(item.amount) || extractNum(item.totalAmount) || extractNum(item.paidAmount) || extractNum(item.totalPaid) || (cFee + mFee + pFee);

      if (totalFee <= 0 && !item.patientName) return;

      const durationInfo = parseDurationInMonths(item, totalFee);

      // Resolve Source
      let accurateSource = cleanPatientSource(item.marketingSource || item.source || item.patientSource || item.leadSource);
      if (!accurateSource || accurateSource === 'Walk-in') {
        if (phone && patientSourceMap.has(phone)) accurateSource = patientSourceMap.get(phone)!;
        else if (resolvedRegId && patientSourceMap.has(resolvedRegId.toLowerCase())) accurateSource = patientSourceMap.get(resolvedRegId.toLowerCase())!;
        else accurateSource = defaultSource;
      }

      const patientKey = phone || resolvedRegId.toLowerCase() || patientName.toLowerCase();

      if (patientGroups.has(patientKey)) {
        // Accumulate for existing patient
        const existing = patientGroups.get(patientKey)!;
        existing.totalFeePaid += totalFee;
        existing.treatmentMonths += durationInfo.months;
        existing.durationLabel = `${existing.treatmentMonths} Months`;
        existing.monthlyFee = Math.round(existing.totalFeePaid / existing.treatmentMonths);
      } else {
        // Create new patient record
        const rec: PatientAverageRecord = {
          id: item.id || `PAT-${Math.random().toString(36).substr(2, 6)}`,
          patientId: resolvedRegId,
          patientName,
          phone,
          branchName: mapBranchFullName(bKey),
          branchKey: bKey,
          doctorName: docName,
          treatmentMonths: durationInfo.months,
          durationLabel: durationInfo.label,
          totalFeePaid: totalFee,
          monthlyFee: Math.round(totalFee / durationInfo.months),
          source: accurateSource,
          paymentMethod: String(item.paymentMethod || item.method || 'upi').toUpperCase(),
          date: ymd || currentMonthPrefix + '-01',
          timestamp: ymd,
          status: 'PAID'
        };
        patientGroups.set(patientKey, rec);
      }
    };

    if (effectiveTransactions.length > 0) {
      effectiveTransactions.forEach((t) => processItem(t, 'Walk-in'));
    } else {
      allTxnDocs.forEach((t) => processItem(t, 'Walk-in'));
      allPatientDocs.forEach((p) => processItem(p, 'Old Patient'));
      appointmentDocs.forEach((a) => processItem(a, 'Walk-in'));
      nutritionDocs.forEach((n) => processItem(n, 'Diet Plan'));
    }

    return Array.from(patientGroups.values());
  }, [colDocs, currentMonthPrefix, effectiveTransactions]);

  // Filtered Patient Records
  const filteredRecords = useMemo(() => {
    return allPatientRecords.filter((rec) => {
      // 1. Branch filter
      if (selectedBranch !== 'all' && rec.branchKey !== selectedBranch) return false;

      // 2. Duration filter
      if (selectedDuration !== 'all') {
        const durNum = parseInt(selectedDuration, 10);
        if (durNum === 12 && rec.treatmentMonths < 12) return false;
        if (durNum !== 12 && rec.treatmentMonths !== durNum) return false;
      }

      // 3. Timeframe filter
      if (selectedTimeframe === 'this_month') {
        if (!rec.date.startsWith(currentMonthPrefix)) return false;
      } else if (selectedTimeframe === 'last_month') {
        if (!rec.date.startsWith(lastMonthPrefix)) return false;
      } else if (selectedTimeframe === 'last_3_months') {
        const d = new Date();
        d.setMonth(d.getMonth() - 2);
        const threeMoPrefix = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (rec.date < threeMoPrefix) return false;
      }

      // 4. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = rec.patientName.toLowerCase().includes(q);
        const matchesPhone = rec.phone.includes(q);
        const matchesReg = rec.patientId.toLowerCase().includes(q);
        const matchesDoc = rec.doctorName.toLowerCase().includes(q);
        if (!matchesName && !matchesPhone && !matchesReg && !matchesDoc) return false;
      }

      return true;
    });
  }, [allPatientRecords, selectedBranch, selectedDuration, selectedTimeframe, searchQuery, currentMonthPrefix, lastMonthPrefix]);

  // --- Core Clinic-Wide & Branch-Wise Summary Calculations ---
  // Formula per User Spec:
  // Patient A: 1 mo, 1000
  // Patient B: 2 mo, 2000
  // Patient C: 3 mo, 3000
  // Total Patients = 3
  // Total Months = 1 + 2 + 3 = 6
  // Avg Duration = 6 / 3 = 2.0 Months
  // Total Revenue = 6000
  // ARPU (Avg Revenue per Patient) = 6000 / 3 = ₹2000
  // Avg Realized Revenue / Month = 6000 / 6 = ₹1000 / month
  const clinicSummary = useMemo(() => {
    const list = filteredRecords;
    const totalPatients = list.length;
    const totalRevenue = list.reduce((acc, r) => acc + r.totalFeePaid, 0);
    const totalTreatmentMonths = list.reduce((acc, r) => acc + r.treatmentMonths, 0);

    const avgDurationMonths = totalPatients > 0 ? totalTreatmentMonths / totalPatients : 0;
    const avgRevenuePerPatient = totalPatients > 0 ? totalRevenue / totalPatients : 0;
    const avgMonthlyRealization = totalTreatmentMonths > 0 ? totalRevenue / totalTreatmentMonths : 0;

    return {
      totalPatients,
      totalRevenue,
      totalTreatmentMonths,
      avgDurationMonths,
      avgRevenuePerPatient,
      avgMonthlyRealization
    };
  }, [filteredRecords]);

  // Branch-Wise Performance Matrix
  const branchSummaries: BranchAverageSummary[] = useMemo(() => {
    return FOUR_BRANCHES.map((b) => {
      const branchPatients = filteredRecords.filter((r) => r.branchKey === b.id);
      const patientCount = branchPatients.length;
      const totalRevenue = branchPatients.reduce((acc, r) => acc + r.totalFeePaid, 0);
      const totalTreatmentMonths = branchPatients.reduce((acc, r) => acc + r.treatmentMonths, 0);

      const avgDurationMonths = patientCount > 0 ? totalTreatmentMonths / patientCount : 0;
      const avgRevenuePerPatient = patientCount > 0 ? Math.round(totalRevenue / patientCount) : 0;
      const avgMonthlyRealization = totalTreatmentMonths > 0 ? Math.round(totalRevenue / totalTreatmentMonths) : 0;

      const cohorts = {
        m1: branchPatients.filter((r) => r.treatmentMonths === 1).length,
        m2: branchPatients.filter((r) => r.treatmentMonths === 2).length,
        m3: branchPatients.filter((r) => r.treatmentMonths === 3).length,
        m6: branchPatients.filter((r) => r.treatmentMonths === 6).length,
        m12: branchPatients.filter((r) => r.treatmentMonths >= 12).length
      };

      return {
        branchKey: b.id,
        branchName: b.name,
        shortName: b.short,
        color: b.color,
        patientCount,
        totalRevenue,
        totalTreatmentMonths,
        avgDurationMonths,
        avgRevenuePerPatient,
        avgMonthlyRealization,
        cohorts
      };
    });
  }, [filteredRecords]);

  // Top Performing Branch by ARPU
  const leadingBranch = useMemo(() => {
    const sorted = [...branchSummaries].sort((a, b) => b.avgRevenuePerPatient - a.avgRevenuePerPatient);
    return sorted[0] || branchSummaries[0];
  }, [branchSummaries]);

  // Duration Cohort Overall Breakdown
  const durationCohorts = useMemo(() => {
    const total = filteredRecords.length || 1;
    const cohorts = [
      { key: '1', label: '1 Month Follow-up', months: 1, count: 0, revenue: 0, color: '#3b82f6' },
      { key: '2', label: '2 Months Course', months: 2, count: 0, revenue: 0, color: '#10b981' },
      { key: '3', label: '3 Months Package', months: 3, count: 0, revenue: 0, color: '#f59e0b' },
      { key: '6', label: '6 Months Care', months: 6, count: 0, revenue: 0, color: '#8b5cf6' },
      { key: '12', label: '12 Months Annual', months: 12, count: 0, revenue: 0, color: '#ec4899' }
    ];

    filteredRecords.forEach((r) => {
      if (r.treatmentMonths === 1) { cohorts[0].count += 1; cohorts[0].revenue += r.totalFeePaid; }
      else if (r.treatmentMonths === 2) { cohorts[1].count += 1; cohorts[1].revenue += r.totalFeePaid; }
      else if (r.treatmentMonths === 3) { cohorts[2].count += 1; cohorts[2].revenue += r.totalFeePaid; }
      else if (r.treatmentMonths === 6) { cohorts[3].count += 1; cohorts[3].revenue += r.totalFeePaid; }
      else if (r.treatmentMonths >= 12) { cohorts[4].count += 1; cohorts[4].revenue += r.totalFeePaid; }
      else { cohorts[0].count += 1; cohorts[0].revenue += r.totalFeePaid; }
    });

    return cohorts.map((c) => ({
      ...c,
      pct: (c.count / total) * 100
    }));
  }, [filteredRecords]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / rowsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * rowsPerPage;
  const paginatedRecords = filteredRecords.slice(startIndex, startIndex + rowsPerPage);

  // Export CSV
  const handleExportCSV = () => {
    const headers = [
      'S.No',
      'Reg ID',
      'Patient Name',
      'Phone',
      'Branch',
      'Doctor Treated',
      'Treatment Duration (Months)',
      'Total Fee Paid (INR)',
      'Normalized Monthly Fee (INR/mo)',
      'Source',
      'Date'
    ];
    const rows = filteredRecords.map((r, i) => [
      i + 1,
      r.patientId,
      `"${r.patientName.replace(/"/g, '""')}"`,
      r.phone,
      `"${r.branchName}"`,
      `"${r.doctorName}"`,
      r.treatmentMonths,
      r.totalFeePaid,
      r.monthlyFee,
      r.source,
      r.date
    ]);

    const csvContent = [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `SPH_Average_Patient_Analytics_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div style={{ padding: '16px', maxWidth: '1600px', width: '100%', margin: '0 auto', fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* Header Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ background: '#eff6ff', padding: '9px', borderRadius: '12px', color: '#2563eb' }}>
            <Calculator size={22} />
          </div>
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.3px' }}>
              Average Patient & Treatment Duration Analytics
            </h1>
            <p style={{ fontSize: '11px', color: '#64748b', margin: '2px 0 0 0', fontWeight: 500 }}>
              Branch-by-branch ARPU (Average Revenue per Patient), treatment duration realization, and cohort velocity
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={handleExportCSV}
            style={{
              padding: '6px 12px',
              borderRadius: '8px',
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#334155',
              fontSize: '11px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
            }}
          >
            <Download size={13} /> Export Ledger
          </button>
        </div>
      </div>

      {/* 4 CORE EXECUTIVE ARPU & DURATION KPI CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px', marginBottom: '16px' }}>

        {/* Card 1: Average Revenue Per Patient (ARPU) */}
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              Average Revenue / Patient (ARPU)
            </span>
            <div style={{ background: '#dcfce7', padding: '5px', borderRadius: '6px', color: '#16a34a' }}>
              <IndianRupee size={14} />
            </div>
          </div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: '#0f172a', marginTop: '6px', letterSpacing: '-0.4px' }}>
            ₹{Math.round(clinicSummary.avgRevenuePerPatient).toLocaleString('en-IN')}
          </div>
          <div style={{ fontSize: '10.5px', fontWeight: 600, color: '#64748b', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#16a34a' }}></span>
            From {clinicSummary.totalPatients} Unique Treated Patients
          </div>
        </div>

        {/* Card 2: Average Treatment Duration (Months / Patient) */}
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              Average Treatment Duration
            </span>
            <div style={{ background: '#eff6ff', padding: '5px', borderRadius: '6px', color: '#2563eb' }}>
              <Clock size={14} />
            </div>
          </div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: '#1d4ed8', marginTop: '6px', letterSpacing: '-0.4px' }}>
            {clinicSummary.avgDurationMonths.toFixed(1)} <span style={{ fontSize: '14px', fontWeight: 700 }}>Months / Patient</span>
          </div>
          <div style={{ fontSize: '10.5px', fontWeight: 600, color: '#64748b', marginTop: '6px' }}>
            {clinicSummary.totalTreatmentMonths} Total Patient Course Months (Σ Months ÷ N)
          </div>
        </div>

        {/* Card 3: Normalized Monthly Revenue Velocity */}
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              Average Monthly Realization
            </span>
            <div style={{ background: '#fef3c7', padding: '5px', borderRadius: '6px', color: '#d97706' }}>
              <TrendingUp size={14} />
            </div>
          </div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: '#b45309', marginTop: '6px', letterSpacing: '-0.4px' }}>
            ₹{Math.round(clinicSummary.avgMonthlyRealization).toLocaleString('en-IN')} <span style={{ fontSize: '13px', fontWeight: 700 }}>/ Month</span>
          </div>
          <div style={{ fontSize: '10.5px', fontWeight: 600, color: '#64748b', marginTop: '6px' }}>
            Amortized monthly revenue realization per patient
          </div>
        </div>

        {/* Card 4: Top Performing Branch by ARPU */}
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              Leading Branch (Highest ARPU)
            </span>
            <div style={{ background: '#f3e8ff', padding: '5px', borderRadius: '6px', color: '#7e22ce' }}>
              <Building2 size={14} />
            </div>
          </div>
          <div style={{ fontSize: '19px', fontWeight: 900, color: '#0f172a', marginTop: '6px' }}>
            {leadingBranch.branchName}
          </div>
          <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#7e22ce', marginTop: '6px' }}>
            ₹{leadingBranch.avgRevenuePerPatient.toLocaleString('en-IN')} ARPU · {leadingBranch.avgDurationMonths.toFixed(1)} Mos Avg
          </div>
        </div>

      </div>

      {/* BRANCH-WISE AVERAGE ANALYSIS COMPARISON LEDGER (USER SPECIFICATION) */}
      <div style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '12px',
        overflow: 'hidden',
        marginBottom: '16px',
        boxShadow: '0 1px 4px rgba(0,0,0,0.02)'
      }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
          <div>
            <span style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>
              Branch-by-Branch Average Performance Matrix
            </span>
            <p style={{ fontSize: '10.5px', color: '#64748b', margin: '2px 0 0 0' }}>
              Comparison of unique patient count, total treatment months, average duration per patient, and ARPU across branches
            </p>
          </div>
          <span style={{ fontSize: '9.5px', fontWeight: 800, color: '#2563eb', background: '#eff6ff', padding: '3px 8px', borderRadius: '6px' }}>
            Branch Benchmark
          </span>
        </div>

        <div style={{ overflowX: 'auto', width: '100%' }}>
          <table style={{ width: '100%', minWidth: '850px', borderCollapse: 'collapse', textAlign: 'left', fontSize: '11px' }}>
            <thead>
              <tr style={{ background: '#ffffff', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: '9.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                <th style={{ padding: '10px 14px' }}>Branch</th>
                <th style={{ padding: '10px 14px' }}>Treated Patients</th>
                <th style={{ padding: '10px 14px' }}>Total Revenue</th>
                <th style={{ padding: '10px 14px' }}>Total Months</th>
                <th style={{ padding: '10px 14px', color: '#1d4ed8' }}>Avg Duration (Months/Pt)</th>
                <th style={{ padding: '10px 14px', color: '#16a34a' }}>Avg Revenue / Patient (ARPU)</th>
                <th style={{ padding: '10px 14px', textAlign: 'right' }}>Monthly Rate (₹/Mo)</th>
              </tr>
            </thead>
            <tbody>
              {branchSummaries.map((b, idx) => (
                <tr key={b.branchKey} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? '#ffffff' : '#fafafa' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 700, color: '#0f172a' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: b.color }}></span>
                      {b.branchName}
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px', color: '#334155', fontWeight: 600 }}>
                    {b.patientCount} patients
                  </td>
                  <td style={{ padding: '10px 14px', color: '#0f172a', fontWeight: 800 }}>
                    ₹{b.totalRevenue.toLocaleString('en-IN')}
                  </td>
                  <td style={{ padding: '10px 14px', color: '#475569', fontWeight: 600 }}>
                    {b.totalTreatmentMonths} mos
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ background: '#eff6ff', color: '#1d4ed8', padding: '3px 8px', borderRadius: '6px', fontWeight: 800, fontSize: '10px' }}>
                      {b.avgDurationMonths.toFixed(1)} Months
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ background: '#dcfce7', color: '#15803d', padding: '3px 8px', borderRadius: '6px', fontWeight: 800, fontSize: '10.5px' }}>
                      ₹{b.avgRevenuePerPatient.toLocaleString('en-IN')}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px', color: '#b45309', fontWeight: 700, textAlign: 'right' }}>
                    ₹{b.avgMonthlyRealization.toLocaleString('en-IN')} /mo
                  </td>
                </tr>
              ))}
              {/* Consolidated All Branches Row */}
              <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0', fontWeight: 800 }}>
                <td style={{ padding: '11px 14px', color: '#0f172a' }}>
                  🏥 All Branches Consolidated
                </td>
                <td style={{ padding: '11px 14px', color: '#0f172a' }}>
                  {clinicSummary.totalPatients} patients
                </td>
                <td style={{ padding: '11px 14px', color: '#0f172a', fontSize: '12px' }}>
                  ₹{clinicSummary.totalRevenue.toLocaleString('en-IN')}
                </td>
                <td style={{ padding: '11px 14px', color: '#0f172a' }}>
                  {clinicSummary.totalTreatmentMonths} mos
                </td>
                <td style={{ padding: '11px 14px' }}>
                  <span style={{ background: '#dbeafe', color: '#1e40af', padding: '3px 8px', borderRadius: '6px', fontWeight: 900 }}>
                    {clinicSummary.avgDurationMonths.toFixed(1)} Months
                  </span>
                </td>
                <td style={{ padding: '11px 14px' }}>
                  <span style={{ background: '#bbf7d0', color: '#14532d', padding: '3px 8px', borderRadius: '6px', fontWeight: 900, fontSize: '11px' }}>
                    ₹{Math.round(clinicSummary.avgRevenuePerPatient).toLocaleString('en-IN')}
                  </span>
                </td>
                <td style={{ padding: '11px 14px', color: '#b45309', textAlign: 'right' }}>
                  ₹{Math.round(clinicSummary.avgMonthlyRealization).toLocaleString('en-IN')} /mo
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* FORMULA & CALCULATION REFERENCE GUIDE (USER SPECIFICATION) */}
        <div style={{
          padding: '12px 16px',
          borderTop: '1px solid #f1f5f9',
          background: '#f8fafc'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              📐 Calculation Formulas & Metric Definitions
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '10px' }}>

            {/* Formula 1: Treated Patients */}
            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '9px 12px' }}>
              <div style={{ fontSize: '10px', fontWeight: 800, color: '#334155' }}>
                👥 Treated Patients
              </div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#2563eb', marginTop: '3px', fontFamily: 'monospace' }}>
                Count(Unique Patients)
              </div>
              <p style={{ fontSize: '9.5px', color: '#64748b', margin: '3px 0 0 0' }}>
                Total unique patients who booked and received treatment at the branch
              </p>
            </div>

            {/* Formula 2: Total Revenue */}
            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '9px 12px' }}>
              <div style={{ fontSize: '10px', fontWeight: 800, color: '#334155' }}>
                💰 Total Revenue
              </div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#16a34a', marginTop: '3px', fontFamily: 'monospace' }}>
                Σ (Total Fee Paid)
              </div>
              <p style={{ fontSize: '9.5px', color: '#64748b', margin: '3px 0 0 0' }}>
                Sum of consultation, medicine, and package fees collected
              </p>
            </div>

            {/* Formula 3: Total Months */}
            <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '9px 12px' }}>
              <div style={{ fontSize: '10px', fontWeight: 800, color: '#334155' }}>
                📅 Total Months
              </div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#7c3aed', marginTop: '3px', fontFamily: 'monospace' }}>
                Σ (Duration in Months)
              </div>
              <p style={{ fontSize: '9.5px', color: '#64748b', margin: '3px 0 0 0' }}>
                Cumulative course & follow-up duration (1 mo + 2 mos + 3 mos...)
              </p>
            </div>

            {/* Formula 4: Avg Duration (Months/Pt) */}
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '9px 12px' }}>
              <div style={{ fontSize: '10px', fontWeight: 800, color: '#1e40af' }}>
                ⏱️ Avg Duration (Months/Pt)
              </div>
              <div style={{ fontSize: '11px', fontWeight: 800, color: '#1d4ed8', marginTop: '3px', fontFamily: 'monospace' }}>
                Total Months ÷ Treated Patients
              </div>
              <p style={{ fontSize: '9.5px', color: '#3b82f6', margin: '3px 0 0 0', fontWeight: 600 }}>
                e.g. (1 + 2 + 3) ÷ 3 = 2.0 Months per Patient
              </p>
            </div>

            {/* Formula 5: Avg Revenue / Patient (ARPU) */}
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '9px 12px' }}>
              <div style={{ fontSize: '10px', fontWeight: 800, color: '#166534' }}>
                💎 Avg Revenue / Patient (ARPU)
              </div>
              <div style={{ fontSize: '11px', fontWeight: 800, color: '#15803d', marginTop: '3px', fontFamily: 'monospace' }}>
                Total Revenue ÷ Treated Patients
              </div>
              <p style={{ fontSize: '9.5px', color: '#16a34a', margin: '3px 0 0 0', fontWeight: 600 }}>
                e.g. (₹1,000 + ₹2,000 + ₹3,000) ÷ 3 = ₹2,000 / Pt
              </p>
            </div>

            {/* Formula 6: Monthly Rate (₹/Mo) */}
            <div style={{ background: '#fefce8', border: '1px solid #fef08a', borderRadius: '8px', padding: '9px 12px' }}>
              <div style={{ fontSize: '10px', fontWeight: 800, color: '#854d0e' }}>
                📈 Monthly Rate (₹/Mo)
              </div>
              <div style={{ fontSize: '11px', fontWeight: 800, color: '#b45309', marginTop: '3px', fontFamily: 'monospace' }}>
                Total Revenue ÷ Total Months
              </div>
              <p style={{ fontSize: '9.5px', color: '#d97706', margin: '3px 0 0 0', fontWeight: 600 }}>
                e.g. ₹6,000 ÷ 6 Mos = ₹1,000 / Month Realization
              </p>
            </div>

          </div>
        </div>
      </div>

      {/* COHORT BREAKDOWN CARDS (1 Month, 2 Months, 3 Months, 6 Months, 12 Months) */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ fontSize: '12px', fontWeight: 800, color: '#334155' }}>
            Treatment Duration Cohorts (Patient Retention & Course Distribution)
          </span>
          <span style={{ fontSize: '10.5px', color: '#64748b' }}>
            Showing distribution of patients by duration of care
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
          {durationCohorts.map((c) => (
            <div
              key={c.key}
              onClick={() => setSelectedDuration(selectedDuration === c.key ? 'all' : c.key)}
              style={{
                background: selectedDuration === c.key ? '#f0fdf4' : '#ffffff',
                border: selectedDuration === c.key ? '1.5px solid #16a34a' : '1px solid #e2e8f0',
                borderRadius: '10px',
                padding: '12px 14px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#1e293b' }}>
                  {c.label}
                </span>
                <span style={{ fontSize: '9.5px', fontWeight: 800, color: c.color, background: '#f8fafc', padding: '1px 6px', borderRadius: '4px' }}>
                  {c.pct.toFixed(1)}%
                </span>
              </div>
              <div style={{ fontSize: '16px', fontWeight: 900, color: '#0f172a' }}>
                {c.count} <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Patients</span>
              </div>
              <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#475569', marginTop: '4px' }}>
                ₹{c.revenue.toLocaleString('en-IN')} Total Fee
              </div>
              <div style={{ width: '100%', height: '4px', background: '#f1f5f9', borderRadius: '2px', marginTop: '8px', overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(100, Math.max(5, c.pct))}%`, height: '100%', background: c.color, borderRadius: '2px' }}></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* FILTER CONTROLS BAR */}
      <div style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '12px',
        padding: '12px 16px',
        marginBottom: '14px',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '12px',
        alignItems: 'flex-end',
        boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
      }}>
        {/* Search */}
        <div style={{ flex: '1 1 200px', minWidth: '180px' }}>
          <label style={{ fontSize: '9.5px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '3px' }}>
            Search Patient
          </label>
          <div style={{ position: 'relative' }}>
            <Search size={13} style={{ position: 'absolute', left: '8px', top: '8px', color: '#94a3b8' }} />
            <input
              type="text"
              placeholder="Name, phone, reg id..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              style={{
                width: '100%',
                padding: '5px 8px 5px 26px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                fontSize: '11px',
                outline: 'none',
                background: '#ffffff'
              }}
            />
          </div>
        </div>

        {/* Branch Filter */}
        <div style={{ flex: '0 1 160px', minWidth: '140px' }}>
          <label style={{ fontSize: '9.5px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '3px' }}>
            Filter Branch
          </label>
          <select
            value={selectedBranch}
            onChange={(e) => { setSelectedBranch(e.target.value); setCurrentPage(1); }}
            style={{ width: '100%', padding: '5px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '11px', fontWeight: 600, background: '#ffffff', outline: 'none' }}
          >
            <option value="all">All Branches</option>
            <option value="kphb">KPHB Branch</option>
            <option value="nallagandla">Nallagandla Branch</option>
            <option value="chandanagar">Chandanagar Branch</option>
            <option value="dilshuknagar">Dilshuknagar Branch</option>
          </select>
        </div>

        {/* Duration Filter */}
        <div style={{ flex: '0 1 160px', minWidth: '140px' }}>
          <label style={{ fontSize: '9.5px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '3px' }}>
            Treatment Duration
          </label>
          <select
            value={selectedDuration}
            onChange={(e) => { setSelectedDuration(e.target.value); setCurrentPage(1); }}
            style={{ width: '100%', padding: '5px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '11px', fontWeight: 600, background: '#ffffff', outline: 'none' }}
          >
            <option value="all">All Durations</option>
            <option value="1">1 Month Course</option>
            <option value="2">2 Months Course</option>
            <option value="3">3 Months Course</option>
            <option value="6">6 Months Course</option>
            <option value="12">12 Months Annual</option>
          </select>
        </div>

        {/* Timeframe Filter */}
        <div style={{ flex: '0 1 160px', minWidth: '140px' }}>
          <label style={{ fontSize: '9.5px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '3px' }}>
            Timeframe
          </label>
          <select
            value={selectedTimeframe}
            onChange={(e) => { setSelectedTimeframe(e.target.value as any); setCurrentPage(1); }}
            style={{ width: '100%', padding: '5px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '11px', fontWeight: 600, background: '#ffffff', outline: 'none' }}
          >
            <option value="this_month">This Month</option>
            <option value="last_month">Last Month</option>
            <option value="all">All Time</option>
          </select>
        </div>

        {/* Reset */}
        <button
          onClick={() => {
            setSelectedBranch('all');
            setSelectedDuration('all');
            setSelectedTimeframe('this_month');
            setSearchQuery('');
            setCurrentPage(1);
          }}
          style={{
            padding: '5px 12px',
            borderRadius: '6px',
            border: '1px solid #cbd5e1',
            background: '#f8fafc',
            color: '#475569',
            fontSize: '11px',
            fontWeight: 700,
            cursor: 'pointer'
          }}
        >
          Reset Filters
        </button>
      </div>

      {/* DETAILED PATIENT ARPU LEDGER TABLE */}
      <div style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '12px',
        overflow: 'hidden',
        boxShadow: '0 1px 4px rgba(0,0,0,0.02)'
      }}>
        {/* Table Title Bar */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#ffffff', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>
              Patient Average Treatment Ledger
            </span>
            <span style={{ fontSize: '10px', fontWeight: 800, color: '#2563eb', background: '#eff6ff', padding: '2px 7px', borderRadius: '6px' }}>
              {filteredRecords.length} records
            </span>
          </div>

          <div style={{ fontSize: '10.5px', color: '#475569', fontWeight: 600 }}>
            Avg Duration: <b style={{ color: '#1d4ed8' }}>{clinicSummary.avgDurationMonths.toFixed(1)} Mos</b> · Avg ARPU: <b style={{ color: '#16a34a' }}>₹{Math.round(clinicSummary.avgRevenuePerPatient).toLocaleString('en-IN')}</b>
          </div>
        </div>

        {/* Table Content */}
        <div style={{ overflowX: 'auto', width: '100%' }}>
          <table style={{ width: '100%', minWidth: '950px', borderCollapse: 'collapse', textAlign: 'left', fontSize: '11px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: '9.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                <th style={{ padding: '9px 10px', width: '40px' }}>S.No</th>
                <th style={{ padding: '9px 10px' }}>Reg ID & Name</th>
                <th style={{ padding: '9px 10px' }}>Phone</th>
                <th style={{ padding: '9px 10px' }}>Branch</th>
                <th style={{ padding: '9px 10px' }}>Doctor Treated</th>
                <th style={{ padding: '9px 10px' }}>Duration (Months)</th>
                <th style={{ padding: '9px 10px' }}>Total Fee (₹)</th>
                <th style={{ padding: '9px 10px' }}>Monthly Rate (₹/mo)</th>
                <th style={{ padding: '9px 10px' }}>Source</th>
                <th style={{ padding: '9px 10px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {paginatedRecords.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ padding: '36px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>
                    No patient records matching current filters.
                  </td>
                </tr>
              ) : (
                paginatedRecords.map((r, idx) => (
                  <tr key={r.id} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? '#ffffff' : '#fafafa' }}>
                    <td style={{ padding: '8px 10px', color: '#64748b', fontWeight: 600 }}>
                      {startIndex + idx + 1}
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ color: '#0f172a', fontWeight: 700 }}>{r.patientName}</span>
                        <span style={{ color: '#258ec8', fontSize: '9.5px', fontWeight: 800 }}>{r.patientId}</span>
                      </div>
                    </td>
                    <td style={{ padding: '8px 10px', color: '#475569', fontSize: '10.5px' }}>
                      {r.phone || '-'}
                    </td>
                    <td style={{ padding: '8px 10px', color: '#334155', fontWeight: 600 }}>
                      {r.branchName}
                    </td>
                    <td style={{ padding: '8px 10px', color: '#475569' }}>
                      {r.doctorName}
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      <span style={{
                        background: r.treatmentMonths === 1 ? '#eff6ff' : r.treatmentMonths === 2 ? '#ecfdf5' : '#fffbeb',
                        color: r.treatmentMonths === 1 ? '#1d4ed8' : r.treatmentMonths === 2 ? '#059669' : '#d97706',
                        padding: '2px 7px',
                        borderRadius: '6px',
                        fontWeight: 800,
                        fontSize: '9.5px'
                      }}>
                        {r.durationLabel}
                      </span>
                    </td>
                    <td style={{ padding: '8px 10px', color: '#0f172a', fontWeight: 800, fontSize: '11.5px' }}>
                      ₹{r.totalFeePaid.toLocaleString('en-IN')}
                    </td>
                    <td style={{ padding: '8px 10px', color: '#16a34a', fontWeight: 800, fontSize: '11px' }}>
                      ₹{r.monthlyFee.toLocaleString('en-IN')}/mo
                    </td>
                    <td style={{ padding: '8px 10px', color: '#64748b', fontSize: '10.5px' }}>
                      {r.source}
                    </td>
                    <td style={{ padding: '8px 10px' }}>
                      <span style={{ background: '#dcfce7', color: '#15803d', padding: '2px 6px', borderRadius: '5px', fontSize: '9px', fontWeight: 800 }}>
                        PAID
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '11.5px', color: '#64748b' }}>
            <span>Rows per page:</span>
            <select
              value={rowsPerPage}
              onChange={(e) => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }}
              style={{ padding: '3px 6px', borderRadius: '5px', border: '1px solid #cbd5e1', fontSize: '11px', fontWeight: 700 }}
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span>
              Showing {filteredRecords.length === 0 ? 0 : startIndex + 1} to {Math.min(startIndex + rowsPerPage, filteredRecords.length)} of {filteredRecords.length} patients
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={safeCurrentPage <= 1}
              style={{ padding: '5px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', background: safeCurrentPage <= 1 ? '#f8fafc' : '#ffffff', color: safeCurrentPage <= 1 ? '#94a3b8' : '#0f172a', fontWeight: 700, fontSize: '11px', cursor: safeCurrentPage <= 1 ? 'not-allowed' : 'pointer' }}
            >
              Previous
            </button>
            <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#334155' }}>
              Page {safeCurrentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={safeCurrentPage >= totalPages}
              style={{ padding: '5px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', background: safeCurrentPage >= totalPages ? '#f8fafc' : '#ffffff', color: safeCurrentPage >= totalPages ? '#94a3b8' : '#0f172a', fontWeight: 700, fontSize: '11px', cursor: safeCurrentPage >= totalPages ? 'not-allowed' : 'pointer' }}
            >
              Next
            </button>
          </div>
        </div>

      </div>

    </div>
  );
};

export default AveragePatientAnalyticsPage;
