// ============================================================
// REPORTS PAGE: generate + export attendance/payroll reports
// ============================================================

import { renderShell } from "./sidebar.js";
import { dbGetAll, dbQuery } from "./db.js";
import { currency, summarizeAttendance, getSalarySettingsFor, showLoader, toast } from "./utils.js";

renderShell("reports", "Reports");

let employees = [];
let shifts = [];
let reportRows = [];

document.addEventListener("shell-ready", init);

async function init() {
  showLoader(true);
  try {
    [employees, shifts] = await Promise.all([dbGetAll("employees"), dbGetAll("shifts")]);
    populateFilters();
    document.getElementById("range-value").value = new Date().toISOString().slice(0, 7);
  } finally {
    showLoader(false);
  }
  bindEvents();
}

function populateFilters() {
  document.getElementById("filter-employee").innerHTML += employees.map((e) => `<option value="${e.id}">${e.fullName} (${e.empCode})</option>`).join("");
  const depts = [...new Set(employees.map((e) => e.department).filter(Boolean))];
  document.getElementById("filter-department").innerHTML += depts.map((d) => `<option value="${d}">${d}</option>`).join("");
  document.getElementById("filter-shift").innerHTML += shifts.map((s) => `<option value="${s.id}">${s.name}</option>`).join("");
}

function bindEvents() {
  document.getElementById("range-type").addEventListener("change", updateRangeInput);
  document.getElementById("generate-btn").addEventListener("click", generateReport);
  document.getElementById("export-pdf-btn").addEventListener("click", exportPDF);
  document.getElementById("export-excel-btn").addEventListener("click", exportExcel);
  document.getElementById("export-csv-btn").addEventListener("click", exportCSV);
  updateRangeInput();
}

function updateRangeInput() {
  const type = document.getElementById("range-type").value;
  const input = document.getElementById("range-value");
  const label = document.getElementById("range-value-label");
  const today = new Date();
  if (type === "date") {
    label.textContent = "Date";
    input.type = "date";
    input.value = today.toISOString().slice(0, 10);
  } else if (type === "week") {
    label.textContent = "Week (pick any date in the week)";
    input.type = "date";
    input.value = today.toISOString().slice(0, 10);
  } else if (type === "month") {
    label.textContent = "Month";
    input.type = "month";
    input.value = today.toISOString().slice(0, 7);
  } else if (type === "year") {
    label.textContent = "Year";
    input.type = "number";
    input.min = "2000";
    input.max = "2100";
    input.value = today.getFullYear();
  }
}

function getDateRange() {
  const type = document.getElementById("range-type").value;
  const value = document.getElementById("range-value").value;

  if (type === "date") return { start: value, end: value, label: value };
  if (type === "month") {
    const [y, m] = value.split("-").map(Number);
    const last = new Date(y, m, 0).getDate();
    return { start: `${value}-01`, end: `${value}-${String(last).padStart(2, "0")}`, label: value };
  }
  if (type === "year") {
    return { start: `${value}-01-01`, end: `${value}-12-31`, label: value };
  }
  if (type === "week") {
    const d = new Date(value);
    const day = d.getDay();
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((day + 6) % 7));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { start: monday.toISOString().slice(0, 10), end: sunday.toISOString().slice(0, 10), label: `${monday.toISOString().slice(0, 10)} to ${sunday.toISOString().slice(0, 10)}` };
  }
  return { start: value, end: value, label: value };
}

async function generateReport() {
  showLoader(true);
  try {
    const { start, end } = getDateRange();
    const empFilter = document.getElementById("filter-employee").value;
    const deptFilter = document.getElementById("filter-department").value;
    const shiftFilter = document.getElementById("filter-shift").value;

    let targetEmployees = employees.filter((e) => {
      const matchEmp = !empFilter || e.id === empFilter;
      const matchDept = !deptFilter || e.department === deptFilter;
      const matchShift = !shiftFilter || e.shiftId === shiftFilter;
      return matchEmp && matchDept && matchShift;
    });

    const allAttendance = await dbGetAll("attendance");

    reportRows = [];
    for (const emp of targetEmployees) {
      const records = allAttendance.filter((a) => a.empId === emp.id && a.date >= start && a.date <= end);
      const summary = summarizeAttendance(records);
      const settings = await getSalarySettingsFor(emp.id);

      const daysInRange = Math.max(1, dayDiff(start, end) + 1);
      const perDay = Number(emp.monthlySalary || 0) / 30;
      const overtimeRate = Number(settings.overtimeRate || 0) || (perDay / 8) * 1.5;
      const overtimePay = summary.overtimeHours * overtimeRate;

      const grossSalary =
        summary.presentDays * perDay +
        summary.halfDays * perDay * 0.5 +
        overtimePay +
        Number(settings.bonus || 0) +
        Number(settings.incentive || 0) +
        Number(settings.allowances || 0);

      const deductions =
        summary.absentDays * perDay +
        summary.lateCount * Number(settings.lateDeduction || 0) +
        summary.partialExitCount * Number(settings.partialExitDeduction || 0) +
        summary.leaveDays * Number(settings.leaveDeduction || 0) +
        Number(settings.pf || 0) +
        Number(settings.esi || 0) +
        Number(settings.tax || 0) +
        Number(settings.otherDeductions || 0);

      const netSalary = Math.max(0, grossSalary - deductions);

      reportRows.push({
        empName: emp.fullName,
        empCode: emp.empCode,
        department: emp.department || "-",
        ...summary,
        grossSalary: round2(grossSalary),
        totalDeductions: round2(deductions),
        netSalary: round2(netSalary),
      });
    }

    renderReportTable();
    toast(`Report generated for ${reportRows.length} employee(s).`);
  } finally {
    showLoader(false);
  }
}

function dayDiff(start, end) {
  return Math.round((new Date(end) - new Date(start)) / 86400000);
}
function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function renderReportTable() {
  const tbody = document.getElementById("report-tbody");
  document.getElementById("result-count").textContent = `${reportRows.length} employee(s)`;

  if (!reportRows.length) {
    tbody.innerHTML = `<tr><td colspan="13" style="text-align:center;padding:30px;" class="text-muted">No records found for the selected filters.</td></tr>`;
    return;
  }

  tbody.innerHTML = reportRows
    .map(
      (r) => `<tr>
      <td>${r.empName}</td><td>${r.empCode}</td><td>${r.department}</td>
      <td>${r.presentDays}</td><td>${r.absentDays}</td><td>${r.leaveDays}</td><td>${r.halfDays}</td>
      <td>${r.lateCount}</td><td>${r.partialExitCount}</td><td>${r.overtimeHours.toFixed(1)}</td>
      <td>${currency(r.grossSalary)}</td><td>${currency(r.totalDeductions)}</td><td><strong>${currency(r.netSalary)}</strong></td>
    </tr>`
    )
    .join("");
}

// ---------------- EXPORTS ----------------
function ensureData() {
  if (!reportRows.length) {
    toast("Generate a report first.", "error");
    return false;
  }
  return true;
}

function exportPDF() {
  if (!ensureData()) return;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(14);
  doc.text("Attendance & Payroll Report", 14, 15);
  doc.autoTable({
    startY: 22,
    head: [["Employee", "Emp ID", "Dept", "Present", "Absent", "Leave", "Half Day", "Late", "Partial Exit", "OT Hrs", "Gross", "Deductions", "Net Salary"]],
    body: reportRows.map((r) => [
      r.empName, r.empCode, r.department, r.presentDays, r.absentDays, r.leaveDays, r.halfDays,
      r.lateCount, r.partialExitCount, r.overtimeHours.toFixed(1), r.grossSalary, r.totalDeductions, r.netSalary,
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [20, 184, 138] },
  });
  doc.save("attendance-payroll-report.pdf");
}

function exportExcel() {
  if (!ensureData()) return;
  const ws = window.XLSX.utils.json_to_sheet(reportRows.map(flattenRow));
  const wb = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(wb, ws, "Report");
  window.XLSX.writeFile(wb, "attendance-payroll-report.xlsx");
}

function exportCSV() {
  if (!ensureData()) return;
  const rows = reportRows.map(flattenRow);
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => `"${r[h]}"`).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "attendance-payroll-report.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function flattenRow(r) {
  return {
    Employee: r.empName,
    "Emp ID": r.empCode,
    Department: r.department,
    Present: r.presentDays,
    Absent: r.absentDays,
    Leave: r.leaveDays,
    "Half Day": r.halfDays,
    Late: r.lateCount,
    "Partial Exit": r.partialExitCount,
    "OT Hours": r.overtimeHours.toFixed(1),
    "Gross Salary": r.grossSalary,
    Deductions: r.totalDeductions,
    "Net Salary": r.netSalary,
  };
}
