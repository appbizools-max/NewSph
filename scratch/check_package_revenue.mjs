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

async function inspectPackageRevenue() {
  console.log('=== Checking package_members ===');
  const pkgSnap = await getDocs(collection(db, 'package_members'));
  console.log(`Total package_members docs: ${pkgSnap.size}`);
  pkgSnap.forEach(doc => {
    const d = doc.data();
    console.log(`PKG ID: ${doc.id} | Patient: ${d.patientName || d.name} | TotalAmount: ${d.totalAmount} | TotalPaid: ${d.totalPaid} | AdvancePaid: ${d.advancePaid} | Amount: ${d.amount} | PackageFee: ${d.packageFee} | Date: ${d.createdAt || d.paymentDate || d.startDate} | PaymentHistory:`, d.paymentHistory);
  });

  console.log('\n=== Transactions where package > 0 ===');
  const txnSnap = await getDocs(collection(db, 'alltransactions'));
  txnSnap.forEach(doc => {
    const d = doc.data();
    const pkgPaid = d.itemsPaid?.package;
    const pkgFee = d.packageFee;
    const revSplit = d.revenueSplit;
    if ((pkgPaid && Number(pkgPaid) > 0) || (pkgFee && Number(pkgFee) > 0) || revSplit === 'Package' || d.isPackageMember) {
      console.log(`TXN ID: ${doc.id} | Patient: ${d.patientName || d.name} | Amount: ${d.amount || d.totalAmount} | revSplit: ${revSplit} | itemsPaid.package: ${pkgPaid} | packageFee: ${pkgFee} | isPackageMember: ${d.isPackageMember} | Date: ${d.timestamp || d.date || d.createdAt}`);
    }
  });
}

inspectPackageRevenue().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});