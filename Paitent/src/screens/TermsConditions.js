import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, IconButton } from 'react-native-paper';
import { COLORS, SIZES } from '../constants/theme';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';

const TermsConditions = ({ navigation }) => {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <IconButton
          icon={() => <ChevronLeft size={24} color={COLORS.text} />}
          onPress={() => navigation.goBack()}
        />
        <Text style={styles.headerTitle}>Terms & Privacy</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>1. Privacy Policy</Text>
        <Text style={styles.text}>
          At Spiritual Homeopathy, we prioritize your health and your privacy. This policy explains how we collect, use, and protect your personal information...
        </Text>
        <Text style={styles.text}>
          • We collect health records only to provide better treatment.{"\n"}
          • Your data is encrypted and stored securely.{"\n"}
          • We do not share your private data with third parties.
        </Text>

        <Text style={[styles.title, { marginTop: 24 }]}>2. Booking Terms</Text>
        <Text style={styles.text}>
          Appointments are subject to doctor availability. While we strive to maintain the schedule, medical emergencies may cause slight delays...
        </Text>

        <Text style={[styles.title, { marginTop: 24 }]}>3. Payment Policy</Text>
        <Text style={styles.text}>
          Consultation fees paid through the app are non-refundable but can be adjusted for a rescheduled appointment within 24 hours of notice...
        </Text>
        <Text style={[styles.title, { marginTop: 24 }]}>4. Medical Disclaimer</Text>
        <Text style={styles.text}>
          Spiritual Homeopathy provides natural healing. Results may vary between individuals based on constitution and medical history. Consult your primary physician for emergency medical conditions.
        </Text>

        <Text style={styles.footer}>Last Updated: May 2024</Text>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9'
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: COLORS.text, marginLeft: 4 },
  content: { padding: SIZES.padding },
  title: { fontSize: 18, fontWeight: '800', color: COLORS.text, marginBottom: 12 },
  text: { fontSize: 14, color: COLORS.muted, lineHeight: 22, marginBottom: 16 },
  footer: { textAlign: 'center', color: COLORS.muted, fontSize: 12, marginTop: 40, marginBottom: 20 }
});

export default TermsConditions;
