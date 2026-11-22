/* Driver web portal helpers (Phase 1). Load after js/app.js. Everything real comes from /api/driver/*; nothing is stored in the browser. */

/* ---------- small icon set (same stroke style as the sidebar icons) ---------- */
const DP_ICONS = {
  bell: "M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4",
  doc: "M6 3h9l4 4v14H6zM9 12h7M9 16h7",
  id: "M4 5h16v14H4zM8 10a2 2 0 1 0 0 .1M13 10h4M13 14h4M6 17c.5-2 4-2 4 0",
  bus: "M5 17h14M4 6h16v11H4zM7 20v-3M17 20v-3M4 11h16",
  route: "M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4M18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4M8 17h6a4 4 0 0 0 0-8h-2",
  check: "M5 12.5l4.5 4.5L19 7.5",
  scan: "M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10",
  alert: "M12 3l9 16H3zM12 10v4M12 17v.5",
  peso: "M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
  tag: "M3 12l9-9h8v8l-9 9zM15 7h.01",
  inbox: "M3 13l3-8h12l3 8v6H3zM3 13h5l1 3h6l1-3h5",
  mega: "M3 11v3l12 5V6zM15 8c3 0 5 1.5 5 4s-2 4-5 4M7 14v5",
  clock: "M12 7v5l3 2M3 12a9 9 0 1 0 3-6.7M3 4v5h5",
  refund: "M4 12a8 8 0 1 0 3-6.2M4 4v5h5M12 8v8",
  info: "M12 8v.01M12 11v5M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0"
};
const dpIcon = (n) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${DP_ICONS[n] || DP_ICONS.info}"/></svg>`;
const dpEmpty = (icon, title, text) => `<div class="dp-empty">${dpIcon(icon)}<b>${esc(title)}</b>${esc(text)}</div>`;

/* ---------- formatting ---------- */
const dpMoney = (n) => "₱" + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function dpAgo(iso) {
  if (!iso) return "—";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "Just now";
  if (s < 3600) return Math.floor(s / 60) + " min ago";
  if (s < 86400) return Math.floor(s / 3600) + " h ago";
  if (s < 7 * 86400) return Math.floor(s / 86400) + " d ago";
  return fmtDate(iso);
}
const dpBytes = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB");
const dpTime = (iso) => (iso ? new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "—");
const dpYmd = (ymd) => (ymd ? new Date(ymd + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—");

/* Counts a number up once (skipped when the person prefers reduced motion). */
function dpCount(el, to, { money = false } = {}) {
  const fmt = (v) => (money ? dpMoney(v) : Math.round(v).toLocaleString("en-US"));
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || !isFinite(to) || to === 0) { el.textContent = fmt(to); return; }
  const t0 = performance.now(), dur = 600;
  (function tick(t) { const p = Math.min(1, (t - t0) / dur); el.textContent = fmt(to * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(tick); })(t0);
}

/* ---------- documents: statuses, expiry ---------- */
const DP_DOC_STATUS = {
  verified: ["ok", "Verified"], pending: ["warn", "Pending review"], rejected: ["bad", "Rejected"], expired: ["bad", "Expired"], missing: ["muted", "Not uploaded"], incomplete: ["warn", "Incomplete"]
};
function dpDocChip(status) { const s = DP_DOC_STATUS[status] || ["muted", status]; return `<span class="dp-st ${s[0]}">${esc(s[1])}</span>`; }
/* Expiry line + progress bar for one document. */
function dpExpiry(d) {
  if (d.expiryState === "none" || !d.expiresOn) return `<div class="dp-expiry"><p>No expiry date recorded.</p></div>`;
  const days = d.daysToExpiry;
  const cls = d.expiryState === "expired" ? "bad" : d.expiryState === "expiring" ? "warn" : "";
  const pct = d.expiryState === "expired" ? 100 : Math.max(6, Math.min(100, Math.round((days / 365) * 100)));
  const text = days < 0 ? `Expired <b>${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago</b> (${dpYmd(d.expiresOn)})`
    : days === 0 ? `<b>Expires today</b> (${dpYmd(d.expiresOn)})`
    : `Valid until <b>${dpYmd(d.expiresOn)}</b> · ${days} day${days === 1 ? "" : "s"} left`;
  return `<div class="dp-expiry ${cls}"><div class="bar"><i style="width:${pct}%"></i></div><p>${text}</p></div>`;
}

/* A document file needs the sign-in token, so it is fetched with fetch() and shown from a temporary blob address. */
async function dpFetchFile(path) {
  const res = await fetch(API_BASE + path, { headers: { Authorization: `Bearer ${getToken("staff")}`, Accept: "*/*", "X-Device-Id": deviceId() } });
  const renewed = res.headers.get("X-Refresh-Token");
  if (renewed) { try { setToken("staff", renewed, !!localStorage.getItem(TOKEN_KEYS.staff)); } catch (e) { /* storage unavailable */ } }
  if (!res.ok) {
    let msg = `Could not open the file (${res.status}).`;
    try { msg = (await res.json()).error || msg; } catch (e) { /* not JSON */ }
    if (res.status === 401) { clearToken("staff"); location.href = loginPage("staff") + "?expired=1"; }
    throw new Error(msg);
  }
  return { blob: await res.blob(), type: res.headers.get("Content-Type") || "" };
}

/* ---------- dialogs ---------- */
function dpModal(id, title) {
  let dlg = document.getElementById(id);
  if (!dlg) {
    dlg = document.createElement("dialog"); dlg.id = id; dlg.className = "dp-modal"; dlg.setAttribute("aria-labelledby", id + "T");
    dlg.innerHTML = `<header><h3 id="${id}T"></h3><button type="button" aria-label="Close" data-close>&times;</button></header><div class="body"></div><div class="foot" hidden></div>`;
    document.body.appendChild(dlg);
    dlg.addEventListener("click", (e) => { if (e.target === dlg || e.target.closest("[data-close]")) dlg.close(); });
  }
  dlg.querySelector("h3").textContent = title;
  return dlg;
}

/* Opens a driver document inside a dialog (image or PDF). Revokes the temporary address when closed. */
async function dpPreviewDocument(doc) {
  const dlg = dpModal("dpPreview", `${doc.typeLabel}${doc.fileName ? " · " + doc.fileName : ""}`);
  const body = dlg.querySelector(".body"), foot = dlg.querySelector(".foot");
  body.innerHTML = `<div class="dp-preview"><span class="muted"><span class="dp-spin"></span>Opening…</span></div>`; foot.hidden = true;
  dlg.showModal();
  let url = null;
  dlg.addEventListener("close", () => { if (url) URL.revokeObjectURL(url); body.innerHTML = ""; }, { once: true });
  try {
    const { blob, type } = await dpFetchFile(`/driver/documents/${doc.id}/file`);
    url = URL.createObjectURL(blob);
    const isPdf = /pdf/i.test(type);
    body.innerHTML = `<div class="dp-preview">${isPdf ? `<iframe title="${esc(doc.typeLabel)}" src="${url}"></iframe>` : `<img alt="${esc(doc.typeLabel)}" src="${url}">`}</div>`;
    foot.hidden = false;
    foot.innerHTML = `<a class="dp-link" href="${url}" download="${esc(doc.fileName || doc.typeLabel)}" style="align-self:center;margin-right:auto">Download a copy</a><button type="button" data-close>Close</button>`;
  } catch (e) { body.innerHTML = `<div class="dp-preview"><p class="dp-msg err">${esc(errText(e))}</p></div>`; }
}

/* ---------- notification counter (sidebar badge + bell in the top bar) ---------- */
let dpUnread = 0;
function dpPaintCounter(n) {
  dpUnread = Math.max(0, Number(n) || 0);
  const link = document.querySelector('.nav a[href="driver-notifications.html"]');
  if (link && link.dataset.i) {                      // wait until the shared sidebar has drawn its icons
    let c = link.querySelector(".cnt");
    if (dpUnread) { if (!c) { c = document.createElement("span"); c.className = "cnt"; link.appendChild(c); } c.textContent = dpUnread > 99 ? "99+" : dpUnread; }
    else if (c) c.remove();
  }
  const bar = document.querySelector(".topbar");
  if (!bar) return;
  let bell = document.getElementById("dpBell");
  if (!bell) {
    bell = document.createElement("a"); bell.id = "dpBell"; bell.className = "dp-bell"; bell.href = "driver-notifications.html";
    bell.innerHTML = `${dpIcon("bell")}<span class="n" hidden></span>`;
    const profile = bar.querySelector(".profile"); bar.insertBefore(bell, profile || null);
  }
  const badge = bell.querySelector(".n");
  badge.hidden = !dpUnread; badge.textContent = dpUnread > 99 ? "99+" : dpUnread;
  bell.setAttribute("aria-label", dpUnread ? `Notifications: ${dpUnread} unread` : "Notifications: none unread");
}
async function dpRefreshCounter() {
  try {
    const before = dpUnread;
    const c = await api("/driver/notifications/count");
    dpPaintCounter(c.unread);
    if (c.unread > before) { const b = document.getElementById("dpBell"); if (b) { b.classList.remove("ring"); void b.offsetWidth; b.classList.add("ring"); } }
  } catch (e) { /* the counter is a convenience; the page itself reports real errors */ }
}
/* Called by the shared sidebar once a driver is signed in. */
function dpStartCounter() {
  dpRefreshCounter();
  dpConnection();
  setTimeout(dpRefreshCounter, 700);                 // the top bar / sidebar icons are drawn just after the first paint
  if (!window.__dpTimer) window.__dpTimer = setInterval(() => { if (!document.hidden) dpRefreshCounter(); }, 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) dpRefreshCounter(); });
}

/* ---------- internet connection status indicator (online / offline chip in the top bar) ---------- */
let dpConnTimer;
function dpConnection() {
  const paint = (online) => {
    let el = document.getElementById("dpConn");
    if (!el) {
      const bar = document.querySelector(".topbar");
      if (!bar) return;                              // shell.js draws the topbar after the page script starts; retry below
      el = document.createElement("span"); el.id = "dpConn"; el.className = "dp-conn";
      el.innerHTML = '<span class="dp-conn-dot"></span><span class="dp-conn-txt">Online</span>';
      el.setAttribute("aria-label", "Internet connection");
      const profile = bar.querySelector(".profile");
      bar.insertBefore(el, profile || null);
    }
    const dot = el.querySelector(".dp-conn-dot"), txt = el.querySelector(".dp-conn-txt");
    if (online) { dot.className = "dp-conn-dot ok"; txt.textContent = "Online"; el.dataset.state = "online"; }
    else { dot.className = "dp-conn-dot bad"; txt.textContent = "Offline"; el.dataset.state = "offline"; }
    el.setAttribute("aria-label", "Internet connection: " + (online ? "online" : "offline"));
  };
  const tick = () => { paint(navigator.onLine); if (!document.getElementById("dpConn")) dpConnTimer = setTimeout(tick, 200); };
  tick();
  window.addEventListener("online", () => paint(true));
  window.addEventListener("offline", () => paint(false));
}

/* ---------- password strength ---------- */
const DP_RULES = {
  driver: [["At least 8 characters", (p) => p.length >= 8], ["An uppercase letter", (p) => /[A-Z]/.test(p)], ["A lowercase letter", (p) => /[a-z]/.test(p)], ["A number", (p) => /[0-9]/.test(p)], ["A symbol (! @ # $ %)", (p) => /[^A-Za-z0-9\s]/.test(p)]],
  admin: [["At least 8 characters", (p) => p.length >= 8]]
};
/* Wires a password field to a live meter + checklist + "passwords match" line. Returns { ok() } (all required rules met and both fields equal). */
function dpPasswordMeter({ input, confirm, mount, role, username }) {
  const rules = DP_RULES[role === "driver" ? "driver" : "admin"];
  const bonus = [(p) => p.length >= 12, (p) => /[^A-Za-z0-9\s]/.test(p) && /[A-Z]/.test(p) && /[0-9]/.test(p)];
  mount.innerHTML = `<div class="dp-meter" aria-hidden="true"><i></i></div><div class="dp-meter-label"><span class="lbl">Password strength</span><b class="lvl"></b></div>
    <ul class="dp-rules" aria-live="polite">${rules.map(([t]) => `<li>${esc(t)}</li>`).join("")}</ul>`;
  const bar = mount.querySelector(".dp-meter i"), lvl = mount.querySelector(".lvl"), items = [...mount.querySelectorAll(".dp-rules li")];
  const matchEl = confirm && confirm.parentElement.querySelector(".dp-match");
  function update() {
    const p = input.value;
    const met = rules.map(([, f]) => f(p));
    items.forEach((li, i) => li.classList.toggle("ok", met[i]));
    const base = rules.length ? met.filter(Boolean).length / rules.length : 0;
    const extra = p ? bonus.filter((f) => f(p)).length * 0.1 : 0;
    const score = p ? Math.min(1, base * 0.8 + extra) : 0;
    const label = !p ? "" : score < 0.45 ? "Weak" : score < 0.75 ? "Fair" : score < 0.95 ? "Good" : "Strong";
    bar.style.width = Math.round(score * 100) + "%";
    bar.style.background = score < 0.45 ? "var(--bad)" : score < 0.75 ? "var(--warn)" : "var(--ok)";
    lvl.textContent = label;
    if (matchEl) {
      if (!confirm.value) { matchEl.textContent = ""; matchEl.className = "dp-match"; }
      else if (confirm.value === p) { matchEl.textContent = "Passwords match."; matchEl.className = "dp-match ok"; }
      else { matchEl.textContent = "Passwords do not match yet."; matchEl.className = "dp-match err"; }
    }
  }
  input.addEventListener("input", update); if (confirm) confirm.addEventListener("input", update); update();
  return {
    update,
    ok: () => rules.every(([, f]) => f(input.value)) && (!confirm || confirm.value === input.value) && !(username && username.length >= 4 && input.value.toLowerCase().includes(username.toLowerCase()))
  };
}
/* "Show / hide" toggle for a password field wrapped in .dp-pw. */
function dpPasswordToggles(root = document) {
  root.querySelectorAll(".dp-pw").forEach((w) => {
    if (w.dataset.t) return; w.dataset.t = "1";
    const input = w.querySelector("input"), b = document.createElement("button");
    b.type = "button"; b.textContent = "Show"; b.setAttribute("aria-label", "Show password");
    b.onclick = () => { const show = input.type === "password"; input.type = show ? "text" : "password"; b.textContent = show ? "Hide" : "Show"; b.setAttribute("aria-label", show ? "Hide password" : "Show password"); };
    w.appendChild(b);
  });
}
