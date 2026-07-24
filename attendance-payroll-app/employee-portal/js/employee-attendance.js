// ============================================================
// EMPLOYEE PORTAL — MY ATTENDANCE (read-only: Today / History / Monthly)
// ============================================================

import { renderEmployeeShell } from "./employee-shell.js";
import { dbQuery } from "../../js/db.js";
import { todayStr, monthStr, statusBadge, summarizeAttendance, mapsLink } from "../../js/utils.js";

renderEmployeeShell("attendance", "My Attendance");

let employee = null;
let allRecords = [];

document.addEventListener("shell-ready", (e) => init(e.detail.employee));

async function init(emp) {
  employee = emp;
  allRecords = await dbQuery("attendance", [["empId", "==", employee.id]]);
  allRecords.sort((a, b) => b.date.localeCompare(a.date));

  renderToday();
  renderHistory();

  const currentMonth = monthStr();
  document.getElementById("monthly-picker").value = currentMonth;
  renderMonthly(currentMonth);

  bindEvents();

  if (window.location.hash === "#monthly") {
    document.querySelector('[data-tab="tab-monthly"]').click();
  }
}

function bindEvents() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(btn.dataset.tab).classList.add("active");
    });
  });

  document.getElementById("monthly-picker").addEventListener("change", (e) => renderMonthly(e.target.value));
}

function renderToday() {
  const today = allRecords.find((a) => a.date === todayStr());
  document.getElementById("today-date-heading").textContent = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

  const fields = [
    ["Status", today ? statusBadge(today.status) : `<span class="badge badge-muted">Not Punched In Yet</span>`],
    ["Punch In", today?.checkIn || "-"],
    ["Punch Out", today?.checkOut || "-"],
    ["Working Hours", today?.workingHours ? `${today.workingHours}h` : "-"],
    ["Late Minutes", today?.lateMinutes || 0],
    ["Location (Punch In)", today?.checkInLocation ? `<a class="link-primary" href="${mapsLink(today.checkInLocation.lat, today.checkInLocation.lng)}" target="_blank" rel="noopener">View on Map</a>` : "-"],
  ];
  document.getElementById("today-info-grid").innerHTML = fields
    .map(([label, value]) => `<div class="info-item"><div class="label">${label}</div><div class="value">${value}</div></div>`)
    .join("");
}

function renderHistory() {
  const tbody = document.getElementById("history-tbody");
  if (!allRecords.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;" class="text-muted">No attendance records yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = allRecords
    .slice(0, 90)
    .map((r) => {
      const loc = r.checkInLocation || r.checkOutLocation;
      return `<tr>
        <td>${r.date}</td>
        <td>${r.checkIn || "-"}</td>
        <td>${r.checkOut || "-"}</td>
        <td>${r.workingHours ? r.workingHours + "h" : "-"}</td>
        <td>${loc ? `<a class="link-primary" href="${mapsLink(loc.lat, loc.lng)}" target="_blank" rel="noopener">View</a>` : "-"}</td>
        <td>${statusBadge(r.status)}</td>
      </tr>`;
    })
    .join("");
}

function renderMonthly(monthKey) {
  document.getElementById("monthly-heading").textContent = `Monthly Report — ${monthKey}`;
  const monthRecords = allRecords.filter((r) => r.date.startsWith(monthKey));
  const s = summarizeAttendance(monthRecords);

  const cards = [
    ["Present Days", s.presentDays],
    ["Absent Days", s.absentDays],
    ["Leave Days", s.leaveDays],
    ["Half Days", s.halfDays],
    ["Late Count", s.lateCount],
    ["Partial Exit", s.partialExitCount],
    ["Holidays", s.holidays],
    ["Working Hours", s.workingHours.toFixed(1)],
    ["Overtime Hours", s.overtimeHours.toFixed(1)],
  ];
  document.getElementById("monthly-stats-grid").innerHTML = cards
    .map(([label, value]) => `<div class="stat-card stat-blue"><div class="stat-value" style="font-size: 1.125rem;">${value}</div><div class="stat-label">${label}</div></div>`)
    .join("");
}
