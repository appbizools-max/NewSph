import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar, Clock, User, Phone, Building2, CheckCircle2,
  AlertCircle, Search, RefreshCw, FileText
} from 'lucide-react';
import { collection, doc, setDoc, getDocs, query, where, limit, onSnapshot } from 'firebase/firestore';
import {
  db, logTelecallerActivity,
  DEFAULT_DOCTORS_SEED, getAvailableDoctorsForDateAndBranch,
  DoctorProfile, AvailableDoctorInfo, formatDDMMYYYY, getDayNameFromDate
} from '@app/shared';

interface TelecallerBookAppointmentPageProps {
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

export const TelecallerBookAppointmentPage: React.FC<TelecallerBookAppointmentPageProps> = ({
  telecaller,
  initialPatientData,
  onBookingSuccess
}) => {
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
  const [patientLookupResult, setPatientLookupResult] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [successBanner, setSuccessBanner] = useState<string>('');

  // Pre-fill if navigated from Follow-ups
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
    if (!db) return;
    const unsub = onSnapshot(collection(db, 'doctors'), (snap) => {
      if (!snap.empty) {
        const list: DoctorProfile[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
        setDoctorsList(list);
      }
    });
    return () => unsub();
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

  // Search existing patient in database
  const handleLookupPatient = async () => {
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      alert('Please enter a valid 10-digit mobile number to search.');
      return;
    }

    setIsSearchingPatient(true);
    setPatientLookupResult('');

    try {
      if (!db) return;
      const last10 = cleanPhone.slice(-10);
      const q = query(collection(db, 'patients'), where('phone', '>=', last10), limit(5));
      const snap = await getDocs(q);

      let found: any = null;
      snap.forEach((d) => {
        const data = d.data();
        const p = String(data.phone || data.mobile || '');
        if (p.includes(last10)) found = data;
      });

      if (!found) {
        const qApp = query(collection(db, 'appointments'), where('phone', '>=', last10), limit(5));
        const snapApp = await getDocs(qApp);
        snapApp.forEach((d) => {
          const data = d.data();
          const p = String(data.phone || data.mobile || '');
          if (p.includes(last10)) found = data;
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
        setPatientLookupResult(`Existing record found: ${found.name || found.patientName}`);
      } else {
        setPatientLookupResult('New patient (no existing record found).');
      }
    } catch (e: any) {
      console.warn('Patient lookup warning:', e);
    } finally {
      setIsSearchingPatient(false);
    }
  };

  const handleBookAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patientName.trim()) {
      alert('Please enter the patient name.');
      return;
    }
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      alert('Please enter a valid 10-digit mobile number.');
      return;
    }
    if (!appointmentDate) {
      alert('Please select an appointment date.');
      return;
    }
    if (!selectedDoctor) {
      alert(`No consulting doctor is available at ${selectedBranch} on ${dayOfWeek} (${formatDDMMYYYY(appointmentDate)}). Please select another date or branch.`);
      return;
    }

    setIsSubmitting(true);

    try {
      if (!db) throw new Error('Database is offline.');

      const clean10 = cleanPhone.slice(-10);
      const branchShortcut = selectedBranch.slice(0, 3).toUpperCase();
      const generatedRegId = regId.trim() || `${branchShortcut}${Math.floor(100000 + Math.random() * 900000)}`;

      const newDocRef = doc(collection(db, 'appointments'));
      const appointmentId = newDocRef.id;

      const appPayload = {
        id: appointmentId,
        appointmentId,
        registrationId: generatedRegId,
        regId: generatedRegId,
        patientName: patientName.trim(),
        fullName: patientName.trim(),
        name: patientName.trim(),
        phone: clean10,
        phoneNumber: clean10,
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

      // Update followups collection
      const followupDoc = doc(collection(db, 'followups'), `${clean10}_followup`);
      await setDoc(followupDoc, {
        patientName: patientName.trim(),
        phone: clean10,
        registrationId: generatedRegId,
        branchName: selectedBranch,
        doctorName: selectedDoctor,
        callOutcome: 'Appointment Booked',
        status: 'Appointment Booked',
        appointmentDate,
        lastContactedBy: telecaller.name,
        updatedAt: new Date().toISOString()
      }, { merge: true }).catch(() => {});

      // Log activity
      await logTelecallerActivity({
        telecallerUid: telecaller.uid,
        telecallerId: telecaller.telecallerId,
        telecallerName: telecaller.name,
        patientId: generatedRegId,
        patientName: patientName.trim(),
        patientMobile: clean10,
        branchId: selectedBranch,
        branchName: selectedBranch,
        activityType: 'appointment_booked',
        appointmentId,
        appointmentDate,
        callOutcome: 'Appointment Booked',
        remarks: `Booked ${consultationMode} appointment with ${selectedDoctor} at ${selectedBranch} on ${appointmentDate} at ${appointmentTime}. Notes: ${remarks}`
      });

      setIsSubmitting(false);
      setSuccessBanner(`Appointment successfully booked for ${patientName} with ${selectedDoctor} at ${selectedBranch} on ${appointmentDate} at ${appointmentTime}!`);

      // Reset form
      setPatientName('');
      setPhoneNumber('');
      setRegId('');
      setDiseases('');
      setRemarks('');
      setPatientLookupResult('');

      if (onBookingSuccess) {
        setTimeout(onBookingSuccess, 1500);
      }
    } catch (err: any) {
      setIsSubmitting(false);
      alert('Booking failed: ' + err?.message);
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '900px', margin: '0 auto', fontFamily: 'inherit' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a', margin: 0 }}>Book Patient Appointment</h1>
        <p style={{ fontSize: '13px', color: '#64748b', margin: '4px 0 0' }}>
          Schedule patient appointments for any hospital branch directly on behalf of telecalling.
        </p>
      </div>

      {successBanner && (
        <div style={{
          background: '#f0fdf4',
          border: '1px solid #bbf7d0',
          color: '#15803d',
          padding: '14px 18px',
          borderRadius: '12px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontWeight: 600,
          fontSize: '13.5px'
        }}>
          <CheckCircle2 size={20} color="#16a34a" style={{ flexShrink: 0 }} />
          <span>{successBanner}</span>
        </div>
      )}

      <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', padding: '28px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
        <form onSubmit={handleBookAppointment}>
          {/* Branch Selection */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>
              Select Hospital Branch:
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {CLINIC_BRANCHES.map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setSelectedBranch(b)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '20px',
                    border: '1px solid',
                    borderColor: selectedBranch === b ? '#0284c7' : '#cbd5e1',
                    background: selectedBranch === b ? '#0284c7' : '#f8fafc',
                    color: selectedBranch === b ? '#ffffff' : '#475569',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '18px', marginBottom: '20px' }}>
            {/* Phone & Lookup */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                Patient Mobile Number: *
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="tel"
                  placeholder="10-digit Mobile Number"
                  value={phoneNumber}
                  onChange={(e) => {
                    setPhoneNumber(e.target.value);
                    setPatientLookupResult('');
                  }}
                  style={{
                    flex: 1,
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                    outline: 'none',
                    background: '#f8fafc'
                  }}
                />
                <button
                  type="button"
                  onClick={handleLookupPatient}
                  disabled={isSearchingPatient}
                  style={{
                    padding: '9px 14px',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#0284c7',
                    color: '#ffffff',
                    fontWeight: 600,
                    fontSize: '12.5px',
                    cursor: 'pointer'
                  }}
                >
                  {isSearchingPatient ? '...' : 'Search'}
                </button>
              </div>
              {patientLookupResult && (
                <div style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  marginTop: '6px',
                  color: patientLookupResult.includes('found') ? '#15803d' : '#64748b'
                }}>
                  {patientLookupResult}
                </div>
              )}
            </div>

            {/* Patient Name */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                Patient Full Name: *
              </label>
              <input
                type="text"
                placeholder="e.g. Ramesh Kumar"
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13px',
                  outline: 'none',
                  background: '#f8fafc',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '18px', marginBottom: '20px' }}>
            {/* Reg ID */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                Patient ID / Registration ID (Optional):
              </label>
              <input
                type="text"
                placeholder="Auto-generated if left empty"
                value={regId}
                onChange={(e) => setRegId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13px',
                  outline: 'none',
                  background: '#f8fafc',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {/* Appointment Date */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                Appointment Date: * <span style={{ color: '#0284c7', fontWeight: 600 }}>({dayOfWeek}, {formatDDMMYYYY(appointmentDate)})</span>
              </label>
              <input
                type="date"
                value={appointmentDate}
                onChange={(e) => setAppointmentDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '13px',
                  outline: 'none',
                  background: '#f8fafc',
                  boxSizing: 'border-box'
                }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '18px', marginBottom: '20px' }}>
            {/* Consulting Doctor Filtered by Availability */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                Consulting Doctor ({selectedBranch} • {dayOfWeek}): *
              </label>
              {availableDoctors.length > 0 ? (
                <select
                  value={selectedDoctor}
                  onChange={(e) => setSelectedDoctor(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                    outline: 'none',
                    background: '#ffffff',
                    boxSizing: 'border-box',
                    fontWeight: 600,
                    color: '#0f172a'
                  }}
                >
                  {availableDoctors.map((d) => (
                    <option key={d.id} value={d.name}>
                      {d.name} {d.timingSlots.length > 0 ? `(${d.timingSlots.join(', ')})` : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <div style={{
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px solid #fecaca',
                  background: '#fef2f2',
                  color: '#dc2626',
                  fontSize: '12px',
                  fontWeight: 600
                }}>
                  ⚠️ No doctors are scheduled or available at {selectedBranch} on {dayOfWeek} ({formatDDMMYYYY(appointmentDate)}). Please choose another date or branch.
                </div>
              )}
            </div>

            {/* Consultation Type */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                Consultation Type:
              </label>
              <div style={{ display: 'flex', gap: '10px' }}>
                {(['In-Clinic', 'Online'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setConsultationMode(m)}
                    style={{
                      flex: 1,
                      padding: '9px 12px',
                      borderRadius: '8px',
                      border: '1px solid',
                      borderColor: consultationMode === m ? '#0284c7' : '#cbd5e1',
                      background: consultationMode === m ? '#0284c7' : '#f8fafc',
                      color: consultationMode === m ? '#ffffff' : '#334155',
                      fontWeight: 600,
                      fontSize: '13px',
                      cursor: 'pointer'
                    }}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Time Slot Picker */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>
              Available Time Slots {selectedDoctor ? `for ${selectedDoctor}` : ''}:
            </label>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {activeDoctorSlots.map((slot) => (
                <button
                  key={slot}
                  type="button"
                  onClick={() => setAppointmentTime(slot)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: '1px solid',
                    borderColor: appointmentTime === slot ? '#0284c7' : '#e2e8f0',
                    background: appointmentTime === slot ? '#0284c7' : '#f8fafc',
                    color: appointmentTime === slot ? '#ffffff' : '#475569',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  {slot}
                </button>
              ))}
            </div>
          </div>

          {/* Medical Concern */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
              Health Concern / Diseases:
            </label>
            <input
              type="text"
              placeholder="e.g. Skin Allergy, PCOD, Migraine"
              value={diseases}
              onChange={(e) => setDiseases(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '13px',
                outline: 'none',
                background: '#f8fafc',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Remarks */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
              Telecaller Remarks & Notes:
            </label>
            <textarea
              rows={3}
              placeholder="Enter special patient requests, call summary, or discussion details..."
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '13px',
                outline: 'none',
                background: '#f8fafc',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: '10px',
              border: 'none',
              background: '#16a34a',
              color: '#ffffff',
              fontSize: '14.5px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            <CheckCircle2 size={18} />
            {isSubmitting ? 'Booking Appointment...' : 'Confirm & Book Appointment'}
          </button>
        </form>
      </div>
    </div>
  );
};

