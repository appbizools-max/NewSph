import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, setDoc, query, where } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAohSNLyeS6bYtnk2QvB4HGo0LbHDw9b6Q",
  authDomain: "spiritual-homeopathy-3b552.firebaseapp.com",
  projectId: "spiritual-homeopathy-3b552",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const extractCleanNum = (val) => {
  if (!val) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const cleaned = String(val).replace(/[^0-9.]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
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

const normalizeBranchKey = (raw = '') => {
  const s = String(raw || '').toLowerCase().trim();
  if (s.includes('kphb') || s.includes('kukatpally') || s.includes('kpb') || s.startsWith('sph-kpb')) return 'kphb';
  if (s.includes('nalla') || s.includes('nallagandla') || s.includes('ngla') || s.includes('nlg') || s.startsWith('sph-nlg')) return 'nallagandla';
  if (s.includes('dilshuk') || s.includes('dilsukh') || s.includes('dsnr') || s.includes('dsn') || s.startsWith('sph-dil') || s.includes('rk/dsnr')) return 'dilshuknagar';
  if (s.includes('chanda') || s.includes('chandnagar') || s.includes('chandanagar') || s.includes('chnr') || s.includes('chn') || s.includes('cngr') || s.startsWith('sph-chn')) return 'chandanagar';
  return '';
};

async function syncAll() {
  const branches = [
    { key: 'kphb', name: 'KPHB Branch', target: 1200000, knownWebRevenue: 491501 },
    { key: 'nallagandla', name: 'Nallagandla Branch', target: 325000, knownWebRevenue: 229400 },
    { key: 'chandanagar', name: 'Chandanagar Branch', target: 900000, knownWebRevenue: 230901 },
    { key: 'dilshuknagar', name: 'Dilshuknagar Branch', target: 225000, knownWebRevenue: 112110 },
  ];

  console.log('--- REVENUE CALCULATION FOR ALL BRANCHES (OCTOBER 2026) ---');

  for (const b of branches) {
    const aliasQueries = [b.name, b.key];
    const snap = await getDocs(query(collection(db, 'appointments'), where('branch', 'in', [b.name, b.key, b.name.replace(' Branch', '')])));
    let collectedFromAppts = 0;
    let count = 0;
    snap.forEach(d => {
      const data = d.data();
      const rawDate = data.paymentCollectedAt || data.appointmentDate || data.date || data.createdAt;
      const ymd = normalizeToYMD(rawDate);
      if (ymd && ymd.startsWith('2026-10')) {
        const s = String(data.status || '').toLowerCase();
        const p = String(data.paymentStatus || '').toLowerCase();
        const amt = extractCleanNum(data.totalPaid) || extractCleanNum(data.amountPaid) || extractCleanNum(data.paidAmount) || extractCleanNum(data.totalAmount) || extractCleanNum(data.amount);
        if ((p === 'paid' || s === 'completed' || s === 'done' || amt > 0) && amt > 0) {
          collectedFromAppts += amt;
          count++;
        }
      }
    });

    const finalRevenue = Math.max(collectedFromAppts, b.knownWebRevenue);
    const remaining = Math.max(0, b.target - finalRevenue);
    const percentage = Math.round((finalRevenue / b.target) * 100);

    console.log(`\n${b.name}:`);
    console.log(`  Appointments Count: ${count}`);
    console.log(`  Appts Sum: ₹${collectedFromAppts.toLocaleString('en-IN')}`);
    console.log(`  Known Live Web Revenue: ₹${b.knownWebRevenue.toLocaleString('en-IN')}`);
    console.log(`  FINAL REVENUE: ₹${finalRevenue.toLocaleString('en-IN')} / ₹${b.target.toLocaleString('en-IN')} (${percentage}%)`);

    // Write to branchTargets
    await setDoc(doc(db, 'branchTargets', b.key), {
      branchId: b.key,
      branchName: b.name,
      monthlyTarget: b.target,
      targetReached: finalRevenue,
      remaining: remaining,
      percentage: percentage,
      isReached: finalRevenue >= b.target,
      currentMonth: '2026-10',
      month: '2026-10',
      nextMonth: '2026-11',
      nextMonthTarget: 0,
      monthlyTargets: {
        '2026-10': b.target,
        '2026-11': 0
      },
      updatedAt: new Date().toISOString()
    }, { merge: true });
    console.log(`  ✓ Synced branchTargets/${b.key} in Firestore!`);
  }

  process.exit(0);
}

syncAll().catch(err => {
  console.error(err);
  process.exit(1);
});
