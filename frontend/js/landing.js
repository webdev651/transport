/* TransitPass homepage behaviour: sticky header state, mobile menu, login menu,
   active-section highlight, scroll reveal and the existing "reset demo data" action. */
(function () {
  "use strict";

  var header = document.getElementById("siteHeader");
  var nav = document.getElementById("siteNav");
  var toggle = document.getElementById("menuToggle");
  var login = document.getElementById("login");
  var loginBtn = document.getElementById("loginBtn");
  var links = Array.prototype.slice.call(document.querySelectorAll(".nav-links a"));
  var desktop = window.matchMedia("(min-width: 960px)");

  /* ---- Sticky header shadow + "Contact" at the very bottom of the page ---- */
  var bar = document.createElement("div");
  bar.className = "scroll-progress";
  bar.setAttribute("aria-hidden", "true");
  header.appendChild(bar);

  function onScroll() {
    header.classList.toggle("is-scrolled", window.scrollY > 8);
    var max = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.transform = "scaleX(" + (max > 0 ? Math.min(1, window.scrollY / max) : 0) + ")";
    var atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
    if (atBottom) setActive("contact");
  }

  /* ---- Mobile menu ---- */
  function setMenu(open) {
    nav.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));
  }
  toggle.addEventListener("click", function () { setMenu(!nav.classList.contains("is-open")); });
  links.forEach(function (a) { a.addEventListener("click", function () { setMenu(false); }); });
  nav.querySelectorAll(".login-menu a").forEach(function (a) { a.addEventListener("click", function () { setMenu(false); }); });

  /* ---- Login menu (desktop popover; always expanded inside the mobile menu) ---- */
  function setLogin(open) {
    login.classList.toggle("is-open", open);
    loginBtn.setAttribute("aria-expanded", String(open));
  }
  loginBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    setLogin(!login.classList.contains("is-open"));
  });
  document.addEventListener("click", function (e) {
    if (!login.contains(e.target)) setLogin(false);
    if (!desktop.matches && !header.contains(e.target)) setMenu(false);
  });
  login.addEventListener("focusout", function (e) {
    if (e.relatedTarget && !login.contains(e.relatedTarget)) setLogin(false);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (login.classList.contains("is-open")) { setLogin(false); loginBtn.focus(); }
    if (nav.classList.contains("is-open")) { setMenu(false); toggle.focus(); }
  });
  var onBreakpoint = function () { if (desktop.matches) setMenu(false); };
  if (desktop.addEventListener) desktop.addEventListener("change", onBreakpoint);
  else desktop.addListener(onBreakpoint);

  /* ---- Active link follows the section in view ---- */
  var sectionIds = ["home", "about", "how-it-works", "features", "contact"];
  function setActive(id) {
    links.forEach(function (a) {
      var on = a.getAttribute("href") === "#" + id;
      a.classList.toggle("is-active", on);
      if (on) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current");
    });
  }
  if ("IntersectionObserver" in window) {
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) setActive(en.target.id); });
    }, { rootMargin: "-45% 0px -50% 0px" });
    sectionIds.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) spy.observe(el);
    });
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---- Gentle fade-in for section blocks ---- */
  var blocks = Array.prototype.slice.call(document.querySelectorAll("[data-reveal]"));
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Children of the steps, feature grid and role list follow their block in order */
  if (!reduceMotion) {
    ["#how-it-works .step", "#features .feature", "#about .role"].forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (el, i) {
        el.classList.add("stagger");
        el.style.setProperty("--d", (0.12 + i * 0.07).toFixed(2) + "s");
      });
    });
  }

  /* The call-to-action route lines draw when the section comes into view */
  var cta = document.querySelector(".cta");
  if (cta) {
    if ("IntersectionObserver" in window && !reduceMotion) {
      var ctaIo = new IntersectionObserver(function (entries, obs) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { cta.classList.add("is-seen"); obs.disconnect(); }
        });
      }, { threshold: 0.25 });
      ctaIo.observe(cta);
    } else {
      cta.classList.add("is-seen");
    }
  }

  if ("IntersectionObserver" in window && !reduceMotion) {
    var io = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("in"); obs.unobserve(en.target); }
      });
    }, { threshold: 0.12 });
    blocks.forEach(function (el) { el.classList.add("reveal"); io.observe(el); });
  }

  /* ---- Existing feature: clear demo data stored in this browser ---- */
  var reset = document.getElementById("resetDemo");
  if (reset) {
    reset.addEventListener("click", function () {
      var ok = confirm("This clears every test account, scan and session stored in this browser and reloads the page. Continue?");
      if (!ok) return;
      ["transitpass.students", "transitpass.scanHistory", "transitpass.scanFeed", "transitpass.adminUser", "transitpass.studentUser"].forEach(function (k) { localStorage.removeItem(k); });
      location.reload();
    });
  }
})();
