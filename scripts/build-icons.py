"""
Génère le favicon et les icônes PWA à partir du monogramme « CJ ».

Usage (depuis la racine du site) :
    python scripts/build-icons.py

Dépendances : Pillow, fontTools  (pip install pillow fonttools)
Police : Barlow Condensed Bold (SIL Open Font License), dans scripts/fonts/
"""
from pathlib import Path

from fontTools.pens.basePen import BasePen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
FONT = ROOT / "scripts" / "fonts" / "BarlowCondensed-Bold.ttf"
OUT = ROOT / "icons"

TEXT = "CJ"
BG = "#0c0c0b"       # --bg du site
FG = "#e05c2a"       # --accent du site
TRACKING = -0.02     # espacement entre lettres (en em)

# Diagonale du texte rapportée au côté de l'icône :
#  - "any"      : doit tenir dans le rond de Google (diamètre = 100 %)
#  - "maskable" : doit tenir dans la zone de sécurité Android (diamètre = 80 %)
FIT_ANY = 0.84
FIT_MASKABLE = 0.70
CORNER = 0.22        # arrondi des coins pour les icônes "any" (en fraction du côté)

SUPERSAMPLE = 4


# ---------------------------------------------------------------------------
# Contour vectoriel du texte (unités de la police)
# ---------------------------------------------------------------------------
def text_outline():
    font = TTFont(FONT)
    glyphs = font.getGlyphSet()
    cmap = font.getBestCmap()
    upm = font["head"].unitsPerEm

    rec = RecordingPen()
    x = 0
    for ch in TEXT:
        g = glyphs[cmap[ord(ch)]]
        g.draw(TransformPen(rec, (1, 0, 0, 1, x, 0)))
        x += g.width + TRACKING * upm

    bounds = BoundsPen(glyphs)
    rec.replay(bounds)
    return rec, bounds.bounds


def fitted_transform(bounds, size, fit):
    """Matrice qui centre le texte et le met à l'échelle (y vers le bas)."""
    xmin, ymin, xmax, ymax = bounds
    w, h = xmax - xmin, ymax - ymin
    scale = fit * size / (w * w + h * h) ** 0.5
    cx, cy = (xmin + xmax) / 2, (ymin + ymax) / 2
    return (scale, 0, 0, -scale, size / 2 - cx * scale, size / 2 + cy * scale)


class FlattenPen(BasePen):
    """Convertit les courbes en polygones pour le rendu Pillow."""

    def __init__(self, steps=24):
        super().__init__(None)
        self.steps = steps
        self.contours = []

    def _moveTo(self, p):
        self.contours.append([p])

    def _lineTo(self, p):
        self.contours[-1].append(p)

    def _curveToOne(self, p1, p2, p3):
        p0 = self._getCurrentPoint()
        for i in range(1, self.steps + 1):
            t = i / self.steps
            u = 1 - t
            self.contours[-1].append(tuple(
                u**3 * a + 3 * u * u * t * b + 3 * u * t * t * c + t**3 * d
                for a, b, c, d in zip(p0, p1, p2, p3)))

    def _qCurveToOne(self, p1, p2):
        p0 = self._getCurrentPoint()
        for i in range(1, self.steps + 1):
            t = i / self.steps
            u = 1 - t
            self.contours[-1].append(tuple(
                u * u * a + 2 * u * t * b + t * t * c
                for a, b, c in zip(p0, p1, p2)))

    def _closePath(self):
        pass


# ---------------------------------------------------------------------------
# Rendus
# ---------------------------------------------------------------------------
def render_png(outline, bounds, size, fit, rounded):
    big = size * SUPERSAMPLE
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    if rounded:
        draw.rounded_rectangle((0, 0, big - 1, big - 1), radius=CORNER * big, fill=BG)
    else:
        draw.rectangle((0, 0, big, big), fill=BG)

    pen = FlattenPen()
    outline.replay(TransformPen(pen, fitted_transform(bounds, big, fit)))
    for contour in pen.contours:
        draw.polygon(contour, fill=FG)

    return img.resize((size, size), Image.LANCZOS)


def render_svg(outline, bounds, fit):
    size = 512
    pen = SVGPathPen(None, ntos=lambda v: f"{v:.1f}".rstrip("0").rstrip("."))
    outline.replay(TransformPen(pen, fitted_transform(bounds, size, fit)))
    path = pen.getCommands()
    r = round(CORNER * size)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}">'
        f'<rect width="{size}" height="{size}" rx="{r}" fill="{BG}"/>'
        f'<path fill="{FG}" d="{path}"/>'
        f'</svg>\n'
    )


def main():
    OUT.mkdir(exist_ok=True)
    outline, bounds = text_outline()

    (OUT / "icon.svg").write_text(render_svg(outline, bounds, FIT_ANY), encoding="utf-8")

    for size in (192, 512):
        render_png(outline, bounds, size, FIT_ANY, rounded=True).save(OUT / f"icon-{size}.png")
        render_png(outline, bounds, size, FIT_MASKABLE, rounded=False).save(OUT / f"icon-maskable-{size}.png")

    # iOS arrondit lui-même les coins et n'accepte pas la transparence
    render_png(outline, bounds, 180, FIT_ANY, rounded=False).convert("RGB").save(OUT / "apple-touch-icon.png")

    # favicon.ico à la racine : 16, 32 et 48 px (48 = minimum demandé par Google)
    sizes = (16, 32, 48)
    frames = [render_png(outline, bounds, s, FIT_ANY, rounded=True) for s in sizes]
    frames[-1].save(ROOT / "favicon.ico", sizes=[(s, s) for s in sizes], append_images=frames[:-1])

    print("Icônes générées dans", OUT.relative_to(ROOT), "+ favicon.ico")


if __name__ == "__main__":
    main()
