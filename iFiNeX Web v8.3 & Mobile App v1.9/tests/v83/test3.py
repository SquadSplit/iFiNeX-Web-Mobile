import json, base64
from playwright.sync_api import sync_playwright
STUB=open('/home/claude/work/t/stub_supabase.js').read()
errors=[]; out={}
IMG='data:image/png;base64,'+base64.b64encode(open('/home/claude/work/t/bg_land.png','rb').read()).decode()
with sync_playwright() as p:
  b=p.chromium.launch(); ctx=b.new_context(viewport={'width':390,'height':844}); pg=ctx.new_page()
  pg.on('pageerror',lambda e:errors.append('PAGEERR '+str(e)))
  pg.on('console',lambda m: errors.append('CONSOLE '+m.text) if m.type=='error' else None)
  pg.route('**/vendor/supabase.js',lambda r:r.fulfill(body=STUB,content_type='application/javascript'))
  pg.route('**/fonts.googleapis.com/**',lambda r:r.fulfill(body='',content_type='text/css')); pg.route('**/fonts.gstatic.com/**',lambda r:r.abort())
  pg.goto('http://localhost:8765/bill-tracker.html'); pg.wait_for_timeout(2200)
  # ---- appearance editor
  pg.evaluate("(u)=>{myAppearance.bg_url=u; myAppearance.theme='custom-photo'; applyBackground(u,0.3); openAppearance();}",IMG); pg.wait_for_timeout(700)
  out['info']=pg.evaluate("document.getElementById('bgx-info').innerText")
  out['note']=pg.evaluate("document.getElementById('bg-editor').innerText.includes('1080 × 2340')")
  def layer(): return pg.evaluate("(()=>{const l=document.getElementById('bg-photo-layer');return [l.style.backgroundSize,l.style.backgroundPosition,getComputedStyle(document.documentElement).getPropertyValue('--bg-photo-opacity').trim()]})()")
  out['layer_default']=layer()
  pg.evaluate("(()=>{const z=document.getElementById('bgx-zoom');z.value=200;z.dispatchEvent(new Event('input'));z.dispatchEvent(new Event('change'));const o=document.getElementById('bgx-op');o.value=60;o.dispatchEvent(new Event('input'));o.dispatchEvent(new Event('change'));})()")
  pg.wait_for_timeout(200); out['layer_zoom200_op60']=layer()
  box=pg.query_selector('#bgx-prev').bounding_box()
  pg.mouse.move(box['x']+box['width']/2,box['y']+box['height']/2); pg.mouse.down(); pg.mouse.move(box['x']+box['width']/2-60,box['y']+box['height']/2,steps=5); pg.mouse.up()
  pg.wait_for_timeout(900)
  out['after_drag_x']=pg.evaluate("document.getElementById('bgx-x-v').textContent"); out['layer_after_drag']=layer()
  out['upsert']=pg.evaluate("__CALLS.filter(c=>c[0]==='upsert').slice(-1)[0]")
  pg.evaluate("document.getElementById('bgx-fit').click()"); pg.wait_for_timeout(200); out['fit_zoom']=pg.evaluate("document.getElementById('bgx-zoom-v').textContent")
  pg.evaluate("document.getElementById('bgx-zoom').value=200; document.getElementById('bgx-zoom').dispatchEvent(new Event('input'));"); pg.wait_for_timeout(100)
  pg.screenshot(path='/home/claude/work/t/bgeditor.png')
  # ---- session restore logic
  res=pg.evaluate("""async()=>{
    const K=IFX_AUTH_KEY, S=IFX_AUTH_STORAGE, r={};
    const tok=JSON.stringify({access_token:'x',refresh_token:'rt',expires_at:1,user:{email:'a@b.c'}});
    // 1) storage redundancy: only IndexedDB has it
    await S.setItem(K,tok); localStorage.removeItem(K); r.idb_only=(await S.getItem(K))===tok; r.refilled=localStorage.getItem(K)===tok;
    // 2) transient network error twice then success
    let n=0; const sb1={auth:{getSession:async()=>({data:{session:null},error:null}),refreshSession:async()=>{n++; if(n<3) throw new Error('Failed to fetch'); return {data:{session:{user:{email:'a@b.c'}}},error:null}}}};
    const t0=Date.now(); const a=await ifxRestoreSession(sb1); r.transient={ok:!!a.session,tries:n,secs:Math.round((Date.now()-t0)/100)/10};
    // 3) fatal refresh error -> logged out + storage cleared
    const sb2={auth:{getSession:async()=>({data:{session:null},error:null}),refreshSession:async()=>({data:{session:null},error:{status:400,message:'Invalid Refresh Token: Already Used'}})}};
    const b2=await ifxRestoreSession(sb2); r.fatal={none:!!b2.none,cleared:(await S.getItem(K))===null};
    // 4) nothing stored -> none (login page)
    const b3=await ifxRestoreSession(sb2); r.nothing=!!b3.none;
    return r;}""")
  out['session']=res
  res2=pg.evaluate("""async()=>{ const S=IFX_AUTH_STORAGE,K=IFX_AUTH_KEY; await S.setItem(K,JSON.stringify({refresh_token:'rt'}));
    const sb={auth:{getSession:async()=>({data:{session:null},error:{message:'Failed to fetch'}}),refreshSession:async()=>{throw new Error('Failed to fetch')}}};
    const t0=Date.now(); const a=await ifxRestoreSession(sb); return {offline:!!a.offline,keptStoredSession:(await S.getItem(K))!==null,secs:Math.round((Date.now()-t0)/1000)};}""")
  out['offline']=res2
  json.dump(out,open('out3.json','w'),indent=1); print(json.dumps(out,indent=1))
  b.close()
print('ERRORS:',errors[:10])
