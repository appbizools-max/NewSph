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
      // Adjust to IST (+05:30)
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

async function main() {
  const TODAY = '2026-10-24';
  console.log(`=== GENERATING TODAY'S REPORT (${TODAY}) FOR ALL BRANCHES ===\n`);

  const branches = {
    kphb: { name: 'KPHB Branch', patients: [], totalRevenue: 0, appointments: [] },
    nallagandla: { name: 'Nallagandla Branch', patients: [], totalRevenue: 0, appointments: [] },
    dilshuknagar: { name: 'Dilshuknagar Branch', patients: [], totalRevenue: 0, appointments: [] },
    chandanagar: { name: 'Chandanagar Branch', patients: [], totalRevenue: 0, appointments: [] },
  };

  // 1. Fetch appointments
  console.log('Fetching appointments...');
  const appSnap = await getDocs(collection(db, 'appointments'));
  const seenIds = new Set();

  appSnap.forEach(doc => {
    const a = { id: doc.id, ...doc.data() };
    const dateStr = normalizeToYMD(a.appointmentDate || a.date || a.createdAt || a.timestamp);
    if (dateStr !== TODAY) return;

    const bKey = normalizeBranchKey(a.branch || a.branchName || a.targetBranch);
    if (!branches[bKey]) return;

    seenIds.add(doc.id);

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
      id: doc.id,
      patientName: a.patientName || a.name || 'Unknown',
      phone: a.patientPhone || a.phone || a.phoneNumber || 'N/A',
      regId: a.registrationId || a.regId || 'N/A',
      doctor: a.doctorName || a.doctor || 'N/A',
      status: a.status || 'N/A',
      paidAmount: paid,
      paymentMethod: a.paymentMethod || a.paymentType || 'N/A',
      collection: 'appointments'
    });
  });

  // 2. Fetch alltransactions for any direct payments today
  console.log('Fetching alltransactions...');
  try {
    const txnSnap = await getDocs(collection(db, 'alltransactions'));
    txnSnap.forEach(doc => {
      const t = { id: doc.id, ...doc.data() };
      const dateStr = normalizeToYMD(t.timestamp || t.date || t.createdAt);
      if (dateStr !== TODAY) return;

      const bKey = normalizeBranchKey(t.branch || t.branchName);
      if (!branches[bKey]) return;

      const appRefId = t.appointmentId || t.patientDocId || t.patientId;
      if (appRefId && seenIds.has(appRefId)) return; // already counted in appointment
      if (seenIds.has(doc.id)) return;
      seenIds.add(doc.id);

      const amt = Number(t.amount || t.totalAmount || t.paidAmount || 0);
      if (amt > 0) {
        branches[bKey].totalRevenue += amt;
        branches[bKey].appointments.push({
          id: doc.id,
          patientName: t.patientName || t.name || 'Patient',
          phone: t.phone || t.patientPhone || 'N/A',
          regId: t.registrationId || t.regId || 'N/A',
          doctor: t.doctorName || t.doctor || 'N/A',
          status: 'completed',
          paidAmount: amt,
          paymentMethod: t.paymentMethod || 'N/A',
          collection: 'alltransactions'
        });
      }
    });
  } catch (e) {
    console.log('alltransactions fetch note:', e.message);
  }

  // 3. Fetch package_members for package payments collected today
  console.log('Fetching package_members...');
  try {
    const pkgSnap = await getDocs(collection(db, 'package_members'));
    pkgSnap.forEach(doc => {
      const p = { id: doc.id, ...doc.data() };
      const dateStr = normalizeToYMD(p.paymentCollectedAt || p.createdAt || p.startDate);
      if (dateStr !== TODAY) return;

      const bKey = normalizeBranchKey(p.branch || p.targetBranch || p.branchName);
      if (!branches[bKey]) return;

      if (seenIds.has(doc.id)) return;
      seenIds.add(doc.id);

      const amt = Number(p.paidAmount || p.advancePaid || p.totalAmount || 0);
      if (amt > 0) {
        branches[bKey].totalRevenue += amt;
        branches[bKey].appointments.push({
          id: doc.id,
          patientName: p.patientName || p.name || 'Package Patient',
          phone: p.phone || p.patientPhone || 'N/A',
          regId: p.registrationId || p.regId || 'N/A',
          doctor: p.doctorName || p.doctor || 'N/A',
          status: 'Package Active',
          paidAmount: amt,
          paymentMethod: p.paymentMethod || 'Package',
          collection: 'package_members'
        });
      }
    });
  } catch (e) {
    console.log('package_members fetch note:', e.message);
  }

  // Also check if there are any appointments in allpatients for today not counted
  console.log('Fetching allpatients...');
  try {
    const allPatSnap = await getDocs(collection(db, 'allpatients'));
    allPatSnap.forEach(doc => {
      const p = { id: doc.id, ...doc.data() };
      const dateStr = normalizeToYMD(p.appointmentDate || p.date || p.createdAt);
      if (dateStr !== TODAY) return;

      const bKey = normalizeBranchKey(p.branch || p.branchName);
      if (!branches[bKey]) return;

      if (seenIds.has(doc.id)) return;
      seenIds.add(doc.id);

      const paid = Number(p.totalPaid || p.totalAmount || p.paidAmount || 0);
      branches[bKey].totalRevenue += paid;
      branches[bKey].appointments.push({
        id: doc.id,
        patientName: p.patientName || p.name || 'Walk-in Patient',
        phone: p.phone || p.patientPhone || 'N/A',
        regId: p.registrationId || p.regId || 'N/A',
        doctor: p.doctorName || p.doctor || 'N/A',
        status: p.status || 'N/A',
        paidAmount: paid,
        paymentMethod: p.paymentMethod || 'N/A',
        collection: 'allpatients'
      });
    });
  } catch (e) {
    console.log('allpatients fetch note:', e.message);
  }

  console.log('\n======================================================');
  console.log(`📊 TODAY'S BRANCH PERFORMANCE REPORT (${TODAY})`);
  console.log('======================================================\n');

  let grandTotalPatients = 0;
  let grandTotalRevenue = 0;

  for (const [key, b] of Object.entries(branches)) {
    const count = b.appointments.length;
    const rev = b.totalRevenue;
    grandTotalPatients += count;
    grandTotalRevenue += rev;

    console.log(`🏥 ${b.name}:`);
    console.log(`   - Patients Visited: ${count}`);
    console.log(`   - Revenue Collected: ₹${rev.toLocaleString('en-IN')}`);
    if (count > 0) {
      console.log(`   - Patient Details:`);
      b.appointments.forEach((p, idx) => {
        console.log(`     ${idx + 1}. ${p.patientName} (Reg: ${p.regId}, Phone: ${p.phone}) | Dr: ${p.doctor} | Status: ${p.status} | Paid: ₹${p.paidAmount} (${p.paymentMethod})`);
      });
    } else {
      console.log(`     (No appointments recorded for today yet)`);
    }
    console.log('');
  }

  console.log('======================================================');
  console.log(`TOTAL ACROSS ALL 4 BRANCHES TODAY:`);
  console.log(`Total Patients: ${grandTotalPatients}`);
  console.log(`Total Revenue: ₹${grandTotalRevenue.toLocaleString('en-IN')}`);
  console.log('======================================================');

  process.exit(0);
}

main();
