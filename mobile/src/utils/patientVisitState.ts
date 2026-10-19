export interface PatientVisitState {
  type: 'NEW' | 'IN_DUR' | 'REVISIT' | 'PKG';
  label: string;
  badgeText: string;
  badgeBg: string;
  badgeColor: string;
  badgeBorder: string;
  expiryDate?: string;
  durationLabel?: string;
  daysRemaining?: number;
  isCoveredZeroFee: boolean;
  tooltip: string;
  isApp?: boolean;
  appBadgeText?: string;
}
/**
 * Safely parse any date value (string, number, Date, Firestore Timestamp with toDate/seconds)
 */
export function parseSafeDate(val: any): Date {
  if (!val) return new Date(0);
  if (val instanceof Date) return isNaN(val.getTime()) ? new Date(0) : val;
  if (typeof val.toDate === 'function') {
    try {
      const d = val.toDate();
      if (d instanceof Date && !isNaN(d.getTime())) return d;
    } catch (e) {
      // ignore
    }
  }
  if (typeof val.seconds === 'number') {
    return new Date(val.seconds * 1000);
  }
  if (typeof val.getTime === 'function') {
    try {
      const d = new Date(val.getTime());
      if (!isNaN(d.getTime())) return d;
    } catch (e) {
      // ignore
    }
  }
  const str = String(val).trim();
  if (!str || str === '[object Object]') return new Date(0);
  // 1. YYYY-MM-DD or YYYY/MM/DD
  const ymdMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (ymdMatch) {
    const y = parseInt(ymdMatch[1], 10);
    const m = parseInt(ymdMatch[2], 10) - 1;
    const d = parseInt(ymdMatch[3], 10);
    const dt = new Date(y, m, d, 23, 59, 59, 999);
    if (!isNaN(dt.getTime())) return dt;
  }
  // 2. DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (dmyMatch) {
    const d = parseInt(dmyMatch[1], 10);
    const m = parseInt(dmyMatch[2], 10) - 1;
    const y = parseInt(dmyMatch[3], 10);
    const dt = new Date(y, m, d, 23, 59, 59, 999);
    if (!isNaN(dt.getTime())) return dt;
  }
  // 3. "10 Sep 2026" or "10 September 2026"
  const wordMonthMatch = str.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (wordMonthMatch) {
    const d = parseInt(wordMonthMatch[1], 10);
    const monthName = wordMonthMatch[2].toLowerCase().slice(0, 3);
    const y = parseInt(wordMonthMatch[3], 10);
    const monthMap: Record<string, number> = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
    };
    if (monthMap[monthName] !== undefined) {
      const dt = new Date(y, monthMap[monthName], d, 23, 59, 59, 999);
      if (!isNaN(dt.getTime())) return dt;
    }
  }
  try {
    const dt = new Date(str);
    if (!isNaN(dt.getTime())) return dt;
  } catch (e) {
    // ignore
  }
  return new Date(0);
}
/**
 * Calculates the exact expiry date based on a start date and duration string.
 * Supports days, weeks, months, years.
 */
export function calculateDurationExpiry(startDateInput: any, durationStr: string): Date {
  const start = parseSafeDate(startDateInput);
  if (start.getTime() === 0) return new Date(0);
  const dStr = (durationStr || '').trim().toLowerCase();
  const expiry = new Date(start.getTime());
  if (dStr.includes('year') || dStr.includes('12 month')) {
    expiry.setFullYear(expiry.getFullYear() + 1);
  } else if (dStr.includes('6 month')) {
    expiry.setMonth(expiry.getMonth() + 6);
  } else if (dStr.includes('5 month')) {
    expiry.setMonth(expiry.getMonth() + 5);
  } else if (dStr.includes('4 month')) {
    expiry.setMonth(expiry.getMonth() + 4);
  } else if (dStr.includes('3 month')) {
    expiry.setMonth(expiry.getMonth() + 3);
  } else if (dStr.includes('2 month')) {
    expiry.setMonth(expiry.getMonth() + 2);
  } else if (dStr.includes('1 month') || dStr.includes('month')) {
    expiry.setMonth(expiry.getMonth() + 1);
  } else if (dStr.includes('week')) {
    const numWeeks = parseInt(dStr, 10) || 1;
    expiry.setDate(expiry.getDate() + (numWeeks * 7));
  } else if (dStr.includes('day')) {
    const numDays = parseInt(dStr, 10) || 15;
    expiry.setDate(expiry.getDate() + numDays);
  } else {
    // Default fallback: 1 month
    expiry.setMonth(expiry.getMonth() + 1);
  }

  expiry.setHours(23, 59, 59, 999);
  return expiry;
}

export function cleanPatientName(name: any): string {
  if (!name) return '';
  let str = String(name).toLowerCase().trim();
  // Strip salutations and honorifics
  str = str.replace(/^(dr\.|dr|mr\.|mr|mrs\.|mrs|ms\.|ms|master|baby|smt\.|smt|shri|shree)\s+/i, '');
  return str.replace(/[^a-z0-9]/g, '');
}

export function extractPhone(obj: any): string {
  if (!obj) return '';
  const raw = obj.phone || obj.phoneNumber || obj.mobile || obj.patientPhone || obj.contactNumber || obj.contact || obj.mobileNumber || obj.tel || '';
  return String(raw).replace(/\D/g, '').slice(-10);
}

export function extractName(obj: any): string {
  if (!obj) return '';
  return String(obj.patientName || obj.fullName || obj.name || obj.patient_name || obj.patient || obj.pName || '').trim();
}

export function extractRegId(obj: any): string {
  if (!obj) return '';
  const raw = obj.regNo || obj.regId || obj.registrationId || obj.patientId || obj.uhid || obj.patient_id || obj.patientUHID || obj.opNumber || obj.mrn || obj.customId || '';
  return String(raw).trim().toLowerCase();
}

export function extractDocId(obj: any): string {
  if (!obj) return '';
  const raw = obj.patientDocId || obj.patient_id || obj.patientId || obj.id || obj.docId || '';
  return String(raw).trim();
}

/**
 * Checks if two appointment/patient records represent the exact SAME patient profile.
 * Match criteria:
 * 1. Matching Patient Document ID / Registration ID
 * 2. If both records have names, names MUST match. If names differ (e.g. Rajesh vs Suresh under same phone),
 *    they are DIFFERENT profiles and do NOT match!
 * 3. Phone number fallback ONLY if one of the names is missing.
 */
export function isSamePatientProfile(app: any, rec: any): boolean {
  if (!app || !rec) return false;

  const appDocId = extractDocId(app);
  const recDocId = extractDocId(rec);
  if (appDocId && recDocId && (appDocId === recDocId || rec.patientDocId === app.id || app.patientDocId === rec.id)) {
    return true;
  }

  const appReg = extractRegId(app);
  const recReg = extractRegId(rec);
  if (appReg && recReg && appReg.length >= 2 && appReg.toLowerCase() === recReg.toLowerCase()) {
    return true;
  }

  const appName = extractName(app);
  const recName = extractName(rec);
  const appCleanName = cleanPatientName(appName);
  const recCleanName = cleanPatientName(recName);

  const appPhone = extractPhone(app);
  const recPhone = extractPhone(rec);

  // If BOTH records have valid 10-digit phone numbers and they DIFFER:
  // They CANNOT be the same patient profile (unless matching registration ID above)!
  if (appPhone && recPhone && appPhone.length >= 7 && recPhone.length >= 7 && appPhone !== recPhone) {
    return false;
  }

  // If both records have patient names
  if (appCleanName && recCleanName) {
    const isNameMatch = appCleanName === recCleanName ||
      ((appCleanName.length >= 5 && recCleanName.length >= 5) && (appCleanName.includes(recCleanName) || recCleanName.includes(appCleanName)));

    if (isNameMatch) {
      // If phone numbers are also present, they must match
      if (appPhone && recPhone && appPhone.length >= 7 && recPhone.length >= 7) {
        return appPhone === recPhone;
      }
      // If one record has a verified phone number and the other has none, only match if clean name is strong (>= 6 chars) and exact
      if (appPhone && !recPhone) {
        return appCleanName.length >= 6 && appCleanName === recCleanName;
      }
      return true;
    }

    // IF NAMES ARE DIFFERENT (e.g. "Rajesh Kumar" vs "Suresh Kumar"),
    // THEY ARE DIFFERENT PATIENT PROFILES!
    // Do NOT match across different profiles even if phone number is identical!
    return false;
  }

  // Fallback: If one of the names is completely missing/empty, fallback to phone match
  if (appPhone && recPhone && appPhone.length >= 7 && appPhone === recPhone) {
    return true;
  }

  return false;
}

// High-performance memoized index for fast O(1) matching against massive collection pools (10,000+ records)
let lastPoolRef: any[] | null = null;
let lastPoolLength = -1;
let phoneIndex = new Map<string, any[]>();
let nameIndex = new Map<string, any[]>();
let docIdIndex = new Map<string, any[]>();
let regIdIndex = new Map<string, any[]>();

// Cache for visit state results keyed by appointment ID + phone + name + pool size
const visitStateResultCache = new Map<string, PatientVisitState>();

function getOrBuildIndex(allRecords: any[]) {
  if (allRecords === lastPoolRef || (allRecords.length === lastPoolLength && allRecords.length > 0)) {
    return { phoneIndex, nameIndex, docIdIndex, regIdIndex };
  }
  lastPoolRef = allRecords;
  lastPoolLength = allRecords.length;
  phoneIndex = new Map<string, any[]>();
  nameIndex = new Map<string, any[]>();
  docIdIndex = new Map<string, any[]>();
  regIdIndex = new Map<string, any[]>();

  for (let i = 0; i < allRecords.length; i++) {
    const r = allRecords[i];
    if (!r) continue;

    const rPhone = r.__phone !== undefined ? r.__phone : (r.__phone = extractPhone(r));
    if (rPhone && rPhone.length >= 7) {
      let list = phoneIndex.get(rPhone);
      if (!list) {
        list = [];
        phoneIndex.set(rPhone, list);
      }
      list.push(r);
    }

    const rName = r.__name !== undefined ? r.__name : (r.__name = extractName(r));
    const rCleanName = r.__cleanName !== undefined ? r.__cleanName : (r.__cleanName = cleanPatientName(rName));
    if (rCleanName && rCleanName.length >= 3) {
      let list = nameIndex.get(rCleanName);
      if (!list) {
        list = [];
        nameIndex.set(rCleanName, list);
      }
      list.push(r);
    }

    const rDocId = r.__docId !== undefined ? r.__docId : (r.__docId = extractDocId(r));
    if (rDocId) {
      let list = docIdIndex.get(rDocId);
      if (!list) {
        list = [];
        docIdIndex.set(rDocId, list);
      }
      list.push(r);
    }

    const rReg = r.__regId !== undefined ? r.__regId : (r.__regId = extractRegId(r));
    if (rReg && rReg.length >= 2) {
      let list = regIdIndex.get(rReg);
      if (!list) {
        list = [];
        regIdIndex.set(rReg, list);
      }
      list.push(r);
    }
  }

  return { phoneIndex, nameIndex, docIdIndex, regIdIndex };
}

/**
 * Detects whether an appointment or patient record originated from the Patient App.
 */
export function isAppAppointment(appointment: any): boolean {
  if (!appointment) return false;
  if (
    appointment.isAppBooking === true ||
    appointment.isApp === true ||
    appointment.raw?.isAppBooking === true ||
    appointment.raw?.isApp === true
  ) {
    return true;
  }

  const src = String(
    appointment.source ||
    appointment.raw?.source ||
    appointment.bookingSource ||
    appointment.raw?.bookingSource ||
    appointment.channel ||
    appointment.raw?.channel ||
    appointment.bookingChannel ||
    appointment.raw?.bookingChannel ||
    ''
  ).toLowerCase().trim();

  const type = String(
    appointment._type ||
    appointment.raw?._type ||
    appointment.type ||
    appointment.raw?.type ||
    appointment.bookingType ||
    appointment.raw?.bookingType ||
    ''
  ).toLowerCase().trim();

  if (
    src === 'userapp' ||
    src === 'patient app' ||
    src === 'patientapp' ||
    src === 'patient' ||
    src === 'app' ||
    src === 'mobile app' ||
    src === 'online' ||
    src.includes('userapp') ||
    src.includes('patient app')
  ) {
    return true;
  }

  if (type === 'online' || type === 'userapp') {
    return true;
  }

  const patId = appointment.patientId || appointment.raw?.patientId;
  if (patId && typeof patId === 'string' && patId.length >= 20 && !patId.startsWith('staff_') && !patId.startsWith('rec_') && !patId.startsWith('doc_')) {
    if (src !== 'walk-in' && src !== 'walkin' && src !== 'reception' && src !== 'desk' && src !== 'manual') {
      return true;
    }
  }

  return false;
}

/**
 * Determines whether a patient is NEW, IN_DUR (In-Duration), REVISIT, or PKG (Package Member).
 * Checks strictly across all collections:
 * - If phone number, patient ID, or patient name matches any active package -> PKG
 * - If phone number, patient ID, or patient name matches any active duration -> IN_DUR
 * - If phone number, patient ID, or patient name matches ANY prior record in any collection -> REVISIT
 * - ONLY if patient has NO matches anywhere -> NEW
 */
export function getPatientVisitState(
  appointment: any,
  allRecords: any[] = [],
  packageMembers: any[] = []
): PatientVisitState {
  if (!appointment) {
    return {
      type: 'NEW',
      label: 'New Patient',
      badgeText: '✦ NEW',
      badgeBg: '#eff6ff',
      badgeColor: '#1d4ed8',
      badgeBorder: '#93c5fd',
      isCoveredZeroFee: false,
      tooltip: 'First-time Patient Visit',
      isApp: false
    };
  }

  const isAppFlag = isAppAppointment(appointment) ? 'app' : 'std';
  const appCleanName = cleanPatientName(extractName(appointment));
  const appPhone = extractPhone(appointment);
  const cacheKey = `${appointment.id || (appointment as any).docId || ''}_${appCleanName}_${appPhone}_${appointment.updatedAt || appointment.appointmentDate || ''}_${appointment.status || ''}_${appointment.paymentStatus || ''}_${isAppFlag}`;
  if (visitStateResultCache.has(cacheKey)) {
    return visitStateResultCache.get(cacheKey)!;
  }

  // Prevent memory growth
  if (visitStateResultCache.size > 2000) {
    visitStateResultCache.clear();
  }

  const result = calculatePatientVisitState(appointment, allRecords, packageMembers);
  visitStateResultCache.set(cacheKey, result);
  return result;
}

function calculatePatientVisitState(
  appointment: any,
  allRecords: any[] = [],
  packageMembers: any[] = []
): PatientVisitState {
  const isApp = isAppAppointment(appointment);
  const appBadge = isApp ? 'APP' : undefined;
  const appPhone = extractPhone(appointment);
  const appPatientDocId = extractDocId(appointment);
  const appPatientName = extractName(appointment);
  const appCleanName = cleanPatientName(appPatientName);
  const appRegId = extractRegId(appointment);
  const currentAppDate = (appointment.appointmentDate || appointment.date) ? parseSafeDate(appointment.appointmentDate || appointment.date).getTime() : Date.now();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();

  // 1. Check if patient has an active package (direct flags)
  if (appointment.isPackageMember || appointment.hasActivePackage || appointment.hasPackage) {
    return {
      type: 'PKG',
      label: 'Package Member',
      badgeText: '★ PKG',
      badgeBg: '#fef3c7',
      badgeColor: '#b45309',
      badgeBorder: '#fde68a',
      durationLabel: appointment.packageDuration || 'Package',
      isCoveredZeroFee: true,
      tooltip: `Active Package Member (${appointment.packageDuration || 'Package'})`,
      isApp,
      appBadgeText: appBadge
    };
  }

  // Check against package_members collection
  if (packageMembers && packageMembers.length > 0) {
    const matchedPkg = packageMembers.find(p => isSamePatientProfile(appointment, p));

    if (matchedPkg) {
      const expTime = matchedPkg.expiryDate ? parseSafeDate(matchedPkg.expiryDate).getTime() : Infinity;
      if (isNaN(expTime) || expTime >= Date.now()) {
        return {
          type: 'PKG',
          label: 'Package Member',
          badgeText: '★ PKG',
          badgeBg: '#fef3c7',
          badgeColor: '#b45309',
          badgeBorder: '#fde68a',
          expiryDate: matchedPkg.expiryDate,
          durationLabel: matchedPkg.duration || 'Package',
          isCoveredZeroFee: true,
          tooltip: `Active Package Member (Valid until ${matchedPkg.expiryDate ? new Date(matchedPkg.expiryDate).toLocaleDateString('en-GB') : 'Active'})`,
          isApp,
          appBadgeText: appBadge
        };
      }
    }
  }

  // 2. Explicit New Patient check (e.g. booked as new patient or "Create New Patient" profile)
  if (appointment.isNewPatient === true || appointment.patientType === 'new') {
    return {
      type: 'NEW',
      label: 'New Patient',
      badgeText: '✦ NEW',
      badgeBg: '#eff6ff',
      badgeColor: '#1d4ed8',
      badgeBorder: '#93c5fd',
      isCoveredZeroFee: false,
      tooltip: 'First-time New Patient (Newly Created Profile)',
      isApp,
      appBadgeText: appBadge
    };
  }

  // 3. Check if current appointment record itself carries an active duration window
  const curDur = appointment.medicineDuration || appointment.duration || appointment.followUpInterval || appointment.interval;
  const curExpDateStr = appointment.durationExpiryDate || appointment.medicineDurationExpiryDate || appointment.medicationDurationEnd || appointment.preferredFollowUpDate || appointment.followUpDate || appointment.preferredDate || appointment.nextFollowUpDate || appointment.preferredFollowupDate || appointment.followupDate || appointment.prefDate || appointment.followup_date || appointment.next_followup_date || appointment.scheduledDate;
  const curStart = appointment.durationStartDate || appointment.medicationDurationStart || appointment.appointmentDate || appointment.date || appointment.createdAt || appointment.prescriptionDate;

  if ((curExpDateStr || (curDur && curDur !== 'No Follow-up' && curDur !== 'None')) && (curExpDateStr || curStart)) {
    const curExpiry = curExpDateStr
      ? parseSafeDate(curExpDateStr)
      : calculateDurationExpiry(curStart, curDur);

    const isCurValid = !isNaN(curExpiry.getTime()) && curExpiry.getTime() > 0;
    // An In-Duration follow-up is ONLY active if the expiry date has NOT passed today AND has not passed the appointment date
    const isUnexpired = isCurValid && curExpiry.getTime() >= todayMs && curExpiry.getTime() >= currentAppDate;

    if (isUnexpired) {
      const daysLeft = Math.max(0, Math.ceil((curExpiry.getTime() - Math.max(todayMs, currentAppDate)) / (1000 * 60 * 60 * 24)));
      const durLabel = curDur || 'Active Duration';
      return {
        type: 'IN_DUR',
        label: 'In-Duration Follow-up',
        badgeText: '⏱ IN-DUR',
        badgeBg: '#fef2f2',
        badgeColor: '#dc2626',
        badgeBorder: '#fecaca',
        expiryDate: curExpiry.toISOString(),
        durationLabel: durLabel,
        daysRemaining: daysLeft,
        isCoveredZeroFee: true,
        tooltip: `In-Duration (${durLabel} • Valid until ${curExpiry.toLocaleDateString('en-GB')})`,
        isApp,
        appBadgeText: appBadge
      };
    }
  }

  // 4. Match against all records across collections (appointments, allpatients, patients, prescriptions, followups, consultations, etc.)
  const candidateSet = new Set<any>();
  if (allRecords && allRecords.length > 0) {
    const { phoneIndex: pIdx, nameIndex: nIdx, docIdIndex: dIdx, regIdIndex: rIdx } = getOrBuildIndex(allRecords);

    // 1. Direct phone match - O(1)
    if (appPhone && appPhone.length >= 7) {
      const byPhone = pIdx.get(appPhone);
      if (byPhone) {
        for (const item of byPhone) candidateSet.add(item);
      }
    }

    // 2. Direct document ID match - O(1)
    if (appPatientDocId) {
      const byDocId = dIdx.get(appPatientDocId);
      if (byDocId) {
        for (const item of byDocId) candidateSet.add(item);
      }
    }

    if (appointment.id) {
      const byAppId = dIdx.get(appointment.id);
      if (byAppId) {
        for (const item of byAppId) candidateSet.add(item);
      }
    }

    // 3. Direct registration ID match - O(1)
    if (appRegId && appRegId.length >= 2) {
      const byReg = rIdx.get(appRegId);
      if (byReg) {
        for (const item of byReg) candidateSet.add(item);
      }
    }

    // 4. Direct exact clean name match - O(1)
    if (appCleanName && appCleanName.length >= 3) {
      const byName = nIdx.get(appCleanName);
      if (byName) {
        for (const item of byName) candidateSet.add(item);
      }
    }

    // 5. Fallback substring match ONLY if no match found yet and name is long (>= 6 chars)
    if (candidateSet.size === 0 && appCleanName && appCleanName.length >= 6) {
      let count = 0;
      for (const [kName, list] of nIdx.entries()) {
        if (kName.length >= 6 && (kName.includes(appCleanName) || appCleanName.includes(kName))) {
          for (const item of list) candidateSet.add(item);
          count++;
          if (count >= 3) break;
        }
      }
    }
  }

  const matchingRecords = Array.from(candidateSet).filter(r => {
    if (!r) return false;

    // 1. Exclude if it is the exact same document or appointment ID in ANY collection (appointments, allpatients, patients)
    const isSameId =
      (r.id && appointment.id && r.id === appointment.id) ||
      (r.appointmentId && appointment.id && r.appointmentId === appointment.id) ||
      (r.id && appointment.appointmentId && r.id === appointment.appointmentId) ||
      (r.appointmentId && appointment.appointmentId && r.appointmentId === appointment.appointmentId);
    if (isSameId) return false;

    // 2. Exclude if it's the exact same booking created simultaneously (multi-collection mirrored doc in allpatients/patients)
    if (
      r.createdAt && appointment.createdAt &&
      r.createdAt === appointment.createdAt &&
      extractPhone(r) === extractPhone(appointment)
    ) {
      return false;
    }

    // 3. Exclude if appointmentDate, timeSlot, and phone are identical (same booking across collections)
    const rDate = r.appointmentDate || r.date;
    const appDate = appointment.appointmentDate || appointment.date;
    const rTime = r.appointmentTime || r.timeSlot || r.time;
    const appTime = appointment.appointmentTime || appointment.timeSlot || appointment.time;
    if (
      rDate && appDate && rDate === appDate &&
      rTime && appTime && rTime === appTime &&
      extractPhone(r) && extractPhone(appointment) &&
      extractPhone(r) === extractPhone(appointment)
    ) {
      return false;
    }

    return isSamePatientProfile(appointment, r);
  });

  if (matchingRecords.length > 0) {
    // Check if any matching prior record is an active package member
    const pkgMatch = matchingRecords.find(r => r.isPackageMember || r.hasActivePackage || r.hasPackage);
    if (pkgMatch) {
      return {
        type: 'PKG',
        label: 'Package Member',
        badgeText: '★ PKG',
        badgeBg: '#fef3c7',
        badgeColor: '#b45309',
        badgeBorder: '#fde68a',
        durationLabel: pkgMatch.packageDuration || 'Package',
        isCoveredZeroFee: true,
        tooltip: `Active Package Member (${pkgMatch.packageDuration || 'Package'})`,
        isApp,
        appBadgeText: appBadge
      };
    }

    // Sort matching records descending by date to find the most recent
    matchingRecords.sort((a, b) => {
      const timeA = parseSafeDate(a.paymentCollectedAt || a.completedAt || a.durationStartDate || a.appointmentDate || a.date || a.createdAt).getTime();
      const timeB = parseSafeDate(b.paymentCollectedAt || b.completedAt || b.durationStartDate || b.appointmentDate || b.date || b.createdAt).getTime();
      return timeB - timeA;
    });

    // Check if the most recent prior record has an active (unexpired) duration
    for (const rec of matchingRecords) {
      const recDur = rec.medicineDuration || rec.duration || rec.followUpInterval || rec.interval || rec.packageDuration;
      const recExpDateStr = rec.durationExpiryDate || rec.medicineDurationExpiryDate || rec.medicationDurationEnd || rec.preferredFollowUpDate || rec.followUpDate || rec.preferredDate || rec.nextFollowUpDate || rec.preferredFollowupDate || rec.followupDate || rec.prefDate || rec.followup_date || rec.next_followup_date || rec.scheduledDate;
      const recStart = rec.durationStartDate || rec.medicationDurationStart || rec.paymentCollectedAt || rec.completedAt || rec.appointmentDate || rec.date || rec.createdAt || rec.prescriptionDate;

      if ((recExpDateStr || (recDur && recDur !== 'No Follow-up' && recDur !== 'None')) && (recExpDateStr || recStart)) {
        const recExpiry = recExpDateStr
          ? parseSafeDate(recExpDateStr)
          : calculateDurationExpiry(recStart, recDur);

        const isRecValid = !isNaN(recExpiry.getTime()) && recExpiry.getTime() > 0;
        // An In-Duration follow-up is ONLY active if the expiry date has NOT passed today AND has not passed the appointment date
        const isUnexpired = isRecValid && recExpiry.getTime() >= todayMs && recExpiry.getTime() >= currentAppDate;

        if (isUnexpired) {
          const daysLeft = Math.max(0, Math.ceil((recExpiry.getTime() - Math.max(todayMs, currentAppDate)) / (1000 * 60 * 60 * 24)));
          const durLabel = recDur || 'Active Duration';
          return {
            type: 'IN_DUR',
            label: 'In-Duration Follow-up',
            badgeText: '⏱ IN-DUR',
            badgeBg: '#fef2f2',
            badgeColor: '#dc2626',
            badgeBorder: '#fecaca',
            expiryDate: recExpiry.toISOString(),
            durationLabel: durLabel,
            daysRemaining: daysLeft,
            isCoveredZeroFee: true,
            tooltip: `In-Duration (${durLabel} • Valid until ${recExpiry.toLocaleDateString('en-GB')})`,
            isApp,
            appBadgeText: appBadge
          };
        } else {
          // The newest matching record's duration has expired! Stop scanning older records.
          break;
        }
      }
    }

    // A matching record exists in the system (matched by phone, name, or ID), but duration is expired or was standard visit -> REVISIT
    return {
      type: 'REVISIT',
      label: 'Follow-up Revisit',
      badgeText: '↺ REVISIT',
      badgeBg: '#fff7ed',
      badgeColor: '#c2410c',
      badgeBorder: '#fed7aa',
      isCoveredZeroFee: false,
      tooltip: 'Follow-up Revisit (Matched in Clinic Records)',
      isApp,
      appBadgeText: appBadge
    };
  }

  // 4. Check explicit flags on appointment / patient profile (or if appointment had an expired follow-up date/interval)
  const isOldPatientFlag =
    appointment.isExistingProfile === true ||
    appointment.patientType === 'followup' ||
    appointment.patientType === 'revisit' ||
    appointment.type === 'followup' ||
    appointment.type === 'revisit' ||
    appointment.visitType === 'followup' ||
    appointment.visitType === 'revisit' ||
    appointment.isFollowUp === true ||
    appointment.isRevisit === true ||
    appointment.isNewPatient === false ||
    appointment.source === 'Old Patient' ||
    appointment.marketingSource === 'Old Patient' ||
    appointment.collectionName === 'patients' ||
    (appointment.raw && (
      appointment.raw.isExistingProfile === true ||
      appointment.raw.patientType === 'revisit' ||
      appointment.raw.patientType === 'followup' ||
      appointment.raw.isNewPatient === false ||
      appointment.raw.source === 'Old Patient' ||
      appointment.raw.marketingSource === 'Old Patient' ||
      appointment.raw.collectionName === 'patients' ||
      (Array.isArray(appointment.raw.prescriptionUrls) && appointment.raw.prescriptionUrls.length > 0)
    )) ||
    (Array.isArray(appointment.prescriptionUrls) && appointment.prescriptionUrls.length > 0) ||
    appointment.preferredFollowUpDate ||
    appointment.preferredDate ||
    appointment.followUpDate ||
    appointment.followUpInterval;

  if (isOldPatientFlag) {
    return {
      type: 'REVISIT',
      label: 'Follow-up Revisit',
      badgeText: '↺ REVISIT',
      badgeBg: '#fff7ed',
      badgeColor: '#c2410c',
      badgeBorder: '#fed7aa',
      isCoveredZeroFee: false,
      tooltip: 'Follow-up Revisit (Existing Clinic Patient)',
      isApp,
      appBadgeText: appBadge
    };
  }

  // 5. Check if patient already holds a formal clinic registration number (e.g. SPH..., /pv/, /dsnr, RK/..., 206, etc.)
  const existingReg = extractRegId(appointment);
  const isDocIdSameAsReg = appointment.id && existingReg === String(appointment.id).toLowerCase();
  const isAutoDocId = /^[a-z0-9]{20,32}$/.test(existingReg);
  const hasClinicRegPattern = existingReg && !isDocIdSameAsReg && !isAutoDocId && !existingReg.startsWith('app_') && !existingReg.startsWith('temp_');

  if (hasClinicRegPattern) {
    return {
      type: 'REVISIT',
      label: 'Follow-up Revisit',
      badgeText: '↺ REVISIT',
      badgeBg: '#fff7ed',
      badgeColor: '#c2410c',
      badgeBorder: '#fed7aa',
      isCoveredZeroFee: false,
      tooltip: `Follow-up Revisit (Registered Clinic ID: ${existingReg.toUpperCase()})`,
      isApp,
      appBadgeText: appBadge
    };
  }

  // 6. If this patient does NOT match with any record across any collection -> ONLY THEN is it a NEW Patient
  return {
    type: 'NEW',
    label: 'New Patient',
    badgeText: '✦ NEW',
    badgeBg: '#eff6ff',
    badgeColor: '#1d4ed8',
    badgeBorder: '#93c5fd',
    isCoveredZeroFee: false,
    tooltip: 'First-time New Patient (No matching record in database)',
    isApp,
    appBadgeText: appBadge
  };
}
