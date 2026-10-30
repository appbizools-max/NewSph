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

const isChandanagar = (val) => {
  if (!val) return false;
  const s = String(val).toLowerCase().trim();
  return s.includes('chanda') || s.includes('chnr') || s.includes('chn');
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

async function main() {
  console.log('=== INVESTIGATING CHANDANAGAR PATIENTS & VISITS ===');
  const cols = ['appointments', 'allpatients', 'patients', 'patient_profiles', 'package_members', 'prescriptions', 'alltransactions'];

  const results = {};

  for (const c of cols) {
    try {
      const snap = await getDocs(collection(db, c));
      const chandaDocs = [];
      const allDocs = [];
      snap.docs.forEach((d) => {
        const data = d.data();
        allDocs.push({ id: d.id, ...data });
        const branchCandidate = data.branch || data.branchName || data.targetBranch || data.branchId || data.center || '';
        if (isChandanagar(branchCandidate)) {
          chandaDocs.push({ id: d.id, ...data });
        }
      });
      results[c] = { chandaDocs, total: snap.docs.length, allDocs };
      console.log(`Collection "${c}": Total = ${snap.docs.length}, Chandanagar = ${chandaDocs.length}`);
    } catch (e) {
      console.error(`Error querying "${c}":`, e.message);
    }
  }

  // Also check if any doc in appointments has NO branch or weird branch name
  const allAppointments = results['appointments']?.allDocs || [];
  const branchCounts = {};
  allAppointments.forEach(a => {
    const b = a.branch || a.branchName || 'NO_BRANCH';
    branchCounts[b] = (branchCounts[b] || 0) + 1;
  });
  console.log('\nAll Appointments Branch distribution:', branchCounts);

  // Detailed Chandanagar Appointments
  const chandaApts = results['appointments']?.chandaDocs || [];
  console.log(`\n--- CHANDANAGAR APPOINTMENTS: ${chandaApts.length} TOTAL ---`);
  const byMonth = {};
  const byStatus = {};
  const patientMap = new Map();

  let octCount = 0;
  let octRevenue = 0;

  chandaApts.forEach(a => {
    const dateStr = normalizeToYMD(a.appointmentDate || a.date || a.createdAt || a.timestamp);
    const m = dateStr ? dateStr.substring(0, 7) : 'NO_DATE';
    byMonth[m] = (byMonth[m] || 0) + 1;

    const st = String(a.status || 'unknown').toLowerCase();
    byStatus[st] = (byStatus[st] || 0) + 1;

    const patKey = (a.patientPhone || a.phone || a.phoneNumber || a.registrationId || a.patientName || a.name || a.id).trim().toLowerCase();
    if (!patientMap.has(patKey)) {
      patientMap.set(patKey, {
        id: a.id,
        name: a.patientName || a.name || 'Unknown',
        phone: a.patientPhone || a.phone || a.phoneNumber || 'N/A',
        regId: a.registrationId || a.regId || 'N/A',
        visits: []
      });
    }
    const paid = Number(a.totalPaid || a.totalAmount || 0);
    patientMap.get(patKey).visits.push({
      date: dateStr,
      status: a.status,
      paid: paid
    });

    if (m === '2026-10') {
      octCount++;
      octRevenue += paid;
    }
  });

  console.log('Chandanagar Visits by Month:', byMonth);
  console.log('Chandanagar Visits by Status:', byStatus);
  console.log(`Unique Patients in Chandanagar Appointments: ${patientMap.size}`);
  console.log(`October 2026 Chandanagar Appointments: ${octCount}, Revenue: ₹${octRevenue}`);

  // Now check allpatients
  const allPatsChanda = results['allpatients']?.chandaDocs || [];
  console.log(`\n--- CHANDANAGAR in ALLPATIENTS: ${allPatsChanda.length} RECORDS ---`);
  let inAllPatientsNotInApt = 0;
  const missingFromAptList = [];

  allPatsChanda.forEach(p => {
    const patKey = (p.patientPhone || p.phone || p.phoneNumber || p.registrationId || p.patientName || p.name || p.id).trim().toLowerCase();
    if (!patientMap.has(patKey)) {
      inAllPatientsNotInApt++;
      missingFromAptList.push({
        id: p.id,
        name: p.name || p.patientName,
        phone: p.phone || p.patientPhone || p.phoneNumber,
        regId: p.registrationId || p.regId,
        date: normalizeToYMD(p.appointmentDate || p.date || p.createdAt),
        status: p.status,
        collection: 'allpatients'
      });
    }
  });

  // Now check patients collection
  const patsChanda = results['patients']?.chandaDocs || [];
  console.log(`\n--- CHANDANAGAR in PATIENTS: ${patsChanda.length} RECORDS ---`);
  let inPatientsNotInApt = 0;
  patsChanda.forEach(p => {
    const patKey = (p.patientPhone || p.phone || p.phoneNumber || p.registrationId || p.patientName || p.name || p.id).trim().toLowerCase();
    if (!patientMap.has(patKey)) {
      inPatientsNotInApt++;
      missingFromAptList.push({
        id: p.id,
        name: p.name || p.patientName,
        phone: p.phone || p.patientPhone || p.phoneNumber,
        regId: p.registrationId || p.regId,
        date: normalizeToYMD(p.appointmentDate || p.date || p.createdAt),
        status: p.status,
        collection: 'patients'
      });
    }
  });

  console.log(`Patients in allpatients not in appointments: ${inAllPatientsNotInApt}`);
  console.log(`Patients in patients not in appointments: ${inPatientsNotInApt}`);
  console.log(`Total missing patients across collections: ${missingFromAptList.length}`);
  if (missingFromAptList.length > 0) {
    console.log('\nDetails of patients in other collections not in appointments:');
    console.log(JSON.stringify(missingFromAptList, null, 2));
  }

  process.exit(0);
}

main();
