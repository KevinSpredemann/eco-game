from PIL import Image, ImageDraw, ImageFilter
def ghost(size, pad):
    S=size*4
    im=Image.new('RGBA',(S,S),(0,0,0,0))
    bg=Image.new('RGBA',(S,S))
    d=ImageDraw.Draw(bg)
    for y in range(S):
        t=y/S
        d.line([(0,y),(S,y)],fill=(int(14+30*t),int(10+8*t),int(40+40*t),255))
    im.alpha_composite(bg)
    p=pad*S
    w=S-2*p
    cx=S/2+w*0.07; top=p+w*0.08; r=w*0.34
    def body(dr,col,off=0):
        dr.ellipse([cx-r-off,top-off,cx+r+off,top+2*r+off],fill=col)
        dr.rectangle([cx-r-off,top+r,cx+r+off,top+r*2.3],fill=col)
        n=4; ww=2*(r+off)/n
        for i in range(n):
            x0=cx-r-off+i*ww
            dr.ellipse([x0,top+r*2.05,x0+ww,top+r*2.55],fill=col)
    glow=Image.new('RGBA',(S,S),(0,0,0,0))
    body(ImageDraw.Draw(glow),(0,230,255,200),off=w*0.03)
    glow=glow.filter(ImageFilter.GaussianBlur(S*0.04))
    im.alpha_composite(glow)
    g=Image.new('RGBA',(S,S),(0,0,0,0)); gd=ImageDraw.Draw(g)
    body(gd,(120,245,255,255))
    # trail echo (purple, offset)
    t=Image.new('RGBA',(S,S),(0,0,0,0)); td=ImageDraw.Draw(t)
    body(td,(170,90,255,110))
    t=t.transform((S,S),Image.AFFINE,(1,0,w*0.16,0,1,-w*0.02))
    im.alpha_composite(t)
    im.alpha_composite(g)
    gd2=ImageDraw.Draw(im)
    ex=r*0.42; ey=top+r*1.0; er=r*0.17
    for sx in (-1,1):
        gd2.ellipse([cx+sx*ex-er,ey-er*1.4,cx+sx*ex+er,ey+er*1.4],fill=(18,12,48,255))
    gd2.ellipse([cx-er*0.8,top+r*1.45,cx+er*0.8,top+r*1.85],fill=(18,12,48,255))
    return im.resize((size,size),Image.LANCZOS)
if __name__=='__main__':
  for name,size,pad in [('icon-192',192,0.12),('icon-512',512,0.12),('maskable-512',512,0.22),('apple-touch-icon',180,0.14),('favicon-64',64,0.06)]:
    ghost(size,pad).convert('RGB').save(f'public/icons/{name}.png')
  print('ok')
