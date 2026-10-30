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
  if (s.includes('kphb') || s.includes('kphp') || s.includes('kpb') || s.includes('kukatpally') || s.startsWith('sph-kpb')) return 'kphb';
  if (s.includes('nalla') || s.includes('nallagandla') || s.includes('ngla') || s.includes('nlg') || s.startsWith('sph-nlg')) return 'nallagandla';
  if (s.includes('dilshuk') || s.includes('dilsukh') || s.includes('dsnr') || s.includes('dsn') || s.startsWith('sph-dil') || s.includes('rk/dsnr')) return 'dilshuknagar';
  if (s.includes('chand') || s.includes('chanda') || s.includes('chandnagar') || s.includes('chandanagar') || s.includes('chnr') || s.includes('chn') || s.includes('cngr') || s.startsWith('sph-chn') || s.endsWith('/cn')) return 'chandanagar';
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
      const istDate = new Date(val.getTime() + (5.5 * 60 * 60 * 1000));
      const y = istDate.getUTCFullYear();
      const m = String(istDate.getUTCMonth() + 1).padStart(2, '0');
      const d = String(istDate.getUTCDate()).padStart(2, '0');
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
      const istDate = new Date(d.getTime() + (5.5 * 60 * 60 * 1000));
      const y = istDate.getUTCFullYear();
      const m = String(istDate.getUTCMonth() + 1).padStart(2, '0');
      const day = String(istDate.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
  } catch (e) {}
  return '';
};

async function generateReportForDate(targetDate, label) {
  console.log(`\n======================================================`);
  console.log(`📅 ${label.toUpperCase()} REPORT: ${targetDate}`);
  console.log(`======================================================`);

  const branches = {
    kphb: { name: 'KPHB Branch', totalRevenue: 0, appointments: [] },
    nallagandla: { name: 'Nallagandla Branch', totalRevenue: 0, appointments: [] },
    dilshuknagar: { name: 'Dilshuknagar Branch', totalRevenue: 0, appointments: [] },
    chandanagar: { name: 'Chandanagar Branch', totalRevenue: 0, appointments: [] },
  };

  const seenIds = new Set();

  // 1. Process appointments
  appDocs.forEach(a => {
    const dStr = normalizeToYMD(a.appointmentDate || a.date || a.createdAt || a.timestamp);
    if (dStr !== targetDate) return;

    const bKey = normalizeBranchKey(a.branch || a.branchName || a.targetBranch);
    if (!branches[bKey]) return;

    seenIds.add(a.id);

    let paid = 0;
    if (a.totalPaid !== undefined && a.totalPaid !== null && Number(a.totalPaid) > 0) {
      paid = Number(a.totalPaid);
    } else if (a.totalAmount !== undefined && a.totalAmount !== null && Number(a.totalAmount) > 0) {
      paid = Number(a.totalAmount);
    } else {
      const c = Number(a.consultationFee) || 0;
      const m = Number(a.medicineFee || a.pharmacyFee) || 0;
      const d = Number(a.dietFee || a.dietPlan?.dietFeeAmount) || 0;
      const o = Number(a.otherCharges) || 0;
      const p = Number(a.packageFee || a.packageAdvancePaid) || 0;
      const disc = Number(a.discount) || 0;
      paid = Math.max(0, c + m + d + o + p - disc);
    }

    branches[bKey].totalRevenue += paid;
    branches[bKey].appointments.push({
      id: a.id,
      patientName: a.patientName || a.name || 'Patient',
      phone: a.patientPhone || a.phone || a.phoneNumber || 'N/A',
      regId: a.registrationId || a.regId || 'N/A',
      doctor: a.doctorName || a.doctor || 'N/A',
      status: a.status || 'N/A',
      paidAmount: paid,
      paymentMethod: a.paymentMethod || a.paymentType || 'N/A',
      source: 'appointments'
    });
  });

  // 2. Process alltransactions
  txnDocs.forEach(t => {
    const dStr = normalizeToYMD(t.timestamp || t.date || t.createdAt);
    if (dStr !== targetDate) return;

    const bKey = normalizeBranchKey(t.branch || t.branchName);
    if (!branches[bKey]) return;

    const appRefId = t.appointmentId || t.patientDocId || t.patientId;
    if (appRefId && seenIds.has(appRefId)) return;
    if (seenIds.has(t.id)) return;
    seenIds.add(t.id);

    const amt = Number(t.amount || t.totalAmount || t.paidAmount || 0);
    if (amt > 0) {
      branches[bKey].totalRevenue += amt;
      branches[bKey].appointments.push({
        id: t.id,
        patientName: t.patientName || t.name || 'Patient',
        phone: t.phone || t.patientPhone || 'N/A',
        regId: t.registrationId || t.regId || 'N/A',
        doctor: t.doctorName || t.doctor || 'N/A',
        status: 'completed',
        paidAmount: amt,
        paymentMethod: t.paymentMethod || 'N/A',
        source: 'transactions'
      });
    }
  });

  // 3. Process package_members
  pkgDocs.forEach(p => {
    const dStr = normalizeToYMD(p.paymentCollectedAt || p.createdAt || p.startDate);
    if (dStr !== targetDate) return;

    const bKey = normalizeBranchKey(p.branch || p.targetBranch || p.branchName);
    if (!branches[bKey]) return;

    if (seenIds.has(p.id)) return;
    seenIds.add(p.id);

    const amt = Number(p.paidAmount || p.advancePaid || p.totalAmount || 0);
    if (amt > 0) {
      branches[bKey].totalRevenue += amt;
      branches[bKey].appointments.push({
        id: p.id,
        patientName: p.patientName || p.name || 'Package Patient',
        phone: p.phone || p.patientPhone || 'N/A',
        regId: p.registrationId || p.regId || 'N/A',
        doctor: p.doctorName || p.doctor || 'N/A',
        status: 'Package',
        paidAmount: amt,
        paymentMethod: p.paymentMethod || 'Package',
        source: 'package_members'
      });
    }
  });

  let grandPatients = 0;
  let grandRevenue = 0;

  for (const [key, b] of Object.entries(branches)) {
    const count = b.appointments.length;
    const rev = b.totalRevenue;
    grandPatients += count;
    grandRevenue += rev;

    console.log(`\n🏥 ${b.name}:`);
    console.log(`   - Number of Patients: ${count}`);
    console.log(`   - Total Revenue: ₹${rev.toLocaleString('en-IN')}`);

    if (count > 0) {
      console.log(`   - Patient Details:`);
      b.appointments.forEach((p, idx) => {
        console.log(`     ${idx + 1}. ${p.patientName} (Reg: ${p.regId}, Ph: ${p.phone}) | Dr: ${p.doctor} | Status: ${p.status} | Paid: ₹${p.paidAmount} [${p.paymentMethod}]`);
      });
    } else {
      console.log(`     (No visits or transactions recorded for this branch on ${targetDate})`);
    }
  }

  console.log(`\n------------------------------------------------------`);
  console.log(`⭐ ${label.toUpperCase()} TOTALS (${targetDate}):`);
  console.log(`   - Total Patients across all 4 branches: ${grandPatients}`);
  console.log(`   - Total Revenue across all 4 branches:  ₹${grandRevenue.toLocaleString('en-IN')}`);
  console.log(`------------------------------------------------------`);
}

let appDocs = [];
let txnDocs = [];
let pkgDocs = [];

async function main() {
  console.log('Loading database records...');

  const [appsSnap, txnsSnap, pkgsSnap] = await Promise.all([
    getDocs(collection(db, 'appointments')),
    getDocs(collection(db, 'alltransactions')).catch(() => ({ docs: [] })),
    getDocs(collection(db, 'package_members')).catch(() => ({ docs: [] })),
  ]);

  appDocs = appsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  txnDocs = txnsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  pkgDocs = pkgsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  console.log(`Loaded: ${appDocs.length} appointments, ${txnDocs.length} transactions, ${pkgDocs.length} package members.`);

  // Generate Yesterday (2026-10-23)
  await generateReportForDate('2026-10-23', 'Yesterday');

  // Generate Today (2026-10-24)
  await generateReportForDate('2026-10-24', 'Today');

  process.exit(0);
}

main();
