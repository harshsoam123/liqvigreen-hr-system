// ============================================================
// DEMO DATA SEEDER
// Runs once (DEMO_MODE only) so the app isn't empty on first load.
// Safe no-op once Firebase is connected or once data already exists.
// ============================================================

import { DEMO_MODE, dbGetAll, dbAdd, dbSet } from "./db.js";
import { todayStr } from "./utils.js";

const SEED_FLAG = "demo_seeded_v1";

export async function seedDemoDataIfNeeded() {
  if (!DEMO_MODE) return;
  if (localStorage.getItem(SEED_FLAG)) return;

  const existing = await dbGetAll("employees");
  if (existing.length) {
    localStorage.setItem(SEED_FLAG, "1");
    return;
  }

  // Shifts
  const morningShiftId = await dbAdd("shifts", {
    name: "Morning Shift",
    startTime: "09:00",
    endTime: "18:00",
    graceMinutes: 15,
    weeklyOffDays: ["Sunday"],
    lateMarkRules: "Late beyond grace time marks employee as Late.",
  });
  const eveningShiftId = await dbAdd("shifts", {
    name: "Evening Shift",
    startTime: "14:00",
    endTime: "22:00",
    graceMinutes: 10,
    weeklyOffDays: ["Sunday", "Saturday"],
    lateMarkRules: "3 late marks in a month convert to 1 half day.",
  });

  // Default salary settings
  await dbSet("salarySettings", "default", {
    overtimeRate: 150,
    lateDeduction: 100,
    halfDayDeduction: 500,
    partialExitDeduction: 150,
    leaveDeduction: 800,
    bonus: 0,
    incentive: 0,
    allowances: 1000,
    pf: 600,
    esi: 200,
    tax: 0,
    otherDeductions: 0,
  });

  // Sample employees
  const sampleEmployees = [
    { empCode: "EMP0001", fullName: "Aarav Sharma", department: "Engineering", designation: "Frontend Developer", shiftId: morningShiftId, monthlySalary: 45000, mobile: "9876543210", email: "aarav.sharma@example.com", portalEmail: "aarav.sharma@example.com" },
    { empCode: "EMP0002", fullName: "Priya Verma", department: "Human Resources", designation: "HR Executive", shiftId: morningShiftId, monthlySalary: 35000, mobile: "9876543211", email: "priya.verma@example.com" },
    { empCode: "EMP0003", fullName: "Rohit Singh", department: "Sales", designation: "Sales Manager", shiftId: eveningShiftId, monthlySalary: 50000, mobile: "9876543212", email: "rohit.singh@example.com" },
    { empCode: "EMP0004", fullName: "Sneha Iyer", department: "Finance", designation: "Accountant", shiftId: morningShiftId, monthlySalary: 40000, mobile: "9876543213", email: "sneha.iyer@example.com" },
    { empCode: "EMP0005", fullName: "Karan Mehta", department: "Engineering", designation: "Backend Developer", shiftId: eveningShiftId, monthlySalary: 48000, mobile: "9876543214", email: "karan.mehta@example.com" },
  ];

  const empIds = [];
  for (const emp of sampleEmployees) {
    const id = await dbAdd("employees", {
      ...emp,
      fatherName: "",
      address: "",
      dob: "1995-01-01",
      joiningDate: "2023-01-15",
      status: "active",
      aadhaarNo: "",
      panNo: "",
      bankAccount: "",
      ifsc: "",
      upiId: "",
      photoUrl: null,
      aadhaarUrl: null,
      panUrl: null,
      resumeUrl: null,
      otherDocsUrl: [],
      clEntitlement: 12,
      slEntitlement: 12,
      elEntitlement: 15,
      compOffEntitlement: 1,
      leaveUsedOpening: 0,
      advanceBalance: 0,
    });
    empIds.push(id);
  }

  // Sample attendance for today
  const statuses = ["present", "present", "late", "present", "half_day"];
  for (let i = 0; i < empIds.length; i++) {
    await dbSet("attendance", `${empIds[i]}_${todayStr()}`, {
      empId: empIds[i],
      date: todayStr(),
      status: statuses[i],
      checkIn: statuses[i] === "late" ? "09:35" : "09:05",
      checkOut: "18:10",
      workingHours: statuses[i] === "half_day" ? 4 : 8.5,
      overtimeHours: 0,
      lateMinutes: statuses[i] === "late" ? 20 : 0,
      earlyExitMinutes: 0,
      remarks: "",
    });
  }

  localStorage.setItem(SEED_FLAG, "1");
}
