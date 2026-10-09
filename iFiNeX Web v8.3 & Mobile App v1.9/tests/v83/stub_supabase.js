// Minimal in-memory Supabase stand-in for UI tests (NOT the real library)
(function(){
  const DB = window.__DB = window.__DB || {
    app_users:[{id:1,email:'abdullah@test.io',name:'Abdullah',emoji:'😎',color:'#4d96ff',is_admin:true,group_type:'squad_split',delegate_email:null}],
    app_users_directory:[{email:'abdullah@test.io',name:'Abdullah'},{email:'ahmed@test.io',name:'Ahmed'}],
    bill_cards:[{id:1,user_email:'abdullah@test.io',card_name:'ADCB Platinum',color:'#4d96ff',due_day:12,reminder_enabled:true,created_at:'2026-01-01'}],
    bill_expenses:[
      {id:1,user_email:'abdullah@test.io',description:'Lulu groceries',amount:66.31,card_id:1,category:'food',date:'2026-10-03',month:'2026-10'},
      {id:2,user_email:'abdullah@test.io',description:'Fuel',amount:120,card_id:null,category:'transport',date:'2026-10-05',month:'2026-10'},
      {id:3,user_email:'abdullah@test.io',description:'Dinner',amount:159,card_id:null,category:'food',date:'2026-10-06',month:'2026-10'}],
    bill_owed:[],bill_settlements:[],bill_payees:[],bill_payee_entries:[],bill_card_payments:[],bill_card_shares:[],bill_plans:[],bill_plan_payments:[],bill_notifications:[],
    bill_user_prefs:[],et_trackers:[{id:1,user_email:'abdullah@test.io',kind:'period',title:'Groceries October 2026',currency:'AED',start_date:'2026-10-01',end_date:'2026-10-31',participants:[],notes:''},
      {id:2,user_email:'abdullah@test.io',kind:'period',title:'Foods Mess October 2026',currency:'AED',start_date:'2026-10-01',end_date:'2026-10-31',participants:[],notes:''}],
    et_entries:[{id:1,tracker_id:1,user_email:'abdullah@test.io',category:'Groceries',amount:40,entry_date:'2026-10-02',note:'',spent_by:'abdullah@test.io'},{id:2,tracker_id:1,user_email:'abdullah@test.io',category:'Groceries',amount:26.31,entry_date:'2026-10-04',note:'milk',spent_by:'abdullah@test.io'}],
    et_categories:[],bp_income:[],bp_items:[],bp_goals:[],
    members_config:[{id:'khan',name:'Khan',emoji:'😎',color:'#4d96ff',is_admin:true,email:'abdullah@test.io',sort_order:1},{id:'naina',name:'Naina',emoji:'👩',color:'#ff92d0',is_admin:false,email:'n@t.io',sort_order:2}],expenses:[],prev_balances:[],settlements:[]
  };
  window.__CALLS = [];
  let seq = 1000;
  function builder(table){
    const q={table,op:'select',filters:[],payload:null,single:false,ord:null};
    const run=()=>{
      let rows=(DB[table]=DB[table]||[]);
      const like=(a,b)=>String(a||'').toLowerCase()===String(b||'').toLowerCase().replace(/\\/g,'');
      const match=r=>q.filters.every(f=>f[0]==='eq'?String(r[f[1]])===String(f[2]):f[0]==='ilike'?like(r[f[1]],f[2]):true);
      if(q.op==='select'){let out=rows.filter(match); if(q.ord) out=out.slice().sort((a,b)=>(a[q.ord.c]>b[q.ord.c]?1:-1)*(q.ord.asc?1:-1)); if(q.lim) out=out.slice(0,q.lim); return q.single?{data:out[0]||null,error:null}:{data:out,error:null};}
      if(q.op==='insert'){const arr=Array.isArray(q.payload)?q.payload:[q.payload]; const made=arr.map(p=>({id:++seq,created_at:new Date().toISOString(),...p})); rows.push(...made); window.__CALLS.push(['insert',table,arr.length]); return {data:q.single?made[0]:made,error:null};}
      if(q.op==='update'){rows.filter(match).forEach(r=>Object.assign(r,q.payload)); return {data:null,error:null};}
      if(q.op==='delete'){DB[table]=rows.filter(r=>!match(r)); return {data:null,error:null};}
      if(q.op==='upsert'){const k=q.payload.user_email; const ex=rows.find(r=>r.user_email===k); if(ex) Object.assign(ex,q.payload); else rows.push({id:++seq,...q.payload}); window.__CALLS.push(['upsert',table,q.payload]); return {data:null,error:null};}
    };
    const api={
      select(){ if(q.op==='select'){} return api; }, insert(p){q.op='insert';q.payload=p;return api;}, update(p){q.op='update';q.payload=p;return api;}, delete(){q.op='delete';return api;}, upsert(p){q.op='upsert';q.payload=p;return api;},
      eq(c,v){q.filters.push(['eq',c,v]);return api;}, ilike(c,v){q.filters.push(['ilike',c,v]);return api;}, in(){return api;}, order(c,o){q.ord={c,asc:!o||o.ascending!==false};return api;}, limit(n){q.lim=n;return api;},
      maybeSingle(){q.single=true;return Promise.resolve(run());}, single(){q.single=true;return Promise.resolve(run());},
      then(res,rej){return Promise.resolve(run()).then(res,rej);}
    };
    return api;
  }
  const session={access_token:'a',refresh_token:'r',expires_at:9999999999,user:{email:'abdullah@test.io'}};
  window.supabase={createClient:function(url,key,opts){
    window.__CLIENT_OPTS=opts;
    return {
      from:builder,
      rpc:async function(fn,args){window.__CALLS.push(['rpc',fn,args.p_kind,(args.p_rows||[]).length]); if(fn==='ifx_bulk_import'){ const t=args.p_kind; (DB[t]=DB[t]||[]).push(...args.p_rows.map((r,i)=>({id:++seq,user_email:args.p_owner,month:(r.date||'').slice(0,7)||r.month,...r}))); return {data:{ok:true,inserted:args.p_rows.length},error:null}; } return {data:null,error:null};},
      auth:{ getSession:async()=>({data:{session:window.__NOSESSION?null:session},error:null}), refreshSession:async()=>({data:{session},error:null}), onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}), signOut:async()=>{ await window.IFX_AUTH_STORAGE.removeItem('squadsplit-auth-v1'); return {error:null}; }, signInWithOtp:async()=>({error:null}), verifyOtp:async()=>({error:null}) },
      storage:{from:()=>({upload:async()=>({error:null}),getPublicUrl:(p)=>({data:{publicUrl:window.__BGURL||''}})})},
      channel:()=>({on(){return this;},subscribe(){return this;}}), removeChannel(){}, removeAllChannels(){}
    };
  }};
})();
