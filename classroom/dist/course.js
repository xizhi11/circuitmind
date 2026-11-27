(function(){
'use strict';
const {node,wire}=Game;
const gates=['NAND','NOT','AND','OR','XOR','MUX','BIT'];
const bytes=[...gates,'SPLIT8','JOIN8','ADD8','SUB8','SHR8','NOT8','AND8','XOR8','MUX8','EQ8','LT8','CONST'];
const chapters=['01 逻辑门','02 数据通路','03 总线与算术','04 记忆与时钟'];
function logic(id,title,chapter,inputWidths,outputWidths,text,allowed,fn,samples){
 const inputs=Object.keys(inputWidths),outputs=Object.keys(outputWidths);
 const build=()=>({nodes:[
  ...inputs.map((id,i)=>node(id,inputWidths[id]===1?'IN':'IN'+inputWidths[id],75,80+110*i,id)),
  ...outputs.map((id,i)=>node(id,outputWidths[id]===1?'OUT':'OUT'+outputWidths[id],1030,90+110*i,id))
 ],wires:[]});
 const level={id,title,chapter:chapters[chapter],tag:'搭建与验证',inputs,outputs,allowed,text,build,expect:fn};
 if(samples)level.vectors=samples.map(row=>({input:Object.fromEntries(inputs.map((id,i)=>[id,row[i]])),expected:fn(row)}));
 return level;
}
const values=[0,1,2,3,4,15,16,31,63,64,85,127,128,129,170,192,254,255];
const one=values.map(x=>[x]),pairs=values.flatMap(x=>[0,x,(x+1)&255,127,128,255].map(y=>[x,y]));
const signed=x=>x>=128?x-256:x;
const lab=[
 logic('two-of-four','至少两路有效',0,{A:1,B:1,C:1,D:1},{Q:1},'四路输入中至少两路有效时输出 1。',gates,([a,b,c,d])=>[Number(a+b+c+d>=2)]),
 logic('count4','统计导线上的 1',1,{A:1,B:1,C:1,D:1},{B0:1,B1:1,B2:1},'用三位二进制表示四路输入中 1 的个数。B0 为最低位。',gates,inputs=>{const total=inputs.reduce((sum,b)=>sum+b,0);return [total&1,(total>>1)&1,total>>2];}),
 logic('decode3','带禁止端的八路译码',1,{A:1,B:1,C:1,DIS:1},Object.fromEntries(Array.from({length:8},(_,i)=>['Y'+i,1])),'C:B:A 选择输出编号。DIS 为 1 时，八路输出全部关闭。',gates,([a,b,c,dis])=>Array.from({length:8},(_,i)=>Number(!dis&&i===(a+2*b+4*c)))),
 logic('constant','制造恒真信号',0,{A:1},{Q:1},'无论开关 A 处于哪一档，输出都要为 1。',['NAND'],()=>[1]),
 logic('or3','三路报警',0,{A:1,B:1,C:1},{Q:1},'三路输入中任意一路有效就报警。',['OR','NAND'],([a,b,c])=>[a|b|c]),
 logic('and3','三把钥匙',0,{A:1,B:1,C:1},{Q:1},'只有三路输入同时有效才开锁。',['AND','NAND'],([a,b,c])=>[a&b&c]),
 logic('odd','奇校验',0,{A:1,B:1,C:1},{Q:1},'输入中有奇数个 1 时，校验位为 1。',gates,([a,b,c])=>[a^b^c]),
 logic('majority','多数表决',0,{A:1,B:1,C:1},{Q:1},'三票中至少两票为 1 时通过。',gates,([a,b,c])=>[Number(a+b+c>=2)]),
 logic('decode2','二位地址译码',1,{A:1,B:1},{Y0:1,Y1:1,Y2:1,Y3:1},'A 是低位，B 是高位。地址从 0 到 3，每次只选中一个输出。',gates,([a,b])=>[0,1,2,3].map(i=>Number(i===2*b+a))),
 logic('onehot','独热输入检测',1,{A:1,B:1,C:1},{Q:1},'正好一路为 1 时输出 1，多路同时有效应输出 0。',gates,([a,b,c])=>[Number(a+b+c===1)]),
 logic('mux4','四路选择器',1,{A:1,B:1,C:1,D:1,S0:1,S1:1},{Q:1},'用三级选择逻辑，将 S1:S0 指定的一路送到输出。',gates,([a,b,c,d,x,y])=>[[a,b,c,d][2*y+x]]),
 logic('nand8','按位与非',2,{A:8,B:8},{Q:8},'每一位分别执行 NAND。',bytes,([a,b])=>[~(a&b)&255],pairs),
 logic('xor-byte','不同位掩码',2,{A:8,B:8},{Q:8},'输出的 1 标记 A、B 不同的位。',bytes.filter(x=>x!=='XOR8'),([a,b])=>[a^b],pairs),
 logic('negate','补码取负',2,{A:8},{Q:8},'在八位空间内输出 -A，注意 128 的边界。',bytes,([a])=>[(-a)&255],one),
 logic('mod4','提取除以四的余数',2,{A:8},{Q:8},'将无符号字节除以 4 的余数送到 Q。',bytes,([a])=>[a%4],one),
 logic('lsr','零扩展右移',2,{A:8},{Q:8},'右移一位，高位补 0。',bytes.filter(x=>x!=='SHR8'),([a])=>[a>>>1],one),
 logic('asr','符号扩展右移',2,{A:8},{Q:8},'将八位补码数右移一位，用原符号位补入最高位。',bytes,([a])=>[(signed(a)>>1)&255],one),
 logic('unsigned','无符号大小比较',2,{A:8,B:8},{Q:1},'按 0 至 255 的数值顺序判断 A 是否小于 B。',bytes.filter(x=>x!=='LT8'),([a,b])=>[Number(a<b)],pairs),
 logic('signed','有符号大小比较',2,{A:8,B:8},{Q:1},'将 A 与 B 解释为八位补码，再判断 A 是否小于 B。',bytes,([a,b])=>[Number(signed(a)<signed(b))],pairs),
 logic('carry8','检测八位进位',2,{A:8,B:8},{Q:8,C:1},'输出八位和，并用单独引脚给出第九位。',bytes,([a,b])=>[(a+b)&255,(a+b)>>>8],pairs),
 logic('parity8','总线奇偶校验',2,{A:8},{Q:1},'八位数据中有奇数个 1 时输出 1。',bytes,([a])=>[a.toString(2).split('1').length%2===0?1:0],one)
];
function sequence(id,title,inputs,outputs,text,allowed,rows){
 const l=logic(id,title,3,inputs,outputs,text,allowed,null);
 l.clocked=true;l.vectors=rows.map(([values,expected])=>({input:Object.fromEntries(l.inputs.map((key,i)=>[key,values[i]])),expected}));
 return l;
}
lab.push(
 logic('shared-bus','两路设备共用总线',3,{A:8,B:8,EA:1,EB:1},{ACTIVE:1,FAULT:1},'两只 TRI8 分别由 EA、EB 控制，将输出接到 BUS8。检查空闲、单驱动、同值双驱动和不同值争用。',['TRI8','BUS8'],([a,b,ea,eb])=>[Number(!!(ea||eb)),Number(!!(ea&&eb&&a!==b))],[[0,0,0,0],[42,3,1,0],[15,1,0,1],[85,85,1,1],[85,170,1,1],[1,0,1,1]]),
 sequence('delay2','延迟两拍',{D:1},{Q:1},'两级寄存器在同一时钟沿采样。第一拍输出初值 0，第二拍输出第一拍的 D。',['REG','BIT'],[[[1],[0]],[[0],[1]],[[0],[0]],[[1],[0]],[[1],[1]],[[0],[1]]]),
 sequence('toggle','每拍翻转',{EN:1},{Q:1},'使能时让寄存器翻转，暂停时保留原位。',['NOT','REG'],[[[1],[1]],[[1],[0]],[[0],[0]],[[1],[1]],[[0],[1]]]),
 sequence('edge','捕捉上升沿',{D:1},{Q:1},'只在刚采入的 D 由 0 变 1 的那一拍输出 1。可用两级状态进行比较。',['REG','AND','NOT','BIT'],[[[0],[0]],[[1],[1]],[[1],[0]],[[0],[0]],[[1],[1]]]),
 sequence('sum8','逐拍累计',{D:8,EN:1},{Q:8},'EN 为 1 时把 D 加到累计值，八位溢出回绕。',['REG8','ADD8'],[[[12,1],[12]],[[90,0],[12]],[[250,1],[6]],[[0,1],[6]],[[35,1],[41]]])
);
const arithmeticCases=[[0,0],[255,1],[127,1],[128,128],[200,55],[73,94],[255,255],[85,170]];
const overflow=([a,b])=>{const total=a+b,q=total&255;return [q,total>>>8,Number(((a^q)&(b^q)&128)!==0)];};
const romWords=[0x12,0xA5,0x3C,0xE7];
const teachingLabs=[
 logic('signed-overflow','进位和有符号溢出',2,{A:8,B:8},{Q:8,C:1,V:1},'输出八位和 Q。C 表示无符号进位，V 表示补码有符号溢出。比较 255+1 和 127+1。',['ADD8','SPLIT8','NOT','AND','OR','XOR','BIT'],overflow,arithmeticCases),
 sequence('reset-register','写入、保持与复位',{D:1,EN:1,RST:1},{Q:1},'在时钟沿按优先级更新。RST=1 清零；否则 EN=1 写入 D；其余保持。',['REG','NOT','AND','OR','BIT'],[[[1,1,0],[1]],[[0,0,0],[1]],[[1,1,1],[0]],[[1,0,0],[0]],[[1,1,0],[1]],[[1,0,1],[0]]]),
 sequence('tiny-ram','用两个寄存器搭 RAM',{ADR:1,DATA:8,WE:1},{Q:8},'搭一块 2×8 位 RAM。每拍只向选中的地址写入，读取随 ADR 改变。关闭 WE 后交替读两个地址。',['REG8','MUX8','NOT','AND'],[[[0,42,1],[42]],[[1,99,1],[99]],[[0,0,0],[42]],[[1,0,0],[99]],[[1,165,1],[165]],[[0,0,0],[42]],[[1,0,0],[165]]]),
 logic('tiny-rom','用地址选出 ROM 字节',3,{A:1,B:1},{Q:8},'A 为地址低位，B 为高位。四个地址分别读取 0x12、0xA5、0x3C、0xE7。用常数和选择器实现这个只读表。',['CONST','MUX8'],([a,b])=>[romWords[a+2*b]]),
 logic('bus-handoff','总线交接与冲突',3,{A:8,B:8,EA:1,EB:1},{Q:8,ACTIVE:1,FAULT:1},'两路设备共用一条数据总线。两端断开时 Q 为 Z，两个不同值同时驱动时 Q 为 X。区分浮空、低电平和冲突。',['TRI8','BUS8'],([a,b,ea,eb])=>{const fault=ea&&eb&&a!==b;return [fault?'X':ea?a:eb?b:null,Number(!!(ea||eb)),Number(!!fault)];},[[42,99,0,0],[0,99,1,0],[42,99,1,0],[42,99,0,1],[42,42,1,1],[42,99,1,1],[42,99,0,1]])
];
const tinyRam=teachingLabs.find(lesson=>lesson.id==='tiny-ram');
tinyRam.checkBeforeClock=true;
const readBefore=[0,0,42,99,99,42,165];
tinyRam.vectors.forEach((row,i)=>{row.before=[readBefore[i]];});
lab.push(...teachingLabs);
// These checkpoints keep the rest of the processor connected. Only the
// named subsystem is unfinished, and grading runs the repaired machine.
function construction(id,title,machine,source,targets,text,expected){
 const build=()=>{const d=Game[machine].machine(source);d.wires=d.wires.filter(w=>!targets.some(([to,pin])=>w.to===to&&w.pin===pin));return d;};
 return {id,title,machine,chapter:machine==='overture'?'07 字节寄存器机':'08 三十二位计算机',tag:'处理器接线实验',text,program:source,build,
  verify:net=>{
   let state=net.initial();const actual=[];
   for(let i=0;i<70;i++){
    const v=net.evaluate(state);
    if(v.inputs('strobe')[0])actual.push(v.inputs('output')[0]);
    state=net.tick(state).state;
   }
   return [{input:{周期:70},expected,actual,replay:{steps:70},pass:actual.join(',')===expected.join(',')}];
  }};
}
const sample=Game.levels.find(l=>l.id==='overture').program;
lab.push(
 construction('wire-registers','接通寄存器写回','overture',sample,[['r1',0],['r1',1],['r2',0],['r2',1]],'补齐 R1 和 R2 的数据、使能引脚。参考程序会输出 65。',[65]),
 construction('wire-immediate','接通六位立即数','overture',sample,[['data',1],['data',2]],'连接立即数和写回选择信号，使两次装入的常数到达 R0。',[65]),
 construction('wire-pc','接通取指与分支','overture',sample,[['pc',0],['rom',0],['address',1],['address',2]],'接好 PC、程序 ROM 与跳转选择器，检查末尾的循环。',[65]),
 construction('wire-s32-immediate','从指令取十六位常数','symphony','MOV R1,4660\nOUT R1\nend:JMP end',[['operand',1],['operand',2]],'将译码器的立即数和值选择位接到操作数选择器。输出十进制 4660。',[4660]),
 construction('wire-s32-io','连接字输入输出','symphony','MOV R1,257\nOUT R1\nend:JMP end',[['output',0],['strobe',0]],'把指令的操作数接到 OUT，单独连接输出有效位。程序只发送一次 257。',[257]),
 construction('wire-s32-disk','两块独立的存储器','symphony','MOV R2,1234\nPSTORE [64],R2\nSTORE_8 [64],ZR\nPLOAD R3,[64]\nOUT R3\nend:JMP end',[['storage',0],['storage',1],['storage',2],['alu',4]],'同一地址在两块存储区有独立内容。连接第二存储区，写入 1234，再清零主 RAM 的同地址，然后读回。',[1234]),
 construction('wire-s32-ram','接通读写内存','symphony','MOV R1, 513\nMOV R2, 4660\nSTORE_16 [R1], R2\nLOAD_8 R3, [514]\nOUT R3\nend: JMP end',[['ram',0],['ram',1],['ram',2],['ram',3]],'接好 RAM 的地址、数据、写使能与数据宽度，从非对齐的半字中读回高字节。',[18]),
 construction('wire-s32-stack','让栈上的地址返回 PC','symphony',Game.levels.find(l=>l.id==='s32').program,[['pc',0],['alu',3],['r14',0]],'补齐下一 PC、RAM 读出与 SP 写回，观察 CALL 与 RET 的数据通路。',[40])
);
const template=Game.levels.find(l=>l.id==='s32-stack');
function program(id,title,text,examples){
 const starter='IN R1\n; 实现后，从 OUT 输出结果\nend: JMP end';
 const build=()=>Game.symphony.machine(starter);
 const goal={...template,id,title,text,chapter:'09 程序作品',build,program:starter};
 goal.verify=net=>examples.map(([input,expected])=>{
  let state=net.initial(),steps=0;const actual=[];
  while(steps<500){
   steps++;
   const r=net.evaluate(state,{input});if(r.inputs('strobe')[0])actual.push(r.inputs('output')[0]);
   const next=net.tick(state,{input}).state;
   if(next.pc===state.pc&&!r.inputs('strobe')[0])break;
   state=next;
  }
  return {input:{IN:input},actual,expected,replay:{inputs:{input},steps},pass:actual.join(',')===expected.join(',')};
 });
 return goal;
}
lab.push(
 program('rng','可重现的伪随机序列','从 IN 读出字节种子，每次更新 x=(5x+1) mod 256，连续输出接下来的四项。',[[0,[1,6,31,156]],[1,[6,31,156,13]],[255,[252,237,162,43]]]),
 program('capitalize','字符流转大写','输入 ASCII 字符。只将 a 至 z 转为大写，其他字符原样输出。',[[65,[65]],[97,[65]],[122,[90]],[123,[123]],[57,[57]]]),
 program('popcount','数出亮灯个数','统计输入低八位中置位的数量。',[[0,[0]],[1,[1]],[170,[4]],[255,[8]],[256,[0]]]),
 program('leading','数出前导零','输出一个字节的前导零个数，输入为 0 时输出 8。',[[0,[8]],[1,[7]],[16,[3]],[127,[1]],[128,[0]]]),
 program('multiply','没有乘法器的乘法','输入低字节是被乘数，次低字节是乘数。通过移位与累加输出乘积。',[[0,[0]],[0x0709,[63]],[0x0f10,[240]],[0xffff,[65025]]]),
 program('divide','商与余数','输入低字节为被除数，次低字节为非零除数。依次输出整数商、余数。',[[0x0308,[2,2]],[0x0502,[0,2]],[0x0700,[0,0]],[0x1010,[1,0]]]),
 program('sort','将三个字节排序','按从低到高位取出输入的三个字节，从小到大输出。',[[0x030102,[1,2,3]],[0x070707,[7,7,7]],[0xff00fe,[0,254,255]]]),
 program('triangle','求一段整数的和','输入 n，输出 1 到 n 的和。用分支处理 n=0。',[[0,[0]],[1,[1]],[7,[28]],[16,[136]]])
);
Game.levels.push(...lab);
function speedRound(id,title,radix){
 const questions=()=>{
  const seen=new Set(),round=[];
  while(round.length<8){
   const value=Math.floor(Math.random()*256);
   if(seen.has(value))continue;seen.add(value);
   if(radix)round.push({prompt:'把 '+value+' 写成'+(radix===2?'二':'十六')+'进制',answer:value.toString(radix).toUpperCase(),radix});
   else{
    const gates=['NAND','AND','OR','XOR','XNOR','NOR'],gate=gates[value%6],a=(value>>3)&1,b=(value>>4)&1;
    round.push({prompt:gate+'('+a+', '+b+') = ?',answer:String(Circuit.types[gate].evaluate([a,b])[0]),radix:2});
   }
  }
  return round;
 };
 return {id,title,chapter:'01 逻辑门',tag:'限时练习',text:'开始后共有八道题。答错可重试，计时继续。全部答对后记录本机最佳用时。',
  drill:questions,build:()=>({nodes:[node('A','IN',80,80,'A'),node('Q','OUT',630,80,'Q')],wires:[wire('A','Q',0)]})};
}
Game.levels.push(speedRound('binary-race','二进制速答',2),speedRound('hex-race','十六进制速答',16),speedRound('gate-race','逻辑门速答',0));
const cpu=Game.levels.find(l=>l.id==='cpu');
const pixelAddresses=[147,154,155,156,163];
const pixelProgram='; 把 0 改成你选的颜色，例如 224（红）\nLDI 0\n'+pixelAddresses.map(address=>'ST '+address).join('\n')+'\nHLT';
const targetPixels=Object.fromEntries(pixelAddresses.map(address=>[address,82]));
function pixelStatus(memory=[]){
 const lit=pixelAddresses.map(address=>memory[address]||0).filter(Boolean);
 const extra=Array.from({length:64},(_,i)=>128+i).filter(address=>memory[address]&&!Object.hasOwn(targetPixels,address)).length;
 return [lit.length,extra,new Set(lit).size];
}
Game.levels.push({id:'cm8-pixels',title:'用自己的 CM8 点亮像素屏',chapter:'06 程序与应用',tag:'CM8 · 第一个像素程序',
 text:'用 CM8 向显存写入十字图案。五个目标像素需为同一种颜色，其余像素保持熄灭。',
 program:pixelProgram,pixelTarget:targetPixels,pixelStatus,build(){
  const board=cpu.build();board.nodes.find(n=>n.id==='rom').program=Circuit.assemble(pixelProgram).words;
  board.source=pixelProgram;return board;
 },verify(net){
  let state=net.initial(),steps=0;
  if(!Array.isArray(state.ram))throw Error('请保留 CM8 的 RAM，像素来自地址 128～191');
  while(steps<64){
   const tick=net.tick(state);state=tick.state;steps++;
   if(tick.values.ctrl?.[6]===0)break;
  }
  const expected=[5,0,1],actual=pixelStatus(state.ram);
  return [{input:{检查:'目标亮点 / 多余亮点 / 颜色种数'},expected,actual,replay:{steps},pass:actual.every((value,i)=>value===expected[i])}];
 }});
function cm8Program(id,title,text,examples){
 const program='; 将输出写入地址 255\nHLT';
 return {id,title,chapter:'06 程序与应用',tag:'CM8 · 汇编实验',text,program,build(){
  const doc=cpu.build();
  doc.nodes.find(n=>n.id==='rom').program=Circuit.assemble(program).words;
  return doc;
 },verify(net){
  return examples.map(([input,expected])=>{
   let state=net.initial();const actual=[];
   if(!Array.isArray(state.ram))throw Error('请保留地址为 0～255 的 RAM');
   state.ram[0]=input;
   let steps=0;
   while(steps<128){
    steps++;
    const step=net.tick(state);state=step.state;
    for(const write of step.writes)if(write.id==='ram'&&write.address===255)actual.push(write.value);
    if(step.values.ctrl?.[6]===0)break;
   }
   return {input:{'RAM[0]':input},expected,actual,replay:{ram0:input,steps},pass:actual.length===expected.length&&actual.every((v,i)=>v===expected[i])};
  });
 }};
}
const aluSamples=[0,1,2,3,4,5,6,7,255].flatMap(op=>[[0,0,op],[1,255,op],[170,85,op],[128,129,op],[255,8,op]]);
const controlSamples=Array.from({length:16},(_,i)=>i).concat(16,127,128,255).flatMap(op=>[[op*256+165,0],[op*256+42,255]]);
Game.levels.push(
 sequence('sr-latch','同步 SR 锁存器',{S:1,R:1},{Q:1},'每拍采样。R 为 1 时清零，S 为 1 且 R 为 0 时置位，两者为 0 时保持。',['DELAY',...gates],
  [[[0,0],[0]],[[1,0],[1]],[[0,0],[1]],[[1,1],[0]],[[0,0],[0]],[[1,0],[1]],[[0,1],[0]]]),
 sequence('dff-build','D 触发器',{D:1},{Q:1},'每拍将稳定的 D 存到 Q。时钟推进前，改变 D 不影响 Q。',['DELAY',...gates],
  [[[0],[0]],[[1],[1]],[[1],[1]],[[0],[0]],[[1],[1]],[[0],[0]]]),
 logic('or8-build','八位逻辑或',2,{A:8,B:8},{Q:8},'逐位判断 A、B 对应位是否至少一个为 1。',bytes,([a,b])=>[a|b],pairs),
 logic('alu-cpu','CM8 算术逻辑单元',3,{A:8,B:8,OP:8},{Q:8},'操作码 0～5 依次执行传送 B、加、减、与、或、异或。其余操作码输出 0。',bytes,Circuit.types.ALU8.evaluate,aluSamples),
 logic('control-build','CM8 指令译码',3,{IR:16,ACC:8},{IMM:8,OP:8,WRITE:1,BRANCH:1,STORE:1,LOAD:1,RUN:1},
  'IR 高字节为指令编号，低字节直出 IMM。2～6 对应 ALU 操作 1～5，其余为 0。1～7 写回，7 读 RAM，8 写 RAM，9 总是跳转，10 在 ACC 为 0 时跳转，15 停机。',
  [...bytes,'SPLIT16','EQ8','BIT'],Circuit.types.CONTROL.evaluate,controlSamples),
 cm8Program('cm8-loop','递减循环','从 RAM[0] 读取 n，向终端输出 n 到 1 的序列。n 为 0 时终端保持空白。',[[0,[]],[1,[1]],[4,[4,3,2,1]],[7,[7,6,5,4,3,2,1]]]),
 cm8Program('cm8-branch','按输入选择分支','读取 RAM[0]。若为 0，向终端写入 78，否则写入 89。结果只能写一次。',[[0,[78]],[1,[89]],[128,[89]],[255,[89]]])
);
for(const id of ['alu-cpu','control-build'])Game.levels.find(l=>l.id===id).chapter='05 计算机';
const isComputer=Game.isComputer;
Game.isComputer=l=>l.id.startsWith('cm8-')||isComputer(l);
const order=['nand','not','constant','and','or','nor','and3','or3','xor','xnor','odd','majority','two-of-four','mux','demux','decode2','decode3','onehot','mux4','half','full','count4','not8','and8','nand8','xor-byte','mux8','adder8','carry8','subtract8','negate','equal8','unsigned','signed','shift8','lsr','asr','mod4','parity8','register','delay2','toggle','edge','register8','counter','pc-build','sum8','memory','alu-build','cpu','cpu-build','gate-cpu','display','mines','overture','wire-registers','wire-immediate','wire-pc','o8-binary','o8-echo','o8-double','o8-branch','o8-repeat','s32','wire-s32-immediate','wire-s32-io','s32-cmp','wire-s32-ram','s32-memory','wire-s32-disk','s32-stack','wire-s32-stack','s32-function','capitalize','popcount','leading','triangle','multiply','divide','sort','rng','mines32','sandbox'];
order.splice(order.indexOf('register'),0,'sr-latch','dff-build');
order.splice(order.indexOf('xor-byte'),0,'or8-build');
order.splice(order.indexOf('cpu'),0,'alu-cpu','control-build');
order.splice(order.indexOf('memory'),0,'reset-register','tiny-ram','tiny-rom','bus-handoff');
order.splice(order.indexOf('subtract8'),0,'signed-overflow');
order.splice(order.indexOf('display'),0,'cm8-pixels','cm8-loop','cm8-branch');
order.splice(order.indexOf('memory'),0,'shared-bus');
order.splice(order.indexOf('mux'),0,'gate-race','binary-race','hex-race');
const rank=id=>{const i=order.indexOf(id);return i<0?order.length-1:i;};
Game.levels.sort((a,b)=>rank(a.id)-rank(b.id));
Game.isGraded=l=>!!(l.expect||l.sequence||l.vectors||l.verify||l.drill);
const byId=new Map(Game.levels.map(l=>[l.id,l]));
const guided=[
 ['nand','NAND','仅当 A、B 都为 1 时，Q 为 0。',['NAND']],
 ['not','NOT','Q 输出与 A 相反的位。',['NAND']],
 ['and','AND','仅当 A、B 都为 1 时，Q 为 1。',['NAND'],['not']],
 ['or','OR','A、B 至少有一个为 1 时，Q 为 1。',['NAND'],['not','and']],
 ['xor','XOR','A、B 不同时，Q 为 1。',['NAND'],['not','and','or']],
 ['mux','一位选择器','S 为 0 时选择 A，为 1 时选择 B。',['NAND'],['not','and','or']],
 ['half','半加器',null,['NAND'],['and','xor']],
 ['full','全加器','将 A、B、Cin 相加。S 输出低位，C 输出进位。',['NAND'],['and','or','xor','half']],
 ['decode2','2–4 译码器',null,['NAND'],['not','and','or']],
 ['decode3','3–8 译码器',null,['NAND'],['not','and','or','decode2']],
 ['not8','八位反相','Q 的八个位分别与 A 对应位相反。',['NAND','SPLIT8','JOIN8'],['not']],
 ['and8','八位逻辑与','Q 的每一位仅在 A、B 对应位都为 1 时亮起。',['NAND','SPLIT8','JOIN8'],['and']],
 ['or8-build','八位逻辑或',null,['NAND','SPLIT8','JOIN8'],['or']],
 ['xor-byte','八位异或',null,['NAND','SPLIT8','JOIN8'],['xor']],
 ['mux8','八位选择器','S 为 0 时输出 A，为 1 时输出 B。',['NAND','SPLIT8','JOIN8'],['not','and','or','mux']],
 ['adder8','八位加法器','输出 A 与 B 相加后的低八位。',['NAND','SPLIT8','JOIN8','BIT'],['and','or','xor','half','full']],
 ['signed-overflow'],
 ['subtract8','八位减法器','输出 A 减 B 后的低八位。',['NAND','SPLIT8','JOIN8','CONST','BIT'],['not8','adder8']],
 ['sr-latch','SR 锁存器',null,['NAND','DELAY'],['not','and','or']],
 ['dff-build','D 触发器',null,['NAND'],['not','and','or','sr-latch']],
 ['register','一位寄存器','EN 为 1 时在下一拍保存 D，EN 为 0 时保持上一次的值。',['NAND'],['not','and','or','mux','dff-build']],
 ['register8','八位寄存器',null,['SPLIT8','JOIN8'],['register']],
 ['pc-build','八位计数器','EN 为 1 时每拍加一，到 255 后回到 0。EN 为 0 时保持。',['CONST'],['register8','adder8']],
 ['reset-register'],['tiny-ram'],['tiny-rom'],
 ['memory','字节存储器','写使能为 1 时将 DATA 保存到 ADR。Q 随地址变化，显示该地址当前的值。',['RAM8']],
 ['alu-cpu','CM8 ALU',null,['NAND','SPLIT8','JOIN8','CONST','BIT'],['not','and','or','not8','and8','or8-build','xor-byte','mux8','adder8','subtract8']],
 ['control-build','CM8 控制器',null,['NAND','SPLIT16','SPLIT8','JOIN8','CONST','BIT'],['not','and','or','decode2','decode3','mux8']],
 ['cpu-build','CM8 CPU','接通程序计数、取指、译码、运算和写回。载入的程序应在 16 拍之内依次输出 A、B、C、D、E。',['ROM16','RAM8','CONST','BIT','OUT8'],['register8','alu-cpu','control-build','mux8','adder8','pc-build']],
 ['cm8-pixels'],['cm8-loop'],['cm8-branch'],['wire-s32-io'],['s32-stack'],['s32'],['s32-function']
];
for(const [id,moduleName,goal,parts,modules=[]] of guided){
 const level=byId.get(id);
 if(parts)Object.assign(level,{courseName:moduleName,courseGoal:goal||level.text,courseParts:parts,courseModules:modules});
}
byId.get('full').courseBuild=logic('full','全加器',1,{A:1,B:1,Cin:1},{S:1,C:1},'',[],null).build;
byId.get('register').courseBuild=logic('register','一位寄存器',3,{D:1,EN:1},{Q:1},'',[],null).build;
byId.get('cpu-build').courseSubstitutions={REG8:'register8',ALU8:'alu-cpu',CONTROL:'control-build',MUX8:'mux8',ADD8:'adder8'};
for(const id of ['sr-latch','dff-build','register8','register','pc-build'])byId.get(id).checkBeforeClock=true;
byId.get('pc-build').verify=net=>{
 let state=net.initial(),start=0;
 const run=(cycles,input)=>{
  const before=net.evaluate(state,input).inputs('Q')[0];
  let result;
  for(let i=0;i<cycles;i++){result=net.tick(state,input);state=result.state;}
  return [before,result.inputs('Q')[0]];
 };
 return [[2,1,[0,2]],[1,0,[2,2]],[254,1,[2,0]],[1,1,[0,1]]].map(([cycles,en,expected])=>{
  const replay={inputs:{EN:en},start,steps:cycles,state};
  const actual=run(cycles,replay.inputs);
  start+=cycles;
  return {input:{EN:en,周期:cycles},expected,actual,replay,pass:actual.every((v,i)=>v===expected[i])};
 });
};
Game.guidedPath=guided.map(([id])=>byId.get(id));
const courseNeeds={
 nand:[],not:['nand'],and:['not'],or:['not'],xor:['and','or'],
 mux:['and','or'],half:['xor'],full:['half'],decode2:['and','or'],decode3:['decode2'],
 not8:['not'],and8:['and'], 'or8-build':['or'], 'xor-byte':['xor'],mux8:['mux'],
 adder8:['full'],subtract8:['not8','adder8'],
 'sr-latch':['and','or'],'dff-build':['sr-latch'],register:['mux','dff-build'],
 register8:['register'],'pc-build':['register8','adder8'],memory:['register8'],
 'alu-cpu':['and8','or8-build','xor-byte','mux8','subtract8'],
 'control-build':['decode3','mux8'],
 'cpu-build':['register8','alu-cpu','control-build','mux8','adder8','pc-build','memory'],
 'cm8-pixels':['cpu-build'],'cm8-loop':['cpu-build'],'cm8-branch':['cpu-build'],
 'wire-s32-io':['cm8-loop','cm8-branch'],'s32-stack':['wire-s32-io'],s32:['s32-stack'],'s32-function':['s32-stack'],
 'and3':['and'],majority:['and','or'],demux:['mux'],carry8:['adder8'],signed:['subtract8'],
 parity8:['xor-byte'],delay2:['register'],'shared-bus':['register8','mux8'],
 'signed-overflow':['adder8'],'reset-register':['register'],'tiny-ram':['register8','mux8'],'tiny-rom':['mux8','decode2'],'bus-handoff':['shared-bus']
};
Game.coursePrerequisites=level=>(courseNeeds[level.id]||[]).map(id=>byId.get(id));
const routeGroups=[
 ['logic','基础逻辑','搭出后面各条路线共用的逻辑门。',['nand','not','and','or','xor']],
 ['arithmetic','算术','用全加器搭八位加法器，给 CM8 提供加一和算术运算。',['half','full','not8','and8','or8-build','xor-byte','adder8','signed-overflow','subtract8','alu-cpu']],
 ['datapath','数据通路','选择数据从哪里来，再把指令译成控制信号。',['mux','decode2','decode3','mux8','control-build']],
 ['memory','记忆与时钟','寄存器保存状态，计数器推进取指，RAM 读写数据。',['sr-latch','dff-build','register','register8','pc-build','reset-register','tiny-ram','tiny-rom','memory']],
 ['machine','计算机与程序','接起 CM8 后，用它写显存、做循环和条件分支。',['cpu-build','cm8-pixels','cm8-loop','cm8-branch']],
 ['advanced','从 CM8 到 32 位机','先接通字输出，再练习栈，最后单步观察函数调用。',['wire-s32-io','s32-stack','s32','s32-function']],
 ['optional','选做实验','做完相关基础关就可进入，进度独立于教学路线。',['and3','majority','demux','carry8','signed','parity8','delay2','shared-bus','bus-handoff']],
 ['sandbox','自由实验室','用空画布搭自己的组合或时序电路。',['sandbox']]
];
for(const id of ['full','adder8'])byId.get(id).areaChallenge=true;
Game.courseRoutes=routeGroups.map(([id,title,description,ids])=>({id,title,description,levels:ids.map(key=>byId.get(key))}));
})();
