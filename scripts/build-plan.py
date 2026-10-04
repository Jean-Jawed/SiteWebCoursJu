"""
Génère le plan stylisé du quartier (page d'accueil) à partir d'OpenStreetMap.

Usage (depuis la racine du site) :
    python scripts/build-plan.py

Sortie : images/plan-quartier.svg
    Les rues en traits fins, sans fond de carte. La projection est écrite dans
    les attributs data-* de la racine <svg>, pour que home.js place les lieux
    (lus dans Firestore) au bon endroit :
        x = (lon - lon0) * kx      y = (lat0 - lat) * ky

Données : © les contributeurs d'OpenStreetMap (ODbL), via l'API Overpass.
"""
import json
import math
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "images" / "plan-quartier.svg"

# Emprise : les lieux du site, avec une marge
FIRESTORE = "https://firestore.googleapis.com/v1/projects/cours-julien/databases/(default)/documents/lieux?pageSize=1000"
MARGIN = 0.0016
WIDTH = 1000  # largeur du viewBox

MAJOR = {"primary", "secondary", "tertiary"}
MINOR = {"residential", "living_street", "unclassified", "pedestrian"}
PATHS = {"footway", "steps", "path"}


def fetch_json(url, data=None):
    req = urllib.request.Request(url, data=data, headers={"User-Agent": "cours-julien.fr build-plan"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def lieux_bounds():
    docs = fetch_json(FIRESTORE)["documents"]
    pts = []
    for d in docs:
        f = d["fields"]
        if "latitude" in f and "longitude" in f:
            pts.append((float(list(f["latitude"].values())[0]), float(list(f["longitude"].values())[0])))
    lats, lons = [p[0] for p in pts], [p[1] for p in pts]
    return pts, (min(lats) - MARGIN, min(lons) - MARGIN, max(lats) + MARGIN, max(lons) + MARGIN)


def main():
    pts, (s, w, n, e) = lieux_bounds()
    query = f"""[out:json][timeout:50];
way["highway"~"^(primary|secondary|tertiary|residential|living_street|unclassified|pedestrian|footway|steps)$"]({s},{w},{n},{e});
(._;>;);out body;"""
    data = fetch_json("https://overpass-api.de/api/interpreter",
                      urllib.parse.urlencode({"data": query}).encode())

    nodes = {el["id"]: (el["lat"], el["lon"]) for el in data["elements"] if el["type"] == "node"}
    ways = [el for el in data["elements"] if el["type"] == "way"]

    lat0 = (s + n) / 2
    kx = WIDTH / (e - w)
    ky = kx / math.cos(math.radians(lat0))
    height = round((n - s) * ky)

    def proj(lat, lon):
        return (lon - w) * kx, (n - lat) * ky

    groups = {"major": [], "minor": [], "path": []}
    for way in ways:
        tags = way.get("tags", {})
        if tags.get("footway") in ("sidewalk", "crossing", "traffic_island"):
            continue  # trottoirs et passages : ils doublent chaque rue
        hw = tags.get("highway")
        group = "major" if hw in MAJOR else "minor" if hw in MINOR else "path"
        coords = [proj(*nodes[i]) for i in way["nodes"] if i in nodes]
        if len(coords) < 2:
            continue
        d = "M" + " L".join(f"{x:.1f} {y:.1f}" for x, y in coords)
        groups[group].append(d)

    # Distance maximale entre deux lieux (pour « tout à X min à pied »)
    def dist(a, b):
        dx = (b[1] - a[1]) * math.cos(math.radians(lat0)) * 111320
        dy = (b[0] - a[0]) * 110540
        return math.hypot(dx, dy)
    max_d = max(dist(a, b) for a in pts for b in pts)
    minutes = math.ceil(max_d * 1.3 / 80)  # détour des rues ~30 %, 80 m/min

    svg = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {WIDTH} {height}" '
        f'data-lon0="{w:.7f}" data-lat0="{n:.7f}" data-kx="{kx:.4f}" data-ky="{ky:.4f}" '
        f'data-max-minutes="{minutes}" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">',
        "<!-- Données © les contributeurs d'OpenStreetMap (ODbL) -->",
        f'<g stroke-width="1" opacity="0.45" stroke-dasharray="2 3">{"".join(f"<path d={chr(34)}{d}{chr(34)}/>" for d in groups["path"])}</g>',
        f'<g stroke-width="1.6" opacity="0.7">{"".join(f"<path d={chr(34)}{d}{chr(34)}/>" for d in groups["minor"])}</g>',
        f'<g stroke-width="3.2">{"".join(f"<path d={chr(34)}{d}{chr(34)}/>" for d in groups["major"])}</g>',
        "</svg>",
    ]
    OUT.write_text("\n".join(svg), encoding="utf-8")
    print(f"{OUT.relative_to(ROOT)} : {len(ways)} rues, {WIDTH}x{height}, "
          f"{OUT.stat().st_size // 1024} Ko, lieux les plus éloignés : {round(max_d)} m (~{minutes} min à pied)")


if __name__ == "__main__":
    main()
