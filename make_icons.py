from PIL import Image, ImageDraw

BG = (21, 23, 27)        # --bg
PANEL = (29, 33, 39)     # --panel
AMBER = (217, 162, 75)   # --accent
DIM = (151, 160, 171)    # --dim

S = 512
SS = 4  # supersample


def mark(draw, cx, cy, scale):
    """Sun above a horizon line."""
    r = 96 * scale
    lw = int(round(18 * scale))
    # sun
    draw.ellipse([cx - r, cy - r - 26 * scale, cx + r, cy + r - 26 * scale],
                 outline=AMBER, width=lw)
    # horizon
    hw = 168 * scale
    y = cy + 104 * scale
    draw.rounded_rectangle([cx - hw, y - lw / 2, cx + hw, y + lw / 2],
                           radius=lw / 2, fill=AMBER)
    # a fainter second line, like the next day
    hw2 = 108 * scale
    y2 = y + 46 * scale
    draw.rounded_rectangle([cx - hw2, y2 - lw / 2.6, cx + hw2, y2 + lw / 2.6],
                           radius=lw / 3, fill=DIM)


def build(path, maskable=False):
    n = S * SS
    img = Image.new("RGB", (n, n), BG)
    d = ImageDraw.Draw(img)
    if maskable:
        # full-bleed background; content kept well inside the safe circle
        scale = 0.62 * SS
    else:
        # rounded plaque on the background
        pad = 26 * SS
        d.rounded_rectangle([pad, pad, n - pad, n - pad], radius=96 * SS, fill=PANEL)
        scale = 0.86 * SS
    mark(d, n / 2, n / 2, scale)
    img.resize((S, S), Image.LANCZOS).save(path, "PNG", optimize=True)


build("icon-512.png")
build("icon-maskable-512.png", maskable=True)
Image.open("icon-512.png").resize((192, 192), Image.LANCZOS).save("icon-192.png", "PNG", optimize=True)
print("icons written")
