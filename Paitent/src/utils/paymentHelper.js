/**
 * Helper to check whether a payment request is active and within 24 hours of issuance.
 * Prevents old/stale payment request prompts and banners from lingering indefinitely.
 * 
 * @param {Object} item - Appointment or clinic intake document object
 * @returns {boolean} - true if payment was requested within the last 24 hours
 */
export const isPaymentRequestWithin24Hours = (item) => {
  if (!item) return false;
  if (!item.paymentRequested) return false;
  if (item.paymentStatus && item.paymentStatus !== 'pending') return false;

  const rawTime =
    item.paymentRequestedAt ||
    item.requestedAt ||
    item.paymentUpdatedAt ||
    item.updatedAt ||
    item.createdAt ||
    item.timestamp ||
    item.date ||
    item.appointmentDate;

  if (!rawTime) return false;

  let requestTimeMs = null;

  if (typeof rawTime?.toDate === 'function') {
    requestTimeMs = rawTime.toDate().getTime();
  } else if (typeof rawTime?.seconds === 'number') {
    requestTimeMs = rawTime.seconds * 1000;
  } else if (typeof rawTime?._seconds === 'number') {
    requestTimeMs = rawTime._seconds * 1000;
  } else if (rawTime instanceof Date) {
    requestTimeMs = rawTime.getTime();
  } else if (typeof rawTime === 'number') {
    requestTimeMs = rawTime > 1e11 ? rawTime : rawTime * 1000;
  } else if (typeof rawTime === 'string') {
    if (rawTime.includes('/') || (rawTime.includes('-') && rawTime.split('-')[0].length !== 4)) {
      const sep = rawTime.includes('/') ? '/' : '-';
      const parts = rawTime.split(sep);
      if (parts.length === 3) {
        const d = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const y = parseInt(parts[2], 10);
        const dt = new Date(y, m, d);
        if (item.appointmentTime || item.timeSlot) {
          const timeStr = item.appointmentTime || item.timeSlot;
          const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)?/i);
          if (match) {
            let hours = parseInt(match[1], 10);
            const mins = parseInt(match[2], 10);
            const mer = (match[3] || '').toUpperCase();
            if (mer === 'PM' && hours < 12) hours += 12;
            if (mer === 'AM' && hours === 12) hours = 0;
            dt.setHours(hours, mins, 0, 0);
          }
        }
        requestTimeMs = dt.getTime();
      }
    } else {
      const parsed = Date.parse(rawTime);
      if (!isNaN(parsed)) {
        requestTimeMs = parsed;
      }
    }
  }

  if (!requestTimeMs || isNaN(requestTimeMs)) {
    return false;
  }

  const now = Date.now();
  const diffMs = now - requestTimeMs;
  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

  // Allow up to 10 minutes clock drift, expire after 24 hours
  return diffMs >= -600000 && diffMs <= TWENTY_FOUR_HOURS_MS;
};
