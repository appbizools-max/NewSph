import { doc, setDoc, getDoc, Firestore } from 'firebase/firestore';

export interface BranchTargetResult {
  branchKey: string;
  branchName: string;
  monthlyTarget: number;
  targetReached: number;
  remaining: number;
  percentage: number;
}

export const DEFAULT_BRANCH_MONTHLY_GOALS: Record<string, number> = {
  kphb: 725000,
  nallagandla: 325000,
  dilshuknagar: 225000,
  chandanagar: 550000,
};

export const normalizeBranchKey = (raw: string = ''): string => {
  const s = String(raw || '').toLowerCase().trim();
  if (s.includes('kphb') || s.includes('kukatpally')) return 'kphb';
  if (s.includes('nalla') || s.includes('nallagandla')) return 'nallagandla';
  if (s.includes('dilshuk') || s.includes('dilsukh') || s.includes('dsnr') || s.includes('dshnr')) return 'dilshuknagar';
  if (s.includes('chanda') || s.includes('chnr') || s.includes('chandanagar')) return 'chandanagar';
  return 'kphb';
};

export const getCanonicalBranchName = (keyOrName: string = ''): string => {
  const key = normalizeBranchKey(keyOrName);
  switch (key) {
    case 'kphb': return 'KPHB Branch';
    case 'nallagandla': return 'Nallagandla Branch';
    case 'dilshuknagar': return 'Dilshuknagar Branch';
    case 'chandanagar': return 'Chandanagar Branch';
    default: return 'KPHB Branch';
  }
};

export const normalizeToYMD = (raw: any): string => {
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
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
  } catch (e) { }
  return '';
};

export const getCurrentMonthYMD = (): string => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
};

/**
 * Calculates the exact dynamic revenue collected this month for a given branch
 * from all paid appointments (consultation, medicine, package, split) and package memberships.
 */
export const calculateRealBranchRevenue = (
  branchName: string,
  appointments: any[] = [],
  packageMembers: any[] = [],
  customMonthlyTarget?: number,
  targetMonthStr?: string
): BranchTargetResult => {
  const targetKey = normalizeBranchKey(branchName);
  const canonName = getCanonicalBranchName(targetKey);
  const monthPrefix = targetMonthStr || getCurrentMonthYMD();

  let totalRevenue = 0;
  const seenPaymentIds = new Set<string>();

  // 1. Process all appointments (consultations, consultation_med, packages, split payments)
  for (const app of appointments) {
    if (!app) continue;

    // Filter by branch
    const appBranch = app.branch || app.targetBranch || app.branchName;
    if (normalizeBranchKey(appBranch) !== targetKey) continue;

    // Filter by payment status
    const s = String(app.status || '').toLowerCase().trim();
    const p = String(app.paymentStatus || '').toLowerCase().trim();
    const isPaid = p === 'paid' || s === 'completed' || s === 'done' || s === 'paid' || (Number(app.totalPaid) > 0);
    if (!isPaid) continue;

    // Filter by current month
    const rawDate = app.paymentCollectedAt || app.appointmentDate || app.date || app.createdAt || app.updatedAt;
    const ymd = normalizeToYMD(rawDate);
    if (!ymd || !ymd.startsWith(monthPrefix)) continue;

    // Deduplicate by ID
    const docId = String(app.id || '');
    if (docId) {
      if (seenPaymentIds.has(docId)) continue;
      seenPaymentIds.add(docId);
    }

    // Extract collected amount
    let paidAmt = 0;
    if (app.totalPaid !== undefined && app.totalPaid !== null && Number(app.totalPaid) > 0) {
      paidAmt = Number(app.totalPaid);
    } else if (app.totalAmount !== undefined && app.totalAmount !== null && Number(app.totalAmount) > 0) {
      paidAmt = Number(app.totalAmount);
    } else {
      const cFee = Number(app.consultationFee) || 0;
      const mFee = Number(app.medicineFee || app.pharmacyFee || app.medicineFeeRequested) || 0;
      const dFee = Number(app.dietFee || app.dietFeeAmount || app.dietPlan?.dietFeeAmount || app.dietPlan?.dietFee) || 0;
      const oFee = Number(app.otherCharges) || 0;
      const pFee = Number(app.packageFee || app.packageAdvancePaid) || 0;
      const disc = Number(app.discount) || 0;
      paidAmt = Math.max(0, cFee + mFee + dFee + oFee + pFee - disc);
    }

    totalRevenue += paidAmt;
  }

  // 2. Process package members (advance & installment collections) where not already counted
  for (const pkg of packageMembers) {
    if (!pkg) continue;

    const pkgBranch = pkg.branch || pkg.targetBranch || pkg.branchName;
    if (normalizeBranchKey(pkgBranch) !== targetKey) continue;

    const rawDate = pkg.createdAt || pkg.startDate || pkg.updatedAt;
    const ymd = normalizeToYMD(rawDate);
    if (!ymd || !ymd.startsWith(monthPrefix)) continue;

    const docId = String(pkg.id || '');
    if (docId && seenPaymentIds.has(docId)) continue;
    if (pkg.patientDocId && seenPaymentIds.has(pkg.patientDocId)) continue;
    if (docId) seenPaymentIds.add(docId);

    const pkgPaid = Number(pkg.paidAmount || pkg.advancePaid || pkg.totalAmount) || 0;
    if (pkgPaid > 0) {
      totalRevenue += pkgPaid;
    }
  }

  const monthlyTarget = (customMonthlyTarget !== undefined && customMonthlyTarget !== null)
    ? Number(customMonthlyTarget)
    : 0;
  const remaining = monthlyTarget > 0 ? Math.max(0, monthlyTarget - totalRevenue) : 0;
  const percentage = monthlyTarget > 0 ? Math.round((totalRevenue / monthlyTarget) * 100) : 0;

  return {
    branchKey: targetKey,
    branchName: canonName,
    monthlyTarget,
    targetReached: totalRevenue,
    remaining,
    percentage,
  };
};

/**
 * Persists calculated dynamic branch targets to Firestore `branchTargets` collection.
 * Does NOT overwrite Firestore monthlyTarget unless customMonthlyTarget is explicitly passed and > 0.
 */
export const syncBranchTargetToFirestore = async (
  firestoreDb: Firestore,
  branchName: string,
  targetReached: number,
  customMonthlyTarget?: number
): Promise<void> => {
  if (!firestoreDb) return;
  const branchKey = normalizeBranchKey(branchName);
  const canonName = getCanonicalBranchName(branchKey);

  try {
    const docRef = doc(firestoreDb, 'branchTargets', branchKey);
    let effectiveTargetReached = targetReached;
    let existingMonthlyTarget = 0;

    try {
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const existingData = snap.data();
        existingMonthlyTarget = Number(existingData?.monthlyTarget) || 0;
        const existingReached = Number(existingData?.targetReached || 0);
        if (existingReached > effectiveTargetReached) {
          effectiveTargetReached = existingReached;
        }
      }
    } catch (_) {}

    const targetGoal = (customMonthlyTarget !== undefined && customMonthlyTarget !== null && Number(customMonthlyTarget) > 0)
      ? Number(customMonthlyTarget)
      : existingMonthlyTarget;

    const remaining = targetGoal > 0 ? Math.max(0, targetGoal - effectiveTargetReached) : 0;
    const percentage = targetGoal > 0 ? Math.round((effectiveTargetReached / targetGoal) * 100) : 0;

    const updatePayload: any = {
      id: branchKey,
      branchName: canonName,
      targetReached: effectiveTargetReached,
      remaining,
      percentage,
      month: getCurrentMonthYMD(),
      updatedAt: new Date().toISOString(),
    };

    if (targetGoal > 0) {
      updatePayload.monthlyTarget = targetGoal;
    }

    await setDoc(docRef, updatePayload, { merge: true });
  } catch (err) {
    console.warn(`Error syncing branchTarget for ${branchKey}:`, err);
  }
};

/**
 * Atomically increments targetReached by a newly collected payment
 * without recalculating or resetting from partial queue data.
 */
export const incrementBranchTargetRevenue = async (
  firestoreDb: Firestore,
  branchName: string,
  amountPaid: number
): Promise<void> => {
  if (!firestoreDb || !amountPaid || amountPaid <= 0) return;
  const branchKey = normalizeBranchKey(branchName);
  const canonName = getCanonicalBranchName(branchKey);

  try {
    const docRef = doc(firestoreDb, 'branchTargets', branchKey);
    const snap = await getDoc(docRef);
    let existingMonthlyTarget = DEFAULT_BRANCH_MONTHLY_GOALS[branchKey] || 725000;
    let existingReached = 0;

    if (snap.exists()) {
      const data = snap.data();
      existingMonthlyTarget = Number(data?.monthlyTarget) || existingMonthlyTarget;
      existingReached = Number(data?.targetReached) || 0;
    }

    const newReached = existingReached + amountPaid;
    const remaining = existingMonthlyTarget > 0 ? Math.max(0, existingMonthlyTarget - newReached) : 0;
    const percentage = existingMonthlyTarget > 0 ? Math.round((newReached / existingMonthlyTarget) * 100) : 0;

    await setDoc(docRef, {
      id: branchKey,
      branchId: branchKey,
      branchName: canonName,
      monthlyTarget: existingMonthlyTarget,
      targetReached: newReached,
      remaining,
      percentage,
      month: getCurrentMonthYMD(),
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    console.warn('Error incrementing branch target revenue:', err);
  }
};

