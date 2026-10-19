/**
 * Spiritual Homeopathy Patient App - Leonas WhatsApp Messaging Service
 * Official Meta WABA Solution:
 * WABA Account ID: 2841437129545530
 * WABA Phone Number ID: 1303340612865892
 * Base URL: https://partnersv1.pinbot.ai/v3/1303340612865892/messages
 */

export const LEONAS_CONFIG = {
  WABA_PHONE_NUMBER_ID: '1303340612865892',
  WABA_ACCOUNT_ID: '2841437129545530',
  WABA_API_KEY: '2731e63f-a853-11f1-afb3-02c8a5e042bd',
  BASE_URL: 'https://partnersv1.pinbot.ai/v3/1303340612865892/messages',
};

export const BRANCH_VISIT_URLS = {
  chanda: 'https://stiny.in/SPHMEO/chanda',     // Chandanagar
  kphb: 'https://stiny.in/SPHMEO/kphb',         // KPHB
  dilshu: 'https://stiny.in/SPHMEO/dilshu',     // Dilsukhnagar
  nallag: 'https://stiny.in/SPHMEO/nallag',     // Nallagandla
};

export const BRANCH_GOOGLE_REVIEW_URLS = {
  kphb: 'https://stiny.in/SPHOMEO/kphb',
  chandanagar: 'https://g.page/r/CairS0V3apxiEBM/review',
  dilshuknagar: 'https://g.page/r/CU1YDEyXIcwhEBM/review',
  nallagandla: 'https://g.page/r/CUlOWoE7dEjoEBM/review',
};

export const formatPhoneForWhatsApp = (phone) => {
  if (!phone) return '';
  let cleaned = String(phone).replace(/\D/g, '');
  cleaned = cleaned.replace(/^0+/, '');
  if (cleaned.length === 10) return '91' + cleaned;
  if (cleaned.length === 12 && cleaned.startsWith('91')) return cleaned;
  if (cleaned.length > 10) return '91' + cleaned.slice(-10);
  return cleaned;
};

export const getBranchVisitUrl = (branch) => {
  const clean = (branch || '').toLowerCase().trim();
  if (clean.includes('chanda') || clean.includes('lingam')) return BRANCH_VISIT_URLS.chanda;
  if (clean.includes('dilshu') || clean.includes('dilsuk')) return BRANCH_VISIT_URLS.dilshu;
  if (clean.includes('nallag') || clean.includes('nalla')) return BRANCH_VISIT_URLS.nallag;
  return BRANCH_VISIT_URLS.kphb;
};

export const getBranchGoogleReviewUrl = (branch) => {
  const clean = (branch || '').toLowerCase().trim();
  if (clean.includes('chanda') || clean.includes('lingam')) return BRANCH_GOOGLE_REVIEW_URLS.chandanagar;
  if (clean.includes('dilshu') || clean.includes('dilsuk')) return BRANCH_GOOGLE_REVIEW_URLS.dilshuknagar;
  if (clean.includes('nallag') || clean.includes('nalla')) return BRANCH_GOOGLE_REVIEW_URLS.nallagandla;
  return BRANCH_GOOGLE_REVIEW_URLS.kphb;
};

export const sendWhatsAppTemplateMessage = async ({
  to,
  templateName,
  languageCode = 'en',
  bodyParameters = []
}) => {
  try {
    const recipient = formatPhoneForWhatsApp(to);
    if (!recipient || recipient.length < 12) {
      console.warn('[WhatsApp] Invalid phone number:', to);
      return { success: false, error: 'Invalid phone number' };
    }

    const payload = {
      messaging_product: 'whatsapp',
      preview_url: false,
      recipient_type: 'individual',
      to: recipient,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        components: [
          {
            type: 'body',
            parameters: bodyParameters.map((param) => ({
              type: 'text',
              text: String(param)
            }))
          }
        ]
      }
    };

    const res = await fetch(LEONAS_CONFIG.BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: LEONAS_CONFIG.WABA_API_KEY
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    console.log(`[WhatsApp Template ${templateName}] Response:`, data);
    return { success: res.ok, data };
  } catch (err) {
    console.warn(`[WhatsApp Template ${templateName}] Error:`, err);
    return { success: false, error: err.message };
  }
};

export const sendWhatsAppTextMessage = async ({ to, body }) => {
  try {
    const recipient = formatPhoneForWhatsApp(to);
    if (!recipient || recipient.length < 12) {
      return { success: false, error: 'Invalid phone number' };
    }

    const payload = {
      messaging_product: 'whatsapp',
      preview_url: false,
      recipient_type: 'individual',
      to: recipient,
      type: 'text',
      text: { body }
    };

    const res = await fetch(LEONAS_CONFIG.BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: LEONAS_CONFIG.WABA_API_KEY
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    console.log('[WhatsApp Text] Response:', data);
    return { success: res.ok, data };
  } catch (err) {
    console.warn('[WhatsApp Text] Error:', err);
    return { success: false, error: err.message };
  }
};

/**
 * 1. Appointment Booking WhatsApp Notification
 */
export const sendBookingWhatsAppNotification = async ({
  patientName,
  phone,
  date,
  time,
  doctorName = 'Dr. Prashanth K Vaidya',
  branch = 'KPHB'
}) => {
  const doctor = doctorName.trim();
  const branchVisitUrl = getBranchVisitUrl(branch);

  const res = await sendWhatsAppTemplateMessage({
    to: phone,
    templateName: 'booked_apt',
    languageCode: 'en',
    bodyParameters: [
      patientName || 'Patient',
      doctor,
      date,
      time,
      branch,
      branchVisitUrl
    ]
  });

  if (res.success) return res;

  // Fallback template location_apt
  const locRes = await sendWhatsAppTemplateMessage({
    to: phone,
    templateName: 'location_apt',
    languageCode: 'en',
    bodyParameters: [
      patientName || 'Patient',
      doctor,
      date,
      time,
      branch,
      branchVisitUrl
    ]
  });

  if (locRes.success) return locRes;

  // Raw text fallback
  const message = `*SPIRITUAL HOMEOPATHY* 🌿\n\nDear *${patientName}*,\nYour appointment has been successfully booked!\n\n👨‍⚕️ *Doctor:* ${doctor}\n📅 *Date:* ${date}\n⏰ *Time:* ${time}\n📍 *Branch:* ${branch}\n🔗 *Clinic Visit URL:* ${branchVisitUrl}\n\nThank you for choosing Spiritual Homeopathy Clinic.\n📞 Helpdesk: 9069 176 176\n🌐 www.spiritualhomeoclinic.com`;
  return sendWhatsAppTextMessage({ to: phone, body: message });
};

/**
 * 2. Appointment Rescheduled WhatsApp Notification
 */
export const sendRescheduleWhatsAppNotification = async ({
  patientName,
  phone,
  date,
  time,
  doctorName = 'Prashanth K Vaidya',
  branch = 'KPHB'
}) => {
  let docName = doctorName.trim();
  if (docName.toLowerCase().startsWith('dr.') || docName.toLowerCase().startsWith('dr ')) {
    docName = docName.replace(/^dr\.?\s*/i, '');
  }

  const res = await sendWhatsAppTemplateMessage({
    to: phone,
    templateName: 'appointment_rescheduled',
    languageCode: 'en',
    bodyParameters: [
      patientName || 'Patient',
      docName,
      date,
      time,
      branch
    ]
  });

  if (res.success) return res;

  const branchVisitUrl = getBranchVisitUrl(branch);
  const message = `*SPIRITUAL HOMEOPATHY* 🌿\n\nDear *${patientName}*,\nYour appointment has been successfully *rescheduled*.\n\n👨‍⚕️ *Doctor:* Dr. ${docName}\n📅 *New Date:* ${date}\n⏰ *New Time:* ${time}\n📍 *Branch:* ${branch}\n🔗 *Clinic Visit URL:* ${branchVisitUrl}\n\nThank you for choosing Spiritual Homeopathy Clinic.\n📞 Helpdesk: 9069 176 176\n🌐 www.spiritualhomeoclinic.com`;
  return sendWhatsAppTextMessage({ to: phone, body: message });
};

/**
 * 3. Appointment Cancelled WhatsApp Notification
 */
export const sendCancellationWhatsAppNotification = async ({
  patientName,
  phone,
  date,
  time,
  doctorName = 'Doctor',
  branch = 'KPHB'
}) => {
  let docName = doctorName.trim();
  if (docName.toLowerCase().startsWith('dr.') || docName.toLowerCase().startsWith('dr ')) {
    docName = docName.replace(/^dr\.?\s*/i, '');
  }

  const res = await sendWhatsAppTemplateMessage({
    to: phone,
    templateName: 'appointment_cancelled',
    languageCode: 'en',
    bodyParameters: [
      patientName || 'Patient',
      docName,
      date,
      time,
      branch
    ]
  });

  if (res.success) return res;

  const message = `*SPIRITUAL HOMEOPATHY* 🌿\n\nDear *${patientName}*,\nYour appointment with Dr. ${docName} on ${date} at ${time} has been *cancelled*.\n\nBranch: ${branch}\nTo book a new appointment, visit: www.spiritualhomeoclinic.com\n📞 Contact: 9069 176 176`;
  return sendWhatsAppTextMessage({ to: phone, body: message });
};

/**
 * 4. Payment Receipt / Complete WhatsApp Notification
 */
export const sendPaymentReceiptWhatsAppNotification = async ({
  patientName,
  phone,
  receiptNo,
  totalPaid,
  branch = 'KPHB'
}) => {
  const todayDate = new Date().toLocaleDateString('en-GB').replace(/\//g, '-');
  const amountStr = String(Number(totalPaid || 0));

  const res = await sendWhatsAppTemplateMessage({
    to: phone,
    templateName: 'payement_receipt',
    languageCode: 'en',
    bodyParameters: [
      patientName || 'Patient',
      amountStr,
      receiptNo || `INV-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
      todayDate,
      branch
    ]
  });

  if (res.success) return res;

  // Fallback text
  const message = `*SPIRITUAL HOMEOPATHY* 🌿\n\nDear *${patientName}*,\nWe have received your consultation payment of *₹${amountStr}*.\n\nReceipt: ${receiptNo || 'Confirmed'}\nDate: ${todayDate}\nBranch: ${branch}\n\nThank you for choosing Spiritual Homeopathy Clinic!\n🌐 www.spiritualhomeoclinic.com`;
  return sendWhatsAppTextMessage({ to: phone, body: message });
};
