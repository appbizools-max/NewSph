import React, { useState, useEffect, useMemo } from 'react';
import {
  StyleSheet, Text, View, ScrollView, TouchableOpacity,
  Image, TextInput, Alert, Modal, ActivityIndicator, Dimensions, Linking, Platform
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import {
  getSafeDb, collection, doc, onSnapshot, addDoc, query, where, limit
} from '../../../utils/firebaseSafe';
import {
  CleaningSchedule, CleaningSubmission, normalizeBranchName,
  getTodayDateString, formatDisplayDate, checkBranchLockoutStatus
} from '../../../utils/cleaningService';
import { createCleaningUploadedNotificationInFirestore } from '../../../utils/fcmService';

interface CleaningPhotosScreenProps {
  currentBranch?: string;
  onSubmittedSuccess?: () => void;
  isOverdueLocked?: boolean;
}

const { width } = Dimensions.get('window');

export const CleaningPhotosScreen: React.FC<CleaningPhotosScreenProps> = ({
  currentBranch = 'KPHB',
  onSubmittedSuccess,
  isOverdueLocked = false,
}) => {
  const db = getSafeDb();
  const branch = normalizeBranchName(currentBranch);
  const today = getTodayDateString();

  const [schedule, setSchedule] = useState<CleaningSchedule>({
    branch,
    assignedDate: today
  });

  const [submissions, setSubmissions] = useState<CleaningSubmission[]>([]);
  const [loading, setLoading] = useState(true);

  // Upload Form
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Preview Modal
  const [previewImg, setPreviewImg] = useState<string | null>(null);

  // 1. Listen to schedule for this branch
  useEffect(() => {
    if (!db) return;
    const schedRef = doc(db, 'branch_cleaning_schedules', branch);
    const unsub = onSnapshot(schedRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setSchedule({
          branch,
          assignedDate: data.assignedDate || today,
          updatedAt: data.updatedAt,
          updatedBy: data.updatedBy
        });
      } else {
        setSchedule({ branch, assignedDate: today });
      }
    }, (err) => console.warn('Mobile cleaning schedule listener error:', err));
    return () => unsub();
  }, [branch, today]);

  // 2. Listen to submissions for this branch
  useEffect(() => {
    if (!db) return;
    setLoading(true);
    const colRef = collection(db, 'branch_cleaning_submissions');
    const q = query(colRef, where('branch', '==', branch), limit(10));
    const unsub = onSnapshot(q, (snap) => {
      const list: CleaningSubmission[] = snap.docs.map(d => ({
        id: d.id,
        ...(d.data() as any)
      }));
      list.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
      setSubmissions(list);
      setLoading(false);
    }, (err) => {
      console.warn('Mobile cleaning submissions listener error:', err);
      setLoading(false);
    });
    return () => unsub();
  }, [branch]);

  const lockoutInfo = useMemo(() => {
    return checkBranchLockoutStatus(schedule.assignedDate, submissions, new Date());
  }, [schedule.assignedDate, submissions]);

  const activeSubmission = lockoutInfo.currentSubmission;
  const isPendingReview = lockoutInfo.status === 'Pending' || activeSubmission?.status === 'Pending';
  const isApproved = lockoutInfo.status === 'Approved' || activeSubmission?.status === 'Approved';
  const isRejected = lockoutInfo.status === 'Rejected' || activeSubmission?.status === 'Rejected';

  // Pick photos from camera
  const handleTakePhoto = async () => {
    if (selectedPhotos.length >= 7) {
      Alert.alert('Limit Reached', 'Maximum 7 photos allowed per cleaning submission.');
      return;
    }
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission Required', 'Camera permission is needed to photograph clinic cleaning.');
        return;
      }
      const res = await ImagePicker.launchCameraAsync({
        quality: 0.12,
        base64: true,
      });

      if (!res.canceled && res.assets && res.assets[0]) {
        const asset = res.assets[0];
        const dataUri = asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri;
        setSelectedPhotos(prev => [...prev, dataUri].slice(0, 7));
      }
    } catch (e) {
      console.warn('Error taking photo:', e);
      Alert.alert('Error', 'Could not open camera.');
    }
  };

  // Pick photos from gallery
  const handlePickFromGallery = async () => {
    if (selectedPhotos.length >= 7) {
      Alert.alert('Limit Reached', 'Maximum 7 photos allowed per cleaning submission.');
      return;
    }
    try {
      if (Platform.OS === 'ios') {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) {
          Alert.alert(
            'Permission Required',
            'Gallery access in Settings is needed to select clinic photos.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: () => Linking.openSettings() }
            ]
          );
          return;
        }
      } else {
        try {
          const perm = await ImagePicker.getMediaLibraryPermissionsAsync();
          if (!perm.granted && perm.canAskAgain) {
            await ImagePicker.requestMediaLibraryPermissionsAsync();
          }
        } catch (_) {}
      }
      const remaining = 7 - selectedPhotos.length;
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        selectionLimit: remaining,
        quality: 0.12,
        base64: true,
      });

      if (!res.canceled && res.assets && res.assets.length > 0) {
        const uris = res.assets.map(a => a.base64 ? `data:image/jpeg;base64,${a.base64}` : a.uri);
        setSelectedPhotos(prev => [...prev, ...uris].slice(0, 7));
      }
    } catch (e: any) {
      console.warn('Error picking from gallery:', e);
      const isPermError = e?.message?.toLowerCase()?.includes('permission') || e?.code === 'ERR_MISSING_PERMISSION';
      if (isPermError) {
        Alert.alert(
          'Permission Required',
          'Please allow photo gallery access in Settings to select clinic photos.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() }
          ]
        );
      } else {
        Alert.alert('Error', 'Could not access gallery.');
      }
    }
  };

  const handleRemovePhoto = (idx: number) => {
    setSelectedPhotos(prev => prev.filter((_, i) => i !== idx));
  };

  // Submit to HR
  const handleSubmit = async () => {
    if (selectedPhotos.length < 5) {
      Alert.alert(
        'Minimum 5 Photos Required',
        `You have selected ${selectedPhotos.length} photo(s). HR requires between 5 and 7 photos to verify clinic sanitation.`
      );
      return;
    }
    if (selectedPhotos.length > 7) {
      Alert.alert('Too Many Photos', 'Maximum 7 photos allowed. Please remove excess photos.');
      return;
    }

    if (!db) {
      Alert.alert('Database Error', 'Firestore connection unavailable.');
      return;
    }

    setIsSubmitting(true);
    try {
      const docData: Omit<CleaningSubmission, 'id'> = {
        branch,
        assignedDate: schedule.assignedDate || today,
        submittedAt: new Date().toISOString(),
        submittedBy: `${branch} Receptionist`,
        photos: selectedPhotos,
        notes: notes.trim() || 'Weekly clinic sanitation completed and inspected.',
        status: 'Pending',
      };

      const docSize = JSON.stringify(docData).length;
      console.log(`[CleaningPhotos] Submitting ${selectedPhotos.length} photos. Total doc size: ${(docSize / 1024).toFixed(1)} KB`);

      if (docSize > 980000) {
        Alert.alert(
          'Photos Too Large',
          `The selected photos exceed the database upload limit (${(docSize / (1024 * 1024)).toFixed(2)} MB). Please tap 'Clear All' and retake using the Camera or Gallery with automatic compression.`
        );
        setIsSubmitting(false);
        return;
      }

      await addDoc(collection(db, 'branch_cleaning_submissions'), docData);

      // Trigger push notification to HR & Admin
      createCleaningUploadedNotificationInFirestore({
        branch,
        photoCount: selectedPhotos.length,
        submittedBy: `${branch} Receptionist`,
      }).catch(err => console.warn('Cleaning upload notification notice:', err));

      setSelectedPhotos([]);
      setNotes('');
      Alert.alert(
        'Submitted Successfully ✅',
        'Your cleaning photos (5–7) have been submitted to HR / Admin for review. Once accepted, your status will update to Approved.'
      );
      if (onSubmittedSuccess) {
        onSubmittedSuccess();
      }
    } catch (e) {
      console.error('Submission error in mobile:', e);
      Alert.alert('Error', 'Failed to submit cleaning photos. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 50 }} showsVerticalScrollIndicator={false}>
      {/* Top Header */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={styles.iconCircle}>
            <Ionicons name="sparkles" size={22} color="#258ec8" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{branch} Clinic Cleaning</Text>
            <Text style={styles.subtitle}>Weekly 5–7 photos audit & HR verification</Text>
          </View>
        </View>

        {/* Assigned Schedule Pill */}
        <View style={styles.scheduleBadge}>
          <Ionicons name="calendar-outline" size={15} color="#258ec8" />
          <Text style={styles.scheduleBadgeText}>
            Assigned Date: <Text style={{ fontWeight: '900', color: '#0f172a' }}>{formatDisplayDate(schedule.assignedDate)}</Text>
          </Text>
        </View>
      </View>

      {/* OVERDUE LOCKOUT WARNING */}
      {lockoutInfo.isBlocked && (
        <View style={styles.lockoutCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Ionicons name="alert-circle" size={22} color="#dc2626" />
            <Text style={styles.lockoutTitle}>🚨 Overdue: Clinic Cleaning Required</Text>
          </View>
          <Text style={styles.lockoutBody}>
            {lockoutInfo.reason}
          </Text>
          <Text style={styles.lockoutSub}>
            {isPendingReview
              ? 'Photos have been submitted and are currently awaiting HR / Admin review. Reception will unlock immediately once approved.'
              : 'Upload 5 to 7 clean clinic photos below to request unblocking from HR.'}
          </Text>
        </View>
      )}

      {/* STATUS CARD */}
      <View style={styles.card}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <View>
            <Text style={styles.cardHeader}>Verification Status</Text>
            <Text style={{ fontSize: 11.5, color: '#64748b' }}>Scheduled: {formatDisplayDate(schedule.assignedDate)}</Text>
          </View>

          {/* Status Badge */}
          {lockoutInfo.status === 'Approved' && (
            <View style={[styles.statusBadge, { backgroundColor: '#dcfce7', borderColor: '#86efac' }]}>
              <Ionicons name="checkmark-circle" size={14} color="#16a34a" />
              <Text style={[styles.statusText, { color: '#15803d' }]}>Approved ✅</Text>
            </View>
          )}
          {lockoutInfo.status === 'Pending' && (
            <View style={[styles.statusBadge, { backgroundColor: '#fef9c3', borderColor: '#fde047' }]}>
              <Ionicons name="time" size={14} color="#ca8a04" />
              <Text style={[styles.statusText, { color: '#854d0e' }]}>Under Review ⏳</Text>
            </View>
          )}
          {lockoutInfo.status === 'Rejected' && (
            <View style={[styles.statusBadge, { backgroundColor: '#fee2e2', borderColor: '#fca5a5' }]}>
              <Ionicons name="close-circle" size={14} color="#dc2626" />
              <Text style={[styles.statusText, { color: '#b91c1c' }]}>Rejected ❌</Text>
            </View>
          )}
          {lockoutInfo.status === 'Due Today' && (
            <View style={[styles.statusBadge, { backgroundColor: '#fef3c7', borderColor: '#fcd34d' }]}>
              <Ionicons name="alert-circle" size={14} color="#d97706" />
              <Text style={[styles.statusText, { color: '#b45309' }]}>Due Today 📅</Text>
            </View>
          )}
          {lockoutInfo.status === 'Not Submitted' && (
            <View style={[styles.statusBadge, { backgroundColor: '#f1f5f9', borderColor: '#cbd5e1' }]}>
              <Ionicons name="time-outline" size={14} color="#64748b" />
              <Text style={[styles.statusText, { color: '#475569' }]}>Not Uploaded</Text>
            </View>
          )}
        </View>

        {activeSubmission && activeSubmission.status === 'Rejected' && activeSubmission.rejectReason && (
          <View style={styles.rejectNotice}>
            <Text style={{ fontSize: 12.5, color: '#991b1b', fontWeight: '700' }}>
              HR Rejection Reason: "{activeSubmission.rejectReason}"
            </Text>
          </View>
        )}

        {activeSubmission && activeSubmission.status === 'Approved' && (
          <View style={styles.approvedNotice}>
            <Text style={{ fontSize: 12.5, color: '#166534', fontWeight: '700' }}>
              Clinic sanitation was verified and approved by {activeSubmission.reviewedBy || 'HR'}.
            </Text>
          </View>
        )}

        {!activeSubmission && (
          <Text style={{ fontSize: 12.5, color: '#64748b', lineHeight: 18 }}>
            {lockoutInfo.reason}
          </Text>
        )}
      </View>

      {/* UNDER REVIEW NOTICE (Upload is disabled while awaiting HR/Admin review) */}
      {isPendingReview && (
        <View style={styles.card}>
          <View style={{ alignItems: 'center', paddingVertical: 18 }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#fef9c3', alignItems: 'center', justifyContent: 'center', marginBottom: 12, borderWidth: 1, borderColor: '#fde047' }}>
              <Ionicons name="time" size={30} color="#ca8a04" />
            </View>
            <Text style={{ fontSize: 16, fontWeight: '800', color: '#854d0e', marginBottom: 6 }}>
              Photos Under Review by HR ⏳
            </Text>
            <Text style={{ fontSize: 13, color: '#64748b', textAlign: 'center', lineHeight: 19, paddingHorizontal: 16 }}>
              Your cleaning photos ({activeSubmission?.photos?.length || '5–7'} photos) have been submitted and are currently awaiting HR / Admin verification.
            </Text>
            <View style={{ marginTop: 14, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#fefce8', borderRadius: 10, borderWidth: 1, borderColor: '#fef08a' }}>
              <Text style={{ fontSize: 12, color: '#a16207', fontWeight: '800', textAlign: 'center' }}>
                🔒 Upload disabled while under review
              </Text>
              <Text style={{ fontSize: 11, color: '#ca8a04', textAlign: 'center', marginTop: 3 }}>
                If HR rejects, upload will reopen with feedback. Once approved, reception unlocks as normal.
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* PHOTO UPLOAD BOX (5 TO 7 PHOTOS) - Disabled while Pending or Approved; Enabled if Not Submitted, Due Today, or Rejected */}
      {!isPendingReview && !isApproved && (
        <View style={styles.card}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <Text style={styles.cardHeader}>
              {isRejected ? 'Re-upload 5 to 7 Photos' : 'Upload 5 to 7 Photos'}
            </Text>
            <View style={[
              styles.countPill,
              selectedPhotos.length >= 5 && selectedPhotos.length <= 7
                ? { backgroundColor: '#dcfce7', borderColor: '#86efac' }
                : { backgroundColor: '#f1f5f9', borderColor: '#cbd5e1' }
            ]}>
              <Text style={[
                styles.countText,
                selectedPhotos.length >= 5 && selectedPhotos.length <= 7
                  ? { color: '#15803d' }
                  : { color: '#475569' }
              ]}>
                {selectedPhotos.length} / 7 (Min: 5)
              </Text>
            </View>
          </View>

          <Text style={styles.subText}>
            {isRejected
              ? 'HR requested re-upload. Please check feedback above and take 5 to 7 clean clinic photos.'
              : 'Take photos of Consultation Rooms 1 & 2, Waiting Lounge, Doctor Desk, and Medicine Counter.'}
          </Text>

          {/* Action Buttons: Camera & Gallery */}
          <View style={{ flexDirection: 'row', gap: 10, marginVertical: 12 }}>
            <TouchableOpacity
              style={[styles.pickerBtn, { backgroundColor: '#0284c7' }]}
              onPress={handleTakePhoto}
              disabled={selectedPhotos.length >= 7 || isSubmitting}
            >
              <Ionicons name="camera" size={17} color="#ffffff" />
              <Text style={styles.pickerBtnText}>Take Photo</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.pickerBtn, { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#cbd5e1' }]}
              onPress={handlePickFromGallery}
              disabled={selectedPhotos.length >= 7 || isSubmitting}
            >
              <Ionicons name="images" size={17} color="#0284c7" />
              <Text style={[styles.pickerBtnText, { color: '#0284c7' }]}>From Gallery</Text>
            </TouchableOpacity>
          </View>

          {/* Thumbnails preview */}
          {selectedPhotos.length > 0 && (
            <View style={{ marginTop: 6, marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <Text style={{ fontSize: 11.5, color: '#64748b', fontWeight: '700' }}>
                  {selectedPhotos.length} / 7 photos ready
                </Text>
                <TouchableOpacity onPress={() => setSelectedPhotos([])}>
                  <Text style={{ fontSize: 11.5, color: '#ef4444', fontWeight: '800' }}>Clear All</Text>
                </TouchableOpacity>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                {selectedPhotos.map((uri, idx) => (
                  <View key={idx} style={styles.thumbWrap}>
                    <TouchableOpacity onPress={() => setPreviewImg(uri)}>
                      <Image source={{ uri }} style={styles.thumb} />
                    </TouchableOpacity>
                    <View style={styles.thumbBadge}>
                      <Text style={{ color: '#ffffff', fontSize: 10, fontWeight: '800' }}>#{idx + 1}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.thumbDelete}
                      onPress={() => handleRemovePhoto(idx)}
                    >
                      <Ionicons name="close" size={14} color="#ffffff" />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Notes Input */}
          <View style={{ marginTop: 6, marginBottom: 16 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 4 }}>
              Cleaning Notes (Optional):
            </Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="e.g. Deep cleaned clinic rooms and sterilized patient bed..."
              placeholderTextColor="#94a3b8"
              style={styles.textInput}
              multiline
            />
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            style={[
              styles.submitBtn,
              (selectedPhotos.length < 5 || selectedPhotos.length > 7 || isSubmitting) && { backgroundColor: '#94a3b8' }
            ]}
            onPress={handleSubmit}
            disabled={selectedPhotos.length < 5 || selectedPhotos.length > 7 || isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <Ionicons name="cloud-upload-outline" size={18} color="#ffffff" />
                <Text style={styles.submitBtnText}>
                  Submit 5–7 Photos to HR
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* SUBMISSIONS HISTORY */}
      <View style={styles.card}>
        <Text style={styles.cardHeader}>Cleaning Submissions History</Text>
        {loading ? (
          <ActivityIndicator size="small" color="#258ec8" style={{ marginVertical: 20 }} />
        ) : submissions.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 24 }}>
            <Ionicons name="camera-outline" size={32} color="#cbd5e1" />
            <Text style={{ color: '#94a3b8', fontSize: 13, marginTop: 6 }}>No photos submitted yet.</Text>
          </View>
        ) : (
          <View style={{ gap: 12, marginTop: 8 }}>
            {submissions.map((item) => (
              <View
                key={item.id}
                style={[
                  styles.historyItem,
                  item.status === 'Approved' ? { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' } :
                  item.status === 'Rejected' ? { backgroundColor: '#fff1f2', borderColor: '#fecdd3' } :
                  { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' }
                ]}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#1e293b' }}>
                    Scheduled Date: {formatDisplayDate(item.assignedDate)}
                  </Text>
                  <Text style={{
                    fontSize: 11, fontWeight: '800',
                    color: item.status === 'Approved' ? '#15803d' : item.status === 'Rejected' ? '#b91c1c' : '#854d0e'
                  }}>
                    {item.status === 'Approved' ? 'Approved ✅' : item.status === 'Rejected' ? 'Rejected ❌' : 'Pending ⏳'}
                  </Text>
                </View>

                {item.notes ? (
                  <Text style={{ fontSize: 11.5, color: '#475569', marginTop: 4 }}>
                    {item.notes}
                  </Text>
                ) : null}

                {item.status === 'Rejected' && item.rejectReason ? (
                  <Text style={{ fontSize: 11.5, color: '#991b1b', fontWeight: '700', marginTop: 4 }}>
                    Reason: "{item.rejectReason}"
                  </Text>
                ) : null}

                {/* Photos row */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginTop: 8 }}>
                  {item.photos?.map((pUri, pIdx) => (
                    <TouchableOpacity key={pIdx} onPress={() => setPreviewImg(pUri)}>
                      <Image source={{ uri: pUri }} style={styles.historyThumb} />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* FULL PREVIEW MODAL */}
      <Modal visible={!!previewImg} transparent animationType="fade" onRequestClose={() => setPreviewImg(null)}>
        <View style={styles.modalBg}>
          <TouchableOpacity style={styles.modalClose} onPress={() => setPreviewImg(null)}>
            <Ionicons name="close" size={26} color="#ffffff" />
          </TouchableOpacity>
          {previewImg && (
            <Image source={{ uri: previewImg }} style={styles.modalImg} resizeMode="contain" />
          )}
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', paddingHorizontal: 16 },
  header: { marginTop: 14, marginBottom: 16 },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(37, 142, 200, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  subtitle: { fontSize: 12, color: '#64748b', marginTop: 2 },
  scheduleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ffffff',
    alignSelf: 'flex-start',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginTop: 10,
  },
  scheduleBadgeText: { fontSize: 12, color: '#475569', fontWeight: '600' },
  lockoutCard: {
    backgroundColor: '#fef2f2',
    borderWidth: 1.5,
    borderColor: '#ef4444',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
  },
  lockoutTitle: { fontSize: 14.5, fontWeight: '800', color: '#991b1b' },
  lockoutBody: { fontSize: 12.5, color: '#b91c1c', marginTop: 3, lineHeight: 17 },
  lockoutSub: { fontSize: 12, color: '#7f1d1d', fontWeight: '700', marginTop: 5 },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.02,
    shadowRadius: 6,
    elevation: 1,
  },
  cardHeader: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  subText: { fontSize: 12, color: '#64748b', lineHeight: 16, marginTop: 2 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 16,
    borderWidth: 1,
  },
  statusText: { fontSize: 12, fontWeight: '800' },
  rejectNotice: {
    backgroundColor: '#fee2e2',
    padding: 10,
    borderRadius: 8,
    marginTop: 8,
  },
  approvedNotice: {
    backgroundColor: '#dcfce7',
    padding: 10,
    borderRadius: 8,
    marginTop: 8,
  },
  countPill: {
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  countText: { fontSize: 11.5, fontWeight: '800' },
  pickerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  pickerBtnText: { color: '#ffffff', fontWeight: '800', fontSize: 13 },
  thumbWrap: {
    position: 'relative',
    width: 80,
    height: 80,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  thumb: { width: '100%', height: '100%' },
  thumbBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  thumbDelete: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#ef4444',
    borderRadius: 10,
    padding: 2,
  },
  textInput: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    padding: 10,
    fontSize: 13,
    color: '#0f172a',
    minHeight: 50,
  },
  submitBtn: {
    backgroundColor: '#258ec8',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
  },
  submitBtnText: { color: '#ffffff', fontWeight: '800', fontSize: 14 },
  historyItem: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  historyThumb: {
    width: 60,
    height: 60,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalClose: {
    position: 'absolute',
    top: 40,
    right: 20,
    zIndex: 99,
    padding: 8,
  },
  modalImg: {
    width: width * 0.92,
    height: '75%',
  },
});
