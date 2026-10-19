import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Alert, Clipboard, ActivityIndicator, Dimensions } from 'react-native';
import { Text, Surface, Avatar, Divider, IconButton } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SIZES } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, doc } from 'firebase/firestore';
import { ChevronLeft, Wallet, Gift, Tag, Coins, Copy, Check, ArrowUpRight, ArrowDownLeft, User, Phone, Calendar } from 'lucide-react-native';

const { width } = Dimensions.get('window');

const WalletDetails = ({ navigation }) => {
  const { user, userData } = useAuth();
  const [patientRewardPoints, setPatientRewardPoints] = useState(0);
  const [activeCoupons, setActiveCoupons] = useState([]);
  const [couponsLoading, setCouponsLoading] = useState(true);
  const [transactions, setTransactions] = useState([]);
  const [transLoading, setTransLoading] = useState(true);
  const [copiedCodeId, setCopiedCodeId] = useState(null);

  // 1. Real-time patient profile points balance listener
  useEffect(() => {
    if (!user?.uid) return;
    const unsubPatient = onSnapshot(doc(db, 'patients', user.uid), (docSnap) => {
      if (docSnap.exists()) {
        setPatientRewardPoints(docSnap.data().rewardPoints || 0);
      }
    });
    return () => unsubPatient();
  }, [user]);

  // 2. Real-time coupons listener (active & client-side filtered for non-expired)
  useEffect(() => {
    if (!user?.uid) {
      setCouponsLoading(false);
      return;
    }
    const qCoupons = query(
      collection(db, 'coupons'),
      where('userId', '==', user.uid),
      where('status', '==', 'active')
    );
    const unsubCoupons = onSnapshot(qCoupons, (snapshot) => {
      const list = [];
      const now = new Date();
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        let expiryDateVal = null;
        if (data.expiryDate) {
          expiryDateVal = data.expiryDate.toDate ? data.expiryDate.toDate() : new Date(data.expiryDate);
        }
        if (!expiryDateVal || expiryDateVal >= now) {
          list.push({ id: docSnap.id, ...data, expiryDateVal });
        }
      });
      list.sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
        return dateB - dateA;
      });
      setActiveCoupons(list);
      setCouponsLoading(false);
    }, (error) => {
      console.error("Error listening to coupons in WalletDetails:", error);
      setCouponsLoading(false);
    });
    return () => unsubCoupons();
  }, [user]);

  // 3. Real-time reward transactions listener (sorted in-memory)
  useEffect(() => {
    if (!user?.uid) {
      setTransLoading(false);
      return;
    }
    const qTrans = query(
      collection(db, 'reward_points_transactions'),
      where('userId', '==', user.uid)
    );
    const unsubTrans = onSnapshot(qTrans, (snapshot) => {
      const list = [];
      snapshot.forEach(docSnap => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      list.sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
        return dateB - dateA;
      });
      setTransactions(list);
      setTransLoading(false);
    }, (error) => {
      console.error("Error listening to transactions in WalletDetails:", error);
      setTransLoading(false);
    });
    return () => unsubTrans();
  }, [user]);

  const handleCopyCode = (code, couponId) => {
    Clipboard.setString(code);
    setCopiedCodeId(couponId);
    setTimeout(() => setCopiedCodeId(null), 2000);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ChevronLeft size={28} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Wallet & Rewards</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Premium Reward Balance Card */}
        <Surface style={styles.walletCard}>
          <View style={styles.walletCardHeader}>
            <View style={styles.walletIconCircle}>
              <Coins size={20} color="#ffffff" />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.walletTitle}>Reward Points Balance</Text>
              <Text style={styles.walletSub}>Spiritual Homeopathy Reward Points</Text>
            </View>
          </View>

          <View style={styles.balanceContainer}>
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={styles.balanceLabel}>Available Reward Points</Text>
              <Text style={styles.balanceValue}>{patientRewardPoints} <Text style={{ fontSize: 16, fontWeight: 'normal', color: 'rgba(255,255,255,0.7)' }}>pts</Text></Text>
            </View>
          </View>
        </Surface>

        {/* Active Generated Coupons */}
        <View style={styles.sectionHeader}>
          <Gift size={18} color={COLORS.secondary} style={{ marginRight: 6 }} />
          <Text style={styles.sectionTitle}>Active Discount Coupons ({activeCoupons.length})</Text>
        </View>

        {couponsLoading ? (
          <ActivityIndicator size="small" color={COLORS.primary} style={{ marginVertical: 12 }} />
        ) : activeCoupons.length > 0 ? (
          <View style={styles.couponsList}>
            {activeCoupons.map((coupon) => (
              <Surface key={coupon.id} style={styles.couponTicket}>
                <View style={styles.couponLeft}>
                  <Tag size={16} color={COLORS.primary} />
                  <Text style={styles.couponLeftVal}>₹{coupon.pointsValue}</Text>
                  <Text style={styles.couponLeftSub}>Discount</Text>
                </View>
                
                <View style={styles.couponSeparator}>
                  <View style={styles.couponNotchTop} />
                  <View style={styles.couponNotchBottom} />
                </View>

                <View style={styles.couponRight}>
                  <View style={{ flex: 1, justifyContent: 'center' }}>
                    <Text style={styles.couponCode}>{coupon.code}</Text>
                    <Text style={styles.couponExpiry}>
                      Expires: {coupon.expiryDateStr ? new Date(coupon.expiryDateStr).toLocaleDateString('en-GB') : '3 mos'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.copyBtn, copiedCodeId === coupon.id && styles.copiedBtn]}
                    onPress={() => handleCopyCode(coupon.code, coupon.id)}
                  >
                    {copiedCodeId === coupon.id ? (
                      <Check size={14} color="#ffffff" />
                    ) : (
                      <Copy size={14} color={COLORS.primary} />
                    )}
                  </TouchableOpacity>
                </View>
              </Surface>
            ))}
          </View>
        ) : (
          <Surface style={styles.emptyCard}>
            <Gift size={28} color={COLORS.border} />
            <Text style={styles.emptyText}>No active coupons. Book a clinic consultation to earn coupons!</Text>
          </Surface>
        )}

        {/* Reward Point Transactions Ledger */}
        <View style={styles.sectionHeader}>
          <Calendar size={18} color={COLORS.primary} style={{ marginRight: 6 }} />
          <Text style={styles.sectionTitle}>Points History / Ledger</Text>
        </View>

        {transLoading ? (
          <ActivityIndicator size="small" color={COLORS.primary} style={{ marginVertical: 12 }} />
        ) : transactions.length > 0 ? (
          <Surface style={styles.transactionsContainer}>
            {transactions.map((t, idx) => {
              const isEarn = t.type === 'earn';
              return (
                <View key={t.id}>
                  <View style={styles.transactionRow}>
                    <View style={[styles.transIconCircle, { backgroundColor: isEarn ? '#ecfdf5' : '#fffbeb' }]}>
                      {isEarn ? (
                        <ArrowUpRight size={18} color="#10b981" />
                      ) : (
                        <ArrowDownLeft size={18} color="#f59e0b" />
                      )}
                    </View>
                    <View style={styles.transDetails}>
                      <Text style={styles.transDesc} numberOfLines={2}>{t.description || 'Points transaction'}</Text>
                      <Text style={styles.transDate}>
                        {t.createdAt?.toDate 
                          ? t.createdAt.toDate().toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                          : 'Recent'
                        }
                      </Text>
                    </View>
                    <Text style={[styles.transPoints, { color: isEarn ? '#10b981' : '#f59e0b' }]}>
                      {isEarn ? '+' : '-'}{t.points || 0}
                    </Text>
                  </View>
                  {idx < transactions.length - 1 && <Divider style={styles.transDivider} />}
                </View>
              );
            })}
          </Surface>
        ) : (
          <Surface style={styles.emptyCard}>
            <Coins size={28} color={COLORS.border} />
            <Text style={styles.emptyText}>No transaction records found in points history ledger.</Text>
          </Surface>
        )}
        
        <View style={{ height: 30 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fcfdfe' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9'
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  scrollContent: { padding: 16 },
  
  profileSummaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 16,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#dbeafe',
    elevation: 0,
    marginBottom: 20
  },
  avatarBg: { backgroundColor: COLORS.white, borderWidth: 1.5, borderColor: COLORS.primary },
  profileSummaryInfo: { flex: 1, marginLeft: 12 },
  profileName: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  profileContactRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  profileSub: { fontSize: 12, color: COLORS.muted, fontWeight: '500' },

  walletCard: {
    padding: 16,
    borderRadius: 20,
    backgroundColor: COLORS.primary, // SPH Blue
    elevation: 4,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    marginBottom: 24
  },
  walletCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20
  },
  walletIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.6)'
  },
  walletTitle: { fontSize: 15, fontWeight: '800', color: '#ffffff', letterSpacing: 0.5 },
  walletSub: { fontSize: 11, color: 'rgba(255,255,255,0.9)', fontWeight: '600' },
  walletRateBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: 'rgba(168, 206, 58, 0.25)',
    borderWidth: 1,
    borderColor: COLORS.secondary
  },
  walletRateText: { fontSize: 9, fontWeight: 'bold', color: COLORS.secondary },
  
  balanceContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)'
  },
  balanceLabel: { fontSize: 11, color: 'rgba(255,255,255,0.9)', fontWeight: '700', textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.4 },
  balanceValue: { fontSize: 20, fontWeight: '800', color: '#ffffff', textAlign: 'center', marginTop: 4 },
  balanceDivider: { width: 1, height: 28, backgroundColor: 'rgba(255, 255, 255, 0.4)', alignSelf: 'center' },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: COLORS.text, letterSpacing: 0.2 },
  
  couponsList: { gap: 12, marginBottom: 24 },
  couponTicket: {
    flexDirection: 'row',
    height: 58,
    borderRadius: 12,
    backgroundColor: COLORS.white,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    overflow: 'hidden'
  },
  couponLeft: {
    width: 72,
    backgroundColor: 'rgba(168, 206, 58, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4
  },
  couponLeftVal: { fontSize: 14, fontWeight: '800', color: COLORS.primary },
  couponLeftSub: { fontSize: 8, fontWeight: '700', color: COLORS.primary, textTransform: 'uppercase' },
  
  couponSeparator: {
    width: 1,
    backgroundColor: '#f1f5f9',
    justifyContent: 'space-between',
    alignItems: 'center',
    position: 'relative'
  },
  couponNotchTop: {
    position: 'absolute',
    top: -5,
    left: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fcfdfe' // Matches background screen color
  },
  couponNotchBottom: {
    position: 'absolute',
    bottom: -5,
    left: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fcfdfe' // Matches background screen color
  },
  
  couponRight: {
    flex: 1,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.white
  },
  couponCode: { fontSize: 13, fontWeight: '800', color: COLORS.text },
  couponExpiry: { fontSize: 9, color: COLORS.muted, fontWeight: '600', marginTop: 2 },
  
  copyBtn: {
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: COLORS.white
  },
  copiedBtn: {
    backgroundColor: COLORS.success,
    borderColor: COLORS.success
  },

  transactionsContainer: {
    borderRadius: 16,
    backgroundColor: COLORS.white,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    padding: 14,
    marginBottom: 20
  },
  transactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8
  },
  transIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center'
  },
  transDetails: { flex: 1, marginLeft: 12, marginRight: 8 },
  transDesc: { fontSize: 12, fontWeight: '600', color: COLORS.text, lineHeight: 16 },
  transDate: { fontSize: 9, color: COLORS.muted, fontWeight: '500', marginTop: 3 },
  transPoints: { fontSize: 14, fontWeight: '800', textAlign: 'right' },
  transDivider: { marginVertical: 4, backgroundColor: '#f1f5f9' },

  emptyCard: {
    padding: 24,
    borderRadius: 16,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    marginBottom: 24
  },
  emptyText: { fontSize: 11, color: COLORS.muted, textAlign: 'center', marginTop: 8, fontWeight: '500', lineHeight: 16 }
});

export default WalletDetails;
