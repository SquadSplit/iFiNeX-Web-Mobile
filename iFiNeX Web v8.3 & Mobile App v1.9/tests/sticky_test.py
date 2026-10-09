import sys, json, threading, functools, http.server, socketserver
from playwright.sync_api import sync_playwright
ROOT=sys.argv[1]; PORT=int(sys.argv[2]) if len(sys.argv)>2 else 8090
exec(open('/home/claude/tests/scroll_test.py').read().split("FIXTURE =")[0].split("PAGE = ")[0].split("ROOT = ")[0]) if False else None
MOCK=open('/home/claude/tests/scroll_test.py').read().split('MOCK = r"""')[1].split('"""')[0]
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
socketserver.TCPServer.allow_reuse_address=True
httpd=socketserver.TCPServer(('127.0.0.1',PORT),functools.partial(Q,directory=ROOT)); threading.Thread(target=httpd.serve_forever,daemon=True).start()
def route(r):
    u=r.request.url
    if 'supabase-js' in u: return r.fulfill(body=MOCK,content_type='application/javascript')
    if 'jspdf' in u or 'xlsx' in u: return r.fulfill(body='',content_type='application/javascript')
    if 'fonts.googleapis.com' in u: return r.fulfill(body='',content_type='text/css')
    if u.startswith('http://127.0.0.1'): return r.continue_()
    return r.abort()
JS="""()=>{document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
document.getElementById('screen-app').classList.add('active');
const pg=document.querySelector('.page');document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));pg.classList.add('active');
pg.insertAdjacentHTML('beforeend','<div style="height:3000px"></div>');window.scrollTo(0,800);
const h=document.querySelector('.app-header').getBoundingClientRect();
return {scrollY:Math.round(window.scrollY),headerTop:Math.round(h.top),bodyIsScroller:getComputedStyle(document.body).overflowY}}"""
res={}
with sync_playwright() as p:
    b=p.chromium.launch()
    for f in ('bill-tracker.html','index.html'):
        ctx=b.new_context(viewport={'width':390,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True); pg=ctx.new_page()
        pg.route('**/*',route); pg.goto(f'http://127.0.0.1:{PORT}/{f}',wait_until='load'); pg.wait_for_timeout(400)
        pg.wait_for_timeout(200); res[f]=pg.evaluate(JS); ctx.close()
    b.close()
httpd.shutdown(); print(json.dumps(res,indent=1))
