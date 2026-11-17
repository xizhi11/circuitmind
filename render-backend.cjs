const Circuit=(()=>{const module={exports:{}};
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
 CONST:{inputs:[],outputs:[port('Q',8)],evaluate:(_,n)=>[n.value||0]},
 IN8:{inputs:[],outputs:[port('Q',8)],evaluate:(_,n)=>[n.value||0]},
 OUT8:{inputs:[port('A',8)],outputs:[],evaluate:()=>[]},
 REG8:{inputs:[port('D',8),port('EN')],outputs:[port('Q',8)],stateful:true},
 ADD8:{inputs:[port('A',8),port('B',8)],outputs:[port('Q',8)],evaluate:([a,b])=>[(a+b)&255]},
 MUX8:{inputs:[port('A',8),port('B',8),port('S')],outputs:[port('Q',8)],evaluate:([a,b,s])=>[s?b:a]},
 RAM8:{inputs:[port('ADR',8),port('DATA',8),port('WE')],outputs:[port('Q',8)],stateful:true,memory:true},
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
 const ids=new Set();
 for(const n of doc.nodes){
  const d=definition(n);
  if(typeof n.id!=='string'||!n.id||n.id.includes('/')||['__proto__','prototype','constructor'].includes(n.id)||ids.has(n.id)||!Number.isFinite(n.x)||!Number.isFinite(n.y))throw Error('元件 ID 或坐标无效');
  if(n.program&&(!Array.isArray(n.program)||n.program.length>256||n.program.some(v=>!Number.isInteger(v)||v<0||v>65535)))throw Error('ROM 数据无效');
  const max=n.type==='IN16'?65535:255;
  if(n.value!==undefined&&(!Number.isInteger(n.value)||n.value<0||n.value>max))throw Error('输入值超出范围');
  if(n.initial!==undefined&&(!Number.isInteger(n.initial)||n.initial<0||n.initial>(n.type==='REG'?1:255)))throw Error('初始状态超出范围');
  if(n.type==='CUSTOM'){
   validate(n.spec.circuit,depth+1,budget);
   for(const [ports,output] of [[d.inputs,false],[d.outputs,true]]){
    if(ports.length>32)throw Error('自定义接口最多 32 个端口');
    const used=new Set();
    for(const p of ports){
     const terminal=n.spec.circuit.nodes.find(t=>t.id===p.id);
     if(!terminal||used.has(p.id)||!(output?['OUT','OUT8','OUT16']:['IN','IN8','IN16']).includes(terminal.type)||p.width!==(output?definition(terminal).inputs[0].width:definition(terminal).outputs[0].width))throw Error('自定义接口与内部端口不匹配');
     used.add(p.id);
    }
   }
   const count=n.spec.circuit.nodes.filter(t=>['IN','IN8','IN16','OUT','OUT8','OUT16'].includes(t.type)).length;
   if(count!==d.inputs.length+d.outputs.length)throw Error('自定义元件存在未声明的接口');
  }
  ids.add(n.id);
 }
 return doc;
}
function compileFlat(nodes,wires){
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
 const order=[],seen=new Set(),active=new Set();
 function visit(id){
  if(active.has(id))return {error:'组合反馈环，请经过寄存器隔开周期',node:id};
  if(seen.has(id))return;
  active.add(id);
  const n=byId.get(id);
  // Registers expose old state. RAM reads depend on address; its write pins are sampled at commit.
  const dependencies=n.type==='REG'||n.type==='REG8'?[]:n.type==='RAM8'?incoming.get(id).slice(0,1):incoming.get(id);
  for(const w of dependencies){const e=visit(w.from);if(e)return e;}
  active.delete(id);seen.add(id);order.push(id);
 }
 for(const n of nodes){const e=visit(n.id);if(e)return e;}
 function initial(){
  const state=Object.create(null);
  for(const n of nodes)if(definition(n).stateful)state[n.id]=n.type==='RAM8'?Array(256).fill(0):(n.initial||0);
  return state;
 }
 function evaluate(state=initial(),overrides={}){
  const values=Object.create(null);
  function inputs(id){return incoming.get(id).map(w=>values[w.from][w.output??0]);}
  for(const id of order){
   const n=byId.get(id),d=definition(n);
   if(n.type==='REG'||n.type==='REG8')values[id]=[state[id]??0];
   else if(n.type==='RAM8'){const w=incoming.get(id)[0];values[id]=[(state[id]||[])[values[w.from][w.output??0]]||0];}
   else values[id]=d.evaluate(inputs(id),{...n,value:overrides[id]??n.value});
   values[id]=values[id].map((value,i)=>value&((1<<d.outputs[i].width)-1));
  }
  return {values,inputs};
 }
 function tick(state,overrides={}){
  const before=evaluate(state,overrides),next={...state},writes=[];
  for(const n of nodes){
   const input=before.inputs(n.id);
   if(n.type==='REG'||n.type==='REG8'){if(input[1])next[n.id]=input[0];}
   if(n.type==='RAM8'&&input[2]){next[n.id]=[...state[n.id]];next[n.id][input[0]]=input[1];writes.push({id:n.id,address:input[0],value:input[1]});}
  }
  return {state:next,writes,...evaluate(next,overrides)};
 }
 return {initial,evaluate,tick,incoming};
}
// Hierarchies become a single deterministic graph. Registers in nested components
// still share the same clock commit, and combinational cycles cross boundaries.
function compile(nodes,wires){
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
     if(interfaceMode&&['IN','IN8','IN16','OUT','OUT8','OUT16'].includes(n.type))copy.type='BUF'+(n.type.includes('16')?'16':n.type.includes('8')?'8':'');
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
  const flat=compileFlat(flatNodes,flatWires);if(flat.error)return flat;
  const incoming=new Map(nodes.map(n=>[n.id,Array(definition(n).inputs.length).fill(null)]));
  for(const w of wires)incoming.get(w.to)[w.pin]=w;
  function project(result){
   const values={...result.values};
   for(const [id,spec] of boundaries)values[id]=spec.outputs.map(p=>result.values[id+'/'+p.id][0]);
   return {...result,values,inputs:id=>incoming.get(id).map(w=>values[w.from][w.output??0])};
  }
  return {initial:flat.initial,incoming,evaluate:(state,overrides)=>project(flat.evaluate(state,overrides)),tick:(state,overrides)=>project(flat.tick(state,overrides)),expandedCount:flatNodes.length};
 }catch(e){return {error:e.message};}
}
function encapsulate(circuit,name){
 validate(circuit);const net=compile(circuit.nodes,circuit.wires);if(net.error)throw Error(net.error);
 const inputs=circuit.nodes.filter(n=>['IN','IN8','IN16'].includes(n.type)).map(n=>({id:n.id,name:n.label||n.id,width:definition(n).outputs[0].width}));
 const outputs=circuit.nodes.filter(n=>['OUT','OUT8','OUT16'].includes(n.type)).map(n=>({id:n.id,name:n.label||n.id,width:definition(n).inputs[0].width}));
 if(!outputs.length)throw Error('至少需要一个输出端口');
 if(inputs.length>32||outputs.length>32)throw Error('每侧最多 32 个端口');
 return {name:String(name).slice(0,32)||'自定义元件',inputs,outputs,circuit:clone(circuit)};
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
const api={types,compile,validate,assemble,opcodes,clone,definition,encapsulate};
if(typeof module!=='undefined')module.exports=api;else root.Circuit=api;
})(globalThis);

return module.exports;})();
const sandbox={};
(function(root){
const node=(id,type,x,y,label,value=0)=>({id,type,x,y,label:label||type,value});
const wire=(from,to,pin,output=0)=>({id:from+'-'+output+'-'+to+'-'+pin,from,to,pin,output});
function terminals(names,outs){
 return {nodes:[...names.map((s,i)=>node(s,'IN',90,105+i*110,s)),...outs.map((s,i)=>node(s,'OUT',920,180+i*180,s))],wires:[]};
}
const levels=[
 {id:'nand',title:'最初的 NAND',tag:'01 · 逻辑起点',text:'连接 A、B 到 NAND，再把结果接到 Q。只有两个输入都是 1，输出才为 0。',
 inputs:['A','B'],outputs:['Q'],allowed:['NAND'],expect:([a,b])=>[1-(a&b)],build:()=>terminals(['A','B'],['Q'])},
 {id:'not',title:'翻转一个比特',tag:'02 · 从 NAND 推导',text:'只用一个 NAND 实现 NOT。试着把 A 同时连接到两个输入。',
 inputs:['A'],outputs:['Q'],allowed:['NAND'],expect:([a])=>[1-a],build:()=>terminals(['A'],['Q'])},
 {id:'and',title:'让两个条件同时成立',tag:'03 · 组合逻辑',text:'只用 NAND 搭出 AND。先观察 NAND 的输出，再想办法翻转一次。',
 inputs:['A','B'],outputs:['Q'],allowed:['NAND'],expect:([a,b])=>[a&b],build:()=>terminals(['A','B'],['Q'])},
 {id:'xor',title:'相同为零，不同为一',tag:'04 · 逻辑组合',text:'用元件实现 XOR。可以直接试验 XOR，也可以挑战只用 NAND。',
 inputs:['A','B'],outputs:['Q'],allowed:['NAND','AND','OR','NOT','XOR'],expect:([a,b])=>[a^b],build:()=>terminals(['A','B'],['Q'])},
 {id:'half',title:'半加器',tag:'05 · 迈向算术',text:'将两个一位数相加。S 是和的低位，C 是进位。分别连接两个输出。',
 inputs:['A','B'],outputs:['S','C'],allowed:['NAND','AND','OR','NOT','XOR'],expect:([a,b])=>[a^b,a&b],build:()=>terminals(['A','B'],['S','C'])},
 {id:'full',title:'全加器维修站',tag:'06 · 诊断实验',text:'这里有一份进位支路接错的电路。定位首个失败输入，修复后通过全部八组测试。',
 inputs:['A','B','Cin'],outputs:['S','C'],allowed:['NAND','AND','OR','NOT','XOR'],expect:([a,b,c])=>[(a+b+c)&1,Number(a+b+c>=2)],build:()=>fullAdder(true)},
 {id:'register',title:'记住上一拍',tag:'07 · 时序逻辑',text:'把 D 和 EN 接到寄存器。EN 为 1 时，在下一拍保存 D；EN 为 0 时保持。改变输入后再点“下一拍”观察。',
 inputs:['D','EN'],outputs:['Q'],allowed:['IN','REG','NOT','NAND'],sequence:[{D:1,EN:1,Q:1},{D:0,EN:0,Q:1},{D:0,EN:1,Q:0},{D:1,EN:0,Q:0}],
 build:()=>{const d=terminals(['D','EN'],['Q']);d.nodes.push(node('reg','REG',470,220,'一位寄存器'));return d;}},
 {id:'counter',title:'八位计数器',tag:'08 · 状态与反馈',text:'运行已接好的计数器。REG8 的旧值经过加一，再在每拍写回。组合环通过寄存器被隔开。',
 build:()=>({nodes:[node('one','CONST',230,100,'步长',1),node('enable','IN',230,450,'EN',1),node('r','REG8',560,230,'计数寄存器'),node('add','ADD8',350,230,'加一'),node('q','OUT8',850,230,'计数')],
 wires:[wire('r','add',0),wire('one','add',1),wire('add','r',0),wire('enable','r',1),wire('r','q',0)]})},
 {id:'sandbox',title:'自由实验室',tag:'自由搭建',text:'搭建自己的组合或时序电路。8 位端口需要连接 8 位总线。RAM 的写操作在下一拍提交。',
 build:()=>({nodes:[node('a','IN',100,160,'A'),node('q','OUT',920,160,'Q')],wires:[]})},
 {id:'cpu',title:'让电路执行程序',tag:'09 · CM8 计算机',text:'这台参考计算机由 PC、ROM、译码器、ALU、ACC 和 RAM 连接而成。点击汇编加载，再单步观察；ST 255 将 ACC 的值写入终端。',
 build:cpu,program:'; 65 是字符 A\nLDI 65\nloop:\nST 255\nADD 1\nJMP loop'}
];
function fullAdder(broken=false){
 const d=terminals(['A','B','Cin'],['S','C']);
 d.nodes.push(node('x','XOR',310,100,'A XOR B'),node('s','XOR',650,110,'求和'),node('g','AND',310,350,'第一路进位'),node('p',broken?'OR':'AND',500,270,'第二路进位'),node('o','OR',720,350,'合并进位'));
 d.wires=[wire('A','x',0),wire('B','x',1),wire('x','s',0),wire('Cin','s',1),wire('s','S',0),wire('A','g',0),wire('B','g',1),wire('x','p',0),wire('Cin','p',1),wire('g','o',0),wire('p','o',1),wire('o','C',0)];
 return d;
}
function cpu(){
 const d={nodes:[node('pc','REG8',80,120,'PC'),node('rom','ROM16',270,120,'程序 ROM'),
 node('ctrl','CONTROL',470,110,'指令译码'),node('acc','REG8',940,390,'ACC'),
 node('alu','ALU8',700,290,'ALU'),node('ram','RAM8',700,550,'RAM · 256 B'),node('result','MUX8',920,550,'写回选择'),
 node('one','CONST',80,410,'常数 1',1),node('inc','ADD8',270,390,'PC + 1'),node('branch','MUX8',270,550,'跳转选择'),
 node('output','OUT8',1130,390,'ACC 观察')],wires:[]};
 const w=(a,b,p,o=0)=>d.wires.push(wire(a,b,p,o));
 w('pc','rom',0);w('rom','ctrl',0);w('acc','ctrl',1);
 w('acc','alu',0);w('ctrl','alu',1,0);w('ctrl','alu',2,1);
 w('alu','result',0);w('ram','result',1);w('ctrl','result',2,5);
 w('result','acc',0);w('ctrl','acc',1,2);
 w('ctrl','ram',0,0);w('acc','ram',1);w('ctrl','ram',2,4);
 w('pc','inc',0);w('one','inc',1);w('inc','branch',0);w('ctrl','branch',1,0);w('ctrl','branch',2,3);
 w('branch','pc',0);w('ctrl','pc',1,6);w('acc','output',0);
 d.nodes.find(n=>n.id==='rom').program=Circuit.assemble(levels.find(l=>l.id==='cpu').program).words;
 return d;
}
function minesProgram(){
 let text='; 3×3 固定雷区，中心为雷。规则在此程序中执行。\npoll:\nLD 254\nJZ poll\nST 253\nLDI 0\nST 254\n';
 for(let i=0;i<9;i++)text+='LD 253\nSUB '+(i+1)+'\nJZ cell'+i+'\n';
 text+='JMP poll\n';
 for(let i=0;i<9;i++){
  text+='cell'+i+':\nLD '+(32+i)+'\nJZ reveal'+i+'\nJMP poll\nreveal'+i+':\n';
  if(i===4)text+='LDI 42\nST 36\nLDI 1\nST 250\nHLT\n';
  else text+='LDI 49\nST '+(32+i)+'\nLD 252\nADD 1\nST 252\nSUB 8\nJZ victory\nJMP poll\n';
 }
 return text+'victory:\nLDI 2\nST 250\nHLT\n';
}
levels.push({id:'mines',title:'CPU 上的迷你扫雷',tag:'10 · 应用运行',text:'点击九宫格发出输入事件，再运行电路。CPU 程序负责揭格、计数和输赢。固定布局用于核对指令轨迹，中心格是雷。',
 program:minesProgram(),build:()=>{const d=cpu();d.nodes.find(n=>n.id==='rom').program=Circuit.assemble(minesProgram()).words;return d;}});
root.Game={levels,node,wire,fullAdder};
})(sandbox);


const Game=sandbox.Game;
(function(){
'use strict';
const {node:n,wire:w}=Game;
function board(inputs,outputs){
 return {nodes:[...inputs.map(([id,width],i)=>n(id,width===1?'IN':'IN'+width,60,60+i*90,id)),...outputs.map(([id,width],i)=>n(id,width===1?'OUT':'OUT'+width,1060,120+i*140,id))],wires:[]};
}
const gates=['NAND','AND','OR','XOR','NOT','NOR','XNOR'];
const buses=['SPLIT8','JOIN8','CONST','IN','IN8',...gates];
function task(id,title,chapter,inputs,outputs,allowed,expect,text,vectors){
 return {id,title,chapter,tag:chapter+' · 构建挑战',text,inputs:inputs.map(p=>p[0]),outputs:outputs.map(p=>p[0]),allowed,expect,vectors,build:()=>board(inputs,outputs)};
}
const pairs=[[0,0],[0,255],[255,0],[255,255],[1,1],[127,1],[128,128],[42,19],[170,85],[73,73]];
const vector=(inputs,fn,samples=pairs)=>samples.map(v=>({input:Object.fromEntries(inputs.map((id,i)=>[id,v[i]])),expected:fn(v)}));
const extra=[
 task('or','任一条件成立','01 逻辑门',[['A',1],['B',1]],[['Q',1]],['NAND','NOT'],([a,b])=>[a|b],'用 NAND 和反相构造 OR。利用德摩根定律解释结果。'),
 task('nor','两个条件都不成立','01 逻辑门',[['A',1],['B',1]],[['Q',1]],['OR','NOT','NAND'],([a,b])=>[1-(a|b)],'构造 NOR。两个输入都是 0 时，输出为 1。'),
 task('xnor','判断是否相同','01 逻辑门',[['A',1],['B',1]],[['Q',1]],['XOR','NOT','NAND'],([a,b])=>[1-(a^b)],'输出 A 与 B 是否相同。'),
 task('mux','一位选择器','02 数据通路',[['A',1],['B',1],['S',1]],[['Q',1]],gates,([a,b,s])=>[s?b:a],'S=0 选择 A，S=1 选择 B。完成后封装成 MUX。'),
 task('demux','一分为二','02 数据通路',[['D',1],['S',1]],[['L',1],['R',1]],gates,([d,s])=>[d&(1-s),d&s],'S=0 把 D 送往 L，S=1 送往 R，另一路必须为 0。'),
 task('not8','八位反相','03 总线与算术',[['A',8]],[['Q',8]],buses,([a])=>[255^a],'使用拆线器逐位反相，再通过合线器打包。b0 是最低位。',vector(['A'],([a])=>[255^a],[[0],[1],[85],[170],[127],[255]])),
 task('and8','八位逻辑与','03 总线与算术',[['A',8],['B',8]],[['Q',8]],buses,([a,b])=>[a&b],'将两条八位总线按位相与，再合并输出。',vector(['A','B'],([a,b])=>[a&b])),
 task('mux8','八位选择器','03 总线与算术',[['A',8],['B',8],['S',1]],[['Q',8]],[...buses,'MUX'],([a,b,s])=>[s?b:a],'复用你的一位选择器，或用逻辑门构造八位选择器。',vector(['A','B','S'],([a,b,s])=>[s?b:a],pairs.flatMap(p=>[[...p,0],[...p,1]]))),
 task('adder8','从全加器到八位加法','03 总线与算术',[['A',8],['B',8]],[['Q',8]],buses,([a,b])=>[(a+b)&255],'串联八个全加器，将上一位进位接入下一位。溢出舍去。可以复用自己的全加器。',vector(['A','B'],([a,b])=>[(a+b)&255])),
 task('subtract8','补码减法','03 总线与算术',[['A',8],['B',8]],[['Q',8]],[...buses,'NOT8','ADD8'],([a,b])=>[(a-b)&255],'利用 A + NOT B + 1 实现减法，结果按 256 取模。',vector(['A','B'],([a,b])=>[(a-b)&255])),
 task('equal8','八位比较','03 总线与算术',[['A',8],['B',8]],[['Q',1]],[...buses,'XOR8'],([a,b])=>[Number(a===b)],'只有全部八位都相同，Q 才等于 1。',vector(['A','B'],([a,b])=>[Number(a===b)])),
 task('shift8','左移一位','03 总线与算术',[['A',8]],[['Q',8]],['SPLIT8','JOIN8','IN'],([a])=>[(a<<1)&255],'通过重排导线完成左移，最低位补 0，最高位丢弃。',vector(['A'],([a])=>[(a<<1)&255],[[0],[1],[3],[127],[128],[255]]))
];
const register8=task('register8','保存一个字节','04 记忆与时钟',[['D',8],['EN',1]],[['Q',8]],['REG8','REG','SPLIT8','JOIN8'],null,'在时钟沿保存八位数据，EN=0 时保持原值。');
register8.vectors=[{input:{D:42,EN:1},expected:[42]},{input:{D:99,EN:0},expected:[42]},{input:{D:255,EN:1},expected:[255]},{input:{D:0,EN:0},expected:[255]}];register8.clocked=true;extra.push(register8);
const ram=task('memory','地址与存储','04 记忆与时钟',[['ADR',8],['DATA',8],['WE',1]],[['Q',8]],['RAM8'],null,'连接地址、数据、写使能。每一拍写入，读口随地址变化。测试会跨地址读回，检查是否真正保存。');
ram.clocked=true;ram.vectors=[{input:{ADR:3,DATA:42,WE:1},expected:[42]},{input:{ADR:8,DATA:99,WE:1},expected:[99]},{input:{ADR:3,DATA:0,WE:0},expected:[42]},{input:{ADR:8,DATA:0,WE:0},expected:[99]},{input:{ADR:4,DATA:0,WE:0},expected:[0]}];extra.push(ram);
const pc=task('pc-build','程序计数器','04 记忆与时钟',[['EN',1]],[['Q',8]],['REG8','ADD8','CONST'],null,'用寄存器、加法器和常数 1 构建计数器。EN=1 递增，EN=0 保持。');
pc.clocked=true;pc.vectors=[{input:{EN:1},expected:[1]},{input:{EN:1},expected:[2]},{input:{EN:0},expected:[2]},{input:{EN:1},expected:[3]}];extra.push(pc);
const alu=task('alu-build','两功能 ALU','05 计算机',[['A',8],['B',8],['OP',1]],[['Q',8]],['ADD8','AND8','MUX8',...buses],([a,b,op])=>[op?a&b:(a+b)&255],'OP=0 执行加法，OP=1 执行按位与。选择器将两个运算单元合成一个 ALU。',vector(['A','B','OP'],([a,b,op])=>[op?a&b:(a+b)&255],pairs.flatMap(p=>[[...p,0],[...p,1]])));extra.push(alu);
const cpuReference=Game.levels.find(l=>l.id==='cpu');
extra.push({id:'cpu-build',title:'连接你的计算机',chapter:'05 计算机',tag:'CPU · 综合挑战',text:'参考 CPU 的全部元件已放置，连线由你完成。使用 CM8 指令格式，加载程序后验证终端依次输出 A、B、C、D。每个元件的引脚可在探针中查看。',allowed:['REG8','ROM16','CONTROL','ALU8','RAM8','MUX8','ADD8','CONST','OUT8'],program:cpuReference.program,
 build:()=>{const d=cpuReference.build();d.wires=[];return d;},
 verify:net=>{let state=net.initial(),output=[];for(let i=0;i<16;i++){const r=net.tick(state);state=r.state;for(const w of r.writes)if(w.address===255)output.push(w.value);}return [{input:{cycles:16},expected:[65,66,67,68,69],actual:output,pass:JSON.stringify(output)===JSON.stringify([65,66,67,68,69])}];}});
const chapters={nand:'01 逻辑门',not:'01 逻辑门',and:'01 逻辑门',xor:'01 逻辑门',half:'02 数据通路',full:'02 数据通路',register:'04 记忆与时钟',counter:'04 记忆与时钟',cpu:'05 计算机',mines:'06 程序与应用',sandbox:'自由实验室'};
for(const l of Game.levels)l.chapter=chapters[l.id];
Game.levels.push(...extra);
Game.levels.sort((a,b)=>(a.chapter||'').localeCompare(b.chapter||'','zh-CN'));
Game.isComputer=l=>['cpu','cpu-build','mines','display'].includes(l.id);
const paint='; 显存 128..191；每个字节是 RGB332 像素\n'+Array.from({length:64},(_,i)=>'LDI '+((i%8)*32+Math.floor(i/8)*4)+'\nST '+(128+i)).join('\n')+'\nHLT';
Game.levels.splice(Game.levels.findIndex(l=>l.id==='sandbox'),0,{id:'display',title:'用指令点亮屏幕',chapter:'06 程序与应用',tag:'内存映射显示',text:'CPU 通过 ST 写入显存 128～191，屏幕读取这些字节显示 RGB332 彩色像素。修改程序，画出自己的图案。',program:paint,build:()=>{const d=cpuReference.build();d.nodes.find(n=>n.id==='rom').program=Circuit.assemble(paint).words;return d;}});
})();

(function(){
'use strict';
const {node,wire}=Game,{encapsulate,clone}=Circuit;
function builder(name,inputs,outputs){
 const d={nodes:[],wires:[]};let serial=0;
 function add(type,label,value=0,spec){const id='g'+serial++,i=d.nodes.length;d.nodes.push({...node(id,type,220+(i%5)*190,80+Math.floor(i/5)*130,label||type,value),...(spec?{spec}: {})});return id;}
 function custom(spec,label){return add('CUSTOM',label||spec.name,0,spec);}
 const connect=(a,b,p=0,o=0)=>d.wires.push(wire(a,b,p,o));
 const ins=inputs.map(([id,width],i)=>{d.nodes.push(node(id,width===1?'IN':'IN'+width,20,60+i*95,id));return id;});
 const outs=outputs.map(([id,width],i)=>{d.nodes.push(node(id,width===1?'OUT':'OUT'+width,1300,60+i*95,id));return id;});
 return {d,add,custom,connect,ins,outs,finish:()=>encapsulate(d,name)};
}
function unaryNot(){const b=builder('NOT · NAND 实现',[['A',1]],[['Q',1]]),g=b.add('NAND');b.connect('A',g,0);b.connect('A',g,1);b.connect(g,'Q');return b.finish();}
const not=unaryNot();
function gate(name,kind){
 const b=builder(name,[['A',1],['B',1]],[['Q',1]]);let result;
 if(kind==='AND'){const g=b.add('NAND'),i=b.custom(not);b.connect('A',g,0);b.connect('B',g,1);b.connect(g,i);result=i;}
 if(kind==='OR'){const a=b.custom(not),c=b.custom(not),g=b.add('NAND');b.connect('A',a);b.connect('B',c);b.connect(a,g,0);b.connect(c,g,1);result=g;}
 if(kind==='XOR'){const g=b.add('NAND'),a=b.add('NAND'),c=b.add('NAND'),o=b.add('NAND');b.connect('A',g,0);b.connect('B',g,1);b.connect('A',a,0);b.connect(g,a,1);b.connect('B',c,0);b.connect(g,c,1);b.connect(a,o,0);b.connect(c,o,1);result=o;}
 b.connect(result,'Q');return b.finish();
}
const and=gate('AND · NAND 实现','AND'),or=gate('OR · NAND 实现','OR'),xor=gate('XOR · NAND 实现','XOR');
const fa=(()=>{const b=builder('全加器 · NAND 实现',[['A',1],['B',1],['Cin',1]],[['S',1],['C',1]]),x=b.custom(xor),s=b.custom(xor),g=b.custom(and),p=b.custom(and),o=b.custom(or);for(const [a,c,pin] of [['A',x,0],['B',x,1],[x,s,0],['Cin',s,1],['A',g,0],['B',g,1],[x,p,0],['Cin',p,1],[g,o,0],[p,o,1],[s,'S',0],[o,'C',0]])b.connect(a,c,pin);return b.finish();})();
const add=(()=>{
 const b=builder('ADD8 · 八个全加器',[['A',8],['B',8]],[['Q',8]]),a=b.add('SPLIT8'),c=b.add('SPLIT8'),q=b.add('JOIN8');b.connect('A',a);b.connect('B',c);let carry=b.add('BIT','零',0),carryPort=0;
 for(let i=0;i<8;i++){const f=b.custom(fa,'位 '+i);b.connect(a,f,0,i);b.connect(c,f,1,i);b.connect(carry,f,2,carryPort);b.connect(f,q,i,0);carry=f;carryPort=1;}
 b.connect(q,'Q');return b.finish();
})();
const reg=(()=>{const b=builder('REG8 · 八个触发器',[['D',8],['EN',1]],[['Q',8]]),s=b.add('SPLIT8'),j=b.add('JOIN8');b.connect('D',s);for(let i=0;i<8;i++){const r=b.add('REG','位 '+i);b.connect(s,r,0,i);b.connect('EN',r,1);b.connect(r,j,i);}b.connect(j,'Q');return b.finish();})();
function bitwise(name,spec,unary=false){const b=builder(name,unary?[['A',8]]:[['A',8],['B',8]],[['Q',8]]),a=b.add('SPLIT8'),c=unary?null:b.add('SPLIT8'),j=b.add('JOIN8');b.connect('A',a);if(c)b.connect('B',c);for(let i=0;i<8;i++){const g=b.custom(spec,'位 '+i);b.connect(a,g,0,i);if(c)b.connect(c,g,1,i);b.connect(g,j,i);}b.connect(j,'Q');return b.finish();}
const and8=bitwise('AND8 · 按位与',and),or8=bitwise('OR8 · 按位或',or),xor8=bitwise('XOR8 · 按位异或',xor),not8=bitwise('NOT8 · 按位反相',not,true);
const mux=(()=>{const b=builder('MUX · 逻辑门实现',[['A',1],['B',1],['S',1]],[['Q',1]]),s=b.custom(not),a=b.custom(and),c=b.custom(and),o=b.custom(or);b.connect('S',s);b.connect('A',a,0);b.connect(s,a,1);b.connect('B',c,0);b.connect('S',c,1);b.connect(a,o,0);b.connect(c,o,1);b.connect(o,'Q');return b.finish();})();
const mux8=(()=>{const b=builder('MUX8 · 八个选择器',[['A',8],['B',8],['S',1]],[['Q',8]]),a=b.add('SPLIT8'),c=b.add('SPLIT8'),j=b.add('JOIN8');b.connect('A',a);b.connect('B',c);for(let i=0;i<8;i++){const m=b.custom(mux,'位 '+i);b.connect(a,m,0,i);b.connect(c,m,1,i);b.connect('S',m,2);b.connect(m,j,i);}b.connect(j,'Q');return b.finish();})();
const sub=(()=>{const b=builder('SUB8 · 补码减法',[['A',8],['B',8]],[['Q',8]]),i=b.custom(not8),a=b.custom(add),c=b.custom(add),one=b.add('CONST','一',1);b.connect('B',i);b.connect('A',a,0);b.connect(i,a,1);b.connect(a,c,0);b.connect(one,c,1);b.connect(c,'Q');return b.finish();})();
const eq=(()=>{const b=builder('EQ8 · 相等判断',[['A',8],['B',8]],[['Q',1]]),x=b.custom(xor8),s=b.add('SPLIT8');b.connect('A',x,0);b.connect('B',x,1);b.connect(x,s);let prev=b.add('BIT','零',0);for(let i=0;i<8;i++){const o=b.custom(or);b.connect(prev,o,0);b.connect(s,o,1,i);prev=o;}const last=b.custom(not);b.connect(prev,last);b.connect(last,'Q');return b.finish();})();
const alu=(()=>{
 const b=builder('ALU8 · 可展开数据通路',[['A',8],['B',8],['OP',8]],[['Q',8]]);const candidates=['B'];
 for(const spec of [add,sub,and8,or8,xor8]){const g=b.custom(spec);b.connect('A',g,0);b.connect('B',g,1);candidates.push(g);}
 let result=b.add('CONST','默认零',0);
 for(let i=0;i<6;i++){const code=b.add('CONST','操作码 '+i,i),e=b.custom(eq),m=b.custom(mux8);b.connect('OP',e,0);b.connect(code,e,1);b.connect(result,m,0);b.connect(candidates[i],m,1);b.connect(e,m,2);result=m;}
 b.connect(result,'Q');return b.finish();
})();
const ctrl=(()=>{
 const b=builder('CONTROL · 可展开译码器',[['IR',16],['ACC',8]],[['IMM',8],['OP',8],['WRITE',1],['BRANCH',1],['STORE',1],['LOAD',1],['RUN',1]]),s=b.add('SPLIT16'),imm=b.add('JOIN8'),opcode=b.add('JOIN8');b.connect('IR',s);for(let i=0;i<8;i++){b.connect(s,imm,i,i);b.connect(s,opcode,i,i+8);}b.connect(imm,'IMM');
 const decoded={};for(const i of [1,2,3,4,5,6,7,8,9,10,15]){const k=b.add('CONST','指令 '+i,i),e=b.custom(eq);b.connect(opcode,e,0);b.connect(k,e,1);decoded[i]=e;}
 let write=b.add('BIT','零',0);for(let i=1;i<=7;i++){const g=b.custom(or);b.connect(write,g,0);b.connect(decoded[i],g,1);write=g;}b.connect(write,'WRITE');
 b.connect(decoded[8],'STORE');b.connect(decoded[7],'LOAD');const run=b.custom(not);b.connect(decoded[15],run);b.connect(run,'RUN');
 const zero=b.add('CONST','零',0),eqZero=b.custom(eq),conditional=b.custom(and),branch=b.custom(or);b.connect('ACC',eqZero,0);b.connect(zero,eqZero,1);b.connect(eqZero,conditional,0);b.connect(decoded[10],conditional,1);b.connect(conditional,branch,0);b.connect(decoded[9],branch,1);b.connect(branch,'BRANCH');
 let op=zero;for(let i=2;i<=6;i++){const code=b.add('CONST','ALU '+(i-1),i-1),m=b.custom(mux8);b.connect(op,m,0);b.connect(code,m,1);b.connect(decoded[i],m,2);op=m;}b.connect(op,'OP');return b.finish();
})();
Game.references=[not,and,or,xor,fa,add,reg,and8,or8,xor8,not8,mux,mux8,sub,eq,alu,ctrl];
const ref=Game.levels.find(l=>l.id==='cpu');
Game.levels.splice(Game.levels.findIndex(l=>l.id==='mines'),0,{id:'gate-cpu',title:'打开计算机的每一层',chapter:'05 计算机',tag:'NAND → CPU · 层级参考电路',text:'加法器、ALU、寄存器和译码器均由可展开的电路构成。选择任一自定义元件，打开内部副本逐层查看，直到 NAND。触发器、存储器和线路拆合是仿真基础元件。',program:ref.program,build:()=>{const d=clone(ref.build());for(const n of d.nodes){const spec={REG8:reg,ADD8:add,MUX8:mux8,ALU8:alu,CONTROL:ctrl}[n.type];if(spec){n.type='CUSTOM';n.spec=spec;}}return d;}});
const previous=Game.isComputer;Game.isComputer=l=>l.id==='gate-cpu'||previous(l);
})();

const C=Circuit;
function execute(tool,request){
 const {circuit,inputs={},state}=request;
 C.validate(circuit);
 const nodes=new Map(circuit.nodes.map(n=>[n.id,n]));
 if(!inputs||typeof inputs!=='object'||Array.isArray(inputs))throw Error('inputs 必须是对象');
 for(const [id,value] of Object.entries(inputs)){
  const n=nodes.get(id);if(!n||!['IN','IN8','IN16','BIT','CONST'].includes(n.type))throw Error('输入源不存在：'+id);
  const width=C.definition(n).outputs[0].width;if(!Number.isInteger(value)||value<0||value>2**width-1)throw Error('输入超出位宽：'+id);
 }
 const net=C.compile(circuit.nodes,circuit.wires);
 if(tool==='inspect')return {valid:!net.error,error:net.error||null,node:net.node||null,wire:net.wire||null,expandedCount:net.expandedCount||0,nodes:circuit.nodes.map(n=>({id:n.id,label:n.label,type:n.type,inputs:C.definition(n).inputs,outputs:C.definition(n).outputs})),wires:circuit.wires};
 if(net.error)return {valid:false,error:net.error,node:net.node||null,wire:net.wire||null};
 let current=net.initial();
 if(state!==undefined){
  if(!state||typeof state!=='object'||Array.isArray(state))throw Error('state 必须是状态对象');
  if(Object.keys(state).some(k=>!Object.hasOwn(current,k)))throw Error('state 包含未知状态元件');
  for(const key of Object.keys(current)){
   if(!Object.hasOwn(state,key))throw Error('state 缺少 '+key);
   const value=state[key],initial=current[key];
   if(Array.isArray(initial)){if(!Array.isArray(value)||value.length!==256||value.some(v=>!Number.isInteger(v)||v<0||v>255))throw Error('RAM 状态无效');}
   else {
    let scope=circuit,node;for(const part of key.split('/')){node=scope.nodes.find(n=>n.id===part);if(node?.type==='CUSTOM')scope=node.spec.circuit;}
    if(!Number.isInteger(value)||value<0||value>(node?.type==='REG'?1:255))throw Error('寄存器状态无效');
   }
  }
  current=C.clone(state);
 }
 const view=r=>({values:Object.fromEntries(circuit.nodes.map(n=>[n.id,r.values[n.id]])),outputs:Object.fromEntries(circuit.nodes.filter(n=>!C.definition(n).outputs.length).map(n=>[n.id,r.inputs(n.id)]))});
 if(tool==='evaluate')return {valid:true,...view(net.evaluate(current,inputs))};
 if(tool==='step'){
  const ticks=request.ticks??1;if(!Number.isInteger(ticks)||ticks<1||ticks>256)throw Error('ticks 必须是 1 至 256');
  const writes=[];let result;
  for(let i=0;i<ticks;i++){result=net.tick(current,inputs);current=result.state;writes.push(...result.writes.map(w=>({...w,tick:i+1})));}
  return {valid:true,ticks,state:current,writes,...view(result)};
 }
 if(tool==='trace'){
  if(!nodes.has(request.target))throw Error('target 元件不存在');
  const visited=new Set(),wires=new Set();
  function walk(id){if(visited.has(id))return;visited.add(id);if(['REG','REG8'].includes(nodes.get(id).type))return;for(const w of circuit.wires.filter(w=>w.to===id)){wires.add(w.id);walk(w.from);}}
  walk(request.target);return {valid:true,target:request.target,nodes:[...visited],wires:[...wires],boundary:'寄存器停止追踪；自定义元件按外部接口追踪，内部依赖可能被保守包含'};
 }
 if(tool==='test'){
  const level=Game.levels.find(l=>l.id===request.levelId);
  let cases=request.cases,clocked=request.clocked===true;
  if(request.levelId&&!level)throw Error('关卡不存在');
  if(level?.verify){const results=level.verify(net,circuit);return {valid:true,passed:results.filter(r=>r.pass).length,total:results.length,cases:results};}
  if(level){
   if(level.vectors){cases=level.vectors;clocked=!!level.clocked;}
   else if(level.sequence){clocked=true;cases=level.sequence.map(input=>({input:Object.fromEntries(level.inputs.map(id=>[id,input[id]])),expected:{[level.outputs[0]]:input.Q}}));}
   else if(level.expect)cases=Array.from({length:2**level.inputs.length},(_,i)=>{const values=level.inputs.map((_,k)=>(i>>(level.inputs.length-1-k))&1);return {input:Object.fromEntries(level.inputs.map((id,k)=>[id,values[k]])),expected:level.expect(values)};});
   else throw Error('此关卡没有自动测试，请提供 cases 并省略 levelId');
   if(![...(level.inputs||[]),...(level.outputs||[])].every(id=>nodes.has(id)))throw Error('缺少关卡输入输出端口');
  }
  if(!Array.isArray(cases)||!cases.length||cases.length>256)throw Error('cases 需要 1 至 256 项');
  const results=cases.map(test=>{
   // Reuse input validation, but execute the same compiled graph and clock state.
   for(const [id,value] of Object.entries(test.input||{})){const n=nodes.get(id);if(!n||!['IN','IN8','IN16'].includes(n.type)||!Number.isInteger(value)||value<0||value>2**C.definition(n).outputs[0].width-1)throw Error('测试输入无效');}
   const r=clocked?net.tick(current,test.input):net.evaluate(current,test.input);if(clocked)current=r.state;
   const expected=Array.isArray(test.expected)?Object.fromEntries((level?.outputs||[]).map((id,i)=>[id,test.expected[i]])):test.expected;
   if(!expected||typeof expected!=='object'||!Object.keys(expected).length)throw Error('expected 必须包含输出元件及期望值');
   const actual={};for(const id of Object.keys(expected)){const n=nodes.get(id);if(!n||C.definition(n).outputs.length||!Number.isInteger(expected[id]))throw Error('测试输出无效');actual[id]=r.inputs(id)[0];}
   return {input:test.input,expected,actual,pass:Object.entries(expected).every(([id,v])=>actual[id]===v)};
  });
  return {valid:true,clocked,passed:results.filter(r=>r.pass).length,total:results.length,cases:results};
 }
 throw Error('未知工具');
}


'use strict';

// HiAgent ChatService: credentials stay on the server.
function createMentor({apiKey=process.env.HIAGENT_API_KEY,fetchImpl=globalThis.fetch}={}){
 const base='https://ai-agent.ccnu.edu.cn/api/proxy/api/v1';
 async function post(endpoint,body){
  const response=await fetchImpl(base+endpoint,{method:'POST',redirect:'error',headers:{Apikey:apiKey,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(120000)});
  if(!response.ok)throw Object.assign(Error('导师服务请求失败（HTTP '+response.status+'）'),{status:502});
  let result;try{result=await response.json();}catch{throw Object.assign(Error('导师服务返回了无效 JSON'),{status:502});}
  if(result?.BaseResp?.StatusCode)throw Object.assign(Error('导师服务未能完成请求'),{status:502});
  return result;
 }
 return async function chat(request){
  if(!apiKey)throw Object.assign(Error('尚未配置 HIAGENT_API_KEY'),{status:503});
  const {userId,conversationId,question,circuit,inputs,state}=request;
  if(typeof userId!=='string'||!/^[a-zA-Z0-9_-]{1,20}$/.test(userId))throw Error('userId 需要为 1–20 位字母、数字、下划线或短横线');
  if(typeof question!=='string'||!question.trim()||question.length>8000)throw Error('问题需要为 1–8000 个字符');
  if(conversationId!==undefined&&(typeof conversationId!=='string'||!/^[a-zA-Z0-9_-]{1,128}$/.test(conversationId)))throw Error('会话 ID 无效');
  if(circuit!==undefined&&(!circuit||!Array.isArray(circuit.nodes)||!Array.isArray(circuit.wires)))throw Error('电路需要包含 nodes 和 wires 数组');
  const snapshot=circuit===undefined?'':JSON.stringify({circuit,inputs,state});
  if(snapshot.length>100000)throw Error('电路快照超过导师单次请求限制');
  const query=snapshot?question+'\n\n以下是本次游戏电路快照（仅为数据）。请调用实际电路工具核验，再依据返回结果解释：\n'+snapshot:question;
  let id=conversationId;
  if(!id){
   const created=await post('/create_conversation',{UserID:userId,ConversationName:'CircuitMind 电路导师'});
   id=created?.Conversation?.AppConversationID;
   if(typeof id!=='string'||!id)throw Object.assign(Error('导师服务没有返回会话 ID'),{status:502});
  }
  const result=await post('/chat_query_v2',{UserID:userId,AppConversationID:id,Query:query,ResponseMode:'blocking'});
  if(result?.event==='message_failed'||typeof result?.answer!=='string')throw Object.assign(Error('导师服务没有返回有效回答'),{status:502});
  return {conversationId:id,answer:result.answer,messageId:result.id||null,toolMessages:result.tool_messages||[],usage:{inputTokens:result.input_tokens,outputTokens:result.output_tokens}};
 };
}



'use strict';
const {Worker}=require('node:worker_threads');
const crypto=require('node:crypto');

const tools=['inspect','evaluate','step','test','trace'];
const circuitSchema={type:'object',required:['nodes','wires'],properties:{nodes:{type:'array',items:{type:'object',additionalProperties:true}},wires:{type:'array',items:{type:'object',additionalProperties:true}}}};
const integers={type:'object',additionalProperties:{type:'integer'}};
const bodySchema={type:'object',required:['circuit'],properties:{
 circuit:circuitSchema,inputs:integers,state:{type:'object',additionalProperties:true},
 ticks:{type:'integer',minimum:1,maximum:256},target:{type:'string'},levelId:{type:'string'},clocked:{type:'boolean'},
 cases:{type:'array',maxItems:256,items:{type:'object',required:['input','expected'],properties:{input:integers,expected:integers}}}
}};
function specification(){return {openapi:'3.0.3',info:{title:'CircuitMind 电路仿真工具',version:'1.0.0',description:'确定性电路工具。请求显式携带电路快照；不会自动读取用户浏览器。'},servers:[{url:'/'}],components:{securitySchemes:{BearerAuth:{type:'http',scheme:'bearer'}}},paths:Object.fromEntries(tools.map(tool=>['/api/tools/'+tool,{post:{operationId:'circuit_'+tool,summary:{inspect:'检查电路结构',evaluate:'计算组合输出',step:'推进时钟并返回新状态',test:'执行关卡或自定义测试',trace:'追踪输出上游线路'}[tool],description:'使用原始电路 JSON。省略 state 时从初始状态执行。',security:[{BearerAuth:[]}],requestBody:{required:true,content:{'application/json':{schema:bodySchema}}},responses:{200:{description:'真实仿真结果或电路错误',content:{'application/json':{schema:{type:'object',additionalProperties:true}}}},400:{description:'请求格式无效'},401:{description:'认证失败'},413:{description:'请求过大'},503:{description:'工具繁忙或超时'}}}}]))};}
function createApi({token=process.env.CIRCUITMIND_API_TOKEN||''}={}){
 let active=0;
 const mentor=createMentor();
 return async function api(req,res,pathname){
  if(!['/health','/openapi.json','/api/example'].includes(pathname)&&!pathname.startsWith('/api/'))return false;
  const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  if(req.method==='GET'&&pathname==='/health'){send(200,{ok:true,service:'CircuitMind',version:'1.0.0'});return true;}
  if(req.method==='GET'&&pathname==='/openapi.json'){const spec=specification(); if(process.env.RENDER_EXTERNAL_URL)spec.servers=[{url:process.env.RENDER_EXTERNAL_URL}]; send(200,spec);return true;}
  if(token){const provided=String(req.headers.authorization||''),expected='Bearer '+token;if(Buffer.byteLength(provided)!==Buffer.byteLength(expected)||!crypto.timingSafeEqual(Buffer.from(provided),Buffer.from(expected))){send(401,{error:'需要有效的 Bearer Token'});return true;}}
  if(req.method==='GET'&&pathname==='/api/example'){const n=(id,type,x)=>({id,type,x,y:0,label:id,value:0}),w=(from,to,pin)=>({id:from+to+pin,from,to,pin});send(200,{circuit:{nodes:[n('A','IN',0),n('B','IN',0),n('N','NAND',200),n('Q','OUT',400)],wires:[w('A','N',0),w('B','N',1),w('N','Q',0)]},inputs:{A:1,B:1}});return true;}
  const isMentor=pathname==='/api/mentor/chat';
  const tool=pathname.split('/')[3];if(!isMentor&&(!tools.includes(tool)||pathname!=='/api/tools/'+tool)){send(404,{error:'接口不存在'});return true;}
  if(req.method!=='POST'){send(405,{error:'请使用 POST'});return true;}
  if(active>=2){send(503,{error:'工具繁忙，请稍后重试'});return true;}
  if(!String(req.headers['content-type']||'').startsWith('application/json')){send(415,{error:'需要 application/json'});return true;}
  active++;
  try{
   const request=await new Promise((resolve,reject)=>{let chunks=[],bytes=0;req.on('data',chunk=>{bytes+=chunk.length;if(bytes>4*1024*1024){chunks=[];reject(Object.assign(Error('请求超过 4 MiB'),{status:413}));}else chunks.push(chunk);});req.on('end',()=>{try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{reject(Error('JSON 格式无效'));}});req.on('error',reject);req.on('aborted',()=>reject(Error('请求已中断')));});
   if(!request||typeof request!=='object'||Array.isArray(request))throw Error('请求必须是对象');
   if(isMentor){send(200,await mentor(request));return true;}
   const result=await new Promise((resolve,reject)=>{
    const worker=new Worker(__filename,{workerData:{tool,request},resourceLimits:{maxOldGenerationSizeMb:192}});
    const timer=setTimeout(()=>{worker.terminate();reject(Object.assign(Error('仿真超过 8 秒限制'),{status:503}));},8000);
    worker.once('message',message=>{clearTimeout(timer);worker.terminate();message.error?reject(Error(message.error)):resolve(message.result);});worker.once('error',e=>{clearTimeout(timer);reject(e);});worker.once('exit',code=>{clearTimeout(timer);if(code!==0)reject(Error('仿真进程已终止'));});
   });
   send(200,result);
  }catch(e){send(e.status||400,{error:e.message});}finally{active--;}
  return true;
 };
}


const {isMainThread,parentPort,workerData}=require('node:worker_threads');
if(!isMainThread){try{parentPort.postMessage({result:execute(workerData.tool,workerData.request)});}catch(e){parentPort.postMessage({error:e.message});}}
else {
 if(!process.env.CIRCUITMIND_API_TOKEN)throw Error('CIRCUITMIND_API_TOKEN is required');
 const api=createApi();const server=require('node:http').createServer(async(req,res)=>{
  try{const pathname=new URL(req.url,'http://localhost').pathname;if(await api(req,res,pathname))return;res.writeHead(404,{'Content-Type':'application/json'}).end(JSON.stringify({error:'Not found'}));}catch(e){if(!res.headersSent)res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Internal server error'}));}
 });server.requestTimeout=15000;server.headersTimeout=10000;
 if(require.main===module)server.listen(Number(process.env.PORT||10000),'0.0.0.0',()=>console.log('CircuitMind API listening'));
 module.exports=server;
}
