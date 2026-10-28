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


def fetch(url):
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=20) as r:
                return r.read()
        except Exception as e:
            if attempt == 2:
                raise
            time.sleep(2 + attempt * 3)


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

    index, now = {}, int(time.time() * 1000)
    for key, (label, url) in feeds.items():
        try:
            items = parse(fetch(url))
        except Exception as e:
            print(f"skip {key}: {e}")
            continue
        (OUT / f"{key}.json").write_text(json.dumps({"label": label, "updated": now, "items": items}, ensure_ascii=False), encoding="utf-8")
        index[key] = {"label": label, "count": len(items)}
        print(f"{key}: {len(items)}")
        time.sleep(0.6)
    (OUT / "index.json").write_text(json.dumps({"updated": now, "feeds": index}, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    build()
