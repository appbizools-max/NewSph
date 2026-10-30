import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, Platform, Modal
} from 'react-native';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { getSafeDb, collection, addDoc, doc, setDoc, getDocs, query, where, limit } from '../../utils/firebaseSafe';
import {
  logTelecallerActivity,
  DEFAULT_DOCTORS_SEED, getAvailableDoctorsForDateAndBranch,
  DoctorProfile, AvailableDoctorInfo, formatDDMMYYYY, getDayNameFromDate
} from '@app/shared';
import { generateRegistrationId } from '../../utils/idGenerator';

interface TelecallerBookAppointmentScreenProps {
  telecaller: {
    uid?: string;
    telecallerId: string;
    name: string;
    phone?: string;
  };
  initialPatientData?: {
    patientName?: string;
    phone?: string;
    regId?: string;
    branchName?: string;
    doctorName?: string;
    diseases?: string;
  } | null;
  onBookingSuccess?: () => void;
}

const CLINIC_BRANCHES = [
  'KPHB Branch',
  'Nallagandla Branch',
  'Dilshuknagar Branch',
  'Chandanagar Branch',
];

const BRANCH_DOCTORS: Record<string, string[]> = {
  'KPHB Branch': ['Dr. Prashanth K Vaidya', 'Dr. Padma Priya', 'Dr. Jobedah Parveez'],
  'Nallagandla Branch': ['Dr. Jobedah Parveez', 'Dr. Prashanth K Vaidya'],
  'Dilshuknagar Branch': ['Dr. Ramakrishna Chanduri', 'Dr. Prashanth K Vaidya'],
  'Chandanagar Branch': ['Dr. Padma Priya', 'Dr. Prashanth K Vaidya'],
};

const DEFAULT_TIME_SLOTS = [
  '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM',
  '12:00 PM', '12:30 PM', '01:00 PM', '02:00 PM',
  '04:00 PM', '04:30 PM', '05:00 PM', '05:30 PM',
  '06:00 PM', '06:30 PM', '07:00 PM', '07:30 PM'
];

export const TelecallerBookAppointmentScreen: React.FC<TelecallerBookAppointmentScreenProps> = ({
  telecaller,
  initialPatientData,
  onBookingSuccess
}) => {
  // Form State
  const [patientName, setPatientName] = useState<string>('');
  const [phoneNumber, setPhoneNumber] = useState<string>('');
  const [regId, setRegId] = useState<string>('');
  const [selectedBranch, setSelectedBranch] = useState<string>('KPHB Branch');
  const [selectedDoctor, setSelectedDoctor] = useState<string>('Dr. Prashanth K Vaidya');
  const [appointmentDate, setAppointmentDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [appointmentTime, setAppointmentTime] = useState<string>('11:00 AM');
  const [consultationMode, setConsultationMode] = useState<'In-Clinic' | 'Online'>('In-Clinic');
  const [diseases, setDiseases] = useState<string>('');
  const [remarks, setRemarks] = useState<string>('');

  const [isSearchingPatient, setIsSearchingPatient] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [patientFoundMessage, setPatientFoundMessage] = useState<string>('');

  // Pre-fill initial patient data if passed from Follow-ups
  useEffect(() => {
    if (initialPatientData) {
      if (initialPatientData.patientName) setPatientName(initialPatientData.patientName);
      if (initialPatientData.phone) setPhoneNumber(initialPatientData.phone);
      if (initialPatientData.regId) setRegId(initialPatientData.regId);
      if (initialPatientData.branchName && CLINIC_BRANCHES.includes(initialPatientData.branchName)) {
        setSelectedBranch(initialPatientData.branchName);
      }
      if (initialPatientData.doctorName) setSelectedDoctor(initialPatientData.doctorName);
      if (initialPatientData.diseases) setDiseases(initialPatientData.diseases);
    }
  }, [initialPatientData]);

  const [doctorsList, setDoctorsList] = useState<DoctorProfile[]>(DEFAULT_DOCTORS_SEED);

  // Fetch real doctors from Firestore
  useEffect(() => {
    const activeDb = getSafeDb();
    if (!activeDb) return;
    const { onSnapshot } = require('../../utils/firebaseSafe');
    const unsub = onSnapshot(collection(activeDb, 'doctors'), (snap: any) => {
      if (snap && !snap.empty) {
        const list: DoctorProfile[] = [];
        snap.forEach((d: any) => list.push({ id: d.id, ...d.data() }));
        setDoctorsList(list);
      }
    }, () => {});
    return () => unsub && unsub();
  }, []);

  const dayOfWeek = useMemo(() => getDayNameFromDate(appointmentDate), [appointmentDate]);

  // Compute available doctors for selected branch and date
  const availableDoctors: AvailableDoctorInfo[] = useMemo(() => {
    return getAvailableDoctorsForDateAndBranch(doctorsList, selectedBranch, appointmentDate);
  }, [doctorsList, selectedBranch, appointmentDate]);

  // Auto-adjust selected doctor based on availability
  useEffect(() => {
    if (availableDoctors.length > 0) {
      const isStillAvailable = availableDoctors.some((d) => d.name === selectedDoctor);
      if (!isStillAvailable) {
        setSelectedDoctor(availableDoctors[0].name);
      }
    } else {
      setSelectedDoctor('');
    }
  }, [availableDoctors, selectedDoctor]);

  // Compute available time slots for the currently selected doctor on that day
  const activeDoctorSlots = useMemo(() => {
    const docInfo = availableDoctors.find((d) => d.name === selectedDoctor);
    if (docInfo && docInfo.timingSlots && docInfo.timingSlots.length > 0) {
      return docInfo.timingSlots;
    }
    return DEFAULT_TIME_SLOTS;
  }, [availableDoctors, selectedDoctor]);

  // Search existing patient by phone
  const handleLookupPatient = async () => {
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      Alert.alert('Invalid Phone', 'Please enter a valid 10-digit mobile number to search.');
      return;
    }

    setIsSearchingPatient(true);
    setPatientFoundMessage('');
    const activeDb = getSafeDb();

    try {
      if (!activeDb) {
        setIsSearchingPatient(false);
        return;
      }

      const last10 = cleanPhone.slice(-10);
      const q = query(collection(activeDb, 'patients'), where('phone', '>=', last10), limit(3));
      const snap = await getDocs(q);

      let found: any = null;
      snap.forEach((d) => {
        const data = d.data();
        const p = String(data.phone || data.mobile || '');
        if (p.includes(last10)) {
          found = data;
        }
      });

      // Also check 'appointments' collection if not in patients
      if (!found) {
        const qApp = query(collection(activeDb, 'appointments'), where('phone', '>=', last10), limit(3));
        const snapApp = await getDocs(qApp);
        snapApp.forEach((d) => {
          const data = d.data();
          const p = String(data.phone || data.mobile || '');
          if (p.includes(last10)) {
            found = data;
          }
        });
      }

      if (found) {
        setPatientName(found.name || found.patientName || found.fullName || patientName);
        if (found.registrationId || found.regId || found.patientId) {
          setRegId(found.registrationId || found.regId || found.patientId);
        }
        if (found.diseases || found.disease) {
          setDiseases(found.diseases || found.disease);
        }
        setPatientFoundMessage(`Existing patient found: ${found.name || found.patientName}`);
      } else {
        setPatientFoundMessage('New patient (no existing record found).');
      }
    } catch (e: any) {
      console.warn('Patient lookup notice:', e);
    } finally {
      setIsSearchingPatient(false);
    }
  };

  const handleBookAppointment = async () => {
    if (!patientName.trim()) {
      Alert.alert('Missing Name', 'Please enter the patient name.');
      return;
    }
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      Alert.alert('Missing Phone', 'Please enter a valid 10-digit mobile number.');
      return;
    }
    if (!appointmentDate) {
      Alert.alert('Missing Date', 'Please enter the appointment date (YYYY-MM-DD).');
      return;
    }
    if (!selectedDoctor) {
      Alert.alert(
        'No Doctor Available',
        `No consulting doctors are scheduled or available at ${selectedBranch} on ${dayOfWeek} (${formatDDMMYYYY(appointmentDate)}). Please choose another date or branch.`
      );
      return;
    }

    setIsSubmitting(true);
    const activeDb = getSafeDb();

    try {
      if (!activeDb) {
        throw new Error('Database is not available.');
      }

      // Generate Reg ID if missing
      let finalRegId = regId.trim();
      if (!finalRegId) {
        finalRegId = await generateRegistrationId(selectedBranch);
        setRegId(finalRegId);
      }

      const newDocRef = doc(collection(activeDb, 'appointments'));
      const appointmentId = newDocRef.id;

      const appPayload = {
        id: appointmentId,
        appointmentId,
        registrationId: finalRegId,
        regId: finalRegId,
        patientName: patientName.trim(),
        fullName: patientName.trim(),
        name: patientName.trim(),
        phone: cleanPhone.slice(-10),
        phoneNumber: cleanPhone.slice(-10),
        branch: selectedBranch,
        branchName: selectedBranch,
        doctor: selectedDoctor,
        doctorName: selectedDoctor,
        appointmentDate,
        date: appointmentDate,
        appointmentTime,
        time: appointmentTime,
        consultationMode,
        diseases: diseases.trim(),
        remarks: remarks.trim(),
        status: 'Scheduled',
        bookedBy: telecaller.name,
        telecallerId: telecaller.telecallerId,
        telecallerUid: telecaller.uid || null,
        bookingSource: 'Telecaller',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      await setDoc(newDocRef, appPayload);

      // Also ensure followups collection is updated or cleared
      const followupDoc = doc(collection(activeDb, 'followups'), `${cleanPhone.slice(-10)}_followup`);
      await setDoc(followupDoc, {
        patientName: patientName.trim(),
        phone: cleanPhone.slice(-10),
        registrationId: finalRegId,
        branchName: selectedBranch,
        doctorName: selectedDoctor,
        callOutcome: 'Appointment Booked',
        status: 'Appointment Booked',
        appointmentDate,
        lastContactedBy: telecaller.name,
        updatedAt: new Date().toISOString()
      }, { merge: true }).catch(() => {});

      // Log Telecaller Activity
      await logTelecallerActivity({
        telecallerUid: telecaller.uid,
        telecallerId: telecaller.telecallerId,
        telecallerName: telecaller.name,
        patientId: finalRegId,
        patientName: patientName.trim(),
        patientMobile: cleanPhone.slice(-10),
        branchId: selectedBranch,
        branchName: selectedBranch,
        activityType: 'appointment_booked',
        appointmentId,
        appointmentDate,
        callOutcome: 'Appointment Booked',
        remarks: `Booked ${consultationMode} appointment with ${selectedDoctor} at ${selectedBranch} on ${appointmentDate} at ${appointmentTime}. Notes: ${remarks}`,
      }, activeDb);

      setIsSubmitting(false);
      Alert.alert(
        'Appointment Confirmed!',
        `Successfully booked appointment for ${patientName} with ${selectedDoctor} at ${selectedBranch} on ${appointmentDate} at ${appointmentTime}.`,
        [
          {
            text: 'OK',
            onPress: () => {
              // Clear form
              setPatientName('');
              setPhoneNumber('');
              setRegId('');
              setDiseases('');
              setRemarks('');
              setPatientFoundMessage('');
              if (onBookingSuccess) onBookingSuccess();
            }
          }
        ]
      );
    } catch (err: any) {
      setIsSubmitting(false);
      Alert.alert('Booking Failed', err?.message || 'Could not complete appointment booking.');
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerBox}>
        <Text style={styles.headerTitle}>Book Patient Appointment</Text>
        <Text style={styles.headerSub}>
          Book appointments across any branch on behalf of telecalling.
        </Text>
      </View>

      <View style={styles.formCard}>
        {/* Branch Selection */}
        <Text style={styles.label}>Select Hospital Branch:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
          {CLINIC_BRANCHES.map((b) => {
            const isSelected = selectedBranch === b;
            return (
              <TouchableOpacity
                key={b}
                style={[styles.branchChip, isSelected && styles.branchChipActive]}
                onPress={() => setSelectedBranch(b)}
              >
                <Text style={[styles.branchChipText, isSelected && styles.branchChipTextActive]}>
                  {b}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Patient Phone & Lookup */}
        <Text style={styles.label}>Patient Mobile Number:</Text>
        <View style={styles.inputWithBtnRow}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            placeholder="10-digit Mobile Number"
            placeholderTextColor="#94a3b8"
            keyboardType="phone-pad"
            value={phoneNumber}
            onChangeText={(txt) => {
              setPhoneNumber(txt);
              setPatientFoundMessage('');
            }}
          />
          <TouchableOpacity
            style={styles.lookupBtn}
            onPress={handleLookupPatient}
            disabled={isSearchingPatient}
          >
            {isSearchingPatient ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.lookupBtnText}>Search</Text>
            )}
          </TouchableOpacity>
        </View>

        {patientFoundMessage ? (
          <Text style={[styles.infoBadge, patientFoundMessage.includes('found') ? styles.infoGreen : styles.infoGray]}>
            {patientFoundMessage}
          </Text>
        ) : null}

        {/* Patient Name */}
        <Text style={styles.label}>Patient Full Name:</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Ramesh Kumar"
          placeholderTextColor="#94a3b8"
          value={patientName}
          onChangeText={setPatientName}
        />

        {/* Patient ID */}
        <Text style={styles.label}>Patient ID / Reg ID (optional):</Text>
        <TextInput
          style={styles.input}
          placeholder="Auto-generated if empty (e.g. KPB10293)"
          placeholderTextColor="#94a3b8"
          value={regId}
          onChangeText={setRegId}
        />

        {/* Appointment Date */}
        <Text style={styles.label}>
          Appointment Date (YYYY-MM-DD):{' '}
          <Text style={{ color: '#0284c7', fontWeight: '700' }}>({dayOfWeek}, {formatDDMMYYYY(appointmentDate)})</Text>
        </Text>
        <TextInput
          style={styles.input}
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#94a3b8"
          value={appointmentDate}
          onChangeText={setAppointmentDate}
        />

        {/* Doctor Selection based on Availability */}
        <Text style={styles.label}>Consulting Doctor ({selectedBranch} • {dayOfWeek}):</Text>
        {availableDoctors.length > 0 ? (
          <View style={styles.chipsRow}>
            {availableDoctors.map((docInfo) => {
              const isSelected = selectedDoctor === docInfo.name;
              return (
                <TouchableOpacity
                  key={docInfo.id}
                  style={[styles.doctorChip, isSelected && styles.doctorChipActive]}
                  onPress={() => setSelectedDoctor(docInfo.name)}
                >
                  <Ionicons
                    name="person-outline"
                    size={14}
                    color={isSelected ? '#ffffff' : '#0284c7'}
                    style={{ marginRight: 4 }}
                  />
                  <Text style={[styles.doctorChipText, isSelected && styles.doctorChipTextActive]}>
                    {docInfo.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <View style={styles.noDoctorNotice}>
            <Ionicons name="warning-outline" size={16} color="#dc2626" style={{ marginRight: 6 }} />
            <Text style={styles.noDoctorNoticeText}>
              No doctors scheduled at {selectedBranch} on {dayOfWeek} ({formatDDMMYYYY(appointmentDate)}). Please select another date or branch.
            </Text>
          </View>
        )}

        {/* Consultation Mode */}
        <Text style={styles.label}>Consultation Type:</Text>
        <View style={styles.modeRow}>
          {(['In-Clinic', 'Online'] as const).map((mode) => (
            <TouchableOpacity
              key={mode}
              style={[styles.modeBtn, consultationMode === mode && styles.modeBtnActive]}
              onPress={() => setConsultationMode(mode)}
            >
              <Ionicons
                name={mode === 'In-Clinic' ? 'business-outline' : 'videocam-outline'}
                size={16}
                color={consultationMode === mode ? '#ffffff' : '#475569'}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.modeBtnText, consultationMode === mode && styles.modeBtnTextActive]}>
                {mode}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Appointment Time Slots */}
        <Text style={styles.label}>
          Available Time Slots {selectedDoctor ? `for ${selectedDoctor}` : ''}:
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
          {activeDoctorSlots.map((slot) => {
            const isSelected = appointmentTime === slot;
            return (
              <TouchableOpacity
                key={slot}
                style={[styles.slotChip, isSelected && styles.slotChipActive]}
                onPress={() => setAppointmentTime(slot)}
              >
                <Text style={[styles.slotChipText, isSelected && styles.slotChipTextActive]}>
                  {slot}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Diseases / Health Issue */}
        <Text style={styles.label}>Medical Concern / Diseases:</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Chronic Migraine, Hair Fall"
          placeholderTextColor="#94a3b8"
          value={diseases}
          onChangeText={setDiseases}
        />

        {/* Remarks / Telecaller Notes */}
        <Text style={styles.label}>Telecaller Notes / Remarks:</Text>
        <TextInput
          style={[styles.input, { height: 70, textAlignVertical: 'top' }]}
          placeholder="Any special remarks or patient preferences discussed on the call..."
          placeholderTextColor="#94a3b8"
          multiline
          numberOfLines={3}
          value={remarks}
          onChangeText={setRemarks}
        />

        {/* Submit Button */}
        <TouchableOpacity
          style={styles.submitBtn}
          onPress={handleBookAppointment}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={18} color="#ffffff" style={{ marginRight: 8 }} />
              <Text style={styles.submitBtnText}>Confirm & Book Appointment</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  content: {
    padding: 16,
    paddingBottom: 90,
  },
  headerBox: {
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
  },
  headerSub: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  formCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginTop: 12,
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 13,
    color: '#0f172a',
  },
  inputWithBtnRow: {
    flexDirection: 'row',
    gap: 8,
  },
  lookupBtn: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lookupBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  infoBadge: {
    fontSize: 11,
    marginTop: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  infoGreen: {
    backgroundColor: '#f0fdf4',
    color: '#15803d',
  },
  infoGray: {
    backgroundColor: '#f1f5f9',
    color: '#64748b',
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  branchChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  branchChipActive: {
    backgroundColor: '#0284c7',
    borderColor: '#0284c7',
  },
  branchChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  branchChipTextActive: {
    color: '#ffffff',
  },
  doctorChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    marginBottom: 6,
  },
  doctorChipActive: {
    backgroundColor: '#0284c7',
    borderColor: '#0284c7',
  },
  doctorChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0284c7',
  },
  doctorChipTextActive: {
    color: '#ffffff',
  },
  noDoctorNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  noDoctorNoticeText: {
    flex: 1,
    fontSize: 12,
    color: '#dc2626',
    fontWeight: '600',
  },
  modeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  modeBtnActive: {
    backgroundColor: '#0284c7',
    borderColor: '#0284c7',
  },
  modeBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  modeBtnTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  slotChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  slotChipActive: {
    backgroundColor: '#0284c7',
    borderColor: '#0284c7',
  },
  slotChipText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
  },
  slotChipTextActive: {
    color: '#ffffff',
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#16a34a',
    borderRadius: 10,
    paddingVertical: 12,
    marginTop: 20,
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
});

