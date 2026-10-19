import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Modal, TextInput, Alert } from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { getSafeDb, collection, onSnapshot, doc, setDoc } from '../../../utils/firebaseSafe';
import { receptionDataStore } from '../../../utils/receptionDataStore';
import { calculateRealBranchRevenue, syncBranchTargetToFirestore } from '../../../utils/branchRevenueCalculator';

const DEFAULT_BRANCH_TARGETS = [
  { id: 'kphb', name: 'KPHB Branch Target', monthlyTarget: 725000, targetReached: 0 },
  { id: 'nallagandla', name: 'Nallagandla Branch Target', monthlyTarget: 325000, targetReached: 0 },
  { id: 'dilshuknagar', name: 'Dilshuknagar Branch Target', monthlyTarget: 225000, targetReached: 0 },
  { id: 'chandanagar', name: 'Chandanagar Branch Target', monthlyTarget: 550000, targetReached: 0 },
];

export const BranchTargetHRScreen: React.FC = () => {
  const [branchTargets, setBranchTargets] = useState(DEFAULT_BRANCH_TARGETS);
  const [selectedBranch, setSelectedBranch] = useState<any>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [targetInput, setTargetInput] = useState('');

  // Date Logic for HR 2-day month-end unlock
  const now = new Date();
  const currentMonthName = now.toLocaleString('default', { month: 'long', year: 'numeric' });
  const totalDaysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const unlockDay = totalDaysInMonth - 2;
  const currentDay = now.getDate();
  const isMonthEndUnlocked = currentDay >= unlockDay;

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
              const live = liveMap[b.id.toLowerCase()] || liveMap[b.name.toLowerCase().replace(/\s*branch\s*target$/i, '')];
              if (live) {
                return {
                  ...b,
                  monthlyTarget: Number(live.monthlyTarget) || b.monthlyTarget,
                  targetReached: live.targetReached !== undefined ? Number(live.targetReached) : b.targetReached,
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

  const handleOpenEdit = (b: any) => {
    if (!isMonthEndUnlocked) {
      Alert.alert(
        'Target Setting Locked 🔒',
        `HR can set or update branch targets ONLY 2 days before the month end (unlocks on ${now.toLocaleString('default', { month: 'short' })} ${unlockDay}th). Admin can edit at any time.`
      );
      return;
    }
    setSelectedBranch(b);
    setTargetInput(b.monthlyTarget > 0 ? String(b.monthlyTarget) : '');
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
      const db = getSafeDb();
      if (!db) return;
      const docRef = doc(db, 'branchTargets', selectedBranch.id);
      await setDoc(docRef, {
        id: selectedBranch.id,
        branchName: selectedBranch.name,
        monthlyTarget: num,
        targetReached: selectedBranch.targetReached || 0,
        remaining: Math.max(0, num - (selectedBranch.targetReached || 0)),
        percentage: num > 0 ? Math.round(((selectedBranch.targetReached || 0) / num) * 100) : 0,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      setBranchTargets(prev => prev.map(b => b.id === selectedBranch.id ? { ...b, monthlyTarget: num } : b));
      Alert.alert('Target Updated', `Monthly Target for ${selectedBranch.name} set to ₹${num.toLocaleString('en-IN')}`);
      setEditModalOpen(false);
    } catch (err) {
      console.error('Error updating target:', err);
      Alert.alert('Error', 'Failed to update target.');
    }
  };

  const formatCurrency = (val: number) => `₹${val.toLocaleString('en-IN')}`;

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>HR Branch Target Management</Text>
          <Text style={styles.subTitle}>Branch revenue performance and staff targets.</Text>
        </View>
        <View style={[styles.hrBadge, isMonthEndUnlocked ? styles.hrBadgeOpen : styles.hrBadgeLocked]}>
          <Feather name={isMonthEndUnlocked ? "unlock" : "lock"} size={12} color={isMonthEndUnlocked ? "#16a34a" : "#64748b"} />
          <Text style={[styles.hrBadgeText, isMonthEndUnlocked && { color: '#166534' }]}>
            {isMonthEndUnlocked ? 'HR: Unlocked' : `HR: Opens ${unlockDay}th`}
          </Text>
        </View>
      </View>

      {/* Lock Info Banner */}
      {!isMonthEndUnlocked && (
        <View style={styles.lockBanner}>
          <Feather name="lock" size={15} color="#64748b" style={{ marginRight: 8 }} />
          <Text style={styles.lockBannerText}>
            HR target entry is currently locked. Unlocks on <Text style={{ fontWeight: '800', color: '#0f172a' }}>{now.toLocaleString('default', { month: 'short' })} {unlockDay}th</Text> (2 days before month end).
          </Text>
        </View>
      )}

      {isMonthEndUnlocked && (
        <View style={[styles.lockBanner, { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' }]}>
          <Feather name="unlock" size={15} color="#16a34a" style={{ marginRight: 8 }} />
          <Text style={[styles.lockBannerText, { color: '#166534' }]}>
            HR Target Setting Window is OPEN. You can enter or adjust branch targets now.
          </Text>
        </View>
      )}

      {branchTargets.map(b => {
        const pct = b.monthlyTarget > 0 ? Math.round((b.targetReached / b.monthlyTarget) * 100) : 0;
        return (
          <View key={b.name} style={styles.card}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={styles.cardTitle}>{b.name}</Text>
              <TouchableOpacity
                style={[styles.editBtn, !isMonthEndUnlocked && { backgroundColor: '#f1f5f9' }]}
                disabled={!isMonthEndUnlocked}
                onPress={() => handleOpenEdit(b)}
              >
                <Feather name={isMonthEndUnlocked ? "edit-3" : "lock"} size={12} color={isMonthEndUnlocked ? "#ffffff" : "#94a3b8"} />
                <Text style={[styles.editBtnText, !isMonthEndUnlocked && { color: '#94a3b8' }]}>
                  {isMonthEndUnlocked ? (b.monthlyTarget > 0 ? 'Edit' : 'Set') : 'Locked'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
              <Text style={styles.infoText}>
                Target: <Text style={{ fontWeight: '800', color: b.monthlyTarget > 0 ? '#258ec8' : '#64748b' }}>
                  {b.monthlyTarget > 0 ? formatCurrency(b.monthlyTarget) : 'Not Set'}
                </Text>
              </Text>
              <Text style={styles.infoText}>
                Current: <Text style={{ fontWeight: '800', color: '#16a34a' }}>{formatCurrency(b.targetReached)}</Text>
              </Text>
            </View>

            {b.monthlyTarget > 0 && (
              <View style={{ marginTop: 8 }}>
                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, { width: `${Math.min(pct, 100)}%` }]} />
                </View>
                <Text style={styles.pctText}>{pct}% Reached</Text>
              </View>
            )}
          </View>
        );
      })}

      {/* EDIT TARGET MODAL */}
      <Modal visible={editModalOpen} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Set Branch Target (HR)</Text>
            <Text style={styles.modalSub}>{selectedBranch?.name}</Text>

            <Text style={styles.inputLabel}>Monthly Revenue Target (₹)</Text>
            <TextInput
              style={styles.textInput}
              keyboardType="numeric"
              value={targetInput}
              onChangeText={setTargetInput}
              placeholder="e.g. 1500000"
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
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  subTitle: { fontSize: 12, color: '#64748b', marginTop: 2 },
  hrBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  hrBadgeLocked: { backgroundColor: '#f1f5f9', borderColor: '#e2e8f0' },
  hrBadgeOpen: { backgroundColor: '#dcfce7', borderColor: '#bbf7d0' },
  hrBadgeText: { fontSize: 11, fontWeight: '700', color: '#64748b' },
  lockBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e2e8f0', padding: 10, borderRadius: 12, marginBottom: 12 },
  lockBannerText: { fontSize: 11.5, color: '#475569', flex: 1 },
  card: { backgroundColor: '#ffffff', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 10 },
  cardTitle: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#258ec8', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  editBtnText: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
  infoText: { fontSize: 13, color: '#475569' },
  progressBarBg: { height: 6, backgroundColor: '#e2e8f0', borderRadius: 3, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: '#258ec8', borderRadius: 3 },
  pctText: { fontSize: 11, fontWeight: '700', color: '#258ec8', marginTop: 4, textAlign: 'right' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.5)', justifyContent: 'center', padding: 16 },
  modalContent: { backgroundColor: '#ffffff', borderRadius: 16, padding: 18, borderWidth: 1, borderColor: '#e2e8f0' },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  modalSub: { fontSize: 12, color: '#64748b', marginBottom: 14 },
  inputLabel: { fontSize: 12, fontWeight: '700', color: '#334155', marginBottom: 6 },
  textInput: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, fontWeight: '700', color: '#0f172a', marginBottom: 16 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  cancelBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, backgroundColor: '#f1f5f9' },
  cancelBtnText: { fontSize: 12.5, fontWeight: '700', color: '#64748b' },
  saveBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: '#258ec8' },
  saveBtnText: { fontSize: 12.5, fontWeight: '700', color: '#ffffff' },
});
