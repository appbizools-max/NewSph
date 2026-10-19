import React from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { Text, Surface, IconButton, TextInput, Button } from 'react-native-paper';
import { COLORS, SIZES } from '../constants/theme';
import { SafeAreaView } from 'react-native-safe-area-context';
import { 
  ChevronLeft, Phone, Mail, MessageCircle, 
  MapPin, Globe, Clock, ChevronRight 
} from 'lucide-react-native';

const HelpSupport = ({ navigation }) => {
  const SupportCard = ({ icon: Icon, title, value, color, onPress }) => (
    <TouchableOpacity onPress={onPress}>
      <Surface style={styles.card}>
        <View style={[styles.iconBox, { backgroundColor: color + '10' }]}>
          <Icon size={24} color={color} />
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardValue}>{value}</Text>
        </View>
        <ChevronRight size={20} color={COLORS.muted} />
      </Surface>
    </TouchableOpacity>
  );

  const FAQItem = ({ question }) => (
    <TouchableOpacity style={styles.faqItem}>
      <Text style={styles.faqText}>{question}</Text>
      <ChevronRight size={18} color={COLORS.muted} />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <IconButton 
          icon={() => <ChevronLeft size={24} color={COLORS.text} />} 
          onPress={() => navigation.goBack()} 
        />
        <Text style={styles.headerTitle}>Help & Support</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>Get in Touch</Text>
        <SupportCard 
          icon={Phone} 
          title="Call Us" 
          value="+91 99999 99999" 
          color={COLORS.primary}
          onPress={() => Linking.openURL('tel:+919999999999')}
        />
        <SupportCard 
          icon={Mail} 
          title="Email Support" 
          value="support@sphclinic.com" 
          color={COLORS.secondary}
          onPress={() => Linking.openURL('mailto:support@sphclinic.com')}
        />
        <SupportCard 
          icon={MessageCircle} 
          title="WhatsApp Us" 
          value="Chat with an agent" 
          color="#25D366"
          onPress={() => Linking.openURL('whatsapp://send?phone=+919999999999')}
        />

        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Frequently Asked Questions</Text>
        <Surface style={styles.faqCard}>
          <FAQItem question="How to book an appointment?" />
          <FAQItem question="Where can I find my reports?" />
          <FAQItem question="Can I cancel my booking?" />
          <FAQItem question="What are the consultation fees?" />
        </Surface>

        <Surface style={styles.messageBox}>
          <Text style={styles.msgTitle}>Send us a Message</Text>
          <Text style={styles.msgSubtitle}>We usually respond within 2 hours</Text>
          <TextInput 
            mode="outlined" 
            label="How can we help?" 
            multiline 
            numberOfLines={4}
            style={styles.input}
            outlineColor={COLORS.border}
          />
          <Button mode="contained" style={styles.btn} buttonColor={COLORS.primary}>
            Send Message
          </Button>
        </Surface>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingHorizontal: 8,
    paddingBottom: 10,
    backgroundColor: COLORS.white
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: COLORS.text, marginLeft: 4 },
  content: { padding: SIZES.padding },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: 16 },
  card: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    padding: 16, 
    borderRadius: 16, 
    backgroundColor: COLORS.white, 
    marginBottom: 12,
    elevation: 1,
    borderWidth: 1,
    borderColor: '#f1f5f9'
  },
  iconBox: { width: 48, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  cardInfo: { flex: 1, marginLeft: 16 },
  cardTitle: { fontSize: 12, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  cardValue: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginTop: 2 },
  faqCard: { borderRadius: 16, backgroundColor: COLORS.white, padding: 8, elevation: 1, borderWidth: 1, borderColor: '#f1f5f9' },
  faqItem: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9'
  },
  faqText: { fontSize: 14, color: COLORS.text, fontWeight: '500' },
  messageBox: { marginTop: 32, padding: 20, borderRadius: 24, backgroundColor: COLORS.white, elevation: 4 },
  msgTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  msgSubtitle: { fontSize: 14, color: COLORS.muted, marginBottom: 20 },
  input: { backgroundColor: COLORS.white, marginBottom: 16 },
  btn: { borderRadius: 12, paddingVertical: 4 }
});

export default HelpSupport;
