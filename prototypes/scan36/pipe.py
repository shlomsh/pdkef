import numpy as np, json
from PIL import Image
from scipy import ndimage as ndi
from common import S, emit, to_gray
folds=json.load(open(f'{S}/work/folds.json'))

def fold_x(i, y, h):
    f=folds[str(i)]; return f['x_mid'] + (y-h/2)*np.tan(np.radians(f['angle']))

def halves(i, pad=10):
    a=np.load(f'{S}/work/up{i}.npy'); h,w=a.shape
    ys=np.arange(h)[:,None]; xs=np.arange(w)[None,:]
    fx=fold_x(i,ys,h)
    R=a & (xs>fx+pad); L=a & (xs<fx-pad)
    fmin,fmax=int(fold_x(i,0,h)),int(fold_x(i,h,h))
    lo,hi=min(fmin,fmax),max(fmin,fmax)
    return {'R':R[:,lo:], 'L':L[:,:hi]}

def lean_deg(m, rng=6, step=0.05):
    """projection-profile skew: angle maximizing row-profile sharpness (on 1/2 res)"""
    s=m[::2,::2]; ys,xs=np.nonzero(s); h,w=s.shape
    best=(-1,0)
    for t in np.arange(-rng,rng+1e-9,step):
        yy=ys - (xs-w/2)*np.tan(np.radians(t))
        hist=np.bincount(np.clip(np.round(yy).astype(int)+h,0,3*h-1),minlength=3*h).astype(float)
        sc=(np.diff(hist)**2).sum()
        if sc>best[0]: best=(sc,t)
    return best[1]

def rotate_bw(m, deg):
    """rotate bool mask so lines with slope tan(deg) become level (PIL rotate is CCW for +)."""
    im=Image.fromarray(np.where(m,0,255).astype(np.uint8))
    r=im.rotate(np.degrees(np.arctan(np.tan(np.radians(deg)))) , resample=Image.BILINEAR, expand=True, fillcolor=255)
    return np.asarray(r)<128
