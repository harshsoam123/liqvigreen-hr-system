// ============================================================
// QUICK PUNCH — no-login attendance marking.
// A single shareable link employees can open (no Employee Portal
// account needed) to select their name and Punch In/Out, with
// location + device captured automatically, same as the full
// Employee Portal's punch flow.
// ============================================================

import { auth, FIREBASE_CONFIGURED } from "../../js/firebase-config.js";
import { signInAnonymously } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { dbGetAll, dbGetById, dbSet } from "../../js/db.js";
import { todayStr, monthStr, toast, showLoader, computeAttendanceMetrics, getDeviceInfo, getCurrentLocation } from "../../js/utils.js";

const DEMO_MODE = !FIREBASE_CONFIGURED;
const REMEMBERED_KEY = "quickpunch_remembered_empId";

let employees = [];
let shifts = [];
let selectedType = null; // 'in' | 'out'
let location = null;
let locationError = null;

init();

async function init() {
  updateClock();
  setInterval(updateClock, 1000 * 30);

  showLoader(true);
  try {
    if (!DEMO_MODE) {
      // Anonymous auth just satisfies Firestore's `request.auth != null`
      // requirement — see README for the narrow security rule that scopes
      // what an anonymous quick-punch session is allowed to write.
      await signInAnonymously(auth).catch((err) => {
        console.error("Anonymous sign-in failed:", err);
        toast("Could not connect. Ask your admin to enable Anonymous sign-in in Firebase.", "error");
      });
    }

    [employees, shifts] = await Promise.all([dbGetAll("employeeDirectory"), dbGetAll("shifts")]);
    populateEmployeeSelect();
    applyRememberedEmployee();
    document.getElementById("qp-device-id").textContent = getDeviceInfo().deviceId;
    fetchLocation();
  } finally {
    showLoader(false);
  }

  bindEvents();
}

function updateClock() {
  const now = new Date();
  document.getElementById("qp-clock").textContent = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  document.getElementById("qp-date-small").textContent = now.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" });
}

function populateEmployeeSelect() {
  const select = document.getElementById("qp-employee-select");
  const activeEmployees = employees.filter((e) => e.status !== "inactive").sort((a, b) => a.fullName.localeCompare(b.fullName));
  select.innerHTML =
    `<option value="">Select your name...</option>` +
    activeEmployees.map((e) => `<option value="${e.id}">${e.fullName} (${e.empCode})</option>`).join("");
}

// Remembers who last punched from this device/browser so they don't
// have to pick their name from the dropdown every single time — this
// is purely a per-device convenience (like staying "logged in"), not
// an authentication mechanism. A "Not you? Switch" link is always
// available to clear it instantly (this device's equivalent of logout).
function applyRememberedEmployee() {
  const rememberedId = localStorage.getItem(REMEMBERED_KEY);
  if (!rememberedId) return;
  const employee = employees.find((e) => e.id === rememberedId && e.status !== "inactive");
  if (!employee) {
    localStorage.removeItem(REMEMBERED_KEY);
    return;
  }
  document.getElementById("qp-employee-select").value = rememberedId;
  document.getElementById("qp-name-field-wrap").style.display = "none";
  document.getElementById("qp-remembered-banner").style.display = "flex";
  document.getElementById("qp-remembered-name").textContent = employee.fullName;
  markStepDone(1);
  refreshSubmitState();
}

function rememberEmployee(empId) {
  localStorage.setItem(REMEMBERED_KEY, empId);
}

function forgetRememberedEmployee() {
  localStorage.removeItem(REMEMBERED_KEY);
  document.getElementById("qp-remembered-banner").style.display = "none";
  document.getElementById("qp-name-field-wrap").style.display = "block";
  document.getElementById("qp-employee-select").value = "";
  refreshSubmitState();
}

async function fetchLocation() {
  const box = document.getElementById("qp-location-box");
  box.className = "qp-location-box pending";
  box.textContent = "Fetching your location...";
  try {
    location = await getCurrentLocation();
    locationError = null;
    box.className = "qp-location-box";
    box.textContent = `${location.lat.toFixed(6)}, ${location.lng.toFixed(6)} ✓ Location captured successfully`;
    markStepDone(3);
  } catch (err) {
    location = null;
    locationError = err.message || "Location access denied.";
    box.className = "qp-location-box error";
    box.textContent = `${locationError} You can still submit — just tap Submit again.`;
    markStepDone(3);
  }
  refreshSubmitState();
}

function markStepDone(n) {
  const step = document.getElementById(`step-${n}`);
  if (step) step.classList.add("done");
}

function bindEvents() {
  document.getElementById("qp-employee-select").addEventListener("change", (e) => {
    if (e.target.value) markStepDone(1);
    refreshSubmitState();
  });

  document.querySelectorAll(".qp-type-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".qp-type-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      selectedType = btn.dataset.type;
      markStepDone(2);
      refreshSubmitState();
    });
  });

  document.getElementById("qp-location-box").addEventListener("click", fetchLocation);
  document.getElementById("qp-submit-btn").addEventListener("click", submitPunch);
  document.getElementById("qp-switch-btn").addEventListener("click", forgetRememberedEmployee);
}

function refreshSubmitState() {
  const empId = document.getElementById("qp-employee-select").value;
  const btn = document.getElementById("qp-submit-btn");
  btn.disabled = !(empId && selectedType);
}

async function submitPunch() {
  const empId = document.getElementById("qp-employee-select").value;
  const errorText = document.getElementById("qp-error");
  errorText.textContent = "";

  if (!empId || !selectedType) {
    errorText.textContent = "Please select your name and attendance type.";
    return;
  }

  const employee = employees.find((e) => e.id === empId);
  const shift = shifts.find((s) => s.id === employee?.shiftId);
  const date = todayStr();
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const device = getDeviceInfo();

  showLoader(true);
  try {
    const existing = await dbGetById("attendance", `${empId}_${date}`);

    if (selectedType === "in") {
      const data = {
        empId,
        date,
        status: "present",
        checkIn: timeStr,
        checkOut: existing?.checkOut || "",
        workingHours: 0,
        overtimeHours: 0,
        lateMinutes: 0,
        earlyExitMinutes: 0,
        remarks: "Quick Punch (no-login form)",
        checkInLocation: location,
        deviceId: device.deviceId,
        deviceInfo: device.userAgent,
        source: "employee_portal",
      };
      if (shift) {
        const { lateMinutes } = computeAttendanceMetrics(shift, timeStr, shift.endTime);
        data.lateMinutes = lateMinutes;
        data.status = lateMinutes > 0 ? "late" : "present";
      }
      await dbSet("attendance", `${empId}_${date}`, data);
    } else {
      const checkIn = existing?.checkIn;
      if (!checkIn) {
        errorText.textContent = "No Punch In found for today yet — please Punch In first.";
        showLoader(false);
        return;
      }
      const metrics = computeAttendanceMetrics(shift, checkIn, timeStr);
      let status = "present";
      if (metrics.workingHours > 0 && metrics.workingHours < 4) status = "half_day";
      else if (metrics.lateMinutes > 0) status = "late";
      else if (metrics.earlyExitMinutes > 0) status = "partial_exit";

      await dbSet("attendance", `${empId}_${date}`, {
        empId,
        date,
        status,
        checkIn,
        checkOut: timeStr,
        workingHours: metrics.workingHours,
        overtimeHours: metrics.overtimeHours,
        lateMinutes: metrics.lateMinutes,
        earlyExitMinutes: metrics.earlyExitMinutes,
        remarks: "Quick Punch (no-login form)",
        checkOutLocation: location,
        deviceId: device.deviceId,
        deviceInfo: device.userAgent,
        source: "employee_portal",
      });
    }

    markStepDone(4);
    rememberEmployee(empId);
    toast(`${employee.fullName} punched ${selectedType === "in" ? "in" : "out"} at ${timeStr}.`);
    resetForm();
  } catch (err) {
    console.error(err);
    errorText.textContent = "Failed to submit. Please try again.";
  } finally {
    showLoader(false);
  }
}

function resetForm() {
  const rememberedId = localStorage.getItem(REMEMBERED_KEY);
  selectedType = null;
  document.querySelectorAll(".qp-type-btn").forEach((b) => b.classList.remove("active"));
  document.querySelectorAll(".qp-step").forEach((s) => s.classList.remove("done"));

  if (rememberedId) {
    // Keep them "logged in" for their next punch (e.g. Punch Out later
    // the same day) instead of forcing them to pick their name again.
    document.getElementById("qp-employee-select").value = rememberedId;
    markStepDone(1);
  } else {
    document.getElementById("qp-employee-select").value = "";
  }
  refreshSubmitState();
}
