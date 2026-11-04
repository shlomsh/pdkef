import numpy as np, os, glob
from PIL import Image
from common import S
out=f'{S}/out'; os.makedirs(out,exist_ok=True)
for f in glob.glob(f'{out}/*'): os.remove(f)
crops={}
for i in range(8):
    for s in 'RL':
        m=np.load(f'{S}/work/c{i}{s}.npy'); ys,xs=np.nonzero(m)
        crops[(i,s)]=m[ys.min():ys.max()+1, xs.min():xs.max()+1]
Wb=max(c.shape[1] for c in crops.values()); Hb=max(c.shape[0] for c in crops.values())
print('block max',Wb,Hb,'widths',sorted(c.shape[1] for c in crops.values()))
W,H=Wb+300,Hb+300
pages=[]
for i in range(8):
    for s in 'RL':
        c=crops[(i,s)]; pg=np.zeros((H,W),bool)
        x=150+Wb-c.shape[1]   # right-aligned: Hebrew text starts at the right
        pg[150:150+c.shape[0], x:x+c.shape[1]]=c
        im=Image.fromarray(np.where(pg,0,255).astype(np.uint8)).convert('1')
        im.save(f'{out}/page{i+1}{"a" if s=="R" else "b"}.png'); pages.append(im)
pages[0].save(f'{out}/straightened.pdf', save_all=True, append_images=pages[1:], resolution=300)
print('page px',W,H,'in %.2f x %.2f'%(W/300,H/300))
for i in (0,1,7):
    before=Image.open(f'{S}/raw/p-00{i}.png').convert('L')
    b=before.resize((before.width//3,before.height//3),Image.BOX)
    R=pages[2*i].convert('L'); L=pages[2*i+1].convert('L')
    spread=Image.new('L',(2*W+40,H),200); spread.paste(L,(0,0)); spread.paste(R,(W+40,0))
    a=spread.resize((spread.width//3,spread.height//3),Image.BOX)
    canvas=Image.new('L',(b.width+a.width+60,max(b.height,a.height)),160)
    canvas.paste(b,(0,0)); canvas.paste(a,(b.width+60,0))
    canvas.save(f'{out}/before_after_p{i+1}.png')
# full-res gutter detail of page 2's right page: turned only vs final
up=np.load(f'{S}/work/up1.npy'); det=up[1200:1700,1550:2350]
fin=np.asarray(pages[2].convert('L'))<128
Image.fromarray(np.where(det,0,255).astype(np.uint8)).save(f'{out}/detail_p2a_before.png')
