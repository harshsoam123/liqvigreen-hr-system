// ============================================================
// DATA ACCESS LAYER
// ------------------------------------------------------------
// Wraps Firestore so every page uses the same simple API:
//    dbGetAll(collection)
//    dbGetById(collection, id)
//    dbAdd(collection, data)
//    dbSet(collection, id, data)
//    dbUpdate(collection, id, data)
//    dbDelete(collection, id)
//    dbQuery(collection, [ [field, op, value], ... ])
//
// If js/firebase-config.js has NOT been filled in yet, the app
// automatically falls back to localStorage ("DEMO MODE") so it
// is fully explorable in VS Code Live Server before you connect
// a real Firebase project. Once real keys are added, everything
// transparently switches to Firestore — no other file needs to
// change.
// ============================================================

import { db, FIREBASE_CONFIGURED } from "./firebase-config.js";
import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export const DEMO_MODE = !FIREBASE_CONFIGURED;

// ---------- localStorage demo engine ----------
function lsKey(col) {
  return `demo_${col}`;
}
function lsGetAll(col) {
  return JSON.parse(localStorage.getItem(lsKey(col)) || "[]");
}
function lsSaveAll(col, arr) {
  localStorage.setItem(lsKey(col), JSON.stringify(arr));
}
function lsGenId() {
  return "id_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ---------- Unified API ----------
export async function dbGetAll(col) {
  if (DEMO_MODE) return lsGetAll(col);
  const snap = await getDocs(collection(db, col));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function dbGetById(col, id) {
  if (DEMO_MODE) return lsGetAll(col).find((x) => x.id === id) || null;
  const ref = doc(db, col, id);
  const snap = await getDoc(ref);
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function dbAdd(col, data) {
  if (DEMO_MODE) {
    const all = lsGetAll(col);
    const record = { id: lsGenId(), ...data };
    all.push(record);
    lsSaveAll(col, all);
    return record.id;
  }
  const refDoc = await addDoc(collection(db, col), data);
  return refDoc.id;
}

export async function dbSet(col, id, data) {
  if (DEMO_MODE) {
    const all = lsGetAll(col);
    const idx = all.findIndex((x) => x.id === id);
    if (idx >= 0) all[idx] = { ...all[idx], ...data, id };
    else all.push({ id, ...data });
    lsSaveAll(col, all);
    return;
  }
  // merge:true so setting one set of fields (e.g. payroll structure) never
  // wipes out other fields already saved on the same document (e.g. deduction rules).
  await setDoc(doc(db, col, id), data, { merge: true });
}

export async function dbUpdate(col, id, data) {
  if (DEMO_MODE) {
    const all = lsGetAll(col);
    const idx = all.findIndex((x) => x.id === id);
    if (idx >= 0) all[idx] = { ...all[idx], ...data };
    lsSaveAll(col, all);
    return;
  }
  await updateDoc(doc(db, col, id), data);
}

export async function dbDelete(col, id) {
  if (DEMO_MODE) {
    lsSaveAll(col, lsGetAll(col).filter((x) => x.id !== id));
    return;
  }
  await deleteDoc(doc(db, col, id));
}

// Simple equality-filter query helper: conditions = [["field","==",value], ...]
export async function dbQuery(col, conditions = []) {
  if (DEMO_MODE) {
    let all = lsGetAll(col);
    conditions.forEach(([field, op, value]) => {
      all = all.filter((item) => {
        if (op === "==") return item[field] === value;
        if (op === ">=") return item[field] >= value;
        if (op === "<=") return item[field] <= value;
        return true;
      });
    });
    return all;
  }
  const clauses = conditions.map(([f, op, v]) => where(f, op, v));
  const q = query(collection(db, col), ...clauses);
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
