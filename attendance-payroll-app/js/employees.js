// ============================================================
// EMPLOYEES PAGE: list, search, filter, add/edit/delete, pagination
// ============================================================

import { renderShell } from "./sidebar.js";
import { dbGetAll, dbAdd, dbUpdate, dbDelete, dbQuery, dbSet } from "./db.js";
import { uploadFile } from "./storage-helper.js";
import { nextEmployeeId, currency, statusBadge, toast, showLoader, debounce } from "./utils.js";
import { createEmployeePortalLogin, sendPortalPasswordResetEmail } from "./firebase-secondary.js";

renderShell("employees", "Employee Management");

let allEmployees = [];
let allShifts = [];
let filtered = [];
let currentPage = 1;
const PAGE_SIZE = 8;

document.addEventListener("shell-ready", init);

async function init() {
  showLoader(true);
  try {
    [allEmployees, allShifts] = await Promise.all([dbGetAll("employees"), dbGetAll("shifts")]);
    populateShiftSelects();
    populateDeptFilter();
    applyFilters();
    backfillEmployeeDirectory();
  } finally {
    showLoader(false);
  }
  bindEvents();
}

// One-time sync: employees added before the employeeDirectory /
// Quick Punch feature existed won't have a directory entry yet.
// Fills those in quietly in the background so Quick Punch can find them.
async function backfillEmployeeDirectory() {
  try {
    const directory = await dbGetAll("employeeDirectory");
    const existingIds = new Set(directory.map((d) => d.id));
    const missing = allEmployees.filter((e) => !existingIds.has(e.id));
    for (const e of missing) {
      await dbSet("employeeDirectory", e.id, {
        fullName: e.fullName,
        empCode: e.empCode,
        status: e.status || "active",
        shiftId: e.shiftId || "",
      });
    }
  } catch (err) {
    console.error("employeeDirectory backfill failed:", err);
  }
}

function populateShiftSelects() {
  const shiftFilter = document.getElementById("filter-shift");
  const shiftFormSelect = document.getElementById("emp-shiftId");
  const options = allShifts.map((s) => `<option value="${s.id}">${s.name} (${s.startTime}-${s.endTime})</option>`).join("");
  shiftFilter.innerHTML += options;
  shiftFormSelect.innerHTML = `<option value="">Select Shift</option>` + options;
}

function populateDeptFilter() {
  const depts = [...new Set(allEmployees.map((e) => e.department).filter(Boolean))];
  const sel = document.getElementById("filter-department");
  sel.innerHTML += depts.map((d) => `<option value="${d}">${d}</option>`).join("");
}

function applyFilters() {
  const q = document.getElementById("search-input").value.trim().toLowerCase();
  const dept = document.getElementById("filter-department").value;
  const shift = document.getElementById("filter-shift").value;
  const status = document.getElementById("filter-status").value;

  filtered = allEmployees.filter((e) => {
    const matchQ =
      !q ||
      e.fullName?.toLowerCase().includes(q) ||
      e.empCode?.toLowerCase().includes(q) ||
      e.mobile?.includes(q) ||
      e.department?.toLowerCase().includes(q);
    const matchDept = !dept || e.department === dept;
    const matchShift = !shift || e.shiftId === shift;
    const matchStatus = !status || (e.status || "active") === status;
    return matchQ && matchDept && matchShift && matchStatus;
  });
  currentPage = 1;
  renderTable();
}

function renderTable() {
  const tbody = document.getElementById("employees-tbody");
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(start, start + PAGE_SIZE);

  if (!pageItems.length) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:30px;" class="text-muted">No employees found.</td></tr>`;
  } else {
    tbody.innerHTML = pageItems
      .map((e) => {
        const shift = allShifts.find((s) => s.id === e.shiftId);
        return `<tr data-id="${e.id}">
          <td>
            <div class="emp-cell">
              ${e.photoUrl ? `<img class="emp-avatar" src="${e.photoUrl}" />` : `<div class="emp-avatar">${(e.fullName || "?").charAt(0)}</div>`}
              <div>
                <div style="font-weight:600;">${e.fullName}</div>
                <div class="text-muted" style="font-size: 0.75rem;">${e.email || ""}</div>
              </div>
            </div>
          </td>
          <td>${e.empCode}</td>
          <td>${e.department || "-"}</td>
          <td>${e.designation || "-"}</td>
          <td>${shift ? shift.name : "-"}</td>
          <td>${e.mobile || "-"}</td>
          <td>${currency(e.monthlySalary)}</td>
          <td>${statusBadge(e.status || "active")}</td>
          <td>
            <div class="row-actions">
              <button class="btn-icon view-btn" title="View Profile"><svg viewBox="0 0 24 24" fill="none"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.6"/></svg></button>
              <button class="btn-icon edit-btn" title="Edit"><svg viewBox="0 0 24 24" fill="none"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
              <button class="btn-icon delete-btn" title="Delete"><svg viewBox="0 0 24 24" fill="none"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
            </div>
          </td>
        </tr>`;
      })
      .join("");
  }
  renderPagination();
}

function renderPagination() {
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pag = document.getElementById("pagination");
  let html = "";
  for (let i = 1; i <= totalPages; i++) {
    html += `<button class="${i === currentPage ? "active" : ""}" data-page="${i}">${i}</button>`;
  }
  pag.innerHTML = html;
  pag.querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => {
      currentPage = Number(b.dataset.page);
      renderTable();
    })
  );
}

function bindEvents() {
  document.getElementById("search-input").addEventListener("input", debounce(applyFilters, 250));
  document.getElementById("filter-department").addEventListener("change", applyFilters);
  document.getElementById("filter-shift").addEventListener("change", applyFilters);
  document.getElementById("filter-status").addEventListener("change", applyFilters);

  document.getElementById("add-employee-btn").addEventListener("click", () => openModal());
  document.getElementById("close-modal").addEventListener("click", closeModal);
  document.getElementById("cancel-modal").addEventListener("click", closeModal);
  document.getElementById("save-employee-btn").addEventListener("click", saveEmployee);
  document.getElementById("create-portal-access-btn").addEventListener("click", handleCreatePortalAccess);
  document.getElementById("send-portal-reset-btn").addEventListener("click", handleSendPortalReset);

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      document.getElementById(btn.dataset.tab).classList.add("active");
    });
  });

  document.getElementById("employees-tbody").addEventListener("click", (e) => {
    const row = e.target.closest("tr");
    if (!row) return;
    const id = row.dataset.id;
    if (e.target.closest(".view-btn")) {
      window.location.href = `employee-profile.html?id=${id}`;
    } else if (e.target.closest(".edit-btn")) {
      openModal(allEmployees.find((emp) => emp.id === id));
    } else if (e.target.closest(".delete-btn")) {
      confirmDelete(id);
    } else {
      window.location.href = `employee-profile.html?id=${id}`;
    }
  });
}

function openModal(employee = null) {
  document.getElementById("employee-form").reset();
  document.querySelectorAll(".tab-btn")[0].click();

  if (employee) {
    document.getElementById("modal-title").textContent = "Edit Employee";
    document.getElementById("emp-id").value = employee.id;
    document.getElementById("emp-code").value = employee.empCode;
    document.getElementById("emp-fullName").value = employee.fullName || "";
    document.getElementById("emp-fatherName").value = employee.fatherName || "";
    document.getElementById("emp-mobile").value = employee.mobile || "";
    document.getElementById("emp-email").value = employee.email || "";
    document.getElementById("emp-address").value = employee.address || "";
    document.getElementById("emp-dob").value = employee.dob || "";
    document.getElementById("emp-joiningDate").value = employee.joiningDate || "";
    document.getElementById("emp-status").value = employee.status || "active";
    document.getElementById("emp-department").value = employee.department || "";
    document.getElementById("emp-designation").value = employee.designation || "";
    document.getElementById("emp-shiftId").value = employee.shiftId || "";
    document.getElementById("emp-monthlySalary").value = employee.monthlySalary || "";
    document.getElementById("emp-paidLeavesPerMonth").value = employee.paidLeavesPerMonth ?? "";
    document.getElementById("emp-leaveUsedOpening").value = employee.leaveUsedOpening ?? 0;
    document.getElementById("emp-advanceBalance").value = employee.advanceBalance ?? 0;
    document.getElementById("emp-aadhaarNo").value = employee.aadhaarNo || "";
    document.getElementById("emp-panNo").value = employee.panNo || "";
    document.getElementById("emp-bankAccount").value = employee.bankAccount || "";
    document.getElementById("emp-ifsc").value = employee.ifsc || "";
    document.getElementById("emp-upiId").value = employee.upiId || "";
    document.getElementById("emp-clEntitlement").value = employee.clEntitlement ?? 12;
    document.getElementById("emp-slEntitlement").value = employee.slEntitlement ?? 12;
    document.getElementById("emp-elEntitlement").value = employee.elEntitlement ?? 15;
    document.getElementById("emp-compOffEntitlement").value = employee.compOffEntitlement ?? 0;
    document.getElementById("emp-portalEmail").value = employee.portalEmail || employee.email || "";
    document.getElementById("emp-portalPassword").value = "";
    renderPortalStatus(employee);
  } else {
    document.getElementById("modal-title").textContent = "Add Employee";
    document.getElementById("emp-id").value = "";
    document.getElementById("emp-code").value = nextEmployeeId(allEmployees);
    document.getElementById("emp-status").value = "active";
    document.getElementById("emp-leaveUsedOpening").value = 0;
    document.getElementById("emp-advanceBalance").value = 0;
    document.getElementById("emp-clEntitlement").value = 12;
    document.getElementById("emp-slEntitlement").value = 12;
    document.getElementById("emp-elEntitlement").value = 15;
    document.getElementById("emp-compOffEntitlement").value = 0;
    document.getElementById("emp-portalEmail").value = "";
    document.getElementById("emp-portalPassword").value = "";
    renderPortalStatus(null);
  }
  document.getElementById("employee-modal").classList.add("open");
}

function renderPortalStatus(employee) {
  const badge = document.getElementById("portal-status-badge");
  const resetBtn = document.getElementById("send-portal-reset-btn");
  if (!employee) {
    badge.innerHTML = `<span class="badge badge-muted">Save this employee first, then set up Portal Access.</span>`;
    resetBtn.style.display = "none";
    return;
  }
  if (employee.portalEmail) {
    badge.innerHTML = `<span class="badge badge-success">Portal Access Active</span> <span class="text-muted" style="font-size: 0.7812rem;">Login: ${employee.portalEmail}</span>`;
    resetBtn.style.display = "inline-flex";
  } else {
    badge.innerHTML = `<span class="badge badge-warning">No Portal Access Yet</span>`;
    resetBtn.style.display = "none";
  }
}

function closeModal() {
  document.getElementById("employee-modal").classList.remove("open");
}

async function saveEmployee() {
  const form = document.getElementById("employee-form");
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }
  const id = document.getElementById("emp-id").value;
  const empCode = document.getElementById("emp-code").value;

  showLoader(true);
  try {
    const data = {
      empCode,
      fullName: document.getElementById("emp-fullName").value.trim(),
      fatherName: document.getElementById("emp-fatherName").value.trim(),
      mobile: document.getElementById("emp-mobile").value.trim(),
      email: document.getElementById("emp-email").value.trim(),
      address: document.getElementById("emp-address").value.trim(),
      dob: document.getElementById("emp-dob").value,
      joiningDate: document.getElementById("emp-joiningDate").value,
      status: document.getElementById("emp-status").value,
      department: document.getElementById("emp-department").value.trim(),
      designation: document.getElementById("emp-designation").value.trim(),
      shiftId: document.getElementById("emp-shiftId").value,
      monthlySalary: Number(document.getElementById("emp-monthlySalary").value),
      paidLeavesPerMonth: document.getElementById("emp-paidLeavesPerMonth").value === "" ? null : Number(document.getElementById("emp-paidLeavesPerMonth").value),
      leaveUsedOpening: Number(document.getElementById("emp-leaveUsedOpening").value) || 0,
      advanceBalance: Number(document.getElementById("emp-advanceBalance").value) || 0,
      aadhaarNo: document.getElementById("emp-aadhaarNo").value.trim(),
      panNo: document.getElementById("emp-panNo").value.trim().toUpperCase(),
      bankAccount: document.getElementById("emp-bankAccount").value.trim(),
      ifsc: document.getElementById("emp-ifsc").value.trim().toUpperCase(),
      upiId: document.getElementById("emp-upiId").value.trim(),
      clEntitlement: Number(document.getElementById("emp-clEntitlement").value) || 0,
      slEntitlement: Number(document.getElementById("emp-slEntitlement").value) || 0,
      elEntitlement: Number(document.getElementById("emp-elEntitlement").value) || 0,
      compOffEntitlement: Number(document.getElementById("emp-compOffEntitlement").value) || 0,
    };

    const existing = id ? allEmployees.find((e) => e.id === id) : null;
    const targetId = id || empCode;

    // Handle file uploads (only if a new file was chosen)
    const photoFile = document.getElementById("emp-photo").files[0];
    const aadhaarFile = document.getElementById("emp-aadhaarFile").files[0];
    const panFile = document.getElementById("emp-panFile").files[0];
    const resumeFile = document.getElementById("emp-resumeFile").files[0];
    const otherFiles = Array.from(document.getElementById("emp-otherFiles").files || []);

    data.photoUrl = photoFile ? await uploadFile(photoFile, `documents/${targetId}/photo_${photoFile.name}`) : existing?.photoUrl || null;
    data.aadhaarUrl = aadhaarFile ? await uploadFile(aadhaarFile, `documents/${targetId}/aadhaar_${aadhaarFile.name}`) : existing?.aadhaarUrl || null;
    data.panUrl = panFile ? await uploadFile(panFile, `documents/${targetId}/pan_${panFile.name}`) : existing?.panUrl || null;
    data.resumeUrl = resumeFile ? await uploadFile(resumeFile, `documents/${targetId}/resume_${resumeFile.name}`) : existing?.resumeUrl || null;

    let otherUrls = existing?.otherDocsUrl || [];
    if (otherFiles.length) {
      const uploaded = await Promise.all(otherFiles.map((f) => uploadFile(f, `documents/${targetId}/other_${f.name}`)));
      otherUrls = [...otherUrls, ...uploaded.map((url, i) => ({ name: otherFiles[i].name, url }))];
    }
    data.otherDocsUrl = otherUrls;

    let savedEmpId = id;
    if (id) {
      await dbUpdate("employees", id, data);
      toast("Employee updated successfully.");
    } else {
      savedEmpId = await dbAdd("employees", data);
      toast("Employee added successfully.");
    }

    // Mirror a MINIMAL, non-sensitive record (no salary/bank/Aadhaar/etc.)
    // into employeeDirectory — this is what the no-login Quick Punch page
    // reads from, so it never has access to sensitive employee data.
    await dbSet("employeeDirectory", savedEmpId, {
      fullName: data.fullName,
      empCode: data.empCode,
      status: data.status,
      shiftId: data.shiftId,
    });

    allEmployees = await dbGetAll("employees");
    applyFilters();
    closeModal();
  } catch (err) {
    console.error(err);
    toast("Failed to save employee.", "error");
  } finally {
    showLoader(false);
  }
}

async function handleCreatePortalAccess() {
  const empId = document.getElementById("emp-id").value;
  if (!empId) {
    toast("Save this employee first, then set up Portal Access.", "error");
    return;
  }
  const email = document.getElementById("emp-portalEmail").value.trim();
  const password = document.getElementById("emp-portalPassword").value;
  if (!email) {
    toast("Enter a portal login email.", "error");
    return;
  }
  if (!password || password.length < 6) {
    toast("Password must be at least 6 characters.", "error");
    return;
  }

  showLoader(true);
  try {
    let linkedExisting = false;
    try {
      await createEmployeePortalLogin(email, password);
    } catch (err) {
      if (err?.code === "auth/email-already-in-use") {
        // An account for this email already exists (e.g. an earlier attempt
        // succeeded in Firebase Auth but didn't finish linking it here).
        // Rather than dead-ending, link it to this employee now and send
        // a password reset so a working password can still be set safely.
        linkedExisting = true;
      } else {
        throw err;
      }
    }

    await dbUpdate("employees", empId, { portalEmail: email });
    // Security-rule-friendly lookup doc: lets Firestore rules resolve
    // "which employee am I" from the logged-in portal user's email,
    // without giving them read access to other employees' records.
    await dbSet("portalLinks", email, { empId, empCode: document.getElementById("emp-code").value });
    allEmployees = await dbGetAll("employees");
    const updated = allEmployees.find((e) => e.id === empId);
    renderPortalStatus(updated);
    document.getElementById("emp-portalPassword").value = "";

    if (linkedExisting) {
      await sendPortalPasswordResetEmail(email).catch(() => {});
      toast(`This email already had an account — it's now linked to ${updated.fullName}, and a password reset link was sent to ${email} so they can set their own password.`, "info");
    } else {
      toast(`Portal login created for ${email}. Share the password with them directly.`);
    }
  } catch (err) {
    console.error(err);
    toast("Failed to create portal login.", "error");
  } finally {
    showLoader(false);
  }
}

async function handleSendPortalReset() {
  const email = document.getElementById("emp-portalEmail").value.trim();
  if (!email) return;
  showLoader(true);
  try {
    await sendPortalPasswordResetEmail(email);
    toast(`Password reset email sent to ${email}.`);
  } catch (err) {
    console.error(err);
    toast("Failed to send reset email.", "error");
  } finally {
    showLoader(false);
  }
}

function confirmDelete(id) {
  const emp = allEmployees.find((e) => e.id === id);
  if (!emp) return;
  if (!confirm(`Delete ${emp.fullName} (${emp.empCode})? This will also remove their attendance, leave, and salary records. This cannot be undone.`)) return;
  showLoader(true);
  cascadeDeleteEmployee(id)
    .then(async () => {
      toast("Employee and related records deleted.");
      allEmployees = await dbGetAll("employees");
      applyFilters();
    })
    .catch(() => toast("Failed to delete employee.", "error"))
    .finally(() => showLoader(false));
}

async function cascadeDeleteEmployee(empId) {
  // Remove the employee's attendance, leave, and salary records so
  // dashboard stats / reports never count "orphaned" data.
  const employee = allEmployees.find((e) => e.id === empId);
  const [attendance, leaves, salaryRecords] = await Promise.all([
    dbQuery("attendance", [["empId", "==", empId]]),
    dbQuery("leaves", [["empId", "==", empId]]),
    dbQuery("salaryRecords", [["empId", "==", empId]]),
  ]);

  await Promise.all([
    ...attendance.map((a) => dbDelete("attendance", a.id)),
    ...leaves.map((l) => dbDelete("leaves", l.id)),
    ...salaryRecords.map((s) => dbDelete("salaryRecords", s.id)),
    dbDelete("salarySettings", empId).catch(() => {}), // ignore if no override exists
    dbDelete("employeeDirectory", empId).catch(() => {}),
    employee?.portalEmail ? dbDelete("portalLinks", employee.portalEmail).catch(() => {}) : Promise.resolve(),
  ]);

  await dbDelete("employees", empId);
}
