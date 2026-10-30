import { store } from "./store.js";
import { S, go, main, query } from "./app.js";
import { seatMap } from "./seatmap.js";
import {
  $, $$, esc, inr, km, fmtKm, toast, modal, confirmBox, formData, getPosition, today, addMonths, nextFixedDue,
  fmtDate, memberState, stateChip, waLink, upiLink, FACILITIES, daysBetween, ago,
} from "./util.js";

// ───────── shared loaders ─────────
export async function loadLibraries() {
  const [libs, seats, reviews] = await Promise.all([store.list("libraries"), store.group("seats"), store.list("reviews")]);
  const occ = {}, rate = {};
  for (const s of seats) { const lid = s.libraryId || s._path.split("/")[1]; occ[lid] = (occ[lid] || 0) + 1; }
  for (const r of reviews) { (rate[r.libraryId] ??= []).push(r.rating); }
  return libs.filter((l) => !["suspended", "hidden"].includes(l.status)).map((l) => {
    const rs = rate[l.id] || [];
    return {
      ...l, taken: occ[l.id] || 0, free: Math.max(0, (l.totalSeats || 0) - (occ[l.id] || 0)),
      minPrice: Math.min(...(l.plans || []).map((p) => +p.price || 0).filter(Boolean), Infinity),
      rating: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null, ratingCount: rs.length,
    };
  });
}

let leafletP;
export function loadLeaflet() {
  leafletP ??= new Promise((res, rej) => {
    const css = document.createElement("link");
    css.rel = "stylesheet"; css.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
    document.head.append(css);
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
    s.onload = () => res(window.L); s.onerror = () => rej(new Error("Map couldn't load."));
    document.head.append(s);
  });
  return leafletP;
}
export const mapFail = (el) => { if (el) el.innerHTML = `<p class="map-fail">The map couldn't load. Check your connection and refresh.</p>`; };
export async function drawMap(el, points, { center, zoom = 13, onPick } = {}) {
  const L = await loadLeaflet();
  const c = center || points[0] || { lat: 22.9, lng: 78.9 };
  const map = L.map(el, { scrollWheelZoom: false }).setView([c.lat, c.lng], points.length || center ? zoom : 5);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
  const icon = (cls) => L.divIcon({ className: "pin " + cls, iconSize: [16, 16] });
  points.forEach((p) => p.lat && L.marker([p.lat, p.lng], { icon: icon(p.cls || "") }).addTo(map).bindPopup(p.html || ""));
  if (points.length > 1) map.fitBounds(points.filter((p) => p.lat).map((p) => [p.lat, p.lng]), { padding: [30, 30], maxZoom: 14 });
  let pick;
  if (onPick) {
    if (center) pick = L.marker([center.lat, center.lng], { draggable: true }).addTo(map);
    const set = (ll) => { if (!pick) pick = L.marker(ll, { draggable: true }).addTo(map); pick.setLatLng(ll); onPick({ lat: +ll.lat.toFixed(5), lng: +ll.lng.toFixed(5) }); };
    map.on("click", (e) => set(e.latlng));
    pick?.on("dragend", () => set(pick.getLatLng()));
    map._setPick = (p) => { set(L.latLng(p.lat, p.lng)); map.setView([p.lat, p.lng], 16); };
  }
  setTimeout(() => map.invalidateSize(), 100);
  return map;
}

const stars = (r) => r == null ? `<span class="muted small">No reviews yet</span>` :
  `<span class="stars" aria-label="${r.toFixed(1)} out of 5">${"★".repeat(Math.round(r))}${"☆".repeat(5 - Math.round(r))}</span> <span class="small">${r.toFixed(1)}</span>`;

// ───────── Find libraries ─────────
let tempPos = null;
export async function find(_, alive) {
  const libs = await loadLibraries();
  if (!alive()) return;
  const me = S.profile?.role === "student" ? S.profile : null;
  const q = query();
  const cities = [...new Set(libs.map((l) => l.city).filter(Boolean))].sort();
  const quick = ["AC", "Wi-Fi", "Open 24×7", "Separate girls' section", "Personal locker", "Power socket at desk"];
  const st = {
    text: q.q || "", city: q.city ?? (me?.city && cities.includes(me.city) ? me.city : ""),
    max: "", fac: new Set(), sort: "near", view: "list",
  };

  main().innerHTML = `
  <section class="wrap">
    <div class="page-head">
      <div><h1>Study libraries${st.city ? "" : " near you"}</h1>
      <p class="muted" id="where"></p></div>
      <div class="seg" role="group" aria-label="View"><button data-view="list" aria-pressed="true">List</button><button data-view="map" aria-pressed="false">Map</button></div>
    </div>
    ${me ? dueBanner() : ""}
    <div class="filters">
      <input type="search" id="fq" placeholder="Search by name or area" value="${esc(st.text)}" aria-label="Search">
      <select id="fcity" aria-label="City"><option value="">All cities</option>${cities.map((c) => `<option ${c === st.city ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>
      <select id="fmax" aria-label="Maximum monthly fee"><option value="">Any fee</option>${[600, 800, 1000, 1200, 1500, 2000].map((v) => `<option value="${v}">Up to ${inr(v)}</option>`).join("")}</select>
      <select id="fsort" aria-label="Sort"><option value="near">Nearest first</option><option value="cheap">Lowest fee</option><option value="free">Most free seats</option><option value="rating">Best rated</option></select>
      <button class="btn ghost small" id="floc">Use my location</button>
    </div>
    <div class="chips" role="group" aria-label="Facilities">${quick.map((f) => `<button class="chip-btn" data-fac="${esc(f)}" aria-pressed="false">${esc(f)}</button>`).join("")}</div>
    <div id="results"></div>
    <div id="mapbox" class="mapbox" hidden></div>
  </section>`;

  $("#where").textContent = whereText();
  function whereText() {
    const p = tempPos || (me?.lat ? me : null);
    if (p) return `Sorted by distance from ${me?.area || me?.city || "your location"}.`;
    return "Turn on location to sort by distance.";
  }
  const origin = () => tempPos || (me?.lat ? { lat: me.lat, lng: me.lng } : null);

  function filtered() {
    const o = origin();
    let r = libs.map((l) => ({ ...l, dist: km(o, l) }));
    if (st.text) { const t = st.text.toLowerCase(); r = r.filter((l) => `${l.name} ${l.area} ${l.city} ${l.address}`.toLowerCase().includes(t)); }
    if (st.city) r = r.filter((l) => l.city === st.city);
    if (st.max) r = r.filter((l) => l.minPrice <= +st.max);
    if (st.fac.size) r = r.filter((l) => [...st.fac].every((f) => (l.facilities || []).includes(f)));
    const by = {
      near: (a, b) => (a.dist ?? 1e9) - (b.dist ?? 1e9) || a.minPrice - b.minPrice,
      cheap: (a, b) => a.minPrice - b.minPrice, free: (a, b) => b.free - a.free,
      rating: (a, b) => (b.rating ?? 0) - (a.rating ?? 0),
    }[st.sort];
    return r.sort(by);
  }

  let map;
  async function render() {
    const r = filtered();
    $("#results").hidden = st.view !== "list";
    $("#mapbox").hidden = st.view !== "map";
    if (st.view === "list") {
      $("#results").innerHTML = r.length ? `<ul class="lib-list">${r.map(libRow).join("")}</ul>` : !libs.length ?
        `<div class="empty"><p>No libraries are listed yet.</p><p class="small muted">Own a study library? <a href="#/login?as=owner">List it free</a> and students nearby can book seats online.</p></div>` :
        `<div class="empty"><p>No libraries match these filters.</p><p class="small muted">Try another city or clear the facility filters. Library owners can <a href="#/login?as=owner">list their library here</a>.</p></div>`;
    } else {
      map?.remove();
      $("#mapbox").innerHTML = "";
      const o = origin();
      map = await drawMap($("#mapbox"), [
        ...(o ? [{ ...o, cls: "me", html: "You are here" }] : []),
        ...r.map((l) => ({ lat: l.lat, lng: l.lng, cls: l.free ? "" : "full", html: `<strong>${esc(l.name)}</strong><br>${l.free} of ${l.totalSeats} free · from ${inr(l.minPrice)}<br><a href="#/lib/${l.id}">View seats</a>` })),
      ]).catch(() => mapFail($("#mapbox")));
    }
  }

  $("#fq").oninput = (e) => { st.text = e.target.value; render(); };
  $("#fcity").onchange = (e) => { st.city = e.target.value; render(); };
  $("#fmax").onchange = (e) => { st.max = e.target.value; render(); };
  $("#fsort").onchange = (e) => { st.sort = e.target.value; render(); };
  $$("[data-fac]").forEach((b) => (b.onclick = () => {
    const f = b.dataset.fac; st.fac.has(f) ? st.fac.delete(f) : st.fac.add(f);
    b.setAttribute("aria-pressed", st.fac.has(f)); render();
  }));
  $$("[data-view]").forEach((b) => (b.onclick = () => {
    st.view = b.dataset.view; $$("[data-view]").forEach((x) => x.setAttribute("aria-pressed", x === b)); render();
  }));
  $("#floc").onclick = async () => {
    try {
      tempPos = await getPosition(); st.sort = "near"; $("#fsort").value = "near";
      st.city = ""; $("#fcity").value = "";
      $("#where").textContent = "Sorted by distance from where you are now.";
      if (me) await store.set(`users/${S.user.uid}`, tempPos).then(() => Object.assign(S.profile, tempPos)).catch(() => {});
      render();
    } catch (e) { toast(e.message, "err"); }
  };
  render();
  loadDueBanner().catch(() => {});
}

function libRow(l) {
  const pct = l.totalSeats ? Math.round((l.taken / l.totalSeats) * 100) : 0;
  return `<li class="lib-row">
    <a href="#/lib/${l.id}" class="lib-main">
      <h3>${esc(l.name)}</h3>
      <p class="muted">${esc(l.area)}${l.area ? ", " : ""}${esc(l.city)}${l.dist != null ? ` · ${fmtKm(l.dist)} away` : ""}</p>
      <p class="small">${esc(l.hours || "")}</p>
      <p class="facs">${(l.facilities || []).slice(0, 5).map((f) => `<span>${esc(f)}</span>`).join("")}${(l.facilities || []).length > 5 ? `<span>+${l.facilities.length - 5}</span>` : ""}</p>
    </a>
    <div class="lib-side">
      <p class="price">${isFinite(l.minPrice) ? inr(l.minPrice) : "—"}<small>/month from</small></p>
      <div class="occ" title="${l.taken} of ${l.totalSeats} seats taken"><span style="width:${pct}%"></span></div>
      <p class="small ${l.free ? "" : "warn"}">${l.free ? `<strong>${l.free}</strong> of ${l.totalSeats} seats free` : "Full — join the waitlist"}</p>
      <p>${stars(l.rating)}</p>
      <a class="btn small" href="#/lib/${l.id}">View seats</a>
    </div></li>`;
}

function dueBanner() { return `<div id="due-banner"></div>`; }

// ───────── Library page ─────────
export async function libraryPage({ id }, alive) {
  const [lib, seats, reviews] = await Promise.all([store.get(`libraries/${id}`), store.list(`libraries/${id}/seats`), store.list("reviews", "libraryId", id)]);
  if (!alive()) return;
  if (!lib) { main().innerHTML = `<section class="wrap empty-page"><h1>Library not found</h1><p><a href="#/find">See all libraries</a></p></section>`; return; }
  const isStudent = S.profile?.role === "student";
  let mine = [];
  if (isStudent) mine = (await store.list("memberships", "studentId", S.user.uid)).filter((m) => m.libraryId === id && ["active", "pending"].includes(m.status));
  const seatMapState = Object.fromEntries(seats.map((s) => [s.id, s]));
  const free = lib.totalSeats - seats.length;
  const avg = reviews.length ? reviews.reduce((a, r) => a + r.rating, 0) / reviews.length : null;
  let picked = query().seat && !seatMapState[query().seat] ? query().seat : null;
  const onWait = isStudent ? await store.get(`libraries/${id}/waitlist/${S.user.uid}`).catch(() => null) : null;

  main().innerHTML = `
  <section class="wrap">
    <p class="crumbs"><a href="#/find">Libraries</a> / ${esc(lib.city)}</p>
    <div class="page-head">
      <div>
        <h1>${esc(lib.name)}</h1>
        <p class="muted">${esc(lib.address || `${lib.area}, ${lib.city}`)}</p>
        <p>${stars(avg)} <span class="small muted">${reviews.length ? `(${reviews.length} review${reviews.length > 1 ? "s" : ""})` : ""}</span></p>
      </div>
      <div class="row">
        ${lib.phone ? `<a class="btn ghost small" href="tel:+91${esc(lib.phone)}">Call</a>` : ""}
        ${lib.lat ? `<a class="btn ghost small" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${lib.lat},${lib.lng}">Directions</a>` : ""}
      </div>
    </div>
    ${mine.length ? `<div class="notice ok">You have seat <strong>${esc(mine[0].seat)}</strong> here${mine[0].status === "pending" ? " (waiting for payment confirmation)" : ""}. <a href="#/me">Open my seat</a></div>` : ""}
    ${(lib.notices || []).slice(-2).reverse().map((n) => `<div class="notice">${esc(n.text)} <span class="small muted">— ${ago(n.at)}</span></div>`).join("")}

    <div class="lib-grid">
      <div>
        <div class="section-head"><h2>Choose your seat</h2><p class="small muted">${free > 0 ? `${free} of ${lib.totalSeats} free` : "All seats are taken"}</p></div>
        <div id="smap"></div>
        <div class="legend"><span><i class="sw free"></i>Free</span><span><i class="sw taken"></i>Taken</span><span><i class="sw held"></i>On hold</span><span><i class="sw sel"></i>Your pick</span></div>
        ${free <= 0 ? `<div class="panel waitlist"><p><strong>This library is full.</strong> Join the waitlist and the owner will contact you when a seat frees up.</p>
          ${onWait ? `<p class="small">You're on the waitlist. <button class="linkish" id="unwait">Leave waitlist</button></p>` : `<button class="btn small" id="wait">Join waitlist</button>`}</div>` : ""}
      </div>
      <aside class="stack">
        <div class="panel">
          <h2 class="h3">Monthly fees</h2>
          <table class="plain"><tbody>${(lib.plans || []).map((p) => `<tr><td><strong>${esc(p.name)}</strong><br><span class="small muted">${esc(p.hours || "")}</span></td><td class="num">${inr(p.price)}</td></tr>`).join("")}</tbody></table>
          <p class="small muted">Open ${esc(lib.hours || "—")}. Fees are paid directly to the library.</p>
        </div>
        <div class="panel"><h2 class="h3">Facilities</h2><ul class="fac-list">${(lib.facilities || []).map((f) => `<li>${esc(f)}</li>`).join("") || "<li class='muted'>Not listed</li>"}</ul></div>
        ${lib.about ? `<div class="panel"><h2 class="h3">About</h2><p>${esc(lib.about)}</p></div>` : ""}
      </aside>
    </div>

    ${lib.lat ? `<h2>Location</h2><div id="lmap" class="mapbox small"></div>` : ""}

    <h2>Reviews</h2>
    <div id="reviews">${reviews.sort((a, b) => b.createdAt - a.createdAt).map((r) => `
      <div class="review"><p>${stars(r.rating)} <strong>${esc(r.name)}</strong> <span class="small muted">${ago(r.createdAt)}</span></p><p>${esc(r.text)}</p></div>`).join("") || `<p class="muted">No reviews yet.</p>`}</div>
    ${isStudent ? `<details class="panel"><summary>Write a review</summary>
      <form id="revf" class="stack"><div class="field"><label>Rating</label><select name="rating">${[5, 4, 3, 2, 1].map((n) => `<option value="${n}">${n} star${n > 1 ? "s" : ""}</option>`).join("")}</select></div>
      <div class="field"><label>Your review</label><textarea name="text" required maxlength="500" rows="3"></textarea></div><button class="btn small">Post review</button></form></details>` : ""}
  </section>
  <div class="sticky-bar" id="bar" hidden></div>`;

  function drawSeats() {
    $("#smap").innerHTML = seatMap({
      total: lib.totalSeats, cols: lib.cols, selected: picked,
      status: (n) => { const s = seatMapState[n]; if (!s) return { cls: "free", title: "Free" }; if (isStudent && s.uid === S.user.uid) return { cls: "mine", title: "Your seat" }; return s.state === "held" ? { cls: "held", title: "On hold" } : { cls: "taken", title: "Taken" }; },
      selectable: (n) => !seatMapState[n],
    });
    $$("#smap .seat").forEach((b) => (b.onclick = () => { picked = picked === b.dataset.seat ? null : b.dataset.seat; drawSeats(); bar(); }));
  }
  function bar() {
    const el = $("#bar");
    el.hidden = !picked;
    if (!picked) return;
    el.innerHTML = `<div class="wrap row-between"><p>Seat <strong>${picked}</strong> selected</p><button class="btn" id="cont">Continue to book</button></div>`;
    $("#cont").onclick = () => {
      if (!S.user) { sessionStorage.setItem("ss_after_login", `#/book/${id}/${picked}`); return go("#/login?as=student"); }
      if (S.profile?.role === "owner") return toast("Owners can't book seats. Use a student account.", "err");
      go(`#/book/${id}/${picked}`);
    };
  }
  drawSeats(); bar();
  if (lib.lat) drawMap($("#lmap"), [{ lat: lib.lat, lng: lib.lng, html: esc(lib.name) }], { zoom: 15 }).catch(() => mapFail($("#lmap")));

  $("#wait")?.addEventListener("click", async () => {
    if (!S.user) { sessionStorage.setItem("ss_after_login", location.hash); return go("#/login?as=student"); }
    if (!isStudent) return toast("Waitlist is for student accounts.", "err");
    await store.set(`libraries/${id}/waitlist/${S.user.uid}`, { name: S.profile.name, phone: S.profile.phone || "", createdAt: Date.now() });
    toast("You're on the waitlist."); libraryPage({ id }, () => true);
  });
  $("#unwait")?.addEventListener("click", async () => { await store.remove(`libraries/${id}/waitlist/${S.user.uid}`); toast("Removed from the waitlist."); libraryPage({ id }, () => true); });
  $("#revf")?.addEventListener("submit", async (e) => {
    e.preventDefault(); const f = formData(e.target);
    await store.add("reviews", { libraryId: id, studentId: S.user.uid, name: shortName(S.profile.name), rating: +f.rating, text: f.text, createdAt: Date.now() });
    toast("Review posted."); libraryPage({ id }, () => true);
  });
}
const shortName = (n = "") => { const p = n.trim().split(/\s+/); return p.length > 1 ? `${p[0]} ${p[p.length - 1][0]}.` : p[0]; };

// ───────── Book a seat ─────────
export async function book({ id, seat }, alive) {
  const [lib, seatDoc, mine] = await Promise.all([store.get(`libraries/${id}`), store.get(`libraries/${id}/seats/${seat}`), store.list("memberships", "studentId", S.user.uid)]);
  if (!alive()) return;
  if (!lib) return go("#/find");
  if (seatDoc) { toast(`Seat ${seat} was just taken. Pick another one.`, "err"); return go(`#/lib/${id}`); }
  const existing = mine.find((m) => m.libraryId === id && ["active", "pending"].includes(m.status));
  if (existing) { toast("You already have a seat in this library."); return go("#/me"); }
  const p = S.profile;
  main().innerHTML = `
  <section class="wrap narrow">
    <p class="crumbs"><a href="#/lib/${id}">${esc(lib.name)}</a> / Book seat ${esc(seat)}</p>
    <h1>Book seat ${esc(seat)}</h1>
    <form id="bf" class="stack panel">
      <fieldset class="field"><legend>Plan</legend>
        ${(lib.plans || []).map((pl, i) => `<label class="radio-row"><input type="radio" name="plan" value="${i}" ${i === 0 ? "checked" : ""}>
          <span><strong>${esc(pl.name)}</strong> <span class="muted small">${esc(pl.hours || "")}</span></span><span class="num">${inr(pl.price)}/month</span></label>`).join("")}
      </fieldset>
      <div class="grid2">
        <div class="field"><label>Full name</label><input name="name" required value="${esc(p.name)}"></div>
        <div class="field"><label>Mobile number</label><input name="phone" required inputmode="numeric" pattern="[0-9]{10}" maxlength="10" value="${esc(p.phone)}"></div>
      </div>
      <div class="grid2">
        <div class="field"><label>Start date</label><input type="date" name="start" required value="${today()}" min="${today()}"></div>
        <div class="field"><label>Preparing for <span class="muted">(optional)</span></label><input name="exam" value="${esc(p.exam)}"></div>
      </div>
      <p class="small muted" id="due-note"></p>
      <label class="check"><input type="checkbox" required> I'll follow the library's rules and pay the monthly fee on time.</label>
      <button class="btn wide">Hold seat and go to payment</button>
      <p class="small muted">Your seat is held for you while the owner confirms your payment.</p>
    </form>
  </section>`;
  const note = () => {
    const start = $("[name=start]").value || today();
    const due = lib.billing === "fixed" ? nextFixedDue(start, lib.dueDay || 1) : addMonths(start, 1);
    $("#due-note").textContent = lib.billing === "fixed"
      ? `This library collects fees on the ${ord(lib.dueDay || 1)} of every month. Your first payment covers you until ${fmtDate(due)}.`
      : `Your fee is due every month on your joining date. First payment covers you until ${fmtDate(due)}.`;
  };
  $("[name=start]").onchange = note; note();
  $("#bf").onsubmit = async (e) => {
    e.preventDefault();
    const f = formData(e.target); const plan = lib.plans[+f.plan];
    const btn = e.submitter; btn.disabled = true;
    try {
      if (await store.get(`libraries/${id}/seats/${seat}`)) throw new Error(`Seat ${seat} was just taken. Pick another one.`);
      await store.set(`libraries/${id}/seats/${seat}`, { state: "held", uid: S.user.uid, libraryId: id }, false);
      const mid = await store.add("memberships", {
        libraryId: id, ownerId: lib.ownerId, studentId: S.user.uid, name: f.name, phone: f.phone, email: S.user.email,
        seat, plan: plan.name, fee: +plan.price, joinedOn: f.start, nextDue: null, status: "pending", source: "app", exam: f.exam || "", createdAt: Date.now(),
      });
      if (!p.phone) await store.set(`users/${S.user.uid}`, { phone: f.phone }).catch(() => {});
      toast(`Seat ${seat} is held for you.`);
      go(`#/pay/${mid}`);
    } catch (err) {
      btn.disabled = false;
      toast(err.code === "permission-denied" ? `Seat ${seat} was just taken. Pick another one.` : err.message, "err");
    }
  };
}
export const ord = (n) => { const s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };

// ───────── Pay ─────────
let qrP;
const loadQR = () => (qrP ??= new Promise((res, rej) => { const s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"; s.onload = () => res(window.QRCode); s.onerror = rej; document.head.append(s); }));

export async function pay({ mid }, alive) {
  const m = await store.get(`memberships/${mid}`);
  if (!m || m.studentId !== S.user.uid) return go("#/me");
  const [lib, pays] = await Promise.all([store.get(`libraries/${m.libraryId}`), store.list("payments", "studentId", S.user.uid)]);
  if (!alive()) return;
  const waiting = pays.filter((p) => p.membershipId === mid && p.status === "claimed");
  const forFirst = m.status === "pending";
  const note = `${lib.name} seat ${m.seat} ${m.name}`.slice(0, 60);
  const upi = lib.upi ? upiLink({ upi: lib.upi, name: lib.payeeName || lib.name, amount: m.fee, note }) : null;
  main().innerHTML = `
  <section class="wrap narrow">
    <p class="crumbs"><a href="#/me">My seat</a> / Pay fee</p>
    <h1>Pay ${inr(m.fee)} to ${esc(lib.name)}</h1>
    <p class="muted">${forFirst ? `First month for seat ${esc(m.seat)} (${esc(m.plan)}).` : `Monthly fee for seat ${esc(m.seat)}, due ${fmtDate(m.nextDue)}.`} Money goes straight to the library owner.</p>
    ${waiting.length ? `<div class="notice">You've already sent a payment of ${inr(waiting[0].amount)} (ref ${esc(waiting[0].utr || waiting[0].method)}). The owner will confirm it soon.</div>` : ""}
    <div class="pay-grid">
      ${upi ? `<div class="panel center">
        <h2 class="h3">Pay by UPI</h2>
        <div id="qr" class="qr" aria-label="UPI QR code"></div>
        <p class="small muted">Scan with any UPI app</p>
        <a class="btn wide mobile-only" href="${esc(upi)}">Open UPI app</a>
        <p class="small">UPI ID: <strong>${esc(lib.upi)}</strong> <button class="linkish small" id="copyupi">Copy</button></p>
      </div>` : ""}
      ${lib.bank?.acc ? `<div class="panel">
        <h2 class="h3">Or bank transfer</h2>
        <dl class="kv"><dt>Account name</dt><dd>${esc(lib.bank.holder)}</dd><dt>Bank</dt><dd>${esc(lib.bank.bank)}</dd><dt>Account no.</dt><dd>${esc(lib.bank.acc)}</dd><dt>IFSC</dt><dd>${esc(lib.bank.ifsc)}</dd></dl>
      </div>` : ""}
    </div>
    <form id="pf" class="stack panel">
      <h2 class="h3">After paying, tell the owner</h2>
      <div class="grid2">
        <div class="field"><label>Paid by</label><select name="method"><option>UPI</option><option>Bank transfer</option><option value="Cash">Cash at the library</option></select></div>
        <div class="field"><label>Amount paid</label><input name="amount" type="number" min="1" required value="${m.fee}"></div>
      </div>
      <div class="field" id="utr-f"><label>UPI transaction ID / UTR</label><input name="utr" inputmode="numeric" placeholder="12-digit number from your UPI app" minlength="6"><small>Find it in your UPI app's payment history.</small></div>
      <button class="btn wide">I've paid — notify owner</button>
    </form>
  </section>`;
  if (upi) loadQR().then((QR) => new QR($("#qr"), { text: upi, width: 180, height: 180, colorDark: "#1e2621", colorLight: "#ffffff" })).catch(() => ($("#qr").textContent = "QR unavailable"));
  $("#copyupi")?.addEventListener("click", () => navigator.clipboard?.writeText(lib.upi).then(() => toast("UPI ID copied.")));
  const meth = $("[name=method]");
  const sync = () => { const cash = meth.value === "Cash"; $("#utr-f").hidden = cash; $("[name=utr]").required = !cash; };
  meth.onchange = sync; sync();
  $("#pf").onsubmit = async (e) => {
    e.preventDefault(); const f = formData(e.target);
    e.submitter.disabled = true;
    await store.add("payments", {
      libraryId: m.libraryId, ownerId: m.ownerId, membershipId: mid, studentId: S.user.uid, name: m.name,
      amount: +f.amount, months: 1, periodFrom: m.nextDue || m.joinedOn, method: f.method, utr: f.utr || "",
      status: "claimed", paidOn: today(), createdAt: Date.now(),
    });
    toast("Owner notified. You'll see it confirmed on My seat.");
    go("#/me");
  };
}

// ───────── My seat ─────────
export async function mySeat(_, alive) {
  const [mems, pays] = await Promise.all([store.list("memberships", "studentId", S.user.uid), store.list("payments", "studentId", S.user.uid)]);
  const libIds = [...new Set(mems.map((m) => m.libraryId))];
  const libs = Object.fromEntries((await Promise.all(libIds.map((id) => store.get(`libraries/${id}`)))).filter(Boolean).map((l) => [l.id, l]));
  if (!alive()) return;
  const current = mems.filter((m) => ["active", "pending"].includes(m.status)).sort((a, b) => b.createdAt - a.createdAt);
  const past = mems.filter((m) => !["active", "pending"].includes(m.status));

  main().innerHTML = `
  <section class="wrap">
    <h1>My seat</h1>
    ${current.length ? current.map((m) => memberCard(m, libs[m.libraryId], pays)).join("") :
      `<div class="empty"><p>You haven't booked a seat yet.</p><a class="btn" href="#/find">Find a library</a></div>`}
    <h2>Payment history</h2>
    ${pays.length ? `<table class="data"><thead><tr><th>Date</th><th>Library</th><th class="num">Amount</th><th>Method</th><th>Status</th></tr></thead><tbody>
      ${pays.sort((a, b) => b.createdAt - a.createdAt).map((p) => `<tr><td>${fmtDate(p.paidOn)}</td><td>${esc(libs[p.libraryId]?.name || "")}</td><td class="num">${inr(p.amount)}</td><td>${esc(p.method)}${p.utr ? `<br><span class="small muted">${esc(p.utr)}</span>` : ""}</td>
        <td>${p.status === "confirmed" ? `<span class="chip chip-paid">Confirmed</span>` : p.status === "claimed" ? `<span class="chip chip-pending">Waiting for owner</span>` : `<span class="chip chip-overdue">Rejected</span>`}</td></tr>`).join("")}</tbody></table>` : `<p class="muted">No payments yet.</p>`}
    ${past.length ? `<h2>Earlier memberships</h2><ul class="plain-list">${past.map((m) => `<li>${esc(libs[m.libraryId]?.name || "Library")} — seat ${esc(m.seat)} · ${m.status === "left" ? "left" : "cancelled"}</li>`).join("")}</ul>` : ""}
  </section>`;

  $$("[data-cancel]").forEach((b) => (b.onclick = async () => {
    const m = mems.find((x) => x.id === b.dataset.cancel);
    if (!(await confirmBox(`Cancel your booking for seat ${m.seat}? The seat will be released.`, "Cancel booking", true))) return;
    await store.update(`memberships/${m.id}`, { status: "cancelled" });
    await store.remove(`libraries/${m.libraryId}/seats/${m.seat}`).catch(() => {});
    toast("Booking cancelled."); mySeat(_, () => true);
  }));
  $$("[data-card]").forEach((b) => (b.onclick = () => showCard(mems.find((x) => x.id === b.dataset.card), libs)));
}

function memberCard(m, lib, pays) {
  if (!lib) return "";
  const st = memberState(m, lib);
  const waiting = pays.find((p) => p.membershipId === m.id && p.status === "claimed");
  const d = m.nextDue ? daysBetween(today(), m.nextDue) : null;
  const msg = st === "pending" ? (waiting ? "Payment sent. Waiting for the owner to confirm." : "Seat on hold — pay the first month to confirm it.")
    : st === "due-soon" ? `Fee due in ${d} day${d === 1 ? "" : "s"}, on ${fmtDate(m.nextDue)}.`
    : st === "due" ? `Fee was due on ${fmtDate(m.nextDue)}. Pay soon to keep your seat.`
    : st === "overdue" ? `Fee is overdue since ${fmtDate(m.nextDue)}. The owner may release your seat.`
    : `Paid until ${fmtDate(m.nextDue)}.`;
  return `<article class="member-card st-${st}">
    <div class="mc-seat"><span>Seat</span><strong>${esc(m.seat)}</strong></div>
    <div class="mc-body">
      <h2 class="h3"><a href="#/lib/${lib.id}">${esc(lib.name)}</a></h2>
      <p class="muted small">${esc(lib.area)}, ${esc(lib.city)} · ${esc(m.plan)} · ${inr(m.fee)}/month</p>
      <p>${stateChip(st)} ${msg}</p>
      ${(lib.notices || []).slice(-1).map((n) => `<p class="small notice-inline">Notice: ${esc(n.text)}</p>`).join("")}
      <div class="row">
        ${!waiting && st !== "paid" ? `<a class="btn small" href="#/pay/${m.id}">Pay ${inr(m.fee)}</a>` : ""}
        ${st === "paid" ? `<a class="btn small ghost" href="#/pay/${m.id}">Pay in advance</a>` : ""}
        ${m.status === "active" ? `<button class="btn small ghost" data-card="${m.id}">Membership card</button>` : ""}
        ${lib.phone ? `<a class="btn small ghost" href="${waLink(lib.phone, `Hi, I'm ${m.name} (seat ${m.seat}).`)}" target="_blank" rel="noopener">WhatsApp owner</a>` : ""}
        ${m.status === "pending" && !waiting ? `<button class="btn small ghost danger-text" data-cancel="${m.id}">Cancel booking</button>` : ""}
      </div>
    </div></article>`;
}

function showCard(m, libs) {
  const lib = libs[m.libraryId];
  modal(`<div class="id-card">
    <p class="idc-lib">${esc(lib.name)}</p>
    <div class="idc-row"><div><p class="idc-name">${esc(m.name)}</p><p class="small">${esc(m.plan)} · since ${fmtDate(m.joinedOn)}</p>
      <p class="small">Valid until <strong>${fmtDate(m.nextDue)}</strong></p></div>
      <div class="idc-seat"><span>Seat</span><strong>${esc(m.seat)}</strong></div></div>
    <div id="cqr" class="qr small"></div><p class="small muted center">Member ID ${esc(m.id)}</p></div>`, {
    onMount: () => loadQR().then((QR) => new QR($("#cqr"), { text: `SEATSATHI:${m.id}:${m.seat}:${m.nextDue}`, width: 110, height: 110 })),
  });
}

// Due reminder shown on the find page for students
export async function loadDueBanner() {
  const el = $("#due-banner"); if (!el || S.profile?.role !== "student") return;
  const mems = await store.list("memberships", "studentId", S.user.uid);
  const m = mems.find((x) => x.status === "active" && ["due-soon", "due", "overdue"].includes(memberState(x)));
  if (m) el.innerHTML = `<div class="notice warn">Your fee for seat ${esc(m.seat)} is ${memberState(m) === "due-soon" ? "due on " + fmtDate(m.nextDue) : "overdue"}. <a href="#/pay/${m.id}">Pay now</a></div>`;
}
