import numpy as np
from PIL import Image
S='/tmp/claude-0/-home-user-pdkef/ead3f715-ca25-574c-8c3c-68112a8510a5/scratchpad/scan36'

def vruns(a, minrun):
    """mask of ink pixels in vertical runs >= minrun"""
    h,w=a.shape
    out=np.zeros_like(a)
    x=a.astype(np.int8)
    d=np.diff(np.vstack([np.zeros((1,w),np.int8),x,np.zeros((1,w),np.int8)]),axis=0)
    for c in range(w):
        st=np.where(d[:,c]==1)[0]; en=np.where(d[:,c]==-1)[0]
        for s,e in zip(st,en):
            if e-s>=minrun: out[s:e,c]=True
    return out

def smooth(v,k):
    return np.convolve(v,np.ones(k)/k,'same')

def find_spine(a):
    h,w=a.shape
    streak=vruns(a, int(h*0.04))
    text=a & ~streak
    col=smooth(text.mean(0),25)
    lo,hi=int(w*.3),int(w*.7)
    typ=np.median(col[int(w*.1):int(w*.9)])
    low=col[lo:hi] < 0.15*typ
    # longest run
    best=(0,0,0); s=None
    for i,v in enumerate(list(low)+[False]):
        if v and s is None: s=i
        if not v and s is not None:
            if i-s>best[0]: best=(i-s,s+lo,i+lo)
            s=None
    run,g0,g1=best
    sc=smooth(streak.mean(0),5)
    seg=sc[g0:g1] if g1>g0 else sc[lo:hi]
    fold=(g0 if g1>g0 else lo)+int(np.argmax(seg))
    fold_strength=float(seg.max()) if len(seg) else 0
    return dict(gap0=g0,gap1=g1,gap=run,fold=fold,fold_strength=fold_strength,cut=fold if fold_strength>0.2 else (g0+g1)//2, streak=streak)

def save_bw(mask, path, scale=None):
    im=Image.fromarray(np.where(mask,0,255).astype(np.uint8))
    if scale: im=im.resize((int(im.width*scale),int(im.height*scale)),Image.BOX)
    im.save(path)

def find_fold(a, band=(0.3,0.7), angles=np.arange(-6,6.01,0.1)):
    """Thin long dark line near the middle: sheared column histograms, sharp peak over local median."""
    h,w=a.shape
    ys,xs=np.nonzero(a)
    best=None
    for t in angles:
        sx=xs - (ys - h/2)*np.tan(np.radians(t))
        hist=np.bincount(np.clip(np.round(sx).astype(int),0,w-1),minlength=w).astype(float)/h
        base=np.convolve(hist,np.ones(61)/61,'same')
        sharp=hist-base
        lo,hi=int(w*band[0]),int(w*band[1])
        i=lo+int(np.argmax(sharp[lo:hi]))
        if best is None or sharp[i]>best[0]: best=(sharp[i],t,i)
    s,t,x=best
    return dict(strength=float(s), angle=float(t), x_mid=int(x))  # line: x = x_mid + (y-h/2)*tan(angle)

import json, os
IN=f'{S}/work/in'
def emit(name, gray):
    """gray: uint8 2D array (255 paper). Writes raw + manifest entry."""
    os.makedirs(IN,exist_ok=True)
    g=np.ascontiguousarray(gray.astype(np.uint8))
    g.tofile(f'{IN}/{name}.gray')
    mf=f'{IN}/manifest.json'
    m=json.load(open(mf)) if os.path.exists(mf) else {}
    m[name]=[g.shape[1],g.shape[0]]
    json.dump(m,open(mf,'w'))

def area_shrink(gray, long_edge=1000):
    h,w=gray.shape
    k=int(np.ceil(max(h,w)/long_edge))
    if k<=1: return gray
    H,W=h//k,w//k
    return gray[:H*k,:W*k].reshape(H,k,W,k).astype(float).mean((1,3)).astype(np.uint8)

def to_gray(mask): return np.where(mask,0,255).astype(np.uint8)
