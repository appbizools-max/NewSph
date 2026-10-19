import React, { useState, useMemo, useEffect, useCallback, memo } from 'react';
import {
  StyleSheet, Text, View, FlatList, TextInput, TouchableOpacity,
  Modal, Alert, Linking, ActivityIndicator, Platform, ScrollView,
  SafeAreaView, Image, Dimensions, StatusBar
} from 'react-native';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { getSafeDb, collection, query, where, getDocs, limit } from '../../../utils/firebaseSafe';
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

interface AllPatientsScreenProps {
  onNavigate?: (tab: string, patient?: any) => void;
  currentBranch?: string;
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
  if (clean.includes('T')) return clean.split('T')[0];

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
        // DD-MM-YYYY or DD-MM-YY
        const dd = parts[0].padStart(2, '0');
        const mm = parts[1].padStart(2, '0');
        const yyyy = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
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
    // Extract actual appointment / booking date. Never fallback to today so old or undated master records don't populate 'Today'!
    const rawDate = data.appointmentDate || data.date || data.bookingDate || data.slotDate || data.dateString || data.scheduledDate || data.createdAt;
    const isoDate = normalizeDateToISO(rawDate);
    let status = 'active';
    const s = String(data.status || '').toLowerCase().trim();
    const p = String(data.paymentStatus || '').toLowerCase().trim();
    if (s === 'completed' || s === 'done' || s === 'paid' || p === 'paid') {
      status = 'completed';
    } else if (s === 'follow_up' || s === 'followup' || data.followUpOpted === true) {
      status = 'follow_up';
    } else if (s === 'collect_fee' || s === 'awaiting_payment' || p === 'pending') {
      status = 'awaiting_payment';
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
      if (status === 'completed' || status === 'follow_up') {
        existing.status = status;
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

  // Pass 1: Index all appointment and document IDs to their visit dates
  for (const d of rawDocs) {
    if (!d) continue;
    const rawDate = d.appointmentDate || d.date || d.bookingDate || d.createdAt || fallbackPatient.appointmentDate;
    const isoDate = normalizeDateToISO(rawDate) || String(rawDate).split('T')[0] || getFormattedDateStr(new Date());

    const docId = d.id || d.docId || '';
    const aptId = d.appointmentId || d.bookingId || d.aptId || d.visitId || '';

    if (docId) aptIdToKeyMap.set(docId, isoDate);
    if (aptId) aptIdToKeyMap.set(aptId, isoDate);
  }

  // Pass 2: Merge each document (appointment, prescription, product_bill) into the visit on its date
  for (const d of rawDocs) {
    if (!d) continue;
    const rawDate = d.appointmentDate || d.date || d.bookingDate || d.createdAt || fallbackPatient.appointmentDate;
    const isoDate = normalizeDateToISO(rawDate) || String(rawDate).split('T')[0] || getFormattedDateStr(new Date());

    const docId = d.id || d.docId || '';
    const aptId = d.appointmentId || d.bookingId || d.aptId || d.visitId || '';

    let targetKey = isoDate;
    if (aptId && aptIdToKeyMap.has(aptId)) {
      targetKey = aptIdToKeyMap.get(aptId)!;
    } else if (docId && aptIdToKeyMap.has(docId)) {
      targetKey = aptIdToKeyMap.get(docId)!;
    }

    const pm = extractAmountAndPaymentMode(d);
    const meds = extractMedicinesFromRecord(d);
    const imgs = extractPrescriptionImagesFromRecord(d);
    const bName = d.branch || d.targetBranch || d.branchName || fallbackPatient.branchName || 'Clinic';
    const docName = sanitizeDoctorName(d.doctorName || d.doctor, bName);
    const rawTime = d.appointmentTime || d.time || d.timeSlot || '';

    if (!visitMap.has(targetKey)) {
      visitMap.set(targetKey, {
        id: docId || targetKey,
        date: targetKey,
        time: rawTime || '10:00 AM',
        branch: bName,
        doctor: docName || fallbackPatient.doctorName || 'Homeopathic Doctor',
        status: d.status || (pm.amountPaid > 0 ? 'completed' : 'active'),
        amountPaid: pm.amountPaid,
        totalAmount: pm.totalAmount,
        consultationFee: Number(d.consultationFee) || 0,
        medicineFee: Number(d.medicineFee || d.totalMedicineFee) || 0,
        discount: Number(d.discount || d.discountAmount) || 0,
        paymentMode: pm.mode,
        paymentStatus: pm.status,
        paymentId: pm.paymentId,
        splitDetails: pm.splitDetails,
        chiefComplaint: d.chiefComplaint || d.subject || d.complaints || '',
        diagnosisNotes: d.diagnosisNotes || d.diagnosis || d.diseases || '',
        doctorNotes: d.doctorNotes || d.notes || d.advice || d.instructions || '',
        medicines: [...meds],
        prescriptionImages: [...imgs],
        raw: d
      });
    } else {
      const existing = visitMap.get(targetKey)!;

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
      existing.totalAmount = Math.max(existing.totalAmount, pm.totalAmount);
      existing.consultationFee = Math.max(existing.consultationFee, Number(d.consultationFee) || 0);
      existing.medicineFee = Math.max(existing.medicineFee, Number(d.medicineFee || d.totalMedicineFee) || 0);
      existing.discount = Math.max(existing.discount, Number(d.discount || d.discountAmount) || 0);

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
  visits.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  return visits;
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
          <Text style={styles.detailText}>{patient.appointmentDate}</Text>
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
          <View style={styles.viewHistoryPill}>
            <Text style={styles.viewHistoryPillText}>History & Rx</Text>
            <Feather name="chevron-right" size={13} color="#0284c7" />
          </View>
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

export const AllPatientsScreen: React.FC<AllPatientsScreenProps> = ({ onNavigate, currentBranch }) => {
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
          queriesToRun.push(
            getDocs(query(collection(activeDb, 'patients'), where('phone', '==', tenDigit), limit(20))).catch(() => ({ docs: [] })),
            getDocs(query(collection(activeDb, 'allpatients'), where('phone', '==', tenDigit), limit(20))).catch(() => ({ docs: [] })),
            getDocs(query(collection(activeDb, 'appointments'), where('phone', '==', tenDigit), limit(20))).catch(() => ({ docs: [] }))
          );
        } else {
          queriesToRun.push(
            getDocs(query(collection(activeDb, 'patients'), where('registrationId', '==', trimmed), limit(20))).catch(() => ({ docs: [] })),
            getDocs(query(collection(activeDb, 'allpatients'), where('registrationId', '==', trimmed), limit(20))).catch(() => ({ docs: [] })),
            getDocs(query(collection(activeDb, 'patients'), where('regNo', '==', trimmed), limit(20))).catch(() => ({ docs: [] }))
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
                newRecords.push({
                  id: docSnap.id,
                  name: d.patientName || d.name || d.fullName || 'Patient',
                  phone: cleanP || String(d.phoneNumber || d.phone || ''),
                  age: d.age || d.patientAge,
                  gender: d.gender || 'Male',
                  branchName: bName,
                  appointmentDate: normalizeDateToISO(d.appointmentDate || d.date || d.bookingDate || d.createdAt),
                  appointmentTime: d.appointmentTime || d.time || '10:00 AM',
                  doctorName: sanitizeDoctorName(d.doctorName || d.doctor, bName),
                  status: 'active',
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

  // --- Load Full Patient History Across All Visits & Collections ---
  const handleOpenPatientHistory = useCallback(async (patient: Patient) => {
    setSelectedPatientForHistory(patient);
    setHistoryFilterTab('all');
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

    // Consolidated visits from in-memory pool (Zero network delay)
    const initialVisits = consolidateVisitsForPatient(collectedDocs, patient);
    setHistoryVisits(initialVisits);

    // 2. Concurrently query Firestore for any other historical records across collections
    try {
      const activeDb = getSafeDb();
      if (activeDb) {
        const queryPromises: any[] = [];
        if (cleanPhone && cleanPhone.length === 10) {
          queryPromises.push(
            getDocs(query(collection(activeDb, 'appointments'), where('phone', '==', cleanPhone), limit(30))).catch(() => ({ docs: [] })),
            getDocs(query(collection(activeDb, 'appointments'), where('phoneNumber', '==', cleanPhone), limit(30))).catch(() => ({ docs: [] })),
            getDocs(query(collection(activeDb, 'prescriptions'), where('phone', '==', cleanPhone), limit(30))).catch(() => ({ docs: [] })),
            getDocs(query(collection(activeDb, 'prescriptions'), where('patientPhone', '==', cleanPhone), limit(30))).catch(() => ({ docs: [] })),
            getDocs(query(collection(activeDb, 'product_bills'), where('phone', '==', cleanPhone), limit(20))).catch(() => ({ docs: [] }))
          );
        }
        if (cleanReg && cleanReg.length > 3) {
          queryPromises.push(
            getDocs(query(collection(activeDb, 'appointments'), where('registrationId', '==', patient.regId), limit(20))).catch(() => ({ docs: [] })),
            getDocs(query(collection(activeDb, 'prescriptions'), where('registrationId', '==', patient.regId), limit(20))).catch(() => ({ docs: [] }))
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

        const mergedVisits = consolidateVisitsForPatient(collectedDocs, patient);
        setHistoryVisits(mergedVisits);
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
    historyVisits.forEach(v => {
      if (v.amountPaid > 0) {
        sum += v.amountPaid;
      }
    });
    return sum;
  }, [historyVisits]);

  // Tab filtering within history modal
  const filteredHistoryVisits = useMemo(() => {
    if (historyFilterTab === 'prescriptions') {
      return historyVisits.filter(v => v.medicines.length > 0 || v.prescriptionImages.length > 0 || v.diagnosisNotes || v.doctorNotes);
    }
    if (historyFilterTab === 'billing') {
      return historyVisits.filter(v => v.amountPaid > 0 || v.paymentMode);
    }
    return historyVisits;
  }, [historyVisits, historyFilterTab]);

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
        visible={!!selectedPatientForHistory}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setSelectedPatientForHistory(null)}
      >
        {selectedPatientForHistory && (
          <SafeAreaView style={styles.historyModalSafeArea}>
            <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
            {/* Top Navigation Header */}
            <View style={styles.historyModalHeader}>
              <TouchableOpacity
                style={styles.historyBackBtn}
                onPress={() => setSelectedPatientForHistory(null)}
                activeOpacity={0.7}
              >
                <Feather name="arrow-left" size={22} color="#0f172a" />
              </TouchableOpacity>

              <View style={{ flex: 1, marginHorizontal: 10 }}>
                <Text style={styles.historyHeaderTitle} numberOfLines={1}>
                  {selectedPatientForHistory.name}
                </Text>
                <Text style={styles.historyHeaderSubtitle}>
                  ID: {selectedPatientForHistory.regId || selectedPatientForHistory.id} • {selectedPatientForHistory.phone}
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
                      onPress={() => handleWhatsApp(selectedPatientForHistory.phone, selectedPatientForHistory.name)}
                    >
                      <MaterialCommunityIcons name="whatsapp" size={17} color="#16a34a" />
                    </TouchableOpacity>
                  </>
                ) : null}
                <TouchableOpacity
                  style={styles.historyCloseBtn}
                  onPress={() => setSelectedPatientForHistory(null)}
                >
                  <Feather name="x" size={20} color="#64748b" />
                </TouchableOpacity>
              </View>
            </View>

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
                        {historyVisits.length} {historyVisits.length === 1 ? 'Visit' : 'Visits'}
                      </Text>
                    </View>
                    <Text style={styles.executiveBranchText}>
                      {selectedPatientForHistory.branchName}
                    </Text>
                  </View>
                </View>

                {/* Edit Latest Prescription / Open Medical Consultation (Amount Locked) */}
                <TouchableOpacity
                  style={styles.openClinicalFileActionBtn}
                  onPress={() => {
                    const pat = selectedPatientForHistory;
                    const latestVisit = historyVisits && historyVisits.length > 0 ? historyVisits[0] : undefined;
                    setSelectedPatientForHistory(null);
                    handleOpenPatientFile(pat, latestVisit);
                  }}
                  activeOpacity={0.85}
                >
                  <MaterialCommunityIcons name="file-document-edit-outline" size={19} color="#ffffff" />
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={styles.openClinicalFileActionText}>
                      Edit Latest Prescription Only
                    </Text>
                    <Text style={styles.openClinicalFileActionSub}>
                      {historyVisits[0] ? `Latest Visit: ${historyVisits[0].date} • Amount Locked` : 'Update prescription notes & remedies'}
                    </Text>
                  </View>
                  <Feather name="arrow-right" size={16} color="#ffffff" />
                </TouchableOpacity>
              </View>

              {/* Segmented Filter Bar: All | Prescriptions | Billing */}
              <View style={styles.historySegmentedBar}>
                {[
                  { key: 'all', label: `All History (${historyVisits.length})` },
                  { key: 'prescriptions', label: 'Prescriptions' },
                  { key: 'billing', label: 'Payments & Billing' },
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

              {/* Loading Indicator */}
              {isLoadingHistory ? (
                <View style={{ paddingVertical: 30, alignItems: 'center' }}>
                  <ActivityIndicator size="large" color="#0284c7" />
                  <Text style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>
                    Loading patient appointments & prescriptions...
                  </Text>
                </View>
              ) : null}

              {/* List of Visits */}
              {!isLoadingHistory && filteredHistoryVisits.length === 0 ? (
                <View style={styles.emptyHistoryCard}>
                  <MaterialCommunityIcons name="history" size={36} color="#94a3b8" />
                  <Text style={styles.emptyHistoryTitle}>No records in this category</Text>
                  <Text style={styles.emptyHistorySub}>
                    Try switching back to "All History" to see appointments.
                  </Text>
                </View>
              ) : (
                filteredHistoryVisits.map((visit, vIdx) => {
                  const isPaid = visit.amountPaid > 0 || visit.paymentStatus === 'paid' || visit.status === 'completed';
                  const isUpi = (visit.paymentMode || '').toLowerCase().includes('upi');
                  const isCash = (visit.paymentMode || '').toLowerCase().includes('cash');
                  const isCard = (visit.paymentMode || '').toLowerCase().includes('card');
                  const isSplit = (visit.paymentMode || '').toLowerCase().includes('split');

                  return (
                    <View key={visit.id || vIdx} style={styles.visitCard}>
                      {/* Visit Header */}
                      <View style={styles.visitCardHeader}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <View style={styles.visitIndexBadge}>
                            <Text style={styles.visitIndexText}>VISIT #{historyVisits.length - vIdx}</Text>
                          </View>
                          <Text style={styles.visitDateText}>{visit.date}</Text>
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

                      {/* 1. Paid Amount & Payment Method Section */}
                      <View style={styles.visitPaymentBox}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <View>
                            <Text style={styles.paymentBoxLabel}>AMOUNT PAID</Text>
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
                              Split: {visit.splitDetails}
                            </Text>
                          </View>
                        ) : null}

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
                          </View>
                        ) : null}

                        {/* Payment ID / Ref */}
                        {visit.paymentId ? (
                          <Text style={styles.paymentRefText}>Ref ID: {visit.paymentId}</Text>
                        ) : null}
                      </View>

                      {/* 2. Updated Prescriptions & Remedies Section */}
                      <View style={styles.visitPrescriptionBox}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                            <MaterialCommunityIcons name="pill" size={16} color="#0284c7" />
                            <Text style={styles.prescriptionBoxTitle} numberOfLines={1}>Updated Prescriptions & Remedies</Text>
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
                              Attached Prescriptions & Drawings (Tap to view full screen):
                            </Text>
                            <ScrollView
                              horizontal
                              showsHorizontalScrollIndicator={false}
                              contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
                            >
                              {visit.prescriptionImages.map((imgUrl, iIdx) => (
                                <TouchableOpacity
                                  key={iIdx}
                                  style={styles.prescriptionThumbnailWrapper}
                                  onPress={() => setImagePreviewUrl(imgUrl)}
                                  activeOpacity={0.8}
                                >
                                  <Image
                                    source={{ uri: imgUrl }}
                                    style={styles.prescriptionThumbnail}
                                    resizeMode="cover"
                                  />
                                  <View style={styles.thumbnailZoomHint}>
                                    <Feather name="zoom-in" size={13} color="#ffffff" />
                                  </View>
                                </TouchableOpacity>
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
                    </View>
                  );
                })
              )}
            </ScrollView>
          </SafeAreaView>
        )}
      </Modal>

      {/* Full-Screen Image Lightbox Modal */}
      <Modal
        visible={!!imagePreviewUrl}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setImagePreviewUrl(null)}
      >
        <View style={styles.imageLightboxOverlay}>
          <TouchableOpacity
            style={styles.imageLightboxCloseBtn}
            onPress={() => setImagePreviewUrl(null)}
          >
            <Feather name="x" size={24} color="#ffffff" />
          </TouchableOpacity>
          {imagePreviewUrl ? (
            <Image
              source={{ uri: imagePreviewUrl }}
              style={styles.imageLightboxImage}
              resizeMode="contain"
            />
          ) : null}
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
  imageLightboxOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.94)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageLightboxCloseBtn: {
    position: 'absolute',
    top: 40,
    right: 20,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageLightboxImage: {
    width: Dimensions.get('window').width - 24,
    height: Dimensions.get('window').height - 120,
  },
});
