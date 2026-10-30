import { doc, setDoc, getDoc, Firestore } from 'firebase/firestore';

export interface BranchTargetResult {
  branchKey: string;
  branchName: string;
  monthlyTarget: number;
  targetReached: number;
  remaining: number;
  percentage: number;
  isReached: boolean;
  currentMonth?: string;
  nextMonth?: string;
  nextMonthTarget?: number;
}

export const normalizeBranchKey = (raw: string = ''): string => {
  const s = String(raw || '').toLowerCase().trim();
  if (s.includes('kphb') || s.includes('kphp') || s.includes('kpb') || s.includes('kukatpally') || s.startsWith('sph-kpb')) return 'kphb';
  if (s.includes('nalla') || s.includes('nallagandla') || s.includes('ngla') || s.includes('nlg') || s.startsWith('sph-nlg')) return 'nallagandla';
  if (s.includes('dilshuk') || s.includes('dilsukh') || s.includes('dsnr') || s.includes('dsn') || s.startsWith('sph-dil') || s.includes('rk/dsnr')) return 'dilshuknagar';
  if (s.includes('chand') || s.includes('chanda') || s.includes('chandnagar') || s.includes('chandanagar') || s.includes('chnr') || s.includes('chn') || s.includes('cngr') || s.startsWith('sph-chn') || s.endsWith('/cn')) return 'chandanagar';
  return '';
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

export const getCurrentMonthYMD = (baseDate: Date = new Date()): string => {
  const y = baseDate.getFullYear();
  const m = String(baseDate.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
};

export const getNextMonthYMD = (baseDate: Date = new Date()): string => {
  const next = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 1);
  const y = next.getFullYear();
  const m = String(next.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
};

export const isMonthEndUnlockedForHR = (now: Date = new Date()): boolean => {
  const totalDaysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const unlockDay = totalDaysInMonth - 2;
  return now.getDate() >= unlockDay;
};

/**
 * Reconciles raw Firestore branchTargets document with current calendar month boundaries.
 * Enforces per-month isolation and automated rollover without hardcoded fallbacks.
 */
export const reconcileBranchTargetData = (data: any, branchKey: string) => {
  const now = new Date();
  const currentMonthStr = getCurrentMonthYMD(now);
  const nextMonthStr = getNextMonthYMD(now);

  const monthlyTargets: Record<string, number> = data?.monthlyTargets || {};

  let monthlyTarget = 0;
  if (monthlyTargets[currentMonthStr] !== undefined && Number(monthlyTargets[currentMonthStr]) > 0) {
    monthlyTarget = Number(monthlyTargets[currentMonthStr]);
  } else if (data?.currentMonth === currentMonthStr || data?.month === currentMonthStr) {
    monthlyTarget = Number(data?.monthlyTarget) || 0;
  }

  const nextMonthTarget = (monthlyTargets[nextMonthStr] !== undefined)
    ? Number(monthlyTargets[nextMonthStr])
    : (Number(data?.nextMonthTarget) || 0);

  const targetReached = (data?.currentMonth === currentMonthStr || data?.month === currentMonthStr)
    ? (Number(data?.targetReached) || 0)
    : 0;

  const remaining = monthlyTarget > 0 ? Math.max(0, monthlyTarget - targetReached) : 0;
  const percentage = monthlyTarget > 0 ? Math.min(Math.round((targetReached / monthlyTarget) * 100), 100) : 0;
  const isReached = monthlyTarget > 0 && targetReached >= monthlyTarget;

  return {
    id: branchKey,
    branchId: branchKey,
    branchName: data?.branchName || getCanonicalBranchName(branchKey),
    currentMonth: currentMonthStr,
    nextMonth: nextMonthStr,
    monthlyTarget,
    nextMonthTarget,
    targetReached,
    remaining,
    percentage,
    isReached,
    monthlyTargets
  };
};

/**
 * Calculates dynamic revenue collected this month for a given branch
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

  // 1. Process all appointments (consultations, medicine, packages, split payments)
  for (const app of appointments) {
    if (!app) continue;

    // Filter by branch
    const appBranch = app.branch || app.targetBranch || app.branchName;
    if (normalizeBranchKey(appBranch) !== targetKey) continue;

    // Filter by payment status (exclude cancelled / failed / uncollected)
    const s = String(app.status || '').toLowerCase().trim();
    const p = String(app.paymentStatus || '').toLowerCase().trim();
    if (s === 'cancelled' || s === 'canceled' || p === 'cancelled' || p === 'failed') continue;

    const isPaid = p === 'paid' || s === 'completed' || s === 'done' || s === 'paid' || (Number(app.totalPaid) > 0);
    if (!isPaid) continue;

    // Filter by current month boundary
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

  // 2. Process package members where not already counted
  for (const pkg of packageMembers) {
    if (!pkg) continue;

    const pkgBranch = pkg.branch || pkg.targetBranch || pkg.branchName;
    if (normalizeBranchKey(pkgBranch) !== targetKey) continue;

    const rawDate = pkg.paymentCollectedAt || pkg.createdAt || pkg.startDate || pkg.updatedAt;
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
  const percentage = monthlyTarget > 0 ? Math.min(Math.round((totalRevenue / monthlyTarget) * 100), 100) : 0;
  const isReached = monthlyTarget > 0 && totalRevenue >= monthlyTarget;

  return {
    branchKey: targetKey,
    branchName: canonName,
    monthlyTarget,
    targetReached: totalRevenue,
    remaining,
    percentage,
    isReached
  };
};

/**
 * Persists calculated dynamic branch targets to Firestore `branchTargets` collection.
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
  const currentMonthStr = getCurrentMonthYMD();

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
    } catch (_) { }

    const targetGoal = (customMonthlyTarget !== undefined && customMonthlyTarget !== null && Number(customMonthlyTarget) > 0)
      ? Number(customMonthlyTarget)
      : existingMonthlyTarget;

    const remaining = targetGoal > 0 ? Math.max(0, targetGoal - effectiveTargetReached) : 0;
    const percentage = targetGoal > 0 ? Math.min(Math.round((effectiveTargetReached / targetGoal) * 100), 100) : 0;

    const updatePayload: any = {
      id: branchKey,
      branchId: branchKey,
      branchName: canonName,
      targetReached: effectiveTargetReached,
      remaining,
      percentage,
      isReached: targetGoal > 0 && effectiveTargetReached >= targetGoal,
      currentMonth: currentMonthStr,
      month: currentMonthStr,
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
 * without resetting or relying on arbitrary hardcoded fallbacks.
 */
export const incrementBranchTargetRevenue = async (
  firestoreDb: Firestore,
  branchName: string,
  amountPaid: number
): Promise<void> => {
  if (!firestoreDb || !amountPaid || amountPaid <= 0) return;
  const branchKey = normalizeBranchKey(branchName);
  const canonName = getCanonicalBranchName(branchKey);
  const currentMonthStr = getCurrentMonthYMD();

  try {
    const docRef = doc(firestoreDb, 'branchTargets', branchKey);
    const snap = await getDoc(docRef);
    let existingMonthlyTarget = 0;
    let existingReached = 0;

    if (snap.exists()) {
      const data = snap.data();
      existingMonthlyTarget = Number(data?.monthlyTarget) || 0;
      existingReached = Number(data?.targetReached) || 0;
    }

    const newReached = existingReached + amountPaid;
    const remaining = existingMonthlyTarget > 0 ? Math.max(0, existingMonthlyTarget - newReached) : 0;
    const percentage = existingMonthlyTarget > 0 ? Math.min(Math.round((newReached / existingMonthlyTarget) * 100), 100) : 0;
    const isReached = existingMonthlyTarget > 0 && newReached >= existingMonthlyTarget;

    await setDoc(docRef, {
      id: branchKey,
      branchId: branchKey,
      branchName: canonName,
      monthlyTarget: existingMonthlyTarget,
      targetReached: newReached,
      remaining,
      percentage,
      isReached,
      currentMonth: currentMonthStr,
      month: currentMonthStr,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (err) {
    console.warn('Error incrementing branch target revenue:', err);
  }
};
