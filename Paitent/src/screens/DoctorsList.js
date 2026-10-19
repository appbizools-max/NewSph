import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Image, TextInput, Modal, RefreshControl } from 'react-native';
import { Text, Surface, Avatar, Badge, ActivityIndicator } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../constants/theme';
import { db } from '../firebase';
import { doc, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore';
import {
  Search, Sliders, Bell, Star,
  MapPin, Calendar, ChevronDown,
  ShieldCheck, CheckCircle2, X, Award, BookOpen
} from 'lucide-react-native';

const DOCTOR_SCHEDULES = {
  'drprashanthkvaidya': {
    id: '1',
    name: 'Dr. Prashanth K. Vaidya',
    specialty: 'Homeopathic Physician',
    image: 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?auto=format&fit=crop&q=80&w=300',
    rating: '4.8',
    reviews: '320',
    branches: ['Kphb', 'Chandanagar', 'Nallagandla'],
    timings: [
      { branch: 'Kphb', dayOfWeek: [1, 3, 5, 6], intervals: [['12:30', '14:00'], ['17:00', '19:00']] }, // Mon, Wed, Fri, Sat
      { branch: 'Chandanagar', dayOfWeek: [1, 3, 5, 6], intervals: [['10:00', '12:00'], ['19:30', '21:00']] }, // Mon, Wed, Fri, Sat
      { branch: 'Chandanagar', dayOfWeek: [0], intervals: [['11:00', '13:00']] }, // Sun
      { branch: 'Nallagandla', dayOfWeek: [4], intervals: [['11:00', '13:00'], ['18:00', '20:00']] }, // Thu
      { branch: 'Nallagandla', dayOfWeek: [0], intervals: [['18:00', '20:00']] } // Sun
    ]
  },
  'drchramakrishna': {
    id: '2',
    name: 'Dr. Ramakrishna Chanduri',
    specialty: 'Homeopathic Physician',
    image: 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&q=80&w=300',
    rating: '4.9',
    reviews: '410',
    branches: ['Dilshuknagar', 'Nallagandla'],
    timings: [
      { branch: 'Dilshuknagar', dayOfWeek: [0, 1, 2, 3, 4], intervals: [['10:00', '14:00'], ['17:00', '20:00']] }, // Sun - Thu
      { branch: 'Nallagandla', dayOfWeek: [5, 6], intervals: [['10:00', '20:00']] } // Fri, Sat
    ]
  },
  'drjobedahparveez': {
    id: '3',
    name: 'Dr. Jobeadh Parveej',
    specialty: 'Homeopathic Physician',
    image: 'https://images.unsplash.com/photo-1594824476967-48c8b964273f?auto=format&fit=crop&q=80&w=300',
    rating: '4.7',
    reviews: '285',
    branches: ['Nallagandla', 'Kphb'],
    timings: [
      { branch: 'Nallagandla', dayOfWeek: [1], intervals: [['11:00', '13:00'], ['18:00', '19:30']] }, // Mon
      { branch: 'Kphb', dayOfWeek: [2, 3, 5], intervals: [['12:30', '14:00']] }, // Tue, Wed, Fri
      { branch: 'Kphb', dayOfWeek: [6], intervals: [['12:30', '14:00'], ['17:00', '19:00']] } // Sat
    ]
  },
  'drpadmapriya': {
    id: '4',
    name: 'Dr. Padma Priya',
    specialty: 'Homeopathic Physician',
    image: 'https://images.unsplash.com/photo-1559839734-2b71f153678e?auto=format&fit=crop&q=80&w=300',
    rating: '4.6',
    reviews: '210',
    branches: ['Nallagandla', 'Chandanagar'],
    timings: [
      { branch: 'Nallagandla', dayOfWeek: [2, 3], intervals: [['10:00', '20:00']] }, // Tue, Wed
      { branch: 'Nallagandla', dayOfWeek: [0], intervals: [['10:00', '17:00']] }, // Sun
      { branch: 'Chandanagar', dayOfWeek: [1, 5], intervals: [['12:00', '20:00']] }, // Mon, Fri
      { branch: 'Chandanagar', dayOfWeek: [0], intervals: [['17:30', '20:00']] }, // Sun
      { branch: 'Chandanagar', dayOfWeek: [4], intervals: [['10:00', '20:00']] } // Thu
    ]
  }
};

const getDaysLabel = (daysArray) => {
  if (!daysArray || daysArray.length === 0) return '';
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  // Sort naturally so Sunday comes first (0 = Sun, 1 = Mon...)
  const sorted = [...daysArray].sort((a, b) => a - b);
  return sorted.map(d => dayNames[d]).join(', ');
};

const formatTimeStr = (tStr) => {
  if (!tStr) return '';
  const [h, m] = tStr.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h > 12 ? h - 12 : (h === 0 ? 12 : h);
  return `${displayH.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} ${period}`;
};

const formatIntervals = (intervals) => {
  if (!intervals || intervals.length === 0) return '';
  // Firestore stores as {start, end} objects; legacy data may be [start, end] arrays
  return intervals.map(iv => {
    const start = Array.isArray(iv) ? iv[0] : iv.start;
    const end = Array.isArray(iv) ? iv[1] : iv.end;
    return `${formatTimeStr(start)} - ${formatTimeStr(end)}`;
  }).join(' & ');
};

const mapDbDoctor = (id, data) => {
  const normalizeName = (name) => {
    return name ? name.toLowerCase().replace(/^dr\.\s*/, '').replace(/^dr\s*/, '').replace(/[^a-z0-9]/g, '') : '';
  };

  let docName = data.name || '';
  if (docName && !docName.match(/^dr\./i) && !docName.match(/^dr\s/i)) {
    docName = 'Dr. ' + docName;
  } else if (docName && docName.match(/^dr\s/i)) {
    docName = 'Dr. ' + docName.substring(3);
  }

  const nameKey = normalizeName(data.name);
  const template = DOCTOR_SCHEDULES[nameKey] || {};

  const specialty = data.specialty || data.specialization || template.specialty || 'Homeopathic Physician';
  const qualification = data.qualification || 'BHMS, MD (Homeo)';
  const experience = data.experience || '10+ Years';
  const bio = data.bio || `${docName} is a highly dedicated ${specialty} specializing in clinical homeopathy. With structured therapeutics and personalized care, they treat complex conditions naturally.`;
  const expertiseList = data.expertiseList || (template ? ['Chronic Diseases', 'Constitutional Medicine'] : []);

  const expertiseString = expertiseList.join(', ');
  const expertise = expertiseString.length > 35 ? expertiseString.substring(0, 32) + '...' : expertiseString;

  const rating = template.rating || '4.8';
  const reviews = template.reviews || '120';
  const image = data.photoUrl || data.image || data.photoURL || template.image || 'https://images.unsplash.com/photo-1559839734-2b71f153678e?auto=format&fit=crop&q=80&w=300';

  let schedule = [];
  const targetTimings = (data.timings && Array.isArray(data.timings) && data.timings.length > 0)
    ? data.timings
    : (template.timings || []);

  if (targetTimings.length > 0) {
    targetTimings.forEach(t => {
      if (t.daySchedule) {
        // Group days with identical timings
        const groups = {}; // formattedIvs -> array of day integers
        [1, 2, 3, 4, 5, 6, 0].forEach(d => { // Mon to Sun order
          const ivs = t.daySchedule[d] || t.daySchedule[String(d)] || [];
          if (ivs.length > 0) {
            const formattedIvs = ivs.map(iv => {
              const start = iv.start || (Array.isArray(iv) ? iv[0] : '');
              const end   = iv.end   || (Array.isArray(iv) ? iv[1] : '');
              return `${formatTimeStr(start)} - ${formatTimeStr(end)}`;
            }).join(' & ');
            if (!groups[formattedIvs]) {
              groups[formattedIvs] = [];
            }
            groups[formattedIvs].push(d);
          }
        });
        Object.keys(groups).forEach(formattedIvs => {
          schedule.push({
            branch: t.branch,
            days: getDaysLabel(groups[formattedIvs]),
            hours: formattedIvs
          });
        });
      } else {
        // Legacy format
        schedule.push({
          branch: t.branch,
          days: getDaysLabel(t.dayOfWeek),
          hours: formatIntervals(t.intervals)
        });
      }
    });
  } else {
    const doctorBranches = data.branchName ? [data.branchName] : ['Kphb', 'Chandanagar', 'Nallagandla', 'Dilshuknagar'];
    schedule = doctorBranches.map(brName => ({
      branch: brName,
      days: 'Mon - Sun',
      hours: '10:00 AM - 02:00 PM & 05:00 PM - 08:00 PM'
    }));
  }

  return {
    id,
    name: docName,
    qualification,
    experience,
    specialty,
    expertise,
    image,
    rating,
    reviews,
    availability: 'Active Schedule',
    online: true,
    bio,
    expertiseList,
    schedule
  };
};

const DoctorsList = ({ navigation, route }) => {
  const [doctorsList, setDoctorsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState(route.params?.initialSearch || '');
  const [doctorsBanner, setDoctorsBanner] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDoctors = async () => {
    try {
      const q = query(collection(db, 'users'), where('role', '==', 'doctor'));
      const snap = await getDocs(q);
      const list = [];
      snap.forEach(d => {
        list.push(mapDbDoctor(d.id, d.data()));
      });
      setDoctorsList(list);
    } catch (err) {
      console.error("Error fetching doctors for list:", err);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await fetchDoctors();
    setRefreshing(false);
  }, []);

  useEffect(() => {
    fetchDoctors();
  }, []);

  const [expandedDocId, setExpandedDocId] = React.useState(null);
  const [selectedDoctorForModal, setSelectedDoctorForModal] = React.useState(null);

  const DoctorCard = ({ doctor }) => {
    const isExpanded = expandedDocId === doctor.id;
    return (
      <Surface style={styles.card}>
        <View style={styles.cardRow}>
          {/* Left: Image & Online Indicator & Status */}
          <TouchableOpacity
            style={styles.imgContainer}
            onPress={() => setSelectedDoctorForModal(doctor)}
          >
            <Image source={{ uri: doctor.image }} style={styles.doctorImg} />
            {doctor.online && <View style={styles.onlineDot} />}
            <View style={styles.availabilityBoxBelow}>
              <Text style={styles.availStatusText}>{doctor.availability}</Text>
            </View>
          </TouchableOpacity>

          {/* Right: Info Column */}
          <TouchableOpacity
            style={styles.infoContainerWide}
            onPress={() => setSelectedDoctorForModal(doctor)}
          >
            <View style={styles.nameRow}>
              <Text style={styles.docName} numberOfLines={1}>{doctor.name}</Text>
              <CheckCircle2 size={14} color="#3b82f6" fill="#3b82f6" />
            </View>
            <Text style={styles.docSub}>{doctor.qualification}</Text>
            <Text style={styles.docSpecialty}>{doctor.specialty}</Text>

            <View style={styles.statsCardRow}>
              <View style={styles.statMiniItem}>
                <Star size={11} color="#f59e0b" fill="#f59e0b" />
                <Text style={styles.statsText}>{doctor.rating} ({doctor.reviews})</Text>
              </View>
              <Text style={styles.statsDivider}>•</Text>
              <View style={styles.statMiniItem}>
                <Calendar size={11} color="#64748b" />
                <Text style={styles.statsText}>{doctor.experience}</Text>
              </View>
            </View>
          </TouchableOpacity>
        </View>

        {/* Bottom Actions Row - Side-by-Side buttons */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.outlinedActionBtn}
            onPress={() => setExpandedDocId(isExpanded ? null : doctor.id)}
          >
            <Text style={styles.outlinedActionText}>
              {isExpanded ? 'Hide Timings' : 'View Timings'}
            </Text>
            <ChevronDown size={14} color={COLORS.secondary} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.containedActionBtn}
            onPress={() => navigation.navigate('BookAppointment', { doctorId: doctor.id })}
          >
            <Text style={styles.containedActionText}>Book Now</Text>
          </TouchableOpacity>
        </View>

        {isExpanded && (
          <View style={styles.expandedTimings}>
            <View style={styles.timingsDivider} />
            <Text style={styles.timingsTitle}>Weekly Branch Schedule</Text>
            {doctor.schedule.map((sched, idx) => (
              <View key={idx} style={styles.scheduleRow}>
                <View style={styles.branchBadge}>
                  <MapPin size={10} color="#fff" />
                  <Text style={styles.branchBadgeText}>{sched.branch}</Text>
                </View>
                <View style={styles.schedDetails}>
                  <Text style={styles.schedDays}>{sched.days}</Text>
                  <Text style={styles.schedHours}>{sched.hours}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </Surface>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Doctors</Text>
          <Text style={styles.headerSub}>Find the right doctor for your health needs</Text>
        </View>
        <TouchableOpacity style={styles.notifBtn}>
          <Bell size={24} color="#1e293b" />
          <Badge size={14} style={styles.badge}>2</Badge>
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchRow}>
        <View style={styles.searchBar}>
          <Search size={20} color="#94a3b8" />
          <TextInput
            placeholder="Search doctors, specialties, symptoms..."
            style={styles.searchInput}
            placeholderTextColor="#94a3b8"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[COLORS.secondary]}
            tintColor={COLORS.secondary}
          />
        }
      >
        {/* Banner */}
        {doctorsBanner ? (
          <Surface style={[styles.promoBanner, { overflow: 'hidden', padding: 0 }]}>
            <Image
              source={{ uri: doctorsBanner }}
              style={{ width: '100%', height: '100%' }}
              resizeMode="cover"
            />
          </Surface>
        ) : (
          <Surface style={styles.promoBanner}>
            <View style={styles.bannerText}>
              <Text style={styles.bannerTitle}>Expert Doctors,</Text>
              <Text style={styles.bannerHighlight}>Trusted Care</Text>
              <Text style={styles.bannerDesc}>Book an appointment with our best specialists.</Text>
            </View>
            <Image
              source={{ uri: 'https://img.freepik.com/free-photo/beautiful-young-female-doctor-looking-camera-office_1301-7807.jpg' }}
              style={styles.bannerImg}
              resizeMode="cover"
            />
          </Surface>
        )}

        {/* Section Header */}
        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>All Doctors</Text>
            <Text style={styles.sectionSub}>
              {loading ? 'Loading doctors...' : `${doctorsList.length} doctor${doctorsList.length === 1 ? '' : 's'} available`}
            </Text>
          </View>
        </View>

        {/* Doctors List */}
        {loading ? (
          <ActivityIndicator color={COLORS.secondary} style={{ marginVertical: 30 }} size="large" />
        ) : (
          doctorsList.filter(doc => {
            const queryStr = searchQuery.toLowerCase();
            return (
              doc.name.toLowerCase().includes(queryStr) ||
              doc.specialty.toLowerCase().includes(queryStr) ||
              doc.qualification.toLowerCase().includes(queryStr) ||
              (doc.expertiseList && doc.expertiseList.some(exp => exp.toLowerCase().includes(queryStr)))
            );
          }).map(doc => (
            <DoctorCard key={doc.id} doctor={doc} />
          ))
        )}

        {/* Verified Footer */}
        <Surface style={styles.verifiedFooter}>
          <View style={styles.verifiedIconBg}>
            <ShieldCheck size={24} color={COLORS.secondary} />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.verifiedTitle}>100% Verified Doctors</Text>
            <Text style={styles.verifiedDesc}>All our doctors are verified and experienced specialists.</Text>
          </View>
          <TouchableOpacity style={styles.learnMore}>
            <Text style={styles.learnMoreText}>Learn More</Text>
          </TouchableOpacity>
        </Surface>

        <View style={styles.footerSpace} />
      </ScrollView>

      <Modal
        visible={selectedDoctorForModal !== null}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSelectedDoctorForModal(null)}
      >
        <View style={styles.modalBackdrop}>
          <Surface style={styles.modalContent}>
            {selectedDoctorForModal && (
              <View style={{ flex: 1 }}>
                {/* Header Image Section */}
                <View style={styles.modalHeaderImageContainer}>
                  <Image source={{ uri: selectedDoctorForModal.image }} style={styles.modalHeaderImage} />
                  <View style={styles.modalImageOverlay} />
                  <TouchableOpacity
                    style={styles.modalCloseBtn}
                    onPress={() => setSelectedDoctorForModal(null)}
                  >
                    <X size={20} color="#1e293b" />
                  </TouchableOpacity>

                  {/* Name Overlaid on Image bottom */}
                  <View style={styles.modalHeaderNameContainer}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.modalDocName}>{selectedDoctorForModal.name}</Text>
                      <CheckCircle2 size={16} color="#3b82f6" fill="#3b82f6" />
                    </View>
                    <Text style={styles.modalDocSub}>{selectedDoctorForModal.qualification} • {selectedDoctorForModal.specialty}</Text>
                  </View>
                </View>

                {/* Scrollable details */}
                <ScrollView contentContainerStyle={styles.modalScrollContent} showsVerticalScrollIndicator={false}>
                  {/* Stats Row */}
                  <View style={styles.modalStatsRow}>
                    <View style={styles.modalStatItem}>
                      <Star size={16} color="#f59e0b" fill="#f59e0b" />
                      <Text style={styles.modalStatVal}>{selectedDoctorForModal.rating}</Text>
                      <Text style={styles.modalStatLbl}>{selectedDoctorForModal.reviews} Reviews</Text>
                    </View>
                    <View style={styles.modalStatDivider} />
                    <View style={styles.modalStatItem}>
                      <Award size={16} color={COLORS.secondary} />
                      <Text style={styles.modalStatVal}>{selectedDoctorForModal.experience}</Text>
                      <Text style={styles.modalStatLbl}>Experience</Text>
                    </View>
                    <View style={styles.modalStatDivider} />
                    <View style={styles.modalStatItem}>
                      <BookOpen size={16} color="#10b981" />
                      <Text style={styles.modalStatVal}>Active</Text>
                      <Text style={styles.modalStatLbl}>Availability</Text>
                    </View>
                  </View>

                  {/* Biography */}
                  <View style={styles.modalSection}>
                    <Text style={styles.modalSectionTitle}>About Doctor</Text>
                    <Text style={styles.modalBioText}>{selectedDoctorForModal.bio}</Text>
                  </View>

                  {/* Expertise Chips */}
                  <View style={styles.modalSection}>
                    <Text style={styles.modalSectionTitle}>Expertise & Clinical Focus</Text>
                    <View style={styles.modalChipsContainer}>
                      {selectedDoctorForModal.expertiseList.map((exp, idx) => (
                        <View key={idx} style={styles.modalChip}>
                          <Text style={styles.modalChipText}>{exp}</Text>
                        </View>
                      ))}
                    </View>
                  </View>

                  {/* Schedule Timings list */}
                  <View style={styles.modalSection}>
                    <Text style={styles.modalSectionTitle}>Branch & Weekly Schedules</Text>
                    {selectedDoctorForModal.schedule.map((sched, idx) => (
                      <View key={idx} style={styles.modalScheduleRow}>
                        <View style={styles.modalBranchBadge}>
                          <MapPin size={10} color="#fff" />
                          <Text style={styles.modalBranchBadgeText}>{sched.branch}</Text>
                        </View>
                        <View style={styles.modalSchedDetails}>
                          <Text style={styles.modalSchedDays}>{sched.days}</Text>
                          <Text style={styles.modalSchedHours}>{sched.hours}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                </ScrollView>

                {/* Bottom Action Bar */}
                <View style={styles.modalActionBar}>
                  <TouchableOpacity
                    style={styles.modalBookBtn}
                    onPress={() => {
                      setSelectedDoctorForModal(null);
                      navigation.navigate('BookAppointment', { doctorId: selectedDoctorForModal.id });
                    }}
                  >
                    <Text style={styles.modalBookBtnText} adjustsFontSizeToFit numberOfLines={1}>Book Appointment Now</Text>
                  </TouchableOpacity>
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10, marginBottom: 16 },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#1e293b' },
  headerSub: { fontSize: 13, color: '#64748b', marginTop: 2, fontWeight: '500' },
  notifBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: COLORS.white, justifyContent: 'center', alignItems: 'center' },
  badge: { position: 'absolute', top: 8, right: 8, backgroundColor: '#ef4444' },
  searchRow: { flexDirection: 'row', justifyContent: 'center', paddingHorizontal: 20, marginBottom: 20 },
  searchBar: { width: '85%', flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, height: 50, borderRadius: 14, paddingHorizontal: 16, elevation: 1, shadowColor: '#000', shadowOpacity: 0.03, shadowRadius: 10 },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 14, color: '#1e293b' },
  scrollContent: { paddingHorizontal: 20 },
  promoBanner: { height: 130, backgroundColor: '#eff6ff', borderRadius: 20, flexDirection: 'row', overflow: 'hidden', marginBottom: 24, elevation: 0 },
  bannerText: { flex: 1.2, padding: 20, justifyContent: 'center' },
  bannerTitle: { fontSize: 16, fontWeight: '700', color: '#1e293b' },
  bannerHighlight: { fontSize: 18, fontWeight: '800', color: COLORS.secondary, marginTop: 2 },
  bannerDesc: { fontSize: 11, color: '#64748b', marginTop: 8, lineHeight: 16 },
  bannerImg: { flex: 0.8, height: '100%' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#1e293b' },
  sectionSub: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
  sortBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f1f5f9', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, gap: 6 },
  sortText: { fontSize: 12, fontWeight: '700', color: COLORS.secondary },
  card: { backgroundColor: COLORS.white, borderRadius: 20, padding: 12, marginBottom: 16, elevation: 2, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 10, borderWidth: 1, borderColor: '#f1f5f9' },
  cardRow: { flexDirection: 'row' },
  imgContainer: { position: 'relative' },
  doctorImg: { width: 80, height: 80, borderRadius: 16, backgroundColor: '#f8fafc' },
  onlineDot: { position: 'absolute', top: 2, right: 2, width: 10, height: 10, borderRadius: 5, backgroundColor: '#10b981', borderWidth: 2, borderColor: COLORS.white },
  infoContainerWide: { flex: 1, marginLeft: 16 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  docName: { fontSize: 15, fontWeight: '800', color: '#1e293b' },
  docSub: { fontSize: 11, color: '#64748b', marginTop: 1, fontWeight: '500' },
  docSpecialty: { fontSize: 12, color: COLORS.secondary, fontWeight: '700', marginTop: 4 },
  statsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  statsText: { fontSize: 11, color: '#64748b', marginLeft: 4, fontWeight: '600' },
  statsDivider: { marginHorizontal: 6, color: '#cbd5e1' },
  statsCardRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  statMiniItem: { flexDirection: 'row', alignItems: 'center' },
  actionsRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginTop: 14 },
  outlinedActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderColor: '#e2e8f0', borderWidth: 1, paddingVertical: 8, borderRadius: 10, gap: 4, backgroundColor: '#f8fafc' },
  outlinedActionText: { fontSize: 12, fontWeight: '700', color: '#1e293b' },
  containedActionBtn: { flex: 1.2, backgroundColor: COLORS.secondary, paddingVertical: 8, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  containedActionText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  availabilityBoxBelow: { backgroundColor: '#e8f5e9', paddingHorizontal: 6, paddingVertical: 4, borderRadius: 6, marginTop: 8, alignItems: 'center' },
  availStatusText: { fontSize: 8, fontWeight: '800', color: '#2e7d32' },
  branchRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 4 },
  branchText: { fontSize: 11, color: '#94a3b8', fontWeight: '500' },
  rightContainer: { flex: 1, justifyContent: 'space-between', alignItems: 'flex-end' },
  availabilityBox: { alignItems: 'flex-end' },
  availHeader: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  availStatus: { fontSize: 10, fontWeight: '800' },
  availTime: { fontSize: 11, color: '#1e293b', fontWeight: '700', marginTop: 4 },
  bookBtn: { backgroundColor: COLORS.secondary, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, width: '100%', alignItems: 'center' },
  bookBtnText: { color: COLORS.white, fontSize: 11, fontWeight: '800' },
  verifiedFooter: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0f7ff', padding: 16, borderRadius: 18, marginTop: 8, marginBottom: 20 },
  verifiedIconBg: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#e0f2fe', justifyContent: 'center', alignItems: 'center' },
  verifiedTitle: { fontSize: 14, fontWeight: '800', color: '#1e293b' },
  verifiedDesc: { fontSize: 10, color: '#64748b', marginTop: 2, lineHeight: 14 },
  learnMore: { backgroundColor: COLORS.white, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0' },
  learnMoreText: { fontSize: 11, fontWeight: '700', color: COLORS.secondary },
  footerSpace: { height: 40 },
  expandedTimings: { marginTop: 12, borderTopWidth: 1, borderColor: '#f1f5f9', paddingTop: 12 },
  timingsDivider: { height: 1, backgroundColor: '#f1f5f9', marginBottom: 10 },
  timingsTitle: { fontSize: 12, fontWeight: '800', color: '#1e293b', marginBottom: 8 },
  scheduleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  branchBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.secondary, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, gap: 2, minWidth: 90, justifyContent: 'center' },
  branchBadgeText: { fontSize: 9, fontWeight: '800', color: '#fff' },
  schedDetails: { flex: 1 },
  schedDays: { fontSize: 11, fontWeight: '700', color: '#1e293b' },
  schedHours: { fontSize: 10, color: '#64748b', marginTop: 1 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '90%',
    height: '80%',
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#fff',
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  modalHeaderImageContainer: { width: '100%', height: 220, position: 'relative' },
  modalHeaderImage: { width: '100%', height: '100%' },
  modalImageOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)' },
  modalCloseBtn: { position: 'absolute', top: 16, right: 16, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.9)', justifyContent: 'center', alignItems: 'center', zIndex: 10 },
  modalHeaderNameContainer: { position: 'absolute', bottom: 16, left: 20, right: 20 },
  modalDocName: { fontSize: 20, fontWeight: '800', color: '#fff' },
  modalDocSub: { fontSize: 12, color: 'rgba(255,255,255,0.9)', marginTop: 4, fontWeight: '600' },
  modalScrollContent: { padding: 20 },
  modalStatsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f8fafc', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 16, marginBottom: 20 },
  modalStatItem: { flex: 1, alignItems: 'center' },
  modalStatVal: { fontSize: 14, fontWeight: '800', color: '#1e293b', marginTop: 4 },
  modalStatLbl: { fontSize: 10, color: '#64748b', marginTop: 2, fontWeight: '500' },
  modalStatDivider: { width: 1, height: 30, backgroundColor: '#e2e8f0' },
  modalSection: { marginBottom: 20 },
  modalSectionTitle: { fontSize: 14, fontWeight: '800', color: '#1e293b', marginBottom: 8 },
  modalBioText: { fontSize: 12, color: '#475569', lineHeight: 18, fontWeight: '500' },
  modalChipsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  modalChip: { backgroundColor: '#f0f7ff', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#e0f2fe' },
  modalChipText: { fontSize: 11, fontWeight: '700', color: COLORS.secondary },
  modalScheduleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  modalBranchBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.secondary, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, gap: 2, minWidth: 90, justifyContent: 'center' },
  modalBranchBadgeText: { fontSize: 9, fontWeight: '800', color: '#fff' },
  modalSchedDetails: { flex: 1 },
  modalSchedDays: { fontSize: 11, fontWeight: '700', color: '#1e293b' },
  modalSchedHours: { fontSize: 10, color: '#64748b', marginTop: 1 },
  modalActionBar: { borderTopWidth: 1, borderColor: '#f1f5f9', padding: 16, backgroundColor: '#fff' },
  modalBookBtn: { backgroundColor: COLORS.secondary, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  modalBookBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});

export default DoctorsList;
