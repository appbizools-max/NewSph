import React, { useState, useEffect } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, Modal, RefreshControl } from 'react-native';
import { Text, Surface, ActivityIndicator, Badge, Avatar, Button } from 'react-native-paper';
import { COLORS } from '../constants/theme';
import { db } from '../firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { 
  CreditCard, Calendar, ArrowLeft, ChevronRight, 
  TrendingUp, CheckCircle, Download, ExternalLink, ShieldCheck 
} from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const PaymentHistory = ({ navigation }) => {
  const { user, userData } = useAuth();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [totalSpent, setTotalSpent] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchPayments();
    setRefreshing(false);
  };

  useEffect(() => {
    if (user) {
      fetchPayments();
    }
  }, [user, userData]);

  const fetchPayments = async () => {
    if (!user?.uid) return;
    try {
      setLoading(true);
      const userPhone = userData?.phone || user.phoneNumber;
      let q;
      if (userPhone) {
        const cleanPhone = String(userPhone).replace(/\D/g, '').slice(-10);
        q = query(
          collection(db, 'allpatients'),
          where('phone', '==', cleanPhone)
        );
      } else {
        q = query(
          collection(db, 'allpatients'),
          where('patientId', '==', user.uid)
        );
      }
      const querySnapshot = await getDocs(q);
      const data = querySnapshot.docs
        .map(doc => {
          const item = doc.data();
          const dateObj = item.date ? new Date(item.date) : new Date();
          return {
            id: doc.id,
            ...item,
            formattedDate: dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
            formattedTime: dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          };
        })
        .filter(item => item.paymentId); // Only show appointments with a payment ID

      data.sort((a, b) => new Date(b.date) - new Date(a.date));
      
      const total = data.reduce((acc, curr) => acc + (Number(curr.amountPaid || curr.paymentAmount) || 500), 0);
      setTotalSpent(total);
      setPayments(data);
    } catch (error) {
      console.error("Error fetching payments:", error);
    } finally {
      setLoading(false);
    }
  };

  const renderPaymentItem = ({ item }) => (
    <Surface style={styles.card}>
      <TouchableOpacity 
        style={styles.cardTouch} 
        onPress={() => setSelectedPayment(item)}
      >
        <View style={styles.cardHeader}>
          <View style={styles.iconBg}>
            <CreditCard size={24} color={COLORS.secondary} />
          </View>
          <View style={styles.headerInfo}>
            <Text style={styles.doctorName}>
              {item.doctorName ? (item.doctorName.startsWith('Dr.') || item.doctorName.startsWith('Dr ') ? item.doctorName : `Dr. ${item.doctorName}`) : 'Dr. Homeopathy Specialist'}
            </Text>
            <Text style={styles.paymentDate}>{item.formattedDate} • {item.timeSlot}</Text>
          </View>
          <View style={styles.amountCol}>
            <Text style={styles.amountText}>₹{item.amountPaid || 500}</Text>
            <Badge style={styles.successBadge} size={22}>✓ Paid</Badge>
          </View>
        </View>
        <View style={styles.cardDivider} />
        <View style={styles.cardFooter}>
          <Text style={styles.txIdLabel}>TXN ID: <Text style={styles.txIdValue}>{item.paymentId}</Text></Text>
          <View style={styles.viewDetailsRow}>
            <Text style={styles.viewDetailsText}>Receipt</Text>
            <ChevronRight size={14} color={COLORS.secondary} />
          </View>
        </View>
      </TouchableOpacity>
    </Surface>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ArrowLeft size={24} color="#1e293b" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Payment History</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={COLORS.secondary} />
          <Text style={styles.loaderText}>Loading your transactions...</Text>
        </View>
      ) : (
        <FlatList
          data={payments}
          renderItem={renderPaymentItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <Surface style={styles.dashboardCard}>
              <View style={styles.dashLeft}>
                <Text style={styles.dashLabel}>Total Consultation Spend</Text>
                <Text style={styles.dashAmount}>₹{totalSpent}</Text>
                <View style={styles.secureRow}>
                  <ShieldCheck size={14} color="#10b981" />
                  <Text style={styles.secureText}>100% Secured Payments</Text>
                </View>
              </View>
              <View style={styles.dashRight}>
                <View style={styles.upTrendBg}>
                  <TrendingUp size={24} color="#10b981" />
                </View>
                <Text style={styles.txCount}>{payments.length} Transactions</Text>
              </View>
            </Surface>
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconBg}>
                <CreditCard size={44} color="#94a3b8" />
              </View>
              <Text style={styles.emptyTitle}>No Transactions Yet</Text>
              <Text style={styles.emptySub}>Payments for booked consultations will appear here.</Text>
            </View>
          }
          onRefresh={onRefresh}
          refreshing={refreshing}
        />
      )}

      {/* Modern Receipt Details Modal */}
      <Modal
        visible={selectedPayment !== null}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSelectedPayment(null)}
      >
        <View style={styles.modalBackdrop}>
          <Surface style={styles.modalContent}>
            {selectedPayment && (
              <View style={{ flex: 1 }}>
                {/* Header Badge */}
                <View style={styles.modalHeader}>
                  <CheckCircle size={44} color="#10b981" />
                  <Text style={styles.modalSuccessTitle}>Payment Successful</Text>
                  <Text style={styles.modalAmount}>₹{selectedPayment.amountPaid || 500}</Text>
                </View>

                {/* Details list */}
                <View style={styles.modalBody}>
                  <Text style={styles.modalSectionTitle}>Receipt Summary</Text>
                  
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>Consulting Doctor</Text>
                    <Text style={styles.receiptVal}>
                      {selectedPayment.doctorName ? (selectedPayment.doctorName.startsWith('Dr.') || selectedPayment.doctorName.startsWith('Dr ') ? selectedPayment.doctorName : `Dr. ${selectedPayment.doctorName}`) : ''}
                    </Text>
                  </View>
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>SPH Clinic Branch</Text>
                    <Text style={styles.receiptVal}>{selectedPayment.branchName}</Text>
                  </View>
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>Appointment Date</Text>
                    <Text style={styles.receiptVal}>{selectedPayment.formattedDate}</Text>
                  </View>
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>Scheduled Slot</Text>
                    <Text style={styles.receiptVal}>{selectedPayment.timeSlot}</Text>
                  </View>
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>Payment Method</Text>
                    <Text style={styles.receiptVal}>Razorpay Online</Text>
                  </View>
                  <View style={styles.receiptRow}>
                    <Text style={styles.receiptLabel}>Transaction ID</Text>
                    <Text style={styles.receiptVal} numberOfLines={1}>{selectedPayment.paymentId}</Text>
                  </View>
                </View>

                {/* Footer buttons */}
                <View style={styles.modalFooter}>
                  <Button 
                    mode="contained" 
                    onPress={() => setSelectedPayment(null)} 
                    buttonColor={COLORS.secondary}
                    style={styles.closeModalBtn}
                  >
                    Done
                  </Button>
                </View>
              </View>
            )}
          </Surface>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fcfdfe' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  backBtn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#1e293b' },
  listContent: { padding: 16, paddingBottom: 40 },
  dashboardCard: {
    padding: 20,
    borderRadius: 24,
    backgroundColor: '#eff6ff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#dbeafe',
  },
  dashLeft: { flex: 1 },
  dashLabel: { fontSize: 12, fontWeight: '700', color: '#1e293b', textTransform: 'uppercase', letterSpacing: 0.5 },
  dashAmount: { fontSize: 32, fontWeight: '900', color: COLORS.secondary, marginVertical: 4 },
  secureRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  secureText: { fontSize: 11, color: '#10b981', fontWeight: '800' },
  dashRight: { alignItems: 'center' },
  upTrendBg: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#d1fae5', justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  txCount: { fontSize: 11, fontWeight: '700', color: '#64748b' },
  card: {
    borderRadius: 20,
    backgroundColor: COLORS.white,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    overflow: 'hidden',
  },
  cardTouch: { padding: 16 },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  iconBg: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#f0f7ff', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  headerInfo: { flex: 1 },
  doctorName: { fontSize: 15, fontWeight: '800', color: '#1e293b' },
  paymentDate: { fontSize: 11, color: '#64748b', marginTop: 2, fontWeight: '500' },
  amountCol: { alignItems: 'flex-end' },
  amountText: { fontSize: 16, fontWeight: '800', color: '#1e293b', marginBottom: 2 },
  successBadge: { backgroundColor: '#10b981', color: '#ffffff', fontWeight: '800', fontSize: 11 },
  cardDivider: { height: 1, backgroundColor: '#f1f5f9', marginVertical: 12 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  txIdLabel: { fontSize: 11, color: '#94a3b8', fontWeight: '600' },
  txIdValue: { color: '#64748b', fontWeight: '700' },
  viewDetailsRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  viewDetailsText: { fontSize: 12, color: COLORS.secondary, fontWeight: '700' },
  loaderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loaderText: { marginTop: 12, fontSize: 14, color: '#64748b', fontWeight: '500' },
  emptyContainer: { alignItems: 'center', marginTop: 80 },
  emptyIconBg: { width: 90, height: 90, borderRadius: 45, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: '#1e293b' },
  emptySub: { fontSize: 13, color: '#64748b', textAlign: 'center', marginTop: 6, paddingHorizontal: 30 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '90%', maxHeight: '80%', padding: 24, borderRadius: 24, backgroundColor: '#fff', elevation: 10 },
  modalHeader: { alignItems: 'center', marginBottom: 24 },
  modalSuccessTitle: { fontSize: 16, fontWeight: '800', color: '#10b981', marginTop: 12 },
  modalAmount: { fontSize: 32, fontWeight: '900', color: '#1e293b', marginTop: 8 },
  modalBody: { backgroundColor: '#f8fafc', borderRadius: 16, padding: 16, marginBottom: 24 },
  modalSectionTitle: { fontSize: 13, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 14 },
  receiptRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  receiptLabel: { fontSize: 13, color: '#94a3b8', fontWeight: '600' },
  receiptVal: { fontSize: 13, color: '#1e293b', fontWeight: '700', flex: 0.9, textAlign: 'right' },
  modalFooter: { width: '100%' },
  closeModalBtn: { borderRadius: 12, paddingVertical: 4 },
});

export default PaymentHistory;
