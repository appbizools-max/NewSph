import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Linking,
  ActivityIndicator, TextInput, ScrollView, Platform, Modal, Alert
} from 'react-native';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { getSafeDb, collection, onSnapshot, query, orderBy, limit } from '../../utils/firebaseSafe';
import { TelecallerActivity } from '@app/shared';

interface TelecallerUpdatesScreenProps {
  telecaller: {
    uid?: string;
    telecallerId: string;
    name: string;
  };
}

const BRANCH_OPTIONS = [
  'All Branches',
  'KPHB Branch',
  'Nallagandla Branch',
  'Dilshuknagar Branch',
  'Chandanagar Branch',
];

const ACTION_FILTERS = [
  { id: 'all', label: 'All Activities' },
  { id: 'call_logged', label: 'Calls' },
  { id: 'status_updated', label: 'Status Updates' },
  { id: 'rescheduled', label: 'Rescheduled' },
  { id: 'appointment_booked', label: 'Appointments Booked' },
];

export const TelecallerUpdatesScreen: React.FC<TelecallerUpdatesScreenProps> = ({ telecaller }) => {
  const [activities, setActivities] = useState<TelecallerActivity[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedBranch, setSelectedBranch] = useState<string>('All Branches');
  const [selectedAction, setSelectedAction] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [dateFilter, setDateFilter] = useState<'this_month' | 'today' | 'this_week' | 'all'>('this_month');

  // Manual Update Modal State
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [formPatientName, setFormPatientName] = useState<string>('');
  const [formMobile, setFormMobile] = useState<string>('');
  const [formBranch, setFormBranch] = useState<string>('KPHB Branch');
  const [formOutcome, setFormOutcome] = useState<string>('Interested');
  const [formNotes, setFormNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const handleSaveUpdate = async () => {
    if (!formPatientName.trim()) {
      Alert.alert('Required', 'Please enter patient name.');
      return;
    }
    const cleanMobile = formMobile.replace(/\D/g, '');
    if (cleanMobile.length < 10) {
      Alert.alert('Required', 'Please enter a valid 10-digit mobile number.');
      return;
    }

    setIsSubmitting(true);
    const activeDb = getSafeDb();
    try {
      const now = new Date();
      const activityData = {
        telecallerUid: telecaller.uid || '',
        telecallerId: telecaller.telecallerId,
        telecallerName: telecaller.name,
        patientName: formPatientName.trim(),
        patientMobile: cleanMobile.slice(-10),
        branchId: formBranch.toLowerCase().replace('branch', '').trim(),
        branchName: formBranch,
        activityType: 'manual_update',
        callOutcome: formOutcome,
        remarks: formNotes.trim(),
        createdAt: now.toISOString(),
        createdAtMs: now.getTime()
      };

      if (activeDb) {
        const { collection, addDoc } = require('../../utils/firebaseSafe');
        await addDoc(collection(activeDb, 'telecallerActivities'), activityData);
      }

      setIsSubmitting(false);
      setShowAddModal(false);
      setFormPatientName('');
      setFormMobile('');
      setFormNotes('');
      Alert.alert('Success', 'Telecaller update recorded successfully!');
    } catch (err: any) {
      setIsSubmitting(false);
      Alert.alert('Error', err?.message || 'Failed to save update.');
    }
  };

  useEffect(() => {
    const activeDb = getSafeDb();
    if (!activeDb) {
      setLoading(false);
      return;
    }

    setLoading(true);
    // Subscribe to telecallerActivities
    const q = query(
      collection(activeDb, 'telecallerActivities'),
      orderBy('createdAtMs', 'desc'),
      limit(200)
    );

    const unsub = onSnapshot(q, (snap) => {
      const list: TelecallerActivity[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...(d.data() as any) });
      });
      setActivities(list);
      setLoading(false);
    }, (err) => {
      console.warn('Error listening to telecaller activities:', err);
      // Fallback query without orderBy if index is building
      const fallbackQuery = query(collection(activeDb, 'telecallerActivities'), limit(100));
      onSnapshot(fallbackQuery, (fallbackSnap) => {
        const list: TelecallerActivity[] = [];
        fallbackSnap.forEach((d) => {
          list.push({ id: d.id, ...(d.data() as any) });
        });
        list.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
        setActivities(list);
        setLoading(false);
      }, () => setLoading(false));
    });

    return () => unsub();
  }, []);

  const filteredActivities = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const thisMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    return activities.filter((act) => {
      // Branch filter
      if (selectedBranch !== 'All Branches') {
        const itemBranch = (act.branchName || act.branchId || '').toLowerCase();
        const target = selectedBranch.toLowerCase().replace('branch', '').trim();
        if (!itemBranch.includes(target)) return false;
      }

      // Action type filter
      if (selectedAction !== 'all') {
        if (act.activityType !== selectedAction) return false;
      }

      // Date filter
      const actDate = (act.createdAt || '').slice(0, 10);
      if (dateFilter === 'today') {
        if (actDate !== todayStr) return false;
      } else if (dateFilter === 'this_month') {
        if (!actDate.startsWith(thisMonthPrefix)) return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchPatient = (act.patientName || '').toLowerCase().includes(q);
        const matchPhone = (act.patientMobile || '').includes(q);
        const matchRemarks = (act.remarks || '').toLowerCase().includes(q);
        const matchTelecaller = (act.telecallerName || '').toLowerCase().includes(q);
        if (!matchPatient && !matchPhone && !matchRemarks && !matchTelecaller) return false;
      }

      return true;
    });
  }, [activities, selectedBranch, selectedAction, dateFilter, searchQuery]);

  const getActivityBadge = (type: string) => {
    switch (type) {
      case 'appointment_booked':
        return { label: 'Appointment Booked', bg: '#dcfce7', text: '#15803d', icon: 'calendar' };
      case 'rescheduled':
        return { label: 'Rescheduled', bg: '#fef3c7', text: '#b45309', icon: 'time-outline' };
      case 'call_logged':
        return { label: 'Call Logged', bg: '#e0f2fe', text: '#0369a1', icon: 'call-outline' };
      case 'status_updated':
      default:
        return { label: 'Status Update', bg: '#f3e8ff', text: '#7e22ce', icon: 'checkbox-outline' };
    }
  };

  const renderActivityCard = ({ item }: { item: TelecallerActivity }) => {
    const badge = getActivityBadge(item.activityType);
    const dateFormatted = item.createdAt ? new Date(item.createdAt).toLocaleString('en-IN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }) : 'Just now';

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={[styles.badge, { backgroundColor: badge.bg }]}>
            <Ionicons name={badge.icon as any} size={12} color={badge.text} style={{ marginRight: 4 }} />
            <Text style={[styles.badgeText, { color: badge.text }]}>{badge.label}</Text>
          </View>
          <Text style={styles.dateText}>{dateFormatted}</Text>
        </View>

        <View style={styles.patientRow}>
          <Text style={styles.patientName}>{item.patientName || 'Patient'}</Text>
          {item.patientMobile ? (
            <TouchableOpacity
              style={styles.phoneChip}
              onPress={() => Linking.openURL(`tel:${item.patientMobile.replace(/\D/g, '')}`)}
            >
              <Ionicons name="call" size={11} color="#0284c7" style={{ marginRight: 3 }} />
              <Text style={styles.phoneText}>{item.patientMobile}</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Branch:</Text>
          <Text style={styles.metaVal}>{item.branchName || 'SPH Clinic'}</Text>
        </View>

        {item.newStatus || item.callOutcome ? (
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Outcome / Status:</Text>
            <Text style={[styles.metaVal, { color: '#0284c7', fontWeight: '700' }]}>
              {item.newStatus || item.callOutcome}
            </Text>
          </View>
        ) : null}

        {item.remarks ? (
          <View style={styles.remarksBox}>
            <Text style={styles.remarksText}>{item.remarks}</Text>
          </View>
        ) : null}

        <View style={styles.footerRow}>
          <Text style={styles.telecallerAttribution}>
            Logged by: <Text style={{ fontWeight: '700', color: '#334155' }}>{item.telecallerName || 'Telecaller'}</Text> ({item.telecallerId || 'TC'})
          </Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* 1. Branch Selector */}
      <View style={styles.headerBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollBar}>
          {BRANCH_OPTIONS.map((b) => {
            const isSelected = selectedBranch === b;
            return (
              <TouchableOpacity
                key={b}
                style={[styles.filterChip, isSelected && styles.filterChipActive]}
                onPress={() => setSelectedBranch(b)}
              >
                <Text style={[styles.filterChipText, isSelected && styles.filterChipTextActive]}>{b}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* 2. Action Type Filters */}
      <View style={[styles.headerBar, { borderBottomWidth: 1, borderBottomColor: '#e2e8f0' }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollBar}>
          {ACTION_FILTERS.map((act) => {
            const isSelected = selectedAction === act.id;
            return (
              <TouchableOpacity
                key={act.id}
                style={[styles.actionChip, isSelected && styles.actionChipActive]}
                onPress={() => setSelectedAction(act.id)}
              >
                <Text style={[styles.actionChipText, isSelected && styles.actionChipTextActive]}>{act.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* 3. Search and Date Range bar */}
      <View style={styles.searchBarRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={16} color="#64748b" style={{ marginRight: 6 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search patient, phone, or remarks..."
            placeholderTextColor="#94a3b8"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={16} color="#94a3b8" />
            </TouchableOpacity>
          ) : null}
        </View>

        <TouchableOpacity
          style={[styles.dateToggleBtn, dateFilter === 'today' && styles.dateToggleActive]}
          onPress={() => setDateFilter(dateFilter === 'today' ? 'this_month' : 'today')}
        >
          <Text style={[styles.dateToggleText, dateFilter === 'today' && styles.dateToggleTextActive]}>
            {dateFilter === 'today' ? 'Today' : 'This Month'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Activity Count & Add Button */}
      <View style={styles.countRow}>
        <Text style={styles.countText}>
          Total Updates: <Text style={{ fontWeight: '700', color: '#0284c7' }}>{filteredActivities.length}</Text>
        </Text>
        <TouchableOpacity style={styles.addUpdateBtn} onPress={() => setShowAddModal(true)}>
          <Ionicons name="add" size={14} color="#fff" />
          <Text style={styles.addUpdateBtnText}>Log Update</Text>
        </TouchableOpacity>
      </View>

      {/* 4. Activity List */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#0284c7" />
          <Text style={{ marginTop: 10, color: '#64748b', fontSize: 13 }}>Loading activity log...</Text>
        </View>
      ) : filteredActivities.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="newspaper-outline" size={48} color="#cbd5e1" />
          <Text style={styles.emptyTitle}>No Updates Recorded</Text>
          <Text style={styles.emptySub}>No activities recorded yet for the selected filters.</Text>
        </View>
      ) : (
        <FlatList
          data={filteredActivities}
          keyExtractor={(item) => item.id || String(Math.random())}
          renderItem={renderActivityCard}
          contentContainerStyle={{ paddingBottom: 80, paddingHorizontal: 12 }}
        />
      )}
      {/* Log Update Modal */}
      <Modal visible={showAddModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Enter Telecaller Update</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={22} color="#64748b" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.inputLabel}>Patient Name: *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Ramesh Kumar"
                placeholderTextColor="#94a3b8"
                value={formPatientName}
                onChangeText={setFormPatientName}
              />

              <Text style={styles.inputLabel}>Mobile Number: *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="10-digit mobile number"
                placeholderTextColor="#94a3b8"
                keyboardType="phone-pad"
                value={formMobile}
                onChangeText={setFormMobile}
              />

              <Text style={styles.inputLabel}>Hospital Branch: *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                {BRANCH_OPTIONS.filter((b) => b !== 'All Branches').map((b) => (
                  <TouchableOpacity
                    key={b}
                    style={[styles.miniChip, formBranch === b && styles.miniChipActive]}
                    onPress={() => setFormBranch(b)}
                  >
                    <Text style={[styles.miniChipText, formBranch === b && styles.miniChipTextActive]}>{b.replace(' Branch', '')}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.inputLabel}>Outcome / Status:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                {['Interested', 'Call Back', 'Appt Booked', 'Not Interested', 'No Response', 'General Update'].map((st) => (
                  <TouchableOpacity
                    key={st}
                    style={[styles.miniChip, formOutcome === st && styles.miniChipActive]}
                    onPress={() => setFormOutcome(st)}
                  >
                    <Text style={[styles.miniChipText, formOutcome === st && styles.miniChipTextActive]}>{st}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.inputLabel}>Notes & Remarks: *</Text>
              <TextInput
                style={[styles.textInput, { height: 75, textAlignVertical: 'top' }]}
                multiline
                numberOfLines={3}
                placeholder="Details of discussion..."
                placeholderTextColor="#94a3b8"
                value={formNotes}
                onChangeText={setFormNotes}
              />

              <View style={styles.modalButtonsRow}>
                <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowAddModal(false)}>
                  <Text style={styles.modalCancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalSaveBtn} onPress={handleSaveUpdate} disabled={isSubmitting}>
                  {isSubmitting ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.modalSaveBtnText}>Save Update</Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  headerBar: {
    backgroundColor: '#ffffff',
    paddingVertical: 8,
  },
  scrollBar: {
    paddingHorizontal: 12,
    gap: 6,
  },
  filterChip: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  filterChipActive: {
    backgroundColor: '#0284c7',
    borderColor: '#0284c7',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  filterChipTextActive: {
    color: '#ffffff',
  },
  actionChip: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  actionChipActive: {
    backgroundColor: '#e0f2fe',
    borderColor: '#0284c7',
  },
  actionChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
  },
  actionChipTextActive: {
    color: '#0284c7',
    fontWeight: '700',
  },
  searchBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 12,
    marginTop: 10,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === 'ios' ? 8 : 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    color: '#0f172a',
  },
  dateToggleBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  dateToggleActive: {
    backgroundColor: '#0284c7',
    borderColor: '#0284c7',
  },
  dateToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  dateToggleTextActive: {
    color: '#ffffff',
  },
  addUpdateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0284c7',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 7,
    gap: 4,
  },
  addUpdateBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '90%',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingBottom: 10,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 4,
  },
  textInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: '#0f172a',
    marginBottom: 10,
  },
  miniChip: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginRight: 6,
  },
  miniChipActive: {
    backgroundColor: '#0284c7',
    borderColor: '#0284c7',
  },
  miniChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  miniChipTextActive: {
    color: '#ffffff',
  },
  modalButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 8,
  },
  modalCancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
  },
  modalCancelBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  modalSaveBtn: {
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 8,
    backgroundColor: '#0284c7',
  },
  modalSaveBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  countRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  countText: {
    fontSize: 12,
    color: '#64748b',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  dateText: {
    fontSize: 11,
    color: '#94a3b8',
  },
  patientRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  patientName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
  },
  phoneChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
    backgroundColor: '#f0f9ff',
  },
  phoneText: {
    fontSize: 11,
    color: '#0284c7',
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 4,
  },
  metaLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
  },
  metaVal: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '600',
  },
  remarksBox: {
    backgroundColor: '#f8fafc',
    padding: 8,
    borderRadius: 6,
    marginTop: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#0284c7',
  },
  remarksText: {
    fontSize: 12,
    color: '#334155',
  },
  footerRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  telecallerAttribution: {
    fontSize: 11,
    color: '#94a3b8',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#475569',
    marginTop: 12,
  },
  emptySub: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 30,
  },
});

