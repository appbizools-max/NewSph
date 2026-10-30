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

// Let's run the exact parsing logic from AnalyticsRevenuePage.tsx!
async function main() {
  const [txnsSnap, patsSnap, aptsSnap, pkgsSnap] = await Promise.all([
    getDocs(collection(db, 'alltransactions')),
    getDocs(collection(db, 'allpatients')),
    getDocs(collection(db, 'appointments')),
    getDocs(collection(db, 'package_members'))
  ]);

  const allTxnDocs = txnsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const allPatientDocs = patsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const appointmentDocs = aptsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const packageMemberDocs = pkgsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  console.log(`Docs: txns=${allTxnDocs.length}, pats=${allPatientDocs.length}, apts=${appointmentDocs.length}, pkgs=${packageMemberDocs.length}`);

  // Look for Nihal, Devansh, Hymavathi specifically in appointmentDocs for 2026-10-23
  const targetNames = ['nihal', 'devansh', 'hymavathi'];
  const matched = appointmentDocs.filter(a => {
    const name = String(a.patientName || a.name || a.fullName || '').toLowerCase();
    const isTarget = targetNames.some(t => name.includes(t));
    const d = String(a.appointmentDate || a.date || a.createdAt || '');
    return isTarget && d.includes('23');
  });

  console.log('\nMatched 23-10 appointments:');
  matched.forEach(m => {
    console.log({
      id: m.id,
      name: m.patientName || m.name,
      phone: m.phone || m.phoneNumber,
      regId: m.registrationId || m.regId,
      status: m.status,
      paymentStatus: m.paymentStatus,
      appointmentDate: m.appointmentDate,
      date: m.date,
      createdAt: m.createdAt,
      totalPaid: m.totalPaid,
      consultationFee: m.consultationFee
    });
  });

  // Check if any of these IDs are in alltransactions
  matched.forEach(m => {
    const inTxn = allTxnDocs.filter(t => t.id === m.id || t.appointmentId === m.id || (t.phone && t.phone === m.phone));
    console.log(`Appointment ${m.id} (${m.name}) matches in alltransactions:`, inTxn.length);
    if (inTxn.length > 0) {
      inTxn.forEach(t => console.log('   Txn:', { id: t.id, name: t.patientName || t.name, date: t.date || t.timestamp, amt: t.amount }));
    }
  });

  process.exit(0);
}

main();
