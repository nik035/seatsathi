import { store } from "./store.js";
import { S, main, go } from "./app.js";
import { NEWS_CITIES, NEWS_COUNTRIES, NEWS_TOPICS } from "./config.js";
import { $, $$, esc, toast, waLink } from "./util.js";

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const DAY = 86400000;

async function prebuilt(key) {
  const r = await fetch(`news/${key}.json?t=${Math.floor(Date.now() / 600000)}`);
  if (!r.ok) throw new Error("not built");
  return r.json();
}

// Live Google News search through a public CORS relay (for local areas and custom searches)
async function live(q) {
  const rss = `https://news.google.com/rss/search?q=${encodeURIComponent(q + " when:1d")}&hl=en-IN&gl=IN&ceid=IN:en`;
  const relays = [
    (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
    (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
  ];
  for (const relay of relays) {
    try {
      const ctl = new AbortController(); setTimeout(() => ctl.abort(), 9000);
      const txt = await (await fetch(relay(rss), { signal: ctl.signal })).text();
      const xml = new DOMParser().parseFromString(txt, "text/xml");
      const items = [...xml.querySelectorAll("item")].map((it) => ({
        t: it.querySelector("title")?.textContent || "", l: it.querySelector("link")?.textContent || "",
        s: it.querySelector("source")?.textContent || "", p: Date.parse(it.querySelector("pubDate")?.textContent || "") || 0,
      }));
      if (items.length || xml.querySelector("channel")) return { label: q, items, updated: Date.now() };
    } catch {}
  }
  throw new Error("Live search is unavailable right now.");
}

export async function page() {
  const role = S.profile?.role;
  const isStudent = role === "student";
  const sub = S.profile?.news || { on: false, scope: "city", place: S.profile?.city || "" };
  const canRead = !isStudent || sub.on || !S.user;
  const st = {
    scope: sub.scope || "city",
    place: sub.place || S.profile?.city || "Jaipur",
    country: "India", topic: NEWS_TOPICS[0], q: "",
  };
  if (!NEWS_CITIES.includes(st.place) && st.scope === "city") st.scope = "local";

  main().innerHTML = `
  <section class="wrap news">
    <div class="page-head">
      <div><h1>Current affairs</h1><p class="muted">Headlines from the last 24 hours, refreshed every few hours from Google News.</p></div>
      ${isStudent ? `<label class="switch"><input type="checkbox" id="subsw" ${sub.on ? "checked" : ""}><span>${sub.on ? "Subscribed" : "Subscribe — free"}</span></label>` : ""}
    </div>
    ${isStudent && !sub.on ? `<div class="panel sub-pitch"><h2 class="h3">Get a daily current affairs feed</h2>
      <p>Subscribe to read the last 24 hours of news for your area, your city, India or the world — handy for prelims and interviews. It's free.</p>
      <button class="btn" id="subgo">Subscribe</button></div>` : ""}
    ${!S.user ? `<div class="notice">Showing a preview. <a href="#/login?as=student">Sign in as a student</a> to subscribe and filter by your locality.</div>` : ""}
    ${canRead ? `
    <div class="seg scope" role="group" aria-label="News scope">
      ${[["local", "My area"], ["city", "City"], ["country", "Country"], ["world", "World"], ["topic", "Topics"]].map(([k, t]) => `<button data-scope="${k}" aria-pressed="${k === st.scope}">${t}</button>`).join("")}
    </div>
    <div class="filters" id="nf"></div>
    <div id="feed" aria-live="polite"></div>` : ""}
  </section>`;

  const save = async (patch) => {
    if (!isStudent) return;
    const news = { ...(S.profile.news || {}), ...patch };
    await store.set(`users/${S.user.uid}`, { news }); S.profile.news = news;
  };
  const toggleSub = async (on) => { await save({ on, scope: st.scope, place: st.place }); toast(on ? "Subscribed to current affairs." : "Unsubscribed."); page(); };
  $("#subsw")?.addEventListener("change", (e) => toggleSub(e.target.checked));
  $("#subgo")?.addEventListener("click", () => toggleSub(true));
  if (!canRead) return;

  const filters = () => {
    const f = $("#nf");
    if (st.scope === "local") f.innerHTML = `<input id="nplace" value="${esc(localQuery())}" aria-label="Area"><button class="btn small" id="ngo">Show news</button>`;
    else if (st.scope === "city") f.innerHTML = `<select id="ncity" aria-label="City">${NEWS_CITIES.map((c) => `<option ${c === st.place ? "selected" : ""}>${c}</option>`).join("")}</select>
      <input id="nq" placeholder="Other city or topic…" aria-label="Search another place"><button class="btn small ghost" id="ngo">Search</button>`;
    else if (st.scope === "country") f.innerHTML = `<select id="nctry" aria-label="Country">${NEWS_COUNTRIES.map((c) => `<option ${c === st.country ? "selected" : ""}>${c}</option>`).join("")}</select>`;
    else if (st.scope === "topic") f.innerHTML = `<div class="chips">${NEWS_TOPICS.map((t) => `<button class="chip-btn" data-topic="${esc(t)}" aria-pressed="${t === st.topic}">${esc(t)}</button>`).join("")}</div>`;
    else f.innerHTML = "";
    $("#ncity")?.addEventListener("change", (e) => { st.place = e.target.value; save({ place: st.place, scope: "city" }); load(); });
    $("#nctry")?.addEventListener("change", (e) => { st.country = e.target.value; load(); });
    $$("[data-topic]").forEach((b) => (b.onclick = () => { st.topic = b.dataset.topic; $$("[data-topic]").forEach((x) => x.setAttribute("aria-pressed", x === b)); load(); }));
    $("#ngo")?.addEventListener("click", () => {
      if (st.scope === "local") { st.q = $("#nplace").value.trim(); load(); }
      else { const q = $("#nq").value.trim(); if (q) { st.q = q; load(true); } }
    });
    $("#nplace, #nq")?.addEventListener("keydown", (e) => e.key === "Enter" && $("#ngo").click());
  };
  const localQuery = () => st.q || [S.profile?.area, S.profile?.city].filter(Boolean).join(" ") || st.place;

  async function load(custom = false) {
    const feed = $("#feed");
    feed.innerHTML = `<div class="loading">Loading headlines…</div>`;
    let data, note = "";
    try {
      if (st.scope === "local" || custom) {
        const q = st.scope === "local" ? localQuery() : st.q;
        try { data = await live(q); }
        catch {
          const city = S.profile?.city && NEWS_CITIES.includes(S.profile.city) ? S.profile.city : null;
          if (!city) throw new Error("Couldn't load news for that place right now. Try the City tab.");
          data = await prebuilt("city-" + slug(city)); note = `Live search is busy, so here's ${city} news instead.`;
        }
      } else if (st.scope === "city") data = await prebuilt("city-" + slug(st.place));
      else if (st.scope === "country") data = await prebuilt(st.country === "India" ? "india" : "country-" + slug(st.country));
      else if (st.scope === "topic") data = await prebuilt("topic-" + slug(st.topic));
      else data = await prebuilt("world");
    } catch (e) {
      feed.innerHTML = `<div class="empty"><p>${esc(e.message === "not built" ? "The news feed hasn't been generated yet. It appears a few minutes after the site goes live." : e.message)}</p></div>`;
      return;
    }
    const cutoff = Date.now() - DAY;
    let items = (data.items || []).filter((i) => !i.p || i.p >= cutoff).sort((a, b) => b.p - a.p);
    if (!S.user) items = items.slice(0, 6);
    feed.innerHTML = `${note ? `<p class="small muted">${esc(note)}</p>` : ""}
      <p class="small muted">${items.length} stories · updated ${data.updated ? new Date(data.updated).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) : ""}</p>
      ${items.length ? `<ol class="news-list">${items.map((i) => {
        const title = i.s && i.t.endsWith(" - " + i.s) ? i.t.slice(0, -(i.s.length + 3)) : i.t;
        return `<li><a href="${esc(i.l)}" target="_blank" rel="noopener">${esc(title)}</a>
          <p class="small muted">${esc(i.s)}${i.p ? ` · ${hoursAgo(i.p)}` : ""} · <a class="muted" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(title + " " + i.l)}">Share</a></p></li>`;
      }).join("")}</ol>` : `<div class="empty"><p>No stories in the last 24 hours for this filter.</p></div>`}`;
  }
  const hoursAgo = (p) => { const h = Math.round((Date.now() - p) / 3600000); return h < 1 ? "just now" : `${h} h ago`; };

  $$("[data-scope]").forEach((b) => (b.onclick = () => {
    st.scope = b.dataset.scope; st.q = "";
    $$("[data-scope]").forEach((x) => x.setAttribute("aria-pressed", x === b));
    if (["local", "city", "world", "country"].includes(st.scope)) save({ scope: st.scope });
    filters(); load();
  }));
  filters(); load();
}
