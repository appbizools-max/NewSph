import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Image, Dimensions, TextInput, Alert, RefreshControl, Linking, Clipboard, Modal, NativeModules, Platform } from 'react-native';
import { Text, Surface, Avatar, IconButton, Badge, Divider, ActivityIndicator, Button } from 'react-native-paper';
import { COLORS, SIZES } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, doc, orderBy, updateDoc, increment, addDoc, serverTimestamp, getDoc, getDocs, setDoc } from 'firebase/firestore';
import * as LucideIcons from 'lucide-react-native';

const MapPin = LucideIcons.MapPin;
const Bell = LucideIcons.Bell;
const Search = LucideIcons.Search;
const Calendar = LucideIcons.Calendar;
const Stethoscope = LucideIcons.Stethoscope;
const Hospital = LucideIcons.Hospital;
const ChevronRight = LucideIcons.ChevronRight;
const Star = LucideIcons.Star;
const Phone = LucideIcons.Phone;
const HeartPulse = LucideIcons.HeartPulse;
const Brain = LucideIcons.Brain;
const Bone = LucideIcons.Bone;
const Baby = LucideIcons.Baby;
const Activity = LucideIcons.Activity;
const User = LucideIcons.User;
const Play = LucideIcons.Play;
const Info = LucideIcons.Info;
const Clock = LucideIcons.Clock;
const Gift = LucideIcons.Gift;
const Wallet = LucideIcons.Wallet;
const Tag = LucideIcons.Tag;
const X = LucideIcons.X;
const CheckCircle2 = LucideIcons.CheckCircle2 || LucideIcons.CheckCircle || LucideIcons.Check;
const Coins = LucideIcons.Coins;
const Folder = LucideIcons.Folder;
const FolderOpen = LucideIcons.FolderOpen;
const FileVideo = LucideIcons.FileVideo;
const ImageIcon = LucideIcons.Image || LucideIcons.FileImage;
const AlertCircle = LucideIcons.AlertCircle;
import Svg, { Path, Rect, Line, Circle, Defs, LinearGradient, RadialGradient, Stop } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import RazorpayCheckout from 'react-native-razorpay';
import { schedulePaymentRequestNotification, schedulePaymentSuccessNotification, scheduleSplitPaymentSuccessNotification, scheduleSplitPaymentRequestNotification, notifyReceptionistsOfPayment, scheduleDietNotifications, schedulePillReminders } from '../utils/notificationHelper';
import { isPaymentRequestWithin24Hours } from '../utils/paymentHelper';
import { sendCancellationSMS, sendPaymentReceiptSMS } from '../utils/smsHelper';
import { sendCancellationWhatsAppNotification, sendPaymentReceiptWhatsAppNotification } from '../utils/whatsappHelper';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Notifications } from '../utils/notificationHelper';

const APP_ICON_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAARkAAAEZCAIAAAAscsZAAAAACXBIWXMAABJ0AAASdAHeZh94AAAFXGlUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPD94cGFja2V0IGJlZ2luPSfvu78nIGlkPSdXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQnPz4KPHg6eG1wbWV0YSB4bWxuczp4PSdhZG9iZTpuczptZXRhLyc+CjxyZGY6UkRGIHhtbG5zOnJkZj0naHR0cDovL3d3dy53My5vcmcvMTk5OS8wMi8yMi1yZGYtc3ludGF4LW5zIyc+CgogPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9JycKICB4bWxuczpBdHRyaWI9J2h0dHA6Ly9ucy5hdHRyaWJ1dGlvbi5jb20vYWRzLzEuMC8nPgogIDxBdHRyaWI6QWRzPgogICA8cmRmOlNlcT4KICAgIDxyZGY6bGkgcmRmOnBhcnNlVHlwZT0nUmVzb3VyY2UnPgogICAgIDxBdHRyaWI6Q3JlYXRlZD4yMDI2LTA1LTMxPC9BdHRyaWI6Q3JlYXRlZD4KICAgICA8QXR0cmliOkRhdGE+eyZxdW90O2RvYyZxdW90OzomcXVvdDtEQUhGYUk0MkVhcyZxdW90OywmcXVvdDt1c2VyJnF1b3Q7OiZxdW90O1VBRkhvNTkwX0xVJnF1b3Q7LCZxdW90O2JyYW5kJnF1b3Q7OiZxdW90O0plZXZhbiBSZWRkeSZxdW90O308L0F0dHJpYjpEYXRhPgogICAgIDxBdHRyaWI6RXh0SWQ+ZDg4ZDIxNGUtOWFlYi00YWQ0LWI2ZGQtYjVhMTE5YWVkNmUwPC9BdHRyaWI6RXh0SWQ+CiAgICAgPEF0dHJpYjpGYklkPjUyNTI2NTkxNDE3OTU4MDwvQXR0cmliOkZiSWQ+CiAgICAgPEF0dHJpYjpUb3VjaFR5cGU+MjwvQXR0cmliOlRvdWNoVHlwZT4KICAgIDwvcmRmOmxpPgogICA8L3JkZjpTZXE+CiAgPC9BdHRyaWI6QWRzPgogPC9yZGY6RGVzY3JpcHRpb24+CgogPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9JycKICB4bWxuczpkYz0naHR0cDovL3B1cmwub3JnL2RjL2VsZW1lbnRzLzEuMS8nPgogIDxkYzp0aXRsZT4KICAgPHJkZjpBbHQ+CiAgICA8cmRmOmxpIHhtbDpsYW5nPSd4LWRlZmF1bHQnPkxvY2FsTmVlZHMgJmFtcDtKb2JzIC0gMTA8L3JkZjpsaT4KICAgPC9yZGY6QWx0PgogIDwvZGM6dGl0bGU+CiA8L3JkZjpEZXNjcmlwdGlvbj4KCiA8cmRmOkRlc2NyaXB0aW9uIHJkZjphYm91dD0nJwogIHhtbG5zOnBkZj0naHR0cDovL25zLmFkb2JlLmNvbS9wZGYvMS4zLyc+CiAgPHBkZjpBdXRob3I+UHJlZXRoYW0gcmFtIEF2YWxhPC9wZGY6QXV0aG9yPgogPC9yZGY6RGVzY3JpcHRpb24+CgogPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9JycKICB4bWxuczp4bXA9J2h0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC8nPgogIDx4bXA6Q3JlYXRvclRvb2w+Q2FudmEgKFJlbmRlcmVyKSBkb2M9REFIRmFJNDJFYXMgdXNlcj1VQUZIbzU5MF9MVSBicmFuZD1KZWV2YW4gUmVkZHk8L3htcDpDcmVhdG9yVG9vbD4KIDwvcmRmOkRlc2NyaXB0aW9uPgo8L3JkZjpSREY+CjwveDp4bXBtZXRhPgo8P3hwYWNrZXQgZW5kPSdyJz8+WkY3+QAAAE5lWElmTU0AKgAAAAgABAEaAAUAAAABAAAAPgEbAAUAAAABAAAARgEoAAMAAAABAAIAAAITAAMAAAABAAEAAAAAAAAAAAB4AAAAAQAAAHgAAAAByZF2EwAAI0FJREFUeJzt3Xl8FPX9P/DPzOx9Z3dzbO47IYQI4UY5FDxQOby1B62VVq3fb+vXtvpr1fqVeqDWVmtti7RaChUpXhSUinILcsmRkJBArs197ZG9d2dn5vsH/CiFQDKzn83uzr6fD/6APPjMvAN57cx85nMQHMchAEDEyFyXgIBIQJYAwAOyBAAekCUA8IAsAYAHZAkAPCBLAOABWQIAD8gSAHhAlgDAA7IEAB6QJQDwgCwBgAdkCQA8IEsA4AFZAgAPyBIAeECWAMADsgQAHpAlAPCALAGAB2QJADwgSwDgAVkCAA/IEgB4QJYAwAOyBAAekCUA8IAsAYAHZAkAPCBLAOABWQIAD8gSAHhAlgDAA7IEAB6QJQDwgCwBgAdkCQA8IEsA4AFZAgAPyBIAeECWAMADsgQAHpAlAPCALAGAB2QJADwgSwDgAVkCAA/IEgB4QJYAwAOyBAAekCUA8IAsAYAHZAkAPCBLAOABWQIAD8gSAHhAlgDAA7IEAB6QJQDwgCwBgAdkCQA8IEsA4AFZAgAPyBIAeECWAMADsgQAHpAlAPCALAGAB2QJADwgSwDgAVkCAA/IEgB4QJYAwAOyBAAekCUA8IAsAYAHZAkAPCBLAOABWQIAD8gSAHhAlgDAA7IEAB6QJQDwgCwBgAdkCQA8IEsA4AFZAgAPyBIAeECWAMADsgQAHpAlAPCALAGAB2QJADwgSwDgAVkCAA/IEgB4QJYAwAOyBAAekCUA8IAsAYAHZAkAPCBLAOABWQIAj/8Dby64yJO0J5oAAAAASUVORK5CYII=';

// Custom SVG Icons to avoid undefined brand icons in lucide-react-native
const YoutubeIcon = ({ size = 24, color, fill = 'none', style }) => {
  if (color && color !== '#ff0000') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}>
        <Path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" />
        <Path d="m10 15 5-3-5-3Z" fill={color} stroke={color} />
      </Svg>
    );
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style}>
      <Path
        d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17"
        fill="#ff0000"
      />
      <Path d="m10 15 5-3-5-3Z" fill="#ffffff" />
    </Svg>
  );
};

const InstagramIcon = ({ size = 24, color, style }) => {
  if (color) {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}>
        <Rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
        <Path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
        <Line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
      </Svg>
    );
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style}>
      <Defs>
        <RadialGradient id="igGrad" cx="30%" cy="107%" r="130%">
          <Stop offset="0%" stopColor="#fdf497" />
          <Stop offset="5%" stopColor="#fdf497" />
          <Stop offset="45%" stopColor="#fd5949" />
          <Stop offset="60%" stopColor="#d6249f" />
          <Stop offset="90%" stopColor="#285AEB" />
        </RadialGradient>
      </Defs>
      <Rect x="2" y="2" width="20" height="20" rx="5" ry="5" fill="url(#igGrad)" />
      <Path d="M12 7.002c-2.762 0-5 2.239-5 5s2.238 5 5 5 5-2.239 5-5-2.238-5-5-5zm0 8.333c-1.84 0-3.333-1.493-3.333-3.333 0-1.84 1.493-3.333 3.333-3.333 1.84 0 3.333 1.493 3.333 3.333 0 1.84-1.493 3.333-3.333 3.333z" fill="#ffffff" />
      <Path d="M16.8 5c1.215 0 2.2.985 2.2 2.2v9.6c0 1.215-.985 2.2-2.2 2.2H7.2C5.985 19 5 18.015 5 16.8V7.2C5 5.985 5.985 5 7.2 5h9.6m0-2H7.2C4.88 3 3 4.88 3 7.2v9.6C3 19.12 4.88 21 7.2 21h9.6c2.32 0 4.2-1.88 4.2-4.2V7.2C21 4.88 19.12 3 16.8 3z" fill="#ffffff" />
      <Circle cx="16.75" cy="7.25" r="1.2" fill="#ffffff" />
    </Svg>
  );
};

console.log("DEBUG ICONS:", { Youtube: YoutubeIcon, Instagram: InstagramIcon, Play, Info });
const INITIAL_BRANCHES = [
  {
    id: 'kphb',
    name: 'Kphb',
    specialty: 'Spiritual Homeopathy',
    timings: 'Open • Closes 8:00 PM',
    address: 'Kphb, Hyderabad',
    image: 'https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&w=600&q=80',
    location: 'Kphb, Hyderabad',
  },
  {
    id: 'nallagandla',
    name: 'Nallagandla',
    specialty: 'Spiritual Homeopathy',
    timings: 'Open • Closes 8:00 PM',
    address: 'Nallagandla, Hyderabad',
    image: 'https://images.unsplash.com/photo-1586773860418-d372a67de556?auto=format&fit=crop&w=600&q=80',
    location: 'Nallagandla, Hyderabad',
  },
  {
    id: 'dilshuknagar',
    name: 'Dilshuknagar',
    specialty: 'Spiritual Homeopathy',
    timings: 'Open • Closes 8:00 PM',
    address: 'Dilshuknagar, Hyderabad',
    image: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=600&q=80',
    location: 'Dilshuknagar, Hyderabad',
  },
  {
    id: 'chandanagar',
    name: 'Chandanagar',
    specialty: 'Spiritual Homeopathy',
    timings: 'Open • Closes 8:00 PM',
    address: 'Chandanagar, Hyderabad',
    image: 'https://images.unsplash.com/photo-1512678080530-7760d81faba6?auto=format&fit=crop&w=600&q=80',
    location: 'Chandanagar, Hyderabad',
  }
];

const { width } = Dimensions.get('window');

const HomeScreen = ({ navigation }) => {
  const { user, userData } = useAuth();
  const [upcomingAppo, setUpcomingAppo] = useState(null);
  const [upcomingAppos, setUpcomingAppos] = useState([]);
  const [patientFollowUps, setPatientFollowUps] = useState([]);
  const [selectedAppo, setSelectedAppo] = useState(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelConfirmed, setCancelConfirmed] = useState(false);
  const [appoLoading, setAppoLoading] = useState(true);
  const [homeBanner, setHomeBanner] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [activeBannerIndex, setActiveBannerIndex] = useState(0);
  const bannerScrollRef = useRef(null);
  const [rewardPoints, setRewardPoints] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [homeBranches, setHomeBranches] = useState(INITIAL_BRANCHES);

  useEffect(() => {
    const unsubBranches = onSnapshot(collection(db, 'branches'), (snap) => {
      const dbDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      const updated = INITIAL_BRANCHES.map(initBranch => {
        const matching = dbDocs.filter(d => {
          const dId = (d.id || '').toLowerCase();
          const dName = (d.name || d.branchName || d.username || '').toLowerCase();
          return dId === initBranch.id || dName.includes(initBranch.id) || initBranch.id.includes(dId);
        });

        const matched = matching.find(d => !!(d.imageUrl || d.image)) || matching[0];

        if (matched) {
          const branchCopy = { ...initBranch };
          if (matched.timings) branchCopy.timings = matched.timings;
          if (matched.address) branchCopy.address = matched.address;
          if (matched.landmark) branchCopy.landmark = matched.landmark;
          if (matched.phone) {
            branchCopy.phones = [matched.phone];
            branchCopy.formattedPhones = [matched.phone];
          }
          const imgUrl = matched.imageUrl || matched.image;
          if (imgUrl && typeof imgUrl === 'string' && imgUrl.length > 10 && !imgUrl.toLowerCase().includes('no image')) {
            branchCopy.image = imgUrl.trim();
          }
          return branchCopy;
        }
        return initBranch;
      });
      setHomeBranches(updated);
    }, (error) => {
      console.error("Error in real-time branch listener in HomeScreen:", error);
    });

    return () => unsubBranches();
  }, []);
  const normalizeBranchName = (name) => {
    if (!name) return '';
    const str = name.toLowerCase().replace(/\s*branch\s*/i, '').replace(/[^a-z0-9]/g, '').trim();
    if (str.includes('kphb')) return 'kphb';
    if (str.includes('chnr') || str.includes('chandanagar') || str.includes('chandnagar')) return 'chandanagar';
    if (str.includes('dsnr') || str.includes('dilsukhnagar') || str.includes('dilshuknagar')) return 'dilshuknagar';
    if (str.includes('nallagandla')) return 'nallagandla';
    return str;
  };

  const handleCancelAppointment = async (appt) => {
    try {
      setAppoLoading(true);

      const collectionName = 'allpatients';

      // 1. Update the appointment status to 'cancelled' in Firestore
      await updateDoc(doc(db, collectionName, appt.id), {
        status: 'cancelled',
        updatedAt: serverTimestamp()
      });

      // 2. Notify receptionists of that branch
      try {
        const qRec = query(collection(db, 'users'), where('role', '==', 'receptionist'));
        const snapRec = await getDocs(qRec);
        const targetBranchNorm = normalizeBranchName(appt.branchName);
        const patientName = appt.patientName || appt.fullName || userData?.fullName || 'Patient';

        // Parse date for formatted notification display
        const dateObj = new Date(appt.date);
        const formattedDateStr = isNaN(dateObj.getTime())
          ? appt.date || ''
          : dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

        snapRec.forEach(async (docSnap) => {
          const receptionist = docSnap.data();
          const repBranchIdNorm = normalizeBranchName(receptionist.branchId);
          const repBranchNameNorm = normalizeBranchName(receptionist.branchName);

          if (repBranchIdNorm === targetBranchNorm || repBranchNameNorm === targetBranchNorm) {
            await addDoc(collection(db, 'notifications'), {
              userId: receptionist.uid || docSnap.id,
              title: '❌ Appointment Cancelled',
              body: `${patientName} cancelled their appointment for ${formattedDateStr} at ${appt.timeSlot}.`,
              type: 'booking_cancelled_alert',
              isRead: false,
              createdAt: serverTimestamp(),
              metadata: {
                appointmentId: appt.id,
                patientName,
                date: formattedDateStr,
                timeSlot: appt.timeSlot,
                branchName: appt.branchName
              }
            });
          }
        });
      } catch (notifRecErr) {
        console.warn("Error notifying receptionists of booking cancellation:", notifRecErr);
      }

      // 3. Send SMS and WhatsApp cancellation to patient
      try {
        const patientPhone = (appt.phone || userData?.phone || user?.phoneNumber || '').replace(/\D/g, '').slice(-10);
        const pName = appt.patientName || appt.fullName || userData?.fullName || 'Patient';
        const docName = appt.doctorName || 'Doctor';
        const dateObj = new Date(appt.date);
        const formattedDateStr = isNaN(dateObj.getTime())
          ? (appt.appointmentDate || appt.date || '')
          : dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        const timeSlotStr = appt.timeSlot || appt.time || '';
        const branchStr = appt.branchName || 'KPHB';

        if (patientPhone) {
          sendCancellationSMS(
            patientPhone,
            pName,
            docName,
            formattedDateStr,
            timeSlotStr,
            branchStr
          );
          sendCancellationWhatsAppNotification({
            patientName: pName,
            phone: patientPhone,
            date: formattedDateStr,
            time: timeSlotStr,
            doctorName: docName,
            branch: branchStr
          });
        }
      } catch (smsCancelErr) {
        console.warn("Error sending cancellation SMS/WhatsApp:", smsCancelErr);
      }

      Alert.alert("Success", "Appointment cancelled successfully.");
      setSelectedAppo(null);
    } catch (err) {
      console.error("Error cancelling appointment:", err);
      Alert.alert("Error", "Could not cancel appointment. Please try again.");
    } finally {
      setAppoLoading(false);
    }
  };

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = onSnapshot(doc(db, 'patients', user.uid), async (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setRewardPoints(data.rewardPoints || 0);

        // Self-healing: if name is 'Patient' or phone is missing, update details from auth/existing lookup
        const cleanAuthPhone = (user.phoneNumber || '').replace(/\D/g, '').slice(-10);
        if ((data.fullName === 'Patient' || !data.phone) && cleanAuthPhone) {
          try {
            const q = query(collection(db, 'patients'), where('phone', '==', cleanAuthPhone));
            const querySnapshot = await getDocs(q);

            let realName = '';
            let realEmail = '';
            let realLocation = '';
            let realBranchName = '';
            let realBranchId = '';

            querySnapshot.forEach(d => {
              const dData = d.data();
              if (d.id !== user.uid && dData.fullName && dData.fullName !== 'Patient') {
                realName = dData.fullName;
                realEmail = dData.email;
                realLocation = dData.location;
                realBranchName = dData.branchName;
                realBranchId = dData.branchId;
              }
            });

            await updateDoc(doc(db, 'patients', user.uid), {
              fullName: realName || user.displayName || 'Patient',
              phone: cleanAuthPhone,
              email: realEmail || user.email || data.email || '',
              location: realLocation || data.location || '',
              branchId: realBranchId || data.branchId || null,
              branchName: realBranchName || data.branchName || 'Unknown'
            });
          } catch (err) {
            console.warn("Self-healing profile sync failed:", err);
          }
        }
      }
    });
    return () => unsub();
  }, [user]);

  const isNotifFirstLoad = useRef(true);
  useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', user.uid),
      where('isRead', '==', false)
    );
    const unsub = onSnapshot(q, (snapshot) => {
      setUnreadNotifications(snapshot.size);

      // On first load, we don't trigger push alerts for older unread messages
      if (isNotifFirstLoad.current) {
        isNotifFirstLoad.current = false;
        return;
      }

      // Check document changes to find newly added unread notifications
      snapshot.docChanges().forEach(async (change) => {
        if (change.type === 'added') {
          const newNotif = change.doc.data();
          try {
            await Notifications.scheduleNotificationAsync({
              content: {
                title: newNotif.title || 'Spiritual Homeopathy Clinic 🏥',
                body: newNotif.body || '',
                sound: true,
                priority: 'max',
                data: { type: newNotif.type || 'general' },
                ...(Platform.OS === 'android' ? { channelId: 'booking_v2' } : {}),
              },
              trigger: { seconds: 1 },
            });
          } catch (notifErr) {
            console.warn("Could not trigger local push alert:", notifErr);
          }
        }
      });
    }, (error) => {
      console.warn("Error listening to unread notifications:", error);
    });
    return () => unsub();
  }, [user]);

  // Global Background Diet Plan Notifications
  useEffect(() => {
    if (!user?.uid) return;
    const qNutri = query(
      collection(db, 'nutrition_plans'),
      where('patientId', '==', user.uid)
    );
    const unsub = onSnapshot(qNutri, (snap) => {
      if (!snap.empty) {
        let allFound = [];
        snap.forEach(ds => allFound.push({ id: ds.id, ...ds.data() }));
        allFound.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        const latestPlan = allFound[0];
        if (latestPlan && (latestPlan.paymentStatus === 'paid' || latestPlan.status === 'active' || latestPlan.status === 'prescribed' || !latestPlan.paymentStatus)) {
          scheduleDietNotifications(latestPlan);
        }
      }
    });
    return () => unsub();
  }, [user?.uid]);

  // Global Background Medication Pill Reminders (12:00 PM & 5:00 PM daily until followUpDate)
  useEffect(() => {
    if (!user?.uid) return;
    const unsubPat = onSnapshot(doc(db, 'patients', user.uid), (docSnap) => {
      if (docSnap.exists()) {
        const pData = docSnap.data();
        const fUp = pData.followUpDate || pData.medicationDurationEnd;
        if (fUp) {
          schedulePillReminders(fUp);
        }
      }
    });

    const unsubAll = onSnapshot(doc(db, 'allpatients', user.uid), (docSnap) => {
      if (docSnap.exists()) {
        const pData = docSnap.data();
        const fUp = pData.followUpDate || pData.medicationDurationEnd;
        if (fUp) {
          schedulePillReminders(fUp);
        }
      }
    });

    return () => {
      unsubPat();
      unsubAll();
    };
  }, [user?.uid]);

  // Video Section States
  const [videos, setVideos] = useState([]);
  const [videosLoading, setVideosLoading] = useState(true);
  const [activeVideoTab, setActiveVideoTab] = useState('public'); // 'public' | 'shared'
  const [sharedFolders, setSharedFolders] = useState([]);
  const [sharedItems, setSharedItems] = useState([]);
  const [allMediaItems, setAllMediaItems] = useState([]);
  const [sharedLoading, setSharedLoading] = useState(true);
  const [expandedFolder, setExpandedFolder] = useState(null);
  const [folderItemsMap, setFolderItemsMap] = useState({});
  const [folderItemsLoading, setFolderItemsLoading] = useState({});

  // Payment Requested States
  const [payModalVisible, setPayModalVisible] = useState(false);
  const [apptForPayment, setApptForPayment] = useState(null);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [paymentSuccessData, setPaymentSuccessData] = useState(null);
  const [activePaymentRequest, setActivePaymentRequest] = useState(null);

  const notifiedRequests = useRef(new Set());

  const generateReceiptHtml = (appt, payData) => {
    const isSplit = appt.paymentMethod === 'split';
    const splitCounterMethod = appt.splitCounterMethod || 'cash';
    const splitCounterAmount = Number(appt.splitCounterAmount) || 0;
    const requestedAmount = Number(appt.requestedAmount) || Number(payData?.amount) || 600;
    const totalAmount = isSplit ? (requestedAmount + splitCounterAmount) : requestedAmount;

    let paymentBreakdownRows = '';
    if (isSplit) {
      paymentBreakdownRows = `
        <tr>
          <td style="padding:10px; border-bottom:1px solid #e2e8f0; font-size:13px; color:#475569; font-weight:bold;">Counter Collection (${splitCounterMethod.toUpperCase()})</td>
          <td style="padding:10px; border-bottom:1px solid #e2e8f0; font-size:13px; color:#1e293b; text-align:right; font-weight:700;">₹${splitCounterAmount.toFixed(2)}</td>
        </tr>
        <tr>
          <td style="padding:10px; border-bottom:1px solid #e2e8f0; font-size:13px; color:#475569; font-weight:bold;">App Payment (UPI)</td>
          <td style="padding:10px; border-bottom:1px solid #e2e8f0; font-size:13px; color:#1e293b; text-align:right; font-weight:700;">₹${requestedAmount.toFixed(2)}</td>
        </tr>
      `;
    } else {
      paymentBreakdownRows = `
        <tr>
          <td style="padding:10px; border-bottom:1px solid #e2e8f0; font-size:13px; color:#475569; font-weight:bold;">Online Payment (UPI/Card)</td>
          <td style="padding:10px; border-bottom:1px solid #e2e8f0; font-size:13px; color:#1e293b; text-align:right; font-weight:700;">₹${totalAmount.toFixed(2)}</td>
        </tr>
      `;
    }
    const patientName = userData?.fullName || appt.patientName || appt.fullName || 'Patient';
    const cleanPhone = (userData?.phone || appt.phone || appt.patientPhone || '').replace(/\D/g, '').slice(-10);
    const transactionId = payData?.paymentId || appt.paymentId || 'TXN_MOCK_' + Math.random().toString(36).substring(2, 10).toUpperCase();
    const paidAt = appt.paymentCollectedAt ? new Date(appt.paymentCollectedAt).toLocaleString('en-GB') : new Date().toLocaleString('en-GB');

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: Arial, sans-serif; background:#fff; padding: 20px; }
    .receipt-container {
      width:520px;
      margin:0 auto;
      border:2px solid #298FCA;
      border-radius:12px;
      padding: 24px;
      position: relative;
    }
    .header {
      display:flex;
      justify-content:space-between;
      align-items:center;
      border-bottom:3px solid #298FCA;
      padding-bottom:14px;
    }
    .clinic-logo-text { font-size:24px; font-weight:900; color:#298FCA; letter-spacing:1px; }
    .clinic-tagline { font-size:9px; color:#64748b; margin-top:2px; letter-spacing:1px; font-weight:700; }
    .receipt-title {
      text-align:center;
      font-size:18px;
      font-weight:900;
      color:#1e293b;
      letter-spacing:2px;
      margin: 15px 0;
      text-transform: uppercase;
    }
    .meta-section {
      display: flex;
      justify-content: space-between;
      margin-bottom: 20px;
      background: #f8fafc;
      padding: 12px;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
    }
    .meta-col { flex: 1; }
    .meta-label { font-size: 10px; color: #64748b; text-transform: uppercase; font-weight: 800; }
    .meta-value { font-size: 12px; color: #1e293b; font-weight: 700; margin-top: 2px; }
    .details-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 25px;
    }
    .details-table th {
      background: #298FCA;
      color: #fff;
      text-align: left;
      padding: 10px;
      font-size: 12px;
      font-weight: 800;
      text-transform: uppercase;
    }
    .details-table td {
      padding: 12px 10px;
      border-bottom: 1px solid #e2e8f0;
      font-size: 13px;
    }
    .amount-box {
      background: #f0fdf4;
      border: 1.5px dashed #22c55e;
      border-radius: 8px;
      padding: 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 25px;
    }
    .amount-title { font-size: 14px; font-weight: 800; color: #166534; }
    .amount-val { font-size: 18px; font-weight: 900; color: #166534; }
    .paid-stamp {
      border: 3px solid #22c55e;
      color: #22c55e;
      font-size: 14px;
      font-weight: 900;
      padding: 4px 10px;
      border-radius: 4px;
      text-transform: uppercase;
      transform: rotate(-5deg);
      display: inline-block;
    }
    .footer {
      border-top: 2px solid #e2e8f0;
      padding-top: 15px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .footer-left { font-size: 10px; color: #64748b; line-height: 1.5; }
    .footer-right { text-align: right; font-size: 10px; color: #64748b; line-height: 1.5; }
    .branch-highlight { color: #298FCA; font-weight: 800; }
  </style>
</head>
<body>
  <div class="receipt-container">
    <div class="header">
      <div style="display: flex; align-items: center; gap: 12px;">
        <img src="data:image/png;base64,${APP_ICON_BASE64}" style="height: 50px; width: auto; border-radius: 6px;" />
        <div class="clinic-logo-text" style="font-size: 20px;">SPIRITUAL HOMEOPATHY</div>
      </div>
      <div style="text-align: right;">
        <div class="clinic-tagline">WWW.SPIRITUALHOMEO.COM</div>
      </div>
    </div>
    <div class="receipt-title">Payment Receipt</div>
    
    <div class="meta-section">
      <div class="meta-col">
        <div class="meta-label">Patient Name</div>
        <div class="meta-value">${patientName}</div>
        <div style="font-size: 11px; color:#475569; margin-top: 2px;">+91 ${cleanPhone}</div>
      </div>
      <div class="meta-col" style="text-align: right;">
        <div class="meta-label">Receipt Date</div>
        <div class="meta-value">${new Date().toLocaleDateString('en-GB')}</div>
        <div style="font-size: 11px; color:#475569; margin-top: 2px;">TXN: ${transactionId}</div>
      </div>
    </div>
    <table class="details-table">
      <thead>
        <tr>
          <th>Consultation Details</th>
          <th style="text-align: right;">Information</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="font-weight: 700; color: #1e293b;">Doctor Name</td>
          <td style="text-align: right; color: #475569;">Dr. ${appt.doctorName}</td>
        </tr>
        <tr>
          <td style="font-weight: 700; color: #1e293b;">Diseases</td>
          <td style="text-align: right; color: #475569;">${appt.specialty || 'General Homeopathy'}</td>
        </tr>
        <tr>
          <td style="font-weight: 700; color: #1e293b;">Appointment Schedule</td>
          <td style="text-align: right; color: #475569;">${appt.formattedDate || appt.date || ''} at ${appt.timeSlot}</td>
        </tr>
        <tr>
          <td style="font-weight: 700; color: #1e293b;">Payment Method</td>
          <td style="text-align: right; color: #475569; text-transform: uppercase;">${appt.paymentMethod || 'online'}</td>
        </tr>
        ${paymentBreakdownRows}
        <tr>
          <td style="font-weight: 700; color: #1e293b;">Transaction Timestamp</td>
          <td style="text-align: right; color: #475569;">${paidAt}</td>
        </tr>
      </tbody>
    </table>
    <div class="amount-box">
      <div>
        <div class="paid-stamp">PAID ✓</div>
      </div>
      <div style="text-align: right;">
        <div class="amount-title">Total Amount Paid</div>
        <div class="amount-val">₹${totalAmount.toFixed(2)}</div>
      </div>
    </div>

    <div class="footer">
      <div class="footer-left">
        <div>☎ <span style="font-weight: 800; color: #1e293b;">9030 176 176</span></div>
        <div>✉ support@spiritualhomeo.com</div>
      </div>
      <div class="footer-right">
        <div>Branch: <span class="branch-highlight">${appt.branchName || 'KPHB'}</span></div>
        <div>www.spiritualhomeo.com</div>
      </div>
    </div>
  </div>
</body>
</html>
    `;
  };

  const handleShareInvoicePDF = async (appt, payData) => {
    try {
      const html = generateReceiptHtml(appt, payData);
      const { uri } = await Print.printToFileAsync({ html, base64: false });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: `Consultation Receipt – ${userData?.fullName || appt.patientName || 'Patient'}`,
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert('Saved', `Receipt PDF saved to: ${uri}`);
      }
    } catch (err) {
      console.error('Invoice generation error:', err);
      const errMsg = err?.message || String(err);
      if (
        errMsg.toLowerCase().includes('cancel') ||
        errMsg.toLowerCase().includes('reject') ||
        errMsg.toLowerCase().includes('dismiss') ||
        errMsg.toLowerCase().includes('processing')
      ) {
        return;
      }
      Alert.alert('PDF Error', 'Failed to generate and share payment receipt PDF.');
    }
  };

  const handleOpenAppPaySheet = (appt) => {
    setApptForPayment(appt);
    setPaymentSuccessData(null);
    setPayModalVisible(true);
  };

  const handleSimulatePaymentSuccess = async (appt) => {
    setProcessingPayment(true);
    try {
      const apptId = appt.id;
      const requestedAmount = Number(appt.requestedAmount) || 600;
      const paymentId = 'pay_MOCK' + Math.random().toString(36).substring(2, 12).toUpperCase();
      const isSplit = appt.paymentMethod === 'split';
      const splitCounterMethod = appt.splitCounterMethod || 'cash';
      const splitCounterAmount = Number(appt.splitCounterAmount) || 0;
      const totalPaidAmount = isSplit ? (requestedAmount + splitCounterAmount) : requestedAmount;

      // Calculate reward points (2 points per ₹100)
      const pointsEarned = Math.floor(totalPaidAmount / 100) * 2;
      const randomHex = Math.random().toString(36).substring(2, 8).toUpperCase();
      const generatedCouponCode = `SPH-${randomHex}`;

      // 1. Update Firestore appointment payment status + clear payment request
      const collectionName = 'allpatients';
      const docRef = doc(db, collectionName, apptId);

      const updatePayload = {
        paymentStatus: 'paid',
        amountPaid: totalPaidAmount,
        paymentMethod: isSplit ? 'split' : 'online',
        paymentCollectedAt: new Date().toISOString(),
        paymentId: paymentId,
        paymentRequested: false, // Clear banner after payment
        paymentRequestedAt: null,
        status: 'done',
        ...(isSplit ? {
          paymentSplitDetails: {
            [splitCounterMethod]: splitCounterAmount,
            'upi': requestedAmount
          }
        } : {})
      };
      await updateDoc(docRef, updatePayload);

      // Trigger local notification confirming success
      try {
        if (isSplit) {
          await scheduleSplitPaymentSuccessNotification(appt.doctorName, totalPaidAmount, splitCounterAmount, splitCounterMethod, requestedAmount);
        } else {
          await schedulePaymentSuccessNotification(appt.doctorName, requestedAmount);
        }
      } catch (notifErr) {
        console.warn("Error scheduling payment success notification:", notifErr);
      }

      // Notify receptionists of that branch about the payment
      try {
        const patientName = userData?.fullName || appt.patientName || 'Patient';
        await notifyReceptionistsOfPayment(
          db,
          appt.branchName || 'Clinic Branch',
          patientName,
          totalPaidAmount,
          appt.doctorName || 'General Doctor',
          apptId
        );
      } catch (err) {
        console.error("Error triggering receptionist payment notification:", err);
      }

      // 2. Log transaction in Firestore (alltransactions collection only)
      await addDoc(collection(db, 'alltransactions'), {
        type: 'consultation',
        patientId: user.uid,
        patientName: userData?.fullName || appt.patientName || 'Patient',
        amount: requestedAmount,
        method: 'online_razorpay',
        paymentId: paymentId,
        appointmentId: apptId,
        doctor: appt.doctorName || 'General Doctor',
        branchId: appt.branchId || '',
        branchName: appt.branchName || 'Clinic Branch',
        recordedBy: 'Patient App (Simulated)',
        itemsPaid: {
          consultation: requestedAmount,
          medicine: 0
        },
        timestamp: serverTimestamp()
      });

      // 3. Sync completed consultation fee paid visit to global patients collection for Admin Web revenue reports
      try {
        const cleanPhone = (appt.phone || userData?.phone || user.phoneNumber || '').replace(/\D/g, '').slice(-10);
        const apptDate = appt.appointmentDate || (appt.date ? new Date(appt.date).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB'));

        await addDoc(collection(db, 'allpatients'), {
          fullName: userData?.fullName || appt.patientName || 'Online Patient',
          phone: cleanPhone,
          email: user.email || userData?.email || appt.email || '',
          registrationId: appt.regId || 'ONLINE',
          doctor: appt.doctorName || 'General Doctor',
          subject: appt.specialty || appt.subject || 'Online Appointment Consultation',
          appointmentDate: apptDate,
          paymentStatus: 'paid',
          paymentAmount: totalPaidAmount,
          paymentMethod: isSplit ? 'split' : 'online',
          paymentCollectedAt: new Date().toISOString(),
          branchId: appt.branchId || 'Unknown',
          branchName: appt.branchName || 'Unknown',
          source: 'UserApp',
          bookingSource: 'Patient App',
          isAppBooking: true,
          _type: 'online',
          status: 'done',
          createdAt: new Date().toISOString(),
          ...(isSplit ? {
            paymentSplitDetails: {
              [splitCounterMethod]: splitCounterAmount,
              'upi': requestedAmount
            }
          } : {})
        });
      } catch (syncErr) {
        console.error("Error syncing paid visit to patients collection:", syncErr);
      }

      // 4. Send permanent receipt notification to patient
      try {
        const splitMsgBody = isSplit
          ? `Your consultation payment of ₹${totalPaidAmount} is complete: Paid ₹${splitCounterAmount} via ${splitCounterMethod.toUpperCase()} at counter and ₹${requestedAmount} via UPI.`
          : `Your consultation fee of ₹${requestedAmount} has been paid successfully via UPI.`;

        await addDoc(collection(db, 'notifications'), {
          userId: user.uid,
          title: '💳 Payment Completed',
          body: splitMsgBody,
          type: 'payment_receipt',
          isRead: false,
          createdAt: serverTimestamp()
        });
      } catch (notifErr) {
        console.error("Error sending permanent payment receipt notification:", notifErr);
      }

      // 4b. Send SMS and WhatsApp payment receipt to patient
      try {
        const cleanPhone = (appt.phone || userData?.phone || user.phoneNumber || '').replace(/\D/g, '').slice(-10);
        const pName = userData?.fullName || appt.patientName || 'Patient';
        const apptDate = appt.appointmentDate || (appt.date ? new Date(appt.date).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB'));
        const branchName = appt.branchName || 'KPHB';

        if (cleanPhone) {
          sendPaymentReceiptSMS(
            cleanPhone,
            pName,
            totalPaidAmount,
            paymentId,
            apptDate,
            branchName
          );
          sendPaymentReceiptWhatsAppNotification({
            patientName: pName,
            phone: cleanPhone,
            receiptNo: paymentId,
            totalPaid: totalPaidAmount,
            branch: branchName
          });
        }
      } catch (receiptMsgErr) {
        console.warn("Error sending SMS/WhatsApp payment receipt:", receiptMsgErr);
      }

      // 5. Award Reward Points
      if (pointsEarned > 0) {
        const userRef = doc(db, 'patients', user.uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
          await setDoc(userRef, {
            fullName: userData?.fullName || appt.patientName || 'Patient',
            phone: userData?.phone || appt.phone || '',
            email: user.email || '',
            rewardPoints: pointsEarned,
            createdAt: new Date().toISOString()
          });
        } else {
          await updateDoc(userRef, {
            rewardPoints: increment(pointsEarned)
          });
        }

        await addDoc(collection(db, 'reward_points_transactions'), {
          userId: user.uid,
          patientName: userData?.fullName || appt.patientName || 'Patient',
          type: 'earn',
          points: pointsEarned,
          description: `Earned ${pointsEarned} points for paying consultation fee for Dr. ${appt.doctorName}`,
          createdAt: serverTimestamp()
        });

        const expiryDate = new Date();
        expiryDate.setMonth(expiryDate.getMonth() + 3);
        const expiryDateStr = expiryDate.toISOString().split('T')[0];

        await addDoc(collection(db, 'coupons'), {
          code: generatedCouponCode,
          userId: user.uid,
          patientName: userData?.fullName || appt.patientName || 'Patient',
          patientPhone: userData?.phone || appt.phone || '',
          pointsValue: pointsEarned,
          discountAmount: pointsEarned,
          status: 'active',
          createdAt: serverTimestamp(),
          expiryDate: expiryDate,
          expiryDateStr: expiryDateStr
        });
      }

      // Update local state immediately so banner disappears
      // Update local state immediately so banner disappears
      setUpcomingAppo(prev => prev && prev.id === apptId ? { ...prev, paymentStatus: 'paid', paymentRequested: false, status: 'Completed' } : prev);

      // Show success screen in modal
      setPaymentSuccessData({
        couponCode: generatedCouponCode,
        points: pointsEarned,
        amount: totalPaidAmount
      });
      setProcessingPayment(false);
    } catch (e) {
      console.error('Error simulating payment completion:', e);
      Alert.alert('Simulation Error', 'Failed to complete mock payment. Please try again.');
      setProcessingPayment(false);
    }
  };

  const handleCompleteAppPayment = async () => {
    if (!apptForPayment) return;
    if (!NativeModules.RNRazorpayCheckout) {
      Alert.alert(
        'Sandbox Payment Fallback',
        'The native Razorpay module is missing (common in Expo Go). Would you like to simulate a successful payment for testing?',
        [
          { text: 'Cancel', onPress: () => setProcessingPayment(false), style: 'cancel' },
          { text: 'Simulate Payment', onPress: () => handleSimulatePaymentSuccess(apptForPayment) }
        ]
      );
      return;
    }
    setProcessingPayment(true);
    try {
      const apptId = apptForPayment.id;
      const requestedAmount = Number(apptForPayment.requestedAmount) || 600;

      const options = {
        description: `Consultation Fee - Dr. ${apptForPayment.doctorName}`,
        image: 'https://i.imgur.com/3g7A6tw.png',
        currency: 'INR',
        key: 'rzp_live_ThkaAZmhaOaMtn',
        amount: requestedAmount * 100, // in paise
        name: 'Spiritual Homeopathy Clinic',
        prefill: {
          email: user?.email || '',
          contact: userData?.phone || '',
          name: userData?.fullName || 'Patient'
        },
        theme: { color: '#0ea5e9' }
      };

      RazorpayCheckout.open(options).then(async (data) => {
        const paymentId = data.razorpay_payment_id;
        const isSplit = apptForPayment.paymentMethod === 'split';
        const splitCounterMethod = apptForPayment.splitCounterMethod || 'cash';
        const splitCounterAmount = Number(apptForPayment.splitCounterAmount) || 0;
        const totalPaidAmount = isSplit ? (requestedAmount + splitCounterAmount) : requestedAmount;

        // Calculate reward points (2 points per ₹100)
        const pointsEarned = Math.floor(totalPaidAmount / 100) * 2;
        const randomHex = Math.random().toString(36).substring(2, 8).toUpperCase();
        const generatedCouponCode = `SPH-${randomHex}`;

        // 1. Update Firestore appointment payment status + clear payment request
        const collectionName = 'allpatients';
        const docRef = doc(db, collectionName, apptId);

        const updatePayload = {
          paymentStatus: 'paid',
          amountPaid: totalPaidAmount,
          paymentMethod: isSplit ? 'split' : 'online',
          paymentCollectedAt: new Date().toISOString(),
          paymentId: paymentId,
          paymentRequested: false, // Clear banner after payment
          paymentRequestedAt: null,
          status: 'done',
          ...(isSplit ? {
            paymentSplitDetails: {
              [splitCounterMethod]: splitCounterAmount,
              'upi': requestedAmount
            }
          } : {})
        };
        await updateDoc(docRef, updatePayload);

        // Trigger local notification confirming success
        try {
          if (isSplit) {
            await scheduleSplitPaymentSuccessNotification(apptForPayment.doctorName, totalPaidAmount, splitCounterAmount, splitCounterMethod, requestedAmount);
          } else {
            await schedulePaymentSuccessNotification(apptForPayment.doctorName, requestedAmount);
          }
        } catch (notifErr) {
          console.warn("Error scheduling payment success notification:", notifErr);
        }

        // Notify receptionists of that branch about the payment
        try {
          const patientName = userData?.fullName || apptForPayment.patientName || 'Patient';
          await notifyReceptionistsOfPayment(
            db,
            apptForPayment.branchName || 'Clinic Branch',
            patientName,
            totalPaidAmount,
            apptForPayment.doctorName || 'General Doctor',
            apptId
          );
        } catch (err) {
          console.error("Error triggering receptionist payment notification:", err);
        }

        // 2. Log transaction in Firestore (alltransactions collection only)
        await addDoc(collection(db, 'alltransactions'), {
          type: 'consultation',
          patientId: user.uid,
          patientName: userData?.fullName || apptForPayment.patientName || 'Patient',
          amount: requestedAmount,
          method: 'online_razorpay',
          paymentId: paymentId,
          appointmentId: apptId,
          doctor: apptForPayment.doctorName || 'General Doctor',
          branchId: apptForPayment.branchId || '',
          branchName: apptForPayment.branchName || 'Clinic Branch',
          recordedBy: 'Patient App',
          itemsPaid: {
            consultation: requestedAmount,
            medicine: 0
          },
          timestamp: serverTimestamp()
        });

        // 3. Sync completed consultation fee paid visit to global patients collection for Admin Web revenue reports
        try {
          const cleanPhone = (apptForPayment.phone || userData?.phone || user.phoneNumber || '').replace(/\D/g, '').slice(-10);
          const apptDate = apptForPayment.appointmentDate || (apptForPayment.date ? new Date(apptForPayment.date).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB'));

          await addDoc(collection(db, 'allpatients'), {
            fullName: userData?.fullName || apptForPayment.patientName || 'Online Patient',
            phone: cleanPhone,
            email: user.email || userData?.email || apptForPayment.email || '',
            registrationId: apptForPayment.regId || 'ONLINE',
            doctor: apptForPayment.doctorName || 'General Doctor',
            subject: apptForPayment.subject || 'Online Appointment Consultation',
            appointmentDate: apptDate,
            paymentStatus: 'paid',
            paymentAmount: totalPaidAmount,
            paymentMethod: isSplit ? 'split' : 'online',
            paymentCollectedAt: new Date().toISOString(),
            branchId: apptForPayment.branchId || 'Unknown',
            branchName: apptForPayment.branchName || 'Unknown',
            source: 'UserApp',
            bookingSource: 'Patient App',
            isAppBooking: true,
            _type: 'online',
            status: 'done',
            createdAt: new Date().toISOString(),
            ...(isSplit ? {
              paymentSplitDetails: {
                [splitCounterMethod]: splitCounterAmount,
                'upi': requestedAmount
              }
            } : {})
          });
        } catch (syncErr) {
          console.error("Error syncing paid visit to patients collection:", syncErr);
        }

        // 4. Send permanent receipt notification to patient
        try {
          const splitMsgBody = isSplit
            ? `Your consultation payment of ₹${totalPaidAmount} is complete: Paid ₹${splitCounterAmount} via ${splitCounterMethod.toUpperCase()} at counter and ₹${requestedAmount} via UPI.`
            : `Your consultation fee of ₹${requestedAmount} has been paid successfully via UPI.`;

          await addDoc(collection(db, 'notifications'), {
            userId: user.uid,
            title: '💳 Payment Completed',
            body: splitMsgBody,
            type: 'payment_receipt',
            isRead: false,
            createdAt: serverTimestamp()
          });
        } catch (notifErr) {
          console.error("Error sending permanent payment receipt notification:", notifErr);
        }

        // 4b. Send SMS and WhatsApp payment receipt to patient
        try {
          const cleanPhone = (apptForPayment.phone || userData?.phone || user.phoneNumber || '').replace(/\D/g, '').slice(-10);
          const pName = userData?.fullName || apptForPayment.patientName || 'Patient';
          const apptDate = apptForPayment.appointmentDate || (apptForPayment.date ? new Date(apptForPayment.date).toLocaleDateString('en-GB') : new Date().toLocaleDateString('en-GB'));
          const branchName = apptForPayment.branchName || 'KPHB';

          if (cleanPhone) {
            sendPaymentReceiptSMS(
              cleanPhone,
              pName,
              totalPaidAmount,
              paymentId,
              apptDate,
              branchName
            );
            sendPaymentReceiptWhatsAppNotification({
              patientName: pName,
              phone: cleanPhone,
              receiptNo: paymentId,
              totalPaid: totalPaidAmount,
              branch: branchName
            });
          }
        } catch (receiptMsgErr) {
          console.warn("Error sending SMS/WhatsApp payment receipt:", receiptMsgErr);
        }

        // 5. Award Reward Points (ONLY patient app payments earn points)
        if (pointsEarned > 0) {
          const userRef = doc(db, 'patients', user.uid);
          const userSnap = await getDoc(userRef);
          if (!userSnap.exists()) {
            await setDoc(userRef, {
              fullName: userData?.fullName || apptForPayment.patientName || 'Patient',
              phone: userData?.phone || apptForPayment.phone || '',
              email: user.email || '',
              rewardPoints: pointsEarned,
              createdAt: new Date().toISOString()
            });
          } else {
            await updateDoc(userRef, {
              rewardPoints: increment(pointsEarned)
            });
          }

          await addDoc(collection(db, 'reward_points_transactions'), {
            userId: user.uid,
            patientName: userData?.fullName || apptForPayment.patientName || 'Patient',
            type: 'earn',
            points: pointsEarned,
            description: `Earned ${pointsEarned} points for paying consultation fee for Dr. ${apptForPayment.doctorName}`,
            createdAt: serverTimestamp()
          });

          const expiryDate = new Date();
          expiryDate.setMonth(expiryDate.getMonth() + 3);
          const expiryDateStr = expiryDate.toISOString().split('T')[0];

          await addDoc(collection(db, 'coupons'), {
            code: generatedCouponCode,
            userId: user.uid,
            patientName: userData?.fullName || apptForPayment.patientName || 'Patient',
            patientPhone: userData?.phone || apptForPayment.phone || '',
            pointsValue: pointsEarned,
            discountAmount: pointsEarned,
            status: 'active',
            createdAt: serverTimestamp(),
            expiryDate: expiryDate,
            expiryDateStr: expiryDateStr
          });
        }

        // Update local state immediately so banner disappears
        // Update local state immediately so banner disappears
        setUpcomingAppo(prev => prev && prev.id === apptId ? { ...prev, paymentStatus: 'paid', paymentRequested: false, status: 'Completed' } : prev);

        // Show success screen in modal
        setPaymentSuccessData({
          couponCode: generatedCouponCode,
          points: pointsEarned,
          amount: totalPaidAmount
        });
        setProcessingPayment(false);
      }).catch((error) => {
        setProcessingPayment(false);
        console.error('Razorpay error:', error);
        if (error.code !== 'payment_cancelled') {
          Alert.alert('Payment Failed', error.description || 'Payment could not be processed. Please try again.');
        }
      });
    } catch (e) {
      console.error('Error initiating payment:', e);
      Alert.alert('Payment Setup Error', 'Failed to initiate payment. Please try again.');
      setProcessingPayment(false);
    }
  };


  // YouTube ID Parser
  const getYoutubeVideoId = (url) => {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const [searchText, setSearchText] = useState('');

  const handleSearchSubmit = () => {
    if (searchText.trim()) {
      navigation.navigate('DoctorsTab', { initialSearch: searchText.trim() });
    } else {
      navigation.navigate('DoctorsTab');
    }
  };

  // Fetch videos
  useEffect(() => {
    const q = query(collection(db, 'videos'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      const list = [];
      snapshot.forEach(doc => {
        list.push({ id: doc.id, ...doc.data() });
      });
      setVideos(list);
      setVideosLoading(false);
    }, (error) => {
      console.error("Error loading videos:", error);
      setVideosLoading(false);
    });

    return () => unsub();
  }, []);

  // Fetch shared media (folders & standalone files)
  useEffect(() => {
    const rawPhone = userData?.phone || user?.phoneNumber || '';
    const cleanPhone = rawPhone.replace(/\D/g, '').slice(-10);
    if (!cleanPhone) {
      setSharedLoading(false);
      return;
    }

    setSharedLoading(true);

    const qShared = query(collection(db, 'shared_media'), where('patientPhone', '==', cleanPhone));
    const qFolders = collection(db, 'media_folders');

    let sharedRecords = [];
    let allFolders = [];

    const fetchStandaloneItems = async (itemIds) => {
      if (!itemIds || itemIds.size === 0) {
        setSharedItems([]);
        return;
      }
      try {
        const fetched = [];
        for (const itemId of itemIds) {
          const docSnap = await getDoc(doc(db, 'media_items', itemId));
          if (docSnap.exists()) {
            fetched.push({ id: docSnap.id, ...docSnap.data() });
          }
        }
        setSharedItems(fetched);
      } catch (err) {
        console.error("Error fetching standalone items:", err);
      }
    };

    const updateCombinedSharedMedia = () => {
      const sharedFolderIds = new Set(
        sharedRecords.filter(r => r.type === 'folder').map(r => r.folderId)
      );

      const visibleFolders = allFolders.filter(folder => {
        if (folder.patientPhone === cleanPhone) return true;
        if (sharedFolderIds.has(folder.id)) return true;
        return false;
      });

      const sharedItemIds = new Set(
        sharedRecords.filter(r => r.type === 'item').map(r => r.itemId)
      );

      setSharedFolders(visibleFolders);
      setSharedLoading(false);

      // Fetch standalone items asynchronously in the background
      fetchStandaloneItems(sharedItemIds);
    };

    const unsubShared = onSnapshot(qShared, (snap) => {
      sharedRecords = [];
      snap.forEach(d => {
        sharedRecords.push({ id: d.id, ...d.data() });
      });
      updateCombinedSharedMedia();
    }, (err) => {
      console.error("Error shared_media snapshot:", err);
      setSharedLoading(false);
    });

    const unsubFolders = onSnapshot(qFolders, (snap) => {
      allFolders = [];
      snap.forEach(d => {
        allFolders.push({ id: d.id, ...d.data() });
      });
      updateCombinedSharedMedia();
    }, (err) => {
      console.error("Error media_folders snapshot:", err);
    });

    return () => {
      unsubShared();
      unsubFolders();
    };
  }, [user, userData]);

  // Lazy load folder items on demand
  const toggleFolder = async (folderId, patientPhone) => {
    const isExpanded = expandedFolder === folderId;
    if (isExpanded) {
      setExpandedFolder(null);
    } else {
      setExpandedFolder(folderId);
      if (!folderItemsMap[folderId]) {
        setFolderItemsLoading(prev => ({ ...prev, [folderId]: true }));
        try {
          const qItems = query(collection(db, 'media_items'), where('folderId', '==', folderId));
          const snap = await getDocs(qItems);
          const list = [];
          snap.forEach(d => {
            const data = d.data();
            if (patientPhone) {
              if (data.sharedWithApp === true) {
                list.push({ id: d.id, ...data });
              }
            } else {
              list.push({ id: d.id, ...data });
            }
          });
          setFolderItemsMap(prev => ({ ...prev, [folderId]: list }));
        } catch (err) {
          console.error("Error loading folder items:", err);
        } finally {
          setFolderItemsLoading(prev => ({ ...prev, [folderId]: false }));
        }
      }
    }
  };

  // Fetch Follow-up Reminders (from both patients and appointments collections)
  useEffect(() => {
    const rawPhone = userData?.phone || user?.phoneNumber || '';
    const cleanPhone = rawPhone.replace(/\D/g, '').slice(-10);
    if (!cleanPhone) return;

    let latestFromPatients = [];
    let latestFromAppointments = [];

    const combineAndSet = () => {
      const seenIds = new Set();
      const combined = [];
      latestFromPatients.forEach(p => { seenIds.add(p.id); combined.push(p); });
      latestFromAppointments.forEach(a => {
        if (!seenIds.has(a.id)) combined.push(a);
      });
      combined.sort((a, b) => new Date(a.followUpDate) - new Date(b.followUpDate));
      setPatientFollowUps(combined);
    };

    const qFollowUpPatients = query(collection(db, 'allpatients'), where('followUpDate', '!=', ''));
    const unsubPatients = onSnapshot(qFollowUpPatients, (snap) => {
      let found = [];
      snap.forEach(d => {
        const p = d.data();
        if (p.followUpInterval === 'No Follow-up') return;
        if (p.phone && String(p.phone).replace(/\D/g, '').slice(-10) === cleanPhone) {
          found.push({ id: d.id, ...p, _source: 'allpatients' });
        }
      });
      latestFromPatients = found;
      combineAndSet();
    });

    const qFollowUpAppts = query(collection(db, 'allpatients'), where('followUpDate', '!=', ''));
    const unsubAppts = onSnapshot(qFollowUpAppts, (snap) => {
      let found = [];
      snap.forEach(d => {
        const a = d.data();
        if (a.followUpInterval === 'No Follow-up') return;
        const aPhone = String(a.phone || a.patientPhone || '').replace(/\D/g, '').slice(-10);
        if (aPhone === cleanPhone) {
          found.push({
            id: d.id,
            ...a,
            _source: 'allpatients',
            fullName: a.fullName || a.patientName || 'Patient',
            doctor: a.doctor || a.doctorName || 'Doctor',
          });
        }
      });
      latestFromAppointments = found;
      combineAndSet();
    });

    return () => { unsubPatients(); unsubAppts(); };
  }, [user, userData]);

  const banners = [];
  if (homeBanner) {
    banners.push({ type: 'dynamic', uri: homeBanner });
  }
  banners.push({ type: 'local', source: require('../../assets/Blue And White Modern Professional Doctor Banner.png') });

  useEffect(() => {
    if (banners.length <= 1) return;

    const interval = setInterval(() => {
      const nextIndex = (activeBannerIndex + 1) % banners.length;
      setActiveBannerIndex(nextIndex);
      if (bannerScrollRef.current) {
        bannerScrollRef.current.scrollTo({
          x: nextIndex * width,
          animated: true
        });
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [activeBannerIndex, banners.length]);

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
    }, 1000);
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'banners', 'home'), (snap) => {
      if (snap.exists()) {
        setHomeBanner(snap.data().imageUrl);
      } else {
        setHomeBanner(null);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user?.uid) {
      setAppoLoading(false);
      return;
    }

    let unsubAppointments = () => { };
    let unsubPatients = () => { };

    let appointmentsList = [];
    let clinicIntakesList = [];

    const updateState = () => {
      // Deduplicate appointments by doctor, date, and timeslot
      const uniqueMap = new Map();
      [...appointmentsList, ...clinicIntakesList].forEach(item => {
        const dObj = item.date ? new Date(item.date) : null;
        const dateStr = dObj && !isNaN(dObj.getTime()) ? `${dObj.getFullYear()}-${String(dObj.getMonth() + 1).padStart(2, '0')}-${String(dObj.getDate()).padStart(2, '0')}` : '';
        const timeStr = (item.timeSlot || '').toLowerCase().replace(/\s+/g, '').replace(/^0/, '');
        let cleanDocName = String(item.doctorName || '').trim().toLowerCase();
        while (cleanDocName.startsWith('dr.') || cleanDocName.startsWith('dr ')) {
          if (cleanDocName.startsWith('dr.')) {
            cleanDocName = cleanDocName.substring(3).trim();
          } else {
            cleanDocName = cleanDocName.substring(2).trim();
          }
        }
        const docName = cleanDocName.replace(/[^a-z0-9]/g, '').substring(0, 5);
        const key = `${docName}_${dateStr}_${timeStr}`;

        if (!uniqueMap.has(key)) {
          uniqueMap.set(key, item);
        } else {
          const existing = uniqueMap.get(key);
          const existingScore = (existing.status?.toLowerCase() === 'completed' || existing.status?.toLowerCase() === 'done' ? 3 : (existing.status?.toLowerCase() === 'confirmed' ? 2 : 0)) + (existing.paymentRequested ? 1 : 0);
          const currentScore = (item.status?.toLowerCase() === 'completed' || item.status?.toLowerCase() === 'done' ? 3 : (item.status?.toLowerCase() === 'confirmed' ? 2 : 0)) + (item.paymentRequested ? 1 : 0);
          if (currentScore > existingScore) {
            uniqueMap.set(key, item);
          }
        }
      });
      const combined = Array.from(uniqueMap.values());

      // Filter and sort manually to find the closest future appointment (excluding completed/cancelled)
      const futureList = combined.filter(item => {
        const appoDate = new Date(item.date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const statusLower = item.status?.toLowerCase();
        return appoDate >= today && statusLower !== 'completed' && statusLower !== 'cancelled' && statusLower !== 'done';
      });

      futureList.sort((a, b) => new Date(a.date) - new Date(b.date));

      if (futureList.length > 0) {
        setUpcomingAppo(futureList[0]);
        setUpcomingAppos(futureList);
      } else {
        setUpcomingAppo(null);
        setUpcomingAppos([]);
      }

      // Find any active payment request across all appointments/intakes within 24 hours
      const paymentReq = combined.find(item => item.paymentRequested && item.paymentStatus === 'pending' && isPaymentRequestWithin24Hours(item));
      setActivePaymentRequest(paymentReq || null);

      setAppoLoading(false);
    };

    const mapDocToHomeItem = (docId, item) => {
      // Parse DD/MM/YYYY date
      let dateObj = new Date();
      if (typeof item.appointmentDate === 'string') {
        if (item.appointmentDate.includes('/')) {
          const parts = item.appointmentDate.split('/');
          if (parts.length === 3) {
            dateObj = new Date(parts[2], parts[1] - 1, parts[0]);
          }
        } else if (item.appointmentDate.includes('-')) {
          const parts = item.appointmentDate.split('-');
          if (parts.length === 3) {
            if (parts[0].length === 4) {
              dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
            } else {
              dateObj = new Date(parts[2], parts[1] - 1, parts[0]);
            }
          }
        }
      } else if (item.appointmentDate && typeof item.appointmentDate.toDate === 'function') {
        dateObj = item.appointmentDate.toDate();
      } else if (item.date) {
        dateObj = new Date(item.date);
      }

      // Map clinic status to patient-app user friendly status
      let resolvedStatus = 'Confirmed';
      if (item.status === 'completed' || item.status === 'done') {
        resolvedStatus = 'Completed';
      } else if (item.status === 'cancelled') {
        resolvedStatus = 'Cancelled';
      }

      const isOnline = item.source === 'UserApp' || item.source === 'appointments' || item.source === 'Patient App' || item.source === 'Online' || item._type === 'online';

      return {
        id: docId,
        sourceType: isOnline ? 'online' : 'clinic',
        patientName: item.fullName || item.patientName || '',
        phone: item.phone || item.patientPhone || '',
        doctorName: item.doctor ? (item.doctor.startsWith('Dr.') ? item.doctor.substring(3).trim() : item.doctor) : (item.doctorName || 'General Doctor'),
        specialty: item.complaint || item.specialty || 'Homeopathy Specialist',
        branchName: item.branchName || 'Clinic Branch',
        timeSlot: item.appointmentTime || item.timeSlot || '09:30 AM',
        status: isOnline ? (item.status ? (item.status.charAt(0).toUpperCase() + item.status.slice(1)) : 'Pending') : resolvedStatus,
        date: dateObj.toISOString(),
        formattedDate: dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
        doctorImage: item.doctorImage || '',
        paymentRequested: item.paymentRequested || false,
        paymentRequestedAt: item.paymentRequestedAt || item.requestedAt || item.paymentUpdatedAt || item.updatedAt || item.createdAt || null,
        createdAt: item.createdAt || null,
        updatedAt: item.updatedAt || null,
        appointmentDate: item.appointmentDate || null,
        appointmentTime: item.appointmentTime || item.timeSlot || null,
        requestedAmount: Number(item.requestedAmount) || 0,
        paymentStatus: item.paymentStatus || 'pending',
        paymentMethod: item.paymentMethod || 'online',
        splitCounterMethod: item.splitCounterMethod || '',
        splitCounterAmount: Number(item.splitCounterAmount) || 0,
        splitUpiAmount: Number(item.splitUpiAmount) || 0
      };
    };

    const handlePaymentTriggers = (snapshot) => {
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.paymentRequested && data.paymentStatus === 'pending' && isPaymentRequestWithin24Hours(data)) {
          if (!notifiedRequests.current.has(doc.id)) {
            notifiedRequests.current.add(doc.id);
            const doctorName = data.doctor ? (data.doctor.startsWith('Dr.') ? data.doctor.substring(3).trim() : data.doctor) : (data.doctorName || 'Doctor');
            if (data.paymentMethod === 'split') {
              scheduleSplitPaymentRequestNotification(
                doctorName,
                Number(data.requestedAmount) || 0,
                Number(data.splitCounterAmount) || 0,
                data.splitCounterMethod || 'cash'
              );
            } else {
              schedulePaymentRequestNotification(doctorName, Number(data.requestedAmount) || 0);
            }
          }
        }
      });
    };

    // 1. Listen to online appointments matching patientId (Auth UID)
    const qOnline = query(
      collection(db, 'allpatients'),
      where('patientId', '==', user.uid)
    );
    unsubAppointments = onSnapshot(qOnline, (snapshot) => {
      appointmentsList = snapshot.docs
        .filter(doc => !doc.data().isDeleted)
        .map(doc => mapDocToHomeItem(doc.id, doc.data()));
      handlePaymentTriggers(snapshot);
      updateState();
    }, (error) => {
      console.error("Error listening to patients online bookings:", error);
    });

    // 2. Listen to clinic walk-ins matching patient phone from allpatients
    const userPhone = userData?.phone || user.phoneNumber;
    if (userPhone) {
      const cleanPhone = String(userPhone).replace(/[^0-9]/g, '').slice(-10);
      const qPatients = query(
        collection(db, 'allpatients'),
        where('phone', '==', cleanPhone)
      );
      unsubPatients = onSnapshot(qPatients, (snapshot) => {
        clinicIntakesList = snapshot.docs
          .filter(doc => doc.id !== user.uid && !doc.data().isDeleted)
          .map(doc => mapDocToHomeItem(doc.id, doc.data()))
          .filter(item => {
            const statusLower = item.status?.toLowerCase();
            const isCompletedOrCancelled = statusLower === 'completed' || statusLower === 'cancelled';
            return !isCompletedOrCancelled || (item.paymentRequested && item.paymentStatus === 'pending' && isPaymentRequestWithin24Hours(item));
          });
        handlePaymentTriggers(snapshot);
        updateState();
      }, (error) => {
        console.error("Error listening to patients clinic bookings:", error);
      });
    } else {
      updateState();
    }

    return () => {
      unsubAppointments();
      unsubPatients();
    };
  }, [user, userData]);

  const QuickAccessItem = ({ icon: Icon, label, color, onPress }) => (
    <TouchableOpacity style={styles.quickAccessItem} onPress={onPress}>
      <View style={[styles.quickIconContainer, { borderColor: color + '20' }]}>
        <Icon size={24} color={color} />
      </View>
      <Text style={styles.quickLabel}>{label}</Text>
    </TouchableOpacity>
  );

  const SpecialtyCard = ({ icon: Icon, title, subtitle, color }) => (
    <Surface style={styles.specialtyCard}>
      <View style={styles.specialtyIconContainer}>
        <Icon size={26} color={color} />
      </View>
      <Text style={styles.specialtyTitle}>{title}</Text>
      <Text style={styles.specialtySubtitle}>{subtitle}</Text>
    </Surface>
  );

  const HospitalCard = ({ name, specialty, image, location = 'Nallagandla, Hyderabad', timings = 'Open • Closes 8:00 PM' }) => {
    const defaultFallback = 'https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&w=800&q=80';
    const [imgSrc, setImgSrc] = useState(() => {
      if (!image || typeof image !== 'string' || image.length < 10 || image.toLowerCase().includes('no image')) {
        return defaultFallback;
      }
      return image.trim();
    });

    useEffect(() => {
      if (image && typeof image === 'string' && image.length >= 10 && !image.toLowerCase().includes('no image')) {
        setImgSrc(image.trim());
      } else {
        setImgSrc(defaultFallback);
      }
    }, [image]);

    return (
      <Surface style={styles.hospitalCard}>
        {/* Left Details Section */}
        <View style={styles.hospitalDetailsLeft}>
          <View>
            <Text style={styles.hospitalName} numberOfLines={1}>{name}</Text>
            <Text style={styles.hospitalSpecialty}>{specialty}</Text>
          </View>

          <View style={styles.hospitalLocRow}>
            <MapPin size={11} color="#a7f3d0" />
            <Text style={styles.hospitalLocText} numberOfLines={1}>{location}</Text>
          </View>

          <View style={styles.hospitalTimingBadge}>
            <Clock size={11} color="#34d399" />
            <Text style={styles.hospitalTimingText}>{timings}</Text>
          </View>

          <TouchableOpacity style={styles.hospitalCallBtn} onPress={() => navigation.navigate('BranchesList')}>
            <Phone size={12} color="#fff" fill="#fff" />
            <Text style={styles.hospitalCallText}>Call Branch</Text>
          </TouchableOpacity>
        </View>

        {/* Right Image Section */}
        <View style={styles.hospitalImageRight}>
          <Image 
            source={{ uri: imgSrc }} 
            style={styles.hospitalImg} 
            resizeMode="cover"
            onError={() => setImgSrc(defaultFallback)}
          />
        </View>
      </Surface>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[COLORS.secondary]}
            tintColor={COLORS.secondary}
          />
        }
      >

        {/* Logo + Profile Header ONLY */}
        <View style={styles.topHeader}>
          <Image
            source={require('../../assets/SH logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.notificationBtn}
              onPress={() => navigation.navigate('Notifications')}
            >
              <Bell size={24} color={COLORS.secondary} />
              {unreadNotifications > 0 && (
                <Badge style={styles.notificationBadge}>{unreadNotifications}</Badge>
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate('ProfileTab')}>
              <Avatar.Icon size={44} icon={() => <User size={24} color={COLORS.secondary} />} style={{ backgroundColor: COLORS.primary + '20' }} />
            </TouchableOpacity>
          </View>
        </View>

        {/* User Greeting */}
        <View style={styles.greetingContainer}>
          <View style={styles.greetingText}>
            <Text style={styles.helloText}>Hello, {userData?.fullName?.split(' ')[0] || 'Patient'} 👋</Text>
            <Text style={styles.subGreeting}>How can we help you today?</Text>
          </View>
          <TouchableOpacity
            style={styles.pointsPill}
            onPress={() => navigation.navigate('WalletDetails')}
          >
            <Coins size={14} color="#f59e0b" style={{ marginRight: 4 }} />
            <Text style={styles.pointsPillText}>{rewardPoints} pts</Text>
          </TouchableOpacity>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Surface style={styles.searchBar}>
            <Search size={20} color="#10b981" style={styles.searchIcon} />
            <TextInput
              placeholder="Search doctors, specialties, hospitals..."
              style={styles.searchInput}
              placeholderTextColor="#94a3b8"
              value={searchText}
              onChangeText={setSearchText}
              onSubmitEditing={handleSearchSubmit}
              returnKeyType="search"
            />
            <TouchableOpacity style={styles.searchBtn} onPress={handleSearchSubmit}>
              <Search size={22} color="#10b981" />
            </TouchableOpacity>
          </Surface>
        </View>

        {/* Updated Banners Carousel */}
        <ScrollView
          ref={bannerScrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          style={styles.bannerCarousel}
          onMomentumScrollEnd={(e) => {
            const index = Math.round(e.nativeEvent.contentOffset.x / width);
            setActiveBannerIndex(index);
          }}
        >
          {banners.map((item, i) => (
            <TouchableOpacity
              key={i}
              activeOpacity={0.9}
              style={styles.bannerWrapper}
              onPress={() => navigation.navigate('AppointmentsTab')}
            >
              <Image
                source={item.type === 'dynamic' ? { uri: item.uri } : item.source}
                style={styles.fullBannerImg}
                resizeMode="contain"
              />
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Quick Access - DO NOT TOUCH */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Quick Access</Text>
        </View>
        <View style={styles.quickAccessGrid}>
          <QuickAccessItem
            icon={Coins}
            label="My Wallet"
            color="#258ec8"
            onPress={() => navigation.navigate('WalletDetails')}
          />
          <QuickAccessItem
            icon={Stethoscope}
            label="Find Doctors"
            color="#10b981"
            onPress={() => navigation.navigate('DoctorsTab')}
          />
          <QuickAccessItem
            icon={Hospital}
            label="Find Hospitals"
            color="#8b5cf6"
            onPress={() => navigation.navigate('BranchesList')}
          />
          <QuickAccessItem
            icon={HeartPulse}
            label="Diet Plan"
            color="#ec4899"
            onPress={() => navigation.navigate('DietPlan')}
          />
        </View>

        {/* Premium consultation fee request banner (active <= 24 hours) */}
        {activePaymentRequest && isPaymentRequestWithin24Hours(activePaymentRequest) && (
          <Surface style={styles.premiumPaymentCard} elevation={0}>
            <View style={styles.premiumPaymentContainer}>
              <View style={styles.premiumPaymentRow}>
                <View style={styles.premiumPaymentIconBg}>
                  <Wallet size={24} color={COLORS.primary} />
                </View>
                <View style={styles.premiumPaymentTextContainer}>
                  <Text style={styles.premiumPaymentTitle}>Consultation Fee Pending</Text>
                  <Text style={styles.premiumPaymentDesc}>
                    {activePaymentRequest.paymentMethod === 'split' ? (
                      `Split Payment: ₹${activePaymentRequest.splitCounterAmount} paid via ${activePaymentRequest.splitCounterMethod?.toUpperCase()} at counter. Spiritual Homeopathy - ${activePaymentRequest.branchName || 'Main'} Branch requested remaining ₹${activePaymentRequest.requestedAmount} via UPI.`
                    ) : (
                      `Spiritual Homeopathy - ${activePaymentRequest.branchName || 'Main'} Branch requested ₹${activePaymentRequest.requestedAmount} for your consultation.`
                    )}
                  </Text>
                </View>
              </View>
              <View style={styles.premiumPaymentFooter}>
                <Text style={styles.premiumPaymentNote}>Pay online now to earn reward points & unlock coupons</Text>
                <TouchableOpacity
                  style={styles.premiumPayButton}
                  onPress={() => handleOpenAppPaySheet(activePaymentRequest)}
                >
                  <Text style={styles.premiumPayButtonText}>Pay Now</Text>
                  <ChevronRight size={14} color="#ffffff" strokeWidth={3} />
                </TouchableOpacity>
              </View>
            </View>
          </Surface>
        )}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Upcoming Appointments</Text>
          <TouchableOpacity onPress={() => navigation.navigate('MyAppointments', { initialTab: 'Upcoming' })}>
            <Text style={styles.viewAll}>View All</Text>
          </TouchableOpacity>
        </View>

        {appoLoading ? (
          <Surface style={styles.appointmentCard}>
            <View style={{ paddingVertical: 20, alignItems: 'center' }}>
              <ActivityIndicator size="small" color={COLORS.secondary} />
            </View>
          </Surface>
        ) : upcomingAppos.length > 0 ? (
          upcomingAppos.map((appt) => (
            <Surface key={appt.id} style={[styles.appointmentCard, { marginBottom: 12 }]}>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => navigation.navigate('MyAppointments', { appointmentId: appt.id, initialTab: 'Upcoming' })}
              >
                <View style={styles.appoMain}>
                  <View style={styles.patientAvatarBg}>
                    <User size={18} color={COLORS.white} />
                  </View>
                  <View style={styles.appoInfo}>
                    <Text style={styles.appoDoctor}>{appt.patientName || appt.fullName || userData?.fullName || 'Patient'}</Text>
                    <Text style={styles.patientPhoneText}>
                      {appt.phone || appt.patientPhone || userData?.phone
                        ? `+91 ${(appt.phone || appt.patientPhone || userData?.phone).replace(/^\+91/, '').replace(/\D/g, '').slice(-10)}`
                        : 'N/A'
                      }
                    </Text>
                    <View style={styles.appoLoc}>
                      <MapPin size={10} color="#64748b" />
                      <Text style={styles.appoLocText} numberOfLines={1}>{appt.branchName}</Text>
                    </View>
                  </View>
                </View>

                <Divider style={styles.appoDivider} />

                <View style={styles.appoFooter}>
                  <View style={styles.appoDateTimeBox}>
                    <Calendar size={12} color={COLORS.primary} />
                    <Text style={styles.dtText}>{appt.formattedDate}</Text>
                    <View style={styles.dtDot} />
                    <Clock size={12} color={COLORS.primary} />
                    <Text style={styles.dtText}>{appt.timeSlot || '10:00 AM'}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: appt.status?.toLowerCase() === 'confirmed' ? '#ecfdf5' : '#fffbeb' }]}>
                    <View style={[styles.statusDot, { backgroundColor: appt.status?.toLowerCase() === 'confirmed' ? '#10b981' : '#f59e0b' }]} />
                    <Text style={[styles.statusText, { color: appt.status?.toLowerCase() === 'confirmed' ? '#10b981' : '#f59e0b' }]}>
                      {appt.status}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>

              {/* Reschedule & Cancel buttons directly on Home screen card */}
              {(appt.status?.toLowerCase() === 'pending' || appt.status?.toLowerCase() === 'confirmed') && (
                <View style={{ flexDirection: 'row', marginTop: 12, paddingHorizontal: 4, paddingBottom: 4, gap: 8 }}>
                  <Button
                    mode="contained"
                    buttonColor={COLORS.primary}
                    onPress={() => {
                      navigation.navigate('SelectDateTime', {
                        isReschedule: true,
                        appointmentId: appt.id,
                        sourceType: appt.sourceType,
                        patientName: appt.patientName || appt.fullName || userData?.fullName || 'Patient',
                        branch: { name: appt.branchName, id: appt.branchId },
                        doctor: { name: appt.doctorName, id: appt.doctorId },
                        modeOfConsultation: appt.modeOfConsultation || 'In-Clinic'
                      });
                    }}
                    style={{ flex: 1, borderRadius: 10 }}
                    contentStyle={{ height: 36 }}
                    labelStyle={{ color: '#ffffff', fontSize: 11, fontWeight: '700' }}
                  >
                    Reschedule
                  </Button>
                  <Button
                    mode="contained"
                    buttonColor="#ef4444"
                    onPress={() => {
                      setSelectedAppo(appt);
                      setShowCancelModal(true);
                    }}
                    style={{ flex: 1, borderRadius: 10 }}
                    contentStyle={{ height: 36 }}
                    labelStyle={{ color: '#ffffff', fontSize: 11, fontWeight: '700' }}
                  >
                    Cancel
                  </Button>
                </View>
              )}

              {appt.paymentRequested && appt.paymentStatus === 'pending' && isPaymentRequestWithin24Hours(appt) && (
                <View style={styles.paymentRequestedContainer}>
                  <View style={styles.paymentTextCol}>
                    <Text style={styles.paymentReqTitle}>Fee Payment Requested</Text>
                    <Text style={styles.paymentReqSubtitle}>
                      {appt.paymentMethod === 'split' ? (
                        `Split payment: ₹${appt.requestedAmount} (₹${appt.splitCounterAmount} paid via ${appt.splitCounterMethod?.toUpperCase()} at counter)`
                      ) : (
                        `Reception set consultation fee to ₹${appt.requestedAmount}`
                      )}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.paymentPayNowBtn}
                    onPress={() => handleOpenAppPaySheet(appt)}
                  >
                    <Text style={styles.paymentPayNowBtnText}>Pay Now</Text>
                  </TouchableOpacity>
                </View>
              )}
            </Surface>
          ))
        ) : (
          <Surface style={styles.noAppointmentCard}>
            <View style={styles.noAppoHeader}>
              <View style={styles.calendarIconContainer}>
                <Calendar size={22} color={COLORS.secondary} />
              </View>
              <View style={styles.noAppoInfo}>
                <Text style={styles.noAppoTitle}>No upcoming consultations</Text>
                <Text style={styles.noAppoSub}>Keep your health in check. Schedule a booking today.</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.noAppoBookBtn}
              onPress={() => navigation.navigate('AppointmentsTab')}
            >
              <Text style={styles.noAppoBookBtnText} adjustsFontSizeToFit numberOfLines={1}>Book Appointment</Text>
              <ChevronRight size={14} color="#fff" />
            </TouchableOpacity>
          </Surface>
        )}

        {/* Follow-up Reminders */}
        {patientFollowUps.length > 0 && (
          <View style={{ marginTop: 8 }}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Follow-up Reminders</Text>
            </View>
            {patientFollowUps.map(fup => (
              <Surface key={fup.id} style={[styles.appointmentCard, { marginBottom: 12, borderLeftWidth: 4, borderLeftColor: '#f59e0b', padding: 0, overflow: 'hidden' }]}>
                <View style={[styles.appoMain, { padding: 16 }]}>
                  <View style={[styles.patientAvatarBg, { backgroundColor: '#fffbeb' }]}>
                    <Calendar size={18} color="#f59e0b" />
                  </View>
                  <View style={styles.appoInfo}>
                    <Text style={styles.appoDoctor}>Follow-up for {fup.name || 'Patient'}</Text>
                    <Text style={[styles.patientPhoneText, { color: '#d97706', fontWeight: '700', marginTop: 2, fontSize: 12 }]}>
                      Due on {fup.followUpDate}
                    </Text>
                    {fup.followUpInterval && fup.followUpInterval !== 'No Follow-up' && (
                      <View style={[styles.appoLoc, { marginTop: 4 }]}>
                        <Info size={12} color="#64748b" />
                        <Text style={styles.appoLocText} numberOfLines={1}>Interval: {fup.followUpInterval}</Text>
                      </View>
                    )}
                  </View>
                </View>
                <TouchableOpacity
                  style={{ backgroundColor: '#fffbeb', padding: 12, alignItems: 'center' }}
                  onPress={() => navigation.navigate('AppointmentsTab')}
                >
                  <Text style={{ color: '#d97706', fontWeight: '700', fontSize: 13 }} adjustsFontSizeToFit numberOfLines={1}>Book Follow-up Appointment</Text>
                </TouchableOpacity>
              </Surface>
            ))}
          </View>
        )}

        {/* Our Branches */}
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleBlock}>
            <Text style={styles.sectionTitle}>Our Branches</Text>
            <Text style={styles.sectionSubtitle}>Select a clinic near you</Text>
          </View>
          <TouchableOpacity onPress={() => navigation.navigate('BranchesList')}>
            <Text style={styles.viewAll}>View All</Text>
          </TouchableOpacity>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalScrollContent}>
          {homeBranches.map((branch, idx) => (
            <TouchableOpacity key={idx} activeOpacity={0.9} onPress={() => navigation.navigate('BranchesList')}>
              <HospitalCard
                name={`${branch.name} Branch`}
                specialty={branch.specialty || 'Spiritual Homeopathy'}
                location={branch.address || branch.location || 'Clinic Address'}
                timings={branch.timings || '10:00 AM - 8:30 PM'}
                image={branch.image}
              />
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Videos & Social Updates Section */}
        <View style={styles.videoSectionHeader}>
          <View style={styles.videoSectionTitleBlock}>
            <Text style={styles.videoSectionTitle}>Videos & Social Updates</Text>
            <Text style={styles.videoSectionSubtitle}>Expert insights and health tips</Text>
          </View>
        </View>

        {/* Sub-tab selection */}
        <View style={styles.videoTabContainer}>
          <TouchableOpacity
            style={[styles.videoTabBtn, activeVideoTab === 'public' && styles.videoActiveTabBtn]}
            onPress={() => setActiveVideoTab('public')}
            activeOpacity={0.8}
          >
            <Text style={[styles.videoTabBtnText, activeVideoTab === 'public' && styles.videoActiveTabBtnText]}>
              Public Videos
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.videoTabBtn, activeVideoTab === 'shared' && styles.videoActiveTabBtn]}
            onPress={() => setActiveVideoTab('shared')}
            activeOpacity={0.8}
          >
            <Text style={[styles.videoTabBtnText, activeVideoTab === 'shared' && styles.videoActiveTabBtnText]}>
              Shared with Me
            </Text>
          </TouchableOpacity>
        </View>

        {activeVideoTab === 'public' ? (
          <>
            {/* Social Media Buttons (Subscribe & Follow) */}
            <View style={styles.socialFollowRow}>
              <TouchableOpacity
                style={[styles.socialFollowBtn, styles.ytFollowBtn]}
                onPress={() => Linking.openURL('https://youtube.com/@spiritualhomeopathyhyderabad?si=s-l3MC4Vmvaffosf')}
                activeOpacity={0.85}
              >
                <View style={styles.socialIconSquircleYt}>
                  <YoutubeIcon size={28} />
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.socialFollowLabel}>Subscribe on</Text>
                  <Text style={styles.socialFollowBrandYt}>YouTube</Text>
                  <Text style={styles.socialFollowSub} numberOfLines={1}>Health tips & expert talks</Text>
                </View>
                <ChevronRight size={12} color="#94a3b8" />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.socialFollowBtn, styles.igFollowBtn]}
                onPress={() => Linking.openURL('https://www.instagram.com/spiritualhomeopathy?igsh=MTVtdHI5NmZkaDFxbw==')}
                activeOpacity={0.85}
              >
                <View style={styles.socialIconSquircleIg}>
                  <InstagramIcon size={28} />
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.socialFollowLabel}>Follow on</Text>
                  <Text style={styles.socialFollowBrandIg}>Instagram</Text>
                  <Text style={styles.socialFollowSub} numberOfLines={1}>Updates & wellness tips</Text>
                </View>
                <ChevronRight size={12} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            {videosLoading ? (
              <ActivityIndicator color={COLORS.secondary} style={{ marginVertical: 30 }} />
            ) : videos.length === 0 ? (
              <Surface style={styles.emptyVideosCard}>
                <View style={styles.emptyIconCircle}>
                  <Info size={20} color={COLORS.secondary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.emptyVideosTitle}>Stay Tuned!</Text>
                  <Text style={styles.emptyVideosText}>We are preparing medical tips and clinic updates for you.</Text>
                </View>
              </Surface>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.videosScroll}
                snapToInterval={336}
                decelerationRate="fast"
              >
                {videos.map((video, index) => {
                  const isYoutube = video.type === 'youtube';
                  const videoId = isYoutube ? getYoutubeVideoId(video.url) : null;
                  const thumbnailUrl = videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : null;
                  const showNewBadge = index === 0;
                  const duration = video.duration || (index % 2 === 0 ? '06:45' : '04:12');

                  return (
                    <TouchableOpacity
                      key={video.id}
                      activeOpacity={0.95}
                      onPress={() => Linking.openURL(video.url)}
                      style={styles.videoCardWrapper}
                    >
                      <Surface style={styles.videoCard}>
                        {isYoutube && thumbnailUrl ? (
                          <View style={styles.videoThumbnailContainer}>
                            <Image source={{ uri: thumbnailUrl }} style={styles.videoThumbnail} resizeMode="cover" />
                            {showNewBadge && (
                              <View style={styles.newVideoBadge}>
                                <Text style={styles.newVideoBadgeText}>NEW VIDEO</Text>
                              </View>
                            )}
                            <View style={styles.durationBadge}>
                              <Text style={styles.durationBadgeText}>{duration}</Text>
                            </View>
                          </View>
                        ) : (
                          <View style={[styles.videoThumbnailContainer, styles.igGradientBg]}>
                            <InstagramIcon size={40} color="rgba(255,255,255,0.85)" style={styles.igWatermark} />
                            {showNewBadge && (
                              <View style={styles.newVideoBadge}>
                                <Text style={styles.newVideoBadgeText}>NEW VIDEO</Text>
                              </View>
                            )}
                            <View style={styles.durationBadge}>
                              <Text style={styles.durationBadgeText}>{duration}</Text>
                            </View>
                          </View>
                        )}

                        <View style={styles.videoDetails}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                            {isYoutube ? (
                              <Play size={10} color="#ff0000" fill="#ff0000" />
                            ) : (
                              <InstagramIcon size={11} color="#db2777" />
                            )}
                            <Text style={{ fontSize: 10, fontWeight: '800', color: isYoutube ? '#ff0000' : '#db2777', letterSpacing: 0.5 }}>
                              {isYoutube ? 'YOUTUBE' : 'INSTAGRAM'}
                            </Text>
                          </View>
                          <Text style={styles.videoCardTitle} numberOfLines={2}>
                            {video.title}
                          </Text>
                          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                              <Text style={{ fontSize: 11, fontWeight: '800', color: '#10b981' }}>Watch Now</Text>
                              <ChevronRight size={12} color="#10b981" />
                            </View>
                          </View>
                        </View>
                      </Surface>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </>
        ) : (
          // Shared with Me View
          <View style={{ paddingHorizontal: 16, marginBottom: 20 }}>
            {sharedLoading ? (
              <ActivityIndicator color={COLORS.secondary} style={{ marginVertical: 30 }} />
            ) : sharedFolders.length === 0 && sharedItems.length === 0 ? (
              <Surface style={styles.emptyVideosCard}>
                <View style={styles.emptyIconCircle}>
                  <Folder size={20} color={COLORS.secondary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.emptyVideosTitle}>No Shared Media Yet</Text>
                  <Text style={styles.emptyVideosText}>Videos and images shared by your clinic's reception will appear here.</Text>
                </View>
              </Surface>
            ) : (
              <View style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {sharedFolders.map((folder) => {
                  const isExpanded = expandedFolder === folder.id;
                  const folderItems = folderItemsMap[folder.id] || [];
                  const isFolderLoading = folderItemsLoading[folder.id] === true;

                  return (
                    <View key={folder.id} style={styles.sharedFolderContainer}>
                      <TouchableOpacity
                        style={styles.sharedFolderHeader}
                        onPress={() => toggleFolder(folder.id, folder.patientPhone)}
                        activeOpacity={0.8}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                          <View style={styles.folderIconBg}>
                            <FolderOpen size={20} color={COLORS.secondary} />
                          </View>
                          <View style={{ flex: 1, marginLeft: 12 }}>
                            <Text style={styles.sharedFolderName}>{folder.name}</Text>
                            <Text style={styles.sharedFolderSub}>
                              {folder.patientPhone ? 'Private Patient Folder' : 'Educational Folder'} • {folderItemsMap[folder.id] ? `${folderItems.length} ${folderItems.length === 1 ? 'file' : 'files'}` : 'Tap to open'}
                            </Text>
                          </View>
                        </View>
                        <ChevronRight
                          size={18}
                          color="#94a3b8"
                          style={{
                            transform: [{ rotate: isExpanded ? '90deg' : '0deg' }],
                          }}
                        />
                      </TouchableOpacity>

                      {isExpanded && (
                        <View style={styles.sharedFolderItemsList}>
                          {isFolderLoading ? (
                            <ActivityIndicator size="small" color={COLORS.secondary} style={{ marginVertical: 12 }} />
                          ) : folderItems.length === 0 ? (
                            <Text style={styles.noItemsText}>This folder is empty.</Text>
                          ) : (
                            folderItems.map((item) => (
                              <TouchableOpacity
                                key={item.id}
                                style={styles.sharedItemRow}
                                onPress={() => Linking.openURL(item.url)}
                                activeOpacity={0.7}
                              >
                                <View style={styles.itemIconBg}>
                                  {item.type === 'video' ? (
                                    <FileVideo size={16} color={COLORS.secondary} />
                                  ) : (
                                    <ImageIcon size={16} color="#10b981" />
                                  )}
                                </View>
                                <View style={{ flex: 1, marginLeft: 10 }}>
                                  <Text style={styles.sharedItemTitle} numberOfLines={1}>
                                    {item.title}
                                  </Text>
                                  <Text style={styles.sharedItemType}>
                                    {item.type.toUpperCase()} • Direct Upload
                                  </Text>
                                </View>
                                <View style={styles.watchNowBadge}>
                                  <Text style={styles.watchNowBadgeText}>
                                    {item.type === 'video' ? 'Play' : 'View'}
                                  </Text>
                                </View>
                              </TouchableOpacity>
                            ))
                          )}
                        </View>
                      )}
                    </View>
                  );
                })}

                {/* Standalone shared files section */}
                {sharedItems.length > 0 && (
                  <View style={{ marginTop: 8 }}>
                    <Text style={styles.sectionSubHeading}>Individual Shared Files</Text>
                    {sharedItems.map((item) => (
                      <TouchableOpacity
                        key={item.id}
                        style={styles.sharedItemRow}
                        onPress={() => Linking.openURL(item.url)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.itemIconBg}>
                          {item.type === 'video' ? (
                            <FileVideo size={16} color={COLORS.secondary} />
                          ) : (
                            <ImageIcon size={16} color="#10b981" />
                          )}
                        </View>
                        <View style={{ flex: 1, marginLeft: 10 }}>
                          <Text style={styles.sharedItemTitle} numberOfLines={1}>
                            {item.title}
                          </Text>
                          <Text style={styles.sharedItemType}>
                            {item.type.toUpperCase()} • Shared File
                          </Text>
                        </View>
                        <View style={styles.watchNowBadge}>
                          <Text style={styles.watchNowBadgeText}>
                            {item.type === 'video' ? 'Play' : 'View'}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            )}
          </View>
        )}

      </ScrollView>

      {/* Consultation Fee Payment Modal */}
      <Modal
        visible={payModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => { if (!processingPayment) setPayModalVisible(false); }}
      >
        <View style={styles.payModalOverlay}>
          <View style={styles.payModalContent}>
            {paymentSuccessData ? (
              <View style={styles.paySuccessContainer}>
                <View style={styles.paySuccessIconBg}>
                  <CheckCircle2 size={36} color="#10b981" />
                </View>
                <Text style={styles.paySuccessTitle}>Payment Verified!</Text>
                <Text style={styles.paySuccessSub}>
                  Your consultation fee payment of ₹{paymentSuccessData.amount} for {apptForPayment?.doctorName ? (apptForPayment.doctorName.startsWith('Dr.') || apptForPayment.doctorName.startsWith('Dr ') ? apptForPayment.doctorName : `Dr. ${apptForPayment.doctorName}`) : ''} was successful.
                </Text>

                {paymentSuccessData.points > 0 && (
                  <View style={styles.payRewardTicket}>
                    <View style={styles.payRewardPointsCol}>
                      <Text style={styles.payRewardPointsLabel}>Points Credited</Text>
                      <Text style={styles.payRewardPointsVal}>+{paymentSuccessData.points} PTS</Text>
                    </View>
                    <View style={styles.payRewardCouponCol}>
                      <Text style={styles.payRewardCouponLabel}>LOYALTY COUPON CODE</Text>
                      <Text style={styles.payRewardCouponCode}>{paymentSuccessData.couponCode}</Text>
                      <TouchableOpacity
                        style={styles.payCopyBtn}
                        onPress={() => {
                          Clipboard.setString(paymentSuccessData.couponCode);
                          Alert.alert("Copied", "Coupon code copied to clipboard!");
                        }}
                      >
                        <Text style={styles.payCopyBtnText}>COPY CODE</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.paySuccessDoneBtn, { backgroundColor: COLORS.secondary, marginBottom: 8 }]}
                  onPress={() => handleShareInvoicePDF(apptForPayment, paymentSuccessData)}
                >
                  <Text style={styles.paySuccessDoneText}>Share Receipt (PDF)</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.paySuccessDoneBtn}
                  onPress={() => setPayModalVisible(false)}
                >
                  <Text style={styles.paySuccessDoneText}>Done</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View>
                <View style={styles.payModalHeader}>
                  <Text style={styles.payModalTitle}>Consultation Fee Payment</Text>
                  <TouchableOpacity
                    disabled={processingPayment}
                    onPress={() => setPayModalVisible(false)}
                    style={styles.payCloseBtn}
                  >
                    <X size={20} color="#64748b" />
                  </TouchableOpacity>
                </View>

                <View style={styles.paySummaryCard}>
                  <View style={styles.paySummaryRow}>
                    <Text style={styles.paySummaryLabel}>Doctor</Text>
                    <Text style={styles.paySummaryValue}>
                      {apptForPayment?.doctorName ? (apptForPayment.doctorName.startsWith('Dr.') || apptForPayment.doctorName.startsWith('Dr ') ? apptForPayment.doctorName : `Dr. ${apptForPayment.doctorName}`) : ''}
                    </Text>
                  </View>
                  <View style={styles.paySummaryRow}>
                    <Text style={styles.paySummaryLabel}>Date & Time</Text>
                    <Text style={styles.paySummaryValue}>
                      {apptForPayment?.formattedDate} ({apptForPayment?.timeSlot})
                    </Text>
                  </View>
                  <View style={styles.paySummaryRow}>
                    <Text style={styles.paySummaryLabel}>Branch</Text>
                    <Text style={styles.paySummaryValue}>{apptForPayment?.branchName}</Text>
                  </View>

                  <View style={styles.payDivider} />

                  {apptForPayment?.paymentMethod === 'split' ? (
                    <>
                      <View style={styles.paySummaryRow}>
                        <Text style={styles.paySummaryLabel}>Total Fee</Text>
                        <Text style={styles.paySummaryValue}>₹{(Number(apptForPayment.requestedAmount) || 0) + (Number(apptForPayment.splitCounterAmount) || 0)}</Text>
                      </View>
                      <View style={styles.paySummaryRow}>
                        <Text style={styles.paySummaryLabel}>Paid at Counter ({apptForPayment.splitCounterMethod?.toUpperCase()})</Text>
                        <Text style={styles.paySummaryValue}>- ₹{apptForPayment.splitCounterAmount}</Text>
                      </View>
                      <View style={styles.payDivider} />
                      <View style={styles.paySummaryRow}>
                        <Text style={styles.paySummaryTotalLabel}>Payable via UPI</Text>
                        <Text style={styles.paySummaryTotalValue}>₹{apptForPayment?.requestedAmount}</Text>
                      </View>
                    </>
                  ) : (
                    <View style={styles.paySummaryRow}>
                      <Text style={styles.paySummaryTotalLabel}>Consultation Fee</Text>
                      <Text style={styles.paySummaryTotalValue}>₹{apptForPayment?.requestedAmount}</Text>
                    </View>
                  )}
                </View>

                <TouchableOpacity
                  style={styles.paySubmitBtn}
                  disabled={processingPayment}
                  onPress={handleCompleteAppPayment}
                >
                  {processingPayment ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={styles.paySubmitBtnText}>Pay ₹{apptForPayment?.requestedAmount} Now</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Cancellation Confirmation Modal */}
      <Modal
        visible={showCancelModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => {
          setShowCancelModal(false);
          setCancelConfirmed(false);
        }}
      >
        <View style={styles.modalBackdrop}>
          <Surface style={styles.confirmModalContent}>
            <View style={styles.confirmHeader}>
              <AlertCircle size={22} color='#ef4444' style={{ marginRight: 8 }} />
              <Text style={styles.confirmTitle}>Cancel Appointment</Text>
            </View>
            <Text style={styles.confirmBody}>
              Are you sure you want to cancel your appointment with Dr. {selectedAppo?.doctorName} on {selectedAppo?.formattedDate} at {selectedAppo?.timeSlot}? This action cannot be undone.
            </Text>

            <TouchableOpacity
              style={styles.confirmCheckboxRow}
              onPress={() => setCancelConfirmed(!cancelConfirmed)}
              activeOpacity={0.8}
            >
              <View style={[styles.confirmCheckbox, cancelConfirmed && styles.confirmCheckboxChecked]}>
                {cancelConfirmed && <CheckCircle2 size={12} color="#fff" />}
              </View>
              <Text style={styles.confirmCheckboxLabel}>
                I confirm that I want to cancel this appointment.
              </Text>
            </TouchableOpacity>

            <View style={styles.confirmActions}>
              <Button
                mode="outlined"
                onPress={() => {
                  setShowCancelModal(false);
                  setCancelConfirmed(false);
                }}
                style={styles.confirmCancelBtn}
                labelStyle={{ color: '#64748b' }}
              >
                No, Keep
              </Button>
              <Button
                mode="contained"
                disabled={!cancelConfirmed}
                onPress={() => {
                  setShowCancelModal(false);
                  setCancelConfirmed(false);
                  handleCancelAppointment(selectedAppo);
                }}
                style={[styles.confirmSubmitBtn, { backgroundColor: '#ef4444' }]}
                labelStyle={{ color: '#fff' }}
              >
                Yes, Cancel
              </Button>
            </View>
          </Surface>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  videoTabContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    padding: 4,
  },
  videoTabBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  videoTabBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
  },
  videoActiveTabBtn: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  videoActiveTabBtnText: {
    color: '#0f172a',
  },
  sharedFolderContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  sharedFolderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: '#ffffff',
  },
  folderIconBg: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sharedFolderName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  sharedFolderSub: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  sharedFolderItemsList: {
    padding: 12,
    backgroundColor: '#f8fafc',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    gap: 8,
  },
  noItemsText: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
    paddingVertical: 8,
    fontStyle: 'italic',
  },
  sharedItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  itemIconBg: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sharedItemTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
  },
  sharedItemType: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 1,
  },
  watchNowBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#e6f4ea',
  },
  watchNowBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#137333',
  },
  sectionSubHeading: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1e293b',
    marginTop: 12,
    marginBottom: 8,
  },
  container: { flex: 1, backgroundColor: '#fcfdfe' },
  scrollContent: { paddingBottom: 20 },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 5,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  notificationBtn: {
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    padding: 6,
  },
  notificationBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#ef4444',
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '800',
  },
  logo: { width: 140, height: 50 },
  greetingContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginTop: 10 },
  helloText: { fontSize: 19, fontWeight: '800', color: '#1e293b' },
  subGreeting: { fontSize: 14, color: '#64748b', marginTop: 4, fontWeight: '500' },
  pointsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fffbeb',
    borderColor: '#fef3c7',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    elevation: 1,
    shadowColor: '#f59e0b',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  pointsPillText: {
    fontSize: 12,
    color: '#b45309',
    fontWeight: 'bold',
  },
  searchContainer: { paddingHorizontal: 12, marginTop: 24, alignItems: 'center' },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 30,
    paddingLeft: 20,
    height: 52,
    width: '100%',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  searchInput: { flex: 1, fontSize: 14, color: '#1e293b', fontWeight: '500' },
  searchBtn: { padding: 10, borderRadius: 12, marginRight: 8 },
  bannerCarousel: {
    marginTop: 20,
  },
  bannerWrapper: {
    paddingHorizontal: 20,
  },
  fullBannerImg: {
    width: width - 40,
    height: 160,
    borderRadius: 24,
  },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginTop: 30, marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#1e293b' },
  viewAll: { fontSize: 13, fontWeight: '700', color: COLORS.secondary },
  quickAccessGrid: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20 },
  quickAccessItem: { alignItems: 'center', width: '22%' },
  quickIconContainer: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  quickLabel: { fontSize: 11, color: '#1e293b', textAlign: 'center', fontWeight: '700', lineHeight: 14 },
  appointmentCard: {
    marginHorizontal: 20,
    padding: 10,
    borderRadius: 14,
    backgroundColor: COLORS.white,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    borderWidth: 1,
    borderColor: '#f1f5f9'
  },
  appoMain: { flexDirection: 'row', alignItems: 'center' },
  appoInfo: { marginLeft: 12, flex: 1 },
  appoDoctor: { fontSize: 14, fontWeight: '800', color: '#1e293b' },
  appoSpec: { fontSize: 12, color: COLORS.secondary, fontWeight: '700', marginTop: 2 },
  appoLoc: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  appoLocText: { fontSize: 10, color: '#64748b', marginLeft: 4, fontWeight: '500' },
  appoDivider: { height: 1, backgroundColor: '#f1f5f9', marginVertical: 8 },
  appoFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  appoDateTimeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    gap: 6
  },
  dtText: { fontSize: 11, fontWeight: '700', color: '#334155' },
  dtDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#cbd5e1' },
  patientPhoneText: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
    marginTop: 1,
  },
  patientAvatarBg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12
  },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#10b981', marginRight: 6 },
  statusText: { fontSize: 10, fontWeight: '800', color: '#10b981', textTransform: 'uppercase' },
  horizontalScroll: { paddingLeft: 20 },
  horizontalScrollContent: {
    paddingLeft: 20,
    paddingRight: 4,
    paddingBottom: 12,
  },
  specialtyScrollContent: { paddingLeft: 20, paddingRight: 20, paddingBottom: 10 },
  specialtyCard: { width: 130, padding: 16, borderRadius: 20, backgroundColor: COLORS.white, marginRight: 16, elevation: 1, alignItems: 'center' },
  specialtyIconContainer: { width: 48, height: 48, borderRadius: 12, backgroundColor: '#f8fafc', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  specialtyTitle: { fontSize: 14, fontWeight: '800', color: '#1e293b' },
  specialtySubtitle: { fontSize: 11, color: '#94a3b8', marginTop: 2, fontWeight: '500' },
  sectionTitleBlock: {
    borderLeftWidth: 3,
    borderLeftColor: '#258ec8',
    paddingLeft: 10,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
    fontWeight: '500',
  },
  hospitalCard: {
    width: 320,
    height: 180,
    borderRadius: 24,
    backgroundColor: '#0f2d26', // Premium dark teal from mockup
    marginRight: 16,
    overflow: 'hidden',
    flexDirection: 'row',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    marginBottom: 10,
  },
  hospitalDetailsLeft: {
    flex: 1.25,
    padding: 16,
    justifyContent: 'space-between',
  },
  hospitalName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ffffff',
  },
  hospitalSpecialty: {
    fontSize: 11,
    color: '#a7f3d0', // soft emerald-200
    fontWeight: '600',
    marginTop: -2,
  },
  hospitalLocRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  hospitalLocText: {
    fontSize: 11,
    color: '#cbd5e1', // slate-300
    fontWeight: '500',
  },
  hospitalTimingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
    marginTop: 4,
  },
  hospitalTimingText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#34d399', // emerald-400
  },
  hospitalCallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#10b981', // green pill
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    gap: 6,
    marginTop: 8,
  },
  hospitalCallText: {
    fontSize: 11,
    color: '#ffffff',
    fontWeight: '800',
  },
  hospitalImageRight: {
    flex: 0.85,
    height: '100%',
  },
  hospitalImg: {
    width: '100%',
    height: '100%',
  },
  newVideoBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: '#10b981', // green
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    zIndex: 10,
  },
  newVideoBadgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  durationBadge: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    zIndex: 10,
  },
  durationBadgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '700',
  },
  footerSpacing: { height: 40 },
  noAppointmentCard: {
    marginHorizontal: 20,
    padding: 20,
    borderRadius: 24,
    backgroundColor: '#fff',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    borderWidth: 1,
    borderColor: '#f1f5f9'
  },
  noAppoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 16
  },
  calendarIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#eff6ff',
    justifyContent: 'center',
    alignItems: 'center'
  },
  noAppoInfo: {
    flex: 1
  },
  noAppoTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1e293b'
  },
  noAppoSub: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
    lineHeight: 18,
    fontWeight: '500'
  },
  noAppoBookBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.secondary,
    borderRadius: 12,
    paddingVertical: 12,
    gap: 6
  },
  noAppoBookBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13
  },
  videoSectionHeader: {
    paddingHorizontal: 20,
    marginTop: 28,
    marginBottom: 12,
  },
  videoSectionTitleBlock: {
    flex: 1,
    borderLeftWidth: 3,
    borderLeftColor: '#258ec8',
    paddingLeft: 10,
  },
  videoSectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1e293b',
  },
  videoSectionSubtitle: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
    fontWeight: '500',
  },
  socialFollowRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 18,
    gap: 12,
  },
  socialFollowBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 16,
    elevation: 2,
    shadowColor: '#0f172a',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  ytFollowBtn: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  igFollowBtn: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  socialIconSquircleYt: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  socialIconSquircleIg: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  socialFollowLabel: {
    fontSize: 9,
    color: '#64748b',
    fontWeight: '600',
  },
  socialFollowBrandYt: {
    fontSize: 13,
    fontWeight: '800',
    color: '#ff0000',
    marginTop: 1,
  },
  socialFollowBrandIg: {
    fontSize: 13,
    fontWeight: '800',
    color: '#db2777',
    marginTop: 1,
  },
  socialFollowSub: {
    fontSize: 8,
    color: '#64748b',
    marginTop: 2,
    fontWeight: '500',
  },
  videosScroll: {
    paddingLeft: 20,
    paddingRight: 4,
    paddingBottom: 15,
  },
  videoCardWrapper: {
    marginRight: 16,
  },
  videoCard: {
    width: 320,
    borderRadius: 24,
    backgroundColor: COLORS.white,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    borderWidth: 1,
    borderColor: '#f1f5f9',
    marginBottom: 8,
  },
  videoThumbnailContainer: {
    width: '100%',
    height: 140,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  videoThumbnail: {
    width: '100%',
    height: '100%',
    transform: [{ scale: 1.25 }],
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playCircleYt: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playCircleIg: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  igGradientBg: {
    backgroundColor: '#833ab4',
    flexDirection: 'column',
  },
  igWatermark: {
    opacity: 0.15,
    position: 'absolute',
    right: -10,
    top: -10,
  },
  videoDetails: {
    padding: 14,
  },
  videoBadgeRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  platformBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 5,
  },
  ytBadge: {
    backgroundColor: '#ffe4e6',
  },
  igBadge: {
    backgroundColor: '#fce7f3',
  },
  platformBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  videoCardTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1e293b',
    lineHeight: 17,
  },
  emptyVideosCard: {
    marginHorizontal: 20,
    padding: 18,
    borderRadius: 20,
    backgroundColor: COLORS.white,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  emptyIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.secondary + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyVideosTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1e293b',
  },
  emptyVideosText: {
    fontSize: 12,
    color: COLORS.muted,
    fontWeight: '500',
    lineHeight: 18,
    marginTop: 2,
  },
  walletCard: {
    marginHorizontal: 20,
    marginTop: 15,
    marginBottom: 5,
    padding: 16,
    borderRadius: 20,
    backgroundColor: '#1b3b6f', // Premium Deep Blue
    elevation: 8,
    shadowColor: '#1b3b6f',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  walletHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  walletIconContainer: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  walletTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.5,
  },
  walletSub: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.7)',
    fontWeight: '500',
  },
  walletValueBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(168, 206, 58, 0.25)', // Semi-transparent secondary color
    borderWidth: 1,
    borderColor: COLORS.secondary,
  },
  walletValueBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: COLORS.secondary,
  },
  walletBalanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  walletPointsLabel: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: '600',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  walletPointsText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#ffffff',
    textAlign: 'center',
    marginTop: 4,
  },
  walletDivider: {
    width: 1,
    height: 32,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  couponsSection: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.12)',
    paddingTop: 14,
  },
  couponsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  couponsSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.2,
  },
  couponsScrollContent: {
    paddingRight: 10,
    gap: 12,
  },
  couponTicket: {
    flexDirection: 'row',
    width: 155,
    height: 52,
    borderRadius: 10,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  couponLeft: {
    width: 58,
    backgroundColor: 'rgba(168, 206, 58, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  couponValue: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.primary,
    marginTop: 1,
  },
  couponValueSub: {
    fontSize: 8,
    fontWeight: '700',
    color: COLORS.primary,
    textTransform: 'uppercase',
  },
  couponSeparator: {
    width: 1,
    backgroundColor: '#e2e8f0',
    justifyContent: 'space-between',
    alignItems: 'center',
    position: 'relative',
  },
  couponDotTop: {
    position: 'absolute',
    top: -5,
    left: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#1b3b6f', // Matches card background
  },
  couponDotBottom: {
    position: 'absolute',
    bottom: -5,
    left: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#1b3b6f', // Matches card background
  },
  couponRight: {
    flex: 1,
    paddingHorizontal: 8,
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  couponCodeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1e293b',
  },
  couponExpText: {
    fontSize: 8,
    color: COLORS.muted,
    fontWeight: '600',
    marginTop: 2,
  },
  noCouponsContainer: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  noCouponsText: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.6)',
    fontStyle: 'italic',
    fontWeight: '500',
  },
  paymentRequestedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f0fdfa',
    padding: 12,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    borderTopWidth: 1,
    borderTopColor: '#ccfbf1',
  },
  paymentTextCol: {
    flex: 1,
    marginRight: 12,
  },
  paymentReqTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#115e59',
  },
  paymentReqSubtitle: {
    fontSize: 10,
    color: '#0d9488',
    marginTop: 2,
    fontWeight: '500',
  },
  paymentPayNowBtn: {
    backgroundColor: COLORS.secondary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    elevation: 2,
  },
  paymentPayNowBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },
  // Modal Styles
  payModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
  },
  payModalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 40,
    maxHeight: '90%',
  },
  payModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  payModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1e293b',
  },
  payCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
    alignItems: 'center',
  },
  paySummaryCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 20,
  },
  paySummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  paySummaryLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
  },
  paySummaryValue: {
    fontSize: 13,
    color: '#1e293b',
    fontWeight: '700',
  },
  payDivider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginVertical: 8,
  },
  paySummaryTotalLabel: {
    fontSize: 13,
    color: '#1e293b',
    fontWeight: '800',
  },
  paySummaryTotalValue: {
    fontSize: 16,
    color: COLORS.secondary,
    fontWeight: '800',
  },
  paySubmitBtn: {
    backgroundColor: COLORS.secondary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
  },
  paySubmitBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  paySuccessContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  paySuccessIconBg: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#ecfdf5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  paySuccessTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#10b981',
    marginBottom: 6,
  },
  paySuccessSub: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  payRewardTicket: {
    width: '100%',
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#334155',
  },
  payRewardPointsCol: {
    flex: 1,
  },
  payRewardPointsLabel: {
    fontSize: 10,
    color: '#38bdf8',
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  payRewardPointsVal: {
    fontSize: 22,
    fontWeight: '800',
    color: '#ffffff',
    marginTop: 2,
  },
  payRewardCouponCol: {
    flex: 1.2,
    alignItems: 'flex-end',
    borderLeftWidth: 1,
    borderLeftColor: '#334155',
    paddingLeft: 16,
  },
  payRewardCouponLabel: {
    fontSize: 9,
    color: '#94a3b8',
    fontWeight: '700',
  },
  payRewardCouponCode: {
    fontSize: 14,
    fontWeight: '800',
    color: '#a8ce3a',
    marginTop: 4,
  },
  payCopyBtn: {
    backgroundColor: '#334155',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 6,
  },
  payCopyBtnText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '800',
  },
  paySuccessDoneBtn: {
    width: '100%',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 24,
  },
  paySuccessDoneText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  premiumPaymentCard: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 20,
    backgroundColor: '#eff6ff', // Light SPH Blue background
    borderWidth: 1,
    borderColor: '#dbeafe', // Soft border
    overflow: 'hidden',
  },
  premiumPaymentContainer: {
    padding: 16,
  },
  premiumPaymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  premiumPaymentIconBg: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(37, 142, 200, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: 'rgba(37, 142, 200, 0.2)',
  },
  premiumPaymentTextContainer: {
    flex: 1,
  },
  premiumPaymentTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.primary, // SPH Blue
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  premiumPaymentDesc: {
    fontSize: 12,
    color: '#1e293b', // Dark text for light background
    marginTop: 4,
    fontWeight: '600',
  },
  premiumPaymentFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(37, 142, 200, 0.15)', // SPH Blue tint border
  },
  premiumPaymentNote: {
    fontSize: 9,
    color: COLORS.muted,
    fontWeight: '600',
    maxWidth: '65%',
  },
  premiumPayButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primary, // SPH Blue
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  premiumPayButtonText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#ffffff',
    marginRight: 4,
  },
  confirmModalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '85%',
    maxWidth: 340,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    alignSelf: 'center',
  },
  confirmHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  confirmTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e293b',
  },
  confirmBody: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 20,
    marginBottom: 20,
  },
  confirmCheckboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  confirmCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  confirmCheckboxChecked: {
    backgroundColor: '#ef4444',
  },
  confirmCheckboxLabel: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '600',
    flex: 1,
  },
  confirmActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  confirmCancelBtn: {
    borderRadius: 10,
  },
  confirmSubmitBtn: {
    borderRadius: 10,
  },
});

export default HomeScreen;