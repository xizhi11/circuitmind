'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const C=require('./dist/circuit.js');
global.Circuit=C;require('./dist/levels.js');require('./dist/campaign.js');require('./dist/references.js');require('./dist/overture.js');require('./dist/symphony.js');require('./dist/mines32.js');require('./dist/course.js');require('./dist/devices.js');
const {node:n,wire:w}=Game;
let checks=0;
function test(name,fn){fn();checks++;process.stdout.write('PASS '+name+'\n');}
function net(d){const result=C.compile(d.nodes,d.wires);assert.ifError(result.error);return result;}
test('campaign blueprints and all vector values',()=>{
 for(const l of Game.levels){const d=l.build();C.validate(d);assert(d.nodes.length);for(const v of l.vectors||[])assert(v.expected.every(Number.isInteger));}
 assert(Game.levels.length>=27);
});
test('full adder, every truth-table row',()=>{
 const a=net(Game.fullAdder());
 for(let i=0;i<8;i++){const r=a.evaluate(a.initial(),{A:i&1,B:(i>>1)&1,Cin:(i>>2)&1}),sum=(i&1)+((i>>1)&1)+((i>>2)&1);assert.equal(r.inputs('S')[0],sum&1);assert.equal(r.inputs('C')[0],Number(sum>=2));}
});
const inverter={nodes:[n('A','IN',0,0,'A'),n('N','NAND',200,0),n('Q','OUT',400,0,'Q')],wires:[w('A','N',0),w('A','N',1),w('N','Q',0)]};
const inv=C.encapsulate(inverter,'反相器');
test('nested combinational components and endpoint mapping',()=>{
 const nested={nodes:[n('A','IN',0,0),{...n('first','CUSTOM',200,0),spec:inv},{...n('second','CUSTOM',400,0),spec:inv},n('Q','OUT',600,0)],wires:[w('A','first',0),w('first','second',0),w('second','Q',0)]};
 const identity=C.encapsulate(nested,'恒等');
 const d={nodes:[n('A','IN',0,0),{...n('U','CUSTOM',200,0),spec:identity},n('Q','OUT',400,0)],wires:[w('A','U',0),w('U','Q',0)]};
 const a=net(d);for(const A of [0,1]){const r=a.evaluate(a.initial(),{A});assert.equal(r.inputs('Q')[0],A);assert.equal(r.values.U[0],A);}
});
const register={nodes:[n('D','IN',0,0),n('EN','IN',0,100),n('r','REG',200,0),n('Q','OUT',400,0)],wires:[w('D','r',0),w('EN','r',1),w('r','Q',0)]};
const reg=C.encapsulate(register,'记忆');
test('custom registers keep separate state and commit together',()=>{
 const d={nodes:[n('d','IN',0,0,'d',1),n('en','IN',0,100,'en',1),{...n('u','CUSTOM',200,0),spec:reg},{...n('v','CUSTOM',400,0),spec:reg},n('q','OUT',600,0)],wires:[w('d','u',0),w('en','u',1),w('u','v',0),w('en','v',1),w('v','q',0)]};
 const a=net(d);let r=a.tick(a.initial());assert.equal(r.values.u[0],1);assert.equal(r.values.v[0],0);r=a.tick(r.state);assert.equal(r.values.v[0],1);
});
test('feedback crossing a register boundary is valid',()=>{
 const d={nodes:[n('en','IN',0,100,'en',1),{...n('u','CUSTOM',200,0),spec:reg},n('not','NOT',400,0)],wires:[w('u','not',0),w('not','u',0),w('en','u',1)]};
 const a=net(d);const r=a.tick(a.initial());assert.equal(r.values.u[0],1);assert.equal(a.tick(r.state).values.u[0],0);
});
test('combinational cycles across component boundaries are rejected',()=>{
 const d={nodes:[{...n('u','CUSTOM',0,0),spec:inv}],wires:[w('u','u',0)]};assert.match(C.compile(d.nodes,d.wires).error,/组合反馈/);
});
test('invalid widths, bad interface, duplicate drivers rejected',()=>{
 const d={nodes:[n('a','IN8',0,0),{...n('u','CUSTOM',0,0),spec:inv}],wires:[w('a','u',0)]};assert.match(C.compile(d.nodes,d.wires).error,/位宽/);
 const bad=C.clone(inv);bad.inputs[0].width=8;assert.throws(()=>C.validate({nodes:[{...n('u','CUSTOM',0,0),spec:bad}],wires:[]}),/不匹配/);
 const dup=C.clone(inverter);dup.wires.push({...w('A','N',0),id:'duplicate'});assert.match(C.compile(dup.nodes,dup.wires).error,/多个驱动/);
});
test('split/join preserve all 256 bytes',()=>{
 const d={nodes:[n('a','IN8',0,0),n('s','SPLIT8',200,0),n('j','JOIN8',400,0),n('q','OUT8',600,0)],wires:[w('a','s',0),...Array.from({length:8},(_,i)=>w('s','j',i,i)),w('j','q',0)]};
 const a=net(d);for(let value=0;value<256;value++)assert.equal(a.evaluate(a.initial(),{a:value}).inputs('q')[0],value);
});
test('reference CPU satisfies the CPU construction challenge',()=>{
 const l=Game.levels.find(l=>l.id==='cpu'),d=l.build(),a=net(d);assert.equal(Game.levels.find(l=>l.id==='cpu-build').verify(a)[0].pass,true);
});
test('hierarchical gate-level CPU matches primitive CPU for 16 ticks',()=>{
 const a=net(Game.levels.find(l=>l.id==='cpu').build()),b=net(Game.levels.find(l=>l.id==='gate-cpu').build());let sa=a.initial(),sb=b.initial();
 assert(b.expandedCount>1000);for(let i=0;i<16;i++){const ra=a.tick(sa),rb=b.tick(sb);sa=ra.state;sb=rb.state;assert.deepEqual(rb.values.pc,ra.values.pc);assert.deepEqual(rb.values.acc,ra.values.acc);assert.deepEqual(rb.values.ctrl,ra.values.ctrl);assert.deepEqual(rb.writes.map(w=>w.value),ra.writes.map(w=>w.value));}
});
test('RAM read/write and address isolation',()=>{
 const l=Game.levels.find(l=>l.id==='memory'),d=l.build();d.nodes.push(n('ram','RAM8',400,100));d.wires=[w('ADR','ram',0),w('DATA','ram',1),w('WE','ram',2),w('ram','Q',0)];const a=net(d);let s=a.initial();for(const v of l.vectors){const r=a.tick(s,v.input);s=r.state;assert.deepEqual([r.inputs('Q')[0]],v.expected);}
});
test('screen is driven by CPU writes to framebuffer memory',()=>{
 const a=net(Game.levels.find(l=>l.id==='display').build());let r={state:a.initial()};for(let i=0;i<128;i++)r=a.tick(r.state);assert.equal(r.state.ram[128],0);assert.equal(r.state.ram[191],252);assert.equal(r.values.ctrl[6],0);
});
test('Minesweeper win and loss really execute through CPU',()=>{
 function create(){const a=net(Game.levels.find(l=>l.id==='mines').build());return {a,s:a.initial()};}
 function click(g,key){g.s.ram[254]=key;for(let i=0;i<250;i++)g.s=g.a.tick(g.s).state;}
 const won=create();for(const key of [1,2,3,4,6,7,8,9])click(won,key);assert.equal(won.s.ram[250],2);assert.equal(won.s.ram[252],8);
 const lost=create();click(lost,5);assert.equal(lost.s.ram[250],1);assert.equal(lost.s.ram[36],42);
});
test('assembler rejects unknown instructions and out-of-range operands',()=>{
 assert.throws(()=>C.assemble('LDI 256'),/参数/);assert.throws(()=>C.assemble('unknown'),/未知/);assert.deepEqual(C.assemble('again: LDI 3\nJMP again').words,[259,2304]);
});
// Minimal DOM harness executes actual UI event handlers without installing a browser.
test('UI navigation, campaign verification, packaging and restoration events',()=>{
 class Element{
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.attrs={};this.style={};this.value='';this.hidden=false;this.className='';this.classList={add(){},remove(){}};}
  append(...items){this.children.push(...items);}
  replaceChildren(...items){this.children=[...items];}
  setAttribute(k,v){this.attrs[k]=v;}
  addEventListener(name,fn){this['on'+name]=fn;}
  getContext(){return {fillRect(){},fillStyle:''};}
  click(){this.onclick?.({target:this,stopPropagation(){},preventDefault(){}});}
  showModal(){this.open=true;}
  close(){this.open=false;}
 }
 const elements=new Map(),store=new Map();
 const context={Circuit:C,Game,console,setTimeout:()=>0,clearTimeout(){},setInterval:()=>1,clearInterval(){},confirm:()=>true,Blob,URL:{createObjectURL:()=>'',revokeObjectURL(){}},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},document:{body:new Element(),getElementById:id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);},createElement:t=>new Element(t),createElementNS:(_,t)=>new Element(t),addEventListener(){}}};
 vm.createContext(context);vm.runInContext(fs.readFileSync(__dirname+'/dist/app.js','utf8'),context);
 vm.runInContext("openLevel('cpu'); for(let i=0;i<12;i++)step();",context);assert.equal(elements.get('terminal').textContent,'ABCD');
 vm.runInContext("openLevel('cpu-build'); doc=Game.levels.find(l=>l.id==='cpu').build();edit();",context);elements.get('test').click();assert.equal(vm.runInContext('completed["cpu-build"]',context),true);
 vm.runInContext("openLevel('full');doc.nodes.find(n=>n.id==='p').type='AND';edit();",context);elements.get('package').click();elements.get('package-name').value='FA';elements.get('save-package').click();assert.equal(JSON.parse(store.get('cm-library')).length,1);
 elements.get('home').click();assert.equal(elements.get('world').open,true);
});
process.stdout.write('\n'+checks+' checks passed; '+Game.levels.length+' game scenes.\n');
