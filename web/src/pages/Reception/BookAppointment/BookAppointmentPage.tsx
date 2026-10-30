import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Calendar as CalendarIcon, Clock, User, Phone, Mail, Stethoscope, Video,
  CheckCircle2, ChevronDown, Check, Home, Megaphone, ArrowRight, ShieldCheck, Info,
  ChevronLeft, ChevronRight, X, Building2, Lock, Search, Printer, UserX
} from 'lucide-react';
import { createDocument, db, sendBookingWhatsAppNotification, sanitizeDoctorName, resolveCanonicalBranchId, getBranchQueryNames } from '@app/shared';
import { collection, onSnapshot, addDoc, setDoc, deleteDoc, doc, query, where, limit, getDocs } from 'firebase/firestore';
import { generateRegistrationId, getBranchShortcut } from '../../../utils/idGenerator';
import { createBookingNotificationInFirestore } from '../../../utils/fcmWebTrigger';
import { getPatientVisitState } from '../../../utils/patientVisitState';
import { receptionDataStore } from '../../../utils/receptionDataStore';
import {
  DoctorNoShowOverride,
  getActiveDoctorNoShow,
  filterSlotsByNoShow,
  normalizeToISODate,
  getCanonicalDoctorName
} from '../DoctorNoShow/doctorRosterHelper';

let GLOBAL_WEB_PATIENTS_CACHE: any[] = [];
let GLOBAL_WEB_ALLPATIENTS_CACHE: any[] = [];
let GLOBAL_WEB_APPTS_CACHE: any[] = [];

const CLINIC_BRANCHES = [
  'KPHB Branch',
  'Nallagandla Branch',
  'Dilshuknagar Branch',
  'Chandanagar Branch',
];

const normalizeBranchKey = (raw: string = ''): string => {
  const resolved = resolveCanonicalBranchId(raw);
  if (resolved) return resolved;
  const clean = String(raw || '').toLowerCase().replace(/branch$/i, '').trim();
  if (clean.includes('kphb') || clean.includes('kukatpally') || clean.includes('kpb')) return 'kphb';
  if (clean.includes('nalla') || clean.includes('nallagandla') || clean.includes('ngl')) return 'nallagandla';
  if (clean.includes('chanda') || clean.includes('chnr') || clean.includes('chandanagar') || clean.includes('chn')) return 'chandanagar';
  if (clean.includes('dilshuk') || clean.includes('dilsukh') || clean.includes('dsnr') || clean.includes('dshnr') || clean.includes('dil')) return 'dilshuknagar';
  return clean;
};

const WebAnalogClockModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  selectedTimeSlot: string;
  onSelectTime: (timeStr: string) => void;
}> = ({ isOpen, onClose, selectedTimeSlot, onSelectTime }) => {
  const [mode, setMode] = useState<'hours' | 'minutes'>('hours');
  const [selectedHour, setSelectedHour] = useState(10);
  const [selectedMinute, setSelectedMinute] = useState(0);
  const [ampm, setAmPm] = useState<'AM' | 'PM'>('AM');
  const clockRef = useRef<HTMLDivElement>(null);

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
  }, [selectedTimeSlot, isOpen]);

  if (!isOpen) return null;

  const handleClockClickOrTouch = (e: React.MouseEvent | React.TouchEvent) => {
    if (!clockRef.current) return;
    const rect = clockRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    let clientX = 0;
    let clientY = 0;
    if ('touches' in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if ('clientX' in e) {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    const dx = clientX - cx;
    const dy = clientY - cy;
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
      setSelectedMinute(m);
    }
  };

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

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(15, 23, 42, 0.65)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '20px'
    }}>
      <div style={{
        background: '#ffffff',
        borderRadius: '24px',
        width: '100%',
        maxWidth: '340px',
        overflow: 'hidden',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)'
      }}>
        {/* Header */}
        <div style={{
          background: '#0284c7',
          padding: '18px 20px',
          textAlign: 'center',
          color: '#ffffff'
        }}>
          <div style={{ fontSize: '11px', fontWeight: 800, color: '#bae6fd', textTransform: 'uppercase', letterSpacing: '1px' }}>
            Select Online Time
          </div>

          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '6px', margin: '6px 0' }}>
            <span
              onClick={() => setMode('hours')}
              style={{
                fontSize: '36px',
                fontWeight: 900,
                color: mode === 'hours' ? '#ffffff' : '#93c5fd',
                borderBottom: mode === 'hours' ? '2px solid #ffffff' : 'none',
                cursor: 'pointer'
              }}
            >
              {String(selectedHour).padStart(2, '0')}
            </span>

            <span style={{ fontSize: '36px', fontWeight: 900, color: '#ffffff' }}>:</span>

            <span
              onClick={() => setMode('minutes')}
              style={{
                fontSize: '36px',
                fontWeight: 900,
                color: mode === 'minutes' ? '#ffffff' : '#93c5fd',
                borderBottom: mode === 'minutes' ? '2px solid #ffffff' : 'none',
                cursor: 'pointer'
              }}
            >
              {String(selectedMinute).padStart(2, '0')}
            </span>

            <div style={{ marginLeft: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <button
                type="button"
                onClick={() => setAmPm('AM')}
                style={{
                  background: ampm === 'AM' ? '#ffffff' : 'rgba(255,255,255,0.2)',
                  color: ampm === 'AM' ? '#0284c7' : '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '3px 8px',
                  fontSize: '11px',
                  fontWeight: 900,
                  cursor: 'pointer'
                }}
              >
                AM
              </button>
              <button
                type="button"
                onClick={() => setAmPm('PM')}
                style={{
                  background: ampm === 'PM' ? '#ffffff' : 'rgba(255,255,255,0.2)',
                  color: ampm === 'PM' ? '#0284c7' : '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '3px 8px',
                  fontSize: '11px',
                  fontWeight: 900,
                  cursor: 'pointer'
                }}
              >
                PM
              </button>
            </div>
          </div>

          <div style={{ display: 'inline-flex', background: 'rgba(255,255,255,0.2)', borderRadius: '12px', padding: '3px', gap: '4px' }}>
            <button
              type="button"
              onClick={() => setMode('hours')}
              style={{
                background: mode === 'hours' ? '#ffffff' : 'transparent',
                color: mode === 'hours' ? '#0284c7' : '#ffffff',
                border: 'none',
                borderRadius: '9px',
                padding: '4px 14px',
                fontSize: '11px',
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              HOURS
            </button>
            <button
              type="button"
              onClick={() => setMode('minutes')}
              style={{
                background: mode === 'minutes' ? '#ffffff' : 'transparent',
                color: mode === 'minutes' ? '#0284c7' : '#ffffff',
                border: 'none',
                borderRadius: '9px',
                padding: '4px 14px',
                fontSize: '11px',
                fontWeight: 800,
                cursor: 'pointer'
              }}
            >
              MINUTES
            </button>
          </div>
        </div>

        {/* Clock Face Body */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div
            ref={clockRef}
            onClick={handleClockClickOrTouch}
            style={{
              width: '200px',
              height: '200px',
              borderRadius: '50%',
              background: '#f8fafc',
              border: '2px solid #e2e8f0',
              position: 'relative',
              cursor: 'pointer'
            }}
          >
            {/* Center Pivot */}
            <div style={{
              position: 'absolute',
              top: '96px',
              left: '96px',
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: '#0284c7',
              zIndex: 10
            }} />

            {/* Pointer Hand */}
            <div style={{
              position: 'absolute',
              top: '100px',
              left: '100px',
              width: `${Math.sqrt(Math.pow(activeHandCoords.endX - 100, 2) + Math.pow(activeHandCoords.endY - 100, 2))}px`,
              height: '2px',
              background: '#0284c7',
              transformOrigin: '0% 50%',
              transform: `rotate(${Math.atan2(activeHandCoords.endY - 100, activeHandCoords.endX - 100)}rad)`,
              zIndex: 2,
              pointerEvents: 'none'
            }} />

            {/* Radially Placed Numbers */}
            {mode === 'hours' ? (
              hours.map((h) => {
                const coords = getHourCoords(h);
                const isSelected = selectedHour === h;
                return (
                  <button
                    key={h}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedHour(h);
                      setMode('minutes');
                    }}
                    style={{
                      position: 'absolute',
                      left: `${coords.x}px`,
                      top: `${coords.y}px`,
                      width: '36px',
                      height: '36px',
                      borderRadius: '50%',
                      background: isSelected ? '#0284c7' : 'transparent',
                      color: isSelected ? '#ffffff' : '#334155',
                      border: 'none',
                      fontSize: '13px',
                      fontWeight: isSelected ? 900 : 700,
                      cursor: 'pointer',
                      zIndex: 5
                    }}
                  >
                    {h}
                  </button>
                );
              })
            ) : (
              minutes.map((m) => {
                const coords = getMinuteCoords(m);
                const isSelected = selectedMinute === m;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setSelectedMinute(m)}
                    style={{
                      position: 'absolute',
                      left: `${coords.x}px`,
                      top: `${coords.y}px`,
                      width: '36px',
                      height: '36px',
                      borderRadius: '50%',
                      background: isSelected ? '#0284c7' : 'transparent',
                      color: isSelected ? '#ffffff' : '#334155',
                      border: 'none',
                      fontSize: '11.5px',
                      fontWeight: isSelected ? 900 : 700,
                      cursor: 'pointer',
                      zIndex: 5
                    }}
                  >
                    {String(m).padStart(2, '0')}
                  </button>
                );
              })
            )}
          </div>

          <div style={{ display: 'flex', gap: '12px', marginTop: '20px', width: '100%' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: '12px',
                background: '#f1f5f9',
                border: 'none',
                color: '#64748b',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: '12px',
                background: '#0284c7',
                border: 'none',
                color: '#ffffff',
                fontWeight: 800,
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              OK / Set Time
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
const WEB_PATIENTS_CACHE_KEY = '@sph_web_patients_cache_v2';
const WEB_APPTS_CACHE_KEY = '@sph_web_appts_cache_v2';

try {
  const p = localStorage.getItem(WEB_PATIENTS_CACHE_KEY);
  if (p) GLOBAL_WEB_PATIENTS_CACHE = JSON.parse(p);
  const a = localStorage.getItem(WEB_APPTS_CACHE_KEY);
  if (a) GLOBAL_WEB_APPTS_CACHE = JSON.parse(a);
} catch (e) { }
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu';

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
    phone: '1111111111',
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

interface BookAppointmentPageProps {
  currentBranch?: string;
  userRole?: string;
  onNavigate?: (tab: string) => void;
}

export const BookAppointmentPage: React.FC<BookAppointmentPageProps> = ({
  currentBranch = "KPHB Branch",
  userRole,
  onNavigate
}) => {
  const isHR = userRole === 'hr' || userRole === 'admin' || currentBranch === 'All Branches' || currentBranch === 'HR' || currentBranch === 'Admin';

  const [selectedBranch, setSelectedBranch] = useState<string>(() => {
    if (isHR) return '';
    return currentBranch;
  });

  useEffect(() => {
    if (!isHR && currentBranch) {
      setSelectedBranch(currentBranch);
    }
  }, [currentBranch, isHR]);

  // Section 1: Patient Details
  const [patientSearchTerm, setPatientSearchTerm] = useState('');
  const [searchBranchFilter, setSearchBranchFilter] = useState<string>(() => currentBranch || 'Chandanagar Branch');
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const patientNameRowRef = useRef<HTMLDivElement>(null);
  const [searchSource, setSearchSource] = useState<'searchBar' | 'patientName' | null>(null);

  useEffect(() => {
    if (currentBranch && currentBranch !== 'All Branches') {
      setSearchBranchFilter(currentBranch);
    }
  }, [currentBranch]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const inSearch = searchContainerRef.current && searchContainerRef.current.contains(target);
      const inPatientName = patientNameRowRef.current && patientNameRowRef.current.contains(target);
      if (!inSearch && !inPatientName) {
        setShowSuggestions(false);
        setSearchSource(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const WEB_BOOK_APPT_DRAFT_KEY = '@sph_web_book_appointment_draft';
  const [draftRestored, setDraftRestored] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const [patientName, setPatientName] = useState('');
  const [diseases, setDiseases] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [emailAddress, setEmailAddress] = useState('');
  const [marketingSource, setMarketingSource] = useState('Select Source');
  const [consultationMode, setConsultationMode] = useState('In-Clinic');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSearchQuery, setActiveSearchQuery] = useState('');

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
            const shortcut = getBranchShortcut(originalBranch || currentBranch);
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
      (allPatientsList || []).forEach(p => processDoc(p, p?.id));
      (patientsList || []).forEach(p => processDoc(p, p?.id));
      (existingAppointments || []).forEach(a => processDoc(a, a?.id));
      (GLOBAL_WEB_ALLPATIENTS_CACHE || []).forEach(p => processDoc(p, p?.id));
      (GLOBAL_WEB_PATIENTS_CACHE || []).forEach(p => processDoc(p, p?.id));
      (GLOBAL_WEB_APPTS_CACHE || []).forEach(a => processDoc(a, a?.id));
      (allUnifiedPatients || []).forEach(p => processDoc(p, p?.id));
    } catch (e) {
      console.warn("In-memory phone search notice:", e);
    }

    // 2. Query Firestore collections with multi-variant phone search & safe timeout
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
        safeQuery(query(collection(db, 'allpatients'), where('phone', 'in', phoneVariants), limit(25))),
        safeQuery(query(collection(db, 'allpatients'), where('phoneNumber', 'in', phoneVariants), limit(25))),
        safeQuery(query(collection(db, 'allpatients'), where('patientPhone', 'in', phoneVariants), limit(25))),
        safeQuery(query(collection(db, 'allpatients'), where('mobile', 'in', phoneVariants), limit(25))),

        // patients
        safeQuery(query(collection(db, 'patients'), where('phone', 'in', phoneVariants), limit(25))),
        safeQuery(query(collection(db, 'patients'), where('phoneNumber', 'in', phoneVariants), limit(25))),
        safeQuery(query(collection(db, 'patients'), where('patientPhone', 'in', phoneVariants), limit(25))),
        safeQuery(query(collection(db, 'patients'), where('mobile', 'in', phoneVariants), limit(25))),

        // appointments
        safeQuery(query(collection(db, 'appointments'), where('phone', 'in', phoneVariants), limit(25))),
        safeQuery(query(collection(db, 'appointments'), where('phoneNumber', 'in', phoneVariants), limit(25))),
        safeQuery(query(collection(db, 'appointments'), where('patientPhone', 'in', phoneVariants), limit(25))),

        // patient_profiles
        safeQuery(query(collection(db, 'patient_profiles'), where('phone', 'in', phoneVariants), limit(25)))
      ];

      if (!isNaN(cleanNum)) {
        queryPromises.push(
          safeQuery(query(collection(db, 'allpatients'), where('phone', '==', cleanNum), limit(10))),
          safeQuery(query(collection(db, 'patients'), where('phone', '==', cleanNum), limit(10))),
          safeQuery(query(collection(db, 'appointments'), where('phone', '==', cleanNum), limit(10)))
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

    const resultList = Array.from(profilesMap.values());
    setPhoneCheckResult(resultList);
    return resultList;
  };
  // END PROFILE FETCH BY PHONE

  // START PHONE HANDLERS AND PROFILE SELECTION
  const handleManualPhoneCheck = async (phoneVal: string, isAuto: boolean = false) => {
    const clean = phoneVal.replace(/\D/g, '').slice(-10);
    if (clean.length < 10) {
      if (!isAuto) alert("Invalid Phone: Please enter a 10-digit mobile number.");
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
          alert(`No existing patient profiles found for +91 ${clean}.`);
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
      const match = (allUnifiedPatients || []).find(p => {
        const pClean = String(p.phone || p.phoneClean || '').replace(/\D/g, '').slice(-10);
        return pClean === clean;
      }) || storePool.find(p => {
        const pClean = String(p.phone || p.patientPhone || p.phoneNumber || p.mobile || '').replace(/\D/g, '').slice(-10);
        return pClean === clean;
      }) || (allPatientsList || []).find(p => {
        const pClean = String(p.phone || p.phoneNumber || p.patientPhone || p.mobile || '').replace(/\D/g, '').slice(-10);
        return pClean === clean;
      }) || (patientsList || []).find(p => {
        const pClean = String(p.phone || p.phoneNumber || p.patientPhone || p.mobile || '').replace(/\D/g, '').slice(-10);
        return pClean === clean;
      }) || (existingAppointments || []).find(p => {
        const pClean = String(p.phone || p.patientPhone || p.phoneNumber || p.mobile || '').replace(/\D/g, '').slice(-10);
        return pClean === clean;
      });

      if (match) {
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
    setPatientData(prev => ({
      ...prev,
      patientId: prof.id,
      fullName: prof.fullName,
      patientName: prof.fullName,
      phone: pPhone,
      regID: prof.registrationId || prof.regNo || prev.regID,
      registrationId: prof.registrationId || prof.regNo || prev.registrationId,
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

  // Section 2: Appointment Information
  const getTodayFormatted = () => {
    const today = new Date();
    const d = String(today.getDate()).padStart(2, '0');
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const y = today.getFullYear();
    return `${d}-${m}-${y}`;
  };

  const [appointmentDate, setAppointmentDate] = useState(getTodayFormatted);
  const [selectedDoctor, setSelectedDoctor] = useState('');
  const [selectedTimeSlot, setSelectedTimeSlot] = useState('');
  const [clockModalOpen, setClockModalOpen] = useState(false);

  // Restore form draft on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(WEB_BOOK_APPT_DRAFT_KEY);
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
    } catch (_) {}
  }, []);

  // Auto-save form draft on change
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
      try {
        localStorage.setItem(WEB_BOOK_APPT_DRAFT_KEY, JSON.stringify(draft));
        setHasDraft(true);
      } catch (_) {}
    }, 500);
    return () => clearTimeout(timer);
  }, [patientName, phoneNumber, emailAddress, diseases, marketingSource, consultationMode, selectedDoctor, appointmentDate, selectedTimeSlot, patientData]);

  const clearFormAndDraft = () => {
    setPatientName('');
    setDiseases('');
    setPhoneNumber('');
    setEmailAddress('');
    setMarketingSource('Select Source');
    setSelectedDoctor('');
    setSelectedTimeSlot('');
    setPatientSearchTerm('');
    setActiveSearchQuery('');
    setShowSuggestions(false);
    setSearchSource(null);
    setPatientData({ phone: '', fullName: '', patientName: '', patientId: '', regID: '', source: '' });
    setDraftRestored(false);
    setHasDraft(false);
    try {
      localStorage.removeItem(WEB_BOOK_APPT_DRAFT_KEY);
    } catch (_) {}
  };

  // Firestore Live Doctors List
  const [allDoctorsList, setAllDoctorsList] = useState<Doctor[]>(DEFAULT_DOCTORS_SEED);

  // Subscribe to real-time Firestore doctors collection
  useEffect(() => {
    try {
      const docColRef = collection(db, 'doctors');
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
            const seedFallback = DEFAULT_DOCTORS_SEED.find(s => {
              const normSeedName = s.name.toLowerCase().replace(/dr\.?\s*/i, '').trim();
              if (normDataName && (normSeedName.includes(normDataName) || normDataName.includes(normSeedName))) return true;
              if (digits && s.phone.includes(digits)) return true;
              return s.id === snap.id;
            }) || DEFAULT_DOCTORS_SEED.find(s => s.id === snap.id);
            fetched.push({
              id: snap.id,
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
      }, (err) => {
        console.warn('Firestore doctors listener error:', err);
      });
      return () => unsubscribe();
    } catch (e) {
      console.warn('Firestore doctors subscribe notice:', e);
    }
  }, []);

  // Firestore Live Doctor No Shows List
  const [noShowsList, setNoShowsList] = useState<DoctorNoShowOverride[]>([]);
  useEffect(() => {
    if (!db) return;
    try {
      const q = collection(db, 'doctor_no_shows');
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const list: DoctorNoShowOverride[] = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<DoctorNoShowOverride, 'id'>)
        }));
        setNoShowsList(list);
      }, (err) => {
        console.warn('Firestore doctor_no_shows listener error in BookAppointment:', err);
      });
      return () => unsubscribe();
    } catch (e) {
      console.warn('Firestore doctor_no_shows subscribe notice:', e);
    }
  }, []);

  // Compute if selectedDoctor has an active No Show for appointmentDate at selectedBranch
  const activeNoShowForSelectedDoc = useMemo(() => {
    if (!selectedDoctor || !selectedBranch) return undefined;
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

    if (!selectedBranch) return [];

    return allDoctorsList.filter((doc) => {
      const normCurrentBranch = (selectedBranch || '').toLowerCase().replace(/\s*branch\s*/i, '').trim();

      if (doc.branchSchedules && doc.branchSchedules.length > 0) {
        const matchBs = doc.branchSchedules.find((bs) => {
          const normBsBranch = (bs.targetBranch || '').toLowerCase().replace(/\s*branch\s*/i, '').trim();
          return normBsBranch.includes(normCurrentBranch) || normCurrentBranch.includes(normBsBranch);
        });

        if (!matchBs) return false;
        const daySched = matchBs.daySchedules?.[selectedDayName];
        if (!daySched) return false;

        return daySched.status === 'Available' && daySched.slots && daySched.slots.length > 0;
      }

      const docBranchStr = (doc.branch || doc.assignedBranch || '').toLowerCase().replace(/\s*branch\s*/i, '').trim();
      if (docBranchStr) {
        return docBranchStr.includes(normCurrentBranch) || normCurrentBranch.includes(docBranchStr);
      }

      return false;
    });
  }, [allDoctorsList, selectedBranch, selectedDayName, consultationMode]);

  // Auto-reset selectedDoctor if no longer available on changed date/branch
  useEffect(() => {
    if (selectedDoctor && availableDoctors.length > 0) {
      const exists = availableDoctors.some((d) => d.name === selectedDoctor);
      if (!exists) {
        setSelectedDoctor('');
        setSelectedTimeSlot('');
      }
    }
  }, [appointmentDate, currentBranch, availableDoctors, consultationMode]);

  // Firestore Live Patient History Collections (appointments, patients & allpatients) with 0ms Instant Device Cache
  const [existingAppointments, setExistingAppointments] = useState<any[]>(GLOBAL_WEB_APPTS_CACHE);
  const [patientsList, setPatientsList] = useState<any[]>(GLOBAL_WEB_PATIENTS_CACHE);
  const [allPatientsList, setAllPatientsList] = useState<any[]>(GLOBAL_WEB_ALLPATIENTS_CACHE);
  const [liveSearchResults, setLiveSearchResults] = useState<any[]>([]);
  const [isSearchingLive, setIsSearchingLive] = useState(false);

  // 1. Realtime listener for appointments (today's queue and recent bookings)
  useEffect(() => {
    try {
      const appColRef = query(collection(db, 'appointments'), limit(250));
      const unsubscribe = onSnapshot(appColRef, (snapshot) => {
        const appList: any[] = [];
        snapshot.forEach((snap) => {
          appList.push({ id: snap.id, ...snap.data() });
        });
        GLOBAL_WEB_APPTS_CACHE = appList;
        setExistingAppointments(appList);
      }, () => { });
      return () => unsubscribe();
    } catch (e) { }
  }, []);

  // 2. Realtime listener for allpatients (reception directory)
  useEffect(() => {
    try {
      const allPatColRef = query(collection(db, 'allpatients'), limit(250));
      const unsubscribe = onSnapshot(allPatColRef, (snapshot) => {
        const list: any[] = [];
        snapshot.forEach((snap) => {
          list.push({ id: snap.id, ...snap.data() });
        });
        GLOBAL_WEB_ALLPATIENTS_CACHE = list;
        setAllPatientsList(list);
      }, () => { });
      return () => unsubscribe();
    } catch (e) { }
  }, []);

  // 3. Load historical patients scoped to selected branch
  useEffect(() => {
    let isMounted = true;
    const loadBranchPatients = async () => {
      try {
        const branchQueries = getBranchQueryNames(searchBranchFilter);
        const qList = branchQueries.length > 0
          ? [
              query(collection(db, 'patients'), where('branchName', 'in', branchQueries), limit(1000)),
              query(collection(db, 'patients'), where('branch', 'in', branchQueries), limit(1000))
            ]
          : [query(collection(db, 'patients'), limit(500))];

        const snaps = await Promise.all(qList.map(q => getDocs(q).catch(() => ({ docs: [] }))));
        if (!isMounted) return;
        const list: any[] = [];
        const seen = new Set<string>();
        snaps.forEach((snap: any) => {
          snap.docs?.forEach((docSnap: any) => {
            if (!seen.has(docSnap.id)) {
              seen.add(docSnap.id);
              list.push({ id: docSnap.id, ...docSnap.data() });
            }
          });
        });
        GLOBAL_WEB_PATIENTS_CACHE = list;
        setPatientsList(list);
      } catch (err) {
        console.warn('Branch patients load notice:', err);
      }
    };
    loadBranchPatients();
    return () => { isMounted = false; };
  }, [searchBranchFilter]);

  // 4. Live Firestore Search Fallback for any query (checks across all 11,600+ patients and appointments in Firestore)
  useEffect(() => {
    const trimmed = activeSearchQuery.trim();
    if (trimmed.length < 2) {
      setLiveSearchResults([]);
      setIsSearchingLive(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearchingLive(true);
      try {
        const cleanDigits = trimmed.replace(/\D/g, '');
        const isPureDigits = cleanDigits.length >= 2 && /^\d+$/.test(trimmed.replace(/[\s\-\+]/g, ''));
        const queriesToRun: any[] = [];

        if (isPureDigits || cleanDigits.length >= 7) {
          const tenDigit = cleanDigits.slice(-10);
          queriesToRun.push(
            getDocs(query(collection(db, 'patients'), where('phone', '==', tenDigit), limit(25))),
            getDocs(query(collection(db, 'allpatients'), where('phone', '==', tenDigit), limit(25))),
            getDocs(query(collection(db, 'appointments'), where('phone', '==', tenDigit), limit(25))),
            getDocs(query(collection(db, 'appointments'), where('phoneNumber', '==', tenDigit), limit(25))),
            getDocs(query(collection(db, 'patients'), where('phone', '==', '+91' + tenDigit), limit(25))),
            getDocs(query(collection(db, 'allpatients'), where('phone', '==', '+91' + tenDigit), limit(25))),
            getDocs(query(collection(db, 'appointments'), where('phone', '==', '+91' + tenDigit), limit(25))),
            getDocs(query(collection(db, 'appointments'), where('phoneNumber', '==', '+91' + tenDigit), limit(25))),
            getDocs(query(collection(db, 'patients'), where('phoneNumber', '==', tenDigit), limit(25))),
            getDocs(query(collection(db, 'allpatients'), where('phoneNumber', '==', tenDigit), limit(25)))
          );
        } else {
          const titleCase = trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
          const upperCase = trimmed.toUpperCase();

          queriesToRun.push(
            // Registration IDs
            getDocs(query(collection(db, 'patients'), where('registrationId', '==', trimmed), limit(25))),
            getDocs(query(collection(db, 'allpatients'), where('registrationId', '==', trimmed), limit(25))),
            getDocs(query(collection(db, 'appointments'), where('registrationId', '==', trimmed), limit(25))),
            getDocs(query(collection(db, 'patients'), where('regNo', '==', trimmed), limit(25))),
            getDocs(query(collection(db, 'allpatients'), where('regNo', '==', trimmed), limit(25))),
            getDocs(query(collection(db, 'appointments'), where('regId', '==', trimmed), limit(25))),
            // Full name prefixes across patients, allpatients, and appointments
            getDocs(query(collection(db, 'patients'), where('fullName', '>=', titleCase), where('fullName', '<=', titleCase + '\uf8ff'), limit(25))),
            getDocs(query(collection(db, 'allpatients'), where('patientName', '>=', titleCase), where('patientName', '<=', titleCase + '\uf8ff'), limit(25))),
            getDocs(query(collection(db, 'appointments'), where('patientName', '>=', titleCase), where('patientName', '<=', titleCase + '\uf8ff'), limit(25))),
            getDocs(query(collection(db, 'appointments'), where('name', '>=', titleCase), where('name', '<=', titleCase + '\uf8ff'), limit(25))),
            getDocs(query(collection(db, 'appointments'), where('fullName', '>=', titleCase), where('fullName', '<=', titleCase + '\uf8ff'), limit(25))),
            getDocs(query(collection(db, 'patients'), where('fullName', '>=', upperCase), where('fullName', '<=', upperCase + '\uf8ff'), limit(25))),
            getDocs(query(collection(db, 'allpatients'), where('patientName', '>=', upperCase), where('patientName', '<=', upperCase + '\uf8ff'), limit(25))),
            getDocs(query(collection(db, 'appointments'), where('patientName', '>=', upperCase), where('patientName', '<=', upperCase + '\uf8ff'), limit(25)))
          );
        }

        const results = await Promise.all(queriesToRun.map(q => q.catch(() => ({ docs: [] }))));
        const matchedList: any[] = [];
        const seenIds = new Set<string>();

        results.forEach((snap: any) => {
          snap.docs?.forEach((docSnap: any) => {
            if (!seenIds.has(docSnap.id)) {
              seenIds.add(docSnap.id);
              matchedList.push({ id: docSnap.id, ...docSnap.data() });
            }
          });
        });

        setLiveSearchResults(matchedList);
      } catch (err) {
        console.warn('Live search error:', err);
      } finally {
        setIsSearchingLive(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [activeSearchQuery]);

  // Deduplicated Patient History Database across allpatients, patients, appointments, receptionDataStore & live search
  interface PatientRecordItem {
    id: string;
    regId: string;
    name: string;
    phone: string;
    email: string;
    diseases: string;
    branch: string;
    branchKeys: Set<string>;
    nameLower: string;
    phoneClean: string;
    source: string;
    apptDate?: string;
    apptTime?: string;
  }

  // Unified patient records from both allpatients and patients (plus appointments, receptionDataStore, and liveSearchResults)
  const allUnifiedPatients = useMemo<PatientRecordItem[]>(() => {
    const map = new Map<string, PatientRecordItem>();

    const addRecord = (item: any) => {
      if (!item) return;
      const rawName = String(item.patientName || item.fullName || item.name || '').trim();
      const rawPhone = String(item.phone || item.phoneNumber || item.mobile || item.contactNumber || '').replace(/\D/g, '');
      const cleanPhone = rawPhone.slice(-10);

      // Must have at least a valid name or phone number
      if (!rawName && cleanPhone.length < 10) return;

      const regId = String(item.registrationId || item.regId || item.regNo || item.patientId || item.uhid || item.id || '').trim();
      const docId = String(item.id || item.patientDocId || regId || '').trim();
      const email = String(item.email || item.emailAddress || '').trim();
      const diseases = String(item.subject || item.symptoms || item.diseases || item.problem || item.disease || item.healthIssue || item.complaint || item.issue || '').trim();
      const rawBranch = String(item.branchName || item.branch || item.targetBranch || item.homeBranch || item.branchId || '').trim();
      const branchKey = normalizeBranchKey(rawBranch) || normalizeBranchKey(regId);
      const apptDate = String(item.appointmentDate || item.date || item.dateString || '').trim();
      const apptTime = String(item.appointmentTime || item.time || item.timeSlot || '').trim();

      const dedupeKey = cleanPhone.length >= 10
        ? `phone:${cleanPhone}`
        : regId
          ? `reg:${regId.toLowerCase()}`
          : `name:${rawName.toLowerCase()}`;

      if (map.has(dedupeKey)) {
        const existing = map.get(dedupeKey)!;
        if (!existing.email && email) existing.email = email;
        if (!existing.diseases && diseases) existing.diseases = diseases;
        if (!existing.regId && regId) existing.regId = regId;
        if (apptDate && !existing.apptDate) {
          existing.apptDate = apptDate;
          existing.apptTime = apptTime;
        }
        if (rawName && existing.name === 'Patient') {
          existing.name = rawName;
          existing.nameLower = rawName.toLowerCase();
        }
        if (branchKey) existing.branchKeys.add(branchKey);
        if (!existing.branch && rawBranch) existing.branch = rawBranch;
        return;
      }

      const branchKeysSet = new Set<string>();
      if (branchKey) branchKeysSet.add(branchKey);

      map.set(dedupeKey, {
        id: docId || regId || cleanPhone,
        regId: regId || docId,
        name: rawName || 'Patient',
        phone: cleanPhone || rawPhone,
        email,
        diseases,
        branch: rawBranch || '',
        branchKeys: branchKeysSet,
        nameLower: rawName.toLowerCase(),
        phoneClean: cleanPhone || rawPhone,
        source: item.source || item.marketingSource || 'Old Patient',
        apptDate,
        apptTime
      });
    };

    // 1. Process allpatients collection
    if (Array.isArray(allPatientsList)) {
      for (const p of allPatientsList) addRecord(p);
    }

    // 2. Process patients collection
    if (Array.isArray(patientsList)) {
      for (const p of patientsList) addRecord(p);
    }

    // 3. Process appointments collection
    if (Array.isArray(existingAppointments)) {
      for (const a of existingAppointments) addRecord(a);
    }

    // 4. Process receptionDataStore allCollectionsPool
    try {
      const storePool = receptionDataStore.getAllCollectionsPool();
      if (Array.isArray(storePool)) {
        for (const sp of storePool) addRecord(sp);
      }
    } catch (e) { }

    // 5. Process liveSearchResults
    if (Array.isArray(liveSearchResults)) {
      for (const lr of liveSearchResults) addRecord(lr);
    }

    return Array.from(map.values());
  }, [allPatientsList, patientsList, existingAppointments, liveSearchResults]);

  // Live reactive check: whenever phoneNumber reaches 10 digits, if found in any patient records, auto-set Marketing Source to 'Old Patient'
  useEffect(() => {
    const raw = patientData.phone || phoneNumber || '';
    const clean = raw.replace(/\D/g, '').slice(-10);
    if (clean.length === 10) {
      const match = (allUnifiedPatients || []).find(p => {
        const pClean = String(p.phone || p.phoneClean || '').replace(/\D/g, '').slice(-10);
        return pClean === clean;
      }) || (allPatientsList || []).find(p => {
        const pClean = String(p.phone || p.phoneNumber || p.patientPhone || p.mobile || '').replace(/\D/g, '').slice(-10);
        return pClean === clean;
      }) || (patientsList || []).find(p => {
        const pClean = String(p.phone || p.phoneNumber || p.patientPhone || p.mobile || '').replace(/\D/g, '').slice(-10);
        return pClean === clean;
      });

      if (match) {
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
  }, [phoneNumber, patientData.phone, allUnifiedPatients, allPatientsList, patientsList]);

  // Live filter patient suggestions based on activeSearchQuery and searchBranchFilter
  const patientSuggestions = useMemo<PatientRecordItem[]>(() => {
    const queryStr = activeSearchQuery.trim().toLowerCase();
    if (queryStr.length < 2) return [];

    const digitsOnly = queryStr.replace(/\D/g, '');
    const targetBranchKey = normalizeBranchKey(searchBranchFilter);

    const branchMatches: PatientRecordItem[] = [];
    const otherBranchMatches: PatientRecordItem[] = [];

    for (const p of allUnifiedPatients) {
      // 1. Query match: check name, phone, or registration/patient ID
      const nameMatches = p.nameLower.includes(queryStr);
      const phoneMatches = digitsOnly.length >= 2 && p.phoneClean.includes(digitsOnly);
      const idMatches = p.id.toLowerCase().includes(queryStr) || (p.regId && p.regId.toLowerCase().includes(queryStr));

      if (!nameMatches && !phoneMatches && !idMatches) {
        continue;
      }

      // 2. Branch check:
      // Prioritize selected branch first, while keeping other branches accessible
      const isCurrentBranch = !targetBranchKey || p.branchKeys.size === 0 || p.branchKeys.has(targetBranchKey);

      if (isCurrentBranch) {
        branchMatches.push(p);
      } else {
        otherBranchMatches.push(p);
      }
    }

    const sortFn = (a: PatientRecordItem, b: PatientRecordItem) => {
      const aNameStarts = a.nameLower.startsWith(queryStr) ? 0 : 1;
      const bNameStarts = b.nameLower.startsWith(queryStr) ? 0 : 1;
      if (aNameStarts !== bNameStarts) return aNameStarts - bNameStarts;

      if (digitsOnly.length >= 2) {
        const aPhoneStarts = a.phoneClean.startsWith(digitsOnly) ? 0 : 1;
        const bPhoneStarts = b.phoneClean.startsWith(digitsOnly) ? 0 : 1;
        if (aPhoneStarts !== bPhoneStarts) return aPhoneStarts - bPhoneStarts;
      }

      return a.nameLower.localeCompare(b.nameLower);
    };

    branchMatches.sort(sortFn);
    otherBranchMatches.sort(sortFn);

    // Return current branch matches at the top, followed by other branch matches (max 35)
    return [...branchMatches, ...otherBranchMatches].slice(0, 35);
  }, [allUnifiedPatients, activeSearchQuery, searchBranchFilter]);

  const handleSelectPatientSuggestion = (item: PatientRecordItem) => {
    setPatientName(item.name || '');
    setPhoneNumber(item.phone || '');
    setEmailAddress(item.email || '');
    setDiseases(item.diseases || '');
    setMarketingSource('Old Patient');
    setPatientData(prev => ({
      ...prev,
      patientId: item.id,
      regID: item.regId || item.id,
      registrationId: item.regId || item.id,
      fullName: item.name,
      patientName: item.name,
      phone: item.phone,
      homeBranch: item.branch || prev.homeBranch,
      branchName: item.branch || prev.branchName,
      source: 'Old Patient',
      patientType: 'revisit',
      isNewPatient: false,
      isExistingProfile: true
    }));
    setBypassPhoneCheck(true);
    setPatientSearchTerm(item.name ? `${item.name} (${item.phone || 'No Phone'})` : item.phone || '');
    setActiveSearchQuery('');
    setShowSuggestions(false);
    setSearchSource(null);
  };

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
      const tempColRef = collection(db, 'doctor_temp_slots');
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

      if (selectedDocObj && selectedDocObj.branchSchedules && selectedDocObj.branchSchedules.length > 0) {
        const normCurrentBranch = (currentBranch || '').toLowerCase().replace(/\s*branch\s*/i, '').trim();
        const matchBs = selectedDocObj.branchSchedules.find((bs) => {
          const normBsBranch = (bs.targetBranch || '').toLowerCase().replace(/\s*branch\s*/i, '').trim();
          return normBsBranch.includes(normCurrentBranch) || normCurrentBranch.includes(normBsBranch);
        });

        if (matchBs && matchBs.daySchedules?.[selectedDayName]) {
          const daySched = matchBs.daySchedules[selectedDayName];
          if (daySched.status === 'Available' && daySched.slots && daySched.slots.length > 0) {
            regularSlots = generate15MinSlotsFromRanges(daySched.slots);
          }
        }
      }

      if (regularSlots.length === 0) {
        regularSlots = generate15MinSlotsFromRanges(defaultFallbackRanges);
      }
    }

    // Find temporary slots for selected doctor, appointment date, and branch
    const normSelectedDoc = (selectedDoctor || '').toLowerCase().trim();
    const normCurrentBranch = (currentBranch || '').toLowerCase().replace(/\s*branch\s*/i, '').trim();

    const matchedTempDocs = tempSlotsList.filter((ts) => {
      const sameDoc = (ts.doctorName || '').toLowerCase().trim() === normSelectedDoc;
      const sameDate = ts.appointmentDate === appointmentDate;
      const tsBranch = (ts.branch || '').toLowerCase().replace(/\s*branch\s*/i, '').trim();
      const sameBranch = !tsBranch || tsBranch.includes(normCurrentBranch) || normCurrentBranch.includes(tsBranch);
      return sameDoc && sameDate && sameBranch;
    });

    const tempSlotsRanges: TimeSlot[] = matchedTempDocs.map((ts) => ({
      startHour: ts.startHour,
      startMinute: ts.startMinute,
      startAmPm: ts.startAmPm,
      endHour: ts.endHour,
      endMinute: ts.endMinute,
      endAmPm: ts.endAmPm
    }));

    const generatedTempSlots = generate15MinSlotsFromRanges(tempSlotsRanges);

    // Merge regular & temp slots, remove duplicates, and sort chronologically
    const combined = Array.from(new Set([...regularSlots, ...generatedTempSlots]));
    const sorted = sortTimeSlotsChronologically(combined);

    // Apply Doctor No-Show Override Filtering (Full Day, Date Range, Session, Time Range):
    let availableList = sorted;
    if (activeNoShowForSelectedDoc) {
      const { availableSlots } = filterSlotsByNoShow(sorted, activeNoShowForSelectedDoc);
      availableList = availableSlots;
    }

    // We return all valid slots without filtering out past slots so past slots remain visible but blocked in UI
    return availableList;
  }, [selectedDocObj, selectedDoctor, currentBranch, selectedDayName, appointmentDate, tempSlotsList, activeNoShowForSelectedDoc, consultationMode]);

  const normalizeTimeStr = (str: string): string => {
    if (!str) return '';
    const trimmed = str.trim().toUpperCase();
    const parts = trimmed.split(' ');
    if (parts.length < 2) return trimmed;
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
    const normCurrentBranch = (currentBranch || '').toLowerCase().replace(/\s*branch\s*/i, '').trim();

    const matchedTempDocs = tempSlotsList.filter((ts) => {
      const sameDoc = (ts.doctorName || '').toLowerCase().trim() === normSelectedDoc;
      const sameDate = ts.appointmentDate === appointmentDate;
      const tsBranch = (ts.branch || '').toLowerCase().replace(/\s*branch\s*/i, '').trim();
      const sameBranch = !tsBranch || tsBranch.includes(normCurrentBranch) || normCurrentBranch.includes(tsBranch);
      return sameDoc && sameDate && sameBranch;
    });

    matchedTempDocs.forEach((ts) => {
      const slots = generate15MinSlotsFromRanges([{
        startHour: ts.startHour,
        startMinute: ts.startMinute,
        startAmPm: ts.startAmPm,
        endHour: ts.endHour,
        endMinute: ts.endMinute,
        endAmPm: ts.endAmPm
      }]);
      slots.forEach((sStr) => {
        if (ts.id) {
          map[normalizeTimeStr(sStr)] = ts.id;
          map[sStr.trim()] = ts.id;
        }
      });
    });

    return map;
  }, [selectedDoctor, currentBranch, appointmentDate, tempSlotsList]);

  // Helper to delete temporary slot from Firestore
  const handleDeleteTempSlot = async (tempDocId: string) => {
    try {
      await deleteDoc(doc(db, 'doctor_temp_slots', tempDocId));
    } catch (e) {
      console.warn('Error deleting temp slot:', e);
    }
  };

  // Helper to calculate remaining slots out of 3 capacity for a time slot
  const getSlotCapacityInfo = (slotTimeStr: string) => {
    const normSelectedDoc = (selectedDoctor || '').toLowerCase().trim();
    const bookedCount = existingAppointments.filter((app) => {
      const normAppDoc = (app.doctorName || app.doctor || '').toLowerCase().trim();
      const sameDoc = normAppDoc === normSelectedDoc;
      const sameDate = app.appointmentDate === appointmentDate;
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
  };

  // Custom slot time picker states
  const [customSlotModalOpen, setCustomSlotModalOpen] = useState(false);
  const [shiftSelectModalOpen, setShiftSelectModalOpen] = useState(false);
  const [customSlotHour, setCustomSlotHour] = useState('02');
  const [customSlotMin, setCustomSlotMin] = useState('00');
  const [customSlotAmPm, setCustomSlotAmPm] = useState<'AM' | 'PM'>('PM');

  // Extract configured doctor shifts for selected doctor, day, and branch
  const doctorConfiguredShifts = useMemo(() => {
    if (consultationMode === 'Online') return [];
    if (!selectedDocObj || !selectedDocObj.branchSchedules || selectedDocObj.branchSchedules.length === 0) return [];
    const normCurrentBranch = (currentBranch || '').toLowerCase().replace(/\s*branch\s*/i, '').trim();
    const matchBs = selectedDocObj.branchSchedules.find((bs) => {
      const normBsBranch = (bs.targetBranch || '').toLowerCase().replace(/\s*branch\s*/i, '').trim();
      return normBsBranch.includes(normCurrentBranch) || normCurrentBranch.includes(normBsBranch);
    });
    if (matchBs && matchBs.daySchedules?.[selectedDayName]) {
      const daySched = matchBs.daySchedules[selectedDayName];
      if (daySched.status === 'Available' && daySched.slots && daySched.slots.length > 0) {
        return daySched.slots;
      }
    }
    return [];
  }, [selectedDocObj, currentBranch, selectedDayName, consultationMode]);

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
        afterMins = lastMins + 15;
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

  // Selected slot in minutes if a slot is currently highlighted
  const selectedSlotMins = useMemo(() => {
    if (!selectedTimeSlot) return null;
    const parts = selectedTimeSlot.trim().split(/\s+/);
    if (parts.length < 2) return null;
    const [h, m] = parts[0].split(':');
    const ampm = parts[1].toUpperCase() as 'AM' | 'PM';
    return parseTimeToMinutes(h, m, ampm);
  }, [selectedTimeSlot]);

  // Helper to add a 15-minute temporary slot to Firestore by start minutes
  const addTempSlotByMinutes = async (startMins: number) => {
    if (!selectedDoctor) return;
    try {
      const endMins = startMins + 15;
      const startStr = formatMinutesToTimeStr(startMins);
      const endStr = formatMinutesToTimeStr(endMins);

      const [sHour, sMinAmpm] = startStr.split(':');
      const [sMin, sAmPm] = sMinAmpm.split(' ');

      const [eHour, eMinAmpm] = endStr.split(':');
      const [eMin, eAmPm] = eMinAmpm.split(' ');

      await addDoc(collection(db, 'doctor_temp_slots'), {
        doctorName: selectedDoctor,
        branch: currentBranch,
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

  // Helper to add 15-min slot BEFORE
  const handleAddSlotBefore = async () => {
    if (!selectedDoctor || timeSlotsList.length === 0) return;
    if (selectedSlotMins !== null) {
      const prevMins = Math.max(0, selectedSlotMins - 15);
      await addTempSlotByMinutes(prevMins);
      return;
    }
    if (doctorShiftGroups.length > 1) {
      setShiftSelectModalOpen(true);
      return;
    }
    const earliestStr = timeSlotsList[0];
    const [timePart, ampm] = earliestStr.split(' ');
    const [h, m] = timePart.split(':');
    const totalMins = parseTimeToMinutes(h, m, ampm as 'AM' | 'PM');
    await addTempSlotByMinutes(Math.max(0, totalMins - 15));
  };

  // Helper to add 15-min slot AFTER
  const handleAddSlotAfter = async () => {
    if (!selectedDoctor || timeSlotsList.length === 0) return;
    if (selectedSlotMins !== null) {
      const nextMins = selectedSlotMins + 15;
      await addTempSlotByMinutes(nextMins);
      return;
    }
    if (doctorShiftGroups.length > 1) {
      setShiftSelectModalOpen(true);
      return;
    }
    const latestStr = timeSlotsList[timeSlotsList.length - 1];
    const [timePart, ampm] = latestStr.split(' ');
    const [h, m] = timePart.split(':');
    const totalMins = parseTimeToMinutes(h, m, ampm as 'AM' | 'PM');
    await addTempSlotByMinutes(totalMins + 15);
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

  // Calendar State: Month & Year switching
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());
  const [calYear, setCalYear] = useState(() => new Date().getFullYear());
  const [calendarModalOpen, setCalendarModalOpen] = useState(false);

  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmedBooking, setConfirmedBooking] = useState<any>(null);

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

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!patientName.trim() || !phoneNumber.trim()) {
      alert('Please enter Patient Name and Phone Number.');
      return;
    }
    if (!selectedDoctor) {
      alert('Please select an available Doctor.');
      return;
    }

    // Prevent booking if doctor is on Full Day or Date Range No Show
    if (activeNoShowForSelectedDoc && (activeNoShowForSelectedDoc.type === 'date' || activeNoShowForSelectedDoc.type === 'date_range')) {
      alert(`Cannot book appointment. ${selectedDoctor} is marked as NO SHOW at ${currentBranch} on ${appointmentDate} (${activeNoShowForSelectedDoc.reason}). Please select another doctor or date.`);
      return;
    }

    if (!selectedTimeSlot) {
      alert('Please select an available Time Slot.');
      return;
    }

    // Prevent booking if selected time slot is blocked by session or time range No Show
    if (activeNoShowForSelectedDoc) {
      const { availableSlots } = filterSlotsByNoShow([selectedTimeSlot], activeNoShowForSelectedDoc);
      if (availableSlots.length === 0) {
        alert(`The selected time slot ${selectedTimeSlot} is blocked by Doctor No Show (${activeNoShowForSelectedDoc.reason}). Please pick another slot.`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      let generatedRegId = patientData.regID || patientData.registrationId || patientData.patientId;
      const isAutoDocId = typeof generatedRegId === 'string' && /^[a-zA-Z0-9]{20,32}$/.test(generatedRegId.trim());
      if (!generatedRegId || typeof generatedRegId !== 'string' || generatedRegId.trim().length === 0 || isAutoDocId) {
        generatedRegId = await generateRegistrationId(currentBranch);
      }

      const newDocRef = doc(collection(db, 'appointments'));
      const docId = newDocRef.id;

      const isExplicitNewPatient = (patientData.source !== 'Old Patient' && marketingSource !== 'Old Patient' && !patientData.patientId);

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
        status: 'waiting',
        isNewPatient: isExplicitNewPatient,
        patientType: isExplicitNewPatient ? 'new' : 'revisit',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await Promise.all([
        setDoc(newDocRef, appPayload),
        setDoc(doc(db, 'allpatients', docId), appPayload).catch(() => { }),
        setDoc(doc(db, 'patients', docId), appPayload).catch(() => { })
      ]);

      // Trigger Leonas WhatsApp Booking Notification
      sendBookingWhatsAppNotification({
        patientName,
        phone: phoneNumber,
        date: appointmentDate,
        time: selectedTimeSlot || '10:00 AM',
        doctorName: selectedDoctor,
        branch: effectiveBranch
      }).catch(err => console.error('WhatsApp booking notification error:', err));

      // Trigger FCM Push Notification and 10-day Firestore retention cleanup
      createBookingNotificationInFirestore({
        patientName,
        appointmentTime: selectedTimeSlot || '10:00 AM',
        appointmentDate,
        branch: effectiveBranch,
        doctorName: selectedDoctor,
        consultationMode
      }).catch(err => console.warn('FCM booking notification notice:', err));

      // Open confirmation modal with details
      setConfirmedBooking(appPayload);
      setShowConfirmModal(true);
      setBookingSuccess(true);
      setTimeout(() => setBookingSuccess(false), 4000);

      // Complete Form & Search Reset to eliminate post-booking lag
      clearFormAndDraft();
    } catch (err) {
      setBookingSuccess(true);
      setTimeout(() => setBookingSuccess(false), 4000);
      clearFormAndDraft();
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderSuggestionsDropdown = () => (
    <>
      <div style={{
        padding: '8px 16px',
        background: '#f8fafc',
        borderBottom: '1px solid #f1f5f9',
        fontSize: '10px !important',
        fontWeight: 800,
        letterSpacing: '0.8px',
        color: '#64748b',
        textTransform: 'uppercase',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <span>Matching Patients ({searchBranchFilter.replace(' Branch', '')})</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isSearchingLive && (
            <span style={{ fontSize: '10.5px !important', color: '#0284c7', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
              ⚡ Searching database...
            </span>
          )}
          <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: '10px', fontSize: '10px !important' }}>
            {patientSuggestions.length} Found
          </span>
          <button
            type="button"
            onClick={() => {
              setShowSuggestions(false);
              setSearchSource(null);
            }}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#94a3b8', padding: '2px' }}
            title="Close"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {patientSuggestions.length === 0 ? (
        <div style={{ padding: '20px 16px', textAlign: 'center', color: '#64748b' }}>
          <div style={{ fontWeight: 700, fontSize: '13px', color: '#334155', marginBottom: '4px' }}>
            {isSearchingLive ? `Searching patient records for "${activeSearchQuery}"...` : `No patients found matching "${activeSearchQuery}"`}
          </div>
          <div style={{ fontSize: '11.5px', color: '#94a3b8' }}>
            {isSearchingLive ? 'Scanning all collections and historical database...' : 'Check spelling or phone digits, or continue entering new patient details below.'}
          </div>
        </div>
      ) : (
        patientSuggestions.map((item, idx) => (
          <div
            key={item.id + '_' + idx}
            onMouseDown={(e) => {
              e.preventDefault();
              handleSelectPatientSuggestion(item);
            }}
            onClick={() => handleSelectPatientSuggestion(item)}
            style={{
              padding: '12px 16px',
              borderBottom: idx < patientSuggestions.length - 1 ? '1px solid #f1f5f9' : 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              background: '#ffffff',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#f0f9ff')}
            onMouseLeave={(e) => (e.currentTarget.style.background = '#ffffff')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
              <div style={{
                width: '38px',
                height: '38px',
                borderRadius: '50%',
                background: '#eff6ff',
                border: '1px solid #dbeafe',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#0284c7',
                fontWeight: 700,
                flexShrink: 0
              }}>
                <User size={18} />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '14px !important', fontWeight: 700, color: '#0f172a' }}>{item.name || 'Unnamed Patient'}</span>
                  {item.regId && (
                    <span style={{ background: '#e0f2fe', border: '1px solid #bae6fd', color: '#0284c7', padding: '1px 7px', borderRadius: '6px', fontSize: '10.5px !important', fontWeight: 800 }}>
                      🆔 {item.regId}
                    </span>
                  )}
                  {item.branch && (
                    <span style={{ background: '#f8fafc', border: '1px solid #e2e8f0', color: '#475569', padding: '1px 7px', borderRadius: '6px', fontSize: '10.5px !important', fontWeight: 600 }}>
                      📍 {item.branch}
                    </span>
                  )}
                  {item.apptDate && (
                    <span style={{ background: '#fef3c7', border: '1px solid #fde68a', color: '#92400e', padding: '1px 7px', borderRadius: '6px', fontSize: '10.5px !important', fontWeight: 700 }}>
                      📅 Appt: {item.apptDate} {item.apptTime ? `• ${item.apptTime}` : ''}
                    </span>
                  )}
                </div>
                {item.diseases && (
                  <div style={{ fontSize: '11.5px !important', color: '#64748b', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    🩺 {item.diseases}
                  </div>
                )}
              </div>
            </div>
            <span style={{
              background: '#f0f9ff',
              border: '1px solid #bae6fd',
              color: '#0369a1',
              padding: '4px 10px',
              borderRadius: '8px',
              fontSize: '11.5px !important',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              flexShrink: 0
            }}>
              <Phone size={12} /> {item.phone || 'No Phone'}
            </span>
          </div>
        ))
      )}
    </>
  );

  return (
    <div style={{ padding: '24px', maxWidth: '1000px', margin: '0 auto' }}>

      {/* Page Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px !important', fontWeight: 800, color: '#0f172a', margin: 0 }}>
            Book Appointment
          </h1>
          <p style={{ color: '#64748b', fontSize: '13.5px !important', marginTop: '4px', margin: 0 }}>
            Schedule patient consultation for <strong style={{ color: '#258ec8' }}>{currentBranch}</strong> on <strong style={{ color: '#0f172a' }}>{selectedDayName} ({appointmentDate})</strong>
          </p>
        </div>

        {hasDraft && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              background: '#f0fdf4',
              color: '#16a34a',
              border: '1px solid #bbf7d0',
              padding: '6px 12px',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <CheckCircle2 size={14} /> Auto-Saved Draft
            </span>
            <button
              type="button"
              onClick={clearFormAndDraft}
              style={{
                background: '#fee2e2',
                border: '1px solid #fca5a5',
                color: '#dc2626',
                padding: '6px 12px',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Clear Form
            </button>
          </div>
        )}
      </div>

      {draftRestored && (
        <div style={{
          background: '#eff6ff',
          border: '1px solid #bfdbfe',
          color: '#1d4ed8',
          padding: '12px 18px',
          borderRadius: '16px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '13px',
          fontWeight: 600
        }}>
          <span>📋 Restored unsaved appointment details from your last session.</span>
          <button
            type="button"
            onClick={() => setDraftRestored(false)}
            style={{ background: 'none', border: 'none', color: '#1d4ed8', fontWeight: 700, cursor: 'pointer' }}
          >
            Dismiss
          </button>
        </div>
      )}

      {bookingSuccess && (
        <div style={{
          background: '#dcfce7',
          border: '1px solid #bbf7d0',
          color: '#15803d',
          padding: '14px 18px',
          borderRadius: '16px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontSize: '13.5px !important',
          fontWeight: 700
        }}>
          <CheckCircle2 size={20} color="#16a34a" />
          <span>Appointment for {patientName || 'Patient'} successfully booked at {currentBranch}!</span>
        </div>
      )}

      <form onSubmit={handleFormSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

        {/* CARD 1: PATIENT DETAILS */}
        <div style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '24px',
          padding: '24px 26px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.02)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '10px',
              background: '#258ec8',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '14px !important'
            }}>
              1
            </div>
            <h2 style={{ fontSize: '16px !important', fontWeight: 800, color: '#1e293b' }}>
              Patient Details
            </h2>
            <div style={{ flex: 1, height: '1px', background: '#f1f5f9', marginLeft: '8px' }} />
          </div>

          {/* DEDICATED PROMINENT PATIENT SEARCH BAR WITH COMPACT BRANCH DROPDOWN */}
          <div ref={searchContainerRef} style={{ position: 'relative', marginBottom: '22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <label style={{ display: 'block', fontSize: '12.5px !important', fontWeight: 800, color: '#258ec8' }}>
                🔎 Search Existing Patient (Type 2+ letters or phone digits)
              </label>
              <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>
                Branch: <strong style={{ color: '#0284c7' }}>{searchBranchFilter}</strong>
              </span>
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', width: '100%' }}>
              {/* Search Input Box */}
              <div style={{
                flex: 1,
                background: '#f8fafc',
                border: '2px solid #258ec8',
                borderRadius: '12px',
                padding: '0 16px',
                height: '48px',
                display: 'flex',
                alignItems: 'center',
                boxSizing: 'border-box',
                boxShadow: '0 2px 10px rgba(37, 142, 200, 0.08)'
              }}>
                <Search size={20} color="#258ec8" style={{ marginRight: '10px', flexShrink: 0 }} />
                <input
                  type="text"
                  placeholder={`Search patient in ${searchBranchFilter.replace(' Branch', '')} by Name, Mobile, or Reg ID...`}
                  value={patientSearchTerm}
                  onFocus={() => {
                    setActiveSearchQuery(patientSearchTerm);
                    setSearchSource('searchBar');
                    setShowSuggestions(true);
                  }}
                  onChange={e => {
                    const val = e.target.value;
                    setPatientSearchTerm(val);
                    setActiveSearchQuery(val);
                    setSearchSource('searchBar');
                    setShowSuggestions(true);
                  }}
                  style={{ border: 'none', outline: 'none', width: '100%', fontSize: '13.5px !important', color: '#0f172a', fontWeight: 600, background: 'transparent' }}
                />
                {patientSearchTerm ? (
                  <button
                    type="button"
                    onClick={() => {
                      setPatientSearchTerm('');
                      setActiveSearchQuery('');
                      setShowSuggestions(false);
                      setSearchSource(null);
                    }}
                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px', color: '#64748b' }}
                    title="Clear search"
                  >
                    <X size={16} />
                  </button>
                ) : null}
              </div>

              {/* Small Compact Branch Dropdown */}
              <div style={{
                width: '145px',
                flexShrink: 0,
                background: '#ffffff',
                border: '1.5px solid #cbd5e1',
                borderRadius: '12px',
                padding: '0 8px 0 10px',
                height: '48px',
                display: 'flex',
                alignItems: 'center',
                boxSizing: 'border-box'
              }}>
                <Building2 size={15} color="#0284c7" style={{ marginRight: '6px', flexShrink: 0 }} />
                <select
                  value={searchBranchFilter}
                  onChange={(e) => {
                    setSearchBranchFilter(e.target.value);
                    setShowSuggestions(true);
                  }}
                  style={{
                    border: 'none',
                    outline: 'none',
                    width: '100%',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: '#0f172a',
                    background: 'transparent',
                    cursor: 'pointer'
                  }}
                  title="Change branch to search other branch patients"
                >
                  <option value="Chandanagar Branch">Chandanagar</option>
                  <option value="KPHB Branch">KPHB</option>
                  <option value="Dilshuknagar Branch">Dilshuknagar</option>
                  <option value="Nallagandla Branch">Nallagandla</option>
                </select>
              </div>
            </div>

            {/* PATIENT RECOMMENDATIONS DROPDOWN FROM SEARCH BAR */}
            {showSuggestions && searchSource === 'searchBar' && activeSearchQuery.trim().length >= 2 && (
              <div style={{
                position: 'absolute',
                top: '100%',
                marginTop: '8px',
                left: '0',
                right: '0',
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '16px',
                boxShadow: '0 20px 45px -10px rgba(15, 23, 42, 0.18), 0 0 0 1px rgba(15, 23, 42, 0.04)',
                zIndex: 9999,
                maxHeight: '360px',
                overflowY: 'auto',
                overflowX: 'hidden'
              }}>
                {renderSuggestionsDropdown()}
              </div>
            )}
          </div>

          <div
            ref={patientNameRowRef}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '20px',
              position: 'relative',
              zIndex: (showSuggestions && searchSource === 'patientName') ? 1000 : 1
            }}
          >
            <div style={{ position: 'relative' }}>
              <label style={{ display: 'block', fontSize: '12.5px !important', fontWeight: 700, color: '#1e293b', marginBottom: '8px' }}>
                Patient Name *
              </label>
              <div style={{
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '12px',
                padding: '0 14px',
                height: '48px',
                display: 'flex',
                alignItems: 'center',
                boxSizing: 'border-box'
              }}>
                <User size={18} color="#94a3b8" style={{ marginRight: '10px' }} />
                <input
                  type="text"
                  placeholder="Enter full patient name"
                  value={patientName}
                  onFocus={() => {
                    setActiveSearchQuery(patientName);
                    setSearchSource('patientName');
                    setShowSuggestions(true);
                  }}
                  onChange={e => {
                    const val = e.target.value;
                    setPatientName(val);
                    setActiveSearchQuery(val);
                    setSearchSource('patientName');
                    setShowSuggestions(true);
                  }}
                  style={{ border: 'none', outline: 'none', width: '100%', fontSize: '13px !important', color: '#0f172a' }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12.5px !important', fontWeight: 700, color: '#1e293b', marginBottom: '8px' }}>
                Diseases / Symptoms
              </label>
              <div style={{
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '12px',
                padding: '0 14px',
                height: '48px',
                display: 'flex',
                alignItems: 'center',
                boxSizing: 'border-box'
              }}>
                <Stethoscope size={18} color="#94a3b8" style={{ marginRight: '10px' }} />
                <input
                  type="text"
                  placeholder="e.g. Migraine, Anxiety, Eczema"
                  value={diseases}
                  onChange={e => setDiseases(e.target.value)}
                  style={{ border: 'none', outline: 'none', width: '100%', fontSize: '13px !important', color: '#0f172a' }}
                />
              </div>
            </div>

            {/* PATIENT RECOMMENDATIONS DROPDOWN FROM PATIENT NAME INPUT (Positioned strictly BELOW the input row so it NEVER overlaps the textfield) */}
            {showSuggestions && searchSource === 'patientName' && activeSearchQuery.trim().length >= 2 && (
              <div style={{
                position: 'absolute',
                top: '80px',
                left: '0',
                right: '0',
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '16px',
                boxShadow: '0 20px 45px -10px rgba(15, 23, 42, 0.18), 0 0 0 1px rgba(15, 23, 42, 0.04)',
                zIndex: 9999,
                maxHeight: '340px',
                overflowY: 'auto',
                overflowX: 'hidden'
              }}>
                {renderSuggestionsDropdown()}
              </div>
            )}

            <div style={{ position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label style={{ display: 'block', fontSize: '12.5px !important', fontWeight: 700, color: '#1e293b' }}>
                  Phone (+91) *
                </label>
                {(patientData.phone || phoneNumber).replace(/\D/g, '').length >= 10 && (
                  <button
                    type="button"
                    onClick={() => handleManualPhoneCheck(patientData.phone || phoneNumber)}
                    disabled={checkingProfilesLoading}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '11px',
                      fontWeight: 700,
                      color: checkingProfilesLoading ? '#94a3b8' : '#0284c7',
                      padding: 0
                    }}
                  >
                    {checkingProfilesLoading ? 'Checking...' : 'Check Profiles'}
                  </button>
                )}
              </div>
              <div style={{
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '12px',
                padding: '0 14px',
                height: '48px',
                display: 'flex',
                alignItems: 'center',
                boxSizing: 'border-box'
              }}>
                <Phone size={18} color="#94a3b8" style={{ marginRight: '10px' }} />
                <input
                  type="tel"
                  placeholder="10-digit mobile number"
                  value={patientData.phone || phoneNumber}
                  onChange={e => handlePhoneInputChange(e.target.value)}
                  style={{ border: 'none', outline: 'none', width: '100%', fontSize: '13px !important', color: '#0f172a' }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12.5px !important', fontWeight: 700, color: '#1e293b', marginBottom: '8px' }}>
                Email Address (Optional)
              </label>
              <div style={{
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '12px',
                padding: '0 14px',
                height: '48px',
                display: 'flex',
                alignItems: 'center',
                boxSizing: 'border-box'
              }}>
                <Mail size={18} color="#94a3b8" style={{ marginRight: '10px' }} />
                <input
                  type="email"
                  placeholder="patient@example.com"
                  value={emailAddress}
                  onChange={e => setEmailAddress(e.target.value)}
                  style={{ border: 'none', outline: 'none', width: '100%', fontSize: '13px !important', color: '#0f172a' }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12.5px !important', fontWeight: 700, color: '#1e293b', marginBottom: '8px' }}>
                Marketing Source
              </label>
              {marketingSource === 'Old Patient' || patientData.source === 'Old Patient' ? (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  borderRadius: '12px',
                  padding: '0 14px',
                  height: '48px',
                  boxSizing: 'border-box'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Megaphone size={16} color="#64748b" />
                    <span style={{ fontSize: '13px !important', color: '#0f172a', fontWeight: 700 }}>
                      Old Patient
                    </span>
                  </div>
                </div>
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      borderRadius: '12px',
                      padding: '0 14px',
                      height: '48px',
                      boxSizing: 'border-box',
                      cursor: 'pointer'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Megaphone size={16} color="#94a3b8" />
                        <span style={{ fontSize: '13px !important', color: marketingSource === 'Select Source' ? '#94a3b8' : '#0f172a', fontWeight: 500 }}>
                          {marketingSource}
                        </span>
                      </div>
                      <ChevronDown size={18} color="#94a3b8" />
                    </div>
                  </DropdownMenuTrigger>

                  <DropdownMenuContent>
                    <DropdownMenuGroup>
                      <DropdownMenuLabel>Select Marketing Source</DropdownMenuLabel>
                      <DropdownMenuRadioGroup value={marketingSource} onValueChange={setMarketingSource}>
                        {marketingSourcesList.map(src => (
                          <DropdownMenuRadioItem key={src} value={src}>{src}</DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12.5px !important', fontWeight: 700, color: '#1e293b', marginBottom: '8px' }}>
                Mode of Consultation
              </label>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '12px',
                    padding: '0 14px',
                    height: '48px',
                    boxSizing: 'border-box',
                    cursor: 'pointer'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <User size={16} color="#94a3b8" />
                      <span style={{ fontSize: '13px !important', color: '#0f172a', fontWeight: 500 }}>
                        {consultationMode}
                      </span>
                    </div>
                    <ChevronDown size={18} color="#94a3b8" />
                  </div>
                </DropdownMenuTrigger>

                <DropdownMenuContent>
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>Select Mode</DropdownMenuLabel>
                    <DropdownMenuRadioGroup value={consultationMode} onValueChange={setConsultationMode}>
                      <DropdownMenuRadioItem value="In-Clinic">In-Clinic</DropdownMenuRadioItem>
                      <DropdownMenuRadioItem value="Online">Online</DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {/* CARD 2: APPOINTMENT INFORMATION */}
        <div style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '24px',
          padding: '24px 26px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.02)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '10px',
              background: '#258ec8',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '14px !important'
            }}>
              2
            </div>
            <h2 style={{ fontSize: '16px !important', fontWeight: 800, color: '#1e293b' }}>
              Appointment Information
            </h2>
            <div style={{ flex: 1, height: '1px', background: '#f1f5f9', marginLeft: '8px' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>

            {/* 1. Branch */}
            <div>
              <label style={{ display: 'block', fontSize: '12.5px !important', fontWeight: 700, color: '#1e293b', marginBottom: '8px' }}>
                Select Branch *
              </label>
              {isHR ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: '#ffffff',
                      border: '1px solid #258ec8',
                      borderRadius: '12px',
                      padding: '0 14px',
                      height: '48px',
                      boxSizing: 'border-box',
                      cursor: 'pointer'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Building2 size={18} color="#258ec8" />
                        <span style={{ fontSize: '13.5px !important', color: selectedBranch ? '#0f172a' : '#94a3b8', fontWeight: selectedBranch ? 800 : 500 }}>
                          {selectedBranch || 'Select Branch'}
                        </span>
                      </div>
                      <ChevronDown size={18} color="#94a3b8" />
                    </div>
                  </DropdownMenuTrigger>

                  <DropdownMenuContent>
                    <DropdownMenuGroup>
                      <DropdownMenuLabel>Select Branch</DropdownMenuLabel>
                      <DropdownMenuRadioGroup value={selectedBranch} onValueChange={(b) => { setSelectedBranch(b); setSelectedDoctor(''); setSelectedTimeSlot(''); }}>
                        {CLINIC_BRANCHES.map(b => (
                          <DropdownMenuRadioItem key={b} value={b}>{b}</DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <div style={{
                  background: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  borderRadius: '12px',
                  padding: '0 14px',
                  height: '48px',
                  display: 'flex',
                  alignItems: 'center',
                  boxSizing: 'border-box'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Building2 size={18} color="#258ec8" />
                    <span style={{ fontSize: '13.5px !important', color: '#0f172a', fontWeight: 800 }}>
                      {selectedBranch || currentBranch}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* 2. Date Field */}
            <div>
              <label style={{ display: 'block', fontSize: '12.5px !important', fontWeight: 700, color: '#1e293b', marginBottom: '8px' }}>
                Date (DD-MM-YYYY) *
              </label>
              <div
                onClick={() => setCalendarModalOpen(true)}
                style={{
                  background: '#ffffff',
                  border: '1px solid #258ec8',
                  borderRadius: '12px',
                  padding: '0 14px',
                  height: '48px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CalendarIcon size={18} color="#258ec8" />
                  <span style={{ fontSize: '13.5px !important', color: '#0f172a', fontWeight: 800 }}>
                    {appointmentDate}
                  </span>
                </div>
                <span style={{ fontSize: '11px', fontWeight: 800, color: '#0284c7', background: '#e0f2fe', padding: '2px 8px', borderRadius: '6px' }}>
                  {selectedDayName}
                </span>
              </div>
            </div>

            {/* 3. DYNAMIC DOCTOR DROPDOWN (ONLY AVAILABLE DOCTORS FOR THIS DAY & BRANCH) */}
            <div style={{ gridColumn: 'span 2' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label style={{ fontSize: '12.5px !important', fontWeight: 700, color: '#1e293b' }}>
                  Select Doctor *
                </label>
                <span style={{ fontSize: '11px', color: availableDoctors.length > 0 ? '#16a34a' : '#ef4444', fontWeight: 800 }}>
                  {availableDoctors.length} Doctors Available on {selectedDayName} at {currentBranch}
                </span>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '12px',
                    padding: '0 14px',
                    height: '48px',
                    boxSizing: 'border-box',
                    maxWidth: '420px',
                    cursor: 'pointer'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <User size={16} color="#258ec8" />
                      <span style={{ fontSize: '13px !important', color: selectedDoctor ? '#0f172a' : '#94a3b8', fontWeight: selectedDoctor ? 800 : 500 }}>
                        {selectedDoctor || 'Select Available Doctor'}
                      </span>
                    </div>
                    <ChevronDown size={18} color="#94a3b8" />
                  </div>
                </DropdownMenuTrigger>

                <DropdownMenuContent style={{ maxWidth: '420px' }}>
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>Available Doctors on {selectedDayName} ({currentBranch})</DropdownMenuLabel>
                    {availableDoctors.length === 0 ? (
                      <div style={{ padding: '12px', fontSize: '12px', color: '#ef4444', fontWeight: 700 }}>
                        No Doctors available on {selectedDayName} at {currentBranch}. Please pick another date.
                      </div>
                    ) : (
                      <DropdownMenuRadioGroup value={selectedDoctor} onValueChange={setSelectedDoctor}>
                        {availableDoctors.map(doc => {
                          const docNoShow = getActiveDoctorNoShow(noShowsList, doc.name, currentBranch, appointmentDate);
                          const isFullDayBlocked = docNoShow && (docNoShow.type === 'date' || docNoShow.type === 'date_range');
                          return (
                            <DropdownMenuRadioItem key={doc.id} value={doc.name}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '10px' }}>
                                <span style={{ color: isFullDayBlocked ? '#dc2626' : '#0f172a', fontWeight: isFullDayBlocked ? 700 : 500 }}>
                                  {doc.name}
                                </span>
                                {docNoShow && (
                                  <span style={{
                                    fontSize: '10px',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    background: isFullDayBlocked ? '#fee2e2' : '#fef3c7',
                                    color: isFullDayBlocked ? '#dc2626' : '#b45309',
                                    fontWeight: 800
                                  }}>
                                    {isFullDayBlocked ? '🚫 NO SHOW' : `⚠️ ${docNoShow.type.toUpperCase()} BLOCKED`}
                                  </span>
                                )}
                              </div>
                            </DropdownMenuRadioItem>
                          );
                        })}
                      </DropdownMenuRadioGroup>
                    )}
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

          </div>

          {/* 4. Available Slots Section */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px !important', fontWeight: 800, color: '#1e293b', margin: 0 }}>
                <Clock size={16} color="#258ec8" /> Available Slots
              </label>

              {selectedDoctor && (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={handleAddSlotBefore}
                    title={selectedTimeSlot ? `Add 15m slot before ${selectedTimeSlot}` : 'Add slot before start'}
                    style={{
                      background: '#e0f2fe',
                      color: '#0284c7',
                      border: '1px solid #bae6fd',
                      borderRadius: '8px',
                      padding: '5px 10px',
                      fontSize: '11px !important',
                      fontWeight: 800,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {selectedSlotMins !== null
                      ? `+ Before (${formatMinutesToTimeStr(Math.max(0, selectedSlotMins - 15))})`
                      : '+ Add Slot Before'}
                  </button>

                  <button
                    type="button"
                    onClick={handleAddSlotAfter}
                    title={selectedTimeSlot ? `Add 15m slot after ${selectedTimeSlot}` : 'Add slot after end'}
                    style={{
                      background: '#e0f2fe',
                      color: '#0284c7',
                      border: '1px solid #bae6fd',
                      borderRadius: '8px',
                      padding: '5px 10px',
                      fontSize: '11px !important',
                      fontWeight: 800,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {selectedSlotMins !== null
                      ? `+ After (${formatMinutesToTimeStr(selectedSlotMins + 15)})`
                      : '+ Add Slot After'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setCustomSlotModalOpen(true)}
                    title="Add arbitrary custom slot time"
                    style={{
                      background: '#f0fdf4',
                      color: '#15803d',
                      border: '1px solid #bbf7d0',
                      borderRadius: '8px',
                      padding: '5px 10px',
                      fontSize: '11px !important',
                      fontWeight: 800,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    + Custom Slot
                  </button>
                </div>
              )}
            </div>

            {/* Doctor No Show Active Alert Banner */}
            {activeNoShowForSelectedDoc && (
              <div style={{
                background: (activeNoShowForSelectedDoc.type === 'date' || activeNoShowForSelectedDoc.type === 'date_range') ? '#fef2f2' : '#fffbeb',
                border: (activeNoShowForSelectedDoc.type === 'date' || activeNoShowForSelectedDoc.type === 'date_range') ? '1.5px solid #fecaca' : '1.5px solid #fde68a',
                borderRadius: '12px',
                padding: '12px 16px',
                marginBottom: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px'
              }}>
                <div style={{
                  background: (activeNoShowForSelectedDoc.type === 'date' || activeNoShowForSelectedDoc.type === 'date_range') ? '#fee2e2' : '#fef3c7',
                  padding: '8px',
                  borderRadius: '8px',
                  color: (activeNoShowForSelectedDoc.type === 'date' || activeNoShowForSelectedDoc.type === 'date_range') ? '#dc2626' : '#d97706'
                }}>
                  <UserX size={18} />
                </div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '13px', color: (activeNoShowForSelectedDoc.type === 'date' || activeNoShowForSelectedDoc.type === 'date_range') ? '#991b1b' : '#92400e' }}>
                    {(activeNoShowForSelectedDoc.type === 'date' || activeNoShowForSelectedDoc.type === 'date_range') ? 'Doctor No Show Active (Full Day Block)' : 'Partial No Show Active'}
                  </div>
                  <div style={{ fontSize: '11.5px', color: (activeNoShowForSelectedDoc.type === 'date' || activeNoShowForSelectedDoc.type === 'date_range') ? '#b91c1c' : '#b45309', marginTop: '2px' }}>
                    {selectedDoctor} is marked as NO SHOW at {currentBranch} on {appointmentDate} (Reason: <strong>{activeNoShowForSelectedDoc.reason}</strong>).
                    {(activeNoShowForSelectedDoc.type === 'date' || activeNoShowForSelectedDoc.type === 'date_range')
                      ? ' All appointment booking slots are closed for this doctor.'
                      : ` Blocked slots for ${activeNoShowForSelectedDoc.type === 'session' ? `${activeNoShowForSelectedDoc.session?.toUpperCase()} Session` : `${activeNoShowForSelectedDoc.startTime} - ${activeNoShowForSelectedDoc.endTime}`} have been removed.`}
                  </div>
                </div>
              </div>
            )}

            {consultationMode === 'Online' ? (
              <div style={{
                background: '#f8fafc',
                borderRadius: '16px',
                padding: '16px',
                border: '1.5px solid #bae6fd',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                marginBottom: '14px'
              }}>
                <div style={{ fontSize: '12px', fontWeight: 800, color: '#0369a1', marginBottom: '10px' }}>
                  🌐 ONLINE CONSULTATION APPOINTMENT TIME
                </div>

                <button
                  type="button"
                  onClick={() => setClockModalOpen(true)}
                  style={{
                    background: '#0284c7',
                    color: '#ffffff',
                    padding: '12px 20px',
                    borderRadius: '14px',
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    fontSize: '16px',
                    fontWeight: 900,
                    cursor: 'pointer',
                    boxShadow: '0 4px 6px -1px rgba(2, 132, 199, 0.3)'
                  }}
                >
                  <Clock size={20} color="#ffffff" />
                  {selectedTimeSlot || '10:00 AM'}
                </button>

                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '8px' }}>
                  Click clock button to open Analog Clock Picker Popup
                </div>

                <WebAnalogClockModal
                  isOpen={clockModalOpen}
                  onClose={() => setClockModalOpen(false)}
                  selectedTimeSlot={selectedTimeSlot}
                  onSelectTime={(tStr) => {
                    setSelectedTimeSlot(tStr);
                  }}
                />
              </div>
            ) : !selectedDoctor ? (
              <div style={{ background: '#f8fafc', border: '1px solid #f1f5f9', borderRadius: '12px', padding: '12px 14px', fontSize: '12px !important', color: '#64748b' }}>
                Please select an available doctor to view time slots.
              </div>
            ) : timeSlotsList.length === 0 ? (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '12px 14px', fontSize: '12px !important', color: '#ef4444', fontWeight: 700 }}>
                {activeNoShowForSelectedDoc
                  ? `No booking slots available — ${selectedDoctor} is marked as NO SHOW on ${appointmentDate} (${activeNoShowForSelectedDoc.reason}).`
                  : `No active time slots configured for ${selectedDoctor} on ${selectedDayName}.`}
              </div>
            ) : doctorShiftGroups.length > 1 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {doctorShiftGroups.map((group) => (
                  <div
                    key={group.shiftIndex}
                    style={{
                      background: '#f8fafc',
                      border: '1.5px solid #e2e8f0',
                      borderRadius: '16px',
                      padding: '14px 16px',
                    }}
                  >
                    {/* Shift Header with Quick Add Buttons */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '8px',
                      marginBottom: '12px',
                      paddingBottom: '8px',
                      borderBottom: '1px solid #e2e8f0'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                          background: group.shiftIndex === 0 ? '#fef3c7' : '#e0f2fe',
                          color: group.shiftIndex === 0 ? '#b45309' : '#0369a1',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 800,
                        }}>
                          {group.shiftIndex === 0 ? '☀️' : '🌙'} {group.label}
                        </span>
                        <span style={{ fontSize: '11.5px', color: '#64748b', fontWeight: 600 }}>
                          ({group.slots.length} slots)
                        </span>
                      </div>

                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <button
                          type="button"
                          onClick={() => handleAddSlotBeforeForShift(group)}
                          style={{
                            background: '#f0fdf4',
                            color: '#15803d',
                            border: '1px solid #bbf7d0',
                            borderRadius: '6px',
                            padding: '3px 8px',
                            fontSize: '10.5px',
                            fontWeight: 800,
                            cursor: 'pointer',
                          }}
                        >
                          + Before ({group.slotBeforeStr})
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAddSlotAfterForShift(group)}
                          style={{
                            background: '#eff6ff',
                            color: '#1d4ed8',
                            border: '1px solid #bfdbfe',
                            borderRadius: '6px',
                            padding: '3px 8px',
                            fontSize: '10.5px',
                            fontWeight: 800,
                            cursor: 'pointer',
                          }}
                        >
                          + After ({group.slotAfterStr})
                        </button>
                      </div>
                    </div>

                    {/* Slots in this shift */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                      {group.slots.map((slot) => {
                        const isSelected = selectedTimeSlot === slot;
                        const { remainingSlots, isFull } = getSlotCapacityInfo(slot);
                        const normKey = normalizeTimeStr(slot);
                        const tempDocId = tempSlotMap[normKey] || tempSlotMap[slot.trim()];
                        const isTemp = !!tempDocId;

                        const todayStr = new Date().toISOString().split('T')[0];
                        const isToday = (appointmentDate === todayStr || normalizeToISODate(appointmentDate) === todayStr);
                        let isPastSlot = false;
                        if (isToday) {
                          const now = new Date();
                          const currentMins = now.getHours() * 60 + now.getMinutes();
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

                        const isDisabled = isFull || isPastSlot;

                        return (
                          <div key={slot} style={{ position: 'relative' }}>
                            <button
                              type="button"
                              disabled={isDisabled}
                              onClick={() => {
                                if (!isDisabled) {
                                  setSelectedTimeSlot(slot);
                                }
                              }}
                              style={{
                                background: isSelected
                                  ? (isTemp ? '#ef4444' : '#258ec8')
                                  : isTemp
                                    ? '#fff5f5'
                                    : isDisabled
                                      ? '#f1f5f9'
                                      : '#ffffff',
                                color: isSelected
                                  ? '#ffffff'
                                  : isTemp
                                    ? '#dc2626'
                                    : isDisabled
                                      ? '#94a3b8'
                                      : '#1e293b',
                                border: isSelected
                                  ? (isTemp ? '2px solid #b91c1c' : '2px solid #258ec8')
                                  : isTemp
                                    ? '1.5px solid #ef4444'
                                    : isDisabled
                                      ? '1px dashed #cbd5e1'
                                      : '1px solid #cbd5e1',
                                borderRadius: '12px',
                                padding: '8px 14px',
                                cursor: isDisabled ? 'not-allowed' : 'pointer',
                                transition: 'all 0.15s ease',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '3px',
                                minWidth: '85px',
                                opacity: isDisabled ? 0.6 : 1,
                              }}
                            >
                              <span style={{
                                fontSize: '12.5px !important',
                                fontWeight: 800,
                                textDecoration: isDisabled ? 'line-through' : 'none'
                              }}>
                                {slot}
                              </span>
                              <span
                                style={{
                                  fontSize: '10px !important',
                                  fontWeight: 700,
                                  padding: '1px 6px',
                                  borderRadius: '5px',
                                  background: isSelected
                                    ? 'rgba(255, 255, 255, 0.25)'
                                    : isTemp
                                      ? '#fee2e2'
                                      : isPastSlot
                                        ? '#fee2e2'
                                        : isFull
                                          ? '#fee2e2'
                                          : remainingSlots === 1
                                            ? '#fef3c7'
                                            : '#e0f2fe',
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
                              </span>
                            </button>

                            {isTemp && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteTempSlot(tempDocId);
                                }}
                                title="Remove Temporary Slot"
                                style={{
                                  position: 'absolute',
                                  top: '-5px',
                                  right: '-5px',
                                  background: '#ef4444',
                                  color: '#ffffff',
                                  border: 'none',
                                  borderRadius: '50%',
                                  width: '18px',
                                  height: '18px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  cursor: 'pointer',
                                  zIndex: 10,
                                  padding: 0,
                                  boxShadow: '0 2px 4px rgba(239, 68, 68, 0.4)'
                                }}
                              >
                                <X size={11} color="#ffffff" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                {timeSlotsList.map((slot) => {
                  const isSelected = selectedTimeSlot === slot;
                  const { remainingSlots, isFull } = getSlotCapacityInfo(slot);
                  const normKey = normalizeTimeStr(slot);
                  const tempDocId = tempSlotMap[normKey] || tempSlotMap[slot.trim()];
                  const isTemp = !!tempDocId;

                  const todayStr = new Date().toISOString().split('T')[0];
                  const isToday = (appointmentDate === todayStr || normalizeToISODate(appointmentDate) === todayStr);
                  let isPastSlot = false;
                  if (isToday) {
                    const now = new Date();
                    const currentMins = now.getHours() * 60 + now.getMinutes();
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

                  const isDisabled = isFull || isPastSlot;

                  return (
                    <div key={slot} style={{ position: 'relative' }}>
                      <button
                        type="button"
                        disabled={isDisabled}
                        onClick={() => {
                          if (!isDisabled) {
                            setSelectedTimeSlot(slot);
                          }
                        }}
                        style={{
                          background: isSelected
                            ? (isTemp ? '#ef4444' : '#258ec8')
                            : isTemp
                              ? '#fff5f5'
                              : isDisabled
                                ? '#f1f5f9'
                                : '#ffffff',
                          color: isSelected
                            ? '#ffffff'
                            : isTemp
                              ? '#dc2626'
                              : isDisabled
                                ? '#94a3b8'
                                : '#1e293b',
                          border: isSelected
                            ? (isTemp ? '2px solid #b91c1c' : '2px solid #258ec8')
                            : isTemp
                              ? '1.5px solid #ef4444'
                              : isDisabled
                                ? '1px dashed #cbd5e1'
                                : '1px solid #cbd5e1',
                          borderRadius: '12px',
                          padding: '8px 14px',
                          cursor: isDisabled ? 'not-allowed' : 'pointer',
                          transition: 'all 0.15s ease',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '3px',
                          minWidth: '85px',
                          opacity: isDisabled ? 0.6 : 1,
                        }}
                      >
                        <span style={{
                          fontSize: '12.5px !important',
                          fontWeight: 800,
                          textDecoration: isDisabled ? 'line-through' : 'none'
                        }}>
                          {slot}
                        </span>
                        <span
                          style={{
                            fontSize: '10px !important',
                            fontWeight: 700,
                            padding: '1px 6px',
                            borderRadius: '5px',
                            background: isSelected
                              ? 'rgba(255, 255, 255, 0.25)'
                              : isTemp
                                ? '#fee2e2'
                                : isPastSlot
                                  ? '#fee2e2'
                                  : isFull
                                    ? '#fee2e2'
                                    : remainingSlots === 1
                                      ? '#fef3c7'
                                      : '#e0f2fe',
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
                        </span>
                      </button>

                      {isTemp && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteTempSlot(tempDocId);
                          }}
                          title="Remove Temporary Slot"
                          style={{
                            position: 'absolute',
                            top: '-5px',
                            right: '-5px',
                            background: '#ef4444',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '50%',
                            width: '18px',
                            height: '18px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            zIndex: 10,
                            padding: 0,
                            boxShadow: '0 2px 4px rgba(239, 68, 68, 0.4)'
                          }}
                        >
                          <X size={11} color="#ffffff" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isSubmitting}
          style={{
            background: '#258ec8',
            color: '#ffffff',
            border: 'none',
            borderRadius: '16px',
            height: '52px',
            fontSize: '15px !important',
            fontWeight: 800,
            cursor: isSubmitting ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            boxShadow: '0 4px 14px rgba(37, 142, 200, 0.35)',
            opacity: isSubmitting ? 0.7 : 1
          }}
        >
          <CheckCircle2 size={20} />
          <span>{isSubmitting ? 'Booking Appointment...' : `Confirm Booking at ${currentBranch}`}</span>
        </button>

      </form>

      {/* CALENDAR MODAL */}
      {calendarModalOpen && (
        <div
          onClick={() => setCalendarModalOpen(false)}
          style={{
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
            zIndex: 99999,
            padding: '20px'
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#ffffff',
              borderRadius: '24px',
              padding: '24px',
              width: '100%',
              maxWidth: '350px',
              boxShadow: '0 20px 40px rgba(15, 23, 42, 0.2)',
              border: '1px solid #e2e8f0'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px', paddingBottom: '12px', borderBottom: '1px solid #f1f5f9' }}>
              <button
                type="button"
                onClick={handlePrevMonth}
                style={{ background: '#f1f5f9', border: 'none', borderRadius: '8px', padding: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <ChevronLeft size={18} color="#258ec8" />
              </button>

              <span style={{ fontSize: '15.5px !important', fontWeight: 800, color: '#0f172a' }}>
                {monthNames[calMonth]} {calYear}
              </span>

              <button
                type="button"
                onClick={handleNextMonth}
                style={{ background: '#f1f5f9', border: 'none', borderRadius: '8px', padding: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <ChevronRight size={18} color="#258ec8" />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', textAlign: 'center', marginBottom: '10px' }}>
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                <span key={d} style={{ fontSize: '11px !important', fontWeight: 700, color: '#64748b' }}>{d}</span>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px' }}>
              {Array.from({ length: startDayIndex }).map((_, i) => (
                <div key={`empty-${i}`} />
              ))}

              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(dayNum => {
                const formattedMonth = (calMonth + 1) < 10 ? `0${calMonth + 1}` : `${calMonth + 1}`;
                const formattedDay = dayNum < 10 ? `0${dayNum}` : `${dayNum}`;
                const dayStr = `${formattedDay}-${formattedMonth}-${calYear}`;
                const isSelected = appointmentDate === dayStr;

                return (
                  <button
                    key={dayNum}
                    type="button"
                    onClick={() => {
                      setAppointmentDate(dayStr);
                      setCalendarModalOpen(false);
                    }}
                    style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '50%',
                      background: isSelected ? '#258ec8' : '#f8fafc',
                      color: isSelected ? '#ffffff' : '#0f172a',
                      border: 'none',
                      fontSize: '12.5px !important',
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

            <button
              type="button"
              onClick={() => setCalendarModalOpen(false)}
              style={{
                width: '100%',
                marginTop: '18px',
                background: '#f1f5f9',
                color: '#475569',
                border: 'none',
                borderRadius: '12px',
                padding: '10px',
                fontSize: '12.5px !important',
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Close Calendar
            </button>
          </div>
        </div>
      )}

      {/* EXISTING PROFILES MODAL */}
      {existingProfilesModalVisible && (
        <div
          onClick={() => setExistingProfilesModalVisible(false)}
          style={{
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
            zIndex: 99999,
            padding: '20px'
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '440px',
              background: '#ffffff',
              borderRadius: '20px',
              padding: '24px',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.2)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0f172a' }}>
                  Existing Profiles Found ({existingProfilesList.length})
                </h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#64748b' }}>
                  Phone: +91 {checkedPhone}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setExistingProfilesModalVisible(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ maxHeight: '280px', overflowY: 'auto', marginBottom: '16px' }}>
              {existingProfilesList.map((prof, index) => (
                <div
                  key={prof.id || index}
                  onClick={() => handleSelectExistingProfile(prof)}
                  style={{
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    borderRadius: '10px',
                    padding: '12px',
                    marginBottom: '8px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer'
                  }}
                >
                  <div>
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
                            {prof.fullName}
                          </span>
                          <span style={{
                            backgroundColor: vState.badgeBg,
                            border: `1px solid ${vState.badgeBorder}`,
                            color: vState.badgeColor,
                            padding: '1.5px 6px',
                            borderRadius: '4px',
                            fontSize: '10px',
                            fontWeight: 800,
                            letterSpacing: '0.3px',
                            display: 'inline-flex',
                            alignItems: 'center'
                          }}>
                            {vState.badgeText}
                          </span>
                          {vState.isApp && (
                            <span style={{
                              backgroundColor: '#f3e8ff',
                              border: '1px solid #d8b4fe',
                              color: '#7e22ce',
                              padding: '1.5px 6px',
                              borderRadius: '4px',
                              fontSize: '10px',
                              fontWeight: 800,
                              letterSpacing: '0.3px',
                              display: 'inline-flex',
                              alignItems: 'center'
                            }}>
                              APP
                            </span>
                          )}
                          {prof.branchName && (
                            <span style={{
                              backgroundColor: '#e0f2fe',
                              border: '1px solid #bae6fd',
                              color: '#0369a1',
                              padding: '1.5px 6px',
                              borderRadius: '4px',
                              fontSize: '10px',
                              fontWeight: 700,
                              display: 'inline-flex',
                              alignItems: 'center'
                            }}>
                              📍 {prof.branchName.replace(/\s*branch\s*/i, '')} Branch
                            </span>
                          )}
                        </div>
                      );
                    })()}
                    <div style={{ fontSize: '12px', color: '#0284c7', marginTop: '2px' }}>
                      Reg ID: {prof.registrationId || prof.regNo}
                    </div>
                    {(prof.gender || prof.age) && (
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                        {[prof.gender, prof.age ? `${prof.age} YRS` : ''].filter(Boolean).join(' • ')}
                      </div>
                    )}
                  </div>
                  <div style={{ background: '#e0f2fe', padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, color: '#0284c7' }}>
                    Select
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={() => {
                  setBypassPhoneCheck(true);
                  setExistingProfilesModalVisible(false);
                }}
                style={{
                  background: '#f1f5f9',
                  color: '#475569',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '10px 16px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Create New Patient
              </button>
            </div>
          </div>
        </div>
      )}
      {/* APPOINTMENT BOOKING CONFIRMATION POPUP MODAL */}
      {showConfirmModal && confirmedBooking && (
        <div
          onClick={() => setShowConfirmModal(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 999999,
            padding: '20px'
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#ffffff',
              borderRadius: '24px',
              padding: '28px',
              width: '100%',
              maxWidth: '480px',
              boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.25)',
              border: '1px solid #e2e8f0',
              textAlign: 'center',
              position: 'relative'
            }}
          >
            <button
              onClick={() => setShowConfirmModal(false)}
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

            {/* Success Icon Header */}
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: '#dcfce7',
              color: '#16a34a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px auto',
              boxShadow: '0 0 0 8px #f0fdf4'
            }}>
              <CheckCircle2 size={36} />
            </div>

            <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', margin: '0 0 6px 0' }}>
              Appointment Confirmed!
            </h2>
            <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 20px 0' }}>
              Appointment successfully registered and saved.
            </p>

            {/* Registration ID Highlight Badge */}
            <div style={{
              background: 'linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%)',
              border: '1px solid #7dd3fc',
              borderRadius: '14px',
              padding: '12px 16px',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <span style={{ fontSize: '11px', fontWeight: 800, color: '#0369a1', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Registration ID
              </span>
              <span style={{ fontSize: '15px', fontWeight: 900, color: '#0284c7', fontFamily: 'monospace' }}>
                {confirmedBooking.registrationId}
              </span>
            </div>

            {/* Appointment Summary Grid */}
            <div style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '16px',
              padding: '16px',
              marginBottom: '24px',
              textAlign: 'left',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12.5px', color: '#64748b', fontWeight: 600 }}>Patient Name</span>
                <span style={{ fontSize: '13.5px', color: '#0f172a', fontWeight: 800 }}>{confirmedBooking.patientName}</span>
              </div>
              <div style={{ height: '1px', background: '#f1f5f9' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12.5px', color: '#64748b', fontWeight: 600 }}>Phone Number</span>
                <span style={{ fontSize: '13.5px', color: '#0f172a', fontWeight: 800 }}>+91 {confirmedBooking.phone}</span>
              </div>
              <div style={{ height: '1px', background: '#f1f5f9' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12.5px', color: '#64748b', fontWeight: 600 }}>Doctor</span>
                <span style={{ fontSize: '13.5px', color: '#0284c7', fontWeight: 800 }}>{confirmedBooking.doctorName}</span>
              </div>
              <div style={{ height: '1px', background: '#f1f5f9' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12.5px', color: '#64748b', fontWeight: 600 }}>Branch</span>
                <span style={{ fontSize: '13.5px', color: '#0f172a', fontWeight: 800 }}>{confirmedBooking.branch}</span>
              </div>
              <div style={{ height: '1px', background: '#f1f5f9' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12.5px', color: '#64748b', fontWeight: 600 }}>Date & Time</span>
                <span style={{ fontSize: '13.5px', color: '#16a34a', fontWeight: 800 }}>
                  {confirmedBooking.appointmentDate} @ {confirmedBooking.appointmentTime}
                </span>
              </div>
              <div style={{ height: '1px', background: '#f1f5f9' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12.5px', color: '#64748b', fontWeight: 600 }}>Consultation Mode</span>
                <span style={{
                  fontSize: '11px',
                  fontWeight: 800,
                  color: confirmedBooking.consultationMode === 'Online' ? '#7c3aed' : '#0284c7',
                  background: confirmedBooking.consultationMode === 'Online' ? '#f3e8ff' : '#e0f2fe',
                  padding: '2px 8px',
                  borderRadius: '6px'
                }}>
                  {confirmedBooking.consultationMode || 'In-Clinic'}
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                type="button"
                onClick={() => window.print()}
                style={{
                  flex: 1,
                  background: '#f1f5f9',
                  color: '#475569',
                  border: '1px solid #cbd5e1',
                  borderRadius: '12px',
                  padding: '12px',
                  fontSize: '13.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <Printer size={16} />
                Print Receipt
              </button>
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                style={{
                  flex: 1,
                  background: '#f1f5f9',
                  color: '#0f172a',
                  border: '1px solid #cbd5e1',
                  borderRadius: '12px',
                  padding: '12px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Book Another
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowConfirmModal(false);
                  if (onNavigate) {
                    onNavigate('reception_dashboard');
                  }
                }}
                style={{
                  flex: 1.5,
                  background: '#258ec8',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '12px',
                  padding: '12px',
                  fontSize: '13.5px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(37, 142, 200, 0.3)'
                }}
              >
                Go to Dashboard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SHIFT SELECTION MODAL (When multiple shifts exist and user clicks top buttons) */}
      {shiftSelectModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: '16px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '20px',
            padding: '24px',
            maxWidth: '480px',
            width: '100%',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            position: 'relative',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Clock size={20} color="#0284c7" />
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                  Choose Shift to Add Slot
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShiftSelectModalOpen(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '12.5px', color: '#64748b', marginBottom: '16px', lineHeight: '1.5' }}>
              <strong>{selectedDoctor}</strong> has multiple shifts scheduled. Choose which shift to expand, or add a custom slot time:
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
              {doctorShiftGroups.map((group) => (
                <div
                  key={group.shiftIndex}
                  style={{
                    border: '1.5px solid #e2e8f0',
                    borderRadius: '14px',
                    padding: '12px 14px',
                    background: '#f8fafc',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 800, fontSize: '13px', color: '#1e293b' }}>
                      {group.label}
                    </span>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>
                      {group.slots.length} active slots
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={async () => {
                        await handleAddSlotBeforeForShift(group);
                        setShiftSelectModalOpen(false);
                      }}
                      style={{
                        flex: 1,
                        background: '#f0fdf4',
                        color: '#15803d',
                        border: '1px solid #bbf7d0',
                        borderRadius: '8px',
                        padding: '8px 10px',
                        fontSize: '11.5px',
                        fontWeight: 800,
                        cursor: 'pointer'
                      }}
                    >
                      + Before ({group.slotBeforeStr})
                    </button>

                    <button
                      type="button"
                      onClick={async () => {
                        await handleAddSlotAfterForShift(group);
                        setShiftSelectModalOpen(false);
                      }}
                      style={{
                        flex: 1,
                        background: '#eff6ff',
                        color: '#1d4ed8',
                        border: '1px solid #bfdbfe',
                        borderRadius: '8px',
                        padding: '8px 10px',
                        fontSize: '11.5px',
                        fontWeight: 800,
                        cursor: 'pointer'
                      }}
                    >
                      + After ({group.slotAfterStr})
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => {
                  setShiftSelectModalOpen(false);
                  setCustomSlotModalOpen(true);
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#0284c7',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                + Add Specific Custom Time Instead
              </button>

              <button
                type="button"
                onClick={() => setShiftSelectModalOpen(false)}
                style={{
                  background: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  padding: '7px 14px',
                  fontSize: '12px',
                  fontWeight: 700,
                  color: '#475569',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CUSTOM SLOT TIME PICKER MODAL */}
      {customSlotModalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: '16px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '20px',
            padding: '24px',
            maxWidth: '400px',
            width: '100%',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
            position: 'relative',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Clock size={20} color="#15803d" />
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                  Add Custom Slot
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setCustomSlotModalOpen(false)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b' }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '16px' }}>
              Select any time for {selectedDoctor} on {appointmentDate}:
            </p>

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '20px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px' }}>HOUR</label>
                <select
                  value={customSlotHour}
                  onChange={(e) => setCustomSlotHour(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1.5px solid #cbd5e1', fontSize: '14px', fontWeight: 700 }}
                >
                  {['01','02','03','04','05','06','07','08','09','10','11','12'].map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>

              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px' }}>MINUTE</label>
                <select
                  value={customSlotMin}
                  onChange={(e) => setCustomSlotMin(e.target.value)}
                  style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1.5px solid #cbd5e1', fontSize: '14px', fontWeight: 700 }}
                >
                  {['00','15','30','45'].map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              <div style={{ flex: 1 }}>
                <label style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', display: 'block', marginBottom: '4px' }}>AM / PM</label>
                <select
                  value={customSlotAmPm}
                  onChange={(e) => setCustomSlotAmPm(e.target.value as 'AM' | 'PM')}
                  style={{ width: '100%', padding: '10px', borderRadius: '10px', border: '1.5px solid #cbd5e1', fontSize: '14px', fontWeight: 700 }}
                >
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setCustomSlotModalOpen(false)}
                style={{
                  flex: 1,
                  background: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  borderRadius: '10px',
                  padding: '10px',
                  fontSize: '13px',
                  fontWeight: 700,
                  color: '#475569',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const mins = parseTimeToMinutes(customSlotHour, customSlotMin, customSlotAmPm);
                  await addTempSlotByMinutes(mins);
                  setCustomSlotModalOpen(false);
                }}
                style={{
                  flex: 1.5,
                  background: '#15803d',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '10px',
                  fontSize: '13px',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                Add {customSlotHour}:{customSlotMin} {customSlotAmPm} Slot
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};    