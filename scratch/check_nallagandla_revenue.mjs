import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAohSNLyeS6bYtnk2QvB4HGo0LbHDw9b6Q",
  authDomain: "spiritual-homeopathy-3b552.firebaseapp.com",
  projectId: "spiritual-homeopathy-3b552",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

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

const isNallagandla = (raw = '') => {
  const s = String(raw || '').toLowerCase().trim();
  return s.includes('nalla') || s.includes('nallagandla') || s.includes('ngla') || s.includes('nlg') || s.startsWith('sph-nlg');
};

const extractCleanNum = (val) => {
  if (!val) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const cleaned = String(val).replace(/[^0-9.]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
};

async function checkNallagandla() {
  console.log('--- CHECKING NALLAGANDLA REVENUE (OCTOBER 2026) ---');
  
  // 1. Check branchTargets collection
  const btSnap = await getDocs(collection(db, 'branchTargets'));
  btSnap.forEach(d => {
    if (d.id === 'nallagandla') {
      console.log('Stored in branchTargets/nallagandla:', d.data());
    }
  });

  // 2. Check alltransactions
  console.log('\nChecking alltransactions collection...');
  const txnSnap = await getDocs(collection(db, 'alltransactions'));
  let txnTotal = 0;
  const txnList = [];

  txnSnap.forEach(d => {
    const data = d.data();
    const b = data.branchName || data.branch || data.branchId;
    if (!isNallagandla(b)) return;
    const rawDate = data.paymentCollectedAt || data.date || data.createdAt || data.timestamp;
    const ymd = normalizeToYMD(rawDate);
    if (!ymd || !ymd.startsWith('2026-10')) return;

    const amt = extractCleanNum(data.amount) || extractCleanNum(data.totalAmount) || extractCleanNum(data.totalPaid) || extractCleanNum(data.paidAmount);
    if (amt > 0) {
      txnTotal += amt;
      txnList.push({
        id: d.id,
        patient: data.patientName || data.name,
        date: ymd,
        amount: amt,
        mode: data.paymentMode || data.paymentMethod
      });
    }
  });

  console.log(`alltransactions for Nallagandla in Oct 2026: ${txnList.length} items, Total = ₹${txnTotal}`);
  txnList.forEach((t, i) => {
    console.log(`  [${i + 1}] ${t.date} | ${t.patient} | ₹${t.amount} | ${t.mode}`);
  });

  // 3. Check package_members
  console.log('\nChecking package_members collection...');
  const pkgSnap = await getDocs(collection(db, 'package_members'));
  let pkgTotal = 0;
  const pkgList = [];

  pkgSnap.forEach(d => {
    const data = d.data();
    const b = data.branch || data.branchName || data.targetBranch;
    if (!isNallagandla(b)) return;

    if (Array.isArray(data.paymentHistory) && data.paymentHistory.length > 0) {
      data.paymentHistory.forEach((inst, idx) => {
        const instDate = inst.date || inst.paymentDate || data.startDate || data.createdAt;
        const ymd = normalizeToYMD(instDate);
        if (ymd && ymd.startsWith('2026-10')) {
          const amt = extractCleanNum(inst.amount || inst.paidAmount);
          if (amt > 0) {
            pkgTotal += amt;
            pkgList.push({
              id: `${d.id}_inst_${idx}`,
              patient: data.patientName || data.name,
              date: ymd,
              amount: amt,
              type: 'installment'
            });
          }
        }
      });
    } else {
      const rawDate = data.paymentCollectedAt || data.startDate || data.createdAt;
      const ymd = normalizeToYMD(rawDate);
      if (ymd && ymd.startsWith('2026-10')) {
        const amt = extractCleanNum(data.paidAmount || data.advancePaid || data.totalPaid || data.amount);
        if (amt > 0) {
          pkgTotal += amt;
          pkgList.push({
            id: d.id,
            patient: data.patientName || data.name,
            date: ymd,
            amount: amt,
            type: 'advance/full'
          });
        }
      }
    }
  });

  console.log(`package_members for Nallagandla in Oct 2026: ${pkgList.length} items, Total = ₹${pkgTotal}`);
  pkgList.forEach((p, i) => {
    console.log(`  [${i + 1}] ${p.date} | ${p.patient} | ₹${p.amount} | ${p.type}`);
  });

  process.exit(0);
}

checkNallagandla().catch(err => {
  console.error(err);
  process.exit(1);
});
