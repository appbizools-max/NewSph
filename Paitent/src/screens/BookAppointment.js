import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Image, Alert, Platform, KeyboardAvoidingView, ActivityIndicator, Animated, Linking } from 'react-native';
import { Text, Surface, TextInput, Button, Avatar, RadioButton, IconButton, Badge, Menu, Divider } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SIZES } from '../constants/theme';
import { db, auth } from '../firebase';
import { collection, getDocs, query, where, addDoc, updateDoc, serverTimestamp, deleteDoc, doc, setDoc } from 'firebase/firestore';
import { generateRegistrationId, getStandardBranchName } from '../utils/idGenerator';
import {
  User, Phone, Mail, Megaphone, BookOpen,
  Calendar as CalendarIcon, MapPin, Search,
  ChevronDown, Bell, ChevronLeft, ArrowRight,
  ShieldCheck, CheckCircle2, Clock, Users,
  Info, Plus, Check, UserPlus, X
} from 'lucide-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAuth } from '../context/AuthContext';
import { scheduleBookingSuccessNotification, sendRemotePushNotification } from '../utils/notificationHelper';
import { sendBookingSMS } from '../utils/smsHelper';
import { sendBookingWhatsAppNotification } from '../utils/whatsappHelper';
const DOCTOR_SCHEDULES = {
  '1': {
    id: '1',
    name: 'Dr. Prashanth K. Vaidya',
    specialty: 'Homeopathic Physician',
    image: 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?auto=format&fit=crop&q=80&w=300',
    branches: ['Kphb', 'Chandanagar', 'Nallagandla'],
    timings: [
      { branch: 'Kphb', dayOfWeek: [1, 3, 5, 6], intervals: [['12:30', '14:00'], ['17:00', '19:00']] }, // Mon, Wed, Fri, Sat
      { branch: 'Chandanagar', dayOfWeek: [1, 3, 5, 6], intervals: [['10:00', '12:00'], ['19:30', '21:00']] }, // Mon, Wed, Fri, Sat
      { branch: 'Chandanagar', dayOfWeek: [0], intervals: [['11:00', '13:00']] }, // Sun
      { branch: 'Nallagandla', dayOfWeek: [4], intervals: [['11:00', '13:00'], ['18:00', '20:00']] }, // Thu
      { branch: 'Nallagandla', dayOfWeek: [0], intervals: [['18:00', '20:00']] } // Sun
    ]
  },
  '2': {
    id: '2',
    name: 'Dr. Ramakrishna Chanduri',
    specialty: 'Homeopathic Physician',
    image: 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&q=80&w=300',
    branches: ['Dilshuknagar', 'Nallagandla'],
    timings: [
      { branch: 'Dilshuknagar', dayOfWeek: [0, 1, 2, 3, 4], intervals: [['10:00', '14:00'], ['17:00', '20:00']] }, // Sun - Thu
      { branch: 'Nallagandla', dayOfWeek: [5, 6], intervals: [['10:00', '20:00']] } // Fri, Sat
    ]
  },
  '3': {
    id: '3',
    name: 'Dr. Jobeadh Parveej',
    specialty: 'Homeopathic Physician',
    image: 'https://images.unsplash.com/photo-1594824476967-48c8b964273f?auto=format&fit=crop&q=80&w=300',
    branches: ['Nallagandla', 'Kphb'],
    timings: [
      { branch: 'Nallagandla', dayOfWeek: [1], intervals: [['11:00', '13:00'], ['18:00', '19:30']] }, // Mon
      { branch: 'Kphb', dayOfWeek: [2, 3, 5], intervals: [['12:30', '14:00']] }, // Tue, Wed, Fri
      { branch: 'Kphb', dayOfWeek: [6], intervals: [['12:30', '14:00'], ['17:00', '19:00']] } // Sat
    ]
  },
  '4': {
    id: '4',
    name: 'Dr. Padma Priya',
    specialty: 'Homeopathic Physician',
    image: 'https://images.unsplash.com/photo-1559839734-2b71f153678e?auto=format&fit=crop&q=80&w=300',
    branches: ['Nallagandla', 'Chandanagar'],
    timings: [
      { branch: 'Nallagandla', dayOfWeek: [2, 3], intervals: [['10:00', '20:00']] }, // Tue, Wed
      { branch: 'Nallagandla', dayOfWeek: [0], intervals: [['10:00', '17:00']] }, // Sun
      { branch: 'Chandanagar', dayOfWeek: [1, 5], intervals: [['12:00', '20:00']] }, // Mon, Fri
      { branch: 'Chandanagar', dayOfWeek: [0], intervals: [['17:30', '20:00']] }, // Sun
      { branch: 'Chandanagar', dayOfWeek: [4], intervals: [['10:00', '20:00']] } // Thu
    ]
  }
};
const ALL_BRANCHES = [
  { id: 'Kphb', name: 'Kphb' },
  { id: 'Chandanagar', name: 'Chandanagar' },
  { id: 'Nallagandla', name: 'Nallagandla' },
  { id: 'Dilshuknagar', name: 'Dilshuknagar' }
];
const getBranchDirectionLink = (branchName) => {
  if (!branchName) return 'https://www.google.com/maps';
  const name = branchName.toLowerCase();
  if (name.includes('kphb')) return 'https://www.google.com/maps/search/?api=1&query=Spiritual+Homeopathy+KPHB';
  if (name.includes('nallagandla')) return 'https://www.google.com/maps/search/?api=1&query=Spiritual+Homeopathy+Nallagandla';
  if (name.includes('dilsukhnagar') || name.includes('dsnr') || name.includes('dilshuknagar')) return 'https://www.google.com/maps/search/?api=1&query=Spiritual+Homeopathy+Dilshuknagar';
  if (name.includes('chandanagar') || name.includes('chnr') || name.includes('chandnagar')) return 'https://www.google.com/maps/search/?api=1&query=Spiritual+Homeopathy+Chandnagar';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(branchName)}`;
};
const isSlotBlockedByNoShow = (slotTimeStr, dateString, noShows) => {
  if (!noShows || noShows.length === 0) return false;

  const parseTimeToMinutes = (timeStr) => {
    const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (!match) return 0;
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const ampm = match[3].toUpperCase();
    if (ampm === 'PM' && hours < 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;
    return hours * 60 + minutes;
  };
  const slotMin = parseTimeToMinutes(slotTimeStr);
  for (const ns of noShows) {
    if (ns.type === 'date_range') {
      if (dateString < ns.startDate || dateString > ns.endDate) {
        continue;
      }
    } else {
      if (ns.date !== dateString) {
        continue;
      }
    }

    if (ns.type === 'session') {
      if (ns.session === 'all') {
        return true;
      }
      if (ns.session === 'morning') {
        if (slotMin < 840) return true; // before 2:00 PM
      }
      if (ns.session === 'evening') {
        if (slotMin >= 840) return true; // after 2:00 PM
      }
    } else if (ns.type === 'time_range') {
      const parse24hToMinutes = (tStr) => {
        if (!tStr) return 0;
        const parts = tStr.split(':');
        if (parts.length < 2) return 0;
        return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
      };
      const nsStart = parse24hToMinutes(ns.startTime);
      const nsEnd = parse24hToMinutes(ns.endTime);
      if (slotMin >= nsStart && slotMin < nsEnd) {
        return true;
      }
    } else {
      // type === 'date'
      return true;
    }
  }
  return false;
};

const normalizeBranchName = (name) => {
  return getStandardBranchName(name).toLowerCase();
};

const BookAppointment = ({ route, navigation }) => {
  const { userData } = useAuth();
  // Form State
  const [patientData, setPatientData] = useState({
    fullName: userData?.fullName || '',
    patientName: '',
    regID: 'RK/Dilshuknagar/0001',
    phone: userData?.phone || '',
    email: userData?.email || '',
    source: '',
    modeOfConsultation: 'In-Clinic',
    subject: '',
    date: new Date(),
    branch: null,
    doctor: null,
    timeSlot: null
  });
  // UI State
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [branches, setBranches] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(false);
  const isSubmitting = React.useRef(false);
  const [searchDoctor, setSearchDoctor] = useState('');
  const [availableSlots, setAvailableSlots] = useState([]);
  const [fetchingSlots, setFetchingSlots] = useState(false);

  // Dropdown Menus
  const [menuVisible, setMenuVisible] = useState({ source: false, subject: false, branch: false, doctor: false, mode: false });

  // Dropdown widths state for layout matching
  const [dropdownWidths, setDropdownWidths] = useState({});
  const onDropdownLayout = (key) => (event) => {
    const { width } = event.nativeEvent.layout;
    setDropdownWidths(prev => ({ ...prev, [key]: width }));
  };

  // Patient Profiles state
  const [profiles, setProfiles] = useState([]);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [showForm, setShowForm] = useState(true);

  const handleLongPressProfile = (profile) => {
    Alert.alert(
      'Delete Profile',
      `Are you sure you want to delete the profile for "${profile.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteProfile(profile.id)
        }
      ]
    );
  };

  const deleteProfile = async (profileId) => {
    setLoading(true);
    try {
      await deleteDoc(doc(db, 'patient_profiles', profileId));
      Alert.alert('Success', 'Profile deleted successfully.');
      await fetchProfiles();
    } catch (error) {
      console.error("Error deleting profile:", error);
      Alert.alert('Error', 'Failed to delete profile.');
    } finally {
      setLoading(false);
    }
  };

  const [bookingSuccess, setBookingSuccess] = useState(false);

  // Animation values for checkmark and background splash
  const scaleAnim = React.useRef(new Animated.Value(0)).current;
  const opacityAnim = React.useRef(new Animated.Value(0)).current;
  const splashAnim = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (bookingSuccess) {
      Animated.parallel([
        Animated.spring(splashAnim, {
          toValue: 1,
          tension: 18,
          friction: 6,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 40,
          friction: 5,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 400,
          delay: 200,
          useNativeDriver: true,
        })
      ]).start();

      const timer = setTimeout(() => {
        setBookingSuccess(false);
        navigation.navigate('Home');
      }, 3000);

      return () => clearTimeout(timer);
    } else {
      splashAnim.setValue(0);
      scaleAnim.setValue(0);
      opacityAnim.setValue(0);
    }
  }, [bookingSuccess]);

  const fetchProfiles = async () => {
    try {
      if (!auth.currentUser) return;
      const q = query(
        collection(db, 'patient_profiles'),
        where('userId', '==', auth.currentUser.uid)
      );
      const snap = await getDocs(q);
      const list = [];
      snap.forEach(d => {
        list.push({ id: d.id, ...d.data() });
      });

      setProfiles(list);

      if (list.length > 0) {
        const defaultProfile = list[0];
        setSelectedProfile(defaultProfile);
        setPatientData(prev => ({
          ...prev,
          patientName: defaultProfile.name,
          phone: defaultProfile.phone,
          email: defaultProfile.email,
          subject: defaultProfile.subject || defaultProfile.disease || ''
        }));
        setShowForm(false);
      } else {
        setSelectedProfile(null);
        setPatientData(prev => ({
          ...prev,
          patientName: userData?.fullName || '',
          phone: userData?.phone || '',
          email: userData?.email || ''
        }));
        setShowForm(true);
      }
    } catch (e) {
      console.error("Error fetching profiles:", e);
    }
  };

  useEffect(() => {
    if (userData) {
      fetchProfiles();
    }
  }, [userData]);

  const resetForm = () => {
    setPatientData({
      fullName: userData?.fullName || '',
      patientName: profiles.length > 0 ? '' : (userData?.fullName || ''),
      regID: 'RK/Dilshuknagar/0001',
      phone: profiles.length > 0 ? '' : (userData?.phone || ''),
      email: profiles.length > 0 ? '' : (userData?.email || ''),
      source: '',
      modeOfConsultation: 'In-Clinic',
      subject: '',
      date: new Date(),
      branch: null,
      doctor: null,
      timeSlot: null
    });
    if (profiles.length > 0) {
      const defaultProfile = profiles[0];
      setSelectedProfile(defaultProfile);
      setPatientData(prev => ({
        ...prev,
        patientName: defaultProfile.name,
        phone: defaultProfile.phone,
        email: defaultProfile.email,
        subject: defaultProfile.subject || defaultProfile.disease || ''
      }));
      setShowForm(false);
    } else {
      setSelectedProfile(null);
      setShowForm(true);
    }
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      resetForm();
      fetchProfiles();
    });
    return unsubscribe;
  }, [navigation, userData]);

  const handleSelectProfile = (profile) => {
    setSelectedProfile(profile);
    setPatientData(prev => ({
      ...prev,
      patientName: profile.name,
      phone: profile.phone,
      email: profile.email,
      subject: profile.subject || profile.disease || ''
    }));
    setShowForm(false);
  };

  const handleAddNewProfileClick = () => {
    setSelectedProfile(null);
    setPatientData(prev => ({
      ...prev,
      patientName: '',
      phone: '',
      email: ''
    }));
    setShowForm(true);
  };

  const handleEditOrChangeProfile = () => {
    setShowForm(true);
  };

  const handleSelectBranch = (br) => {
    let updatedDoctor = patientData.doctor;
    if (patientData.doctor) {
      const slots = generateSlotsForSelected(patientData.doctor, br.name, patientData.date);
      if (slots.length === 0) {
        updatedDoctor = null;
      }
    }
    setPatientData(prev => ({
      ...prev,
      branch: br,
      doctor: updatedDoctor,
      timeSlot: null
    }));
    toggleMenu('branch');
  };

  // Fetch doctors dynamically from Firestore
  useEffect(() => {
    const fetchFirestoreDoctors = async () => {
      try {
        const q = query(collection(db, 'users'), where('role', '==', 'doctor'));
        const snap = await getDocs(q);

        const list = [];
        const normalizeName = (name) => {
          return name.toLowerCase().replace(/^dr\.\s*/, '').replace(/^dr\s*/, '').replace(/[^a-z0-9]/g, '');
        };

        snap.forEach(d => {
          const u = d.data();
          let docName = String(u.name || '').trim();
          if (docName) {
            // Clean up any double Dr. prefixes or spaces
            while (docName.toLowerCase().startsWith('dr.') || docName.toLowerCase().startsWith('dr ')) {
              if (docName.toLowerCase().startsWith('dr.')) {
                docName = docName.substring(3).trim();
              } else {
                docName = docName.substring(2).trim();
              }
            }
            docName = 'Dr. ' + docName;
          }

          // Check if doctor matches one of our hardcoded templates (case-insensitive robust name check)
          const matchedKey = Object.keys(DOCTOR_SCHEDULES).find(key => {
            const hDoc = DOCTOR_SCHEDULES[key];
            return normalizeName(hDoc.name) === normalizeName(docName);
          });

          let doctorData = {};
          if (matchedKey) {
            doctorData = {
              ...DOCTOR_SCHEDULES[matchedKey],
              id: d.id,
              name: docName || DOCTOR_SCHEDULES[matchedKey].name
            };
          } else {
            const doctorBranches = u.branchName ? [u.branchName] : ['KPHB', 'Chandnagar', 'Nallagandla', 'Dilshuknagar'];
            const timings = doctorBranches.map(brName => ({
              branch: brName,
              dayOfWeek: [0, 1, 2, 3, 4, 5, 6],
              intervals: [['10:00', '14:00'], ['17:00', '20:00']]
            }));
            doctorData = {
              id: d.id,
              name: docName,
              specialty: u.specialty || 'Homeopathic Physician',
              image: u.image || 'https://images.unsplash.com/photo-1559839734-2b71f153678e?auto=format&fit=crop&q=80&w=300',
              branches: doctorBranches,
              timings: timings
            };
          }

          // If the Firestore document has custom schedules/timings configured, prioritize them!
          if (u.timings && Array.isArray(u.timings) && u.timings.length > 0) {
            const customBranches = [...new Set(u.timings.map(t => t.branch))];
            doctorData.timings = u.timings;
            doctorData.branches = customBranches;
          }

          list.push(doctorData);
        });

        setDoctors(list);
      } catch (error) {
        console.error("Error fetching doctors from database:", error);
        setDoctors([]);
      }
    };

    fetchFirestoreDoctors();
  }, [userData]);

  // 1. Initial Doctor Setup from Navigation Param
  useEffect(() => {
    const routeDoctorId = route?.params?.doctorId;
    if (routeDoctorId) {
      const found = doctors.find(d => d.id === routeDoctorId);
      if (found) {
        setPatientData(prev => ({
          ...prev,
          doctor: found,
          branch: null,
          timeSlot: null
        }));
      } else if (DOCTOR_SCHEDULES[routeDoctorId]) {
        const selectedDoctor = DOCTOR_SCHEDULES[routeDoctorId];
        setPatientData(prev => ({
          ...prev,
          doctor: selectedDoctor,
          branch: null,
          timeSlot: null
        }));
      }
    }
  }, [route?.params?.doctorId, doctors]);

  // 2. Dynamic slots listener
  useEffect(() => {
    if (patientData.doctor && patientData.branch && patientData.date) {
      fetchAvailableSlots();
    } else {
      setAvailableSlots([]);
    }
  }, [patientData.doctor, patientData.branch, patientData.date]);

  // Resolve template doctor ID to real Firestore document ID when doctors load
  useEffect(() => {
    if (patientData.doctor && doctors.length > 0) {
      const dbDoc = doctors.find(d => d.name.toLowerCase() === patientData.doctor.name.toLowerCase());
      if (dbDoc && dbDoc.id !== patientData.doctor.id) {
        setPatientData(prev => ({
          ...prev,
          doctor: dbDoc
        }));
      }
    }
  }, [doctors, patientData.doctor]);

  const getFirstAvailableDate = (doctor, branchName, fallbackDate) => {
    if (!doctor || !branchName) return fallbackDate || new Date();
    const start = new Date();
    for (let i = 0; i < 30; i++) {
      const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
      const slots = generateSlotsForSelected(doctor, branchName, d);
      if (slots.length > 0) {
        return d;
      }
    }
    return fallbackDate || start;
  };

  // Adjust date to first available day when doctor or branch changes
  useEffect(() => {
    if (patientData.doctor && patientData.branch) {
      const slots = generateSlotsForSelected(patientData.doctor, patientData.branch.name, patientData.date);
      if (slots.length === 0) {
        const nextAvail = getFirstAvailableDate(patientData.doctor, patientData.branch.name, patientData.date);
        setPatientData(prev => ({ ...prev, date: nextAvail, timeSlot: null }));
      }
    }
  }, [patientData.doctor, patientData.branch]);

  // 3. Dynamic Registration ID Setup (Removed dummy effect, will generate on confirm)

  const generateSlotsForSelected = (doctor, branchName, date) => {
    if (!doctor || !branchName || !date) return [];

    const day = date.getDay();
    const docSched = (doctor && doctor.timings) ? doctor : (DOCTOR_SCHEDULES[doctor.id] || doctor);
    if (!docSched) return [];

    // Find matching schedule timing object supporting both schemas
    const dayTimings = [];
    (docSched.timings || []).forEach(t => {
      if (normalizeBranchName(t.branch) !== normalizeBranchName(branchName)) return;
      if (t.daySchedule) {
        const ivs = t.daySchedule[day] || t.daySchedule[String(day)] || [];
        if (ivs.length > 0) {
          dayTimings.push({ intervals: ivs });
        }
      } else if (t.dayOfWeek && t.dayOfWeek.includes(day)) {
        dayTimings.push({ intervals: t.intervals });
      }
    });

    if (dayTimings.length === 0) return [];

    const slots = [];
    dayTimings.forEach(t => {
      t.intervals.forEach(iv => {
        // Firestore stores as {start,end} objects; legacy data may be [start,end] arrays
        const startStr = Array.isArray(iv) ? iv[0] : iv.start;
        const endStr = Array.isArray(iv) ? iv[1] : iv.end;
        if (!startStr || !endStr) return;
        const [startHour, startMin] = startStr.split(':').map(Number);
        const [endHour, endMin] = endStr.split(':').map(Number);

        let currentHour = startHour;
        let currentMin = startMin;

        while (currentHour < endHour || (currentHour === endHour && currentMin < endMin)) {
          const period = currentHour >= 12 ? 'PM' : 'AM';
          const displayHour = currentHour > 12 ? currentHour - 12 : (currentHour === 0 ? 12 : currentHour);
          const formattedTime = `${displayHour.toString().padStart(2, '0')}:${currentMin.toString().padStart(2, '0')} ${period}`;

          slots.push(formattedTime);

          // Increment by 15 mins
          currentMin += 15;
          if (currentMin >= 60) {
            currentHour += Math.floor(currentMin / 60);
            currentMin = currentMin % 60;
          }
        }
      });
    });

    return slots;
  };

  const getOtherBranchAvailability = (doctor, selectedBranchName, date) => {
    if (!doctor || !date || !selectedBranchName) return '';
    const day = date.getDay();
    const docSched = (doctor && doctor.timings) ? doctor : (DOCTOR_SCHEDULES[doctor.id] || doctor);
    const docNameFormatted = doctor.name ? (doctor.name.startsWith('Dr.') || doctor.name.startsWith('Dr ') ? doctor.name : `Dr. ${doctor.name}`) : '';
    if (!docSched || !docSched.timings) return '';

    const weekdayName = date.toLocaleDateString('en-US', { weekday: 'long' });

    // Find other branches where the doctor is available on this day
    const availableOtherBranches = [];
    docSched.timings.forEach(t => {
      if (normalizeBranchName(t.branch) === normalizeBranchName(selectedBranchName)) return;
      if (t.daySchedule) {
        const ivs = t.daySchedule[day] || t.daySchedule[String(day)] || [];
        if (ivs.length > 0) {
          availableOtherBranches.push({ branch: t.branch, intervals: ivs });
        }
      } else if (t.dayOfWeek && t.dayOfWeek.includes(day)) {
        availableOtherBranches.push({ branch: t.branch, intervals: t.intervals });
      }
    });

    if (availableOtherBranches.length > 0) {
      const branchStrings = availableOtherBranches.map(t => {
        const intervalsStr = t.intervals.map(iv => {
          // Handle both {start,end} object and [start,end] array from Firestore
          const start = Array.isArray(iv) ? iv[0] : iv.start;
          const end = Array.isArray(iv) ? iv[1] : iv.end;
          const formatTimeStr = (tStr) => {
            if (!tStr || typeof tStr !== 'string') return 'N/A';
            const parts = tStr.split(':');
            if (parts.length < 2) return 'N/A';
            const h = Number(parts[0]);
            const m = Number(parts[1]);
            if (isNaN(h) || isNaN(m)) return 'N/A';
            const period = h >= 12 ? 'PM' : 'AM';
            const displayH = h > 12 ? h - 12 : (h === 0 ? 12 : h);
            return `${displayH}:${m.toString().padStart(2, '0')} ${period}`;
          };
          return `${formatTimeStr(start)} - ${formatTimeStr(end)}`;
        }).join(', ');
        return `${t.branch} (${intervalsStr})`;
      });
      return `On ${weekdayName}s, ${docNameFormatted} is available at: ${branchStrings.join(' | ')}.`;
    }

    // If not available anywhere on this day of the week, show weekly schedule
    const allWorkDays = {};
    docSched.timings.forEach(t => {
      if (!allWorkDays[t.branch]) {
        allWorkDays[t.branch] = [];
      }
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      if (t.daySchedule) {
        [0, 1, 2, 3, 4, 5, 6].forEach(d => {
          const ivs = t.daySchedule[d] || t.daySchedule[String(d)] || [];
          if (ivs.length > 0) {
            if (!allWorkDays[t.branch].includes(days[d])) {
              allWorkDays[t.branch].push(days[d]);
            }
          }
        });
      } else if (t.dayOfWeek) {
        t.dayOfWeek.forEach(d => {
          if (!allWorkDays[t.branch].includes(days[d])) {
            allWorkDays[t.branch].push(days[d]);
          }
        });
      }
    });

    const generalSchedules = Object.keys(allWorkDays).map(brName => {
      return `${brName} (${allWorkDays[brName].join(', ')})`;
    });

    if (generalSchedules.length > 0) {
      return `Weekly Schedule for ${docNameFormatted}: ${generalSchedules.join(' | ')}.`;
    }

    return '';
  };

  const fetchAvailableSlots = async () => {
    if (!patientData.doctor || !patientData.branch) return;
    setFetchingSlots(true);
    try {
      const year = patientData.date.getFullYear();
      const month = String(patientData.date.getMonth() + 1).padStart(2, '0');
      const day = String(patientData.date.getDate()).padStart(2, '0');
      const dateString = `${year}-${month}-${day}`;
      const q = query(
        collection(db, 'allpatients'),
        where('doctorId', '==', patientData.doctor.id),
        where('dateString', '==', dateString)
      );

      const qExtra = query(
        collection(db, 'extra_slots'),
        where('doctorId', '==', patientData.doctor.id),
        where('dateString', '==', dateString)
      );

      const [snapshot, snapExtra] = await Promise.all([getDocs(q), getDocs(qExtra)]);

      const bookings = snapshot.docs.map(d => d.data());
      const counts = {};
      const targetBranch = normalizeBranchName(patientData.branch.name);

      bookings.forEach(b => {
        if (b.status === 'cancelled') return;
        const bBranch = normalizeBranchName(b.branchName || b.branchId);
        if (bBranch === targetBranch) {
          const slotKey = b.timeSlot || b.appointmentTime;
          if (slotKey) {
            counts[slotKey] = (counts[slotKey] || 0) + 1;
          }
        }
      });

      let extraSlots = [];
      snapExtra.forEach(docSnap => {
        const data = docSnap.data();
        const bBranch = normalizeBranchName(data.branchName || data.branchId);
        if (bBranch === targetBranch && data.slots) {
          extraSlots = [...extraSlots, ...data.slots];
        }
      });

      // Fetch Doctor No Shows and filter by branch in memory
      const qNoShows = query(
        collection(db, 'doctor_no_shows'),
        where('doctorId', '==', patientData.doctor.id)
      );
      const snapNoShows = await getDocs(qNoShows);
      const activeNoShows = [];
      const normFormBranch = (patientData.branch.name || '').toLowerCase().replace(/\s*branch\s*/i, '').trim();
      snapNoShows.forEach(docSnap => {
        const ns = docSnap.data();
        const nsBranch = (ns.branchName || ns.branchId || '').toLowerCase().replace(/\s*branch\s*/i, '').trim();
        if (nsBranch === normFormBranch) {
          activeNoShows.push(ns);
        }
      });

      const today = new Date();
      const isSelectedDateToday =
        patientData.date.getDate() === today.getDate() &&
        patientData.date.getMonth() === today.getMonth() &&
        patientData.date.getFullYear() === today.getFullYear();

      const parseTimeToMinutes = (timeStr) => {
        const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
        if (!match) return 0;
        let hours = parseInt(match[1], 10);
        const minutes = parseInt(match[2], 10);
        const ampm = match[3].toUpperCase();
        if (ampm === 'PM' && hours < 12) hours += 12;
        if (ampm === 'AM' && hours === 12) hours = 0;
        return hours * 60 + minutes;
      };

      const currentMinutes = today.getHours() * 60 + today.getMinutes();

      const generatedList = generateSlotsForSelected(patientData.doctor, patientData.branch.name, patientData.date);
      const existingDbSlots = Object.keys(counts).filter(t => t && t !== 'null' && t !== 'undefined');
      const combinedList = [...new Set([...generatedList, ...existingDbSlots, ...extraSlots])];

      combinedList.sort((a, b) => {
        const parseToMin = (t) => {
          const m = t.match(/(\d+):(\d+)\s*(AM|PM)/i);
          if (!m) return 0;
          let h = parseInt(m[1], 10), min = parseInt(m[2], 10);
          if (m[3].toUpperCase() === 'PM' && h < 12) h += 12;
          if (m[3].toUpperCase() === 'AM' && h === 12) h = 0;
          return h * 60 + min;
        };
        return parseToMin(a) - parseToMin(b);
      });

      const slotsWithAvailability = combinedList.map(time => {
        const booked = counts[time] || 0;
        const sessionsLeft = 3 - booked;
        const isPastSlot = isSelectedDateToday && parseTimeToMinutes(time) <= currentMinutes;
        const isNoShowBlocked = isSlotBlockedByNoShow(time, dateString, activeNoShows);
        return {
          time,
          bookedCount: booked,
          sessionsLeft: sessionsLeft > 0 ? sessionsLeft : 0,
          isAvailable: booked < 3 && !isPastSlot && !isNoShowBlocked,
          isBlockedByNoShow: isNoShowBlocked
        };
      });

      setAvailableSlots(slotsWithAvailability);
    } catch (error) {
      console.error("Error fetching slots:", error);
    } finally {
      setFetchingSlots(false);
    }
  };

  const handleConfirm = async () => {
    if (loading || isSubmitting.current) return;
    isSubmitting.current = true;
    if (!patientData.patientName || !patientData.branch || !patientData.doctor || !patientData.timeSlot) {
      Alert.alert('Error', 'Please fill in all fields including time slot.');
      isSubmitting.current = false;
      return;
    }

    if (!patientData.email) {
      Alert.alert('Error', 'Email address is mandatory.');
      isSubmitting.current = false;
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(patientData.email)) {
      Alert.alert('Error', 'Please enter a valid email address.');
      isSubmitting.current = false;
      return;
    }

    // Check if the selected slot is in the past
    const today = new Date();
    const isSelectedDateToday =
      patientData.date.getDate() === today.getDate() &&
      patientData.date.getMonth() === today.getMonth() &&
      patientData.date.getFullYear() === today.getFullYear();

    if (isSelectedDateToday) {
      const parseTimeToMinutes = (timeStr) => {
        const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
        if (!match) return 0;
        let hours = parseInt(match[1], 10);
        const minutes = parseInt(match[2], 10);
        const ampm = match[3].toUpperCase();
        if (ampm === 'PM' && hours < 12) hours += 12;
        if (ampm === 'AM' && hours === 12) hours = 0;
        return hours * 60 + minutes;
      };

      const currentMinutes = today.getHours() * 60 + today.getMinutes();
      if (parseTimeToMinutes(patientData.timeSlot) <= currentMinutes) {
        Alert.alert('Error', 'The selected time slot has already passed. Please choose a future slot.');
        isSubmitting.current = false;
        return;
      }
    }

    setLoading(true);
    try {
      // Automatically save profile if form is shown
      if (showForm && patientData.patientName && patientData.patientName.trim()) {
        if (!selectedProfile) {
          console.log("[DEBUG] Saving new profile to Firestore...");
          const newDoc = await addDoc(collection(db, 'patient_profiles'), {
            name: patientData.patientName.trim(),
            phone: (patientData.phone || '').trim(),
            email: (patientData.email || '').trim(),
            subject: (patientData.subject || '').trim(),
            disease: (patientData.subject || '').trim(),
            userId: auth.currentUser.uid,
            createdAt: serverTimestamp()
          });
          console.log("[DEBUG] Profile saved successfully with ID:", newDoc.id);
        } else {
          console.log("[DEBUG] Updating existing profile in Firestore...");
          await updateDoc(doc(db, 'patient_profiles', selectedProfile.id), {
            name: patientData.patientName.trim(),
            phone: (patientData.phone || '').trim(),
            email: (patientData.email || '').trim(),
            subject: (patientData.subject || '').trim(),
            disease: (patientData.subject || '').trim()
          });
          console.log("[DEBUG] Profile updated successfully");
        }
      }

      const year = patientData.date.getFullYear();
      const month = String(patientData.date.getMonth() + 1).padStart(2, '0');
      const day = String(patientData.date.getDate()).padStart(2, '0');
      const dateString = `${year}-${month}-${day}`;

      // Resolve doctor ID from name if it's a template ID (or resolve it anyway to be safe)
      let resolvedDoctorId = patientData.doctor.id;
      if (doctors && doctors.length > 0) {
        const matched = doctors.find(d => d.name.toLowerCase() === patientData.doctor.name.toLowerCase());
        if (matched) {
          resolvedDoctorId = matched.id;
        }
      }

      // Check if slot falls in a Doctor No Show block
      const qNoShows = query(
        collection(db, 'doctor_no_shows'),
        where('doctorId', '==', resolvedDoctorId)
      );
      const snapNoShows = await getDocs(qNoShows);
      const activeNoShows = [];
      const normFormBranch = (patientData.branch.name || '').toLowerCase().replace(/\s*branch\s*/i, '').trim();
      snapNoShows.forEach(docSnap => {
        const ns = docSnap.data();
        const nsBranch = (ns.branchName || ns.branchId || '').toLowerCase().replace(/\s*branch\s*/i, '').trim();
        if (nsBranch === normFormBranch) {
          activeNoShows.push(ns);
        }
      });

      if (isSlotBlockedByNoShow(patientData.timeSlot, dateString, activeNoShows)) {
        Alert.alert('Cannot Book', `${patientData.doctor.name.startsWith('Dr.') || patientData.doctor.name.startsWith('Dr ') ? patientData.doctor.name : `Dr. ${patientData.doctor.name}`} is marked as NO SHOW (unavailable) for this time period.`);
        isSubmitting.current = false;
        setLoading(false);
        return;
      }

      const formattedDateStr = patientData.date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

      const cleanPhone = (patientData.phone || '').replace(/\D/g, '').slice(-10);
      let finalRegId = null;
      try {
        if (cleanPhone.length >= 10) {
          const qAllPatients = query(collection(db, 'allpatients'), where('phone', '==', cleanPhone));
          const snapAllPatients = await getDocs(qAllPatients);
          if (!snapAllPatients.empty) {
            finalRegId = snapAllPatients.docs[0].data().registrationId || snapAllPatients.docs[0].data().regId || null;
          }
        }
      } catch (err) {
        console.error("Error looking up existing registration ID:", err);
      }

      if (!finalRegId) {
        finalRegId = await generateRegistrationId(patientData.branch.name);
      }

      const dayVal = String(patientData.date.getDate()).padStart(2, '0');
      const monthVal = String(patientData.date.getMonth() + 1).padStart(2, '0');
      const yearVal = patientData.date.getFullYear();
      const dateSlash = `${dayVal}/${monthVal}/${yearVal}`;

      const allPatientsRef = doc(collection(db, 'allpatients'));
      const appointmentId = allPatientsRef.id;

      const unifiedAppointmentData = {
        // Shared details
        id: appointmentId,
        patientId: auth.currentUser.uid,
        patientName: patientData.patientName,
        fullName: patientData.patientName,
        phone: cleanPhone,
        patientPhone: cleanPhone,
        email: patientData.email || '',
        age: '',
        gender: '',

        branchId: getStandardBranchName(patientData.branch.id),
        branchName: getStandardBranchName(patientData.branch.name),

        doctorId: resolvedDoctorId,
        doctorName: patientData.doctor.name,
        doctor: patientData.doctor.name,
        specialty: patientData.doctor.specialty || '',
        doctorImage: patientData.doctor.image || '',

        date: patientData.date.toISOString(),
        dateString,
        appointmentDate: dateSlash,

        timeSlot: patientData.timeSlot,
        appointmentTime: patientData.timeSlot,

        subject: patientData.subject,
        disease: patientData.subject,
        symptoms: patientData.subject,
        complaint: patientData.subject,

        status: 'pending',
        paymentStatus: 'pending',
        paymentId: '',
        amountPaid: 0,

        registrationId: finalRegId,
        regId: finalRegId,

        createdAt: serverTimestamp(),
        bookedAt: serverTimestamp(),
        lastUpdated: serverTimestamp(),

        source: 'UserApp',
        bookingSource: 'Patient App',
        isAppBooking: true,
        modeOfConsultation: patientData.modeOfConsultation || 'In-Clinic',
        _type: 'online'
      };

      await setDoc(allPatientsRef, unifiedAppointmentData);

      // Trigger SMS & WhatsApp confirmation asynchronously
      try {
        const targetPhone = unifiedAppointmentData.phone || patientData.phone;
        const targetPatientName = unifiedAppointmentData.fullName || patientData.patientName || 'Patient';
        const targetDocName = unifiedAppointmentData.doctorName || patientData.doctor?.name || 'Doctor';
        const targetDate = unifiedAppointmentData.appointmentDate || patientData.dateString;
        const targetSlot = unifiedAppointmentData.timeSlot || patientData.timeSlot;
        const targetBranch = unifiedAppointmentData.branchName || patientData.branch?.name || 'KPHB';

        sendBookingSMS(
          targetPhone,
          targetPatientName,
          targetDocName,
          targetDate,
          targetSlot,
          targetBranch,
          true // isPatientApp = true
        );

        sendBookingWhatsAppNotification({
          patientName: targetPatientName,
          phone: targetPhone,
          date: targetDate,
          time: targetSlot,
          doctorName: targetDocName,
          branch: targetBranch
        }).catch(waErr => console.warn("Non-critical: WhatsApp booking send failed:", waErr));
      } catch (smsErr) {
        console.warn("Non-critical: SMS/WhatsApp send failed:", smsErr);
      }

      // Notify all receptionists at this branch about the new booking
      try {
        const patientName = patientData.patientName;

        const qRec = query(collection(db, 'users'), where('role', 'in', ['receptionist', 'staff', 'Receptionist', 'Staff', 'RECEPTIONIST', 'STAFF']));
        const snapRec = await getDocs(qRec);
        const targetBranchNorm = normalizeBranchName(patientData.branch.name);

        snapRec.forEach(async (docSnap) => {
          const receptionist = docSnap.data();
          const repBranchIdNorm = normalizeBranchName(receptionist.branchId);
          const repBranchNameNorm = normalizeBranchName(receptionist.branchName);

          if (repBranchIdNorm === targetBranchNorm || repBranchNameNorm === targetBranchNorm) {
            await addDoc(collection(db, 'notifications'), {
              userId: receptionist.uid || docSnap.id,
              title: '🎉 New Appointment Booked',
              body: `${patientName} booked an appointment for ${formattedDateStr} at ${patientData.timeSlot}.`,
              type: 'new_booking_alert',
              isRead: false,
              createdAt: serverTimestamp(),
              metadata: {
                appointmentId: appointmentId,
                patientName,
                date: formattedDateStr,
                timeSlot: patientData.timeSlot,
                branchName: patientData.branch.name
              }
            });

            // Send native system tray push notification
            const recTokens = [];
            if (receptionist.expoPushToken) recTokens.push(receptionist.expoPushToken);
            if (Array.isArray(receptionist.expoPushTokens)) {
              receptionist.expoPushTokens.forEach(t => {
                if (t && !recTokens.includes(t)) recTokens.push(t);
              });
            }
            if (recTokens.length > 0) {
              await sendRemotePushNotification(
                recTokens,
                '🎉 New Appointment Booked',
                `${patientName} booked an appointment for ${formattedDateStr} at ${patientData.timeSlot} (${patientData.branch.name} Branch).`,
                { appointmentId: appointmentId }
              );
            }
          }
        });
      } catch (notifRecErr) {
        console.error("Error notifying receptionists of new booking:", notifRecErr);
      }

      // Trigger high-fidelity push notifications!
      try {
        await scheduleBookingSuccessNotification(patientData.doctor.name, formattedDateStr, patientData.timeSlot);
      } catch (notifErr) {
        console.error("Error dispatching notification triggers:", notifErr);
      }

      // Add to Firestore notifications collection so it shows in the app Notification screen
      try {
        await addDoc(collection(db, 'notifications'), {
          userId: auth.currentUser.uid,
          title: '🎉 Appointment Booked!',
          body: `Your consultation with ${patientData.doctor.name.startsWith('Dr.') || patientData.doctor.name.startsWith('Dr ') ? patientData.doctor.name : `Dr. ${patientData.doctor.name}`} is confirmed for ${formattedDateStr} at ${patientData.timeSlot}.`,
          type: 'booking_confirmed',
          isRead: false,
          createdAt: serverTimestamp()
        });
      } catch (notifDocErr) {
        console.error("Error creating booking notification document:", notifDocErr);
      }

      // Add to Firestore mail collection for backend email trigger
      try {
        const branchDirectionLink = getBranchDirectionLink(patientData.branch.name);
        await addDoc(collection(db, 'mail'), {
          to: patientData.email,
          message: {
            subject: 'Appointment Booking Confirmed - Spiritual Homeopathy',
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
                <h2 style="color: #0ea5e9; text-align: center;">Appointment Confirmed!</h2>
                <p>Dear <strong>${patientData.patientName}</strong>,</p>
                <p>Your appointment has been successfully booked. Below are your booking details:</p>
                
                <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                  <tr style="background-color: #f8fafc;">
                    <td style="padding: 10px; border: 1px solid #cbd5e1; font-weight: bold; width: 120px;">Doctor</td>
                    <td style="padding: 10px; border: 1px solid #cbd5e1;">${patientData.doctor.name}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px; border: 1px solid #cbd5e1; font-weight: bold;">Date</td>
                    <td style="padding: 10px; border: 1px solid #cbd5e1;">${formattedDateStr}</td>
                  </tr>
                  <tr style="background-color: #f8fafc;">
                    <td style="padding: 10px; border: 1px solid #cbd5e1; font-weight: bold;">Time Slot</td>
                    <td style="padding: 10px; border: 1px solid #cbd5e1;">${patientData.timeSlot}</td>
                  </tr>
                  <tr>
                    <td style="padding: 10px; border: 1px solid #cbd5e1; font-weight: bold;">Branch</td>
                    <td style="padding: 10px; border: 1px solid #cbd5e1;">${patientData.branch.name}</td>
                  </tr>
                  <tr style="background-color: #f8fafc;">
                    <td style="padding: 10px; border: 1px solid #cbd5e1; font-weight: bold;">Patient Phone</td>
                    <td style="padding: 10px; border: 1px solid #cbd5e1;">${patientData.phone}</td>
                  </tr>
                </table>
                
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${branchDirectionLink}" style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; font-weight: bold; border-radius: 8px; display: inline-block;">Get Directions to Clinic</a>
                </div>
                
                <p style="color: #64748b; font-size: 12px; text-align: center; margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 20px;">
                  If you have any questions or need to change your appointment, please contact the branch directly.
                  <br/>Spiritual Homeopathy Clinic
                </p>
              </div>
            `
          }
        });
      } catch (mailErr) {
        console.error("Error queueing confirmation email document:", mailErr);
      }

      setBookingSuccess(true);
      resetForm();
    } catch (error) {
      console.error("[DEBUG] Booking error details:", error);
      Alert.alert('Error', 'Failed to book appointment.');
    } finally {
      isSubmitting.current = false;
      setLoading(false);
    }
  };

  const toggleMenu = (key) => setMenuVisible({ ...menuVisible, [key]: !menuVisible[key] });

  const SectionHeader = ({ number, title }) => (
    <View style={styles.sectionHeader}>
      <View style={styles.numberBadge}>
        <Text style={styles.numberText}>{number}</Text>
      </View>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionLine} />
    </View>
  );

  if (bookingSuccess) {
    return (
      <SafeAreaView style={styles.successContainer}>
        {/* Paint Splash expanding background circle */}
        <Animated.View style={[
          styles.splashCircle,
          { transform: [{ scale: splashAnim }] }
        ]} />

        <Animated.View style={{ opacity: opacityAnim, width: '100%', alignItems: 'center', zIndex: 10 }}>
          <View style={styles.successContent}>
            {/* White Tick Circle Container */}
            <Animated.View style={[
              styles.tickCircle,
              { transform: [{ scale: scaleAnim }] }
            ]}>
              <CheckCircle2 size={70} color={COLORS.secondary} />
            </Animated.View>

            <Text style={styles.successTitle}>Booking Successful!</Text>
            <Text style={styles.successSubtitle}>Your appointment has been confirmed.</Text>
          </View>
        </Animated.View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
            <ChevronLeft size={24} color="#1e293b" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Book Appointment</Text>
          <TouchableOpacity style={styles.iconBtn}>
            <Bell size={24} color="#1e293b" />
            <Badge size={16} style={styles.badge}>2</Badge>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Banner */}
          <Surface style={styles.banner}>
            <View style={styles.bannerTextContainer}>
              <Text style={styles.bannerTitle}>Quality care,</Text>
              <Text style={styles.bannerHighlight}>just for you</Text>
              <Text style={styles.bannerSub}>Book your appointment with our specialists in a few simple steps.</Text>
            </View>
            <Image source={{ uri: 'https://img.freepik.com/free-vector/hospital-building-concept-illustration_114360-8440.jpg' }} style={styles.bannerImage} resizeMode="contain" />
          </Surface>

          {/* Section 1: Patient Details */}
          <Surface style={styles.sectionCard}>
            <SectionHeader number="1" title="Patient Details" />

            {/* Profile Selection list */}
            {profiles.length > 0 && (
              <View style={styles.profileSelectorContainer}>
                <Text style={styles.profileSelectorLabel}>Select Profile:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.profileScroll}>
                  {profiles.map((profile) => {
                    const isSelected = selectedProfile?.id === profile.id;
                    const initials = profile.name
                      ? profile.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
                      : 'P';
                    return (
                      <TouchableOpacity
                        key={profile.id}
                        style={styles.profileIconContainer}
                        onPress={() => handleSelectProfile(profile)}
                        onLongPress={() => handleLongPressProfile(profile)}
                        delayLongPress={500}
                      >
                        <View style={[styles.avatarWrapper, isSelected && styles.avatarWrapperActive]}>
                          <Avatar.Text
                            size={40}
                            label={initials}
                            style={[
                              styles.profileAvatar,
                              isSelected ? styles.profileAvatarActive : styles.profileAvatarInactive
                            ]}
                            labelStyle={[
                              styles.profileAvatarText,
                              isSelected && { color: '#fff' }
                            ]}
                          />
                        </View>
                        <Text style={[styles.profileNameText, isSelected && styles.profileNameTextActive]} numberOfLines={1}>
                          {profile.isSelf ? 'Self' : profile.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                  <TouchableOpacity
                    style={styles.addProfileButton}
                    onPress={handleAddNewProfileClick}
                  >
                    <View style={styles.addProfileCircle}>
                      <UserPlus size={18} color={COLORS.secondary} />
                    </View>
                    <Text style={styles.addProfileText}>Add Member</Text>
                  </TouchableOpacity>
                </ScrollView>
              </View>
            )}

            {/* Show profile details card OR form fields */}
            {!showForm && selectedProfile ? (
              <View style={styles.selectedProfileCard}>
                <View style={styles.selectedProfileHeader}>
                  <Avatar.Text
                    size={46}
                    label={selectedProfile.name ? selectedProfile.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'P'}
                    style={{ backgroundColor: COLORS.secondary + '15' }}
                    labelStyle={{ color: COLORS.secondary, fontWeight: '800', fontSize: 14 }}
                  />
                  <View style={styles.selectedProfileInfo}>
                    <Text style={styles.selectedProfileName}>{selectedProfile.name}</Text>
                    <Text style={styles.selectedProfileSub}>{selectedProfile.phone}  •  {selectedProfile.email}</Text>
                    {patientData.subject ? (
                      <Text style={[styles.selectedProfileSub, { marginTop: 4, color: COLORS.secondary }]}>Disease: {patientData.subject}</Text>
                    ) : null}
                  </View>
                </View>
                <TouchableOpacity style={styles.changeProfileBtn} onPress={handleEditOrChangeProfile}>
                  <Text style={styles.changeProfileBtnText}>Edit Details / Book for someone else</Text>
                </TouchableOpacity>
              </View>
            ) : showForm ? (
              <View>
                <View style={styles.inputRow}>
                  <View style={styles.flex1}>
                    <Text style={styles.inputLabel}>Patient Name</Text>
                    <TextInput
                      placeholder="Enter patient's name"
                      value={patientData.patientName}
                      onChangeText={(text) => setPatientData({ ...patientData, patientName: text })}
                      mode="outlined"
                      style={styles.input}
                      left={<TextInput.Icon icon={() => <User size={18} color="#94a3b8" />} />}
                      outlineColor="#e2e8f0"
                      activeOutlineColor={COLORS.secondary}
                      outlineStyle={{ borderRadius: 16 }}
                      contentStyle={{ fontSize: 13 }}
                    />
                  </View>
                </View>

                <View style={[styles.inputRow, { marginTop: 16 }]}>
                  <View style={styles.flex1}>
                    <Text style={styles.inputLabel}>Phone (+91)</Text>
                    <TextInput
                      placeholder="Phone"
                      value={patientData.phone}
                      onChangeText={(text) => setPatientData({ ...patientData, phone: text })}
                      mode="outlined"
                      keyboardType="phone-pad"
                      style={styles.input}
                      left={<TextInput.Icon icon={() => <Phone size={18} color="#94a3b8" />} />}
                      outlineColor="#e2e8f0"
                      activeOutlineColor={COLORS.secondary}
                      outlineStyle={{ borderRadius: 16 }}
                      contentStyle={{ fontSize: 13 }}
                    />
                  </View>
                  <View style={styles.spacer} />
                  <View style={styles.flex1}>
                    <Text style={styles.inputLabel}>Email Address *</Text>
                    <TextInput
                      placeholder="Email"
                      value={patientData.email}
                      onChangeText={(text) => setPatientData({ ...patientData, email: text })}
                      mode="outlined"
                      style={styles.input}
                      left={<TextInput.Icon icon={() => <Mail size={18} color="#94a3b8" />} />}
                      outlineColor="#e2e8f0"
                      activeOutlineColor={COLORS.secondary}
                      outlineStyle={{ borderRadius: 16 }}
                      contentStyle={{ fontSize: 13 }}
                    />
                  </View>
                </View>

                <View style={[styles.inputRow, { marginTop: 16 }]}>
                  <View style={styles.flex1}>
                    <Text style={styles.inputLabel}>Diseases</Text>
                    <TextInput
                      placeholder="Enter diseases"
                      value={patientData.subject}
                      onChangeText={(text) => setPatientData({ ...patientData, subject: text })}
                      mode="outlined"
                      style={styles.input}
                      left={<TextInput.Icon icon={() => <BookOpen size={18} color="#94a3b8" />} />}
                      outlineColor="#e2e8f0"
                      activeOutlineColor={COLORS.secondary}
                      outlineStyle={{ borderRadius: 16 }}
                      contentStyle={{ fontSize: 13 }}
                    />
                  </View>
                </View>
              </View>
            ) : (
              <View style={styles.noProfileSelectedCard}>
                <Users size={24} color="#64748b" style={{ marginBottom: 8 }} />
                <Text style={styles.noProfileSelectedText}>No patient details selected.</Text>
                <Text style={styles.noProfileSelectedSub}>Please select a patient profile from the list above, or tap "+ Add Member" to enter new details.</Text>
              </View>
            )}
          </Surface>

          {/* Section 2: Appointment Information */}
          <Surface style={styles.sectionCard}>
            <SectionHeader number="2" title="Appointment Information" />
            <View style={styles.inputRow}>
              <View style={styles.flex1}>
                <Text style={styles.inputLabel}>Date</Text>
                <TouchableOpacity style={styles.dropdown} onPress={() => setShowDatePicker(true)}>
                  <CalendarIcon size={18} color="#94a3b8" /><Text style={styles.dropdownText}>{patientData.date.toLocaleDateString()}</Text><CalendarIcon size={18} color="#94a3b8" />
                </TouchableOpacity>
                {showDatePicker && (
                  <DateTimePicker
                    value={patientData.date}
                    mode="date"
                    display="default"
                    minimumDate={new Date()}
                    maximumDate={new Date(new Date().getTime() + 30 * 24 * 60 * 60 * 1000)}
                    onValueChange={(event, selectedDate) => {
                      setShowDatePicker(false);
                      if (selectedDate) {
                        let updatedDoctor = patientData.doctor;
                        if (patientData.doctor && patientData.branch) {
                          const slots = generateSlotsForSelected(patientData.doctor, patientData.branch.name, selectedDate);
                          if (slots.length === 0) {
                            updatedDoctor = null; // Reset doctor selection if unavailable
                          }
                        }
                        setPatientData({ ...patientData, date: selectedDate, doctor: updatedDoctor, timeSlot: null });
                      }
                    }}
                    onDismiss={() => setShowDatePicker(false)}
                  />
                )}
              </View>
            </View>

            <View style={[styles.inputRow, { marginTop: 16 }]}>
              <View style={styles.flex1}>
                <Text style={styles.inputLabel}>How did you hear about us?</Text>
                <Menu
                  visible={menuVisible.source}
                  onDismiss={() => toggleMenu('source')}
                  style={[dropdownWidths['source'] ? { width: dropdownWidths['source'] } : null, { marginTop: 50 }]}
                  contentStyle={[dropdownWidths['source'] ? { width: dropdownWidths['source'] } : null, { backgroundColor: '#ffffff', borderRadius: 12, overflow: 'hidden' }]}
                  anchor={
                    <TouchableOpacity
                      onLayout={onDropdownLayout('source')}
                      style={styles.dropdown}
                      onPress={() => toggleMenu('source')}
                    >
                      <Megaphone size={18} color="#94a3b8" />
                      <Text style={[styles.dropdownText, !patientData.source && { color: '#94a3b8' }]} numberOfLines={1}>
                        {patientData.source || 'Select'}
                      </Text>
                      <ChevronDown size={18} color="#94a3b8" />
                    </TouchableOpacity>
                  }
                >
                  <ScrollView style={{ maxHeight: 200 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={true}>
                    {['Instagram', 'Facebook', 'Website', 'Google', 'Practo', 'Referral', 'Youtube', 'Any Other'].map((item) => (
                      <Menu.Item
                        key={item}
                        onPress={() => { setPatientData({ ...patientData, source: item }); toggleMenu('source'); }}
                        title={item}
                        titleStyle={{ color: '#000000', fontWeight: '500', fontSize: 14 }}
                      />
                    ))}
                  </ScrollView>
                </Menu>
              </View>
              <View style={styles.spacer} />
              <View style={styles.flex1}>
                <Text style={styles.inputLabel}>Mode of Consultation</Text>
                <Menu
                  visible={menuVisible.mode}
                  onDismiss={() => toggleMenu('mode')}
                  style={[dropdownWidths['mode'] ? { width: dropdownWidths['mode'] } : null, { marginTop: 50 }]}
                  contentStyle={[dropdownWidths['mode'] ? { width: dropdownWidths['mode'] } : null, { backgroundColor: '#ffffff', borderRadius: 12, overflow: 'hidden' }]}
                  anchor={
                    <TouchableOpacity
                      onLayout={onDropdownLayout('mode')}
                      style={styles.dropdown}
                      onPress={() => toggleMenu('mode')}
                    >
                      <Users size={18} color="#94a3b8" />
                      <Text style={[styles.dropdownText, !patientData.modeOfConsultation && { color: '#94a3b8' }]} numberOfLines={1}>
                        {patientData.modeOfConsultation || 'Select'}
                      </Text>
                      <ChevronDown size={18} color="#94a3b8" />
                    </TouchableOpacity>
                  }
                >
                  <ScrollView style={{ maxHeight: 120 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={true}>
                    {['In-Clinic', 'Online'].map((item) => (
                      <Menu.Item
                        key={item}
                        onPress={() => { setPatientData({ ...patientData, modeOfConsultation: item }); toggleMenu('mode'); }}
                        title={item}
                        titleStyle={{ color: '#000000', fontWeight: '500', fontSize: 14 }}
                      />
                    ))}
                  </ScrollView>
                </Menu>
              </View>
            </View>

            {/* 1. Branch Selection Dropdown */}
            <View style={styles.fullWidthInput}>
              <Text style={styles.inputLabel}>Select Branch</Text>
              <Menu
                visible={menuVisible.branch}
                onDismiss={() => toggleMenu('branch')}
                style={[dropdownWidths['branch'] ? { width: dropdownWidths['branch'] } : null, { marginTop: 50 }]}
                contentStyle={[dropdownWidths['branch'] ? { width: dropdownWidths['branch'] } : null, { backgroundColor: '#ffffff', borderRadius: 12, overflow: 'hidden' }]}
                anchor={
                  <TouchableOpacity
                    onLayout={onDropdownLayout('branch')}
                    style={styles.dropdown}
                    onPress={() => toggleMenu('branch')}
                  >
                    <MapPin size={18} color="#94a3b8" />
                    <Text style={[styles.dropdownText, !patientData.branch && { color: '#94a3b8' }]} numberOfLines={1}>
                      {patientData.branch?.name || 'Select Branch'}
                    </Text>
                    <ChevronDown size={18} color="#94a3b8" />
                  </TouchableOpacity>
                }
              >
                <ScrollView style={{ maxHeight: 200 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={true}>
                  {ALL_BRANCHES.map((br) => (
                    <Menu.Item
                      key={br.id}
                      onPress={() => handleSelectBranch(br)}
                      title={br.name}
                      titleStyle={{ color: '#000000', fontWeight: '500', fontSize: 14 }}
                    />
                  ))}
                </ScrollView>
              </Menu>
            </View>

            {/* 2. Doctor Selection Dropdown - Dynamically populated based on selected branch */}
            {(patientData.branch || patientData.doctor) && (
              <View style={styles.fullWidthInput}>
                <Text style={styles.inputLabel}>Select Doctor</Text>
                <Menu
                  visible={menuVisible.doctor}
                  onDismiss={() => toggleMenu('doctor')}
                  style={[dropdownWidths['doctor'] ? { width: dropdownWidths['doctor'] } : null, { marginTop: 50 }]}
                  contentStyle={[dropdownWidths['doctor'] ? { width: dropdownWidths['doctor'] } : null, { backgroundColor: '#ffffff', borderRadius: 12, overflow: 'hidden' }]}
                  anchor={
                    <TouchableOpacity
                      onLayout={onDropdownLayout('doctor')}
                      style={styles.dropdown}
                      onPress={() => toggleMenu('doctor')}
                    >
                      <User size={18} color="#94a3b8" />
                      <Text style={[styles.dropdownText, !patientData.doctor && { color: '#94a3b8' }]} numberOfLines={1}>
                        {patientData.doctor?.name || 'Select Doctor'}
                      </Text>
                      <ChevronDown size={18} color="#94a3b8" />
                    </TouchableOpacity>
                  }
                >
                  <ScrollView style={{ maxHeight: 200 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={true}>
                    {doctors
                      .filter((doc) => {
                        if (patientData.branch && patientData.date) {
                          const slots = generateSlotsForSelected(doc, patientData.branch.name, patientData.date);
                          return slots.length > 0;
                        }
                        return true;
                      })
                      .map((doc) => (
                        <Menu.Item
                          key={doc.id}
                          onPress={() => { setPatientData({ ...patientData, doctor: doc, timeSlot: null }); toggleMenu('doctor'); }}
                          title={doc.name}
                          titleStyle={{ color: '#000000', fontWeight: '500', fontSize: 14 }}
                        />
                      ))}
                  </ScrollView>
                </Menu>
              </View>
            )}

            {/* Time Slot Selection */}
            <View style={{ marginTop: 24 }}>
              <View style={styles.slotHeader}>
                <Clock size={16} color={COLORS.secondary} />
                <Text style={styles.subLabel}>  Available Slots</Text>
              </View>

              {!patientData.doctor || !patientData.branch ? (
                <View style={styles.noDoctorMsg}>
                  <Info size={14} color="#94a3b8" />
                  <Text style={styles.noDoctorText}> Please select a doctor and branch to check availability.</Text>
                </View>
              ) : fetchingSlots ? (
                <ActivityIndicator color={COLORS.secondary} style={{ marginTop: 10 }} />
              ) : availableSlots.length === 0 ? (
                <View style={[styles.noDoctorMsg, { flexDirection: 'column', alignItems: 'stretch', padding: 12 }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                    <Info size={16} color="#ef4444" />
                    <Text style={[styles.noDoctorText, { color: '#ef4444', fontWeight: '800', marginLeft: 8 }]}>
                      {`${patientData.doctor.name.startsWith('Dr.') || patientData.doctor.name.startsWith('Dr ') ? patientData.doctor.name : `Dr. ${patientData.doctor.name}`} is not available on ${patientData.date.toLocaleDateString('en-US', { weekday: 'long' })}s at ${patientData.branch.name}.`}
                    </Text>
                  </View>
                  <Text style={[styles.noDoctorText, { color: '#475569', fontSize: 11, lineHeight: 16, marginTop: 4, paddingLeft: 24 }]}>
                    {getOtherBranchAvailability(patientData.doctor, patientData.branch.name, patientData.date)}
                  </Text>
                </View>
              ) : (
                <View style={styles.slotGrid}>
                  {availableSlots.map((slot, index) => (
                    <TouchableOpacity
                      key={index}
                      style={[
                        styles.slotChip,
                        !slot.isAvailable && styles.slotDisabled,
                        patientData.timeSlot === slot.time && styles.slotSelected
                      ]}
                      disabled={!slot.isAvailable}
                      onPress={() => setPatientData({ ...patientData, timeSlot: slot.time })}
                    >
                      <Text style={[
                        styles.slotText,
                        !slot.isAvailable && styles.slotTextDisabled,
                        patientData.timeSlot === slot.time && styles.slotTextSelected
                      ]}>
                        {slot.time}
                      </Text>
                      {slot.isAvailable ? (
                        <Text style={[
                          styles.sessionsLeftText,
                          patientData.timeSlot === slot.time && styles.sessionsLeftTextSelected
                        ]}>
                          {`${slot.sessionsLeft} left`}
                        </Text>
                      ) : slot.isBlockedByNoShow ? (
                        <View style={[styles.fullBadge, { backgroundColor: '#fee2e2' }]}><Text style={[styles.fullText, { color: '#ef4444' }]}>No Show</Text></View>
                      ) : (
                        <View style={styles.fullBadge}><Text style={styles.fullText}>Full</Text></View>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          </Surface>

          {/* Confirm Button */}
          <TouchableOpacity onPress={handleConfirm} disabled={loading} style={[styles.confirmBtn, { backgroundColor: COLORS.secondary, height: 56, justifyContent: 'center' }]}>
            <View style={styles.confirmBtnInner}>
              <View style={styles.row}>
                {loading ? <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} /> : <ShieldCheck size={20} color={COLORS.white} />}
                <Text style={styles.confirmBtnText} adjustsFontSizeToFit numberOfLines={1}>Book Appointment</Text>
              </View>
              <ArrowRight size={20} color={COLORS.white} />
            </View>
          </TouchableOpacity>

          <View style={styles.footerSpacing} />
        </ScrollView>
      </KeyboardAvoidingView>


    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fcfdfe' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: COLORS.white },
  iconBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#1e293b' },
  badge: { position: 'absolute', top: 6, right: 6, backgroundColor: '#ef4444' },
  scrollContent: { padding: 16 },
  banner: { backgroundColor: '#eff6ff', borderRadius: 24, padding: 20, flexDirection: 'row', marginBottom: 24, height: 140, elevation: 0, borderWidth: 1, borderColor: '#dbeafe', overflow: 'hidden' },
  bannerTextContainer: { flex: 1.2, justifyContent: 'center' },
  bannerTitle: { fontSize: 18, fontWeight: '700', color: '#1e293b' },
  bannerHighlight: { fontSize: 18, fontWeight: '800', color: COLORS.secondary, marginTop: 2 },
  bannerSub: { fontSize: 10, color: '#64748b', marginTop: 8, fontWeight: '500', lineHeight: 14 },
  bannerImage: { flex: 0.8, width: '100%', height: '120%', position: 'absolute', right: -10, bottom: -10 },
  sectionCard: { padding: 20, borderRadius: 24, backgroundColor: COLORS.white, marginBottom: 24, elevation: 2, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 10, borderWidth: 1, borderColor: '#f1f5f9' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  numberBadge: { width: 24, height: 24, borderRadius: 6, backgroundColor: COLORS.secondary, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  numberText: { fontSize: 12, fontWeight: '800', color: COLORS.white },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#1e293b' },
  sectionLine: { flex: 1, height: 1, backgroundColor: '#f1f5f9', marginLeft: 12 },
  inputRow: { flexDirection: 'row', width: '100%' },
  flex1: { flex: 1 },
  spacer: { width: 16 },
  inputLabel: { fontSize: 12, fontWeight: '700', color: '#1e293b', marginBottom: 8 },
  input: { backgroundColor: '#fcfdfe', height: 50, fontSize: 13, borderRadius: 16 },
  disabledInput: { backgroundColor: '#f8fafc' },
  regIdBox: { position: 'relative' },
  verifiedIcon: { position: 'absolute', right: 12, top: '50%', marginTop: -8 },
  fullWidthInput: { marginTop: 16 },
  dropdown: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: 50, borderRadius: 16, borderWidth: 1.5, borderColor: '#e2e8f0', backgroundColor: '#fcfdfe', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  dropdownText: { flex: 1, marginLeft: 12, fontSize: 13, color: '#1e293b', fontWeight: '500' },
  subLabel: { fontSize: 13, fontWeight: '700', color: '#1e293b', marginBottom: 12 },
  searchBox: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, height: 40, borderRadius: 10, backgroundColor: '#f8fafc', marginBottom: 12 },
  searchField: { flex: 1, marginLeft: 10, fontSize: 12, color: '#1e293b' },
  doctorList: { marginTop: 4 },
  doctorItem: { paddingVertical: 6, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', borderRadius: 10 },
  radioRow: { flexDirection: 'row', alignItems: 'center' },
  selectedDoctor: { backgroundColor: '#f0f9ff', borderBottomWidth: 0 },
  docInfo: { flex: 1, marginLeft: 10 },
  docName: { fontSize: 13, fontWeight: '700', color: '#1e293b' },
  docSpecLabel: { fontSize: 10, fontWeight: '700', color: COLORS.secondary },
  slotHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  noDoctorMsg: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', padding: 8, borderRadius: 8, marginBottom: 12 },
  noDoctorText: { fontSize: 11, color: '#64748b', fontWeight: '500' },
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start' },
  slotChip: { width: '22%', margin: '1.5%', paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center', backgroundColor: '#fff', position: 'relative' },
  slotSelected: { backgroundColor: COLORS.secondary, borderColor: COLORS.secondary },
  slotDisabled: { backgroundColor: '#f8fafc', borderColor: '#e2e8f0', opacity: 0.6 },
  slotText: { fontSize: 11, fontWeight: '700', color: '#1e293b' },
  slotTextSelected: { color: '#fff' },
  slotTextDisabled: { color: '#94a3b8' },
  sessionsLeftText: { fontSize: 8, color: '#64748b', marginTop: 2, fontWeight: '600' },
  sessionsLeftTextSelected: { color: 'rgba(255, 255, 255, 0.8)' },
  fullBadge: { position: 'absolute', top: -5, right: -5, backgroundColor: '#ef4444', paddingHorizontal: 4, borderRadius: 4 },
  fullText: { fontSize: 8, color: '#fff', fontWeight: '800' },
  confirmBtn: { borderRadius: 16, marginTop: 8 },
  confirmBtnContent: { height: 56 },
  confirmBtnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', paddingHorizontal: 16 },
  confirmBtnText: { color: COLORS.white, fontSize: 16, fontWeight: '800', marginLeft: 12 },
  row: { flexDirection: 'row', alignItems: 'center' },
  footerSpacing: { height: 40 },
  // Profile Selector Styling
  profileSelectorContainer: {
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingBottom: 16,
  },
  profileSelectorLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 10,
  },
  profileScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  profileIconContainer: {
    alignItems: 'center',
    marginRight: 16,
    width: 60,
  },
  avatarWrapper: {
    borderRadius: 24,
    padding: 2,
    borderWidth: 2,
    borderColor: 'transparent',
    marginBottom: 4,
  },
  avatarWrapperActive: {
    borderColor: COLORS.secondary,
  },
  profileAvatar: {
    backgroundColor: '#f1f5f9',
  },
  profileAvatarActive: {
    backgroundColor: COLORS.secondary,
  },
  profileAvatarInactive: {
    backgroundColor: '#f1f5f9',
  },
  profileAvatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748b',
  },
  profileNameText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
    marginTop: 2,
    textAlign: 'center',
    width: '100%',
  },
  profileNameTextActive: {
    color: COLORS.secondary,
    fontWeight: '700',
  },
  addProfileButton: {
    alignItems: 'center',
    marginRight: 16,
    width: 60,
  },
  addProfileCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  addProfileText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
    textAlign: 'center',
  },
  selectedProfileCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
    marginTop: 8,
  },
  selectedProfileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  selectedProfileInfo: {
    marginLeft: 12,
    flex: 1,
  },
  selectedProfileName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1e293b',
  },
  selectedProfileSub: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
    marginTop: 2,
  },
  changeProfileBtn: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    alignItems: 'center',
  },
  changeProfileBtnText: {
    fontSize: 12,
    color: COLORS.secondary,
    fontWeight: '700',
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
  },
  checkboxBox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    backgroundColor: '#fff',
  },
  checkboxBoxChecked: {
    backgroundColor: COLORS.secondary,
    borderColor: COLORS.secondary,
  },
  checkboxLabel: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
  // Success screen styles
  successContainer: {
    flex: 1,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  splashCircle: {
    position: 'absolute',
    width: 2000,
    height: 2000,
    borderRadius: 1000,
    backgroundColor: COLORS.secondary,
    top: '50%',
    left: '50%',
    marginLeft: -1000,
    marginTop: -1000,
  },
  successContent: {
    width: '90%',
    alignItems: 'center',
    padding: 24,
  },
  tickCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 6,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 8,
  },
  successSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.85)',
    textAlign: 'center',
    marginBottom: 32,
    fontWeight: '600',
  },
  summaryCard: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    marginBottom: 32,
    elevation: 0,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  summaryLabel: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.85)',
    fontWeight: '600',
  },
  summaryValue: {
    fontSize: 13,
    color: '#ffffff',
    fontWeight: '700',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  directionBtn: {
    width: '100%',
    borderRadius: 14,
    marginBottom: 12,
  },
  doneBtn: {
    width: '100%',
    borderRadius: 14,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    borderWidth: 1.5,
  },
  noProfileSelectedCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#cbd5e1',
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    borderStyle: 'dashed',
  },
  noProfileSelectedText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 4,
  },
  noProfileSelectedSub: {
    fontSize: 11,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: 12,
  },
});

export default BookAppointment;
