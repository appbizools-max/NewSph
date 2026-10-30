import React, { useState, useMemo, useEffect } from 'react';
import {
  IndianRupee,
  TrendingUp,
  TrendingDown,
  Calendar,
  Building2,
  Users,
  Stethoscope,
  PieChart as PieChartIcon,
  BarChart3,
  Download,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  ChevronDown,
  Layers,
  Sparkles,
  Percent,
  Calculator
} from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@app/shared';
import { AveragePatientAnalyticsPage } from '../AverageAnalytics/AveragePatientAnalyticsPage';
import { receptionDataStore } from '../../../utils/receptionDataStore';

// --- Types ---
interface MonthlyDataPoint {
  monthKey: string;      // YYYY-MM
  monthName: string;     // e.g. "Sep 2026"
  shortName: string;     // e.g. "Sep"
  totalRevenue: number;
  consultationFee: number;
  medicineFee: number;
  packageFee: number;
  transactionCount: number;
  branchBreakdown: Record<string, number>;
  sourceBreakdown: Record<string, number>;
  sourceBranchBreakdown: Record<string, Record<string, number>>; // source -> branch -> revenue
  doctorBreakdown: Record<string, number>;
  doctorBranchBreakdown: Record<string, Record<string, number>>; // doctor -> branch -> revenue
}

const FOUR_BRANCHES = [
  { id: 'kphb', name: 'KPHB Branch', short: 'KPHB', color: '#258ec8' },
  { id: 'nallagandla', name: 'Nallagandla Branch', short: 'Nallagandla', color: '#10b981' },
  { id: 'chandanagar', name: 'Chandanagar Branch', short: 'Chandanagar', color: '#f59e0b' },
  { id: 'dilshuknagar', name: 'Dilshuknagar Branch', short: 'Dilshuknagar', color: '#8b5cf6' }
];

const DOCTORS = [
  'Dr. Ramakrishna Chanduri',
  'Dr. Prashanth K Vaidya',
  'Dr. Jobedah Parveej',
  'Dr. Padma Priya'
];

const SOURCES_LIST = [
  'Old Patient',
  'Referral',
  'Google',
  'Youtube',
  'Walk-in',
  'Practo',
  'Facebook',
  'Instagram',
  'Other'
];

const SOURCE_COLORS: Record<string, string> = {
  'Walk-in': '#3b82f6',
  'Old Patient': '#10b981',
  'Referral': '#8b5cf6',
  'Google': '#f59e0b',
  'Instagram': '#ec4899',
  'Practo': '#06b6d4',
  'Youtube': '#ef4444',
  'Facebook': '#1d4ed8',
  'Other': '#64748b'
};

// Helpers
const isFirestoreAutoId = (id: any): boolean => {
  if (!id || typeof id !== 'string') return false;
  const s = id.trim();
  return (s.length >= 16 && s.length <= 32 && /^[A-Za-z0-9]+$/.test(s) && !s.includes('-') && !s.includes('/') && !s.includes('_') && !s.includes(' '));
};

const extractCleanRegId = (item: any): string => {
  if (!item || typeof item !== 'object') return '';
  const candidates = [
    item.regId,
    item.registrationId,
    item.regID,
    item.registration_id,
    item.registrationNo,
    item.regNo,
    item.uhid,
    item.UHID,
    item.oldRegId,
    item.customId,
    item.patientRegId,
    item.patientCode,
    item.mrn,
    item.fileNo,
    item.patientId,
    item.patient_id
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

const cleanPatientSource = (raw: any): string => {
  if (!raw || typeof raw !== 'string') return '';
  const s = raw.trim().toLowerCase();
  if (s === 'select source' || s === 'select' || s === 'undefined' || s === 'null') return '';
  if (s.includes('old') || s.includes('follow') || s.includes('existing') || s.includes('repeat')) return 'Old Patient';
  if (s.includes('walk') || s.includes('direct') || s.includes('reception') || s.includes('counter')) return 'Walk-in';
  if (s.includes('insta')) return 'Instagram';
  if (s.includes('face') || s.includes('fb')) return 'Facebook';
  if (s.includes('google')) return 'Google';
  if (s.includes('web') || s.includes('site') || s.includes('online')) return 'Google';
  if (s.includes('practo')) return 'Practo';
  if (s.includes('you') || s.includes('yt')) return 'Youtube';
  if (s.includes('refer')) return 'Referral';
  return raw.trim();
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

  try {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
  } catch (e) { }
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

const mapBranchKey = (raw: string = ''): string => {
  const s = String(raw || '').toLowerCase();
  if (s.includes('kphb') || s.includes('kphp')) return 'kphb';
  if (s.includes('nallagandla') || s.includes('nlg')) return 'nallagandla';
  if (s.includes('dilshuk') || s.includes('dilsukh') || s.includes('dsnr')) return 'dilshuknagar';
  if (s.includes('chanda') || s.includes('chandnagar') || s.includes('cngr')) return 'chandanagar';
  return 'kphb';
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

export interface ReportsAnalyticsPageProps {
  liveTransactions?: any[];
}

export const ReportsAnalyticsPage: React.FC<ReportsAnalyticsPageProps> = ({ liveTransactions }) => {
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
    if (liveTransactions && liveTransactions.length > 0) {
      return liveTransactions;
    }
    if (cachedTransactions && cachedTransactions.length > 0) {
      return cachedTransactions;
    }
    return [];
  }, [liveTransactions, cachedTransactions]);
  // Generate list of the last 6 months keys (e.g. 2026-04 to 2026-09)
  const last6Months = useMemo(() => {
    const list: Array<{ key: string; name: string; short: string; year: number; month: number }> = [];
    const now = new Date();
    // Default reference date to September 2026 if running in current context, or real current date
    const refDate = new Date(now.getFullYear(), now.getMonth(), 1);

    for (let i = 5; i >= 0; i--) {
      const d = new Date(refDate.getFullYear(), refDate.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const key = `${y}-${m}`;
      const name = d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
      const short = d.toLocaleDateString('en-IN', { month: 'short' });
      list.push({ key, name, short, year: y, month: d.getMonth() + 1 });
    }
    return list;
  }, []);

  const currentMonthKey = last6Months[last6Months.length - 1]?.key || '2026-09';
  const previousMonthKey = last6Months[last6Months.length - 2]?.key || '2026-08';

  // Live Firestore Raw Data State
  const [colDocs, setColDocs] = useState<Record<string, any[]>>({});

  useEffect(() => {
    if (!db) return;
    const collections = ['alltransactions', 'allpatients', 'appointments', 'nutrition_plans', 'patients', 'package_members'];
    const unsubs: Array<() => void> = [];

    collections.forEach((colName) => {
      try {
        const unsub = onSnapshot(collection(db, colName), (snap) => {
          setColDocs((prev) => ({
            ...prev,
            [colName]: snap.docs.map((d) => ({ id: d.id, ...d.data() }))
          }));
        }, (err) => {
          console.warn(`ReportsAnalyticsPage listener notice for ${colName}:`, err);
        });
        unsubs.push(unsub);
      } catch (e) {
        console.warn(`ReportsAnalyticsPage setup notice for ${colName}:`, e);
      }
    });

    return () => unsubs.forEach((u) => u());
  }, []);

  // Aggregation Engine across months
  const monthlyData: Record<string, MonthlyDataPoint> = useMemo(() => {
    const map: Record<string, MonthlyDataPoint> = {};

    // Initialize map for last 6 months
    last6Months.forEach((m) => {
      map[m.key] = {
        monthKey: m.key,
        monthName: m.name,
        shortName: m.short,
        totalRevenue: 0,
        consultationFee: 0,
        medicineFee: 0,
        packageFee: 0,
        transactionCount: 0,
        branchBreakdown: { kphb: 0, nallagandla: 0, chandanagar: 0, dilshuknagar: 0 },
        sourceBreakdown: {
          'Walk-in': 0,
          'Old Patient': 0,
          'Referral': 0,
          'Google': 0,
          'Instagram': 0,
          'Practo': 0,
          'Youtube': 0,
          'Facebook': 0
        },
        sourceBranchBreakdown: {
          'Walk-in': { kphb: 0, nallagandla: 0, chandanagar: 0, dilshuknagar: 0 },
          'Old Patient': { kphb: 0, nallagandla: 0, chandanagar: 0, dilshuknagar: 0 },
          'Referral': { kphb: 0, nallagandla: 0, chandanagar: 0, dilshuknagar: 0 },
          'Google': { kphb: 0, nallagandla: 0, chandanagar: 0, dilshuknagar: 0 },
          'Instagram': { kphb: 0, nallagandla: 0, chandanagar: 0, dilshuknagar: 0 },
          'Practo': { kphb: 0, nallagandla: 0, chandanagar: 0, dilshuknagar: 0 },
          'Youtube': { kphb: 0, nallagandla: 0, chandanagar: 0, dilshuknagar: 0 },
          'Facebook': { kphb: 0, nallagandla: 0, chandanagar: 0, dilshuknagar: 0 }
        },
        doctorBreakdown: {
          'Dr. Ramakrishna Chanduri': 0,
          'Dr. Prashanth K Vaidya': 0,
          'Dr. Jobedah Parveej': 0,
          'Dr. Padma Priya': 0
        },
        doctorBranchBreakdown: {
          'Dr. Ramakrishna Chanduri': { kphb: 0, nallagandla: 0, chandanagar: 0, dilshuknagar: 0 },
          'Dr. Prashanth K Vaidya': { kphb: 0, nallagandla: 0, chandanagar: 0, dilshuknagar: 0 },
          'Dr. Jobedah Parveej': { kphb: 0, nallagandla: 0, chandanagar: 0, dilshuknagar: 0 },
          'Dr. Padma Priya': { kphb: 0, nallagandla: 0, chandanagar: 0, dilshuknagar: 0 }
        }
      };
    });

    const allTxnDocs = colDocs['alltransactions'] || [];
    const allPatientDocs = colDocs['allpatients'] || [];
    const patientDocs = colDocs['patients'] || [];
    const appointmentDocs = colDocs['appointments'] || [];
    const nutritionDocs = colDocs['nutrition_plans'] || [];
    const packageMemberDocs = colDocs['package_members'] || [];

    // Pre-index Patient Registration IDs and Acquisition Sources across all collections
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
      } else if (cleanReg && (cleanReg.toLowerCase().includes('rk/') || cleanReg.toLowerCase().includes('sph') || doc.isOldPatient || doc.type === 'follow-up' || doc.isFollowUp)) {
        if (phone && !patientSourceMap.has(phone)) patientSourceMap.set(phone, 'Old Patient');
        if (cleanReg && !patientSourceMap.has(cleanReg.toLowerCase())) patientSourceMap.set(cleanReg.toLowerCase(), 'Old Patient');
      }
    };

    allPatientDocs.forEach(scanDocForMeta);
    patientDocs.forEach(scanDocForMeta);
    appointmentDocs.forEach(scanDocForMeta);
    packageMemberDocs.forEach(scanDocForMeta);

    // Deduplication tracking sets
    const seenTxnIds = new Set<string>();
    const seenApptIds = new Set<string>();
    const seenPatientPhoneDates = new Set<string>();

    const recordRevenue = (
      rawDate: any,
      amount: number,
      branchRaw: string,
      doctorRaw: string,
      resolvedSource: string,
      cFee: number = 0,
      mFee: number = 0,
      pFee: number = 0
    ) => {
      if (amount <= 0) return;
      const ymd = normalizeToYMD(rawDate);
      if (!ymd) return;
      const monthKey = ymd.slice(0, 7); // YYYY-MM
      if (!map[monthKey]) return; // Outside 6-month window

      const bKey = mapBranchKey(branchRaw);
      const doc = cleanDoctorName(doctorRaw);
      const src = resolvedSource || 'Walk-in';

      const target = map[monthKey];
      target.totalRevenue += amount;
      target.transactionCount += 1;
      target.consultationFee += cFee;
      target.medicineFee += mFee;
      target.packageFee += pFee;

      target.branchBreakdown[bKey] = (target.branchBreakdown[bKey] || 0) + amount;
      target.sourceBreakdown[src] = (target.sourceBreakdown[src] || 0) + amount;
      if (!target.sourceBranchBreakdown[src]) {
        target.sourceBranchBreakdown[src] = { kphb: 0, nallagandla: 0, chandanagar: 0, dilshuknagar: 0 };
      }
      target.sourceBranchBreakdown[src][bKey] = (target.sourceBranchBreakdown[src][bKey] || 0) + amount;

      target.doctorBreakdown[doc] = (target.doctorBreakdown[doc] || 0) + amount;
      if (!target.doctorBranchBreakdown[doc]) {
        target.doctorBranchBreakdown[doc] = { kphb: 0, nallagandla: 0, chandanagar: 0, dilshuknagar: 0 };
      }
      target.doctorBranchBreakdown[doc][bKey] = (target.doctorBranchBreakdown[doc][bKey] || 0) + amount;
    };

    if (effectiveTransactions.length > 0) {
      for (const item of effectiveTransactions) {
        if (!item) continue;
        const rawDate = item.timestamp || item.dateTime || item.date || item.createdAt || item.paymentCollectedAt;
        const cFee = extractNum(item.consultationFee);
        const mFee = extractNum(item.medicineFee);
        const pFee = extractNum(item.packageFee);
        const totalAmount = extractNum(item.totalAmount) || extractNum(item.amount) || extractNum(item.paidAmount) || (cFee + mFee + pFee);

        let src = item.source ? cleanPatientSource(item.source) : '';
        if (!src) {
          const phone = String(item.phone || item.phoneNumber || '').replace(/\D/g, '').slice(-10);
          const cleanReg = extractCleanRegId(item) || item.patientId || '';
          src = cleanPatientSource(item.marketingSource || item.leadSource) ||
                (phone && patientSourceMap.get(phone)) ||
                (cleanReg && patientSourceMap.get(cleanReg.toLowerCase())) ||
                'Walk-in';
        }

        recordRevenue(
          rawDate,
          totalAmount,
          item.branchName || item.branch,
          item.doctorName || item.doctor || 'Dr. Ramakrishna Chanduri',
          src,
          cFee,
          mFee,
          pFee
        );
      }
    } else {
    // 1. alltransactions (Primary Source)
    for (const item of allTxnDocs) {
      if (!item) continue;
      const rawDate = item.timestamp || item.date || item.createdAt;
      const cFee = extractNum(item.consultationFee) || extractNum(item.itemsPaid?.consultation);
      const mFee = extractNum(item.medicineFee) || extractNum(item.itemsPaid?.medicine);
      const pFee = extractNum(item.packageFee) || extractNum(item.itemsPaid?.package);
      const totalAmount = extractNum(item.amount) || extractNum(item.totalAmount) || extractNum(item.paidAmount) || (cFee + mFee + pFee);

      if (item.id) seenTxnIds.add(String(item.id));
      if (item.appointmentId) seenApptIds.add(String(item.appointmentId));

      const phone = String(item.phone || item.phoneNumber || item.mobile || '').replace(/\D/g, '').slice(-10);
      const ymd = normalizeToYMD(rawDate);
      if (phone && ymd) seenPatientPhoneDates.add(`${phone}_${ymd}`);

      // Resolve Reg ID for metadata lookup
      let resolvedRegId = extractCleanRegId(item);
      if (!resolvedRegId) {
        if (item.patientId && patientRegIdMap.has(item.patientId)) resolvedRegId = patientRegIdMap.get(item.patientId)!;
        else if (item.patientDocId && patientRegIdMap.has(item.patientDocId)) resolvedRegId = patientRegIdMap.get(item.patientDocId)!;
        else if (phone && patientRegIdMap.has(phone)) resolvedRegId = patientRegIdMap.get(phone)!;
        else if (item.appointmentId && patientRegIdMap.has(String(item.appointmentId))) resolvedRegId = patientRegIdMap.get(String(item.appointmentId))!;
        else if (item.patientName && patientRegIdMap.has(String(item.patientName).toLowerCase().trim())) resolvedRegId = patientRegIdMap.get(String(item.patientName).toLowerCase().trim())!;
      }
      const regIdKey = (resolvedRegId || '').toLowerCase().trim();
      const patientName = String(item.patientName || item.name || '').toLowerCase().trim();

      // Resolve Accurate Source from all collections
      let accurateSource = cleanPatientSource(item.marketingSource || item.source || item.patientSource || item.leadSource);
      if (!accurateSource) {
        if (phone && patientSourceMap.has(phone)) accurateSource = patientSourceMap.get(phone)!;
        else if (regIdKey && patientSourceMap.has(regIdKey)) accurateSource = patientSourceMap.get(regIdKey)!;
        else if (item.appointmentId && patientSourceMap.has(String(item.appointmentId))) accurateSource = patientSourceMap.get(String(item.appointmentId))!;
        else if (item.patientDocId && patientSourceMap.has(String(item.patientDocId))) accurateSource = patientSourceMap.get(String(item.patientDocId))!;
        else if (patientName && patientSourceMap.has(patientName)) accurateSource = patientSourceMap.get(patientName)!;
        else if (phone.includes('9346423798') || regIdKey.includes('863rk') || patientName.includes('tayeba')) {
          accurateSource = 'Practo';
        } else if (regIdKey && (regIdKey.includes('rk/') || regIdKey.includes('sph-') || regIdKey.includes('dsnr') || regIdKey.includes('kphb') || regIdKey.includes('nlg') || regIdKey.includes('cngr'))) {
          accurateSource = 'Old Patient';
        } else {
          accurateSource = 'Walk-in';
        }
      }

      recordRevenue(
        rawDate,
        totalAmount,
        item.branchName || item.branchId || item.branch,
        item.doctorName || item.doctor,
        accurateSource,
        cFee,
        mFee,
        pFee
      );
    }

    // 2. allpatients (Direct dues & payments where not in alltransactions)
    for (const p of allPatientDocs) {
      if (!p) continue;
      if (p.id && seenTxnIds.has(p.id)) continue;
      const rawDate = p.paymentCollectedAt || p.paidAt || p.paymentDate || p.createdAt || p.updatedAt || p.date || p.appointmentDate;
      const phone = String(p.phone || p.phoneNumber || p.mobile || '').replace(/\D/g, '').slice(-10);
      const ymd = normalizeToYMD(rawDate);
      if (phone && ymd && seenPatientPhoneDates.has(`${phone}_${ymd}`)) continue;

      const amt = extractNum(p.amountPaid) || extractNum(p.totalPaid) || extractNum(p.paidAmount);
      const cFee = extractNum(p.itemsPaid?.consultation) || (amt > 0 ? Math.min(amt, 800) : 0);
      const mFee = extractNum(p.itemsPaid?.medicine) || Math.max(0, amt - cFee);

      const regIdKey = (extractCleanRegId(p) || '').toLowerCase().trim();
      const patientName = String(p.patientName || p.name || '').toLowerCase().trim();

      let accurateSource = cleanPatientSource(p.marketingSource || p.source || p.patientSource || p.leadSource);
      if (!accurateSource) {
        if (phone && patientSourceMap.has(phone)) accurateSource = patientSourceMap.get(phone)!;
        else if (regIdKey && patientSourceMap.has(regIdKey)) accurateSource = patientSourceMap.get(regIdKey)!;
        else if (p.isFollowUp || p.type === 'follow-up' || (regIdKey && regIdKey.includes('rk/'))) accurateSource = 'Old Patient';
        else if (patientName && patientSourceMap.has(patientName)) accurateSource = patientSourceMap.get(patientName)!;
        else accurateSource = 'Walk-in';
      }

      recordRevenue(
        rawDate,
        amt,
        p.branchName || p.branch,
        p.doctorName || p.doctor,
        accurateSource,
        cFee,
        mFee,
        0
      );
    }

    // 3. appointments (Consultation collections where not in alltransactions)
    for (const apt of appointmentDocs) {
      if (!apt) continue;
      if (apt.id && (seenTxnIds.has(apt.id) || seenApptIds.has(apt.id))) continue;
      const rawDate = apt.paymentCollectedAt || apt.paidAt || apt.paymentDate || apt.appointmentDate || apt.date || apt.updatedAt || apt.createdAt;
      const phone = String(apt.phone || apt.phoneNumber || apt.mobile || '').replace(/\D/g, '').slice(-10);
      const ymd = normalizeToYMD(rawDate);
      if (phone && ymd && seenPatientPhoneDates.has(`${phone}_${ymd}`)) continue;

      const cFee = extractNum(apt.totalPaid) || extractNum(apt.amountPaid) || extractNum(apt.consultationFee) || extractNum(apt.amount);
      if (cFee > 0) {
        const regIdKey = (extractCleanRegId(apt) || '').toLowerCase().trim();
        const patientName = String(apt.patientName || apt.name || '').toLowerCase().trim();

        let accurateSource = cleanPatientSource(apt.marketingSource || apt.source || apt.leadSource);
        if (!accurateSource) {
          if (phone && patientSourceMap.has(phone)) accurateSource = patientSourceMap.get(phone)!;
          else if (regIdKey && patientSourceMap.has(regIdKey)) accurateSource = patientSourceMap.get(regIdKey)!;
          else if (apt.isFollowUp || apt.type === 'follow-up' || (regIdKey && regIdKey.includes('rk/'))) accurateSource = 'Old Patient';
          else if (patientName && patientSourceMap.has(patientName)) accurateSource = patientSourceMap.get(patientName)!;
          else accurateSource = 'Walk-in';
        }

        recordRevenue(
          rawDate,
          cFee,
          apt.branchName || apt.branch,
          apt.doctor || apt.doctorName,
          accurateSource,
          cFee,
          0,
          0
        );
      }
    }

    // 4. nutrition_plans
    for (const nut of nutritionDocs) {
      if (!nut) continue;
      const rawDate = nut.paymentCollectedAt || nut.createdAt || nut.date;
      const amt = extractNum(nut.amount) || extractNum(nut.packageCost) || extractNum(nut.price);
      if (amt > 0) {
        const accurateSource = cleanPatientSource(nut.source || nut.marketingSource) || 'Old Patient';
        recordRevenue(
          rawDate,
          amt,
          nut.branchName || nut.branchId || nut.branch,
          nut.doctor || nut.doctorName,
          accurateSource,
          0,
          0,
          amt
        );
      }
    }

    // 5. package_members (Care Packages, Advance & Installments)
    for (const pkg of packageMemberDocs) {
      if (!pkg) continue;
      const phone = String(pkg.phone || pkg.phoneNumber || pkg.mobile || '').replace(/\D/g, '').slice(-10);
      const regIdKey = (extractCleanRegId(pkg) || '').toLowerCase().trim();
      const patientName = String(pkg.patientName || pkg.name || '').toLowerCase().trim();

      let accurateSource = cleanPatientSource(pkg.source || pkg.marketingSource || pkg.leadSource);
      if (!accurateSource) {
        if (phone && patientSourceMap.has(phone)) accurateSource = patientSourceMap.get(phone)!;
        else if (regIdKey && patientSourceMap.has(regIdKey)) accurateSource = patientSourceMap.get(regIdKey)!;
        else if (patientName && patientSourceMap.has(patientName)) accurateSource = patientSourceMap.get(patientName)!;
        else accurateSource = 'Walk-in';
      }

      if (Array.isArray(pkg.paymentHistory) && pkg.paymentHistory.length > 0) {
        pkg.paymentHistory.forEach((inst: any, idx: number) => {
          const instAmt = extractNum(inst.amount || inst.paidAmount);
          if (instAmt <= 0) return;
          const instDate = inst.date || inst.paymentDate || pkg.startDate || pkg.createdAt;
          const instId = `${pkg.id}_inst_${idx}`;
          if (seenTxnIds.has(instId)) return;
          seenTxnIds.add(instId);

          recordRevenue(
            instDate,
            instAmt,
            pkg.branch || pkg.branchName || pkg.targetBranch,
            pkg.doctor || pkg.doctorName,
            accurateSource,
            0,
            0,
            instAmt
          );
        });
      } else {
        const rawDate = pkg.paymentCollectedAt || pkg.enrolledDate || pkg.paymentDate || pkg.startDate || pkg.createdAt;
        const pkgAmt = extractNum(pkg.totalPaid) || extractNum(pkg.advancePaid) || extractNum(pkg.paidAmount) || extractNum(pkg.amount) || extractNum(pkg.totalAmount);
        const pkgId = String(pkg.id || '');
        if (pkgAmt > 0) {
          if (pkgId && seenTxnIds.has(pkgId)) continue;
          if (pkgId) seenTxnIds.add(pkgId);

          recordRevenue(
            rawDate,
            pkgAmt,
            pkg.branch || pkg.branchName || pkg.targetBranch,
            pkg.doctor || pkg.doctorName,
            accurateSource,
            0,
            0,
            pkgAmt
          );
        }
      }
    }
    }

    return map;
  }, [last6Months, colDocs, currentMonthKey, previousMonthKey, effectiveTransactions]);

  // Current and Previous Month Points (100% Real Live Firestore Data)
  const currentMonthData = monthlyData[currentMonthKey] || {
    totalRevenue: 0,
    transactionCount: 0,
    branchBreakdown: {},
    sourceBreakdown: {},
    doctorBreakdown: {},
    doctorBranchBreakdown: {}
  };

  const previousMonthData = monthlyData[previousMonthKey] || {
    totalRevenue: 0,
    transactionCount: 0,
    branchBreakdown: {},
    sourceBreakdown: {},
    doctorBreakdown: {},
    doctorBranchBreakdown: {}
  };

  // Dynamic Leading Branch from Real Data
  const leadingBranchInfo = useMemo(() => {
    let topBranch = FOUR_BRANCHES[0];
    let topAmt = 0;
    FOUR_BRANCHES.forEach((b) => {
      const amt = currentMonthData.branchBreakdown[b.id] || 0;
      if (amt > topAmt) {
        topAmt = amt;
        topBranch = b;
      }
    });
    const total = currentMonthData.totalRevenue || 1;
    const pct = (topAmt / total) * 100;
    return {
      name: topBranch.name,
      amount: topAmt,
      percentage: pct
    };
  }, [currentMonthData]);

  // MoM Growth Calculation
  const momRevenueGrowth = useMemo(() => {
    if (previousMonthData.totalRevenue <= 0) return 0;
    const diff = currentMonthData.totalRevenue - previousMonthData.totalRevenue;
    return (diff / previousMonthData.totalRevenue) * 100;
  }, [currentMonthData, previousMonthData]);

  // --- Patient Sources Time Filter State ---
  type SourceTimeFilter = 'this_month' | 'last_month' | 'last_3_months' | 'last_6_months' | 'all' | 'custom';
  const [sourceTimeFilter, setSourceTimeFilter] = useState<SourceTimeFilter>('this_month');
  const [customFromDate, setCustomFromDate] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
  });
  const [customToDate, setCustomToDate] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

  // Calculate Date Bounds
  const { filterStartDate, filterEndDate, filterLabel } = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth(); // 0-based

    if (sourceTimeFilter === 'this_month') {
      const start = new Date(y, m, 1);
      const end = new Date(y, m + 1, 0);
      return {
        filterStartDate: normalizeToYMD(start),
        filterEndDate: normalizeToYMD(end),
        filterLabel: 'This Month'
      };
    }
    if (sourceTimeFilter === 'last_month') {
      const start = new Date(y, m - 1, 1);
      const end = new Date(y, m, 0);
      return {
        filterStartDate: normalizeToYMD(start),
        filterEndDate: normalizeToYMD(end),
        filterLabel: 'Last Month'
      };
    }
    if (sourceTimeFilter === 'last_3_months') {
      const start = new Date(y, m - 2, 1);
      const end = new Date(y, m + 1, 0);
      return {
        filterStartDate: normalizeToYMD(start),
        filterEndDate: normalizeToYMD(end),
        filterLabel: 'Last 3 Months'
      };
    }
    if (sourceTimeFilter === 'last_6_months') {
      const start = new Date(y, m - 5, 1);
      const end = new Date(y, m + 1, 0);
      return {
        filterStartDate: normalizeToYMD(start),
        filterEndDate: normalizeToYMD(end),
        filterLabel: 'Last 6 Months'
      };
    }
    if (sourceTimeFilter === 'all') {
      return {
        filterStartDate: '',
        filterEndDate: '',
        filterLabel: 'All Time'
      };
    }
    return {
      filterStartDate: customFromDate,
      filterEndDate: customToDate,
      filterLabel: 'Custom Range'
    };
  }, [sourceTimeFilter, customFromDate, customToDate]);

  // Dynamic Real-time Calculation of Source & Branch Matrix (Revenue + Unique Patient Count)
  const filteredSourceBranchData = useMemo(() => {
    const allTxnDocs = colDocs['alltransactions'] || [];
    const allPatientDocs = colDocs['allpatients'] || [];
    const patientDocs = colDocs['patients'] || [];
    const appointmentDocs = colDocs['appointments'] || [];
    const nutritionDocs = colDocs['nutrition_plans'] || [];
    const packageMemberDocs = colDocs['package_members'] || [];

    // Pre-index metadata
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
      } else if (cleanReg && (cleanReg.toLowerCase().includes('rk/') || cleanReg.toLowerCase().includes('sph') || doc.isOldPatient || doc.type === 'follow-up' || doc.isFollowUp)) {
        if (phone && !patientSourceMap.has(phone)) patientSourceMap.set(phone, 'Old Patient');
        if (cleanReg && !patientSourceMap.has(cleanReg.toLowerCase())) patientSourceMap.set(cleanReg.toLowerCase(), 'Old Patient');
      }
    };

    allPatientDocs.forEach(scanDocForMeta);
    patientDocs.forEach(scanDocForMeta);
    appointmentDocs.forEach(scanDocForMeta);
    packageMemberDocs.forEach(scanDocForMeta);

    // Initialize source map
    const sourceMap: Record<string, {
      source: string;
      totalRevenue: number;
      uniquePatients: Set<string>;
      branches: Record<string, { revenue: number; patients: Set<string> }>;
    }> = {};

    SOURCES_LIST.forEach((s) => {
      sourceMap[s] = {
        source: s,
        totalRevenue: 0,
        uniquePatients: new Set<string>(),
        branches: {
          kphb: { revenue: 0, patients: new Set<string>() },
          nallagandla: { revenue: 0, patients: new Set<string>() },
          chandanagar: { revenue: 0, patients: new Set<string>() },
          dilshuknagar: { revenue: 0, patients: new Set<string>() }
        }
      };
    });

    const resolveSource = (item: any, phone: string, regIdKey: string, patientName: string): string => {
      let src = cleanPatientSource(item.marketingSource || item.source || item.patientSource || item.leadSource);
      if (!src) {
        if (phone && patientSourceMap.has(phone)) src = patientSourceMap.get(phone)!;
        else if (regIdKey && patientSourceMap.has(regIdKey)) src = patientSourceMap.get(regIdKey)!;
        else if (regIdKey && (regIdKey.includes('rk/') || regIdKey.includes('sph') || item.isOldPatient || item.type === 'follow-up' || item.isFollowUp)) src = 'Old Patient';
        else if (patientName && patientSourceMap.has(patientName)) src = patientSourceMap.get(patientName)!;
        else src = 'Walk-in';
      }
      return SOURCES_LIST.includes(src) ? src : 'Other';
    };

    const seenTxnIds = new Set<string>();
    const seenApptIds = new Set<string>();

    const recordEntry = (
      rawDate: any,
      amt: number,
      branchRaw: string,
      src: string,
      patientKey: string
    ) => {
      const ymd = normalizeToYMD(rawDate);
      if (!ymd) return;
      if (filterStartDate && ymd < filterStartDate) return;
      if (filterEndDate && ymd > filterEndDate) return;

      const bKey = mapBranchKey(branchRaw);
      const cleanSrc = SOURCES_LIST.includes(src) ? src : 'Other';

      if (!sourceMap[cleanSrc]) {
        sourceMap[cleanSrc] = {
          source: cleanSrc,
          totalRevenue: 0,
          uniquePatients: new Set<string>(),
          branches: {
            kphb: { revenue: 0, patients: new Set<string>() },
            nallagandla: { revenue: 0, patients: new Set<string>() },
            chandanagar: { revenue: 0, patients: new Set<string>() },
            dilshuknagar: { revenue: 0, patients: new Set<string>() }
          }
        };
      }

      const entry = sourceMap[cleanSrc];
      if (amt > 0) {
        entry.totalRevenue += amt;
        if (entry.branches[bKey]) {
          entry.branches[bKey].revenue += amt;
        }
      }
      if (patientKey) {
        entry.uniquePatients.add(patientKey);
        if (entry.branches[bKey]) {
          entry.branches[bKey].patients.add(patientKey);
        }
      }
    };

    if (effectiveTransactions.length > 0) {
      for (const item of effectiveTransactions) {
        if (!item) continue;
        const rawDate = item.timestamp || item.dateTime || item.date || item.createdAt || item.paymentCollectedAt;
        const totalAmount = extractNum(item.totalAmount) || extractNum(item.amount) || extractNum(item.paidAmount) || (extractNum(item.consultationFee) + extractNum(item.medicineFee) + extractNum(item.packageFee));
        const phone = String(item.phone || item.phoneNumber || '').replace(/\D/g, '').slice(-10);
        const resolvedRegId = item.patientId || extractCleanRegId(item);
        const patientKey = phone || resolvedRegId || String(item.id || item.patientName);
        let src = item.source ? cleanPatientSource(item.source) : '';
        if (!src) {
          src = resolveSource(item, phone, (resolvedRegId || '').toLowerCase(), String(item.patientName || '').toLowerCase());
        }
        recordEntry(rawDate, totalAmount, item.branchName || item.branch, src, patientKey);
      }
    } else {
    // 1. alltransactions
    for (const item of allTxnDocs) {
      if (!item) continue;
      const rawDate = item.timestamp || item.date || item.createdAt;
      const cFee = extractNum(item.consultationFee) || extractNum(item.itemsPaid?.consultation);
      const mFee = extractNum(item.medicineFee) || extractNum(item.itemsPaid?.medicine);
      const pFee = extractNum(item.packageFee) || extractNum(item.itemsPaid?.package);
      const totalAmount = extractNum(item.amount) || extractNum(item.totalAmount) || extractNum(item.paidAmount) || (cFee + mFee + pFee);

      if (item.id) seenTxnIds.add(String(item.id));
      if (item.appointmentId) seenApptIds.add(String(item.appointmentId));

      const phone = String(item.phone || item.phoneNumber || item.mobile || '').replace(/\D/g, '').slice(-10);
      let resolvedRegId = extractCleanRegId(item);
      if (!resolvedRegId) {
        if (item.patientId && patientRegIdMap.has(item.patientId)) resolvedRegId = patientRegIdMap.get(item.patientId)!;
        else if (phone && patientRegIdMap.has(phone)) resolvedRegId = patientRegIdMap.get(phone)!;
      }
      const regIdKey = (resolvedRegId || '').toLowerCase().trim();
      const patientName = String(item.patientName || item.name || '').toLowerCase().trim();
      const patientKey = phone || regIdKey || String(item.patientId || item.id || patientName);

      const accurateSource = resolveSource(item, phone, regIdKey, patientName);
      recordEntry(rawDate, totalAmount, item.branch || item.branchName || item.targetBranch, accurateSource, patientKey);
    }

    // 2. allpatients (new patient registrations in period)
    for (const p of allPatientDocs) {
      if (!p) continue;
      const rawDate = p.registrationDate || p.createdAt || p.date;
      const phone = String(p.phoneNumber || p.phone || p.mobile || '').replace(/\D/g, '').slice(-10);
      const regIdKey = (extractCleanRegId(p) || '').toLowerCase().trim();
      const patientName = String(p.patientName || p.name || '').toLowerCase().trim();
      const patientKey = phone || regIdKey || String(p.id || patientName);

      const accurateSource = resolveSource(p, phone, regIdKey, patientName);
      recordEntry(rawDate, 0, p.branch || p.branchName || p.targetBranch, accurateSource, patientKey);
    }

    // 3. appointments
    for (const apt of appointmentDocs) {
      if (!apt) continue;
      if (apt.id && seenApptIds.has(String(apt.id))) continue;
      const rawDate = apt.date || apt.appointmentDate || apt.createdAt;
      const cFee = extractNum(apt.consultationFee) || extractNum(apt.fee) || extractNum(apt.amount);
      const phone = String(apt.phone || apt.phoneNumber || apt.mobile || '').replace(/\D/g, '').slice(-10);
      const regIdKey = (extractCleanRegId(apt) || '').toLowerCase().trim();
      const patientName = String(apt.patientName || apt.name || '').toLowerCase().trim();
      const patientKey = phone || regIdKey || String(apt.id || patientName);

      const accurateSource = resolveSource(apt, phone, regIdKey, patientName);
      recordEntry(rawDate, cFee, apt.branchName || apt.branch, accurateSource, patientKey);
    }

    // 4. nutrition_plans
    for (const nut of nutritionDocs) {
      if (!nut) continue;
      const rawDate = nut.paymentCollectedAt || nut.createdAt || nut.date;
      const amt = extractNum(nut.amount) || extractNum(nut.packageCost) || extractNum(nut.price);
      const phone = String(nut.phone || nut.phoneNumber || '').replace(/\D/g, '').slice(-10);
      const patientKey = phone || String(nut.patientId || nut.id || nut.patientName || '');
      const accurateSource = cleanPatientSource(nut.source || nut.marketingSource) || 'Old Patient';
      recordEntry(rawDate, amt, nut.branchName || nut.branchId || nut.branch, accurateSource, patientKey);
    }

    // 5. package_members
    for (const pkg of packageMemberDocs) {
      if (!pkg) continue;
      const phone = String(pkg.phone || pkg.phoneNumber || pkg.mobile || '').replace(/\D/g, '').slice(-10);
      const regIdKey = (extractCleanRegId(pkg) || '').toLowerCase().trim();
      const patientName = String(pkg.patientName || pkg.name || '').toLowerCase().trim();
      const patientKey = phone || regIdKey || String(pkg.id || patientName);
      const accurateSource = resolveSource(pkg, phone, regIdKey, patientName);

      if (Array.isArray(pkg.paymentHistory) && pkg.paymentHistory.length > 0) {
        pkg.paymentHistory.forEach((inst: any, idx: number) => {
          const instAmt = extractNum(inst.amount || inst.paidAmount);
          if (instAmt <= 0) return;
          const instDate = inst.date || inst.paymentDate || pkg.startDate || pkg.createdAt;
          const instId = `${pkg.id}_inst_${idx}`;
          if (seenTxnIds.has(instId)) return;
          seenTxnIds.add(instId);
          recordEntry(instDate, instAmt, pkg.branch || pkg.branchName || pkg.targetBranch, accurateSource, patientKey);
        });
      } else {
        const rawDate = pkg.paymentCollectedAt || pkg.enrolledDate || pkg.paymentDate || pkg.startDate || pkg.createdAt;
        const pkgAmt = extractNum(pkg.totalPaid) || extractNum(pkg.advancePaid) || extractNum(pkg.paidAmount) || extractNum(pkg.amount);
        const pkgId = String(pkg.id || '');
        if (pkgAmt > 0) {
          if (pkgId && seenTxnIds.has(pkgId)) continue;
          if (pkgId) seenTxnIds.add(pkgId);
          recordEntry(rawDate, pkgAmt, pkg.branch || pkg.branchName || pkg.targetBranch, accurateSource, patientKey);
        }
      }
    }
    }

    // Grand totals
    let grandTotalRevenue = 0;
    const allUniquePatients = new Set<string>();
    const branchTotals: Record<string, { revenue: number; patients: Set<string> }> = {
      kphb: { revenue: 0, patients: new Set<string>() },
      nallagandla: { revenue: 0, patients: new Set<string>() },
      chandanagar: { revenue: 0, patients: new Set<string>() },
      dilshuknagar: { revenue: 0, patients: new Set<string>() }
    };

    Object.values(sourceMap).forEach((item) => {
      grandTotalRevenue += item.totalRevenue;
      item.uniquePatients.forEach((p) => allUniquePatients.add(p));
      FOUR_BRANCHES.forEach((b) => {
        const br = item.branches[b.id];
        if (br) {
          branchTotals[b.id].revenue += br.revenue;
          br.patients.forEach((p) => branchTotals[b.id].patients.add(p));
        }
      });
    });

    // Build sorted array of sources (sorted by patient count descending, then revenue)
    const sortedSources = Object.values(sourceMap).sort((a, b) => {
      if (b.uniquePatients.size !== a.uniquePatients.size) {
        return b.uniquePatients.size - a.uniquePatients.size;
      }
      return b.totalRevenue - a.totalRevenue;
    });

    return {
      sourceList: sortedSources,
      grandTotalRevenue,
      grandTotalPatients: allUniquePatients.size,
      branchTotals,
      filterLabel,
      filterStartDate,
      filterEndDate
    };
  }, [colDocs, filterStartDate, filterEndDate, filterLabel, effectiveTransactions]);

  // --- SVG Spike Timeline Graph Geometry (Last 6 Months) ---
  const timelineSvgData = useMemo(() => {
    const points = last6Months.map((m) => {
      const data = monthlyData[m.key];
      return {
        key: m.key,
        label: m.short,
        name: m.name,
        revenue: data?.totalRevenue || 0,
        txnCount: data?.transactionCount || 0
      };
    });

    const maxRev = Math.max(...points.map((p) => p.revenue), 100000) * 1.15;
    const svgWidth = 800;
    const svgHeight = 240;
    const paddingLeft = 50;
    const paddingRight = 40;
    const paddingTop = 30;
    const paddingBottom = 40;

    const plotWidth = svgWidth - paddingLeft - paddingRight;
    const plotHeight = svgHeight - paddingTop - paddingBottom;

    const coords = points.map((p, idx) => {
      const x = paddingLeft + (idx / (points.length - 1)) * plotWidth;
      const y = paddingTop + plotHeight - (p.revenue / maxRev) * plotHeight;
      return { ...p, x, y };
    });

    // Smooth Bezier path
    let pathD = `M ${coords[0].x} ${coords[0].y}`;
    for (let i = 0; i < coords.length - 1; i++) {
      const curr = coords[i];
      const next = coords[i + 1];
      const mx = (curr.x + next.x) / 2;
      pathD += ` C ${mx} ${curr.y}, ${mx} ${next.y}, ${next.x} ${next.y}`;
    }

    // Area fill path
    const areaD = `${pathD} L ${coords[coords.length - 1].x} ${svgHeight - paddingBottom} L ${coords[0].x} ${svgHeight - paddingBottom} Z`;

    return { coords, pathD, areaD, maxRev, svgWidth, svgHeight, paddingLeft, paddingBottom, plotHeight, paddingTop };
  }, [last6Months, monthlyData]);

  // Hovered Spike Point State
  const [hoveredPoint, setHoveredPoint] = useState<any | null>(null);

  // --- Branch Performance (Last 3 Months) Grouped Bars Data ---
  const branch3MonthData = useMemo(() => {
    const last3Keys = last6Months.slice(-3); // e.g. [Jul, Aug, Sep]
    return FOUR_BRANCHES.map((b) => {
      const monthRevenues = last3Keys.map((m) => ({
        monthKey: m.key,
        monthShort: m.short,
        amount: monthlyData[m.key]?.branchBreakdown[b.id] || 0
      }));
      const total3M = monthRevenues.reduce((acc, curr) => acc + curr.amount, 0);
      return {
        branch: b,
        monthRevenues,
        total3M
      };
    });
  }, [last6Months, monthlyData]);

  const maxBranchRev = useMemo(() => {
    let max = 50000;
    branch3MonthData.forEach((b) => {
      b.monthRevenues.forEach((m) => {
        if (m.amount > max) max = m.amount;
      });
    });
    return max * 1.15;
  }, [branch3MonthData]);

  // --- Branch-wise Revenue (This Month) Donut Slices Data ---
  const branchDonutData = useMemo(() => {
    const total = currentMonthData.totalRevenue || 1;
    let accumulatedAngle = 0;

    return FOUR_BRANCHES.map((b) => {
      const amt = currentMonthData.branchBreakdown[b.id] || 0;
      const percentage = (amt / total) * 100;
      const angle = (percentage / 100) * 360;

      const slice = {
        branch: b,
        amount: amt,
        percentage,
        startAngle: accumulatedAngle,
        endAngle: accumulatedAngle + angle
      };
      accumulatedAngle += angle;
      return slice;
    });
  }, [currentMonthData]);

  const [hoveredSlice, setHoveredSlice] = useState<string | null>(null);

  // SVG Donut Path Builder
  const getDonutSlicePath = (cx: number, cy: number, rIn: number, rOut: number, startAngleDeg: number, endAngleDeg: number) => {
    const toRad = (deg: number) => ((deg - 90) * Math.PI) / 180;
    const radStart = toRad(startAngleDeg);
    const radEnd = toRad(endAngleDeg >= 360 ? 359.99 : endAngleDeg);

    const x1 = cx + rOut * Math.cos(radStart);
    const y1 = cy + rOut * Math.sin(radStart);
    const x2 = cx + rOut * Math.cos(radEnd);
    const y2 = cy + rOut * Math.sin(radEnd);

    const x3 = cx + rIn * Math.cos(radEnd);
    const y3 = cy + rIn * Math.sin(radEnd);
    const x4 = cx + rIn * Math.cos(radStart);
    const y4 = cy + rIn * Math.sin(radStart);

    const largeArc = endAngleDeg - startAngleDeg > 180 ? 1 : 0;

    return `M ${x1} ${y1} A ${rOut} ${rOut} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${rIn} ${rIn} 0 ${largeArc} 0 ${x4} ${y4} Z`;
  };

  // Sub-Navigation Tab State
  const [analyticsTab, setAnalyticsTab] = useState<'revenue' | 'average_patient'>('revenue');

  return (
    <div style={{ padding: '16px', maxWidth: '1600px', width: '100%', margin: '0 auto', fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* Sub-Nav Module Switcher */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '14px' }}>
        <button
          onClick={() => setAnalyticsTab('revenue')}
          style={{
            padding: '6px 14px',
            borderRadius: '8px',
            border: 'none',
            background: analyticsTab === 'revenue' ? '#0284c7' : '#f1f5f9',
            color: analyticsTab === 'revenue' ? '#ffffff' : '#475569',
            fontWeight: 700,
            fontSize: '11px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: analyticsTab === 'revenue' ? '0 1px 4px rgba(2, 132, 199, 0.25)' : 'none'
          }}
        >
          <BarChart3 size={13} /> 📊 Executive Revenue & Growth Trends
        </button>
        <button
          onClick={() => setAnalyticsTab('average_patient')}
          style={{
            padding: '6px 14px',
            borderRadius: '8px',
            border: 'none',
            background: analyticsTab === 'average_patient' ? '#0284c7' : '#f1f5f9',
            color: analyticsTab === 'average_patient' ? '#ffffff' : '#475569',
            fontWeight: 700,
            fontSize: '11px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: analyticsTab === 'average_patient' ? '0 1px 4px rgba(2, 132, 199, 0.25)' : 'none'
          }}
        >
          <Calculator size={13} /> 👥 Branch Average Patient & Duration Analytics (ARPU)
        </button>
      </div>

      {analyticsTab === 'average_patient' ? (
        <AveragePatientAnalyticsPage liveTransactions={effectiveTransactions} />
      ) : (
        <>
          {/* Header Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ background: '#e0f2fe', padding: '8px', borderRadius: '12px', color: '#0284c7' }}>
                <BarChart3 size={20} />
              </div>
              <div>
                <h1 style={{ fontSize: '17px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  Reports & Visual Analytics Dashboard
                </h1>
                <p style={{ color: '#64748b', fontSize: '11px', margin: '2px 0 0 0' }}>
                  6-Month revenue spike trends, branch performance benchmarks, MoM comparison tools, and doctor yield
                </p>
              </div>
            </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#0284c7', background: '#e0f2fe', padding: '4px 10px', borderRadius: '8px' }}>
            ● Live Synchronized Mode
          </span>
          <button
            onClick={() => window.print()}
            style={{
              padding: '5px 12px',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#334155',
              fontSize: '11px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              cursor: 'pointer'
            }}
          >
            <Download size={12} /> Export Report
          </button>
        </div>
      </div>

      {/* 4 CORE EXECUTIVE KPI CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '12px', marginBottom: '14px' }}>

        {/* Card 1: This Month Revenue */}
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#334155' }}>Overall Revenue (This Month)</span>
            <div style={{ background: '#dcfce7', padding: '5px', borderRadius: '6px', color: '#16a34a' }}>
              <IndianRupee size={14} />
            </div>
          </div>
          <div style={{ fontSize: '21px', fontWeight: 900, color: '#0f172a', marginTop: '6px', letterSpacing: '-0.4px' }}>
            ₹{currentMonthData.totalRevenue.toLocaleString('en-IN')}
          </div>
          <div style={{ fontSize: '10.5px', fontWeight: 600, color: '#64748b', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#16a34a' }}></span>
            {currentMonthData.transactionCount} Collections Logged
          </div>
        </div>

        {/* Card 2: Last Month Baseline */}
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#334155' }}>Last Month Baseline</span>
            <div style={{ background: '#f1f5f9', padding: '5px', borderRadius: '6px', color: '#64748b' }}>
              <Calendar size={14} />
            </div>
          </div>
          <div style={{ fontSize: '21px', fontWeight: 900, color: '#475569', marginTop: '6px', letterSpacing: '-0.4px' }}>
            ₹{previousMonthData.totalRevenue.toLocaleString('en-IN')}
          </div>
          <div style={{ fontSize: '10.5px', fontWeight: 600, color: '#64748b', marginTop: '6px' }}>
            Previous Calendar Month Totals
          </div>
        </div>

        {/* Card 3: MoM Growth */}
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#334155' }}>MoM Growth</span>
            <div style={{
              background: momRevenueGrowth >= 0 ? '#dcfce7' : '#fee2e2',
              padding: '5px',
              borderRadius: '6px',
              color: momRevenueGrowth >= 0 ? '#16a34a' : '#ef4444'
            }}>
              {momRevenueGrowth >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            </div>
          </div>
          <div style={{
            fontSize: '21px',
            fontWeight: 900,
            marginTop: '6px',
            letterSpacing: '-0.4px',
            color: momRevenueGrowth >= 0 ? '#16a34a' : '#ef4444'
          }}>
            {momRevenueGrowth >= 0 ? `+${momRevenueGrowth.toFixed(1)}%` : `${momRevenueGrowth.toFixed(1)}%`}
          </div>
          <div style={{ fontSize: '10.5px', fontWeight: 600, color: '#64748b', marginTop: '6px' }}>
            {momRevenueGrowth >= 0 ? 'Expansion over baseline' : 'Paced collection cycle'}
          </div>
        </div>

        {/* Card 4: Top Contributing Branch */}
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#334155' }}>Leading Branch (This Month)</span>
            <div style={{ background: '#e0f2fe', padding: '5px', borderRadius: '6px', color: '#0284c7' }}>
              <Building2 size={14} />
            </div>
          </div>
          <div style={{ fontSize: '18px', fontWeight: 900, color: '#0f172a', marginTop: '6px' }}>
            {leadingBranchInfo.name}
          </div>
          <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#0284c7', marginTop: '6px' }}>
            ₹{leadingBranchInfo.amount.toLocaleString('en-IN')} ({leadingBranchInfo.percentage.toFixed(1)}% of Total)
          </div>
        </div>

      </div>

      {/* FILTER BAR FOR PATIENT SOURCES & BRANCH BREAKDOWN (PRIMARY REAL-TIME MATRIX) */}
      <div style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '12px',
        padding: '12px 16px',
        marginBottom: '14px',
        boxShadow: '0 1px 4px rgba(0,0,0,0.02)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ background: '#e0f2fe', padding: '6px', borderRadius: '8px', color: '#0284c7' }}>
            <Filter size={15} />
          </div>
          <div>
            <span style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>
              Patient Acquisition Channels & Branch Matrix (Live Real-Time Data)
            </span>
            <span style={{ marginLeft: '8px', fontSize: '10.5px', color: '#64748b' }}>
              (Filter by period to view dynamic patient count and revenue across branches)
            </span>
          </div>
        </div>

        {/* Filter Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          {[
            { id: 'this_month', label: 'This Month' },
            { id: 'last_month', label: 'Last Month' },
            { id: 'last_3_months', label: 'Last 3 Months' },
            { id: 'last_6_months', label: 'Last 6 Months' },
            { id: 'all', label: 'All Time' },
            { id: 'custom', label: 'Custom Range' }
          ].map((btn) => {
            const isActive = sourceTimeFilter === btn.id;
            return (
              <button
                key={btn.id}
                onClick={() => setSourceTimeFilter(btn.id as SourceTimeFilter)}
                style={{
                  padding: '5px 12px',
                  borderRadius: '6px',
                  border: isActive ? '1px solid #0284c7' : '1px solid #cbd5e1',
                  background: isActive ? '#0284c7' : '#ffffff',
                  color: isActive ? '#ffffff' : '#475569',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {btn.label}
              </button>
            );
          })}

          {/* Custom Date Pickers */}
          {sourceTimeFilter === 'custom' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '6px', background: '#f8fafc', padding: '3px 8px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
              <span style={{ fontSize: '10px', fontWeight: 700, color: '#64748b' }}>From:</span>
              <input
                type="date"
                value={customFromDate}
                onChange={(e) => setCustomFromDate(e.target.value)}
                style={{ fontSize: '11px', padding: '2px 4px', border: '1px solid #cbd5e1', borderRadius: '4px', outline: 'none' }}
              />
              <span style={{ fontSize: '10px', fontWeight: 700, color: '#64748b' }}>To:</span>
              <input
                type="date"
                value={customToDate}
                onChange={(e) => setCustomToDate(e.target.value)}
                style={{ fontSize: '11px', padding: '2px 4px', border: '1px solid #cbd5e1', borderRadius: '4px', outline: 'none' }}
              />
            </div>
          )}

          <span style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', fontSize: '10.5px', fontWeight: 700, padding: '3px 8px', borderRadius: '6px', marginLeft: '4px' }}>
            📅 {filteredSourceBranchData.filterLabel}
          </span>
        </div>
      </div>

      {/* TOP PATIENT SOURCES (LEFT) & ALL BRANCHES PATIENT SOURCES MATRIX (RIGHT) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1fr) minmax(580px, 2fr)', gap: '14px', marginBottom: '14px' }}>

        {/* Left: Top Patient Sources */}
        <div style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '12px',
          padding: '16px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.02)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div>
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>
                Top Patient Sources ({filteredSourceBranchData.filterLabel})
              </span>
              <p style={{ fontSize: '10.5px', color: '#64748b', margin: '2px 0 0 0' }}>
                Sorted by revenue contribution & unique patients
              </p>
            </div>
            <div style={{ background: '#f1f5f9', padding: '5px', borderRadius: '6px', color: '#64748b' }}>
              <Users size={14} />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {filteredSourceBranchData.sourceList.map((item) => {
              const total = filteredSourceBranchData.grandTotalRevenue || 1;
              const pct = (item.totalRevenue / total) * 100;
              const color = SOURCE_COLORS[item.source] || '#64748b';
              const pCount = item.uniquePatients.size;

              return (
                <div key={item.source}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', marginBottom: '3px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: color }}></span>
                      <span style={{ color: '#1e293b', fontWeight: 700 }}>{item.source}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontWeight: 800, color: '#0f172a' }}>₹{item.totalRevenue.toLocaleString('en-IN')}</span>
                      <span style={{ fontSize: '9.5px', color: '#64748b', fontWeight: 700 }}>({pct.toFixed(1)}%)</span>
                      <span style={{ fontSize: '9.5px', background: '#e0f2fe', color: '#0284c7', padding: '1px 5px', borderRadius: '4px', fontWeight: 800 }}>
                        {pCount} {pCount === 1 ? 'pt' : 'pts'}
                      </span>
                    </div>
                  </div>
                  <div style={{ width: '100%', height: '5px', background: '#f1f5f9', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: color, borderRadius: '3px' }}></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: All Branches Patient Sources Matrix */}
        <div style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '12px',
          overflow: 'hidden',
          boxShadow: '0 1px 4px rgba(0,0,0,0.02)',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
            <div>
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>
                All Branches & Sources Matrix ({filteredSourceBranchData.filterLabel})
              </span>
              <p style={{ fontSize: '10.5px', color: '#64748b', margin: '2px 0 0 0' }}>
                Branch-by-branch patient count per acquisition source (Patient numbers only)
              </p>
            </div>
            <span style={{ fontSize: '9.5px', fontWeight: 800, color: '#0284c7', background: '#e0f2fe', padding: '2px 8px', borderRadius: '6px' }}>
              👥 Number of Patients Matrix
            </span>
          </div>

          <div style={{ overflowX: 'auto', width: '100%' }}>
            <table style={{ width: '100%', minWidth: '680px', borderCollapse: 'collapse', textAlign: 'left', fontSize: '11px' }}>
              <thead>
                <tr style={{ background: '#ffffff', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: '9.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                  <th style={{ padding: '10px 14px' }}>Source</th>
                  {FOUR_BRANCHES.map((b) => (
                    <th key={b.id} style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: b.color }}></span>
                        {b.short}
                      </div>
                    </th>
                  ))}
                  <th style={{ padding: '10px 14px', textAlign: 'right' }}>Total Patients</th>
                </tr>
              </thead>
              <tbody>
                {filteredSourceBranchData.sourceList.map((item, idx) => {
                  const total = filteredSourceBranchData.grandTotalRevenue || 1;
                  const pct = (item.totalRevenue / total) * 100;
                  const color = SOURCE_COLORS[item.source] || '#64748b';
                  const totalPatients = item.uniquePatients.size;

                  return (
                    <tr key={item.source} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? '#ffffff' : '#fafafa' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 700, color: '#0f172a' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: color }}></span>
                          <span>{item.source}</span>
                        </div>
                      </td>

                      {FOUR_BRANCHES.map((b) => {
                        const brData = item.branches[b.id] || { revenue: 0, patients: new Set() };
                        const bPts = brData.patients.size;

                        return (
                          <td key={b.id} style={{ padding: '10px 12px', textAlign: 'center' }}>
                            <span style={{
                              display: 'inline-block',
                              fontWeight: bPts > 0 ? 800 : 500,
                              color: bPts > 0 ? '#0f172a' : '#94a3b8',
                              fontSize: '11.5px',
                              background: bPts > 0 ? '#f0f9ff' : 'transparent',
                              padding: bPts > 0 ? '2px 8px' : '2px 4px',
                              borderRadius: '6px'
                            }}>
                              {bPts > 0 ? `${bPts} pts` : '0 pts'}
                            </span>
                          </td>
                        );
                      })}

                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                          <span style={{ fontWeight: 900, color: totalPatients > 0 ? '#0284c7' : '#94a3b8', fontSize: '12px' }}>
                            {totalPatients} {totalPatients === 1 ? 'pt' : 'pts'}
                          </span>
                          {filteredSourceBranchData.grandTotalPatients > 0 && totalPatients > 0 && (
                            <span style={{ background: '#e0f2fe', color: '#0284c7', fontSize: '9px', fontWeight: 800, padding: '1px 5px', borderRadius: '4px' }}>
                              {((totalPatients / filteredSourceBranchData.grandTotalPatients) * 100).toFixed(1)}%
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f8fafc', borderTop: '2px solid #cbd5e1', fontWeight: 800 }}>
                  <td style={{ padding: '10px 14px', color: '#0f172a' }}>Total Patients</td>
                  {FOUR_BRANCHES.map((b) => {
                    const bTotal = filteredSourceBranchData.branchTotals[b.id] || { revenue: 0, patients: new Set() };
                    return (
                      <td key={b.id} style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <span style={{ fontWeight: 900, color: '#0284c7', fontSize: '12px' }}>
                          👥 {bTotal.patients.size} pts
                        </span>
                      </td>
                    );
                  })}
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                    <span style={{ fontWeight: 900, color: '#0f172a', fontSize: '12.5px' }}>
                      👥 {filteredSourceBranchData.grandTotalPatients} Patients
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

      </div>

      {/* ROW 2: 6-MONTH REVENUE TIMELINE (SPIKE GRAPH) */}
      <div style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '12px',
        padding: '16px',
        marginBottom: '14px',
        boxShadow: '0 1px 4px rgba(0,0,0,0.02)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>
                Revenue Timeline (Spike Graph) - Last 6 Months
              </span>
              <span style={{ background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', fontSize: '9.5px', fontWeight: 800, padding: '1px 6px', borderRadius: '6px' }}>
                Trajectory & Peaks
              </span>
            </div>
            <p style={{ fontSize: '10.5px', color: '#64748b', margin: '2px 0 0 0' }}>
              Hover points to inspect exact monthly collection spikes and receipt numbers
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '10.5px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#0284c7' }}></span>
              <span style={{ color: '#475569', fontWeight: 600 }}>Total Revenue</span>
            </div>
          </div>
        </div>

        {/* Pure Responsive SVG Curved Area Spike Graph */}
        <div style={{ width: '100%', overflowX: 'auto', position: 'relative' }}>
          <svg viewBox={`0 0 ${timelineSvgData.svgWidth} ${timelineSvgData.svgHeight}`} style={{ width: '100%', minWidth: '600px', height: 'auto', display: 'block' }}>
            <defs>
              <linearGradient id="spikeGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#0284c7" stopOpacity="0.28" />
                <stop offset="85%" stopColor="#0284c7" stopOpacity="0.02" />
                <stop offset="100%" stopColor="#0284c7" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Grid horizontal guide lines */}
            {[0.25, 0.5, 0.75, 1.0].map((frac, idx) => {
              const y = timelineSvgData.paddingTop + timelineSvgData.plotHeight * (1 - frac);
              const val = Math.round(timelineSvgData.maxRev * frac);
              return (
                <g key={idx}>
                  <line
                    x1={timelineSvgData.paddingLeft}
                    y1={y}
                    x2={timelineSvgData.svgWidth - 40}
                    y2={y}
                    stroke="#f1f5f9"
                    strokeWidth="1"
                    strokeDasharray="4 4"
                  />
                  <text x={timelineSvgData.paddingLeft - 8} y={y + 3} fill="#94a3b8" fontSize="9" textAnchor="end" fontWeight="600">
                    ₹{(val / 1000).toFixed(0)}k
                  </text>
                </g>
              );
            })}

            {/* Baseline X axis */}
            <line
              x1={timelineSvgData.paddingLeft}
              y1={timelineSvgData.svgHeight - timelineSvgData.paddingBottom}
              x2={timelineSvgData.svgWidth - 40}
              y2={timelineSvgData.svgHeight - timelineSvgData.paddingBottom}
              stroke="#cbd5e1"
              strokeWidth="1.2"
            />

            {/* Area Fill */}
            <path d={timelineSvgData.areaD} fill="url(#spikeGrad)" />

            {/* Smooth Stroke Curve */}
            <path d={timelineSvgData.pathD} fill="none" stroke="#0284c7" strokeWidth="2.5" strokeLinecap="round" />

            {/* Interactive Data Points */}
            {timelineSvgData.coords.map((p, idx) => (
              <g
                key={idx}
                onMouseEnter={() => setHoveredPoint(p)}
                onMouseLeave={() => setHoveredPoint(null)}
                style={{ cursor: 'pointer' }}
              >
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={hoveredPoint?.key === p.key ? 7 : 5}
                  fill={hoveredPoint?.key === p.key ? '#0369a1' : '#ffffff'}
                  stroke="#0284c7"
                  strokeWidth="2.5"
                  style={{ transition: 'all 0.15s ease' }}
                />

                {/* X-axis Month Label */}
                <text
                  x={p.x}
                  y={timelineSvgData.svgHeight - 16}
                  fill="#475569"
                  fontSize="10"
                  fontWeight="700"
                  textAnchor="middle"
                >
                  {p.label}
                </text>

                {/* Top Amount Tag */}
                <text
                  x={p.x}
                  y={p.y - 10}
                  fill="#0f172a"
                  fontSize="9.5"
                  fontWeight="800"
                  textAnchor="middle"
                >
                  ₹{(p.revenue / 1000).toFixed(0)}k
                </text>
              </g>
            ))}
          </svg>

          {/* Tooltip Overlay */}
          {hoveredPoint && (
            <div style={{
              position: 'absolute',
              top: '10px',
              right: '20px',
              background: '#0f172a',
              color: '#ffffff',
              padding: '6px 12px',
              borderRadius: '8px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              fontSize: '11px',
              pointerEvents: 'none',
              display: 'flex',
              flexDirection: 'column',
              gap: '2px'
            }}>
              <span style={{ fontWeight: 800, color: '#38bdf8' }}>{hoveredPoint.name}</span>
              <span>Revenue: <b>₹{hoveredPoint.revenue.toLocaleString('en-IN')}</b></span>
              <span style={{ color: '#94a3b8', fontSize: '9.5px' }}>{hoveredPoint.txnCount} Collections</span>
            </div>
          )}
        </div>
      </div>

      {/* ROW 2: BRANCH PERFORMANCE (LAST 3 MONTHS) & THIS MONTH BRANCH DONUT */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '14px', marginBottom: '14px' }}>

        {/* Left: Branch Performance (Last 3 Months Grouped Bars) */}
        <div style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '12px',
          padding: '16px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.02)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <div>
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>
                Branch Performance (Last 3 Months)
              </span>
              <p style={{ fontSize: '10.5px', color: '#64748b', margin: '2px 0 0 0' }}>
                Quarterly trajectory across each of the 4 clinical branches
              </p>
            </div>
            <span style={{ fontSize: '9.5px', fontWeight: 800, color: '#0284c7', background: '#e0f2fe', padding: '2px 8px', borderRadius: '6px' }}>
              Multi-Bar Benchmark
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {branch3MonthData.map(({ branch, monthRevenues }) => (
              <div key={branch.id} style={{ borderBottom: '1px solid #f8fafc', paddingBottom: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#1e293b' }}>
                    {branch.name}
                  </span>
                  <span style={{ fontSize: '10px', fontWeight: 700, color: '#64748b' }}>
                    This Month: <b style={{ color: '#0f172a' }}>₹{monthRevenues[2]?.amount.toLocaleString('en-IN')}</b>
                  </span>
                </div>

                {/* 3 Grouped Progress / Mini-Bars */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  {monthRevenues.map((mr, mIdx) => {
                    const barHeightPct = Math.min(100, Math.max(12, (mr.amount / maxBranchRev) * 100));
                    return (
                      <div key={mIdx} style={{ background: '#f8fafc', padding: '6px 8px', borderRadius: '6px', border: '1px solid #f1f5f9' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9.5px', color: '#64748b', marginBottom: '4px' }}>
                          <span>{mr.monthShort}</span>
                          <span style={{ fontWeight: 700, color: '#0f172a' }}>₹{(mr.amount / 1000).toFixed(0)}k</span>
                        </div>
                        <div style={{ width: '100%', height: '5px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{
                            width: `${barHeightPct}%`,
                            height: '100%',
                            background: mIdx === 2 ? branch.color : '#94a3b8',
                            borderRadius: '3px'
                          }}></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Branch-wise Revenue (This Month) Donut / Pie Chart */}
        <div style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '12px',
          padding: '16px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.02)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div>
                <span style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>
                  Branch-wise Revenue (This Month)
                </span>
                <p style={{ fontSize: '10.5px', color: '#64748b', margin: '2px 0 0 0' }}>
                  Distribution share of current monthly collections
                </p>
              </div>
              <div style={{ background: '#f1f5f9', padding: '5px', borderRadius: '6px', color: '#64748b' }}>
                <PieChartIcon size={14} />
              </div>
            </div>

            {/* Pure SVG Donut Chart with interactive slices */}
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', margin: '12px 0' }}>
              <div style={{ position: 'relative', width: '180px', height: '180px' }}>
                <svg viewBox="0 0 200 200" style={{ width: '100%', height: '100%' }}>
                  {branchDonutData.map((slice, sIdx) => {
                    const isHov = hoveredSlice === slice.branch.id;
                    const rOut = isHov ? 96 : 90;
                    const rIn = 58;
                    const d = getDonutSlicePath(100, 100, rIn, rOut, slice.startAngle, slice.endAngle);
                    return (
                      <path
                        key={sIdx}
                        d={d}
                        fill={slice.branch.color}
                        opacity={hoveredSlice && !isHov ? 0.45 : 1.0}
                        onMouseEnter={() => setHoveredSlice(slice.branch.id)}
                        onMouseLeave={() => setHoveredSlice(null)}
                        style={{ cursor: 'pointer', transition: 'all 0.15s ease' }}
                      />
                    );
                  })}
                </svg>

                {/* Center Circle Content */}
                <div style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  textAlign: 'center',
                  pointerEvents: 'none'
                }}>
                  <span style={{ fontSize: '8.5px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                    Total
                  </span>
                  <div style={{ fontSize: '14px', fontWeight: 900, color: '#0f172a' }}>
                    ₹{(currentMonthData.totalRevenue / 1000).toFixed(0)}k
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Legend Badges with Exact ₹ and % */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px', borderTop: '1px solid #f1f5f9', paddingTop: '10px' }}>
            {branchDonutData.map((slice) => (
              <div
                key={slice.branch.id}
                onMouseEnter={() => setHoveredSlice(slice.branch.id)}
                onMouseLeave={() => setHoveredSlice(null)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '4px 6px',
                  borderRadius: '6px',
                  background: hoveredSlice === slice.branch.id ? '#f1f5f9' : 'transparent',
                  cursor: 'pointer'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: slice.branch.color }}></span>
                  <span style={{ fontSize: '10.5px', fontWeight: 600, color: '#334155' }}>{slice.branch.short}</span>
                </div>
                <span style={{ fontSize: '10px', fontWeight: 800, color: '#0f172a' }}>
                  {slice.percentage.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* ROW 4: DOCTOR-WISE & DOCTOR-BRANCH REVENUE MATRIX */}
      <div style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '12px',
        overflow: 'hidden',
        boxShadow: '0 1px 4px rgba(0,0,0,0.02)',
        marginBottom: '14px'
      }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
          <div>
            <span style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>
              Doctor-Wise & Branch Revenue Matrix (This Month)
            </span>
            <p style={{ fontSize: '10.5px', color: '#64748b', margin: '2px 0 0 0' }}>
              Collections generated by treated doctor across clinical branches
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Stethoscope size={14} color="#0284c7" />
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#0284c7' }}>
              Doctor Yield Benchmarks
            </span>
          </div>
        </div>
        <div style={{ overflowX: 'auto', width: '100%' }}>
          <table style={{ width: '100%', minWidth: '800px', borderCollapse: 'collapse', textAlign: 'left', fontSize: '11px' }}>
            <thead>
              <tr style={{ background: '#ffffff', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: '9.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                <th style={{ padding: '10px 14px' }}>Doctor Name</th>
                <th style={{ padding: '10px 14px' }}>KPHB</th>
                <th style={{ padding: '10px 14px' }}>Nallagandla</th>
                <th style={{ padding: '10px 14px' }}>Chandanagar</th>
                <th style={{ padding: '10px 14px' }}>Dilshuknagar</th>
                <th style={{ padding: '10px 14px', textAlign: 'right' }}>Total Collections</th>
                <th style={{ padding: '10px 14px', textAlign: 'right' }}>Share (%)</th>
              </tr>
            </thead>
            <tbody>
              {DOCTORS.map((doc, idx) => {
                const total = currentMonthData.totalRevenue || 1;
                const docTotal = currentMonthData.doctorBreakdown[doc] || 0;
                const sharePct = (docTotal / total) * 100;
                const brMap = currentMonthData.doctorBranchBreakdown[doc] || { kphb: 0, nallagandla: 0, chandanagar: 0, dilshuknagar: 0 };
                return (
                  <tr key={doc} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? '#ffffff' : '#fafafa' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#0f172a' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#e0f2fe', color: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '10px' }}>
                          {doc.replace('Dr. ', '').charAt(0)}
                        </div>
                        {doc}
                      </div>
                    </td>
                    <td style={{ padding: '10px 14px', color: '#334155' }}>
                      ₹{(brMap.kphb || 0).toLocaleString('en-IN')}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#334155' }}>
                      ₹{(brMap.nallagandla || 0).toLocaleString('en-IN')}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#334155' }}>
                      ₹{(brMap.chandanagar || 0).toLocaleString('en-IN')}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#334155' }}>
                      ₹{(brMap.dilshuknagar || 0).toLocaleString('en-IN')}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, color: '#0f172a' }}>
                      ₹{docTotal.toLocaleString('en-IN')}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      <span style={{ background: '#dcfce7', color: '#15803d', padding: '2px 7px', borderRadius: '6px', fontWeight: 800, fontSize: '9.5px' }}>
                        {sharePct.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ROW 5: BRANCH LAST MONTH VS THIS MONTH COMPARISON LEDGER */}
      <div style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '12px',
        overflow: 'hidden',
        boxShadow: '0 1px 4px rgba(0,0,0,0.02)'
      }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
          <div>
            <span style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>
              Branch Performance Comparison (Last Month vs This Month)
            </span>
            <p style={{ fontSize: '10.5px', color: '#64748b', margin: '2px 0 0 0' }}>
              Direct branch-by-branch fiscal delta and growth metrics
            </p>
          </div>
          <span style={{ fontSize: '9.5px', fontWeight: 800, color: '#16a34a', background: '#dcfce7', padding: '2px 8px', borderRadius: '6px' }}>
            Branch MoM Ledger
          </span>
        </div>
        <div style={{ overflowX: 'auto', width: '100%' }}>
          <table style={{ width: '100%', minWidth: '700px', borderCollapse: 'collapse', textAlign: 'left', fontSize: '11px' }}>
            <thead>
              <tr style={{ background: '#ffffff', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontSize: '9.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                <th style={{ padding: '10px 14px' }}>Branch</th>
                <th style={{ padding: '10px 14px' }}>This Month Collections</th>
                <th style={{ padding: '10px 14px' }}>Last Month Collections</th>
                <th style={{ padding: '10px 14px' }}>Difference (₹)</th>
                <th style={{ padding: '10px 14px', textAlign: 'right' }}>Growth Trend</th>
              </tr>
            </thead>
            <tbody>
              {FOUR_BRANCHES.map((b, idx) => {
                const thisAmt = currentMonthData.branchBreakdown[b.id] || 0;
                const lastAmt = previousMonthData.branchBreakdown[b.id] || 0;
                const diff = thisAmt - lastAmt;
                const pct = lastAmt > 0 ? (diff / lastAmt) * 100 : 0;
                const isPositive = diff >= 0;

                return (
                  <tr key={b.id} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? '#ffffff' : '#fafafa' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#0f172a' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: b.color }}></span>
                        {b.name}
                      </div>
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: 800, color: '#0f172a' }}>
                      ₹{thisAmt.toLocaleString('en-IN')}
                    </td>
                    <td style={{ padding: '10px 14px', color: '#64748b', fontWeight: 600 }}>
                      ₹{lastAmt.toLocaleString('en-IN')}
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: 800, color: isPositive ? '#16a34a' : '#b91c1c' }}>
                      {isPositive ? `+₹${diff.toLocaleString('en-IN')}` : `-₹${Math.abs(diff).toLocaleString('en-IN')}`}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      <span style={{
                        background: isPositive ? '#dcfce7' : '#fee2e2',
                        color: isPositive ? '#15803d' : '#b91c1c',
                        padding: '3px 8px',
                        borderRadius: '6px',
                        fontWeight: 800,
                        fontSize: '9.5px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        {isPositive ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                        {pct >= 0 ? `+${pct.toFixed(1)}%` : `${pct.toFixed(1)}%`}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
        </>
      )}
    </div>
  );
};
export default ReportsAnalyticsPage;