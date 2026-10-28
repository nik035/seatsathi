import { DUE_SOON_DAYS } from "./config.js";

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ── Dates (all stored as YYYY-MM-DD in local time) ──
export const iso = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};
export const today = () => iso(new Date());
export const parse = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
export function addMonths(s, n) {
  const d = parse(s); const day = d.getDate();
  d.setDate(1); d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last)); return iso(d);
}
export const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
export function nextFixedDue(fromIso, dueDay) {
  const d = parse(fromIso);
  let c = new Date(d.getFullYear(), d.getMonth(), Math.min(dueDay, 28));
  if (c <= d) c = new Date(d.getFullYear(), d.getMonth() + 1, Math.min(dueDay, 28));
  return iso(c);
}
export const fmtDate = (s) => s ? parse(s).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";
export const fmtShort = (s) => s ? parse(s).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—";
export const monthKey = (s) => s.slice(0, 7);
export const monthLabel = (k) => { const [y, m] = k.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "2-digit" }); };
export const ago = (ms) => {
  const s = Math.max(1, Math.round((Date.now() - ms) / 1000));
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
};

export const inr = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");

// ── Membership state ──
// nextDue = the date the next payment falls due
export function memberState(m, lib) {
  if (m.status === "pending") return "pending";
  if (m.status === "left" || m.status === "cancelled") return m.status;
  if (!m.nextDue) return "due";
  const d = daysBetween(today(), m.nextDue);
  if (d > DUE_SOON_DAYS) return "paid";
  if (d >= 0) return "due-soon";
  return -d <= (lib?.graceDays ?? 5) ? "due" : "overdue";
}
export const STATE_LABEL = {
  paid: "Paid", "due-soon": "Due soon", due: "Due", overdue: "Overdue",
  pending: "Awaiting payment", left: "Left", cancelled: "Cancelled",
};
export const stateChip = (st) => `<span class="chip chip-${st}">${STATE_LABEL[st] || st}</span>`;

// ── Geo ──
export function km(a, b) {
  if (!a?.lat || !b?.lat) return null;
  const R = 6371, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export const fmtKm = (d) => d == null ? "" : d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(1)} km`;
export function getPosition() {
  return new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error("Location isn't available in this browser."));
    navigator.geolocation.getCurrentPosition(
      (p) => res({ lat: +p.coords.latitude.toFixed(5), lng: +p.coords.longitude.toFixed(5) }),
      () => rej(new Error("Location permission was denied. Type your city instead.")),
      { timeout: 10000, maximumAge: 600000 }
    );
  });
}

// ── Contact links ──
export const cleanPhone = (p) => { const d = String(p || "").replace(/\D/g, ""); return d.length === 10 ? "91" + d : d; };
export const waLink = (phone, text) => `https://wa.me/${cleanPhone(phone)}?text=${encodeURIComponent(text)}`;
export const smsLink = (phone, text) => `sms:+${cleanPhone(phone)}?body=${encodeURIComponent(text)}`;
export const upiLink = ({ upi, name, amount, note }) =>
  `upi://pay?pa=${encodeURIComponent(upi)}&pn=${encodeURIComponent(name)}&am=${amount}&cu=INR&tn=${encodeURIComponent(note).slice(0, 80)}`;

// ── UI helpers ──
export function toast(msg, kind = "ok") {
  let t = $("#toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; t.setAttribute("role", "status"); document.body.append(t); }
  t.textContent = msg; t.className = `show ${kind}`;
  clearTimeout(t._h); t._h = setTimeout(() => (t.className = ""), 3200);
}

export function modal(html, { onMount, wide } = {}) {
  const wrap = document.createElement("div");
  wrap.className = "modal-wrap";
  wrap.innerHTML = `<div class="modal ${wide ? "wide" : ""}" role="dialog" aria-modal="true">
    <button class="modal-x" aria-label="Close">×</button>${html}</div>`;
  const close = () => { wrap.remove(); document.removeEventListener("keydown", onKey); };
  const onKey = (e) => e.key === "Escape" && close();
  wrap.addEventListener("click", (e) => { if (e.target === wrap || e.target.classList.contains("modal-x")) close(); });
  document.addEventListener("keydown", onKey);
  document.body.append(wrap);
  onMount?.(wrap.querySelector(".modal"), close);
  wrap.querySelector("input,select,textarea,button:not(.modal-x)")?.focus();
  return close;
}

export function confirmBox(text, okLabel = "Confirm", danger = false) {
  return new Promise((res) => {
    modal(`<p class="confirm-text">${esc(text)}</p>
      <div class="row-end"><button class="btn ghost" data-no>Cancel</button>
      <button class="btn ${danger ? "danger" : ""}" data-yes>${esc(okLabel)}</button></div>`, {
      onMount(el, close) {
        el.querySelector("[data-no]").onclick = () => { close(); res(false); };
        el.querySelector("[data-yes]").onclick = () => { close(); res(true); };
      },
    });
  });
}

export function formData(form) {
  const o = {};
  for (const [k, v] of new FormData(form)) {
    if (k in o) o[k] = [].concat(o[k], v); else o[k] = typeof v === "string" ? v.trim() : v;
  }
  return o;
}

export function downloadCSV(name, rows) {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" }));
  a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export const FACILITIES = [
  "AC", "Wi-Fi", "Power socket at desk", "Personal locker", "Drinking water (RO)", "CCTV",
  "Washroom", "Separate girls' section", "Parking", "Newspapers & magazines", "Silent zone",
  "Discussion room", "Tea/coffee", "Power backup", "Charging point", "Open 24×7",
];

// Simple SVG bar chart (no library)
export function barChart(series, { money = false, height = 160 } = {}) {
  const max = Math.max(1, ...series.map((s) => s.v));
  const w = 100 / series.length;
  return `<div class="bars" style="height:${height}px">${series.map((s) => `
    <div class="bar" style="width:${w}%" title="${esc(s.k)}: ${money ? inr(s.v) : s.v}">
      <span class="bar-v">${money ? (s.v >= 1000 ? "₹" + (s.v / 1000).toFixed(s.v >= 10000 ? 0 : 1) + "k" : inr(s.v)) : s.v}</span>
      <span class="bar-fill" style="height:${(s.v / max) * 100}%"></span>
      <span class="bar-k">${esc(s.k)}</span>
    </div>`).join("")}</div>`;
}
