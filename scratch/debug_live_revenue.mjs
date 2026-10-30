import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAohSNLyeS6bYtnk2QvB4HGo0LbHDw9b6Q",
  authDomain: "spiritual-homeopathy-3b552.firebaseapp.com",
  databaseURL: "https://spiritual-homeopathy-3b552-default-rtdb.firebaseio.com",
  projectId: "spiritual-homeopathy-3b552",
  storageBucket: "spiritual-homeopathy-3b552.firebasestorage.app",
  messagingSenderId: "81822616559",
  appId: "1:81822616559:web:98a0b9cd974938cc87841a"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const normalizeBranchKey = (raw = '', regId = '') => {
  const s = String(raw || '').toLowerCase().trim();
  const r = String(regId || '').toLowerCase().trim();
  if (s.includes('kphb') || s.includes('kukatpally') || s.includes('kphp') || r.includes('kphb')) return 'kphb';
  if (s.includes('nalla') || s.includes('nallagandla') || s.includes('nlg') || r.includes('nlg')) return 'nallagandla';
  if (s.includes('dilshuk') || s.includes('dilsukh') || s.includes('dsnr') || s.includes('dshnr') || r.includes('dsnr')) return 'dilshuknagar';
  if (s.includes('chanda') || s.includes('chnr') || s.includes('chandanagar') || s.includes('cngr') || r.includes('cngr')) return 'chandanagar';
  return 'kphb';
};

const extractCleanNum = (c) => {
  if (c !== undefined && c !== null && c !== '') {
    const cleanStr = String(c).replace(/[^0-9.]/g, '');
    const num = Number(cleanStr);
    if (!isNaN(num) && num > 0) return num;
  }
  return 0;
};

const isFirestoreAutoId = (id) => {
  if (!id || typeof id !== 'string') return false;
  const s = id.trim();
  return (s.length >= 16 && s.length <= 32 && /^[A-Za-z0-9]+$/.test(s) && !s.includes('-') && !s.includes('/') && !s.includes('_') && !s.includes(' '));
};

const extractCleanRegId = (item) => {
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

const normalizeToYMD = (raw) => {
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

async function inspectCollections() {
  const [allTxnSnap, allPatSnap, aptSnap, pkgSnap, nutSnap] = await Promise.all([
    getDocs(collection(db, 'alltransactions')).catch(() => ({ docs: [] })),
    getDocs(collection(db, 'allpatients')).catch(() => ({ docs: [] })),
    getDocs(collection(db, 'appointments')).catch(() => ({ docs: [] })),
    getDocs(collection(db, 'package_members')).catch(() => ({ docs: [] })),
    getDocs(collection(db, 'nutrition_plans')).catch(() => ({ docs: [] }))
  ]);

  console.log(`Counts: alltransactions=${allTxnSnap.docs?.length || allTxnSnap.size}, allpatients=${allPatSnap.docs?.length || allPatSnap.size}, appointments=${aptSnap.docs?.length || aptSnap.size}`);

  const currentMonthPrefix = '2026-10';

  const branchRevenue = { kphb: 0, nallagandla: 0, dilshuknagar: 0, chandanagar: 0 };
  const sourceBreakdown = {
    alltransactions: { kphb: 0, nallagandla: 0, dilshuknagar: 0, chandanagar: 0 },
    allpatients: { kphb: 0, nallagandla: 0, dilshuknagar: 0, chandanagar: 0 },
    appointments: { kphb: 0, nallagandla: 0, dilshuknagar: 0, chandanagar: 0 },
    package_members: { kphb: 0, nallagandla: 0, dilshuknagar: 0, chandanagar: 0 },
    nutrition_plans: { kphb: 0, nallagandla: 0, dilshuknagar: 0, chandanagar: 0 }
  };

  const seenTxnIds = new Set();
  const seenAppointmentIds = new Set();
  const seenPatientIds = new Set();
  const seenPhoneDates = new Set();
  const seenRegDates = new Set();

  const allTxnDocs = allTxnSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const allPatientDocs = allPatSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const appointmentDocs = aptSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // 1. alltransactions
  for (const item of allTxnDocs) {
    const rawDate = item.timestamp || item.date || item.createdAt;
    const ymd = normalizeToYMD(rawDate);
    const phone = String(item.phoneNumber || item.phone || item.mobile || '').replace(/\D/g, '').slice(-10);
    const resolvedRegId = extractCleanRegId(item);
    const regIdKey = (resolvedRegId || '').toLowerCase().trim();
    const patNameKey = String(item.patientName || item.name || '').toLowerCase().trim();

    if (item.id) seenTxnIds.add(String(item.id));
    if (item.appointmentId) seenAppointmentIds.add(String(item.appointmentId));
    if (item.patientDocId) seenPatientIds.add(String(item.patientDocId));
    if (regIdKey) seenPatientIds.add(regIdKey);
    if (phone && ymd) seenPhoneDates.add(`${phone}_${patNameKey}_${ymd}`);
    if (regIdKey && ymd) seenRegDates.add(`${regIdKey}_${ymd}`);

    const itemsConsultation = extractCleanNum(item.itemsPaid?.consultation);
    const itemsMedicine = extractCleanNum(item.itemsPaid?.medicine);
    const itemsPackage = extractCleanNum(item.itemsPaid?.package || item.itemsPaid?.diet);

    const consultationFee = extractCleanNum(item.consultationFee) || itemsConsultation;
    const medicineFee = extractCleanNum(item.medicineFee) || itemsMedicine;
    const packageFee = extractCleanNum(item.packageFee) || itemsPackage;

    const totalAmount =
      extractCleanNum(item.amount) ||
      extractCleanNum(item.totalAmount) ||
      extractCleanNum(item.totalPaid) ||
      extractCleanNum(item.paidAmount) ||
      (consultationFee + medicineFee + packageFee);

    if (totalAmount > 0 && ymd && ymd.startsWith(currentMonthPrefix)) {
      const bKey = normalizeBranchKey(item.branchName || item.branchId || item.branch, resolvedRegId);
      branchRevenue[bKey] += totalAmount;
      sourceBreakdown.alltransactions[bKey] += totalAmount;
    }
  }

  // 2. allpatients
  for (const p of allPatientDocs) {
    const rawDate = p.paymentCollectedAt || p.createdAt || p.date;
    const ymd = normalizeToYMD(rawDate);
    const phone = String(p.phoneNumber || p.phone || p.mobile || '').replace(/\D/g, '').slice(-10);
    const resolvedRegId = extractCleanRegId(p);
    const regIdKey = (resolvedRegId || '').toLowerCase().trim();
    const patNameKey = String(p.patientName || p.name || '').toLowerCase().trim();

    const inTransactions =
      (p.id && (seenTxnIds.has(p.id) || seenPatientIds.has(p.id))) ||
      (phone && ymd && seenPhoneDates.has(`${phone}_${patNameKey}_${ymd}`)) ||
      (regIdKey && ymd && seenRegDates.has(`${regIdKey}_${ymd}`));

    if (inTransactions) continue;

    const amountPaid = extractCleanNum(p.amountPaid) || extractCleanNum(p.totalPaid) || extractCleanNum(p.paidAmount);
    if (amountPaid > 0 && ymd && ymd.startsWith(currentMonthPrefix)) {
      const bKey = normalizeBranchKey(p.branchName || p.branch, resolvedRegId);
      branchRevenue[bKey] += amountPaid;
      sourceBreakdown.allpatients[bKey] += amountPaid;
      if (phone && ymd) seenPhoneDates.add(`${phone}_${patNameKey}_${ymd}`);
      if (regIdKey && ymd) seenRegDates.add(`${regIdKey}_${ymd}`);
    }
  }

  // 3. appointments
  for (const apt of appointmentDocs) {
    const rawDate = apt.appointmentDate || apt.date || apt.createdAt;
    const ymd = normalizeToYMD(rawDate);
    const phone = String(apt.phoneNumber || apt.phone || apt.mobile || '').replace(/\D/g, '').slice(-10);
    const resolvedRegId = extractCleanRegId(apt);
    const regIdKey = (resolvedRegId || '').toLowerCase().trim();
    const patNameKey = String(apt.patientName || apt.name || '').toLowerCase().trim();

    const inTransactions =
      (apt.id && (seenTxnIds.has(apt.id) || seenAppointmentIds.has(apt.id))) ||
      (phone && ymd && seenPhoneDates.has(`${phone}_${patNameKey}_${ymd}`)) ||
      (regIdKey && ymd && seenRegDates.has(`${regIdKey}_${ymd}`));

    if (inTransactions) continue;

    const consultationFee =
      extractCleanNum(apt.totalAmount) ||
      extractCleanNum(apt.amountPaid) ||
      extractCleanNum(apt.totalPaid) ||
      extractCleanNum(apt.paidAmount) ||
      extractCleanNum(apt.consultationFee) ||
      extractCleanNum(apt.fee) ||
      extractCleanNum(apt.amount) ||
      extractCleanNum(apt.collectFee) ||
      extractCleanNum(apt.paymentAmount) ||
      (extractCleanNum(apt.consultationFee) + extractCleanNum(apt.medicineFee) + extractCleanNum(apt.pharmacyFee));

    const paymentStatus = String(apt.paymentStatus || apt.status || '').toLowerCase();
    const isPaid = paymentStatus === 'paid' || paymentStatus === 'confirmed' || paymentStatus === 'completed' || consultationFee > 0;

    if (consultationFee > 0 && isPaid && ymd && ymd.startsWith(currentMonthPrefix)) {
      const bKey = normalizeBranchKey(apt.branchName || apt.branch, resolvedRegId);
      branchRevenue[bKey] += consultationFee;
      sourceBreakdown.appointments[bKey] += consultationFee;
      if (phone && ymd) seenPhoneDates.add(`${phone}_${patNameKey}_${ymd}`);
      if (regIdKey && ymd) seenRegDates.add(`${regIdKey}_${ymd}`);
    }
  }

  console.log('Resulting branch revenue:', branchRevenue);
  console.log('Source breakdown:', JSON.stringify(sourceBreakdown, null, 2));
}

inspectCollections().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
