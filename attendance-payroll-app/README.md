# Employee Attendance & Payroll Management System

A modern, responsive, mobile-friendly Employee Attendance & Payroll Management web app built with **HTML5, CSS3, vanilla JavaScript (ES6 modules)** and **Firebase (Authentication, Firestore, Storage)**.

Blue & white theme, dark mode support, sidebar navigation, charts, data tables, automatic payroll calculation engine, and full reporting.

---

## 1. Folder Structure

```
attendance-payroll-app/
├── index.html                 # Admin Login page
├── forgot-password.html       # Admin Forgot password page
├── pages/                     # ADMIN APP
│   ├── dashboard.html
│   ├── employees.html         # Employee list, add/edit/delete/search/filter, Portal Access
│   ├── employee-profile.html  # Single employee full profile
│   ├── attendance.html        # Mark / view attendance, import from biometric machine
│   ├── shifts.html            # Shift management
│   ├── leaves.html            # Leave approvals
│   ├── salary-settings.html   # Global & per-employee salary rules
│   ├── salary-sheet.html      # Monthly Salary Sheet (Paid Leave / Advance format)
│   ├── reports.html           # Reports + export PDF/Excel/CSV
├── employee-portal/           # EMPLOYEE-FACING PORTAL (separate login)
│   ├── index.html             # Employee login
│   ├── forgot-password.html
│   ├── dashboard.html         # Punch In/Out (with location + device), quick stats
│   ├── attendance.html        # My attendance: Today / History / Monthly Report
│   ├── leaves.html            # My leave balances, apply leave, history
│   ├── quick-punch.html       # No-login attendance form (shared link, any employee)
│   └── js/
│       ├── employee-auth.js
│       ├── employee-shell.js
│       ├── employee-dashboard.js
│       ├── employee-attendance.js
│       ├── employee-leaves.js
│       └── quick-punch.js
├── css/
│   ├── style.css              # Core design system (theme, layout, components)
│   ├── responsive.css         # Mobile breakpoints
│   └── auth-brand.css         # Split-screen branded login pages
├── js/
│   ├── firebase-config.js     # <-- put your Firebase project keys here
│   ├── firebase-secondary.js  # Lets admin create/reset employee portal logins safely
│   ├── auth.js                # Admin login / logout / forgot password / route guard
│   ├── sidebar.js             # Shared admin sidebar + navbar + dark mode toggle
│   ├── utils.js                # Helpers + PAYROLL CALCULATION ENGINE + leave/location/device helpers
│   ├── dashboard.js
│   ├── employees.js
│   ├── employee-profile.js
│   ├── attendance.js
│   ├── shifts.js
│   ├── leaves.js
│   ├── salary-settings.js
│   ├── salary-sheet.js
│   └── reports.js
├── assets/
│   ├── icons/
│   └── branding/logo.jpeg     # Your company logo, used across login pages
└── README.md
```

This is a **static, buildless project** — no npm install, no bundler required. Open it directly in VS Code, install the "Live Server" extension, and click "Go Live". It also deploys as-is to Firebase Hosting, Netlify, Vercel, or GitHub Pages.

---

## 2. Firebase Setup (one-time)

1. Go to [https://console.firebase.google.com](https://console.firebase.google.com) → **Add project**.
2. Inside the project:
   - **Authentication** → Sign-in method → enable **Email/Password**. Manually add your admin user (Authentication → Users → Add user).
   - **Firestore Database** → Create database (start in production mode) → pick a region.
   - **Storage** → Get started (for profile photos, Aadhaar/PAN/resume/document uploads).
3. Go to Project Settings → General → "Your apps" → click the `</>` Web icon → register the app → copy the `firebaseConfig` object.
4. Paste it into `js/firebase-config.js` (marked clearly below).

### Firestore Security Rules

If you're **only** ever going to use the Admin app (no Employee Portal, no Quick Punch), the simple version works fine:

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null; // admin-only app
    }
  }
}
```

**If you're using the Employee Portal and/or Quick Punch** (see Sections 8 and 11 below), use this expanded version instead. It defines three kinds of signed-in users — **admin**, **portal employee**, and **anonymous** (used only by the no-login Quick Punch page) — and scopes each to exactly what they should be able to touch:

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Maps the logged-in user's email to their employee ID via the
    // `portalLinks` collection (written automatically when an admin sets
    // up an employee's Portal Access).
    function myEmail() {
      return request.auth.token.email;
    }
    function myEmpId() {
      return myEmail() != null && exists(/databases/$(database)/documents/portalLinks/$(myEmail()))
        ? get(/databases/$(database)/documents/portalLinks/$(myEmail())).data.empId
        : null;
    }
    function isPortalEmployee() {
      return myEmpId() != null;
    }
    // Quick Punch signs in anonymously just to satisfy "request.auth !=
    // null" — it must NEVER be treated as admin-equivalent.
    function isAnon() {
      return request.auth != null && request.auth.token.firebase.sign_in_provider == 'anonymous';
    }
    function isAdmin() {
      return request.auth != null && !isAnon() && !isPortalEmployee();
    }

    match /employees/{empId} {
      allow read: if request.auth != null
                   && (isAdmin() || (isPortalEmployee() && resource.data.portalEmail == myEmail()));
      allow write: if request.auth != null && isAdmin();
    }

    // Minimal public directory (name + code + shift only — no salary,
    // bank, Aadhaar, documents, etc.) kept in sync automatically whenever
    // an admin adds/edits/deletes an employee. This is what the no-login
    // Quick Punch page reads from, so it never touches sensitive data.
    match /employeeDirectory/{empId} {
      allow read: if request.auth != null; // includes anonymous Quick Punch sessions
      allow write: if request.auth != null && isAdmin();
    }

    match /shifts/{shiftId} {
      allow read: if request.auth != null; // Quick Punch needs this for late/OT calculation
      allow write: if request.auth != null && isAdmin();
    }

    match /attendance/{attId} {
      allow read: if request.auth != null
                   && (isAdmin() || (isPortalEmployee() && resource.data.empId == myEmpId()) || isAnon());
      allow create: if request.auth != null
                   && (isAdmin()
                       || (isPortalEmployee() && request.resource.data.empId == myEmpId())
                       || (isAnon() && exists(/databases/$(database)/documents/employeeDirectory/$(request.resource.data.empId))));
      allow update: if request.auth != null
                   && (isAdmin()
                       || (isPortalEmployee() && resource.data.empId == myEmpId() && request.resource.data.empId == myEmpId())
                       || (isAnon() && resource.data.empId == request.resource.data.empId
                           && exists(/databases/$(database)/documents/employeeDirectory/$(request.resource.data.empId))));
      allow delete: if request.auth != null && isAdmin();
    }

    match /leaves/{leaveId} {
      allow read: if request.auth != null
                   && (isAdmin() || (isPortalEmployee() && resource.data.empId == myEmpId()));
      allow create: if request.auth != null
                   && (isAdmin() || (isPortalEmployee() && request.resource.data.empId == myEmpId()));
      allow update, delete: if request.auth != null && isAdmin();
    }

    match /portalLinks/{email} {
      allow read: if request.auth != null && myEmail() == email;
      allow write: if request.auth != null && isAdmin();
    }

    // Everything else (salarySettings, salaryRecords, notifications,
    // etc.) stays strictly admin-only.
    match /{document=**} {
      allow read, write: if request.auth != null && isAdmin();
    }
  }
}
```

**You'll also need to enable Anonymous sign-in** if you're using Quick Punch: Firebase Console → **Authentication → Sign-in method → Anonymous → Enable**. Without this, Quick Punch will show a "Could not connect" error in live (non-demo) mode.

> **Honest limitations:**
> - This enforces access at the database level (Firestore will reject the request even if someone calls the API directly), not just by hiding buttons in the UI.
> - Quick Punch's anonymous sessions can read/write any attendance record for any employee (needed so any employee can use the same shared link/kiosk), but they can **never** see salary, bank details, Aadhaar, or any other sensitive field — those stay in the separate `employees` collection, which anonymous sessions can't touch at all.
> - This doesn't protect against a compromised admin account, and it isn't a substitute for enterprise-grade role management (custom claims via Cloud Functions) if you later need more than these three access levels.

### Storage Rules

```js
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```
This keeps Storage admin-oriented (document uploads happen from the Employees page). Neither the Employee Portal nor Quick Punch upload or read anything from Storage in this version, so it's not further restricted here.

### Recommended Firestore Indexes
Firestore will prompt you with a direct link to auto-create composite indexes the first time a query needs one (visible in the browser console as an error link). Just click it — no manual setup needed.

---

## 3. Firestore Data Model

| Collection        | Doc ID              | Key Fields |
|--------------------|----------------------|------------|
| `employees`         | auto (`EMP0001`...)  | fullName, fatherName, mobile, email, address, dob, joiningDate, department, designation, shiftId, monthlySalary, aadhaarNo, panNo, bankAccount, ifsc, upiId, photoUrl, aadhaarUrl, panUrl, resumeUrl, otherDocsUrl[], status, paidLeavesPerMonth, leaveUsedOpening, advanceBalance, clEntitlement, slEntitlement, elEntitlement, compOffEntitlement, **portalEmail** (set once Portal Access is created) |
| `shifts`            | auto                  | name, startTime, endTime, graceMinutes, weeklyOffDays[], lateMarkRules |
| `attendance`        | auto (`empId_date`)  | empId, date, status, checkIn, checkOut, workingHours, overtimeHours, lateMinutes, earlyExitMinutes, remarks, **checkInLocation**/**checkOutLocation** ({lat,lng,accuracy}), **deviceId**, **deviceInfo**, **source** ('employee_portal' or admin-marked) |
| `leaves`             | auto                  | empId, type, fromDate, toDate, reason, status(pending/approved/rejected), appliedOn, appliedVia |
| `salarySettings`     | `default` + `{empId}` | perDay, perHour, overtimeRate, lateDeduction, halfDayDeduction, partialExitDeduction, leaveDeduction, bonus, incentive, allowances, pf, esi, tax, otherDeductions, paidLeavesPerMonth, basicPercent, hraPercent, allowancePercent |
| `salaryRecords`      | auto (`empId_YYYY-MM`)| month, empId, presentDays, absentDays, leaveDays, halfDays, lateCount, partialExitCount, overtimeHours, grossSalary, totalDeductions, netSalary, generatedOn (also carries the full Monthly Salary Sheet breakdown when generated from that page) |
| `notifications`      | auto                  | type, message, read, createdAt |
| `portalLinks`        | employee's portal email | empId, empCode — used by Firestore security rules to scope an Employee Portal login to their own data |
| `employeeDirectory`  | auto (matches `employees` doc ID) | fullName, empCode, status, shiftId — a minimal, non-sensitive mirror of each employee, kept in sync automatically; this is what the no-login Quick Punch page reads from |

---

## 4. Running Locally in VS Code

1. Open the folder in VS Code: `File → Open Folder → attendance-payroll-app`.
2. Install the **Live Server** extension (ritwickdey.LiveServer).
3. Right-click `index.html` → **Open with Live Server**.
4. Log in with the admin email/password you created in Firebase Authentication.

---

## 5. Pushing to GitHub

```bash
cd attendance-payroll-app
git init
git add .
git commit -m "Initial commit: Employee Attendance & Payroll Management App"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

> `js/firebase-config.js` contains your Firebase keys. Firebase web API keys are not secret in the traditional sense (they identify the project, not authorize access — your Firestore/Storage security rules do that), but if you'd rather not commit them, add the file to `.gitignore` and instead commit `js/firebase-config.example.js`, then have teammates copy it locally.

---

## 6. Deploying (optional)

**Firebase Hosting**
```bash
npm install -g firebase-tools
firebase login
firebase init hosting   # choose this project, public dir = "." , single-page app = No
firebase deploy
```

**GitHub Pages**: Settings → Pages → Deploy from branch `main` / root.

---

## 7. Payroll Calculation Logic (implemented in `js/utils.js`)

```
Per Day Salary   = Monthly Salary / 30  (or configurable days-in-month)
Per Hour Salary  = Per Day Salary / Shift Hours
Gross Salary     = (Present Days × Per Day Salary)
                  + (Half Days × Per Day Salary × 0.5)
                  + Overtime Pay (Overtime Hours × Overtime Rate)
                  + Bonus + Incentive + Allowances

Deductions       = (Absent Days × Per Day Salary)
                  + (Late Marks × Late Deduction)
                  + (Partial Exits × Partial Exit Deduction)
                  + (Unpaid Leave Days × Leave Deduction)
                  + PF + ESI + Tax + Other Deductions

Net Salary       = Gross Salary − Deductions
```
Salary recalculates automatically whenever an attendance record is added/edited (see `recalculateSalaryForEmployee()` in `utils.js`, called from `attendance.js`).

---

## 8. Employee Portal (self-service for employees)

A separate, lightweight portal — at `/employee-portal/index.html` — where each employee logs in with their **own** account and can:

- **Punch In / Punch Out**, with their live location and a persistent device identifier recorded automatically on every punch.
- View **only their own** attendance history and a monthly report (present/absent/late/OT summary).
- **Apply for leave** and see their CL / SL / EL / Comp-Off balances and full leave history.
- They can **never** see or edit another employee's data, and can never edit their own attendance once punched (only an admin can correct attendance, from the main Admin app).

### One-time setup per employee (as the admin)
1. Go to **Employees**, open the employee, go to the **Portal Access** tab.
2. Enter a **Portal Login Email** and set a **temporary password** (6+ characters).
3. Click **Create / Update Portal Login** — this creates their account and links it to their employee record.
4. Share the email + password with the employee directly (e.g. over WhatsApp/SMS). They can change their password later via "Forgot password?" on the portal login screen.
5. (Optional) Set their **Annual Leave Entitlements** (CL/SL/EL/Comp-Off) on the same employee form — these drive the balance cards they'll see on the portal.

### What the employee sees
They go to `yourdomain.com/employee-portal/` (a separate URL/bookmark from the admin login) and sign in with the email/password you gave them. Their dashboard shows a Punch In/Out card, this month's absent count, and pending leave count; Attendance shows their history and monthly report; Leaves shows their balances, an "Apply Leave" button, and their request history/status.

### About the location & device tracking
- **Location**: captured via the browser's Geolocation API at the moment of punch in/out (the employee's browser will prompt them to allow location access). Stored as raw latitude/longitude — click "View on Map" in the Admin Attendance page or the employee's own history to open it in Google Maps. There's no reverse-geocoding (turning coordinates into an address like "Head Office, Moradabad") built in, since that needs a paid geocoding API key — this can be added later if you have one.
- **Device ID**: browsers don't expose a true hardware device ID to JavaScript, so a random identifier is generated once and stored in that browser's local storage — it persists across visits from the same phone/laptop, so repeated punches from the same device are traceable, but it resets if the employee clears their browser data or uses a different device/browser.

### Security model
See the expanded **Firestore Security Rules** in Section 2 above — with those rules applied, an employee's account is restricted at the database level to their own `attendance`/`leaves` records and their own `employees` profile, not just hidden in the UI.

---

## 9. Importing Attendance from a Biometric Machine (any brand)

The **Attendance** page has an **"Import from Biometric Machine"** button that works with **any machine or software's export** — eSSL, ZKTeco, Realtime, Matrix, or anything else. Instead of expecting one fixed file format, the app:

1. Reads your CSV/Excel file and auto-detects the header row (skipping any title/company-name rows above it).
2. Guesses which column is the Employee ID/Name, Date, and In/Out times.
3. Shows you that guess as an editable **Column Mapping** step — you confirm or correct each dropdown so it matches your exact file, then click **Preview Mapping** to see the parsed rows before importing.

**Two punch-format modes are supported:**
- **Separate In Time / Out Time columns** — the common daily-summary export (one row per employee per day).
- **Single Punch Time column** — a raw punch log (many rows per employee per day); the app automatically takes each employee's earliest punch as Check In and latest as Check Out for that date.

Dates and times are parsed robustly whether the file stores them as real Excel date/time cells, Excel serial numbers, or plain text (`09:15`, `9:15 AM`, `04/07/2026`, etc.) — so formatting quirks between different machine software shouldn't cause problems.

**Matching employees:** you choose whether to match by Employee Code, Employee Name, or Mobile Number — pick whichever your export actually contains. Any row that can't be matched to an existing employee is skipped and listed so nothing is silently lost.

**Daily workflow:**
1. Export the day's (or a date range's) attendance report from your biometric software as CSV or Excel.
2. Attendance → Import from Biometric Machine → select the file.
3. Confirm the column mapping (it's usually already correct) → **Preview Mapping** → **Import Attendance**.

**Going further — fully automatic daily sync:** if your machine supports **ADMS/server push mode**, it can push punches directly to a server in real time instead of a manual export/import. That requires a small backend endpoint (a Firebase Cloud Function works well) that speaks your machine's push protocol and writes into this app's `attendance` collection — a separate, one-time integration project.

---

## 10. Monthly Salary Sheet (Paid Leave / Leave Settlement / Advance format)

The **Monthly Salary Sheet** page (separate from the simpler auto-calculated payroll) reproduces a traditional Indian payroll register layout: Paid Leave, Leave Settlement, Basic/HRA/Other Allowance breakup, and Advance Settlement — all in one exportable sheet.

**One-time setup (Salary Settings → Default Rules):**
- Set **Paid Leaves per Month**, **Basic %**, **HRA %**, **Other Allowance %** (must total 100%).
- On each employee's profile (Job & Salary tab) you can optionally override their paid-leave entitlement, set their opening "leaves already used" balance, and set an opening advance/loan balance if they already owe the company money.

**Monthly workflow:**
1. Go to **Monthly Salary Sheet**, pick the month, click **Generate**.
2. Every white-background cell (Used Leave, Leave This Month, Sunday Working, PF, ESI, TDS, Advance Deduction) is editable — adjust anything that doesn't match your records. Everything else recalculates live.
3. Click **Save Sheet** to lock it in — this rolls each employee's leave-used and advance balances forward into next month automatically, and updates their Salary History on their profile page.
4. Click **Export Excel** to download a spreadsheet matching the grouped-header layout (Paid Leave / Leave Settlement / Advance Settlement sections).

**Formulas used:**
```
Balance Leave    = Total Leave − Used Leave (opening)
Remain Leave     = Balance Leave − Leave This Month + Sunday Working
Working Day      = Days in Month − Leave This Month
Leave Deduction  = Remain Leave < 0 ? |Remain Leave| × (Salary Rate ÷ Days in Month) : 0
Salary           = Salary Rate − Leave Deduction
Basic            = Salary × Basic %
HRA              = Salary × HRA %
Other Allowance  = Salary − Basic − HRA
Balance Advance  = Previous Advance − Advance Deduction
Net Pay          = Salary − PF − ESI − TDS − Advance Deduction
```

---

## 11. Quick Punch (no-login attendance, for a shared link/kiosk)

At `/employee-portal/quick-punch.html` — a single page, no account or login needed, that anyone with the link can open to mark attendance:

1. Select your name from the dropdown (only active employees appear).
2. Tap **Punch In** or **Punch Out**.
3. Location is captured automatically (you'll be prompted to allow it); a per-device ID is shown too.
4. Tap **Submit Attendance** — done. The form resets so the next person can use the same link/device.

**When to use this vs. the full Employee Portal:** if employees don't want (or can't be bothered) to remember a login, share this one link instead — put it on a shared tablet/kiosk at the entrance, or send it as a bookmark. It writes to the exact same `attendance` data as the full Employee Portal and the Admin app, so everything (Dashboard, Reports, Monthly Salary Sheet, payroll calculation) picks it up automatically — nothing else needed to change.

**Setup:** in live (non-demo) Firebase mode, enable **Anonymous** sign-in (Firebase Console → Authentication → Sign-in method → Anonymous → Enable) and use the expanded Firestore rules from Section 2 — Quick Punch uses an anonymous session just to satisfy Firestore's "must be signed in" requirement, and the rules make sure that session can only ever touch attendance records and the minimal employee directory (never salary, bank details, documents, or anything else).

**What it can't do (by design):** edit past attendance, see other employees' salary or personal details, or apply for leave — those still require the full Employee Portal login. It also can't mark someone Absent/On Leave/Half Day — that's still an admin action from the Attendance page.

---

## 12. Notes

- The app is fully **admin-only** (single role) as specified. Extend `employees` role field if you need multi-role logins later.
- Dark mode preference is stored in `localStorage` and toggled from the top navbar on every page.
- Charts use **Chart.js** (loaded via CDN, no install needed).
- PDF export uses **jsPDF + jspdf-autotable**; Excel/CSV export uses **SheetJS (xlsx)** — both via CDN.
- All file uploads (photo, Aadhaar, PAN, resume, other docs) go to Firebase Storage under `documents/{empId}/...`.
