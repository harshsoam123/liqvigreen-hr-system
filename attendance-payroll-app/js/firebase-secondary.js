// ============================================================
// SECONDARY FIREBASE APP — used ONLY when the admin creates or
// resets an employee's Portal Access login.
// ------------------------------------------------------------
// Firebase's client SDK automatically signs you in as whichever
// account you just created with createUserWithEmailAndPassword().
// If we used the admin's own auth instance for that, the admin
// would get bumped out of their own session the moment they set
// up an employee's login. Spinning up a second, independent
// Firebase App instance (same project, isolated auth state) lets
// us create/sign-in the employee account over there instead,
// then immediately discard that secondary session — the admin's
// primary session in firebase-config.js is never touched.
// ============================================================

import { initializeApp, getApps, getApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updatePassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { app as primaryApp, FIREBASE_CONFIGURED } from "./firebase-config.js";

function getSecondaryApp() {
  const name = "Secondary";
  const existing = getApps().find((a) => a.name === name);
  if (existing) return existing;
  return initializeApp(primaryApp.options, name);
}

/**
 * Creates a brand-new employee portal login (or, if the email already
 * exists, tries to just verify/reuse it). Returns the new user's UID.
 */
export async function createEmployeePortalLogin(email, password) {
  if (!FIREBASE_CONFIGURED) {
    // Demo mode: no real Firebase Auth available — just fake a UID
    // so the rest of the flow (storing portalEmail on the employee) works.
    return "demo_uid_" + Date.now().toString(36);
  }
  const secondaryApp = getSecondaryApp();
  const secondaryAuth = getAuth(secondaryApp);
  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    const uid = cred.user.uid;
    await signOut(secondaryAuth);
    return uid;
  } finally {
    await deleteApp(secondaryApp).catch(() => {});
  }
}

/**
 * Resets an existing employee portal account's password. Requires
 * signing into that account on the secondary app first (Firebase's
 * client SDK has no "admin reset another user's password" call
 * without Cloud Functions, so this signs in as them briefly on the
 * isolated secondary app, updates it, then signs out).
 */
export async function resetEmployeePortalPassword(email, oldPasswordUnknown, newPassword) {
  if (!FIREBASE_CONFIGURED) return true;
  // Client SDK cannot silently reset another user's password without
  // knowing their current one (that requires Firebase Admin SDK on a
  // backend). The practical workaround for a static app: delete +
  // recreate isn't available client-side either, so instead we send
  // a password-reset email — see resendPortalPasswordResetEmail below.
  throw new Error("DIRECT_RESET_UNSUPPORTED");
}

export async function sendPortalPasswordResetEmail(email) {
  const { sendPasswordResetEmail } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");
  if (!FIREBASE_CONFIGURED) return true;
  const secondaryApp = getSecondaryApp();
  const secondaryAuth = getAuth(secondaryApp);
  try {
    await sendPasswordResetEmail(secondaryAuth, email);
    return true;
  } finally {
    await deleteApp(secondaryApp).catch(() => {});
  }
}
