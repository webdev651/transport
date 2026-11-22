/* TransitPass motion layer. Plain JS, no dependencies. Pairs with css/motion.css.
   Safe to load on every page: each feature looks for its own elements and does
   nothing if they are missing. Honors prefers-reduced-motion. */
(function () {
  "use strict";

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  var isLanding = document.body.classList.contains("lp");
  var raf = window.requestAnimationFrame.bind(window);

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  /* ---------------------------------------------------------------
     3D tilt + glare (mouse only)
     --------------------------------------------------------------- */
  function bindTilt(el, max, withGlare) {
    if (el.classList.contains("fx-tilt")) return;
    el.classList.add("fx-tilt");
    if (withGlare) {
      var g = document.createElement("i");
      g.className = "fx-glare";
      g.setAttribute("aria-hidden", "true");
      el.appendChild(g);
    }
    var pending = null;
    el.addEventListener("pointermove", function (e) {
      if (e.pointerType !== "mouse") return;
      pending = e;
      if (el.__fxRaf) return;
      el.__fxRaf = raf(function () {
        el.__fxRaf = 0;
        var r = el.getBoundingClientRect();
        var x = (pending.clientX - r.left) / r.width;
        var y = (pending.clientY - r.top) / r.height;
        el.style.setProperty("--ry", ((x - 0.5) * 2 * max).toFixed(2) + "deg");
        el.style.setProperty("--rx", ((0.5 - y) * 2 * max).toFixed(2) + "deg");
        el.style.setProperty("--gx", (x * 100).toFixed(1) + "%");
        el.style.setProperty("--gy", (y * 100).toFixed(1) + "%");
        el.classList.add("is-tilting");
      });
    });
    el.addEventListener("pointerleave", function () {
      el.classList.remove("is-tilting");
      el.style.setProperty("--rx", "0deg");
      el.style.setProperty("--ry", "0deg");
    });
  }

  /* ---------------------------------------------------------------
     Count-up for KPI numbers (app pages). Runs once per label.
     --------------------------------------------------------------- */
  var counted = {};
  function countUp(el) {
    el.setAttribute("data-fx", "1");
    var label = el.previousElementSibling ? el.previousElementSibling.textContent.trim() : el.textContent;
    if (counted[label]) return;
    counted[label] = true;
    var raw = el.textContent.trim();
    var m = raw.match(/^(\D*?)(\d[\d,]*(?:\.\d+)?)(\D*)$/);
    if (!m) return;
    var prefix = m[1], numText = m[2], suffix = m[3];
    var decimals = (numText.split(".")[1] || "").length;
    var useCommas = numText.indexOf(",") > -1;
    var target = parseFloat(numText.replace(/,/g, ""));
    if (!isFinite(target) || target === 0) return;
    function fmt(v) {
      return prefix + (useCommas
        ? v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
        : v.toFixed(decimals)) + suffix;
    }
    var start = null, dur = 1000;
    el.textContent = fmt(0);
    function step(ts) {
      if (start === null) start = ts;
      var t = clamp((ts - start) / dur, 0, 1);
      var eased = 1 - Math.pow(1 - t, 4);
      el.textContent = fmt(target * eased);
      if (t < 1) raf(step); else el.textContent = raw;
    }
    raf(step);
  }

  /* ---------------------------------------------------------------
     App pages
     --------------------------------------------------------------- */
  function initApp() {
    if (reduce) return;
    var scheduled = false;
    function bindNew() {
      scheduled = false;
      if (finePointer) {
        document.querySelectorAll(".pass:not(.fx-tilt)").forEach(function (el) { bindTilt(el, 6, true); });
      }
      document.querySelectorAll(".kpi-value:not([data-fx])").forEach(countUp);
    }
    function schedule() { if (!scheduled) { scheduled = true; raf(bindNew); } }
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    bindNew();
    setTimeout(function () { document.body.classList.add("fx-ready"); }, 1200);
  }

  /* ---------------------------------------------------------------
     Landing page
     --------------------------------------------------------------- */
  function initLanding() {
    var hero = document.querySelector(".hero");
    var steps = document.querySelector(".steps");
    var about = document.querySelector(".about__media");

    /* ---- Sliding pill behind the active nav link ---- */
    var ul = document.querySelector(".nav-links");
    var desktop = window.matchMedia("(min-width: 960px)");
    if (ul && !reduce) {
      var pill = document.createElement("span");
      pill.className = "nav-pill";
      pill.setAttribute("aria-hidden", "true");
      ul.insertBefore(pill, ul.firstChild);
      ul.classList.add("has-pill");
      var placed = false;
      var place = function () {
        var a = ul.querySelector("a.is-active");
        if (!a || !desktop.matches) { if (pill.classList.contains("on")) pill.classList.remove("on"); return; }
        var ur = ul.getBoundingClientRect(), ar = a.getBoundingClientRect();
        if (!placed) pill.style.transition = "none";
        pill.style.width = ar.width + "px";
        pill.style.height = ar.height + "px";
        pill.style.transform = "translate(" + (ar.left - ur.left) + "px," + (ar.top - ur.top) + "px)";
        if (!pill.classList.contains("on")) pill.classList.add("on");
        if (!placed) { pill.offsetWidth; pill.style.transition = ""; placed = true; }
      };
      /* Observe only the links, never the pill: writing to the pill must not retrigger place() */
      var mo = new MutationObserver(place);
      ul.querySelectorAll("a").forEach(function (a) { mo.observe(a, { attributes: true, attributeFilter: ["class"] }); });
      window.addEventListener("resize", place);
      window.addEventListener("load", place);
      place();
    }

    if (reduce) { initRailStatic(); return; }

    /* ---- Magnetic buttons ---- */
    if (finePointer) {
      document.querySelectorAll(".hero .btn, .cta .btn").forEach(function (b) {
        b.classList.add("fx-mag");
        b.addEventListener("pointermove", function (e) {
          if (e.pointerType !== "mouse") return;
          var r = b.getBoundingClientRect();
          var dx = e.clientX - (r.left + r.width / 2);
          var dy = e.clientY - (r.top + r.height / 2);
          b.style.setProperty("--tx", (dx * 0.22).toFixed(1) + "px");
          b.style.setProperty("--ty", (dy * 0.3).toFixed(1) + "px");
        });
        b.addEventListener("pointerleave", function () {
          b.style.setProperty("--tx", "0px");
          b.style.setProperty("--ty", "0px");
        });
      });

      /* ---- Tilt on cards ---- */
      document.querySelectorAll(".portal").forEach(function (el) { bindTilt(el, 6, true); });
      document.querySelectorAll(".feature").forEach(function (el) { bindTilt(el, 5, true); });
    }

    /* ---- Headings: words rise out of a mask when their section reveals ---- */
    document.querySelectorAll(".section__title, .about__title, .cta h2").forEach(function (h) {
      if (h.children.length) return;
      var text = h.textContent.trim();
      if (!text) return;
      h.setAttribute("aria-label", text);
      h.textContent = "";
      var words = text.split(/\s+/);
      words.forEach(function (w, i) {
        var o = document.createElement("span");
        o.className = "fx-w";
        o.setAttribute("aria-hidden", "true");
        var n = document.createElement("span");
        n.className = "fx-wi";
        n.style.setProperty("--i", i);
        n.textContent = w;
        o.appendChild(n);
        h.appendChild(o);
        if (i < words.length - 1) h.appendChild(document.createTextNode(" "));
      });
    });

    /* ---- Scan step: a beam sweeps the icon. Done step: the check pops. ---- */
    var scanIcon = document.querySelector('.steps .step__icon use[href="#i-scan"]');
    if (scanIcon) {
      var si = scanIcon.closest("svg");
      var wrap = document.createElement("span");
      wrap.className = "fx-scanwrap";
      si.parentNode.insertBefore(wrap, si);
      wrap.appendChild(si);
      var beam = document.createElement("span");
      beam.className = "fx-scanbeam";
      beam.setAttribute("aria-hidden", "true");
      wrap.appendChild(beam);
    }
    var doneIcon = document.querySelector('.steps .step__icon use[href="#i-check"]');
    if (doneIcon) doneIcon.closest(".step").classList.add("fx-step-done");

    /* ---- Road divider: a bus drives along as you scroll toward the call to action ---- */
    var road = null, rp = -1, roadTimer = 0;
    var ctaSection = document.querySelector(".cta");
    if (ctaSection) {
      road = document.createElement("div");
      road.className = "fx-road";
      road.setAttribute("aria-hidden", "true");
      road.innerHTML = '<span class="fx-road__line"></span><span class="fx-road__trail"></span>' +
        '<span class="fx-road__bus"><svg class="ico"><use href="#i-bus"/></svg></span>';
      ctaSection.parentNode.insertBefore(road, ctaSection);
    }

    /* ---- Route rail through "How it works" ---- */
    var rail = null, items = [];
    if (steps) {
      items = Array.prototype.slice.call(steps.querySelectorAll(".step"));
      rail = document.createElement("span");
      rail.className = "steps__rail";
      rail.setAttribute("aria-hidden", "true");
      rail.appendChild(document.createElement("span"));
      steps.insertBefore(rail, steps.firstChild);
    }
    function layoutRail() {
      if (!rail || !items.length) return;
      var sr = steps.getBoundingClientRect();
      var f = items[0].getBoundingClientRect();
      var l = items[items.length - 1].getBoundingClientRect();
      var x0 = f.left + f.width / 2 - sr.left;
      var x1 = l.left + l.width / 2 - sr.left;
      rail.style.left = x0 + "px";
      rail.style.width = Math.max(0, x1 - x0) + "px";
    }

    /* ---- One scroll handler drives hero depth, rail progress and about frame ---- */
    var ticking = false;
    function update() {
      ticking = false;
      var vh = window.innerHeight;
      if (hero) {
        var hr = hero.getBoundingClientRect();
        hero.style.setProperty("--sy", clamp(-hr.top / Math.max(hr.height, 1), 0, 1).toFixed(3));
      }
      if (items.length) {
        var last = -1;
        items.forEach(function (it, i) {
          var on = it.getBoundingClientRect().top < vh * 0.75;
          it.classList.toggle("is-lit", on);
          if (on) last = i;
        });
        if (rail && last >= 0) {
          var f = items[0].getBoundingClientRect(), c = items[last].getBoundingClientRect(), l = items[items.length - 1].getBoundingClientRect();
          var span = (l.left + l.width / 2) - (f.left + f.width / 2);
          rail.style.setProperty("--p", span > 0 ? clamp(((c.left + c.width / 2) - (f.left + f.width / 2)) / span, 0, 1).toFixed(3) : 0);
        } else if (rail) {
          rail.style.setProperty("--p", 0);
        }
      }
      if (road) {
        var rr = road.getBoundingClientRect();
        var p = clamp((vh - rr.top) / (vh * 0.75), 0, 1);
        if (Math.abs(p - rp) > 0.001) {
          rp = p;
          road.style.setProperty("--rp", p.toFixed(3));
          road.classList.add("is-moving");
          clearTimeout(roadTimer);
          roadTimer = setTimeout(function () { road.classList.remove("is-moving"); }, 160);
        }
      }
      if (about) {
        var ar = about.getBoundingClientRect();
        about.style.setProperty("--ap", clamp(((ar.top + ar.height / 2) - vh / 2) / vh, -1, 1).toFixed(3));
      }
    }
    function onScroll() { if (!ticking) { ticking = true; raf(update); } }
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", function () { layoutRail(); onScroll(); });
    window.addEventListener("load", function () { layoutRail(); update(); });
    layoutRail();
    update();
  }

  /* Reduced motion: still light the steps as you scroll (color change only, no travel) */
  function initRailStatic() {
    var items = Array.prototype.slice.call(document.querySelectorAll(".steps .step"));
    if (!items.length || !("IntersectionObserver" in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) en.target.classList.add("is-lit"); });
    }, { threshold: 0.4 });
    items.forEach(function (it) { io.observe(it); });
  }

  if (isLanding) initLanding(); else initApp();
})();
