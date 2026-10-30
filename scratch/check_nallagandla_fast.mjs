import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';

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

async function queryNallagandla() {
  const branches = ['Nallagandla Branch', 'Nallagandla', 'nallagandla', 'Nallagandla Clinic', 'NALLAGANDLA'];

  // 1. Check branchTargets/nallagandla
  const btSnap = await getDocs(query(collection(db, 'branchTargets')));
  btSnap.forEach(d => {
    if (d.id.toLowerCase().includes('nalla')) {
      console.log('branchTargets doc:', d.id, JSON.stringify(d.data(), null, 2));
    }
  });

  // 2. Query appointments by branch
  const apptsQ = query(collection(db, 'appointments'), where('branch', 'in', branches));
  const apptsSnap = await getDocs(apptsQ);
  console.log(`\nFound ${apptsSnap.size} appointments for Nallagandla`);

  let apptsOctTotal = 0;
  const octAppts = [];
  apptsSnap.forEach(d => {
    const data = d.data();
    const rawDate = data.paymentCollectedAt || data.appointmentDate || data.date || data.createdAt;
    const ymd = normalizeToYMD(rawDate);
    if (ymd && ymd.startsWith('2026-10')) {
      const amt = extractCleanNum(data.totalPaid) || extractCleanNum(data.amountPaid) || extractCleanNum(data.paidAmount) || extractCleanNum(data.totalAmount) || extractCleanNum(data.amount);
      apptsOctTotal += amt;
      octAppts.push({ id: d.id, patient: data.patientName || data.name, date: ymd, amount: amt, status: data.status, paymentStatus: data.paymentStatus });
    }
  });

  console.log(`October 2026 appointments count: ${octAppts.length}, Total: ₹${apptsOctTotal}`);
  octAppts.forEach((a, i) => {
    console.log(`  [${i + 1}] ${a.date} | ${a.patient} | ₹${a.amount} | status: ${a.status} | paymentStatus: ${a.paymentStatus}`);
  });

  // 3. Query allpatients by branch
  const allpatQ = query(collection(db, 'allpatients'), where('branch', 'in', branches));
  const allpatSnap = await getDocs(allpatQ);
  console.log(`\nFound ${allpatSnap.size} allpatients for Nallagandla`);

  let patOctTotal = 0;
  const octPats = [];
  allpatSnap.forEach(d => {
    const data = d.data();
    const rawDate = data.paymentCollectedAt || data.appointmentDate || data.date || data.createdAt;
    const ymd = normalizeToYMD(rawDate);
    if (ymd && ymd.startsWith('2026-10')) {
      const amt = extractCleanNum(data.totalPaid) || extractCleanNum(data.amountPaid) || extractCleanNum(data.paidAmount) || extractCleanNum(data.totalAmount) || extractCleanNum(data.amount);
      patOctTotal += amt;
      octPats.push({ id: d.id, patient: data.patientName || data.name, date: ymd, amount: amt, status: data.status, paymentStatus: data.paymentStatus });
    }
  });

  console.log(`October 2026 allpatients count: ${octPats.length}, Total: ₹${patOctTotal}`);
  octPats.forEach((p, i) => {
    console.log(`  [${i + 1}] ${p.date} | ${p.patient} | ₹${p.amount} | status: ${p.status} | paymentStatus: ${p.paymentStatus}`);
  });

  // 4. Also check branchName field in appointments
  const apptsQ2 = query(collection(db, 'appointments'), where('branchName', 'in', branches));
  const apptsSnap2 = await getDocs(apptsQ2);
  console.log(`\nFound ${apptsSnap2.size} appointments with branchName for Nallagandla`);
  apptsSnap2.forEach(d => {
    const data = d.data();
    const rawDate = data.paymentCollectedAt || data.appointmentDate || data.date || data.createdAt;
    const ymd = normalizeToYMD(rawDate);
    if (ymd && ymd.startsWith('2026-10')) {
      const amt = extractCleanNum(data.totalPaid) || extractCleanNum(data.amountPaid) || extractCleanNum(data.paidAmount) || extractCleanNum(data.totalAmount) || extractCleanNum(data.amount);
      console.log(`  branchName match: ${ymd} | ${data.patientName || data.name} | ₹${amt}`);
    }
  });

  process.exit(0);
}

queryNallagandla().catch(err => {
  console.error(err);
  process.exit(1);
});
