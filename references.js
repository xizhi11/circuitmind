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
