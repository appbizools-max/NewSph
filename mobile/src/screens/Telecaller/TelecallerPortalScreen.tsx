import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TelecallerFollowUpsScreen } from './TelecallerFollowUpsScreen';
import { TelecallerBookAppointmentScreen } from './TelecallerBookAppointmentScreen';
import { TelecallerUpdatesScreen } from './TelecallerUpdatesScreen';

interface TelecallerPortalScreenProps {
  authSession: {
    uid?: string;
    userName?: string;
    staffId?: string;
    branchId?: string;
    branchName?: string;
    branchPhone?: string;
  };
  onSignOut: () => void;
}

type TelecallerTab = 'followups' | 'book' | 'updates';

export const TelecallerPortalScreen: React.FC<TelecallerPortalScreenProps> = ({
  authSession,
  onSignOut
}) => {
  const [activeTab, setActiveTab] = useState<TelecallerTab>('followups');
  const [patientForBooking, setPatientForBooking] = useState<any>(null);

  const telecaller = {
    uid: authSession.uid,
    telecallerId: authSession.staffId || 'TC01',
    name: authSession.userName || 'Telecaller',
    phone: authSession.branchPhone,
    branchId: authSession.branchId
  };

  const handleNavigateToBook = (patientData?: any) => {
    if (patientData) {
      setPatientForBooking(patientData);
    }
    setActiveTab('book');
  };

  const handleBookingCompleted = () => {
    setPatientForBooking(null);
    setActiveTab('updates');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Top Header Bar */}
      <View style={styles.topHeader}>
        <View style={styles.headerLeft}>
          <View style={styles.avatarBox}>
            <Ionicons name="headset" size={20} color="#0284c7" />
          </View>
          <View>
            <Text style={styles.userNameText}>{telecaller.name}</Text>
            <Text style={styles.roleSubText}>Telecaller Portal • {telecaller.telecallerId}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={() => {
            Alert.alert('Sign Out', 'Are you sure you want to log out of the Telecaller Portal?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Log Out', style: 'destructive', onPress: onSignOut }
            ]);
          }}
        >
          <Ionicons name="log-out-outline" size={18} color="#dc2626" />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      {/* Main Tab Content */}
      <View style={styles.contentContainer}>
        {activeTab === 'followups' && (
          <TelecallerFollowUpsScreen
            telecaller={telecaller}
            onNavigateToBookAppointment={handleNavigateToBook}
          />
        )}
        {activeTab === 'book' && (
          <TelecallerBookAppointmentScreen
            telecaller={telecaller}
            initialPatientData={patientForBooking}
            onBookingSuccess={handleBookingCompleted}
          />
        )}
        {activeTab === 'updates' && (
          <TelecallerUpdatesScreen telecaller={telecaller} />
        )}
      </View>

      {/* Bottom Navigation Bar */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.bottomTab, activeTab === 'followups' && styles.bottomTabActive]}
          onPress={() => setActiveTab('followups')}
        >
          <Ionicons
            name={activeTab === 'followups' ? 'call' : 'call-outline'}
            size={22}
            color={activeTab === 'followups' ? '#0284c7' : '#64748b'}
          />
          <Text style={[styles.bottomTabText, activeTab === 'followups' && styles.bottomTabTextActive]}>
            Follow-ups
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.bottomTab, activeTab === 'book' && styles.bottomTabActive]}
          onPress={() => {
            setPatientForBooking(null);
            setActiveTab('book');
          }}
        >
          <Ionicons
            name={activeTab === 'book' ? 'calendar' : 'calendar-outline'}
            size={22}
            color={activeTab === 'book' ? '#0284c7' : '#64748b'}
          />
          <Text style={[styles.bottomTabText, activeTab === 'book' && styles.bottomTabTextActive]}>
            Book Appt
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.bottomTab, activeTab === 'updates' && styles.bottomTabActive]}
          onPress={() => setActiveTab('updates')}
        >
          <Ionicons
            name={activeTab === 'updates' ? 'newspaper' : 'newspaper-outline'}
            size={22}
            color={activeTab === 'updates' ? '#0284c7' : '#64748b'}
          />
          <Text style={[styles.bottomTabText, activeTab === 'updates' && styles.bottomTabTextActive]}>
            Updates
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatarBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#e0f2fe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userNameText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  roleSubText: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    gap: 4,
  },
  logoutText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#dc2626',
  },
  contentContainer: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  bottomBar: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingVertical: 8,
    paddingBottom: 12,
  },
  bottomTab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  bottomTabActive: {},
  bottomTabText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#64748b',
  },
  bottomTabTextActive: {
    color: '#0284c7',
    fontWeight: '700',
  },
});

