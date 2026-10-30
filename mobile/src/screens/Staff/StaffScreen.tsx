import React, { useState, useEffect, useMemo } from 'react';
import {
  StyleSheet, Text, View, ScrollView, TouchableOpacity, TextInput,
  Alert, ActivityIndicator, Image, Modal, Platform, PermissionsAndroid, BackHandler
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import {
  getSafeDb, collection, query, where, onSnapshot, addDoc, updateDoc, doc, orderBy, getDocs, limit
} from '../../utils/firebaseSafe';
import { StaffAttendanceRecord, StaffLeaveRequest, StaffDailyReport } from '@app/shared';
import {
  createStaffDailyReportNotificationInFirestore,
  createStaffPunchInNotificationInFirestore,
  createStaffPunchOutNotificationInFirestore,
  createStaffLeaveRequestNotificationInFirestore,
  triggerSystemPushNotification
} from '../../utils/fcmService';

// Date Helper: Format Date to DD-MM-YYYY
const formatToDDMMYYYY = (d: Date = new Date()): string => {
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
};

// Date Helper: Parse DD-MM-YYYY or YYYY-MM-DD
const parseDDMMYYYY = (str: string): Date | null => {
  if (!str) return null;
  const cleaned = str.trim();
  const sep = cleaned.includes('-') ? '-' : cleaned.includes('/') ? '/' : null;
  if (sep) {
    const parts = cleaned.split(sep);
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        // YYYY-MM-DD
        const [y, m, d] = parts.map(Number);
        return new Date(y, m - 1, d);
      } else {
        // DD-MM-YYYY
        const [d, m, y] = parts.map(Number);
        return new Date(y, m - 1, d);
      }
    }
  }
  const fallback = new Date(cleaned);
  return isNaN(fallback.getTime()) ? null : fallback;
};

interface StaffScreenProps {
  staffId?: string;
  staffName?: string;
  branchName?: string;
  onLogout?: () => void;
}

export const StaffScreen: React.FC<StaffScreenProps> = ({
  staffId = '',
  staffName = 'Staff Member',
  branchName = 'SPH Clinic',
  onLogout
}) => {
  const [activeTab, setActiveTab] = useState<'punch' | 'leaves' | 'reports' | 'history'>('punch');
  const [currentDateTime, setCurrentDateTime] = useState(new Date());

  useEffect(() => {
    AsyncStorage.getItem('@sph_staff_tab').then((saved) => {
      if (saved && ['punch', 'leaves', 'reports', 'history'].includes(saved)) {
        setActiveTab(saved as any);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    AsyncStorage.setItem('@sph_staff_tab', activeTab).catch(() => {});
  }, [activeTab]);

  // Native Android Hardware / Gesture Back Navigation Handler
  useEffect(() => {
    const onHardwareBack = () => {
      if (activeTab !== 'punch') {
        setActiveTab('punch');
        return true;
      }
      return false; // Bubbles to root App.tsx handler for exit confirmation
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', onHardwareBack);
    return () => sub.remove();
  }, [activeTab]);

  // Staff details
  const [staffProfile, setStaffProfile] = useState({
    id: staffId,
    name: staffName,
    branch: branchName,
    role: 'Regular Staff',
    shift: '10:00 AM - 08:30 PM',
    hours: '10.5 hrs/day',
    mobile: ''
  });

  // Attendance states
  const [todayAttendance, setTodayAttendance] = useState<StaffAttendanceRecord | null>(null);
  const [allAttendance, setAllAttendance] = useState<StaffAttendanceRecord[]>([]);
  const [isPunching, setIsPunching] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [locationCoord, setLocationCoord] = useState<{ latitude: number; longitude: number; address: string } | null>(null);

  // Leave Form states (Strictly DD-MM-YYYY format: From Date, To Date, and Joining Date)
  const [leaveType, setLeaveType] = useState<'Casual' | 'Sick' | 'Privilege' | 'Emergency' | 'Half Day'>('Casual');
  const [leaveFrom, setLeaveFrom] = useState('');
  const [leaveTo, setLeaveTo] = useState('');
  const [leaveJoiningDate, setLeaveJoiningDate] = useState('');
  const [leaveReason, setLeaveReason] = useState('');
  const [isSubmittingLeave, setIsSubmittingLeave] = useState(false);
  const [myLeaves, setMyLeaves] = useState<StaffLeaveRequest[]>([]);

  // Daily Work Report Form states (Total Calls, Follow Ups, Contacts, G-Reviews, Video Reviews)
  const [totalCalls, setTotalCalls] = useState('');
  const [followUps, setFollowUps] = useState('');
  const [contacts, setContacts] = useState('');
  const [gReviews, setGReviews] = useState('');
  const [videoReviews, setVideoReviews] = useState('');
  const [reportNotes, setReportNotes] = useState('');
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [myReports, setMyReports] = useState<StaffDailyReport[]>([]);

  // Modal for previewing selfie photo
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState<string | null>(null);

  // Interactive Calendar Date Picker Modal states for Leave Form
  const [calendarModalOpen, setCalendarModalOpen] = useState(false);
  const [datePickerTarget, setDatePickerTarget] = useState<'from' | 'to' | 'joining' | null>(null);
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());
  const [calYear, setCalYear] = useState(() => new Date().getFullYear());

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
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

  const openDatePicker = (target: 'from' | 'to' | 'joining') => {
    setDatePickerTarget(target);
    const targetVal = target === 'from' ? leaveFrom : target === 'to' ? leaveTo : leaveJoiningDate;
    const parsed = parseDDMMYYYY(targetVal);
    if (parsed) {
      setCalMonth(parsed.getMonth());
      setCalYear(parsed.getFullYear());
    } else {
      setCalMonth(new Date().getMonth());
      setCalYear(new Date().getFullYear());
    }
    setCalendarModalOpen(true);
  };

  const handleSelectDate = (formattedDate: string, dateObj: Date) => {
    if (datePickerTarget === 'from') {
      setLeaveFrom(formattedDate);
    } else if (datePickerTarget === 'to') {
      setLeaveTo(formattedDate);
      const nextDay = new Date(dateObj.getTime() + 24 * 60 * 60 * 1000);
      setLeaveJoiningDate(formatToDDMMYYYY(nextDay));
    } else if (datePickerTarget === 'joining') {
      setLeaveJoiningDate(formattedDate);
    }
    setCalendarModalOpen(false);
    setDatePickerTarget(null);
  };

  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  const todayDDMMYYYY = useMemo(() => formatToDDMMYYYY(new Date()), []);
  const tomorrowDDMMYYYY = useMemo(() => {
    const tom = new Date();
    tom.setDate(tom.getDate() + 1);
    return formatToDDMMYYYY(tom);
  }, []);

  // Once per day check: today's submitted report
  const todayReport = useMemo(() => {
    return myReports.find(r => r.date === todayStr);
  }, [myReports, todayStr]);

  // Update clock every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentDateTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Set default leave dates in DD-MM-YYYY format
  useEffect(() => {
    if (!leaveFrom) setLeaveFrom(todayDDMMYYYY);
    if (!leaveTo) setLeaveTo(todayDDMMYYYY);
    if (!leaveJoiningDate) setLeaveJoiningDate(tomorrowDDMMYYYY);
  }, [todayDDMMYYYY, tomorrowDDMMYYYY]);

  // Synchronize state immediately when props change
  useEffect(() => {
    setStaffProfile(prev => ({
      ...prev,
      id: staffId || prev.id,
      name: staffName || prev.name,
      branch: branchName || prev.branch
    }));
  }, [staffId, staffName, branchName]);

  // 1. Fetch Staff Profile from Firestore live
  useEffect(() => {
    const db = getSafeDb();
    if (!db) return;

    const unsub = onSnapshot(collection(db, 'staff'), (snap) => {
      snap.forEach(d => {
        const data = d.data();
        if (
          (staffId && d.id === staffId) ||
          (staffName && data.name && data.name.toLowerCase().trim() === staffName.toLowerCase().trim())
        ) {
          setStaffProfile({
            id: d.id,
            name: data.name || staffName,
            branch: data.branch || branchName,
            role: data.role || 'Regular Staff',
            shift: data.shift || '10:00 AM - 08:30 PM',
            hours: data.hours || '10.5 hrs/day',
            mobile: data.mobile || data.phone || ''
          });
        }
      });
    }, (err) => console.warn('Live staff profile error:', err));
    return () => unsub();
  }, [staffId, staffName, branchName]);

  // 2. Real-time Attendance Listener (Scoped to current staff to prevent WebChannel transport errors)
  useEffect(() => {
    const db = getSafeDb();
    if (!db) return;

    const targetId = staffProfile.id || staffId;
    const targetName = staffProfile.name || staffName;

    try {
      const attRef = collection(db, 'attendance');
      const q = targetId
        ? query(attRef, where('staffId', '==', targetId), limit(40))
        : query(attRef, limit(40));

      const unsub = onSnapshot(q, (snap) => {
        const list: StaffAttendanceRecord[] = [];
        snap.forEach(docSnap => {
          const d = docSnap.data() as any;
          if (!targetId || d.staffId === targetId || (targetName && d.staffName === targetName)) {
            list.push({ id: docSnap.id, ...d });
          }
        });
        list.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        setAllAttendance(list);

        // Check if punched in today
        const todayDoc = list.find(a => a.date === todayStr);
        setTodayAttendance(todayDoc || null);
      }, (err) => console.warn('Attendance subscription notice:', err));

      return () => unsub();
    } catch (e) {
      console.warn('Attendance listener init notice:', e);
    }
  }, [staffProfile.id, staffProfile.name, staffId, staffName, todayStr]);

  // 3. Real-time Leave Requests Listener (Scoped to current staff)
  useEffect(() => {
    const db = getSafeDb();
    if (!db) return;

    const targetId = staffProfile.id || staffId;
    const targetName = staffProfile.name || staffName;

    try {
      const leavesRef = collection(db, 'leaves');
      const q = targetId
        ? query(leavesRef, where('staffId', '==', targetId), limit(30))
        : query(leavesRef, limit(30));

      const unsub = onSnapshot(q, (snap) => {
        const list: StaffLeaveRequest[] = [];
        snap.forEach(docSnap => {
          const d = docSnap.data() as any;
          if (!targetId || d.staffId === targetId || (targetName && d.staffName === targetName)) {
            list.push({ id: docSnap.id, ...d });
          }
        });
        list.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        setMyLeaves(list);
      }, (err) => console.warn('Leaves subscription notice:', err));

      return () => unsub();
    } catch (e) {
      console.warn('Leaves listener init notice:', e);
    }
  }, [staffProfile.id, staffProfile.name, staffId, staffName]);

  // 4. Real-time Daily Work Reports Listener (Scoped to current staff)
  useEffect(() => {
    const db = getSafeDb();
    if (!db) return;

    const targetId = staffProfile.id || staffId;
    const targetName = staffProfile.name || staffName;

    try {
      const reportsRef = collection(db, 'staff_reports');
      const q = targetId
        ? query(reportsRef, where('staffId', '==', targetId), limit(30))
        : query(reportsRef, limit(30));

      const unsub = onSnapshot(q, (snap) => {
        const list: StaffDailyReport[] = [];
        snap.forEach(docSnap => {
          const d = docSnap.data() as any;
          if (!targetId || d.staffId === targetId || (targetName && d.staffName === targetName)) {
            list.push({ id: docSnap.id, ...d });
          }
        });
        list.sort((a, b) => String(b.submittedAt || '').localeCompare(String(a.submittedAt || '')));
        setMyReports(list);
      }, (err) => console.warn('Staff reports subscription notice:', err));

      return () => unsub();
    } catch (e) {
      console.warn('Reports listener init notice:', e);
    }
  }, [staffProfile.id, staffProfile.name, staffId, staffName]);

  // Helper: Get Exact Device Location (Street, Area, District, GPS Coordinates via Hardware GPS)
  const getDeviceLocation = async (): Promise<{ latitude: number; longitude: number; address: string } | null> => {
    let lat: number | null = null;
    let lon: number | null = null;
    let exactPhysicalAddress = '';

    try {
      // 1. Request foreground location permission through expo-location
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Location Permission Required',
          'Please allow Location access in your device settings so Spiritual Homeo can record your attendance at your branch.'
        );
        return null;
      }

      // 2. Verify GPS / Location services is turned ON on device
      const isLocationEnabled = await Location.hasServicesEnabledAsync();
      if (!isLocationEnabled) {
        Alert.alert(
          'Turn On GPS',
          'Please enable Location / GPS on your device and try again.'
        );
        return null;
      }

      // 3. Get exact hardware GPS location
      let location = null;
      try {
        location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
      } catch (locErr) {
        console.warn('getCurrentPosition fast attempt failed, trying last known position:', locErr);
        location = await Location.getLastKnownPositionAsync();
      }

      if (location && location.coords) {
        lat = Number(location.coords.latitude.toFixed(5));
        lon = Number(location.coords.longitude.toFixed(5));
      }
    } catch (err) {
      console.warn('Expo Location hardware detection error:', err);
    }

    // 4. Reverse Geocode Coordinates to human-readable address
    if (lat !== null && lon !== null) {
      try {
        const reverseResults = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
        if (reverseResults && reverseResults.length > 0) {
          const r = reverseResults[0];
          const parts = [
            r.name && r.name !== r.street ? r.name : '',
            r.street,
            r.district || r.subregion,
            r.city,
            r.region,
            r.postalCode ? `PIN: ${r.postalCode}` : ''
          ].filter(Boolean);
          if (parts.length > 0) {
            exactPhysicalAddress = parts.join(', ');
          }
        }
      } catch (revErr) {
        console.warn('Expo reverse geocode notice:', revErr);
      }

      // OpenStreetMap Nominatim Fallback if Expo reverseGeocode had no street name
      if (!exactPhysicalAddress) {
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1`, {
            headers: {
              'Accept-Language': 'en',
              'User-Agent': 'SpiritualHomeoApp/1.0 (contact@spiritualhomeo.com)'
            }
          });
          if (res.ok) {
            const data = await res.json();
            if (data && data.address) {
              const a = data.address;
              const parts = [
                a.road || a.pedestrian || a.street,
                a.neighbourhood || a.suburb || a.colony || a.residential,
                a.city_district || a.subdistrict || a.county,
                a.city || a.town || a.village || a.municipality,
                a.state_district,
                a.postcode ? `PIN: ${a.postcode}` : ''
              ].filter(Boolean);

              if (parts.length > 0) {
                exactPhysicalAddress = parts.join(', ');
              }
            }
            if (!exactPhysicalAddress && data?.display_name) {
              exactPhysicalAddress = data.display_name.split(',').slice(0, 4).join(', ').trim();
            }
          }
        } catch (osmErr) {
          console.warn('Nominatim reverse geocode notice:', osmErr);
        }
      }

      const finalAddress = exactPhysicalAddress || `Coordinates: ${lat.toFixed(4)}, ${lon.toFixed(4)}`;

      return {
        latitude: lat,
        longitude: lon,
        address: `${finalAddress} [GPS: ${lat.toFixed(4)}, ${lon.toFixed(4)}]`
      };
    }

    // If location could not be determined at all
    Alert.alert(
      'Location / GPS Required',
      'Unable to detect your device GPS location. Please make sure Location / GPS is turned ON and permissions are allowed.'
    );
    return null;
  };

  // Helper: Capture Photo (Camera with Gallery fallback, front selfie + high compression)
  const captureSelfiePhoto = async (): Promise<string | null> => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        // Fallback to gallery
        const gal = await ImagePicker.launchImageLibraryAsync({
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.1, // Heavily compressed to ~25-45KB for fast upload and light Firestore storage
          base64: true
        });
        if (!gal.canceled && gal.assets && gal.assets[0]) {
          const a = gal.assets[0];
          return a.base64 ? `data:image/jpeg;base64,${a.base64}` : a.uri;
        }
        return null;
      }

      const result = await ImagePicker.launchCameraAsync({
        cameraType: ImagePicker.CameraType.front,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.1, // Heavily compressed to ~25-45KB for fast upload and light Firestore storage
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const a = result.assets[0];
        return a.base64 ? `data:image/jpeg;base64,${a.base64}` : a.uri;
      }
      return null;
    } catch (err) {
      console.warn('Camera capture notice:', err);
      // Fallback to image library
      const fallback = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.1, // Heavily compressed to ~25-45KB
        base64: true
      });
      if (!fallback.canceled && fallback.assets && fallback.assets[0]) {
        const a = fallback.assets[0];
        return a.base64 ? `data:image/jpeg;base64,${a.base64}` : a.uri;
      }
      return null;
    }
  };

  // Action: Handle Punch In
  const handlePunchIn = async () => {
    setIsPunching(true);
    try {
      // 1. Capture Selfie Photo
      const photoBase64 = await captureSelfiePhoto();
      if (!photoBase64) {
        Alert.alert('Selfie Photo Required', 'Please capture your face photo to complete punch in.');
        setIsPunching(false);
        return;
      }

      // 2. Capture GPS Location (Strict: must have GPS turned on)
      const loc = await getDeviceLocation();
      if (!loc) {
        setIsPunching(false);
        return;
      }
      setLocationCoord(loc);
      setCapturedPhoto(photoBase64);

      // 3. Current Time
      const now = new Date();
      const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

      // 4. Save to Firestore
      const db = getSafeDb();
      if (db) {
        const newRecord: Omit<StaffAttendanceRecord, 'id'> = {
          staffId: staffProfile.id,
          staffName: staffProfile.name,
          role: staffProfile.role,
          branch: staffProfile.branch,
          date: todayStr,
          punchInTime: timeStr,
          punchInLocation: {
            latitude: loc.latitude,
            longitude: loc.longitude,
            address: loc.address
          },
          punchInPhoto: photoBase64,
          status: 'Present',
          createdAt: now.toISOString(),
          updatedAt: now.toISOString()
        };

        await addDoc(collection(db, 'attendance'), newRecord);

        // 1. Immediate local push notification with vibration for the staff member on their device
        triggerSystemPushNotification(
          'Punched In Successfully 🟢',
          `You have been punched in at ${timeStr} for ${staffProfile.branch} Branch.\nLocation: ${loc.address}`,
          { type: 'staff_punch_in', staffName: staffProfile.name, branch: staffProfile.branch, punchInTime: timeStr }
        ).catch(() => {});

        // 2. Notify HR & Admin in Firestore so HR mobile device receives real-time notification
        createStaffPunchInNotificationInFirestore({
          staffName: staffProfile.name,
          staffId: staffProfile.id,
          branch: staffProfile.branch,
          punchInTime: timeStr,
          locationAddress: loc.address
        }).catch(() => {});

        Alert.alert(
          'Punch In Successful! 🟢',
          `Welcome, ${staffProfile.name}!\n\nPunched in at ${timeStr}\nLocation: ${loc.address}`
        );
      }
    } catch (err) {
      console.error('Punch in error:', err);
      Alert.alert('Punch In Error', 'Failed to register punch in. Please try again.');
    } finally {
      setIsPunching(false);
    }
  };

  // Action: Handle Punch Out (Takes Selfie + Exact GPS Location)
  const handlePunchOut = async () => {
    if (!todayAttendance || !todayAttendance.id) {
      Alert.alert('Notice', 'No active punch-in record found for today.');
      return;
    }

    Alert.alert(
      'Confirm Punch Out',
      'Please capture your face selfie photo to complete Punch Out for today.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Take Selfie & Punch Out',
          style: 'destructive',
          onPress: async () => {
            setIsPunching(true);
            try {
              // 1. Capture Selfie Photo for Punch Out
              const photoBase64 = await captureSelfiePhoto();
              if (!photoBase64) {
                Alert.alert('Selfie Photo Required', 'Please capture your face photo to complete punch out.');
                setIsPunching(false);
                return;
              }

              // 2. Exact GPS Location check
              const loc = await getDeviceLocation();
              if (!loc) {
                setIsPunching(false);
                return;
              }

              const now = new Date();
              const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

              // Calculate working hours
              let hoursWorked = '8.0 hrs';
              try {
                if (todayAttendance.punchInTime) {
                  const [timePart, meridiem] = todayAttendance.punchInTime.split(' ');
                  const [h, m] = timePart.split(':').map(Number);
                  let inHour = h % 12 + (meridiem === 'PM' ? 12 : 0);
                  const inDate = new Date();
                  inDate.setHours(inHour, m, 0, 0);
                  const diffMs = Math.max(0, now.getTime() - inDate.getTime());
                  const diffHrs = (diffMs / (1000 * 60 * 60)).toFixed(1);
                  hoursWorked = `${diffHrs} hrs`;
                }
              } catch (_) { }

              const db = getSafeDb();
              if (db && todayAttendance?.id) {
                await updateDoc(doc(db, 'attendance', todayAttendance.id), {
                  punchOutTime: timeStr,
                  punchOutLocation: {
                    latitude: loc.latitude,
                    longitude: loc.longitude,
                    address: loc.address
                  },
                  punchOutPhoto: photoBase64,
                  workingHours: hoursWorked,
                  status: 'Completed',
                  updatedAt: now.toISOString()
                });

                // 1. Immediate local push notification with vibration for the staff member on their device
                triggerSystemPushNotification(
                  'Punched Out Successfully 🔴',
                  `You have been punched out at ${timeStr} (${staffProfile.branch} Branch).\nTotal duration: ${hoursWorked}`,
                  { type: 'staff_punch_out', staffName: staffProfile.name, branch: staffProfile.branch, punchOutTime: timeStr, workingHours: hoursWorked }
                ).catch(() => {});

                // 2. Notify HR & Admin in Firestore so HR mobile device receives real-time notification
                createStaffPunchOutNotificationInFirestore({
                  staffName: staffProfile.name,
                  staffId: staffProfile.id,
                  branch: staffProfile.branch,
                  punchOutTime: timeStr,
                  workingHours: hoursWorked,
                  locationAddress: loc.address
                }).catch(() => {});

                Alert.alert(
                  'Punch Out Successful! 🔴',
                  `Shift completed.\n\nTotal duration: ${hoursWorked}\nLocation: ${loc.address}\n\nHave a great evening!`
                );
              }
            } catch (err) {
              console.error('Punch out error:', err);
              Alert.alert('Punch Out Error', 'Failed to clock out. Please try again.');
            } finally {
              setIsPunching(false);
            }
          }
        }
      ]
    );
  };

  const handleLeaveToChange = (text: string) => {
    setLeaveTo(text);
    const parsed = parseDDMMYYYY(text);
    if (parsed) {
      const nextDay = new Date(parsed.getTime() + 24 * 60 * 60 * 1000);
      setLeaveJoiningDate(formatToDDMMYYYY(nextDay));
    }
  };

  // Action: Submit Leave Application
  const handleApplyLeave = async () => {
    if (!leaveFrom || !leaveTo || !leaveReason.trim()) {
      Alert.alert('Required Fields', 'Please select from date, to date, and enter reason for leave.');
      return;
    }

    setIsSubmittingLeave(true);
    try {
      const fromD = parseDDMMYYYY(leaveFrom);
      const toD = parseDDMMYYYY(leaveTo);
      const d1 = fromD ? fromD.getTime() : new Date(leaveFrom).getTime();
      const d2 = toD ? toD.getTime() : new Date(leaveTo).getTime();
      const days = (!isNaN(d1) && !isNaN(d2))
        ? Math.max(1, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)) + 1)
        : 1;

      // Ensure joining date is determined in DD-MM-YYYY format
      let finalJoiningDate = leaveJoiningDate.trim();
      if (!finalJoiningDate && !isNaN(d2)) {
        const nextDay = new Date(d2 + 24 * 60 * 60 * 1000);
        finalJoiningDate = formatToDDMMYYYY(nextDay);
      }

      const db = getSafeDb();
      if (db) {
        const newLeave: any = {
          staffId: staffProfile.id,
          staffName: staffProfile.name,
          branch: staffProfile.branch,
          leaveType,
          fromDate: leaveFrom,
          toDate: leaveTo,
          joiningDate: finalJoiningDate,
          daysCount: days,
          reason: leaveReason.trim(),
          status: 'Pending',
          createdAt: new Date().toISOString()
        };

        await addDoc(collection(db, 'leaves'), newLeave);

        // Send push notification to Admin & HR
        createStaffLeaveRequestNotificationInFirestore({
          staffName: staffProfile.name,
          branch: staffProfile.branch,
          staffId: staffProfile.id,
          leaveType,
          fromDate: leaveFrom,
          toDate: leaveTo,
          daysCount: days,
          reason: leaveReason.trim(),
        }).catch(() => {});

        Alert.alert(
          'Leave Submitted',
          `Your ${leaveType} leave application for ${days} day(s) (${leaveFrom} to ${leaveTo}, Joining on ${finalJoiningDate}) has been sent to Admin & HR for approval.`
        );
        setLeaveReason('');
      }
    } catch (e) {
      console.error('Apply leave error:', e);
      Alert.alert('Error', 'Failed to submit leave application.');
    } finally {
      setIsSubmittingLeave(false);
    }
  };

  // Action: Submit Daily Work Report (once in a day only)
  const handleSubmitWorkReport = async () => {
    if (todayReport) {
      Alert.alert('Notice', 'You have already submitted your daily work report for today. Daily report can only be submitted once per day.');
      return;
    }

    const tCalls = Number(totalCalls) || 0;
    const fUps = Number(followUps) || 0;
    const conts = Number(contacts) || 0;
    const gRev = Number(gReviews) || 0;
    const vRev = Number(videoReviews) || 0;

    if (!totalCalls && !followUps && !contacts && !gReviews && !videoReviews && !reportNotes.trim()) {
      Alert.alert('Empty Report', 'Please enter your daily metrics or work notes.');
      return;
    }

    setIsSubmittingReport(true);
    try {
      const db = getSafeDb();
      if (db) {
        const newReport: Omit<StaffDailyReport, 'id'> = {
          staffId: staffProfile.id,
          staffName: staffProfile.name,
          branch: staffProfile.branch,
          date: todayStr,
          totalCalls: tCalls,
          followUps: fUps,
          contacts: conts,
          gReviews: gRev,
          videoReviews: vRev,
          callsCount: tCalls,
          reviewsCount: gRev,
          tasksSummary: reportNotes.trim(),
          notes: reportNotes.trim(),
          submittedAt: new Date().toISOString()
        };

        await addDoc(collection(db, 'staff_reports'), newReport);

        // Send push notification to Staff and HR
        createStaffDailyReportNotificationInFirestore({
          staffName: staffProfile.name,
          branch: staffProfile.branch,
          staffId: staffProfile.id,
          totalCalls: tCalls,
          followUps: fUps,
          contacts: conts,
          gReviews: gRev,
          videoReviews: vRev,
          notes: reportNotes.trim(),
        }).catch(() => {});

        Alert.alert('Report Submitted! 🎉', 'Your daily work report has been logged and sent to Admin & HR.');
        setTotalCalls('');
        setFollowUps('');
        setContacts('');
        setGReviews('');
        setVideoReviews('');
        setReportNotes('');
      }
    } catch (e) {
      console.error('Submit report error:', e);
      Alert.alert('Error', 'Failed to submit daily report.');
    } finally {
      setIsSubmittingReport(false);
    }
  };

  // Monthly summary metrics
  const monthlyStats = useMemo(() => {
    const currentMonthPrefix = todayStr.substring(0, 7); // YYYY-MM
    const currentMonthRecords = allAttendance.filter(a => (a.date || '').startsWith(currentMonthPrefix));
    const totalPresent = currentMonthRecords.length;
    const totalHours = currentMonthRecords.reduce((acc, r) => {
      const h = parseFloat(r.workingHours || '0') || 0;
      return acc + h;
    }, 0);
    const leavesThisMonth = myLeaves.filter(l => (l.fromDate || '').startsWith(currentMonthPrefix) && l.status === 'Approved').length;

    return {
      presentDays: totalPresent,
      hours: totalHours.toFixed(1),
      leaves: leavesThisMonth
    };
  }, [allAttendance, myLeaves, todayStr]);

  return (
    <View style={styles.container}>
      {/* Top Staff Identity Banner */}
      <View style={styles.profileBanner}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={styles.avatarLarge}>
            <Ionicons name="person" size={28} color="#258ec8" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.staffNameText}>{staffProfile.name}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <View style={styles.roleChip}>
                <Text style={styles.roleChipText}>Staff ID #{staffProfile.id}</Text>
              </View>
              <View style={styles.branchChip}>
                <Ionicons name="location" size={10} color="#0f766e" />
                <Text style={styles.branchChipText}>{staffProfile.branch} Branch</Text>
              </View>
            </View>
            <Text style={styles.shiftTimeText}>⏰ Shift: {staffProfile.shift}</Text>
          </View>

          {onLogout && (
            <TouchableOpacity onPress={onLogout} style={styles.logoutIconBtn}>
              <Feather name="log-out" size={18} color="#ef4444" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Top 4 Navigation Tabs */}
      <View style={styles.tabsRow}>
        <TouchableOpacity
          style={[styles.navTab, activeTab === 'punch' && styles.navTabActive]}
          onPress={() => setActiveTab('punch')}
        >
          <MaterialCommunityIcons name="clock-check-outline" size={18} color={activeTab === 'punch' ? '#258ec8' : '#64748b'} />
          <Text style={[styles.navTabText, activeTab === 'punch' && styles.navTabTextActive]}>Punch</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navTab, activeTab === 'leaves' && styles.navTabActive]}
          onPress={() => setActiveTab('leaves')}
        >
          <MaterialCommunityIcons name="calendar-account-outline" size={18} color={activeTab === 'leaves' ? '#258ec8' : '#64748b'} />
          <Text style={[styles.navTabText, activeTab === 'leaves' && styles.navTabTextActive]}>Leaves</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navTab, activeTab === 'reports' && styles.navTabActive]}
          onPress={() => setActiveTab('reports')}
        >
          <Feather name="file-text" size={16} color={activeTab === 'reports' ? '#258ec8' : '#64748b'} />
          <Text style={[styles.navTabText, activeTab === 'reports' && styles.navTabTextActive]}>Report</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navTab, activeTab === 'history' && styles.navTabActive]}
          onPress={() => setActiveTab('history')}
        >
          <Ionicons name="calendar-outline" size={17} color={activeTab === 'history' ? '#258ec8' : '#64748b'} />
          <Text style={[styles.navTabText, activeTab === 'history' && styles.navTabTextActive]}>Monthly</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* ============================================================== */}
        {/* TAB 1: PUNCH IN / PUNCH OUT WITH GPS & SELFIE PHOTO            */}
        {/* ============================================================== */}
        {activeTab === 'punch' && (
          <View style={styles.tabContent}>
            {/* Live Digital Clock Card */}
            <View style={styles.clockCard}>
              <Text style={styles.liveClockText}>
                {currentDateTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
              </Text>
              <Text style={styles.liveDateText}>
                {currentDateTime.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </Text>

              {/* Status Pill */}
              <View style={styles.punchStatusRow}>
                <View style={[
                  styles.statusDot,
                  todayAttendance?.punchOutTime ? { backgroundColor: '#64748b' } :
                    todayAttendance ? { backgroundColor: '#22c55e' } : { backgroundColor: '#f59e0b' }
                ]} />
                <Text style={styles.statusPillText}>
                  {todayAttendance?.punchOutTime
                    ? `Shift Completed (Total: ${todayAttendance.workingHours || 'Done'})`
                    : todayAttendance
                      ? `Punched In at ${todayAttendance.punchInTime}`
                      : 'Not Punched In Today'}
                </Text>
              </View>
            </View>

            {/* Punch Action Container */}
            <View style={styles.actionCard}>
              <Text style={styles.actionCardTitle}>Attendance Verification</Text>
              <Text style={styles.actionCardSub}>
                Punches are verified with front camera selfie photo and clinic GPS coordinates.
              </Text>

              {/* Today's Punch Details (if punched in) */}
              {todayAttendance && (
                <View style={styles.todayPunchBox}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View>
                      <Text style={{ fontSize: 13, color: '#64748b', fontWeight: '600' }}>In Time:</Text>
                      <Text style={{ fontSize: 18, fontWeight: '800', color: '#16a34a' }}>{todayAttendance.punchInTime}</Text>
                    </View>
                    <View>
                      <Text style={{ fontSize: 13, color: '#64748b', fontWeight: '600' }}>Out Time:</Text>
                      <Text style={{ fontSize: 18, fontWeight: '800', color: todayAttendance.punchOutTime ? '#dc2626' : '#94a3b8' }}>
                        {todayAttendance.punchOutTime || '--:--'}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      {todayAttendance.punchInPhoto && (
                        <TouchableOpacity onPress={() => setPreviewPhotoUrl(todayAttendance.punchInPhoto || null)}>
                          <Image source={{ uri: todayAttendance.punchInPhoto }} style={styles.selfieThumbnail} />
                          <Text style={{ fontSize: 9, color: '#16a34a', textAlign: 'center', marginTop: 2, fontWeight: '700' }}>In Selfie</Text>
                        </TouchableOpacity>
                      )}
                      {(todayAttendance as any).punchOutPhoto && (
                        <TouchableOpacity onPress={() => setPreviewPhotoUrl((todayAttendance as any).punchOutPhoto || null)}>
                          <Image source={{ uri: (todayAttendance as any).punchOutPhoto }} style={styles.selfieThumbnail} />
                          <Text style={{ fontSize: 9, color: '#dc2626', textAlign: 'center', marginTop: 2, fontWeight: '700' }}>Out Selfie</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>

                  {todayAttendance.punchInLocation && (
                    <View style={styles.gpsLocationRow}>
                      <Ionicons name="location-outline" size={14} color="#0f766e" />
                      <Text style={styles.gpsLocationText} numberOfLines={1}>
                        GPS: {todayAttendance.punchInLocation.address || `${todayAttendance.punchInLocation.latitude}, ${todayAttendance.punchInLocation.longitude}`}
                      </Text>
                    </View>
                  )}
                </View>
              )}

              {/* Main Punch In / Out Button */}
              {!todayAttendance ? (
                <TouchableOpacity
                  style={[styles.bigPunchBtn, { backgroundColor: '#16a34a' }]}
                  onPress={handlePunchIn}
                  disabled={isPunching}
                >
                  {isPunching ? (
                    <ActivityIndicator color="#ffffff" size="small" />
                  ) : (
                    <>
                      <Ionicons name="finger-print" size={32} color="#ffffff" />
                      <Text style={styles.bigPunchBtnText}>PUNCH IN (GPS + SELFIE)</Text>
                      <Text style={styles.bigPunchBtnSub}>Capture selfie & register arrival</Text>
                    </>
                  )}
                </TouchableOpacity>
              ) : !todayAttendance.punchOutTime ? (
                <TouchableOpacity
                  style={[styles.bigPunchBtn, { backgroundColor: '#ef4444' }]}
                  onPress={handlePunchOut}
                  disabled={isPunching}
                >
                  {isPunching ? (
                    <ActivityIndicator color="#ffffff" size="small" />
                  ) : (
                    <>
                      <Ionicons name="log-out-outline" size={32} color="#ffffff" />
                      <Text style={styles.bigPunchBtnText}>PUNCH OUT</Text>
                      <Text style={styles.bigPunchBtnSub}>Clock out & finalize working hours</Text>
                    </>
                  )}
                </TouchableOpacity>
              ) : (
                <View style={styles.shiftDoneBanner}>
                  <Ionicons name="checkmark-circle" size={24} color="#16a34a" />
                  <Text style={styles.shiftDoneText}>Shift Completed for Today!</Text>
                </View>
              )}
            </View>

            {/* Quick 3-Tile Performance Summary */}
            <View style={styles.metricsGrid}>
              <View style={styles.metricTile}>
                <Text style={styles.metricVal}>{monthlyStats.presentDays}</Text>
                <Text style={styles.metricLabel}>Days Present</Text>
              </View>
              <View style={styles.metricTile}>
                <Text style={[styles.metricVal, { color: '#0284c7' }]}>{monthlyStats.hours}h</Text>
                <Text style={styles.metricLabel}>Hours Worked</Text>
              </View>
              <View style={styles.metricTile}>
                <Text style={[styles.metricVal, { color: '#ca8a04' }]}>{monthlyStats.leaves}</Text>
                <Text style={styles.metricLabel}>Approved Leaves</Text>
              </View>
            </View>
          </View>
        )}

        {/* ============================================================== */}
        {/* TAB 2: APPLY LEAVE & LEAVE STATUS HISTORY                      */}
        {/* ============================================================== */}
        {activeTab === 'leaves' && (
          <View style={styles.tabContent}>
            {/* Apply Leave Form */}
            <View style={styles.actionCard}>
              <Text style={styles.actionCardTitle}>Apply for Leave</Text>
              <Text style={styles.actionCardSub}>Requests are directly submitted to Admin & HR for approval.</Text>

              {/* Leave Type Selector Chips */}
              <Text style={styles.fieldLabel}>Leave Category:</Text>
              <View style={styles.chipsRow}>
                {(['Casual', 'Sick', 'Privilege', 'Emergency', 'Half Day'] as const).map(type => (
                  <TouchableOpacity
                    key={type}
                    style={[styles.chipItem, leaveType === type && styles.chipItemActive]}
                    onPress={() => setLeaveType(type)}
                  >
                    <Text style={[styles.chipItemText, leaveType === type && styles.chipItemTextActive]}>{type}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Date Ranges: From Date & To Date with Calendar Date Picker */}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Leave From (DD-MM-YYYY):</Text>
                  <TouchableOpacity
                    style={styles.datePickerBtn}
                    onPress={() => openDatePicker('from')}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="calendar-outline" size={17} color="#0284c7" style={{ marginRight: 6 }} />
                    <Text style={styles.datePickerBtnText}>{leaveFrom || 'Select Date'}</Text>
                  </TouchableOpacity>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Leave To (DD-MM-YYYY):</Text>
                  <TouchableOpacity
                    style={styles.datePickerBtn}
                    onPress={() => openDatePicker('to')}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="calendar-outline" size={17} color="#0284c7" style={{ marginRight: 6 }} />
                    <Text style={styles.datePickerBtnText}>{leaveTo || 'Select Date'}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Joining / Return to Duty Date Field with Calendar Date Picker */}
              <View style={{ marginTop: 12 }}>
                <Text style={styles.fieldLabel}>Joining Date (DD-MM-YYYY):</Text>
                <TouchableOpacity
                  style={[styles.datePickerBtn, { borderColor: '#38bdf8', backgroundColor: '#f0f9ff' }]}
                  onPress={() => openDatePicker('joining')}
                  activeOpacity={0.7}
                >
                  <Ionicons name="calendar" size={18} color="#0284c7" style={{ marginRight: 8 }} />
                  <Text style={[styles.datePickerBtnText, { color: '#0369a1', fontWeight: '800' }]}>
                    {leaveJoiningDate || 'Select Joining Date'}
                  </Text>
                </TouchableOpacity>
                <Text style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                  Expected date of re-joining duty after leave
                </Text>
              </View>

              {/* Reason Input */}
              <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Reason for Leave:</Text>
              <TextInput
                style={[styles.textInput, { height: 70, textAlignVertical: 'top' }]}
                multiline
                numberOfLines={3}
                placeholder="Explain the reason for your leave request..."
                placeholderTextColor="#94a3b8"
                value={leaveReason}
                onChangeText={setLeaveReason}
              />

              <TouchableOpacity
                style={styles.submitPrimaryBtn}
                onPress={handleApplyLeave}
                disabled={isSubmittingLeave}
              >
                {isSubmittingLeave ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.submitPrimaryBtnText}>Submit Leave Application</Text>
                )}
              </TouchableOpacity>
            </View>

            {/* My Leave Requests List (Latest 5 Only) */}
            <Text style={styles.sectionHeader}>
              My Recent Leave Applications ({Math.min(5, myLeaves.length)}{myLeaves.length > 5 ? ` of ${myLeaves.length}` : ''})
            </Text>
            {myLeaves.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="calendar-outline" size={36} color="#cbd5e1" />
                <Text style={styles.emptyStateText}>No leave requests submitted yet.</Text>
              </View>
            ) : (
              myLeaves.slice(0, 5).map(item => (
                <View key={item.id} style={styles.leaveHistoryCard}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.leaveTypeHeading}>{item.leaveType} Leave ({item.daysCount} Days)</Text>
                      <Text style={styles.leaveDatesText}>📅 Leave: {item.fromDate} to {item.toDate}</Text>
                      {(item as any).joiningDate ? (
                        <Text style={[styles.leaveDatesText, { color: '#0284c7', fontWeight: '700', marginTop: 2 }]}>
                          🏢 Joining Date: {(item as any).joiningDate}
                        </Text>
                      ) : null}
                    </View>
                    <View style={[
                      styles.statusBadge,
                      item.status === 'Approved' ? styles.bgGreen : item.status === 'Rejected' ? styles.bgRed : styles.bgYellow
                    ]}>
                      <Text style={[
                        styles.statusBadgeText,
                        item.status === 'Approved' ? styles.textGreen : item.status === 'Rejected' ? styles.textRed : styles.textYellow
                      ]}>
                        {item.status.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.leaveReasonText}>Reason: {item.reason}</Text>
                  {item.reviewNotes && (
                    <Text style={styles.reviewNotesText}>HR Note: {item.reviewNotes}</Text>
                  )}
                </View>
              ))
            )}
          </View>
        )}

        {/* ============================================================== */}
        {/* TAB 3: DAILY WORK REPORT (CALLS, REVIEWS & TASKS)              */}
        {/* ============================================================== */}
        {activeTab === 'reports' && (
          <View style={styles.tabContent}>
            {/* If already submitted today, show Confirmation Card (Once in a day only) */}
            {todayReport ? (
              <View style={[styles.actionCard, { backgroundColor: '#f0fdf4', borderColor: '#86efac' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Ionicons name="checkmark-circle" size={26} color="#16a34a" />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.actionCardTitle, { color: '#166534', marginBottom: 2 }]}>
                      Today's Report Submitted!
                    </Text>
                    <Text style={[styles.actionCardSub, { color: '#15803d', marginBottom: 6 }]}>
                      You have submitted your daily work report for today ({todayReport.date}). Daily reports can only be submitted once per day.
                    </Text>
                  </View>
                </View>

                {/* Today's Logged Metrics (5-Column Clean Metrics Row) */}
                <View style={styles.metricsRow}>
                  <View style={styles.metricCell}>
                    <Text style={styles.metricCellVal}>{todayReport.totalCalls ?? todayReport.callsCount ?? 0}</Text>
                    <Text style={styles.metricCellKey}>Calls</Text>
                  </View>
                  <View style={styles.metricCell}>
                    <Text style={[styles.metricCellVal, { color: '#16a34a' }]}>{todayReport.followUps ?? 0}</Text>
                    <Text style={styles.metricCellKey}>F-Ups</Text>
                  </View>
                  <View style={styles.metricCell}>
                    <Text style={[styles.metricCellVal, { color: '#4f46e5' }]}>{todayReport.contacts ?? 0}</Text>
                    <Text style={styles.metricCellKey}>Contacts</Text>
                  </View>
                  <View style={styles.metricCell}>
                    <Text style={[styles.metricCellVal, { color: '#ca8a04' }]}>{todayReport.gReviews ?? todayReport.reviewsCount ?? 0}</Text>
                    <Text style={styles.metricCellKey}>G-Rev</Text>
                  </View>
                  <View style={styles.metricCell}>
                    <Text style={[styles.metricCellVal, { color: '#db2777' }]}>{todayReport.videoReviews ?? 0}</Text>
                    <Text style={styles.metricCellKey}>Video</Text>
                  </View>
                </View>

                {(todayReport.notes || todayReport.tasksSummary) ? (
                  <View style={{ marginTop: 10, padding: 8, backgroundColor: '#ffffff', borderRadius: 6, borderWidth: 1, borderColor: '#bbf7d0' }}>
                    <Text style={{ fontSize: 10.5, fontWeight: '700', color: '#166534', marginBottom: 2 }}>Notes / Remarks:</Text>
                    <Text style={{ fontSize: 11.5, color: '#334155', lineHeight: 16 }}>{todayReport.notes || todayReport.tasksSummary}</Text>
                  </View>
                ) : null}

                <Text style={{ fontSize: 11, color: '#059669', marginTop: 8, fontWeight: '700' }}>
                  Submitted at: {new Date(todayReport.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
            ) : (
              /* Daily Report Submission Form (Once per day) */
              <View style={styles.actionCard}>
                <Text style={styles.actionCardTitle}>Submit Daily Work Report</Text>
                <Text style={styles.actionCardSub}>Enter your calls, follow-ups, contacts, and review counts for today (Once per day).</Text>

                {/* Row 1: Total Calls & Follow Ups */}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>Total Calls:</Text>
                    <View style={styles.inputWithIcon}>
                      <Ionicons name="call-outline" size={16} color="#258ec8" style={{ marginRight: 6 }} />
                      <TextInput
                        style={styles.flexInput}
                        keyboardType="number-pad"
                        placeholder="e.g. 35"
                        placeholderTextColor="#94a3b8"
                        value={totalCalls}
                        onChangeText={setTotalCalls}
                      />
                    </View>
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>Follow Ups:</Text>
                    <View style={styles.inputWithIcon}>
                      <Ionicons name="repeat-outline" size={16} color="#0d9488" style={{ marginRight: 6 }} />
                      <TextInput
                        style={styles.flexInput}
                        keyboardType="number-pad"
                        placeholder="e.g. 18"
                        placeholderTextColor="#94a3b8"
                        value={followUps}
                        onChangeText={setFollowUps}
                      />
                    </View>
                  </View>
                </View>

                {/* Row 2: Contacts & G-Reviews */}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>Contacts:</Text>
                    <View style={styles.inputWithIcon}>
                      <Ionicons name="people-outline" size={16} color="#6366f1" style={{ marginRight: 6 }} />
                      <TextInput
                        style={styles.flexInput}
                        keyboardType="number-pad"
                        placeholder="e.g. 12"
                        placeholderTextColor="#94a3b8"
                        value={contacts}
                        onChangeText={setContacts}
                      />
                    </View>
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>G-Reviews:</Text>
                    <View style={styles.inputWithIcon}>
                      <Ionicons name="star-outline" size={16} color="#eab308" style={{ marginRight: 6 }} />
                      <TextInput
                        style={styles.flexInput}
                        keyboardType="number-pad"
                        placeholder="e.g. 4"
                        placeholderTextColor="#94a3b8"
                        value={gReviews}
                        onChangeText={setGReviews}
                      />
                    </View>
                  </View>
                </View>

                {/* Row 3: Video Reviews */}
                <View style={{ marginTop: 10 }}>
                  <Text style={styles.fieldLabel}>Video Reviews:</Text>
                  <View style={styles.inputWithIcon}>
                    <Ionicons name="videocam-outline" size={16} color="#ec4899" style={{ marginRight: 6 }} />
                    <TextInput
                      style={styles.flexInput}
                      keyboardType="number-pad"
                      placeholder="e.g. 2"
                      placeholderTextColor="#94a3b8"
                      value={videoReviews}
                      onChangeText={setVideoReviews}
                    />
                  </View>
                </View>

                {/* Row 4: Work Notes / Remarks Text Box */}
                <View style={{ marginTop: 10 }}>
                  <Text style={styles.fieldLabel}>Work Notes / Remarks:</Text>
                  <View style={[styles.inputWithIcon, { alignItems: 'flex-start', paddingTop: 8, minHeight: 74 }]}>
                    <Ionicons name="document-text-outline" size={16} color="#64748b" style={{ marginRight: 6, marginTop: 2 }} />
                    <TextInput
                      style={[styles.flexInput, { height: 60, textAlignVertical: 'top' }]}
                      multiline
                      numberOfLines={3}
                      placeholder="Enter today's work notes, follow-up remarks, or patient updates..."
                      placeholderTextColor="#94a3b8"
                      value={reportNotes}
                      onChangeText={setReportNotes}
                    />
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.submitPrimaryBtn, { backgroundColor: '#258ec8', marginTop: 14 }]}
                  onPress={handleSubmitWorkReport}
                  disabled={isSubmittingReport}
                >
                  {isSubmittingReport ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={styles.submitPrimaryBtnText}>Submit Daily Work Report</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* Submitted Reports History */}
            <Text style={styles.sectionHeader}>My Submitted Reports ({myReports.length})</Text>
            {myReports.length === 0 ? (
              <View style={styles.emptyState}>
                <Feather name="file-text" size={36} color="#cbd5e1" />
                <Text style={styles.emptyStateText}>No work reports submitted yet.</Text>
              </View>
            ) : (
              myReports.map(rep => (
                <View key={rep.id} style={styles.reportCard}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={styles.reportDateText}>Date: {rep.date}</Text>
                    <Text style={styles.reportTimeText}>
                      {new Date(rep.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>

                  {/* 5-Metrics Row */}
                  <View style={styles.metricsRow}>
                    <View style={styles.metricCell}>
                      <Text style={styles.metricCellVal}>{rep.totalCalls ?? rep.callsCount ?? 0}</Text>
                      <Text style={styles.metricCellKey}>Calls</Text>
                    </View>
                    <View style={styles.metricCell}>
                      <Text style={[styles.metricCellVal, { color: '#16a34a' }]}>{rep.followUps ?? 0}</Text>
                      <Text style={styles.metricCellKey}>F-Ups</Text>
                    </View>
                    <View style={styles.metricCell}>
                      <Text style={[styles.metricCellVal, { color: '#4f46e5' }]}>{rep.contacts ?? 0}</Text>
                      <Text style={styles.metricCellKey}>Contacts</Text>
                    </View>
                    <View style={styles.metricCell}>
                      <Text style={[styles.metricCellVal, { color: '#ca8a04' }]}>{rep.gReviews ?? rep.reviewsCount ?? 0}</Text>
                      <Text style={styles.metricCellKey}>G-Rev</Text>
                    </View>
                    <View style={styles.metricCell}>
                      <Text style={[styles.metricCellVal, { color: '#db2777' }]}>{rep.videoReviews ?? 0}</Text>
                      <Text style={styles.metricCellKey}>Video</Text>
                    </View>
                  </View>

                  {/* Notes / Remarks Strip */}
                  {(rep.notes || rep.tasksSummary) ? (
                    <View style={{ marginTop: 8, padding: 8, backgroundColor: '#f8fafc', borderRadius: 6, borderWidth: 1, borderColor: '#e2e8f0' }}>
                      <Text style={{ fontSize: 10.5, fontWeight: '700', color: '#64748b', marginBottom: 2 }}>Notes / Remarks:</Text>
                      <Text style={{ fontSize: 11.5, color: '#334155', lineHeight: 16 }}>{rep.notes || rep.tasksSummary}</Text>
                    </View>
                  ) : null}
                </View>
              ))
            )}
          </View>
        )}

        {/* ============================================================== */}
        {/* TAB 4: MONTHLY ATTENDANCE LOG & CALENDAR                       */}
        {/* ============================================================== */}
        {activeTab === 'history' && (
          <View style={styles.tabContent}>
            {/* Summary card */}
            <View style={styles.actionCard}>
              <Text style={styles.actionCardTitle}>Attendance History</Text>
              <Text style={styles.actionCardSub}>Detailed daily punch in/out timestamps, hours, and GPS records.</Text>
            </View>

            {allAttendance.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="calendar-outline" size={36} color="#cbd5e1" />
                <Text style={styles.emptyStateText}>No attendance records recorded yet.</Text>
              </View>
            ) : (
              allAttendance.map(item => (
                <View key={item.id} style={styles.historyCard}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View>
                      <Text style={styles.historyDateText}>{item.date}</Text>
                      <Text style={styles.historyBranchText}>{item.branch} Branch</Text>
                    </View>
                    <View style={[styles.statusBadge, styles.bgGreen]}>
                      <Text style={[styles.statusBadgeText, styles.textGreen]}>{item.status}</Text>
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
                    <Text style={styles.historyTimeText}>In: {item.punchInTime || '--:--'}</Text>
                    <Text style={styles.historyTimeText}>Out: {item.punchOutTime || '--:--'}</Text>
                    <Text style={[styles.historyTimeText, { fontWeight: '800', color: '#0f172a' }]}>
                      Total: {item.workingHours || '--'}
                    </Text>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
                    {item.punchInPhoto && (
                      <TouchableOpacity
                        onPress={() => setPreviewPhotoUrl(item.punchInPhoto || null)}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
                      >
                        <Image source={{ uri: item.punchInPhoto }} style={{ width: 28, height: 28, borderRadius: 6 }} />
                        <Text style={{ fontSize: 11, color: '#16a34a', fontWeight: '700' }}>In Selfie</Text>
                      </TouchableOpacity>
                    )}
                    {(item as any).punchOutPhoto && (
                      <TouchableOpacity
                        onPress={() => setPreviewPhotoUrl((item as any).punchOutPhoto || null)}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
                      >
                        <Image source={{ uri: (item as any).punchOutPhoto }} style={{ width: 28, height: 28, borderRadius: 6 }} />
                        <Text style={{ fontSize: 11, color: '#dc2626', fontWeight: '700' }}>Out Selfie</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>

      {/* Selfie Photo Preview Modal */}
      <Modal visible={!!previewPhotoUrl} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.photoModalCard}>
            <Text style={styles.photoModalTitle}>Punch-In Selfie Verification</Text>
            {previewPhotoUrl && (
              <Image source={{ uri: previewPhotoUrl }} style={styles.fullPreviewImage} resizeMode="contain" />
            )}
            <TouchableOpacity style={styles.closeModalBtn} onPress={() => setPreviewPhotoUrl(null)}>
              <Text style={styles.closeModalBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Interactive Calendar Date Picker Modal */}
      {calendarModalOpen && (
        <Modal visible={calendarModalOpen} transparent animationType="fade" onRequestClose={() => setCalendarModalOpen(false)}>
          <TouchableOpacity style={styles.calendarModalBackdrop} activeOpacity={1} onPress={() => setCalendarModalOpen(false)}>
            <View style={styles.calendarModalContent} onStartShouldSetResponder={() => true}>

              {/* Modal Title */}
              <View style={styles.calendarTitleRow}>
                <View>
                  <Text style={styles.calendarModalTitle}>
                    {datePickerTarget === 'from' ? 'Select Leave From Date' : datePickerTarget === 'to' ? 'Select Leave To Date' : 'Select Re-joining Duty Date'}
                  </Text>
                  <Text style={styles.calendarModalSub}>Format: DD-MM-YYYY</Text>
                </View>
                <TouchableOpacity onPress={() => setCalendarModalOpen(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={24} color="#94a3b8" />
                </TouchableOpacity>
              </View>

              {/* Month & Year Navigation Header */}
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

              {/* Weekday Labels */}
              <View style={styles.weekdaysRow}>
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                  <Text key={day} style={styles.weekdayLabel}>{day}</Text>
                ))}
              </View>

              {/* Dynamic Days Grid */}
              <View style={styles.daysGrid}>
                {Array.from({ length: startDayIndex }).map((_, idx) => (
                  <View key={`empty-${idx}`} style={styles.dayCellEmpty} />
                ))}

                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((dayNum) => {
                  const formattedMonth = (calMonth + 1) < 10 ? `0${calMonth + 1}` : `${calMonth + 1}`;
                  const formattedDay = dayNum < 10 ? `0${dayNum}` : `${dayNum}`;
                  const dayStr = `${formattedDay}-${formattedMonth}-${calYear}`;
                  const activeVal = datePickerTarget === 'from' ? leaveFrom : datePickerTarget === 'to' ? leaveTo : leaveJoiningDate;
                  const isSelected = activeVal === dayStr;

                  return (
                    <View key={dayNum} style={styles.dayCellWrapper}>
                      <TouchableOpacity
                        style={[styles.dayCell, isSelected && styles.dayCellSelected]}
                        onPress={() => {
                          const dt = new Date(calYear, calMonth, dayNum);
                          handleSelectDate(dayStr, dt);
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.dayCellText, isSelected && styles.dayCellTextSelected]}>
                          {dayNum}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>

              {/* Bottom Quick Select: Today & Close */}
              <View style={styles.calendarFooter}>
                <TouchableOpacity
                  onPress={() => {
                    const today = new Date();
                    handleSelectDate(formatToDDMMYYYY(today), today);
                  }}
                  style={styles.calendarTodayBtn}
                  activeOpacity={0.7}
                >
                  <Ionicons name="today-outline" size={15} color="#0284c7" style={{ marginRight: 4 }} />
                  <Text style={styles.calendarTodayBtnText}>Select Today</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setCalendarModalOpen(false)}
                  style={styles.calendarCloseBtn}
                  activeOpacity={0.7}
                >
                  <Text style={styles.calendarCloseBtnText}>Cancel</Text>
                </TouchableOpacity>
              </View>

            </View>
          </TouchableOpacity>
        </Modal>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  profileBanner: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  avatarLarge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#eef5fc',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#cbd5e1'
  },
  staffNameText: { fontSize: 17, fontWeight: '800', color: '#0f172a' },
  roleChip: {
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4
  },
  roleChipText: { fontSize: 10, fontWeight: '700', color: '#0284c7' },
  branchChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#ccfbf1',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4
  },
  branchChipText: { fontSize: 10, fontWeight: '700', color: '#0f766e' },
  shiftTimeText: { fontSize: 11.5, color: '#64748b', marginTop: 3, fontWeight: '500' },
  logoutIconBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fee2e2'
  },
  tabsRow: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingHorizontal: 8
  },
  navTab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 3,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent'
  },
  navTabActive: {
    borderBottomColor: '#258ec8'
  },
  navTabText: { fontSize: 11, fontWeight: '600', color: '#64748b' },
  navTabTextActive: { color: '#258ec8', fontWeight: '800' },
  tabContent: { padding: 12 },
  clockCard: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3
  },
  liveClockText: { fontSize: 28, fontWeight: '900', color: '#ffffff', letterSpacing: 1 },
  liveDateText: { fontSize: 12.5, color: '#94a3b8', marginTop: 4, fontWeight: '500' },
  punchStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusPillText: { fontSize: 12, color: '#e2e8f0', fontWeight: '700' },
  actionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 14
  },
  actionCardTitle: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  actionCardSub: { fontSize: 11.5, color: '#64748b', marginTop: 2, marginBottom: 12, lineHeight: 16 },
  todayPunchBox: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 14
  },
  selfieThumbnail: { width: 44, height: 44, borderRadius: 8, borderWidth: 1, borderColor: '#cbd5e1' },
  gpsLocationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10 },
  gpsLocationText: { fontSize: 11, color: '#0f766e', fontWeight: '600' },
  bigPunchBtn: {
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2
  },
  bigPunchBtnText: { color: '#ffffff', fontSize: 16, fontWeight: '900', letterSpacing: 0.5, marginTop: 4 },
  bigPunchBtnSub: { color: 'rgba(255,255,255,0.85)', fontSize: 11, marginTop: 2 },
  shiftDoneBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#f0fdf4',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bbf7d0'
  },
  shiftDoneText: { fontSize: 14, fontWeight: '800', color: '#16a34a' },
  metricsGrid: { flexDirection: 'row', gap: 10 },
  metricTile: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  metricVal: { fontSize: 20, fontWeight: '900', color: '#16a34a' },
  metricLabel: { fontSize: 10.5, color: '#64748b', fontWeight: '600', marginTop: 2 },
  fieldLabel: { fontSize: 11.5, fontWeight: '700', color: '#334155', marginBottom: 4 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chipItem: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  chipItemActive: { backgroundColor: '#e0f2fe', borderColor: '#0284c7' },
  chipItemText: { fontSize: 12, fontWeight: '600', color: '#475569' },
  chipItemTextActive: { color: '#0284c7', fontWeight: '800' },
  textInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#0f172a'
  },
  inputWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 8,
    height: 40
  },
  flexInput: { flex: 1, fontSize: 13, color: '#0f172a' },
  submitPrimaryBtn: {
    backgroundColor: '#16a34a',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 14
  },
  submitPrimaryBtnText: { color: '#ffffff', fontSize: 13.5, fontWeight: '800' },
  sectionHeader: { fontSize: 14, fontWeight: '800', color: '#0f172a', marginBottom: 10 },
  leaveHistoryCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 10
  },
  leaveTypeHeading: { fontSize: 14, fontWeight: '800', color: '#0f172a' },
  leaveDatesText: { fontSize: 12, color: '#64748b', marginTop: 2 },
  leaveReasonText: { fontSize: 12.5, color: '#334155', marginTop: 6 },
  reviewNotesText: { fontSize: 11.5, color: '#0284c7', fontWeight: '600', marginTop: 4 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusBadgeText: { fontSize: 10, fontWeight: '800' },
  bgGreen: { backgroundColor: '#f0fdf4' },
  textGreen: { color: '#16a34a' },
  bgRed: { backgroundColor: '#fef2f2' },
  textRed: { color: '#ef4444' },
  bgYellow: { backgroundColor: '#fefce8' },
  textYellow: { color: '#ca8a04' },
  reportCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 10
  },
  reportDateText: { fontSize: 13, fontWeight: '800', color: '#0f172a' },
  reportTimeText: { fontSize: 11, color: '#64748b' },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 2,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  metricCell: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 1,
  },
  metricCellVal: {
    fontSize: 12.5,
    fontWeight: '900',
    color: '#0284c7',
    textAlign: 'center',
  },
  metricCellKey: {
    fontSize: 8.5,
    fontWeight: '700',
    color: '#64748b',
    marginTop: 1,
    textAlign: 'center',
  },
  reportStatsRow: { flexDirection: 'row', gap: 10, marginVertical: 8 },
  statChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f0f9ff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#bae6fd'
  },
  statChipText: { fontSize: 11, fontWeight: '700', color: '#0369a1' },
  reportSummaryText: { fontSize: 12.5, color: '#334155', lineHeight: 17 },
  historyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 10
  },
  historyDateText: { fontSize: 13.5, fontWeight: '800', color: '#0f172a' },
  historyBranchText: { fontSize: 11, color: '#64748b' },
  historyTimeText: { fontSize: 12, color: '#475569', fontWeight: '600' },
  emptyState: { alignItems: 'center', paddingVertical: 32 },
  emptyStateText: { fontSize: 13, color: '#94a3b8', marginTop: 8, fontWeight: '500' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20
  },
  photoModalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center'
  },
  photoModalTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a', marginBottom: 14 },
  fullPreviewImage: { width: 260, height: 260, borderRadius: 12, backgroundColor: '#f1f5f9' },
  closeModalBtn: {
    marginTop: 16,
    backgroundColor: '#0f172a',
    paddingVertical: 10,
    paddingHorizontal: 28,
    borderRadius: 8
  },
  closeModalBtnText: { color: '#ffffff', fontWeight: '800', fontSize: 13 },

  // Interactive Date Picker & Calendar Styles
  datePickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  datePickerBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0f172a',
  },
  calendarModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
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
  calendarTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  calendarModalTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0f172a',
  },
  calendarModalSub: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
    fontWeight: '600',
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
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
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#e0f2fe',
  },
  calendarTodayBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0284c7',
  },
  calendarCloseBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  calendarCloseBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
  }
});
