(function(){
'use strict';
const puzzles=[
 {title:'折一次再回来',mirrors:[1,9],flips:[],goal:2},
 {title:'沿棋盘绕行',mirrors:[2,4,11,12,14],flips:[14],goal:1},
 {title:'交叉光路',mirrors:[2,4,7,8,10,13,15],flips:[10],goal:3}
];
const maskOf=cells=>cells.reduce((mask,cell)=>mask|(1<<cell),0);
function wiring(){
 const circuit={nodes:[],wires:[]};
 function add(id,type,x,y,label,value){
  const module=typeof type==='object';
  const node=Game.node(id,module?'CUSTOM':type,x,y,label||(module?type.name:type),value);
  if(module)node.spec=type;
  circuit.nodes.push(node);
  return id;
 }
 function feed(to,...from){
  from.forEach((at,pin)=>{
   const [id,output=0]=Array.isArray(at)?at:[at];
   circuit.wires.push(Game.wire(id,to,pin,output));
  });
  return to;
 }
 return {circuit,add,feed};
}
function mirrorReader(){
 const {circuit,add,feed}=wiring();
 const x=add('x','IN8',20,40,'X'),y=add('y','IN8',20,145,'Y');
 const mask=add('mask','IN16',20,250,'镜面位图'),flips=add('flips','IN16',20,355,'朝向位图');
 const y2=feed(add('y2','SHL8',230,145),y),y4=feed(add('y4','SHL8',430,145),y2);
 const address=feed(add('address','OR8',630,80,'索引 Y×4+X'),y4,x);
 const bits=feed(add('addr-bits','SPLIT8',840,80,'地址位'),address);
 for(const [lane,input,name] of [[0,mask,'有镜面'],[1,flips,'反斜镜']]){
  const base=lane*700;
  const split=feed(add('tile-'+lane,'SPLIT16',1050,base+205),input);
  let layer=Array.from({length:16},(_,i)=>[split,i]);
  for(let stage=0;stage<4;stage++){
   const next=[];
   for(let i=0;i<layer.length;i+=2){
    const mux=add(['mux',lane,stage,i].join('-'),'MUX',1260+stage*200,base+80+i*36);
    next.push(feed(mux,layer[i],layer[i+1],[bits,stage]));
   }
   layer=next;
  }
  feed(add('out-'+lane,'OUT',2090,base+80,name),layer[0]);
 }
 return Circuit.encapsulate(circuit,'镜面查表');
}
function reflectLogic(){
 const {circuit,add,feed}=wiring();
 const direction=add('direction','IN8',20,40,'方向'),mirror=add('mirror','IN',20,150,'有镜面');
 const flipped=add('flipped','IN',20,260,'反斜镜');
 const slash=add('slash','CONST',20,370,'斜镜掩码',3),backslash=add('backslash','CONST',20,470,'反斜镜掩码',1);
 const mask=feed(add('mask','MUX8',240,320,'按朝向选掩码'),slash,backslash,flipped);
 const turned=feed(add('turned','XOR8',460,180,'异或转向'),direction,mask);
 const next=feed(add('next','MUX8',680,140,'有镜才反射'),direction,turned,mirror);
 feed(add('output','OUT8',890,140,'新方向'),next);
 return Circuit.encapsulate(circuit,'镜面反射');
}
function motionLogic(){
 const {circuit,add,feed}=wiring();
 const x=add('x','IN8',20,40,'X'),y=add('y','IN8',20,145,'Y'),direction=add('dir','IN8',20,250,'新方向');
 const goal=add('goal','IN8',20,355,'目标行');
 const constants=[0,1,2,3].map((value,i)=>add('const-'+i,'CONST',20,485+i*95,String(i),value));
 const sides=['东','南','西','北'];
 const heading=constants.map((value,i)=>feed(add('heading-'+i,'EQ8',230,485+i*95,'向'+sides[i]),direction,value));
 for(const [start,inc,dec,name,row] of [[x,0,2,'X',40],[y,1,3,'Y',265]]){
  const plus=feed(add('plus-'+name,'ADD8',240,row),start,constants[1]);
  const minus=feed(add('minus-'+name,'SUB8',240,row+100),start,constants[1]);
  const go=feed(add('inc-'+name,'MUX8',465,row),start,plus,heading[inc]);
  const next=feed(add('dec-'+name,'MUX8',690,row+55),go,minus,heading[dec]);
  feed(add('out-'+name,'OUT8',930,row+55,'下个 '+name),next);
 }
 const at=[x,y,x,y].map((coord,i)=>feed(add('edge-'+i,'EQ8',460,485+i*95,sides[i]+'边界'),coord,constants[i<2?3:0]));
 const exits=heading.map((side,i)=>feed(add('exit-'+i,'AND',690,485+i*95,'从'+sides[i]+'出界'),side,at[i]));
 const orA=feed(add('or-a','OR',920,485),exits[0],exits[1]);
 const orB=feed(add('or-b','OR',920,605),exits[2],exits[3]);
 const any=feed(add('any-edge','OR',1140,525),orA,orB);
 feed(add('exit','OUT',1360,525,'出界'),any);
 const matching=feed(add('matching','EQ8',920,760,'目标行匹配'),y,goal);
 const hit=feed(add('hit','AND',1140,700,'向东命中接收器'),exits[0],matching);
 feed(add('received','OUT',1360,700,'命中'),hit);
 return Circuit.encapsulate(circuit,'移动与接收');
}
const reader=mirrorReader(),reflect=reflectLogic(),motion=motionLogic();
const inputIds=['mirror-mask','mirror-flips','goal-row'];
const outputIds=['beam-x','beam-y','beam-dir','beam-done','beam-hit','beam-loop'];
function setInputs(circuit,index,flipMask=maskOf(puzzles[index].flips)){
 const puzzle=puzzles[index],mirrorMask=maskOf(puzzle.mirrors);
 const settings=[mirrorMask,flipMask&mirrorMask,puzzle.goal];
 for(const [i,id] of inputIds.entries()){
  const node=circuit.nodes.find(n=>n.id===id);
  if(node)node.value=settings[i];
 }
 circuit.lightPuzzle=index;
}
function build(){
 const {circuit,add,feed}=wiring();
 const mirrors=add(inputIds[0],'IN16',25,90,'镜面位图'),flips=add(inputIds[1],'IN16',25,220,'朝向位图');
 const goal=add(inputIds[2],'IN8',25,370,'接收器行');
 const x=add('ray-x','REG8',260,85,'X 坐标'),y=add('ray-y','REG8',260,200,'Y 坐标');
 const d=add('ray-direction','REG8',260,315,'方向'),count=add('ray-count','REG8',260,525,'步数');
 const at=feed(add('tile-reader',reader,530,105),x,y,mirrors,flips);
 const aimed=feed(add('reflect',reflect,790,105),d,at,[at,1]);
 const move=feed(add('motion',motion,1050,105),x,y,aimed,goal);
 const done=add('finished','REG',1550,365,'结束锁存'),hit=add('received','REG',1550,475,'接收锁存');
 const loop=add('repeated','REG',1550,585,'超限锁存');
 const active=feed(add('active','NOT',540,440,'继续运行'),done);
 const notExit=feed(add('inside','NOT',1260,320,'棋盘内'),[move,2]);
 const advance=feed(add('advance','AND',810,440,'坐标写使能'),active,notExit);
 feed(x,move,advance);feed(y,[move,1],advance);feed(d,aimed,active);
 const one=add('one','CONST',25,540,'步长 1',1),limit=add('limit','CONST',25,650,'上限 63',63);
 const next=feed(add('increment','ADD8',540,545,'步数加一'),count,one);feed(count,next,active);
 const capped=feed(add('limit-check','EQ8',540,665,'已走 63 步'),count,limit);
 const timedOut=feed(add('timeout','AND',1050,625,'未出界且超限'),capped,notExit);
 const stop=feed(add('stop','OR',1290,500,'结束条件'),[move,2],timedOut);
 feed(done,stop,active);feed(hit,[move,3],active);feed(loop,timedOut,active);
 for(const [i,from] of [x,y,d,done,hit,loop].entries()){
  const label=['显示 X','显示 Y','显示方向','结束','命中','超限'][i];
  feed(add(outputIds[i],i<3?'OUT8':'OUT',1805,55+i*118,label),from);
 }
 setInputs(circuit,0);
 return circuit;
}
function read(net,result){
 if(!net.incoming||!outputIds.every(id=>net.incoming.has(id)))return null;
 const [x,y,direction,done,hit,loop]=outputIds.map(id=>result.inputs(id)[0]);
 if(![x,y,direction].every(v=>Number.isInteger(v)&&v>=0&&v<4)||![done,hit,loop].every(v=>v===0||v===1))return null;
 return {x,y,direction,done,hit,loop};
}
Game.lightWorkshop={puzzles,maskOf,inputIds,outputIds,setInputs,read};
Game.levels.splice(Game.levels.findIndex(l=>l.id==='sandbox'),0,{
 id:'workshop-light',title:'光路解谜板',chapter:'创意工坊',tag:'创意工坊 · 专用数字电路',workshop:'light',
 text:'翻转镜面，把左侧进入的光引到右侧接收器。可逐拍观察坐标和方向寄存器。',build
});
})();
