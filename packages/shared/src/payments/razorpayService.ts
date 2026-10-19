/**
 * Razorpay Payment & Dynamic UPI QR Integration Service
 * Spiritual Homeopathy Clinics
 */

export const RAZORPAY_CONFIG = {
  KEY_ID: 'rzp_live_ThkaAZmhaOaMtn',
  KEY_SECRET: 'tgnDwtrT6dKVvbxFpWPrlnXe',
  BASE_URL: 'https://api.razorpay.com/v1',
};

export const getRazorpayApiUrl = (endpoint: string): string => {
  // If in web browser, route through Vite proxy to eliminate CORS
  if (typeof window !== 'undefined' && window.location && !window.location.protocol.startsWith('file')) {
    return `/api/razorpay/v1${endpoint}`;
  }
  return `${RAZORPAY_CONFIG.BASE_URL}${endpoint}`;
};

const getAuthHeader = (): string => {
  const creds = `${RAZORPAY_CONFIG.KEY_ID}:${RAZORPAY_CONFIG.KEY_SECRET}`;
  if (typeof btoa !== 'undefined') {
    return `Basic ${btoa(creds)}`;
  }
  return `Basic ${Buffer.from(creds).toString('base64')}`;
};

export interface CreateQrCodeParams {
  amount: number; // In Rupees (e.g. 500)
  patientName: string;
  phone?: string;
  branch?: string;
  invoiceId?: string;
  description?: string;
}

export interface QrCodeResult {
  success: boolean;
  qrId?: string;
  imageUrl: string;
  paymentUrl?: string;
  amount: number;
  status: 'active' | 'created';
  source: 'upi_vpa' | 'upi_qr' | 'payment_link' | 'upi_intent';
  error?: string;
}
/**
 * Creates a dynamic Razorpay QR Code for the exact payment amount.
 * Primary method: Direct UPI VPA Intent (Razorpay Smart Collect) which opens UPI apps
 * (Google Pay, PhonePe, Paytm) directly WITHOUT redirecting to a browser or asking for contact details!
 */
export async function createRazorpayPaymentQr(params: CreateQrCodeParams): Promise<QrCodeResult> {
  const patient = params.patientName || 'Patient';
  const branch = params.branch || 'Spiritual Homeopathy';
  const invoiceId = params.invoiceId || `INV-${Date.now().toString().slice(-6)}`;
  const description = params.description || `Consultation Fee - ${patient}`;
  const authHeader = getAuthHeader();

  // 1. Primary Method: Razorpay Smart Collect Dynamic UPI VPA
  // Creates a dedicated ICICI VPA registered under SPIRITUAL HOMEO PRIVATE LIMITED.
  // Standard NPCI upi://pay URI ensures 100% compatibility with all UPI scanner apps (GPay, PhonePe, Paytm, BHIM).
  try {
    const vaPayload = {
      receivers: {
        types: ['vpa']
      },
      description: description.substring(0, 30),
      notes: {
        patientName: patient,
        branch: branch,
        invoiceId: invoiceId
      }
    };

    const vaRes = await fetch(getRazorpayApiUrl('/virtual_accounts'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader
      },
      body: JSON.stringify(vaPayload)
    });

    if (vaRes.ok) {
      const vaData = await vaRes.json();
      const vpaReceiver = vaData.receivers?.find((r: any) => r.entity === 'vpa' && r.address);
      if (vpaReceiver && vpaReceiver.address) {
        const vpaAddress = vpaReceiver.address;
        const merchantName = encodeURIComponent(vaData.name || 'Spiritual Homeo Private Limited');
        const cleanNote = encodeURIComponent(description.slice(0, 25));
        const upiUri = `upi://pay?pa=${vpaAddress}&pn=${merchantName}&am=${params.amount}&cu=INR&tn=${cleanNote}`;
        const dynamicQrImg = `https://api.qrserver.com/v1/create-qr-code/?size=350x350&margin=10&data=${encodeURIComponent(upiUri)}`;

        return {
          success: true,
          qrId: vaData.id,
          imageUrl: dynamicQrImg,
          paymentUrl: upiUri,
          amount: params.amount,
          status: 'active',
          source: 'upi_vpa'
        };
      }
    } else {
      const errData = await vaRes.json().catch(() => ({}));
      console.warn('[Razorpay] virtual_account notice:', errData);
    }
  } catch (vaErr) {
    console.warn('[Razorpay] virtual_account fallback notice:', vaErr);
  }

  // 2. Direct Clinic Verified UPI Fallback
  // Formatted strictly as standard NPCI UPI URI so PhonePe, GPay, Paytm can scan it without error
  const fallbackUpiUri = `upi://pay?pa=spiritualhomeopathy@icici&pn=Spiritual%20Homeopathy&am=${params.amount}&cu=INR&tn=${encodeURIComponent(description.slice(0, 25))}`;
  const upiQrImg = `https://api.qrserver.com/v1/create-qr-code/?size=350x350&margin=10&data=${encodeURIComponent(fallbackUpiUri)}`;

  return {
    success: true,
    imageUrl: upiQrImg,
    paymentUrl: fallbackUpiUri,
    amount: params.amount,
    status: 'active',
    source: 'upi_intent'
  };
}

/**
 * Polls or verifies if the dynamic QR code has been paid
 */
export async function checkRazorpayPaymentStatus(qrOrLinkId: string): Promise<{
  isPaid: boolean;
  status: string;
  amountPaid: number;
}> {
  if (!qrOrLinkId) return { isPaid: false, status: 'unknown', amountPaid: 0 };
  const authHeader = getAuthHeader();

  try {
    let endpoint = '';
    if (qrOrLinkId.startsWith('va_')) {
      endpoint = `/virtual_accounts/${qrOrLinkId}`;
    } else if (qrOrLinkId.startsWith('plink_')) {
      endpoint = `/payment_links/${qrOrLinkId}`;
    } else {
      endpoint = `/payments/qr_codes/${qrOrLinkId}`;
    }

    const res = await fetch(getRazorpayApiUrl(endpoint), {
      headers: { 'Authorization': authHeader }
    });

    if (res.ok) {
      const data = await res.json();
      const status = data.status || '';

      if (qrOrLinkId.startsWith('va_')) {
        const amountPaid = Number(data.amount_paid || 0) / 100;
        const isPaid = amountPaid > 0 || (status === 'closed' && amountPaid > 0);
        return { isPaid, status, amountPaid };
      }

      const amountPaid = Number(data.amount_paid || data.payments_amount_received || 0) / 100;
      const isPaid = status === 'paid' || (status === 'closed' && amountPaid > 0);
      return { isPaid, status, amountPaid };
    }
  } catch (e) {
    console.warn('[Razorpay] status check notice:', e);
  }

  return { isPaid: false, status: 'pending', amountPaid: 0 };
}

/**
 * Closes an active single-use QR Code / Payment Link on Razorpay
 */
export async function closeRazorpayQr(qrId: string): Promise<boolean> {
  if (!qrId) return false;
  const authHeader = getAuthHeader();

  try {
    const endpoint = qrId.startsWith('plink_')
      ? `/payment_links/${qrId}/cancel`
      : qrId.startsWith('va_')
        ? `/virtual_accounts/${qrId}/close`
        : `/payments/qr_codes/${qrId}/close`;

    const res = await fetch(getRazorpayApiUrl(endpoint), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader
      }
    });
    return res.ok;
  } catch (e) {
    return false;
  }
}

/**
 * Creates a Razorpay Payment Link specifically for Card checkout
 */
export async function createRazorpayCardPaymentLink(params: {
  amount: number;
  patientName: string;
  phone?: string;
  branch?: string;
  invoiceId?: string;
}): Promise<{
  success: boolean;
  linkId?: string;
  paymentUrl?: string;
  error?: string;
}> {
  const amountPaise = Math.round(params.amount * 100);
  const authHeader = getAuthHeader();

  try {
    const payload = {
      amount: amountPaise,
      currency: 'INR',
      accept_partial: false,
      description: `Card Payment for ${params.patientName} - ${params.branch || 'SPH'}`,
      customer: {
        name: params.patientName,
        contact: params.phone ? (params.phone.startsWith('+91') ? params.phone : `+91${params.phone.replace(/\D/g, '').slice(-10)}`) : undefined
      },
      notes: {
        paymentType: 'card',
        patientName: params.patientName,
        branch: params.branch || '',
        invoiceId: params.invoiceId || ''
      }
    };

    const res = await fetch(getRazorpayApiUrl('/payment_links'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader
      },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      const data = await res.json();
      return {
        success: true,
        linkId: data.id,
        paymentUrl: data.short_url
      };
    }
  } catch (err: any) {
    console.warn('[Razorpay] card payment link error:', err);
  }

  return { success: false, error: 'Could not create card payment link' };
}

/**
 * Dynamically loads the Razorpay checkout script (for web)
 */
export function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(false);
    if ((window as any).Razorpay) return resolve(true);

    const existingScript = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(true));
      existingScript.addEventListener('error', () => resolve(false));
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

/**
 * Launches the official Razorpay Standard Gateway Checkout modal (for Web)
 * Supports UPI (Google Pay, PhonePe, Paytm), Razorpay's official verified QR, Cards, & Netbanking
 */
export async function launchRazorpayStandardCheckout(options: {
  amount: number;
  patientName?: string;
  phone?: string;
  branch?: string;
  invoiceId?: string;
  description?: string;
  onSuccess: (paymentId: string) => void;
  onError?: (err: any) => void;
}): Promise<boolean> {
  const loaded = await loadRazorpayScript();
  if (!loaded || !(window as any).Razorpay) {
    if (typeof alert !== 'undefined') {
      alert('Unable to load Razorpay payment gateway. Please verify your internet connection.');
    }
    return false;
  }

  try {
    const rzp = new (window as any).Razorpay({
      key: RAZORPAY_CONFIG.KEY_ID,
      amount: Math.round(options.amount * 100),
      currency: 'INR',
      name: 'Spiritual Homeopathy',
      description: options.description || `Payment - ${options.patientName || 'Patient'}`,
      prefill: {
        name: options.patientName || '',
        contact: options.phone ? options.phone.replace(/\D/g, '').slice(-10) : ''
      },
      notes: {
        paymentType: 'standard_checkout',
        patientName: options.patientName || '',
        branch: options.branch || '',
        invoiceId: options.invoiceId || ''
      },
      theme: {
        color: '#0284c7'
      },
      modal: {
        ondismiss: function () {
          console.log('[Razorpay] Checkout modal dismissed');
        }
      },
      handler: function (response: any) {
        if (response && response.razorpay_payment_id) {
          options.onSuccess(response.razorpay_payment_id);
        }
      }
    });

    rzp.on('payment.failed', function (response: any) {
      if (options.onError) {
        options.onError(response.error);
      } else if (typeof alert !== 'undefined') {
        alert(`Payment Failed: ${response.error?.description || 'Transaction was declined.'}`);
      }
    });

    rzp.open();
    return true;
  } catch (err: any) {
    console.error('[Razorpay] checkout open error:', err);
    return false;
  }
}

/**
 * Backward compatibility alias
 */
export const launchRazorpayCardCheckout = launchRazorpayStandardCheckout;
