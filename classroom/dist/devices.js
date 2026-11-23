(function(){
'use strict';
// Each exercise attaches the same two data ports and the output strobe.
// Only the guest program can issue commands; verification repeats the device
// from its initial state with a fresh processor for every scenario.
function maze(index){
 const maps=[
  ['########','#S..#..#','###.#.G#','#......#','########'],
  ['########','#S.#...#','#..#.#G#','#....#.#','########'],
  ['########','#S.....#','#####..#','#G....##','########']
 ];
 const map=maps[index],start=map.findIndex(row=>row.includes('S'));
 let x=map[start].indexOf('S'),y=start,dir=1,moves=0,done=false,pass=false;
 const directions=[[0,-1],[1,0],[0,1],[-1,0]];
 function wall(direction){
  const [dx,dy]=directions[(direction+4)%4];return map[y+dy]?.[x+dx]==='#';
 }
 return {
  get input(){return Number(wall(dir))|(Number(wall(dir-1))<<1)|(Number(wall(dir+1))<<2);},
  get done(){return done;},get pass(){return pass;},
  write(v){
   if(v===0)dir=(dir+3)%4;
   else if(v===2)dir=(dir+1)%4;
   else if(v===1&&!wall(dir)){x+=directions[dir][0];y+=directions[dir][1];}
   else{done=true;return;}
   moves++;pass=map[y][x]==='G';done=pass||moves>=192;
  },
  describe(){return map.map((row,i)=>i===y?row.slice(0,x)+'↑→↓←'[dir]+row.slice(x+1):row).join('\n')+'\n动作 '+moves;}
 };
}
function search(index){
 const secret=[0,19,201,255][index];let input=0,tries=0,pass=false;
 return {get input(){return input;},get done(){return pass||tries>=9;},get pass(){return pass;},
  write(value){tries++;pass=value===secret;input=Number(value>secret);},
  describe(){return '猜测 '+tries+' / 9 · IN '+input+(pass?' · 已命中':'');}};
}
function cards(index){
 let left=[12,15,18][index],pass=false,done=false,turn=0;
 return {get input(){return left;},get done(){return done;},get pass(){return pass;},
  write(n){
   if(![1,2,3].includes(n)||n>left){done=true;return;}
   left-=n;if(!left){done=true;return;}
   const opponent=Math.min(left,1+((index+turn++)%3));left-=opponent;
   if(!left){pass=true;done=true;}
  },describe(){return '剩余 '+left+' 张 · 取到最后一张者输';}};
}
function towers(index){
 const size=index+2,pegs=[Array.from({length:size},(_,i)=>size-i),[],[]];let done=false,pass=false,moves=0;
 return {input:size,get done(){return done;},get pass(){return pass;},
  write(value){
   const from=value>>4,to=value&15;
   if(from===to||!pegs[from]?.length||!pegs[to]){done=true;return;}
   const disk=pegs[from].at(-1);
   if(pegs[to].length&&pegs[to].at(-1)<disk){done=true;return;}
   pegs[from].pop();pegs[to].push(disk);moves++;
   pass=pegs[2].length===size;done=pass||moves>=2**size-1;
  },describe(){return pegs.map((v,i)=>i+' │ '+v.join(' ')).join('\n')+'\n移动 '+moves+' 次';}};
}
function exercise(id,title,text,create,count,cycles,machine){
 const program=machine==='overture'?'NOP':'loop: JMP loop';
 function* trials(net){
  const rows=[];
  for(let i=0;i<count;i++){
   const device=create(i);let state=net.initial(),used=0;
   while(!device.done&&used<cycles){
    const inputs={input:device.input},r=net.evaluate(state,inputs);
    if(r.inputs('strobe')[0])device.write(r.inputs('output')[0]);
    state=net.tick(state,inputs).state;used++;if(used%128===0)yield;
   }
   rows.push({input:{情景:i+1,已用周期:used},expected:[1],actual:[Number(device.pass)],pass:device.pass});
  }
  return rows;
 }
 return {id,title,text,chapter:'09 程序作品',tag:'交互式编程挑战',machine,program,
  createDevice:create,build:()=>Game[machine].machine(program),trials,
  verify(net){const steps=trials(net);let r;do{r=steps.next();}while(!r.done);return r.value;}};
}
const levels=[
 exercise('robot-maze','让机器人找到出口','O8 的 IN 低三位依次表示前、左、右有墙。向 OUT 写 0 左转、1 前进、2 右转。机器人从 S 朝东出发，到达 G。碰墙或超过 192 个动作结束。',maze,3,5000,'overture'),
 exercise('binary-search','二分猜一个字节','每次从 OUT 发出猜测，下一拍的 IN 在猜大时为 1，猜小时为 0。命中立即结束。对 0～255 的未知数至多猜九次。',search,4,500,'symphony'),
 exercise('nim','最后一张牌','IN 为剩余牌数，从 OUT 写 1～3 取牌。取到最后一张输；对手取牌后，IN 自动更新。',cards,3,500,'symphony'),
 exercise('tower','汉诺塔与递归','IN 给出盘数 2～4。三根柱编号为 0、1、2。输出 (起点 × 16 + 终点) 表示移动一只盘。用最少步数把全部盘从 0 移到 2。',towers,3,4000,'symphony')
];
Game.levels.splice(Game.levels.findIndex(l=>l.id==='mines32'),0,...levels);
function budget(machine,examples,limit){
 const cpu=Game[machine],program=examples[0][0],base=cpu.machine(program);
 const area=Circuit.compile(base.nodes,base.wires).expandedCount;
 const entry={id:machine==='overture'?'o8-budget':'s32-budget',machine,program,chapter:machine==='overture'?'07 字节寄存器机':'08 三十二位计算机',
  title:machine==='overture'?'字节机硬件预算':'三十二位机硬件预算',tag:'多程序硬件验收',
  text:'可以改线、替换元件或封装模块。测试会依次更换 ROM，核对每个程序的输出。参考机器占 '+area+' 个展开元件，每份程序观测 '+limit+' 拍。结果保留本机关卡的最小通过规模。',
  build:()=>cpu.machine(program),
  verify(net,doc){
   const results=examples.map(([source,expected],i)=>{
    const board=Circuit.clone(doc),rom=board.nodes.find(n=>n.id==='rom');
    if(!rom)throw Error('找不到 rom');
    rom.program=cpu.assemble(source).words;
    const trial=Circuit.compile(board.nodes,board.wires);
    if(trial.error)throw Error(trial.error);
    let state=trial.initial();const actual=[];
    for(let tick=0;tick<limit;tick++){
     const r=trial.evaluate(state);if(r.inputs('strobe')[0])actual.push(r.inputs('output')[0]);
     state=trial.tick(state).state;
    }
    return {input:{程序:i+1,周期:limit},expected,actual,pass:actual.join(',')===expected.join(',')};
   });
   results.push({input:{面积上限:area,实际面积:net.expandedCount},actual:[Number(net.expandedCount<=area)],expected:[1],pass:net.expandedCount<=area});
   return results;
  }};
 return entry;
}
const o8=budget('overture',[
 ['IMM 17\nMOV R5,R0\nMOV OUT,R5',[17]],
 ['IMM 3\nMOV R1,R0\nIMM 5\nMOV R2,R0\nSUB\nMOV OUT,R3',[254]],
 ['IMM 3\nMOV R1,R0\nIMM 1\nMOV R2,R0\nIMM loop\nloop:MOV OUT,R1\nSUB\nMOV R1,R3\nJNZ',[3,2,1]]
],64);
const s32=budget('symphony',[
 ['MOV R1,258\nOUT R1\nend:JMP end',[258]],
 ['MOV R1,43981\nSTORE_16 [1],R1\nLOAD_8 R2,[2]\nOUT R2\nend:JMP end',[171]],
 ['MOV SP,1024\nCALL body\nOUT R1\nend:JMP end\nbody:SUB R1,ZR,1\nRET',[0xffffffff]]
],64);
Game.levels.splice(Game.levels.findIndex(l=>l.id==='s32'),0,o8);
Game.levels.splice(Game.levels.findIndex(l=>l.chapter==='09 程序作品'),0,s32);
})();
