'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const C=require('./dist/circuit.js');
global.Circuit=C;require('./dist/levels.js');require('./dist/campaign.js');require('./dist/references.js');require('./dist/overture.js');require('./dist/symphony.js');require('./dist/mines32.js');require('./dist/course.js');require('./dist/devices.js');require('./dist/workshop.js');require('./dist/light-workshop.js');require('./dist/workshop-guides.js');require('./dist/lesson-guides.js');
const {node:n,wire:w}=Game;
let checks=0;
function test(name,fn){fn();checks++;process.stdout.write('PASS '+name+'\n');}
function net(d){const result=C.compile(d.nodes,d.wires);assert.ifError(result.error);return result;}
test('campaign blueprints and all vector values',()=>{
 for(const l of Game.levels){const d=l.build();C.validate(d);assert(d.nodes.length);for(const v of l.vectors||[])assert(v.expected.every(value=>Number.isInteger(value)||value===null||value==='X'));}
 assert(Game.levels.length>=27);
});
test('course branches unlock by their dependencies and converge at the CPU',()=>{
 const byId=new Map(Game.levels.map(lesson=>[lesson.id,lesson]));
 const pathIds=Game.guidedPath.map(lesson=>lesson.id);
 assert.equal(new Set(pathIds).size,pathIds.length);
 for(const lesson of Game.guidedPath){
  assert(Game.coursePrerequisites(lesson).every(prior=>prior&&pathIds.indexOf(prior.id)<pathIds.indexOf(lesson.id)));
  assert(Game.courseRoutes.some(group=>group.levels.includes(lesson)));
 }
 assert.deepEqual(Game.coursePrerequisites(byId.get('half')).map(lesson=>lesson.id),['xor']);
 assert.deepEqual(Game.coursePrerequisites(byId.get('register')).map(lesson=>lesson.id),['mux','dff-build']);
 assert.deepEqual(Game.coursePrerequisites(byId.get('cm8-pixels')).map(lesson=>lesson.id),['cpu-build']);
 assert.deepEqual(Game.coursePrerequisites(byId.get('s32-stack')).map(lesson=>lesson.id),['wire-s32-io']);
 assert(!Game.guidedPath.includes(byId.get('shared-bus')));
 assert(Game.courseRoutes.find(group=>group.id==='optional').levels.includes(byId.get('shared-bus')));
});
test('all lessons have progressive hints and runnable demonstrations',()=>{
 for(const level of Game.levels){
  const hints=Game.lessonGuide.hints(level);
  assert(hints.length>=2&&hints.length<=4&&hints.every(Boolean),level.id);
  const board=Game.lessonGuide.example(level),model=net(board);
  if(level.verify){assert(level.verify(model,board).every(row=>row.pass),level.id);continue;}
  if(!level.inputs||!level.outputs)continue;
  let rows=level.vectors;
  if(level.sequence)rows=level.sequence.map(input=>({input,expected:level.outputs.map(id=>input[id])}));
  if(!rows)rows=Array.from({length:2**level.inputs.length},(_,mask)=>{
   const values=level.inputs.map((_,i)=>(mask>>i)&1);
   return {input:Object.fromEntries(level.inputs.map((id,i)=>[id,values[i]])),expected:level.expect(values)};
  });
  let state=model.initial();
  const read=result=>level.outputs.map(id=>result.inputs(id)[0]);
  for(const row of rows){
   if(row.before)assert.deepEqual(read(model.evaluate(state,row.input)),row.before,level.id+' before clock');
   const result=level.clocked||level.sequence?model.tick(state,row.input):model.evaluate(state,row.input);
   assert.deepEqual(read(result),row.expected,level.id);state=result.state??state;
  }
 }
});
test('RAM and bus examples agree with backend verification',()=>{
 const {execute}=require('./tools.cjs');
 for(const id of ['tiny-ram','bus-handoff']){
  const lesson=Game.levels.find(item=>item.id===id),circuit=Game.lessonGuide.example(lesson),result=execute('test',{circuit,levelId:id});
  assert.equal(result.passed,result.total,id);
  if(id==='tiny-ram')assert.equal(result.cases[2].before.Q,42);
  else{assert.equal(result.cases[0].actual.Q,null);assert.equal(result.cases[5].actual.Q,'X');}
 }
});
test('CM8 pixel challenge checks the actual pattern, empty background and color',()=>{
 const lesson=Game.levels.find(item=>item.id==='cm8-pixels');
 const board=lesson.build(),rom=board.nodes.find(node=>node.id==='rom');
 assert.deepEqual(lesson.verify(net(board))[0].actual,[0,0,0]);
 const solved=lesson.program.replace('LDI 0','LDI 224');
 for(const [source,expected] of [[solved,[5,0,1]],[solved.replace('ST 147','ST 128'),[4,1,1]],[solved.replace('ST 147','LDI 3\nST 147\nLDI 224'),[5,0,2]]]){
  rom.program=C.assemble(source).words;
  const row=lesson.verify(net(board))[0];
  assert.deepEqual(row.actual,expected);assert.equal(row.pass,source===solved);
 }
});
test('32-bit output bridge verifies data and the valid signal',()=>{
 const lesson=Game.levels.find(item=>item.id==='wire-s32-io');
 const board=lesson.build();
 assert(C.compile(board.nodes,board.wires).error);
 board.wires=Game.symphony.machine(lesson.program).wires;
 assert.equal(lesson.verify(net(board))[0].pass,true);
});
const {command,data,model,framebuffer,diskImage,transport}=Game.workshopKit;
function runWorkshop(name){
 const work=Game.levels.find(l=>l.id==='workshop-'+name);
 const cpu=net(work.build()),link=name==='link'?transport():null;
 let state=cpu.initial();
 if(name==='shell')state.storage=diskImage();
 return {
  link,get state(){return state;},
  run(value){
   state.ram[command]=value;
   const outputs=[];
   for(let i=0;i<24000;i++){
    const input=link?.inputs||{},before=cpu.evaluate(state,input);
    if(before.inputs('strobe')[0])outputs.push(before.inputs('output')[0]);
    link?.sample(before);
    state=cpu.tick(state,input).state;
    if(!state.ram[command])return outputs;
   }
   assert.fail(work.title+' did not acknowledge its input');
  }
 };
}
test('workshop lander updates fuel and collision in the CPU',()=>{
 const crash=runWorkshop('lander');crash.run(16);
 for(let i=0;i<80&&!crash.state.ram[model+10];i++)crash.run(16);
 assert.equal(crash.state.ram[model+10],2);
 const landing=runWorkshop('lander');landing.run(16);
 for(let i=0;i<180&&!landing.state.ram[model+10];i++){
  const velocity=Array.from({length:4},(_,j)=>landing.state.ram[model+4+j]||0).reduce((v,b,j)=>v|(b<<(8*j)),0);
  landing.run(velocity>8?17:16);
 }
 assert.equal(landing.state.ram[model+10],1);
 assert(landing.state.ram[model+8]<32);
});
test('workshop link uses two circuits to accept or retry a row',()=>{
 const bus=runWorkshop('link'),image=[0,126,66,90,90,66,126,0];
 image.forEach((value,i)=>bus.state.ram[data+i]=value);
 bus.run(1);
 assert.deepEqual(image.map((_,i)=>bus.state['rx-ram'][data+i]),image);
 assert.equal(bus.state.ram[model+17],0);
 bus.link.corrupt();bus.state.ram[data+1]=255;bus.run(1);
 assert.equal(bus.link.corrupted,1);assert.equal(bus.state.ram[model+17],1);
 assert.equal(bus.state['rx-ram'][data+1],255);
});
test('workshop cube calculates lines and changes the framebuffer',()=>{
 const machine=runWorkshop('cube');machine.run(1);
 const pixels=()=>Array.from({length:64*48},(_,i)=>machine.state.ram[framebuffer+i]||0);
 const first=pixels();
 assert(first.filter(Boolean).length>50);assert.equal(machine.state.ram[model],1);
 for(let i=0;i<64*48;i++)delete machine.state.ram[framebuffer+i];
 machine.run(1);
 assert.equal(machine.state.ram[model],2);
 assert.notDeepEqual(pixels(),first);
});
test('workshop rhythm emits the selected tracks and wraps the beat counter',()=>{
 const machine=runWorkshop('rhythm');machine.run(1);machine.run(17);
 assert.deepEqual(machine.run(65),[5]);assert.equal(machine.state.ram[model+64],0);
 for(let i=0;i<7;i++)assert.deepEqual(machine.run(65),[0]);
 assert.deepEqual(machine.run(65),[5]);
});
test('workshop command shell loads and executes its disk bytecode',()=>{
 const machine=runWorkshop('shell');
 for(const line of ['ls','cat readme.txt','run count.bin','nope']){
  Array.from(line,(char,i)=>machine.state.ram[data+i]=char.charCodeAt(0));
  machine.run(line.length);
 }
 const output=Array.from({length:200},(_,i)=>String.fromCharCode(machine.state.ram[0x5400+i]||0)).join('');
 assert.match(output,/readme.txt\ncount.bin/);assert.match(output,/Files live on the virtual disk/);
 assert.match(output,/123\n/);assert.match(output,/Unknown command/);
 assert.equal(machine.state.ram[0x1500],1);
});
test('light workshop routes three puzzles with gates and latches its result',()=>{
 const work=Game.levels.find(l=>l.id==='workshop-light'),light=Game.lightWorkshop;
 function simulate(index,flipped,initial={}){
  const board=work.build();
  assert(!board.nodes.some(n=>n.type.startsWith('ROM')));
  light.setInputs(board,index,light.maskOf(flipped));
  const model=net(board);
  let state={...model.initial(),...initial},result;
  for(let i=0;i<65;i++){
   result=model.tick(state);state=result.state;
   const out=light.read(model,result);
   assert(out);
   if(out.done){
    assert.deepEqual(light.read(model,model.tick(state)),out);
    return out;
   }
  }
  assert.fail('light circuit did not latch a result');
 }
 assert.deepEqual(simulate(0,[]),{x:1,y:0,direction:3,done:1,hit:0,loop:0});
 for(const [index,solution] of [[0,[1,9]],[1,[2,12]],[2,[2,7,8,15]]]){
  const out=simulate(index,solution);
  assert.equal(out.x,3);assert.equal(out.y,light.puzzles[index].goal);
  assert.equal(out.direction,0);assert.equal(out.hit,1);
 }
 assert.equal(simulate(0,[],{'ray-count':63}).loop,1);
});
test('all eight workshops have guides and separate build slots',()=>{
 const {originals,guides,markdown}=Game.workshopGuides;
 assert.equal(originals.length,8);
 for(const work of originals){
  assert(guides[work.id].steps.length>=3);
  const guide=markdown(work);
  assert(guide.includes('参考接线表'));
  if(work.program)assert(guide.includes(work.program));else assert(!guide.includes('参考汇编'));
  assert(Game.levels.some(l=>l.workshopBuildOf===work.id));
 }
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
test('D flip-flop distinguishes clock edges from a combinational bypass',()=>{
 const {execute}=require('./tools.cjs');
 const level=Game.levels.find(l=>l.id==='dff-build'),d=level.build();
 d.wires=[w('D','Q',0)];
 assert(execute('test',{circuit:d,levelId:level.id}).passed<level.vectors.length);
 d.nodes.push(n('hold','DELAY',350,120));
 d.wires=[w('D','hold',0),w('hold','Q',0)];
 assert.equal(execute('test',{circuit:d,levelId:level.id}).passed,level.vectors.length);
 assert.equal(execute('step',{circuit:d,inputs:{D:1},state:{hold:0}}).state.hold,1);
 assert.throws(()=>execute('step',{circuit:d,state:{hold:2}}),/寄存器状态无效/);
});
test('CM8 program challenges grade multiple inputs and reject empty programs',()=>{
 const programs={
  'cm8-loop':'LD 0\nloop: JZ done\nST 255\nSUB 1\nJMP loop\ndone: HLT',
  'cm8-branch':'LD 0\nJZ zero\nLDI 89\nJMP print\nzero: LDI 78\nprint: ST 255\nHLT'
 };
 for(const [id,source] of Object.entries(programs)){
  const l=Game.levels.find(x=>x.id===id),d=l.build();
  assert(l.verify(net(d)).some(r=>!r.pass));
  d.nodes.find(x=>x.id==='rom').program=C.assemble(source).words;
  assert(l.verify(net(d)).every(r=>r.pass));
 }
});
test('hierarchical gate-level CPU matches primitive CPU for 16 ticks',()=>{
 const a=net(Game.levels.find(l=>l.id==='cpu').build()),b=net(Game.levels.find(l=>l.id==='gate-cpu').build());let sa=a.initial(),sb=b.initial();
 assert(b.expandedCount>1000);for(let i=0;i<16;i++){const ra=a.tick(sa),rb=b.tick(sb);sa=ra.state;sb=rb.state;assert.deepEqual(rb.values.pc,ra.values.pc);assert.deepEqual(rb.values.acc,ra.values.acc);assert.deepEqual(rb.values.ctrl,ra.values.ctrl);assert.deepEqual(rb.writes.map(w=>w.value),ra.writes.map(w=>w.value));}
});
test('blueprints preserve nested modules, wire routes and legacy imports',()=>{
 const d=Game.levels.find(l=>l.id==='gate-cpu').build();
 Object.assign(d.wires[0],{points:[{x:180,y:105}],color:'purple',comment:'取指'});
 const encoded=C.packBlueprint(d),restored=C.unpackBlueprint(JSON.parse(JSON.stringify(encoded)));
 assert(JSON.stringify(encoded).length<JSON.stringify(d).length);
 assert.deepEqual(restored,d);
 assert.deepEqual(C.unpackBlueprint({version:2,circuit:d}),d);
 const broken=C.clone(encoded);broken.circuit.nodes.find(n=>n.type==='CUSTOM').module=99999;
 assert.throws(()=>C.unpackBlueprint(broken),/引用无效/);
});
test('clock source and screen device share synchronous writes',()=>{
 const {execute}=require('./tools.cjs');
 const d={nodes:[n('clock','CLOCK',0,0),n('address','IN8',0,90,'ADR',65),n('rgb','IN8',0,180,'RGB',224),n('screen','SCREEN8',300,0)],
  wires:[w('clock','screen',2),w('address','screen',0),w('rgb','screen',1)]};
 const first=execute('step',{circuit:d});
 assert.equal(first.state.clock,1);
 assert.equal(first.state.screen[1],0);
 const second=execute('step',{circuit:d,state:first.state});
 assert.equal(second.state.clock,0);
 assert.equal(second.state.screen[1],224);
 assert.deepEqual(second.values.screen,[224]);
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
 assert.equal(vm.runInContext("locked(Game.guidedPath[1])",context),true);
 vm.runInContext("doc.nodes.push(Game.node('n','NAND',450,105));doc.wires=[Game.wire('A','n',0),Game.wire('B','n',1),Game.wire('n','Q',0)];edit();",context);
 elements.get('test').click();
 assert(vm.runInContext('completed.nand&&library.some(p=>p.courseId==="nand")',context));
 elements.get('next-level').click();
 assert.equal(vm.runInContext('level.id',context),'not');
 vm.runInContext(`{
  const model=Game.levels.find(l=>l.id==='gate-cpu').build();
  const origins={pc:'register8',acc:'register8',inc:'adder8',branch:'mux8',result:'mux8',alu:'alu-cpu',ctrl:'control-build'};
  for(const p of model.nodes.filter(n=>origins[n.id])){
   const id=origins[p.id];
   if(!completed[id])library.push({...p.spec,courseId:id});
   completed[id]=true;
  }
  openLevel('cpu-build',true);doc.wires=model.wires;edit();
 }`,context);
 assert(vm.runInContext("!net.error && doc.nodes.find(n=>n.id==='pc').type==='CUSTOM' && !courseViolation()",context));
 elements.get('test').click();
 elements.get('next-level').click();
 assert(vm.runInContext("level.id==='cm8-pixels' && doc.nodes.find(n=>n.id==='pc').type==='CUSTOM' && !net.error",context));
 elements.get('program').value=elements.get('program').value.replace('LDI 0','LDI 28');
 elements.get('assemble').click();elements.get('test').click();
 assert(vm.runInContext("completed['cm8-pixels'] && testCases[0].pass",context));
 elements.get('next-level').click();
 assert(vm.runInContext("level.id==='cm8-loop' && doc.nodes.find(n=>n.id==='pc').type==='CUSTOM' && !net.error",context));
 vm.runInContext("guided=false;library=[];",context);
 vm.runInContext("openLevel('cpu'); for(let i=0;i<12;i++)step();",context);assert.equal(elements.get('terminal').textContent,'ABCD');
 vm.runInContext("openLevel('cpu-build'); doc=Game.levels.find(l=>l.id==='cpu').build();edit();",context);elements.get('test').click();assert.equal(vm.runInContext('completed["cpu-build"]',context),true);
 vm.runInContext("openLevel('cm8-loop');",context);
 assert(vm.runInContext('!net.error && state.ram.length===256 && doc.nodes.find(n=>n.id==="rom").program[0]===15*256',context));
 vm.runInContext("openLevel('full');doc.nodes.find(n=>n.id==='p').type='AND';edit();",context);elements.get('package').click();elements.get('package-name').value='FA';elements.get('save-package').click();assert.equal(JSON.parse(store.get('cm-library')).length,1);
 elements.get('test').click();
 const best=vm.runInContext('optimizationBest.full',context);
 assert(Number.isInteger(best)&&best>0);
 vm.runInContext("doc.nodes.push(Game.node('extra','NAND',10,10),Game.node('extra-in','IN',0,0));doc.wires.push(Game.wire('extra-in','extra',0),Game.wire('extra-in','extra',1));edit()",context);
 elements.get('test').click();
 assert(vm.runInContext('testCases.every(row=>row.pass)',context));
 assert.equal(vm.runInContext('optimizationBest.full',context),best);
 vm.runInContext("openLevel('full',true);persist()",context);
 assert.match(elements.get('optimization-status').textContent,new RegExp(String(best)));
 assert.equal(JSON.parse(store.get('cm-optimization')).full,best);
 elements.get('home').click();assert.equal(elements.get('world').open,true);
});
process.stdout.write('\n'+checks+' checks passed; '+Game.levels.length+' game scenes.\n');
