import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput, Alert, Modal } from 'react-native';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getSafeDb, collection, onSnapshot, addDoc, updateDoc, setDoc, doc, deleteDoc
} from '../../utils/firebaseSafe';
import { resolveCanonicalBranchId, BRANCHES, DEFAULT_STAFF_MEMBERS } from '@app/shared';
import { DoctorTimingsScreen } from './DoctorTimings/DoctorTimingsScreen';
import { ManageBranchesScreen } from './ManageBranches/ManageBranchesScreen';
import { AttendanceRosterScreen } from '../HR/AttendanceRoster/AttendanceRosterScreen';
import { EmployeeDailyWorksScreen } from '../HR/EmployeeWorks/EmployeeDailyWorksScreen';
import { BranchCleaningScreen } from './BranchCleaning/BranchCleaningScreen';
import { AnalyticsRevenueScreen } from './AnalyticsRevenue/AnalyticsRevenueScreen';
import { createFeeDiscountResponseNotificationInFirestore } from '../../utils/fcmService';

interface AdminScreenProps {
  currentTab?: string;
  role?: string;
  onNavigateTab?: (tab: string) => void;
}

export const AdminScreen: React.FC<AdminScreenProps> = ({ currentTab, role = 'admin', onNavigateTab }) => {
  const db = getSafeDb();
  const normalizeTab = (tabStr?: string) => {
    if (!tabStr) return 'analytics';
    if (tabStr === 'fee_requests' || tabStr === 'hr_fee_requests' || tabStr === 'fees') return 'fee_requests';
    if (tabStr === 'leave_requests' || tabStr === 'hr_leave_requests' || tabStr === 'leaves') return 'leave_requests';
    if (tabStr === 'branch_cleaning' || tabStr === 'cleaning' || tabStr === 'sanitation' || tabStr === 'admin_cleaning') return 'branch_cleaning';
    if (tabStr === 'employee_attendance' || tabStr === 'admin_attendance' || tabStr === 'attendance' || tabStr === 'attendance_report') return 'employee_attendance';
    if (tabStr === 'employee_works' || tabStr === 'admin_employee_works' || tabStr === 'daily_works' || tabStr === 'works') return 'employee_works';
    if (tabStr === 'admin_staff' || tabStr === 'staff') return 'staff';
    if (tabStr === 'admin_doctors' || tabStr === 'doctors') return 'doctors';
    if (tabStr === 'admin_branches' || tabStr === 'branches') return 'branches';
    if (tabStr === 'admin_patients' || tabStr === 'patients') return 'patients';
    if (tabStr === 'admin_packages' || tabStr === 'package_members') return 'package_members';
    if (tabStr === 'admin_banners' || tabStr === 'banners') return 'banners';
    if (tabStr === 'admin_medicines' || tabStr === 'medicine') return 'medicine';
    if (tabStr === 'admin_revenue' || tabStr === 'revenue' || tabStr === 'total_revenue' || tabStr === 'finance') return 'revenue';
    if (tabStr === 'admin_pending' || tabStr === 'admin' || tabStr === 'analytics') return 'analytics';
    return 'analytics';
  };

  const [activeTab, setActiveTab] = useState<'analytics' | 'revenue' | 'fee_requests' | 'leave_requests' | 'branch_cleaning' | 'employee_attendance' | 'employee_works' | 'package_members' | 'banners' | 'branches' | 'patients' | 'doctors' | 'staff' | 'medicine'>(() => normalizeTab(currentTab));

  useEffect(() => {
    if (currentTab) {
      setActiveTab(normalizeTab(currentTab));
    }
  }, [currentTab]);
  const [staffCategory, setStaffCategory] = useState<'staff' | 'reception' | 'doctors' | 'hr'>('staff');

  interface StaffItem {
    id?: string;
    name: string;
    phone: string;
    mobile: string;
    role: string;
    branch: string;
    shift?: string;
    hours: string;
    salary: string;
    shiftType?: string;
    email?: string;
    password?: string;
  }

  const [liveStaffMembers, setLiveStaffMembers] = useState<StaffItem[]>(DEFAULT_STAFF_MEMBERS as StaffItem[]);

  useEffect(() => {
    // 1. Instant load from local AsyncStorage
    AsyncStorage.getItem('@sph_cached_staff_members').then(raw => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setLiveStaffMembers(parsed);
          }
        } catch (e) {}
      }
    }).catch(() => {});

    // 2. Background live sync from Firestore
    if (!db) return;
    const colRef = collection(db, 'staff');
    const unsub = onSnapshot(colRef, (snap) => {
      if (!snap.empty) {
        const loaded = snap.docs.map(d => {
          const data = d.data();
          const cleanName = (data.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          return {
            id: d.id,
            name: data.name || 'Staff Member',
            phone: data.mobile || data.phone || '-',
            mobile: data.mobile || data.phone || '-',
            role: data.role || 'Regular Staff',
            branch: data.branch || 'KPHB',
            shift: data.shift || '10:00 AM - 08:30 PM',
            hours: data.hours || '8.5 hrs/day',
            salary: data.salary || '₹18,000',
            email: data.email || (cleanName ? `${cleanName}@sph.com` : ''),
            password: data.password || 'email123',
            loginTime: data.loginTime,
            logoutTime: data.logoutTime,
            shiftType: data.shiftType
          };
        });
        setLiveStaffMembers(loaded);
        AsyncStorage.setItem('@sph_cached_staff_members', JSON.stringify(loaded)).catch(() => {});
      }
    }, (err) => console.warn('Firestore mobile staff listener error:', err));
    return () => unsub();
  }, []);

  const handleDeleteStaff = (staffId?: string, staffName?: string) => {
    Alert.alert(
      'Delete Staff Member',
      `Are you sure you want to delete ${staffName || 'this staff member'}?\n\nTheir login access will be immediately revoked across both Web and Mobile App.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete & Revoke Access',
          style: 'destructive',
          onPress: async () => {
            if (staffId && db) {
              try {
                await deleteDoc(doc(db, 'staff', staffId));
              } catch (e) {
                console.warn('Error deleting staff:', e);
              }
            }
            setLiveStaffMembers(prev => {
              const updated = prev.filter(s => (s as any).id !== staffId && s.name !== staffName);
              AsyncStorage.setItem('@sph_cached_staff_members', JSON.stringify(updated)).catch(() => {});
              return updated;
            });
            Alert.alert('Deleted', `${staffName} has been deleted and their login access is revoked.`);
          }
        }
      ]
    );
  };

  interface DoctorItem {
    id?: string;
    name: string;
    role: string;
    category: string;
    phone: string;
    mobile?: string;
    shift: string;
    hours: string;
    salary: string;
  }

  const DEFAULT_DOCTORS: DoctorItem[] = [
    { id: 'doc-prashanth', name: 'Dr. Prashanth k vaidya', role: 'Head Doctor', category: 'Head Doctor', phone: '8125260176', mobile: '8125260176', shift: '-', hours: '-', salary: '-' },
    { id: 'doc-jobeadh', name: 'Dr. Jobeadh parveej', role: 'Head Doctor', category: 'Head Doctor', phone: '9903119766', mobile: '9903119766', shift: '-', hours: '-', salary: '-' },
    { id: 'doc-padma', name: 'Dr. Padma priya', role: 'Employee Doctor', category: 'Employee Doctor', phone: '9490808582', mobile: '9490808582', shift: '10:00 AM - 08:00 PM', hours: '10 hrs/day', salary: '₹95,000' },
    { id: 'doc-ramakrishna', name: 'Dr. Ramakrishna Chanduri', role: 'Head Doctor', category: 'Head Doctor', phone: '1111111111', mobile: '1111111111', shift: '-', hours: '-', salary: '-' },
  ];

  const [liveDoctors, setLiveDoctors] = useState<DoctorItem[]>(DEFAULT_DOCTORS);

  useEffect(() => {
    if (!db) return;
    const docColRef = collection(db, 'doctors');
    const unsub = onSnapshot(docColRef, (snap) => {
      if (!snap.empty) {
        const loaded = snap.docs.map(d => {
          const data = d.data();
          const category = data.category || (data.role?.includes('Employee') ? 'Employee Doctor' : 'Head Doctor');
          return {
            id: d.id,
            name: data.name || 'Doctor',
            role: category,
            category: category,
            phone: data.mobile || data.phone || '0000000000',
            mobile: data.mobile || data.phone || '0000000000',
            shift: category === 'Head Doctor' ? '-' : (data.shift || '-'),
            hours: category === 'Head Doctor' ? '-' : (data.hours || '-'),
            salary: category === 'Head Doctor' ? '-' : (data.salary || '-')
          };
        });
        setLiveDoctors(loaded);
      }
    }, (err) => console.warn('Firestore mobile doctors listener error:', err));
    return () => unsub();
  }, []);

  const handleDeleteDoctor = (docId?: string, docName?: string) => {
    Alert.alert(
      'Delete Doctor',
      `Are you sure you want to delete ${docName || 'this doctor'}?\n\nTheir login access will be immediately revoked across both Web and Mobile App.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete & Revoke Access',
          style: 'destructive',
          onPress: async () => {
            if (docId && db) {
              try {
                await deleteDoc(doc(db, 'doctors', docId));
              } catch (e) {
                console.warn('Error deleting doctor from Firestore:', e);
              }
            }
            setLiveDoctors(prev => prev.filter(d => (d as any).id !== docId && d.name !== docName));
            Alert.alert('Deleted', `${docName} has been deleted and their login access is revoked.`);
          }
        }
      ]
    );
  };

  // Add / Edit Staff Modal state
  const [showAddStaffModal, setShowAddStaffModal] = useState(false);
  const [showEditStaffModal, setShowEditStaffModal] = useState(false);
  const [editingStaffId, setEditingStaffId] = useState('');
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffPhone, setNewStaffPhone] = useState('');
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [newStaffPassword, setNewStaffPassword] = useState('email123');
  const [showStaffPassword, setShowStaffPassword] = useState(false);
  const [newStaffBranch, setNewStaffBranch] = useState('KPHB');
  const [newStaffSalary, setNewStaffSalary] = useState('');
  const [staffShiftType, setStaffShiftType] = useState<'Single Strict' | 'Multi Strict'>('Single Strict');
  const [staffShiftSlots, setStaffShiftSlots] = useState([
    { loginTime: '10:00 AM', logoutTime: '08:30 PM' }
  ]);

  const parseTimeToMinutes = (timeStr: string) => {
    if (!timeStr) return 0;
    const match = timeStr.trim().match(/^(\d{1,2}):?(\d{2})?\s*(AM|PM)?$/i);
    if (!match) return 0;
    let h = parseInt(match[1]) || 0;
    let m = parseInt(match[2]) || 0;
    let ampm = match[3]?.toUpperCase();
    if (ampm === 'PM' && h < 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    return h * 60 + m;
  };

  const getCalculatedDailyHours = () => {
    let totalMins = 0;
    staffShiftSlots.forEach(s => {
      let startMins = parseTimeToMinutes(s.loginTime || '10:00 AM');
      let endMins = parseTimeToMinutes(s.logoutTime || '08:30 PM');
      if (endMins > startMins) {
        totalMins += (endMins - startMins);
      }
    });
    if (totalMins <= 0) return '8.5 hrs/day';
    const hrs = (totalMins / 60).toFixed(1);
    return `${hrs.endsWith('.0') ? hrs.slice(0, -2) : hrs} hrs/day`;
  };

  const getFormattedShiftString = () => {
    return staffShiftSlots.map(s => `${s.loginTime || '10:00 AM'} - ${s.logoutTime || '08:30 PM'}`).join(' & ');
  };

  const handleOpenAddStaff = () => {
    setEditingStaffId('');
    setNewStaffName('');
    setNewStaffPhone('');
    setNewStaffEmail('');
    setNewStaffPassword('email123');
    setShowStaffPassword(false);
    setNewStaffBranch('KPHB');
    setNewStaffSalary('');
    setStaffShiftType('Single Strict');
    setStaffShiftSlots([{ loginTime: '10:00 AM', logoutTime: '08:30 PM' }]);
    setShowAddStaffModal(true);
  };

  const handleOpenEditStaff = (s: StaffItem) => {
    setEditingStaffId(s.id || '');
    setNewStaffName(s.name || '');
    setNewStaffPhone(s.phone || s.mobile || '');
    const cleanName = (s.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    setNewStaffEmail(s.email || (cleanName ? `${cleanName}@sph.com` : ''));
    setNewStaffPassword(s.password || 'email123');
    setShowStaffPassword(false);
    setNewStaffBranch(s.branch || 'KPHB');
    setNewStaffSalary(s.salary ? s.salary.replace(/[^0-9]/g, '') : '18000');
    setStaffShiftType(s.shiftType === 'Multi Strict' ? 'Multi Strict' : 'Single Strict');
    if (s.shift && s.shift.includes('&')) {
      const parts = s.shift.split('&').map((p: string) => {
        const [loginTime, logoutTime] = p.split('-').map((t: string) => t.trim());
        return { loginTime: loginTime || '10:00 AM', logoutTime: logoutTime || '08:30 PM' };
      });
      setStaffShiftSlots(parts);
    } else if (s.shift && s.shift.includes('-')) {
      const [loginTime, logoutTime] = s.shift.split('-').map((t: string) => t.trim());
      setStaffShiftSlots([{ loginTime: loginTime || '10:00 AM', logoutTime: logoutTime || '08:30 PM' }]);
    } else {
      setStaffShiftSlots([{ loginTime: '10:00 AM', logoutTime: '08:30 PM' }]);
    }
    setShowEditStaffModal(true);
  };

  const handleSaveNewStaff = async () => {
    if (!newStaffName.trim() || !newStaffPhone.trim()) {
      Alert.alert('Required Fields', 'Please enter staff name and mobile number.');
      return;
    }
    const cleanName = newStaffName.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    const emailToSave = newStaffEmail.trim().toLowerCase() || (cleanName ? `${cleanName}@sph.com` : '');
    const passwordToSave = newStaffPassword.trim() || 'email123';
    const calculatedHours = getCalculatedDailyHours();
    const formattedShift = getFormattedShiftString();
    const formattedSalary = newStaffSalary.trim() ? `₹${newStaffSalary.trim().replace(/^₹/, '')}` : '₹18,000';

    const staffData: StaffItem = {
      name: newStaffName.trim(),
      phone: newStaffPhone.trim(),
      mobile: newStaffPhone.trim(),
      email: emailToSave,
      password: passwordToSave,
      role: 'Regular Staff',
      branch: newStaffBranch,
      shiftType: staffShiftType,
      shift: formattedShift,
      hours: calculatedHours,
      salary: formattedSalary
    };

    if (showEditStaffModal && editingStaffId && db) {
      try {
        await setDoc(doc(db, 'staff', editingStaffId), staffData, { merge: true });
        setLiveStaffMembers(prev => {
          const updated = prev.map(s => s.id === editingStaffId ? { ...s, ...staffData, id: editingStaffId } : s);
          AsyncStorage.setItem('@sph_cached_staff_members', JSON.stringify(updated)).catch(() => {});
          return updated;
        });
        Alert.alert('Updated', `Staff Member ${staffData.name} updated successfully.`);
      } catch (e) {
        console.warn('Error updating staff:', e);
      }
      setShowEditStaffModal(false);
      setEditingStaffId('');
    } else {
      const newStaffDoc = { ...staffData, createdAt: new Date().toISOString() };
      if (db) {
        try {
          const docRef = await addDoc(collection(db, 'staff'), newStaffDoc);
          staffData.id = docRef.id;
        } catch (e) {
          console.warn('Error saving staff:', e);
        }
      }
      setLiveStaffMembers(prev => {
        const updated = [staffData, ...prev];
        AsyncStorage.setItem('@sph_cached_staff_members', JSON.stringify(updated)).catch(() => {});
        return updated;
      });
      setShowAddStaffModal(false);
      Alert.alert('Saved', `Staff Member ${staffData.name} added successfully.`);
    }

    setNewStaffName('');
    setNewStaffPhone('');
    setNewStaffEmail('');
    setNewStaffPassword('email123');
    setNewStaffSalary('');
    setStaffShiftType('Single Strict');
    setStaffShiftSlots([
      { loginTime: '10:00 AM', logoutTime: '08:30 PM' }
    ]);
  };

  // Add Doctor Modal state
  const [showAddDoctorModal, setShowAddDoctorModal] = useState(false);
  const [showEditDoctorModal, setShowEditDoctorModal] = useState(false);
  const [editingDocId, setEditingDocId] = useState('');
  const [newDocCategory, setNewDocCategory] = useState<'Head Doctor' | 'Employee Doctor'>('Head Doctor');
  const [newDocName, setNewDocName] = useState('');
  const [newDocPhone, setNewDocPhone] = useState('');
  const [newDocShift, setNewDocShift] = useState('');
  const [newDocHours, setNewDocHours] = useState('');
  const [newDocSalary, setNewDocSalary] = useState('');

  const handleOpenEditDoctor = (d: any) => {
    setEditingDocId(d.id || '');
    setNewDocName(d.name || '');
    setNewDocPhone(d.phone || d.mobile || '');
    setNewDocCategory((d.category === 'Employee Doctor' || d.role?.includes('Employee')) ? 'Employee Doctor' : 'Head Doctor');
    setNewDocShift(d.shift && d.shift !== '-' ? d.shift : '10:00 AM - 08:00 PM');
    setNewDocHours(d.hours && d.hours !== '-' ? d.hours : '10 hrs/day');
    setNewDocSalary(d.salary && d.salary !== '-' ? d.salary : '₹95,000');
    setShowEditDoctorModal(true);
  };

  const handleSaveNewDoctor = async () => {
    if (!newDocName.trim() || !newDocPhone.trim()) {
      Alert.alert('Required Fields', 'Please enter doctor name and mobile number.');
      return;
    }
    const isHead = newDocCategory === 'Head Doctor';
    const doctorData = {
      name: newDocName.trim(),
      category: newDocCategory,
      role: newDocCategory,
      mobile: newDocPhone.trim(),
      phone: newDocPhone.trim(),
      shift: isHead ? '-' : (newDocShift.trim() || '10:00 AM - 08:00 PM'),
      hours: isHead ? '-' : (newDocHours.trim() || '10 hrs/day'),
      salary: isHead ? '-' : (newDocSalary.trim() || '₹95,000'),
      updatedAt: new Date().toISOString()
    };

    if (showEditDoctorModal && editingDocId && db) {
      try {
        await updateDoc(doc(db, 'doctors', editingDocId), doctorData);
        setLiveDoctors(prev => prev.map(d => (d as any).id === editingDocId ? { id: editingDocId, ...doctorData } : d));
        setShowEditDoctorModal(false);
        Alert.alert('Updated', `Doctor ${doctorData.name} updated successfully.`);
      } catch (e) {
        console.warn('Error updating doctor:', e);
      }
    } else {
      let newId = Date.now().toString();
      if (db) {
        try {
          const docRef = await addDoc(collection(db, 'doctors'), { ...doctorData, createdAt: new Date().toISOString() });
          newId = docRef.id;
        } catch (e) {
          console.warn('Error saving doctor:', e);
        }
      }
      setLiveDoctors(prev => [{ id: newId, ...doctorData }, ...prev]);
      setShowAddDoctorModal(false);
      Alert.alert('Saved', `${newDocCategory} ${doctorData.name} added successfully.`);
    }

    setNewDocName('');
    setNewDocPhone('');
    setNewDocShift('');
    setNewDocHours('');
    setNewDocSalary('');
  };

  // Medicine Edit Form
  const [medName, setMedName] = useState('');
  const [medPotency, setMedPotency] = useState('200C');
  const [medStock, setMedStock] = useState('150');

  // Daily Operations Date (Defaults to Today's date YYYY-MM-DD)
  const [dailyOpsDate, setDailyOpsDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [liveAppointments, setLiveAppointments] = useState<any[]>([]);
  const [selectedBranchModal, setSelectedBranchModal] = useState<any | null>(null);
  const [branchPatientFilter, setBranchPatientFilter] = useState<'all' | 'opted' | 'not_opted'>('all');

  useEffect(() => {
    if (!db) return;
    let appsFromAppointments: any[] = [];
    let appsFromAllPatients: any[] = [];

    let mergeTimer: any = null;
    const mergeAndSet = () => {
      if (mergeTimer) clearTimeout(mergeTimer);
      mergeTimer = setTimeout(() => {
        const combinedMap = new Map<string, any>();
        const phoneDateSet = new Set<string>();

        // 1. Add records from appointments collection
        appsFromAppointments.forEach(item => {
          if (item && item.id) {
            combinedMap.set(item.id, item);
            const cleanPhone = String(item.phoneNumber || item.phone || item.mobile || '').replace(/\D/g, '').slice(-10);
            const date = String(item.appointmentDate || item.date || '').trim();
            if (cleanPhone && date) {
              phoneDateSet.add(`${cleanPhone}_${date}`);
            }
          }
        });

        // 2. Merge from allpatients collection with instant O(1) deduplication
        appsFromAllPatients.forEach(item => {
          if (!item || !item.id) return;
          if (combinedMap.has(item.id)) {
            const existing = combinedMap.get(item.id);
            combinedMap.set(item.id, { ...existing, ...item });
          } else {
            const cleanPhone = String(item.phoneNumber || item.phone || item.mobile || '').replace(/\D/g, '').slice(-10);
            const date = String(item.appointmentDate || item.date || '').trim();
            const key = (cleanPhone && date) ? `${cleanPhone}_${date}` : null;
            if (!key || !phoneDateSet.has(key)) {
              combinedMap.set(item.id, item);
              if (key) phoneDateSet.add(key);
            }
          }
        });

        setLiveAppointments(Array.from(combinedMap.values()));
      }, 30);
    };

    const unsubApp = onSnapshot(collection(db, 'appointments'), (snap) => {
      appsFromAppointments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      mergeAndSet();
    }, (err) => console.warn('Firestore mobile appointments listener error:', err));

    const unsubPat = onSnapshot(collection(db, 'allpatients'), (snap) => {
      appsFromAllPatients = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      mergeAndSet();
    }, (err) => console.warn('Firestore mobile allpatients listener error:', err));

    return () => {
      unsubApp();
      unsubPat();
    };
  }, []);

  const FOUR_BRANCHES = [
    { id: 'kphb', name: 'KPHB Branch', phone: '+91 90301 76176', code: 'KPHB' },
    { id: 'nallagandla', name: 'Nallagandla Branch', phone: '+91 91321 76176', code: 'NALLAGANDLA' },
    { id: 'dilshuknagar', name: 'Dilshuknagar Branch', phone: '+91 98041 76176', code: 'DILSHUKNAGAR' },
    { id: 'chandanagar', name: 'Chandanagar Branch', phone: '+91 95531 76176', code: 'CHANDANAGAR' },
  ];

  const extractRevenue = (a: any) => {
    const candidates = [
      a.totalPaid,
      a.paidAmount,
      a.amountPaid,
      a.totalAmount,
      a.totalFee,
      a.amount,
      a.targetAmount,
      (Number(a.consultationFee || 0) + Number(a.medicineFee || 0) + Number(a.dietFee || 0))
    ];
    for (const c of candidates) {
      if (c !== undefined && c !== null && c !== '') {
        const num = Number(c);
        if (!isNaN(num) && num > 0) return num;
      }
    }
    return 0;
  };

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

  const isMatchingDate = (app: any, targetDate: string) => {
    const raw = String(app.appointmentDate || app.date || app.bookingDate || app.dateString || app.createdAt || '').trim();
    if (!raw) return false;
    if (raw.startsWith(targetDate)) return true;

    const parts = targetDate.split('-');
    if (parts.length === 3) {
      const [y, m, d] = parts;
      const dInt = parseInt(d, 10);
      const mInt = parseInt(m, 10);

      if (raw.includes(`${d}-${m}-${y}`)) return true;
      if (raw.includes(`${d}/${m}/${y}`)) return true;
      if (raw.includes(`${dInt}-${mInt}-${y}`)) return true;
      if (raw.includes(`${dInt}/${mInt}/${y}`)) return true;
      if (raw.includes(`${y}/${m}/${d}`)) return true;
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

  const handleSaveMedicine = () => {
    if (!medName) {
      Alert.alert('Required Field', 'Please enter medicine name.');
      return;
    }
    Alert.alert('Saved', `Medicine ${medName} saved successfully.`);
    setMedName('');
  };

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

  // Leave Requests State (Connected to Firestore 'leaves' collection)
  const [leaveRequests, setLeaveRequests] = useState<any[]>([]);

  useEffect(() => {
    if (!db) return;
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
    }, (err) => console.warn('Firestore mobile leaves error:', err));
    return () => unsub();
  }, []);

  const handleUpdateLeaveStatus = async (id: string, newStatus: 'Approved' | 'Rejected', colName: string = 'leaves') => {
    try {
      if (db) {
        await updateDoc(doc(db, colName, id), {
          status: newStatus,
          reviewedAt: new Date().toISOString(),
          reviewedBy: 'Admin / HR'
        });
        Alert.alert(
          newStatus === 'Approved' ? 'Leave Approved ✅' : 'Leave Rejected ❌',
          `Leave request has been marked as ${newStatus}.`
        );
      }
    } catch (e) {
      console.error('Error updating leave in Firestore:', e);
      try {
        const altCol = colName === 'leaves' ? 'leave_requests' : 'leaves';
        await updateDoc(doc(db!, altCol, id), {
          status: newStatus,
          reviewedAt: new Date().toISOString(),
          reviewedBy: 'Admin / HR'
        });
        Alert.alert(
          newStatus === 'Approved' ? 'Leave Approved ✅' : 'Leave Rejected ❌',
          `Leave request has been marked as ${newStatus}.`
        );
      } catch (err2) {
        Alert.alert('Error', 'Failed to update leave status.');
      }
    }
  };

  const pendingLeaveCount = leaveRequests.filter(r => normalizeStatus(r.status) === 'Pending').length;

  // Fee / Discount Requests State (Connected to Firestore 'fee_requests' collection)
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
    }, (err) => console.warn('Firestore mobile fee_requests error:', err));
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
      let rejectNote = '';
      if (newStatus === 'Rejected') {
        rejectNote = 'Discount request rejected by HR';
      }

      const updateData: any = {
        status: newStatus.toLowerCase(),
        reviewedAt: nowIso,
        reviewedBy: 'Admin / HR'
      };
      if (newStatus === 'Approved') {
        updateData.approvedDiscount = Number(req.requestedDiscount || 0);
      } else {
        updateData.rejectReason = rejectNote;
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
        reviewedBy: 'HR',
        appointmentId: req.appointmentId || id
      }).catch(() => {});

      Alert.alert('Status Updated', `Fee Discount Request successfully marked as ${newStatus}!`);
    } catch (e) {
      console.error('Error updating fee request status in mobile Firestore:', e);
      Alert.alert('Error', 'Failed to update fee request status. Please try again.');
    }
  };

  const pendingFeeCount = feeRequests.filter(r => normalizeFeeStatus(r.status) === 'Pending').length;

  if (activeTab === 'branch_cleaning') {
    return (
      <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
        <BranchCleaningScreen onBack={() => {
          setActiveTab('analytics');
          if (onNavigateTab) onNavigateTab('admin');
        }} role={role} />
      </View>
    );
  }

  if (activeTab === 'employee_works') {
    return (
      <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
        <EmployeeDailyWorksScreen onBack={() => setActiveTab('analytics')} />
      </View>
    );
  }

  if (activeTab === 'employee_attendance') {
    return (
      <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
        <AttendanceRosterScreen onBack={() => setActiveTab('analytics')} />
      </View>
    );
  }

  if (activeTab === 'branches') {
    return (
      <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
        <ManageBranchesScreen onBack={() => setActiveTab('analytics')} role={role} />
      </View>
    );
  }

  if (activeTab === 'doctors') {
    return (
      <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
        <DoctorTimingsScreen />
      </View>
    );
  }

  if (activeTab === 'revenue') {
    return (
      <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 12, paddingBottom: 10, backgroundColor: '#ffffff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity onPress={() => setActiveTab('analytics')} style={{ padding: 6, borderRadius: 8, backgroundColor: '#f1f5f9' }}>
              <Ionicons name="arrow-back" size={20} color="#0f172a" />
            </TouchableOpacity>
            <View>
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#0f172a' }}>Total Revenue Dashboard</Text>
              <Text style={{ fontSize: 11, color: '#64748b' }}>Live Financial Ledger & Breakdown</Text>
            </View>
          </View>
        </View>
        <AnalyticsRevenueScreen />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 60 }} showsVerticalScrollIndicator={false}>

      {/* TAB 1: ANALYTICS & REVENUE - 4 BRANCHES DAILY OPERATIONS */}
      {activeTab === 'analytics' && (
        <View style={{ gap: 14 }}>
          {/* DATE CONTROL & TITLE CARD */}
          <View style={{
            backgroundColor: '#ffffff',
            borderRadius: 16,
            padding: 14,
            borderWidth: 1,
            borderColor: '#e2e8f0',
            shadowColor: '#0f172a',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.04,
            shadowRadius: 3,
            elevation: 1
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ backgroundColor: '#eff6ff', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 }}>
                  <Text style={{ fontSize: 10, fontWeight: '800', color: '#258ec8' }}>4 CLINIC BRANCHES</Text>
                </View>
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#0f172a' }}>Daily Operations</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <TouchableOpacity
                  onPress={() => setActiveTab('revenue')}
                  style={{ backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8 }}
                >
                  <Text style={{ color: '#0284c7', fontSize: 11, fontWeight: '800' }}>📊 Total Revenue</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setDailyOpsDate(new Date().toISOString().split('T')[0])}
                  style={{ backgroundColor: '#258ec8', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}
                >
                  <Text style={{ color: '#ffffff', fontSize: 11, fontWeight: '800' }}>Today</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* DATE CONTROLS ROW */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
              <TouchableOpacity
                onPress={() => handleShiftOpsDate(-1)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  borderRadius: 8,
                  backgroundColor: '#f8fafc',
                  borderWidth: 1,
                  borderColor: '#cbd5e1',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 2
                }}
              >
                <Ionicons name="chevron-back" size={14} color="#475569" />
                <Text style={{ fontSize: 11.5, fontWeight: '700', color: '#475569' }}>Prev</Text>
              </TouchableOpacity>

              <View style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                backgroundColor: '#eff6ff',
                paddingVertical: 7,
                paddingHorizontal: 8,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: '#bfdbfe'
              }}>
                <Ionicons name="calendar-outline" size={14} color="#258ec8" />
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#0369a1' }}>
                  {dailyOpsDate}
                </Text>
              </View>

              <TouchableOpacity
                onPress={() => handleShiftOpsDate(1)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  borderRadius: 8,
                  backgroundColor: '#f8fafc',
                  borderWidth: 1,
                  borderColor: '#cbd5e1',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 2
                }}
              >
                <Text style={{ fontSize: 11.5, fontWeight: '700', color: '#475569' }}>Next</Text>
                <Ionicons name="chevron-forward" size={14} color="#475569" />
              </TouchableOpacity>
            </View>
          </View>

          {/* TOP 4 AGGREGATE SUMMARY CARDS (2x2 Grid) */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {/* 1. Total Revenue */}
            <View style={[styles.statCard, { flex: 1, minWidth: '47%', padding: 12, borderColor: '#e2e8f0' }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <Text style={[styles.statLabel, { fontSize: 10 }]}>TOTAL REVENUE</Text>
                <Ionicons name="cash-outline" size={15} color="#258ec8" />
              </View>
              <Text style={{ fontSize: 18, fontWeight: '800', color: '#0f172a' }}>
                ₹{totalDayRevenue.toLocaleString('en-IN')}
              </Text>
              <Text style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>All 4 branches</Text>
            </View>

            {/* 2. Total Appointments */}
            <View style={[styles.statCard, { flex: 1, minWidth: '47%', padding: 12, borderColor: '#e2e8f0' }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <Text style={[styles.statLabel, { fontSize: 10 }]}>APPOINTMENTS</Text>
                <Ionicons name="people-outline" size={15} color="#9333ea" />
              </View>
              <Text style={{ fontSize: 18, fontWeight: '800', color: '#9333ea' }}>
                {totalDayAppointments} Patients
              </Text>
              <Text style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>Total booked</Text>
            </View>

            {/* 3. Follow-Up Opted */}
            <View style={[styles.statCard, { flex: 1, minWidth: '47%', padding: 12, borderColor: '#dcfce7', backgroundColor: '#f0fdf4' }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <Text style={[styles.statLabel, { fontSize: 10, color: '#16a34a' }]}>FOLLOW-UP OPTED</Text>
                <Ionicons name="checkmark-circle" size={15} color="#16a34a" />
              </View>
              <Text style={{ fontSize: 18, fontWeight: '800', color: '#16a34a' }}>
                {totalDayOpted} Patients
              </Text>
              <Text style={{ fontSize: 10, color: '#16a34a', marginTop: 2, fontWeight: '600' }}>✓ Scheduled follow-up</Text>
            </View>

            {/* 4. Follow-Up Not Opted */}
            <View style={[styles.statCard, { flex: 1, minWidth: '47%', padding: 12, borderColor: '#fed7aa', backgroundColor: '#fff7ed' }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <Text style={[styles.statLabel, { fontSize: 10, color: '#ea580c' }]}>NOT OPTED</Text>
                <Ionicons name="alert-circle" size={15} color="#ea580c" />
              </View>
              <Text style={{ fontSize: 18, fontWeight: '800', color: '#ea580c' }}>
                {totalDayNotOpted} Patients
              </Text>
              <Text style={{ fontSize: 10, color: '#ea580c', marginTop: 2, fontWeight: '600' }}>No interval set</Text>
            </View>
          </View>

          {/* SECTION HEADER */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: '#0f172a' }}>
              Branch Performance Cards
            </Text>
            <Text style={{ fontSize: 11, color: '#64748b' }}>
              Tap to inspect patients
            </Text>
          </View>

          {/* 4 DEDICATED BRANCH CARDS */}
          {branchDailyStats.map(b => (
            <View
              key={b.id}
              style={{
                backgroundColor: '#ffffff',
                borderWidth: 1,
                borderColor: '#e2e8f0',
                borderRadius: 16,
                padding: 14,
                shadowColor: '#0f172a',
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.04,
                shadowRadius: 3,
                elevation: 1,
                gap: 10
              }}
            >
              {/* Branch Header */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="business-outline" size={16} color="#258ec8" />
                    <Text style={{ fontSize: 15, fontWeight: '800', color: '#0f172a' }}>
                      {b.name}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>
                    📞 {b.phone}
                  </Text>
                </View>
                <View style={{ backgroundColor: '#e0f2fe', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 }}>
                  <Text style={{ fontSize: 9.5, fontWeight: '800', color: '#0284c7' }}>LIVE ACTIVE</Text>
                </View>
              </View>

              {/* 4 Metrics in 2x2 Grid */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {/* 1. Today's Revenue */}
                <View style={{ flex: 1, minWidth: '47%', backgroundColor: '#f8fafc', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#f1f5f9' }}>
                  <Text style={{ fontSize: 9.5, fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Today's Revenue</Text>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: '#258ec8', marginTop: 3 }}>
                    ₹{b.revenue.toLocaleString('en-IN')}
                  </Text>
                </View>

                {/* 2. Appointments */}
                <View style={{ flex: 1, minWidth: '47%', backgroundColor: '#f8fafc', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#f1f5f9' }}>
                  <Text style={{ fontSize: 9.5, fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Appointments</Text>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: '#0f172a', marginTop: 3 }}>
                    {b.appointmentCount} Patients
                  </Text>
                </View>

                {/* 3. Follow-Up Opted */}
                <View style={{ flex: 1, minWidth: '47%', backgroundColor: '#f0fdf4', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#dcfce7' }}>
                  <Text style={{ fontSize: 9.5, fontWeight: '700', color: '#16a34a', textTransform: 'uppercase' }}>Follow-Up Opted</Text>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: '#16a34a', marginTop: 3 }}>
                    ✓ {b.optedCount} Patients
                  </Text>
                </View>

                {/* 4. Not Opted */}
                <View style={{ flex: 1, minWidth: '47%', backgroundColor: '#fff7ed', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#fed7aa' }}>
                  <Text style={{ fontSize: 9.5, fontWeight: '700', color: '#ea580c', textTransform: 'uppercase' }}>Not Opted</Text>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: '#ea580c', marginTop: 3 }}>
                    ✕ {b.notOptedCount} Patients
                  </Text>
                </View>
              </View>

              {/* Action Button */}
              {b.appointmentCount > 0 ? (
                <TouchableOpacity
                  onPress={() => {
                    setSelectedBranchModal(b);
                    setBranchPatientFilter('all');
                  }}
                  style={{
                    backgroundColor: '#eff6ff',
                    borderWidth: 1,
                    borderColor: '#bfdbfe',
                    paddingVertical: 8,
                    borderRadius: 10,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                    gap: 6
                  }}
                >
                  <Ionicons name="people-outline" size={14} color="#258ec8" />
                  <Text style={{ fontSize: 12, fontWeight: '800', color: '#258ec8' }}>
                    View Patients & Follow-Ups ({b.appointmentCount})
                  </Text>
                </TouchableOpacity>
              ) : (
                <View style={{ paddingVertical: 6, alignItems: 'center' }}>
                  <Text style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>
                    No appointments booked for this date
                  </Text>
                </View>
              )}
            </View>
          ))}
        </View>
      )}

      {/* TAB: FEE REQUESTS (LIVE FIRESTORE WORKFLOW) */}
      {activeTab === 'fee_requests' && (
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: '#0f172a' }}>
              Medicine Discount Requests ({feeRequests.length})
            </Text>
            <View style={{ backgroundColor: '#eff6ff', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
              <Text style={{ fontSize: 11, color: '#258ec8', fontWeight: '800' }}>FIRESTORE LIVE</Text>
            </View>
          </View>

          {/* Filter Chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginBottom: 4 }}>
            {(['All', 'Pending', 'Approved', 'Rejected'] as const).map(st => {
              const count = st === 'All'
                ? feeRequests.length
                : feeRequests.filter(r => normalizeFeeStatus(r.status) === st).length;
              const isSelected = feeStatusFilter === st;
              return (
                <TouchableOpacity
                  key={st}
                  onPress={() => setFeeStatusFilter(st)}
                  style={{
                    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
                    backgroundColor: isSelected ? '#258ec8' : '#ffffff',
                    borderWidth: 1, borderColor: isSelected ? '#258ec8' : '#cbd5e1'
                  }}
                >
                  <Text style={{ fontSize: 11.5, fontWeight: isSelected ? '800' : '600', color: isSelected ? '#ffffff' : '#64748b' }}>
                    {st} {count > 0 ? `(${count})` : ''}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {feeRequests.length === 0 ? (
            <View style={{
              backgroundColor: '#ffffff',
              borderRadius: 16,
              padding: 32,
              borderWidth: 1,
              borderColor: '#e2e8f0',
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: 4
            }}>
              <Ionicons name="document-text-outline" size={32} color="#94a3b8" style={{ marginBottom: 8 }} />
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#0f172a', marginBottom: 2 }}>
                No Fee Requests
              </Text>
              <Text style={{ fontSize: 12, color: '#64748b', textAlign: 'center' }}>
                All discount requests submitted by reception desks will appear here live from Firestore.
              </Text>
            </View>
          ) : (
            feeRequests
              .filter(f => feeStatusFilter === 'All' ? true : normalizeFeeStatus(f.status) === feeStatusFilter)
              .map(f => {
                const status = normalizeFeeStatus(f.status);
                const origTotal = Number(f.originalTotalAmount || 0);
                const reqDisc = Number(f.requestedDiscount || 0);
                const netAmount = Math.max(0, origTotal - reqDisc);
                const formattedDate = f.createdAt || f.requestedAt
                  ? new Date(f.createdAt || f.requestedAt).toLocaleString('en-IN', {
                      day: '2-digit', month: 'short',
                      hour: '2-digit', minute: '2-digit', hour12: true
                    })
                  : '-';

                return (
                  <View key={f.id} style={styles.card}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <Text style={{ fontSize: 14, fontWeight: '800', color: '#0f172a' }}>
                          {f.patientName || 'Patient'}
                        </Text>
                        <Text style={{ fontSize: 11.5, color: '#64748b' }}>
                          +91 {f.patientPhone || '-'} • {f.branch || 'Main Branch'}
                        </Text>
                        <Text style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                          📅 {formattedDate}
                        </Text>

                        {/* Amount Breakdown Box */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, backgroundColor: '#f8fafc', padding: 6, borderRadius: 6, borderWidth: 1, borderColor: '#e2e8f0' }}>
                          <Text style={{ fontSize: 11, color: '#475569', fontWeight: '600' }}>
                            Total: <Text style={{ fontWeight: '700', color: '#0f172a' }}>₹{origTotal}</Text>
                          </Text>
                          <Text style={{ fontSize: 11, color: '#dc2626', fontWeight: '700' }}>
                            Disc: -₹{reqDisc}
                          </Text>
                          <Text style={{ fontSize: 11, color: '#16a34a', fontWeight: '800' }}>
                            Net: ₹{netAmount}
                          </Text>
                        </View>

                        {/* Reason / Note */}
                        <Text style={{ fontSize: 11.5, color: '#334155', marginTop: 6 }}>
                          <Text style={{ fontWeight: '700' }}>Reason: </Text>{f.reason || 'No note specified'}
                        </Text>
                        {f.rejectReason && status === 'Rejected' ? (
                          <Text style={{ fontSize: 11, color: '#dc2626', marginTop: 2 }}>
                            Reject Note: {f.rejectReason}
                          </Text>
                        ) : null}
                      </View>

                      <View style={{
                        backgroundColor: status === 'Approved' ? '#f0fdf4' : status === 'Rejected' ? '#fef2f2' : '#fffbeb',
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        borderRadius: 6,
                        borderWidth: 1,
                        borderColor: status === 'Approved' ? '#bbf7d0' : status === 'Rejected' ? '#fecaca' : '#fde68a'
                      }}>
                        <Text style={{
                          fontSize: 11,
                          fontWeight: '800',
                          color: status === 'Approved' ? '#16a34a' : status === 'Rejected' ? '#ef4444' : '#d97706'
                        }}>
                          {status}
                        </Text>
                      </View>
                    </View>

                    {/* Action Buttons for Pending */}
                    {status === 'Pending' ? (
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 8 }}>
                        <TouchableOpacity
                          onPress={() => handleUpdateFeeRequestStatus(f.id, 'Approved', f)}
                          style={{
                            flex: 1, backgroundColor: '#16a34a', paddingVertical: 7, borderRadius: 6,
                            alignItems: 'center', justifyContent: 'center'
                          }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: '800', color: '#ffffff' }}>Approve ✓</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleUpdateFeeRequestStatus(f.id, 'Rejected', f)}
                          style={{
                            flex: 1, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#cbd5e1', paddingVertical: 7, borderRadius: 6,
                            alignItems: 'center', justifyContent: 'center'
                          }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: '800', color: '#ef4444' }}>Reject ✕</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </View>
                );
              })
          )}
        </View>
      )}

      {/* TAB: LEAVE REQUESTS (CONNECTED EXCLUSIVELY TO FIRESTORE) */}
      {activeTab === 'leave_requests' && (
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: '#0f172a' }}>
              Staff Leave Applications ({Math.min(10, leaveRequests.length)}{leaveRequests.length > 10 ? ` of ${leaveRequests.length}` : ''})
            </Text>
            <View style={{ backgroundColor: '#eff6ff', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
              <Text style={{ fontSize: 11, color: '#258ec8', fontWeight: '800' }}>FIRESTORE LIVE</Text>
            </View>
          </View>

          {leaveRequests.length === 0 ? (
            <View style={{
              backgroundColor: '#ffffff',
              borderRadius: 16,
              padding: 32,
              borderWidth: 1,
              borderColor: '#e2e8f0',
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: 4
            }}>
              <Ionicons name="calendar-outline" size={32} color="#94a3b8" style={{ marginBottom: 8 }} />
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#0f172a', marginBottom: 2 }}>
                No Leave Requests
              </Text>
              <Text style={{ fontSize: 12, color: '#64748b', textAlign: 'center' }}>
                All leave requests for the current month will appear here live from Firestore.
              </Text>
            </View>
          ) : (
            leaveRequests.slice(0, 10).map(l => {
              const applicantName = resolveApplicantName(l);
              const roleName = resolveRoleName(l);
              const branchName = resolveBranchName(l);
              const period = resolvePeriod(l);
              const duration = resolveDuration(l);
              const status = normalizeStatus(l.status);

              return (
                <View key={l.id} style={styles.card}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={{ fontSize: 14, fontWeight: '800', color: '#0f172a' }}>{applicantName}</Text>
                      <Text style={{ fontSize: 11.5, color: '#64748b' }}>{roleName} • {branchName}</Text>
                      <Text style={{ fontSize: 12, color: '#258ec8', fontWeight: '700', marginTop: 3 }}>
                        {l.leaveType || 'Leave'} ({duration})
                      </Text>
                      <Text style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
                        📅 Period: {period}
                      </Text>
                      {l.joiningDate ? (
                        <Text style={{ fontSize: 11.5, color: '#0284c7', fontWeight: '700', marginTop: 2 }}>
                          🏢 Re-joining Date: {l.joiningDate}
                        </Text>
                      ) : null}
                    </View>

                    <View style={{
                      backgroundColor: status === 'Approved' ? '#f0fdf4' : status === 'Rejected' ? '#fef2f2' : '#fffbeb',
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      borderRadius: 6
                    }}>
                      <Text style={{
                        fontSize: 11,
                        fontWeight: '800',
                        color: status === 'Approved' ? '#16a34a' : status === 'Rejected' ? '#ef4444' : '#d97706'
                      }}>
                        {status}
                      </Text>
                    </View>
                  </View>

                  {l.reason ? (
                    <Text style={{ fontSize: 11.5, color: '#475569', marginTop: 8, backgroundColor: '#f8fafc', padding: 8, borderRadius: 8 }}>
                      {l.reason}
                    </Text>
                  ) : null}

                  {status === 'Pending' && (
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                      <TouchableOpacity
                        style={{ flex: 1, backgroundColor: '#16a34a', paddingVertical: 8, borderRadius: 8, alignItems: 'center' }}
                        onPress={() => handleUpdateLeaveStatus(l.id, 'Approved', l._collection || 'leaves')}
                      >
                        <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '800' }}>✓ Approve</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={{ flex: 1, backgroundColor: '#ef4444', paddingVertical: 8, borderRadius: 8, alignItems: 'center' }}
                        onPress={() => handleUpdateLeaveStatus(l.id, 'Rejected', l._collection || 'leaves')}
                      >
                        <Text style={{ color: '#ffffff', fontSize: 12, fontWeight: '800' }}>✕ Reject</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </View>
      )}

      {/* TAB: PACKAGE MEMBERS */}
      {activeTab === 'package_members' && (
        <View style={{ gap: 10 }}>
          {[
            { name: 'Platinum Annual Wellness', price: '₹25,000/yr', members: 145 },
            { name: 'Classical Homeo Care Plan', price: '₹15,000/yr', members: 210 },
            { name: 'Pediatric Care Package', price: '₹12,000/yr', members: 98 },
            { name: 'Chronic Illness Wellness Plan', price: '₹18,000/yr', members: 175 },
          ].map(p => (
            <View key={p.name} style={styles.card}>
              <Text style={styles.cardTitle}>{p.name}</Text>
              <Text style={{ fontSize: 13, color: '#258ec8', fontWeight: '800', marginTop: 4 }}>Price: {p.price}</Text>
              <Text style={{ fontSize: 12, color: '#16a34a', fontWeight: '700', marginTop: 2 }}>{p.members} Active Package Members</Text>
            </View>
          ))}
        </View>
      )}

      {/* TAB: MANAGE BANNERS */}
      {activeTab === 'banners' && (
        <View style={{ gap: 10 }}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>App Promotional Banners</Text>
            <Text style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
              Active Banners: 3 Published (Festival Special, Free Consultation, Immunity Boost)
            </Text>
          </View>
        </View>
      )}
      {/* TAB 3: GLOBAL PATIENTS */}
      {activeTab === 'patients' && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Global Patients Summary</Text>
          <Text style={{ fontSize: 13, color: '#0f172a', fontWeight: '800', marginTop: 6 }}>
            Total Registered Patients: 1,250
          </Text>
          <Text style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
            Packages: Platinum Annual Wellness, Classical Care, Pediatric Care
          </Text>
        </View>
      )}

      {/* TAB 5: STAFF & WORKING HOURS (3 CATEGORY SHIFT SELECTOR) */}
      {activeTab === 'staff' && (
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: '#0f172a' }}>Staff Management</Text>
            <TouchableOpacity
              style={{ backgroundColor: '#258ec8', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}
              onPress={handleOpenAddStaff}
            >
              <Text style={{ color: '#ffffff', fontSize: 11.5, fontWeight: '800' }}>+ Add Staff</Text>
            </TouchableOpacity>
          </View>

          {/* Sub-Category Selector Pills */}
          <View style={{ flexDirection: 'row', gap: 6, marginBottom: 4 }}>
            {[
              { id: 'staff', label: 'Staff' },
              { id: 'reception', label: 'Reception' },
              { id: 'doctors', label: 'Doctors' },
              { id: 'hr', label: 'HR' },
            ].map(cat => (
              <TouchableOpacity
                key={cat.id}
                style={{
                  flex: 1,
                  paddingVertical: 8,
                  borderRadius: 10,
                  backgroundColor: staffCategory === cat.id ? '#258ec8' : '#ffffff',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: staffCategory === cat.id ? '#258ec8' : '#cbd5e1'
                }}
                onPress={() => setStaffCategory(cat.id as any)}
              >
                <Text style={{ fontSize: 12, fontWeight: '800', color: staffCategory === cat.id ? '#ffffff' : '#475569' }}>
                  {cat.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Section 1: Staff Members (All Staff) */}
          {staffCategory === 'staff' && (
            <View style={styles.card}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}>
                <Text style={styles.cardTitle}>Clinic Staff Members</Text>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#258ec8' }}>{liveStaffMembers.length} Active Staff</Text>
              </View>

              {liveStaffMembers.map(s => (
                <View key={s.id || s.name} style={{ backgroundColor: '#ffffff', padding: 12, borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: '#e2e8f0' }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontSize: 13.5, fontWeight: '800', color: '#0f172a' }}>{s.name} ({s.branch})</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <TouchableOpacity
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 3,
                          backgroundColor: '#eff6ff',
                          paddingHorizontal: 8,
                          paddingVertical: 4,
                          borderRadius: 6,
                          borderWidth: 1,
                          borderColor: '#bfdbfe'
                        }}
                        onPress={() => handleOpenEditStaff(s)}
                      >
                        <Ionicons name="pencil-outline" size={12} color="#1d4ed8" />
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#1d4ed8' }}>Edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 3,
                          backgroundColor: '#fef2f2',
                          paddingHorizontal: 8,
                          paddingVertical: 4,
                          borderRadius: 6,
                          borderWidth: 1,
                          borderColor: '#fee2e2'
                        }}
                        onPress={() => handleDeleteStaff(s.id, s.name)}
                      >
                        <Ionicons name="trash-outline" size={12} color="#ef4444" />
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#ef4444' }}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                    {s.email ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#f0f9ff', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, borderWidth: 1, borderColor: '#bae6fd' }}>
                        <Ionicons name="mail-outline" size={11} color="#0284c7" />
                        <Text style={{ fontSize: 11, color: '#0284c7', fontWeight: '700' }}>{s.email}</Text>
                      </View>
                    ) : null}
                    {s.password ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#f8fafc', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, borderWidth: 1, borderColor: '#e2e8f0' }}>
                        <Ionicons name="key-outline" size={11} color="#64748b" />
                        <Text style={{ fontSize: 11, color: '#475569', fontWeight: '700' }}>{s.password}</Text>
                      </View>
                    ) : null}
                  </View>
                  {s.phone && s.phone !== '-' && (
                    <Text style={{ fontSize: 11.5, color: '#64748b', fontWeight: '600', marginTop: 4 }}>Phone: +91 {s.phone}</Text>
                  )}
                  <View style={{ gap: 4, marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#f1f5f9' }}>
                    <Text style={{ fontSize: 11.5, color: '#258ec8', fontWeight: '700' }}>Shift: {(s as any).shift || '10:00 AM - 08:30 PM'}</Text>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontSize: 11.5, color: '#16a34a', fontWeight: '700' }}>Hours: {s.hours}</Text>
                      <Text style={{ fontSize: 12, color: '#0f172a', fontWeight: '800' }}>Salary: {s.salary}</Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Section 2: Reception Desk (Branch Desks Only) */}
          {staffCategory === 'reception' && (
            <View style={styles.card}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}>
                <Text style={styles.cardTitle}>Official Clinic Branches</Text>
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#258ec8' }}>4 Active Branches</Text>
              </View>

              {[
                { branch: 'KPHB Branch', phone: '90301 76176', hours: '10:00 AM - 08:30 PM' },
                { branch: 'Nallagandla Branch', phone: '91321 76176', hours: '10:00 AM - 08:30 PM' },
                { branch: 'Dilshuknagar Branch', phone: '98041 76176', hours: '10:00 AM - 08:30 PM' },
                { branch: 'Chandanagar Branch', phone: '95531 76176', hours: '10:00 AM - 08:00 PM' },
              ].map(b => (
                <View key={b.branch} style={{ backgroundColor: '#ffffff', padding: 10, borderRadius: 10, marginBottom: 8, borderWidth: 1, borderColor: '#cbd5e1' }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#0f172a' }}>{b.branch}</Text>
                  <Text style={{ fontSize: 11.5, color: '#258ec8', fontWeight: '700', marginVertical: 2 }}>Contact: +91 {b.phone}</Text>
                  <Text style={{ fontSize: 11.5, color: '#16a34a', fontWeight: '700' }}>Hours: {b.hours}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Section 3: Doctors Directory */}
          {staffCategory === 'doctors' && (
            <View style={styles.card}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}>
                <View>
                  <Text style={styles.cardTitle}>Doctors Directory</Text>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#16a34a' }}>{liveDoctors.length} Doctors</Text>
                </View>
                <TouchableOpacity
                  style={{
                    backgroundColor: '#9333ea',
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: 8,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4
                  }}
                  onPress={() => {
                    setNewDocName('');
                    setNewDocPhone('');
                    setNewDocSalary('₹95,000');
                    setShowAddDoctorModal(true);
                  }}
                >
                  <Ionicons name="add-circle-outline" size={14} color="#ffffff" />
                  <Text style={{ color: '#ffffff', fontSize: 11.5, fontWeight: '800' }}>+ Add Doctor</Text>
                </TouchableOpacity>
              </View>

              {liveDoctors.map(doc => {
                const isHeadDoc = doc.category === 'Head Doctor' || doc.role === 'Head Doctor';
                return (
                  <View key={doc.id || doc.name} style={{ backgroundColor: '#ffffff', padding: 12, borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: '#e2e8f0' }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: '#0f172a' }}>{doc.name}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={{ fontSize: 10.5, fontWeight: '800', color: isHeadDoc ? '#258ec8' : '#9333ea', backgroundColor: isHeadDoc ? '#eef5fc' : '#faf5ff', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                          {doc.role}
                        </Text>
                        <TouchableOpacity
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 2,
                            backgroundColor: '#f1f5f9',
                            paddingHorizontal: 6,
                            paddingVertical: 3,
                            borderRadius: 6,
                            borderWidth: 1,
                            borderColor: '#cbd5e1'
                          }}
                          onPress={() => handleOpenEditDoctor(doc)}
                        >
                          <Ionicons name="create-outline" size={11} color="#475569" />
                          <Text style={{ fontSize: 10.5, fontWeight: '700', color: '#475569' }}>Edit</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 2,
                            backgroundColor: '#fef2f2',
                            paddingHorizontal: 6,
                            paddingVertical: 3,
                            borderRadius: 6,
                            borderWidth: 1,
                            borderColor: '#fee2e2'
                          }}
                          onPress={() => handleDeleteDoctor(doc.id, doc.name)}
                        >
                          <Ionicons name="trash-outline" size={11} color="#ef4444" />
                          <Text style={{ fontSize: 10.5, fontWeight: '700', color: '#ef4444' }}>Delete</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                    <Text style={{ fontSize: 11.5, color: '#258ec8', fontWeight: '600', marginTop: 4 }}>Phone: +91 {doc.phone || doc.mobile}</Text>

                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#f1f5f9' }}>
                      <Text style={{ fontSize: 11, color: isHeadDoc ? '#64748b' : '#258ec8', fontWeight: '700' }}>
                        Shift: {isHeadDoc ? '-' : doc.shift}
                      </Text>
                      <Text style={{ fontSize: 11, color: isHeadDoc ? '#64748b' : '#16a34a', fontWeight: '700' }}>
                        Hours: {isHeadDoc ? '-' : doc.hours}
                      </Text>
                      <Text style={{ fontSize: 11.5, color: isHeadDoc ? '#94a3b8' : '#0f172a', fontWeight: '800' }}>
                        Salary: {isHeadDoc ? '-' : doc.salary}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* Section 4: HR Department (No salary, No login/logout, No branch - Just HR ID & Password) */}
          {staffCategory === 'hr' && (
            <View style={styles.card}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}>
                <Text style={styles.cardTitle}>HR Department</Text>
                <View style={{ backgroundColor: '#dcfce7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                  <Text style={{ fontSize: 10.5, fontWeight: '800', color: '#15803d' }}>ACTIVE</Text>
                </View>
              </View>

              <View style={{ backgroundColor: '#ffffff', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', gap: 10 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 14, fontWeight: '800', color: '#0f172a' }}>HR Management</Text>
                  <Text style={{ fontSize: 10.5, fontWeight: '800', color: '#0284c7', backgroundColor: '#e0f2fe', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                    Human Resources (HR)
                  </Text>
                </View>

                <View style={{ paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f1f5f9', gap: 8 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontSize: 12, color: '#64748b', fontWeight: '700' }}>HR Login ID / Email:</Text>
                    <View style={{ backgroundColor: '#f1f5f9', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                      <Text style={{ fontSize: 12, color: '#0f172a', fontWeight: '800' }}>hr@sph.com</Text>
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontSize: 12, color: '#64748b', fontWeight: '700' }}>Portal Password:</Text>
                    <View style={{ backgroundColor: '#f1f5f9', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                      <Text style={{ fontSize: 12, color: '#0f172a', fontWeight: '800' }}>hr@sph123</Text>
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontSize: 12, color: '#64748b', fontWeight: '700' }}>Access Level:</Text>
                    <Text style={{ fontSize: 11.5, color: '#15803d', fontWeight: '800' }}>Full Operations & Admin Access</Text>
                  </View>
                </View>
              </View>

              <View style={{ marginTop: 10, padding: 10, backgroundColor: '#f8fafc', borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0' }}>
                <Text style={{ fontSize: 11, color: '#64748b', lineHeight: 16 }}>
                  HR account has complete module access across Web and Mobile matching the Admin control suite.
                </Text>
              </View>
            </View>
          )}
        </View>
      )}

      {/* TAB 6: EDIT MEDICINE FORM */}
      {activeTab === 'medicine' && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Edit Medicine / Remedy Form</Text>

          <Text style={styles.fieldLabel}>Medicine Name</Text>
          <View style={styles.inputBox}>
            <TextInput
              style={styles.inputText}
              placeholder="e.g. Arnica Montana"
              placeholderTextColor="#94a3b8"
              value={medName}
              onChangeText={setMedName}
            />
          </View>

          <Text style={styles.fieldLabel}>Potency</Text>
          <View style={styles.inputBox}>
            <TextInput
              style={styles.inputText}
              value={medPotency}
              onChangeText={setMedPotency}
            />
          </View>

          <Text style={styles.fieldLabel}>Stock Quantity</Text>
          <View style={styles.inputBox}>
            <TextInput
              style={styles.inputText}
              keyboardType="number-pad"
              value={medStock}
              onChangeText={setMedStock}
            />
          </View>

          <TouchableOpacity style={styles.saveBtn} onPress={handleSaveMedicine}>
            <Text style={styles.saveBtnText}>Save Medicine</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ADD / EDIT STAFF MODAL */}
      <Modal visible={showAddStaffModal || showEditStaffModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: '85%' }]}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>{showEditStaffModal ? '✏️ Edit Staff Member' : 'Add New Staff Member'}</Text>
              <TouchableOpacity onPress={() => { setShowAddStaffModal(false); setShowEditStaffModal(false); }}>
                <Ionicons name="close" size={20} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 10 }}>
              <Text style={styles.fieldLabel}>Full Name *</Text>
              <View style={styles.inputBox}>
                <TextInput
                  style={styles.inputText}
                  placeholder="e.g. Anil Kumar M"
                  placeholderTextColor="#94a3b8"
                  value={newStaffName}
                  onChangeText={setNewStaffName}
                />
              </View>

              <Text style={styles.fieldLabel}>Mobile / Phone Number *</Text>
              <View style={styles.inputBox}>
                <TextInput
                  style={styles.inputText}
                  placeholder="e.g. 90301 76176"
                  keyboardType="phone-pad"
                  placeholderTextColor="#94a3b8"
                  value={newStaffPhone}
                  onChangeText={setNewStaffPhone}
                />
              </View>

              <Text style={styles.fieldLabel}>Branch Assignment</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: 6 }}>
                {['KPHB', 'Nallagandla', 'Dilshuknagar', 'Chandanagar'].map(br => (
                  <TouchableOpacity
                    key={br}
                    style={[styles.chipBtn, newStaffBranch === br && styles.chipBtnActive]}
                    onPress={() => setNewStaffBranch(br)}
                  >
                    <Text style={[styles.chipBtnText, newStaffBranch === br && styles.chipBtnTextActive]}>{br}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Staff Login Credentials (Directly below Branch Assignment) */}
              <View style={{ backgroundColor: '#f8fafc', borderRadius: 12, padding: 12, borderWidth: 1.5, borderColor: '#e2e8f0', marginTop: 10 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={{ fontSize: 12.5, fontWeight: '800', color: '#0f172a' }}>🔐 Staff Login Credentials</Text>
                  <View style={{ backgroundColor: '#dbeafe', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#1e40af' }}>Regular Staff Only</Text>
                  </View>
                </View>

                <Text style={styles.fieldLabel}>Staff Login Email ID *</Text>
                <View style={styles.inputBox}>
                  <TextInput
                    style={styles.inputText}
                    placeholder="e.g. anil@sph.com"
                    placeholderTextColor="#94a3b8"
                    autoCapitalize="none"
                    keyboardType="email-address"
                    value={newStaffEmail}
                    onChangeText={setNewStaffEmail}
                  />
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                  <Text style={styles.fieldLabel}>Staff Login Password *</Text>
                  <TouchableOpacity onPress={() => setShowStaffPassword(!showStaffPassword)}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#258ec8' }}>
                      {showStaffPassword ? 'Hide' : 'Show'} Password
                    </Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.inputBox}>
                  <TextInput
                    style={styles.inputText}
                    placeholder="Standard default: email123"
                    placeholderTextColor="#94a3b8"
                    secureTextEntry={!showStaffPassword}
                    value={newStaffPassword}
                    onChangeText={setNewStaffPassword}
                  />
                </View>
                <Text style={{ fontSize: 10.5, color: '#64748b', marginTop: 4 }}>
                  Default password is email123. HR/Admin can edit ID & password at any time.
                </Text>
              </View>

              {/* Salary & Work Schedule Box */}
              <View style={{ backgroundColor: '#f8fafc', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#e2e8f0', marginTop: 12 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#0f172a' }}>
                    Salary & Work Schedule
                  </Text>
                  <View style={{ backgroundColor: '#f4f9e8', borderWidth: 1, borderColor: 'rgba(168, 206, 58, 0.4)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: '#a8ce3a' }}>
                      {getCalculatedDailyHours()}
                    </Text>
                  </View>
                </View>

                {/* Monthly Base Salary (Rs) */}
                <Text style={[styles.fieldLabel, { marginTop: 4 }]}>Monthly Base Salary (Rs)</Text>
                <View style={styles.inputBox}>
                  <TextInput
                    style={styles.inputText}
                    placeholder="e.g. 25000"
                    keyboardType="number-pad"
                    placeholderTextColor="#94a3b8"
                    value={newStaffSalary}
                    onChangeText={setNewStaffSalary}
                  />
                </View>

                {/* Shift Type */}
                <Text style={[styles.fieldLabel, { marginTop: 10 }]}>Shift Type</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginVertical: 6 }}>
                  {['Single Strict', 'Multi Strict'].map(type => (
                    <TouchableOpacity
                      key={type}
                      style={{
                        flex: 1,
                        paddingVertical: 9,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: staffShiftType === type ? '#258ec8' : '#cbd5e1',
                        backgroundColor: staffShiftType === type ? '#eef5fc' : '#ffffff',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                      onPress={() => {
                        setStaffShiftType(type as any);
                        if (type === 'Multi Strict' && staffShiftSlots.length < 2) {
                          setStaffShiftSlots([
                            { loginTime: '10:00 AM', logoutTime: '02:00 PM' },
                            { loginTime: '03:00 PM', logoutTime: '08:30 PM' }
                          ]);
                        } else if (type === 'Single Strict') {
                          setStaffShiftSlots([staffShiftSlots[0]]);
                        }
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '800', color: staffShiftType === type ? '#258ec8' : '#64748b' }}>
                        {type}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Shift Hours Schedule */}
                {staffShiftSlots.map((slot, idx) => (
                  <View key={idx} style={styles.shiftSlotCard}>
                    <View style={styles.shiftSlotHeader}>
                      <View style={styles.shiftSlotBadge}>
                        <Text style={styles.shiftSlotBadgeText}>
                          {staffShiftType === 'Multi Strict' ? `SHIFT SLOT ${idx + 1}` : 'SHIFT HOURS SCHEDULE'}
                        </Text>
                      </View>
                      {staffShiftType === 'Multi Strict' && staffShiftSlots.length > 1 && (
                        <TouchableOpacity onPress={() => setStaffShiftSlots(prev => prev.filter((_, i) => i !== idx))}>
                          <Text style={styles.removeSlotText}>Remove Slot</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    {/* Side-by-Side Dual Time Modules */}
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      {/* Login Time */}
                      <View style={{ flex: 1 }}>
                        <Text style={styles.timeLabel}>Login Time</Text>
                        <View style={styles.timeInputContainer}>
                          <TextInput
                            style={styles.timeInputControl}
                            placeholder="10:00 AM"
                            placeholderTextColor="#94a3b8"
                            value={slot.loginTime}
                            onChangeText={val => {
                              setStaffShiftSlots(prev => prev.map((s, i) => i === idx ? { ...s, loginTime: val } : s));
                            }}
                          />
                        </View>

                        {/* Preset Chips */}
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                          {['09:00 AM', '10:00 AM', '10:30 AM'].map(t => {
                            const isSelected = slot.loginTime === t;
                            return (
                              <TouchableOpacity
                                key={t}
                                style={[styles.presetChip, isSelected && styles.presetChipActive]}
                                onPress={() => setStaffShiftSlots(prev => prev.map((s, i) => i === idx ? { ...s, loginTime: t } : s))}
                              >
                                <Text style={[styles.presetChipText, isSelected && styles.presetChipTextActive]}>{t}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>

                      {/* Logout Time */}
                      <View style={{ flex: 1 }}>
                        <Text style={styles.timeLabel}>Logout Time</Text>
                        <View style={styles.timeInputContainer}>
                          <TextInput
                            style={styles.timeInputControl}
                            placeholder="08:30 PM"
                            placeholderTextColor="#94a3b8"
                            value={slot.logoutTime}
                            onChangeText={val => {
                              setStaffShiftSlots(prev => prev.map((s, i) => i === idx ? { ...s, logoutTime: val } : s));
                            }}
                          />
                        </View>

                        {/* Preset Chips */}
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                          {['07:30 PM', '08:00 PM', '08:30 PM'].map(t => {
                            const isSelected = slot.logoutTime === t;
                            return (
                              <TouchableOpacity
                                key={t}
                                style={[styles.presetChip, isSelected && styles.presetChipActive]}
                                onPress={() => setStaffShiftSlots(prev => prev.map((s, i) => i === idx ? { ...s, logoutTime: t } : s))}
                              >
                                <Text style={[styles.presetChipText, isSelected && styles.presetChipTextActive]}>{t}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    </View>
                  </View>
                ))}

                {staffShiftType === 'Multi Strict' && (
                  <TouchableOpacity
                    style={styles.addSlotBtn}
                    onPress={() => setStaffShiftSlots(prev => [...prev, { loginTime: '04:00 PM', logoutTime: '08:30 PM' }])}
                  >
                    <Text style={styles.addSlotBtnText}>+ Add Another Shift Slot</Text>
                  </TouchableOpacity>
                )}
              </View>

              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveNewStaff}>
                <Text style={styles.saveBtnText}>{showEditStaffModal ? 'Update Staff Member' : 'Save Staff Member'}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ADD / EDIT DOCTOR MODAL */}
      <Modal visible={showAddDoctorModal || showEditDoctorModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>{showEditDoctorModal ? 'Edit Doctor' : 'Add New Doctor'}</Text>
              <TouchableOpacity onPress={() => { setShowAddDoctorModal(false); setShowEditDoctorModal(false); }}>
                <Ionicons name="close" size={20} color="#64748b" />
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>Doctor Category *</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginVertical: 6 }}>
              {(['Head Doctor', 'Employee Doctor'] as const).map(cat => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.catBtn, newDocCategory === cat && styles.catBtnActive]}
                  onPress={() => setNewDocCategory(cat)}
                >
                  <Text style={[styles.catBtnText, newDocCategory === cat && styles.catBtnTextActive]}>{cat}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Doctor Full Name *</Text>
            <View style={styles.inputBox}>
              <TextInput
                style={styles.inputText}
                placeholder="e.g. Dr. Homeo Specialist"
                placeholderTextColor="#94a3b8"
                value={newDocName}
                onChangeText={setNewDocName}
              />
            </View>

            <Text style={styles.fieldLabel}>Mobile Phone Number *</Text>
            <View style={styles.inputBox}>
              <TextInput
                style={styles.inputText}
                placeholder="e.g. 9876543210"
                placeholderTextColor="#94a3b8"
                keyboardType="phone-pad"
                value={newDocPhone}
                onChangeText={setNewDocPhone}
              />
            </View>

            {newDocCategory === 'Employee Doctor' ? (
              <>
                <Text style={styles.fieldLabel}>Shift Timings</Text>
                <View style={styles.inputBox}>
                  <TextInput
                    style={styles.inputText}
                    placeholder="e.g. 10:00 AM - 08:00 PM"
                    placeholderTextColor="#94a3b8"
                    value={newDocShift}
                    onChangeText={setNewDocShift}
                  />
                </View>

                <Text style={styles.fieldLabel}>Daily Working Hours</Text>
                <View style={styles.inputBox}>
                  <TextInput
                    style={styles.inputText}
                    placeholder="e.g. 10 hrs/day"
                    placeholderTextColor="#94a3b8"
                    value={newDocHours}
                    onChangeText={setNewDocHours}
                  />
                </View>

                <Text style={styles.fieldLabel}>Monthly Salary</Text>
                <View style={styles.inputBox}>
                  <TextInput
                    style={styles.inputText}
                    placeholder="e.g. ₹95,000"
                    placeholderTextColor="#94a3b8"
                    value={newDocSalary}
                    onChangeText={setNewDocSalary}
                  />
                </View>
              </>
            ) : (
              <View style={styles.headNoticeCard}>
                <Text style={styles.headNoticeText}>
                  Note: Head Doctors are non-salaried consultants. Shift, Hours, and Salary will automatically display as "-".
                </Text>
              </View>
            )}

            <TouchableOpacity style={[styles.saveBtn, { backgroundColor: '#a8ce3a' }]} onPress={handleSaveNewDoctor}>
              <Text style={styles.saveBtnText}>{showEditDoctorModal ? 'Update Doctor' : 'Save Doctor'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL: BRANCH PATIENT BREAKDOWN & FOLLOW-UPS */}
      <Modal
        visible={!!selectedBranchModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSelectedBranchModal(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: '85%' }]}>
            {/* Modal Header */}
            <View style={styles.modalHeaderRow}>
              <View>
                <Text style={styles.modalTitle}>{selectedBranchModal?.name}</Text>
                <Text style={{ fontSize: 11.5, color: '#64748b' }}>
                  Patients on {dailyOpsDate} • 📞 {selectedBranchModal?.phone}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedBranchModal(null)} style={{ padding: 4 }}>
                <Ionicons name="close" size={22} color="#64748b" />
              </TouchableOpacity>
            </View>

            {/* Filter Tabs */}
            {selectedBranchModal && (
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
                <TouchableOpacity
                  onPress={() => setBranchPatientFilter('all')}
                  style={[styles.chipBtn, branchPatientFilter === 'all' && styles.chipBtnActive]}
                >
                  <Text style={[styles.chipBtnText, branchPatientFilter === 'all' && styles.chipBtnTextActive]}>
                    All ({selectedBranchModal.appointmentCount})
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setBranchPatientFilter('opted')}
                  style={[styles.chipBtn, branchPatientFilter === 'opted' && { backgroundColor: '#16a34a', borderColor: '#16a34a' }]}
                >
                  <Text style={[styles.chipBtnText, branchPatientFilter === 'opted' && { color: '#ffffff' }]}>
                    Opted ({selectedBranchModal.optedCount})
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setBranchPatientFilter('not_opted')}
                  style={[styles.chipBtn, branchPatientFilter === 'not_opted' && { backgroundColor: '#ea580c', borderColor: '#ea580c' }]}
                >
                  <Text style={[styles.chipBtnText, branchPatientFilter === 'not_opted' && { color: '#ffffff' }]}>
                    Not Opted ({selectedBranchModal.notOptedCount})
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Patient List */}
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 380 }}>
              {selectedBranchModal && (() => {
                const list = branchPatientFilter === 'opted'
                  ? selectedBranchModal.optedApps
                  : branchPatientFilter === 'not_opted'
                    ? selectedBranchModal.notOptedApps
                    : selectedBranchModal.appointments;

                if (!list || list.length === 0) {
                  return (
                    <View style={{ padding: 24, alignItems: 'center' }}>
                      <Text style={{ fontSize: 13, color: '#94a3b8' }}>
                        No patients matching this filter
                      </Text>
                    </View>
                  );
                }

                return (
                  <View style={{ gap: 8 }}>
                    {list.map((a: any, idx: number) => {
                      const opted = isFollowUpOpted(a);
                      const amt = extractRevenue(a);
                      const patientName = a.patientName || a.name || `Patient #${idx + 1}`;
                      const phone = a.phone || a.mobile || '-';
                      const docName = a.doctor || a.doctorName || 'General Doctor';
                      const time = a.appointmentTime || a.time || '-';

                      return (
                        <View
                          key={a.id || idx}
                          style={{
                            backgroundColor: '#f8fafc',
                            borderRadius: 12,
                            padding: 12,
                            borderWidth: 1,
                            borderColor: '#e2e8f0',
                            gap: 4
                          }}
                        >
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text style={{ fontSize: 13.5, fontWeight: '800', color: '#0f172a' }}>
                              {patientName}
                            </Text>
                            <View style={{
                              backgroundColor: opted ? '#f0fdf4' : '#fff7ed',
                              borderWidth: 1,
                              borderColor: opted ? '#bbf7d0' : '#fed7aa',
                              paddingHorizontal: 8,
                              paddingVertical: 2,
                              borderRadius: 6
                            }}>
                              <Text style={{
                                fontSize: 10,
                                fontWeight: '800',
                                color: opted ? '#16a34a' : '#ea580c'
                              }}>
                                {opted ? '✓ Opted' : '✕ Not Opted'}
                              </Text>
                            </View>
                          </View>

                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
                            <Text style={{ fontSize: 11.5, color: '#64748b' }}>
                              📞 {phone} • {time}
                            </Text>
                            <Text style={{ fontSize: 12, fontWeight: '800', color: '#258ec8' }}>
                              {amt > 0 ? `₹${amt.toLocaleString('en-IN')}` : 'Fee Pending'}
                            </Text>
                          </View>

                          <Text style={{ fontSize: 11, color: '#64748b' }}>
                            Doctor: {docName}
                          </Text>

                          {opted && (a.preferredFollowUpDate || a.followUpDate || a.followUpInterval) && (
                            <Text style={{ fontSize: 10.5, color: '#16a34a', fontWeight: '700' }}>
                              Follow-Up: {a.preferredFollowUpDate || a.followUpDate || a.followUpInterval}
                            </Text>
                          )}
                        </View>
                      );
                    })}
                  </View>
                );
              })()}
            </ScrollView>

            <TouchableOpacity
              onPress={() => setSelectedBranchModal(null)}
              style={[styles.saveBtn, { marginTop: 12, backgroundColor: '#f1f5f9' }]}
            >
              <Text style={[styles.saveBtnText, { color: '#475569' }]}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', paddingHorizontal: 16, paddingTop: 12 },
  actionHeaderRow: { flexDirection: 'row', gap: 10, marginBottom: 14, marginTop: 4 },
  addBtnStaff: { flex: 1, backgroundColor: '#258ec8', borderRadius: 12, height: 44, alignItems: 'center', justifyContent: 'center' },
  addBtnStaffText: { color: '#ffffff', fontSize: 13.5, fontWeight: '800' },
  addBtnDoctor: { flex: 1, backgroundColor: '#a8ce3a', borderRadius: 12, height: 44, alignItems: 'center', justifyContent: 'center' },
  addBtnDoctorText: { color: '#ffffff', fontSize: 13.5, fontWeight: '800' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  iconCircle: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#258ec8', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  headerSub: { fontSize: 11.5, color: '#64748b' },
  tabRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  tabChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e2e8f0' },
  tabChipActive: { backgroundColor: '#258ec8', borderColor: '#258ec8' },
  tabChipText: { fontSize: 12, fontWeight: '600', color: '#64748b' },
  tabChipTextActive: { color: '#ffffff', fontWeight: '800' },
  statCard: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 16, padding: 16 },
  statLabel: { fontSize: 11.5, fontWeight: '800', color: '#64748b' },
  statVal: { fontSize: 22, fontWeight: '800', color: '#0f172a', marginVertical: 4 },
  statSub: { fontSize: 11, color: '#64748b' },
  card: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 16, padding: 16, marginBottom: 12 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  cardSub: { fontSize: 12, color: '#64748b', marginTop: 2 },
  infoText: { fontSize: 12, color: '#475569' },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: '#0f172a', marginTop: 10, marginBottom: 4 },
  inputBox: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingHorizontal: 12, height: 44, justifyContent: 'center' },
  inputText: { fontSize: 13, color: '#0f172a' },
  saveBtn: { backgroundColor: '#258ec8', borderRadius: 12, height: 46, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  saveBtnText: { color: '#ffffff', fontSize: 14, fontWeight: '800' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.5)', justifyContent: 'center', paddingHorizontal: 16 },
  modalCard: { backgroundColor: '#ffffff', borderRadius: 20, padding: 20 },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  chipBtn: { flex: 1, paddingVertical: 6, borderRadius: 8, backgroundColor: '#f1f5f9', alignItems: 'center', borderWidth: 1, borderColor: '#cbd5e1' },
  chipBtnActive: { backgroundColor: '#258ec8', borderColor: '#258ec8' },
  chipBtnText: { fontSize: 10.5, fontWeight: '700', color: '#475569' },
  chipBtnTextActive: { color: '#ffffff' },
  catBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: '#f1f5f9', alignItems: 'center', borderWidth: 1, borderColor: '#cbd5e1' },
  catBtnActive: { backgroundColor: '#a8ce3a', borderColor: '#a8ce3a' },
  catBtnText: { fontSize: 12, fontWeight: '700', color: '#475569' },
  catBtnTextActive: { color: '#ffffff' },
  headNoticeCard: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, padding: 10, marginTop: 10 },
  headNoticeText: { fontSize: 11.5, color: '#258ec8', lineHeight: 16 },
  shiftSlotCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    padding: 12,
    marginTop: 10,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  shiftSlotHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  shiftSlotBadge: {
    backgroundColor: '#eef5fc',
    borderWidth: 1,
    borderColor: 'rgba(37, 142, 200, 0.3)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  shiftSlotBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#258ec8',
    letterSpacing: 0.5,
  },
  removeSlotText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#258ec8',
  },
  timeLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 4,
  },
  timeInputContainer: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    height: 40,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  timeInputControl: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0f172a',
    padding: 0,
  },
  presetChip: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  presetChipActive: {
    backgroundColor: '#eef5fc',
    borderColor: '#258ec8',
  },
  presetChipText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#64748b',
  },
  presetChipTextActive: {
    color: '#258ec8',
    fontWeight: '800',
  },
  addSlotBtn: {
    marginTop: 10,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#258ec8',
    backgroundColor: '#eef5fc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addSlotBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#258ec8',
  },
});
