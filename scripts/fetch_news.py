"""Builds news/*.json from Google News RSS (last 24 hours).

Run by .github/workflows/news.yml every 3 hours. Uses only the Python standard library.
Cities, countries and topics are read from js/config.js so there is one list to edit.
"""
import json, re, time, urllib.parse, urllib.request, xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "news"
CONFIG = (ROOT / "js" / "config.js").read_text(encoding="utf-8")
BASE = "https://news.google.com/rss"
PARAMS = "hl=en-IN&gl=IN&ceid=IN:en"
UA = {"User-Agent": "Mozilla/5.0 (SeatSathi news bot; +https://github.com)"}
DAY_MS = 24 * 3600 * 1000
SITE = "https://nik035.github.io/seatsathi/news"   # previous build, used when Google is slow
BUDGET_S = 240                                       # stop calling Google after 4 minutes

TOPIC_QUERIES = {
    "Economy": "India economy OR RBI OR GDP OR inflation",
    "Science": "India science OR ISRO OR technology research",
    "Sports": "India sports",
    "Government schemes": "government scheme launched India ministry",
    "Defence": "Indian Army OR Navy OR Air Force OR DRDO defence",
    "Environment": "India environment climate pollution",
    "Exams and jobs": "UPSC OR SSC OR RPSC OR UPPSC OR recruitment exam notification",
}


def js_list(name):
    m = re.search(rf"export const {name}\s*=\s*\[(.*?)\];", CONFIG, re.S)
    return re.findall(r'"([^"]+)"', m.group(1)) if m else []


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def parse(xml_bytes):
    root = ET.fromstring(xml_bytes)
    items, cutoff = [], time.time() * 1000 - DAY_MS
    for it in root.iter("item"):
        title = (it.findtext("title") or "").strip()
        link = (it.findtext("link") or "").strip()
        src = (it.findtext("source") or "").strip()
        try:
            p = int(parsedate_to_datetime(it.findtext("pubDate")).timestamp() * 1000)
        except Exception:
            p = 0
        if title and link and (not p or p >= cutoff):
            items.append({"t": title, "l": link, "s": src, "p": p})
    items.sort(key=lambda x: -x["p"])
    seen, out = set(), []
    for i in items:  # drop near-duplicate headlines
        k = re.sub(r"\W+", "", i["t"].lower())[:60]
        if k not in seen:
            seen.add(k)
            out.append(i)
    return out[:40]


def fetch(url, tries=2, timeout=12):
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
                return r.read()
        except Exception:
            if attempt == tries - 1:
                raise
            time.sleep(2)


def previous(key):
    """Last published copy of a feed, so a slow Google run never empties the site."""
    try:
        return json.loads(fetch(f"{SITE}/{key}.json", tries=1, timeout=8))
    except Exception:
        return None


def search(q):
    return f"{BASE}/search?q={urllib.parse.quote_plus(q + ' when:1d')}&{PARAMS}"


def build():
    OUT.mkdir(exist_ok=True)
    feeds = {
        "world": ("World", f"{BASE}/headlines/section/topic/WORLD?{PARAMS}"),
        "india": ("India", f"{BASE}/headlines/section/topic/NATION?{PARAMS}"),
    }
    for c in js_list("NEWS_CITIES"):
        feeds[f"city-{slug(c)}"] = (c, search(c))
    for c in js_list("NEWS_COUNTRIES"):
        if c != "India":
            feeds[f"country-{slug(c)}"] = (c, search(c))
    for t in js_list("NEWS_TOPICS"):
        feeds[f"topic-{slug(t)}"] = (t, search(TOPIC_QUERIES.get(t, t + " India")))

    index, now, start, fails = {}, int(time.time() * 1000), time.time(), 0
    for key, (label, url) in feeds.items():
        data = None
        if time.time() - start < BUDGET_S and fails < 6:
            try:
                data = {"label": label, "updated": now, "items": parse(fetch(url))}
                fails = 0
            except Exception as e:
                fails += 1
                print(f"google failed for {key}: {e}")
        if data is None:
            data = previous(key)
            print(f"{key}: reused previous copy" if data else f"{key}: skipped")
            if not data:
                continue
        else:
            print(f"{key}: {len(data['items'])}")
            time.sleep(0.6)
        (OUT / f"{key}.json").write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        index[key] = {"label": label, "count": len(data.get("items", []))}
    (OUT / "index.json").write_text(json.dumps({"updated": now, "feeds": index}, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    build()
