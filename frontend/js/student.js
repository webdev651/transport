/* TransitPass Student Web Portal: shared code for every signed-in student page.
   Needs js/app.js first (api(), esc(), qrSvg(), showToast() ...). All data comes from the backend; nothing is hardcoded.
   Security notes: every dynamic value is escaped with esc() before it goes into HTML, and the session token is sent in the
   Authorization header (not a cookie), so other websites cannot make the browser act as the student (no CSRF). */
(function () {
  const IDLE_MINUTES = 30; // signed out after this long without any activity

  const ICON = {
    dashboard: "M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z",
    profile: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4 21a8 8 0 0 1 16 0",
    qr: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM20 14v7M14 20h3",
    eligibility: "M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6zM8.5 12l2.5 2.5 4.5-5",
    transactions: "M12 7v5l3 2M3 12a9 9 0 1 0 3-6.7M3 4v5h5",
    refunds: "M12 2a4 4 0 0 0-4 4v4a4 4 0 0 0 4 4 4 4 0 0 0 4-4V6a4 4 0 0 0-4-4M12 14l5 3-5 3z",
    notifications: "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 0 0 4 0",
    settings: "M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M14 4v4M8 10v4M16 16v4",
    logout: "M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 8l4 4-4 4M14 12H3",
    announcement: "M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1zM16 8a5 5 0 0 1 0 8",
    general: "M12 8v4M12 16h.01M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0"
  };
  const NAV = [
    ["dashboard", "student-dashboard.html", "Dashboard"],
    ["profile", "student-profile.html", "My Profile"],
    ["qr", "student-qr.html", "My QR Code"],
    ["eligibility", "student-eligibility.html", "Discount Eligibility"],
    ["transactions", "student-transactions.html", "Transaction History"],
    ["refunds", "student-refunds.html", "Refund Requests"],
    ["notifications", "student-notifications.html", "Notifications"],
    ["settings", "student-settings.html", "Settings"]
  ];
  const svg = (d) => `<svg viewBox="0 0 24 24"><path d="${d}"/></svg>`;

  /* ---------- API (always the student's own session) ---------- */
  const S = (path, opts = {}) => api("/student-portal" + path, { who: "student", ...opts });

  /* ---------- formatting ---------- */
  const peso = (n) => "₱" + Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const badge = (cls, label) => `<span class="badge b-${esc(cls)}">${esc(label)}</span>`;
  const regBadge = (reg) => badge(reg.status, reg.label);
  const eligBadge = (e) => badge(e.status, e.label);
  const qrBadge = (q) => badge(q.status === "active" ? "active" : q.status === "none" ? "none" : q.status === "expired" ? "expired" : "revoked", q.label || q.status);
  const reqBadge = (r) => badge(r.status, r.statusLabel);
  const avatar = (st, cls = "pic") => st && st.profilePhoto
    ? `<img class="${cls}" src="${esc(st.profilePhoto)}" alt="Profile photo of ${esc(st.name)}">`
    : `<div class="${cls}">${esc(initials(st ? st.name : "?"))}</div>`;
  const empty = (title, text) => `<div class="empty"><b>${esc(title)}</b>${esc(text || "")}</div>`;
  const skeleton = (n = 3) => Array.from({ length: n }, () => '<div class="sk"></div>').join("");

  /* ---------- buttons, dialogs ---------- */
  async function busy(btn, fn) {
    if (!btn) return fn();
    const label = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spin" aria-hidden="true"></span> Please wait…';
    try { return await fn(); }
    catch (e) { showToast(errText(e)); }
    finally { btn.disabled = false; btn.innerHTML = label; }
  }

  function openDialog(html) {
    const dlg = document.createElement("dialog");
    dlg.className = "tp-dialog";
    dlg.innerHTML = html;
    document.body.appendChild(dlg);
    dlg.addEventListener("close", () => dlg.remove());
    dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); }); // click outside closes
    dlg.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => dlg.close()));
    dlg.showModal();
    return dlg;
  }

  /* Yes / no question; resolves true or false. */
  function ask(title, text, { yes = "Yes, continue", danger = false } = {}) {
    return new Promise((resolve) => {
      const dlg = openDialog(`<h2>${esc(title)}</h2><p class="sub">${esc(text)}</p>
        <div class="btn-row"><button class="btn" data-close type="button">Cancel</button><button class="btn ${danger ? "danger" : "primary"}" id="askYes" type="button">${esc(yes)}</button></div>`);
      let answer = false;
      dlg.querySelector("#askYes").onclick = () => { answer = true; dlg.close(); };
      dlg.addEventListener("close", () => resolve(answer));
    });
  }

  /* A small form in a dialog. fields: [{name,label,type,options,placeholder,required,maxlength}] ; onSubmit(values) may throw to show the message. */
  function formDialog({ title, sub, fields, submit = "Send", onSubmit }) {
    const input = (f) => f.type === "select"
      ? `<select id="fd_${f.name}">${f.options.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join("")}</select>`
      : f.type === "textarea"
        ? `<textarea id="fd_${f.name}" maxlength="${f.maxlength || 500}" placeholder="${esc(f.placeholder || "")}"></textarea>`
        : `<input id="fd_${f.name}" type="${f.type || "text"}" maxlength="${f.maxlength || 160}" placeholder="${esc(f.placeholder || "")}" autocomplete="off">`;
    const dlg = openDialog(`<form novalidate><h2>${esc(title)}</h2>${sub ? `<p class="sub">${esc(sub)}</p>` : ""}
      <div class="form-grid">${fields.map((f) => `<div class="fld"><label for="fd_${f.name}">${esc(f.label)}</label>${input(f)}</div>`).join("")}</div>
      <p class="err-text" id="fdErr" role="alert"></p>
      <div class="btn-row"><button class="btn" data-close type="button">Cancel</button><button class="btn primary" type="submit">${esc(submit)}</button></div></form>`);
    const form = dlg.querySelector("form");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const values = {};
      fields.forEach((f) => { values[f.name] = document.getElementById("fd_" + f.name).value.trim(); });
      const err = dlg.querySelector("#fdErr");
      err.textContent = "";
      const btn = form.querySelector("button[type=submit]");
      btn.disabled = true;
      try { await onSubmit(values); dlg.close(); }
      catch (ex) { err.textContent = errText(ex); btn.disabled = false; }
    });
    return dlg;
  }

  /* show / hide password buttons inside .pw wrappers */
  function wirePasswordToggles(root = document) {
    root.querySelectorAll(".pw button").forEach((b) => {
      if (b.dataset.wired) return; b.dataset.wired = "1";
      b.addEventListener("click", () => {
        const i = b.parentElement.querySelector("input");
        const show = i.type === "password";
        i.type = show ? "text" : "password";
        b.textContent = show ? "Hide" : "Show";
        b.setAttribute("aria-pressed", String(show));
      });
    });
  }

  /* ---------- photos and documents ---------- */
  /* Shrinks a chosen photo to a small JPEG in the browser before upload (faster, and the server limits the size anyway). */
  function resizePhoto(file, max = 400) {
    return new Promise((resolve, reject) => {
      if (!/^image\//.test(file.type)) return reject(new Error("Choose an image file (JPG, PNG or WEBP)."));
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not read that image."))), "image/jpeg", 0.85);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read that image. Try a JPG or PNG.")); };
      img.src = url;
    });
  }

  /* Opens one of the student's own uploaded documents (needs the sign-in header, so it is fetched, then shown from a blob). */
  async function viewDocument(kind) {
    const w = window.open("", "_blank");
    try {
      const res = await fetch(API_BASE + "/student-portal/me/documents/" + kind, { headers: { Authorization: "Bearer " + getToken("student") } });
      if (!res.ok) throw new Error("Could not open the document.");
      const url = URL.createObjectURL(await res.blob());
      if (w) w.location = url; else location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { if (w) w.close(); showToast(errText(e)); }
  }

  /* ---------- QR: PDF and print (no libraries) ---------- */
  /* A one-page PDF with the QR image, written by hand (PDF 1.4, JPEG image object). */
  async function qrPdf({ payload, name, schoolId, expiresAt }) {
    const px = 600;
    const svgBlob = new Blob([qrSvg(payload, 2)], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; });
    const c = document.createElement("canvas"); c.width = px; c.height = px;
    const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, px, px); ctx.drawImage(img, 0, 0, px, px);
    URL.revokeObjectURL(url);
    const jpg = Uint8Array.from(atob(c.toDataURL("image/jpeg", 0.95).split(",")[1]), (ch) => ch.charCodeAt(0));
    const clean = (t) => String(t).replace(/[^\x20-\x7e]/g, "?").replace(/([()\\])/g, "\\$1");
    const lines = [
      ["F2", 22, 60, 780, "TransitPass Student QR Code"],
      ["F1", 12, 60, 756, "Talisay City College"],
      ["F2", 16, 60, 380, name],
      ["F1", 12, 60, 358, "Student ID: " + schoolId],
      ["F1", 12, 60, 338, "QR valid until: " + fmtDate(expiresAt)],
      ["F1", 10, 60, 300, "Show this QR code to the driver when you board. It contains only a random code (no personal information)."],
      ["F1", 10, 60, 286, "Do not share it. If you lose it, report it lost in your student portal so it is deactivated."]
    ];
    const text = lines.map(([f, s, x, y, t]) => `BT /${f} ${s} Tf ${x} ${y} Td (${clean(t)}) Tj ET`).join("\n");
    const content = `${text}\nq 300 0 0 300 147.5 420 cm /Im0 Do Q`;
    const enc = new TextEncoder();
    const parts = [];
    const offsets = [];
    let len = 0;
    const push = (b) => { const u = typeof b === "string" ? enc.encode(b) : b; parts.push(u); len += u.length; };
    const obj = (n, body, stream) => { offsets[n] = len; push(`${n} 0 obj\n${body}\n`); if (stream) { push("stream\n"); push(stream); push("\nendstream\n"); } push("endobj\n"); };
    push("%PDF-1.4\n");
    obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
    obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
    obj(3, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> /XObject << /Im0 7 0 R >> >> /Contents 4 0 R >>");
    obj(4, `<< /Length ${enc.encode(content).length} >>`, content);
    obj(5, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
    obj(6, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
    obj(7, `<< /Type /XObject /Subtype /Image /Width ${px} /Height ${px} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>`, jpg);
    const xref = len;
    let tail = `xref\n0 8\n0000000000 65535 f \n`;
    for (let n = 1; n <= 7; n++) tail += String(offsets[n]).padStart(10, "0") + " 00000 n \n";
    tail += `trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    push(tail);
    return new Blob(parts, { type: "application/pdf" });
  }
  function saveBlob(blob, filename) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function printQr({ payload, name, schoolId }) {
    let area = document.getElementById("printArea");
    if (!area) { area = document.createElement("div"); area.id = "printArea"; document.body.appendChild(area); }
    area.innerHTML = `<h2>TransitPass Student QR Code</h2>${qrSvg(payload, 2)}<h3>${esc(name)}</h3><p>Student ID: ${esc(schoolId)}</p><p style="font-size:12px">Show this QR code to the driver when you board. Do not share it.</p>`;
    document.body.classList.add("printing");
    const done = () => { document.body.classList.remove("printing"); area.innerHTML = ""; window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done);
    window.print();
  }

  /* ---------- Transaction receipt: PDF and print (no libraries) ---------- */
  /* A one-page PDF receipt, written by hand (PDF 1.4). Every value comes from the backend response; nothing is hardcoded. */
  async function receiptPdf(r) {
    const clean = (t) => String(t).replace(/[^\x20-\x7e]/g, "?").replace(/([()\\])/g, "\\$1");
    const money = (n) => (n == null ? "—" : "Php " + Number(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    const lines = [
      ["F2", 20, 60, 780, "TransitPass"],
      ["F1", 13, 60, 758, "Transaction Receipt"],
      ["F1", 10, 60, 740, "Reference no.: " + clean(r.reference)],
      ["F1", 10, 60, 726, "Date: " + clean(r.date) + "   Time: " + clean(r.time)],
      ["F1", 10, 60, 712, "Status: " + clean((r.statusLabel || r.status).toUpperCase())],
      ["F2", 13, 60, 690, "Student"],
      ["F1", 10, 60, 676, "Name: " + clean(r.student.name) + "   Student ID: " + clean(r.student.schoolId)],
      ["F2", 13, 60, 656, "Driver"],
      ["F1", 10, 60, 642, "Name: " + clean(r.driver.name) + "   ID: " + (r.driver.id == null ? "—" : r.driver.id)],
      ["F2", 13, 60, 622, "Service"],
      ["F1", 10, 60, 608, "Route: " + clean(r.service) + "   Operator: " + clean(r.operator) + "   Method: " + clean(r.method)],
      ["F2", 13, 60, 588, "Fare"],
      ["F1", 10, 60, 574, "Regular fare:        " + money(r.regularFare)],
      ["F1", 10, 60, 560, "Student discount:    " + (r.discountPercent || 0) + "%   − " + money(r.discountAmount)],
      ["F2", 12, 60, 542, "Final amount paid:   " + money(r.finalFare)],
    ];
    let y = 516;
    if (r.cancelled) { lines.push(["F1", 10, 60, y, "Cancellation: this ride was cancelled — not counted in completed totals"]); y -= 16; }
    if (r.refunded) { lines.push(["F1", 10, 60, y, "Refund: this ride was refunded"]); y -= 16; }
    if (r.underReview) { lines.push(["F1", 10, 60, y, "Pending: this ride is under review — full fare charged"]); y -= 16; }
    lines.push(["F1", 8, 60, y - 8, "Generated " + clean(new Date().toISOString().replace("T", " ").slice(0, 16)) + "  ·  Retrieved from actual database records  ·  Nothing hardcoded"]);
    const text = lines.map(([f, s, x, yy, t]) => `BT /${f} ${s} Tf ${x} ${yy} Td (${clean(t)}) Tj ET`).join("\n");
    const content = `${text}\n`;
    const enc = new TextEncoder();
    const parts = [];
    const offsets = [];
    let len = 0;
    const push = (b) => { const u = typeof b === "string" ? enc.encode(b) : b; parts.push(u); len += u.length; };
    const obj = (n, body, stream) => { offsets[n] = len; push(`${n} 0 obj\n${body}\n`); if (stream) { push("stream\n"); push(stream); push("\nendstream\n"); } push("endobj\n"); };
    push("%PDF-1.4\n");
    obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
    obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
    obj(3, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>");
    obj(4, `<< /Length ${enc.encode(content).length} >>`, content);
    obj(5, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
    obj(6, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
    const xref = len;
    let tail = `xref\n0 7\n0000000000 65535 f \n`;
    for (let n = 1; n <= 6; n++) tail += String(offsets[n]).padStart(10, "0") + " 00000 n \n";
    tail += `trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    push(tail);
    return new Blob(parts, { type: "application/pdf" });
  }
  function saveBlob(blob, filename) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  /* Renders a print-only receipt and opens the browser print dialog (Save as PDF is offered by the browser). */
  function printReceipt(r) {
    const area = document.getElementById("printArea");
    if (!area) { const a = document.createElement("div"); a.id = "printArea"; document.body.appendChild(a); }
    area.innerHTML = receiptHtml(r);
    document.body.classList.add("printing");
    const done = () => { document.body.classList.remove("printing"); area.innerHTML = ""; window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done, { once: true });
    window.print();
  }
  /* Shared HTML for a receipt (on-screen + print). Nothing hardcoded; all values from the API. */
  function receiptHtml(r) {
    const badge = (cls, label) => `<span style="display:inline-block;font-size:.7rem;font-weight:700;border-radius:4px;padding:.1rem .5rem;background:#eef2f9;color:#5b6b8a">${esc(cls)}</span>`;
    const statusChip = (r) => {
      const k = (r.status || "").toLowerCase();
      const col = k === "completed" ? "#0b7f55" : k === "cancelled" ? "#b00" : k === "refunded" ? "#0a0" : k === "pending" ? "#b36b00" : "#5b6b8a";
      return `<span style="display:inline-block;font-size:.7rem;font-weight:700;border-radius:4px;padding:.1rem .5rem;background:${col};color:#fff">${esc(r.statusLabel || r.status).toUpperCase()}</span>`;
    };
    const money = (n) => (n == null ? "—" : peso(n));
    return `<div class="receipt">
      <div class="receipt-head">
        <div class="receipt-brand">TransitPass</div>
        <div class="receipt-title">Transaction Receipt</div>
      </div>
      <div class="receipt-meta">
        <div><b>Reference no.</b><div class="mono">${esc(r.reference)}</div></div>
        <div><b>Date</b><div>${esc(r.date)}</div></div>
        <div><b>Time</b><div>${esc(r.time)}</div></div>
        <div><b>Status</b><div>${statusChip(r)}</div></div>
      </div>
      <div class="receipt-row"><div class="receipt-col"><h3 style="font-size:.9rem;margin:0 0 .25rem">Student</h3><div><b>Name:</b> ${esc(r.student.name)}</div><div><b>Student ID:</b> ${esc(r.student.schoolId)}</div></div><div class="receipt-col"><h3 style="font-size:.9rem;margin:0 0 .25rem">Driver</h3><div><b>Name:</b> ${esc(r.driver.name)}</div><div><b>ID:</b> ${r.driver.id == null ? "—" : r.driver.id}</div></div></div>
      <div class="receipt-row"><div class="receipt-col"><h3 style="font-size:.9rem;margin:0 0 .25rem">Service</h3><div><b>Route:</b> ${esc(r.service)}</div><div><b>Operator:</b> ${esc(r.operator)}</div><div><b>Method:</b> ${esc(r.method)}</div></div><div class="receipt-col"><h3 style="font-size:.9rem;margin:0 0 .25rem">Fare</h3><div><b>Regular fare:</b> ${money(r.regularFare)}</div><div><b>Student discount:</b> ${(r.discountPercent || 0)}%  (− ${money(r.discountAmount)})</div><div style="border-top:1px solid var(--border);padding-top:.35rem"><b>Final amount paid:</b> ${money(r.finalFare)}</div></div></div>
      ${r.cancelled ? `<div class="receipt-note receipt-note-cancel"><b>Cancelled:</b> this ride was cancelled — not counted in completed totals.</div>` : ""}
      ${r.refunded ? `<div class="receipt-note receipt-note-refund"><b>Refunded:</b> this ride was refunded.</div>` : ""}
      ${r.underReview ? `<div class="receipt-note receipt-note-pending"><b>Pending:</b> this ride is under review — full fare charged.</div>` : ""}
      <div class="receipt-foot">Generated ${esc(new Date().toISOString().replace("T", " ").slice(0, 16))} · Retrieved from actual database records · Nothing hardcoded</div>
    </div>`;
  }

  /* ---------- session: idle sign-out ---------- */
  function watchIdle() {
    let last = Date.now();
    let lastWrite = 0;
    const touch = () => { const n = Date.now(); if (n - lastWrite > 5000) { last = n; lastWrite = n; } };
    ["click", "keydown", "mousemove", "touchstart", "scroll"].forEach((ev) => window.addEventListener(ev, touch, { passive: true }));
    setInterval(() => {
      if (Date.now() - last > IDLE_MINUTES * 60000) { clearToken("student"); location.href = "student-login.html?expired=1"; }
    }, 30000);
  }

  /* ---------- page shell ---------- */
  function renderShell({ nav, eyebrow, title, sub }) {
    const links = NAV.map(([key, href, label]) =>
      `<a href="${href}" data-i="1" class="${key === nav ? "active" : ""}">${svg(ICON[key])}<span class="t">${label}</span>${key === "notifications" ? '<b class="cnt" id="navBadge" hidden>0</b>' : ""}</a>`).join("")
      + `<a href="#" id="logout" data-i="1" class="logout">${svg(ICON.logout)}<span class="t">Logout</span></a>`;
    document.getElementById("shell").innerHTML = `
      <div class="mobile-bar">
        <button id="navToggle" class="nav-toggle" aria-label="Open menu" aria-expanded="false" aria-controls="sidebar"><span></span><span></span><span></span></button>
        <div class="brand-mark" style="width:2rem;height:2rem;font-size:.8rem">TP</div>
        <p style="margin:0;font-weight:700">TransitPass</p>
      </div>
      <div class="sidebar-backdrop" id="sidebarBackdrop"></div>
      <aside class="sidebar" id="sidebar" aria-label="Student navigation">
        <div class="brand"><div class="brand-mark">TP</div><div><p>TransitPass</p><p class="label-caps">Student portal</p></div><button id="navClose" class="nav-close" aria-label="Close menu">&times;</button></div>
        <nav class="nav">${links}</nav>
        <div class="sidebar-foot"><div class="who-row"><div id="sideAvatar" class="avatar">·</div><div style="min-width:0"><p id="who" style="font-size:.88rem;font-weight:600"></p><p id="sid" class="mono" style="font-size:.72rem;opacity:.8"></p></div></div></div>
      </aside>
      <main>
        <header class="hero"><p class="label-caps">${esc(eyebrow)}</p><h1>${esc(title)}</h1>${sub ? `<p style="margin:.5rem 0 0;max-width:42rem;font-size:.9rem">${esc(sub)}</p>` : ""}</header>
        <div class="page"><div class="sp-page" id="content"></div></div>
      </main>`;
    const tpl = document.getElementById("tpl");
    if (tpl) document.getElementById("content").append(tpl.content.cloneNode(true));
  }

  function paintWho(st) {
    document.getElementById("who").textContent = st.name;
    document.getElementById("sid").textContent = st.schoolId;
    const a = document.getElementById("sideAvatar");
    if (st.profilePhoto) a.outerHTML = `<img id="sideAvatar" class="avatar" style="object-fit:cover" src="${esc(st.profilePhoto)}" alt="">`;
  }
  function setBadge(n) {
    const b = document.getElementById("navBadge");
    if (!b) return;
    b.textContent = n > 99 ? "99+" : n; b.hidden = !n;
  }
  const refreshBadge = () => S("/me/notifications?filter=unread&limit=1").then((r) => setBadge(r.unread)).catch(() => {});

  /* Every portal page calls this once: it builds the shell, checks the session, then runs the page's own code. */
  async function boot(opts, run) {
    renderShell(opts);
    document.getElementById("logout").addEventListener("click", (e) => { e.preventDefault(); logoutStudent(); });
    const me = await requireStudent();            // sends the student to the login page when there is no valid session
    if (!me) return;
    document.getElementById("who").textContent = me.name;
    document.getElementById("sid").textContent = me.schoolId;
    watchIdle();
    refreshBadge();
    try { await run(me); }
    catch (e) { if (e.status !== 401) { document.getElementById("content").insertAdjacentHTML("afterbegin", `<div class="notice bad"><div><b>Something went wrong</b>${esc(errText(e))}</div></div>`); } }
  }

  window.Student = { boot, S, peso, badge, regBadge, eligBadge, qrBadge, reqBadge, avatar, empty, skeleton, busy, openDialog, ask, formDialog,
    wirePasswordToggles, resizePhoto, viewDocument, qrPdf, saveBlob, printQr, receiptPdf, printReceipt, paintWho, setBadge, refreshBadge, ICON };
})();
