import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, SafeAreaView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { DoctorDashboardScreen } from './Dashboard/DoctorDashboardScreen';
import { DoctorPatientListScreen } from './PatientList/DoctorPatientListScreen';
import { DoctorPackagesScreen } from './Packages/DoctorPackagesScreen';
import { DoctorTotalRevenueScreen } from './TotalRevenue/DoctorTotalRevenueScreen';
import { DoctorSideDrawer } from './DoctorSideDrawer';

interface DoctorScreenProps {
  doctorCategory?: string;
  doctorName?: string;
  onLogout?: () => void;
  onNavigateTab?: (tab: string, patient?: any) => void;
}

export const DoctorScreen: React.FC<DoctorScreenProps> = ({
  doctorCategory = 'Head Doctor',
  doctorName = 'Dr. Prashanth K Vaidya',
  onLogout,
  onNavigateTab,
}) => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'patients' | 'packages' | 'revenue'>('dashboard');
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('@sph_doctor_tab').then((saved) => {
      if (saved && ['dashboard', 'patients', 'packages', 'revenue'].includes(saved)) {
        setActiveTab(saved as any);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    AsyncStorage.setItem('@sph_doctor_tab', activeTab).catch(() => {});
  }, [activeTab]);

  // Helper to determine if Head Doctor
  const isHeadDoctor = doctorCategory === 'Head Doctor' || doctorName.includes('Prashanth') || doctorName.includes('Rama');

  // Enforce role restriction: If active tab is packages or revenue but not head doctor, fall back to dashboard
  const currentTab = (!isHeadDoctor && (activeTab === 'packages' || activeTab === 'revenue')) ? 'dashboard' : activeTab;

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Top Header Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.menuBtn} onPress={() => setDrawerOpen(true)}>
          <Ionicons name="menu-outline" size={26} color="#0f172a" />
        </TouchableOpacity>

        <View style={styles.headerInfo}>
          <Text style={styles.docTitle} numberOfLines={1}>{doctorName}</Text>
          <Text style={styles.roleSub}>{isHeadDoctor ? 'Head Doctor' : 'Employee Doctor'}</Text>
        </View>

        {onLogout && (
          <TouchableOpacity style={styles.logoutBtn} onPress={onLogout}>
            <Ionicons name="log-out-outline" size={20} color="#ef4444" />
          </TouchableOpacity>
        )}
      </View>

      {/* Active Screen Content */}
      <View style={styles.content}>
        {currentTab === 'dashboard' && (
          <DoctorDashboardScreen
            doctorCategory={doctorCategory}
            doctorName={doctorName}
            onNavigateTab={(tab, patient) => {
              if (onNavigateTab) {
                onNavigateTab(tab, patient);
              } else {
                setActiveTab(tab as any);
              }
            }}
          />
        )}
        {currentTab === 'patients' && (
          <DoctorPatientListScreen
            doctorName={doctorName}
            doctorCategory={doctorCategory}
            onNavigateTab={onNavigateTab}
          />
        )}
        {currentTab === 'packages' && isHeadDoctor && <DoctorPackagesScreen doctorName={doctorName} />}
        {currentTab === 'revenue' && isHeadDoctor && <DoctorTotalRevenueScreen />}
      </View>

      {/* Edge-to-Edge Premium Bottom Navigation Bar */}
      <View style={styles.bottomNavContainer}>
        {/* Dashboard */}
        <TouchableOpacity
          style={styles.bottomTab}
          onPress={() => setActiveTab('dashboard')}
          activeOpacity={0.7}
        >
          <View style={[styles.iconPill, currentTab === 'dashboard' && styles.iconPillActive]}>
            <Ionicons
              name={currentTab === 'dashboard' ? 'grid' : 'grid-outline'}
              size={20}
              color={currentTab === 'dashboard' ? '#0284c7' : '#64748b'}
            />
          </View>
          <Text style={[styles.bottomTabLabel, currentTab === 'dashboard' && styles.bottomTabLabelActive]}>
            Dashboard
          </Text>
        </TouchableOpacity>

        {/* Patient List */}
        <TouchableOpacity
          style={styles.bottomTab}
          onPress={() => setActiveTab('patients')}
          activeOpacity={0.7}
        >
          <View style={[styles.iconPill, currentTab === 'patients' && styles.iconPillActive]}>
            <Ionicons
              name={currentTab === 'patients' ? 'people' : 'people-outline'}
              size={20}
              color={currentTab === 'patients' ? '#0284c7' : '#64748b'}
            />
          </View>
          <Text style={[styles.bottomTabLabel, currentTab === 'patients' && styles.bottomTabLabelActive]}>
            Patient List
          </Text>
        </TouchableOpacity>

        {/* Packages (Head Doctor Only) */}
        {isHeadDoctor && (
          <TouchableOpacity
            style={styles.bottomTab}
            onPress={() => setActiveTab('packages')}
            activeOpacity={0.7}
          >
            <View style={[styles.iconPill, currentTab === 'packages' && styles.iconPillActive]}>
              <Ionicons
                name={currentTab === 'packages' ? 'cube' : 'cube-outline'}
                size={20}
                color={currentTab === 'packages' ? '#0284c7' : '#64748b'}
              />
            </View>
            <Text style={[styles.bottomTabLabel, currentTab === 'packages' && styles.bottomTabLabelActive]}>
              Packages
            </Text>
          </TouchableOpacity>
        )}

        {/* Revenue (Head Doctor Only) */}
        {isHeadDoctor && (
          <TouchableOpacity
            style={styles.bottomTab}
            onPress={() => setActiveTab('revenue')}
            activeOpacity={0.7}
          >
            <View style={[styles.iconPill, currentTab === 'revenue' && styles.iconPillActive]}>
              <Ionicons
                name={currentTab === 'revenue' ? 'stats-chart' : 'stats-chart-outline'}
                size={20}
                color={currentTab === 'revenue' ? '#0284c7' : '#64748b'}
              />
            </View>
            <Text style={[styles.bottomTabLabel, currentTab === 'revenue' && styles.bottomTabLabelActive]}>
              Revenue
            </Text>
          </TouchableOpacity>
        )}

        {/* Logout */}
        {onLogout && (
          <TouchableOpacity
            style={styles.bottomTab}
            onPress={onLogout}
            activeOpacity={0.7}
          >
            <View style={styles.logoutPill}>
              <Ionicons name="log-out" size={20} color="#ef4444" />
            </View>
            <Text style={[styles.bottomTabLabel, { color: '#ef4444', fontWeight: '700' }]}>
              Logout
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Side Navigation Drawer */}
      <DoctorSideDrawer
        visible={drawerOpen}
        activeTab={currentTab}
        onSelectTab={(tab) => setActiveTab(tab as any)}
        onClose={() => setDrawerOpen(false)}
        isHeadDoctor={isHeadDoctor}
        doctorName={doctorName}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f8fafc' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  menuBtn: { padding: 4 },
  headerInfo: { flex: 1, marginLeft: 10, marginRight: 10 },
  docTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  roleSub: { fontSize: 11, color: '#64748b', fontWeight: '600' },
  logoutBtn: { padding: 6, backgroundColor: '#fef2f2', borderRadius: 8 },
  content: { flex: 1 },
  bottomNavContainer: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#cbd5e1',
    paddingVertical: 6,
    paddingHorizontal: 4,
    justifyContent: 'space-around',
    elevation: 10,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  bottomTab: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  iconPill: {
    width: 38,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPillActive: {
    backgroundColor: '#e0f2fe',
  },
  logoutPill: {
    width: 38,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#fef2f2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomTabLabel: {
    fontSize: 11.5,
    color: '#64748b',
    fontWeight: '700',
    marginTop: 2,
  },
  bottomTabLabelActive: {
    color: '#0284c7',
    fontWeight: '900',
  },
});
