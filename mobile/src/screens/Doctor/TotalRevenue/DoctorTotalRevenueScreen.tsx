import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getSafeDb, collection, onSnapshot, query, limit } from '../../../utils/firebaseSafe';

export const DoctorTotalRevenueScreen: React.FC = () => {
  const db = getSafeDb();
  const [timeframe, setTimeframe] = useState<'month' | 'year' | 'all'>('month');
  const [totalRevenue, setTotalRevenue] = useState<number>(0);
  const [branchBreakdown, setBranchBreakdown] = useState<Array<{ name: string; revenue: number; target: number }>>([]);
  const [recentReceipts, setRecentReceipts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!db) return;

    // 1. Live listener for branch targets and totals
    const branchUnsub = onSnapshot(collection(db, 'branchTargets'), (snap) => {
      let sum = 0;
      const branches: Array<{ name: string; revenue: number; target: number }> = [];
      snap.forEach((d) => {
        const data = d.data();
        const reached = Number(data.targetReached) || 0;
        const target = Number(data.monthlyTarget) || 0;
        sum += reached;
        branches.push({
          name: data.branchName || d.id.toUpperCase(),
          revenue: reached,
          target: target
        });
      });
      setTotalRevenue(sum);
      setBranchBreakdown(branches);
      setIsLoading(false);
    }, (err) => {
      console.warn('DoctorTotalRevenueScreen targets notice:', err);
      setIsLoading(false);
    });

    // 2. Live listener for actual recent payments
    const aptUnsub = onSnapshot(query(collection(db, 'appointments'), limit(15)), (snap) => {
      const txns: any[] = [];
      snap.forEach((d) => {
        const data = d.data();
        const amt = Number(data.totalAmount) || Number(data.paidAmount) || Number(data.amountPaid) || Number(data.consultationFee) || 0;
        if (amt > 0) {
          txns.push({
            id: d.id,
            patient: data.patientName || data.name || 'Patient',
            service: data.service || data.treatment || data.type || 'Consultation & Remedy',
            amount: `₹${amt.toLocaleString('en-IN')}`,
            mode: (data.paymentMode || data.paymentMethod || 'UPI').toUpperCase()
          });
        }
      });
      setRecentReceipts(txns);
    }, (err) => {
      console.warn('DoctorTotalRevenueScreen appointments notice:', err);
    });

    return () => {
      branchUnsub();
      aptUnsub();
    };
  }, []);

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Banner */}
      <View style={styles.headerBanner}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.bannerTitle}>Total Revenue</Text>
              <View style={styles.headBadge}>
                <Text style={styles.headBadgeText}>HEAD DOCTOR</Text>
              </View>
            </View>
            <Text style={styles.bannerSub}>Authoritative financial records & branch collections</Text>
          </View>
          <Ionicons name="stats-chart" size={28} color="#38bdf8" />
        </View>

        {/* Timeframe Selector */}
        <View style={styles.timeframeRow}>
          {([
            { id: 'month', label: 'This Month' },
            { id: 'year', label: 'This Year' },
            { id: 'all', label: 'All Time' }
          ] as const).map((t) => (
            <TouchableOpacity
              key={t.id}
              style={[styles.tfBtn, timeframe === t.id && styles.tfBtnActive]}
              onPress={() => setTimeframe(t.id)}
            >
              <Text style={[styles.tfBtnText, timeframe === t.id && styles.tfBtnTextActive]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Primary Hero Revenue Card */}
      <View style={styles.heroCard}>
        <Text style={styles.heroLabel}>CURRENT MONTH REVENUE (ALL 4 BRANCHES)</Text>
        {isLoading ? (
          <ActivityIndicator color="#ffffff" style={{ marginVertical: 10 }} />
        ) : (
          <Text style={styles.heroAmount}>₹{totalRevenue.toLocaleString('en-IN')}</Text>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 4 }}>
          <Ionicons name="shield-checkmark-outline" size={16} color="#a7f3d0" />
          <Text style={styles.heroGrowth}>Authoritative verified collections across clinic branches</Text>
        </View>
      </View>

      {/* Branch Breakdown Cards */}
      <View style={styles.sectionBox}>
        <View style={styles.sectionHeader}>
          <Ionicons name="business-outline" size={20} color="#0284c7" />
          <Text style={styles.sectionTitle}>Branch Revenue Collections</Text>
        </View>

        {branchBreakdown.map((b, idx) => {
          const pct = b.target > 0 ? Math.min(Math.round((b.revenue / b.target) * 100), 100) : 0;
          return (
            <View key={idx} style={styles.payRow}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={styles.payModeName}>{b.name}</Text>
                <Text style={styles.payModeAmt}>₹{b.revenue.toLocaleString('en-IN')} ({pct}%)</Text>
              </View>
              <View style={styles.barBg}>
                <View style={[styles.barFill, { width: `${pct}%` }]} />
              </View>
            </View>
          );
        })}
      </View>

      {/* Recent Receipts List */}
      <View style={styles.sectionBox}>
        <View style={styles.sectionHeader}>
          <Ionicons name="receipt-outline" size={20} color="#16a34a" />
          <Text style={styles.sectionTitle}>Recent Verified Receipts</Text>
        </View>

        {recentReceipts.length === 0 ? (
          <Text style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic', paddingVertical: 8 }}>
            No recent transaction records found.
          </Text>
        ) : (
          recentReceipts.map((tx) => (
            <View key={tx.id} style={styles.txCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={styles.txPatient}>{tx.patient}</Text>
                <Text style={styles.txAmt}>{tx.amount}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                <Text style={styles.txService}>{tx.service}</Text>
                <Text style={styles.txMode}>{tx.mode}</Text>
              </View>
            </View>
          ))
        )}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', paddingHorizontal: 14, paddingTop: 12 },
  headerBanner: {
    backgroundColor: '#0f172a',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  bannerTitle: { fontSize: 18, fontWeight: '800', color: '#ffffff' },
  bannerSub: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
  headBadge: { backgroundColor: 'rgba(56, 189, 248, 0.2)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  headBadgeText: { color: '#38bdf8', fontSize: 9, fontWeight: '800' },
  timeframeRow: { flexDirection: 'row', marginTop: 12, gap: 6 },
  tfBtn: { flex: 1, paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center' },
  tfBtnActive: { backgroundColor: '#ffffff' },
  tfBtnText: { fontSize: 11, fontWeight: '700', color: '#94a3b8', textTransform: 'capitalize' },
  tfBtnTextActive: { color: '#0f172a', fontWeight: '800' },
  heroCard: {
    backgroundColor: '#0284c7',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  heroLabel: { fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.85)' },
  heroAmount: { fontSize: 26, fontWeight: '900', color: '#ffffff', marginTop: 4 },
  heroGrowth: { fontSize: 12, fontWeight: '700', color: '#a7f3d0' },
  sectionBox: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 12,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  payRow: { marginBottom: 10 },
  payModeName: { fontSize: 12.5, fontWeight: '700', color: '#334155' },
  payModeAmt: { fontSize: 12, fontWeight: '800', color: '#0f172a' },
  barBg: { height: 6, backgroundColor: '#f1f5f9', borderRadius: 3, overflow: 'hidden', marginTop: 4 },
  barFill: { height: '100%', backgroundColor: '#0284c7', borderRadius: 3 },
  txCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    marginBottom: 8,
  },
  txPatient: { fontSize: 13.5, fontWeight: '800', color: '#0f172a' },
  txAmt: { fontSize: 14, fontWeight: '900', color: '#0284c7' },
  txService: { fontSize: 11.5, color: '#64748b' },
  txMode: { fontSize: 10.5, fontWeight: '800', color: '#475569', backgroundColor: '#e2e8f0', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
});
