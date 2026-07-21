// ============================================================
// UTILS: general helpers + the PAYROLL CALCULATION ENGINE
// ============================================================

import { dbGetAll, dbQuery, dbSet, dbGetById } from "./db.js";

// ---------- Generic helpers ----------
export function formatDate(d) {
  const date = d instanceof Date ? d : new Date(d);
  return date.toISOString().split("T")[0];
}

export function todayStr() {
  return formatDate(new Date());
}

export function monthStr(d = new Date()) {
  const date = d instanceof Date ? d : new Date(d);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function daysInMonth(monthKey) {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

export function currency(n) {
  const num = Number(n) || 0;
  return "₹" + num.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

export function minutesBetween(t1, t2) {
  // t1, t2 = "HH:MM" strings
  const [h1, m1] = t1.split(":").map(Number);
  const [h2, m2] = t2.split(":").map(Number);
  return h2 * 60 + m2 - (h1 * 60 + m1);
}

/**
 * Given a shift and raw check-in/check-out times, computes working hours,
 * overtime hours, late minutes, and early-exit minutes.
 * Used by both manual attendance marking and bulk biometric imports so
 * the math is identical everywhere.
 */
export function computeAttendanceMetrics(shift, checkIn, checkOut) {
  let workingHours = 0, overtimeHours = 0, lateMinutes = 0, earlyExitMinutes = 0;

  if (checkIn && checkOut) {
    const totalMinutes = Math.max(0, minutesBetween(checkIn, checkOut));
    workingHours = Math.round((totalMinutes / 60) * 100) / 100;

    if (shift) {
      const graceMinutes = Number(shift.graceMinutes || 0);
      const shiftMinutes = Math.max(0, minutesBetween(shift.startTime, shift.endTime));
      const shiftHours = shiftMinutes / 60;

      const lateDiff = minutesBetween(shift.startTime, checkIn) - graceMinutes;
      lateMinutes = lateDiff > 0 ? lateDiff : 0;

      const earlyDiff = minutesBetween(checkOut, shift.endTime);
      earlyExitMinutes = earlyDiff > 0 ? earlyDiff : 0;

      overtimeHours = workingHours > shiftHours ? Math.round((workingHours - shiftHours) * 100) / 100 : 0;
    }
  }

  return { workingHours, overtimeHours, lateMinutes, earlyExitMinutes };
}

export function nextEmployeeId(existingEmployees) {
  const nums = existingEmployees
    .map((e) => (e.empCode ? parseInt(e.empCode.replace(/\D/g, ""), 10) : 0))
    .filter((n) => !isNaN(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return "EMP" + String(next).padStart(4, "0");
}

export function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

export function toast(message, type = "success") {
  let holder = document.getElementById("toast-holder");
  if (!holder) {
    holder = document.createElement("div");
    holder.id = "toast-holder";
    document.body.appendChild(holder);
  }
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.textContent = message;
  holder.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 300);
  }, 3200);
}

export function showLoader(show = true) {
  let loader = document.getElementById("global-loader");
  if (!loader) {
    loader = document.createElement("div");
    loader.id = "global-loader";
    loader.innerHTML = `<div class="spinner"></div>`;
    document.body.appendChild(loader);
  }
  loader.style.display = show ? "flex" : "none";
}

export function statusBadge(status) {
  const map = {
    present: "badge-success",
    absent: "badge-danger",
    leave: "badge-warning",
    half_day: "badge-info",
    late: "badge-warning",
    partial_exit: "badge-info",
    work_from_home: "badge-primary",
    holiday: "badge-muted",
    pending: "badge-warning",
    approved: "badge-success",
    rejected: "badge-danger",
    active: "badge-success",
    inactive: "badge-muted",
  };
  const label = status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return `<span class="badge ${map[status] || "badge-muted"}">${label}</span>`;
}

// ============================================================
// PAYROLL CALCULATION ENGINE
// ============================================================
// Rules:
//   perDaySalary  = monthlySalary / daysInMonth
//   perHourSalary = perDaySalary / shiftHours (default 8)
//   grossSalary   = (presentDays * perDay) + (halfDays * perDay * 0.5)
//                   + overtimePay + bonus + incentive + allowances
//   deductions    = (absentDays * perDay) + (lateMarks * lateDeduction)
//                   + (partialExits * partialExitDeduction)
//                   + (unpaidLeaveDays * leaveDeduction)
//                   + pf + esi + tax + otherDeductions
//   netSalary     = grossSalary - deductions
// ============================================================

export async function getSalarySettingsFor(empId) {
  const custom = await dbGetById("salarySettings", empId);
  if (custom) return custom;
  const def = await dbGetById("salarySettings", "default");
  return (
    def || {
      overtimeRate: 0,
      lateDeduction: 0,
      halfDayDeduction: 0,
      partialExitDeduction: 0,
      leaveDeduction: 0,
      bonus: 0,
      incentive: 0,
      allowances: 0,
      pf: 0,
      esi: 0,
      tax: 0,
      otherDeductions: 0,
    }
  );
}

export function summarizeAttendance(records) {
  const summary = {
    presentDays: 0,
    absentDays: 0,
    leaveDays: 0,
    halfDays: 0,
    lateCount: 0,
    partialExitCount: 0,
    holidays: 0,
    workFromHome: 0,
    workingHours: 0,
    overtimeHours: 0,
  };
  records.forEach((r) => {
    switch (r.status) {
      case "present":
        summary.presentDays++;
        break;
      case "absent":
        summary.absentDays++;
        break;
      case "leave":
        summary.leaveDays++;
        break;
      case "half_day":
        summary.halfDays++;
        break;
      case "holiday":
        summary.holidays++;
        break;
      case "work_from_home":
        summary.presentDays++;
        summary.workFromHome++;
        break;
      default:
        break;
    }
    if (r.status === "late") {
      summary.presentDays++;
      summary.lateCount++;
    }
    if (r.status === "partial_exit") {
      summary.presentDays++;
      summary.partialExitCount++;
    }
    summary.workingHours += Number(r.workingHours || 0);
    summary.overtimeHours += Number(r.overtimeHours || 0);
  });
  return summary;
}

/**
 * Calculates full payroll for one employee for one month (YYYY-MM).
 * Persists the result into `salaryRecords` collection (doc id: empId_month)
 * and returns the computed object.
 */
export async function calculateSalaryForEmployee(employee, monthKey) {
  const settings = await getSalarySettingsFor(employee.id);
  const allAttendance = await dbQuery("attendance", [["empId", "==", employee.id]]);
  const monthRecords = allAttendance.filter((r) => r.date && r.date.startsWith(monthKey));
  const summary = summarizeAttendance(monthRecords);

  const totalDays = daysInMonth(monthKey);
  const monthlySalary = Number(employee.monthlySalary || 0);
  const perDay = monthlySalary / totalDays;
  const perHour = perDay / 8;

  const overtimeRate = Number(settings.overtimeRate || 0) || perHour * 1.5;
  const overtimePay = summary.overtimeHours * overtimeRate;

  const grossSalary =
    summary.presentDays * perDay +
    summary.halfDays * perDay * 0.5 +
    overtimePay +
    Number(settings.bonus || 0) +
    Number(settings.incentive || 0) +
    Number(settings.allowances || 0);

  const unpaidLeaveDays = summary.leaveDays; // treat recorded 'leave' status as chargeable unless separately approved as paid
  const deductions =
    summary.absentDays * perDay +
    summary.lateCount * Number(settings.lateDeduction || 0) +
    summary.partialExitCount * Number(settings.partialExitDeduction || 0) +
    unpaidLeaveDays * Number(settings.leaveDeduction || 0) +
    Number(settings.pf || 0) +
    Number(settings.esi || 0) +
    Number(settings.tax || 0) +
    Number(settings.otherDeductions || 0);

  const netSalary = Math.max(0, grossSalary - deductions);

  const record = {
    empId: employee.id,
    empCode: employee.empCode,
    empName: employee.fullName,
    month: monthKey,
    perDaySalary: round2(perDay),
    perHourSalary: round2(perHour),
    ...summary,
    overtimePay: round2(overtimePay),
    grossSalary: round2(grossSalary),
    totalDeductions: round2(deductions),
    netSalary: round2(netSalary),
    generatedOn: new Date().toISOString(),
  };

  await dbSet("salaryRecords", `${employee.id}_${monthKey}`, record);
  return record;
}

export async function recalculateSalaryForEmployee(empId, monthKey) {
  const emp = await dbGetById("employees", empId);
  if (!emp) return null;
  return calculateSalaryForEmployee(emp, monthKey || monthStr());
}

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

// ============================================================
// EMPLOYEE PORTAL HELPERS
// ============================================================

// A stable, anonymous per-browser identifier (not a true hardware
// device ID — browsers don't expose one to JS — but persists across
// visits on the same browser/device so repeated punches from the
// same phone/laptop are traceable).
export function getDeviceId() {
  const KEY = "attendpay_device_id";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = "dev_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
    localStorage.setItem(KEY, id);
  }
  return id;
}

export function getDeviceInfo() {
  return {
    deviceId: getDeviceId(),
    userAgent: navigator.userAgent,
    platform: navigator.platform || "",
  };
}

// Wraps the Geolocation API in a Promise with a friendly error message.
export function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported by this browser."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      },
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });
}

export function mapsLink(lat, lng) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

/**
 * Computes CL / SL / EL / Comp-Off balances for one employee for the
 * current calendar year, based on their entitlements (set on the
 * employee profile) and days used from APPROVED leave requests.
 */
export function computeLeaveBalances(employee, allLeavesForEmployee, year = new Date().getFullYear()) {
  const types = [
    { key: "Casual Leave", short: "CL", entitlement: Number(employee.clEntitlement || 0) },
    { key: "Sick Leave", short: "SL", entitlement: Number(employee.slEntitlement || 0) },
    { key: "Paid Leave", short: "EL", entitlement: Number(employee.elEntitlement || 0) },
    { key: "Comp-Off", short: "Comp-Off", entitlement: Number(employee.compOffEntitlement || 0) },
  ];

  const approvedThisYear = allLeavesForEmployee.filter((l) => l.status === "approved" && l.fromDate?.startsWith(String(year)));

  return types.map((t) => {
    const used = approvedThisYear
      .filter((l) => l.type === t.key)
      .reduce((sum, l) => sum + leaveDaysCount(l.fromDate, l.toDate), 0);
    return { ...t, used: round2(used), balance: round2(t.entitlement - used) };
  });
}

function leaveDaysCount(from, to) {
  const d1 = new Date(from);
  const d2 = new Date(to);
  return Math.max(1, Math.round((d2 - d1) / 86400000) + 1);
}
