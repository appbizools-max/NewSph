import { collection, addDoc, doc, setDoc, updateDoc, getDocs, query, where, orderBy, limit, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { TelecallerActivity, TelecallerProfile } from '../types';

/**
 * Log a Telecaller activity into Firestore collection 'telecallerActivities'
 */
export async function logTelecallerActivity(
  activity: Omit<TelecallerActivity, 'id' | 'createdAt' | 'createdAtMs'>,
  customDb?: any
): Promise<string> {
  const activeDb = customDb || db;
  if (!activeDb) {
    console.warn('Cannot log telecaller activity: Firestore db is not initialized.');
    return '';
  }

  try {
    const colRef = collection(activeDb, 'telecallerActivities');
    const now = new Date();
    const docData: any = {
      ...activity,
      createdAt: now.toISOString(),
      createdAtMs: now.getTime(),
      timestamp: serverTimestamp(),
    };

    const docRef = await addDoc(colRef, docData);
    return docRef.id;
  } catch (error) {
    console.error('Error logging telecaller activity:', error);
    return '';
  }
}

/**
 * Fetch telecaller profile by Telecaller ID or phone
 */
export async function getTelecallerByLoginId(
  loginId: string,
  customDb?: any
): Promise<TelecallerProfile | null> {
  const activeDb = customDb || db;
  if (!activeDb) return null;

  const clean = loginId.trim();
  const cleanPhone = clean.replace(/\D/g, '');

  try {
    // 1. Try search by telecallerId (case-insensitive check if possible)
    const q1 = query(collection(activeDb, 'telecallers'), where('telecallerId', '==', clean));
    const snap1 = await getDocs(q1);
    if (!snap1.empty) {
      const d = snap1.docs[0];
      return { id: d.id, ...d.data() } as TelecallerProfile;
    }

    // 2. Try by email
    const qEmail = query(collection(activeDb, 'telecallers'), where('email', '==', clean.toLowerCase()));
    const snapEmail = await getDocs(qEmail);
    if (!snapEmail.empty) {
      const d = snapEmail.docs[0];
      return { id: d.id, ...d.data() } as TelecallerProfile;
    }

    // 3. Try by phone
    if (cleanPhone.length >= 10) {
      const last10 = cleanPhone.slice(-10);
      const qPhone = query(collection(activeDb, 'telecallers'), where('phone', '==', last10));
      const snapPhone = await getDocs(qPhone);
      if (!snapPhone.empty) {
        const d = snapPhone.docs[0];
        return { id: d.id, ...d.data() } as TelecallerProfile;
      }
    }

    // 4. Also check 'staff' collection in case telecallers were added as staff with role='telecaller'
    const qStaff = query(collection(activeDb, 'staff'), where('role', '==', 'telecaller'));
    const snapStaff = await getDocs(qStaff);
    for (const d of snapStaff.docs) {
      const data = d.data();
      if (
        data.telecallerId === clean ||
        data.email?.toLowerCase() === clean.toLowerCase() ||
        (cleanPhone.length >= 10 && data.phone?.replace(/\D/g, '').endsWith(cleanPhone.slice(-10)))
      ) {
        return { id: d.id, ...data, role: 'telecaller' } as TelecallerProfile;
      }
    }

    return null;
  } catch (error) {
    console.error('Error fetching telecaller by login ID:', error);
    return null;
  }
}

