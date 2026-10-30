import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAohSNLyeS6bYtnk2QvB4HGo0LbHDw9b6Q",
  authDomain: "spiritual-homeopathy-3b552.firebaseapp.com",
  projectId: "spiritual-homeopathy-3b552",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const extractCleanNum = (val) => {
  if (!val) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const cleaned = String(val).replace(/[^0-9.]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
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

async function checkDeduplicated() {
  const branches = ['Nallagandla Branch', 'Nallagandla', 'nallagandla', 'Nallagandla Clinic', 'NALLAGANDLA'];
  const [aptSnap, patSnap] = await Promise.all([
    getDocs(query(collection(db, 'appointments'), where('branch', 'in', branches))),
    getDocs(query(collection(db, 'allpatients'), where('branch', 'in', branches)))
  ]);

  const seenIds = new Set();
  let totalRevenue = 0;
  let paidCount = 0;

  aptSnap.forEach(d => {
    const data = d.data();
    const rawDate = data.paymentCollectedAt || data.appointmentDate || data.date || data.createdAt;
    const ymd = normalizeToYMD(rawDate);
    if (!ymd || !ymd.startsWith('2026-10')) return;

    const s = String(data.status || '').toLowerCase();
    const p = String(data.paymentStatus || '').toLowerCase();
    const isPaid = p === 'paid' || s === 'completed' || s === 'done';
    const amt = extractCleanNum(data.totalPaid) || extractCleanNum(data.amountPaid) || extractCleanNum(data.paidAmount) || extractCleanNum(data.totalAmount) || extractCleanNum(data.amount);
    if (isPaid && amt > 0) {
      if (seenIds.has(d.id)) return;
      seenIds.add(d.id);
      totalRevenue += amt;
      paidCount++;
    }
  });

  patSnap.forEach(d => {
    const data = d.data();
    const rawDate = data.paymentCollectedAt || data.appointmentDate || data.date || data.createdAt;
    const ymd = normalizeToYMD(rawDate);
    if (!ymd || !ymd.startsWith('2026-10')) return;

    const s = String(data.status || '').toLowerCase();
    const p = String(data.paymentStatus || '').toLowerCase();
    const isPaid = p === 'paid' || s === 'completed' || s === 'done';
    const amt = extractCleanNum(data.totalPaid) || extractCleanNum(data.amountPaid) || extractCleanNum(data.paidAmount) || extractCleanNum(data.totalAmount) || extractCleanNum(data.amount);
    if (isPaid && amt > 0) {
      if (seenIds.has(d.id)) return;
      seenIds.add(d.id);
      totalRevenue += amt;
      paidCount++;
    }
  });

  console.log(`DEDUPLICATED NALLAGANDLA OCTOBER REVENUE: ₹${totalRevenue.toLocaleString('en-IN')} across ${paidCount} paid appointments`);
  process.exit(0);
}

checkDeduplicated().catch(err => {
  console.error(err);
  process.exit(1);
});
