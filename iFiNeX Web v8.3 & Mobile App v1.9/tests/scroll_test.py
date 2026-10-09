import sys, json, threading, functools, http.server, socketserver
from playwright.sync_api import sync_playwright

ROOT = sys.argv[1]; TAG = sys.argv[2]; PORT = int(sys.argv[3]) if len(sys.argv) > 3 else 8090
PAGE = sys.argv[4] if len(sys.argv) > 4 else 'bill-tracker.html'

MOCK = r"""
(function(){
  function chain(result){
    return new Proxy(function(){}, {
      get(t,prop){ if(prop==='then') return (res,rej)=>Promise.resolve(result).then(res,rej); return (...a)=>chain(result); },
      apply(){ return chain(result); }
    });
  }
  const auth={
    getSession:()=>Promise.resolve({data:{session:null},error:null}),
    onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),
    signOut:()=>Promise.resolve({}), signInWithOtp:()=>Promise.resolve({data:{},error:null}),
    verifyOtp:()=>Promise.resolve({data:{},error:null}), getUser:()=>Promise.resolve({data:{user:null},error:null}),
    refreshSession:()=>Promise.resolve({data:{session:null},error:null}),
  };
  const ch=()=>{const o={on(){return o},subscribe(){return o},unsubscribe(){}};return o;};
  window.supabase={createClient:()=>({auth,from:()=>chain({data:[],error:null,count:0}),rpc:()=>chain({data:null,error:null}),channel:ch,removeChannel(){},storage:{from:()=>({upload:()=>Promise.resolve({data:null,error:null}),getPublicUrl:()=>({data:{publicUrl:''}})})}})};
})();
"""

FIXTURE = r"""
() => {
  const dues=['2026-02-28','2026-03-30','2026-04-30','2026-05-30','2026-06-30','2026-07-30','2026-08-30','2026-09-30','2026-10-30','2026-11-30','2026-12-30','2027-01-30'];
  myPlans=[{id:1,title:'Naina iphone 17 pro max',plan_type:'epp',event_name:'Apple',ledger:'mine',card_id:null,payee_id:null,total_amount:5099.00,start_date:'2026-02-01',end_date:'2027-01-30',due_day:30,notes:''}];
  myPlanPays=dues.map((d,i)=>({id:100+i,plan_id:1,seq:i+1,due_date:d,amount:424.91,status:i<4?'paid':'pending',paid_at:i<4?'2026-09-30T10:00:00Z':null}));
  myCards=[]; sharedCardsForPlans=[]; myPayees=[]; managing={email:'t@example.com'};
  planOpen={1:true}; planTab={1:'payments'};
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById('screen-app').classList.add('active');
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('page-plans').classList.add('active');
  renderPlans();
}
"""

MEASURE = r"""
() => {
  const r=e=>{const b=e.getBoundingClientRect();return {left:Math.round(b.left),right:Math.round(b.right),w:Math.round(b.width)}};
  const page=document.getElementById('page-plans'), sc=document.querySelector('.plan-scroll'), tbl=sc&&sc.querySelector('table');
  const btns=sc?[...sc.querySelectorAll('tbody tr:nth-child(5) .btn-tiny')]:[];
  return {
    innerWidth, docScrollWidth:document.documentElement.scrollWidth,
    page:r(page), planScroll:sc?r(sc):null, table:tbl?r(tbl):null,
    scClient:sc?sc.clientWidth:null, scScrollW:sc?sc.scrollWidth:null, scScrollLeft:sc?sc.scrollLeft:null,
    lastBtnRight: btns.length?Math.round(btns[btns.length-1].getBoundingClientRect().right):null,
    bodyOverflowX:getComputedStyle(document.body).overflowX, htmlOverflowX:getComputedStyle(document.documentElement).overflowX,
    pageMargins:getComputedStyle(page).marginLeft+' / '+getComputedStyle(page).marginRight
  };
}
"""

class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
handler = functools.partial(Q, directory=ROOT)
socketserver.TCPServer.allow_reuse_address = True
httpd = socketserver.TCPServer(('127.0.0.1', PORT), handler)
threading.Thread(target=httpd.serve_forever, daemon=True).start()

def route(r):
    u = r.request.url
    if 'supabase-js' in u: return r.fulfill(body=MOCK, content_type='application/javascript')
    if 'jspdf' in u or 'xlsx' in u: return r.fulfill(body='', content_type='application/javascript')
    if 'fonts.googleapis.com' in u: return r.fulfill(body='', content_type='text/css')
    if u.startswith('http://127.0.0.1') : return r.continue_()
    return r.abort()

out = {}
with sync_playwright() as p:
    b = p.chromium.launch()
    for mode, kw in (('mobile', dict(viewport={'width':390,'height':844}, device_scale_factor=3, is_mobile=True, has_touch=True)),
                     ('desktop', dict(viewport={'width':1280,'height':800}))):
        ctx = b.new_context(**kw); pg = ctx.new_page(); errs=[]
        pg.on('pageerror', lambda e: errs.append(str(e)[:160]))
        pg.route('**/*', route)
        pg.goto(f'http://127.0.0.1:{PORT}/{PAGE}', wait_until='load'); pg.wait_for_timeout(500)
        pg.evaluate(FIXTURE); pg.wait_for_timeout(300)
        m = pg.evaluate(MEASURE)
        if mode == 'mobile':
            cdp = ctx.new_cdp_session(pg)
            box = pg.evaluate("()=>{const b=document.querySelector('.plan-scroll').getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+Math.min(b.height/2,80)}}")
            x,y=box['x'],box['y']
            cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x+120,'y':y}]})
            for i in range(1,13):
                cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x+120-i*20,'y':y}]}); pg.wait_for_timeout(16)
            cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
            pg.wait_for_timeout(500)
            after = pg.evaluate(MEASURE)
            m['AFTER_SWIPE_scrollLeft'] = after['scScrollLeft']; m['AFTER_SWIPE_lastBtnRight'] = after['lastBtnRight']
            m['AFTER_SWIPE_docScrollLeft'] = pg.evaluate("()=>document.scrollingElement.scrollLeft")
        pg.screenshot(path=f'/home/claude/out/{TAG}_{mode}.png')
        m['pageerrors'] = errs[:3]; out[mode] = m; ctx.close()
    b.close()
httpd.shutdown()
print(json.dumps(out, indent=1))
