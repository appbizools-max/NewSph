import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, setDoc, doc, deleteDoc, updateDoc, addDoc } from 'firebase/firestore';
import { db, resolveCanonicalBranchId, BRANCHES, DEFAULT_STAFF_MEMBERS } from '@app/shared';
import {
  Building2, Users, DollarSign, Clock, TrendingUp, AlertCircle, ShieldAlert,
  UserCheck, Package, Pill, Search, Plus, Edit, Trash2, CheckCircle2, Target, Calendar,
  PieChart, Award, FileText, ChevronRight, ChevronLeft, Image, Phone, X, BarChart3, Sparkles
} from 'lucide-react';
import { ManageBannersPage } from './ManageBanners/ManageBannersPage';
import { PackageMembersPage } from './PackageMembers/PackageMembersPage';
import { PendingPaymentsPage } from './PendingPayments/PendingPaymentsPage';
import { DoctorTimingsPage } from './DoctorTimings/DoctorTimingsPage';
import { ManageBranchesPage } from './ManageBranches/ManageBranchesPage';
import { AdminTotalRevenuePage } from './AnalyticsRevenue/AnalyticsRevenuePage';
import { ReportsAnalyticsPage } from './ReportsAnalytics/ReportsAnalyticsPage';
import { AveragePatientAnalyticsPage } from './AverageAnalytics/AveragePatientAnalyticsPage';
import { EmployeeDailyWorksPage } from './EmployeeWorks/EmployeeDailyWorksPage';
import { EmployeeAttendanceReportPage } from './EmployeeAttendance/EmployeeAttendanceReportPage';
import { BranchCleaningPage } from './BranchCleaning/BranchCleaningPage';
import { AdminFollowUpsPage } from './FollowUps/AdminFollowUpsPage';
import { createFeeDiscountResponseNotificationInFirestore } from '../../utils/fcmWebTrigger';
import { receptionDataStore } from '../../utils/receptionDataStore';
interface AdminDashboardPageProps {
  currentBranch?: string;
  role?: string;
}
export const AdminDashboardPage: React.FC<AdminDashboardPageProps> = ({ currentBranch = "All Branches", role = "admin" }) => {
  const getTabFromUrl = () => {
    const path = window.location.pathname.toLowerCase().replace(/^\//, '');
    if (path === 'followups' || path === 'follow-ups' || path === 'follow_ups' || path.includes('followup')) return 'follow_ups';
    if (path.includes('attendance') || path.includes('punch') || path.includes('roster')) return 'employee_attendance';
    if (path.includes('employeework') || path.includes('employee-work') || path.includes('dailywork')) return 'employee_works';
    if (path.includes('cleaning') || path.includes('sanitation')) return 'branch_cleaning';
    if (path.includes('feerequest') || path.includes('fees')) return 'fee_requests';
    if (path.includes('leaverequest') || path.includes('leaves')) return 'leave_requests';
    if (path === 'managebanner' || path === 'managebanners' || path === 'banners') return 'banners';
    if (path === 'packagemembers' || path === 'packages') return 'package_members';
    if (path === 'globalpatients' || path === 'patients') return 'patients';
    if (path.includes('average') || path.includes('arpu') || path.includes('duration')) return 'average_analytics';
    if (path === 'reports-analytics' || path === 'reports' || path === 'analytics') return 'reports_analytics';
    if (path === 'revenue' || path === 'finance') return 'finance';
    if (path === 'pendingpayments' || path === 'pending') return 'pending_payments';
    if (path === 'branches' || path === 'targets') return 'branches';
    if (path === 'doctortimings' || path === 'doctors') return 'doctors';
    if (path === 'staffmanagement' || path === 'staff') return 'staff';
    if (path === 'medicines' || path === 'inventory') return 'medicines';
    return 'overview';
  };

  const [activeTab, setActiveTab] = useState<
    'overview' | 'follow_ups' | 'fee_requests' | 'leave_requests' | 'branch_cleaning' | 'employee_attendance' | 'employee_works' | 'package_members' | 'patients' | 'banners' | 'finance' | 'reports_analytics' | 'average_analytics' | 'pending_payments' | 'branches' | 'doctors' | 'staff' | 'medicines'
  >(getTabFromUrl);

  const [isNavCollapsed, setIsNavCollapsed] = useState(false);

  const [adminRevenueLiveData, setAdminRevenueLiveData] = useState<any[]>(() => {
    try {
      const pool = receptionDataStore.getAllCollectionsPool();
      if (pool && pool.length > 0) return pool;
      return receptionDataStore.getAppointments() || [];
    } catch (_) {
      return [];
    }
  });

  useEffect(() => {
    try {
      receptionDataStore.startListeners();
    } catch (_) {}

    const unsub = receptionDataStore.subscribe((state) => {
      if (state.allCollectionsPool && state.allCollectionsPool.length > 0) {
        setAdminRevenueLiveData(state.allCollectionsPool);
      } else if (state.appointments && state.appointments.length > 0) {
        setAdminRevenueLiveData(state.appointments);
      }
    });

    return () => {
      unsub();
    };
  }, []);

  const handleTabChange = (tabId: any) => {
    setActiveTab(tabId);
    let targetPath = role === 'hr' ? '/hr' : '/dashboard';
    switch (tabId) {
      case 'overview': targetPath = role === 'hr' ? '/hr' : '/dashboard'; break;
      case 'follow_ups': targetPath = role === 'hr' ? '/hr/followups' : '/followups'; break;
      case 'employee_attendance': targetPath = role === 'hr' ? '/hr/attendance' : '/attendance'; break;
      case 'employee_works': targetPath = role === 'hr' ? '/hr/employeeworks' : '/employeeworks'; break;
      case 'branch_cleaning': targetPath = role === 'hr' ? '/hr/cleaning' : '/cleaning'; break;
      case 'fee_requests': targetPath = '/hr/feerequests'; break;
      case 'leave_requests': targetPath = '/hr/leaverequests'; break;
      case 'banners': targetPath = '/managebanner'; break;
      case 'package_members': targetPath = '/packagemembers'; break;
      case 'patients': targetPath = '/globalpatients'; break;
      case 'reports_analytics': targetPath = '/reports-analytics'; break;
      case 'average_analytics': targetPath = '/average-analytics'; break;
      case 'finance': targetPath = '/revenue'; break;
      case 'pending_payments': targetPath = '/pendingpayments'; break;
      case 'branches': targetPath = '/branches'; break;
      case 'doctors': targetPath = '/doctortimings'; break;
      case 'staff': targetPath = '/staffmanagement'; break;
      case 'medicines': targetPath = '/medicines'; break;
      default: targetPath = role === 'hr' ? '/hr' : '/dashboard'; break;
    }
    if (window.location.pathname !== targetPath) {
      window.history.pushState({}, '', targetPath);
    }
  };
  React.useEffect(() => {
    const handlePopState = () => {
      setActiveTab(getTabFromUrl());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Staff Sub-Category Selector State (Staff, Reception, Doctors, HR)
  const [staffCategory, setStaffCategory] = useState<'staff' | 'reception' | 'doctors' | 'hr'>('staff');

  const parseTimeToMinutes = (timeStr: string) => {
    if (!timeStr) return 0;
    const parts = timeStr.trim().split(' ');
    const timePart = parts[0] || '00:00';
    const ampm = (parts[1] || 'AM').toUpperCase();
    let [hStr, mStr] = timePart.split(':');
    let h = parseInt(hStr, 10) || 0;
    let m = parseInt(mStr, 10) || 0;
    if (ampm === 'PM' && h < 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    return h * 60 + m;
  };

  const calculateDailyHoursFromSlots = (slots: Array<{ loginTime: string; logoutTime: string }>) => {
    let totalMinutes = 0;
    for (const slot of slots) {
      const startMins = parseTimeToMinutes(slot.loginTime);
      let endMins = parseTimeToMinutes(slot.logoutTime);
      if (endMins < startMins) {
        endMins += 24 * 60;
      }
      const diff = endMins - startMins;
      if (diff > 0) {
        totalMinutes += diff;
      }
    }
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    if (mins === 0) {
      return `${hours} hrs/day`;
    }
    const dec = (mins / 60).toFixed(1).replace('0.', '');
    return `${hours}.${dec} hrs/day`;
  };

  // Staff Members State & Add/Edit Modal (Instant Offline Cache + Firestore Sync)
  const [staffMembers, setStaffMembers] = useState<any[]>(() => {
    try {
      const cached = localStorage.getItem('sph_cached_staff_members');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return DEFAULT_STAFF_MEMBERS;
  });

  useEffect(() => {
    if (!db) return;
    const staffColRef = collection(db, 'staff');

    const unsubscribe = onSnapshot(staffColRef, (snapshot) => {
      if (!snapshot.empty) {
        const loadedStaff = snapshot.docs.map(docSnap => {
          const d = docSnap.data();
          const cleanName = (d.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          return {
            id: docSnap.id,
            ...d,
            email: d.email || (cleanName ? `${cleanName}@sph.com` : ''),
            password: d.password || 'email123',
            mobile: d.mobile || d.phone || ''
          };
        });
        setStaffMembers(loadedStaff);
        try {
          localStorage.setItem('sph_cached_staff_members', JSON.stringify(loadedStaff));
        } catch (e) {}
      }
    }, (error) => {
      console.warn('Firestore staff listener error:', error);
    });

    return () => unsubscribe();
  }, []);

  const [showAddStaffModal, setShowAddStaffModal] = useState(false);
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);

  const hoursList = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
  const minutesList = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

  const parseTimeComponents = (timeStr: string) => {
    if (!timeStr) return { hour: '09', minute: '00', ampm: 'AM' };
    const parts = timeStr.trim().split(' ');
    const timePart = parts[0] || '09:00';
    const ampm = (parts[1] || 'AM').toUpperCase();
    let [hStr, mStr] = timePart.split(':');
    let h = parseInt(hStr, 10);
    if (isNaN(h)) h = 9;
    if (h > 12) h = h % 12;
    if (h === 0) h = 12;
    const hour = h < 10 ? `0${h}` : `${h}`;
    const minute = mStr ? (mStr.length === 1 ? `0${mStr}` : mStr) : '00';
    return { hour, minute, ampm: ampm === 'PM' ? 'PM' : 'AM' };
  };

  const handleSlotTimeComponentChange = (
    index: number,
    slotField: 'loginTime' | 'logoutTime',
    component: 'hour' | 'minute' | 'ampm',
    value: string
  ) => {
    setStaffFormSlots(prev => prev.map((slot, i) => {
      if (i !== index) return slot;
      const comp = parseTimeComponents(slot[slotField]);
      comp[component] = value;
      return { ...slot, [slotField]: `${comp.hour}:${comp.minute} ${comp.ampm}` };
    }));
  };

  const [staffFormRole, setStaffFormRole] = useState('Regular Staff');
  const [staffFormName, setStaffFormName] = useState('');
  const [staffFormEmail, setStaffFormEmail] = useState('');
  const [staffFormPassword, setStaffFormPassword] = useState('email123');
  const [showStaffPassword, setShowStaffPassword] = useState(false);
  const [staffFormMobile, setStaffFormMobile] = useState('');
  const [staffFormBranch, setStaffFormBranch] = useState('');
  const [staffFormSalary, setStaffFormSalary] = useState('');
  const [staffFormShiftType, setStaffFormShiftType] = useState<'Single Strict' | 'Multi Strict'>('Single Strict');
  const [staffFormSlots, setStaffFormSlots] = useState<Array<{ loginTime: string; logoutTime: string }>>([
    { loginTime: '09:00 AM', logoutTime: '06:00 PM' }
  ]);

  const handleOpenAddStaffModal = () => {
    setEditingStaffId(null);
    setStaffFormRole('Regular Staff');
    setStaffFormName('');
    setStaffFormEmail('');
    setStaffFormPassword('email123');
    setShowStaffPassword(false);
    setStaffFormMobile('');
    setStaffFormBranch('');
    setStaffFormSalary('');
    setStaffFormShiftType('Single Strict');
    setStaffFormSlots([{ loginTime: '09:00 AM', logoutTime: '06:00 PM' }]);
    setShowAddStaffModal(true);
  };

  const handleOpenEditStaffModal = (s: typeof staffMembers[0]) => {
    setEditingStaffId(s.id);
    setStaffFormRole(s.role || 'Regular Staff');
    setStaffFormName(s.name);
    const cleanName = (s.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    setStaffFormEmail((s as any).email || (cleanName ? `${cleanName}@sph.com` : ''));
    setStaffFormPassword((s as any).password || 'email123');
    setShowStaffPassword(false);
    setStaffFormMobile(s.mobile || (s as any).phone || '');
    setStaffFormBranch(s.branch);
    setStaffFormSalary(s.salary ? s.salary.replace(/[^0-9]/g, '') : '');
    const currentShiftType = (s.shiftType as any) || 'Single Strict';
    setStaffFormShiftType(currentShiftType);

    const parsedSlots = s.shift ? s.shift.split('|').map((str: string) => {
      const parts = str.trim().split('-');
      return {
        loginTime: parts[0] ? parts[0].trim() : '09:00 AM',
        logoutTime: parts[1] ? parts[1].trim() : '06:00 PM'
      };
    }) : [{ loginTime: '09:00 AM', logoutTime: '06:00 PM' }];

    setStaffFormSlots(parsedSlots);
    setShowAddStaffModal(true);
  };

  const handleSaveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffFormName || !staffFormBranch) {
      alert('Please enter Full Name and select a Branch.');
      return;
    }
    const formattedSalary = staffFormSalary ? `₹${parseInt(staffFormSalary).toLocaleString('en-IN')}` : '₹0';
    const shiftText = staffFormSlots.map(slot => `${slot.loginTime} - ${slot.logoutTime}`).join(' | ');
    const calculatedHours = calculateDailyHoursFromSlots(staffFormSlots);

    const staffDataToSave = {
      name: staffFormName,
      role: staffFormRole,
      branch: staffFormBranch,
      email: staffFormEmail.trim().toLowerCase() || (staffFormName.toLowerCase().replace(/[^a-z0-9]/g, '') + '@sph.com'),
      password: staffFormPassword.trim() || 'email123',
      mobile: staffFormMobile,
      phone: staffFormMobile,
      salary: formattedSalary,
      shiftType: staffFormShiftType,
      loginTime: staffFormSlots[0]?.loginTime || '09:00 AM',
      logoutTime: staffFormSlots[0]?.logoutTime || '06:00 PM',
      shift: shiftText,
      hours: calculatedHours
    };

    if (editingStaffId) {
      setStaffMembers(prev => {
        const updated = prev.map(s => s.id === editingStaffId ? { id: editingStaffId, ...staffDataToSave } : s);
        try { localStorage.setItem('sph_cached_staff_members', JSON.stringify(updated)); } catch (e) {}
        return updated;
      });
      if (db) {
        try {
          await setDoc(doc(db, 'staff', editingStaffId), staffDataToSave, { merge: true });
        } catch (err) {
          console.warn('Firestore update staff error:', err);
        }
      }
    } else {
      const newId = Date.now().toString();
      const newStaff = { id: newId, ...staffDataToSave };
      setStaffMembers(prev => {
        const updated = [newStaff, ...prev];
        try { localStorage.setItem('sph_cached_staff_members', JSON.stringify(updated)); } catch (e) {}
        return updated;
      });
      if (db) {
        try {
          await setDoc(doc(db, 'staff', newId), newStaff);
        } catch (err) {
          console.warn('Firestore add staff error:', err);
        }
      }
    }
    setShowAddStaffModal(false);
  };

  const handleDeleteStaff = async (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete staff member "${name}"?`)) {
      setStaffMembers(prev => {
        const updated = prev.filter(s => s.id !== id);
        try { localStorage.setItem('sph_cached_staff_members', JSON.stringify(updated)); } catch (e) {}
        return updated;
      });
      if (db) {
        try {
          await deleteDoc(doc(db, 'staff', id));
        } catch (err) {
          console.warn('Firestore delete staff error:', err);
        }
      }
    }
  };

  // Doctors State & Add/Edit Doctor Modal
  const DEFAULT_DOCTORS_SEED = [
    { id: 'doc-1', name: 'Dr. Prashanth k vaidya', role: 'Doctor', category: 'Head Doctor', mobile: '8125260176', shiftType: 'Single Strict', loginTime: '-', logoutTime: '-', shift: '-', hours: '-', salary: '-' },
    { id: 'doc-2', name: 'Dr. Jobeadh parveej', role: 'Doctor', category: 'Head Doctor', mobile: '9903119766', shiftType: 'Single Strict', loginTime: '-', logoutTime: '-', shift: '-', hours: '-', salary: '-' },
    { id: 'doc-3', name: 'Dr. Padma priya', role: 'Doctor', category: 'Employee Doctor', mobile: '9490808582', shiftType: 'Single Strict', loginTime: '10:00 AM', logoutTime: '08:00 PM', shift: '10:00 AM - 08:00 PM', hours: '10 hrs/day', salary: '₹95,000' },
    { id: 'doc-4', name: 'Dr. Ramakrishna Chanduri', role: 'Doctor', category: 'Head Doctor', mobile: '1111111111', shiftType: 'Single Strict', loginTime: '-', logoutTime: '-', shift: '-', hours: '-', salary: '-' },
  ];

  const [doctorsMembers, setDoctorsMembers] = useState(DEFAULT_DOCTORS_SEED);

  useEffect(() => {
    if (!db) return;
    const docColRef = collection(db, 'doctors');

    const unsubscribe = onSnapshot(docColRef, async (snapshot) => {
      if (snapshot.empty) {
        for (const item of DEFAULT_DOCTORS_SEED) {
          try {
            await setDoc(doc(db, 'doctors', item.id), item);
          } catch (e) {
            console.warn('Seed doctor error:', e);
          }
        }
      } else {
        const loadedDocs = snapshot.docs.map(docSnap => {
          const data = docSnap.data();
          const category = data.category || (data.role?.includes('Employee') ? 'Employee Doctor' : 'Head Doctor');
          const isHead = category === 'Head Doctor';
          return {
            id: docSnap.id,
            name: data.name || data.doctorName || 'Doctor',
            role: data.role || 'Doctor',
            category: category,
            mobile: data.mobile || data.phone || '',
            shiftType: isHead ? 'Single Strict' : (data.shiftType || 'Single Strict'),
            loginTime: isHead ? '-' : (data.loginTime || '-'),
            logoutTime: isHead ? '-' : (data.logoutTime || '-'),
            shift: isHead ? '-' : (data.shift || '-'),
            hours: isHead ? '-' : (data.hours || '-'),
            salary: isHead ? '-' : (data.salary || '-')
          };
        });
        setDoctorsMembers(loadedDocs);
      }
    }, (error) => {
      console.warn('Firestore doctors listener error:', error);
    });

    return () => unsubscribe();
  }, []);

  const [showAddDoctorModal, setShowAddDoctorModal] = useState(false);
  const [editingDoctorId, setEditingDoctorId] = useState<string | null>(null);

  const [doctorFormCategory, setDoctorFormCategory] = useState<'Head Doctor' | 'Employee Doctor'>('Head Doctor');
  const [doctorFormName, setDoctorFormName] = useState('');
  const [doctorFormMobile, setDoctorFormMobile] = useState('');
  const [doctorFormSalary, setDoctorFormSalary] = useState('');
  const [doctorFormShiftType, setDoctorFormShiftType] = useState<'Single Strict' | 'Multi Strict'>('Single Strict');
  const [doctorFormSlots, setDoctorFormSlots] = useState<Array<{ loginTime: string; logoutTime: string }>>([
    { loginTime: '09:00 AM', logoutTime: '06:00 PM' }
  ]);

  const handleSlotDoctorTimeChange = (
    index: number,
    slotField: 'loginTime' | 'logoutTime',
    component: 'hour' | 'minute' | 'ampm',
    value: string
  ) => {
    setDoctorFormSlots(prev => prev.map((slot, i) => {
      if (i !== index) return slot;
      const comp = parseTimeComponents(slot[slotField]);
      comp[component] = value;
      return { ...slot, [slotField]: `${comp.hour}:${comp.minute} ${comp.ampm}` };
    }));
  };

  const handleOpenAddDoctorModal = () => {
    setEditingDoctorId(null);
    setDoctorFormCategory('Head Doctor');
    setDoctorFormName('');
    setDoctorFormMobile('');
    setDoctorFormSalary('');
    setDoctorFormShiftType('Single Strict');
    setDoctorFormSlots([{ loginTime: '09:00 AM', logoutTime: '06:00 PM' }]);
    setShowAddDoctorModal(true);
  };

  const handleOpenEditDoctorModal = (d: typeof doctorsMembers[0]) => {
    setEditingDoctorId(d.id);
    setDoctorFormCategory((d.category as any) || (d.role.includes('Employee') ? 'Employee Doctor' : 'Head Doctor'));
    setDoctorFormName(d.name);
    setDoctorFormMobile(d.mobile || '');
    setDoctorFormSalary(d.salary && d.salary !== '-' ? d.salary.replace(/[^0-9]/g, '') : '');
    const currentShiftType = (d.shiftType as any) || 'Single Strict';
    setDoctorFormShiftType(currentShiftType);

    const parsedSlots = d.shift ? d.shift.split('|').map(str => {
      const parts = str.trim().split('-');
      return {
        loginTime: parts[0] ? parts[0].trim() : '09:00 AM',
        logoutTime: parts[1] ? parts[1].trim() : '06:00 PM'
      };
    }) : [{ loginTime: '09:00 AM', logoutTime: '06:00 PM' }];

    setDoctorFormSlots(parsedSlots);
    setShowAddDoctorModal(true);
  };

  const handleSaveDoctor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!doctorFormName) {
      alert('Please enter Doctor Full Name.');
      return;
    }
    const isHeadDoctor = doctorFormCategory === 'Head Doctor';
    const formattedSalary = isHeadDoctor
      ? '-'
      : (doctorFormSalary ? `₹${parseInt(doctorFormSalary).toLocaleString('en-IN')}` : '₹0');

    const shiftText = isHeadDoctor
      ? '-'
      : doctorFormSlots.map(slot => `${slot.loginTime} - ${slot.logoutTime}`).join(' | ');
    const calculatedHours = isHeadDoctor
      ? '-'
      : calculateDailyHoursFromSlots(doctorFormSlots);

    const doctorDataToSave = {
      name: doctorFormName.startsWith('Dr.') ? doctorFormName : `Dr. ${doctorFormName}`,
      role: 'Doctor',
      category: doctorFormCategory,
      mobile: doctorFormMobile,
      salary: formattedSalary,
      shiftType: isHeadDoctor ? 'Single Strict' : doctorFormShiftType,
      loginTime: isHeadDoctor ? '-' : (doctorFormSlots[0]?.loginTime || '09:00 AM'),
      logoutTime: isHeadDoctor ? '-' : (doctorFormSlots[0]?.logoutTime || '06:00 PM'),
      shift: shiftText,
      hours: calculatedHours
    };

    if (editingDoctorId) {
      setDoctorsMembers(prev => prev.map(d => d.id === editingDoctorId ? { id: editingDoctorId, ...doctorDataToSave } : d));
      if (db) {
        try {
          await setDoc(doc(db, 'doctors', editingDoctorId), doctorDataToSave, { merge: true });
        } catch (err) {
          console.warn('Firestore update doctor error:', err);
        }
      }
    } else {
      const newId = `doc-${Date.now()}`;
      const newDoctor = { id: newId, ...doctorDataToSave };
      setDoctorsMembers(prev => [newDoctor, ...prev]);
      if (db) {
        try {
          await setDoc(doc(db, 'doctors', newId), newDoctor);
        } catch (err) {
          console.warn('Firestore add doctor error:', err);
        }
      }
    }
    setShowAddDoctorModal(false);
  };

  const handleDeleteDoctor = async (id: string, name: string) => {
    if (confirm(`Are you sure you want to remove ${name} from doctors list?`)) {
      setDoctorsMembers(prev => prev.filter(d => d.id !== id));
      if (db) {
        try {
          await deleteDoc(doc(db, 'doctors', id));
        } catch (err) {
          console.warn('Firestore delete doctor error:', err);
        }
      }
    }
  };

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBranchFilter, setSelectedBranchFilter] = useState('All');

  // Medicine Edit Form state
  const [remedyName, setRemedyName] = useState('');
  const [remedyPotency, setRemedyPotency] = useState('200C');
  const [remedyCategory, setRemedyCategory] = useState('Chronic');
  const [remedyStock, setRemedyStock] = useState('150');
  const [medicineSavedMsg, setMedicineSavedMsg] = useState(false);

  // Mock Branch Targets Data
  const [branchesList, setBranchesList] = useState([
    { id: 'kphb', name: 'KPHB Branch', phone: '+91 90301 76176', target: '₹12,00,000', achieved: '₹9,80,000', patients: 340, status: 'Active' },
    { id: 'nallagandla', name: 'Nallagandla Branch', phone: '+91 91321 76176', target: '₹10,00,000', achieved: '₹8,40,000', patients: 280, status: 'Active' },
    { id: 'dilshuknagar', name: 'Dilshuknagar Branch', phone: '+91 98041 76176', target: '₹14,00,000', achieved: '₹11,50,000', patients: 410, status: 'Active' },
    { id: 'chandanagar', name: 'Chandanagar Branch', phone: '+91 95531 76176', target: '₹9,00,000', achieved: '₹7,20,000', patients: 220, status: 'Active' },
  ]);

  // Global Patients Sample Data
  const globalPatientsList = [
    { id: 'PAT-101', name: 'Rajesh Kumar', phone: '+91 98490 12345', branch: 'KPHB Branch', package: 'Platinum Annual Wellness', source: 'Instagram', status: 'Active' },
    { id: 'PAT-102', name: 'Sneha Reddy', phone: '+91 91210 67890', branch: 'Nallagandla Branch', package: 'Classical Homeo Care', source: 'Google', status: 'Active' },
    { id: 'PAT-103', name: 'Venkatesh Rao', phone: '+91 94400 45678', branch: 'Dilshuknagar Branch', package: 'Pediatric Care Plan', source: 'Website', status: 'Active' },
    { id: 'PAT-104', name: 'Ananya Sharma', phone: '+91 99887 11223', branch: 'Chandanagar Branch', package: 'Chronic Skin Treatment', source: 'Referral', status: 'Active' },
  ];

  // Doctors & Timings Data
  const doctorsList = [
    { id: 'DOC-1', name: 'Dr. Prashanth k vaidya', phone: '8125260176', role: 'Head Doctor', timings: '10:00 AM - 02:00 PM (KPHB) / 03:00 PM - 08:30 PM (Chandanagar)' },
    { id: 'DOC-2', name: 'Dr. Jobeadh parveej', phone: '9903119766', role: 'Head Doctor', timings: '10:00 AM - 02:00 PM (Nallagandla) / 05:00 PM - 08:30 PM (KPHB)' },
    { id: 'DOC-3', name: 'Dr. Padma priya', phone: '9490808582', role: 'Employee Doctor', timings: '10:00 AM - 08:00 PM (General Consultation)' },
    { id: 'DOC-4', name: 'Dr. Ramakrishna Chanduri', phone: '1111111111', role: 'Head Doctor', timings: '10:00 AM - 02:00 PM (Dilshuknagar) / 05:00 PM - 09:00 PM (Nallagandla)' },
  ];

  // Staff Working Hours Data
  const staffList = [
    { id: 'STF-1', name: 'Anil Kumar M', role: 'Regular Staff', branch: 'KPHB', hours: '8.5 Hours/Day', shift: '10:00 AM - 08:30 PM', salary: '₹22,000' },
    { id: 'STF-2', name: 'Ashwini Begari', role: 'Regular Staff', branch: 'Chandanagar', hours: '8.0 Hours/Day', shift: '10:00 AM - 08:00 PM', salary: '₹17,000' },
    { id: 'STF-3', name: 'Vaishnavi Peri', role: 'Regular Staff', branch: 'Nallagandla', hours: '8.5 Hours/Day', shift: '10:00 AM - 08:30 PM', salary: '₹17,000' },
    { id: 'STF-4', name: 'Nandini Gottelli', role: 'Regular Staff', branch: 'Dilshuknagar', hours: '8.5 Hours/Day', shift: '10:00 AM - 08:30 PM', salary: '₹15,000' },
    { id: 'STF-7', name: 'Aishwarya . M', role: 'Regular Staff', branch: 'KPHB', hours: '10.5 Hours/Day', shift: '10:00 AM - 08:30 PM', salary: '₹14,000' },
  ];

  const handleSaveMedicine = (e: React.FormEvent) => {
    e.preventDefault();
    if (!remedyName) return;
    setMedicineSavedMsg(true);
    setTimeout(() => setMedicineSavedMsg(false), 3000);
    setRemedyName('');
  };

  // Four Branches Configuration
  const FOUR_BRANCHES = [
    { id: 'kphb', name: 'KPHB Branch', phone: '+91 90301 76176', activePatients: 340, monthlyTarget: 0, targetDocId: 'XRrXPAWzn4fKiwT387PKBLQZg323' },
    { id: 'nallagandla', name: 'Nallagandla Branch', phone: '+91 91321 76176', activePatients: 280, monthlyTarget: 0, targetDocId: '1qj75oZZlWgN8P02OAeRNjCVMhM2' },
    { id: 'dilshuknagar', name: 'Dilshuknagar Branch', phone: '+91 98041 76176', activePatients: 410, monthlyTarget: 0, targetDocId: 't7BiooFMRDU7DcgKFGnAPnJY0Qq2' },
    { id: 'chandanagar', name: 'Chandanagar Branch', phone: '+91 95531 76176', activePatients: 220, monthlyTarget: 0, targetDocId: 'xS0281lEdPc0hUFrrNRPBMeQZsD3' }
  ];

  // Daily Operations Date (Defaults to Today's date YYYY-MM-DD)
  const [dailyOpsDate, setDailyOpsDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [liveAppointments, setLiveAppointments] = useState<any[]>([]);
  const [selectedBranchModal, setSelectedBranchModal] = useState<any | null>(null);
  const [branchPatientFilter, setBranchPatientFilter] = useState<'all' | 'opted' | 'not_opted'>('all');

  const normalizeToYMD = (raw: any): string => {
    if (!raw) return '';
    let val = raw;
    if (typeof val === 'object') {
      if (typeof val.toDate === 'function') {
        val = val.toDate();
      } else if (typeof val.seconds === 'number') {
        val = new Date(val.seconds * 1000);
      }
    }
    if (val instanceof Date) {
      if (!isNaN(val.getTime())) {
        const y = val.getFullYear();
        const m = String(val.getMonth() + 1).padStart(2, '0');
        const d = String(val.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
      return '';
    }
    const str = String(val).trim();
    if (!str || str === '[object Object]') return '';

    // Match YYYY-MM-DD or YYYY/MM/DD
    const isoMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (isoMatch) {
      return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
    }
    // Match DD/MM/YYYY or DD-MM-YYYY (e.g. 09/09/2026, 12:48:04)
    const ddmmyyyyMatch = str.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
    if (ddmmyyyyMatch) {
      return `${ddmmyyyyMatch[3]}-${ddmmyyyyMatch[2].padStart(2, '0')}-${ddmmyyyyMatch[1].padStart(2, '0')}`;
    }
    try {
      const d = new Date(str);
      if (!isNaN(d.getTime())) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      }
    } catch (e) { }
    return '';
  };

  const extractRevenue = (a: any): number => {
    if (!a) return 0;
    const candidates = [
      a.paymentAmount,
      a.totalPaid,
      a.paidAmount,
      a.amountPaid,
      a.medicineFeeRequested,
      a.pharmacyFee,
      a.dietFeeAmount,
      a.packageFee,
      a.packageAdvancePaid,
      a.doctorMedicineFee,
      a.collectFee,
      a.totalAmount,
      a.totalFee,
      a.amount,
      a.fee,
      a.targetAmount,
    ];
    for (const c of candidates) {
      if (c !== undefined && c !== null && c !== '') {
        const cleanStr = String(c).replace(/[^0-9.]/g, '');
        const num = Number(cleanStr);
        if (!isNaN(num) && num > 0) return num;
      }
    }
    const sum = (Number(a.consultationFee || 0) + Number(a.medicineFee || 0) + Number(a.dietFee || 0) + Number(a.labFee || 0) + Number(a.pharmacyFee || 0));
    if (sum > 0) return sum;
    return 0;
  };

  useEffect(() => {
    if (!db) return;

    const collectionsToListen = [
      'appointments',
      'allpatients',
      'prescriptions'
    ];

    const unsubs: Array<() => void> = [];
    const rawCollectionsData: Record<string, any[]> = {};

    const mergeAndSet = () => {
      const combinedMap = new Map<string, any>();
      const phoneDateIndex = new Map<string, string>(); // phone_date -> docId
      const regDateIndex = new Map<string, string>();   // reg_date -> docId
      const nameDateIndex = new Map<string, string>();  // name_date -> docId

      const priorityOrder = [
        'appointments',
        'allpatients',
        'prescriptions'
      ];

      for (const colName of priorityOrder) {
        const items = rawCollectionsData[colName] || [];
        for (const item of items) {
          if (!item) continue;
          const id = item.id || item.docId;
          const cleanPhone = String(item.phoneNumber || item.phone || item.mobile || item.contact || '').replace(/\D/g, '').slice(-10);
          const rawReg = String(item.registrationId || item.regId || item.patientId || item.regNo || '').trim().toLowerCase();
          const cleanName = String(item.patientName || item.name || item.fullName || '').trim().toLowerCase();

          const rawDate = item.appointmentDate || item.date || item.visitDate || item.scheduledDate || item.paymentCollectedAt || item.paidAt || item.createdAt || item.updatedAt || item.savedAt || item.invoiceDate;
          const normDate = normalizeToYMD(rawDate);

          const phoneDateKey = cleanPhone && normDate ? `${cleanPhone}_${normDate}` : null;
          const regDateKey = rawReg && normDate ? `${rawReg}_${normDate}` : null;
          const nameDateKey = cleanName.length >= 3 && normDate ? `${cleanName}_${normDate}` : null;

          // Link by appointmentId or doc ID or phone+date or reg+date or name+date
          const linkedApptId = item.appointmentId && combinedMap.has(item.appointmentId) ? item.appointmentId : null;
          const matchedDocId = linkedApptId ||
            (combinedMap.has(id) ? id : null) ||
            (phoneDateKey && phoneDateIndex.has(phoneDateKey) ? phoneDateIndex.get(phoneDateKey) : null) ||
            (regDateKey && regDateIndex.has(regDateKey) ? regDateIndex.get(regDateKey) : null) ||
            (nameDateKey && nameDateIndex.has(nameDateKey) ? nameDateIndex.get(nameDateKey) : null);

          if (matchedDocId && combinedMap.has(matchedDocId)) {
            // Merge into existing record
            const existing = combinedMap.get(matchedDocId);
            const exRev = extractRevenue(existing);
            const newRev = extractRevenue(item);

            const merged = {
              ...item,
              ...existing,
              // Keep non-zero revenue
              paymentAmount: exRev > 0 ? (existing.paymentAmount || exRev) : (item.paymentAmount || newRev),
              totalPaid: exRev > 0 ? (existing.totalPaid || exRev) : (item.totalPaid || newRev),
              paidAmount: exRev > 0 ? (existing.paidAmount || exRev) : (item.paidAmount || newRev),
              amountPaid: exRev > 0 ? (existing.amountPaid || exRev) : (item.amountPaid || newRev),
              medicineFeeRequested: exRev > 0 ? (existing.medicineFeeRequested || exRev) : (item.medicineFeeRequested || newRev),
              pharmacyFee: existing.pharmacyFee || item.pharmacyFee,
              packageFee: exRev > 0 ? (existing.packageFee || exRev) : (item.packageFee || newRev),
              packageAdvancePaid: exRev > 0 ? (existing.packageAdvancePaid || exRev) : (item.packageAdvancePaid || newRev),
              dietFeeAmount: existing.dietFeeAmount || item.dietFeeAmount,
              doctorMedicineFee: existing.doctorMedicineFee || item.doctorMedicineFee,
              collectFee: existing.collectFee || item.collectFee,
              totalAmount: exRev > 0 ? (existing.totalAmount || exRev) : (item.totalAmount || newRev),
              // Keep regId if available (e.g. 863rk/dsnr)
              regId: existing.regId || existing.registrationId || item.regId || item.registrationId,
              registrationId: existing.registrationId || existing.regId || item.registrationId || item.regId,
              // Keep patient name
              patientName: existing.patientName || existing.name || existing.fullName || item.patientName || item.name || item.fullName,
              // Keep phone
              phone: existing.phone || existing.phoneNumber || item.phone || item.phoneNumber,
              phoneNumber: existing.phoneNumber || existing.phone || item.phoneNumber || item.phone,
              // Keep appointment time if available
              appointmentTime: existing.appointmentTime || existing.time || item.appointmentTime || item.time,
              time: existing.time || existing.appointmentTime || item.time || item.appointmentTime,
              // Keep follow-up interval if available
              followUpInterval: (existing.followUpInterval && existing.followUpInterval !== 'No Follow-up')
                ? existing.followUpInterval
                : (item.followUpInterval || existing.followUpInterval),
              followUpOpted: existing.followUpOpted !== undefined ? existing.followUpOpted : item.followUpOpted,
              // Keep branch if available
              branch: existing.branch || existing.branchName || item.branch || item.branchName,
              branchName: existing.branchName || existing.branch || item.branchName || item.branch,
              // Keep doctor
              doctor: existing.doctor || existing.doctorName || item.doctor || item.doctorName,
              doctorName: existing.doctorName || existing.doctor || item.doctorName || item.doctor,
              // Keep payment status
              paymentStatus: (String(existing.paymentStatus || '').toLowerCase() === 'paid' || String(item.paymentStatus || '').toLowerCase() === 'paid' || newRev > 0 || exRev > 0) ? 'paid' : (existing.paymentStatus || item.paymentStatus),
              paymentMode: existing.paymentMode || item.paymentMode,
              // Keep appointment date
              appointmentDate: existing.appointmentDate || existing.date || item.appointmentDate || item.date || normDate,
              date: existing.date || existing.appointmentDate || item.date || item.appointmentDate || normDate,
            };

            combinedMap.set(matchedDocId, merged);
          } else {
            // Add new entry
            const targetId = id || (phoneDateKey ? `entry_${phoneDateKey}` : `entry_${Math.random()}`);
            const entryObj = {
              ...item,
              id: targetId,
              appointmentDate: item.appointmentDate || item.date || normDate,
              date: item.date || item.appointmentDate || normDate
            };
            combinedMap.set(targetId, entryObj);

            if (phoneDateKey) {
              phoneDateIndex.set(phoneDateKey, targetId);
            }
            if (regDateKey) {
              regDateIndex.set(regDateKey, targetId);
            }
            if (nameDateKey) {
              nameDateIndex.set(nameDateKey, targetId);
            }
          }
        }
      }

      setLiveAppointments(Array.from(combinedMap.values()));
    };

    let mergeTimer: any = null;
    const scheduleMerge = () => {
      if (mergeTimer) clearTimeout(mergeTimer);
      mergeTimer = setTimeout(() => {
        mergeAndSet();
      }, 150);
    };

    let isCancelled = false;
    // Defer heavy collections listen by 500ms to allow instant 0ms rendering for Staff and active tabs
    const syncTimer = setTimeout(() => {
      if (isCancelled) return;
      collectionsToListen.forEach((colName) => {
        try {
          const colRef = collection(db, colName);
          const unsub = onSnapshot(colRef, (snap) => {
            if (isCancelled) return;
            rawCollectionsData[colName] = snap.docs.map(d => ({ id: d.id, ...d.data(), _sourceCol: colName }));
            scheduleMerge();
          }, (err) => {
            console.warn(`Firestore listener note for ${colName}:`, err);
          });
          unsubs.push(unsub);
        } catch (e) {
          console.warn(`Firestore setup note for ${colName}:`, e);
        }
      });
    }, 500);

    return () => {
      isCancelled = true;
      clearTimeout(syncTimer);
      if (mergeTimer) clearTimeout(mergeTimer);
      unsubs.forEach(u => u());
    };
  }, []);

  const isFollowUpOpted = (a: any) => {
    const interval = String(a.followUpInterval || a.interval || '').trim().toLowerCase();
    if (interval === 'no follow-up' || interval === 'none' || interval === 'no followup') {
      return false;
    }
    if (a.followUpOpted === false || a.followup === false) {
      return false;
    }
    if (a.followUpOpted === true || a.followup === true) {
      return true;
    }
    if (interval && interval !== 'no follow-up' && interval !== 'none') {
      return true;
    }
    if (a.preferredFollowUpDate || a.followUpDate || a.nextFollowUpDate) {
      return true;
    }
    return false;
  };

  const isMatchingDate = (app: any, targetDate: string): boolean => {
    if (!app || !targetDate) return false;
    const dateFields = [
      app.appointmentDate,
      app.date,
      app.bookingDate,
      app.visitDate,
      app.dateString,
      app.paymentCollectedAt,
      app.paidAt,
      app.createdAt,
      app.updatedAt,
      app.savedAt,
      app.invoiceDate
    ];
    for (const df of dateFields) {
      if (df) {
        const ymd = normalizeToYMD(df);
        if (ymd === targetDate) return true;
      }
    }
    const parts = targetDate.split('-');
    if (parts.length === 3) {
      const [y, m, d] = parts;
      const dInt = parseInt(d, 10);
      const mInt = parseInt(m, 10);
      for (const df of dateFields) {
        if (!df) continue;
        const str = String(df);
        if (
          str.includes(`${d}-${m}-${y}`) ||
          str.includes(`${d}/${m}/${y}`) ||
          str.includes(`${dInt}-${mInt}-${y}`) ||
          str.includes(`${dInt}/${mInt}/${y}`) ||
          str.includes(`${y}/${m}/${d}`)
        ) {
          return true;
        }
      }
    }
    return false;
  };

  const isMatchingBranch = (app: any, branchId: string) => {
    const canonicalTarget = resolveCanonicalBranchId(branchId);
    if (!canonicalTarget) return false;
    const appBranch = resolveCanonicalBranchId(
      app.branchId || app.branch || app.branchName || app.targetBranch || app.clinicBranch || app.regId || app.registrationId
    );
    return appBranch === canonicalTarget;
  };

  const branchDailyStats = FOUR_BRANCHES.map(b => {
    const bApps = liveAppointments.filter(a => isMatchingBranch(a, b.id) && isMatchingDate(a, dailyOpsDate));
    const revenue = bApps.reduce((acc, a) => acc + extractRevenue(a), 0);
    const optedApps = bApps.filter(isFollowUpOpted);
    const notOptedApps = bApps.filter(a => !isFollowUpOpted(a));

    return {
      ...b,
      appointments: bApps,
      appointmentCount: bApps.length,
      revenue,
      optedCount: optedApps.length,
      notOptedCount: notOptedApps.length,
      optedApps,
      notOptedApps
    };
  });

  const totalDayRevenue = branchDailyStats.reduce((sum, b) => sum + b.revenue, 0);
  const totalDayAppointments = branchDailyStats.reduce((sum, b) => sum + b.appointmentCount, 0);
  const totalDayOpted = branchDailyStats.reduce((sum, b) => sum + b.optedCount, 0);
  const totalDayNotOpted = branchDailyStats.reduce((sum, b) => sum + b.notOptedCount, 0);

  const handleShiftOpsDate = (days: number) => {
    const d = new Date(dailyOpsDate);
    d.setDate(d.getDate() + days);
    setDailyOpsDate(d.toISOString().split('T')[0]);
  };

  // Leave Requests State (Connected to Firestore)
  const [leaveRequests, setLeaveRequests] = useState<any[]>([]);

  const resolveBranchName = (l: any) => {
    const canonical = resolveCanonicalBranchId(l.branchId || l.branch || l.branchName);
    if (canonical && BRANCHES[canonical]) return BRANCHES[canonical].name;
    if (l.branch && typeof l.branch === 'string' && l.branch.trim()) return l.branch;
    if (l.branchName && typeof l.branchName === 'string' && l.branchName.trim()) return l.branchName;
    return 'Main Branch';
  };

  const resolveApplicantName = (l: any) => {
    return l.staffName || l.applicant || l.name || 'Staff Member';
  };

  const resolveRoleName = (l: any) => {
    if (l.staffRole) return l.staffRole === 'staff' ? 'Regular Staff' : l.staffRole;
    if (l.role) return l.role;
    return 'Regular Staff';
  };

  const resolvePeriod = (l: any) => {
    const start = l.fromDate || l.startDate || l.from || '';
    const end = l.toDate || l.endDate || l.to || '';
    if (start && end) {
      if (start === end) return start;
      return `${start} → ${end}`;
    }
    return start || end || '-';
  };

  const resolveDuration = (l: any) => {
    if (l.daysCount) return `${l.daysCount} Day${Number(l.daysCount) > 1 ? 's' : ''}`;
    if (l.days) return `${l.days} Day${Number(l.days) > 1 ? 's' : ''}`;
    if (l.leaveType === 'Half Day') return '0.5 Day';
    if (l.leaveType === '1 Hour Permission') return '1 Hour';
    const start = l.fromDate || l.startDate || l.from;
    const end = l.toDate || l.endDate || l.to;
    if (!start) return '1 Day';
    if (start === end) return '1 Day';
    try {
      const parseD = (dStr: string) => {
        if (dStr.includes('/')) {
          const [d, m, y] = dStr.split('/').map(Number);
          return new Date(y, m - 1, d);
        }
        if (dStr.includes('-')) {
          const parts = dStr.split('-');
          if (parts.length === 3 && parts[0].length <= 2) {
            return new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
          }
        }
        return new Date(dStr);
      };
      const d1 = parseD(start);
      const d2 = parseD(end);
      const diffMs = d2.getTime() - d1.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;
      if (diffDays > 0) return `${diffDays} Day${diffDays > 1 ? 's' : ''}`;
    } catch (e) { }
    return '1 Day';
  };

  const normalizeStatus = (status?: string) => {
    if (!status) return 'Pending';
    const s = status.toLowerCase();
    if (s === 'approved') return 'Approved';
    if (s === 'rejected') return 'Rejected';
    return 'Pending';
  };

  useEffect(() => {
    if (!db) return;
    // Primary collection where Staff submits leave applications
    const leavesRef = collection(db, 'leaves');
    const unsub = onSnapshot(leavesRef, (snap) => {
      const validDocs: any[] = [];
      snap.forEach(d => {
        validDocs.push({ id: d.id, _collection: 'leaves', ...d.data() });
      });

      // Sort by creation time descending
      validDocs.sort((a, b) => {
        const tA = new Date(a.createdAt || 0).getTime();
        const tB = new Date(b.createdAt || 0).getTime();
        return tB - tA;
      });

      setLeaveRequests(validDocs);
    }, (err) => console.warn('Firestore leaves listener error:', err));

    return () => unsub();
  }, []);

  const [leaveStatusFilter, setLeaveStatusFilter] = useState<'All' | 'Pending' | 'Approved' | 'Rejected'>('All');

  const handleUpdateLeaveStatus = async (id: string, newStatus: 'Approved' | 'Rejected', colName: string = 'leaves') => {
    try {
      if (db) {
        await updateDoc(doc(db, colName, id), {
          status: newStatus,
          reviewedAt: new Date().toISOString(),
          reviewedBy: role === 'hr' ? 'HR Management' : 'Admin Management'
        });
        alert(`Leave Application successfully marked as ${newStatus}!`);
      }
    } catch (e) {
      console.error('Error updating leave status in Firestore:', e);
      try {
        const altCol = colName === 'leaves' ? 'leave_requests' : 'leaves';
        await updateDoc(doc(db!, altCol, id), {
          status: newStatus,
          reviewedAt: new Date().toISOString(),
          reviewedBy: role === 'hr' ? 'HR Management' : 'Admin Management'
        });
        alert(`Leave Application successfully marked as ${newStatus}!`);
      } catch (err2) {
        alert('Failed to update leave status. Please try again.');
      }
    }
  };
  const pendingLeaveCount = leaveRequests.filter(r => normalizeStatus(r.status) === 'Pending').length;

  const [pendingCleaningCount, setPendingCleaningCount] = useState(0);
  useEffect(() => {
    if (!db) return;
    const unsubCleaning = onSnapshot(collection(db, 'branch_cleaning_submissions'), (snap) => {
      const pCount = snap.docs.filter(d => d.data()?.status === 'Pending').length;
      setPendingCleaningCount(pCount);
    }, (err) => console.warn('Cleaning submissions count listener error:', err));
    return () => unsubCleaning();
  }, []);

  // Fee / Discount Requests State (Connected to Firestore)
  const [feeRequests, setFeeRequests] = useState<any[]>([]);
  const [feeStatusFilter, setFeeStatusFilter] = useState<'All' | 'Pending' | 'Approved' | 'Rejected'>('All');

  useEffect(() => {
    if (!db) return;
    const feeColRef = collection(db, 'fee_requests');
    const unsub = onSnapshot(feeColRef, (snap) => {
      const validDocs: any[] = [];
      snap.forEach(d => {
        validDocs.push({ id: d.id, ...d.data() });
      });

      validDocs.sort((a, b) => {
        const tA = new Date(a.createdAt || a.requestedAt || 0).getTime();
        const tB = new Date(b.createdAt || b.requestedAt || 0).getTime();
        return tB - tA;
      });

      setFeeRequests(validDocs);
    }, (err) => console.warn('Firestore fee_requests listener error:', err));

    return () => unsub();
  }, []);

  const normalizeFeeStatus = (status?: string) => {
    if (!status) return 'Pending';
    const s = String(status).toLowerCase();
    if (s === 'approved') return 'Approved';
    if (s === 'rejected') return 'Rejected';
    return 'Pending';
  };

  const handleUpdateFeeRequestStatus = async (id: string, newStatus: 'Approved' | 'Rejected', req: any) => {
    try {
      if (!db) return;
      const nowIso = new Date().toISOString();
      const reviewer = role === 'hr' ? 'HR Management' : 'Admin Management';
      let rejectNote = '';
      if (newStatus === 'Rejected') {
        const inputNote = window.prompt('Enter reason for rejecting discount (optional):', 'Discount request not approved by HR');
        if (inputNote === null) return;
        rejectNote = inputNote.trim();
      }

      const updateData: any = {
        status: newStatus.toLowerCase(),
        reviewedAt: nowIso,
        reviewedBy: reviewer
      };
      if (newStatus === 'Approved') {
        updateData.approvedDiscount = Number(req.requestedDiscount || 0);
      } else {
        updateData.rejectReason = rejectNote || 'Discount request not approved by HR';
      }

      await updateDoc(doc(db, 'fee_requests', id), updateData);

      // Dual-sync to appointment doc if appointmentId is present
      if (req.appointmentId) {
        const appPayload: any = {
          discountRequestStatus: newStatus.toLowerCase(),
          updatedAt: nowIso
        };
        if (newStatus === 'Approved') {
          appPayload.discount = Number(req.requestedDiscount || 0);
          appPayload.discountInput = Number(req.requestedDiscount || 0);
          appPayload.approvedDiscount = Number(req.requestedDiscount || 0);
        } else {
          appPayload.discount = 0;
          appPayload.discountInput = 0;
          appPayload.hrRejectReason = updateData.rejectReason;
        }
        await updateDoc(doc(db, 'appointments', req.appointmentId), appPayload).catch(() => {});
        await updateDoc(doc(db, 'allpatients', req.appointmentId), appPayload).catch(() => {});
        await updateDoc(doc(db, 'patients', req.appointmentId), appPayload).catch(() => {});
      }

      // Send Push & In-App Notification to Reception & Admin
      createFeeDiscountResponseNotificationInFirestore({
        patientName: req.patientName || 'Patient',
        branch: req.branch || 'Main Branch',
        status: newStatus,
        discountAmount: Number(req.requestedDiscount || 0),
        rejectReason: rejectNote,
        reviewedBy: reviewer,
        appointmentId: req.appointmentId || id
      }).catch(() => {});

      alert(`Fee Discount Request successfully marked as ${newStatus}!`);
    } catch (e) {
      console.error('Error updating fee request status in Firestore:', e);
      alert('Failed to update fee request status. Please try again.');
    }
  };

  const pendingFeeCount = feeRequests.filter(r => normalizeFeeStatus(r.status) === 'Pending').length;

  const adminMenuItems = [
    { id: 'overview', label: role === 'hr' ? 'HR Dashboard' : 'Admin Dashboard', icon: PieChart },
    { id: 'follow_ups', label: 'All Follow-Ups', icon: Calendar },
    { id: 'leave_requests', label: 'Leave Requests', icon: Calendar, badge: pendingLeaveCount > 0 ? pendingLeaveCount : undefined },
    { id: 'branch_cleaning', label: 'Branch Cleaning & Sanitation', icon: Sparkles, badge: pendingCleaningCount > 0 ? pendingCleaningCount : undefined },
    { id: 'fee_requests', label: 'Fee Requests', icon: FileText, badge: pendingFeeCount > 0 ? pendingFeeCount : undefined },
    { id: 'employee_attendance', label: 'Employee Attendance Report', icon: UserCheck },
    { id: 'employee_works', label: 'Employee Daily Works', icon: FileText },
    { id: 'package_members', label: 'Package Members', icon: Package },
    { id: 'patients', label: 'Global Patients List', icon: Users },
    { id: 'banners', label: 'Manage Banners', icon: Image },
    { id: 'reports_analytics', label: 'Reports & Analytics', icon: BarChart3 },
    { id: 'finance', label: 'Total Revenue & Analytics', icon: DollarSign },
    { id: 'pending_payments', label: 'Pending Payments', icon: AlertCircle },
    { id: 'branches', label: 'Manage Branches & Targets', icon: Building2 },
    { id: 'doctors', label: 'Doctor Timings', icon: Clock },
    { id: 'staff', label: 'Staff Management', icon: UserCheck },
    { id: 'medicines', label: 'Edit Medicine Inventory', icon: Pill },
  ];
  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 67px)', background: '#f8fafc' }}>
      {/* Admin Left Side Navigation matching ReceptionSidebar design */}
      <aside style={{
        width: isNavCollapsed ? '64px' : '200px',
        minWidth: isNavCollapsed ? '64px' : '200px',
        background: '#ffffff',
        borderRight: '1px solid #e2e8f0',
        position: 'fixed',
        top: '67px',
        bottom: 0,
        left: 0,
        padding: isNavCollapsed ? '14px 6px' : '14px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: '3px',
        overflowY: 'auto',
        overflowX: 'hidden',
        zIndex: 40,
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: isNavCollapsed ? 'center' : 'space-between',
          padding: '0 4px 8px 4px',
          marginBottom: '6px',
          borderBottom: '1px solid #f1f5f9'
        }}>
          {!isNavCollapsed && (
            <h3 style={{ fontSize: '10px !important', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.6px', margin: 0 }}>
              {role === 'hr' ? 'HR Management Menu' : 'Admin Control Menu'}
            </h3>
          )}
          <button
            onClick={() => setIsNavCollapsed(!isNavCollapsed)}
            title={isNavCollapsed ? "Expand Sidebar (Open)" : "Collapse Sidebar (Close)"}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '26px',
              height: '26px',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              background: '#f8fafc',
              color: '#0284c7',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
            }}
          >
            {isNavCollapsed ? <ChevronRight size={16} color="#0284c7" /> : <ChevronLeft size={16} color="#0284c7" />}
          </button>
        </div>
        {adminMenuItems.map((item: any) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleTabChange(item.id as any)}
              title={isNavCollapsed ? item.label : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: isNavCollapsed ? 'center' : 'space-between',
                width: '100%',
                padding: isNavCollapsed ? '9px 0' : '7px 10px',
                borderRadius: '8px',
                border: isActive ? '1px solid rgba(37, 142, 200, 0.3)' : '1px solid transparent',
                background: isActive ? 'rgba(37, 142, 200, 0.1)' : 'transparent',
                color: isActive ? '#258ec8' : '#475569',
                fontWeight: isActive ? 700 : 500,
                fontSize: '11.5px !important',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                textAlign: 'left'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: isNavCollapsed ? 'center' : 'flex-start' }}>
                <Icon size={16} color={isActive ? '#258ec8' : '#64748b'} />
                {!isNavCollapsed && <span>{item.label}</span>}
              </div>
              {!isNavCollapsed && item.badge !== undefined && item.badge > 0 && (
                <span style={{
                  background: '#ef4444',
                  color: '#ffffff',
                  fontSize: '10px !important',
                  fontWeight: 800,
                  padding: '1px 6px',
                  borderRadius: '10px'
                }}>
                  {item.badge}
                </span>
              )}
              {!isNavCollapsed && isActive && (!item.badge || item.badge === 0) && <ChevronRight size={13} color="#258ec8" />}
            </button>
          );
        })}
      </aside>
      {/* Main Content Area matching ReceptionLayout */}
      <div style={{
        flex: 1,
        padding: '24px',
        marginLeft: isNavCollapsed ? '64px' : '200px',
        transition: 'margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        minWidth: 0
      }}>
        {/* TAB 1: OVERVIEW DASHBOARD - 4 BRANCHES DAILY OPERATIONS */}
        {activeTab === 'overview' && (
          <div>
            {/* DATE CONTROLS & HEADER BAR */}
            <div style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '18px',
              padding: '16px 20px',
              marginBottom: '20px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '14px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ background: '#eff6ff', color: '#258ec8', padding: '3px 8px', borderRadius: '6px', fontSize: '11px !important', fontWeight: 800 }}>
                    4 CLINIC BRANCHES
                  </span>
                  <h2 style={{ fontSize: '17px !important', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                    Daily Operations & Patient Follow-Ups
                  </h2>
                </div>
                <p style={{ fontSize: '12px !important', color: '#64748b', margin: '4px 0 0 0' }}>
                  Real-time revenue, appointments, and follow-up status across KPHB, Nallagandla, Dilshuknagar, and Chandanagar.
                </p>
              </div>
              {/* DATE SELECTOR TOOLS */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => handleShiftOpsDate(-1)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#475569',
                    fontSize: '12px !important',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  ◀ Prev
                </button>

                <input
                  type="date"
                  value={dailyOpsDate}
                  onChange={(e) => e.target.value && setDailyOpsDate(e.target.value)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '8px',
                    border: '1px solid #258ec8',
                    background: '#f0f9ff',
                    color: '#0369a1',
                    fontSize: '12.5px !important',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                />

                <button
                  onClick={() => handleShiftOpsDate(1)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#475569',
                    fontSize: '12px !important',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Next ▶
                </button>

                <button
                  onClick={() => setDailyOpsDate(new Date().toISOString().split('T')[0])}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#258ec8',
                    color: '#ffffff',
                    fontSize: '12px !important',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Today
                </button>
              </div>
            </div>

            {/* TOP 4 AGGREGATE SUMMARY CARDS */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
              {/* Card 1: Total Revenue */}
              <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '18px', padding: '18px', boxShadow: '0 4px 14px rgba(0,0,0,0.02)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span style={{ fontSize: '11.5px !important', fontWeight: 800, color: '#64748b' }}>TOTAL REVENUE</span>
                  <div style={{ background: '#eff6ff', padding: '7px', borderRadius: '10px' }}><DollarSign size={18} color="#258ec8" /></div>
                </div>
                <span style={{ fontSize: '24px !important', fontWeight: 800, color: '#0f172a' }}>
                  ₹{totalDayRevenue.toLocaleString('en-IN')}
                </span>
                <div style={{ marginTop: '6px', color: '#64748b', fontSize: '11.5px !important' }}>
                  Across all 4 clinic branches
                </div>
              </div>

              {/* Card 2: Total Appointments */}
              <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '18px', padding: '18px', boxShadow: '0 4px 14px rgba(0,0,0,0.02)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span style={{ fontSize: '11.5px !important', fontWeight: 800, color: '#64748b' }}>TOTAL APPOINTMENTS</span>
                  <div style={{ background: '#faf5ff', padding: '7px', borderRadius: '10px' }}><Users size={18} color="#9333ea" /></div>
                </div>
                <span style={{ fontSize: '24px !important', fontWeight: 800, color: '#9333ea' }}>
                  {totalDayAppointments} Patients
                </span>
                <div style={{ marginTop: '6px', color: '#64748b', fontSize: '11.5px !important' }}>
                  Booked for {dailyOpsDate}
                </div>
              </div>

              {/* Card 3: Follow-Up Opted */}
              <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '18px', padding: '18px', boxShadow: '0 4px 14px rgba(0,0,0,0.02)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span style={{ fontSize: '11.5px !important', fontWeight: 800, color: '#16a34a' }}>FOLLOW-UP OPTED</span>
                  <div style={{ background: '#f0fdf4', padding: '7px', borderRadius: '10px' }}><CheckCircle2 size={18} color="#16a34a" /></div>
                </div>
                <span style={{ fontSize: '24px !important', fontWeight: 800, color: '#16a34a' }}>
                  {totalDayOpted} Patients
                </span>
                <div style={{ marginTop: '6px', color: '#16a34a', fontSize: '11.5px !important', fontWeight: 700 }}>
                  ✓ Scheduled for next follow-up
                </div>
              </div>

              {/* Card 4: Follow-Up Not Opted */}
              <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '18px', padding: '18px', boxShadow: '0 4px 14px rgba(0,0,0,0.02)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span style={{ fontSize: '11.5px !important', fontWeight: 800, color: '#ea580c' }}>FOLLOW-UP NOT OPTED</span>
                  <div style={{ background: '#fff7ed', padding: '7px', borderRadius: '10px' }}><AlertCircle size={18} color="#ea580c" /></div>
                </div>
                <span style={{ fontSize: '24px !important', fontWeight: 800, color: '#ea580c' }}>
                  {totalDayNotOpted} Patients
                </span>
                <div style={{ marginTop: '6px', color: '#64748b', fontSize: '11.5px !important' }}>
                  No follow-up interval chosen
                </div>
              </div>
            </div>

            {/* 4 BRANCH DEDICATED OPERATIONS CARDS */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <h3 style={{ fontSize: '15px !important', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  Branch Performance Cards ({dailyOpsDate})
                </h3>
                <span style={{ fontSize: '12px !important', color: '#64748b' }}>
                  Click "View Patients" on any branch to inspect patient follow-up records
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '18px' }}>
                {branchDailyStats.map(b => (
                  <div
                    key={b.id}
                    style={{
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '18px',
                      padding: '20px',
                      boxShadow: '0 4px 14px rgba(0,0,0,0.02)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between'
                    }}
                  >
                    <div>
                      {/* Branch Header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Building2 size={16} color="#258ec8" />
                            <h4 style={{ fontSize: '15px !important', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                              {b.name}
                            </h4>
                          </div>
                          <span style={{ fontSize: '11.5px !important', color: '#64748b', marginTop: '2px', display: 'block' }}>
                            📞 {b.phone}
                          </span>
                        </div>

                        <span style={{
                          background: '#e0f2fe',
                          color: '#0284c7',
                          padding: '3px 8px',
                          borderRadius: '8px',
                          fontSize: '10.5px !important',
                          fontWeight: 800
                        }}>
                          LIVE ACTIVE
                        </span>
                      </div>

                      {/* 4 Core Metrics Grid inside Branch Card */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
                        {/* 1. Today's Revenue */}
                        <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '12px', border: '1px solid #f1f5f9' }}>
                          <span style={{ fontSize: '10.5px !important', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                            Today's Revenue
                          </span>
                          <div style={{ fontSize: '17px !important', fontWeight: 800, color: '#258ec8', marginTop: '4px' }}>
                            ₹{b.revenue.toLocaleString('en-IN')}
                          </div>
                        </div>

                        {/* 2. Appointments */}
                        <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '12px', border: '1px solid #f1f5f9' }}>
                          <span style={{ fontSize: '10.5px !important', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                            Appointments
                          </span>
                          <div style={{ fontSize: '17px !important', fontWeight: 800, color: '#0f172a', marginTop: '4px' }}>
                            {b.appointmentCount} Patients
                          </div>
                        </div>

                        {/* 3. Follow-Up Opted */}
                        <div style={{ background: '#f0fdf4', padding: '12px', borderRadius: '12px', border: '1px solid #dcfce7' }}>
                          <span style={{ fontSize: '10.5px !important', fontWeight: 700, color: '#16a34a', textTransform: 'uppercase' }}>
                            Follow-Up Opted
                          </span>
                          <div style={{ fontSize: '17px !important', fontWeight: 800, color: '#16a34a', marginTop: '4px' }}>
                            ✓ {b.optedCount} Patients
                          </div>
                        </div>

                        {/* 4. Follow-Up Not Opted */}
                        <div style={{ background: '#fff7ed', padding: '12px', borderRadius: '12px', border: '1px solid #ffedd5' }}>
                          <span style={{ fontSize: '10.5px !important', fontWeight: 700, color: '#ea580c', textTransform: 'uppercase' }}>
                            Not Opted
                          </span>
                          <div style={{ fontSize: '17px !important', fontWeight: 800, color: '#ea580c', marginTop: '4px' }}>
                            ✕ {b.notOptedCount} Patients
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Card Footer Action */}
                    <div>
                      {b.appointmentCount > 0 ? (
                        <button
                          onClick={() => {
                            setSelectedBranchModal(b);
                            setBranchPatientFilter('all');
                          }}
                          style={{
                            width: '100%',
                            padding: '9px',
                            borderRadius: '10px',
                            border: '1px solid #258ec8',
                            background: '#eff6ff',
                            color: '#258ec8',
                            fontSize: '12px !important',
                            fontWeight: 800,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px'
                          }}
                        >
                          <Users size={14} /> View Patients & Follow-Ups ({b.appointmentCount})
                        </button>
                      ) : (
                        <div style={{ textAlign: 'center', padding: '8px', color: '#94a3b8', fontSize: '12px !important', background: '#f8fafc', borderRadius: '8px' }}>
                          No patient appointments on {dailyOpsDate}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* MODAL: BRANCH PATIENT BREAKDOWN LIST */}
            {selectedBranchModal && (
              <div style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(15, 23, 42, 0.6)',
                zIndex: 1000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '20px'
              }}>
                <div style={{
                  background: '#ffffff',
                  borderRadius: '20px',
                  width: '100%',
                  maxWidth: '780px',
                  maxHeight: '85vh',
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
                }}>
                  {/* Modal Header */}
                  <div style={{ padding: '18px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h3 style={{ fontSize: '16px !important', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                        {selectedBranchModal.name} — Patient Follow-Ups
                      </h3>
                      <span style={{ fontSize: '12px !important', color: '#64748b' }}>
                        Date: {dailyOpsDate} • Revenue: ₹{selectedBranchModal.revenue.toLocaleString('en-IN')}
                      </span>
                    </div>

                    <button
                      onClick={() => setSelectedBranchModal(null)}
                      style={{ background: '#f1f5f9', border: 'none', borderRadius: '8px', padding: '6px', cursor: 'pointer' }}
                    >
                      <X size={18} color="#64748b" />
                    </button>
                  </div>

                  {/* Filter Chips */}
                  <div style={{ padding: '12px 24px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: '8px' }}>
                    {(['all', 'opted', 'not_opted'] as const).map(tab => (
                      <button
                        key={tab}
                        onClick={() => setBranchPatientFilter(tab)}
                        style={{
                          padding: '5px 12px',
                          borderRadius: '8px',
                          border: branchPatientFilter === tab ? '1px solid #258ec8' : '1px solid #cbd5e1',
                          background: branchPatientFilter === tab ? '#258ec8' : '#ffffff',
                          color: branchPatientFilter === tab ? '#ffffff' : '#64748b',
                          fontSize: '11.5px !important',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        {tab === 'all' && `All Patients (${selectedBranchModal.appointmentCount})`}
                        {tab === 'opted' && `Follow-Up Opted (${selectedBranchModal.optedCount})`}
                        {tab === 'not_opted' && `Not Opted (${selectedBranchModal.notOptedCount})`}
                      </button>
                    ))}
                  </div>

                  {/* Patients Table */}
                  <div style={{ padding: '16px 24px', overflowY: 'auto', flex: 1 }}>
                    {selectedBranchModal.appointments
                      .filter((a: any) => {
                        if (branchPatientFilter === 'opted') return isFollowUpOpted(a);
                        if (branchPatientFilter === 'not_opted') return !isFollowUpOpted(a);
                        return true;
                      })
                      .map((a: any, idx: number) => {
                        const opted = isFollowUpOpted(a);
                        const pName = a.patientName || a.name || 'Patient';
                        const pPhone = a.phoneNumber || a.phone || '-';
                        const docName = a.doctorName || a.doctor || 'Doctor';
                        const fee = extractRevenue(a);

                        return (
                          <div
                            key={a.id || idx}
                            style={{
                              padding: '12px 14px',
                              borderBottom: '1px solid #f1f5f9',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              gap: '10px'
                            }}
                          >
                            <div>
                              <span style={{ fontSize: '13.5px !important', fontWeight: 800, color: '#0f172a' }}>
                                {pName}
                              </span>
                              <div style={{ fontSize: '11.5px !important', color: '#64748b', marginTop: '2px' }}>
                                📞 {pPhone} • 🩺 {docName} • ⏰ {a.appointmentTime || a.time || a.timeSlot || 'Scheduled'}
                              </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <span style={{
                                padding: '3px 10px',
                                borderRadius: '8px',
                                fontSize: '11px !important',
                                fontWeight: 800,
                                background: opted ? '#f0fdf4' : '#fff7ed',
                                color: opted ? '#16a34a' : '#ea580c'
                              }}>
                                {opted ? `✓ Follow-Up Opted (${a.followUpInterval || 'Opted'})` : '✕ Not Opted'}
                              </span>

                              <span style={{ fontSize: '13px !important', fontWeight: 800, color: '#0f172a' }}>
                                ₹{Number(fee).toLocaleString('en-IN')}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB: FEE REQUESTS (REAL-TIME FIRESTORE WORKFLOW) */}
        {activeTab === 'fee_requests' && (
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '20px', padding: '22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ background: '#eff6ff', color: '#258ec8', padding: '4px 8px', borderRadius: '6px', fontSize: '11px !important', fontWeight: 800 }}>
                    FIRESTORE LIVE
                  </span>
                  <h2 style={{ fontSize: '16px !important', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                    Medicine Fee & Discount Requests
                  </h2>
                </div>
                <p style={{ fontSize: '12px !important', color: '#64748b', margin: '4px 0 0 0' }}>
                  Real-time discount approval requests submitted by Reception desks across all branches.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {(['All', 'Pending', 'Approved', 'Rejected'] as const).map(st => {
                    const count = st === 'All'
                      ? feeRequests.length
                      : feeRequests.filter(r => normalizeFeeStatus(r.status) === st).length;
                    return (
                      <button
                        key={st}
                        onClick={() => setFeeStatusFilter(st)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '8px',
                          border: feeStatusFilter === st ? '1px solid #258ec8' : '1px solid #cbd5e1',
                          background: feeStatusFilter === st ? '#258ec8' : '#ffffff',
                          color: feeStatusFilter === st ? '#ffffff' : '#64748b',
                          fontSize: '11.5px !important',
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        {st} {count > 0 ? `(${count})` : ''}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {feeRequests.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 20px', background: '#f8fafc', borderRadius: '14px', border: '1px dashed #cbd5e1' }}>
                <FileText size={36} color="#94a3b8" style={{ marginBottom: '10px' }} />
                <h4 style={{ fontSize: '14px !important', fontWeight: 800, color: '#0f172a', marginBottom: '4px' }}>
                  No Fee Requests in Firestore
                </h4>
                <p style={{ fontSize: '12px !important', color: '#64748b', margin: 0 }}>
                  No discount requests have been submitted by reception yet.
                </p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ padding: '12px 14px', fontSize: '12px !important', fontWeight: 800, color: '#475569' }}>PATIENT NAME</th>
                      <th style={{ padding: '12px 14px', fontSize: '12px !important', fontWeight: 800, color: '#475569' }}>BRANCH</th>
                      <th style={{ padding: '12px 14px', fontSize: '12px !important', fontWeight: 800, color: '#475569' }}>DATE & TIME</th>
                      <th style={{ padding: '12px 14px', fontSize: '12px !important', fontWeight: 800, color: '#475569', textAlign: 'right' }}>TOTAL AMOUNT</th>
                      <th style={{ padding: '12px 14px', fontSize: '12px !important', fontWeight: 800, color: '#dc2626', textAlign: 'right' }}>REQUESTED DISCOUNT</th>
                      <th style={{ padding: '12px 14px', fontSize: '12px !important', fontWeight: 800, color: '#059669', textAlign: 'right' }}>NET AFTER DISCOUNT</th>
                      <th style={{ padding: '12px 14px', fontSize: '12px !important', fontWeight: 800, color: '#475569' }}>REASON / NOTE</th>
                      <th style={{ padding: '12px 14px', fontSize: '12px !important', fontWeight: 800, color: '#475569', textAlign: 'center' }}>STATUS</th>
                      <th style={{ padding: '12px 14px', fontSize: '12px !important', fontWeight: 800, color: '#475569', textAlign: 'center' }}>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {feeRequests
                      .filter(f => feeStatusFilter === 'All' ? true : normalizeFeeStatus(f.status) === feeStatusFilter)
                      .map(f => {
                        const status = normalizeFeeStatus(f.status);
                        const origTotal = Number(f.originalTotalAmount || 0);
                        const reqDisc = Number(f.requestedDiscount || 0);
                        const netAmount = Math.max(0, origTotal - reqDisc);
                        const formattedDate = f.createdAt || f.requestedAt
                          ? new Date(f.createdAt || f.requestedAt).toLocaleString('en-IN', {
                              day: '2-digit', month: 'short', year: 'numeric',
                              hour: '2-digit', minute: '2-digit', hour12: true
                            })
                          : '-';

                        return (
                          <tr key={f.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '12px 14px' }}>
                              <div style={{ fontSize: '13px !important', fontWeight: 800, color: '#0f172a' }}>
                                {f.patientName || 'Patient'}
                              </div>
                              <div style={{ fontSize: '11px !important', color: '#64748b' }}>
                                +91 {f.patientPhone || '-'}
                              </div>
                            </td>
                            <td style={{ padding: '12px 14px', fontSize: '12.5px !important', color: '#258ec8', fontWeight: 700 }}>
                              {f.branch || 'Main Branch'}
                            </td>
                            <td style={{ padding: '12px 14px', fontSize: '12px !important', color: '#475569', fontWeight: 600 }}>
                              {formattedDate}
                            </td>
                            <td style={{ padding: '12px 14px', fontSize: '13px !important', fontWeight: 700, color: '#0f172a', textAlign: 'right' }}>
                              ₹{origTotal.toLocaleString('en-IN')}
                            </td>
                            <td style={{ padding: '12px 14px', fontSize: '13.5px !important', fontWeight: 900, color: '#dc2626', textAlign: 'right' }}>
                              - ₹{reqDisc.toLocaleString('en-IN')}
                            </td>
                            <td style={{ padding: '12px 14px', fontSize: '13.5px !important', fontWeight: 900, color: '#059669', textAlign: 'right' }}>
                              ₹{netAmount.toLocaleString('en-IN')}
                            </td>
                            <td style={{ padding: '12px 14px', fontSize: '12px !important', color: '#334155', maxWidth: '240px' }}>
                              <div style={{ fontWeight: 600 }}>{f.reason || 'No note specified'}</div>
                              {f.rejectReason && status === 'Rejected' && (
                                <div style={{ fontSize: '11px !important', color: '#dc2626', marginTop: '2px' }}>
                                  Reject Note: {f.rejectReason}
                                </div>
                              )}
                              {f.reviewedBy && (
                                <div style={{ fontSize: '10.5px !important', color: '#94a3b8', marginTop: '2px' }}>
                                  Reviewed by: {f.reviewedBy}
                                </div>
                              )}
                            </td>
                            <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                              <span style={{
                                padding: '4px 10px',
                                borderRadius: '8px',
                                fontSize: '11px !important',
                                fontWeight: 800,
                                background: status === 'Approved' ? '#f0fdf4' : status === 'Rejected' ? '#fef2f2' : '#fffbeb',
                                color: status === 'Approved' ? '#16a34a' : status === 'Rejected' ? '#ef4444' : '#d97706',
                                border: `1px solid ${status === 'Approved' ? '#bbf7d0' : status === 'Rejected' ? '#fecaca' : '#fde68a'}`
                              }}>
                                {status}
                              </span>
                            </td>
                            <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                              {status === 'Pending' ? (
                                <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                                  <button
                                    onClick={() => handleUpdateFeeRequestStatus(f.id, 'Approved', f)}
                                    style={{
                                      padding: '5px 12px',
                                      borderRadius: '6px',
                                      border: 'none',
                                      background: '#16a34a',
                                      color: '#ffffff',
                                      fontSize: '11.5px !important',
                                      fontWeight: 800,
                                      cursor: 'pointer'
                                    }}
                                  >
                                    Approve ✓
                                  </button>
                                  <button
                                    onClick={() => handleUpdateFeeRequestStatus(f.id, 'Rejected', f)}
                                    style={{
                                      padding: '5px 10px',
                                      borderRadius: '6px',
                                      border: '1px solid #cbd5e1',
                                      background: '#ffffff',
                                      color: '#ef4444',
                                      fontSize: '11.5px !important',
                                      fontWeight: 800,
                                      cursor: 'pointer'
                                    }}
                                  >
                                    Reject ✕
                                  </button>
                                </div>
                              ) : (
                                <span style={{ fontSize: '11px !important', color: '#94a3b8', fontStyle: 'italic' }}>
                                  Resolved
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB: LEAVE REQUESTS (CONNECTED TO REAL FIRESTORE DATA) */}
        {activeTab === 'leave_requests' && (
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '20px', padding: '22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ background: '#eff6ff', color: '#258ec8', padding: '4px 8px', borderRadius: '6px', fontSize: '11px !important', fontWeight: 800 }}>
                    FIRESTORE LIVE
                  </span>
                  <h2 style={{ fontSize: '16px !important', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                    Staff Leave Applications
                  </h2>
                </div>
                <p style={{ fontSize: '12px !important', color: '#64748b', margin: '4px 0 0 0' }}>
                  Real-time leave applications from staff (Showing latest {Math.min(10, leaveRequests.length)}{leaveRequests.length > 10 ? ` of ${leaveRequests.length}` : ''}).
                </p>
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {(['All', 'Pending', 'Approved', 'Rejected'] as const).map(st => (
                    <button
                      key={st}
                      onClick={() => setLeaveStatusFilter(st)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '8px',
                        border: leaveStatusFilter === st ? '1px solid #258ec8' : '1px solid #cbd5e1',
                        background: leaveStatusFilter === st ? '#258ec8' : '#ffffff',
                        color: leaveStatusFilter === st ? '#ffffff' : '#64748b',
                        fontSize: '11.5px !important',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      {st} {st === 'Pending' && pendingLeaveCount > 0 ? `(${pendingLeaveCount})` : ''}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {leaveRequests.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '48px 20px', background: '#f8fafc', borderRadius: '14px', border: '1px dashed #cbd5e1' }}>
                <Calendar size={36} color="#94a3b8" style={{ marginBottom: '10px' }} />
                <h4 style={{ fontSize: '14px !important', fontWeight: 800, color: '#0f172a', marginBottom: '4px' }}>
                  No Leave Requests in Firestore
                </h4>
                <p style={{ fontSize: '12px !important', color: '#64748b', margin: 0 }}>
                  No leave applications received from staff for the current month.
                </p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ padding: '12px 14px', fontSize: '12px !important', fontWeight: 800, color: '#475569' }}>APPLICANT</th>
                      <th style={{ padding: '12px 14px', fontSize: '12px !important', fontWeight: 800, color: '#475569' }}>BRANCH</th>
                      <th style={{ padding: '12px 14px', fontSize: '12px !important', fontWeight: 800, color: '#475569' }}>LEAVE TYPE</th>
                      <th style={{ padding: '12px 14px', fontSize: '12px !important', fontWeight: 800, color: '#475569' }}>PERIOD</th>
                      <th style={{ padding: '12px 14px', fontSize: '12px !important', fontWeight: 800, color: '#0369a1' }}>RE-JOINING DATE</th>
                      <th style={{ padding: '12px 14px', fontSize: '12px !important', fontWeight: 800, color: '#475569' }}>DURATION</th>
                      <th style={{ padding: '12px 14px', fontSize: '12px !important', fontWeight: 800, color: '#475569' }}>REASON</th>
                      <th style={{ padding: '12px 14px', fontSize: '12px !important', fontWeight: 800, color: '#475569', textAlign: 'center' }}>STATUS</th>
                      <th style={{ padding: '12px 14px', fontSize: '12px !important', fontWeight: 800, color: '#475569', textAlign: 'center' }}>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaveRequests
                      .filter(l => leaveStatusFilter === 'All' ? true : normalizeStatus(l.status) === leaveStatusFilter)
                      .slice(0, 10)
                      .map(l => {
                        const applicantName = resolveApplicantName(l);
                        const roleName = resolveRoleName(l);
                        const branchName = resolveBranchName(l);
                        const period = resolvePeriod(l);
                        const duration = resolveDuration(l);
                        const status = normalizeStatus(l.status);
                        return (
                          <tr key={l.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '12px 14px' }}>
                              <div style={{ fontSize: '13px !important', fontWeight: 700, color: '#0f172a' }}>{applicantName}</div>
                              <div style={{ fontSize: '11px !important', color: '#64748b' }}>{roleName}</div>
                            </td>
                            <td style={{ padding: '12px 14px', fontSize: '12.5px !important', color: '#258ec8', fontWeight: 600 }}>{branchName}</td>
                            <td style={{ padding: '12px 14px' }}>
                              <span style={{
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontSize: '11px !important',
                                fontWeight: 700,
                                background: l.leaveType === 'Sick Leave' ? '#fee2e2' : l.leaveType === 'Emergency Leave' ? '#ffedd5' : '#e0f2fe',
                                color: l.leaveType === 'Sick Leave' ? '#dc2626' : l.leaveType === 'Emergency Leave' ? '#c2410c' : '#0369a1'
                              }}>
                                {l.leaveType || 'Leave'}
                              </span>
                            </td>
                            <td style={{ padding: '12px 14px', fontSize: '12px !important', color: '#0f172a', fontWeight: 600 }}>
                              {period}
                            </td>
                            <td style={{ padding: '12px 14px', fontSize: '12px !important', color: '#0284c7', fontWeight: 700 }}>
                              {l.joiningDate || '-'}
                            </td>
                            <td style={{ padding: '12px 14px', fontSize: '12.5px !important', fontWeight: 800, color: '#258ec8' }}>{duration}</td>
                            <td style={{ padding: '12px 14px', fontSize: '12px !important', color: '#475569', maxWidth: '240px' }}>{l.reason || '-'}</td>
                            <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                              <span style={{
                                padding: '4px 10px',
                                borderRadius: '8px',
                                fontSize: '11px !important',
                                fontWeight: 800,
                                background: status === 'Approved' ? '#f0fdf4' : status === 'Rejected' ? '#fef2f2' : '#fffbeb',
                                color: status === 'Approved' ? '#16a34a' : status === 'Rejected' ? '#ef4444' : '#d97706'
                              }}>
                                {status}
                              </span>
                            </td>
                            <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                              {status === 'Pending' ? (
                                <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                                  <button
                                    onClick={() => handleUpdateLeaveStatus(l.id, 'Approved', l._collection || 'leaves')}
                                    style={{
                                      padding: '5px 10px',
                                      borderRadius: '6px',
                                      border: 'none',
                                      background: '#16a34a',
                                      color: '#ffffff',
                                      fontSize: '11px !important',
                                      fontWeight: 700,
                                      cursor: 'pointer'
                                    }}
                                  >
                                    Approve
                                  </button>
                                  <button
                                    onClick={() => handleUpdateLeaveStatus(l.id, 'Rejected', l._collection || 'leaves')}
                                    style={{
                                      padding: '5px 10px',
                                      borderRadius: '6px',
                                      border: 'none',
                                      background: '#ef4444',
                                      color: '#ffffff',
                                      fontSize: '11px !important',
                                      fontWeight: 700,
                                      cursor: 'pointer'
                                    }}
                                  >
                                    Reject
                                  </button>
                                </div>
                              ) : (
                                <span style={{ fontSize: '11.5px !important', color: '#94a3b8', fontWeight: 600 }}>Finalized</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB: BRANCH CLEANING & SANITATION AUDITS */}
        {activeTab === 'branch_cleaning' && (
          <BranchCleaningPage role={role} currentBranch={currentBranch} />
        )}

        {/* TAB: EMPLOYEE ATTENDANCE REPORT */}
        {activeTab === 'employee_attendance' && (
          <EmployeeAttendanceReportPage />
        )}

        {/* TAB: EMPLOYEE DAILY WORKS */}
        {activeTab === 'employee_works' && (
          <EmployeeDailyWorksPage />
        )}

        {/* TAB: PACKAGE MEMBERS */}
        {activeTab === 'package_members' && (
          <PackageMembersPage />
        )}

        {/* TAB: MANAGE BANNERS */}
        {activeTab === 'banners' && (
          <ManageBannersPage />
        )}

        {/* TAB: PENDING PAYMENTS */}
        {activeTab === 'pending_payments' && (
          <PendingPaymentsPage />
        )}

        {/* TAB: ALL FOLLOW-UPS */}
        {activeTab === 'follow_ups' && (
          <AdminFollowUpsPage />
        )}

        {/* TAB 2: MANAGE BRANCHES & TARGET MANAGEMENT */}
        {activeTab === 'branches' && (
          <ManageBranchesPage role={role} />
        )}

        {/* TAB 3: GLOBAL PATIENTS & PACKAGE MEMBERS */}
        {activeTab === 'patients' && (
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '20px', padding: '22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h2 style={{ fontSize: '16px !important', fontWeight: 800, color: '#0f172a' }}>
                  Global Patients & Package Members Directory
                </h2>
                <p style={{ fontSize: '12px !important', color: '#64748b' }}>
                  Master patient registry, marketing sources, and package memberships.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ position: 'relative' }}>
                  <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '14px' }} />
                  <input
                    type="text"
                    placeholder="Search patient or phone..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    style={{ padding: '8px 12px 8px 36px', border: '1px solid #cbd5e1', borderRadius: '10px', fontSize: '12px !important', outline: 'none' }}
                  />
                </div>
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ padding: '12px 14px', fontSize: '12px !important', fontWeight: 800, color: '#475569' }}>PATIENT ID</th>
                    <th style={{ padding: '12px 14px', fontSize: '12px !important', fontWeight: 800, color: '#475569' }}>PATIENT NAME</th>
                    <th style={{ padding: '12px 14px', fontSize: '12px !important', fontWeight: 800, color: '#475569' }}>PHONE</th>
                    <th style={{ padding: '12px 14px', fontSize: '12px !important', fontWeight: 800, color: '#475569' }}>BRANCH</th>
                    <th style={{ padding: '12px 14px', fontSize: '12px !important', fontWeight: 800, color: '#475569' }}>PACKAGE MEMBERSHIP</th>
                    <th style={{ padding: '12px 14px', fontSize: '12px !important', fontWeight: 800, color: '#475569' }}>MARKETING SOURCE</th>
                  </tr>
                </thead>
                <tbody>
                  {globalPatientsList
                    .filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.phone.includes(searchQuery))
                    .map(p => (
                      <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '12px 14px', fontSize: '12px !important', fontWeight: 800, color: '#258ec8' }}>{p.id}</td>
                        <td style={{ padding: '12px 14px', fontSize: '13px !important', fontWeight: 700, color: '#0f172a' }}>{p.name}</td>
                        <td style={{ padding: '12px 14px', fontSize: '12.5px !important', color: '#334155' }}>{p.phone}</td>
                        <td style={{ padding: '12px 14px', fontSize: '12.5px !important', color: '#334155' }}>{p.branch}</td>
                        <td style={{ padding: '12px 14px', fontSize: '12px !important' }}>
                          <span style={{ background: '#f0fdf4', color: '#16a34a', padding: '3px 8px', borderRadius: '8px', fontWeight: 700 }}>
                            {p.package}
                          </span>
                        </td>
                        <td style={{ padding: '12px 14px', fontSize: '12.5px !important', color: '#64748b' }}>{p.source}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 4: DOCTOR TIMINGS & SCHEDULES */}
        {activeTab === 'doctors' && (
          <DoctorTimingsPage />
        )}

        {/* TAB 5: STAFF MANAGEMENT & WORKING HOURS */}
        {activeTab === 'staff' && (
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '20px', padding: '22px' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h2 style={{ fontSize: '16px !important', fontWeight: 800, color: '#0f172a' }}>
                  Staff Management & Working Hours
                </h2>
                <p style={{ fontSize: '12px !important', color: '#64748b' }}>
                  Select a category below to view and manage working hours, shifts, and compensation.
                </p>
              </div>
            </div>

            {/* 3 SELECTOR BUTTONS FOR CATEGORY SHIFTING & ADD STAFF BUTTON */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'flex', gap: '8px', background: '#f1f5f9', padding: '4px', borderRadius: '12px', width: 'fit-content' }}>
                <button
                  onClick={() => setStaffCategory('staff')}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '9px',
                    border: 'none',
                    background: staffCategory === 'staff' ? '#ffffff' : 'transparent',
                    color: staffCategory === 'staff' ? '#258ec8' : '#64748b',
                    fontWeight: staffCategory === 'staff' ? 800 : 600,
                    fontSize: '12.5px !important',
                    cursor: 'pointer',
                    boxShadow: staffCategory === 'staff' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
                    transition: 'all 0.2s ease'
                  }}
                >
                  Staff Members
                </button>
                <button
                  onClick={() => setStaffCategory('reception')}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '9px',
                    border: 'none',
                    background: staffCategory === 'reception' ? '#ffffff' : 'transparent',
                    color: staffCategory === 'reception' ? '#258ec8' : '#64748b',
                    fontWeight: staffCategory === 'reception' ? 800 : 600,
                    fontSize: '12.5px !important',
                    cursor: 'pointer',
                    boxShadow: staffCategory === 'reception' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
                    transition: 'all 0.2s ease'
                  }}
                >
                  Reception Desk
                </button>
                <button
                  onClick={() => setStaffCategory('doctors')}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '9px',
                    border: 'none',
                    background: staffCategory === 'doctors' ? '#ffffff' : 'transparent',
                    color: staffCategory === 'doctors' ? '#258ec8' : '#64748b',
                    fontWeight: staffCategory === 'doctors' ? 800 : 600,
                    fontSize: '12.5px !important',
                    cursor: 'pointer',
                    boxShadow: staffCategory === 'doctors' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
                    transition: 'all 0.2s ease'
                  }}
                >
                  Doctors
                </button>
                <button
                  onClick={() => setStaffCategory('hr')}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '9px',
                    border: 'none',
                    background: staffCategory === 'hr' ? '#ffffff' : 'transparent',
                    color: staffCategory === 'hr' ? '#258ec8' : '#64748b',
                    fontWeight: staffCategory === 'hr' ? 800 : 600,
                    fontSize: '12.5px !important',
                    cursor: 'pointer',
                    boxShadow: staffCategory === 'hr' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none',
                    transition: 'all 0.2s ease'
                  }}
                >
                  HR
                </button>
              </div>

              {staffCategory === 'staff' && (
                <button
                  onClick={handleOpenAddStaffModal}
                  style={{
                    background: '#258ec8',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '10px',
                    padding: '9px 16px',
                    fontSize: '13px !important',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 8px rgba(37, 99, 235, 0.25)',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <Plus size={16} /> Add Staff
                </button>
              )}
              {staffCategory === 'doctors' && (
                <button
                  onClick={handleOpenAddDoctorModal}
                  style={{
                    background: '#258ec8',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '10px',
                    padding: '9px 16px',
                    fontSize: '13px !important',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 8px rgba(139, 92, 246, 0.25)',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <Plus size={16} /> Add Doctor
                </button>
              )}
            </div>

            {/* VIEW 1: STAFF MEMBERS (ALL CLINIC STAFF) */}
            {staffCategory === 'staff' && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ padding: '12px 14px', fontSize: '12px !important', fontWeight: 800, color: '#475569' }}>STAFF NAME</th>
                      <th style={{ padding: '12px 14px', fontSize: '12px !important', fontWeight: 800, color: '#475569' }}>MOBILE NUMBER</th>
                      <th style={{ padding: '12px 14px', fontSize: '12px !important', fontWeight: 800, color: '#475569' }}>ASSIGNED BRANCH</th>
                      <th style={{ padding: '12px 14px', fontSize: '12px !important', fontWeight: 800, color: '#475569' }}>SHIFT HOURS</th>
                      <th style={{ padding: '12px 14px', fontSize: '12px !important', fontWeight: 800, color: '#475569' }}>DAILY HOURS</th>
                      <th style={{ padding: '12px 14px', fontSize: '12px !important', fontWeight: 800, color: '#475569' }}>MONTHLY SALARY</th>
                      <th style={{ padding: '12px 14px', fontSize: '12px !important', fontWeight: 800, color: '#475569', textAlign: 'center' }}>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staffMembers.map(s => (
                      <tr key={s.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '12px 14px', fontSize: '13px !important', fontWeight: 700, color: '#0f172a' }}>
                          <div>{s.name}</div>
                          {(s as any).email && (
                            <div style={{ fontSize: '11px !important', color: '#0284c7', fontWeight: 600, marginTop: '3px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span>✉️</span> {(s as any).email}
                            </div>
                          )}
                          {(s as any).password && (
                            <div style={{ fontSize: '10.5px !important', color: '#64748b', fontWeight: 600, marginTop: '1px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span>🔑</span> {(s as any).password}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '12px 14px', fontSize: '12.5px !important', color: '#334155', fontWeight: 600 }}>
                          {(s.mobile || (s as any).phone) ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                              <Phone size={13} color="#0284c7" />
                              +91 {(s.mobile || (s as any).phone).replace(/\D/g, '').slice(-10)}
                            </span>
                          ) : (
                            <span style={{ color: '#94a3b8' }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '12px 14px', fontSize: '12.5px !important', color: '#258ec8', fontWeight: 600 }}>{s.branch}</td>
                        <td style={{ padding: '12px 14px', fontSize: '12.5px !important', color: '#258ec8', fontWeight: 600 }}>
                          {s.shift && s.shift.includes('|') ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                              {s.shift.split('|').map((slotStr: string, i: number) => (
                                <div key={i} style={{ whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <span style={{ fontSize: '10px !important', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', padding: '1px 5px', borderRadius: '4px', fontWeight: 800 }}>Shift {i + 1}</span>
                                  <span>{slotStr.trim()}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            s.shift
                          )}
                        </td>
                        <td style={{ padding: '12px 14px', fontSize: '12.5px !important', color: '#16a34a', fontWeight: 700 }}>{s.hours}</td>
                        <td style={{ padding: '12px 14px', fontSize: '13px !important', fontWeight: 800, color: '#0f172a' }}>{s.salary}</td>
                        <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                            <button
                              onClick={() => handleOpenEditStaffModal(s)}
                              title="Edit Staff Member"
                              style={{
                                background: '#eff6ff',
                                border: '1px solid #bfdbfe',
                                borderRadius: '8px',
                                padding: '6px 10px',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '11.5px !important',
                                fontWeight: 700,
                                color: '#1d4ed8',
                                transition: 'all 0.2s ease'
                              }}
                            >
                              <Edit size={14} color="#1d4ed8" /> Edit
                            </button>
                            <button
                              onClick={() => handleDeleteStaff(s.id, s.name)}
                              title="Delete Staff Member"
                              style={{
                                background: '#fef2f2',
                                border: '1px solid #fecaca',
                                borderRadius: '8px',
                                padding: '6px 10px',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '11.5px !important',
                                fontWeight: 700,
                                color: '#dc2626',
                                transition: 'all 0.2s ease'
                              }}
                            >
                              <Trash2 size={14} color="#dc2626" /> Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* VIEW 2: RECEPTION DESK (OFFICIAL CLINIC BRANCHES ONLY) */}
            {staffCategory === 'reception' && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                  {[
                    { branch: 'KPHB Branch', phone: '90301 76176', hours: '10:00 AM - 08:30 PM', location: 'Road No 1, KPHB Colony', status: 'ACTIVE BRANCH' },
                    { branch: 'Nallagandla Branch', phone: '91321 76176', hours: '10:00 AM - 08:30 PM', location: 'Main Road, Nallagandla', status: 'ACTIVE BRANCH' },
                    { branch: 'Dilshuknagar Branch', phone: '98041 76176', hours: '10:00 AM - 08:30 PM', location: 'Near Metro Station, Dilshuknagar', status: 'ACTIVE BRANCH' },
                    { branch: 'Chandanagar Branch', phone: '95531 76176', hours: '10:00 AM - 08:00 PM', location: 'HUDA Trade Centre, Chandanagar', status: 'ACTIVE BRANCH' },
                  ].map(b => (
                    <div key={b.branch} style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '16px', padding: '18px', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <h4 style={{ fontSize: '14px !important', fontWeight: 800, color: '#0f172a' }}>🏢 {b.branch}</h4>
                        <span style={{ background: '#dcfce7', color: '#15803d', fontSize: '10px !important', fontWeight: 800, padding: '3px 8px', borderRadius: '6px' }}>{b.status}</span>
                      </div>
                      <p style={{ fontSize: '12px !important', color: '#64748b', marginBottom: '12px' }}>📍 {b.location}</p>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingTop: '10px', borderTop: '1px solid #f1f5f9' }}>
                        <div style={{ fontSize: '12px !important', color: '#0284c7', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <Phone size={13} color="#0284c7" /> Contact: <span style={{ color: '#0f172a', fontWeight: 800 }}>+91 {b.phone}</span>
                        </div>
                        <div style={{ fontSize: '12px !important', color: '#16a34a', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <Clock size={13} color="#16a34a" /> Hours: <span style={{ color: '#334155', fontWeight: 600 }}>{b.hours}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* VIEW 3: DOCTORS DIRECTORY */}
            {staffCategory === 'doctors' && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ padding: '12px 14px', fontSize: '12px !important', fontWeight: 800, color: '#475569' }}>DOCTOR NAME</th>
                      <th style={{ padding: '12px 14px', fontSize: '12px !important', fontWeight: 800, color: '#475569' }}>DESIGNATION</th>
                      <th style={{ padding: '12px 14px', fontSize: '12px !important', fontWeight: 800, color: '#475569' }}>PHONE NUMBER</th>
                      <th style={{ padding: '12px 14px', fontSize: '12px !important', fontWeight: 800, color: '#475569' }}>SHIFT HOURS</th>
                      <th style={{ padding: '12px 14px', fontSize: '12px !important', fontWeight: 800, color: '#475569' }}>DAILY HOURS</th>
                      <th style={{ padding: '12px 14px', fontSize: '12px !important', fontWeight: 800, color: '#475569' }}>MONTHLY COMPENSATIONS</th>
                      <th style={{ padding: '12px 14px', fontSize: '12px !important', fontWeight: 800, color: '#475569', textAlign: 'center' }}>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {doctorsMembers.map(d => (
                      <tr key={d.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '12px 14px', fontSize: '13px !important', fontWeight: 800, color: '#0f172a' }}>{d.name}</td>
                        <td style={{ padding: '12px 14px', fontSize: '12.5px !important', color: '#6b21a8', fontWeight: 700 }}>
                          <span style={{
                            background: d.category === 'Employee Doctor' ? '#f0fdf4' : '#faf5ff',
                            border: d.category === 'Employee Doctor' ? '1px solid #bbf7d0' : '1px solid #e9d5ff',
                            color: d.category === 'Employee Doctor' ? '#166534' : '#6b21a8',
                            padding: '3px 8px',
                            borderRadius: '6px'
                          }}>
                            {d.category || d.role}
                          </span>
                        </td>
                        <td style={{ padding: '12px 14px', fontSize: '12.5px !important', color: '#334155', fontWeight: 600 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            <Phone size={14} color="#0284c7" />
                            +91 {d.mobile}
                          </span>
                        </td>
                        <td style={{ padding: '12px 14px', fontSize: '12.5px !important', color: d.category === 'Head Doctor' || d.shift === '-' ? '#64748b' : '#258ec8', fontWeight: 600 }}>
                          {d.category === 'Head Doctor' || d.shift === '-' ? (
                            '-'
                          ) : d.shift && d.shift.includes('|') ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                              {d.shift.split('|').map((slotStr, i) => (
                                <div key={i} style={{ whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <span style={{ fontSize: '10px !important', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', padding: '1px 5px', borderRadius: '4px', fontWeight: 800 }}>Shift {i + 1}</span>
                                  <span>{slotStr.trim()}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            d.shift || '-'
                          )}
                        </td>
                        <td style={{ padding: '12px 14px', fontSize: '12.5px !important', color: d.category === 'Head Doctor' || d.hours === '-' ? '#64748b' : '#16a34a', fontWeight: 700 }}>
                          {d.category === 'Head Doctor' || d.hours === '-' ? '-' : d.hours}
                        </td>
                        <td style={{ padding: '12px 14px', fontSize: '13px !important', fontWeight: 800, color: d.category === 'Employee Doctor' && d.salary !== '-' ? '#0f172a' : '#94a3b8' }}>
                          {d.category === 'Head Doctor' || d.salary === '-' ? '-' : d.salary}
                        </td>
                        <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                            <button
                              onClick={() => handleOpenEditDoctorModal(d)}
                              title="Edit Doctor Profile"
                              style={{
                                background: '#eff6ff',
                                border: '1px solid #bfdbfe',
                                borderRadius: '8px',
                                padding: '6px 10px',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '11.5px !important',
                                fontWeight: 700,
                                color: '#1d4ed8',
                                transition: 'all 0.2s ease'
                              }}
                            >
                              <Edit size={14} color="#1d4ed8" /> Edit
                            </button>
                            <button
                              onClick={() => handleDeleteDoctor(d.id, d.name)}
                              title="Delete Doctor Profile"
                              style={{
                                background: '#fef2f2',
                                border: '1px solid #fecaca',
                                borderRadius: '8px',
                                padding: '6px 10px',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '11.5px !important',
                                fontWeight: 700,
                                color: '#dc2626',
                                transition: 'all 0.2s ease'
                              }}
                            >
                              <Trash2 size={14} color="#dc2626" /> Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* VIEW 4: HR DEPARTMENT (NO SALARY, NO LOGIN/LOGOUT, NO BRANCH - JUST HR ID & PASSWORD) */}
            {staffCategory === 'hr' && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ padding: '12px 14px', fontSize: '12px !important', fontWeight: 800, color: '#475569' }}>DEPARTMENT / NAME</th>
                      <th style={{ padding: '12px 14px', fontSize: '12px !important', fontWeight: 800, color: '#475569' }}>DESIGNATION</th>
                      <th style={{ padding: '12px 14px', fontSize: '12px !important', fontWeight: 800, color: '#475569' }}>HR ID / LOGIN EMAIL</th>
                      <th style={{ padding: '12px 14px', fontSize: '12px !important', fontWeight: 800, color: '#475569' }}>PASSWORD</th>
                      <th style={{ padding: '12px 14px', fontSize: '12px !important', fontWeight: 800, color: '#475569', textAlign: 'center' }}>ACCESS STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '14px', fontSize: '13.5px !important', fontWeight: 800, color: '#0f172a' }}>
                        HR Department
                      </td>
                      <td style={{ padding: '14px', fontSize: '12.5px !important', color: '#0284c7', fontWeight: 700 }}>
                        <span style={{ background: '#e0f2fe', border: '1px solid #bae6fd', padding: '3px 8px', borderRadius: '6px' }}>
                          Human Resources (HR)
                        </span>
                      </td>
                      <td style={{ padding: '14px', fontSize: '13px !important', color: '#0f172a', fontWeight: 800 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '4px 10px', borderRadius: '8px' }}>
                          hr@sph.com
                        </span>
                      </td>
                      <td style={{ padding: '14px', fontSize: '13px !important', color: '#0f172a', fontWeight: 800 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '4px 10px', borderRadius: '8px' }}>
                          hr@sph123
                        </span>
                      </td>
                      <td style={{ padding: '14px', textAlign: 'center' }}>
                        <span style={{ background: '#dcfce7', color: '#15803d', fontSize: '11px !important', fontWeight: 800, padding: '4px 10px', borderRadius: '6px' }}>
                          ACTIVE • FULL ACCESS
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>

                {/* Information Card */}
                <div style={{ marginTop: '16px', padding: '14px 16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ background: '#258ec8', color: '#ffffff', padding: '6px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <UserCheck size={16} />
                    </div>
                    <div>
                      <span style={{ fontSize: '12.5px !important', fontWeight: 800, color: '#0f172a', display: 'block' }}>
                        HR Account Credentials Configured
                      </span>
                      <span style={{ fontSize: '11.5px !important', color: '#64748b' }}>
                        HR login has full administrative module parity across Web and Mobile portals.
                      </span>
                    </div>
                  </div>
                  <div style={{ fontSize: '11px !important', fontWeight: 700, color: '#0284c7', background: '#e0f2fe', padding: '4px 10px', borderRadius: '6px' }}>
                    ID: hr@sph.com | PWD: hr@sph123
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB: REPORTS & VISUAL ANALYTICS */}
        {activeTab === 'reports_analytics' && (
          <ReportsAnalyticsPage />
        )}

        {/* TAB 6: FINANCE, TOTAL & NUTRITION REVENUE */}
        {activeTab === 'finance' && (
          <AdminTotalRevenuePage liveData={adminRevenueLiveData} />
        )}

        {/* TAB 7: EDIT MEDICINE FORM */}
        {activeTab === 'medicines' && (
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '20px', padding: '24px', maxWidth: '640px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
              <Pill size={22} color="#258ec8" />
              <h2 style={{ fontSize: '16px !important', fontWeight: 800, color: '#0f172a' }}>
                Edit Medicine & Remedy Inventory Form
              </h2>
            </div>

            {medicineSavedMsg && (
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#16a34a', padding: '10px 14px', borderRadius: '12px', marginBottom: '16px', fontSize: '12.5px !important', fontWeight: 700 }}>
                ✓ Medicine Details Saved Successfully!
              </div>
            )}

            <form onSubmit={handleSaveMedicine} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12.5px !important', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
                  Medicine / Remedy Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Arnica Montana, Nux Vomica"
                  value={remedyName}
                  onChange={e => setRemedyName(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '13px !important', outline: 'none' }}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12.5px !important', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
                    Potency
                  </label>
                  <select
                    value={remedyPotency}
                    onChange={e => setRemedyPotency(e.target.value)}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '13px !important', outline: 'none', background: '#ffffff' }}
                  >
                    <option value="30C">30C</option>
                    <option value="200C">200C</option>
                    <option value="1M">1M</option>
                    <option value="10M">10M</option>
                    <option value="Q (Mother Tincture)">Q (Mother Tincture)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12.5px !important', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
                    Category
                  </label>
                  <select
                    value={remedyCategory}
                    onChange={e => setRemedyCategory(e.target.value)}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '13px !important', outline: 'none', background: '#ffffff' }}
                  >
                    <option value="Acute">Acute</option>
                    <option value="Chronic">Chronic</option>
                    <option value="Spiritual">Spiritual</option>
                    <option value="General Wellness">General Wellness</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12.5px !important', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
                  Stock Quantity (Units)
                </label>
                <input
                  type="number"
                  value={remedyStock}
                  onChange={e => setRemedyStock(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '13px !important', outline: 'none' }}
                />
              </div>

              <button
                type="submit"
                style={{
                  background: '#258ec8',
                  color: '#ffffff',
                  border: 'none',
                  padding: '12px',
                  borderRadius: '12px',
                  fontSize: '13.5px !important',
                  fontWeight: 800,
                  cursor: 'pointer',
                  boxShadow: '0 4px 14px rgba(59, 130, 246, 0.3)',
                  marginTop: '8px'
                }}
              >
                Save Medicine Details
              </button>
            </form>
          </div>
        )}

      </div>

      {/* ADD/EDIT STAFF MODAL */}
      {showAddStaffModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(4px)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '20px',
            maxWidth: '540px',
            width: '100%',
            padding: '24px',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
            border: '1px solid #cbd5e1'
          }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', paddingBottom: '12px', borderBottom: '1px solid #f1f5f9' }}>
              <div>
                <h3 style={{ fontSize: '16px !important', fontWeight: 800, color: '#0f172a' }}>
                  {editingStaffId ? '✏️ Edit Staff Member' : '➕ Add Staff Member'}
                </h3>
                <p style={{ fontSize: '11.5px !important', color: '#64748b', marginTop: '2px' }}>
                  Assign staff role, branch location, monthly salary & shift timings.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddStaffModal(false)}
                style={{ background: '#f1f5f9', border: 'none', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={16} color="#64748b" />
              </button>
            </div>

            <form onSubmit={handleSaveStaff} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Assign Staff Role */}
              <div>
                <label style={{ display: 'block', fontSize: '12px !important', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Assign Staff Role
                </label>
                <select
                  value={staffFormRole}
                  onChange={e => setStaffFormRole(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px !important',
                    fontWeight: 600,
                    color: '#0f172a',
                    background: '#ffffff',
                    outline: 'none'
                  }}
                >
                  <option value="Regular Staff">Regular Staff</option>
                </select>
              </div>

              {/* Full Name */}
              <div>
                <label style={{ display: 'block', fontSize: '12px !important', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Full Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. John Doe"
                  value={staffFormName}
                  onChange={e => setStaffFormName(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px !important',
                    color: '#0f172a',
                    outline: 'none'
                  }}
                />
              </div>

              {/* Mobile Number (without +91) */}
              <div>
                <label style={{ display: 'block', fontSize: '12px !important', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Mobile Number (without +91)
                </label>
                <input
                  type="text"
                  placeholder="without +91 (e.g. 9876543210)"
                  value={staffFormMobile}
                  onChange={e => setStaffFormMobile(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px !important',
                    color: '#0f172a',
                    outline: 'none'
                  }}
                />
              </div>

              {/* Assign to Branch */}
              <div>
                <label style={{ display: 'block', fontSize: '12px !important', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Assign to Branch
                </label>
                <select
                  value={staffFormBranch}
                  onChange={e => setStaffFormBranch(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px !important',
                    fontWeight: 600,
                    color: staffFormBranch ? '#0f172a' : '#94a3b8',
                    background: '#ffffff',
                    outline: 'none'
                  }}
                >
                  <option value="" disabled>Select a Branch</option>
                  <option value="KPHB">KPHB</option>
                  <option value="Nallagandla">Nallagandla</option>
                  <option value="Dilshuknagar">Dilshuknagar</option>
                  <option value="Chandanagar">Chandanagar</option>
                </select>
              </div>

              {/* Staff Login Credentials (Directly below Assign to Branch) */}
              <div style={{ background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: '12px', padding: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '14px' }}>🔐</span>
                    <span style={{ fontSize: '12.5px !important', fontWeight: 800, color: '#0f172a' }}>Staff Login Credentials</span>
                  </div>
                  <span style={{ fontSize: '10.5px !important', background: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: '6px', fontWeight: 700 }}>
                    Regular Staff Only
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px !important', fontWeight: 700, color: '#334155', marginBottom: '5px' }}>
                      Staff Login Email ID *
                    </label>
                    <input
                      type="email"
                      placeholder="e.g. anil@sph.com"
                      value={staffFormEmail}
                      onChange={e => setStaffFormEmail(e.target.value)}
                      required
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        borderRadius: '10px',
                        border: '1px solid #cbd5e1',
                        fontSize: '13px !important',
                        color: '#0f172a',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                      <label style={{ fontSize: '12px !important', fontWeight: 700, color: '#334155' }}>
                        Staff Login Password *
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowStaffPassword(!showStaffPassword)}
                        style={{ background: 'none', border: 'none', color: '#258ec8', fontSize: '11px !important', fontWeight: 700, cursor: 'pointer', padding: 0 }}
                      >
                        {showStaffPassword ? 'Hide' : 'Show'} Password
                      </button>
                    </div>
                    <input
                      type={showStaffPassword ? 'text' : 'password'}
                      placeholder="Standard default: email123"
                      value={staffFormPassword}
                      onChange={e => setStaffFormPassword(e.target.value)}
                      required
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        borderRadius: '10px',
                        border: '1px solid #cbd5e1',
                        fontSize: '13px !important',
                        color: '#0f172a',
                        outline: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                    <span style={{ fontSize: '11px !important', color: '#64748b', marginTop: '4px', display: 'block' }}>
                      Standard default password is <strong>email123</strong>. HR/Admin can edit ID & password at any time.
                    </span>
                  </div>
                </div>
              </div>

              {/* Salary & Work Schedule Box */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h4 style={{ fontSize: '13px !important', fontWeight: 800, color: '#1e293b' }}>
                    💼 Salary & Work Schedule
                  </h4>
                  <span style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0', fontSize: '11px !important', fontWeight: 800, padding: '3px 8px', borderRadius: '6px' }}>
                    ⏱️ {calculateDailyHoursFromSlots(staffFormSlots)}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {/* Monthly Base Salary (Rs) */}
                  <div>
                    <label style={{ display: 'block', fontSize: '12px !important', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                      Monthly Base Salary (Rs)
                    </label>
                    <input
                      type="number"
                      placeholder="e.g. 25000"
                      value={staffFormSalary}
                      onChange={e => setStaffFormSalary(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        borderRadius: '10px',
                        border: '1px solid #cbd5e1',
                        fontSize: '13px !important',
                        color: '#0f172a',
                        background: '#ffffff',
                        outline: 'none'
                      }}
                    />
                  </div>

                  {/* Shift Type */}
                  <div>
                    <label style={{ display: 'block', fontSize: '12px !important', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                      Shift Type
                    </label>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      {['Single Strict', 'Multi Strict'].map(type => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => {
                            setStaffFormShiftType(type as any);
                            if (type === 'Multi Strict' && staffFormSlots.length < 2) {
                              setStaffFormSlots([
                                { loginTime: '09:00 AM', logoutTime: '01:00 PM' },
                                { loginTime: '04:00 PM', logoutTime: '08:30 PM' }
                              ]);
                            } else if (type === 'Single Strict' && staffFormSlots.length > 1) {
                              setStaffFormSlots([staffFormSlots[0]]);
                            }
                          }}
                          style={{
                            flex: 1,
                            padding: '9px 12px',
                            borderRadius: '9px',
                            border: staffFormShiftType === type ? '2px solid #2563eb' : '1px solid #cbd5e1',
                            background: staffFormShiftType === type ? '#eff6ff' : '#ffffff',
                            color: staffFormShiftType === type ? '#1d4ed8' : '#64748b',
                            fontWeight: staffFormShiftType === type ? 800 : 600,
                            fontSize: '12.5px !important',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease'
                          }}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Dynamic Shift Slots (Login Time 1, Logout Time 1, Login Time 2, Logout Time 2...) */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {staffFormSlots.map((slot, idx) => {
                      const loginComp = parseTimeComponents(slot.loginTime);
                      const logoutComp = parseTimeComponents(slot.logoutTime);

                      return (
                        <div key={idx} style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '12px', padding: '14px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                            <span style={{ fontSize: '12.5px !important', fontWeight: 800, color: '#2563eb' }}>
                              {staffFormShiftType === 'Multi Strict' ? `Shift Slot ${idx + 1}` : 'Shift Hours Schedule'}
                            </span>
                            {staffFormShiftType === 'Multi Strict' && staffFormSlots.length > 1 && (
                              <button
                                type="button"
                                onClick={() => setStaffFormSlots(prev => prev.filter((_, i) => i !== idx))}
                                style={{
                                  background: '#fef2f2',
                                  border: '1px solid #fecaca',
                                  borderRadius: '6px',
                                  padding: '4px 8px',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  fontSize: '11px !important',
                                  color: '#dc2626',
                                  fontWeight: 700
                                }}
                              >
                                <Trash2 size={12} color="#dc2626" /> Remove
                              </button>
                            )}
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                            {/* Login Time Selector */}
                            <div>
                              <label style={{ display: 'block', fontSize: '11.5px !important', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                                ⏰ Login Time {staffFormShiftType === 'Multi Strict' ? idx + 1 : ''}
                              </label>
                              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                <select
                                  value={loginComp.hour}
                                  onChange={e => handleSlotTimeComponentChange(idx, 'loginTime', 'hour', e.target.value)}
                                  style={{ flex: 1, padding: '8px 4px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12.5px !important', fontWeight: 700, color: '#0f172a', background: '#ffffff', textAlign: 'center', outline: 'none' }}
                                >
                                  {hoursList.map(h => <option key={h} value={h}>{h}</option>)}
                                </select>
                                <span style={{ fontWeight: 800, color: '#64748b' }}>:</span>
                                <select
                                  value={loginComp.minute}
                                  onChange={e => handleSlotTimeComponentChange(idx, 'loginTime', 'minute', e.target.value)}
                                  style={{ flex: 1, padding: '8px 4px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12.5px !important', fontWeight: 700, color: '#0f172a', background: '#ffffff', textAlign: 'center', outline: 'none' }}
                                >
                                  {minutesList.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                                <select
                                  value={loginComp.ampm}
                                  onChange={e => handleSlotTimeComponentChange(idx, 'loginTime', 'ampm', e.target.value)}
                                  style={{ flex: 1, padding: '8px 4px', borderRadius: '8px', border: '1px solid #258ec8', fontSize: '12.5px !important', fontWeight: 800, color: '#1d4ed8', background: '#eff6ff', textAlign: 'center', outline: 'none' }}
                                >
                                  <option value="AM">AM</option>
                                  <option value="PM">PM</option>
                                </select>
                              </div>
                            </div>

                            {/* Logout Time Selector */}
                            <div>
                              <label style={{ display: 'block', fontSize: '11.5px !important', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                                ⏰ Logout Time {staffFormShiftType === 'Multi Strict' ? idx + 1 : ''}
                              </label>
                              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                <select
                                  value={logoutComp.hour}
                                  onChange={e => handleSlotTimeComponentChange(idx, 'logoutTime', 'hour', e.target.value)}
                                  style={{ flex: 1, padding: '8px 4px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12.5px !important', fontWeight: 700, color: '#0f172a', background: '#ffffff', textAlign: 'center', outline: 'none' }}
                                >
                                  {hoursList.map(h => <option key={h} value={h}>{h}</option>)}
                                </select>
                                <span style={{ fontWeight: 800, color: '#64748b' }}>:</span>
                                <select
                                  value={logoutComp.minute}
                                  onChange={e => handleSlotTimeComponentChange(idx, 'logoutTime', 'minute', e.target.value)}
                                  style={{ flex: 1, padding: '8px 4px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '12.5px !important', fontWeight: 700, color: '#0f172a', background: '#ffffff', textAlign: 'center', outline: 'none' }}
                                >
                                  {minutesList.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                                <select
                                  value={logoutComp.ampm}
                                  onChange={e => handleSlotTimeComponentChange(idx, 'logoutTime', 'ampm', e.target.value)}
                                  style={{ flex: 1, padding: '8px 4px', borderRadius: '8px', border: '1px solid #258ec8', fontSize: '12.5px !important', fontWeight: 800, color: '#1d4ed8', background: '#eff6ff', textAlign: 'center', outline: 'none' }}
                                >
                                  <option value="AM">AM</option>
                                  <option value="PM">PM</option>
                                </select>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {/* Add Slot Button for Multi Strict */}
                    {staffFormShiftType === 'Multi Strict' && (
                      <button
                        type="button"
                        onClick={() => setStaffFormSlots(prev => [...prev, { loginTime: '04:00 PM', logoutTime: '08:30 PM' }])}
                        style={{
                          width: '100%',
                          padding: '9px 12px',
                          borderRadius: '8px',
                          border: '1px dashed #258ec8',
                          background: '#eff6ff',
                          color: '#1d4ed8',
                          fontWeight: 700,
                          fontSize: '12px !important',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px'
                        }}
                      >
                        <Plus size={14} /> + Add Shift Slot (Login/Logout Pair)
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Modal Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowAddStaffModal(false)}
                  style={{
                    padding: '10px 18px',
                    borderRadius: '10px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#475569',
                    fontSize: '13px !important',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '10px 22px',
                    borderRadius: '10px',
                    border: 'none',
                    background: '#2563eb',
                    color: '#ffffff',
                    fontSize: '13px !important',
                    fontWeight: 800,
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(37, 99, 235, 0.25)'
                  }}
                >
                  {editingStaffId ? 'Update Staff Member' : 'Save Staff Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD / EDIT DOCTOR MODAL */}
      {showAddDoctorModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.5)',
          backdropFilter: 'blur(3px)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '16px',
            maxWidth: '520px',
            width: '100%',
            padding: '24px',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            border: '1px solid #e2e8f0'
          }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', paddingBottom: '14px', borderBottom: '1px solid #f1f5f9' }}>
              <div>
                <h3 style={{ fontSize: '16px !important', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  {editingDoctorId ? 'Edit Doctor Profile' : 'Add New Doctor'}
                </h3>
                <p style={{ fontSize: '12px !important', color: '#64748b', marginTop: '3px', margin: 0, fontWeight: 500 }}>
                  Configure practitioner details and work schedule.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddDoctorModal(false)}
                style={{
                  background: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  width: '30px',
                  height: '30px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#64748b'
                }}
              >
                <X size={16} color="#64748b" />
              </button>
            </div>

            <form onSubmit={handleSaveDoctor} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Assign Staff Role */}
              <div>
                <label style={{ display: 'block', fontSize: '12px !important', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Assign Staff Role
                </label>
                <select
                  disabled
                  value="Doctor"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px !important',
                    fontWeight: 700,
                    color: '#334155',
                    background: '#f8fafc',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                >
                  <option value="Doctor">Doctor</option>
                </select>
              </div>

              {/* Doctor Category */}
              <div>
                <label style={{ display: 'block', fontSize: '12px !important', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Doctor Category
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  {(['Head Doctor', 'Employee Doctor'] as const).map(cat => {
                    const isSelected = doctorFormCategory === cat;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setDoctorFormCategory(cat)}
                        style={{
                          padding: '10px 12px',
                          borderRadius: '8px',
                          border: isSelected ? '2px solid #2563eb' : '1px solid #cbd5e1',
                          background: isSelected ? '#eff6ff' : '#ffffff',
                          color: isSelected ? '#1d4ed8' : '#475569',
                          fontWeight: isSelected ? 800 : 600,
                          fontSize: '13px !important',
                          cursor: 'pointer',
                          textAlign: 'center',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {cat}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Full Name */}
              <div>
                <label style={{ display: 'block', fontSize: '12px !important', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Full Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Dr. John Doe"
                  value={doctorFormName}
                  onChange={e => setDoctorFormName(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px !important',
                    color: '#0f172a',
                    fontWeight: 600,
                    outline: 'none',
                    background: '#ffffff',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* Mobile Number (without +91) */}
              <div>
                <label style={{ display: 'block', fontSize: '12px !important', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Mobile Number (without +91)
                </label>
                <input
                  type="text"
                  placeholder="e.g. 9876543210"
                  value={doctorFormMobile}
                  onChange={e => setDoctorFormMobile(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px !important',
                    color: '#0f172a',
                    fontWeight: 600,
                    outline: 'none',
                    background: '#ffffff',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* Salary & Work Schedule Box (Only for Employee Doctors) */}
              {doctorFormCategory === 'Employee Doctor' && (
                <div style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px',
                  padding: '16px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <h4 style={{ fontSize: '13px !important', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                      Salary & Work Schedule
                    </h4>
                    <span style={{
                      background: '#f0fdf4',
                      color: '#16a34a',
                      border: '1px solid #bbf7d0',
                      fontSize: '11px !important',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '6px'
                    }}>
                      {calculateDailyHoursFromSlots(doctorFormSlots)}
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {/* Monthly Base Salary (Rs) */}
                    <div>
                      <label style={{ display: 'block', fontSize: '12px !important', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                        Monthly Base Salary (Rs)
                      </label>
                      <input
                        type="number"
                        placeholder="e.g. 25000"
                        value={doctorFormSalary}
                        onChange={e => setDoctorFormSalary(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '9px 12px',
                          borderRadius: '8px',
                          border: '1px solid #cbd5e1',
                          fontSize: '13px !important',
                          color: '#0f172a',
                          fontWeight: 600,
                          background: '#ffffff',
                          outline: 'none',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>

                    {/* Shift Type */}
                    <div>
                      <label style={{ display: 'block', fontSize: '12px !important', fontWeight: 700, color: '#475569', marginBottom: '6px' }}>
                        Shift Type
                      </label>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        {(['Single Strict', 'Multi Strict'] as const).map(type => (
                          <button
                            key={type}
                            type="button"
                            onClick={() => {
                              setDoctorFormShiftType(type);
                              if (type === 'Multi Strict' && doctorFormSlots.length < 2) {
                                setDoctorFormSlots([
                                  { loginTime: '09:00 AM', logoutTime: '01:00 PM' },
                                  { loginTime: '04:00 PM', logoutTime: '08:30 PM' }
                                ]);
                              } else if (type === 'Single Strict' && doctorFormSlots.length > 1) {
                                setDoctorFormSlots([doctorFormSlots[0]]);
                              }
                            }}
                            style={{
                              padding: '8px 10px',
                              borderRadius: '8px',
                              border: doctorFormShiftType === type ? '2px solid #2563eb' : '1px solid #cbd5e1',
                              background: doctorFormShiftType === type ? '#eff6ff' : '#ffffff',
                              color: doctorFormShiftType === type ? '#1d4ed8' : '#475569',
                              fontWeight: doctorFormShiftType === type ? 800 : 600,
                              fontSize: '12px !important',
                              cursor: 'pointer'
                            }}
                          >
                            {type}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Dynamic Shift Slots */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {doctorFormSlots.map((slot, idx) => {
                        const loginComp = parseTimeComponents(slot.loginTime);
                        const logoutComp = parseTimeComponents(slot.logoutTime);

                        return (
                          <div key={idx} style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                              <span style={{ fontSize: '12px !important', fontWeight: 700, color: '#334155' }}>
                                {doctorFormShiftType === 'Multi Strict' ? `Shift Slot ${idx + 1}` : 'Shift Hours Schedule'}
                              </span>
                              {doctorFormShiftType === 'Multi Strict' && doctorFormSlots.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => setDoctorFormSlots(prev => prev.filter((_, i) => i !== idx))}
                                  style={{
                                    background: '#fef2f2',
                                    border: '1px solid #fecaca',
                                    borderRadius: '4px',
                                    padding: '2px 6px',
                                    cursor: 'pointer',
                                    fontSize: '11px !important',
                                    color: '#dc2626',
                                    fontWeight: 700
                                  }}
                                >
                                  Remove
                                </button>
                              )}
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                              {/* Login Time Selector */}
                              <div>
                                <label style={{ display: 'block', fontSize: '11px !important', fontWeight: 700, color: '#64748b', marginBottom: '4px' }}>
                                  Login Time {doctorFormShiftType === 'Multi Strict' ? idx + 1 : ''}
                                </label>
                                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                  <select
                                    value={loginComp.hour}
                                    onChange={e => handleSlotDoctorTimeChange(idx, 'loginTime', 'hour', e.target.value)}
                                    style={{ flex: 1, padding: '6px 4px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px !important', fontWeight: 700, color: '#0f172a', background: '#ffffff', textAlign: 'center', outline: 'none' }}
                                  >
                                    {hoursList.map(h => <option key={h} value={h}>{h}</option>)}
                                  </select>
                                  <span style={{ fontWeight: 700, color: '#64748b' }}>:</span>
                                  <select
                                    value={loginComp.minute}
                                    onChange={e => handleSlotDoctorTimeChange(idx, 'loginTime', 'minute', e.target.value)}
                                    style={{ flex: 1, padding: '6px 4px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px !important', fontWeight: 700, color: '#0f172a', background: '#ffffff', textAlign: 'center', outline: 'none' }}
                                  >
                                    {minutesList.map(m => <option key={m} value={m}>{m}</option>)}
                                  </select>
                                  <select
                                    value={loginComp.ampm}
                                    onChange={e => handleSlotDoctorTimeChange(idx, 'loginTime', 'ampm', e.target.value)}
                                    style={{ flex: 1, padding: '6px 4px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px !important', fontWeight: 700, color: '#1d4ed8', background: '#eff6ff', textAlign: 'center', outline: 'none' }}
                                  >
                                    <option value="AM">AM</option>
                                    <option value="PM">PM</option>
                                  </select>
                                </div>
                              </div>

                              {/* Logout Time Selector */}
                              <div>
                                <label style={{ display: 'block', fontSize: '11px !important', fontWeight: 700, color: '#64748b', marginBottom: '4px' }}>
                                  Logout Time {doctorFormShiftType === 'Multi Strict' ? idx + 1 : ''}
                                </label>
                                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                  <select
                                    value={logoutComp.hour}
                                    onChange={e => handleSlotDoctorTimeChange(idx, 'logoutTime', 'hour', e.target.value)}
                                    style={{ flex: 1, padding: '6px 4px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px !important', fontWeight: 700, color: '#0f172a', background: '#ffffff', textAlign: 'center', outline: 'none' }}
                                  >
                                    {hoursList.map(h => <option key={h} value={h}>{h}</option>)}
                                  </select>
                                  <span style={{ fontWeight: 700, color: '#64748b' }}>:</span>
                                  <select
                                    value={logoutComp.minute}
                                    onChange={e => handleSlotDoctorTimeChange(idx, 'logoutTime', 'minute', e.target.value)}
                                    style={{ flex: 1, padding: '6px 4px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px !important', fontWeight: 700, color: '#0f172a', background: '#ffffff', textAlign: 'center', outline: 'none' }}
                                  >
                                    {minutesList.map(m => <option key={m} value={m}>{m}</option>)}
                                  </select>
                                  <select
                                    value={logoutComp.ampm}
                                    onChange={e => handleSlotDoctorTimeChange(idx, 'logoutTime', 'ampm', e.target.value)}
                                    style={{ flex: 1, padding: '6px 4px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px !important', fontWeight: 700, color: '#1d4ed8', background: '#eff6ff', textAlign: 'center', outline: 'none' }}
                                  >
                                    <option value="AM">AM</option>
                                    <option value="PM">PM</option>
                                  </select>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {/* Add Slot Button for Multi Strict */}
                      {doctorFormShiftType === 'Multi Strict' && (
                        <button
                          type="button"
                          onClick={() => setDoctorFormSlots(prev => [...prev, { loginTime: '04:00 PM', logoutTime: '08:30 PM' }])}
                          style={{
                            width: '100%',
                            padding: '8px 12px',
                            borderRadius: '6px',
                            border: '1px dashed #cbd5e1',
                            background: '#ffffff',
                            color: '#2563eb',
                            fontWeight: 700,
                            fontSize: '12px !important',
                            cursor: 'pointer'
                          }}
                        >
                          + Add Shift Slot
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Modal Action Footer */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px', paddingTop: '14px', borderTop: '1px solid #f1f5f9' }}>
                <button
                  type="button"
                  onClick={() => setShowAddDoctorModal(false)}
                  style={{
                    padding: '9px 16px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#475569',
                    fontSize: '13px !important',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '9px 20px',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#2563eb',
                    color: '#ffffff',
                    fontSize: '13px !important',
                    fontWeight: 800,
                    cursor: 'pointer',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                  }}
                >
                  {editingDoctorId ? 'Update Doctor Profile' : 'Save Doctor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
