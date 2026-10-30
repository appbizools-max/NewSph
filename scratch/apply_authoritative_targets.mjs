import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

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

const targets = {
  kphb: {
    name: 'KPHB Branch',
    target: 725000,
    reached: 474000
  },
  nallagandla: {
    name: 'Nallagandla Branch',
    target: 325000,
    reached: 207700
  },
  dilshuknagar: {
    name: 'Dilshuknagar Branch',
    target: 225000,
    reached: 112110
  },
  chandanagar: {
    name: 'Chandanagar Branch',
    target: 550000,
    reached: 298501
  }
};

async function updateBranchTargets() {
  for (const [key, item] of Object.entries(targets)) {
    const remaining = Math.max(0, item.target - item.reached);
    const percentage = Math.round((item.reached / item.target) * 100);
    const isReached = item.reached >= item.target;

    const payload = {
      id: key,
      branchId: key,
      branchName: item.name,
      currentMonth: '2026-10',
      month: '2026-10',
      nextMonth: '2026-11',
      monthlyTarget: item.target,
      targetReached: item.reached,
      remaining,
      percentage,
      isReached,
      monthlyTargets: {
        '2026-10': item.target,
        '2026-11': 0
      },
      nextMonthTarget: 0,
      updatedAt: new Date().toISOString()
    };

    await setDoc(doc(db, 'branchTargets', key), payload, { merge: true });
    console.log(`Updated ${item.name}: Target=₹${item.target.toLocaleString('en-IN')}, Reached=₹${item.reached.toLocaleString('en-IN')} (${percentage}%), Remaining=₹${remaining.toLocaleString('en-IN')}`);
  }
}

updateBranchTargets().then(() => {
  console.log('All branch targets updated successfully!');
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
