import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, 
  StyleSheet, 
  ScrollView, 
  TouchableOpacity, 
  RefreshControl, 
  Linking 
} from 'react-native';
import { Text, Surface, ActivityIndicator, Badge } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { db, auth } from '../../firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { COLORS } from '../../constants/theme';
import { 
  ChevronLeft, 
  Calendar, 
  User, 
  Stethoscope, 
  MapPin, 
  Clock, 
  Phone, 
  ArrowRight, 
  AlertCircle,
  CheckCircle2,
  CalendarDays
} from 'lucide-react-native';

const FollowUpScreen = ({ navigation }) => {
  const { user, userData } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [followUps, setFollowUps] = useState([]);
  const [activeFilter, setActiveFilter] = useState('ALL'); // 'ALL' | 'UPCOMING' | 'PAST'

  const rawPhone = userData?.phone || user?.phoneNumber || auth.currentUser?.phoneNumber || '';
  const cleanPhone = String(rawPhone).replace(/\D/g, '').slice(-10);
  const uid = auth.currentUser?.uid || user?.uid;

  const fetchFollowUps = useCallback(() => {
    if (!cleanPhone && !uid) {
      setLoading(false);
      setRefreshing(false);
      return () => {};
    }

    try {
      const q = query(
        collection(db, 'allpatients'),
        where('followUpDate', '!=', '')
      );

      const unsubscribe = onSnapshot(q, (snap) => {
        const list = [];
        snap.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.isDeleted) return;
          if (data.followUpInterval === 'No Follow-up') return;

          const docPhone = String(data.phone || data.patientPhone || '').replace(/\D/g, '').slice(-10);
          const matchesPhone = cleanPhone && docPhone === cleanPhone;
          const matchesUid = uid && (data.patientId === uid || docSnap.id === uid);

          if (matchesPhone || matchesUid) {
            list.push({
              id: docSnap.id,
              ...data,
              patientName: data.patientName || data.fullName || data.name || userData?.fullName || 'Patient',
              doctorName: data.doctor || data.doctorName || 'Consultant Doctor',
              branchName: data.branchName || data.branch || 'Main Clinic',
              followUpDate: data.followUpDate,
              followUpInterval: data.followUpInterval || 'Standard Follow-up',
              complaint: data.complaint || data.disease || data.subject || '',
              status: data.status || 'scheduled',
            });
          }
        });

        // Sort ascending by date
        list.sort((a, b) => new Date(a.followUpDate) - new Date(b.followUpDate));
        setFollowUps(list);
        setLoading(false);
        setRefreshing(false);
      }, (err) => {
        console.warn('Error fetching follow-ups:', err);
        setLoading(false);
        setRefreshing(false);
      });

      return unsubscribe;
    } catch (err) {
      console.warn('Error setting up follow-up listener:', err);
      setLoading(false);
      setRefreshing(false);
      return () => {};
    }
  }, [cleanPhone, uid, userData]);

  useEffect(() => {
    const unsub = fetchFollowUps();
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, [fetchFollowUps]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchFollowUps();
  };

  const formatFollowUpDate = (dateStr) => {
    if (!dateStr) return 'Date to be confirmed';
    try {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('en-GB', { 
          weekday: 'short', 
          day: '2-digit', 
          month: 'short', 
          year: 'numeric' 
        });
      }
    } catch (e) {}
    return String(dateStr);
  };

  const getFollowUpStatusInfo = (dateStr) => {
    if (!dateStr) return { label: 'Scheduled', color: '#0284c7', bg: '#e0f2fe', isPast: false };
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const target = new Date(dateStr);
      target.setHours(0, 0, 0, 0);

      if (isNaN(target.getTime())) {
        return { label: 'Scheduled', color: '#0284c7', bg: '#e0f2fe', isPast: false };
      }

      const diffDays = Math.round((target - today) / (1000 * 60 * 60 * 24));
      if (diffDays === 0) {
        return { label: 'Due Today', color: '#b91c1c', bg: '#fee2e2', isPast: false };
      } else if (diffDays < 0) {
        return { label: 'Review Due', color: '#b45309', bg: '#fef3c7', isPast: true };
      } else if (diffDays <= 7) {
        return { label: `Due in ${diffDays}d`, color: '#0369a1', bg: '#e0f2fe', isPast: false };
      } else {
        return { label: 'Upcoming', color: '#15803d', bg: '#dcfce7', isPast: false };
      }
    } catch (e) {
      return { label: 'Scheduled', color: '#0284c7', bg: '#e0f2fe', isPast: false };
    }
  };

  const filteredFollowUps = followUps.filter((item) => {
    const status = getFollowUpStatusInfo(item.followUpDate);
    if (activeFilter === 'UPCOMING') return !status.isPast;
    if (activeFilter === 'PAST') return status.isPast;
    return true;
  });

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ChevronLeft size={26} color={COLORS.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Follow-up Schedules</Text>
          <Text style={styles.headerSubtitle}>Doctor review dates & consultations</Text>
        </View>
        <View style={styles.headerRight}>
          {followUps.length > 0 && (
            <Badge size={22} style={styles.headerBadge}>{followUps.length}</Badge>
          )}
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterChip, activeFilter === 'ALL' && styles.filterChipActive]}
          onPress={() => setActiveFilter('ALL')}
        >
          <Text style={[styles.filterChipText, activeFilter === 'ALL' && styles.filterChipTextActive]}>
            All ({followUps.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterChip, activeFilter === 'UPCOMING' && styles.filterChipActive]}
          onPress={() => setActiveFilter('UPCOMING')}
        >
          <Text style={[styles.filterChipText, activeFilter === 'UPCOMING' && styles.filterChipTextActive]}>
            Upcoming
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterChip, activeFilter === 'PAST' && styles.filterChipActive]}
          onPress={() => setActiveFilter('PAST')}
        >
          <Text style={[styles.filterChipText, activeFilter === 'PAST' && styles.filterChipTextActive]}>
            Due / Review
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.secondary]} />
        }
      >
        {/* Info Banner */}
        <Surface style={styles.infoBanner}>
          <View style={styles.infoBannerIcon}>
            <CalendarDays size={20} color={COLORS.secondary} />
          </View>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.infoBannerTitle}>Scheduled Medical Reviews</Text>
            <Text style={styles.infoBannerDesc}>
              Follow-ups are prescribed by your attending doctor to monitor treatment progress and medication adjustments.
            </Text>
          </View>
        </Surface>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={COLORS.secondary} />
            <Text style={styles.loadingText}>Loading follow-up schedules...</Text>
          </View>
        ) : filteredFollowUps.length > 0 ? (
          filteredFollowUps.map((item) => {
            const status = getFollowUpStatusInfo(item.followUpDate);
            return (
              <Surface key={item.id} style={styles.card}>
                {/* Profile Header */}
                <View style={styles.cardHeader}>
                  <View style={styles.profileBadge}>
                    <User size={14} color="#0369a1" />
                    <Text style={styles.profileLabel}>Profile Name:</Text>
                    <Text style={styles.profileName} numberOfLines={1}>
                      {item.patientName}
                    </Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
                    <Text style={[styles.statusBadgeText, { color: status.color }]}>
                      {status.label}
                    </Text>
                  </View>
                </View>

                {/* Details Body */}
                <View style={styles.cardBody}>
                  {/* Date & Interval */}
                  <View style={styles.metaRow}>
                    <View style={[styles.iconBox, { backgroundColor: '#eff6ff' }]}>
                      <Calendar size={16} color="#2563eb" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.dateLabel}>Follow-up Date</Text>
                      <Text style={styles.dateValue}>{formatFollowUpDate(item.followUpDate)}</Text>
                      {item.followUpInterval ? (
                        <Text style={styles.intervalText}>
                          Interval: <Text style={{ fontWeight: '700' }}>{item.followUpInterval}</Text>
                        </Text>
                      ) : null}
                    </View>
                  </View>

                  {/* Doctor */}
                  <View style={styles.metaRow}>
                    <View style={[styles.iconBox, { backgroundColor: '#f0fdf4' }]}>
                      <Stethoscope size={16} color="#16a34a" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.metaLabel}>Consultant Doctor</Text>
                      <Text style={styles.metaValue}>{item.doctorName}</Text>
                    </View>
                  </View>

                  {/* Branch */}
                  <View style={styles.metaRow}>
                    <View style={[styles.iconBox, { backgroundColor: '#f8fafc' }]}>
                      <MapPin size={16} color="#64748b" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.metaLabel}>Clinic Branch</Text>
                      <Text style={styles.metaValue}>{item.branchName}</Text>
                    </View>
                  </View>

                  {/* Complaint / Treatment Tag */}
                  {item.complaint ? (
                    <View style={styles.complaintBox}>
                      <Text style={styles.complaintText} numberOfLines={2}>
                        Treatment: {item.complaint}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {/* Action Footer */}
                <View style={styles.cardFooter}>
                  <TouchableOpacity
                    style={styles.bookBtn}
                    activeOpacity={0.8}
                    onPress={() => {
                      navigation.navigate('BookAppointment', {
                        preselectedDoctor: item.doctorName,
                        preselectedBranch: item.branchName,
                        patientName: item.patientName,
                      });
                    }}
                  >
                    <Calendar size={15} color={COLORS.white} />
                    <Text style={styles.bookBtnText}>Book Follow-up Appointment</Text>
                    <ArrowRight size={15} color={COLORS.white} />
                  </TouchableOpacity>
                </View>
              </Surface>
            );
          })
        ) : (
          <Surface style={styles.emptyCard}>
            <View style={styles.emptyIconCircle}>
              <Clock size={32} color={COLORS.secondary} />
            </View>
            <Text style={styles.emptyTitle}>
              {activeFilter === 'ALL' 
                ? 'No Follow-ups Scheduled' 
                : activeFilter === 'UPCOMING' 
                ? 'No Upcoming Follow-ups' 
                : 'No Review Consultations Due'}
            </Text>
            <Text style={styles.emptySubtitle}>
              When your doctor assigns a follow-up review or consultation date, it will appear here under your profile.
            </Text>
            <TouchableOpacity 
              style={styles.emptyActionBtn}
              activeOpacity={0.8}
              onPress={() => navigation.navigate('BookAppointment')}
            >
              <Text style={styles.emptyActionBtnText}>Book Consultation</Text>
            </TouchableOpacity>
          </Surface>
        )}

        {/* Clinic Helpline Support Card */}
        <Surface style={styles.supportCard}>
          <Phone size={18} color="#0284c7" />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.supportTitle}>Need Help with Follow-up Dates?</Text>
            <Text style={styles.supportSub}>Call Spiritual Homeopathy Clinic Helpline</Text>
          </View>
          <TouchableOpacity 
            style={styles.callBtn}
            onPress={() => Linking.openURL('tel:9030176176')}
          >
            <Text style={styles.callBtnText}>Call Clinic</Text>
          </TouchableOpacity>
        </Surface>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  backBtn: {
    padding: 4,
    marginRight: 8,
  },
  headerTitleContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1e293b',
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 1,
  },
  headerRight: {
    minWidth: 30,
    alignItems: 'flex-end',
  },
  headerBadge: {
    backgroundColor: COLORS.secondary,
    fontWeight: 'bold',
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#f1f5f9',
  },
  filterChipActive: {
    backgroundColor: '#e0f2fe',
    borderWidth: 1,
    borderColor: '#7dd3fc',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748b',
  },
  filterChipTextActive: {
    color: '#0284c7',
    fontWeight: '700',
  },
  content: {
    padding: 16,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#dbeafe',
    marginBottom: 16,
  },
  infoBannerIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e3a8a',
  },
  infoBannerDesc: {
    fontSize: 11,
    color: '#3b82f6',
    marginTop: 2,
    lineHeight: 16,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 10,
    fontWeight: '500',
  },
  card: {
    borderRadius: 18,
    backgroundColor: COLORS.white,
    marginBottom: 14,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  profileBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f9ff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    flex: 1,
    marginRight: 8,
  },
  profileLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0369a1',
    marginLeft: 4,
  },
  profileName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0c4a6e',
    marginLeft: 4,
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  cardBody: {
    padding: 14,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  dateLabel: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
  },
  dateValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1e293b',
    marginTop: 1,
  },
  intervalText: {
    fontSize: 11,
    color: '#0284c7',
    marginTop: 2,
  },
  metaLabel: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
  },
  metaValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e293b',
    marginTop: 1,
  },
  complaintBox: {
    backgroundColor: '#f8fafc',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  complaintText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '500',
  },
  cardFooter: {
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  bookBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.secondary,
    paddingVertical: 10,
    borderRadius: 12,
    gap: 8,
  },
  bookBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.white,
  },
  emptyCard: {
    borderRadius: 20,
    backgroundColor: COLORS.white,
    padding: 30,
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#eff6ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1e293b',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 18,
    paddingHorizontal: 10,
  },
  emptyActionBtn: {
    backgroundColor: COLORS.secondary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
  },
  emptyActionBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.white,
  },
  supportCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  supportTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1e293b',
  },
  supportSub: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 1,
  },
  callBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  callBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0284c7',
  },
});

export default FollowUpScreen;
