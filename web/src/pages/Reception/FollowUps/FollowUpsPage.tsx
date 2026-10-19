import React, { useState, useMemo, useEffect } from 'react';
import { RefreshCw, Phone, Calendar, Clock, MessageSquare, X, Check, CheckCircle2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { db, sendBookingWhatsAppNotification, CanonicalBranchId, resolveCanonicalBranchId, getBranchQueryNames, sanitizeDoctorName } from '@app/shared';
import { collection, onSnapshot, query, limit, updateDoc, setDoc, doc, addDoc, orderBy, getDocs, where } from 'firebase/firestore';
import { createBookingNotificationInFirestore } from '../../../utils/fcmWebTrigger';
import { receptionDataStore } from '../../../utils/receptionDataStore';
import { getPatientVisitState } from '../../../utils/patientVisitState';

export interface FollowUpItem {
  id: string;
  patientName: string;
  phone: string;
  regId: string;
  doctorName: string;
  branchName: string;
  preferredDate: string; // YYYY-MM-DD
  followUpInterval: string; // e.g. '15 Days', '1 Month'
  diseases: string;
  status: 'today' | 'overdue' | 'this_month' | 'next_month' | 'upcoming';
  dateMs?: number;
  raw?: any;
}

interface FollowUpsPageProps {
  currentBranch?: string;
  branchId?: CanonicalBranchId;
  onNavigate?: (tab: string, data?: any) => void;
}

type TabType = 'today' | 'overdue' | 'this_month' | 'next_month' | 'selected_month' | 'custom_date' | 'all';

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
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
    name: 'Dr. Ramakrishna Chanduri',
    phone: '9804176176',
    role: 'Homeopathy Physician',
    branchSchedules: [
      {
        id: 'bs-2-dsnr',
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
        id: 'bs-2-nalla',
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
  },
  {
    id: 'doc-3',
    name: 'Dr. Jobedah Parveez',
    phone: '9903119766',
    role: 'Homeopathy Physician',
    branchSchedules: [
      {
        id: 'bs-3-nalla',
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
        id: 'bs-3-kphb',
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
    id: 'doc-4',
    name: 'Dr. Padma Priya',
    phone: '9490808582',
    role: 'Homeopathy Physician',
    branchSchedules: [
      {
        id: 'bs-4-nalla',
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
        id: 'bs-4-chanda',
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
const todayISO = getLocalDateISO(now);
const yesterdayISO = getYesterdayDateISO();
const getMonthYearStr = (dateObj: Date): string => {
  const yyyy = dateObj.getFullYear();
  const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}`;
};
const thisMonthStr = getMonthYearStr(now);
const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
const nextMonthStr = getMonthYearStr(nextMonthDate);

export const isBranchMatching = (b1: string, b2?: string): boolean => {
  if (!b2 || b2 === 'all' || b2 === 'All Branches' || b2.toLowerCase().trim() === 'all branches') return true;
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
  const isToday = areDatesEqual(cleanDate, getTodayDDMMYYYY()) || cleanDate === todayISO;
  if (!isToday) return false;

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const slotMinutes = parseSlotToMinutes(slotStr);
  return slotMinutes < currentMinutes;
};

const MOCK_FOLLOWUPS: FollowUpItem[] = [
  { id: '1', patientName: 'Rajesh Kumar', phone: '+91 98490 12345', regId: 'SPH-KPB-0101', doctorName: 'Dr. Prashanth K Vaidya', branchName: 'KPHB Branch', preferredDate: todayISO, followUpInterval: '15 Days', diseases: 'Hypertension', status: 'today' },
  { id: '2', patientName: 'Sneha Reddy', phone: '+91 91210 67890', regId: 'SPH-NGL-0102', doctorName: 'Dr. Ramakrishna Chanduri', branchName: 'Nallagandla Branch', preferredDate: yesterdayISO, followUpInterval: '1 Month', diseases: 'Diabetes Management', status: 'overdue' },
  { id: '3', patientName: 'Venkatesh Rao', phone: '+91 94400 45678', regId: 'SPH-DIL-0103', doctorName: 'Dr. Jobedah Parveez', branchName: 'Dilshuknagar Branch', preferredDate: `${thisMonthStr}-25`, followUpInterval: '10 Days', diseases: 'General Checkup', status: 'this_month' },
  { id: '4', patientName: 'Ananya Sharma', phone: '+91 99887 11223', regId: 'SPH-CHN-0104', doctorName: 'Dr. Padma Priya', branchName: 'Chandanagar Branch', preferredDate: `${nextMonthStr}-10`, followUpInterval: '1 Month', diseases: 'Migraine Followup', status: 'next_month' },
  { id: '5', patientName: 'Kiran Verma', phone: '+91 98765 00011', regId: 'SPH-KPB-0105', doctorName: 'Dr. Prashanth K Vaidya', branchName: 'KPHB Branch', preferredDate: `${nextMonthStr}-18`, followUpInterval: '45 Days', diseases: 'Asthma Followup', status: 'next_month' }
];

export const FollowUpsPage: React.FC<FollowUpsPageProps> = ({
  currentBranch = 'KPHB Branch',
  branchId,
  onNavigate
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('today');
  const [customDateISO, setCustomDateISO] = useState<string>(() => todayISO);
  const [selectedBranch, setSelectedBranch] = useState<string>('all');
  const [selectedFilterMonth, setSelectedFilterMonth] = useState<number>(() => new Date().getMonth());
  const [selectedFilterYear, setSelectedFilterYear] = useState<number>(() => new Date().getFullYear());
  const selectedMonthISO = `${selectedFilterYear}-${String(selectedFilterMonth + 1).padStart(2, '0')}`;

  const [rawAppointments, setRawAppointments] = useState<any[]>(() => receptionDataStore.getAppointments());
  const [rawAllPatients, setRawAllPatients] = useState<any[]>(() => receptionDataStore.getAllCollectionsPool());
  const [rawFollowups, setRawFollowups] = useState<any[]>([]);
  const [bookedFollowUpIds, setBookedFollowUpIds] = useState<Set<string>>(new Set());

  // Book Appointment Modal State
  const [bookModalItem, setBookModalItem] = useState<FollowUpItem | null>(null);
  const [bookingDoctor, setBookingDoctor] = useState<string>(SPH_DOCTORS[0]);
  const [bookingDate, setBookingDate] = useState<string>(getTodayDDMMYYYY);
  const [bookingTime, setBookingTime] = useState<string>('10:00 AM');
  const [bookingFee, setBookingFee] = useState<number | ''>('');
  const [isBooking, setIsBooking] = useState<boolean>(false);

  // Reschedule Follow-Up Modal State
  const [rescheduleModalItem, setRescheduleModalItem] = useState<FollowUpItem | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState<string>(''); // YYYY-MM-DD
  const [rescheduleReason, setRescheduleReason] = useState<string>('Patient requested date change');
  const [isRescheduling, setIsRescheduling] = useState<boolean>(false);

  // Calendar Modal State
  const [calendarModalOpen, setCalendarModalOpen] = useState<boolean>(false);
  const [calMonth, setCalMonth] = useState<number>(() => new Date().getMonth());
  const [calYear, setCalYear] = useState<number>(() => new Date().getFullYear());

  const monthNames = MONTH_NAMES;

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

  // Success Feedback Banner State
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  // Subscribe to live Firestore collections (lightweight, zero heavy image blobs)
  useEffect(() => {
    if (!db) return;

    // Ensure reception data store listeners are started
    receptionDataStore.startListeners();

    // 1. Instant sync from receptionDataStore (zero network cost, already running in background)
    const unsubStore = receptionDataStore.subscribe((state) => {
      if (state.appointments && state.appointments.length > 0) {
        setRawAppointments(state.appointments);
      }
      if (state.allCollectionsPool && state.allCollectionsPool.length > 0) {
        setRawAllPatients(state.allCollectionsPool);
      }
    });

    // 2. Real-time followups collection (branch-scoped server query for 4x faster loading)
    const branchQueryNames = getBranchQueryNames(branchId || currentBranch);
    const followupsQuery = branchQueryNames.length > 0
      ? query(collection(db, 'followups'), where('branchName', 'in', branchQueryNames))
      : collection(db, 'followups');

    const unsubFollowups = onSnapshot(followupsQuery, (snap) => {
      const list: any[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      setRawFollowups(list);
    }, (err) => console.warn('Followups note:', err));

    // 3. Doctors list
    const unsubDoctors = onSnapshot(collection(db, 'doctors'), (snap) => {
      if (!snap.empty) {
        const fetched: Doctor[] = [];
        snap.forEach((d) => {
          const data = d.data();
          const normDataName = (data.name || data.doctorName || '').toLowerCase().replace(/dr\.?\s*/i, '').trim();
          const seedFallback = DEFAULT_DOCTORS_SEED.find(s => {
            const normSeedName = s.name.toLowerCase().replace(/dr\.?\s*/i, '').trim();
            return normDataName && (normSeedName.includes(normDataName) || normDataName.includes(normSeedName));
          }) || DEFAULT_DOCTORS_SEED.find(s => s.id === d.id);
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

    // 4. Temporary Doctor Slots
    const unsubTemp = onSnapshot(collection(db, 'doctor_temp_slots'), (snap) => {
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

  // Process and Deduplicate Live Follow-Up Items (Option 2: Each visit/prescription shown separately)
  const followUpItems = useMemo(() => {
    const map = new Map<string, FollowUpItem>();
    const seenPatientFollowups = new Set<string>();

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
      if (l.includes('dilshuk') || l.includes('dsn') || l.includes('dsnr')) return 'dilshuknagar';
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

    // Merge mock followups as fallback ONLY if no live records exist
    if (map.size === 0) {
      MOCK_FOLLOWUPS.forEach(m => {
        const cleanDigits = m.phone.replace(/\D/g, '').slice(-10);
        if (bookedFollowUpIds.has(cleanDigits) || bookedFollowUpIds.has(m.id)) return;
        const patientApptDates = activeAppointmentsByPatient.get(cleanDigits);
        if (patientApptDates && (patientApptDates.has(m.preferredDate) || patientApptDates.has(todayISO))) return;
        if (!map.has(cleanDigits)) {
          map.set(cleanDigits, m);
        }
      });
    }

    const list = Array.from(map.values());
    list.sort((a, b) => (b.dateMs || 0) - (a.dateMs || 0));
    return list;
  }, [rawFollowups, rawAppointments, rawAllPatients, currentBranch, branchId, bookedFollowUpIds, activeAppointmentsByPatient]);

  // Filtered Items based on active tab and branch
  const filteredItems = useMemo(() => {
    return followUpItems.filter((item) => {
      if (selectedBranch !== 'all' && !isBranchMatching(item.branchName, selectedBranch)) return false;
      if (currentBranch && !isBranchMatching(item.branchName, currentBranch)) return false;

      if (activeTab === 'today') {
        if (item.preferredDate !== todayISO) return false;
      } else if (activeTab === 'overdue') {
        if (item.preferredDate >= todayISO) return false;
      } else if (activeTab === 'this_month') {
        if (!item.preferredDate.startsWith(thisMonthStr)) return false;
      } else if (activeTab === 'next_month') {
        if (!item.preferredDate.startsWith(nextMonthStr)) return false;
      } else if (activeTab === 'selected_month') {
        if (!item.preferredDate.startsWith(selectedMonthISO)) return false;
      } else if (activeTab === 'custom_date') {
        if (item.preferredDate !== customDateISO) return false;
      }
      return true;
    });
  }, [followUpItems, activeTab, selectedBranch, currentBranch, selectedMonthISO, customDateISO]);

  // Metric Stats for Tabs
  const stats = useMemo(() => {
    let today = 0, overdue = 0, thisMonth = 0, nextMonth = 0, selectedMonth = 0, customDate = 0;
    const scopedList = followUpItems.filter(item => {
      if (selectedBranch !== 'all' && !isBranchMatching(item.branchName, selectedBranch)) return false;
      if (currentBranch && !isBranchMatching(item.branchName, currentBranch)) return false;
      return true;
    });

    scopedList.forEach(i => {
      const pDate = i.preferredDate;
      if (pDate === todayISO) today++;
      if (pDate < todayISO) overdue++;
      if (pDate.startsWith(thisMonthStr)) thisMonth++;
      if (pDate.startsWith(nextMonthStr)) nextMonth++;
      if (pDate.startsWith(selectedMonthISO)) selectedMonth++;
      if (pDate === customDateISO) customDate++;
    });
    return { total: scopedList.length, today, overdue, thisMonth, nextMonth, selectedMonth, customDate };
  }, [followUpItems, selectedBranch, currentBranch, selectedMonthISO, customDateISO]);

  // Page-wise Pagination State
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);

  // Reset to page 1 whenever filters or tabs change
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, selectedFilterMonth, selectedFilterYear, selectedBranch, currentBranch, customDateISO, pageSize]);

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredItems.length / pageSize));
  }, [filteredItems.length, pageSize]);

  // Keep currentPage within valid bounds
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, filteredItems.length);

  const pageItems = useMemo(() => {
    return filteredItems.slice(startIndex, endIndex);
  }, [filteredItems, startIndex, endIndex]);

  // Handler: Direct Complete Appointment
  const handleCompleteAppointment = async (item: FollowUpItem) => {
    if (!window.confirm(`Are you sure you want to mark ${item.patientName}'s follow-up appointment as completed?`)) return;
    try {
      const targetId = item.id || item.raw?.id;
      const cleanPhone = item.phone ? item.phone.replace(/\D/g, '').slice(-10) : '';

      // Optimistically remove from follow-up UI
      setBookedFollowUpIds(prev => {
        const next = new Set(prev);
        if (targetId) next.add(targetId);
        if (cleanPhone) next.add(cleanPhone);
        if (item.regId) next.add(item.regId);
        next.add(`${item.patientName.toLowerCase()}_${item.regId}`);
        return next;
      });

      if (db && targetId) {
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
          await updateDoc(doc(db, col, targetId), payload).catch(() => { });
        }
        setFeedbackMsg(`✓ ${item.patientName}'s appointment marked as Completed!`);
        setTimeout(() => setFeedbackMsg(null), 4000);
      }
    } catch (err) {
      console.error('Error completing appointment:', err);
    }
  };

  // Handler: Open Reschedule Follow-up Modal
  const handleOpenReschedule = (item: FollowUpItem) => {
    setRescheduleModalItem(item);
    setRescheduleDate(item.preferredDate || todayISO);
    setRescheduleReason('Patient requested date change');
  };

  const handleShiftRescheduleDays = (daysToAdd: number) => {
    const base = rescheduleDate ? new Date(rescheduleDate) : new Date();
    base.setDate(base.getDate() + daysToAdd);
    const y = base.getFullYear();
    const m = String(base.getMonth() + 1).padStart(2, '0');
    const d = String(base.getDate()).padStart(2, '0');
    setRescheduleDate(`${y}-${m}-${d}`);
  };

  // Handler: Confirm Reschedule Follow-up Date
  const handleConfirmReschedule = async () => {
    if (!rescheduleModalItem || !rescheduleDate) return;
    setIsRescheduling(true);
    try {
      const cleanPhone = rescheduleModalItem.phone.replace(/\D/g, '').slice(-10);
      const rawId = rescheduleModalItem.raw?.id || rescheduleModalItem.id;
      const targetDateISO = formatISO(rescheduleDate);

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

      // 1. Update/set in followups collection so the live listener picks it up immediately
      if (rawId) {
        await setDoc(doc(db, 'followups', rawId), {
          ...rescheduleModalItem.raw,
          patientName: rescheduleModalItem.patientName,
          phone: cleanPhone || rescheduleModalItem.phone,
          registrationId: rescheduleModalItem.regId,
          doctorName: rescheduleModalItem.doctorName,
          branchName: rescheduleModalItem.branchName || currentBranch,
          diseases: rescheduleModalItem.diseases,
          ...updatePayload
        }, { merge: true }).catch(() => { });

        // Update in other collections if document exists there
        const otherCollections = ['appointments', 'allpatients', 'prescriptions', 'patients'];
        for (const col of otherCollections) {
          updateDoc(doc(db, col, rawId), updatePayload).catch(() => { });
        }
      } else if (cleanPhone) {
        await setDoc(doc(db, 'followups', `${cleanPhone}_followup`), {
          patientName: rescheduleModalItem.patientName,
          phone: cleanPhone,
          registrationId: rescheduleModalItem.regId,
          doctorName: rescheduleModalItem.doctorName,
          branchName: rescheduleModalItem.branchName || currentBranch,
          diseases: rescheduleModalItem.diseases,
          ...updatePayload
        }, { merge: true }).catch(() => { });
      }

      // 2. Immediate 0ms local state update
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

      // 3. Feedback message
      setFeedbackMsg(`Follow-up for ${rescheduleModalItem.patientName} moved to ${toDDMMYYYY(targetDateISO)}`);
      setTimeout(() => setFeedbackMsg(null), 4000);

      // 4. Close modal
      setRescheduleModalItem(null);
    } catch (err) {
      console.error('Error rescheduling follow-up:', err);
    } finally {
      setIsRescheduling(false);
    }
  };

  // Handler: Open Book Appointment Modal
  const handleOpenBook = (item: FollowUpItem) => {
    const targetDate = toDDMMYYYY(item.preferredDate || todayISO);
    const targetBranch = item.branchName || currentBranch;
    const avail = getAvailableDoctors(targetDate, targetBranch, allDoctorsList);
    setBookModalItem(item);
    setBookingDate(targetDate);
    const matchedDoc = avail.find(d => isSameDoctor(d, item.doctorName));
    setBookingDoctor(matchedDoc || avail[0] || item.doctorName || SPH_DOCTORS[0]);
    setBookingTime('');
    setBookingFee('');

    const parts = targetDate.split('-');
    if (parts.length === 3) {
      const m = parseInt(parts[1], 10) - 1;
      const y = parseInt(parts[2], 10);
      if (!isNaN(m) && !isNaN(y)) {
        setCalMonth(m);
        setCalYear(y);
      }
    }
  };

  const handleBookingDateChange = (newDate: string) => {
    setBookingDate(newDate);
    const targetBranch = bookModalItem?.branchName || currentBranch;
    const avail = getAvailableDoctors(newDate, targetBranch, allDoctorsList);
    if (avail.length > 0) {
      const isStillAvail = avail.some(d => isSameDoctor(d, bookingDoctor));
      if (!isStillAvail) {
        setBookingDoctor(avail[0]);
      }
    }
  };

  // Handler: Confirm Book Appointment
  const handleConfirmBook = async () => {
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

      await addDoc(collection(db, 'appointments'), payload);
      await addDoc(collection(db, 'allpatients'), payload).catch(() => { });

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
          updateDoc(doc(db, col, rawId), followUpBookedUpdate).catch(() => { });
        }
      }

      if (cleanPhone) {
        try {
          const fSnap = await getDocs(query(collection(db, 'followups'), where('phone', '==', cleanPhone))).catch(() => null);
          if (fSnap && !fSnap.empty) {
            fSnap.forEach(d => {
              updateDoc(d.ref, followUpBookedUpdate).catch(() => { });
            });
          }
        } catch (e) { }
      }

      sendBookingWhatsAppNotification({
        patientName: bookModalItem.patientName,
        phone: cleanPhone || bookModalItem.phone,
        date: bookingDate,
        time: bookingTime,
        doctorName: bookingDoctor,
        branch: bookModalItem.branchName || currentBranch
      }).catch(err => console.error('WhatsApp booking error:', err));

      // Trigger FCM Push Notification and 10-day Firestore retention cleanup
      createBookingNotificationInFirestore({
        patientName: bookModalItem.patientName,
        appointmentTime: bookingTime,
        appointmentDate: bookingDate,
        branch: bookModalItem.branchName || currentBranch,
        doctorName: bookingDoctor,
      }).catch(err => console.warn('FCM follow-up booking notification notice:', err));

      setFeedbackMsg(`Appointment booked for ${bookModalItem.patientName} with ${bookingDoctor} on ${formatDisplayDate(bookingDate)}.`);
      setBookModalItem(null);
      if (onNavigate) {
        onNavigate('reception');
      }
      setTimeout(() => setFeedbackMsg(null), 5000);
    } catch (err) {
      console.error('Error booking appointment:', err);
    } finally {
      setIsBooking(false);
    }
  };

  const getBadgeDetails = (pDate: string) => {
    if (pDate < todayISO) {
      return { label: 'OVERDUE', bg: '#fef2f2', text: '#dc2626' };
    }
    if (pDate === todayISO) {
      return { label: 'TODAY', bg: '#fffbeb', text: '#b45309' };
    }
    if (pDate.startsWith(thisMonthStr)) {
      return { label: 'THIS MONTH', bg: '#f0f9ff', text: '#0284c7' };
    }
    if (pDate.startsWith(nextMonthStr)) {
      return { label: 'NEXT MONTH', bg: '#f5f3ff', text: '#7c3aed' };
    }
    return { label: 'UPCOMING', bg: '#f0fdf4', text: '#15803d' };
  };

  return (
    <div style={{ padding: '20px 24px', maxWidth: '1300px', margin: '0 auto', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ background: '#e0f2fe', padding: '10px', borderRadius: '14px', color: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <RefreshCw size={24} />
          </div>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
              Patient Follow-Ups
            </h1>
            <p style={{ color: '#64748b', fontSize: '13px', margin: '2px 0 0 0' }}>
              Track today, overdue, this month, next month, and all scheduled patient follow-ups
            </p>
          </div>
        </div>
      </div>

      {/* Success Notification Banner */}
      {feedbackMsg && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: '#ecfdf5',
          border: '1px solid #a7f3d0',
          color: '#065f46',
          padding: '10px 16px',
          borderRadius: '10px',
          marginBottom: '16px',
          fontSize: '13px',
          fontWeight: 600
        }}>
          <CheckCircle2 size={16} color="#059669" />
          <span>{feedbackMsg}</span>
        </div>
      )}

      {/* Compact Reduced Height Filter Tab Buttons */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: '10px',
        marginBottom: '14px'
      }}>
        {[
          { label: 'Today', count: stats.today, tab: 'today', color: '#b45309', bg: '#fffbeb' },
          { label: 'Overdue', count: stats.overdue, tab: 'overdue', color: '#dc2626', bg: '#fef2f2' },
          { label: 'This Month', count: stats.thisMonth, tab: 'this_month', color: '#0284c7', bg: '#f0f9ff' },
          { label: 'Next Month', count: stats.nextMonth, tab: 'next_month', color: '#7c3aed', bg: '#f5f3ff' },
          { label: `${MONTH_NAMES[selectedFilterMonth].substring(0, 3)} ${selectedFilterYear}`, count: stats.selectedMonth, tab: 'selected_month', color: '#0d9488', bg: '#f0fdfa' },
          { label: 'All Months', count: stats.total, tab: 'all', color: '#059669', bg: '#ecfdf5' },
          { label: 'Custom Date', count: stats.customDate, tab: 'custom_date', color: '#2563eb', bg: '#eff6ff' },
        ].map((item) => {
          const isActive = activeTab === item.tab;
          return (
            <button
              key={item.tab}
              type="button"
              onClick={() => setActiveTab(item.tab as TabType)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 14px',
                height: '44px',
                background: isActive ? item.bg : '#ffffff',
                border: isActive ? `2px solid ${item.color}` : '1px solid #cbd5e1',
                borderRadius: '10px',
                cursor: 'pointer',
                boxShadow: isActive ? `0 2px 8px ${item.color}20` : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <span style={{
                fontSize: '12px',
                fontWeight: 700,
                color: isActive ? item.color : '#334155',
                textTransform: 'uppercase',
                letterSpacing: '0.02em'
              }}>
                {item.label}
              </span>
              <span style={{
                background: isActive ? item.color : '#f1f5f9',
                color: isActive ? '#ffffff' : '#0f172a',
                padding: '2px 8px',
                borderRadius: '12px',
                fontSize: '11px',
                fontWeight: 800
              }}>
                {item.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Custom Date Input Picker Inline */}
      {
        activeTab === 'custom_date' && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            background: '#eff6ff',
            border: '2px solid #2563eb',
            borderRadius: '10px',
            padding: '8px 16px',
            marginBottom: '14px',
            maxWidth: '340px'
          }}>
            <Calendar size={16} color="#2563eb" />
            <span style={{ fontSize: '13px', fontWeight: 800, color: '#1e40af' }}>Select Custom Date:</span>
            <input
              type="date"
              value={customDateISO}
              onChange={(e) => {
                if (e.target.value) {
                  setCustomDateISO(e.target.value);
                }
              }}
              style={{
                border: '1px solid #bfdbfe',
                borderRadius: '6px',
                padding: '4px 10px',
                fontSize: '13px',
                fontWeight: 700,
                color: '#1e3a8a',
                outline: 'none',
                background: '#ffffff',
                cursor: 'pointer'
              }}
            />
          </div>
        )
      }

      {/* Month & Year Dropdown Selector Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        padding: '12px 18px',
        background: activeTab === 'selected_month' ? '#f0fdfa' : '#f8fafc',
        border: activeTab === 'selected_month' ? '1.5px solid #0d9488' : '1px solid #e2e8f0',
        borderRadius: '12px',
        marginBottom: '20px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#0f172a', fontWeight: 700, fontSize: '13px' }}>
            <Calendar size={17} color="#0d9488" />
            <span>Select Month & Year:</span>
          </div>

          {/* Month Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Month:</span>
            <select
              value={selectedFilterMonth}
              onChange={(e) => {
                setSelectedFilterMonth(parseInt(e.target.value, 10));
                setActiveTab('selected_month');
              }}
              style={{
                padding: '6px 12px',
                fontSize: '13px',
                fontWeight: 600,
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#0f172a',
                cursor: 'pointer',
                outline: 'none'
              }}
            >
              {MONTH_NAMES.map((name, idx) => (
                <option key={name} value={idx}>{name}</option>
              ))}
            </select>
          </div>

          {/* Year Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>Year:</span>
            <select
              value={selectedFilterYear}
              onChange={(e) => {
                setSelectedFilterYear(parseInt(e.target.value, 10));
                setActiveTab('selected_month');
              }}
              style={{
                padding: '6px 12px',
                fontSize: '13px',
                fontWeight: 600,
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#0f172a',
                cursor: 'pointer',
                outline: 'none'
              }}
            >
              {[2024, 2025, 2026, 2027, 2028, 2029, 2030].map((yr) => (
                <option key={yr} value={yr}>{yr}</option>
              ))}
            </select>
          </div>

          {/* Filter Action Button */}
          <button
            type="button"
            onClick={() => setActiveTab('selected_month')}
            style={{
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: 700,
              borderRadius: '8px',
              border: 'none',
              background: activeTab === 'selected_month' ? '#0d9488' : '#0284c7',
              color: '#ffffff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s ease'
            }}
          >
            <span>Show Month Follow-Ups</span>
            <span style={{
              background: 'rgba(255, 255, 255, 0.28)',
              color: '#ffffff',
              padding: '1px 7px',
              borderRadius: '10px',
              fontSize: '11px',
              fontWeight: 800
            }}>
              {stats.selectedMonth}
            </span>
          </button>
        </div>

        <div style={{ fontSize: '12.5px', color: activeTab === 'selected_month' ? '#0f766e' : '#64748b', fontWeight: 600 }}>
          {activeTab === 'selected_month' ? (
            <span>✓ Showing: <strong>{MONTH_NAMES[selectedFilterMonth]} {selectedFilterYear}</strong> ({stats.selectedMonth} follow-up{stats.selectedMonth !== 1 ? 's' : ''})</span>
          ) : (
            <span>Selected: <strong>{MONTH_NAMES[selectedFilterMonth]} {selectedFilterYear}</strong> ({stats.selectedMonth} follow-up{stats.selectedMonth !== 1 ? 's' : ''})</span>
          )}
        </div>
      </div>

      {/* Table Section */}
      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', fontSize: '11.5px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              <th style={{ padding: '12px 16px' }}>PATIENT INFO</th>
              <th style={{ padding: '12px 16px' }}>DOCTOR & BRANCH</th>
              <th style={{ padding: '12px 16px' }}>FOLLOW-UP DATE</th>
              <th style={{ padding: '12px 16px' }}>DIAGNOSIS / NOTES</th>
              <th style={{ padding: '12px 16px' }}>STATUS</th>
              <th style={{ padding: '12px 16px', textAlign: 'right' }}>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '40px 16px', textAlign: 'center', color: '#64748b' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                    <RefreshCw size={32} color="#94a3b8" />
                    <div style={{ fontWeight: 700, color: '#334155' }}>No follow-up records found</div>
                    <div style={{ fontSize: '12px' }}>
                      No follow-ups scheduled under "{activeTab.replace('_', ' ').toUpperCase()}".
                    </div>
                  </div>
                </td>
              </tr>
            ) : (() => {
              const pool = receptionDataStore.getAllCollectionsPool();
              const pkgs = receptionDataStore.getPackageMembers();
              return pageItems.map((item) => {
                const badge = getBadgeDetails(item.preferredDate);
                let visitState: any = null;
                try {
                  const appObj = item.raw ? { ...item.raw, ...item } : item;
                  visitState = getPatientVisitState(appObj, pool, pkgs);
                } catch (e) { }

                return (
                  <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s ease' }}>
                    {/* Patient Info */}
                    <td style={{ padding: '13px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, color: '#0f172a' }}>{item.patientName}</span>
                        {visitState && (
                          <span style={{
                            padding: '1px 6px',
                            borderRadius: '4px',
                            fontSize: '10px',
                            fontWeight: 800,
                            letterSpacing: '0.03em',
                            background: visitState.badgeBg,
                            color: visitState.badgeColor,
                            border: `1px solid ${visitState.badgeBorder}`
                          }}>
                            {visitState.badgeText}
                          </span>
                        )}
                        {visitState?.isApp && (
                          <span style={{
                            padding: '1px 6px',
                            borderRadius: '4px',
                            fontSize: '10px',
                            fontWeight: 800,
                            letterSpacing: '0.03em',
                            background: '#f3e8ff',
                            color: '#7e22ce',
                            border: '1px solid #d8b4fe'
                          }}>
                            APP
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                        {item.phone} • <span style={{ color: '#0284c7', fontWeight: 700 }}>{item.regId}</span>
                      </div>
                    </td>

                    {/* Doctor & Branch */}
                    <td style={{ padding: '13px 16px' }}>
                      <div style={{ fontWeight: 600, color: '#334155' }}>{item.doctorName}</div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{item.branchName}</div>
                    </td>

                    {/* Formatted Date */}
                    <td style={{ padding: '13px 16px' }}>
                      <div style={{ fontWeight: 700, color: badge.text }}>
                        {formatDisplayDate(item.preferredDate)}
                      </div>
                      <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>Interval: {item.followUpInterval}</div>
                    </td>

                    {/* Notes */}
                    <td style={{ padding: '13px 16px', color: '#475569', maxWidth: '200px' }}>{item.diseases}</td>

                    {/* Status Badge */}
                    <td style={{ padding: '13px 16px' }}>
                      <span style={{
                        padding: '3px 8px',
                        borderRadius: '10px',
                        fontSize: '11px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        background: badge.bg,
                        color: badge.text
                      }}>
                        {badge.label}
                      </span>
                    </td>

                    {/* Action Buttons: Complete, Book Appt, Call, WhatsApp */}
                    <td style={{ padding: '13px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                        {/* Book Appointment Button */}
                        <button
                          type="button"
                          onClick={() => handleOpenBook(item)}
                          style={{
                            background: '#0284c7',
                            border: 'none',
                            color: '#ffffff',
                            padding: '5px 10px',
                            borderRadius: '6px',
                            fontWeight: 700,
                            fontSize: '11.5px',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            boxShadow: '0 2px 6px rgba(2, 132, 199, 0.25)'
                          }}
                          title="Book an appointment for this follow-up"
                        >
                          <Calendar size={12} /> Book Appt
                        </button>

                        {/* Reschedule Follow-Up Button */}
                        <button
                          type="button"
                          onClick={() => handleOpenReschedule(item)}
                          style={{
                            background: '#fffbeb',
                            border: '1.5px solid #fde68a',
                            color: '#b45309',
                            padding: '5px 10px',
                            borderRadius: '6px',
                            fontWeight: 700,
                            fontSize: '11.5px',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            boxShadow: '0 1px 3px rgba(217, 119, 6, 0.08)'
                          }}
                          title="Reschedule this follow-up to a different date"
                        >
                          <Clock size={12} color="#b45309" /> Reschedule
                        </button>

                        {/* Quick Call */}
                        <a
                          href={`tel:${item.phone.replace(/\s+/g, '')}`}
                          title="Call Patient"
                          style={{
                            background: '#eff6ff',
                            border: '1px solid #bfdbfe',
                            color: '#0284c7',
                            padding: '5px 7px',
                            borderRadius: '6px',
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          <Phone size={12} />
                        </a>

                        {/* Quick WhatsApp */}
                        <a
                          href={`https://wa.me/91${item.phone.replace(/\D/g, '').slice(-10)}?text=${encodeURIComponent(`Hello ${item.patientName}, this is regarding your upcoming follow-up with ${item.doctorName} at Spiritual Homeopathy.`)}`}
                          target="_blank"
                          rel="noreferrer"
                          title="Chat on WhatsApp"
                          style={{
                            background: '#f0fdf4',
                            border: '1px solid #bbf7d0',
                            color: '#16a34a',
                            padding: '5px 7px',
                            borderRadius: '6px',
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          <MessageSquare size={12} />
                        </a>
                      </div>
                    </td>
                  </tr>
                );
              });
            })()}
          </tbody>
        </table>

        {/* Progressive Loading & Count Control Footer */}
        {filteredItems.length > 0 && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 20px',
            background: '#f8fafc',
            borderTop: '1px solid #e2e8f0',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            {/* Left side: Range info and page size selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
              <div style={{ fontSize: '13px', color: '#64748b', fontWeight: 600 }}>
                Showing <strong style={{ color: '#0f172a' }}>{filteredItems.length === 0 ? 0 : startIndex + 1}–{endIndex}</strong> of <strong style={{ color: '#0f172a' }}>{filteredItems.length}</strong> follow-ups
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: '#64748b' }}>
                <span>Per page:</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  style={{
                    padding: '4px 8px',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#0f172a',
                    cursor: 'pointer',
                    outline: 'none'
                  }}
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>

            {/* Right side: Page navigation buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {/* First Page */}
              <button
                type="button"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                title="First Page"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '6px 8px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: currentPage === 1 ? '#94a3b8' : '#0f172a',
                  cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                  opacity: currentPage === 1 ? 0.5 : 1,
                  transition: 'all 0.15s ease'
                }}
              >
                <ChevronsLeft size={16} />
              </button>

              {/* Previous Page */}
              <button
                type="button"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                title="Previous Page"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '6px 12px',
                  fontSize: '12px',
                  fontWeight: 700,
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: currentPage === 1 ? '#94a3b8' : '#0f172a',
                  cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                  opacity: currentPage === 1 ? 0.5 : 1,
                  transition: 'all 0.15s ease'
                }}
              >
                <ChevronLeft size={15} />
                <span>Prev</span>
              </button>

              {/* Page Number Chips */}
              {(() => {
                const pages: (number | string)[] = [];
                const maxButtons = 5;
                if (totalPages <= maxButtons) {
                  for (let i = 1; i <= totalPages; i++) pages.push(i);
                } else {
                  let start = Math.max(1, currentPage - 1);
                  let end = Math.min(totalPages, start + 2);
                  if (end === totalPages) {
                    start = Math.max(1, end - 2);
                  }
                  if (start > 1) {
                    pages.push(1);
                    if (start > 2) pages.push('...');
                  }
                  for (let i = start; i <= end; i++) {
                    pages.push(i);
                  }
                  if (end < totalPages) {
                    if (end < totalPages - 1) pages.push('...');
                    pages.push(totalPages);
                  }
                }

                return pages.map((p, idx) => {
                  if (p === '...') {
                    return (
                      <span key={`ellipsis-${idx}`} style={{ padding: '0 4px', color: '#94a3b8', fontSize: '12px' }}>
                        ...
                      </span>
                    );
                  }
                  const isCurrent = p === currentPage;
                  return (
                    <button
                      key={`page-${p}`}
                      type="button"
                      onClick={() => setCurrentPage(Number(p))}
                      style={{
                        minWidth: '32px',
                        height: '32px',
                        padding: '0 8px',
                        fontSize: '12.5px',
                        fontWeight: isCurrent ? 800 : 600,
                        borderRadius: '8px',
                        border: isCurrent ? '1.5px solid #0284c7' : '1px solid #cbd5e1',
                        background: isCurrent ? '#0284c7' : '#ffffff',
                        color: isCurrent ? '#ffffff' : '#0f172a',
                        cursor: 'pointer',
                        boxShadow: isCurrent ? '0 1px 3px rgba(2,132,199,0.3)' : 'none',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      {p}
                    </button>
                  );
                });
              })()}

              {/* Next Page */}
              <button
                type="button"
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                title="Next Page"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '6px 12px',
                  fontSize: '12px',
                  fontWeight: 700,
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: currentPage === totalPages ? '#94a3b8' : '#0f172a',
                  cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                  opacity: currentPage === totalPages ? 0.5 : 1,
                  transition: 'all 0.15s ease'
                }}
              >
                <span>Next</span>
                <ChevronRight size={15} />
              </button>

              {/* Last Page */}
              <button
                type="button"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                title="Last Page"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '6px 8px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: currentPage === totalPages ? '#94a3b8' : '#0f172a',
                  cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                  opacity: currentPage === totalPages ? 0.5 : 1,
                  transition: 'all 0.15s ease'
                }}
              >
                <ChevronsRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ================= BOOK APPOINTMENT MODAL ================= */}
      {
        bookModalItem && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.5)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px'
          }}>
            <div style={{
              background: '#ffffff',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '520px',
              padding: '24px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              border: '1px solid #e2e8f0'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Calendar size={20} color="#0284c7" />
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                    Book Appointment for Follow-Up
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setBookModalItem(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
                >
                  <X size={18} />
                </button>
              </div>

              <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '10px', marginBottom: '16px', border: '1px solid #f1f5f9' }}>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>
                  {bookModalItem.patientName}
                </div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                  Reg ID: {bookModalItem.regId} • Phone: {bookModalItem.phone} • {bookModalItem.branchName}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
                {/* 1. Date Field (DD-MM-YYYY) with Calendar Picker Popup */}
                <div style={{ position: 'relative' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>
                      Appointment Date (DD-MM-YYYY) *
                    </label>
                    <span style={{ fontSize: '11px', fontWeight: 800, color: '#0284c7', background: '#e0f2fe', padding: '2px 8px', borderRadius: '6px' }}>
                      📅 {getDayNameFromDate(bookingDate)}
                    </span>
                  </div>
                  <div
                    onClick={() => setCalendarModalOpen(!calendarModalOpen)}
                    style={{
                      background: '#ffffff',
                      border: calendarModalOpen ? '2px solid #0284c7' : '1px solid #cbd5e1',
                      borderRadius: '8px',
                      padding: '9px 12px',
                      height: '42px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      boxSizing: 'border-box',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Calendar size={17} color="#0284c7" />
                      <span style={{ fontSize: '13.5px', color: '#0f172a', fontWeight: 800 }}>
                        {bookingDate}
                      </span>
                    </div>
                    <span style={{ fontSize: '11.5px', color: '#0284c7', fontWeight: 700 }}>
                      {calendarModalOpen ? '▲ Close Calendar' : '▼ Pick Date'}
                    </span>
                  </div>

                  {/* Calendar Dropdown Popover */}
                  {calendarModalOpen && (
                    <>
                      <div
                        onClick={() => setCalendarModalOpen(false)}
                        style={{
                          position: 'fixed',
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          zIndex: 999
                        }}
                      />
                      <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          position: 'absolute',
                          top: '70px',
                          left: 0,
                          zIndex: 1000,
                          background: '#ffffff',
                          borderRadius: '16px',
                          padding: '16px',
                          boxShadow: '0 20px 35px -5px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0,0,0,0.08)',
                          width: '320px',
                          boxSizing: 'border-box'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                          <button
                            type="button"
                            onClick={handlePrevMonth}
                            style={{ background: '#f1f5f9', border: 'none', borderRadius: '8px', padding: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          >
                            <ChevronLeft size={16} color="#0284c7" />
                          </button>

                          <span style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>
                            {monthNames[calMonth]} {calYear}
                          </span>

                          <button
                            type="button"
                            onClick={handleNextMonth}
                            style={{ background: '#f1f5f9', border: 'none', borderRadius: '8px', padding: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          >
                            <ChevronRight size={16} color="#0284c7" />
                          </button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', textAlign: 'center', marginBottom: '6px' }}>
                          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                            <span key={d} style={{ fontSize: '10.5px', fontWeight: 700, color: '#64748b' }}>{d}</span>
                          ))}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
                          {Array.from({ length: startDayIndex }).map((_, i) => (
                            <div key={`empty-${i}`} />
                          ))}

                          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(dayNum => {
                            const formattedMonth = (calMonth + 1) < 10 ? `0${calMonth + 1}` : `${calMonth + 1}`;
                            const formattedDay = dayNum < 10 ? `0${dayNum}` : `${dayNum}`;
                            const dayStr = `${formattedDay}-${formattedMonth}-${calYear}`;
                            const isSelected = bookingDate === dayStr;

                            return (
                              <button
                                key={dayNum}
                                type="button"
                                onClick={() => {
                                  handleBookingDateChange(dayStr);
                                  setCalendarModalOpen(false);
                                }}
                                style={{
                                  width: '32px',
                                  height: '32px',
                                  borderRadius: '50%',
                                  background: isSelected ? '#0284c7' : '#f8fafc',
                                  color: isSelected ? '#ffffff' : '#0f172a',
                                  border: 'none',
                                  fontSize: '12px',
                                  fontWeight: isSelected ? 800 : 600,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  margin: '0 auto',
                                  transition: 'all 0.15s ease'
                                }}
                              >
                                {dayNum}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* 2. Consulting Doctor Second (Strictly available doctors in that branch) */}
                <div>
                  {(() => {
                    const targetBranch = bookModalItem?.branchName || currentBranch || 'KPHB Branch';
                    const availDocs = getAvailableDoctors(bookingDate, targetBranch);
                    const dayName = getDayNameFromDate(bookingDate);

                    return (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <label style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>
                            Consulting Doctor:
                          </label>
                          <span style={{ fontSize: '11px', fontWeight: 700, color: availDocs.length > 0 ? '#16a34a' : '#dc2626' }}>
                            {availDocs.length > 0
                              ? `${availDocs.length} Available at ${targetBranch} on ${dayName}`
                              : `0 Available at ${targetBranch} on ${dayName}`}
                          </span>
                        </div>

                        {availDocs.length === 0 && (
                          <div style={{
                            padding: '8px 12px',
                            background: '#fef2f2',
                            border: '1px solid #fecaca',
                            borderRadius: '8px',
                            color: '#dc2626',
                            fontSize: '11.5px',
                            fontWeight: 700,
                            marginBottom: '8px'
                          }}>
                            ⚠️ No doctors scheduled at {targetBranch} on {dayName}. Pick another date or choose an override doctor below.
                          </div>
                        )}

                        <select
                          value={bookingDoctor}
                          onChange={(e) => setBookingDoctor(e.target.value)}
                          style={{
                            width: '100%',
                            padding: '10px 12px',
                            borderRadius: '8px',
                            border: availDocs.length > 0 ? '1px solid #cbd5e1' : '1px solid #fca5a5',
                            fontSize: '13px',
                            fontWeight: 700,
                            outline: 'none',
                            backgroundColor: '#ffffff',
                            boxSizing: 'border-box'
                          }}
                        >
                          {availDocs.length > 0 ? (
                            availDocs.map((doc) => (
                              <option key={doc} value={doc}>
                                {doc} (Available at {targetBranch})
                              </option>
                            ))
                          ) : (
                            <>
                              <option value="">-- Select Override Doctor --</option>
                              {SPH_DOCTORS.map((doc) => (
                                <option key={doc} value={doc}>
                                  {doc}
                                </option>
                              ))}
                            </>
                          )}
                        </select>
                      </>
                    );
                  })()}
                </div>

                {/* 3. Available Slots with Remaining Capacity */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: '#334155', margin: 0 }}>
                      <Clock size={15} color="#0284c7" /> Available Slots ({doctorAvailableSlots.length}):
                    </label>
                    {bookingTime && (
                      <span style={{ fontSize: '11px', fontWeight: 800, color: '#0284c7', background: '#e0f2fe', padding: '2px 8px', borderRadius: '6px' }}>
                        Selected: {bookingTime}
                      </span>
                    )}
                  </div>

                  {doctorAvailableSlots.length === 0 ? (
                    <div style={{
                      padding: '12px',
                      background: '#fef2f2',
                      border: '1px solid #fecaca',
                      borderRadius: '8px',
                      color: '#dc2626',
                      fontSize: '11.5px',
                      fontWeight: 700
                    }}>
                      ⚠️ No available time slots configured for {bookingDoctor} on {getDayNameFromDate(bookingDate)} at {bookModalItem?.branchName || currentBranch}.
                    </div>
                  ) : (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(4, 1fr)',
                      gap: '8px',
                      maxHeight: '230px',
                      overflowY: 'auto',
                      paddingRight: '4px'
                    }}>
                      {doctorAvailableSlots.map((slot) => {
                        const isSelected = bookingTime === slot;
                        const { remainingSlots, isFull } = getSlotCapacityInfo(slot);
                        const isPast = isSlotPastTime(slot, bookingDate);
                        const isBlocked = isFull || isPast;

                        return (
                          <button
                            key={slot}
                            type="button"
                            disabled={isBlocked}
                            onClick={() => {
                              if (!isBlocked) setBookingTime(slot);
                            }}
                            style={{
                              background: isSelected
                                ? '#0284c7'
                                : isBlocked
                                  ? '#f1f5f9'
                                  : '#ffffff',
                              color: isSelected
                                ? '#ffffff'
                                : isBlocked
                                  ? '#94a3b8'
                                  : '#1e293b',
                              border: isSelected
                                ? '2px solid #0284c7'
                                : isBlocked
                                  ? '1px solid #e2e8f0'
                                  : '1px solid #cbd5e1',
                              padding: '8px 4px',
                              borderRadius: '8px',
                              fontSize: '11px',
                              fontWeight: 800,
                              cursor: isBlocked ? 'not-allowed' : 'pointer',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '3px',
                              opacity: isPast ? 0.5 : 1,
                              boxSizing: 'border-box'
                            }}
                          >
                            <span style={{ textDecoration: isPast || isFull ? 'line-through' : 'none' }}>
                              {slot}
                            </span>
                            <span style={{
                              fontSize: '9px',
                              fontWeight: 800,
                              padding: '1px 5px',
                              borderRadius: '4px',
                              background: isSelected
                                ? 'rgba(255, 255, 255, 0.25)'
                                : isPast
                                  ? '#fee2e2'
                                  : isFull
                                    ? '#fee2e2'
                                    : remainingSlots === 1
                                      ? '#fef3c7'
                                      : '#e0f2fe',
                              color: isSelected
                                ? '#ffffff'
                                : isPast
                                  ? '#dc2626'
                                  : isFull
                                    ? '#ef4444'
                                    : remainingSlots === 1
                                      ? '#b45309'
                                      : '#0369a1'
                            }}>
                              {isPast ? 'BLOCKED' : isFull ? 'FULL' : `${remainingSlots} left`}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setBookModalItem(null)}
                  style={{
                    padding: '9px 16px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#475569',
                    fontWeight: 700,
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isBooking}
                  onClick={handleConfirmBook}
                  style={{
                    padding: '9px 18px',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#0284c7',
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  {isBooking ? 'Booking...' : 'Confirm Booking'}
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* ================= RESCHEDULE FOLLOW-UP MODAL ================= */}
      {rescheduleModalItem && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.55)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '16px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '460px',
            padding: '24px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            boxSizing: 'border-box'
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '10px',
                  background: '#fef3c7',
                  color: '#d97706',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Clock size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                    Reschedule Follow-Up
                  </h3>
                  <p style={{ margin: '1px 0 0 0', fontSize: '11px', color: '#64748b' }}>
                    Move this patient's follow-up to a new scheduled date
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRescheduleModalItem(null)}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#94a3b8', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Patient Info Card */}
            <div style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '10px',
              padding: '12px 14px',
              marginBottom: '18px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <span style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>
                  {rescheduleModalItem.patientName}
                </span>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#0284c7', background: '#e0f2fe', padding: '2px 8px', borderRadius: '6px' }}>
                  {rescheduleModalItem.regId}
                </span>
              </div>
              <div style={{ fontSize: '11.5px', color: '#64748b', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <span>📞 {rescheduleModalItem.phone}</span>
                <span>👨‍⚕️ {rescheduleModalItem.doctorName}</span>
                <span>📍 {rescheduleModalItem.branchName}</span>
              </div>
              {rescheduleModalItem.diseases && (
                <div style={{ fontSize: '11.5px', color: '#475569', marginTop: '4px', fontStyle: 'italic' }}>
                  🩺 {rescheduleModalItem.diseases}
                </div>
              )}
            </div>

            {/* Current Date Display */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#fffbeb',
              border: '1px solid #fde68a',
              borderRadius: '8px',
              padding: '8px 12px',
              marginBottom: '16px'
            }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#92400e' }}>
                Current Scheduled Date:
              </span>
              <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#b45309' }}>
                📅 {toDDMMYYYY(rescheduleModalItem.preferredDate)}
              </span>
            </div>

            {/* New Date Picker */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>
                Select New Follow-Up Date *
              </label>
              <input
                type="date"
                value={rescheduleDate}
                min={todayISO}
                onChange={(e) => setRescheduleDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1.5px solid #cbd5e1',
                  fontSize: '13px',
                  fontWeight: 700,
                  color: '#0f172a',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />

              {/* Quick Shift Shortcut Chips */}
              <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
                {[
                  { label: '+3 Days', days: 3 },
                  { label: '+1 Week', days: 7 },
                  { label: '+15 Days', days: 15 },
                  { label: '+1 Month', days: 30 }
                ].map(chip => (
                  <button
                    key={chip.label}
                    type="button"
                    onClick={() => handleShiftRescheduleDays(chip.days)}
                    style={{
                      background: '#f1f5f9',
                      border: '1px solid #cbd5e1',
                      borderRadius: '6px',
                      padding: '3px 8px',
                      fontSize: '11px',
                      fontWeight: 700,
                      color: '#475569',
                      cursor: 'pointer'
                    }}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Reason / Notes */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>
                Reason / Note
              </label>
              <input
                type="text"
                placeholder="e.g. Patient requested to visit on 15th"
                value={rescheduleReason}
                onChange={(e) => setRescheduleReason(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1.5px solid #cbd5e1',
                  fontSize: '12px',
                  color: '#0f172a',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
              <div style={{ display: 'flex', gap: '5px', marginTop: '6px', flexWrap: 'wrap' }}>
                {['Patient Requested', 'Out of Station', 'Doctor Unavailable', 'Follow-up Delayed'].map(r => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRescheduleReason(r)}
                    style={{
                      background: rescheduleReason === r ? '#e0f2fe' : '#f8fafc',
                      border: rescheduleReason === r ? '1px solid #0284c7' : '1px solid #e2e8f0',
                      color: rescheduleReason === r ? '#0284c7' : '#64748b',
                      borderRadius: '4px',
                      padding: '2px 7px',
                      fontSize: '10.5px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {/* Bottom Actions */}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setRescheduleModalItem(null)}
                style={{
                  padding: '9px 16px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#475569',
                  fontWeight: 700,
                  fontSize: '12px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isRescheduling || !rescheduleDate}
                onClick={handleConfirmReschedule}
                style={{
                  padding: '9px 18px',
                  borderRadius: '8px',
                  border: 'none',
                  background: isRescheduling || !rescheduleDate ? '#cbd5e1' : '#d97706',
                  color: '#ffffff',
                  fontWeight: 800,
                  fontSize: '12px',
                  cursor: isRescheduling || !rescheduleDate ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 2px 6px rgba(217, 119, 6, 0.25)'
                }}
              >
                {isRescheduling ? 'Rescheduling...' : `Confirm Reschedule to ${rescheduleDate ? toDDMMYYYY(rescheduleDate) : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const WebFollowUpsPage = FollowUpsPage;
