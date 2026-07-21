// ============================================================
// AUTH: login, forgot password, logout, route guard
// ------------------------------------------------------------
// IMPORTANT: employees now have their own real login accounts too
// (Employee Portal). Firebase Auth alone can't tell an admin apart
// from an employee — both are just "a valid signed-in user" to it.
// So this file explicitly checks the `portalLinks` collection
// (written whenever an admin sets up an employee's Portal Access)
// to make sure whoever is signing in here is NOT a portal employee
// before letting them into the admin app.
// ============================================================

import { auth, FIREBASE_CONFIGURED } from "./firebase-config.js";
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { toast, showLoader } from "./utils.js";
import { dbGetById } from "./db.js";

const DEMO_MODE = !FIREBASE_CONFIGURED;
const DEMO_SESSION_KEY = "demo_admin_session";

async function isPortalEmployeeEmail(email) {
  if (!email) return false;
  const link = await dbGetById("portalLinks", email.trim()).catch(() => null);
  return !!link;
}

const EMPLOYEE_ACCOUNT_MESSAGE =
  'This login belongs to an Employee Portal account, not an admin account. Please use the Employee Portal instead.';

// ---------------- LOGIN PAGE ----------------
const loginForm = document.getElementById("login-form");
if (loginForm) {
  // If already logged in, skip straight to dashboard
  if (DEMO_MODE) {
    if (localStorage.getItem(DEMO_SESSION_KEY)) {
      window.location.href = "pages/dashboard.html";
    }
  } else {
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        if (await isPortalEmployeeEmail(user.email)) {
          await signOut(auth);
          return;
        }
        window.location.href = "pages/dashboard.html";
      }
    });
  }

  const errorText = document.getElementById("login-error");
  const togglePwd = document.getElementById("toggle-password");
  const pwdInput = document.getElementById("login-password");
  if (togglePwd) {
    togglePwd.addEventListener("click", () => {
      pwdInput.type = pwdInput.type === "password" ? "text" : "password";
    });
  }

  if (DEMO_MODE) {
    const banner = document.getElementById("demo-banner");
    if (banner) banner.style.display = "block";
  }

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorText.innerHTML = "";
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    showLoader(true);
    try {
      // Block employee accounts from the admin login BEFORE attempting
      // sign-in, in both demo and live mode.
      if (await isPortalEmployeeEmail(email)) {
        errorText.innerHTML = `${EMPLOYEE_ACCOUNT_MESSAGE} <a class="link-primary" href="employee-portal/index.html">Go to Employee Portal →</a>`;
        showLoader(false);
        return;
      }

      if (DEMO_MODE) {
        // Demo mode: accept any email/password combo, or the seeded admin
        await new Promise((r) => setTimeout(r, 500));
        localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify({ email }));
        window.location.href = "pages/dashboard.html";
        return;
      }

      const cred = await signInWithEmailAndPassword(auth, email, password);

      // Double-check post-sign-in too (covers the case where portal
      // access was granted to this email AFTER they last logged in here).
      if (await isPortalEmployeeEmail(cred.user.email)) {
        await signOut(auth);
        errorText.innerHTML = `${EMPLOYEE_ACCOUNT_MESSAGE} <a class="link-primary" href="employee-portal/index.html">Go to Employee Portal →</a>`;
        showLoader(false);
        return;
      }

      window.location.href = "pages/dashboard.html";
    } catch (err) {
      errorText.textContent = friendlyAuthError(err.code);
    } finally {
      showLoader(false);
    }
  });
}

// ---------------- FORGOT PASSWORD PAGE ----------------
const forgotForm = document.getElementById("forgot-form");
if (forgotForm) {
  const msg = document.getElementById("forgot-msg");
  forgotForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("forgot-email").value.trim();
    showLoader(true);
    try {
      if (DEMO_MODE) {
        await new Promise((r) => setTimeout(r, 500));
        msg.textContent = "Demo mode: password reset email simulated (Firebase not connected yet).";
        msg.style.color = "var(--success)";
      } else {
        await sendPasswordResetEmail(auth, email);
        msg.textContent = "Password reset link sent! Check your inbox.";
        msg.style.color = "var(--success)";
      }
    } catch (err) {
      msg.textContent = friendlyAuthError(err.code);
      msg.style.color = "var(--danger)";
    } finally {
      showLoader(false);
    }
  });
}

// ---------------- ROUTE GUARD (call from every protected page) ----------------
export function requireAuth(callback) {
  if (DEMO_MODE) {
    const session = localStorage.getItem(DEMO_SESSION_KEY);
    if (!session) {
      window.location.href = "../index.html";
      return;
    }
    const parsed = JSON.parse(session);
    isPortalEmployeeEmail(parsed.email).then((isEmployee) => {
      if (isEmployee) {
        localStorage.removeItem(DEMO_SESSION_KEY);
        window.location.href = "../index.html";
        return;
      }
      callback(parsed);
    });
    return;
  }
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = "../index.html";
      return;
    }
    if (await isPortalEmployeeEmail(user.email)) {
      await signOut(auth);
      window.location.href = "../index.html";
      return;
    }
    callback(user);
  });
}

export async function logout() {
  if (DEMO_MODE) {
    localStorage.removeItem(DEMO_SESSION_KEY);
    window.location.href = "../index.html";
    return;
  }
  await signOut(auth);
  window.location.href = "../index.html";
}

function friendlyAuthError(code) {
  const map = {
    "auth/invalid-email": "Please enter a valid email address.",
    "auth/user-not-found": "No admin account found with this email.",
    "auth/wrong-password": "Incorrect password. Please try again.",
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/too-many-requests": "Too many attempts. Please try again later.",
  };
  return map[code] || "Something went wrong. Please try again.";
}
