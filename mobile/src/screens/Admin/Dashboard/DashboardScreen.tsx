import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getSafeDb, collection, onSnapshot } from '../../../utils/firebaseSafe';

export const DashboardScreen: React.FC = () => {
  const db = getSafeDb();
  const [totalRevenue, setTotalRevenue] = useState<number>(0);
  const [activeBranchesCount, setActiveBranchesCount] = useState<number>(4);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!db) return;
    try {
      const colRef = collection(db, 'branchTargets');
      const unsub = onSnapshot(colRef, (snap) => {
        if (!snap.empty) {
          let sum = 0;
          snap.forEach((d) => {
            const data = d.data();
            sum += Number(data.targetReached) || 0;
          });
          setTotalRevenue(sum);
          setActiveBranchesCount(snap.size || 4);
        }
        setIsLoading(false);
      }, (err) => {
        console.warn('DashboardScreen branchTargets notice:', err);
        setIsLoading(false);
      });
      return () => unsub();
    } catch (_) {
      setIsLoading(false);
    }
  }, []);

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.headerRow}>
        <MaterialCommunityIcons name="view-dashboard" size={24} color="#258ec8" />
        <Text style={styles.title}>Admin Overview Dashboard</Text>
      </View>
      <Text style={styles.subTitle}>Live clinic operations & high-level system summary.</Text>

      <View style={styles.card}>
        <Text style={styles.cardHeader}>Current Month Metrics</Text>
        <Text style={styles.statText}>
          Total Revenue:{' '}
          <Text style={{ fontWeight: '800', color: '#258ec8' }}>
            {isLoading ? 'Loading...' : `₹${totalRevenue.toLocaleString('en-IN')}`}
          </Text>
        </Text>
        <Text style={styles.statText}>
          Active Branches:{' '}
          <Text style={{ fontWeight: '800', color: '#0f172a' }}>{activeBranchesCount} Official Branches</Text>
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  title: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  subTitle: { fontSize: 12, color: '#64748b', marginBottom: 16 },
  card: { backgroundColor: '#ffffff', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#e2e8f0' },
  cardHeader: { fontSize: 15, fontWeight: '800', color: '#0f172a', marginBottom: 10 },
  statText: { fontSize: 13, color: '#334155', fontWeight: '600', marginBottom: 8 },
});
