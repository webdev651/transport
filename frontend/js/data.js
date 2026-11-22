/* Mock dataset for the QR-Based Student Transportation Discount system */

/* ---------- Persistence (demo only, no backend) ----------
   Without this, anything created or changed on one page (a new registration,
   a profile edit, a registrar approving a pass) would vanish the moment the
   browser loaded the next page, since each page starts from the seed data
   below. We store the working copies in localStorage and read them back in,
   so accounts the registrar adds via students.html persist across pages. */
const SEED_STUDENTS = [
  { id:"STD-2026-04182", schoolId:"2023-1182", name:"Alonzo M. Reyes", school:"Pamantasan ng Lungsod Central", program:"BS Information Technology", level:"3rd Year", status:"active", validUntil:"31 Mar 2027", scans:148, email:"alonzo.reyes@student.plc.edu.ph", phone:"0917 214 5590", qrActive:true, qrVersion:1, faceEnrolled:false, facePhoto:null, faceDescriptor:null, discountEligible:true },
  { id:"STD-2026-04183", schoolId:"2024-0592", name:"Bianca L. Soriano", school:"St. Andrew Senior High", program:"STEM Strand", level:"Grade 12", status:"active", validUntil:"31 Mar 2027", scans:92, email:"bianca.soriano@student.sash.edu.ph", phone:"0918 445 2201", qrActive:true, qrVersion:1, faceEnrolled:false, facePhoto:null, faceDescriptor:null, discountEligible:true },
  { id:"STD-2026-04184", schoolId:"2025-0184", name:"Cristian D. Villamor", school:"Metro Polytechnic Institute", program:"Dip. Mechanical Tech", level:"2nd Year", status:"pending", validUntil:"Awaiting registrar", scans:0, email:"cristian.villamor@student.mpi.edu.ph", phone:"0921 330 9042", qrActive:true, qrVersion:1, faceEnrolled:false, facePhoto:null, faceDescriptor:null, discountEligible:true },
  { id:"STD-2025-03910", schoolId:"2021-0910", name:"Dianne P. Aguilar", school:"Pamantasan ng Lungsod Central", program:"BS Accountancy", level:"Graduated", status:"expired", validUntil:"31 Mar 2026", scans:613, email:"dianne.aguilar@student.plc.edu.ph", phone:"0915 667 1183", qrActive:true, qrVersion:1, faceEnrolled:false, facePhoto:null, faceDescriptor:null, discountEligible:false },
  { id:"STD-2026-04121", schoolId:"2025-0121", name:"Emilio R. Tanada", school:"St. Andrew Senior High", program:"ABM Strand", level:"Grade 11", status:"flagged", validUntil:"Under review", scans:41, email:"emilio.tanada@student.sash.edu.ph", phone:"0928 774 6635", qrActive:true, qrVersion:1, faceEnrolled:false, facePhoto:null, faceDescriptor:null, discountEligible:true }
];

/* Per-student scan history for the Student Interface (Scan History page) */
const SEED_SCAN_HISTORY = {
  "2023-1182": [
    { date:"05 Aug 2026", time:"07:36:44", route:"LRT-2 Recto", operator:"Turnstile B-1", fare:"₱11.00 (−20%)", result:"granted" },
    { date:"04 Aug 2026", time:"17:12:03", route:"Cubao — Lawton", operator:"Bus 118 · Unit 4", fare:"₱13.00 (−20%)", result:"granted" },
    { date:"04 Aug 2026", time:"07:41:09", route:"LRT-2 Recto", operator:"Turnstile B-1", fare:"₱11.00 (−20%)", result:"granted" },
    { date:"01 Aug 2026", time:"18:02:37", route:"Ayala — Fairview", operator:"Bus 077 · Unit 1", fare:"₱14.00 (−20%)", result:"granted" },
    { date:"29 Jul 2026", time:"07:38:51", route:"LRT-2 Recto", operator:"Turnstile B-1", fare:"₱11.00 (−20%)", result:"granted" },
    { date:"27 Jul 2026", time:"08:10:22", route:"Cubao — Lawton", operator:"Bus 118 · Unit 4", fare:"Full fare", result:"review", reason:"3 scans in 4 minutes — possible pass sharing" }
  ],
  "2024-0592": [
    { date:"05 Aug 2026", time:"07:41:58", route:"LRT-1 Monumento", operator:"Turnstile G-2", fare:"₱12.00 (−20%)", result:"granted" },
    { date:"04 Aug 2026", time:"16:48:15", route:"LRT-1 Monumento", operator:"Turnstile G-2", fare:"₱12.00 (−20%)", result:"granted" },
    { date:"03 Aug 2026", time:"07:39:40", route:"LRT-1 Monumento", operator:"Turnstile G-2", fare:"₱12.00 (−20%)", result:"granted" },
    { date:"31 Jul 2026", time:"17:55:02", route:"LRT-1 Monumento", operator:"Turnstile G-2", fare:"₱12.00 (−20%)", result:"granted" }
  ],
  "2025-0184": [],
  "2021-0910": [
    { date:"05 Aug 2026", time:"07:38:07", route:"Ayala — Fairview", operator:"Bus 077 · Unit 1", fare:"Full fare", result:"denied", reason:"Pass expired 31 Mar 2026" },
    { date:"02 Aug 2026", time:"08:14:29", route:"Ayala — Fairview", operator:"Bus 077 · Unit 1", fare:"Full fare", result:"denied", reason:"Pass expired 31 Mar 2026" },
    { date:"15 Mar 2026", time:"07:50:18", route:"Ayala — Fairview", operator:"Bus 077 · Unit 1", fare:"₱14.00 (−20%)", result:"granted" }
  ],
  "2025-0121": [
    { date:"05 Aug 2026", time:"07:40:22", route:"Cubao — Lawton", operator:"Bus 118 · Unit 4", fare:"Full fare", result:"review", reason:"3 scans in 4 minutes — possible pass sharing" },
    { date:"04 Aug 2026", time:"07:44:11", route:"Cubao — Lawton", operator:"Bus 118 · Unit 4", fare:"₱13.00 (−20%)", result:"granted" },
    { date:"03 Aug 2026", time:"07:37:52", route:"Cubao — Lawton", operator:"Bus 118 · Unit 4", fare:"₱13.00 (−20%)", result:"granted" }
  ]
};

const STORE_KEY_STUDENTS = "transitpass.students";
const STORE_KEY_SCAN_HISTORY = "transitpass.scanHistory";

function loadFromStore(key, seed) {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* corrupt or unavailable storage — fall back to seed */ }
  return JSON.parse(JSON.stringify(seed));
}

const students = loadFromStore(STORE_KEY_STUDENTS, SEED_STUDENTS);
/* Migration: records saved before the discount-eligibility field existed
   default to eligible, matching prior behaviour (every active pass got the
   20% discount). */
students.forEach((s) => { if (s.discountEligible === undefined) s.discountEligible = true; });
/* Migration: student accounts now sign in with a password. Records created
   before that existed (the seed students, or ones a registrar added from
   students.html) get the shared demo password until the student registers or
   changes it. Demo only — real passwords would be hashed server-side. */
const DEMO_STUDENT_PASSWORD = "student1234";
students.forEach((s) => { if (!s.password) s.password = DEMO_STUDENT_PASSWORD; });
const scanHistory = loadFromStore(STORE_KEY_SCAN_HISTORY, SEED_SCAN_HISTORY);

function saveStudents() {
  try { localStorage.setItem(STORE_KEY_STUDENTS, JSON.stringify(students)); } catch (e) {}
}
function saveScanHistory() {
  try { localStorage.setItem(STORE_KEY_SCAN_HISTORY, JSON.stringify(scanHistory)); } catch (e) {}
}

/* Live scan feed — seeded with demo rows, then grows in real time as
   verify.html logs real scans (each new scan is unshifted to the front
   with the real current date/day/time and persisted, so it also shows
   up on the admin dashboard's "Live scan feed"). */
const SEED_SCAN_FEED = [
  { time:"07:42:11", student:"Alonzo M. Reyes", id:"STD-2026-04182", schoolId:"2023-1182", route:"Cubao — Lawton", operator:"Bus 118 · Unit 4", fare:"₱13.00 (−20%)", result:"granted" },
  { time:"07:41:58", student:"Bianca L. Soriano", id:"STD-2026-04183", schoolId:"2024-0592", route:"LRT-1 Monumento", operator:"Turnstile G-2", fare:"₱12.00 (−20%)", result:"granted" },
  { time:"07:40:22", student:"Emilio R. Tanada", id:"STD-2026-04121", schoolId:"2025-0121", route:"Cubao — Lawton", operator:"Bus 118 · Unit 4", fare:"Full fare", result:"review", reason:"3 scans in 4 minutes — possible pass sharing" },
  { time:"07:38:07", student:"Dianne P. Aguilar", id:"STD-2025-03910", schoolId:"2021-0910", route:"Ayala — Fairview", operator:"Bus 077 · Unit 1", fare:"Full fare", result:"denied", reason:"Pass expired 31 Mar 2026" },
  { time:"07:36:44", student:"Alonzo M. Reyes", id:"STD-2026-04182", schoolId:"2023-1182", route:"LRT-2 Recto", operator:"Turnstile B-1", fare:"₱11.00 (−20%)", result:"granted" }
];
const STORE_KEY_SCAN_FEED = "transitpass.scanFeed";
let scanFeed = loadFromStore(STORE_KEY_SCAN_FEED, SEED_SCAN_FEED);
function saveScanFeed() {
  try { localStorage.setItem(STORE_KEY_SCAN_FEED, JSON.stringify(scanFeed.slice(0, 50))); } catch (e) {}
}

/* Automatic email notification log — every simulated email (registration
   received, registrar approval/flag/revoke, fraud/expiry alerts from the
   verification terminal) is appended here so it can be reviewed on the
   admin Scan History & Notifications page. No real email is sent — this
   is a client-side demo, same as the rest of the mock backend. */
const SEED_EMAIL_LOG = [
  { to:"alonzo.reyes@student.plc.edu.ph", student:"Alonzo M. Reyes", schoolId:"2023-1182", subject:"Your TransitPass has been approved", body:"Hi Alonzo M. Reyes, your discount pass (School ID 2023-1182) is now active and valid until 31 Mar 2027.", date:"31 Mar 2026", time:"09:12:04" },
  { to:"emilio.tanada@student.sash.edu.ph", student:"Emilio R. Tanada", schoolId:"2025-0121", subject:"Your TransitPass has been flagged for review", body:"Hi Emilio R. Tanada, unusual activity was detected on your pass (School ID 2025-0121) and it has been flagged for registrar review. Full fare will apply until resolved.", date:"05 Aug 2026", time:"07:40:23" }
];
const STORE_KEY_EMAIL_LOG = "transitpass.emailLog";
let emailLog = loadFromStore(STORE_KEY_EMAIL_LOG, SEED_EMAIL_LOG);
function saveEmailLog() {
  try { localStorage.setItem(STORE_KEY_EMAIL_LOG, JSON.stringify(emailLog.slice(0, 100))); } catch (e) {}
}

/* Admin / registrar account (demo only — single account, no backend).
   Persisted the same way as students, so edits from admin-account.html survive
   reloads and the login page checks the live values instead of a hardcoded pair. */
const SEED_ADMIN = {
  username: "driver",
  password: "driver123",
  name: "Driver",
  email: "driver@transitpass.local",
  node: "verification.node-04"
};
const STORE_KEY_ADMIN = "transitpass.adminAccount";
let adminAccount = loadFromStore(STORE_KEY_ADMIN, SEED_ADMIN);
function saveAdminAccount() {
  try { localStorage.setItem(STORE_KEY_ADMIN, JSON.stringify(adminAccount)); } catch (e) {}
}

const kpis = [
  { label:"Verified today", value:"18,204", delta:"+6.2%", note:"vs. yesterday" },
  { label:"Discount released", value:"₱241,880", delta:"+4.8%", note:"subsidy accrued" },
  { label:"Denied / expired", value:"312", delta:"−11%", note:"1.7% of scans" },
  { label:"Fraud reviews", value:"27", delta:"+3", note:"queued for registrar" }
];

const weekly = [
  { day:"Mon", granted:16400, denied:380 },
  { day:"Tue", granted:17250, denied:340 },
  { day:"Wed", granted:17980, denied:410 },
  { day:"Thu", granted:18204, denied:312 },
  { day:"Fri", granted:15120, denied:288 },
  { day:"Sat", granted:6410, denied:96 },
  { day:"Sun", granted:3120, denied:44 }
];

const operators = [
  { name:"Metro Bus Consortium", trips:"48,220", discount:"₱612,400", status:"Cleared" },
  { name:"LRT Line 1 Authority", trips:"31,905", discount:"₱402,180", status:"Cleared" },
  { name:"LRT Line 2 Authority", trips:"22,640", discount:"₱281,050", status:"For review" },
  { name:"Provincial UV Express", trips:"9,410", discount:"₱118,900", status:"Pending docs" }
];
