import React, { useState } from 'react';
import {
  Search,
  Trash2,
  AlertTriangle,
  User,
  Phone,
  Building2,
  Calendar,
  Clock,
  CheckCircle2,
  RefreshCw,
  Info,
  ShieldAlert,
  Image as ImageIcon
} from 'lucide-react';
import {
  collection,
  query,
  where,
  getDocs,
  deleteDoc,
  doc,
  limit
} from 'firebase/firestore';
import { getStorage, ref as storageRef, deleteObject } from 'firebase/storage';
import { db } from '@app/shared';

export interface PatientProfileItem {
  id: string; // Document ID
  collectionName: 'patients' | 'allpatients' | 'appointments' | 'patient_profiles';
  name: string;
  phone: string;
  regId: string;
  branch: string;
  age?: string | number;
  gender?: string;
  appointmentDate?: string;
  doctorName?: string;
  status?: string;
  raw?: any;
}

interface DeletePatientProfilesProps {
  currentBranch?: string;
  role?: string;
}

// Helper: Safely formats Firestore Timestamp, Date, or string to YYYY-MM-DD
const formatFirestoreDate = (val: any): string => {
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (typeof val.toDate === 'function') {
    try {
      return val.toDate().toISOString().split('T')[0];
    } catch (_) {}
  }
  if (typeof val === 'object' && val.seconds !== undefined) {
    try {
      return new Date(val.seconds * 1000).toISOString().split('T')[0];
    } catch (_) {}
  }
  if (val instanceof Date) {
    try {
      return val.toISOString().split('T')[0];
    } catch (_) {}
  }
  return '';
};

// Helper: Extracts all Storage image URLs from any document
const extractStorageImageUrls = (data: any): string[] => {
  if (!data) return [];
  const urls: string[] = [];
  const checkAndAdd = (val: any) => {
    if (!val) return;
    if (typeof val === 'string' && val.includes('firebasestorage.googleapis.com')) {
      urls.push(val.trim());
    } else if (Array.isArray(val)) {
      val.forEach(v => checkAndAdd(v));
    } else if (typeof val === 'object') {
      const u = val.url || val.imageUrl || val.fileUrl || val.uri || val.downloadURL || val.prescriptionUrl;
      if (u) checkAndAdd(u);
    }
  };

  checkAndAdd(data.uploadedPrescriptions);
  checkAndAdd(data.prescriptionUrls);
  checkAndAdd(data.prescriptionUrl);
  checkAndAdd(data.prescriptionImage);
  checkAndAdd(data.prescriptionImages);
  checkAndAdd(data.canvasPrescriptionUrl);
  checkAndAdd(data.canvasUrl);
  checkAndAdd(data.reports);
  checkAndAdd(data.images);
  checkAndAdd(data.rxUrl);
  checkAndAdd(data.rxUrls);

  return Array.from(new Set(urls.filter(Boolean)));
};

// Helper: Safely deletes a file from Firebase Storage
const deleteStorageFileByUrl = async (url: string) => {
  if (!url || !url.includes('firebasestorage.googleapis.com')) return;
  try {
    const storage = getStorage();
    const match = url.match(/\/o\/([^?]+)/);
    if (match && match[1]) {
      const filePath = decodeURIComponent(match[1]);
      const fileRef = storageRef(storage, filePath);
      await deleteObject(fileRef).catch(() => {});
    }
  } catch (_) { }
};

export const DeletePatientProfiles: React.FC<DeletePatientProfilesProps> = () => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchedNumber, setSearchedNumber] = useState('');
  const [profiles, setProfiles] = useState<PatientProfileItem[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Confirmation modal state for individual deletion
  const [profileToDelete, setProfileToDelete] = useState<PatientProfileItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Search profiles matching the phone number across all collections with fast indexed queries
  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const cleanDigits = phoneNumber.replace(/\D/g, '');
    if (cleanDigits.length < 10) {
      setErrorMessage('Please enter a valid 10-digit phone number.');
      return;
    }

    setErrorMessage('');
    setSuccessMessage('');
    setIsSearching(true);
    setHasSearched(false);

    try {
      const tenDigit = cleanDigits.slice(-10);
      const phoneVariants = Array.from(new Set([
        tenDigit,
        `+91${tenDigit}`,
        `+91 ${tenDigit}`,
        `91${tenDigit}`,
        `0${tenDigit}`,
        cleanDigits
      ])).filter(Boolean);

      // Fast parallel queries using 'in' operator and limit(15) across collections
      const queryPromises = [
        // 'patients' collection (index 0, 1)
        getDocs(query(collection(db, 'patients'), where('phone', 'in', phoneVariants), limit(15))).catch(() => null),
        getDocs(query(collection(db, 'patients'), where('phoneNumber', 'in', phoneVariants), limit(15))).catch(() => null),

        // 'allpatients' collection (index 2, 3)
        getDocs(query(collection(db, 'allpatients'), where('phone', 'in', phoneVariants), limit(15))).catch(() => null),
        getDocs(query(collection(db, 'allpatients'), where('phoneNumber', 'in', phoneVariants), limit(15))).catch(() => null),

        // 'appointments' collection (index 4, 5)
        getDocs(query(collection(db, 'appointments'), where('phone', 'in', phoneVariants), limit(15))).catch(() => null),
        getDocs(query(collection(db, 'appointments'), where('phoneNumber', 'in', phoneVariants), limit(15))).catch(() => null),

        // 'patient_profiles' collection (index 6, 7)
        getDocs(query(collection(db, 'patient_profiles'), where('phone', 'in', phoneVariants), limit(15))).catch(() => null),
        getDocs(query(collection(db, 'patient_profiles'), where('phoneNumber', 'in', phoneVariants), limit(15))).catch(() => null)
      ];

      const results = await Promise.all(queryPromises);

      const items: PatientProfileItem[] = [];
      const seenDocKeys = new Set<string>();

      results.forEach((snap, index) => {
        if (!snap || snap.empty) return;

        // Determine collection name by index
        let col: 'patients' | 'allpatients' | 'appointments' | 'patient_profiles' = 'patients';
        if (index >= 2 && index < 4) col = 'allpatients';
        if (index >= 4 && index < 6) col = 'appointments';
        if (index >= 6) col = 'patient_profiles';

        snap.docs.forEach((docSnap) => {
          const key = `${col}_${docSnap.id}`;
          if (seenDocKeys.has(key)) return;
          seenDocKeys.add(key);

          const d = docSnap.data();
          const cleanP = String(d.phoneNumber || d.phone || d.mobile || '').trim();
          const pName = typeof d.patientName === 'string' ? d.patientName : (typeof d.name === 'string' ? d.name : (typeof d.fullName === 'string' ? d.fullName : 'Unnamed Patient'));
          const regId = String(d.registrationId || d.regId || d.regNo || d.patientId || docSnap.id);
          const branch = typeof d.branch === 'string' ? d.branch : (typeof d.branchName === 'string' ? d.branchName : 'Not Specified');
          const doctorName = typeof d.doctorName === 'string' ? d.doctorName : (typeof d.doctor === 'string' ? d.doctor : '');
          const age = typeof d.age === 'number' || typeof d.age === 'string' ? d.age : (typeof d.patientAge === 'number' || typeof d.patientAge === 'string' ? d.patientAge : '');
          const gender = typeof d.gender === 'string' ? d.gender : '';
          const appointmentDate = formatFirestoreDate(d.appointmentDate || d.date || d.createdAt);

          items.push({
            id: docSnap.id,
            collectionName: col,
            name: pName,
            phone: cleanP || tenDigit,
            regId,
            branch,
            age,
            gender,
            appointmentDate,
            doctorName,
            status: typeof d.status === 'string' ? d.status : '',
            raw: d
          });
        });
      });

      setProfiles(items);
      setSearchedNumber(tenDigit);
      setHasSearched(true);
    } catch (err: any) {
      console.error('Error searching profiles by phone:', err);
      setErrorMessage(err?.message || 'Failed to search patient profiles. Please try again.');
    } finally {
      setIsSearching(false);
    }
  };

  // Perform single individual deletion with COMPLETE DEEP PURGE (documents, visits, prescriptions, and cloud images)
  const confirmIndividualDelete = async () => {
    if (!profileToDelete) return;

    setIsDeleting(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const deletedName = profileToDelete.name;
      const deletedId = profileToDelete.regId;
      const targetDocId = profileToDelete.id;
      const targetNameLower = (profileToDelete.name || '').trim().toLowerCase();
      const targetPhoneClean = (profileToDelete.phone || searchedNumber || '').replace(/\D/g, '').slice(-10);
      const targetRegClean = (profileToDelete.regId || '').trim();

      const phoneVariants = Array.from(new Set([
        targetPhoneClean,
        `+91${targetPhoneClean}`,
        `+91 ${targetPhoneClean}`,
        `91${targetPhoneClean}`,
        `0${targetPhoneClean}`
      ])).filter(Boolean);

      const regVariants = Array.from(new Set([
        targetRegClean,
        targetRegClean.toUpperCase(),
        targetRegClean.toLowerCase()
      ])).filter(r => r && r.length > 2 && !r.startsWith('temp_'));

      // 1. Gather all documents to delete and extract all cloud storage images
      const docsToDelete: Array<{ col: string; id: string }> = [
        { col: profileToDelete.collectionName, id: targetDocId }
      ];
      const imageUrlsToDelete: Set<string> = new Set(extractStorageImageUrls(profileToDelete.raw));

      // Collections to deeply purge
      const collectionsToScan = [
        'appointments',
        'allpatients',
        'patients',
        'patient_profiles',
        'prescriptions',
        'followups',
        'product_bills',
        'alltransactions',
        'package_members'
      ];

      // Scan each collection by phone and registrationId
      for (const colName of collectionsToScan) {
        try {
          const queries: any[] = [];
          for (const pv of phoneVariants) {
            queries.push(
              getDocs(query(collection(db, colName), where('phone', '==', pv))).catch(() => null),
              getDocs(query(collection(db, colName), where('phoneNumber', '==', pv))).catch(() => null),
              getDocs(query(collection(db, colName), where('patientPhone', '==', pv))).catch(() => null)
            );
          }
          for (const rv of regVariants) {
            queries.push(
              getDocs(query(collection(db, colName), where('registrationId', '==', rv))).catch(() => null),
              getDocs(query(collection(db, colName), where('regId', '==', rv))).catch(() => null),
              getDocs(query(collection(db, colName), where('regNo', '==', rv))).catch(() => null),
              getDocs(query(collection(db, colName), where('patientId', '==', rv))).catch(() => null)
            );
          }

          const snaps = await Promise.all(queries);
          snaps.forEach((snap: any) => {
            if (!snap || snap.empty) return;
            snap.docs.forEach((docSnap: any) => {
              const data = docSnap.data();
              const dName = String(data.patientName || data.name || data.fullName || '').trim().toLowerCase();
              const dReg = String(data.registrationId || data.regId || data.regNo || data.patientId || '').trim();
              const dDocId = docSnap.id;

              // Check if doc belongs to THIS specific patient
              const isDirectMatch = dDocId === targetDocId;
              const isRegMatch = targetRegClean && dReg && (dReg.toLowerCase() === targetRegClean.toLowerCase());
              const isNameMatch = targetNameLower && dName && (dName === targetNameLower);

              if (isDirectMatch || isRegMatch || isNameMatch) {
                // Collect storage images
                extractStorageImageUrls(data).forEach(url => imageUrlsToDelete.add(url));
                // Add doc to deletion queue
                if (!docsToDelete.some(d => d.col === colName && d.id === dDocId)) {
                  docsToDelete.push({ col: colName, id: dDocId });
                }
              }
            });
          });
        } catch (colErr) {
          console.warn(`Error scanning collection ${colName} for purge:`, colErr);
        }
      }

      // 2. Delete all extracted prescription photos & scans from Firebase Cloud Storage
      const imageDeletePromises = Array.from(imageUrlsToDelete).map(url => deleteStorageFileByUrl(url));
      await Promise.all(imageDeletePromises);

      // 3. Delete all matching documents from Firestore
      const docDeletePromises = docsToDelete.map(d =>
        deleteDoc(doc(db, d.col, d.id)).catch(err => {
          console.warn(`Failed to delete doc ${d.id} from ${d.col}:`, err);
          return null;
        })
      );
      await Promise.all(docDeletePromises);

      // 4. Update local profiles list
      setProfiles(prev => prev.filter(p => !(
        p.id === targetDocId ||
        (targetRegClean && p.regId && p.regId.toLowerCase() === targetRegClean.toLowerCase()) ||
        (targetNameLower && p.name && p.name.trim().toLowerCase() === targetNameLower)
      )));
      setProfileToDelete(null);

      setSuccessMessage(
        `Profile "${deletedName}" (${deletedId}) has been COMPLETELY PURGED! Removed ${docsToDelete.length} clinical records across all collections and ${imageUrlsToDelete.size} prescription image files from Firebase Cloud Storage.`
      );
    } catch (err: any) {
      console.error('Failed to complete purge of individual profile:', err);
      setErrorMessage(err?.message || 'Failed to complete purge. Please check permissions and try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Perform complete bulk deep purge of all profiles, visits, prescriptions, and images under this phone number
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);

  const confirmDeleteAllProfiles = async () => {
    if (profiles.length === 0) return;

    setIsDeletingAll(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const targetPhoneClean = searchedNumber.replace(/\D/g, '').slice(-10);
      const phoneVariants = Array.from(new Set([
        targetPhoneClean,
        `+91${targetPhoneClean}`,
        `+91 ${targetPhoneClean}`,
        `91${targetPhoneClean}`,
        `0${targetPhoneClean}`
      ])).filter(Boolean);

      const docsToDelete: Array<{ col: string; id: string }> = profiles.map(p => ({
        col: p.collectionName,
        id: p.id
      }));
      const imageUrlsToDelete: Set<string> = new Set();
      profiles.forEach(p => {
        extractStorageImageUrls(p.raw).forEach(url => imageUrlsToDelete.add(url));
      });

      const collectionsToScan = [
        'appointments',
        'allpatients',
        'patients',
        'patient_profiles',
        'prescriptions',
        'followups',
        'product_bills',
        'alltransactions',
        'package_members'
      ];

      for (const colName of collectionsToScan) {
        try {
          const queries: any[] = [];
          for (const pv of phoneVariants) {
            queries.push(
              getDocs(query(collection(db, colName), where('phone', '==', pv))).catch(() => null),
              getDocs(query(collection(db, colName), where('phoneNumber', '==', pv))).catch(() => null),
              getDocs(query(collection(db, colName), where('patientPhone', '==', pv))).catch(() => null)
            );
          }

          const snaps = await Promise.all(queries);
          snaps.forEach((snap: any) => {
            if (!snap || snap.empty) return;
            snap.docs.forEach((docSnap: any) => {
              const data = docSnap.data();
              extractStorageImageUrls(data).forEach(url => imageUrlsToDelete.add(url));
              if (!docsToDelete.some(d => d.col === colName && d.id === docSnap.id)) {
                docsToDelete.push({ col: colName, id: docSnap.id });
              }
            });
          });
        } catch (colErr) {
          console.warn(`Error scanning collection ${colName} for bulk purge:`, colErr);
        }
      }

      // 1. Delete all images from Firebase Storage
      const imageDeletePromises = Array.from(imageUrlsToDelete).map(url => deleteStorageFileByUrl(url));
      await Promise.all(imageDeletePromises);

      // 2. Delete all documents from Firestore
      const docDeletePromises = docsToDelete.map(d =>
        deleteDoc(doc(db, d.col, d.id)).catch(err => {
          console.warn(`Failed to delete doc ${d.id} from ${d.col}:`, err);
          return null;
        })
      );
      await Promise.all(docDeletePromises);

      const count = profiles.length;
      setProfiles([]);
      setShowDeleteAllConfirm(false);
      setSuccessMessage(
        `All ${count} profiles, ${docsToDelete.length} total clinical & billing records, and ${imageUrlsToDelete.size} prescription image files linked to phone +91 ${searchedNumber} have been completely and permanently purged.`
      );
    } catch (err: any) {
      console.error('Failed to complete bulk purge:', err);
      setErrorMessage(err?.message || 'Failed to complete bulk purge. Please check permissions and try again.');
    } finally {
      setIsDeletingAll(false);
    }
  };

  return (
    <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '20px', padding: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <span style={{
              background: '#fef2f2',
              color: '#dc2626',
              padding: '4px 10px',
              borderRadius: '8px',
              fontSize: '11px',
              fontWeight: 800,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px'
            }}>
              <ShieldAlert size={14} /> HR PROFILE MANAGEMENT
            </span>
            <span style={{
              background: '#eff6ff',
              color: '#0284c7',
              padding: '4px 10px',
              borderRadius: '8px',
              fontSize: '11px',
              fontWeight: 700
            }}>
              SEARCH BY PHONE ONLY
            </span>
          </div>
          <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
            Patient Profile Deletion Management
          </h2>
          <p style={{ fontSize: '12.5px', color: '#64748b', margin: '4px 0 0 0' }}>
            Search using a 10-digit phone number. You can delete any profile individually, or choose to delete all profiles under that number with a single action.
          </p>
        </div>
      </div>

      {/* Info Notice Box */}
      <div style={{
        background: '#f0f9ff',
        border: '1px solid #bae6fd',
        borderRadius: '12px',
        padding: '12px 16px',
        marginBottom: '22px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
      }}>
        <Info size={20} color="#0284c7" style={{ flexShrink: 0 }} />
        <div style={{ fontSize: '12px', color: '#0369a1', lineHeight: '1.5' }}>
          <strong>Deletion Options:</strong> Use <em>"Delete This Profile Only"</em> on any card to remove a single member safely without affecting others, or use <em>"Delete All Profiles"</em> above the results to wipe all profiles linked to this phone number at once.
        </div>
      </div>

      {/* Phone-Only Search Form */}
      <form onSubmit={handleSearch} style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '24px' }}>
        <div style={{ position: 'relative', flex: '1', minWidth: '280px', maxWidth: '450px' }}>
          <div style={{
            position: 'absolute',
            left: '14px',
            top: '50%',
            transform: 'translateY(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            color: '#64748b'
          }}>
            <Phone size={16} />
            <span style={{ fontWeight: 700, fontSize: '12.5px', color: '#334155' }}>+91</span>
          </div>
          <input
            type="tel"
            maxLength={10}
            placeholder="Enter 10-digit mobile number..."
            value={phoneNumber}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, '');
              setPhoneNumber(val);
              if (errorMessage) setErrorMessage('');
            }}
            style={{
              width: '100%',
              padding: '12px 14px 12px 70px',
              border: '1.5px solid #cbd5e1',
              borderRadius: '12px',
              fontSize: '14px',
              fontWeight: 600,
              color: '#0f172a',
              outline: 'none',
              boxSizing: 'border-box'
            }}
          />
        </div>

        <button
          type="submit"
          disabled={isSearching || phoneNumber.length < 10}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px 24px',
            background: phoneNumber.length >= 10 ? '#0284c7' : '#94a3b8',
            color: '#ffffff',
            border: 'none',
            borderRadius: '12px',
            fontSize: '13px',
            fontWeight: 700,
            cursor: phoneNumber.length >= 10 && !isSearching ? 'pointer' : 'not-allowed',
            transition: 'background 0.2s ease',
            boxShadow: phoneNumber.length >= 10 ? '0 2px 6px rgba(2, 132, 199, 0.3)' : 'none'
          }}
        >
          {isSearching ? <RefreshCw size={16} className="animate-spin" /> : <Search size={16} />}
          {isSearching ? 'Searching...' : 'Search Profiles'}
        </button>

        {phoneNumber && (
          <button
            type="button"
            onClick={() => {
              setPhoneNumber('');
              setProfiles([]);
              setHasSearched(false);
              setErrorMessage('');
              setSuccessMessage('');
            }}
            style={{
              padding: '12px 18px',
              background: '#f1f5f9',
              color: '#475569',
              border: '1px solid #cbd5e1',
              borderRadius: '12px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Clear
          </button>
        )}
      </form>

      {/* Success Notification */}
      {successMessage && (
        <div style={{
          background: '#f0fdf4',
          border: '1px solid #86efac',
          borderRadius: '12px',
          padding: '12px 16px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          color: '#166534',
          fontSize: '13px',
          fontWeight: 600
        }}>
          <CheckCircle2 size={18} color="#16a34a" style={{ flexShrink: 0 }} />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Error Notification */}
      {errorMessage && (
        <div style={{
          background: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '12px',
          padding: '12px 16px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          color: '#991b1b',
          fontSize: '13px',
          fontWeight: 600
        }}>
          <AlertTriangle size={18} color="#dc2626" style={{ flexShrink: 0 }} />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Search Results Display */}
      {hasSearched && (
        <div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
            paddingBottom: '12px',
            borderBottom: '1px solid #e2e8f0',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#1e293b', margin: 0 }}>
                Profiles Found for Phone: <span style={{ color: '#0284c7' }}>+91 {searchedNumber}</span>
              </h3>
              <span style={{
                background: profiles.length > 0 ? '#e0f2fe' : '#f1f5f9',
                color: profiles.length > 0 ? '#0369a1' : '#64748b',
                padding: '4px 10px',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: 800
              }}>
                {profiles.length} {profiles.length === 1 ? 'Profile' : 'Profiles'} Found
              </span>
            </div>

            {/* DELETE ALL PROFILES BUTTON */}
            {profiles.length > 1 && (
              <button
                type="button"
                onClick={() => setShowDeleteAllConfirm(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '9px 18px',
                  background: '#dc2626',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '10px',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(220, 38, 38, 0.25)',
                  transition: 'background 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#b91c1c';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#dc2626';
                }}
              >
                <Trash2 size={15} />
                Delete All ({profiles.length}) Profiles
              </button>
            )}
          </div>

          {profiles.length === 0 ? (
            <div style={{
              padding: '40px 20px',
              textAlign: 'center',
              background: '#f8fafc',
              borderRadius: '16px',
              border: '1px dashed #cbd5e1'
            }}>
              <User size={36} color="#94a3b8" style={{ margin: '0 auto 12px auto' }} />
              <div style={{ fontSize: '15px', fontWeight: 700, color: '#334155' }}>
                No patient profiles found for phone +91 {searchedNumber}
              </div>
              <p style={{ fontSize: '12.5px', color: '#64748b', marginTop: '6px' }}>
                Please check the phone number and try searching again.
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
              {profiles.map((p, idx) => (
                <div
                  key={`${p.collectionName}_${p.id}_${idx}`}
                  style={{
                    background: '#ffffff',
                    border: '1.5px solid #e2e8f0',
                    borderRadius: '16px',
                    padding: '18px',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    position: 'relative'
                  }}
                >
                  {/* Card Header */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '10px',
                          background: '#f1f5f9',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#0284c7'
                        }}>
                          <User size={18} />
                        </div>
                        <div>
                          <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                            {p.name}
                          </div>
                          <div style={{ fontSize: '11px', fontWeight: 700, color: '#258ec8' }}>
                            ID: {p.regId}
                          </div>
                        </div>
                      </div>

                      <span style={{
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        color: '#64748b',
                        fontSize: '10px',
                        fontWeight: 700,
                        padding: '2px 6px',
                        borderRadius: '6px',
                        textTransform: 'uppercase'
                      }}>
                        {p.collectionName}
                      </span>
                    </div>

                    {/* Card Meta Details */}
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                      background: '#f8fafc',
                      borderRadius: '10px',
                      padding: '10px 12px',
                      marginTop: '10px',
                      fontSize: '12px',
                      color: '#475569'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Building2 size={13} color="#64748b" />
                        <span><strong>Branch:</strong> {p.branch}</span>
                      </div>
                      {(p.age || p.gender) && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <User size={13} color="#64748b" />
                          <span><strong>Details:</strong> {p.age ? `${p.age} Yrs` : ''} {p.gender ? `(${p.gender})` : ''}</span>
                        </div>
                      )}
                      {p.doctorName && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <User size={13} color="#64748b" />
                          <span><strong>Doctor:</strong> {p.doctorName}</span>
                        </div>
                      )}
                      {p.appointmentDate && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Calendar size={13} color="#64748b" />
                          <span><strong>Date:</strong> {p.appointmentDate}</span>
                        </div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Phone size={13} color="#64748b" />
                        <span><strong>Phone:</strong> {p.phone}</span>
                      </div>
                    </div>
                  </div>

                  {/* Individual Delete Action */}
                  <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #f1f5f9' }}>
                    <button
                      type="button"
                      onClick={() => setProfileToDelete(p)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        padding: '9px 14px',
                        background: '#fef2f2',
                        border: '1.5px solid #fecaca',
                        borderRadius: '10px',
                        color: '#dc2626',
                        fontSize: '12.5px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#dc2626';
                        e.currentTarget.style.color = '#ffffff';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = '#fef2f2';
                        e.currentTarget.style.color = '#dc2626';
                      }}
                    >
                      <Trash2 size={15} />
                      Delete This Profile Only
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Individual Profile Deletion Confirmation Modal */}
      {profileToDelete && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: '20px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '20px',
            maxWidth: '480px',
            width: '100%',
            padding: '26px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
            border: '1px solid #cbd5e1'
          }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: '#fee2e2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#dc2626',
                flexShrink: 0
              }}>
                <AlertTriangle size={22} />
              </div>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#991b1b', margin: 0 }}>
                  Confirm Complete & Deep Profile Purge
                </h3>
                <span style={{ fontSize: '11px', color: '#64748b' }}>
                  Permanently erases profile, visits, prescriptions, remedies, and cloud images
                </span>
              </div>
            </div>

            {/* Profile Summary Box */}
            <div style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '14px',
              marginBottom: '18px'
            }}>
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', marginBottom: '4px' }}>
                {profileToDelete.name}
              </div>
              <div style={{ fontSize: '12px', color: '#475569', marginBottom: '2px' }}>
                <strong>Registration ID:</strong> {profileToDelete.regId}
              </div>
              <div style={{ fontSize: '12px', color: '#475569', marginBottom: '2px' }}>
                <strong>Branch:</strong> {profileToDelete.branch}
              </div>
              <div style={{ fontSize: '12px', color: '#475569' }}>
                <strong>Phone:</strong> +91 {searchedNumber}
              </div>
            </div>

            {/* Warning Text */}
            <div style={{
              background: '#fffbeb',
              border: '1px solid #fde68a',
              borderRadius: '10px',
              padding: '10px 12px',
              marginBottom: '20px',
              fontSize: '12px',
              color: '#92400e',
              lineHeight: '1.4'
            }}>
              <strong>Complete Purge Notice:</strong> This action will permanently erase <strong>{profileToDelete.name}</strong> along with all past appointments, doctor clinical notes, prescriptions, remedies, invoices, and cloud prescription scan photos. Other profiles sharing phone (+91 {searchedNumber}) will remain safe.
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setProfileToDelete(null)}
                style={{
                  padding: '10px 18px',
                  borderRadius: '10px',
                  background: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  color: '#475569',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: isDeleting ? 'not-allowed' : 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={confirmIndividualDelete}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 20px',
                  borderRadius: '10px',
                  background: '#dc2626',
                  border: 'none',
                  color: '#ffffff',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: isDeleting ? 'not-allowed' : 'pointer',
                  boxShadow: '0 2px 6px rgba(220, 38, 38, 0.3)'
                }}
              >
                {isDeleting ? <RefreshCw size={15} className="animate-spin" /> : <Trash2 size={15} />}
                {isDeleting ? 'Purging Everything...' : 'Yes, Completely Purge Profile & Images'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete ALL Profiles Confirmation Modal */}
      {showDeleteAllConfirm && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.7)',
          backdropFilter: 'blur(3px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          padding: '20px'
        }}>
          <div style={{
            background: '#ffffff',
            borderRadius: '20px',
            maxWidth: '520px',
            width: '100%',
            padding: '26px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.25)',
            border: '2px solid #ef4444'
          }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{
                width: '44px',
                height: '44px',
                borderRadius: '12px',
                background: '#fee2e2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#dc2626',
                flexShrink: 0
              }}>
                <Trash2 size={24} />
              </div>
              <div>
                <h3 style={{ fontSize: '17px', fontWeight: 800, color: '#991b1b', margin: 0 }}>
                  Permanently Purge ALL ({profiles.length}) Profiles & Images?
                </h3>
                <span style={{ fontSize: '11.5px', color: '#64748b' }}>
                  Dangerous Action: Complete purge of all data, visits, and images for phone +91 {searchedNumber}
                </span>
              </div>
            </div>

            {/* List of profiles to be deleted */}
            <div style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '12px 14px',
              marginBottom: '16px',
              maxHeight: '180px',
              overflowY: 'auto'
            }}>
              <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: '8px' }}>
                Profiles that will be completely erased ({profiles.length}):
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {profiles.map((p, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12.5px', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <span style={{ fontWeight: 700, color: '#0f172a' }}>{idx + 1}. {p.name}</span>
                    <span style={{ fontSize: '11px', color: '#258ec8', fontWeight: 600 }}>{p.regId} ({p.branch})</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Warning Callout */}
            <div style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '10px',
              padding: '12px',
              marginBottom: '20px',
              fontSize: '12px',
              color: '#991b1b',
              lineHeight: '1.4'
            }}>
              <strong>WARNING:</strong> This action cannot be undone. All <strong>{profiles.length}</strong> patient profiles, all visit history, clinical prescriptions, remedies, invoices, and cloud prescription scan images associated with phone number <strong>+91 {searchedNumber}</strong> will be permanently wiped.
            </div>

            {/* Modal Actions */}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                disabled={isDeletingAll}
                onClick={() => setShowDeleteAllConfirm(false)}
                style={{
                  padding: '10px 18px',
                  borderRadius: '10px',
                  background: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  color: '#475569',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: isDeletingAll ? 'not-allowed' : 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeletingAll}
                onClick={confirmDeleteAllProfiles}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 22px',
                  borderRadius: '10px',
                  background: '#dc2626',
                  border: 'none',
                  color: '#ffffff',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: isDeletingAll ? 'not-allowed' : 'pointer',
                  boxShadow: '0 2px 8px rgba(220, 38, 38, 0.35)'
                }}
              >
                {isDeletingAll ? <RefreshCw size={15} className="animate-spin" /> : <Trash2 size={15} />}
                {isDeletingAll ? 'Purging Everything...' : `Yes, Completely Purge All ${profiles.length} Profiles`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
