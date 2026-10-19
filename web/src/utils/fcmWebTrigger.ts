import { db } from '@app/shared';
import { collection, addDoc, getDocs, query, where, doc, deleteDoc } from 'firebase/firestore';

/**
 * Normalizes branch name to a clean alphanumeric topic string
 */
export function normalizeBranchTopic(branch: string): string {
  if (!branch) return '';
  return String(branch)
    .toLowerCase()
    .replace(/branch/gi, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * 10-Day Rolling Cleanup Policy (Web-side)
 * Queries and deletes any notifications in Firestore older than 10 days
 */
export async function cleanupOldNotifications(): Promise<void> {
  if (!db) return;
  try {
    const tenDaysAgoISO = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const q = query(collection(db, 'notifications'), where('createdAt', '<', tenDaysAgoISO));
    const snapshot = await getDocs(q);

    if (!snapshot.empty) {
      const deletePromises = snapshot.docs.map((docSnap) => deleteDoc(doc(db, 'notifications', docSnap.id)));
      await Promise.all(deletePromises);
      console.log(`[FCM-Web] Cleaned up ${snapshot.size} expired notification(s) older than 10 days.`);
    }
  } catch (err) {
    console.warn('[FCM-Web] 10-day notification cleanup notice:', err);
  }
}

export async function dispatchPushNotificationToTargetRoles(payload: {
  title: string;
  body: string;
  targetRoles: string[];
  targetBranch?: string;
  data?: Record<string, any>;
}): Promise<void> {
  if (!db) return;
  try {
    const snap = await getDocs(collection(db, 'fcm_tokens'));
    if (snap.empty) return;

    const targetBranchClean = normalizeBranchTopic(payload.targetBranch || '');
    const tokens: string[] = [];

    snap.forEach((d) => {
      const data = d.data();
      if (!data || !data.token) return;

      const role = String(data.role || '').toLowerCase();
      const dept = String(data.department || data.dept || '').toLowerCase();
      const branchClean = normalizeBranchTopic(data.branch || data.cleanBranch || '');

      const isHR = role === 'admin' || role === 'hr' || role.includes('admin') || role.includes('hr') || dept.includes('hr') || dept.includes('admin');
      const isTargetReception = (role === 'reception' || role.includes('reception')) && (!targetBranchClean || branchClean === targetBranchClean);

      let shouldSend = false;
      if (payload.targetRoles.includes('hr') && isHR) shouldSend = true;
      if (payload.targetRoles.includes('admin') && (role === 'admin' || role.includes('admin') || dept.includes('admin'))) shouldSend = true;
      if (payload.targetRoles.includes('reception') && isTargetReception) shouldSend = true;

      // Regular staff NEVER receives booking or payment notifications
      if (shouldSend) {
        if (data.expoPushToken) tokens.push(data.expoPushToken);
        if (data.token) tokens.push(data.token);
      }
    });

    if (tokens.length === 0) return;

    const uniqueTokens = Array.from(new Set(tokens));
    const expoTokens = uniqueTokens.filter((t) => t.startsWith('ExponentPushToken[') || t.startsWith('ExpoPushToken['));

    if (expoTokens.length > 0) {
      const messages = expoTokens.map((token) => ({
        to: token,
        sound: 'default',
        title: payload.title,
        body: payload.body,
        channelId: 'sph_appointments_channel',
        priority: 'high',
        data: payload.data || {},
      }));

      for (let i = 0; i < messages.length; i += 100) {
        const chunk = messages.slice(i, i + 100);
        await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Accept-encoding': 'gzip, deflate',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(chunk),
        }).catch((e) => console.warn('[FCM-Web] Push send notice:', e));
      }
    }
  } catch (err) {
    console.warn('[FCM-Web] Push dispatch notice:', err);
  }
}

/**
 * Creates an appointment booking notification document in Firestore 'notifications'
 * which triggers the Cloud Function to send FCM push notifications to Mobile devices.
 */
export async function createBookingNotificationInFirestore(payload: {
  patientName: string;
  appointmentTime: string;
  appointmentDate: string;
  branch: string;
  doctorName?: string;
  consultationMode?: string;
}): Promise<void> {
  if (!db) return;
  try {
    const cleanBranch = normalizeBranchTopic(payload.branch);
    const timeDisplay = payload.appointmentTime || '';
    const dateDisplay = payload.appointmentDate || '';
    const patientDisplay = payload.patientName || 'Patient';
    const branchDisplay = payload.branch || 'Branch';
    const notiDoc = {
      type: 'booking',
      title: 'Appointment Booked',
      body: `Appointment has been booked for ${patientDisplay} at ${timeDisplay} (${branchDisplay})`,
      patientName: patientDisplay,
      appointmentTime: timeDisplay,
      appointmentDate: dateDisplay,
      branch: branchDisplay,
      targetBranch: cleanBranch,
      doctorName: payload.doctorName || '',
      consultationMode: payload.consultationMode || 'In-Clinic',
      targetRoles: ['reception', 'hr', 'admin'],
      createdAt: new Date().toISOString(),
      status: 'pending',
    };

    await addDoc(collection(db, 'notifications'), notiDoc);
    dispatchPushNotificationToTargetRoles({
      title: notiDoc.title,
      body: notiDoc.body,
      targetRoles: ['reception', 'hr', 'admin'],
      targetBranch: cleanBranch,
      data: notiDoc,
    }).catch(() => { });

    // Non-blocking 10-day rolling cleanup
    cleanupOldNotifications().catch(() => {});
  } catch (e) {
    console.warn('[FCM-Web] Error saving notification to Firestore:', e);
  }
}

/**
 * Creates a payment completion notification in Firestore 'notifications'
 * Notifies HR / Admin across all branches, and notifies the specific Branch Reception
 */
export async function createPaymentNotificationInFirestore(payload: {
  patientName: string;
  amount: number | string;
  branch: string;
  paymentMode?: string;
  doctorName?: string;
  invoiceId?: string;
}): Promise<void> {
  if (!db) return;
  try {
    const cleanBranch = normalizeBranchTopic(payload.branch);
    const patientDisplay = payload.patientName || 'Patient';
    const branchDisplay = payload.branch || 'Branch';
    const numAmount = Number(payload.amount || 0);
    const amountDisplay = numAmount.toLocaleString('en-IN');
    const modeDisplay = payload.paymentMode || 'Cash';

    const notiDoc = {
      type: 'payment',
      title: 'Payment Received',
      body: `Payment of ₹${amountDisplay} received from ${patientDisplay} at ${branchDisplay} (${modeDisplay})`,
      patientName: patientDisplay,
      amount: numAmount,
      paymentMode: modeDisplay,
      branch: branchDisplay,
      targetBranch: cleanBranch,
      doctorName: payload.doctorName || '',
      invoiceId: payload.invoiceId || '',
      targetRoles: ['reception', 'hr', 'admin'],
      createdAt: new Date().toISOString(),
      status: 'completed',
    };

    await addDoc(collection(db, 'notifications'), notiDoc);
    dispatchPushNotificationToTargetRoles({
      title: notiDoc.title,
      body: notiDoc.body,
      targetRoles: ['reception', 'hr', 'admin'],
      targetBranch: cleanBranch,
      data: notiDoc,
    }).catch(() => { });
    cleanupOldNotifications().catch(() => {});
  } catch (e) {
    console.warn('[FCM-Web] Error saving payment notification to Firestore:', e);
  }
}

/**
 * Notifies HR when a staff member logs in
 */
export async function createStaffLoginNotificationInFirestore(payload: {
  staffName: string;
  branch: string;
  staffId?: string;
}): Promise<void> {
  if (!db) return;
  try {
    const cleanBranch = normalizeBranchTopic(payload.branch);
    const staffDisplay = payload.staffName || 'Staff Member';
    const branchDisplay = payload.branch || 'Clinic Branch';
    const timeDisplay = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

    const notiDoc = {
      type: 'staff_login',
      title: 'Staff Logged In',
      body: `${staffDisplay} logged in at ${branchDisplay} (${timeDisplay})`,
      staffName: staffDisplay,
      staffId: payload.staffId || '',
      branch: branchDisplay,
      targetBranch: cleanBranch,
      loginTime: timeDisplay,
      targetRoles: ['hr', 'admin'],
      createdAt: new Date().toISOString(),
      status: 'active',
    };
    await addDoc(collection(db, 'notifications'), notiDoc);
    dispatchPushNotificationToTargetRoles({
      title: notiDoc.title,
      body: notiDoc.body,
      targetRoles: ['hr', 'admin'],
      data: notiDoc,
    }).catch(() => {});
    cleanupOldNotifications().catch(() => {});
  } catch (e) {
    console.warn('[FCM-Web] Error saving staff login notification:', e);
  }
}

/**
 * Notifies HR when a staff member logs out
 */
export async function createStaffLogoutNotificationInFirestore(payload: {
  staffName: string;
  branch: string;
  staffId?: string;
}): Promise<void> {
  if (!db) return;
  try {
    const cleanBranch = normalizeBranchTopic(payload.branch);
    const staffDisplay = payload.staffName || 'Staff Member';
    const branchDisplay = payload.branch || 'Clinic Branch';
    const timeDisplay = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

    const notiDoc = {
      type: 'staff_logout',
      title: 'Staff Logged Out',
      body: `${staffDisplay} logged out from ${branchDisplay} (${timeDisplay})`,
      staffName: staffDisplay,
      staffId: payload.staffId || '',
      branch: branchDisplay,
      targetBranch: cleanBranch,
      logoutTime: timeDisplay,
      targetRoles: ['hr', 'admin'],
      createdAt: new Date().toISOString(),
      status: 'completed',
    };
    await addDoc(collection(db, 'notifications'), notiDoc);
    dispatchPushNotificationToTargetRoles({
      title: notiDoc.title,
      body: notiDoc.body,
      targetRoles: ['hr', 'admin'],
      data: notiDoc,
    }).catch(() => {});
    cleanupOldNotifications().catch(() => {});
  } catch (e) {
    console.warn('[FCM-Web] Error saving staff logout notification:', e);
  }
}

/**
 * Notifies HR when a staff member punches in
 */
export async function createStaffPunchInNotificationInFirestore(payload: {
  staffName: string;
  branch: string;
  staffId?: string;
  punchInTime?: string;
  locationAddress?: string;
}): Promise<void> {
  if (!db) return;
  try {
    const cleanBranch = normalizeBranchTopic(payload.branch);
    const staffDisplay = payload.staffName || 'Staff Member';
    const branchDisplay = payload.branch || 'Clinic Branch';
    const timeDisplay = payload.punchInTime || new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

    const notiDoc = {
      type: 'staff_punch_in',
      title: '🟢 Staff Punched In',
      body: `${staffDisplay} punched in at ${branchDisplay} (${timeDisplay})`,
      staffName: staffDisplay,
      staffId: payload.staffId || '',
      branch: branchDisplay,
      targetBranch: cleanBranch,
      punchInTime: timeDisplay,
      locationAddress: payload.locationAddress || '',
      targetRoles: ['hr', 'admin'],
      createdAt: new Date().toISOString(),
      status: 'active',
    };
    await addDoc(collection(db, 'notifications'), notiDoc);
    dispatchPushNotificationToTargetRoles({
      title: notiDoc.title,
      body: notiDoc.body,
      targetRoles: ['hr', 'admin'],
      data: notiDoc,
    }).catch(() => {});
    cleanupOldNotifications().catch(() => {});
  } catch (e) {
    console.warn('[FCM-Web] Error saving staff punch in notification:', e);
  }
}

/**
 * Notifies HR when a staff member punches out
 */
export async function createStaffPunchOutNotificationInFirestore(payload: {
  staffName: string;
  branch: string;
  staffId?: string;
  punchOutTime?: string;
  workingHours?: string;
  locationAddress?: string;
}): Promise<void> {
  if (!db) return;
  try {
    const cleanBranch = normalizeBranchTopic(payload.branch);
    const staffDisplay = payload.staffName || 'Staff Member';
    const branchDisplay = payload.branch || 'Clinic Branch';
    const timeDisplay = payload.punchOutTime || new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    const durationText = payload.workingHours ? ` • Worked: ${payload.workingHours}` : '';

    const notiDoc = {
      type: 'staff_punch_out',
      title: '🔴 Staff Punched Out',
      body: `${staffDisplay} punched out from ${branchDisplay} (${timeDisplay})${durationText}`,
      staffName: staffDisplay,
      staffId: payload.staffId || '',
      branch: branchDisplay,
      targetBranch: cleanBranch,
      punchOutTime: timeDisplay,
      workingHours: payload.workingHours || '',
      locationAddress: payload.locationAddress || '',
      targetRoles: ['hr', 'admin'],
      createdAt: new Date().toISOString(),
      status: 'completed',
    };
    await addDoc(collection(db, 'notifications'), notiDoc);
    dispatchPushNotificationToTargetRoles({
      title: notiDoc.title,
      body: notiDoc.body,
      targetRoles: ['hr', 'admin'],
      data: notiDoc,
    }).catch(() => {});
    cleanupOldNotifications().catch(() => {});
  } catch (e) {
    console.warn('[FCM-Web] Error saving staff punch out notification:', e);
  }
}

/**
 * Notifies Staff and HR when a daily work report is submitted
 */
export async function createStaffDailyReportNotificationInFirestore(payload: {
  staffName: string;
  branch: string;
  staffId?: string;
  totalCalls?: number | string;
  followUps?: number | string;
  contacts?: number | string;
  gReviews?: number | string;
  videoReviews?: number | string;
  notes?: string;
}): Promise<void> {
  if (!db) return;
  try {
    const cleanBranch = normalizeBranchTopic(payload.branch);
    const staffDisplay = payload.staffName || 'Staff Member';
    const branchDisplay = payload.branch || 'Clinic Branch';
    const timeDisplay = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

    const callsInfo = payload.totalCalls ? ` • ${payload.totalCalls} Calls` : '';
    const followUpsInfo = payload.followUps ? `, ${payload.followUps} Follow-ups` : '';
    const contactsInfo = payload.contacts ? `, ${payload.contacts} Contacts` : '';
    const gReviewsInfo = payload.gReviews ? `, ${payload.gReviews} G-Reviews` : '';
    const videoReviewsInfo = payload.videoReviews ? `, ${payload.videoReviews} Video Reviews` : '';
    const notesSummary = payload.notes ? ` • Note: ${payload.notes.substring(0, 40)}${payload.notes.length > 40 ? '...' : ''}` : '';

    const notiDoc = {
      type: 'staff_report',
      title: 'Daily Report Submitted',
      body: `${staffDisplay} submitted Daily Report for ${branchDisplay} (${timeDisplay}${callsInfo}${followUpsInfo}${contactsInfo}${gReviewsInfo}${videoReviewsInfo})${notesSummary}`,
      staffName: staffDisplay,
      staffId: payload.staffId || '',
      branch: branchDisplay,
      targetBranch: cleanBranch,
      totalCalls: payload.totalCalls || 0,
      followUps: payload.followUps || 0,
      contacts: payload.contacts || 0,
      gReviews: payload.gReviews || 0,
      videoReviews: payload.videoReviews || 0,
      notes: payload.notes || '',
      targetRoles: ['hr', 'admin', 'staff'],
      createdAt: new Date().toISOString(),
      status: 'submitted',
    };
    await addDoc(collection(db, 'notifications'), notiDoc);
    dispatchPushNotificationToTargetRoles({
      title: notiDoc.title,
      body: notiDoc.body,
      targetRoles: ['hr', 'admin'],
      data: notiDoc,
    }).catch(() => {});
    cleanupOldNotifications().catch(() => {});
  } catch (e) {
    console.warn('[FCM-Web] Error saving staff report notification:', e);
  }
}

/**
 * Notifies HR and Admin when a staff member submits a leave application
 */
export async function createStaffLeaveRequestNotificationInFirestore(payload: {
  staffName: string;
  branch: string;
  staffId?: string;
  leaveType: string;
  fromDate: string;
  toDate: string;
  daysCount?: number | string;
  reason?: string;
}): Promise<void> {
  if (!db) return;
  try {
    const cleanBranch = normalizeBranchTopic(payload.branch);
    const staffDisplay = payload.staffName || 'Staff Member';
    const branchDisplay = payload.branch || 'Clinic Branch';
    const days = payload.daysCount || 1;
    const leaveType = payload.leaveType || 'Leave';
    const dates = payload.fromDate === payload.toDate ? payload.fromDate : `${payload.fromDate} to ${payload.toDate}`;

    const notiDoc = {
      type: 'staff_leave_request',
      title: '📝 Staff Leave Application',
      body: `${staffDisplay} (${branchDisplay}) applied for ${days} day(s) ${leaveType} (${dates})${payload.reason ? `: "${payload.reason}"` : ''}`,
      staffName: staffDisplay,
      staffId: payload.staffId || '',
      branch: branchDisplay,
      targetBranch: cleanBranch,
      leaveType,
      fromDate: payload.fromDate,
      toDate: payload.toDate,
      daysCount: days,
      reason: payload.reason || '',
      targetRoles: ['hr', 'admin'],
      createdAt: new Date().toISOString(),
      status: 'pending',
    };
    await addDoc(collection(db, 'notifications'), notiDoc);
    dispatchPushNotificationToTargetRoles({
      title: notiDoc.title,
      body: notiDoc.body,
      targetRoles: ['hr', 'admin'],
      data: notiDoc,
    }).catch(() => {});
    cleanupOldNotifications().catch(() => {});
  } catch (e) {
    console.warn('[FCM-Web] Error saving staff leave request notification:', e);
  }
}

/**
 * Notifies HR and Admin when a Reception desk requests a medicine discount approval
 */
export async function createFeeDiscountRequestNotificationInFirestore(payload: {
  patientName: string;
  branch: string;
  requestedDiscount: number | string;
  originalTotalAmount: number | string;
  reason: string;
  appointmentId?: string;
  patientPhone?: string;
}): Promise<void> {
  if (!db) return;
  try {
    const cleanBranch = normalizeBranchTopic(payload.branch);
    const patientDisplay = payload.patientName || 'Patient';
    const branchDisplay = payload.branch || 'Clinic Branch';
    const discountNum = Number(payload.requestedDiscount || 0);
    const totalNum = Number(payload.originalTotalAmount || 0);

    const notiDoc = {
      type: 'fee_discount_request',
      title: 'New Discount Approval Request',
      body: `₹${discountNum.toLocaleString('en-IN')} discount requested for ${patientDisplay} (${branchDisplay}). Reason: "${payload.reason}"`,
      patientName: patientDisplay,
      patientPhone: payload.patientPhone || '',
      branch: branchDisplay,
      targetBranch: cleanBranch,
      requestedDiscount: discountNum,
      originalTotalAmount: totalNum,
      reason: payload.reason,
      appointmentId: payload.appointmentId || '',
      targetRoles: ['hr', 'admin'],
      targetTopic: 'topic_all_branches_hr',
      createdAt: new Date().toISOString(),
      status: 'pending',
    };
    await addDoc(collection(db, 'notifications'), notiDoc);
    dispatchPushNotificationToTargetRoles({
      title: notiDoc.title,
      body: notiDoc.body,
      targetRoles: ['hr', 'admin'],
      data: notiDoc,
    }).catch(() => {});
    cleanupOldNotifications().catch(() => {});
  } catch (e) {
    console.warn('[FCM-Web] Error saving discount request notification:', e);
  }
}

/**
 * Notifies Reception and Admin when HR Approves or Rejects a discount request
 */
export async function createFeeDiscountResponseNotificationInFirestore(payload: {
  patientName: string;
  branch: string;
  status: 'Approved' | 'Rejected';
  discountAmount?: number | string;
  rejectReason?: string;
  reviewedBy?: string;
  appointmentId?: string;
}): Promise<void> {
  if (!db) return;
  try {
    const cleanBranch = normalizeBranchTopic(payload.branch);
    const patientDisplay = payload.patientName || 'Patient';
    const branchDisplay = payload.branch || 'Clinic Branch';
    const isApproved = payload.status === 'Approved';
    const discountNum = Number(payload.discountAmount || 0);

    const notiDoc = {
      type: 'fee_discount_response',
      title: isApproved ? 'Discount Request Approved ✓' : 'Discount Request Rejected ❌',
      body: isApproved
        ? `HR approved ₹${discountNum.toLocaleString('en-IN')} discount for ${patientDisplay} (${branchDisplay})`
        : `HR rejected discount request for ${patientDisplay} (${branchDisplay}). ${payload.rejectReason ? `Note: "${payload.rejectReason}"` : ''}`,
      patientName: patientDisplay,
      branch: branchDisplay,
      targetBranch: cleanBranch,
      discountAmount: discountNum,
      rejectReason: payload.rejectReason || '',
      reviewedBy: payload.reviewedBy || 'HR',
      status: payload.status.toLowerCase(),
      targetRoles: ['reception', 'admin'],
      targetTopic: `topic_branch_${cleanBranch}`,
      appointmentId: payload.appointmentId || '',
      createdAt: new Date().toISOString(),
    };
    await addDoc(collection(db, 'notifications'), notiDoc);
    dispatchPushNotificationToTargetRoles({
      title: notiDoc.title,
      body: notiDoc.body,
      targetRoles: ['reception', 'hr', 'admin'],
      targetBranch: cleanBranch,
      data: notiDoc,
    }).catch(() => {});
    cleanupOldNotifications().catch(() => {});
  } catch (e) {
    console.warn('[FCM-Web] Error saving discount response notification:', e);
  }
}

/**
 * Notifies HR / Admin when a branch uploads clinic cleaning photos
 */
export async function createCleaningUploadedNotificationInFirestore(payload: {
  branch: string;
  photoCount: number;
  submittedBy?: string;
}): Promise<void> {
  if (!db) return;
  try {
    const cleanBranch = normalizeBranchTopic(payload.branch);
    const branchDisplay = payload.branch || 'Branch';
    const photoCount = payload.photoCount || 5;
    const title = `${branchDisplay} Cleaning Photos Uploaded 📸`;
    const body = `${photoCount} clinic cleaning photos uploaded from ${branchDisplay} for HR inspection.`;

    const notiDoc = {
      type: 'cleaning_submission',
      title,
      body,
      branch: branchDisplay,
      targetBranch: cleanBranch,
      photoCount,
      submittedBy: payload.submittedBy || `${branchDisplay} Receptionist`,
      targetRoles: ['reception', 'hr', 'admin'],
      createdAt: new Date().toISOString(),
      status: 'pending',
    };
    await addDoc(collection(db, 'notifications'), notiDoc);
    dispatchPushNotificationToTargetRoles({
      title: notiDoc.title,
      body: notiDoc.body,
      targetRoles: ['hr', 'admin', 'reception'],
      targetBranch: cleanBranch,
      data: notiDoc,
    }).catch(() => {});
    cleanupOldNotifications().catch(() => {});
  } catch (e) {
    console.warn('[FCM-Web] Error saving cleaning uploaded notification:', e);
  }
}

/**
 * Notifies Branch Reception and HR/Admin when cleaning is Approved or Rejected
 */
export async function createCleaningApprovalNotificationInFirestore(payload: {
  branch: string;
  status: 'Approved' | 'Rejected';
  rejectReason?: string;
  reviewedBy?: string;
}): Promise<void> {
  if (!db) return;
  try {
    const cleanBranch = normalizeBranchTopic(payload.branch);
    const branchDisplay = payload.branch || 'Branch';
    const isApproved = payload.status === 'Approved';
    const reviewer = payload.reviewedBy || 'HR';

    const title = isApproved
      ? `${branchDisplay} Cleaning Approved ✅`
      : `${branchDisplay} Cleaning Rejected ❌`;

    const body = isApproved
      ? `Clinic cleaning approved by ${reviewer} for ${branchDisplay}. Reception is unlocked.`
      : `Cleaning submission for ${branchDisplay} rejected by ${reviewer}: "${payload.rejectReason || 'Needs re-cleaning'}". Please re-upload photos.`;

    const notiDoc = {
      type: isApproved ? 'cleaning_approved' : 'cleaning_rejected',
      title,
      body,
      branch: branchDisplay,
      targetBranch: cleanBranch,
      status: payload.status.toLowerCase(),
      rejectReason: payload.rejectReason || '',
      reviewedBy: reviewer,
      targetRoles: ['reception', 'hr', 'admin'],
      createdAt: new Date().toISOString(),
    };
    await addDoc(collection(db, 'notifications'), notiDoc);
    dispatchPushNotificationToTargetRoles({
      title: notiDoc.title,
      body: notiDoc.body,
      targetRoles: ['reception', 'hr', 'admin'],
      targetBranch: cleanBranch,
      data: notiDoc,
    }).catch(() => {});
    cleanupOldNotifications().catch(() => {});
  } catch (e) {
    console.warn('[FCM-Web] Error saving cleaning approval notification:', e);
  }
}


