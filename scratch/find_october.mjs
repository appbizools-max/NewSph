import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';

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

async function findOctober() {
  console.log('Querying appointments for October...');
  const apptSnap = await getDocs(collection(db, 'appointments'));
  console.log('Total appointments:', apptSnap.size);

  let octCount = 0;
  let octPaidCount = 0;
  const sampleOct = [];

  apptSnap.forEach(doc => {
    const d = doc.data();
    const str = JSON.stringify(d);
    // Check if any date field contains 2026-10 or 10-2026 or /10/2026 or October
    const dDate = d.appointmentDate || d.date || d.paymentCollectedAt || d.createdAt || '';
    const dateStr = typeof dDate === 'object' && dDate.toDate ? dDate.toDate().toISOString() : String(dDate);

    if (dateStr.includes('2026-10') || dateStr.includes('-10-2026') || dateStr.includes('/10/2026') || dateStr.includes('10-2026')) {
      octCount++;
      const isPaid = d.paymentStatus === 'PAID' || d.status === 'completed' || d.totalAmountDue > 0 || d.amountPaid > 0 || d.totalPaid > 0;
      if (isPaid) octPaidCount++;
      if (sampleOct.length < 15) {
        sampleOct.push({ id: doc.id, name: d.patientName || d.name, date: dateStr, apptDate: d.appointmentDate, paymentStatus: d.paymentStatus, status: d.status, totalPaid: d.totalPaid || d.amountPaid || d.totalAmount || d.amount });
      }
    }
  });

  console.log(`October Appointments found: ${octCount}, with payment: ${octPaidCount}`);
  console.log('Sample October Appointments:', sampleOct);

  // Check allpatients
  const patSnap = await getDocs(collection(db, 'allpatients'));
  console.log('\nTotal allpatients:', patSnap.size);
  let octPatCount = 0;
  const samplePat = [];
  patSnap.forEach(doc => {
    const d = doc.data();
    const dDate = d.paymentCollectedAt || d.createdAt || d.date || d.appointmentDate || '';
    const dateStr = typeof dDate === 'object' && dDate.toDate ? dDate.toDate().toISOString() : String(dDate);

    if (dateStr.includes('2026-10') || dateStr.includes('-10-2026') || dateStr.includes('/10/2026')) {
      octPatCount++;
      if (samplePat.length < 15) {
        samplePat.push({ id: doc.id, name: d.patientName || d.name, date: dateStr, totalPaid: d.totalPaid, status: d.status });
      }
    }
  });
  console.log(`October AllPatients found: ${octPatCount}`);
  console.log('Sample October AllPatients:', samplePat);
}

findOctober().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
