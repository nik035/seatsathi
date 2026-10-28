import { store } from "./store.js";
import { S, go, main, query } from "./app.js";
import { seatMap } from "./seatmap.js";
import { drawMap, ord, mapFail } from "./student.js";
import {
  $, $$, esc, inr, toast, modal, confirmBox, formData, getPosition, today, addDays, addMonths, nextFixedDue, fmtDate, fmtShort,
  memberState, stateChip, STATE_LABEL, waLink, smsLink, FACILITIES, daysBetween, downloadCSV, monthKey, monthLabel, barChart, ago, parse,
} from "./util.js";

const DEFAULT_TEMPLATE = "Namaste {name}, your monthly fee of {amount} for seat {seat} at {library} is due on {date}. Pay by UPI to {upi} and share the transaction ID. Thank you!";

// ───────── Context ─────────
async function ctx({ needLib = true } = {}) {
  const libs = await store.list("libraries", "ownerId", S.user.uid);
  if (!libs.length) { if (needLib) go("#/o/setup"); return null; }
  let lid = localStorage.getItem("ss_lib");
  if (!libs.find((l) => l.id === lid)) lid = libs[0].id;
  const lib = libs.find((l) => l.id === lid);
  const [mems, pays, seats, wait] = await Promise.all([
    store.list("memberships", "ownerId", S.user.uid),
    store.list("payments", "ownerId", S.user.uid),
    store.list(`libraries/${lid}/seats`),
    store.list(`libraries/${lid}/waitlist`).catch(() => []),
  ]);
  return {
    libs, lib,
    mems: mems.filter((m) => m.libraryId === lid),
    pays: pays.filter((p) => p.libraryId === lid),
    seats: Object.fromEntries(seats.map((s) => [s.id, s])),
    wait,
  };
}

function libSwitcher(c) {
  if (c.libs.length < 2) return "";
  return `<select id="libsw" aria-label="Library">${c.libs.map((l) => `<option value="${l.id}" ${l.id === c.lib.id ? "selected" : ""}>${esc(l.name)}</option>`).join("")}</select>`;
}
function bindSwitcher() {
  $("#libsw")?.addEventListener("change", (e) => { localStorage.setItem("ss_lib", e.target.value); dispatchEvent(new HashChangeEvent("hashchange")); });
}
const activeMembers = (c) => c.mems.filter((m) => m.status === "active" || m.status === "pending");
const fill = (tpl, m, lib) => (tpl || DEFAULT_TEMPLATE)
  .replaceAll("{name}", m.name.split(" ")[0]).replaceAll("{seat}", m.seat).replaceAll("{amount}", inr(m.fee))
  .replaceAll("{date}", fmtDate(m.nextDue)).replaceAll("{library}", lib.name).replaceAll("{upi}", lib.upi || "the library");

// ───────── Money logic ─────────
async function confirmPayment(p, m, lib) {
  const months = Math.max(1, +p.months || 1);
  let patch;
  if (m.status === "pending" || !m.nextDue) {
    const start = m.joinedOn || today();
    let due = lib.billing === "fixed" ? nextFixedDue(start, lib.dueDay || 1) : addMonths(start, 1);
    if (months > 1) due = addMonths(due, months - 1);
    patch = { status: "active", nextDue: due };
    await store.set(`libraries/${lib.id}/seats/${m.seat}`, { state: "taken", uid: m.studentId || "walkin", libraryId: lib.id }, false);
  } else patch = { nextDue: addMonths(m.nextDue, months) };
  await store.update(`memberships/${m.id}`, patch);
  if (p.id) await store.update(`payments/${p.id}`, { status: "confirmed", confirmedAt: Date.now() });
  return patch;
}
async function releaseSeat(m, lib, reason = "") {
  await store.update(`memberships/${m.id}`, { status: "left", leftOn: today(), leftReason: reason });
  const s = await store.get(`libraries/${lib.id}/seats/${m.seat}`);
  if (s) await store.remove(`libraries/${lib.id}/seats/${m.seat}`);
}
async function autoRelease(c) {
  const n = +c.lib.autoReleaseDays || 0;
  if (!n) return 0;
  const victims = c.mems.filter((m) => m.status === "active" && m.nextDue && daysBetween(m.nextDue, today()) > n);
  for (const m of victims) await releaseSeat(m, c.lib, `Auto-released: unpaid ${n}+ days`);
  return victims.length;
}

// ───────── Member drawer ─────────
function openMember(m, c, refresh) {
  const st = memberState(m, c.lib);
  const hist = c.pays.filter((p) => p.membershipId === m.id).sort((a, b) => b.createdAt - a.createdAt);
  const msg = fill(c.lib.reminderTemplate, m, c.lib);
  modal(`
    <div class="drawer-head"><div class="mc-seat small"><span>Seat</span><strong>${esc(m.seat)}</strong></div>
      <div><h2 class="h3">${esc(m.name)}</h2><p class="small muted">${esc(m.phone)}${m.exam ? ` · ${esc(m.exam)}` : ""} · ${m.source === "app" ? "Booked online" : "Added by you"}</p></div></div>
    <p>${stateChip(st)} ${m.nextDue ? `Next fee due <strong>${fmtDate(m.nextDue)}</strong>` : "Not paid yet"} · ${esc(m.plan)} · ${inr(m.fee)}/month</p>
    <div class="row wrap-row">
      ${m.status !== "left" ? `<button class="btn small" data-act="pay">Record payment</button>` : ""}
      ${m.phone ? `<a class="btn small ghost" target="_blank" rel="noopener" href="${waLink(m.phone, msg)}" data-act="remind">WhatsApp reminder</a>
      <a class="btn small ghost" href="${smsLink(m.phone, msg)}" data-act="remind">SMS</a>
      <a class="btn small ghost" href="tel:+91${esc(m.phone)}">Call</a>` : ""}
      <button class="btn small ghost" data-act="edit">Edit</button>
      ${m.status !== "left" ? `<button class="btn small ghost danger-text" data-act="release">Mark seat vacant</button>` : ""}
    </div>
    ${m.lastReminderAt ? `<p class="small muted">Last reminder sent ${ago(m.lastReminderAt)}.</p>` : ""}
    <h3 class="h4">Payments</h3>
    ${hist.length ? `<table class="data compact"><tbody>${hist.map((p) => `<tr><td>${fmtDate(p.paidOn)}</td><td class="num">${inr(p.amount)}</td><td>${esc(p.method)}${p.utr ? ` <span class="small muted">${esc(p.utr)}</span>` : ""}</td><td>${p.status === "confirmed" ? "✓" : p.status}</td></tr>`).join("")}</tbody></table>` : `<p class="muted small">No payments recorded.</p>`}
  `, {
    wide: true,
    onMount(el, close) {
      el.querySelectorAll("[data-act=remind]").forEach((a) => a.addEventListener("click", () => store.update(`memberships/${m.id}`, { lastReminderAt: Date.now() })));
      el.querySelector("[data-act=pay]")?.addEventListener("click", () => { close(); recordPayment(m, c, refresh); });
      el.querySelector("[data-act=edit]").onclick = () => { close(); editMember(m, c, refresh); };
      el.querySelector("[data-act=release]")?.addEventListener("click", async () => {
        if (!(await confirmBox(`Mark seat ${m.seat} vacant? ${m.name} will be moved to past members.`, "Mark vacant", true))) return;
        await releaseSeat(m, c.lib, "Released by owner"); close(); toast(`Seat ${m.seat} is now free.`); refresh();
      });
    },
  });
}

function recordPayment(m, c, refresh) {
  modal(`<h2 class="h3">Record payment — ${esc(m.name)}, seat ${esc(m.seat)}</h2>
    <form class="stack" id="rp">
      <div class="grid2"><div class="field"><label>Months</label><select name="months">${[1, 2, 3, 6].map((n) => `<option>${n}</option>`).join("")}</select></div>
      <div class="field"><label>Amount</label><input name="amount" type="number" required min="0" value="${m.fee}"></div></div>
      <div class="grid2"><div class="field"><label>Method</label><select name="method"><option>Cash</option><option>UPI</option><option>Bank transfer</option></select></div>
      <div class="field"><label>Paid on</label><input type="date" name="paidOn" value="${today()}" required></div></div>
      <div class="field"><label>Reference <span class="muted">(optional)</span></label><input name="utr"></div>
      <p class="small muted" id="rp-note"></p>
      <button class="btn">Save payment</button></form>`, {
    onMount(el, close) {
      const f = el.querySelector("#rp");
      const note = () => {
        const n = +f.months.value; f.amount.value = m.fee * n;
        const base = m.nextDue || (c.lib.billing === "fixed" ? nextFixedDue(m.joinedOn || today(), c.lib.dueDay || 1) : addMonths(m.joinedOn || today(), 1));
        const nd = m.nextDue ? addMonths(m.nextDue, n) : addMonths(base, n - 1);
        el.querySelector("#rp-note").textContent = `Next due date becomes ${fmtDate(nd)}.`;
      };
      f.months.onchange = note; note();
      f.onsubmit = async (e) => {
        e.preventDefault(); const d = formData(f);
        const p = { libraryId: c.lib.id, ownerId: S.user.uid, membershipId: m.id, studentId: m.studentId || null, name: m.name, amount: +d.amount, months: +d.months, periodFrom: m.nextDue || m.joinedOn, method: d.method, utr: d.utr || "", status: "confirmed", paidOn: d.paidOn, createdAt: Date.now(), confirmedAt: Date.now() };
        await confirmPayment({ ...p, id: null }, m, c.lib);
        await store.add("payments", p);
        close(); toast(`Payment of ${inr(p.amount)} saved.`); refresh();
      };
    },
  });
}

function memberForm(m, c, seatNo) {
  const plans = c.lib.plans || [];
  return `<form class="stack" id="mf">
    <div class="grid2"><div class="field"><label>Name</label><input name="name" required value="${esc(m?.name)}"></div>
    <div class="field"><label>Mobile</label><input name="phone" inputmode="numeric" pattern="[0-9]{10}" maxlength="10" value="${esc(m?.phone)}"></div></div>
    <div class="grid2"><div class="field"><label>Seat</label><input name="seat" required value="${esc(m?.seat || seatNo || "")}" inputmode="numeric"></div>
    <div class="field"><label>Plan</label><select name="plan">${plans.map((p) => `<option data-price="${p.price}" ${m?.plan === p.name ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></div></div>
    <div class="grid2"><div class="field"><label>Monthly fee</label><input name="fee" type="number" min="0" required value="${m?.fee ?? plans[0]?.price ?? ""}"></div>
    <div class="field"><label>Joined on</label><input name="joinedOn" type="date" value="${m?.joinedOn || today()}"></div></div>
    <div class="field"><label>Fee paid until (next due date)</label><input name="nextDue" type="date" value="${m?.nextDue || ""}"><small>Leave empty if this student hasn't paid yet.</small></div>
    <button class="btn">${m ? "Save changes" : "Add student"}</button></form>`;
}
function bindPlanFee(el) { const f = el.querySelector("#mf"); f.plan.onchange = () => (f.fee.value = f.plan.selectedOptions[0].dataset.price); }

function addMember(c, refresh, seatNo) {
  modal(`<h2 class="h3">Add a student${seatNo ? ` to seat ${esc(seatNo)}` : ""}</h2><p class="small muted">For students who already study here or walk in. They don't need an account.</p>${memberForm(null, c, seatNo)}`, {
    onMount(el, close) {
      bindPlanFee(el);
      el.querySelector("#mf").onsubmit = async (e) => {
        e.preventDefault(); const d = formData(e.target);
        const err = seatError(d.seat, c); if (err) return toast(err, "err");
        await store.set(`libraries/${c.lib.id}/seats/${d.seat}`, { state: "taken", uid: "walkin", libraryId: c.lib.id }, false);
        await store.add("memberships", { libraryId: c.lib.id, ownerId: S.user.uid, studentId: null, name: d.name, phone: d.phone, seat: d.seat, plan: d.plan, fee: +d.fee, joinedOn: d.joinedOn || today(), nextDue: d.nextDue || today(), status: "active", source: "walk-in", createdAt: Date.now() });
        close(); toast(`${d.name} added to seat ${d.seat}.`); refresh();
      };
    },
  });
}
function seatError(seat, c, except) {
  const n = +seat;
  if (!Number.isInteger(n) || n < 1 || n > c.lib.totalSeats) return `Seat must be between 1 and ${c.lib.totalSeats}.`;
  const busy = c.mems.find((m) => m.seat === String(n) && ["active", "pending"].includes(m.status) && m.id !== except);
  if (busy || (c.seats[String(n)] && !except)) return `Seat ${n} is already taken${busy ? " by " + busy.name : ""}.`;
  return "";
}
function editMember(m, c, refresh) {
  modal(`<h2 class="h3">Edit ${esc(m.name)}</h2>${memberForm(m, c)}`, {
    onMount(el, close) {
      bindPlanFee(el);
      el.querySelector("#mf").onsubmit = async (e) => {
        e.preventDefault(); const d = formData(e.target);
        if (d.seat !== m.seat) {
          const err = seatError(d.seat, c, m.id); if (err) return toast(err, "err");
          if (c.seats[d.seat]) return toast(`Seat ${d.seat} is already taken.`, "err");
          const old = c.seats[m.seat];
          await store.remove(`libraries/${c.lib.id}/seats/${m.seat}`).catch(() => {});
          await store.set(`libraries/${c.lib.id}/seats/${d.seat}`, { state: old?.state || "taken", uid: old?.uid || m.studentId || "walkin", libraryId: c.lib.id }, false);
        }
        await store.update(`memberships/${m.id}`, { name: d.name, phone: d.phone, seat: d.seat, plan: d.plan, fee: +d.fee, joinedOn: d.joinedOn, nextDue: d.nextDue || null });
        close(); toast("Saved."); refresh();
      };
    },
  });
}

function importMembers(c, refresh) {
  modal(`<h2 class="h3">Import existing students</h2>
    <p class="small">Paste one student per line: <strong>Name, Mobile, Seat, Monthly fee, Paid until (YYYY-MM-DD or DD/MM/YYYY)</strong>. You can copy these columns straight from Excel.</p>
    <textarea id="imp" rows="8" placeholder="Rahul Verma, 9876543210, 5, 900, 05/11/2026"></textarea>
    <p class="small muted" id="imp-msg"></p>
    <div class="row-end"><button class="btn" id="imp-go">Import</button></div>`, {
    wide: true,
    onMount(el, close) {
      el.querySelector("#imp-go").onclick = async () => {
        const lines = el.querySelector("#imp").value.split("\n").map((l) => l.trim()).filter(Boolean);
        const rows = [], errs = [];
        const used = new Set([...Object.keys(c.seats)]);
        lines.forEach((l, i) => {
          const [name, phone, seat, fee, paid] = l.split(/\t|,/).map((x) => (x || "").trim());
          let nd = paid || "";
          if (/^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(nd)) { const [d, mo, y] = nd.split(/[/-]/); nd = `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`; }
          const n = +seat;
          if (!name || !n || n > c.lib.totalSeats) return errs.push(`Line ${i + 1}: needs a name and a seat between 1 and ${c.lib.totalSeats}.`);
          if (used.has(String(n))) return errs.push(`Line ${i + 1}: seat ${n} is already taken.`);
          used.add(String(n));
          rows.push({ name, phone: (phone || "").replace(/\D/g, "").slice(-10), seat: String(n), fee: +fee || c.lib.plans?.[0]?.price || 0, nextDue: /^\d{4}-\d{2}-\d{2}$/.test(nd) ? nd : today() });
        });
        if (errs.length) { el.querySelector("#imp-msg").textContent = errs.slice(0, 4).join(" "); if (!rows.length) return; }
        for (const r of rows) {
          await store.set(`libraries/${c.lib.id}/seats/${r.seat}`, { state: "taken", uid: "walkin", libraryId: c.lib.id }, false);
          await store.add("memberships", { libraryId: c.lib.id, ownerId: S.user.uid, studentId: null, ...r, plan: c.lib.plans?.[0]?.name || "Monthly", joinedOn: today(), status: "active", source: "walk-in", createdAt: Date.now() });
        }
        close(); toast(`Imported ${rows.length} student${rows.length === 1 ? "" : "s"}${errs.length ? `, skipped ${errs.length}` : ""}.`); refresh();
      };
    },
  });
}

// ───────── Dashboard ─────────
export async function dashboard(_, alive) {
  let c = await ctx(); if (!c || !alive()) return;
  const released = await autoRelease(c);
  if (released) { toast(`${released} seat${released > 1 ? "s were" : " was"} freed for non-payment.`); c = await ctx(); }
  const refresh = () => dashboard(_, () => true);
  const { lib } = c;
  const act = activeMembers(c);
  const bySeat = Object.fromEntries(act.map((m) => [m.seat, m]));
  const occupied = Object.keys(c.seats).length;
  const states = act.map((m) => memberState(m, lib));
  const count = (s) => states.filter((x) => x === s).length;
  const mk = monthKey(today());
  const collected = c.pays.filter((p) => p.status === "confirmed" && monthKey(p.paidOn || "") === mk).reduce((a, p) => a + p.amount, 0);
  const expected = act.filter((m) => m.status === "active").reduce((a, m) => a + (+m.fee || 0), 0);
  const claims = c.pays.filter((p) => p.status === "claimed");
  const share = `${location.origin}${location.pathname}#/lib/${lib.id}`;

  main().innerHTML = `
  <section class="wrap">
    <div class="page-head">
      <div><h1>${esc(lib.name)}</h1><p class="muted">${esc(lib.area)}, ${esc(lib.city)} · ${new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</p></div>
      <div class="row">${libSwitcher(c)}<button class="btn small ghost" id="share">Copy booking link</button><button class="btn small" id="add">Add student</button></div>
    </div>
    <div class="kpis">
      <div class="kpi"><span>Seats filled</span><strong>${occupied}<small>/${lib.totalSeats}</small></strong><em>${Math.round((occupied / lib.totalSeats) * 100)}% occupancy</em></div>
      <div class="kpi"><span>Free seats</span><strong>${lib.totalSeats - occupied}</strong><em>${c.wait.length ? `${c.wait.length} on waitlist` : "visible to students"}</em></div>
      <div class="kpi"><span>Collected in ${new Date().toLocaleDateString("en-IN", { month: "long" })}</span><strong>${inr(collected)}</strong><em>of about ${inr(expected)} a month</em></div>
      <div class="kpi ${count("overdue") ? "bad" : ""}"><span>Fees due</span><strong>${count("due") + count("overdue")}</strong><em>${count("overdue")} overdue · ${count("due-soon")} due in ${3} days</em></div>
    </div>

    ${claims.length ? `<div class="panel attention"><div class="row-between"><h2 class="h3">${claims.length} payment${claims.length > 1 ? "s" : ""} to confirm</h2><a href="#/o/payments" class="small">See all</a></div>
      <ul class="claims">${claims.slice(0, 4).map((p) => { const m = c.mems.find((x) => x.id === p.membershipId); return `<li><span><strong>${esc(p.name)}</strong> · seat ${esc(m?.seat || "?")} · ${inr(p.amount)} by ${esc(p.method)} ${p.utr ? `<span class="small muted">ref ${esc(p.utr)}</span>` : ""}${m?.status === "pending" ? ` <span class="chip chip-pending">New booking</span>` : ""}</span>
      <span class="row"><button class="btn small" data-ok="${p.id}">Confirm</button><button class="btn small ghost" data-no="${p.id}">Reject</button></span></li>`; }).join("")}</ul>
      <p class="small muted">Check the amount in your bank or UPI app before confirming.</p></div>` : ""}

    <div class="dash-grid">
      <div>
        <div class="section-head"><h2>Seat map</h2><p class="small muted">Tap a seat to manage it</p></div>
        <div id="omap"></div>
        <div class="legend"><span><i class="sw paid"></i>Paid</span><span><i class="sw due-soon"></i>Due soon</span><span><i class="sw due"></i>Due</span><span><i class="sw overdue"></i>Overdue</span><span><i class="sw held"></i>Awaiting payment</span><span><i class="sw free"></i>Free</span></div>
      </div>
      <aside class="stack">
        <div class="panel"><h2 class="h3">Due this week</h2>
          ${list(act.filter((m) => ["due-soon", "due", "overdue"].includes(memberState(m, lib))).sort((a, b) => (a.nextDue || "").localeCompare(b.nextDue || "")).slice(0, 8))}
          <a class="small" href="#/o/reminders">Send reminders</a></div>
        ${c.wait.length ? `<div class="panel"><h2 class="h3">Waitlist</h2><ul class="mini">${c.wait.map((w) => `<li><span>${esc(w.name)}<br><span class="small muted">${ago(w.createdAt)}</span></span>${w.phone ? `<a class="btn small ghost" target="_blank" rel="noopener" href="${waLink(w.phone, `Hi ${w.name.split(" ")[0]}, a seat is now free at ${lib.name}. Book it here: ${share}`)}">Tell them</a>` : ""}</li>`).join("")}</ul></div>` : ""}
      </aside>
    </div>
  </section>`;

  function list(ms) {
    if (!ms.length) return `<p class="muted small">Nobody is due. Nice.</p>`;
    return `<ul class="mini">${ms.map((m) => `<li><button class="linkish" data-m="${m.id}">${esc(m.name)}</button><span class="small">seat ${esc(m.seat)} · ${fmtShort(m.nextDue)} ${stateChip(memberState(m, lib))}</span></li>`).join("")}</ul>`;
  }

  $("#omap").innerHTML = seatMap({
    total: lib.totalSeats, cols: lib.cols,
    status: (n) => {
      const m = bySeat[n];
      if (m) { const st = memberState(m, lib); return { cls: st === "pending" ? "held" : st, title: `${m.name} — ${STATE_LABEL[st]}`, label: m.name.split(" ")[0] }; }
      if (c.seats[n]) return { cls: "taken", title: "Taken" };
      return { cls: "free", title: "Free" };
    },
    selectable: () => true,
  });
  $$("#omap .seat").forEach((b) => (b.onclick = () => {
    const m = bySeat[b.dataset.seat];
    if (m) return openMember(m, c, refresh);
    if (c.seats[b.dataset.seat]) {
      return confirmBox(`Seat ${b.dataset.seat} is marked taken but has no student record. Free it?`, "Free seat").then(async (ok) => { if (ok) { await store.remove(`libraries/${lib.id}/seats/${b.dataset.seat}`); refresh(); } });
    }
    addMember(c, refresh, b.dataset.seat);
  }));
  $$("[data-m]").forEach((b) => (b.onclick = () => openMember(c.mems.find((m) => m.id === b.dataset.m), c, refresh)));
  $("#add").onclick = () => addMember(c, refresh);
  $("#share").onclick = () => navigator.clipboard?.writeText(share).then(() => toast("Link copied. Share it on WhatsApp or your Google Business profile."));
  bindClaims(c, refresh);
  bindSwitcher();
}

function bindClaims(c, refresh) {
  $$("[data-ok]").forEach((b) => (b.onclick = async () => {
    const p = c.pays.find((x) => x.id === b.dataset.ok); const m = c.mems.find((x) => x.id === p.membershipId);
    if (!m) return toast("Member record is missing.", "err");
    b.disabled = true; const patch = await confirmPayment(p, m, c.lib);
    toast(`Confirmed. ${m.name} is paid until ${fmtDate(patch.nextDue)}.`); refresh();
  }));
  $$("[data-no]").forEach((b) => (b.onclick = async () => {
    const p = c.pays.find((x) => x.id === b.dataset.no); const m = c.mems.find((x) => x.id === p.membershipId);
    const release = m?.status === "pending";
    if (!(await confirmBox(`Reject this payment of ${inr(p.amount)} from ${p.name}?${release ? " Their seat hold will also be released." : ""}`, "Reject", true))) return;
    await store.update(`payments/${p.id}`, { status: "rejected" });
    if (release) { await store.update(`memberships/${m.id}`, { status: "cancelled" }); await store.remove(`libraries/${c.lib.id}/seats/${m.seat}`).catch(() => {}); }
    toast("Payment rejected."); refresh();
  }));
}

// ───────── Members ─────────
export async function members(_, alive) {
  const c = await ctx(); if (!c || !alive()) return;
  const refresh = () => members(_, () => true);
  const st = { f: query().f || "current", q: "" };
  main().innerHTML = `
  <section class="wrap">
    <div class="page-head"><div><h1>Members</h1><p class="muted">${activeMembers(c).length} current · ${c.mems.filter((m) => m.status === "left").length} past</p></div>
      <div class="row">${libSwitcher(c)}<button class="btn small ghost" id="imp">Import list</button><button class="btn small ghost" id="csv">Export</button><button class="btn small" id="add">Add student</button></div></div>
    <div class="filters">
      <input type="search" id="q" placeholder="Search name, phone or seat" aria-label="Search members">
      <div class="seg" role="group" aria-label="Filter">${[["current", "Current"], ["due", "Due & overdue"], ["pending", "Awaiting payment"], ["paid", "Paid"], ["left", "Past"]].map(([k, t]) => `<button data-f="${k}" aria-pressed="${k === st.f}">${t}</button>`).join("")}</div>
    </div>
    <div id="tbl"></div>
  </section>`;
  const rows = () => {
    let r = c.mems.map((m) => ({ ...m, st: memberState(m, c.lib) }));
    r = r.filter((m) => ({
      current: ["active", "pending"].includes(m.status), due: ["due", "overdue", "due-soon"].includes(m.st), pending: m.st === "pending", paid: m.st === "paid", left: ["left", "cancelled"].includes(m.status),
    }[st.f]));
    if (st.q) { const t = st.q.toLowerCase(); r = r.filter((m) => `${m.name} ${m.phone} ${m.seat}`.toLowerCase().includes(t)); }
    return r.sort((a, b) => +a.seat - +b.seat);
  };
  const draw = () => {
    const r = rows();
    $("#tbl").innerHTML = r.length ? `<div class="table-scroll"><table class="data"><thead><tr><th class="num">Seat</th><th>Name</th><th>Mobile</th><th>Plan</th><th class="num">Fee</th><th>Next due</th><th>Status</th></tr></thead><tbody>
      ${r.map((m) => `<tr data-m="${m.id}" tabindex="0"><td class="num"><strong>${esc(m.seat)}</strong></td><td>${esc(m.name)}${m.source === "app" ? ` <span class="tag">online</span>` : ""}</td><td>${esc(m.phone)}</td><td>${esc(m.plan)}</td><td class="num">${inr(m.fee)}</td><td>${fmtDate(m.nextDue)}</td><td>${stateChip(m.st)}</td></tr>`).join("")}
      </tbody></table></div>` : `<div class="empty"><p>No members in this list.</p></div>`;
    $$("#tbl [data-m]").forEach((tr) => { const open = () => openMember(c.mems.find((m) => m.id === tr.dataset.m), c, refresh); tr.onclick = open; tr.onkeydown = (e) => e.key === "Enter" && open(); });
  };
  $("#q").oninput = (e) => { st.q = e.target.value; draw(); };
  $$("[data-f]").forEach((b) => (b.onclick = () => { st.f = b.dataset.f; $$("[data-f]").forEach((x) => x.setAttribute("aria-pressed", x === b)); draw(); }));
  $("#add").onclick = () => addMember(c, refresh);
  $("#imp").onclick = () => importMembers(c, refresh);
  $("#csv").onclick = () => downloadCSV(`${c.lib.name}-members-${today()}.csv`, [["Seat", "Name", "Mobile", "Plan", "Fee", "Joined", "Next due", "Status"], ...c.mems.map((m) => [m.seat, m.name, m.phone, m.plan, m.fee, m.joinedOn, m.nextDue, STATE_LABEL[memberState(m, c.lib)]])]);
  bindSwitcher(); draw();
}

// ───────── Payments ─────────
export async function payments(_, alive) {
  const c = await ctx(); if (!c || !alive()) return;
  const refresh = () => payments(_, () => true);
  const claims = c.pays.filter((p) => p.status === "claimed");
  const months = [...new Set(c.pays.map((p) => monthKey(p.paidOn || today())))].sort().reverse();
  let mon = months[0] || monthKey(today());
  main().innerHTML = `
  <section class="wrap">
    <div class="page-head"><div><h1>Payments</h1><p class="muted">Students pay you directly. Confirm each payment once it shows in your bank or UPI app.</p></div>
      <div class="row">${libSwitcher(c)}</div></div>
    <h2>To confirm ${claims.length ? `(${claims.length})` : ""}</h2>
    ${claims.length ? `<ul class="claims panel">${claims.map((p) => { const m = c.mems.find((x) => x.id === p.membershipId); return `<li><span><strong>${esc(p.name)}</strong> · seat ${esc(m?.seat || "?")} · <strong>${inr(p.amount)}</strong> by ${esc(p.method)} on ${fmtDate(p.paidOn)} ${p.utr ? `<br><span class="small muted">Ref ${esc(p.utr)}</span>` : ""}${m?.status === "pending" ? ` <span class="chip chip-pending">New booking</span>` : ""}</span>
      <span class="row"><button class="btn small" data-ok="${p.id}">Confirm</button><button class="btn small ghost" data-no="${p.id}">Reject</button></span></li>`; }).join("")}</ul>` : `<p class="muted">Nothing waiting.</p>`}
    <div class="row-between"><h2>Received</h2><div class="row"><select id="mon" aria-label="Month">${(months.length ? months : [mon]).map((k) => `<option value="${k}">${monthLabel(k)}</option>`).join("")}</select><button class="btn small ghost" id="csv">Export</button></div></div>
    <div id="rec"></div>
  </section>`;
  const draw = () => {
    const r = c.pays.filter((p) => p.status === "confirmed" && monthKey(p.paidOn || "") === mon).sort((a, b) => (b.paidOn || "").localeCompare(a.paidOn || ""));
    const tot = r.reduce((a, p) => a + p.amount, 0);
    $("#rec").innerHTML = `<p><strong>${inr(tot)}</strong> from ${r.length} payment${r.length === 1 ? "" : "s"}</p>
      ${r.length ? `<div class="table-scroll"><table class="data"><thead><tr><th>Date</th><th>Name</th><th class="num">Seat</th><th class="num">Amount</th><th>Method</th><th>Reference</th></tr></thead><tbody>
      ${r.map((p) => `<tr><td>${fmtDate(p.paidOn)}</td><td>${esc(p.name)}</td><td class="num">${esc(c.mems.find((m) => m.id === p.membershipId)?.seat || "")}</td><td class="num">${inr(p.amount)}</td><td>${esc(p.method)}</td><td class="small">${esc(p.utr)}</td></tr>`).join("")}</tbody></table></div>` : ""}`;
  };
  $("#mon").onchange = (e) => { mon = e.target.value; draw(); };
  $("#csv").onclick = () => downloadCSV(`${c.lib.name}-payments-${mon}.csv`, [["Date", "Name", "Amount", "Method", "Reference", "Status"], ...c.pays.filter((p) => monthKey(p.paidOn || "") === mon).map((p) => [p.paidOn, p.name, p.amount, p.method, p.utr, p.status])]);
  bindClaims(c, refresh); bindSwitcher(); draw();
}

// ───────── Reminders & notices ─────────
export async function reminders(_, alive) {
  const c = await ctx(); if (!c || !alive()) return;
  const refresh = () => reminders(_, () => true);
  const { lib } = c;
  const due = activeMembers(c).filter((m) => m.status === "active" && ["due-soon", "due", "overdue"].includes(memberState(m, lib)))
    .sort((a, b) => (a.nextDue || "").localeCompare(b.nextDue || ""));
  main().innerHTML = `
  <section class="wrap">
    <div class="page-head"><div><h1>Fee reminders</h1><p class="muted">Each button opens WhatsApp or SMS with the message ready — just press send.</p></div><div class="row">${libSwitcher(c)}</div></div>
    <div class="dash-grid">
      <div>
        ${due.length ? `<ul class="rem-list">${due.map((m) => { const msg = fill(lib.reminderTemplate, m, lib); const st = memberState(m, lib); return `
          <li><div><strong>${esc(m.name)}</strong> · seat ${esc(m.seat)} · ${inr(m.fee)}<br><span class="small">${stateChip(st)} due ${fmtDate(m.nextDue)}${m.lastReminderAt ? ` · reminded ${ago(m.lastReminderAt)}` : ""}</span></div>
          <div class="row">${m.phone ? `<a class="btn small" target="_blank" rel="noopener" data-r="${m.id}" href="${waLink(m.phone, msg)}">WhatsApp</a><a class="btn small ghost" data-r="${m.id}" href="${smsLink(m.phone, msg)}">SMS</a>` : `<span class="small muted">No number</span>`}
          ${st === "overdue" ? `<button class="btn small ghost danger-text" data-free="${m.id}">Mark vacant</button>` : ""}</div></li>`; }).join("")}</ul>`
          : `<div class="empty"><p>No fees are due in the next ${3} days.</p></div>`}
      </div>
      <aside class="stack">
        <form class="panel stack" id="tpl"><h2 class="h3">Reminder message</h2>
          <textarea name="t" rows="5">${esc(lib.reminderTemplate || DEFAULT_TEMPLATE)}</textarea>
          <p class="small muted">Use {name}, {seat}, {amount}, {date}, {library} and {upi}.</p>
          <button class="btn small">Save message</button></form>
        <form class="panel stack" id="notice"><h2 class="h3">Post a notice</h2>
          <p class="small muted">Shows on every member's My seat page and your library page.</p>
          <textarea name="n" rows="3" required maxlength="240" placeholder="e.g. Library closed on Sunday for maintenance."></textarea>
          <button class="btn small">Post notice</button>
          ${(lib.notices || []).length ? `<ul class="mini">${lib.notices.slice().reverse().map((n, i) => `<li><span class="small">${esc(n.text)}<br><span class="muted">${ago(n.at)}</span></span><button type="button" class="linkish small" data-del="${lib.notices.length - 1 - i}">Remove</button></li>`).join("")}</ul>` : ""}
        </form>
      </aside>
    </div>
  </section>`;
  $$("[data-r]").forEach((a) => a.addEventListener("click", () => store.update(`memberships/${a.dataset.r}`, { lastReminderAt: Date.now() })));
  $$("[data-free]").forEach((b) => (b.onclick = async () => {
    const m = c.mems.find((x) => x.id === b.dataset.free);
    if (!(await confirmBox(`Mark seat ${m.seat} vacant? ${m.name} hasn't paid since ${fmtDate(m.nextDue)}.`, "Mark vacant", true))) return;
    await releaseSeat(m, lib, "Released for non-payment"); toast(`Seat ${m.seat} is now free.`); refresh();
  }));
  $("#tpl").onsubmit = async (e) => { e.preventDefault(); await store.update(`libraries/${lib.id}`, { reminderTemplate: formData(e.target).t }); toast("Message saved."); refresh(); };
  $("#notice").onsubmit = async (e) => { e.preventDefault(); await store.update(`libraries/${lib.id}`, { notices: [...(lib.notices || []), { at: Date.now(), text: formData(e.target).n }].slice(-10) }); toast("Notice posted."); refresh(); };
  $$("[data-del]").forEach((b) => (b.onclick = async () => { const n = [...lib.notices]; n.splice(+b.dataset.del, 1); await store.update(`libraries/${lib.id}`, { notices: n }); refresh(); }));
  bindSwitcher();
}

// ───────── Reports ─────────
export async function reports(_, alive) {
  const c = await ctx(); if (!c || !alive()) return;
  const { lib } = c;
  const last = [...Array(6)].map((_, i) => monthKey(addMonths(today().slice(0, 8) + "01", i - 5)));
  let mon = last[5];
  main().innerHTML = `
  <section class="wrap report">
    <div class="page-head"><div><h1>Monthly report</h1><p class="muted">${esc(lib.name)}</p></div>
      <div class="row no-print">${libSwitcher(c)}<select id="mon" aria-label="Month">${last.slice().reverse().map((k) => `<option value="${k}">${monthLabel(k)}</option>`).join("")}</select><button class="btn small ghost" id="print">Print / PDF</button></div></div>
    <div id="rep"></div>
  </section>`;
  const draw = () => {
    const conf = c.pays.filter((p) => p.status === "confirmed");
    const inMon = (d) => d && monthKey(d) === mon;
    const got = conf.filter((p) => inMon(p.paidOn)).reduce((a, p) => a + p.amount, 0);
    const act = c.mems.filter((m) => m.status === "active");
    const expected = act.reduce((a, m) => a + (+m.fee || 0), 0);
    const joins = c.mems.filter((m) => inMon(m.joinedOn) && m.status !== "cancelled").length;
    const leaves = c.mems.filter((m) => inMon(m.leftOn)).length;
    const overdue = act.filter((m) => memberState(m, lib) === "overdue");
    const owed = act.filter((m) => ["due", "overdue"].includes(memberState(m, lib))).reduce((a, m) => a + (+m.fee || 0), 0);
    const occ = Object.keys(c.seats).length;
    const series = last.map((k) => ({ k: monthLabel(k), v: conf.filter((p) => p.paidOn && monthKey(p.paidOn) === k).reduce((a, p) => a + p.amount, 0) }));
    const jl = last.map((k) => ({ k: monthLabel(k), j: c.mems.filter((m) => m.joinedOn && monthKey(m.joinedOn) === k && m.status !== "cancelled").length, l: c.mems.filter((m) => m.leftOn && monthKey(m.leftOn) === k).length }));
    const planMix = (lib.plans || []).map((p) => ({ k: p.name, v: act.filter((m) => m.plan === p.name).length }));
    const meth = {}; conf.filter((p) => inMon(p.paidOn)).forEach((p) => (meth[p.method] = (meth[p.method] || 0) + p.amount));
    $("#rep").innerHTML = `
      <div class="kpis">
        <div class="kpi"><span>Collected</span><strong>${inr(got)}</strong><em>${expected ? Math.round((got / expected) * 100) : 0}% of ${inr(expected)} monthly billing</em></div>
        <div class="kpi"><span>Occupancy now</span><strong>${Math.round((occ / lib.totalSeats) * 100)}%</strong><em>${occ} of ${lib.totalSeats} seats</em></div>
        <div class="kpi"><span>Joined / left</span><strong>${joins} / ${leaves}</strong><em>in ${monthLabel(mon)}</em></div>
        <div class="kpi ${overdue.length ? "bad" : ""}"><span>Outstanding</span><strong>${inr(owed)}</strong><em>${overdue.length} overdue member${overdue.length === 1 ? "" : "s"}</em></div>
      </div>
      <div class="grid2 charts">
        <div class="panel"><h2 class="h3">Collection, last 6 months</h2>${barChart(series, { money: true })}</div>
        <div class="panel"><h2 class="h3">New joins vs leavers</h2>
          <div class="pairs">${jl.map((x) => `<div><span class="pj" style="height:${x.j * 8 + 2}px" title="${x.j} joined"></span><span class="pl" style="height:${x.l * 8 + 2}px" title="${x.l} left"></span><small>${x.k}</small></div>`).join("")}</div>
          <p class="legend"><span><i class="sw paid"></i>Joined</span><span><i class="sw overdue"></i>Left</span></p></div>
        <div class="panel"><h2 class="h3">Members by plan</h2>${barChart(planMix, { height: 120 })}</div>
        <div class="panel"><h2 class="h3">How students paid (${monthLabel(mon)})</h2>
          ${Object.keys(meth).length ? `<table class="plain"><tbody>${Object.entries(meth).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${inr(v)}</td><td class="num muted">${Math.round((v / got) * 100)}%</td></tr>`).join("")}</tbody></table>` : `<p class="muted">No payments this month.</p>`}</div>
      </div>
      <h2>Overdue members</h2>
      ${overdue.length ? `<table class="data"><thead><tr><th class="num">Seat</th><th>Name</th><th>Mobile</th><th>Due since</th><th class="num">Days</th><th class="num">Fee</th></tr></thead><tbody>
        ${overdue.map((m) => `<tr><td class="num">${esc(m.seat)}</td><td>${esc(m.name)}</td><td>${esc(m.phone)}</td><td>${fmtDate(m.nextDue)}</td><td class="num">${daysBetween(m.nextDue, today())}</td><td class="num">${inr(m.fee)}</td></tr>`).join("")}</tbody></table>` : `<p class="muted">None.</p>`}`;
  };
  $("#mon").onchange = (e) => { mon = e.target.value; draw(); };
  $("#print").onclick = () => window.print();
  bindSwitcher(); draw();
}

// ───────── Library setup / settings ─────────
export async function setup(_, alive) {
  const libs = await store.list("libraries", "ownerId", S.user.uid);
  if (!alive()) return;
  const adding = query().new === "1";
  if (libs.length && !adding) return go("#/o/dash");
  libraryForm(null, !libs.length);
}
export async function settings(_, alive) {
  const c = await ctx(); if (!c || !alive()) return;
  libraryForm(c.lib, false, c);
}

function libraryForm(lib, first, c) {
  const L = lib || { plans: [{ name: "Full day", hours: "6 AM – 10 PM", price: "" }], facilities: [], billing: "joining", dueDay: 5, graceDays: 5, autoReleaseDays: 0, cols: 8, city: S.profile?.city || "", phone: S.profile?.phone || "", payeeName: S.profile?.name || "", bank: {} };
  let pos = lib?.lat ? { lat: lib.lat, lng: lib.lng } : null;
  main().innerHTML = `
  <section class="wrap narrow-wide">
    <div class="page-head"><div><h1>${lib ? "Library settings" : first ? "Add your library" : "Add another library"}</h1>
      <p class="muted">${lib ? "Changes show to students right away." : "Students will see this when they search. You can change everything later."}</p></div>
      ${c ? `<div class="row">${libSwitcher(c)}<a class="btn small ghost" href="#/o/setup?new=1">Add another library</a></div>` : ""}</div>
    <form id="lf" class="stack">
      <fieldset class="panel stack"><legend>Basics</legend>
        <div class="field"><label>Library name</label><input name="name" required value="${esc(L.name)}" placeholder="e.g. Saraswati Self Study Library"></div>
        <div class="grid2"><div class="field"><label>Contact number</label><input name="phone" required inputmode="numeric" pattern="[0-9]{10}" maxlength="10" value="${esc(L.phone)}"></div>
        <div class="field"><label>Opening hours</label><input name="hours" required value="${esc(L.hours)}" placeholder="e.g. 6 AM – 10 PM or Open 24×7"></div></div>
        <div class="field"><label>About your library <span class="muted">(optional)</span></label><textarea name="about" rows="3" maxlength="400" placeholder="What makes it a good place to study?">${esc(L.about)}</textarea></div>
      </fieldset>

      <fieldset class="panel stack"><legend>Location</legend>
        <div class="field"><label>Full address</label><input name="address" required value="${esc(L.address)}"></div>
        <div class="grid2"><div class="field"><label>Area / locality</label><input name="area" required value="${esc(L.area)}"></div>
        <div class="field"><label>City</label><input name="city" required value="${esc(L.city)}"></div></div>
        <div class="row"><button type="button" class="btn small ghost" id="here">I'm at the library — use my location</button><button type="button" class="btn small ghost" id="findaddr">Find address on map</button><span class="small muted" id="locmsg">${pos ? "Pin set." : "Tap the map to drop a pin on your library."}</span></div>
        <div id="pickmap" class="mapbox small"></div>
      </fieldset>

      <fieldset class="panel stack"><legend>Seats</legend>
        <div class="grid2"><div class="field"><label>Total seats</label><input name="totalSeats" type="number" min="1" max="400" required value="${esc(L.totalSeats)}"></div>
        <div class="field"><label>Seats per row</label><input name="cols" type="number" min="2" max="16" required value="${esc(L.cols)}"><small>Used to draw your seat map like your hall.</small></div></div>
      </fieldset>

      <fieldset class="panel stack"><legend>Plans and monthly fees</legend>
        <div id="plans"></div>
        <button type="button" class="btn small ghost" id="addplan">Add a plan</button>
      </fieldset>

      <fieldset class="panel"><legend>Facilities</legend>
        <div class="check-grid">${FACILITIES.map((f) => `<label class="check"><input type="checkbox" name="fac" value="${esc(f)}" ${(L.facilities || []).includes(f) ? "checked" : ""}> ${esc(f)}</label>`).join("")}</div>
      </fieldset>

      <fieldset class="panel stack"><legend>Where students pay you</legend>
        <p class="small muted">Students pay you directly — SeatSathi never touches the money. Add at least a UPI ID.</p>
        <div class="grid2"><div class="field"><label>UPI ID</label><input name="upi" required value="${esc(L.upi)}" placeholder="name@okaxis"></div>
        <div class="field"><label>Name shown on UPI</label><input name="payeeName" value="${esc(L.payeeName)}"></div></div>
        <details ${L.bank?.acc ? "open" : ""}><summary>Bank account for transfers (optional)</summary>
          <div class="grid2"><div class="field"><label>Account holder</label><input name="holder" value="${esc(L.bank?.holder)}"></div><div class="field"><label>Bank name</label><input name="bankname" value="${esc(L.bank?.bank)}"></div></div>
          <div class="grid2"><div class="field"><label>Account number</label><input name="acc" value="${esc(L.bank?.acc)}" inputmode="numeric"></div><div class="field"><label>IFSC</label><input name="ifsc" value="${esc(L.bank?.ifsc)}" pattern="[A-Za-z]{4}0[A-Za-z0-9]{6}"></div></div>
        </details>
      </fieldset>

      <fieldset class="panel stack"><legend>Fee collection rules</legend>
        <label class="radio-row"><input type="radio" name="billing" value="joining" ${L.billing !== "fixed" ? "checked" : ""}><span><strong>Each student pays on their joining date</strong><br><span class="small muted">Joined on the 12th → due on the 12th every month</span></span></label>
        <label class="radio-row"><input type="radio" name="billing" value="fixed" ${L.billing === "fixed" ? "checked" : ""}><span><strong>Everyone pays on the same date</strong><br><span class="small muted">Due on <select name="dueDay" aria-label="Due day">${[...Array(28)].map((_, i) => `<option value="${i + 1}" ${+L.dueDay === i + 1 ? "selected" : ""}>${ord(i + 1)}</option>`).join("")}</select> of every month</span></span></label>
        <div class="grid2"><div class="field"><label>Grace period (days after due date)</label><input name="graceDays" type="number" min="0" max="30" value="${esc(L.graceDays ?? 5)}"><small>After this, a member shows as overdue.</small></div>
        <div class="field"><label>Free overdue seats automatically after</label><select name="autoReleaseDays">${[[0, "Never — I'll do it myself"], [7, "7 days overdue"], [10, "10 days overdue"], [15, "15 days overdue"], [30, "30 days overdue"]].map(([v, t]) => `<option value="${v}" ${+L.autoReleaseDays === v ? "selected" : ""}>${t}</option>`).join("")}</select><small>Checked each time you open your dashboard.</small></div></div>
      </fieldset>

      ${lib ? `<fieldset class="panel stack"><legend>Listing</legend>
        <label class="check"><input type="checkbox" name="hidden" ${lib.status === "hidden" ? "checked" : ""}> Hide my library from search (existing members are not affected)</label></fieldset>` : ""}

      <div class="row-end"><button class="btn big">${lib ? "Save changes" : "Publish library"}</button></div>
    </form>
  </section>`;

  const plans = [...(L.plans || [])];
  const drawPlans = () => {
    $("#plans").innerHTML = plans.map((p, i) => `<div class="plan-row">
      <input aria-label="Plan name" data-i="${i}" data-k="name" required value="${esc(p.name)}" placeholder="Plan name, e.g. Morning">
      <input aria-label="Timing" data-i="${i}" data-k="hours" value="${esc(p.hours)}" placeholder="Timing, e.g. 6 AM – 2 PM">
      <input aria-label="Monthly fee" data-i="${i}" data-k="price" type="number" min="0" required value="${esc(p.price)}" placeholder="₹ / month">
      ${plans.length > 1 ? `<button type="button" class="linkish small" data-rm="${i}">Remove</button>` : "<span></span>"}</div>`).join("");
    $$("#plans input").forEach((inp) => (inp.oninput = () => (plans[+inp.dataset.i][inp.dataset.k] = inp.value)));
    $$("[data-rm]").forEach((b) => (b.onclick = () => { plans.splice(+b.dataset.rm, 1); drawPlans(); }));
  };
  drawPlans();
  $("#addplan").onclick = () => { plans.push({ name: "", hours: "", price: "" }); drawPlans(); };
  let map;
  drawMap($("#pickmap"), [], { center: pos || { lat: 26.9124, lng: 75.7873 }, zoom: pos ? 16 : 12, onPick: (p) => { pos = p; $("#locmsg").textContent = "Pin set."; } }).then((m) => (map = m)).catch(() => { mapFail($("#pickmap")); $("#locmsg").textContent = "Map unavailable — use “I'm at the library” to set the location."; });
  $("#here").onclick = async () => { try { const p = await getPosition(); if (map) map._setPick(p); else { pos = p; $("#locmsg").textContent = "Location saved."; } } catch (e) { toast(e.message, "err"); } };
  $("#findaddr").onclick = async () => {
    const q = [$("[name=address]").value, $("[name=area]").value, $("[name=city]").value].filter(Boolean).join(", ");
    if (!q) return toast("Type the address first.", "err");
    try {
      const r = await (await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=in&q=${encodeURIComponent(q)}`)).json();
      if (!r[0]) { const r2 = await (await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=in&q=${encodeURIComponent($("[name=area]").value + ", " + $("[name=city]").value)}`)).json(); if (!r2[0]) return toast("Couldn't find that address. Tap the map instead.", "err"); r[0] = r2[0]; }
      map?._setPick({ lat: +r[0].lat, lng: +r[0].lon }); toast("Pin placed — drag it to the exact spot.");
    } catch { toast("Address search is unavailable. Tap the map instead.", "err"); }
  };
  bindSwitcher();

  $("#lf").onsubmit = async (e) => {
    e.preventDefault();
    const f = formData(e.target);
    if (!pos) return toast("Drop a pin on the map so students can find you.", "err");
    const clean = plans.filter((p) => p.name && +p.price > 0).map((p) => ({ name: p.name.trim(), hours: (p.hours || "").trim(), price: +p.price }));
    if (!clean.length) return toast("Add at least one plan with a fee.", "err");
    const total = +f.totalSeats;
    if (c && Object.keys(c.seats).some((s) => +s > total)) return toast(`Some seats above ${total} are occupied. Free them first.`, "err");
    const data = {
      name: f.name, phone: f.phone, hours: f.hours, about: f.about || "", address: f.address, area: f.area, city: f.city,
      lat: pos.lat, lng: pos.lng, totalSeats: total, cols: +f.cols, plans: clean, facilities: [].concat(f.fac || []),
      upi: f.upi, payeeName: f.payeeName || f.name, bank: { holder: f.holder || "", bank: f.bankname || "", acc: f.acc || "", ifsc: (f.ifsc || "").toUpperCase() },
      billing: f.billing, dueDay: +f.dueDay || 1, graceDays: +f.graceDays || 0, autoReleaseDays: +f.autoReleaseDays || 0,
    };
    e.submitter.disabled = true;
    try {
      if (lib) {
        data.status = f.hidden ? "hidden" : lib.status === "hidden" ? "active" : lib.status || "active";
        await store.update(`libraries/${lib.id}`, data);
        toast("Library saved."); settings({}, () => true);
      } else {
        const id = await store.add("libraries", { ...data, ownerId: S.user.uid, status: "active", notices: [], createdAt: Date.now() });
        localStorage.setItem("ss_lib", id);
        toast("Your library is live. Add your current students next.");
        go("#/o/members");
      }
    } catch (err) { e.submitter.disabled = false; toast(err.message, "err"); }
  };
}
