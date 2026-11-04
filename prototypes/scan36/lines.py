import json,sys,numpy as np
o=json.load(open('/tmp/claude-0/-home-user-pdkef/ead3f715-ca25-574c-8c3c-68112a8510a5/scratchpad/scan36/work/out.json'))
def analyse(name, gutter_left):
    v=o[name]; w,h=v['w'],v['h']
    rows=[]
    for L in v['straight']:
        p=np.array(L['pts'],float)
        if len(p)<15: continue
        x,y=p[:,0],p[:,1]
        # robust: median filter baseline
        ym=np.array([np.median(y[max(0,i-3):i+4]) for i in range(len(y))])
        # straight fit on the half of the line away from the gutter
        u=x/w if not gutter_left else 1-x/w   # u: 0 at outer edge .. 1 at gutter
        far=u<0.6
        if far.sum()<5: continue
        A=np.polyfit(x[far],ym[far],1)
        r=ym-np.polyval(A,x)
        # deviation in the gutter-most 15% of the line extent
        span=u.max()-u.min()
        near=u>u.max()-0.15*span
        rows.append((L['cy'], A[0], np.median(r[near]), u.max(), np.abs(r[far]).mean()))
    rows=np.array(rows)
    print(f'{name}: lines={len(rows)} slope(far part) median={np.median(rows[:,1]):.4f} ({np.degrees(np.arctan(np.median(rows[:,1]))):.2f} deg)  gutter-end dev px median={np.median(rows[:,2]):.1f} p10={np.percentile(rows[:,2],10):.1f} p90={np.percentile(rows[:,2],90):.1f} farNoise={np.median(rows[:,4]):.2f}')
    return rows
if __name__=='__main__':
    for n in sys.argv[1:]:
        analyse(n, n.split('_')[2]=='R' if 'cw' in n else None)
