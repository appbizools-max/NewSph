import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, limit } from 'firebase/firestore';

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
  } catch (e) { }
  return '';
};

async function find69() {
  const snap = await getDocs(collection(db, 'appointments'));
  console.log('Total appointments:', snap.size);

  // Group by month
  const byMonth = {};
  snap.forEach(d => {
    const data = d.data();
    const rawDate = data.paymentCollectedAt || data.appointmentDate || data.date || data.createdAt;
    const ymd = normalizeToYMD(rawDate);
    const m = ymd ? ymd.slice(0, 7) : 'no_date';
    const p = String(data.paymentStatus || '').toLowerCase();
    const s = String(data.status || '').toLowerCase();
    const isPaid = p === 'paid' || s === 'completed' || s === 'paid' || Number(data.totalPaid) > 0;
    if (!byMonth[m]) byMonth[m] = { all: 0, paid: 0, paidAmt: 0 };
    byMonth[m].all++;
    if (isPaid) {
      byMonth[m].paid++;
      byMonth[m].paidAmt += Number(data.totalPaid || data.totalAmount || 0);
    }
  });

  console.log('By month:', byMonth);

  // Check what produces 69 records or ~246424
  // Could it be a specific branch or date or status?
  // Let's check October by branch:
  const octByBranch = {};
  snap.forEach(d => {
    const data = d.data();
    const rawDate = data.paymentCollectedAt || data.appointmentDate || data.date || data.createdAt;
    const ymd = normalizeToYMD(rawDate);
    if (ymd && ymd.startsWith('2026-10')) {
      const b = data.branch || data.branchName || 'unknown';
      if (!octByBranch[b]) octByBranch[b] = { count: 0, amt: 0 };
      const p = String(data.paymentStatus || '').toLowerCase();
      const s = String(data.status || '').toLowerCase();
      const isPaid = p === 'paid' || s === 'completed' || s === 'paid' || Number(data.totalPaid) > 0;
      if (isPaid) {
        octByBranch[b].count++;
        octByBranch[b].amt += Number(data.totalPaid || data.totalAmount || 0);
      }
    }
  });
  console.log('October by branch:', octByBranch);

  // What about receptionDataStore?
  // If only Today/Yesterday is loaded, how many?
  process.exit(0);
}
find69();
