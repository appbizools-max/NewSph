import React from 'react';
import { View, StyleSheet, Image, Dimensions, TouchableOpacity, ImageBackground } from 'react-native';
import { Text, Surface } from 'react-native-paper';
import { COLORS } from '../constants/theme';
import { SafeAreaView } from 'react-native-safe-area-context';
import { UserPlus, LogIn, ChevronRight, ShieldCheck, Heart, Stethoscope, Activity } from 'lucide-react-native';
const { width, height } = Dimensions.get('window');
const AuthChoice = ({ navigation }) => {
  return (
    <View style={styles.container}>
      <ImageBackground
        source={{ uri: 'https://images.unsplash.com/photo-1629909615184-74f495363b67?auto=format&fit=crop&q=80&w=1500' }}
        style={styles.bgImage}
        blurRadius={0}
      >
        <View style={styles.darkOverlay} />
        <SafeAreaView style={styles.safeArea}>
          {/* Header Section */}
          <View style={styles.header}>
            <Image
              source={require('../../assets/SH logo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.tagline}>Spiritual Homeopathy</Text>
          </View>

          {/* Main Card Section */}
          <View style={styles.bottomSheet}>
            <View style={styles.indicator} />

            <Text style={styles.welcomeTitle}>Welcome to Wellness</Text>
            <Text style={styles.welcomeSub}>Experience the power of holistic healing with India's leading homeopathy experts.</Text>

            <View style={styles.actionGrid}>
              {/* New Patient Card */}
              <TouchableOpacity
                activeOpacity={0.9}
                style={styles.actionCard}
                onPress={() => navigation.navigate('Login', { initialMode: 'signup' })}
              >
                <Surface style={[styles.iconCircle, { backgroundColor: '#f0fdf4' }]}>
                  <UserPlus size={28} color="#10b981" />
                </Surface>
                <View style={styles.cardText}>
                  <Text style={styles.cardTitle}>New Patient</Text>
                  <Text style={styles.cardDesc}>Start your journey with us today</Text>
                </View>
                <View style={styles.arrowBox}>
                  <ChevronRight size={20} color="#94a3b8" />
                </View>
              </TouchableOpacity>
 
              {/* Existing Patient Card */}
              <TouchableOpacity
                activeOpacity={0.9}
                style={styles.actionCard}
                onPress={() => navigation.navigate('Login', { initialMode: 'login' })}
              >
                <Surface style={[styles.iconCircle, { backgroundColor: '#eff6ff' }]}>
                  <LogIn size={28} color={COLORS.secondary} />
                </Surface>
                <View style={styles.cardText}>
                  <Text style={styles.cardTitle}>Existing Patient</Text>
                  <Text style={styles.cardDesc}>Login to access your health dashboard</Text>
                </View>
                <View style={styles.arrowBox}>
                  <ChevronRight size={20} color="#94a3b8" />
                </View>
              </TouchableOpacity>
            </View>

            {/* Value Props Row */}
            <View style={styles.propsRow}>
              <View style={styles.propItem}>
                <Heart size={16} color="#ef4444" />
                <Text style={styles.propText}>Holistic Care</Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.propItem}>
                <Stethoscope size={16} color="#8b5cf6" />
                <Text style={styles.propText}>Expert Doctors</Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.propItem}>
                <Activity size={16} color="#10b981" />
                <Text style={styles.propText}>Fast Healing</Text>
              </View>
            </View>

            <View style={styles.footer}>
              <ShieldCheck size={14} color="#94a3b8" />
              <Text style={styles.securityText}>100% Secure & Encrypted</Text>
            </View>
          </View>
        </SafeAreaView>
      </ImageBackground>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  bgImage: { width: width, height: height },
  darkOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(30, 41, 59, 0.4)' },
  safeArea: { flex: 1 },
  header: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  logo: { width: 220, height: 70 },
  tagline: { color: '#fff', fontSize: 16, fontWeight: '700', marginTop: 10, letterSpacing: 1 },
  bottomSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    paddingHorizontal: 30,
    paddingTop: 15,
    paddingBottom: 40,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 20,
  },
  indicator: { width: 40, height: 5, backgroundColor: '#f1f5f9', borderRadius: 10, marginBottom: 25 },
  welcomeTitle: { fontSize: 26, fontWeight: '900', color: '#1e293b', textAlign: 'center' },
  welcomeSub: { fontSize: 14, color: '#64748b', textAlign: 'center', marginTop: 10, lineHeight: 22, fontWeight: '500' },
  actionGrid: { width: '100%', marginTop: 30, gap: 16 },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#f1f5f9',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 0,
  },
  cardText: { flex: 1, marginLeft: 16 },
  cardTitle: { fontSize: 18, fontWeight: '800', color: '#1e293b' },
  cardDesc: { fontSize: 12, color: '#94a3b8', marginTop: 2, fontWeight: '600' },
  arrowBox: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#f8fafc', justifyContent: 'center', alignItems: 'center' },
  propsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 35, gap: 12 },
  propItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  propText: { fontSize: 11, fontWeight: '700', color: '#64748b' },
  divider: { width: 1, height: 12, backgroundColor: '#e2e8f0' },
  footer: { flexDirection: 'row', alignItems: 'center', marginTop: 30, gap: 6 },
  securityText: { fontSize: 11, color: '#cbd5e1', fontWeight: '700', letterSpacing: 0.5 },
});

export default AuthChoice;
