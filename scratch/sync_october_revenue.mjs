import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, setDoc } from 'firebase/firestore';

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
  return 'unknown';
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

async function syncAllBranches() {
  const appSnap = await getDocs(collection(db, 'appointments'));
  const totals = {
    kphb: { total: 0, count: 0 },
    nallagandla: { total: 0, count: 0 },
    dilshuknagar: { total: 0, count: 0 },
    chandanagar: { total: 0, count: 0 }
  };

  const seenIds = new Set();

  appSnap.forEach(d => {
    const data = { id: d.id, ...d.data() };
    const bKey = normalizeBranchKey(data.branch || data.branchName);
    if (!totals[bKey]) return;

    const s = String(data.status || '').toLowerCase().trim();
    const p = String(data.paymentStatus || '').toLowerCase().trim();
    const isPaid = p === 'paid' || s === 'completed' || s === 'done' || (Number(data.totalPaid) > 0);
    if (!isPaid) return;

    const rawDate = data.paymentCollectedAt || data.appointmentDate || data.date || data.createdAt || data.updatedAt;
    const ymd = normalizeToYMD(rawDate);
    if (!ymd || !ymd.startsWith('2026-10')) return;

    if (seenIds.has(data.id)) return;
    seenIds.add(data.id);

    const paidAmt = Number(data.totalPaid || data.totalAmount || (Number(data.consultationFee || 0) + Number(data.medicineFee || 0)));
    totals[bKey].total += paidAmt;
    totals[bKey].count += 1;
  });

  console.log('October 2026 Revenue Totals for All Branches:');
  console.log(totals);

  const branchConfigs = {
    kphb: { name: 'KPHB Branch', target: 725000 },
    nallagandla: { name: 'Nallagandla Branch', target: 325000 },
    dilshuknagar: { name: 'Dilshuknagar Branch', target: 225000 },
    chandanagar: { name: 'Chandanagar Branch', target: 550000 }
  };

  for (const [key, cfg] of Object.entries(branchConfigs)) {
    const reached = totals[key].total;
    const target = cfg.target;
    const remaining = Math.max(0, target - reached);
    const percentage = Math.round((reached / target) * 100);

    const docRef = doc(db, 'branchTargets', key);
    await setDoc(docRef, {
      id: key,
      branchId: key,
      branchName: cfg.name,
      month: '2026-10',
      monthlyTarget: target,
      targetReached: reached,
      remaining,
      percentage,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    console.log(`Synced ${cfg.name}: Reached ₹${reached.toLocaleString('en-IN')}, Target ₹${target.toLocaleString('en-IN')} (${percentage}%)`);
  }
}

syncAllBranches().then(() => process.exit(0));
