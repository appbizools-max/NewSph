import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

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

async function main() {
  const snap = await getDocs(collection(db, 'appointments'));
  const names = ['nihal', 'devansh', 'hymavathi', 'sneha'];

  snap.docs.forEach(d => {
    const data = d.data();
    const name = String(data.patientName || data.name || '').toLowerCase();
    if (names.some(n => name.includes(n))) {
      console.log(`ID: ${d.id}`);
      console.log(`Name: ${data.patientName || data.name}`);
      console.log(`Branch: ${data.branch || data.branchName}`);
      console.log(`Status: ${data.status}`);
      console.log(`PaymentStatus: ${data.paymentStatus}`);
      console.log(`Date fields:`, {
        appointmentDate: data.appointmentDate,
        date: data.date,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        paymentCollectedAt: data.paymentCollectedAt,
        paidAt: data.paidAt,
        paymentDate: data.paymentDate
      });
      console.log(`Fee fields:`, {
        totalPaid: data.totalPaid,
        totalAmount: data.totalAmount,
        amountPaid: data.amountPaid,
        consultationFee: data.consultationFee,
        fee: data.fee
      });
      console.log('-------------------------------------------');
    }
  });
  process.exit(0);
}

main();
