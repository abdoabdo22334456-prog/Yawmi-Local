from PIL import Image, ImageDraw
from math import cos, sin, radians
from pathlib import Path

root = Path(__file__).parent
S = 1024
sc = S / 512
im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(im)
d.rounded_rectangle((0, 0, S - 1, S - 1), radius=int(120 * sc), fill='#11302a')
cx = cy = S / 2
r = 136 * sc
w = int(40 * sc)
d.ellipse((cx - r - w / 2, cy - r - w / 2, cx + r + w / 2, cy + r + w / 2), fill='#2b4b43')
d.ellipse((cx - r + w / 2, cy - r + w / 2, cx + r - w / 2, cy + r - w / 2), fill='#11302a')
d.arc((cx - r, cy - r, cx + r, cy + r), -90, 198, fill='#7be0c6', width=w)
for a in (-90, 198):
    x = cx + r * cos(radians(a))
    y = cy + r * sin(radians(a))
    d.ellipse((x - w / 2, y - w / 2, x + w / 2, y + w / 2), fill='#7be0c6')
dot = 34 * sc
d.ellipse((cx - dot, cy - dot, cx + dot, cy + dot), fill='#7be0c6')
im.save(root / 'icon.png')
im.save(root / 'icon.ico', sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print('Created icon.png and icon.ico')
