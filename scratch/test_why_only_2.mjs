import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, limit } from 'firebase/firestore';

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

const extractCleanNum = (val) => {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const cleaned = String(val).replace(/[^0-9.-]+/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
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
  return '';
};

const isFirestoreAutoId = (id) => {
  if (!id || typeof id !== 'string') return true;
  return id.length >= 16 && /^[a-zA-Z0-9_-]+$/.test(id) && !id.includes('/') && !id.includes('-');
};

const extractCleanRegId = (doc) => {
  if (!doc) return '';
  const candidates = [
    doc.registrationId,
    doc.regId,
    doc.patientRegistrationId,
    doc.patientRegId,
    doc.opdNumber,
    doc.mrNo,
    doc.patientId
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

async function runTest() {
  console.log('1. Fetching alltransactions (limit 3000)...');
  const allTxnSnap = await getDocs(query(collection(db, 'alltransactions'), limit(3000)));
  const allTxnDocs = allTxnSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`alltransactions fetched: ${allTxnDocs.length}`);

  console.log('2. Fetching allpatients (limit 1500)...');
  const allPatSnap = await getDocs(query(collection(db, 'allpatients'), limit(1500)));
  const allPatientDocs = allPatSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`allpatients fetched: ${allPatientDocs.length}`);

  console.log('3. Fetching appointments (limit 2000)...');
  const apptSnap = await getDocs(query(collection(db, 'appointments'), limit(2000)));
  const appointmentDocs = apptSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`appointments fetched: ${appointmentDocs.length}`);

  console.log('4. Fetching package_members (limit 1000)...');
  const pkgSnap = await getDocs(query(collection(db, 'package_members'), limit(1000)));
  const packageMemberDocs = pkgSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  console.log(`package_members fetched: ${packageMemberDocs.length}`);

  const patientRegIdMap = new Map();
  allPatientDocs.forEach(d => {
    const cleanReg = extractCleanRegId(d);
    const phone = String(d.phoneNumber || d.phone || d.mobile || '').replace(/\D/g, '').slice(-10);
    if (cleanReg) {
      if (d.id) patientRegIdMap.set(d.id, cleanReg);
      if (phone) patientRegIdMap.set(phone, cleanReg);
    }
  });

  const seenTxnIds = new Set();
  const seenAppointmentIds = new Set();
  const seenPatientIds = new Set();
  const seenPhoneDates = new Set();
  const seenRegDates = new Set();

  const records = [];

  // Step 1: alltransactions
  for (const item of allTxnDocs) {
    const rawDate = item.timestamp || item.date || item.createdAt;
    const ymd = normalizeToYMD(rawDate);
    const phone = String(item.phoneNumber || item.phone || item.mobile || '').replace(/\D/g, '').slice(-10);

    let resolvedRegId = extractCleanRegId(item);
    if (!resolvedRegId || isFirestoreAutoId(resolvedRegId)) {
      resolvedRegId = phone ? `863rk/kph` : `SPH-KPH-001`;
    }
    const regIdKey = resolvedRegId.toLowerCase().trim();

    if (item.id) seenTxnIds.add(String(item.id));
    if (item.appointmentId) seenAppointmentIds.add(String(item.appointmentId));
    if (item.patientDocId) seenPatientIds.add(String(item.patientDocId));
    if (regIdKey) seenPatientIds.add(regIdKey);
    if (phone && ymd) seenPhoneDates.add(`${phone}_${ymd}`);
    if (regIdKey && ymd) seenRegDates.add(`${regIdKey}_${ymd}`);

    const consultationFee = extractCleanNum(item.consultationFee);
    const medicineFee = extractCleanNum(item.medicineFee);
    const packageFee = extractCleanNum(item.packageFee);
    const totalAmount = extractCleanNum(item.amount) || extractCleanNum(item.totalAmount) || (consultationFee + medicineFee + packageFee);

    if (totalAmount > 0) {
      records.push({ id: item.id, name: item.patientName, amount: totalAmount, ymd, source: 'alltransactions' });
    }
  }
  console.log(`After alltransactions: total=${records.length}, October=${records.filter(r => r.ymd?.startsWith('2026-10')).length}`);

  // Step 2: allpatients
  let patOctAdded = 0;
  let patOctSkipped = 0;
  let patSkippedReason = { idMatch: 0, regIdMatch: 0, phoneDateMatch: 0, regDateMatch: 0, zeroAmt: 0 };

  for (const p of allPatientDocs) {
    const rawDate = p.paymentCollectedAt || p.createdAt || p.date;
    const ymd = normalizeToYMD(rawDate);
    const phone = String(p.phoneNumber || p.phone || p.mobile || '').replace(/\D/g, '').slice(-10);

    let resolvedRegId = extractCleanRegId(p);
    if (!resolvedRegId || isFirestoreAutoId(resolvedRegId)) {
      resolvedRegId = phone ? `863rk/kph` : `SPH-KPH-001`;
    }
    const regIdKey = resolvedRegId.toLowerCase().trim();

    const idMatch = Boolean(p.id && (seenTxnIds.has(p.id) || seenPatientIds.has(p.id)));
    const regIdMatch = Boolean(regIdKey && seenPatientIds.has(regIdKey));
    const phoneDateMatch = Boolean(phone && ymd && seenPhoneDates.has(`${phone}_${ymd}`));
    const regDateMatch = Boolean(regIdKey && ymd && seenRegDates.has(`${regIdKey}_${ymd}`));

    const inTransactions = idMatch || regIdMatch || phoneDateMatch || regDateMatch;
    const isOct = ymd?.startsWith('2026-10');

    if (inTransactions) {
      if (isOct) {
        patOctSkipped++;
        if (idMatch) patSkippedReason.idMatch++;
        else if (regIdMatch) patSkippedReason.regIdMatch++;
        else if (phoneDateMatch) patSkippedReason.phoneDateMatch++;
        else if (regDateMatch) patSkippedReason.regDateMatch++;
      }
      continue;
    }

    const amountPaid = extractCleanNum(p.amountPaid) || extractCleanNum(p.totalPaid) || extractCleanNum(p.paidAmount);
    if (amountPaid > 0) {
      records.push({ id: p.id, name: p.name || p.patientName, amount: amountPaid, ymd, source: 'allpatients' });
      if (isOct) patOctAdded++;
      if (phone && ymd) seenPhoneDates.add(`${phone}_${ymd}`);
      if (regIdKey && ymd) seenRegDates.add(`${regIdKey}_${ymd}`);
    } else {
      if (isOct) patSkippedReason.zeroAmt++;
    }
  }

  console.log(`allpatients October added: ${patOctAdded}, October skipped: ${patOctSkipped}`);
  console.log(`allpatients October skip breakdown:`, patSkippedReason);
  console.log(`After allpatients: total=${records.length}, October=${records.filter(r => r.ymd?.startsWith('2026-10')).length}`);

  // Step 3: appointments
  let apptOctAdded = 0;
  let apptOctSkipped = 0;
  for (const apt of appointmentDocs) {
    const rawDate = apt.appointmentDate || apt.date || apt.createdAt;
    const ymd = normalizeToYMD(rawDate);
    const phone = String(apt.phoneNumber || apt.phone || apt.mobile || '').replace(/\D/g, '').slice(-10);

    let resolvedRegId = extractCleanRegId(apt);
    if (!resolvedRegId || isFirestoreAutoId(resolvedRegId)) {
      resolvedRegId = phone ? `863rk/kph` : `SPH-KPH-001`;
    }
    const regIdKey = resolvedRegId.toLowerCase().trim();

    const inTransactions =
      (apt.id && (seenTxnIds.has(apt.id) || seenAppointmentIds.has(apt.id))) ||
      (phone && ymd && seenPhoneDates.has(`${phone}_${ymd}`)) ||
      (regIdKey && ymd && seenRegDates.has(`${regIdKey}_${ymd}`));

    const isOct = ymd?.startsWith('2026-10');
    if (inTransactions) {
      if (isOct) apptOctSkipped++;
      continue;
    }

    const consultationFee =
      extractCleanNum(apt.totalAmount) ||
      extractCleanNum(apt.amountPaid) ||
      extractCleanNum(apt.totalPaid) ||
      extractCleanNum(apt.paidAmount) ||
      extractCleanNum(apt.consultationFee);

    const paymentStatus = String(apt.paymentStatus || apt.status || '').toLowerCase();
    const isPaid = paymentStatus === 'paid' || paymentStatus === 'completed' || consultationFee > 0;

    if (consultationFee > 0 && isPaid) {
      records.push({ id: apt.id, name: apt.patientName || apt.name, amount: consultationFee, ymd, source: 'appointments' });
      if (isOct) apptOctAdded++;
      if (phone && ymd) seenPhoneDates.add(`${phone}_${ymd}`);
      if (regIdKey && ymd) seenRegDates.add(`${regIdKey}_${ymd}`);
    }
  }

  console.log(`appointments October added: ${apptOctAdded}, October skipped: ${apptOctSkipped}`);
  console.log(`After appointments: total=${records.length}, October=${records.filter(r => r.ymd?.startsWith('2026-10')).length}`);

  // Step 4: package_members
  for (const pkg of packageMemberDocs) {
    if (Array.isArray(pkg.paymentHistory) && pkg.paymentHistory.length > 0) {
      pkg.paymentHistory.forEach((inst, idx) => {
        const instAmt = extractCleanNum(inst.amount || inst.paidAmount);
        if (instAmt <= 0) return;
        const instDate = inst.date || inst.paymentDate || pkg.startDate || pkg.createdAt;
        const instYmd = normalizeToYMD(instDate);
        records.push({ id: `${pkg.id}_${idx}`, name: pkg.patientName, amount: instAmt, ymd: instYmd, source: 'package_history' });
      });
    } else {
      const pkgAmt = extractCleanNum(pkg.totalPaid) || extractCleanNum(pkg.advancePaid) || extractCleanNum(pkg.totalAmount);
      if (pkgAmt > 0) {
        const rawDate = pkg.paymentCollectedAt || pkg.enrolledDate || pkg.paymentDate || pkg.startDate || pkg.createdAt;
        const ymd = normalizeToYMD(rawDate);
        records.push({ id: pkg.id, name: pkg.patientName, amount: pkgAmt, ymd, source: 'package_direct' });
      }
    }
  }

  console.log(`FINAL TOTAL RECORDS: ${records.length}, OCTOBER: ${records.filter(r => r.ymd?.startsWith('2026-10')).length}`);
}

runTest().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
