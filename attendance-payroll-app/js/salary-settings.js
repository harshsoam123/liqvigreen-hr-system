// ============================================================
// SALARY SETTINGS PAGE: default rules + per-employee overrides
// ============================================================

import { renderShell } from "./sidebar.js";
import { dbGetAll, dbGetById, dbSet, dbDelete } from "./db.js";
import { toast, showLoader } from "./utils.js";

renderShell("salary-settings", "Salary Settings");

const FIELDS = [
  "overtimeRate", "lateDeduction", "halfDayDeduction", "partialExitDeduction",
  "leaveDeduction", "bonus", "incentive", "allowances", "pf", "esi", "tax", "otherDeductions",
];

const STRUCTURE_FIELDS = ["paidLeavesPerMonth", "basicPercent", "hraPercent", "allowancePercent"];
const STRUCTURE_DEFAULTS = { paidLeavesPerMonth: 3, basicPercent: 50, hraPercent: 25, allowancePercent: 25 };

let employees = [];

document.addEventListener("shell-ready", init);

async function init() {
  showLoader(true);
  try {
    employees = await dbGetAll("employees");
    populateEmployeeSelect();
    await loadDefaultSettings();
    await loadStructureSettings();
    await loadOverrideSettings(employees[0]?.id);
  } finally {
    showLoader(false);
  }
  bindEvents();
}

function populateEmployeeSelect() {
  const sel = document.getElementById("override-emp-select");
  sel.innerHTML = employees.map((e) => `<option value="${e.id}">${e.fullName} (${e.empCode})</option>`).join("");
}

async function loadDefaultSettings() {
  const settings = (await dbGetById("salarySettings", "default")) || {};
  FIELDS.forEach((f) => {
    document.getElementById(`def-${f}`).value = settings[f] ?? "";
  });
}

async function loadStructureSettings() {
  const settings = (await dbGetById("salarySettings", "default")) || {};
  STRUCTURE_FIELDS.forEach((f) => {
    document.getElementById(`struct-${f}`).value = settings[f] ?? STRUCTURE_DEFAULTS[f];
  });
}

async function loadOverrideSettings(empId) {
  if (!empId) return;
  const settings = (await dbGetById("salarySettings", empId)) || {};
  FIELDS.forEach((f) => {
    document.getElementById(`ov-${f}`).value = settings[f] ?? "";
  });
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

  document.getElementById("save-default-btn").addEventListener("click", async () => {
    const data = {};
    FIELDS.forEach((f) => (data[f] = Number(document.getElementById(`def-${f}`).value) || 0));
    showLoader(true);
    try {
      await dbSet("salarySettings", "default", data);
      toast("Default salary rules saved.");
    } finally {
      showLoader(false);
    }
  });

  document.getElementById("save-structure-btn").addEventListener("click", async () => {
    const data = {};
    STRUCTURE_FIELDS.forEach((f) => (data[f] = Number(document.getElementById(`struct-${f}`).value) || 0));
    const total = data.basicPercent + data.hraPercent + data.allowancePercent;
    if (Math.round(total) !== 100) {
      toast(`Basic + HRA + Other Allowance should total 100% (currently ${total}%).`, "error");
      return;
    }
    showLoader(true);
    try {
      await dbSet("salarySettings", "default", data);
      toast("Payroll structure saved.");
    } finally {
      showLoader(false);
    }
  });

  document.getElementById("override-emp-select").addEventListener("change", (e) => loadOverrideSettings(e.target.value));

  document.getElementById("save-override-btn").addEventListener("click", async () => {
    const empId = document.getElementById("override-emp-select").value;
    const data = {};
    FIELDS.forEach((f) => (data[f] = Number(document.getElementById(`ov-${f}`).value) || 0));
    showLoader(true);
    try {
      await dbSet("salarySettings", empId, data);
      toast("Employee-specific salary override saved.");
    } finally {
      showLoader(false);
    }
  });

  document.getElementById("clear-override-btn").addEventListener("click", async () => {
    const empId = document.getElementById("override-emp-select").value;
    showLoader(true);
    try {
      await dbDelete("salarySettings", empId);
      await loadOverrideSettings(empId);
      toast("Override cleared. This employee now uses default rules.");
    } finally {
      showLoader(false);
    }
  });
}
