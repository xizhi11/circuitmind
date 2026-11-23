(function(){
'use strict';
const {node,wire}=Game;
const gates=['NAND','NOT','AND','OR','XOR','MUX','BIT'];
const bytes=[...gates,'SPLIT8','JOIN8','ADD8','SUB8','SHR8','NOT8','AND8','XOR8','MUX8','EQ8','LT8','CONST'];
const chapters=['01 逻辑门','02 数据通路','03 总线与算术','04 记忆与时钟'];
function logic(id,title,chapter,inputWidths,outputWidths,text,allowed,fn,samples){
 const inputs=Object.keys(inputWidths),outputs=Object.keys(outputWidths);
 const build=()=>({nodes:[
  ...inputs.map((id,i)=>node(id,inputWidths[id]===1?'IN':'IN8',75,80+110*i,id)),
  ...outputs.map((id,i)=>node(id,outputWidths[id]===1?'OUT':'OUT8',1030,90+110*i,id))
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
   return [{input:{周期:70},expected,actual,pass:actual.join(',')===expected.join(',')}];
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
  let state=net.initial();const actual=[];
  for(let i=0;i<500;i++){
   const r=net.evaluate(state,{input});if(r.inputs('strobe')[0])actual.push(r.inputs('output')[0]);
   const next=net.tick(state,{input}).state;
   if(next.pc===state.pc&&!r.inputs('strobe')[0])break;
   state=next;
  }
  return {input:{IN:input},actual,expected,pass:actual.join(',')===expected.join(',')};
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
const order=['nand','not','constant','and','or','nor','and3','or3','xor','xnor','odd','majority','two-of-four','mux','demux','decode2','decode3','onehot','mux4','half','full','count4','not8','and8','nand8','xor-byte','mux8','adder8','carry8','subtract8','negate','equal8','unsigned','signed','shift8','lsr','asr','mod4','parity8','register','delay2','toggle','edge','register8','counter','pc-build','sum8','memory','alu-build','cpu','cpu-build','gate-cpu','display','mines','overture','wire-registers','wire-immediate','wire-pc','o8-binary','o8-echo','o8-double','o8-branch','o8-repeat','s32','wire-s32-immediate','wire-s32-io','s32-cmp','wire-s32-ram','s32-memory','wire-s32-disk','s32-stack','wire-s32-stack','s32-function','capitalize','popcount','leading','triangle','multiply','divide','sort','rng','mines32','sandbox'];
order.splice(order.indexOf('memory'),0,'shared-bus');
order.splice(order.indexOf('mux'),0,'gate-race','binary-race','hex-race');
const rank=id=>{const i=order.indexOf(id);return i<0?order.length-1:i;};
Game.levels.sort((a,b)=>rank(a.id)-rank(b.id));
Game.isGraded=l=>!!(l.expect||l.sequence||l.vectors||l.verify||l.drill);
Game.prerequisite=l=>{
 if(l.id==='sandbox')return null;
 const i=Game.levels.indexOf(l);
 return Game.levels.slice(0,i).reverse().find(Game.isGraded)||null;
};
})();
