(function(root){
'use strict';
const port=(name,width=1)=>({name,width});
const unary=(f)=>({inputs:[port('A')],outputs:[port('Q')],evaluate:([a])=>[f(a)]});
const binary=(f)=>({inputs:[port('A'),port('B')],outputs:[port('Q')],evaluate:([a,b])=>[f(a,b)]});
const types={
 IN:{inputs:[],outputs:[port('Q')],evaluate:(_,n)=>[n.value||0]},
 OUT:{inputs:[port('A')],outputs:[],evaluate:()=>[]},
 NAND:binary((a,b)=>1-(a&b)),AND:binary((a,b)=>a&b),OR:binary((a,b)=>a|b),XOR:binary((a,b)=>a^b),
 NOT:unary(a=>1-a),NOR:binary((a,b)=>1-(a|b)),XNOR:binary((a,b)=>1-(a^b)),
 REG:{inputs:[port('D'),port('EN')],outputs:[port('Q')],stateful:true},
 DELAY:{inputs:[port('D')],outputs:[port('Q')],stateful:true},
 CLOCK:{inputs:[],outputs:[port('CLK')],stateful:true},
 DEC3:{inputs:[port('A'),port('B'),port('C'),port('DIS')],
 outputs:Array.from({length:8},(_,i)=>port('Y'+i)),
 evaluate:([a,b,c,dis])=>Array.from({length:8},(_,i)=>Number(!dis&&i===(a+2*b+4*c)))},
 CONST:{inputs:[],outputs:[port('Q',8)],evaluate:(_,n)=>[n.value||0]},
 IN8:{inputs:[],outputs:[port('Q',8)],evaluate:(_,n)=>[n.value||0]},
 OUT8:{inputs:[port('A',8)],outputs:[],evaluate:()=>[]},
 REG8:{inputs:[port('D',8),port('EN')],outputs:[port('Q',8)],stateful:true},
 ADD8:{inputs:[port('A',8),port('B',8)],outputs:[port('Q',8)],evaluate:([a,b])=>[(a+b)&255]},
 MUX8:{inputs:[port('A',8),port('B',8),port('S')],outputs:[port('Q',8)],evaluate:([a,b,s])=>[s?b:a]},
 RAM8:{inputs:[port('ADR',8),port('DATA',8),port('WE')],outputs:[port('Q',8)],stateful:true,memory:true},
 SCREEN8:{inputs:[port('ADR',8),port('RGB',8),port('WE')],outputs:[port('Q',8)],stateful:true,memory:true},
 ROM16:{inputs:[port('ADR',8)],outputs:[port('IR',16)],evaluate:([a],n)=>[(n.program||[])[a]||0]},
 ALU8:{inputs:[port('A',8),port('B',8),port('OP',8)],outputs:[port('Q',8)],
 evaluate:([a,b,op])=>[([b,(a+b)&255,(a-b)&255,a&b,a|b,a^b][op]??0)]},
 CONTROL:{inputs:[port('IR',16),port('ACC',8)],outputs:[port('IMM',8),port('OP',8),port('WRITE'),port('BRANCH'),port('STORE'),port('LOAD'),port('RUN')],
 evaluate:([ir,acc])=>{const op=ir>>>8;return [ir&255,({2:1,3:2,4:3,5:4,6:5})[op]||0,
 Number(op>=1&&op<=7),Number(op===9||(op===10&&acc===0)),Number(op===8),Number(op===7),Number(op!==15)];}}
};
const clone=x=>JSON.parse(JSON.stringify(x));
Object.assign(types,{
 BIT:{inputs:[],outputs:[port('Q')],evaluate:(_,n)=>[n.value||0]},
 IN16:{inputs:[],outputs:[port('Q',16)],evaluate:(_,n)=>[n.value||0]},
 OUT16:{inputs:[port('A',16)],outputs:[],evaluate:()=>[]},
 BUF:unary(a=>a),BUF8:{inputs:[port('A',8)],outputs:[port('Q',8)],evaluate:([a])=>[a]},
 BUF16:{inputs:[port('A',16)],outputs:[port('Q',16)],evaluate:([a])=>[a]},
 MUX:{inputs:[port('A'),port('B'),port('S')],outputs:[port('Q')],evaluate:([a,b,s])=>[s?b:a]},
 SPLIT8:{inputs:[port('A',8)],outputs:Array.from({length:8},(_,i)=>port('b'+i)),evaluate:([a])=>Array.from({length:8},(_,i)=>(a>>i)&1)},
 JOIN8:{inputs:Array.from({length:8},(_,i)=>port('b'+i)),outputs:[port('Q',8)],evaluate:a=>[a.reduce((v,b,i)=>v|(b<<i),0)]},
 AND8:{inputs:[port('A',8),port('B',8)],outputs:[port('Q',8)],evaluate:([a,b])=>[a&b]},
 OR8:{inputs:[port('A',8),port('B',8)],outputs:[port('Q',8)],evaluate:([a,b])=>[a|b]},
 XOR8:{inputs:[port('A',8),port('B',8)],outputs:[port('Q',8)],evaluate:([a,b])=>[a^b]},
 NOT8:{inputs:[port('A',8)],outputs:[port('Q',8)],evaluate:([a])=>[~a&255]},
 SUB8:{inputs:[port('A',8),port('B',8)],outputs:[port('Q',8)],evaluate:([a,b])=>[(a-b)&255]},
 EQ8:{inputs:[port('A',8),port('B',8)],outputs:[port('Q')],evaluate:([a,b])=>[Number(a===b)]},
 LT8:{inputs:[port('A',8),port('B',8)],outputs:[port('Q')],evaluate:([a,b])=>[Number(a<b)]},
 SHL8:{inputs:[port('A',8)],outputs:[port('Q',8)],evaluate:([a])=>[(a<<1)&255]},
 SHR8:{inputs:[port('A',8)],outputs:[port('Q',8)],evaluate:([a])=>[a>>>1]}
});
types.SPLIT16={inputs:[port('A',16)],outputs:Array.from({length:16},(_,i)=>port('b'+i)),evaluate:([a])=>Array.from({length:16},(_,i)=>(a>>i)&1)};
types.JOIN16={inputs:Array.from({length:16},(_,i)=>port('b'+i)),outputs:[port('Q',16)],evaluate:a=>[a.reduce((v,b,i)=>v|(b<<i),0)]};
types.IN32={inputs:[],outputs:[port('Q',32)],evaluate:(_,n)=>[n.value||0]};
types.OUT32={inputs:[port('A',32)],outputs:[],evaluate:()=>[]};
types.REG32={inputs:[port('D',32),port('EN')],outputs:[port('Q',32)],stateful:true};
types.BUF32={inputs:[port('A',32)],outputs:[port('Q',32)],evaluate:([v])=>[v]};
types.ROM32={inputs:[port('PC',32)],outputs:[port('IR',32)],evaluate:([pc],n)=>[(n.program||[])[pc>>>2]||0]};
types.RAM32={inputs:[port('地址',32),port('数据',32),port('写入'),port('字节数',8)],outputs:[port('读出',32)],stateful:true,memory:true};
const registers=new Set(['CLOCK','DELAY','REG','REG8','REG32']);
const byteMemories=new Map([['RAM8',256],['SCREEN8',64]]);
const interfaceInputs=['IN','IN8','IN16','IN32'],interfaceOutputs=['OUT','OUT8','OUT16','OUT32'];
for(const width of [1,8,16,32]){
 const suffix=width===1?'':width;
 types['TRI'+suffix]={inputs:[port('D',width),port('EN')],outputs:[port('Q',width)],signalAware:true,
  evaluate:([d,en])=>[en===0?null:en===1?d:'X']};
 types['BUS'+suffix]={inputs:[port('A',width),port('B',width)],outputs:[port('Q',width),port('驱动'),port('冲突')],signalAware:true,
  evaluate:([a,b])=>{
   const conflict=a==='X'||b==='X'||(a!==null&&b!==null&&a!==b);
   return [conflict?'X':a??b,Number(a!==null||b!==null),Number(conflict)];
  }};
}
function memoryRead(memory,address,size){
 let result=0;
 for(let i=0;i<Math.min(size,4);i++)result|=(memory[(address+i)&65535]||0)<<(8*i);
 return result>>>0;
}
function definition(n){
 if(n.type==='CUSTOM'){
  if(!n.spec||!Array.isArray(n.spec.inputs)||!Array.isArray(n.spec.outputs))throw Error('自定义元件接口无效');
  return n.spec;
 }
 const d=types[n.type];if(!d)throw Error('未知元件类型 '+n.type);return d;
}
function validate(doc,depth=0,budget={count:0}){
 if(depth>12)throw Error('自定义元件嵌套最多 12 层');
 if(!doc||!Array.isArray(doc.nodes)||!Array.isArray(doc.wires)||doc.nodes.length>500||doc.wires.length>2000)throw Error('电路格式无效或超出规模限制');
 budget.count+=doc.nodes.length;if(budget.count>10000)throw Error('展开后的元件超过 10000 个');
 if(budget.wires!==undefined){
  budget.wires+=doc.wires.length;
  if(budget.wires>50000)throw Error('展开后的导线超过 50000 条');
 }
 for(const w of doc.wires){
  if(w.points!==undefined&&(!Array.isArray(w.points)||w.points.length>64||w.points.some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y))))throw Error('导线拐点无效');
  if(w.comment!==undefined&&(typeof w.comment!=='string'||w.comment.length>120))throw Error('导线标注最多 120 字');
 }
 const ids=new Set();
 for(const n of doc.nodes){
  const d=definition(n);
  if(typeof n.id!=='string'||!n.id||n.id.includes('/')||['__proto__','prototype','constructor'].includes(n.id)||ids.has(n.id)||!Number.isFinite(n.x)||!Number.isFinite(n.y))throw Error('元件 ID 或坐标无效');
  if(n.program&&(!Array.isArray(n.program)||n.program.length>(n.type==='ROM32'?16384:256)||n.program.some(v=>!Number.isInteger(v)||v<0||v>(n.type==='ROM32'?0xffffffff:65535))))throw Error('ROM 数据无效');
  const max=n.type==='IN32'?0xffffffff:n.type==='IN16'?65535:255;
  if(n.value!==undefined&&(!Number.isInteger(n.value)||n.value<0||n.value>max))throw Error('输入值超出范围');
  if(n.initial!==undefined&&(!Number.isInteger(n.initial)||n.initial<0||n.initial>2**(registers.has(n.type)?d.outputs[0].width:8)-1))throw Error('初始状态超出范围');
  if(n.type==='CUSTOM'){
   validate(n.spec.circuit,depth+1,budget);
   for(const [ports,output] of [[d.inputs,false],[d.outputs,true]]){
    if(ports.length>32)throw Error('自定义接口最多 32 个端口');
    const used=new Set();
    for(const p of ports){
     const terminal=n.spec.circuit.nodes.find(t=>t.id===p.id);
     if(!terminal||used.has(p.id)||!(output?interfaceOutputs:interfaceInputs).includes(terminal.type)||p.width!==(output?definition(terminal).inputs[0].width:definition(terminal).outputs[0].width))throw Error('自定义接口与内部端口不匹配');
     used.add(p.id);
    }
   }
   const count=n.spec.circuit.nodes.filter(t=>interfaceInputs.includes(t.type)||interfaceOutputs.includes(t.type)).length;
   if(count!==d.inputs.length+d.outputs.length)throw Error('自定义元件存在未声明的接口');
  }
  ids.add(n.id);
 }
 return doc;
}
function compileFlat(nodes,wires,options){
 const byId=new Map(nodes.map(n=>[n.id,n]));
 const incoming=new Map(nodes.map(n=>[n.id,Array(definition(n).inputs.length).fill(null)]));
 for(const w of wires){
  const from=byId.get(w.from),to=byId.get(w.to),pin=w.pin,output=w.output??0;
  if(!from||!to||!Number.isInteger(pin)||!Number.isInteger(output)||!definition(from).outputs[output]||!definition(to).inputs[pin])return {error:'连线端口不存在',node:w.to,wire:w.id};
  if(incoming.get(to.id)[pin])return {error:'同一输入端有多个驱动',node:to.id,wire:w.id};
  if(definition(from).outputs[output].width!==definition(to).inputs[pin].width)return {error:'连线两端位宽不一致',node:to.id,wire:w.id};
  incoming.get(to.id)[pin]=w;
 }
 for(const n of nodes)for(let i=0;i<incoming.get(n.id).length;i++)if(!incoming.get(n.id)[i])return {error:n.label+' 的 '+definition(n).inputs[i].name+' 未连接',node:n.id};
 const order=[],seen=new Set(),active=new Set(),path=[];
 function visit(id){
  if(active.has(id))return {error:'组合反馈环：'+[...path.slice(path.indexOf(id)),id].join(' → ')+'，请经过寄存器隔开周期',node:id};
  if(seen.has(id))return;
  active.add(id);path.push(id);
  const n=byId.get(id);
  // Registers expose old state. RAM reads depend on address; its write pins are sampled at commit.
  let dependencies=incoming.get(id);
  if(registers.has(n.type))dependencies=[];
  else if(byteMemories.has(n.type))dependencies=dependencies.slice(0,1);
  else if(n.type==='RAM32')dependencies=[dependencies[0],dependencies[3]];
  for(const w of dependencies){const e=visit(w.from);if(e)return e;}
  active.delete(id);path.pop();seen.add(id);order.push(id);
 }
 for(const n of nodes){const e=visit(n.id);if(e)return e;}
 const steps=order.map(id=>({id,n:byId.get(id),d:definition(byId.get(id))}));
 const clocked=nodes.filter(n=>definition(n).stateful);
 let compiled=null;
 if(options.wasm!==false){
  const wasm=root.CircuitWasm||(typeof require==='function'?require('./wasm.js'):null);
  try{compiled=wasm?.kernel(steps,incoming);}catch{/* Browsers may restrict WebAssembly compilation. */}
 }
 function initial(){
  const state=Object.create(null);
  for(const n of clocked){
   const size=byteMemories.get(n.type);
   state[n.id]=size?Array(size).fill(0):n.type==='RAM32'?{}:(n.initial||0);
  }
  return state;
 }
 function evaluate(state=initial(),overrides={}){
  if(compiled)return compiled(state,overrides);
  const values=Object.create(null);
  function inputs(id){return incoming.get(id).map(w=>values[w.from][w.output??0]);}
  for(const {id,n,d} of steps){
   if(registers.has(n.type))values[id]=[state[id]??0];
   else if(byteMemories.has(n.type)){
    const w=incoming.get(id)[0],address=values[w.from][w.output??0];
    values[id]=[typeof address==='number'?(state[id]?.[address&(byteMemories.get(n.type)-1)]||0):'X'];
   }
   else if(n.type==='RAM32'){
    const [addr,,,size]=incoming.get(id);
    const a=values[addr.from][addr.output??0],bytes=values[size.from][size.output??0];
    values[id]=[typeof a==='number'&&typeof bytes==='number'?memoryRead(state[id]||{},a,bytes):'X'];
   }
   else{
    const args=inputs(id);
    if(!d.signalAware&&!n.type.startsWith('BUF')&&args.some(v=>typeof v!=='number'))values[id]=d.outputs.map(()=>'X');
    else values[id]=d.evaluate(args,Object.hasOwn(overrides,id)?{...n,value:overrides[id]}:n);
   }
   values[id]=values[id].map((value,i)=>typeof value!=='number'?value:d.outputs[i].width===32?value>>>0:value&((1<<d.outputs[i].width)-1));
  }
  return {values,inputs};
 }
 function tick(state,overrides={}){
  const before=evaluate(state,overrides),next={...state},writes=[];
  for(const n of clocked){
   if(n.type==='CLOCK'){next[n.id]=1-(state[n.id]??0);continue;}
   const input=before.inputs(n.id);
   const en=n.type==='DELAY'?1:input[registers.has(n.type)?1:2];
   if(en!==0&&(en!==1||input.some(v=>typeof v!=='number')))throw Error(n.label+' 采样时遇到浮空或冲突的信号');
   if(registers.has(n.type)&&en)next[n.id]=input[0];
   if(n.type==='RAM32'&&input[2]){
    const memory={...state[n.id]};
    for(let i=0;i<Math.min(input[3],4);i++)memory[(input[0]+i)&65535]=(input[1]>>>(8*i))&255;
    next[n.id]=memory;writes.push({id:n.id,address:input[0]&65535,value:input[1]});
   }
   if(byteMemories.has(n.type)&&input[2]){
    const address=input[0]&(byteMemories.get(n.type)-1);
    next[n.id]=[...state[n.id]];next[n.id][address]=input[1];writes.push({id:n.id,address,value:input[1]});
   }
  }
  return {state:next,writes,...evaluate(next,overrides)};
 }
 return {initial,evaluate,tick,incoming,engine:compiled?'WebAssembly':'JavaScript'};
}
// Hierarchies become a single deterministic graph. Registers in nested components
// still share the same clock commit, and combinational cycles cross boundaries.
function compile(nodes,wires,options={}){
 try{
  validate({nodes,wires});
  const flatNodes=[],flatWires=[],boundaries=new Map();
  function expand(circuit,prefix='',interfaceMode=false){
   const local=new Map(circuit.nodes.map(n=>[n.id,n]));
   for(const n of circuit.nodes){
    const id=prefix+n.id;
    if(n.type==='CUSTOM'){
     boundaries.set(id,n.spec);
     expand(n.spec.circuit,id+'/',true);
    }else{
     const copy={...n,id};
     if(interfaceMode&&(interfaceInputs.includes(n.type)||interfaceOutputs.includes(n.type)))copy.type=n.type.replace(/^IN|^OUT/,'BUF');
     flatNodes.push(copy);
    }
   }
   const endpoint=(n,index,output)=>{
    let id=prefix+n.id,current=n;
    while(current.type==='CUSTOM'){
     const p=(output?current.spec.outputs:current.spec.inputs)[index];
     if(!p)throw Error('自定义元件连线端口不存在');
     id+='/'+p.id;current=current.spec.circuit.nodes.find(t=>t.id===p.id);index=0;
    }
    return {id,index};
   };
   for(const w of circuit.wires){
    const a=local.get(w.from),b=local.get(w.to);
    if(!a||!b)throw Error('连线端口不存在');
    const from=endpoint(a,w.output??0,true),to=endpoint(b,w.pin,false);
    flatWires.push({...w,id:prefix+w.id,from:from.id,output:from.index,to:to.id,pin:to.index});
   }
  }
  expand({nodes,wires});
  const flat=compileFlat(flatNodes,flatWires,options);if(flat.error)return flat;
  const incoming=new Map(nodes.map(n=>[n.id,Array(definition(n).inputs.length).fill(null)]));
  for(const w of wires)incoming.get(w.to)[w.pin]=w;
  function project(result){
   const values={...result.values};
   for(const [id,spec] of boundaries)values[id]=spec.outputs.map(p=>result.values[id+'/'+p.id][0]);
   return {...result,values,inputs:id=>incoming.get(id).map(w=>values[w.from][w.output??0])};
  }
  return {initial:flat.initial,incoming,evaluate:(state,overrides)=>project(flat.evaluate(state,overrides)),tick:(state,overrides)=>project(flat.tick(state,overrides)),expandedCount:flatNodes.length,engine:flat.engine};
 }catch(e){return {error:e.message};}
}
function encapsulate(circuit,name){
 validate(circuit);const net=compile(circuit.nodes,circuit.wires);if(net.error)throw Error(net.error);
 const inputs=circuit.nodes.filter(n=>interfaceInputs.includes(n.type)).map(n=>({id:n.id,name:n.label||n.id,width:definition(n).outputs[0].width}));
 const outputs=circuit.nodes.filter(n=>interfaceOutputs.includes(n.type)).map(n=>({id:n.id,name:n.label||n.id,width:definition(n).inputs[0].width}));
 if(!outputs.length)throw Error('至少需要一个输出端口');
 if(inputs.length>32||outputs.length>32)throw Error('每侧最多 32 个端口');
 return {name:String(name).slice(0,32)||'自定义元件',inputs,outputs,circuit:clone(circuit)};
}
function packBlueprint(circuit){
 validate(circuit,0,{count:0,wires:0});
 const modules=[],ids=new Map();
 function pack(board){
  return {...board,nodes:board.nodes.map(n=>{
   if(n.type!=='CUSTOM')return n;
   const {spec,...instance}=n;
   const model={...spec,circuit:pack(spec.circuit)},key=JSON.stringify(model);
   if(!ids.has(key)){ids.set(key,modules.length);modules.push(model);}
   return {...instance,module:ids.get(key)};
  })};
 }
 return {circuit:pack(circuit),modules};
}
function unpackBlueprint(data){
 if(data.modules===undefined)return validate(data.circuit);
 if(!Array.isArray(data.modules)||data.modules.length>10000)throw Error('元件定义表无效');
 const modules=[];
 function unpack(board){
  if(!Array.isArray(board?.nodes)||!Array.isArray(board.wires))throw Error('蓝图电路无效');
  return {...board,nodes:board.nodes.map(n=>{
   if(n.type!=='CUSTOM')return n;
   const {module,...instance}=n;
   if(!Number.isInteger(module)||!modules[module])throw Error('自定义元件引用无效');
   return {...instance,spec:modules[module]};
  })};
 }
 // A module may reference only earlier definitions, so the table is acyclic.
 for(const spec of data.modules)modules.push({...spec,circuit:unpack(spec?.circuit)});
 return validate(unpack(data.circuit),0,{count:0,wires:0});
}
const opcodes={NOP:0,LDI:1,ADD:2,SUB:3,AND:4,OR:5,XOR:6,LD:7,ST:8,JMP:9,JZ:10,HLT:15};
function assemble(source){
 const lines=source.split(/\r?\n/),labels=new Map(),instructions=[];
 for(let i=0;i<lines.length;i++){
  let text=lines[i].split(';')[0].trim();if(!text)continue;
  const label=text.match(/^([A-Za-z_]\w*):/);
  if(label){if(labels.has(label[1]))throw Error('第 '+(i+1)+' 行标签重复');labels.set(label[1],instructions.length);text=text.slice(label[0].length).trim();}
  if(text)instructions.push({text,line:i+1});
 }
 if(instructions.length>256)throw Error('程序最多 256 条指令');
 const words=instructions.map(({text,line})=>{
  const parts=text.split(/\s+/),name=parts[0].toUpperCase();
  if(!(name in opcodes))throw Error('第 '+line+' 行指令未知 '+name);
  const noArg=name==='NOP'||name==='HLT';
  if(parts.length!==(noArg?1:2))throw Error('第 '+line+' 行参数数量错误');
  const arg=noArg?0:labels.has(parts[1])?labels.get(parts[1]):Number(parts[1]);
  if(!Number.isInteger(arg)||arg<0||arg>255)throw Error('第 '+line+' 行参数应为 0 至 255 或已有标签');
  return (opcodes[name]<<8)|arg;
 });
 return {words,lines:instructions.map(i=>i.line)};
}
const api={types,compile,validate,assemble,opcodes,clone,definition,encapsulate,packBlueprint,unpackBlueprint};
if(typeof module!=='undefined')module.exports=api;else root.Circuit=api;
})(globalThis);
