import json, sys, time
from playwright.sync_api import sync_playwright
STUB=open('/home/claude/work/t/stub_supabase.js').read()
errors=[]
def run():
  with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':390,'height':844}, accept_downloads=True); pg=ctx.new_page()
    pg.on('pageerror',lambda e:errors.append('PAGEERR '+str(e)))
    pg.on('console',lambda m: errors.append('CONSOLE '+m.text) if m.type=='error' else None)
    pg.route('**/vendor/supabase.js',lambda r:r.fulfill(body=STUB,content_type='application/javascript'))
    pg.route('**/fonts.googleapis.com/**',lambda r:r.fulfill(body='',content_type='text/css'))
    pg.route('**/fonts.gstatic.com/**',lambda r:r.abort())
    # seed a stored session only in IndexedDB-equivalent: use localStorage key to trigger splash
    pg.goto('http://localhost:8765/bill-tracker.html'); pg.wait_for_timeout(2500)
    out={}
    out['hub_active']=pg.evaluate("document.getElementById('page-hub').classList.contains('active')")
    out['tiles']=pg.evaluate("document.querySelectorAll('.hub-tile').length")
    out['imgs_ok']=pg.evaluate("[...document.querySelectorAll('.hub-tile img, .hd-logo, .hd-word')].every(i=>i.complete&&i.naturalWidth>0)")
    out['boot_overlay_gone']=pg.evaluate("!document.getElementById('ifx-boot')")
    out['client_storage']=pg.evaluate("typeof __CLIENT_OPTS.auth.storage.getItem")
    pg.screenshot(path='/home/claude/work/t/hub.png')
    # bills page + checkboxes
    pg.evaluate("switchPage('home')"); pg.wait_for_timeout(500)
    out['cb_count']=pg.evaluate("document.querySelectorAll('#page-home .ifx-cb').length")
    cbs=pg.query_selector_all('#page-home .ifx-cb')
    for c in cbs[:3]: c.click()
    pg.wait_for_timeout(300)
    out['bar_text']=pg.evaluate("document.getElementById('ifx-selbar').innerText.replace(/\\n/g,' ')")
    pg.screenshot(path='/home/claude/work/t/bills_sel.png')
    pg.evaluate("switchPage('cards')"); pg.wait_for_timeout(300)
    out['bar_after_switch']=pg.evaluate("getComputedStyle(document.getElementById('ifx-selbar')).display")
    # ET list
    pg.evaluate("etTab='period';switchPage('et')"); pg.wait_for_timeout(700)
    out['et_tabs']=pg.evaluate("[...document.querySelectorAll('#et-root .ptab')].map(x=>x.innerText)")
    out['et_cb']=pg.evaluate("document.querySelectorAll('#et-root .ifx-cb').length")
    pg.screenshot(path='/home/claude/work/t/et.png')
    # budget
    pg.evaluate("goModule('budget')"); pg.wait_for_timeout(900)
    out['budget_text']=pg.evaluate("document.getElementById('bp-root').innerText.slice(0,160).replace(/\\n/g,' | ')")
    pg.screenshot(path='/home/claude/work/t/budget0.png')
    json.dump(out,open('/home/claude/work/t/out1.json','w'),indent=1); print(json.dumps(out,indent=1))
    b.close()
run(); print('ERRORS:',errors[:15])
