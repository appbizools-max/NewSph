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

async function test10() {
  const allTxnSnap = await getDocs(collection(db, 'alltransactions'));
  const allPatSnap = await getDocs(collection(db, 'allpatients'));

  const seenTxnIds = new Set();
  const seenAppointmentIds = new Set();
  const seenPatientIds = new Set();
  const seenPhoneDates = new Set();
  const seenRegDates = new Set();

  allTxnSnap.forEach(doc => {
    const item = doc.data();
    const rawDate = item.timestamp || item.date || item.createdAt;
    const ymd = normalizeToYMD(rawDate);
    const phone = String(item.phoneNumber || item.phone || item.mobile || '').replace(/\D/g, '').slice(-10);

    let resolvedRegId = extractCleanRegId(item);
    if (!resolvedRegId || isFirestoreAutoId(resolvedRegId)) {
      resolvedRegId = phone ? `863rk/kph` : `SPH-KPH-001`;
    }
    const regIdKey = resolvedRegId.toLowerCase().trim();

    if (doc.id) seenTxnIds.add(String(doc.id));
    if (item.appointmentId) seenAppointmentIds.add(String(item.appointmentId));
    if (item.patientDocId) seenPatientIds.add(String(item.patientDocId));
    if (regIdKey) seenPatientIds.add(regIdKey);
    if (phone && ymd) seenPhoneDates.add(`${phone}_${ymd}`);
    if (regIdKey && ymd) seenRegDates.add(`${regIdKey}_${ymd}`);
  });

  console.log(`seenPatientIds size: ${seenPatientIds.size}, seenPatientIds has "863rk/kph": ${seenPatientIds.has("863rk/kph")}`);

  // Test 10 October records from allpatients
  let octTested = 0;
  for (const doc of allPatSnap.docs) {
    const p = doc.data();
    const rawDate = p.paymentCollectedAt || p.createdAt || p.date;
    const ymd = normalizeToYMD(rawDate);
    if (!ymd?.startsWith('2026-10')) continue;

    octTested++;
    if (octTested > 10) break;

    const phone = String(p.phoneNumber || p.phone || p.mobile || '').replace(/\D/g, '').slice(-10);
    let resolvedRegId = extractCleanRegId(p);
    if (!resolvedRegId || isFirestoreAutoId(resolvedRegId)) {
      resolvedRegId = phone ? `863rk/kph` : `SPH-KPH-001`;
    }
    const regIdKey = resolvedRegId.toLowerCase().trim();

    const c1 = Boolean(p.id && (seenTxnIds.has(p.id) || seenPatientIds.has(p.id)));
    const c2 = Boolean(regIdKey && seenPatientIds.has(regIdKey));
    const c3 = Boolean(phone && ymd && seenPhoneDates.has(`${phone}_${ymd}`));
    const c4 = Boolean(regIdKey && ymd && seenRegDates.has(`${regIdKey}_${ymd}`));

    const inTransactions = c1 || c2 || c3 || c4;
    const amountPaid = extractCleanNum(p.amountPaid) || extractCleanNum(p.totalPaid) || extractCleanNum(p.paidAmount);

    console.log(`[PAT ${octTested}] ${p.patientName || p.name} | ymd: ${ymd} | phone: ${phone} | regId: ${regIdKey} | amt: ${amountPaid}`);
    console.log(`   inTransactions=${inTransactions} (c1(id)=${c1}, c2(regId)=${c2}, c3(phoneDate)=${c3}, c4(regDate)=${c4})`);
  }
}

test10().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
