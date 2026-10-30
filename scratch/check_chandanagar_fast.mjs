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
  return '';
};

async function checkChandanagar() {
  console.log('--- Checking Chandanagar Revenue Across Collections ---');
  
  // 1. Check appointments where branch matches Chandanagar variations
  const branchVariations = [
    'Chandanagar', 'Chandanagar Branch', 'chandanagar', 'CHANDANAGAR', 
    'Chandnagar', 'Chandnagar Branch', 'cngr', 'chnr', 'chn'
  ];
  
  for (const bVar of branchVariations) {
    const q = query(collection(db, 'appointments'), where('branch', '==', bVar));
    const snap = await getDocs(q);
    if (!snap.empty) {
      let sum = 0;
      let count = 0;
      snap.forEach(d => {
        const data = d.data();
        const ymd = normalizeToYMD(data.paymentCollectedAt || data.appointmentDate || data.date || data.createdAt);
        if (ymd.startsWith('2026-10')) {
          const amt = extractCleanNum(data.totalPaid) || extractCleanNum(data.amountPaid) || extractCleanNum(data.paidAmount) || extractCleanNum(data.totalAmount) || extractCleanNum(data.amount);
          if (amt > 0) {
            sum += amt;
            count++;
          }
        }
      });
      console.log(`appointments with branch == "${bVar}": ${snap.size} total docs, ${count} October docs with payments, Sum = ₹${sum}`);
    }
  }

  // 2. Also check alltransactions for chandanagar
  const txnSnap = await getDocs(query(collection(db, 'alltransactions'), where('branch', 'in', ['Chandanagar', 'Chandanagar Branch', 'chandanagar'])));
  let txnSum = 0;
  let txnCount = 0;
  txnSnap.forEach(d => {
    const data = d.data();
    const ymd = normalizeToYMD(data.date || data.createdAt || data.paymentDate);
    if (ymd.startsWith('2026-10')) {
      const amt = extractCleanNum(data.amount) || extractCleanNum(data.totalPaid);
      if (amt > 0) {
        txnSum += amt;
        txnCount++;
      }
    }
  });
  console.log(`alltransactions for Chandanagar: ${txnSnap.size} total docs, ${txnCount} in Oct, Sum = ₹${txnSum}`);

  process.exit(0);
}

checkChandanagar().catch(e => { console.error(e); process.exit(1); });
