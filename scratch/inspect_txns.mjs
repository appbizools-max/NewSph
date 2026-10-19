import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, orderBy, limit } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAohSNLyeS6bYtnk2QvB4HGo0LbHDw9b6Q",
  authDomain: "spiritual-homeopathy-3b552.firebaseapp.com",
  projectId: "spiritual-homeopathy-3b552",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function inspectTxn() {
  const qTxn = query(collection(db, 'alltransactions'), orderBy('timestamp', 'desc'), limit(1000));
  const snap = await getDocs(qTxn);
  let octCount = 0;
  let octAmt = 0;
  snap.forEach(d => {
    const data = d.data();
    const rawDate = data.createdAt || data.timestamp || data.paymentCollectedAt || data.date;
    const str = String(rawDate || '');
    if (str.includes('2026-10') || str.includes('10/2026')) {
      octCount++;
      octAmt += Number(data.amount || data.totalAmount || 0);
    }
  });
  console.log('alltransactions with orderBy timestamp desc: October count =', octCount, 'octAmt =', octAmt);

  // Now inspect what gave exactly 69 transactions and ₹2,46,424 !
  // Let's check appointments where status='completed' or paymentStatus='paid' or...
  process.exit(0);
}
inspectTxn();
