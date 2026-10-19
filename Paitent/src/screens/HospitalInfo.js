import React from 'react';
import { View, StyleSheet, ScrollView, Image, TouchableOpacity, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Surface, IconButton, Divider } from 'react-native-paper';
import { COLORS, SIZES } from '../constants/theme';
import { MapPin, Phone, Mail, Globe } from 'lucide-react-native';
import Svg, { Path, Rect, Line } from 'react-native-svg';

// Custom SVG Icons to avoid undefined brand icons in lucide-react-native
const FacebookIcon = ({ size = 24, color = '#1877f2', style }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}>
    <Path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
  </Svg>
);

const InstagramIcon = ({ size = 24, color = '#e4405f', style }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}>
    <Rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
    <Path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <Line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
  </Svg>
);

const YoutubeIcon = ({ size = 24, color = '#ff0000', style }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}>
    <Path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" />
    <Path d="m10 15 5-3-5-3Z" fill={color} stroke={color} />
  </Svg>
);

const HospitalInfo = () => {
  const socialLinks = [
    { icon: FacebookIcon, color: '#1877f2', url: 'https://facebook.com' },
    { icon: InstagramIcon, color: '#e4405f', url: 'https://instagram.com' },
    { icon: YoutubeIcon, color: '#ff0000', url: 'https://youtube.com' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView>
        <View style={styles.header}>
        <Image 
          source={require('../../assets/SH logo.png')} 
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.title}>Spiritual Homeo Clinic</Text>
        <Text style={styles.tagline}>Natural Healing for a Better Life</Text>
        </View>
      
      <View style={styles.content}>
        <Surface style={styles.card}>
          <Text style={styles.sectionTitle}>Contact Us</Text>
          <View style={styles.infoRow}>
            <Phone size={20} color={COLORS.primary} />
            <Text style={styles.infoText}>+91 98765 43210</Text>
          </View>
          <View style={styles.infoRow}>
            <Mail size={20} color={COLORS.primary} />
            <Text style={styles.infoText}>contact@spiritualhomeo.com</Text>
          </View>
          <View style={styles.infoRow}>
            <Globe size={20} color={COLORS.primary} />
            <Text style={styles.infoText}>www.spiritualhomeo.com</Text>
          </View>
        </Surface>

        <Surface style={styles.card}>
          <Text style={styles.sectionTitle}>Follow Us</Text>
          <View style={styles.socialRow}>
            {socialLinks.map((social, index) => (
              <TouchableOpacity 
                key={index} 
                style={[styles.socialBtn, { backgroundColor: social.color + '15' }]}
                onPress={() => Linking.openURL(social.url)}
              >
                <social.icon size={24} color={social.color} />
              </TouchableOpacity>
            ))}
          </View>
        </Surface>

        <Surface style={styles.card}>
          <Text style={styles.sectionTitle}>About Us</Text>
          <Text style={styles.aboutText}>
            Spiritual Homeo Clinic is dedicated to providing holistic and natural healthcare solutions. 
            Our experienced team of doctors specializes in constitutional homeopathy to treat the root cause 
            of your health concerns.
          </Text>
        </Surface>
      </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { alignItems: 'center', paddingTop: 40, paddingBottom: 40, backgroundColor: COLORS.white },
  logo: { width: 120, height: 120, marginBottom: 16 },
  title: { fontSize: 24, fontWeight: '700', color: COLORS.text },
  tagline: { fontSize: 14, color: COLORS.secondary, fontWeight: '600', marginTop: 4 },
  content: { padding: SIZES.padding },
  card: { padding: 20, borderRadius: 20, backgroundColor: COLORS.white, marginBottom: 20, elevation: 2 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: 16 },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  infoText: { fontSize: 15, color: COLORS.text, marginLeft: 16 },
  socialRow: { flexDirection: 'row', justifyContent: 'space-around' },
  socialBtn: { width: 60, height: 60, borderRadius: 30, justifyContent: 'center', alignItems: 'center' },
  aboutText: { fontSize: 14, color: COLORS.muted, lineHeight: 22 },
});

export default HospitalInfo;
