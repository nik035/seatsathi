// Seat map: a grid of desks laid out like the actual hall (with a centre aisle).
import { esc } from "./util.js";

/**
 * @param {object} o
 *  total, cols         — layout
 *  status(no)          — returns { cls, label, title } for each seat number
 *  selectable(no)      — whether the seat is clickable
 *  selected            — seat number currently picked
 */
export function seatMap({ total, cols = 8, status, selectable = () => false, selected = null, compact = false }) {
  cols = Math.max(2, Math.min(16, Number(cols) || 8));
  const aisleAfter = cols >= 6 ? Math.ceil(cols / 2) : 0;
  const cells = [];
  for (let n = 1; n <= total; n++) {
    const no = String(n);
    const st = status(no) || { cls: "free" };
    const can = selectable(no);
    const col = (n - 1) % cols;
    const sel = selected === no;
    cells.push(`<button type="button" class="seat ${st.cls} ${sel ? "sel" : ""}"
      data-seat="${no}" ${can ? "" : "disabled"} aria-pressed="${sel}"
      aria-label="Seat ${no}${st.title ? ", " + esc(st.title) : ""}" title="Seat ${no}${st.title ? " — " + esc(st.title) : ""}">
      <span class="seat-no">${no}</span>${st.label ? `<span class="seat-tag">${esc(st.label)}</span>` : ""}</button>`);
    if (aisleAfter && col === aisleAfter - 1) cells.push(`<span class="aisle-gap" aria-hidden="true"></span>`);
  }
  return `<div class="hall ${compact ? "compact" : ""}">
    <div class="hall-front">Entrance &amp; reception</div>
    <div class="seats" style="--cols:${cols};grid-template-columns:${aisleAfter ? `repeat(${aisleAfter}, minmax(38px,1fr)) 14px repeat(${cols - aisleAfter}, minmax(38px,1fr))` : `repeat(${cols}, minmax(38px,1fr))`}">${cells.join("")}</div></div>`;
}

export function seatGridDemo() {
  const held = new Set(["7", "30"]);
  const free = new Set(["3", "9", "14", "18", "22", "27", "33", "38", "41", "45", "47"]);
  return seatMap({
    total: 48, cols: 8, compact: true,
    status: (n) => (held.has(n) ? { cls: "held", title: "On hold" } : free.has(n) ? { cls: "free", title: "Free" } : { cls: "taken", title: "Taken" }),
  });
}
