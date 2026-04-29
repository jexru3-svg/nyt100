"""Generate icon-192.png and icon-512.png for PWA manifest."""
from PIL import Image, ImageDraw
import os, math

OUT = os.path.join(os.path.dirname(__file__), '..', 'icons')

BG     = (13, 27, 42)       # #0D1B2A
GOLD   = (232, 197, 71)     # #E8C547
GOLD_D = (158, 136, 48)     # dim gold

def draw_icon(size):
    img = Image.new('RGBA', (size, size), BG)
    d   = ImageDraw.Draw(img)

    cx, cy = size // 2, size // 2
    pad    = int(size * 0.12)

    # Safe zone circle (maskable: content must fit inside 80% of canvas)
    safe = int(size * 0.40)
    d.ellipse([cx - safe, cy - safe, cx + safe, cy + safe],
              outline=GOLD, width=max(2, size // 64))

    # Inner dot
    dot = max(2, size // 20)
    d.ellipse([cx - dot, cy - dot, cx + dot, cy + dot], fill=GOLD)

    # Crosshair lines  (compass / target feel)
    arm = int(safe * 0.72)
    gap = int(size * 0.06)
    lw  = max(2, size // 80)
    d.line([cx, cy - safe + pad // 2, cx, cy - gap], fill=GOLD, width=lw)
    d.line([cx, cy + gap, cx, cy + safe - pad // 2], fill=GOLD, width=lw)
    d.line([cx - safe + pad // 2, cy, cx - gap, cy], fill=GOLD, width=lw)
    d.line([cx + gap, cy, cx + safe - pad // 2, cy], fill=GOLD, width=lw)

    # "NYC" text rendered as simple pixel blocks via rectangles (no font needed)
    # Use a small gold accent bar at bottom instead
    bar_h  = max(2, size // 40)
    bar_w  = int(safe * 1.0)
    bar_y  = cy + int(safe * 0.65)
    d.rectangle([cx - bar_w // 2, bar_y, cx + bar_w // 2, bar_y + bar_h],
                fill=GOLD_D)

    return img

for size in [192, 512]:
    img  = draw_icon(size)
    path = os.path.join(OUT, f'icon-{size}.png')
    img.save(path, 'PNG', optimize=True)
    print(f'  Saved {path} ({os.path.getsize(path) // 1024}KB)')

print('Done.')
