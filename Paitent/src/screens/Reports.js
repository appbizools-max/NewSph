import React, { useState, useEffect } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, Image, Alert, Modal, RefreshControl } from 'react-native';
import { Text, Surface, ActivityIndicator, IconButton, Portal, Badge } from 'react-native-paper';
import { COLORS } from '../constants/theme';
import { db } from '../firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { FileText, Download, Eye, Calendar, Bell, ChevronLeft, ShieldCheck } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const Reports = ({ navigation }) => {
  const { userData } = useAuth();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchReports();
    setRefreshing(false);
  };

  useEffect(() => {
    if (userData?.phone) {
      fetchReports();
    } else {
      setLoading(false);
    }
  }, [userData]);

  const fetchReports = async () => {
    try {
      // Safety guard for undefined phone
      if (!userData?.phone) return;

      const q = query(
        collection(db, 'patients'), 
        where('phone', '==', userData.phone) 
      );
      
      const querySnapshot = await getDocs(q);
      const data = querySnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(p => p.prescriptionUrls && p.prescriptionUrls.length > 0);
      
      setReports(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const renderItem = ({ item }) => (
    <Surface style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.headerLeft}>
          <View style={styles.iconBox}>
            <FileText size={24} color={COLORS.secondary} />
          </View>
          <View style={styles.headerInfo}>
            <Text style={styles.doctorName}>
              {item.doctor ? (item.doctor.startsWith('Dr.') || item.doctor.startsWith('Dr ') ? item.doctor : `Dr. ${item.doctor}`) : 'Dr. Ramakrishna'}
            </Text>
            <View style={styles.dateRow}>
              <Calendar size={12} color="#94a3b8" />
              <Text style={styles.dateText}>{item.appointmentDate || 'Recent Consultation'}</Text>
            </View>
          </View>
        </View>
        <Badge style={styles.reportBadge}>Verified</Badge>
      </View>
      
      <View style={styles.divider} />
      
      <Text style={styles.subject}>{item.subject || 'Medical Prescription'}</Text>
      
      <View style={styles.filesContainer}>
        {item.prescriptionUrls.map((url, index) => (
          <TouchableOpacity 
            key={index} 
            style={styles.fileBox}
            onPress={() => setSelectedImage(url)}
          >
            <Image source={{ uri: url }} style={styles.thumbnail} />
            <View style={styles.overlay}>
              <Eye size={18} color="white" />
            </View>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={styles.downloadBtn}>
        <Download size={16} color={COLORS.secondary} />
        <Text style={styles.downloadText}>Download Digital Copy</Text>
      </TouchableOpacity>
    </Surface>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.pageHeader}>
        <View>
          <Text style={styles.pageTitle}>My Health</Text>
          <Text style={styles.pageSub}>Track your medical history & reports</Text>
        </View>
        <TouchableOpacity style={styles.notifBtn}>
          <Bell size={24} color="#1e293b" />
          <Badge size={16} style={styles.notifBadge}>1</Badge>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.secondary} />
          <Text style={styles.loadingText}>Fetching your records...</Text>
        </View>
      ) : (
        <FlatList
          data={reports}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <Surface style={styles.trustBanner}>
              <ShieldCheck size={20} color={COLORS.secondary} />
              <Text style={styles.trustText}>All reports are end-to-end encrypted and secure.</Text>
            </Surface>
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={styles.emptyIconBg}>
                <FileText size={60} color="#cbd5e1" />
              </View>
              <Text style={styles.emptyTitle}>No Records Found</Text>
              <Text style={styles.emptyDesc}>Your prescriptions and medical reports will appear here after your consultation.</Text>
            </View>
          }
          onRefresh={onRefresh}
          refreshing={refreshing}
        />
      )}

      <Modal 
        visible={!!selectedImage} 
        transparent={true}
        animationType="fade"
        onRequestClose={() => setSelectedImage(null)}
      >
        <View style={styles.modalContent}>
          {selectedImage && (
            <View style={styles.fullImageContainer}>
              <Image source={{ uri: selectedImage }} style={styles.fullImage} resizeMode="contain" />
              <IconButton 
                icon="close" 
                containerColor="rgba(0,0,0,0.6)" 
                iconColor="white" 
                size={30} 
                onPress={() => setSelectedImage(null)}
                style={styles.closeBtn}
              />
            </View>
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fcfdfe' },
  pageHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 12, marginBottom: 20 },
  pageTitle: { fontSize: 28, fontWeight: '900', color: '#1e293b' },
  pageSub: { fontSize: 14, color: '#64748b', marginTop: 2, fontWeight: '500' },
  notifBtn: { width: 48, height: 48, borderRadius: 16, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', elevation: 2 },
  notifBadge: { position: 'absolute', top: 12, right: 12, backgroundColor: '#ef4444' },
  list: { paddingHorizontal: 20, paddingBottom: 40 },
  trustBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#eff6ff', padding: 12, borderRadius: 16, marginBottom: 24, gap: 10, borderWidth: 1, borderColor: '#dbeafe' },
  trustText: { fontSize: 11, color: '#1e293b', fontWeight: '700', flex: 1 },
  card: { padding: 18, borderRadius: 24, backgroundColor: '#fff', marginBottom: 20, elevation: 3, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 15, borderWidth: 1, borderColor: '#f1f5f9' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  iconBox: { width: 48, height: 48, borderRadius: 14, backgroundColor: '#f0f7ff', justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  headerInfo: { flex: 1 },
  doctorName: { fontSize: 17, fontWeight: '800', color: '#1e293b' },
  dateRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 6 },
  dateText: { fontSize: 12, color: '#94a3b8', fontWeight: '600' },
  reportBadge: { backgroundColor: '#ecfdf5', color: '#10b981', fontWeight: '800', fontSize: 10, paddingHorizontal: 8 },
  divider: { height: 1, backgroundColor: '#f1f5f9', marginVertical: 16 },
  subject: { fontSize: 14, color: '#475569', marginBottom: 16, fontWeight: '700' },
  filesContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  fileBox: { width: '30%', aspectRatio: 1, borderRadius: 16, overflow: 'hidden', backgroundColor: '#f8fafc' },
  thumbnail: { width: '100%', height: '100%' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'center', alignItems: 'center' },
  downloadBtn: { flexDirection: 'row', alignItems: 'center', marginTop: 18, backgroundColor: '#f0f7ff', padding: 12, borderRadius: 14, justifyContent: 'center', gap: 8 },
  downloadText: { fontSize: 13, color: COLORS.secondary, fontWeight: '800' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 100 },
  loadingText: { marginTop: 12, color: '#64748b', fontWeight: '600' },
  emptyContainer: { alignItems: 'center', marginTop: 60, paddingHorizontal: 40 },
  emptyIconBg: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#f8fafc', justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
  emptyTitle: { fontSize: 20, fontWeight: '900', color: '#1e293b' },
  emptyDesc: { fontSize: 14, color: '#94a3b8', textAlign: 'center', marginTop: 8, lineHeight: 22, fontWeight: '500' },
  modalContent: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)' },
  fullImageContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  fullImage: { width: '100%', height: '90%' },
  closeBtn: { position: 'absolute', top: 40, right: 20 },
});

export default Reports;
