from PIL import Image, ImageDraw
from math import cos, sin, pi
from pathlib import Path

root = Path(__file__).parent
im = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
d = ImageDraw.Draw(im)
d.rounded_rectangle((24, 24, 1000, 1000), radius=260, fill='#203d32')
for index in range(8):
    angle = index * pi / 4
    x1, y1 = 512 + cos(angle) * 95, 512 + sin(angle) * 95
    x2, y2 = 512 + cos(angle) * 294, 512 + sin(angle) * 294
    d.line((x1, y1, x2, y2), fill='#def2a4', width=56)
    for x,y in ((x1,y1),(x2,y2)):
        d.ellipse((x-28, y-28, x+28, y+28), fill='#def2a4')
d.ellipse((466,466,558,558), fill='#def2a4')
im.save(root / 'icon.png')
im.save(root / 'icon.ico', sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
print('Created icon.png and icon.ico')
