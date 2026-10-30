import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAohSNLyeS6bYtnk2QvB4HGo0LbHDw9b6Q",
  authDomain: "spiritual-homeopathy-3b552.firebaseapp.com",
  projectId: "spiritual-homeopathy-3b552",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Let's import calculateRealBranchRevenue from web or mobile or recreate it
const normalizeBranchKey = (raw = '') => {
  const s = String(raw || '').toLowerCase().trim();
  if (s.includes('kphb') || s.includes('kukatpally') || s.includes('kpb') || s.startsWith('sph-kpb')) return 'kphb';
  if (s.includes('nalla') || s.includes('nallagandla') || s.includes('ngla') || s.includes('nlg') || s.startsWith('sph-nlg')) return 'nallagandla';
  if (s.includes('dilshuk') || s.includes('dilsukh') || s.includes('dsnr') || s.includes('dsn') || s.startsWith('sph-dil') || s.includes('rk/dsnr')) return 'dilshuknagar';
  if (s.includes('chanda') || s.includes('chandnagar') || s.includes('chandanagar') || s.includes('chnr') || s.includes('chn') || s.includes('cngr') || s.startsWith('sph-chn')) return 'chandanagar';
  return '';
};

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
  return '';
};

async function testCalc() {
  console.log('Fetching appointments and package_members...');
  const apptsSnap = await getDocs(collection(db, 'appointments'));
  const allAppts = [];
  apptsSnap.forEach(d => allAppts.push({ id: d.id, ...d.data() }));

  const pkgSnap = await getDocs(collection(db, 'package_members'));
  const allPkgs = [];
  pkgSnap.forEach(d => allPkgs.push({ id: d.id, ...d.data() }));

  const targetBranchKey = 'chandanagar';
  let totalRev = 0;
  let count = 0;

  for (const app of allAppts) {
    const rawBranch = app.branch || app.branchName || app.selectedBranch || app.location || '';
    const bKey = normalizeBranchKey(rawBranch);
    if (bKey !== targetBranchKey) continue;

    const rawDate = app.paymentCollectedAt || app.appointmentDate || app.date || app.createdAt || app.updatedAt;
    const ymd = normalizeToYMD(rawDate);
    if (!ymd.startsWith('2026-10')) continue;

    const s = String(app.status || '').toLowerCase();
    const p = String(app.paymentStatus || '').toLowerCase();
    const amt = extractCleanNum(app.totalPaid) || extractCleanNum(app.amountPaid) || extractCleanNum(app.paidAmount) || extractCleanNum(app.totalAmount) || extractCleanNum(app.amount);

    if (p === 'paid' || s === 'completed' || s === 'done' || amt > 0) {
      if (amt > 0) {
        totalRev += amt;
        count++;
      }
    }
  }

  console.log(`Chandanagar from appointments alone: ${count} docs, ₹${totalRev}`);

  process.exit(0);
}

testCalc().catch(e => { console.error(e); process.exit(1); });
