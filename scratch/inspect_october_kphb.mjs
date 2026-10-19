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

async function inspect() {
  const collections = ['alltransactions', 'allpatients', 'appointments', 'package_members'];
  const allDocs = {};
  for (const c of collections) {
    const snap = await getDocs(collection(db, c));
    allDocs[c] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    console.log(`${c} count: ${allDocs[c].length}`);
  }

  // Check alltransactions for October 2026 and KPHB
  let kphbTxnsOct = 0;
  let kphbTxnsTotal = 0;
  let octTxnsTotal = 0;

  for (const t of allDocs['alltransactions']) {
    const dStr = String(t.date || t.appointmentDate || t.createdAt || t.dateTime || '');
    const bStr = String(t.branch || t.branchName || '').toLowerCase();
    const amt = Number(String(t.totalAmount || t.amount || t.totalPaid || 0).replace(/[^0-9.]/g, '')) || 0;
    
    if (dStr.includes('2026-10') || dStr.includes('/10/2026') || dStr.includes('-10-2026')) {
      octTxnsTotal += amt;
      if (bStr.includes('kphb')) {
        kphbTxnsOct += amt;
      }
    }
    if (bStr.includes('kphb')) {
      kphbTxnsTotal += amt;
    }
  }

  console.log(`alltransactions: October total = ${octTxnsTotal}, KPHB October = ${kphbTxnsOct}, KPHB All Time = ${kphbTxnsTotal}`);

  // Let's inspect appointments for KPHB in October
  let apptOctKphb = 0;
  let apptOctKphbCount = 0;
  for (const a of allDocs['appointments']) {
    const dStr = String(a.appointmentDate || a.date || a.createdAt || '');
    const bStr = String(a.branch || a.branchName || '').toLowerCase();
    const amt = Number(String(a.totalPaid || a.targetAmount || a.amount || a.paidAmount || 0).replace(/[^0-9.]/g, '')) || 0;
    if ((dStr.includes('2026-10') || dStr.includes('/10/2026') || dStr.includes('-10-2026')) && bStr.includes('kphb')) {
      apptOctKphb += amt;
      apptOctKphbCount++;
    }
  }
  console.log(`appointments: KPHB October = ${apptOctKphb} across ${apptOctKphbCount} appointments`);

  // Let's inspect allpatients for KPHB in October
  let patOctKphb = 0;
  let patOctKphbCount = 0;
  for (const p of allDocs['allpatients']) {
    const dStr = String(p.appointmentDate || p.date || p.createdAt || '');
    const bStr = String(p.branch || p.branchName || '').toLowerCase();
    const amt = Number(String(p.totalPaid || p.targetAmount || p.amount || p.paidAmount || 0).replace(/[^0-9.]/g, '')) || 0;
    if ((dStr.includes('2026-10') || dStr.includes('/10/2026') || dStr.includes('-10-2026')) && bStr.includes('kphb')) {
      patOctKphb += amt;
      patOctKphbCount++;
    }
  }
  console.log(`allpatients: KPHB October = ${patOctKphb} across ${patOctKphbCount} patients`);
}

inspect().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
