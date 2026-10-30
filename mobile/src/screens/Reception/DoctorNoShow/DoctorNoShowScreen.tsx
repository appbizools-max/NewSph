import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  ScrollView,
  ActivityIndicator
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import { getSafeDb, collection, onSnapshot, addDoc, deleteDoc, doc } from '../../../utils/firebaseSafe';
import {
  MASTER_DOCTORS_ROSTER,
  normalizeBranchKey,
  getCanonicalBranchName,
  getCanonicalDoctorName,
  getDayNameFromDate,
  getDoctorsForBranch,
  getDoctorScheduleOnDate,
  getScheduledDoctorsForBranchAndDate,
  getWorkingDaysSummary,
  DoctorRosterItem
} from './doctorRosterHelper';

export interface DoctorNoShowOverride {
  id: string;
  doctorId: string;
  doctorName: string;
  branchName: string;
  type: 'date' | 'date_range' | 'session' | 'time_range';
  date?: string;
  startDate?: string;
  endDate?: string;
  session?: 'morning' | 'evening';
  startTime?: string;
  endTime?: string;
  reason: string;
  createdAt: string;
}

const INITIAL_MOBILE_NO_SHOWS: DoctorNoShowOverride[] = [
  {
    id: 'NS-1',
    doctorId: 'DOC-1',
    doctorName: 'Dr. Prashanth K Vaidya',
    branchName: 'KPHB Branch',
    type: 'date',
    date: '2026-09-10',
    reason: 'Emergency Leave',
    createdAt: '2026-09-10'
  },
  {
    id: 'NS-2',
    doctorId: 'DOC-2',
    doctorName: 'Dr. Ramakrishna Chanduri',
    branchName: 'Nallagandla Branch',
    type: 'session',
    date: '2026-09-11',
    session: 'morning',
    reason: 'Conference Meeting',
    createdAt: '2026-09-10'
  }
];

const BRANCH_OPTIONS = [
  'KPHB Branch',
  'Nallagandla Branch',
  'Dilshuknagar Branch',
  'Chandanagar Branch'
];

interface DoctorNoShowScreenProps {
  currentBranch?: string;
}

export const DoctorNoShowScreen: React.FC<DoctorNoShowScreenProps> = ({ currentBranch }) => {
  const db = getSafeDb();
  const defaultBranch = getCanonicalBranchName(currentBranch);
  const [noShows, setNoShows] = useState<DoctorNoShowOverride[]>(INITIAL_MOBILE_NO_SHOWS);
  const [showAddModal, setShowAddModal] = useState(false);

  // Add Modal state (Strictly locked to receptionist's branch)
  const [overrideType, setOverrideType] = useState<'date' | 'date_range' | 'session' | 'time_range'>('date');
  const [singleDate, setSingleDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return d.toISOString().split('T')[0];
  });
  const [selectedDoctor, setSelectedDoctor] = useState('Dr. Prashanth K Vaidya');
  const [session, setSession] = useState<'morning' | 'evening'>('morning');
  const [startTime, setStartTime] = useState('10:00 AM');
  const [endTime, setEndTime] = useState('01:00 PM');
  const [reason, setReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Doctors belonging to the active branch
  const modalBranchDoctors = useMemo(() => {
    return getDoctorsForBranch(defaultBranch);
  }, [defaultBranch]);

  // Modal active date and day of week
  const activeDate = overrideType === 'date_range' ? startDate : singleDate;
  const activeDayName = getDayNameFromDate(activeDate);

  // Scheduled doctors at defaultBranch on activeDate
  const scheduledDoctorsOnDate = useMemo(() => {
    return getScheduledDoctorsForBranchAndDate(defaultBranch, activeDate);
  }, [defaultBranch, activeDate]);

  // Available modal doctors list
  const availableModalDoctors = useMemo(() => {
    if (overrideType === 'date_range') {
      return modalBranchDoctors.map(doc => ({
        id: doc.id,
        name: doc.name,
        badge: `Days: ${getWorkingDaysSummary(doc, defaultBranch)}`,
        isScheduled: true
      }));
    }

    if (scheduledDoctorsOnDate.length > 0) {
      return scheduledDoctorsOnDate.map(item => ({
        id: item.doctor.id,
        name: item.doctor.name,
        badge: `${item.timings}`,
        isScheduled: true
      }));
    }

    return modalBranchDoctors.map(doc => ({
      id: doc.id,
      name: doc.name,
      badge: `Not Scheduled on ${activeDayName}`,
      isScheduled: false
    }));
  }, [overrideType, modalBranchDoctors, scheduledDoctorsOnDate, defaultBranch, activeDayName]);

  // Auto-select valid doctor when branch, date, or type changes
  useEffect(() => {
    if (availableModalDoctors.length > 0) {
      const isCurrentValid = availableModalDoctors.some(d => d.name === selectedDoctor);
      if (!isCurrentValid) {
        setSelectedDoctor(availableModalDoctors[0].name);
      }
    }
  }, [availableModalDoctors, selectedDoctor]);

  // Real-time Firestore sync with Web & Mobile
  useEffect(() => {
    if (!db) return;
    try {
      const q = collection(db, 'doctor_no_shows');
      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const list: DoctorNoShowOverride[] = snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...(docSnap.data() as Omit<DoctorNoShowOverride, 'id'>)
          }));
          setNoShows(list);
        },
        (err) => {
          console.warn('Firestore doctor_no_shows error on mobile:', err);
        }
      );
      return () => unsubscribe();
    } catch (e) {
      console.warn('Firestore subscription error:', e);
    }
  }, []);

  const handleAdd = async () => {
    if (!reason.trim()) {
      Alert.alert('Missing Reason', 'Please enter a reason for the Doctor No Show.');
      return;
    }

    const matchedDoc = modalBranchDoctors.find(
      d => getCanonicalDoctorName(d.name) === getCanonicalDoctorName(selectedDoctor)
    );
    if (!matchedDoc) {
      Alert.alert('Invalid Doctor', `${selectedDoctor} does not belong to ${defaultBranch}. Please select a doctor from this branch.`);
      return;
    }

    // Schedule check for single date
    if (overrideType !== 'date_range') {
      const sched = getDoctorScheduleOnDate(matchedDoc, defaultBranch, singleDate);
      if (!sched.isScheduled) {
        Alert.alert(
          'Doctor Off-Duty',
          `${selectedDoctor} is normally not rostered at ${defaultBranch} on ${sched.dayName} (${singleDate}). No Show is usually recorded for rostered clinic days. Do you wish to continue?`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Confirm No Show', onPress: () => proceedSave(matchedDoc.id) }
          ]
        );
        return;
      }
    }

    proceedSave(matchedDoc.id);
  };

  const proceedSave = async (doctorId: string) => {
    const payload: Record<string, any> = {
      doctorId,
      doctorName: selectedDoctor,
      branchName: defaultBranch,
      type: overrideType,
      reason: reason.trim(),
      createdAt: new Date().toISOString().split('T')[0]
    };

    if (overrideType === 'date_range') {
      if (startDate) payload.startDate = startDate;
      if (endDate) payload.endDate = endDate;
    } else {
      if (singleDate) payload.date = singleDate;
    }

    if (overrideType === 'session') {
      if (session) payload.session = session;
    }

    if (overrideType === 'time_range') {
      if (startTime) payload.startTime = startTime;
      if (endTime) payload.endTime = endTime;
    }

    // Safety: ensure no undefined properties exist before Firestore addDoc
    Object.keys(payload).forEach(key => {
      if (payload[key] === undefined) {
        delete payload[key];
      }
    });

    setIsSaving(true);
    try {
      if (db) {
        const docRef = await addDoc(collection(db, 'doctor_no_shows'), payload);
        const savedItem: DoctorNoShowOverride = {
          id: docRef.id,
          ...(payload as Omit<DoctorNoShowOverride, 'id'>)
        };
        setNoShows(prev => [savedItem, ...prev.filter(item => item.id !== docRef.id)]);
      } else {
        const newItem: DoctorNoShowOverride = {
          id: `NS-${Date.now()}`,
          ...(payload as Omit<DoctorNoShowOverride, 'id'>)
        };
        setNoShows(prev => [newItem, ...prev]);
      }
      setReason('');
      setShowAddModal(false);
      Alert.alert('Success', 'Doctor No Show override recorded successfully.');
    } catch (err) {
      console.error('Error adding no show:', err);
      const newItem: DoctorNoShowOverride = {
        id: `NS-${Date.now()}`,
        ...(payload as Omit<DoctorNoShowOverride, 'id'>)
      };
      setNoShows(prev => [newItem, ...prev]);
      setReason('');
      setShowAddModal(false);
      Alert.alert('Saved Offline', 'Doctor No Show saved locally.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert(
      'Remove Block',
      'Are you sure you want to remove this Doctor No Show unavailability block?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              if (db && !id.startsWith('NS-')) {
                await deleteDoc(doc(db, 'doctor_no_shows', id));
              }
            } catch (err) {
              console.warn('Error deleting document:', err);
            }
            setNoShows(prev => prev.filter(item => item.id !== id));
          }
        }
      ]
    );
  };

  const filteredNoShows = noShows.filter(item => {
    // Strictly filter for the current reception branch only
    return normalizeBranchKey(item.branchName) === normalizeBranchKey(defaultBranch);
  });

  return (
    <View style={styles.container}>
      {/* Header - Non-overlapping flex layout */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <View style={styles.headerIconWrapper}>
            <Feather name="user-x" size={20} color="#dc2626" />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.title} numberOfLines={1}>Doctor No Show</Text>
            <Text style={styles.subtitle} numberOfLines={1}>Live Sync Active</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.addBtnHeader}
          onPress={() => setShowAddModal(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={17} color="#ffffff" />
          <Text style={styles.addBtnHeaderText}>Add Block</Text>
        </TouchableOpacity>
      </View>

      {/* Reception Branch Card - Strictly this branch only */}
      <View style={styles.currentBranchBanner}>
        <View style={styles.branchBannerLeft}>
          <View style={styles.branchIconBadge}>
            <Ionicons name="location" size={16} color="#0284c7" />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.branchBannerTitle} numberOfLines={1}>{defaultBranch}</Text>
            <Text style={styles.branchBannerSubtitle} numberOfLines={1}>Showing blocks for this branch</Text>
          </View>
        </View>
        <View style={styles.activeTag}>
          <Text style={styles.activeTagText}>Active Branch</Text>
        </View>
      </View>

      {/* Summary Counts - Compact non-wrapping cards */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{filteredNoShows.length}</Text>
          <Text style={styles.summaryLabel} numberOfLines={1}>Total</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={[styles.summaryValue, { color: '#dc2626' }]}>
            {filteredNoShows.filter(n => n.type === 'date' || n.type === 'date_range').length}
          </Text>
          <Text style={styles.summaryLabel} numberOfLines={1}>Full Day</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={[styles.summaryValue, { color: '#2563eb' }]}>
            {filteredNoShows.filter(n => n.type === 'session' || n.type === 'time_range').length}
          </Text>
          <Text style={styles.summaryLabel} numberOfLines={1}>Session/Hour</Text>
        </View>
      </View>

      {/* List */}
      <FlatList
        data={filteredNoShows}
        keyExtractor={item => item.id}
        contentContainerStyle={{ paddingBottom: 24 }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="checkmark-circle-outline" size={42} color="#94a3b8" />
            <Text style={styles.emptyTitle}>No Active Doctor No Shows</Text>
            <Text style={styles.emptySubtitle}>All doctors are available per normal clinic schedules.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.docName}>{item.doctorName}</Text>
                <View style={styles.metaRow}>
                  <Ionicons name="location-outline" size={13} color="#64748b" />
                  <Text style={styles.branchText}>{item.branchName}</Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => handleDelete(item.id)}
                style={styles.deleteBtn}
              >
                <Ionicons name="trash-outline" size={18} color="#dc2626" />
              </TouchableOpacity>
            </View>

            {/* Block Schedule & Type */}
            <View style={styles.scheduleRow}>
              <View style={[
                styles.typeBadge,
                item.type === 'date' && { backgroundColor: '#fee2e2' },
                item.type === 'date_range' && { backgroundColor: '#fef3c7' },
                item.type === 'session' && { backgroundColor: '#eff6ff' },
                item.type === 'time_range' && { backgroundColor: '#f3e8ff' }
              ]}>
                <Text style={[
                  styles.typeBadgeText,
                  item.type === 'date' && { color: '#dc2626' },
                  item.type === 'date_range' && { color: '#b45309' },
                  item.type === 'session' && { color: '#1d4ed8' },
                  item.type === 'time_range' && { color: '#7e22ce' }
                ]}>
                  {item.type.replace('_', ' ').toUpperCase()}
                </Text>
              </View>

              <Text style={styles.scheduleDetailText}>
                {item.type === 'date' && `📅 Full Day: ${item.date}`}
                {item.type === 'date_range' && `🗓️ ${item.startDate} to ${item.endDate}`}
                {item.type === 'session' && `🌅 ${item.date} (${item.session?.toUpperCase()} Session)`}
                {item.type === 'time_range' && `⏰ ${item.date} (${item.startTime} - ${item.endTime})`}
              </Text>
            </View>

            {/* Reason */}
            <View style={styles.reasonBadge}>
              <Text style={styles.reasonText}>Reason: {item.reason}</Text>
            </View>
          </View>
        )}
      />

      {/* Add Modal */}
      {showAddModal && (
        <Modal visible={showAddModal} transparent animationType="slide" onRequestClose={() => setShowAddModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, marginRight: 8 }}>
                <View style={{ backgroundColor: '#fee2e2', padding: 6, borderRadius: 8 }}>
                  <Feather name="user-x" size={18} color="#dc2626" />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.modalTitle} numberOfLines={1}>Add Doctor No Show</Text>
                  <Text style={{ fontSize: 10, color: '#64748b' }} numberOfLines={1}>Branch roster & date availability</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setShowAddModal(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close" size={22} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
              {/* 1. Branch (Locked to Receptionist Branch) */}
              <Text style={styles.fieldLabel}>1. Branch</Text>
              <View style={styles.lockedBranchCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                  <View style={styles.lockedBranchIconWrapper}>
                    <Ionicons name="business" size={18} color="#0284c7" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.lockedBranchTitle}>{defaultBranch}</Text>
                    <Text style={styles.lockedBranchSubtitle}>Current Reception Branch (Locked)</Text>
                  </View>
                </View>
                <View style={styles.lockedTag}>
                  <Text style={styles.lockedTagText}>Locked</Text>
                </View>
              </View>

              {/* 2. Override Type */}
              <Text style={styles.fieldLabel}>2. Override Type</Text>
              <View style={styles.typeGrid}>
                {[
                  { id: 'date', label: '📅 Full Day' },
                  { id: 'date_range', label: '🗓️ Date Range' },
                  { id: 'session', label: '🌅 Session' },
                  { id: 'time_range', label: '⏰ Time Range' }
                ].map((t) => {
                  const isSel = overrideType === t.id;
                  return (
                    <TouchableOpacity
                      key={t.id}
                      style={[styles.typeBtn, isSel && styles.typeBtnActive]}
                      onPress={() => setOverrideType(t.id as any)}
                    >
                      <Text style={[styles.typeBtnText, isSel && styles.typeBtnTextActive]}>
                        {t.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* 3. Date Inputs */}
              {overrideType === 'date_range' ? (
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>Start Date (YYYY-MM-DD)</Text>
                    <TextInput
                      style={styles.textInput}
                      value={startDate}
                      onChangeText={setStartDate}
                      placeholder="2026-09-10"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>End Date (YYYY-MM-DD)</Text>
                    <TextInput
                      style={styles.textInput}
                      value={endDate}
                      onChangeText={setEndDate}
                      placeholder="2026-09-12"
                    />
                  </View>
                </View>
              ) : (
                <View style={{ marginBottom: 10 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={styles.fieldLabel}>Date (YYYY-MM-DD)</Text>
                    <Text style={{ fontSize: 11, color: '#2563eb', fontWeight: '700' }}>
                      Day: {activeDayName}
                    </Text>
                  </View>
                  <TextInput
                    style={styles.textInput}
                    value={singleDate}
                    onChangeText={setSingleDate}
                    placeholder="2026-09-10"
                  />
                </View>
              )}

              {/* Status Alert Banner */}
              {overrideType !== 'date_range' && (
                scheduledDoctorsOnDate.length > 0 ? (
                  <View style={styles.rosterBannerSuccess}>
                    <Ionicons name="checkmark-circle" size={14} color="#059669" />
                    <Text style={styles.rosterBannerSuccessText}>
                      {scheduledDoctorsOnDate.length} doctor(s) rostered at {defaultBranch} on {activeDayName}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.rosterBannerWarning}>
                    <Ionicons name="warning" size={14} color="#d97706" />
                    <Text style={styles.rosterBannerWarningText}>
                      No doctors normally rostered at {defaultBranch} on {activeDayName}s.
                    </Text>
                  </View>
                )
              )}

              {/* 4. Doctor Selector (Filtered strictly by branch & date) */}
              <Text style={styles.fieldLabel}>
                3. Select Doctor ({defaultBranch} Roster Only)
              </Text>
              <View style={{ gap: 6, marginBottom: 12 }}>
                {availableModalDoctors.map((d) => {
                  const isSel = selectedDoctor === d.name;
                  return (
                    <TouchableOpacity
                      key={d.id}
                      style={[
                        styles.doctorCardOption,
                        isSel && styles.doctorCardOptionActive,
                        !d.isScheduled && styles.doctorCardOptionOff
                      ]}
                      onPress={() => setSelectedDoctor(d.name)}
                    >
                      <View style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <Text style={[styles.docCardName, isSel && styles.docCardNameActive]} numberOfLines={1}>
                            {d.name}
                          </Text>
                          {d.isScheduled ? (
                            <View style={styles.activePill}>
                              <Text style={styles.activePillText}>Rostered</Text>
                            </View>
                          ) : (
                            <View style={styles.offPill}>
                              <Text style={styles.offPillText}>Off Day</Text>
                            </View>
                          )}
                        </View>
                        <Text style={[styles.docCardTiming, isSel && { color: '#1d4ed8' }]} numberOfLines={1}>
                          {d.badge}
                        </Text>
                      </View>
                      <Ionicons
                        name={isSel ? 'radio-button-on' : 'radio-button-off'}
                        size={20}
                        color={isSel ? '#2563eb' : '#94a3b8'}
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Session Selector */}
              {overrideType === 'session' && (
                <View style={{ marginBottom: 12 }}>
                  <Text style={styles.fieldLabel}>Session</Text>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity
                      style={[styles.sessionBtn, session === 'morning' && styles.sessionBtnActive]}
                      onPress={() => setSession('morning')}
                    >
                      <Text style={[styles.sessionBtnText, session === 'morning' && styles.sessionBtnTextActive]}>
                        🌅 Morning (10 AM - 1 PM)
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.sessionBtn, session === 'evening' && styles.sessionBtnActive]}
                      onPress={() => setSession('evening')}
                    >
                      <Text style={[styles.sessionBtnText, session === 'evening' && styles.sessionBtnTextActive]}>
                        🌆 Evening (5 PM - 8 PM)
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Time Range */}
              {overrideType === 'time_range' && (
                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>Start Time (e.g. 10:00 AM)</Text>
                    <TextInput
                      style={styles.textInput}
                      value={startTime}
                      onChangeText={setStartTime}
                      placeholder="10:00 AM"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>End Time (e.g. 01:00 PM)</Text>
                    <TextInput
                      style={styles.textInput}
                      value={endTime}
                      onChangeText={setEndTime}
                      placeholder="01:00 PM"
                    />
                  </View>
                </View>
              )}

              {/* Reason */}
              <Text style={styles.fieldLabel}>Reason for No Show</Text>
              <TextInput
                style={[styles.textInput, { minHeight: 44 }]}
                placeholder="e.g. Emergency Leave, Personal emergency, Out of town..."
                placeholderTextColor="#94a3b8"
                value={reason}
                onChangeText={setReason}
              />

              {/* Actions */}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setShowAddModal(false)}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.submitBtn}
                  onPress={handleAdd}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.submitBtnText}>Save No Show Block</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
      )}
    </View>
  );
};

export const MobileDoctorNoShowScreen = DoctorNoShowScreen;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
  headerIconWrapper: { backgroundColor: '#fee2e2', padding: 8, borderRadius: 10 },
  title: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  subtitle: { fontSize: 11, color: '#64748b', marginTop: 1 },
  addBtnHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#dc2626', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
    flexShrink: 0
  },
  addBtnHeaderText: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
  summaryRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  summaryCard: {
    flex: 1, backgroundColor: '#ffffff', padding: 10, borderRadius: 10,
    borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center'
  },
  summaryValue: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  summaryLabel: { fontSize: 10, color: '#64748b', fontWeight: '600', marginTop: 2, textAlign: 'center' },
  emptyContainer: { padding: 40, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: '#334155', marginTop: 10 },
  emptySubtitle: { fontSize: 12, color: '#94a3b8', marginTop: 4, textAlign: 'center' },
  card: {
    backgroundColor: '#ffffff', borderRadius: 12, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: '#fee2e2', shadowColor: '#000',
    shadowOpacity: 0.02, shadowRadius: 4, elevation: 1
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  docName: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  branchText: { fontSize: 12, color: '#64748b', fontWeight: '500' },
  deleteBtn: { padding: 6, backgroundColor: '#fef2f2', borderRadius: 6 },
  scheduleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' },
  typeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  typeBadgeText: { fontSize: 10, fontWeight: '800' },
  scheduleDetailText: { fontSize: 12.5, fontWeight: '700', color: '#334155', flexShrink: 1 },
  reasonBadge: { backgroundColor: '#fef2f2', padding: 8, borderRadius: 6, marginTop: 8 },
  reasonText: { color: '#dc2626', fontSize: 12, fontWeight: '600', flexShrink: 1 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.5)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: '#ffffff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 18, maxHeight: '88%'
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  fieldLabel: { fontSize: 11.5, fontWeight: '700', color: '#475569', marginBottom: 6 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 6,
    backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#cbd5e1'
  },
  chipActive: { backgroundColor: '#eff6ff', borderColor: '#2563eb' },
  chipText: { fontSize: 12, fontWeight: '600', color: '#475569' },
  chipTextActive: { color: '#1d4ed8', fontWeight: '700' },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, marginBottom: 12 },
  typeBtn: {
    width: '48%', paddingVertical: 9, paddingHorizontal: 6,
    borderRadius: 8, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#cbd5e1',
    alignItems: 'center'
  },
  typeBtnActive: { backgroundColor: '#fee2e2', borderColor: '#dc2626' },
  typeBtnText: { fontSize: 11, fontWeight: '700', color: '#475569' },
  typeBtnTextActive: { color: '#dc2626' },
  textInput: {
    backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#cbd5e1',
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: '#0f172a'
  },
  sessionBtn: {
    flex: 1, paddingVertical: 10, paddingHorizontal: 6, borderRadius: 8,
    borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#f8fafc', alignItems: 'center'
  },
  sessionBtnActive: { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
  sessionBtnText: { fontSize: 11, fontWeight: '600', color: '#475569', textAlign: 'center' },
  sessionBtnTextActive: { color: '#1d4ed8', fontWeight: '700' },
  cancelBtn: { flex: 1, padding: 12, borderRadius: 8, backgroundColor: '#f1f5f9', alignItems: 'center' },
  cancelBtnText: { color: '#64748b', fontWeight: '700', fontSize: 13 },
  submitBtn: { flex: 1, padding: 12, borderRadius: 8, backgroundColor: '#dc2626', alignItems: 'center' },
  submitBtnText: { color: '#ffffff', fontWeight: '800', fontSize: 13 },
  receptionBadge: {
    backgroundColor: '#eff6ff', paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 6, borderWidth: 1, borderColor: '#bfdbfe'
  },
  receptionBadgeText: { fontSize: 10, fontWeight: '700', color: '#1d4ed8' },
  filterChip: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
    backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#cbd5e1'
  },
  filterChipActive: { backgroundColor: '#eff6ff', borderColor: '#2563eb' },
  filterChipText: { fontSize: 11, fontWeight: '600', color: '#64748b' },
  filterChipTextActive: { color: '#1d4ed8', fontWeight: '700' },
  docFilterChip: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6,
    backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0'
  },
  docFilterChipActive: { backgroundColor: '#fef2f2', borderColor: '#f87171' },
  docFilterChipText: { fontSize: 11, fontWeight: '600', color: '#64748b' },
  docFilterChipTextActive: { color: '#dc2626', fontWeight: '700' },
  rosterBannerSuccess: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#ecfdf5', borderWidth: 1, borderColor: '#a7f3d0',
    padding: 8, borderRadius: 8, marginBottom: 10
  },
  rosterBannerSuccessText: { fontSize: 11, color: '#065f46', fontWeight: '600', flex: 1 },
  rosterBannerWarning: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fde68a',
    padding: 8, borderRadius: 8, marginBottom: 10
  },
  rosterBannerWarningText: { fontSize: 11, color: '#92400e', fontWeight: '600', flex: 1 },
  doctorCardOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#f8fafc', borderWidth: 1.5, borderColor: '#e2e8f0',
    borderRadius: 10, padding: 10
  },
  doctorCardOptionActive: {
    backgroundColor: '#eff6ff', borderColor: '#2563eb'
  },
  doctorCardOptionOff: {
    opacity: 0.75, backgroundColor: '#f1f5f9'
  },
  docCardName: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  docCardNameActive: { color: '#1d4ed8' },
  docCardTiming: { fontSize: 11, color: '#64748b', marginTop: 2, fontWeight: '500' },
  activePill: {
    backgroundColor: '#dcfce7', paddingHorizontal: 5, paddingVertical: 1,
    borderRadius: 4
  },
  activePillText: { fontSize: 9.5, fontWeight: '800', color: '#15803d' },
  offPill: {
    backgroundColor: '#f1f5f9', paddingHorizontal: 5, paddingVertical: 1,
    borderRadius: 4
  },
  offPillText: { fontSize: 9.5, fontWeight: '700', color: '#64748b' },
  currentBranchBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10
  },
  branchBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1
  },
  branchIconBadge: {
    backgroundColor: '#e0f2fe',
    padding: 6,
    borderRadius: 8
  },
  branchBannerTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a'
  },
  branchBannerSubtitle: {
    fontSize: 10,
    color: '#64748b',
    marginTop: 1
  },
  activeTag: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6
  },
  activeTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0284c7'
  },
  lockedBranchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12
  },
  lockedBranchIconWrapper: {
    backgroundColor: '#e0f2fe',
    padding: 6,
    borderRadius: 6
  },
  lockedBranchTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a'
  },
  lockedBranchSubtitle: {
    fontSize: 10,
    color: '#64748b'
  },
  lockedTag: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4
  },
  lockedTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569'
  }
});
