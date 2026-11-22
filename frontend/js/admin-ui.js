/* Shared building blocks for the administrator modules (AM.*). Uses the helpers already in app.js (api, esc, badge, showToast ...)
   so every module shows the same tables, forms, confirmation dialogs and loading / empty / error states. */
const AM = (() => {
  const STATUS = {                                            // module status -> existing badge colour
    active: "active", verified: "active", approved: "active", completed: "active", published: "active", delivered: "active", ok: "active", read: "active", reviewed: "active", valid: "active", actioned: "active",
    refunded: "review", pending: "pending", scheduled: "pending", draft: "pending", open: "pending", ongoing: "pending", unread: "pending", running: "pending", maintenance: "pending", expiring: "pending", incomplete: "pending", queued: "pending", medium: "pending", warning: "pending", unknown: "inactive",
    rejected: "rejected", failed: "rejected", cancelled: "rejected", removed: "rejected", deactivated: "rejected", high: "rejected", stale: "rejected", none: "rejected",
    expired: "expired", deleted: "inactive", inactive: "inactive", dismissed: "inactive", low: "inactive", missing: "inactive"
  };
  const label = (s) => String(s ?? "").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
  const badgeOf = (s, text) => badge(STATUS[s] || "inactive", text || label(s));
  const money = (n) => "₱" + Number(n || 0).toFixed(2);
  const bytes = (n) => (n == null ? "—" : n < 1024 ? n + " B" : n < 1048576 ? (n / 1024).toFixed(1) + " KB" : (n / 1048576).toFixed(1) + " MB");
  const q = (obj) => Object.entries(obj).filter(([, v]) => v !== "" && v != null && v !== "all").map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
  const $ = (id) => document.getElementById(id);
  const toLocalInput = (iso) => { if (!iso) return ""; const d = new Date(iso), p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
  const fromLocalInput = (v) => (v ? new Date(v).toISOString() : undefined);
  const today = () => { const d = new Date(), p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

  /* loading / empty / error placeholders */
  function state(el, kind, msg) {
    const cols = el.tagName === "TBODY" ? (el.closest("table").querySelectorAll("thead th").length || 1) : 0;
    const inner = kind === "loading" ? `<span class="am-spin"></span>${esc(msg || "Loading…")}` : esc(msg || (kind === "empty" ? "Nothing here yet." : "Something went wrong."));
    el.innerHTML = cols ? `<tr><td colspan="${cols}"><div class="am-state ${kind === "error" ? "err" : ""}">${inner}</div></td></tr>` : `<div class="am-state ${kind === "error" ? "err" : ""}">${inner}</div>`;
  }
  function stats(el, items) {
    el.innerHTML = items.map((k) => `<article class="card"><p class="label-caps muted">${esc(k.label)}</p><p class="kpi-value">${esc(k.value)}</p>${k.note ? `<p class="muted" style="font-size:.76rem;margin:0">${esc(k.note)}</p>` : ""}</article>`).join("");
  }
  /* tabs: AM.tabs(el, [["id","Label"]...], (id) => ...) */
  function tabs(el, items, onChange, start) {
    el.className = "am-tabs"; el.setAttribute("role", "tablist");
    const sel = (id) => { el.querySelectorAll("button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.id === id))); onChange(id); };
    el.innerHTML = items.map(([id, l]) => `<button type="button" role="tab" data-id="${id}" aria-selected="false">${esc(l)}</button>`).join("");
    el.onclick = (e) => { const b = e.target.closest("button[data-id]"); if (b) sel(b.dataset.id); };
    sel(start || items[0][0]);
  }
  /* pager: AM.pager(el, { total, limit, offset }, (newOffset) => ...) */
  function pager(el, { total, limit, offset }, go) {
    if (!total || total <= limit) { el.innerHTML = total ? `<span class="muted">${total} record${total === 1 ? "" : "s"}</span>` : ""; return; }
    const from = offset + 1, to = Math.min(total, offset + limit);
    el.innerHTML = `<span class="muted">${from}–${to} of ${total}</span><span class="am-actions"><button type="button" data-p="prev" ${offset <= 0 ? "disabled" : ""}>Previous</button><button type="button" data-p="next" ${to >= total ? "disabled" : ""}>Next</button></span>`;
    el.onclick = (e) => { const b = e.target.closest("button[data-p]"); if (b) go(b.dataset.p === "prev" ? Math.max(0, offset - limit) : offset + limit); };
  }
  /* A list screen: AM.list({ tbody, pagerEl, path, params(), row(r), limit, onData }) -> { load(resetOffset) } */
  function list({ tbody, pagerEl, path, params = () => ({}), row, limit = 25, empty = "Nothing here yet.", onData }) {
    let offset = 0, seq = 0;
    async function load(reset) {
      if (reset) offset = 0;
      const mine = ++seq;
      state(tbody, "loading");
      try {
        const d = await api(`${path}?${q({ ...params(), limit, offset })}`);
        if (mine !== seq) return d;
        if (!d.items.length) state(tbody, "empty", empty); else tbody.innerHTML = d.items.map(row).join("");
        if (pagerEl) pager(pagerEl, { total: d.total, limit, offset }, (o) => { offset = o; load(); });
        if (onData) onData(d);
        return d;
      } catch (e) { if (mine === seq) state(tbody, "error", errText(e)); }
    }
    return { load };
  }

  /* ----- dialogs ----- */
  function field(f, v) {
    const id = "amf_" + f.name, val = v ?? f.value ?? "", req = f.required ? " required" : "";
    const common = `id="${id}" name="${f.name}"${req}${f.maxlength ? ` maxlength="${f.maxlength}"` : ""}${f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : ""}`;
    let input;
    if (f.type === "select") input = `<select ${common}>${(f.options || []).map(([ov, ol]) => `<option value="${esc(ov)}" ${String(ov) === String(val) ? "selected" : ""}>${esc(ol)}</option>`).join("")}</select>`;
    else if (f.type === "textarea") input = `<textarea ${common}>${esc(val)}</textarea>`;
    else if (f.type === "checkbox") return `<label class="am-switch"><input type="checkbox" id="${id}" name="${f.name}" ${val ? "checked" : ""}> <span>${esc(f.label)}</span></label>`;
    else if (f.type === "file") input = `<input type="file" ${common} ${f.accept ? `accept="${f.accept}"` : ""}>`;
    else input = `<input type="${f.type || "text"}" ${common} value="${esc(val)}" ${f.type === "number" ? `${f.min != null ? `min="${f.min}"` : ""} ${f.max != null ? `max="${f.max}"` : ""} step="${f.step || 1}"` : ""} autocomplete="off">`;
    return `<div class="${f.wide ? "" : ""}"><label class="label-caps muted" for="${id}">${esc(f.label)}${f.required ? " *" : ""}</label>${input}${f.hint ? `<p class="hint">${esc(f.hint)}</p>` : ""}</div>`;
  }
  function readValues(root, fields) {
    const out = {};
    for (const f of fields) {
      const el = root.querySelector(`[name="${f.name}"]`); if (!el) continue;
      out[f.name] = f.type === "checkbox" ? el.checked : f.type === "file" ? el.files[0] || null : el.value;
    }
    return out;
  }
  /* AM.form({ title, intro, fields, initial, submit, wide, onSubmit(values) }) -> Promise<result|null>. Server errors stay inside the dialog. */
  function form({ title, intro, fields, initial = {}, submit = "Save", wide = false, danger = false, onSubmit }) {
    return new Promise((resolve) => {
      const dlg = document.createElement("dialog");
      dlg.className = "tp-dialog" + (wide ? " wide" : "");
      dlg.innerHTML = `<form method="dialog" novalidate><h2 style="margin:0;font-size:1.1rem">${esc(title)}</h2>${intro ? `<p class="muted" style="font-size:.85rem;margin:.5rem 0 0">${intro}</p>` : ""}
        <div class="${fields.length > 3 && wide ? "fgrid" : ""}">${fields.map((f) => field(f, initial[f.name])).join("")}</div>
        <p class="err-text" role="alert"></p>
        <div class="row"><button type="button" data-x>Cancel</button><button type="submit" class="primary" ${danger ? 'style="background:var(--destructive);border-color:var(--destructive)"' : ""}>${esc(submit)}</button></div></form>`;
      document.body.appendChild(dlg);
      const err = dlg.querySelector(".err-text"), ok = dlg.querySelector('button[type="submit"]');
      let result = null;
      const close = () => { dlg.close(); };
      dlg.addEventListener("close", () => { dlg.remove(); resolve(result); });
      dlg.querySelector("[data-x]").onclick = close;
      dlg.querySelector("form").addEventListener("submit", async (e) => {
        e.preventDefault(); err.textContent = "";
        const values = readValues(dlg, fields);
        for (const f of fields) if (f.required && f.type !== "checkbox" && !values[f.name]) { err.textContent = `${f.label} is required.`; return; }
        ok.disabled = true; const t = ok.textContent; ok.innerHTML = '<span class="am-spin"></span>Working…';
        try { result = (await onSubmit(values)) ?? true; close(); }
        catch (x) { err.textContent = errText(x); ok.disabled = false; ok.textContent = t; }
      });
      dlg.showModal();
      const first = dlg.querySelector("input,select,textarea"); if (first) first.focus();
    });
  }
  /* Confirmation dialog. opts.reason = { label, min } asks for a written reason; opts.password asks the administrator to re-enter their password. */
  function confirmBox({ title, message, confirm = "Confirm", danger = false, reason, password = false, run }) {
    const fields = [];
    if (reason) fields.push({ name: "reason", label: reason.label || "Reason", type: "textarea", required: reason.required !== false, maxlength: 500, hint: reason.hint });
    if (password) fields.push({ name: "password", label: "Your password", type: "password", required: true, hint: "Re-enter your administrator password to authorize this action." });
    return form({ title, intro: message, fields, submit: confirm, danger, onSubmit: (v) => run(v) });
  }
  async function download(path, filename) {
    try {
      const res = await fetch(API_BASE + path, { headers: { Authorization: "Bearer " + getToken("staff"), "X-Device-Id": deviceId() } });
      if (!res.ok) { let m = "Download failed."; try { m = (await res.json()).error || m; } catch (e) {} throw new Error(m); }
      const url = URL.createObjectURL(await res.blob()), a = document.createElement("a");
      a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) { showToast(errText(e)); }
  }
  /* Run a button action: disabled while working, toast on error, optional success message. */
  async function act(btn, fn, okMsg) {
    return guarded(btn, async () => { const r = await fn(); if (okMsg) showToast(okMsg); return r; });
  }
  /* A read/act panel: AM.panel(title) -> { body, close }. The caller fills `body` and wires its own buttons. */
  function panel(title, { wide = true } = {}) {
    const dlg = document.createElement("dialog");
    dlg.className = "tp-dialog" + (wide ? " wide" : "");
    dlg.innerHTML = `<div class="row" style="justify-content:space-between;margin:0"><h2 style="margin:0;font-size:1.1rem">${esc(title)}</h2><button type="button" data-x aria-label="Close">&times;</button></div><div data-body></div>`;
    document.body.appendChild(dlg);
    const close = () => dlg.close();
    dlg.addEventListener("close", () => dlg.remove());
    dlg.querySelector("[data-x]").onclick = close;
    dlg.showModal();
    return { el: dlg, body: dlg.querySelector("[data-body]"), close };
  }
  const kv = (pairs) => `<dl class="am-kv">${pairs.filter(([, v]) => v !== undefined).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v === null || v === "" ? "—" : v}</dd>`).join("")}</dl>`;
  /* A settings form: AM.settingsForm(el, { fields:[{key,label,type,hint,options,min,max}], onSaved }) loads and saves /admin/settings. */
  async function settingsForm(el, { fields, note, onSaved }) {
    const cur = (await api("/admin/settings")).settings;
    el.innerHTML = `${note || ""}<form novalidate><div class="am-grid">${fields.map((f) => field({ name: f.key, label: f.label, type: f.type, options: f.options, hint: f.hint, min: f.min, max: f.max, maxlength: f.maxlength }, cur[f.key])).join("")}</div><p class="err-text" role="alert"></p><div class="row" style="justify-content:flex-start"><button class="primary" type="submit">Save changes</button></div></form>`;
    const f = el.querySelector("form"), err = f.querySelector(".err-text");
    f.addEventListener("submit", async (e) => {
      e.preventDefault(); err.textContent = "";
      const body = {};
      for (const x of fields) { const i = f.querySelector(`[name="${x.key}"]`); body[x.key] = x.type === "checkbox" ? i.checked : x.type === "number" ? Number(i.value) : i.value; }
      const btn = f.querySelector("button[type=submit]"); btn.disabled = true;
      try { await api("/admin/settings", { method: "PATCH", body }); showToast("Settings saved."); if (onSaved) onSaved(); } catch (x) { err.textContent = errText(x); } finally { btn.disabled = false; }
    });
  }
  const dt = (iso) => (iso ? fmtDateTime(iso) : "—");
  const personOptions = async (kind) => (await api(kind === "driver" ? "/admin/drivers?limit=200&status=active" : "/admin/vehicles?limit=200")).items;
  return { panel, kv, settingsForm, badge: badgeOf, label, money, bytes, q, $, toLocalInput, fromLocalInput, today, state, stats, tabs, pager, list, form, confirm: confirmBox, download, act, dt, personOptions };
})();
