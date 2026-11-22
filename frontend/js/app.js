/* Shared UI + API client for TransitPass. Everything real lives in the backend (Express + MySQL);
   the only thing kept in the browser is the signed-in session token. */

/* ---------- API client ---------- */
const API_BASE = window.TRANSITPASS_API_BASE || "/api";
const TOKEN_KEYS = { staff: "transitpass.staffToken", student: "transitpass.studentToken" };
/* Which sign-in page to send people to: students -> student-login, driver pages -> driver-login, everything else -> administrator login. */
const loginPage = (who) => (who === "student" ? "student-login.html" : /(^|\/)driver-/.test(location.pathname) ? "driver-login.html" : "admin-login.html");
/* A session lives in localStorage when "Remember me" is ticked (survives closing the browser) and in sessionStorage otherwise (ends with the tab). */
const getToken = (who) => sessionStorage.getItem(TOKEN_KEYS[who]) || localStorage.getItem(TOKEN_KEYS[who]);
const clearToken = (who) => { localStorage.removeItem(TOKEN_KEYS[who]); sessionStorage.removeItem(TOKEN_KEYS[who]); };
const setToken = (who, t, remember = true) => { clearToken(who); (remember ? localStorage : sessionStorage).setItem(TOKEN_KEYS[who], t); };

/* api("/students?limit=5", { who: "staff" })  ->  parsed JSON, or throws Error(message) with .status and .details.
   A 401 on a signed-in call clears the session and sends the user back to the matching login page. */
async function api(path, { method = "GET", body, who = "staff", public: isPublic = false } = {}) {
  const headers = { Accept: "application/json" };
  const isForm = typeof FormData !== "undefined" && body instanceof FormData; // file uploads: the browser sets the multipart header itself
  if (body !== undefined && !isForm) headers["Content-Type"] = "application/json";
  const token = isPublic ? null : getToken(who);
  if (token) headers.Authorization = `Bearer ${token}`;
  if (who === "staff" && !isPublic) headers["X-Device-Id"] = deviceId();   // lets administrators register / monitor the devices drivers scan with
  let res;
  try {
    res = await fetch(API_BASE + path, { method, headers, body: body === undefined ? undefined : isForm ? body : JSON.stringify(body) });
  } catch (e) {
    const err = new Error("Cannot reach the server. Check your connection and that the backend is running.");
    err.status = 0;
    throw err;
  }
  // The server renews a staff session while it is in use (and ends it after the idle time): keep the newest token, in the same storage as before.
  const renewed = res.headers.get("X-Refresh-Token");
  if (renewed && who === "staff" && token) { try { setToken("staff", renewed, !!localStorage.getItem(TOKEN_KEYS.staff)); } catch (e) { /* storage unavailable */ } }
  let data = null;
  try { data = await res.json(); } catch (e) { /* empty body */ }
  if (!res.ok) {
    if (res.status === 401 && token) { clearToken(who); location.href = loginPage(who) + "?expired=1"; }
    const err = new Error((data && data.error) || `Request failed (${res.status})`);
    err.status = res.status;
    err.details = data && data.details;
    throw err;
  }
  return data;
}
/* A random id created once per browser. It identifies the device to the administrator's Driver Devices module (it is not a secret). */
function deviceId() {
  try {
    let id = localStorage.getItem("transitpass.deviceId");
    if (!id) { id = "web-" + Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => b.toString(16).padStart(2, "0")).join(""); localStorage.setItem("transitpass.deviceId", id); }
    return id;
  } catch (e) { return "web-unavailable"; }
}
/* First validation message if the server sent field details, otherwise the general one. */
function errText(e) {
  if (e && e.details && e.details.length) return e.details.map((d) => d.message || d).join(" ");
  return (e && e.message) || "Something went wrong.";
}

/* ---------- Escaping (names and notes are typed by users, so every template escapes them) ---------- */
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ---------- Dates ---------- */
function fmtDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) + " · " + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}
function fmtDate(iso) { return iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"; }

function markActiveNav() {
  const file = location.pathname.split("/").pop() || "index.html";
  const here = file + location.search;
  document.querySelectorAll(".nav a").forEach((a) => { const h = a.getAttribute("href"); if (h === here || (h === file && !location.search)) a.classList.add("active"); });
}

/* Real, scannable QR code for a payload string, rendered as SVG (encoder: js/qrcode-gen.js). */
function qrSvg(seed, quiet = 2) {
  const { size, modules } = window.QRCodeGen.encode(seed, "M");
  const total = size + quiet * 2;
  const r = total * 0.09;
  const cells = [];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (modules[y][x]) cells.push(`<rect x="${x + quiet}" y="${y + quiet}" width="1" height="1"/>`);
  return `<svg viewBox="0 0 ${total} ${total}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" fill="#0b1020" role="img" aria-label="Your TransitPass QR code">
    <rect width="${total}" height="${total}" rx="${r}" ry="${r}" fill="#fff"/>${cells.join("")}
  </svg>`;
}

function badge(kind, label) { return `<span class="badge b-${esc(kind)}">${esc(label || kind)}</span>`; }

/* Scan result codes -> badge colour + label (the six verification outcomes, plus flagged). */
const CODE_LABELS = {
  VERIFIED_STUDENT: ["granted", "Verified student"], PENDING_VERIFICATION: ["pending", "Pending verification"],
  INVALID_QR: ["denied", "Invalid QR code"], REVOKED_QR: ["denied", "Revoked QR code"], EXPIRED_QR: ["expired", "Expired QR code"],
  REJECTED_STUDENT: ["denied", "Rejected student"], FLAGGED_REVIEW: ["review", "Flagged – review"]
};
function codeBadge(scan) {
  const c = CODE_LABELS[scan.code];
  return c ? badge(c[0], c[1]) : badge(scan.result);
}

function discountBadge(eligible) {
  return eligible ? `<span class="badge b-active">Eligible</span>` : `<span class="badge b-expired">Not eligible</span>`;
}
function verificationBadge(v) {
  const s = v ? v.status : "pending";
  return badge(s === "verified" ? "verified" : s === "rejected" ? "rejected" : "pending", s);
}
function qrStatusBadge(s) { return badge(s === "active" ? "active" : s === "expired" ? "expired" : "revoked", s); }

/* Turns the QR payload into a PNG and downloads it. Client-side only. */
function downloadQrCode(payload, schoolId, size = 512) {
  const svgBlob = new Blob([qrSvg(payload)], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  const img = new Image();
  img.onload = () => {
    const c = document.createElement("canvas");
    c.width = size; c.height = size;
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(img, 0, 0, size, size);
    URL.revokeObjectURL(url);
    c.toBlob((png) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(png);
      a.download = `transitpass-qr-${schoolId}.png`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, "image/png");
  };
  img.onerror = () => { URL.revokeObjectURL(url); showToast("Couldn't render the QR code for download."); };
  img.src = url;
}

function renderKpis(el, kpis) {
  el.innerHTML = kpis.map((k) => `<article class="card">
      <p class="label-caps muted">${esc(k.label)}</p>
      <p class="kpi-value">${esc(k.value)}</p>
      <p style="font-size:.78rem;margin:0"><span style="color:var(--success);font-weight:600">${esc(k.delta)}</span> <span class="muted">${esc(k.note)}</span></p>
    </article>`).join("");
}

/* One row per scan: who, where, which driver, outcome. Works for the admin feed and driver history. */
function renderFeed(el, items, { empty = "No scans logged yet." } = {}) {
  if (!items.length) { el.innerHTML = `<p class="muted" style="font-size:.85rem">${esc(empty)}</p>`; return; }
  el.innerHTML = items.map((s) => `<div class="scan-item">
      <div>
        <p style="margin:0;font-weight:600;font-size:.9rem">${esc(s.student)}</p>
        <p class="mono muted" style="margin:.15rem 0 0;font-size:.72rem">${esc(s.schoolId)} · ${esc(s.driver || s.operator)}${s.method === "manual" ? " · manual ID" : ""}${s.offline ? " · offline sync" : ""}</p>
        ${s.reason ? `<p class="muted" style="margin:.3rem 0 0;font-size:.75rem">${esc(s.reason)}</p>` : ""}
      </div>
      <div style="text-align:right;white-space:nowrap">
        ${codeBadge(s)}
        <p class="mono muted" style="margin:.3rem 0 0;font-size:.72rem">${esc(s.date || "")} ${esc(s.time || "")}</p>
        <p class="mono" style="margin:.15rem 0 0;font-size:.75rem">${esc(s.fare)}</p>
      </div>
    </div>`).join("");
}

/* Student pass. `qr` is the live QR record from the API ({payload, expiresAt, ...}) or null when the student has none. */
function passCard(student, { qr = null, interactive = false } = {}) {
  const v = student.verification;
  return `<div class="pass">
    <div class="pass-top">
      <div>
        <p class="label-caps" style="color:var(--accent)">Student discount pass</p>
        <h3 style="margin:.4rem 0 .2rem;font-size:1.15rem">${esc(student.name)}</h3>
        <p class="mono muted" style="margin:0;font-size:.75rem">${esc(student.schoolId)}</p>
        <p class="muted" style="margin:.6rem 0 0;font-size:.8rem">${esc(student.school)}<br>${esc(student.program)} · ${esc(student.level)}</p>
        <p style="margin:.75rem 0 0;font-size:.8rem"><span class="muted">Valid until</span> <strong>${esc(student.validUntil)}</strong></p>
        <p style="margin:.35rem 0 0">${verificationBadge(v)} ${discountBadge(student.discountEligible !== false)}</p>
      </div>
      <div class="qr" style="${qr ? "" : "opacity:.18"}">${qr ? qrSvg(qr.payload) : qrSvg("TRANSITPASS-LOCKED")}</div>
    </div>
    <p class="mono muted" style="margin:1rem 0 0;font-size:.7rem">${qr ? `Valid until ${esc(fmtDate(qr.expiresAt))} · generated ${esc(fmtDateTime(qr.generatedAt))} by ${esc(qr.generatedBy.name)}` : "No active QR code — it stays locked until you are verified and generate one."}</p>
    ${interactive && qr ? `<div class="row" style="gap:.4rem;margin-top:.85rem">
        <button class="primary" style="font-size:.75rem" data-action="download-qr">Download QR code</button>
      </div>` : ""}
  </div>`;
}

/* Slide-out nav drawer for mobile/tablet — hamburger opens it, and it
   closes on backdrop click, the × button, picking a nav link, or Escape. */
function initMobileNav() {
  const toggle = document.getElementById("navToggle");
  const closeBtn = document.getElementById("navClose");
  const sidebar = document.getElementById("sidebar");
  const backdrop = document.getElementById("sidebarBackdrop");
  if (!toggle || !sidebar || !backdrop) return;
  
  // Ensure nav is closed on page load to prevent stuck overlays
  sidebar.classList.remove("open");
  backdrop.classList.remove("open");
  toggle.setAttribute("aria-expanded", "false");
  document.body.classList.remove("no-scroll");
  
  function openNav() {
    sidebar.classList.add("open");
    backdrop.classList.add("open");
    toggle.setAttribute("aria-expanded", "true");
    document.body.classList.add("no-scroll");
  }
  function closeNav() {
    sidebar.classList.remove("open");
    backdrop.classList.remove("open");
    toggle.setAttribute("aria-expanded", "false");
    document.body.classList.remove("no-scroll");
  }
  
  // Remove existing listeners to prevent duplicates
  toggle.replaceWith(toggle.cloneNode(true));
  const newToggle = document.getElementById("navToggle");
  newToggle.addEventListener("click", openNav);
  if (closeBtn) closeBtn.addEventListener("click", closeNav);
  backdrop.addEventListener("click", closeNav);
  sidebar.querySelectorAll(".nav a").forEach((a) => {
    a.addEventListener("click", closeNav);
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeNav(); });
}

document.addEventListener("DOMContentLoaded", () => { markActiveNav(); initMobileNav(); });

/* ---------- Staff session (administrators and drivers) ---------- */
const HOME = { admin: "admin-dashboard.html", driver: "driver-dashboard.html" };
const NAV = {
  /* Administrator sidebar. Pages that already exist are linked; modules planned for later phases open admin-module.html.
     An entry with an empty link is a section heading; "#logout" signs out. */
  admin: [
    ["admin-dashboard.html", "Dashboard"], ["students.html", "Students"], ["admin-qr-codes.html", "QR Code Management"], ["admin-drivers.html", "Drivers"],
    ["admin-fares.html", "Fare and Discount Management"], ["admin-transactions.html", "Transaction Management"], ["admin-reports.html", "Reports and Analytics"],
    ["admin-profile.html", "Administrator Profile"], ["admin-activity-logs.html", "Activity Logs"], ["admin-settings.html", "Settings"],
    ["", "Operations"],
    ["admin-vehicles.html", "Vehicles"], ["admin-routes.html", "Routes"], ["admin-trips.html", "Trips"], ["admin-devices.html", "Driver Devices"],
    ["", "Review & compliance"],
    ["admin-applications.html", "Applications"], ["admin-driver-documents.html", "Driver Documents"], ["admin-refunds.html", "Refunds & Cancellations"], ["admin-suspicious.html", "Suspicious Activity"],
    ["", "Communication"],
    ["admin-announcements.html", "Announcements"], ["admin-notifications.html", "Notifications"],
    ["", "System"],
    ["admin-backups.html", "Backups & Retention"],
    ["", "Other tools"],
    ["admin-verifications.html", "Verifications"], ["verify.html", "Verify Pass"], ["admin-scan-history.html", "Scan History"], ["admin-account.html", "My Account"],
    ["#logout", "Logout"]
  ],
  driver: [["driver-dashboard.html", "Scanner & Dashboard"], ["driver-history.html", "My Scan History"], ["driver-transactions.html", "Transactions"], ["driver-notifications.html", "Notifications"], ["driver-documents.html", "My Documents"], ["admin-account.html", "My Account"]]
};
let staffUser = null;

/* Call at the top of every staff page: requireStaff(["admin"]). Returns the account, or null after redirecting. */
async function requireStaff(roles) {
  if (!getToken("staff")) { location.href = loginPage("staff"); return null; }
  try {
    const { admin } = await api("/auth/me");
    if (!roles.includes(admin.role)) { location.href = HOME[admin.role] || loginPage("staff"); return null; }
    staffUser = admin;
    paintStaffShell(admin);
    watchStaffSession(admin);
    return admin;
  } catch (e) { if (e.status !== 401) showToast(errText(e)); return null; }
}

/* Automatic session expiry: the token has a fixed lifetime set by the server (default 8 hours), and an administrator
   who is inactive for 30 minutes is signed out as well. Either way the server-side session is closed too. */
const ADMIN_IDLE_MINUTES = 30;
function watchStaffSession(admin) {
  const expire = (why) => { api("/auth/logout", { method: "POST" }).catch(() => {}).finally(() => { clearToken("staff"); location.href = loginPage("staff") + "?" + why + "=1"; }); };
  try {
    const t = getToken("staff");
    const { exp } = JSON.parse(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (exp) {
      const msLeft = Math.max(0, exp * 1000 - Date.now());
      setTimeout(() => { clearToken("staff"); location.href = loginPage("staff") + "?expired=1"; }, msLeft);
      // Warn once when there are two minutes or less left: any activity refreshes the session on the server.
      if (msLeft > 0 && msLeft <= 2 * 60 * 1000 && !document.getElementById("sessionWarning")) sessionWarningBanner(exp * 1000);
    }
  } catch (e) { /* unreadable token: the server will reject it anyway */ }
  if (admin.role !== "admin") return;                       // drivers keep scanning without touching the screen
  let idleMinutes = ADMIN_IDLE_MINUTES;                     // replaced by Settings -> Session timeout once it loads
  api("/admin/settings/runtime").then((r) => { idleMinutes = r.idleMinutes || idleMinutes; applyBranding(r); }).catch(() => {});
  let last = Date.now();
  ["click", "keydown", "mousemove", "touchstart", "scroll"].forEach((ev) => window.addEventListener(ev, () => { last = Date.now(); }, { passive: true }));
  setInterval(() => { if (Date.now() - last > idleMinutes * 60000) expire("idle"); }, 30000);
}

function sessionWarningBanner(expiresAt) {
  const el = document.createElement("div");
  el.id = "sessionWarning";
  el.style.cssText = "position:fixed;top:0;left:0;right:0;background:#b36b00;color:#fff;padding:.55rem 1rem;font-size:.8rem;z-index:9999;text-align:center;box-shadow:0 2px 6px rgba(0,0,0,.15)";
  el.innerHTML = `Your administrator session expires at ${new Date(expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}. Any activity keeps it signed in. <button id="sessionWarningDismiss" style="margin-left:.6rem;background:#fff;color:#b36b00;border:none;border-radius:3px;padding:.15rem .5rem;cursor:pointer;font-weight:600">Dismiss</button>`;
  document.body.insertBefore(el, document.body.firstChild);
  const hide = () => { const e = document.getElementById("sessionWarning"); if (e) e.remove(); };
  document.getElementById("sessionWarningDismiss").onclick = hide;
  ["click", "keydown", "mousemove", "scroll"].forEach((ev) => window.addEventListener(ev, hide, { passive: true }));
  setTimeout(hide, Math.max(0, expiresAt - Date.now()));
}

/* System name / logo from Settings, and a banner while maintenance mode is on (administrators keep working during maintenance). */
function applyBranding(r) {
  if (r.logo) document.querySelectorAll(".brand-mark").forEach((m) => { m.textContent = ""; m.style.padding = "0"; m.style.overflow = "hidden"; const i = document.createElement("img"); i.src = r.logo; i.alt = ""; i.style.cssText = "width:100%;height:100%;object-fit:contain"; m.appendChild(i); });
  document.querySelectorAll(".sidebar .brand p:first-child, .mobile-bar p").forEach((p) => { if (p.textContent.trim() === "TransitPass" && r.name) p.textContent = r.name; });
  if (r.maintenance && r.maintenance.enabled && !document.getElementById("maintBanner")) {
    const b = document.createElement("div"); b.id = "maintBanner"; b.setAttribute("role", "status");
    b.style.cssText = "background:#fef3c7;color:#78350f;border-bottom:1px solid #fcd34d;padding:.55rem 1.25rem;font-size:.82rem;font-weight:600";
    b.textContent = "Maintenance mode is ON: students and drivers are blocked. " + (r.maintenance.window ? "(" + r.maintenance.window + ") " : "") + "Turn it off in Settings.";
    const main = document.querySelector("main"); if (main) main.prepend(b);
  }
}

/* Role-specific sidebar: links, name and role line, log out. */
function paintStaffShell(admin) {
  const nav = document.querySelector(".nav");
  if (nav) {
    nav.innerHTML = NAV[admin.role].map(([href, label]) => (href === "" ? `<p class="nav-sec">${esc(label)}</p>` : `<a href="${href}">${esc(label)}</a>`)).join("");
    const out = nav.querySelector('a[href="#logout"]');
    if (out) out.addEventListener("click", (e) => { e.preventDefault(); logoutStaff(); });
    markActiveNav(); initMobileNav();
  }
  const who = document.getElementById("adminWho");
  const node = document.getElementById("adminNode");
  if (who) who.textContent = admin.name;
  if (node) node.textContent = admin.role === "driver" ? `Driver${admin.unit ? " · " + admin.unit : ""}` : "Administrator";
  const out = document.getElementById("logout");
  if (out) out.onclick = logoutStaff;
  if (admin.role === "driver" && typeof dpStartCounter === "function") dpStartCounter();   // notification badge + bell (js/driver.js)
}
/* Secure logout: the server invalidates the session (administrators), then the browser forgets it. */
async function logoutStaff() {
  const role = staffUser && staffUser.role;
  try { await api("/auth/logout", { method: "POST" }); } catch (e) { /* even if the server is unreachable, forget the session here */ }
  clearToken("staff");
  location.href = role === "driver" ? "driver-login.html?out=1" : "admin-login.html?out=1";
}

/* ---------- Student session ---------- */
async function requireStudent() {
  if (!getToken("student")) { location.href = "student-login.html"; return null; }
  try { return (await api("/student-portal/me", { who: "student" })).student; }
  catch (e) { if (e.status !== 401) showToast(errText(e)); return null; }
}
function logoutStudent() { clearToken("student"); location.href = "landing.html"; }

/* Renders an enrolled face photo if present, otherwise initials. */
function avatarOrPhoto(student, size = "avatar") {
  if (student && student.facePhoto) return `<img src="${esc(student.facePhoto)}" alt="${esc(student.name)}" class="${size}" style="object-fit:cover">`;
  return `<div class="${size}">${esc(initials(student ? student.name : "?"))}</div>`;
}

function renderScanRows(el, items) {
  if (!items.length) { el.innerHTML = `<p class="muted" style="font-size:.85rem">No scans logged yet.</p>`; return; }
  el.innerHTML = items.map((h) => `<div class="scan-item">
      <div>
        <p style="margin:0;font-weight:600;font-size:.9rem">${esc(h.route)}</p>
        <p class="mono muted" style="margin:.15rem 0 0;font-size:.72rem">${esc(h.operator)}</p>
        ${h.reason ? `<p class="muted" style="margin:.3rem 0 0;font-size:.75rem">${esc(h.reason)}</p>` : ""}
      </div>
      <div style="text-align:right;white-space:nowrap">
        ${codeBadge(h)}
        <p class="mono muted" style="margin:.3rem 0 0;font-size:.72rem">${esc(h.date)} · ${esc(h.time)}</p>
        <p class="mono" style="margin:.15rem 0 0;font-size:.75rem">${esc(h.fare)}</p>
      </div>
    </div>`).join("");
}

function initials(name) { return String(name || "?").split(" ").filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase(); }

function showToast(message) {
  let el = document.getElementById("appToast");
  if (!el) { el = document.createElement("div"); el.id = "appToast"; el.className = "toast"; document.body.appendChild(el); }
  el.textContent = message;
  clearTimeout(el._hideTimer);
  requestAnimationFrame(() => el.classList.add("show"));
  el._hideTimer = setTimeout(() => el.classList.remove("show"), 4200);
}

/* Waits for typing to pause before running fn (search boxes). */
function debounce(fn, ms = 250) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

/* Opens a file the API only serves to signed-in people (an uploaded document) in a new tab. */
async function openProtectedFile(apiPath, who = "staff") {
  const w = window.open("", "_blank");                      // opened first so the browser does not block it as a popup
  try {
    const res = await fetch(API_BASE + apiPath, { headers: { Authorization: "Bearer " + getToken(who) } });
    if (!res.ok) { let m = "Could not open the file."; try { m = (await res.json()).error || m; } catch (e) {} throw new Error(m); }
    const url = URL.createObjectURL(await res.blob());
    if (w) w.location = url; else location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) { if (w) w.close(); showToast(errText(e)); }
}

/* Small helper: run an async click handler with the button disabled and errors shown as a toast. */
async function guarded(btn, fn) {
  if (btn) btn.disabled = true;
  try { return await fn(); } catch (e) { showToast(errText(e)); } finally { if (btn) btn.disabled = false; }
}

const FACE_MODELS_URL = "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights";
const FACE_MATCH_THRESHOLD = 0.6; // face-api.js's own recommended distance cutoff for a match

let _faceApiPromise = null;
/* Loaded lazily the first time face enrollment is opened (it used to download on every page). */
function loadFaceApi() { return _faceApiPromise || (_faceApiPromise = (function () {
  const sources = [
    "https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js",
    "https://unpkg.com/face-api.js@0.22.2/dist/face-api.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/face-api.js/0.22.2/face-api.min.js"
  ];
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  return (async () => {
    for (const src of sources) {
      try { await loadScript(src); if (window.faceapi) break; } catch (e) {}
    }
    if (!window.faceapi) return false;
    try {
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(FACE_MODELS_URL),
        faceapi.nets.faceLandmark68TinyNet.loadFromUri(FACE_MODELS_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(FACE_MODELS_URL)
      ]);
      return true;
    } catch (e) { return false; }
  })();
})()); }

/* Runs face detection + descriptor extraction on a live <video> element.
   Returns { descriptor: number[], box } on success, or null if no face was
   found (bad lighting, face out of frame, etc.) — callers should ask the
   user to try again rather than treat this as a hard error. */
async function captureFaceDescriptor(videoEl) {
  const ready = await loadFaceApi();
  if (!ready || !videoEl || !videoEl.videoWidth) return null;
  try {
    const opts = new faceapi.TinyFaceDetectorOptions({ inputSize: 320 });
    const result = await faceapi.detectSingleFace(videoEl, opts).withFaceLandmarks(true).withFaceDescriptor();
    if (!result) return null;
    return { descriptor: Array.from(result.descriptor), box: result.detection.box };
  } catch (e) { return null; }
}

/* Snapshots a <video> frame down to a small square JPEG data URL for storage/display. */
function snapshotToDataUrl(videoEl, size = 160) {
  const c = document.createElement("canvas");
  c.width = size; c.height = size;
  const ctx = c.getContext("2d");
  const vw = videoEl.videoWidth, vh = videoEl.videoHeight;
  const side = Math.min(vw, vh);
  ctx.drawImage(videoEl, (vw - side) / 2, (vh - side) / 2, side, side, 0, 0, size, size);
  return c.toDataURL("image/jpeg", 0.85);
}

/* Euclidean distance between two face descriptors — lower is more similar.
   face-api.js's own guidance is that distances below ~0.6 are the same person. */
function faceDistance(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; sum += d * d; }
  return Math.sqrt(sum);
}

/* Converts a raw distance into a friendlier 0–100% confidence for the UI. */
function faceConfidence(distance) {
  return Math.max(0, Math.min(100, Math.round((1 - distance / 1.0) * 100)));
}

function renderEmailRows(el, items) {
  if (!items.length) { el.innerHTML = `<p class="muted" style="font-size:.85rem">No notifications sent yet.</p>`; return; }
  el.innerHTML = items.map((m) => `<div class="scan-item">
      <div>
        <p style="margin:0;font-weight:600;font-size:.9rem">${esc(m.subject)}</p>
        <p class="mono muted" style="margin:.15rem 0 0;font-size:.72rem">${esc(m.student)} · ${esc(m.to)}</p>
        <p class="muted" style="margin:.3rem 0 0;font-size:.75rem">${esc(m.body)}</p>
      </div>
      <div style="text-align:right;white-space:nowrap">
        <p class="mono muted" style="margin:.3rem 0 0;font-size:.72rem">${esc(m.date)} · ${esc(m.time)}</p>
      </div>
    </div>`).join("");
}
