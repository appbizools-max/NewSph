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

const isGenericFallback = (reg) => {
  if (!reg) return true;
  const lower = reg.toLowerCase().trim();
  return lower.startsWith('863rk') || lower.startsWith('sph-') && lower.endsWith('-001');
};

async function testFixedDeduplication() {
  const [allTxnSnap, allPatSnap, apptSnap, pkgSnap] = await Promise.all([
    getDocs(query(collection(db, 'alltransactions'), limit(3000))),
    getDocs(query(collection(db, 'allpatients'), limit(2500))),
    getDocs(query(collection(db, 'appointments'), limit(2500))),
    getDocs(query(collection(db, 'package_members'), limit(1000)))
  ]);

  const allTxnDocs = allTxnSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const allPatientDocs = allPatSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const appointmentDocs = apptSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const packageMemberDocs = pkgSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const seenTxnIds = new Set();
  const seenAppointmentIds = new Set();
  const seenPhoneDates = new Set();
  const seenRegDates = new Set();

  const records = [];

  // Step 1: alltransactions
  for (const item of allTxnDocs) {
    const rawDate = item.timestamp || item.date || item.createdAt;
    const ymd = normalizeToYMD(rawDate);
    const phone = String(item.phoneNumber || item.phone || item.mobile || '').replace(/\D/g, '').slice(-10);
    const regId = (item.registrationId || item.regId || '').toLowerCase().trim();

    if (item.id) seenTxnIds.add(String(item.id));
    if (item.appointmentId) seenAppointmentIds.add(String(item.appointmentId));
    if (phone && ymd) seenPhoneDates.add(`${phone}_${ymd}`);
    if (regId && !isGenericFallback(regId) && ymd) seenRegDates.add(`${regId}_${ymd}`);

    const totalAmount = extractCleanNum(item.amount) || extractCleanNum(item.totalAmount) || (extractCleanNum(item.consultationFee) + extractCleanNum(item.medicineFee));
    if (totalAmount > 0) {
      records.push({ id: item.id, name: item.patientName, amount: totalAmount, ymd, source: 'alltransactions' });
    }
  }

  // Step 2: allpatients (Direct dues & payments where not already recorded in alltransactions on that date)
  let patAdded = 0;
  for (const p of allPatientDocs) {
    const rawDate = p.paymentCollectedAt || p.createdAt || p.date;
    const ymd = normalizeToYMD(rawDate);
    const phone = String(p.phoneNumber || p.phone || p.mobile || '').replace(/\D/g, '').slice(-10);
    const regId = (p.registrationId || p.regId || '').toLowerCase().trim();

    // Deduplicate: same document ID OR same patient phone on the same day OR same unique regId on the same day
    const isDuplicate =
      (p.id && seenTxnIds.has(p.id)) ||
      (phone && ymd && seenPhoneDates.has(`${phone}_${ymd}`)) ||
      (regId && !isGenericFallback(regId) && ymd && seenRegDates.has(`${regId}_${ymd}`));

    if (isDuplicate) continue;

    const amountPaid = extractCleanNum(p.amountPaid) || extractCleanNum(p.totalPaid) || extractCleanNum(p.paidAmount);
    if (amountPaid > 0) {
      records.push({ id: p.id, name: p.name || p.patientName, amount: amountPaid, ymd, source: 'allpatients' });
      patAdded++;
      if (p.id) seenTxnIds.add(p.id);
      if (phone && ymd) seenPhoneDates.add(`${phone}_${ymd}`);
      if (regId && !isGenericFallback(regId) && ymd) seenRegDates.add(`${regId}_${ymd}`);
    }
  }

  // Step 3: appointments (Consultation collections where not in alltransactions or patient direct billing)
  let apptAdded = 0;
  for (const apt of appointmentDocs) {
    const rawDate = apt.appointmentDate || apt.paymentCollectedAt || apt.date || apt.createdAt;
    const ymd = normalizeToYMD(rawDate);
    const phone = String(apt.phoneNumber || apt.phone || apt.mobile || '').replace(/\D/g, '').slice(-10);
    const regId = (apt.registrationId || apt.regId || '').toLowerCase().trim();

    const isDuplicate =
      (apt.id && (seenTxnIds.has(apt.id) || seenAppointmentIds.has(apt.id))) ||
      (phone && ymd && seenPhoneDates.has(`${phone}_${ymd}`)) ||
      (regId && !isGenericFallback(regId) && ymd && seenRegDates.has(`${regId}_${ymd}`));

    if (isDuplicate) continue;

    const fee = extractCleanNum(apt.totalPaid) || extractCleanNum(apt.amountPaid) || extractCleanNum(apt.totalAmount) || extractCleanNum(apt.consultationFee);
    const isPaid = apt.paymentStatus === 'paid' || apt.status === 'completed' || fee > 0;

    if (fee > 0 && isPaid) {
      records.push({ id: apt.id, name: apt.patientName || apt.name, amount: fee, ymd, source: 'appointments' });
      apptAdded++;
      if (apt.id) seenAppointmentIds.add(apt.id);
      if (phone && ymd) seenPhoneDates.add(`${phone}_${ymd}`);
      if (regId && !isGenericFallback(regId) && ymd) seenRegDates.add(`${regId}_${ymd}`);
    }
  }

  // Step 4: package_members (Care Packages)
  for (const pkg of packageMemberDocs) {
    const phone = String(pkg.phoneNumber || pkg.phone || pkg.mobile || '').replace(/\D/g, '').slice(-10);
    if (Array.isArray(pkg.paymentHistory) && pkg.paymentHistory.length > 0) {
      pkg.paymentHistory.forEach((inst, idx) => {
        const instAmt = extractCleanNum(inst.amount || inst.paidAmount);
        if (instAmt <= 0) return;
        const instDate = inst.date || inst.paymentDate || pkg.startDate || pkg.createdAt;
        const instYmd = normalizeToYMD(instDate);
        if (phone && instYmd && seenPhoneDates.has(`${phone}_${instYmd}`)) return; // Deduplicate against alltransactions!
        records.push({ id: `${pkg.id}_inst_${idx}`, name: pkg.patientName, amount: instAmt, ymd: instYmd, source: 'package_history' });
      });
    } else {
      const pkgAmt = extractCleanNum(pkg.totalPaid) || extractCleanNum(pkg.advancePaid) || extractCleanNum(pkg.totalAmount);
      if (pkgAmt > 0) {
        const rawDate = pkg.paymentCollectedAt || pkg.enrolledDate || pkg.paymentDate || pkg.startDate || pkg.createdAt;
        const ymd = normalizeToYMD(rawDate);
        if (phone && ymd && seenPhoneDates.has(`${phone}_${ymd}`)) return;
        records.push({ id: pkg.id, name: pkg.patientName, amount: pkgAmt, ymd, source: 'package_direct' });
      }
    }
  }

  const octRecords = records.filter(r => r.ymd?.startsWith('2026-10'));
  const octTotalRevenue = octRecords.reduce((sum, r) => sum + r.amount, 0);

  console.log(`\n=== FIXED RESULTS ===`);
  console.log(`Total Records Across All Time: ${records.length}`);
  console.log(`Total October Records Found: ${octRecords.length}`);
  console.log(`Total October Revenue: ₹${octTotalRevenue.toLocaleString('en-IN')}`);
  console.log(`October Breakdown by source:`);
  const srcCount = {};
  octRecords.forEach(r => srcCount[r.source] = (srcCount[r.source] || 0) + 1);
  console.log(srcCount);
  console.log(`Sample October Records (first 10):`);
  octRecords.slice(0, 10).forEach(r => console.log(`   ${r.ymd} | ${r.name} | ₹${r.amount} (${r.source})`));
}

testFixedDeduplication().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
