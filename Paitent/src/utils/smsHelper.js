const SMS_URL = 'https://smslogin.co/v3/api.php';
const SMS_USERNAME = 'SPHOMEO';
const SMS_APIKEY = 'b93e415cf967f949dfff';
const SMS_SENDERID = 'SPHMEO';
const getBranchSmsDetails = (branch) => {
  const b = String(branch || '').toLowerCase();
  if (b.includes('kphb')) {
    return {
      key: 'kphb',
      link: 'https://stiny.in/SPHMEO/kphb',
      bookId: '1777178556881371448',
      locId: '1777178556826388827',
      name: 'KPHB'
    };
  }
  if (b.includes('chanda') || b.includes('lingampally')) {
    return {
      key: 'chanda',
      link: 'https://stiny.in/SPHMEO/chanda',
      bookId: '1777178556871332893',
      locId: '1777178556794509958',
      name: 'Chandanagar'
    };
  }
  if (b.includes('dilshuk') || b.includes('dilsukhnagar')) {
    return {
      key: 'dilshuk',
      link: 'https://stiny.in/SPHMEO/dilshu',
      bookId: '1777178556889855699',
      locId: '1777178556806095995',
      name: 'Dilsukhnagar'
    };
  }
  if (b.includes('nallag') || b.includes('nallagandla')) {
    return {
      key: 'nallag',
      link: 'https://stiny.in/SPHMEO/nallag',
      bookId: '1777178556899040895',
      locId: '1777178556817490414',
      name: 'Nallagandla'
    };
  }
  // Default fallback to KPHB
  return {
    key: 'kphb',
    link: 'https://stiny.in/SPHMEO/kphb',
    bookId: '1777178556881371448',
    locId: '1777178556826388827',
    name: branch || 'KPHB'
  };
};

const normalizePhone = (phone) => {
  if (!phone) return null;
  const d = String(phone).replace(/\D/g, '');
  if (d.length === 10) return '91' + d;
  if (d.length === 12 && d.startsWith('91')) return d;
  if (d.length === 11 && d.startsWith('0')) return '91' + d.slice(1);
  return d;
};

const sendSmsRequest = async (mobile, message, templateId) => {
  try {
    const params = new URLSearchParams({
      username: SMS_USERNAME,
      apikey: SMS_APIKEY,
      senderid: SMS_SENDERID,
      mobile,
      message,
      templateid: templateId
    });
    const res = await fetch(`${SMS_URL}?${params.toString()}`);
    const text = await res.text();
    console.log('[SMS Service] Sent. Response:', text);
    return text;
  } catch (err) {
    console.warn('[SMS Service] Fetch failure:', err);
    return null;
  }
};

/**
 * 1. Booking Confirmation SMS
 */
export const sendBookingSMS = async (rawMobile, patientName, doctorName, dateStr, timeSlot, branchName, isPatientApp = true) => {
  const mobile = normalizePhone(rawMobile);
  if (!mobile || mobile.length < 10) return null;

  const branch = getBranchSmsDetails(branchName);
  const docFormatted = doctorName ? (doctorName.toLowerCase().startsWith('dr') ? doctorName : `Dr. ${doctorName}`) : 'Doctor';

  let messageText = '';
  let templateId = '';

  if (isPatientApp) {
    // Patient app booking templates (SPHMEO)
    templateId = branch.bookId;
    messageText = `Dear ${patientName}, your appointment has been booked successfully.\n\nDoctor: ${docFormatted}\nDate: ${dateStr} | Time: ${timeSlot}\nBranch: ${branch.name}\n\nWebsite: www.spiritualhomeoclinic.com\nPhone: 9069 176 176\nSpiritual Homeopathy Clinics\nNeed directions?\nVisit: ${branch.link}`;
  } else {
    // Receptionist booking templates
    templateId = branch.locId;
    messageText = `Dear ${patientName}, your appointment with ${docFormatted} is confirmed.\n\nDate: ${dateStr} | Time: ${timeSlot}\nBranch: ${branch.name}\n\nPlease arrive 10 minutes early.\n\nWebsite: www.spiritualhomeoclinic.com\nPhone: 9069 176 176\nSpiritual Homeopathy Clinics\nNeed directions?\nVisit:${branch.link.replace(' ', '')}`;
  }

  return sendSmsRequest(mobile, messageText, templateId);
};

/**
 * 2. Payment Receipt SMS
 */
export const sendPaymentReceiptSMS = async (rawMobile, patientName, amount, receiptNo, dateStr, branchName) => {
  const mobile = normalizePhone(rawMobile);
  if (!mobile || mobile.length < 10) return null;

  const branch = getBranchSmsDetails(branchName);
  const templateId = '1777178462046760918';
  const messageText = `Dear ${patientName},\n\nWe have received your payment of Rs.${amount}.\n\nReceipt No: ${receiptNo}\nDate: ${dateStr}\nBranch: ${branch.name}\n\nThank you for choosing Spiritual Homeopathy Clinics.\n\nWebsite: www.spiritualhomeoclinic.com`;

  return sendSmsRequest(mobile, messageText, templateId);
};

/**
 * 3. Appointment Cancelled SMS
 */
export const sendCancellationSMS = async (rawMobile, patientName, doctorName, dateStr, timeSlot, branchName) => {
  const mobile = normalizePhone(rawMobile);
  if (!mobile || mobile.length < 10) return null;

  const branch = getBranchSmsDetails(branchName);
  const templateId = '1777178462662473689';
  const cleanDoc = doctorName ? doctorName.replace(/^(dr\.|dr|doctor)\s*/i, '').trim() : 'Doctor';
  const messageText = `Dear ${patientName},\n\nYour appointment with Dr. ${cleanDoc} on ${dateStr} at ${timeSlot} has been cancelled.\n\nTo book a new appointment, please contact us.\n\nBranch: ${branch.name}\nPhone: 9069 176 176\nWebsite: www.spiritualhomeoclinic.com`;

  return sendSmsRequest(mobile, messageText, templateId);
};

/**
 * 4. Appointment Rescheduled SMS
 */
export const sendRescheduleSMS = async (rawMobile, patientName, doctorName, dateStr, timeSlot, branchName) => {
  const mobile = normalizePhone(rawMobile);
  if (!mobile || mobile.length < 10) return null;

  const branch = getBranchSmsDetails(branchName);
  const templateId = '1777178462073032593';
  const cleanDoc = doctorName ? doctorName.replace(/^(dr\.|dr|doctor)\s*/i, '').trim() : 'Doctor';
  const messageText = `Dear ${patientName},\n\nYour appointment has been rescheduled.\n\nDoctor: Dr. ${cleanDoc}\nDate: ${dateStr} | Time: ${timeSlot}\nBranch: ${branch.name}\n\nWebsite: www.spiritualhomeoclinic.com`;

  return sendSmsRequest(mobile, messageText, templateId);
};
