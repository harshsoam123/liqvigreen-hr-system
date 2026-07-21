// ============================================================
// LEAVE MANAGEMENT PAGE
// ============================================================

import { renderShell, pushNotification } from "./sidebar.js";
import { dbGetAll, dbAdd, dbUpdate, dbSet } from "./db.js";
import { statusBadge, toast, showLoader, debounce, recalculateSalaryForEmployee, monthStr } from "./utils.js";

renderShell("leaves", "Leave Management");

let employees = [];
let leaves = [];
let filtered = [];

document.addEventListener("shell-ready", init);

async function init() {
  showLoader(true);
  try {
    [employees, leaves] = await Promise.all([dbGetAll("employees"), dbGetAll("leaves")]);
    populateEmployeeSelect();
    applyFilters();
  } finally {
    showLoader(false);
  }
  bindEvents();
}

function populateEmployeeSelect() {
  const sel = document.getElementById("leave-empId");
  sel.innerHTML = employees.map((e) => `<option value="${e.id}">${e.fullName} (${e.empCode})</option>`).join("");
}

function applyFilters() {
  const q = document.getElementById("search-input").value.trim().toLowerCase();
  const status = document.getElementById("filter-status").value;
  const type = document.getElementById("filter-type").value;

  filtered = leaves
    .map((l) => ({ ...l, employee: employees.find((e) => e.id === l.empId) }))
    .filter((l) => {
      const matchQ = !q || l.employee?.fullName?.toLowerCase().includes(q) || l.employee?.empCode?.toLowerCase().includes(q);
      const matchStatus = !status || l.status === status;
      const matchType = !type || l.type === type;
      return matchQ && matchStatus && matchType;
    })
    .sort((a, b) => (b.appliedOn || "").localeCompare(a.appliedOn || ""));

  renderTable();
}

function renderTable() {
  const tbody = document.getElementById("leaves-tbody");
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:30px;" class="text-muted">No leave requests found.</td></tr>`;
    return;
  }
  tbody.innerHTML = filtered
    .map((l) => {
      const days = daysBetween(l.fromDate, l.toDate);
      return `<tr data-id="${l.id}">
        <td>${l.employee ? l.employee.fullName : "Unknown"}</td>
        <td>${l.type}</td>
        <td>${l.fromDate}</td>
        <td>${l.toDate}</td>
        <td>${days}</td>
        <td>${l.reason || "-"}</td>
        <td>${statusBadge(l.status)}</td>
        <td>
          ${
            l.status === "pending"
              ? `<div class="row-actions">
                  <button class="btn btn-sm btn-success approve-btn">Approve</button>
                  <button class="btn btn-sm btn-danger reject-btn">Reject</button>
                </div>`
              : `<span class="text-muted">-</span>`
          }
        </td>
      </tr>`;
    })
    .join("");
}

function daysBetween(from, to) {
  const d1 = new Date(from);
  const d2 = new Date(to);
  return Math.max(1, Math.round((d2 - d1) / 86400000) + 1);
}

function bindEvents() {
  document.getElementById("search-input").addEventListener("input", debounce(applyFilters, 250));
  document.getElementById("filter-status").addEventListener("change", applyFilters);
  document.getElementById("filter-type").addEventListener("change", applyFilters);

  document.getElementById("add-leave-btn").addEventListener("click", () => document.getElementById("leave-modal").classList.add("open"));
  document.getElementById("close-modal").addEventListener("click", closeModal);
  document.getElementById("cancel-modal").addEventListener("click", closeModal);
  document.getElementById("save-leave-btn").addEventListener("click", submitLeave);

  document.getElementById("leaves-tbody").addEventListener("click", async (e) => {
    const row = e.target.closest("tr");
    if (!row) return;
    const id = row.dataset.id;
    if (e.target.closest(".approve-btn")) await handleDecision(id, "approved");
    if (e.target.closest(".reject-btn")) await handleDecision(id, "rejected");
  });
}

function closeModal() {
  document.getElementById("leave-modal").classList.remove("open");
  document.getElementById("leave-form").reset();
}

async function submitLeave() {
  const form = document.getElementById("leave-form");
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }
  const empId = document.getElementById("leave-empId").value;
  const employee = employees.find((e) => e.id === empId);
  const data = {
    empId,
    type: document.getElementById("leave-type").value,
    fromDate: document.getElementById("leave-from").value,
    toDate: document.getElementById("leave-to").value,
    reason: document.getElementById("leave-reason").value.trim(),
    status: "pending",
    appliedOn: new Date().toISOString(),
  };

  showLoader(true);
  try {
    await dbAdd("leaves", data);
    await pushNotification("leave_request", `New leave request from ${employee.fullName} (${data.type}).`);
    toast("Leave request submitted.");
    leaves = await dbGetAll("leaves");
    applyFilters();
    closeModal();
  } finally {
    showLoader(false);
  }
}

async function handleDecision(id, decision) {
  const leave = leaves.find((l) => l.id === id);
  if (!leave) return;
  showLoader(true);
  try {
    await dbUpdate("leaves", id, { status: decision, decidedOn: new Date().toISOString() });

    if (decision === "approved") {
      // Mark each day in the range as "leave" in attendance and recalc salary
      const start = new Date(leave.fromDate);
      const end = new Date(leave.toDate);
      const monthsTouched = new Set();
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split("T")[0];
        await dbSet("attendance", `${leave.empId}_${dateStr}`, {
          empId: leave.empId,
          date: dateStr,
          status: "leave",
          checkIn: "",
          checkOut: "",
          workingHours: 0,
          overtimeHours: 0,
          lateMinutes: 0,
          earlyExitMinutes: 0,
          remarks: `${leave.type} (approved)`,
        });
        monthsTouched.add(monthStr(new Date(dateStr)));
      }
      for (const m of monthsTouched) {
        await recalculateSalaryForEmployee(leave.empId, m);
      }
    }

    toast(`Leave ${decision}.`);
    leaves = await dbGetAll("leaves");
    applyFilters();
  } finally {
    showLoader(false);
  }
}
