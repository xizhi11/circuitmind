(function(){
'use strict';
const {node,wire}=Game,{definition}=Circuit;
const byId=id=>Game.levels.find(lesson=>lesson.id===id);
function builder(level){
 const original=level.build();
 const d={nodes:original.nodes.filter(n=>level.inputs.includes(n.id)||level.outputs.includes(n.id)),wires:[]};
 const connections=[];
 function add(type,inputs=[],label=type,value=0,spec){
  const index=d.nodes.length-level.inputs.length-level.outputs.length,id='demo-'+index;
  d.nodes.push({...node(id,type,250,70,label,value),...(spec?{spec}:{})});
  inputs.forEach((source,pin)=>connect(source,id,pin));
  return id;
 }
 function connect(source,to,pin=0){
  const [from,output=0]=Array.isArray(source)?source:[source];
  d.wires.push(wire(from,to,pin,output));
  connections.push([from,to]);
 }
 function finish(...outputs){
  outputs.forEach((id,i)=>connect(id,level.outputs[i]));
  const columns=new Map(level.inputs.map(id=>[id,0])), counters=new Map();
  for(const part of d.nodes){
   if(level.inputs.includes(part.id)||level.outputs.includes(part.id))continue;
   const incoming=connections.filter(([,to])=>to===part.id);
   columns.set(part.id,1+Math.max(0,...incoming.map(([from])=>columns.get(from)??0)));
  }
  const end=Math.max(0,...columns.values())+1;
  for(const part of d.nodes){
   const column=columns.get(part.id)??end,y=counters.get(column)??0;
   part.x=30+column*205;part.y=40+y;
   const type=definition(part);
   counters.set(column,y+Math.max(108,55+18*Math.max(type.inputs.length,type.outputs.length)));
  }
  return d;
 }
 return {add,connect,finish};
}

function booleanExample(level){
 const b=builder(level),{inputs,outputs}=level;
 const nand=(a,c)=>b.add('NAND',[a,c]);
 const not=a=>nand(a,a);
 const and=(a,c)=>not(nand(a,c));
 const or=(a,c)=>nand(not(a),not(c));
 const a=inputs[0],c=inputs[1];
 if(level.id==='nand')return b.finish(nand(a,c));
 if(level.id==='not')return b.finish(not(a));
 if(level.id==='and')return b.finish(and(a,c));
 if(level.id==='or')return b.finish(or(a,c));
 if(level.id==='xor'||level.id==='half'){
  const g=nand(a,c),x=nand(nand(a,g),nand(c,g));
  return level.id==='xor'?b.finish(x):b.finish(x,not(g));
 }
 if(level.id==='full')return Game.fullAdder(false);
 if(level.id==='mux'){
  return b.finish(or(and('A',not('S')),and('B','S')));
 }
 if(level.id==='mux4'){
  const low=b.add('MUX',['A','B','S0']),high=b.add('MUX',['C','D','S0']);
  return b.finish(b.add('MUX',[low,high,'S1']));
 }
 // Produce a sum of minterms for the small, fully specified truth tables.
 const rows=Array.from({length:2**inputs.length},(_,mask)=>inputs.map((_,i)=>(mask>>i)&1));
 const zero=()=>b.add('BIT',[],'常低',0);
 const one=()=>b.add('BIT',[],'常高',1);
 const inverse=inputs.map(not);
 const terms=rows.map(row=>row.map((value,i)=>value?inputs[i]:inverse[i]).reduce(and));
 return b.finish(...outputs.map((_,i)=>{
  const selected=terms.filter((_,j)=>level.expect(rows[j])[i]===1);
  if(!selected.length)return zero();
  if(selected.length===rows.length)return one();
  return selected.reduce(or);
 }));
}
function wordExample(level){
 const b=builder(level),{add,finish}=b;
 const a=()=>add('SPLIT8',['A']),c=()=>add('SPLIT8',['B']);
 const gate=(type,...inputs)=>add(type,inputs);
 const zero=()=>add('BIT',[],'常低',0);
 const join=bits=>gate('JOIN8',...bits);
 const bits=part=>Array.from({length:8},(_,i)=>[part,i]);
 const constant=value=>add('CONST',[],'0x'+value.toString(16),value);
 const reference=name=>Game.references.find(spec=>spec.name.startsWith(name));
 if(level.id==='alu-cpu')return Circuit.clone(reference('ALU8').circuit);
 if(level.id==='control-build')return Circuit.clone(reference('CONTROL').circuit);
 if(level.id==='adder8')return Circuit.clone(reference('ADD8').circuit);
 if(level.id==='subtract8')return Circuit.clone(reference('SUB8').circuit);
 if(level.id==='mux8')return Circuit.clone(reference('MUX8').circuit);
 if(level.id==='alu-build')return finish(gate('MUX8',gate('ADD8','A','B'),gate('AND8','A','B'),'OP'));
 if(level.id==='negate')return finish(gate('SUB8',constant(0),'A'));
 if(level.id==='equal8')return Circuit.clone(reference('EQ8').circuit);
 if(level.id==='signed'||level.id==='unsigned'){
  if(level.id==='signed'){
   const signA=[a(),7],signB=[c(),7];
   return finish(gate('MUX',gate('LT8','A','B'),signA,gate('XOR',signA,signB)));
  }
  const lhs=a(),rhs=c();
  let less=zero();
  for(let i=0;i<8;i++){
   const A=[lhs,i],B=[rhs,i],different=gate('XOR',A,B);
   less=gate('MUX',less,B,different);
  }
  return finish(less);
 }
 if(level.id==='carry8'||level.id==='signed-overflow'){
  const lhs=bits(a()),rhs=bits(c()),sum=gate('ADD8','A','B'),q=bits(gate('SPLIT8',sum));
  const carry=gate('OR',gate('AND',lhs[7],rhs[7]),gate('AND',gate('XOR',lhs[7],rhs[7]),gate('NOT',q[7])));
  const overflow=gate('AND',gate('XOR',lhs[7],q[7]),gate('XOR',rhs[7],q[7]));
  return level.id==='carry8'?finish(sum,carry):finish(sum,carry,overflow);
 }
 if(level.id==='tiny-rom'){
  const words=[0x12,0xA5,0x3C,0xE7].map(constant);
  return finish(gate('MUX8',gate('MUX8',words[0],words[1],'A'),gate('MUX8',words[2],words[3],'A'),'B'));
 }
 if(level.id==='shared-bus'||level.id==='bus-handoff'){
  const bus=gate('BUS8',gate('TRI8','A','EA'),gate('TRI8','B','EB'));
  return level.id==='shared-bus'?finish([bus,1],[bus,2]):finish(bus,[bus,1],[bus,2]);
 }
 const input=bits(a()),operation={'not8':'NOT','and8':'AND','or8-build':'OR','nand8':'NAND','xor-byte':'XOR'}[level.id];
 if(operation){
  const rhs=level.id==='not8'?null:bits(c());
  return finish(join(input.map((bit,i)=>gate(operation,...(rhs?[bit,rhs[i]]:[bit])))));
 }
 if(level.id==='shift8')return finish(join([zero(),...input.slice(0,7)]));
 if(level.id==='lsr'||level.id==='asr')return finish(join([...input.slice(1),level.id==='asr'?input[7]:zero()]));
 if(level.id==='mod4')return finish(join([...input.slice(0,2),...Array(6).fill(zero())]));
 if(level.id==='parity8')return finish(input.reduce((left,right)=>gate('XOR',left,right)));
 throw Error('缺少总线示范：'+level.id);
}
function clockExample(level){
 const b=builder(level),{add,connect,finish}=b;
 const high=()=>add('BIT',[],'常高',1);
 switch(level.id){
  case 'sr-latch':{
   const state=add('DELAY',[],'保存上一拍');
   const next=add('AND',[add('OR',['S',state]),add('NOT',['R'])]);
   connect(next,state);
   return finish(state);
  }
  case 'dff-build':{
   const sr=Circuit.encapsulate(clockExample(byId('sr-latch')),'同步 SR 锁存器');
   return finish(add('CUSTOM',['D',add('NOT',['D'])],sr.name,0,sr));
  }
  case 'register':{
   const dff=Circuit.encapsulate(clockExample(byId('dff-build')),'D 触发器');
   const register=add('CUSTOM',[],dff.name,0,dff);
   connect(add('MUX',[register,'D','EN'],'保持或写入'),register);
   return finish(register);
  }
  case 'reset-register':return finish(add('REG',[add('AND',['D',add('NOT',['RST'])]),add('OR',['EN','RST'])]));
  case 'delay2':return finish(add('REG',[add('REG',['D',high()]),high()]));
  case 'toggle':{
   const state=add('REG',[],'翻转状态');
   connect(add('NOT',[state]),state);connect('EN',state,1);
   return finish(state);
  }
  case 'edge':{
   const recent=add('REG',['D',high()]),before=add('REG',[recent,high()]);
   return finish(add('AND',[recent,add('NOT',[before])]));
  }
  case 'register8':return Circuit.clone(Game.references.find(spec=>spec.name.startsWith('REG8')).circuit);
  case 'pc-build':case 'sum8':{
   const state=add('REG8',[],'当前值'),increment=level.id==='pc-build'?add('CONST',[],'步长 1',1):'D';
   connect(add('ADD8',[state,increment]),state);connect('EN',state,1);
   return finish(state);
  }
  case 'tiny-ram':{
   const select0=add('AND',['WE',add('NOT',['ADR'])]),select1=add('AND',['WE','ADR']);
   const word0=add('REG8',['DATA',select0],'地址 0'),word1=add('REG8',['DATA',select1],'地址 1');
   return finish(add('MUX8',[word0,word1,'ADR'],'读地址选择'));
  }
  case 'memory':return finish(add('RAM8',['ADR','DATA','WE']));
  default:throw Error('缺少时序示范：'+level.id);
 }
}
const programs={
 'cm8-pixels':level=>level.program.replace('LDI 0','LDI 82'),
 'cm8-loop':'LD 0\nJZ done\nloop: ST 255\nSUB 1\nJZ done\nJMP loop\ndone: HLT',
 'cm8-branch':'LD 0\nJZ empty\nLDI 89\nJMP emit\nempty: LDI 78\nemit: ST 255\nHLT',
 'o8-binary':'DB 0b00101010\nDB 0b10110000\nNOP',
 'o8-echo':'MOV OUT, IN\nNOP',
 'o8-double':'MOV R1, IN\nMOV R2, IN\nADD\nMOV OUT, R3\nNOP',
 'o8-branch':'MOV R3, IN\nIMM negative\nJL\nIMM 0\nMOV OUT, R0\nIMM end\nJMP\nnegative: IMM 1\nMOV OUT, R0\nIMM end\nend: JMP',
 'o8-repeat':'MOV R1, IN\nIMM 1\nMOV R2, R0\nIMM loop\nloop: MOV OUT,R1\nSUB\nMOV R1,R3\nJNZ\nNOP',
 's32-cmp':'IN R1\nCMP R1, 0\nOUT FLAGS\nend: JMP end',
 's32-memory':'IN R1\nMOV R2, 513\nSTORE_32 [R2], R1\nADD R2, R2, 1\nLOAD_8 R3, [R2]\nOUT R3\nADD R2, R2, 1\nLOAD_8 R3, [R2]\nOUT R3\nend: JMP end',
 's32-stack':'IN R1\nMOV SP, 4096\nPUSH R1\nADD R2, R1, 1\nPUSH R2\nPOP R3\nOUT R3\nPOP R3\nOUT R3\nend: JMP end',
 's32-function':'IN R1\nMOV SP, 4096\nCALL body\nCALL body\nOUT R1\nend: JMP end\nbody: LSL R2, R1, 1\nADD R1, R2, R1\nADD R1, R1, 1\nRET',
 rng:'IN R1\nMOV R3, 4\nagain: LSL R2, R1, 2\nADD R1, R2, R1\nADD R1, R1, 1\nAND R1, R1, 255\nOUT R1\nSUB R3, R3, 1\nCMP R3, 0\nJNE again\nend: JMP end',
 capitalize:'IN R1\nCMP R1, 97\nJB emit\nCMP R1, 122\nJA emit\nSUB R1, R1, 32\nemit: OUT R1\nend: JMP end',
 popcount:'IN R1\nAND R1, R1, 255\nMOV R2, 0\nloop: CMP R1, 0\nJE emit\nAND R3, R1, 1\nADD R2, R2, R3\nLSR R1, R1, 1\nJMP loop\nemit: OUT R2\nend: JMP end',
 leading:'IN R1\nAND R1, R1, 255\nMOV R2, 128\nMOV R3, 0\nloop: CMP R2, 0\nJE emit\nAND R4, R1, R2\nCMP R4, 0\nJNE emit\nADD R3, R3, 1\nLSR R2, R2, 1\nJMP loop\nemit: OUT R3\nend: JMP end',
 multiply:'IN R1\nLSR R2, R1, 8\nAND R1, R1, 255\nAND R2, R2, 255\nMOV R3, 0\nloop: CMP R2, 0\nJE emit\nAND R4, R2, 1\nCMP R4, 0\nJE shift\nADD R3, R3, R1\nshift: LSR R2, R2, 1\nLSL R1, R1, 1\nJMP loop\nemit: OUT R3\nend: JMP end',
 divide:'IN R1\nLSR R2, R1, 8\nAND R1, R1, 255\nAND R2, R2, 255\nMOV R3, 0\nMOV R4, 7\nloop: LSL R5, R2, R4\nCMP R1, R5\nJB next\nSUB R1, R1, R5\nMOV R6, 1\nLSL R6, R6, R4\nOR R3, R3, R6\nnext: CMP R4, 0\nJE emit\nSUB R4, R4, 1\nJMP loop\nemit: OUT R3\nOUT R1\nend: JMP end',
 sort:'IN R1\nLSR R2, R1, 8\nLSR R3, R1, 16\nAND R1, R1, 255\nAND R2, R2, 255\nAND R3, R3, 255\nCMP R1, R2\nJBE pair2\nMOV R4, R1\nMOV R1, R2\nMOV R2, R4\npair2: CMP R2, R3\nJBE pair3\nMOV R4, R2\nMOV R2, R3\nMOV R3, R4\npair3: CMP R1, R2\nJBE emit\nMOV R4, R1\nMOV R1, R2\nMOV R2, R4\nemit: OUT R1\nOUT R2\nOUT R3\nend: JMP end',
 triangle:'IN R1\nMOV R2, 0\nloop: CMP R1, 0\nJE emit\nADD R2, R2, R1\nSUB R1, R1, 1\nJMP loop\nemit: OUT R2\nend: JMP end',
 'robot-maze':()=>byId('workshop-robot').program,
 'binary-search':'MOV R1, 0\nMOV R2, 255\nloop: ADD R3, R1, R2\nLSR R3, R3, 1\nOUT R3\nIN R4\nCMP R4, 0\nJNE high\nADD R1, R3, 1\nJMP loop\nhigh: SUB R2, R3, 1\nJMP loop',
 nim:'loop: IN R1\nSUB R2, R1, 1\nAND R2, R2, 3\nCMP R2, 0\nJNE move\nMOV R2, 1\nmove: OUT R2\nJMP loop',
 tower:[
  'IN R1','MOV SP, 4096','MOV R2, 0','MOV R3, 2','MOV R4, 1','CALL move','end: JMP end',
  'move: CMP R1, 1','JE emit',
  'PUSH R1','PUSH R2','PUSH R3','PUSH R4','SUB R1, R1, 1','MOV R5, R3','MOV R3, R4','MOV R4, R5','CALL move',
  'POP R4','POP R3','POP R2','POP R1','LSL R5, R2, 4','ADD R5, R5, R3','OUT R5',
  'SUB R1, R1, 1','MOV R5, R2','MOV R2, R4','MOV R4, R5','CALL move','RET',
  'emit: LSL R5, R2, 4','ADD R5, R5, R3','OUT R5','RET'
 ].join('\n')
};

function radixExample(hex){
 const sample={inputs:['A'],outputs:Array.from({length:8},(_,i)=>'B'+i),build(){
  return {nodes:[node('A','IN8',0,0,hex?'输入字节 · 十六进制':'输入字节 · 二进制',42),...this.outputs.map((id,i)=>node(id,'OUT',0,0,(hex?(i<4?'低组 ':'高组 '):'位 ')+i))],wires:[]};
 }};
 const b=builder(sample),split=b.add('SPLIT8',['A'],'按位展开');
 return b.finish(...sample.outputs.map((_,i)=>[split,i]));
}
function example(level){
 if(level.id==='gate-race')return booleanExample(byId('nand'));
 if(level.drill)return radixExample(level.id==='hex-race');
 if(level.workshopBuildOf)return byId(level.workshopBuildOf).build();
 if(level.id==='sandbox')return byId('counter').build();
 if(level.id==='cpu-build')return byId('gate-cpu').build();
 if(level.id.startsWith('wire-'))return Game[level.machine].machine(level.program);
 const program=programs[level.id];
 if(program){
  const source=typeof program==='function'?program(level):program;
  if(level.machine)return Game[level.machine].machine(source);
  const board=level.build();
  board.nodes.find(n=>n.id==='rom').program=Circuit.assemble(source).words;board.source=source;
  return board;
 }
 if(level.expect){
  const board=level.build();
  const portsAreBits=board.nodes.filter(n=>level.inputs.includes(n.id)||level.outputs.includes(n.id))
   .every(n=>(definition(n).outputs[0]??definition(n).inputs[0]).width===1);
  return portsAreBits?booleanExample(level):wordExample(level);
 }
 if(level.inputs&&level.outputs)return clockExample(level);
 return level.build();
}

const hints={
 tower:['先手动推演两只盘，记下每次从哪根柱移到哪根柱。','将 N 只盘从起点移到终点，先借助终点把 N−1 只盘移到中转柱。','移动最大的盘后，再把中转柱上的 N−1 只盘移到终点。N=1 时直接输出动作。','调用前保存各柱编号与盘数，返回后恢复。输出编码是起点左移四位再加终点，用 2、3、4 只盘验证最少步数。'],
 not8:['先试只有最低位为 1 的输入，看看其他七个位应该变成什么。','按位拆开，八个位各自通过反相，再按原顺序合回。'],
 and8:['先用 0x0F 和 0x33 手算哪些位同时为 1。','两路分别拆成位。只在相同下标之间做 AND，再重新合线。'],
 'or8-build':['先比较 A=0 与 A=255 时，哪些结果一定受 B 影响。','把两路的同一位做 OR，检查每一位都回到原来的位置。'],
 'xor-byte':['输出是差异掩码。先比较两个相同的字节，预测整个 Q。','逐位比较、逐位拼回。用只有一个不同位的输入定位位序问题。'],
 mux8:['先固定 S=0，应该完整读到 A 的八个位。','八个一位选择器共享 S，给每个选择器两路相同下标的输入。','用 A=0xAA、B=0x55 对照两种选择，能发现错位与支路接反。'],
 subtract8:['想想如何把减 B 改写成加一个数。比较 0−1 和 9−4。','先逐位反相 B 再加 1，得到补码形式。','将 A 与负 B 相加，只取低八位。用 A=B 验证归零。'],
 'pc-build':['使能关闭时先单步两次，PC 应保持不变。','把寄存器旧值送进加法器，再让结果在下一拍写回。','加法器第二端接常数 1，写使能由 EN 控制，检查 255 加 1 后回绕。'],
 memory:['先只用地址 0，写入后关闭 WE，确认数据仍能读出。','地址同时决定读出哪个格和写到哪个格。把 DATA 与 WE 分开检查。','不要把 WE 当作读使能。用两个不同地址分别写入，再关闭 WE 交替读取。'],
 'alu-cpu':['先只实现操作码 0 和 1，分别验证 B 直通和加法。','为每个运算保留单独的结果，再用操作码选择。','比较操作码时检查整字节，保留默认零支路。用 0xFF 验证未定义操作。'],
 'control-build':['先把 IR 的高字节和低字节分开。哪一半应直接送到 IMM？','译码器按指令决定写回、访存和运算。一次只验证一类指令。','对条件跳转，再把指令匹配与 ACC=0 合并。停机时检查 RUN。'],
 'cm8-loop':['先用输入 0 看程序应直接停止，终端应为空。','把一次循环拆成输出一个数字、减一、判断是否结束。','读 RAM[0] 后立即判断是否为零。输出用 ST 255，减一后再次判断。'],
 'cm8-branch':['把输入分成“等于 0”与“不为 0”，先预测终端各自应该只有一个什么值。','读 RAM[0] 后利用 JZ 选择路径。让两个分支共用最后一次输出。','两条路径分别装入 78 和 89，汇合后执行 ST 255，再停机。'],
 'wire-s32-io':['先顺着 OUT 数据脚往回找。输出数据要能完整容纳 257。','数据和“何时发送”是两条信号，不能用同一根线替代。','操作数选择器接到输出，译码器的 OUT 有效位接到 strobe，观察 257 是否只发送一次。'],
 s32:['先看 CALL 前 PC 和 SP 分别在哪个位置，记住栈顶。','逐条执行 CALL 展开的机器指令，找出哪一条把返回地址存进栈。','单步观察 RET 取回地址、恢复 SP 并回到主程序的过程。'],
 nand:['先在心里算一下 A、B 同为 1 时 Q 应该是什么。只要有一路为 0，结果会变吗？','这个关卡只需要一个双输入元件。把两路信号分别送到它的两个输入，再观察 Q。'],
 not:['每种输入都写一下目标输出：0 应变成 1，1 应变成 0。','试着让一个 NAND 的两个输入收到同一个 A。检查 A 为 0 和 1 时的结果。'],
 and:['先算 NAND：两个条件成立时，它恰好输出 0。最后还缺哪一步？','把前一个 NAND 的输出分成两路，接到另一个 NAND 的两个输入，观察是否完成反相。'],
 or:['先找出唯一应输出 0 的情况：两路输入分别是什么？','把两路都取反后，再送入 NAND。用 00 和 01 验证。'],
 xor:['先列出两个应输出 1 的组合，两路输入必须有什么关系？','分别表示 A 有、B 无和 B 有、A 无，再把两个条件合并。','只用 NAND 时，可先算出 NAND(A,B)，再把这个中间值分别和 A、B 做 NAND，最后合并两路。'],
 mux:['先固定选择位 S=0，只检查 Q 会不会跟着 A 变化。','分成两条支路：一条只在 S=0 放行，另一条只在 S=1 放行。','给 A 的支路用取反后的 S，给 B 的支路用 S，再用 OR 合并。'],
 half:['列出 0+0、0+1、1+0、1+1。把结果拆成低位 S 和进位 C。','两路不同时 S=1，两路都为 1 时 C=1。找出对应的两个门。'],
 full:['先看失败的是和 S 还是进位 C。用 1+1+0 和 1+0+1 分开观察。','把三位相加拆成两次半加：先加 A 与 B，再把低位和 Cin 相加。','两次半加任意一次产生进位，C 就为 1。把两路进位用 OR 合并。'],
 decode2:['只让一个输出灯亮。先从地址 00 和 01 着手。','A 是低位。每个输出都是两根地址线各取原值或反值之后相与。'],
 decode3:['先忽略 DIS，检查 000 到 111 是否各选中一个输出。','可以把最高位当成两组四路输出的组选择。','使 DIS=1 时两组都禁止，再测试地址 000 和 111。'],
 adder8:['先把两路八位数据按位拆开，从最低位的一组 A、B 开始验证。','全加器的 S 接结果总线的当前位，C 留给下一位。','最低位 Cin 接 0。用 0x7F 加 1 检验连续进位，用 0xFF 加 1 检验回绕。'],
 'signed-overflow':['比较 255+1 和 127+1，先猜哪一组有第九位，哪一组超出有符号范围。','Q 来自八位加法器。最高位的两个输入与输出能区分进位和补码溢出。','若 A、B 符号相同而 Q 的符号不同，V=1。C 可由最高位的 A·B 或 (A XOR B)·非Q 得到。'],
 'sr-latch':['分别试一次置位和清零。然后把 S、R 都置 0，看下一拍应该发生什么。','把上一次的 Q 作为反馈，和 S 一起决定新值。','在存入状态之前，用 R 把结果强制清零。这一关采用同步、清零优先的模型。'],
 'dff-build':['先改变 D，不推进时钟。想想 Q 何时应该跟上 D。','每个时钟沿只需要复制这次采样的 D，上一拍的 Q 还要保留到时钟推进。','可借助同步 SR：高电平 D 置位，低电平 D 清零，两条控制线互为反相。'],
 register:['试着先写入 1，再关掉 EN，把 D 改成 0。Q 应该保留什么？','要输入到采样元件的是 D 或旧 Q，谁来控制选择？','以 EN 为选择位。EN=0 走反馈，EN=1 走外部 D。'],
 'reset-register':['同时打开 RST 和 EN。先判断哪条指令优先，再单步。','拆开算“要不要写”和“写什么”。复位时也要允许写入。','使能取 EN OR RST，数据取 D AND NOT RST。这样 RST=1 会在下一拍写入 0。'],
 register8:['先验证一个位能写入并保持，再考虑八个位如何共享写使能。','拆线器把 D 拆成八个位，每个寄存器与其他位共享 EN。','把每个 Q 接回合线器的对应位，用 0x2A 写入后关掉 EN 检查。'],
 'tiny-ram':['先作两个独立的存储格。把地址 0 和地址 1 的内容想成两个变量。','写入和读取分开接线。写入只让一个寄存器更新，读取随地址在两份 Q 之间切换。','两路写使能分别为 WE AND NOT ADR、WE AND ADR。两个寄存器共享 DATA，读端用 ADR 控制八位选择器。'],
 'tiny-rom':['先制作两个常数，只用最低地址位在它们中间选择。','四个地址分成两对。A 决定每对中的哪个字节，B 决定选哪一对。','两组分别选 0x12/0xA5 和 0x3C/0xE7，再用第三个八位选择器合并输出。'],
 'shared-bus':['先只打开一端，观察 BUS 的“驱动”输出，再把两端都关闭。','每个设备先接一只 TRI8。总线的另外两个输出分别告诉你是否有人驱动、是否冲突。','对比两端同时打开且数据相同，以及两端同时打开但数据不同。'],
 'bus-handoff':['一端驱动 0 和两端都断开的结果有何不同？先看 Q，再对照 ACTIVE。','用 TRI8 把每一路的输出和使能绑定，然后把两个三态输出送进 BUS8。','BUS8 的 Q、驱动、冲突分别接到 Q、ACTIVE、FAULT。交接时可先关闭旧驱动端，再打开新驱动端。'],
 'cpu-build':['先让 PC 和 ROM 接通。单步时，PC 应该递增，ROM 指令应随它变化。','再接译码、ALU、写回。观察 ACC 是何时更新的，以及写入 RAM 的条件。','如果指令正确但终端全空，追踪写使能、写地址和 ACC 数据，检查是否有值到达 RAM[255]。','核对跳转选择和 PC 写入。测试用例需要前 16 拍依次写出 A 到 E。'],
 'cm8-pixels':['先观察目标图形和当前显存。程序已经有五条 ST，当前为什么还是一片黑？','LDI 负责装入颜色字节，ST 把同一个值写到不同地址。试试只改 LDI。','用非零 RGB332 字节，例如 82。汇编并加载，再逐拍观察五条 ST。'],
 's32-stack':['先压入一个值和它加一后的值。先从栈上取出的应该是哪一个？','设定 SP，再按写入顺序 PUSH，随后执行两次 POP。','把每次 POP 的结果立即送 OUT，分别验证输入 7 与输入 0xffffffff。'],
 's32-function':['先写出单次 f(x) 的结果，画出入参和返回值分别用哪个寄存器。','函数里把 x 加倍再加 x，最后加 1。主程序仍要保存合法的栈顶。','让主程序 CALL 两次，中间沿用同一个参数寄存器。只在第二次 RET 回来后输出。'],
 sandbox:['先选一个可验证的小目标，例如“每拍加一，暂停时保持”。','把它拆成状态、计算和使能三部分，再准备几个输入组合检查。','若选择计数器，观察加法结果如何在下一拍写回寄存器。']
};
function hintSteps(level){
 if(hints[level.id])return hints[level.id];
 if(level.workshopBuildOf)return ['先尝试原作品，找出可以独立测试的第一段输入与输出。','根据「技术说明与搭建」里的端口表先测通最小模块，再连接其余模块。','核对程序与外设约定的位宽和时钟，再用示范观察第一笔输入是怎样产生输出的。'];
 if(level.drill){
  const radix=level.id==='binary-race'?'二进制':level.id==='hex-race'?'十六进制':null;
  return radix?['先写出 '+radix+'各位的权值，高位到低位拆分。','从最高位开始，每次扣除当前位贡献的值，最后用位权加总检查。']:
   ['先说出题目里的逻辑门何时输出 1。','用真值表找出 A、B 当前组合所在的行，倒计时练习可以等掌握规则后再做。'];
 }
 if(level.id.startsWith('wire-'))return ['先只检查这次要求接通的那一段。找出没有入线的引脚，再看相邻模块的引脚名。',level.text,'按照数据位宽选信号，常用单独的一位控制线表示使能。用第一条指令逐拍核对数据和使能。'];
 if(level.clocked||level.sequence||level.pixelStatus)return ['先列出输入、当前状态和时钟沿之后应该得到的结果。','把更新分成新值的计算和写使能。先保持一次，再写入一次观察差异。',level.text];
 if(level.expect)return ['先挑两组最容易区分的输入，算出各自应有的输出。','检查输入、输出的位宽，分开验证每个中间结果。',level.text];
 if(level.machine||Game.isComputer(level))return ['先找清楚输入放在哪里、怎样算作输出，再单步观察第一条指令。',level.text,'把程序分成读输入、处理、输出三个部分。先验证最小输入，再检查跳转、停止条件及边界值。'];
 return ['先改变一个输入，或推进一拍，看哪一个输出最先变。',level.text];
}

Game.lessonGuide={example,hints:hintSteps};
})();
