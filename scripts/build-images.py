"""
Prépare les images du site à partir des originaux.

Usage (depuis la racine du site) :
    python scripts/build-images.py            # traite tout ce qui manque
    python scripts/build-images.py --force    # régénère tout

Entrées (jamais modifiées) :
    images/originaux/*.jpg|png      photos brutes (exclues du déploiement)
    images/quartier/*.jpg           photos de la page Quartier

Sorties :
    images/web/<nom>-480.webp, -960.webp
        couleur, redressée, sans métadonnées (EXIF/GPS supprimés).
        Le WebP est lu par tous les navigateurs actuels : pas de JPG de secours.
    images/trame/<nom>-480.png, -960.png
        version « photocopie » : points de trame encre sombre sur fond transparent,
        pour les photos imprimées sur le papier
    images/trame/<nom>-480-nuit.png, -960-nuit.png
        même trame en encre claire, pour les photos posées sur la table noire
        (PNG 2 couleurs : ~15-20 Ko en 480 px)
    images/web/partage.jpg
        image de partage 1200 × 630 (og:image)

Dépendance : Pillow (pip install pillow)
"""
import math
import sys
import unicodedata
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parent.parent
ORIGINAUX = ROOT / "images" / "originaux"
QUARTIER = ROOT / "images" / "quartier"
OUT_WEB = ROOT / "images" / "web"
OUT_TRAME = ROOT / "images" / "trame"
FONT = ROOT / "scripts" / "fonts" / "BarlowCondensed-Bold.ttf"

WEB_WIDTHS = (480, 960)
TRAME_WIDTHS = (480, 960)
PAPER = (235, 229, 214)       # papier journal
TABLE = (12, 12, 11)          # --bg
ORANGE = (224, 92, 42)        # --accent
CREAM = (240, 236, 228)       # --text
INK = (28, 26, 23)            # encre sur le papier

FORCE = "--force" in sys.argv


def slug(path):
    """Art_Agent.jpg → art-agent ; Cinéma_Videodrome.jpg → cinema-videodrome."""
    name = unicodedata.normalize("NFKD", path.stem).encode("ascii", "ignore").decode()
    return name.replace("_", "-").replace(" ", "-").lower()


def load(path, max_side=2000):
    im = Image.open(path)
    if im.format == "JPEG":
        im.draft("RGB", (max_side, max_side))   # décodage rapide des gros JPEG
    im = ImageOps.exif_transpose(im)
    return im.convert("RGB")


def resized(im, width):
    if im.width <= width:
        return im
    h = round(im.height * width / im.width)
    return im.resize((width, h), Image.LANCZOS)


# ---------------------------------------------------------------------------
# Trame : points de trame à 45°, comme une photocopie ou une risographie
# ---------------------------------------------------------------------------
def halftone(im, width, night=False, angle=45, ss=3):
    """Masque de trame (L, 0/255) : 255 = encre.

    night=False : l'encre représente les ombres (encre sombre sur papier clair).
    night=True  : l'encre représente la lumière (encre claire sur la table noire).
    """
    gray = ImageOps.autocontrast(ImageOps.grayscale(resized(im, width)), cutoff=1)
    if night:
        gray = ImageOps.invert(gray)
    else:
        gray = gray.point(lambda v: round(255 * (v / 255) ** 0.62))  # tons moyens éclaircis
    w, h = gray.size
    cell = max(4, round(w / 96))   # même grain visuel à toutes les tailles

    rot = gray.rotate(angle, expand=True, fillcolor=255)
    rw, rh = rot.size
    cols, rows = math.ceil(rw / cell), math.ceil(rh / cell)
    means = rot.resize((cols, rows), Image.BOX).load()

    mask = Image.new("L", (rw * ss, rh * ss), 0)
    draw = ImageDraw.Draw(mask)
    for j in range(rows):
        for i in range(cols):
            dark = 1 - means[i, j] / 255
            r = (cell / 2) * 1.35 * math.sqrt(dark) * ss
            if r < 0.4 * ss:
                continue
            cx, cy = (i + 0.5) * cell * ss, (j + 0.5) * cell * ss
            draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=255)

    back = mask.rotate(-angle, expand=True, resample=Image.BILINEAR)
    bw, bh = back.size
    left, top = (bw - w * ss) // 2, (bh - h * ss) // 2
    back = back.crop((left, top, left + w * ss, top + h * ss)).resize((w, h), Image.LANCZOS)
    return back.point(lambda v: 255 if v > 127 else 0)


def save_trame(mask, color, target):
    """PNG à palette 2 couleurs : transparent + encre."""
    img = Image.new("P", mask.size, 0)
    img.putpalette([0, 0, 0] + list(color) + [0, 0, 0] * 254)
    img.paste(1, mask=mask)
    img.save(target, "PNG", optimize=True, transparency=0)


def process(src, name):
    im = None
    outputs = 0
    for width in WEB_WIDTHS:
        target = OUT_WEB / f"{name}-{width}.webp"
        if target.exists() and not FORCE:
            continue
        im = im or load(src)
        if width > im.width and width != WEB_WIDTHS[0]:
            continue  # pas d'agrandissement au-delà de l'original
        resized(im, width).save(target, "WEBP", quality=78, method=6)
        outputs += 1

    for width in TRAME_WIDTHS:
        for night, suffix, color in ((False, "", INK), (True, "-nuit", CREAM)):
            target = OUT_TRAME / f"{name}-{width}{suffix}.png"
            if target.exists() and not FORCE:
                continue
            im = im or load(src)
            if width > im.width and width != TRAME_WIDTHS[0]:
                continue
            save_trame(halftone(im, width, night=night), color, target)
            outputs += 1
    return outputs


# ---------------------------------------------------------------------------
# Image de partage 1200 × 630 : façades tramées posées sur la table noire
# ---------------------------------------------------------------------------
SHARE_PHOTOS = [
    ("livre-locussolus", (640, 28), -6),
    ("social-maison", (905, 70), 5),
    ("musique-tripsichord", (720, 330), 3),
]


def paper_scrap(name, width=300):
    trame = Image.open(OUT_TRAME / f"{name}-480.png").convert("RGBA")
    trame = resized(trame, width - 24)
    scrap = Image.new("RGBA", (trame.width + 24, trame.height + 24), PAPER + (255,))
    scrap.alpha_composite(trame, (12, 12))
    # Bande de scotch orange en haut
    tape = Image.new("RGBA", (110, 30), ORANGE + (190,))
    scrap.alpha_composite(tape, ((scrap.width - 110) // 2, 0))
    return scrap


def build_share():
    target = OUT_WEB / "partage.jpg"
    if target.exists() and not FORCE:
        return
    canvas = Image.new("RGBA", (1200, 630), TABLE + (255,))
    for name, (x, y), angle in SHARE_PHOTOS:
        scrap = paper_scrap(name).rotate(angle, expand=True, resample=Image.BICUBIC)
        shadow = Image.new("RGBA", scrap.size, (0, 0, 0, 0))
        shadow.putalpha(scrap.getchannel("A").point(lambda a: a * 0.45))
        canvas.alpha_composite(shadow, (x + 8, y + 12))
        canvas.alpha_composite(scrap, (x, y))

    draw = ImageDraw.Draw(canvas)
    big = ImageFont.truetype(str(FONT), 112)
    small = ImageFont.truetype(str(FONT), 30)
    lines = [("COURS JULIEN", CREAM), ("& LA PLAINE", ORANGE)]
    draw.text((66, 196), "MARSEILLE 6E  ·  N° 01", font=small, fill=ORANGE)
    y = 238
    for text, color in lines:
        # Léger décalage d'impression orange derrière le texte
        draw.text((64 + 4, y + 3), text, font=big, fill=ORANGE + (120,))
        draw.text((64, y), text, font=big, fill=color)
        y += 104
    draw.text((66, 462), "LE QUARTIER, RACONTÉ", font=small, fill=CREAM)
    draw.text((66, 498), "PAR CEUX QUI Y VIVENT", font=small, fill=CREAM)
    canvas.convert("RGB").save(target, "JPEG", quality=84, optimize=True, progressive=True)


def main():
    OUT_WEB.mkdir(parents=True, exist_ok=True)
    OUT_TRAME.mkdir(parents=True, exist_ok=True)

    sources = [(p, slug(p)) for p in sorted(ORIGINAUX.glob("*")) if p.suffix.lower() in (".jpg", ".jpeg", ".png")]
    sources += [(p, "quartier-" + slug(p)) for p in sorted(QUARTIER.glob("*.jpg"))]

    total = 0
    for src, name in sources:
        n = process(src, name)
        total += n
        if n:
            print(f"  {name}: {n} fichier(s)")
    build_share()
    print(f"Terminé : {total} fichier(s) générés dans images/web et images/trame.")


if __name__ == "__main__":
    main()
