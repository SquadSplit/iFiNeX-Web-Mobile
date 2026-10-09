// finds helpers whose PARAMETERS are interpolated through esc() inside HTML templates while some CALLER passes ready-made HTML
const acorn=require('/tmp/astwork/node_modules/acorn'); const fs=require('fs');
for (const file of process.argv.slice(2)) {
  const html=fs.readFileSync(file,'utf8'); let best=null,m; const re=/<script>([\s\S]*?)<\/script>/g; while((m=re.exec(html))) if(!best||m[1].length>best.length) best=m[1];
  const ast=acorn.parse(best,{ecmaVersion:2022,sourceType:'script',allowReturnOutsideFunction:true,ranges:true});
  const TAG=/<[a-zA-Z\/!]/; const isFn=n=>n&&(n.type==='FunctionDeclaration'||n.type==='FunctionExpression'||n.type==='ArrowFunctionExpression');
  const kids=n=>{const o=[];for(const k in n){if(k==='range'||k==='start'||k==='end'||k==='type')continue;const v=n[k];if(Array.isArray(v))v.forEach(x=>x&&typeof x.type==='string'&&o.push(x));else if(v&&typeof v.type==='string')o.push(v);}return o;};
  const walk=(n,f,anc=[])=>{f(n,anc);for(const c of kids(n))walk(c,f,anc.concat([n]));};
  // 1) html-returning function names (named decl / const arrow)
  const htmlish=(n,fns)=>{ if(!n) return false; switch(n.type){ case 'TemplateLiteral': return n.quasis.some(q=>TAG.test(q.value.raw)); case 'Literal': return typeof n.value==='string'&&TAG.test(n.value); case 'BinaryExpression': return n.operator==='+'&&(htmlish(n.left,fns)||htmlish(n.right,fns)); case 'ConditionalExpression': return htmlish(n.consequent,fns)||htmlish(n.alternate,fns); case 'LogicalExpression': return htmlish(n.right,fns); case 'CallExpression': { const c=n.callee; if(c.type==='MemberExpression'&&!c.computed&&c.property.name==='join'&&n.arguments[0]&&n.arguments[0].type==='Literal'&&n.arguments[0].value==='') return true; return c.type==='Identifier'&&fns.has(c.name);} } return false; };
  const fns=new Set();
  for(let p=0;p<5;p++) walk(ast,n=>{ const ret=f=>{let r=false; if(f.expression) return htmlish(f.body,fns); walk(f.body,x=>{ if(x.type==='ReturnStatement'&&htmlish(x.argument,fns)) r=true; }); return r;};
    if(n.type==='FunctionDeclaration'&&ret(n)) fns.add(n.id.name); if(n.type==='VariableDeclarator'&&n.id.type==='Identifier'&&n.init&&isFn(n.init)&&ret(n.init)) fns.add(n.id.name); });
  // 2) functions (by name) with params that are wrapped by esc(param) inside their body
  const funcs=new Map(); // name -> {params:[..], wrapped:Set}
  const reg=(name,fn)=>{ const params=fn.params.map(p=>p.type==='Identifier'?p.name:null); const w=new Set(); walk(fn.body,x=>{ if(x.type==='CallExpression'&&x.callee.type==='Identifier'&&(x.callee.name==='esc')&&x.arguments[0]){ let a=x.arguments[0]; if(a.type==='LogicalExpression') a=a.left; if(a.type==='Identifier'&&params.includes(a.name)) w.add(a.name); } }); if(w.size) funcs.set(name,{params,w}); };
  walk(ast,n=>{ if(n.type==='FunctionDeclaration') reg(n.id.name,n); if(n.type==='VariableDeclarator'&&n.id.type==='Identifier'&&n.init&&isFn(n.init)) reg(n.id.name,n.init); });
  // 3) call sites passing HTML into a wrapped param
  const bad=[]; walk(ast,n=>{ if(n.type==='CallExpression'&&n.callee.type==='Identifier'&&funcs.has(n.callee.name)){ const f=funcs.get(n.callee.name); n.arguments.forEach((a,i)=>{ const pn=f.params[i]; if(pn&&f.w.has(pn)&&htmlish(a,fns)) bad.push(`${n.callee.name}(arg ${i+1} "${pn}") line ${best.slice(0,n.range[0]).split('\n').length}: ${best.slice(a.range[0],a.range[1]).slice(0,60).replace(/\s+/g,' ')}`); }); } });
  console.log(file.split('/').pop(),'| helpers with escaped params:',[...funcs.keys()].join(', ')||'-','| FLAGGED call sites:',bad.length); bad.forEach(b=>console.log('   ',b));
}
