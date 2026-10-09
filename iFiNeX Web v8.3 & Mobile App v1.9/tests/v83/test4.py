import json
from playwright.sync_api import sync_playwright
STUB=open('/home/claude/work/t/stub_supabase.js').read()
errors=[]; out={}
with sync_playwright() as p:
  b=p.chromium.launch(); ctx=b.new_context(viewport={'width':390,'height':844}); pg=ctx.new_page()
  pg.on('pageerror',lambda e:errors.append('PAGEERR '+str(e)))
  pg.on('console',lambda m: errors.append('CONSOLE '+m.text) if m.type=='error' else None)
  pg.route('**/vendor/supabase.js',lambda r:r.fulfill(body=STUB,content_type='application/javascript'))
  pg.route('**/fonts.googleapis.com/**',lambda r:r.fulfill(body='',content_type='text/css')); pg.route('**/fonts.gstatic.com/**',lambda r:r.abort())
  pg.goto('http://localhost:8765/index.html'); pg.wait_for_timeout(2500)
  out['screen_app_active']=pg.evaluate("document.getElementById('screen-app').classList.contains('active')")
  out['login_active']=pg.evaluate("document.getElementById('screen-login').classList.contains('active')")
  out['boot_gone']=pg.evaluate("!document.getElementById('ifx-boot')")
  out['members']=pg.evaluate("typeof MEMBERS!=='undefined'&&MEMBERS.length")
  out['datasets']=pg.evaluate("typeof ifxXfer")
  pg.screenshot(path='/home/claude/work/t/squad.png')
  # seed an expense and test checkbox + dataset export columns
  pg.evaluate("""()=>{ const m=MEMBERS[0].id,n=MEMBERS[1].id; expenses.push({id:901,name:'Fuel',amount:50,paid_by:m,split_between:[m,n],date:viewMonth+'-07',category:'fuel',month:viewMonth},{id:902,name:'Fish',amount:80,paid_by:n,split_between:[m,n],date:viewMonth+'-07',category:'food',month:viewMonth}); renderExpenses(); }""")
  pg.wait_for_timeout(400)
  out['cb']=pg.evaluate("document.querySelectorAll('#expense-list .ifx-cb').length")
  for c in pg.query_selector_all('#expense-list .ifx-cb')[:2]: c.click()
  pg.wait_for_timeout(300); out['bar']=pg.evaluate("document.getElementById('ifx-selbar').innerText.replace(/\\n/g,' ')")
  pg.evaluate("ifxXfer.open('sq_expenses')"); pg.wait_for_timeout(300)
  out['dropdown']=pg.evaluate("[...document.querySelectorAll('#ifx-ds option')].map(o=>o.textContent)")
  pg.screenshot(path='/home/claude/work/t/squad_x.png')
  json.dump(out,open('out4.json','w'),indent=1); print(json.dumps(out,indent=1))
  b.close()
print('ERRORS:',errors[:10])
