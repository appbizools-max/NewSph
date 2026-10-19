import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { StyleSheet, Text, View, SafeAreaView, TouchableOpacity, Platform, Alert, BackHandler, ScrollView, ActivityIndicator, LogBox } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

LogBox.ignoreLogs([
  '@firebase/firestore',
  'WebChannelConnection',
  'transport errored',
  'expo-notifications',
  'Error thrown while updating the device push token',
  'Network request failed',
]);

// Auth Screen
import { AuthScreen, LoginSuccessData } from './src/screens/AuthScreen/AuthScreen';

// Reception Sub-Screens & Side Drawer
import { ReceptionSideDrawer } from './src/screens/Reception/ReceptionSideDrawer';
import { ReceptionDashboardScreen } from './src/screens/Reception/Dashboard/ReceptionDashboardScreen';
import { BookAppointmentScreen } from './src/screens/Reception/BookAppointment/BookAppointmentScreen';
import { AllPatientsScreen } from './src/screens/Reception/AllPatients/AllPatientsScreen';
import { FollowUpsScreen } from './src/screens/Reception/FollowUps/FollowUpsScreen';
import { MedicineRequestsScreen } from './src/screens/Reception/MedicineRequests/MedicineRequestsScreen';
import { ProductBillingScreen } from './src/screens/Reception/ProductBilling/ProductBillingScreen';
import { DoctorNoShowScreen } from './src/screens/Reception/DoctorNoShow/DoctorNoShowScreen';
import { MediaManagerScreen } from './src/screens/Reception/MediaManager/MediaManagerScreen';
import { CleaningPhotosScreen } from './src/screens/Reception/CleaningPhotos/CleaningPhotosScreen';
import { ShiprocketScreen } from './src/screens/Reception/Shiprocket/ShiprocketScreen';

// Admin, HR, Doctor & Staff Screens
import { AdminScreen } from './src/screens/Admin/AdminScreen';
import { HRScreen } from './src/screens/HR/HRScreen';
import { BranchCleaningScreen } from './src/screens/Admin/BranchCleaning/BranchCleaningScreen';
import { DoctorScreen } from './src/screens/Doctor/DoctorScreen';
import { StaffScreen } from './src/screens/Staff/StaffScreen';
import { PatientFileMobileScreen } from './src/screens/PatientFile/PatientFileMobileScreen';
import { NotificationsScreen } from './src/screens/Notifications/NotificationsScreen';

import { UserRole, signOutUser, CanonicalBranchId, resolveCanonicalBranchId, BRANCHES, resolveStrictDoctorName, sanitizeDoctorName } from '@app/shared';
import { getSafeDb, collection, query, where, onSnapshot, doc, orderBy, limit } from './src/utils/firebaseSafe';
import {
  registerFCMForStaff, setupFCMForegroundListeners, cleanupOldNotifications, requestAppPermissions,
  triggerSystemPushNotification, checkNotificationPermissionStatus, openNotificationSettings,
  createStaffLoginNotificationInFirestore, createStaffLogoutNotificationInFirestore
} from './src/utils/fcmService';
import {
  CleaningSchedule, CleaningSubmission, normalizeBranchName, checkBranchLockoutStatus, getTodayDateString
} from './src/utils/cleaningService';

const MOBILE_AUTH_KEY = '@sph_auth_session';
const READ_NOTIS_KEY = '@sph_read_noti_ids';
const ACTIVE_TAB_KEY = '@sph_active_tab';
const SELECTED_PATIENT_KEY = '@sph_selected_patient';

const safeResolveCanonicalBranchId = (input?: string | null): CanonicalBranchId => {
  try {
    if (typeof resolveCanonicalBranchId === 'function') {
      const res = resolveCanonicalBranchId(input);
      if (res) return res;
    }
  } catch (_) { }
  if (!input || typeof input !== 'string') return 'kphb';
  const lower = input.toLowerCase();
  if (lower.includes('kphb') || lower.includes('kpb')) return 'kphb';
  if (lower.includes('chanda') || lower.includes('chn')) return 'chandanagar';
  if (lower.includes('dilshuk') || lower.includes('dsn')) return 'dilshuknagar';
  if (lower.includes('nalla') || lower.includes('ngl')) return 'nallagandla';
  return 'kphb';
};

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: any }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error('[SPH_ERROR_BOUNDARY] Caught JS error:', error, errorInfo);
  }

  handleRestart = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fef2f2', padding: 24, justifyContent: 'center', alignItems: 'center' }}>
          <Ionicons name="warning-outline" size={64} color="#dc2626" style={{ marginBottom: 16 }} />
          <Text style={{ fontSize: 22, fontWeight: 'bold', color: '#991b1b', marginBottom: 8, textAlign: 'center' }}>
            Application Error
          </Text>
          <Text style={{ fontSize: 13, color: '#7f1d1d', textAlign: 'center', marginBottom: 20, paddingHorizontal: 16 }}>
            {String(this.state.error && this.state.error.message ? this.state.error.message : this.state.error || 'An unexpected error occurred.')}
          </Text>
          <TouchableOpacity
            onPress={this.handleRestart}
            style={{ backgroundColor: '#dc2626', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8 }}
          >
            <Text style={{ color: '#ffffff', fontWeight: 'bold', fontSize: 16 }}>Try Reloading</Text>
          </TouchableOpacity>
        </SafeAreaView>
      );
    }
    return this.props.children;
  }
}

function MainApp() {
  console.log('[SPH_APP] Rendering App component!');
  const [activeTab, setActiveTab] = useState<string>('auth');
  const [tabHistory, setTabHistory] = useState<string[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [userRole, setUserRole] = useState<UserRole>('reception');

  // Authenticated User Branch State (Canonical Branch-Locked)
  const [userName, setUserName] = useState('');
  const [branchId, setBranchId] = useState<CanonicalBranchId>('kphb');
  const [branchName, setBranchName] = useState('KPHB Branch');
  const [branchPhone, setBranchPhone] = useState('+91 90301 76176');
  const [staffId, setStaffId] = useState('1');
  const [isLoadingSession, setIsLoadingSession] = useState(true);

  // Normalized currentUser Context available to all features
  const currentUser = useMemo(() => ({
    role: userRole,
    userName,
    branchId,
    branchName,
    branchPhone,
    staffId
  }), [userRole, userName, branchId, branchName, branchPhone, staffId]);

  const [selectedPatient, setSelectedPatient] = useState<any>(null);
  const [checkoutPatient, setCheckoutPatient] = useState<any>(null);

  // Keep-Alive Tab State Preservation across all screens
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(() => new Set(['reception_dashboard']));


  useEffect(() => {
    if (activeTab) {
      setVisitedTabs(prev => {
        const next = new Set(prev);
        next.add(activeTab);
        return next;
      });
    }
  }, [activeTab]);

  // Notification State & Persistent Read Tracking
  const [readNotiIds, setReadNotiIds] = useState<Set<string>>(new Set());
  const [recentNotifications, setRecentNotifications] = useState<any[]>([]);
  const seenNotiIds = useRef<Set<string>>(new Set());
  const isInitialSnapshot = useRef(true);

  // Load saved read notifications on startup
  useEffect(() => {
    const loadReadNotis = async () => {
      try {
        const saved = await AsyncStorage.getItem(READ_NOTIS_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            setReadNotiIds(new Set(parsed));
          }
        }
      } catch (e) { }
    };
    loadReadNotis();
  }, []);

  const handleMarkAsRead = (id: string) => {
    setReadNotiIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      AsyncStorage.setItem(READ_NOTIS_KEY, JSON.stringify(Array.from(next))).catch(() => { });
      return next;
    });
  };

  const handleMarkAllAsRead = () => {
    const allIds = recentNotifications.map((n) => n.id);
    setReadNotiIds((prev) => {
      const next = new Set(prev);
      allIds.forEach((id) => next.add(id));
      AsyncStorage.setItem(READ_NOTIS_KEY, JSON.stringify(Array.from(next))).catch(() => { });
      return next;
    });
  };

  const unreadCount = useMemo(() => {
    return recentNotifications.filter((n) => !readNotiIds.has(n.id)).length;
  }, [recentNotifications, readNotiIds]);

  // Weekly Cleaning Lockout Guard
  const [cleaningSchedule, setCleaningSchedule] = useState<CleaningSchedule>({
    branch: normalizeBranchName(branchName),
    assignedDate: getTodayDateString()
  });
  const [cleaningSubmissions, setCleaningSubmissions] = useState<CleaningSubmission[]>([]);

  useEffect(() => {
    if (isLoadingSession || userRole === 'admin' || userRole === 'hr' || userRole === 'doctor' || userRole === 'staff') return;
    const activeDb = getSafeDb();
    if (!activeDb) return;
    const normBranch = normalizeBranchName(branchName);

    const schedRef = doc(activeDb, 'branch_cleaning_schedules', normBranch);
    const unsubSched = onSnapshot(schedRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setCleaningSchedule({
          branch: normBranch,
          assignedDate: data.assignedDate || getTodayDateString(),
          updatedAt: data.updatedAt,
          updatedBy: data.updatedBy
        });
      } else {
        setCleaningSchedule({ branch: normBranch, assignedDate: getTodayDateString() });
      }
    }, (err) => console.warn('Mobile cleaning sched error:', err));

    const subColRef = collection(activeDb, 'branch_cleaning_submissions');
    const q = query(subColRef, where('branch', '==', normBranch), limit(5));
    const unsubSubs = onSnapshot(q, (snap) => {
      const list: CleaningSubmission[] = snap.docs.map(d => {
        const data = d.data() as any;
        return {
          id: d.id,
          branch: data.branch,
          assignedDate: data.assignedDate,
          submittedAt: data.submittedAt,
          submittedBy: data.submittedBy,
          status: data.status,
          rejectReason: data.rejectReason,
          notes: data.notes,
          photos: [], // Omit massive base64 images from root state to preserve Hermes memory
        };
      });
      setCleaningSubmissions(list);
    }, (err) => console.warn('Mobile cleaning subs error:', err));

    return () => {
      unsubSched();
      unsubSubs();
    };
  }, [isLoadingSession, userRole, branchName]);

  const cleaningLockout = useMemo(() => {
    if (userRole === 'admin' || userRole === 'hr' || userRole === 'doctor' || userRole === 'staff') {
      return { isBlocked: false, reason: '' };
    }
    return checkBranchLockoutStatus(cleaningSchedule.assignedDate, cleaningSubmissions, new Date());
  }, [userRole, cleaningSchedule.assignedDate, cleaningSubmissions]);

  const isCleaningBlocked = cleaningLockout.isBlocked;

  // Clear Checkout handler
  const handleClearCheckout = useCallback(() => {
    setCheckoutPatient(null);
  }, []);

  // Navigation Stack Helper
  const navigateToTab = useCallback((newTab: string, patientData?: any) => {
    if (isCleaningBlocked && newTab !== 'reception_cleaning') {
      Alert.alert(
        'Action Required: Cleaning Overdue',
        'Your branch clinic cleaning photos are overdue. Access is locked until 5 to 7 photos are uploaded and approved by HR.'
      );
      setActiveTab('reception_cleaning');
      return;
    }
    let target = newTab;
    if (target === 'Dashboard' || target === 'dashboard' || target === 'reception') {
      target = (userRole === 'admin' || userRole === 'hr') ? 'admin' : userRole === 'doctor' ? 'doctor' : userRole === 'staff' ? 'staff' : 'reception_dashboard';
    }
    if (patientData) {
      setSelectedPatient(patientData);
    }
    setActiveTab(prev => {
      if (target === prev && !patientData) return prev;
      setTabHistory(h => [...h, prev]);
      return target;
    });
  }, [isCleaningBlocked, userRole]);

  const handleGoBack = useCallback((): boolean => {
    if (tabHistory.length > 0) {
      const prevTab = tabHistory[tabHistory.length - 1];
      setTabHistory(prev => prev.slice(0, -1));
      setActiveTab(prevTab);
      return true;
    } else if (activeTab !== 'reception_dashboard' && activeTab !== 'reception' && activeTab !== 'admin' && activeTab !== 'auth') {
      const defaultHome = (userRole === 'admin' || userRole === 'hr') ? 'admin' : userRole === 'doctor' ? 'doctor' : userRole === 'staff' ? 'staff' : 'reception_dashboard';
      setActiveTab(defaultHome);
      return true;
    }
    return false;
  }, [tabHistory, activeTab, userRole]);

  // Hardware Back Button Listener (Native Android Back Press)
  useEffect(() => {
    const onHardwareBackPress = () => {
      return handleGoBack();
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', onHardwareBackPress);
    return () => subscription.remove();
  }, [tabHistory, activeTab, userRole]);

  // Restore saved session on app startup
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const [saved, savedTab, savedPatient] = await Promise.all([
          AsyncStorage.getItem(MOBILE_AUTH_KEY),
          AsyncStorage.getItem(ACTIVE_TAB_KEY),
          AsyncStorage.getItem(SELECTED_PATIENT_KEY),
        ]);

        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && parsed.role) {
            setUserRole(parsed.role);
            const resolvedName = parsed.role === 'doctor'
              ? resolveStrictDoctorName(parsed.userName || parsed.branchPhone, parsed.userName)
              : (parsed.userName || (parsed.role === 'reception' ? `${parsed.branchName || 'Branch'} Reception` : 'Staff Member'));
            setUserName(resolvedName);
            const canonical = safeResolveCanonicalBranchId(parsed.branchId || parsed.branchName);
            setBranchId(canonical);
            setBranchName(parsed.branchName || (BRANCHES && BRANCHES[canonical]?.fullName) || 'KPHB Branch');
            setBranchPhone(parsed.branchPhone || (BRANCHES && BRANCHES[canonical]?.formattedPhone) || '+91 90301 76176');
            if (parsed.staffId) setStaffId(parsed.staffId);

            const defaultHome = (parsed.role === 'admin' || parsed.role === 'hr')
              ? 'admin'
              : parsed.role === 'doctor'
                ? 'doctor'
                : parsed.role === 'staff'
                  ? 'staff'
                  : 'reception_dashboard';

            // Restore saved patient if any
            let restoredPatient: any = null;
            if (savedPatient) {
              try {
                restoredPatient = JSON.parse(savedPatient);
                if (restoredPatient) setSelectedPatient(restoredPatient);
              } catch (_) { }
            }

            // Restore last active screen/tab
            let targetTab = defaultHome;
            if (savedTab && typeof savedTab === 'string' && savedTab !== 'auth' && savedTab.trim().length > 0) {
              if (savedTab === 'patient_file' || savedTab === 'reception_patient_file') {
                if (restoredPatient) {
                  targetTab = savedTab;
                } else {
                  targetTab = 'reception_patients';
                }
              } else {
                targetTab = savedTab;
              }
            }

            setActiveTab(targetTab);

            // If restored on a sub-screen, initialize tabHistory with default home so back button navigates home cleanly
            if (targetTab !== defaultHome) {
              setTabHistory([defaultHome]);
            } else {
              setTabHistory([]);
            }

            // Register FCM device token and subscribe to role/branch topics
            registerFCMForStaff(parsed.role, parsed.branchName || 'Nallagandla', resolvedName).catch(() => { });
          }
        }
      } catch (e) {
        console.warn('Session restore note:', e);
      } finally {
        setIsLoadingSession(false);
      }
    };
    restoreSession();

    // 10-Day Rolling Cleanup check on startup
    cleanupOldNotifications().catch(() => { });

    // Request Notification & Location permissions with 1500ms delay to ensure Android native Activity is focused
    const permTimer = setTimeout(() => {
      requestAppPermissions().catch(() => { });
    }, 1500);

    // Foreground FCM message and notification click listener
    const unsubFCM = setupFCMForegroundListeners();
    return () => {
      clearTimeout(permTimer);
      unsubFCM();
    };
  }, []);

  // Persist current active tab so the app reopens exactly where user left off
  useEffect(() => {
    if (isLoadingSession || activeTab === 'auth') return;
    AsyncStorage.setItem(ACTIVE_TAB_KEY, activeTab).catch(() => { });
  }, [activeTab, isLoadingSession]);

  // Persist selected patient for patient file restoration
  useEffect(() => {
    if (isLoadingSession) return;
    if (selectedPatient) {
      AsyncStorage.setItem(SELECTED_PATIENT_KEY, JSON.stringify(selectedPatient)).catch(() => { });
    } else {
      AsyncStorage.removeItem(SELECTED_PATIENT_KEY).catch(() => { });
    }
  }, [selectedPatient, isLoadingSession]);

  // Real-time Firestore notification alert for Reception (matching branch), HR / Admin (all branches), Doctors & Staff
  // Robust branch key normalizer for exact multi-branch matching across all variations
  const normalizeBranchKey = (raw: string = ''): string => {
    const s = String(raw || '').toLowerCase().trim();
    if (s.includes('dilshuk') || s.includes('dilsukh') || s.includes('dsnr') || s.includes('dshnr')) return 'dilshuknagar';
    if (s.includes('kphb') || s.includes('kukatpally')) return 'kphb';
    if (s.includes('nalla') || s.includes('nallagandla')) return 'nallagandla';
    if (s.includes('chanda') || s.includes('chnr') || s.includes('chandanagar')) return 'chandanagar';
    return s.replace(/branch/gi, '').replace(/[^a-z0-9]/g, '').trim();
  };

  // Real-time Firestore notification alert for Reception (matching branch), HR / Admin (all branches), Doctors & Staff
  useEffect(() => {
    if (isLoadingSession || activeTab === 'auth') return;
    const activeDb = getSafeDb();
    if (!activeDb) return;
    isInitialSnapshot.current = true;

    try {
      const notiCol = collection(activeDb, 'notifications');
      const qNoti = query(notiCol, orderBy('createdAt', 'desc'), limit(30));
      const unsubscribe = onSnapshot(qNoti, (snapshot) => {
        const currentList: any[] = [];
        const myBranchKey = normalizeBranchKey(branchName || '');
        const isHR = userRole === 'admin' || userRole === 'hr' || String(userRole).toLowerCase().includes('admin') || String(userRole).toLowerCase().includes('hr') || branchName === 'All Branches' || branchName === 'Admin Control Hub';
        const isReception = (
          userRole === 'reception' ||
          String(userRole).toLowerCase().includes('reception') ||
          String(userRole).toLowerCase().includes('front') ||
          String(userRole).toLowerCase().includes('desk') ||
          String(userRole).toLowerCase().includes('billing')
        );

        snapshot.docs.forEach((docSnap) => {
          const noti = docSnap.data() as any;
          const targetKey = normalizeBranchKey(noti.branch || noti.targetBranch || '');
          const isBranchMatch = !targetKey || !myBranchKey || targetKey === myBranchKey;

          const isBranchReception = isReception && isBranchMatch;

          const cleanDocName = (userName || '').toLowerCase();
          const notiDocName = (noti.doctorName || '').toLowerCase();
          const isDoctorMatch = userRole === 'doctor' && (
            (notiDocName && (cleanDocName.includes(notiDocName) || notiDocName.includes(cleanDocName))) ||
            isBranchMatch
          );

          let shouldInclude = false;
          if (noti.type === 'staff_login' || noti.type === 'staff_logout' || noti.type === 'staff_punch_in' || noti.type === 'staff_punch_out') {
            shouldInclude = isHR;
          } else if (noti.type === 'staff_report' || noti.type === 'staff_leave_request') {
            const isMatchingStaff = userRole === 'staff' && (
              (noti.staffName && userName.toLowerCase().includes(noti.staffName.toLowerCase())) ||
              noti.staffId === staffId
            );
            shouldInclude = isHR || isMatchingStaff;
          } else if (noti.type === 'fee_discount_request') {
            // Only HR and Admin receive fee discount requests, NOT Reception
            shouldInclude = isHR;
          } else if (noti.type === 'fee_discount_response') {
            // Reception of that branch and HR get the response
            shouldInclude = isHR || isBranchReception;
          } else if (noti.type === 'cleaning_submission') {
            // Clinic cleaning uploaded: HR / Admin and Branch Reception get notified
            shouldInclude = isHR || isBranchReception;
          } else if (noti.type === 'cleaning_approved' || noti.type === 'cleaning_rejected') {
            // Cleaning approval/rejection: Branch Reception and HR/Admin get notified
            shouldInclude = isHR || isBranchReception;
          } else if (noti.type === 'payment') {
            // Payments: Only HR / Admin (all branches) and Reception of that branch. Regular staff & doctors NEVER get payments.
            shouldInclude = isHR || isBranchReception;
          } else if (noti.type === 'booking' || noti.title?.toLowerCase().includes('appointment') || noti.title?.toLowerCase().includes('booked')) {
            // Bookings: HR gets all branches, Branch Reception gets their branch, Doctor gets assigned booking. Regular staff NEVER gets bookings.
            shouldInclude = isHR || isBranchReception || isDoctorMatch;
          } else {
            shouldInclude = isHR || isBranchReception || isDoctorMatch;
          }

          if (shouldInclude) {
            currentList.push({ id: docSnap.id, ...noti });
          }
        });
        currentList.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        setRecentNotifications(currentList.slice(0, 20));

        // Skip alerting on initial snapshot to avoid spamming past appointments
        if (isInitialSnapshot.current) {
          snapshot.docs.forEach((d) => seenNotiIds.current.add(d.id));
          isInitialSnapshot.current = false;
          return;
        }

        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added' && !seenNotiIds.current.has(change.doc.id)) {
            seenNotiIds.current.add(change.doc.id);
            const noti = change.doc.data() as any;
            const targetKey = normalizeBranchKey(noti.branch || noti.targetBranch || '');
            const isBranchMatch = !targetKey || !myBranchKey || targetKey === myBranchKey;

            const isBranchReception = isReception && isBranchMatch;

            const cleanDocName = (userName || '').toLowerCase();
            const notiDocName = (noti.doctorName || '').toLowerCase();
            const isDoctorMatch = userRole === 'doctor' && (
              (notiDocName && (cleanDocName.includes(notiDocName) || notiDocName.includes(cleanDocName))) ||
              isBranchMatch
            );

            let shouldNotify = false;
            if (noti.type === 'staff_login' || noti.type === 'staff_logout' || noti.type === 'staff_punch_in' || noti.type === 'staff_punch_out') {
              shouldNotify = isHR;
            } else if (noti.type === 'staff_report' || noti.type === 'staff_leave_request') {
              const isMatchingStaff = userRole === 'staff' && (
                (noti.staffName && userName.toLowerCase().includes(noti.staffName.toLowerCase())) ||
                noti.staffId === staffId
              );
              shouldNotify = isHR || isMatchingStaff;
            } else if (noti.type === 'fee_discount_request') {
              // Only HR and Admin receive fee discount requests, NOT Reception
              shouldNotify = isHR;
            } else if (noti.type === 'fee_discount_response') {
              shouldNotify = isHR || isBranchReception;
            } else if (noti.type === 'cleaning_submission') {
              // Clinic cleaning uploaded: notify HR / Admin and Branch Reception
              shouldNotify = isHR || isBranchReception;
            } else if (noti.type === 'cleaning_approved' || noti.type === 'cleaning_rejected') {
              // Cleaning approval / rejection: notify Branch Reception and HR/Admin
              shouldNotify = isHR || isBranchReception;
            } else if (noti.type === 'payment') {
              // Payments: Only HR / Admin (all branches) and Reception of that branch. Regular staff & doctors NEVER get payments.
              shouldNotify = isHR || isBranchReception;
            } else if (noti.type === 'booking' || noti.title?.toLowerCase().includes('appointment') || noti.title?.toLowerCase().includes('booked')) {
              // Bookings: HR gets all branches, Branch Reception gets their branch, Doctor gets assigned booking. Regular staff NEVER gets bookings.
              shouldNotify = isHR || isBranchReception || isDoctorMatch;
            } else {
              shouldNotify = isHR || isBranchReception || isDoctorMatch;
            }

            // Freshness check: only sound/show alert if notification was created within last 3 minutes
            let isFresh = true;
            try {
              const notiTime = noti.createdAt
                ? (typeof noti.createdAt.toDate === 'function' ? noti.createdAt.toDate().getTime() : new Date(noti.createdAt).getTime())
                : Date.now();
              if (notiTime && !isNaN(notiTime)) {
                isFresh = (Date.now() - notiTime) < 180000;
              }
            } catch (_) { }

            if (shouldNotify && isFresh) {
              const notiTitle = noti.title || (
                noti.type === 'staff_punch_in' ? '🟢 Staff Punched In' :
                  noti.type === 'staff_punch_out' ? '🔴 Staff Punched Out' :
                    noti.type === 'staff_login' ? 'Staff Logged In' :
                      noti.type === 'staff_logout' ? 'Staff Logged Out' :
                        noti.type === 'staff_report' ? 'Daily Report Submitted' :
                          noti.type === 'staff_leave_request' ? '📝 Staff Leave Application' :
                            noti.type === 'fee_discount_request' ? '🏷️ Discount Approval Request' :
                              noti.type === 'fee_discount_response' ? (noti.status === 'approved' ? 'Discount Request Approved ✓' : 'Discount Request Rejected ❌') :
                                noti.type === 'cleaning_submission' ? `${noti.branch || 'Branch'} Cleaning Photos Uploaded 📸` :
                                  noti.type === 'cleaning_approved' ? `${noti.branch || 'Branch'} Cleaning Approved ✅` :
                                    noti.type === 'cleaning_rejected' ? `${noti.branch || 'Branch'} Cleaning Rejected ❌` :
                                      noti.type === 'payment' ? 'Payment Received' : 'Appointment Booked'
              );

              const notiBody = noti.body || (
                noti.type === 'staff_punch_in' ? `${noti.staffName || 'Staff'} punched in at ${noti.branch || 'Branch'} (${noti.punchInTime || ''})` :
                  noti.type === 'staff_punch_out' ? `${noti.staffName || 'Staff'} punched out from ${noti.branch || 'Branch'} (${noti.punchOutTime || ''})${noti.workingHours ? ` • Worked: ${noti.workingHours}` : ''}` :
                    noti.type === 'staff_login' ? `${noti.staffName} logged in at ${noti.branch}` :
                      noti.type === 'staff_logout' ? `${noti.staffName} logged out from ${noti.branch}` :
                        noti.type === 'staff_report' ? `${noti.staffName} submitted Daily Report for ${noti.branch}` :
                          noti.type === 'staff_leave_request' ? `${noti.staffName} applied for ${noti.daysCount || 1} day(s) leave` :
                            noti.type === 'fee_discount_request' ? `Discount requested for ${noti.patientName} (${noti.branch})` :
                              noti.type === 'fee_discount_response' ? `Discount request for ${noti.patientName} was ${noti.status || 'processed'}` :
                                noti.type === 'cleaning_submission' ? `${noti.photoCount || 5} clinic cleaning photos uploaded from ${noti.branch} for HR inspection.` :
                                  noti.type === 'cleaning_approved' ? `Clinic cleaning approved by ${noti.reviewedBy || 'HR'} for ${noti.branch}. Reception is unlocked.` :
                                    noti.type === 'cleaning_rejected' ? `Cleaning submission for ${noti.branch} rejected by ${noti.reviewedBy || 'HR'}. Please re-upload photos.` :
                                      noti.type === 'payment' ? `Payment of ₹${Number(noti.amount || 0).toLocaleString('en-IN')} received from ${noti.patientName} (${noti.branch})` :
                                        `Appointment booked for ${noti.patientName} at ${noti.appointmentTime} (${noti.branch})`
              );

              triggerSystemPushNotification(notiTitle, notiBody, noti).catch(() => { });

              // For Branch Reception, also show immediate in-app Alert when cleaning is Approved or Rejected
              if (isBranchReception) {
                if (noti.type === 'cleaning_approved') {
                  Alert.alert('Cleaning Approved ✅', notiBody);
                } else if (noti.type === 'cleaning_rejected') {
                  Alert.alert('Cleaning Rejected ❌', notiBody);
                }
              }
            }
          }
        });
      }, (err) => {
        console.warn('Notifications real-time listener notice:', err);
      });

      return () => unsubscribe();
    } catch (e) {
      console.warn('Notification listener setup notice:', e);
    }
  }, [userRole, branchName, userName, activeTab === 'auth', isLoadingSession]);

  const handleLoginSuccess = async (data: LoginSuccessData) => {
    const resolvedName = data.role === 'doctor'
      ? resolveStrictDoctorName(data.userName || data.branchPhone, data.userName)
      : (data.userName || (data.role === 'reception' ? `${data.branchName} Reception` : 'Staff Member'));
    const canonical = data.branchId || safeResolveCanonicalBranchId(data.branchName);

    try {
      await AsyncStorage.setItem(MOBILE_AUTH_KEY, JSON.stringify({
        role: data.role,
        userName: resolvedName,
        branchId: canonical,
        branchName: data.branchName,
        branchPhone: data.branchPhone,
        staffId: data.staffId || '',
      }));
    } catch (e) { }

    setUserRole(data.role);
    setUserName(resolvedName);
    setBranchId(canonical);
    setBranchName(data.branchName);
    setBranchPhone(data.branchPhone);
    if (data.staffId) setStaffId(data.staffId);
    setTabHistory([]);

    // Prompt for system permissions upon login
    requestAppPermissions().catch(() => { });

    // Register FCM for logged-in staff role & branch
    registerFCMForStaff(data.role, data.branchName, resolvedName).catch(() => { });

    // When staff logs in on mobile, send notification to HR
    if (data.role === 'staff') {
      createStaffLoginNotificationInFirestore({
        staffName: resolvedName,
        branch: data.branchName || branchName || 'SPH Clinic',
        staffId: data.staffId || staffId || '',
      }).catch(() => { });
    }

    const defaultHome = (data.role === 'admin' || data.role === 'hr')
      ? 'admin'
      : data.role === 'doctor'
        ? 'doctor'
        : data.role === 'staff'
          ? 'staff'
          : 'reception_dashboard';

    setSelectedPatient(null);
    setActiveTab(defaultHome);
    AsyncStorage.setItem(ACTIVE_TAB_KEY, defaultHome).catch(() => { });
    AsyncStorage.removeItem(SELECTED_PATIENT_KEY).catch(() => { });
  };

  const performSignOut = async () => {
    // When staff logs out on mobile, send notification to HR
    if (userRole === 'staff') {
      createStaffLogoutNotificationInFirestore({
        staffName: userName || 'Staff Member',
        branch: branchName || 'SPH Clinic',
        staffId: staffId || '',
      }).catch(() => { });
    }

    try {
      await Promise.all([
        AsyncStorage.removeItem(MOBILE_AUTH_KEY),
        AsyncStorage.removeItem(ACTIVE_TAB_KEY),
        AsyncStorage.removeItem(SELECTED_PATIENT_KEY),
      ]);
    } catch (e) { }
    await signOutUser();
    setSelectedPatient(null);
    setTabHistory([]);
    setActiveTab('auth');
    Alert.alert('Signed Out', 'You have been logged out of SPH Staff Portal.');
  };

  const handleSignOut = () => {
    Alert.alert(
      'Confirm Logout',
      'Are you sure you want to log out?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'OK',
          style: 'destructive',
          onPress: () => {
            performSignOut();
          },
        },
      ],
      { cancelable: true }
    );
  };

  const isAuthScreen = activeTab === 'auth';

  const renderScreen = () => {
    if (isLoadingSession) {
      return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#ffffff', justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#0284c7" />
          <Text style={{ marginTop: 14, fontSize: 13, fontWeight: '700', color: '#64748b' }}>
            Loading SPH Clinic Portal...
          </Text>
        </SafeAreaView>
      );
    }

    if (activeTab === 'auth') {
      return <AuthScreen onLoginSuccess={handleLoginSuccess} />;
    }

    if (activeTab === 'notifications') {
      return (
        <NotificationsScreen
          notifications={recentNotifications}
          readNotiIds={readNotiIds}
          onMarkAsRead={handleMarkAsRead}
          onMarkAllAsRead={handleMarkAllAsRead}
          onBack={handleGoBack}
        />
      );
    }

    const isDocEmployee = (userName || '').toLowerCase().includes('padma');
    const resolvedDocName = resolveStrictDoctorName(userName || branchPhone, userName);

    const isExternalOverlay = (
      activeTab === 'patient_file' ||
      activeTab === 'reception_patient_file' ||
      activeTab === 'reception_book' ||
      activeTab === 'reception_medicines' ||
      activeTab === 'medicine_requests'
    );

    // Keep-Alive Tab State Preservation for ALL screens across all roles
    return (
      <View style={{ flex: 1 }}>
        {/* Admin Dashboard */}
        {userRole === 'admin' && (
          <View style={{ flex: 1, display: (!isExternalOverlay && activeTab !== 'hr') ? 'flex' : 'none' }}>
            <AdminScreen currentTab={activeTab} onNavigateTab={navigateToTab} />
          </View>
        )}

        {/* HR Portal */}
        {(userRole === 'hr' || (userRole === 'admin' && (visitedTabs.has('hr') || activeTab === 'hr'))) && (
          <View style={{ flex: 1, display: (userRole === 'hr' ? !isExternalOverlay : activeTab === 'hr') ? 'flex' : 'none' }}>
            <HRScreen currentTab={activeTab} onNavigateTab={navigateToTab} />
          </View>
        )}
        {/* Doctor Portal */}
        {userRole === 'doctor' && (
          <View style={{ flex: 1, display: !isExternalOverlay ? 'flex' : 'none' }}>
            <DoctorScreen
              doctorCategory={isDocEmployee ? 'Employee Doctor' : 'Head Doctor'}
              doctorName={resolvedDocName}
              onLogout={handleSignOut}
              onNavigateTab={navigateToTab}
            />
          </View>
        )}
        {/* Staff Portal */}
        {userRole === 'staff' && (
          <View style={{ flex: 1, display: !isExternalOverlay ? 'flex' : 'none' }}>
            <StaffScreen
              staffId={staffId || ''}
              staffName={userName || 'Staff Member'}
              branchName={branchName || 'SPH Clinic'}
              onLogout={handleSignOut}
            />
          </View>
        )}
        {/* Patient File View */}
        {(visitedTabs.has('patient_file') || visitedTabs.has('reception_patient_file') || activeTab === 'patient_file' || activeTab === 'reception_patient_file') && selectedPatient && (
          <View style={{ flex: 1, display: (activeTab === 'patient_file' || activeTab === 'reception_patient_file') ? 'flex' : 'none' }}>
            <PatientFileMobileScreen
              patient={selectedPatient}
              currentBranch={branchName}
              doctorName={userRole === 'doctor'
                ? resolveStrictDoctorName(branchPhone, userName)
                : sanitizeDoctorName(selectedPatient?.doctorName || selectedPatient?.doctor, branchName)}
              isDoctor={userRole === 'doctor'}
              onBack={handleGoBack}
              onSaveConsultation={(payload) => {
                const fullPatient = { ...selectedPatient, ...payload };
                if (selectedPatient?.editPrescriptionOnly || selectedPatient?.disableAmount) {
                  setSelectedPatient(null);
                  setActiveTab('all_patients');
                  Alert.alert('Prescription Updated', 'Prescription details updated successfully without affecting payment.');
                } else if (userRole === 'doctor') {
                  setSelectedPatient(null);
                  setActiveTab('doctor');
                  Alert.alert('Consultation Completed', `Prescription saved & ${fullPatient.patientName || 'patient'} sent to Reception for Fee Collection!`);
                } else {
                  setSelectedPatient(null);
                  setCheckoutPatient(fullPatient);
                  setActiveTab('reception_dashboard');
                }
              }}
            />
          </View>
        )}

        {/* Reception Dashboard */}
        {userRole === 'reception' && (
          <View style={{ flex: 1, display: (activeTab === 'reception' || activeTab === 'reception_dashboard' || !visitedTabs.has(activeTab)) ? 'flex' : 'none' }}>
            <ReceptionDashboardScreen
              currentBranch={branchName}
              onNavigate={navigateToTab}
              initialPatientForCheckout={checkoutPatient}
              onClearInitialCheckout={handleClearCheckout}
            />
          </View>
        )}

        {/* Book Appointment Screen */}
        {(visitedTabs.has('reception_book') || activeTab === 'reception_book') && (
          <View style={{ flex: 1, display: activeTab === 'reception_book' ? 'flex' : 'none' }}>
            <BookAppointmentScreen currentBranch={branchName} userRole={userRole} onNavigate={(tab: string) => navigateToTab(tab)} onBack={handleGoBack} />
          </View>
        )}

        {/* Medicine Requests Screen */}
        {(visitedTabs.has('reception_medicines') || visitedTabs.has('medicine_requests') || activeTab === 'reception_medicines' || activeTab === 'medicine_requests') && (
          <View style={{ flex: 1, display: (activeTab === 'reception_medicines' || activeTab === 'medicine_requests') ? 'flex' : 'none' }}>
            <MedicineRequestsScreen branchName={branchName} currentBranch={branchName} userRole={userRole} />
          </View>
        )}

        {/* All Patients Screen */}
        {(visitedTabs.has('reception_patients') || activeTab === 'reception_patients') && (
          <View style={{ flex: 1, display: activeTab === 'reception_patients' ? 'flex' : 'none' }}>
            <AllPatientsScreen onNavigate={navigateToTab} currentBranch={branchName} />
          </View>
        )}

        {/* Follow Ups Screen */}
        {(visitedTabs.has('reception_followups') || activeTab === 'reception_followups') && (
          <View style={{ flex: 1, display: activeTab === 'reception_followups' ? 'flex' : 'none' }}>
            <FollowUpsScreen onNavigate={navigateToTab} currentBranch={branchName} branchId={currentUser.branchId} />
          </View>
        )}

        {/* Product Billing Screen */}
        {(visitedTabs.has('reception_billing') || activeTab === 'reception_billing') && (
          <View style={{ flex: 1, display: activeTab === 'reception_billing' ? 'flex' : 'none' }}>
            <ProductBillingScreen />
          </View>
        )}

        {/* Doctor No Show Screen */}
        {(visitedTabs.has('reception_noshow') || activeTab === 'reception_noshow') && (
          <View style={{ flex: 1, display: activeTab === 'reception_noshow' ? 'flex' : 'none' }}>
            <DoctorNoShowScreen currentBranch={branchName} />
          </View>
        )}

        {/* Shiprocket Screen */}
        {(visitedTabs.has('reception_shiprocket') || activeTab === 'reception_shiprocket') && (
          <View style={{ flex: 1, display: activeTab === 'reception_shiprocket' ? 'flex' : 'none' }}>
            <ShiprocketScreen />
          </View>
        )}

        {/* Media Manager Screen */}
        {(visitedTabs.has('reception_media') || activeTab === 'reception_media') && (
          <View style={{ flex: 1, display: activeTab === 'reception_media' ? 'flex' : 'none' }}>
            <MediaManagerScreen />
          </View>
        )}

        {/* Cleaning Photos Screen */}
        {(visitedTabs.has('reception_cleaning') || activeTab === 'reception_cleaning') && (
          <View style={{ flex: 1, display: activeTab === 'reception_cleaning' ? 'flex' : 'none' }}>
            <CleaningPhotosScreen
              currentBranch={branchName}
              isOverdueLocked={isCleaningBlocked}
              onSubmittedSuccess={() => setActiveTab('reception_cleaning')}
            />
          </View>
        )}

        {/* Branch Cleaning Admin Screen (for Reception role navigating to cleaning review) */}
        {(userRole !== 'admin' && userRole !== 'hr') && (activeTab === 'branch_cleaning' || activeTab === 'admin_cleaning' || activeTab === 'cleaning') && (
          <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
            <BranchCleaningScreen onBack={handleGoBack} role={(userRole as any) === 'hr' ? 'hr' : 'admin'} />
          </View>
        )}
      </View>
    );
  };

  // Admin Bottom Nav Items: Dashboard, Requests, Leaves, Book Appt, Logout
  const adminBottomNavItems = [
    { id: 'admin', label: 'Dashboard', iconType: 'ionicons', iconName: 'grid-outline' },
    { id: 'reception_medicines', label: 'Requests', iconType: 'mci', iconName: 'pill' },
    { id: 'hr', label: 'Leaves', iconType: 'ionicons', iconName: 'calendar-outline' },
    { id: 'reception_book', label: 'Book Appt', iconType: 'ionicons', iconName: 'add-circle-outline' },
    { id: 'logout', label: 'Logout', iconType: 'ionicons', iconName: 'log-out-outline' },
  ];

  // Reception Bottom Nav Items: Dashboard, Book Appt, Patient List, Med Req, Logout
  const receptionBottomNavItems = [
    { id: 'reception_dashboard', label: 'Dashboard', iconType: 'ionicons', iconName: 'grid-outline' },
    { id: 'reception_book', label: 'Book Appt', iconType: 'ionicons', iconName: 'calendar-outline' },
    { id: 'reception_patients', label: 'Patient List', iconType: 'ionicons', iconName: 'people-outline' },
    { id: 'reception_medicines', label: 'Med Req', iconType: 'mci', iconName: 'pill' },
    { id: 'logout', label: 'Logout', iconType: 'ionicons', iconName: 'log-out-outline' },
  ];

  const bottomNavItems = (userRole === 'admin' || userRole === 'hr') ? adminBottomNavItems : receptionBottomNavItems;

  const handleBottomTabPress = (id: string) => {
    if (id === 'logout') {
      handleSignOut();
    } else {
      navigateToTab(id);
    }
  };

  if (isLoadingSession) {
    return (
      <View style={{ flex: 1, backgroundColor: '#f8fafc', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 13, color: '#64748b', fontWeight: '600' }}>Restoring Session...</Text>
      </View>
    );
  }

  const getSubPageTitle = (tab: string) => {
    switch (tab) {
      case 'notifications':
        return 'Notifications';
      case 'employee_works':
      case 'admin_employee_works':
        return 'Employee Daily Works';
      case 'branches':
      case 'admin_branches':
        return 'Manage Branches & Targets';
      case 'doctors':
      case 'admin_doctors':
        return 'Doctor Timings & Schedules';
      case 'staff':
      case 'admin_staff':
        return 'Staff & Employee Directory';
      case 'package_members':
      case 'admin_packages':
        return 'Package Members';
      case 'banners':
      case 'admin_banners':
        return 'Promotional App Banners';
      case 'patients':
      case 'admin_patients':
        return 'Global Patients Summary';
      case 'medicine':
      case 'admin_medicines':
        return 'Edit Medicine Inventory';
      case 'reception_medicines':
        return 'Medicine & Patient Requests';
      case 'hr':
      case 'hr_attendance':
      case 'hr_payroll':
      case 'hr_roster':
        return 'Staff Leaves & HR Portal';
      case 'reception_book':
        return 'Book Appointment';
      case 'reception_patients':
        return 'All Patients Directory';
      case 'reception_followups':
        return 'Follow-Ups';
      case 'reception_billing':
        return 'Product Billing';
      case 'reception_noshow':
        return 'Doctor No Show';
      case 'reception_shiprocket':
        return 'Shiprocket';
      case 'reception_media':
        return 'Media Manager';
      case 'branch_cleaning':
      case 'admin_cleaning':
      case 'cleaning':
        return 'Branch Cleaning & Sanitation';
      case 'employee_attendance':
      case 'admin_attendance':
        return 'Staff Attendance Report';
      case 'reception_cleaning':
        return 'Cleaning Photos';
      default:
        return 'Spiritual Homeo';
    }
  };

  // Compulsory Weekly Cleaning Lockout Guard for Reception
  if (isCleaningBlocked && userRole !== 'admin' && userRole !== 'hr' && userRole !== 'doctor' && userRole !== 'staff' && activeTab !== 'auth') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="dark" />
        <View style={{ flex: 1 }}>
          <View style={{
            backgroundColor: '#fee2e2',
            paddingVertical: 10,
            paddingHorizontal: 16,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottomWidth: 1,
            borderBottomColor: '#fca5a5'
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
              <Ionicons name="lock-closed" size={16} color="#dc2626" />
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#991b1b' }}>
                Reception Locked: Clinic Cleaning Required
              </Text>
            </View>
            <TouchableOpacity onPress={handleSignOut}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#dc2626' }}>Logout</Text>
            </TouchableOpacity>
          </View>
          <CleaningPhotosScreen
            currentBranch={branchName}
            isOverdueLocked={true}
            onSubmittedSuccess={() => setActiveTab('reception_cleaning')}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />

      {/* Top Main Dashboard Header Bar */}
      {!isAuthScreen && userRole !== 'doctor' && userRole !== 'staff' && (activeTab === 'reception_dashboard' || activeTab === 'reception' || activeTab === 'admin' || activeTab === 'analytics') && (
        <View style={styles.topHeader}>
          {/* Left Side: Hamburger Menu + Avatar Circle + Branch/User Info */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <TouchableOpacity style={styles.menuDrawerBtn} onPress={() => setDrawerOpen(true)}>
              <Ionicons name="menu-outline" size={24} color="#0f172a" />
            </TouchableOpacity>

            <View style={styles.avatarCircle}>
              <Ionicons name="person" size={20} color="#258ec8" />
            </View>

            {userRole === 'admin' || userRole === 'hr' ? (
              <View>
                <Text style={styles.branchTitle}>
                  {userName && userName.includes('@') ? userName : (userRole === 'hr' ? 'hr@sph.com' : 'admin@sph.com')}
                </Text>
                <View style={styles.tagRow}>
                  <View style={[styles.roleBadge, userRole === 'hr' && { backgroundColor: '#f0fdf4' }]}>
                    <Text style={[styles.roleBadgeText, userRole === 'hr' && { color: '#166534' }]}>
                      {userRole === 'hr' ? 'HR MANAGEMENT' : 'ADMIN'}
                    </Text>
                  </View>
                </View>
              </View>
            ) : (userRole as string) === 'doctor' ? (
              <View>
                <Text style={styles.branchTitle}>{resolveStrictDoctorName(branchPhone, userName)}</Text>
                <Text style={styles.phoneSub}>{branchPhone}</Text>
                <View style={styles.tagRow}>
                  <View style={styles.roleBadge}>
                    <Text style={styles.roleBadgeText}>DOCTOR</Text>
                  </View>
                  <View style={styles.locBadge}>
                    <Ionicons name="location-outline" size={10} color="#64748b" style={{ marginRight: 2 }} />
                    <Text style={styles.locBadgeText}>{branchName || 'Medical Center'}</Text>
                  </View>
                </View>
              </View>
            ) : (
              <View>
                <Text style={styles.branchTitle}>{userName || branchName}</Text>
                <Text style={styles.phoneSub}>{branchPhone}</Text>
                <View style={styles.tagRow}>
                  <View style={styles.roleBadge}>
                    <Text style={styles.roleBadgeText}>{(userRole || 'reception').toUpperCase()}</Text>
                  </View>
                  <View style={styles.locBadge}>
                    <Ionicons name="location-outline" size={10} color="#64748b" style={{ marginRight: 2 }} />
                    <Text style={styles.locBadgeText}>{branchName}</Text>
                  </View>
                </View>
              </View>
            )}
          </View>

          {/* Right Side: Notification Bell + Red Logout Button */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity
              style={styles.bellBtn}
              onPress={() => navigateToTab('notifications')}
            >
              <Ionicons name="notifications-outline" size={18} color="#1e293b" />
              {unreadCount > 0 && <View style={styles.redDot} />}
            </TouchableOpacity>

            <TouchableOpacity style={styles.signOutBtnCircle} onPress={handleSignOut}>
              <Ionicons name="log-out-outline" size={18} color="#ef4444" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Sub-Page Professional Navigation Header with Back Arrow < and Page Title */}
      {!isAuthScreen && userRole !== 'doctor' && userRole !== 'staff' && (activeTab !== 'reception_dashboard' && activeTab !== 'reception' && activeTab !== 'admin' && activeTab !== 'analytics' && activeTab !== 'patient_file' && activeTab !== 'reception_patient_file') && (
        <View style={styles.subPageHeader}>
          <TouchableOpacity style={styles.headerBackBtn} onPress={handleGoBack}>
            <Ionicons name="arrow-back" size={22} color="#0f172a" />
          </TouchableOpacity>

          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.subPageTitle} numberOfLines={1}>
              {getSubPageTitle(activeTab)}
            </Text>
          </View>

          <TouchableOpacity style={styles.menuDrawerBtn} onPress={() => setDrawerOpen(true)}>
            <Ionicons name="menu-outline" size={24} color="#64748b" />
          </TouchableOpacity>
        </View>
      )}

      {/* Mobile Reception Side Drawer */}
      {drawerOpen && userRole !== 'staff' && (
        <ReceptionSideDrawer
          visible={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          activeTab={activeTab}
          setActiveTab={navigateToTab}
          userRole={userRole}
          branchName={branchName}
          onSignOut={handleSignOut}
        />
      )}

      {/* Main Screen Content */}
      <View style={{ flex: 1 }}>
        {renderScreen()}
      </View>

      {/* Edge-to-Edge Full Width Bottom Navigation Bar */}
      {!isAuthScreen && userRole !== 'doctor' && userRole !== 'staff' && (
        <View style={styles.fullBottomNavContainer}>
          {bottomNavItems.map((item) => {
            const isActive = activeTab === item.id ||
              (item.id === 'reception_dashboard' && activeTab === 'reception') ||
              (item.id === 'admin' && (activeTab === 'admin' || activeTab === 'analytics' || activeTab === 'branches' || activeTab === 'doctors' || activeTab === 'staff'));
            const isLogout = item.id === 'logout';
            const iconColor = isLogout ? '#ef4444' : isActive ? '#258ec8' : '#64748b';

            return (
              <TouchableOpacity
                key={item.id}
                style={styles.bottomTab}
                onPress={() => handleBottomTabPress(item.id)}
              >
                {item.iconType === 'ionicons' && (
                  <Ionicons name={item.iconName as any} size={22} color={iconColor} />
                )}
                {item.iconType === 'feather' && (
                  <Feather name={item.iconName as any} size={20} color={iconColor} />
                )}
                {item.iconType === 'mci' && (
                  <MaterialCommunityIcons name={item.iconName as any} size={22} color={iconColor} />
                )}

                <Text style={[
                  styles.bottomTabLabel,
                  isActive && styles.bottomTabLabelActive,
                  isLogout && { color: '#ef4444' }
                ]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <MainApp />
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    paddingTop: Platform.OS === 'android' ? 36 : 0,
  },
  topHeader: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  subPageHeader: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    elevation: 1,
  },
  subPageTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
  },
  headerBackBtn: {
    padding: 6,
    marginRight: 2,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  menuDrawerBtn: {
    padding: 4,
  },
  avatarCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#eef5fc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  branchTitle: {
    fontSize: 15.5,
    fontWeight: '800',
    color: '#0f172a',
    lineHeight: 18,
  },
  phoneSub: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  roleBadge: {
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  roleBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#0284c7',
  },
  locBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  locBadgeText: {
    fontSize: 9.5,
    color: '#64748b',
    fontWeight: '600',
  },
  bellBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  redDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
    position: 'absolute',
    top: 6,
    right: 7,
  },
  signOutBtnCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#fef2f2',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  fullBottomNavContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingVertical: 10,
    paddingHorizontal: 8,
    justifyContent: 'space-around',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 8,
  },
  bottomTab: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  bottomTabLabel: {
    fontSize: 9.5,
    color: '#64748b',
    fontWeight: '600',
    marginTop: 3,
  },
  bottomTabLabelActive: {
    color: '#258ec8',
    fontWeight: '800',
  },
});
