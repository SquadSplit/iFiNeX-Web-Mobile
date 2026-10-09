import json,sys,difflib,re
import re
norm=lambda t: re.sub(r'>v8\.\d<','>vX<',t)
a=json.load(open(sys.argv[1])); b=json.load(open(sys.argv[2])); bad=0
a['steps']={k:norm(v) for k,v in a['steps'].items()}; b['steps']={k:norm(v) for k,v in b['steps'].items()}
print('screens:',a['onscreen'],b['onscreen'],'| errors old/new:',len(a['errors']),len(b['errors']))
for k in sorted(a['steps']):
    x,y=a['steps'][k],b['steps'].get(k)
    if x!=y:
        bad+=1; i=next((n for n,(c,d) in enumerate(zip(x,y)) if c!=d),min(len(x),len(y)))
        print(f'DIFF {k}: len {len(x)} -> {len(y)}\n   old: ...{x[max(0,i-70):i+110]!r}\n   new: ...{y[max(0,i-70):i+110]!r}')
        if bad>=6: break
print('steps identical:',len(a['steps'])-bad if bad<6 else f'(stopped after {bad} diffs)','of',len(a['steps']))
real=sum(1 for v in b['steps'].values() if not v.startswith(('ERR','NOFN')))
print('steps that actually rendered (new build):',real,'of',len(b['steps']), '| ERR steps:',[k for k,v in b['steps'].items() if v.startswith('ERR')][:8])
