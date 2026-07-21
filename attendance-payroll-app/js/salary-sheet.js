// ============================================================
// MONTHLY SALARY SHEET
// Replicates a traditional payroll register: Paid Leave, Leave
// Settlement, Basic/HRA/Allowance breakup, Advance Settlement.
// ============================================================

import { renderShell } from "./sidebar.js";
import { dbGetAll, dbSet, dbUpdate, dbAdd, dbGetById } from "./db.js";
import { currency, daysInMonth, summarizeAttendance, getSalarySettingsFor, toast, showLoader } from "./utils.js";

renderShell("salary-sheet", "Monthly Salary Sheet");

let employees = [];
let shifts = [];
let structureDefaults = { paidLeavesPerMonth: 3, basicPercent: 50, hraPercent: 25, allowancePercent: 25 };
let sheetRows = []; // live editable row data, keyed by array index
let currentMonth = "";

document.addEventListener("shell-ready", init);

async function init() {
  const now = new Date();
  currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  document.getElementById("month-picker").value = currentMonth;

  showLoader(true);
  try {
    [employees, shifts] = await Promise.all([dbGetAll("employees"), dbGetAll("shifts")]);
    const defaultSettings = (await dbGetById("salarySettings", "default")) || {};
    structureDefaults = {
      paidLeavesPerMonth: Number(defaultSettings.paidLeavesPerMonth) || 3,
      basicPercent: Number(defaultSettings.basicPercent) || 50,
      hraPercent: Number(defaultSettings.hraPercent) || 25,
      allowancePercent: Number(defaultSettings.allowancePercent) || 25,
    };
  } finally {
    showLoader(false);
  }

  bindEvents();
}

function bindEvents() {
  document.getElementById("generate-btn").addEventListener("click", generateSheet);
  document.getElementById("save-sheet-btn").addEventListener("click", saveSheet);
  document.getElementById("export-excel-btn").addEventListener("click", exportExcel);

  document.getElementById("sheet-tbody").addEventListener("input", (e) => {
    const input = e.target.closest("input[data-field]");
    if (!input) return;
    const idx = Number(input.dataset.idx);
    const field = input.dataset.field;
    sheetRows[idx][field] = Number(input.value) || 0;
    recomputeRow(idx);
    updateRowDOM(idx);
  });
}

// ---------------- ROW CALCULATION ----------------
function recomputeRow(idx) {
  const row = sheetRows[idx];
  const monthDays = daysInMonth(currentMonth);

  row.balanceLeave = round2(row.totalLeave - row.usedLeaveOpening);
  row.remainLeave = round2(row.balanceLeave - row.leaveThisMonth + row.sundayWorking);
  row.workingDays = round2(monthDays - row.leaveThisMonth);

  const perDay = row.salaryRate / monthDays;
  row.leaveDeduction = row.remainLeave < 0 ? round2(Math.abs(row.remainLeave) * perDay) : 0;
  row.salary = round2(row.salaryRate - row.leaveDeduction);

  row.basic = round2((row.salary * structureDefaults.basicPercent) / 100);
  row.hra = round2((row.salary * structureDefaults.hraPercent) / 100);
  row.otherAllowance = round2(row.salary - row.basic - row.hra);

  row.balanceAdv = round2(row.previousAdv - row.advDeduction);
  row.netPay = round2(row.salary - row.pf - row.esi - row.tds - row.advDeduction);
}

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

// ---------------- GENERATE SHEET ----------------
async function generateSheet() {
  currentMonth = document.getElementById("month-picker").value;
  if (!currentMonth) {
    toast("Please pick a month.", "error");
    return;
  }

  showLoader(true);
  try {
    const activeEmployees = employees.filter((e) => e.status !== "inactive");
    const allAttendance = await dbGetAll("attendance");
    const monthDays = daysInMonth(currentMonth);

    sheetRows = [];
    for (const emp of activeEmployees) {
      const shift = shifts.find((s) => s.id === emp.shiftId);
      const settings = await getSalarySettingsFor(emp.id);
      const records = allAttendance.filter((a) => a.empId === emp.id && a.date.startsWith(currentMonth));
      const summary = summarizeAttendance(records);

      const leaveThisMonth = round2(summary.leaveDays + summary.halfDays * 0.5);

      // Sunday Working = employee showed up (present/late/half-day/WFH) on one of
      // their shift's weekly-off days during this month.
      let sundayWorking = 0;
      if (shift && shift.weeklyOffDays?.length) {
        const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
        records.forEach((r) => {
          const weekday = weekdayNames[new Date(r.date).getDay()];
          if (shift.weeklyOffDays.includes(weekday) && ["present", "late", "half_day", "work_from_home", "partial_exit"].includes(r.status)) {
            sundayWorking++;
          }
        });
      }

      const totalLeave = emp.paidLeavesPerMonth ?? structureDefaults.paidLeavesPerMonth;

      const row = {
        empId: emp.id,
        empCode: emp.empCode,
        name: emp.fullName,
        totalLeave,
        usedLeaveOpening: emp.leaveUsedOpening || 0,
        leaveThisMonth,
        sundayWorking,
        salaryRate: Number(emp.monthlySalary || 0),
        pf: Number(settings.pf || 0),
        esi: Number(settings.esi || 0),
        tds: Number(settings.tax || 0),
        previousAdv: Number(emp.advanceBalance || 0),
        advDeduction: 0,
      };
      sheetRows.push(row);
    }

    sheetRows.forEach((_, idx) => recomputeRow(idx));
    renderTable();
    toast(`Salary sheet generated for ${sheetRows.length} employee(s). Review and adjust before saving.`);
  } finally {
    showLoader(false);
  }
}

// ---------------- RENDER ----------------
function renderTable() {
  const tbody = document.getElementById("sheet-tbody");
  if (!sheetRows.length) {
    tbody.innerHTML = `<tr><td colspan="22" style="text-align:center;padding:30px;" class="text-muted">No active employees found.</td></tr>`;
    return;
  }

  tbody.innerHTML = sheetRows
    .map(
      (row, idx) => `
    <tr data-idx="${idx}">
      <td>${idx + 1}</td>
      <td style="font-weight:600;">${row.name}<div class="text-muted" style="font-size:11px;">${row.empCode}</div></td>
      <td><input type="number" step="0.5" data-idx="${idx}" data-field="totalLeave" value="${row.totalLeave}" /></td>
      <td><input type="number" step="0.5" data-idx="${idx}" data-field="usedLeaveOpening" value="${row.usedLeaveOpening}" /></td>
      <td class="computed-cell" id="balanceLeave-${idx}">${row.balanceLeave}</td>
      <td><input type="number" step="0.5" data-idx="${idx}" data-field="leaveThisMonth" value="${row.leaveThisMonth}" /></td>
      <td><input type="number" step="0.5" data-idx="${idx}" data-field="sundayWorking" value="${row.sundayWorking}" /></td>
      <td class="computed-cell ${row.remainLeave < 0 ? "negative-cell" : ""}" id="remainLeave-${idx}">${row.remainLeave}</td>
      <td class="computed-cell" id="workingDays-${idx}">${row.workingDays}</td>
      <td class="computed-cell ${row.leaveDeduction > 0 ? "negative-cell" : ""}" id="leaveDeduction-${idx}">${currency(row.leaveDeduction)}</td>
      <td>${currency(row.salaryRate)}</td>
      <td class="computed-cell" id="salary-${idx}">${currency(row.salary)}</td>
      <td class="computed-cell" id="basic-${idx}">${currency(row.basic)}</td>
      <td class="computed-cell" id="hra-${idx}">${currency(row.hra)}</td>
      <td class="computed-cell" id="otherAllowance-${idx}">${currency(row.otherAllowance)}</td>
      <td><input type="number" step="0.01" data-idx="${idx}" data-field="pf" value="${row.pf}" /></td>
      <td><input type="number" step="0.01" data-idx="${idx}" data-field="esi" value="${row.esi}" /></td>
      <td><input type="number" step="0.01" data-idx="${idx}" data-field="tds" value="${row.tds}" /></td>
      <td>${currency(row.previousAdv)}</td>
      <td><input type="number" step="0.01" data-idx="${idx}" data-field="advDeduction" value="${row.advDeduction}" /></td>
      <td class="computed-cell" id="balanceAdv-${idx}">${currency(row.balanceAdv)}</td>
      <td class="computed-cell" id="netPay-${idx}" style="font-size:14px;">${currency(row.netPay)}</td>
    </tr>`
    )
    .join("");
}

function updateRowDOM(idx) {
  const row = sheetRows[idx];
  document.getElementById(`balanceLeave-${idx}`).textContent = row.balanceLeave;
  const remainCell = document.getElementById(`remainLeave-${idx}`);
  remainCell.textContent = row.remainLeave;
  remainCell.classList.toggle("negative-cell", row.remainLeave < 0);
  document.getElementById(`workingDays-${idx}`).textContent = row.workingDays;
  const deductionCell = document.getElementById(`leaveDeduction-${idx}`);
  deductionCell.textContent = currency(row.leaveDeduction);
  deductionCell.classList.toggle("negative-cell", row.leaveDeduction > 0);
  document.getElementById(`salary-${idx}`).textContent = currency(row.salary);
  document.getElementById(`basic-${idx}`).textContent = currency(row.basic);
  document.getElementById(`hra-${idx}`).textContent = currency(row.hra);
  document.getElementById(`otherAllowance-${idx}`).textContent = currency(row.otherAllowance);
  document.getElementById(`balanceAdv-${idx}`).textContent = currency(row.balanceAdv);
  document.getElementById(`netPay-${idx}`).textContent = currency(row.netPay);
}

// ---------------- SAVE ----------------
async function saveSheet() {
  if (!sheetRows.length) {
    toast("Generate the sheet first.", "error");
    return;
  }
  if (!confirm(`Save this salary sheet for ${currentMonth}? This will update each employee's leave balance, advance balance, and salary history.`)) return;

  showLoader(true);
  try {
    for (const row of sheetRows) {
      await dbSet("salaryRecords", `${row.empId}_${currentMonth}`, {
        empId: row.empId,
        empCode: row.empCode,
        empName: row.name,
        month: currentMonth,
        totalLeave: row.totalLeave,
        usedLeaveOpening: row.usedLeaveOpening,
        balanceLeave: row.balanceLeave,
        leaveThisMonth: row.leaveThisMonth,
        sundayWorking: row.sundayWorking,
        remainLeave: row.remainLeave,
        workingDays: row.workingDays,
        leaveDeduction: row.leaveDeduction,
        perDaySalary: round2(row.salaryRate / daysInMonth(currentMonth)),
        salaryRate: row.salaryRate,
        grossSalary: row.salaryRate,
        salary: row.salary,
        basic: row.basic,
        hra: row.hra,
        otherAllowance: row.otherAllowance,
        pf: row.pf,
        esi: row.esi,
        tds: row.tds,
        totalDeductions: round2(row.pf + row.esi + row.tds + row.leaveDeduction + row.advDeduction),
        previousAdvance: row.previousAdv,
        advDeduction: row.advDeduction,
        balanceAdvance: row.balanceAdv,
        netSalary: row.netPay,
        generatedOn: new Date().toISOString(),
      });

      // Roll leave & advance balances forward for next month
      await dbUpdate("employees", row.empId, {
        leaveUsedOpening: round2(row.usedLeaveOpening + row.leaveThisMonth),
        advanceBalance: row.balanceAdv,
      });

      if (row.advDeduction > 0) {
        await dbAdd("advances", {
          empId: row.empId,
          type: "deduction",
          amount: row.advDeduction,
          month: currentMonth,
          date: new Date().toISOString(),
          remarks: `Deducted in ${currentMonth} salary`,
        });
      }
    }

    employees = await dbGetAll("employees");
    toast(`Salary sheet for ${currentMonth} saved. Leave & advance balances rolled forward.`);
  } catch (err) {
    console.error(err);
    toast("Failed to save salary sheet.", "error");
  } finally {
    showLoader(false);
  }
}

// ---------------- EXPORT (matches the grouped-header spreadsheet layout) ----------------
function exportExcel() {
  if (!sheetRows.length) {
    toast("Generate the sheet first.", "error");
    return;
  }

  const header1 = [
    "S.NO", "NAME", "PAID LEAVE", "", "", "LEAVE SETTLEMENT", "", "", "WORKING DAY", "LEAVE DEDUCTION",
    "SALARY RATE", "SALARY", "BASIC SALARY", "HRA", "OTHER ALLOWANCE", "PF", "ESI", "TDS",
    "ADVANCE SETTLEMENT", "", "", "NET PAY",
  ];
  const header2 = [
    "", "", "Total Leave", "Used Leave", "Balance Leave", "Leave for this month", "Sunday Working", "Remain Leave",
    "", "", "", "", "", "", "", "", "", "", "Previous Adv", "Adv Deduction", "Balance Adv", "",
  ];

  const body = sheetRows.map((row, idx) => [
    idx + 1, row.name, row.totalLeave, row.usedLeaveOpening, row.balanceLeave,
    row.leaveThisMonth, row.sundayWorking, row.remainLeave, row.workingDays, row.leaveDeduction,
    row.salaryRate, row.salary, row.basic, row.hra, row.otherAllowance, row.pf, row.esi, row.tds,
    row.previousAdv, row.advDeduction, row.balanceAdv, row.netPay,
  ]);

  const aoa = [[`SALARY FOR THE MONTH OF ${monthLabel(currentMonth)}`], header1, header2, ...body];
  const ws = window.XLSX.utils.aoa_to_sheet(aoa);

  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 21 } },
    { s: { r: 1, c: 0 }, e: { r: 2, c: 0 } }, // S.No
    { s: { r: 1, c: 1 }, e: { r: 2, c: 1 } }, // Name
    { s: { r: 1, c: 2 }, e: { r: 1, c: 4 } }, // Paid Leave
    { s: { r: 1, c: 5 }, e: { r: 1, c: 7 } }, // Leave Settlement
    { s: { r: 1, c: 8 }, e: { r: 2, c: 8 } }, // Working Day
    { s: { r: 1, c: 9 }, e: { r: 2, c: 9 } }, // Leave Deduction
    { s: { r: 1, c: 10 }, e: { r: 2, c: 10 } },
    { s: { r: 1, c: 11 }, e: { r: 2, c: 11 } },
    { s: { r: 1, c: 12 }, e: { r: 2, c: 12 } },
    { s: { r: 1, c: 13 }, e: { r: 2, c: 13 } },
    { s: { r: 1, c: 14 }, e: { r: 2, c: 14 } },
    { s: { r: 1, c: 15 }, e: { r: 2, c: 15 } },
    { s: { r: 1, c: 16 }, e: { r: 2, c: 16 } },
    { s: { r: 1, c: 17 }, e: { r: 2, c: 17 } },
    { s: { r: 1, c: 18 }, e: { r: 1, c: 20 } }, // Advance Settlement
    { s: { r: 1, c: 21 }, e: { r: 2, c: 21 } }, // Net Pay
  ];

  const wb = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(wb, ws, "Salary Sheet");
  window.XLSX.writeFile(wb, `salary-sheet-${currentMonth}.xlsx`);
}

function monthLabel(monthKey) {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" }).toUpperCase();
}
