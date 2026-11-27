(function () {
'use strict';
const operations=['NAND','OR','AND','NOR','ADD','SUB','XOR','LSL','LSR','ASR','CMP'];
const jumps={JMP:8,JE:1,JNE:9,JB:2,JAE:10,JBE:3,JA:11,JL:4,JGE:12,JLE:5,JG:13};
const loads=['LOAD_8','LOAD_16','LOAD_32','PLOAD'];
const stores=['STORE_8','STORE_16','STORE_32','PSTORE'];
const names=['ZR',...Array.from({length:13},(_,i)=>'R'+(i+1)),'SP','FLAGS'];
const word=(op,d=0,b=0,low=0)=>((op<<24)|(d<<20)|(b<<16)|low)>>>0;
function assemble(source) {
 const labels=new Map(),rows=[];
 let address=0;
 for(const [index,line] of source.split(/\r?\n/).entries()){
  let text=line.split(';')[0].trim();
  const label=/^([a-z_]\w*):/i.exec(text);
  if(label){
   if(labels.has(label[1]))throw Error('标签重复：'+label[1]);
   labels.set(label[1],address);text=text.slice(label[0].length).trim();
  }
  if(!text)continue;
  const [m,...args]=text.split(/[\s,]+/),name=m.toUpperCase();
  const count=({PUSH:2,POP:2,CALL:5,RET:3})[name]??1;
  rows.push({name,args,line:index+1});address+=4*count;
 }
 if(address>65536)throw Error('指令存储器最大为 64 KiB');
 const words=[],lines=[];
 for(const {name,args,line} of rows){
  const fail=msg=>{throw Error('第 '+line+' 行：'+msg);};
  const arity=n=>{if(args.length!==n)fail(name+' 需要 '+n+' 个操作数');};
  const reg=s=>{const i=names.indexOf(s?.toUpperCase());if(i<0)fail('未知寄存器 '+s);return i;};
  const num=(s,max=65535)=>{
   const n=labels.has(s)?labels.get(s):Number(s);
   if(!Number.isInteger(n)||n<0||n>max)fail('立即数或标签超出范围：'+s);
   return n;
  };
  const operand=s=>names.includes(s.toUpperCase())?[0,reg(s)<<8]:[16,num(s)];
  const encoded=(op,d,b,s)=>{const [mode,v]=operand(s);return word(op|mode,d,b,v);};
  const emit=(...items)=>{words.push(...items);lines.push(...items.map(()=>line));};
  if(name==='DW'){arity(1);emit(num(args[0],0xffffffff));}
  else if(name==='NOP'){arity(0);emit(0);}
  else if(['IN','KEYBOARD','TIME_0','TIME_1','COUNTER'].includes(name)){
   arity(1);emit(word(({IN:1,KEYBOARD:3,TIME_0:5,TIME_1:6,COUNTER:7})[name],reg(args[0])));
  }else if(name==='OUT'){arity(1);emit(encoded(2,0,0,args[0]));}
  else if(name==='SCREEN'){arity(2);emit(encoded(4,0,reg(args[0]),args[1]));}
  else if(name==='CMP'){arity(2);emit(encoded(42,15,reg(args[0]),args[1]));}
  else if(operations.includes(name)){arity(3);emit(encoded(32+operations.indexOf(name),reg(args[0]),reg(args[1]),args[2]));}
  else if(['MOV','NEG','NOT'].includes(name)){arity(2);emit(encoded(({MOV:33,NEG:37,NOT:35})[name],reg(args[0]),0,args[1]));}
  else if(Object.hasOwn(jumps,name)){arity(1);emit(encoded(64+jumps[name],0,15,args[0]));}
  else if(loads.includes(name)||stores.includes(name)){
   arity(2);const store=stores.includes(name),idx=(store?stores:loads).indexOf(name);
   const adr=/^\[(.+)\]$/.exec(args[store?0:1]);if(!adr)fail('地址应写成 [R1] 或 [100]');
   const r=reg(args[store?1:0]);emit(encoded(96+idx+(store?4:0),store?0:r,store?r:0,adr[1]));
  }else if(name==='PUSH'){arity(1);emit(word(53,14,14,4),word(102,0,reg(args[0]),14<<8));}
  else if(name==='POP'){arity(1);emit(word(98,reg(args[0]),0,14<<8),word(52,14,14,4));}
  else if(name==='CALL'){arity(1);emit(word(7,15),word(52,15,15,20),word(53,14,14,4),word(102,0,15,14<<8),word(88,0,15,num(args[0])));}
  else if(name==='RET'){arity(0);emit(word(98,15,0,14<<8),word(52,14,14,4),word(72,0,15,15<<8));}
  else fail('未知指令 '+name);
 }
 return {words,lines};
}

const p=(name,width=32)=>({name,width});
const types=Circuit.types;
types.S32DECODE={
 inputs:[p('指令')],outputs:[p('B 编号',8),p('C 编号',8),p('写回编号',8),p('立即数'),p('立即模式',1),p('RAM 写',1),p('外存写',1),p('字节数',8),p('OUT 有效',1),p('屏幕有效',1)],
 evaluate:([ir])=>{
  const op=ir>>>24,base=op&~16,store=base>=100&&base<=103;
  const writes=[1,3,5,6,7].includes(base)||(base>=32&&base<=42)||(base>=96&&base<=99);
  return [(ir>>>16)&15,(ir>>>8)&15,writes?(ir>>>20)&15:0,ir&65535,(op>>>4)&1,
   Number(store&&base!==103),Number(base===103),[1,2,4,4][base&3],Number(base===2),Number(base===4)];
 }
};
types.S32READ={inputs:[p('编号',8),...names.slice(1).map(n=>p(n))],outputs:[p('数据')],evaluate:([idx,...regs])=>[(idx&15)?regs[(idx&15)-1]:0]};
types.S32MUX={inputs:[p('寄存器'),p('立即数'),p('选择',1)],outputs:[p('数据')],evaluate:([a,b,s])=>[s?b:a]};
types.S32ALU={
 inputs:[p('指令'),p('B'),p('C / IMM'),p('RAM'),p('外存'),p('IN'),p('键盘'),p('PC'),p('时钟')],
 outputs:[p('写回数据'),p('下个 PC'),p('下个时钟')],
 evaluate:([ir,b,c,ram,storage,input,key,pc,tick])=>{
  const op=(ir>>>24)&~16;
  let result=0,next=(pc+4)>>>0;
  switch(op){
   case 1:result=input;break;
   case 3:result=key;break;
   case 5:result=tick;break;
   case 6:result=0;break;
   case 7:result=pc;break;
   case 32:result=~(b&c);break;
   case 33:result=b|c;break;
   case 34:result=b&c;break;
   case 35:result=~(b|c);break;
   case 36:result=b+c;break;
   case 37:result=b-c;break;
   case 38:result=b^c;break;
   case 39:result=c>=32?0:b<<c;break;
   case 40:result=c>=32?0:b>>>c;break;
   case 41:result=(b|0)>>Math.min(c,31);break;
   case 42:result=Number(b===c)|(Number(b<c)<<1)|(Number((b|0)<(c|0))<<2);break;
   case 96:case 97:case 98:result=ram;break;
   case 99:result=storage;break;
   default:if((op&0xe0)===64 && Boolean(b&(op&7))!==Boolean(op&8))next=c;
  }
  return [result>>>0,next,(tick+1)>>>0];
 }
};
function machine(source){
 const d={nodes:[],wires:[],source};
 function put(id,type,x,y,label){d.nodes.push(Game.node(id,type,x,y,label));}
 function link(a,b,pin,out=0){d.wires.push(Game.wire(a,b,pin,out));}
 put('pc','REG32',30,40,'PC · 字节地址');put('rom','ROM32',240,40,'程序 ROM');
 d.nodes.at(-1).program=assemble(source).words;
 put('decode','S32DECODE',440,40,'指令字段');put('ready','BIT',35,230,'使能');d.nodes.at(-1).value=1;
 put('clock','REG32',30,390,'虚拟时钟');put('input','IN32',35,530,'输入端口');put('keyboard','IN32',35,640,'键盘码');
 put('b','S32READ',1250,20,'B 读端口');put('c','S32READ',1250,530,'C 读端口');
 put('operand','S32MUX',1460,530,'操作数选择');
 put('ram','RAM32',1670,470,'RAM · 64 KiB');put('storage','RAM32',1670,680,'第二存储区');
 put('alu','S32ALU',1890,200,'运算与跳转');put('output','OUT32',1910,545,'输出字');
 put('strobe','OUT',1910,680,'输出有效');put('screen','OUT',1910,815,'屏幕写入');
 link('pc','rom',0);link('rom','decode',0);link('decode','b',0);link('decode','c',0,1);
 for(let i=1;i<16;i++){
  const x=660+Math.floor((i-1)/5)*190,y=35+((i-1)%5)*170;
  put('r'+i,'REG32',x,y,names[i]);put('sel'+i,'CONST',x,y+83,'编号 '+i);d.nodes.at(-1).value=i;
  put('we'+i,'EQ8',x,y+1650,'写使能 '+names[i]);link('decode','we'+i,0,2);link('sel'+i,'we'+i,1);
  link('alu','r'+i,0);link('we'+i,'r'+i,1);link('r'+i,'b',i);link('r'+i,'c',i);
 }
 link('c','operand',0);link('decode','operand',1,3);link('decode','operand',2,4);
 for(const [id,we] of [['ram',5],['storage',6]]){
  link('operand',id,0);link('b',id,1);link('decode',id,2,we);link('decode',id,3,7);
 }
 ['rom','b','operand','ram','storage','input','keyboard','pc','clock'].forEach((id,i)=>link(id,'alu',i));
 link('alu','pc',0,1);link('ready','pc',1);link('alu','clock',0,2);link('ready','clock',1);
 link('operand','output',0);link('decode','strobe',0,8);link('decode','screen',0,9);
 return d;
}
const intro='MOV SP, 4096\nMOV R1, 20\nCALL twice\nOUT R1\nend: JMP end\ntwice: ADD R1, R1, R1\nRET';
const chapter='08 三十二位计算机';
function lesson(id,title,text,source,examples){
 const entry={id,title,text,chapter,machine:'symphony',tag:'Symphony · 32 位',program:source,build:()=>machine(source)};
 if(examples)entry.verify=net=>examples.map(([input,expected])=>{
  let state=net.initial(),actual=[];
  for(let cycle=0;cycle<112;cycle++){
   const before=net.evaluate(state,{input});
   if(before.inputs('strobe')[0])actual.push(before.inputs('output')[0]);
   state=net.tick(state,{input}).state;
  }
  return {input:{IN:input,周期:112},actual,expected,replay:{inputs:{input},steps:112},pass:actual.length===expected.length&&expected.every((v,i)=>actual[i]===v)};
 });
 return entry;
}
const starter='IN R1\n; 在此完成程序\nend: JMP end';
const lessons=[
 lesson('s32','从 CALL 走进函数','单步观察 PC、SP 和 FLAGS。CALL 展开成五条机器指令，RET 从内存取回返回地址。',intro),
 lesson('s32-cmp','带符号和无符号比较','比较输入与零。输出 CMP 得到的标志字，位 0 表示相等，位 1 表示无符号小于，位 2 表示有符号小于。',starter,[[0,[1]],[73,[0]],[4294967295,[4]]]),
 lesson('s32-memory','间接寻址与小端字节','在地址 513 写入输入的 32 位值，用寄存器寻址分别读出地址 514 和 515 的两个字节并输出。',starter,[[0,[0,0]],[0x12345678,[0x56,0x34]],[0xffaa1100,[17,170]]]),
 lesson('s32-stack','后进先出','将输入和输入加一分别压栈，再依次弹出并输出。栈顶可初始化为 4096。',starter,[[0,[1,0]],[7,[8,7]],[0xffffffff,[0,0xffffffff]]]),
 lesson('s32-function','子程序与返回地址','编写一个函数 f(x)=3x+1，在主程序调用两次，输出 f(f(IN))，按 32 位取模。',starter,[[0,[4]],[3,[31]],[20,[184]]])
];
Game.levels.splice(Game.levels.findIndex(l=>l.id==='sandbox'),0,...lessons);
const previous=Game.isComputer;Game.isComputer=l=>l.machine==='symphony'||previous(l);
Game.symphony={assemble,machine,names};
})();
