/* Offline transaction queue for drivers (loaded after js/app.js).
   A check that cannot reach the server is stored on this device with a client-generated id, shown as Pending, and uploaded to
   /api/scanner/sync when a connection returns. The same id is sent again on every retry, so the server can never record it twice.
   The raw QR payload is removed as soon as the server accepts the item; Pending/Failed items are never discarded automatically. */
(function () {
  const KEY = "transitpass.offlineQueue.v1";
  const BATCH = 50;
  const DEDUPE_MS = 30 * 1000;                     // an accidental repeated save of the same code
  const KEEP_SYNCED_MS = 24 * 60 * 60 * 1000;      // how long Synchronized items stay visible
  const MAX_SYNCED = 25;
  const MAX_ROWS = 30;

  const state = { driverId: null, flushing: false, started: false, timer: 0, panelEl: null, onSynced: null, onChange: null };

  const nowIso = () => new Date().toISOString();
  const driverKey = () => (state.driverId == null ? null : String(state.driverId));

  function newClientId() {
    try { if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID(); } catch (e) { /* older browsers */ }
    try {
      const b = new Uint8Array(16);
      window.crypto.getRandomValues(b);
      return "off-" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
    } catch (e) {
      return "off-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);
    }
  }

  function storageError() {
    return new Error("This device could not store the offline check. Free some browser storage and try again.");
  }

  function readAll() {
    let raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { throw storageError(); }
    if (!raw) return [];
    try {
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) throw new Error("bad shape");
      return arr.filter((r) => r && typeof r.clientId === "string" && (r.method === "qr" || r.method === "manual") &&
        typeof r.scannedAt === "string" && ["pending", "synced", "failed"].includes(r.status) && r.driverId != null);
    } catch (e) {
      try { localStorage.setItem(KEY + ".unreadable." + Date.now(), raw); } catch (e2) { /* nothing else we can do */ }
      return [];
    }
  }

  /** Trims only finished rows. Pending and Failed checks are always kept so a sync error can never lose a transaction. */
  function prune(items) {
    const cutoff = Date.now() - KEEP_SYNCED_MS;
    let synced = items.filter((r) => r.status === "synced" && Date.parse(r.syncedAt || r.createdAt || 0) < cutoff);
    const drop = new Set(synced.map((r) => r.clientId));
    let kept = items.filter((r) => !drop.has(r.clientId));
    const done = kept.filter((r) => r.status === "synced").sort((a, b) => Date.parse(b.syncedAt || 0) - Date.parse(a.syncedAt || 0));
    if (done.length > MAX_SYNCED) {
      const extra = new Set(done.slice(MAX_SYNCED).map((r) => r.clientId));
      kept = kept.filter((r) => !extra.has(r.clientId));
    }
    return kept;
  }

  function save(items) {
    const clean = prune(items);
    try { localStorage.setItem(KEY, JSON.stringify(clean)); } catch (e) { throw storageError(); }
    emit();
    return clean;
  }

  function forDriver(items) {
    const k = driverKey();
    return items.filter((r) => String(r.driverId) === k);
  }

  function list() {
    return forDriver(readAll()).slice().sort((a, b) => Date.parse(b.createdAt || b.scannedAt) - Date.parse(a.createdAt || a.scannedAt));
  }

  function summary() {
    const items = list();
    return {
      total: items.length,
      pending: items.filter((r) => r.status === "pending").length,
      synced: items.filter((r) => r.status === "synced").length,
      failed: items.filter((r) => r.status === "failed").length,
      flushing: state.flushing,
      online: typeof navigator === "undefined" ? true : navigator.onLine !== false
    };
  }

  function messageOf(e) {
    if (typeof errText === "function") return errText(e);
    return (e && e.message) || "Could not reach the server.";
  }

  function emit() {
    if (!state.driverId) return;
    if (typeof state.onChange === "function") { try { state.onChange(summary()); } catch (e) { /* a UI callback must not break storage */ } }
    try { window.dispatchEvent(new CustomEvent("tp-offline-change", { detail: summary() })); } catch (e) { /* no CustomEvent */ }
    renderPanel(state.panelEl);
  }

  /** Stores one check on this device. The QR payload is only kept until the server has accepted the item. */
  async function add({ method, value, scannedAt } = {}) {
    if (!state.driverId) throw new Error("Sign in again before recording an offline check.");
    const m = method === "manual" ? "manual" : "qr";
    const v = String(value == null ? "" : value).trim();
    if (!v) throw new Error("Nothing to save offline.");
    const items = readAll();
    const stamp = Date.now();
    const duplicate = forDriver(items).find((r) => r.status !== "synced" && r.method === m && r.value === v && stamp - Date.parse(r.scannedAt) <= DEDUPE_MS);
    if (duplicate) return { duplicate: true, item: duplicate };
    const when = scannedAt ? new Date(scannedAt) : new Date();
    const item = {
      clientId: newClientId(), driverId: driverKey(), method: m, value: v,
      scannedAt: (Number.isNaN(when.getTime()) ? new Date() : when).toISOString(),
      status: "pending", attempts: 0, lastError: null, createdAt: nowIso(),
      resultCode: null, resultLabel: null, reference: null, serverId: null, syncedAt: null, duplicate: false
    };
    items.push(item);
    save(items);
    return { duplicate: false, item };
  }

  /** Uploads this driver's Pending items. Any error leaves them Pending (never deleted); per-item rejections become Failed. */
  async function flush() {
    if (!state.driverId || state.flushing) return { skipped: true };
    if (typeof navigator !== "undefined" && navigator.onLine === false) { emit(); return { offline: true, synced: 0, failed: 0 }; }
    const pending = list().filter((r) => r.status === "pending");
    if (!pending.length) { emit(); return { synced: 0, failed: 0 }; }
    state.flushing = true; emit();
    let synced = 0, failed = 0, offline = false, error = null;
    try {
      const batch = pending.slice(0, BATCH);
      const res = await api("/scanner/sync", {
        method: "POST",
        body: { items: batch.map((r) => ({ clientId: r.clientId, method: r.method, value: r.value, scannedAt: r.scannedAt })) }
      });
      const byId = new Map(((res && res.results) || []).map((r) => [r.clientId, r]));
      const items = readAll();
      for (const item of items) {
        if (String(item.driverId) !== driverKey()) continue;
        const r = byId.get(item.clientId);
        if (!r) continue;
        item.attempts = (item.attempts || 0) + 1;
        if (r.ok) {
          item.status = "synced";
          item.lastError = null;
          item.syncedAt = nowIso();
          item.resultCode = r.code || null;
          item.resultLabel = r.label || null;
          item.reference = r.reference || null;
          item.serverId = r.scanId == null ? null : r.scanId;
          item.duplicate = !!r.duplicate;
          if (item.method === "manual") item.preview = item.value;
          else { item.preview = "QR scan"; item.value = ""; }   // the passenger's QR credential does not need to stay on the device
          synced += 1;
        } else {
          item.status = "failed";
          item.lastError = r.error || "The server could not save this check.";
          failed += 1;
        }
      }
      save(items);
    } catch (e) {
      // Authentication / network / server failure: keep every item exactly where it was, remember why, and try again later.
      const batchIds = new Set(pending.map((r) => r.clientId));
      const items = readAll();
      for (const item of items) {
        if (String(item.driverId) !== driverKey() || !batchIds.has(item.clientId)) continue;
        item.attempts = (item.attempts || 0) + 1;
        item.lastError = messageOf(e);
      }
      try { localStorage.setItem(KEY, JSON.stringify(prune(items))); } catch (e2) { /* original copy is still in storage */ }
      offline = !e || e.status === 0 || e.status === undefined;
      error = messageOf(e);
      emit();
    } finally {
      state.flushing = false;
    }
    emit();
    if (synced && typeof state.onSynced === "function") { try { state.onSynced(synced); } catch (e) { /* page refresh is not critical */ } }
    if (!offline && pending.length > BATCH) setTimeout(() => { flush(); }, 60);
    return { synced, failed, offline, error };
  }

  async function retry(clientId) {
    const items = readAll();
    const item = items.find((r) => r.clientId === clientId && String(r.driverId) === driverKey());
    if (!item) return { skipped: true };
    item.status = "pending";
    item.lastError = null;
    save(items);
    return flush();
  }

  function remove(clientId) {
    const items = readAll().filter((r) => !(r.clientId === clientId && String(r.driverId) === driverKey()));
    save(items);
  }

  function clearSynced() {
    const items = readAll().filter((r) => !(String(r.driverId) === driverKey() && r.status === "synced"));
    save(items);
  }

  function describe(item) {
    if (item.method === "manual") return "Manual School ID · " + (item.value || item.preview || "");
    return "QR code";
  }

  function statusLine(item, s) {
    if (item.status === "synced") {
      const detail = item.reference ? "Transaction " + item.reference : item.resultLabel || "Recorded";
      return `<p class="off-detail">${esc(detail)}${item.duplicate ? " · already on the server" : ""}${item.resultLabel && item.reference ? " · " + esc(item.resultLabel) : ""}</p>`;
    }
    if (item.status === "failed") return `<p class="off-detail bad">${esc(item.lastError || "Synchronization failed.")}</p>`;
    if (s.flushing) return `<p class="off-detail">Sending to the server…</p>`;
    if (item.lastError) return `<p class="off-detail muted">Waiting to retry: ${esc(item.lastError)}</p>`;
    return `<p class="off-detail muted">Waiting for an internet connection.</p>`;
  }

  function row(item, s) {
    const chip = item.status === "synced" ? "ok" : item.status === "failed" ? "bad" : "warn";
    const label = item.status === "synced" ? "Synchronized" : item.status === "failed" ? "Failed" : s.flushing ? "Synchronizing…" : "Pending";
    const actions = item.status === "failed"
      ? `<button type="button" data-off-retry="${esc(item.clientId)}">Retry</button><button type="button" data-off-remove="${esc(item.clientId)}">Remove</button>`
      : item.status === "synced" ? `<button type="button" data-off-remove="${esc(item.clientId)}">Dismiss</button>` : "";
    return `<div class="off-row">
      <div class="off-main">
        <p class="off-title">${esc(describe(item))}</p>
        <p class="off-detail muted">Recorded ${esc(fmtDateTime(item.scannedAt))}${item.attempts ? " · " + item.attempts + " attempt" + (item.attempts === 1 ? "" : "s") : ""}</p>
        ${statusLine(item, s)}
      </div>
      <div class="off-side"><span class="dp-st ${chip}">${esc(label)}</span>${actions ? `<div class="off-actions">${actions}</div>` : ""}</div>
    </div>`;
  }

  function wire(panel) {
    if (!panel || panel.dataset.offWired) return;
    panel.dataset.offWired = "1";
    panel.addEventListener("click", (e) => {
      const sync = e.target.closest("[data-off-sync]");
      const retryBtn = e.target.closest("[data-off-retry]");
      const removeBtn = e.target.closest("[data-off-remove]");
      const clear = e.target.closest("[data-off-clear]");
      if (sync) flush();
      else if (retryBtn) retry(retryBtn.getAttribute("data-off-retry"));
      else if (removeBtn) remove(removeBtn.getAttribute("data-off-remove"));
      else if (clear) clearSynced();
    });
  }

  /** Draws the Pending / Synchronized / Failed card. The element stays hidden while this driver has no offline rows. */
  function renderPanel(el) {
    if (el) state.panelEl = el;
    const panel = state.panelEl;
    if (!panel || !state.driverId) return;
    wire(panel);
    const s = summary(), items = list();
    if (!items.length) { panel.hidden = true; panel.innerHTML = ""; return; }
    panel.hidden = false;
    const offline = s.online === false;
    panel.innerHTML = `<article class="card dp-in">
      <div class="dp-head"><div><h2>Offline transactions</h2><p class="sub">${s.pending} pending · ${s.synced} synchronized · ${s.failed} failed</p></div>
        <div class="off-actions">
          ${s.pending ? `<button type="button" class="primary" data-off-sync ${s.flushing || offline ? "disabled" : ""}>${s.flushing ? "Synchronizing…" : "Sync now"}</button>` : ""}
          ${s.synced ? `<button type="button" data-off-clear>Clear synchronized</button>` : ""}
        </div>
      </div>
      ${offline ? `<p class="off-note">You are offline. Every check is stored on this device and sent automatically when the connection returns.</p>` : ""}
      <div class="off-list">${items.slice(0, MAX_ROWS).map((i) => row(i, s)).join("")}</div>
      ${items.length > MAX_ROWS ? `<p class="off-detail muted">${items.length - MAX_ROWS} older check(s) are also waiting.</p>` : ""}
    </article>`;
  }

  /** Wires the panel buttons once, restores the queue, and starts automatic synchronization. */
  function start(opts = {}) {
    if (opts.driverId != null) state.driverId = opts.driverId;
    if (typeof opts.onSynced === "function") state.onSynced = opts.onSynced;
    if (typeof opts.onChange === "function") state.onChange = opts.onChange;
    if (!state.started) {
      state.started = true;
      window.addEventListener("online", () => { emit(); flush(); });
      window.addEventListener("offline", emit);
      if (typeof document !== "undefined") document.addEventListener("visibilitychange", () => { if (!document.hidden) flush(); });
      state.timer = setInterval(() => { if (typeof document === "undefined" || !document.hidden) flush(); }, 20000);
    }
    const panel = state.panelEl;
    if (panel) wire(panel);
    emit();
    setTimeout(() => { flush(); }, 0);
    return summary();
  }

  window.TPOffline = { start, add, flush, retry, remove, clearSynced, list, summary, renderPanel };
})();
