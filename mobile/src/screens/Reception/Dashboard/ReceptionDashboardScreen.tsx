import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Modal, Linking, Alert, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { getSafeDb, collection, onSnapshot, doc, updateDoc, deleteDoc, getDocs, getDoc, setDoc } from '../../../utils/firebaseSafe';
import { sendCancellationWhatsAppNotification, sanitizeDoctorName, resolveCanonicalBranchId, BRANCHES } from '@app/shared';
import { PatientAppointmentRecord } from '../../../components/AppointmentsQueueUI';
import { getBranchShortcut } from '../../../utils/idGenerator';
import { DEFAULT_DOCTORS_SEED } from '../BookAppointment/BookAppointmentScreen';
import { TargetProgressUI } from '../../../components/TargetProgressUI';
import { AppointmentPaymentModal } from '../../../components/AppointmentPaymentModal';
import { getPatientVisitState, isAppAppointment } from '../../../utils/patientVisitState';
import { receptionDataStore } from '../../../utils/receptionDataStore';
import { calculateRealBranchRevenue, syncBranchTargetToFirestore } from '../../../utils/branchRevenueCalculator';

export const DASHBOARD_BRANCH_OPTIONS = [
  'All Branches',
  'KPHB Branch',
  'Nallagandla Branch',
  'Dilshuknagar Branch',
  'Chandanagar Branch',
];

export const normalizeToDashboardBranch = (branch?: string): string => {
  if (!branch) return 'KPHB Branch';
  const norm = String(branch).toLowerCase();
  if (norm.includes('admin') || norm.includes('hr') || norm === 'all' || norm.includes('all branches')) return 'All Branches';
  const canonical = resolveCanonicalBranchId(branch);
  if (canonical && BRANCHES[canonical]) {
    return BRANCHES[canonical].fullName;
  }
  return 'KPHB Branch';
};

interface ReceptionDashboardScreenProps {
  currentBranch?: string;
  onNavigate?: (tab: string, patient?: any) => void;
  initialPatientForCheckout?: any;
  onClearInitialCheckout?: () => void;
}

const DEFAULT_BRANCH_TARGETS: Record<string, { monthlyTarget: number; targetReached: number }> = {
  kphb: { monthlyTarget: 725000, targetReached: 0 },
  nallagandla: { monthlyTarget: 325000, targetReached: 0 },
  dilshuknagar: { monthlyTarget: 225000, targetReached: 0 },
  chandanagar: { monthlyTarget: 550000, targetReached: 0 },
};

const getBranchDefaultTarget = (bName: string) => {
  const norm = String(bName || '').toLowerCase();
  if (norm.includes('nalla') || norm.includes('nallagandla')) return DEFAULT_BRANCH_TARGETS.nallagandla;
  if (norm.includes('dilshuk') || norm.includes('dilsukh') || norm.includes('dsnr') || norm.includes('dshnr')) return DEFAULT_BRANCH_TARGETS.dilshuknagar;
  if (norm.includes('chanda') || norm.includes('chnr') || norm.includes('chandanagar')) return DEFAULT_BRANCH_TARGETS.chandanagar;
  return DEFAULT_BRANCH_TARGETS.kphb;
};

const getTodayDateStr = () => {
  const today = new Date();
  const d = String(today.getDate()).padStart(2, '0');
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const y = today.getFullYear();
  return `${d}-${m}-${y}`;
};

const getTomorrowDateStr = () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const d = String(tomorrow.getDate()).padStart(2, '0');
  const m = String(tomorrow.getMonth() + 1).padStart(2, '0');
  const y = tomorrow.getFullYear();
  return `${d}-${m}-${y}`;
};

const getDayNameFromDateStr = (dateStr: string): string => {
  if (!dateStr) return 'Mon';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
      const d = new Date(year, month, day);
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      return days[d.getDay()];
    }
  }
  return 'Mon';
};

const parseTimeToMinutes = (hourStr: string, minStr: string, ampm: string): number => {
  let h = parseInt(hourStr, 10) || 10;
  const m = parseInt(minStr, 10) || 0;
  if (ampm === 'PM' && h < 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return h * 60 + m;
};

const formatMinutesToTimeStr = (totalMins: number): string => {
  let h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  const hhStr = h.toString().padStart(2, '0');
  const mmStr = m.toString().padStart(2, '0');
  return `${hhStr}:${mmStr} ${ampm}`;
};

const generate15MinSlotsFromRanges = (slotRanges: any[]): string[] => {
  const result: string[] = [];
  if (!Array.isArray(slotRanges)) return result;
  slotRanges.forEach((range) => {
    const startMins = parseTimeToMinutes(range.startHour, range.startMinute, range.startAmPm);
    const endMins = parseTimeToMinutes(range.endHour, range.endMinute, range.endAmPm);

    for (let mins = startMins; mins < endMins; mins += 15) {
      const timeStr = formatMinutesToTimeStr(mins);
      if (!result.includes(timeStr)) {
        result.push(timeStr);
      }
    }
  });
  return result;
};

const isMatchingDate = (app: any, targetDate: string): boolean => {
  const rawDate = app.appointmentDate || app.date || app.bookingDate || app.dateString || app.slotDate;
  if (!rawDate) return false;
  const clean = String(rawDate).trim();
  if (!clean) return false;

  if (clean === targetDate || clean.startsWith(targetDate)) return true;

  // targetDate is DD-MM-YYYY (e.g. 23-09-2026)
  // Fast ISO direct match e.g. 2026-09-23 or 2026-09-23T...
  if (clean.length >= 10 && clean[4] === '-' && clean[7] === '-') {
    const y = clean.substring(0, 4);
    const m = clean.substring(5, 7);
    const d = clean.substring(8, 10);
    if (`${d}-${m}-${y}` === targetDate) return true;
  }

  // Fast DD-MM-YYYY direct match e.g. 23-09-2026 10:00 AM
  if (clean.length >= 10 && clean[2] === '-' && clean[5] === '-') {
    if (clean.substring(0, 10) === targetDate) return true;
  }

  // Handle DD/MM/YYYY or DD-MM-YYYY with slashes and optional timestamp
  const parts = clean.split(/[-/]/);
  if (parts.length >= 3) {
    let d = parts[0].trim();
    let m = parts[1].trim();
    let y = parts[2].trim().substring(0, 4);
    if (d.length === 4) {
      y = d;
      m = parts[1].trim();
      d = parts[2].trim().substring(0, 2);
    }
    const ddmmyyyy = `${d.padStart(2, '0')}-${m.padStart(2, '0')}-${y}`;
    if (ddmmyyyy === targetDate) return true;
  }

  try {
    const parsed = new Date(clean);
    if (!isNaN(parsed.getTime())) {
      const py = parsed.getFullYear();
      const pm = String(parsed.getMonth() + 1).padStart(2, '0');
      const pd = String(parsed.getDate()).padStart(2, '0');
      if (`${pd}-${pm}-${py}` === targetDate) return true;
    }
  } catch (_) { }

  return false;
};

const normalizeBranchName = (b: string): string => {
  return String(b || '').toLowerCase().replace(/\s*branch\s*/i, '').trim();
};

const getBranchCode = (str: string): string => {
  const s = String(str || '').toLowerCase();
  if (s.includes('kphb') || s.includes('kukatpally') || s.includes('kpb')) return 'kphb';
  if (s.includes('nalla') || s.includes('nallagandla') || s.includes('nlg')) return 'nalla';
  if (s.includes('chanda') || s.includes('chnr') || s.includes('chandanagar') || s.includes('chan')) return 'chanda';
  if (s.includes('dilshuk') || s.includes('dilsukh') || s.includes('dsnr') || s.includes('dshnr')) return 'dsnr';
  return s;
};

const isBranchMatching = (b1: string, b2: string): boolean => {
  if (!b1 || !b2) return false;
  const canonical1 = resolveCanonicalBranchId(b1);
  const canonical2 = resolveCanonicalBranchId(b2);
  if (canonical1 && canonical2) {
    return canonical1 === canonical2;
  }
  const code1 = getBranchCode(b1);
  const code2 = getBranchCode(b2);
  if (code1 && code2 && (code1 === 'kphb' || code1 === 'nalla' || code1 === 'chanda' || code1 === 'dsnr')) {
    return code1 === code2;
  }
  const n1 = normalizeBranchName(b1);
  const n2 = normalizeBranchName(b2);
  if (!n1 || !n2 || n1 === 'clinic' || n2 === 'clinic' || n1 === 'branch' || n2 === 'branch') return false;
  return n1 === n2;
};

const isMatchingBranch = (app: any, activeBranch?: string): boolean => {
  if (!activeBranch || activeBranch === 'All Branches' || activeBranch === 'all' || activeBranch.toLowerCase().trim() === 'all branches') {
    return true;
  }
  const canonicalActive = resolveCanonicalBranchId(activeBranch);
  if (!canonicalActive) return true;

  const rawApp = app.branch || app.branchName || app.targetBranch || app.branchId || app.assignedBranch;
  const canonicalApp = resolveCanonicalBranchId(rawApp) || resolveCanonicalBranchId(app.registrationId || app.regId);

  if (canonicalApp) {
    return canonicalApp === canonicalActive;
  }
  return isBranchMatching(String(rawApp || ''), String(activeBranch));
};

const getCleanRegId = (app: any, index: number) => {
  const raw = app.registrationId || app.registration_id || app.regId || app.regID || app.patientId || app.patient_id || app.uhid || app.UHID;
  if (raw && typeof raw === 'string' && raw.trim().length > 0) {
    const clean = raw.trim();
    if (clean.length <= 18 && !/^[a-zA-Z0-9]{19,32}$/.test(clean)) {
      return clean.toUpperCase();
    }
  }
  const shortcut = getBranchShortcut(app.branch || app.branchName);
  const countStr = String(index + 1).padStart(4, '0');
  return `SPH-${shortcut}-${countStr}`;
};

const mapRecord = (
  app: any,
  index: number,
  selectedDate: string,
  allRecords: any[] = [],
  packageMembers: any[] = [],
  fallbackBranch: string = 'KPHB Branch'
): PatientAppointmentRecord => {
  let status: 'upcoming' | 'active' | 'collect_fee' | 'completed' = 'upcoming';
  const s = String(app.status || '').toLowerCase().trim();
  const p = String(app.paymentStatus || '').toLowerCase().trim();

  // If fee collection is needed, it MUST be collect_fee until checkout actually completes
  if ((s === 'collect_fee' || app.feeCollectionNeeded === true) && s !== 'completed') {
    status = 'collect_fee';
  } else if (s === 'completed' || s === 'done' || s === 'concluded') {
    status = 'completed';
  } else if (s === 'active' || s === 'in_consultation' || s === 'in-clinic' || s === 'in-consultation') {
    status = 'active';
  } else {
    status = 'upcoming';
  }

  const vState = getPatientVisitState(app, allRecords, packageMembers);

  const rawBranch = app.branch || app.branchName || app.targetBranch || app.branchId || app.registrationId || app.regId;
  const canonicalBranch = resolveCanonicalBranchId(rawBranch);
  const cleanBranch = (canonicalBranch && BRANCHES[canonicalBranch]?.fullName) || (fallbackBranch && fallbackBranch !== 'All Branches' ? fallbackBranch : 'KPHB Branch');

  return {
    ...app,
    id: app.id || String(index),
    name: app.patientName || app.name || 'Patient',
    phone: app.phoneNumber || app.phone || app.mobile || '',
    regId: getCleanRegId(app, index),
    doctor: sanitizeDoctorName(app.doctorName || app.doctor, cleanBranch),
    time: app.appointmentTime || app.time || '10:00 AM',
    date: app.appointmentDate || selectedDate,
    status: status,
    rawStatus: app.status,
    paymentStatus: app.paymentStatus,
    branch: cleanBranch,
    mode: app.consultationMode || 'In-Clinic',
    isPackageMember: Boolean(app.isPackageMember || app.hasActivePackage || app.hasPackage),
    visitState: vState,
  };
};
interface PatientCardItemProps {
  patient: any;
  index: number;
  totalCount: number;
  onUpdateStatus: (docId: string, newStatus: 'active' | 'completed' | 'upcoming') => void;
  onNavigate?: (tab: string, patient?: any) => void;
  onShiftQueueOrder: (patient: any, direction: 'up' | 'down') => void;
  onCall: (phone: string) => void;
  onWhatsApp: (phone: string, name: string) => void;
  onReschedule: (patient: any) => void;
  onDelete: (id: string, name: string) => void;
  onOpenCheckout?: (patient: any) => void;
}
const PatientCardItem: React.FC<PatientCardItemProps> = React.memo(({
  patient,
  index,
  totalCount,
  onUpdateStatus,
  onNavigate,
  onShiftQueueOrder,
  onCall,
  onWhatsApp,
  onReschedule,
  onDelete,
  onOpenCheckout,
}) => {
  const vState = patient.visitState;
  return (
    <View style={styles.patientCard}>
      <View style={styles.cardHeader}>
        <View style={styles.patientAvatarCircle}>
          <Text style={styles.avatarText}>
            {(patient.name || 'P').substring(0, 2).toUpperCase()}
          </Text>
        </View>
        <View style={styles.patientMainInfo}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Text style={styles.patientName}>{patient.name}</Text>
            {vState && (
              <View style={{ backgroundColor: vState.badgeBg, borderWidth: 1, borderColor: vState.badgeBorder, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
                <Text style={{ fontSize: 9.5, fontWeight: '900', color: vState.badgeColor }}>{vState.badgeText}</Text>
              </View>
            )}
            {(vState?.isApp || isAppAppointment(patient)) ? (
              <View style={{ backgroundColor: '#f3e8ff', borderWidth: 1, borderColor: '#d8b4fe', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
                <Text style={{ fontSize: 9.5, fontWeight: '900', color: '#7e22ce' }}>APP</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.patientMeta}>
            {patient.status === 'upcoming' ? (
              patient.phone
            ) : (
              <>Reg: <Text style={{ color: '#258ec8', fontWeight: '700' }}>{patient.regId || 'N/A'}</Text> • {patient.phone}</>
            )}
          </Text>
        </View>
        {patient.status === 'upcoming' ? (
          <TouchableOpacity
            style={[styles.statusBadge, { backgroundColor: '#258ec8', borderColor: '#1d709e' }]}
            onPress={() => {
              onUpdateStatus(patient.id, 'active');
              if (onNavigate) onNavigate('reception_patient_file', patient);
            }}
          >
            <Text style={[styles.statusBadgeText, { color: '#ffffff', fontWeight: '800' }]}>
              START CONSULTATION
            </Text>
          </TouchableOpacity>
        ) : patient.status === 'collect_fee' ? (
          <TouchableOpacity
            style={[styles.statusBadge, { backgroundColor: '#16a34a', borderColor: '#15803d' }]}
            onPress={() => onOpenCheckout && onOpenCheckout(patient)}
          >
            <Text style={[styles.statusBadgeText, { color: '#ffffff', fontWeight: '900' }]}>
              💳 COLLECT FEE
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[
              styles.statusBadge,
              patient.status === 'active' && { backgroundColor: '#e0f2fe', borderColor: '#bae6fd' },
              patient.status === 'completed' && { backgroundColor: '#dcfce7', borderColor: '#bbf7d0' },
            ]}
            onPress={() => onNavigate && onNavigate('reception_patient_file', patient)}
          >
            <Text style={[
              styles.statusBadgeText,
              patient.status === 'active' && { color: '#0284c7' },
              patient.status === 'completed' && { color: '#166534' },
            ]}>
              {patient.status === 'active' && '⚡ IN CONSULTATION'}
              {patient.status === 'completed' && 'COMPLETED ✓ (Paid)'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.detailsRow}>
        <View style={styles.detailItem}>
          <MaterialCommunityIcons name="stethoscope" size={14} color="#64748b" />
          <Text style={styles.detailText}>{patient.doctor}</Text>
        </View>
        <View style={styles.detailItem}>
          <Feather name="clock" size={14} color="#64748b" />
          <Text style={styles.detailText}>{patient.time}</Text>
        </View>
        <View style={styles.detailItem}>
          <Feather name="map-pin" size={14} color="#64748b" />
          <Text style={styles.detailText}>{patient.branch}</Text>
        </View>
      </View>

      <View style={styles.actionRow}>

        {patient.status === 'collect_fee' && (
          <TouchableOpacity
            style={{
              backgroundColor: '#16a34a',
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 6,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
            }}
            onPress={() => onOpenCheckout && onOpenCheckout(patient)}
          >
            <MaterialCommunityIcons name="cash-register" size={16} color="#ffffff" />
            <Text style={{ color: '#ffffff', fontSize: 11, fontWeight: '800' }}>
              Collect Fee & Billing
            </Text>
          </TouchableOpacity>
        )}

        {patient.status === 'upcoming' && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            <TouchableOpacity
              disabled={index === 0}
              style={[styles.arrowIconBtn, index === 0 && { opacity: 0.3 }]}
              onPress={() => onShiftQueueOrder(patient, 'up')}
            >
              <Feather name="arrow-up" size={16} color={index === 0 ? '#94a3b8' : '#ffffff'} />
            </TouchableOpacity>
            <TouchableOpacity
              disabled={index === totalCount - 1}
              style={[styles.arrowIconBtn, index === totalCount - 1 && { opacity: 0.3 }]}
              onPress={() => onShiftQueueOrder(patient, 'down')}
            >
              <Feather name="arrow-down" size={16} color={index === totalCount - 1 ? '#94a3b8' : '#ffffff'} />
            </TouchableOpacity>
          </View>
        )}

        {patient.status === 'completed' && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{
              backgroundColor: '#d1fae5',
              paddingHorizontal: 8,
              paddingVertical: 5,
              borderRadius: 8,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4
            }}>
              <Ionicons name="checkmark-circle" size={14} color="#047857" />
              <Text style={{ color: '#047857', fontSize: 11, fontWeight: '800' }}>PAID ✓</Text>
            </View>

            <TouchableOpacity
              style={{
                backgroundColor: '#e0f2fe',
                borderColor: '#bae6fd',
                borderWidth: 1,
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 5,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4
              }}
              onPress={() => onOpenCheckout && onOpenCheckout(patient)}
            >
              <MaterialCommunityIcons name="file-document-outline" size={14} color="#0284c7" />
              <Text style={{ color: '#0284c7', fontSize: 11, fontWeight: '800' }}>Invoice 🧾</Text>
            </TouchableOpacity>
          </View>
        )}

        {patient.status !== 'completed' && (
          <>
            <TouchableOpacity style={styles.callIconBtn} onPress={() => onCall(patient.phone)}>
              <Feather name="phone" size={18} color="#258ec8" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.waIconBtn} onPress={() => onWhatsApp(patient.phone, patient.name)}>
              <MaterialCommunityIcons name="whatsapp" size={19} color="#22c55e" />
            </TouchableOpacity>
          </>
        )}
        {patient.status === 'upcoming' && (
          <TouchableOpacity
            style={styles.rescheduleIconBtn}
            onPress={() => onReschedule(patient)}
          >
            <Feather name="calendar" size={18} color="#258ec8" />
          </TouchableOpacity>
        )}
        {patient.status !== 'completed' && (
          <TouchableOpacity style={styles.deleteIconBtn} onPress={() => onDelete(patient.id, patient.name)}>
            <Feather name="trash-2" size={18} color="#ef4444" />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}, (prevProps, nextProps) => {
  if (prevProps.index !== nextProps.index) return false;
  if (prevProps.totalCount !== nextProps.totalCount) return false;

  const p = prevProps.patient;
  const n = nextProps.patient;
  if (!p || !n) return p === n;

  return (
    p.id === n.id &&
    p.status === n.status &&
    p.paymentStatus === n.paymentStatus &&
    p.feeCollectionNeeded === n.feeCollectionNeeded &&
    p.name === n.name &&
    p.phone === n.phone &&
    p.time === n.time &&
    p.date === n.date &&
    p.regId === n.regId &&
    p.doctor === n.doctor &&
    p.branch === n.branch &&
    p.queueOrder === n.queueOrder &&
    p.visitState?.badgeText === n.visitState?.badgeText &&
    p.visitState?.isApp === n.visitState?.isApp
  );
});

export const ReceptionDashboardScreen: React.FC<ReceptionDashboardScreenProps> = ({
  currentBranch,
  onNavigate,
  initialPatientForCheckout,
  onClearInitialCheckout
}) => {
  const [selectedDate, setSelectedDate] = useState<string>(getTodayDateStr());
  const [liveAppointments, setLiveAppointments] = useState<any[]>(() => receptionDataStore.getAppointments());
  const [allCollectionsPool, setAllCollectionsPool] = useState<any[]>(() => receptionDataStore.getAllCollectionsPool());
  const [packageMembersList, setPackageMembersList] = useState<any[]>(() => receptionDataStore.getPackageMembers());
  const liveAppointmentsRef = useRef<any[]>([]);
  useEffect(() => {
    liveAppointmentsRef.current = liveAppointments;
  }, [liveAppointments]);

  // Connect to persistent receptionDataStore singleton (keeps cache static and alive across screen navigation)
  useEffect(() => {
    receptionDataStore.startListeners();
    const unsub = receptionDataStore.subscribe((state) => {
      setLiveAppointments(state.appointments);
      setAllCollectionsPool(state.allCollectionsPool);
      setPackageMembersList(state.packageMembersList);
    });
    return () => unsub();
  }, []);
  const [datePickerModalOpen, setDatePickerModalOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date());
  const [selectedTab, setSelectedTab] = useState<'all' | 'upcoming' | 'active' | 'completed'>('all');
  const [followupModalOpen, setFollowupModalOpen] = useState<'payment_pending' | 'opted' | 'not_opted' | null>(null);
  const [followupSearchTerm, setFollowupSearchTerm] = useState('');

  // Delete Confirmation Modal & 24h Restore States
  const [deleteConfirmApp, setDeleteConfirmApp] = useState<any | null>(null);
  const [isDeletingApp, setIsDeletingApp] = useState<boolean>(false);
  const [restoreModalOpen, setRestoreModalOpen] = useState<boolean>(false);
  const [isRestoringId, setIsRestoringId] = useState<string | null>(null);

  // Payment Checkout Modal State
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [selectedPatientForPayment, setSelectedPatientForPayment] = useState<any>(null);

  const handleOpenCheckout = useCallback((patient: any) => {
    setSelectedPatientForPayment(patient);
    setPaymentModalOpen(true);
  }, []);

  useEffect(() => {
    if (initialPatientForCheckout) {
      handleOpenCheckout(initialPatientForCheckout);
      if (onClearInitialCheckout) {
        onClearInitialCheckout();
      }
    }
  }, [initialPatientForCheckout, handleOpenCheckout, onClearInitialCheckout]);

  // Reschedule Modal States
  const [rescheduleModalOpen, setRescheduleModalOpen] = useState(false);
  const [selectedRescheduleAppt, setSelectedRescheduleAppt] = useState<PatientAppointmentRecord | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState(getTodayDateStr());
  const [rescheduleTime, setRescheduleTime] = useState('11:00 AM');
  const [rescheduleDoctor, setRescheduleDoctor] = useState('Dr. Prashanth K Vaidya');
  const [rescheduleCalOpen, setRescheduleCalOpen] = useState(false);
  const [rescheduleCalMonth, setRescheduleCalMonth] = useState<Date>(new Date());
  const [doctorDropdownOpen, setDoctorDropdownOpen] = useState(false);
  const [liveDoctorsData, setLiveDoctorsData] = useState<any[]>(DEFAULT_DOCTORS_SEED);

  const [selectedDashboardBranch, setSelectedDashboardBranch] = useState<string>(() => normalizeToDashboardBranch(currentBranch));

  useEffect(() => {
    if (currentBranch) {
      setSelectedDashboardBranch(normalizeToDashboardBranch(currentBranch));
    }
  }, [currentBranch]);

  const activeBranchName = selectedDashboardBranch === 'All Branches' ? 'KPHB Branch' : selectedDashboardBranch;
  const initialTarget = getBranchDefaultTarget(activeBranchName);

  const [branchTarget, setBranchTarget] = useState({
    monthlyTarget: initialTarget.monthlyTarget,
    targetReached: initialTarget.targetReached,
    branchName: activeBranchName
  });

  useEffect(() => {
    const effBranch = selectedDashboardBranch === 'All Branches' ? 'KPHB Branch' : selectedDashboardBranch;
    const def = getBranchDefaultTarget(effBranch);
    setBranchTarget({
      monthlyTarget: def.monthlyTarget,
      targetReached: def.targetReached,
      branchName: effBranch
    });
  }, [selectedDashboardBranch]);

  // Subscribe to real-time Firestore branch targets collection
  useEffect(() => {
    const activeDb = getSafeDb();
    if (!activeDb) return;

    // Ensure base target configuration exists in Firestore branchTargets without overwriting revenue
    const branchesToSync = [
      { id: 'kphb', name: 'KPHB Branch', monthlyTarget: 725000 },
      { id: 'chandanagar', name: 'Chandanagar Branch', monthlyTarget: 550000 },
      { id: 'nallagandla', name: 'Nallagandla Branch', monthlyTarget: 325000 },
      { id: 'dilshuknagar', name: 'Dilshuknagar Branch', monthlyTarget: 225000 }
    ];
    branchesToSync.forEach(async (b) => {
      try {
        const docRef = doc(activeDb, 'branchTargets', b.id);
        const snap = await getDoc(docRef);
        if (!snap.exists()) {
          await setDoc(docRef, {
            id: b.id,
            branchId: b.id,
            branchName: b.name,
            monthlyTarget: b.monthlyTarget,
            targetReached: 0,
            remaining: b.monthlyTarget,
            percentage: 0,
            updatedAt: new Date().toISOString()
          }, { merge: true });
        }
      } catch (err) {
        console.warn(`Authoritative branch target sync notice for ${b.id}:`, err);
      }
    });

    try {
      const colRef = collection(activeDb, 'branchTargets');
      const unsubscribe = onSnapshot(colRef, (snapshot) => {
        const curBranch = selectedDashboardBranch === 'All Branches' ? (currentBranch || 'KPHB Branch') : selectedDashboardBranch;
        const defTarget = getBranchDefaultTarget(curBranch);

        if (!snapshot.empty) {
          const liveMap: Record<string, any> = {};
          snapshot.forEach((docSnap) => {
            liveMap[docSnap.id.toLowerCase()] = docSnap.data();
            if (docSnap.data().branchName) {
              liveMap[docSnap.data().branchName.toLowerCase()] = docSnap.data();
            }
          });

          const activeBranchKey = curBranch.toLowerCase().replace(/\s*branch$/i, '').trim();

          const getShortcut = (str: string) => {
            if (str.includes('kphb') || str.includes('kukatpally')) return 'kphb';
            if (str.includes('nalla') || str.includes('nallagandla')) return 'nallagandla';
            if (str.includes('chanda') || str.includes('chnr') || str.includes('chandanagar')) return 'chandanagar';
            if (str.includes('dilshuk') || str.includes('dilsukh') || str.includes('dsnr') || str.includes('dshnr')) return 'dilshuknagar';
            return str;
          };

          const keyShortcut = getShortcut(activeBranchKey);

          let targetData = liveMap[activeBranchKey] || liveMap[`${activeBranchKey} branch`] || liveMap[keyShortcut] || liveMap[`${keyShortcut} branch`];

          if (!targetData) {
            const foundKey = Object.keys(liveMap).find(k => getShortcut(k) === keyShortcut);
            if (foundKey) targetData = liveMap[foundKey];
          }

          if (targetData) {
            const effectiveReached = Number(targetData.targetReached) || 0;
            const effectiveTarget = Number(targetData.monthlyTarget) || defTarget.monthlyTarget;
            setBranchTarget({
              monthlyTarget: effectiveTarget,
              targetReached: effectiveReached,
              branchName: targetData.branchName || curBranch
            });
          } else {
            setBranchTarget({
              monthlyTarget: defTarget.monthlyTarget,
              targetReached: defTarget.targetReached,
              branchName: curBranch
            });
          }
        } else {
          setBranchTarget({
            monthlyTarget: defTarget.monthlyTarget,
            targetReached: defTarget.targetReached,
            branchName: curBranch
          });
        }
      });
      return () => unsubscribe();
    } catch (err) {
      console.error('Error listening to branch target:', err);
    }
  }, [currentBranch, selectedDashboardBranch]);

  // Dynamic Real-time Branch Target Calculation from live collections this month
  const realBranchResult = useMemo(() => {
    const curBranch = selectedDashboardBranch === 'All Branches' ? (currentBranch || 'KPHB Branch') : selectedDashboardBranch;
    return calculateRealBranchRevenue(curBranch, liveAppointments, packageMembersList, branchTarget.monthlyTarget);
  }, [selectedDashboardBranch, currentBranch, liveAppointments, packageMembersList, branchTarget.monthlyTarget]);

  // Subscribe to real-time Firestore doctors collection
  useEffect(() => {
    const activeDb = getSafeDb();
    if (!activeDb) return;
    try {
      const colRef = collection(activeDb, 'doctors');
      const unsubscribe = onSnapshot(colRef, (snapshot) => {
        const list: any[] = [];
        if (!snapshot.empty) {
          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const normName = (data.name || data.doctorName || '').toLowerCase();
            if (normName.includes('reception') || normName.includes('desk') || normName.includes('staff')) return;
            const seedFallback = DEFAULT_DOCTORS_SEED.find(s => s.id === docSnap.id || s.name === data.name || s.name === data.doctorName);
            list.push({
              id: docSnap.id,
              name: data.name || data.doctorName || seedFallback?.name || 'Doctor',
              role: data.role || seedFallback?.role || 'Homeopathy Physician',
              branch: data.branch || data.assignedBranch || (seedFallback as any)?.branch || '',
              branchSchedules: (data.branchSchedules && Array.isArray(data.branchSchedules) && data.branchSchedules.length > 0)
                ? data.branchSchedules
                : (seedFallback?.branchSchedules || []),
            });
          });
        }

        DEFAULT_DOCTORS_SEED.forEach((seed) => {
          if (!list.some(d => d.name === seed.name || d.id === seed.id)) {
            list.push(seed);
          }
        });

        setLiveDoctorsData(list);
      }, (err) => {
        console.warn('Doctors listener error:', err);
        setLiveDoctorsData(DEFAULT_DOCTORS_SEED);
      });
      return () => unsubscribe();
    } catch (e) {
      console.warn('Doctors subscribe notice:', e);
      setLiveDoctorsData(DEFAULT_DOCTORS_SEED);
    }
  }, []);

  // Dynamically derive available doctors ONLY when reschedule modal is open
  const availableDoctorsList = useMemo(() => {
    if (!rescheduleModalOpen) return [];
    const targetBranchNorm = (selectedRescheduleAppt?.branch || '').toLowerCase().replace(/\s*branch\s*|\s*clinic\s*/gi, '').trim();
    const dayName = getDayNameFromDateStr(rescheduleDate);
    const set = new Set<string>();

    liveDoctorsData.forEach((docData) => {
      const docName = docData.name || docData.doctorName;
      if (!docName) return;

      if (docData.branchSchedules && Array.isArray(docData.branchSchedules) && docData.branchSchedules.length > 0) {
        const matchBs = docData.branchSchedules.find((bs: any) => {
          const bsBranch = (bs.targetBranch || bs.branch || '').toLowerCase().replace(/\s*branch\s*|\s*clinic\s*/gi, '').trim();
          return !targetBranchNorm || !bsBranch || bsBranch.includes(targetBranchNorm) || targetBranchNorm.includes(bsBranch);
        });

        if (matchBs && matchBs.daySchedules) {
          const daySched = matchBs.daySchedules[dayName];
          if (daySched && daySched.status === 'Available' && daySched.slots && daySched.slots.length > 0) {
            set.add(docName);
          }
          return;
        }
      }

      const docBranch = (docData.branch || docData.assignedBranch || '').toLowerCase().replace(/\s*branch\s*|\s*clinic\s*/gi, '').trim();
      if (targetBranchNorm && docBranch && (docBranch.includes(targetBranchNorm) || targetBranchNorm.includes(docBranch))) {
        set.add(docName);
      }
    });

    return Array.from(set);
  }, [rescheduleModalOpen, liveDoctorsData, rescheduleDate, selectedRescheduleAppt]);

  useEffect(() => {
    if (rescheduleModalOpen && availableDoctorsList.length > 0 && !availableDoctorsList.includes(rescheduleDoctor)) {
      setRescheduleDoctor(availableDoctorsList[0]);
    }
  }, [rescheduleModalOpen, availableDoctorsList, rescheduleDoctor]);

  const RESCHEDULE_TIME_SLOTS = [
    '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM',
    '12:00 PM', '12:30 PM', '04:00 PM', '04:30 PM',
    '05:00 PM', '05:30 PM', '06:00 PM', '06:30 PM',
  ];

  const rescheduleTimeSlots = useMemo(() => {
    if (!rescheduleModalOpen || !rescheduleDoctor) return RESCHEDULE_TIME_SLOTS;

    const normDocName = rescheduleDoctor.toLowerCase().trim();
    const docData = liveDoctorsData.find((d) => (d.name || d.doctorName || '').toLowerCase().trim() === normDocName);
    const dayName = getDayNameFromDateStr(rescheduleDate);
    const targetBranchNorm = (selectedRescheduleAppt?.branch || '').toLowerCase().replace(/\s*branch\s*|\s*clinic\s*/gi, '').trim();

    if (docData && docData.branchSchedules && Array.isArray(docData.branchSchedules)) {
      const matchBs = docData.branchSchedules.find((bs: any) => {
        const bsBranch = (bs.targetBranch || bs.branch || '').toLowerCase().replace(/\s*branch\s*|\s*clinic\s*/gi, '').trim();
        return !targetBranchNorm || !bsBranch || bsBranch.includes(targetBranchNorm) || targetBranchNorm.includes(bsBranch);
      });

      if (matchBs && matchBs.daySchedules && matchBs.daySchedules[dayName]) {
        const daySched = matchBs.daySchedules[dayName];
        if (daySched.status === 'Available' && daySched.slots && daySched.slots.length > 0) {
          const generated = generate15MinSlotsFromRanges(daySched.slots);
          if (generated.length > 0) {
            return generated;
          }
        }
      }
    }

    return RESCHEDULE_TIME_SLOTS;
  }, [rescheduleModalOpen, rescheduleDoctor, liveDoctorsData, rescheduleDate, selectedRescheduleAppt]);

  const parseSlotToMinutes = (slotStr: string): number => {
    if (!slotStr) return 0;
    const match = slotStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!match) return 0;
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const ampm = match[3].toUpperCase();
    if (ampm === 'PM' && hours !== 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;
    return hours * 60 + minutes;
  };

  const isSlotPastTime = (slotStr: string, targetDateStr: string): boolean => {
    if (!slotStr || !targetDateStr) return false;
    const cleanDate = String(targetDateStr).trim();
    const isToday = cleanDate === getTodayDateStr();
    if (!isToday) return false;

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const slotMinutes = parseSlotToMinutes(slotStr);
    return slotMinutes < currentMinutes;
  };

  const getSlotCapacityInfo = useCallback((slotTimeStr: string) => {
    const normSelectedDoc = (rescheduleDoctor || '').toLowerCase().trim();
    const bookedCount = liveAppointments.filter((app) => {
      const normAppDoc = (app.doctorName || app.doctor || '').toLowerCase().trim();
      const sameDoc = normAppDoc === normSelectedDoc;
      const sameDate = (app.appointmentDate || app.date || '') === rescheduleDate;
      const sameTime = (app.appointmentTime || app.time || '').trim() === slotTimeStr.trim();
      const notCancelled = app.status !== 'cancelled';
      return sameDoc && sameDate && sameTime && notCancelled;
    }).length;

    const remainingSlots = Math.max(0, 3 - bookedCount);
    return {
      bookedCount,
      remainingSlots,
      isFull: remainingSlots === 0
    };
  }, [rescheduleDoctor, liveAppointments, rescheduleDate]);

  const handleOpenRescheduleModal = useCallback((patient: PatientAppointmentRecord) => {
    setSelectedRescheduleAppt(patient);
    setRescheduleDate(patient.date || getTodayDateStr());
    setRescheduleTime(patient.time || '11:00 AM');
    setRescheduleDoctor(patient.doctor || 'Dr. Prashanth K Vaidya');
    setRescheduleCalOpen(false);
    setRescheduleModalOpen(true);
  }, []);

  const [isRescheduling, setIsRescheduling] = useState(false);

  const handleConfirmReschedule = useCallback(async () => {
    if (!selectedRescheduleAppt) return;
    const docId = selectedRescheduleAppt.id;
    setIsRescheduling(true);
    try {
      const payload = {
        appointmentDate: rescheduleDate,
        dateString: rescheduleDate,
        appointmentTime: rescheduleTime,
        timeSlot: rescheduleTime,
        doctorName: rescheduleDoctor,
        doctor: rescheduleDoctor,
        status: 'upcoming',
        updatedAt: new Date().toISOString(),
      };
      const activeDb = getSafeDb();
      await updateDoc(doc(activeDb, 'appointments', docId), payload).catch(() => { });
      await updateDoc(doc(activeDb, 'allpatients', docId), payload).catch(() => { });
      Alert.alert('Rescheduled', `Appointment for ${selectedRescheduleAppt.name} rescheduled to ${rescheduleDate} at ${rescheduleTime}.`);
      setRescheduleModalOpen(false);
    } catch (err) {
      console.error('Reschedule error:', err);
      Alert.alert('Error', 'Failed to reschedule appointment in Firestore.');
    } finally {
      setIsRescheduling(false);
    }
  }, [selectedRescheduleAppt, rescheduleDate, rescheduleTime, rescheduleDoctor]);



  // Open Delete Confirmation Modal (Popup Before Delete!)
  const handleDeleteAppointment = useCallback((patientId: string, patientName: string) => {
    const targetApp = liveAppointmentsRef.current.find(a => a.id === patientId) || { id: patientId, patientName, name: patientName };
    setDeleteConfirmApp(targetApp);
  }, []);

  // Confirmed Soft-Delete Appointment (Stored in 24h Recycle Bin)
  const handleConfirmDeleteAppointment = useCallback(async () => {
    if (!deleteConfirmApp) return;
    const patientId = deleteConfirmApp.id;
    const patientName = deleteConfirmApp.patientName || deleteConfirmApp.fullName || deleteConfirmApp.name || 'Patient';
    setIsDeletingApp(true);
    try {
      const targetBranch = deleteConfirmApp.branch || deleteConfirmApp.branchName || selectedDashboardBranch || 'KPHB Branch';
      const prevStatus = deleteConfirmApp.status || 'waiting';
      const payload = {
        isDeleted: true,
        deletedAt: new Date().toISOString(),
        deletedByBranch: targetBranch,
        previousStatus: prevStatus,
        status: 'deleted',
        updatedAt: new Date().toISOString()
      };

      const activeDb = getSafeDb();
      await updateDoc(doc(activeDb, 'appointments', patientId), payload).catch(() => { });
      await updateDoc(doc(activeDb, 'allpatients', patientId), payload).catch(() => { });
      await updateDoc(doc(activeDb, 'patients', patientId), payload).catch(() => { });

      const pPhone = deleteConfirmApp.phoneNumber || deleteConfirmApp.phone || '';
      if (pPhone) {
        sendCancellationWhatsAppNotification({
          patientName,
          phone: pPhone,
          date: deleteConfirmApp.appointmentDate || deleteConfirmApp.date || '',
          time: deleteConfirmApp.appointmentTime || deleteConfirmApp.time || '10:00 AM',
          doctorName: deleteConfirmApp.doctorName || deleteConfirmApp.doctor || 'Doctor',
          branch: targetBranch
        }).catch((err: any) => console.error('Cancellation WhatsApp notification error:', err));
      }

      setDeleteConfirmApp(null);
      Alert.alert('Moved to Recycle Bin', `Appointment for ${patientName} deleted. You can restore it within 24 hours.`);
    } catch (err) {
      console.error('Error deleting appointment:', err);
      Alert.alert('Error', 'Could not delete appointment from Firestore.');
    } finally {
      setIsDeletingApp(false);
    }
  }, [deleteConfirmApp, selectedDashboardBranch]);

  // Restore appointment from 24h Recycle Bin back to active queue
  const handleRestoreAppointment = useCallback(async (app: any) => {
    setIsRestoringId(app.id);
    try {
      const prevStatus = app.previousStatus && app.previousStatus !== 'deleted' ? app.previousStatus : 'waiting';
      const payload = {
        isDeleted: false,
        deletedAt: null,
        status: prevStatus,
        updatedAt: new Date().toISOString()
      };

      const activeDb = getSafeDb();
      await updateDoc(doc(activeDb, 'appointments', app.id), payload).catch(() => { });
      await updateDoc(doc(activeDb, 'allpatients', app.id), payload).catch(() => { });
      await updateDoc(doc(activeDb, 'patients', app.id), payload).catch(() => { });

      Alert.alert('Restored', `Appointment for ${app.patientName || app.name || 'Patient'} restored to the queue.`);
    } catch (err) {
      console.error('Error restoring appointment:', err);
      Alert.alert('Error', 'Could not restore appointment.');
    } finally {
      setIsRestoringId(null);
    }
  }, []);

  const handleUpdateStatus = useCallback(async (docId: string, newStatus: 'active' | 'completed' | 'upcoming') => {
    try {
      const payload = {
        status: newStatus === 'active' ? 'in_consultation' : newStatus,
        updatedAt: new Date().toISOString(),
      };
      const activeDb = getSafeDb();
      await updateDoc(doc(activeDb, 'appointments', docId), payload).catch(() => { });
      await updateDoc(doc(activeDb, 'allpatients', docId), payload).catch(() => { });
      await updateDoc(doc(activeDb, 'patients', docId), payload).catch(() => { });
      Alert.alert('Status Updated', `Patient appointment marked as ${newStatus}.`);
    } catch (err) {
      console.error('Error updating status:', err);
      Alert.alert('Update Failed', 'Could not update appointment status in Firestore.');
    }
  }, []);

  const activeBranch = selectedDashboardBranch;

  // Deleted appointments in the last 24h for current branch (Restorable)
  const deleted24hList = useMemo(() => {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    return liveAppointments.filter(app => {
      if (!isMatchingBranch(app, activeBranch)) return false;
      const isDel = app.isDeleted === true || String(app.status || '').toLowerCase() === 'deleted';
      if (!isDel) return false;
      const delTime = app.deletedAt ? new Date(app.deletedAt).getTime() : 0;
      return delTime >= oneDayAgo;
    }).sort((a, b) => {
      const timeA = a.deletedAt ? new Date(a.deletedAt).getTime() : 0;
      const timeB = b.deletedAt ? new Date(b.deletedAt).getTime() : 0;
      return timeB - timeA;
    });
  }, [liveAppointments, activeBranch]);

  // Memoized Filtered Active Appointments (Non-deleted)
  const filteredAppointments = useMemo(() => {
    return liveAppointments.filter(app => {
      const isDel = app.isDeleted === true || String(app.status || '').toLowerCase() === 'deleted';
      if (isDel) return false;
      return isMatchingDate(app, selectedDate) && isMatchingBranch(app, activeBranch);
    });
  }, [liveAppointments, selectedDate, activeBranch]);

  const allRecordsPool = useMemo(() => {
    return allCollectionsPool.length > 0 ? allCollectionsPool : liveAppointments;
  }, [allCollectionsPool, liveAppointments]);

  // Map filtered appointments once with pre-calculated visit state
  const mappedAppointments = useMemo(() => {
    const fallbackBranch = (activeBranch && activeBranch !== 'All Branches') ? activeBranch : 'KPHB Branch';
    return filteredAppointments.map((app, idx) => mapRecord(app, idx, selectedDate, allRecordsPool, packageMembersList, fallbackBranch));
  }, [filteredAppointments, selectedDate, allRecordsPool, packageMembersList, activeBranch]);

  // Memoized Sub-lists (upcomingList, activeList, completedList)
  const upcomingList = useMemo(() => {
    return mappedAppointments
      .filter(app => {
        const s = String(app.status || '').toLowerCase().trim();
        const isFeeNeeded = s === 'collect_fee' || app.feeCollectionNeeded === true;
        const isCompleted = !isFeeNeeded && (s === 'completed' || s === 'done' || s === 'concluded');
        const isActive = s === 'active' || s === 'in_consultation' || s === 'in-consultation' || isFeeNeeded;
        return !isCompleted && !isActive && s !== 'cancelled';
      })
      .sort((a, b) => {
        if (a.queueOrder !== undefined && b.queueOrder !== undefined) {
          return a.queueOrder - b.queueOrder;
        }
        return 0;
      });
  }, [mappedAppointments]);

  const upcomingListRef = useRef<any[]>([]);
  useEffect(() => {
    upcomingListRef.current = upcomingList;
  }, [upcomingList]);

  const activeList = useMemo(() => {
    return mappedAppointments.filter(app => {
      const s = String(app.status || '').toLowerCase().trim();
      const isFeeNeeded = s === 'collect_fee' || app.feeCollectionNeeded === true;
      if (isFeeNeeded && s !== 'completed') return true;
      const isCompleted = s === 'completed' || s === 'done' || s === 'concluded';
      const isActive = s === 'active' || s === 'in_consultation' || s === 'in-consultation';
      return !isCompleted && isActive;
    });
  }, [mappedAppointments]);

  const completedList = useMemo(() => {
    return mappedAppointments.filter(app => {
      const s = String(app.status || '').toLowerCase().trim();
      const isFeeNeeded = s === 'collect_fee' || app.feeCollectionNeeded === true;
      if (isFeeNeeded && s !== 'completed') return false;
      return s === 'completed' || s === 'done' || s === 'concluded';
    });
  }, [mappedAppointments]);

  // Follow-up Opted and Not Opted Lists
  const isFollowUpOpted = useCallback((app: any) => {
    if (app.followUpOpted === true || app.followup === true) return true;
    if (app.followUpInterval && app.followUpInterval !== 'No Follow-up' && app.followUpInterval !== 'None') return true;
    if (app.preferredFollowUpDate || app.followUpDate) return true;
    return false;
  }, []);

  const followupOptedList = useMemo(() => {
    return filteredAppointments.filter(isFollowUpOpted);
  }, [filteredAppointments, isFollowUpOpted]);

  const followupNotOptedList = useMemo(() => {
    return filteredAppointments.filter(a => !isFollowUpOpted(a));
  }, [filteredAppointments, isFollowUpOpted]);

  // Payment Pending List (Doctor clicked Send to Reception & Collect Fee)
  const isPaymentPending = useCallback((app: any) => {
    const st = String(app.status || '').toLowerCase().trim();
    const p = String(app.paymentStatus || '').toLowerCase().trim();
    if (st === 'completed' || st === 'concluded' || st === 'finished' || st === 'done') return false;
    if (st === 'collect_fee' || app.feeCollectionNeeded === true) return true;
    const isPaid = p === 'paid';
    if (isPaid) return false;

    return (p === 'pending' || app.paymentPending === true) && st !== 'in_consultation' && st !== 'in-consultation' && st !== 'active' && st !== 'consulting';
  }, []);

  const paymentPendingList = useMemo(() => {
    return filteredAppointments.filter(isPaymentPending);
  }, [filteredAppointments, isPaymentPending]);

  // Memoized Dynamic Metrics (Calculated once when filteredAppointments changes)
  const dashboardMetrics = useMemo(() => {
    const totalBookings = filteredAppointments.length;
    let waiting = 0;

    filteredAppointments.forEach(app => {
      const st = (app.status || '').toLowerCase();
      if (st === 'waiting' || st === 'scheduled' || st === 'upcoming' || st === 'pending') {
        waiting++;
      }
    });

    return {
      totalBookings,
      waiting,
      activeConsultationsCount: activeList.length,
      payPending: paymentPendingList.length,
      completed: completedList.length,
      apptsCompleted: completedList.length,
      followupOpted: followupOptedList.length,
      followupNotOpted: followupNotOptedList.length,
    };
  }, [filteredAppointments, activeList.length, paymentPendingList.length, completedList.length, followupOptedList.length, followupNotOptedList.length]);

  // Handler for shifting patient queue position in Firestore
  const handleShiftQueueOrder = useCallback(async (patient: PatientAppointmentRecord, direction: 'up' | 'down') => {
    const list = upcomingListRef.current;
    const listIndex = list.findIndex(item => item.id === patient.id);
    if (listIndex === -1) return;
    const targetIndex = direction === 'up' ? listIndex - 1 : listIndex + 1;
    if (targetIndex < 0 || targetIndex >= list.length) return;
    const currentApp = list[listIndex];
    const targetApp = list[targetIndex];
    try {
      const currentOrder = listIndex + 1;
      const targetOrder = targetIndex + 1;
      const activeDb = getSafeDb();
      try {
        await updateDoc(doc(activeDb, 'appointments', currentApp.id), { queueOrder: targetOrder, updatedAt: new Date().toISOString() });
      } catch (e) {
        await updateDoc(doc(activeDb, 'allpatients', currentApp.id), { queueOrder: targetOrder, updatedAt: new Date().toISOString() });
      }
      try {
        await updateDoc(doc(activeDb, 'appointments', targetApp.id), { queueOrder: currentOrder, updatedAt: new Date().toISOString() });
      } catch (e) {
        await updateDoc(doc(activeDb, 'allpatients', targetApp.id), { queueOrder: currentOrder, updatedAt: new Date().toISOString() });
      }
    } catch (err) {
      console.error('Error shifting queue order:', err);
    }
  }, []);

  const handleCall = useCallback((phone: string) => {
    if (!phone) return Alert.alert('No Phone', 'No phone number available');
    Linking.openURL(`tel:${phone}`).catch(() => Alert.alert('Error', 'Unable to make call'));
  }, []);

  const handleWhatsApp = useCallback((phone: string, name: string) => {
    if (!phone) return Alert.alert('No Phone', 'No phone number available');
    const clean = phone.replace(/\D/g, '').slice(-10);
    const msg = `Hello ${name}, regarding your appointment at Spiritual Homeopathy Clinic.`;
    Linking.openURL(`https://wa.me/91${clean}?text=${encodeURIComponent(msg)}`).catch(() => Alert.alert('Error', 'Unable to open WhatsApp'));
  }, []);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>

      {/* Target Progress Card */}
      <View style={{ paddingHorizontal: 10, marginTop: 8 }}>
        <TargetProgressUI
          branchName={branchTarget.branchName || (selectedDashboardBranch === 'All Branches' ? (currentBranch || 'KPHB Branch') : selectedDashboardBranch)}
          monthlyTarget={branchTarget.monthlyTarget || 0}
          targetReached={branchTarget.targetReached || 0}
        />
      </View>

      {/* Overview Header */}
      <View style={styles.overviewHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={styles.overviewTitle}>Overview</Text>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        </View>

        {/* Date Filter Button */}
        <TouchableOpacity
          style={styles.todayFilterBtn}
          onPress={() => setDatePickerModalOpen(true)}
        >
          <Ionicons name="calendar-outline" size={14} color="#258ec8" />
          <Text style={styles.todayFilterText}>
            {selectedDate === getTodayDateStr() ? 'Today' : selectedDate === getTomorrowDateStr() ? 'Tomorrow' : selectedDate}
          </Text>
          <Feather name="chevron-down" size={14} color="#64748b" />
        </TouchableOpacity>
      </View>

      {/* Top Row: 4 Clean Metric Cards */}
      <View style={styles.metricsRow}>
        <TouchableOpacity
          style={[styles.metricCard, { borderTopColor: '#258ec8' }]}
          onPress={() => setSelectedTab('all')}
        >
          <Text style={[styles.metricNum, { color: '#258ec8' }]}>{dashboardMetrics.totalBookings}</Text>
          <Text style={styles.metricLabel} numberOfLines={1}>Total Bookings</Text>
        </TouchableOpacity>

        {/* Waiting - Clickable redirect to Upcoming Appointments tab */}
        <TouchableOpacity
          style={[
            styles.metricCard,
            { borderTopColor: '#258ec8', backgroundColor: selectedTab === 'upcoming' ? '#eff6ff' : '#ffffff' }
          ]}
          onPress={() => setSelectedTab('upcoming')}
        >
          <Text style={[styles.metricNum, { color: '#258ec8' }]}>{dashboardMetrics.waiting}</Text>
          <Text style={[styles.metricLabel, selectedTab === 'upcoming' && { fontWeight: '800', color: '#0284c7' }]}>Waiting</Text>
        </TouchableOpacity>

        {/* 1) Active Consultations - Clickable redirect to Active Consultation tab */}
        <TouchableOpacity
          style={[
            styles.metricCard,
            { borderTopColor: '#d97706', backgroundColor: selectedTab === 'active' ? '#fffbeb' : '#ffffff' }
          ]}
          onPress={() => setSelectedTab('active')}
        >
          <Text style={[styles.metricNum, { color: '#d97706' }]}>{activeList.length}</Text>
          <Text style={[styles.metricLabel, selectedTab === 'active' && { fontWeight: '800', color: '#b45309' }]} numberOfLines={1}>Active Consult</Text>
        </TouchableOpacity>

        {/* 2) Completed - Clickable redirect to Completed Appointments tab */}
        <TouchableOpacity
          style={[
            styles.metricCard,
            { borderTopColor: '#16a34a', backgroundColor: selectedTab === 'completed' ? '#f0fdf4' : '#ffffff' }
          ]}
          onPress={() => setSelectedTab('completed')}
        >
          <Text style={[styles.metricNum, { color: '#16a34a' }]}>{completedList.length}</Text>
          <Text style={[styles.metricLabel, selectedTab === 'completed' && { fontWeight: '800', color: '#15803d' }]} numberOfLines={1}>Completed</Text>
        </TouchableOpacity>
      </View>

      {/* Bottom Row: 3 Clean Metric Cards */}
      <View style={styles.metricsRowSecond}>
        {/* Payment Pending - Clickable opens popup */}
        <TouchableOpacity
          style={[styles.metricCardWide, { borderTopColor: '#ef4444' }]}
          onPress={() => {
            setFollowupSearchTerm('');
            setFollowupModalOpen('payment_pending');
          }}
        >
          <Text style={[styles.metricNum, { color: '#ef4444' }]}>{dashboardMetrics.payPending}</Text>
          <Text style={[styles.metricLabel, { color: '#ef4444', fontWeight: '800' }]}>Pay Pending ➔</Text>
        </TouchableOpacity>

        {/* 3) Follow-up Opted - Clickable opens popup */}
        <TouchableOpacity
          style={[styles.metricCardWide, { borderTopColor: '#258ec8' }]}
          onPress={() => {
            setFollowupSearchTerm('');
            setFollowupModalOpen('opted');
          }}
        >
          <Text style={[styles.metricNum, { color: '#258ec8' }]}>{dashboardMetrics.followupOpted}</Text>
          <Text style={[styles.metricLabel, { color: '#258ec8', fontWeight: '800' }]}>Follow-up Opted ➔</Text>
        </TouchableOpacity>

        {/* 4) Follow-up Not Opted - Clickable opens popup */}
        <TouchableOpacity
          style={[styles.metricCardWide, { borderTopColor: '#64748b' }]}
          onPress={() => {
            setFollowupSearchTerm('');
            setFollowupModalOpen('not_opted');
          }}
        >
          <Text style={[styles.metricNum, { color: '#64748b' }]}>{dashboardMetrics.followupNotOpted}</Text>
          <Text style={[styles.metricLabel, { color: '#475569', fontWeight: '800' }]}>Not Opted ➔</Text>
        </TouchableOpacity>
      </View>

      {/* Mobile Interactive Tab Bar */}
      <View style={{ flexDirection: 'row', gap: 6, marginHorizontal: 16, marginTop: 14, marginBottom: 8, flexWrap: 'wrap' }}>
        {[
          { key: 'all', label: `All (${filteredAppointments.length})` },
          { key: 'upcoming', label: `Upcoming (${upcomingList.length})` },
          { key: 'active', label: `Active (${activeList.length})` },
          { key: 'completed', label: `Completed (${completedList.length})` },
        ].map((t) => {
          const isActive = selectedTab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              onPress={() => setSelectedTab(t.key as any)}
              style={{
                paddingVertical: 6,
                paddingHorizontal: 12,
                borderRadius: 16,
                backgroundColor: isActive ? '#258ec8' : '#f1f5f9',
                borderWidth: 1,
                borderColor: isActive ? '#258ec8' : '#e2e8f0',
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: '800', color: isActive ? '#ffffff' : '#475569' }}>
                {t.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Section 1: Upcoming Appointments */}
      {(selectedTab === 'all' || selectedTab === 'upcoming') && (
        <>
          <View style={styles.sectionHeaderRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.sectionTitle}>Upcoming Appointments</Text>
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{upcomingList.length}</Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <TouchableOpacity
                onPress={() => setRestoreModalOpen(true)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  backgroundColor: '#f0f9ff',
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: '#bae6fd'
                }}
              >
                <Ionicons name="refresh-outline" size={13} color="#0284c7" />
                <Text style={{ color: '#0284c7', fontSize: 11.5, fontWeight: '700' }}>Restore (24h)</Text>
                {deleted24hList.length > 0 && (
                  <View style={{ backgroundColor: '#0284c7', borderRadius: 10, paddingHorizontal: 5, paddingVertical: 1 }}>
                    <Text style={{ color: '#ffffff', fontSize: 9.5, fontWeight: '800' }}>{deleted24hList.length}</Text>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {upcomingList.length > 0 ? (
            upcomingList.map((p, idx) => (
              <PatientCardItem
                key={p.id}
                patient={p}
                index={idx}
                totalCount={upcomingList.length}
                onUpdateStatus={handleUpdateStatus}
                onNavigate={onNavigate}
                onShiftQueueOrder={handleShiftQueueOrder}
                onCall={handleCall}
                onWhatsApp={handleWhatsApp}
                onReschedule={handleOpenRescheduleModal}
                onDelete={handleDeleteAppointment}
                onOpenCheckout={handleOpenCheckout}
              />
            ))
          ) : (
            <View style={styles.emptyCardContainer}>
              <Ionicons name="calendar-outline" size={28} color="#cbd5e1" style={{ marginBottom: 6 }} />
              <Text style={styles.emptyCardText}>No upcoming waiting appointments for {selectedDate}.</Text>
              <TouchableOpacity
                style={styles.limeGreenBtn}
                onPress={() => onNavigate && onNavigate('reception_book')}
              >
                <Ionicons name="add-circle-outline" size={16} color="#ffffff" style={{ marginRight: 6 }} />
                <Text style={styles.limeGreenBtnText}>Book Appointment</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}

      {/* Section 2: Active Consultations */}
      {(selectedTab === 'all' || selectedTab === 'active') && (
        <>
          <View style={[styles.sectionHeaderRow, { marginTop: 22, marginBottom: 12 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.sectionTitle}>Active Consultations</Text>
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{activeList.length}</Text>
              </View>
            </View>
          </View>

          {activeList.length > 0 ? (
            activeList.map((p, idx) => (
              <PatientCardItem
                key={p.id}
                patient={p}
                index={idx}
                totalCount={activeList.length}
                onUpdateStatus={handleUpdateStatus}
                onNavigate={onNavigate}
                onShiftQueueOrder={handleShiftQueueOrder}
                onCall={handleCall}
                onWhatsApp={handleWhatsApp}
                onReschedule={handleOpenRescheduleModal}
                onDelete={handleDeleteAppointment}
                onOpenCheckout={handleOpenCheckout}
              />
            ))
          ) : (
            <View style={styles.emptyCardSimple}>
              <Ionicons name="time-outline" size={26} color="#cbd5e1" style={{ marginBottom: 4 }} />
              <Text style={styles.emptyCardText}>No patients currently in consultation or awaiting payment.</Text>
            </View>
          )}
        </>
      )}

      {/* Section 3: Completed Appointments Today */}
      {(selectedTab === 'all' || selectedTab === 'completed') && (
        <>
          <View style={[styles.sectionHeaderRow, { marginTop: 22, marginBottom: 12 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.sectionTitle}>Completed Appointments Today</Text>
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{completedList.length}</Text>
              </View>
            </View>
          </View>

          {completedList.length > 0 ? (
            completedList.map((p, idx) => (
              <PatientCardItem
                key={p.id}
                patient={p}
                index={idx}
                totalCount={completedList.length}
                onUpdateStatus={handleUpdateStatus}
                onNavigate={onNavigate}
                onShiftQueueOrder={handleShiftQueueOrder}
                onCall={handleCall}
                onWhatsApp={handleWhatsApp}
                onReschedule={handleOpenRescheduleModal}
                onDelete={handleDeleteAppointment}
                onOpenCheckout={handleOpenCheckout}
              />
            ))
          ) : (
            <View style={styles.emptyCardSimple}>
              <Ionicons name="checkmark-done-circle-outline" size={26} color="#cbd5e1" style={{ marginBottom: 4 }} />
              <Text style={styles.emptyCardText}>No completed appointments today yet.</Text>
            </View>
          )}
        </>
      )}

      {/* DATE FILTER MODAL WITH FULL INTERACTIVE CALENDAR GRID */}
      {datePickerModalOpen && (
        <Modal
          visible={datePickerModalOpen}
          transparent={true}
          animationType="none"
          onRequestClose={() => setDatePickerModalOpen(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setDatePickerModalOpen(false)}
          >
            <View style={[styles.modalCard, { maxWidth: 360, padding: 18 }]} onStartShouldSetResponder={() => true}>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <Text style={{ fontSize: 16, fontWeight: '800', color: '#0f172a' }}>
                  Select Dashboard Date
                </Text>
                <TouchableOpacity onPress={() => setDatePickerModalOpen(false)}>
                  <Feather name="x" size={20} color="#64748b" />
                </TouchableOpacity>
              </View>

              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                <TouchableOpacity
                  style={[
                    styles.quickDateBtn,
                    selectedDate === getTodayDateStr() && styles.quickDateBtnActive
                  ]}
                  onPress={() => {
                    setSelectedDate(getTodayDateStr());
                    setCalendarMonth(new Date());
                    setDatePickerModalOpen(false);
                  }}
                >
                  <Ionicons name="calendar-outline" size={14} color={selectedDate === getTodayDateStr() ? '#ffffff' : '#258ec8'} />
                  <Text style={[styles.quickDateText, selectedDate === getTodayDateStr() && styles.quickDateTextActive]}>
                    Today ({getTodayDateStr()})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.quickDateBtn,
                    selectedDate === getTomorrowDateStr() && styles.quickDateBtnActive
                  ]}
                  onPress={() => {
                    setSelectedDate(getTomorrowDateStr());
                    const tom = new Date();
                    tom.setDate(tom.getDate() + 1);
                    setCalendarMonth(tom);
                    setDatePickerModalOpen(false);
                  }}
                >
                  <Ionicons name="time-outline" size={14} color={selectedDate === getTomorrowDateStr() ? '#ffffff' : '#258ec8'} />
                  <Text style={[styles.quickDateText, selectedDate === getTomorrowDateStr() && styles.quickDateTextActive]}>
                    Tomorrow
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f8fafc', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: '#e2e8f0' }}>
                <TouchableOpacity
                  onPress={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))}
                  style={{ padding: 4 }}
                >
                  <Feather name="chevron-left" size={18} color="#258ec8" />
                </TouchableOpacity>

                <Text style={{ fontSize: 14, fontWeight: '800', color: '#0f172a' }}>
                  {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][calendarMonth.getMonth()]} {calendarMonth.getFullYear()}
                </Text>

                <TouchableOpacity
                  onPress={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))}
                  style={{ padding: 4 }}
                >
                  <Feather name="chevron-right" size={18} color="#258ec8" />
                </TouchableOpacity>
              </View>

              <View style={{ flexDirection: 'row', marginBottom: 8 }}>
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => (
                  <View key={i} style={{ flex: 1, alignItems: 'center' }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748b' }}>{d}</Text>
                  </View>
                ))}
              </View>

              {(() => {
                const year = calendarMonth.getFullYear();
                const month = calendarMonth.getMonth();
                const daysInMonth = new Date(year, month + 1, 0).getDate();
                const firstDayIndex = new Date(year, month, 1).getDay();

                const cells = [];
                for (let i = 0; i < firstDayIndex; i++) {
                  cells.push(<View key={`empty-${i}`} style={{ width: '14.28%', height: 36 }} />);
                }

                for (let day = 1; day <= daysInMonth; day++) {
                  const formattedDay = String(day).padStart(2, '0');
                  const formattedMonth = String(month + 1).padStart(2, '0');
                  const dateStr = `${formattedDay}-${formattedMonth}-${year}`;
                  const isSelected = selectedDate === dateStr;
                  const isToday = getTodayDateStr() === dateStr;

                  cells.push(
                    <TouchableOpacity
                      key={`day-${day}`}
                      style={{
                        width: '14.28%',
                        height: 36,
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}
                      onPress={() => {
                        setSelectedDate(dateStr);
                        setDatePickerModalOpen(false);
                      }}
                    >
                      <View
                        style={[
                          { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
                          isSelected && { backgroundColor: '#258ec8' },
                          !isSelected && isToday && { borderWidth: 1.5, borderColor: '#16a34a', backgroundColor: '#f0fdf4' },
                        ]}
                      >
                        <Text
                          style={[
                            { fontSize: 13, fontWeight: '600', color: '#334155' },
                            isSelected && { color: '#ffffff', fontWeight: '800' },
                            !isSelected && isToday && { color: '#166534', fontWeight: '800' },
                          ]}
                        >
                          {day}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                }

                return (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                    {cells}
                  </View>
                );
              })()}

              <TouchableOpacity
                style={{
                  marginTop: 16,
                  backgroundColor: '#f1f5f9',
                  paddingVertical: 10,
                  borderRadius: 10,
                  alignItems: 'center'
                }}
                onPress={() => setDatePickerModalOpen(false)}
              >
                <Text style={{ color: '#475569', fontWeight: '700', fontSize: 13 }}>Close Calendar</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      {/* RESCHEDULE APPOINTMENT MODAL */}
      {rescheduleModalOpen && (
        <Modal
          visible={rescheduleModalOpen}
          transparent={true}
          animationType="none"
          onRequestClose={() => setRescheduleModalOpen(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setRescheduleModalOpen(false)}
          >
            <View style={[styles.modalCard, { maxHeight: '90%' }]} onStartShouldSetResponder={() => true}>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <View>
                  <Text style={{ fontSize: 16, fontWeight: '800', color: '#0f172a' }}>Reschedule Appointment</Text>
                  <Text style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                    {selectedRescheduleAppt?.name} {selectedRescheduleAppt?.regId ? `(${selectedRescheduleAppt?.regId})` : ''}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setRescheduleModalOpen(false)}>
                  <Feather name="x" size={20} color="#64748b" />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 10 }}>

                <Text style={styles.fieldLabel}>Select New Date</Text>

                <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
                  <TouchableOpacity
                    style={[
                      styles.quickDateBtn,
                      rescheduleDate === getTodayDateStr() && styles.quickDateBtnActive
                    ]}
                    onPress={() => {
                      setRescheduleDate(getTodayDateStr());
                      setRescheduleCalOpen(false);
                    }}
                  >
                    <Ionicons name="calendar-outline" size={13} color={rescheduleDate === getTodayDateStr() ? '#ffffff' : '#258ec8'} />
                    <Text style={[styles.quickDateText, rescheduleDate === getTodayDateStr() && styles.quickDateTextActive]}>
                      Today ({getTodayDateStr()})
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.quickDateBtn,
                      rescheduleDate === getTomorrowDateStr() && styles.quickDateBtnActive
                    ]}
                    onPress={() => {
                      setRescheduleDate(getTomorrowDateStr());
                      setRescheduleCalOpen(false);
                    }}
                  >
                    <Ionicons name="time-outline" size={13} color={rescheduleDate === getTomorrowDateStr() ? '#ffffff' : '#258ec8'} />
                    <Text style={[styles.quickDateText, rescheduleDate === getTomorrowDateStr() && styles.quickDateTextActive]}>
                      Tomorrow
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.quickDateBtn,
                      { flex: 0.8 },
                      rescheduleCalOpen && styles.quickDateBtnActive
                    ]}
                    onPress={() => setRescheduleCalOpen(!rescheduleCalOpen)}
                  >
                    <Feather name="calendar" size={13} color={rescheduleCalOpen ? '#ffffff' : '#258ec8'} />
                    <Text style={[styles.quickDateText, rescheduleCalOpen && styles.quickDateTextActive]}>
                      Calendar
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.inputBox}>
                  <Feather name="calendar" size={15} color="#258ec8" style={{ marginRight: 8 }} />
                  <TextInput
                    style={styles.inputText}
                    value={rescheduleDate}
                    onChangeText={setRescheduleDate}
                    placeholder="DD-MM-YYYY"
                  />
                </View>

                {rescheduleCalOpen && (
                  <View style={{ marginTop: 10, padding: 10, backgroundColor: '#f8fafc', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0' }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <TouchableOpacity onPress={() => setRescheduleCalMonth(new Date(rescheduleCalMonth.getFullYear(), rescheduleCalMonth.getMonth() - 1, 1))}>
                        <Feather name="chevron-left" size={16} color="#258ec8" />
                      </TouchableOpacity>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: '#0f172a' }}>
                        {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][rescheduleCalMonth.getMonth()]} {rescheduleCalMonth.getFullYear()}
                      </Text>
                      <TouchableOpacity onPress={() => setRescheduleCalMonth(new Date(rescheduleCalMonth.getFullYear(), rescheduleCalMonth.getMonth() + 1, 1))}>
                        <Feather name="chevron-right" size={16} color="#258ec8" />
                      </TouchableOpacity>
                    </View>

                    <View style={{ flexDirection: 'row', marginBottom: 6 }}>
                      {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                        <View key={i} style={{ flex: 1, alignItems: 'center' }}>
                          <Text style={{ fontSize: 10, fontWeight: '700', color: '#64748b' }}>{d}</Text>
                        </View>
                      ))}
                    </View>

                    {(() => {
                      const y = rescheduleCalMonth.getFullYear();
                      const m = rescheduleCalMonth.getMonth();
                      const daysInMonth = new Date(y, m + 1, 0).getDate();
                      const firstDay = new Date(y, m, 1).getDay();
                      const cells = [];
                      for (let i = 0; i < firstDay; i++) {
                        cells.push(<View key={`empty-${i}`} style={{ width: '14.28%', height: 30 }} />);
                      }
                      for (let d = 1; d <= daysInMonth; d++) {
                        const dStr = `${String(d).padStart(2, '0')}-${String(m + 1).padStart(2, '0')}-${y}`;
                        const isSel = rescheduleDate === dStr;
                        cells.push(
                          <TouchableOpacity
                            key={`d-${d}`}
                            style={{ width: '14.28%', height: 30, justifyContent: 'center', alignItems: 'center' }}
                            onPress={() => {
                              setRescheduleDate(dStr);
                              setRescheduleCalOpen(false);
                            }}
                          >
                            <View style={[{ width: 26, height: 26, borderRadius: 13, justifyContent: 'center', alignItems: 'center' }, isSel && { backgroundColor: '#258ec8' }]}>
                              <Text style={[{ fontSize: 11, fontWeight: '600', color: '#334155' }, isSel && { color: '#ffffff', fontWeight: '800' }]}>{d}</Text>
                            </View>
                          </TouchableOpacity>
                        );
                      }
                      return <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{cells}</View>;
                    })()}
                  </View>
                )}

                <Text style={[styles.fieldLabel, { marginTop: 14 }]}>
                  Select Doctor for {selectedRescheduleAppt?.branch || 'Branch'} ({getDayNameFromDateStr(rescheduleDate)})
                </Text>

                <TouchableOpacity
                  style={styles.dropdownSelectorBox}
                  onPress={() => setDoctorDropdownOpen(!doctorDropdownOpen)}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                    <MaterialCommunityIcons name="stethoscope" size={18} color="#258ec8" />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: '#0f172a' }}>
                        {rescheduleDoctor || 'Select Doctor'}
                      </Text>
                      <Text style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
                        Homeopathy Physician • {selectedRescheduleAppt?.branch || activeBranch || 'KPHB Branch'}
                      </Text>
                    </View>
                  </View>
                  <Feather name={doctorDropdownOpen ? "chevron-up" : "chevron-down"} size={18} color="#64748b" />
                </TouchableOpacity>

                {doctorDropdownOpen && (
                  <View style={styles.dropdownOptionsContainer}>
                    {availableDoctorsList.length === 0 ? (
                      <View style={{ padding: 12 }}>
                        <Text style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic' }}>
                          No doctors available on {getDayNameFromDateStr(rescheduleDate)} for {selectedRescheduleAppt?.branch || 'Branch'}
                        </Text>
                      </View>
                    ) : (
                      availableDoctorsList.map((docName) => {
                        const isSelected = rescheduleDoctor === docName;
                        return (
                          <TouchableOpacity
                            key={docName}
                            style={[styles.dropdownOptionRow, isSelected && styles.dropdownOptionRowActive]}
                            onPress={() => {
                              setRescheduleDoctor(docName);
                              setDoctorDropdownOpen(false);
                            }}
                          >
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.dropdownOptionTitle, isSelected && { color: '#258ec8', fontWeight: '800' }]}>
                                {docName}
                              </Text>
                              <Text style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
                                Homeopathy Physician
                              </Text>
                            </View>
                            {isSelected && (
                              <Ionicons name="checkmark-circle" size={18} color="#258ec8" />
                            )}
                          </TouchableOpacity>
                        );
                      })
                    )}
                  </View>
                )}

                <Text style={[styles.fieldLabel, { marginTop: 14 }]}>
                  Available Time Slots for {rescheduleDoctor}
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                  {rescheduleTimeSlots.map((slot) => {
                    const { remainingSlots, isFull } = getSlotCapacityInfo(slot);
                    const isPast = isSlotPastTime(slot, rescheduleDate);
                    const isBlocked = isFull || isPast;
                    const isSelected = rescheduleTime.trim() === slot.trim();
                    const isOneLeft = remainingSlots === 1;

                    return (
                      <TouchableOpacity
                        key={slot}
                        disabled={isBlocked}
                        style={[
                          styles.slotChip,
                          isSelected && styles.slotChipActive,
                          isFull && styles.slotChipFull,
                          isPast && { backgroundColor: '#f8fafc', borderColor: '#e2e8f0', opacity: 0.5 }
                        ]}
                        onPress={() => {
                          if (!isBlocked) setRescheduleTime(slot);
                        }}
                      >
                        <Text style={[
                          styles.slotChipTime,
                          isSelected && styles.slotChipTimeActive,
                          isFull && styles.slotChipTimeFull,
                          isPast && { color: '#94a3b8', textDecorationLine: 'line-through' }
                        ]}>
                          {slot}
                        </Text>

                        <View style={[
                          styles.capacityBadge,
                          isSelected && { backgroundColor: 'rgba(255,255,255,0.25)' },
                          !isSelected && isPast && { backgroundColor: '#fee2e2' },
                          !isSelected && !isPast && isFull && { backgroundColor: '#fee2e2' },
                          !isSelected && !isPast && isOneLeft && { backgroundColor: '#fef3c7' },
                          !isSelected && !isPast && !isFull && !isOneLeft && { backgroundColor: '#e0f2fe' },
                        ]}>
                          <Text style={[
                            styles.capacityBadgeText,
                            isSelected && { color: '#ffffff' },
                            !isSelected && isPast && { color: '#dc2626' },
                            !isSelected && !isPast && isFull && { color: '#ef4444' },
                            !isSelected && !isPast && isOneLeft && { color: '#b45309' },
                            !isSelected && !isPast && !isFull && !isOneLeft && { color: '#0369a1' },
                          ]}>
                            {isPast ? 'BLOCKED' : isFull ? 'FULL' : `${remainingSlots} left`}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>

              </ScrollView>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 16, paddingTop: 10, borderTopWidth: 1, borderColor: '#f1f5f9' }}>
                <TouchableOpacity
                  style={{ flex: 1, backgroundColor: '#f1f5f9', paddingVertical: 10, borderRadius: 10, alignItems: 'center' }}
                  onPress={() => setRescheduleModalOpen(false)}
                >
                  <Text style={{ color: '#475569', fontWeight: '700', fontSize: 13 }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1.5, backgroundColor: '#258ec8', paddingVertical: 10, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}
                  disabled={isRescheduling}
                  onPress={handleConfirmReschedule}
                >
                  {isRescheduling ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 13 }}>Confirm Reschedule</Text>
                  )}
                </TouchableOpacity>
              </View>

            </View>
          </TouchableOpacity>
        </Modal>
      )}

      {/* Appointment Payment & Billing Checkout Modal */}
      {paymentModalOpen && (
        <AppointmentPaymentModal
          visible={paymentModalOpen}
          onDismiss={() => {
            setPaymentModalOpen(false);
            setSelectedPatientForPayment(null);
          }}
          selectedPatientForPayment={selectedPatientForPayment}
          onPaymentSuccess={(completedApp) => {
            setPaymentModalOpen(false);
            setSelectedPatientForPayment(null);
          }}
        />
      )}

      {/* ---------------- FOLLOW-UP POPUP MODAL (OPTED / NOT OPTED) ---------------- */}
      {!!followupModalOpen && (
        <Modal
          visible={!!followupModalOpen}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setFollowupModalOpen(null)}
        >
          <View style={styles.followupModalBackdrop}>
            <View style={styles.followupModalCard}>
              {/* Modal Header */}
              <View style={styles.followupModalHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                  <View style={[
                    styles.followupModalIconCircle,
                    {
                      backgroundColor: followupModalOpen === 'payment_pending'
                        ? '#fee2e2'
                        : (followupModalOpen === 'opted' ? '#dcfce7' : '#f1f5f9')
                    }
                  ]}>
                    <Ionicons
                      name={
                        followupModalOpen === 'payment_pending'
                          ? 'card-outline'
                          : (followupModalOpen === 'opted' ? 'repeat' : 'person-remove')
                      }
                      size={20}
                      color={
                        followupModalOpen === 'payment_pending'
                          ? '#ef4444'
                          : (followupModalOpen === 'opted' ? '#16a34a' : '#64748b')
                      }
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.followupModalTitle}>
                        {followupModalOpen === 'payment_pending'
                          ? 'Payment Pending'
                          : (followupModalOpen === 'opted' ? 'Follow-up Opted' : 'Follow-up Not Opted')}
                      </Text>
                      <View style={[
                        styles.followupCountBadge,
                        {
                          backgroundColor: followupModalOpen === 'payment_pending'
                            ? '#ef4444'
                            : (followupModalOpen === 'opted' ? '#258ec8' : '#64748b')
                        }
                      ]}>
                        <Text style={styles.followupCountBadgeText}>
                          {followupModalOpen === 'payment_pending'
                            ? paymentPendingList.length
                            : (followupModalOpen === 'opted' ? followupOptedList.length : followupNotOptedList.length)}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.followupModalSubtitle} numberOfLines={1}>
                      {followupModalOpen === 'payment_pending'
                        ? 'Patients sent to Reception for Fee Collection'
                        : `${selectedDate === getTodayDateStr() ? 'Today' : selectedDate} bookings`}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.followupCloseBtn}
                  onPress={() => setFollowupModalOpen(null)}
                >
                  <Ionicons name="close" size={20} color="#0f172a" />
                </TouchableOpacity>
              </View>

              {/* Search Input */}
              <View style={styles.followupSearchRow}>
                <Ionicons name="search" size={16} color="#94a3b8" style={{ marginRight: 6 }} />
                <TextInput
                  style={styles.followupSearchInput}
                  placeholder="Search patient, phone, doctor..."
                  placeholderTextColor="#94a3b8"
                  value={followupSearchTerm}
                  onChangeText={setFollowupSearchTerm}
                />
                {!!followupSearchTerm && (
                  <TouchableOpacity onPress={() => setFollowupSearchTerm('')}>
                    <Ionicons name="close-circle" size={16} color="#94a3b8" />
                  </TouchableOpacity>
                )}
              </View>

              {/* Patient List */}
              <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
                {(() => {
                  const baseList = followupModalOpen === 'payment_pending'
                    ? paymentPendingList
                    : (followupModalOpen === 'opted' ? followupOptedList : followupNotOptedList);

                  const targetList = baseList.filter(app => {
                    if (!followupSearchTerm.trim()) return true;
                    const q = followupSearchTerm.toLowerCase();
                    const name = (app.patientName || app.name || '').toLowerCase();
                    const phone = (app.phone || app.phoneNumber || '').toLowerCase();
                    const regId = (app.regId || '').toLowerCase();
                    const doc = (app.doctor || app.doctorName || '').toLowerCase();
                    return name.includes(q) || phone.includes(q) || regId.includes(q) || doc.includes(q);
                  });

                  if (targetList.length === 0) {
                    return (
                      <View style={{ paddingVertical: 36, alignItems: 'center' }}>
                        <Ionicons
                          name={
                            followupModalOpen === 'payment_pending'
                              ? 'card-outline'
                              : (followupModalOpen === 'opted' ? 'repeat-outline' : 'person-outline')
                          }
                          size={36}
                          color={followupModalOpen === 'payment_pending' ? '#ef4444' : '#cbd5e1'}
                          style={{ marginBottom: 8 }}
                        />
                        <Text style={{ fontSize: 14, fontWeight: '700', color: '#64748b' }}>No Patients Found</Text>
                        <Text style={{ fontSize: 12, color: '#94a3b8', marginTop: 2, textAlign: 'center' }}>
                          {followupSearchTerm
                            ? 'No matching patients for search.'
                            : (followupModalOpen === 'payment_pending'
                              ? 'No patients pending fee collection for this date.'
                              : 'None recorded for this date.')}
                        </Text>
                      </View>
                    );
                  }

                  return targetList.map((app, idx) => {
                    const pName = app.patientName || app.name || 'Patient';
                    const pPhone = app.phone || app.phoneNumber || 'N/A';
                    const pRegId = app.regId || 'N/A';
                    const pDoc = app.doctor || app.doctorName || 'Doctor';
                    const pBranch = app.branch || 'Branch';
                    const pTime = app.timeSlot || app.time || 'Scheduled';
                    const pStatus = app.status || 'waiting';
                    const followDate = app.preferredFollowUpDate || app.followUpDate;
                    const followInterval = app.followUpInterval;

                    const numPharm = Number(app.pharmacyFee) || 0;
                    const numDiet = Number(app.dietFee || app.dietFeeAmount || app.dietPlan?.dietFeeAmount || app.dietPlan?.dietFee) || 0;
                    const totalDue = app.totalAmount || (numPharm + numDiet > 0 ? (numPharm + numDiet) : null);

                    return (
                      <View key={app.id || idx} style={styles.followupPatientItem}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <View style={{ flex: 1, marginRight: 8 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <Text style={styles.followupPName}>{pName}</Text>
                              <View style={styles.followupPRegBadge}>
                                <Text style={styles.followupPRegText}>{pRegId}</Text>
                              </View>
                            </View>
                            <Text style={styles.followupPPhone}>📱 +91 {pPhone}</Text>
                            <Text style={styles.followupPDoctor}>👨‍⚕️ {pDoc} • {pBranch}</Text>
                          </View>

                          {/* WhatsApp button */}
                          {pPhone && pPhone !== 'N/A' && (
                            <TouchableOpacity
                              style={styles.followupWaBtn}
                              onPress={() => handleWhatsApp(pPhone, pName)}
                            >
                              <Ionicons name="logo-whatsapp" size={16} color="#ffffff" />
                            </TouchableOpacity>
                          )}
                        </View>

                        {/* Info Badge */}
                        <View style={{ marginTop: 8, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#f1f5f9' }}>
                          {followupModalOpen === 'payment_pending' ? (
                            <View style={[styles.followupNotOptedBadgeBox, { backgroundColor: '#fef2f2', borderColor: '#fecaca' }]}>
                              <Text style={[styles.followupNotOptedBadgeText, { color: '#dc2626', fontWeight: '800' }]}>
                                {totalDue ? `Fee Due: ₹${totalDue}` : 'Fee Collection Pending ⏳'}
                              </Text>
                              <Text style={{ fontSize: 11, color: '#7f1d1d', marginTop: 1, fontWeight: '600' }}>
                                {numPharm > 0 && numDiet > 0
                                  ? `Rx: ₹${numPharm} + Diet: ₹${numDiet}`
                                  : (numPharm > 0 ? `Prescription: ₹${numPharm}` : (numDiet > 0 ? `Diet Fee: ₹${numDiet}` : 'Awaiting Reception Collection'))}
                              </Text>
                            </View>
                          ) : followupModalOpen === 'opted' ? (
                            <View style={styles.followupOptedBadgeBox}>
                              <Text style={styles.followupOptedBadgeText}>
                                📅 {followDate ? `Follow-up: ${followDate}` : (followInterval || 'Follow-up Opted')}
                              </Text>
                              {!!(followInterval && followDate) && (
                                <Text style={styles.followupIntervalSub}>
                                  Interval: {followInterval}
                                </Text>
                              )}
                            </View>
                          ) : (
                            <View style={styles.followupNotOptedBadgeBox}>
                              <Text style={styles.followupNotOptedBadgeText}>
                                No Follow-up Added • Slot: {pTime} ({pStatus})
                              </Text>
                            </View>
                          )}
                        </View>

                        {/* Collect Fee & Billing Direct Button (Payment Pending Only) */}
                        {followupModalOpen === 'payment_pending' && (
                          <TouchableOpacity
                            style={{
                              marginTop: 8,
                              backgroundColor: '#16a34a',
                              paddingVertical: 8,
                              paddingHorizontal: 12,
                              borderRadius: 8,
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 6
                            }}
                            onPress={() => {
                              setFollowupModalOpen(null);
                              handleOpenCheckout(app);
                            }}
                          >
                            <Ionicons name="card-outline" size={15} color="#ffffff" />
                            <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '800' }}>
                              Collect Fee & Billing ➔
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  });
                })()}
              </ScrollView>

              {/* Close Button Footer */}
              <TouchableOpacity
                style={styles.followupDoneBtn}
                onPress={() => setFollowupModalOpen(null)}
              >
                <Text style={styles.followupDoneBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {/* 5. Delete Appointment Confirmation Modal (Popup Before Delete!) */}
      {deleteConfirmApp && (
        <Modal
          visible={!!deleteConfirmApp}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setDeleteConfirmApp(null)}
        >
          <View style={{
            flex: 1,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 16
          }}>
            <View style={{
              backgroundColor: '#ffffff',
              borderRadius: 20,
              width: '100%',
              maxWidth: 420,
              overflow: 'hidden',
              elevation: 10,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.2,
              shadowRadius: 16
            }}>
              {/* Modal Header */}
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 20,
                paddingVertical: 16,
                backgroundColor: '#fef2f2',
                borderBottomWidth: 1,
                borderBottomColor: '#fee2e2'
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    backgroundColor: '#fee2e2',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <Ionicons name="trash-outline" size={20} color="#dc2626" />
                  </View>
                  <View>
                    <Text style={{ fontSize: 15, fontWeight: '800', color: '#991b1b' }}>
                      Confirm Deletion
                    </Text>
                    <Text style={{ fontSize: 11, color: '#b91c1c' }}>
                      24-hour recovery protection
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  onPress={() => setDeleteConfirmApp(null)}
                  style={{ padding: 4 }}
                >
                  <Ionicons name="close" size={20} color="#94a3b8" />
                </TouchableOpacity>
              </View>

              {/* Modal Body */}
              <View style={{ padding: 20 }}>
                <Text style={{ fontSize: 13.5, color: '#334155', lineHeight: 20, marginBottom: 14 }}>
                  Are you sure you want to delete the appointment for{' '}
                  <Text style={{ fontWeight: '800', color: '#0f172a' }}>
                    {deleteConfirmApp.patientName || deleteConfirmApp.fullName || deleteConfirmApp.name || 'this patient'}
                  </Text>?
                </Text>

                {/* Details preview card */}
                <View style={{
                  backgroundColor: '#f8fafc',
                  borderWidth: 1,
                  borderColor: '#e2e8f0',
                  borderRadius: 12,
                  padding: 12,
                  marginBottom: 14,
                  gap: 6
                }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 12, color: '#64748b' }}>Doctor:</Text>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#0f172a' }}>
                      {deleteConfirmApp.doctorName || deleteConfirmApp.doctor || 'Assigned Doctor'}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 12, color: '#64748b' }}>Date & Time:</Text>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#0f172a' }}>
                      {deleteConfirmApp.appointmentDate || deleteConfirmApp.date || selectedDate} • {deleteConfirmApp.appointmentTime || deleteConfirmApp.time || '10:00 AM'}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 12, color: '#64748b' }}>Branch:</Text>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: '#334155' }}>
                      {deleteConfirmApp.branch || deleteConfirmApp.branchName || selectedDashboardBranch || 'KPHB Branch'}
                    </Text>
                  </View>
                </View>

                {/* 24-Hour Recovery Notice Box */}
                <View style={{
                  backgroundColor: '#f0f9ff',
                  borderWidth: 1,
                  borderColor: '#bae6fd',
                  borderRadius: 12,
                  padding: 12,
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  gap: 8
                }}>
                  <Ionicons name="refresh-outline" size={17} color="#0284c7" style={{ marginTop: 2 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 11.5, fontWeight: '800', color: '#0284c7', marginBottom: 2 }}>
                      Restorable for Up to 24 Hours
                    </Text>
                    <Text style={{ fontSize: 11, color: '#0369a1', lineHeight: 16 }}>
                      This appointment will be moved to the Recycle Bin. You can restore it back to the queue anytime within 24 hours using the Restore (24h) button.
                    </Text>
                  </View>
                </View>
              </View>

              {/* Modal Footer */}
              <View style={{
                flexDirection: 'row',
                justifyContent: 'flex-end',
                gap: 10,
                paddingHorizontal: 20,
                paddingVertical: 14,
                backgroundColor: '#f8fafc',
                borderTopWidth: 1,
                borderTopColor: '#f1f5f9'
              }}>
                <TouchableOpacity
                  onPress={() => setDeleteConfirmApp(null)}
                  disabled={isDeletingApp}
                  style={{
                    paddingVertical: 9,
                    paddingHorizontal: 16,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                    backgroundColor: '#ffffff'
                  }}
                >
                  <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#475569' }}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleConfirmDeleteAppointment}
                  disabled={isDeletingApp}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    paddingVertical: 9,
                    paddingHorizontal: 18,
                    borderRadius: 10,
                    backgroundColor: '#dc2626'
                  }}
                >
                  {isDeletingApp ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Ionicons name="trash" size={14} color="#ffffff" />
                  )}
                  <Text style={{ fontSize: 12.5, fontWeight: '800', color: '#ffffff' }}>
                    {isDeletingApp ? 'Deleting...' : 'Delete Appointment'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* 6. Restore Appointments Modal (24h Retention) */}
      {restoreModalOpen && (
        <Modal
          visible={restoreModalOpen}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setRestoreModalOpen(false)}
        >
          <View style={{
            flex: 1,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 16
          }}>
            <View style={{
              backgroundColor: '#ffffff',
              borderRadius: 20,
              width: '100%',
              maxWidth: 540,
              maxHeight: '85%',
              overflow: 'hidden',
              elevation: 10,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.2,
              shadowRadius: 16
            }}>
              {/* Modal Header */}
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 20,
                paddingVertical: 16,
                backgroundColor: '#f8fafc',
                borderBottomWidth: 1,
                borderBottomColor: '#e2e8f0'
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{
                    width: 38,
                    height: 38,
                    borderRadius: 12,
                    backgroundColor: '#e0f2fe',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <Ionicons name="refresh-outline" size={20} color="#0284c7" />
                  </View>
                  <View>
                    <Text style={{ fontSize: 15.5, fontWeight: '800', color: '#0f172a' }}>
                      Restore Appointments (24h)
                    </Text>
                    <Text style={{ fontSize: 11.5, color: '#64748b' }}>
                      Deleted in last 24h for {selectedDashboardBranch || 'Branch'}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  onPress={() => setRestoreModalOpen(false)}
                  style={{ padding: 4 }}
                >
                  <Ionicons name="close" size={22} color="#94a3b8" />
                </TouchableOpacity>
              </View>

              {/* Modal Body / List */}
              <ScrollView style={{ padding: 18, maxHeight: 420 }}>
                {deleted24hList.length === 0 ? (
                  <View style={{ paddingVertical: 40, alignItems: 'center', gap: 10 }}>
                    <View style={{
                      width: 50,
                      height: 50,
                      borderRadius: 25,
                      backgroundColor: '#f0fdf4',
                      borderWidth: 1,
                      borderColor: '#bbf7d0',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <Ionicons name="checkmark-circle-outline" size={26} color="#16a34a" />
                    </View>
                    <Text style={{ fontSize: 14.5, fontWeight: '800', color: '#1e293b' }}>
                      Recycle Bin is Empty
                    </Text>
                    <Text style={{ fontSize: 12, color: '#64748b', textAlign: 'center', maxWidth: 280 }}>
                      No appointments were deleted in the last 24 hours for {selectedDashboardBranch || 'this branch'}.
                    </Text>
                  </View>
                ) : (
                  <View style={{ gap: 10, paddingBottom: 10 }}>
                    <Text style={{ fontSize: 11.5, fontWeight: '600', color: '#64748b', marginBottom: 2 }}>
                      Found <Text style={{ fontWeight: '800', color: '#0f172a' }}>{deleted24hList.length}</Text> deleted appointment{deleted24hList.length !== 1 ? 's' : ''} restorable back to active queue:
                    </Text>

                    {deleted24hList.map((delApp) => {
                      const dTime = delApp.deletedAt ? new Date(delApp.deletedAt).getTime() : 0;
                      const diffMs = Date.now() - dTime;
                      const elapsedMins = Math.max(1, Math.floor(diffMs / (1000 * 60)));
                      const elapsedHours = Math.floor(elapsedMins / 60);
                      const elapsedStr = elapsedHours > 0 ? `${elapsedHours}h ${elapsedMins % 60}m ago` : `${elapsedMins}m ago`;

                      const remainingMs = Math.max(0, 24 * 60 * 60 * 1000 - diffMs);
                      const remHours = Math.floor(remainingMs / (1000 * 60 * 60));
                      const remMins = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
                      const remainingStr = remHours > 0 ? `${remHours}h ${remMins}m left` : `${remMins}m left`;

                      const isRestoring = isRestoringId === delApp.id;

                      return (
                        <View
                          key={delApp.id}
                          style={{
                            backgroundColor: '#ffffff',
                            borderWidth: 1,
                            borderColor: '#e2e8f0',
                            borderRadius: 14,
                            padding: 14,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 12
                          }}
                        >
                          <View style={{ flex: 1, gap: 3 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={{ fontSize: 13.5, fontWeight: '800', color: '#0f172a' }}>
                                {delApp.patientName || delApp.fullName || delApp.name || 'Patient'}
                              </Text>
                              <View style={{
                                backgroundColor: '#fef2f2',
                                borderWidth: 1,
                                borderColor: '#fecaca',
                                paddingHorizontal: 5,
                                paddingVertical: 1,
                                borderRadius: 4
                              }}>
                                <Text style={{ fontSize: 9.5, fontWeight: '800', color: '#dc2626' }}>DELETED</Text>
                              </View>
                            </View>

                            <Text style={{ fontSize: 11.5, color: '#64748b' }}>
                              {delApp.phoneNumber || delApp.phone || 'No phone'} • <Text style={{ color: '#0284c7', fontWeight: '700' }}>{delApp.registrationId || delApp.regId || 'N/A'}</Text>
                            </Text>

                            <Text style={{ fontSize: 11.5, color: '#334155' }}>
                              👨‍⚕️ {delApp.doctorName || delApp.doctor || 'Doctor'} • 📅 {delApp.appointmentDate || delApp.date || 'N/A'} at {delApp.appointmentTime || delApp.time || '10:00 AM'}
                            </Text>

                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 }}>
                              <Text style={{ fontSize: 10.5, color: '#94a3b8' }}>
                                Deleted: <Text style={{ color: '#475569', fontWeight: '700' }}>{elapsedStr}</Text>
                              </Text>
                              <View style={{ backgroundColor: '#fffbeb', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
                                <Text style={{ fontSize: 10.5, color: '#d97706', fontWeight: '700' }}>
                                  ⏳ {remainingStr}
                                </Text>
                              </View>
                            </View>
                          </View>

                          <TouchableOpacity
                            onPress={() => handleRestoreAppointment(delApp)}
                            disabled={isRestoring}
                            style={{
                              backgroundColor: isRestoring ? '#94a3b8' : '#0284c7',
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 5,
                              paddingVertical: 8,
                              paddingHorizontal: 14,
                              borderRadius: 10
                            }}
                          >
                            {isRestoring ? (
                              <ActivityIndicator size="small" color="#ffffff" />
                            ) : (
                              <Ionicons name="refresh-outline" size={14} color="#ffffff" />
                            )}
                            <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '800' }}>
                              {isRestoring ? '...' : 'Restore'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                  </View>
                )}
              </ScrollView>

              {/* Modal Footer */}
              <View style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingHorizontal: 20,
                paddingVertical: 12,
                backgroundColor: '#f8fafc',
                borderTopWidth: 1,
                borderTopColor: '#e2e8f0'
              }}>
                <Text style={{ fontSize: 11, color: '#64748b', flex: 1 }}>
                  Restores appointment back to queue.
                </Text>
                <TouchableOpacity
                  onPress={() => setRestoreModalOpen(false)}
                  style={{
                    paddingVertical: 7,
                    paddingHorizontal: 16,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: '#cbd5e1',
                    backgroundColor: '#ffffff'
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569' }}>Close</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 8,
  },
  overviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 10,
  },
  overviewTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#16a34a',
  },
  liveText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#16a34a',
    letterSpacing: 0.5,
  },
  todayFilterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  todayFilterText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  metricsRowSecond: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 14,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 2,
    alignItems: 'center',
    borderTopWidth: 3,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  metricCardWide: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 2,
    alignItems: 'center',
    borderTopWidth: 3,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  metricNum: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 1,
  },
  metricLabel: {
    fontSize: 8.5,
    color: '#64748b',
    fontWeight: '700',
    textAlign: 'center',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
  },
  countBadge: {
    backgroundColor: '#eef5fc',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(37, 142, 200, 0.2)',
  },
  countBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#258ec8',
  },
  patientCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#64748b',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  patientAvatarCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#e0f2fe',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  avatarText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#258ec8',
  },
  patientMainInfo: {
    flex: 1,
  },
  patientName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
  },
  patientMeta: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: '800',
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#f1f5f9',
    marginBottom: 6,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  detailText: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  emptyCardContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  emptyCardText: {
    fontSize: 12.5,
    color: '#64748b',
    fontWeight: '500',
    textAlign: 'center',
  },
  limeGreenBtn: {
    backgroundColor: '#258ec8',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    marginTop: 12,
    shadowColor: '#258ec8',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  limeGreenBtnText: {
    color: '#ffffff',
    fontWeight: '800',
    fontSize: 13,
  },
  emptyCardSimple: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
  },
  quickDateBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#bae6fd',
    backgroundColor: '#e0f2fe',
  },
  quickDateBtnActive: {
    backgroundColor: '#258ec8',
    borderColor: '#0284c7',
  },
  quickDateText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#0284c7',
  },
  quickDateTextActive: {
    color: '#ffffff',
  },
  arrowIconBtn: {
    padding: 5,
    backgroundColor: '#258ec8',
    borderWidth: 1,
    borderColor: '#1d709e',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  callIconBtn: {
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  waIconBtn: {
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteIconBtn: {
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rescheduleIconBtn: {
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 4,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  inputText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a',
    padding: 0,
  },
  slotChip: {
    width: '31%',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotChipActive: {
    backgroundColor: '#258ec8',
    borderColor: '#0284c7',
  },
  slotChipFull: {
    backgroundColor: '#f1f5f9',
    borderColor: '#e2e8f0',
    opacity: 0.6,
  },
  slotChipTime: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0f172a',
  },
  slotChipTimeActive: {
    color: '#ffffff',
  },
  slotChipTimeFull: {
    color: '#94a3b8',
  },
  dropdownSelectorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 4,
  },
  dropdownOptionsContainer: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    marginTop: 4,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  dropdownOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  dropdownOptionRowActive: {
    backgroundColor: '#f0f9ff',
  },
  dropdownOptionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  capacityBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    marginTop: 2,
  },
  capacityBadgeText: {
    fontSize: 9,
    fontWeight: '800',
  },
  followupModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  followupModalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    width: '100%',
    maxWidth: 440,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  followupModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  followupModalIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  followupModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  followupModalSubtitle: {
    fontSize: 11.5,
    color: '#64748b',
    marginTop: 1,
  },
  followupCountBadge: {
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: 10,
  },
  followupCountBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#ffffff',
  },
  followupCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  followupSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 12,
  },
  followupSearchInput: {
    flex: 1,
    fontSize: 12.5,
    color: '#0f172a',
    padding: 0,
  },
  followupPatientItem: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  followupPName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
  },
  followupPRegBadge: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  followupPRegText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#258ec8',
  },
  followupPPhone: {
    fontSize: 12,
    color: '#475569',
    marginTop: 2,
  },
  followupPDoctor: {
    fontSize: 11.5,
    color: '#64748b',
    marginTop: 2,
  },
  followupWaBtn: {
    backgroundColor: '#22c55e',
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  followupOptedBadgeBox: {
    backgroundColor: '#eff6ff',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  followupOptedBadgeText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#1d4ed8',
  },
  followupIntervalSub: {
    fontSize: 10.5,
    color: '#3b82f6',
    marginTop: 1,
  },
  followupNotOptedBadgeBox: {
    backgroundColor: '#fef2f2',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  followupNotOptedBadgeText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#dc2626',
  },
  followupDoneBtn: {
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  followupDoneBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
});
