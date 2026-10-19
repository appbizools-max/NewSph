import React, { useState, useEffect } from 'react';
import { View, StyleSheet, FlatList, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Surface, Searchbar, ActivityIndicator } from 'react-native-paper';
import { COLORS, SIZES } from '../constants/theme';
import { db } from '../firebase';
import { collection, getDocs, query, where, doc, onSnapshot } from 'firebase/firestore';
import { MapPin, Phone, ChevronRight } from 'lucide-react-native';

const SelectBranch = ({ navigation }) => {
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [bookingBanner, setBookingBanner] = useState(null);

  useEffect(() => {
    fetchBranches();
    const unsub = onSnapshot(doc(db, 'banners', 'booking'), (snap) => {
      if (snap.exists()) {
        setBookingBanner(snap.data().imageUrl);
      } else {
        setBookingBanner(null);
      }
    });
    return () => unsub();
  }, []);

  const fetchBranches = async () => {
    try {
      const q = query(collection(db, 'users'), where('role', '==', 'branch'));
      const querySnapshot = await getDocs(q);
      const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setBranches(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const filteredBranches = branches.filter(b => 
    b.name.toLowerCase().includes(search.toLowerCase())
  );

  const renderItem = ({ item }) => (
    <TouchableOpacity 
      activeOpacity={0.7}
      onPress={() => navigation.navigate('SelectDoctor', { branch: item })}
    >
      <Surface style={styles.card}>
        <View style={styles.cardContent}>
          <Text style={styles.branchName}>{item.name}</Text>
          <View style={styles.infoRow}>
            <MapPin size={14} color={COLORS.muted} />
            <Text style={styles.infoText}>{item.address || 'Address not available'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Phone size={14} color={COLORS.muted} />
            <Text style={styles.infoText}>{item.phone || 'Contact not available'}</Text>
          </View>
        </View>
        <ChevronRight size={20} color={COLORS.muted} />
      </Surface>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Select Branch</Text>
        <Text style={styles.subtitle}>Choose your nearest clinic branch</Text>
      </View>

      {bookingBanner && (
        <Surface style={styles.bookingPromoBanner}>
          <Image 
            source={{ uri: bookingBanner }} 
            style={styles.bookingPromoImg} 
            resizeMode="cover"
          />
        </Surface>
      )}

      <Searchbar
        placeholder="Search branches..."
        onChangeText={setSearch}
        value={search}
        style={styles.searchBar}
        iconColor={COLORS.primary}
      />

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={COLORS.primary} />
      ) : (
        <FlatList
          data={filteredBranches}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.emptyText}>No branches found.</Text>}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { paddingHorizontal: SIZES.padding, paddingTop: 20, paddingBottom: 20 },
  title: { fontSize: 24, fontWeight: '700', color: COLORS.text },
  subtitle: { fontSize: 16, color: COLORS.muted, marginTop: 4 },
  bookingPromoBanner: {
    marginHorizontal: SIZES.padding,
    marginBottom: 20,
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 2,
    borderWidth: 1,
    borderColor: '#f1f5f9'
  },
  bookingPromoImg: {
    width: '100%',
    height: 120
  },
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
  cardContent: { flex: 1 },
  branchName: { fontSize: 18, fontWeight: '600', color: COLORS.text, marginBottom: 8 },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  infoText: { fontSize: 13, color: COLORS.muted, marginLeft: 8 },
  emptyText: { textAlign: 'center', marginTop: 40, color: COLORS.muted },
});

export default SelectBranch;
