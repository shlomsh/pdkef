import numpy as np, json
from scipy import ndimage as ndi
from common import S
def glyphs(m):
    lab,n=ndi.label(m, structure=np.ones((3,3)))
    sl=ndi.find_objects(lab)
    area=ndi.sum(m,lab,range(1,n+1))
    H=np.array([s[0].stop-s[0].start for s in sl]); W=np.array([s[1].stop-s[1].start for s in sl])
    X=np.array([(s[1].start+s[1].stop)/2 for s in sl]); Y=np.array([(s[0].start+s[0].stop)/2 for s in sl])
    return H,W,X,Y,np.array(area)
def profile(m, gutter_left, nb=10):
    H,W,X,Y,A=glyphs(m)
    hm=np.median(H[(H>15)&(H<60)])
    ok=(H>0.7*hm)&(H<1.3*hm)&(W<2.5*hm)&(W>0.25*hm)&(A>40)
    x0,x1=np.percentile(X[ok],1),np.percentile(X[ok],99)
    u=(X[ok]-x0)/(x1-x0); u=1-u if gutter_left else u
    b=np.clip((u*nb).astype(int),0,nb-1)
    w=np.array([np.median(W[ok][b==k]) if (b==k).sum()>20 else np.nan for k in range(nb)])
    h=np.array([np.median(H[ok][b==k]) if (b==k).sum()>20 else np.nan for k in range(nb)])
    # mean width is more sensitive than median for integer widths
    wm=np.array([np.mean(W[ok][b==k]) if (b==k).sum()>20 else np.nan for k in range(nb)])
    return dict(hm=float(hm),n=int(ok.sum()),x0=float(x0),x1=float(x1),w=w,h=h,wm=wm)
if __name__=='__main__':
    out={}
    for i in range(8):
        for s in 'RL':
            m=np.load(f'{S}/work/d{i}{s}.npy')
            p=profile(m, s=='R')
            ref=np.nanmean(p['wm'][1:6])
            print(f'd{i}{s} n={p["n"]:5d} xh={p["hm"]:.0f} meanW/ref outer->gutter:',' '.join(f'{v/ref:.2f}' for v in p['wm']),' H:',' '.join(f'{v:.0f}' for v in p['h']))
            out[f'{i}{s}']={k:(v.tolist() if hasattr(v,'tolist') else v) for k,v in p.items()}
    json.dump(out,open(f'{S}/work/squeeze.json','w'))
