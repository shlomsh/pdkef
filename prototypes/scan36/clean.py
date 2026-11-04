import numpy as np, json
from scipy import ndimage as ndi
from PIL import Image
from common import S, emit, to_gray
from squeeze import profile

def clean(m):
    lab,n=ndi.label(m, structure=np.ones((3,3)))
    sl=ndi.find_objects(lab); area=ndi.sum(m,lab,range(1,n+1))
    H=np.array([s[0].stop-s[0].start for s in sl]); W=np.array([s[1].stop-s[1].start for s in sl])
    xh=float(np.median(H[(H>15)&(H<60)]))
    textlike=(H>0.4*xh)&(H<2.2*xh)&(W<4*xh)&(area>15)
    seed=np.isin(lab, np.nonzero(textlike)[0]+1)
    region=ndi.binary_dilation(seed[::4,::4], structure=np.ones((int(xh*0.6/4)*2+1, int(xh*1.6/4)*2+1)))
    rl,rn=ndi.label(region)
    sizes=ndi.sum(region,rl,range(1,rn+1)); seeds=ndi.sum(seed[::4,::4],rl,range(1,rn+1))
    big=int(np.argmax(sizes))
    bs=ndi.find_objects(rl)[big]; bx0,bx1=bs[1].start*4,bs[1].stop*4   # the body text block's column
    def in_column(k):
        sk=ndi.find_objects(rl)[k]; a,b=sk[1].start*4,sk[1].stop*4
        return seeds[k]>=3 and (min(b,bx1)-max(a,bx0)) > 0.5*(b-a)
    keep_r=np.isin(rl, [k+1 for k in range(rn) if in_column(k)])
    keep_r[:, :max(0,(bx0-int(xh))//4)]=False; keep_r[:, (bx1+int(xh))//4:]=False
    keep_r=np.kron(keep_r,np.ones((4,4),bool))[:m.shape[0],:m.shape[1]]
    keep_r=np.pad(keep_r,((0,m.shape[0]-keep_r.shape[0]),(0,m.shape[1]-keep_r.shape[1])))
    cy=np.array([(s[0].start+s[0].stop)//2 for s in sl]); cx=np.array([(s[1].start+s[1].stop)//2 for s in sl])
    inside=keep_r[cy,cx]
    streak=(H>2.2*xh)&(W<0.5*xh)                     # fold line / border pieces
    blob=(H>3*xh)&(W>3*xh)&(area>0.35*H*W)        # dark gutter / edge masses
    speck=area<10
    # the justified column: where the letters themselves start and end; nothing kept beyond it
    xs0=np.array([q[1].start for q in sl]); xs1=np.array([q[1].stop for q in sl])
    tin=textlike&inside
    c0,c1=np.percentile(xs0[tin],0.5)-0.5*xh, np.percentile(xs1[tin],99.5)+0.5*xh
    inside=inside&(xs0>=c0)&(xs1<=c1)
    keep=inside&~streak&~blob&~speck
    out=np.isin(lab, np.nonzero(keep)[0]+1)
    stats=dict(xh=xh, comps=int(n), removed_outside=int((~inside).sum()), streak=int((inside&streak).sum()), blob=int((inside&blob).sum()),
               speck=int((inside&speck&~streak&~blob).sum()), ink_removed_share=float(1-out.sum()/max(1,m.sum())))
    return out, stats

def unsqueeze(m, gutter_left, prof):
    """horizontal remap so glyph width is even: s(u) from the width profile (1 = no squeeze)."""
    wm=np.array(prof['wm'],float); ref=np.nanmean(wm[1:6]); s=wm/ref
    u=(np.arange(len(s))+0.5)/len(s)
    ok=~np.isnan(s)
    # hinge: s=1 before u0, then a straight drop to s1 at the gutter (k>=0); best least squares
    best=(1e9,1.0,1.0)
    for u0 in np.arange(0.4,0.95,0.05):
        for s1 in np.arange(0.85,1.0001,0.005):
            mod=np.where(u<u0,1,1-(1-s1)*(u-u0)/(1-u0)); e=((mod-s)[ok]**2).sum()
            if e<best[0]: best=(e,u0,s1)
    _,u0,s1=best
    if s1>0.97: s1=1.0   # under 3% is the measurement's own noise: leave the page alone
    A=[float(u0),float(s1)]
    def sfun(uu): return np.where(uu<u0,1,1-(1-s1)*(uu-u0)/(1-u0))
    h,w=m.shape; x0,x1=prof['x0'],prof['x1']
    xs=np.arange(w)+0.5
    uu=(xs-x0)/(x1-x0); uu=1-uu if gutter_left else uu
    sc=np.where((uu<0)|(uu>1),1.0,sfun(np.clip(uu,0,1)))           # input px per output px... stretch = 1/s
    # output coordinate of each input column: cumulative 1/s, anchored at the outer edge
    if gutter_left:
        cum=np.cumsum((1/sc)[::-1])[::-1]; xout=cum[0]-cum      # grows leftwards from the right
        xout=xout-xout[-1]+w; total=int(np.ceil(xout[0]-xout[-1]))+1
        xout=xout-xout.min()
    else:
        xout=np.cumsum(1/sc)
    W2=int(np.ceil(xout.max()))+1
    # inverse map: for each output column find input column
    order=np.argsort(xout); src=np.interp(np.arange(W2)+0.5, xout[order], xs[order])
    g=to_gray(m).astype(float)
    xi=np.clip(src-0.5,0,w-1); i0=np.floor(xi).astype(int); i1=np.minimum(i0+1,w-1); t=xi-i0
    out=(g[:,i0]*(1-t)+g[:,i1]*t)<128
    return out, dict(hinge_u0=A[0], s_at_gutter=float(sfun(1.0)), added_px=W2-w)

if __name__=='__main__':
    sq=json.load(open(f'{S}/work/squeeze.json'))
    report={}
    for i in range(8):
        for s in 'RL':
            m=np.load(f'{S}/work/d{i}{s}.npy')
            c,st=clean(m)
            if s=='R':
                c,us=unsqueeze(c, True, sq[f'{i}{s}'])
            else: us=None
            np.save(f'{S}/work/c{i}{s}.npy',c)
            emit(f'c{i}{s}', to_gray(c))
            report[f'{i}{s}']=dict(clean=st, unsqueeze=us)
            print(i,s,st,us)
    json.dump(report,open(f'{S}/work/clean.json','w'))
