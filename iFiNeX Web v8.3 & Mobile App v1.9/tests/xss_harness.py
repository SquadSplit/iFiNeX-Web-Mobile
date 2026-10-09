import sys, json, threading, functools, http.server, socketserver
from playwright.sync_api import sync_playwright
ROOT, FXF, PAGE, OUT = sys.argv[1:5]; PORT = int(sys.argv[5]) if len(sys.argv) > 5 else 8090; HOSTILE = 'hostile' in FXF
FX = json.load(open(FXF))
SB = r"""
(function(){
  const FX=window.__FX;
  function builder(table){ const st={op:'select',single:false,f:[]};
    const run=()=>{ if(st.op!=='select') return {data:null,error:null}; let rows=(FX[table]||[]).map(r=>({...r})); rows=rows.filter(r=>st.f.every(([c,v])=>{ if(!(c in r)) return true; return String(r[c]==null?'':r[c]).toLowerCase()===v.toLowerCase().replace(/\\/g,''); })); return st.single?{data:rows[0]||null,error:null}:{data:rows,error:null,count:rows.length}; };
    const p=new Proxy(function(){},{get(t,prop){ if(prop==='then') return (res,rej)=>Promise.resolve(run()).then(res,rej);
      if(['insert','update','delete','upsert'].includes(prop)) return ()=>{st.op=prop;return p;};
      if(prop==='eq'||prop==='ilike') return (c,v)=>{st.f.push([c,String(v)]);return p;};
      if(prop==='single'||prop==='maybeSingle') return ()=>{st.single=true;return p;};
      return ()=>p; }}); return p; }
  window.supabase={createClient:()=>({
    auth:{ getSession:async()=>({data:{session:{user:{email:'t@example.com'}}},error:null}), onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}), signOut:async()=>({}), signInWithOtp:async()=>({data:{},error:null}), verifyOtp:async()=>({data:{},error:null}), getUser:async()=>({data:{user:{email:'t@example.com'}},error:null}) },
    from:(t)=>builder(t), rpc:async()=>({data:{ok:true},error:null}),
    channel:()=>{const o={on(){return o},subscribe(){return o},unsubscribe(){}};return o;}, removeChannel(){},
    storage:{from:()=>({upload:async()=>({data:null,error:null}),getPublicUrl:()=>({data:{publicUrl:''}})})} })};
})();
"""
FREEZE = r"""
(function(){ const D=Date; const T=1790000000000; class FD extends D{ constructor(...a){ if(a.length===0) super(T); else super(...a);} static now(){ return T; } } window.Date=FD; Math.random=()=>0.42; window.__csp=[];
 document.addEventListener('securitypolicyviolation',e=>window.__csp.push(e.violatedDirective+' '+e.blockedURI)); })();
"""
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
socketserver.TCPServer.allow_reuse_address = True
httpd = socketserver.TCPServer(('127.0.0.1', PORT), functools.partial(Q, directory=ROOT)); threading.Thread(target=httpd.serve_forever, daemon=True).start()
def route(r):
    u = r.request.url
    if 'supabase-js' in u: return r.fulfill(body=SB, content_type='application/javascript')
    if 'jspdf' in u or 'xlsx' in u: return r.fulfill(body='', content_type='application/javascript')
    if 'fonts.googleapis.com' in u: return r.fulfill(body='', content_type='text/css')
    if u.startswith('http://127.0.0.1'): return r.continue_()
    return r.abort()
STEPS = {'bill-tracker.html': [['renderHome'],['renderCards'],['renderPlans'],['renderPartyGrid'],['renderOwedToMe'],['renderEt'],['renderNotifications'],['renderAdminUsers'],['renderDeletedHistory'],['openCardDetail',1],['showPayeeDetail',1],['openPartyDetail',1],['openOwedBreakdown'],['openSpendBreakdown'],['openBreakdown',1],['openHistoryBreakdown'],['openManageShares',1],['renderAccountList'],['openAdmin'],['renderShareList'],['loadAdminOwedList'],['loadAdminSpending'],['openEtModal'],['openPlanModal'],['openReport','t@example.com','2026-10-01','2026-10-31']],
         'index.html': [['renderSquad'],['renderExpenses'],['renderBalances'],['renderSettlements'],['renderPrevBals'],['openAdmin'],['renderAdminMembers'],['renderAdminExpenses'],['renderAdminBalances'],['showPersonDetail','m1'],['loadNtf'],['showPage','settle'],['showPage','history'],['showPage','admin']]}
res = {'steps': {}, 'errors': []}
with sync_playwright() as p:
    b = p.chromium.launch(); ctx = b.new_context(viewport={'width':390,'height':844}, is_mobile=True, has_touch=True); pg = ctx.new_page()
    pg.on('pageerror', lambda e: res['errors'].append(str(e)[:140])); pg.route('**/*', route)
    pg.add_init_script(script='window.__FX=' + json.dumps(FX) + ';'); pg.add_init_script(script=FREEZE)
    pg.goto(f'http://127.0.0.1:{PORT}/{PAGE}', wait_until='load'); pg.wait_for_timeout(2500)
    pg.evaluate("()=>{window.confirm=()=>false;window.prompt=()=>null;window.alert=()=>{};}")
    res['steps']['00_after_login'] = pg.evaluate("()=>{const c=document.body.cloneNode(true);c.querySelectorAll('script,style').forEach(e=>e.remove());return c.innerHTML}")
    for i, st in enumerate(STEPS[PAGE]):
        name, args = st[0], st[1:]
        out = pg.evaluate("async ([n,a])=>{ try{ const f=window[n]; if(typeof f!=='function') return 'NOFN'; await f(...a); const c=document.body.cloneNode(true);c.querySelectorAll('script,style').forEach(e=>e.remove());return c.innerHTML; }catch(e){ return 'ERR:'+e.message; } }", [name, args])
        res['steps'][f'{i+1:02d}_{name}'] = out; pg.wait_for_timeout(120)
    if HOSTILE:
        pg.evaluate("()=>{ document.querySelectorAll('[onclick]').forEach((el,i)=>{ if(i<600){ try{ el.click(); }catch(e){} } }); }"); pg.wait_for_timeout(600)
        res['pwned'] = pg.evaluate("()=>window.__pwned===undefined?0:window.__pwned")
        res['inj_img'] = pg.evaluate("()=>document.querySelectorAll('img[src=\"x\"]').length")
        res['inj_onerror_attr'] = pg.evaluate("()=>document.querySelectorAll('[onerror]').length")
    res['csp'] = pg.evaluate("()=>window.__csp")
    res['onscreen'] = pg.evaluate("()=>document.querySelector('.screen.active')?document.querySelector('.screen.active').id:'none'")
    b.close()
httpd.shutdown(); json.dump(res, open(OUT, 'w'))
print(PAGE, 'hostile' if HOSTILE else 'benign', 'screen:', res['onscreen'], '| steps:', len(res['steps']), '| page errors:', len(res['errors']), '| csp violations:', res['csp'][:3], '| pwned:', res.get('pwned'), 'img:', res.get('inj_img'), 'onerror:', res.get('inj_onerror_attr'))
