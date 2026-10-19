import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, limit } from 'firebase/firestore';

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

// Helper functions from AnalyticsRevenuePage.tsx
const extractCleanNum = (val) => {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const cleaned = String(val).replace(/[^0-9.-]+/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
};

const normalizeToYMD = (raw) => {
  if (!raw) return '';
  let val = raw;
  if (typeof val === 'object') {
    if (typeof val.toDate === 'function') {
      val = val.toDate();
    } else if (typeof val.seconds === 'number') {
      val = new Date(val.seconds * 1000);
    }
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
  if (!str || str === '[object Object]') return '';

  const isoMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
  }
  const ddmmyyyyMatch = str.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  if (ddmmyyyyMatch) {
    return `${ddmmyyyyMatch[3]}-${ddmmyyyyMatch[2].padStart(2, '0')}-${ddmmyyyyMatch[1].padStart(2, '0')}`;
  }
  try {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const d = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  } catch (e) { }
  return '';
};

async function testExactRevenue() {
  const [allTxnSnap, allPatSnap, apptSnap, pkgSnap] = await Promise.all([
    getDocs(collection(db, 'alltransactions')),
    getDocs(collection(db, 'allpatients')),
    getDocs(collection(db, 'appointments')),
    getDocs(collection(db, 'package_members'))
  ]);

  const allTxnDocs = allTxnSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const allPatientDocs = allPatSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const appointmentDocs = apptSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const packageMemberDocs = pkgSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const seenTxnIds = new Set();
  const seenAppointmentIds = new Set();
  const seenPatientIds = new Set();
  const seenPhoneDates = new Set();
  const seenRegDates = new Set();

  const records = [];

  for (const item of allTxnDocs) {
    const rawDate = item.timestamp || item.date || item.createdAt;
    const ymd = normalizeToYMD(rawDate);
    const phone = String(item.phoneNumber || item.phone || item.mobile || '').replace(/\D/g, '').slice(-10);

    const itemsConsultation = extractCleanNum(item.itemsPaid?.consultation);
    const itemsMedicine = extractCleanNum(item.itemsPaid?.medicine);
    const itemsPackage = extractCleanNum(item.itemsPaid?.package || item.itemsPaid?.diet);

    const consultationFee = extractCleanNum(item.consultationFee) || itemsConsultation;
    const medicineFee = extractCleanNum(item.medicineFee) || itemsMedicine;
    const packageFee = extractCleanNum(item.packageFee) || itemsPackage;

    const totalAmount =
      extractCleanNum(item.amount) ||
      extractCleanNum(item.totalAmount) ||
      extractCleanNum(item.totalPaid) ||
      extractCleanNum(item.paidAmount) ||
      (consultationFee + medicineFee + packageFee);

    if (totalAmount > 0 || item.patientName || item.name) {
      const isPackageOpted =
        item.isPackageMember === true ||
        item.hasActivePackage === true ||
        item.isCarePackage === true ||
        item.carePackageId ||
        String(item.paymentTypePreset || '').toLowerCase() === 'package' ||
        String(item.typeLabel || '').toLowerCase().includes('package') ||
        String(item.service || '').toLowerCase().includes('package') ||
        String(item.planName || '').toLowerCase().includes('package') ||
        String(item.planName || '').toLowerCase().includes('care') ||
        String(item.revenueSplit || '').toLowerCase().includes('package') ||
        (packageFee > 0 && !String(item.planName || '').toLowerCase().includes('diet') && !String(item.service || '').toLowerCase().includes('nutrition'));

      const isDietOpted =
        !isPackageOpted &&
        (item.dietPlanFee > 0 ||
          String(item.typeLabel || '').toLowerCase().includes('diet') ||
          String(item.service || '').toLowerCase().includes('diet') ||
          String(item.planName || '').toLowerCase().includes('diet') ||
          String(item.revenueSplit || '').toLowerCase().includes('diet'));

      let revenueSplit = String(item.revenueSplit || item.service || item.typeLabel || '');
      if (isPackageOpted) {
        revenueSplit = 'Package';
      } else if (isDietOpted) {
        revenueSplit = 'Diet Plan';
      } else if (!revenueSplit || revenueSplit === 'undefined') {
        if (consultationFee > 0 && medicineFee > 0) revenueSplit = 'Consultation & Medicine Fee';
        else if (medicineFee > 0) revenueSplit = 'Consultation & Medicine Fee';
        else revenueSplit = 'Consultation';
      }

      records.push({
        id: item.id,
        patientName: item.patientName || item.name,
        totalAmount,
        packageFee: isPackageOpted || isDietOpted ? totalAmount : packageFee,
        revenueSplit,
        timestamp: ymd,
        sourceCol: 'alltransactions'
      });
    }
  }

  // package_members
  for (const pkg of packageMemberDocs) {
    if (Array.isArray(pkg.paymentHistory) && pkg.paymentHistory.length > 0) {
      pkg.paymentHistory.forEach((inst, idx) => {
        const instAmt = extractCleanNum(inst.amount || inst.paidAmount);
        if (instAmt <= 0) return;
        const instDate = inst.date || inst.paymentDate || pkg.startDate || pkg.createdAt;
        const instYmd = normalizeToYMD(instDate);
        records.push({
          id: `${pkg.id}_inst_${idx}`,
          patientName: pkg.patientName || pkg.name,
          totalAmount: instAmt,
          packageFee: instAmt,
          revenueSplit: 'Package',
          timestamp: instYmd,
          sourceCol: 'package_members_history'
        });
      });
    } else {
      const rawDate = pkg.paymentCollectedAt || pkg.enrolledDate || pkg.paymentDate || pkg.startDate || pkg.createdAt;
      const ymd = normalizeToYMD(rawDate);
      const pkgAmt =
        extractCleanNum(pkg.totalPaid) ||
        extractCleanNum(pkg.advancePaid) ||
        extractCleanNum(pkg.paidAmount) ||
        extractCleanNum(pkg.amount) ||
        extractCleanNum(pkg.totalAmount);

      if (pkgAmt > 0) {
        records.push({
          id: pkg.id,
          patientName: pkg.patientName || pkg.name,
          totalAmount: pkgAmt,
          packageFee: pkgAmt,
          revenueSplit: 'Package',
          timestamp: ymd,
          sourceCol: 'package_members_direct'
        });
      }
    }
  }

  console.log(`Total records generated: ${records.length}`);
  
  // Package breakdown
  const packageRecords = records.filter(t => {
    const sLower = (t.revenueSplit || '').toLowerCase();
    return sLower.includes('package') || sLower.includes('care package') || (t.packageFee > 0 && !sLower.includes('diet'));
  });

  console.log(`Package records count: ${packageRecords.length}`);
  console.log('Sample package records:');
  packageRecords.forEach(r => {
    console.log(`  - [${r.sourceCol}] ${r.id} | ${r.patientName} | totalAmt: ${r.totalAmount} | pkgFee: ${r.packageFee} | revSplit: ${r.revenueSplit} | ymd: ${r.timestamp}`);
  });

  const totalPkgAmt = packageRecords.reduce((sum, r) => sum + r.totalAmount, 0);
  console.log(`TOTAL PACKAGE REVENUE (ALL TIME): ₹${totalPkgAmt}`);

  // Now check with DateMode: 'this_month' (assuming 2026-10) or 'today'
  const today = '2026-10-17';
  const thisMonth = '2026-10';
  const pkgThisMonth = packageRecords.filter(r => r.timestamp && r.timestamp.startsWith(thisMonth));
  console.log(`TOTAL PACKAGE REVENUE (THIS MONTH 2026-10): ₹${pkgThisMonth.reduce((sum, r) => sum + r.totalAmount, 0)}`);
  pkgThisMonth.forEach(r => {
    console.log(`    This month: ${r.patientName} | ₹${r.totalAmount} | ${r.timestamp} | ${r.id}`);
  });
}

testExactRevenue().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
