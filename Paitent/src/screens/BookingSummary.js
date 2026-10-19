import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, ScrollView, Image, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Button, Surface, Divider, TextInput } from 'react-native-paper';
import { COLORS, SIZES } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp, doc, getDoc, updateDoc, increment, query, where, getDocs, setDoc } from 'firebase/firestore';
import { Calendar, Clock, MapPin, User, CreditCard } from 'lucide-react-native';
import RazorpayCheckout from 'react-native-razorpay';
import { generateRegistrationId, getStandardBranchName } from '../utils/idGenerator';
import { scheduleBookingSuccessNotification, sendRemotePushNotification } from '../utils/notificationHelper';
import { sendBookingSMS } from '../utils/smsHelper';
import { sendBookingWhatsAppNotification } from '../utils/whatsappHelper';

const normalizeBranchName = (name) => {
  return getStandardBranchName(name).toLowerCase();
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

const BookingSummary = ({ navigation, route }) => {
  const { branch = {}, doctor: routeDoctor = {}, date = '', slot = '' } = route.params || {};
  const doctor = { ...routeDoctor };
  if (doctor.name) {
    let docName = String(doctor.name).trim();
    while (docName.toLowerCase().startsWith('dr.') || docName.toLowerCase().startsWith('dr ')) {
      if (docName.toLowerCase().startsWith('dr.')) {
        docName = docName.substring(3).trim();
      } else {
        docName = docName.substring(2).trim();
      }
    }
    doctor.name = 'Dr. ' + docName;
  }
  const { user, userData } = useAuth();
  const [symptoms, setSymptoms] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const isSubmitting = useRef(false);
  const [globalFee, setGlobalFee] = useState(600);

  useEffect(() => {
    const fetchGlobalFee = async () => {
      try {
        const settingsRef = doc(db, 'settings', 'global');
        const settingsSnap = await getDoc(settingsRef);
        if (settingsSnap.exists() && settingsSnap.data().consultationFee) {
          setGlobalFee(Number(settingsSnap.data().consultationFee));
        }
      } catch (e) {
        console.error("Error fetching global fee in BookingSummary:", e);
      }
    };
    fetchGlobalFee();
  }, []);

  const durEnd = userData?.medicationDurationEnd;
  const inDuration = durEnd ? new Date(durEnd) > new Date() : false;
  const consultationFee = inDuration ? 0 : (doctor.consultationFee || globalFee);

  const handlePaymentAndBook = async () => {
    if (isProcessing || isSubmitting.current) return;
    isSubmitting.current = true;
    setIsProcessing(true);
    // Directly confirm and save the pending booking request without upfront payment gateway
    setTimeout(() => {
      saveAppointment();
    }, 1000);
  };

  const saveAppointment = async () => {
    try {
      // Resolve doctor ID from name if it's a template ID (or resolve it anyway to be safe)
      let resolvedDoctorId = doctor.id;
      try {
        const qDoc = query(collection(db, 'users'), where('role', 'in', ['doctor', 'Doctor', 'DOCTOR']));
        const snapDoc = await getDocs(qDoc);
        const normalizeName = (n) => n.toLowerCase().replace(/^dr\.\s*/, '').replace(/^dr\s*/, '').replace(/[^a-z0-9]/g, '');
        const targetNormalized = normalizeName(doctor.name || '');

        snapDoc.forEach(d => {
          const u = d.data();
          if (normalizeName(u.name || '') === targetNormalized) {
            resolvedDoctorId = d.id;
          }
        });
      } catch (err) {
        console.warn("Error resolving doctor UID in BookingSummary:", err);
      }

      // Check if slot falls in a Doctor No Show block
      const qNoShows = query(
        collection(db, 'doctor_no_shows'),
        where('doctorId', '==', resolvedDoctorId)
      );
      const snapNoShows = await getDocs(qNoShows);
      const activeNoShows = [];
      const normFormBranch = (branch.name || '').toLowerCase().replace(/\s*branch\s*/i, '').trim();
      snapNoShows.forEach(docSnap => {
        const ns = docSnap.data();
        const nsBranch = (ns.branchName || ns.branchId || '').toLowerCase().replace(/\s*branch\s*/i, '').trim();
        if (nsBranch === normFormBranch) {
          activeNoShows.push(ns);
        }
      });

      if (isSlotBlockedByNoShow(slot, date, activeNoShows)) {
        Alert.alert('Cannot Book', `Dr. ${doctor.name} is marked as NO SHOW (unavailable) for this time period.`);
        isSubmitting.current = false;
        setIsProcessing(false);
        return;
      }

      const cleanPhone = (userData?.phone || '').replace(/\D/g, '').slice(-10);
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
        finalRegId = await generateRegistrationId(branch.name);
      }

      const dateObj = new Date(date);
      const dayVal = String(dateObj.getDate()).padStart(2, '0');
      const monthVal = String(dateObj.getMonth() + 1).padStart(2, '0');
      const yearVal = dateObj.getFullYear();
      const dateSlash = `${dayVal}/${monthVal}/${yearVal}`;

      const allPatientsRef = doc(collection(db, 'allpatients'));
      const appointmentId = allPatientsRef.id;

      const unifiedAppointmentData = {
        id: appointmentId,
        patientId: user.uid,
        patientName: userData?.fullName || 'Patient',
        fullName: userData?.fullName || 'Patient',
        phone: cleanPhone,
        patientPhone: cleanPhone,
        email: userData?.email || '',
        age: userData?.age || '',
        gender: userData?.gender || '',
        
        branchId: getStandardBranchName(branch.id),
        branchName: getStandardBranchName(branch.name),
        
        doctorId: resolvedDoctorId,
        doctorName: doctor.name,
        doctor: doctor.name,
        
        date: date,
        dateString: date,
        appointmentDate: dateSlash,
        
        timeSlot: slot,
        appointmentTime: slot,
        
        symptoms: symptoms,
        complaint: symptoms,
        
        status: 'pending',
        paymentStatus: inDuration ? 'paid' : 'pending',
        amountPaid: 0,
        paymentRequested: false,
        requestedAmount: 0,
        paymentId: inDuration ? 'IN_DURATION_FREE' : '',
        consultationFee: consultationFee,
        isInDuration: inDuration,
        medicationDurationEnd: durEnd || null,
        
        registrationId: finalRegId,
        regId: finalRegId,
        
        createdAt: serverTimestamp(),
        bookedAt: serverTimestamp(),
        lastUpdated: serverTimestamp(),
        
        source: 'UserApp',
        bookingSource: 'Patient App',
        isAppBooking: true,
        modeOfConsultation: 'In-Clinic',
        _type: 'online'
      };

      await setDoc(allPatientsRef, unifiedAppointmentData);

      // Trigger SMS & WhatsApp confirmation asynchronously
      try {
        const targetPhone = unifiedAppointmentData.phone || cleanPhone;
        const targetPatientName = unifiedAppointmentData.fullName || 'Patient';
        const targetDocName = unifiedAppointmentData.doctorName || (doctor && doctor.name) || 'Doctor';
        const targetDate = unifiedAppointmentData.appointmentDate || date;
        const targetSlot = unifiedAppointmentData.timeSlot || slot;
        const targetBranch = unifiedAppointmentData.branchName || (branch && branch.name) || 'KPHB';

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

      // Notify all receptionists and staff at this branch about the new booking
      try {
        const dateObj = new Date(date);
        const formattedDateStr = isNaN(dateObj.getTime())
          ? date
          : dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        const patientName = userData?.fullName || 'Patient';
        const patientPhone = cleanPhone || 'N/A';

        const qRec = query(collection(db, 'users'), where('role', 'in', ['receptionist', 'staff', 'Receptionist', 'Staff', 'RECEPTIONIST', 'STAFF']));
        const snapRec = await getDocs(qRec);
        const targetBranchNorm = normalizeBranchName(branch.name);

        snapRec.forEach(async (docSnap) => {
          const receptionist = docSnap.data();
          const repBranchId = String(receptionist.branchId || '').trim();
          const repBranchName = String(receptionist.branchName || '').trim();
          const targetBranchId = String(branch.id || '').trim();
          const targetBranchName = String(branch.name || '').trim();

          const repBranchIdNorm = normalizeBranchName(repBranchId);
          const repBranchNameNorm = normalizeBranchName(repBranchName);
          const targetBranchNorm = normalizeBranchName(targetBranchName);

          const matchesBranch =
            (targetBranchId && repBranchId === targetBranchId) ||
            (repBranchIdNorm === targetBranchNorm) ||
            (repBranchNameNorm === targetBranchNorm);

          if (matchesBranch) {
            await addDoc(collection(db, 'notifications'), {
              userId: receptionist.uid || docSnap.id,
              title: '🎉 New Appointment Booked',
              body: `New appointment: ${patientName} on ${formattedDateStr} at ${slot} (${branch.name} Branch).`,
              type: 'new_booking_alert',
              isRead: false,
              createdAt: serverTimestamp(),
              metadata: {
                appointmentId: appointmentId,
                patientName,
                patientPhone,
                date: formattedDateStr,
                timeSlot: slot,
                branchName: branch.name
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
                `New appointment: ${patientName} on ${formattedDateStr} at ${slot} (${branch.name} Branch).`,
                { appointmentId: appointmentId }
              );
            }
          }
        });

        // Notify the doctor assigned to this appointment
        if (resolvedDoctorId) {
          const docTokens = [];
          try {
            const docSnap = await getDoc(doc(db, 'users', resolvedDoctorId));
            if (docSnap.exists()) {
              const d = docSnap.data();
              if (d.expoPushToken) docTokens.push(d.expoPushToken);
              if (Array.isArray(d.expoPushTokens)) {
                d.expoPushTokens.forEach(t => {
                  if (t && !docTokens.includes(t)) docTokens.push(t);
                });
              }
            }
          } catch (e) {
            console.log("Error reading doctor token:", e);
          }

          await addDoc(collection(db, 'notifications'), {
            userId: resolvedDoctorId,
            title: '📅 New Appointment Scheduled',
            body: `New appointment: ${patientName} on ${formattedDateStr} at ${slot} (${branch.name} Branch).`,
            type: 'new_booking_doctor_alert',
            isRead: false,
            createdAt: serverTimestamp(),
            metadata: {
              appointmentId: appointmentId,
              patientName,
              patientPhone,
              date: formattedDateStr,
              timeSlot: slot,
              branchName: branch.name
            }
          });

          // Send native system tray push notification
          if (docTokens.length > 0) {
            await sendRemotePushNotification(
              docTokens,
              '📅 New Appointment Scheduled',
              `New appointment: ${patientName} on ${formattedDateStr} at ${slot} (${branch.name} Branch).`,
              { appointmentId: appointmentId }
            );
          }
          console.log("[BookingSummary] Successfully created doctor notification for doctor UID:", resolvedDoctorId);
        }

        // Notify all HR users about the new online booking
        const qHr = query(collection(db, 'users'), where('role', 'in', ['hr', 'HR', 'Hr']));
        const snapHr = await getDocs(qHr);
        snapHr.forEach(async (docSnap) => {
          const hrUser = docSnap.data();
          await addDoc(collection(db, 'notifications'), {
            userId: hrUser.uid || docSnap.id,
            title: '📅 New Appointment Alert',
            body: `New appointment: ${patientName} on ${formattedDateStr} at ${slot} (${branch.name} Branch).`,
            type: 'new_booking_hr_alert',
            isRead: false,
            createdAt: serverTimestamp(),
            metadata: {
              appointmentId: appointmentId,
              patientName,
              patientPhone,
              date: formattedDateStr,
              timeSlot: slot,
              branchName: branch.name
            }
          });

          // Send native system tray push notification
          const hrTokens = [];
          if (hrUser.expoPushToken) hrTokens.push(hrUser.expoPushToken);
          if (Array.isArray(hrUser.expoPushTokens)) {
            hrUser.expoPushTokens.forEach(t => {
              if (t && !hrTokens.includes(t)) hrTokens.push(t);
            });
          }
          if (hrTokens.length > 0) {
            await sendRemotePushNotification(
              hrTokens,
              '📅 New Appointment Alert',
              `New appointment: ${patientName} on ${formattedDateStr} at ${slot} (${branch.name} Branch).`,
              { appointmentId: appointmentId }
            );
          }
        });
      } catch (notifRecErr) {
        console.warn("Error notifying receptionists, doctor, and HR of new booking:", notifRecErr);
      }

      // Trigger high-fidelity local push notifications!
      try {
        const dateObj = new Date(date);
        const formattedDateStr = isNaN(dateObj.getTime())
          ? date
          : dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        await scheduleBookingSuccessNotification(doctor.name, formattedDateStr, slot, patientName, patientPhone);
      } catch (notifErr) {
        console.warn("Error dispatching notification triggers:", notifErr);
      }

      // Add to Firestore notifications collection so it shows in the app Notification screen
      try {
        const dateObj = new Date(date);
        const formattedDateStr = isNaN(dateObj.getTime())
          ? date
          : dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        await addDoc(collection(db, 'notifications'), {
          userId: user.uid,
          title: '🎉 Appointment Booked!',
          body: `Your consultation request with Dr. ${doctor.name} is submitted for ${formattedDateStr} at ${slot}.`,
          type: 'booking_confirmed',
          isRead: false,
          appointmentId: appointmentId,
          createdAt: serverTimestamp()
        });
      } catch (notifDocErr) {
        console.warn("Error creating booking notification document:", notifDocErr);
      }

      Alert.alert(
        'Booking Request Sent!',
        `Your appointment request with ${doctor.name} is submitted.\n\nReception will review your booking, confirm the slot, and send the consultation fee request. You will be able to complete payment inside the app under Upcoming Appointments.`,
        [{ text: 'OK', onPress: () => navigation.navigate('Home') }]
      );
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Failed to save appointment. Please contact support.');
    } finally {
      isSubmitting.current = false;
      setIsProcessing(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>Review & Pay</Text>
          <Text style={styles.subtitle}>Finalize your consultation booking</Text>
        </View>

        <Surface style={styles.summaryCard}>
          <View style={styles.row}>
            <User size={20} color={COLORS.primary} />
            <View style={styles.rowContent}>
              <Text style={styles.label}>Doctor</Text>
              <Text style={styles.value}>{doctor.name}</Text>
              <Text style={styles.subValue}>{doctor.specialization || 'General Physician'}</Text>
            </View>
          </View>

          <Divider style={styles.divider} />

          <View style={styles.row}>
            <Calendar size={20} color={COLORS.primary} />
            <View style={styles.rowContent}>
              <Text style={styles.label}>Date & Time</Text>
              <Text style={styles.value}>{date} at {slot}</Text>
            </View>
          </View>

          <Divider style={styles.divider} />

          <View style={styles.row}>
            <MapPin size={20} color={COLORS.primary} />
            <View style={styles.rowContent}>
              <Text style={styles.label}>Location</Text>
              <Text style={styles.value}>{branch.name}</Text>
              <Text style={styles.subValue}>{branch.address}</Text>
            </View>
          </View>
        </Surface>

        <Text style={styles.sectionTitle}>Tell us more</Text>
        <TextInput
          label="Symptoms / Reason for visit (Optional)"
          value={symptoms}
          onChangeText={setSymptoms}
          mode="outlined"
          multiline
          numberOfLines={4}
          style={styles.textArea}
          outlineColor={COLORS.border}
          activeOutlineColor={COLORS.primary}
        />

        <Surface style={styles.paymentCard}>
          <Text style={styles.paymentTitle}>Payment Summary</Text>
          <View style={styles.paymentRow}>
            <Text style={styles.paymentLabel}>Consultation Fee</Text>
            <Text style={styles.paymentValue}>₹{consultationFee}</Text>
          </View>
          <View style={styles.paymentRow}>
            <Text style={styles.paymentLabel}>Booking Charges</Text>
            <Text style={styles.paymentValue}>₹0</Text>
          </View>
          <Divider style={styles.divider} />
          <View style={styles.paymentRow}>
            <Text style={styles.totalLabel}>Total Payable</Text>
            <Text style={styles.totalValue}>₹{consultationFee}</Text>
          </View>
        </Surface>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          mode="contained"
          onPress={handlePaymentAndBook}
          loading={isProcessing}
          style={styles.payBtn}
          contentStyle={styles.payBtnContent}
          buttonColor={COLORS.secondary}
          icon={({ size, color }) => <Calendar size={size} color={color} />}
        >
          {isProcessing ? 'Processing...' : 'Confirm Booking Request'}
        </Button>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scrollContent: { paddingHorizontal: SIZES.padding, paddingTop: 20, paddingBottom: 140 },
  header: { marginBottom: 24 },
  title: { fontSize: 24, fontWeight: '700', color: COLORS.text },
  subtitle: { fontSize: 16, color: COLORS.muted, marginTop: 4 },
  summaryCard: { padding: 20, borderRadius: 20, backgroundColor: COLORS.white, elevation: 2, marginBottom: 30, borderWidth: 1, borderColor: '#f1f5f9' },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  rowContent: { marginLeft: 16, flex: 1 },
  label: { fontSize: 12, color: COLORS.muted, marginBottom: 2, textTransform: 'uppercase', letterSpacing: 1 },
  value: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  subValue: { fontSize: 13, color: COLORS.muted, marginTop: 2 },
  divider: { marginVertical: 16, backgroundColor: '#f1f5f9' },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: 12 },
  textArea: { backgroundColor: COLORS.white, marginBottom: 30 },
  paymentCard: { padding: 20, borderRadius: 20, backgroundColor: '#f8fafc', borderStyle: 'dashed', borderWidth: 1, borderColor: COLORS.border },
  paymentTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: 16 },
  paymentRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  paymentLabel: { color: COLORS.muted, fontSize: 14 },
  paymentValue: { color: COLORS.text, fontWeight: '600', fontSize: 14 },
  totalLabel: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  totalValue: { fontSize: 20, fontWeight: '800', color: COLORS.primary },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: SIZES.padding, backgroundColor: COLORS.white, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  payBtn: { borderRadius: 12 },
  payBtnContent: { paddingVertical: 10 },
});

export default BookingSummary;
