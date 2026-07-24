// ============================================================
// EMPLOYEE PORTAL SHELL — sidebar + top navbar
// Reuses the same CSS classes as the admin sidebar for a
// consistent look, but with employee-only nav items and no
// access to any admin pages.
// ============================================================

import { requireEmployeeAuth, employeeLogout } from "./employee-auth.js";

const NAV_ITEMS = [
  { href: "dashboard.html", label: "Dashboard", icon: "grid", key: "dashboard" },
  { href: "attendance.html", label: "Attendance", icon: "check-square", key: "attendance" },
  { href: "leaves.html", label: "Leaves", icon: "calendar", key: "leaves" },
];

const ICONS = {
  grid: `<path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linejoin="round"/>`,
  "check-square": `<path d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  calendar: `<rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M16 3v4M8 3v4M3 10h18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`,
  bell: `<path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9zM13.73 21a2 2 0 01-3.46 0" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  moon: `<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linejoin="round"/>`,
  sun: `<circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`,
  logout: `<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  menu: `<path d="M3 12h18M3 6h18M3 18h18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
};

function icon(name, cls = "") {
  return `<svg class="${cls}" viewBox="0 0 24 24">${ICONS[name] || ""}</svg>`;
}

export function renderEmployeeShell(activeKey, pageTitle) {
  requireEmployeeAuth((employee) => {
    injectShell(activeKey, pageTitle, employee);
  });
}

function injectShell(activeKey, pageTitle, employee) {
  const shell = document.createElement("div");
  shell.className = "app-shell";

  const navLinks = NAV_ITEMS.map(
    (item) => `
      <a class="nav-link ${item.key === activeKey ? "active" : ""}" href="${item.href}">
        ${icon(item.icon)} <span>${item.label}</span>
      </a>`
  ).join("");

  shell.innerHTML = `
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-brand" style="flex-direction: column; align-items: flex-start; gap: 6px;">
        <img class="sidebar-brand-logo" src="../assets/branding/logo.jpeg" alt="Liqvigreen" />
        <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600;">Employee Portal</span>
      </div>
      <nav class="sidebar-nav">${navLinks}</nav>
      <div class="sidebar-foot">
        <div style="display:flex; align-items:center; gap:10px; padding: 6px 10px 14px;">
          <div class="admin-avatar">${(employee.fullName || "?").charAt(0).toUpperCase()}</div>
          <div style="overflow:hidden;">
            <div style="font-weight:700; font-size: 0.8438rem; white-space:nowrap; text-overflow:ellipsis; overflow:hidden;">${employee.fullName}</div>
            <div class="text-muted" style="font-size: 0.7188rem;">${employee.empCode}</div>
          </div>
        </div>
        <button class="btn btn-outline btn-block" id="emp-logout-btn">${icon("logout")} Logout</button>
      </div>
    </aside>
    <div class="overlay-backdrop sidebar-backdrop" id="sidebar-backdrop"></div>
    <div class="main-wrap">
      <header class="topnav">
        <div class="topnav-left">
          <button class="hamburger" id="hamburger-btn">${icon("menu")}</button>
          <div>
            <div class="page-title">${pageTitle}</div>
            <div class="text-muted" style="font-size: 0.7188rem;">${employee.empCode}</div>
          </div>
        </div>
        <div class="topnav-right">
          <button class="icon-btn" id="theme-toggle" title="Toggle dark mode">${icon("moon")}</button>
          <button class="icon-btn" id="notif-btn" title="Notifications">${icon("bell")}</button>
          <div class="admin-chip">
            <div class="admin-avatar">${(employee.fullName || "?").charAt(0).toUpperCase()}</div>
          </div>
        </div>
      </header>
      <main class="page-content" id="page-content"></main>
    </div>
  `;

  document.body.prepend(shell);

  const existingContent = document.getElementById("app-content");
  if (existingContent) {
    document.getElementById("page-content").appendChild(existingContent);
    existingContent.style.display = "block";
  }

  document.getElementById("emp-logout-btn").addEventListener("click", employeeLogout);

  const sidebarEl = document.getElementById("sidebar");
  const backdrop = document.getElementById("sidebar-backdrop");
  document.getElementById("hamburger-btn").addEventListener("click", () => {
    sidebarEl.classList.toggle("open");
    backdrop.classList.toggle("show");
  });
  backdrop.addEventListener("click", () => {
    sidebarEl.classList.remove("open");
    backdrop.classList.remove("show");
  });

  const themeToggle = document.getElementById("theme-toggle");
  const applyTheme = (theme) => {
    document.documentElement.setAttribute("data-theme", theme);
    themeToggle.innerHTML = theme === "dark" ? icon("sun") : icon("moon");
  };
  applyTheme(localStorage.getItem("theme") || "light");
  themeToggle.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    localStorage.setItem("theme", current);
    applyTheme(current);
  });

  document.dispatchEvent(new CustomEvent("shell-ready", { detail: { employee } }));
}

export async function pushNotificationForAdmin(type, message) {
  const { dbAdd } = await import("../../js/db.js");
  return dbAdd("notifications", { type, message, read: false, createdAt: new Date().toISOString() });
}
