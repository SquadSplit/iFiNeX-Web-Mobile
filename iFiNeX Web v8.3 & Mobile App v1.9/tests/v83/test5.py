import json
from playwright.sync_api import sync_playwright
STUB=open('/home/claude/work/t/stub_supabase.js').read()
errors=[]; out={}
with sync_playwright() as p:
  b=p.chromium.launch(); ctx=b.new_context(viewport={'width':390,'height':844}); pg=ctx.new_page()
  pg.on('pageerror',lambda e:errors.append('PAGEERR '+str(e)))
  pg.route('**/vendor/supabase.js',lambda r:r.fulfill(body=STUB,content_type='application/javascript'))
  pg.route('**/fonts.googleapis.com/**',lambda r:r.fulfill(body='',content_type='text/css')); pg.route('**/fonts.gstatic.com/**',lambda r:r.abort())
  # simulate the Android app: native platform + notification plugin stub
  pg.add_init_script("""window.Capacitor={isNativePlatform:()=>true,getPlatform:()=>'android',Plugins:{IfinexNotifier:{
     status:async()=>({notificationsAllowed:true,enabled:true,pollSeconds:120,lastOkAt:Date.now(),lastError:'',batteryUnrestricted:false}),
     prepare:async()=>({}),start:async()=>({}),stop:async()=>({}),openNotificationSettings:async()=>({})},
     LocalNotifications:{checkPermissions:async()=>({display:'granted'}),requestPermissions:async()=>({display:'granted'}),schedule:async()=>({}),cancel:async()=>({}),getPending:async()=>({notifications:[]})}}};""")
  pg.goto('http://localhost:8765/bill-tracker.html'); pg.wait_for_timeout(2500)
  pg.evaluate("openAlerts()"); pg.wait_for_timeout(1200)
  txt=pg.evaluate("document.getElementById('alerts-modal').innerText")
  out['modal_text_sample']=txt[:500]
  out['raw_tag_leak']=any(x in txt for x in ['<div','</','class=','style=','&lt;','&gt;'])
  # notification panel with hostile text
  pg.evaluate("""()=>{ notifRows=[{id:1,title:'<b>BOLD?</b>',message:'<img src=x onerror=window.__pwn=1> hi',created_at:new Date().toISOString(),is_read:false}]; }""")
  pg.screenshot(path='/home/claude/work/t/alerts.png')
  json.dump(out,open('out5.json','w'),indent=1); print(json.dumps(out,indent=1)); b.close()
print('ERRORS',errors[:5])
