require('../public/engine.js'); const E = globalThis.HIEngine;
const lib = (pcts) => pcts.map((p,i)=>({id:'e'+i,name:'P'+i,role:i===0?'Server':'Kitchen',basePct:p,active:true}));
const mk = (library, picks, extra={}) => Object.assign({
  library, roles:['Server','Kitchen','Busser','Cashier','Other'],
  rolePcts:{Server:50,Kitchen:30,Busser:20,Cashier:0,Other:0}, mode:'A',
  draft:Object.assign({date:'2026-11-15',shift:'Dinner',sales:'10000',sc:'1800',tips:'0',source:'manual',verifiedKey:null,mismatchKey:null,picks}, extra.draft||{})
}, extra.top||{});
const pick = (id, ded=[]) => ({empId:id,hours:'',shiftPct:'',deductions:ded,bigConfirmed:false});
let ok = true; const check = (n,c)=>{ console.log((c?'PASS ':'FAIL ')+n); if(!c) ok=false; };

// (a) 18% cross-check removed: the entered service charge IS the pool, no warning state
let s = mk(lib([100]), [pick('e0')], {draft:{sales:'9000', sc:'1800'}});
let r = E.calculate(s);
check('pool is $1,800 with $9,000 sales and no errors', r.poolC === 180000 && r.errors.length === 0);
check('no mismatch or expected fields in result', r.mismatch === undefined && r.expectedC === undefined);
s = mk(lib([100]), [pick('e0')], {draft:{sales:'10000', sc:'1800'}});
r = E.calculate(s);
check('pool is $1,800 with $10,000 sales and no errors', r.poolC === 180000 && r.errors.length === 0);
s = mk(lib([100]), [pick('e0')], {draft:{sales:'', sc:'1800'}});
r = E.calculate(s);
check('net sales is optional (blank ok)', r.poolC === 180000 && r.errors.length === 0);
s = mk(lib([100]), [pick('e0')], {draft:{sales:'abc', sc:'1800'}});
r = E.calculate(s);
check('invalid net sales text is flagged', r.errors.some(e=>e.includes('净销售额')));
s = mk(lib([100]), [pick('e0')], {draft:{sales:'10000', sc:'1750'}});
r = E.calculate(s);
check('any service charge is used as-is ($1,750 pool, no warning)', r.poolC === 175000 && r.errors.length === 0);

// (b) house destination
s = mk(lib([10,90]), [pick('e0',[{id:'d',pct:10,reason:'Late',dest:'house'}]), pick('e1')]);
s.draft.sc='1800'; s.draft.sales='10000';
r = E.calculate(s);
let a = r.lines[0], b = r.lines[1];
check('(b house) gross 180', a.grossC===18000);
check('(b house) employee nets 162', a.netC===16200);
check('(b house) house line 18', r.houseC===1800);
check('(b house) reconciled', r.reconciled && r.errors.length===0);

// (b) pool destination
s = mk(lib([10,90]), [pick('e0',[{id:'d',pct:10,reason:'Late',dest:'pool'}]), pick('e1')]);
r = E.calculate(s); a=r.lines[0]; b=r.lines[1];
check('(b pool) employee nets 162', a.netC===16200);
check('(b pool) other employee +18 exactly', b.netC - b.grossC === 1800);
check('(b pool) house 0', r.houseC===0);
check('(b pool) reconciled', r.reconciled && r.errors.length===0);

// (d) pool sums with odd amounts, stacked deductions, mixed destinations, tips
s = mk(lib([33.33,33.33,33.34]), [pick('e0',[{id:'x',pct:5,dest:'pool'},{id:'y',pct:10,dest:'house'}]), pick('e1'), pick('e2')], {draft:{sales:'9999.99',sc:'1799.99',tips:'12.34'}});
s.draft.sc='1799.99';
r = E.calculate(s);
check('(d) stacked 15% and cents reconcile', r.errors.length===0 && r.reconciled);
check('(d) tips reconcile', r.tipsSumC===1234);
console.log('   nets:', r.lines.map(l=>l.netC), 'house:', r.houseC, 'pool:', r.poolC);

// Mode B
s = mk(lib([0,0,0]), [pick('e0'), pick('e1'), pick('e2')], {top:{mode:'B'}});
s.library[0].role='Server'; s.library[1].role='Kitchen'; s.library[2].role='Kitchen';
s.draft.picks[0].hours='6'; s.draft.picks[1].hours='4'; s.draft.picks[2].hours='4';
s.rolePcts={Server:50,Kitchen:50,Busser:0,Cashier:0,Other:0};
r = E.calculate(s);
check('(B) server gets 50% of 1800 = 900', r.lines[0].grossC===90000);
check('(B) kitchen split 50% by hours 4:4', r.lines[1].grossC===45000 && r.lines[2].grossC===45000);
check('(B) reconciled', r.reconciled && r.errors.length===0);

// Mode A warning when not 100
s = mk(lib([10,20]), [pick('e0'), pick('e1')]);
r = E.calculate(s);
check('Mode A sum != 100 blocks', r.errors.some(e=>e.includes('合计 30.00%')));
const n = E.normalizedPicks(s);
check('normalize gives 33.33.. and 66.66..', Math.abs(Number(n.e0)+Number(n.e1)-100)<1e-9);

// Inactive excluded
s = mk(lib([100]), [pick('e0')]); s.library[0].active=false;
r = E.calculate(s);
check('inactive card excluded', r.lines.length===0);

console.log(ok?'ALL PASS':'SOME FAILED');
