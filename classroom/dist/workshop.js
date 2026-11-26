(function(){
'use strict';
const command=0x1000,data=0x1100,model=0x1200,framebuffer=0x5000,screenWidth=64,screenHeight=48;
const source=lines=>lines.join('\n');
const poll=[
 'poll: LOAD_8 R1, [0x1000]','CMP R1, 0','JE poll'
];
const done=['STORE_8 [0x1000], ZR','JMP poll'];

const lander=source([
 '; R2 高度、R3 下落速度，单位均为 1/16 像素。R4 燃料，R5 横坐标。',
 'MOV R2, 576','MOV R3, 0','MOV R4, 32','MOV R5, 32','MOV R6, 0','JMP display',
 ...poll,'CMP R6, 0','JNE ready','MOV R11, 0',
 'AND R7, R1, 2','CMP R7, 0','JE checkRight','CMP R5, 1','JBE checkRight','SUB R5, R5, 1',
 'checkRight: AND R7, R1, 4','CMP R7, 0','JE gravity','CMP R5, 62','JAE gravity','ADD R5, R5, 1',
 'gravity: ADD R3, R3, 2','AND R7, R1, 1','CMP R7, 0','JE motion','CMP R4, 0','JE motion',
 'SUB R4, R4, 1','SUB R3, R3, 5','MOV R11, 1',
 'motion: SUB R2, R2, R3','CMP R2, 640','JLE touchdown','MOV R2, 640','MOV R3, 0',
 'touchdown: CMP R2, 0','JG display','MOV R2, 0','MOV R6, 2',
 'CMP R3, 12','JG display','CMP R5, 24','JB display','CMP R5, 40','JA display','MOV R6, 1',
 'display: STORE_32 [0x1200], R2','STORE_32 [0x1204], R3','STORE_8 [0x1208], R4',
 'STORE_8 [0x1209], R5','STORE_8 [0x120a], R6',
 '; 擦去上一帧的机身、机翼和火焰。',
 'CMP R8, 0','JE plot','STORE_8 [R8], ZR',
 'SUB R10, R8, 64','STORE_8 [R10], ZR','SUB R10, R8, 1','STORE_8 [R10], ZR',
 'ADD R10, R8, 1','STORE_8 [R10], ZR','ADD R10, R8, 64','STORE_8 [R10], ZR',
 'plot: LSR R9, R2, 4','MOV R8, 44','SUB R8, R8, R9','LSL R8, R8, 6','ADD R8, R8, R5',
 'ADD R8, R8, 0x5000','MOV R9, 255','CMP R6, 2','JNE hull','MOV R9, 224',
 'hull: STORE_8 [R8], R9','SUB R10, R8, 64','STORE_8 [R10], R9',
 'MOV R9, 127','SUB R10, R8, 1','STORE_8 [R10], R9','ADD R10, R8, 1','STORE_8 [R10], R9',
 'CMP R11, 0','JE ready','ADD R10, R8, 64','MOV R9, 244','STORE_8 [R10], R9',
 'ready: '+done[0],done[1]
]);

const cube=(()=>{
 const angle=Array.from({length:16},(_,i)=>[Math.round(14*Math.cos(i*Math.PI/8)),Math.round(14*Math.sin(i*Math.PI/8))]);
 const table=angle.flatMap((pair,i)=>pair.flatMap((value,j)=>[
  (value<0?'NEG':'MOV')+' R1, '+Math.abs(value),'STORE_32 ['+(0x1300+i*8+j*4)+'], R1'
 ]));
 const corners=Array.from({length:8},(_,i)=>{
  const x=i&1?'SUB':'ADD',y=i&2?'16':'32',z=i&4?'SUB':'ADD';
  return [
   x+' R4, R9, R2',z+' R4, R4, R3','STORE_32 ['+(0x1400+i*8)+'], R4',
   'MOV R4, '+y,x+' R4, R4, R5',z+' R4, R4, R6','STORE_32 ['+(0x1404+i*8)+'], R4'
  ];
 }).flat();
 const lines=Array.from({length:8},(_,a)=>[1,2,4].filter(bit=>!(a&bit)).flatMap(bit=>{
  const b=a^bit;
  return [
   'LOAD_32 R1, ['+(0x1400+a*8)+']','LOAD_32 R2, ['+(0x1404+a*8)+']',
   'LOAD_32 R3, ['+(0x1400+b*8)+']','LOAD_32 R4, ['+(0x1404+b*8)+']',
   'MOV R7, '+(bit===4?31:a&4?255:158),'CALL line'
  ];
 })).flat();
 return source([
  '; 三角函数表仅用来存常量。投影点、线段和显存地址均由 CPU 计算。',
  'MOV SP, 0x4000',...table,
  ...poll,'LOAD_8 R10, [0x1200]','LSL R1, R10, 3','ADD R1, R1, 0x1300',
  'LOAD_32 R2, [R1]','ADD R1, R1, 4','LOAD_32 R3, [R1]','ASR R5, R3, 2','ASR R6, R2, 2',
  'MOV R9, 32',...corners,...lines,
  'ADD R10, R10, 1','AND R10, R10, 15','STORE_8 [0x1200], R10',...done,
  '; DDA。累加器放大 32 倍，包含两个端点共采样 33 次。',
  'line: SUB R3, R3, R1','SUB R4, R4, R2','LSL R1, R1, 5','LSL R2, R2, 5',
  'MOV R11, 33','dot: ASR R8, R2, 5','LSL R8, R8, 6','ASR R12, R1, 5','ADD R8, R8, R12',
  'ADD R8, R8, 0x5000','STORE_8 [R8], R7','ADD R1, R1, R3','ADD R2, R2, R4',
  'SUB R11, R11, 1','CMP R11, 0','JNE dot','RET'
 ]);
})();

const rhythm=source([
 '; 0x1200–0x123F 是八条音轨，每行八步。命令 1–64 翻转格，65 时钟推进。',
 'MOV R4, 7','STORE_8 [0x1240], R4',
 ...poll,'CMP R1, 65','JE clock','SUB R1, R1, 1','ADD R1, R1, 0x1200',
 'LOAD_8 R2, [R1]','XOR R2, R2, 1','STORE_8 [R1], R2','JMP ready',
 'clock: ADD R4, R4, 1','AND R4, R4, 7','STORE_8 [0x1240], R4',
 'ADD R5, R4, 0x1200','MOV R6, 0','MOV R7, 0',
 'scan: LOAD_8 R8, [R5]','LSL R8, R8, R6','OR R7, R7, R8','ADD R5, R5, 8',
 'ADD R6, R6, 1','CMP R6, 8','JB scan','STORE_8 [0x1241], R7','OUT R7',
 'ready: '+done[0],done[1]
]);

const sender=source([
 '; 每次传八行。帧携带行号、像素和一字节异或校验。',
 ...poll,'MOV R2, 0','STORE_8 [0x1210], ZR','STORE_8 [0x1211], ZR',
 'next: ADD R3, R2, 0x1100','LOAD_8 R4, [R3]','XOR R5, R2, R4','LSL R5, R5, 16',
 'LSL R6, R2, 8','OR R5, R5, R6','OR R5, R5, R4','OR R5, R5, 0x8000',
 'send: OUT R5','wait: IN R7','CMP R7, 0','JE wait','CMP R7, 1','JE accept',
 'LOAD_8 R8, [0x1211]','ADD R8, R8, 1','STORE_8 [0x1211], R8','JMP send',
 'accept: ADD R2, R2, 1','STORE_8 [0x1210], R2','CMP R2, 8','JB next',...done
]);
const receiver=source([
 '; IN bit 15 表示有帧。OUT 1 表示接收成功，OUT 2 要求重发。',
 'wait: IN R1','AND R2, R1, 0x8000','CMP R2, 0','JE wait',
 'LSR R2, R1, 8','AND R2, R2, 7','AND R3, R1, 255','LSR R4, R1, 16',
 'XOR R5, R2, R3','CMP R4, R5','JNE reject','ADD R2, R2, 0x1100','STORE_8 [R2], R3',
 'OUT 1','JMP wait','reject: OUT 2','JMP wait'
]);
function linkCircuit(){
 const tx=Game.symphony.machine(sender),rx=Game.symphony.machine(receiver);
 tx.receiverSource=receiver;
 tx.nodes.push(...rx.nodes.map(n=>({...n,id:'rx-'+n.id,x:n.x+2350,label:'接收 '+n.label})));
 tx.wires.push(...rx.wires.map(w=>({...w,id:'rx-'+w.id,from:'rx-'+w.from,to:'rx-'+w.to})));
 return tx;
}
function transport(){
 let packet=0,ack=0,flip=false,corrupted=0;
 return {
  get inputs(){return {input:ack,'rx-input':packet};},
  get corrupted(){return corrupted;},
  get armed(){return flip;},
  corrupt(){flip=true;},
  sample(result){
   if(result.inputs('strobe')[0]){
    packet=result.inputs('output')[0];ack=0;
    if(flip){packet^=1;flip=false;corrupted++;}
   }
   if(result.inputs('rx-strobe')[0]){ack=result.inputs('rx-output')[0];packet=0;}
  }
 };
}

const commands=[['ls','directory'],['cat readme.txt','readme'],['run count.bin','application']];
const shell=(()=>{
 const matching=commands.flatMap(([word,label],i)=>[
  'check'+i+': CMP R1, '+word.length,'JNE check'+(i+1),
  ...Array.from(word,(ch,index)=>['LOAD_8 R2, ['+(data+index)+']','CMP R2, '+ch.charCodeAt(0),'JNE check'+(i+1)]).flat(),
  'JMP '+label
 ]);
 const print=(text)=>Array.from(text,c=>['MOV R8, '+c.charCodeAt(0),'CALL putc']).flat();
 return source([
  '; RAM 0x1100 接收命令字符串，0x5400 是终端输出，磁盘由 PLOAD 读取。',
  'MOV SP, 0x4000','MOV R9, 0x5400',...print('CircuitMind VM\n$ '),
  ...poll,'MOV R10, 0x1100','MOV R11, R1',
  'echo: LOAD_8 R8, [R10]','CALL putc','ADD R10, R10, 1','SUB R11, R11, 1','CMP R11, 0','JNE echo',
  'MOV R8, 10','CALL putc',...matching,'check'+commands.length+':',...print('Unknown command\n'),'JMP prompt',
  'directory: MOV R3, 0','CALL file','JMP prompt',
  'readme: MOV R3, 128','CALL file','JMP prompt',
  '; 从外存取两个指令字，装入 RAM，再解释 0=停机，1=加一，2=输出数字。',
  'application: PLOAD R4, [256]','STORE_32 [0x1500], R4','PLOAD R4, [260]','STORE_32 [0x1504], R4',
  'MOV R4, 0x1500','MOV R5, 0','vm: LOAD_8 R6, [R4]','ADD R4, R4, 1',
  'CMP R6, 0','JE vmEnd','CMP R6, 1','JNE emit','ADD R5, R5, 1','JMP vm',
  'emit: ADD R8, R5, 48','CALL putc','JMP vm',
  'vmEnd: MOV R8, 10','CALL putc','JMP prompt',
  'file: PLOAD R7, [R3]','AND R8, R7, 255','CMP R8, 0','JE eof','CALL putc','ADD R3, R3, 1','JMP file','eof: RET',
  'prompt:',...print('$ '),...done,
  'putc: CMP R9, 0x5aff','JBE write','MOV R9, 0x5400','write: STORE_8 [R9], R8','ADD R9, R9, 1','RET'
 ]);
})();
function diskImage(){
 const disk={};
 for(const [offset,text] of [[0,'readme.txt\ncount.bin\n'],[128,'Files live on the virtual disk.\n']])
  Array.from(text,(ch,i)=>disk[offset+i]=ch.charCodeAt(0));
 [1,2,1,2,1,2,0].forEach((op,i)=>disk[256+i]=op);
 return disk;
}

const entries=[
 {id:'lander',title:'像素飞船着陆器',kind:'lander',program:lander,text:'控制方向和推力，让飞船在燃料耗尽前降到着陆区。'},
 {id:'link',title:'双 CPU 传图台',kind:'link',program:sender,receiver,build:linkCircuit,text:'在左屏画图。两个 CPU 用校验和与应答把像素逐行送到右屏。'},
 {id:'cube',title:'从汇编画出旋转立方体',kind:'cube',program:cube,text:'暂停或逐条执行，观察投影坐标如何写入显存。'},
 {id:'rhythm',title:'像素节奏机',kind:'rhythm',program:rhythm,text:'点亮八条音轨的格子，听 CPU 随时钟扫描并输出的节奏。'},
 {id:'shell',title:'微型操作系统终端',kind:'shell',program:shell,text:'在电路 CPU 上执行 ls、cat readme.txt 和 run count.bin。'}
];
for(const entry of entries){
 Game.levels.splice(Game.levels.findIndex(l=>l.id==='sandbox'),0,{
  ...entry,id:'workshop-'+entry.id,demo:entry.kind,chapter:'创意工坊',tag:'创意工坊 · Symphony 32 位',machine:'symphony',
  workshop:'studio',build:entry.build||(()=>Game.symphony.machine(entry.program))
 });
}
Game.workshopKit={command,data,model,framebuffer,screenWidth,screenHeight,diskImage,transport};
})();
