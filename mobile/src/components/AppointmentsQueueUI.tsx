import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Linking,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
} from 'react-native';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { getSafeDb, collection, onSnapshot, doc, updateDoc, query, limit } from '../utils/firebaseSafe';
import { sendRescheduleWhatsAppNotification, sendCancellationWhatsAppNotification, sendInvoiceReceiptWhatsAppNotification, sendExperienceWhatsAppNotification, sendInvoiceWhatsAppNotification, sendRescheduleSMS, sendCancellationSMS } from '@app/shared';
import { DEFAULT_DOCTORS_SEED } from '../screens/Reception/BookAppointment/BookAppointmentScreen';
import { getPatientVisitState, isAppAppointment } from '../utils/patientVisitState';
import { receptionDataStore } from '../utils/receptionDataStore';
export interface PatientAppointmentRecord {
  id: string;
  name: string;
  phone: string;
  regId: string;
  doctor: string;
  time: string;
  date: string;
  status: 'upcoming' | 'active' | 'completed' | 'collect_fee';
  branch: string;
  mode?: string;
  queueOrder?: number;
  visitState?: any;
  [key: string]: any;
}
interface AppointmentsQueueUIProps {
  patients?: PatientAppointmentRecord[];
  allRecords?: any[];
  packageMembers?: any[];
  onSelectPatient?: (patient: PatientAppointmentRecord) => void;
  onViewPatientFile?: (patient: PatientAppointmentRecord) => void;
}
export const AppointmentsQueueUI: React.FC<AppointmentsQueueUIProps> = ({
  patients = [],
  allRecords,
  packageMembers,
  onSelectPatient,
  onViewPatientFile,
}) => {
  const [allCollectionsPool, setAllCollectionsPool] = useState<any[]>(() => (allRecords && allRecords.length > 0) ? allRecords : receptionDataStore.getAllCollectionsPool());
  const [packageMembersList, setPackageMembersList] = useState<any[]>(() => (packageMembers && packageMembers.length > 0) ? packageMembers : receptionDataStore.getPackageMembers());
  const [activeTab, setActiveTab] = useState<'upcoming' | 'active' | 'completed'>('active');

  const getTodayDateStr = () => {
    const today = new Date();
    const d = String(today.getDate()).padStart(2, '0');
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const y = today.getFullYear();
    return `${d}-${m}-${y}`;
  };
  const getTomorrowDateStr = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const d = String(tomorrow.getDate()).padStart(2, '0');
    const m = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const y = tomorrow.getFullYear();
    return `${d}-${m}-${y}`;
  };
  // Reschedule Modal States
  const [rescheduleModalOpen, setRescheduleModalOpen] = useState(false);
  const [selectedRescheduleAppt, setSelectedRescheduleAppt] = useState<PatientAppointmentRecord | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState(getTodayDateStr());
  const [rescheduleTime, setRescheduleTime] = useState('11:00 AM');
  const [rescheduleDoctor, setRescheduleDoctor] = useState('Dr. Prashanth K Vaidya');
  const [rescheduleCalOpen, setRescheduleCalOpen] = useState(false);
  const [rescheduleCalMonth, setRescheduleCalMonth] = useState<Date>(new Date());
  const [doctorDropdownOpen, setDoctorDropdownOpen] = useState(false);
  const [liveDoctorsData, setLiveDoctorsData] = useState<any[]>(DEFAULT_DOCTORS_SEED);
  // Subscribe to real-time Firestore doctors collection
  useEffect(() => {
    const activeDb = getSafeDb();
    if (!activeDb) return;
    try {
      const colRef = collection(activeDb, 'doctors');
      const unsubscribe = onSnapshot(colRef, (snapshot) => {
        const list: any[] = [];
        if (!snapshot.empty) {
          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const seedFallback = DEFAULT_DOCTORS_SEED.find(s => s.id === docSnap.id || s.name === data.name || s.name === data.doctorName);
            list.push({
              id: docSnap.id,
              name: data.name || data.doctorName || seedFallback?.name || 'Doctor',
              role: data.role || seedFallback?.role || 'Homeopathy Physician',
              branch: data.branch || data.assignedBranch || (seedFallback as any)?.branch || '',
              branchSchedules: (data.branchSchedules && Array.isArray(data.branchSchedules) && data.branchSchedules.length > 0)
                ? data.branchSchedules
                : (seedFallback?.branchSchedules || []),
            });
          });
        }
        DEFAULT_DOCTORS_SEED.forEach((seed) => {
          if (!list.some(d => d.name === seed.name || d.id === seed.id)) {
            list.push(seed);
          }
        });

        setLiveDoctorsData(list);
      }, (err) => {
        console.warn('Doctors listener error:', err);
        setLiveDoctorsData(DEFAULT_DOCTORS_SEED);
      });
      return () => unsubscribe();
    } catch (e) {
      console.warn('Doctors subscribe notice:', e);
      setLiveDoctorsData(DEFAULT_DOCTORS_SEED);
    }
  }, []);

  // Connect to persistent receptionDataStore singleton (keeps cache static, zero duplicate network listeners)
  useEffect(() => {
    receptionDataStore.startListeners();
    const unsub = receptionDataStore.subscribe((state) => {
      if (!allRecords || allRecords.length === 0) setAllCollectionsPool(state.allCollectionsPool);
      if (!packageMembers || packageMembers.length === 0) setPackageMembersList(state.packageMembersList);
    });
    return () => unsub();
  }, [allRecords, packageMembers]);

  // Helper to convert DD-MM-YYYY to DayName ('Sun' | 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat')
  const getDayNameFromDateStr = (dateStr: string): string => {
    if (!dateStr) return 'Mon';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10);
      if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
        const d = new Date(year, month, day);
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        return days[d.getDay()];
      }
    }
    return 'Mon';
  };

  // Dynamically derive available doctors ONLY for the selected branch AND selected day schedule
  const availableDoctorsList = React.useMemo(() => {
    const targetBranchNorm = (selectedRescheduleAppt?.branch || '').toLowerCase().replace(/\s*branch\s*|\s*clinic\s*/gi, '').trim();
    const dayName = getDayNameFromDateStr(rescheduleDate);
    const set = new Set<string>();

    liveDoctorsData.forEach((docData) => {
      const docName = docData.name || docData.doctorName;
      if (!docName) return;

      // 1. Check branchSchedules for matching targetBranch & daySchedule availability
      if (docData.branchSchedules && Array.isArray(docData.branchSchedules) && docData.branchSchedules.length > 0) {
        const matchBs = docData.branchSchedules.find((bs: any) => {
          const bsBranch = (bs.targetBranch || bs.branch || '').toLowerCase().replace(/\s*branch\s*|\s*clinic\s*/gi, '').trim();
          return !targetBranchNorm || !bsBranch || bsBranch.includes(targetBranchNorm) || targetBranchNorm.includes(bsBranch);
        });

        if (matchBs && matchBs.daySchedules) {
          const daySched = matchBs.daySchedules[dayName];
          if (daySched && daySched.status === 'Available' && daySched.slots && daySched.slots.length > 0) {
            set.add(docName);
          }
          return; // Strictly evaluated via branchSchedules
        }
      }

      // 2. Fallback check: Doctor assigned main branch (only if doctor branch matches target branch)
      const docBranch = (docData.branch || docData.assignedBranch || '').toLowerCase().replace(/\s*branch\s*|\s*clinic\s*/gi, '').trim();
      if (targetBranchNorm && docBranch && (docBranch.includes(targetBranchNorm) || targetBranchNorm.includes(docBranch))) {
        set.add(docName);
      }
    });

    return Array.from(set);
  }, [liveDoctorsData, rescheduleDate, selectedRescheduleAppt]);

  // Auto-reset selected doctor if current doctor is not available on changed date/branch
  useEffect(() => {
    if (availableDoctorsList.length > 0 && !availableDoctorsList.includes(rescheduleDoctor)) {
      setRescheduleDoctor(availableDoctorsList[0]);
    }
  }, [availableDoctorsList, rescheduleDoctor]);

  const RESCHEDULE_TIME_SLOTS = [
    '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM',
    '12:00 PM', '12:30 PM', '04:00 PM', '04:30 PM',
    '05:00 PM', '05:30 PM', '06:00 PM', '06:30 PM',
  ];

  const parseTimeToMinutes = (hourStr: string, minStr: string, ampm: string): number => {
    let h = parseInt(hourStr, 10) || 10;
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

  const generate15MinSlotsFromRanges = (slotRanges: any[]): string[] => {
    const result: string[] = [];
    if (!Array.isArray(slotRanges)) return result;
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

  const rescheduleTimeSlots = React.useMemo(() => {
    if (!rescheduleDoctor) return RESCHEDULE_TIME_SLOTS;

    const normDocName = rescheduleDoctor.toLowerCase().trim();
    const docData = liveDoctorsData.find((d) => (d.name || d.doctorName || '').toLowerCase().trim() === normDocName);
    const dayName = getDayNameFromDateStr(rescheduleDate);
    const targetBranchNorm = (selectedRescheduleAppt?.branch || '').toLowerCase().replace(/\s*branch\s*|\s*clinic\s*/gi, '').trim();

    if (docData && docData.branchSchedules && Array.isArray(docData.branchSchedules)) {
      const matchBs = docData.branchSchedules.find((bs: any) => {
        const bsBranch = (bs.targetBranch || bs.branch || '').toLowerCase().replace(/\s*branch\s*|\s*clinic\s*/gi, '').trim();
        return !targetBranchNorm || !bsBranch || bsBranch.includes(targetBranchNorm) || targetBranchNorm.includes(bsBranch);
      });

      if (matchBs && matchBs.daySchedules && matchBs.daySchedules[dayName]) {
        const daySched = matchBs.daySchedules[dayName];
        if (daySched.status === 'Available' && daySched.slots && daySched.slots.length > 0) {
          const generated = generate15MinSlotsFromRanges(daySched.slots);
          if (generated.length > 0) {
            return generated;
          }
        }
      }
    }

    return RESCHEDULE_TIME_SLOTS;
  }, [rescheduleDoctor, liveDoctorsData, rescheduleDate, selectedRescheduleAppt]);

  const getSlotCapacityInfo = (slotTimeStr: string) => {
    const normSelectedDoc = (rescheduleDoctor || '').toLowerCase().trim();
    const bookedCount = patients.filter((app) => {
      const normAppDoc = (app.doctor || '').toLowerCase().trim();
      const sameDoc = normAppDoc === normSelectedDoc;
      const sameDate = (app.date || '') === rescheduleDate;
      const sameTime = (app.time || '').trim() === slotTimeStr.trim();
      const notCancelled = app.status !== ('cancelled' as any);
      return sameDoc && sameDate && sameTime && notCancelled;
    }).length;

    const remainingSlots = Math.max(0, 3 - bookedCount);
    return {
      bookedCount,
      remainingSlots,
      isFull: remainingSlots === 0
    };
  };

  // Open Reschedule Modal Handler
  const handleOpenRescheduleModal = (patient: PatientAppointmentRecord) => {
    setSelectedRescheduleAppt(patient);
    setRescheduleDate(patient.date || getTodayDateStr());
    setRescheduleTime(patient.time || '11:00 AM');
    setRescheduleDoctor(patient.doctor || 'Dr. Prashanth K Vaidya');
    setRescheduleCalOpen(false);
    setRescheduleModalOpen(true);
  };

  // Confirm Reschedule in Firestore Handler
  const handleConfirmReschedule = async () => {
    if (!selectedRescheduleAppt) return;
    const docId = selectedRescheduleAppt.id;
    try {
      const payload = {
        appointmentDate: rescheduleDate,
        dateString: rescheduleDate,
        appointmentTime: rescheduleTime,
        timeSlot: rescheduleTime,
        doctorName: rescheduleDoctor,
        doctor: rescheduleDoctor,
        status: 'upcoming', // Reset status to upcoming
        updatedAt: new Date().toISOString(),
      };
      // Update in appointments collection
      const activeDb = getSafeDb();
      try {
        await updateDoc(doc(activeDb, 'appointments', docId), payload);
      } catch (e) { }
      // Update in allpatients collection
      try {
        await updateDoc(doc(activeDb, 'allpatients', docId), payload);
      } catch (e) { }

      // Trigger Leonas WhatsApp Reschedule Notification
      sendRescheduleWhatsAppNotification({
        patientName: selectedRescheduleAppt.name || (selectedRescheduleAppt as any).patientName || 'Patient',
        phone: selectedRescheduleAppt.phone || (selectedRescheduleAppt as any).phoneNumber || '',
        date: rescheduleDate,
        time: rescheduleTime,
        doctorName: rescheduleDoctor,
        branch: selectedRescheduleAppt.branch || 'KPHB'
      }).catch(err => console.error('WhatsApp reschedule notification error:', err));

      // Trigger SMS Reschedule Notification
      const targetReschedulePhone = selectedRescheduleAppt.phone || (selectedRescheduleAppt as any).phoneNumber || '';
      const targetRescheduleName = selectedRescheduleAppt.name || (selectedRescheduleAppt as any).patientName || 'Patient';
      if (targetReschedulePhone) {
        sendRescheduleSMS(
          targetReschedulePhone,
          targetRescheduleName,
          rescheduleDoctor,
          rescheduleDate,
          rescheduleTime,
          selectedRescheduleAppt.branch || 'KPHB'
        ).catch(err => console.warn('SMS reschedule notification notice:', err));
      }

      Alert.alert('Rescheduled', `Appointment for ${selectedRescheduleAppt.name} rescheduled to ${rescheduleDate} at ${rescheduleTime}.`);
      setRescheduleModalOpen(false);
    } catch (err) {
      console.error('Reschedule error:', err);
      Alert.alert('Error', 'Failed to reschedule appointment in Firestore.');
    }
  };

  const filteredPatients = React.useMemo(() => {
    return patients.filter(p => p.status === activeTab).sort((a, b) => {
      if (a.queueOrder !== undefined && b.queueOrder !== undefined) {
        return a.queueOrder - b.queueOrder;
      }
      return 0;
    });
  }, [patients, activeTab]);

  const patientVisitStates = React.useMemo(() => {
    const recordsToCheck = (allRecords && allRecords.length > 0)
      ? allRecords
      : (allCollectionsPool.length > 0 ? allCollectionsPool : patients);
    const pkgsToCheck = (packageMembers && packageMembers.length > 0)
      ? packageMembers
      : packageMembersList;
    const map = new Map<string, any>();
    for (const p of filteredPatients) {
      if (p.visitState) {
        map.set(p.id, p.visitState);
      } else {
        map.set(p.id, getPatientVisitState(p, recordsToCheck, pkgsToCheck));
      }
    }
    return map;
  }, [filteredPatients, allRecords, allCollectionsPool, packageMembers, packageMembersList]);

  // Handler for shifting patient queue position (Up / Down) in Firestore
  const handleShiftQueueOrder = async (patient: PatientAppointmentRecord, direction: 'up' | 'down') => {
    const upcomingList = filteredPatients;
    const listIndex = upcomingList.findIndex(item => item.id === patient.id);
    if (listIndex === -1) return;
    const targetIndex = direction === 'up' ? listIndex - 1 : listIndex + 1;
    if (targetIndex < 0 || targetIndex >= upcomingList.length) return;
    const currentApp = upcomingList[listIndex];
    const targetApp = upcomingList[targetIndex];
    try {
      const currentOrder = listIndex + 1;
      const targetOrder = targetIndex + 1;
      // Swap queue orders in Firestore (appointments & allpatients)
      const activeDb = getSafeDb();
      try {
        await updateDoc(doc(activeDb, 'appointments', currentApp.id), { queueOrder: targetOrder, updatedAt: new Date().toISOString() });
      } catch (e) {
        await updateDoc(doc(activeDb, 'allpatients', currentApp.id), { queueOrder: targetOrder, updatedAt: new Date().toISOString() });
      }
      try {
        await updateDoc(doc(activeDb, 'appointments', targetApp.id), { queueOrder: currentOrder, updatedAt: new Date().toISOString() });
      } catch (e) {
        await updateDoc(doc(activeDb, 'allpatients', targetApp.id), { queueOrder: currentOrder, updatedAt: new Date().toISOString() });
      }
    } catch (err) {
      console.error('Error shifting queue order:', err);
    }
  };

  const handleCall = (phone: string) => {
    if (!phone) {
      Alert.alert('No Phone', 'No phone number available for this patient.');
      return;
    }
    Linking.openURL(`tel:${phone}`).catch(() => Alert.alert('Error', 'Unable to make call'));
  };

  const handleWhatsApp = (phone: string, name: string) => {
    if (!phone) {
      Alert.alert('No Phone', 'No phone number available for WhatsApp.');
      return;
    }
    const cleanPhone = phone.replace(/\D/g, '').slice(-10);
    const msg = `Hello ${name}, regarding your appointment at Spiritual Homeopathy Clinic.`;
    Linking.openURL(`https://wa.me/91${cleanPhone}?text=${encodeURIComponent(msg)}`).catch(() => Alert.alert('Error', 'Unable to open WhatsApp'));
  };

  const handleDeleteAppointment = (patientId: string, patientName: string) => {
    Alert.alert(
      'Delete Appointment',
      `Are you sure you want to delete the appointment for ${patientName}? It can be restored within 24 hours from the Upcoming tab.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const targetApp = patients.find(p => p.id === patientId);
              const targetBranch = targetApp?.branch || 'KPHB';
              if (targetApp) {
                sendCancellationWhatsAppNotification({
                  patientName: targetApp.name || 'Patient',
                  phone: targetApp.phone || '',
                  date: targetApp.date || '',
                  time: targetApp.time || '10:00 AM',
                  doctorName: targetApp.doctor,
                  branch: targetBranch
                }).catch(err => console.error('Cancellation WhatsApp notification error:', err));

                sendCancellationSMS(
                  targetApp.phone || '',
                  targetApp.name || 'Patient',
                  targetApp.doctor,
                  targetApp.date || '',
                  targetApp.time || '10:00 AM',
                  targetBranch
                ).catch(err => console.warn('Cancellation SMS notification notice:', err));
              }

              const payload = {
                isDeleted: true,
                deletedAt: new Date().toISOString(),
                deletedByBranch: targetBranch,
                previousStatus: targetApp?.status || 'waiting',
                status: 'deleted',
                updatedAt: new Date().toISOString()
              };

              const activeDb = getSafeDb();
              try {
                await updateDoc(doc(activeDb, 'appointments', patientId), payload);
              } catch (e) { }
              try {
                await updateDoc(doc(activeDb, 'allpatients', patientId), payload);
              } catch (e) { }
              Alert.alert('Moved to Recycle Bin', 'Appointment deleted. You can restore it within 24 hours from the Upcoming tab.');
            } catch (err) {
              console.error('Error deleting appointment:', err);
              Alert.alert('Error', 'Could not delete appointment from Firestore.');
            }
          },
        },
      ]
    );
  };

  const handleUpdateStatus = async (docId: string, newStatus: 'active' | 'completed' | 'upcoming') => {
    try {
      const activeDb = getSafeDb();
      try {
        const appRef = doc(activeDb, 'appointments', docId);
        await updateDoc(appRef, {
          status: newStatus,
          updatedAt: new Date().toISOString(),
        });
      } catch (e) {
        const patRef = doc(activeDb, 'allpatients', docId);
        await updateDoc(patRef, {
          status: newStatus,
          updatedAt: new Date().toISOString(),
        });
      }

      if (newStatus === 'completed') {
        const targetApp = patients.find(p => p.id === docId);
        if (targetApp) {
          // Trigger Full 3-Step WhatsApp Flow (Payment Receipt -> Invoice with PDF -> 5s -> Experience Feedback Survey)
          sendInvoiceWhatsAppNotification({
            patientName: targetApp.name || 'Patient',
            phone: targetApp.phone || '',
            invoiceId: targetApp.id,
            totalPaid: Number(targetApp.targetAmount || (targetApp as any).totalPaid || 1000),
            paymentMode: (targetApp as any).paymentMode || 'UPI',
            branch: targetApp.branch || 'KPHB',
            doctorName: targetApp.doctorName || targetApp.assignedDoctor || 'Dr. Prashanth K Vaidya'
          }).then(res => {
            const generatedPdfUrl = (res as any)?.pdfUrl;
            if (generatedPdfUrl && activeDb) {
              updateDoc(doc(activeDb, 'appointments', targetApp.id), { invoicePdfUrl: generatedPdfUrl }).catch(() => {});
              updateDoc(doc(activeDb, 'allpatients', targetApp.id), { invoicePdfUrl: generatedPdfUrl }).catch(() => {});
            }
          }).catch(e => console.error('WhatsApp invoice flow error:', e));
        }
      }

      Alert.alert('Status Updated', `Patient appointment marked as ${newStatus}.`);
    } catch (err) {
      console.error('Error updating status:', err);
      Alert.alert('Update Failed', 'Could not update appointment status in Firestore.');
    }
  };

  return (
    <View style={styles.container}>
      {/* 1. QUEUE TAB SWITCHER HEADER */}
      <View style={styles.tabContainer}>
        {/* Active Consultation Tab */}
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'active' && styles.tabBtnActive]}
          onPress={() => setActiveTab('active')}
        >
          <MaterialCommunityIcons name="stethoscope" size={16} color={activeTab === 'active' ? '#ffffff' : '#64748b'} />
          <Text style={[styles.tabText, activeTab === 'active' && styles.tabTextActive]}>
            Active ({patients.filter(p => p.status === 'active').length})
          </Text>
        </TouchableOpacity>

        {/* Upcoming Appointments Tab */}
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'upcoming' && styles.tabBtnActive]}
          onPress={() => setActiveTab('upcoming')}
        >
          <Feather name="clock" size={16} color={activeTab === 'upcoming' ? '#ffffff' : '#64748b'} />
          <Text style={[styles.tabText, activeTab === 'upcoming' && styles.tabTextActive]}>
            Upcoming ({patients.filter(p => p.status === 'upcoming').length})
          </Text>
        </TouchableOpacity>

        {/* Completed Today Tab */}
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'completed' && styles.tabBtnActive]}
          onPress={() => setActiveTab('completed')}
        >
          <Feather name="check-circle" size={16} color={activeTab === 'completed' ? '#ffffff' : '#64748b'} />
          <Text style={[styles.tabText, activeTab === 'completed' && styles.tabTextActive]}>
            Done ({patients.filter(p => p.status === 'completed').length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* 2. PATIENT LIST QUEUE CONTAINER */}
      <ScrollView contentContainerStyle={styles.listContainer} nestedScrollEnabled showsVerticalScrollIndicator={false}>
        {filteredPatients.length > 0 ? (
          filteredPatients.map((patient, index) => (
            <View key={patient.id} style={styles.patientCard}>

              {/* Card Header Row */}
              <View style={styles.cardHeader}>
                <View style={styles.patientAvatarCircle}>
                  <Text style={styles.avatarText}>
                    {(patient.name || 'P').substring(0, 2).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.patientMainInfo}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Text style={styles.patientName}>{patient.name}</Text>
                    {(() => {
                      const vState = patient.visitState || patientVisitStates.get(patient.id);
                      if (!vState) return null;
                      const isApp = vState.isApp || isAppAppointment(patient);
                      return (
                        <>
                          <View style={{ backgroundColor: vState.badgeBg, borderWidth: 1, borderColor: vState.badgeBorder, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
                            <Text style={{ fontSize: 9.5, fontWeight: '900', color: vState.badgeColor }}>{vState.badgeText}</Text>
                          </View>
                          {isApp ? (
                            <View style={{ backgroundColor: '#f3e8ff', borderWidth: 1, borderColor: '#d8b4fe', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
                              <Text style={{ fontSize: 9.5, fontWeight: '900', color: '#7e22ce' }}>APP</Text>
                            </View>
                          ) : null}
                        </>
                      );
                    })()}
                  </View>
                  <Text style={styles.patientMeta}>
                    {patient.status === 'upcoming' ? (
                      patient.phone
                    ) : (
                      <>Reg: <Text style={{ color: '#258ec8', fontWeight: '700' }}>{patient.regId || 'N/A'}</Text> • {patient.phone}</>
                    )}
                  </Text>
                </View>
                {patient.status === 'upcoming' ? (
                  <TouchableOpacity
                    style={[styles.statusBadge, { backgroundColor: '#258ec8', borderColor: '#1d709e' }]}
                    onPress={() => {
                      handleUpdateStatus(patient.id, 'active');
                      if (onViewPatientFile) onViewPatientFile(patient);
                      else if (onSelectPatient) onSelectPatient(patient);
                    }}
                  >
                    <Text style={[styles.statusBadgeText, { color: '#ffffff', fontWeight: '800' }]}>
                      START CONSULTATION
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[
                      styles.statusBadge,
                      patient.status === 'active' && { backgroundColor: '#e0f2fe', borderColor: '#bae6fd' },
                      patient.status === 'completed' && { backgroundColor: '#dcfce7', borderColor: '#bbf7d0' },
                    ]}
                    onPress={() => {
                      if (onViewPatientFile) onViewPatientFile(patient);
                      else if (onSelectPatient) onSelectPatient(patient);
                    }}
                  >
                    <Text style={[
                      styles.statusBadgeText,
                      patient.status === 'active' && { color: '#0284c7' },
                      patient.status === 'completed' && { color: '#166534' },
                    ]}>
                      {patient.status === 'active' && '⚡ IN CONSULTATION'}
                      {patient.status === 'completed' && 'COMPLETED ✓'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Card Details Grid (Doctor, Time, Branch) */}
              <View style={styles.detailsRow}>
                <View style={styles.detailItem}>
                  <MaterialCommunityIcons name="stethoscope" size={14} color="#64748b" />
                  <Text style={styles.detailText}>{patient.doctor || 'Doctor'}</Text>
                </View>

                <View style={styles.detailItem}>
                  <Feather name="clock" size={14} color="#64748b" />
                  <Text style={styles.detailText}>{patient.time || '10:00 AM'}</Text>
                </View>

                <View style={styles.detailItem}>
                  <Feather name="map-pin" size={14} color="#64748b" />
                  <Text style={styles.detailText}>{patient.branch || 'Clinic'}</Text>
                </View>
              </View>

              {/* Card Action Buttons (Call, WhatsApp, Delete, Dynamic Status Changer, Details) */}
              <View style={styles.actionRow}>
                {/* View Patient File Folder Icon */}
                <TouchableOpacity
                  style={[styles.rescheduleIconBtn, { backgroundColor: '#e0f2fe' }]}
                  onPress={() => {
                    if (onViewPatientFile) onViewPatientFile(patient);
                    else if (onSelectPatient) onSelectPatient(patient);
                  }}
                >
                  <MaterialCommunityIcons name="folder-account-outline" size={18} color="#0284c7" />
                </TouchableOpacity>
                {/* UP & DOWN QUEUE SHIFT ARROWS (Upcoming Queue Only) */}
                {patient.status === 'upcoming' && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                    {/* Move Up Button */}
                    <TouchableOpacity
                      disabled={index === 0}
                      style={[styles.arrowIconBtn, index === 0 && { opacity: 0.3 }]}
                      onPress={() => handleShiftQueueOrder(patient, 'up')}
                    >
                      <Feather name="arrow-up" size={16} color={index === 0 ? '#94a3b8' : '#ffffff'} />
                    </TouchableOpacity>
                    {/* Move Down Button */}
                    <TouchableOpacity
                      disabled={index === filteredPatients.length - 1}
                      style={[styles.arrowIconBtn, index === filteredPatients.length - 1 && { opacity: 0.3 }]}
                      onPress={() => handleShiftQueueOrder(patient, 'down')}
                    >
                      <Feather name="arrow-down" size={16} color={index === filteredPatients.length - 1 ? '#94a3b8' : '#ffffff'} />
                    </TouchableOpacity>
                  </View>
                )}

                <TouchableOpacity
                  style={styles.callIconBtn}
                  onPress={() => handleCall(patient.phone)}
                >
                  <Feather name="phone" size={18} color="#258ec8" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.waIconBtn}
                  onPress={() => handleWhatsApp(patient.phone, patient.name)}
                >
                  <MaterialCommunityIcons name="whatsapp" size={19} color="#22c55e" />
                </TouchableOpacity>

                {patient.status === 'upcoming' && (
                  <TouchableOpacity
                    style={styles.rescheduleIconBtn}
                    onPress={() => handleOpenRescheduleModal(patient)}
                  >
                    <Feather name="calendar" size={18} color="#258ec8" />
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={styles.deleteIconBtn}
                  onPress={() => handleDeleteAppointment(patient.id, patient.name)}
                >
                  <Feather name="trash-2" size={18} color="#ef4444" />
                </TouchableOpacity>
              </View>
            </View>
          ))
        ) : (
          <View style={styles.emptyContainer}>
            <Feather name="calendar" size={36} color="#cbd5e1" />
            <Text style={styles.emptyText}>No {activeTab} appointments found today</Text>
          </View>
        )}
      </ScrollView>

      {/* RESCHEDULE APPOINTMENT MODAL */}
      <Modal
        visible={rescheduleModalOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setRescheduleModalOpen(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setRescheduleModalOpen(false)}
        >
          <View style={[styles.modalCard, { maxHeight: '90%' }]} onStartShouldSetResponder={() => true}>

            {/* Modal Header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <View>
                <Text style={{ fontSize: 16, fontWeight: '800', color: '#0f172a' }}>Reschedule Appointment</Text>
                <Text style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                  {selectedRescheduleAppt?.name} {selectedRescheduleAppt?.regId ? `(${selectedRescheduleAppt?.regId})` : ''}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setRescheduleModalOpen(false)}>
                <Feather name="x" size={20} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 10 }}>

              {/* 1. SELECT NEW DATE */}
              <Text style={styles.fieldLabel}>Select New Date</Text>

              {/* Quick Date Shortcuts & Calendar Toggle */}
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
                <TouchableOpacity
                  style={[
                    styles.quickDateBtn,
                    rescheduleDate === getTodayDateStr() && styles.quickDateBtnActive
                  ]}
                  onPress={() => {
                    setRescheduleDate(getTodayDateStr());
                    setRescheduleCalOpen(false);
                  }}
                >
                  <Ionicons name="calendar-outline" size={13} color={rescheduleDate === getTodayDateStr() ? '#ffffff' : '#258ec8'} />
                  <Text style={[styles.quickDateText, rescheduleDate === getTodayDateStr() && styles.quickDateTextActive]}>
                    Today ({getTodayDateStr()})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.quickDateBtn,
                    rescheduleDate === getTomorrowDateStr() && styles.quickDateBtnActive
                  ]}
                  onPress={() => {
                    setRescheduleDate(getTomorrowDateStr());
                    setRescheduleCalOpen(false);
                  }}
                >
                  <Ionicons name="time-outline" size={13} color={rescheduleDate === getTomorrowDateStr() ? '#ffffff' : '#258ec8'} />
                  <Text style={[styles.quickDateText, rescheduleDate === getTomorrowDateStr() && styles.quickDateTextActive]}>
                    Tomorrow
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.quickDateBtn,
                    { flex: 0.8 },
                    rescheduleCalOpen && styles.quickDateBtnActive
                  ]}
                  onPress={() => setRescheduleCalOpen(!rescheduleCalOpen)}
                >
                  <Feather name="calendar" size={13} color={rescheduleCalOpen ? '#ffffff' : '#258ec8'} />
                  <Text style={[styles.quickDateText, rescheduleCalOpen && styles.quickDateTextActive]}>
                    Calendar
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Selected Date Box */}
              <View style={styles.inputBox}>
                <Feather name="calendar" size={15} color="#258ec8" style={{ marginRight: 8 }} />
                <TextInput
                  style={styles.inputText}
                  value={rescheduleDate}
                  onChangeText={setRescheduleDate}
                  placeholder="DD-MM-YYYY"
                />
              </View>

              {/* Full Month Calendar Grid Toggle */}
              {rescheduleCalOpen && (
                <View style={{ marginTop: 10, padding: 10, backgroundColor: '#f8fafc', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0' }}>
                  {/* Month Navigation */}
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <TouchableOpacity onPress={() => setRescheduleCalMonth(new Date(rescheduleCalMonth.getFullYear(), rescheduleCalMonth.getMonth() - 1, 1))}>
                      <Feather name="chevron-left" size={16} color="#258ec8" />
                    </TouchableOpacity>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: '#0f172a' }}>
                      {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][rescheduleCalMonth.getMonth()]} {rescheduleCalMonth.getFullYear()}
                    </Text>
                    <TouchableOpacity onPress={() => setRescheduleCalMonth(new Date(rescheduleCalMonth.getFullYear(), rescheduleCalMonth.getMonth() + 1, 1))}>
                      <Feather name="chevron-right" size={16} color="#258ec8" />
                    </TouchableOpacity>
                  </View>

                  {/* Day Headers */}
                  <View style={{ flexDirection: 'row', marginBottom: 6 }}>
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                      <View key={i} style={{ flex: 1, alignItems: 'center' }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: '#64748b' }}>{d}</Text>
                      </View>
                    ))}
                  </View>

                  {/* Day Cells */}
                  {(() => {
                    const y = rescheduleCalMonth.getFullYear();
                    const m = rescheduleCalMonth.getMonth();
                    const daysInMonth = new Date(y, m + 1, 0).getDate();
                    const firstDay = new Date(y, m, 1).getDay();
                    const cells = [];
                    for (let i = 0; i < firstDay; i++) {
                      cells.push(<View key={`empty-${i}`} style={{ width: '14.28%', height: 30 }} />);
                    }
                    for (let d = 1; d <= daysInMonth; d++) {
                      const dStr = `${String(d).padStart(2, '0')}-${String(m + 1).padStart(2, '0')}-${y}`;
                      const isSel = rescheduleDate === dStr;
                      cells.push(
                        <TouchableOpacity
                          key={`d-${d}`}
                          style={{ width: '14.28%', height: 30, justifyContent: 'center', alignItems: 'center' }}
                          onPress={() => {
                            setRescheduleDate(dStr);
                            setRescheduleCalOpen(false);
                          }}
                        >
                          <View style={[{ width: 26, height: 26, borderRadius: 13, justifyContent: 'center', alignItems: 'center' }, isSel && { backgroundColor: '#258ec8' }]}>
                            <Text style={[{ fontSize: 11, fontWeight: '600', color: '#334155' }, isSel && { color: '#ffffff', fontWeight: '800' }]}>{d}</Text>
                          </View>
                        </TouchableOpacity>
                      );
                    }
                    return <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{cells}</View>;
                  })()}
                </View>
              )}

              {/* 2. SELECT DOCTOR DROPDOWN */}
              <Text style={[styles.fieldLabel, { marginTop: 14 }]}>
                Select Doctor for {selectedRescheduleAppt?.branch || 'Branch'} ({getDayNameFromDateStr(rescheduleDate)})
              </Text>

              <TouchableOpacity
                style={styles.dropdownSelectorBox}
                onPress={() => setDoctorDropdownOpen(!doctorDropdownOpen)}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                  <MaterialCommunityIcons name="stethoscope" size={18} color="#258ec8" />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: '#0f172a' }}>
                      {rescheduleDoctor || 'Select Doctor'}
                    </Text>
                    <Text style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
                      Homeopathy Physician • {selectedRescheduleAppt?.branch || 'Clinic'}
                    </Text>
                  </View>
                </View>
                <Feather name={doctorDropdownOpen ? "chevron-up" : "chevron-down"} size={18} color="#64748b" />
              </TouchableOpacity>

              {doctorDropdownOpen && (
                <View style={styles.dropdownOptionsContainer}>
                  {availableDoctorsList.length === 0 ? (
                    <View style={{ padding: 12 }}>
                      <Text style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic' }}>
                        No doctors available on {getDayNameFromDateStr(rescheduleDate)} for {selectedRescheduleAppt?.branch || 'Branch'}
                      </Text>
                    </View>
                  ) : (
                    availableDoctorsList.map((docName) => {
                      const isSelected = rescheduleDoctor === docName;
                      return (
                        <TouchableOpacity
                          key={docName}
                          style={[styles.dropdownOptionRow, isSelected && styles.dropdownOptionRowActive]}
                          onPress={() => {
                            setRescheduleDoctor(docName);
                            setDoctorDropdownOpen(false);
                          }}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.dropdownOptionTitle, isSelected && { color: '#258ec8', fontWeight: '800' }]}>
                              {docName}
                            </Text>
                            <Text style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
                              Homeopathy Physician
                            </Text>
                          </View>
                          {isSelected && (
                            <Ionicons name="checkmark-circle" size={18} color="#258ec8" />
                          )}
                        </TouchableOpacity>
                      );
                    })
                  )}
                </View>
              )}

              {/* 3. SELECT TIME SLOT & LEFT SLOTS */}
              <Text style={[styles.fieldLabel, { marginTop: 14 }]}>
                Available Time Slots for {rescheduleDoctor}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                {rescheduleTimeSlots.map((slot) => {
                  const { remainingSlots, isFull } = getSlotCapacityInfo(slot);
                  const isSelected = rescheduleTime.trim() === slot.trim();
                  const isOneLeft = remainingSlots === 1;

                  return (
                    <TouchableOpacity
                      key={slot}
                      disabled={isFull}
                      style={[
                        styles.slotChip,
                        isSelected && styles.slotChipActive,
                        isFull && styles.slotChipFull
                      ]}
                      onPress={() => setRescheduleTime(slot)}
                    >
                      <Text style={[
                        styles.slotChipTime,
                        isSelected && styles.slotChipTimeActive,
                        isFull && styles.slotChipTimeFull
                      ]}>
                        {slot}
                      </Text>

                      <View style={[
                        styles.capacityBadge,
                        isSelected && { backgroundColor: 'rgba(255,255,255,0.25)' },
                        !isSelected && isFull && { backgroundColor: '#fee2e2' },
                        !isSelected && isOneLeft && { backgroundColor: '#fef3c7' },
                        !isSelected && !isFull && !isOneLeft && { backgroundColor: '#e0f2fe' },
                      ]}>
                        <Text style={[
                          styles.capacityBadgeText,
                          isSelected && { color: '#ffffff' },
                          !isSelected && isFull && { color: '#ef4444' },
                          !isSelected && isOneLeft && { color: '#b45309' },
                          !isSelected && !isFull && !isOneLeft && { color: '#0369a1' },
                        ]}>
                          {isFull ? 'FULL' : `${remainingSlots} left`}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

            </ScrollView>

            {/* Modal Action Footer */}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16, paddingTop: 10, borderTopWidth: 1, borderColor: '#f1f5f9' }}>
              <TouchableOpacity
                style={{ flex: 1, backgroundColor: '#f1f5f9', paddingVertical: 10, borderRadius: 10, alignItems: 'center' }}
                onPress={() => setRescheduleModalOpen(false)}
              >
                <Text style={{ color: '#475569', fontWeight: '700', fontSize: 13 }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1.5, backgroundColor: '#258ec8', paddingVertical: 10, borderRadius: 10, alignItems: 'center' }}
                onPress={handleConfirmReschedule}
              >
                <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 13 }}>Confirm Reschedule</Text>
              </TouchableOpacity>
            </View>

          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

export const CompleteAppointmentsQueueScreen = () => {
  const [activeTab, setActiveTab] = useState<'upcoming' | 'active' | 'completed'>('active');
  const [loading, setLoading] = useState(true);
  const [appointments, setAppointments] = useState<PatientAppointmentRecord[]>([]);

  const getTodayFormatted = () => {
    const today = new Date();
    const d = String(today.getDate()).padStart(2, '0');
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const y = today.getFullYear();
    return `${d}-${m}-${y}`;
  };

  useEffect(() => {
    const todayStr = getTodayFormatted();
    setLoading(true);
    try {
      const activeDb = getSafeDb();
      const colRef = query(collection(activeDb, 'allpatients'), limit(50));
      const unsubscribe = onSnapshot(
        colRef,
        (snapshot) => {
          const list: PatientAppointmentRecord[] = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const rawStatus = String(data.status || '').toLowerCase();
            let status: 'upcoming' | 'active' | 'completed' = 'upcoming';
            if (rawStatus === 'completed' || rawStatus === 'done') {
              status = 'completed';
            } else if (rawStatus === 'active' || rawStatus === 'in_consultation' || rawStatus === 'waiting') {
              status = 'active';
            } else {
              status = 'upcoming';
            }
            const rawReg = data.registrationId || data.registration_id || data.regId || data.regID || data.patientId || data.uhid;
            let cleanRegId = '';
            if (rawReg && typeof rawReg === 'string' && rawReg.trim().length > 0 && rawReg.trim().length <= 18 && !/^[a-zA-Z0-9]{19,32}$/.test(rawReg.trim())) {
              cleanRegId = rawReg.trim().toUpperCase();
            } else {
              const branchStr = (data.branchName || data.branch || 'KPHB').toUpperCase();
              let shortcut = 'KPB';
              if (branchStr.includes('KPHB') || branchStr === 'KPB') shortcut = 'KPB';
              else if (branchStr.includes('CHANDANAGAR') || branchStr === 'CHN') shortcut = 'CHN';
              else if (branchStr.includes('NALLAGANDLA') || branchStr === 'NGL') shortcut = 'NGL';
              else if (branchStr.includes('DILSHUKNAGAR') || branchStr === 'DIL') shortcut = 'DIL';
              else shortcut = branchStr.replace(/[^A-Z]/g, '').substring(0, 3) || 'GEN';

              cleanRegId = `SPH-${shortcut}-${String(list.length + 1).padStart(4, '0')}`;
            }

            list.push({
              id: docSnap.id,
              name: data.patientName || data.fullName || data.name || 'Patient',
              phone: data.phone || data.phoneNumber || data.mobile || '',
              regId: cleanRegId,
              doctor: data.doctorName || data.doctor || 'Dr. Prashanth K Vaidya',
              time: data.appointmentTime || data.timeSlot || '10:00 AM',
              date: data.appointmentDate || data.dateString || todayStr,
              status: status,
              branch: data.branchName || data.branch || 'KPHB Clinic',
              mode: data.consultationMode || 'In-Clinic',
            });
          });
          setAppointments(list);
          setLoading(false);
        },
        (error) => {
          console.error('Firestore Real-time Listener Error:', error);
          setLoading(false);
        }
      );
      return () => unsubscribe();
    } catch (err) {
      console.error('Firestore Connection Error:', err);
      setLoading(false);
    }
  }, []);

  return <AppointmentsQueueUI patients={appointments} />;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    padding: 6,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 3,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 8,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  tabBtnActive: {
    backgroundColor: '#258ec8',
  },
  tabText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748b',
  },
  tabTextActive: {
    color: '#ffffff',
  },
  listContainer: {
    paddingBottom: 30,
  },
  patientCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#64748b',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  patientAvatarCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#e0f2fe',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  avatarText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#258ec8',
  },
  patientMainInfo: {
    flex: 1,
  },
  patientName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0f172a',
  },
  patientMeta: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 9,
    fontWeight: '800',
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#f1f5f9',
    marginBottom: 6,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  detailText: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '600',
  },
  arrowIconBtn: {
    padding: 5,
    backgroundColor: '#a8ce3a',
    borderWidth: 1,
    borderColor: '#8cb82b',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  callBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#258ec8',
  },
  waBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#dcfce7',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  waBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#166534',
  },
  statusChangeBtn: {
    backgroundColor: '#258ec8',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  statusChangeBtnText: {
    color: '#ffffff',
    fontSize: 11.5,
    fontWeight: '800',
  },
  viewBtn: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#258ec8',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  viewBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  callIconBtn: {
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  waIconBtn: {
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteIconBtn: {
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rescheduleIconBtn: {
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rescheduleBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0284c7',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 4,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  inputText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#0f172a',
    padding: 0,
  },
  quickDateBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#bae6fd',
    backgroundColor: '#e0f2fe',
  },
  quickDateBtnActive: {
    backgroundColor: '#258ec8',
    borderColor: '#0284c7',
  },
  quickDateText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#0284c7',
  },
  quickDateTextActive: {
    color: '#ffffff',
  },
  doctorPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  doctorPillActive: {
    backgroundColor: '#258ec8',
    borderColor: '#0284c7',
  },
  doctorPillText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#475569',
  },
  doctorPillTextActive: {
    color: '#ffffff',
  },
  slotChip: {
    width: '31%',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotChipActive: {
    backgroundColor: '#258ec8',
    borderColor: '#0284c7',
  },
  slotChipFull: {
    backgroundColor: '#f1f5f9',
    borderColor: '#e2e8f0',
    opacity: 0.6,
  },
  slotChipTime: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0f172a',
  },
  slotChipTimeActive: {
    color: '#ffffff',
  },
  slotChipTimeFull: {
    color: '#94a3b8',
  },
  dropdownSelectorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 4,
  },
  dropdownOptionsContainer: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    marginTop: 4,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  dropdownOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  dropdownOptionRowActive: {
    backgroundColor: '#f0f9ff',
  },
  dropdownOptionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
  },
  capacityBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    marginTop: 2,
  },
  capacityBadgeText: {
    fontSize: 9,
    fontWeight: '800',
  },
  slotChipCapacity: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#258ec8',
    marginTop: 1,
  },
  slotChipCapacityActive: {
    color: '#e0f2fe',
  },
  slotChipCapacityFull: {
    color: '#ef4444',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 8,
  },
});
