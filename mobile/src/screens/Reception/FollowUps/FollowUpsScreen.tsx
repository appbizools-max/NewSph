import React, { useState, useMemo, useEffect, useCallback, memo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Linking, ActivityIndicator, ScrollView, Modal, TextInput, Alert, Platform } from 'react-native';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { sendBookingWhatsAppNotification, sendRescheduleWhatsAppNotification, sendBookingSMS, sendRescheduleSMS, CanonicalBranchId, resolveCanonicalBranchId, getBranchQueryNames, sanitizeDoctorName } from '@app/shared';
import { getSafeDb, collection, onSnapshot, query, limit, updateDoc, doc, addDoc, orderBy, getDocs, where, setDoc } from '../../../utils/firebaseSafe';
import { receptionDataStore } from '../../../utils/receptionDataStore';
import { getPatientVisitState } from '../../../utils/patientVisitState';
import { createBookingNotificationInFirestore } from '../../../utils/fcmService';

export interface FollowUp {
  id: string;
  patientName: string;
  phone: string;
  regId: string;
  doctorName: string;
  branchName: string;
  preferredDate: string;
  followUpInterval?: string;
  diseases?: string;
  status: 'today' | 'overdue' | 'this_month' | 'next_month' | 'upcoming';
  dateMs?: number;
  raw?: any;
}

interface FollowUpsScreenProps {
  currentBranch?: string;
  branchId?: CanonicalBranchId;
  onNavigate?: (tab: string, data?: any) => void;
}

type FilterMode = 'today' | 'overdue' | 'this_month' | 'next_month' | 'selected_month' | 'custom_date' | 'all';

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export const MONTH_NAMES_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

// The 4 Core SPH Consulting Doctors
const SPH_DOCTORS = [
  'Dr. Prashanth K Vaidya',
  'Dr. Ramakrishna Chanduri',
  'Dr. Jobedah Parveez',
  'Dr. Padma Priya'
];

interface TimeSlot {
  startHour: string;
  startMinute: string;
  startAmPm: 'AM' | 'PM';
  endHour: string;
  endMinute: string;
  endAmPm: 'AM' | 'PM';
}

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
  branch?: string;
  assignedBranch?: string;
  branchSchedules?: BranchSchedule[];
}

const DEFAULT_DOCTORS_SEED: Doctor[] = [
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

// Time conversion helpers for 15-min slot generation
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

const getDayNameFromDate = (dateStr: string): DayName => {
  if (!dateStr) return 'Mon';
  const clean = dateStr.trim();
  const parts = clean.split('-');
  if (parts.length === 3) {
    let y = parseInt(parts[0], 10);
    let m = parseInt(parts[1], 10) - 1;
    let d = parseInt(parts[2], 10);
    if (parts[0].length === 2 && parts[2].length === 4) {
      d = parseInt(parts[0], 10);
      m = parseInt(parts[1], 10) - 1;
      y = parseInt(parts[2], 10);
    }
    const dateObj = new Date(y, m, d);
    if (!isNaN(dateObj.getTime())) {
      const days: DayName[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      return days[dateObj.getDay()];
    }
  }
  return 'Mon';
};

export const normalizeBranchKey = (branch?: string): string => {
  if (!branch) return '';
  const s = branch.toLowerCase().trim();
  if (s.includes('kphb') || s.includes('kukatpally')) return 'kphb';
  if (s.includes('chanda') || s.includes('chnr') || s.includes('chandna')) return 'chanda';
  if (s.includes('dilshuk') || s.includes('dilsukh') || s.includes('dsnr') || s.includes('dshnr')) return 'dsnr';
  if (s.includes('nalla')) return 'nalla';
  return s.replace(/\s*branch\s*/i, '').trim();
};

export const getCanonicalBranchName = (branch?: string): string => {
  const k = normalizeBranchKey(branch);
  if (k === 'kphb') return 'KPHB Branch';
  if (k === 'chanda') return 'Chandanagar Branch';
  if (k === 'dsnr') return 'Dilshuknagar Branch';
  if (k === 'nalla') return 'Nallagandla Branch';
  return (branch || '').trim();
};

const normalizeBranchName = (b: string): string => {
  return normalizeBranchKey(b);
};

const normalizeDocName = (name: string): string => {
  return (name || '')
    .toLowerCase()
    .replace(/^(dr\.?\s*)+/i, '')
    .replace(/[^a-z0-9]/g, '');
};

const getCanonicalDoctorName = (rawName: string): string => {
  return sanitizeDoctorName(rawName);
};

const isSameDoctor = (name1: string, name2: string): boolean => {
  const c1 = getCanonicalDoctorName(name1);
  const c2 = getCanonicalDoctorName(name2);
  if (c1 === c2) return true;
  const n1 = normalizeDocName(name1);
  const n2 = normalizeDocName(name2);
  if (!n1 || !n2) return false;
  return n1 === n2 || n1.includes(n2) || n2.includes(n1);
};

const STANDARD_FALLBACK_SLOTS = [
  '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM',
  '12:00 PM', '12:30 PM', '01:00 PM', '01:30 PM',
  '05:00 PM', '05:30 PM', '06:00 PM', '06:30 PM',
  '07:00 PM', '07:30 PM', '08:00 PM', '08:30 PM'
];

const getAvailableDoctors = (dateStr: string, branchName?: string, doctorsList: Doctor[] = DEFAULT_DOCTORS_SEED): string[] => {
  const dayName = getDayNameFromDate(dateStr);
  const normBranch = normalizeBranchKey(branchName || 'KPHB Branch');

  return SPH_DOCTORS.filter(docName => {
    const docObj = doctorsList.find(d => isSameDoctor(d.name, docName));
    if (!docObj || !docObj.branchSchedules) return false;

    const bs = docObj.branchSchedules.find(b => {
      const bTarget = normalizeBranchKey(b.targetBranch);
      return bTarget === normBranch;
    });
    if (!bs || !bs.daySchedules || !bs.daySchedules[dayName]) return false;
    const sched = bs.daySchedules[dayName];
    return sched.status === 'Available' && sched.slots && sched.slots.length > 0;
  });
};

const getLocalDateISO = (date: Date = new Date()): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const getYesterdayDateISO = (): string => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return getLocalDateISO(d);
};

const now = new Date();
const todayStr = getLocalDateISO(now);
const yesterdayStr = getYesterdayDateISO();

const getMonthYearStr = (dateObj: Date): string => {
  const yyyy = dateObj.getFullYear();
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}`;
};

const thisMonthStr = getMonthYearStr(now);
const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
const nextMonthStr = getMonthYearStr(nextMonthDate);

const monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export const isBranchMatching = (b1: string, b2?: string): boolean => {
  if (!b2) return true;
  const cleanB2 = b2.trim().toLowerCase();
  if (cleanB2 === 'all' || cleanB2 === 'all branches' || cleanB2 === 'all branch') return true;
  const k1 = normalizeBranchKey(b1);
  const k2 = normalizeBranchKey(b2);
  if (!k1 || !k2) return false;
  return k1 === k2;
};

const getTodayDDMMYYYY = (): string => {
  const today = new Date();
  const d = String(today.getDate()).padStart(2, '0');
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const y = today.getFullYear();
  return `${d}-${m}-${y}`;
};

const toDDMMYYYY = (dateStr: string): string => {
  if (!dateStr) return getTodayDDMMYYYY();
  const clean = String(dateStr).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    const [y, m, d] = clean.split('-');
    return `${d}-${m}-${y}`;
  }
  return clean;
};

const areDatesEqual = (d1: string, d2: string): boolean => {
  if (!d1 || !d2) return false;
  if (d1 === d2) return true;
  const toDDMM = (s: string) => {
    const clean = String(s).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
      const [y, m, d] = clean.split('-');
      return `${d}-${m}-${y}`;
    }
    return clean;
  };
  return toDDMM(d1) === toDDMM(d2);
};

// Date display formatting helper: "DD-MM-YYYY"
const formatDisplayDate = (dateStr: string): string => {
  if (!dateStr) return 'Pending Date';
  const clean = String(dateStr).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    const [y, m, d] = clean.split('-');
    return `${d}-${m}-${y}`;
  }
  if (/^\d{2}-\d{2}-\d{4}$/.test(clean)) {
    return clean;
  }
  if (clean.includes('T')) {
    const isoDate = clean.split('T')[0];
    const [y, m, d] = isoDate.split('-');
    if (y && m && d) return `${d}-${m}-${y}`;
  }
  return clean;
};

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
  const isToday = areDatesEqual(cleanDate, getTodayDDMMYYYY()) || cleanDate === todayStr;
  if (!isToday) return false;

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const slotMinutes = parseSlotToMinutes(slotStr);
  return slotMinutes < currentMinutes;
};

const SAMPLE_DATA: FollowUp[] = [
  { id: '1', patientName: 'Rajesh Kumar', phone: '9849012345', regId: 'SPH-KPB-0101', doctorName: 'Dr. Prashanth K Vaidya', branchName: 'KPHB Branch', preferredDate: todayStr, followUpInterval: '15 Days', diseases: 'Hypertension', status: 'today' },
  { id: '2', patientName: 'Sneha Reddy', phone: '9121067890', regId: 'SPH-NGL-0102', doctorName: 'Dr. Ramakrishna Chanduri', branchName: 'Nallagandla Branch', preferredDate: yesterdayStr, followUpInterval: '1 Month', diseases: 'Diabetes Management', status: 'overdue' },
  { id: '3', patientName: 'Venkatesh Rao', phone: '9440045678', regId: 'SPH-DIL-0103', doctorName: 'Dr. Jobedah Parveez', branchName: 'Dilshuknagar Branch', preferredDate: `${thisMonthStr}-25`, followUpInterval: '10 Days', diseases: 'General Checkup', status: 'this_month' },
  { id: '4', patientName: 'Ananya Sharma', phone: '9988711223', regId: 'SPH-CHN-0104', doctorName: 'Dr. Padma Priya', branchName: 'Chandanagar Branch', preferredDate: `${nextMonthStr}-10`, followUpInterval: '7 Days', diseases: 'Migraine Followup', status: 'next_month' },
  { id: '5', patientName: 'Kiran Verma', phone: '9876500011', regId: 'SPH-KPB-0105', doctorName: 'Dr. Prashanth K Vaidya', branchName: 'KPHB Branch', preferredDate: `${nextMonthStr}-20`, followUpInterval: '45 Days', diseases: 'Asthma Followup', status: 'next_month' }
];

const FollowUpCardItem = memo(({
  item,
  badge,
  onBook,
  onReschedule,
  onComplete,
  onWhatsApp,
  onCall,
}: {
  item: FollowUp;
  badge: { bg: string; text: string; label: string };
  onBook: (item: FollowUp) => void;
  onReschedule: (item: FollowUp) => void;
  onComplete: (item: FollowUp) => void;
  onWhatsApp: (phone: string, name: string, doc: string) => void;
  onCall: (phone: string) => void;
}) => {
  const visitState = useMemo(() => {
    try {
      const pool = receptionDataStore.getAllCollectionsPool();
      const pkgs = receptionDataStore.getPackageMembers();
      const appObj = item.raw ? { ...item.raw, ...item } : item;
      return getPatientVisitState(appObj, pool, pkgs);
    } catch (e) {
      return null;
    }
  }, [item]);

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1, marginRight: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Text style={styles.patientName} numberOfLines={1}>{item.patientName}</Text>
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
          <Text style={styles.regId}>{item.regId} • {item.phone}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: badge.bg }]}>
          <Text style={[styles.badgeText, { color: badge.text }]}>
            {badge.label}
          </Text>
        </View>
      </View>

      <View style={styles.cardBody}>
        <Text style={styles.infoText} numberOfLines={1}>
          <Text style={styles.boldText}>{item.doctorName}</Text> • <Text style={{ color: '#64748b' }}>{item.branchName}</Text>
        </Text>
        {item.diseases ? (
          <Text style={styles.diagText} numberOfLines={1}>
            {item.diseases}
          </Text>
        ) : null}
      </View>

      <View style={styles.cardFooter}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Feather name="calendar" size={11} color={badge.text} />
          <Text style={[styles.dueDateText, { color: badge.text }]}>
            {formatDisplayDate(item.preferredDate)}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center' }}>
          {/* Quick Mark Complete Button (Hidden as requested, preserved) */}
          {/* 
          <TouchableOpacity
            style={styles.completeBtn}
            onPress={() => onComplete(item)}
            activeOpacity={0.7}
          >
            <Ionicons name="checkmark-circle-outline" size={11} color="#ffffff" />
            <Text style={styles.completeBtnText}>Complete</Text>
          </TouchableOpacity> 
          */}

          {/* Book Appointment Button */}
          <TouchableOpacity
            style={styles.bookBtn}
            onPress={() => onBook(item)}
            activeOpacity={0.7}
          >
            <Ionicons name="calendar-outline" size={11} color="#ffffff" />
            <Text style={styles.bookBtnText}>Book Appt</Text>
          </TouchableOpacity>

          {/* Reschedule Button */}
          <TouchableOpacity
            style={styles.rescheduleBtn}
            onPress={() => onReschedule(item)}
            activeOpacity={0.7}
          >
            <Feather name="clock" size={11} color="#b45309" />
            <Text style={styles.rescheduleBtnText}>Reschedule</Text>
          </TouchableOpacity>

          {/* Quick WhatsApp */}
          <TouchableOpacity
            style={styles.iconBtnWA}
            onPress={() => onWhatsApp(item.phone, item.patientName, item.doctorName)}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons name="whatsapp" size={14} color="#16a34a" />
          </TouchableOpacity>

          {/* Quick Call */}
          <TouchableOpacity
            style={styles.iconBtnCall}
            onPress={() => onCall(item.phone)}
            activeOpacity={0.7}
          >
            <Feather name="phone" size={12} color="#0284c7" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
});

export const FollowUpsScreen: React.FC<FollowUpsScreenProps> = ({
  currentBranch = 'KPHB Branch',
  branchId,
  onNavigate
}) => {
  const [filterMode, setFilterMode] = useState<FilterMode>('today');
  const [customDateISO, setCustomDateISO] = useState<string>(() => todayStr);
  const [customDatePickerVisible, setCustomDatePickerVisible] = useState<boolean>(false);
  const [customCalMonth, setCustomCalMonth] = useState<number>(new Date().getMonth());
  const [customCalYear, setCustomCalYear] = useState<number>(new Date().getFullYear());
  const [selectedFilterMonth, setSelectedFilterMonth] = useState<number>(() => new Date().getMonth());
  const [selectedFilterYear, setSelectedFilterYear] = useState<number>(() => new Date().getFullYear());
  const [monthFilterModalVisible, setMonthFilterModalVisible] = useState<boolean>(false);
  const selectedMonthISO = `${selectedFilterYear}-${String(selectedFilterMonth + 1).padStart(2, '0')}`;
  const [isLoading, setIsLoading] = useState(false);

  const [rawAppointments, setRawAppointments] = useState<any[]>(() => receptionDataStore.getAppointments());
  const [rawAllPatients, setRawAllPatients] = useState<any[]>(() => receptionDataStore.getAllCollectionsPool());
  const [rawFollowups, setRawFollowups] = useState<any[]>([]);
  const [bookedFollowUpIds, setBookedFollowUpIds] = useState<Set<string>>(new Set());

  // Book Appointment Modal State
  const [bookModalItem, setBookModalItem] = useState<FollowUp | null>(null);
  const [bookingDoctor, setBookingDoctor] = useState<string>(SPH_DOCTORS[0]);
  const [bookingDate, setBookingDate] = useState<string>(getTodayDDMMYYYY);
  const [bookingTime, setBookingTime] = useState<string>('10:00 AM');
  const [bookingFee, setBookingFee] = useState<string>('');
  const [isBooking, setIsBooking] = useState<boolean>(false);

  // Reschedule Follow-up Modal State
  const [rescheduleModalItem, setRescheduleModalItem] = useState<FollowUp | null>(null);
  const [rescheduleDateISO, setRescheduleDateISO] = useState<string>(todayStr);
  const [rescheduleReason, setRescheduleReason] = useState<string>('Patient requested date change');
  const [isRescheduling, setIsRescheduling] = useState<boolean>(false);
  const [rescheduleDatePickerVisible, setRescheduleDatePickerVisible] = useState<boolean>(false);
  const [rescheduleCalMonth, setRescheduleCalMonth] = useState<number>(new Date().getMonth());
  const [rescheduleCalYear, setRescheduleCalYear] = useState<number>(new Date().getFullYear());

  // Calendar Modal State
  const [calendarModalVisible, setCalendarModalVisible] = useState<boolean>(false);
  const [calMonth, setCalMonth] = useState<number>(new Date().getMonth());
  const [calYear, setCalYear] = useState<number>(new Date().getFullYear());

  const handlePrevMonth = () => {
    if (calMonth === 0) {
      setCalMonth(11);
      setCalYear(prev => prev - 1);
    } else {
      setCalMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (calMonth === 11) {
      setCalMonth(0);
      setCalYear(prev => prev + 1);
    } else {
      setCalMonth(prev => prev + 1);
    }
  };

  const handleSelectDay = (dayNum: number) => {
    const formattedMonth = (calMonth + 1) < 10 ? `0${calMonth + 1}` : `${calMonth + 1}`;
    const formattedDay = dayNum < 10 ? `0${dayNum}` : `${dayNum}`;
    const dayStr = `${formattedDay}-${formattedMonth}-${calYear}`;
    setBookingDate(dayStr);
    const targetBranch = bookModalItem?.branchName || currentBranch;
    const avail = getAvailableDoctors(dayStr, targetBranch, allDoctorsList);
    const isStillAvail = avail.some(d => isSameDoctor(d, bookingDoctor));
    if (!isStillAvail && avail.length > 0) {
      setBookingDoctor(avail[0]);
    }
    setCalendarModalVisible(false);
  };

  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const startDayIndex = new Date(calYear, calMonth, 1).getDay();

  // Doctors & Temp Slots Real-time Lists
  const [allDoctorsList, setAllDoctorsList] = useState<Doctor[]>(DEFAULT_DOCTORS_SEED);
  const [tempSlotsList, setTempSlotsList] = useState<any[]>([]);

  // Compute available 15-minute time slots based on selected doctor, branch, and date
  const doctorAvailableSlots = useMemo(() => {
    if (!bookingDoctor || !bookingDate) return [];
    const targetBranch = bookModalItem?.branchName || currentBranch || 'KPHB Branch';
    const dayName = getDayNameFromDate(bookingDate);

    const docObj = allDoctorsList.find(d => isSameDoctor(d.name, bookingDoctor));

    let regularSlots: string[] = [];
    if (docObj && docObj.branchSchedules && docObj.branchSchedules.length > 0) {
      const normTargetBranch = normalizeBranchName(targetBranch);
      const matchBs = docObj.branchSchedules.find(bs => {
        const normBs = normalizeBranchName(bs.targetBranch);
        return normBs.includes(normTargetBranch) || normTargetBranch.includes(normBs);
      });

      if (matchBs && matchBs.daySchedules?.[dayName]) {
        const daySched = matchBs.daySchedules[dayName];
        if (daySched.status === 'Available' && daySched.slots && daySched.slots.length > 0) {
          regularSlots = generate15MinSlotsFromRanges(daySched.slots);
        }
      }
    }

    // Include temporary slots if any
    const normTargetBranch = normalizeBranchName(targetBranch);
    const matchedTempDocs = tempSlotsList.filter(ts => {
      const sameDoc = isSameDoctor(ts.doctorName || '', bookingDoctor);
      const sameDate = areDatesEqual(ts.appointmentDate, bookingDate);
      const tsBranch = normalizeBranchName(ts.branch || '');
      const sameBranch = !tsBranch || tsBranch.includes(normTargetBranch) || normTargetBranch.includes(tsBranch);
      return sameDoc && sameDate && sameBranch;
    });

    const tempSlotsRanges = matchedTempDocs.map(ts => ({
      startHour: ts.startHour,
      startMinute: ts.startMinute,
      startAmPm: ts.startAmPm as 'AM' | 'PM',
      endHour: ts.endHour,
      endMinute: ts.endMinute,
      endAmPm: ts.endAmPm as 'AM' | 'PM'
    }));

    const generatedTemp = generate15MinSlotsFromRanges(tempSlotsRanges);
    const combined = Array.from(new Set([...regularSlots, ...generatedTemp]));
    return sortTimeSlotsChronologically(combined);
  }, [bookingDoctor, bookingDate, bookModalItem, currentBranch, allDoctorsList, tempSlotsList]);

  // Keep bookingTime in sync with doctorAvailableSlots
  useEffect(() => {
    if (doctorAvailableSlots.length > 0) {
      const firstValid = doctorAvailableSlots.find(s => {
        const { isFull } = getSlotCapacityInfo(s);
        const isPast = isSlotPastTime(s, bookingDate);
        return !isFull && !isPast;
      });
      const isCurrentPast = isSlotPastTime(bookingTime, bookingDate);
      if (!doctorAvailableSlots.includes(bookingTime) || isCurrentPast) {
        setBookingTime(firstValid || '');
      }
    } else {
      setBookingTime('');
    }
  }, [doctorAvailableSlots, bookingDate]);

  // Helper to calculate remaining slots out of 3 capacity for a time slot
  const getSlotCapacityInfo = (slotTimeStr: string) => {
    const normSelectedDoc = (bookingDoctor || '').toLowerCase().trim();
    const bookedCount = rawAppointments.filter((app) => {
      const normAppDoc = (app.doctorName || app.doctor || '').toLowerCase().trim();
      const sameDoc = normAppDoc === normSelectedDoc || normAppDoc.includes(normSelectedDoc) || normSelectedDoc.includes(normAppDoc);
      const sameDate = areDatesEqual(app.appointmentDate || app.date, bookingDate);
      const sameTime = (app.appointmentTime || app.time || '').trim().toLowerCase() === slotTimeStr.trim().toLowerCase();
      const notCancelled = app.status !== 'cancelled';
      return sameDoc && sameDate && sameTime && notCancelled;
    }).length;

    const remainingSlots = Math.max(0, 3 - bookedCount);
    return {
      bookedCount,
      remainingSlots,
      isFull: remainingSlots === 0
    };
  };

  // Format date helper to YYYY-MM-DD
  const formatISO = (rawDate: any): string => {
    if (!rawDate) return '';
    const clean = String(rawDate).trim();
    if (clean.includes('T')) return clean.split('T')[0];
    if (clean.includes('/') || (clean.includes('-') && clean.split('-')[0].length <= 2)) {
      const parts = clean.split(/[\/\-]/);
      if (parts.length === 3) {
        let dd = parts[0].padStart(2, '0');
        let mm = parts[1].padStart(2, '0');
        let yyyy = parts[2];
        if (parts[0].length === 4) {
          yyyy = parts[0];
          mm = parts[1].padStart(2, '0');
          dd = parts[2].padStart(2, '0');
        }
        return `${yyyy}-${mm}-${dd}`;
      }
    }
    return clean;
  };

  // 1. Subscribe to Live Firestore (lightweight, zero heavy image downloads)
  useEffect(() => {
    const activeDb = getSafeDb();
    if (!activeDb) return;

    // A. Sync from in-memory receptionDataStore (0ms network cost)
    const unsubStore = receptionDataStore.subscribe((state) => {
      if (state.appointments && state.appointments.length > 0) {
        setRawAppointments(state.appointments);
      }
      if (state.allCollectionsPool && state.allCollectionsPool.length > 0) {
        setRawAllPatients(state.allCollectionsPool);
      }
    });

    // B. Real-time followups collection (branch-scoped server query for 4x faster loading)
    const branchQueryNames = typeof getBranchQueryNames === 'function' ? getBranchQueryNames(branchId || currentBranch) : [];
    const followupsQuery = branchQueryNames.length > 0
      ? query(collection(activeDb, 'followups'), where('branchName', 'in', branchQueryNames))
      : collection(activeDb, 'followups');

    const unsubFollowups = onSnapshot(followupsQuery, (snap) => {
      const list: any[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      setRawFollowups(list);
    }, (err) => console.warn('Followups note:', err));

    const unsubDoctors = onSnapshot(collection(activeDb, 'doctors'), (snap) => {
      if (!snap.empty) {
        const fetched: Doctor[] = [];
        snap.forEach((d) => {
          const data = d.data();
          const normDataName = (data.name || data.doctorName || '').toLowerCase().replace(/dr\.?\s*/i, '').trim();
          const digits = (data.mobile || data.phone || '').replace(/\D/g, '');
          const seedFallback = DEFAULT_DOCTORS_SEED.find(s => s.id === d.id)
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
            id: d.id,
            name: data.name || data.doctorName || seedFallback?.name || 'Doctor',
            phone: data.phone || data.mobile || seedFallback?.phone || '',
            role: data.role || seedFallback?.role || 'Homeopathy Physician',
            branch: data.branch || data.assignedBranch || '',
            branchSchedules: (data.branchSchedules && data.branchSchedules.length > 0)
              ? data.branchSchedules
              : (seedFallback?.branchSchedules || []),
          });
        });
        setAllDoctorsList(fetched);
      }
    }, (err) => console.warn('Doctors listener note:', err));

    const unsubTemp = onSnapshot(query(collection(activeDb, 'doctor_temp_slots'), limit(50)), (snap) => {
      const list: any[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      setTempSlotsList(list);
    }, (err) => console.warn('Temp slots note:', err));

    return () => {
      unsubStore();
      unsubFollowups();
      unsubDoctors();
      unsubTemp();
    };
  }, []);

  // Active appointments lookup: checks if a patient has a currently waiting/booked/in_consultation appointment
  const activeAppointmentsByPatient = useMemo(() => {
    const activeMap = new Map<string, Set<string>>();
    const addActive = (key: string, dateStr: string) => {
      if (!key || !dateStr) return;
      if (!activeMap.has(key)) activeMap.set(key, new Set());
      activeMap.get(key)!.add(dateStr);
    };

    rawAppointments.forEach(app => {
      if (!app) return;
      const st = (app.status || '').toLowerCase();
      // Active appointment statuses: waiting, in_consultation, booked, confirmed, pending
      const isActive = st === 'waiting' || st === 'booked' || st === 'confirmed' || st === 'in_consultation' || st === 'pending';
      if (!isActive) return;

      const dateISO = formatISO(app.appointmentDate || app.date);
      const pDigits = (app.phone || app.phoneNumber || app.mobile || '').toString().replace(/\D/g, '').slice(-10);
      const rId = (app.registrationId || app.regId || '').toString().trim().toUpperCase();
      const pName = (app.patientName || app.name || '').toString().trim().toLowerCase();

      if (pDigits) addActive(pDigits, dateISO);
      if (rId) addActive(rId, dateISO);
      if (pName && rId) addActive(`${pName}_${rId}`, dateISO);
    });

    return activeMap;
  }, [rawAppointments]);

  // 2. Process and Deduplicate Live Follow-Up Items
  const followUpItems = useMemo(() => {
    const map = new Map<string, FollowUp>();
    const seenPatientFollowups = new Set<string>();
    const todayISO = todayStr;

    const safeResolveBranchId = (val?: string | null): CanonicalBranchId | null => {
      try {
        if (typeof resolveCanonicalBranchId === 'function') {
          return resolveCanonicalBranchId(val);
        }
      } catch (_) {}
      if (!val || typeof val !== 'string') return null;
      const l = val.toLowerCase();
      if (l.includes('kphb') || l.includes('kpb')) return 'kphb';
      if (l.includes('chanda') || l.includes('chn')) return 'chandanagar';
      if (l.includes('dilshuk') || l.includes('dsn')) return 'dilshuknagar';
      if (l.includes('nalla') || l.includes('ngl')) return 'nallagandla';
      return null;
    };

    const targetCanonicalBranch: CanonicalBranchId | null = branchId || (currentBranch ? safeResolveBranchId(currentBranch) : null);

    const processItem = (item: any, isPrimaryFollowup: boolean = false) => {
      if (!item) return;

      // Branch-scoped filter: only process records belonging to the active canonical branch
      if (targetCanonicalBranch) {
        const itemCanonical = safeResolveBranchId(
          item.branchId || item.branch || item.branchName || item.assignedBranch || item.regId || item.registrationId
        );
        if (itemCanonical && itemCanonical !== targetCanonicalBranch) {
          return;
        }
      }

      // Skip if explicitly marked as booked or completed
      if (
        item.followUpStatus === 'booked' ||
        item.followUpStatus === 'completed' ||
        item.followUpBooked === true ||
        item.isFollowUpCompleted === true ||
        (item.status === 'booked' && !item.appointmentTime)
      ) {
        return;
      }

      const itemId = item.id || item.raw?.id || '';
      if (itemId && bookedFollowUpIds.has(itemId)) return;

      const phone = (item.phone || item.phoneNumber || item.mobile || item.contact || '').toString().trim();
      const pName = (item.patientName || item.fullName || item.name || item.patient || '').toString().trim();
      if (!pName && !phone) return;

      const cleanDigits = phone.replace(/\D/g, '').slice(-10);
      const rawReg = (item.regId || item.registrationId || '').toString().trim();
      const isDocId = /^[a-zA-Z0-9]{19,32}$/.test(rawReg) || /^PAT-\d+$/i.test(rawReg);
      const branchStr = (item.branchName || item.branch || currentBranch || 'KPHB').toUpperCase();
      const shortcut = branchStr.includes('CHAND') ? 'CHN' : branchStr.includes('NALLA') ? 'NGL' : branchStr.includes('DILSHUK') ? 'DIL' : 'KPB';
      const regId = (rawReg && !isDocId ? rawReg : (cleanDigits ? `SPH-${shortcut}-${cleanDigits.slice(-4)}` : `SPH-${shortcut}-0001`)).toUpperCase();

      // Skip if marked booked in local state
      if (
        (itemId && bookedFollowUpIds.has(itemId)) ||
        (cleanDigits && bookedFollowUpIds.has(cleanDigits)) ||
        (regId && bookedFollowUpIds.has(regId))
      ) {
        return;
      }

      const prefDateRaw = item.preferredFollowUpDate || item.followUpDate || item.nextFollowUpDate || item.scheduledDate;
      const interval = item.followUpInterval || item.interval || '15 Days';
      if (interval === 'No Follow-up' && !prefDateRaw) return;
      if (!prefDateRaw) return;

      const formattedPrefDate = formatISO(prefDateRaw);
      if (!formattedPrefDate) return;

      // Skip if patient already has an active booked appointment for this follow-up date or upcoming/today
      const patientApptDates = (cleanDigits ? activeAppointmentsByPatient.get(cleanDigits) : undefined) ||
        (regId ? activeAppointmentsByPatient.get(regId) : undefined);
      if (patientApptDates) {
        if (patientApptDates.has(formattedPrefDate)) return;
        // If the follow-up is for today or overdue and patient already has an active appointment today or upcoming
        for (const d of patientApptDates) {
          if (d >= todayISO && formattedPrefDate <= todayISO) {
            return;
          }
        }
      }

      const rawBranch = item.branchName || item.branch || item.assignedBranch;
      const bName = getCanonicalBranchName(rawBranch) || (currentBranch ? getCanonicalBranchName(currentBranch) : 'KPHB Branch');

      let status: 'today' | 'overdue' | 'this_month' | 'next_month' | 'upcoming' = 'upcoming';
      if (formattedPrefDate < todayISO) {
        status = 'overdue';
      } else if (formattedPrefDate === todayISO) {
        status = 'today';
      } else if (formattedPrefDate.startsWith(thisMonthStr)) {
        status = 'this_month';
      } else if (formattedPrefDate.startsWith(nextMonthStr)) {
        status = 'next_month';
      }

      const dedupSignature = cleanDigits ? `${cleanDigits}_${formattedPrefDate}` : `${pName.toLowerCase()}_${regId}_${formattedPrefDate}`;

      if (isPrimaryFollowup) {
        // Every document in followups collection is a distinct scheduled follow-up record
        const key = itemId || dedupSignature;
        map.set(key, {
          id: itemId || key,
          patientName: pName || 'Patient',
          phone: cleanDigits ? `+91 ${cleanDigits}` : phone,
          regId,
          doctorName: getCanonicalDoctorName(item.doctorName || item.doctor || SPH_DOCTORS[0]),
          branchName: bName,
          preferredDate: formattedPrefDate,
          followUpInterval: interval,
          diseases: item.diseases || item.diagnosisNotes || item.subject || 'General Follow-up',
          status,
          dateMs: new Date(formattedPrefDate).getTime() || 0,
          raw: item
        });
        seenPatientFollowups.add(dedupSignature);
      } else {
        // Secondary collections (appointments, allpatients): only add if patient does not already have a follow-up scheduled for this date
        if (seenPatientFollowups.has(dedupSignature)) return;
        const key = itemId || dedupSignature;
        if (map.has(key)) return;

        map.set(key, {
          id: itemId || key,
          patientName: pName || 'Patient',
          phone: cleanDigits ? `+91 ${cleanDigits}` : phone,
          regId,
          doctorName: getCanonicalDoctorName(item.doctorName || item.doctor || SPH_DOCTORS[0]),
          branchName: bName,
          preferredDate: formattedPrefDate,
          followUpInterval: interval,
          diseases: item.diseases || item.diagnosisNotes || item.subject || 'General Follow-up',
          status,
          dateMs: new Date(formattedPrefDate).getTime() || 0,
          raw: item
        });
        seenPatientFollowups.add(dedupSignature);
      }
    };

    rawFollowups.forEach(item => processItem(item, true));
    rawAppointments.forEach(item => processItem(item, false));
    rawAllPatients.forEach(item => processItem(item, false));

    // Merge sample data as fallback ONLY if no live records exist at all
    if (map.size === 0) {
      SAMPLE_DATA.forEach(s => {
        const cleanDigits = s.phone.replace(/\D/g, '').slice(-10);
        if (bookedFollowUpIds.has(cleanDigits) || bookedFollowUpIds.has(s.id)) return;
        const patientApptDates = activeAppointmentsByPatient.get(cleanDigits);
        if (patientApptDates && (patientApptDates.has(s.preferredDate) || patientApptDates.has(todayISO))) return;
        if (!map.has(cleanDigits)) {
          map.set(cleanDigits, s);
        }
      });
    }

    const list = Array.from(map.values());
    list.sort((a, b) => (b.dateMs || 0) - (a.dateMs || 0));
    return list;
  }, [rawFollowups, rawAppointments, rawAllPatients, currentBranch, branchId, bookedFollowUpIds, activeAppointmentsByPatient]);

  // 3. Stats for Filter Tabs
  const stats = useMemo(() => {
    let today = 0, overdue = 0, thisMonth = 0, nextMonth = 0, selectedMonth = 0, customDate = 0;
    const scopedList = followUpItems.filter(item => {
      if (currentBranch && !isBranchMatching(item.branchName, currentBranch)) {
        return false;
      }
      return true;
    });

    scopedList.forEach(i => {
      const pDate = i.preferredDate;
      if (pDate === todayStr) today++;
      if (pDate < todayStr) overdue++;
      if (pDate.startsWith(thisMonthStr)) thisMonth++;
      if (pDate.startsWith(nextMonthStr)) nextMonth++;
      if (pDate.startsWith(selectedMonthISO)) selectedMonth++;
      if (pDate === customDateISO) customDate++;
    });

    return { total: scopedList.length, today, overdue, thisMonth, nextMonth, selectedMonth, customDate };
  }, [followUpItems, currentBranch, selectedMonthISO, customDateISO]);

  // 4. Filter by Tab
  const filteredData = useMemo(() => {
    return followUpItems.filter((item) => {
      if (currentBranch && !isBranchMatching(item.branchName, currentBranch)) {
        return false;
      }
      if (filterMode === 'today') {
        if (item.preferredDate !== todayStr) return false;
      } else if (filterMode === 'overdue') {
        if (item.preferredDate >= todayStr) return false;
      } else if (filterMode === 'this_month') {
        if (!item.preferredDate.startsWith(thisMonthStr)) return false;
      } else if (filterMode === 'next_month') {
        if (!item.preferredDate.startsWith(nextMonthStr)) return false;
      } else if (filterMode === 'selected_month') {
        if (!item.preferredDate.startsWith(selectedMonthISO)) return false;
      } else if (filterMode === 'custom_date') {
        if (item.preferredDate !== customDateISO) return false;
      }
      return true;
    });
  }, [followUpItems, filterMode, currentBranch, selectedMonthISO, customDateISO]);

  // Booking Confirmation Handler
  const handleConfirmBooking = async () => {
    if (!bookModalItem || !bookingDate) return;
    setIsBooking(true);
    try {
      const cleanPhone = bookModalItem.phone.replace(/\D/g, '').slice(-10);
      const rawId = bookModalItem.raw?.id || bookModalItem.id;

      // 1. Instantly hide from follow-up UI
      setBookedFollowUpIds(prev => {
        const next = new Set(prev);
        if (rawId) next.add(rawId);
        if (cleanPhone) next.add(cleanPhone);
        if (bookModalItem.regId) next.add(bookModalItem.regId);
        next.add(`${bookModalItem.patientName.toLowerCase()}_${bookModalItem.regId}`);
        return next;
      });

      const payload = {
        patientName: bookModalItem.patientName,
        name: bookModalItem.patientName,
        phone: cleanPhone || bookModalItem.phone,
        phoneNumber: cleanPhone || bookModalItem.phone,
        registrationId: bookModalItem.regId,
        regId: bookModalItem.regId,
        doctorName: bookingDoctor,
        doctor: bookingDoctor,
        appointmentDate: bookingDate,
        date: bookingDate,
        appointmentTime: bookingTime,
        time: bookingTime,
        consultationFee: 0,
        branch: bookModalItem.branchName || currentBranch,
        branchName: bookModalItem.branchName || currentBranch,
        status: 'waiting',
        isFromFollowUp: true,
        sourceFollowUpDate: bookModalItem.preferredDate,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const activeDb = getSafeDb();
      if (activeDb) {
        await addDoc(collection(activeDb, 'appointments'), payload);
        await addDoc(collection(activeDb, 'allpatients'), payload).catch(() => { });

        // Persist booked status across all collections so it never resurfaces in follow-ups
        const followUpBookedUpdate = {
          followUpStatus: 'booked',
          followUpBooked: true,
          followUpBookedDate: bookingDate,
          followUpBookedTime: bookingTime,
          status: 'booked',
          updatedAt: new Date().toISOString()
        };

        if (rawId) {
          const collectionsToCheck = ['followups', 'prescriptions', 'appointments', 'allpatients', 'patients'];
          for (const col of collectionsToCheck) {
            updateDoc(doc(activeDb, col, rawId), followUpBookedUpdate).catch(() => { });
          }
        }

        if (cleanPhone) {
          try {
            const fSnap = await getDocs(query(collection(activeDb, 'followups'), where('phone', '==', cleanPhone))).catch(() => null);
            if (fSnap && !fSnap.empty) {
              fSnap.forEach(d => {
                updateDoc(d.ref, followUpBookedUpdate).catch(() => { });
              });
            }
          } catch (e) { }
        }
      }

      sendBookingWhatsAppNotification({
        patientName: bookModalItem.patientName,
        phone: cleanPhone || bookModalItem.phone,
        date: bookingDate,
        time: bookingTime,
        doctorName: bookingDoctor,
        branch: bookModalItem.branchName || currentBranch
      }).catch(err => console.error('WhatsApp booking error:', err));

      sendBookingSMS(
        cleanPhone || bookModalItem.phone,
        bookModalItem.patientName,
        bookingDoctor,
        bookingDate,
        bookingTime,
        bookModalItem.branchName || currentBranch,
        false
      ).catch(err => console.warn('SMS booking error:', err));

      // Trigger FCM Push Notification and 10-day Firestore retention cleanup
      createBookingNotificationInFirestore({
        patientName: bookModalItem.patientName,
        appointmentTime: bookingTime,
        appointmentDate: bookingDate,
        branch: bookModalItem.branchName || currentBranch,
        doctorName: bookingDoctor,
      }).catch((err: any) => console.warn('FCM follow-up booking notification notice:', err));

      // Dismiss modal and transfer to Booked Appointments in Reception Dashboard
      setBookModalItem(null);
      if (onNavigate) {
        onNavigate('reception_dashboard');
      }
    } catch (err) {
      console.error('Error booking appointment:', err);
      setBookModalItem(null);
    } finally {
      setIsBooking(false);
    }
  };

  const makeCall = useCallback((phone: string) => {
    if (!phone) return;
    Linking.openURL(`tel:${phone.replace(/\s+/g, '')}`);
  }, []);

  const openWhatsApp = useCallback((phone: string, patientName: string, doctorName: string) => {
    if (!phone) return;
    const cleanDigits = phone.replace(/\D/g, '').slice(-10);
    const msg = `Hello ${patientName}, this is regarding your upcoming follow-up with ${doctorName} at Spiritual Homeopathy.`;
    Linking.openURL(`whatsapp://send?phone=91${cleanDigits}&text=${encodeURIComponent(msg)}`).catch(() => {
      Linking.openURL(`https://wa.me/91${cleanDigits}?text=${encodeURIComponent(msg)}`);
    });
  }, []);

  const BADGE_CONSTANTS = useMemo(() => ({
    overdue: { bg: '#fef2f2', text: '#dc2626', label: 'OVERDUE' },
    today: { bg: '#fffbeb', text: '#b45309', label: 'TODAY' },
    thisMonth: { bg: '#f0f9ff', text: '#0284c7', label: 'THIS MONTH' },
    nextMonth: { bg: '#f5f3ff', text: '#7c3aed', label: 'NEXT MONTH' },
    upcoming: { bg: '#f0fdf4', text: '#15803d', label: 'UPCOMING' },
  }), []);

  const getBadgeStyle = useCallback((pDate: string) => {
    if (pDate < todayStr) return BADGE_CONSTANTS.overdue;
    if (pDate === todayStr) return BADGE_CONSTANTS.today;
    if (pDate.startsWith(thisMonthStr)) return BADGE_CONSTANTS.thisMonth;
    if (pDate.startsWith(nextMonthStr)) return BADGE_CONSTANTS.nextMonth;
    return BADGE_CONSTANTS.upcoming;
  }, [todayStr, thisMonthStr, nextMonthStr, BADGE_CONSTANTS]);

  const handleBookAppt = useCallback((item: FollowUp) => {
    const initialDate = toDDMMYYYY(item.preferredDate || todayStr);
    const targetBranch = item.branchName || currentBranch;
    const avail = getAvailableDoctors(initialDate, targetBranch, allDoctorsList);
    setBookModalItem(item);
    setBookingDate(initialDate);
    try {
      const p = initialDate.split('-');
      if (p.length === 3) {
        setCalMonth(parseInt(p[1], 10) - 1);
        setCalYear(parseInt(p[2], 10));
      }
    } catch (e) { }
    const matchedDoc = avail.find(d => isSameDoctor(d, item.doctorName));
    setBookingDoctor(matchedDoc || avail[0] || item.doctorName || SPH_DOCTORS[0]);
    setBookingTime('');
    setBookingFee('');
  }, [todayStr, currentBranch, allDoctorsList]);

  const handleCompleteAppointment = useCallback(async (item: FollowUp) => {
    Alert.alert(
      'Complete Appointment',
      `Are you sure you want to mark ${item.patientName}'s follow-up appointment as completed?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark Complete ✓',
          onPress: async () => {
            try {
              const activeDb = getSafeDb();
              const targetId = item.id || item.raw?.id;
              const cleanPhone = item.phone ? item.phone.replace(/\D/g, '').slice(-10) : '';

              setBookedFollowUpIds(prev => {
                const next = new Set(prev);
                if (targetId) next.add(targetId);
                if (cleanPhone) next.add(cleanPhone);
                if (item.regId) next.add(item.regId);
                next.add(`${item.patientName.toLowerCase()}_${item.regId}`);
                return next;
              });

              if (activeDb && targetId) {
                const nowIso = new Date().toISOString();
                const payload = {
                  status: 'completed',
                  followUpStatus: 'completed',
                  isFollowUpCompleted: true,
                  paymentStatus: 'paid',
                  paymentPending: false,
                  feeCollectionNeeded: false,
                  completedAt: nowIso,
                  updatedAt: nowIso
                };
                const cols = ['followups', 'prescriptions', 'appointments', 'allpatients', 'patients'];
                for (const col of cols) {
                  await updateDoc(doc(activeDb, col, targetId), payload).catch(() => { });
                }
                Alert.alert('Appointment Completed ✓', `${item.patientName} has been moved to the Completed queue.`);
              }
            } catch (err) {
              console.error('Error completing appointment:', err);
              Alert.alert('Error', 'Failed to complete appointment.');
            }
          }
        }
      ]
    );
  }, []);

  const handleOpenReschedule = useCallback((item: FollowUp) => {
    const initialIso = formatISO(item.preferredDate) || todayStr;
    setRescheduleModalItem(item);
    setRescheduleDateISO(initialIso);
    setRescheduleReason('Patient requested date change');
    try {
      const parts = initialIso.split('-');
      if (parts.length === 3) {
        setRescheduleCalYear(parseInt(parts[0], 10));
        setRescheduleCalMonth(parseInt(parts[1], 10) - 1);
      }
    } catch (_) {}
  }, []);

  const handleShiftRescheduleDays = useCallback((daysToAdd: number) => {
    const base = rescheduleDateISO ? new Date(rescheduleDateISO) : new Date();
    base.setDate(base.getDate() + daysToAdd);
    const y = base.getFullYear();
    const m = String(base.getMonth() + 1).padStart(2, '0');
    const d = String(base.getDate()).padStart(2, '0');
    setRescheduleDateISO(`${y}-${m}-${d}`);
  }, [rescheduleDateISO]);

  const handleConfirmReschedule = useCallback(async () => {
    if (!rescheduleModalItem || !rescheduleDateISO) return;
    setIsRescheduling(true);
    try {
      const activeDb = getSafeDb();
      const cleanPhone = rescheduleModalItem.phone ? rescheduleModalItem.phone.replace(/\D/g, '').slice(-10) : '';
      const rawId = rescheduleModalItem.raw?.id || rescheduleModalItem.id;
      const targetDateISO = formatISO(rescheduleDateISO);

      const updatePayload = {
        preferredFollowUpDate: targetDateISO,
        followUpDate: targetDateISO,
        nextFollowUpDate: targetDateISO,
        scheduledDate: targetDateISO,
        rescheduledAt: new Date().toISOString(),
        rescheduledFromDate: rescheduleModalItem.preferredDate,
        rescheduleReason: rescheduleReason || 'Patient requested date change',
        updatedAt: new Date().toISOString()
      };

      // 1. Update/set in Firestore
      if (activeDb) {
        if (rawId) {
          await setDoc(doc(activeDb, 'followups', rawId), {
            ...(rescheduleModalItem.raw || {}),
            patientName: rescheduleModalItem.patientName,
            phone: cleanPhone || rescheduleModalItem.phone,
            registrationId: rescheduleModalItem.regId,
            doctorName: rescheduleModalItem.doctorName,
            branchName: rescheduleModalItem.branchName || currentBranch,
            diseases: rescheduleModalItem.diseases,
            ...updatePayload
          }, { merge: true }).catch(() => {});

          const otherCollections = ['appointments', 'allpatients', 'prescriptions', 'patients'];
          for (const col of otherCollections) {
            updateDoc(doc(activeDb, col, rawId), updatePayload).catch(() => {});
          }
        } else if (cleanPhone) {
          await setDoc(doc(activeDb, 'followups', `${cleanPhone}_followup`), {
            patientName: rescheduleModalItem.patientName,
            phone: cleanPhone,
            registrationId: rescheduleModalItem.regId,
            doctorName: rescheduleModalItem.doctorName,
            branchName: rescheduleModalItem.branchName || currentBranch,
            diseases: rescheduleModalItem.diseases,
            ...updatePayload
          }, { merge: true }).catch(() => {});
        }
      }

      // 2. Immediate 0ms local state update on rawFollowups
      setRawFollowups(prev => {
        const idx = prev.findIndex(f => f.id === rawId || (cleanPhone && (f.phone || '').includes(cleanPhone)));
        if (idx !== -1) {
          const updated = [...prev];
          updated[idx] = { ...updated[idx], ...updatePayload };
          return updated;
        } else {
          return [{
            id: rawId || `${cleanPhone}_followup`,
            patientName: rescheduleModalItem.patientName,
            phone: cleanPhone || rescheduleModalItem.phone,
            regId: rescheduleModalItem.regId,
            doctorName: rescheduleModalItem.doctorName,
            branchName: rescheduleModalItem.branchName || currentBranch,
            diseases: rescheduleModalItem.diseases,
            ...updatePayload
          }, ...prev];
        }
      });

      // Trigger WhatsApp and SMS Reschedule notifications
      const targetPhone = cleanPhone || rescheduleModalItem.phone;
      const targetFormattedDate = toDDMMYYYY(targetDateISO);
      const targetBranch = rescheduleModalItem.branchName || currentBranch;
      const targetDoctor = rescheduleModalItem.doctorName || 'Doctor';

      if (targetPhone) {
        sendRescheduleWhatsAppNotification({
          patientName: rescheduleModalItem.patientName,
          phone: targetPhone,
          date: targetFormattedDate,
          time: '10:00 AM',
          doctorName: targetDoctor,
          branch: targetBranch
        }).catch(err => console.warn('WhatsApp reschedule error:', err));

        sendRescheduleSMS(
          targetPhone,
          rescheduleModalItem.patientName,
          targetDoctor,
          targetFormattedDate,
          '10:00 AM',
          targetBranch
        ).catch(err => console.warn('SMS reschedule error:', err));
      }

      // 3. Close modal & alert
      setRescheduleModalItem(null);
      Alert.alert(
        'Follow-Up Rescheduled ✓',
        `${rescheduleModalItem.patientName}'s follow-up moved to ${toDDMMYYYY(targetDateISO)}.`
      );
    } catch (err) {
      console.error('Error rescheduling follow-up:', err);
      Alert.alert('Error', 'Failed to reschedule follow-up.');
    } finally {
      setIsRescheduling(false);
    }
  }, [rescheduleModalItem, rescheduleDateISO, rescheduleReason, currentBranch]);

  const renderFollowUpItem = useCallback(({ item }: { item: FollowUp }) => {
    const badge = getBadgeStyle(item.preferredDate);
    return (
      <FollowUpCardItem
        item={item}
        badge={badge}
        onBook={handleBookAppt}
        onReschedule={handleOpenReschedule}
        onComplete={handleCompleteAppointment}
        onWhatsApp={openWhatsApp}
        onCall={makeCall}
      />
    );
  }, [getBadgeStyle, handleBookAppt, handleOpenReschedule, handleCompleteAppointment, openWhatsApp, makeCall]);

  return (
    <View style={styles.container}>
      {/* Compact Reduced Height Filter Tabs */}
      <View style={styles.tabScrollWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabRow}
        >
          {[
            { id: 'today', label: 'TODAY', count: stats.today },
            { id: 'overdue', label: 'OVERDUE', count: stats.overdue },
            { id: 'this_month', label: 'THIS MONTH', count: stats.thisMonth },
            { id: 'next_month', label: 'NEXT MONTH', count: stats.nextMonth },
            { id: 'selected_month', label: `${MONTH_NAMES_SHORT[selectedFilterMonth]} ${selectedFilterYear}`, count: stats.selectedMonth },
            { id: 'all', label: 'ALL', count: stats.total },
            { id: 'custom_date', label: customDateISO ? toDDMMYYYY(customDateISO) : 'CUSTOM DATE', count: stats.customDate }
          ].map((tab) => {
            const isActive = filterMode === tab.id;
            return (
              <TouchableOpacity
                key={tab.id}
                onPress={() => {
                  setFilterMode(tab.id as FilterMode);
                  if (tab.id === 'custom_date') {
                    setCustomDatePickerVisible(true);
                  }
                }}
                style={[styles.tabBtn, isActive && styles.tabBtnActive]}
                activeOpacity={0.7}
              >
                <Text style={isActive ? styles.tabTextActive : styles.tabText}>
                  {tab.label}
                </Text>
                <View style={[styles.badgePill, isActive ? styles.badgePillActive : styles.badgePillInactive]}>
                  <Text style={[styles.badgePillText, isActive ? styles.badgePillTextActive : styles.badgePillTextInactive]}>
                    {tab.count}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Month & Year Quick Select Bar */}
      <View style={styles.monthFilterBar}>
        <TouchableOpacity
          style={[styles.monthFilterTrigger, filterMode === 'selected_month' && styles.monthFilterTriggerActive]}
          onPress={() => setMonthFilterModalVisible(true)}
          activeOpacity={0.7}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Feather name="calendar" size={13} color={filterMode === 'selected_month' ? '#0d9488' : '#0284c7'} />
            <Text style={[styles.monthFilterText, filterMode === 'selected_month' && styles.monthFilterTextActive]}>
              Month: {MONTH_NAMES[selectedFilterMonth]} {selectedFilterYear}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={[styles.monthFilterCountBadge, filterMode === 'selected_month' && styles.monthFilterCountBadgeActive]}>
              <Text style={[styles.monthFilterCountText, filterMode === 'selected_month' && styles.monthFilterCountTextActive]}>
                {stats.selectedMonth} found
              </Text>
            </View>
            <Feather name="chevron-down" size={13} color={filterMode === 'selected_month' ? '#0d9488' : '#64748b'} />
          </View>
        </TouchableOpacity>
      </View>

      {/* Follow Up Cards List */}
      {isLoading ? (
        <View style={{ padding: 40, alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#0284c7" />
          <Text style={{ marginTop: 10, color: '#64748b', fontSize: 13 }}>Loading follow-ups...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredData}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 90, paddingTop: 4 }}
          showsVerticalScrollIndicator={false}
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={5}
          removeClippedSubviews={Platform.OS === 'android'}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Feather name="calendar" size={30} color="#cbd5e1" />
              <Text style={styles.emptyTitle}>No follow-ups found</Text>
              <Text style={styles.emptySub}>
                No {filterMode.replace('_', ' ')} follow-up appointments recorded.
              </Text>
            </View>
          }
          renderItem={renderFollowUpItem}
        />
      )}

      {/* ================= BOOK APPOINTMENT MODAL ================= */}
      {bookModalItem && (
        <Modal transparent animationType="fade" visible={!!bookModalItem} onRequestClose={() => setBookModalItem(null)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="calendar" size={18} color="#0284c7" />
                  <Text style={styles.modalTitle}>Book Appointment</Text>
                </View>
                <TouchableOpacity onPress={() => setBookModalItem(null)}>
                  <Feather name="x" size={18} color="#64748b" />
                </TouchableOpacity>
              </View>

              <View style={styles.patientBanner}>
                <Text style={styles.bannerName}>{bookModalItem.patientName}</Text>
                <Text style={styles.bannerSub}>{bookModalItem.regId} • {bookModalItem.phone}</Text>
              </View>

              {/* 1. Appointment Date First (DD-MM-YYYY) with Calendar Picker */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <Text style={styles.inputLabel}>Appointment Date (DD-MM-YYYY) *</Text>
                <View style={{ backgroundColor: '#e0f2fe', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: '#0284c7' }}>
                    📅 {getDayNameFromDate(bookingDate)}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                onPress={() => setCalendarModalVisible(true)}
                style={styles.datePickerBtn}
                activeOpacity={0.7}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Feather name="calendar" size={16} color="#0284c7" />
                  <Text style={{ fontSize: 13.5, fontWeight: '700', color: '#0f172a' }}>
                    {bookingDate}
                  </Text>
                </View>
                <Text style={{ fontSize: 11.5, fontWeight: '700', color: '#0284c7' }}>
                  Pick Date 📅
                </Text>
              </TouchableOpacity>

              {/* 2. Consulting Doctor Second (Strictly available doctors in that branch) */}
              {(() => {
                const targetBranch = bookModalItem?.branchName || currentBranch || 'KPHB Branch';
                const availDocs = getAvailableDoctors(bookingDate, targetBranch);
                const dayName = getDayNameFromDate(bookingDate);

                return (
                  <>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                      <Text style={styles.inputLabel}>Consulting Doctor:</Text>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: availDocs.length > 0 ? '#16a34a' : '#dc2626' }}>
                        {availDocs.length > 0
                          ? `${availDocs.length} Available in ${targetBranch}`
                          : `0 Available in ${targetBranch}`}
                      </Text>
                    </View>

                    {availDocs.length === 0 && (
                      <View style={{
                        padding: 8,
                        backgroundColor: '#fef2f2',
                        borderColor: '#fecaca',
                        borderWidth: 1,
                        borderRadius: 8,
                        marginBottom: 8
                      }}>
                        <Text style={{ color: '#dc2626', fontSize: 11, fontWeight: '700' }}>
                          ⚠️ No doctors scheduled at {targetBranch} on {dayName}. Pick another date or choose an override doctor below.
                        </Text>
                      </View>
                    )}

                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        {(availDocs.length > 0 ? availDocs : SPH_DOCTORS).map(doc => {
                          const isAvail = availDocs.includes(doc);
                          return (
                            <TouchableOpacity
                              key={doc}
                              onPress={() => setBookingDoctor(doc)}
                              style={[
                                styles.slotPill,
                                bookingDoctor === doc && styles.slotPillActive,
                                !isAvail && { borderColor: '#fecaca', backgroundColor: '#fff5f5' }
                              ]}
                            >
                              <Text style={[
                                styles.slotPillText,
                                bookingDoctor === doc && styles.slotPillTextActive,
                                !isAvail && { color: '#dc2626' }
                              ]}>
                                {doc} {isAvail ? '✓' : '(Off)'}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </ScrollView>
                  </>
                );
              })()}

              {/* 3. Doctor's Availability Slots (Strictly 4 boxes in a row) */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <Text style={styles.inputLabel}>
                  Doctor Availability Slots ({doctorAvailableSlots.length}):
                </Text>
                {bookingTime ? (
                  <View style={{ backgroundColor: '#e0f2fe', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 }}>
                    <Text style={{ fontSize: 10.5, fontWeight: '800', color: '#0284c7' }}>
                      Selected: {bookingTime}
                    </Text>
                  </View>
                ) : null}
              </View>

              {doctorAvailableSlots.length === 0 ? (
                <View style={{
                  padding: 10,
                  backgroundColor: '#fef2f2',
                  borderColor: '#fecaca',
                  borderWidth: 1,
                  borderRadius: 8,
                  marginBottom: 12
                }}>
                  <Text style={{ color: '#dc2626', fontSize: 11, fontWeight: '700' }}>
                    ⚠️ No available time slots configured for {bookingDoctor} on {getDayNameFromDate(bookingDate)} at {bookModalItem?.branchName || currentBranch}. Please choose another date or available doctor.
                  </Text>
                </View>
              ) : (
                <ScrollView style={{ maxHeight: 220, marginBottom: 12 }} nestedScrollEnabled>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {doctorAvailableSlots.map(slot => {
                      const isSelected = bookingTime === slot;
                      const { remainingSlots, isFull } = getSlotCapacityInfo(slot);
                      const isPast = isSlotPastTime(slot, bookingDate);
                      const isBlocked = isFull || isPast;

                      return (
                        <TouchableOpacity
                          key={slot}
                          disabled={isBlocked}
                          onPress={() => {
                            if (!isBlocked) setBookingTime(slot);
                          }}
                          style={[
                            styles.slotBox,
                            isSelected && styles.slotBoxActive,
                            isFull && styles.slotBoxFull,
                            isPast && styles.slotBoxPast
                          ]}
                          activeOpacity={0.7}
                        >
                          <Text style={[
                            styles.slotBoxText,
                            isSelected && styles.slotBoxTextActive,
                            isFull && styles.slotBoxTextFull,
                            isPast && styles.slotBoxTextPast
                          ]}>
                            {slot}
                          </Text>
                          <View style={[
                            styles.slotCapBadge,
                            isSelected
                              ? styles.slotCapBadgeSelected
                              : (isPast
                                ? styles.slotCapBadgePast
                                : (isFull
                                  ? styles.slotCapBadgeFull
                                  : (remainingSlots === 1 ? styles.slotCapBadgeLow : styles.slotCapBadgeAvail)))
                          ]}>
                            <Text style={[
                              styles.slotCapText,
                              isSelected
                                ? styles.slotCapTextSelected
                                : (isPast
                                  ? styles.slotCapTextPast
                                  : (isFull
                                    ? styles.slotCapTextFull
                                    : (remainingSlots === 1 ? styles.slotCapTextLow : styles.slotCapTextAvail)))
                            ]}>
                              {isPast ? 'BLOCKED' : (isFull ? 'FULL' : `${remainingSlots} left`)}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </ScrollView>
              )}

              <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setBookModalItem(null)}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.confirmBtn}
                  disabled={isBooking}
                  onPress={handleConfirmBooking}
                >
                  <Text style={styles.confirmBtnText}>{isBooking ? 'Booking...' : 'Book Now'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* ================= CALENDAR POPUP MODAL (MOBILE) ================= */}
      <Modal
        transparent
        animationType="fade"
        visible={calendarModalVisible}
        onRequestClose={() => setCalendarModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxWidth: 340, padding: 16 }]}>
            {/* Header with Prev, Month Year, Next */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <TouchableOpacity
                onPress={handlePrevMonth}
                style={{ padding: 6, backgroundColor: '#f1f5f9', borderRadius: 8 }}
              >
                <Feather name="chevron-left" size={18} color="#0284c7" />
              </TouchableOpacity>
              <Text style={{ fontSize: 14.5, fontWeight: '800', color: '#0f172a' }}>
                {monthNames[calMonth]} {calYear}
              </Text>
              <TouchableOpacity
                onPress={handleNextMonth}
                style={{ padding: 6, backgroundColor: '#f1f5f9', borderRadius: 8 }}
              >
                <Feather name="chevron-right" size={18} color="#0284c7" />
              </TouchableOpacity>
            </View>

            {/* Weekday Names Header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: 8 }}>
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <Text key={d} style={{ width: 34, textAlign: 'center', fontSize: 10.5, fontWeight: '700', color: '#64748b' }}>
                  {d}
                </Text>
              ))}
            </View>

            {/* Month Days Grid */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {Array.from({ length: startDayIndex }).map((_, i) => (
                <View key={`empty-${i}`} style={{ width: `${100 / 7}%`, height: 36 }} />
              ))}
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((dayNum) => {
                const formattedMonth = (calMonth + 1) < 10 ? `0${calMonth + 1}` : `${calMonth + 1}`;
                const formattedDay = dayNum < 10 ? `0${dayNum}` : `${dayNum}`;
                const dayStr = `${formattedDay}-${formattedMonth}-${calYear}`;
                const isSelected = bookingDate === dayStr;

                return (
                  <View key={dayNum} style={{ width: `${100 / 7}%`, height: 36, alignItems: 'center', justifyContent: 'center', marginVertical: 2 }}>
                    <TouchableOpacity
                      onPress={() => handleSelectDay(dayNum)}
                      style={[
                        {
                          width: 32,
                          height: 32,
                          borderRadius: 16,
                          alignItems: 'center',
                          justifyContent: 'center'
                        },
                        isSelected ? { backgroundColor: '#0284c7' } : { backgroundColor: '#f8fafc' }
                      ]}
                    >
                      <Text style={{
                        fontSize: 12,
                        fontWeight: isSelected ? '800' : '600',
                        color: isSelected ? '#ffffff' : '#0f172a'
                      }}>
                        {dayNum}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>

            <TouchableOpacity
              onPress={() => setCalendarModalVisible(false)}
              style={{ marginTop: 14, backgroundColor: '#f1f5f9', paddingVertical: 9, borderRadius: 8, alignItems: 'center' }}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569' }}>Close Calendar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Month & Year Picker Modal */}
      <Modal
        visible={monthFilterModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setMonthFilterModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.monthPickerModalCard}>
            {/* Modal Header */}
            <View style={styles.monthPickerHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Feather name="calendar" size={17} color="#0d9488" />
                <Text style={styles.monthPickerTitle}>Select Month & Year</Text>
              </View>
              <TouchableOpacity
                onPress={() => setMonthFilterModalVisible(false)}
                style={styles.modalCloseBtn}
              >
                <Feather name="x" size={18} color="#64748b" />
              </TouchableOpacity>
            </View>

            {/* Year Navigation */}
            <View style={styles.yearSelectorRow}>
              <TouchableOpacity
                style={styles.yearNavBtn}
                onPress={() => setSelectedFilterYear(prev => prev - 1)}
              >
                <Feather name="chevron-left" size={18} color="#0f172a" />
              </TouchableOpacity>
              <Text style={styles.yearDisplay}>{selectedFilterYear}</Text>
              <TouchableOpacity
                style={styles.yearNavBtn}
                onPress={() => setSelectedFilterYear(prev => prev + 1)}
              >
                <Feather name="chevron-right" size={18} color="#0f172a" />
              </TouchableOpacity>
            </View>

            {/* 12 Months Grid */}
            <View style={styles.monthsGrid}>
              {MONTH_NAMES.map((name, index) => {
                const isSelected = selectedFilterMonth === index;
                return (
                  <TouchableOpacity
                    key={name}
                    style={[styles.monthGridItem, isSelected && styles.monthGridItemSelected]}
                    onPress={() => {
                      setSelectedFilterMonth(index);
                      setFilterMode('selected_month');
                      setMonthFilterModalVisible(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.monthGridText, isSelected && styles.monthGridTextSelected]}>
                      {name.substring(0, 3)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Quick Actions */}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
              <TouchableOpacity
                style={[styles.modalBtnSecondary, { flex: 1 }]}
                onPress={() => {
                  const now = new Date();
                  setSelectedFilterMonth(now.getMonth());
                  setSelectedFilterYear(now.getFullYear());
                  setFilterMode('selected_month');
                  setMonthFilterModalVisible(false);
                }}
              >
                <Text style={styles.modalBtnSecondaryText}>This Month</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtnPrimary, { flex: 1, backgroundColor: '#0d9488' }]}
                onPress={() => {
                  setFilterMode('selected_month');
                  setMonthFilterModalVisible(false);
                }}
              >
                <Text style={styles.modalBtnPrimaryText}>Apply Filter</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ================= CUSTOM DATE PICKER MODAL ================= */}
      <Modal
        visible={customDatePickerVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setCustomDatePickerVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxWidth: 340, padding: 16 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <TouchableOpacity
                onPress={() => {
                  if (customCalMonth === 0) {
                    setCustomCalMonth(11);
                    setCustomCalYear(prev => prev - 1);
                  } else {
                    setCustomCalMonth(prev => prev - 1);
                  }
                }}
                style={{ padding: 6, backgroundColor: '#f1f5f9', borderRadius: 8 }}
              >
                <Feather name="chevron-left" size={18} color="#0284c7" />
              </TouchableOpacity>
              <Text style={{ fontSize: 14.5, fontWeight: '800', color: '#0f172a' }}>
                {monthNames[customCalMonth]} {customCalYear}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  if (customCalMonth === 11) {
                    setCustomCalMonth(0);
                    setCustomCalYear(prev => prev + 1);
                  } else {
                    setCustomCalMonth(prev => prev + 1);
                  }
                }}
                style={{ padding: 6, backgroundColor: '#f1f5f9', borderRadius: 8 }}
              >
                <Feather name="chevron-right" size={18} color="#0284c7" />
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: 8 }}>
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <Text key={d} style={{ width: 34, textAlign: 'center', fontSize: 10.5, fontWeight: '700', color: '#64748b' }}>
                  {d}
                </Text>
              ))}
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {Array.from({ length: new Date(customCalYear, customCalMonth, 1).getDay() }).map((_, i) => (
                <View key={`c-empty-${i}`} style={{ width: `${100 / 7}%`, height: 36 }} />
              ))}
              {Array.from({ length: new Date(customCalYear, customCalMonth + 1, 0).getDate() }).map((_, i) => {
                const dayNum = i + 1;
                const formattedMonth = (customCalMonth + 1) < 10 ? `0${customCalMonth + 1}` : `${customCalMonth + 1}`;
                const formattedDay = dayNum < 10 ? `0${dayNum}` : `${dayNum}`;
                const isoStr = `${customCalYear}-${formattedMonth}-${formattedDay}`;
                const isSelected = customDateISO === isoStr;
                const isToday = todayStr === isoStr;

                return (
                  <TouchableOpacity
                    key={`c-day-${dayNum}`}
                    onPress={() => {
                      setCustomDateISO(isoStr);
                      setFilterMode('custom_date');
                      setCustomDatePickerVisible(false);
                    }}
                    style={{
                      width: `${100 / 7}%`,
                      height: 36,
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <View style={[
                      { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
                      isSelected && { backgroundColor: '#0284c7' },
                      !isSelected && isToday && { borderWidth: 1.5, borderColor: '#0284c7' }
                    ]}>
                      <Text style={[
                        { fontSize: 12, fontWeight: '700', color: '#0f172a' },
                        isSelected && { color: '#ffffff', fontWeight: '800' },
                        !isSelected && isToday && { color: '#0284c7', fontWeight: '800' }
                      ]}>
                        {dayNum}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              onPress={() => setCustomDatePickerVisible(false)}
              style={{ marginTop: 14, backgroundColor: '#f1f5f9', paddingVertical: 9, borderRadius: 8, alignItems: 'center' }}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569' }}>Close Calendar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ================= RESCHEDULE FOLLOW-UP MODAL ================= */}
      {rescheduleModalItem && (
        <Modal
          transparent
          animationType="fade"
          visible={!!rescheduleModalItem}
          onRequestClose={() => setRescheduleModalItem(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { maxHeight: '90%' }]}>
              <ScrollView showsVerticalScrollIndicator={false}>
                {/* Header */}
                <View style={styles.modalHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ width: 28, height: 28, borderRadius: 6, backgroundColor: '#fef3c7', alignItems: 'center', justifyContent: 'center' }}>
                      <Feather name="clock" size={16} color="#b45309" />
                    </View>
                    <View>
                      <Text style={styles.modalTitle}>Reschedule Follow-Up</Text>
                      <Text style={{ fontSize: 10.5, color: '#64748b' }}>Move to a new scheduled date</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => setRescheduleModalItem(null)}
                    style={{ padding: 4 }}
                  >
                    <Feather name="x" size={18} color="#64748b" />
                  </TouchableOpacity>
                </View>

                {/* Patient Banner */}
                <View style={styles.patientBanner}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                    <Text style={styles.bannerName}>{rescheduleModalItem.patientName}</Text>
                    <Text style={{ fontSize: 10.5, fontWeight: '700', color: '#0284c7' }}>{rescheduleModalItem.regId}</Text>
                  </View>
                  <Text style={styles.bannerSub}>
                    📞 {rescheduleModalItem.phone} • 👨‍⚕️ {rescheduleModalItem.doctorName}
                  </Text>
                  {rescheduleModalItem.diseases ? (
                    <Text style={{ fontSize: 10.5, color: '#475569', marginTop: 2, fontStyle: 'italic' }}>
                      🩺 {rescheduleModalItem.diseases}
                    </Text>
                  ) : null}
                </View>

                {/* Current Scheduled Date */}
                <View style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  backgroundColor: '#fffbeb',
                  borderWidth: 1,
                  borderColor: '#fde68a',
                  borderRadius: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 7,
                  marginBottom: 12
                }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#92400e' }}>Current Scheduled Date:</Text>
                  <Text style={{ fontSize: 11.5, fontWeight: '800', color: '#b45309' }}>
                    📅 {formatDisplayDate(rescheduleModalItem.preferredDate)}
                  </Text>
                </View>

                {/* Target Date Selector */}
                <Text style={styles.inputLabel}>Select New Follow-Up Date *</Text>
                <TouchableOpacity
                  style={styles.datePickerBtn}
                  onPress={() => setRescheduleDatePickerVisible(true)}
                  activeOpacity={0.7}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Feather name="calendar" size={14} color="#0284c7" />
                    <Text style={{ fontSize: 12.5, fontWeight: '700', color: '#0f172a' }}>
                      {toDDMMYYYY(rescheduleDateISO)}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#0284c7' }}>Change Date</Text>
                </TouchableOpacity>

                {/* Quick Shift Chips */}
                <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                  {[
                    { label: '+3 Days', days: 3 },
                    { label: '+1 Week', days: 7 },
                    { label: '+15 Days', days: 15 },
                    { label: '+1 Month', days: 30 }
                  ].map(chip => (
                    <TouchableOpacity
                      key={chip.label}
                      onPress={() => handleShiftRescheduleDays(chip.days)}
                      style={{
                        backgroundColor: '#f1f5f9',
                        borderWidth: 1,
                        borderColor: '#cbd5e1',
                        borderRadius: 6,
                        paddingHorizontal: 8,
                        paddingVertical: 4
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={{ fontSize: 10.5, fontWeight: '700', color: '#475569' }}>{chip.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Reason / Notes */}
                <Text style={styles.inputLabel}>Reason / Note</Text>
                <TextInput
                  style={styles.modalInput}
                  value={rescheduleReason}
                  onChangeText={setRescheduleReason}
                  placeholder="e.g. Patient requested date change"
                  placeholderTextColor="#94a3b8"
                />

                {/* Quick Reason Chips */}
                <View style={{ flexDirection: 'row', gap: 5, marginBottom: 16, flexWrap: 'wrap' }}>
                  {['Patient Requested', 'Out of Station', 'Doctor Unavailable', 'Follow-up Delayed'].map(r => {
                    const isSelected = rescheduleReason === r;
                    return (
                      <TouchableOpacity
                        key={r}
                        onPress={() => setRescheduleReason(r)}
                        style={{
                          backgroundColor: isSelected ? '#e0f2fe' : '#f8fafc',
                          borderWidth: 1,
                          borderColor: isSelected ? '#0284c7' : '#e2e8f0',
                          borderRadius: 5,
                          paddingHorizontal: 7,
                          paddingVertical: 3
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={{ fontSize: 10, fontWeight: '600', color: isSelected ? '#0284c7' : '#64748b' }}>
                          {r}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Bottom Actions */}
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={() => setRescheduleModalItem(null)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.confirmBtn,
                      { backgroundColor: '#d97706', flexDirection: 'row', alignItems: 'center', gap: 5 },
                      (isRescheduling || !rescheduleDateISO) && { opacity: 0.6 }
                    ]}
                    disabled={isRescheduling || !rescheduleDateISO}
                    onPress={handleConfirmReschedule}
                    activeOpacity={0.7}
                  >
                    {isRescheduling ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Feather name="check" size={13} color="#ffffff" />
                    )}
                    <Text style={styles.confirmBtnText}>Confirm Reschedule</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}

      {/* Reschedule Date Picker Sub-Modal */}
      <Modal
        visible={rescheduleDatePickerVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setRescheduleDatePickerVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxWidth: 340, padding: 16 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <TouchableOpacity
                onPress={() => {
                  if (rescheduleCalMonth === 0) {
                    setRescheduleCalMonth(11);
                    setRescheduleCalYear(prev => prev - 1);
                  } else {
                    setRescheduleCalMonth(prev => prev - 1);
                  }
                }}
                style={{ padding: 6, backgroundColor: '#f1f5f9', borderRadius: 8 }}
              >
                <Feather name="chevron-left" size={18} color="#d97706" />
              </TouchableOpacity>
              <Text style={{ fontSize: 14.5, fontWeight: '800', color: '#0f172a' }}>
                {monthNames[rescheduleCalMonth]} {rescheduleCalYear}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  if (rescheduleCalMonth === 11) {
                    setRescheduleCalMonth(0);
                    setRescheduleCalYear(prev => prev + 1);
                  } else {
                    setRescheduleCalMonth(prev => prev + 1);
                  }
                }}
                style={{ padding: 6, backgroundColor: '#f1f5f9', borderRadius: 8 }}
              >
                <Feather name="chevron-right" size={18} color="#d97706" />
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: 8 }}>
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <Text key={d} style={{ width: 34, textAlign: 'center', fontSize: 10.5, fontWeight: '700', color: '#64748b' }}>
                  {d}
                </Text>
              ))}
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {Array.from({ length: new Date(rescheduleCalYear, rescheduleCalMonth, 1).getDay() }).map((_, i) => (
                <View key={`r-empty-${i}`} style={{ width: `${100 / 7}%`, height: 36 }} />
              ))}
              {Array.from({ length: new Date(rescheduleCalYear, rescheduleCalMonth + 1, 0).getDate() }).map((_, i) => {
                const dayNum = i + 1;
                const formattedMonth = (rescheduleCalMonth + 1) < 10 ? `0${rescheduleCalMonth + 1}` : `${rescheduleCalMonth + 1}`;
                const formattedDay = dayNum < 10 ? `0${dayNum}` : `${dayNum}`;
                const isoStr = `${rescheduleCalYear}-${formattedMonth}-${formattedDay}`;
                const isSelected = rescheduleDateISO === isoStr;
                const isToday = todayStr === isoStr;

                return (
                  <TouchableOpacity
                    key={`r-day-${dayNum}`}
                    onPress={() => {
                      setRescheduleDateISO(isoStr);
                      setRescheduleDatePickerVisible(false);
                    }}
                    style={{
                      width: `${100 / 7}%`,
                      height: 36,
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <View style={[
                      { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
                      isSelected && { backgroundColor: '#d97706' },
                      !isSelected && isToday && { borderWidth: 1.5, borderColor: '#d97706' }
                    ]}>
                      <Text style={[
                        { fontSize: 12, fontWeight: '700', color: '#0f172a' },
                        isSelected && { color: '#ffffff', fontWeight: '800' },
                        !isSelected && isToday && { color: '#d97706', fontWeight: '800' }
                      ]}>
                        {dayNum}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              onPress={() => setRescheduleDatePickerVisible(false)}
              style={{ marginTop: 14, backgroundColor: '#f1f5f9', paddingVertical: 9, borderRadius: 8, alignItems: 'center' }}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569' }}>Close Calendar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export const MobileFollowUpsScreen = FollowUpsScreen;

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12, backgroundColor: '#f8fafc' },
  tabScrollWrapper: { marginBottom: 10 },
  tabRow: { flexDirection: 'row', gap: 6, paddingVertical: 2 },
  tabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 10,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1'
  },
  tabBtnActive: {
    backgroundColor: '#0284c7',
    borderColor: '#0284c7'
  },
  tabText: { fontSize: 11, fontWeight: '700', color: '#475569' },
  tabTextActive: { fontSize: 11, fontWeight: '700', color: '#ffffff' },
  badgePill: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 8
  },
  badgePillInactive: {
    backgroundColor: '#f1f5f9'
  },
  badgePillActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)'
  },
  badgePillText: { fontSize: 9.5, fontWeight: '800' },
  badgePillTextInactive: { color: '#0f172a' },
  badgePillTextActive: { color: '#ffffff' },
  card: { backgroundColor: '#ffffff', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 11, marginBottom: 7, borderWidth: 1, borderColor: '#e2e8f0', shadowColor: '#0f172a', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 2, elevation: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 },
  patientName: { fontSize: 13.5, fontWeight: '700', color: '#0f172a' },
  visitBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  visitBadgeText: {
    fontSize: 8.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  regId: { fontSize: 10.5, color: '#64748b', marginTop: 0.5 },
  badge: { paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 4 },
  badgeText: { fontSize: 8.5, fontWeight: '800' },
  cardBody: { borderTopWidth: 1, borderTopColor: '#f8fafc', paddingTop: 3, marginBottom: 4 },
  infoText: { fontSize: 11.5, color: '#475569' },
  diagText: { fontSize: 10.5, color: '#64748b', marginTop: 1 },
  boldText: { fontWeight: '700', color: '#1e293b' },
  cardFooter: { borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 5, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dueDateText: { fontSize: 11, fontWeight: '700' },
  completeBtn: { flexDirection: 'row', alignItems: 'center', gap: 3.5, backgroundColor: '#16a34a', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 5 },
  completeBtnText: { color: '#ffffff', fontSize: 10.5, fontWeight: '800' },
  bookBtn: { flexDirection: 'row', alignItems: 'center', gap: 3.5, backgroundColor: '#0284c7', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 5 },
  bookBtnText: { color: '#ffffff', fontSize: 10.5, fontWeight: '700' },
  rescheduleBtn: { flexDirection: 'row', alignItems: 'center', gap: 3.5, backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fcd34d', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 5 },
  rescheduleBtnText: { color: '#b45309', fontSize: 10.5, fontWeight: '700' },
  iconBtnCall: { width: 26, height: 26, borderRadius: 5, backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe', alignItems: 'center', justifyContent: 'center' },
  iconBtnWA: { width: 26, height: 26, borderRadius: 5, backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0', alignItems: 'center', justifyContent: 'center' },
  emptyContainer: { padding: 40, alignItems: 'center', gap: 6 },
  emptyTitle: { fontSize: 14, fontWeight: '700', color: '#334155' },
  emptySub: { fontSize: 11.5, color: '#64748b', textAlign: 'center' },
  // Modal styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.5)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  modalCard: { width: '100%', maxWidth: 360, backgroundColor: '#ffffff', borderRadius: 16, padding: 18, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 5 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  patientBanner: { backgroundColor: '#f8fafc', padding: 10, borderRadius: 8, marginBottom: 12, borderWidth: 1, borderColor: '#f1f5f9' },
  bannerName: { fontSize: 13.5, fontWeight: '700', color: '#0f172a' },
  bannerSub: { fontSize: 11.5, color: '#64748b', marginTop: 1 },
  inputLabel: { fontSize: 11.5, fontWeight: '700', color: '#334155', marginBottom: 4 },
  modalInput: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, fontSize: 13, color: '#0f172a', marginBottom: 10 },
  datePickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 10
  },
  slotBox: {
    width: '23%',
    paddingVertical: 6,
    paddingHorizontal: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6
  },
  slotBoxActive: {
    borderColor: '#0284c7',
    backgroundColor: '#0284c7'
  },
  slotBoxFull: {
    backgroundColor: '#f1f5f9',
    borderColor: '#e2e8f0',
    opacity: 0.6
  },
  slotBoxPast: {
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0',
    opacity: 0.45
  },
  slotBoxText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#1e293b'
  },
  slotBoxTextActive: {
    color: '#ffffff'
  },
  slotBoxTextFull: {
    color: '#94a3b8',
    textDecorationLine: 'line-through'
  },
  slotBoxTextPast: {
    color: '#94a3b8',
    textDecorationLine: 'line-through'
  },
  slotCapBadge: {
    marginTop: 2,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4
  },
  slotCapBadgeAvail: {
    backgroundColor: '#e0f2fe'
  },
  slotCapBadgeLow: {
    backgroundColor: '#fef3c7'
  },
  slotCapBadgeFull: {
    backgroundColor: '#fee2e2'
  },
  slotCapBadgePast: {
    backgroundColor: '#fee2e2'
  },
  slotCapBadgeSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)'
  },
  slotCapText: {
    fontSize: 8.5,
    fontWeight: '800'
  },
  slotCapTextAvail: {
    color: '#0369a1'
  },
  slotCapTextLow: {
    color: '#b45309'
  },
  slotCapTextFull: {
    color: '#ef4444'
  },
  slotCapTextPast: {
    color: '#dc2626'
  },
  slotCapTextSelected: {
    color: '#ffffff'
  },
  slotPill: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 6, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#cbd5e1' },
  slotPillActive: { backgroundColor: '#0284c7', borderColor: '#0284c7' },
  slotPillText: { fontSize: 11, fontWeight: '600', color: '#475569' },
  slotPillTextActive: { color: '#ffffff' },
  cancelBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 7, backgroundColor: '#f1f5f9' },
  cancelBtnText: { fontSize: 12, fontWeight: '700', color: '#64748b' },
  confirmBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 7, backgroundColor: '#0284c7' },
  confirmBtnText: { fontSize: 12, fontWeight: '700', color: '#ffffff' },
  // Month Filter Bar Styles
  monthFilterBar: {
    marginBottom: 9,
    marginTop: -2
  },
  monthFilterTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 12,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.02,
    shadowRadius: 2,
    elevation: 1
  },
  monthFilterTriggerActive: {
    backgroundColor: '#f0fdfa',
    borderColor: '#0d9488',
    borderWidth: 1.5
  },
  monthFilterText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155'
  },
  monthFilterTextActive: {
    color: '#0f766e'
  },
  monthFilterCountBadge: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8
  },
  monthFilterCountBadgeActive: {
    backgroundColor: 'rgba(13, 148, 136, 0.15)'
  },
  monthFilterCountText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748b'
  },
  monthFilterCountTextActive: {
    color: '#0f766e'
  },
  monthPickerModalCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5
  },
  monthPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14
  },
  monthPickerTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a'
  },
  modalCloseBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center'
  },
  yearSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  yearNavBtn: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1'
  },
  yearDisplay: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a'
  },
  monthsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between'
  },
  monthGridItem: {
    width: '30%',
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center'
  },
  monthGridItemSelected: {
    backgroundColor: '#0d9488',
    borderColor: '#0d9488'
  },
  monthGridText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155'
  },
  monthGridTextSelected: {
    color: '#ffffff',
    fontWeight: '800'
  },
  modalBtnSecondary: {
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center'
  },
  modalBtnSecondaryText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569'
  },
  modalBtnPrimary: {
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: '#0284c7',
    alignItems: 'center',
    justifyContent: 'center'
  },
  modalBtnPrimaryText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff'
  }
});
