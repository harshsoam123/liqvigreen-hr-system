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
│   └── js/
│       ├── employee-auth.js
│       ├── employee-shell.js
│       ├── employee-dashboard.js
│       ├── employee-attendance.js
│       └── employee-leaves.js
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

If you're **only** ever going to use the Admin app (no Employee Portal), the simple version works fine:

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

**If you're using the Employee Portal** (see Section 9 below), use this expanded version instead — it keeps admins with full access, while restricting any logged-in employee to reading/writing only their own attendance and leave records, and only reading their own employee profile:

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Maps the logged-in user's email to their employee ID via the
    // `portalLinks` collection (written automatically when an admin sets
    // up an employee's Portal Access). Admins never have a portalLinks
    // entry for their own login email, so isPortalEmployee() is false
    // for them and they keep full access to everything.
    function myEmpId() {
      return exists(/databases/$(database)/documents/portalLinks/$(request.auth.token.email))
        ? get(/databases/$(database)/documents/portalLinks/$(request.auth.token.email)).data.empId
        : null;
    }
    function isPortalEmployee() {
      return myEmpId() != null;
    }

    match /employees/{empId} {
      allow read: if request.auth != null
                   && (!isPortalEmployee() || resource.data.portalEmail == request.auth.token.email);
      allow write: if request.auth != null && !isPortalEmployee();
    }

    match /attendance/{attId} {
      allow read: if request.auth != null
                   && (!isPortalEmployee() || resource.data.empId == myEmpId());
      allow create: if request.auth != null
                   && (!isPortalEmployee() || request.resource.data.empId == myEmpId());
      allow update: if request.auth != null
                   && (!isPortalEmployee() || (resource.data.empId == myEmpId() && request.resource.data.empId == myEmpId()));
      allow delete: if request.auth != null && !isPortalEmployee();
    }

    match /leaves/{leaveId} {
      allow read: if request.auth != null
                   && (!isPortalEmployee() || resource.data.empId == myEmpId());
      allow create: if request.auth != null
                   && (!isPortalEmployee() || request.resource.data.empId == myEmpId());
      allow update, delete: if request.auth != null && !isPortalEmployee();
    }

    match /portalLinks/{email} {
      allow read: if request.auth != null && request.auth.token.email == email;
      allow write: if request.auth != null && !isPortalEmployee();
    }

    // Everything else (shifts, salarySettings, salaryRecords,
    // notifications, etc.) stays admin-only, exactly as before.
    match /{document=**} {
      allow read, write: if request.auth != null && !isPortalEmployee();
    }
  }
}
```

> **Honest limitation:** this restricts what the app's own UI lets an employee do, and enforces it at the database level too (a real security boundary, not just hidden buttons) — Firestore will reject any read/write from a portal employee's account for data that isn't theirs, even if someone tried calling the Firestore API directly. What it does **not** do is protect against a compromised admin account, or replace enterprise-grade role management (custom claims via Cloud Functions) if you later need more than two roles (Admin / Employee).

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
This keeps Storage admin-oriented (document uploads happen from the Employees page). The Employee Portal doesn't upload or read anything from Storage in this version, so it's not further restricted here.

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

## 11. Notes

- The app is fully **admin-only** (single role) as specified. Extend `employees` role field if you need multi-role logins later.
- Dark mode preference is stored in `localStorage` and toggled from the top navbar on every page.
- Charts use **Chart.js** (loaded via CDN, no install needed).
- PDF export uses **jsPDF + jspdf-autotable**; Excel/CSV export uses **SheetJS (xlsx)** — both via CDN.
- All file uploads (photo, Aadhaar, PAN, resume, other docs) go to Firebase Storage under `documents/{empId}/...`.
