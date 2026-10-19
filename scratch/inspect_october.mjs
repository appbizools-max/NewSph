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

const toDateOrString = (raw) => {
  if (!raw) return 'NO_DATE';
  if (raw && typeof raw === 'object') {
    if (typeof raw.toDate === 'function') return raw.toDate().toISOString();
    if (typeof raw.seconds === 'number') return new Date(raw.seconds * 1000).toISOString();
  }
  return String(raw);
};

async function inspectOctober() {
  console.log('--- Inspecting alltransactions for October 2026 or Recent Dates ---');
  const allTxnSnap = await getDocs(collection(db, 'alltransactions'));
  console.log(`Total alltransactions in DB: ${allTxnSnap.size}`);

  const octTxns = [];
  const monthDist = {};

  allTxnSnap.forEach(doc => {
    const d = doc.data();
    const rawDate = d.timestamp || d.date || d.createdAt || d.paymentCollectedAt;
    const dateStr = toDateOrString(rawDate);
    const ymd = dateStr.slice(0, 7); // e.g. "2026-10"
    monthDist[ymd] = (monthDist[ymd] || 0) + 1;

    if (dateStr.includes('2026-10') || dateStr.includes('10/2026') || dateStr.includes('-10-2026')) {
      octTxns.push({ id: doc.id, patient: d.patientName || d.name, amount: d.amount || d.totalAmount, date: dateStr, rawFields: { timestamp: d.timestamp, date: d.date, createdAt: d.createdAt } });
    }
  });

  console.log('Month Distribution in alltransactions:', monthDist);
  console.log(`October Transactions in alltransactions (${octTxns.length}):`);
  octTxns.forEach(t => console.log(' ', t));

  console.log('\n--- Inspecting appointments for October 2026 ---');
  const apptSnap = await getDocs(collection(db, 'appointments'));
  console.log(`Total appointments in DB: ${apptSnap.size}`);
  const octAppts = [];
  const apptMonthDist = {};
  apptSnap.forEach(doc => {
    const d = doc.data();
    const rawDate = d.appointmentDate || d.date || d.createdAt;
    const dateStr = toDateOrString(rawDate);
    const ymd = dateStr.slice(0, 7);
    apptMonthDist[ymd] = (apptMonthDist[ymd] || 0) + 1;
    if (dateStr.includes('2026-10') || dateStr.includes('10/2026') || dateStr.includes('-10-2026')) {
      octAppts.push({ id: doc.id, patient: d.patientName || d.name, amount: d.amount || d.consultationFee, status: d.status, paymentStatus: d.paymentStatus, date: dateStr });
    }
  });
  console.log('Month Distribution in appointments:', apptMonthDist);
  console.log(`October Appointments (${octAppts.length}):`);
  octAppts.forEach(a => console.log(' ', a));

  console.log('\n--- Inspecting allpatients for October 2026 ---');
  const patSnap = await getDocs(collection(db, 'allpatients'));
  console.log(`Total allpatients in DB: ${patSnap.size}`);
  const octPats = [];
  const patMonthDist = {};
  patSnap.forEach(doc => {
    const d = doc.data();
    const rawDate = d.paymentCollectedAt || d.createdAt || d.date;
    const dateStr = toDateOrString(rawDate);
    const ymd = dateStr.slice(0, 7);
    patMonthDist[ymd] = (patMonthDist[ymd] || 0) + 1;
    if (dateStr.includes('2026-10') || dateStr.includes('10/2026') || dateStr.includes('-10-2026')) {
      octPats.push({ id: doc.id, patient: d.patientName || d.name, totalPaid: d.totalPaid || d.amount, date: dateStr });
    }
  });
  console.log('Month Distribution in allpatients:', patMonthDist);
  console.log(`October AllPatients with payments (${octPats.length}):`);
  octPats.slice(0, 20).forEach(p => console.log(' ', p));
}

inspectOctober().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
