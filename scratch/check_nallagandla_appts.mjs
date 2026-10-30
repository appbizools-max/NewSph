import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAohSNLyeS6bYtnk2QvB4HGo0LbHDw9b6Q",
  authDomain: "spiritual-homeopathy-3b552.firebaseapp.com",
  projectId: "spiritual-homeopathy-3b552",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

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
  } catch (e) {}
  return '';
};

const isNallagandla = (raw = '') => {
  const s = String(raw || '').toLowerCase().trim();
  return s.includes('nalla') || s.includes('nallagandla') || s.includes('ngla') || s.includes('nlg') || s.startsWith('sph-nlg');
};

const extractCleanNum = (val) => {
  if (!val) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const cleaned = String(val).replace(/[^0-9.]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
};

async function checkNallagandlaAppointments() {
  console.log('Querying appointments...');
  const aptSnap = await getDocs(collection(db, 'appointments'));
  let aptTotal = 0;
  const aptList = [];

  aptSnap.forEach(d => {
    const data = d.data();
    const b = data.branch || data.branchName || data.targetBranch || data.registrationId || data.regId;
    if (!isNallagandla(b)) return;

    const rawDate = data.paymentCollectedAt || data.appointmentDate || data.date || data.createdAt || data.updatedAt;
    const ymd = normalizeToYMD(rawDate);
    if (!ymd || !ymd.startsWith('2026-10')) return;

    const amt = extractCleanNum(data.totalPaid) || extractCleanNum(data.amountPaid) || extractCleanNum(data.paidAmount) || extractCleanNum(data.totalAmount) || extractCleanNum(data.amount);
    aptTotal += amt;
    aptList.push({
      id: d.id,
      patient: data.patientName || data.name,
      date: ymd,
      amount: amt,
      status: data.status,
      paymentStatus: data.paymentStatus
    });
  });

  console.log(`Appointments for Nallagandla in Oct 2026: ${aptList.length} items, Total = ₹${aptTotal}`);
  aptList.forEach((a, i) => {
    console.log(`  [${i + 1}] ${a.date} | ${a.patient} | ₹${a.amount} | status: ${a.status} | payment: ${a.paymentStatus}`);
  });

  console.log('\nQuerying allpatients...');
  const patSnap = await getDocs(collection(db, 'allpatients'));
  let patTotal = 0;
  const patList = [];

  patSnap.forEach(d => {
    const data = d.data();
    const b = data.branch || data.branchName || data.targetBranch || data.registrationId || data.regId;
    if (!isNallagandla(b)) return;

    const rawDate = data.paymentCollectedAt || data.appointmentDate || data.date || data.createdAt || data.updatedAt;
    const ymd = normalizeToYMD(rawDate);
    if (!ymd || !ymd.startsWith('2026-10')) return;

    const amt = extractCleanNum(data.totalPaid) || extractCleanNum(data.amountPaid) || extractCleanNum(data.paidAmount) || extractCleanNum(data.totalAmount) || extractCleanNum(data.amount);
    patTotal += amt;
    patList.push({
      id: d.id,
      patient: data.patientName || data.name,
      date: ymd,
      amount: amt,
      status: data.status,
      paymentStatus: data.paymentStatus
    });
  });

  console.log(`allpatients for Nallagandla in Oct 2026: ${patList.length} items, Total = ₹${patTotal}`);
  patList.forEach((p, i) => {
    console.log(`  [${i + 1}] ${p.date} | ${p.patient} | ₹${p.amount} | status: ${p.status} | payment: ${p.paymentStatus}`);
  });

  process.exit(0);
}

checkNallagandlaAppointments().catch(err => {
  console.error(err);
  process.exit(1);
});
