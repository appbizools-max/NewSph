import React, { useState, useEffect, useMemo, useCallback, useRef, memo } from 'react';
import { StyleSheet, Text, View, ScrollView, TextInput, TouchableOpacity, Modal, Alert, BackHandler, Keyboard, InteractionManager, ActivityIndicator } from 'react-native';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createDocument, sendBookingWhatsAppNotification, sendBookingSMS, sanitizeDoctorName } from '@app/shared';
import {
  getSafeDb, collection, onSnapshot, addDoc, setDoc, deleteDoc, doc, getDoc, query, where, limit, getDocs
} from '../../../utils/firebaseSafe';
import { AppointmentPaymentModal } from '../../../components/AppointmentPaymentModal';
import { generateRegistrationId, getBranchShortcut } from '../../../utils/idGenerator';
import { receptionDataStore } from '../../../utils/receptionDataStore';
import { getPatientVisitState } from '../../../utils/patientVisitState';
import { createBookingNotificationInFirestore } from '../../../utils/fcmService';
import {
  DoctorNoShowOverride,
  getActiveDoctorNoShow,
  filterSlotsByNoShow,
  normalizeToISODate,
  getCanonicalDoctorName
} from '../DoctorNoShow/doctorRosterHelper';

export const CLINIC_BRANCHES = [
  'KPHB Branch',
  'Nallagandla Branch',
  'Dilshuknagar Branch',
  'Chandanagar Branch',
];

export const normalizeToClinicBranch = (branch?: string): string => {
  if (!branch) return 'KPHB Branch';
  const norm = String(branch).toLowerCase();
  if (norm.includes('kphb') || norm.includes('kukatpally')) return 'KPHB Branch';
  if (norm.includes('nalla') || norm.includes('nallagandla')) return 'Nallagandla Branch';
  if (norm.includes('dilshuk') || norm.includes('dilsukh') || norm.includes('dsnr')) return 'Dilshuknagar Branch';
  if (norm.includes('chanda') || norm.includes('chnr') || norm.includes('chandanagar')) return 'Chandanagar Branch';
  return 'KPHB Branch';
};

const COLORS = {
  primary: '#0284c7',
  secondary: '#0284c7',
  text: '#0f172a'
};
let GLOBAL_MOBILE_PATIENTS_CACHE: any[] = [];
let GLOBAL_MOBILE_ALLPATIENTS_CACHE: any[] = [];
let GLOBAL_MOBILE_APPTS_CACHE: any[] = [];
const STORAGE_PATIENTS_KEY = '@sph_patients_cache_v2';
const STORAGE_APPTS_KEY = '@sph_appts_cache_v2';

interface BookAppointmentScreenProps {
  currentBranch?: string;
  userRole?: string;
  onNavigate?: (tab: string, patientData?: any) => void;
  onBack?: () => void;
  isRebackMode?: boolean;
  initialPatient?: any;
  isActive?: boolean;
}

interface TimeSlot {
  startHour: string;
  startMinute: string;
  startAmPm: 'AM' | 'PM';
  endHour: string;
  endMinute: string;
  endAmPm: 'AM' | 'PM';
}

// Top-level time conversion helpers
const parseTimeToMinutes = (hourStr: string, minStr: string, ampm: 'AM' | 'PM'): number => {
  let h = parseInt(hourStr, 10);
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

type DayName = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';

interface DaySchedule {
  status: 'Available' | 'Closed';
  slots: TimeSlot[];
}

interface BranchSchedule {
  id: string;
  targetBranch: string;
  selectedDay: DayName;
  daySchedules: Record<DayName, DaySchedule>;
}

interface Doctor {
  id: string;
  name: string;
  phone: string;
  role: string;
  branchSchedules?: BranchSchedule[];
}

export const DEFAULT_DOCTORS_SEED: Doctor[] = [
  {
    id: 'doc-1',
    name: 'Dr. Prashanth K Vaidya',
    phone: '8125260176',
    role: 'Homeopathy Physician',
    branchSchedules: [
      {
        id: 'bs-1-kphb',
        targetBranch: 'KPHB Branch',
        selectedDay: 'Mon',
        daySchedules: {
          Mon: { status: 'Available', slots: [{ startHour: '12', startMinute: '30', startAmPm: 'PM', endHour: '02', endMinute: '00', endAmPm: 'PM' }, { startHour: '05', startMinute: '00', startAmPm: 'PM', endHour: '07', endMinute: '00', endAmPm: 'PM' }] },
          Tue: { status: 'Closed', slots: [] },
          Wed: { status: 'Available', slots: [{ startHour: '12', startMinute: '30', startAmPm: 'PM', endHour: '02', endMinute: '00', endAmPm: 'PM' }, { startHour: '05', startMinute: '00', startAmPm: 'PM', endHour: '07', endMinute: '00', endAmPm: 'PM' }] },
          Thu: { status: 'Closed', slots: [] },
          Fri: { status: 'Available', slots: [{ startHour: '12', startMinute: '30', startAmPm: 'PM', endHour: '02', endMinute: '00', endAmPm: 'PM' }, { startHour: '05', startMinute: '00', startAmPm: 'PM', endHour: '07', endMinute: '00', endAmPm: 'PM' }] },
          Sat: { status: 'Available', slots: [{ startHour: '12', startMinute: '30', startAmPm: 'PM', endHour: '02', endMinute: '00', endAmPm: 'PM' }, { startHour: '05', startMinute: '00', startAmPm: 'PM', endHour: '07', endMinute: '00', endAmPm: 'PM' }] },
          Sun: { status: 'Closed', slots: [] }
        }
      },
      {
        id: 'bs-1-chanda',
        targetBranch: 'Chandanagar Branch',
        selectedDay: 'Mon',
        daySchedules: {
          Mon: { status: 'Available', slots: [{ startHour: '10', startMinute: '00', startAmPm: 'AM', endHour: '12', endMinute: '00', endAmPm: 'PM' }, { startHour: '08', startMinute: '00', startAmPm: 'PM', endHour: '10', endMinute: '30', endAmPm: 'PM' }] },
          Tue: { status: 'Closed', slots: [] },
          Wed: { status: 'Available', slots: [{ startHour: '10', startMinute: '00', startAmPm: 'AM', endHour: '12', endMinute: '00', endAmPm: 'PM' }, { startHour: '08', startMinute: '00', startAmPm: 'PM', endHour: '10', endMinute: '30', endAmPm: 'PM' }] },
          Thu: { status: 'Closed', slots: [] },
          Fri: { status: 'Available', slots: [{ startHour: '10', startMinute: '00', startAmPm: 'AM', endHour: '12', endMinute: '00', endAmPm: 'PM' }, { startHour: '08', startMinute: '00', startAmPm: 'PM', endHour: '10', endMinute: '30', endAmPm: 'PM' }] },
          Sat: { status: 'Available', slots: [{ startHour: '10', startMinute: '00', startAmPm: 'AM', endHour: '12', endMinute: '00', endAmPm: 'PM' }, { startHour: '08', startMinute: '00', startAmPm: 'PM', endHour: '10', endMinute: '30', endAmPm: 'PM' }] },
          Sun: { status: 'Available', slots: [{ startHour: '11', startMinute: '00', startAmPm: 'AM', endHour: '01', endMinute: '00', endAmPm: 'PM' }] }
        }
      },
      {
        id: 'bs-1-nalla',
        targetBranch: 'Nallagandla Branch',
        selectedDay: 'Thu',
        daySchedules: {
          Mon: { status: 'Closed', slots: [] },
          Tue: { status: 'Closed', slots: [] },
          Wed: { status: 'Closed', slots: [] },
          Thu: { status: 'Available', slots: [{ startHour: '11', startMinute: '00', startAmPm: 'AM', endHour: '02', endMinute: '00', endAmPm: 'PM' }, { startHour: '06', startMinute: '00', startAmPm: 'PM', endHour: '10', endMinute: '00', endAmPm: 'PM' }] },
          Fri: { status: 'Closed', slots: [] },
          Sat: { status: 'Closed', slots: [] },
          Sun: { status: 'Available', slots: [{ startHour: '06', startMinute: '00', startAmPm: 'PM', endHour: '11', endMinute: '00', endAmPm: 'PM' }] }
        }
      }
    ]
  },
  {
    id: 'doc-2',
    name: 'Dr. Jobeadh parveej',
    phone: '9903119766',
    role: 'Homeopathy Physician',
    branchSchedules: [
      {
        id: 'bs-2-nalla',
        targetBranch: 'Nallagandla Branch',
        selectedDay: 'Mon',
        daySchedules: {
          Mon: { status: 'Available', slots: [{ startHour: '11', startMinute: '00', startAmPm: 'AM', endHour: '01', endMinute: '00', endAmPm: 'PM' }, { startHour: '06', startMinute: '00', startAmPm: 'PM', endHour: '07', endMinute: '30', endAmPm: 'PM' }] },
          Tue: { status: 'Closed', slots: [] },
          Wed: { status: 'Closed', slots: [] },
          Thu: { status: 'Closed', slots: [] },
          Fri: { status: 'Closed', slots: [] },
          Sat: { status: 'Closed', slots: [] },
          Sun: { status: 'Closed', slots: [] }
        }
      },
      {
        id: 'bs-2-kphb',
        targetBranch: 'KPHB Branch',
        selectedDay: 'Tue',
        daySchedules: {
          Mon: { status: 'Closed', slots: [] },
          Tue: { status: 'Available', slots: [{ startHour: '12', startMinute: '30', startAmPm: 'PM', endHour: '02', endMinute: '00', endAmPm: 'PM' }] },
          Wed: { status: 'Available', slots: [{ startHour: '12', startMinute: '30', startAmPm: 'PM', endHour: '02', endMinute: '00', endAmPm: 'PM' }] },
          Thu: { status: 'Closed', slots: [] },
          Fri: { status: 'Available', slots: [{ startHour: '12', startMinute: '30', startAmPm: 'PM', endHour: '02', endMinute: '00', endAmPm: 'PM' }] },
          Sat: { status: 'Available', slots: [{ startHour: '12', startMinute: '30', startAmPm: 'PM', endHour: '02', endMinute: '00', endAmPm: 'PM' }, { startHour: '05', startMinute: '00', startAmPm: 'PM', endHour: '07', endMinute: '00', endAmPm: 'PM' }] },
          Sun: { status: 'Closed', slots: [] }
        }
      }
    ]
  },
  {
    id: 'doc-3',
    name: 'Dr. Padma priya',
    phone: '9490808582',
    role: 'Homeopathy Physician',
    branchSchedules: [
      {
        id: 'bs-3-nalla',
        targetBranch: 'Nallagandla Branch',
        selectedDay: 'Tue',
        daySchedules: {
          Mon: { status: 'Closed', slots: [] },
          Tue: { status: 'Available', slots: [{ startHour: '10', startMinute: '00', startAmPm: 'AM', endHour: '08', endMinute: '00', endAmPm: 'PM' }] },
          Wed: { status: 'Available', slots: [{ startHour: '10', startMinute: '00', startAmPm: 'AM', endHour: '08', endMinute: '00', endAmPm: 'PM' }] },
          Thu: { status: 'Closed', slots: [] },
          Fri: { status: 'Closed', slots: [] },
          Sat: { status: 'Closed', slots: [] },
          Sun: { status: 'Available', slots: [{ startHour: '10', startMinute: '00', startAmPm: 'AM', endHour: '05', endMinute: '00', endAmPm: 'PM' }] }
        }
      },
      {
        id: 'bs-3-chanda',
        targetBranch: 'Chandanagar Branch',
        selectedDay: 'Mon',
        daySchedules: {
          Mon: { status: 'Available', slots: [{ startHour: '12', startMinute: '00', startAmPm: 'PM', endHour: '08', endMinute: '00', endAmPm: 'PM' }] },
          Tue: { status: 'Closed', slots: [] },
          Wed: { status: 'Closed', slots: [] },
          Thu: { status: 'Available', slots: [{ startHour: '10', startMinute: '00', startAmPm: 'AM', endHour: '08', endMinute: '00', endAmPm: 'PM' }] },
          Fri: { status: 'Available', slots: [{ startHour: '12', startMinute: '00', startAmPm: 'PM', endHour: '08', endMinute: '00', endAmPm: 'PM' }] },
          Sat: { status: 'Closed', slots: [] },
          Sun: { status: 'Available', slots: [{ startHour: '05', startMinute: '30', startAmPm: 'PM', endHour: '08', endMinute: '00', endAmPm: 'PM' }] }
        }
      }
    ]
  },
  {
    id: 'doc-4',
    name: 'Dr. Ramakrishna Chanduri',
    phone: '1111111111',
    role: 'Homeopathy Physician',
    branchSchedules: [
      {
        id: 'bs-4-dsnr',
        targetBranch: 'Dilshuknagar Branch',
        selectedDay: 'Mon',
        daySchedules: {
          Mon: { status: 'Available', slots: [{ startHour: '10', startMinute: '00', startAmPm: 'AM', endHour: '02', endMinute: '00', endAmPm: 'PM' }, { startHour: '05', startMinute: '00', startAmPm: 'PM', endHour: '09', endMinute: '00', endAmPm: 'PM' }] },
          Tue: { status: 'Available', slots: [{ startHour: '10', startMinute: '00', startAmPm: 'AM', endHour: '02', endMinute: '00', endAmPm: 'PM' }, { startHour: '05', startMinute: '00', startAmPm: 'PM', endHour: '09', endMinute: '00', endAmPm: 'PM' }] },
          Wed: { status: 'Available', slots: [{ startHour: '10', startMinute: '00', startAmPm: 'AM', endHour: '02', endMinute: '00', endAmPm: 'PM' }, { startHour: '05', startMinute: '00', startAmPm: 'PM', endHour: '09', endMinute: '00', endAmPm: 'PM' }] },
          Thu: { status: 'Available', slots: [{ startHour: '10', startMinute: '00', startAmPm: 'AM', endHour: '02', endMinute: '00', endAmPm: 'PM' }, { startHour: '05', startMinute: '00', startAmPm: 'PM', endHour: '09', endMinute: '00', endAmPm: 'PM' }] },
          Fri: { status: 'Closed', slots: [] },
          Sat: { status: 'Closed', slots: [] },
          Sun: { status: 'Available', slots: [{ startHour: '10', startMinute: '00', startAmPm: 'AM', endHour: '02', endMinute: '00', endAmPm: 'PM' }, { startHour: '05', startMinute: '00', startAmPm: 'PM', endHour: '09', endMinute: '00', endAmPm: 'PM' }] }
        }
      },
      {
        id: 'bs-4-nalla',
        targetBranch: 'Nallagandla Branch',
        selectedDay: 'Fri',
        daySchedules: {
          Mon: { status: 'Closed', slots: [] },
          Tue: { status: 'Closed', slots: [] },
          Wed: { status: 'Closed', slots: [] },
          Thu: { status: 'Closed', slots: [] },
          Fri: { status: 'Available', slots: [{ startHour: '10', startMinute: '30', startAmPm: 'AM', endHour: '02', endMinute: '30', endAmPm: 'PM' }, { startHour: '05', startMinute: '00', startAmPm: 'PM', endHour: '09', endMinute: '00', endAmPm: 'PM' }] },
          Sat: { status: 'Available', slots: [{ startHour: '10', startMinute: '30', startAmPm: 'AM', endHour: '02', endMinute: '30', endAmPm: 'PM' }, { startHour: '05', startMinute: '00', startAmPm: 'PM', endHour: '09', endMinute: '00', endAmPm: 'PM' }] },
          Sun: { status: 'Closed', slots: [] }
        }
      }
    ]
  }
];

let GLOBAL_MOBILE_DOCTORS_CACHE: Doctor[] = DEFAULT_DOCTORS_SEED;
let GLOBAL_MOBILE_NOSHOWS_CACHE: DoctorNoShowOverride[] = [];

interface AnalogClockModalProps {
  visible: boolean;
  onClose: () => void;
  selectedTimeSlot: string;
  onSelectTime: (timeStr: string) => void;
}

const AnalogClockModal: React.FC<AnalogClockModalProps> = ({
  visible,
  onClose,
  selectedTimeSlot,
  onSelectTime,
}) => {
  const [mode, setMode] = useState<'hours' | 'minutes'>('hours');
  const [selectedHour, setSelectedHour] = useState(10);
  const [selectedMinute, setSelectedMinute] = useState(0);
  const [ampm, setAmPm] = useState<'AM' | 'PM'>('AM');

  useEffect(() => {
    if (selectedTimeSlot) {
      const parts = selectedTimeSlot.trim().split(' ');
      if (parts.length === 2) {
        const [hStr, mStr] = parts[0].split(':');
        const h = parseInt(hStr, 10);
        const m = parseInt(mStr, 10);
        if (!isNaN(h)) setSelectedHour(h === 0 ? 12 : h > 12 ? h - 12 : h);
        if (!isNaN(m)) setSelectedMinute(m);
        setAmPm(parts[1].toUpperCase() === 'PM' ? 'PM' : 'AM');
      }
    }
  }, [selectedTimeSlot, visible]);

  const handleConfirm = () => {
    const formattedH = String(selectedHour).padStart(2, '0');
    const formattedM = String(selectedMinute).padStart(2, '0');
    const timeStr = `${formattedH}:${formattedM} ${ampm}`;
    onSelectTime(timeStr);
    onClose();
  };

  const getHourCoords = (h: number) => {
    const angle = (h * 30 - 90) * (Math.PI / 180);
    const r = 74;
    const cx = 100;
    const cy = 100;
    return {
      x: cx + r * Math.cos(angle) - 18,
      y: cy + r * Math.sin(angle) - 18,
      endX: cx + r * Math.cos(angle),
      endY: cy + r * Math.sin(angle),
    };
  };

  const getMinuteCoords = (m: number) => {
    const angle = (m * 6 - 90) * (Math.PI / 180);
    const r = 74;
    const cx = 100;
    const cy = 100;
    return {
      x: cx + r * Math.cos(angle) - 18,
      y: cy + r * Math.sin(angle) - 18,
      endX: cx + r * Math.cos(angle),
      endY: cy + r * Math.sin(angle),
    };
  };

  const hours = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  const minutes = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

  const activeHandCoords = mode === 'hours'
    ? getHourCoords(selectedHour)
    : getMinuteCoords(selectedMinute);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={{
        flex: 1,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20
      }}>
        <View style={{
          backgroundColor: '#ffffff',
          borderRadius: 24,
          width: '100%',
          maxWidth: 340,
          overflow: 'hidden',
          elevation: 10,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.2,
          shadowRadius: 16
        }}>
          {/* Header Display */}
          <View style={{
            backgroundColor: '#0284c7',
            paddingVertical: 18,
            paddingHorizontal: 20,
            alignItems: 'center'
          }}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: '#bae6fd', textTransform: 'uppercase', letterSpacing: 1 }}>
              Select Online Time
            </Text>

            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginVertical: 6 }}>
              <TouchableOpacity onPress={() => setMode('hours')}>
                <Text style={{
                  fontSize: 36,
                  fontWeight: '900',
                  color: mode === 'hours' ? '#ffffff' : '#93c5fd',
                  borderBottomWidth: mode === 'hours' ? 2 : 0,
                  borderBottomColor: '#ffffff'
                }}>
                  {String(selectedHour).padStart(2, '0')}
                </Text>
              </TouchableOpacity>

              <Text style={{ fontSize: 36, fontWeight: '900', color: '#ffffff' }}>:</Text>

              <TouchableOpacity onPress={() => setMode('minutes')}>
                <Text style={{
                  fontSize: 36,
                  fontWeight: '900',
                  color: mode === 'minutes' ? '#ffffff' : '#93c5fd',
                  borderBottomWidth: mode === 'minutes' ? 2 : 0,
                  borderBottomColor: '#ffffff'
                }}>
                  {String(selectedMinute).padStart(2, '0')}
                </Text>
              </TouchableOpacity>

              {/* AM/PM Switch */}
              <View style={{ marginLeft: 12, gap: 4 }}>
                <TouchableOpacity
                  onPress={() => setAmPm('AM')}
                  style={{
                    backgroundColor: ampm === 'AM' ? '#ffffff' : 'rgba(255,255,255,0.2)',
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    borderRadius: 6
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '900', color: ampm === 'AM' ? '#0284c7' : '#ffffff' }}>
                    AM
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setAmPm('PM')}
                  style={{
                    backgroundColor: ampm === 'PM' ? '#ffffff' : 'rgba(255,255,255,0.2)',
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    borderRadius: 6
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '900', color: ampm === 'PM' ? '#0284c7' : '#ffffff' }}>
                    PM
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Mode Switcher Pills */}
            <View style={{ flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 12, padding: 3, gap: 4 }}>
              <TouchableOpacity
                onPress={() => setMode('hours')}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 4,
                  borderRadius: 9,
                  backgroundColor: mode === 'hours' ? '#ffffff' : 'transparent'
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: '800', color: mode === 'hours' ? '#0284c7' : '#ffffff' }}>
                  HOURS
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setMode('minutes')}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 4,
                  borderRadius: 9,
                  backgroundColor: mode === 'minutes' ? '#ffffff' : 'transparent'
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: '800', color: mode === 'minutes' ? '#0284c7' : '#ffffff' }}>
                  MINUTES
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Analog Clock Face Body */}
          <View style={{ padding: 20, alignItems: 'center' }}>
            <View
              onStartShouldSetResponder={() => true}
              onMoveShouldSetResponder={() => true}
              onResponderGrant={(e) => {
                const { locationX, locationY } = e.nativeEvent;
                const dx = locationX - 100;
                const dy = locationY - 100;
                let angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
                if (angleDeg < 0) angleDeg += 360;

                if (mode === 'hours') {
                  let h = Math.round(angleDeg / 30);
                  if (h === 0) h = 12;
                  if (h > 12) h = 12;
                  setSelectedHour(h);
                  setMode('minutes');
                } else {
                  let m = Math.round(angleDeg / 6) % 60;
                  // Snap to nearest minute or 5 min step
                  setSelectedMinute(m);
                }
              }}
              onResponderMove={(e) => {
                const { locationX, locationY } = e.nativeEvent;
                const dx = locationX - 100;
                const dy = locationY - 100;
                let angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
                if (angleDeg < 0) angleDeg += 360;

                if (mode === 'hours') {
                  let h = Math.round(angleDeg / 30);
                  if (h === 0) h = 12;
                  if (h > 12) h = 12;
                  setSelectedHour(h);
                } else {
                  let m = Math.round(angleDeg / 6) % 60;
                  setSelectedMinute(m);
                }
              }}
              style={{
                width: 200,
                height: 200,
                borderRadius: 100,
                backgroundColor: '#f8fafc',
                borderWidth: 2,
                borderColor: '#e2e8f0',
                position: 'relative'
              }}
            >
              {/* Center Pivot Point */}
              <View style={{
                position: 'absolute',
                top: 96,
                left: 96,
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: '#0284c7',
                zIndex: 10
              }} />

              {/* Clock Hand Pointer */}
              <View
                style={{
                  position: 'absolute',
                  top: 100,
                  left: 100,
                  width: Math.sqrt(Math.pow(activeHandCoords.endX - 100, 2) + Math.pow(activeHandCoords.endY - 100, 2)),
                  height: 2,
                  backgroundColor: '#0284c7',
                  transformOrigin: '0% 50%',
                  transform: [{
                    rotate: `${Math.atan2(activeHandCoords.endY - 100, activeHandCoords.endX - 100)}rad`
                  }],
                  zIndex: 2
                }}
              />

              {/* Render Hours / Minutes Numbers Radially */}
              {mode === 'hours' ? (
                hours.map((h) => {
                  const coords = getHourCoords(h);
                  const isSelected = selectedHour === h;
                  return (
                    <TouchableOpacity
                      key={h}
                      onPress={() => {
                        setSelectedHour(h);
                        setMode('minutes');
                      }}
                      style={{
                        position: 'absolute',
                        left: coords.x,
                        top: coords.y,
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        backgroundColor: isSelected ? '#0284c7' : 'transparent',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 5
                      }}
                    >
                      <Text style={{
                        fontSize: 13,
                        fontWeight: isSelected ? '900' : '700',
                        color: isSelected ? '#ffffff' : '#334155'
                      }}>
                        {h}
                      </Text>
                    </TouchableOpacity>
                  );
                })
              ) : (
                minutes.map((m) => {
                  const coords = getMinuteCoords(m);
                  const isSelected = selectedMinute === m;
                  return (
                    <TouchableOpacity
                      key={m}
                      onPress={() => setSelectedMinute(m)}
                      style={{
                        position: 'absolute',
                        left: coords.x,
                        top: coords.y,
                        width: 36,
                        height: 36,
                        borderRadius: 18,
                        backgroundColor: isSelected ? '#0284c7' : 'transparent',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 5
                      }}
                    >
                      <Text style={{
                        fontSize: 11.5,
                        fontWeight: isSelected ? '900' : '700',
                        color: isSelected ? '#ffffff' : '#334155'
                      }}>
                        {String(m).padStart(2, '0')}
                      </Text>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>

            {/* Action Buttons */}
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 20, width: '100%' }}>
              <TouchableOpacity
                onPress={onClose}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 12,
                  backgroundColor: '#f1f5f9',
                  alignItems: 'center'
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#64748b' }}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleConfirm}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 12,
                  backgroundColor: '#0284c7',
                  alignItems: 'center'
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#ffffff' }}>OK / Set Time</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export const BookAppointmentScreen: React.FC<BookAppointmentScreenProps> = ({
  currentBranch = "Nallagandla",
  userRole,
  onNavigate,
  onBack,
  isRebackMode = false,
  initialPatient,
  isActive = true,
}) => {
  const isHR = userRole === 'hr' || userRole === 'admin' || currentBranch === 'All Branches' || currentBranch === 'HR' || currentBranch === 'Admin';
  const [selectedBranch, setSelectedBranch] = useState<string>(() => {
    if (isHR) return '';
    return normalizeToClinicBranch(currentBranch);
  });
  const [branchExpanded, setBranchExpanded] = useState(false);

  useEffect(() => {
    if (!isHR && currentBranch) {
      setSelectedBranch(normalizeToClinicBranch(currentBranch));
    }
  }, [currentBranch, isHR]);
  // Section 1: Patient Details
  const BOOK_APPT_DRAFT_KEY = '@sph_book_appointment_draft';
  const [draftRestored, setDraftRestored] = useState(false);
  const [patientSearchTerm, setPatientSearchTerm] = useState('');
  const [patientName, setPatientName] = useState('');
  const [diseases, setDiseases] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [emailAddress, setEmailAddress] = useState('');
  const [marketingSource, setMarketingSource] = useState('Select Source');
  const [consultationMode, setConsultationMode] = useState<'In-Clinic' | 'Online'>('In-Clinic');

  const [patientData, setPatientData] = useState<{
    phone: string;
    fullName: string;
    patientName: string;
    patientId: string;
    regID: string;
    registrationId?: string;
    source: string;
    patientType?: string;
    isNewPatient?: boolean;
    isExistingProfile?: boolean;
    homeBranch?: string;
    branchName?: string;
  }>({ phone: '', fullName: '', patientName: '', patientId: '', regID: '', registrationId: '', source: '', homeBranch: '', branchName: '' });
  // REBACK MODE STATES: Manual Registration ID & Duplicate ID Validation
  const [manualRegId, setManualRegId] = useState('');
  const [isCheckingRegId, setIsCheckingRegId] = useState(false);
  const [regIdError, setRegIdError] = useState('');
  const [regIdValid, setRegIdValid] = useState(false);
  const [foundProfileInfo, setFoundProfileInfo] = useState<{
    name: string;
    phone: string;
    branch?: string;
    regId: string;
    docId?: string;
  } | null>(null);
  const [showRegIdSuggestions, setShowRegIdSuggestions] = useState(false);

  // REBACK MODE DIRECT PAYMENT / COLLECT FEE MODAL STATES
  const [showRebackPaymentModal, setShowRebackPaymentModal] = useState(false);
  const [savedRebackPatientForPayment, setSavedRebackPatientForPayment] = useState<any>(null);

  // FETCH / LOOKUP PROFILE BY PROFILE ID OR REGISTRATION ID (Instant Cache + Firestore)
  const triggerProfileLookup = useCallback(async (inputVal: string) => {
    const rawVal = (inputVal || '').trim();
    const testId = rawVal.toUpperCase();
    if (!testId || testId.length < 2) return;

    setIsCheckingRegId(true);
    setRegIdError('');

    try {
      const cleanDigits = rawVal.replace(/\D/g, '').slice(-10);
      const is10DigitPhone = cleanDigits.length === 10;
      const normTest = testId.replace(/[\s\-\/\.]/g, '');

      const isMatch = (item: any, docId?: string) => {
        if (!item) return false;
        // Direct match against all possible ID attributes
        const candidates = [
          item.registrationId,
          item.regId,
          item.regID,
          item.regNo,
          item.patientId,
          item.patient_id,
          item.registration_id,
          item.uhid,
          item.customId,
          item.custom_id,
          item.opdNumber,
          item.opdNo,
          item.mrn,
          item.id,
          docId
        ];
        for (const candidate of candidates) {
          if (!candidate) continue;
          const s = String(candidate).trim();
          if (s.toUpperCase() === testId) return true;
          // Normalized match (ignore dashes, slashes, spaces)
          const normCandidate = s.toUpperCase().replace(/[\s\-\/\.]/g, '');
          if (normCandidate && normTest && normCandidate === normTest) return true;
        }

        // Match by phone number if entered 10 digits
        if (is10DigitPhone) {
          const itemPhone = String(item.phone || item.phoneNumber || item.mobile || item.patientPhone || '').replace(/\D/g, '').slice(-10);
          if (itemPhone === cleanDigits) return true;
        }

        return false;
      };

      let matchedData: any = null;
      let matchedId: string = '';

      // 1. Check in-memory store pool (0ms instant)
      const storePool = receptionDataStore.getAllCollectionsPool() || [];
      const inPool = storePool.find(p => isMatch(p, p?.id || p?.docId));
      if (inPool) {
        matchedData = inPool;
        matchedId = inPool.id || inPool.docId || '';
      }

      if (!matchedData) {
        const storeAppts = receptionDataStore.getAppointments() || [];
        const inAppt = storeAppts.find(a => isMatch(a, a?.id || a?.docId));
        if (inAppt) {
          matchedData = inAppt;
          matchedId = inAppt.id || inAppt.docId || '';
        }
      }

      if (!matchedData) {
        const storePkg = receptionDataStore.getPackageMembers() || [];
        const inPkg = storePkg.find(m => isMatch(m, m?.id || m?.docId));
        if (inPkg) {
          matchedData = inPkg;
          matchedId = inPkg.id || inPkg.docId || '';
        }
      }

      // 2. Query Firestore if not found in cache
      if (!matchedData) {
        const activeDb = getSafeDb();
        if (activeDb) {
          const safeQuery = (q: any) => Promise.race([
            getDocs(q).catch(() => ({ empty: true, docs: [] })),
            new Promise(res => setTimeout(() => res({ empty: true, docs: [] }), 2500))
          ]);

          const cols = ['patients', 'allpatients', 'appointments', 'patient_profiles'];
          const fields = ['registrationId', 'regId', 'regID', 'regNo', 'patientId', 'patient_id', 'uhid'];

          for (const col of cols) {
            if (matchedData) break;
            for (const field of fields) {
              try {
                const snap: any = await safeQuery(query(collection(activeDb, col), where(field, '==', testId), limit(1)));
                if (snap && snap.docs && snap.docs.length > 0) {
                  matchedData = snap.docs[0].data();
                  matchedId = snap.docs[0].id;
                  break;
                }
                if (rawVal !== testId) {
                  const snapOrig: any = await safeQuery(query(collection(activeDb, col), where(field, '==', rawVal), limit(1)));
                  if (snapOrig && snapOrig.docs && snapOrig.docs.length > 0) {
                    matchedData = snapOrig.docs[0].data();
                    matchedId = snapOrig.docs[0].id;
                    break;
                  }
                }
              } catch (_) {}
            }

            // If phone number entered, check phone fields
            if (!matchedData && is10DigitPhone) {
              for (const phoneField of ['phone', 'phoneNumber', 'mobile']) {
                try {
                  const snapPhone: any = await safeQuery(query(collection(activeDb, col), where(phoneField, '==', cleanDigits), limit(1)));
                  if (snapPhone && snapPhone.docs && snapPhone.docs.length > 0) {
                    matchedData = snapPhone.docs[0].data();
                    matchedId = snapPhone.docs[0].id;
                    break;
                  }
                } catch (_) {}
              }
            }

            // Direct document ID lookup
            if (!matchedData) {
              try {
                const docSnap = await getDoc(doc(activeDb, col, rawVal)).catch(() => null);
                if (docSnap && docSnap.exists()) {
                  matchedData = docSnap.data();
                  matchedId = docSnap.id;
                  break;
                }
                if (rawVal !== testId) {
                  const docSnapUpper = await getDoc(doc(activeDb, col, testId)).catch(() => null);
                  if (docSnapUpper && docSnapUpper.exists()) {
                    matchedData = docSnapUpper.data();
                    matchedId = docSnapUpper.id;
                    break;
                  }
                }
              } catch (_) {}
            }
          }
        }
      }

      // 3. If matched, apply to form
      if (matchedData) {
        const pName = matchedData.fullName || matchedData.patientName || matchedData.name || matchedData.patient_name || matchedData.patient || '';
        const pPhone = matchedData.phone || matchedData.patientPhone || matchedData.phoneNumber || matchedData.mobile || matchedData.contact || '';
        const pEmail = matchedData.email || matchedData.emailAddress || '';
        const pDiseases = matchedData.diseases || matchedData.subject || matchedData.symptoms || matchedData.problem || matchedData.complaint || '';
        const pBranch = matchedData.branchName || matchedData.branch || matchedData.targetBranch || matchedData.homeBranch || '';
        const pDoctor = matchedData.doctorName || matchedData.doctor || '';
        const reg = matchedData.registrationId || matchedData.regId || matchedData.regID || matchedData.regNo || matchedData.patientId || testId;

        if (pName) setPatientName(pName);
        if (pPhone) {
          setPhoneNumber(pPhone);
          setCheckedPhone(pPhone.replace(/\D/g, '').slice(-10));
        }
        if (pEmail) setEmailAddress(pEmail);
        if (pDiseases) setDiseases(pDiseases);
        if (pBranch && CLINIC_BRANCHES.includes(pBranch)) {
          setSelectedBranch(pBranch);
        }
        if (pDoctor) {
          setSelectedDoctor(pDoctor);
        }
        setMarketingSource('Old Patient');

        setPatientData({
          phone: pPhone || phoneNumber,
          fullName: pName,
          patientName: pName,
          patientId: matchedId || matchedData.id || '',
          regID: reg,
          registrationId: reg,
          source: 'Old Patient',
          patientType: 'revisit',
          isNewPatient: false,
          isExistingProfile: true,
          homeBranch: pBranch,
          branchName: pBranch
        });

        setFoundProfileInfo({
          name: pName,
          phone: pPhone,
          branch: pBranch,
          regId: reg,
          docId: matchedId
        });
        setManualRegId(reg);
        setRegIdValid(true);
        setRegIdError('');
      } else {
        // Not in database -> Valid as new manual registration ID
        setFoundProfileInfo(null);
        setRegIdValid(true);
        setRegIdError('');
      }
    } catch (e) {
      console.warn('Profile lookup error:', e);
      setRegIdValid(true);
    } finally {
      setIsCheckingRegId(false);
    }
  }, [phoneNumber, patientName]);

  // Auto-search profile when manualRegId is entered (debounce 450ms)
  useEffect(() => {
    if (!isRebackMode || !manualRegId.trim() || manualRegId.trim().length < 3) return;
    if (foundProfileInfo && foundProfileInfo.regId === manualRegId.trim().toUpperCase()) return;

    const timer = setTimeout(() => {
      triggerProfileLookup(manualRegId);
    }, 450);

    return () => clearTimeout(timer);
  }, [manualRegId, isRebackMode, foundProfileInfo, triggerProfileLookup]);

  // Auto-populate when initialPatient is passed via navigation
  useEffect(() => {
    if (!initialPatient) return;
    const pName = initialPatient.fullName || initialPatient.patientName || initialPatient.name || '';
    const pPhone = initialPatient.phone || initialPatient.phoneNumber || initialPatient.mobile || '';
    const pEmail = initialPatient.email || initialPatient.emailAddress || '';
    const pDiseases = initialPatient.diseases || initialPatient.subject || initialPatient.symptoms || '';
    const pBranch = initialPatient.branchName || initialPatient.branch || initialPatient.targetBranch || '';
    const pDoctor = initialPatient.doctorName || initialPatient.doctor || '';
    const reg = String(initialPatient.registrationId || initialPatient.regId || initialPatient.regNo || initialPatient.patientId || '').trim().toUpperCase();

    if (pName) setPatientName(pName);
    if (pPhone) setPhoneNumber(pPhone);
    if (pEmail) setEmailAddress(pEmail);
    if (pDiseases) setDiseases(pDiseases);
    if (pBranch && CLINIC_BRANCHES.includes(pBranch)) setSelectedBranch(pBranch);
    if (pDoctor) setSelectedDoctor(pDoctor);
    setMarketingSource('Old Patient');

    if (reg) {
      setManualRegId(reg);
      setRegIdValid(true);
      setRegIdError('');
      setFoundProfileInfo({
        name: pName,
        phone: pPhone,
        branch: pBranch,
        regId: reg
      });
    }

    setPatientData(prev => ({
      ...prev,
      patientId: initialPatient.id || initialPatient.patientDocId || prev.patientId,
      fullName: pName || prev.fullName,
      patientName: pName || prev.patientName,
      phone: pPhone || prev.phone,
      regID: reg || prev.regID,
      registrationId: reg || prev.registrationId,
      source: 'Old Patient',
      patientType: 'revisit',
      isNewPatient: false,
      isExistingProfile: true,
      homeBranch: pBranch || prev.homeBranch,
      branchName: pBranch || prev.branchName
    }));
  }, [initialPatient]);

  const [existingProfilesList, setExistingProfilesList] = useState<any[]>([]);
  const [checkedPhone, setCheckedPhone] = useState('');
  const [bypassPhoneCheck, setBypassPhoneCheck] = useState(false);
  const [phoneCheckResult, setPhoneCheckResult] = useState<any>(null);
  const [checkingProfilesLoading, setCheckingProfilesLoading] = useState(false);
  const [existingProfilesModalVisible, setExistingProfilesModalVisible] = useState(false);
  // END STATE

  // START PROFILE FETCH BY PHONE
  const findProfilesByPhone = async (rawPhone: string) => {
    if (!rawPhone) return [];
    const clean = String(rawPhone).replace(/\D/g, '').slice(-10);
    if (clean.length < 10) return [];

    const seenDocIds = new Set<string>();
    const profilesMap = new Map();

    const processDoc = (data: any, docId: string) => {
      if (!data) return;
      if (docId && seenDocIds.has(docId)) return;
      if (docId) seenDocIds.add(docId);

      const pName = data.fullName || data.patientName || data.name || data.patient_name || data.patient || data.patient_fullName || data.displayName || '';
      const docPhone = data.phone || data.patientPhone || data.phoneNumber || data.mobile || data.contact || data.contactNumber || data.mobileNumber || data.tel || '';
      const cleanDocPhone = String(docPhone).replace(/\D/g, '').slice(-10);
      if (cleanDocPhone === clean) {
        const rawReg = data.regNo || data.registrationId || data.registration_id || data.regId || data.regID || data.patientId || data.uhid || data.customId || data.id;
        const originalBranch = data.branchName || data.branch || data.targetBranch || '';
        let regId = '';
        const isValidReg = rawReg && typeof rawReg === 'string' && rawReg.trim().length > 0 && rawReg.trim().length <= 25 && !/^[a-zA-Z0-9]{20,32}$/.test(rawReg.trim()) && !rawReg.trim().toLowerCase().startsWith('temp_') && !rawReg.trim().toLowerCase().startsWith('app_');
        if (isValidReg) {
          regId = rawReg.trim().toUpperCase();
        }

        const normalizedName = (pName || 'Patient').trim().replace(/^(mr|mrs|ms|dr|master)\.?\s+/i, '').trim().toLowerCase();
        const personKey = `${normalizedName}_${cleanDocPhone}`;
        if (!profilesMap.has(personKey)) {
          if (!regId) {
            const shortcut = getBranchShortcut(originalBranch || selectedBranch);
            regId = `SPH-${shortcut}-${String(profilesMap.size + 1).padStart(4, '0')}`;
          }
          profilesMap.set(personKey, {
            id: docId,
            fullName: pName || 'Patient',
            registrationId: regId,
            regNo: data.regNo || regId,
            phone: docPhone || clean,
            gender: data.gender || '',
            age: data.age || '',
            diseases: data.diseases || data.subject || data.symptoms || data.problem || '',
            email: data.email || data.emailAddress || '',
            source: 'Old Patient',
            patientType: 'revisit',
            isNewPatient: false,
            isExistingProfile: true,
            collectionName: data.collectionName || 'patients',
            branchName: originalBranch || '',
            homeBranch: originalBranch || ''
          });
        } else {
          const existing = profilesMap.get(personKey);
          if (isValidReg && (!existing.registrationId || existing.registrationId.startsWith('SPH-'))) {
            existing.registrationId = regId;
            existing.regNo = data.regNo || regId;
          }
          if (!existing.branchName && originalBranch) {
            existing.branchName = originalBranch;
            existing.homeBranch = originalBranch;
          }
          if (!existing.gender && data.gender) existing.gender = data.gender;
          if (!existing.age && data.age) existing.age = data.age;
          if (!existing.diseases && (data.diseases || data.subject || data.symptoms || data.problem)) {
            existing.diseases = data.diseases || data.subject || data.symptoms || data.problem;
          }
          if (!existing.email && (data.email || data.emailAddress)) {
            existing.email = data.email || data.emailAddress;
          }
        }
      }
    };

    // 1. Search in-memory state & cache instantly (0ms)
    try {
      const storePool = receptionDataStore.getAllCollectionsPool() || [];
      storePool.forEach(p => processDoc(p, p?.id || p?.docId));

      const storeAppts = receptionDataStore.getAppointments() || [];
      storeAppts.forEach(a => processDoc(a, a?.id || a?.docId));

      const storePkg = receptionDataStore.getPackageMembers() || [];
      storePkg.forEach(m => processDoc(m, m?.id || m?.docId));
    } catch (e) {
      console.warn("In-memory phone search notice:", e);
    }

    // 2. Query Firestore collections with multi-format phone matching & safe timeout
    const activeDb = getSafeDb();
    if (activeDb) {
      const safeQuery = (q: any) => Promise.race([
        getDocs(q).catch((err) => {
          console.warn('[Phone Query] Collection query error:', err);
          return { docs: [] };
        }),
        new Promise(res => setTimeout(() => res({ docs: [] }), 6000))
      ]);

      const cleanNum = Number(clean);
      const phoneVariants: (string | number)[] = Array.from(new Set([
        clean,
        `+91${clean}`,
        `+91 ${clean}`,
        `+91-${clean}`,
        `0${clean}`,
        `${clean.slice(0, 5)} ${clean.slice(5)}`,
        `+91 ${clean.slice(0, 5)} ${clean.slice(5)}`
      ])).filter(Boolean);
      if (!isNaN(cleanNum)) {
        phoneVariants.push(cleanNum);
      }

      try {
        const queryPromises: Promise<any>[] = [
          // allpatients
          safeQuery(query(collection(activeDb, 'allpatients'), where('phone', 'in', phoneVariants), limit(25))),
          safeQuery(query(collection(activeDb, 'allpatients'), where('phoneNumber', 'in', phoneVariants), limit(25))),
          safeQuery(query(collection(activeDb, 'allpatients'), where('patientPhone', 'in', phoneVariants), limit(25))),
          safeQuery(query(collection(activeDb, 'allpatients'), where('mobile', 'in', phoneVariants), limit(25))),

          // patients
          safeQuery(query(collection(activeDb, 'patients'), where('phone', 'in', phoneVariants), limit(25))),
          safeQuery(query(collection(activeDb, 'patients'), where('phoneNumber', 'in', phoneVariants), limit(25))),
          safeQuery(query(collection(activeDb, 'patients'), where('patientPhone', 'in', phoneVariants), limit(25))),
          safeQuery(query(collection(activeDb, 'patients'), where('mobile', 'in', phoneVariants), limit(25))),

          // appointments
          safeQuery(query(collection(activeDb, 'appointments'), where('phone', 'in', phoneVariants), limit(25))),
          safeQuery(query(collection(activeDb, 'appointments'), where('phoneNumber', 'in', phoneVariants), limit(25))),
          safeQuery(query(collection(activeDb, 'appointments'), where('patientPhone', 'in', phoneVariants), limit(25))),

          // patient_profiles
          safeQuery(query(collection(activeDb, 'patient_profiles'), where('phone', 'in', phoneVariants), limit(25)))
        ];

        if (!isNaN(cleanNum)) {
          queryPromises.push(
            safeQuery(query(collection(activeDb, 'allpatients'), where('phone', '==', cleanNum), limit(10))),
            safeQuery(query(collection(activeDb, 'patients'), where('phone', '==', cleanNum), limit(10))),
            safeQuery(query(collection(activeDb, 'appointments'), where('phone', '==', cleanNum), limit(10)))
          );
        }

        const snapshots = await Promise.all(queryPromises);
        snapshots.forEach((snap: any) => {
          if (!snap || snap.empty || !snap.forEach) return;
          snap.forEach((docSnap: any) => {
            processDoc(docSnap.data(), docSnap.id);
          });
        });
      } catch (err) {
        console.warn("Firestore phone query error:", err);
      }
    }

    const resultList = Array.from(profilesMap.values());
    setPhoneCheckResult(resultList);
    return resultList;
  };
  // END PROFILE FETCH BY PHONE

  // START PHONE HANDLERS AND PROFILE SELECTION
  const handleManualPhoneCheck = async (phoneVal: string, isAuto: boolean = false) => {
    const clean = phoneVal.replace(/\D/g, '').slice(-10);
    if (clean.length < 10) {
      if (!isAuto) Alert.alert("Invalid Phone", "Please enter a 10-digit mobile number.");
      return;
    }
    setCheckingProfilesLoading(true);
    try {
      const list = await findProfilesByPhone(phoneVal);
      if (list.length > 0) {
        setMarketingSource('Old Patient');
        setExistingProfilesList(list);
        setCheckedPhone(clean);

        if (list.length === 1) {
          handleSelectExistingProfile(list[0]);
        } else {
          setPatientData(prev => ({
            ...prev,
            source: 'Old Patient',
            patientType: 'revisit',
            isNewPatient: false,
            isExistingProfile: true
          }));
          setExistingProfilesModalVisible(true);
        }
      } else {
        if (!isAuto) {
          Alert.alert("No Profiles Found", `No existing patient profiles found for +91 ${clean}.`);
        }
      }
    } catch (err) {
      console.error("Manual check error:", err);
    } finally {
      setCheckingProfilesLoading(false);
    }
  };

  // Automatically triggers profile check when user enters 10 digits
  const handlePhoneInputChange = (text: string) => {
    setPhoneNumber(text);
    setPatientData(prev => ({ ...prev, phone: text }));
    setBypassPhoneCheck(false);

    const clean = text.replace(/\D/g, '').slice(-10);
    if (clean.length === 10) {
      const storePool = receptionDataStore.getAllCollectionsPool() || [];
      const isKnown = storePool.some(p => {
        const pPhone = String(p.phone || p.patientPhone || p.phoneNumber || p.mobile || '').replace(/\D/g, '').slice(-10);
        return pPhone === clean;
      });
      if (isKnown) {
        setMarketingSource('Old Patient');
        setPatientData(prev => ({
          ...prev,
          source: 'Old Patient',
          patientType: 'revisit',
          isNewPatient: false,
          isExistingProfile: true
        }));
      }
      handleManualPhoneCheck(text, true);
    } else {
      if (!patientData.isExistingProfile && marketingSource === 'Old Patient') {
        setMarketingSource('Select Source');
        setPatientData(prev => ({ ...prev, source: 'Select Source' }));
      }
    }
  };

  // Populate appointment form when user selects an existing profile
  const handleSelectExistingProfile = (prof: any) => {
    setPatientName(prof.fullName);
    const pPhone = prof.phone || (patientData.phone || phoneNumber);
    setPhoneNumber(pPhone);
    setMarketingSource('Old Patient');
    if (prof.diseases) setDiseases(prof.diseases);
    if (prof.email) setEmailAddress(prof.email);
    if (prof.branchName && CLINIC_BRANCHES.includes(prof.branchName)) {
      setSelectedBranch(prof.branchName);
    }

    const reg = String(prof.registrationId || prof.regNo || '').trim().toUpperCase();
    if (reg) {
      setManualRegId(reg);
      setRegIdValid(true);
      setRegIdError('');
      setFoundProfileInfo({
        name: prof.fullName,
        phone: pPhone,
        branch: prof.branchName || '',
        regId: reg
      });
    }

    setPatientData(prev => ({
      ...prev,
      patientId: prof.id,
      fullName: prof.fullName,
      patientName: prof.fullName,
      phone: pPhone,
      regID: reg || prev.regID,
      registrationId: reg || prev.registrationId,
      source: 'Old Patient',
      patientType: 'revisit',
      isNewPatient: false,
      isExistingProfile: true,
      homeBranch: prof.branchName || prev.homeBranch,
      branchName: prof.branchName || prev.branchName
    }));
    setBypassPhoneCheck(true);
    setExistingProfilesModalVisible(false);
  };
  // END HANDLERS

  // Live reactive check: whenever phoneNumber reaches 10 digits, if found in any patient records, auto-set Marketing Source to 'Old Patient'
  useEffect(() => {
    const raw = patientData.phone || phoneNumber || '';
    const clean = raw.replace(/\D/g, '').slice(-10);
    if (clean.length === 10) {
      const storePool = receptionDataStore.getAllCollectionsPool() || [];
      const isKnown = storePool.some(p => {
        const pPhone = String(p.phone || p.patientPhone || p.phoneNumber || p.mobile || '').replace(/\D/g, '').slice(-10);
        return pPhone === clean;
      });
      if (isKnown) {
        setMarketingSource('Old Patient');
        setPatientData(prev => {
          if (prev.source !== 'Old Patient') {
            return {
              ...prev,
              source: 'Old Patient',
              patientType: 'revisit',
              isNewPatient: false,
              isExistingProfile: true
            };
          }
          return prev;
        });
      }
    }
  }, [phoneNumber, patientData.phone]);

  // Section 2: Appointment Information
  const getTodayFormatted = () => {
    const today = new Date();
    const d = String(today.getDate()).padStart(2, '0');
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const y = today.getFullYear();
    return `${d}-${m}-${y}`;
  };

  const getYesterdayFormatted = () => {
    const yesterday = new Date(Date.now() - 86400000);
    const d = String(yesterday.getDate()).padStart(2, '0');
    const m = String(yesterday.getMonth() + 1).padStart(2, '0');
    const y = yesterday.getFullYear();
    return `${d}-${m}-${y}`;
  };

  const [appointmentDate, setAppointmentDate] = useState(() => isRebackMode ? getYesterdayFormatted() : getTodayFormatted());
  const [selectedDoctor, setSelectedDoctor] = useState('');
  const [selectedTimeSlot, setSelectedTimeSlot] = useState('');
  const [clockModalOpen, setClockModalOpen] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);

  // Restore form draft on initial mount
  useEffect(() => {
    const restoreDraft = async () => {
      try {
        const saved = await AsyncStorage.getItem(BOOK_APPT_DRAFT_KEY);
        if (saved) {
          const draft = JSON.parse(saved);
          if (draft && (draft.patientName || draft.phoneNumber || draft.diseases || draft.selectedDoctor)) {
            if (draft.patientName) setPatientName(draft.patientName);
            if (draft.phoneNumber) setPhoneNumber(draft.phoneNumber);
            if (draft.emailAddress) setEmailAddress(draft.emailAddress);
            if (draft.diseases) setDiseases(draft.diseases);
            if (draft.marketingSource) setMarketingSource(draft.marketingSource);
            if (draft.consultationMode) setConsultationMode(draft.consultationMode);
            if (draft.selectedDoctor) setSelectedDoctor(draft.selectedDoctor);
            if (draft.appointmentDate) setAppointmentDate(draft.appointmentDate);
            if (draft.selectedTimeSlot) setSelectedTimeSlot(draft.selectedTimeSlot);
            if (draft.patientData) setPatientData(draft.patientData);
            setDraftRestored(true);
            setHasDraft(true);
          }
        }
      } catch (e) {
        console.warn('Draft restore error:', e);
      }
    };
    restoreDraft();
  }, []);

  // Auto-save form draft on changes
  useEffect(() => {
    if (!patientName && !phoneNumber && !diseases && !selectedDoctor && !emailAddress) {
      return;
    }
    const timer = setTimeout(() => {
      const draft = {
        patientName,
        phoneNumber,
        emailAddress,
        diseases,
        marketingSource,
        consultationMode,
        selectedDoctor,
        appointmentDate,
        selectedTimeSlot,
        patientData,
        savedAt: new Date().toISOString()
      };
      AsyncStorage.setItem(BOOK_APPT_DRAFT_KEY, JSON.stringify(draft)).then(() => {
        setHasDraft(true);
      }).catch(() => { });
    }, 500);
    return () => clearTimeout(timer);
  }, [patientName, phoneNumber, emailAddress, diseases, marketingSource, consultationMode, selectedDoctor, appointmentDate, selectedTimeSlot, patientData]);

  const clearFormAndDraft = async () => {
    setPatientName('');
    setDiseases('');
    setPhoneNumber('');
    setEmailAddress('');
    setMarketingSource('Select Source');
    setSelectedDoctor('');
    setSelectedTimeSlot('');
    setPatientSearchTerm('');
    setDebouncedSearchTerm('');
    setShowSuggestions(false);
    setManualRegId('');
    setFoundProfileInfo(null);
    setRegIdError('');
    setRegIdValid(false);
    setPatientData({ phone: '', fullName: '', patientName: '', patientId: '', regID: '', source: '' });
    setDraftRestored(false);
    setHasDraft(false);
    try {
      await AsyncStorage.removeItem(BOOK_APPT_DRAFT_KEY);
    } catch (_) { }
  };

  // Firestore Live Doctors List
  const [allDoctorsList, setAllDoctorsList] = useState<Doctor[]>(() => GLOBAL_MOBILE_DOCTORS_CACHE.length > 0 ? GLOBAL_MOBILE_DOCTORS_CACHE : DEFAULT_DOCTORS_SEED);

  // Subscribe to real-time Firestore doctors collection
  useEffect(() => {
    try {
      const activeDb = getSafeDb();
      if (!activeDb) return;
      const docColRef = collection(activeDb, 'doctors');
      const unsubscribe = onSnapshot(docColRef, (snapshot) => {
        if (!snapshot.empty) {
          const fetched: Doctor[] = [];
          snapshot.forEach((snap) => {
            const data = snap.data();
            const normDataName = (data.name || data.doctorName || '').toLowerCase().replace(/dr\.?\s*/i, '').trim();
            const digits = (data.mobile || data.phone || '').replace(/\D/g, '');
            // Strictly exclude any reception desk or staff accounts
            if (normDataName.includes('reception') || normDataName.includes('desk') || normDataName.includes('staff')) return;
            if (digits && (digits === '9030176176' || digits === '9553176176' || digits === '9804176176' || digits === '9132176176')) return;
            const seedFallback = DEFAULT_DOCTORS_SEED.find(s => s.id === snap.id)
              || (digits && digits.length >= 7 ? DEFAULT_DOCTORS_SEED.find(s => {
                const sDigits = (s.phone || '').replace(/\D/g, '');
                return sDigits && (sDigits.includes(digits) || digits.includes(sDigits));
              }) : undefined)
              || (normDataName.includes('prashanth') ? DEFAULT_DOCTORS_SEED.find(s => s.id === 'doc-1') : undefined)
              || (normDataName.includes('job') || normDataName.includes('parvee') ? DEFAULT_DOCTORS_SEED.find(s => s.id === 'doc-2') : undefined)
              || (normDataName.includes('padma') || normDataName.includes('priya') ? DEFAULT_DOCTORS_SEED.find(s => s.id === 'doc-3') : undefined)
              || (normDataName.includes('ramakrishna') || normDataName.includes('chanduri') ? DEFAULT_DOCTORS_SEED.find(s => s.id === 'doc-4') : undefined)
              || DEFAULT_DOCTORS_SEED.find(s => {
                const normSeedName = s.name.toLowerCase().replace(/dr\.?\s*/i, '').trim();
                return normDataName && (normSeedName.includes(normDataName) || normDataName.includes(normSeedName));
              });
            fetched.push({
              id: snap.id,
              name: data.name || data.doctorName || seedFallback?.name || 'Doctor',
              phone: data.phone || data.mobile || seedFallback?.phone || '',
              role: data.role || seedFallback?.role || 'Homeopathy Physician',
              branch: data.branch || data.assignedBranch || '',
              branchSchedules: (data.branchSchedules && data.branchSchedules.length > 0)
                ? data.branchSchedules
                : (seedFallback?.branchSchedules || []),
            } as any);
          });
          GLOBAL_MOBILE_DOCTORS_CACHE = fetched;
          setAllDoctorsList(fetched);
        }
      }, (err) => {
        console.warn('Firestore doctors listener error:', err);
      });
      return () => unsubscribe();
    } catch (e) {
      console.warn('Firestore doctors subscribe notice:', e);
    }
  }, []);

  // Firestore Live Doctor No Shows List
  const [noShowsList, setNoShowsList] = useState<DoctorNoShowOverride[]>(() => GLOBAL_MOBILE_NOSHOWS_CACHE);
  useEffect(() => {
    const activeDb = getSafeDb();
    if (!activeDb) return;
    try {
      const q = collection(activeDb, 'doctor_no_shows');
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const list: DoctorNoShowOverride[] = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<DoctorNoShowOverride, 'id'>)
        }));
        GLOBAL_MOBILE_NOSHOWS_CACHE = list;
        setNoShowsList(list);
      }, (err) => {
        console.warn('Firestore doctor_no_shows listener error on mobile BookAppointment:', err);
      });
      return () => unsubscribe();
    } catch (e) {
      console.warn('Firestore doctor_no_shows subscribe notice on mobile:', e);
    }
  }, []);

  // Compute if selectedDoctor has an active No Show for appointmentDate at selectedBranch
  const activeNoShowForSelectedDoc = useMemo(() => {
    if (!selectedDoctor) return undefined;
    return getActiveDoctorNoShow(noShowsList, selectedDoctor, selectedBranch, appointmentDate);
  }, [noShowsList, selectedDoctor, selectedBranch, appointmentDate]);

  // Helper to convert DD-MM-YYYY to DayName
  const getSelectedDayName = (dateStr: string): DayName => {
    if (!dateStr) return 'Sat';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10);
      if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
        const d = new Date(year, month, day);
        const days: DayName[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        return days[d.getDay()];
      }
    }
    return 'Sat';
  };

  const selectedDayName = getSelectedDayName(appointmentDate);

  // Dynamically filter doctors available for the selected branch and selected day
  const availableDoctors = useMemo(() => {
    if (consultationMode === 'Online') {
      return allDoctorsList && allDoctorsList.length > 0 ? allDoctorsList : DEFAULT_DOCTORS_SEED;
    }

    const activeBranch = selectedBranch || currentBranch;
    if (!activeBranch) return [];

    const normSelectedBranch = activeBranch.toLowerCase().replace(/\s*branch\s*/i, '').trim();

    const matches = allDoctorsList.filter((doc) => {
      if (doc.branchSchedules && doc.branchSchedules.length > 0) {
        const matchBs = doc.branchSchedules.find((bs) => {
          const normBsBranch = (bs.targetBranch || '').toLowerCase().replace(/\s*branch\s*/i, '').trim();
          return normBsBranch.includes(normSelectedBranch) || normSelectedBranch.includes(normBsBranch);
        });

        if (!matchBs) return false;
        const daySched = matchBs.daySchedules?.[selectedDayName];
        if (!daySched) return false;

        return daySched.status === 'Available' && daySched.slots && daySched.slots.length > 0;
      }

      const docBranchStr = ((doc as any).branch || (doc as any).assignedBranch || '').toLowerCase().replace(/\s*branch\s*/i, '').trim();
      if (docBranchStr) {
        return docBranchStr.includes(normSelectedBranch) || normSelectedBranch.includes(docBranchStr);
      }

      return false;
    });

    if (matches.length > 0) return matches;

    // Graceful fallback: If day schedule has no specific roster, return all doctors assigned to this branch
    const branchDocs = allDoctorsList.filter((doc) => {
      if (doc.branchSchedules && doc.branchSchedules.length > 0) {
        return doc.branchSchedules.some((bs) => {
          const normBsBranch = (bs.targetBranch || '').toLowerCase().replace(/\s*branch\s*/i, '').trim();
          return normBsBranch.includes(normSelectedBranch) || normSelectedBranch.includes(normBsBranch);
        });
      }
      const docBranchStr = ((doc as any).branch || (doc as any).assignedBranch || '').toLowerCase().replace(/\s*branch\s*/i, '').trim();
      if (docBranchStr) {
        return docBranchStr.includes(normSelectedBranch) || normSelectedBranch.includes(docBranchStr);
      }
      return false;
    });

    return branchDocs;
  }, [allDoctorsList, selectedBranch, currentBranch, selectedDayName, consultationMode]);

  // Auto-reset selectedDoctor if no longer available on changed date/branch
  useEffect(() => {
    if (selectedDoctor && availableDoctors.length > 0) {
      const exists = availableDoctors.some((d) => d.name === selectedDoctor);
      if (!exists) {
        setSelectedDoctor('');
        setSelectedTimeSlot('');
      }
    }
  }, [appointmentDate, selectedBranch, availableDoctors]);

  const [showSuggestions, setShowSuggestions] = useState(false);
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const searchTimerRef = useRef<any>(null);

  const handleSearchChange = (val: string) => {
    setPatientSearchTerm(val);
    setShowSuggestions(true);
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearchTerm(val);
    }, 150);
  };

  // Instant 1-Tap Back Navigation & Keyboard Dismissal
  const handleDirectGoBack = () => {
    Keyboard.dismiss();
    setShowSuggestions(false);
    setPatientSearchTerm('');
    setDebouncedSearchTerm('');
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    setMarketingExpanded(false);
    setModeExpanded(false);

    if (onBack) {
      onBack();
    } else if (onNavigate) {
      onNavigate('reception_dashboard');
    }
  };

  // Firestore Live Patient History Collections (appointments, patients & allpatients) with 0ms Instant Device Cache
  const [existingAppointments, setExistingAppointments] = useState<any[]>(() => {
    const storeAppts = receptionDataStore.getAppointments();
    return storeAppts.length > 0 ? storeAppts : GLOBAL_MOBILE_APPTS_CACHE;
  });
  const [patientsList, setPatientsList] = useState<any[]>(GLOBAL_MOBILE_PATIENTS_CACHE);
  const [allPatientsList, setAllPatientsList] = useState<any[]>(() => {
    const storePool = receptionDataStore.getAllCollectionsPool();
    return storePool.length > 0 ? storePool : GLOBAL_MOBILE_ALLPATIENTS_CACHE;
  });
  // 1. Instant Zero-Network Data Synchronization via Centralized receptionDataStore
  useEffect(() => {
    receptionDataStore.startListeners();

    const currentAppts = receptionDataStore.getAppointments();
    if (currentAppts.length > 0) {
      setExistingAppointments(currentAppts);
      GLOBAL_MOBILE_APPTS_CACHE = currentAppts;
    }
    const currentPool = receptionDataStore.getAllCollectionsPool();
    if (currentPool.length > 0) {
      setAllPatientsList(currentPool);
      GLOBAL_MOBILE_ALLPATIENTS_CACHE = currentPool;
    }

    const unsubscribe = receptionDataStore.subscribe((state) => {
      if (state.appointments.length > 0) {
        setExistingAppointments(state.appointments);
        GLOBAL_MOBILE_APPTS_CACHE = state.appointments;
      }
      if (state.allCollectionsPool.length > 0) {
        setAllPatientsList(state.allCollectionsPool);
        GLOBAL_MOBILE_ALLPATIENTS_CACHE = state.allCollectionsPool;
      }
    });

    return () => {
      unsubscribe();
    };
  }, [currentBranch]);

  // Deduplicated Patient History Database
  // Deduplicated Patient History Database
  interface PatientRecordItem {
    id: string;
    regId: string;
    name: string;
    phone: string;
    email: string;
    diseases: string;
    branch: string;
    nameLower: string;
    phoneLower: string;
  }

  // Live filter patient suggestions based on debouncedSearchTerm (matches Name, Phone, and Profile/Registration ID)
  const patientSuggestions = useMemo<PatientRecordItem[]>(() => {
    const queryStr = (debouncedSearchTerm || '').trim().toLowerCase();
    if (queryStr.length < 2) return [];

    const digitsOnly = queryStr.replace(/\D/g, '');
    const pool = receptionDataStore.getAllCollectionsPool() || [];
    const appts = receptionDataStore.getAppointments() || [];
    const combined = [...pool, ...appts];

    const seenKeys = new Set<string>();
    const results: PatientRecordItem[] = [];

    for (const p of combined) {
      if (!p) continue;
      const rawName = String(p.patientName || p.fullName || p.name || '').trim();
      const rawPhone = String(p.phone || p.phoneNumber || p.mobile || '').replace(/\D/g, '').slice(-10);
      const regId = String(p.registrationId || p.regId || p.regNo || p.patientId || p.uhid || p.id || '').trim();
      if (!rawName && rawPhone.length < 10 && !regId) continue;

      const dedupeKey = `${rawName.toLowerCase()}_${rawPhone}_${regId.toLowerCase()}`;
      if (seenKeys.has(dedupeKey)) continue;
      seenKeys.add(dedupeKey);

      const nameLower = rawName.toLowerCase();
      const idLower = regId.toLowerCase();

      const nameMatches = nameLower.includes(queryStr);
      const phoneMatches = digitsOnly.length >= 2 && rawPhone.includes(digitsOnly);
      const idMatches = idLower.includes(queryStr);

      if (nameMatches || phoneMatches || idMatches) {
        results.push({
          id: p.id || regId || rawPhone,
          regId: regId || p.id,
          name: rawName || 'Patient',
          phone: rawPhone,
          email: p.email || p.emailAddress || '',
          diseases: p.diseases || p.subject || p.symptoms || '',
          branch: p.branchName || p.branch || '',
          nameLower,
          phoneLower: rawPhone
        });
      }
      if (results.length >= 15) break;
    }

    return results;
  }, [debouncedSearchTerm]);

  const handleSelectPatientSuggestion = (item: PatientRecordItem) => {
    setPatientName(item.name || '');
    setPhoneNumber(item.phone || '');
    setEmailAddress(item.email || '');
    setDiseases(item.diseases || '');
    setMarketingSource('Old Patient');
    if (item.branch && CLINIC_BRANCHES.includes(item.branch)) {
      setSelectedBranch(item.branch);
    }
    const reg = (item.regId || item.id || '').trim().toUpperCase();
    if (reg) {
      setManualRegId(reg);
      setRegIdValid(true);
      setRegIdError('');
      setFoundProfileInfo({
        name: item.name,
        phone: item.phone,
        branch: item.branch,
        regId: reg
      });
    }
    setPatientData(prev => ({
      ...prev,
      patientId: item.id,
      fullName: item.name,
      patientName: item.name,
      phone: item.phone,
      regID: reg || prev.regID,
      registrationId: reg || prev.registrationId,
      source: 'Old Patient',
      patientType: 'revisit',
      isNewPatient: false,
      isExistingProfile: true,
      homeBranch: item.branch || prev.homeBranch,
      branchName: item.branch || prev.branchName
    }));
    setPatientSearchTerm(item.name || item.phone || '');
    setDebouncedSearchTerm('');
    setShowSuggestions(false);
  };

  // Time conversion helpers are defined at top-level scope

  const generate15MinSlotsFromRanges = (slotRanges: TimeSlot[]): string[] => {
    const result: string[] = [];
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

  // Firestore Live Temporary Slots List
  interface TempSlotDoc {
    id?: string;
    doctorName: string;
    branch: string;
    appointmentDate: string;
    startHour: string;
    startMinute: string;
    startAmPm: 'AM' | 'PM';
    endHour: string;
    endMinute: string;
    endAmPm: 'AM' | 'PM';
  }

  const [tempSlotsList, setTempSlotsList] = useState<TempSlotDoc[]>([]);
  const [tempModalOpen, setTempModalOpen] = useState(false);

  // Temporary slot form states
  const [tempStartHour, setTempStartHour] = useState('09');
  const [tempStartMin, setTempStartMin] = useState('00');
  const [tempStartAmPm, setTempStartAmPm] = useState<'AM' | 'PM'>('AM');
  const [tempEndHour, setTempEndHour] = useState('10');
  const [tempEndMin, setTempEndMin] = useState('00');
  const [tempEndAmPm, setTempEndAmPm] = useState<'AM' | 'PM'>('AM');
  const [isSavingTempSlot, setIsSavingTempSlot] = useState(false);

  useEffect(() => {
    try {
      const activeDb = getSafeDb();
      if (!activeDb) return;
      const tempColRef = collection(activeDb, 'doctor_temp_slots');
      const unsubscribe = onSnapshot(tempColRef, (snapshot) => {
        const list: TempSlotDoc[] = [];
        snapshot.forEach((snap) => {
          list.push({ id: snap.id, ...snap.data() } as TempSlotDoc);
        });
        setTempSlotsList(list);
      }, (err) => {
        console.warn('Temp slots snapshot warning:', err);
      });
      return () => unsubscribe();
    } catch (e) {
      console.warn('Temp slots listener notice:', e);
    }
  }, []);

  // Helper to add 15-min slot BEFORE regular/current start
  const handleAddSlotBefore = async () => {
    if (!selectedDoctor || timeSlotsList.length === 0) return;
    try {
      const activeDb = getSafeDb();
      if (!activeDb) return;
      const earliestStr = timeSlotsList[0];
      const [timePart, ampm] = earliestStr.split(' ');
      const [h, m] = timePart.split(':');
      const totalMins = parseTimeToMinutes(h, m, ampm as 'AM' | 'PM');

      const newStartMins = Math.max(0, totalMins - 15);
      const newEndMins = totalMins;

      const startStr = formatMinutesToTimeStr(newStartMins);
      const endStr = formatMinutesToTimeStr(newEndMins);

      const [sHour, sMinAmpm] = startStr.split(':');
      const [sMin, sAmPm] = sMinAmpm.split(' ');

      const [eHour, eMinAmpm] = endStr.split(':');
      const [eMin, eAmPm] = eMinAmpm.split(' ');

      await addDoc(collection(activeDb, 'doctor_temp_slots'), {
        doctorName: selectedDoctor,
        branch: selectedBranch,
        appointmentDate: appointmentDate,
        startHour: sHour,
        startMinute: sMin,
        startAmPm: sAmPm,
        endHour: eHour,
        endMinute: eMin,
        endAmPm: eAmPm,
        createdAt: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('Error adding slot before:', e);
    }
  };

  // Helper to add 15-min slot AFTER regular/current end
  const handleAddSlotAfter = async () => {
    if (!selectedDoctor || timeSlotsList.length === 0) return;
    try {
      const activeDb = getSafeDb();
      if (!activeDb) return;
      const latestStr = timeSlotsList[timeSlotsList.length - 1];
      const [timePart, ampm] = latestStr.split(' ');
      const [h, m] = timePart.split(':');
      const totalMins = parseTimeToMinutes(h, m, ampm as 'AM' | 'PM');

      const newStartMins = totalMins + 15;
      const newEndMins = newStartMins + 15;

      const startStr = formatMinutesToTimeStr(newStartMins);
      const endStr = formatMinutesToTimeStr(newEndMins);

      const [sHour, sMinAmpm] = startStr.split(':');
      const [sMin, sAmPm] = sMinAmpm.split(' ');

      const [eHour, eMinAmpm] = endStr.split(':');
      const [eMin, eAmPm] = eMinAmpm.split(' ');

      await addDoc(collection(activeDb, 'doctor_temp_slots'), {
        doctorName: selectedDoctor,
        branch: selectedBranch,
        appointmentDate: appointmentDate,
        startHour: sHour,
        startMinute: sMin,
        startAmPm: sAmPm,
        endHour: eHour,
        endMinute: eMin,
        endAmPm: eAmPm,
        createdAt: new Date().toISOString(),
      });
    } catch (e) {
      console.warn('Error adding slot after:', e);
    }
  };

  // Helper to add a 15-minute temporary slot to Firestore by start minutes
  const addTempSlotByMinutes = async (startMins: number) => {
    if (!selectedDoctor) return;
    try {
      const activeDb = getSafeDb();
      if (!activeDb) return;
      const endMins = startMins + 15;
      const startStr = formatMinutesToTimeStr(startMins);
      const endStr = formatMinutesToTimeStr(endMins);

      const [sHour, sMinAmpm] = startStr.split(':');
      const [sMin, sAmPm] = sMinAmpm.split(' ');

      const [eHour, eMinAmpm] = endStr.split(':');
      const [eMin, eAmPm] = eMinAmpm.split(' ');

      await addDoc(collection(activeDb, 'doctor_temp_slots'), {
        doctorName: selectedDoctor,
        branch: selectedBranch || currentBranch,
        appointmentDate: appointmentDate,
        startHour: sHour,
        startMinute: sMin,
        startAmPm: sAmPm,
        endHour: eHour,
        endMinute: eMin,
        endAmPm: eAmPm,
        createdAt: new Date().toISOString(),
      });
      setSelectedTimeSlot(startStr);
    } catch (e) {
      console.warn('Error adding temp slot:', e);
    }
  };

  // Helper to add 15-min slot BEFORE a specific shift
  const handleAddSlotBeforeForShift = async (shift: any) => {
    if (!selectedDoctor || !shift) return;
    let targetMins: number;
    if (shift.slots && shift.slots.length > 0) {
      const firstSlot = shift.slots[0];
      const [timePart, ampm] = firstSlot.split(' ');
      const [h, m] = timePart.split(':');
      const firstMins = parseTimeToMinutes(h, m, ampm as 'AM' | 'PM');
      targetMins = Math.max(0, firstMins - 15);
    } else if (typeof shift.slotBeforeMins === 'number') {
      targetMins = shift.slotBeforeMins;
    } else if (typeof shift.startMins === 'number') {
      targetMins = Math.max(0, shift.startMins - 15);
    } else if (shift.startHour) {
      const sMins = parseTimeToMinutes(shift.startHour, shift.startMinute, shift.startAmPm);
      targetMins = Math.max(0, sMins - 15);
    } else {
      targetMins = 0;
    }
    await addTempSlotByMinutes(targetMins);
  };

  // Helper to add 15-min slot AFTER a specific shift
  const handleAddSlotAfterForShift = async (shift: any) => {
    if (!selectedDoctor || !shift) return;
    let targetMins: number;
    if (shift.slots && shift.slots.length > 0) {
      const lastSlot = shift.slots[shift.slots.length - 1];
      const [timePart, ampm] = lastSlot.split(' ');
      const [h, m] = timePart.split(':');
      const lastMins = parseTimeToMinutes(h, m, ampm as 'AM' | 'PM');
      const shiftEndMins = typeof shift.endMins === 'number'
        ? shift.endMins
        : (shift.endHour ? parseTimeToMinutes(shift.endHour, shift.endMinute, shift.endAmPm) : lastMins);
      targetMins = Math.max(shiftEndMins, lastMins + 15);
    } else if (typeof shift.slotAfterMins === 'number') {
      targetMins = shift.slotAfterMins;
    } else if (typeof shift.endMins === 'number') {
      targetMins = shift.endMins;
    } else if (shift.endHour) {
      targetMins = parseTimeToMinutes(shift.endHour, shift.endMinute, shift.endAmPm);
    } else {
      targetMins = 24 * 60;
    }
    await addTempSlotByMinutes(targetMins);
  };

  const sortTimeSlotsChronologically = (slots: string[]): string[] => {
    return [...slots].sort((a, b) => {
      const parseSlotStr = (s: string) => {
        const [timePart, ampm] = s.split(' ');
        const [h, m] = timePart.split(':');
        return parseTimeToMinutes(h, m, ampm as 'AM' | 'PM');
      };
      return parseSlotStr(a) - parseSlotStr(b);
    });
  };

  // Compute available 15-minute time slots (Regular + Temporary) for selected doctor
  const selectedDocObj = availableDoctors.find((d) => d.name === selectedDoctor);
  const timeSlotsList = useMemo(() => {
    if (!selectedDoctor) return [];

    let regularSlots: string[] = [];

    if (consultationMode === 'Online') {
      // 24 Hours Time Slots for Online Consultation (12:00 AM to 11:45 PM every 15 mins)
      for (let mins = 0; mins < 24 * 60; mins += 15) {
        regularSlots.push(formatMinutesToTimeStr(mins));
      }
    } else {
      const defaultFallbackRanges: TimeSlot[] = [{
        startHour: '10', startMinute: '00', startAmPm: 'AM',
        endHour: '01', endMinute: '00', endAmPm: 'PM'
      }];

      const activeBranchStr = selectedBranch || currentBranch || '';
      if (selectedDocObj && selectedDocObj.branchSchedules && selectedDocObj.branchSchedules.length > 0) {
        const normSelectedBranch = activeBranchStr.toLowerCase().replace(/\s*branch\s*/i, '').trim();
        const matchBs = selectedDocObj.branchSchedules.find((bs) => {
          const normBsBranch = (bs.targetBranch || '').toLowerCase().replace(/\s*branch\s*/i, '').trim();
          return normBsBranch.includes(normSelectedBranch) || normSelectedBranch.includes(normBsBranch);
        });

        if (matchBs && matchBs.daySchedules?.[selectedDayName]) {
          const daySched = matchBs.daySchedules[selectedDayName];
          if (daySched.status === 'Available' && daySched.slots && daySched.slots.length > 0) {
            regularSlots = generate15MinSlotsFromRanges(daySched.slots);
          }
        }
      }

      if (regularSlots.length === 0 && (!selectedDocObj?.branchSchedules || selectedDocObj.branchSchedules.length === 0)) {
        regularSlots = generate15MinSlotsFromRanges(defaultFallbackRanges);
      }
    }

    // Find temporary slots for selected doctor, appointment date, and branch
    const normSelectedDoc = (selectedDoctor || '').toLowerCase().trim();
    const normSelectedBranch = (selectedBranch || currentBranch || '').toLowerCase().replace(/\s*branch\s*/i, '').trim();

    const matchedTempDocs = tempSlotsList.filter((ts) => {
      const sameDoc = (ts.doctorName || '').toLowerCase().trim() === normSelectedDoc;
      const sameDate = ts.appointmentDate === appointmentDate;
      const tsBranch = (ts.branch || '').toLowerCase().replace(/\s*branch\s*/i, '').trim();
      const sameBranch = !tsBranch || tsBranch.includes(normSelectedBranch) || normSelectedBranch.includes(tsBranch);
      return sameDoc && sameDate && sameBranch;
    });

    const tempSlotStrings: string[] = [];
    matchedTempDocs.forEach((ts) => {
      const slotRanges: TimeSlot[] = [{
        startHour: ts.startHour,
        startMinute: ts.startMinute,
        startAmPm: ts.startAmPm,
        endHour: ts.endHour,
        endMinute: ts.endMinute,
        endAmPm: ts.endAmPm,
      }];
      const slots = generate15MinSlotsFromRanges(slotRanges);
      slots.forEach((s) => {
        if (!tempSlotStrings.includes(s)) {
          tempSlotStrings.push(s);
        }
      });
    });

    const combinedSlots = Array.from(new Set([...regularSlots, ...tempSlotStrings]));
    const sorted = sortTimeSlotsChronologically(combinedSlots);

    let availableList = sorted;
    if (activeNoShowForSelectedDoc) {
      const { availableSlots } = filterSlotsByNoShow(sorted, activeNoShowForSelectedDoc);
      availableList = availableSlots;
    }

    // We return all valid slots without filtering out past slots so past slots remain visible but blocked in UI
    return availableList;
  }, [selectedDoctor, selectedDocObj, selectedDayName, selectedBranch, currentBranch, appointmentDate, tempSlotsList, activeNoShowForSelectedDoc, consultationMode]);

  // Extract configured doctor shifts for selected doctor, day, and branch
  const doctorConfiguredShifts = useMemo(() => {
    if (consultationMode === 'Online') return [];
    if (!selectedDocObj || !selectedDocObj.branchSchedules || selectedDocObj.branchSchedules.length === 0) return [];
    const activeBranchStr = selectedBranch || currentBranch || '';
    const normActiveBranch = activeBranchStr.toLowerCase().replace(/\s*branch\s*/i, '').trim();
    const matchBs = selectedDocObj.branchSchedules.find((bs) => {
      const normBsBranch = (bs.targetBranch || '').toLowerCase().replace(/\s*branch\s*/i, '').trim();
      return normBsBranch.includes(normActiveBranch) || normActiveBranch.includes(normBsBranch);
    });
    if (matchBs && matchBs.daySchedules?.[selectedDayName]) {
      const daySched = matchBs.daySchedules[selectedDayName];
      if (daySched.status === 'Available' && daySched.slots && daySched.slots.length > 0) {
        return daySched.slots;
      }
    }
    return [];
  }, [selectedDocObj, selectedBranch, currentBranch, selectedDayName, consultationMode]);

  // Compute shift groups with slots and per-shift before/after targets
  const doctorShiftGroups = useMemo(() => {
    if (timeSlotsList.length === 0) return [];

    if (doctorConfiguredShifts.length <= 1) {
      const earliestMins = parseTimeToMinutes(
        timeSlotsList[0].split(' ')[0].split(':')[0],
        timeSlotsList[0].split(' ')[0].split(':')[1],
        timeSlotsList[0].split(' ')[1] as 'AM' | 'PM'
      );
      const latestMins = parseTimeToMinutes(
        timeSlotsList[timeSlotsList.length - 1].split(' ')[0].split(':')[0],
        timeSlotsList[timeSlotsList.length - 1].split(' ')[0].split(':')[1],
        timeSlotsList[timeSlotsList.length - 1].split(' ')[1] as 'AM' | 'PM'
      );

      const beforeMins = Math.max(0, earliestMins - 15);
      const afterMins = latestMins + 15;

      return [{
        shiftIndex: 0,
        label: doctorConfiguredShifts.length === 1
          ? `${doctorConfiguredShifts[0].startHour}:${doctorConfiguredShifts[0].startMinute} ${doctorConfiguredShifts[0].startAmPm} – ${doctorConfiguredShifts[0].endHour}:${doctorConfiguredShifts[0].endMinute} ${doctorConfiguredShifts[0].endAmPm}`
          : 'All Slots',
        startMins: earliestMins,
        endMins: latestMins + 15,
        slots: timeSlotsList,
        slotBeforeStr: formatMinutesToTimeStr(beforeMins),
        slotBeforeMins: beforeMins,
        slotAfterStr: formatMinutesToTimeStr(afterMins),
        slotAfterMins: afterMins,
      }];
    }

    const sortedShifts = [...doctorConfiguredShifts].map((s, idx) => {
      const sMins = parseTimeToMinutes(s.startHour, s.startMinute, s.startAmPm);
      const eMins = parseTimeToMinutes(s.endHour, s.endMinute, s.endAmPm);
      return {
        idx,
        raw: s,
        startMins: sMins,
        endMins: eMins,
        label: `Shift ${idx + 1}: ${s.startHour}:${s.startMinute} ${s.startAmPm} – ${s.endHour}:${s.endMinute} ${s.endAmPm}`
      };
    }).sort((a, b) => a.startMins - b.startMins);

    return sortedShifts.map((shift, i) => {
      const lowerMid = i === 0 ? 0 : (sortedShifts[i - 1].endMins + shift.startMins) / 2;
      const upperMid = i === sortedShifts.length - 1 ? 24 * 60 : (shift.endMins + sortedShifts[i + 1].startMins) / 2;

      const groupSlots = timeSlotsList.filter((slotStr) => {
        const [timePart, ampm] = slotStr.split(' ');
        const [h, m] = timePart.split(':');
        const mins = parseTimeToMinutes(h, m, ampm as 'AM' | 'PM');
        return mins >= lowerMid && mins < upperMid;
      });

      let beforeMins: number;
      let afterMins: number;

      if (groupSlots.length > 0) {
        const firstSlot = groupSlots[0];
        const [t1, a1] = firstSlot.split(' ');
        const [h1, m1] = t1.split(':');
        const firstMins = parseTimeToMinutes(h1, m1, a1 as 'AM' | 'PM');
        beforeMins = Math.max(0, firstMins - 15);

        const lastSlot = groupSlots[groupSlots.length - 1];
        const [t2, a2] = lastSlot.split(' ');
        const [h2, m2] = t2.split(':');
        const lastMins = parseTimeToMinutes(h2, m2, a2 as 'AM' | 'PM');
        afterMins = Math.max(shift.endMins, lastMins + 15);
      } else {
        beforeMins = Math.max(0, shift.startMins - 15);
        afterMins = shift.startMins;
      }

      return {
        shiftIndex: i,
        label: shift.label,
        startMins: shift.startMins,
        endMins: shift.endMins,
        slots: groupSlots,
        slotBeforeStr: formatMinutesToTimeStr(beforeMins),
        slotBeforeMins: beforeMins,
        slotAfterStr: formatMinutesToTimeStr(afterMins),
        slotAfterMins: afterMins,
      };
    });
  }, [timeSlotsList, doctorConfiguredShifts]);

  // Helper to normalize time slot string
  const normalizeSlotTime = (slotStr: string): string => {
    if (!slotStr) return '';
    const trimmed = slotStr.trim();
    const parts = trimmed.split(' ');
    if (parts.length !== 2) return trimmed;
    const [timePart, ampm] = parts;
    const timeSub = timePart.split(':');
    if (timeSub.length < 2) return trimmed;
    const hNum = parseInt(timeSub[0], 10);
    const mNum = parseInt(timeSub[1], 10) || 0;
    const hStr = hNum.toString().padStart(2, '0');
    const mStr = mNum.toString().padStart(2, '0');
    return `${hStr}:${mStr} ${ampm}`;
  };

  // Map of slotTimeStr -> tempDocId for temporary slots
  const tempSlotMap = useMemo(() => {
    const map: Record<string, string> = {};
    if (!selectedDoctor) return map;
    const normSelectedDoc = (selectedDoctor || '').toLowerCase().trim();
    const normSelectedBranch = (selectedBranch || '').toLowerCase().replace(/\s*branch\s*/i, '').trim();

    const matchedTempDocs = tempSlotsList.filter((ts) => {
      const sameDoc = (ts.doctorName || '').toLowerCase().trim() === normSelectedDoc;
      const sameDate = ts.appointmentDate === appointmentDate;
      const tsBranch = (ts.branch || '').toLowerCase().replace(/\s*branch\s*/i, '').trim();
      const sameBranch = !tsBranch || tsBranch.includes(normSelectedBranch) || normSelectedBranch.includes(tsBranch);
      return sameDoc && sameDate && sameBranch;
    });

    matchedTempDocs.forEach((ts) => {
      const slotRanges: TimeSlot[] = [{
        startHour: ts.startHour,
        startMinute: ts.startMinute,
        startAmPm: ts.startAmPm,
        endHour: ts.endHour,
        endMinute: ts.endMinute,
        endAmPm: ts.endAmPm,
      }];
      const slots = generate15MinSlotsFromRanges(slotRanges);
      slots.forEach((s) => {
        const normKey = normalizeSlotTime(s);
        if (ts.id) {
          map[normKey] = ts.id;
        }
      });
    });

    return map;
  }, [selectedDoctor, tempSlotsList, appointmentDate, selectedBranch]);

  // Helper to delete temporary slot from Firestore
  const handleDeleteTempSlot = async (tempDocId: string, slotTime?: string) => {
    try {
      const activeDb = getSafeDb();
      if (!activeDb) return;
      await deleteDoc(doc(activeDb, 'doctor_temp_slots', tempDocId));
      if (slotTime && selectedTimeSlot === slotTime) {
        setSelectedTimeSlot('');
      }
    } catch (e) {
      console.warn('Error deleting temp slot:', e);
    }
  };

  // Pre-computed slot capacity dictionary (computed once per selected doctor, date, and appointments list)
  const slotCapacityMap = useMemo(() => {
    const map: Record<string, { bookedCount: number; remainingSlots: number; isFull: boolean }> = {};
    if (!selectedDoctor) return map;

    const normSelectedDoc = (selectedDoctor || '').toLowerCase().trim();
    const activeAppts = existingAppointments.filter((app) => {
      const normAppDoc = (app.doctorName || app.doctor || '').toLowerCase().trim();
      const sameDoc = normAppDoc === normSelectedDoc;
      const sameDate = (app.appointmentDate || app.date || '') === appointmentDate;
      const notCancelled = app.status !== 'cancelled';
      return sameDoc && sameDate && notCancelled;
    });

    const countByTime: Record<string, number> = {};
    activeAppts.forEach((app) => {
      const timeStr = (app.appointmentTime || app.time || '').trim();
      if (timeStr) {
        countByTime[timeStr] = (countByTime[timeStr] || 0) + 1;
      }
    });

    timeSlotsList.forEach((slotStr) => {
      const trimmedSlot = slotStr.trim();
      const bookedCount = countByTime[trimmedSlot] || 0;
      const remainingSlots = Math.max(0, 3 - bookedCount);
      map[trimmedSlot] = {
        bookedCount,
        remainingSlots,
        isFull: remainingSlots === 0,
      };
    });

    return map;
  }, [selectedDoctor, appointmentDate, existingAppointments, timeSlotsList]);

  // Helper to calculate remaining slots out of 3 capacity for a time slot
  const getSlotCapacityInfo = useCallback((slotTimeStr: string) => {
    const trimmedSlot = (slotTimeStr || '').trim();
    return slotCapacityMap[trimmedSlot] || { bookedCount: 0, remainingSlots: 3, isFull: false };
  }, [slotCapacityMap]);

  // Calendar State: Month & Year switching
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());
  const [calYear, setCalYear] = useState(() => new Date().getFullYear());

  // Dropdown & Modal States
  const [marketingExpanded, setMarketingExpanded] = useState(false);
  const [modeExpanded, setModeExpanded] = useState(false);
  const [doctorExpanded, setDoctorExpanded] = useState(false);
  const [calendarModalOpen, setCalendarModalOpen] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showBookingConfirmModal, setShowBookingConfirmModal] = useState(false);
  const [confirmedBooking, setConfirmedBooking] = useState<any>(null);

  // Native Android Hardware / Gesture Back Navigation Handler
  useEffect(() => {
    if (!isActive) return;

    const onHardwareBack = () => {
      // 1. Close internal modals first if open
      if (existingProfilesModalVisible) {
        setExistingProfilesModalVisible(false);
        return true;
      }
      if (calendarModalOpen) {
        setCalendarModalOpen(false);
        return true;
      }
      if (clockModalOpen) {
        setClockModalOpen(false);
        return true;
      }
      if (showBookingConfirmModal) {
        setShowBookingConfirmModal(false);
        return true;
      }

      // 2. Close open dropdowns / suggestion lists if open
      if (showSuggestions) {
        setShowSuggestions(false);
        return true;
      }
      if (branchExpanded) {
        setBranchExpanded(false);
        return true;
      }
      if (marketingExpanded) {
        setMarketingExpanded(false);
        return true;
      }
      if (modeExpanded) {
        setModeExpanded(false);
        return true;
      }
      if (doctorExpanded) {
        setDoctorExpanded(false);
        return true;
      }

      // 3. Otherwise pop cleanly back to Main Dashboard
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
  }, [
    isActive,
    existingProfilesModalVisible,
    calendarModalOpen,
    clockModalOpen,
    showBookingConfirmModal,
    showSuggestions,
    branchExpanded,
    marketingExpanded,
    modeExpanded,
    doctorExpanded,
    onBack,
    onNavigate,
  ]);

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const marketingSourcesList = [
    'Instagram',
    'Facebook',
    'Website',
    'Google',
    'Practo',
    'Referral',
    'Youtube',
    'Walk-in',
    'Old Patient',
  ];

  const consultationModesList = ['In-Clinic', 'Online'];

  // Calculate dynamic days in month and starting day index
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const startDayIndex = new Date(calYear, calMonth, 1).getDay();

  const handlePrevMonth = () => {
    if (calMonth === 0) {
      setCalMonth(11);
      setCalYear(calYear - 1);
    } else {
      setCalMonth(calMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (calMonth === 11) {
      setCalMonth(0);
      setCalYear(calYear + 1);
    } else {
      setCalMonth(calMonth + 1);
    }
  };

  const handleBookAppointment = async () => {
    if (isSubmitting) return;

    if (!patientName.trim() || !phoneNumber.trim()) {
      Alert.alert('Required Fields', 'Please enter Patient Name and Phone Number.');
      return;
    }
    if (!selectedDoctor) {
      Alert.alert('Required Field', 'Please select a Doctor.');
      return;
    }

    if (activeNoShowForSelectedDoc && (activeNoShowForSelectedDoc.type === 'date' || activeNoShowForSelectedDoc.type === 'date_range')) {
      Alert.alert(
        'Doctor No Show',
        `Cannot book appointment. ${selectedDoctor} is marked as NO SHOW at ${selectedBranch} on ${appointmentDate} (${activeNoShowForSelectedDoc.reason}). Please choose another doctor or date.`
      );
      return;
    }

    if (!selectedTimeSlot) {
      Alert.alert('Required Field', 'Please select an available Time Slot.');
      return;
    }

    if (activeNoShowForSelectedDoc) {
      const { availableSlots } = filterSlotsByNoShow([selectedTimeSlot], activeNoShowForSelectedDoc);
      if (availableSlots.length === 0) {
        Alert.alert(
          'Slot Blocked',
          `The selected slot ${selectedTimeSlot} is blocked by Doctor No Show (${activeNoShowForSelectedDoc.reason}). Please select another slot.`
        );
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const activeDb = getSafeDb();
      if (!activeDb) {
        Alert.alert('Database Error', 'Firebase database is initializing. Please try again.');
        setIsSubmitting(false);
        return;
      }

      // REBACK MODE VALIDATIONS
      if (isRebackMode) {
        if (!manualRegId.trim()) {
          Alert.alert('Registration ID Required', 'Please enter a manual Registration ID or Profile ID for Reback Appointment.');
          setIsSubmitting(false);
          return;
        }

        // Verify date is strictly in the past
        const parts = appointmentDate.split('-');
        if (parts.length === 3) {
          const day = parseInt(parts[0], 10);
          const month = parseInt(parts[1], 10) - 1;
          const year = parseInt(parts[2], 10);
          const bookingDateObj = new Date(year, month, day, 23, 59, 59);
          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);

          if (bookingDateObj.getTime() >= todayStart.getTime()) {
            Alert.alert('Past Date Required', 'Reback Appointment only allows previous / past expired dates (not today or future dates).');
            setIsSubmitting(false);
            return;
          }
        }
      }

      let generatedRegId = isRebackMode
        ? (foundProfileInfo?.regId || manualRegId.trim().toUpperCase())
        : (patientData.regID || patientData.registrationId || patientData.patientId);

      const isAutoDocId = typeof generatedRegId === 'string' && /^[a-zA-Z0-9]{20,32}$/.test(generatedRegId.trim());
      if (!isRebackMode && (!generatedRegId || typeof generatedRegId !== 'string' || generatedRegId.trim().length === 0 || isAutoDocId)) {
        generatedRegId = await generateRegistrationId(selectedBranch);
      }

      const newDocRef = doc(collection(activeDb, 'appointments'));
      const docId = newDocRef.id;

      const isExplicitNewPatient = (patientData.source !== 'Old Patient' && marketingSource !== 'Old Patient' && !patientData.patientId && !foundProfileInfo);

      const effectiveBranch = (selectedBranch && selectedBranch !== 'All Branches' && selectedBranch !== 'Select Branch')
        ? selectedBranch
        : (currentBranch && currentBranch !== 'All Branches' ? currentBranch : 'KPHB Branch');

      const appPayload = {
        id: docId,
        appointmentId: docId,
        registrationId: generatedRegId,
        regId: generatedRegId,
        patientName,
        fullName: patientName,
        name: patientName,
        diseases,
        phone: phoneNumber,
        phoneNumber,
        emailAddress,
        marketingSource: (patientData.source === 'Old Patient' || marketingSource === 'Old Patient') ? 'Old Patient' : marketingSource,
        consultationMode,
        branch: effectiveBranch,
        branchName: effectiveBranch,
        targetBranch: effectiveBranch,
        doctorName: sanitizeDoctorName(selectedDoctor, effectiveBranch),
        doctor: sanitizeDoctorName(selectedDoctor, effectiveBranch),
        appointmentDate,
        date: appointmentDate,
        appointmentTime: selectedTimeSlot || '10:00 AM',
        time: selectedTimeSlot || '10:00 AM',
        timeSlot: selectedTimeSlot || '10:00 AM',
        status: isRebackMode ? 'completed' : 'waiting',
        isReback: isRebackMode,
        rebackVisit: isRebackMode,
        historicalVisitDate: isRebackMode ? appointmentDate : undefined,
        isNewPatient: isExplicitNewPatient,
        patientType: isExplicitNewPatient ? 'new' : 'revisit',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // For Reback Appointments: strictly save to appointments ONLY!
      // DO NOT call setDoc on allpatients or patients to prevent duplicate profile creation!
      const writes: Promise<any>[] = [setDoc(newDocRef, appPayload)];
      if (!isRebackMode && isExplicitNewPatient) {
        writes.push(setDoc(doc(activeDb, 'allpatients', docId), appPayload).catch(() => { }));
        writes.push(setDoc(doc(activeDb, 'patients', docId), appPayload).catch(() => { }));
      }
      await Promise.all(writes);

      // Disable WhatsApp, SMS, and FCM notifications for Reback historical entries
      if (!isRebackMode) {
        // Trigger Leonas WhatsApp Booking Notification
        sendBookingWhatsAppNotification({
          patientName,
          phone: phoneNumber,
          date: appointmentDate,
          time: selectedTimeSlot || '10:00 AM',
          doctorName: selectedDoctor,
          branch: effectiveBranch
        }).catch(err => console.error('WhatsApp booking notification error:', err));

        // Trigger SMS Booking Confirmation (DLT Template)
        sendBookingSMS(
          phoneNumber,
          patientName,
          selectedDoctor,
          appointmentDate,
          selectedTimeSlot || '10:00 AM',
          effectiveBranch,
          false
        ).catch(err => console.warn('SMS booking notification notice:', err));

        // Trigger FCM Push Notification and 10-day Firestore retention cleanup
        createBookingNotificationInFirestore({
          patientName,
          appointmentTime: selectedTimeSlot || '10:00 AM',
          appointmentDate,
          branch: effectiveBranch,
          doctorName: selectedDoctor,
          consultationMode
        }).catch(err => console.warn('FCM booking notification notice:', err));
      }

      // Complete Form & Search Reset
      await clearFormAndDraft();
      Keyboard.dismiss();

      // IF REBACK MODE: IMMEDIATELY NAVIGATE TO PATIENT FILE SCREEN
      if (isRebackMode) {
        const fullRebackPatient = {
          ...appPayload,
          id: docId,
          appointmentId: docId,
          patientDocId: patientData.patientId || foundProfileInfo?.docId || docId,
          regId: generatedRegId || patientData.regID || patientData.registrationId || manualRegId,
          registrationId: generatedRegId || patientData.regID || patientData.registrationId || manualRegId,
          patientName: patientName,
          phone: phoneNumber,
          phoneNumber: phoneNumber,
          branch: effectiveBranch,
          branchName: effectiveBranch,
          doctorName: selectedDoctor,
          doctor: selectedDoctor,
          appointmentDate: appointmentDate,
          date: appointmentDate,
          isReback: true,
          rebackVisit: true,
          status: 'completed',
          paymentStatus: 'pending',
          feeCollectionNeeded: true
        };

        if (onNavigate) {
          onNavigate('reception_patient_file', fullRebackPatient);
        } else if (onBack) {
          onBack();
        }
      } else if (onNavigate) {
        // Navigate back cleanly to dashboard for normal booking
        onNavigate('reception_dashboard');
      } else if (onBack) {
        onBack();
      }
    } catch (err) {
      console.warn('Booking offline notice:', err);
      await clearFormAndDraft();
      Keyboard.dismiss();
      if (onNavigate) {
        onNavigate('reception_dashboard');
      } else if (onBack) {
        onBack();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 140 }}
      showsVerticalScrollIndicator={false}
      nestedScrollEnabled={true}
    >
      {/* DRAFT RESTORED BANNER */}
      {draftRestored && (
        <View style={{
          backgroundColor: '#eff6ff',
          borderColor: '#93c5fd',
          borderWidth: 1.5,
          borderRadius: 14,
          paddingHorizontal: 14,
          paddingVertical: 10,
          marginVertical: 10,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
            <Ionicons name="document-text" size={18} color="#0284c7" />
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#0369a1', flex: 1 }}>
              Restored unsaved appointment details from previous session.
            </Text>
          </View>
          <TouchableOpacity
            onPress={clearFormAndDraft}
            style={{
              backgroundColor: '#fee2e2',
              borderColor: '#fca5a5',
              borderWidth: 1,
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: 8
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: '800', color: '#dc2626' }}>Clear</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* CARD 1: PATIENT DETAILS */}
      <View style={[styles.card, { zIndex: (marketingExpanded || modeExpanded || (showSuggestions && patientSuggestions.length > 0)) ? 1000 : 1 }]}>
        <View style={styles.cardHeaderRow}>
          <View style={styles.badgeNumberCircle}>
            <Text style={styles.badgeNumberText}>1</Text>
          </View>
          <Text style={styles.cardTitle}>Patient Details</Text>
          {hasDraft && (
            <View style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              backgroundColor: '#f0fdf4',
              borderColor: '#86efac',
              borderWidth: 1,
              paddingHorizontal: 7,
              paddingVertical: 2,
              borderRadius: 6,
              marginLeft: 8
            }}>
              <Ionicons name="checkmark-circle" size={12} color="#16a34a" />
              <Text style={{ fontSize: 10, fontWeight: '800', color: '#16a34a' }}>Draft Saved</Text>
            </View>
          )}
          <View style={styles.cardHeaderLine} />
        </View>

        {/* REBACK MODE: MANUAL REGISTRATION ID INPUT WITH INSTANT PROFILE LOOKUP */}
        {isRebackMode && (
          <View style={{ marginBottom: 14, position: 'relative', zIndex: 1200 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <Text style={styles.fieldLabel}>
                Registration ID / Profile ID <Text style={{ color: '#dc2626' }}>*</Text>
              </Text>
              {manualRegId.trim().length > 0 && (
                <TouchableOpacity
                  onPress={() => triggerProfileLookup(manualRegId)}
                  disabled={isCheckingRegId}
                >
                  <Text style={{ fontSize: 11, fontWeight: '700', color: isCheckingRegId ? '#94a3b8' : '#0284c7' }}>
                    {isCheckingRegId ? 'Searching...' : 'Fetch Profile'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={[
              styles.inputBox,
              { flexDirection: 'row', alignItems: 'center' },
              regIdError ? { borderColor: '#ef4444', backgroundColor: '#fef2f2' } : (foundProfileInfo || regIdValid) ? { borderColor: '#22c55e', backgroundColor: '#f0fdf4' } : {}
            ]}>
              <Ionicons
                name="card-outline"
                size={16}
                color={regIdError ? '#ef4444' : (foundProfileInfo || regIdValid) ? '#16a34a' : '#64748b'}
                style={{ marginRight: 8 }}
              />
              <TextInput
                style={[styles.inputText, { flex: 1, height: '100%', textTransform: 'uppercase', fontWeight: '700', paddingVertical: 0 }]}
                placeholder="e.g. SPH-KPHB-1052, Profile ID, or Phone"
                placeholderTextColor="#94a3b8"
                autoCapitalize="characters"
                value={manualRegId}
                onFocus={() => {
                  if (manualRegId.trim().length >= 2) {
                    setDebouncedSearchTerm(manualRegId);
                    setShowRegIdSuggestions(true);
                  }
                }}
                onChangeText={(val) => {
                  const cleaned = val.trim().toUpperCase();
                  setManualRegId(cleaned);
                  setRegIdError('');
                  if (foundProfileInfo && foundProfileInfo.regId !== cleaned) {
                    setFoundProfileInfo(null);
                  }
                  if (!cleaned) {
                    setRegIdValid(false);
                    setShowRegIdSuggestions(false);
                  } else {
                    setShowRegIdSuggestions(true);
                    handleSearchChange(cleaned);
                  }
                }}
                onBlur={() => {
                  setTimeout(() => setShowRegIdSuggestions(false), 250);
                  if (manualRegId.trim() && !foundProfileInfo) {
                    triggerProfileLookup(manualRegId);
                  }
                }}
                onSubmitEditing={() => {
                  if (manualRegId.trim()) triggerProfileLookup(manualRegId);
                }}
              />
              {isCheckingRegId ? (
                <ActivityIndicator size="small" color="#0284c7" style={{ marginLeft: 6 }} />
              ) : (foundProfileInfo || regIdValid) ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 6 }}>
                  <Ionicons name="checkmark-circle" size={18} color="#16a34a" />
                  <TouchableOpacity
                    onPress={() => triggerProfileLookup(manualRegId)}
                    style={{ padding: 4 }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="search" size={16} color="#64748b" />
                  </TouchableOpacity>
                </View>
              ) : manualRegId.trim().length > 0 ? (
                <TouchableOpacity
                  onPress={() => triggerProfileLookup(manualRegId)}
                  style={{ padding: 4, marginLeft: 6 }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="search" size={18} color="#0284c7" />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Suggestions Dropdown for Reg ID / Profile ID Search */}
            {showRegIdSuggestions && patientSuggestions.length > 0 && (
              <PatientSuggestionsDropdown
                suggestions={patientSuggestions}
                onSelect={(item) => {
                  handleSelectPatientSuggestion(item);
                  setShowRegIdSuggestions(false);
                }}
              />
            )}

            {/* Profile Found Card */}
            {foundProfileInfo ? (
              <View style={{
                backgroundColor: '#f0fdf4',
                borderColor: '#bbf7d0',
                borderWidth: 1,
                borderRadius: 8,
                padding: 10,
                marginTop: 6
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                    <Ionicons name="checkmark-circle" size={16} color="#16a34a" />
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#166534' }} numberOfLines={1}>
                      Profile Found: {foundProfileInfo.name}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      setFoundProfileInfo(null);
                      setManualRegId('');
                      setPatientName('');
                      setPhoneNumber('');
                      setEmailAddress('');
                      setDiseases('');
                      setRegIdValid(false);
                      setRegIdError('');
                    }}
                    style={{ paddingHorizontal: 6, paddingVertical: 2 }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#dc2626' }}>Clear</Text>
                  </TouchableOpacity>
                </View>
                <Text style={{ fontSize: 11.5, color: '#15803d', marginTop: 3 }}>
                  Reg ID: <Text style={{ fontWeight: '700' }}>{foundProfileInfo.regId}</Text>
                  {foundProfileInfo.phone ? ` • Phone: +91 ${foundProfileInfo.phone}` : ''}
                  {foundProfileInfo.branch ? ` • 📍 ${foundProfileInfo.branch}` : ''}
                </Text>
              </View>
            ) : regIdError ? (
              <Text style={{ fontSize: 11, color: '#dc2626', fontWeight: '700', marginTop: 4 }}>
                ⚠️ {regIdError}
              </Text>
            ) : (regIdValid && !isCheckingRegId && manualRegId.trim()) ? (
              <Text style={{ fontSize: 11, color: '#0284c7', fontWeight: '700', marginTop: 4 }}>
                ✓ New Registration ID (Manual Entry)
              </Text>
            ) : null}
          </View>
        )}

        {/* 2-Column Inputs: Patient Name & Diseases */}
        <View style={[styles.rowTwoCol, { zIndex: (showSuggestions && patientSuggestions.length > 0) ? 1000 : 500 }]}>
          <View style={[styles.colField, { zIndex: 600 }]}>
            <Text style={styles.fieldLabel}>Patient Name</Text>
            <View style={styles.inputBox}>
              <TextInput
                style={[styles.inputText, { flex: 1, height: '100%', paddingVertical: 0 }]}
                placeholder="Enter patient's name"
                placeholderTextColor="#94a3b8"
                value={patientName}
                onFocus={() => {
                  if (patientName) setDebouncedSearchTerm(patientName);
                  setShowSuggestions(true);
                }}
                onChangeText={(val) => {
                  setPatientName(val);
                  handleSearchChange(val);
                }}
              />
            </View>
          </View>

          <View style={styles.colField}>
            <Text style={styles.fieldLabel}>Diseases</Text>
            <View style={styles.inputBox}>
              <TextInput
                style={[styles.inputText, { flex: 1, height: '100%', paddingVertical: 0 }]}
                placeholder="Enter diseases"
                placeholderTextColor="#94a3b8"
                value={diseases}
                onChangeText={setDiseases}
              />
            </View>
          </View>

          {/* Full-width suggestions dropdown spanning both columns to prevent squashing and overlapping */}
          {showSuggestions && patientSuggestions.length > 0 && (
            <PatientSuggestionsDropdown
              suggestions={patientSuggestions}
              onSelect={(item) => {
                handleSelectPatientSuggestion(item);
                setShowSuggestions(false);
              }}
            />
          )}
        </View>

        {/* 2-Column Inputs: Phone (+91) & Email Address */}
        <View style={styles.rowTwoCol}>
          <View style={styles.colField}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <Text style={styles.fieldLabel}>Phone (+91)</Text>
              {(patientData.phone || phoneNumber).replace(/\D/g, '').length >= 10 && (
                <TouchableOpacity
                  onPress={() => handleManualPhoneCheck(patientData.phone || phoneNumber)}
                  disabled={checkingProfilesLoading}
                >
                  {checkingProfilesLoading ? (
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#94a3b8' }}>Checking...</Text>
                  ) : (
                    <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.secondary }}>Check Profiles</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.inputBox}>
              <TextInput
                style={styles.inputText}
                placeholder="Phone"
                placeholderTextColor="#94a3b8"
                keyboardType="phone-pad"
                value={patientData.phone || phoneNumber}
                onChangeText={handlePhoneInputChange}
              />
            </View>
          </View>

          <View style={styles.colField}>
            <Text style={styles.fieldLabel}>Email Address</Text>
            <View style={styles.inputBox}>
              <TextInput
                style={styles.inputText}
                placeholder="Email"
                placeholderTextColor="#94a3b8"
                keyboardType="email-address"
                autoCapitalize="none"
                value={emailAddress}
                onChangeText={setEmailAddress}
              />
            </View>
          </View>
        </View>

        {/* 2-Column Dropdowns: Marketing Source & Mode of Consultation */}
        <View style={[styles.rowTwoCol, { zIndex: 200 }]}>

          {/* Marketing Source Dropdown */}
          <View style={[styles.colField, { zIndex: marketingExpanded ? 300 : 1 }]}>
            <Text style={styles.fieldLabel}>Marketing Source</Text>
            {marketingSource === 'Old Patient' || patientData.source === 'Old Patient' ? (
              <View style={[styles.dropdownBox, { backgroundColor: '#f8fafc', borderColor: '#cbd5e1' }]}>
                <MaterialCommunityIcons name="bullhorn-outline" size={16} color="#64748b" style={{ marginRight: 6 }} />
                <Text style={[styles.dropdownValueText, { color: '#0f172a', fontWeight: '700' }]} numberOfLines={1}>
                  Old Patient
                </Text>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.dropdownBox}
                onPress={() => {
                  setModeExpanded(false);
                  setMarketingExpanded(!marketingExpanded);
                }}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons name="bullhorn-outline" size={16} color="#94a3b8" style={{ marginRight: 6 }} />
                <Text style={[styles.dropdownValueText, marketingSource === 'Select Source' && { color: '#94a3b8' }]} numberOfLines={1}>
                  {marketingSource === 'Select Source' ? 'Select' : marketingSource}
                </Text>
                <Feather name="chevron-down" size={16} color="#94a3b8" style={{ marginLeft: 'auto' }} />
              </TouchableOpacity>
            )}

            {!(marketingSource === 'Old Patient' || patientData.source === 'Old Patient') && marketingExpanded && (
              <View
                style={[styles.floatingMenu, { height: 320 }]}
                onStartShouldSetResponder={() => true}
              >
                <ScrollView
                  nestedScrollEnabled={true}
                  overScrollMode="always"
                  scrollEventThrottle={16}
                  showsVerticalScrollIndicator={true}
                  keyboardShouldPersistTaps="handled"
                  style={{ height: 312 }}
                >
                  {marketingSourcesList.map(src => (
                    <TouchableOpacity
                      key={src}
                      style={styles.floatingOption}
                      onPress={() => { setMarketingSource(src); setMarketingExpanded(false); }}
                    >
                      <Text style={[styles.floatingOptionText, marketingSource === src && { color: '#258ec8', fontWeight: '800' }]}>
                        {src}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>

          {/* Mode of Consultation Dropdown */}
          <View style={[styles.colField, { zIndex: modeExpanded ? 300 : 1 }]}>
            <Text style={styles.fieldLabel}>Mode of Consultation</Text>
            <TouchableOpacity
              style={styles.dropdownBox}
              onPress={() => {
                setMarketingExpanded(false);
                setModeExpanded(!modeExpanded);
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="person-outline" size={16} color="#94a3b8" style={{ marginRight: 6 }} />
              <Text style={styles.dropdownValueText}>{consultationMode}</Text>
              <Feather name="chevron-down" size={16} color="#94a3b8" style={{ marginLeft: 'auto' }} />
            </TouchableOpacity>

            {modeExpanded && (
              <View
                style={styles.floatingMenu}
                onStartShouldSetResponder={() => true}
              >
                {consultationModesList.map(mode => (
                  <TouchableOpacity
                    key={mode}
                    style={styles.floatingOption}
                    onPress={() => { setConsultationMode(mode as any); setModeExpanded(false); }}
                  >
                    <Text style={[styles.floatingOptionText, consultationMode === mode && { color: '#258ec8', fontWeight: '800' }]}>
                      {mode}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

        </View>
      </View>

      {/* CARD 2: APPOINTMENT INFORMATION */}
      <View style={[styles.card, { zIndex: 1 }]}>
        <View style={styles.cardHeaderRow}>
          <View style={styles.badgeNumberCircle}>
            <Text style={styles.badgeNumberText}>2</Text>
          </View>
          <Text style={styles.cardTitle}>Appointment Information</Text>
          <View style={styles.cardHeaderLine} />
        </View>
        {/* 1. Branch */}
        <View style={{ marginBottom: 14, zIndex: isHR ? 500 : 1 }}>
          <Text style={styles.fieldLabel}>Select Branch *</Text>
          {isHR ? (
            <View style={{ position: 'relative' }}>
              <TouchableOpacity
                style={[styles.dropdownBox, { borderColor: '#258ec8', backgroundColor: '#ffffff' }]}
                onPress={() => setBranchExpanded(!branchExpanded)}
                activeOpacity={0.8}
              >
                <Ionicons name="business" size={18} color="#258ec8" style={{ marginRight: 8 }} />
                <Text style={[styles.dropdownValueText, { color: selectedBranch ? '#0f172a' : '#94a3b8', fontWeight: selectedBranch ? '800' : '500' }]}>
                  {selectedBranch || 'Select Branch'}
                </Text>
                <Feather name="chevron-down" size={16} color="#94a3b8" style={{ marginLeft: 'auto' }} />
              </TouchableOpacity>

              {branchExpanded && (
                <View
                  style={styles.floatingMenu}
                  onStartShouldSetResponder={() => true}
                >
                  {CLINIC_BRANCHES.map(b => (
                    <TouchableOpacity
                      key={b}
                      style={styles.floatingOption}
                      onPress={() => {
                        setSelectedBranch(b);
                        setSelectedDoctor('');
                        setSelectedTimeSlot('');
                        setBranchExpanded(false);
                      }}
                    >
                      <Text style={[styles.floatingOptionText, selectedBranch === b && { color: '#258ec8', fontWeight: '800' }]}>
                        {b}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          ) : (
            <View style={[styles.dropdownBox, { backgroundColor: '#f8fafc', borderColor: '#cbd5e1' }]}>
              <Ionicons name="business" size={18} color="#258ec8" style={{ marginRight: 8 }} />
              <Text style={[styles.dropdownValueText, { color: '#0f172a', fontWeight: '800' }]}>
                {selectedBranch || currentBranch}
              </Text>
            </View>
          )}
        </View>

        {/* 2. Date Field - Opens Visual Interactive Calendar Modal */}
        <Text style={styles.fieldLabel}>Date</Text>
        <TouchableOpacity
          style={styles.inputBoxDate}
          onPress={() => setCalendarModalOpen(true)}
          activeOpacity={0.85}
        >
          <Ionicons name="calendar-outline" size={18} color="#258ec8" style={{ marginRight: 10 }} />
          <Text style={styles.inputTextDate}>{appointmentDate}</Text>
          <Ionicons name="calendar-outline" size={18} color="#258ec8" />
        </TouchableOpacity>

        {/* 3. Select Doctor Field */}
        <View style={{ zIndex: doctorExpanded ? 300 : 1, position: 'relative' }}>
          <Text style={styles.fieldLabel}>Select Doctor</Text>
          <TouchableOpacity
            style={styles.dropdownBox}
            onPress={() => setDoctorExpanded(!doctorExpanded)}
            activeOpacity={0.8}
          >
            <Ionicons name="person-outline" size={16} color="#94a3b8" style={{ marginRight: 8 }} />
            <Text style={[styles.dropdownValueText, !selectedDoctor && { color: '#94a3b8' }]} numberOfLines={1}>
              {selectedDoctor || 'Select Doctor'}
            </Text>
            <Feather name="chevron-down" size={16} color="#94a3b8" style={{ marginLeft: 'auto' }} />
          </TouchableOpacity>

          {doctorExpanded && (
            <View
              style={styles.floatingMenu}
              onStartShouldSetResponder={() => true}
            >
              <ScrollView
                nestedScrollEnabled={true}
                overScrollMode="never"
                scrollEventThrottle={16}
                showsVerticalScrollIndicator={true}
                keyboardShouldPersistTaps="handled"
                style={{ maxHeight: 180 }}
              >
                {availableDoctors.length === 0 ? (
                  <View style={{ padding: 10 }}>
                    <Text style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>
                      No doctors available on {selectedDayName} for {selectedBranch || currentBranch}
                    </Text>
                  </View>
                ) : (
                  availableDoctors.map(docObj => {
                    const docNoShow = getActiveDoctorNoShow(noShowsList, docObj.name, selectedBranch || currentBranch, appointmentDate);
                    const isFullDayBlocked = docNoShow && (docNoShow.type === 'date' || docNoShow.type === 'date_range');
                    return (
                      <TouchableOpacity
                        key={docObj.id || docObj.name}
                        style={styles.floatingOption}
                        onPress={() => {
                          setSelectedDoctor(docObj.name);
                          setDoctorExpanded(false);
                          setSelectedTimeSlot('');
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                          <Text style={[
                            styles.floatingOptionText,
                            selectedDoctor === docObj.name && { color: '#258ec8', fontWeight: '800' },
                            isFullDayBlocked && { color: '#dc2626' }
                          ]}>
                            {docObj.name}
                          </Text>
                          {docNoShow && (
                            <View style={{
                              backgroundColor: isFullDayBlocked ? '#fee2e2' : '#fef3c7',
                              paddingHorizontal: 6,
                              paddingVertical: 2,
                              borderRadius: 4
                            }}>
                              <Text style={{
                                fontSize: 9.5,
                                fontWeight: '800',
                                color: isFullDayBlocked ? '#dc2626' : '#b45309'
                              }}>
                                {isFullDayBlocked ? '🚫 NO SHOW' : `⚠️ ${docNoShow.type.toUpperCase()}`}
                              </Text>
                            </View>
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })
                )}
              </ScrollView>
            </View>
          )}
        </View>

        {/* 4. Available Slots Section */}
        <View style={{ marginTop: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="time-outline" size={18} color="#258ec8" />
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#0f172a' }}>Available Slots</Text>
            </View>

            {selectedDoctor ? (
              <View style={{ flexDirection: 'row', gap: 5 }}>
                <TouchableOpacity
                  onPress={handleAddSlotBefore}
                  style={{
                    backgroundColor: '#e0f2fe',
                    borderColor: '#bae6fd',
                    borderWidth: 1,
                    borderRadius: 6,
                    paddingHorizontal: 7,
                    paddingVertical: 3.5,
                  }}
                >
                  <Text style={{ fontSize: 10, fontWeight: '800', color: '#0284c7' }}>
                    + Slot Before
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleAddSlotAfter}
                  style={{
                    backgroundColor: '#e0f2fe',
                    borderColor: '#bae6fd',
                    borderWidth: 1,
                    borderRadius: 6,
                    paddingHorizontal: 7,
                    paddingVertical: 3.5,
                  }}
                >
                  <Text style={{ fontSize: 10, fontWeight: '800', color: '#0284c7' }}>
                    + Slot After
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>

          {/* Active Doctor No-Show Alert Card */}
          {activeNoShowForSelectedDoc && (
            <View style={{
              backgroundColor: (activeNoShowForSelectedDoc.type === 'date' || activeNoShowForSelectedDoc.type === 'date_range') ? '#fef2f2' : '#fffbeb',
              borderColor: (activeNoShowForSelectedDoc.type === 'date' || activeNoShowForSelectedDoc.type === 'date_range') ? '#fecaca' : '#fde68a',
              borderWidth: 1.5,
              borderRadius: 12,
              padding: 12,
              marginBottom: 10,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10
            }}>
              <Feather
                name="user-x"
                size={20}
                color={(activeNoShowForSelectedDoc.type === 'date' || activeNoShowForSelectedDoc.type === 'date_range') ? '#dc2626' : '#d97706'}
              />
              <View style={{ flex: 1 }}>
                <Text style={{
                  fontSize: 12.5,
                  fontWeight: '800',
                  color: (activeNoShowForSelectedDoc.type === 'date' || activeNoShowForSelectedDoc.type === 'date_range') ? '#991b1b' : '#92400e'
                }}>
                  {(activeNoShowForSelectedDoc.type === 'date' || activeNoShowForSelectedDoc.type === 'date_range') ? 'Doctor No Show Active (Full Day Block)' : 'Partial No Show Active'}
                </Text>
                <Text style={{
                  fontSize: 11,
                  color: (activeNoShowForSelectedDoc.type === 'date' || activeNoShowForSelectedDoc.type === 'date_range') ? '#b91c1c' : '#b45309',
                  marginTop: 2
                }}>
                  {selectedDoctor} is marked as NO SHOW at {currentBranch} on {appointmentDate} ({activeNoShowForSelectedDoc.reason}).
                  {(activeNoShowForSelectedDoc.type === 'date' || activeNoShowForSelectedDoc.type === 'date_range')
                    ? ' All booking slots are closed for this doctor.'
                    : ` Blocked slots for ${activeNoShowForSelectedDoc.type === 'session' ? `${activeNoShowForSelectedDoc.session?.toUpperCase()} Session` : `${activeNoShowForSelectedDoc.startTime} - ${activeNoShowForSelectedDoc.endTime}`} have been removed.`}
                </Text>
              </View>
            </View>
          )}

          {consultationMode === 'Online' ? (
            <View style={{
              backgroundColor: '#f8fafc',
              borderRadius: 16,
              padding: 16,
              borderWidth: 1.5,
              borderColor: '#bae6fd',
              alignItems: 'center',
              marginBottom: 12
            }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#0369a1', marginBottom: 10 }}>
                🌐 ONLINE CONSULTATION APPOINTMENT TIME
              </Text>

              <TouchableOpacity
                onPress={() => setClockModalOpen(true)}
                style={{
                  backgroundColor: '#0284c7',
                  paddingHorizontal: 20,
                  paddingVertical: 12,
                  borderRadius: 14,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  elevation: 3
                }}
              >
                <Ionicons name="time" size={22} color="#ffffff" />
                <Text style={{ fontSize: 16, fontWeight: '900', color: '#ffffff' }}>
                  {selectedTimeSlot || '10:00 AM'}
                </Text>
                <Feather name="edit-2" size={16} color="#bae6fd" style={{ marginLeft: 6 }} />
              </TouchableOpacity>

              <Text style={{ fontSize: 11, color: '#64748b', marginTop: 8 }}>
                Tap clock button to open Analog Clock Picker Popup
              </Text>

              <AnalogClockModal
                visible={clockModalOpen}
                onClose={() => setClockModalOpen(false)}
                selectedTimeSlot={selectedTimeSlot}
                onSelectTime={(tStr) => {
                  setSelectedTimeSlot(tStr);
                }}
              />
            </View>
          ) : !selectedDoctor ? (
            <View style={styles.infoBoxPlaceholder}>
              <Ionicons name="information-circle-outline" size={16} color="#94a3b8" style={{ marginRight: 6 }} />
              <Text style={styles.infoBoxText}>
                Please select a doctor and branch to check availability.
              </Text>
            </View>
          ) : timeSlotsList.length === 0 ? (
            <View style={{
              backgroundColor: '#fef2f2',
              borderWidth: 1,
              borderColor: '#fecaca',
              borderRadius: 12,
              padding: 14,
              alignItems: 'center'
            }}>
              <Text style={{ fontSize: 12, color: '#ef4444', fontWeight: '700', textAlign: 'center' }}>
                {activeNoShowForSelectedDoc
                  ? `No booking slots available — ${selectedDoctor} is marked as NO SHOW on ${appointmentDate} (${activeNoShowForSelectedDoc.reason}).`
                  : `No active time slots configured for ${selectedDoctor} on ${selectedDayName}.`}
              </Text>
            </View>
          ) : doctorShiftGroups.length > 1 ? (
            <View style={{ gap: 14 }}>
              {doctorShiftGroups.map((group) => (
                <View
                  key={group.shiftIndex}
                  style={{
                    backgroundColor: '#f8fafc',
                    borderColor: '#e2e8f0',
                    borderWidth: 1.5,
                    borderRadius: 14,
                    padding: 12,
                  }}
                >
                  <View style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 10,
                    paddingBottom: 8,
                    borderBottomWidth: 1,
                    borderBottomColor: '#e2e8f0',
                    flexWrap: 'wrap',
                    gap: 6,
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={{
                        backgroundColor: group.shiftIndex === 0 ? '#fef3c7' : '#e0f2fe',
                        paddingHorizontal: 7,
                        paddingVertical: 3,
                        borderRadius: 6,
                      }}>
                        <Text style={{
                          fontSize: 11,
                          fontWeight: '800',
                          color: group.shiftIndex === 0 ? '#b45309' : '#0369a1',
                        }}>
                          {group.shiftIndex === 0 ? '☀️' : '🌙'} {group.label}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 11, color: '#64748b', fontWeight: '600' }}>
                        ({group.slots.length} slots)
                      </Text>
                    </View>

                    <View style={{ flexDirection: 'row', gap: 5 }}>
                      <TouchableOpacity
                        onPress={() => handleAddSlotBeforeForShift(group)}
                        style={{
                          backgroundColor: '#f0fdf4',
                          borderColor: '#bbf7d0',
                          borderWidth: 1,
                          borderRadius: 6,
                          paddingHorizontal: 7,
                          paddingVertical: 3.5,
                        }}
                      >
                        <Text style={{ fontSize: 10, fontWeight: '800', color: '#15803d' }}>
                          + Before ({group.slotBeforeStr})
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => handleAddSlotAfterForShift(group)}
                        style={{
                          backgroundColor: '#eff6ff',
                          borderColor: '#bfdbfe',
                          borderWidth: 1,
                          borderRadius: 6,
                          paddingHorizontal: 7,
                          paddingVertical: 3.5,
                        }}
                      >
                        <Text style={{ fontSize: 10, fontWeight: '800', color: '#1d4ed8' }}>
                          + After ({group.slotAfterStr})
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>

                  <SlotsGrid
                    timeSlotsList={group.slots}
                    selectedTimeSlot={selectedTimeSlot}
                    getSlotCapacityInfo={getSlotCapacityInfo}
                    tempSlotMap={tempSlotMap}
                    normalizeTimeStr={normalizeSlotTime}
                    onSelectSlot={setSelectedTimeSlot}
                    onDeleteTempSlot={(id) => handleDeleteTempSlot(id)}
                    appointmentDate={appointmentDate}
                  />
                </View>
              ))}
            </View>
          ) : (
            <SlotsGrid
              timeSlotsList={timeSlotsList}
              selectedTimeSlot={selectedTimeSlot}
              getSlotCapacityInfo={getSlotCapacityInfo}
              tempSlotMap={tempSlotMap}
              normalizeTimeStr={normalizeSlotTime}
              onSelectSlot={setSelectedTimeSlot}
              onDeleteTempSlot={(id) => handleDeleteTempSlot(id)}
              appointmentDate={appointmentDate}
            />
          )}
        </View>

      </View>

      {/* CONFIRM APPOINTMENT PRIMARY BUTTON */}
      <TouchableOpacity
        style={[styles.confirmBtn, isSubmitting && { opacity: 0.65 }]}
        onPress={handleBookAppointment}
        disabled={isSubmitting}
        activeOpacity={0.85}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {isSubmitting ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <MaterialCommunityIcons name="shield-check" size={20} color="#ffffff" />
          )}
          <Text style={styles.confirmBtnText}>
            {isSubmitting
              ? (isRebackMode ? 'Booking Reback...' : 'Booking Appointment...')
              : (isRebackMode ? 'Confirm Reback & Open Patient File' : 'Confirm Appointment')}
          </Text>
        </View>
        {!isSubmitting && <Feather name="arrow-right" size={20} color="#ffffff" />}
      </TouchableOpacity>

      {/* VISUAL INTERACTIVE CALENDAR DATE PICKER POPUP MODAL WITH MONTH & YEAR SWITCHING */}
      {calendarModalOpen && (
        <Modal visible={calendarModalOpen} transparent animationType="fade" onRequestClose={() => setCalendarModalOpen(false)}>
          <TouchableOpacity style={styles.calendarModalBackdrop} activeOpacity={1} onPress={() => setCalendarModalOpen(false)}>
            <View style={styles.calendarModalContent} onStartShouldSetResponder={() => true}>

              {/* Calendar Header with Month/Year Navigation Arrows */}
              <View style={styles.calendarHeader}>
                <TouchableOpacity onPress={handlePrevMonth} style={styles.monthNavBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Feather name="chevron-left" size={18} color="#258ec8" />
                </TouchableOpacity>

                <Text style={styles.calendarHeaderTitle}>
                  {monthNames[calMonth]} {calYear}
                </Text>

                <TouchableOpacity onPress={handleNextMonth} style={styles.monthNavBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Feather name="chevron-right" size={18} color="#258ec8" />
                </TouchableOpacity>
              </View>

              {/* Weekday Labels (14.28% each for perfect alignment) */}
              <View style={styles.weekdaysRow}>
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                  <Text key={day} style={styles.weekdayLabel}>{day}</Text>
                ))}
              </View>

              {/* Days Grid with Dynamic Month Days (14.28% each cell) */}
              <View style={styles.daysGrid}>
                {/* Empty padding cells for start of month */}
                {Array.from({ length: startDayIndex }).map((_, idx) => (
                  <View key={`empty-${idx}`} style={styles.dayCellEmpty} />
                ))}

                {/* Numbered Days */}
                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((dayNum) => {
                  const formattedMonth = (calMonth + 1) < 10 ? `0${calMonth + 1}` : `${calMonth + 1}`;
                  const formattedDay = dayNum < 10 ? `0${dayNum}` : `${dayNum}`;
                  const dayStr = `${formattedDay}-${formattedMonth}-${calYear}`;
                  const isSelected = appointmentDate === dayStr;

                  // In reback mode, ONLY past dates before today are allowed
                  const cellDate = new Date(calYear, calMonth, dayNum, 23, 59, 59);
                  const todayStart = new Date();
                  todayStart.setHours(0, 0, 0, 0);
                  const isPastDate = cellDate.getTime() < todayStart.getTime();
                  const isDisabled = isRebackMode && !isPastDate;

                  return (
                    <View key={dayNum} style={styles.dayCellWrapper}>
                      <TouchableOpacity
                        style={[
                          styles.dayCell,
                          isSelected && styles.dayCellSelected,
                          isDisabled && { opacity: 0.25, backgroundColor: '#f1f5f9' }
                        ]}
                        disabled={isDisabled}
                        onPress={() => {
                          if (isDisabled) {
                            Alert.alert('Past Dates Only', 'Reback Appointment only allows previous / past expired dates (not today or future dates).');
                            return;
                          }
                          setAppointmentDate(dayStr);
                          setCalendarModalOpen(false);
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={[
                          styles.dayCellText,
                          isSelected && styles.dayCellTextSelected,
                          isDisabled && { color: '#94a3b8' }
                        ]}>
                          {dayNum}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>

              {/* Bottom Actions: Quick Select & Close */}
              <View style={styles.calendarFooter}>
                {!isRebackMode ? (
                  <TouchableOpacity
                    onPress={() => {
                      const todayStr = getTodayFormatted();
                      setAppointmentDate(todayStr);
                      setCalendarModalOpen(false);
                    }}
                    style={styles.calendarTodayBtn}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="today-outline" size={14} color="#0284c7" style={{ marginRight: 4 }} />
                    <Text style={styles.calendarTodayBtnText}>Today</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    onPress={() => {
                      const yestStr = getYesterdayFormatted();
                      setAppointmentDate(yestStr);
                      setCalendarModalOpen(false);
                    }}
                    style={styles.calendarTodayBtn}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="time-outline" size={14} color="#d97706" style={{ marginRight: 4 }} />
                    <Text style={[styles.calendarTodayBtnText, { color: '#d97706' }]}>Yesterday</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  onPress={() => setCalendarModalOpen(false)}
                  style={styles.calendarCloseBtn}
                  activeOpacity={0.7}
                >
                  <Text style={styles.calendarCloseBtnText}>Close</Text>
                </TouchableOpacity>
              </View>

            </View>
          </TouchableOpacity>
        </Modal>
      )}

      {/* START EXISTING PROFILES MODAL */}
      {existingProfilesModalVisible && (
        <Modal
          visible={existingProfilesModalVisible}
          transparent={true}
          animationType="none"
          onRequestClose={() => setExistingProfilesModalVisible(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setExistingProfilesModalVisible(false)}
          >
            <TouchableOpacity activeOpacity={1} style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <View>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#0f172a' }}>
                    Existing Profiles Found ({existingProfilesList.length})
                  </Text>
                  <Text style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                    Phone: +91 {checkedPhone}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setExistingProfilesModalVisible(false)}>
                  <Ionicons name="close" size={24} color="#64748b" />
                </TouchableOpacity>
              </View>

              <ScrollView style={{ maxHeight: 300, marginBottom: 16 }} nestedScrollEnabled>
                {existingProfilesList.map((prof, index) => (
                  <TouchableOpacity
                    key={`${prof.id || 'prof'}_${prof.registrationId || ''}_${index}`}
                    style={{
                      backgroundColor: '#f8fafc',
                      borderWidth: 1,
                      borderColor: '#e2e8f0',
                      borderRadius: 10,
                      padding: 12,
                      marginBottom: 8,
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                    onPress={() => handleSelectExistingProfile(prof)}
                  >
                    <View style={{ flex: 1 }}>
                      {(() => {
                        const vState = getPatientVisitState(
                          {
                            ...prof,
                            patientName: prof.fullName,
                            phone: prof.phone || checkedPhone,
                            patientDocId: prof.id,
                            regId: prof.registrationId || prof.regNo,
                            source: 'Old Patient',
                            patientType: 'revisit',
                            isNewPatient: false,
                            isExistingProfile: true,
                            collectionName: prof.collectionName || 'patients'
                          },
                          receptionDataStore.getAllCollectionsPool(),
                          receptionDataStore.getPackageMembers()
                        );
                        return (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <Text style={{ fontSize: 14, fontWeight: '700', color: '#0f172a' }}>
                              {prof.fullName}
                            </Text>
                            <View style={{ backgroundColor: vState.badgeBg, borderWidth: 1, borderColor: vState.badgeBorder, paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 4 }}>
                              <Text style={{ fontSize: 9.5, fontWeight: '900', color: vState.badgeColor }}>
                                {vState.badgeText}
                              </Text>
                            </View>
                            {vState.isApp ? (
                              <View style={{ backgroundColor: '#f3e8ff', borderWidth: 1, borderColor: '#d8b4fe', paddingHorizontal: 5, paddingVertical: 1.5, borderRadius: 4 }}>
                                <Text style={{ fontSize: 9.5, fontWeight: '900', color: '#7e22ce' }}>APP</Text>
                              </View>
                            ) : null}
                            {!!prof.branchName && (
                              <View style={{ backgroundColor: '#e0f2fe', borderWidth: 1, borderColor: '#bae6fd', paddingHorizontal: 5, paddingVertical: 1.5, borderRadius: 4 }}>
                                <Text style={{ fontSize: 9.5, fontWeight: '700', color: '#0369a1' }}>
                                  📍 {prof.branchName.replace(/\s*branch\s*/i, '')} Branch
                                </Text>
                              </View>
                            )}
                          </View>
                        );
                      })()}
                      <Text style={{ fontSize: 12, color: '#0284c7', marginTop: 2 }}>
                        Reg ID: {prof.registrationId || prof.regNo}
                      </Text>
                      {!!prof.gender || !!prof.age ? (
                        <Text style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                          {[prof.gender, prof.age ? `${prof.age} YRS` : ''].filter(Boolean).join(' • ')}
                        </Text>
                      ) : null}
                    </View>
                    <View style={{ backgroundColor: '#e0f2fe', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#0284c7' }}>Select</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
                <TouchableOpacity
                  style={{
                    backgroundColor: '#f1f5f9',
                    paddingVertical: 10,
                    paddingHorizontal: 16,
                    borderRadius: 8
                  }}
                  onPress={() => {
                    setBypassPhoneCheck(true);
                    setExistingProfilesModalVisible(false);
                  }}
                >
                  <Text style={{ color: '#475569', fontWeight: '700', fontSize: 13 }}>Create New Patient</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}
      {/* END EXISTING PROFILES MODAL */}

      {/* END EXISTING PROFILES MODAL */}

      {/* DIRECT REBACK APPOINTMENT COLLECT FEE MODAL (NO RAZORPAY, NO SMS/WHATSAPP) */}
      {isRebackMode && savedRebackPatientForPayment && (
        <AppointmentPaymentModal
          visible={showRebackPaymentModal}
          onDismiss={() => {
            setShowRebackPaymentModal(false);
            if (onNavigate) {
              onNavigate('reception_dashboard');
            } else if (onBack) {
              onBack();
            }
          }}
          selectedPatientForPayment={savedRebackPatientForPayment}
          onPaymentSuccess={() => {
            setShowRebackPaymentModal(false);
            Alert.alert(
              'Historical Payment Recorded ✓',
              'Payment record saved to transaction logs without Razorpay or SMS.',
              [
                {
                  text: 'OK',
                  onPress: () => {
                    if (onNavigate) {
                      onNavigate('reception_dashboard');
                    } else if (onBack) {
                      onBack();
                    }
                  }
                }
              ]
            );
          }}
        />
      )}

    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    paddingHorizontal: 16,
  },
  topHeaderNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 14,
    position: 'relative',
  },
  backBtn: {
    position: 'absolute',
    left: 0,
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1e293b',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 16,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
    position: 'relative',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  badgeNumberCircle: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: '#258ec8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeNumberText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  cardTitle: {
    fontSize: 15.5,
    fontWeight: '800',
    color: '#1e293b',
  },
  cardHeaderLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#f1f5f9',
    marginLeft: 6,
  },
  rowTwoCol: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
    position: 'relative',
  },
  colField: {
    flex: 1,
    position: 'relative',
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 6,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 46,
  },
  inputBoxFixedBranch: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 46,
    marginBottom: 12,
  },
  fixedBranchText: {
    fontSize: 13,
    color: '#0f172a',
    fontWeight: '800',
    flex: 1,
  },
  fixedLockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  fixedLockBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#258ec8',
  },
  inputText: {
    flex: 1,
    height: '100%',
    paddingVertical: 0,
    fontSize: 12.5,
    color: '#0f172a',
    fontWeight: '500',
  },
  dropdownBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 46,
  },
  dropdownValueText: {
    fontSize: 12.5,
    color: '#0f172a',
    fontWeight: '500',
    flex: 1,
  },
  inputBoxDate: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#258ec8',
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
    marginBottom: 12,
  },
  inputTextDate: {
    flex: 1,
    fontSize: 13.5,
    color: '#0f172a',
    fontWeight: '700',
  },
  floatingMenu: {
    position: 'absolute',
    top: 72,
    left: 0,
    right: 0,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 14,
    paddingVertical: 4,
    paddingHorizontal: 4,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 12,
    zIndex: 1000,
  },
  floatingOption: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  floatingOptionText: {
    fontSize: 12.5,
    color: '#334155',
    fontWeight: '600',
  },
  infoBoxPlaceholder: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#f1f5f9',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoBoxText: {
    fontSize: 11.5,
    color: '#64748b',
    flex: 1,
  },
  slotsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    gap: 6,
  },
  slotChipColumn: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 2,
    paddingVertical: 5,
    width: '100%',
  },
  slotChipSelected: {
    backgroundColor: '#258ec8',
    borderColor: '#258ec8',
  },
  slotChipText: {
    fontSize: 10.5,
    color: '#475569',
    fontWeight: '600',
  },
  slotChipTextSelected: {
    color: '#ffffff',
    fontWeight: '800',
  },
  confirmBtn: {
    backgroundColor: '#258ec8',
    borderRadius: 16,
    height: 52,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#258ec8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
    marginTop: 4,
  },
  confirmBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
  },
  calendarModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  calendarModalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 16,
    width: '100%',
    maxWidth: 340,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 10,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  monthNavBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  calendarHeaderTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
  },
  weekdaysRow: {
    flexDirection: 'row',
    width: '100%',
    marginBottom: 6,
  },
  weekdayLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    width: '14.285%',
    textAlign: 'center',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: '100%',
  },
  dayCellEmpty: {
    width: '14.285%',
    height: 38,
  },
  dayCellWrapper: {
    width: '14.285%',
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCell: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCellSelected: {
    backgroundColor: '#258ec8',
  },
  dayCellText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0f172a',
  },
  dayCellTextSelected: {
    color: '#ffffff',
    fontWeight: '800',
  },
  calendarFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  calendarTodayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  calendarTodayBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1d4ed8',
  },
  calendarCloseBtn: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  calendarCloseBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
});

interface SlotButtonProps {
  slot: string;
  isSelected: boolean;
  isFull: boolean;
  isPastSlot?: boolean;
  isTemp: boolean;
  remainingSlots: number;
  normKey: string;
  tempDocId?: string;
  onSelectSlot: (slot: string) => void;
  onDeleteTempSlot: (tempDocId: string) => void;
}

const SlotButton = React.memo<SlotButtonProps>(({
  slot,
  isSelected,
  isFull,
  isPastSlot,
  isTemp,
  remainingSlots,
  normKey,
  tempDocId,
  onSelectSlot,
  onDeleteTempSlot,
}) => {
  const isDisabled = isFull || !!isPastSlot;

  return (
    <View style={{ width: '23.2%', paddingTop: 6, paddingRight: 6, position: 'relative', marginBottom: 6 }}>
      <TouchableOpacity
        disabled={isDisabled}
        style={[
          styles.slotChipColumn,
          isTemp && {
            borderColor: '#dc2626',
            borderWidth: 2,
            backgroundColor: isSelected ? '#dc2626' : '#fff5f5',
          },
          isSelected && !isTemp && styles.slotChipSelected,
          isSelected && isTemp && { backgroundColor: '#dc2626', borderColor: '#991b1b', borderWidth: 2 },
          isDisabled && { backgroundColor: '#f1f5f9', borderColor: '#cbd5e1', opacity: 0.6 }
        ]}
        onPress={() => {
          if (!isDisabled) {
            onSelectSlot(slot);
          }
        }}
        activeOpacity={isDisabled ? 1 : 0.8}
      >
        <Text style={[
          styles.slotChipText,
          isTemp && !isSelected && { color: '#dc2626', fontWeight: '800' },
          isSelected && styles.slotChipTextSelected,
          isDisabled && { color: '#94a3b8', textDecorationLine: 'line-through' }
        ]}>
          {slot}
        </Text>
        <View
          style={{
            marginTop: 2,
            paddingHorizontal: 3,
            paddingVertical: 1,
            borderRadius: 4,
            backgroundColor: isSelected
              ? 'rgba(255, 255, 255, 0.25)'
              : isTemp
                ? '#fee2e2'
                : isPastSlot
                  ? '#fee2e2'
                  : isFull
                    ? '#fee2e2'
                    : remainingSlots === 1
                      ? '#fef3c7'
                      : '#e0f2fe'
          }}
        >
          <Text
            style={{
              fontSize: 8,
              fontWeight: '800',
              color: isSelected
                ? '#ffffff'
                : isTemp
                  ? '#dc2626'
                  : isPastSlot
                    ? '#dc2626'
                    : isFull
                      ? '#ef4444'
                      : remainingSlots === 1
                        ? '#b45309'
                        : '#0369a1'
            }}
          >
            {isPastSlot ? 'CLOSED' : (isFull ? 'FULL' : `${remainingSlots} left`)}
          </Text>
        </View>
      </TouchableOpacity>

      {isTemp && tempDocId ? (
        <TouchableOpacity
          onPress={() => {
            if (tempDocId) {
              onDeleteTempSlot(tempDocId);
            }
          }}
          activeOpacity={0.6}
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            backgroundColor: '#dc2626',
            borderColor: '#ffffff',
            borderWidth: 2,
            borderRadius: 12,
            width: 24,
            height: 24,
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 9999,
            elevation: 20,
          }}
        >
          <Ionicons name="close" size={13} color="#ffffff" />
        </TouchableOpacity>
      ) : null}
    </View>
  );
});

interface SlotsGridProps {
  timeSlotsList: string[];
  selectedTimeSlot: string;
  getSlotCapacityInfo: (slot: string) => { remainingSlots: number; isFull: boolean };
  tempSlotMap: Record<string, string>;
  normalizeTimeStr: (str: string) => string;
  onSelectSlot: (slot: string) => void;
  onDeleteTempSlot: (tempDocId: string) => void;
  appointmentDate?: string;
}

const SlotsGrid = React.memo<SlotsGridProps>(({
  timeSlotsList,
  selectedTimeSlot,
  getSlotCapacityInfo,
  tempSlotMap,
  normalizeTimeStr,
  onSelectSlot,
  onDeleteTempSlot,
  appointmentDate,
}) => {
  const todayStr = new Date().toISOString().split('T')[0];
  const isToday = appointmentDate ? (appointmentDate === todayStr || normalizeToISODate(appointmentDate) === todayStr) : false;
  const now = new Date();
  const currentMins = now.getHours() * 60 + now.getMinutes();

  return (
    <View style={[styles.slotsGrid, { overflow: 'visible', paddingTop: 8, paddingRight: 6 }]}>
      {timeSlotsList.map((slot) => {
        const isSelected = selectedTimeSlot === slot;
        const { remainingSlots, isFull } = getSlotCapacityInfo(slot);
        const normKey = normalizeTimeStr(slot);
        const tempDocId = tempSlotMap[normKey] || tempSlotMap[slot.trim()];
        const isTemp = !!tempDocId;

        let isPastSlot = false;
        if (isToday) {
          const parts = slot.trim().split(/\s+/);
          if (parts.length >= 2) {
            const [hStr, mStr] = parts[0].split(':');
            const ampm = parts[1].toUpperCase() as 'AM' | 'PM';
            const slotMins = parseTimeToMinutes(hStr, mStr, ampm);
            if (slotMins < currentMins) {
              isPastSlot = true;
            }
          }
        }

        return (
          <SlotButton
            key={slot}
            slot={slot}
            isSelected={isSelected}
            isFull={isFull}
            isPastSlot={isPastSlot}
            isTemp={isTemp}
            remainingSlots={remainingSlots}
            normKey={normKey}
            tempDocId={tempDocId}
            onSelectSlot={onSelectSlot}
            onDeleteTempSlot={onDeleteTempSlot}
          />
        );
      })}
    </View>
  );
});

interface PatientSuggestionRowProps {
  item: any;
  isLast: boolean;
  onSelect: (item: any) => void;
}

const PatientSuggestionRow = React.memo<PatientSuggestionRowProps>(({ item, isLast, onSelect }) => (
  <TouchableOpacity
    onPress={() => onSelect(item)}
    activeOpacity={0.7}
    style={{
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: isLast ? 0 : 1,
      borderBottomColor: '#f1f5f9',
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#ffffff',
    }}
  >
    <View
      style={{
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: '#eff6ff',
        borderWidth: 1,
        borderColor: '#dbeafe',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
      }}
    >
      <Ionicons name="person" size={18} color="#0284c7" />
    </View>

    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
        <Text style={{ fontSize: 13.5, fontWeight: '700', color: '#0f172a' }}>
          {item.name || 'Unnamed Patient'}
        </Text>
        {(item.regId || item.id) ? (
          <View style={{ backgroundColor: '#e0f2fe', borderWidth: 1, borderColor: '#bae6fd', paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 6 }}>
            <Text style={{ fontSize: 9.5, fontWeight: '800', color: '#0284c7' }}>
              🆔 {item.regId || item.id}
            </Text>
          </View>
        ) : null}
        {item.branch ? (
          <View style={{ backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 6 }}>
            <Text style={{ fontSize: 9.5, fontWeight: '600', color: '#475569' }}>
              📍 {item.branch}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3, flexWrap: 'wrap', gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0f9ff', borderWidth: 1, borderColor: '#bae6fd', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
          <Feather name="phone" size={10} color="#0369a1" style={{ marginRight: 4 }} />
          <Text style={{ fontSize: 11, fontWeight: '700', color: '#0369a1' }}>
            {item.phone || 'No Phone'}
          </Text>
        </View>

        {item.diseases ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
            <MaterialCommunityIcons name="stethoscope" size={12} color="#64748b" style={{ marginRight: 3 }} />
            <Text style={{ fontSize: 11, color: '#64748b' }} numberOfLines={1}>
              {item.diseases}
            </Text>
          </View>
        ) : null}
      </View>
    </View>

    <Feather name="chevron-right" size={16} color="#cbd5e1" style={{ marginLeft: 6 }} />
  </TouchableOpacity>
));

interface PatientSuggestionsDropdownProps {
  suggestions: any[];
  onSelect: (item: any) => void;
}

const PatientSuggestionsDropdown = React.memo<PatientSuggestionsDropdownProps>(({
  suggestions,
  onSelect,
}) => {
  return (
    <View
      style={{
        position: 'absolute',
        top: 72,
        left: 0,
        right: 0,
        backgroundColor: '#ffffff',
        borderWidth: 1,
        borderColor: '#cbd5e1',
        borderRadius: 16,
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.18,
        shadowRadius: 18,
        elevation: 25,
        zIndex: 99999,
        maxHeight: 340,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          paddingHorizontal: 16,
          paddingVertical: 8,
          backgroundColor: '#f8fafc',
          borderBottomWidth: 1,
          borderBottomColor: '#f1f5f9',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Text style={{ fontSize: 10, fontWeight: '800', letterSpacing: 0.8, color: '#64748b', textTransform: 'uppercase' }}>
          MATCHING PATIENTS
        </Text>
        <View style={{ backgroundColor: '#e0f2fe', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 }}>
          <Text style={{ fontSize: 10, fontWeight: '700', color: '#0369a1' }}>
            {suggestions.length} Found
          </Text>
        </View>
      </View>

      <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={{ maxHeight: 270 }}>
        {suggestions.map((item, idx) => (
          <PatientSuggestionRow
            key={idx}
            item={item}
            isLast={idx === suggestions.length - 1}
            onSelect={onSelect}
          />
        ))}
      </ScrollView>
    </View>
  );
});
