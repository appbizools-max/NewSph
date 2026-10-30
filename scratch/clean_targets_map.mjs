import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAohSNLyeS6bYtnk2QvB4HGo0LbHDw9b6Q",
  authDomain: "spiritual-homeopathy-3b552.firebaseapp.com",
  projectId: "spiritual-homeopathy-3b552",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const FIXED_MONTHLY_TARGETS = {
  kphb: 725000,
  chandanagar: 550000,
  nallagandla: 325000,
  dilshuknagar: 225000
};

async function fixTargetMap() {
  for (const [key, fixedTarget] of Object.entries(FIXED_MONTHLY_TARGETS)) {
    const docRef = doc(db, 'branchTargets', key);
    const snap = await getDoc(docRef);
    let reached = 0;
    if (snap.exists()) {
      reached = snap.data().targetReached || 0;
    }

    const remaining = Math.max(0, fixedTarget - reached);
    const percentage = Math.round((reached / fixedTarget) * 100);
    const isReached = reached >= fixedTarget;

    const dataToSave = {
      id: key,
      branchId: key,
      monthlyTarget: fixedTarget,
      targetReached: reached,
      remaining: remaining,
      percentage: percentage,
      isReached: isReached,
      currentMonth: '2026-10',
      month: '2026-10',
      nextMonth: '2026-11',
      nextMonthTarget: 0,
      monthlyTargets: {
        '2026-10': fixedTarget,
        '2026-11': 0
      },
      updatedAt: new Date().toISOString()
    };

    await setDoc(docRef, dataToSave, { merge: false });
    console.log(`✓ Cleaned ${key}: Target = ₹${fixedTarget.toLocaleString('en-IN')}, Reached = ₹${reached.toLocaleString('en-IN')} (${percentage}%)`);
  }

  process.exit(0);
}

fixTargetMap().catch(e => { console.error(e); process.exit(1); });
