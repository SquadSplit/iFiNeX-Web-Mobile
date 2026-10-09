import sys, json, threading, functools, http.server, socketserver
from playwright.sync_api import sync_playwright
ROOT=sys.argv[1]; PORT=8090
SB_MOCK = r"""
(function(){
  function chain(table){ return new Proxy(function(){}, { get(t,p){ if(p==='then') return (res,rej)=>Promise.resolve({data:[],error:null,count:0}).then(res,rej);
      return (...a)=>{ window.__log.push(['sb.'+String(p), table, a]); return chain(table); }; } }); }
  window.supabase={createClient:()=>({
    auth:{ getSession:async()=>({data:{session:{user:{email:'T@Example.com'}}},error:null}), onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),
      signOut:async()=>{ window.__log.push(['signOut']); return {}; }, signInWithOtp:async()=>({data:{},error:null}), verifyOtp:async()=>({data:{},error:null}), getUser:async()=>({data:{user:{email:'t@example.com'}},error:null}) },
    from:(t)=>chain(t),
    rpc:async(name,args)=>{ window.__log.push(['rpc',name,args]); if(name==='register_device') return {data:{ok:true},error:null}; if(name==='unregister_device') return {data:{ok:true,removed:1},error:null}; return {data:null,error:null}; },
    channel:()=>{const o={on(){return o},subscribe(){return o},unsubscribe(){}};return o;}, removeChannel(){},
    storage:{from:()=>({upload:async()=>({data:null,error:null}),getPublicUrl:()=>({data:{publicUrl:''}})})}
  })};
})();
"""
BASE = r"""
(function(){
  let log=[]; try{ log=JSON.parse(sessionStorage.getItem('__log')||'[]'); }catch(e){}
  window.__log={ push:(x)=>{ log.push(x); try{ sessionStorage.setItem('__log',JSON.stringify(log)); }catch(e){} }, get:()=>log.slice(), clear:()=>{ log.length=0; sessionStorage.setItem('__log','[]'); } };
  window.confirm=()=>true; window.alert=(m)=>window.__log.push(['alert',String(m).slice(0,160)]);
})();
"""
LN = r"""
window.__lnperm = 'granted';
window.__LN = { checkPermissions: async()=>({display:window.__lnperm}), requestPermissions: async()=>{ window.__log.push(['LN.requestPermissions']); window.__lnperm='granted'; return {display:'granted'}; },
  schedule: async(a)=>{ window.__log.push(['LN.schedule', JSON.parse(JSON.stringify(a))]); return {}; }, getPending: async()=>({notifications:[]}), cancel: async()=>{} };
"""
NATIVE = r"""
(function(){
  const st={available:true,enabled:false,deviceId:'',email:'',pollSeconds:120,notificationsAllowed:true,batteryUnrestricted:false,lastOkAt:0,lastError:'',sdk:34};
  window.__st=st;
  window.__IN={ status:async()=>({...st}),
    prepare:async(o)=>{ window.__log.push(['native.prepare',o]); st.deviceId='dev-uuid-1'; st.email=o.email.toLowerCase(); return {deviceId:'dev-uuid-1',secret:'S'.repeat(43),fresh:true,label:'Google Pixel 7'}; },
    start:async(o)=>{ window.__log.push(['native.start',o]); st.enabled=true; return {...st,baselineOk:true}; },
    stop:async()=>{ window.__log.push(['native.stop']); st.enabled=false; st.deviceId=''; st.email=''; return {...st}; },
    requestBatteryExemption:async()=>{ window.__log.push(['native.battery']); st.batteryUnrestricted=true; },
    openNotificationSettings:async()=>{ window.__log.push(['native.openNotifSettings']); },
    testLocal:async()=>{ window.__log.push(['native.testLocal']); return {allowed:true}; },
    checkNow:async()=>{ window.__log.push(['native.checkNow']); return {...st,result:1}; } };
  window.Capacitor={ isNativePlatform:()=>true, Plugins:{ LocalNotifications: window.__LN, IfinexNotifier: window.__IN } };
})();
"""
IOS  = r"window.Capacitor={ isNativePlatform:()=>true, Plugins:{ LocalNotifications: window.__LN } };"
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
socketserver.TCPServer.allow_reuse_address=True
httpd=socketserver.TCPServer(('127.0.0.1',PORT),functools.partial(Q,directory=ROOT)); threading.Thread(target=httpd.serve_forever,daemon=True).start()
def route(r):
    u=r.request.url
    if 'supabase-js' in u: return r.fulfill(body=SB_MOCK,content_type='application/javascript')
    if 'jspdf' in u or 'xlsx' in u: return r.fulfill(body='',content_type='application/javascript')
    if 'fonts.googleapis.com' in u: return r.fulfill(body='',content_type='text/css')
    if u.startswith('http://127.0.0.1'): return r.continue_()
    return r.abort()
R=[]
def ok(n,c,x=''):
    R.append((bool(c),n,x)); print(('PASS ' if c else 'FAIL ')+n+(('  -> '+str(x)[:230]) if (x and not c) else ''))
def idx(log,pred):
    for i,e in enumerate(log):
        if pred(e): return i
    return -1
def newpage(b,init,url='bill-tracker.html'):
    ctx=b.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True); pg=ctx.new_page(); errs=[]
    pg.on('pageerror',lambda e: errs.append(str(e)[:200])); pg.route('**/*',route)
    for s in init: pg.add_init_script(script=s)
    pg.goto(f'http://127.0.0.1:{PORT}/{url}',wait_until='load'); pg.wait_for_timeout(600); return ctx,pg,errs
SHOW="()=>{document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));document.getElementById('screen-app').classList.add('active');}"
with sync_playwright() as p:
    b=p.chromium.launch()
    # ================= ANDROID (bill-tracker.html) =================
    ctx,pg,errs=newpage(b,[BASE,LN,NATIVE]); pg.evaluate(SHOW); pg.evaluate("()=>{me={email:'t@example.com',name:'T',is_admin:false};managing=me;}")
    pg.evaluate("()=>window.__log.clear()")
    st=pg.evaluate("()=>ifxAlertsStatus()"); ok('A1 status() reaches the native plugin, alerts start OFF', st and st['enabled'] is False and st['available'])
    pg.evaluate("()=>refreshPushUI()"); pg.wait_for_timeout(200)
    ok('A2 home banner offers background-alerts setup', 'Get alerts even when iFiNeX is closed' in pg.evaluate("()=>document.getElementById('push-banner').innerHTML"))
    pg.evaluate("()=>openAlerts()"); pg.wait_for_timeout(200)
    body=pg.evaluate("()=>document.getElementById('alerts-body').innerText")
    ok('A3 modal opens and shows permission/alerts/battery rows', pg.evaluate("()=>document.getElementById('alerts-modal').classList.contains('open')") and 'Background alerts' in body and 'Battery setting' in body and 'OFF' in body, body)
    ok('A3b NO raw HTML shown as text (regression: v1.7 printed <span>/<button> tags)', not any(t in pg.evaluate("()=>document.getElementById('alerts-body').innerText") for t in ('<span','<button','onclick=','style=')), pg.evaluate("()=>document.getElementById('alerts-body').innerText")[:160])
    ok('A3c chips and buttons are real elements', pg.evaluate("()=>document.querySelectorAll('#alerts-body button').length")>=3 and pg.evaluate("()=>document.querySelectorAll('#alerts-body span[style*=\"font-weight:800\"]').length")>=2)
    pg.evaluate("()=>alertsOn()"); pg.wait_for_timeout(300); log=pg.evaluate("()=>window.__log.get()")
    prep=[e for e in log if e[0]=='native.prepare']; reg=[e for e in log if e[0]=='rpc' and e[1]=='register_device']; start=[e for e in log if e[0]=='native.start']
    ok('A4 prepare() gets https url + anon key + LOWER-CASED session email', prep and prep[0][1]['url'].startswith('https://') and prep[0][1]['anonKey'].startswith('eyJ') and prep[0][1]['email']=='t@example.com', prep)
    ok('A5 register_device RPC payload (device id, 43-char secret, label, android)', reg and reg[0][2]=={'p_device_id':'dev-uuid-1','p_secret':'S'*43,'p_label':'Google Pixel 7','p_platform':'android'}, reg)
    ok('A6 order is prepare -> register_device -> start (never start before the server knows the phone)', idx(log,lambda e:e[0]=='native.prepare')<idx(log,lambda e:e[0]=='rpc' and e[1]=='register_device')<idx(log,lambda e:e[0]=='native.start'), [e[0] for e in log])
    ok('A7 start() asked for 120 s polling', start and start[0][1]=={'pollSeconds':120}, start)
    ok('A8 modal flips to ON + "Turn off"; want-flag stored for auto-resume', 'ON' in pg.evaluate("()=>document.getElementById('alerts-body').innerText") and pg.evaluate("()=>localStorage.getItem('ifx_alerts_want')")=='t@example.com')
    ok('A8b NO raw HTML shown as text (regression: v1.7 printed <span>/<button> tags)', not any(t in pg.evaluate("()=>document.getElementById('alerts-body').innerText") for t in ('<span','<button','onclick=','style=')), pg.evaluate("()=>document.getElementById('alerts-body').innerText")[:160])
    ok('A8c chips and buttons are real elements', pg.evaluate("()=>document.querySelectorAll('#alerts-body button').length")>=3 and pg.evaluate("()=>document.querySelectorAll('#alerts-body span[style*=\"font-weight:800\"]').length")>=2)
    pg.evaluate("()=>window.__log.clear()"); pg.evaluate("()=>popNotification('Rent paid','AED 500',42)"); pg.wait_for_timeout(300)
    ok('A9 alerts ON => JS does NOT post a second OS notification (native checker owns it)', not [e for e in pg.evaluate("()=>window.__log.get()") if e[0]=='LN.schedule'])
    pg.evaluate("()=>alertsOff()"); pg.wait_for_timeout(300); log=pg.evaluate("()=>window.__log.get()")
    ok('A10 turning off unregisters on the server THEN stops the phone', idx(log,lambda e:e[0]=='rpc' and e[1]=='unregister_device' and e[2]=={'p_device_id':'dev-uuid-1'})>=0 and idx(log,lambda e:e[0]=='rpc' and e[1]=='unregister_device')<idx(log,lambda e:e[0]=='native.stop'), [e[0] for e in log])
    ok('A11 explicit OFF clears the want-flag', pg.evaluate("()=>localStorage.getItem('ifx_alerts_want')") is None)
    pg.evaluate("()=>window.__log.clear()"); pg.evaluate("()=>popNotification('Rent paid','AED 500',42)"); pg.wait_for_timeout(500)
    ls=[e for e in pg.evaluate("()=>window.__log.get()") if e[0]=='LN.schedule']
    n=ls[0][1]['notifications'][0] if ls else {}
    ok('A12 alerts OFF => fallback local notification with channel + shared id (1000000+42)', n.get('id')==1000042 and n.get('channelId')=='ifinex_alerts' and n.get('title')=='Rent paid', n)
    pg.evaluate("()=>window.__log.clear()"); pg.evaluate("()=>popNotification('No id','x')"); pg.wait_for_timeout(400)
    n2=[e for e in pg.evaluate("()=>window.__log.get()") if e[0]=='LN.schedule'][0][1]['notifications'][0]
    ok('A13 id-less pop-up uses the free range (100000-899999), not the reminder range', 100000<=n2['id']<900000, n2)
    pg.evaluate("()=>{myPlans=[{id:1,title:'Phone',installments:12}];myPlanPays=[{plan_id:1,status:'pending',seq:3,amount:424.91,due_date:new Date(Date.now()+5*864e5).toISOString().slice(0,10)}];myCards=[{card_name:'Visa',due_day:15,reminder_enabled:true}];}")
    pg.evaluate("()=>window.__log.clear()"); pg.evaluate("()=>scheduleDueNotifs()"); pg.wait_for_timeout(500)
    sch=[e for e in pg.evaluate("()=>window.__log.get()") if e[0]=='LN.schedule']
    lst=sch[0][1]['notifications'] if sch else []
    ok('A14 due-date reminders all use the ifinex_due channel', lst and all(x.get('channelId')=='ifinex_due' for x in lst), lst[:2])
    # re-enable, then test buttons
    pg.evaluate("()=>alertsOn()"); pg.wait_for_timeout(300); pg.evaluate("()=>window.__log.clear()")
    pg.evaluate("()=>alertsTestLocal()"); pg.wait_for_timeout(200)
    pg.evaluate("()=>alertsTestServer()"); pg.wait_for_timeout(1700); log=pg.evaluate("()=>window.__log.get()")
    ins=[e for e in log if e[0]=='sb.insert']
    ok('A15 "Test on this phone" calls the native test', idx(log,lambda e:e[0]=='native.testLocal')>=0)
    ok('A16 "Test via server" inserts a row for ME then forces a native check', ins and ins[0][1]=='bill_notifications' and ins[0][2][0]['recipient_email']=='t@example.com' and idx(log,lambda e:e[0]=='native.checkNow')>idx(log,lambda e:e[0]=='sb.insert'), log)
    pg.evaluate("()=>alertsBattery()"); pg.wait_for_timeout(1800)
    ok('A17 battery "Fix" opens the exemption dialog and the row turns green', 'Unrestricted' in pg.evaluate("()=>document.getElementById('alerts-body').innerText"))
    pg.evaluate("()=>{window.__st.lastError='<img src=x onerror=window.__pwned=1>';}"); pg.evaluate("()=>renderAlerts()"); pg.wait_for_timeout(300)
    ok('A17b hostile last-error text is shown as text, never executed', pg.evaluate("()=>window.__pwned===undefined") and pg.evaluate("()=>document.querySelectorAll('#alerts-body img').length")==0 and '<img' in pg.evaluate("()=>document.getElementById('alerts-body').innerText"))
    pg.evaluate("()=>{window.__st.lastError='';}")
    # logout ordering
    pg.evaluate("()=>window.__log.clear()")
    try: pg.evaluate("()=>logout()")
    except Exception: pass
    pg.wait_for_timeout(1200)
    log=pg.evaluate("()=>window.__log.get()")
    iu=idx(log,lambda e:e[0]=='rpc' and e[1]=='unregister_device'); ist=idx(log,lambda e:e[0]=='native.stop'); iso=idx(log,lambda e:e[0]=='signOut')
    ok('A18 logout: unregister_device -> native stop -> signOut (credential revoked BEFORE the session dies)', 0<=iu<ist<iso, [e[0] for e in log])
    ok('A19 logout keeps the want-flag so alerts come back for the same person', pg.evaluate("()=>localStorage.getItem('ifx_alerts_want')")=='t@example.com')
    ok('A20 no uncaught page errors in the Android scenario', not errs, errs)
    ctx.close()
    # ---- resume scenarios (fresh page each) ----
    ctx,pg,errs=newpage(b,[BASE,LN,NATIVE]); pg.evaluate("()=>localStorage.setItem('ifx_alerts_want','t@example.com')"); pg.evaluate("()=>window.__log.clear()")
    pg.evaluate("()=>ifxAlertsResume()"); pg.wait_for_timeout(400); log=pg.evaluate("()=>window.__log.get()")
    ok('R1 resume re-enables for the SAME person after login', idx(log,lambda e:e[0]=='rpc' and e[1]=='register_device')>=0 and idx(log,lambda e:e[0]=='native.start')>=0, [e[0] for e in log])
    pg.evaluate("()=>{localStorage.setItem('ifx_alerts_want','someone-else@x.com');}"); pg.evaluate("()=>window.__IN.stop()"); pg.evaluate("()=>window.__log.clear()")
    pg.evaluate("()=>ifxAlertsResume()"); pg.wait_for_timeout(300)
    ok('R2 resume does NOT enable alerts for a different person', not [e for e in pg.evaluate("()=>window.__log.get()") if e[0] in ('native.start','native.prepare')])
    pg.evaluate("()=>{window.__st.enabled=true;window.__st.deviceId='dev-OLD';window.__st.email='a@x.com';localStorage.setItem('ifx_alerts_want','a@x.com');}"); pg.evaluate("()=>window.__log.clear()")
    pg.evaluate("()=>ifxAlertsResume()"); pg.wait_for_timeout(300); log=pg.evaluate("()=>window.__log.get()")
    ok("R3 someone else's running alerts are shut down when another person signs in", idx(log,lambda e:e[0]=='native.stop')>=0 and pg.evaluate("()=>localStorage.getItem('ifx_alerts_want')") is None, [e[0] for e in log])
    ctx.close()
    # ================= iPhone-like (no IfinexNotifier) =================
    ctx,pg,errs=newpage(b,[BASE,LN,IOS]); pg.evaluate(SHOW); pg.evaluate("()=>openAlerts()"); pg.wait_for_timeout(200)
    ok('I1 iPhone: modal explains the APNs limit honestly', 'APNs' in pg.evaluate("()=>document.getElementById('alerts-body').innerText"))
    ok('I2 iPhone: enable is a safe no-op', pg.evaluate("()=>ifxAlertsEnable(true)") is False and not errs, errs)
    ctx.close()
    # ================= plain browser =================
    ctx,pg,errs=newpage(b,[BASE]); pg.evaluate(SHOW); pg.evaluate("()=>openAlerts()"); pg.wait_for_timeout(200)
    ok('W1 website: modal points to browser notifications, no crash', 'website' in pg.evaluate("()=>document.getElementById('alerts-body').innerText") and not errs, errs)
    ctx.close()
    # ================= index.html (Squad Split) =================
    ctx,pg,errs=newpage(b,[BASE,LN,NATIVE],'index.html'); pg.wait_for_timeout(300)
    pg.evaluate("()=>{localStorage.setItem('ifx_alerts_want','t@example.com');window.__st.enabled=true;window.__st.deviceId='dev-uuid-1';window.__st.email='t@example.com';currentUser={name:'T',emoji:'x',email:'t@example.com'};document.getElementById('screen-login').classList.remove('active');document.getElementById('screen-app').classList.add('active');}")
    pg.evaluate("()=>window.__log.clear()")
    try: pg.evaluate("()=>logout()")
    except Exception: pass
    pg.wait_for_timeout(700); log=pg.evaluate("()=>window.__log.get()")
    iu=idx(log,lambda e:e[0]=='rpc' and e[1]=='unregister_device'); ist=idx(log,lambda e:e[0]=='native.stop'); iso=idx(log,lambda e:e[0]=='signOut')
    ok('S1 index.html logout now really signs out, after revoking alerts (was: never signed out)', 0<=iu<ist<iso, [e[0] for e in log])
    ok('S2 updateExpSplit is defined (was a ReferenceError on every checkbox tick)', pg.evaluate("()=>typeof updateExpSplit")=='function')
    ok('S3 index.html: login screen is back after logout', pg.evaluate("()=>document.getElementById('screen-login').classList.contains('active')"))
    ctx.close(); b.close()
httpd.shutdown()
fails=[x for x in R if not x[0]]; print(f"\n{len(R)-len(fails)}/{len(R)} checks passed"); sys.exit(1 if fails else 0)
