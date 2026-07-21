// ============================================================
// FIREBASE CONFIGURATION
// ------------------------------------------------------------
// 1. Go to https://console.firebase.google.com
// 2. Create a project → enable Authentication (Email/Password),
//    Firestore Database, and Storage.
// 3. Project Settings → General → Your apps → Web app → copy config
// 4. Paste your config object below, replacing the placeholder.
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyDjbipXadM-tw57Z8a66_UPjO-EWSXxirE",
  authDomain: "hrautoamtionsystem.firebaseapp.com",
  projectId: "hrautoamtionsystem",
  storageBucket: "hrautoamtionsystem.firebasestorage.app",
  messagingSenderId: "121592958505",
  appId: "1:121592958505:web:aea960d1668376a57f5638",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

setPersistence(auth, browserLocalPersistence).catch((err) =>
  console.error("Auth persistence error:", err)
);

// Flag other modules can check — lets the app run in a harmless
// "demo mode" (using localStorage) until real keys are added.
export const FIREBASE_CONFIGURED = firebaseConfig.apiKey !== "YOUR_API_KEY";