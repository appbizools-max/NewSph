/**
 * Spiritual Homeopathy - Shared SMS Notification Service
 * Gateway: https://smslogin.co/v3/api.php
 * Sender ID: SPHMEO
 */

export const SMS_NOTIFICATION_CONFIG = {
  baseUrl: 'https://smslogin.co/v3/api.php',
  username: 'SPHOMEO',
  apikey: 'b93e415cf967f949dfff',
  senderid: 'SPHMEO',
};

export const normalizePhoneForSms = (phone?: string): string | null => {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length === 10) return '91' + digits;
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  if (digits.length === 11 && digits.startsWith('0')) return '91' + digits.slice(1);
  if (digits.length > 10) return '91' + digits.slice(-10);
  return digits.length >= 10 ? digits : null;
};

export const getBranchSmsDetails = (branch?: string) => {
  const b = String(branch || '').toLowerCase();
  if (b.includes('kphb') || b.includes('kukatpally')) {
    return {
      key: 'kphb',
      link: 'https://stiny.in/SPHMEO/kphb',
      bookId: '1777178556881371448',
      locId: '1777178556826388827',
      name: 'KPHB'
    };
  }
  if (b.includes('chanda') || b.includes('lingampally') || b.includes('chnr')) {
    return {
      key: 'chanda',
      link: 'https://stiny.in/SPHMEO/chanda',
      bookId: '1777178556871332893',
      locId: '1777178556794509958',
      name: 'Chandanagar'
    };
  }
  if (b.includes('dilshuk') || b.includes('dilsukhnagar') || b.includes('dsnr') || b.includes('dilshu')) {
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
  return {
    key: 'kphb',
    link: 'https://stiny.in/SPHMEO/kphb',
    bookId: '1777178556881371448',
    locId: '1777178556826388827',
    name: branch || 'KPHB'
  };
};

const sendSmsRequest = async (mobile: string, message: string, templateId: string): Promise<string | null> => {
  try {
    const params = new URLSearchParams({
      username: SMS_NOTIFICATION_CONFIG.username,
      apikey: SMS_NOTIFICATION_CONFIG.apikey,
      senderid: SMS_NOTIFICATION_CONFIG.senderid,
      mobile,
      message,
      templateid: templateId
    });

    const url = `${SMS_NOTIFICATION_CONFIG.baseUrl}?${params.toString()}`;
    const res = await fetch(url);
    const text = await res.text();
    console.log('[SMS Service] Dispatched to', mobile, '| Result:', text);
    return text;
  } catch (err) {
    console.warn('[SMS Service] Fetch failure:', err);
    return null;
  }
};

export const sendBookingSMS = async (
  rawMobile?: string,
  patientName: string = 'Patient',
  doctorName: string = 'Doctor',
  dateStr: string = '',
  timeSlot: string = '',
  branchName: string = 'KPHB',
  isPatientApp: boolean = false
): Promise<string | null> => {
  const mobile = normalizePhoneForSms(rawMobile);
  if (!mobile) return null;

  const branch = getBranchSmsDetails(branchName);
  const docFormatted = doctorName ? (doctorName.toLowerCase().startsWith('dr') ? doctorName : `Dr. ${doctorName}`) : 'Doctor';

  let messageText = '';
  let templateId = '';

  if (isPatientApp) {
    templateId = branch.bookId;
    messageText = `Dear ${patientName}, your appointment has been booked successfully.\n\nDoctor: ${docFormatted}\nDate: ${dateStr} | Time: ${timeSlot}\nBranch: ${branch.name}\n\nWebsite: www.spiritualhomeoclinic.com\nPhone: 9069 176 176\nSpiritual Homeopathy Clinics\nNeed directions?\nVisit: ${branch.link}`;
  } else {
    templateId = branch.locId;
    messageText = `Dear ${patientName}, your appointment with ${docFormatted} is confirmed.\n\nDate: ${dateStr} | Time: ${timeSlot}\nBranch: ${branch.name}\n\nPlease arrive 10 minutes early.\n\nWebsite: www.spiritualhomeoclinic.com\nPhone: 9069 176 176\nSpiritual Homeopathy Clinics\nNeed directions?\nVisit:${branch.link.replace(/\s+/g, '')}`;
  }

  return sendSmsRequest(mobile, messageText, templateId);
};

export const sendRescheduleSMS = async (
  rawMobile?: string,
  patientName: string = 'Patient',
  doctorName: string = 'Doctor',
  dateStr: string = '',
  timeSlot: string = '',
  branchName: string = 'KPHB'
): Promise<string | null> => {
  const mobile = normalizePhoneForSms(rawMobile);
  if (!mobile) return null;

  const branch = getBranchSmsDetails(branchName);
  const cleanDoc = doctorName ? doctorName.replace(/^(dr\.|dr|doctor)\s*/i, '').trim() : 'Doctor';
  const templateId = '1777178462073032593';
  const messageText = `Dear ${patientName},\n\nYour appointment has been rescheduled.\n\nDoctor: Dr. ${cleanDoc}\nDate: ${dateStr} | Time: ${timeSlot}\nBranch: ${branch.name}\n\nWebsite: www.spiritualhomeoclinic.com`;

  return sendSmsRequest(mobile, messageText, templateId);
};

export const sendCancellationSMS = async (
  rawMobile?: string,
  patientName: string = 'Patient',
  doctorName: string = 'Doctor',
  dateStr: string = '',
  timeSlot: string = '',
  branchName: string = 'KPHB'
): Promise<string | null> => {
  const mobile = normalizePhoneForSms(rawMobile);
  if (!mobile) return null;

  const branch = getBranchSmsDetails(branchName);
  const cleanDoc = doctorName ? doctorName.replace(/^(dr\.|dr|doctor)\s*/i, '').trim() : 'Doctor';
  const templateId = '1777178462662473689';
  const messageText = `Dear ${patientName},\n\nYour appointment with Dr. ${cleanDoc} on ${dateStr} at ${timeSlot} has been cancelled.\n\nTo book a new appointment, please contact us.\n\nBranch: ${branch.name}\nPhone: 9069 176 176\nWebsite: www.spiritualhomeoclinic.com`;

  return sendSmsRequest(mobile, messageText, templateId);
};

export const sendPaymentReceiptSMS = async (
  rawMobile?: string,
  patientName: string = 'Patient',
  amount: string | number = 0,
  receiptNo: string = '',
  dateStr: string = '',
  branchName: string = 'KPHB'
): Promise<string | null> => {
  const mobile = normalizePhoneForSms(rawMobile);
  if (!mobile) return null;

  const branch = getBranchSmsDetails(branchName);
  const templateId = '1777178462046760918';
  const formattedDate = dateStr || new Date().toLocaleDateString('en-GB');
  const messageText = `Dear ${patientName},\n\nWe have received your payment of Rs.${amount}.\n\nReceipt No: ${receiptNo}\nDate: ${formattedDate}\nBranch: ${branch.name}\n\nThank you for choosing Spiritual Homeopathy Clinics.\n\nWebsite: www.spiritualhomeoclinic.com`;

  return sendSmsRequest(mobile, messageText, templateId);
};
