// ============================================================
// EMPLOYEE PROFILE PAGE
// ============================================================

import { renderShell } from "./sidebar.js";
import { dbGetAll, dbGetById, dbQuery, dbUpdate } from "./db.js";
import { currency, statusBadge, monthStr, summarizeAttendance, toast, showLoader } from "./utils.js";

renderShell("employees", "Employee Profile");

const params = new URLSearchParams(window.location.search);
const empId = params.get("id");
let employee = null;
let shifts = [];

document.addEventListener("shell-ready", init);

async function init() {
  if (!empId) {
    window.location.href = "employees.html";
    return;
  }
  showLoader(true);
  try {
    [employee, shifts] = await Promise.all([dbGetById("employees", empId), dbGetAll("shifts")]);
    if (!employee) {
      toast("Employee not found.", "error");
      window.location.href = "employees.html";
      return;
    }
    renderHeader();
    renderPersonalInfo();
    renderDocuments();
    await renderAttendanceHistory();
    await renderMonthlyReport(monthStr());
    await renderSalaryHistory();
    await renderLeaveHistory();
    renderShiftDetails();
    loadPerformanceNotes();
  } finally {
    showLoader(false);
  }
  bindEvents();
}

function renderHeader() {
  document.getElementById("profile-photo").src = employee.photoUrl || placeholderAvatar();
  document.getElementById("profile-name").textContent = employee.fullName;
  document.getElementById("profile-role").textContent = `${employee.designation || "-"} • ${employee.department || "-"}`;
  document.getElementById("profile-chips").innerHTML = `
    <span class="meta-chip">${employee.empCode}</span>
    <span class="meta-chip">${employee.mobile || "-"}</span>
    ${statusBadge(employee.status || "active")}
  `;
}

function placeholderAvatar() {
  return "data:image/svg+xml;utf8," + encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'><rect width='100' height='100' fill='#e3f7f1'/><text x='50' y='58' font-size='36' text-anchor='middle' fill='#14b88a' font-family='Arial'>${(employee.fullName || "?").charAt(0)}</text></svg>`
  );
}

function renderPersonalInfo() {
  const fields = [
    ["Full Name", employee.fullName], ["Father's Name", employee.fatherName],
    ["Mobile Number", employee.mobile], ["Email", employee.email],
    ["Address", employee.address], ["Date of Birth", employee.dob],
    ["Joining Date", employee.joiningDate], ["Aadhaar Number", employee.aadhaarNo],
    ["PAN Number", employee.panNo], ["Bank Account", employee.bankAccount],
    ["IFSC Code", employee.ifsc], ["UPI ID", employee.upiId],
  ];
  document.getElementById("personal-info-grid").innerHTML = fields
    .map(([label, value]) => `<div class="info-item"><div class="label">${label}</div><div class="value">${value || "-"}</div></div>`)
    .join("");
}

function renderDocuments() {
  const docs = [
    { name: "Aadhaar Card", url: employee.aadhaarUrl },
    { name: "PAN Card", url: employee.panUrl },
    { name: "Resume", url: employee.resumeUrl },
    ...(employee.otherDocsUrl || []).map((d) => ({ name: d.name, url: d.url })),
  ];
  const grid = document.getElementById("doc-grid");
  if (!docs.filter((d) => d.url).length) {
    grid.innerHTML = `<div class="empty-state">No documents uploaded yet.</div>`;
    return;
  }
  grid.innerHTML = docs
    .map((d) =>
      d.url
        ? `<div class="doc-card">
            <svg viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" stroke-width="1.6"/><path d="M14 2v6h6" stroke="currentColor" stroke-width="1.6"/></svg>
            <p>${d.name}</p>
            <a class="btn btn-sm btn-outline" href="${d.url}" target="_blank" rel="noopener">View</a>
          </div>`
        : ""
    )
    .join("");
}

async function renderAttendanceHistory() {
  const records = await dbQuery("attendance", [["empId", "==", employee.id]]);
  records.sort((a, b) => b.date.localeCompare(a.date));
  const tbody = document.getElementById("attendance-history-body");
  tbody.innerHTML = records.length
    ? records
        .map(
          (r) => `<tr>
        <td>${r.date}</td><td>${statusBadge(r.status)}</td><td>${r.checkIn || "-"}</td><td>${r.checkOut || "-"}</td>
        <td>${r.workingHours || 0}</td><td>${r.overtimeHours || 0}</td><td>${r.lateMinutes || 0}</td><td>${r.earlyExitMinutes || 0}</td><td>${r.remarks || "-"}</td>
      </tr>`
        )
        .join("")
    : `<tr><td colspan="9" style="text-align:center;padding:24px;" class="text-muted">No attendance records yet.</td></tr>`;
}

async function renderMonthlyReport(monthKey) {
  document.getElementById("monthly-picker").value = monthKey;
  const records = await dbQuery("attendance", [["empId", "==", employee.id]]);
  const monthRecords = records.filter((r) => r.date.startsWith(monthKey));
  const s = summarizeAttendance(monthRecords);
  const salary = await dbGetById("salaryRecords", `${employee.id}_${monthKey}`);

  const cards = [
    ["Present Days", s.presentDays], ["Absent Days", s.absentDays], ["Leave Days", s.leaveDays],
    ["Half Days", s.halfDays], ["Late Count", s.lateCount], ["Partial Exit Count", s.partialExitCount],
    ["Holidays", s.holidays], ["Working Hours", s.workingHours.toFixed(1)], ["Overtime Hours", s.overtimeHours.toFixed(1)],
    ["Gross Salary", currency(salary?.grossSalary || 0)], ["Total Deductions", currency(salary?.totalDeductions || 0)], ["Net Salary", currency(salary?.netSalary || 0)],
  ];
  document.getElementById("monthly-stats-grid").innerHTML = cards
    .map(
      ([label, value]) => `<div class="stat-card stat-blue"><div class="stat-value" style="font-size: 1.125rem;">${value}</div><div class="stat-label">${label}</div></div>`
    )
    .join("");
}

async function renderSalaryHistory() {
  const all = await dbGetAll("salaryRecords");
  const records = all.filter((s) => s.empId === employee.id).sort((a, b) => b.month.localeCompare(a.month));
  const tbody = document.getElementById("salary-history-body");
  tbody.innerHTML = records.length
    ? records
        .map(
          (s) => `<tr>
        <td>${s.month}</td><td>${s.presentDays}</td><td>${s.absentDays}</td><td>${(s.overtimeHours || 0).toFixed(1)}</td>
        <td>${currency(s.grossSalary)}</td><td>${currency(s.totalDeductions)}</td><td><strong>${currency(s.netSalary)}</strong></td>
      </tr>`
        )
        .join("")
    : `<tr><td colspan="7" style="text-align:center;padding:24px;" class="text-muted">No salary generated yet. Generate it from the Reports page.</td></tr>`;
}

async function renderLeaveHistory() {
  const all = await dbGetAll("leaves");
  const records = all.filter((l) => l.empId === employee.id).sort((a, b) => (b.appliedOn || "").localeCompare(a.appliedOn || ""));
  const tbody = document.getElementById("leave-history-body");
  tbody.innerHTML = records.length
    ? records
        .map(
          (l) => `<tr><td>${l.type}</td><td>${l.fromDate}</td><td>${l.toDate}</td><td>${l.reason || "-"}</td><td>${statusBadge(l.status)}</td></tr>`
        )
        .join("")
    : `<tr><td colspan="5" style="text-align:center;padding:24px;" class="text-muted">No leave requests found.</td></tr>`;
}

function renderShiftDetails() {
  const shift = shifts.find((s) => s.id === employee.shiftId);
  const grid = document.getElementById("shift-info-grid");
  if (!shift) {
    grid.innerHTML = `<div class="empty-state">No shift assigned.</div>`;
    return;
  }
  const fields = [
    ["Shift Name", shift.name], ["Start Time", shift.startTime], ["End Time", shift.endTime],
    ["Grace Time", `${shift.graceMinutes || 0} minutes`],
    ["Weekly Off Days", (shift.weeklyOffDays || []).join(", ") || "-"],
    ["Late Mark Rule", shift.lateMarkRules || "-"],
  ];
  grid.innerHTML = fields.map(([l, v]) => `<div class="info-item"><div class="label">${l}</div><div class="value">${v}</div></div>`).join("");
}

function loadPerformanceNotes() {
  document.getElementById("performance-notes").value = employee.performanceNotes || "";
}

function bindEvents() {
  document.getElementById("back-btn").addEventListener("click", () => (window.location.href = "employees.html"));

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(btn.dataset.tab).classList.add("active");
    });
  });

  document.getElementById("monthly-picker").addEventListener("change", (e) => renderMonthlyReport(e.target.value));

  document.getElementById("save-notes-btn").addEventListener("click", async () => {
    showLoader(true);
    try {
      await dbUpdate("employees", employee.id, { performanceNotes: document.getElementById("performance-notes").value });
      toast("Performance notes saved.");
    } finally {
      showLoader(false);
    }
  });
}
