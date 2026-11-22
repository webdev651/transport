/* Camera capture component for document uploads.
   Provides a mobile-friendly camera interface with preview, capture, retake, and confirm. */
(function () {
  const DP_CAMERA_ICONS = {
    camera: "M5 17h14M4 6h16v11H4zM7 20v-3M17 20v-3M4 11h16",
    close: "M18 6L6 18M6 6l12 12",
    check: "M5 12.5l4.5 4.5L19 7.5",
    retry: "M4 4v5h5M4 4l7.07 7.07M19.66 4.34a10 10 0 1 1-14.32 14.32",
    switch: "M17 19.5V11a6 6 0 0 0-12 0v8.5M22 19H4",
    loading: "M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"
  };

  function dpIcon(name) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${DP_CAMERA_ICONS[name] || DP_CAMERA_ICONS.camera}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }

  /* Mount a camera capture UI into the given container element.
     Returns an object with:
       - open(): Promise<File|null> opens the camera and returns a File or null if cancelled
       - close(): void closes the camera and cleans up */
  function createCameraCapture() {
    let stream = null;
    let facing = "environment";
    let mounted = false;
    let container = null;
    let resolveCapture = null;
    let rejectCapture = null;

    function buildUI() {
      return `
        <div class="dp-camera-modal" id="dpCameraModal">
          <div class="dp-camera-header">
            <h3>Take Photo</h3>
            <button type="button" class="dp-camera-close" aria-label="Close camera">${dpIcon("close")}</button>
          </div>
          <div class="dp-camera-body">
            <div class="dp-camera-preview" id="dpCameraPreview">
              <video id="dpCameraVideo" playsinline muted autoplay></video>
              <div class="dp-camera-overlay" id="dpCameraOverlay" hidden>
                <div class="dp-camera-frame"></div>
              </div>
              <div class="dp-camera-loading" id="dpCameraLoading">
                <svg class="dp-spin" viewBox="0 0 24 24">${dpIcon("loading")}</svg>
                <span>Starting camera…</span>
              </div>
              <div class="dp-camera-error" id="dpCameraError" hidden>
                <svg>${dpIcon("camera")}</svg>
                <p id="dpCameraErrorMsg"></p>
                <button type="button" class="dp-camera-retry" id="dpCameraRetry">${dpIcon("retry")} Try Again</button>
              </div>
            </div>
            <div class="dp-camera-captured" id="dpCameraCaptured" hidden>
              <canvas id="dpCameraCanvas"></canvas>
              <div class="dp-captured-actions">
                <button type="button" class="dp-camera-retake" id="dpCameraRetake">${dpIcon("retry")} Retake</button>
                <button type="button" class="dp-camera-confirm primary" id="dpCameraConfirm">${dpIcon("check")} Use Photo</button>
              </div>
            </div>
          </div>
          <div class="dp-camera-footer">
            <button type="button" class="dp-camera-switch" id="dpCameraSwitch" hidden>${dpIcon("switch")} Switch Camera</button>
            <button type="button" class="dp-camera-cancel" id="dpCameraCancel">Cancel</button>
          </div>
        </div>
      `;
    }

    function getOrCreateContainer() {
      if (!container) {
        container = document.createElement("div");
        container.id = "dpCameraContainer";
        container.style.display = "none";
        document.body.appendChild(container);
      }
      return container;
    }

    function mount() {
      if (mounted) return;
      const c = getOrCreateContainer();
      c.innerHTML = buildUI();
      mounted = true;
    }

    function getElements() {
      const c = getOrCreateContainer();
      return {
        modal: c.querySelector("#dpCameraModal"),
        video: c.querySelector("#dpCameraVideo"),
        preview: c.querySelector("#dpCameraPreview"),
        overlay: c.querySelector("#dpCameraOverlay"),
        loading: c.querySelector("#dpCameraLoading"),
        error: c.querySelector("#dpCameraError"),
        errorMsg: c.querySelector("#dpCameraErrorMsg"),
        retry: c.querySelector("#dpCameraRetry"),
        captured: c.querySelector("#dpCameraCaptured"),
        canvas: c.querySelector("#dpCameraCanvas"),
        retake: c.querySelector("#dpCameraRetake"),
        confirm: c.querySelector("#dpCameraConfirm"),
        switch: c.querySelector("#dpCameraSwitch"),
        cancel: c.querySelector("#dpCameraCancel"),
        close: c.querySelector("#dp-camera-close"),
      };
    }

    async function startCamera() {
      const el = getElements();
      el.loading.hidden = false;
      el.error.hidden = true;
      el.preview.hidden = false;
      el.captured.hidden = true;

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showError("This browser doesn't support camera access. Use file upload instead.");
        return false;
      }

      if (stream) {
        stream.getTracks().forEach(t => t.stop());
        stream = null;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facing },
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 }
          },
          audio: false
        });

        el.video.srcObject = stream;

        const playVideo = async () => {
          try {
            await el.video.play();
            return true;
          } catch (e) {
            return false;
          }
        };

        const played = await playVideo();
        if (!played) {
          el.video.play().then().catch(() => {});
        }
        // Wait for video to get dimensions (autoplay policy fix)
        await new Promise(r => setTimeout(r, 200));
        if (el.video.videoWidth === 0) {
          el.video.play().then().catch(() => {});
        }

        // Check if video has loaded metadata
        await new Promise((resolve, reject) => {
          const onLoaded = () => {
            el.video.removeEventListener("loadedmetadata", onLoaded);
            el.video.removeEventListener("error", onError);
            resolve();
          };
          const onError = (e) => {
            el.video.removeEventListener("loadedmetadata", onLoaded);
            el.video.removeEventListener("error", onError);
            reject(e);
          };
          if (el.video.readyState >= 1) {
            resolve();
          } else {
            el.video.addEventListener("loadedmetadata", onLoaded, { once: true });
            el.video.addEventListener("error", onError, { once: true });
            setTimeout(() => reject(new Error("Video load timeout")), 10000);
          }
        });

        // Check if we have multiple cameras for switch button
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoDevices = devices.filter(d => d.kind === "videoinput");
          el.switch.hidden = videoDevices.length <= 1;
        } catch (e) {
          el.switch.hidden = true;
        }

        el.loading.hidden = true;
        el.overlay.hidden = false;
        return true;
      } catch (e) {
        stream = null;
        let msg = "Could not start camera.";
        if (e.name === "NotAllowedError" || e.name === "SecurityError") {
          msg = "Camera permission was blocked. Please allow camera access in browser settings.";
        } else if (e.name === "NotFoundError") {
          msg = "No camera found on this device.";
        } else if (e.name === "NotReadableError") {
          msg = "Camera is in use by another application.";
        } else if (e.name === "OverconstrainedError") {
          msg = "Camera doesn't meet requirements. Trying fallback…";
          // Try with simpler constraints
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: { ideal: facing } },
              audio: false
            });
            el.video.srcObject = stream;
            await el.video.play();
            el.loading.hidden = true;
            el.overlay.hidden = false;
            return true;
          } catch (e2) {
            msg = "Could not access camera with current settings.";
          }
        } else {
          msg += " " + (e.message || e.name);
        }
        showError(msg);
        return false;
      }
    }

    function showError(msg) {
      const el = getElements();
      el.loading.hidden = true;
      el.preview.hidden = true;
      el.error.hidden = false;
      el.errorMsg.textContent = msg;
    }

    function stopCamera() {
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
        stream = null;
      }
      const el = getElements();
      el.video.srcObject = null;
    }

    function capturePhoto() {
      const el = getElements();
      if (!stream || el.video.readyState < 2) return null;

      const video = el.video;
      const canvas = el.canvas;
      const ctx = canvas.getContext("2d");

      // Match canvas to video dimensions
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      // Draw video frame to canvas
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Convert to blob
      return new Promise(resolve => {
        canvas.toBlob(blob => {
          resolve(blob);
        }, "image/jpeg", 0.9);
      });
    }

    async function open() {
      mount();
      const el = getElements();

      // Show modal
      document.body.style.overflow = "hidden";
      el.modal.showModal();

      // Start camera
      const started = await startCamera();
      if (!started) {
        return new Promise(resolve => {
          // Wait for user to click retry or cancel
          const onRetry = async () => {
            el.retry.removeEventListener("click", onRetry);
            const started2 = await startCamera();
            if (started2) {
              setupEvents();
              resolve(capturePromise());
            }
          };
          el.retry.addEventListener("click", onRetry);
          const onCancel = () => {
            el.cancel.removeEventListener("click", onCancel);
            close();
            resolve(null);
          };
          el.cancel.addEventListener("click", onCancel);
          el.close.addEventListener("click", onCancel);
        });
      }

      return capturePromise();

      function capturePromise() {
        return new Promise((resolve, reject) => {
          resolveCapture = resolve;
          rejectCapture = reject;
          setupEvents();
        });
      }

      function setupEvents() {
        const el = getElements();

        // Capture photo
        const onVideoClick = async () => {
          if (el.captured.hidden) {
            const blob = await capturePhoto();
            if (blob) {
              const url = URL.createObjectURL(blob);
              el.canvas.style.display = "block";
              el.preview.hidden = true;
              el.captured.hidden = false;
              el.switch.hidden = true;
            }
          }
        };
        el.video.addEventListener("click", onVideoClick);
        el.overlay.addEventListener("click", onVideoClick);

        // Retake
        const onRetake = () => {
          URL.revokeObjectURL(el.canvas.toDataURL());
          el.captured.hidden = true;
          el.preview.hidden = false;
          el.switch.hidden = false;
        };
        el.retake.addEventListener("click", onRetake);

        // Confirm
        const onConfirm = async () => {
          el.confirm.disabled = true;
          el.confirm.innerHTML = '<span class="dp-spin"></span> Processing…';

          // Convert canvas to file
          const blob = await new Promise(r => el.canvas.toBlob(r, "image/jpeg", 0.9));
          const file = new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" });

          cleanup();
          resolveCapture(file);
        };
        el.confirm.addEventListener("click", onConfirm);

        // Switch camera
        const onSwitch = async () => {
          facing = facing === "environment" ? "user" : "environment";
          await startCamera();
        };
        el.switch.addEventListener("click", onSwitch);

        // Cancel/Close
        const onCancel = () => {
          cleanup();
          resolveCapture(null);
        };
        el.cancel.addEventListener("click", onCancel);
        el.close.addEventListener("click", onCancel);
        el.modal.addEventListener("close", onCancel);

        function cleanup() {
          document.body.style.overflow = "";
          el.modal.close();
          stopCamera();
          URL.revokeObjectURL(el.canvas.toDataURL());

          el.video.removeEventListener("click", onVideoClick);
          el.overlay.removeEventListener("click", onVideoClick);
          el.retake.removeEventListener("click", onRetake);
          el.confirm.removeEventListener("click", onConfirm);
          el.switch.removeEventListener("click", onSwitch);
          el.cancel.removeEventListener("click", onCancel);
          el.close.removeEventListener("click", onCancel);
          el.modal.removeEventListener("close", onCancel);

          resolveCapture = null;
          rejectCapture = null;
        }
      }
    }

    function close() {
      const el = getElements();
      if (el.modal.open) {
        el.modal.close();
      }
      stopCamera();
      document.body.style.overflow = "";
    }

    return { open, close };
  }

  // Export as global
  window.TPCameraCapture = { create: createCameraCapture };
})();