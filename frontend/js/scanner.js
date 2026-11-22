/* Integrated passenger scanner, shared by the driver dashboard and the admin "Verify Pass" page.
   TPScanner.mount(el, { onResult }) draws the camera + manual-ID card into `el`.
   Camera: BarcodeDetector where the browser has it, otherwise the bundled jsQR decoder, so it works on
   phones, tablets and desktop webcams (Chrome, Edge, Safari, Firefox). Every decoded value is sent to the
   backend (/api/scanner/scan); the screen only ever shows what the server decided. */
(function () {
  const RESULT_STYLE = {
    VERIFIED_STUDENT: "valid", FLAGGED_REVIEW: "review", PENDING_VERIFICATION: "review",
    INVALID_QR: "invalid", REVOKED_QR: "invalid", EXPIRED_QR: "invalid", REJECTED_STUDENT: "invalid"
  };
  const HELP = {
    VERIFIED_STUDENT: "Let the passenger board and apply the student fare.",
    PENDING_VERIFICATION: "This student's verification is not complete. Charge the regular fare.",
    INVALID_QR: "This QR code is not recognised. Charge the regular fare.",
    REVOKED_QR: "This QR code was deactivated. Charge the regular fare.",
    EXPIRED_QR: "This QR code has expired. Charge the regular fare.",
    REJECTED_STUDENT: "This student's verification was rejected. Charge the regular fare.",
    FLAGGED_REVIEW: "Pass flagged for review. Charge the regular fare."
  };

  function loadJsQr() {
    if (window.jsQR) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "js/jsQR.js"; s.onload = resolve; s.onerror = () => reject(new Error("Could not load the QR decoder"));
      document.head.appendChild(s);
    });
  }

  function mount(root, { onResult } = {}) {
    root.innerHTML = `
      <article class="card">
        <div class="section-title"><h2 style="font-size:1.05rem">Scan passenger</h2><span class="label-caps muted" id="scStatus">camera off</span></div>
        <ol class="muted" style="font-size:.82rem;margin:0 0 1rem;padding-left:1.1rem;line-height:1.6">
          <li>Tap <strong>Scan passenger</strong> and allow camera access.</li>
          <li>Hold the passenger's QR code inside the square, about 15–25 cm from the camera.</li>
          <li>The result appears here straight away. No camera? Use the School ID box below.</li>
        </ol>
        <div class="camera-frame" id="scFrame" hidden><video id="scVideo" playsinline muted></video><div class="camera-reticle"></div></div>
        <canvas id="scCanvas" hidden></canvas>
        <p class="muted" id="scMsg" style="font-size:.8rem;min-height:1.1rem;margin:.6rem 0 0;text-align:center"></p>
        <div class="row" style="justify-content:center;margin-top:.5rem">
          <button class="primary" id="scStart">Scan passenger</button>
          <button id="scStop" hidden>Stop camera</button>
          <button id="scFlip" hidden>Switch camera</button>
        </div>
        <form id="scManual" style="margin-top:1.25rem">
          <label class="label-caps muted" for="scId" style="display:block;margin-bottom:.4rem">Manual School ID lookup</label>
          <div class="row" style="flex-wrap:nowrap">
            <input id="scId" placeholder="e.g. 2026-0418" autocomplete="off" maxlength="40" style="flex:1;min-width:0">
            <button type="submit">Check ID</button>
          </div>
        </form>
      </article>
      <article class="card" id="scResultCard" hidden></article>`;

    const $ = (id) => root.querySelector("#" + id);
    const video = $("scVideo"), canvas = $("scCanvas"), ctx = canvas.getContext("2d", { willReadFrequently: true });
    let stream = null, rafId = 0, facing = "environment", busy = false, lastValue = "", lastAt = 0, detector = null;

    const setStatus = (t) => { $("scStatus").textContent = t; };
    const setMsg = (t, bad) => { const m = $("scMsg"); m.textContent = t; m.style.color = bad ? "var(--destructive)" : ""; };

    // Only a signed-in driver may store checks on the device; the administrator's Verify Pass page always needs the server.
    const canQueueOffline = () => {
      if (!window.TPOffline || typeof TPOffline.add !== "function") return false;
      try { return typeof staffUser !== "undefined" && !!staffUser && staffUser.role === "driver"; } catch (e) { return false; }
    };

    function showOfflineResult(saved, item) {
      const card = $("scResultCard");
      const rec = saved.item;
      card.hidden = false;
      card.innerHTML = `<div class="scan-result state-review" role="status" aria-live="assertive" style="margin:0">
          <p class="label-caps muted" style="margin:0 0 .35rem">Verification result</p>
          <p style="margin:0;font-family:var(--font-display);font-size:1.35rem;font-weight:700;color:var(--warning)">${saved.duplicate ? "ALREADY SAVED OFFLINE" : "SAVED OFFLINE"}</p>
          <p style="margin:.7rem 0 0;font-weight:600;font-size:.95rem">${item.method === "manual" ? "School ID " + esc(item.value) : "QR code"}</p>
          <p class="mono muted" style="margin:.15rem 0 0;font-size:.78rem">Recorded ${esc(new Date(rec.scannedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }))}</p>
          <p class="muted" style="margin:.7rem 0 0;font-size:.85rem">No internet connection. This check is stored safely on this device and will be verified and synchronized automatically when the connection returns.</p>
          <p class="muted" style="margin:.4rem 0 0;font-size:.82rem">Do not scan this passenger again — it is already saved. You can see every offline check under <strong>Offline transactions</strong>.</p>
          <p class="mono" style="margin:.7rem 0 0;font-size:.8rem;color:var(--warning)">Pending synchronization</p>
        </div>`;
      card.scrollIntoView({ block: "nearest", behavior: "smooth" });
      if (navigator.vibrate) navigator.vibrate([40, 40, 40]);
    }

    async function saveOffline(item) {
      try {
        showOfflineResult(await TPOffline.add(item), item);
      } catch (e) {
        setMsg(errText(e), true);
      }
    }

    function showResult(r) {
      const style = RESULT_STYLE[r.code] || "invalid";
      const card = $("scResultCard");
      const st = r.student;
      card.hidden = false;
      card.innerHTML = `<div class="scan-result state-${style}" role="status" aria-live="assertive" style="margin:0">
          <p class="label-caps muted" style="margin:0 0 .35rem">Verification result</p>
          <p style="margin:0;font-family:var(--font-display);font-size:1.35rem;font-weight:700;color:var(--${style === "valid" ? "success" : style === "review" ? "warning" : "destructive"})">${esc(r.label)}</p>
          ${st ? `<p style="margin:.7rem 0 0;font-weight:600;font-size:1.05rem">${esc(st.name)}</p>
            <p class="mono muted" style="margin:.15rem 0 0;font-size:.78rem">${esc(st.schoolId)}</p>
            <p class="muted" style="margin:.3rem 0 0;font-size:.82rem">${esc(st.school)}<br>${esc(st.program)} · ${esc(st.level)}</p>` : ""}
          ${r.reason ? `<p style="margin:.7rem 0 0;font-size:.85rem">${esc(r.reason)}</p>` : ""}
          <p class="muted" style="margin:.7rem 0 0;font-size:.82rem">${esc(HELP[r.code] || "")}</p>
          ${st ? `<p class="mono" style="margin:.7rem 0 0;font-size:.8rem">${esc(r.discountStatus)} · fare ${esc(r.fare)}</p>` : ""}
        </div>`;
      card.scrollIntoView({ block: "nearest", behavior: "smooth" });
      if (navigator.vibrate) navigator.vibrate(r.ok ? 60 : [80, 60, 80]);
      if (onResult) onResult(r);
    }

    async function submit(path, body, offlineItem) {
      if (busy) return;
      busy = true;
      try {
        if (offlineItem && canQueueOffline() && navigator.onLine === false) { await saveOffline(offlineItem); return; }
        showResult(await api(path, { method: "POST", body }));
      } catch (e) {
        // A network failure (status 0) must not throw the passenger's check away: record it on the device instead.
        if (e && e.status === 0 && offlineItem && canQueueOffline()) await saveOffline(offlineItem);
        else setMsg(errText(e), true);
      } finally { busy = false; }
    }

    async function decodeFrame() {
      if (!stream) return;
      rafId = requestAnimationFrame(decodeFrame);
      if (busy || video.readyState < 2 || !video.videoWidth) return;
      let value = null;
      try {
        if (detector) {
          const found = await detector.detect(video);
          if (found.length) value = found[0].rawValue;
        } else {
          const w = Math.min(video.videoWidth, 640), h = Math.round(video.videoHeight * (w / video.videoWidth));
          canvas.width = w; canvas.height = h;
          ctx.drawImage(video, 0, 0, w, h);
          const hit = window.jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" });
          if (hit) value = hit.data;
        }
      } catch (e) { /* a bad frame is not an error */ }
      // The same code held in front of the camera is read once, not once per frame.
      if (value && (value !== lastValue || Date.now() - lastAt > 4000)) {
        lastValue = value; lastAt = Date.now();
        setMsg("Checking…");
        await submit("/scanner/scan", { code: value }, { method: "qr", value });
        setMsg("Ready for the next passenger.");
      }
    }

    async function start() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setMsg("This browser can't open the camera here (it needs https or localhost). Use the School ID box instead.", true); return;
      }
      stop();
      try {
        setMsg("Requesting camera permission…");
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1280 } }, audio: false });
        video.srcObject = stream;
        const playVideo = async () => {
          try {
            await video.play();
            return true;
          } catch (e) {
            return false;
          }
        };
        const played = await playVideo();
        if (!played) {
          video.play().then().catch(() => {});
        }
        // Wait for video to get dimensions (autoplay policy fix)
        await new Promise(r => setTimeout(r, 200));
        if (video.videoWidth === 0) {
          video.play().then().catch(() => {});
        }

        if ("BarcodeDetector" in window) { try { detector = new window.BarcodeDetector({ formats: ["qr_code"] }); } catch (e) { detector = null; } }
        if (!detector) await loadJsQr();
        $("scFrame").hidden = false; $("scStop").hidden = false; $("scStart").hidden = true;
        $("scFlip").hidden = !((await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput").length > 1);
        setStatus("scanning"); setMsg("Point the camera at a student's QR code.");
        decodeFrame();
      } catch (e) {
        stop();
        const denied = e && (e.name === "NotAllowedError" || e.name === "SecurityError");
        setMsg(denied ? "Camera permission was blocked. Allow camera access in your browser settings, or use the School ID box."
          : e && e.name === "NotFoundError" ? "No camera was found on this device. Use the School ID box." : "Could not start the camera: " + errText(e), true);
      }
    }

    function stop() {
      cancelAnimationFrame(rafId);
      if (stream) stream.getTracks().forEach((t) => t.stop());
      stream = null; video.srcObject = null;
      $("scFrame").hidden = true; $("scStop").hidden = true; $("scFlip").hidden = true; $("scStart").hidden = false;
      setStatus("camera off");
    }

    $("scStart").onclick = start;
    $("scStop").onclick = () => { stop(); setMsg(""); };
    $("scFlip").onclick = () => { facing = facing === "environment" ? "user" : "environment"; start(); };
    $("scManual").addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = $("scId").value.trim();
      if (!id) { setMsg("Enter a School ID.", true); return; }
      setMsg("Checking…");
      await submit("/scanner/lookup", { schoolId: id }, { method: "manual", value: id });
      setMsg("");
      $("scId").select();
    });
    document.addEventListener("visibilitychange", () => { if (document.hidden && stream) stop(); });
    window.addEventListener("pagehide", stop);
    return { start, stop };
  }

  window.TPScanner = { mount };
})();
