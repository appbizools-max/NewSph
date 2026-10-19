import React, { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, query, collection, where, getDocs, arrayUnion } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { registerForPushNotificationsAsync } from '../utils/notificationHelper';

const AuthContext = createContext({});

const HOSPITAL_ID = 'sph-main';

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          // In patient app, we check the patients collection
          const docRef = doc(db, `patients`, currentUser.uid);
          let docSnap = await getDoc(docRef);
          let data = null;

          if (docSnap.exists()) {
            data = docSnap.data();
            const cleanAuthPhone = (data?.phone || currentUser.phoneNumber || currentUser.email || '').replace(/\D/g, '').slice(-10);
            if ((data.fullName === 'Patient' || !data.phone) && cleanAuthPhone) {
              try {
                const q = query(collection(db, 'patients'), where('phone', '==', cleanAuthPhone));
                const querySnapshot = await getDocs(q);
                let realName = '';
                let realEmail = '';
                let realLocation = '';
                let realBranchName = '';
                let realBranchId = '';
                
                querySnapshot.forEach(d => {
                  const dData = d.data();
                  if (d.id !== currentUser.uid && dData.fullName && dData.fullName !== 'Patient') {
                    realName = dData.fullName;
                    realEmail = dData.email;
                    realLocation = dData.location;
                    realBranchName = dData.branchName;
                    realBranchId = dData.branchId;
                  }
                });

                const updatedFields = {
                  fullName: realName || currentUser.displayName || 'Patient',
                  phone: cleanAuthPhone,
                  email: realEmail || currentUser.email || data.email || '',
                  location: realLocation || data.location || '',
                  branchId: realBranchId || data.branchId || null,
                  branchName: realBranchName || data.branchName || 'Unknown'
                };
                
                await setDoc(docRef, updatedFields, { merge: true });
                data = { ...data, ...updatedFields };
              } catch (healingErr) {
                console.warn("AuthContext self-healing failed:", healingErr);
              }
            }
          } else {
            // Document does not exist in patients/uid: create it using verified phone and lookup
            const cleanAuthPhone = (currentUser.phoneNumber || currentUser.email || '').replace(/\D/g, '').slice(-10);
            if (cleanAuthPhone) {
              try {
                const q = query(collection(db, 'patients'), where('phone', '==', cleanAuthPhone));
                const querySnapshot = await getDocs(q);
                let realName = '';
                let realEmail = '';
                let realLocation = '';
                let realBranchName = '';
                let realBranchId = '';
                
                querySnapshot.forEach(d => {
                  const dData = d.data();
                  if (d.id !== currentUser.uid && dData.fullName && dData.fullName !== 'Patient') {
                    realName = dData.fullName;
                    realEmail = dData.email;
                    realLocation = dData.location;
                    realBranchName = dData.branchName;
                    realBranchId = dData.branchId;
                  }
                });

                const newFields = {
                  fullName: realName || currentUser.displayName || 'Patient',
                  phone: cleanAuthPhone,
                  email: realEmail || currentUser.email || '',
                  location: realLocation || '',
                  branchId: realBranchId || null,
                  branchName: realBranchName || 'Unknown',
                  rewardPoints: 0,
                  role: 'patient',
                  createdAt: new Date().toISOString()
                };
                
                await setDoc(docRef, newFields);
                data = newFields;
              } catch (createErr) {
                console.warn("AuthContext profile creation failed:", createErr);
              }
            }
          }

          // Unblock navigation immediately
          setUserData(data);
          setLoading(false);

          // Register push notifications asynchronously in the background
          registerForPushNotificationsAsync()
            .then(async (token) => {
              if (token) {
                await setDoc(docRef, { 
                  expoPushToken: token, 
                  expoPushTokens: arrayUnion(token) 
                }, { merge: true });
                console.log("[AuthContext] Successfully background-saved push token:", token);
              }
            })
            .catch((tokenErr) => {
              console.warn("[AuthContext] Background push token registration failed:", tokenErr);
            });

        } catch (error) {
          console.error("Error fetching patient data:", error);
          setLoading(false);
        }
      } else {
        setUserData(null);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, userData, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
