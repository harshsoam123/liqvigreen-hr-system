// ============================================================
// ATTENDANCE PAGE: mark/edit attendance per employee per date
// ============================================================

import { renderShell, pushNotification } from "./sidebar.js";
import { dbGetAll, dbQuery, dbSet } from "./db.js";
import { todayStr, statusBadge, toast, showLoader, debounce, computeAttendanceMetrics, recalculateSalaryForEmployee, monthStr } from "./utils.js";

renderShell("attendance", "Attendance Management");

let employees = [];
let shifts = [];
let attendanceRecords = [];
let filtered = [];
let currentPage = 1;
const PAGE_SIZE = 10;
let selectedDate = todayStr();

document.addEventListener("shell-ready", init);

async function init() {
  document.getElementById("date-picker").value = selectedDate;
  showLoader(true);
  try {
    [employees, shifts] = await Promise.all([dbGetAll("employees"), dbGetAll("shifts")]);
    populateDeptFilter();
    await loadAttendanceForDate();
  } finally {
    showLoader(false);
  }
  bindEvents();
}

function populateDeptFilter() {
  const depts = [...new Set(employees.map((e) => e.department).filter(Boolean))];
  document.getElementById("filter-department").innerHTML += depts.map((d) => `<option value="${d}">${d}</option>`).join("");
}

async function loadAttendanceForDate() {
  attendanceRecords = await dbQuery("attendance", [["date", "==", selectedDate]]);
  applyFilters();
}

function applyFilters() {
  const q = document.getElementById("search-input").value.trim().toLowerCase();
  const dept = document.getElementById("filter-department").value;
  const status = document.getElementById("filter-status").value;

  const activeEmployees = employees.filter((e) => e.status !== "inactive");

  filtered = activeEmployees
    .filter((e) => {
      const matchQ = !q || e.fullName?.toLowerCase().includes(q) || e.empCode?.toLowerCase().includes(q);
      const matchDept = !dept || e.department === dept;
      return matchQ && matchDept;
    })
    .map((e) => {
      const record = attendanceRecords.find((a) => a.empId === e.id) || null;
      return { employee: e, record };
    })
    .filter((row) => !status || row.record?.status === status);

  currentPage = 1;
  renderTable();
}

function renderTable() {
  const tbody = document.getElementById("attendance-tbody");
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(start, start + PAGE_SIZE);

  if (!pageItems.length) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:30px;" class="text-muted">No matching employees.</td></tr>`;
  } else {
    tbody.innerHTML = pageItems
      .map(({ employee: e, record: r }) => `
        <tr data-emp-id="${e.id}">
          <td><div style="font-weight:600;">${e.fullName}</div><div class="text-muted" style="font-size: 0.75rem;">${e.empCode}</div></td>
          <td>${e.department || "-"}</td>
          <td>${r ? statusBadge(r.status) : `<span class="badge badge-muted">Not Marked</span>`}</td>
          <td>${r?.checkIn || "-"}</td>
          <td>${r?.checkOut || "-"}</td>
          <td>${r?.workingHours ?? "-"}</td>
          <td>${r?.overtimeHours ?? "-"}</td>
          <td>${sourceCell(r)}</td>
          <td>${r?.remarks || "-"}</td>
          <td><button class="btn btn-sm btn-outline mark-btn">${r ? "Edit" : "Mark"}</button></td>
        </tr>`)
      .join("");
  }
  renderPagination();
}

function sourceCell(r) {
  if (!r) return "-";
  if (r.source === "employee_portal") {
    const loc = r.checkInLocation || r.checkOutLocation;
    const locLink = loc ? ` &middot; <a class="link-primary" href="https://www.google.com/maps?q=${loc.lat},${loc.lng}" target="_blank" rel="noopener">📍 Map</a>` : "";
    return `<span class="badge badge-info">Self Punch</span>${locLink}`;
  }
  return `<span class="badge badge-muted">Admin</span>`;
}

function renderPagination() {
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pag = document.getElementById("pagination");
  let html = "";
  for (let i = 1; i <= totalPages; i++) html += `<button class="${i === currentPage ? "active" : ""}" data-page="${i}">${i}</button>`;
  pag.innerHTML = html;
  pag.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { currentPage = Number(b.dataset.page); renderTable(); }));
}

function bindEvents() {
  document.getElementById("search-input").addEventListener("input", debounce(applyFilters, 250));
  document.getElementById("filter-department").addEventListener("change", applyFilters);
  document.getElementById("filter-status").addEventListener("change", applyFilters);
  document.getElementById("date-picker").addEventListener("change", async (e) => {
    selectedDate = e.target.value;
    showLoader(true);
    await loadAttendanceForDate();
    showLoader(false);
  });

  document.getElementById("attendance-tbody").addEventListener("click", (e) => {
    if (!e.target.closest(".mark-btn")) return;
    const row = e.target.closest("tr");
    const empId = row.dataset.empId;
    openModal(empId);
  });

  document.getElementById("close-modal").addEventListener("click", closeModal);
  document.getElementById("cancel-modal").addEventListener("click", closeModal);
  document.getElementById("save-attendance-btn").addEventListener("click", saveAttendance);

  // Bulk import (biometric machine export - any brand)
  document.getElementById("import-attendance-btn").addEventListener("click", () => {
    resetImportUI();
    document.getElementById("import-file").value = "";
    document.getElementById("import-modal").classList.add("open");
  });
  document.getElementById("close-import-modal").addEventListener("click", () => document.getElementById("import-modal").classList.remove("open"));
  document.getElementById("cancel-import-modal").addEventListener("click", () => document.getElementById("import-modal").classList.remove("open"));
  document.getElementById("import-file").addEventListener("change", handleImportFileSelected);
  document.getElementById("import-process-btn").addEventListener("click", processImport);
  bindImportMappingEvents();
}

function openModal(empId) {
  const employee = employees.find((e) => e.id === empId);
  const record = attendanceRecords.find((a) => a.empId === empId);

  document.getElementById("attendance-form").reset();
  document.getElementById("att-empId").value = empId;
  document.getElementById("att-empName").value = `${employee.fullName} (${employee.empCode})`;
  document.getElementById("att-date").value = selectedDate;
  document.getElementById("att-recordId").value = record ? record.id : "";
  document.getElementById("att-status").value = record?.status || "present";
  document.getElementById("att-checkIn").value = record?.checkIn || "";
  document.getElementById("att-checkOut").value = record?.checkOut || "";
  document.getElementById("att-remarks").value = record?.remarks || "";

  document.getElementById("attendance-modal").classList.add("open");
}

function closeModal() {
  document.getElementById("attendance-modal").classList.remove("open");
}

async function saveAttendance() {
  const empId = document.getElementById("att-empId").value;
  const date = document.getElementById("att-date").value;
  const status = document.getElementById("att-status").value;
  const checkIn = document.getElementById("att-checkIn").value;
  const checkOut = document.getElementById("att-checkOut").value;
  const remarks = document.getElementById("att-remarks").value.trim();

  if (!date) {
    toast("Please select a date.", "error");
    return;
  }

  showLoader(true);
  try {
    const employee = employees.find((e) => e.id === empId);
    const shift = shifts.find((s) => s.id === employee?.shiftId);

    const { workingHours, overtimeHours, lateMinutes, earlyExitMinutes } = computeAttendanceMetrics(shift, checkIn, checkOut);

    const recordId = `${empId}_${date}`;
    const data = { empId, date, status, checkIn, checkOut, workingHours, overtimeHours, lateMinutes, earlyExitMinutes, remarks };
    await dbSet("attendance", recordId, data);

    if (status === "late") {
      await pushNotification("late_arrival", `${employee.fullName} marked Late on ${date} (${lateMinutes} min late).`);
    }

    await recalculateSalaryForEmployee(empId, monthStr(new Date(date)));

    toast("Attendance saved & salary recalculated.");
    closeModal();
    if (date === selectedDate) await loadAttendanceForDate();
  } catch (err) {
    console.error(err);
    toast("Failed to save attendance.", "error");
  } finally {
    showLoader(false);
  }
}


// ============================================================
// BULK IMPORT FROM BIOMETRIC MACHINE EXPORT (CSV / Excel)
// ------------------------------------------------------------
// Works with ANY machine/software's export. The header row is
// auto-detected, columns are auto-guessed, and the admin confirms
// (or corrects) the mapping before anything is imported. Dates
// and times are parsed robustly whether the file stores them as
// real Excel dates, Excel serial numbers, or plain text.
// ============================================================

let importHeaders = [];
let importDataRows = []; // array of raw arrays, one per data row
let importHeaderRowIndex = 0;
let parsedImportRows = [];

function handleImportFileSelected(e) {
  const file = e.target.files[0];
  resetImportUI();
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (evt) => {
    try {
      const workbook = window.XLSX.read(evt.target.result, { type: "binary", cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const matrix = window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true });

      const { headerRowIndex, headers } = detectHeaderRow(matrix);
      importHeaderRowIndex = headerRowIndex;
      importHeaders = headers;
      importDataRows = matrix.slice(headerRowIndex + 1).filter((row) => row.some((cell) => String(cell).trim() !== ""));

      if (!importHeaders.length || !importDataRows.length) {
        document.getElementById("import-preview").innerHTML = `<div class="error-text">Could not find any data rows in this file. Please check the export and try again.</div>`;
        return;
      }

      document.getElementById("header-row-hint").textContent =
        `Detected header row ${headerRowIndex + 1} with ${importHeaders.length} column(s) and ${importDataRows.length} data row(s).`;
      populateMappingDropdowns();
      document.getElementById("import-mapping-section").style.display = "block";
    } catch (err) {
      console.error(err);
      document.getElementById("import-preview").innerHTML = `<div class="error-text">Could not read this file. Please upload a valid CSV or Excel export.</div>`;
    }
  };
  reader.readAsBinaryString(file);
}

function resetImportUI() {
  importHeaders = [];
  importDataRows = [];
  document.getElementById("import-mapping-section").style.display = "none";
  document.getElementById("import-preview").innerHTML = "";
  document.getElementById("import-process-btn").disabled = true;
}

// Scans the first ~15 rows for the one that looks most like a header
// row (most cells matching known attendance/employee keywords).
function detectHeaderRow(matrix) {
  const KEYWORDS = [
    "emp", "employee", "code", "id", "no", "name", "date", "time", "in", "out",
    "punch", "check", "enroll", "card", "status", "direction", "mobile", "phone",
  ];
  let bestRow = 0;
  let bestScore = -1;

  const scanLimit = Math.min(matrix.length, 15);
  for (let i = 0; i < scanLimit; i++) {
    const row = matrix[i] || [];
    const nonEmpty = row.filter((c) => String(c).trim() !== "");
    if (nonEmpty.length < 2) continue;
    let score = 0;
    nonEmpty.forEach((cell) => {
      const text = String(cell).trim().toLowerCase();
      if (KEYWORDS.some((k) => text.includes(k))) score++;
    });
    // Prefer rows with more matching, non-numeric-looking header cells
    const allTextLike = nonEmpty.every((c) => isNaN(Number(c)) || String(c).trim() === "");
    if (allTextLike) score += 1;
    if (score > bestScore) {
      bestScore = score;
      bestRow = i;
    }
  }

  const headerRow = matrix[bestRow] || [];
  const headers = headerRow.map((h, i) => (String(h).trim() === "" ? `Column ${i + 1}` : String(h).trim()));
  return { headerRowIndex: bestRow, headers };
}

function populateMappingDropdowns() {
  const options = importHeaders.map((h, i) => `<option value="${i}">${h}</option>`).join("");
  ["map-empColumn", "map-dateColumn", "map-inColumn", "map-outColumn", "map-timeColumn"].forEach((id) => {
    document.getElementById(id).innerHTML = options;
  });

  // Best-guess auto-selection based on header keywords
  selectBestGuess("map-empColumn", ["emp code", "employee code", "empcode", "enroll", "card no", "employee id", "emp id", "id", "code", "name"]);
  selectBestGuess("map-dateColumn", ["date", "att date", "attendance date"]);
  selectBestGuess("map-inColumn", ["in time", "check in", "punch in", "first in", "intime", "in"]);
  selectBestGuess("map-outColumn", ["out time", "check out", "punch out", "last out", "outtime", "out"]);
  selectBestGuess("map-timeColumn", ["punch time", "time", "date time", "timestamp"]);

  // Auto-select match type based on the guessed employee column's header text
  const empGuessIdx = Number(document.getElementById("map-empColumn").value);
  const empHeaderText = (importHeaders[empGuessIdx] || "").toLowerCase();
  document.getElementById("map-matchType").value = empHeaderText.includes("name") ? "name" : empHeaderText.includes("mobile") || empHeaderText.includes("phone") ? "mobile" : "code";
}

function selectBestGuess(selectId, keywords) {
  const select = document.getElementById(selectId);
  let bestIdx = -1;
  let bestScore = -1;
  importHeaders.forEach((h, i) => {
    const text = h.toLowerCase();
    keywords.forEach((k, rank) => {
      if (text.includes(k)) {
        const score = keywords.length - rank; // earlier keywords in the list score higher
        if (score > bestScore) {
          bestScore = score;
          bestIdx = i;
        }
      }
    });
  });
  if (bestIdx >= 0) select.value = String(bestIdx);
}

function getCurrentMapping() {
  const mode = document.querySelector('input[name="punch-mode"]:checked').value;
  return {
    empColumn: Number(document.getElementById("map-empColumn").value),
    matchType: document.getElementById("map-matchType").value,
    dateColumn: Number(document.getElementById("map-dateColumn").value),
    mode,
    inColumn: Number(document.getElementById("map-inColumn").value),
    outColumn: Number(document.getElementById("map-outColumn").value),
    timeColumn: Number(document.getElementById("map-timeColumn").value),
  };
}

// ---------------- Robust date/time cell parsing ----------------
// Handles: JS Date objects (from cellDates:true), Excel serial
// numbers (date or time-of-day fractions), and plain text in
// common formats — so it works regardless of how the source
// software formatted its export.
function parseDateCell(value) {
  if (value instanceof Date && !isNaN(value)) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }
  if (typeof value === "number") {
    const parsed = window.XLSX.SSF.parse_date_code(value);
    if (parsed && parsed.y) return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  const str = String(value || "").trim();
  if (!str) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  const m = str.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (m) return `${m[3]}-${String(m[1]).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}`;
  const d = new Date(str);
  return isNaN(d) ? "" : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseTimeCell(value) {
  if (value instanceof Date && !isNaN(value)) {
    return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
  }
  if (typeof value === "number") {
    const parsed = window.XLSX.SSF.parse_date_code(value);
    if (parsed) return `${String(parsed.H).padStart(2, "0")}:${String(parsed.M).padStart(2, "0")}`;
  }
  const str = String(value || "").trim();
  if (!str) return "";
  // 24-hour "HH:MM" or "HH:MM:SS"
  let m = str.match(/^(\d{1,2}):(\d{2})/);
  if (m && !/am|pm/i.test(str)) return `${String(m[1]).padStart(2, "0")}:${m[2]}`;
  // 12-hour "hh:mm AM/PM"
  m = str.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)/i);
  if (m) {
    let h = Number(m[1]) % 12;
    if (m[3].toLowerCase() === "pm") h += 12;
    return `${String(h).padStart(2, "0")}:${m[2]}`;
  }
  // Full datetime string containing a time part, e.g. "04/07/2026 09:15"
  const dt = new Date(str);
  if (!isNaN(dt)) return `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
  return "";
}

// Some "single time column" exports embed the date too (full punch
// timestamp). This extracts a date from that same cell when present.
function parseDateFromTimeCell(value) {
  if (value instanceof Date && !isNaN(value)) return parseDateCell(value);
  if (typeof value === "number") {
    const parsed = window.XLSX.SSF.parse_date_code(value);
    if (parsed && parsed.y) return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  const str = String(value || "").trim();
  const m = str.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/) || str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[0].length === 10 && m[1].length === 4 ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : `${m[3]}-${String(m[1]).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}`;
  return "";
}

function findEmployeeByMapping(rawValue, matchType) {
  const value = String(rawValue || "").trim().toLowerCase();
  if (!value) return null;
  if (matchType === "code") return employees.find((e) => e.empCode?.toLowerCase() === value);
  if (matchType === "mobile") return employees.find((e) => e.mobile?.replace(/\D/g, "") === value.replace(/\D/g, ""));
  // name match: exact first, then "contains" as a fallback for minor formatting differences
  return (
    employees.find((e) => e.fullName?.trim().toLowerCase() === value) ||
    employees.find((e) => e.fullName?.trim().toLowerCase().includes(value) || value.includes(e.fullName?.trim().toLowerCase()))
  );
}

// Builds normalized { empId, empCode, date, checkIn, checkOut } rows
// from the raw sheet using the confirmed column mapping. Handles both
// "separate In/Out columns" exports and "single punch-log" exports
// (grouping multiple punches per employee per day into first/last).
function buildRowsFromMapping(mapping) {
  const skipped = [];
  let valid = [];

  if (mapping.mode === "separate") {
    importDataRows.forEach((row) => {
      const empRaw = row[mapping.empColumn];
      const dateRaw = row[mapping.dateColumn];
      const date = parseDateCell(dateRaw);
      if (!String(empRaw || "").trim() || !date) return;

      const employee = findEmployeeByMapping(empRaw, mapping.matchType);
      if (!employee) {
        skipped.push(String(empRaw));
        return;
      }

      valid.push({
        empId: employee.id,
        empCode: employee.empCode,
        date,
        checkIn: parseTimeCell(row[mapping.inColumn]),
        checkOut: parseTimeCell(row[mapping.outColumn]),
      });
    });
  } else {
    // Single punch-time column: group raw punches by employee + date
    const groups = new Map(); // key: empId|date -> { employee, date, times: [] }
    importDataRows.forEach((row) => {
      const empRaw = row[mapping.empColumn];
      const timeCellRaw = row[mapping.timeColumn];
      if (!String(empRaw || "").trim() || String(timeCellRaw || "").trim() === "") return;

      const employee = findEmployeeByMapping(empRaw, mapping.matchType);
      if (!employee) {
        skipped.push(String(empRaw));
        return;
      }

      // Prefer a date embedded in the punch-time cell itself; fall back to the separate Date column if selected.
      const embeddedDate = parseDateFromTimeCell(timeCellRaw);
      const fallbackDate = mapping.dateColumn >= 0 ? parseDateCell(row[mapping.dateColumn]) : "";
      const date = embeddedDate || fallbackDate;
      if (!date) return;

      const time = parseTimeCell(timeCellRaw);
      if (!time) return;

      const key = `${employee.id}|${date}`;
      if (!groups.has(key)) groups.set(key, { empId: employee.id, empCode: employee.empCode, date, times: [] });
      groups.get(key).times.push(time);
    });

    valid = [...groups.values()].map((g) => {
      const sorted = [...g.times].sort();
      return { empId: g.empId, empCode: g.empCode, date: g.date, checkIn: sorted[0], checkOut: sorted[sorted.length - 1] };
    });
  }

  return { valid, skipped: [...new Set(skipped)] };
}

function bindImportMappingEvents() {
  document.querySelectorAll('input[name="punch-mode"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      const mode = document.querySelector('input[name="punch-mode"]:checked').value;
      document.getElementById("mode-separate-fields").style.display = mode === "separate" ? "grid" : "none";
      document.getElementById("mode-single-fields").style.display = mode === "single" ? "grid" : "none";
    });
  });

  document.getElementById("preview-mapping-btn").addEventListener("click", () => {
    const mapping = getCurrentMapping();
    const { valid, skipped } = buildRowsFromMapping(mapping);
    parsedImportRows = valid;

    const preview = document.getElementById("import-preview");
    preview.innerHTML = `
      <div class="form-hint" style="margin-bottom:8px;">
        <strong>${valid.length}</strong> attendance row(s) ready to import.
        ${skipped.length ? `<span style="color:var(--danger);"> ${skipped.length} unmatched employee value(s) skipped: ${skipped.slice(0, 8).join(", ")}${skipped.length > 8 ? "…" : ""}</span>` : ""}
      </div>
      ${
        valid.length
          ? `<div class="table-wrap" style="max-height:220px;">
              <table class="data-table">
                <thead><tr><th>Emp Code</th><th>Date</th><th>In Time</th><th>Out Time</th></tr></thead>
                <tbody>${valid.slice(0, 30).map((r) => `<tr><td>${r.empCode}</td><td>${r.date}</td><td>${r.checkIn || "-"}</td><td>${r.checkOut || "-"}</td></tr>`).join("")}</tbody>
              </table>
            </div>
            ${valid.length > 30 ? `<p class="form-hint">...and ${valid.length - 30} more row(s).</p>` : ""}`
          : `<div class="empty-state">No rows matched with this mapping. Try adjusting the column selections above.</div>`
      }
    `;
    document.getElementById("import-process-btn").disabled = valid.length === 0;
  });
}

async function processImport() {
  if (!parsedImportRows.length) return;
  showLoader(true);
  try {
    const monthsTouched = new Set();
    const touchedEmpIds = new Set();
    let successCount = 0;

    for (const row of parsedImportRows) {
      if (!row.checkIn && !row.checkOut) continue;

      const employee = employees.find((e) => e.id === row.empId);
      const shift = shifts.find((s) => s.id === employee?.shiftId);
      const { workingHours, overtimeHours, lateMinutes, earlyExitMinutes } = computeAttendanceMetrics(shift, row.checkIn, row.checkOut);
      const status = lateMinutes > 0 ? "late" : "present";

      await dbSet("attendance", `${row.empId}_${row.date}`, {
        empId: row.empId,
        date: row.date,
        status,
        checkIn: row.checkIn,
        checkOut: row.checkOut,
        workingHours,
        overtimeHours,
        lateMinutes,
        earlyExitMinutes,
        remarks: "Imported from biometric machine",
      });

      monthsTouched.add(monthStr(new Date(row.date)));
      touchedEmpIds.add(row.empId);
      successCount++;
    }

    for (const m of monthsTouched) {
      for (const empId of touchedEmpIds) {
        await recalculateSalaryForEmployee(empId, m);
      }
    }

    toast(`Imported ${successCount} attendance record(s) & recalculated salary.`);
    document.getElementById("import-modal").classList.remove("open");
    await loadAttendanceForDate();
  } catch (err) {
    console.error(err);
    toast("Import failed. Please check the file format.", "error");
  } finally {
    showLoader(false);
  }
}
