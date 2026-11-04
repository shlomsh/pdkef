import json,sys
o=json.load(open('/tmp/claude-0/-home-user-pdkef/ead3f715-ca25-574c-8c3c-68112a8510a5/scratchpad/scan36/work/out.json'))
pre=sys.argv[1] if len(sys.argv)>1 else ''
for k,v in o.items():
    if not k.startswith(pre): continue
    f=v['fitted']; d=v['diag']
    print(f"{k:28s} {v['w']}x{v['h']} ink={v['inkShare']:.3f} rule={v['ruleShare']:.4f} why={d['why']} lines={d['lines']} medThick={d['medThick'] and round(d['medThick'],4)} medRmsPx={d['medRms'] and round(d['medRms'],2)} slope={d['medSlope'] and round(d['medSlope'],4)} | fitted={'none' if not f else (f['explained'], f['lean'] and round(f['lean'],4))} bend={v['maxBendPx'] and round(v['maxBendPx'],1)} sq={v['maxSquarePx'] and round(v['maxSquarePx'],1)} raw={v['rawDiag']['why']}")
