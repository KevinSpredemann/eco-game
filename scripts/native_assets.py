# Gera ícones e telas de abertura nativas (Android + iOS) a partir do ícone do ECO.
import glob, sys
from PIL import Image, ImageDraw
sys.path.insert(0, 'scripts')
from icons import ghost
BG = (10, 8, 23)

def splash(w, h):
    im = Image.new('RGB', (w, h), BG)
    s = int(min(w, h) * 0.34)
    g = ghost(s, 0.06).convert('RGBA')
    # remove o fundo do quadrado do ícone: mistura com o fundo da tela
    mask = Image.new('L', (s, s), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, s, s], fill=255)
    im.paste(g, ((w - s) // 2, (h - s) // 2), mask)
    return im

for p in glob.glob('android/app/src/main/res/**/*.png', recursive=True):
    w, h = Image.open(p).size
    name = p.split('/')[-1]
    if name == 'splash.png':
        splash(w, h).save(p)
    elif name == 'ic_launcher_foreground.png':
        im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
        s = int(w * 0.62)
        g = ghost(s, 0.0)
        m = Image.new('L', (s, s), 0)
        ImageDraw.Draw(m).rounded_rectangle([0, 0, s, s], radius=s // 5, fill=255)
        im.paste(g, ((w - s) // 2, (h - s) // 2), m)
        im.save(p)
    elif name == 'ic_launcher_round.png':
        g = ghost(w, 0.12).convert('RGBA')
        m = Image.new('L', (w, w), 0)
        ImageDraw.Draw(m).ellipse([0, 0, w - 1, w - 1], fill=255)
        out = Image.new('RGBA', (w, w), (0, 0, 0, 0))
        out.paste(g, (0, 0), m)
        out.save(p)
    else:
        ghost(w, 0.12).convert('RGB').save(p)
    print(p, w, h)

ghost(1024, 0.12).convert('RGB').save('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png')
for p in glob.glob('ios/App/App/Assets.xcassets/Splash.imageset/*.png'):
    splash(2732, 2732).save(p)
print('ios ok')
