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
extra.push({id:'cpu-build',title:'连接你的计算机',chapter:'05 计算机',tag:'CPU · 综合挑战',text:'参考 CPU 的全部元件已放置，连线由你完成。使用 CM8 指令格式，验证终端在前 16 拍依次输出 A、B、C、D、E。每个元件的引脚可在探针中查看。',allowed:['REG8','ROM16','CONTROL','ALU8','RAM8','MUX8','ADD8','CONST','OUT8'],program:cpuReference.program,
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
