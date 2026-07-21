// ============================================================
// SHIFT MANAGEMENT PAGE
// ============================================================

import { renderShell } from "./sidebar.js";
import { dbGetAll, dbAdd, dbUpdate, dbDelete, dbQuery } from "./db.js";
import { toast, showLoader } from "./utils.js";

renderShell("shifts", "Shift Management");

let shifts = [];
let employeeCounts = {};

document.addEventListener("shell-ready", init);

async function init() {
  showLoader(true);
  try {
    const [shiftData, employees] = await Promise.all([dbGetAll("shifts"), dbGetAll("employees")]);
    shifts = shiftData;
    employeeCounts = {};
    employees.forEach((e) => {
      if (e.shiftId) employeeCounts[e.shiftId] = (employeeCounts[e.shiftId] || 0) + 1;
    });
    renderShifts();
  } finally {
    showLoader(false);
  }
  bindEvents();
}

function renderShifts() {
  const grid = document.getElementById("shifts-grid");
  if (!shifts.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">No shifts created yet. Click "Create Shift" to add your first one.</div>`;
    return;
  }
  grid.innerHTML = shifts
    .map(
      (s) => `
    <div class="card" data-id="${s.id}">
      <div class="card-head">
        <h3>${s.name}</h3>
        <div class="row-actions">
          <button class="btn-icon edit-btn" title="Edit"><svg viewBox="0 0 24 24" fill="none"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z" stroke="currentColor" stroke-width="1.6"/></svg></button>
          <button class="btn-icon delete-btn" title="Delete"><svg viewBox="0 0 24 24" fill="none"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" stroke="currentColor" stroke-width="1.6"/></svg></button>
        </div>
      </div>
      <p style="font-size: 20px; font-weight:700; margin: 0 0 6px;">${s.startTime} - ${s.endTime}</p>
      <p class="text-muted" style="font-size:13px; margin:0 0 10px;">Grace Time: ${s.graceMinutes || 0} minutes</p>
      <div class="meta-chips mb-16">
        ${(s.weeklyOffDays || []).map((d) => `<span class="meta-chip">${d}</span>`).join("") || `<span class="meta-chip">No weekly off set</span>`}
      </div>
      <p class="text-muted" style="font-size:12.5px;">${s.lateMarkRules || "No late mark rule set."}</p>
      <div class="divider"></div>
      <span class="badge badge-primary">${employeeCounts[s.id] || 0} employees assigned</span>
    </div>`
    )
    .join("");
}

function bindEvents() {
  document.getElementById("add-shift-btn").addEventListener("click", () => openModal());
  document.getElementById("close-modal").addEventListener("click", closeModal);
  document.getElementById("cancel-modal").addEventListener("click", closeModal);
  document.getElementById("save-shift-btn").addEventListener("click", saveShift);

  document.getElementById("shifts-grid").addEventListener("click", (e) => {
    const card = e.target.closest(".card");
    if (!card) return;
    const id = card.dataset.id;
    if (e.target.closest(".edit-btn")) openModal(shifts.find((s) => s.id === id));
    if (e.target.closest(".delete-btn")) confirmDelete(id);
  });
}

function openModal(shift = null) {
  document.getElementById("shift-form").reset();
  document.querySelectorAll(".off-day").forEach((cb) => (cb.checked = false));

  if (shift) {
    document.getElementById("shift-modal-title").textContent = "Edit Shift";
    document.getElementById("shift-id").value = shift.id;
    document.getElementById("shift-name").value = shift.name;
    document.getElementById("shift-start").value = shift.startTime;
    document.getElementById("shift-end").value = shift.endTime;
    document.getElementById("shift-grace").value = shift.graceMinutes || 0;
    document.getElementById("shift-lateRules").value = shift.lateMarkRules || "";
    (shift.weeklyOffDays || []).forEach((day) => {
      const cb = [...document.querySelectorAll(".off-day")].find((c) => c.value === day);
      if (cb) cb.checked = true;
    });
  } else {
    document.getElementById("shift-modal-title").textContent = "Create Shift";
    document.getElementById("shift-id").value = "";
    document.getElementById("shift-grace").value = 15;
  }
  document.getElementById("shift-modal").classList.add("open");
}

function closeModal() {
  document.getElementById("shift-modal").classList.remove("open");
}

async function saveShift() {
  const form = document.getElementById("shift-form");
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }
  const id = document.getElementById("shift-id").value;
  const weeklyOffDays = [...document.querySelectorAll(".off-day:checked")].map((cb) => cb.value);

  const data = {
    name: document.getElementById("shift-name").value.trim(),
    startTime: document.getElementById("shift-start").value,
    endTime: document.getElementById("shift-end").value,
    graceMinutes: Number(document.getElementById("shift-grace").value) || 0,
    weeklyOffDays,
    lateMarkRules: document.getElementById("shift-lateRules").value.trim(),
  };

  showLoader(true);
  try {
    if (id) {
      await dbUpdate("shifts", id, data);
      toast("Shift updated.");
    } else {
      await dbAdd("shifts", data);
      toast("Shift created.");
    }
    shifts = await dbGetAll("shifts");
    renderShifts();
    closeModal();
  } catch (err) {
    toast("Failed to save shift.", "error");
  } finally {
    showLoader(false);
  }
}

async function confirmDelete(id) {
  const inUse = employeeCounts[id] || 0;
  if (inUse > 0 && !confirm(`${inUse} employee(s) are assigned to this shift. Delete anyway?`)) return;
  if (inUse === 0 && !confirm("Delete this shift?")) return;

  showLoader(true);
  try {
    await dbDelete("shifts", id);
    toast("Shift deleted.");
    shifts = await dbGetAll("shifts");
    renderShifts();
  } finally {
    showLoader(false);
  }
}
