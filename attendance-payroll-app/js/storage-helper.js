// ============================================================
// FILE UPLOAD HELPER
// Uploads to Firebase Storage in production mode.
// In DEMO MODE (no Firebase keys yet) files are converted to a
// base64 data URL so uploads still "work" for local testing —
// swap in real keys and this becomes a real Storage upload with
// zero changes needed elsewhere in the app.
// ============================================================

import { storage, FIREBASE_CONFIGURED } from "./firebase-config.js";
import {
  ref,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

const DEMO_MODE = !FIREBASE_CONFIGURED;

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Uploads a File object and returns a usable URL.
 * @param {File} file
 * @param {string} path e.g. `documents/EMP0001/photo.jpg`
 */
export async function uploadFile(file, path) {
  if (!file) return null;
  if (DEMO_MODE) {
    return await fileToDataUrl(file);
  }
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  return await getDownloadURL(storageRef);
}
