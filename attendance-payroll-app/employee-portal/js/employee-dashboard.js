// ============================================================
// EMPLOYEE PORTAL DASHBOARD — Punch In/Out with live location
// and device tracking, plus quick stats.
// ============================================================

import { renderEmployeeShell } from "./employee-shell.js";
import { dbGetAll, dbQuery, dbSet } from "../../js/db.js";
import { todayStr, monthStr, toast, showLoader, computeAttendanceMetrics, getDeviceInfo, getCurrentLocation, mapsLink } from "../../js/utils.js";

renderEmployeeShell("dashboard", "Dashboard");

let employee = null;
let shift = null;
let todayRecord = null;
let cachedLocation = null;
let cachedLocationError = null;
let cachedLocationAt = 0;

document.addEventListener("shell-ready", (e) => init(e.detail.employee));

async function init(emp) {
  employee = emp;
  renderGreeting();
  fetchLocationInBackground(); // don't block the page — runs while everything else loads

  showLoader(true);
  try {
    const shifts = await dbGetAll("shifts");
    shift = shifts.find((s) => s.id === employee.shiftId) || null;

    const attendanceAll = await dbQuery("attendance", [["empId", "==", employee.id]]);
    todayRecord = attendanceAll.find((a) => a.date === todayStr()) || null;

    renderPunchCard();
    renderStats(attendanceAll);
  } finally {
    showLoader(false);
  }

  document.getElementById("punch-action-btn").addEventListener("click", handlePunchAction);
}

// Fetches location as soon as the dashboard opens (instead of waiting
// until the Punch In/Out button is clicked) so there's no delay — and
// no extra click — at the moment of actually punching. Cached for 2
// minutes; refreshed automatically if it's gone stale by punch time.
async function fetchLocationInBackground() {
  const box = document.getElementById("punch-location-msg");
  try {
    cachedLocation = await getCurrentLocation();
    cachedLocationError = null;
    cachedLocationAt = Date.now();
    if (box) {
      box.style.background = "rgba(20,184,138,0.18)";
      box.style.color = "#7fe3c4";
      box.textContent = `📍 Location ready (${cachedLocation.lat.toFixed(4)}, ${cachedLocation.lng.toFixed(4)})`;
    }
  } catch (err) {
    cachedLocation = null;
    cachedLocationError = err.message || "Location access denied. Please enable location.";
    cachedLocationAt = Date.now();
    if (box) {
      box.style.background = "rgba(217,119,6,0.18)";
      box.style.color = "#ffcb80";
      box.textContent = `📍 ${cachedLocationError} You can still punch — tap to retry.`;
      box.style.cursor = "pointer";
      box.onclick = fetchLocationInBackground;
    }
  }
}

function renderGreeting() {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good Morning" : hour < 17 ? "Good Afternoon" : "Good Evening";
  document.getElementById("greeting-text").textContent = `${greeting}, ${employee.fullName.split(" ")[0]}!`;
  const dateStr = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  document.getElementById("greeting-date").textContent = dateStr;
  document.getElementById("punch-date").textContent = dateStr;
}

function renderPunchCard() {
  const inBox = document.getElementById("punch-in-value");
  const outBox = document.getElementById("punch-out-value");
  const btn = document.getElementById("punch-action-btn");
  const msg = document.getElementById("punch-status-msg");

  inBox.textContent = todayRecord?.checkIn || "—";
  outBox.textContent = todayRecord?.checkOut || "—";

  if (!todayRecord || !todayRecord.checkIn) {
    btn.textContent = "→ Punch In";
    btn.disabled = false;
  } else if (todayRecord.checkIn && !todayRecord.checkOut) {
    btn.textContent = "→ Punch Out";
    btn.disabled = false;
    msg.style.display = "flex";
    msg.className = "punch-status-msg punch-status-success";
    msg.textContent = `Punched in at ${todayRecord.checkIn}${todayRecord.checkInLocation ? " (location recorded)" : ""}`;
  } else {
    btn.textContent = "Attendance Complete for Today";
    btn.disabled = true;
    msg.style.display = "flex";
    msg.className = "punch-status-msg punch-status-success";
    msg.textContent = `Punched in ${todayRecord.checkIn}, punched out ${todayRecord.checkOut}. See you tomorrow!`;
  }
}

async function handlePunchAction() {
  const isPunchingIn = !todayRecord || !todayRecord.checkIn;
  const btn = document.getElementById("punch-action-btn");
  btn.disabled = true;
  showLoader(true);

  // Use the location fetched in the background when the page opened —
  // only re-fetch if we don't have one yet, or it's more than 2 minutes
  // stale (e.g. the employee left the tab open a while before punching).
  let location = cachedLocation;
  let locationError = cachedLocationError;
  const isStale = Date.now() - cachedLocationAt > 2 * 60 * 1000;
  if (!location || isStale) {
    try {
      location = await getCurrentLocation();
      locationError = null;
    } catch (err) {
      location = null;
      locationError = err.message || "Location access denied. Please enable location.";
    }
  }

  const device = getDeviceInfo();
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const date = todayStr();

  try {
    if (isPunchingIn) {
      const data = {
        empId: employee.id,
        date,
        status: "present",
        checkIn: timeStr,
        checkOut: todayRecord?.checkOut || "",
        workingHours: 0,
        overtimeHours: 0,
        lateMinutes: 0,
        earlyExitMinutes: 0,
        remarks: "Self punch-in via Employee Portal",
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

      await dbSet("attendance", `${employee.id}_${date}`, data);
      toast(locationError ? `Punched in at ${timeStr} (${locationError})` : `Punched in at ${timeStr}`, locationError ? "info" : "success");
    } else {
      const checkIn = todayRecord.checkIn;
      const metrics = computeAttendanceMetrics(shift, checkIn, timeStr);
      let status = "present";
      if (shift) {
        const shiftHours = Math.max(0, (shift.endTime && shift.startTime) ? metrics.workingHours : 8);
        if (metrics.workingHours > 0 && metrics.workingHours < 4) status = "half_day";
        else if (metrics.lateMinutes > 0) status = "late";
        else if (metrics.earlyExitMinutes > 0) status = "partial_exit";
      }

      await dbSet("attendance", `${employee.id}_${date}`, {
        empId: employee.id,
        date,
        status,
        checkIn,
        checkOut: timeStr,
        workingHours: metrics.workingHours,
        overtimeHours: metrics.overtimeHours,
        lateMinutes: metrics.lateMinutes,
        earlyExitMinutes: metrics.earlyExitMinutes,
        remarks: "Self punch-out via Employee Portal",
        checkOutLocation: location,
        deviceId: device.deviceId,
        deviceInfo: device.userAgent,
        source: "employee_portal",
      });
      toast(locationError ? `Punched out at ${timeStr} (${locationError})` : `Punched out at ${timeStr}. Working hours: ${metrics.workingHours}h`, locationError ? "info" : "success");
    }

    const attendanceAll = await dbQuery("attendance", [["empId", "==", employee.id]]);
    todayRecord = attendanceAll.find((a) => a.date === date) || null;
    renderPunchCard();
    renderStats(attendanceAll);
  } catch (err) {
    console.error(err);
    toast("Failed to record punch. Please try again.", "error");
    btn.disabled = false;
  } finally {
    showLoader(false);
  }
}

async function renderStats(attendanceAll) {
  const currentMonth = monthStr();
  const monthRecords = attendanceAll.filter((a) => a.date.startsWith(currentMonth));
  const absentCount = monthRecords.filter((a) => a.status === "absent").length;

  const leaves = await dbQuery("leaves", [["empId", "==", employee.id]]);
  const pendingLeaves = leaves.filter((l) => l.status === "pending").length;

  document.getElementById("emp-stats-grid").innerHTML = `
    <div class="stat-card stat-red">
      <div class="stat-top"><div class="stat-icon"><svg viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></div></div>
      <div class="stat-value">${absentCount}</div>
      <div class="stat-label">Absent This Month</div>
    </div>
    <div class="stat-card stat-orange">
      <div class="stat-top"><div class="stat-icon"><svg viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" stroke-width="1.6"/><path d="M14 2v6h6" stroke="currentColor" stroke-width="1.6"/></svg></div></div>
      <div class="stat-value">${pendingLeaves}</div>
      <div class="stat-label">Pending Leaves</div>
    </div>
  `;
}
