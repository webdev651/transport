/* Shared dashboard shell (presentation only): adds the top bar, sidebar icons and collapse to every staff/student page. */
(function () {
  const PATHS = { "admin-vehicles.html":"M5 17h14M4 6h16v11H4zM7 20v-3M17 20v-3M4 11h16","admin-routes.html":"M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4M18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4M8 17h6a4 4 0 0 0 0-8h-2","admin-trips.html":"M3 12h4l3-8 4 16 3-8h4","admin-devices.html":"M7 2h10v20H7zM11 18h2","admin-applications.html":"M6 3h9l4 4v14H6zM9 12h7M9 16h7","admin-driver-documents.html":"M4 5h16v14H4zM8 10a2 2 0 1 0 0 .1M13 10h4M13 14h4M6 17c.5-2 4-2 4 0","admin-refunds.html":"M4 12a8 8 0 1 0 3-6.2M4 4v5h5M12 8v8M9.5 10.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4","admin-suspicious.html":"M12 3l9 16H3zM12 10v4M12 17v.5","admin-announcements.html":"M3 11v3l12 5V6zM15 8c3 0 5 1.5 5 4s-2 4-5 4M7 14v5","admin-notifications.html":"M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4","admin-settings.html":"M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19 12l2-1-1.5-3-2.3.6-1.3-1.3.6-2.3L13.5 3 12 5h-2L8.5 3 6 4.5l.6 2.3L5.3 8.1 3 7.5 1.5 10.5 3.5 12l-2 1.5L3 16.5l2.3-.6 1.3 1.3-.6 2.3L8.5 21l1.5-2h2l1.5 2 2.5-1.5-.6-2.3 1.3-1.3 2.3.6L21 13.5z","admin-backups.html":"M4 7c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3M4 7v10c0 1.7 3.6 3 8 3s8-1.3 8-3V7M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3","admin-dashboard.html":"M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z","admin-verifications.html":"M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6zM8.5 12l2.5 2.5 4.5-5",
    "students.html":"M16 11a4 4 0 1 0-8 0M4 21a8 8 0 0 1 16 0","admin-qr-codes.html":"M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM20 14v7M14 20h3",
    "admin-drivers.html":"M5 17h14M4 6h16v11H4zM8 21v-4M16 21v-4M4 11h16","verify.html":"M4 12l5 5L20 6","admin-scan-history.html":"M12 7v5l3 2M3 12a9 9 0 1 0 3-6.7M3 4v5h5",
    "admin-reports.html":"M4 20V10M10 20V4M16 20v-7M22 20H2","admin-profile.html":"M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4 21a8 8 0 0 1 16 0","admin-activity-logs.html":"M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01","reports.html":"M4 20V10M10 20V4M16 20v-7M22 20H2","admin-account.html":"M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4 21a8 8 0 0 1 16 0","admin-fares.html":"M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6","admin-module.html?m=transactions":"M3 7h18M3 12h18M3 17h12","admin-transactions.html":"M3 7h18M3 12h18M3 17h12","admin-module.html?m=users":"M16 11a4 4 0 1 0-8 0M4 21a8 8 0 0 1 16 0M19 8v6M22 11h-6","admin-module.html?m=activity":"M3 12h4l3-8 4 16 3-8h4","admin-module.html?m=settings":"M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M14 4v4M8 10v4M16 16v4","#logout":"M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 8l4 4-4 4M14 12H3","driver-dashboard.html":"M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z","driver-transactions.html":"M3 7h18M3 12h18M3 17h12","driver-notifications.html":"M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4","driver-documents.html":"M4 5h16v14H4zM8 10a2 2 0 1 0 0 .1M13 10h4M13 14h4M6 17c.5-2 4-2 4 0","driver-history.html":"M12 7v5l3 2M3 12a9 9 0 1 0 3-6.7M3 4v5h5" };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]));
  function icons() {
    document.querySelectorAll(".nav a:not([data-i])").forEach((a) => {
      a.dataset.i = "1";
      const p = PATHS[a.getAttribute("href")] || "M5 12h14";
      a.innerHTML = `<svg viewBox="0 0 24 24"><path d="${p}"/></svg><span class="t">${esc(a.textContent)}</span>`;
    });
  }
  document.addEventListener("DOMContentLoaded", () => {
    const q0 = new URLSearchParams(location.search).get("q"), qi = document.getElementById("q");
    if (q0 && qi) setTimeout(() => { qi.value = q0; qi.dispatchEvent(new Event("input", { bubbles: true })); }, 400);
    const nav = document.querySelector(".nav"), main = document.querySelector("main");
    if (nav) { icons(); new MutationObserver(icons).observe(nav, { childList: true }); }
    if (!main || document.querySelector(".topbar")) return;
    const bar = document.createElement("header");
    bar.className = "topbar";
    bar.innerHTML = '<span class="spacer"></span><div class="profile"><button id="profBtn" aria-haspopup="true"><span class="avatar" id="av">·</span><span class="who"><span id="pName">…</span><small id="pRole"></small></span> ▾</button><div class="menu" id="profMenu"><a href="#" id="logout2">Log out</a></div></div>';
    main.prepend(bar);
    const toggle = document.getElementById("navToggle");           // reuse the existing button so the mobile drawer keeps working
    if (toggle) { toggle.className = "burger"; toggle.textContent = "☰"; bar.prepend(toggle); 
      // Only add desktop collapse behavior, mobile handling is done in initMobileNav
      toggle.addEventListener("click", (e) => { 
        if (innerWidth > 860) {
          e.stopPropagation();
          document.body.classList.toggle("collapsed"); 
        }
      }); 
    }
    const sync = () => {
      const w = (document.getElementById("adminWho") || document.getElementById("who")), r = document.getElementById("adminNode"), n = w && w.textContent.trim();
      if (!n || n === "…") return;
      document.getElementById("pName").textContent = n;
      document.getElementById("pRole").textContent = r ? r.textContent : (document.getElementById("who") ? "Student" : "");
      document.getElementById("av").textContent = n.split(" ").filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
    };
    const who = document.getElementById("adminWho") || document.getElementById("who");
    if (who) new MutationObserver(sync).observe(who, { childList: true, characterData: true, subtree: true });
    sync();
    document.getElementById("profBtn").onclick = (e) => { e.stopPropagation(); document.getElementById("profMenu").classList.toggle("open"); };
    document.addEventListener("click", () => document.getElementById("profMenu").classList.remove("open"));
    document.getElementById("logout2").onclick = (e) => { e.preventDefault(); const b = document.getElementById("logout"); if (b) b.click(); };
  });
})();
