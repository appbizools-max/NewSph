import { Platform, Linking } from 'react-native';
import Constants from 'expo-constants';
import { collection, query, where, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { getStandardBranchName } from './idGenerator';

let ExpoNotifications = null;
try {
  ExpoNotifications = require('expo-notifications');
} catch (e) {
  console.log('[notificationHelper] Failed to load expo-notifications:', e);
}

export const AndroidImportance = ExpoNotifications?.AndroidImportance || {
  UNKNOWN: 0,
  UNSPECIFIED: -1000,
  NONE: 0,
  MIN: 1,
  LOW: 2,
  DEFAULT: 3,
  HIGH: 4,
  MAX: 5,
};
export const AndroidNotificationPriority = ExpoNotifications?.AndroidNotificationPriority || {
  MIN: 'min',
  LOW: 'low',
  DEFAULT: 'default',
  HIGH: 'high',
  MAX: 'max',
};

export const Notifications = ExpoNotifications || {
  setNotificationHandler: () => {},
  getPermissionsAsync: async () => ({ status: 'granted' }),
  requestPermissionsAsync: async () => ({ status: 'granted' }),
  getExpoPushTokenAsync: async () => ({ data: null }),
  scheduleNotificationAsync: async () => {},
  setNotificationChannelAsync: async () => {},
};

try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
} catch (error) {
  console.error('[notificationHelper] Failed to set notification handler:', error);
}

// ─── ANDROID CHANNELS ──────────────────────────────────────────────────────────
async function setupNotificationChannels() {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync('booking_v3', {
      name: 'Appointment Bookings',
      importance: AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#0ea5e9',
    });
    await Notifications.setNotificationChannelAsync('payment_v3', {
      name: 'Payments',
      importance: AndroidImportance.MAX,
      vibrationPattern: [0, 300, 150, 300],
      lightColor: '#10b981',
    });
    await Notifications.setNotificationChannelAsync('reminder_v3', {
      name: 'Appointment Reminders',
      importance: AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#f59e0b',
    });
    await Notifications.setNotificationChannelAsync('diet_v3', {
      name: 'Diet & Nutrition Plan',
      importance: AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#ec4899',
    });
  } catch (e) {
    console.warn('[notificationHelper] Channel setup error:', e);
  }
}

// ─── PERMISSIONS ───────────────────────────────────────────────────────────────
export async function registerForPushNotificationsAsync() {
  if (Platform.OS === 'web') return null;
  try {
    await setupNotificationChannels();

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      console.log('[notificationHelper] Permission not granted');
      try {
        const { Alert } = require('react-native');
        Alert.alert(
          'Notifications Required',
          'Please enable notifications for Spiritual Homeopathy in your system settings to receive reminders and booking updates.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() }
          ]
        );
      } catch (err) { }
      return null;
    }

    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ??
      Constants?.easConfig?.projectId;

    if (!projectId) {
      console.warn('[notificationHelper] Project ID not found in expoConfig');
      return null;
    }

    // Expo SDK 53+ removed remote push notifications from Expo Go
    // We must skip fetching the token if running inside Expo Go to prevent a crash
    if (Constants.appOwnership === 'expo' || Constants.executionEnvironment === 'storeClient') {
      console.log('[notificationHelper] Running in Expo Go, skipping remote push token fetch');
      return null;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    return tokenData.data;
  } catch (error) {
    // If running in Expo Go SDK 53+, this specific error is thrown. We can safely ignore it.
    if (error?.message?.includes('Expo Go')) {
      console.log('[notificationHelper] Running in Expo Go, skipping remote push token fetch.');
      return null;
    }
    console.log('[notificationHelper] Permission/token fetch error:', error?.message || error);
    return null;
  }
}

// ─── INTERNAL FIRE HELPER ──────────────────────────────────────────────────────
async function fire(title, body, channelId = 'booking_v3', data = {}) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: true,
        priority: AndroidNotificationPriority.MAX,
        data,
        ...(Platform.OS === 'android' ? { channelId } : {}),
      },
      trigger: null,
    });
  } catch (e) {
    console.warn('[notificationHelper] fire error:', e);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATIENT APP NOTIFICATIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 1. BOOKING CONFIRMED — fired when patient books appointment via app
 */
export async function scheduleBookingSuccessNotification(doctorName, dateString, timeSlot, patientName = '', patientPhone = '') {
  const body = patientName && patientPhone
    ? `New appointment: ${patientName} (Mobile: ${patientPhone}) on ${dateString} at ${timeSlot}.`
    : `Your consultation with Dr. ${doctorName} is confirmed for ${dateString} at ${timeSlot}.`;

  await fire(
    '🎉 Appointment Booked!',
    body,
    'booking_v3',
    { type: 'booking_confirmed' }
  );
}



/**
 * 3. PAYMENT REQUESTED — fired when receptionist sends fee request to patient
 */
export async function schedulePaymentRequestNotification(doctorName, amount) {
  await fire(
    '💳 Payment Required',
    `₹${amount} consultation fee requested for Dr. ${doctorName}. Open the app to pay now.`,
    'payment_v3',
    { type: 'payment_request' }
  );
}

/**
 * 4. SPLIT PAYMENT REQUESTED — when a split payment is sent to the patient
 */
export async function scheduleSplitPaymentRequestNotification(doctorName, upiAmount, counterAmount, counterMethod) {
  const method = (counterMethod || 'cash').toUpperCase();
  await fire(
    '💳 Split Payment Required',
    `Pay ₹${upiAmount} via UPI for Dr. ${doctorName}. ₹${counterAmount} already paid at counter via ${method}.`,
    'payment_v3',
    { type: 'split_payment_request' }
  );
}

/**
 * 5. PAYMENT SUCCESS — fired after patient pays via Razorpay in the app
 */
export async function schedulePaymentSuccessNotification(doctorName, amount) {
  await fire(
    '✅ Payment Successful!',
    `₹${amount} paid for Dr. ${doctorName}. Reward points added to your wallet! 🎁`,
    'payment_v3',
    { type: 'payment_success' }
  );
}

/**
 * 6. SPLIT PAYMENT SUCCESS — after patient completes the online part of split payment
 */
export async function scheduleSplitPaymentSuccessNotification(doctorName, totalAmount, counterAmount, counterMethod, upiAmount) {
  const method = (counterMethod || 'cash').toUpperCase();
  await fire(
    '✅ Split Payment Complete!',
    `Full payment done for Dr. ${doctorName}: ₹${upiAmount} online + ₹${counterAmount} via ${method} at counter.`,
    'payment_v3',
    { type: 'split_payment_success' }
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STAFF APP NOTIFICATIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 7. WALK-IN BOOKING CONFIRMED — for receptionist after booking a walk-in
 */
export async function scheduleWalkInBookingNotification(patientName, doctorName, dateStr, timeSlot) {
  await fire(
    '📋 Walk-in Booked',
    `${patientName} booked with Dr. ${doctorName} on ${dateStr} at ${timeSlot}.`,
    'booking_v3',
    { type: 'walkin_booking' }
  );
}

/**
 * 8. WALK-IN PAYMENT COLLECTED — for receptionist after confirming walk-in payment
 */
export async function scheduleWalkInPaymentNotification(patientName, amount, method) {
  await fire(
    '💰 Payment Collected',
    `₹${amount} received from ${patientName} via ${(method || 'cash').toUpperCase()}.`,
    'payment_v3',
    { type: 'walkin_payment' }
  );
}

/**
 * 9. CANCEL DIET NOTIFICATIONS — clears all morning and evening diet notifications
 */
export async function cancelDietNotifications() {
  if (Platform.OS === 'web' || !Notifications || Notifications.isFallback) return;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const notif of scheduled) {
      const type = notif.content.data?.type;
      if (type === 'diet_morning' || type === 'diet_evening') {
        await Notifications.cancelScheduledNotificationAsync(notif.identifier);
      }
    }
  } catch (err) {
    console.warn('[notificationHelper] Error cancelling diet notifications:', err);
  }
}

/**
 * 10. SCHEDULE 30-DAY DIET NOTIFICATIONS
 * Schedules daily morning (10 AM) and evening (6 PM) notifications for the remaining days of the cycle
 */
export async function scheduleDietNotifications(nutritionPlan) {
  if (Platform.OS === 'web' || !Notifications || Notifications.isFallback) return;
  if (!nutritionPlan || !nutritionPlan.meals || nutritionPlan.meals.length === 0) return;

  try {
    // 1. Cancel existing diet notifications first to avoid duplication
    await cancelDietNotifications();

    // 2. Parse startDate
    const startDate = nutritionPlan.startDate ? new Date(nutritionPlan.startDate) : new Date();
    startDate.setHours(0, 0, 0, 0);

    const now = new Date();

    // 3. Schedule morning & evening diet notifications for the 30-day schedule
    for (const meal of nutritionPlan.meals) {
      const dayNum = meal.dayNumber; // 1 to 30

      // Today's meals notification at 10:00 AM
      const morningDate = new Date(startDate.getTime());
      morningDate.setDate(startDate.getDate() + (dayNum - 1));
      morningDate.setHours(10, 0, 0, 0);

      if (morningDate > now) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: `🥦 Today's Diet Plan (Day ${dayNum})`,
            body: `🌅 Breakfast: ${meal.breakfast || 'Healthy Breakfast'} | ☀️ Lunch: ${meal.lunch || 'Balanced Lunch'}`,
            sound: true,
            priority: AndroidNotificationPriority.HIGH,
            data: { type: 'diet_morning', dayNumber: dayNum },
            ...(Platform.OS === 'android' ? { channelId: 'diet_v3' } : {}),
          },
          trigger: { type: 'date', date: morningDate },
        });
      }

      // Tomorrow's meals preparation notification at 6:00 PM (18:00) the evening before
      const eveningDate = new Date(startDate.getTime());
      eveningDate.setDate(startDate.getDate() + (dayNum - 2));
      eveningDate.setHours(18, 0, 0, 0);

      if (eveningDate > now) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: `🌙 Tomorrow's Diet Plan (Day ${dayNum})`,
            body: `🍽️ Tomorrow: ${meal.breakfast || 'Healthy Breakfast'} for breakfast and ${meal.lunch || 'Balanced Lunch'} for lunch. Preparation check!`,
            sound: true,
            priority: AndroidNotificationPriority.HIGH,
            data: { type: 'diet_evening', dayNumber: dayNum },
            ...(Platform.OS === 'android' ? { channelId: 'diet_v3' } : {}),
          },
          trigger: { type: 'date', date: eveningDate },
        });
      }
    }
    console.log('[notificationHelper] 30-day diet notifications scheduled successfully for 10:00 AM and 6:00 PM.');
  } catch (error) {
    console.error('[notificationHelper] Error scheduling diet notifications:', error);
  }
}

/**
 * CANCEL PILL REMINDERS — clears all afternoon and evening pill notifications
 */
export async function cancelPillReminders() {
  if (Platform.OS === 'web' || !Notifications || Notifications.isFallback) return;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const notif of scheduled) {
      const type = notif.content.data?.type;
      if (type === 'pill_afternoon' || type === 'pill_evening') {
        await Notifications.cancelScheduledNotificationAsync(notif.identifier);
      }
    }
  } catch (err) {
    console.warn('[notificationHelper] Error cancelling pill reminders:', err);
  }
}

/**
 * SCHEDULE PILL REMINDERS (12 Noon & 5 PM Daily until followUpDate ends)
 */
export async function schedulePillReminders(followUpDate) {
  if (Platform.OS === 'web' || !Notifications || Notifications.isFallback) return;
  if (!followUpDate) return;

  try {
    await cancelPillReminders();

    let targetEnd = new Date(followUpDate);
    if (isNaN(targetEnd.getTime())) return;

    const now = new Date();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Limit scheduling to a maximum of 60 days to stay safe with device limits
    const maxDays = 60;
    let dayCount = 0;

    let current = new Date(todayStart.getTime());

    while (current <= targetEnd && dayCount < maxDays) {
      // 1. Afternoon Pill Reminder at 12:00 PM (12 Noon)
      const afternoonDate = new Date(current.getTime());
      afternoonDate.setHours(12, 0, 0, 0);

      if (afternoonDate > now) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: `💊 Afternoon Pill Reminder (12:00 PM)`,
            body: `Time to take your afternoon homeopathic pills! Stay consistent with your treatment.`,
            sound: true,
            priority: AndroidNotificationPriority.HIGH,
            data: { type: 'pill_afternoon' },
            ...(Platform.OS === 'android' ? { channelId: 'reminder_v3' } : {}),
          },
          trigger: { type: 'date', date: afternoonDate },
        });
      }

      // 2. Evening Pill Reminder at 5:00 PM (17:00)
      const eveningDate = new Date(current.getTime());
      eveningDate.setHours(17, 0, 0, 0);

      if (eveningDate > now) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: `💊 Evening Pill Reminder (5:00 PM)`,
            body: `Time to take your evening homeopathic pills! Stay consistent with your treatment.`,
            sound: true,
            priority: AndroidNotificationPriority.HIGH,
            data: { type: 'pill_evening' },
            ...(Platform.OS === 'android' ? { channelId: 'reminder_v3' } : {}),
          },
          trigger: { type: 'date', date: eveningDate },
        });
      }

      // Advance to next day
      current.setDate(current.getDate() + 1);
      dayCount++;
    }
    console.log(`[notificationHelper] Scheduled 12:00 PM and 5:00 PM pill reminders up until ${followUpDate}.`);
  } catch (error) {
    console.error('[notificationHelper] Error scheduling pill reminders:', error);
  }
}

/**
 * 11. LOGIN SUCCESSFUL — fired when user logs in successfully
 */
export async function scheduleLoginSuccessNotification(userName) {
  const name = userName ? ` ${userName}` : '';
  await fire(
    '🔑 Login Successful',
    `Welcome back${name}! You have successfully logged into Spiritual Homeopathy.`,
    'booking_v3',
    { type: 'login_success' }
  );
}

/**
 * 12. SEND REMOTE PUSH NOTIFICATION — sends a remote push notification via Expo Push API
 */
export async function sendRemotePushNotification(expoPushTokenOrTokens, title, body, data = {}) {
  if (!expoPushTokenOrTokens) return;
  const tokens = Array.isArray(expoPushTokenOrTokens)
    ? expoPushTokenOrTokens
    : [expoPushTokenOrTokens];

  const validTokens = tokens.filter(t => t && typeof t === 'string');
  if (validTokens.length === 0) return;

  // Send to each token individually to prevent PUSH_TOO_MANY_EXPERIENCE_IDS errors!
  for (const token of validTokens) {
    try {
      const message = {
        to: token,
        sound: 'default',
        title: title,
        body: body,
        data: data,
        channelId: 'booking_v3',
        priority: 'high',
      };

      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([message]), // Send as an array containing a single message
      });
      const resData = await response.json();
      console.log(`[sendRemotePushNotification] Sent to ${token}:`, JSON.stringify(resData));
    } catch (error) {
      console.error(`[sendRemotePushNotification] Error sending to ${token}:`, error);
    }
  }
}

const normalizeBranchName = (name) => {
  return getStandardBranchName(name).toLowerCase();
};

export async function notifyReceptionistsOfPayment(db, branchName, patientName, amount, doctorName, appointmentId = '') {
  try {
    const qRec = query(
      collection(db, 'users'), 
      where('role', 'in', ['receptionist', 'staff', 'Receptionist', 'Staff', 'RECEPTIONIST', 'STAFF'])
    );
    const snapRec = await getDocs(qRec);
    const targetBranchNorm = normalizeBranchName(branchName);

    snapRec.forEach(async (docSnap) => {
      const receptionist = docSnap.data();
      const repBranchIdNorm = normalizeBranchName(receptionist.branchId);
      const repBranchNameNorm = normalizeBranchName(receptionist.branchName);

      if (repBranchIdNorm === targetBranchNorm || repBranchNameNorm === targetBranchNorm) {
        // Add to Firestore notifications
        await addDoc(collection(db, 'notifications'), {
          userId: receptionist.uid || docSnap.id,
          title: '💳 Payment Received',
          body: `Payment of ₹${amount} received from ${patientName} (Dr. ${doctorName}) for ${branchName || 'Clinic'} Branch.`,
          type: 'payment_received_alert',
          isRead: false,
          createdAt: serverTimestamp(),
          metadata: {
            appointmentId,
            patientName,
            amount,
            doctorName,
            branchName
          }
        });

        // Send native push notification
        const recTokens = [];
        if (receptionist.expoPushToken) recTokens.push(receptionist.expoPushToken);
        if (Array.isArray(receptionist.expoPushTokens)) {
          receptionist.expoPushTokens.forEach(t => {
            if (t && !recTokens.includes(t)) recTokens.push(t);
          });
        }
        if (recTokens.length > 0) {
          await sendRemotePushNotification(
            recTokens,
            '💳 Payment Received',
            `Payment of ₹${amount} received from ${patientName} (Dr. ${doctorName}) for ${branchName || 'Clinic'} Branch.`,
            { appointmentId }
          );
        }
      }
    });
  } catch (err) {
    console.error("Error notifying receptionists of payment:", err);
  }
}
