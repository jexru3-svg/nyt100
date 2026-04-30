"""
One-time validation of reservation booking URLs for all 100 NYT restaurants.

Strategy: fetch each restaurant's own website (and /reservations fallback) and scan
for links to Resy, Tock, OpenTable, or SevenRooms. Resy/Tock both block automated
HTTP checks (SPA/Cloudflare), so restaurant websites are the authoritative source.

Run:   python scripts/validate_reservations.py
Output: reservation_url_report.csv
"""

import csv
import json
import re
import sys
import time
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests

PROXY = {"https": "http://vzproxy.verizon.com:9290"}
HEADERS = {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
    "Accept-Language": "en-US,en;q=0.9",
}
SLEEP = 0.5
DATA_FILE = Path(__file__).parent.parent / "data" / "restaurants.json"
OUT_FILE = Path(__file__).parent.parent / "reservation_url_report.csv"

# Slug exclusions for Tock (these are marketing/nav links, not venue pages)
TOCK_EXCLUDED = {"tock", "features", "pricing", "login", "signup", "careers", "blog", "about"}

# Patterns that indicate non-booking assets
ASSET_RE = re.compile(r"\.(js|css|png|jpg|jpeg|svg|webp|json|woff|woff2)(\?|#|$)", re.IGNORECASE)

# Broad booking link scanner — captures URL up to first whitespace/quote/angle
BOOKING_RE = re.compile(
    r'https?://(?:'
    r'(?:www\.)?(?:resy\.com/(?:cities/[^"\'<>\s]+|r/[^"\'<>\s]+))'
    r'|(?:www\.)?exploretock\.com/([a-z0-9][a-z0-9-]*)'
    r'|(?:www\.)?opentable\.com/(?:r/|restref/client/\?)[^"\'<>\s]*'
    r'|(?:www\.)?sevenrooms\.com/(?:explore|reservations)/[^"\'<>\s]+'
    r')',
    re.IGNORECASE,
)

# Extract slug from Resy URL (matches /cities/ny/slug or /cities/ny/venues/slug or /r/slug)
RESY_SLUG_RE = re.compile(
    r'resy\.com/(?:r/|cities/[a-z]+/(?:venues?/)?)'
    r'([a-z0-9][a-z0-9-]*)(?:/|\?|$)',
    re.IGNORECASE,
)

# SevenRooms slug extractor: /explore/{slug}/ or /reservations/{slug}
SR_SLUG_RE = re.compile(r'sevenrooms\.com/(?:explore|reservations)/([a-z0-9][a-z0-9_-]*)', re.IGNORECASE)

# OpenTable slug/rid extractor: /r/{slug} or restref/client/?rid=...
OT_SLUG_RE = re.compile(r'opentable\.com/r/([a-z0-9][a-z0-9-]*)', re.IGNORECASE)
OT_RID_RE  = re.compile(r'opentable\.com/restref/client/\?(?:.*&)?rid=(\d+)', re.IGNORECASE)


def safe_print(s):
    print(s.encode(sys.stdout.encoding or "utf-8", errors="replace").decode(sys.stdout.encoding or "utf-8", errors="replace"))


def to_slug(name):
    """Port of toSlug() from app.js:1180-1185."""
    s = name.lower().replace("&", "and")
    s = re.sub(r"[^a-z0-9\s-]", "", s).strip()
    return re.sub(r"\s+", "-", s)


def is_instagram(url):
    return bool(url and "instagram.com" in url.lower())


def fetch_html(url, timeout=12):
    """GET a URL, return (status, final_url, html_text or None)."""
    try:
        r = requests.get(url, headers=HEADERS, proxies=PROXY, allow_redirects=True, timeout=timeout)
        return r.status_code, r.url, r.text if r.status_code == 200 else None
    except requests.RequestException:
        return "ERR", url, None


def extract_booking_links(html):
    """
    Return list of (platform, url, slug) from HTML.
    Deduplicates and filters marketing/asset URLs.
    """
    found = []
    seen = set()

    for m in BOOKING_RE.finditer(html):
        raw_url = m.group(0).rstrip("\"'>,;")
        if ASSET_RE.search(raw_url):
            continue

        platform, url, slug = None, raw_url, ""

        if "resy.com" in raw_url.lower():
            platform = "Resy"
            slug_m = RESY_SLUG_RE.search(raw_url)
            slug = slug_m.group(1) if slug_m else ""

        elif "exploretock.com" in raw_url.lower():
            platform = "Tock"
            tock_m = re.search(r'exploretock\.com/([a-z0-9][a-z0-9-]*)', raw_url, re.IGNORECASE)
            slug = tock_m.group(1) if tock_m else ""
            if slug in TOCK_EXCLUDED:
                continue

        elif "opentable.com" in raw_url.lower():
            platform = "OpenTable"
            rid_m = OT_RID_RE.search(raw_url)
            slug_m = OT_SLUG_RE.search(raw_url)
            slug = slug_m.group(1) if slug_m else (f"?rid={rid_m.group(1)}" if rid_m else "")

        elif "sevenrooms.com" in raw_url.lower():
            platform = "SevenRooms"
            sr_m = SR_SLUG_RE.search(raw_url)
            slug = sr_m.group(1) if sr_m else ""

        if not platform or not slug:
            continue

        key = (platform, slug)
        if key not in seen:
            found.append((platform, raw_url, slug))
            seen.add(key)

    return found


def best_link(links, current_platform):
    """Pick the most relevant link: prefer current platform, else first found."""
    if not links:
        return None
    pref = next((l for l in links if l[0] == current_platform), None)
    return pref or links[0]


def validate(restaurant):
    rid = restaurant["id"]
    name = restaurant["name"]
    current_platform = (restaurant.get("reservation_platform") or "").strip()
    website = restaurant.get("website") or ""

    current_slug = (
        restaurant.get("resy_slug") or
        restaurant.get("tock_slug") or
        restaurant.get("opentable_slug") or
        restaurant.get("sevenrooms_slug") or
        (to_slug(name) if current_platform else "")
    )

    base = {
        "id": rid, "name": name,
        "current_platform": current_platform,
        "current_slug": current_slug,
        "website": website,
    }
    empty = {"found_platform": "", "found_url": "", "found_slug": "", "website_status": ""}

    if not current_platform:
        return {**base, **empty, "verdict": "WALK-IN"}

    if not website:
        return {**base, **empty, "website_status": "NO_WEBSITE", "verdict": "MANUAL_CHECK"}

    if is_instagram(website):
        return {**base, **empty, "website_status": "INSTAGRAM", "verdict": "MANUAL_CHECK"}

    # Fetch homepage
    status, final_url, html = fetch_html(website)
    if status == "ERR" or html is None:
        return {**base, **empty, "website_status": f"FETCH_FAILED_{status}", "verdict": "MANUAL_CHECK"}

    links = extract_booking_links(html)

    # If nothing found on homepage, try /reservations and /book subpages
    if not links:
        base_url = f"{urlparse(final_url).scheme}://{urlparse(final_url).netloc}"
        for path in ("/reservations", "/reserve", "/book", "/dining", "/contact"):
            sub_status, _, sub_html = fetch_html(base_url + path, timeout=10)
            if sub_html:
                links = extract_booking_links(sub_html)
                if links:
                    break
            time.sleep(0.2)

    if not links:
        return {**base, **empty, "website_status": "200_NO_LINKS", "verdict": "MANUAL_CHECK"}

    chosen = best_link(links, current_platform)
    found_platform, found_url, found_slug = chosen

    if found_platform != current_platform:
        verdict = "MIGRATED"
    elif found_slug and found_slug != current_slug:
        verdict = "WRONG_SLUG"
    else:
        verdict = "OK"

    return {
        **base,
        "found_platform": found_platform,
        "found_url": found_url,
        "found_slug": found_slug,
        "website_status": "200",
        "verdict": verdict,
    }


def main():
    restaurants = json.loads(DATA_FILE.read_text(encoding="utf-8"))

    # Process in order: Resy → OpenTable → Tock → walk-in
    ordered = (
        [r for r in restaurants if r.get("reservation_platform") == "Resy"]
        + [r for r in restaurants if r.get("reservation_platform") == "OpenTable"]
        + [r for r in restaurants if r.get("reservation_platform") == "Tock"]
        + [r for r in restaurants if not r.get("reservation_platform")]
    )

    results = []
    for r in ordered:
        row = validate(r)
        verdict = row["verdict"]
        if verdict == "OK":
            flag = "OK"
        elif verdict == "WALK-IN":
            flag = "--"
        else:
            detail = row.get("found_platform") or row.get("website_status") or ""
            flag = f"!! {verdict} [{detail}]"
        safe_print(f"  {row['name']:<42} {flag}")
        results.append(row)
        # Throttle for restaurants with bookable platforms that have real websites
        if r.get("reservation_platform") and r.get("website") and not is_instagram(r.get("website", "")):
            time.sleep(SLEEP)

    fieldnames = [
        "id", "name", "current_platform", "current_slug", "website",
        "found_platform", "found_url", "found_slug", "website_status", "verdict",
    ]
    with open(OUT_FILE, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(results)

    counts = {}
    for row in results:
        counts[row["verdict"]] = counts.get(row["verdict"], 0) + 1

    safe_print(f"\nDone. {len(results)} restaurants.")
    safe_print(f"Results: {counts}")
    safe_print(f"Report:  {OUT_FILE}")


if __name__ == "__main__":
    main()
