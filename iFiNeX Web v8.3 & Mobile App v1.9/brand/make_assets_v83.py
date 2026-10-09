import os, glob, shutil
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
SRC='/home/claude/out/tree/brand/ifinex-logo-v83-hero.jpg'
W='/home/claude/out/tree'; WEB=f'{W}/web/assets'; RES=f'{W}/mobile/android/app/src/main/res'
IOS=f'{W}/mobile/ios/App/App/Assets.xcassets'; STORE=f'{W}/store'; BRAND=f'{W}/brand'
for d in (WEB,STORE,BRAND): os.makedirs(d,exist_ok=True)
ICON_BG=(5,13,20); APP_BG=(11,11,24)
src=Image.open(SRC).convert('RGB'); pass

# ---------- source cut-outs ----------
def emblem_rgba():
    cx,cy,r=512,396,148; crop=src.crop((cx-r-8,cy-r-8,cx+r+8,cy+r+8)); S=crop.width; K=4
    m=Image.new('L',(S*K,S*K),0); ImageDraw.Draw(m).ellipse((8*K,8*K,(S-8)*K,(S-8)*K),fill=255)
    m=m.filter(ImageFilter.GaussianBlur(3)).resize((S,S),Image.LANCZOS)
    im=crop.convert('RGBA'); im.putalpha(m)
    bb=Image.fromarray((np.asarray(m)>12).astype('uint8')*255).getbbox(); return im.crop(bb)
def wordmark_rgba():
    wm=src.crop((212,736,868,946)).convert('RGBA'); m=Image.new('L',wm.size,0)
    ImageDraw.Draw(m).rounded_rectangle((10,8,wm.width-10,wm.height-8),radius=40,fill=255); m=m.filter(ImageFilter.GaussianBlur(3)); wm.putalpha(m); return wm
EMB=emblem_rgba(); WM=wordmark_rgba(); EMB.save(f'{BRAND}/ifinex-emblem-source.png'); WM.save(f'{BRAND}/ifinex-wordmark-source.png')

def fit(img,maxdim,sharp=True):
    s=maxdim/max(img.size); r=img.resize((max(1,round(img.width*s)),max(1,round(img.height*s))),Image.LANCZOS)
    if sharp and s>1.2:
        rgb=r.convert('RGB').filter(ImageFilter.UnsharpMask(radius=1.3,percent=65,threshold=2)); a=r.getchannel('A'); r=rgb.convert('RGBA'); r.putalpha(a)
    return r
def center_paste(canvas,img,cx,cy): canvas.alpha_composite(img,(round(cx-img.width/2),round(cy-img.height/2)))
def rmask(size,radius):
    K=4; m=Image.new('L',(size*K,size*K),0); ImageDraw.Draw(m).rounded_rectangle((0,0,size*K-1,size*K-1),radius=radius*K,fill=255); return m.resize((size,size),Image.LANCZOS)
def cmask(size):
    K=4; m=Image.new('L',(size*K,size*K),0); ImageDraw.Draw(m).ellipse((0,0,size*K-1,size*K-1),fill=255); return m.resize((size,size),Image.LANCZOS)

# ---------- mono glyph (procedural, from the emblem geometry) ----------
def glyph(variant,base=512):
    SS=4; N=base*SS
    def stadium(angle):
        L,Wd,T=392*SS,168*SS,54*SS; t=Image.new('L',(N,N),0)
        ImageDraw.Draw(t).rounded_rectangle(((N-L)//2,(N-Wd)//2,(N+L)//2,(N+Wd)//2),radius=Wd//2,outline=255,width=T)
        return t.rotate(angle,resample=Image.BICUBIC,center=(N//2,N//2))
    g=Image.fromarray(np.maximum(np.asarray(stadium(45)),np.asarray(stadium(-45)))); dd=ImageDraw.Draw(g)
    for (x,y) in ((256,36),(256,476),(36,256),(476,256)): dd.ellipse(((x-27)*SS,(y-27)*SS,(x+27)*SS,(y+27)*SS),fill=255)
    if variant==3:
        dd.ellipse(((256-92)*SS,(256-92)*SS,(256+92)*SS,(256+92)*SS),fill=0)
        dd.text((N//2,N//2+6*SS),'$',font=ImageFont.truetype('/usr/share/fonts/truetype/google-fonts/Poppins-Bold.ttf',178*SS),fill=255,anchor='mm')
    return g.resize((base,base),Image.LANCZOS)
G1,G3=glyph(1),glyph(3)
def white_glyph(px,variant,fill=0.88):
    g=(G3 if variant==3 else G1); inner=round(px*fill); t=g.resize((inner,inner),Image.LANCZOS)
    a=Image.new('L',(px,px),0); a.paste(t,((px-inner)//2,(px-inner)//2)); out=Image.new('RGBA',(px,px),(255,255,255,0)); out.putalpha(a); return out

# ---------- icon builders ----------
def icon_square(size,fill=0.80,radius=None,bg=ICON_BG,alpha=True):
    c=Image.new('RGBA',(size,size),bg+(255,)); center_paste(c,fit(EMB,size*fill),size/2,size/2)
    if radius is not None: c.putalpha(rmask(size,round(size*radius)))
    return c if alpha else c.convert('RGB')
def icon_round(size,fill=0.74):
    c=Image.new('RGBA',(size,size),ICON_BG+(255,)); center_paste(c,fit(EMB,size*fill),size/2,size/2); c.putalpha(cmask(size)); return c
def adaptive_fg(size,fill=0.58):
    c=Image.new('RGBA',(size,size),(0,0,0,0)); center_paste(c,fit(EMB,size*fill),size/2,size/2); return c
def mono_layer(size,fill=0.56):
    c=Image.new('RGBA',(size,size),(0,0,0,0)); g=white_glyph(round(size*fill),3,1.0); center_paste(c,g,size/2,size/2); return c

def glow(w,h,cx,cy,rx,ry,alpha):
    yy,xx=np.mgrid[0:h,0:w]; d=np.sqrt(((xx-cx)/rx)**2+((yy-cy)/ry)**2); return np.clip(1-d,0,1)**1.6*alpha
def bg_gradient(w,h):
    base=np.zeros((h,w,3),float)+np.array(APP_BG)
    for (cx,cy,rx,ry,col,al) in [(.08*w,-.05*h,.95*w,.60*h,(77,150,255),.26),(1.0*w,0.0,.85*w,.55*h,(176,106,255),.20),(.5*w,1.05*h,.85*w,.45*h,(77,150,255),.12)]:
        a=glow(w,h,cx,cy,rx,ry,al)[...,None]; base=base*(1-a)+np.array(col,float)*a
    return Image.fromarray(base.clip(0,255).astype('uint8')).convert('RGBA')
def splash(w,h,k_emb=.40,k_wm=.70):
    c=bg_gradient(w,h); s=min(w,h); e=fit(EMB,s*k_emb); wm=fit(WM,s*k_wm); gap=s*.05; tot=e.height+gap+wm.height; top=h*.47-tot/2
    center_paste(c,e,w/2,top+e.height/2); center_paste(c,wm,w/2,top+e.height+gap+wm.height/2); return c.convert('RGB')

# ================= ANDROID =================
dens={'mdpi':1,'hdpi':1.5,'xhdpi':2,'xxhdpi':3,'xxxhdpi':4}
for n,k in dens.items():
    os.makedirs(f'{RES}/mipmap-{n}',exist_ok=True)
    icon_square(round(48*k),.80,.22).save(f'{RES}/mipmap-{n}/ic_launcher.png')
    icon_round(round(48*k)).save(f'{RES}/mipmap-{n}/ic_launcher_round.png')
    adaptive_fg(round(108*k)).save(f'{RES}/mipmap-{n}/ic_launcher_foreground.png')
    mono_layer(round(108*k)).save(f'{RES}/mipmap-{n}/ic_launcher_monochrome.png')
    os.makedirs(f'{RES}/drawable-{n}',exist_ok=True)
    white_glyph(round(24*k),3 if k>=2 else 1).save(f'{RES}/drawable-{n}/ic_stat_ifinex.png')
os.makedirs(f'{RES}/drawable-nodpi',exist_ok=True); icon_square(256,.80,.22).save(f'{RES}/drawable-nodpi/ic_notif_large.png')
open(f'{RES}/values/ic_launcher_background.xml','w').write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#050D14</color>\n</resources>\n')
adaptive='<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n    <background android:drawable="@color/ic_launcher_background"/>\n    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n    <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>\n</adaptive-icon>\n'
for f in ('ic_launcher.xml','ic_launcher_round.xml'): open(f'{RES}/mipmap-anydpi-v26/{f}','w').write(adaptive)
for f in (f'{RES}/drawable/ic_launcher_background.xml',f'{RES}/drawable-v24/ic_launcher_foreground.xml'):
    if os.path.exists(f): os.remove(f)
if os.path.isdir(f'{RES}/drawable-v24') and not os.listdir(f'{RES}/drawable-v24'): os.rmdir(f'{RES}/drawable-v24')
n_sp=0
for p in glob.glob(f'{RES}/drawable*/splash.png'):
    w,h=Image.open(p).size; splash(w,h).save(p); n_sp+=1
# ================= iOS =================
icon_square(1024,.78,None,ICON_BG,alpha=False).save(f'{IOS}/AppIcon.appiconset/AppIcon-512@2x.png')
sp=splash(2732,2732,.28,.50)
for f in glob.glob(f'{IOS}/Splash.imageset/*.png'): sp.save(f)
# ================= WEB =================
icon_square(192,.80,None,alpha=False).save(f'{WEB}/icon-192.png'); icon_square(512,.80,None,alpha=False).save(f'{WEB}/icon-512.png')
icon_square(512,.60,None,alpha=False).save(f'{WEB}/maskable-512.png'); icon_square(180,.80,None,alpha=False).save(f'{WEB}/apple-touch-icon.png')
fav=icon_square(64,.84,.2); fav.resize((32,32),Image.LANCZOS).save(f'{WEB}/favicon-32.png'); icon_square(256,.84,.2).save(f'{WEB}/favicon.ico',sizes=[(16,16),(32,32),(48,48)])
white_glyph(96,3).save(f'{WEB}/badge-96.png'); icon_square(192,.80,.22).save(f'{WEB}/notif-large-192.png'); fit(EMB,192,False).save(f'{WEB}/ifinex-emblem-192.png')
# ================= STORE =================
icon_square(512,.80,None,alpha=False).save(f'{STORE}/playstore-icon-512.png')
fg=bg_gradient(1024,500); center_paste(fg,fit(EMB,380),70+190,250); wm=fit(WM,500); center_paste(fg,wm,470+250,205)
d=ImageDraw.Draw(fg); P='/usr/share/fonts/truetype/google-fonts/Poppins-Bold.ttf'
d.text((470+250,320),'Plan · Track · Save · Grow',font=ImageFont.truetype(P,32),fill=(205,220,255,255),anchor='mm')
d.text((470+250,368),'Bills • Squad Split • Cards • Budget • Trips • Events',font=ImageFont.truetype(P,19),fill=(130,150,200,255),anchor='mm')
fg.convert('RGB').save(f'{STORE}/feature-graphic-1024x500.png')
# ================= IN-APP ART (v8.3) =================
fit(EMB,160,False).save(f'{WEB}/ifinex-emblem-192.png')
fit(WM,520,False).save(f'{WEB}/ifinex-wordmark.png')
MARK=src.crop((716,752,852,928)).convert('RGBA'); mm=Image.new('L',MARK.size,0); ImageDraw.Draw(mm).rounded_rectangle((2,2,MARK.width-3,MARK.height-3),radius=26,fill=255); MARK.putalpha(mm.filter(ImageFilter.GaussianBlur(1.2))); fit(MARK,128,False).save(f'{WEB}/ifinex-mark.png')
import glob as _g
for p in _g.glob(f'{BRAND}/art/*.png'):
    n=os.path.basename(p)[:-4]; Image.open(p).save(f'{WEB}/art-{n}.webp',quality=86,method=6)
h=src.copy(); h.thumbnail((1024,1024)); h.save(f'{WEB}/ifinex-hero.jpg',quality=82,optimize=True)
EMB.save(f'{BRAND}/ifinex-emblem-source.png'); WM.save(f'{BRAND}/ifinex-wordmark-source.png')
print('assets done; splash files:',n_sp)
