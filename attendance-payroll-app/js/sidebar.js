// ============================================================
// SHARED SIDEBAR + TOP NAVBAR
// Injected into every dashboard page via renderShell().
// ============================================================

import { requireAuth, logout } from "./auth.js";
import { dbGetAll, dbUpdate } from "./db.js";
import { toast } from "./utils.js";
import { seedDemoDataIfNeeded } from "./seed-demo-data.js";

const NAV_ITEMS = [
  { href: "dashboard.html", label: "Dashboard", icon: "grid", key: "dashboard" },
  { href: "employees.html", label: "Employees", icon: "users", key: "employees" },
  { href: "attendance.html", label: "Attendance", icon: "check-square", key: "attendance" },
  { href: "shifts.html", label: "Shifts", icon: "clock", key: "shifts" },
  { href: "leaves.html", label: "Leave Requests", icon: "calendar", key: "leaves" },
  { href: "salary-settings.html", label: "Salary Settings", icon: "settings", key: "salary-settings" },
  { href: "salary-sheet.html", label: "Monthly Salary Sheet", icon: "sheet", key: "salary-sheet" },
  { href: "reports.html", label: "Reports", icon: "bar-chart", key: "reports" },
];

const ICONS = {
  grid: `<path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linejoin="round"/>`,
  users: `<path d="M17 21v-2a4 4 0 00-4-4H7a4 4 0 00-4 4v2M10 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  "check-square": `<path d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  clock: `<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M12 7v5l3 3" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  calendar: `<rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M16 3v4M8 3v4M3 10h18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`,
  settings: `<circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  "bar-chart": `<path d="M18 20V10M12 20V4M6 20v-6" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  sheet: `<rect x="4" y="3" width="16" height="18" rx="1.5" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>`,
  bell: `<path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9zM13.73 21a2 2 0 01-3.46 0" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  moon: `<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linejoin="round"/>`,
  sun: `<circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`,
  logout: `<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  menu: `<path d="M3 12h18M3 6h18M3 18h18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
};

function icon(name, cls = "") {
  return `<svg class="${cls}" viewBox="0 0 24 24">${ICONS[name] || ""}</svg>`;
}

export function renderShell(activeKey, pageTitle) {
  requireAuth(async (user) => {
    await seedDemoDataIfNeeded();
    injectShell(activeKey, pageTitle, user);
  });
}

function injectShell(activeKey, pageTitle, user) {
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
      <div class="sidebar-brand">
        <img class="sidebar-brand-logo" src="../assets/branding/logo.jpeg" alt="Liqvigreen" />
      </div>
      <nav class="sidebar-nav">${navLinks}</nav>
      <div class="sidebar-foot">
        <button class="btn btn-outline btn-block" id="logout-btn">${icon("logout")} Logout</button>
        <a href="../employee-portal/index.html" target="_blank" rel="noopener" class="text-muted" style="display:block; text-align:center; font-size:11.5px; margin-top:10px;">Employee Portal ↗</a>
      </div>
    </aside>
    <div class="overlay-backdrop sidebar-backdrop" id="sidebar-backdrop"></div>
    <div class="main-wrap">
      <header class="topnav">
        <div class="topnav-left">
          <button class="hamburger" id="hamburger-btn">${icon("menu")}</button>
          <div class="page-title">${pageTitle}</div>
        </div>
        <div class="topnav-right">
          <button class="icon-btn" id="theme-toggle" title="Toggle dark mode">${icon("moon")}</button>
          <button class="icon-btn" id="notif-btn" title="Notifications">
            ${icon("bell")}
            <span class="notif-dot" id="notif-dot" style="display:none;"></span>
          </button>
          <div class="notif-panel" id="notif-panel"></div>
          <div class="admin-chip">
            <div class="admin-avatar">${(user.email || "A").charAt(0).toUpperCase()}</div>
          </div>
        </div>
      </header>
      <main class="page-content" id="page-content"></main>
    </div>
  `;

  document.body.prepend(shell);

  // Move any pre-existing page body content into #page-content
  const existingContent = document.getElementById("app-content");
  if (existingContent) {
    document.getElementById("page-content").appendChild(existingContent);
    existingContent.style.display = "block";
  }

  // Logout
  document.getElementById("logout-btn").addEventListener("click", logout);

  // Mobile sidebar toggle
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

  // Dark mode
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

  // Notifications
  setupNotifications();

  document.dispatchEvent(new CustomEvent("shell-ready"));
}

async function setupNotifications() {
  const btn = document.getElementById("notif-btn");
  const panel = document.getElementById("notif-panel");
  const dot = document.getElementById("notif-dot");

  let notifications = [];
  try {
    notifications = await dbGetAll("notifications");
    notifications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } catch (e) {
    notifications = [];
  }

  const unread = notifications.filter((n) => !n.read);
  dot.style.display = unread.length ? "block" : "none";

  panel.innerHTML = notifications.length
    ? notifications
        .slice(0, 15)
        .map(
          (n) => `
      <div class="notif-item ${n.read ? "" : "unread"}">
        <div>${n.message}</div>
        <div class="n-time">${new Date(n.createdAt).toLocaleString()}</div>
      </div>`
        )
        .join("")
    : `<div class="notif-item text-muted">No notifications yet.</div>`;

  btn.addEventListener("click", async () => {
    panel.classList.toggle("open");
    if (panel.classList.contains("open") && unread.length) {
      dot.style.display = "none";
      for (const n of unread) {
        await dbUpdate("notifications", n.id, { read: true }).catch(() => {});
      }
    }
  });

  document.addEventListener("click", (e) => {
    if (!panel.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
      panel.classList.remove("open");
    }
  });
}

export async function pushNotification(type, message) {
  const { dbAdd } = await import("./db.js");
  return dbAdd("notifications", { type, message, read: false, createdAt: new Date().toISOString() });
}
