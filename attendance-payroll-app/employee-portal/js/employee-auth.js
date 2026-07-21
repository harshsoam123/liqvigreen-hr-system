// ============================================================
// EMPLOYEE PORTAL AUTH
// Separate from admin auth.js — employees log in with their own
// Firebase Auth account (set up by the admin via Employees →
// Portal Access) and are matched to their employee record by
// portalEmail. They can only ever see/act on their own data.
// ============================================================

import { auth, FIREBASE_CONFIGURED } from "../../js/firebase-config.js";
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { dbGetAll, dbQuery } from "../../js/db.js";
import { toast, showLoader } from "../../js/utils.js";

const DEMO_MODE = !FIREBASE_CONFIGURED;
const DEMO_SESSION_KEY = "demo_employee_session";

async function findEmployeeByPortalEmail(email) {
  const lower = email.trim().toLowerCase();
  if (DEMO_MODE) {
    const all = await dbGetAll("employees");
    return all.find((e) => (e.portalEmail || "").toLowerCase() === lower) || null;
  }
  const matches = await dbQuery("employees", [["portalEmail", "==", email.trim()]]);
  return matches[0] || null;
}

// ---------------- LOGIN PAGE ----------------
const loginForm = document.getElementById("emp-login-form");
if (loginForm) {
  if (DEMO_MODE) {
    if (localStorage.getItem(DEMO_SESSION_KEY)) window.location.href = "dashboard.html";
    const banner = document.getElementById("demo-banner");
    if (banner) banner.style.display = "block";
  } else {
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        const employee = await findEmployeeByPortalEmail(user.email);
        if (employee) window.location.href = "dashboard.html";
      }
    });
  }

  const errorText = document.getElementById("emp-login-error");
  const togglePwd = document.getElementById("emp-toggle-password");
  const pwdInput = document.getElementById("emp-login-password");
  if (togglePwd) {
    togglePwd.addEventListener("click", () => {
      pwdInput.type = pwdInput.type === "password" ? "text" : "password";
    });
  }

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorText.textContent = "";
    const email = document.getElementById("emp-login-email").value.trim();
    const password = document.getElementById("emp-login-password").value;
    showLoader(true);
    try {
      const employee = await findEmployeeByPortalEmail(email);
      if (!employee) {
        errorText.textContent = "No employee portal account found for this email. Ask your admin to set up Portal Access.";
        showLoader(false);
        return;
      }

      if (DEMO_MODE) {
        await new Promise((r) => setTimeout(r, 400));
        localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify({ empId: employee.id, email }));
        window.location.href = "dashboard.html";
        return;
      }

      await signInWithEmailAndPassword(auth, email, password);
      window.location.href = "dashboard.html";
    } catch (err) {
      errorText.textContent = friendlyAuthError(err.code);
    } finally {
      showLoader(false);
    }
  });
}

// ---------------- FORGOT PASSWORD PAGE ----------------
const forgotForm = document.getElementById("emp-forgot-form");
if (forgotForm) {
  const msg = document.getElementById("emp-forgot-msg");
  forgotForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("emp-forgot-email").value.trim();
    showLoader(true);
    try {
      if (DEMO_MODE) {
        await new Promise((r) => setTimeout(r, 400));
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

// ---------------- ROUTE GUARD ----------------
export function requireEmployeeAuth(callback) {
  if (DEMO_MODE) {
    const session = localStorage.getItem(DEMO_SESSION_KEY);
    if (!session) {
      window.location.href = "index.html";
      return;
    }
    const { empId } = JSON.parse(session);
    dbGetAll("employees").then((all) => {
      const employee = all.find((e) => e.id === empId);
      if (!employee) {
        window.location.href = "index.html";
        return;
      }
      callback(employee);
    });
    return;
  }

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = "index.html";
      return;
    }
    const employee = await findEmployeeByPortalEmail(user.email);
    if (!employee) {
      toast("No employee profile linked to this login. Contact your admin.", "error");
      await signOut(auth);
      window.location.href = "index.html";
      return;
    }
    callback(employee);
  });
}

export async function employeeLogout() {
  if (DEMO_MODE) {
    localStorage.removeItem(DEMO_SESSION_KEY);
    window.location.href = "index.html";
    return;
  }
  await signOut(auth);
  window.location.href = "index.html";
}

function friendlyAuthError(code) {
  const map = {
    "auth/invalid-email": "Please enter a valid email address.",
    "auth/user-not-found": "No account found with this email.",
    "auth/wrong-password": "Incorrect password. Please try again.",
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/too-many-requests": "Too many attempts. Please try again later.",
  };
  return map[code] || "Something went wrong. Please try again.";
}
