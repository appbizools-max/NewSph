import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAohSNLyeS6bYtnk2QvB4HGo0LbHDw9b6Q",
  authDomain: "spiritual-homeopathy-3b552.firebaseapp.com",
  projectId: "spiritual-homeopathy-3b552",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// The user's fixed monthly targets
const FIXED_MONTHLY_TARGETS = {
  kphb: 725000,
  chandanagar: 550000,
  nallagandla: 325000,
  dilshuknagar: 225000
};

async function restoreFixedTargets() {
  console.log('Restoring fixed monthly targets and recalculating remaining/percentage...');

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

    await setDoc(docRef, {
      monthlyTarget: fixedTarget,
      [`monthlyTargets.2026-10`]: fixedTarget,
      targetReached: reached,
      remaining: remaining,
      percentage: percentage,
      isReached: isReached,
      updatedAt: new Date().toISOString()
    }, { merge: true });

    console.log(`✓ ${key}: Fixed Target = ₹${fixedTarget.toLocaleString('en-IN')}, Reached = ₹${reached.toLocaleString('en-IN')} (${percentage}%), Remaining = ₹${remaining.toLocaleString('en-IN')}`);
  }

  process.exit(0);
}

restoreFixedTargets().catch(err => {
  console.error(err);
  process.exit(1);
});
