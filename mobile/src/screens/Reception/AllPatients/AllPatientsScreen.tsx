import React, { useState, useMemo, useEffect, useCallback, memo } from 'react';
import {
  StyleSheet, Text, View, FlatList, TextInput, TouchableOpacity,
  Modal, Alert, Linking, ActivityIndicator, Platform, ScrollView,
  SafeAreaView, Image, Dimensions, StatusBar, BackHandler, PanResponder, ToastAndroid
} from 'react-native';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import {
  getSafeDb, collection, query, where, getDocs, limit,
  doc, getDoc, updateDoc, setDoc, arrayUnion, arrayRemove
} from '../../../utils/firebaseSafe';
import { sanitizeDoctorName } from '@app/shared';
import { receptionDataStore } from '../../../utils/receptionDataStore';
import { getPatientVisitState } from '../../../utils/patientVisitState';

// --- Type Definitions ---
export interface Patient {
  id: string;
  name: string;
  phone: string;
  age?: number | string;
  gender?: string;
  branchName: string;
  branchId?: string;
  appointmentDate: string; // YYYY-MM-DD or DD-MM-YYYY
  appointmentTime?: string;
  doctorName?: string;
  status: 'active' | 'completed' | 'follow_up' | 'awaiting_payment' | string;
  regId?: string;
  subject?: string;
  raw?: any;
}

export interface PatientVisitHistoryItem {
  id: string;
  date: string;
  time: string;
  branch: string;
  doctor: string;
  status: string;
  amountPaid: number;
  totalAmount?: number;
  consultationFee?: number;
  medicineFee?: number;
  discount?: number;
  paymentMode: string;
  paymentStatus: string;
  paymentId?: string;
  splitDetails?: string;
  paymentDate?: string;
  paymentTime?: string;
  visitNumber?: number;
  chiefComplaint?: string;
  diagnosisNotes?: string;
  doctorNotes?: string;
  medicines: Array<{
    name: string;
    potency?: string;
    dosage?: string;
    frequency?: string;
    duration?: string;
    instructions?: string;
  }>;
  prescriptionImages: string[];
  raw?: any;
}

export interface PatientFamilyProfile {
  profileKey: string;
  name: string;
  regId: string;
  phone: string;
  branch: string;
  age?: string | number;
  gender?: string;
  primaryDocId: string;
  visits: PatientVisitHistoryItem[];
  rawDocs: any[];
}

// Helper to stream prescription images to Firebase Storage
const uploadPrescriptionToStorage = async (dataOrUri: string, patId?: string): Promise<string> => {
  if (!dataOrUri) return '';
  if (dataOrUri.startsWith('http://') || dataOrUri.startsWith('https://')) {
    return dataOrUri;
  }

  const bucket = "spiritual-homeopathy-3b552.firebasestorage.app";
  const safePatId = (patId || 'unknown').toString().replace(/[^a-zA-Z0-9_-]/g, '_');
  let ext = 'jpg';
  let contentType = 'image/jpeg';
  if (dataOrUri.includes('image/png') || dataOrUri.endsWith('.png')) {
    ext = 'png';
    contentType = 'image/png';
  }

  const filename = `prescriptions/${safePatId}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
  const encodedPath = encodeURIComponent(filename);

  let localFileToUpload = dataOrUri;
  let isTempFile = false;

  try {
    if (dataOrUri.startsWith('data:') || (!dataOrUri.startsWith('file://') && !dataOrUri.startsWith('content://'))) {
      const commaIdx = dataOrUri.indexOf(',');
      const base64Data = commaIdx !== -1 ? dataOrUri.substring(commaIdx + 1) : dataOrUri;
      const tempPath = `${FileSystem.cacheDirectory}rx_${Date.now()}_${Math.random().toString(36).substring(2, 6)}.${ext}`;
      await FileSystem.writeAsStringAsync(tempPath, base64Data, {
        encoding: FileSystem.EncodingType.Base64,
      });
      localFileToUpload = tempPath;
      isTempFile = true;
    }

    const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket}/o?name=${encodedPath}`;
    const uploadResult = await FileSystem.uploadAsync(uploadUrl, localFileToUpload, {
      httpMethod: 'POST',
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
      headers: {
        'Content-Type': contentType,
      },
    });

    if (uploadResult.status >= 200 && uploadResult.status < 300) {
      let downloadTokens = '';
      try {
        const parsed = JSON.parse(uploadResult.body);
        downloadTokens = parsed.downloadTokens || '';
      } catch (_) { }
      return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedPath}?alt=media&token=${downloadTokens}`;
    }
  } catch (err) {
    console.warn("Storage upload notice:", err);
  } finally {
    if (isTempFile) {
      try {
        await FileSystem.deleteAsync(localFileToUpload, { idempotent: true });
      } catch (_) { }
    }
  }
  return dataOrUri;
};

interface AllPatientsScreenProps {
  onNavigate?: (tab: string, patient?: any) => void;
  currentBranch?: string;
  onBack?: () => boolean | void;
  isActive?: boolean;
}

// --- Helper Functions for Date & Branch Normalize ---
const getFormattedDateStr = (dateObj: Date): string => {
  const yyyy = dateObj.getFullYear();
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const dd = String(dateObj.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const normalizeDateToISO = (raw: any): string => {
  if (!raw) return '';
  if (typeof raw === 'object') {
    if (typeof raw.toDate === 'function') {
      try {
        return getFormattedDateStr(raw.toDate());
      } catch (_) { }
    }
    if (typeof raw.seconds === 'number') {
      try {
        return getFormattedDateStr(new Date(raw.seconds * 1000));
      } catch (_) { }
    }
    if (raw instanceof Date && !isNaN(raw.getTime())) {
      return getFormattedDateStr(raw);
    }
  }

  const clean = String(raw).trim();
  if (!clean || clean === '[object Object]' || clean === 'undefined' || clean === 'null') return '';
  if (clean.includes('T')) {
    const parsed = new Date(clean);
    if (!isNaN(parsed.getTime())) {
      return getFormattedDateStr(parsed);
    }
    return clean.split('T')[0];
  }

  // Take date portion before any space/time (e.g. "19-10-2026 10:30 AM" -> "19-10-2026")
  const datePortion = clean.split(/\s+/)[0];

  if (datePortion.includes('/') || datePortion.includes('-')) {
    const parts = datePortion.split(/[\/\-]/);
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        // YYYY-MM-DD
        const yyyy = parts[0];
        const mm = parts[1].padStart(2, '0');
        const dd = parts[2].padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
      } else if (parts[2].length === 4 || parts[2].length === 2) {
        // DD-MM-YYYY or MM-DD-YYYY or DD-MM-YY
        const yyyy = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
        const p0 = parseInt(parts[0], 10);
        const p1 = parseInt(parts[1], 10);
        let dd = '';
        let mm = '';
        if (p1 > 12) {
          // parts[1] is day, parts[0] is month (e.g. 10/29/2026)
          mm = parts[0].padStart(2, '0');
          dd = parts[1].padStart(2, '0');
        } else if (p0 > 12) {
          // parts[0] is day, parts[1] is month (e.g. 29/10/2026)
          dd = parts[0].padStart(2, '0');
          mm = parts[1].padStart(2, '0');
        } else {
          // Both <= 12: default Indian clinical convention is DD-MM-YYYY
          dd = parts[0].padStart(2, '0');
          mm = parts[1].padStart(2, '0');
        }
        return `${yyyy}-${mm}-${dd}`;
      }
    }
  }

  const parsed = new Date(clean);
  if (!isNaN(parsed.getTime())) {
    return getFormattedDateStr(parsed);
  }

  return datePortion;
};

const formatPrettyDate = (dateStr?: string): string => {
  if (!dateStr) return '';
  const clean = normalizeDateToISO(dateStr);
  if (!clean || !clean.includes('-')) return String(dateStr);
  const parts = clean.split('-');
  if (parts.length === 3) {
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const yyyy = parts[0];
    const mm = parts[1];
    const dd = parts[2];
    const mIdx = parseInt(mm, 10) - 1;
    if (mIdx >= 0 && mIdx < 12) {
      return `${dd} ${monthNames[mIdx]} ${yyyy}`;
    }
  }
  return clean;
};

const extractPaymentDateTime = (data: any): { paymentDate: string; paymentTime?: string } => {
  if (!data) return { paymentDate: '', paymentTime: '' };
  // Only check authentic payment collection / transaction timestamps.
  // NEVER fallback to appointmentDate, appointmentTime, or updatedAt here!
  const rawDate = data.paymentCollectedAt || data.paidAt || data.transactionDate || data.collectionDate || data.paidDate;
  let paymentDate = '';
  let paymentTime = '';

  if (rawDate) {
    if (typeof rawDate === 'object') {
      if (typeof rawDate.toDate === 'function') {
        try {
          const d = rawDate.toDate();
          paymentDate = getFormattedDateStr(d);
          paymentTime = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
        } catch (_) {}
      } else if (typeof rawDate.seconds === 'number') {
        try {
          const d = new Date(rawDate.seconds * 1000);
          paymentDate = getFormattedDateStr(d);
          paymentTime = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
        } catch (_) {}
      } else if (rawDate instanceof Date && !isNaN(rawDate.getTime())) {
        paymentDate = getFormattedDateStr(rawDate);
        paymentTime = rawDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
      }
    } else {
      const str = String(rawDate).trim();
      paymentDate = normalizeDateToISO(str);
      if (str.includes('T') || str.includes(':')) {
        try {
          const d = new Date(str);
          if (!isNaN(d.getTime())) {
            paymentTime = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
          }
        } catch (_) {}
      }
    }
  }

  // Explicit payment time if recorded separately
  if (!paymentTime && data.paymentTime) {
    paymentTime = String(data.paymentTime);
  }

  return { paymentDate, paymentTime };
};

const normalizeBranchName = (b: string): string => {
  return (b || '').toLowerCase().replace(/\s*branch\s*/i, '').trim();
};

const getBranchShortcut = (str: string): string => {
  if (str.includes('kphb') || str.includes('kukatpally')) return 'kphb';
  if (str.includes('nalla') || str.includes('nallagandla')) return 'nalla';
  if (str.includes('chanda') || str.includes('chnr') || str.includes('chandanagar')) return 'chanda';
  if (str.includes('dilshuk') || str.includes('dilsukh') || str.includes('dsnr') || str.includes('dshnr')) return 'dsnr';
  return str;
};

const isBranchMatching = (b1: string, b2?: string): boolean => {
  if (!b2 || b2 === 'all' || b2 === 'All Branches') return true;
  const n1 = normalizeBranchName(b1);
  const n2 = normalizeBranchName(b2);
  if (n1 === n2 || n1.includes(n2) || n2.includes(n1)) return true;
  return getBranchShortcut(n1) === getBranchShortcut(n2);
};

// Extract real amount paid, payment mode, and split details
const extractAmountAndPaymentMode = (data: any): { amountPaid: number; totalAmount: number; mode: string; status: string; splitDetails?: string; paymentId?: string } => {
  const rawPaid = data.totalPaid ?? data.paidAmount ?? data.amountPaid ?? data.paymentAmount ?? data.amount;
  const consultFee = Number(data.consultationFee) || 0;
  const medFee = Number(data.medicineFee || data.totalMedicineFee) || 0;
  const disc = Number(data.discount || data.discountAmount) || 0;
  const total = Number(data.totalAmount) || Math.max(0, consultFee + medFee - disc);

  let amountPaid = 0;
  let status = String(data.paymentStatus || data.status || 'pending').toLowerCase();
  let mode = String(data.paymentMode || data.paymentMethod || data.method || 'Cash').trim();

  if (rawPaid !== undefined && rawPaid !== null && rawPaid !== '' && !isNaN(Number(rawPaid))) {
    amountPaid = Number(rawPaid);
    if (amountPaid > 0) status = 'paid';
  } else if (status === 'paid' || status === 'completed') {
    amountPaid = total > 0 ? total : 0;
  } else if (total > 0) {
    amountPaid = total;
  }

  // Handle Split payment details
  let splitDetails = undefined;
  if (mode.toLowerCase().includes('split') || data.splitMethod1 || data.splitMethod2) {
    const m1 = data.splitMethod1 || 'Cash';
    const a1 = Number(data.splitAmount1 || 0);
    const m2 = data.splitMethod2 || 'UPI';
    const a2 = Number(data.splitAmount2 || 0);
    splitDetails = `${m1}: ₹${a1.toLocaleString('en-IN')} + ${m2}: ₹${a2.toLocaleString('en-IN')}`;
    mode = 'Split';
  }

  const paymentId = data.paymentId || data.transactionId || data.receiptId || data.billId || '';

  return { amountPaid, totalAmount: total, mode: mode || 'Cash', status, splitDetails, paymentId };
};

// Extract medicines & remedies from record
const extractMedicinesFromRecord = (data: any): any[] => {
  const docMedicines = data.items || data.medicines || data.remedies || data.prescribedMedicines || data.prescriptionItems || data.medications || data.rx || data.typedPrescriptions || [];
  if (!Array.isArray(docMedicines)) return [];
  return docMedicines.map(m => {
    if (typeof m === 'string') return { name: m, potency: '', dosage: '4 Pills', frequency: 'Twice Daily', duration: '7 Days', instructions: '' };
    return {
      name: m.name || m.remedyName || m.medicineName || 'Remedy',
      potency: m.potency || m.potencyOption || '',
      dosage: m.dosage || m.pills || '4 Pills',
      frequency: m.frequency || m.times || 'Twice Daily',
      duration: m.duration || m.days || '7 Days',
      instructions: m.instructions || m.dosageInstructions || ''
    };
  });
};

// Extract attached prescription images & canvas URLs
const extractPrescriptionImagesFromRecord = (data: any): string[] => {
  const images: string[] = [];
  const pushIfValid = (v: any) => {
    if (!v) return;
    if (Array.isArray(v)) {
      v.forEach(x => {
        if (typeof x === 'string' && x.trim() && (x.startsWith('http') || x.startsWith('data:'))) {
          images.push(x.trim());
        } else if (x && typeof x === 'object') {
          const u = x.url || x.imageUrl || x.prescriptionUrl || x.fileUrl || x.uri || x.downloadURL;
          if (u && typeof u === 'string' && (u.startsWith('http') || u.startsWith('data:'))) images.push(u.trim());
        }
      });
    } else if (typeof v === 'string' && v.trim() && (v.startsWith('http') || v.startsWith('data:'))) {
      images.push(v.trim());
    } else if (v && typeof v === 'object') {
      const u = v.url || v.imageUrl || v.prescriptionUrl || v.fileUrl || v.uri || v.downloadURL;
      if (u && typeof u === 'string' && (u.startsWith('http') || u.startsWith('data:'))) images.push(u.trim());
    }
  };

  pushIfValid(data.uploadedPrescriptions);
  pushIfValid(data.prescriptionUrls);
  pushIfValid(data.prescriptionUrl);
  pushIfValid(data.prescriptionImage);
  pushIfValid(data.prescriptionImages);
  pushIfValid(data.canvasPrescriptionUrl);
  pushIfValid(data.canvasUrl);
  pushIfValid(data.reports);
  pushIfValid(data.images);
  pushIfValid(data.rxUrl);
  pushIfValid(data.rxUrls);

  return Array.from(new Set(images.filter(Boolean)));
};

const parsePoolToPatients = (pool: any[], currentBranch?: string, todayStr?: string): Patient[] => {
  const patientSessionMap = new Map<string, Patient>();
  const isHQRole = !currentBranch || currentBranch.toLowerCase().includes('admin') || currentBranch.toLowerCase().includes('hr') || currentBranch === 'All Branches';

  (pool || []).forEach((data, idx) => {
    if (!data) return;
    const idKey = data.id || data.docId || String(idx);

    const bName = data.branch || data.targetBranch || data.branchName || currentBranch || 'KPHB Branch';
    if (!isHQRole && currentBranch && !isBranchMatching(bName, currentBranch)) {
      return;
    }
    const cleanPhone = String(data.phoneNumber || data.phone || data.mobile || data.contactNumber || '').replace(/\D/g, '').slice(-10);
    const pName = data.patientName || data.name || data.fullName || 'Patient';
    const regId = data.registrationId || data.regId || data.regNo || data.patientId || idKey;
    // Extract actual clinic appointment / booking date.
    // NEVER use scheduledDate or preferredFollowUpDate here (those are future follow-up reminder dates, not visit dates!)
    const rawDate = data.appointmentDate || data.date || data.bookingDate || data.slotDate || data.dateString || data.createdAt;
    const isoDate = normalizeDateToISO(rawDate);

    // If this is a future date (> today) and not a completed visit, skip it so future follow-up dates never show as 'Pay Pending'
    const todayYMD = todayStr || getFormattedDateStr(new Date());
    const isFutureDate = Boolean(isoDate && isoDate > todayYMD);

    let status = 'active';
    const s = String(data.status || '').toLowerCase().trim();
    const p = String(data.paymentStatus || '').toLowerCase().trim();
    if (s === 'completed' || s === 'done' || s === 'paid' || p === 'paid') {
      status = 'completed';
    } else if (s === 'follow_up' || s === 'followup' || data.followUpOpted === true) {
      status = 'follow_up';
    } else if (s === 'collect_fee' || s === 'awaiting_payment' || p === 'pending') {
      // Future dates are NOT 'awaiting_payment' today! They are upcoming scheduled appointments
      status = isFutureDate ? 'scheduled' : 'awaiting_payment';
    }

    // Skip future uncompleted placeholder follow-up slots from appearing in the primary patient list
    if (isFutureDate && status !== 'completed') {
      return;
    }

    // Session deduplication key: combines cleanPhone/regId + date so multiple entries for the same patient on that day merge together!
    const sessionKey = cleanPhone ? `${cleanPhone}_${isoDate}` : (regId ? `${regId.toLowerCase()}_${isoDate}` : idKey);

    if (!patientSessionMap.has(sessionKey)) {
      patientSessionMap.set(sessionKey, {
        id: idKey,
        name: pName,
        phone: cleanPhone || String(data.phoneNumber || data.phone || ''),
        age: data.age || data.patientAge,
        gender: data.gender || 'Male',
        branchName: bName,
        appointmentDate: isoDate,
        appointmentTime: data.appointmentTime || data.time || '10:00 AM',
        doctorName: sanitizeDoctorName(data.doctorName || data.doctor, bName),
        status: status,
        regId: regId,
        raw: data
      });
    } else {
      // Merge with existing record to avoid duplicate cards on the same session
      const existing = patientSessionMap.get(sessionKey)!;
      if (status === 'completed') {
        existing.status = 'completed';
      } else if (status === 'follow_up' && existing.status !== 'completed') {
        existing.status = 'follow_up';
      }
      if ((!existing.doctorName || existing.doctorName === 'Homeopathic Doctor') && (data.doctorName || data.doctor)) {
        existing.doctorName = sanitizeDoctorName(data.doctorName || data.doctor, bName);
      }
      if (!existing.age && (data.age || data.patientAge)) {
        existing.age = data.age || data.patientAge;
      }
      if (existing.appointmentTime === '10:00 AM' && data.appointmentTime && data.appointmentTime !== '10:00 AM') {
        existing.appointmentTime = data.appointmentTime;
      }
    }
  });

  const list = Array.from(patientSessionMap.values());
  list.sort((a, b) => String(b.appointmentDate || '').localeCompare(String(a.appointmentDate || '')));
  return list;
};

// --- Consolidate & Merge Patient Visits (Unifies Appointments + Prescriptions + Bills into Single Visits) ---
const consolidateVisitsForPatient = (rawDocs: any[], fallbackPatient: Patient): PatientVisitHistoryItem[] => {
  if (!rawDocs || rawDocs.length === 0) return [];

  // Key -> Consolidated Visit
  const visitMap = new Map<string, PatientVisitHistoryItem>();
  // Map of documentId / appointmentId -> canonical date key
  const aptIdToKeyMap = new Map<string, string>();

  // Pass 1: Index all true appointment documents to their scheduled visit dates
  // Only documents with an explicit appointment/booking date populate the index!
  for (const d of rawDocs) {
    if (!d) continue;
    const docId = d.id || d.docId || '';
    const aptId = d.appointmentId || d.bookingId || d.aptId || d.visitId || '';

    // Prefer explicit appointmentDate, date, bookingDate, or slotDate over generic createdAt
    const explicitDate = d.appointmentDate || d.date || d.bookingDate || d.slotDate;
    if (explicitDate) {
      const isoDate = normalizeDateToISO(explicitDate);
      if (isoDate) {
        if (docId) aptIdToKeyMap.set(docId, isoDate);
        if (aptId) aptIdToKeyMap.set(aptId, isoDate);
      }
    }
  }

  // Pass 2: Merge each document (appointment, prescription, product_bill, transaction) into the visit on its date
  for (const d of rawDocs) {
    if (!d) continue;
    const docId = d.id || d.docId || '';
    const aptId = d.appointmentId || d.bookingId || d.aptId || d.visitId || '';

    let targetKey = '';
    if (aptId && aptIdToKeyMap.has(aptId)) {
      targetKey = aptIdToKeyMap.get(aptId)!;
    } else if (docId && aptIdToKeyMap.has(docId)) {
      targetKey = aptIdToKeyMap.get(docId)!;
    } else {
      const rawDate = d.appointmentDate || d.date || d.bookingDate || d.slotDate || d.createdAt || fallbackPatient.appointmentDate;
      targetKey = normalizeDateToISO(rawDate) || getFormattedDateStr(new Date());
    }

    const pm = extractAmountAndPaymentMode(d);
    const payDT = extractPaymentDateTime(d);
    const meds = extractMedicinesFromRecord(d);
    const imgs = extractPrescriptionImagesFromRecord(d);
    const bName = d.branch || d.targetBranch || d.branchName || fallbackPatient.branchName || 'Clinic';
    const docName = sanitizeDoctorName(d.doctorName || d.doctor, bName);
    const rawTime = d.appointmentTime || d.time || d.timeSlot || '';

    const isPaidRecord = pm.amountPaid > 0 || pm.status === 'paid' || d.status === 'completed';
    const todayStr = getFormattedDateStr(new Date());
    let initialPaymentDate = payDT.paymentDate || '';
    if (!initialPaymentDate && isPaidRecord) {
      const createdIso = d.createdAt ? normalizeDateToISO(d.createdAt) : '';
      if (createdIso && createdIso <= todayStr) {
        initialPaymentDate = createdIso;
      } else if (targetKey <= todayStr) {
        initialPaymentDate = targetKey;
      }
    }

    if (!visitMap.has(targetKey)) {
      visitMap.set(targetKey, {
        id: docId || targetKey,
        date: targetKey,
        time: rawTime || '10:00 AM',
        branch: bName,
        doctor: docName || fallbackPatient.doctorName || 'Homeopathic Doctor',
        status: d.status || (isPaidRecord ? 'completed' : 'active'),
        amountPaid: pm.amountPaid,
        totalAmount: pm.totalAmount,
        consultationFee: Number(d.consultationFee) || 0,
        medicineFee: Number(d.medicineFee || d.totalMedicineFee) || 0,
        discount: Number(d.discount || d.discountAmount) || 0,
        paymentMode: pm.mode,
        paymentStatus: pm.status,
        paymentId: pm.paymentId,
        splitDetails: pm.splitDetails,
        paymentDate: initialPaymentDate,
        paymentTime: payDT.paymentTime || '',
        chiefComplaint: d.chiefComplaint || d.subject || d.complaints || '',
        diagnosisNotes: d.diagnosisNotes || d.diagnosis || d.diseases || '',
        doctorNotes: d.doctorNotes || d.notes || d.advice || d.instructions || '',
        medicines: [...meds],
        prescriptionImages: [...imgs],
        raw: d
      });
    } else {
      const existing = visitMap.get(targetKey)!;

      // Merge payment date and time if available
      if (payDT.paymentDate) {
        existing.paymentDate = payDT.paymentDate;
      } else if (!existing.paymentDate && isPaidRecord) {
        const createdIso = d.createdAt ? normalizeDateToISO(d.createdAt) : '';
        if (createdIso && createdIso <= todayStr) {
          existing.paymentDate = createdIso;
        } else if (targetKey <= todayStr) {
          existing.paymentDate = targetKey;
        }
      }
      if (payDT.paymentTime && !existing.paymentTime) {
        existing.paymentTime = payDT.paymentTime;
      }

      // Merge doctor name (prefer actual doctor over generic placeholder)
      if ((!existing.doctor || existing.doctor === 'Homeopathic Doctor' || existing.doctor === 'Doctor') && docName && docName !== 'Homeopathic Doctor') {
        existing.doctor = docName;
      }

      // Merge branch
      if ((!existing.branch || existing.branch === 'Clinic') && bName && bName !== 'Clinic') {
        existing.branch = bName;
      }

      // Merge time
      if ((!existing.time || existing.time === '10:00 AM') && rawTime && rawTime !== '10:00 AM') {
        existing.time = rawTime;
      }

      // Merge status (completed or follow_up has precedence over pending/active)
      const s = String(d.status || '').toLowerCase();
      if (s === 'completed' || s === 'done' || s === 'paid' || pm.status === 'paid') {
        existing.status = 'completed';
      } else if (s === 'follow_up' && existing.status !== 'completed') {
        existing.status = 'follow_up';
      }

      // Merge payment info WITHOUT double-counting duplicate records
      if (pm.amountPaid > 0) {
        if (existing.amountPaid === 0) {
          existing.amountPaid = pm.amountPaid;
          existing.paymentMode = pm.mode;
          existing.paymentStatus = pm.status;
          existing.paymentId = pm.paymentId || existing.paymentId;
          existing.splitDetails = pm.splitDetails || existing.splitDetails;
        } else if (pm.amountPaid === existing.amountPaid) {
          // Exactly identical amount from twin appointment/allpatients doc -> keep single amount
          if (pm.mode && pm.mode !== 'Cash') existing.paymentMode = pm.mode;
          if (pm.splitDetails) existing.splitDetails = pm.splitDetails;
          if (pm.paymentId) existing.paymentId = pm.paymentId;
        } else {
          const isProductBill = d.collectionName === 'product_bills' || !!d.billId || !!d.itemsPrice;
          if (isProductBill) {
            existing.amountPaid += pm.amountPaid;
          } else {
            existing.amountPaid = Math.max(existing.amountPaid, pm.amountPaid);
          }
        }
      }

      // Merge fees
      existing.totalAmount = Math.max(Number(existing.totalAmount) || 0, Number(pm.totalAmount) || 0);
      existing.consultationFee = Math.max(Number(existing.consultationFee) || 0, Number(d.consultationFee) || 0);
      existing.medicineFee = Math.max(Number(existing.medicineFee) || 0, Number(d.medicineFee || d.totalMedicineFee) || 0);
      existing.discount = Math.max(Number(existing.discount) || 0, Number(d.discount || d.discountAmount) || 0);

      // Merge clinical notes
      if (!existing.chiefComplaint && (d.chiefComplaint || d.subject || d.complaints)) {
        existing.chiefComplaint = d.chiefComplaint || d.subject || d.complaints;
      }
      if (!existing.diagnosisNotes && (d.diagnosisNotes || d.diagnosis || d.diseases)) {
        existing.diagnosisNotes = d.diagnosisNotes || d.diagnosis || d.diseases;
      }
      if (!existing.doctorNotes && (d.doctorNotes || d.notes || d.advice || d.instructions)) {
        existing.doctorNotes = d.doctorNotes || d.notes || d.advice || d.instructions;
      }

      // Merge medicines (deduplicate by remedy name + potency)
      if (meds.length > 0) {
        const seenMedKeys = new Set(existing.medicines.map((m: any) => `${(m.name || '').toLowerCase().trim()}_${(m.potency || '').toLowerCase().trim()}`));
        for (const m of meds) {
          const medKey = `${(m.name || '').toLowerCase().trim()}_${(m.potency || '').toLowerCase().trim()}`;
          if (!seenMedKeys.has(medKey)) {
            seenMedKeys.add(medKey);
            existing.medicines.push(m);
          }
        }
      }

      // Merge prescription photos/canvas images (deduplicate by URL)
      if (imgs.length > 0) {
        const seenImgs = new Set(existing.prescriptionImages);
        for (const img of imgs) {
          if (!seenImgs.has(img)) {
            seenImgs.add(img);
            existing.prescriptionImages.push(img);
          }
        }
      }
    }
  }

  const visits = Array.from(visitMap.values());
  // Sort chronologically ascending to assign permanent visitNumber (Visit 1 = patient's first ever visit)
  visits.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  visits.forEach((v, idx) => {
    v.visitNumber = idx + 1;
  });
  // Filter out future uncompleted placeholder follow-up slots so history strictly shows actual completed visits
  const todayYMD = getFormattedDateStr(new Date());
  const completedVisits = visits.filter(v => {
    const isFuture = String(v.date || '') > todayYMD;
    const isCompleted = v.status === 'completed' || v.amountPaid > 0 || v.paymentStatus === 'paid';
    return !isFuture || isCompleted;
  });

  // Default return sorted descending (newest first)
  completedVisits.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  return completedVisits;
};

// Separate documents into distinct patient profiles (e.g. different family members sharing the same phone)
const groupDocsByProfile = (docs: any[], defaultPat: Patient): PatientFamilyProfile[] => {
  const profileMap = new Map<string, {
    profileKey: string;
    name: string;
    regId: string;
    phone: string;
    branch: string;
    age?: any;
    gender?: any;
    primaryDocId: string;
    rawDocs: any[];
  }>();

  const cleanDefaultPhone = String(defaultPat.phone || '').replace(/\D/g, '').slice(-10);
  const cleanDefaultReg = String(defaultPat.regId || defaultPat.id || '').trim();

  docs.forEach(d => {
    if (!d) return;
    const docName = String(d.patientName || d.fullName || d.name || d.patient_name || '').trim();
    const docPhone = String(d.phone || d.phoneNumber || d.mobile || d.contactNumber || '').replace(/\D/g, '').slice(-10);
    const docReg = String(d.registrationId || d.regId || d.regNo || d.patientId || '').trim();
    const docBranch = d.branchName || d.branch || defaultPat.branchName || '';
    const docId = d.id || d.docId || '';

    const normalizedDocName = docName.replace(/^(mr|mrs|ms|dr|master|miss)\.?\s+/i, '').trim().toLowerCase();

    // Determine profile key:
    let pKey = '';
    if (docReg && docReg.toUpperCase().startsWith('SPH-')) {
      pKey = docReg.toUpperCase();
    } else if (normalizedDocName && normalizedDocName.length > 2) {
      pKey = normalizedDocName;
    } else if (docReg) {
      pKey = docReg.toLowerCase();
    } else {
      pKey = defaultPat.id;
    }

    if (!profileMap.has(pKey)) {
      profileMap.set(pKey, {
        profileKey: pKey,
        name: docName || defaultPat.name,
        regId: docReg || (pKey.startsWith('SPH-') ? pKey : cleanDefaultReg),
        phone: docPhone || cleanDefaultPhone,
        branch: docBranch,
        age: d.age,
        gender: d.gender,
        primaryDocId: docId || defaultPat.id,
        rawDocs: [d],
      });
    } else {
      const existing = profileMap.get(pKey)!;
      existing.rawDocs.push(d);
      if (!existing.regId && docReg) existing.regId = docReg;
      if (!existing.primaryDocId && docId) existing.primaryDocId = docId;
      if (docName && docName.length > existing.name.length) existing.name = docName;
    }
  });

  const list: PatientFamilyProfile[] = [];
  profileMap.forEach(prof => {
    const consolidated = consolidateVisitsForPatient(prof.rawDocs, defaultPat);
    list.push({
      profileKey: prof.profileKey,
      name: prof.name,
      regId: prof.regId,
      phone: prof.phone,
      branch: prof.branch,
      age: prof.age,
      gender: prof.gender,
      primaryDocId: prof.primaryDocId,
      visits: consolidated,
      rawDocs: prof.rawDocs,
    });
  });

  if (list.length === 0) {
    const defConsolidated = consolidateVisitsForPatient(docs, defaultPat);
    list.push({
      profileKey: defaultPat.id,
      name: defaultPat.name,
      regId: defaultPat.regId || defaultPat.id,
      phone: defaultPat.phone,
      branch: defaultPat.branchName,
      primaryDocId: defaultPat.id,
      visits: defConsolidated,
      rawDocs: docs,
    });
  }

  // Sort profiles so the matching patient profile is first
  const normDefaultName = defaultPat.name.replace(/^(mr|mrs|ms|dr|master|miss)\.?\s+/i, '').trim().toLowerCase();
  list.sort((a, b) => {
    const matchA = (a.regId && a.regId.toLowerCase() === cleanDefaultReg.toLowerCase()) || (a.name.toLowerCase().includes(normDefaultName));
    const matchB = (b.regId && b.regId.toLowerCase() === cleanDefaultReg.toLowerCase()) || (b.name.toLowerCase().includes(normDefaultName));
    if (matchA && !matchB) return -1;
    if (!matchA && matchB) return 1;
    return 0;
  });

  return list;
};

// --- Memoized Individual Patient Card Component ---
const PatientCardItem = memo(({
  patient,
  onPress,
  onCall,
  onWhatsApp,
}: {
  patient: Patient;
  onPress: (patient: Patient) => void;
  onCall: (phone: string) => void;
  onWhatsApp: (phone: string, name: string) => void;
}) => {
  const normStatus = (patient.status || 'active').toLowerCase();
  const isCompleted = normStatus === 'completed' || normStatus === 'done' || normStatus === 'paid';
  const isActive = normStatus === 'active' || normStatus === 'in_consultation';
  const isFollowUp = normStatus === 'follow_up' || normStatus === 'followup';
  const isAwaitingPayment = normStatus === 'awaiting_payment' || normStatus === 'pending' || normStatus === 'collect_fee';

  const badgeStyle = isActive
    ? { bg: '#e0f2fe', text: '#0369a1', label: 'Active' }
    : isCompleted
      ? { bg: '#dcfce7', text: '#15803d', label: 'Completed ✓' }
      : isFollowUp
        ? { bg: '#fef9c3', text: '#a16207', label: 'Follow Up' }
        : isAwaitingPayment
          ? { bg: '#fee2e2', text: '#b91c1c', label: 'Pay Pending' }
          : { bg: '#f1f5f9', text: '#475569', label: patient.status.replace('_', ' ') };

  const visitState = useMemo(() => {
    try {
      const pool = receptionDataStore.getAllCollectionsPool();
      const pkgs = receptionDataStore.getPackageMembers();
      return getPatientVisitState(patient.raw || patient, pool, pkgs);
    } catch (e) {
      return null;
    }
  }, [patient]);

  return (
    <TouchableOpacity
      style={styles.patientCard}
      onPress={() => onPress(patient)}
      activeOpacity={0.88}
    >
      {/* Card Header: Name, Reg ID & Status Badge */}
      <View style={styles.cardHeader}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Text style={styles.patientName} numberOfLines={1}>{patient.name}</Text>
            {visitState ? (
              <View style={[styles.visitBadge, { backgroundColor: visitState.badgeBg, borderColor: visitState.badgeBorder }]}>
                <Text style={[styles.visitBadgeText, { color: visitState.badgeColor }]}>
                  {visitState.badgeText}
                </Text>
              </View>
            ) : null}
            {visitState?.isApp ? (
              <View style={{ backgroundColor: '#f3e8ff', borderWidth: 1, borderColor: '#d8b4fe', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
                <Text style={{ fontSize: 9.5, fontWeight: '900', color: '#7e22ce' }}>APP</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.patientIdText}>
            ID: <Text style={{ color: '#0284c7', fontWeight: '800' }}>{patient.regId || patient.id}</Text>
            {patient.age ? ` • ${patient.age} yrs` : ''}
          </Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: badgeStyle.bg }]}>
          <Text style={[styles.statusBadgeText, { color: badgeStyle.text }]}>
            {badgeStyle.label}
          </Text>
        </View>
      </View>

      {/* Details Row: Branch, Date, Doctor */}
      <View style={styles.detailsRow}>
        <View style={styles.detailItem}>
          <Feather name="map-pin" size={13} color="#64748b" />
          <Text style={styles.detailText} numberOfLines={1}>{patient.branchName}</Text>
        </View>
        <View style={styles.detailItem}>
          <Feather name="calendar" size={13} color="#64748b" />
          <Text style={styles.detailText}>{formatPrettyDate(patient.appointmentDate)}</Text>
        </View>
        {patient.doctorName ? (
          <View style={styles.detailItem}>
            <MaterialCommunityIcons name="stethoscope" size={14} color="#64748b" />
            <Text style={styles.detailText} numberOfLines={1}>{sanitizeDoctorName(patient.doctorName, patient.branchName)}</Text>
          </View>
        ) : null}
      </View>

      {/* Action Row: Phone, Call, WhatsApp, View History */}
      <View style={styles.actionRow}>
        <Text style={styles.phoneText}>📞 {patient.phone}</Text>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <TouchableOpacity
            style={styles.viewHistoryPill}
            onPress={() => onPress(patient)}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.viewHistoryPillText}>History & Rx</Text>
            <Feather name="chevron-right" size={13} color="#0284c7" />
          </TouchableOpacity>
          {patient.phone ? (
            <>
              <TouchableOpacity
                style={styles.iconBtnCall}
                onPress={() => onCall(patient.phone)}
                activeOpacity={0.7}
              >
                <Feather name="phone" size={15} color="#0284c7" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.iconBtnWA}
                onPress={() => onWhatsApp(patient.phone, patient.name)}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons name="whatsapp" size={17} color="#16a34a" />
              </TouchableOpacity>
            </>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
});

export const AllPatientsScreen: React.FC<AllPatientsScreenProps> = ({
  onNavigate,
  currentBranch,
  onBack,
  isActive = true,
}) => {
  // --- Filtering States ---
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilterMode, setDateFilterMode] = useState<'today' | 'yesterday' | 'all'>('today');

  // --- Date Calculations ---
  const todayStr = getFormattedDateStr(new Date());
  const yesterdayStr = getFormattedDateStr(new Date(Date.now() - 86400000));

  // --- Patients State (Instant initial load from cached receptionDataStore pool) ---
  const [patients, setPatients] = useState<Patient[]>(() => {
    const cachedPool = receptionDataStore.getAllCollectionsPool();
    const poolToUse = cachedPool.length > 0 ? cachedPool : receptionDataStore.getAppointments();
    return parsePoolToPatients(poolToUse, currentBranch, todayStr);
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSearchingLive, setIsSearchingLive] = useState(false);

  // --- Page-wise Chunk Loading (Prevents Lag on Large Patient Datasets) ---
  const PAGE_SIZE = 25;
  const [displayCount, setDisplayCount] = useState<number>(PAGE_SIZE);

  // --- Real-Time Firestore Loading & Sync ---
  useEffect(() => {
    let isMounted = true;

    try {
      receptionDataStore.startListeners(currentBranch);
      const unsub = receptionDataStore.subscribe((state) => {
        if (!isMounted) return;
        const pool = state.allCollectionsPool.length > 0 ? state.allCollectionsPool : state.appointments;
        const list = parsePoolToPatients(pool, currentBranch, todayStr);
        setPatients(list);
        setIsLoading(false);
      });

      // Safety timeout so loading indicator never stays stuck under any network condition
      const safetyTimer = setTimeout(() => {
        if (isMounted) setIsLoading(false);
      }, 500);

      return () => {
        isMounted = false;
        clearTimeout(safetyTimer);
        unsub();
      };
    } catch (err) {
      console.warn('Sync error:', err);
      setIsLoading(false);
    }
  }, [currentBranch, todayStr]);

  // --- Live Firestore Search for Older Historical Records in patients / allpatients ---
  useEffect(() => {
    const trimmed = searchTerm.trim();
    if (!trimmed || trimmed.length < 3) return;

    const timer = setTimeout(async () => {
      const activeDb = getSafeDb();
      if (!activeDb) return;

      const cleanDigits = trimmed.replace(/\D/g, '');
      const isPhoneSearch = cleanDigits.length >= 7;

      setIsSearchingLive(true);
      try {
        const queriesToRun: any[] = [];
        if (isPhoneSearch) {
          const tenDigit = cleanDigits.slice(-10);
          const pVariants = Array.from(new Set([
            tenDigit,
            `+91${tenDigit}`,
            `+91 ${tenDigit}`,
            `0${tenDigit}`,
            `${tenDigit.slice(0, 5)} ${tenDigit.slice(5)}`
          ])).filter(Boolean).slice(0, 10);

          queriesToRun.push(
            getDocs(query(collection(activeDb, 'allpatients'), where('phone', 'in', pVariants), limit(20))).catch(() => ({ docs: [] })),
            getDocs(query(collection(activeDb, 'allpatients'), where('phoneNumber', 'in', pVariants), limit(20))).catch(() => ({ docs: [] })),
            getDocs(query(collection(activeDb, 'patients'), where('phone', 'in', pVariants), limit(20))).catch(() => ({ docs: [] })),
            getDocs(query(collection(activeDb, 'patients'), where('phoneNumber', 'in', pVariants), limit(20))).catch(() => ({ docs: [] })),
            getDocs(query(collection(activeDb, 'appointments'), where('phone', 'in', pVariants), limit(20))).catch(() => ({ docs: [] })),
            getDocs(query(collection(activeDb, 'appointments'), where('phoneNumber', 'in', pVariants), limit(20))).catch(() => ({ docs: [] })),
            getDocs(query(collection(activeDb, 'patient_profiles'), where('phone', 'in', pVariants), limit(20))).catch(() => ({ docs: [] }))
          );
        } else {
          const rVariants = Array.from(new Set([trimmed, trimmed.toUpperCase(), trimmed.toLowerCase()])).filter(Boolean).slice(0, 10);
          queriesToRun.push(
            getDocs(query(collection(activeDb, 'allpatients'), where('registrationId', 'in', rVariants), limit(20))).catch(() => ({ docs: [] })),
            getDocs(query(collection(activeDb, 'allpatients'), where('regId', 'in', rVariants), limit(20))).catch(() => ({ docs: [] })),
            getDocs(query(collection(activeDb, 'patients'), where('registrationId', 'in', rVariants), limit(20))).catch(() => ({ docs: [] })),
            getDocs(query(collection(activeDb, 'patients'), where('regNo', 'in', rVariants), limit(20))).catch(() => ({ docs: [] })),
            getDocs(query(collection(activeDb, 'patients'), where('regId', 'in', rVariants), limit(20))).catch(() => ({ docs: [] })),
            getDocs(query(collection(activeDb, 'appointments'), where('registrationId', 'in', rVariants), limit(20))).catch(() => ({ docs: [] })),
            getDocs(query(collection(activeDb, 'appointments'), where('regId', 'in', rVariants), limit(20))).catch(() => ({ docs: [] })),
            getDocs(query(collection(activeDb, 'patient_profiles'), where('registrationId', 'in', rVariants), limit(20))).catch(() => ({ docs: [] }))
          );
        }

        const results = await Promise.all(queriesToRun);
        const newRecords: Patient[] = [];
        const existingIds = new Set(patients.map(p => p.id));
        const existingPhones = new Set(patients.map(p => (p.phone || '').replace(/\D/g, '').slice(-10)).filter(Boolean));
        const isHQRole = !currentBranch || currentBranch.toLowerCase().includes('admin') || currentBranch.toLowerCase().includes('hr') || currentBranch === 'All Branches';

        results.forEach((snap: any) => {
          if (!snap || !snap.docs) return;
          snap.docs.forEach((docSnap: any) => {
            const d = docSnap.data();
            const bName = d.branch || d.targetBranch || d.branchName || currentBranch || 'KPHB Branch';
            const cleanP = String(d.phoneNumber || d.phone || d.mobile || d.contactNumber || '').replace(/\D/g, '').slice(-10);

            if (!existingIds.has(docSnap.id) && (!cleanP || !existingPhones.has(cleanP))) {
              if (isHQRole || !currentBranch || isBranchMatching(bName, currentBranch)) {
                existingIds.add(docSnap.id);
                if (cleanP) existingPhones.add(cleanP);
                const s = String(d.status || '').toLowerCase().trim();
                const p = String(d.paymentStatus || '').toLowerCase().trim();
                let docStatus = 'active';
                if (s === 'completed' || s === 'done' || s === 'paid' || p === 'paid') {
                  docStatus = 'completed';
                } else if (s === 'follow_up' || s === 'followup') {
                  docStatus = 'follow_up';
                } else if (s === 'collect_fee' || s === 'awaiting_payment' || p === 'pending') {
                  docStatus = 'awaiting_payment';
                }

                const docDate = normalizeDateToISO(d.appointmentDate || d.date || d.bookingDate || d.createdAt);
                if (docDate > todayStr && docStatus !== 'completed') {
                  return;
                }

                newRecords.push({
                  id: docSnap.id,
                  name: d.patientName || d.name || d.fullName || 'Patient',
                  phone: cleanP || String(d.phoneNumber || d.phone || ''),
                  age: d.age || d.patientAge,
                  gender: d.gender || 'Male',
                  branchName: bName,
                  appointmentDate: docDate,
                  appointmentTime: d.appointmentTime || d.time || '10:00 AM',
                  doctorName: sanitizeDoctorName(d.doctorName || d.doctor, bName),
                  status: docStatus,
                  regId: d.registrationId || d.regId || d.regNo || d.patientId || docSnap.id,
                  raw: { ...d, id: docSnap.id, collectionName: 'patients' }
                });
              }
            }
          });
        });

        if (newRecords.length > 0) {
          setPatients(prev => [...newRecords, ...prev]);
        }
      } catch (err) {
        console.warn('Live mobile search notice:', err);
      } finally {
        setIsSearchingLive(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [searchTerm, currentBranch]);

  // --- Filtering Core Engine: When searching, scan across ALL dates ---
  const filteredPatients = useMemo(() => {
    const isHQRole = !currentBranch || currentBranch.toLowerCase().includes('admin') || currentBranch.toLowerCase().includes('hr') || currentBranch === 'All Branches';
    const isSearching = searchTerm.trim() !== '';
    const queryStr = searchTerm.toLowerCase().trim();
    const queryDigits = searchTerm.replace(/\D/g, '');
    const seenPatientKeys = new Set<string>();

    return patients.filter((patient) => {
      // 1. Strict Branch Check (Only this branch!)
      if (!isHQRole && currentBranch && !isBranchMatching(patient.branchName, currentBranch)) {
        return false;
      }

      const patientDate = normalizeDateToISO(patient.appointmentDate);

      // 2. Date Session Filtering (Only apply when NOT searching so search can find patients across all dates)
      if (!isSearching) {
        if (dateFilterMode === 'today') {
          if (!patientDate || patientDate !== todayStr) return false;
        } else if (dateFilterMode === 'yesterday') {
          if (!patientDate || patientDate !== yesterdayStr) return false;
        }
      }

      // 3. Search Query Filtering (Name, Phone, ID)
      if (isSearching) {
        const matchesName = (patient.name || '').toLowerCase().includes(queryStr);
        const pPhone = (patient.phone || '').replace(/\D/g, '');
        const matchesPhone = queryDigits.length > 0 && pPhone.includes(queryDigits);
        const matchesId = (patient.regId || patient.id || '').toLowerCase().includes(queryStr);
        if (!matchesName && !matchesPhone && !matchesId) return false;
      }

      // 4. Strict Deduplication: Never display the same patient twice ("double double")
      const cleanPhone = (patient.phone || '').replace(/\D/g, '').slice(-10);
      const cleanReg = (patient.regId || patient.id || '').trim().toLowerCase();
      const dedupKey = (dateFilterMode === 'all' || isSearching)
        ? (cleanPhone || cleanReg || patient.id)
        : (cleanPhone ? `${cleanPhone}_${patientDate}` : (cleanReg ? `${cleanReg}_${patientDate}` : patient.id));

      if (seenPatientKeys.has(dedupKey)) {
        return false;
      }
      seenPatientKeys.add(dedupKey);

      return true;
    });
  }, [patients, dateFilterMode, currentBranch, searchTerm, todayStr, yesterdayStr]);

  // Reset page display count to 25 whenever filters change
  useEffect(() => {
    setDisplayCount(PAGE_SIZE);
  }, [searchTerm, dateFilterMode, currentBranch]);

  // Paginated/Chunked Patients for 60fps smooth FlatList rendering
  const displayedPatients = useMemo(() => {
    return filteredPatients.slice(0, displayCount);
  }, [filteredPatients, displayCount]);

  // --- Selected Patient for History Full-Screen Modal ---
  const [selectedPatientForHistory, setSelectedPatientForHistory] = useState<Patient | null>(null);
  const [historyVisits, setHistoryVisits] = useState<PatientVisitHistoryItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);
  const [historyFilterTab, setHistoryFilterTab] = useState<'all' | 'prescriptions' | 'billing'>('all');
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [historySortOrder, setHistorySortOrder] = useState<'desc' | 'asc'>('desc');

  // Multi-profile state for family members under same phone number
  const [patientProfiles, setPatientProfiles] = useState<PatientFamilyProfile[]>([]);
  const [selectedProfileKey, setSelectedProfileKey] = useState<string>('');

  // Upload Prescription Modal State
  const [uploadModalVisible, setUploadModalVisible] = useState<boolean>(false);
  const [uploadTargetDate, setUploadTargetDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [uploadTargetProfileKey, setUploadTargetProfileKey] = useState<string>('');
  const [uploadImageUri, setUploadImageUri] = useState<string | null>(null);
  const [uploadImageBase64, setUploadImageBase64] = useState<string | null>(null);
  const [isUploadingPrescription, setIsUploadingPrescription] = useState<boolean>(false);

  // Lightbox rotation & swipe navigation state
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState<number>(0);
  const [imageRotation, setImageRotation] = useState<number>(0);

  // Delete / Remove Prescription Image Confirmation State
  const [imageToDelete, setImageToDelete] = useState<{
    uri: string;
    visitNumber?: number;
    visitDate?: string;
    imageIndex?: number;
    visitId?: string;
  } | null>(null);
  const [isDeletingImage, setIsDeletingImage] = useState<boolean>(false);

  const openLightbox = useCallback((images: string[], index: number = 0) => {
    if (!images || images.length === 0) return;
    const safeIdx = Math.max(0, Math.min(index, images.length - 1));
    setLightboxImages(images);
    setLightboxIndex(safeIdx);
    setImageRotation(0);
    setImagePreviewUrl(images[safeIdx] || images[0]);
  }, []);

  const closeLightbox = useCallback(() => {
    setImagePreviewUrl(null);
    setLightboxImages([]);
    setLightboxIndex(0);
    setImageRotation(0);
  }, []);

  const handleRotateImage = useCallback(() => {
    setImageRotation(prev => (prev + 90) % 360);
  }, []);

  const handlePrevImage = useCallback(() => {
    setLightboxImages(currentList => {
      if (currentList.length <= 1) return currentList;
      setLightboxIndex(prevIdx => {
        const newIdx = prevIdx > 0 ? prevIdx - 1 : currentList.length - 1;
        setImageRotation(0);
        setImagePreviewUrl(currentList[newIdx]);
        return newIdx;
      });
      return currentList;
    });
  }, []);

  const handleNextImage = useCallback(() => {
    setLightboxImages(currentList => {
      if (currentList.length <= 1) return currentList;
      setLightboxIndex(prevIdx => {
        const newIdx = prevIdx < currentList.length - 1 ? prevIdx + 1 : 0;
        setImageRotation(0);
        setImagePreviewUrl(currentList[newIdx]);
        return newIdx;
      });
      return currentList;
    });
  }, []);

  const panResponder = useMemo(() => {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 25 && Math.abs(gestureState.dy) < 55;
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx > 45) {
          // Swiped right -> Previous image
          handlePrevImage();
        } else if (gestureState.dx < -45) {
          // Swiped left -> Next image
          handleNextImage();
        }
      },
    });
  }, [handlePrevImage, handleNextImage]);

  // Active Profile derivation for currently selected profile
  const activeProfile = useMemo(() => {
    return patientProfiles.find(p => p.profileKey === selectedProfileKey) || patientProfiles[0] || null;
  }, [patientProfiles, selectedProfileKey]);

  // Active Visits for selected profile (isolated per person)
  const activeProfileVisits = useMemo(() => {
    if (activeProfile && activeProfile.visits && activeProfile.visits.length > 0) {
      return activeProfile.visits;
    }
    return historyVisits;
  }, [activeProfile, historyVisits]);

  // Open Prescription Upload Modal
  const handleOpenUploadModal = useCallback(() => {
    setUploadTargetDate(new Date().toISOString().split('T')[0]);
    setUploadTargetProfileKey(activeProfile?.profileKey || selectedProfileKey || '');
    setUploadImageUri(null);
    setUploadImageBase64(null);
    setUploadModalVisible(true);
  }, [activeProfile, selectedProfileKey]);

  const handlePickFromGallery = useCallback(async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission Denied', 'Please grant photo library access to upload prescriptions.');
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: false,
        quality: 0.6,
        base64: true,
      });
      if (!res.canceled && res.assets && res.assets.length > 0) {
        setUploadImageUri(res.assets[0].uri);
        if (res.assets[0].base64) {
          setUploadImageBase64(`data:image/jpeg;base64,${res.assets[0].base64}`);
        }
      }
    } catch (e) {
      Alert.alert('Gallery Error', 'Failed to pick image.');
    }
  }, []);

  const handleTakePhoto = useCallback(async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission Denied', 'Please grant camera access to photograph prescriptions.');
        return;
      }
      const res = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.6,
        base64: true,
      });
      if (!res.canceled && res.assets && res.assets.length > 0) {
        setUploadImageUri(res.assets[0].uri);
        if (res.assets[0].base64) {
          setUploadImageBase64(`data:image/jpeg;base64,${res.assets[0].base64}`);
        }
      }
    } catch (e) {
      Alert.alert('Camera Error', 'Failed to capture photo.');
    }
  }, []);

  const handleSaveUploadedPrescription = useCallback(async () => {
    if (!uploadImageUri) {
      Alert.alert('No Image', 'Please capture or select a prescription image first.');
      return;
    }
    const cleanDate = uploadTargetDate.trim() || new Date().toISOString().split('T')[0];
    const targetProf = patientProfiles.find(p => p.profileKey === uploadTargetProfileKey) || activeProfile || {
      name: selectedPatientForHistory?.name || 'Patient',
      phone: selectedPatientForHistory?.phone || '',
      regId: selectedPatientForHistory?.regId || '',
      branch: selectedPatientForHistory?.branchName || currentBranch || 'Clinic',
      primaryDocId: selectedPatientForHistory?.id || 'temp',
    };

    setIsUploadingPrescription(true);
    try {
      const dataToUpload = uploadImageBase64 || uploadImageUri;
      const targetDocId = (targetProf as any).primaryDocId || selectedPatientForHistory?.id || `rx_${Date.now()}`;
      const cloudUrl = await uploadPrescriptionToStorage(dataToUpload, targetDocId);

      if (!cloudUrl) {
        throw new Error('Upload to storage failed');
      }

      const activeDb = getSafeDb();
      if (activeDb) {
        const colsToUpdate = ['appointments', 'allpatients', 'patients', 'patient_profiles'];
        for (const colName of colsToUpdate) {
          try {
            await updateDoc(doc(activeDb, colName, targetDocId), {
              uploadedPrescriptions: arrayUnion(cloudUrl),
              prescriptionImages: arrayUnion(cloudUrl),
              updatedAt: new Date().toISOString(),
            }).catch(() => {});
          } catch (_) {}
        }

        try {
          const appointmentRef = doc(collection(activeDb, 'allpatients'));
          await setDoc(appointmentRef, {
            patientName: targetProf.name,
            fullName: targetProf.name,
            phone: targetProf.phone,
            phoneNumber: targetProf.phone,
            regId: targetProf.regId,
            registrationId: targetProf.regId,
            branchName: targetProf.branch || currentBranch || 'Clinic',
            appointmentDate: cleanDate,
            date: cleanDate,
            appointmentTime: '10:00 AM',
            status: 'completed',
            uploadedPrescriptions: [cloudUrl],
            prescriptionImages: [cloudUrl],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }, { merge: true }).catch(() => {});
        } catch (_) {}
      }

      // Update state locally so new prescription shows in 2x2 grid immediately
      setPatientProfiles(prevProfiles => {
        return prevProfiles.map(prof => {
          if (prof.profileKey !== (targetProf as any).profileKey && prof.name !== targetProf.name) {
            return prof;
          }
          const visits = [...prof.visits];
          const existingVisit = visits.find(v => v.date === cleanDate);
          if (existingVisit) {
            existingVisit.prescriptionImages = Array.from(new Set([...(existingVisit.prescriptionImages || []), cloudUrl]));
          } else {
            visits.unshift({
              id: `upload_${Date.now()}`,
              date: cleanDate,
              time: '10:00 AM',
              branch: targetProf.branch || currentBranch || 'Clinic',
              doctor: 'Homeopathic Doctor',
              status: 'completed',
              totalAmount: 0,
              amountPaid: 0,
              paymentMode: 'Cash',
              paymentStatus: 'paid',
              prescriptionImages: [cloudUrl],
              medicines: [],
              visitNumber: visits.length + 1,
            });
          }
          return { ...prof, visits };
        });
      });

      setUploadModalVisible(false);
      setUploadImageUri(null);
      setUploadImageBase64(null);
      Alert.alert('Prescription Uploaded ✓', `Prescription attached successfully for ${targetProf.name} on ${cleanDate}.`);
    } catch (err: any) {
      console.error('Upload error:', err);
      Alert.alert('Upload Failed', err?.message || 'Unable to upload prescription.');
    } finally {
      setIsUploadingPrescription(false);
    }
  }, [uploadImageUri, uploadImageBase64, uploadTargetDate, uploadTargetProfileKey, patientProfiles, activeProfile, selectedPatientForHistory, currentBranch]);

  // Handler to permanently delete/remove prescription image from records
  const handleConfirmDeleteImage = useCallback(async () => {
    if (!imageToDelete || !imageToDelete.uri) {
      setImageToDelete(null);
      return;
    }

    const targetUri = imageToDelete.uri;
    setIsDeletingImage(true);

    try {
      const activeDb = getSafeDb();
      const targetProf = activeProfile || {
        name: selectedPatientForHistory?.name || 'Patient',
        phone: selectedPatientForHistory?.phone || '',
        regId: selectedPatientForHistory?.regId || '',
        branch: selectedPatientForHistory?.branchName || currentBranch || 'Clinic',
        primaryDocId: selectedPatientForHistory?.id || 'temp',
      };

      // 1. Collect all candidate doc IDs
      const candidateDocIds = new Set<string>();
      if (selectedPatientForHistory?.id) candidateDocIds.add(selectedPatientForHistory.id);
      if (selectedPatientForHistory?.raw?.id) candidateDocIds.add(selectedPatientForHistory.raw.id);
      if ((targetProf as any).primaryDocId) candidateDocIds.add((targetProf as any).primaryDocId);
      if (imageToDelete.visitId) candidateDocIds.add(imageToDelete.visitId);

      if ((targetProf as any).rawDocs && Array.isArray((targetProf as any).rawDocs)) {
        (targetProf as any).rawDocs.forEach((d: any) => {
          if (d?.id) candidateDocIds.add(d.id);
          if (d?.docId) candidateDocIds.add(d.docId);
        });
      }

      if (activeDb) {
        const collectionsToCheck = ['appointments', 'allpatients', 'patients', 'patient_profiles', 'prescriptions'];

        // A. Search collections where array fields contain targetUri
        for (const colName of collectionsToCheck) {
          try {
            const qU = query(collection(activeDb, colName), where('uploadedPrescriptions', 'array-contains', targetUri));
            const snapU = await getDocs(qU).catch(() => ({ docs: [] } as any));
            snapU.docs.forEach((d: any) => candidateDocIds.add(d.id));

            const qP = query(collection(activeDb, colName), where('prescriptionImages', 'array-contains', targetUri));
            const snapP = await getDocs(qP).catch(() => ({ docs: [] } as any));
            snapP.docs.forEach((d: any) => candidateDocIds.add(d.id));

            const qR = query(collection(activeDb, colName), where('prescriptionUrls', 'array-contains', targetUri));
            const snapR = await getDocs(qR).catch(() => ({ docs: [] } as any));
            snapR.docs.forEach((d: any) => candidateDocIds.add(d.id));
          } catch (_) {}
        }

        // B. Remove targetUri from array and scalar fields in all matched documents
        for (const docId of Array.from(candidateDocIds)) {
          for (const colName of collectionsToCheck) {
            try {
              const docRef = doc(activeDb, colName, docId);
              const docSnap = await getDoc(docRef).catch(() => null);
              if (docSnap && docSnap.exists()) {
                const data = docSnap.data();
                const updates: any = {
                  uploadedPrescriptions: arrayRemove(targetUri),
                  prescriptionImages: arrayRemove(targetUri),
                  prescriptionUrls: arrayRemove(targetUri),
                  images: arrayRemove(targetUri),
                  reports: arrayRemove(targetUri),
                  rxUrls: arrayRemove(targetUri),
                  updatedAt: new Date().toISOString(),
                };
                if (data.prescriptionUrl === targetUri) updates.prescriptionUrl = '';
                if (data.prescriptionImage === targetUri) updates.prescriptionImage = '';
                if (data.canvasPrescriptionUrl === targetUri) updates.canvasPrescriptionUrl = '';
                if (data.canvasUrl === targetUri) updates.canvasUrl = '';
                if (data.rxUrl === targetUri) updates.rxUrl = '';

                await updateDoc(docRef, updates).catch(() => {});

                try {
                  receptionDataStore.updateLocalAppointment(docId, updates);
                } catch (_) {}
              }
            } catch (_) {}
          }
        }
      }

      // 2. Update local state: remove targetUri from patientProfiles
      setPatientProfiles(prevProfiles => {
        return prevProfiles.map(prof => {
          const updatedVisits = prof.visits.map(v => {
            if (!v.prescriptionImages || !v.prescriptionImages.includes(targetUri)) {
              return v;
            }
            return {
              ...v,
              prescriptionImages: v.prescriptionImages.filter(u => u !== targetUri),
            };
          });

          const updatedRawDocs = (prof.rawDocs || []).map((d: any) => {
            const newDoc = { ...d };
            if (Array.isArray(newDoc.uploadedPrescriptions)) {
              newDoc.uploadedPrescriptions = newDoc.uploadedPrescriptions.filter((u: string) => u !== targetUri);
            }
            if (Array.isArray(newDoc.prescriptionImages)) {
              newDoc.prescriptionImages = newDoc.prescriptionImages.filter((u: string) => u !== targetUri);
            }
            if (Array.isArray(newDoc.prescriptionUrls)) {
              newDoc.prescriptionUrls = newDoc.prescriptionUrls.filter((u: string) => u !== targetUri);
            }
            return newDoc;
          });

          return {
            ...prof,
            visits: updatedVisits,
            rawDocs: updatedRawDocs,
          };
        });
      });

      // 3. Update local historyVisits
      setHistoryVisits(prevVisits => {
        return prevVisits.map(v => {
          if (!v.prescriptionImages || !v.prescriptionImages.includes(targetUri)) {
            return v;
          }
          return {
            ...v,
            prescriptionImages: v.prescriptionImages.filter(u => u !== targetUri),
          };
        });
      });

      // 4. Update Lightbox state if image was deleted from within lightbox
      setLightboxImages(prevImages => {
        const filtered = prevImages.filter(u => u !== targetUri);
        if (filtered.length === 0) {
          closeLightbox();
        } else {
          const nextIdx = Math.min(lightboxIndex, filtered.length - 1);
          setLightboxIndex(nextIdx);
          setImagePreviewUrl(filtered[nextIdx]);
        }
        return filtered;
      });

      // 5. Close confirmation popup
      setImageToDelete(null);

      // 6. Give feedback
      if (Platform.OS === 'android') {
        ToastAndroid.show('Prescription image removed', ToastAndroid.SHORT);
      } else {
        Alert.alert('Removed', 'Prescription image removed successfully.');
      }
    } catch (err: any) {
      console.error('Delete image error:', err);
      Alert.alert('Error', err?.message || 'Failed to remove image. Please try again.');
    } finally {
      setIsDeletingImage(false);
    }
  }, [imageToDelete, activeProfile, selectedPatientForHistory, currentBranch, lightboxIndex, closeLightbox]);

  // Native Android Hardware Back Navigation Handler
  useEffect(() => {
    if (!isActive) return;

    const onHardwareBack = () => {
      if (imageToDelete) {
        setImageToDelete(null);
        return true;
      }
      if (uploadModalVisible) {
        setUploadModalVisible(false);
        return true;
      }
      if (imagePreviewUrl) {
        closeLightbox();
        return true;
      }
      if (selectedPatientForHistory) {
        handleCloseHistoryModal();
        return true;
      }
      if (onBack) {
        onBack();
        return true;
      }
      if (onNavigate) {
        onNavigate('reception_dashboard');
        return true;
      }
      return true;
    };

    const backSub = BackHandler.addEventListener('hardwareBackPress', onHardwareBack);
    return () => backSub.remove();
  }, [isActive, selectedPatientForHistory, imagePreviewUrl, uploadModalVisible, imageToDelete, closeLightbox, onBack, onNavigate]);

  // --- Handlers ---
  const handleOpenPatientFile = useCallback((patient: Patient, targetVisit?: PatientVisitHistoryItem) => {
    if (onNavigate) {
      const visitData = targetVisit || (historyVisits && historyVisits.length > 0 ? historyVisits[0] : null);
      const docId = visitData?.id || patient.id;

      onNavigate('reception_patient_file', {
        id: docId,
        docId: docId,
        targetDocId: docId,
        appointmentId: docId,
        patientName: patient.name,
        name: patient.name,
        phone: patient.phone,
        phoneNumber: patient.phone,
        registrationId: patient.regId || patient.id,
        regId: patient.regId || patient.id,
        branch: visitData?.branch || patient.branchName,
        branchName: visitData?.branch || patient.branchName,
        doctorName: visitData?.doctor || patient.doctorName,
        doctor: visitData?.doctor || patient.doctorName,
        appointmentDate: visitData?.date || patient.appointmentDate,
        date: visitData?.date || patient.appointmentDate,
        appointmentTime: visitData?.time || patient.appointmentTime,
        // Clinical details to preload into consultation file
        diagnosisNotes: visitData?.diagnosisNotes || visitData?.chiefComplaint || '',
        chiefComplaint: visitData?.chiefComplaint || '',
        doctorNotes: visitData?.doctorNotes || '',
        uploadedPrescriptions: visitData?.prescriptionImages || [],
        prescriptionImages: visitData?.prescriptionImages || [],
        medicines: visitData?.medicines || [],
        items: visitData?.medicines || [],
        // Flags to lock amount & strictly update prescription only
        editPrescriptionOnly: true,
        disableAmount: true,
        isEditPrescriptionOnly: true,
        lockPayment: true,
        existingAmountPaid: visitData?.amountPaid ?? 0,
        consultationFee: visitData?.consultationFee ?? 0,
        medicineFee: visitData?.medicineFee ?? 0,
        totalAmount: visitData?.totalAmount ?? (visitData?.amountPaid || 0),
        status: visitData?.status || 'completed',
        paymentStatus: visitData?.paymentStatus || 'paid',
        ...(patient.raw || {}),
        ...(visitData?.raw || {})
      });
    } else {
      Alert.alert('Patient Selected', `${patient.name} (${patient.regId || patient.id})`);
    }
  }, [onNavigate, historyVisits]);

  const handleCall = useCallback((phone: string) => {
    if (!phone) return Alert.alert('No Phone', 'No phone number available for this patient.');
    Linking.openURL(`tel:${phone}`).catch(() => Alert.alert('Error', 'Unable to initiate call.'));
  }, []);

  const handleWhatsApp = useCallback((phone: string, name: string) => {
    if (!phone) return Alert.alert('No Phone', 'No phone number available.');
    const clean = phone.replace(/\D/g, '').slice(-10);
    const msg = `Hello ${name}, regarding your appointment at Spiritual Homeopathy Clinic.`;
    Linking.openURL(`whatsapp://send?phone=91${clean}&text=${encodeURIComponent(msg)}`)
      .catch(() => Alert.alert('WhatsApp Error', 'Could not launch WhatsApp.'));
  }, []);

  const currentOpenPatientIdRef = React.useRef<string | null>(null);

  const handleCloseHistoryModal = useCallback(() => {
    currentOpenPatientIdRef.current = null;
    setSelectedPatientForHistory(null);
    setIsLoadingHistory(false);
  }, []);

  // --- Load Full Patient History Across All Visits & Collections ---
  const handleOpenPatientHistory = useCallback(async (patient: Patient) => {
    if (!patient) return;
    const patientIdentifier = String(patient.id || patient.regId || patient.phone || Math.random());
    currentOpenPatientIdRef.current = patientIdentifier;
    setSelectedPatientForHistory(patient);
    setHistoryFilterTab('all');
    setHistorySortOrder('desc');
    setIsLoadingHistory(true);

    const cleanPhone = String(patient.phone || '').replace(/\D/g, '').slice(-10);
    const cleanReg = String(patient.regId || patient.id || '').trim().toLowerCase();
    const patientName = String(patient.name || '').trim().toLowerCase();

    // 1. Instant load from receptionDataStore pool in memory
    const pool = receptionDataStore.getAllCollectionsPool();
    const collectedDocs: any[] = [];
    const seenIds = new Set<string>();

    const checkMatch = (d: any) => {
      if (!d) return false;
      const dPhone = String(d.phone || d.phoneNumber || d.mobile || d.contactNumber || '').replace(/\D/g, '').slice(-10);
      const dReg = String(d.registrationId || d.regId || d.regNo || d.patientId || '').trim().toLowerCase();
      const dName = String(d.patientName || d.name || '').trim().toLowerCase();
      const dId = d.id || d.docId || '';

      if (dId && (dId === patient.id || dId === patient.raw?.id)) return true;
      if (cleanPhone && cleanPhone.length === 10 && dPhone === cleanPhone) return true;
      if (cleanReg && cleanReg.length > 3 && dReg === cleanReg) return true;
      if (patientName && patientName.length > 3 && dName === patientName) return true;
      return false;
    };

    pool.forEach(item => {
      if (checkMatch(item)) {
        const id = item.id || item.docId || `${item.appointmentDate}_${item.appointmentTime}`;
        if (!seenIds.has(id)) {
          seenIds.add(id);
          collectedDocs.push(item);
        }
      }
    });

    if (patient.raw) {
      const rawId = patient.raw.id || patient.id;
      if (!seenIds.has(rawId)) {
        seenIds.add(rawId);
        collectedDocs.push(patient.raw);
      }
    }

    // Group documents into distinct profiles under this phone number / patient
    const initialProfiles = groupDocsByProfile(collectedDocs, patient);
    setPatientProfiles(initialProfiles);
    if (initialProfiles.length > 0) {
      setSelectedProfileKey(initialProfiles[0].profileKey);
      setHistoryVisits(initialProfiles[0].visits);
    }

    // 2. Concurrently query Firestore for any other historical records across collections
    try {
      const activeDb = getSafeDb();
      if (activeDb) {
        const queryPromises: any[] = [];

        // 1. Direct document fetches by ID
        const docIdsToFetch = Array.from(new Set([patient.id, patient.raw?.id, patient.raw?.docId])).filter(Boolean);
        for (const docId of docIdsToFetch) {
          queryPromises.push(
            getDoc(doc(activeDb, 'allpatients', docId)).then(s => ({ docs: s.exists() ? [{ id: s.id, data: () => s.data() }] : [] })).catch(() => ({ docs: [] })),
            getDoc(doc(activeDb, 'patients', docId)).then(s => ({ docs: s.exists() ? [{ id: s.id, data: () => s.data() }] : [] })).catch(() => ({ docs: [] })),
            getDoc(doc(activeDb, 'appointments', docId)).then(s => ({ docs: s.exists() ? [{ id: s.id, data: () => s.data() }] : [] })).catch(() => ({ docs: [] })),
            getDoc(doc(activeDb, 'patient_profiles', docId)).then(s => ({ docs: s.exists() ? [{ id: s.id, data: () => s.data() }] : [] })).catch(() => ({ docs: [] }))
          );
        }

        // 2. Query by Phone Variants across ALL patient collections & fields
        if (cleanPhone && cleanPhone.length === 10) {
          const phoneVariants = Array.from(new Set([
            cleanPhone,
            `+91${cleanPhone}`,
            `+91 ${cleanPhone}`,
            `+91-${cleanPhone}`,
            `0${cleanPhone}`,
            `${cleanPhone.slice(0, 5)} ${cleanPhone.slice(5)}`,
            `+91 ${cleanPhone.slice(0, 5)} ${cleanPhone.slice(5)}`
          ])).filter(Boolean).slice(0, 10);

          queryPromises.push(
            // allpatients (Primary patient directory)
            getDocs(query(collection(activeDb, 'allpatients'), where('phone', 'in', phoneVariants), limit(35))).catch(() => ({ docs: [] })),
            getDocs(query(collection(activeDb, 'allpatients'), where('phoneNumber', 'in', phoneVariants), limit(35))).catch(() => ({ docs: [] })),
            getDocs(query(collection(activeDb, 'allpatients'), where('patientPhone', 'in', phoneVariants), limit(35))).catch(() => ({ docs: [] })),

            // patients (Master patient registration collection)
            getDocs(query(collection(activeDb, 'patients'), where('phone', 'in', phoneVariants), limit(35))).catch(() => ({ docs: [] })),
            getDocs(query(collection(activeDb, 'patients'), where('phoneNumber', 'in', phoneVariants), limit(35))).catch(() => ({ docs: [] })),
            getDocs(query(collection(activeDb, 'patients'), where('patientPhone', 'in', phoneVariants), limit(35))).catch(() => ({ docs: [] })),

            // appointments (Clinic visits & slots)
            getDocs(query(collection(activeDb, 'appointments'), where('phone', 'in', phoneVariants), limit(35))).catch(() => ({ docs: [] })),
            getDocs(query(collection(activeDb, 'appointments'), where('phoneNumber', 'in', phoneVariants), limit(35))).catch(() => ({ docs: [] })),
            getDocs(query(collection(activeDb, 'appointments'), where('patientPhone', 'in', phoneVariants), limit(35))).catch(() => ({ docs: [] })),

            // patient_profiles (Multi-profile family members)
            getDocs(query(collection(activeDb, 'patient_profiles'), where('phone', 'in', phoneVariants), limit(25))).catch(() => ({ docs: [] })),
            getDocs(query(collection(activeDb, 'patient_profiles'), where('patientPhone', 'in', phoneVariants), limit(25))).catch(() => ({ docs: [] })),

            // prescriptions (Clinical prescriptions & uploads)
            getDocs(query(collection(activeDb, 'prescriptions'), where('phone', 'in', phoneVariants), limit(35))).catch(() => ({ docs: [] })),
            getDocs(query(collection(activeDb, 'prescriptions'), where('patientPhone', 'in', phoneVariants), limit(35))).catch(() => ({ docs: [] })),

            // product_bills (In-clinic billing)
            getDocs(query(collection(activeDb, 'product_bills'), where('phone', 'in', phoneVariants), limit(25))).catch(() => ({ docs: [] })),

            // alltransactions (Revenue & receipt collection)
            getDocs(query(collection(activeDb, 'alltransactions'), where('phone', 'in', phoneVariants), limit(25))).catch(() => ({ docs: [] }))
          );
        }

        // 3. Query by Registration ID Variants across ALL collections & ID fields
        const rawReg = String(patient.regId || '').trim();
        const rawPatId = String(patient.id || '').trim();
        const regVariants = Array.from(new Set([
          rawReg,
          rawReg.toUpperCase(),
          rawReg.toLowerCase(),
          rawPatId,
          rawPatId.toUpperCase(),
          rawPatId.toLowerCase(),
        ])).filter(r => r && r.length > 2 && !r.startsWith('upload_')).slice(0, 10);

        if (regVariants.length > 0) {
          queryPromises.push(
            // allpatients
            getDocs(query(collection(activeDb, 'allpatients'), where('registrationId', 'in', regVariants), limit(25))).catch(() => ({ docs: [] })),
            getDocs(query(collection(activeDb, 'allpatients'), where('regId', 'in', regVariants), limit(25))).catch(() => ({ docs: [] })),

            // patients
            getDocs(query(collection(activeDb, 'patients'), where('registrationId', 'in', regVariants), limit(25))).catch(() => ({ docs: [] })),
            getDocs(query(collection(activeDb, 'patients'), where('regId', 'in', regVariants), limit(25))).catch(() => ({ docs: [] })),
            getDocs(query(collection(activeDb, 'patients'), where('regNo', 'in', regVariants), limit(25))).catch(() => ({ docs: [] })),

            // appointments
            getDocs(query(collection(activeDb, 'appointments'), where('registrationId', 'in', regVariants), limit(25))).catch(() => ({ docs: [] })),
            getDocs(query(collection(activeDb, 'appointments'), where('regId', 'in', regVariants), limit(25))).catch(() => ({ docs: [] })),

            // patient_profiles
            getDocs(query(collection(activeDb, 'patient_profiles'), where('registrationId', 'in', regVariants), limit(25))).catch(() => ({ docs: [] })),
            getDocs(query(collection(activeDb, 'patient_profiles'), where('regId', 'in', regVariants), limit(25))).catch(() => ({ docs: [] })),

            // prescriptions
            getDocs(query(collection(activeDb, 'prescriptions'), where('registrationId', 'in', regVariants), limit(25))).catch(() => ({ docs: [] })),
            getDocs(query(collection(activeDb, 'prescriptions'), where('regId', 'in', regVariants), limit(25))).catch(() => ({ docs: [] }))
          );
        }

        const queryResults = await Promise.all(queryPromises);
        queryResults.forEach((snap: any) => {
          if (!snap || !snap.docs) return;
          snap.docs.forEach((docSnap: any) => {
            if (!seenIds.has(docSnap.id)) {
              seenIds.add(docSnap.id);
              collectedDocs.push({ ...docSnap.data(), id: docSnap.id });
            }
          });
        });

        if (currentOpenPatientIdRef.current !== patientIdentifier) {
          return;
        }

        const mergedProfiles = groupDocsByProfile(collectedDocs, patient);
        setPatientProfiles(mergedProfiles);
        if (mergedProfiles.length > 0) {
          setSelectedProfileKey(prevKey => {
            if (prevKey && mergedProfiles.some(p => p.profileKey === prevKey)) {
              return prevKey;
            }
            return mergedProfiles[0].profileKey;
          });
          setHistoryVisits(mergedProfiles[0].visits);
        }
      }
    } catch (err) {
      console.warn('Error loading patient full history:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  // Financial aggregation across patient visits
  const totalPaidSum = useMemo(() => {
    let sum = 0;
    activeProfileVisits.forEach(v => {
      if (v.amountPaid > 0) {
        sum += v.amountPaid;
      }
    });
    return sum;
  }, [activeProfileVisits]);

  // Sorted visits based on user's sorting order: 'desc' (Last to First / Newest) or 'asc' (First to Last / Oldest)
  const sortedHistoryVisits = useMemo(() => {
    const list = [...activeProfileVisits];
    list.sort((a, b) => {
      const cmp = String(b.date || '').localeCompare(String(a.date || ''));
      return historySortOrder === 'desc' ? cmp : -cmp;
    });
    return list;
  }, [activeProfileVisits, historySortOrder]);

  // Flatten all prescription images across all visits, sorted according to historySortOrder
  const allVisitedPrescriptionImages = useMemo(() => {
    const list: Array<{
      uri: string;
      visitNumber: number;
      visitDate: string;
      visitTime: string;
      doctor?: string;
      branch?: string;
      imageIndex: number;
      visitId?: string;
    }> = [];

    sortedHistoryVisits.forEach((v) => {
      const vNum = v.visitNumber || 1;
      (v.prescriptionImages || []).forEach((uri, iIdx) => {
        list.push({
          uri,
          visitNumber: vNum,
          visitDate: v.date,
          visitTime: v.time,
          doctor: v.doctor,
          branch: v.branch,
          imageIndex: iIdx + 1,
          visitId: v.id,
        });
      });
    });

    return list;
  }, [sortedHistoryVisits]);

  // Tab filtering within history modal using sorted visits
  const filteredHistoryVisits = useMemo(() => {
    if (historyFilterTab === 'billing') {
      const billOnly = sortedHistoryVisits.filter(v => v.amountPaid > 0 || v.paymentMode || v.consultationFee || v.medicineFee);
      return billOnly.length > 0 ? billOnly : sortedHistoryVisits;
    }
    return sortedHistoryVisits;
  }, [sortedHistoryVisits, historyFilterTab]);

  return (
    <View style={styles.container}>
      <FlatList
        data={displayedPatients}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 140 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={15}
        maxToRenderPerBatch={15}
        windowSize={5}
        removeClippedSubviews={Platform.OS === 'android'}
        onEndReached={() => {
          if (displayCount < filteredPatients.length) {
            setDisplayCount(prev => prev + PAGE_SIZE);
          }
        }}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={
          <View style={styles.listHeaderWrapper}>
            {/* Filter Control Box: Search + Date Sessions */}
            <View style={styles.filterToolbar}>
              {/* 1. Search Bar */}
              <View style={styles.searchBar}>
                <Feather name="search" size={17} color="#64748b" style={{ marginRight: 8 }} />
                <TextInput
                  style={styles.searchInputText}
                  placeholder="Search by Patient Name, Phone (+91), or ID..."
                  placeholderTextColor="#94a3b8"
                  value={searchTerm}
                  onChangeText={setSearchTerm}
                />
                {isSearchingLive && (
                  <ActivityIndicator size="small" color="#0284c7" style={{ marginRight: 6 }} />
                )}
                {searchTerm.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchTerm('')}>
                    <Feather name="x" size={16} color="#94a3b8" />
                  </TouchableOpacity>
                )}
              </View>

              {/* 2. Date Session Filter Buttons (Today, Yesterday, All) */}
              <View style={styles.dateFilterRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: 6 }}>
                  <Feather name="calendar" size={14} color="#64748b" />
                  <Text style={styles.filterSectionLabel}>Session:</Text>
                </View>

                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', flex: 1 }}>
                  {(['today', 'yesterday', 'all'] as const).map((mode) => {
                    const isActive = (dateFilterMode === mode) && !searchTerm;
                    const label = mode === 'today' ? 'Today' : mode === 'yesterday' ? 'Yesterday' : 'All Patients';
                    return (
                      <TouchableOpacity
                        key={mode}
                        onPress={() => { setDateFilterMode(mode); setSearchTerm(''); }}
                        style={[styles.dateFilterBtn, isActive && styles.dateFilterBtnActive]}
                      >
                        <Text style={[styles.dateFilterBtnText, isActive && styles.dateFilterBtnTextActive]}>
                          {label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <PatientCardItem
            patient={item}
            onPress={handleOpenPatientHistory}
            onCall={handleCall}
            onWhatsApp={handleWhatsApp}
          />
        )}
        ListFooterComponent={
          displayCount < filteredPatients.length ? (
            <View style={{ paddingVertical: 14, alignItems: 'center' }}>
              <ActivityIndicator size="small" color="#0284c7" />
              <Text style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                Loading more patients...
              </Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#0284c7" />
              <Text style={styles.loadingText}>Loading Patients...</Text>
            </View>
          ) : (
            <View style={styles.emptyCard}>
              <Ionicons name="people-outline" size={32} color="#94a3b8" style={{ marginBottom: 6 }} />
              <Text style={styles.emptyTitle}>No patients found</Text>
              <Text style={styles.emptySub}>
                {searchTerm
                  ? `No matches for "${searchTerm}". Try checking phone number or ID.`
                  : currentBranch ? `No records found for ${currentBranch} in this session.` : 'Try adjusting your date or search filter.'}
              </Text>
            </View>
          )
        }
      />

      {/* ========================================================================= */}
      {/* FULL-SCREEN POPUP: COMPLETE PATIENT HISTORY, PAID AMOUNT & PRESCRIPTIONS  */}
      {/* ========================================================================= */}
      <Modal
        visible={Boolean(selectedPatientForHistory)}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={handleCloseHistoryModal}
      >
        {selectedPatientForHistory && (
          <SafeAreaView style={styles.historyModalSafeArea}>
            <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
            {/* Top Navigation Header */}
            <View style={styles.historyModalHeader}>
              <TouchableOpacity
                style={styles.historyBackBtn}
                onPress={handleCloseHistoryModal}
                activeOpacity={0.7}
              >
                <Feather name="arrow-left" size={22} color="#0f172a" />
              </TouchableOpacity>

              <View style={{ flex: 1, marginHorizontal: 10 }}>
                <Text style={styles.historyHeaderTitle} numberOfLines={1}>
                  {activeProfile?.name || selectedPatientForHistory.name}
                </Text>
                <Text style={styles.historyHeaderSubtitle}>
                  ID: {activeProfile?.regId || selectedPatientForHistory.regId || selectedPatientForHistory.id} • {selectedPatientForHistory.phone}
                </Text>
              </View>

              {/* Quick Action Icons */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {selectedPatientForHistory.phone ? (
                  <>
                    <TouchableOpacity
                      style={styles.historyIconBtnCall}
                      onPress={() => handleCall(selectedPatientForHistory.phone)}
                    >
                      <Feather name="phone" size={15} color="#0284c7" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.historyIconBtnWA}
                      onPress={() => handleWhatsApp(selectedPatientForHistory.phone, activeProfile?.name || selectedPatientForHistory.name)}
                    >
                      <MaterialCommunityIcons name="whatsapp" size={17} color="#16a34a" />
                    </TouchableOpacity>
                  </>
                ) : null}
                <TouchableOpacity
                  style={styles.historyCloseBtn}
                  onPress={handleCloseHistoryModal}
                >
                  <Feather name="x" size={20} color="#64748b" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Family Profile Switcher Bar (when multiple profiles share this phone number) */}
            {patientProfiles.length > 1 && (
              <View style={styles.profileSelectorBar}>
                <View style={styles.profileSelectorTopRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <MaterialCommunityIcons name="account-group" size={16} color="#0284c7" />
                    <Text style={styles.profileSelectorTitle}>Family Members ({patientProfiles.length})</Text>
                  </View>
                  <Text style={styles.profileSelectorHint}>Select profile to isolate Rx & visits</Text>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.profileChipsScrollContent}
                >
                  {patientProfiles.map(p => {
                    const isSelected = p.profileKey === (activeProfile?.profileKey || selectedProfileKey);
                    return (
                      <TouchableOpacity
                        key={p.profileKey}
                        style={[
                          styles.profileTabChip,
                          isSelected && styles.profileTabChipActive
                        ]}
                        onPress={() => setSelectedProfileKey(p.profileKey)}
                        activeOpacity={0.75}
                      >
                        <MaterialCommunityIcons
                          name={isSelected ? "account-check" : "account-outline"}
                          size={15}
                          color={isSelected ? "#ffffff" : "#475569"}
                        />
                        <Text
                          style={[
                            styles.profileTabChipText,
                            isSelected && styles.profileTabChipTextActive
                          ]}
                          numberOfLines={1}
                        >
                          {p.name}
                        </Text>
                        <View
                          style={[
                            styles.profileCountBadge,
                            isSelected && styles.profileCountBadgeActive
                          ]}
                        >
                          <Text
                            style={[
                              styles.profileCountBadgeText,
                              isSelected && styles.profileCountBadgeTextActive
                            ]}
                          >
                            {p.visits.length}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
              showsVerticalScrollIndicator={false}
            >
              {/* Executive Summary Card: Total Paid Amount (Clean White Theme) */}
              <View style={styles.executiveBanner}>
                <View style={styles.executiveTopRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.executiveBannerLabel}>TOTAL PAID AMOUNT</Text>
                    <Text style={styles.executiveAmountText}>
                      ₹{totalPaidSum.toLocaleString('en-IN')}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <View style={styles.visitsCountBadge}>
                      <Text style={styles.visitsCountText}>
                        {activeProfileVisits.length} {activeProfileVisits.length === 1 ? 'Visit' : 'Visits'}
                      </Text>
                    </View>
                    <Text style={styles.executiveBranchText}>
                      {activeProfile?.branch || selectedPatientForHistory.branchName}
                    </Text>
                  </View>
                </View>

                {/* Action Buttons Row: Edit Latest Rx & Upload Rx for Any Date */}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  <TouchableOpacity
                    style={[styles.openClinicalFileActionBtn, { flex: 1, marginTop: 0 }]}
                    onPress={() => {
                      const pat = selectedPatientForHistory;
                      const latestVisit = activeProfileVisits && activeProfileVisits.length > 0 ? activeProfileVisits[0] : undefined;
                      setSelectedPatientForHistory(null);
                      handleOpenPatientFile(pat, latestVisit);
                    }}
                    activeOpacity={0.85}
                  >
                    <MaterialCommunityIcons name="file-document-edit-outline" size={17} color="#ffffff" />
                    <View style={{ flex: 1, marginLeft: 6 }}>
                      <Text style={styles.openClinicalFileActionText} numberOfLines={1}>
                        Edit Latest Rx
                      </Text>
                      <Text style={styles.openClinicalFileActionSub} numberOfLines={1}>
                        {activeProfileVisits[0] ? `Latest: ${activeProfileVisits[0].date}` : 'Notes & remedies'}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.uploadRxActionBtn}
                    onPress={handleOpenUploadModal}
                    activeOpacity={0.85}
                  >
                    <MaterialCommunityIcons name="cloud-upload" size={18} color="#ffffff" />
                    <View style={{ marginLeft: 6 }}>
                      <Text style={styles.uploadRxActionBtnText}>＋ Upload Rx</Text>
                      <Text style={styles.uploadRxActionBtnSub}>Any Date Scan</Text>
                    </View>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Segmented Filter Bar: All | Prescriptions | Billing */}
              <View style={styles.historySegmentedBar}>
                {[
                  { key: 'all', label: `All History (${historyVisits.length})` },
                  { key: 'prescriptions', label: allVisitedPrescriptionImages.length > 0 ? `Prescriptions (${allVisitedPrescriptionImages.length} Imgs)` : 'Prescriptions' },
                  { key: 'billing', label: totalPaidSum > 0 ? `Payments & Billing (₹${totalPaidSum.toLocaleString('en-IN')})` : 'Payments & Billing' },
                ].map((tab) => (
                  <TouchableOpacity
                    key={tab.key}
                    onPress={() => setHistoryFilterTab(tab.key as any)}
                    style={[
                      styles.historySegmentedTab,
                      historyFilterTab === tab.key && styles.historySegmentedTabActive
                    ]}
                  >
                    <Text
                      style={[
                        styles.historySegmentedTabText,
                        historyFilterTab === tab.key && styles.historySegmentedTabTextActive
                      ]}
                    >
                      {tab.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Sorting & Filter Control Toolbar (Last to First vs First to Last) */}
              <View style={styles.historySortToolbar}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <MaterialCommunityIcons name="sort-variant" size={16} color="#0284c7" />
                  <Text style={styles.historySortCountText}>
                    {historyFilterTab === 'prescriptions'
                      ? `${allVisitedPrescriptionImages.length} Prescription Images`
                      : historyFilterTab === 'billing'
                      ? `${filteredHistoryVisits.length} Payment Records`
                      : `${sortedHistoryVisits.length} Recorded Visits`}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.sortToggleBtn}
                  onPress={() => setHistorySortOrder(prev => (prev === 'desc' ? 'asc' : 'desc'))}
                  activeOpacity={0.75}
                >
                  <MaterialCommunityIcons
                    name={historySortOrder === 'desc' ? 'sort-calendar-descending' : 'sort-calendar-ascending'}
                    size={15}
                    color="#0284c7"
                  />
                  <Text style={styles.sortToggleBtnText}>
                    {historySortOrder === 'desc' ? 'Last to First (Newest)' : 'First to Last (Oldest)'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Top Banner: Executive Billing & Revenue Summary (Shown in Billing tab) */}
              {historyFilterTab === 'billing' && (
                <View style={styles.billingSummaryCard}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <View>
                      <Text style={styles.billingSummaryLabel}>TOTAL COLLECTED PAYMENT</Text>
                      <Text style={styles.billingSummaryAmount}>₹{totalPaidSum.toLocaleString('en-IN')}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={styles.billingSummaryLabel}>COLLECTED VISITS</Text>
                      <Text style={styles.billingSummaryVisitsCount}>
                        {historyVisits.filter(v => v.amountPaid > 0).length} of {historyVisits.length} Paid
                      </Text>
                    </View>
                  </View>
                  {historyVisits.length > 0 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                      {sortedHistoryVisits.map((v, idx) => (
                        <View key={idx} style={styles.billingVisitPill}>
                          <Text style={styles.billingVisitPillNum}>Visit #{v.visitNumber || (historyVisits.length - idx)}:</Text>
                          <Text style={styles.billingVisitPillAmount}>₹{v.amountPaid.toLocaleString('en-IN')}</Text>
                          <Text style={styles.billingVisitPillMode}>({v.paymentMode || 'Cash'})</Text>
                        </View>
                      ))}
                    </ScrollView>
                  )}
                </View>
              )}

              {/* Loading Indicator */}
              {isLoadingHistory ? (
                <View style={{ paddingVertical: 30, alignItems: 'center' }}>
                  <ActivityIndicator size="large" color="#0284c7" />
                  <Text style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>
                    Loading patient appointments & prescriptions...
                  </Text>
                </View>
              ) : null}

              {/* View Mode A: PRESCRIPTIONS TAB -> 2x2 GRID VIEW */}
              {!isLoadingHistory && historyFilterTab === 'prescriptions' && (
                <View>
                  {/* Quick Banner to Upload Prescription for Any Date */}
                  <TouchableOpacity
                    style={styles.uploadRxBannerBtn}
                    onPress={handleOpenUploadModal}
                    activeOpacity={0.85}
                  >
                    <View style={styles.uploadRxBannerLeft}>
                      <View style={styles.uploadRxBannerIconBox}>
                        <MaterialCommunityIcons name="camera-plus" size={20} color="#0284c7" />
                      </View>
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={styles.uploadRxBannerTitle}>
                          Upload Prescription Scan
                        </Text>
                        <Text style={styles.uploadRxBannerSub}>
                          Camera photo or gallery image for any date
                        </Text>
                      </View>
                    </View>
                    <View style={styles.uploadRxBannerPill}>
                      <Text style={styles.uploadRxBannerPillText}>＋ Add Rx</Text>
                    </View>
                  </TouchableOpacity>

                  {allVisitedPrescriptionImages.length === 0 ? (
                    <View style={styles.emptyHistoryCard}>
                      <MaterialCommunityIcons name="image-off-outline" size={40} color="#94a3b8" />
                      <Text style={styles.emptyHistoryTitle}>No Prescription Images Found</Text>
                      <Text style={styles.emptyHistorySub}>
                        No scanned prescription images were uploaded for {activeProfile?.name || 'this patient'}. Tap "＋ Add Rx" above to upload a prescription!
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.prescriptionGrid2x2}>
                      {allVisitedPrescriptionImages.map((img, idx) => (
                        <View key={idx} style={styles.prescriptionGridItem}>
                          {/* Box Header: Prescription Number & Date */}
                          <View style={styles.prescriptionGridHeader}>
                            <View style={styles.prescriptionProperBadge}>
                              <MaterialCommunityIcons name="file-document-outline" size={11} color="#0284c7" />
                              <Text style={styles.prescriptionProperBadgeText}>
                                Img {img.imageIndex}
                              </Text>
                            </View>
                            <TouchableOpacity
                              style={styles.prescriptionGridDeleteBtn}
                              onPress={() => {
                                setImageToDelete({
                                  uri: img.uri,
                                  visitNumber: img.visitNumber,
                                  visitDate: img.visitDate,
                                  imageIndex: img.imageIndex,
                                  visitId: img.visitId,
                                });
                              }}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              activeOpacity={0.7}
                            >
                              <Feather name="trash-2" size={12} color="#dc2626" />
                            </TouchableOpacity>
                            <Text style={styles.prescriptionGridDateText} numberOfLines={1}>
                              {img.visitDate ? String(img.visitDate).slice(-5) : ''}
                            </Text>
                          </View>

                          {/* Framed Image Container with 2x2 dimensions */}
                          <TouchableOpacity
                            style={styles.prescriptionGridImageFrame}
                            onPress={() => openLightbox(allVisitedPrescriptionImages.map(i => i.uri), idx)}
                            activeOpacity={0.85}
                          >
                            <Image
                              source={{ uri: img.uri }}
                              style={styles.prescriptionProperImage}
                              resizeMode="contain"
                            />
                            <View style={styles.prescriptionGridZoomBadge}>
                              <Feather name="maximize-2" size={11} color="#ffffff" />
                            </View>
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}

              {/* View Mode B: ALL HISTORY & BILLING TABS */}
              {!isLoadingHistory && historyFilterTab !== 'prescriptions' && (
                filteredHistoryVisits.length === 0 ? (
                  <View style={styles.emptyHistoryCard}>
                    <MaterialCommunityIcons name="history" size={36} color="#94a3b8" />
                    <Text style={styles.emptyHistoryTitle}>No records in this category</Text>
                    <Text style={styles.emptyHistorySub}>
                      Try switching back to "All History" to see appointments.
                    </Text>
                  </View>
                ) : (
                  filteredHistoryVisits.map((visit, vIdx) => {
                    const visitNum = visit.visitNumber || (historyVisits.length - vIdx);
                    const isPaid = visit.amountPaid > 0 || visit.paymentStatus === 'paid' || visit.status === 'completed';
                    const isUpi = (visit.paymentMode || '').toLowerCase().includes('upi');
                    const isCash = (visit.paymentMode || '').toLowerCase().includes('cash');
                    const isCard = (visit.paymentMode || '').toLowerCase().includes('card');
                    const isSplit = (visit.paymentMode || '').toLowerCase().includes('split');

                    const showPayment = historyFilterTab === 'all' || historyFilterTab === 'billing';
                    const showPrescription = historyFilterTab === 'all';

                    return (
                      <View key={visit.id || vIdx} style={styles.visitCard}>
                        {/* Visit Header */}
                        <View style={styles.visitCardHeader}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <View style={styles.visitIndexBadge}>
                              <Text style={styles.visitIndexText}>
                                VISIT #{visitNum} {historyFilterTab === 'billing' ? '• PAYMENT' : ''}
                              </Text>
                            </View>
                            <Text style={styles.visitDateText}>{formatPrettyDate(visit.date)}</Text>
                            <Text style={styles.visitTimeText}>• {visit.time}</Text>
                          </View>
                          <View style={[styles.visitStatusBadge, isPaid ? styles.statusPaidBg : styles.statusPendingBg]}>
                            <Text style={[styles.visitStatusBadgeText, isPaid ? styles.statusPaidText : styles.statusPendingText]}>
                              {isPaid ? 'Completed ✓' : 'Pay Pending'}
                            </Text>
                          </View>
                        </View>

                        {/* Doctor & Branch Row */}
                        <View style={styles.visitMetaRow}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 }}>
                            <MaterialCommunityIcons name="stethoscope" size={14} color="#0284c7" />
                            <Text style={styles.visitDoctorText} numberOfLines={1}>
                              {visit.doctor || 'Homeopathic Doctor'}
                            </Text>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Feather name="map-pin" size={12} color="#64748b" />
                            <Text style={styles.visitBranchText}>{visit.branch}</Text>
                          </View>
                        </View>

                        {/* 1. Paid Amount & Payment Method Section (Shown under All or Billing) */}
                        {showPayment && (
                          <View style={styles.visitPaymentBox}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                              <View>
                                <Text style={styles.paymentBoxLabel}>
                                  {historyFilterTab === 'billing' ? `VISIT #${visitNum} AMOUNT PAID` : 'AMOUNT PAID'}
                                </Text>
                                <Text style={styles.paymentBoxAmount}>
                                  ₹{visit.amountPaid.toLocaleString('en-IN')}
                                </Text>
                              </View>

                              <View style={{ alignItems: 'flex-end' }}>
                                <Text style={styles.paymentBoxLabel}>PAYMENT METHOD</Text>
                                <View
                                  style={[
                                    styles.paymentMethodBadge,
                                    isUpi ? styles.pillUpi : isCash ? styles.pillCash : isCard ? styles.pillCard : isSplit ? styles.pillSplit : styles.pillDefault
                                  ]}
                                >
                                  <Text style={{ fontSize: 11 }}>
                                    {isUpi ? '📱' : isCash ? '💵' : isCard ? '💳' : isSplit ? '🔀' : '💰'}
                                  </Text>
                                  <Text
                                    style={[
                                      styles.paymentMethodBadgeText,
                                      isUpi ? styles.textUpi : isCash ? styles.textCash : isCard ? styles.textCard : isSplit ? styles.textSplit : styles.textDefault
                                    ]}
                                  >
                                    {visit.paymentMode || 'Cash'}
                                  </Text>
                                </View>
                              </View>
                            </View>

                            {/* Split Details if applicable */}
                            {visit.splitDetails ? (
                              <View style={styles.splitDetailsRow}>
                                <Text style={styles.splitDetailsText}>
                                  Split Details: {visit.splitDetails}
                                </Text>
                              </View>
                            ) : null}

                            {/* Detailed Dates Row: Payment Date & Appointment Date */}
                            <View style={styles.paymentDatesBox}>
                              <View style={styles.paymentDateItem}>
                                <Text style={styles.paymentDateLabel}>💳 Payment Date:</Text>
                                <Text style={[styles.paymentDateVal, (!isPaid && !visit.paymentDate) && { color: '#d97706' }]}>
                                  {visit.paymentDate ? (
                                    `${formatPrettyDate(visit.paymentDate)} ${visit.paymentTime ? `• ${visit.paymentTime}` : ''}`
                                  ) : isPaid ? (
                                    `${formatPrettyDate(visit.date)} ${visit.paymentTime ? `• ${visit.paymentTime}` : ''}`
                                  ) : (
                                    'Pending / Unpaid'
                                  )}
                                </Text>
                              </View>
                              <View style={styles.paymentDateItem}>
                                <Text style={styles.paymentDateLabel}>📅 Appt Date:</Text>
                                <Text style={styles.paymentDateVal}>
                                  {formatPrettyDate(visit.date)} • {visit.time}
                                </Text>
                              </View>
                            </View>

                            {/* Fee Breakdown if available */}
                            {(visit.consultationFee || visit.medicineFee || visit.discount) ? (
                              <View style={styles.feeBreakdownRow}>
                                {visit.consultationFee ? (
                                  <Text style={styles.feeBreakdownItem}>
                                    Consult: ₹{visit.consultationFee}
                                  </Text>
                                ) : null}
                                {visit.medicineFee ? (
                                  <Text style={styles.feeBreakdownItem}>
                                    Medicines: ₹{visit.medicineFee}
                                  </Text>
                                ) : null}
                                {visit.discount ? (
                                  <Text style={[styles.feeBreakdownItem, { color: '#059669' }]}>
                                    Disc: -₹{visit.discount}
                                  </Text>
                                ) : null}
                                <Text style={[styles.feeBreakdownItem, { fontWeight: '800', color: '#0f172a' }]}>
                                  Net: ₹{(visit.totalAmount || visit.amountPaid).toLocaleString('en-IN')}
                                </Text>
                              </View>
                            ) : null}

                            {/* Payment ID / Ref */}
                            {visit.paymentId ? (
                              <Text style={styles.paymentRefText}>Ref ID: {visit.paymentId}</Text>
                            ) : null}
                          </View>
                        )}

                        {/* 2. Updated Prescriptions & Remedies Section (Shown under All History tab only) */}
                        {showPrescription && (
                          <View style={styles.visitPrescriptionBox}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                                <MaterialCommunityIcons name="pill" size={16} color="#0284c7" />
                                <Text style={styles.prescriptionBoxTitle} numberOfLines={1}>
                                  Updated Prescriptions & Remedies
                                </Text>
                              </View>
                              <TouchableOpacity
                                style={styles.editVisitRxBtn}
                                onPress={() => {
                                  const pat = selectedPatientForHistory;
                                  setSelectedPatientForHistory(null);
                                  handleOpenPatientFile(pat, visit);
                                }}
                                activeOpacity={0.8}
                              >
                                <MaterialCommunityIcons name="pencil-outline" size={13} color="#0284c7" />
                                <Text style={styles.editVisitRxBtnText}>Edit Rx</Text>
                              </TouchableOpacity>
                            </View>

                            {/* Chief Complaints / Diagnosis */}
                            {(visit.chiefComplaint || visit.diagnosisNotes) ? (
                              <View style={styles.diagnosisBox}>
                                {visit.chiefComplaint ? (
                                  <Text style={styles.diagnosisText}>
                                    <Text style={{ fontWeight: '800', color: '#334155' }}>Complaints: </Text>
                                    {visit.chiefComplaint}
                                  </Text>
                                ) : null}
                                {visit.diagnosisNotes ? (
                                  <Text style={styles.diagnosisText}>
                                    <Text style={{ fontWeight: '800', color: '#334155' }}>Diagnosis: </Text>
                                    {visit.diagnosisNotes}
                                  </Text>
                                ) : null}
                              </View>
                            ) : null}

                            {/* Remedies List */}
                            {visit.medicines && visit.medicines.length > 0 ? (
                              <View style={{ gap: 6 }}>
                                {visit.medicines.map((med, mIdx) => (
                                  <View key={mIdx} style={styles.remedyItemCard}>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                      <Text style={styles.remedyNameText}>
                                        {mIdx + 1}. {med.name}
                                      </Text>
                                      {med.potency ? (
                                        <View style={styles.remedyPotencyBadge}>
                                          <Text style={styles.remedyPotencyText}>{med.potency}</Text>
                                        </View>
                                      ) : null}
                                    </View>
                                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
                                      {med.dosage ? (
                                        <Text style={styles.remedyMetaText}>Dosage: {med.dosage}</Text>
                                      ) : null}
                                      {med.frequency ? (
                                        <Text style={styles.remedyMetaText}>Freq: {med.frequency}</Text>
                                      ) : null}
                                      {med.duration ? (
                                        <Text style={styles.remedyMetaText}>Duration: {med.duration}</Text>
                                      ) : null}
                                    </View>
                                    {med.instructions ? (
                                      <Text style={styles.remedyInstructionsText}>
                                        Instructions: {med.instructions}
                                      </Text>
                                    ) : null}
                                  </View>
                                ))}
                              </View>
                            ) : (
                              <Text style={styles.noMedsText}>
                                Remedies recorded in clinical file
                              </Text>
                            )}

                            {/* Attached Prescription Scans & Canvas Drawings */}
                            {visit.prescriptionImages && visit.prescriptionImages.length > 0 ? (
                              <View style={{ marginTop: 10 }}>
                                <Text style={styles.attachedImagesTitle}>
                                  Attached Prescription Images ({visit.prescriptionImages.length}) • Tap to zoom:
                                </Text>
                                <ScrollView
                                  horizontal
                                  showsHorizontalScrollIndicator={false}
                                  contentContainerStyle={{ gap: 10, paddingVertical: 4 }}
                                >
                                  {visit.prescriptionImages.map((imgUrl, iIdx) => (
                                    <View key={iIdx} style={styles.prescriptionImgCardWrapper}><TouchableOpacity

                                      style={styles.prescriptionImgCard}
                                      onPress={() => openLightbox(visit.prescriptionImages, iIdx)}
                                      activeOpacity={0.8}
                                    >
                                      <Image
                                        source={{ uri: imgUrl }}
                                        style={styles.prescriptionThumbnail}
                                        resizeMode="cover"
                                      />
                                      <View style={styles.prescriptionImgBadge}>
                                        <Text style={styles.prescriptionImgBadgeText}>Image {iIdx + 1}</Text>
                                      </View>
                                      <View style={styles.thumbnailZoomHint}>
                                        <Feather name="zoom-in" size={13} color="#ffffff" />
                                      </View>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                      style={styles.thumbnailDeleteBtn}
                                      onPress={() => {
                                        setImageToDelete({
                                          uri: imgUrl,
                                          visitNumber: visit.visitNumber,
                                          visitDate: visit.date,
                                          imageIndex: iIdx + 1,
                                          visitId: visit.id,
                                        });
                                      }}
                                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                      activeOpacity={0.75}
                                    >
                                      <Feather name="trash-2" size={11} color="#ffffff" />
                                    </TouchableOpacity>
                                  </View>
                                  ))}
                                </ScrollView>
                              </View>
                            ) : null}

                            {/* Doctor Notes */}
                            {visit.doctorNotes ? (
                              <View style={styles.doctorNotesBox}>
                                <Text style={styles.doctorNotesLabel}>Doctor Advice & Lifestyle Guidance:</Text>
                                <Text style={styles.doctorNotesText}>{visit.doctorNotes}</Text>
                              </View>
                            ) : null}
                          </View>
                        )}
                      </View>
                    );
                  })
                )
              )}
            </ScrollView>
          </SafeAreaView>
        )}
      </Modal>

      {/* Full-Screen Image Lightbox Modal with Rotate & Swipe */}
      {!!imagePreviewUrl && (
        <Modal
          visible={!!imagePreviewUrl}
          transparent={true}
          animationType="fade"
          onRequestClose={closeLightbox}
        >
          <View style={styles.imageLightboxOverlay}>
            <StatusBar backgroundColor="#000000" barStyle="light-content" />

            {/* Top Controls Toolbar */}
            <SafeAreaView style={styles.lightboxTopToolbar}>
              <View style={styles.lightboxCounterBadge}>
                <Text style={styles.lightboxCounterText}>
                  {lightboxImages.length > 0 ? `${lightboxIndex + 1} / ${lightboxImages.length}` : '1 / 1'}
                </Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                {/* Remove / Delete Button */}
                <TouchableOpacity
                  style={styles.lightboxDeleteBtn}
                  onPress={() => {
                    if (imagePreviewUrl) {
                      setImageToDelete({
                        uri: imagePreviewUrl,
                        imageIndex: lightboxIndex + 1,
                      });
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <Feather name="trash-2" size={16} color="#ffffff" />
                  <Text style={styles.lightboxDeleteBtnText}>Remove</Text>
                </TouchableOpacity>

                {/* Rotate Button (90 deg per tap) */}
                <TouchableOpacity
                  style={styles.lightboxToolbarBtn}
                  onPress={handleRotateImage}
                  activeOpacity={0.7}
                >
                  <MaterialCommunityIcons name="rotate-right" size={20} color="#ffffff" />
                  <Text style={styles.lightboxToolbarBtnText}>{imageRotation}°</Text>
                </TouchableOpacity>

                {/* Close Button */}
                <TouchableOpacity
                  style={styles.lightboxCloseBtn}
                  onPress={closeLightbox}
                  activeOpacity={0.7}
                >
                  <Feather name="x" size={22} color="#ffffff" />
                </TouchableOpacity>
              </View>
            </SafeAreaView>

            {/* Main Image Area with Horizontal Swipe PanResponder */}
            <View style={styles.lightboxImageArea} {...panResponder.panHandlers}>
              <Image
                source={{ uri: imagePreviewUrl }}
                style={[
                  styles.imageLightboxImage,
                  { transform: [{ rotate: `${imageRotation}deg` }] }
                ]}
                resizeMode="contain"
              />
            </View>

            {/* Left (<) Navigation Arrow Button */}
            {lightboxImages.length > 1 && (
              <TouchableOpacity
                style={[styles.lightboxNavBtn, styles.lightboxNavBtnLeft]}
                onPress={handlePrevImage}
                activeOpacity={0.75}
              >
                <Feather name="chevron-left" size={32} color="#ffffff" />
              </TouchableOpacity>
            )}

            {/* Right (>) Navigation Arrow Button */}
            {lightboxImages.length > 1 && (
              <TouchableOpacity
                style={[styles.lightboxNavBtn, styles.lightboxNavBtnRight]}
                onPress={handleNextImage}
                activeOpacity={0.75}
              >
                <Feather name="chevron-right" size={32} color="#ffffff" />
              </TouchableOpacity>
            )}

            {/* Bottom Swipe Guidance Hint */}
            {lightboxImages.length > 1 && (
              <View style={styles.lightboxBottomHint}>
                <Text style={styles.lightboxBottomHintText}>
                  Swipe left / right or tap &lt; &gt; arrows to view next prescription
                </Text>
              </View>
            )}
          </View>
        </Modal>
      )}

      {/* Confirmation Modal to Remove Prescription Image */}
      {!!imageToDelete && (
        <Modal
          visible={!!imageToDelete}
          transparent={true}
          animationType="fade"
          onRequestClose={() => {
            if (!isDeletingImage) setImageToDelete(null);
          }}
        >
          <View style={styles.confirmModalOverlay}>
            <View style={styles.confirmModalCard}>
              {/* Header with Icon and Title */}
              <View style={styles.confirmModalHeader}>
                <View style={styles.confirmTrashIconBox}>
                  <Feather name="trash-2" size={22} color="#dc2626" />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.confirmModalTitle}>Remove Prescription Image</Text>
                  <Text style={styles.confirmModalSub}>
                    Are you sure you want to remove this image?
                  </Text>
                </View>
              </View>

              {/* Preview Thumbnail of Selected Image */}
              {imageToDelete?.uri ? (
                <View style={styles.confirmImagePreviewBox}>
                  <Image
                    source={{ uri: imageToDelete.uri }}
                    style={styles.confirmImagePreview}
                    resizeMode="contain"
                  />
                  <View style={styles.confirmImageMeta}>
                    <Text style={styles.confirmImageMetaText} numberOfLines={1}>
                      👤 Patient: <Text style={{ fontWeight: '800', color: '#0f172a' }}>{activeProfile?.name || selectedPatientForHistory?.name}</Text>
                    </Text>
                    {imageToDelete.visitDate ? (
                      <Text style={styles.confirmImageMetaText}>
                        📅 Date: <Text style={{ fontWeight: '700', color: '#0f172a' }}>{formatPrettyDate(imageToDelete.visitDate)}</Text>
                        {imageToDelete.visitNumber ? ` (Visit #${imageToDelete.visitNumber})` : ''}
                      </Text>
                    ) : null}
                  </View>
                </View>
              ) : null}

              <Text style={styles.confirmWarningText}>
                ⚠️ This image will be permanently removed from this patient's records.
              </Text>

              {/* Action Buttons: Cancel and OK, Remove */}
              <View style={styles.confirmButtonsRow}>
                <TouchableOpacity
                  style={styles.confirmCancelBtn}
                  onPress={() => setImageToDelete(null)}
                  disabled={isDeletingImage}
                  activeOpacity={0.75}
                >
                  <Text style={styles.confirmCancelBtnText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.confirmDeleteBtn, isDeletingImage && styles.confirmDeleteBtnDisabled]}
                  onPress={handleConfirmDeleteImage}
                  disabled={isDeletingImage}
                  activeOpacity={0.85}
                >
                  {isDeletingImage ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <>
                      <Feather name="trash-2" size={15} color="#ffffff" />
                      <Text style={styles.confirmDeleteBtnText}>OK, Remove</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Upload Prescription Scan Modal (Camera / Gallery for Any Date) */}
      <Modal
        visible={uploadModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          if (!isUploadingPrescription) setUploadModalVisible(false);
        }}
      >
        <View style={styles.uploadModalOverlay}>
          <View style={styles.uploadModalCard}>
            {/* Header */}
            <View style={styles.uploadModalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.uploadModalTitle}>Upload Prescription</Text>
                <Text style={styles.uploadModalSub} numberOfLines={1}>
                  {activeProfile?.name || selectedPatientForHistory?.name} • {selectedPatientForHistory?.phone}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.uploadModalCloseBtn}
                onPress={() => setUploadModalVisible(false)}
                disabled={isUploadingPrescription}
              >
                <Feather name="x" size={20} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16 }}>
              {/* Profile Selector (if multiple family members exist) */}
              {patientProfiles.length > 1 && (
                <View style={{ marginBottom: 16 }}>
                  <Text style={styles.uploadFieldLabel}>ASSIGN TO PATIENT PROFILE:</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 6 }}>
                    {patientProfiles.map(p => {
                      const isSel = (uploadTargetProfileKey || activeProfile?.profileKey) === p.profileKey;
                      return (
                        <TouchableOpacity
                          key={p.profileKey}
                          style={[styles.uploadProfilePill, isSel && styles.uploadProfilePillActive]}
                          onPress={() => setUploadTargetProfileKey(p.profileKey)}
                          activeOpacity={0.75}
                        >
                          <MaterialCommunityIcons
                            name={isSel ? "account-check" : "account-outline"}
                            size={14}
                            color={isSel ? "#ffffff" : "#475569"}
                          />
                          <Text style={[styles.uploadProfilePillText, isSel && styles.uploadProfilePillTextActive]}>
                            {p.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              {/* Target Date Input with Quick Date Chips */}
              <View style={{ marginBottom: 16 }}>
                <Text style={styles.uploadFieldLabel}>PRESCRIPTION / VISIT DATE (YYYY-MM-DD):</Text>
                <View style={styles.uploadDateInputBox}>
                  <Feather name="calendar" size={17} color="#0284c7" />
                  <TextInput
                    style={styles.uploadDateInput}
                    value={uploadTargetDate}
                    onChangeText={setUploadTargetDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#94a3b8"
                  />
                  {uploadTargetDate ? (
                    <TouchableOpacity onPress={() => setUploadTargetDate(new Date().toISOString().split('T')[0])}>
                      <Text style={{ fontSize: 11, color: '#0284c7', fontWeight: '700' }}>Today</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>

                {/* Quick Date Chips */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginTop: 8 }}>
                  {[
                    { label: 'Today', date: new Date().toISOString().split('T')[0] },
                    { label: 'Yesterday', date: new Date(Date.now() - 86400000).toISOString().split('T')[0] },
                    ...activeProfileVisits.slice(0, 3).map(v => ({ label: v.date, date: v.date }))
                  ].filter((item, idx, arr) => arr.findIndex(x => x.date === item.date) === idx)
                   .map(item => {
                    const isSel = uploadTargetDate === item.date;
                    return (
                      <TouchableOpacity
                        key={item.date}
                        style={[styles.quickDateChip, isSel && styles.quickDateChipActive]}
                        onPress={() => setUploadTargetDate(item.date)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.quickDateChipText, isSel && styles.quickDateChipTextActive]}>
                          {item.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Image Source Selection */}
              <View style={{ marginBottom: 16 }}>
                <Text style={styles.uploadFieldLabel}>PRESCRIPTION IMAGE (CAMERA OR GALLERY):</Text>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
                  <TouchableOpacity
                    style={styles.sourceBtnCamera}
                    onPress={handleTakePhoto}
                    activeOpacity={0.8}
                    disabled={isUploadingPrescription}
                  >
                    <Feather name="camera" size={18} color="#0284c7" />
                    <Text style={styles.sourceBtnCameraText}>Take Photo</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.sourceBtnGallery}
                    onPress={handlePickFromGallery}
                    activeOpacity={0.8}
                    disabled={isUploadingPrescription}
                  >
                    <Feather name="image" size={18} color="#475569" />
                    <Text style={styles.sourceBtnGalleryText}>Choose Gallery</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Image Preview Box */}
              {uploadImageUri ? (
                <View style={styles.uploadPreviewContainer}>
                  <Image source={{ uri: uploadImageUri }} style={styles.uploadPreviewImage} resizeMode="contain" />
                  <TouchableOpacity
                    style={styles.uploadRemoveBtn}
                    onPress={() => {
                      setUploadImageUri(null);
                      setUploadImageBase64(null);
                    }}
                    activeOpacity={0.75}
                  >
                    <Feather name="trash-2" size={13} color="#ffffff" />
                    <Text style={styles.uploadRemoveBtnText}>Remove / Retake</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.uploadPlaceholderBox}>
                  <MaterialCommunityIcons name="cloud-upload-outline" size={32} color="#94a3b8" />
                  <Text style={styles.uploadPlaceholderText}>
                    No photo selected yet. Tap Take Photo or Choose Gallery above.
                  </Text>
                </View>
              )}

              {/* Action Buttons */}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
                <TouchableOpacity
                  style={styles.uploadCancelBtn}
                  onPress={() => setUploadModalVisible(false)}
                  disabled={isUploadingPrescription}
                >
                  <Text style={styles.uploadCancelBtnText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.uploadSubmitBtn,
                    (!uploadImageUri || isUploadingPrescription) && styles.uploadSubmitBtnDisabled
                  ]}
                  onPress={handleSaveUploadedPrescription}
                  disabled={!uploadImageUri || isUploadingPrescription}
                  activeOpacity={0.85}
                >
                  {isUploadingPrescription ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <>
                      <MaterialCommunityIcons name="cloud-check" size={18} color="#ffffff" />
                      <Text style={styles.uploadSubmitBtnText}>Save Prescription</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  listHeaderWrapper: {
    paddingBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    marginTop: 4,
  },
  headerIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 19,
    fontWeight: '800',
    color: '#0f172a',
  },
  subtitle: {
    fontSize: 11.5,
    color: '#64748b',
    marginTop: 1,
    fontWeight: '600',
  },
  filterToolbar: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 8,
  },
  searchInputText: {
    flex: 1,
    fontSize: 13,
    color: '#0f172a',
    paddingVertical: 3,
  },
  dateFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  filterSectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  dateFilterBtn: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
  },
  dateFilterBtnActive: {
    borderColor: '#0284c7',
    backgroundColor: '#0284c7',
  },
  dateFilterBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#334155',
  },
  dateFilterBtnTextActive: {
    color: '#ffffff',
  },
  patientCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 9,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 5,
  },
  patientName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
  },
  visitBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  visitBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  patientIdText: {
    fontSize: 11.5,
    color: '#64748b',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  detailText: {
    fontSize: 11.5,
    color: '#64748b',
    fontWeight: '500',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 8,
  },
  phoneText: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '600',
  },
  viewHistoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 6,
  },
  viewHistoryPillText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#0284c7',
  },
  iconBtnCall: {
    width: 30,
    height: 30,
    borderRadius: 6,
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnWA: {
    width: 30,
    height: 30,
    borderRadius: 6,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  openFileBtn: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  openFileBtnText: {
    color: '#ffffff',
    fontSize: 11.5,
    fontWeight: '800',
  },
  emptyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
  },
  emptySub: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
    textAlign: 'center',
  },
  loadingContainer: {
    padding: 36,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 18,
  },

  // --- Full-Screen History Modal Styles ---
  historyModalSafeArea: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  historyModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  historyBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  historyHeaderSubtitle: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 1,
  },
  historyIconBtnCall: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyIconBtnWA: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  executiveBanner: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  executiveTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingBottom: 12,
    marginBottom: 12,
  },
  executiveBannerLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 0.8,
  },
  executiveAmountText: {
    fontSize: 26,
    fontWeight: '900',
    color: '#0f172a',
    marginTop: 2,
  },
  visitsCountBadge: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  visitsCountText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#0284c7',
  },
  executiveBranchText: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
    marginTop: 4,
  },
  openClinicalFileActionBtn: {
    backgroundColor: '#0284c7',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  openClinicalFileActionText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  openClinicalFileActionSub: {
    color: '#bae6fd',
    fontSize: 10.5,
    fontWeight: '600',
    marginTop: 1,
  },
  editVisitRxBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  editVisitRxBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0284c7',
  },
  historySegmentedBar: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 3,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 12,
  },
  historySegmentedTab: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: 7,
  },
  historySegmentedTabActive: {
    backgroundColor: '#0284c7',
  },
  historySegmentedTabText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
  },
  historySegmentedTabTextActive: {
    color: '#ffffff',
  },
  emptyHistoryCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  emptyHistoryTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 8,
  },
  emptyHistorySub: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
    textAlign: 'center',
  },
  visitCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
    marginBottom: 12,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  visitCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingBottom: 8,
    marginBottom: 8,
  },
  visitIndexBadge: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  visitIndexText: {
    fontSize: 9.5,
    fontWeight: '900',
    color: '#475569',
  },
  visitDateText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
  },
  visitTimeText: {
    fontSize: 11.5,
    color: '#64748b',
  },
  visitStatusBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 5,
  },
  statusPaidBg: {
    backgroundColor: '#dcfce7',
  },
  statusPaidText: {
    color: '#15803d',
    fontSize: 10.5,
    fontWeight: '800',
  },
  statusPendingBg: {
    backgroundColor: '#fee2e2',
  },
  statusPendingText: {
    color: '#b91c1c',
    fontSize: 10.5,
    fontWeight: '800',
  },
  visitMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  visitDoctorText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0284c7',
  },
  visitBranchText: {
    fontSize: 11,
    color: '#64748b',
  },
  visitPaymentBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 10,
    marginBottom: 10,
  },
  paymentBoxLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 0.5,
  },
  paymentBoxAmount: {
    fontSize: 18,
    fontWeight: '900',
    color: '#16a34a',
    marginTop: 1,
  },
  paymentMethodBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    marginTop: 2,
  },
  paymentMethodBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  splitDetailsRow: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  splitDetailsText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#7e22ce',
  },
  feeBreakdownRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    flexWrap: 'wrap',
  },
  feeBreakdownItem: {
    fontSize: 10.5,
    color: '#64748b',
    fontWeight: '600',
  },
  paymentRefText: {
    fontSize: 9.5,
    color: '#94a3b8',
    marginTop: 4,
  },
  visitPrescriptionBox: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 10,
  },
  prescriptionBoxTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0f172a',
  },
  diagnosisBox: {
    backgroundColor: '#f1f5f9',
    borderRadius: 6,
    padding: 8,
    marginBottom: 8,
    gap: 2,
  },
  diagnosisText: {
    fontSize: 11,
    color: '#475569',
  },
  remedyItemCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 8,
  },
  remedyNameText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0f172a',
    flex: 1,
  },
  remedyPotencyBadge: {
    backgroundColor: '#e0f2fe',
    borderWidth: 1,
    borderColor: '#bae6fd',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  remedyPotencyText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0284c7',
  },
  remedyMetaText: {
    fontSize: 10.5,
    color: '#475569',
    fontWeight: '600',
  },
  remedyInstructionsText: {
    fontSize: 10.5,
    color: '#0284c7',
    fontWeight: '600',
    marginTop: 3,
    fontStyle: 'italic',
  },
  noMedsText: {
    fontSize: 11,
    color: '#94a3b8',
    fontStyle: 'italic',
    paddingVertical: 4,
  },
  attachedImagesTitle: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 6,
  },
  prescriptionThumbnailWrapper: {
    width: 68,
    height: 68,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#f1f5f9',
  },
  prescriptionThumbnail: {
    width: '100%',
    height: '100%',
  },
  thumbnailZoomHint: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    borderRadius: 3,
    padding: 2,
  },
  doctorNotesBox: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  doctorNotesLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#334155',
  },
  doctorNotesText: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  visitStatusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  pillUpi: {
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
  },
  pillCash: {
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0',
  },
  pillCard: {
    backgroundColor: '#faf5ff',
    borderColor: '#e9d5ff',
  },
  pillSplit: {
    backgroundColor: '#fff7ed',
    borderColor: '#fed7aa',
  },
  pillDefault: {
    backgroundColor: '#f1f5f9',
    borderColor: '#cbd5e1',
  },
  textUpi: {
    color: '#2563eb',
  },
  textCash: {
    color: '#16a34a',
  },
  textCard: {
    color: '#9333ea',
  },
  textSplit: {
    color: '#ea580c',
  },
  textDefault: {
    color: '#475569',
  },
  allImagesBannerCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    marginBottom: 12,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  allImagesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingBottom: 6,
  },
  allImagesTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0f172a',
  },
  allImagesSub: {
    fontSize: 10,
    color: '#64748b',
    fontWeight: '600',
  },
  allImageCard: {
    width: 90,
    height: 90,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#f8fafc',
  },
  allImageThumbnail: {
    width: '100%',
    height: '100%',
  },
  allImageBadge: {
    position: 'absolute',
    top: 3,
    left: 3,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    paddingHorizontal: 4,
    paddingVertical: 1.5,
    borderRadius: 3,
  },
  allImageBadgeText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#ffffff',
  },
  billingSummaryCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    marginBottom: 12,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  billingSummaryLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#64748b',
    letterSpacing: 0.5,
  },
  billingSummaryAmount: {
    fontSize: 20,
    fontWeight: '900',
    color: '#16a34a',
    marginTop: 1,
  },
  billingSummaryVisitsCount: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0284c7',
    marginTop: 2,
  },
  billingVisitsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    flexWrap: 'wrap',
  },
  billingVisitPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 6,
  },
  billingVisitPillNum: {
    fontSize: 10,
    fontWeight: '800',
    color: '#475569',
  },
  billingVisitPillAmount: {
    fontSize: 10.5,
    fontWeight: '900',
    color: '#16a34a',
  },
  billingVisitPillMode: {
    fontSize: 9.5,
    color: '#64748b',
    fontWeight: '600',
  },
  paymentDatesBox: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    gap: 4,
  },
  paymentDateItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  paymentDateLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748b',
    width: 110,
  },
  paymentDateVal: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0f172a',
    flex: 1,
  },
  prescriptionImgGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  prescriptionImgCard: {
    width: 84,
    height: 84,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#f1f5f9',
  },
  prescriptionImgBadge: {
    position: 'absolute',
    top: 3,
    left: 3,
    backgroundColor: '#0284c7',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 3,
  },
  prescriptionImgBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#ffffff',
  },
  historySortToolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  historySortCountText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#475569',
  },
  sortToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  sortToggleBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0284c7',
  },
  prescriptionGrid2x2: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  prescriptionGridItem: {
    width: '48.5%',
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    padding: 8,
    marginBottom: 10,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  prescriptionGridHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  prescriptionProperBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  prescriptionProperBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0284c7',
  },
  prescriptionGridDateText: {
    fontSize: 9.5,
    fontWeight: '600',
    color: '#64748b',
  },
  prescriptionGridImageFrame: {
    width: '100%',
    height: 135,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  prescriptionProperImage: {
    width: '100%',
    height: '100%',
  },
  prescriptionGridZoomBadge: {
    position: 'absolute',
    bottom: 5,
    right: 5,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // --- Lightbox Modal Styles ---
  imageLightboxOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lightboxTopToolbar: {
    position: 'absolute',
    top: Platform.OS === 'android' ? 20 : 44,
    left: 16,
    right: 16,
    zIndex: 50,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lightboxCounterBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  lightboxCounterText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  lightboxToolbarBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  lightboxToolbarBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  lightboxCloseBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  lightboxImageArea: {
    width: '100%',
    height: '80%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageLightboxImage: {
    width: '92%',
    height: '92%',
  },
  lightboxNavBtn: {
    position: 'absolute',
    top: '50%',
    marginTop: -28,
    width: 48,
    height: 56,
    borderRadius: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 40,
  },
  lightboxNavBtnLeft: {
    left: 10,
  },
  lightboxNavBtnRight: {
    right: 10,
  },
  lightboxBottomHint: {
    position: 'absolute',
    bottom: 25,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  lightboxBottomHintText: {
    color: '#cbd5e1',
    fontSize: 11,
    fontWeight: '600',
  },
  // --- Profile Switcher Bar Styles ---
  profileSelectorBar: {
    backgroundColor: '#f0f9ff',
    borderBottomWidth: 1,
    borderBottomColor: '#bae6fd',
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  profileSelectorTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  profileSelectorTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0369a1',
    letterSpacing: 0.2,
  },
  profileSelectorHint: {
    fontSize: 10.5,
    color: '#0284c7',
    fontWeight: '500',
  },
  profileChipsScrollContent: {
    gap: 8,
    paddingVertical: 2,
  },
  profileTabChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ffffff',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
  },
  profileTabChipActive: {
    backgroundColor: '#0284c7',
    borderColor: '#0284c7',
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 3,
  },
  profileTabChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  profileTabChipTextActive: {
    color: '#ffffff',
  },
  profileCountBadge: {
    backgroundColor: '#e2e8f0',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
  },
  profileCountBadgeActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  profileCountBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#475569',
  },
  profileCountBadgeTextActive: {
    color: '#ffffff',
  },
  // --- Upload Rx Action Buttons ---
  uploadRxActionBtn: {
    backgroundColor: '#0284c7',
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#0369a1',
  },
  uploadRxActionBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
  },
  uploadRxActionBtnSub: {
    color: '#e0f2fe',
    fontSize: 9.5,
    fontWeight: '500',
  },
  uploadRxBannerBtn: {
    backgroundColor: '#eff6ff',
    borderWidth: 1.5,
    borderColor: '#bfdbfe',
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    marginBottom: 14,
  },
  uploadRxBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  uploadRxBannerIconBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#dbeafe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadRxBannerTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1e3a8a',
  },
  uploadRxBannerSub: {
    fontSize: 11,
    color: '#3b82f6',
    marginTop: 2,
  },
  uploadRxBannerPill: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  uploadRxBannerPillText: {
    color: '#ffffff',
    fontSize: 11.5,
    fontWeight: '800',
  },
  // --- Upload Modal Styles ---
  uploadModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  uploadModalCard: {
    width: '100%',
    maxHeight: '90%',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
  uploadModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  uploadModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  uploadModalSub: {
    fontSize: 11.5,
    color: '#64748b',
    marginTop: 2,
  },
  uploadModalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadFieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 0.3,
  },
  uploadProfilePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
  },
  uploadProfilePillActive: {
    backgroundColor: '#0284c7',
    borderColor: '#0284c7',
  },
  uploadProfilePillText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#334155',
  },
  uploadProfilePillTextActive: {
    color: '#ffffff',
    fontWeight: '800',
  },
  uploadDateInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginTop: 6,
  },
  uploadDateInput: {
    flex: 1,
    fontSize: 13,
    color: '#0f172a',
    paddingVertical: 0,
    paddingHorizontal: 8,
    fontWeight: '600',
  },
  quickDateChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  quickDateChipActive: {
    backgroundColor: '#e0f2fe',
    borderColor: '#0284c7',
  },
  quickDateChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  quickDateChipTextActive: {
    color: '#0284c7',
    fontWeight: '800',
  },
  sourceBtnCamera: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#e0f2fe',
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  sourceBtnCameraText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0284c7',
  },
  sourceBtnGallery: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  sourceBtnGalleryText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  uploadPreviewContainer: {
    width: '100%',
    height: 180,
    backgroundColor: '#0f172a',
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  uploadPreviewImage: {
    width: '100%',
    height: '100%',
  },
  uploadRemoveBtn: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.9)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  uploadRemoveBtnText: {
    color: '#ffffff',
    fontSize: 10.5,
    fontWeight: '700',
  },
  uploadPlaceholderBox: {
    height: 120,
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    borderStyle: 'dashed',
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  uploadPlaceholderText: {
    color: '#94a3b8',
    fontSize: 11.5,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 16,
  },
  uploadCancelBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
  },
  uploadCancelBtnText: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '700',
  },
  uploadSubmitBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 8,
    backgroundColor: '#0284c7',
  },
  uploadSubmitBtnDisabled: {
    backgroundColor: '#94a3b8',
    opacity: 0.6,
  },
  prescriptionGridDeleteBtn: {
    padding: 3,
    borderRadius: 6,
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fecaca',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  prescriptionImgCardWrapper: {
    position: 'relative',
  },
  thumbnailDeleteBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(220, 38, 38, 0.9)',
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    elevation: 4,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
  },
  lightboxDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(220, 38, 38, 0.85)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  lightboxDeleteBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  // --- Confirmation Modal Styles ---
  confirmModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 9999,
  },
  confirmModalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 12,
  },
  confirmModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  confirmTrashIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  confirmModalSub: {
    fontSize: 12.5,
    color: '#64748b',
    marginTop: 2,
  },
  confirmImagePreviewBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
    marginBottom: 12,
    padding: 10,
    alignItems: 'center',
  },
  confirmImagePreview: {
    width: '100%',
    height: 140,
    borderRadius: 8,
    backgroundColor: '#0f172a',
  },
  confirmImageMeta: {
    width: '100%',
    marginTop: 8,
    gap: 3,
  },
  confirmImageMetaText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '500',
  },
  confirmWarningText: {
    fontSize: 11.5,
    color: '#b91c1c',
    lineHeight: 16,
    marginBottom: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  confirmButtonsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  confirmCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmCancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  confirmDeleteBtn: {
    flex: 1.3,
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
  },
  confirmDeleteBtnDisabled: {
    opacity: 0.6,
  },
  confirmDeleteBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#ffffff',
  },
  uploadSubmitBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
});
