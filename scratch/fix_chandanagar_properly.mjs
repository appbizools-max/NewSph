import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAohSNLyeS6bYtnk2QvB4HGo0LbHDw9b6Q",
  authDomain: "spiritual-homeopathy-3b552.firebaseapp.com",
  projectId: "spiritual-homeopathy-3b552",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function fixChandanagarDoc() {
  const target = 550000;
  const reached = 311901;
  const remaining = Math.max(0, target - reached);
  const percentage = Math.round((reached / target) * 100);

  await setDoc(doc(db, 'branchTargets', 'chandanagar'), {
    id: 'chandanagar',
    branchId: 'chandanagar',
    branchName: 'Chandanagar Branch',
    monthlyTarget: target,
    targetReached: reached,
    remaining: remaining,
    percentage: percentage,
    isReached: reached >= target,
    currentMonth: '2026-10',
    month: '2026-10',
    nextMonth: '2026-11',
    nextMonthTarget: 0,
    monthlyTargets: {
      '2026-10': target,
      '2026-11': 0
    },
    updatedAt: new Date().toISOString()
  });

  console.log(`✓ Restored Chandanagar in Firestore: Target = ₹${target.toLocaleString('en-IN')}, Reached = ₹${reached.toLocaleString('en-IN')} (${percentage}%), Remaining = ₹${remaining.toLocaleString('en-IN')}`);
  process.exit(0);
}

fixChandanagarDoc().catch(e => { console.error(e); process.exit(1); });
