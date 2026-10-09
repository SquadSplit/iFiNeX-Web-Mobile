import json, openpyxl, os
from playwright.sync_api import sync_playwright
STUB=open('/home/claude/work/t/stub_supabase.js').read()
errors=[]; out={}
with sync_playwright() as p:
  b=p.chromium.launch(); ctx=b.new_context(viewport={'width':390,'height':844}, accept_downloads=True); pg=ctx.new_page()
  pg.on('pageerror',lambda e:errors.append('PAGEERR '+str(e)))
  pg.on('console',lambda m: errors.append('CONSOLE '+m.text) if m.type=='error' else None)
  pg.route('**/vendor/supabase.js',lambda r:r.fulfill(body=STUB,content_type='application/javascript'))
  pg.route('**/fonts.googleapis.com/**',lambda r:r.fulfill(body='',content_type='text/css')); pg.route('**/fonts.gstatic.com/**',lambda r:r.abort())
  pg.goto('http://localhost:8765/bill-tracker.html'); pg.wait_for_timeout(2200)
  # --- budget: add income through dialog
  pg.evaluate("goModule('budget')"); pg.wait_for_timeout(600)
  pg.evaluate("document.querySelector('[data-act=tab][data-v=salary]').click()"); pg.wait_for_timeout(200)
  pg.evaluate("document.querySelector('[data-act=in-add]').click()"); pg.wait_for_timeout(300)
  inputs=pg.query_selector_all('[data-i]')
  inputs[0].fill('Company salary'); inputs[2].fill('9500')
  pg.evaluate("document.querySelector('[data-x=ok]').click()"); pg.wait_for_timeout(700)
  out['income_rows']=pg.evaluate("__DB.bp_income.map(x=>[x.source,x.amount,x.month,x.user_email])")
  pg.evaluate("window.confirm=()=>true")
  pg.evaluate("document.querySelector('[data-act=apply-split]').click()"); pg.wait_for_timeout(900)
  out['items']=pg.evaluate("__DB.bp_items.length")
  out['rent']=pg.evaluate("(__DB.bp_items.find(x=>x.category==='Rent')||{}).planned")
  out['sum_planned']=pg.evaluate("Math.round(__DB.bp_items.reduce((a,x)=>a+x.planned,0)*100)/100")
  pg.evaluate("document.querySelector('[data-act=tab][data-v=overview]').click()"); pg.wait_for_timeout(300)
  pg.screenshot(path='/home/claude/work/t/budget1.png')
  pg.evaluate("document.querySelector('[data-act=tab][data-v=budget]').click()"); pg.wait_for_timeout(300)
  pg.screenshot(path='/home/claude/work/t/budget2.png')
  out['budget_text']=pg.evaluate("document.getElementById('bp-root').innerText.slice(0,260).replace(/\\n/g,' | ')")
  # --- template download for bills
  pg.evaluate("ifxXfer.open('bills')"); pg.wait_for_timeout(300)
  with pg.expect_download() as d: pg.click('#ifx-b-tpl')
  d.value.save_as('/home/claude/work/t/tpl.xlsx')
  wb=openpyxl.load_workbook('/home/claude/work/t/tpl.xlsx'); out['tpl_sheets']=wb.sheetnames; out['tpl_header']=[c.value for c in wb['Data'][1]]
  # export excel + pdf
  with pg.expect_download() as d: pg.click('#ifx-b-xl')
  d.value.save_as('/home/claude/work/t/exp.xlsx'); w2=openpyxl.load_workbook('/home/claude/work/t/exp.xlsx'); out['exp_rows']=[[c.value for c in r] for r in w2['Data'].iter_rows()]
  with pg.expect_download() as d: pg.click('#ifx-b-pdf')
  d.value.save_as('/home/claude/work/t/exp.pdf'); out['pdf_bytes']=os.path.getsize('/home/claude/work/t/exp.pdf')
  # import: build file with 3 good, 1 bad, 1 duplicate
  wi=openpyxl.Workbook(); ws=wi.active; ws.title='Data'
  ws.append(['Date *','Description *','Amount (AED) *','Category','Card name'])
  ws.append(['2026-10-07','Imported coffee',12.5,'food',''])
  ws.append(['08/10/2026','Imported taxi',30,'transport','ADCB Platinum'])
  ws.append(['2026-10-09','Bad amount','abc','food',''])
  ws.append(['2026-10-03','Lulu groceries',66.31,'food',''])       # duplicate
  ws.append(['2026-10-10','Unknown card',5,'other','Nope'])
  wi.save('/home/claude/work/t/imp.xlsx')
  pg.set_input_files('#ifx-file','/home/claude/work/t/imp.xlsx'); pg.wait_for_timeout(900)
  out['preview']=pg.evaluate("document.getElementById('ifx-prev').innerText.replace(/\\n/g,' | ').slice(0,420)")
  pg.screenshot(path='/home/claude/work/t/import_prev.png')
  pg.click('#ifx-go'); pg.wait_for_timeout(900)
  out['rpc_calls']=pg.evaluate("__CALLS.filter(c=>c[0]==='rpc')")
  out['bills_after']=pg.evaluate("__DB.bill_expenses.filter(x=>/Imported/.test(x.description)).map(x=>[x.description,x.amount,x.date,x.card_id,x.month])")
  # ET entries import with wrong tracker
  pg.evaluate("ifxXfer.open('et_entries')"); pg.wait_for_timeout(200)
  we=openpyxl.Workbook(); w=we.active; w.title='Data'; w.append(['Tracker title *','Date *','Category *','Amount *','Note'])
  w.append(['Groceries October 2026','2026-10-08','Groceries',19.5,'bread']); w.append(['Nope','2026-10-08','Groceries',5,'']); w.append(['Groceries October 2026','2026-11-08','Groceries',5,'outside'])
  we.save('/home/claude/work/t/imp_et.xlsx'); pg.set_input_files('#ifx-file','/home/claude/work/t/imp_et.xlsx'); pg.wait_for_timeout(700)
  out['et_preview']=pg.evaluate("document.getElementById('ifx-prev').innerText.replace(/\\n/g,' | ').slice(0,500)")
  pg.click('#ifx-go'); pg.wait_for_timeout(700); out['et_entries_total']=pg.evaluate("__DB.et_entries.length")
  # xss: malicious cell
  pg.evaluate("ifxXfer.open('cards')"); pg.wait_for_timeout(200)
  wx=openpyxl.Workbook(); w=wx.active; w.title='Data'; w.append(['Card name *','Due day (1-31)','Colour (#RRGGBB)','Reminders on (Yes/No)']); w.append(['<img src=x onerror=alert(1)>Evil',5,'#ff0000','yes'])
  wx.save('/home/claude/work/t/imp_x.xlsx'); pg.set_input_files('#ifx-file','/home/claude/work/t/imp_x.xlsx'); pg.wait_for_timeout(600); pg.click('#ifx-go'); pg.wait_for_timeout(700)
  out['xss_card']=pg.evaluate("__DB.bill_cards.map(c=>[c.card_name,c.color])")
  out['xss_injected']=pg.evaluate("document.querySelectorAll('img[src=x]').length")
  json.dump(out,open('/home/claude/work/t/out2.json','w'),indent=1,default=str); print(json.dumps(out,indent=1,default=str))
  b.close()
print('ERRORS:',errors[:10])
