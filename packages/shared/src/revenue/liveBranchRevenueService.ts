import { collection, onSnapshot, doc, getDoc, setDoc } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';

const normalizeBranchKey = (raw: string = '', regId: string = ''): 'kphb' | 'nallagandla' | 'dilshuknagar' | 'chandanagar' => {
  const s = String(raw || '').toLowerCase().trim();
  const r = String(regId || '').toLowerCase().trim();
  if (s.includes('kphb') || s.includes('kukatpally') || s.includes('kphp') || r.includes('kphb')) return 'kphb';
  if (s.includes('nalla') || s.includes('nallagandla') || s.includes('nlg') || r.includes('nlg')) return 'nallagandla';
  if (s.includes('dilshuk') || s.includes('dilsukh') || s.includes('dsnr') || s.includes('dshnr') || r.includes('dsnr')) return 'dilshuknagar';
  if (s.includes('chanda') || s.includes('chnr') || s.includes('chandanagar') || s.includes('cngr') || r.includes('cngr')) return 'chandanagar';
  return 'kphb';
};

const getCanonicalBranchName = (key: string): string => {
  switch (key) {
    case 'kphb': return 'KPHB Branch';
    case 'nallagandla': return 'Nallagandla Branch';
    case 'dilshuknagar': return 'Dilshuknagar Branch';
    case 'chandanagar': return 'Chandanagar Branch';
    default: return 'KPHB Branch';
  }
};

const extractCleanNum = (c: any): number => {
  if (c !== undefined && c !== null && c !== '') {
    const cleanStr = String(c).replace(/[^0-9.]/g, '');
    const num = Number(cleanStr);
    if (!isNaN(num) && num > 0) return num;
  }
  return 0;
};

const isFirestoreAutoId = (id: any): boolean => {
  if (!id || typeof id !== 'string') return false;
  const s = id.trim();
  return (s.length >= 16 && s.length <= 32 && /^[A-Za-z0-9]+$/.test(s) && !s.includes('-') && !s.includes('/') && !s.includes('_') && !s.includes(' '));
};

const extractCleanRegId = (item: any): string => {
  if (!item || typeof item !== 'object') return '';
  const candidates = [
    item.regId,
    item.registrationId,
    item.regID,
    item.registration_id,
    item.registrationNo,
    item.regNo,
    item.uhid,
    item.UHID,
    item.oldRegId,
    item.customId,
    item.patientRegId,
    item.patientCode,
    item.mrn,
    item.fileNo,
    item.patientId,
    item.patient_id
  ];

  for (const c of candidates) {
    if (c && typeof c === 'string') {
      const clean = c.trim();
      if (clean && !isFirestoreAutoId(clean) && clean !== 'undefined' && clean !== 'null') {
        return clean;
      }
    }
  }
  return '';
};

const normalizeToYMD = (raw: any): string => {
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

const getCurrentMonthPrefix = (): string => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
};

let isSyncRunning = false;
let syncUnsubs: Array<() => void> = [];


export function startLiveBranchRevenueSync(db: Firestore | null | undefined): () => void {
  if (!db || isSyncRunning) {
    return () => { };
  }
  isSyncRunning = true;

  const collections = [
    'alltransactions',
    'allpatients',
    'appointments',
    'package_members',
    'nutrition_plans'
  ];

  const colDocs: Record<string, any[]> = {};
  let debounceTimer: any = null;

  const recomputeAndSync = () => {
    try {
      const currentMonthPrefix = getCurrentMonthPrefix();
      const allTxnDocs = colDocs['alltransactions'] || [];
      const allPatientDocs = colDocs['allpatients'] || [];
      const appointmentDocs = colDocs['appointments'] || [];
      const packageMemberDocs = colDocs['package_members'] || [];
      const nutritionDocs = colDocs['nutrition_plans'] || [];

      // 1. Build live Patient Reg ID lookup map
      const patientRegIdMap = new Map<string, string>();
      const scanDocForMeta = (docItem: any) => {
        if (!docItem) return;
        const cleanReg = extractCleanRegId(docItem);
        const phone = String(docItem.phoneNumber || docItem.phone || docItem.mobile || '').replace(/\D/g, '').slice(-10);
        const docId = String(docItem.id || '').trim();
        const name = String(docItem.patientName || docItem.name || docItem.fullName || '').toLowerCase().trim();

        if (cleanReg) {
          if (docId) patientRegIdMap.set(docId, cleanReg);
          if (phone) patientRegIdMap.set(phone, cleanReg);
          if (docItem.patientId && !isFirestoreAutoId(docItem.patientId)) patientRegIdMap.set(docItem.patientId, cleanReg);
          if (name) patientRegIdMap.set(name, cleanReg);
        }
      };

      allPatientDocs.forEach(scanDocForMeta);
      appointmentDocs.forEach(scanDocForMeta);
      packageMemberDocs.forEach(scanDocForMeta);

      const branchRevenue: Record<'kphb' | 'nallagandla' | 'dilshuknagar' | 'chandanagar', number> = {
        kphb: 0,
        nallagandla: 0,
        dilshuknagar: 0,
        chandanagar: 0
      };

      const seenAppointmentIds = new Set<string>();
      const seenTxnIds = new Set<string>();
      const seenPatientIds = new Set<string>();

      // 1. 📅 appointments (Authoritative Clinic Collections)
      for (const apt of appointmentDocs) {
        if (!apt) continue;
        const rawDate = apt.paymentCollectedAt || apt.appointmentDate || apt.date || apt.createdAt || apt.updatedAt;
        const ymd = normalizeToYMD(rawDate);
        const resolvedRegId = extractCleanRegId(apt);

        const consultationFee =
          extractCleanNum(apt.totalPaid) ||
          extractCleanNum(apt.totalAmount) ||
          extractCleanNum(apt.amountPaid) ||
          extractCleanNum(apt.paidAmount) ||
          extractCleanNum(apt.amount) ||
          extractCleanNum(apt.collectFee) ||
          extractCleanNum(apt.paymentAmount) ||
          (extractCleanNum(apt.consultationFee) + extractCleanNum(apt.medicineFee || apt.pharmacyFee) + extractCleanNum(apt.packageFee || apt.packageAdvancePaid));

        const paymentStatus = String(apt.paymentStatus || apt.status || '').toLowerCase();
        const isPaid = paymentStatus === 'paid' || paymentStatus === 'confirmed' || paymentStatus === 'completed' || paymentStatus === 'done' || consultationFee > 0;

        if (apt.id) seenAppointmentIds.add(String(apt.id));

        if (consultationFee > 0 && isPaid && ymd && ymd.startsWith(currentMonthPrefix)) {
          const bKey = normalizeBranchKey(apt.branchName || apt.branch || apt.targetBranch, resolvedRegId);
          branchRevenue[bKey] += consultationFee;
        }
      }

      // 2. 📑 alltransactions (Add standalone payments not attached to already counted appointments)
      for (const item of allTxnDocs) {
        if (!item) continue;
        const rawDate = item.timestamp || item.date || item.createdAt;
        const ymd = normalizeToYMD(rawDate);
        const resolvedRegId = extractCleanRegId(item);

        if (item.id) seenTxnIds.add(String(item.id));
        if (item.appointmentId && seenAppointmentIds.has(String(item.appointmentId))) {
          continue; // Already counted from appointments
        }

        const itemsConsultation = extractCleanNum(item.itemsPaid?.consultation);
        const itemsMedicine = extractCleanNum(item.itemsPaid?.medicine);
        const itemsPackage = extractCleanNum(item.itemsPaid?.package || item.itemsPaid?.diet);

        const consultationFee = extractCleanNum(item.consultationFee) || itemsConsultation;
        const medicineFee = extractCleanNum(item.medicineFee) || itemsMedicine;
        const packageFee = extractCleanNum(item.packageFee) || itemsPackage;

        const totalAmount =
          extractCleanNum(item.amount) ||
          extractCleanNum(item.totalAmount) ||
          extractCleanNum(item.totalPaid) ||
          extractCleanNum(item.paidAmount) ||
          (consultationFee + medicineFee + packageFee);

        if (totalAmount > 0 && ymd && ymd.startsWith(currentMonthPrefix)) {
          const bKey = normalizeBranchKey(item.branchName || item.branchId || item.branch, resolvedRegId);
          branchRevenue[bKey] += totalAmount;
        }
      }

      // 3. 👤 allpatients (Patient Direct Billing where not in appointments or transactions)
      for (const p of allPatientDocs) {
        if (!p) continue;
        if (p.id && (seenAppointmentIds.has(p.id) || seenTxnIds.has(p.id) || seenPatientIds.has(p.id))) continue;
        if (p.id) seenPatientIds.add(p.id);

        const rawDate = p.paymentCollectedAt || p.createdAt || p.date;
        const ymd = normalizeToYMD(rawDate);
        const resolvedRegId = extractCleanRegId(p);

        const amountPaid = extractCleanNum(p.amountPaid) || extractCleanNum(p.totalPaid) || extractCleanNum(p.paidAmount);
        if (amountPaid > 0 && ymd && ymd.startsWith(currentMonthPrefix)) {
          const bKey = normalizeBranchKey(p.branchName || p.branch, resolvedRegId);
          branchRevenue[bKey] += amountPaid;
        }
      }

      // 4. nutrition_plans (Special Package Sales)
      for (const nut of nutritionDocs) {
        if (!nut) continue;
        const rawDate = nut.paymentCollectedAt || nut.createdAt || nut.date;
        const ymd = normalizeToYMD(rawDate);
        const amount = extractCleanNum(nut.amount) || extractCleanNum(nut.packageCost) || extractCleanNum(nut.price);

        if (amount > 0 && ymd && ymd.startsWith(currentMonthPrefix)) {
          const bKey = normalizeBranchKey(nut.branchName || nut.branchId || nut.branch);
          branchRevenue[bKey] += amount;
        }
      }

      // 5. package_members (Care Packages, Advances & Installments)
      for (const pkg of packageMemberDocs) {
        if (!pkg) continue;
        if (pkg.id && seenAppointmentIds.has(pkg.id)) continue;

        if (Array.isArray(pkg.paymentHistory) && pkg.paymentHistory.length > 0) {
          pkg.paymentHistory.forEach((inst: any, idx: number) => {
            const instAmt = extractCleanNum(inst.amount || inst.paidAmount);
            if (instAmt <= 0) return;
            const instDate = inst.date || inst.paymentDate || pkg.startDate || pkg.createdAt;
            const instYmd = normalizeToYMD(instDate);
            const instId = `${pkg.id}_inst_${idx}`;

            if (seenTxnIds.has(instId)) return;
            seenTxnIds.add(instId);

            if (instYmd && instYmd.startsWith(currentMonthPrefix)) {
              const bKey = normalizeBranchKey(pkg.branch || pkg.branchName || pkg.targetBranch);
              branchRevenue[bKey] += instAmt;
            }
          });
        } else {
          const rawDate = pkg.paymentCollectedAt || pkg.enrolledDate || pkg.paymentDate || pkg.startDate || pkg.createdAt;
          const ymd = normalizeToYMD(rawDate);
          const pkgAmt =
            extractCleanNum(pkg.totalPaid) ||
            extractCleanNum(pkg.advancePaid) ||
            extractCleanNum(pkg.paidAmount) ||
            extractCleanNum(pkg.amount) ||
            extractCleanNum(pkg.totalAmount);

          const pkgId = String(pkg.id || '');
          if (pkgId && seenTxnIds.has(pkgId)) continue;
          if (pkgId) seenTxnIds.add(pkgId);

          if (pkgAmt > 0 && ymd && ymd.startsWith(currentMonthPrefix)) {
            const bKey = normalizeBranchKey(pkg.branch || pkg.branchName || pkg.targetBranch);
            branchRevenue[bKey] += pkgAmt;
          }
        }
      }

      // Sync computed dynamic revenue into Firestore `branchTargets` collection
      const branchKeys: Array<'kphb' | 'nallagandla' | 'dilshuknagar' | 'chandanagar'> = [
        'kphb',
        'nallagandla',
        'dilshuknagar',
        'chandanagar'
      ];

      for (const key of branchKeys) {
        const liveReached = branchRevenue[key] || 0;
        const docRef = doc(db, 'branchTargets', key);

        getDoc(docRef).then((snap) => {
          const existing = snap.exists() ? snap.data() : {};
          const existingReached = Number(existing?.targetReached) || 0;
          const monthlyTargets = existing?.monthlyTargets || {};

          // Always prefer the explicit target configured for the current month
          let monthlyTarget = (monthlyTargets[currentMonthPrefix] !== undefined && Number(monthlyTargets[currentMonthPrefix]) > 0)
            ? Number(monthlyTargets[currentMonthPrefix])
            : (Number(existing?.monthlyTarget) || 0);

          // Never degrade an authoritative targetReached with an incomplete live sum
          const effectiveReached = Math.max(existingReached, liveReached);

          if (existingReached !== effectiveReached || existing.monthlyTarget !== monthlyTarget || existing.currentMonth !== currentMonthPrefix || existing.month !== currentMonthPrefix) {
            const remaining = monthlyTarget > 0 ? Math.max(0, monthlyTarget - effectiveReached) : 0;
            const percentage = monthlyTarget > 0 ? Math.min(Math.round((effectiveReached / monthlyTarget) * 100), 100) : 0;
            const isReached = monthlyTarget > 0 && effectiveReached >= monthlyTarget;

            const payload: any = {
              id: key,
              branchId: key,
              branchName: getCanonicalBranchName(key),
              currentMonth: currentMonthPrefix,
              month: currentMonthPrefix,
              targetReached: effectiveReached,
              remaining,
              percentage,
              isReached,
              updatedAt: new Date().toISOString()
            };

            if (monthlyTarget > 0) {
              payload.monthlyTarget = monthlyTarget;
            }

            setDoc(docRef, payload, { merge: true }).catch((err) => {
              console.warn(`[LiveRevenueSync] Failed to update branchTargets/${key}:`, err);
            });
          }
        }).catch(() => { });
      }
    } catch (err) {
      console.warn('[LiveRevenueSync] Computation notice:', err);
    }
  };

  const scheduleRecompute = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(recomputeAndSync, 800);
  };

  collections.forEach((colName) => {
    try {
      const unsub = onSnapshot(collection(db, colName), (snap) => {
        colDocs[colName] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        scheduleRecompute();
      }, (err) => {
        console.warn(`[LiveRevenueSync] Listener notice for ${colName}:`, err);
      });
      syncUnsubs.push(unsub);
    } catch (e) {
      console.warn(`[LiveRevenueSync] Setup notice for ${colName}:`, e);
    }
  });

  return () => {
    isSyncRunning = false;
    if (debounceTimer) clearTimeout(debounceTimer);
    syncUnsubs.forEach(u => u());
    syncUnsubs = [];
  };
}
