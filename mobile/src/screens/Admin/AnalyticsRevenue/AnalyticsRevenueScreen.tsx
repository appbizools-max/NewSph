import React, { useState, useEffect, useMemo } from 'react';
import {
  StyleSheet, Text, View, ScrollView, TouchableOpacity, ActivityIndicator,
  TextInput, RefreshControl
} from 'react-native';
import { Ionicons, Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { getSafeDb, collection, onSnapshot, query, limit } from '../../../utils/firebaseSafe';

interface TransactionItem {
  id: string;
  patientName: string;
  regId: string;
  branchName: string;
  doctorName: string;
  revenueSplit: string;
  totalAmount: number;
  paymentMethod: string;
  timestamp: string;
  dateTime: string;
}

const normalizeToYMD = (raw: any): string => {
  if (!raw) return '';
  let val = raw;
  if (typeof val === 'object') {
    if (typeof val.toDate === 'function') val = val.toDate();
    else if (typeof val.seconds === 'number') val = new Date(val.seconds * 1000);
  }
  if (val instanceof Date) {
    if (!isNaN(val.getTime())) {
      const y = val.getFullYear();
      const m = String(val.getMonth() + 1).padStart(2, '0');
      const d = String(val.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    return '';
  }
  const str = String(val).trim();
  const isoMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
  const ddmmyyyyMatch = str.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  if (ddmmyyyyMatch) return `${ddmmyyyyMatch[3]}-${ddmmyyyyMatch[2].padStart(2, '0')}-${ddmmyyyyMatch[1].padStart(2, '0')}`;
  return '';
};

export const AnalyticsRevenueScreen: React.FC = () => {
  const db = getSafeDb();

  // Current Date helpers
  const now = new Date();
  const currentYearStr = String(now.getFullYear());
  const currentMonthNum = now.getMonth() + 1;
  const currentMonthStr = `${currentYearStr}-${String(currentMonthNum).padStart(2, '0')}`;

  const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthStr = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;

  // Filter States: Default to THIS MONTH as per requirement
  const [dateMode, setDateMode] = useState<'this_month' | 'prev_month' | 'this_year' | 'all'>('this_month');
  const [selectedBranch, setSelectedBranch] = useState<'all' | 'kphb' | 'nallagandla' | 'dilshuknagar' | 'chandanagar'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Live Data States
  const [branchTargets, setBranchTargets] = useState<Record<string, any>>({});
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  useEffect(() => {
    if (!db) {
      setIsLoading(false);
      return;
    }

    // 1. Live listener for authoritative branchTargets
    const targetsUnsub = onSnapshot(collection(db, 'branchTargets'), (snap) => {
      const map: Record<string, any> = {};
      snap.forEach((d) => {
        map[d.id.toLowerCase()] = d.data();
      });
      setBranchTargets(map);
    }, (err) => {
      console.warn('AnalyticsRevenueScreen targets notice:', err);
    });

    // 2. Live listener for transactions from appointments and alltransactions
    const allTxnUnsub = onSnapshot(query(collection(db, 'alltransactions'), limit(300)), (snap) => {
      const txns: TransactionItem[] = [];
      snap.forEach((d) => {
        const item = d.data();
        const amt = Number(item.amount) || Number(item.totalAmount) || Number(item.paidAmount) || 0;
        if (amt > 0) {
          const ymd = normalizeToYMD(item.timestamp || item.paymentCollectedAt || item.date || item.createdAt);
          const branchName = item.branchName || item.branch || 'KPHB';
          const method = String(item.paymentMethod || item.method || 'upi').toLowerCase();
          txns.push({
            id: d.id,
            patientName: item.patientName || item.name || 'Patient',
            regId: item.regId || item.registrationId || item.patientId || 'SPH-001',
            branchName: branchName,
            doctorName: item.doctorName || item.doctor || 'Dr. SPH Specialist',
            revenueSplit: item.revenueSplit || item.service || 'Consultation & Medicine Fee',
            totalAmount: amt,
            paymentMethod: method,
            timestamp: ymd,
            dateTime: ymd
          });
        }
      });
      setTransactions(txns);
      setIsLoading(false);
      setRefreshing(false);
    }, (err) => {
      console.warn('AnalyticsRevenueScreen alltransactions notice:', err);
      setIsLoading(false);
      setRefreshing(false);
    });

    return () => {
      targetsUnsub();
      allTxnUnsub();
    };
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 800);
  };

  // Branch stats calculation from branchTargets
  const branchSummary = useMemo(() => {
    const list = [
      { id: 'kphb', name: 'KPHB Branch' },
      { id: 'chandanagar', name: 'Chandanagar Branch' },
      { id: 'nallagandla', name: 'Nallagandla Branch' },
      { id: 'dilshuknagar', name: 'Dilshuknagar Branch' }
    ];

    let totalReached = 0;
    let totalTarget = 0;

    const branches = list.map((b) => {
      const data = branchTargets[b.id] || {};
      const reached = Number(data.targetReached) || 0;
      const target = Number(data.monthlyTarget) || 0;
      totalReached += reached;
      totalTarget += target;
      const pct = target > 0 ? Math.min(Math.round((reached / target) * 100), 100) : 0;
      return {
        id: b.id,
        name: b.name,
        reached,
        target,
        pct
      };
    });

    return {
      branches,
      totalReached,
      totalTarget
    };
  }, [branchTargets]);

  // Filtered transactions calculation
  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      // 1. Branch filter
      if (selectedBranch !== 'all') {
        const bLower = t.branchName.toLowerCase();
        if (!bLower.includes(selectedBranch)) return false;
      }

      // 2. Date mode filter
      if (dateMode === 'this_month') {
        if (!t.timestamp.startsWith(currentMonthStr)) return false;
      } else if (dateMode === 'prev_month') {
        if (!t.timestamp.startsWith(prevMonthStr)) return false;
      } else if (dateMode === 'this_year') {
        if (!t.timestamp.startsWith(currentYearStr)) return false;
      }

      // 3. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matches =
          t.patientName.toLowerCase().includes(q) ||
          t.regId.toLowerCase().includes(q) ||
          t.doctorName.toLowerCase().includes(q);
        if (!matches) return false;
      }

      return true;
    });
  }, [transactions, selectedBranch, dateMode, searchQuery, currentMonthStr, prevMonthStr, currentYearStr]);

  // Totals by payment mode
  const modeTotals = useMemo(() => {
    let cash = 0;
    let upi = 0;
    let card = 0;

    filteredTransactions.forEach((t) => {
      if (t.paymentMethod === 'cash') cash += t.totalAmount;
      else if (t.paymentMethod === 'card') card += t.totalAmount;
      else upi += t.totalAmount;
    });

    return { cash, upi, card };
  }, [filteredTransactions]);

  // Effective Total Revenue to display
  const displayedRevenue = useMemo(() => {
    if (dateMode === 'this_month') {
      if (selectedBranch === 'all') {
        return branchSummary.totalReached;
      }
      const b = branchSummary.branches.find((item) => item.id === selectedBranch);
      return b ? b.reached : 0;
    }
    return filteredTransactions.reduce((sum, t) => sum + t.totalAmount, 0);
  }, [dateMode, selectedBranch, branchSummary, filteredTransactions]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 60 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={['#258ec8']} />}
    >
      {/* HEADER BANNER */}
      <View style={styles.headerCard}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <MaterialCommunityIcons name="finance" size={20} color="#258ec8" />
              <Text style={styles.title}>Total Revenue</Text>
            </View>
            <Text style={styles.subTitle}>Live clinic revenue, collections & branch ledger</Text>
          </View>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveBadgeText}>FIRESTORE LIVE</Text>
          </View>
        </View>

        {/* QUICK DATE MODE PILLS */}
        <View style={styles.datePillsRow}>
          {([
            { id: 'this_month', label: 'This Month' },
            { id: 'prev_month', label: 'Prev Month' },
            { id: 'this_year', label: 'This Year' },
            { id: 'all', label: 'All Time' }
          ] as const).map((item) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.datePillBtn, dateMode === item.id && styles.datePillBtnActive]}
              onPress={() => setDateMode(item.id)}
            >
              <Text style={[styles.datePillText, dateMode === item.id && styles.datePillTextActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* BRANCH SELECTOR PILLS */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {([
            { id: 'all', label: 'All Branches' },
            { id: 'kphb', label: 'KPHB' },
            { id: 'chandanagar', label: 'Chandanagar' },
            { id: 'nallagandla', label: 'Nallagandla' },
            { id: 'dilshuknagar', label: 'Dilshuknagar' }
          ] as const).map((b) => (
            <TouchableOpacity
              key={b.id}
              style={[styles.branchPill, selectedBranch === b.id && styles.branchPillActive]}
              onPress={() => setSelectedBranch(b.id)}
            >
              <Text style={[styles.branchPillText, selectedBranch === b.id && styles.branchPillTextActive]}>
                {b.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* 4 PRIMARY METRIC CARDS */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
        {/* Total Revenue */}
        <View style={[styles.statCard, { flex: 1, minWidth: '47%', borderLeftWidth: 4, borderLeftColor: '#258ec8' }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={styles.statLabel}>TOTAL REVENUE</Text>
            <Ionicons name="cash-outline" size={16} color="#258ec8" />
          </View>
          {isLoading ? (
            <ActivityIndicator size="small" color="#258ec8" style={{ marginVertical: 6 }} />
          ) : (
            <Text style={styles.statVal}>₹{displayedRevenue.toLocaleString('en-IN')}</Text>
          )}
          <Text style={styles.statSub}>
            {dateMode === 'this_month' ? 'October 2026' : dateMode === 'prev_month' ? 'September 2026' : dateMode === 'this_year' ? 'Year 2026' : 'All Historical'}
          </Text>
        </View>

        {/* UPI Collections */}
        <View style={[styles.statCard, { flex: 1, minWidth: '47%', borderLeftWidth: 4, borderLeftColor: '#16a34a' }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={[styles.statLabel, { color: '#16a34a' }]}>UPI COLLECTIONS</Text>
            <Ionicons name="qr-code-outline" size={16} color="#16a34a" />
          </View>
          <Text style={[styles.statVal, { color: '#16a34a' }]}>₹{modeTotals.upi.toLocaleString('en-IN')}</Text>
          <Text style={styles.statSub}>Instant QR / Online</Text>
        </View>

        {/* Cash Collections */}
        <View style={[styles.statCard, { flex: 1, minWidth: '47%', borderLeftWidth: 4, borderLeftColor: '#0284c7' }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={styles.statLabel}>CASH COLLECTIONS</Text>
            <Ionicons name="wallet-outline" size={16} color="#0284c7" />
          </View>
          <Text style={styles.statVal}>₹{modeTotals.cash.toLocaleString('en-IN')}</Text>
          <Text style={styles.statSub}>Clinic Reception</Text>
        </View>

        {/* Card Collections */}
        <View style={[styles.statCard, { flex: 1, minWidth: '47%', borderLeftWidth: 4, borderLeftColor: '#d97706' }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={[styles.statLabel, { color: '#d97706' }]}>CARD COLLECTIONS</Text>
            <Ionicons name="card-outline" size={16} color="#d97706" />
          </View>
          <Text style={[styles.statVal, { color: '#d97706' }]}>₹{modeTotals.card.toLocaleString('en-IN')}</Text>
          <Text style={styles.statSub}>POS Machine</Text>
        </View>
      </View>

      {/* BRANCH REVENUE BREAKDOWN */}
      <View style={styles.card}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="business-outline" size={16} color="#258ec8" />
            <Text style={styles.cardTitle}>Branch Collections</Text>
          </View>
          <Text style={{ fontSize: 11, color: '#64748b' }}>4 Clinics</Text>
        </View>

        {branchSummary.branches.map((b) => (
          <View key={b.id} style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#0f172a' }}>{b.name}</Text>
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#258ec8' }}>
                ₹{b.reached.toLocaleString('en-IN')}
                <Text style={{ fontSize: 11, color: '#64748b', fontWeight: '500' }}> / ₹{b.target.toLocaleString('en-IN')}</Text>
              </Text>
            </View>
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: `${b.pct}%` }]} />
            </View>
            <Text style={{ fontSize: 10, color: '#64748b', marginTop: 2, textAlign: 'right' }}>{b.pct}% Target Achieved</Text>
          </View>
        ))}
      </View>

      {/* SEARCH BAR */}
      <View style={styles.searchBox}>
        <Ionicons name="search" size={16} color="#64748b" style={{ marginRight: 6 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search patient, reg ID, or doctor..."
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

      {/* RECENT TRANSACTIONS LEDGER */}
      <View style={styles.card}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="receipt-outline" size={16} color="#16a34a" />
            <Text style={styles.cardTitle}>Transaction Records</Text>
          </View>
          <Text style={{ fontSize: 11, color: '#64748b', fontWeight: '700' }}>
            {filteredTransactions.length} records
          </Text>
        </View>

        {filteredTransactions.length === 0 ? (
          <View style={{ paddingVertical: 24, alignItems: 'center' }}>
            <Ionicons name="document-text-outline" size={32} color="#cbd5e1" style={{ marginBottom: 6 }} />
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#64748b' }}>No transactions recorded</Text>
            <Text style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
              Try selecting a different date period or branch filter.
            </Text>
          </View>
        ) : (
          filteredTransactions.slice(0, 50).map((t) => (
            <View key={t.id} style={styles.txnRow}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.txnPatient}>{t.patientName}</Text>
                  <View style={styles.regBadge}>
                    <Text style={styles.regBadgeText}>{t.regId}</Text>
                  </View>
                </View>
                <Text style={styles.txnSub}>{t.branchName} • {t.doctorName}</Text>
                <Text style={[styles.txnSub, { color: '#0284c7', marginTop: 1 }]}>{t.revenueSplit}</Text>
              </View>

              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.txnAmount}>₹{t.totalAmount.toLocaleString('en-IN')}</Text>
                <View style={[styles.modeBadge, t.paymentMethod === 'cash' ? { backgroundColor: '#eff6ff' } : { backgroundColor: '#f0fdf4' }]}>
                  <Text style={[styles.modeBadgeText, t.paymentMethod === 'cash' ? { color: '#0284c7' } : { color: '#16a34a' }]}>
                    {t.paymentMethod.toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.txnDate}>{t.timestamp}</Text>
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', paddingHorizontal: 12, paddingTop: 10 },
  headerCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 10,
  },
  title: { fontSize: 17, fontWeight: '800', color: '#0f172a' },
  subTitle: { fontSize: 11.5, color: '#64748b', marginTop: 2 },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f0fdf4',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#bbf7d0'
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#16a34a' },
  liveBadgeText: { fontSize: 9.5, fontWeight: '800', color: '#16a34a' },
  datePillsRow: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
    padding: 3,
    marginTop: 12,
    gap: 4
  },
  datePillBtn: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: 8
  },
  datePillBtnActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1
  },
  datePillText: { fontSize: 11, fontWeight: '700', color: '#64748b' },
  datePillTextActive: { color: '#0f172a', fontWeight: '800' },
  branchPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  branchPillActive: {
    backgroundColor: '#258ec8',
    borderColor: '#258ec8'
  },
  branchPillText: { fontSize: 11.5, fontWeight: '700', color: '#475569' },
  branchPillTextActive: { color: '#ffffff', fontWeight: '800' },
  statCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  statLabel: { fontSize: 10, fontWeight: '800', color: '#64748b' },
  statVal: { fontSize: 19, fontWeight: '900', color: '#0f172a', marginVertical: 3 },
  statSub: { fontSize: 10, color: '#64748b' },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 12
  },
  cardTitle: { fontSize: 14, fontWeight: '800', color: '#0f172a' },
  progressBarBg: {
    height: 6,
    backgroundColor: '#f1f5f9',
    borderRadius: 3,
    overflow: 'hidden'
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#258ec8',
    borderRadius: 3
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 12
  },
  searchInput: { flex: 1, fontSize: 12, color: '#0f172a', fontWeight: '600' },
  txnRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9'
  },
  txnPatient: { fontSize: 13, fontWeight: '800', color: '#0f172a' },
  regBadge: {
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4
  },
  regBadgeText: { fontSize: 9.5, fontWeight: '800', color: '#0284c7' },
  txnSub: { fontSize: 11, color: '#64748b', marginTop: 1 },
  txnAmount: { fontSize: 14, fontWeight: '900', color: '#0f172a' },
  modeBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    marginTop: 2
  },
  modeBadgeText: { fontSize: 9, fontWeight: '800' },
  txnDate: { fontSize: 10, color: '#94a3b8', marginTop: 2 }
});
