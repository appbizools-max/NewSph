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
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
  const ddmmyyyyMatch = str.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  if (ddmmyyyyMatch) return `${ddmmyyyyMatch[3]}-${ddmmyyyyMatch[2].padStart(2, '0')}-${ddmmyyyyMatch[1].padStart(2, '0')}`;
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

async function checkWhy() {
  const allTxnSnap = await getDocs(collection(db, 'alltransactions'));
  const pkgSnap = await getDocs(collection(db, 'package_members'));

  console.log(`alltransactions: ${allTxnSnap.size}, package_members: ${pkgSnap.size}`);

  let allTxnPackageCount = 0;
  let allTxnPackageTotal = 0;

  allTxnSnap.forEach(doc => {
    const item = doc.data();
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

    let revenueSplit = String(item.revenueSplit || item.service || item.typeLabel || '');
    if (isPackageOpted) {
      revenueSplit = 'Package';
    }

    const sLower = revenueSplit.toLowerCase();
    const isPackageSplit = sLower.includes('package') || sLower.includes('care package') || (packageFee > 0 && !sLower.includes('diet'));

    if (isPackageSplit) {
      allTxnPackageCount++;
      allTxnPackageTotal += totalAmount;
      const ymd = normalizeToYMD(item.timestamp || item.date || item.createdAt);
      console.log(`TXN Pkg: ${doc.id} | ${item.patientName} | totalAmount: ${totalAmount} | packageFee: ${packageFee} | itemsPaid.package: ${item.itemsPaid?.package} | Date: ${ymd}`);
    }
  });

  console.log(`\nALLTRANSACTIONS Package Count: ${allTxnPackageCount}, Total: ₹${allTxnPackageTotal}`);

  let pkgMemCount = 0;
  let pkgMemTotal = 0;
  pkgSnap.forEach(doc => {
    const pkg = doc.data();
    if (Array.isArray(pkg.paymentHistory) && pkg.paymentHistory.length > 0) {
      pkg.paymentHistory.forEach((inst, idx) => {
        const instAmt = extractCleanNum(inst.amount || inst.paidAmount);
        if (instAmt <= 0) return;
        pkgMemCount++;
        pkgMemTotal += instAmt;
        const instDate = inst.date || inst.paymentDate || pkg.startDate || pkg.createdAt;
        console.log(`PKG Mem History: ${doc.id}_${idx} | ${pkg.patientName} | Amt: ${instAmt} | Date: ${normalizeToYMD(instDate)}`);
      });
    } else {
      const pkgAmt =
        extractCleanNum(pkg.totalPaid) ||
        extractCleanNum(pkg.advancePaid) ||
        extractCleanNum(pkg.paidAmount) ||
        extractCleanNum(pkg.amount) ||
        extractCleanNum(pkg.totalAmount);
      if (pkgAmt > 0) {
        pkgMemCount++;
        pkgMemTotal += pkgAmt;
        const rawDate = pkg.paymentCollectedAt || pkg.enrolledDate || pkg.paymentDate || pkg.startDate || pkg.createdAt;
        console.log(`PKG Mem Direct: ${doc.id} | ${pkg.patientName} | Amt: ${pkgAmt} | Date: ${normalizeToYMD(rawDate)}`);
      }
    }
  });

  console.log(`\nPACKAGE_MEMBERS Count: ${pkgMemCount}, Total: ₹${pkgMemTotal}`);
}

checkWhy().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
