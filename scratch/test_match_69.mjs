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
  } catch (e) { }
  return '';
};

async function testMatch() {
  const [aptSnap, allpatSnap, txnSnap] = await Promise.all([
    getDocs(collection(db, 'appointments')),
    getDocs(collection(db, 'allpatients')),
    getDocs(collection(db, 'alltransactions'))
  ]);

  // Let's test only appointments:
  // Is there any subset that sums to exactly 246424?
  // User had:
  // Cash: 31224
  // UPI: 215200
  // Sum = 246424
  // Package: 24
  // Consultation & Medicine Fee: 246400
  // Let's find all October appointments where paymentStatus is paid:
  console.log('appointments size:', aptSnap.size);
  console.log('allpatients size:', allpatSnap.size);
  console.log('alltransactions size:', txnSnap.size);

  let upiSum = 0;
  let cashSum = 0;
  let count = 0;
  let matches = [];

  aptSnap.forEach(d => {
    const a = d.data();
    const rawDate = a.paymentCollectedAt || a.appointmentDate || a.date || a.createdAt;
    const ymd = normalizeToYMD(rawDate);
    if (ymd && ymd.startsWith('2026-10')) {
      const mode = String(a.paymentMode || a.paymentMethod || '').toLowerCase();
      const amt = Number(a.totalPaid || a.totalAmount || 0);
      if (amt > 0) {
        count++;
        if (mode.includes('upi')) upiSum += amt;
        else if (mode.includes('cash')) cashSum += amt;
        matches.push({ id: d.id, amt, mode, date: ymd, name: a.patientName });
      }
    }
  });

  console.log(`October appointments with totalPaid/totalAmount > 0: count = ${count}, upi = ${upiSum}, cash = ${cashSum}, total = ${upiSum + cashSum}`);

  // What about if we check allpatients?
  let patOctCount = 0;
  let patOctSum = 0;
  allpatSnap.forEach(d => {
    const p = d.data();
    const rawDate = p.paymentCollectedAt || p.appointmentDate || p.date || p.createdAt;
    const ymd = normalizeToYMD(rawDate);
    if (ymd && ymd.startsWith('2026-10')) {
      const amt = Number(p.totalPaid || p.totalAmount || 0);
      if (amt > 0) {
        patOctCount++;
        patOctSum += amt;
      }
    }
  });
  console.log(`October allpatients: count = ${patOctCount}, sum = ${patOctSum}`);

  process.exit(0);
}
testMatch();
