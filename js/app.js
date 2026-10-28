import { initStore, store, mode } from "./store.js";
import { ADMIN_EMAILS, APP_NAME } from "./config.js";
import { $, $$, esc, toast, formData, getPosition } from "./util.js";
import * as student from "./student.js";
import * as owner from "./owner.js";
import * as admin from "./admin.js";
import * as news from "./news.js";
import { seatGridDemo } from "./seatmap.js";

export const S = { user: null, profile: null, ready: false };
export const isAdmin = () => !!S.user && (S.profile?.role === "admin" || ADMIN_EMAILS.map((e) => e.toLowerCase()).includes((S.user.email || "").toLowerCase()));
export const go = (h) => { if (location.hash === h) route(); else location.hash = h; };
export const main = () => $("#main");

// ───────── Routes ─────────
const routes = [
  ["/", landing],
  ["/login", login],
  ["/welcome", welcome],
  ["/find", student.find, "public"],
  ["/lib/:id", student.libraryPage, "public"],
  ["/book/:id/:seat", student.book, "student"],
  ["/pay/:mid", student.pay, "student"],
  ["/me", student.mySeat, "student"],
  ["/profile", profilePage, "auth"],
  ["/news", news.page, "public"],
  ["/o/setup", owner.setup, "owner"],
  ["/o/dash", owner.dashboard, "owner"],
  ["/o/members", owner.members, "owner"],
  ["/o/payments", owner.payments, "owner"],
  ["/o/reminders", owner.reminders, "owner"],
  ["/o/reports", owner.reports, "owner"],
  ["/o/settings", owner.settings, "owner"],
  ["/admin", admin.dashboard, "admin"],
];

function match(path) {
  for (const [pat, fn, guard] of routes) {
    const a = pat.split("/"), b = path.split("/");
    if (a.length !== b.length) continue;
    const params = {};
    if (a.every((seg, i) => seg.startsWith(":") ? ((params[seg.slice(1)] = decodeURIComponent(b[i])), true) : seg === b[i])) return { fn, guard, params };
  }
  return null;
}

export function query() {
  const q = location.hash.split("?")[1] || "";
  return Object.fromEntries(new URLSearchParams(q));
}

let routeSeq = 0;
export async function route() {
  if (!S.ready) return;
  const seq = ++routeSeq;
  const path = (location.hash.slice(1).split("?")[0] || "/").replace(/\/$/, "") || "/";
  const m = match(path);
  renderNav(path);
  if (!m) { main().innerHTML = `<section class="wrap empty-page"><h1>Page not found</h1><p><a href="#/">Go to the home page</a></p></section>`; return; }

  // Guards
  const role = S.profile?.role;
  if (m.guard && m.guard !== "public") {
    if (!S.user) { sessionStorage.setItem("ss_after_login", location.hash); return go(`#/login?as=${m.guard === "owner" ? "owner" : "student"}`); }
    if (m.guard === "admin" && !isAdmin()) return go("#/");
    if ((m.guard === "student" || m.guard === "owner") && !S.profile && !isAdmin()) return go(`#/welcome?as=${m.guard}`);
    if (m.guard === "owner" && role !== "owner") { toast("That page is for library owners."); return go(role === "student" ? "#/find" : "#/"); }
    if (m.guard === "student" && role !== "student") { toast("Booking is done from a student account."); return go(role === "owner" ? "#/o/dash" : "#/"); }
  }
  main().innerHTML = `<div class="loading" aria-busy="true">Loading…</div>`;
  try {
    await m.fn(m.params, () => seq === routeSeq);
  } catch (err) {
    console.error(err);
    if (seq === routeSeq) main().innerHTML = `<section class="wrap empty-page"><h1>Something went wrong</h1><p>${esc(err.message || err)}</p><p><a href="#/">Back to home</a></p></section>`;
  }
  if (seq === routeSeq) { window.scrollTo(0, 0); $("#main h1")?.setAttribute("tabindex", "-1"); }
}

// ───────── Navigation ─────────
function renderNav(path) {
  const role = S.profile?.role;
  let links = [["#/find", "Find a seat"], ["#/news", "Current affairs"]];
  if (role === "student") links = [["#/find", "Find a seat"], ["#/me", "My seat"], ["#/news", "Current affairs"]];
  if (role === "owner") links = [["#/o/dash", "Dashboard"], ["#/o/members", "Members"], ["#/o/payments", "Payments"], ["#/o/reminders", "Reminders"], ["#/o/reports", "Reports"], ["#/o/settings", "Library"]];
  if (isAdmin()) links = [["#/admin", "Admin"], ["#/find", "Libraries"], ["#/news", "News"]];
  const here = "#" + path;
  $("#nav-links").innerHTML = links.map(([h, t]) => `<a href="${h}" ${here.startsWith(h) ? 'aria-current="page"' : ""}>${t}</a>`).join("");
  $("#nav-user").innerHTML = S.user
    ? `<a class="nav-me" href="#/profile" title="${esc(S.user.email)}">${esc((S.profile?.name || S.user.name || S.user.email || "Me").split(" ")[0])}</a>
       <button class="btn small ghost" id="signout">Sign out</button>`
    : `<a class="btn small" href="#/login?as=student">Sign in</a>`;
  $("#signout")?.addEventListener("click", async () => { await store.signOut(); go("#/"); toast("Signed out."); });
  $("#menu-toggle").setAttribute("aria-expanded", "false");
  $("#site-nav").classList.remove("open");
}

// ───────── Landing ─────────
async function landing() {
  if (S.profile?.role === "owner") return go("#/o/dash");
  if (isAdmin()) return go("#/admin");
  main().innerHTML = `
  <section class="hero wrap">
    <div class="hero-copy">
      <h1>Find a quiet seat to study, close to home.</h1>
      <p class="lede">Browse self-study libraries near you, see which desks are free right now, pick your seat and pay the owner directly. No calls, no wasted trips.</p>
      <div class="row">
        <a class="btn big" href="#/find">Find a seat</a>
        <a class="btn big ghost" href="#/login?as=owner">List your library</a>
      </div>
      ${mode === "demo" ? `<p class="demo-line">This is a working demo. <a href="#/login?as=student">Try it as a student, owner or admin</a>.</p>` : ""}
    </div>
    <figure class="hero-map" aria-label="Example seat map">
      <figcaption><strong>Saraswati Self Study Library</strong><span>Malviya Nagar · 11 of 48 desks free</span></figcaption>
      ${seatGridDemo()}
      <div class="legend"><span><i class="sw free"></i>Free</span><span><i class="sw taken"></i>Taken</span><span><i class="sw held"></i>On hold</span></div>
    </figure>
  </section>

  <section class="band">
    <div class="wrap split">
      <div>
        <h2>For students</h2>
        <ul class="ticks">
          <li>Libraries sorted by distance from you, with fees, timings and facilities up front</li>
          <li>Live seat map — choose the exact desk you want</li>
          <li>Pay by UPI straight to the owner and get a digital membership card</li>
          <li>Reminders before your monthly fee is due</li>
          <li>A last-24-hours current affairs feed for your city, India or the world</li>
        </ul>
      </div>
      <div>
        <h2>For library owners</h2>
        <ul class="ticks">
          <li>A seat map of your hall that shows who sits where and whose fee is due</li>
          <li>Add your existing students in minutes, then let new ones book online</li>
          <li>One-tap WhatsApp or SMS fee reminders</li>
          <li>Free up seats of students who stopped paying, or let it happen automatically</li>
          <li>Monthly collection, occupancy and joining reports, exportable to Excel</li>
        </ul>
      </div>
    </div>
  </section>

  <section class="wrap steps">
    <h2>How booking works</h2>
    <ol>
      <li><strong>Pick a library</strong><span>Compare fees, timings, facilities and reviews.</span></li>
      <li><strong>Choose your desk</strong><span>Green desks are free. Your pick is held for you.</span></li>
      <li><strong>Pay the owner</strong><span>UPI or bank transfer, then enter the transaction ID.</span></li>
      <li><strong>Start studying</strong><span>The owner confirms and your seat is yours for the month.</span></li>
    </ol>
  </section>`;
}

// ───────── Login (two windows: student / owner) ─────────
async function login() {
  const q = query();
  const as = q.as === "owner" ? "owner" : "student";
  if (S.user && (S.profile || isAdmin())) return afterLogin();
  main().innerHTML = `
  <section class="wrap auth">
    <div class="auth-tabs" role="tablist">
      <a role="tab" href="#/login?as=student" aria-selected="${as === "student"}">I'm a student</a>
      <a role="tab" href="#/login?as=owner" aria-selected="${as === "owner"}">I own a library</a>
    </div>
    <div class="auth-panel">
      <h1>${as === "owner" ? "Sign in to manage your library" : "Sign in to book a seat"}</h1>
      <p class="muted">${as === "owner" ? "New here? Create an account and set up your library in about 5 minutes." : "New here? Create an account — it takes a minute."}</p>
      <button class="btn google" id="g-btn"><svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z"/><path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z"/></svg>Continue with Google</button>
      <div class="or"><span>or use email</span></div>
      <form id="auth-form" class="stack">
        <div class="field signup-only" hidden><label for="f-name">Full name</label><input id="f-name" name="name" autocomplete="name"></div>
        <div class="field"><label for="f-email">Email</label><input id="f-email" name="email" type="email" required autocomplete="email"></div>
        <div class="field"><label for="f-pw">Password</label><input id="f-pw" name="pw" type="password" required minlength="6" autocomplete="current-password"></div>
        <button class="btn wide" id="auth-submit">Sign in</button>
        <p class="small muted"><button type="button" class="linkish" id="toggle-mode">New here? Create an account</button>
        · <button type="button" class="linkish" id="forgot">Forgot password</button></p>
      </form>
      ${mode === "demo" ? `
      <div class="demo-box">
        <p><strong>Demo mode.</strong> Data stays in this browser until Firebase is connected. Jump in with a sample account:</p>
        <div class="row">
          <button class="btn small ghost" data-demo="student">Demo student</button>
          <button class="btn small ghost" data-demo="owner">Demo owner</button>
          <button class="btn small ghost" data-demo="admin">Demo admin</button>
        </div>
      </div>` : ""}
    </div>
  </section>`;
  sessionStorage.setItem("ss_role_intent", as);
  let signup = false;
  const form = $("#auth-form");
  $("#toggle-mode").onclick = () => {
    signup = !signup;
    $$(".signup-only").forEach((e) => (e.hidden = !signup));
    $("#f-name").required = signup;
    $("#auth-submit").textContent = signup ? "Create account" : "Sign in";
    $("#toggle-mode").textContent = signup ? "Have an account? Sign in" : "New here? Create an account";
    $("#f-pw").autocomplete = signup ? "new-password" : "current-password";
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const f = formData(form);
    const btn = $("#auth-submit"); btn.disabled = true;
    try {
      if (signup) await store.signUpEmail(f.name, f.email, f.pw); else await store.signInEmail(f.email, f.pw);
    } catch (err) { toast(friendlyAuth(err), "err"); btn.disabled = false; }
  };
  $("#g-btn").onclick = async () => { try { await store.signInGoogle(); } catch (err) { toast(friendlyAuth(err), "err"); } };
  $("#forgot").onclick = async () => {
    const email = $("#f-email").value.trim();
    if (!email) return toast("Type your email first, then tap Forgot password.", "err");
    try { await store.resetPassword(email); toast("Password reset link sent to " + email); } catch (err) { toast(friendlyAuth(err), "err"); }
  };
  $$("[data-demo]").forEach((b) => (b.onclick = () => { sessionStorage.setItem("ss_role_intent", b.dataset.demo); store.demoLogin(b.dataset.demo); }));
}

function friendlyAuth(err) {
  const c = err.code || "";
  if (c.includes("invalid-credential") || c.includes("wrong-password") || c.includes("user-not-found")) return "Wrong email or password.";
  if (c.includes("email-already-in-use")) return "An account with this email already exists. Sign in instead.";
  if (c.includes("weak-password")) return "Password needs at least 6 characters.";
  if (c.includes("popup-closed")) return "Google sign-in was closed before finishing.";
  if (c.includes("unauthorized-domain")) return "This website isn't authorised in Firebase yet. Add it under Authentication → Settings → Authorized domains.";
  if (c.includes("operation-not-allowed")) return "This sign-in method is switched off in Firebase. Enable it under Authentication → Sign-in method.";
  return err.message || "Sign-in failed.";
}

function afterLogin() {
  const next = sessionStorage.getItem("ss_after_login");
  sessionStorage.removeItem("ss_after_login");
  if (isAdmin() && !S.profile?.role) return go("#/admin");
  if (!S.profile) return go(`#/welcome?as=${sessionStorage.getItem("ss_role_intent") || "student"}`);
  if (next && !next.startsWith("#/login")) return go(next);
  if (S.profile.role === "owner") return go("#/o/dash");
  if (S.profile.role === "admin") return go("#/admin");
  return go("#/find");
}

// ───────── First-time profile ─────────
async function welcome() {
  if (!S.user) return go("#/login");
  if (S.profile) return afterLogin();
  const as = query().as === "owner" ? "owner" : "student";
  main().innerHTML = `
  <section class="wrap narrow">
    <h1>${as === "owner" ? "Tell us about you" : "Welcome! A few details"}</h1>
    <p class="muted">${as === "owner" ? "Next you'll add your library — seats, fees and payment details." : "We use your location only to show the nearest libraries first."}</p>
    <form id="wf" class="stack panel">
      <div class="field"><label>Full name</label><input name="name" required value="${esc(S.user.name)}"></div>
      <div class="field"><label>Mobile number</label><input name="phone" required inputmode="numeric" pattern="[0-9]{10}" maxlength="10" placeholder="10-digit number"><small>${as === "owner" ? "Students will call you on this number." : "Used by the library owner for fee reminders."}</small></div>
      ${as === "student" ? `
      <div class="field"><label>Preparing for <span class="muted">(optional)</span></label>
        <input name="exam" list="exams" placeholder="e.g. UPSC, RAS, SSC CGL, NEET">
        <datalist id="exams">${["UPSC CSE", "RAS", "UPPSC", "SSC CGL", "Banking (IBPS/SBI)", "Railways (RRB)", "NEET", "JEE", "CA", "CAT", "Teaching (REET/CTET)", "State police", "Other"].map((x) => `<option value="${x}">`).join("")}</datalist></div>
      <fieldset class="field"><legend>Your location</legend>
        <div class="row"><button type="button" class="btn ghost small" id="locate">Use my current location</button><span id="loc-status" class="small muted"></span></div>
        <div class="grid2"><div class="field"><label>City</label><input name="city" required placeholder="e.g. Jaipur"></div>
        <div class="field"><label>Area / locality</label><input name="area" placeholder="e.g. Malviya Nagar"></div></div>
      </fieldset>` : `<div class="field"><label>City</label><input name="city" required placeholder="e.g. Jaipur"></div>`}
      <button class="btn wide">${as === "owner" ? "Continue to library setup" : "Show libraries near me"}</button>
    </form>
  </section>`;
  let pos = null;
  $("#locate")?.addEventListener("click", async () => {
    $("#loc-status").textContent = "Finding you…";
    try {
      pos = await getPosition();
      $("#loc-status").textContent = "Location saved.";
      const place = await reverseGeocode(pos);
      if (place.city && !$("[name=city]").value) $("[name=city]").value = place.city;
      if (place.area && !$("[name=area]").value) $("[name=area]").value = place.area;
    } catch (e) { $("#loc-status").textContent = e.message; }
  });
  $("#wf").onsubmit = async (e) => {
    e.preventDefault();
    const f = formData(e.target);
    const prof = { role: as, name: f.name, phone: f.phone, city: f.city, email: S.user.email, createdAt: Date.now() };
    if (as === "student") Object.assign(prof, { area: f.area || "", exam: f.exam || "", ...(pos || {}), news: { on: false, scope: "city", place: f.city } });
    await store.set(`users/${S.user.uid}`, prof);
    S.profile = prof;
    toast("Profile saved.");
    go(as === "owner" ? "#/o/setup" : "#/find");
  };
}

export async function reverseGeocode({ lat, lng }) {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=16`, { headers: { Accept: "application/json" } });
    const j = await r.json(); const a = j.address || {};
    return { city: a.city || a.town || a.county || a.state_district || "", area: a.suburb || a.neighbourhood || a.quarter || a.village || "" };
  } catch { return {}; }
}

// ───────── Profile ─────────
async function profilePage() {
  const p = S.profile || {};
  main().innerHTML = `
  <section class="wrap narrow">
    <h1>Your profile</h1>
    <form id="pf" class="stack panel">
      <p class="muted">Signed in as ${esc(S.user.email)}${p.role ? ` · ${p.role === "owner" ? "Library owner" : p.role === "student" ? "Student" : "Admin"} account` : ""}</p>
      <div class="field"><label>Full name</label><input name="name" required value="${esc(p.name || S.user.name)}"></div>
      <div class="field"><label>Mobile number</label><input name="phone" inputmode="numeric" pattern="[0-9]{10}" maxlength="10" value="${esc(p.phone)}"></div>
      <div class="grid2"><div class="field"><label>City</label><input name="city" value="${esc(p.city)}"></div>
      ${p.role === "student" ? `<div class="field"><label>Area</label><input name="area" value="${esc(p.area)}"></div>` : ""}</div>
      ${p.role === "student" ? `<div class="field"><label>Preparing for</label><input name="exam" value="${esc(p.exam)}"></div>
      <div class="row"><button type="button" class="btn ghost small" id="relocate">Update my location</button><span class="small muted" id="rl">${p.lat ? "Location is set." : "No location set yet."}</span></div>` : ""}
      <button class="btn">Save changes</button>
    </form>
    ${mode === "demo" ? `<p class="small muted">Demo mode: <button class="linkish" id="reset-demo">reset all demo data</button></p>` : ""}
  </section>`;
  let pos = null;
  $("#relocate")?.addEventListener("click", async () => { try { pos = await getPosition(); $("#rl").textContent = "New location captured — save to keep it."; } catch (e) { $("#rl").textContent = e.message; } });
  $("#pf").onsubmit = async (e) => {
    e.preventDefault();
    const f = formData(e.target);
    const patch = { name: f.name, phone: f.phone || "", city: f.city || "" };
    if (p.role === "student") Object.assign(patch, { area: f.area || "", exam: f.exam || "", ...(pos || {}) });
    await store.set(`users/${S.user.uid}`, patch);
    Object.assign(S.profile ??= {}, patch);
    toast("Profile saved."); renderNav(location.hash.slice(1));
  };
  $("#reset-demo")?.addEventListener("click", () => { store.resetDemo(); toast("Demo data reset."); go("#/"); });
}

// ───────── Boot ─────────
async function boot() {
  document.title = APP_NAME;
  $("#menu-toggle").addEventListener("click", () => {
    const n = $("#site-nav"); const open = n.classList.toggle("open");
    $("#menu-toggle").setAttribute("aria-expanded", String(open));
  });
  if (mode === "demo") $("#demo-flag").hidden = false;
  try { await initStore(); }
  catch (e) { main().innerHTML = `<section class="wrap empty-page"><h1>Couldn't connect</h1><p>${esc(e.message)}</p></section>`; return; }
  let first = true;
  store.onAuth(async (u) => {
    S.user = u;
    S.profile = u ? await store.get(`users/${u.uid}`).catch(() => null) : null;
    S.ready = true;
    const onLogin = location.hash.startsWith("#/login");
    if (u && onLogin) return afterLogin();
    if (first || !u) { first = false; route(); } else route();
  });
  window.addEventListener("hashchange", route);
}
boot();
