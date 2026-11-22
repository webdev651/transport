# QR Code-Based Student Transportation Discount Verification & Management System
Static front-end prototype — plain HTML, CSS and JavaScript. No build step, no npm dependencies to install, no backend (all data is mock and stored client-side, with session state and records kept in `localStorage`). Face recognition runs entirely in the browser via a CDN-loaded library — see the Face recognition section below.

## Run
Open `index.html` in a browser (same content as `landing.html` — it's the site's default document so a published root URL lands here), or serve the folder:
    python3 -m http.server 8000

## Part 1 — Authentication
- `landing.html`          — Public landing page, entry point for all roles (redesigned: hero, quick-access portals, How It Works, Features, About, call to action, footer)
- `student-register.html` — Student account creation (no separate login step — creates a pending account, signs you in immediately, and redirects to the dashboard; optional face enrollment)
- `student-login.html`    — Student sign in with School ID + password (demo: `2023-1182` / `student1234`)
- `student-register.html` — Student account creation. This is the only place accounts can be created from the sign-in side; it signs you in and opens the dashboard
- `admin-login.html`      — Driver sign in, no sign-up (demo: `driver` / `driver123`, editable from My Account)

## Part 2 — Student Interface
- `student-dashboard.html` — Pass status, discount rate, recent scans, QR pass preview
- `profile.html`            — View/edit profile details; enroll, replace, or remove your face for boarding verification
- `my-qrcode.html`          — Full-size rotating QR pass with refresh + download; shows a deactivated state if the registrar turns the QR off
- `scan-history.html`       — Full searchable/filterable history of the student's own verifications
- `notifications.html`      — Email notifications sent to the student (registration, approval, alerts)

## Admin area (gated behind Admin Login)
- `admin-dashboard.html`    — Verification dashboard: KPIs, live scan feed, digital student pass
- `verify.html`             — Conductor verification terminal: camera QR scanner, manual entry, "Scan by face" identification, face recognition step, session log with a Clear/Reset control (try School ID 2023-1182 / 2021-0910 / 2025-0184 / 2025-0121)
- `students.html`           — Student registry: search + status filter; add, edit, approve, flag, revoke, reinstate, remove; activate/deactivate a student's QR; regenerate/reissue a QR; enroll/retake/remove a student's face for boarding verification (camera capture, right in the add/edit form)
- `admin-scan-history.html` — Full cross-student scan history, sorted chronologically (search/filter) + the automatic email notification log
- `reports.html`            — Weekly verification volume chart + operator subsidy ledger
- `admin-account.html`      — Manage the signed-in admin's own name, email, username and password

## Face recognition verification
Enrollment (`students.html`, add/edit form) and verification (`verify.html`) both run **client-side only** using [face-api.js](https://github.com/justadudewhohacks/face-api.js), loaded from a public CDN along with its pretrained model weights — no photo, video frame, or descriptor is ever uploaded anywhere.
- **Enrollment**: from a student's row in the registry, a registrar opens Edit (or the Add student form for a new credential) and uses the "Face verification" camera panel to capture a live photo; the browser extracts a 128-value face descriptor and stores it + a small thumbnail on the student record (`faceEnrolled`, `facePhoto`, `faceDescriptor`) when the form is saved. Retake or Remove is available any time from the same panel.
- **Verification**: after a QR code resolves to an active, eligible student who has a face on file, the terminal asks the conductor to capture a fresh photo (reusing the same camera that read the QR code) and compares its descriptor against the enrolled one (Euclidean distance, face-api.js's own ≈0.6 match threshold). A match grants the discount; a mismatch routes to registrar review at full fare, same as a flagged pass.
- **Graceful degradation**: if a student never enrolled a face, or the library/models fail to load (no internet, blocked CDN), the terminal falls back to QR-only verification automatically — this feature never blocks the core system, and a manual "skip" override is always available to the conductor.
- **Scan by face** (`verify.html`, no QR/School ID needed): a separate "Scan by face" button opens the same camera and, on manual capture, runs 1:N identification — the descriptor is compared against every enrolled student and the closest match under the threshold is looked up directly, then run through the normal eligibility/discount decision. Since it's a direct identity match, it stands in for (and skips) the secondary face-check step described above. Only finds students who were enrolled from Student Registry first; with none enrolled, it correctly reports no match.

## Automatic email notifications (demo only — no real email is sent)
A toast appears and an entry is logged — visible to the registrar on `admin-scan-history.html` and to the affected student on `notifications.html` — whenever:
- a student registers, or a registrar manually issues or edits a credential (`student-register.html`, `students.html`)
- a registrar approves, reinstates, flags, revokes, activates/deactivates, or regenerates a QR code (`students.html`)
- the Verification Terminal flags a scan for possible pass sharing, fails a face match, or denies a scan because a pass has expired (`verify.html`)

## Other details
- "Forgot password?" on the admin login page explains that resets are handled out-of-band in this demo (no backend to reset against). Student password resets are handled by the registrar in this demo.
- `favicon.svg` — browser tab icon.

## Files
- `css/styles.css` — design tokens (navy / amber / teal), layout, components (dashboard, login and driver pages)
- `css/landing.css` — standalone stylesheet for the public homepage (navy / royal blue / gold)
- `js/landing.js`  — homepage behaviour: sticky header, mobile menu, login menu, active-section highlight, fade-ins, reset-demo action
- `img/campus-hero.jpg` — Talisay City College campus photo used in the homepage hero and About section (replace with the original high-resolution file, same name)
- `js/data.js`     — mock dataset (students, per-student scan history, scan feed, KPIs, weekly volume, operators, the persisted admin account and its login credentials)
- `js/app.js`      — nav state, QR badge rendering (rounded card + quiet zone), shared renderers, mock auth/session helpers, and the shared face-recognition module (CDN loader, descriptor capture/comparison)
- `js/qrcode-gen.js` — vendored, dependency-free real QR Code encoder (ISO/IEC 18004, versions 1–10). Every pass QR (`{schoolId}::v{qrVersion}`) is a genuine, scannable QR code, not a look-alike pattern — no build step or CDN required.

## Notes
- Authentication is a client-side demo only (`localStorage`), not real security — do not reuse this pattern in production.
- Students sign in with School ID + password (`student-login.html`); visiting a student page without a session redirects there. Student records without a password (seed data, or added by a registrar) get the shared demo password `student1234`. Visiting a driver page without a session redirects to `admin-login.html`.
- The staff area is labelled "Driver" in the UI; file names and JS identifiers (`admin-*.html`, `requireAdminAuth`) are unchanged.
- Registration, profile edits, and face enrollment persist in this browser's `localStorage` until it's cleared.
- Face recognition requires camera permission and an internet connection (to fetch face-api.js and its models from the CDN on first use); it is a simplified academic-prototype implementation, not a production biometric system.

## Motion
Animations live at the end of each stylesheet under a `Motion` heading and are wrapped in `prefers-reduced-motion: no-preference`, so people who ask their device for less motion get the finished page with no movement.
- `css/landing.css` + `js/landing.js` (landing.html / index.html): hero route draws itself with a live marker riding it, headline lines rise in order, scroll progress bar, staggered reveals for steps/features/roles, About photo wipe, call-to-action route lines.
- `css/auth.css` (student-login.html / student-register.html): background route draws, seal + wordmark + shuttle enter, card slides in with fields following, focus feedback, error shake, success ripple.
- `css/styles.css` (admin-login.html): short entrance sequence and error shake for the driver login.

## Motion layer
`css/motion.css` + `js/motion.js` are loaded on every page and honor `prefers-reduced-motion` (no movement for those users).
- **Landing**: word-by-word masked headings, a bus that drives along a road as you scroll to the call to action, a scan beam on the Scan step, cursor spotlight and depth parallax in the hero, magnetic hero/CTA buttons, 3D tilt + glare on quick-access and feature cards, sliding gold nav pill, a route rail in "How It Works" that fills as you scroll and lights each step.
- **App pages**: count-up KPI numbers, staggered first paint, tilting + shimmering digital pass, pop-in verification results with a status ring.
- **All pages**: cross-page view transitions (the header and sidebar stay put while content fades). Works in current Chrome/Edge/Safari; other browsers navigate normally.
