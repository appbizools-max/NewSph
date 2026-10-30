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

const normalizeBranchKey = (raw = '') => {
  const s = String(raw || '').toLowerCase().trim();
  if (s.includes('kphb') || s.includes('kukatpally')) return 'kphb';
  if (s.includes('nalla') || s.includes('nallagandla')) return 'nallagandla';
  if (s.includes('dilshuk') || s.includes('dilsukh') || s.includes('dsnr') || s.includes('dshnr')) return 'dilshuknagar';
  if (s.includes('chanda') || s.includes('chnr') || s.includes('chandanagar')) return 'chandanagar';
  return 'kphb';
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

async function testRevenue() {
  const [aptSnap, pkgSnap, txnSnap] = await Promise.all([
    getDocs(collection(db, 'appointments')),
    getDocs(collection(db, 'package_members')).catch(() => ({ size: 0, forEach: () => {} })),
    getDocs(collection(db, 'alltransactions')).catch(() => ({ size: 0, forEach: () => {} }))
  ]);

  console.log(`Appointments: ${aptSnap.size}, Package Members: ${pkgSnap.size}, AllTransactions: ${txnSnap.size}`);

  const monthStr = '2026-10';
  const branchRevenue = { kphb: 0, nallagandla: 0, dilshuknagar: 0, chandanagar: 0 };
  const branchCounts = { kphb: 0, nallagandla: 0, dilshuknagar: 0, chandanagar: 0 };
  const seenIds = new Set();

  aptSnap.forEach(docSnap => {
    const d = { id: docSnap.id, ...docSnap.data() };
    const bKey = normalizeBranchKey(d.branch || d.targetBranch || d.branchName);
    const s = String(d.status || '').toLowerCase().trim();
    const p = String(d.paymentStatus || '').toLowerCase().trim();
    const isPaid = p === 'paid' || s === 'completed' || s === 'done' || s === 'paid' || (Number(d.totalPaid) > 0);
    if (!isPaid) return;

    const rawDate = d.paymentCollectedAt || d.appointmentDate || d.date || d.createdAt || d.updatedAt;
    const ymd = normalizeToYMD(rawDate);
    if (!ymd || !ymd.startsWith(monthStr)) return;

    if (seenIds.has(d.id)) return;
    seenIds.add(d.id);

    let paidAmt = 0;
    if (d.totalPaid !== undefined && d.totalPaid !== null && Number(d.totalPaid) > 0) {
      paidAmt = Number(d.totalPaid);
    } else if (d.totalAmount !== undefined && d.totalAmount !== null && Number(d.totalAmount) > 0) {
      paidAmt = Number(d.totalAmount);
    } else {
      const c = Number(d.consultationFee) || 0;
      const m = Number(d.medicineFee || d.pharmacyFee || d.medicineFeeRequested) || 0;
      const o = Number(d.otherCharges) || 0;
      const pFee = Number(d.packageFee || d.packageAdvancePaid) || 0;
      const disc = Number(d.discount) || 0;
      paidAmt = Math.max(0, c + m + o + pFee - disc);
    }

    branchRevenue[bKey] += paidAmt;
    branchCounts[bKey] += 1;
  });

  if (pkgSnap.size > 0) {
    pkgSnap.forEach(docSnap => {
      const d = { id: docSnap.id, ...docSnap.data() };
      const bKey = normalizeBranchKey(d.branch || d.targetBranch || d.branchName);
      const rawDate = d.paymentCollectedAt || d.startDate || d.createdAt || d.updatedAt;
      const ymd = normalizeToYMD(rawDate);
      if (!ymd || !ymd.startsWith(monthStr)) return;
      if (seenIds.has(d.id) || (d.patientDocId && seenIds.has(d.patientDocId))) return;
      seenIds.add(d.id);

      const pkgAmt = Number(d.paidAmount || d.advancePaid || d.totalAmount) || 0;
      if (pkgAmt > 0) {
        branchRevenue[bKey] += pkgAmt;
        branchCounts[bKey] += 1;
      }
    });
  }

  console.log('October 2026 Authoritative Revenue Result:');
  console.log(branchRevenue);
  console.log('Transaction counts:');
  console.log(branchCounts);
}

testRevenue().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
