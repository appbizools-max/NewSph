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

// Copy exact helper functions from AnalyticsRevenuePage.tsx
const normalizeToYMD = (val) => {
  if (!val) return '';
  const str = String(val).trim();
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

const extractCleanNum = (val) => {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (!val) return 0;
  const cleaned = String(val).replace(/[^0-9.]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
};

const isFirestoreAutoId = (id) => {
  if (!id || typeof id !== 'string') return false;
  return /^[A-Za-z0-9]{20}$/.test(id);
};

const extractCleanRegId = (item) => {
  if (!item) return '';
  const candidates = [
    item.regId,
    item.registrationId,
    item.patientRegNo,
    item.regNo,
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
      if (clean && !isFirestoreAutoId(clean) && clean !== 'undefined' && clean !== 'null') return clean;
    }
  }
  return '';
};

const mapBranchName = (b, regId) => {
  if (!b && regId) {
    const rLower = String(regId).toLowerCase();
    if (rLower.includes('dsnr') || rLower.includes('dil')) return 'Dilshuknagar Branch';
    if (rLower.includes('kphb')) return 'KPHB Branch';
    if (rLower.includes('nlg') || rLower.includes('nalla')) return 'Nallagandla Branch';
    if (rLower.includes('cngr') || rLower.includes('chanda')) return 'Chandanagar Branch';
  }
  const s = String(b || '').trim().toLowerCase();
  if (s.includes('dilshuk') || s.includes('dsnr')) return 'Dilshuknagar Branch';
  if (s.includes('kphb')) return 'KPHB Branch';
  if (s.includes('nalla') || s.includes('nlg')) return 'Nallagandla Branch';
  if (s.includes('chanda') || s.includes('cngr')) return 'Chandanagar Branch';
  return 'KPHB Branch';
};

async function testSync() {
  const collections = ['alltransactions', 'allpatients', 'appointments', 'package_members'];
  const colDocs = {};
  for (const c of collections) {
    const snap = await getDocs(collection(db, c));
    colDocs[c] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  const allTxnDocs = colDocs['alltransactions'] || [];
  const allPatientDocs = colDocs['allpatients'] || [];
  const appointmentDocs = colDocs['appointments'] || [];

  const patientRegIdMap = new Map();
  const scanDocForMeta = (doc) => {
    if (!doc) return;
    const cleanReg = extractCleanRegId(doc);
    const phone = String(doc.phoneNumber || doc.phone || doc.mobile || '').replace(/\D/g, '').slice(-10);
    const docId = String(doc.id || '').trim();
    if (cleanReg) {
      if (docId) patientRegIdMap.set(docId, cleanReg);
      if (phone) patientRegIdMap.set(phone, cleanReg);
    }
  };
  allPatientDocs.forEach(scanDocForMeta);
  appointmentDocs.forEach(scanDocForMeta);

  const seenTxnIds = new Set();
  const seenAppointmentIds = new Set();
  const seenPatientIds = new Set();
  const seenPhoneDates = new Set();
  const seenRegDates = new Set();
  const records = [];

  for (const item of allTxnDocs) {
    const rawDate = item.timestamp || item.date || item.createdAt;
    const ymd = normalizeToYMD(rawDate);
    const phone = String(item.phoneNumber || item.phone || item.mobile || '').replace(/\D/g, '').slice(-10);
    let resolvedRegId = extractCleanRegId(item);
    if (!resolvedRegId && phone && patientRegIdMap.has(phone)) resolvedRegId = patientRegIdMap.get(phone);
    const regIdKey = resolvedRegId ? resolvedRegId.toLowerCase().trim() : '';

    if (item.id) seenTxnIds.add(item.id);
    if (item.appointmentId) seenAppointmentIds.add(String(item.appointmentId));
    if (item.patientDocId) seenPatientIds.add(String(item.patientDocId));
    if (item.patientId) seenPatientIds.add(String(item.patientId));
    if (regIdKey) seenPatientIds.add(regIdKey);
    if (phone && ymd) seenPhoneDates.add(`${phone}_${ymd}`);
    if (regIdKey && ymd) seenRegDates.add(`${regIdKey}_${ymd}`);

    const totalAmount = extractCleanNum(item.totalAmount) || extractCleanNum(item.amount) || extractCleanNum(item.totalPaid);
    records.push({
      id: item.id,
      branchName: mapBranchName(item.branchName || item.branchId || item.branch, resolvedRegId),
      totalAmount,
      timestamp: ymd
    });
  }

  for (const p of allPatientDocs) {
    const rawDate = p.paymentCollectedAt || p.createdAt || p.date;
    const ymd = normalizeToYMD(rawDate);
    const phone = String(p.phoneNumber || p.phone || p.mobile || '').replace(/\D/g, '').slice(-10);
    let resolvedRegId = extractCleanRegId(p);
    if (!resolvedRegId && phone && patientRegIdMap.has(phone)) resolvedRegId = patientRegIdMap.get(phone);
    const regIdKey = resolvedRegId ? resolvedRegId.toLowerCase().trim() : '';

    const inTransactions =
      (p.id && (seenTxnIds.has(p.id) || seenPatientIds.has(p.id))) ||
      (regIdKey && seenPatientIds.has(regIdKey)) ||
      (phone && ymd && seenPhoneDates.has(`${phone}_${ymd}`)) ||
      (regIdKey && ymd && seenRegDates.has(`${regIdKey}_${ymd}`));

    if (inTransactions) continue;

    const amountPaid = extractCleanNum(p.amountPaid) || extractCleanNum(p.totalPaid) || extractCleanNum(p.paidAmount);
    if (amountPaid > 0) {
      records.push({
        id: p.id,
        branchName: mapBranchName(p.branchName || p.branch, resolvedRegId),
        totalAmount: amountPaid,
        timestamp: ymd
      });
      if (phone && ymd) seenPhoneDates.add(`${phone}_${ymd}`);
      if (regIdKey && ymd) seenRegDates.add(`${regIdKey}_${ymd}`);
    }
  }

  for (const apt of appointmentDocs) {
    const rawDate = apt.appointmentDate || apt.date || apt.createdAt;
    const ymd = normalizeToYMD(rawDate);
    const phone = String(apt.phoneNumber || apt.phone || apt.mobile || '').replace(/\D/g, '').slice(-10);
    let resolvedRegId = extractCleanRegId(apt);
    if (!resolvedRegId && phone && patientRegIdMap.has(phone)) resolvedRegId = patientRegIdMap.get(phone);
    const regIdKey = resolvedRegId ? resolvedRegId.toLowerCase().trim() : '';

    const inTransactions =
      (apt.id && (seenTxnIds.has(apt.id) || seenAppointmentIds.has(apt.id))) ||
      (phone && ymd && seenPhoneDates.has(`${phone}_${ymd}`)) ||
      (regIdKey && ymd && seenRegDates.has(`${regIdKey}_${ymd}`));

    if (inTransactions) continue;

    const consultationFee =
      extractCleanNum(apt.totalAmount) ||
      extractCleanNum(apt.amountPaid) ||
      extractCleanNum(apt.totalPaid) ||
      extractCleanNum(apt.paidAmount) ||
      extractCleanNum(apt.consultationFee) ||
      extractCleanNum(apt.amount);

    if (consultationFee > 0) {
      records.push({
        id: apt.id,
        branchName: mapBranchName(apt.branchName || apt.branch, resolvedRegId),
        totalAmount: consultationFee,
        timestamp: ymd
      });
    }
  }

  console.log(`Total records: ${records.length}`);
  
  // Filter for October 2026 and KPHB
  const octKphb = records.filter(r => r.branchName.toLowerCase().includes('kphb') && r.timestamp.startsWith('2026-10'));
  const totalOctKphb = octKphb.reduce((sum, r) => sum + r.totalAmount, 0);
  console.log(`KPHB October 2026: ${octKphb.length} records, Total Amount = ₹${totalOctKphb}`);

  const octChanda = records.filter(r => r.branchName.toLowerCase().includes('chanda') && r.timestamp.startsWith('2026-10'));
  console.log(`Chandanagar October 2026: Total Amount = ₹${octChanda.reduce((sum, r) => sum + r.totalAmount, 0)}`);

  const octNalla = records.filter(r => r.branchName.toLowerCase().includes('nalla') && r.timestamp.startsWith('2026-10'));
  console.log(`Nallagandla October 2026: Total Amount = ₹${octNalla.reduce((sum, r) => sum + r.totalAmount, 0)}`);

  const octDsnr = records.filter(r => r.branchName.toLowerCase().includes('dilshuk') && r.timestamp.startsWith('2026-10'));
  console.log(`Dilshuknagar October 2026: Total Amount = ₹${octDsnr.reduce((sum, r) => sum + r.totalAmount, 0)}`);
}

testSync().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
