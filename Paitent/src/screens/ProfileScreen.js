import React, { useState, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, Share, Alert, Platform, Modal, ActivityIndicator, Linking } from 'react-native';
import { Text, Surface, Avatar, IconButton, Badge, Portal, TextInput, Button } from 'react-native-paper';
import { COLORS, SIZES } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import {
  User, Phone, Mail, Calendar, Edit3, 
  Bell, ChevronLeft, ChevronRight, LayoutGrid, 
  History, FileHeart, CreditCard, ShieldCheck, 
  MapPin, HelpCircle, Info, LogOut, FileText, Coins, HeartPulse,
  Stethoscope, Clock, CheckCircle2, AlertCircle, ArrowRight,
  Film, ExternalLink
} from 'lucide-react-native';
import { auth, db } from '../firebase';
import { doc, updateDoc, setDoc, onSnapshot, collection, query, where } from 'firebase/firestore';
import { SafeAreaView } from 'react-native-safe-area-context';
const ProfileScreen = ({ navigation }) => {
  const { userData, user } = useAuth();
  const [editVisible, setEditVisible] = useState(false);
  const [editedName, setEditedName] = useState(userData?.fullName || '');
  const [editedPhone, setEditedPhone] = useState(userData?.phone || '');
  const [editedEmail, setEditedEmail] = useState(userData?.email || '');
  const [loading, setLoading] = useState(false);
  const [rewardPoints, setRewardPoints] = useState(0);

  // Follow-up state
  const [followUps, setFollowUps] = useState([]);
  const [followUpsLoading, setFollowUpsLoading] = useState(true);

  // My Media state (Links shared by doctor from reception media manager)
  const [myMediaVisible, setMyMediaVisible] = useState(false);
  const [myMediaList, setMyMediaList] = useState([]);
  const [mediaLoading, setMediaLoading] = useState(true);

  useEffect(() => {
    if (!auth.currentUser?.uid) return;
    const unsub = onSnapshot(doc(db, 'patients', auth.currentUser.uid), (docSnap) => {
      if (docSnap.exists()) {
        setRewardPoints(docSnap.data().rewardPoints || 0);
      }
    });
    return () => unsub();
  }, []);

  // Real-time Follow-up listener matching user's phone or UID
  useEffect(() => {
    const rawPhone = userData?.phone || user?.phoneNumber || auth.currentUser?.phoneNumber || '';
    const cleanPhone = String(rawPhone).replace(/\D/g, '').slice(-10);
    const uid = auth.currentUser?.uid || user?.uid;

    if (!cleanPhone && !uid) {
      setFollowUpsLoading(false);
      return;
    }

    try {
      const qFollowUp = query(
        collection(db, 'allpatients'),
        where('followUpDate', '!=', '')
      );

      const unsubFollowUps = onSnapshot(qFollowUp, (snap) => {
        const items = [];
        snap.forEach((d) => {
          const data = d.data();
          if (data.isDeleted) return;
          if (data.followUpInterval === 'No Follow-up') return;

          const dPhone = String(data.phone || data.patientPhone || '').replace(/\D/g, '').slice(-10);
          const matchesPhone = cleanPhone && dPhone === cleanPhone;
          const matchesUid = uid && (data.patientId === uid || d.id === uid);

          if (matchesPhone || matchesUid) {
            items.push({
              id: d.id,
              ...data,
              patientName: data.patientName || data.fullName || data.name || userData?.fullName || 'Patient',
              doctorName: data.doctor || data.doctorName || 'Consultant Doctor',
              branchName: data.branchName || data.branch || 'Main Clinic',
              followUpDate: data.followUpDate,
              followUpInterval: data.followUpInterval || 'Standard Review',
              complaint: data.complaint || data.disease || data.subject || '',
              status: data.status || 'scheduled',
            });
          }
        });

        // Sort follow-ups ascending by date
        items.sort((a, b) => new Date(a.followUpDate) - new Date(b.followUpDate));
        setFollowUps(items);
        setFollowUpsLoading(false);
      }, (err) => {
        console.warn('Error fetching follow-ups in profile:', err);
        setFollowUpsLoading(false);
      });

      return () => unsubFollowUps();
    } catch (e) {
      console.warn('Follow-up query error:', e);
      setFollowUpsLoading(false);
    }
  }, [userData, user, auth.currentUser]);

  // Real-time listener for My Media shared by doctor
  useEffect(() => {
    const rawPhone = userData?.phone || user?.phoneNumber || auth.currentUser?.phoneNumber || '';
    const cleanPhone = String(rawPhone).replace(/\D/g, '').slice(-10);
    const uid = auth.currentUser?.uid || user?.uid;

    if (!cleanPhone && !uid) {
      setMediaLoading(false);
      return;
    }

    const itemsMap = new Map();

    const unsubCol = onSnapshot(collection(db, 'shared_patient_media'), (snap) => {
      snap.forEach((d) => {
        const data = d.data();
        const pPhone = String(data.patientPhone || '').replace(/\D/g, '').slice(-10);
        if (pPhone && cleanPhone && pPhone === cleanPhone) {
          itemsMap.set(data.url || d.id, { id: d.id, ...data });
        }
      });
      const arr = Array.from(itemsMap.values());
      arr.sort((a, b) => (b.sharedAt || '').localeCompare(a.sharedAt || ''));
      setMyMediaList(arr);
      setMediaLoading(false);
    }, (err) => console.log('Media listener error:', err));

    let unsubDoc = null;
    if (uid) {
      unsubDoc = onSnapshot(doc(db, 'patients', uid), (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (Array.isArray(data.sharedMedia)) {
            data.sharedMedia.forEach(m => {
              if (m.url) itemsMap.set(m.url, m);
            });
            const arr = Array.from(itemsMap.values());
            arr.sort((a, b) => (b.sharedAt || '').localeCompare(a.sharedAt || ''));
            setMyMediaList(arr);
          }
        }
      }, () => {});
    }

    return () => {
      unsubCol();
      if (unsubDoc) unsubDoc();
    };
  }, [userData?.phone, user?.phoneNumber, auth.currentUser?.uid]);

  const formatFollowUpDate = (dateStr) => {
    if (!dateStr) return 'Date to be confirmed';
    try {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      }
    } catch (e) {}
    return String(dateStr);
  };

  const getFollowUpStatusInfo = (dateStr) => {
    if (!dateStr) return { label: 'Scheduled', color: '#0284c7', bg: '#e0f2fe' };
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const target = new Date(dateStr);
      target.setHours(0, 0, 0, 0);
      
      if (isNaN(target.getTime())) {
        return { label: 'Scheduled', color: '#0284c7', bg: '#e0f2fe' };
      }

      const diffDays = Math.round((target - today) / (1000 * 60 * 60 * 24));
      if (diffDays === 0) {
        return { label: 'Due Today', color: '#b91c1c', bg: '#fee2e2' };
      } else if (diffDays < 0) {
        return { label: 'Review Due', color: '#b45309', bg: '#fef3c7' };
      } else if (diffDays <= 7) {
        return { label: `Due in ${diffDays}d`, color: '#0369a1', bg: '#e0f2fe' };
      } else {
        return { label: 'Upcoming', color: '#15803d', bg: '#dcfce7' };
      }
    } catch (e) {
      return { label: 'Scheduled', color: '#0284c7', bg: '#e0f2fe' };
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Logout', style: 'destructive', onPress: () => auth.signOut() }
      ]
    );
  };

  const handleOpenEditModal = () => {
    setEditedName(resolvedDisplayName);
    setEditedPhone(userData?.phone || user?.phoneNumber?.slice(-10) || '');
    setEditedEmail(userData?.email || '');
    setEditVisible(true);
  };

  const handleUpdateProfile = async () => {
    const cleanName = editedName.trim();
    const cleanMobile = editedPhone.replace(/\D/g, '').slice(-10);
    const cleanEmail = editedEmail.trim();

    if (!cleanName) {
      Alert.alert('Required', 'Please enter your full name');
      return;
    }
    if (!cleanMobile || cleanMobile.length !== 10) {
      Alert.alert('Required', 'Please enter a valid 10-digit mobile number');
      return;
    }

    setLoading(true);
    try {
      const userRef = doc(db, 'patients', auth.currentUser.uid);
      await setDoc(userRef, {
        fullName: cleanName,
        phone: cleanMobile,
        email: cleanEmail,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      setEditVisible(false);
      Alert.alert('Success', 'Profile updated successfully');
    } catch (error) {
      console.error('Update profile error:', error);
      Alert.alert('Error', 'Failed to update profile. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const QuickAccessItem = ({ icon: Icon, label, color, onPress }) => (
    <TouchableOpacity style={styles.quickAccessItem} onPress={onPress}>
      <View style={styles.quickIconContainer}>
        <Icon size={26} color={color} />
      </View>
      <Text style={styles.quickLabel}>{label}</Text>
    </TouchableOpacity>
  );

  const SettingItem = ({ icon: Icon, title, subtitle, color, onPress }) => (
    <TouchableOpacity onPress={onPress} style={styles.settingItem}>
      <View style={styles.settingIconContainer}>
        <Icon size={22} color={color} />
      </View>
      <View style={styles.settingTextContainer}>
        <Text style={styles.settingTitle}>{title}</Text>
        <Text style={styles.settingSubtitle}>{subtitle}</Text>
      </View>
      <ChevronRight size={20} color={COLORS.muted} />
    </TouchableOpacity>
  );

  const resolvedDisplayName = (userData?.fullName && userData.fullName !== 'Patient') 
    ? userData.fullName 
    : (followUps[0]?.patientName || userData?.fullName || 'Guest Patient');

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Custom Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <ChevronLeft size={28} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Profile</Text>
        <View style={{ flexDirection: 'row' }}>
          <IconButton icon={() => <Bell size={24} color={COLORS.text} />} onPress={() => navigation.navigate('Notifications')} />
          {followUps.length > 0 && (
            <Badge size={16} style={styles.badge}>{followUps.length}</Badge>
          )}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Profile Card */}
        <Surface style={styles.profileCard}>
          <View style={styles.avatarContainer}>
            <Avatar.Text 
              size={76} 
              label={resolvedDisplayName.charAt(0)?.toUpperCase() || 'P'} 
              style={styles.avatarBg}
            />
          </View>

          <View style={styles.infoContainer}>
            <View style={styles.nameRow}>
              <Text style={styles.userName} numberOfLines={1}>{resolvedDisplayName}</Text>
              <TouchableOpacity style={styles.editBtn} onPress={handleOpenEditModal}>
                <Edit3 size={14} color={COLORS.secondary} />
                <Text style={styles.editBtnText}>Edit</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.detailRow}>
              <Phone size={14} color={COLORS.muted} />
              <Text style={styles.detailText}>+91 {userData?.phone || user?.phoneNumber?.slice(-10) || '83740 62188'}</Text>
            </View>
            <View style={styles.detailRow}>
              <Mail size={14} color={COLORS.muted} />
              <Text style={styles.detailText} numberOfLines={1}>{userData?.email || 'Not Provided'}</Text>
            </View>
            <View style={styles.detailRow}>
              <Coins size={14} color="#f59e0b" />
              <Text style={[styles.detailText, { color: '#b45309', fontWeight: 'bold' }]}>
                Reward Points: {rewardPoints} pts
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Calendar size={14} color={COLORS.muted} />
              <Text style={styles.detailText}>
                {userData?.createdAt ? new Date(userData.createdAt).toLocaleDateString() : 'Active Member'}
              </Text>
            </View>
          </View>
        </Surface>

        {/* Quick Access */}
        <Text style={styles.sectionTitle}>Quick Access</Text>
        <View style={styles.quickAccessCard}>
          <QuickAccessItem 
            icon={LayoutGrid} 
            label="Appointments" 
            color={COLORS.secondary} 
            onPress={() => navigation.navigate('MyAppointments', { initialTab: 'Upcoming' })}
          />
          <QuickAccessItem 
            icon={History} 
            label="Bookings" 
            color="#10b981" 
            onPress={() => navigation.navigate('MyAppointments', { initialTab: 'History' })}
          />
          <QuickAccessItem 
            icon={FileHeart} 
            label="Records" 
            color="#ef4444" 
            onPress={() => navigation.navigate('Reports')}
          />
          <QuickAccessItem 
            icon={Coins} 
            label="My Wallet" 
            color="#f59e0b" 
            onPress={() => navigation.navigate('WalletDetails')}
          />
        </View>

        {/* Follow-up Section Button Card */}
        <TouchableOpacity 
          style={styles.followUpCardBtn}
          activeOpacity={0.85}
          onPress={() => navigation.navigate('FollowUpScreen')}
        >
          <View style={styles.followUpCardLeft}>
            <View style={styles.followUpIconCircle}>
              <Calendar size={22} color={COLORS.secondary} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={styles.followUpCardTitle}>Follow-up Schedules</Text>
                {followUps.length > 0 && (
                  <View style={styles.cardCountBadge}>
                    <Text style={styles.cardCountText}>{followUps.length} Active</Text>
                  </View>
                )}
              </View>
              <Text style={styles.followUpCardSub}>
                {followUps.length > 0
                  ? `Next: ${formatFollowUpDate(followUps[0].followUpDate)} • ${followUps[0].patientName}`
                  : 'Tap to view doctor review dates & schedules'}
              </Text>
            </View>
          </View>
          <View style={styles.followUpCardRight}>
            <ChevronRight size={22} color={COLORS.secondary} />
          </View>
        </TouchableOpacity>

        {/* Account Settings */}
        <Text style={[styles.sectionTitle, { marginTop: 8 }]}>Account Settings</Text>
        <Surface style={styles.settingsCard}>
          <SettingItem 
            icon={User} 
            title="Personal Information" 
            subtitle="Update your name, mobile and email" 
            color={COLORS.secondary} 
            onPress={handleOpenEditModal} 
          />
          <SettingItem 
            icon={Calendar} 
            title="Follow-up Schedules" 
            subtitle={followUps.length > 0 ? `${followUps.length} follow-up(s) scheduled` : "View doctor review schedules & dates"} 
            color="#0284c7" 
            onPress={() => navigation.navigate('FollowUpScreen')} 
          />
          <SettingItem 
            icon={Coins} 
            title="Reward Wallet" 
            subtitle={`View coupons & ${rewardPoints} points`} 
            color="#f59e0b" 
            onPress={() => navigation.navigate('WalletDetails')} 
          />
          <SettingItem 
            icon={HeartPulse} 
            title="Diet Plan" 
            subtitle="View your customized diet plans" 
            color="#ec4899" 
            onPress={() => navigation.navigate('DietPlan')} 
          />
          <SettingItem 
            icon={FileText} 
            title="Medicine Forms" 
            subtitle="View and download medicine forms" 
            color="#ec4899" 
            onPress={() => navigation.navigate('MedicineFormView')} 
          />
          <SettingItem 
            icon={Film} 
            title="My Media" 
            subtitle={myMediaList.length > 0 ? `${myMediaList.length} media link(s) shared by doctor` : "Educational guides, exercises & clinical links"} 
            color="#0284c7" 
            onPress={() => setMyMediaVisible(true)} 
          />
          <SettingItem 
            icon={ShieldCheck} 
            title="Privacy & Security" 
            subtitle="Manage your account security" 
            color="#10b981" 
            onPress={() => {}} 
          />
          <SettingItem 
            icon={Bell} 
            title="Notifications" 
            subtitle="Manage notification preferences" 
            color="#f59e0b" 
            onPress={() => navigation.navigate('Notifications')} 
          />
          <SettingItem 
            icon={MapPin} 
            title="Saved Addresses" 
            subtitle="Manage your saved addresses" 
            color="#6366f1" 
            onPress={() => {}} 
          />
          <SettingItem 
            icon={HelpCircle} 
            title="Help & Support" 
            subtitle="Get help and contact support" 
            color={COLORS.secondary} 
            onPress={() => navigation.navigate('HelpSupport')} 
          />
          <SettingItem 
            icon={Info} 
            title="About Us" 
            subtitle="Learn more about our app" 
            color="#64748b" 
            onPress={() => navigation.navigate('TermsConditions')} 
          />
        </Surface>

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <LogOut size={20} color="#ef4444" />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>

        <View style={styles.footerSpacing} />
      </ScrollView>

      {/* Edit Profile Modal */}
      <Modal 
        visible={editVisible} 
        transparent={true}
        animationType="slide"
        onRequestClose={() => setEditVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <Surface style={styles.modal}>
            <Text style={styles.modalTitle}>Edit Profile</Text>
            
            <TextInput
              label="Full Name *"
              value={editedName}
              onChangeText={setEditedName}
              mode="outlined"
              style={styles.modalInput}
              outlineColor="#e2e8f0"
              activeOutlineColor={COLORS.secondary}
              placeholder="Enter your full name"
            />

            <TextInput
              label="Mobile Number *"
              value={editedPhone}
              onChangeText={(txt) => setEditedPhone(txt.replace(/\D/g, '').slice(0, 10))}
              mode="outlined"
              style={styles.modalInput}
              outlineColor="#e2e8f0"
              activeOutlineColor={COLORS.secondary}
              keyboardType="phone-pad"
              maxLength={10}
              left={<TextInput.Affix text="+91 " />}
              placeholder="10-digit mobile"
            />

            <TextInput
              label="Email Address"
              value={editedEmail}
              onChangeText={setEditedEmail}
              mode="outlined"
              style={styles.modalInput}
              outlineColor="#e2e8f0"
              activeOutlineColor={COLORS.secondary}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholder="example@gmail.com"
            />

            <Button 
              mode="contained" 
              onPress={handleUpdateProfile} 
              loading={loading}
              disabled={loading}
              style={styles.saveBtn}
              buttonColor={COLORS.secondary}
            >
              Save Changes
            </Button>
            <Button onPress={() => setEditVisible(false)} textColor={COLORS.muted}>
              Cancel
            </Button>
          </Surface>
        </View>
      </Modal>

      {/* My Media Modal */}
      <Modal
        visible={myMediaVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setMyMediaVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <Surface style={[styles.modal, { maxHeight: '82%', padding: 20 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#e0f2fe', justifyContent: 'center', alignItems: 'center' }}>
                  <Film size={20} color="#0284c7" />
                </View>
                <View>
                  <Text style={{ fontSize: 17, fontWeight: '800', color: COLORS.text }}>My Media</Text>
                  <Text style={{ fontSize: 11, color: '#64748b' }}>Videos, guides & links shared by your doctor</Text>
                </View>
              </View>
              <IconButton icon="close" size={22} onPress={() => setMyMediaVisible(false)} />
            </View>

            {mediaLoading ? (
              <ActivityIndicator size="small" color={COLORS.secondary} style={{ padding: 30 }} />
            ) : myMediaList.length === 0 ? (
              <View style={{ padding: 26, alignItems: 'center' }}>
                <Film size={36} color="#cbd5e1" style={{ marginBottom: 10 }} />
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#1e293b', marginBottom: 4 }}>No Media Links Shared Yet</Text>
                <Text style={{ fontSize: 11.5, color: '#64748b', textAlign: 'center', lineHeight: 17 }}>
                  When your doctor shares diet videos, exercises, or clinical links during your consultation, they will appear here.
                </Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 380 }}>
                <View style={{ gap: 10 }}>
                  {myMediaList.map((item, idx) => (
                    <View key={item.id || idx} style={{
                      backgroundColor: '#f8fafc',
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: '#e2e8f0',
                      padding: 12,
                      gap: 5
                    }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <Text style={{ fontSize: 13.5, fontWeight: '800', color: '#0f172a', flex: 1 }}>
                          {item.title || 'Educational Link'}
                        </Text>
                        {item.category && (
                          <View style={{ backgroundColor: '#e0f2fe', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5 }}>
                            <Text style={{ fontSize: 9.5, fontWeight: '700', color: '#0284c7' }}>
                              {item.category}
                            </Text>
                          </View>
                        )}
                      </View>

                      {item.notes ? (
                        <Text style={{ fontSize: 11.5, color: '#475569', lineHeight: 16 }}>{item.notes}</Text>
                      ) : null}

                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#f1f5f9' }}>
                        <Text style={{ fontSize: 10.5, color: '#64748b' }}>
                          {item.doctorName ? `By ${item.doctorName}` : 'Shared by Clinic'}
                        </Text>

                        <TouchableOpacity
                          onPress={() => Linking.openURL(item.url).catch(() => Alert.alert('Invalid Link', item.url))}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 4,
                            backgroundColor: COLORS.secondary,
                            paddingHorizontal: 10,
                            paddingVertical: 5,
                            borderRadius: 6
                          }}
                        >
                          <ExternalLink size={12} color="#ffffff" />
                          <Text style={{ fontSize: 11, fontWeight: '700', color: '#ffffff' }}>Open Media</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              </ScrollView>
            )}

            <Button
              mode="outlined"
              onPress={() => setMyMediaVisible(false)}
              style={{ marginTop: 12, borderColor: '#cbd5e1' }}
              textColor="#475569"
            >
              Close
            </Button>
          </Surface>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fcfdfe' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#1e293b' },
  badge: { position: 'absolute', top: 4, right: 4, backgroundColor: '#ef4444' },
  content: { padding: 16 },
  profileCard: {
    padding: 16,
    borderRadius: 20,
    backgroundColor: '#eff6ff',
    flexDirection: 'row',
    marginBottom: 20,
    elevation: 0,
    borderWidth: 1,
    borderColor: '#dbeafe',
  },
  avatarContainer: { position: 'relative' },
  avatarBg: { backgroundColor: COLORS.white, borderWidth: 1.5, borderColor: COLORS.secondary },
  cameraBtn: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: COLORS.secondary,
    padding: 5,
    borderRadius: 15,
    elevation: 2,
  },
  infoContainer: { flex: 1, marginLeft: 12 },
  nameRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  userName: { fontSize: 16, fontWeight: '800', color: '#1e293b', flex: 1 },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginLeft: 8
  },
  editBtnText: { fontSize: 10, fontWeight: '700', color: COLORS.secondary, marginLeft: 4 },
  detailRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  detailText: { fontSize: 13, color: '#64748b', marginLeft: 8, fontWeight: '500' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1e293b', marginBottom: 12, marginTop: 8 },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    marginTop: 8,
  },
  countBadge: {
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  countBadgeText: { fontSize: 11, fontWeight: '700', color: '#0284c7' },
  quickAccessCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    marginBottom: 20,
  },
  quickAccessItem: { alignItems: 'center', width: '22%' },
  quickIconContainer: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  quickLabel: { fontSize: 10, color: '#64748b', textAlign: 'center', fontWeight: '600' },
  
  // Follow-up Section Button Styles
  followUpCardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.white,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#e0f2fe',
    marginBottom: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
  },
  followUpCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  followUpIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#eff6ff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  followUpCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1e293b',
  },
  cardCountBadge: {
    backgroundColor: '#dbeafe',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  cardCountText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0284c7',
  },
  followUpCardSub: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  followUpCardRight: {
    padding: 4,
  },

  // Follow-up Section Styles
  followUpsList: { marginBottom: 20 },
  followUpCard: {
    borderRadius: 18,
    backgroundColor: COLORS.white,
    padding: 14,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    borderWidth: 1,
    borderColor: '#e0f2fe',
  },
  fupHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    marginBottom: 10,
  },
  fupProfileBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f9ff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    flex: 1,
    marginRight: 8,
  },
  fupProfileLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0369a1',
    marginLeft: 5,
  },
  fupProfileName: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0c4a6e',
    marginLeft: 4,
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  fupBody: {
    marginBottom: 12,
  },
  fupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 7,
  },
  fupIconWrapper: {
    width: 26,
    height: 26,
    borderRadius: 7,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 9,
  },
  fupDateText: {
    fontSize: 13,
    color: '#475569',
  },
  fupIntervalText: {
    fontSize: 11,
    color: '#0284c7',
    fontWeight: '700',
    marginTop: 1,
  },
  fupDetailText: {
    fontSize: 13,
    color: '#64748b',
    flex: 1,
  },
  complaintTag: {
    backgroundColor: '#f8fafc',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  complaintTagText: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
  },
  bookFupBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0f9ff',
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#bae6fd',
    gap: 6,
  },
  bookFupBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.secondary,
  },
  loadingContainer: {
    padding: 20,
    borderRadius: 16,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  loadingText: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 8,
    fontWeight: '500',
  },
  emptyFupCard: {
    borderRadius: 18,
    backgroundColor: COLORS.white,
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderStyle: 'dashed',
  },
  emptyIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#eff6ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  emptyFupTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 4,
  },
  emptyFupSubtitle: {
    fontSize: 12,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 17,
    marginBottom: 14,
    paddingHorizontal: 10,
  },
  emptyBookBtn: {
    backgroundColor: COLORS.secondary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  emptyBookBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.white,
  },

  settingsCard: {
    borderRadius: 24,
    backgroundColor: COLORS.white,
    padding: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 15,
    marginBottom: 24,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  settingIconContainer: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  settingTextContainer: { flex: 1, marginLeft: 16 },
  settingTitle: { fontSize: 15, fontWeight: '600', color: '#1e293b' },
  settingSubtitle: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.white,
    paddingVertical: 16,
    borderRadius: 16,
    elevation: 1,
    borderWidth: 1,
    borderColor: '#fee2e2',
  },
  logoutText: { fontSize: 16, fontWeight: '700', color: '#ef4444', marginLeft: 10 },
  footerSpacing: { height: 40 },
  modal: { backgroundColor: COLORS.white, padding: 24, margin: 20, borderRadius: 24, width: '90%', alignSelf: 'center' },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#1e293b', marginBottom: 20 },
  modalInput: { marginBottom: 16, backgroundColor: COLORS.white },
  saveBtn: { marginTop: 8, marginBottom: 8, borderRadius: 12 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default ProfileScreen;

