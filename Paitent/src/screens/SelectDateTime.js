import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Button, Surface, Menu, Divider } from 'react-native-paper';
import { COLORS, SIZES } from '../constants/theme';
import {
  Calendar as CalendarIcon, MapPin, ChevronDown, Clock,
  ShieldCheck, ArrowRight, BookOpen, Users, Info, ChevronLeft
} from 'lucide-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { db } from '../firebase';
import { doc, updateDoc, addDoc, collection, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { sendRescheduleSMS } from '../utils/smsHelper';
import { sendRescheduleWhatsAppNotification } from '../utils/whatsappHelper';

const ALL_BRANCHES = [
  { id: 'Kphb', name: 'Kphb' },
  { id: 'Chandanagar', name: 'Chandanagar' },
  { id: 'Nallagandla', name: 'Nallagandla' },
  { id: 'Dilshuknagar', name: 'Dilshuknagar' }
];
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

import { getStandardBranchName } from '../utils/idGenerator';

const normalizeBranchName = (name) => {
  return getStandardBranchName(name).toLowerCase();
};

const SelectDateTime = ({ navigation, route }) => {
  const { branch: routeBranch = {}, doctor: routeDoctor = {} } = route.params || {};
  const doctor = { ...routeDoctor };
  if (doctor.name) {
    let docName = doctor.name;
    if (!docName.match(/^dr\./i) && !docName.match(/^dr\s/i)) {
      doctor.name = 'Dr. ' + docName;
    } else if (docName.match(/^dr\s/i)) {
      doctor.name = 'Dr. ' + docName.substring(3);
    }
  }

  // Setup state variables matching BookAppointment.js structure
  const [selectedBranch, setSelectedBranch] = useState(() => {
    if (routeBranch?.name) {
      const found = ALL_BRANCHES.find(b => normalizeBranchName(b.name) === normalizeBranchName(routeBranch.name));
      if (found) return found;
    }
    return ALL_BRANCHES[0];
  });

  const [modeOfConsultation, setModeOfConsultation] = useState(() => {
    return route.params?.modeOfConsultation || 'In-Clinic';
  });

  const [date, setDate] = useState(new Date());
  const [selectedSlot, setSelectedSlot] = useState('');
  const [rescheduleChecked, setRescheduleChecked] = useState(false);
  const [rescheduleLoading, setRescheduleLoading] = useState(false);
  const isSubmitting = useRef(false);

  const [availableSlots, setAvailableSlots] = useState([]);
  const [fetchingSlots, setFetchingSlots] = useState(false);
  const [menuVisible, setMenuVisible] = useState({ branch: false, mode: false });
  const [dropdownWidths, setDropdownWidths] = useState({});
  const [showDatePicker, setShowDatePicker] = useState(false);

  const onDropdownLayout = (key) => (event) => {
    const { width } = event.nativeEvent.layout;
    setDropdownWidths(prev => ({ ...prev, [key]: width }));
  };

  const toggleMenu = (key) => setMenuVisible(prev => ({ ...prev, [key]: !prev[key] }));

  // Helper functions for doctor timings and schedule options
  const generateSlotsForSelected = (docObj, branchName, targetDate) => {
    if (!docObj || !branchName || !targetDate) return [];

    const day = targetDate.getDay();

    let timings = docObj.timings;
    if (!timings || timings.length === 0) {
      const normalizeName = (name) => {
        return name ? name.toLowerCase().replace(/^dr\.\s*/, '').replace(/^dr\s*/, '').replace(/[^a-z0-9]/g, '') : '';
      };
      const nameKey = normalizeName(docObj.name);
      const templates = {
        'prashanthkvaidya': [
          { branch: 'Kphb', dayOfWeek: [1, 3, 5, 6], intervals: [['12:30', '14:00'], ['17:00', '19:00']] },
          { branch: 'Chandanagar', dayOfWeek: [1, 3, 5, 6], intervals: [['10:00', '12:00'], ['19:30', '21:00']] },
          { branch: 'Chandanagar', dayOfWeek: [0], intervals: [['11:00', '13:00']] },
          { branch: 'Nallagandla', dayOfWeek: [4], intervals: [['11:00', '13:00'], ['18:00', '20:00']] },
          { branch: 'Nallagandla', dayOfWeek: [0], intervals: [['18:00', '20:00']] }
        ],
        'ramakrishnachanduri': [
          { branch: 'Dilshuknagar', dayOfWeek: [0, 1, 2, 3, 4], intervals: [['10:00', '14:00'], ['17:00', '20:00']] },
          { branch: 'Nallagandla', dayOfWeek: [5, 6], intervals: [['10:00', '20:00']] }
        ],
        'jobeadhparveej': [
          { branch: 'Nallagandla', dayOfWeek: [1], intervals: [['11:00', '13:00'], ['18:00', '19:30']] },
          { branch: 'Kphb', dayOfWeek: [2, 3, 5], intervals: [['12:30', '14:00']] },
          { branch: 'Kphb', dayOfWeek: [6], intervals: [['12:30', '14:00'], ['17:00', '19:00']] }
        ],
        'padmapriya': [
          { branch: 'Nallagandla', dayOfWeek: [2, 3], intervals: [['10:00', '20:00']] },
          { branch: 'Nallagandla', dayOfWeek: [0], intervals: [['10:00', '17:00']] },
          { branch: 'Chandanagar', dayOfWeek: [1, 5], intervals: [['12:00', '20:00']] },
          { branch: 'Chandanagar', dayOfWeek: [0], intervals: [['17:30', '20:00']] },
          { branch: 'Chandanagar', dayOfWeek: [4], intervals: [['10:00', '20:00']] }
        ]
      };
      timings = templates[nameKey];
    }

    if (!timings || timings.length === 0) {
      const doctorBranches = docObj.branchName ? [docObj.branchName] : ['Kphb', 'Chandanagar', 'Nallagandla', 'Dilshuknagar'];
      timings = doctorBranches.map(brName => ({
        branch: brName,
        dayOfWeek: [0, 1, 2, 3, 4, 5, 6],
        intervals: [['10:00', '14:00'], ['17:00', '20:00']]
      }));
    }

    const dayTimings = [];
    (timings || []).forEach(t => {
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

  const getOtherBranchAvailability = (docObj, selectedBranchName, targetDate) => {
    if (!docObj || !targetDate || !selectedBranchName) return '';
    const day = targetDate.getDay();
    let docTimings = docObj.timings;
    if (!docTimings || docTimings.length === 0) {
      const normalizeName = (name) => {
        return name ? name.toLowerCase().replace(/^dr\.\s*/, '').replace(/^dr\s*/, '').replace(/[^a-z0-9]/g, '') : '';
      };
      const nameKey = normalizeName(docObj.name);
      const templates = {
        'prashanthkvaidya': [
          { branch: 'Kphb', dayOfWeek: [1, 3, 5, 6], intervals: [['12:30', '14:00'], ['17:00', '19:00']] },
          { branch: 'Chandanagar', dayOfWeek: [1, 3, 5, 6], intervals: [['10:00', '12:00'], ['19:30', '21:00']] },
          { branch: 'Chandanagar', dayOfWeek: [0], intervals: [['11:00', '13:00']] },
          { branch: 'Nallagandla', dayOfWeek: [4], intervals: [['11:00', '13:00'], ['18:00', '20:00']] },
          { branch: 'Nallagandla', dayOfWeek: [0], intervals: [['18:00', '20:00']] }
        ],
        'ramakrishnachanduri': [
          { branch: 'Dilshuknagar', dayOfWeek: [0, 1, 2, 3, 4], intervals: [['10:00', '14:00'], ['17:00', '20:00']] },
          { branch: 'Nallagandla', dayOfWeek: [5, 6], intervals: [['10:00', '20:00']] }
        ],
        'jobeadhparveej': [
          { branch: 'Nallagandla', dayOfWeek: [1], intervals: [['11:00', '13:00'], ['18:00', '19:30']] },
          { branch: 'Kphb', dayOfWeek: [2, 3, 5], intervals: [['12:30', '14:00']] },
          { branch: 'Kphb', dayOfWeek: [6], intervals: [['12:30', '14:00'], ['17:00', '19:00']] }
        ],
        'padmapriya': [
          { branch: 'Nallagandla', dayOfWeek: [2, 3], intervals: [['10:00', '20:00']] },
          { branch: 'Nallagandla', dayOfWeek: [0], intervals: [['10:00', '17:00']] },
          { branch: 'Chandanagar', dayOfWeek: [1, 5], intervals: [['12:00', '20:00']] },
          { branch: 'Chandanagar', dayOfWeek: [0], intervals: [['17:30', '20:00']] },
          { branch: 'Chandanagar', dayOfWeek: [4], intervals: [['10:00', '20:00']] }
        ]
      };
      docTimings = templates[nameKey];
    }

    if (!docTimings) return '';

    const weekdayName = targetDate.toLocaleDateString('en-US', { weekday: 'long' });

    const availableOtherBranches = [];
    docTimings.forEach(t => {
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
      return `On ${weekdayName}s, ${docObj.name} is available at: ${branchStrings.join(' | ')}.`;
    }

    const allWorkDays = {};
    docTimings.forEach(t => {
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
      return `Weekly Schedule for ${docObj.name}: ${generalSchedules.join(' | ')}.`;
    }

    return '';
  };

  const fetchAvailableSlots = async () => {
    if (!doctor || !selectedBranch || !date) return;
    setFetchingSlots(true);
    try {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const dateString = `${year}-${month}-${day}`;

      const q = query(
        collection(db, 'allpatients'),
        where('doctorId', '==', doctor.id),
        where('dateString', '==', dateString)
      );

      const qExtra = query(
        collection(db, 'extra_slots'),
        where('doctorId', '==', doctor.id),
        where('dateString', '==', dateString)
      );

      const [snapshot, snapExtra] = await Promise.all([getDocs(q), getDocs(qExtra)]);

      const bookings = snapshot.docs.map(d => d.data());
      const counts = {};
      const targetBranch = normalizeBranchName(selectedBranch.name);

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

      const qNoShows = query(
        collection(db, 'doctor_no_shows'),
        where('doctorId', '==', doctor.id)
      );
      const snapNoShows = await getDocs(qNoShows);
      const activeNoShows = [];
      const normFormBranch = (selectedBranch.name || '').toLowerCase().replace(/\s*branch\s*/i, '').trim();
      snapNoShows.forEach(docSnap => {
        const ns = docSnap.data();
        const nsBranch = (ns.branchName || ns.branchId || '').toLowerCase().replace(/\s*branch\s*/i, '').trim();
        if (nsBranch === normFormBranch) {
          activeNoShows.push(ns);
        }
      });

      const today = new Date();
      const isSelectedDateToday =
        date.getDate() === today.getDate() &&
        date.getMonth() === today.getMonth() &&
        date.getFullYear() === today.getFullYear();

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

      const generatedList = generateSlotsForSelected(doctor, selectedBranch.name, date);
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

  useEffect(() => {
    fetchAvailableSlots();
  }, [selectedBranch, date]);

  useEffect(() => {
    setSelectedSlot('');
  }, [selectedBranch, date]);

  // Adjust date to first available day when doctor or branch changes
  const getFirstAvailableDate = (docObj, branchName, fallbackDate) => {
    if (!docObj || !branchName) return fallbackDate || new Date();
    const start = new Date();
    for (let i = 0; i < 30; i++) {
      const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
      const slots = generateSlotsForSelected(docObj, branchName, d);
      if (slots.length > 0) {
        return d;
      }
    }
    return fallbackDate || start;
  };

  useEffect(() => {
    if (doctor && selectedBranch) {
      const slots = generateSlotsForSelected(doctor, selectedBranch.name, date);
      if (slots.length === 0) {
        const nextAvail = getFirstAvailableDate(doctor, selectedBranch.name, date);
        setDate(nextAvail);
      }
    }
  }, [selectedBranch]);

  const handleReschedule = async () => {
    if (rescheduleLoading || isSubmitting.current) return;
    isSubmitting.current = true;
    if (!date || !selectedSlot) {
      alert('Please select both date and time slot');
      isSubmitting.current = false;
      return;
    }
    if (!rescheduleChecked) {
      alert('Please confirm the checkbox to reschedule');
      isSubmitting.current = false;
      return;
    }
    setRescheduleLoading(true);
    try {
      const collectionName = 'allpatients';
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const dateString = `${year}-${month}-${day}`;

      const updateData = {
        timeSlot: selectedSlot,
        branchId: getStandardBranchName(selectedBranch.id),
        branchName: getStandardBranchName(selectedBranch.name),
        modeOfConsultation: modeOfConsultation,
        status: 'pending', // Reset status to pending so receptionist can review/approve reschedule
        date: date.toISOString(),
        dateString: dateString,
        appointmentDate: `${day}/${month}/${year}`,
        updatedAt: serverTimestamp()
      };

      await updateDoc(doc(db, collectionName, route.params.appointmentId), updateData);

      // 2. Notify receptionists of that branch
      try {
        const qRec = query(collection(db, 'users'), where('role', '==', 'receptionist'));
        const snapRec = await getDocs(qRec);
        const targetBranchNorm = normalizeBranchName(selectedBranch.name);
        const patientName = route.params.patientName || 'Patient';

        const formattedDateStr = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

        snapRec.forEach(async (docSnap) => {
          const receptionist = docSnap.data();
          const repBranchIdNorm = normalizeBranchName(receptionist.branchId);
          const repBranchNameNorm = normalizeBranchName(receptionist.branchName);

          if (repBranchIdNorm === targetBranchNorm || repBranchNameNorm === targetBranchNorm) {
            await addDoc(collection(db, 'notifications'), {
              userId: receptionist.uid || docSnap.id,
              title: '📅 Appointment Rescheduled',
              body: `${patientName} rescheduled their appointment to ${formattedDateStr} at ${selectedSlot}.`,
              type: 'booking_rescheduled_alert',
              isRead: false,
              createdAt: serverTimestamp(),
              metadata: {
                appointmentId: route.params.appointmentId,
                patientName,
                date: formattedDateStr,
                timeSlot: selectedSlot,
                branchName: selectedBranch.name
              }
            });
          }
        });
      } catch (notifRecErr) {
        console.warn("Error notifying receptionists of reschedule:", notifRecErr);
      }

      // 3. Trigger SMS & WhatsApp reschedule confirmation notifications
      try {
        const patientPhone = route.params?.phone || route.params?.patientPhone || '';
        const cleanPhone = String(patientPhone).replace(/\D/g, '').slice(-10);
        const patientName = route.params?.patientName || 'Patient';
        const docName = route.params?.doctor?.name || 'Doctor';
        const branchName = selectedBranch?.name || 'KPHB';

        if (cleanPhone) {
          sendRescheduleSMS(
            cleanPhone,
            patientName,
            docName,
            formattedDateStr,
            selectedSlot,
            branchName
          ).catch(smsErr => console.warn('Reschedule SMS notice:', smsErr));

          sendRescheduleWhatsAppNotification({
            patientName,
            phone: cleanPhone,
            date: formattedDateStr,
            time: selectedSlot,
            doctorName: docName,
            branch: branchName
          }).catch(waErr => console.warn('Reschedule WhatsApp notice:', waErr));
        }
      } catch (notifErr) {
        console.warn('Reschedule notification error:', notifErr);
      }

      alert('Appointment rescheduled successfully!');
      navigation.navigate('Home');
    } catch (err) {
      console.error('Error rescheduling appointment:', err);
      alert('Failed to reschedule appointment. Please try again.');
    } finally {
      isSubmitting.current = false;
      setRescheduleLoading(false);
    }
  };
  const handleContinue = () => {
    if (!date || !selectedSlot) {
      alert('Please select both date and time slot');
      return;
    }
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const dateString = `${year}-${month}-${day}`;

    navigation.navigate('BookingSummary', {
      branch: selectedBranch,
      doctor,
      date: dateString,
      slot: selectedSlot
    });
  };

  const SectionHeader = ({ number, title }) => (
    <View style={styles.sectionHeader}>
      <View style={styles.numberBadge}>
        <Text style={styles.numberText}>{number}</Text>
      </View>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionLine} />
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
          <ChevronLeft size={24} color="#1e293b" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Reschedule Appointment</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* original appointment details card */}
        <Surface style={styles.originalDetailsCard}>
          <Text style={styles.cardHeader}>Original Appointment Info</Text>
          <View style={styles.cardDivider} />

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Patient:</Text>
            <Text style={styles.infoValue}>{route.params?.patientName || 'Patient'}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Doctor:</Text>
            <Text style={styles.infoValue}>{doctor.name}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Original Branch:</Text>
            <Text style={styles.infoValue}>{routeBranch?.name || 'Not Specified'}</Text>
          </View>
        </Surface>

        {/* Rescheduling Form Styled Exactly Like BookAppointment.js */}
        <Surface style={styles.sectionCard}>
          <SectionHeader number="1" title="Appointment Information" />

          {/* Row 1: Date & Mode of Consultation */}
          <View style={styles.inputRow}>
            <View style={styles.flex1}>
              <Text style={styles.inputLabel}>Date</Text>
              <TouchableOpacity style={styles.dropdown} onPress={() => setShowDatePicker(true)}>
                <CalendarIcon size={18} color="#94a3b8" />
                <Text style={styles.dropdownText}>{date.toLocaleDateString()}</Text>
                <CalendarIcon size={18} color="#94a3b8" />
              </TouchableOpacity>
              {showDatePicker && (
                <DateTimePicker
                  value={date}
                  mode="date"
                  display="default"
                  minimumDate={new Date()}
                  maximumDate={new Date(new Date().getTime() + 30 * 24 * 60 * 60 * 1000)}
                  onValueChange={(event, selectedDate) => {
                    setShowDatePicker(false);
                    if (selectedDate) {
                      setDate(selectedDate);
                    }
                  }}
                  onDismiss={() => setShowDatePicker(false)}
                />
              )}
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
                    <Text style={[styles.dropdownText, !modeOfConsultation && { color: '#94a3b8' }]} numberOfLines={1}>
                      {modeOfConsultation || 'Select'}
                    </Text>
                    <ChevronDown size={18} color="#94a3b8" />
                  </TouchableOpacity>
                }
              >
                <ScrollView style={{ maxHeight: 120 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={true}>
                  {['In-Clinic', 'Online'].map((item) => (
                    <Menu.Item
                      key={item}
                      onPress={() => { setModeOfConsultation(item); toggleMenu('mode'); }}
                      title={item}
                      titleStyle={{ color: '#000000', fontWeight: '500', fontSize: 14 }}
                    />
                  ))}
                </ScrollView>
              </Menu>
            </View>
          </View>

          {/* Row 2: Select Branch */}
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
                  <Text style={[styles.dropdownText, !selectedBranch && { color: '#94a3b8' }]} numberOfLines={1}>
                    {selectedBranch?.name || 'Select Branch'}
                  </Text>
                  <ChevronDown size={18} color="#94a3b8" />
                </TouchableOpacity>
              }
            >
              <ScrollView style={{ maxHeight: 200 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={true}>
                {ALL_BRANCHES.map((br) => (
                  <Menu.Item
                    key={br.id}
                    onPress={() => { setSelectedBranch(br); toggleMenu('branch'); }}
                    title={br.name}
                    titleStyle={{ color: '#000000', fontWeight: '500', fontSize: 14 }}
                  />
                ))}
              </ScrollView>
            </Menu>
          </View>

          {/* Row 3: Available Slots Grid */}
          <View style={{ marginTop: 24 }}>
            <View style={styles.slotHeader}>
              <Clock size={16} color={COLORS.secondary} />
              <Text style={styles.subLabel}>  Available Slots</Text>
            </View>

            {fetchingSlots ? (
              <ActivityIndicator color={COLORS.secondary} style={{ marginTop: 10 }} />
            ) : availableSlots.length === 0 ? (
              <View style={[styles.noDoctorMsg, { flexDirection: 'column', alignItems: 'stretch', padding: 12 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                  <Info size={16} color="#ef4444" />
                  <Text style={[styles.noDoctorText, { color: '#ef4444', fontWeight: '800', marginLeft: 8 }]}>
                    {`${doctor.name} is not available on ${date.toLocaleDateString('en-US', { weekday: 'long' })}s at ${selectedBranch.name}.`}
                  </Text>
                </View>
                <Text style={[styles.noDoctorText, { color: '#475569', fontSize: 11, lineHeight: 16, marginTop: 4, paddingLeft: 24 }]}>
                  {getOtherBranchAvailability(doctor, selectedBranch.name, date)}
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
                      selectedSlot === slot.time && styles.slotSelected
                    ]}
                    disabled={!slot.isAvailable}
                    onPress={() => setSelectedSlot(slot.time)}
                  >
                    <Text style={[
                      styles.slotText,
                      !slot.isAvailable && styles.slotTextDisabled,
                      selectedSlot === slot.time && styles.slotTextSelected
                    ]}>
                      {slot.time}
                    </Text>
                    {slot.isAvailable ? (
                      <Text style={[
                        styles.sessionsLeftText,
                        selectedSlot === slot.time && styles.sessionsLeftTextSelected
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

        {/* Reschedule Checkbox Confirmation */}
        {route.params?.isReschedule && selectedSlot ? (
          <TouchableOpacity
            style={styles.confirmCheckboxRow}
            onPress={() => setRescheduleChecked(!rescheduleChecked)}
            activeOpacity={0.8}
          >
            <View style={[styles.confirmCheckbox, rescheduleChecked && styles.confirmCheckboxChecked]}>
              {rescheduleChecked && <View style={styles.checkedIndicator} />}
            </View>
            <Text style={styles.confirmCheckboxLabel}>
              I confirm that I want to reschedule this appointment.
            </Text>
          </TouchableOpacity>
        ) : null}

        <View style={styles.footerSpacing} />
      </ScrollView>

      {/* Reschedule Confirmation Button Footer */}
      <View style={styles.footer}>
        <Button
          mode="contained"
          onPress={route.params?.isReschedule ? handleReschedule : handleContinue}
          style={styles.confirmBtn}
          contentStyle={styles.confirmBtnContent}
          buttonColor={COLORS.secondary}
          disabled={rescheduleLoading || (route.params?.isReschedule ? (!selectedSlot || !rescheduleChecked) : !selectedSlot)}
        >
          {rescheduleLoading ? "Rescheduling..." : (route.params?.isReschedule ? "Confirm Reschedule" : "Continue")}
        </Button>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fcfdfe' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  iconBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#1e293b' },
  scrollContent: { padding: 16, paddingBottom: 100 },
  originalDetailsCard: {
    padding: 16,
    borderRadius: 20,
    backgroundColor: '#f8fafc',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    elevation: 0,
  },
  cardHeader: {
    fontSize: 14,
    fontWeight: '800',
    color: '#475569',
    marginBottom: 8,
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#cbd5e1',
    marginBottom: 10,
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  infoLabel: {
    width: 120,
    fontSize: 13,
    color: '#64748b',
    fontWeight: '600',
  },
  infoValue: {
    fontSize: 13,
    color: '#1e293b',
    fontWeight: '700',
    flex: 1,
  },
  sectionCard: { padding: 20, borderRadius: 24, backgroundColor: COLORS.white, marginBottom: 20, elevation: 2, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 10, borderWidth: 1, borderColor: '#f1f5f9' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  numberBadge: { width: 24, height: 24, borderRadius: 6, backgroundColor: COLORS.secondary, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  numberText: { fontSize: 12, fontWeight: '800', color: COLORS.white },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#1e293b' },
  sectionLine: { flex: 1, height: 1, backgroundColor: '#f1f5f9', marginLeft: 12 },
  inputRow: { flexDirection: 'row', width: '100%' },
  flex1: { flex: 1 },
  spacer: { width: 16 },
  inputLabel: { fontSize: 12, fontWeight: '700', color: '#1e293b', marginBottom: 8 },
  fullWidthInput: { marginTop: 16 },
  dropdown: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, height: 50, borderRadius: 16, borderWidth: 1.5, borderColor: '#e2e8f0', backgroundColor: '#fcfdfe', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  dropdownText: { flex: 1, marginLeft: 12, fontSize: 13, color: '#1e293b', fontWeight: '500' },
  subLabel: { fontSize: 13, fontWeight: '700', color: '#1e293b', marginBottom: 12 },
  slotHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  noDoctorMsg: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', padding: 12, borderRadius: 8, marginBottom: 12 },
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
  footerSpacing: { height: 40 },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: SIZES.padding, backgroundColor: COLORS.white, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  confirmBtn: { borderRadius: 16 },
  confirmBtnContent: { height: 50, justifyContent: 'center' },
  confirmCheckboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 20,
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  confirmCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  confirmCheckboxChecked: {
    backgroundColor: COLORS.primary,
  },
  checkedIndicator: {
    width: 8,
    height: 8,
    backgroundColor: '#fff',
    borderRadius: 2,
  },
  confirmCheckboxLabel: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '600',
    flex: 1,
  },
});

export default SelectDateTime;
