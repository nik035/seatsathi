import { store } from "./store.js";
import { main } from "./app.js";
import { $, $$, esc, inr, toast, today, addDays, addMonths, monthKey, monthLabel, barChart, downloadCSV, fmtDate, iso, confirmBox } from "./util.js";

export async function dashboard(_, alive) {
  const [users, libs, mems, pays, seats, reviews, visits] = await Promise.all([
    store.list("users"), store.list("libraries"), store.list("memberships"), store.list("payments"),
    store.group("seats"), store.list("reviews"), store.list("visits").catch(() => []),
  ]);
  if (!alive()) return;
  const students = users.filter((u) => u.role === "student");
  const owners = users.filter((u) => u.role === "owner");
  const totalSeats = libs.reduce((a, l) => a + (+l.totalSeats || 0), 0);
  const occ = {}; seats.forEach((s) => { const id = s.libraryId || s._path.split("/")[1]; occ[id] = (occ[id] || 0) + 1; });
  const occupied = Object.values(occ).reduce((a, b) => a + b, 0);
  const conf = pays.filter((p) => p.status === "confirmed");
  const mk = monthKey(today());
  const gmvMonth = conf.filter((p) => p.paidOn && monthKey(p.paidOn) === mk).reduce((a, p) => a + p.amount, 0);
  const online = mems.filter((m) => m.source === "app");
  const months = [...Array(6)].map((_, i) => monthKey(addMonths(today().slice(0, 8) + "01", i - 5)));
  const byMonth = (arr, f) => months.map((k) => ({ k: monthLabel(k), v: arr.filter((x) => { const d = f(x); return d && monthKey(d) === k; }).length }));
  const msDate = (ms) => (ms ? iso(ms) : null);
  const days = [...Array(14)].map((_, i) => addDays(today(), i - 13));
  const visitSeries = days.map((d) => ({ k: d.slice(8), v: visits.filter((v) => v.day === d).length }));
  const cities = {};
  libs.forEach((l) => { const c = (cities[l.city] ??= { libs: 0, seats: 0, occ: 0, students: 0 }); c.libs++; c.seats += +l.totalSeats || 0; c.occ += occ[l.id] || 0; });
  students.forEach((u) => { if (u.city) (cities[u.city] ??= { libs: 0, seats: 0, occ: 0, students: 0 }).students++; });
  const ownerName = Object.fromEntries(users.map((u) => [u.id, u.name]));
  const memCount = {}; mems.filter((m) => m.status === "active").forEach((m) => (memCount[m.libraryId] = (memCount[m.libraryId] || 0) + 1));

  main().innerHTML = `
  <section class="wrap">
    <div class="page-head"><div><h1>Admin</h1><p class="muted">Everything happening on SeatSathi, as of ${fmtDate(today())}.</p></div>
      <div class="row"><button class="btn small ghost" id="xu">Export users</button><button class="btn small ghost" id="xl">Export libraries</button></div></div>
    <div class="kpis six">
      <div class="kpi"><span>Libraries listed</span><strong>${libs.length}</strong><em>${owners.length} owner accounts</em></div>
      <div class="kpi"><span>Students signed up</span><strong>${students.length}</strong><em>${students.filter((u) => u.news?.on).length} subscribed to news</em></div>
      <div class="kpi"><span>Seats on platform</span><strong>${totalSeats}</strong><em>${totalSeats ? Math.round((occupied / totalSeats) * 100) : 0}% occupied</em></div>
      <div class="kpi"><span>Online bookings</span><strong>${online.length}</strong><em>${mems.filter((m) => m.status === "pending").length} awaiting payment</em></div>
      <div class="kpi"><span>Fees confirmed this month</span><strong>${inr(gmvMonth)}</strong><em>${inr(conf.reduce((a, p) => a + p.amount, 0))} all time</em></div>
      <div class="kpi"><span>Visitors today</span><strong>${visits.filter((v) => v.day === today()).length}</strong><em>${visits.filter((v) => days.includes(v.day)).length} in 14 days</em></div>
    </div>
    <div class="grid2 charts">
      <div class="panel"><h2 class="h3">Daily visitors, last 14 days</h2>${barChart(visitSeries, { height: 140 })}</div>
      <div class="panel"><h2 class="h3">Student sign-ups by month</h2>${barChart(byMonth(students, (u) => msDate(u.createdAt)), { height: 140 })}</div>
      <div class="panel"><h2 class="h3">New libraries by month</h2>${barChart(byMonth(libs, (l) => msDate(l.createdAt)), { height: 140 })}</div>
      <div class="panel"><h2 class="h3">Online bookings by month</h2>${barChart(byMonth(online, (m) => msDate(m.createdAt)), { height: 140 })}</div>
    </div>

    <h2>By city</h2>
    <div class="table-scroll"><table class="data"><thead><tr><th>City</th><th class="num">Libraries</th><th class="num">Seats</th><th class="num">Occupied</th><th class="num">Students</th></tr></thead><tbody>
      ${Object.entries(cities).sort((a, b) => b[1].libs - a[1].libs || b[1].students - a[1].students).map(([c, v]) => `<tr><td>${esc(c)}</td><td class="num">${v.libs}</td><td class="num">${v.seats}</td><td class="num">${v.seats ? Math.round((v.occ / v.seats) * 100) + "%" : "—"}</td><td class="num">${v.students}</td></tr>`).join("")}
    </tbody></table></div>

    <h2>Libraries</h2>
    <div class="table-scroll"><table class="data"><thead><tr><th>Library</th><th>City</th><th>Owner</th><th class="num">Seats</th><th class="num">Filled</th><th class="num">Members</th><th class="num">Rating</th><th>Listed</th><th>Status</th></tr></thead><tbody>
      ${libs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).map((l) => { const rs = reviews.filter((r) => r.libraryId === l.id); return `<tr>
        <td><a href="#/lib/${l.id}">${esc(l.name)}</a></td><td>${esc(l.city)}</td><td>${esc(ownerName[l.ownerId] || "—")}</td>
        <td class="num">${l.totalSeats}</td><td class="num">${occ[l.id] || 0}</td><td class="num">${memCount[l.id] || 0}</td>
        <td class="num">${rs.length ? (rs.reduce((a, r) => a + r.rating, 0) / rs.length).toFixed(1) : "—"}</td><td>${l.createdAt ? fmtDate(iso(l.createdAt)) : "—"}</td>
        <td><button class="btn small ghost ${l.status === "suspended" ? "" : "danger-text"}" data-sus="${l.id}" data-on="${l.status === "suspended" ? 1 : 0}">${l.status === "suspended" ? "Restore" : "Suspend"}</button></td></tr>`; }).join("")}
    </tbody></table></div>

    <h2>Newest users</h2>
    <div class="table-scroll"><table class="data"><thead><tr><th>Name</th><th>Email</th><th>Type</th><th>City</th><th>Preparing for</th><th>Joined</th></tr></thead><tbody>
      ${users.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 25).map((u) => `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${esc(u.role)}</td><td>${esc(u.city)}</td><td>${esc(u.exam || "")}</td><td>${u.createdAt ? fmtDate(iso(u.createdAt)) : "—"}</td></tr>`).join("")}
    </tbody></table></div>
  </section>`;

  $$("[data-sus]").forEach((b) => (b.onclick = async () => {
    const restore = b.dataset.on === "1";
    if (!restore && !(await confirmBox("Suspend this library? It disappears from search until restored.", "Suspend", true))) return;
    await store.update(`libraries/${b.dataset.sus}`, { status: restore ? "active" : "suspended" });
    toast(restore ? "Library restored." : "Library suspended."); dashboard(_, () => true);
  }));
  $("#xu").onclick = () => downloadCSV(`seatsathi-users-${today()}.csv`, [["Name", "Email", "Role", "Phone", "City", "Exam", "Joined"], ...users.map((u) => [u.name, u.email, u.role, u.phone, u.city, u.exam, u.createdAt ? iso(u.createdAt) : ""])]);
  $("#xl").onclick = () => downloadCSV(`seatsathi-libraries-${today()}.csv`, [["Name", "City", "Area", "Owner", "Phone", "Seats", "Occupied", "Status"], ...libs.map((l) => [l.name, l.city, l.area, ownerName[l.ownerId], l.phone, l.totalSeats, occ[l.id] || 0, l.status])]);
}
