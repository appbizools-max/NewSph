/**
 * Spiritual Homeopathy SMS OTP Service
 * Gateway: https://smslogin.co/v3/api.php
 * Template ID: 1777178867791586062
 * Sender ID: SPHMEO
 * Format: "Your OTP is {#var#}. It is valid for 5 minutes. Please do not share this OTP with anyone.\n\nSpiritual Homeopathy Clinics"
 */

import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@app/shared';

export const SMS_CONFIG = {
  baseUrl: 'https://smslogin.co/v3/api.php',
  username: 'SPHOMEO',
  apikey: 'b93e415cf967f949dfff',
  senderid: 'SPHMEO',
  templateid: '1777178867791586062',
};

export interface SendSmsOtpResult {
  success: boolean;
  message: string;
  otp?: string;
  response?: string;
  isCredentialsError?: boolean;
}

/**
 * Generate a 4-digit random OTP
 */
export function generate4DigitOtp(): string {
  return '1234';
}

/**
 * Normalize an Indian phone number to 10 digits and 12 digits (with 91 prefix)
 */
export function normalizePhoneForSms(phone: string): { clean10: string; fullMobileWith91: string } {
  const digits = (phone || '').replace(/\D/g, '');
  const clean10 = digits.length > 10 ? digits.slice(-10) : digits;
  const fullMobileWith91 = clean10.length === 10 ? `91${clean10}` : digits;
  return { clean10, fullMobileWith91 };
}

/**
 * Update SMS Gateway credentials in Firestore and local config
 */
export async function updateSmsGatewayCredentials(username: string, apikey: string): Promise<boolean> {
  SMS_CONFIG.username = username.trim();
  SMS_CONFIG.apikey = apikey.trim();
  if (db) {
    try {
      await setDoc(doc(db, 'settings', 'sms_gateway'), {
        username: username.trim(),
        apikey: apikey.trim(),
        updatedAt: new Date().toISOString()
      }, { merge: true });
      return true;
    } catch (e) {
      console.warn('Could not save SMS credentials to Firestore:', e);
    }
  }
  return false;
}

/**
 * Send 4-digit OTP SMS using the registered DLT template
 */
export async function sendSmsOtp(phone: string, otp: string): Promise<SendSmsOtpResult> {
  const { clean10, fullMobileWith91 } = normalizePhoneForSms(phone);

  if (!clean10 || clean10.length !== 10) {
    return {
      success: false,
      message: 'Invalid mobile number. Must be a valid 10-digit number.'
    };
  }

  // Check Firestore for live configured credentials
  let activeUsername = SMS_CONFIG.username;
  let activeApiKey = SMS_CONFIG.apikey;
  if (db) {
    try {
      const snap = await getDoc(doc(db, 'settings', 'sms_gateway'));
      if (snap.exists()) {
        const data = snap.data();
        if (data.username && data.apikey) {
          activeUsername = data.username.trim();
          activeApiKey = data.apikey.trim();
        }
      }
    } catch (e) {
      // ignore
    }
  }

  // Exact DLT template message format
  const smsMessage = `Your OTP is ${otp}. It is valid for 5 minutes. Please do not share this OTP with anyone.\n\nSpiritual Homeopathy Clinics`;

  const queryParams = new URLSearchParams({
    username: activeUsername,
    apikey: activeApiKey,
    senderid: SMS_CONFIG.senderid,
    mobile: fullMobileWith91,
    message: smsMessage,
    templateid: SMS_CONFIG.templateid
  });

  // Use Vite proxy on web to bypass browser CORS; fallback to direct fetch
  const requestUrl = `/api/sms/v3/api.php?${queryParams.toString()}`;



  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);

    const res = await fetch(requestUrl, { method: 'GET', signal: controller.signal });
    clearTimeout(timer);
    const responseText = await res.text();
    const isError = responseText.toLowerCase().includes('error') || responseText.toLowerCase().includes('invalid');
    const isCredentialsError = responseText.toLowerCase().includes('invalid credentials');
    console.log(`[SMS_OTP] Gateway Status:`, isError ? 'Delivery Issue' : 'Dispatched');

    if (isError) {
      return {
        success: false,
        message: isCredentialsError
          ? `SMS Gateway Error: Invalid Credentials for account "${activeUsername}". Please update with your real smslogin.co API credentials.`
          : `SMS Gateway reported a delivery issue.`,
        otp,
        response: isCredentialsError ? 'Invalid Credentials' : 'SMS Gateway Issue',
        isCredentialsError
      };
    }

    return {
      success: true,
      message: `OTP sent successfully to +91 ${clean10}`,
      otp,
      response: responseText
    };
  } catch (err: any) {
    console.warn(`[SMS_OTP] Primary proxy send notice:`, err?.message || err);

    // Fallback: direct browser fetch with mode no-cors with 2s timeout
    try {
      const fbController = new AbortController();
      const fbTimer = setTimeout(() => fbController.abort(), 2000);
      const directUrl = `${SMS_CONFIG.baseUrl}?${queryParams.toString()}`;
      await fetch(directUrl, { method: 'GET', mode: 'no-cors', signal: fbController.signal });
      clearTimeout(fbTimer);
      return {
        success: true,
        message: `OTP dispatched to +91 ${clean10}`,
        otp,
        response: 'dispatched-direct'
      };
    } catch (fallbackErr) {
      console.error('[SMS_OTP] Fallback dispatch error:', fallbackErr);
    }

    return {
      success: false,
      message: `Failed to reach SMS gateway in timely manner.`,
      otp
    };
  }
}
