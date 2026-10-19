import React, { useState, useEffect } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Surface, Searchbar, ActivityIndicator, Avatar } from 'react-native-paper';
import { COLORS, SIZES } from '../constants/theme';
import { db } from '../firebase';
import { collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
import { Star, ChevronRight, Stethoscope } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { getStandardBranchName } from '../utils/idGenerator';
const normalizeBranch = (branchName) => {
  return getStandardBranchName(branchName).toLowerCase();
};

const SelectDoctor = ({ navigation, route }) => {
  const { userData } = useAuth();
  const { branch = {} } = route.params || {};
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [globalFee, setGlobalFee] = useState(600);

  useEffect(() => {
    fetchDoctors();
    fetchGlobalFee();
  }, []);

  const fetchGlobalFee = async () => {
    try {
      const settingsRef = doc(db, 'settings', 'global');
      const settingsSnap = await getDoc(settingsRef);
      if (settingsSnap.exists() && settingsSnap.data().consultationFee) {
        setGlobalFee(Number(settingsSnap.data().consultationFee));
      }
    } catch (e) {
      console.error("Error fetching global fee in SelectDoctor:", e);
    }
  };

  const fetchDoctors = async () => {
    try {
      // Fetch users with role 'doctor'
      const q = query(
        collection(db, 'users'),
        where('role', '==', 'doctor')
      );
      const querySnapshot = await getDocs(q);
      const data = querySnapshot.docs.map(doc => {
        const u = doc.data();
        let docName = u.name || '';
        if (docName) {
          let clean = docName.replace(/^dr\.\s*/i, '').replace(/^dr\s*/i, '').trim();
          docName = 'Dr. ' + clean.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
        }
        return { id: doc.id, ...u, name: docName };
      });
      
      const normSelected = normalizeBranch(branch?.id || branch?.name);
      
      const filtered = data.filter(u => {
        let doctorBranches = [];
        if (u.timings && Array.isArray(u.timings) && u.timings.length > 0) {
          doctorBranches = u.timings.map(t => t.branch);
        } else if (u.branches && Array.isArray(u.branches)) {
          doctorBranches = u.branches;
        } else if (u.branchName) {
          doctorBranches = [u.branchName];
        } else if (u.branchId) {
          doctorBranches = [u.branchId];
        } else {
          return true;
        }
        return doctorBranches.some(br => normalizeBranch(br) === normSelected);
      });
      
      setDoctors(filtered);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const DOCTOR_TEMPLATES = {
    'prashanthkvaidya': {
      image: 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?auto=format&fit=crop&q=80&w=300',
      rating: '4.8',
      reviews: '320',
    },
    'drprashanthkvaidya': {
      image: 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?auto=format&fit=crop&q=80&w=300',
      rating: '4.8',
      reviews: '320',
    },
    'ramakrishnachanduri': {
      image: 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&q=80&w=300',
      rating: '4.9',
      reviews: '410',
    },
    'drchramakrishna': {
      image: 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&q=80&w=300',
      rating: '4.9',
      reviews: '410',
    },
    'jobeadhparveej': {
      image: 'https://images.unsplash.com/photo-1594824476967-48c8b964273f?auto=format&fit=crop&q=80&w=300',
      rating: '4.7',
      reviews: '285',
    },
    'drjobedahparveez': {
      image: 'https://images.unsplash.com/photo-1594824476967-48c8b964273f?auto=format&fit=crop&q=80&w=300',
      rating: '4.7',
      reviews: '285',
    },
    'padmapriya': {
      image: 'https://images.unsplash.com/photo-1559839734-2b71f153678e?auto=format&fit=crop&q=80&w=300',
      rating: '4.6',
      reviews: '210',
    },
    'drpadmapriya': {
      image: 'https://images.unsplash.com/photo-1559839734-2b71f153678e?auto=format&fit=crop&q=80&w=300',
      rating: '4.6',
      reviews: '210',
    }
  };

  const getDoctorDetails = (item) => {
    const normalizeName = (name) => {
      return name ? name.toLowerCase().replace(/^dr\.\s*/, '').replace(/^dr\s*/, '').replace(/[^a-z0-9]/g, '') : '';
    };
    const nameKey = normalizeName(item.name);
    const template = DOCTOR_TEMPLATES[nameKey] || {};
    return {
      image: item.photoUrl || item.image || item.photoURL || template.image || null,
      rating: template.rating || '4.8',
      reviews: template.reviews || '120'
    };
  };

  const filteredDoctors = doctors.filter(d =>
    d.name.toLowerCase().includes(search.toLowerCase())
  );

  const renderItem = ({ item }) => {
    const details = getDoctorDetails(item);
    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => navigation.navigate('SelectDateTime', { branch, doctor: item })}
      >
        <Surface style={styles.card}>
          {details.image ? (
            <Image source={{ uri: details.image }} style={styles.avatar} />
          ) : (
            <Avatar.Icon size={64} icon="doctor" style={styles.avatarPlaceholder} />
          )}
          <View style={styles.cardContent}>
            <Text style={styles.doctorName}>{item.name}</Text>
            <Text style={styles.specialization}>{item.specialty || item.specialization || 'Homeopathic Physician'}</Text>
            <View style={styles.metaRow}>
              <View style={styles.badge}>
                <Star size={12} color="#f59e0b" fill="#f59e0b" />
                <Text style={styles.badgeText}>{details.rating} ({details.reviews}+ reviews)</Text>
              </View>
            </View>
            {(() => {
              const durEnd = userData?.medicationDurationEnd;
              const inDuration = durEnd ? new Date(durEnd) > new Date() : false;
              return (
                <Text style={styles.fee}>
                  Fee: {inDuration ? '₹0 (In Duration)' : `₹${item.consultationFee || globalFee}`}
                </Text>
              );
            })()}
          </View>
          <ChevronRight size={20} color={COLORS.muted} />
        </Surface>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Select Doctor</Text>
        <Text style={styles.subtitle}>Branch: {branch.name}</Text>
      </View>

      <Searchbar
        placeholder="Search doctors..."
        onChangeText={setSearch}
        value={search}
        style={styles.searchBar}
        iconColor={COLORS.primary}
      />

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={COLORS.primary} />
      ) : (
        <FlatList
          data={filteredDoctors}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Stethoscope size={64} color={COLORS.muted} />
              <Text style={styles.emptyText}>No doctors found in this branch.</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { paddingHorizontal: SIZES.padding, paddingTop: 20, paddingBottom: 20 },
  title: { fontSize: 24, fontWeight: '700', color: COLORS.text },
  subtitle: { fontSize: 16, color: COLORS.primary, marginTop: 4, fontWeight: '600' },
  searchBar: { marginHorizontal: SIZES.padding, marginBottom: 20, borderRadius: 12, backgroundColor: '#f8fafc' },
  list: { paddingHorizontal: SIZES.padding },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    backgroundColor: COLORS.white,
    marginBottom: 12,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  avatar: { width: 64, height: 64, borderRadius: 12 },
  avatarPlaceholder: { backgroundColor: COLORS.primary + '20' },
  cardContent: { flex: 1, marginLeft: 16 },
  doctorName: { fontSize: 17, fontWeight: '600', color: COLORS.text },
  specialization: { fontSize: 13, color: COLORS.muted, marginBottom: 6 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  badge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fef3c7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  badgeText: { fontSize: 10, color: '#92400e', marginLeft: 4, fontWeight: '600' },
  fee: { fontSize: 14, fontWeight: '700', color: COLORS.secondary },
  emptyContainer: { alignItems: 'center', marginTop: 60 },
  emptyText: { marginTop: 16, color: COLORS.muted, fontSize: 14 },
});

export default SelectDoctor;
