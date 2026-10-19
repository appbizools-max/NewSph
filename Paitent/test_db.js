const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const admin = require('firebase-admin');

// Since we are running inside the user's project, let's check if firebase-admin is available or if we can use their firebase config.
// Wait, we can just look at their firebase config in firebase.js.
// Let's initialize admin SDK with local default credentials if possible, or print collections.
try {
  initializeApp({
    credential: admin.credential.applicationDefault()
  });
  const db = getFirestore();
  
  async function run() {
    console.log("--- querying shared_media ---");
    const sharedSnap = await db.collection('shared_media').get();
    sharedSnap.forEach(doc => {
      console.log("Shared Media ID:", doc.id, doc.data());
    });

    console.log("--- querying media_folders ---");
    const foldersSnap = await db.collection('media_folders').get();
    foldersSnap.forEach(doc => {
      console.log("Folder ID:", doc.id, doc.data());
    });

    console.log("--- querying media_items ---");
    const itemsSnap = await db.collection('media_items').get();
    itemsSnap.forEach(doc => {
      console.log("Item ID:", doc.id, doc.data());
    });

    console.log("--- querying patients ---");
    const patientsSnap = await db.collection('patients').get();
    patientsSnap.forEach(doc => {
      console.log("Patient ID:", doc.id, "Name:", doc.data().fullName, "Phone:", doc.data().phone);
    });
  }

  run().catch(console.error);
} catch (e) {
  console.error("Firebase admin init failed:", e);
}
