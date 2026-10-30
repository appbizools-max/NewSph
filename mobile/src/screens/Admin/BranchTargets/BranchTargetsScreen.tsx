import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Modal, TextInput, Alert } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { getSafeDb, collection, onSnapshot, doc, setDoc, getDoc } from '../../../utils/firebaseSafe';
import { TargetProgressUI } from '../../../components/TargetProgressUI';
import { reconcileBranchTargetData, calculateRealBranchRevenue, getCurrentMonthYMD, getNextMonthYMD } from '../../../utils/branchRevenueCalculator';
import { receptionDataStore } from '../../../utils/receptionDataStore';

const DEFAULT_BRANCH_TARGETS = [
  { id: 'kphb', name: 'KPHB Branch', monthlyTarget: 725000, targetReached: 0, nextMonthTarget: 0 },
  { id: 'nallagandla', name: 'Nallagandla Branch', monthlyTarget: 325000, targetReached: 0, nextMonthTarget: 0 },
  { id: 'dilshuknagar', name: 'Dilshuknagar Branch', monthlyTarget: 225000, targetReached: 0, nextMonthTarget: 0 },
  { id: 'chandanagar', name: 'Chandanagar Branch', monthlyTarget: 550000, targetReached: 0, nextMonthTarget: 0 },
];

export const BranchTargetsScreen: React.FC = () => {
  const [branchTargets, setBranchTargets] = useState(DEFAULT_BRANCH_TARGETS);
  const [selectedBranch, setSelectedBranch] = useState<any>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingTargetType, setEditingTargetType] = useState<'current' | 'next'>('current');
  const [targetInput, setTargetInput] = useState('');
  const [activeMonthTab, setActiveMonthTab] = useState<'current' | 'next'>('current');

  const [appointmentsPool, setAppointmentsPool] = useState<any[]>(() => {
    try {
      const pool = receptionDataStore.getAllCollectionsPool();
      if (pool && pool.length > 0) return pool;
      return receptionDataStore.getAppointments() || [];
    } catch (_) {
      return [];
    }
  });

  const [packageMembersList, setPackageMembersList] = useState<any[]>(() => {
    try {
      return receptionDataStore.getPackageMembers() || [];
    } catch (_) {
      return [];
    }
  });

  const now = new Date();
  const currentMonthName = now.toLocaleString('default', { month: 'long', year: 'numeric' });
  const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextMonthName = nextMonthDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  useEffect(() => {
    try {
      receptionDataStore.startListeners();
    } catch (_) {}

    const unsubStore = receptionDataStore.subscribe((state) => {
      if (state.allCollectionsPool && state.allCollectionsPool.length > 0) {
        setAppointmentsPool(state.allCollectionsPool);
      } else if (state.appointments && state.appointments.length > 0) {
        setAppointmentsPool(state.appointments);
      }
      if (state.packageMembersList) {
        setPackageMembersList(state.packageMembersList);
      }
    });

    return () => unsubStore();
  }, []);

  useEffect(() => {
    const firestoreDb = getSafeDb();
    if (!firestoreDb) return;
    try {
      const colRef = collection(firestoreDb, 'branchTargets');
      const unsubscribe = onSnapshot(colRef, (snapshot) => {
        if (!snapshot.empty) {
          const liveMap: Record<string, any> = {};
          snapshot.forEach((docSnap) => {
            liveMap[docSnap.id.toLowerCase()] = docSnap.data();
          });

          setBranchTargets((prev) =>
            prev.map((b) => {
              const live = liveMap[b.id.toLowerCase()] || liveMap[b.name.toLowerCase().replace(/\s*branch$/i, '')];
              if (live) {
                const reconciled = reconcileBranchTargetData(live, b.id);
                const directRev = calculateRealBranchRevenue(b.id, appointmentsPool, packageMembersList, reconciled.monthlyTarget);
                const effectiveReached = Math.max(reconciled.targetReached || 0, directRev.targetReached || 0);

                return {
                  ...b,
                  monthlyTarget: reconciled.monthlyTarget,
                  targetReached: effectiveReached,
                  nextMonthTarget: reconciled.nextMonthTarget,
                };
              }
              return b;
            })
          );
        }
      });
      return () => unsubscribe();
    } catch (err) {
      console.error('Error listening to branch targets:', err);
    }
  }, [appointmentsPool, packageMembersList]);

  const handleOpenEdit = (b: any, targetType: 'current' | 'next') => {
    setSelectedBranch(b);
    setEditingTargetType(targetType);
    setTargetInput(String(targetType === 'current' ? (b.monthlyTarget || '') : (b.nextMonthTarget || '')));
    setEditModalOpen(true);
  };

  const handleSaveTarget = async () => {
    if (!selectedBranch || !targetInput) return;
    const num = Number(targetInput.replace(/[^0-9]/g, ''));
    if (isNaN(num) || num <= 0) {
      Alert.alert('Invalid Input', 'Please enter a valid numeric target.');
      return;
    }

    const currentMonthKey = getCurrentMonthYMD(now);
    const nextMonthKey = getNextMonthYMD(now);

    try {
      const db = getSafeDb();
      if (!db) return;
      const docRef = doc(db, 'branchTargets', selectedBranch.id);
      const updatePayload: any = {
        branchId: selectedBranch.id,
        branchName: selectedBranch.name,
        updatedAt: new Date().toISOString(),
        currentMonth: currentMonthKey,
        nextMonth: nextMonthKey,
      };

      if (editingTargetType === 'current') {
        const currentDocSnap = await getDoc(docRef).catch(() => null);
        const liveReached = Number(currentDocSnap?.data()?.targetReached ?? selectedBranch.targetReached ?? 0);
        updatePayload.monthlyTarget = num;
        updatePayload.targetReached = liveReached;
        updatePayload.remaining = Math.max(0, num - liveReached);
        updatePayload.percentage = num > 0 ? Math.min(Math.round((liveReached / num) * 100), 100) : 0;
        updatePayload.isReached = liveReached >= num;
        updatePayload[`monthlyTargets.${currentMonthKey}`] = num;
      } else {
        updatePayload.nextMonthTarget = num;
        updatePayload[`monthlyTargets.${nextMonthKey}`] = num;
      }

      await setDoc(docRef, updatePayload, { merge: true });

      setBranchTargets(prev => prev.map(b => {
        if (b.id === selectedBranch.id) {
          return editingTargetType === 'current'
            ? { ...b, monthlyTarget: num }
            : { ...b, nextMonthTarget: num };
        }
        return b;
      }));

      Alert.alert('Target Updated', `${editingTargetType === 'current' ? currentMonthName : nextMonthName} Target for ${selectedBranch.name} set to ₹${num.toLocaleString('en-IN')}`);
      setEditModalOpen(false);
    } catch (err) {
      console.error('Error saving target:', err);
      Alert.alert('Error', 'Failed to update target in Firestore.');
    }
  };

  const formatCurrency = (val: number) => `₹${val.toLocaleString('en-IN')}`;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 80 }} showsVerticalScrollIndicator={false}>
      {/* Header Row */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Branch Targets (Admin)</Text>
          <Text style={styles.subTitle}>Configure financial targets for all branches.</Text>
        </View>
        <View style={styles.adminBadge}>
          <Feather name="shield" size={12} color="#16a34a" />
          <Text style={styles.adminBadgeText}>Admin Access</Text>
        </View>
      </View>

      {/* Month Selector Tabs */}
      <View style={styles.monthTabContainer}>
        <TouchableOpacity
          style={[styles.monthTabBtn, activeMonthTab === 'current' && styles.monthTabActive]}
          onPress={() => setActiveMonthTab('current')}
        >
          <Feather name="calendar" size={13} color={activeMonthTab === 'current' ? '#ffffff' : '#64748b'} />
          <Text style={[styles.monthTabText, activeMonthTab === 'current' && styles.monthTabTextActive]}>
            {now.toLocaleString('default', { month: 'short' })} Target
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.monthTabBtn, activeMonthTab === 'next' && styles.monthTabActive]}
          onPress={() => setActiveMonthTab('next')}
        >
          <Feather name="calendar" size={13} color={activeMonthTab === 'next' ? '#ffffff' : '#64748b'} />
          <Text style={[styles.monthTabText, activeMonthTab === 'next' && styles.monthTabTextActive]}>
            {nextMonthDate.toLocaleString('default', { month: 'short' })} Target
          </Text>
        </TouchableOpacity>
      </View>

      {/* Admin Info Banner */}
      <View style={styles.lockBanner}>
        <Feather name="shield" size={15} color="#16a34a" style={{ marginRight: 8 }} />
        <Text style={styles.lockBannerText}>
          Admin Access: You can enter, edit, and change branch targets at <Text style={{ fontWeight: '800' }}>any time</Text>.
        </Text>
      </View>

      {/* Branch Target Cards */}
      {branchTargets.map(b => (
        <View key={b.id} style={styles.card}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text style={styles.cardTitle}>{b.name}</Text>
            <TouchableOpacity
              style={styles.editBtn}
              onPress={() => handleOpenEdit(b, activeMonthTab)}
            >
              <Feather name="edit-3" size={12} color="#ffffff" />
              <Text style={styles.editBtnText}>
                {activeMonthTab === 'current' ? 'Set Target' : 'Set Next Target'}
              </Text>
            </TouchableOpacity>
          </View>

          {activeMonthTab === 'current' ? (
            (() => {
              const directRev = calculateRealBranchRevenue(b.id, appointmentsPool, packageMembersList, b.monthlyTarget);
              const effectiveReached = Math.max(b.targetReached || 0, directRev.targetReached || 0);
              return (
                <TargetProgressUI
                  branchName={b.name}
                  monthlyTarget={b.monthlyTarget}
                  targetReached={effectiveReached}
                />
              );
            })()
          ) : (
            <View style={styles.nextMonthBox}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <Text style={styles.nextMonthBoxTitle}>📅 {nextMonthName} Planned Goal</Text>
                <View style={styles.statusTag}>
                  <Text style={styles.statusTagText}>Admin Access</Text>
                </View>
              </View>
              <View style={styles.nextValRow}>
                <Text style={styles.nextValLabel}>Configured Goal ({nextMonthDate.toLocaleString('default', { month: 'short' })}):</Text>
                <Text style={styles.nextValText}>
                  {b.nextMonthTarget > 0 ? formatCurrency(b.nextMonthTarget) : 'Not Configured Yet'}
                </Text>
              </View>
            </View>
          )}
        </View>
      ))}

      {/* EDIT TARGET MODAL */}
      <Modal visible={editModalOpen} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Set {editingTargetType === 'current' ? currentMonthName : nextMonthName} Target</Text>
            <Text style={styles.modalSub}>{selectedBranch?.name}</Text>

            <Text style={styles.inputLabel}>Monthly Revenue Target (₹)</Text>
            <TextInput
              style={styles.textInput}
              keyboardType="numeric"
              value={targetInput}
              onChangeText={setTargetInput}
              placeholder="Enter target amount (e.g. 725000)"
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditModalOpen(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveTarget}>
                <Text style={styles.saveBtnText}>Save Target</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 12 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, backgroundColor: '#ffffff', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  title: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  subTitle: { fontSize: 11.5, color: '#64748b', marginTop: 2 },
  adminBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  adminBadgeText: { fontSize: 11, fontWeight: '700', color: '#166534' },
  monthTabContainer: { flexDirection: 'row', backgroundColor: '#ffffff', borderRadius: 12, padding: 4, marginBottom: 10, borderWidth: 1, borderColor: '#e2e8f0', gap: 6 },
  monthTabBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 9, borderRadius: 8, gap: 6 },
  monthTabActive: { backgroundColor: '#258ec8' },
  monthTabText: { fontSize: 12.5, fontWeight: '700', color: '#64748b' },
  monthTabTextActive: { color: '#ffffff', fontWeight: '800' },
  lockBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0', padding: 10, borderRadius: 12, marginBottom: 10 },
  lockBannerText: { fontSize: 11.5, color: '#166534', flex: 1 },
  card: { backgroundColor: '#ffffff', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 10 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#258ec8', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  editBtnText: { fontSize: 11.5, fontWeight: '700', color: '#ffffff' },
  nextMonthBox: { backgroundColor: '#f8fafc', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#e2e8f0' },
  nextMonthBoxTitle: { fontSize: 12, fontWeight: '700', color: '#0f172a' },
  statusTag: { backgroundColor: '#dcfce7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: '#bbf7d0' },
  statusTagText: { fontSize: 10, fontWeight: '700', color: '#16a34a' },
  nextValRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#ffffff', padding: 8, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', marginTop: 6 },
  nextValLabel: { fontSize: 11.5, color: '#64748b', fontWeight: '600' },
  nextValText: { fontSize: 14, fontWeight: '800', color: '#0f172a' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.5)', justifyContent: 'center', padding: 16 },
  modalContent: { backgroundColor: '#ffffff', borderRadius: 16, padding: 18, borderWidth: 1, borderColor: '#e2e8f0' },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  modalSub: { fontSize: 12, color: '#64748b', marginBottom: 14 },
  inputLabel: { fontSize: 11.5, fontWeight: '700', color: '#334155', marginBottom: 6 },
  textInput: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, fontWeight: '700', color: '#0f172a', marginBottom: 16 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  cancelBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: '#f1f5f9' },
  cancelBtnText: { fontSize: 12.5, fontWeight: '700', color: '#64748b' },
  saveBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: '#258ec8' },
  saveBtnText: { fontSize: 12.5, fontWeight: '700', color: '#ffffff' }
});
