// ============================================================
// DASHBOARD PAGE LOGIC
// ============================================================

import { renderShell } from "./sidebar.js";
import { dbGetAll, dbQuery } from "./db.js";
import { todayStr, currency, statusBadge, showLoader, monthStr } from "./utils.js";

renderShell("dashboard", "Dashboard");

document.addEventListener("shell-ready", initDashboard);

async function initDashboard() {
  showLoader(true);
  try {
    const [employees, attendanceToday, salaryRecords] = await Promise.all([
      dbGetAll("employees"),
      dbQuery("attendance", [["date", "==", todayStr()]]),
      dbGetAll("salaryRecords"),
    ]);

    const activeEmployees = employees.filter((e) => e.status !== "inactive");
    const activeIds = new Set(employees.map((e) => e.id));

    // Defensive filter: only count attendance rows whose employee still
    // exists (guards against any orphaned records from deleted employees).
    const validAttendanceToday = attendanceToday.filter((a) => activeIds.has(a.empId));

    const present = validAttendanceToday.filter((a) => ["present", "late", "partial_exit", "work_from_home", "half_day"].includes(a.status));
    const absent = validAttendanceToday.filter((a) => a.status === "absent");
    const late = validAttendanceToday.filter((a) => a.status === "late");
    const halfDay = validAttendanceToday.filter((a) => a.status === "half_day");
    const partialExit = validAttendanceToday.filter((a) => a.status === "partial_exit");

    const currentMonth = monthStr();
    const monthSalaries = salaryRecords.filter((s) => s.month === currentMonth);
    const totalSalaryDue = monthSalaries.reduce((sum, s) => sum + Number(s.netSalary || 0), 0);

    renderStatCards({
      total: activeEmployees.length,
      present: present.length,
      absent: absent.length,
      late: late.length,
      halfDay: halfDay.length,
      partialExit: partialExit.length,
      totalSalary: totalSalaryDue,
    });

    await renderTrendChart(employees);
    renderDonutChart({ present: present.length, absent: absent.length, late: late.length, halfDay: halfDay.length, partialExit: partialExit.length });
    renderRecentActivity(validAttendanceToday, employees);
  } catch (err) {
    console.error(err);
  } finally {
    showLoader(false);
  }
}

function statCard(cls, iconSvg, value, label) {
  return `
    <div class="stat-card ${cls}">
      <div class="stat-top">
        <div class="stat-icon">${iconSvg}</div>
      </div>
      <div class="stat-value">${value}</div>
      <div class="stat-label">${label}</div>
    </div>`;
}

const ICO = {
  users: `<svg viewBox="0 0 24 24" fill="none"><path d="M17 21v-2a4 4 0 00-4-4H7a4 4 0 00-4 4v2M10 11a4 4 0 100-8 4 4 0 000 8z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  x: `<svg viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path d="M12 7v5l3 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  half: `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path d="M12 3v18" stroke="currentColor" stroke-width="1.8"/></svg>`,
  exit: `<svg viewBox="0 0 24 24" fill="none"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  cash: `<svg viewBox="0 0 24 24" fill="none"><rect x="2" y="6" width="20" height="12" rx="2" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8"/></svg>`,
};

function renderStatCards(d) {
  document.getElementById("stats-grid").innerHTML =
    statCard("stat-blue", ICO.users, d.total, "Total Employees") +
    statCard("stat-green", ICO.check, d.present, "Present Today") +
    statCard("stat-red", ICO.x, d.absent, "Absent Today") +
    statCard("stat-orange", ICO.clock, d.late, "Late Arrivals") +
    statCard("stat-cyan", ICO.half, d.halfDay, "Half Day Employees") +
    statCard("stat-purple", ICO.exit, d.partialExit, "Partial Exit Employees") +
    statCard("stat-blue", ICO.cash, currency(d.totalSalary), "Total Salary to be Paid");
}

async function renderTrendChart(employees) {
  const activeIds = new Set(employees.map((e) => e.id));
  const attendance = (await dbGetAll("attendance")).filter((a) => activeIds.has(a.empId));
  const labels = [];
  const presentSeries = [];
  const absentSeries = [];

  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split("T")[0];
    labels.push(d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }));
    const dayRecords = attendance.filter((a) => a.date === key);
    presentSeries.push(dayRecords.filter((a) => ["present", "late", "partial_exit", "work_from_home"].includes(a.status)).length);
    absentSeries.push(dayRecords.filter((a) => a.status === "absent").length);
  }

  const ctx = document.getElementById("trendChart");
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "Present", data: presentSeries, borderColor: "#14b88a", backgroundColor: "rgba(20,184,138,0.12)", tension: 0.35, fill: true },
        { label: "Absent", data: absentSeries, borderColor: "#e11d48", backgroundColor: "rgba(225,29,72,0.08)", tension: 0.35, fill: true },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: isDark ? "#e7ecf7" : "#1a2233" } } },
      scales: {
        x: { ticks: { color: isDark ? "#96a1bd" : "#64748b" }, grid: { display: false } },
        y: { ticks: { color: isDark ? "#96a1bd" : "#64748b" }, beginAtZero: true },
      },
    },
  });
}

function renderDonutChart(d) {
  const ctx = document.getElementById("donutChart");
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Present", "Absent", "Late", "Half Day", "Partial Exit"],
      datasets: [
        {
          data: [d.present, d.absent, d.late, d.halfDay, d.partialExit],
          backgroundColor: ["#16a34a", "#e11d48", "#d97706", "#0284c7", "#7c3aed"],
          borderWidth: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: "bottom", labels: { color: isDark ? "#e7ecf7" : "#1a2233", boxWidth: 12, font: { size: 11 } } } },
      cutout: "65%",
    },
  });
}

function renderRecentActivity(records, employees) {
  const tbody = document.querySelector("#recent-activity-table tbody");
  const sorted = [...records].sort((a, b) => (b.checkIn || "").localeCompare(a.checkIn || "")).slice(0, 8);

  if (!sorted.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-muted" style="text-align:center; padding:24px;">No attendance marked today yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = sorted
    .map((r) => {
      const emp = employees.find((e) => e.id === r.empId);
      return `<tr>
        <td>${emp ? emp.fullName : "Unknown"}</td>
        <td>${r.date}</td>
        <td>${statusBadge(r.status)}</td>
        <td>${r.checkIn || "-"}</td>
        <td>${r.checkOut || "-"}</td>
        <td>${r.remarks || "-"}</td>
      </tr>`;
    })
    .join("");
}
