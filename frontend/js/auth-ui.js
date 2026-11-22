/* Shared helpers for the student login / create-account pages (presentation only):
   - injects the small icon set used by css/auth.css
   - wires every "show / hide password" button */
(function () {
  const icons = {
    "i-user": '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    "i-user-plus": '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0"/><path d="M19 8v6M16 11h6"/>',
    "i-id": '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M5.5 16c.5-1.7 1.9-2.5 3.5-2.5s3 .8 3.5 2.5M14 10h4M14 14h4"/>',
    "i-mail": '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
    "i-lock": '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    "i-eye": '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    "i-eye-off": '<path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.5 6.6C3.6 8.5 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 4.4-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    "i-login": '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M10 8l4 4-4 4M14 12H3"/>',
    "i-phone": '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
    "i-school": '<path d="M3 21h18M5 21V9l7-5 7 5v12"/><path d="M9 21v-6h6v6M9 11h.01M15 11h.01"/>',
    "i-book": '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 21V5M8 7h7"/>',
    "i-level": '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    "i-check": '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/>',
    "i-shield": '<path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
    "i-bus": '<rect x="4" y="3" width="16" height="15" rx="3"/><path d="M4 11h16M8 18v2.5M16 18v2.5M9 7h6"/><path d="M8.5 14.5h.01M15.5 14.5h.01" stroke-width="2.4"/>',
    "i-bolt": '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
    "i-alert": '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5M12 16h.01"/>',
    "i-arrow-left": '<path d="M19 12H5M11 6l-6 6 6 6"/>'
  };
  const svg = '<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>' +
    Object.keys(icons).map((id) => `<symbol id="${id}" viewBox="0 0 24 24">${icons[id]}</symbol>`).join("") +
    "</defs></svg>";
  document.body.insertAdjacentHTML("afterbegin", svg);

  document.querySelectorAll("[data-toggle-password]").forEach((btn) => {
    const input = btn.closest(".input").querySelector("input");
    btn.addEventListener("click", () => {
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.setAttribute("aria-pressed", String(show));
      btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
      btn.querySelector("use").setAttribute("href", show ? "#i-eye-off" : "#i-eye");
    });
  });
})();
