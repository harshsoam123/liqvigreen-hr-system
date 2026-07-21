// ============================================================
// EMPLOYEE PORTAL — MY LEAVES (balances, apply, history)
// Employees can only ever create leave requests for themselves;
// approval/rejection remains an admin-only action.
// ============================================================

import { renderEmployeeShell, pushNotificationForAdmin } from "./employee-shell.js";
import { dbQuery, dbAdd } from "../../js/db.js";
import { statusBadge, toast, showLoader, computeLeaveBalances } from "../../js/utils.js";

renderEmployeeShell("leaves", "My Leaves");

let employee = null;
let myLeaves = [];

document.addEventListener("shell-ready", (e) => init(e.detail.employee));

async function init(emp) {
  employee = emp;
  showLoader(true);
  try {
    myLeaves = await dbQuery("leaves", [["empId", "==", employee.id]]);
    myLeaves.sort((a, b) => (b.appliedOn || "").localeCompare(a.appliedOn || ""));
    renderBalances();
    renderHistory();
  } finally {
    showLoader(false);
  }
  bindEvents();
}

function renderBalances() {
  const balances = computeLeaveBalances(employee, myLeaves);
  const colorClasses = ["stat-blue", "stat-purple", "stat-green", "stat-orange"];
  document.getElementById("leave-balance-grid").innerHTML = balances
    .map(
      (b, i) => `
    <div class="stat-card ${colorClasses[i % colorClasses.length]}">
      <div class="stat-top">
        <span style="font-weight:700; font-size:13px;">${b.short}</span>
        <span class="text-muted" style="font-size:11.5px;">${b.key.replace(" Leave", "")}</span>
      </div>
      <div class="stat-value">${b.balance}</div>
      <div class="stat-label">${b.used} used / ${b.entitlement} total</div>
    </div>`
    )
    .join("");
}

function renderHistory() {
  const tbody = document.getElementById("leave-history-tbody");
  if (!myLeaves.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:30px;" class="text-muted">You haven't applied for any leave yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = myLeaves
    .map((l) => {
      const days = daysBetween(l.fromDate, l.toDate);
      return `<tr>
        <td>${l.type}</td><td>${l.fromDate}</td><td>${l.toDate}</td><td>${days}</td>
        <td>${l.reason || "-"}</td><td>${statusBadge(l.status)}</td>
        <td>${l.appliedOn ? new Date(l.appliedOn).toLocaleDateString("en-IN") : "-"}</td>
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
  document.getElementById("apply-leave-btn").addEventListener("click", () => {
    document.getElementById("apply-leave-form").reset();
    document.getElementById("apply-leave-modal").classList.add("open");
  });
  document.getElementById("close-apply-modal").addEventListener("click", closeModal);
  document.getElementById("cancel-apply-modal").addEventListener("click", closeModal);
  document.getElementById("submit-leave-btn").addEventListener("click", submitLeave);
}

function closeModal() {
  document.getElementById("apply-leave-modal").classList.remove("open");
}

async function submitLeave() {
  const form = document.getElementById("apply-leave-form");
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }
  const fromDate = document.getElementById("apply-leave-from").value;
  const toDate = document.getElementById("apply-leave-to").value;
  if (new Date(toDate) < new Date(fromDate)) {
    toast("'To Date' cannot be before 'From Date'.", "error");
    return;
  }

  const data = {
    empId: employee.id,
    type: document.getElementById("apply-leave-type").value,
    fromDate,
    toDate,
    reason: document.getElementById("apply-leave-reason").value.trim(),
    status: "pending",
    appliedOn: new Date().toISOString(),
    appliedVia: "employee_portal",
  };

  showLoader(true);
  try {
    await dbAdd("leaves", data);
    await pushNotificationForAdmin("leave_request", `${employee.fullName} applied for ${data.type} (${fromDate} to ${toDate}).`);
    toast("Leave request submitted. Your admin will review it soon.");
    myLeaves = await dbQuery("leaves", [["empId", "==", employee.id]]);
    myLeaves.sort((a, b) => (b.appliedOn || "").localeCompare(a.appliedOn || ""));
    renderBalances();
    renderHistory();
    closeModal();
  } catch (err) {
    console.error(err);
    toast("Failed to submit leave request.", "error");
  } finally {
    showLoader(false);
  }
}
