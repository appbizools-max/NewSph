import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Modal, TextInput, Alert } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { getSafeDb, doc, onSnapshot, setDoc, collection } from '../../../utils/firebaseSafe';
import { TargetProgressUI } from '../../../components/TargetProgressUI';

const DEFAULT_BRANCH_TARGETS = [
  { id: 'kphb', name: 'KPHB Branch', phone: '+91 90301 76176', monthlyTarget: 725000, targetReached: 0, nextMonthTarget: 0 },
  { id: 'nallagandla', name: 'Nallagandla Branch', phone: '+91 91321 76176', monthlyTarget: 325000, targetReached: 0, nextMonthTarget: 0 },
  { id: 'dilshuknagar', name: 'Dilshuknagar Branch', phone: '+91 98041 76176', monthlyTarget: 225000, targetReached: 0, nextMonthTarget: 0 },
  { id: 'chandanagar', name: 'Chandanagar Branch', phone: '+91 95531 76176', monthlyTarget: 550000, targetReached: 0, nextMonthTarget: 0 },
];

interface ManageBranchesScreenProps {
  onBack?: () => void;
  onNavigate?: (tab: string) => void;
  role?: string;
}

export const ManageBranchesScreen: React.FC<ManageBranchesScreenProps> = ({ onBack, role = 'admin' }) => {
  const db = getSafeDb();
  const isAdmin = role !== 'hr';
  const [branches, setBranches] = useState(DEFAULT_BRANCH_TARGETS);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<any>(null);
  const [editingTargetType, setEditingTargetType] = useState<'current' | 'next'>('current');
  const [targetInput, setTargetInput] = useState('');
  const [activeMonthTab, setActiveMonthTab] = useState<'current' | 'next'>('current');

  // Date Logic for Next Month Target Unlock (2 days before next month for HR)
  const now = new Date();
  const currentMonthName = now.toLocaleString('default', { month: 'long', year: 'numeric' });
  const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextMonthName = nextMonthDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  const totalDaysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const unlockDay = totalDaysInMonth - 2;
  const currentDay = now.getDate();
  const isNextMonthUnlocked = currentDay >= unlockDay;

  // Firestore Real-time Listener for Branch Targets
  useEffect(() => {
    if (!db) return;
    try {
      const colRef = collection(db, 'branchTargets');
      const unsubscribe = onSnapshot(colRef, (snapshot) => {
        if (!snapshot.empty) {
          const liveDataMap: Record<string, any> = {};
          snapshot.forEach((docSnap) => {
            liveDataMap[docSnap.id.toLowerCase()] = docSnap.data();
          });

          setBranches((prev) =>
            prev.map((b) => {
              const live = liveDataMap[b.id.toLowerCase()] || liveDataMap[b.name.toLowerCase()];
              if (live) {
                return {
                  ...b,
                  monthlyTarget: Number(live.monthlyTarget) || b.monthlyTarget,
                  targetReached: live.targetReached !== undefined ? Number(live.targetReached) : b.targetReached,
                  nextMonthTarget: live.nextMonthTarget !== undefined ? Number(live.nextMonthTarget) : 0,
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
  }, []);

  const handleOpenEdit = (b: any, targetType: 'current' | 'next') => {
    // Admin can edit at ANY time (both current and next month)
    // HR can only enter or change targets 2 days before month end
    if (!isAdmin && !isNextMonthUnlocked) {
      Alert.alert(
        'Target Setting Locked 🔒',
        `HR can enter or change targets only 2 days before month end (unlocks on ${now.toLocaleString('default', { month: 'short' })} ${unlockDay}th). Admin can edit targets anytime.`
      );
      return;
    }
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

    try {
      const updateData: any = {
        branchId: selectedBranch.id,
        branchName: selectedBranch.name,
        updatedAt: new Date().toISOString(),
      };

      if (editingTargetType === 'current') {
        updateData.monthlyTarget = num;
        updateData.targetReached = selectedBranch.targetReached || 0;
        updateData.remaining = Math.max(0, num - (selectedBranch.targetReached || 0));
        updateData.percentage = num > 0 ? Math.round(((selectedBranch.targetReached || 0) / num) * 100) : 0;
      } else {
        updateData.nextMonthTarget = num;
      }

      await setDoc(doc(db, 'branchTargets', selectedBranch.id), updateData, { merge: true });

      setBranches((prev) =>
        prev.map((b) => {
          if (b.id === selectedBranch.id) {
            return editingTargetType === 'current'
              ? { ...b, monthlyTarget: num }
              : { ...b, nextMonthTarget: num };
          }
          return b;
        })
      );

      Alert.alert('Target Updated', `${editingTargetType === 'current' ? currentMonthName : nextMonthName} Target for ${selectedBranch.name} set to ₹${num.toLocaleString('en-IN')}`);
      setEditModalOpen(false);
    } catch (err) {
      console.error('Error saving target:', err);
      Alert.alert('Error', 'Failed to update target in Firestore.');
    }
  };

  const isLockedForRole = !isAdmin && !isNextMonthUnlocked;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 80 }} showsVerticalScrollIndicator={false}>

      {/* Month Switcher Tabs - Full Width */}
      <View style={styles.monthTabContainer}>
        <TouchableOpacity
          style={[styles.monthTabBtn, activeMonthTab === 'current' && styles.monthTabActive]}
          onPress={() => setActiveMonthTab('current')}
        >
          <Feather name="calendar" size={14} color={activeMonthTab === 'current' ? '#ffffff' : '#64748b'} />
          <Text style={[styles.monthTabText, activeMonthTab === 'current' && styles.monthTabTextActive]}>
            {now.toLocaleString('default', { month: 'short' })} Target
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.monthTabBtn, activeMonthTab === 'next' && styles.monthTabActive]}
          onPress={() => setActiveMonthTab('next')}
        >
          <Feather name={isAdmin || isNextMonthUnlocked ? 'unlock' : 'lock'} size={14} color={activeMonthTab === 'next' ? '#ffffff' : ((isAdmin || isNextMonthUnlocked) ? '#16a34a' : '#64748b')} />
          <Text style={[styles.monthTabText, activeMonthTab === 'next' && styles.monthTabTextActive]}>
            {nextMonthDate.toLocaleString('default', { month: 'short' })} Target
          </Text>
        </TouchableOpacity>
      </View>

      {/* Lock Info / Admin Badge Banner */}
      {!isAdmin && !isNextMonthUnlocked && (
        <View style={styles.lockBanner}>
          <Feather name="lock" size={15} color="#64748b" style={{ marginRight: 8 }} />
          <Text style={styles.lockBannerText}>
            HR target setting unlocks on <Text style={{ fontWeight: '800', color: '#0f172a' }}>{now.toLocaleString('default', { month: 'short' })} {unlockDay}th</Text> (2 days before month end).
          </Text>
        </View>
      )}

      {isAdmin && (
        <View style={[styles.lockBanner, { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }]}>
          <Feather name="shield" size={15} color="#16a34a" style={{ marginRight: 8 }} />
          <Text style={[styles.lockBannerText, { color: '#166534' }]}>
            Admin Access: You can enter, edit, and change branch targets at <Text style={{ fontWeight: '800' }}>any time</Text>.
          </Text>
        </View>
      )}

      {/* Branch Cards List - Edge to Edge Width */}
      {branches.map((b) => (
        <View key={b.id} style={styles.branchWrapper}>
          <View style={styles.branchHeaderRow}>
            <View>
              <Text style={styles.branchName}>{b.name}</Text>
              <Text style={styles.branchPhone}>📞 {b.phone}</Text>
            </View>
            <TouchableOpacity
              style={[
                styles.editBtn,
                isLockedForRole && { backgroundColor: '#f1f5f9' }
              ]}
              disabled={isLockedForRole}
              onPress={() => handleOpenEdit(b, activeMonthTab)}
            >
              <Feather
                name={isLockedForRole ? 'lock' : 'edit-3'}
                size={14}
                color={isLockedForRole ? '#94a3b8' : '#ffffff'}
              />
              <Text style={[
                styles.editBtnText,
                isLockedForRole && { color: '#94a3b8' },
                !isLockedForRole && { color: '#ffffff' }
              ]}>
                {isLockedForRole ? 'Locked' : activeMonthTab === 'current' ? 'Set Target' : 'Set Next Target'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Current Month Target View */}
          {activeMonthTab === 'current' && (
            <TargetProgressUI
              branchName={b.name}
              monthlyTarget={b.monthlyTarget}
              targetReached={b.targetReached}
            />
          )}

          {/* Next Month Planned Target Card View */}
          {activeMonthTab === 'next' && (
            <View style={styles.nextMonthBox}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text style={styles.nextBoxTitle}>🗓️ {nextMonthName} Planned Goal</Text>
                {!isNextMonthUnlocked ? (
                  <View style={styles.lockBadgeMini}>
                    <Text style={styles.lockBadgeMiniText}>🔒 Unlocks {unlockDay}th</Text>
                  </View>
                ) : (
                  <View style={[styles.lockBadgeMini, { backgroundColor: '#dcfce7', borderColor: '#bbf7d0' }]}>
                    <Text style={[styles.lockBadgeMiniText, { color: '#16a34a' }]}>🔓 Unlocked</Text>
                  </View>
                )}
              </View>

              <View style={styles.nextBoxValRow}>
                <Text style={styles.nextBoxValLabel}>Target Goal ({nextMonthDate.toLocaleString('default', { month: 'short' })}):</Text>
                <Text style={styles.nextBoxValText}>₹{(b.nextMonthTarget ?? 0).toLocaleString('en-IN')}</Text>
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
              placeholder="e.g. 1200000"
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditModalOpen(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={handleSaveTarget}
              >
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
  container: { flex: 1, backgroundColor: '#f8fafc', paddingHorizontal: 6, paddingTop: 6 },
  topHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  backBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  subTitle: { fontSize: 11.5, color: '#64748b', marginTop: 1 },
  monthTabContainer: {
    width: '100%',
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 4,
    marginBottom: 10,
    gap: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  monthTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 8,
    gap: 6,
  },
  monthTabActive: {
    backgroundColor: '#258ec8',
  },
  monthTabText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#64748b',
  },
  monthTabTextActive: {
    color: '#ffffff',
    fontWeight: '800',
  },
  lockBanner: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 10,
    borderRadius: 12,
    marginBottom: 10,
  },
  lockBannerText: {
    fontSize: 11.5,
    color: '#475569',
    flex: 1,
  },
  branchWrapper: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 10,
  },
  branchHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    paddingHorizontal: 4,
    paddingTop: 2,
  },
  branchName: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  branchPhone: { fontSize: 11.5, color: '#64748b', marginTop: 1 },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#258ec8',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  editBtnText: { fontSize: 11.5, fontWeight: '700', color: '#ffffff' },
  nextMonthBox: {
    width: '100%',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 10,
    marginTop: 4,
  },
  nextBoxTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0f172a',
  },
  lockBadgeMini: {
    backgroundColor: '#e2e8f0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  lockBadgeMiniText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#64748b',
  },
  nextBoxValRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginTop: 4,
  },
  nextBoxValLabel: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
  },
  nextBoxValText: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0f172a',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  modalSub: { fontSize: 12, color: '#64748b', marginBottom: 14 },
  inputLabel: { fontSize: 11.5, fontWeight: '700', color: '#334155', marginBottom: 6 },
  textInput: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 16,
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  cancelBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: '#f1f5f9' },
  cancelBtnText: { fontSize: 12.5, fontWeight: '700', color: '#64748b' },
  saveBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: '#258ec8' },
  saveBtnText: { fontSize: 12.5, fontWeight: '700', color: '#ffffff' },
});
