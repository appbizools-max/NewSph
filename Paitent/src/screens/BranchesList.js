import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Image, Linking, Modal, RefreshControl, Dimensions } from 'react-native';
import { Text, Surface, Button } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../constants/theme';
import { ChevronLeft, Star, Phone, MapPin, Clock, X, Navigation, PhoneCall, ShieldCheck } from 'lucide-react-native';
import { db } from '../firebase';
import { collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const INITIAL_BRANCHES = [
  {
    id: 'kphb',
    name: 'Kphb',
    rating: '4.9 (1200+)',
    distance: '0.8 km',
    specialty: 'Spiritual Homeopathy',
    timings: '10:00 AM - 8:30 PM',
    phones: ['9030176176', '8125176176'],
    formattedPhones: ['9030 176 176', '8125 176 176'],
    address: 'Plot no 27, near ideal kitchen, KPHB Phase 15, Hyderabad, 500085',
    landmark: 'Near ideal kitchen',
    image: 'https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&w=600&q=80',
    images: ['https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&w=600&q=80'],
    latLng: '17.4834,78.3883'
  },
  {
    id: 'nallagandla',
    name: 'Nallagandla',
    rating: '4.8 (980+)',
    distance: '4.2 km',
    specialty: 'Spiritual Homeopathy',
    timings: '10:00 AM - 8:30 PM',
    phones: ['9132176176'],
    formattedPhones: ['9132 176 176'],
    address: 'Sai Ram Nagar colony, Plot no 83, Kanchi Gachibowli Rd, Tellapur, Nallagandla, Hyderabad, Telangana 500019',
    landmark: 'Opp. Navodaya Vidyalaya, Hyderabad',
    image: 'https://images.unsplash.com/photo-1586773860418-d372a67de556?auto=format&fit=crop&w=600&q=80',
    images: ['https://images.unsplash.com/photo-1586773860418-d372a67de556?auto=format&fit=crop&w=600&q=80'],
    latLng: '17.4729,78.3188'
  },
  {
    id: 'dilshuknagar',
    name: 'Dilshuknagar',
    rating: '4.9 (1100+)',
    distance: '12.5 km',
    specialty: 'Spiritual Homeopathy',
    timings: '10:00 AM - 8:30 PM',
    phones: ['9804176176'],
    formattedPhones: ['9804 176 176'],
    address: '4-110, Spiritual Homeopathy, Near Metro Station Pillar No 1540, Beside lane of Bata Showroom , Dilshuknagar, Hyderabad-500060',
    landmark: 'Near Metro Station Pillar No 1540, Beside lane of Bata Showroom',
    image: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=600&q=80',
    images: ['https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=600&q=80'],
    latLng: '17.3688,78.5247'
  },
  {
    id: 'chandanagar',
    name: 'Chandanagar',
    rating: '4.7 (850+)',
    distance: '6.8 km',
    specialty: 'Spiritual Homeopathy',
    timings: '10:00 AM - 9:00 PM',
    phones: ['9553176176', '7416176176'],
    formattedPhones: ['9553 176 176', '7416 176 176'],
    address: 'House Number 4-118, Lane opp. to Balaji Temple, Beside bank of commerce, Gangaram, Chandnagar, Hyderabad - 500050',
    landmark: 'Lane opp. to Balaji Temple, Beside bank of commerce',
    image: 'https://images.unsplash.com/photo-1512678080530-7760d81faba6?auto=format&fit=crop&w=600&q=80',
    images: ['https://images.unsplash.com/photo-1512678080530-7760d81faba6?auto=format&fit=crop&w=600&q=80'],
    latLng: '17.5008,78.3283'
  }
];

const DEFAULT_BRANCH_IMAGES = {
  kphb: 'https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&w=800&q=80',
  nallagandla: 'https://images.unsplash.com/photo-1586773860418-d372a67de556?auto=format&fit=crop&w=800&q=80',
  dilshuknagar: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=800&q=80',
  chandanagar: 'https://images.unsplash.com/photo-1512678080530-7760d81faba6?auto=format&fit=crop&w=800&q=80'
};

const getValidImageUrl = (url, branchId) => {
  if (!url || typeof url !== 'string') return DEFAULT_BRANCH_IMAGES[branchId] || DEFAULT_BRANCH_IMAGES.kphb;
  const trimmed = url.trim();
  if (trimmed.length < 10 || trimmed.toLowerCase().includes('no image') || trimmed.toLowerCase().includes('not set')) {
    return DEFAULT_BRANCH_IMAGES[branchId] || DEFAULT_BRANCH_IMAGES.kphb;
  }
  return trimmed;
};

const PhotoCarousel = ({ images, height = 180, defaultImg, cardWidth }) => {
  const [activeIdx, setActiveIdx] = useState(0);
  const containerWidth = cardWidth || SCREEN_WIDTH - 32;

  const validPhotos = (images && Array.isArray(images) && images.length > 0)
    ? images.map(u => getValidImageUrl(u, 'kphb'))
    : [defaultImg];

  if (validPhotos.length <= 1) {
    return (
      <Image 
        source={{ uri: validPhotos[0] }} 
        style={{ width: '100%', height }} 
        resizeMode="cover"
      />
    );
  }

  const handleScroll = (e) => {
    const slide = Math.round(e.nativeEvent.contentOffset.x / containerWidth);
    if (slide !== activeIdx) setActiveIdx(slide);
  };

  return (
    <View style={{ width: '100%', height, position: 'relative' }}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        {validPhotos.map((uri, idx) => (
          <Image 
            key={idx} 
            source={{ uri }} 
            style={{ width: containerWidth, height }} 
            resizeMode="cover" 
          />
        ))}
      </ScrollView>

      <View style={styles.carouselPagination}>
        {validPhotos.map((_, idx) => (
          <View 
            key={idx} 
            style={[styles.carouselDot, idx === activeIdx && styles.carouselDotActive]} 
          />
        ))}
      </View>
    </View>
  );
};

const BranchesList = ({ navigation }) => {
  const [selectedBranch, setSelectedBranch] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [branchesList, setBranchesList] = useState(INITIAL_BRANCHES);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'branches'), (snap) => {
      const dbDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      const updated = INITIAL_BRANCHES.map(initBranch => {
        const matching = dbDocs.filter(d => {
          const dId = (d.id || '').toLowerCase();
          const dName = (d.name || d.branchName || d.username || '').toLowerCase();
          return dId === initBranch.id || dName.includes(initBranch.id) || initBranch.id.includes(dId);
        });

        const matched = matching.find(d => !!(d.imageUrl || d.image || (d.images && d.images.length > 0))) || matching[0];

        if (matched) {
          const branchCopy = { ...initBranch };
          if (matched.timings) branchCopy.timings = matched.timings;
          if (matched.address) branchCopy.address = matched.address;
          if (matched.landmark) branchCopy.landmark = matched.landmark;
          if (matched.phone) {
            branchCopy.phones = [matched.phone];
            branchCopy.formattedPhones = [matched.phone];
          }

          const rawImgs = matched.images && Array.isArray(matched.images) && matched.images.length > 0
            ? matched.images
            : (matched.imageUrl || matched.image ? [matched.imageUrl || matched.image] : [initBranch.image]);

          const validGallery = rawImgs.map(u => getValidImageUrl(u, initBranch.id));
          branchCopy.images = validGallery;
          branchCopy.image = validGallery[0] || getValidImageUrl(initBranch.image, initBranch.id);
          return branchCopy;
        }
        return initBranch;
      });

      setBranchesList(updated);
    });

    return () => unsub();
  }, []);

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      const snap = await getDocs(collection(db, 'branches'));
      const dbDocs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      const updated = INITIAL_BRANCHES.map(initBranch => {
        const matching = dbDocs.filter(d => {
          const dId = (d.id || '').toLowerCase();
          const dName = (d.name || d.branchName || d.username || '').toLowerCase();
          return dId === initBranch.id || dName.includes(initBranch.id) || initBranch.id.includes(dId);
        });

        const matched = matching.find(d => !!(d.imageUrl || d.image)) || matching[0];

        if (matched) {
          const branchCopy = { ...initBranch };
          if (matched.timings) branchCopy.timings = matched.timings;
          if (matched.address) branchCopy.address = matched.address;
          if (matched.landmark) branchCopy.landmark = matched.landmark;
          if (matched.phone) {
            branchCopy.phones = [matched.phone];
            branchCopy.formattedPhones = [matched.phone];
          }
          const validImg = getValidImageUrl(matched.imageUrl || matched.image, initBranch.id);
          branchCopy.image = validImg;
          return branchCopy;
        }
        return initBranch;
      });
      setBranchesList(updated);
    } catch (e) {
      console.error("Error refreshing branches:", e);
    } finally {
      setRefreshing(false);
    }
  }, []);

  const handleCallBranch = (phone) => {
    const ph = phone || '9030176176';
    const clean = String(ph).replace(/\D/g, '');
    if (clean) {
      Linking.openURL(`tel:${clean}`);
    }
  };

  const handleGetDirections = (item) => {
    let url = item?.directionUrl || item?.mapUrl;
    if (!url || typeof url !== 'string' || url.length < 5) {
      const queryName = item?.name || 'Spiritual Homeopathy';
      url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(queryName)}`;
    }
    Linking.openURL(url);
  };

  const BranchCard = ({ item }) => {
    const displayName = (item.name || 'Clinic').replace(/\s*branch\s*/i, '') + ' Branch';
    const callPhone = (item.phones && item.phones.length > 0) ? item.phones[0] : (item.phone || '9030176176');
    const defaultImg = DEFAULT_BRANCH_IMAGES[item.id] || DEFAULT_BRANCH_IMAGES.kphb;

    return (
      <Surface style={styles.hospitalCard}>
        <View style={{ position: 'relative' }}>
          <PhotoCarousel 
            images={item.images} 
            height={180} 
            defaultImg={defaultImg} 
            cardWidth={SCREEN_WIDTH - 40}
          />
          <View style={styles.badgeOverlay}>
            <View style={styles.statusPill}>
              <Text style={styles.statusPillText}>OPEN</Text>
            </View>
          </View>
        </View>

        <View style={styles.hospitalInfo}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={styles.hospitalName} numberOfLines={1}>{displayName}</Text>
            <Text style={styles.specialtyBadge}>{item.specialty || 'Homeopathy Care'}</Text>
          </View>

          <View style={styles.timingRow}>
            <Clock size={13} color="#258ec8" />
            <Text style={styles.timingText}>{item.timings || '10:00 AM - 8:30 PM'}</Text>
          </View>

          <View style={styles.locRow}>
            <MapPin size={13} color="#ef4444" style={{ marginTop: 1 }} />
            <Text style={styles.locText} numberOfLines={2}>{item.address || 'Spiritual Homeopathy Clinic'}</Text>
          </View>

          {/* Action Buttons Row */}
          <View style={styles.cardActionsRow}>
            <TouchableOpacity 
              style={styles.callCardBtn}
              onPress={() => handleCallBranch(callPhone)}
            >
              <Phone size={14} color="#258ec8" />
              <Text style={styles.callCardText}>Call Branch</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.directionsCardBtn}
              onPress={() => handleGetDirections(item)}
            >
              <MapPin size={14} color="#fff" />
              <Text style={styles.directionsCardText}>Get Directions</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Surface>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ChevronLeft size={24} color="#1e293b" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Our Branches</Text>
        <View style={{ width: 40 }} />
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
        <Text style={styles.subTitle}>Select a clinic branch to view details, call, or get map directions</Text>

        {branchesList.map((branch) => (
          <TouchableOpacity
            key={branch.id}
            activeOpacity={0.95}
            onPress={() => setSelectedBranch(branch)}
          >
            <BranchCard item={branch} />
          </TouchableOpacity>
        ))}

        <View style={styles.bottomGap} />
      </ScrollView>

      {/* Premium Branch Details Sheet Modal */}
      <Modal
        visible={selectedBranch !== null}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSelectedBranch(null)}
      >
        <View style={styles.modalBackdrop}>
          <Surface style={styles.modalContent}>
            {selectedBranch && (() => {
              const modalImg = getValidImageUrl(selectedBranch.image, selectedBranch.id);
              const modalTitle = (selectedBranch.name || 'Clinic').replace(/\s*branch\s*/i, '') + ' Branch';
              const modalTimings = selectedBranch.timings || '10:00 AM - 8:30 PM';
              const phoneList = selectedBranch.formattedPhones || selectedBranch.phones || (selectedBranch.phone ? [selectedBranch.phone] : ['9030 176 176']);

              return (
                <View style={{ flex: 1 }}>
                  {/* Hero Image Block with Carousel */}
                  <View style={styles.modalHero}>
                    <PhotoCarousel 
                      images={selectedBranch.images} 
                      height={200} 
                      defaultImg={modalImg} 
                      cardWidth={SCREEN_WIDTH}
                    />
                    <TouchableOpacity onPress={() => setSelectedBranch(null)} style={styles.closeBtn}>
                      <X size={20} color="#1e293b" />
                    </TouchableOpacity>
                  </View>

                  <ScrollView contentContainerStyle={styles.modalScroll} showsVerticalScrollIndicator={false}>
                    {/* Title & Specialties */}
                    <View style={styles.modalTitleBlock}>
                      <Text style={styles.modalName}>{modalTitle}</Text>
                    </View>

                    {/* Timings */}
                    <View style={styles.modalSection}>
                      <Text style={styles.modalSectionTitle}>Operating Hours</Text>
                      <View style={styles.timingsBlock}>
                        <Clock size={16} color={COLORS.secondary} />
                        <Text style={styles.timingsValue}>{modalTimings}</Text>
                      </View>
                    </View>

                    {/* Contact Numbers with Direct Call Hooks */}
                    <View style={styles.modalSection}>
                      <Text style={styles.modalSectionTitle}>Direct Contact Channels</Text>
                      {phoneList.map((ph, idx) => (
                        <TouchableOpacity 
                          key={idx}
                          style={styles.phoneActionCard}
                          onPress={() => handleCallBranch(ph)}
                        >
                          <View style={styles.phoneIconBg}>
                            <PhoneCall size={16} color={COLORS.secondary} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.phoneLabel}>Reception Line {idx + 1}</Text>
                            <Text style={styles.phoneVal}>{ph}</Text>
                          </View>
                          <Text style={styles.callNowTag}>Call Now</Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    {/* Full Address & Landmark Details */}
                    <View style={styles.modalSection}>
                      <Text style={styles.modalSectionTitle}>Location Address</Text>
                      <Surface style={styles.addressCard}>
                        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                          <MapPin size={18} color="#ef4444" style={{ marginTop: 2 }} />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.addressText}>{selectedBranch.address || 'Spiritual Homeopathy Clinic'}</Text>
                            {selectedBranch.landmark ? (
                              <View style={styles.landmarkBox}>
                                <Text style={styles.landmarkLabel}>Landmark:</Text>
                                <Text style={styles.landmarkText}>{selectedBranch.landmark}</Text>
                              </View>
                            ) : null}
                          </View>
                        </View>
                      </Surface>
                    </View>

                    {/* Get Directions Map Launcher */}
                    <View style={styles.modalActionBar}>
                      <Button 
                        mode="contained"
                        icon={({ size, color }) => <Navigation size={size} color={color} />}
                        onPress={() => handleGetDirections(selectedBranch)}
                        buttonColor={COLORS.secondary}
                        style={{ borderRadius: 12, paddingVertical: 4 }}
                      >
                        Open Google Maps Directions
                      </Button>
                    </View>
                  </ScrollView>
                </View>
              );
            })()}
          </Surface>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fcfdfe' },
  carouselPagination: {
    position: 'absolute',
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6
  },
  carouselDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.5)'
  },
  carouselDotActive: {
    width: 18,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ffffff'
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9'
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#1e293b' },
  scrollContent: { padding: 20 },
  subTitle: { fontSize: 13, color: '#64748b', marginBottom: 20, fontWeight: '500', lineHeight: 18 },
  hospitalCard: {
    width: '100%',
    borderRadius: 20,
    backgroundColor: COLORS.white,
    marginBottom: 20,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0'
  },
  hospitalImage: { width: '100%', height: 170 },
  badgeOverlay: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center'
  },
  ratingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20
  },
  ratingPillText: { fontSize: 11, fontWeight: '800', color: '#fff' },
  statusPill: {
    backgroundColor: '#10b981',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20
  },
  statusPillText: { fontSize: 10, fontWeight: '900', color: '#fff', letterSpacing: 0.5 },
  hospitalInfo: { padding: 16 },
  hospitalName: { fontSize: 16, fontWeight: '800', color: '#0f172a', flex: 1 },
  specialtyBadge: { fontSize: 11, fontWeight: '700', color: '#258ec8', backgroundColor: '#e0f2fe', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  timingRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 6 },
  timingText: { fontSize: 12, color: '#475569', fontWeight: '600' },
  locRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 6, gap: 6 },
  locText: { fontSize: 12, color: '#64748b', fontWeight: '500', lineHeight: 16, flex: 1 },
  cardActionsRow: { flexDirection: 'row', gap: 10, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  callCardBtn: { flex: 1, height: 38, borderRadius: 10, backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 },
  callCardText: { fontSize: 12, fontWeight: '700', color: '#258ec8' },
  directionsCardBtn: { flex: 1, height: 38, borderRadius: 10, backgroundColor: '#258ec8', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 },
  directionsCardText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  bottomGap: { height: 40 },

  // Modal Styling
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { width: '100%', height: '80%', borderTopLeftRadius: 30, borderTopRightRadius: 30, backgroundColor: '#fff', elevation: 20, overflow: 'hidden' },
  modalHero: { width: '100%', height: 200, position: 'relative' },
  modalHeroImg: { width: '100%', height: '100%' },
  closeBtn: { position: 'absolute', top: 16, right: 16, width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', elevation: 4 },
  modalScroll: { padding: 20, paddingBottom: 40 },
  modalTitleBlock: { marginBottom: 20 },
  modalName: { fontSize: 18, fontWeight: '800', color: '#1e293b' },
  modalMetaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  modalRatingText: { fontSize: 13, fontWeight: '700', color: '#1e293b', marginLeft: 4 },
  modalDistanceText: { fontSize: 13, color: '#64748b', marginLeft: 4 },
  modalSection: { marginBottom: 20 },
  modalSectionTitle: { fontSize: 12, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  timingsBlock: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#f0fdf4', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#bbf7d0' },
  timingsValue: { fontSize: 13, fontWeight: '700', color: '#14532d' },
  phoneActionCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', borderRadius: 16, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#e2e8f0' },
  phoneIconBg: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#eff6ff', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  phoneLabel: { fontSize: 11, color: '#94a3b8', fontWeight: '500' },
  phoneVal: { fontSize: 13, fontWeight: '800', color: '#1e293b', marginTop: 2 },
  callNowTag: { fontSize: 12, fontWeight: '800', color: COLORS.secondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  addressCard: { padding: 16, borderRadius: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: '#f1f5f9', elevation: 1 },
  addressText: { fontSize: 13, color: '#334155', fontWeight: '600', lineHeight: 20 },
  landmarkBox: { marginTop: 8, borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 8 },
  landmarkLabel: { fontSize: 11, fontWeight: '700', color: '#64748b' },
  landmarkText: { fontSize: 12, color: COLORS.secondary, fontWeight: '600', marginTop: 2 },
  modalActionBar: { padding: 20, borderTopWidth: 1, borderTopColor: '#f1f5f9', backgroundColor: '#fff' }
});

export default BranchesList;
