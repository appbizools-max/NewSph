import React, { useState, useEffect, useRef } from 'react';
import { doc, updateDoc, setDoc, getDocs, collection, query, where, arrayUnion, addDoc, onSnapshot, limit, increment } from 'firebase/firestore';
import { getStorage, ref as storageRef, uploadString, getDownloadURL } from 'firebase/storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  db,
  sendInvoiceWhatsAppNotification,
  resolveCanonicalBranchId,
  getBranchPhone,
  createRazorpayPaymentQr,
  checkRazorpayPaymentStatus,
  QrCodeResult,
  launchRazorpayCardCheckout,
  createRazorpayCardPaymentLink
} from '@app/shared';
import { X, User, CheckCircle2, Circle, ArrowLeft, MessageCircle, Plus, Trash2, Package, AlertCircle, ShieldCheck, Sparkles, Clock, Calendar, FileText, Camera, Upload, Eye, QrCode, RefreshCw, Copy, Check, CreditCard, ExternalLink } from 'lucide-react';
import { SH_LOGO_BASE64 } from '../utils/logoBase64';
import { createPaymentNotificationInFirestore, createFeeDiscountRequestNotificationInFirestore } from '../utils/fcmWebTrigger';

// Firebase storage helper for prescription upload
const getFirebaseStorage = () => {
  try {
    const app = getApps().length ? getApp() : initializeApp({
      apiKey: "AIzaSyAohSNLyeS6bYtnk2QvB4HGo0LbHDw9b6Q",
      authDomain: "spiritual-homeopathy-3b552.firebaseapp.com",
      projectId: "spiritual-homeopathy-3b552",
      storageBucket: "spiritual-homeopathy-3b552.firebasestorage.app",
      messagingSenderId: "81822616559",
      appId: "1:81822616559:web:98a0b9cd974938cc87841a"
    });
    return getStorage(app);
  } catch (e) {
    console.warn("Firebase storage init warning:", e);
    return null;
  }
};

const uploadPrescriptionToStorage = async (dataOrUri: string, patId?: string): Promise<string> => {
  if (!dataOrUri) return '';
  if (dataOrUri.startsWith('http://') || dataOrUri.startsWith('https://')) {
    return dataOrUri;
  }
  try {
    const storage = getFirebaseStorage();
    if (!storage) throw new Error("Firebase storage not available");

    const safePatId = (patId || 'unknown').toString().replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `prescriptions/${safePatId}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.jpg`;
    const fileRef = storageRef(storage, filename);

    if (dataOrUri.startsWith('data:')) {
      await uploadString(fileRef, dataOrUri, 'data_url');
      const downloadUrl = await getDownloadURL(fileRef);
      return downloadUrl;
    }
  } catch (err) {
    console.warn("Storage upload notice:", err);
  }
  return dataOrUri;
};
import { calculateDurationExpiry, getPatientVisitState } from '../utils/patientVisitState';
import { calculateRealBranchRevenue, syncBranchTargetToFirestore, incrementBranchTargetRevenue } from '../utils/branchRevenueCalculator';
import { receptionDataStore } from '../utils/receptionDataStore';

export interface CheckoutMedicineItem {
  id: string;
  name: string;
  amount: number;
  timing?: string;
  type?: string;
}

export const CHECKOUT_MEDICINE_TYPE_OPTIONS = [
  'Pills',
  'Tablet',
  'Syrup',
  'Powder',
  'Drops',
  'Mother Tincture',
  'Ointment',
  'Other'
];

export const DOSAGE_TIMING_OPTIONS = [
  { value: '', label: 'Select Pill Timing' },
  { value: 'M - A - N', label: 'M - A - N (Morning - Afternoon - Night)' },
  { value: 'M - - E', label: 'M - - E (Morning - Evening)' },
  { value: 'M - - N', label: 'M - - N (Morning - Night)' },
  { value: 'M - A -', label: 'M - A - (Morning - Afternoon)' },
  { value: '- A - N', label: '- A - N (Afternoon - Night)' },
  { value: 'M - - -', label: 'M - - - (Morning Only)' },
  { value: '- A -', label: '- A - (Afternoon Only)' },
  { value: '- - E', label: '- - E (Evening Only)' },
  { value: '- - N', label: '- - N (Night Only)' },
  { value: '1-0-1', label: '1-0-1 (Morning & Night)' },
  { value: '1-1-1', label: '1-1-1 (Morning, Afternoon, Night)' },
  { value: '1-0-0', label: '1-0-0 (Morning Only)' },
  { value: '0-0-1', label: '0-0-1 (Night Only)' },
  { value: 'SOS', label: 'SOS (As Needed)' },
];

export interface PatientAppointment {
  id: string;
  patientName?: string;
  name?: string;
  phone?: string;
  phoneNumber?: string;
  doctorName?: string;
  doctor?: string;
  branch?: string;
  regId?: string;
  status?: string;
  consultationFee?: number;
  medicineFee?: number;
  medicineFeeRequested?: number;
  pharmacyFee?: number;
  dietFee?: number;
  dietFeeAmount?: number | string;
  dietPlan?: any;
  targetAmount?: number;
  target_amount?: number;
  totalAmount?: number;
  otherCharges?: number;
  discount?: number;
  paymentMode?: string;
  paymentStatus?: string;
  [key: string]: any;
}

export function distributeAmountEvenly(total: number, count: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [Math.max(0, total)];
  const safeTotal = Math.max(0, total);
  const base = Math.floor(safeTotal / count);
  const remainder = safeTotal - (base * count);
  const amounts = new Array(count).fill(base);
  for (let i = 0; i < remainder; i++) {
    amounts[count - 1 - i] += 1;
  }
  return amounts;
}

interface CollectFeeCheckoutModalProps {
  appointment: PatientAppointment | null;
  onClose: () => void;
  onSuccess?: (invoiceData: any) => void;
}

export const CollectFeeCheckoutModal: React.FC<CollectFeeCheckoutModalProps> = ({
  appointment,
  onClose,
  onSuccess
}) => {
  // ---------------- STATE ----------------
  const [showPatientDetails, setShowPatientDetails] = useState(false);
  const [targetAmount, setTargetAmount] = useState<number>(0);
  const [paymentTypePreset, setPaymentTypePreset] = useState<'consultation' | 'consultation_med' | 'split' | 'package'>('consultation');

  // Package State
  const [existingActivePackage, setExistingActivePackage] = useState<any | null>(null);
  const [packageTotalAmountInput, setPackageTotalAmountInput] = useState<number | string>('');
  const [packageDurationInput, setPackageDurationInput] = useState<string>('3 Months');
  const [packageAdvancePaidInput, setPackageAdvancePaidInput] = useState<number | string>('');
  const [packageInstallmentInput, setPackageInstallmentInput] = useState<number | string>('');

  // Active Follow-up & Medicine Duration State (IN-DUR)
  const [activeDurationInfo, setActiveDurationInfo] = useState<{
    duration: string;
    expiryDate: string;
    startDate: string;
    daysRemaining: number;
  } | null>(null);

  // Checkbox Fee Selection
  const [includeConsultFee, setIncludeConsultFee] = useState<boolean>(true);
  const [includeMedicineFee, setIncludeMedicineFee] = useState<boolean>(false);
  const [includeDietFee, setIncludeDietFee] = useState<boolean>(false);
  const [includeOtherCharges, setIncludeOtherCharges] = useState<boolean>(false);

  // Fee Inputs
  const [consultFeeInput, setConsultFeeInput] = useState<number>(0);
  const [medicineFeeInput, setMedicineFeeInput] = useState<number>(0);
  const [dietFeeInput, setDietFeeInput] = useState<number>(0);
  const [otherChargesInput, setOtherChargesInput] = useState<number>(0);
  const [discountInput, setDiscountInput] = useState<number>(0);
  const [showDiscountInput, setShowDiscountInput] = useState(false);

  // HR Discount Request State
  const [discountRequestId, setDiscountRequestId] = useState<string | null>(null);
  const [discountRequestStatus, setDiscountRequestStatus] = useState<'none' | 'pending' | 'approved' | 'rejected'>('none');
  const [requestedDiscountAmount, setRequestedDiscountAmount] = useState<number>(0);
  const [approvedDiscountAmount, setApprovedDiscountAmount] = useState<number>(0);
  const [discountReason, setDiscountReason] = useState<string>('');
  const [hrRejectReason, setHrRejectReason] = useState<string>('');
  const [isSubmittingDiscountRequest, setIsSubmittingDiscountRequest] = useState<boolean>(false);

  // Medicine Items & Duration for Split Preset
  const [medicineDuration, setMedicineDuration] = useState<string>('1 Month');
  const [medicineItems, setMedicineItems] = useState<CheckoutMedicineItem[]>([]);

  // Payment Mode & Split (Mandatory - No Default)
  const [selectedPaymentMode, setSelectedPaymentMode] = useState<string>('');
  const [splitMethod1, setSplitMethod1] = useState<string>('Cash');
  const [splitMethod2, setSplitMethod2] = useState<string>('UPI');
  const [splitAmount1, setSplitAmount1] = useState<number | string>('');
  const [splitAmount2, setSplitAmount2] = useState<number | string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Prescription State (Mandatory to Collect Amount)
  const [uploadedPrescriptionList, setUploadedPrescriptionList] = useState<string[]>([]);
  const [isUploadingPrescription, setIsUploadingPrescription] = useState<boolean>(false);
  const [previewModalUrl, setPreviewModalUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const prescriptionSectionRef = useRef<HTMLDivElement | null>(null);

  const [paymentSuccessPopup, setPaymentSuccessPopup] = useState<{
    patientName: string;
    totalPaid: number;
    paymentMode: string;
    completedInvoice: any;
  } | null>(null);
  const isAlreadyPaid = Boolean(
    (appointment?.paymentStatus === 'paid' || appointment?.status === 'completed') &&
    appointment?.status !== 'collect_fee' &&
    (appointment as any)?.feeCollectionNeeded !== true
  );
  const [invoiceApp, setInvoiceApp] = useState<any | null>(() => (
    appointment && isAlreadyPaid ? appointment : null
  ));
  const activeInvoice = invoiceApp || (isAlreadyPaid ? appointment : null);

  const handleCancelOrBack = async () => {
    if (appointment && !isAlreadyPaid && !paymentSuccessPopup) {
      const targetId = appointment.id;
      if (targetId && (appointment.status === 'collect_fee' || (appointment as any).feeCollectionNeeded === true)) {
        try {
          const resetPayload = {
            status: 'collect_fee',
            paymentStatus: 'pending',
            feeCollectionNeeded: true,
            paymentPending: true,
            updatedAt: new Date().toISOString()
          };
          await updateDoc(doc(db, 'appointments', targetId), resetPayload).catch(() => { });
          await updateDoc(doc(db, 'allpatients', targetId), resetPayload).catch(() => { });
          await updateDoc(doc(db, 'patients', targetId), resetPayload).catch(() => { });
        } catch (e) { }
      }
    }
    onClose();
  };

  // Load existing prescriptions from appointment and Firestore prescriptions collection
  useEffect(() => {
    if (!appointment) {
      setUploadedPrescriptionList([]);
      return;
    }
    const initialList: string[] = [];
    if (Array.isArray(appointment.uploadedPrescriptions)) {
      initialList.push(...appointment.uploadedPrescriptions);
    }
    if ((appointment as any).canvasPrescriptionUrl) {
      initialList.push((appointment as any).canvasPrescriptionUrl);
    }
    if ((appointment as any).prescriptionUrl) {
      initialList.push((appointment as any).prescriptionUrl);
    }
    setUploadedPrescriptionList(Array.from(new Set(initialList.filter(Boolean))));

    const fetchPrescriptions = async () => {
      try {
        const targetId = appointment.id || (appointment as any).patientDocId || (appointment as any).patientId;
        if (!targetId || !db) return;
        const q = query(collection(db, 'prescriptions'), where('appointmentId', '==', targetId));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const found: string[] = [];
          snap.forEach(docSnap => {
            const d = docSnap.data();
            if (Array.isArray(d.uploadedPrescriptions)) found.push(...d.uploadedPrescriptions);
            if (d.canvasPrescriptionUrl) found.push(d.canvasPrescriptionUrl);
            if (d.prescriptionUrl) found.push(d.prescriptionUrl);
          });
          if (found.length > 0) {
            setUploadedPrescriptionList(prev => Array.from(new Set([...prev, ...found.filter(Boolean)])));
          }
        }
      } catch (e) {
        console.warn('Could not query prescriptions:', e);
      }
    };
    fetchPrescriptions();
  }, [appointment]);

  // Real-time listener for HR Fee / Discount Requests for this appointment
  useEffect(() => {
    if (!appointment || !db) return;
    const targetId = appointment.id || (appointment as any).patientDocId || (appointment as any).patientId;
    if (!targetId) return;

    // Initialize from appointment if already present
    if ((appointment as any).discountRequestStatus) {
      const initStatus = (appointment as any).discountRequestStatus;
      setDiscountRequestStatus(initStatus);
      const reqAmt = Number((appointment as any).requestedDiscount || (appointment as any).discount || 0);
      setRequestedDiscountAmount(reqAmt);
      setDiscountReason((appointment as any).discountReason || '');
      if (initStatus === 'approved') {
        const appAmt = Number((appointment as any).approvedDiscount || (appointment as any).discount || reqAmt);
        setApprovedDiscountAmount(appAmt);
        setDiscountInput(appAmt);
      }
    }

    try {
      const q = query(collection(db, 'fee_requests'), where('appointmentId', '==', targetId));
      const unsub = onSnapshot(q, (snap) => {
        if (!snap.empty) {
          const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          docs.sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
          const latest: any = docs[0];
          setDiscountRequestId(latest.id);
          const st = (latest.status || 'pending').toLowerCase();
          if (st === 'approved') {
            setDiscountRequestStatus('approved');
            const approvedAmt = Number(latest.approvedDiscount ?? latest.requestedDiscount ?? 0);
            setApprovedDiscountAmount(approvedAmt);
            setDiscountInput(approvedAmt);
          } else if (st === 'rejected') {
            setDiscountRequestStatus('rejected');
            setHrRejectReason(latest.rejectReason || latest.hrNote || 'Discount request rejected by HR');
            setDiscountInput(0);
          } else {
            setDiscountRequestStatus('pending');
            setRequestedDiscountAmount(Number(latest.requestedDiscount || 0));
            setDiscountReason(latest.reason || '');
            setDiscountInput(0);
          }
        }
      }, (err) => console.warn('fee_requests listener error:', err));

      return () => unsub();
    } catch (e) {
      console.warn('Error setting up fee_requests listener:', e);
    }
  }, [appointment]);

  // Client-side image compression: resizes large photos to max 1400px and 0.65 JPEG quality
  // Shrinks 5MB-15MB captures down to ~150KB-250KB for fast upload and minimal storage
  const compressImageForWeb = async (file: File): Promise<string> => {
    if (file.type === 'application/pdf') {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const MAX_DIM = 1400;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_DIM) {
              height = Math.round((height * MAX_DIM) / width);
              width = MAX_DIM;
            }
          } else {
            if (height > MAX_DIM) {
              width = Math.round((width * MAX_DIM) / height);
              height = MAX_DIM;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(e.target?.result as string);
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.65);
          resolve(compressedDataUrl);
        };
        img.onerror = () => resolve(e.target?.result as string);
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };
  // Upload handler for prescription images/PDFs on Web (No limit on number of pages)
  const handleWebPrescriptionUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !appointment) return;
    setIsUploadingPrescription(true);
    try {
      const newUrls: string[] = [];
      const targetId = appointment.id || (appointment as any).patientDocId || 'unknown';
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        // Reduce image size automatically before upload
        const dataUrl = await compressImageForWeb(file);
        const cloudUrl = await uploadPrescriptionToStorage(dataUrl, targetId);
        if (cloudUrl) {
          newUrls.push(cloudUrl);
          if (appointment.id && db) {
            await updateDoc(doc(db, 'appointments', appointment.id), {
              uploadedPrescriptions: arrayUnion(cloudUrl),
              updatedAt: new Date().toISOString()
            }).catch(() => { });
            await updateDoc(doc(db, 'allpatients', appointment.id), {
              uploadedPrescriptions: arrayUnion(cloudUrl),
              updatedAt: new Date().toISOString()
            }).catch(() => { });
            await updateDoc(doc(db, 'patients', appointment.id), {
              uploadedPrescriptions: arrayUnion(cloudUrl),
              updatedAt: new Date().toISOString()
            }).catch(() => { });
          }
        }
      }
      setUploadedPrescriptionList(prev => Array.from(new Set([...prev, ...newUrls])));
    } catch (err) {
      console.error('Error uploading prescription:', err);
      alert('Failed to upload prescription image. Please try again.');
    } finally {
      setIsUploadingPrescription(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleRemovePrescription = async (urlToRemove: string) => {
    if (!confirm('Are you sure you want to remove this prescription page?')) return;
    const updated = uploadedPrescriptionList.filter(u => u !== urlToRemove);
    setUploadedPrescriptionList(updated);
    if (appointment?.id && db) {
      await updateDoc(doc(db, 'appointments', appointment.id), {
        uploadedPrescriptions: updated,
        updatedAt: new Date().toISOString()
      }).catch(() => { });
      await updateDoc(doc(db, 'allpatients', appointment.id), {
        uploadedPrescriptions: updated,
        updatedAt: new Date().toISOString()
      }).catch(() => { });
      await updateDoc(doc(db, 'patients', appointment.id), {
        uploadedPrescriptions: updated,
        updatedAt: new Date().toISOString()
      }).catch(() => { });
    }
  };

  useEffect(() => {
    if (appointment) {
      setPaymentSuccessPopup(null);
      const mFee = Number(appointment.pharmacyFee || appointment.medicineFeeRequested || appointment.medicineFee) || 0;
      const cFee = mFee > 0 ? 0 : (appointment.consultationFee !== undefined && appointment.consultationFee !== null ? Number(appointment.consultationFee) : 0);
      const dFee = Number(appointment.dietFee || appointment.dietFeeAmount || appointment.dietPlan?.dietFeeAmount || appointment.dietPlan?.dietFee) || 0;
      const oFee = Number(appointment.otherCharges) || 0;
      const disc = Number(appointment.discount) || 0;

      // Target Amount represents strictly the Doctor's Consultation + Medicine target (Diet Plan is completely separate)
      const explicitTarget = appointment.targetAmount ?? appointment.target_amount;
      let computedTarget = 0;
      if (explicitTarget !== undefined && explicitTarget !== null && Number(explicitTarget) > 0) {
        computedTarget = Number(explicitTarget);
      } else if (mFee > 0) {
        computedTarget = mFee;
      } else if (appointment.totalAmount !== undefined && appointment.totalAmount !== null && Number(appointment.totalAmount) > 0) {
        // If totalAmount was provided, subtract diet fee so target is strictly consult + medicine
        computedTarget = Math.max(0, Number(appointment.totalAmount) - dFee);
      } else if (cFee > 0) {
        computedTarget = cFee;
      } else {
        computedTarget = 1000;
      }

      setDietFeeInput(dFee);
      setOtherChargesInput(oFee);
      setDiscountInput(disc);
      setTargetAmount(computedTarget);

      // Care Package fields strictly from doctor prescription if present, else clean empty
      const presPkgTotal = Number((appointment as any)?.packageTotalAmount) || '';
      const presPkgAdvance = Number((appointment as any)?.packageAdvancePaid ?? (appointment as any)?.packageFee) || '';
      const presPkgDuration = (appointment as any)?.packageDuration || '3 Months';
      setPackageTotalAmountInput(presPkgTotal);
      setPackageAdvancePaidInput(presPkgAdvance);
      setPackageDurationInput(presPkgDuration);

      if (dFee > 0) {
        setIncludeDietFee(true);
      }

      if (mFee > 0 && cFee > 0) {
        setPaymentTypePreset('split');
        setIncludeConsultFee(true);
        setIncludeMedicineFee(true);
        const cPortion = cFee < computedTarget ? cFee : Math.round(computedTarget / 2);
        const mPortion = Math.max(0, computedTarget - cPortion);
        setConsultFeeInput(cPortion);
        setMedicineFeeInput(mPortion);
        setMedicineItems([{ id: '1', name: '', amount: mPortion, timing: '' }]);
      } else if (mFee > 0) {
        setPaymentTypePreset('split');
        setIncludeConsultFee(true);
        setIncludeMedicineFee(true);
        const cPortion = Math.max(0, computedTarget - mFee);
        const mPortion = Math.min(mFee, computedTarget);
        setConsultFeeInput(cPortion);
        setMedicineFeeInput(mPortion);
        setMedicineItems([{ id: '1', name: '', amount: mPortion, timing: '' }]);
      } else {
        setPaymentTypePreset('consultation');
        setIncludeConsultFee(true);
        setIncludeMedicineFee(false);
        setConsultFeeInput(computedTarget > 0 ? computedTarget : 500);
        setMedicineFeeInput(0);
        setMedicineItems([]);
      }

      if (isAlreadyPaid) {
        setInvoiceApp(appointment);
      } else {
        setInvoiceApp(null);
      }

      // Check if this patient profile has an active care package in Firestore
      const checkPackage = async () => {
        try {
          const cleanPhone = (appointment.phone || appointment.phoneNumber || '').replace(/\D/g, '').slice(-10);
          const targetDocId = String(appointment.patientDocId || appointment.patient_id || appointment.patientId || appointment.id || '');
          const patName = String(appointment.patientName || appointment.name || '').trim().toLowerCase();
          const cleanReg = String(appointment.regId || appointment.registrationId || appointment.patientId || '').trim().toLowerCase();

          // 1. Check in-memory store package members (instant, 0ms, avoids downloading entire DB)
          const localPkgs = receptionDataStore.getPackageMembers() || [];
          let matchedPkg: any = null;
          for (const d of localPkgs) {
            if (targetDocId && (d.patientDocId === targetDocId || d.id === targetDocId || d.patientDocId === appointment.id)) {
              matchedPkg = d;
              break;
            } else if (cleanReg && d.patientId && String(d.patientId).trim().toLowerCase() === cleanReg) {
              matchedPkg = d;
              break;
            } else if (cleanPhone && d.phone && String(d.phone).replace(/\D/g, '').slice(-10) === cleanPhone) {
              const dName = String(d.patientName || d.name || '').trim().toLowerCase();
              if (patName && (dName === patName || dName.includes(patName) || patName.includes(dName))) {
                matchedPkg = d;
                break;
              }
            }
          }

          // 2. Only if not found locally, query Firestore with TARGETED indexed query
          if (!matchedPkg && db && cleanPhone) {
            const qPhone = query(collection(db, 'package_members'), where('phone', '==', cleanPhone), limit(5));
            const snap = await getDocs(qPhone);
            snap.forEach(docSnap => {
              if (matchedPkg) return;
              const d = { id: docSnap.id, ...docSnap.data() } as any;
              const dName = String(d.patientName || d.name || '').trim().toLowerCase();
              if (!patName || dName === patName || dName.includes(patName) || patName.includes(dName)) {
                matchedPkg = d;
              }
            });
          }

          if (matchedPkg) {
            const expTime = matchedPkg.expiryDate ? new Date(matchedPkg.expiryDate).getTime() : Infinity;
            const isExpired = !isNaN(expTime) && expTime < Date.now();
            if (!isExpired) {
              setExistingActivePackage(matchedPkg);
              const total = Number(matchedPkg.totalAmount) || 0;
              const paid = Number(matchedPkg.paidAmount) || 0;
              const remaining = Math.max(0, Number(matchedPkg.remainingAmount ?? (total - paid)));

              setPaymentTypePreset('package');
              setIncludeConsultFee(false);
              setIncludeMedicineFee(false);
              setIncludeDietFee(false);
              setIncludeOtherCharges(false);
              setConsultFeeInput(0);
              setMedicineFeeInput(0);

              if (remaining <= 0) {
                // Fully paid package member: auto ₹0 visit!
                setPackageInstallmentInput(0);
              } else {
                // Pending due on package - default to full remaining due
                setPackageInstallmentInput(remaining);
              }
              return;
            }
          }
          setExistingActivePackage(null);
        } catch (err) {
          console.error("Error loading package membership:", err);
        }
      };

      // Check if patient is in an active duration from previous appointments
      const checkActiveDuration = async () => {
        try {
          const cleanPhone = (appointment.phone || appointment.phoneNumber || '').replace(/\D/g, '').slice(-10);
          const targetDocId = String(appointment.patientDocId || appointment.patient_id || appointment.patientId || appointment.id || '');
          const patName = String(appointment.patientName || appointment.name || '').trim().toLowerCase();
          const cleanReg = String(appointment.regId || appointment.registrationId || appointment.patientId || '').trim().toLowerCase();

          // 1. Check patient visit state using unified multi-collection pool
          try {
            const pool = receptionDataStore.getAllCollectionsPool();
            const pkgs = receptionDataStore.getPackageMembers();
            const visitState = getPatientVisitState(appointment, pool, pkgs);
            if (visitState.type === 'IN_DUR') {
              setActiveDurationInfo({
                duration: visitState.durationLabel || 'Active Duration',
                expiryDate: visitState.expiryDate || '',
                startDate: appointment.durationStartDate || appointment.appointmentDate || new Date().toISOString(),
                daysRemaining: visitState.daysRemaining ?? 0
              });
              if (computedTarget > 0) {
                setTargetAmount(computedTarget);
                setConsultFeeInput(computedTarget);
                setMedicineFeeInput(0);
                setIncludeConsultFee(true);
                setIncludeMedicineFee(false);
              } else {
                setTargetAmount(0);
                setConsultFeeInput(0);
                setMedicineFeeInput(0);
                setIncludeConsultFee(false);
                setIncludeMedicineFee(false);
              }
              return;
            }
          } catch (poolErr) {
            console.warn('Error reading visit state from pool in web checkout:', poolErr);
          }

          // 2. Check current appointment fields first
          const curExpStr = appointment.durationExpiryDate || appointment.medicineDurationExpiryDate || appointment.preferredFollowUpDate || appointment.scheduledDate;
          if (curExpStr) {
            const expTime = new Date(curExpStr).getTime();
            if (!isNaN(expTime) && expTime >= Date.now()) {
              const daysLeft = Math.max(0, Math.ceil((expTime - Date.now()) / (1000 * 60 * 60 * 24)));
              setActiveDurationInfo({
                duration: appointment.medicineDuration || appointment.duration || appointment.followUpInterval || 'Active Duration',
                expiryDate: curExpStr,
                startDate: appointment.durationStartDate || appointment.appointmentDate || new Date().toISOString(),
                daysRemaining: daysLeft
              });
              if (computedTarget > 0) {
                setTargetAmount(computedTarget);
                setConsultFeeInput(computedTarget);
                setMedicineFeeInput(0);
                setIncludeConsultFee(true);
                setIncludeMedicineFee(false);
              } else {
                setTargetAmount(0);
                setConsultFeeInput(0);
                setMedicineFeeInput(0);
                setIncludeConsultFee(false);
                setIncludeMedicineFee(false);
              }
              return;
            }
          }

          // 3. Check past completed appointments from local in-memory pool first (0ms)
          const localPool = receptionDataStore.getAllCollectionsPool() || [];
          const pastList: any[] = [];
          for (const d of localPool) {
            if (d.id === appointment.id) continue;
            if (d.status !== 'completed' && d.paymentStatus !== 'paid') continue;

            const dDocId = String(d.patientDocId || d.patient_id || d.patientId || d.id || '');
            const dReg = String(d.regId || d.registrationId || d.patientId || '').trim().toLowerCase();
            const dPhone = (d.phone || d.phoneNumber || '').replace(/\D/g, '').slice(-10);
            const dName = String(d.patientName || d.name || '').trim().toLowerCase();

            if (targetDocId && (dDocId === targetDocId || d.patientDocId === appointment.id)) pastList.push(d);
            else if (cleanReg && dReg === cleanReg) pastList.push(d);
            else if (cleanPhone && dPhone === cleanPhone && patName && (dName === patName || dName.includes(patName))) pastList.push(d);
          }

          // 4. If not found in local pool, query Firestore WITH TARGETED FILTERS (limit 5) - NEVER download entire collection
          if (pastList.length === 0 && cleanPhone && db) {
            const qPhone = query(collection(db, 'appointments'), where('phone', '==', cleanPhone), limit(5));
            const snap = await getDocs(qPhone);
            snap.forEach(docSnap => {
              if (docSnap.id === appointment.id) return;
              const d = { id: docSnap.id, ...docSnap.data() } as any;
              if (d.status === 'completed' || d.paymentStatus === 'paid') {
                pastList.push(d);
              }
            });
          }

          if (pastList.length > 0) {
            pastList.sort((a, b) => {
              const timeA = new Date(a.paymentCollectedAt || a.completedAt || a.appointmentDate || a.date || a.createdAt || 0).getTime();
              const timeB = new Date(b.paymentCollectedAt || b.completedAt || b.appointmentDate || b.date || b.createdAt || 0).getTime();
              return timeB - timeA;
            });

            const latestPast = pastList[0];
            const pastDur = latestPast.medicineDuration || latestPast.duration || latestPast.packageDuration;
            if (pastDur) {
              const pStart = latestPast.durationStartDate || latestPast.paymentCollectedAt || latestPast.completedAt || latestPast.appointmentDate || latestPast.date || latestPast.createdAt || new Date().toISOString();
              const pExpiry = latestPast.durationExpiryDate
                ? new Date(latestPast.durationExpiryDate)
                : calculateDurationExpiry(pStart, pastDur);

              if (pExpiry.getTime() >= Date.now()) {
                const daysLeft = Math.max(0, Math.ceil((pExpiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
                setActiveDurationInfo({
                  duration: pastDur,
                  expiryDate: pExpiry.toISOString(),
                  startDate: pStart,
                  daysRemaining: daysLeft
                });
                if (computedTarget > 0) {
                  setTargetAmount(computedTarget);
                  setConsultFeeInput(computedTarget);
                  setMedicineFeeInput(0);
                  setIncludeConsultFee(true);
                  setIncludeMedicineFee(false);
                } else {
                  setTargetAmount(0);
                  setConsultFeeInput(0);
                  setMedicineFeeInput(0);
                  setIncludeConsultFee(false);
                  setIncludeMedicineFee(false);
                }
                return;
              }
            }
          }
          setActiveDurationInfo(null);
        } catch (e) {
          console.warn("Error checking active duration in checkout:", e);
        }
      };

      checkPackage();
      checkActiveDuration();
    }
  }, [appointment]);

  const handlePresetSelect = (preset: 'consultation' | 'consultation_med' | 'split' | 'package') => {
    setPaymentTypePreset(preset);
    const currTarget = targetAmount > 0
      ? targetAmount
      : (Number((appointment as any)?.targetAmount ?? (appointment as any)?.target_amount) || 0);
    const defaultConsult = Number((appointment as any)?.consultationFee) || 0;

    if (preset === 'consultation') {
      // 100% of target amount goes directly into Consultation Fee (No Prescribed Medicines)
      setIncludeConsultFee(true);
      setIncludeMedicineFee(false);
      setConsultFeeInput(currTarget);
      setMedicineFeeInput(0);
      setMedicineItems([]);
    } else if (preset === 'consultation_med') {
      // Direct into combined Consultation & Medicine fee (No prescribed medicine item breakdown needed)
      setIncludeConsultFee(true);
      setIncludeMedicineFee(false);
      setConsultFeeInput(currTarget);
      setMedicineFeeInput(0);
      setMedicineItems([]);
    } else if (preset === 'split') {
      // Split wants BOTH Consultation Fee AND Prescribed Medicines Fee with itemized medicines
      setIncludeConsultFee(true);
      setIncludeMedicineFee(true);
      setSelectedPaymentMode('Split');
      // Target is split strictly between consultation & medicine so consultation + medicine = currTarget
      const defaultC = defaultConsult > 0 && defaultConsult < currTarget ? defaultConsult : Math.round(currTarget / 2);
      const cPortion = defaultC;
      const mPortion = Math.max(0, currTarget - cPortion);
      setConsultFeeInput(cPortion);
      setMedicineFeeInput(mPortion);
      if (mPortion > 0) {
        if (medicineItems.length === 0) {
          setMedicineItems([{ id: '1', name: '', amount: mPortion, timing: '', type: 'Pills' }]);
        } else if (medicineItems.length === 1) {
          setMedicineItems([{ ...medicineItems[0], amount: mPortion }]);
        } else {
          const currentSum = medicineItems.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
          if (currentSum > mPortion) {
            let runningTotal = 0;
            const adjusted = medicineItems.map(item => {
              const itemAmt = Number(item.amount) || 0;
              const allowed = Math.max(0, Math.min(itemAmt, mPortion - runningTotal));
              runningTotal += allowed;
              return { ...item, amount: allowed };
            });
            setMedicineItems(adjusted);
          }
        }
      } else {
        setMedicineItems([{ id: '1', name: '', amount: 0, timing: '', type: 'Pills' }]);
      }
    } else if (preset === 'package') {
      setIncludeConsultFee(false);
      setIncludeMedicineFee(false);
      setIncludeDietFee(false);
      setIncludeOtherCharges(false);
      if (existingActivePackage) {
        const total = Number(existingActivePackage.totalAmount) || 0;
        const paid = Number(existingActivePackage.paidAmount) || 0;
        const rem = Math.max(0, Number(existingActivePackage.remainingAmount ?? (total - paid)));
        if (rem > 0) {
          setPackageInstallmentInput(rem > 1000 ? 1000 : rem);
        }
      } else {
        const presPkgTotal = Number((appointment as any)?.packageTotalAmount) || '';
        const presPkgAdvance = Number((appointment as any)?.packageAdvancePaid ?? (appointment as any)?.packageFee) || '';
        setPackageTotalAmountInput(presPkgTotal);
        setPackageAdvancePaidInput(presPkgAdvance);
        setPackageDurationInput((appointment as any)?.packageDuration || '3 Months');
      }
    }
  };

  const handleAddMedicineRow = () => {
    const updated = [...medicineItems];
    updated.push({
      id: String(Date.now()),
      name: '',
      amount: 0,
      timing: '',
      type: 'Pills'
    });

    setMedicineItems(updated);
  };

  const handleRemoveMedicineItem = (idx: number) => {
    const remaining = medicineItems.filter((_, i) => i !== idx);
    setMedicineItems(remaining);
  };

  const handleUpdateMedicineItem = (idx: number, field: 'name' | 'amount' | 'timing' | 'type', val: any) => {
    const updated = [...medicineItems];
    if (field !== 'amount') {
      updated[idx] = { ...updated[idx], [field]: val };
      setMedicineItems(updated);
      return;
    }

    const numVal = Math.max(0, Number(val) || 0);
    const allocated = Number(medicineFeeInput) > 0 ? Number(medicineFeeInput) : (targetAmount > 0 ? targetAmount : 0);

    // Sum of all other medicine items
    const otherSum = updated.reduce((acc, curr, i) => i !== idx ? acc + (Number(curr.amount) || 0) : acc, 0);

    if (allocated > 0) {
      const maxAllowed = Math.max(0, allocated - otherSum);
      const safeVal = Math.min(numVal, maxAllowed);
      updated[idx] = { ...updated[idx], amount: safeVal };
    } else {
      updated[idx] = { ...updated[idx], amount: numVal };
    }

    setMedicineItems(updated);
  };

  const handleTargetAmountChange = (newTarget: number) => {
    setTargetAmount(newTarget);
    const defaultConsult = Number((appointment as any)?.consultationFee) || 0;
    if (paymentTypePreset === 'package') {
      return;
    }
    if (newTarget > 0) {
      if (paymentTypePreset === 'consultation' || paymentTypePreset === 'consultation_med') {
        setConsultFeeInput(newTarget);
        setMedicineFeeInput(0);
        setMedicineItems([]);
        setIncludeConsultFee(true);
        setIncludeMedicineFee(false);
      } else if (paymentTypePreset === 'split' || (includeMedicineFee && includeConsultFee)) {
        const cPortion = defaultConsult > 0 && defaultConsult < newTarget ? defaultConsult : Math.round(newTarget / 2);
        const mPortion = Math.max(0, newTarget - cPortion);
        setConsultFeeInput(cPortion);
        setMedicineFeeInput(mPortion);
        setIncludeConsultFee(true);
        setIncludeMedicineFee(true);
        if (mPortion > 0) {
          if (medicineItems.length === 0) {
            setMedicineItems([{ id: '1', name: '', amount: mPortion, timing: '', type: 'Pills' }]);
          } else if (medicineItems.length === 1) {
            setMedicineItems([{ ...medicineItems[0], amount: mPortion }]);
          } else {
            const currentSum = medicineItems.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
            if (currentSum > mPortion) {
              let runningTotal = 0;
              const adjusted = medicineItems.map(item => {
                const itemAmt = Number(item.amount) || 0;
                const allowed = Math.max(0, Math.min(itemAmt, mPortion - runningTotal));
                runningTotal += allowed;
                return { ...item, amount: allowed };
              });
              setMedicineItems(adjusted);
            }
          }
        }
      } else if (includeMedicineFee) {
        setMedicineFeeInput(newTarget);
        setConsultFeeInput(0);
        if (medicineItems.length === 0) {
          setMedicineItems([{ id: '1', name: '', amount: newTarget, timing: '', type: 'Pills' }]);
        } else if (medicineItems.length === 1) {
          setMedicineItems([{ ...medicineItems[0], amount: newTarget }]);
        } else {
          const currentSum = medicineItems.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
          if (currentSum > newTarget) {
            let runningTotal = 0;
            const adjusted = medicineItems.map(item => {
              const itemAmt = Number(item.amount) || 0;
              const allowed = Math.max(0, Math.min(itemAmt, newTarget - runningTotal));
              runningTotal += allowed;
              return { ...item, amount: allowed };
            });
            setMedicineItems(adjusted);
          }
        }
      } else {
        setConsultFeeInput(newTarget);
        setMedicineFeeInput(0);
        setMedicineItems([]);
      }
    } else {
      setConsultFeeInput(0);
      setMedicineFeeInput(0);
      setMedicineItems([]);
    }
  };

  const handleConsultFeeChange = (val: number) => {
    const safeTarget = targetAmount > 0 ? targetAmount : val;
    const cappedVal = targetAmount > 0 ? Math.min(val, safeTarget) : val;
    setConsultFeeInput(cappedVal);
    if (cappedVal > 0) {
      setIncludeConsultFee(true);
    }
    if (paymentTypePreset !== 'consultation_med' && includeMedicineFee && targetAmount > 0) {
      const mPortion = Math.max(0, targetAmount - cappedVal);
      setMedicineFeeInput(mPortion);
      if (medicineItems.length === 0) {
        setMedicineItems([{ id: '1', name: '', amount: mPortion, timing: '', type: 'Pills' }]);
      } else if (medicineItems.length === 1) {
        setMedicineItems([{ ...medicineItems[0], amount: mPortion }]);
      } else {
        const currentSum = medicineItems.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
        if (currentSum > mPortion) {
          let runningTotal = 0;
          const adjusted = medicineItems.map(item => {
            const itemAmt = Number(item.amount) || 0;
            const allowed = Math.max(0, Math.min(itemAmt, mPortion - runningTotal));
            runningTotal += allowed;
            return { ...item, amount: allowed };
          });
          setMedicineItems(adjusted);
        }
      }
    }
  };

  const handleMedicineFeeChange = (val: number) => {
    if (paymentTypePreset === 'consultation_med') return;
    const safeTarget = targetAmount > 0 ? targetAmount : val;
    const cappedVal = targetAmount > 0 ? Math.min(val, safeTarget) : val;
    setMedicineFeeInput(cappedVal);
    if (cappedVal > 0) {
      setIncludeMedicineFee(true);
    }
    if (includeConsultFee && targetAmount > 0) {
      setConsultFeeInput(Math.max(0, targetAmount - cappedVal));
    }
    if (medicineItems.length === 0) {
      if (cappedVal > 0) {
        setMedicineItems([{ id: '1', name: '', amount: cappedVal, timing: '', type: 'Pills' }]);
      }
    } else if (medicineItems.length === 1) {
      setMedicineItems([{ ...medicineItems[0], amount: cappedVal }]);
    } else {
      const currentSum = medicineItems.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
      if (currentSum > cappedVal) {
        let runningTotal = 0;
        const adjusted = medicineItems.map(item => {
          const itemAmt = Number(item.amount) || 0;
          const allowed = Math.max(0, Math.min(itemAmt, cappedVal - runningTotal));
          runningTotal += allowed;
          return { ...item, amount: allowed };
        });
        setMedicineItems(adjusted);
      }
    }
  };

  const activeConsultFee = includeConsultFee ? consultFeeInput : 0;
  const activeMedicineFee = includeMedicineFee ? medicineFeeInput : 0;
  const activeDietFee = includeDietFee ? dietFeeInput : 0;
  const activeOtherCharges = includeOtherCharges ? otherChargesInput : 0;

  const isPackageCoveredFully = Boolean(
    existingActivePackage &&
    Number(existingActivePackage.remainingAmount ?? (Number(existingActivePackage.totalAmount) - Number(existingActivePackage.paidAmount))) <= 0
  );

  const effectiveDiscount = discountRequestStatus === 'approved'
    ? Number(approvedDiscountAmount || discountInput)
    : 0;

  let totalAmountDue = 0;
  if (isPackageCoveredFully) {
    totalAmountDue = 0;
  } else if (existingActivePackage && Number(existingActivePackage.remainingAmount) > 0 && paymentTypePreset === 'package') {
    totalAmountDue = Math.max(0, Number(packageInstallmentInput) || 0);
  } else if (paymentTypePreset === 'package') {
    totalAmountDue = Math.max(0, Number(packageAdvancePaidInput) || 0);
  } else {
    totalAmountDue = Math.max(
      0,
      activeConsultFee + activeMedicineFee + activeDietFee + activeOtherCharges - effectiveDiscount
    );
  }

  // Dynamic Razorpay UPI QR Code State
  const [upiQrLoading, setUpiQrLoading] = useState<boolean>(false);
  const [upiQrData, setUpiQrData] = useState<QrCodeResult | null>(null);
  const [upiQrChecking, setUpiQrChecking] = useState<boolean>(false);
  const [upiQrPaid, setUpiQrPaid] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  const generateUpiQr = async (forceAmount?: number) => {
    const amt = typeof forceAmount === 'number' ? forceAmount : totalAmountDue;
    if (amt <= 0) return;
    setUpiQrLoading(true);
    setUpiQrPaid(false);
    try {
      const pName = patientName || 'Patient';
      const pPhone = patientPhone || '';
      const bName = (appointment as any)?.branch || (appointment as any)?.branchName || 'Spiritual Homeopathy';
      const invId = appointment?.id || `INV-${Date.now().toString().slice(-6)}`;
      const result = await createRazorpayPaymentQr({
        amount: amt,
        patientName: pName,
        phone: pPhone,
        branch: bName,
        invoiceId: invId,
        description: `Consultation - ${pName}`
      });
      setUpiQrData(result);
    } catch (e) {
      console.warn('[UPI QR] Error generating:', e);
    } finally {
      setUpiQrLoading(false);
    }
  };

  const handleVerifyUpiPayment = async () => {
    if (!upiQrData?.qrId) {
      alert('No active payment ID to check.');
      return;
    }
    setUpiQrChecking(true);
    try {
      const res = await checkRazorpayPaymentStatus(upiQrData.qrId);
      if (res.isPaid) {
        setUpiQrPaid(true);
        handleConfirmCheckout();
      } else {
        alert('⏳ Payment Pending\n\nPayment has not been completed yet. Please ask the patient to approve the transaction in their UPI app (GPay / PhonePe / Paytm).');
      }
    } catch (e) {
      alert('Could not verify status automatically. If the patient has paid and you see the confirmation, you may proceed.');
    } finally {
      setUpiQrChecking(false);
    }
  };

  useEffect(() => {
    if (discountRequestStatus === 'pending') return;
    if (selectedPaymentMode === 'UPI / QR Code' && totalAmountDue > 0) {
      if (!upiQrData || upiQrData.amount !== totalAmountDue) {
        generateUpiQr(totalAmountDue);
      }
    }
  }, [selectedPaymentMode, totalAmountDue, discountRequestStatus]);

  useEffect(() => {
    if (selectedPaymentMode !== 'UPI / QR Code' || !upiQrData?.qrId || upiQrPaid) return;
    const interval = setInterval(async () => {
      try {
        const res = await checkRazorpayPaymentStatus(upiQrData.qrId!);
        if (res.isPaid) {
          setUpiQrPaid(true);
          clearInterval(interval);
          handleConfirmCheckout();
        }
      } catch (_) {}
    }, 4000);
    return () => clearInterval(interval);
  }, [selectedPaymentMode, upiQrData?.qrId, upiQrPaid]);

  // Card & Split Razorpay Payment States
  const [cardPaymentId, setCardPaymentId] = useState<string>('');
  const [cardLast4, setCardLast4] = useState<string>('');
  const [cardAuthRef, setCardAuthRef] = useState<string>('');
  const [cardIsProcessing, setCardIsProcessing] = useState<boolean>(false);
  const [cardPaidSuccess, setCardPaidSuccess] = useState<boolean>(false);

  // Split specific Razorpay UPI State
  const [splitUpiQrLoading, setSplitUpiQrLoading] = useState<boolean>(false);
  const [splitUpiQrData, setSplitUpiQrData] = useState<QrCodeResult | null>(null);
  const [splitUpiQrPaid, setSplitUpiQrPaid] = useState<boolean>(false);

  // Split amounts
  const isSplitUpi = selectedPaymentMode === 'Split' && (splitMethod1 === 'UPI' || splitMethod2 === 'UPI');
  const splitUpiAmount = isSplitUpi ? ((splitMethod1 === 'UPI' ? Number(splitAmount1) : Number(splitAmount2)) || 0) : 0;

  const isSplitCard = selectedPaymentMode === 'Split' && (splitMethod1 === 'Card' || splitMethod2 === 'Card');
  const splitCardAmount = isSplitCard ? ((splitMethod1 === 'Card' ? Number(splitAmount1) : Number(splitAmount2)) || 0) : 0;

  const generateSplitUpiQr = async (amt: number) => {
    if (amt <= 0) return;
    setSplitUpiQrLoading(true);
    setSplitUpiQrPaid(false);
    try {
      const pName = patientName || 'Patient';
      const pPhone = patientPhone || '';
      const bName = (appointment as any)?.branch || (appointment as any)?.branchName || 'Spiritual Homeopathy';
      const invId = appointment?.id || `INV-${Date.now().toString().slice(-6)}`;
      const result = await createRazorpayPaymentQr({
        amount: amt,
        patientName: pName,
        phone: pPhone,
        branch: bName,
        invoiceId: invId,
        description: `Split UPI - ${pName}`
      });
      setSplitUpiQrData(result);
    } catch (e) {
      console.warn('[Split UPI QR] error:', e);
    } finally {
      setSplitUpiQrLoading(false);
    }
  };

  useEffect(() => {
    if (isSplitUpi && splitUpiAmount > 0) {
      if (!splitUpiQrData || splitUpiQrData.amount !== splitUpiAmount) {
        generateSplitUpiQr(splitUpiAmount);
      }
    }
  }, [isSplitUpi, splitUpiAmount]);

  useEffect(() => {
    if (!isSplitUpi || !splitUpiQrData?.qrId || splitUpiQrPaid) return;
    const interval = setInterval(async () => {
      try {
        const res = await checkRazorpayPaymentStatus(splitUpiQrData.qrId!);
        if (res.isPaid) {
          setSplitUpiQrPaid(true);
          clearInterval(interval);
        }
      } catch (_) {}
    }, 4000);
    return () => clearInterval(interval);
  }, [isSplitUpi, splitUpiQrData?.qrId, splitUpiQrPaid]);

  const handleLaunchCardCheckout = async (targetAmt?: number) => {
    const amt = typeof targetAmt === 'number' ? targetAmt : (selectedPaymentMode === 'Card' ? totalAmountDue : splitCardAmount);
    if (amt <= 0) {
      alert('Please enter a valid amount for Card payment.');
      return;
    }
    setCardIsProcessing(true);
    try {
      const pName = patientName || 'Patient';
      const pPhone = patientPhone || '';
      const bName = (appointment as any)?.branch || (appointment as any)?.branchName || 'Spiritual Homeopathy';
      await launchRazorpayCardCheckout({
        amount: amt,
        patientName: pName,
        phone: pPhone,
        branch: bName,
        invoiceId: appointment?.id,
        onSuccess: (paymentId: string) => {
          setCardPaymentId(paymentId);
          setCardPaidSuccess(true);
          setCardIsProcessing(false);
          alert(`✅ Card Payment of ₹${amt} Successful!\n\nRazorpay Payment ID: ${paymentId}\n\nYou may now complete the checkout.`);
        },
        onError: (err: any) => {
          setCardIsProcessing(false);
          alert(`Card Payment Error: ${err?.description || 'Payment was cancelled or declined'}`);
        }
      });
    } catch (e: any) {
      setCardIsProcessing(false);
      alert('Could not initiate card payment.');
    }
  };

  const handleSubmitDiscountRequest = async () => {
    if (!appointment || !db) return;
    const targetId = appointment.id || (appointment as any).patientDocId || (appointment as any).patientId;
    if (!targetId) return;

    if (requestedDiscountAmount <= 0) {
      alert('Please enter a valid discount amount greater than 0.');
      return;
    }
    if (!discountReason || !discountReason.trim()) {
      alert('Please enter a note / reason for requesting the discount (Mandatory).');
      return;
    }

    const currentTotalBeforeDiscount = activeConsultFee + activeMedicineFee + activeDietFee + activeOtherCharges;
    if (requestedDiscountAmount > currentTotalBeforeDiscount) {
      alert(`Requested discount (₹${requestedDiscountAmount}) cannot exceed the total bill amount (₹${currentTotalBeforeDiscount}).`);
      return;
    }

    setIsSubmittingDiscountRequest(true);
    try {
      const nowIso = new Date().toISOString();
      const requestPayload = {
        appointmentId: targetId,
        patientDocId: (appointment as any).patientDocId || targetId,
        patientName: patientName,
        patientPhone: patientPhone,
        branch: (appointment as any).branch || (appointment as any).branchName || 'Main Branch',
        branchId: resolveCanonicalBranchId((appointment as any).branch || (appointment as any).branchName),
        originalTotalAmount: currentTotalBeforeDiscount,
        requestedDiscount: requestedDiscountAmount,
        reason: discountReason.trim(),
        status: 'pending',
        createdAt: nowIso,
        requestedAt: nowIso,
        requestedBy: 'Reception',
        type: 'medicine_discount'
      };

      const docRef = await addDoc(collection(db, 'fee_requests'), requestPayload);
      setDiscountRequestId(docRef.id);
      setDiscountRequestStatus('pending');
      setShowDiscountInput(false);

      // Dual-sync to appointment doc
      const updatePayload = {
        discountRequestId: docRef.id,
        discountRequestStatus: 'pending',
        requestedDiscount: requestedDiscountAmount,
        discountReason: discountReason.trim(),
        discount: 0,
        discountInput: 0,
        updatedAt: nowIso
      };
      await updateDoc(doc(db, 'appointments', targetId), updatePayload).catch(() => { });
      await updateDoc(doc(db, 'allpatients', targetId), updatePayload).catch(() => { });
      await updateDoc(doc(db, 'patients', targetId), updatePayload).catch(() => { });

      // Send Push & In-App Notification to HR & Admin
      createFeeDiscountRequestNotificationInFirestore({
        patientName: patientName,
        patientPhone: patientPhone,
        branch: requestPayload.branch,
        requestedDiscount: requestedDiscountAmount,
        originalTotalAmount: currentTotalBeforeDiscount,
        reason: discountReason.trim(),
        appointmentId: targetId
      }).catch(() => { });

      alert('✓ Discount request successfully submitted to HR for approval!\n\nStatus is currently PENDING. The discount will only be applied to the bill once HR reviews and approves.');
    } catch (err: any) {
      console.error('Error submitting discount request:', err);
      alert('Failed to submit discount request. Please try again.');
    } finally {
      setIsSubmittingDiscountRequest(false);
    }
  };

  const hasPrescription = uploadedPrescriptionList.length > 0 || Boolean((appointment as any)?.canvasPrescriptionUrl) || Boolean((appointment as any)?.prescriptionUrl);

  const handleConfirmCheckout = async () => {
    if (!appointment) return;
    if (!hasPrescription) {
      alert('⚠️ Prescription Required (Mandatory)\n\nClinic policy strictly requires a prescription to be uploaded before fee collection. Please upload or attach the prescription photo before proceeding.');
      prescriptionSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
      return;
    }

    // 1. Mandatory Payment Method Validation
    if (!isPackageCoveredFully && totalAmountDue > 0) {
      if (!selectedPaymentMode || selectedPaymentMode.trim() === '') {
        alert('⚠️ Payment Method Required (Mandatory)\n\nPlease select a payment method (Cash, UPI, Card, Net Banking, or Split) before completing the payment.');
        return;
      }

      if (selectedPaymentMode === 'Split') {
        const amt1 = Number(splitAmount1) || 0;
        const amt2 = Number(splitAmount2) || 0;
        if (!splitMethod1 || !splitMethod2 || amt1 <= 0 || amt2 <= 0) {
          alert('⚠️ Invalid Split Payment\n\nPlease select both payment methods and enter valid positive amounts for both split payment methods.');
          return;
        }
        if (Math.abs((amt1 + amt2) - totalAmountDue) > 0.01) {
          alert(`⚠️ Split Payment Mismatch\n\nThe sum of split amounts (₹${amt1} + ₹${amt2} = ₹${amt1 + amt2}) must equal the total amount due (₹${totalAmountDue}).`);
          return;
        }
      }
    }

    // 2. Pending HR Discount Block (Cannot skip or complete payment while pending HR approval)
    if (discountRequestStatus === 'pending') {
      alert(`⛔ Cannot Complete Payment\n\nA discount request of ₹${requestedDiscountAmount || '...'} is currently pending HR approval.\n\nPayment cannot be completed until HR accepts or rejects this discount request.`);
      return;
    }

    setIsLoading(true);
    const finalPaymentMode =
      totalAmountDue === 0
        ? 'Package Covered'
        : selectedPaymentMode === 'Split'
          ? `Split (${splitMethod1} ₹${Number(splitAmount1) || 0} + ${splitMethod2} ₹${Number(splitAmount2) || 0})`
          : selectedPaymentMode;

    const payload: any = {
      status: 'completed',
      paymentStatus: 'paid',
      paymentPending: false,
      feeCollectionNeeded: false,
      paymentCollectedAt: new Date().toISOString(),
      paymentTypePreset: paymentTypePreset,
      consultationFee: isPackageCoveredFully || paymentTypePreset === 'package' ? 0 : activeConsultFee,
      medicineFee: isPackageCoveredFully || paymentTypePreset === 'package' ? 0 : activeMedicineFee,
      medicines: includeMedicineFee ? medicineItems : [],
      medicineDuration: includeMedicineFee ? medicineDuration : null,
      dietFee: isPackageCoveredFully || paymentTypePreset === 'package' ? 0 : activeDietFee,
      otherCharges: isPackageCoveredFully || paymentTypePreset === 'package' ? 0 : activeOtherCharges,
      discount: effectiveDiscount,
      discountRequestStatus: discountRequestStatus,
      discountReason: discountReason || '',
      discountRequestId: discountRequestId || null,
      targetAmount: paymentTypePreset === 'package' ? totalAmountDue : targetAmount,
      totalPaid: totalAmountDue,
      paymentMode: finalPaymentMode,
      uploadedPrescriptions: uploadedPrescriptionList,
      hasPrescription: true,
      prescriptionVerified: true,
      prescriptionVerifiedAt: new Date().toISOString(),
      cardPaymentId: cardPaymentId || null,
      cardLast4: cardLast4 || null,
      cardAuthRef: cardAuthRef || null,
      updatedAt: new Date().toISOString()
    };

    if (isPackageCoveredFully) {
      payload.isPackageMember = true;
      payload.hasActivePackage = true;
      payload.packageFee = 0;
      payload.packageDuration = existingActivePackage?.duration || '3 Months';
      payload.packageTotalAmount = Number(existingActivePackage?.totalAmount || 0);
      payload.packageAdvancePaid = Number(existingActivePackage?.paidAmount || 0);
      payload.packageRemainingAmount = 0;
      payload.notes = 'Package Covered Visit (₹0)';
    } else if (existingActivePackage && paymentTypePreset === 'package') {
      const curPaid = Number(existingActivePackage.paidAmount || 0);
      const curTot = Number(existingActivePackage.totalAmount || 0);
      const newPaid = curPaid + totalAmountDue;
      const newRem = Math.max(0, curTot - newPaid);
      payload.isPackageMember = true;
      payload.hasActivePackage = true;
      payload.packageFee = totalAmountDue;
      payload.packageDuration = existingActivePackage.duration || '3 Months';
      payload.packageTotalAmount = curTot;
      payload.packageAdvancePaid = newPaid;
      payload.packageRemainingAmount = newRem;
      payload.notes = `Package Due Payment: ₹${totalAmountDue}`;
    } else if (paymentTypePreset === 'package') {
      const pkgTot = Number(packageTotalAmountInput) || totalAmountDue;
      const pkgRem = Math.max(0, pkgTot - totalAmountDue);
      payload.isPackageMember = true;
      payload.hasActivePackage = true;
      payload.packageFee = totalAmountDue;
      payload.packageDuration = packageDurationInput || '3 Months';
      payload.packageTotalAmount = pkgTot;
      payload.packageAdvancePaid = totalAmountDue;
      payload.packageRemainingAmount = pkgRem;
      payload.notes = `Package Advance: ₹${totalAmountDue} of ₹${pkgTot}`;
    } else if (activeDurationInfo && totalAmountDue === 0) {
      payload.durationStartDate = activeDurationInfo.startDate;
      payload.durationExpiryDate = activeDurationInfo.expiryDate;
      payload.medicineDuration = activeDurationInfo.duration;
      payload.isFollowUp = true;
      payload.patientType = 'in_duration_followup';
      payload.notes = `In-Duration Follow-up Visit (₹0 Covered • ${activeDurationInfo.duration})`;
    } else if (activeDurationInfo && totalAmountDue > 0 && !medicineDuration) {
      payload.durationStartDate = activeDurationInfo.startDate;
      payload.durationExpiryDate = activeDurationInfo.expiryDate;
      payload.medicineDuration = activeDurationInfo.duration;
      payload.isFollowUp = true;
      payload.notes = `In-Duration Follow-up (Paid ₹${totalAmountDue} • ${activeDurationInfo.duration})`;
    } else if (medicineDuration || (appointment as any)?.medicineDuration) {
      const chosenDur = medicineDuration || (appointment as any)?.medicineDuration || '1 Month';
      const expDate = calculateDurationExpiry(new Date(), chosenDur);
      payload.durationStartDate = new Date().toISOString();
      payload.durationExpiryDate = expDate.toISOString();
      payload.medicineDuration = chosenDur;
      payload.isFollowUp = true;
    }

    try {
      await updateDoc(doc(db, 'appointments', appointment.id), payload).catch(() => { });
      await updateDoc(doc(db, 'allpatients', appointment.id), payload).catch(() => { });
      await updateDoc(doc(db, 'patients', appointment.id), payload).catch(() => { });

      // Record transaction in alltransactions for instant real-time audit & revenue ledger
      if (totalAmountDue > 0 && db) {
        addDoc(collection(db, 'alltransactions'), {
          appointmentId: appointment.id,
          patientDocId: (appointment as any).patientDocId || appointment.id,
          patientId: (appointment as any).regId || (appointment as any).registrationId || (appointment as any).patientId || appointment.id,
          patientName: patientName || 'Patient',
          phone: patientPhone || '',
          branchName: (appointment as any).branch || (appointment as any).branchName || 'KPHB',
          doctorName: appointment.doctorName || appointment.doctor || 'Dr. Prashanth K Vaidya',
          amount: totalAmountDue,
          totalAmount: totalAmountDue,
          consultationFee: isPackageCoveredFully || paymentTypePreset === 'package' ? 0 : activeConsultFee,
          medicineFee: isPackageCoveredFully || paymentTypePreset === 'package' ? 0 : activeMedicineFee,
          packageFee: paymentTypePreset === 'package' ? totalAmountDue : 0,
          dietFee: activeDietFee,
          paymentMethod: selectedPaymentMode.toLowerCase(),
          paymentMode: finalPaymentMode,
          revenueSplit: paymentTypePreset === 'package' ? 'Package' : (activeMedicineFee > 0 ? 'Consultation & Medicine Fee' : 'Consultation'),
          source: (appointment as any).marketingSource || (appointment as any).source || 'Walk-in',
          status: 'PAID',
          createdAt: new Date().toISOString(),
          paymentCollectedAt: new Date().toISOString()
        }).catch(() => { });
      }

      // Atomically increment branch target reached in real-time
      if (totalAmountDue > 0 && db) {
        const rawBranch = String(appointment.branch || appointment.branchName || 'kphb').toLowerCase();
        const bKey = rawBranch.includes('nalla') ? 'nallagandla'
          : rawBranch.includes('dilshuk') ? 'dilshuknagar'
          : rawBranch.includes('chanda') ? 'chandanagar'
          : 'kphb';

        updateDoc(doc(db, 'branchTargets', bKey), {
          targetReached: increment(totalAmountDue),
          updatedAt: new Date().toISOString()
        }).catch(() => { });
      }

      // Ensure prescription record is saved in prescriptions collection
      if (uploadedPrescriptionList.length > 0 && db) {
        addDoc(collection(db, 'prescriptions'), {
          appointmentId: appointment.id,
          patientId: appointment.id,
          patientName: patientName,
          phone: patientPhone,
          doctorName: appointment.doctorName || appointment.doctor || 'Dr. Prashanth K Vaidya',
          branch: appointment.branch || 'KPHB',
          uploadedPrescriptions: uploadedPrescriptionList,
          uploadedBy: 'Receptionist',
          createdAt: new Date().toISOString()
        }).catch(() => { });
      }

      // Package Members Collection Updates
      if (existingActivePackage && paymentTypePreset === 'package' && totalAmountDue > 0) {
        const curPaid = Number(existingActivePackage.paidAmount || 0);
        const curTot = Number(existingActivePackage.totalAmount || 0);
        const newPaid = curPaid + totalAmountDue;
        const newRem = Math.max(0, curTot - newPaid);

        await updateDoc(doc(db, 'package_members', existingActivePackage.id), {
          paidAmount: newPaid,
          remainingAmount: newRem,
          status: 'Active',
          updatedAt: new Date().toISOString(),
          paymentHistory: [
            ...(existingActivePackage.paymentHistory || []),
            {
              date: new Date().toISOString(),
              amount: totalAmountDue,
              paymentMode: finalPaymentMode,
              note: `Package Due Payment`,
              invoiceId: appointment.id
            }
          ]
        }).catch(e => console.error('Error updating package_members:', e));
      } else if (!existingActivePackage && paymentTypePreset === 'package') {
        let months = 3;
        if (packageDurationInput.includes('1 Month')) months = 1;
        else if (packageDurationInput.includes('2 Month')) months = 2;
        else if (packageDurationInput.includes('3 Month')) months = 3;
        else if (packageDurationInput.includes('4 Month')) months = 4;
        else if (packageDurationInput.includes('5 Month')) months = 5;
        else if (packageDurationInput.includes('6 Month')) months = 6;
        else if (packageDurationInput.includes('1 Year')) months = 12;

        const startDate = new Date();
        const expiryDate = new Date(startDate);
        expiryDate.setMonth(expiryDate.getMonth() + months);

        const cleanReg = appointment.regId || appointment.registrationId || appointment.patientId || `SPH-${Date.now().toString().slice(-4)}`;
        const targetDocId = String(appointment.patientDocId || appointment.id);
        const pkgDocId = `PKG_${targetDocId.replace(/\W/g, '_')}`;

        const newPkgData = {
          id: pkgDocId,
          patientDocId: targetDocId,
          patientId: cleanReg,
          patientName: appointment.patientName || appointment.name || 'Patient',
          phone: (appointment.phone || appointment.phoneNumber || '').replace(/\D/g, '').slice(-10),
          branch: appointment.branch || 'KPHB Branch',
          branchName: appointment.branch || 'KPHB Branch',
          doctorName: appointment.doctorName || appointment.doctor || 'Dr. Prashanth k vaidya',
          packageName: 'Package',
          duration: packageDurationInput,
          durationMonths: months,
          startDate: startDate.toISOString(),
          paymentDate: startDate.toISOString(),
          expiryDate: expiryDate.toISOString(),
          totalAmount: Number(packageTotalAmountInput) || 0,
          paidAmount: Number(packageAdvancePaidInput) || 0,
          remainingAmount: Math.max(0, (Number(packageTotalAmountInput) || 0) - (Number(packageAdvancePaidInput) || 0)),
          status: 'Active',
          paymentHistory: [
            {
              date: startDate.toISOString(),
              amount: Number(packageAdvancePaidInput) || 0,
              paymentMode: finalPaymentMode,
              note: 'Initial Package Advance',
              invoiceId: appointment.id
            }
          ],
          createdAt: startDate.toISOString(),
          updatedAt: startDate.toISOString()
        };

        await setDoc(doc(db, 'package_members', pkgDocId), newPkgData).catch(e => console.error('Error creating package member:', e));
      }

      // Build structured invoice line items
      const webInvoiceItems: any[] = [];
      const isPkg = isPackageCoveredFully || paymentTypePreset === 'package';
      if (!isPkg && Number(activeConsultFee) > 0) {
        webInvoiceItems.push({ description: 'Consultation & Clinical Evaluation', amount: Number(activeConsultFee) });
      }
      if (includeMedicineFee && medicineItems && medicineItems.length > 0) {
        medicineItems.forEach((m: any) => {
          webInvoiceItems.push({
            description: `${m.name || 'Medicine'}${m.type && m.type.trim() ? ` [${m.type.trim()}]` : ''}${m.timing ? ` [${m.timing.trim()}]` : ''}`,
            amount: Number(m.amount || 0)
          });
        });
      } else if (!isPkg && Number(activeMedicineFee) > 0) {
        webInvoiceItems.push({
          description: `Medicine Fee${medicineDuration ? ` (${medicineDuration})` : ''}`,
          amount: Number(activeMedicineFee)
        });
      }
      if (!isPkg && Number(activeDietFee) > 0) {
        webInvoiceItems.push({ description: 'Diet & Nutrition Fee', amount: Number(activeDietFee) });
      }
      if (isPkg) {
        webInvoiceItems.push({ description: 'Homeopathy Healthcare Package', amount: totalAmountDue });
      }
      if (webInvoiceItems.length === 0) {
        webInvoiceItems.push({ description: 'Homeopathy Clinical Consultation & Care', amount: totalAmountDue });
      }

      // Trigger Leonas WhatsApp Invoice / Payment Receipt Notification
      if (totalAmountDue > 0) {
        sendInvoiceWhatsAppNotification({
          patientName: appointment.patientName || appointment.name || 'Patient',
          phone: appointment.phone || appointment.phoneNumber || '',
          invoiceId: appointment.id,
          totalPaid: totalAmountDue,
          paymentMode: finalPaymentMode,
          branch: appointment.branch || 'KPHB',
          doctorName: appointment.doctorName || appointment.doctor || 'Dr. Prashanth K Vaidya',
          items: webInvoiceItems
        }).then(res => {
          const generatedPdfUrl = (res as any)?.pdfUrl;
          if (generatedPdfUrl && db) {
            updateDoc(doc(db, 'appointments', appointment.id), { invoicePdfUrl: generatedPdfUrl }).catch(() => {});
            updateDoc(doc(db, 'allpatients', appointment.id), { invoicePdfUrl: generatedPdfUrl }).catch(() => {});
          }
        }).catch(err => console.error('WhatsApp invoice notification error:', err));

        // Trigger Payment Notification in Firestore for HR (all branches) & Branch Reception
        createPaymentNotificationInFirestore({
          patientName: appointment.patientName || appointment.name || 'Patient',
          amount: totalAmountDue,
          branch: appointment.branch || 'KPHB',
          paymentMode: finalPaymentMode,
          doctorName: appointment.doctorName || appointment.doctor || '',
          invoiceId: appointment.id,
        }).catch(err => console.error('Payment notification error:', err));
      }

      const completedInvoice = { ...appointment, ...payload };
      if (onSuccess) {
        onSuccess(completedInvoice);
      }

      // Automatically atomically increment dynamic target reach for this branch in Firestore
      const targetBranch = appointment.branch || appointment.targetBranch || appointment.branchName;
      if (targetBranch && totalAmountDue > 0) {
        try {
          incrementBranchTargetRevenue(db, targetBranch, totalAmountDue).catch(() => { });
        } catch (syncErr) {
          console.warn('Branch target increment notice:', syncErr);
        }
      }

      // Close checkout modal immediately so receptionist returns to dashboard
      onClose();

      // Show immediate confirmation alert confirming appointment is completed and closed
      alert(`✅ Appointment Completed & Closed!\n\nPayment of ₹${totalAmountDue.toLocaleString('en-IN')} received successfully via ${finalPaymentMode} for ${patientName}.\n\nAppointment is now marked as Completed in Dashboard.`);
    } catch (err) {
      console.error('Error completing checkout:', err);
      alert('Failed to save payment to Firestore.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!appointment) return null;

  const patientName = appointment.patientName || appointment.name || 'Patient';
  const patientPhone = appointment.phone || 'N/A';

  return (
    <>
      {/* ---------------- 1. FULL SCREEN BILLING CHECKOUT ---------------- */}
      {!activeInvoice && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: '#ffffff', zIndex: 9999, display: 'flex', flexDirection: 'column',
          width: '100vw', height: '100vh', overflow: 'hidden'
        }}>
          <style>{`
            input[type=number]::-webkit-inner-spin-button,
            input[type=number]::-webkit-outer-spin-button {
              -webkit-appearance: none !important;
              margin: 0 !important;
            }
            input[type=number] {
              -moz-appearance: textfield !important;
              appearance: textfield !important;
            }
            .appointment-payment-header-title {
              font-size: 12px !important;
              font-weight: 700 !important;
              line-height: 1.2 !important;
            }
            .appointment-payment-header-sub {
              font-size: 10.5px !important;
              color: #64748b !important;
            }
          `}</style>
          {/* Top Bar */}
          <div style={{
            padding: '10px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            borderBottom: '1px solid #e2e8f0', backgroundColor: '#ffffff'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                onClick={handleCancelOrBack}
                style={{
                  background: 'transparent', border: 'none', color: '#0f172a', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', padding: '2px'
                }}
              >
                <ArrowLeft size={18} />
              </button>
              <div>
                <div
                  className="appointment-payment-header-title"
                  style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: '#0f172a' }}
                >
                  Appointment Payment
                </div>
                <div
                  className="appointment-payment-header-sub"
                  style={{ fontSize: '10.5px', color: '#64748b', marginTop: '1px' }}
                >
                  Review and complete payment
                </div>
              </div>
            </div>

            <button
              onClick={handleCancelOrBack}
              style={{
                width: '34px', height: '34px', borderRadius: '50%', background: '#f1f5f9',
                border: 'none', color: '#0f172a', cursor: 'pointer', display: 'flex',
                alignItems: 'center', justifyContent: 'center'
              }}
            >
              <X size={20} />
            </button>
          </div>

          {/* Body Content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '720px', width: '100%', margin: '0 auto' }}>
            {/* Patient Info Card */}
            <div style={{
              background: '#f0f7ff', borderRadius: '14px', padding: '16px',
              border: '1px solid #e0f2fe', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#258ec8' }}>
                  <User size={22} />
                </div>
                <div>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>{patientName}</div>
                  <div style={{ fontSize: '13px', color: '#475569', marginTop: '2px' }}>{patientPhone}</div>
                </div>
              </div>
              <button
                onClick={() => setShowPatientDetails(!showPatientDetails)}
                style={{
                  background: '#ffffff', border: '1px solid #258ec8', color: '#258ec8',
                  padding: '7px 14px', borderRadius: '8px', fontSize: '12.5px', fontWeight: 700, cursor: 'pointer'
                }}
              >
                {showPatientDetails ? 'Hide Details' : 'View Details >'}
              </button>
            </div>

            {/* Expandable Patient Metadata */}
            {showPatientDetails && (
              <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px 16px', fontSize: '13px', color: '#475569', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div>Doctor: <strong>{appointment.doctor || appointment.doctorName || 'Dr. Prashanth K Vaidya'}</strong></div>
                <div>Reg ID: <strong style={{ color: '#258ec8' }}>{appointment.regId || 'N/A'}</strong></div>
                <div>Branch: <strong>{appointment.branch || 'Clinic'}</strong></div>
              </div>
            )}

            {/* ---------------- PRESCRIPTION VERIFICATION & UPLOAD (MANDATORY TO COLLECT FEE) ---------------- */}
            <div
              ref={prescriptionSectionRef}
              style={{
                borderRadius: '16px',
                padding: '16px 18px',
                border: hasPrescription ? '1.5px solid #10b981' : '2px dashed #ef4444',
                background: hasPrescription
                  ? 'linear-gradient(135deg, #f0fdf4 0%, #ffffff 100%)'
                  : 'linear-gradient(135deg, #fef2f2 0%, #ffffff 100%)',
                boxShadow: hasPrescription
                  ? '0 4px 15px rgba(16, 185, 129, 0.08)'
                  : '0 4px 15px rgba(239, 68, 68, 0.1)',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                transition: 'all 0.25s ease'
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '10px',
                    background: hasPrescription ? '#dcfce7' : '#fee2e2',
                    color: hasPrescription ? '#16a34a' : '#dc2626',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    <FileText size={20} />
                  </div>
                  <div>
                    <div style={{ fontSize: '14.5px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      Prescription Verification
                      <span style={{
                        fontSize: '10px',
                        fontWeight: 900,
                        padding: '2px 7px',
                        borderRadius: '4px',
                        background: hasPrescription ? '#dcfce7' : '#fee2e2',
                        color: hasPrescription ? '#15803d' : '#dc2626',
                        border: hasPrescription ? '1px solid #86efac' : '1px solid #fca5a5'
                      }}>
                        MANDATORY
                      </span>
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>
                      Required by clinic policy before fee collection & appointment completion
                    </div>
                  </div>
                </div>

                {hasPrescription ? (
                  <span style={{
                    fontSize: '12px',
                    fontWeight: 800,
                    color: '#15803d',
                    background: '#dcfce7',
                    border: '1px solid #86efac',
                    padding: '4px 12px',
                    borderRadius: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px'
                  }}>
                    <CheckCircle2 size={15} color="#16a34a" /> Prescription Attached ({uploadedPrescriptionList.length + ((appointment as any)?.canvasPrescriptionUrl ? 1 : 0)})
                  </span>
                ) : (
                  <span style={{
                    fontSize: '12px',
                    fontWeight: 800,
                    color: '#dc2626',
                    background: '#fee2e2',
                    border: '1px solid #fca5a5',
                    padding: '4px 12px',
                    borderRadius: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px'
                  }}>
                    <AlertCircle size={15} color="#dc2626" /> Missing • Upload Required
                  </span>
                )}
              </div>

              {/* Warning Notice If Missing */}
              {!hasPrescription && (
                <div style={{
                  padding: '12px 14px',
                  background: '#fff1f2',
                  borderRadius: '10px',
                  border: '1px solid #fecdd3',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px'
                }}>
                  <AlertCircle size={18} color="#e11d48" style={{ marginTop: '2px', flexShrink: 0 }} />
                  <div style={{ fontSize: '12.5px', color: '#9f1239', lineHeight: '1.4' }}>
                    <strong>Prescription is mandatory to collect payment:</strong> Amount cannot be collected without a prescription uploaded or attached. Please upload the physical prescription photo or digital scan below.
                  </div>
                </div>
              )}

              {/* Uploaded Prescription Previews */}
              {(uploadedPrescriptionList.length > 0 || (appointment as any)?.canvasPrescriptionUrl) && (
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginTop: '4px' }}>
                  {(appointment as any)?.canvasPrescriptionUrl && (
                    <div
                      style={{
                        position: 'relative',
                        width: '76px', height: '76px',
                        borderRadius: '10px',
                        overflow: 'hidden',
                        border: '1.5px solid #0284c7',
                        background: '#f8fafc',
                        cursor: 'pointer',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.08)'
                      }}
                      onClick={() => setPreviewModalUrl((appointment as any).canvasPrescriptionUrl)}
                    >
                      <img
                        src={(appointment as any).canvasPrescriptionUrl}
                        alt="Canvas Prescription"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                      <div style={{
                        position: 'absolute', bottom: 0, left: 0, right: 0,
                        background: 'rgba(2, 132, 199, 0.85)',
                        color: '#fff', fontSize: '8.5px', fontWeight: 800, textAlign: 'center', padding: '1px 0'
                      }}>
                        CANVAS
                      </div>
                    </div>
                  )}

                  {uploadedPrescriptionList.map((url, idx) => (
                    <div
                      key={idx}
                      style={{
                        position: 'relative',
                        width: '76px', height: '76px',
                        borderRadius: '10px',
                        overflow: 'hidden',
                        border: '1.5px solid #10b981',
                        background: '#f8fafc',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
                        cursor: 'pointer'
                      }}
                    >
                      <img
                        src={url}
                        alt={`Prescription ${idx + 1}`}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onClick={() => setPreviewModalUrl(url)}
                      />
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemovePrescription(url);
                        }}
                        title="Remove Prescription"
                        style={{
                          position: 'absolute', top: 3, right: 3,
                          width: '20px', height: '20px', borderRadius: '50%',
                          background: 'rgba(239, 68, 68, 0.9)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: '#fff', cursor: 'pointer'
                        }}
                      >
                        <Trash2 size={11} />
                      </div>
                      <div
                        onClick={() => setPreviewModalUrl(url)}
                        style={{
                          position: 'absolute', bottom: 0, left: 0, right: 0,
                          background: 'rgba(15, 23, 42, 0.65)',
                          color: '#fff', fontSize: '8.5px', fontWeight: 700, textAlign: 'center', padding: '1px 0'
                        }}
                      >
                        Page {idx + 1}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Upload Input & Actions */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px' }}>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*,application/pdf"
                  multiple
                  style={{ display: 'none' }}
                  onChange={handleWebPrescriptionUpload}
                />
                <button
                  type="button"
                  disabled={isUploadingPrescription}
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    padding: '9px 18px',
                    borderRadius: '8px',
                    border: hasPrescription ? '1px solid #10b981' : '1.5px solid #ef4444',
                    background: hasPrescription ? '#f0fdf4' : '#fef2f2',
                    color: hasPrescription ? '#047857' : '#b91c1c',
                    fontWeight: 800,
                    fontSize: '12.5px',
                    cursor: isUploadingPrescription ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '7px',
                    transition: 'all 0.15s'
                  }}
                >
                  {isUploadingPrescription ? (
                    <>
                      <div style={{
                        width: '14px', height: '14px', border: '2px solid #b91c1c',
                        borderTopColor: 'transparent', borderRadius: '50%',
                        animation: 'spin 1s linear infinite'
                      }} />
                      Uploading Prescription...
                    </>
                  ) : hasPrescription ? (
                    <>
                      <Plus size={15} /> Add Another Prescription Photo
                    </>
                  ) : (
                    <>
                      <Camera size={15} /> Upload Prescription Photo / Scan (Mandatory)
                    </>
                  )}
                </button>
                <span style={{ fontSize: '11px', color: '#64748b' }}>
                  Supports Camera, JPG, PNG, PDF • Auto-compressed • No page limit
                </span>
              </div>
            </div>

            {/* Active Package Member Banner (if existing active package found) */}
            {existingActivePackage && (
              <div style={{
                background: isPackageCoveredFully
                  ? 'linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 100%)'
                  : 'linear-gradient(135deg, #eff6ff 0%, #f0f9ff 100%)',
                border: isPackageCoveredFully ? '1.5px solid #10b981' : '1.5px solid #0284c7',
                borderRadius: '14px',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      background: '#059669', color: '#ffffff', padding: '2px 8px',
                      borderRadius: '6px', fontSize: '11px', fontWeight: 800
                    }}>
                      PKG ACTIVE
                    </span>
                    <span style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                      Package Member
                    </span>
                  </div>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#475569' }}>
                    Valid until: {new Date(existingActivePackage.expiryDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} ({existingActivePackage.duration || '3 Months'})
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                  <div style={{ background: '#ffffff', padding: '10px', borderRadius: '10px', border: '1.5px solid #e2e8f0', textAlign: 'center' }}>
                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                      <span>Total Package Value</span>
                      <span style={{ fontSize: '9.5px', background: '#f1f5f9', color: '#475569', padding: '1px 5px', borderRadius: '4px' }}>Locked</span>
                    </div>
                    <div style={{ fontSize: '16px', fontWeight: 900, color: '#0f172a', marginTop: '3px' }}>
                      ₹{Number(existingActivePackage.totalAmount || 0).toLocaleString('en-IN')}
                    </div>
                  </div>
                  <div style={{ background: '#ffffff', padding: '10px', borderRadius: '10px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>Already Paid</div>
                    <div style={{ fontSize: '16px', fontWeight: 900, color: '#16a34a', marginTop: '3px' }}>
                      ₹{Number(existingActivePackage.paidAmount || 0).toLocaleString('en-IN')}
                    </div>
                  </div>
                  <div style={{ background: '#ffffff', padding: '10px', borderRadius: '10px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                    <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 700 }}>Pending Balance</div>
                    <div style={{
                      fontSize: '16px',
                      fontWeight: 900,
                      color: Number(existingActivePackage.remainingAmount) > 0 ? '#dc2626' : '#16a34a',
                      marginTop: '3px'
                    }}>
                      {Number(existingActivePackage.remainingAmount) > 0
                        ? `₹${Number(existingActivePackage.remainingAmount).toLocaleString('en-IN')}`
                        : 'PAID IN FULL ✓'}
                    </div>
                  </div>
                </div>

                {isPackageCoveredFully ? (
                  <div style={{
                    padding: '12px 14px', background: '#dcfce7', borderRadius: '10px',
                    color: '#166534', fontSize: '13px', fontWeight: 700,
                    display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid #86efac'
                  }}>
                    <CheckCircle2 size={18} color="#16a34a" />
                    <span>Package is fully paid! Consultation and medicines are 100% covered today at <strong>₹0</strong> total fee.</span>
                  </div>
                ) : (
                  <div style={{
                    background: '#ffffff', border: '1.5px solid #93c5fd', borderRadius: '12px',
                    padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>
                        Enter Remaining / Paying Amount Today (₹):
                      </span>
                      <span style={{ fontSize: '12px', color: '#dc2626', fontWeight: 800 }}>
                        Pending Balance: ₹{Number(existingActivePackage.remainingAmount).toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', background: '#f8fafc', border: '2px solid #258ec8', borderRadius: '8px', padding: '6px 12px', flex: 1 }}>
                        <span style={{ fontSize: '16px', fontWeight: 900, color: '#258ec8', marginRight: '6px' }}>₹</span>
                        <input
                          type="number"
                          value={packageInstallmentInput === '' ? '' : packageInstallmentInput}
                          onChange={e => {
                            const val = e.target.value;
                            if (val === '') {
                              setPackageInstallmentInput('');
                            } else {
                              setPackageInstallmentInput(Math.min(Number(val) || 0, Number(existingActivePackage.remainingAmount || 0)));
                            }
                          }}
                          placeholder="Enter paying amount"
                          style={{ width: '100%', border: 'none', outline: 'none', fontSize: '16px', fontWeight: 800, color: '#0f172a', background: 'transparent' }}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setPackageInstallmentInput(Number(existingActivePackage.remainingAmount || 0))}
                        style={{ background: '#eff6ff', color: '#0284c7', border: '1.5px solid #0284c7', padding: '9px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 800, cursor: 'pointer' }}
                      >
                        Pay Full Due (₹{Number(existingActivePackage.remainingAmount).toLocaleString('en-IN')})
                      </button>
                    </div>

                    {/* Live Balance Preview Calculation */}
                    <div style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      background: '#f8fafc', borderRadius: '8px', padding: '8px 12px', fontSize: '11.5px', color: '#475569'
                    }}>
                      <div>
                        Updated Total Paid: <strong style={{ color: '#16a34a' }}>₹{(Number(existingActivePackage.paidAmount || 0) + (Number(packageInstallmentInput) || 0)).toLocaleString('en-IN')}</strong>
                      </div>
                      <div>
                        New Pending Balance: <strong style={{ color: Math.max(0, Number(existingActivePackage.remainingAmount || 0) - (Number(packageInstallmentInput) || 0)) > 0 ? '#dc2626' : '#16a34a' }}>
                          ₹{Math.max(0, Number(existingActivePackage.remainingAmount || 0) - (Number(packageInstallmentInput) || 0)).toLocaleString('en-IN')}
                        </strong>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* If patient is NOT an existing package member, show the standard Payment Type Selector */}
            {!existingActivePackage && (
              <>
                {/* Active Follow-up & Medicine Duration Banner (IN-DUR) */}
                {activeDurationInfo && (
                  <div style={{
                    background: 'linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 100%)',
                    border: '1.5px solid #10b981',
                    borderRadius: '14px',
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                          background: '#059669', color: '#ffffff', padding: '2px 8px',
                          borderRadius: '6px', fontSize: '11px', fontWeight: 800
                        }}>
                          IN-DUR
                        </span>
                        <span style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                          Active Follow-up Duration ({activeDurationInfo.duration})
                        </span>
                      </div>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#059669' }}>
                        Valid until: {new Date(activeDurationInfo.expiryDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} ({activeDurationInfo.daysRemaining} days left)
                      </span>
                    </div>
                    <div style={{
                      background: '#ffffff', borderRadius: '10px', padding: '10px 14px',
                      border: '1px solid #a7f3d0', color: '#166534', fontSize: '12.5px', fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <CheckCircle2 size={16} color="#16a34a" />
                        <span>Patient is within active medicine duration. Total fee is pre-filled as <strong>₹0</strong>.</span>
                      </div>
                      <span style={{ background: '#dcfce7', color: '#15803d', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 800 }}>
                        ₹0 Covered Visit
                      </span>
                    </div>
                    <div style={{ fontSize: '11.5px', color: '#64748b' }}>
                      💡 If doctor prescribes fresh medicines or extends follow-up, enter the new Target Amount and duration below to start a new duration cycle.
                    </div>
                  </div>
                )}

                {/* Section Heading */}
                <div style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>Select Payment Type</div>

                {/* Target Amount Box */}
                {paymentTypePreset !== 'package' && (
                  <div style={{
                    background: '#f8fafc', border: '1px solid #93c5fd', borderRadius: '14px',
                    padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                  }}>
                    <div>
                      <div style={{ fontSize: '14.5px', fontWeight: 800, color: '#0f172a' }}>Target Amount (Consultation + Medicine):</div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>Split & preset fees are calculated strictly within this target</div>
                    </div>
                    <div style={{
                      display: 'flex', alignItems: 'center', background: '#ffffff', border: '1.5px solid #258ec8',
                      borderRadius: '10px', padding: '6px 12px', width: '110px'
                    }}>
                      <span style={{ fontSize: '16px', fontWeight: 800, color: '#258ec8', marginRight: '4px' }}>₹</span>
                      <input
                        type="number"
                        value={targetAmount === 0 ? '' : targetAmount}
                        placeholder="0"
                        onChange={e => handleTargetAmountChange(Number(e.target.value) || 0)}
                        onWheel={e => e.currentTarget.blur()}
                        style={{ width: '100%', border: 'none', outline: 'none', textAlign: 'right', fontSize: '16px', fontWeight: 800, color: '#0f172a', appearance: 'textfield', MozAppearance: 'textfield' }}
                      />
                    </div>
                  </div>
                )}

                {/* 4 Payment Preset Pills */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                  {[
                    { id: 'consultation', label: 'Consultation' },
                    { id: 'consultation_med', label: 'Consultation & Medicine' },
                    { id: 'split', label: 'Split' },
                    { id: 'package', label: 'Package' }
                  ].map((pill) => {
                    const isActive = paymentTypePreset === pill.id;
                    return (
                      <button
                        key={pill.id}
                        onClick={() => handlePresetSelect(pill.id as any)}
                        style={{
                          padding: '10px 6px', borderRadius: '10px',
                          border: isActive ? '1.5px solid #258ec8' : '1px solid #cbd5e1',
                          background: isActive ? '#eff6ff' : '#ffffff',
                          color: isActive ? '#1d4ed8' : '#475569',
                          fontWeight: isActive ? 800 : 700, fontSize: '11px', cursor: 'pointer', textAlign: 'center'
                        }}
                      >
                        {pill.label}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {/* Package Enrollment Form (When Package Preset is opted and no active package yet) */}
            {paymentTypePreset === 'package' && !existingActivePackage && (
              <div style={{
                background: '#ffffff',
                border: '1.5px solid #e2e8f0',
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                borderRadius: '14px',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Package size={20} color="#258ec8" />
                    <span style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                      Package Registration
                    </span>
                  </div>
                  <span style={{ fontSize: '11px', background: '#eff6ff', color: '#258ec8', padding: '3px 9px', borderRadius: '6px', fontWeight: 700, border: '1px solid #bfdbfe' }}>
                    Advance + Balance System
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  {/* Total Package Amount */}
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>
                      Total Package Amount (₹) *
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', background: '#ffffff', border: '1.5px solid #258ec8', borderRadius: '8px', padding: '6px 10px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 800, color: '#258ec8', marginRight: '4px' }}>₹</span>
                      <input
                        type="number"
                        value={packageTotalAmountInput}
                        onChange={e => setPackageTotalAmountInput(e.target.value === '' ? '' : Number(e.target.value))}
                        placeholder="Enter total package cost"
                        style={{ width: '100%', border: 'none', outline: 'none', fontSize: '14px', fontWeight: 800, color: '#0f172a' }}
                      />
                    </div>
                  </div>

                  {/* Package Duration Dropdown */}
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>
                      Package Duration *
                    </label>
                    <select
                      value={packageDurationInput}
                      onChange={e => setPackageDurationInput(e.target.value)}
                      style={{
                        width: '100%', padding: '8px 10px', borderRadius: '8px',
                        border: '1.5px solid #cbd5e1', fontSize: '13px', fontWeight: 700,
                        color: '#0f172a', background: '#ffffff', outline: 'none', cursor: 'pointer'
                      }}
                    >
                      <option value="1 Month">1 Month</option>
                      <option value="2 Months">2 Months</option>
                      <option value="3 Months">3 Months</option>
                      <option value="4 Months">4 Months</option>
                      <option value="5 Months">5 Months</option>
                      <option value="6 Months">6 Months</option>
                      <option value="1 Year">1 Year</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  {/* Advance Paid Today */}
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>
                      Advance Paid Today (₹) *
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', background: '#ffffff', border: '1.5px solid #258ec8', borderRadius: '8px', padding: '6px 10px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 800, color: '#258ec8', marginRight: '4px' }}>₹</span>
                      <input
                        type="number"
                        value={packageAdvancePaidInput}
                        onChange={e => setPackageAdvancePaidInput(e.target.value === '' ? '' : Number(e.target.value))}
                        placeholder="Enter advance amount"
                        style={{ width: '100%', border: 'none', outline: 'none', fontSize: '14px', fontWeight: 800, color: '#0f172a' }}
                      />
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '3px' }}>
                      Amount to collect right now
                    </div>
                  </div>

                  {/* Remaining Balance Due */}
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '4px' }}>
                      Remaining Balance Due (₹)
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '6px 10px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 800, color: '#ef4444', marginRight: '4px' }}>₹</span>
                      <span style={{ fontSize: '14px', fontWeight: 800, color: '#ef4444' }}>
                        {Math.max(0, (Number(packageTotalAmountInput) || 0) - (Number(packageAdvancePaidInput) || 0)).toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '3px' }}>
                      Remaining to collect in future visits
                    </div>
                  </div>
                </div>

                <div style={{ fontSize: '12px', color: '#1e40af', background: '#eff6ff', border: '1px solid #bfdbfe', padding: '9px 12px', borderRadius: '8px', fontWeight: 600 }}>
                  ℹ️ Package covers consultation and medicines for the duration. No separate consultation, medicine, or diet fees are charged today.
                </div>
              </div>
            )}

            {/* Checkbox Fee Cards (Active only when NOT Package Preset) */}
            {paymentTypePreset !== 'package' && (
              <>
                {/* 1. Consultation Fee */}
                <div style={{
                  background: '#ffffff', border: includeConsultFee ? '1.5px solid #93c5fd' : '1px solid #e2e8f0',
                  borderRadius: '12px', padding: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                  <div
                    onClick={() => setIncludeConsultFee(!includeConsultFee)}
                    style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', flex: 1 }}
                  >
                    {includeConsultFee ? <CheckCircle2 color="#258ec8" size={24} /> : <Circle color="#cbd5e1" size={24} />}
                    <div>
                      <div style={{ fontSize: '14.5px', fontWeight: 800, color: '#0f172a' }}>
                        {paymentTypePreset === 'consultation_med' ? 'Consultation & Med Fee' : 'Consultation Fee'}
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '1px' }}>
                        {paymentTypePreset === 'consultation_med' ? 'Combined Consultation & Medicine Fee (Direct)' : 'Doctor Requested Consultation Fee'}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '5px 10px', width: '90px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: '#258ec8', marginRight: '2px' }}>₹</span>
                    <input
                      type="number"
                      placeholder="0"
                      value={consultFeeInput === 0 ? '' : consultFeeInput}
                      onChange={e => handleConsultFeeChange(e.target.value === '' ? 0 : Number(e.target.value) || 0)}
                      onWheel={e => e.currentTarget.blur()}
                      style={{ width: '100%', border: 'none', outline: 'none', textAlign: 'right', fontSize: '14px', fontWeight: 700, color: '#0f172a', appearance: 'textfield', MozAppearance: 'textfield' }}
                    />
                  </div>
                </div>

                {/* 2. Prescribed Medicines */}
                <div style={{
                  background: paymentTypePreset === 'consultation_med' ? '#f8fafc' : '#ffffff',
                  opacity: paymentTypePreset === 'consultation_med' ? 0.6 : 1,
                  border: paymentTypePreset !== 'consultation_med' && includeMedicineFee ? '1.5px solid #93c5fd' : '1px solid #e2e8f0',
                  borderRadius: '12px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div
                      onClick={() => {
                        if (paymentTypePreset === 'consultation_med') return;
                        const nextInclude = !includeMedicineFee;
                        setIncludeMedicineFee(nextInclude);
                        if (nextInclude) {
                          if (includeConsultFee && targetAmount > 0) {
                            const cPortion = Math.round(targetAmount / 2);
                            const mPortion = Math.max(0, targetAmount - cPortion);
                            setConsultFeeInput(cPortion);
                            setMedicineFeeInput(mPortion);
                            const count = medicineItems.length > 0 ? medicineItems.length : 1;
                            const splitAmounts = distributeAmountEvenly(mPortion, count);
                            if (medicineItems.length === 0) {
                              setMedicineItems([{ id: '1', name: '', amount: mPortion, timing: '' }]);
                            } else {
                              setMedicineItems(prev => prev.map((item, i) => ({ ...item, amount: splitAmounts[i] })));
                            }
                          } else {
                            setMedicineFeeInput(targetAmount);
                            const count = medicineItems.length > 0 ? medicineItems.length : 1;
                            const splitAmounts = distributeAmountEvenly(targetAmount, count);
                            if (medicineItems.length === 0) {
                              setMedicineItems([{ id: '1', name: '', amount: targetAmount, timing: '' }]);
                            } else {
                              setMedicineItems(prev => prev.map((item, i) => ({ ...item, amount: splitAmounts[i] })));
                            }
                          }
                        } else {
                          setMedicineFeeInput(0);
                          setMedicineItems([]);
                          if (includeConsultFee && targetAmount > 0) {
                            setConsultFeeInput(targetAmount);
                          }
                        }
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        cursor: paymentTypePreset === 'consultation_med' ? 'not-allowed' : 'pointer',
                        flex: 1
                      }}
                    >
                      {paymentTypePreset === 'consultation_med' ? (
                        <Circle color="#94a3b8" size={24} />
                      ) : (
                        includeMedicineFee ? <CheckCircle2 color="#258ec8" size={24} /> : <Circle color="#cbd5e1" size={24} />
                      )}
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '14.5px', fontWeight: 800, color: paymentTypePreset === 'consultation_med' ? '#64748b' : '#0f172a' }}>
                            Prescribed Medicines
                          </span>
                          {paymentTypePreset === 'consultation_med' && (
                            <span style={{ fontSize: '10px', fontWeight: 800, color: '#64748b', background: '#e2e8f0', padding: '2px 6px', borderRadius: '4px' }}>
                              DISABLED
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '1px' }}>
                          {paymentTypePreset === 'consultation_med'
                            ? 'Bundled into Consultation & Medicine Fee'
                            : 'Prescribed Remedies / Pharmacy Fee'}
                        </div>
                      </div>
                    </div>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      background: paymentTypePreset === 'consultation_med' ? '#f1f5f9' : '#ffffff',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      padding: '5px 10px',
                      width: '90px'
                    }}>
                      <span style={{ fontSize: '14px', fontWeight: 700, color: paymentTypePreset === 'consultation_med' ? '#94a3b8' : '#258ec8', marginRight: '2px' }}>₹</span>
                      <input
                        type="number"
                        placeholder={paymentTypePreset === 'consultation_med' ? 'Bundled' : '0'}
                        disabled={paymentTypePreset === 'consultation_med'}
                        value={paymentTypePreset === 'consultation_med' ? '' : (medicineFeeInput === 0 ? '' : medicineFeeInput)}
                        onChange={e => handleMedicineFeeChange(e.target.value === '' ? 0 : Number(e.target.value) || 0)}
                        onWheel={e => e.currentTarget.blur()}
                        style={{
                          width: '100%',
                          border: 'none',
                          outline: 'none',
                          textAlign: 'right',
                          fontSize: '14px',
                          fontWeight: 700,
                          color: paymentTypePreset === 'consultation_med' ? '#94a3b8' : '#0f172a',
                          background: 'transparent',
                          cursor: paymentTypePreset === 'consultation_med' ? 'not-allowed' : 'text',
                          appearance: 'textfield',
                          MozAppearance: 'textfield'
                        }}
                      />
                    </div>
                  </div>

                  {/* Duration dropdown & Add Medicine list (Active when medicines included) */}
                  {paymentTypePreset !== 'consultation_med' && includeMedicineFee && (
                    <div style={{
                      borderTop: '1px solid #f1f5f9', paddingTop: '12px', marginTop: '2px',
                      display: 'flex', flexDirection: 'column', gap: '12px'
                    }}>
                      {/* Real-time Match & Verification Badge */}
                      {(() => {
                        const itemizedSum = medicineItems.reduce((acc, m) => acc + (Number(m.amount) || 0), 0);
                        const isMatch = itemizedSum === Number(medicineFeeInput);
                        const isExceeding = itemizedSum > Number(medicineFeeInput);
                        return (
                          <div style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            background: isMatch ? '#f0fdf4' : (isExceeding ? '#fef2f2' : '#fffbeb'),
                            border: `1px solid ${isMatch ? '#86efac' : (isExceeding ? '#fca5a5' : '#fde68a')}`,
                            borderRadius: '8px', padding: '8px 12px', fontSize: '12px', fontWeight: 700,
                            color: isMatch ? '#166534' : (isExceeding ? '#b91c1c' : '#92400e')
                          }}>
                            <span>Allocated Medicine: ₹{medicineFeeInput}</span>
                            <span>Itemized: ₹{itemizedSum} {isMatch ? '(✓ Total Matches)' : (isExceeding ? '(⚠️ Exceeds Allocated)' : `(₹${Math.max(0, Number(medicineFeeInput) - itemizedSum)} Left to Allocate)`)}</span>
                          </div>
                        );
                      })()}

                      {/* Duration Dropdown */}
                      <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        backgroundColor: '#f8fafc', padding: '10px 14px', borderRadius: '10px',
                        border: '1px solid #e2e8f0'
                      }}>
                        <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>
                          Medicine Duration:
                        </div>
                        <select
                          value={medicineDuration}
                          onChange={e => setMedicineDuration(e.target.value)}
                          style={{
                            padding: '6px 12px', borderRadius: '8px', border: '1.5px solid #258ec8',
                            backgroundColor: '#ffffff', color: '#0f172a', fontWeight: 700, fontSize: '13px',
                            outline: 'none', cursor: 'pointer'
                          }}
                        >
                          {['1 Month', '2 Months', '3 Months', '4 Months', '5 Months', '6 Months'].map(d => (
                            <option key={d} value={d}>{d}</option>
                          ))}
                        </select>
                      </div>

                      {/* Medicines List Header & Add Button */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>
                          Itemized Medicines ({medicineItems.length})
                        </div>
                        <button
                          type="button"
                          onClick={handleAddMedicineRow}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '4px',
                            backgroundColor: '#eff6ff', border: '1.5px solid #93c5fd', color: '#1d4ed8',
                            padding: '5px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 800,
                            cursor: 'pointer'
                          }}
                        >
                          <Plus size={15} /> Add Medicine
                        </button>
                      </div>

                      {/* Medicine Items Rows */}
                      {medicineItems.map((item, idx) => (
                        <div
                          key={item.id || idx}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            backgroundColor: '#f8fafc', padding: '8px 10px', borderRadius: '8px',
                            border: '1px solid #e2e8f0'
                          }}
                        >
                          <span style={{ fontSize: '12px', fontWeight: 700, color: '#64748b', width: '22px' }}>
                            #{idx + 1}
                          </span>
                          <input
                            type="text"
                            placeholder="Enter Medicine Name (e.g. Arnica 30C)"
                            value={item.name}
                            onChange={e => handleUpdateMedicineItem(idx, 'name', e.target.value)}
                            style={{
                              flex: 1, minWidth: '130px', padding: '6px 10px', borderRadius: '6px',
                              border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: 600,
                              backgroundColor: '#ffffff', color: '#0f172a', outline: 'none'
                            }}
                          />
                          <select
                            value={item.type || 'Pills'}
                            onChange={e => handleUpdateMedicineItem(idx, 'type', e.target.value)}
                            title="Select Medicine Type"
                            style={{
                              padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1',
                              fontSize: '12px', fontWeight: 700, backgroundColor: '#ffffff',
                              color: '#0f172a', outline: 'none', cursor: 'pointer'
                            }}
                          >
                            {CHECKOUT_MEDICINE_TYPE_OPTIONS.map(t => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                          <select
                            value={item.timing || ''}
                            onChange={e => handleUpdateMedicineItem(idx, 'timing', e.target.value)}
                            title="Select Pill Timing"
                            style={{
                              padding: '6px 8px', borderRadius: '6px', border: '1px solid #cbd5e1',
                              fontSize: '12px', fontWeight: item.timing ? 700 : 500, backgroundColor: '#ffffff',
                              color: item.timing ? '#1e293b' : '#64748b', outline: 'none', cursor: 'pointer'
                            }}
                          >
                            {DOSAGE_TIMING_OPTIONS.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
                          <div style={{
                            display: 'flex', alignItems: 'center', backgroundColor: '#ffffff',
                            border: '1px solid #cbd5e1', borderRadius: '6px', padding: '5px 8px', width: '90px'
                          }}>
                            <span style={{ fontSize: '13px', fontWeight: 700, color: '#258ec8', marginRight: '2px' }}>₹</span>
                            <input
                              type="number"
                              placeholder="0"
                              value={item.amount === 0 ? '' : item.amount}
                              onChange={e => handleUpdateMedicineItem(idx, 'amount', e.target.value === '' ? 0 : Number(e.target.value) || 0)}
                              onWheel={e => e.currentTarget.blur()}
                              style={{
                                width: '100%', border: 'none', outline: 'none', textAlign: 'right',
                                fontSize: '13px', fontWeight: 700, color: '#0f172a',
                                appearance: 'textfield', MozAppearance: 'textfield'
                              }}
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveMedicineItem(idx)}
                            style={{
                              backgroundColor: 'transparent', border: 'none', color: '#ef4444',
                              cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center'
                            }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 3. Diet Plan Fee */}
                <div style={{
                  background: '#ffffff', border: includeDietFee ? '1.5px solid #93c5fd' : '1px solid #e2e8f0',
                  borderRadius: '12px', padding: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                  <div
                    onClick={() => setIncludeDietFee(!includeDietFee)}
                    style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', flex: 1 }}
                  >
                    {includeDietFee ? <CheckCircle2 color="#258ec8" size={24} /> : <Circle color="#cbd5e1" size={24} />}
                    <div>
                      <div style={{ fontSize: '14.5px', fontWeight: 800, color: '#0f172a' }}>Diet Plan Fee</div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '1px' }}>
                        Diet & Nutrition Fee
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '5px 10px', width: '90px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: '#258ec8', marginRight: '2px' }}>₹</span>
                    <input
                      type="number"
                      value={dietFeeInput}
                      onChange={e => setDietFeeInput(Number(e.target.value) || 0)}
                      onWheel={e => e.currentTarget.blur()}
                      style={{ width: '100%', border: 'none', outline: 'none', textAlign: 'right', fontSize: '14px', fontWeight: 700, color: '#0f172a', appearance: 'textfield', MozAppearance: 'textfield' }}
                    />
                  </div>
                </div>

                {/* Medicine Discount Status Card */}
                <div style={{ background: '#ffffff', border: '1.5px solid #e2e8f0', borderRadius: '12px', padding: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>Medicine Discount Status</div>
                      <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>
                        HR Approval Required • Locked until HR approves
                      </div>
                    </div>
                    {/* Status Badge */}
                    {discountRequestStatus === 'pending' && (
                      <span style={{ background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', padding: '4px 10px', borderRadius: '20px', fontSize: '11.5px', fontWeight: 800 }}>
                        ⏳ Pending HR Approval
                      </span>
                    )}
                    {discountRequestStatus === 'approved' && (
                      <span style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', padding: '4px 10px', borderRadius: '20px', fontSize: '11.5px', fontWeight: 800 }}>
                        ✓ Approved by HR (-₹{effectiveDiscount})
                      </span>
                    )}
                    {discountRequestStatus === 'rejected' && (
                      <span style={{ background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5', padding: '4px 10px', borderRadius: '20px', fontSize: '11.5px', fontWeight: 800 }}>
                        ❌ Rejected by HR
                      </span>
                    )}
                  </div>

                  {/* Pending View: Locked with reason and note */}
                  {discountRequestStatus === 'pending' && (
                    <div style={{ marginTop: '12px', background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: '8px', padding: '12px', fontSize: '12.5px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <span style={{ color: '#92400e', fontWeight: 700 }}>
                          Requested Discount: <strong style={{ color: '#b45309', fontSize: '13.5px' }}>₹{requestedDiscountAmount}</strong>
                        </span>
                        <span style={{ color: '#b45309', fontSize: '11px', fontWeight: 700, background: '#fef3c7', padding: '2px 8px', borderRadius: '4px' }}>
                          Awaiting HR Action
                        </span>
                      </div>
                      <div style={{ color: '#78350f', fontSize: '12px', lineHeight: 1.4 }}>
                        <strong>Reason:</strong> {discountReason || 'No reason specified'}
                      </div>
                      <div style={{ marginTop: '8px', fontSize: '11px', color: '#dc2626', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                        ⛔ Payment is locked until HR accepts or rejects this discount request.
                      </div>
                    </div>
                  )}

                  {/* Approved View */}
                  {discountRequestStatus === 'approved' && (
                    <div style={{ marginTop: '12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 800, color: '#166534' }}>
                          Discount Applied: ₹{effectiveDiscount}
                        </div>
                        {discountReason && (
                          <div style={{ fontSize: '11.5px', color: '#15803d', marginTop: '2px' }}>
                            Reason: {discountReason}
                          </div>
                        )}
                      </div>
                      <span style={{ fontSize: '14px', fontWeight: 900, color: '#16a34a' }}>- ₹{effectiveDiscount}</span>
                    </div>
                  )}

                  {/* Rejected View */}
                  {discountRequestStatus === 'rejected' && (
                    <div style={{ marginTop: '12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '12px' }}>
                      <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#991b1b', marginBottom: '4px' }}>
                        Request was rejected by HR
                      </div>
                      {hrRejectReason && (
                        <div style={{ fontSize: '12px', color: '#b91c1c', marginBottom: '8px' }}>
                          <strong>HR Note:</strong> {hrRejectReason}
                        </div>
                      )}
                      <button
                        onClick={() => {
                          setDiscountRequestStatus('none');
                          setShowDiscountInput(true);
                        }}
                        style={{ background: '#ffffff', border: '1px solid #fca5a5', color: '#b91c1c', padding: '5px 12px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer' }}
                      >
                        Submit Revised Request
                      </button>
                    </div>
                  )}

                  {/* Request Button (Shown when no active request) */}
                  {discountRequestStatus === 'none' && !showDiscountInput && (
                    <div style={{ marginTop: '10px' }}>
                      <button
                        onClick={() => setShowDiscountInput(true)}
                        style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '7px 14px', borderRadius: '8px', fontSize: '12.5px', fontWeight: 700, color: '#334155', cursor: 'pointer' }}
                      >
                        Request Discount
                      </button>
                    </div>
                  )}

                  {/* Request Form with Amount & Reason */}
                  {discountRequestStatus === 'none' && showDiscountInput && (
                    <div style={{ marginTop: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '10px' }}>
                        <div>
                          <label style={{ fontSize: '11.5px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
                            Discount Amount (₹) *
                          </label>
                          <div style={{ display: 'flex', alignItems: 'center', background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '6px 8px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 700, color: '#ef4444', marginRight: '4px' }}>- ₹</span>
                            <input
                              type="number"
                              placeholder="0"
                              value={requestedDiscountAmount === 0 ? '' : requestedDiscountAmount}
                              onChange={e => setRequestedDiscountAmount(Math.max(0, Number(e.target.value) || 0))}
                              style={{ width: '100%', border: 'none', outline: 'none', textAlign: 'right', fontSize: '13px', fontWeight: 700, color: '#ef4444' }}
                            />
                          </div>
                        </div>

                        <div>
                          <label style={{ fontSize: '11.5px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>
                            Reason / Note for Request *
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. Senior citizen, Special family discount, Financial concession"
                            value={discountReason}
                            onChange={e => setDiscountReason(e.target.value)}
                            style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '6px 10px', fontSize: '12.5px', fontWeight: 600, color: '#0f172a', background: '#ffffff', outline: 'none' }}
                          />
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
                        <button
                          type="button"
                          onClick={() => setShowDiscountInput(false)}
                          style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#ffffff', fontSize: '12px', fontWeight: 600, color: '#64748b', cursor: 'pointer' }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={isSubmittingDiscountRequest || requestedDiscountAmount <= 0 || !discountReason.trim()}
                          onClick={handleSubmitDiscountRequest}
                          style={{
                            padding: '6px 16px', borderRadius: '6px', border: 'none',
                            background: (requestedDiscountAmount > 0 && discountReason.trim()) ? '#0284c7' : '#94a3b8',
                            color: '#ffffff', fontSize: '12px', fontWeight: 700, cursor: (requestedDiscountAmount > 0 && discountReason.trim()) ? 'pointer' : 'not-allowed'
                          }}
                        >
                          {isSubmittingDiscountRequest ? 'Submitting to HR...' : 'Submit Request to HR'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Payment Method Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
              <span style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>Select Payment Method</span>
              <span style={{ fontSize: '12px', fontWeight: 800, color: '#ef4444' }}>* (Mandatory)</span>
            </div>
            {!selectedPaymentMode && !isPackageCoveredFully && totalAmountDue > 0 && (
              <div style={{ fontSize: '12px', color: '#d97706', fontWeight: 700, marginTop: '2px', marginBottom: '4px' }}>
                ⚠️ Please click an option below to select how the patient is paying:
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px' }}>
              {['Cash', 'UPI / QR Code', 'Card', 'Split', 'Send Pay to app'].map((mode) => {
                const isActive = selectedPaymentMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      setSelectedPaymentMode(mode);
                      if (mode === 'Split' && !splitAmount1 && !splitAmount2 && totalAmountDue > 0) {
                        const half1 = Math.round(totalAmountDue / 2);
                        const half2 = Math.max(0, totalAmountDue - half1);
                        setSplitAmount1(half1);
                        setSplitAmount2(half2);
                      }
                    }}
                    style={{
                      padding: '10px 8px', borderRadius: '8px',
                      border: isActive ? '1.5px solid #258ec8' : '1px solid #cbd5e1',
                      background: isActive ? '#f0f9ff' : '#ffffff',
                      color: isActive ? '#258ec8' : '#475569',
                      fontWeight: isActive ? 800 : 700, fontSize: '12px', cursor: 'pointer',
                      textAlign: 'center'
                    }}
                  >
                    {mode}
                  </button>
                );
              })}
            </div>

            {/* Dynamic Razorpay UPI QR Code Card */}
            {selectedPaymentMode === 'UPI / QR Code' && totalAmountDue > 0 && (
              <div style={{
                marginTop: '12px',
                marginBottom: '12px',
                background: 'linear-gradient(180deg, #f8fafc 0%, #f0f9ff 100%)',
                borderRadius: '14px',
                border: '1.5px solid #7dd3fc',
                padding: '16px',
                boxShadow: '0 4px 12px rgba(2, 132, 199, 0.08)'
              }}>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  paddingBottom: '12px', borderBottom: '1px solid #e2e8f0', marginBottom: '14px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <QrCode size={20} color="#0284c7" />
                    <span style={{ fontSize: '14px', fontWeight: 800, color: '#0369a1' }}>
                      Razorpay Dynamic UPI QR
                    </span>
                  </div>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    background: '#ecfdf5', padding: '4px 10px', borderRadius: '16px',
                    border: '1px solid #a7f3d0'
                  }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }} />
                    <span style={{ fontSize: '11px', fontWeight: 800, color: '#059669', letterSpacing: '0.5px' }}>
                      LIVE
                    </span>
                  </div>
                </div>

                {discountRequestStatus === 'pending' ? (
                  <div style={{ padding: '28px 16px', textAlign: 'center', backgroundColor: '#fffbeb', borderRadius: '10px', border: '1px solid #fef3c7' }}>
                    <div style={{ fontSize: '28px', marginBottom: '8px' }}>⏳</div>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: '#92400e', marginBottom: '4px' }}>
                      Discount Request Pending with HR
                    </div>
                    <div style={{ fontSize: '12px', color: '#b45309', maxWidth: '380px', margin: '0 auto', lineHeight: '1.5' }}>
                      QR generation and payment collection are locked until HR accepts or rejects the ₹{requestedDiscountAmount} discount request.
                    </div>
                  </div>
                ) : upiQrLoading ? (
                  <div style={{ padding: '36px 0', textAlign: 'center' }}>
                    <RefreshCw className="animate-spin" size={28} color="#0284c7" style={{ margin: '0 auto 10px' }} />
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#64748b' }}>
                      Generating dynamic Razorpay QR for ₹{totalAmountDue.toLocaleString('en-IN')}...
                    </div>
                  </div>
                ) : upiQrData?.imageUrl ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    {upiQrPaid ? (
                      <div style={{
                        background: '#dcfce7', border: '1.5px solid #86efac', borderRadius: '12px',
                        padding: '16px', width: '100%', textAlign: 'center', marginBottom: '14px'
                      }}>
                        <CheckCircle2 size={36} color="#16a34a" style={{ margin: '0 auto 6px' }} />
                        <div style={{ fontSize: '16px', fontWeight: 800, color: '#15803d' }}>
                          Payment Received: ₹{totalAmountDue.toLocaleString('en-IN')}
                        </div>
                        <div style={{ fontSize: '12px', color: '#166534', marginTop: '4px' }}>
                          Verified via Razorpay UPI. You may now complete checkout below.
                        </div>
                      </div>
                    ) : (
                      <>
                        <div style={{
                          background: '#ffffff', padding: '12px', borderRadius: '12px',
                          border: '1px solid #cbd5e1', boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                          display: 'inline-block'
                        }}>
                          <img
                            src={upiQrData.imageUrl}
                            alt="Razorpay Dynamic UPI QR"
                            style={{ width: '200px', height: '200px', display: 'block' }}
                          />
                        </div>

                        <div style={{ fontSize: '24px', fontWeight: 900, color: '#0f172a', marginTop: '12px' }}>
                          ₹{totalAmountDue.toLocaleString('en-IN')}
                        </div>
                        <div style={{ fontSize: '12px', color: '#64748b', textAlign: 'center', marginTop: '4px' }}>
                          Scan using Google Pay, PhonePe, Paytm, BHIM, CRED or any UPI App
                        </div>
                      </>
                    )}

                    <div style={{ display: 'flex', gap: '10px', marginTop: '14px', width: '100%', maxWidth: '420px' }}>
                      <button
                        type="button"
                        onClick={() => generateUpiQr(totalAmountDue)}
                        disabled={upiQrLoading}
                        style={{
                          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                          padding: '9px 12px', borderRadius: '8px', background: '#ffffff',
                          border: '1px solid #bae6fd', color: '#0284c7', fontSize: '12px', fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        <RefreshCw size={14} />
                        Refresh QR
                      </button>

                      {upiQrData.paymentUrl && (
                        <>
                          <a
                            href={upiQrData.paymentUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                              padding: '9px 12px', borderRadius: '8px', background: '#f0f9ff',
                              border: '1px solid #0284c7', color: '#0284c7', fontSize: '12px', fontWeight: 700,
                              textDecoration: 'none', cursor: 'pointer'
                            }}
                          >
                            <ExternalLink size={14} />
                            Open Link
                          </a>
                          <button
                            type="button"
                            onClick={() => {
                              if (upiQrData.paymentUrl) {
                                navigator.clipboard.writeText(upiQrData.paymentUrl);
                                setCopiedLink(true);
                                setTimeout(() => setCopiedLink(false), 2500);
                              }
                            }}
                            style={{
                              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                              padding: '9px 12px', borderRadius: '8px', background: '#ffffff',
                              border: '1px solid #bae6fd', color: '#0284c7', fontSize: '12px', fontWeight: 700,
                              cursor: 'pointer'
                            }}
                          >
                            {copiedLink ? <Check size={14} color="#16a34a" /> : <Copy size={14} />}
                            {copiedLink ? 'Copied!' : 'Copy Link'}
                          </button>
                        </>
                      )}

                      <button
                        type="button"
                        onClick={handleVerifyUpiPayment}
                        disabled={upiQrChecking || upiQrPaid}
                        style={{
                          flex: 1.3, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                          padding: '9px 12px', borderRadius: '8px',
                          background: upiQrPaid ? '#16a34a' : '#0284c7',
                          border: 'none', color: '#ffffff', fontSize: '12px', fontWeight: 800,
                          cursor: upiQrChecking || upiQrPaid ? 'default' : 'pointer'
                        }}
                      >
                        <ShieldCheck size={14} />
                        {upiQrChecking ? 'Checking...' : upiQrPaid ? 'Verified ✓' : 'Check Status'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: '20px', textAlign: 'center' }}>
                    <div style={{ fontSize: '12px', color: '#ef4444', fontWeight: 700 }}>
                      Could not generate QR Code
                    </div>
                    <button
                      type="button"
                      onClick={() => generateUpiQr(totalAmountDue)}
                      style={{
                        marginTop: '8px', padding: '6px 14px', background: '#0284c7', color: '#ffffff',
                        border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer'
                      }}
                    >
                      Try Again
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Dedicated Razorpay Card Payment Card */}
            {selectedPaymentMode === 'Card' && totalAmountDue > 0 && (
              <div style={{
                marginTop: '12px',
                marginBottom: '12px',
                background: 'linear-gradient(180deg, #f8fafc 0%, #f0fdf4 100%)',
                borderRadius: '14px',
                border: '1.5px solid #86efac',
                padding: '16px',
                boxShadow: '0 4px 12px rgba(22, 163, 74, 0.08)'
              }}>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  paddingBottom: '12px', borderBottom: '1px solid #e2e8f0', marginBottom: '14px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <CreditCard size={20} color="#16a34a" />
                    <span style={{ fontSize: '14px', fontWeight: 800, color: '#15803d' }}>
                      Razorpay Card Payment Gateway
                    </span>
                  </div>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    background: '#ecfdf5', padding: '4px 10px', borderRadius: '16px',
                    border: '1px solid #a7f3d0'
                  }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }} />
                    <span style={{ fontSize: '11px', fontWeight: 800, color: '#059669', letterSpacing: '0.5px' }}>
                      LIVE GATEWAY
                    </span>
                  </div>
                </div>

                {cardPaidSuccess ? (
                  <div style={{
                    background: '#dcfce7', border: '1.5px solid #86efac', borderRadius: '12px',
                    padding: '16px', textAlign: 'center', marginBottom: '12px'
                  }}>
                    <CheckCircle2 size={36} color="#16a34a" style={{ margin: '0 auto 6px' }} />
                    <div style={{ fontSize: '16px', fontWeight: 800, color: '#15803d' }}>
                      Card Payment Approved: ₹{totalAmountDue.toLocaleString('en-IN')}
                    </div>
                    <div style={{ fontSize: '12px', color: '#166534', marginTop: '4px', fontWeight: 700 }}>
                      Razorpay ID: {cardPaymentId}
                    </div>
                    <div style={{ fontSize: '11.5px', color: '#15803d', marginTop: '2px' }}>
                      Verified via Razorpay. You can now complete checkout below.
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ textAlign: 'center', marginBottom: '14px' }}>
                      <div style={{ fontSize: '24px', fontWeight: 900, color: '#0f172a' }}>
                        ₹{totalAmountDue.toLocaleString('en-IN')}
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                        Accept all Visa, MasterCard, RuPay, Maestro & Amex cards via secure Razorpay checkout
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleLaunchCardCheckout(totalAmountDue)}
                      disabled={cardIsProcessing}
                      style={{
                        width: '100%', padding: '12px 16px', borderRadius: '10px',
                        background: '#16a34a', color: '#ffffff', border: 'none',
                        fontSize: '14px', fontWeight: 800, cursor: cardIsProcessing ? 'default' : 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                        boxShadow: '0 4px 10px rgba(22, 163, 74, 0.2)'
                      }}
                    >
                      <CreditCard size={18} />
                      {cardIsProcessing ? 'Opening Razorpay Card Checkout...' : `Pay ₹${totalAmountDue.toLocaleString('en-IN')} via Razorpay Card`}
                    </button>

                    <div style={{
                      marginTop: '14px', paddingTop: '12px', borderTop: '1px dashed #cbd5e1',
                      display: 'flex', flexDirection: 'column', gap: '8px'
                    }}>
                      <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#64748b' }}>
                        Or Record Card Swipe (POS Machine Slip):
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '10px' }}>
                        <div>
                          <label style={{ fontSize: '11px', color: '#475569', fontWeight: 700 }}>Card Last 4 Digits</label>
                          <input
                            type="text"
                            maxLength={4}
                            placeholder="e.g. 1338"
                            value={cardLast4}
                            onChange={e => setCardLast4(e.target.value.replace(/\D/g, ''))}
                            style={{
                              width: '100%', padding: '6px 10px', borderRadius: '6px',
                              border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: 700,
                              marginTop: '2px', outline: 'none'
                            }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: '11px', color: '#475569', fontWeight: 700 }}>Auth / Slip Reference</label>
                          <input
                            type="text"
                            placeholder="e.g. EZ2026... or Bank RRN"
                            value={cardAuthRef}
                            onChange={e => setCardAuthRef(e.target.value)}
                            style={{
                              width: '100%', padding: '6px 10px', borderRadius: '6px',
                              border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: 600,
                              marginTop: '2px', outline: 'none'
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Split Breakdown with Any Combination (Cash+UPI, Cash+Card, UPI+Card) */}
            {selectedPaymentMode === 'Split' && (
              <div style={{
                display: 'flex', flexDirection: 'column', gap: '12px',
                background: '#f0f9ff', padding: '16px', borderRadius: '12px',
                border: '1.5px solid #bae6fd'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', fontWeight: 800, color: '#0369a1' }}>
                    Select Split Combination:
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const half1 = Math.round(totalAmountDue / 2);
                      const half2 = Math.max(0, totalAmountDue - half1);
                      setSplitAmount1(half1);
                      setSplitAmount2(half2);
                    }}
                    style={{
                      background: '#e0f2fe', border: '1px solid #7dd3fc', color: '#0284c7',
                      padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    Auto 50/50 Split
                  </button>
                </div>

                {/* 3 Quick Combo Selectors */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  {[
                    { id: 'cash_upi', label: 'Cash + UPI', m1: 'Cash', m2: 'UPI' },
                    { id: 'cash_card', label: 'Cash + Card', m1: 'Cash', m2: 'Card' },
                    { id: 'upi_card', label: 'UPI + Card', m1: 'UPI', m2: 'Card' },
                  ].map((combo) => {
                    const isComboActive =
                      (splitMethod1 === combo.m1 && splitMethod2 === combo.m2) ||
                      (splitMethod1 === combo.m2 && splitMethod2 === combo.m1);
                    return (
                      <button
                        type="button"
                        key={combo.id}
                        onClick={() => {
                          setSplitMethod1(combo.m1);
                          setSplitMethod2(combo.m2);
                        }}
                        style={{
                          padding: '8px 6px', borderRadius: '8px',
                          border: isComboActive ? '2px solid #0284c7' : '1px solid #cbd5e1',
                          background: isComboActive ? '#0284c7' : '#ffffff',
                          color: isComboActive ? '#ffffff' : '#334155',
                          fontWeight: isComboActive ? 800 : 600, fontSize: '12px',
                          cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s ease'
                        }}
                      >
                        {combo.label}
                      </button>
                    );
                  })}
                </div>

                {/* Two Method Columns with Custom Dropdowns and Amount Boxes */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '2px' }}>
                  {/* Method 1 */}
                  <div style={{ background: '#ffffff', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <label style={{ fontSize: '11.5px', fontWeight: 700, color: '#475569' }}>Method 1</label>
                      <select
                        value={splitMethod1}
                        onChange={e => setSplitMethod1(e.target.value)}
                        style={{
                          fontSize: '12px', fontWeight: 700, color: '#0369a1',
                          border: '1px solid #cbd5e1', borderRadius: '6px', padding: '3px 8px',
                          background: '#f8fafc', outline: 'none', cursor: 'pointer'
                        }}
                      >
                        <option value="Cash">Cash</option>
                        <option value="UPI">UPI</option>
                        <option value="Card">Card</option>
                      </select>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '6px 10px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#0369a1', marginRight: '4px' }}>₹</span>
                      <input
                        type="number"
                        placeholder="0"
                        value={splitAmount1}
                        onChange={e => {
                          const val = e.target.value === '' ? '' : Number(e.target.value);
                          setSplitAmount1(val);
                          if (val !== '' && typeof val === 'number') {
                            setSplitAmount2(Math.max(0, totalAmountDue - val));
                          }
                        }}
                        onWheel={e => e.currentTarget.blur()}
                        style={{ width: '100%', border: 'none', outline: 'none', textAlign: 'right', fontSize: '14px', fontWeight: 700, color: '#0f172a', background: 'transparent', appearance: 'textfield', MozAppearance: 'textfield' }}
                      />
                    </div>
                  </div>

                  {/* Method 2 */}
                  <div style={{ background: '#ffffff', padding: '10px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <label style={{ fontSize: '11.5px', fontWeight: 700, color: '#475569' }}>Method 2</label>
                      <select
                        value={splitMethod2}
                        onChange={e => setSplitMethod2(e.target.value)}
                        style={{
                          fontSize: '12px', fontWeight: 700, color: '#0369a1',
                          border: '1px solid #cbd5e1', borderRadius: '6px', padding: '3px 8px',
                          background: '#f8fafc', outline: 'none', cursor: 'pointer'
                        }}
                      >
                        <option value="Cash">Cash</option>
                        <option value="UPI">UPI</option>
                        <option value="Card">Card</option>
                      </select>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '6px 10px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#0369a1', marginRight: '4px' }}>₹</span>
                      <input
                        type="number"
                        placeholder="0"
                        value={splitAmount2}
                        onChange={e => {
                          const val = e.target.value === '' ? '' : Number(e.target.value);
                          setSplitAmount2(val);
                        }}
                        onWheel={e => e.currentTarget.blur()}
                        style={{ width: '100%', border: 'none', outline: 'none', textAlign: 'right', fontSize: '14px', fontWeight: 700, color: '#0f172a', background: 'transparent', appearance: 'textfield', MozAppearance: 'textfield' }}
                      />
                    </div>
                  </div>
                </div>

                {/* Balance verification note */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', paddingTop: '2px' }}>
                  <span style={{ color: '#64748b', fontWeight: 600 }}>
                    Split Sum: <strong style={{ color: (Number(splitAmount1) || 0) + (Number(splitAmount2) || 0) === totalAmountDue ? '#16a34a' : '#ea580c' }}>
                      ₹{(Number(splitAmount1) || 0) + (Number(splitAmount2) || 0)}
                    </strong> / ₹{totalAmountDue}
                  </span>
                  {(Number(splitAmount1) || 0) + (Number(splitAmount2) || 0) === totalAmountDue ? (
                    <span style={{ color: '#16a34a', fontWeight: 700 }}>✓ Fully Balanced</span>
                  ) : (
                    <span style={{ color: '#ea580c', fontWeight: 600 }}>
                      Remaining: ₹{Math.max(0, totalAmountDue - ((Number(splitAmount1) || 0) + (Number(splitAmount2) || 0)))}
                    </span>
                  )}
                </div>

                {/* Split Dynamic Razorpay UPI QR Card */}
                {isSplitUpi && splitUpiAmount > 0 && (
                  <div style={{
                    marginTop: '4px',
                    background: '#ffffff',
                    borderRadius: '10px',
                    border: '1.5px solid #7dd3fc',
                    padding: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <QrCode size={16} color="#0284c7" />
                        <span style={{ fontSize: '12px', fontWeight: 800, color: '#0369a1' }}>
                          Split UPI QR: ₹{splitUpiAmount.toLocaleString('en-IN')}
                        </span>
                      </div>
                      <span style={{ fontSize: '10px', fontWeight: 800, color: '#059669', background: '#ecfdf5', padding: '2px 8px', borderRadius: '12px', border: '1px solid #a7f3d0' }}>
                        DIRECT UPI
                      </span>
                    </div>

                    {splitUpiQrLoading ? (
                      <div style={{ padding: '16px 0', textAlign: 'center' }}>
                        <RefreshCw className="animate-spin" size={20} color="#0284c7" style={{ margin: '0 auto 6px' }} />
                        <span style={{ fontSize: '11px', fontWeight: 700, color: '#64748b' }}>Generating QR for ₹{splitUpiAmount}...</span>
                      </div>
                    ) : splitUpiQrData?.imageUrl ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                        {splitUpiQrPaid ? (
                          <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: '8px', padding: '10px', width: '100%', textAlign: 'center', marginBottom: '8px' }}>
                            <CheckCircle2 size={24} color="#16a34a" style={{ margin: '0 auto 4px' }} />
                            <div style={{ fontSize: '13px', fontWeight: 800, color: '#15803d' }}>
                              UPI Portion Received: ₹{splitUpiAmount}
                            </div>
                          </div>
                        ) : (
                          <>
                            <div style={{ background: '#ffffff', padding: '6px', borderRadius: '8px', border: '1px solid #cbd5e1', marginBottom: '6px' }}>
                              <img src={splitUpiQrData.imageUrl} alt="Split UPI QR" style={{ width: '140px', height: '140px', display: 'block' }} />
                            </div>
                            <div style={{ fontSize: '11px', color: '#64748b', textAlign: 'center', marginBottom: '8px' }}>
                              Scan with GPay, PhonePe, Paytm (No Redirect)
                            </div>
                          </>
                        )}
                        <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                          <button
                            type="button"
                            onClick={() => generateSplitUpiQr(splitUpiAmount)}
                            style={{ flex: 1, padding: '6px 8px', background: '#f8fafc', border: '1px solid #bae6fd', borderRadius: '6px', fontSize: '11px', fontWeight: 700, color: '#0284c7', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                          >
                            <RefreshCw size={12} /> Refresh
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              if (!splitUpiQrData?.qrId) return;
                              const res = await checkRazorpayPaymentStatus(splitUpiQrData.qrId);
                              if (res.isPaid) {
                                setSplitUpiQrPaid(true);
                                alert(`✅ UPI Split portion of ₹${splitUpiAmount} received!`);
                              } else {
                                alert('UPI payment not yet received.');
                              }
                            }}
                            style={{ flex: 1.2, padding: '6px 8px', background: splitUpiQrPaid ? '#16a34a' : '#0284c7', color: '#ffffff', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                          >
                            <ShieldCheck size={12} /> {splitUpiQrPaid ? 'Verified ✓' : 'Check Status'}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}

                {/* Split Razorpay Card Payment Card */}
                {isSplitCard && splitCardAmount > 0 && (
                  <div style={{
                    marginTop: '4px',
                    background: '#ffffff',
                    borderRadius: '10px',
                    border: '1.5px solid #86efac',
                    padding: '12px',
                    display: 'flex',
                    flexDirection: 'column'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <CreditCard size={16} color="#16a34a" />
                        <span style={{ fontSize: '12px', fontWeight: 800, color: '#15803d' }}>
                          Split Card Payment: ₹{splitCardAmount.toLocaleString('en-IN')}
                        </span>
                      </div>
                      <span style={{ fontSize: '10px', fontWeight: 800, color: '#15803d', background: '#dcfce7', padding: '2px 8px', borderRadius: '12px', border: '1px solid #86efac' }}>
                        RAZORPAY
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleLaunchCardCheckout(splitCardAmount)}
                      disabled={cardIsProcessing}
                      style={{
                        width: '100%', padding: '9px 12px', borderRadius: '8px',
                        background: '#16a34a', color: '#ffffff', border: 'none',
                        fontSize: '12.5px', fontWeight: 800, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                        marginBottom: '8px'
                      }}
                    >
                      <CreditCard size={15} />
                      {cardIsProcessing ? 'Opening Card Gateway...' : `Pay ₹${splitCardAmount.toLocaleString('en-IN')} with Card`}
                    </button>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '8px', paddingTop: '6px', borderTop: '1px dashed #e2e8f0' }}>
                      <div>
                        <label style={{ fontSize: '10.5px', color: '#64748b', fontWeight: 700 }}>Card Last 4</label>
                        <input
                          type="text"
                          maxLength={4}
                          placeholder="e.g. 1338"
                          value={cardLast4}
                          onChange={e => setCardLast4(e.target.value.replace(/\D/g, ''))}
                          style={{ width: '100%', padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px', fontWeight: 700, marginTop: '2px', outline: 'none' }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '10.5px', color: '#64748b', fontWeight: 700 }}>POS Auth / Slip Ref</label>
                        <input
                          type="text"
                          placeholder="EZ2026... / Bank Ref"
                          value={cardAuthRef}
                          onChange={e => setCardAuthRef(e.target.value)}
                          style={{ width: '100%', padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '12px', fontWeight: 600, marginTop: '2px', outline: 'none' }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Total Amount Summary */}
            <div style={{
              background: '#f8fafc', border: '1.5px solid #cbd5e1', borderRadius: '12px',
              padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px'
            }}>
              {paymentTypePreset === 'package' ? (
                existingActivePackage ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#475569', fontWeight: 600 }}>
                    <span>Package Due Installment:</span>
                    <span style={{ fontWeight: 700, color: '#0f172a' }}>₹ {totalAmountDue.toLocaleString('en-IN')}</span>
                  </div>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#475569', fontWeight: 600 }}>
                    <span>Package Advance (Total ₹{Number(packageTotalAmountInput) || 0}):</span>
                    <span style={{ fontWeight: 700, color: '#0f172a' }}>₹ {totalAmountDue.toLocaleString('en-IN')}</span>
                  </div>
                )
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#475569', fontWeight: 600 }}>
                  <span>Target Amount (Consult + Med):</span>
                  <span style={{ fontWeight: 700, color: '#0f172a' }}>₹ {(activeConsultFee + activeMedicineFee).toLocaleString('en-IN')}</span>
                </div>
              )}
              {includeDietFee && activeDietFee > 0 && paymentTypePreset !== 'package' && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#166534', fontWeight: 600 }}>
                  <span>+ Diet Plan Fee:</span>
                  <span style={{ fontWeight: 700 }}>₹ {activeDietFee.toLocaleString('en-IN')}</span>
                </div>
              )}
              {effectiveDiscount > 0 && paymentTypePreset !== 'package' && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#dc2626', fontWeight: 600 }}>
                  <span>- Medicine Discount (HR Approved):</span>
                  <span style={{ fontWeight: 700 }}>- ₹ {effectiveDiscount.toLocaleString('en-IN')}</span>
                </div>
              )}
              <div style={{ height: '1px', backgroundColor: '#e2e8f0', margin: '4px 0' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>TOTAL AMOUNT DUE:</span>
                <span style={{ fontSize: '22px', fontWeight: 900, color: totalAmountDue === 0 ? '#059669' : '#16a34a' }}>
                  ₹ {totalAmountDue.toLocaleString('en-IN')}
                </span>
              </div>
            </div>
          </div>

          {/* Bottom Bar */}
          <div style={{ padding: '16px 24px', backgroundColor: '#ffffff', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
            <button onClick={handleCancelOrBack} style={{ padding: '11px 20px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', color: '#475569', fontWeight: 700, cursor: 'pointer', fontSize: '13px' }}>
              Cancel
            </button>
            <button
              onClick={handleConfirmCheckout}
              disabled={isLoading || discountRequestStatus === 'pending'}
              style={{
                flex: 1, padding: '12px 24px', borderRadius: '8px', border: 'none',
                background: discountRequestStatus === 'pending'
                  ? '#d97706'
                  : !hasPrescription
                    ? 'linear-gradient(135deg, #dc2626 0%, #ef4444 100%)'
                    : totalAmountDue === 0 ? '#059669' : '#16a34a',
                color: '#fff', fontWeight: 800, fontSize: '14px',
                cursor: discountRequestStatus === 'pending' ? 'not-allowed' : 'pointer',
                boxShadow: discountRequestStatus === 'pending'
                  ? '0 4px 14px rgba(217, 119, 6, 0.35)'
                  : !hasPrescription
                    ? '0 4px 14px rgba(239, 68, 68, 0.35)'
                    : '0 4px 12px rgba(22, 163, 74, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              {isLoading
                ? 'Processing...'
                : discountRequestStatus === 'pending'
                  ? `⏳ Awaiting HR Discount Approval (Payment Locked)`
                  : !hasPrescription
                    ? '⚠️ Upload Prescription to Collect Fee (Mandatory)'
                    : isPackageCoveredFully
                      ? 'Confirm Package Visit (₹0) ✓'
                      : existingActivePackage && Number(existingActivePackage.remainingAmount) > 0 && paymentTypePreset === 'package'
                        ? `Collect Package Due (₹${totalAmountDue.toLocaleString('en-IN')}) & Update Log ✓`
                        : paymentTypePreset === 'package'
                          ? `Enroll Package & Collect Advance (₹${totalAmountDue.toLocaleString('en-IN')}) ✓`
                          : `Confirm Payment (₹${totalAmountDue.toLocaleString('en-IN')}) & Generate Invoice ✓`}
            </button>
          </div>
        </div>
      )}
      {/* ---------------- 2. FULL SCREEN PRINTABLE INVOICE RECEIPT ---------------- */}
      {activeInvoice && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: '#ffffff', zIndex: 10000, display: 'flex', flexDirection: 'column',
          width: '100vw', height: '100vh', overflow: 'hidden'
        }}>
          <style>{`
            @media print {
              body * { visibility: hidden !important; }
              #printable-invoice-receipt, #printable-invoice-receipt * { visibility: visible !important; }
              #printable-invoice-receipt {
                position: absolute !important;
                left: 0 !important;
                top: 0 !important;
                width: 100% !important;
                max-width: 100% !important;
                padding: 28px 40px !important;
                margin: 0 !important;
                box-shadow: none !important;
              }
              .no-print { display: none !important; }
            }
          `}</style>

          {/* Invoice Header Navigation (Screen Only) */}
          <div className="no-print" style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#ffffff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#0f172a', cursor: 'pointer' }}>
                <ArrowLeft size={22} />
              </button>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>Payment Receipt</h2>
            </div>
            <button onClick={onClose} style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#f1f5f9', border: 'none', color: '#0f172a', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <X size={18} />
            </button>
          </div>

          {/* Printable Payment Receipt Container (1:1 with Screenshot) */}
          <div id="printable-invoice-receipt" style={{
            flex: 1, overflowY: 'auto', padding: '32px 40px', maxWidth: '800px', width: '100%',
            margin: '0 auto', fontFamily: 'Inter, system-ui, -apple-system, sans-serif', backgroundColor: '#ffffff', color: '#0f172a',
            display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
          }}>
            <div>
              {/* 1. Header Bar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '10px', gap: '12px' }}>
                <img src={`data:image/png;base64,${SH_LOGO_BASE64}`} width="260" height="52" alt="Spiritual Homeopathy Logo" style={{ height: '52px', width: '260px', objectFit: 'contain' }} />
                <div style={{ textAlign: 'right', fontSize: '11px', color: '#334155', fontWeight: 700, lineHeight: 1.4, flexShrink: 0 }}>
                  <div>spiritualhomeoclinic.com</div>
                  <div style={{ color: '#64748b', fontWeight: 500 }}>support@spiritualhomeoclinic.com</div>
                </div>
              </div>

              {/* Lime Green Top Border Line */}
              <div style={{ height: '5px', backgroundColor: '#99cc00', width: '100%', margin: '10px 0 20px 0', borderRadius: '3px' }} />

              {/* 2. PAYMENT RECEIPT Header & Receipt Badge */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 900, color: '#0f172a', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                  PAYMENT RECEIPT
                </h1>
                <span style={{ backgroundColor: '#e0f2fe', color: '#0284c7', padding: '5px 16px', borderRadius: '20px', fontSize: '11.5px', fontWeight: 800, letterSpacing: '0.5px' }}>
                  RECEIPT
                </span>
              </div>

              {/* 3. PATIENT DETAILS Section */}
              <div style={{ marginBottom: '22px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#475569', letterSpacing: '0.8px' }}>PATIENT DETAILS</span>
                  <div style={{ flex: 1, height: '1px', backgroundColor: '#e2e8f0' }} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 36px', fontSize: '13.5px' }}>
                  <div style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '6px' }}>
                    <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#64748b', marginBottom: '3px', textTransform: 'uppercase' }}>PATIENT NAME</div>
                    <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '14px' }}>{patientName}</div>
                  </div>
                  <div style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '6px' }}>
                    <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#64748b', marginBottom: '3px', textTransform: 'uppercase' }}>PHONE NUMBER</div>
                    <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '14px' }}>+91 {patientPhone}</div>
                  </div>
                  <div style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '6px' }}>
                    <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#64748b', marginBottom: '3px', textTransform: 'uppercase' }}>CONSULTANT DOCTOR</div>
                    <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '14px' }}>{activeInvoice.doctorName || activeInvoice.doctor || 'Dr. Prashanth k vaidya'}</div>
                  </div>
                  <div style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '6px' }}>
                    <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#64748b', marginBottom: '3px', textTransform: 'uppercase' }}>CLINIC BRANCH</div>
                    <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '14px' }}>{activeInvoice.branch || 'Kphb'}</div>
                  </div>
                  <div style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '6px' }}>
                    <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#64748b', marginBottom: '3px', textTransform: 'uppercase' }}>APPOINTMENT SCHEDULE</div>
                    <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '14px' }}>
                      {activeInvoice.appointmentDate || activeInvoice.date || new Date().toLocaleDateString('en-GB')} at {activeInvoice.timeSlot || activeInvoice.time || '01:00 PM'}
                    </div>
                  </div>
                  <div style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '6px' }}>
                    <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#64748b', marginBottom: '3px', textTransform: 'uppercase' }}>SPECIALTY</div>
                    <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '14px' }}>Homeopathy</div>
                  </div>
                </div>
              </div>

              {/* 4. PAYMENT INFORMATION Section */}
              <div style={{ marginBottom: '22px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#475569', letterSpacing: '0.8px' }}>PAYMENT INFORMATION</span>
                  <div style={{ flex: 1, height: '1px', backgroundColor: '#e2e8f0' }} />
                </div>

                <div style={{
                  backgroundColor: '#e6f7ed', border: '2px dashed #86efac', borderRadius: '14px',
                  padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 800, color: '#166534', letterSpacing: '0.5px', marginBottom: '3px', textTransform: 'uppercase' }}>
                      TOTAL AMOUNT PAID
                    </div>
                    <div style={{ fontSize: '32px', fontWeight: 900, color: '#15803d', lineHeight: 1 }}>
                      ₹{Number(activeInvoice.totalPaid || activeInvoice.targetAmount || 2000).toFixed(2)}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ backgroundColor: '#22c55e', color: '#ffffff', padding: '6px 18px', borderRadius: '20px', fontWeight: 800, fontSize: '13px', display: 'inline-block' }}>
                      PAID ✓
                    </div>
                    <div style={{ fontSize: '11px', fontWeight: 800, color: '#166534', marginTop: '6px', textTransform: 'uppercase' }}>
                      VIA {activeInvoice.paymentMode || 'UPI'}
                    </div>
                  </div>
                </div>
              </div>

              {/* 5. FEE BREAKDOWN Section */}
              <div style={{ marginBottom: '22px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#475569', letterSpacing: '0.8px' }}>FEE BREAKDOWN</span>
                  <div style={{ flex: 1, height: '1px', backgroundColor: '#e2e8f0' }} />
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1.5px solid #cbd5e1', color: '#475569' }}>
                      <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '11.5px', fontWeight: 800, textTransform: 'uppercase' }}>DESCRIPTION</th>
                      <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: '11.5px', fontWeight: 800, textTransform: 'uppercase' }}>AMOUNT (₹)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* 2. Package Treatment */}
                    {(Number(activeInvoice.packageFee) > 0 || activeInvoice.isPackageMember || Number(activeInvoice.packageTotalAmount) > 0) && (() => {
                      const dur = activeInvoice.packageDuration || '3 Months';
                      const tot = Number(activeInvoice.packageTotalAmount || activeInvoice.totalAmount || activeInvoice.totalPaid || 0);
                      const paid = Number(activeInvoice.totalPaid || activeInvoice.packageFee || 0);
                      const rem = Number(activeInvoice.packageRemainingAmount !== undefined ? activeInvoice.packageRemainingAmount : Math.max(0, tot - paid));
                      return (
                        <>
                          <tr style={{ borderBottom: '1px solid #e2e8f0', backgroundColor: '#f0fdf4' }}>
                            <td style={{ padding: '12px 14px', color: '#166534', fontWeight: 800 }}>
                              Package Enrollment & Treatment ({dur})
                            </td>
                            <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 900, color: '#166534' }}>
                              ₹{tot.toFixed(2)}
                            </td>
                          </tr>
                          <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '8px 14px 8px 24px', color: '#475569', fontWeight: 600 }}>
                              • Total Package Value
                            </td>
                            <td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>
                              ₹{tot.toFixed(2)}
                            </td>
                          </tr>
                          <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '8px 14px 8px 24px', color: '#15803d', fontWeight: 700 }}>
                              • Paid Amount Today (Advance/Installment)
                            </td>
                            <td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 800, color: '#15803d' }}>
                              ₹{paid.toFixed(2)}
                            </td>
                          </tr>
                          <tr style={{ borderBottom: '1.5px solid #cbd5e1', backgroundColor: '#fff7ed' }}>
                            <td style={{ padding: '8px 14px 8px 24px', color: '#c2410c', fontWeight: 800 }}>
                              • Remaining Balance Due
                            </td>
                            <td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 900, color: rem <= 0 ? '#15803d' : '#ea580c' }}>
                              ₹{rem.toFixed(2)}{rem <= 0 ? ' (Cleared)' : ''}
                            </td>
                          </tr>
                        </>
                      );
                    })()}

                    {/* 3. Fee Breakdown: Consultation and Medicine VS Consultation Fee / Medicines */}
                    {activeInvoice.paymentTypePreset === 'consultation_med' ? (
                      <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '10px 14px', color: '#334155', fontWeight: 600 }}>Consultation and Medicine</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>
                          ₹{Number(activeInvoice.consultationFee || activeInvoice.totalPaid || 0).toFixed(2)}
                        </td>
                      </tr>
                    ) : activeInvoice.paymentTypePreset === 'consultation' ? (
                      <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '10px 14px', color: '#334155', fontWeight: 600 }}>Consultation Fee</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>
                          ₹{Number(activeInvoice.consultationFee || activeInvoice.totalPaid || 0).toFixed(2)}
                        </td>
                      </tr>
                    ) : activeInvoice.paymentTypePreset === 'split' ? (
                      <>
                        {Number(activeInvoice.consultationFee) > 0 && (
                          <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '10px 14px', color: '#334155', fontWeight: 600 }}>Consultation Fee</td>
                            <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>
                              ₹{Number(activeInvoice.consultationFee).toFixed(2)}
                            </td>
                          </tr>
                        )}
                        {activeInvoice.medicines && activeInvoice.medicines.length > 0 ? (
                          activeInvoice.medicines.map((m: any, idx: number) => {
                            const medName = m.name && m.name.trim() ? m.name.trim() : (activeInvoice.medicines.length === 1 ? 'Medicine Fee' : `Medicine ${idx + 1}`);
                            const typeDisplay = m.type && m.type.trim() ? ` [${m.type.trim()}]` : '';
                            const timingDisplay = m.timing && m.timing.trim() ? ` [${m.timing.trim()}]` : '';
                            const durationDisplay = activeInvoice.medicineDuration ? ` (${activeInvoice.medicineDuration})` : '';
                            return (
                              <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={{ padding: '10px 14px', color: '#334155', fontWeight: 600 }}>
                                  {medName}{typeDisplay}{timingDisplay}{durationDisplay}
                                </td>
                                <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>
                                  ₹{Number(m.amount).toFixed(2)}
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          Number(activeInvoice.medicineFee) > 0 && (
                            <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td style={{ padding: '10px 14px', color: '#334155', fontWeight: 600 }}>
                                Medicine Fee{activeInvoice.medicineDuration ? ` (${activeInvoice.medicineDuration})` : ''}
                              </td>
                              <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>
                                ₹{Number(activeInvoice.medicineFee).toFixed(2)}
                              </td>
                            </tr>
                          )
                        )}
                      </>
                    ) : (
                      <>
                        {Number(activeInvoice.consultationFee) > 0 && (
                          <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '10px 14px', color: '#334155', fontWeight: 600 }}>Consultation Fee</td>
                            <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>
                              ₹{Number(activeInvoice.consultationFee).toFixed(2)}
                            </td>
                          </tr>
                        )}
                        {Number(activeInvoice.medicineFee) > 0 && (
                          <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '10px 14px', color: '#334155', fontWeight: 600 }}>
                              Medicine Fee{activeInvoice.medicineDuration ? ` (${activeInvoice.medicineDuration})` : ''}
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>
                              ₹{Number(activeInvoice.medicineFee).toFixed(2)}
                            </td>
                          </tr>
                        )}
                      </>
                    )}
                    {Number(activeInvoice.dietFee) > 0 && (
                      <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '10px 14px', color: '#334155', fontWeight: 600 }}>Diet & Nutrition Fee</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>
                          ₹{Number(activeInvoice.dietFee).toFixed(2)}
                        </td>
                      </tr>
                    )}
                    {Number(activeInvoice.otherCharges) > 0 && (
                      <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '10px 14px', color: '#334155', fontWeight: 600 }}>Other Charges</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>
                          ₹{Number(activeInvoice.otherCharges).toFixed(2)}
                        </td>
                      </tr>
                    )}
                    {Number(activeInvoice.discount) > 0 && (
                      <tr style={{ borderBottom: '1px solid #f1f5f9', color: '#ef4444' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 600 }}>Discount Applied</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700 }}>
                          - ₹{Number(activeInvoice.discount).toFixed(2)}
                        </td>
                      </tr>
                    )}
                    {(!activeInvoice.medicineFee && !activeInvoice.consultationFee && !activeInvoice.dietFee && !activeInvoice.otherCharges && activeInvoice.paymentTypePreset !== 'consultation_med') && (
                      <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '10px 14px', color: '#334155', fontWeight: 600 }}>Consultation Fee</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>
                          ₹{Number(activeInvoice.totalPaid || 2000).toFixed(2)}
                        </td>
                      </tr>
                    )}
                    <tr style={{ borderBottom: '1px solid #cbd5e1', fontWeight: 700 }}>
                      <td style={{ padding: '10px 14px', color: '#0f172a' }}>
                        Payment Mode ({activeInvoice.paymentMode || 'UPI'})
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: '#0f172a', fontWeight: 800 }}>
                        ₹{Number(activeInvoice.totalPaid || 2000).toFixed(2)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* 6. Footer Meta & Disclaimer */}
              <div style={{ fontSize: '11px', color: '#64748b', lineHeight: 1.6, marginBottom: '20px', marginTop: '14px' }}>
                <div>Payment ID: WALKIN_{(activeInvoice.paymentMode || 'UPI').toUpperCase().replace(/\s+/g, '_')}</div>
                <div>Issued At: {new Date().toLocaleDateString('en-GB')}, {new Date().toLocaleTimeString()}</div>
                <div style={{ textAlign: 'center', marginTop: '12px', color: '#64748b', fontSize: '10.5px', fontWeight: 500 }}>
                  This is a computer generated bill. No signature is required.
                </div>
              </div>
            </div>

            {/* 7. Bottom Lime Green Banner Bar */}
            <div style={{
              backgroundColor: '#99cc00', color: '#ffffff', padding: '10px 16px', borderRadius: '5px',
              display: 'flex', justifyContent: 'space-around', alignItems: 'center', gap: '12px',
              fontSize: '10.5px', fontWeight: 800, flexWrap: 'wrap', marginTop: '24px'
            }}>
              <div style={{ whiteSpace: 'nowrap' }}>📞 {getBranchPhone(activeInvoice.branch)}</div>
              <div style={{ whiteSpace: 'nowrap' }}>✉️ support@spiritualhomeoclinic.com</div>
              <div style={{ whiteSpace: 'nowrap' }}>🌐 spiritualhomeoclinic.com</div>
              <div style={{ whiteSpace: 'nowrap' }}>📍 {(activeInvoice.branch || 'KPHB').toUpperCase()}</div>
            </div>
          </div>

          {/* Bottom Actions Bar (Screen Only) */}
          <div className="no-print" style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap', backgroundColor: '#ffffff' }}>
            <button onClick={onClose} style={{ padding: '10px 18px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#fff', color: '#475569', fontWeight: 700, cursor: 'pointer' }}>
              Close
            </button>
            <button
              onClick={async () => {
                const element = document.getElementById('printable-invoice-receipt');
                const invCode = activeInvoice?.id ? String(activeInvoice.id).substring(0, 6).toUpperCase() : 'RECEIPT';
                const fileName = `SPH_Invoice_INV-${invCode}_${(patientName || 'Patient').replace(/\s+/g, '_')}.pdf`;
                const pPhone = (patientPhone || '').replace(/\D/g, '').slice(-10);

                const isPkg = activeInvoice?.isPackageMember || Number(activeInvoice?.packageFee) > 0 || Number(activeInvoice?.packageTotalAmount) > 0;
                const pkgDur = activeInvoice?.packageDuration || '3 Months';
                const pkgTot = Number(activeInvoice?.packageTotalAmount || activeInvoice?.totalAmount || activeInvoice?.totalPaid || 0).toFixed(2);
                const pkgPaid = Number(activeInvoice?.totalPaid || activeInvoice?.packageFee || 0).toFixed(2);
                const pkgRem = Number(activeInvoice?.packageRemainingAmount !== undefined ? activeInvoice?.packageRemainingAmount : Math.max(0, Number(pkgTot) - Number(pkgPaid))).toFixed(2);

                const text = isPkg
                  ? `*SPIRITUAL HOMEOPATHY - PACKAGE RECEIPT*\nInvoice #: INV-${invCode}\nPatient: ${patientName}\nPackage Duration: ${pkgDur}\nTotal Package Amount: ₹${pkgTot}\nPaid Amount Today: ₹${pkgPaid}\nRemaining Balance Due: ₹${pkgRem}`
                  : `*SPIRITUAL HOMEOPATHY - PAYMENT RECEIPT*\nInvoice #: INV-${invCode}\nPatient: ${patientName}\nTotal Paid: ₹${Number(activeInvoice?.totalPaid || 2000).toFixed(2)}`;

                const generateBlob = async (): Promise<Blob> => {
                  if ((window as any).html2pdf) {
                    return await (window as any).html2pdf().set({
                      margin: [8, 8, 8, 8],
                      filename: fileName,
                      image: { type: 'jpeg', quality: 0.98 },
                      html2canvas: { scale: 2, useCORS: true, logging: false },
                      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
                    }).from(element).output('blob');
                  } else {
                    return new Promise((resolve) => {
                      const script = document.createElement('script');
                      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
                      script.onload = async () => {
                        const blob = await (window as any).html2pdf().set({
                          margin: [8, 8, 8, 8],
                          filename: fileName,
                          image: { type: 'jpeg', quality: 0.98 },
                          html2canvas: { scale: 2, useCORS: true, logging: false },
                          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
                        }).from(element).output('blob');
                        resolve(blob);
                      };
                      document.body.appendChild(script);
                    });
                  }
                };

                try {
                  const pdfBlob = await generateBlob();
                  const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });

                  // 1. Try Native Web Share API with File Attachment (Mobile Web / Native Share)
                  if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
                    await navigator.share({
                      files: [pdfFile],
                      title: `SPH Payment Receipt - ${patientName}`,
                      text: text,
                    });
                    return;
                  }

                  // 2. Desktop Fallback: Open WhatsApp directly to patient number + Download PDF file
                  const waUrl = pPhone ? `https://api.whatsapp.com/send?phone=91${pPhone}&text=${encodeURIComponent(text)}` : `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
                  window.open(waUrl, '_blank');

                  const blobUrl = URL.createObjectURL(pdfBlob);
                  const a = document.createElement('a');
                  a.href = blobUrl;
                  a.download = fileName;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(blobUrl);
                } catch (err) {
                  console.error('Error generating or sharing PDF:', err);
                }
              }}
              style={{ padding: '10px 18px', borderRadius: '8px', border: 'none', background: '#16a34a', color: '#fff', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', boxShadow: '0 4px 12px rgba(22, 163, 74, 0.3)' }}
            >
              <MessageCircle size={16} /> Share PDF Invoice
            </button>
            <button
              onClick={() => {
                const element = document.getElementById('printable-invoice-receipt');
                const invCode = activeInvoice?.id ? String(activeInvoice.id).substring(0, 6).toUpperCase() : 'RECEIPT';
                const fileName = `SPH_Invoice_INV-${invCode}_${(patientName || 'Patient').replace(/\s+/g, '_')}.pdf`;

                if ((window as any).html2pdf) {
                  (window as any).html2pdf().set({
                    margin: [8, 8, 8, 8],
                    filename: fileName,
                    image: { type: 'jpeg', quality: 0.98 },
                    html2canvas: { scale: 2, useCORS: true, logging: false },
                    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
                  }).from(element).save();
                } else {
                  const script = document.createElement('script');
                  script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
                  script.onload = () => {
                    (window as any).html2pdf().set({
                      margin: [8, 8, 8, 8],
                      filename: fileName,
                      image: { type: 'jpeg', quality: 0.98 },
                      html2canvas: { scale: 2, useCORS: true, logging: false },
                      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
                    }).from(element).save();
                  };
                  document.body.appendChild(script);
                }
              }}
              style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', background: '#258ec8', color: '#fff', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', boxShadow: '0 4px 12px rgba(37, 142, 200, 0.3)' }}
            >
              📥 Download PDF Receipt
            </button>
            <button
              onClick={() => {
                const printWindow = window.open('', '_blank', 'width=900,height=1000');
                if (!printWindow) return alert('Popup blocked! Please allow popups.');

                const invCode = activeInvoice?.id ? String(activeInvoice.id).substring(0, 6).toUpperCase() : 'RECEIPT';
                const totalAmount = Number(activeInvoice.totalPaid || activeInvoice.targetAmount || 2000).toFixed(2);
                const docName = activeInvoice.doctorName || activeInvoice.doctor || 'Dr. Prashanth K Vaidya';
                const branchName = activeInvoice.branch || 'KPHB Branch';
                const currentDate = activeInvoice.appointmentDate || activeInvoice.date || new Date().toLocaleDateString('en-GB');

                const htmlContent = `
                  <!DOCTYPE html>
                  <html>
                  <head>
                    <title>Invoice - INV-${invCode}</title>
                    <style>
                      body { font-family: Arial, sans-serif; padding: 30px; color: #1e293b; margin: 0; background: #fff; }
                      .header { display: flex; justify-content: space-between; border-bottom: 2px solid #298FCA; padding-bottom: 15px; }
                      .brand-title { color: #0284c7; font-size: 20px; font-weight: 900; text-transform: uppercase; margin: 0; }
                      .brand-sub { font-size: 11px; color: #475569; margin-top: 2px; }
                      .title { font-size: 18px; font-weight: bold; color: #1e293b; text-transform: uppercase; margin-top: 20px; }
                      .amount-box { background: #f0fdf4; border: 1.5px dashed #22c55e; padding: 15px; margin: 20px 0; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; }
                      .table { width: 100%; border-collapse: collapse; margin-top: 15px; }
                      .table th, .table td { padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: left; }
                      .footer-bar { background: #99cc00; color: #fff; padding: 10px; border-radius: 4px; display: flex; justify-content: space-between; font-size: 11px; margin-top: 30px; }
                      @media print { body { padding: 0; } }
                    </style>
                  </head>
                  <body>
                    <div class="header">
                      <div>
                        <h2 class="brand-title">Spiritual Homeopathy</h2>
                        <div class="brand-sub">Multispecialty Homeopathy Clinic</div>
                      </div>
                      <div style="text-align: right;">
                        <div>spiritualhomeoclinic.com</div>
                        <div style="color: #64748b; font-size: 12px;">${currentDate}</div>
                      </div>
                    </div>
                    <h3 class="title">Payment Receipt</h3>
                    <p><strong>Patient:</strong> ${patientName} | <strong>Phone:</strong> +91 ${patientPhone}</p>
                    <p><strong>Doctor:</strong> ${docName} | <strong>Branch:</strong> ${branchName}</p>
                    <div class="amount-box">
                      <h3 style="margin: 0;">Total Amount Paid: ₹${totalAmount}</h3>
                      <span style="color: #22c55e; font-weight: bold; font-size: 16px;">PAID ✓</span>
                    </div>
                    <table class="table">
                      <thead>
                        <tr>
                          <th>Description</th>
                          <th style="text-align: right;">Amount</th>
                        </tr>
                      </thead>
                        ${activeInvoice.paymentTypePreset === 'consultation_med'
                    ? `<tr><td>Consultation and Medicine</td><td style="text-align: right;">₹${Number(activeInvoice.consultationFee || activeInvoice.totalPaid || totalAmount).toFixed(2)}</td></tr>`
                    : activeInvoice.paymentTypePreset === 'consultation'
                      ? `<tr><td>Consultation Fee</td><td style="text-align: right;">₹${Number(activeInvoice.consultationFee || activeInvoice.totalPaid || totalAmount).toFixed(2)}</td></tr>`
                      : activeInvoice.paymentTypePreset === 'split'
                        ? `
                            ${Number(activeInvoice.consultationFee) > 0 ? `<tr><td>Consultation Fee</td><td style="text-align: right;">₹${Number(activeInvoice.consultationFee).toFixed(2)}</td></tr>` : ''}
                            ${activeInvoice.medicines && activeInvoice.medicines.length > 0
                              ? activeInvoice.medicines.map((m: any, idx: number) => {
                                const medName = m.name && m.name.trim() ? m.name.trim() : (activeInvoice.medicines.length === 1 ? 'Medicine Fee' : `Medicine ${idx + 1}`);
                                const typeDisplay = m.type && m.type.trim() ? ` [${m.type.trim()}]` : '';
                                const timingDisplay = m.timing && m.timing.trim() ? ` [${m.timing.trim()}]` : '';
                                const durationDisplay = activeInvoice.medicineDuration ? ` (${activeInvoice.medicineDuration})` : '';
                                return `<tr><td>${medName}${typeDisplay}${timingDisplay}${durationDisplay}</td><td style="text-align: right;">₹${Number(m.amount).toFixed(2)}</td></tr>`;
                              }).join('')
                              : (Number(activeInvoice.medicineFee) > 0 ? `<tr><td>Medicine Fee${activeInvoice.medicineDuration ? ` (${activeInvoice.medicineDuration})` : ''}</td><td style="text-align: right;">₹${Number(activeInvoice.medicineFee).toFixed(2)}</td></tr>` : '')}
                          `
                        : `
                            ${Number(activeInvoice.consultationFee) > 0 ? `<tr><td>Consultation Fee</td><td style="text-align: right;">₹${Number(activeInvoice.consultationFee).toFixed(2)}</td></tr>` : ''}
                            ${Number(activeInvoice.medicineFee) > 0 ? `<tr><td>Medicine Fee${activeInvoice.medicineDuration ? ` (${activeInvoice.medicineDuration})` : ''}</td><td style="text-align: right;">₹${Number(activeInvoice.medicineFee).toFixed(2)}</td></tr>` : ''}
                          `}
                        ${Number(activeInvoice.dietFee) > 0 ? `<tr><td>Diet & Nutrition Fee</td><td style="text-align: right;">₹${Number(activeInvoice.dietFee).toFixed(2)}</td></tr>` : ''}
                        <tr style="font-weight: bold; background: #f8fafc; border-top: 2px solid #258ec8;"><td style="text-transform: uppercase;">Total Paid (${activeInvoice.paymentMode || 'UPI'})</td><td style="text-align: right; color: #166534; font-size: 14px;">₹${totalAmount}</td></tr>
                      </tbody>
                    </table>
                    <div style="text-align: center; margin-top: 14px; margin-bottom: 8px; color: #64748b; font-size: 11px;">
                      This is a computer generated bill. No signature is required.
                    </div>
                    <div class="footer-bar">
                      <div>📞 ${getBranchPhone(branchName)}</div>
                      <div>✉️ support@spiritualhomeoclinic.com</div>
                      <div>🌐 spiritualhomeoclinic.com</div>
                      <div>📍 ${branchName.toUpperCase()}</div>
                    </div>
                    <script>
                      window.onload = function() {
                        window.print();
                      }
                    </script>
                  </body>
                  </html>
                `;

                printWindow.document.write(htmlContent);
                printWindow.document.close();
              }}
              style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', background: '#258ec8', color: '#fff', fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 12px rgba(37, 142, 200, 0.3)' }}
            >
              🖨️ Print / Save PDF
            </button>
          </div>
        </div>
      )}

      {/* ---------------- 3. PAYMENT SUCCESS POPUP MODAL ---------------- */}
      {paymentSuccessPopup && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(6px)',
          zIndex: 12000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '24px',
            padding: '32px 28px',
            maxWidth: '460px',
            width: '100%',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            textAlign: 'center',
            position: 'relative'
          }}>
            {/* Top Close Button */}
            <button
              onClick={() => {
                setPaymentSuccessPopup(null);
                onClose();
              }}
              style={{
                position: 'absolute',
                top: '16px',
                right: '16px',
                background: '#f1f5f9',
                border: 'none',
                borderRadius: '50%',
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: '#64748b'
              }}
            >
              <X size={18} />
            </button>

            {/* Success Icon Circle */}
            <div style={{
              width: '76px',
              height: '76px',
              borderRadius: '50%',
              backgroundColor: '#dcfce7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 18px auto',
              color: '#16a34a'
            }}>
              <CheckCircle2 size={46} strokeWidth={2.5} />
            </div>

            <h3 style={{ margin: '0 0 6px 0', fontSize: '22px', fontWeight: 900, color: '#0f172a' }}>
              Payment Successful!
            </h3>
            <p style={{ margin: '0 0 20px 0', fontSize: '13.5px', color: '#64748b' }}>
              Fee has been collected and recorded successfully.
            </p>

            {/* Amount Highlight Box */}
            <div style={{
              background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)',
              border: '1.5px dashed #86efac',
              borderRadius: '16px',
              padding: '18px 20px',
              marginBottom: '18px'
            }}>
              <div style={{ fontSize: '11px', fontWeight: 800, color: '#166534', letterSpacing: '0.8px', textTransform: 'uppercase' }}>
                Total Amount Collected
              </div>
              <div style={{ fontSize: '32px', fontWeight: 900, color: '#15803d', margin: '4px 0' }}>
                ₹ {paymentSuccessPopup.totalPaid.toLocaleString('en-IN')}
              </div>
              <div style={{ display: 'inline-block', background: '#dcfce7', color: '#166534', fontSize: '12px', fontWeight: 700, padding: '3px 12px', borderRadius: '12px', marginTop: '2px' }}>
                Paid via {paymentSuccessPopup.paymentMode}
              </div>
            </div>

            {/* Patient Details Card */}
            <div style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '14px',
              padding: '14px 18px',
              marginBottom: '24px',
              textAlign: 'left'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                  Patient Name
                </span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#258ec8' }}>
                  {appointment.regId ? `ID: ${appointment.regId}` : 'Patient File'}
                </span>
              </div>
              <div style={{ fontSize: '17px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <User size={18} color="#258ec8" />
                {paymentSuccessPopup.patientName}
              </div>
              {appointment.phone && (
                <div style={{ fontSize: '12.5px', color: '#475569', marginTop: '4px', marginLeft: '26px' }}>
                  📱 +91 {appointment.phone}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                onClick={() => {
                  setInvoiceApp(paymentSuccessPopup.completedInvoice);
                  setPaymentSuccessPopup(null);
                }}
                style={{
                  width: '100%',
                  padding: '13px',
                  borderRadius: '12px',
                  border: 'none',
                  background: '#258ec8',
                  color: '#ffffff',
                  fontWeight: 800,
                  fontSize: '14px',
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(37, 142, 200, 0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                📄 View & Print Digital Invoice ➔
              </button>

              <button
                onClick={() => {
                  setPaymentSuccessPopup(null);
                  onClose();
                }}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '12px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#475569',
                  fontWeight: 700,
                  fontSize: '13.5px',
                  cursor: 'pointer'
                }}
              >
                Done & Return to Dashboard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Prescription Image Zoom Preview Modal */}
      {previewModalUrl && (
        <div
          onClick={() => setPreviewModalUrl(null)}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(15, 23, 42, 0.85)',
            backdropFilter: 'blur(4px)',
            zIndex: 10001,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '20px'
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'relative',
              maxWidth: '90vw',
              maxHeight: '90vh',
              background: '#fff',
              borderRadius: '16px',
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <div style={{
              padding: '12px 18px',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              background: '#f8fafc'
            }}>
              <span style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>Prescription Document Preview</span>
              <button
                onClick={() => setPreviewModalUrl(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={20} />
              </button>
            </div>
            <div style={{ padding: '16px', overflow: 'auto', maxHeight: 'calc(90vh - 60px)', display: 'flex', justifyContent: 'center' }}>
              <img
                src={previewModalUrl}
                alt="Prescription Preview"
                style={{ maxWidth: '100%', maxHeight: '78vh', objectFit: 'contain', borderRadius: '8px' }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default CollectFeeCheckoutModal;
