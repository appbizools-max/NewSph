import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, orderBy, limit } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAohSNLyeS6bYtnk2QvB4HGo0LbHDw9b6Q",
  authDomain: "spiritual-homeopathy-3b552.firebaseapp.com",
  projectId: "spiritual-homeopathy-3b552",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function check() {
  console.log('Testing queries...');
  try {
    const qTxn = query(collection(db, 'alltransactions'), orderBy('timestamp', 'desc'), limit(1000));
    const snapTxn = await getDocs(qTxn);
    console.log('alltransactions with orderBy timestamp desc count:', snapTxn.size);
  } catch (e) {
    console.error('FAILED alltransactions orderBy timestamp:', e.message);
  }

  try {
    const qApp = query(collection(db, 'appointments'), orderBy('createdAt', 'desc'), limit(1000));
    const snapApp = await getDocs(qApp);
    console.log('appointments with orderBy createdAt desc count:', snapApp.size);
    let octCount = 0;
    let totalAmt = 0;
    snapApp.forEach(d => {
      const data = d.data();
      const p = String(data.paymentStatus || '').toLowerCase();
      const s = String(data.status || '').toLowerCase();
      const isPaid = p === 'paid' || s === 'completed' || s === 'paid' || Number(data.totalPaid) > 0;
      const rawDate = data.paymentCollectedAt || data.appointmentDate || data.date || data.createdAt;
      const str = String(rawDate || '');
      if (isPaid && (str.includes('2026-10') || str.includes('10/2026') || str.includes('2026/10'))) {
        octCount++;
        totalAmt += Number(data.totalPaid || data.totalAmount || 0);
      }
    });
    console.log('From appointments orderBy createdAt desc: October paid:', octCount, 'total amount:', totalAmt);
  } catch (e) {
    console.error('FAILED appointments orderBy createdAt:', e.message);
  }

  try {
    // What if alltransactions without orderBy?
    const rawTxn = await getDocs(query(collection(db, 'alltransactions'), limit(1000)));
    console.log('alltransactions WITHOUT orderBy count:', rawTxn.size);
    let octTxnCount = 0;
    let octTxnAmt = 0;
    rawTxn.forEach(d => {
      const data = d.data();
      const rawDate = data.createdAt || data.timestamp || data.paymentCollectedAt || data.date;
      const str = String(rawDate || '');
      if (str.includes('2026-10') || str.includes('10/2026')) {
        octTxnCount++;
        octTxnAmt += Number(data.amount || data.totalAmount || 0);
      }
    });
    console.log('alltransactions October count:', octTxnCount, 'amount:', octTxnAmt);
  } catch (e) {
    console.error('FAILED alltransactions raw:', e.message);
  }

  process.exit(0);
}

check();
