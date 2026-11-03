"""Builds the Dashboard's "On this day" stories from Wikipedia.

For every day of the year it fetches Wikipedia's On This Day events, keeps only uplifting ones
(firsts, discoveries, records, launches, openings...) and drops anything about war, disasters,
deaths or crime. The best few per day are saved to assets/on-this-day/MM.json, so the app shows
stories that were checked ahead of time instead of whatever the live feed says.

Run it for some months, or leave the months out for the whole year (about an hour):
    python tools/build_on_this_day.py 11 12
Text comes from Wikipedia (CC BY-SA); the Dashboard links each story back to its article.
"""

import datetime
import json
import pathlib
import re
import sys
import time
import urllib.error
import urllib.request

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE.parent / "assets" / "on-this-day"
# Raw Wikipedia responses, kept so a rerun after an interruption carries on where it stopped.
CACHE = HERE / ".on-this-day-cache"
FEED = "https://en.wikipedia.org/api/rest_v1/feed/onthisday/all/{month:02d}/{day:02d}"
HEADERS = {"User-Agent": "MARGEN-Dashboard/1.0 (https://github.com/franckjeff/margen-dashboard; on-this-day builder)"}
PER_DAY = 3
PAUSE = 1.5  # seconds between requests; Wikipedia rate-limits faster clients

# Any of these in the event or its article summary rules the event out.
GLOOMY = re.compile(
    r"\b(war|wars|warfare|wartime|kill\w*|die[sd]?|dying|death\w*|dead|murder\w*|massacre\w*|attack\w*|bomb\w*|"
    r"shoot\w*|shot|assassin\w*|execut\w*|crash\w*|disaster\w*|earthquake\w*|tsunami\w*|hurricane\w*|cyclone\w*|"
    r"typhoon\w*|tornado\w*|flood\w*|famine|genocide\w*|invasion|invade\w*|battle\w*|siege|terror\w*|riot\w*|"
    r"explo(?:sion|ded|des)|sank|sink\w*|wreck\w*|epidemic\w*|pandemic\w*|plague|slave\w*|slavery|nazi\w*|"
    r"holocaust|coup|surrender\w*|prisoner\w*|hostage\w*|hijack\w*|collaps\w*|fire|fires|burn\w*|destroy\w*|"
    r"annex\w*|occup\w*|arrest\w*|sentenc\w*|convict\w*|scandal\w*|resign\w*|impeach\w*|nuclear|weapon\w*|"
    r"missile\w*|military|army|armies|troops|soldier\w*|armed|rebel\w*|revolt\w*|uprising|insurgen\w*|crisis|"
    r"fail\w*|defeat\w*|victim\w*|casualt\w*|injur\w*|accident\w*|tragedy|tragic|suicide|crime\w*|criminal\w*|"
    r"prison\w*|jail\w*|abduct\w*|kidnap\w*|rape\w*|abuse\w*|torture\w*|persecut\w*|discriminat\w*|racis\w*|"
    r"segregat\w*|apartheid|dictator\w*|regime|protest\w*|strike|strikes|ban|banned|bankrupt\w*|collusion|"
    r"plot|conspir\w*|fraud|poison\w*|radioactiv\w*|spill|outbreak|virus|deadliest|bloody|fought|fighting|"
    r"conquer\w*|empire|colon\w*|navy|naval|warship\w*|submarine\w*|guerrilla\w*|militia\w*|bombing|"
    r"execution|exile\w*|deport\w*|refugee\w*|emergency|evacuat\w*|riots|crusade\w*|jihad\w*|insurrection|"
    # Politics divides people more than it lifts them up.
    r"elect\w*|vote[ds]?|voting|president\w*|politic\w*|senate|senator\w*|congress\w*|parliament\w*|"
    r"prime minister|party|referendum|government\w*|treaty|sanction\w*|"
    # Stories whose ending is sad even when the summary doesn't say so.
    r"laika|never seated|sacrific\w*|lost|missing|body|extinct|malicious|controvers\w*|seced\w*|secession|"
    r"captur\w*|reconnaissance|grave|lottery|gambling|assault|defen[cs]e)\b",
    re.IGNORECASE,
)

# Events read one by one and left out by hand: technically "firsts", but not good vibes.
# Add to this list when a story slips through the word filter above.
SKIP = [
    "Morris worm", "feral child", "AK-47", "G-20", "Mongolian People's Republic", "Tellico Dam",
    "Christopher Columbus", "North Korea", "Cheka", "SR-71", "Pioneer Helmet", "Santa María",
    "British Indian Ocean Territory", "Cleveland Browns", "Sykes-Picot", "Kantrowitz",
    "Belovezh", "conquest", "Louisiana Purchase",
]

# Uplifting signals, with the ocean and sport themes MARGEN's community cares about weighted up.
UPLIFTING = [
    (r"\bfirst\b", 3),
    (r"\brecords?\b", 3),
    (r"\b(discover\w*|invent\w*|breakthrough)\b", 3),
    (r"\b(launch\w*|landed|landing|orbit\w*|spacecraft|astronaut\w*|moon|mars)\b", 2),
    (r"\b(found(?:ed|ing)|establish\w*|opened|opens|inaugurat\w*|premier\w*|debut\w*|publish\w*|unveil\w*)\b", 2),
    (r"\b(complet\w*|achiev\w*|won|wins|champion\w*|olympic\w*|medal\w*|summit|climb\w*|ascent)\b", 3),
    (r"\b(vaccine\w*|cure\w*|heal\w*|rescue[ds]?|saved?)\b", 3),
    (r"\b(ocean\w*|sea|seas|sail\w*|surf\w*|swim\w*|paddl\w*|canoe\w*|kayak\w*|rowing|island\w*|hawai\w*|"
     r"marine|reef\w*|voyage\w*|circumnavigat\w*|wave|waves|beach\w*|coast\w*|whale\w*|dolphin\w*)\b", 4),
    (r"\b(peace|friendship|together|unite[ds]?|freedom|independence|rights|equal\w*|women)\b", 2),
    (r"\b(music|art|film|book|novel|library|museum|park|national park|festival)\b", 1),
]


def fetch(month, day):
    """Wikipedia's On This Day feed for one date (selected and all events), cached on disk."""
    cached = CACHE / f"{month:02d}-{day:02d}.json"
    if cached.exists():
        return json.loads(cached.read_text(encoding="utf-8"))
    url = FEED.format(month=month, day=day)
    for attempt in range(10):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=60) as response:
                feed = json.load(response)
            break
        except urllib.error.HTTPError as error:
            if error.code != 429 and error.code < 500:
                raise
            # Too many requests: wait as long as Wikipedia asks, a little longer each time.
            time.sleep(float(error.headers.get("Retry-After") or 5) + 2 * attempt)
        except OSError:
            time.sleep(5 * (attempt + 1))
    else:
        raise RuntimeError(f"Couldn't fetch {url}")
    feed = {kind: feed.get(kind, []) for kind in ("selected", "events")}
    CACHE.mkdir(exist_ok=True)
    cached.write_text(json.dumps(feed), encoding="utf-8")
    time.sleep(PAUSE)
    return feed


def first_sentences(text, limit=320):
    """The article summary cut at a sentence end, at most `limit` characters."""
    text = " ".join((text or "").split())
    if len(text) <= limit:
        return text
    cut = text[:limit]
    end = max(cut.rfind(". "), cut.rfind("! "), cut.rfind("? "))
    return cut[: end + 1] if end > 80 else cut.rsplit(" ", 1)[0] + "…"


def story(event, curated):
    """The event as a story, or None if it isn't uplifting."""
    page = (event.get("pages") or [{}])[0]
    summary = first_sentences(page.get("extract"))
    text = " ".join(event.get("text", "").split())
    # Drop notes about Wikipedia's pictures, e.g. "(poster pictured)", which the Dashboard doesn't show.
    text = re.sub(r"\s*\((?:[^()]*\s)?(?:pictured|featured|shown|depicted)\)", "", text)
    if not text or "year" not in event or GLOOMY.search(text) or GLOOMY.search(summary):
        return None
    if any(phrase.lower() in text.lower() for phrase in SKIP):
        return None
    score = sum(weight for pattern, weight in UPLIFTING if re.search(pattern, text, re.IGNORECASE))
    if score == 0:
        return None
    return {
        "score": score + (1 if curated else 0),
        "year": event["year"],
        "text": text,
        "title": page.get("titles", {}).get("normalized", ""),
        "summary": summary,
        "url": page.get("content_urls", {}).get("desktop", {}).get("page", ""),
    }


def day_stories(month, day):
    found = {}
    feed = fetch(month, day)
    for kind in ("selected", "events"):
        for event in feed[kind]:
            s = story(event, kind == "selected")
            # The same event often appears in both lists, worded differently and linked to different
            # articles; keeping one story per year drops those repeats.
            key = s and s["year"]
            if s and key not in found:
                found[key] = s
    best = sorted(found.values(), key=lambda s: (-s["score"], s["year"]))[:PER_DAY]
    return [{k: v for k, v in s.items() if k != "score"} for s in best]


def main():
    months = [int(m) for m in sys.argv[1:]] or list(range(1, 13))
    every_day = (datetime.date(2024, 1, 1) + datetime.timedelta(n) for n in range(366))  # 2024 has Feb 29
    days = [(d.month, d.day) for d in every_day if d.month in months]
    stories = {}
    # One day at a time: Wikipedia answers parallel requests with "too many requests".
    for n, (month, day) in enumerate(days, 1):
        stories[f"{month:02d}-{day:02d}"] = day_stories(month, day)
        if n % 10 == 0:
            print(f"{n}/{len(days)} days", flush=True)
    OUT.mkdir(parents=True, exist_ok=True)
    for month in months:
        month_stories = {k: v for k, v in stories.items() if k.startswith(f"{month:02d}-")}
        (OUT / f"{month:02d}.json").write_text(json.dumps(month_stories, ensure_ascii=False, indent=1), encoding="utf-8")
    empty = [k for k, v in stories.items() if not v]
    print(f"Saved {sum(map(len, stories.values()))} stories for {len(stories)} days. Days with none: {empty or 'none'}")


if __name__ == "__main__":
    main()
