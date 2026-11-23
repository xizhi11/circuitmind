(function(){
'use strict';
// Device ABI: 4096..4159 are the tiles; 4352 command, 4353 status
// (0 ready, 1 loss, 2 win), 4354 open count, 4355 initialized, 4356 busy.
// A tile stores mine/flag/open in bits 7/6/5 and its clue in the low nibble.
const command=4352,status=4353,count=4354,initialized=4355,busy=4356,base=4096,queue=4608;
// Generate the eight boundary checks as real guest instructions. Coordinates
// and cell contents are evaluated on the player's CPU on every move.
function neighbors(prefix,body){
 const rows=[];
 for(const dy of [-1,0,1])for(const dx of [-1,0,1]){
  if(!dx&&!dy)continue;
  const skip=prefix+'_'+(dy+1)+'_'+(dx+1);
  if(dx)rows.push('AND R9, R4, 7','CMP R9, '+(dx<0?0:7),'JE '+skip);
  if(dy)rows.push('CMP R4, '+(dy<0?8:56),(dy<0?'JB ':'JAE ')+skip);
  const delta=8*dy+dx;
  rows.push((delta<0?'SUB':'ADD')+' R5, R4, '+Math.abs(delta),'ADD R6, R5, '+base,'LOAD_8 R7, [R6]',...body(skip),skip+':');
 }
 return rows.join('\n');
}
const source=[
 '; 8×8，八颗雷。R1 接收命令，R4 是正在处理的格号。IN 提供种子。',
 'IN R10','AND R10, R10, 65535',
 'poll: LOAD_8 R1, [4352]','CMP R1, 0','JE poll','MOV R2, 1','STORE_8 [4356], R2',
 'CMP R1, 64','JA flag','SUB R1, R1, 1','LOAD_8 R2, [4355]','CMP R2, 0','JNE reveal',
 '; 用 16 位 LCG 选择不同雷位，跳过首次揭开的格子。',
 'MOV R11, 0','place: LSL R9, R10, 2','ADD R10, R10, R9','ADD R10, R10, 1',
 'AND R10, R10, 65535','LSR R4, R10, 7','AND R4, R4, 63','CMP R4, R1','JE place',
 'ADD R6, R4, 4096','LOAD_8 R7, [R6]','AND R9, R7, 128','CMP R9, 0','JNE place',
 'OR R7, R7, 128','STORE_8 [R6], R7',
 neighbors('countAround',()=>['ADD R7, R7, 1','STORE_8 [R6], R7']),
 'ADD R11, R11, 1','CMP R11, 8','JB place','MOV R2, 1','STORE_8 [4355], R2',
 'reveal: ADD R6, R1, 4096','LOAD_8 R7, [R6]','AND R9, R7, 96','CMP R9, 0','JNE done',
 'AND R9, R7, 128','CMP R9, 0','JNE lose','MOV R12, 0','MOV R13, 0',
 'MOV R5, R1','MOV SP, 8192','CALL openCell',
 'flood: CMP R12, R13','JAE finish','ADD R6, R12, 4608','LOAD_8 R4, [R6]','ADD R12, R12, 1',
 neighbors('expand',skip=>['AND R9, R7, 224','CMP R9, 0','JNE '+skip,'CALL openCell']),
 'JMP flood',
 'openCell: OR R7, R7, 32','STORE_8 [R6], R7','LOAD_8 R8, [4354]','ADD R8, R8, 1','STORE_8 [4354], R8',
 'AND R9, R7, 15','CMP R9, 0','JNE returnCell','ADD R9, R13, 4608','STORE_8 [R9], R5','ADD R13, R13, 1','returnCell: RET',
 'finish: LOAD_8 R2, [4354]','CMP R2, 56','JNE done','MOV R2, 2','JMP ended',
 'lose: MOV R2, 1','ended: STORE_8 [4353], R2','STORE_8 [4352], ZR','STORE_8 [4356], ZR','halt: JMP halt',
 'flag: SUB R1, R1, 65','ADD R6, R1, 4096','LOAD_8 R7, [R6]','AND R9, R7, 32','CMP R9, 0','JNE done',
 'XOR R7, R7, 64','STORE_8 [R6], R7',
 'done: STORE_8 [4356], ZR','STORE_8 [4352], ZR','JMP poll'
].join('\n');
const level={id:'mines32',title:'用自己的 CPU 玩扫雷',chapter:'09 程序作品',machine:'symphony',tag:'汇编应用 · 随机扫雷',
 text:'棋盘由程序在首次揭格时布雷。可插旗、取消旗子、展开空白区域。打开全部 56 个安全格获胜。每次操作会运行到 CPU 处理完这条输入，单步可观察程序。',
 program:source,build:()=>{const d=Game.symphony.machine(source);d.nodes.find(n=>n.id==='input').value=Math.floor(Math.random()*65536);return d;}};
Game.levels.splice(Game.levels.findIndex(l=>l.id==='sandbox'),0,level);
Game.mineDevice={command,status,count,initialized,busy,base,queue};
})();
