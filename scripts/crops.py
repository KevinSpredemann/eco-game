import sys
from PIL import Image
U='/root/.claude/uploads/66875fab-1498-59f9-bfa2-014af0e2c75d/'
A=Image.open(U+'31c60add-image.png').convert('RGB')
B=Image.open(U+'62ebb98b-image.png').convert('RGB')
crops={
 'char_kael':(B,(30,352,160,556)),
 'char_luna':(B,(160,352,290,556)),
 'char_bruno':(B,(290,352,422,556)),
 'char_zoe':(B,(422,352,556,556)),
 'char_maya':(A,(390,392,512,606)),
 'char_zed':(A,(513,392,636,606)),
 'arena_lab':(B,(35,980,196,1100)),
 'arena_cidade':(B,(209,980,368,1100)),
 'arena_templo':(B,(381,980,541,1100)),
 'arena_fabrica':(B,(553,980,711,1100)),
 'arena_floresta':(B,(719,980,873,1100)),
 'arena_espaco':(A,(955,537,1229,641)),
 'hero':(B,(330,0,950,330)),
 'hero2':(A,(330,0,745,335)),
}
for k,(im,box) in crops.items():
    c=im.crop(box)
    if k.startswith('char'): c=c.resize((c.width*2,c.height*2),Image.LANCZOS)
    c.save(f'public/art/{k}.webp',quality=86)
    print(k,c.size)
