import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyAohSNLyeS6bYtnk2QvB4HGo0LbHDw9b6Q',
  authDomain: 'spiritual-homeopathy-3b552.firebaseapp.com',
  databaseURL: 'https://spiritual-homeopathy-3b552-default-rtdb.firebaseio.com',
  projectId: 'spiritual-homeopathy-3b552',
  storageBucket: 'spiritual-homeopathy-3b552.firebasestorage.app',
  messagingSenderId: '81822616559',
  appId: '1:81822616559:web:98a0b9cd974938cc87841a'
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const normalizeBranchKey = (raw = '', regId = '') => {
  const s = String(raw || '').toLowerCase().trim();
  const r = String(regId || '').toLowerCase().trim();
  if (s.includes('kphb') || s.includes('kukatpally') || s.includes('kphp') || r.includes('kphb')) return 'kphb';
  if (s.includes('nalla') || s.includes('nallagandla') || s.includes('nlg') || r.includes('nlg')) return 'nallagandla';
  if (s.includes('dilshuk') || s.includes('dilsukh') || s.includes('dsnr') || s.includes('dshnr') || r.includes('dsnr')) return 'dilshuknagar';
  if (s.includes('chanda') || s.includes('chnr') || s.includes('chandnagar') || s.includes('chandanagar') || s.includes('cngr') || r.includes('cngr')) return 'chandanagar';
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
      return y + '-' + m + '-' + d;
    }
  }
  const str = String(val).trim();
  const isoMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) return isoMatch[1] + '-' + isoMatch[2].padStart(2, '0') + '-' + isoMatch[3].padStart(2, '0');
  const ddmmyyyyMatch = str.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  if (ddmmyyyyMatch) return ddmmyyyyMatch[3] + '-' + ddmmyyyyMatch[2].padStart(2, '0') + '-' + ddmmyyyyMatch[1].padStart(2, '0');
  return '';
};

async function computeAccurateOctoberRevenue() {
  const [aptSnap, pkgSnap] = await Promise.all([
    getDocs(collection(db, 'appointments')),
    getDocs(collection(db, 'package_members')).catch(() => ({ docs: [] }))
  ]);

  const monthStr = '2026-10';
  const branchRevenue = { kphb: 0, nallagandla: 0, dilshuknagar: 0, chandanagar: 0 };
  const counts = { kphb: 0, nallagandla: 0, dilshuknagar: 0, chandanagar: 0 };
  const seenIds = new Set();

  aptSnap.forEach(docSnap => {
    const d = { id: docSnap.id, ...docSnap.data() };
    const bKey = normalizeBranchKey(d.branch || d.targetBranch || d.branchName, d.registrationId || d.regId);
    if (!branchRevenue[bKey] && branchRevenue[bKey] !== 0) return;

    const s = String(d.status || '').toLowerCase().trim();
    const p = String(d.paymentStatus || '').toLowerCase().trim();
    const isPaid = p === 'paid' || s === 'completed' || s === 'done' || (Number(d.totalPaid) > 0);
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
    counts[bKey] += 1;
  });

  if (pkgSnap.docs && pkgSnap.docs.length > 0) {
    pkgSnap.docs.forEach(docSnap => {
      const d = { id: docSnap.id, ...docSnap.data() };
      const bKey = normalizeBranchKey(d.branch || d.targetBranch || d.branchName, d.registrationId || d.regId);
      if (!branchRevenue[bKey] && branchRevenue[bKey] !== 0) return;

      const rawDate = d.paymentCollectedAt || d.startDate || d.createdAt || d.updatedAt;
      const ymd = normalizeToYMD(rawDate);
      if (!ymd || !ymd.startsWith(monthStr)) return;
      if (seenIds.has(d.id) || (d.patientDocId && seenIds.has(d.patientDocId))) return;
      seenIds.add(d.id);

      const pkgAmt = Number(d.paidAmount || d.advancePaid || d.totalAmount) || 0;
      if (pkgAmt > 0) {
        branchRevenue[bKey] += pkgAmt;
        counts[bKey] += 1;
      }
    });
  }

  console.log('Accurate October 2026 Revenue Totals:', branchRevenue);
  console.log('Counts:', counts);

  const targets = {
    kphb: { name: 'KPHB Branch', target: 725000 },
    nallagandla: { name: 'Nallagandla Branch', target: 325000 },
    dilshuknagar: { name: 'Dilshuknagar Branch', target: 225000 },
    chandanagar: { name: 'Chandanagar Branch', target: 550000 }
  };

  for (const [key, cfg] of Object.entries(targets)) {
    const reached = branchRevenue[key] || 0;
    const target = cfg.target;
    const remaining = Math.max(0, target - reached);
    const percentage = Math.round((reached / target) * 100);
    const isReached = reached >= target;

    const payload = {
      id: key,
      branchId: key,
      branchName: cfg.name,
      currentMonth: '2026-10',
      month: '2026-10',
      nextMonth: '2026-11',
      monthlyTarget: target,
      targetReached: reached,
      remaining,
      percentage,
      isReached,
      monthlyTargets: {
        '2026-10': target,
        '2026-11': 0
      },
      nextMonthTarget: 0,
      updatedAt: new Date().toISOString()
    };

    await setDoc(doc(db, 'branchTargets', key), payload, { merge: true });
    console.log(`Updated branchTargets/${key}: Target ₹${target.toLocaleString('en-IN')}, Reached ₹${reached.toLocaleString('en-IN')} (${percentage}%)`);
  }
}

computeAccurateOctoberRevenue().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
