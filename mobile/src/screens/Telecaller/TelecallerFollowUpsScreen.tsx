import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Linking,
  ActivityIndicator, TextInput, Modal, Alert, ScrollView, Platform
} from 'react-native';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { getSafeDb, collection, onSnapshot, query, limit, updateDoc, doc, setDoc, getDocs, where } from '../../utils/firebaseSafe';
import { logTelecallerActivity, formatDDMMYYYY } from '@app/shared';

export interface TelecallerFollowUpItem {
  id: string;
  patientName: string;
  phone: string;
  regId: string;
  doctorName: string;
  branchName: string;
  preferredDate: string; // YYYY-MM-DD
  followUpInterval?: string;
  diseases?: string;
  status: string;
  remarks?: string;
  raw?: any;
}

export interface TelecallerAuthInfo {
  uid?: string;
  telecallerId: string;
  name: string;
  phone?: string;
  branchId?: string;
}

interface TelecallerFollowUpsScreenProps {
  telecaller: TelecallerAuthInfo;
  onNavigateToBookAppointment: (patientData?: any) => void;
}

const BRANCH_OPTIONS = [
  'All Branches',
  'KPHB Branch',
  'Nallagandla Branch',
  'Dilshuknagar Branch',
  'Chandanagar Branch',
];

type FilterMode = 'this_month' | 'today' | 'yesterday' | 'this_week' | 'last_month' | 'custom_date' | 'all';

const STATUS_OPTIONS = [
  'Interested',
  'Not Interested',
  'Call Back',
  'No Response',
  'Appointment Booked',
  'Completed',
  'Pending'
];

export const TelecallerFollowUpsScreen: React.FC<TelecallerFollowUpsScreenProps> = ({
  telecaller,
  onNavigateToBookAppointment
}) => {
  const [selectedBranch, setSelectedBranch] = useState<string>('All Branches');
  const [filterMode, setFilterMode] = useState<FilterMode>('this_month');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [showCustomDateModal, setShowCustomDateModal] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(15);

  const [followups, setFollowups] = useState<TelecallerFollowUpItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Status Modal State
  const [statusModalItem, setStatusModalItem] = useState<TelecallerFollowUpItem | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string>('Interested');
  const [statusRemarks, setStatusRemarks] = useState<string>('');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<boolean>(false);

  // Reschedule Modal State
  const [rescheduleModalItem, setRescheduleModalItem] = useState<TelecallerFollowUpItem | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState<string>('');
  const [rescheduleRemarks, setRescheduleRemarks] = useState<string>('Patient requested date change');
  const [isRescheduling, setIsRescheduling] = useState<boolean>(false);

  // 1. Fetch Follow-ups from Firestore
  useEffect(() => {
    const activeDb = getSafeDb();
    if (!activeDb) {
      setLoading(false);
      return;
    }

    setLoading(true);
    // Listen to followups collection and appointments collection
    const unsub = onSnapshot(collection(activeDb, 'followups'), (snapshot) => {
      const items: TelecallerFollowUpItem[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        items.push({
          id: docSnap.id,
          patientName: data.patientName || data.name || data.fullName || 'Unnamed Patient',
          phone: String(data.phone || data.mobile || data.phoneNumber || ''),
          regId: data.registrationId || data.regId || data.patientId || '',
          doctorName: data.doctorName || data.doctor || '',
          branchName: data.branchName || data.branch || '',
          preferredDate: data.preferredFollowUpDate || data.followUpDate || data.preferredDate || data.scheduledDate || '',
          followUpInterval: data.followUpInterval || data.interval || '',
          diseases: data.diseases || data.disease || '',
          status: data.callOutcome || data.followUpStatus || data.status || 'Pending',
          remarks: data.remarks || data.rescheduleReason || '',
          raw: data
        });
      });

      setFollowups(items);
      setLoading(false);
    }, (error) => {
      console.warn('Error fetching follow-ups:', error);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  // 2. Date Filtering Logic
  const filteredList = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    const getWeekRange = () => {
      const d = new Date(now);
      const day = d.getDay();
      const diffToMonday = d.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(d.setDate(diffToMonday));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return {
        start: monday.toISOString().slice(0, 10),
        end: sunday.toISOString().slice(0, 10)
      };
    };

    const currentYear = now.getFullYear();
    const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
    const thisMonthPrefix = `${currentYear}-${currentMonth}`;

    const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthPrefix = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;

    const yesterdayDate = new Date(now);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayStr = yesterdayDate.toISOString().slice(0, 10);

    const weekRange = getWeekRange();

    return followups.filter((item) => {
      // Branch filter
      if (selectedBranch !== 'All Branches') {
        const itemBranch = (item.branchName || '').toLowerCase();
        const target = selectedBranch.toLowerCase().replace('branch', '').trim();
        if (!itemBranch.includes(target)) return false;
      }

      // Date Range filter
      const pDate = (item.preferredDate || '').slice(0, 10);
      if (filterMode === 'today') {
        if (pDate !== todayStr) return false;
      } else if (filterMode === 'yesterday') {
        if (pDate !== yesterdayStr) return false;
      } else if (filterMode === 'this_week') {
        if (!pDate || pDate < weekRange.start || pDate > weekRange.end) return false;
      } else if (filterMode === 'this_month') {
        if (!pDate || !pDate.startsWith(thisMonthPrefix)) return false;
      } else if (filterMode === 'last_month') {
        if (!pDate || !pDate.startsWith(lastMonthPrefix)) return false;
      } else if (filterMode === 'custom_date') {
        if (customStartDate && pDate < customStartDate) return false;
        if (customEndDate && pDate > customEndDate) return false;
      }

      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = item.patientName.toLowerCase().includes(q);
        const matchPhone = item.phone.replace(/\D/g, '').includes(q.replace(/\D/g, ''));
        const matchReg = item.regId.toLowerCase().includes(q);
        if (!matchName && !matchPhone && !matchReg) return false;
      }

      return true;
    });
  }, [followups, selectedBranch, filterMode, customStartDate, customEndDate, searchQuery]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedBranch, filterMode, customStartDate, customEndDate, searchQuery, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredList.length / pageSize));

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, filteredList.length);
  const paginatedList = useMemo(() => {
    return filteredList.slice(startIndex, endIndex);
  }, [filteredList, startIndex, endIndex]);

  // 3. Action Handlers
  const handleCallPatient = (item: TelecallerFollowUpItem) => {
    if (!item.phone) {
      Alert.alert('No Phone', 'No contact number found for this patient.');
      return;
    }

    const cleanPhone = item.phone.replace(/\D/g, '');
    Linking.openURL(`tel:${cleanPhone}`).catch(() => {
      Alert.alert('Call Failed', 'Unable to initiate call from this device.');
    });

    // Log activity
    logTelecallerActivity({
      telecallerUid: telecaller.uid,
      telecallerId: telecaller.telecallerId,
      telecallerName: telecaller.name,
      patientId: item.regId || item.id,
      patientName: item.patientName,
      patientMobile: item.phone,
      branchId: item.branchName || 'kphb',
      branchName: item.branchName || 'KPHB Branch',
      activityType: 'call_logged',
      callOutcome: 'Dialed patient',
      remarks: 'Initiated call from Follow-ups',
      followUpId: item.id
    }, getSafeDb());
  };

  const handleOpenStatusModal = (item: TelecallerFollowUpItem) => {
    setStatusModalItem(item);
    setSelectedStatus(item.status && STATUS_OPTIONS.includes(item.status) ? item.status : 'Interested');
    setStatusRemarks(item.remarks || '');
  };

  const handleSaveStatus = async () => {
    if (!statusModalItem) return;
    setIsUpdatingStatus(true);
    const activeDb = getSafeDb();

    try {
      const updateData = {
        callOutcome: selectedStatus,
        followUpStatus: selectedStatus,
        status: selectedStatus,
        remarks: statusRemarks,
        lastContactedBy: telecaller.name,
        lastContactedDate: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      if (activeDb) {
        await updateDoc(doc(activeDb, 'followups', statusModalItem.id), updateData).catch(async () => {
          await setDoc(doc(activeDb, 'followups', statusModalItem.id), updateData, { merge: true });
        });
      }

      // Local state update
      setFollowups((prev) =>
        prev.map((f) => (f.id === statusModalItem.id ? { ...f, status: selectedStatus, remarks: statusRemarks } : f))
      );

      // Log activity
      await logTelecallerActivity({
        telecallerUid: telecaller.uid,
        telecallerId: telecaller.telecallerId,
        telecallerName: telecaller.name,
        patientId: statusModalItem.regId || statusModalItem.id,
        patientName: statusModalItem.patientName,
        patientMobile: statusModalItem.phone,
        branchId: statusModalItem.branchName || 'kphb',
        branchName: statusModalItem.branchName || 'KPHB Branch',
        activityType: 'status_updated',
        previousStatus: statusModalItem.status,
        newStatus: selectedStatus,
        callOutcome: selectedStatus,
        remarks: statusRemarks,
        followUpId: statusModalItem.id
      }, activeDb);

      setIsUpdatingStatus(false);
      setStatusModalItem(null);
      Alert.alert('Status Updated', 'Follow-up status has been recorded successfully.');
    } catch (err: any) {
      setIsUpdatingStatus(false);
      Alert.alert('Error', err?.message || 'Failed to update follow-up status.');
    }
  };

  const handleOpenRescheduleModal = (item: TelecallerFollowUpItem) => {
    setRescheduleModalItem(item);
    const d = new Date();
    d.setDate(d.getDate() + 7); // Default +7 days
    setRescheduleDate(d.toISOString().slice(0, 10));
    setRescheduleRemarks('Patient requested date change');
  };

  const handleQuickShiftDays = (days: number) => {
    const base = rescheduleDate ? new Date(rescheduleDate) : new Date();
    base.setDate(base.getDate() + days);
    setRescheduleDate(base.toISOString().slice(0, 10));
  };

  const handleConfirmReschedule = async () => {
    if (!rescheduleModalItem || !rescheduleDate) return;
    setIsRescheduling(true);
    const activeDb = getSafeDb();

    try {
      const payload = {
        preferredFollowUpDate: rescheduleDate,
        followUpDate: rescheduleDate,
        scheduledDate: rescheduleDate,
        rescheduledAt: new Date().toISOString(),
        rescheduledBy: telecaller.name,
        rescheduledFromDate: rescheduleModalItem.preferredDate,
        rescheduleReason: rescheduleRemarks,
        status: 'Rescheduled',
        updatedAt: new Date().toISOString()
      };

      if (activeDb) {
        await updateDoc(doc(activeDb, 'followups', rescheduleModalItem.id), payload).catch(async () => {
          await setDoc(doc(activeDb, 'followups', rescheduleModalItem.id), payload, { merge: true });
        });
      }

      setFollowups((prev) =>
        prev.map((f) => (f.id === rescheduleModalItem.id ? { ...f, preferredDate: rescheduleDate, remarks: rescheduleRemarks, status: 'Rescheduled' } : f))
      );

      // Log activity
      await logTelecallerActivity({
        telecallerUid: telecaller.uid,
        telecallerId: telecaller.telecallerId,
        telecallerName: telecaller.name,
        patientId: rescheduleModalItem.regId || rescheduleModalItem.id,
        patientName: rescheduleModalItem.patientName,
        patientMobile: rescheduleModalItem.phone,
        branchId: rescheduleModalItem.branchName || 'kphb',
        branchName: rescheduleModalItem.branchName || 'KPHB Branch',
        activityType: 'rescheduled',
        previousStatus: rescheduleModalItem.status,
        newStatus: 'Rescheduled',
        nextFollowUpDate: rescheduleDate,
        remarks: rescheduleRemarks,
        followUpId: rescheduleModalItem.id
      }, activeDb);

      setIsRescheduling(false);
      setRescheduleModalItem(null);
      Alert.alert('Rescheduled', `Follow-up shifted to ${rescheduleDate}.`);
    } catch (err: any) {
      setIsRescheduling(false);
      Alert.alert('Error', err?.message || 'Failed to reschedule follow-up.');
    }
  };

  const handleBookAppointmentForPatient = (item: TelecallerFollowUpItem) => {
    onNavigateToBookAppointment({
      patientName: item.patientName,
      phone: item.phone,
      regId: item.regId,
      branchName: item.branchName,
      doctorName: item.doctorName,
      diseases: item.diseases
    });
  };

  const renderFollowUpCard = ({ item }: { item: TelecallerFollowUpItem }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.patientName}>{item.patientName}</Text>
          <Text style={styles.regIdText}>{item.regId ? `ID: ${item.regId}` : 'No Reg ID'}</Text>
        </View>
        <View style={[styles.statusBadge, item.status === 'Completed' ? styles.statusGreen : styles.statusBlue]}>
          <Text style={styles.statusBadgeText}>{item.status}</Text>
        </View>
      </View>

      <View style={styles.metaRow}>
        <View style={styles.metaItem}>
          <Ionicons name="call-outline" size={14} color="#0284c7" />
          <Text style={styles.metaText}>{item.phone || 'No phone'}</Text>
        </View>
        <View style={styles.metaItem}>
          <Ionicons name="business-outline" size={14} color="#0284c7" />
          <Text style={styles.metaText}>{item.branchName || 'SPH Clinic'}</Text>
        </View>
      </View>

      <View style={styles.metaRow}>
        <View style={styles.metaItem}>
          <Ionicons name="medkit-outline" size={14} color="#64748b" />
          <Text style={styles.metaText}>{item.doctorName || 'Assigned Doctor'}</Text>
        </View>
        <View style={styles.metaItem}>
          <Ionicons name="calendar-outline" size={14} color="#64748b" />
          <Text style={styles.metaText}>{formatDDMMYYYY(item.preferredDate)}</Text>
        </View>
      </View>

      <View style={styles.actionButtonsRow}>
        <TouchableOpacity style={styles.callBtn} onPress={() => handleCallPatient(item)}>
          <Ionicons name="call" size={14} color="#fff" style={{ marginRight: 4 }} />
          <Text style={styles.callBtnText}>Call</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.statusBtn} onPress={() => handleOpenStatusModal(item)}>
          <Ionicons name="create-outline" size={14} color="#0284c7" style={{ marginRight: 4 }} />
          <Text style={styles.statusBtnText}>Status</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.rescheduleBtn} onPress={() => handleOpenRescheduleModal(item)}>
          <Ionicons name="time-outline" size={14} color="#d97706" style={{ marginRight: 4 }} />
          <Text style={styles.rescheduleBtnText}>Reschedule</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.bookBtn} onPress={() => handleBookAppointmentForPatient(item)}>
          <Ionicons name="calendar" size={14} color="#16a34a" style={{ marginRight: 4 }} />
          <Text style={styles.bookBtnText}>Book</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* 1. Branch Selector */}
      <View style={styles.branchSelectorWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.branchScroll}>
          {BRANCH_OPTIONS.map((branch) => {
            const isSelected = selectedBranch === branch;
            return (
              <TouchableOpacity
                key={branch}
                style={[styles.branchChip, isSelected && styles.branchChipActive]}
                onPress={() => setSelectedBranch(branch)}
              >
                <Text style={[styles.branchChipText, isSelected && styles.branchChipTextActive]}>
                  {branch}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* 2. Date Range Filters */}
      <View style={styles.filterBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {[
            { id: 'this_month', label: 'This Month' },
            { id: 'today', label: 'Today' },
            { id: 'yesterday', label: 'Yesterday' },
            { id: 'this_week', label: 'This Week' },
            { id: 'last_month', label: 'Last Month' },
            { id: 'custom_date', label: 'Custom' },
            { id: 'all', label: 'All' },
          ].map((f) => {
            const isSelected = filterMode === f.id;
            return (
              <TouchableOpacity
                key={f.id}
                style={[styles.filterChip, isSelected && styles.filterChipActive]}
                onPress={() => {
                  setFilterMode(f.id as FilterMode);
                  if (f.id === 'custom_date') setShowCustomDateModal(true);
                }}
              >
                <Text style={[styles.filterChipText, isSelected && styles.filterChipTextActive]}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* 3. Search Bar */}
      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color="#64748b" style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by Patient Name, Phone, or ID..."
          placeholderTextColor="#94a3b8"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery ? (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={18} color="#94a3b8" />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Count & Pagination Header */}
      <View style={styles.countRow}>
        <Text style={styles.countText}>
          Showing{' '}
          <Text style={{ fontWeight: '700', color: '#0284c7' }}>
            {filteredList.length > 0 ? `${startIndex + 1}–${endIndex}` : '0'}
          </Text>{' '}
          of <Text style={{ fontWeight: '700', color: '#0284c7' }}>{filteredList.length}</Text> follow-up{filteredList.length === 1 ? '' : 's'}
        </Text>
        {filteredList.length > 0 && (
          <View style={styles.pageBadge}>
            <Text style={styles.pageBadgeText}>Page {currentPage} / {totalPages}</Text>
          </View>
        )}
      </View>

      {/* 4. List */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#0284c7" />
          <Text style={{ marginTop: 10, color: '#64748b', fontSize: 13 }}>Loading follow-ups...</Text>
        </View>
      ) : filteredList.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="file-tray-outline" size={48} color="#cbd5e1" />
          <Text style={styles.emptyTitle}>No Follow-ups Found</Text>
          <Text style={styles.emptySub}>No follow-ups match your selected branch and date filters.</Text>
        </View>
      ) : (
        <>
          <FlatList
            data={paginatedList}
            keyExtractor={(item) => item.id}
            renderItem={renderFollowUpCard}
            contentContainerStyle={{ paddingBottom: 16, paddingHorizontal: 12 }}
          />

          {/* Pagination Bottom Bar */}
          <View style={styles.paginationBar}>
            <View style={styles.pageSizeRow}>
              <Text style={styles.pageSizeLabel}>Rows:</Text>
              {[10, 15, 25, 50].map((sz) => (
                <TouchableOpacity
                  key={sz}
                  style={[styles.pageSizeChip, pageSize === sz && styles.pageSizeChipActive]}
                  onPress={() => setPageSize(sz)}
                >
                  <Text style={[styles.pageSizeChipText, pageSize === sz && styles.pageSizeChipTextActive]}>
                    {sz}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.paginationNavRow}>
              <TouchableOpacity
                style={[styles.pageNavBtn, currentPage <= 1 && styles.pageNavBtnDisabled]}
                disabled={currentPage <= 1}
                onPress={() => setCurrentPage(1)}
              >
                <Ionicons name="play-back" size={13} color={currentPage <= 1 ? '#94a3b8' : '#0284c7'} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.pageNavBtn, currentPage <= 1 && styles.pageNavBtnDisabled]}
                disabled={currentPage <= 1}
                onPress={() => setCurrentPage((p) => Math.max(1, p - 1))}
              >
                <Ionicons name="chevron-back" size={15} color={currentPage <= 1 ? '#94a3b8' : '#0284c7'} />
                <Text style={[styles.pageNavBtnText, currentPage <= 1 && styles.pageNavBtnTextDisabled]}>Prev</Text>
              </TouchableOpacity>

              <View style={styles.pageIndicatorBox}>
                <Text style={styles.pageIndicatorText}>
                  {currentPage} / {totalPages}
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.pageNavBtn, currentPage >= totalPages && styles.pageNavBtnDisabled]}
                disabled={currentPage >= totalPages}
                onPress={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              >
                <Text style={[styles.pageNavBtnText, currentPage >= totalPages && styles.pageNavBtnTextDisabled]}>Next</Text>
                <Ionicons name="chevron-forward" size={15} color={currentPage >= totalPages ? '#94a3b8' : '#0284c7'} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.pageNavBtn, currentPage >= totalPages && styles.pageNavBtnDisabled]}
                disabled={currentPage >= totalPages}
                onPress={() => setCurrentPage(totalPages)}
              >
                <Ionicons name="play-forward" size={13} color={currentPage >= totalPages ? '#94a3b8' : '#0284c7'} />
              </TouchableOpacity>
            </View>
          </View>
        </>
      )}

      {/* Update Status Modal */}
      <Modal visible={!!statusModalItem} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Update Follow-up Status</Text>
              <TouchableOpacity onPress={() => setStatusModalItem(null)}>
                <Ionicons name="close" size={22} color="#64748b" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalPatientName}>{statusModalItem?.patientName}</Text>
            <Text style={styles.modalPatientSub}>Phone: {statusModalItem?.phone}</Text>

            <Text style={styles.inputLabel}>Outcome Status:</Text>
            <View style={styles.statusChipsContainer}>
              {STATUS_OPTIONS.map((st) => (
                <TouchableOpacity
                  key={st}
                  style={[styles.statusChipSelect, selectedStatus === st && styles.statusChipSelectActive]}
                  onPress={() => setSelectedStatus(st)}
                >
                  <Text style={[styles.statusChipSelectText, selectedStatus === st && styles.statusChipSelectTextActive]}>
                    {st}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.inputLabel}>Remarks / Notes:</Text>
            <TextInput
              style={styles.remarksInput}
              multiline
              numberOfLines={3}
              placeholder="Enter details of conversation..."
              value={statusRemarks}
              onChangeText={setStatusRemarks}
            />

            <View style={styles.modalButtonsRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setStatusModalItem(null)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveStatus} disabled={isUpdatingStatus}>
                {isUpdatingStatus ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.saveBtnText}>Save Status</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Reschedule Modal */}
      <Modal visible={!!rescheduleModalItem} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Reschedule Follow-up</Text>
              <TouchableOpacity onPress={() => setRescheduleModalItem(null)}>
                <Ionicons name="close" size={22} color="#64748b" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalPatientName}>{rescheduleModalItem?.patientName}</Text>
            <Text style={styles.modalPatientSub}>Current Date: {formatDDMMYYYY(rescheduleModalItem?.preferredDate)}</Text>

            <Text style={styles.inputLabel}>Target Follow-up Date (YYYY-MM-DD):</Text>
            <TextInput
              style={styles.dateInput}
              value={rescheduleDate}
              onChangeText={setRescheduleDate}
              placeholder="YYYY-MM-DD"
            />

            <View style={styles.quickShiftRow}>
              {[
                { label: '+1d', days: 1 },
                { label: '+3d', days: 3 },
                { label: '+1w', days: 7 },
                { label: '+15d', days: 15 },
                { label: '+1m', days: 30 },
              ].map((s) => (
                <TouchableOpacity key={s.label} style={styles.quickShiftChip} onPress={() => handleQuickShiftDays(s.days)}>
                  <Text style={styles.quickShiftText}>{s.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.inputLabel}>Reschedule Reason / Remarks:</Text>
            <TextInput
              style={styles.remarksInput}
              multiline
              numberOfLines={2}
              value={rescheduleRemarks}
              onChangeText={setRescheduleRemarks}
              placeholder="Reason for changing date..."
            />

            <View style={styles.modalButtonsRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setRescheduleModalItem(null)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, { backgroundColor: '#d97706' }]} onPress={handleConfirmReschedule} disabled={isRescheduling}>
                {isRescheduling ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.saveBtnText}>Confirm Reschedule</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Custom Date Range Modal */}
      <Modal visible={showCustomDateModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Custom Date Range</Text>
              <TouchableOpacity onPress={() => setShowCustomDateModal(false)}>
                <Ionicons name="close" size={22} color="#64748b" />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Start Date (YYYY-MM-DD):</Text>
            <TextInput
              style={styles.dateInput}
              placeholder="e.g. 2026-10-01"
              value={customStartDate}
              onChangeText={setCustomStartDate}
            />

            <Text style={styles.inputLabel}>End Date (YYYY-MM-DD):</Text>
            <TextInput
              style={styles.dateInput}
              placeholder="e.g. 2026-10-31"
              value={customEndDate}
              onChangeText={setCustomEndDate}
            />

            <View style={styles.modalButtonsRow}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => {
                  setCustomStartDate('');
                  setCustomEndDate('');
                  setShowCustomDateModal(false);
                }}
              >
                <Text style={styles.cancelBtnText}>Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={() => setShowCustomDateModal(false)}
              >
                <Text style={styles.saveBtnText}>Apply</Text>
              </TouchableOpacity>
            </View>
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
  branchSelectorWrapper: {
    backgroundColor: '#ffffff',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  branchScroll: {
    paddingHorizontal: 12,
    gap: 8,
  },
  branchChip: {
    paddingVertical: 6,
    paddingHorizontal: 14,
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
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  branchChipTextActive: {
    color: '#ffffff',
  },
  filterBar: {
    backgroundColor: '#ffffff',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  filterScroll: {
    paddingHorizontal: 12,
    gap: 6,
  },
  filterChip: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  filterChipActive: {
    backgroundColor: '#e0f2fe',
    borderColor: '#0284c7',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748b',
  },
  filterChipTextActive: {
    color: '#0284c7',
    fontWeight: '700',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    marginHorizontal: 12,
    marginTop: 10,
    marginBottom: 6,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0f172a',
  },
  countRow: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pageBadge: {
    backgroundColor: '#e0f2fe',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  pageBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0284c7',
  },
  paginationBar: {
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pageSizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pageSizeLabel: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
    marginRight: 2,
  },
  pageSizeChip: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  pageSizeChipActive: {
    backgroundColor: '#0284c7',
    borderColor: '#0284c7',
  },
  pageSizeChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  pageSizeChipTextActive: {
    color: '#ffffff',
  },
  paginationNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pageNavBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 7,
    borderRadius: 6,
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    gap: 2,
  },
  pageNavBtnDisabled: {
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0',
  },
  pageNavBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0284c7',
  },
  pageNavBtnTextDisabled: {
    color: '#94a3b8',
  },
  pageIndicatorBox: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  pageIndicatorText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
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
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  patientName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  regIdText: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  statusBadge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  statusBlue: {
    backgroundColor: '#e0f2fe',
  },
  statusGreen: {
    backgroundColor: '#dcfce7',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0284c7',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: '#334155',
  },
  diseasesText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0f172a',
    marginTop: 4,
  },
  remarksText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
    marginTop: 2,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  callBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0284c7',
    paddingVertical: 8,
    borderRadius: 8,
  },
  callBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  statusBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    paddingVertical: 8,
    borderRadius: 8,
  },
  statusBtnText: {
    color: '#0284c7',
    fontSize: 12,
    fontWeight: '700',
  },
  rescheduleBtn: {
    flex: 1.1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    paddingVertical: 8,
    borderRadius: 8,
  },
  rescheduleBtnText: {
    color: '#d97706',
    fontSize: 12,
    fontWeight: '700',
  },
  bookBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    paddingVertical: 8,
    borderRadius: 8,
  },
  bookBtnText: {
    color: '#16a34a',
    fontSize: 12,
    fontWeight: '700',
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
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  modalPatientName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0284c7',
  },
  modalPatientSub: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
    marginTop: 8,
  },
  statusChipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  statusChipSelect: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  statusChipSelectActive: {
    backgroundColor: '#0284c7',
    borderColor: '#0284c7',
  },
  statusChipSelectText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
  statusChipSelectTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  remarksInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    color: '#0f172a',
    textAlignVertical: 'top',
  },
  dateInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    color: '#0f172a',
  },
  quickShiftRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
    marginBottom: 4,
  },
  quickShiftChip: {
    flex: 1,
    paddingVertical: 6,
    backgroundColor: '#fef3c7',
    borderRadius: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  quickShiftText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#b45309',
  },
  modalButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  saveBtn: {
    flex: 1.5,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#0284c7',
    alignItems: 'center',
  },
  saveBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
});

