(function(root){
const node=(id,type,x,y,label,value=0)=>({id,type,x,y,label:label||type,value});
const wire=(from,to,pin,output=0)=>({id:from+'-'+output+'-'+to+'-'+pin,from,to,pin,output});
function terminals(names,outs){
 return {nodes:[...names.map((s,i)=>node(s,'IN',90,105+i*110,s)),...outs.map((s,i)=>node(s,'OUT',920,180+i*180,s))],wires:[]};
}
const levels=[
 {id:'nand',title:'最初的 NAND',tag:'01 · 逻辑起点',text:'连接 A、B 到 NAND，再把结果接到 Q。只有两个输入都是 1，输出才为 0。',
 inputs:['A','B'],outputs:['Q'],allowed:['NAND'],expect:([a,b])=>[1-(a&b)],build:()=>terminals(['A','B'],['Q'])},
 {id:'not',title:'翻转一个比特',tag:'02 · 从 NAND 推导',text:'只用一个 NAND 实现 NOT。试着把 A 同时连接到两个输入。',
 inputs:['A'],outputs:['Q'],allowed:['NAND'],expect:([a])=>[1-a],build:()=>terminals(['A'],['Q'])},
 {id:'and',title:'让两个条件同时成立',tag:'03 · 组合逻辑',text:'只用 NAND 搭出 AND。先观察 NAND 的输出，再想办法翻转一次。',
 inputs:['A','B'],outputs:['Q'],allowed:['NAND'],expect:([a,b])=>[a&b],build:()=>terminals(['A','B'],['Q'])},
 {id:'xor',title:'相同为零，不同为一',tag:'04 · 逻辑组合',text:'用元件实现 XOR。可以直接试验 XOR，也可以挑战只用 NAND。',
 inputs:['A','B'],outputs:['Q'],allowed:['NAND','AND','OR','NOT','XOR'],expect:([a,b])=>[a^b],build:()=>terminals(['A','B'],['Q'])},
 {id:'half',title:'半加器',tag:'05 · 迈向算术',text:'将两个一位数相加。S 是和的低位，C 是进位。分别连接两个输出。',
 inputs:['A','B'],outputs:['S','C'],allowed:['NAND','AND','OR','NOT','XOR'],expect:([a,b])=>[a^b,a&b],build:()=>terminals(['A','B'],['S','C'])},
 {id:'full',title:'全加器维修站',tag:'06 · 诊断实验',text:'这里有一份进位支路接错的电路。定位首个失败输入，修复后通过全部八组测试。',
 inputs:['A','B','Cin'],outputs:['S','C'],allowed:['NAND','AND','OR','NOT','XOR'],expect:([a,b,c])=>[(a+b+c)&1,Number(a+b+c>=2)],build:()=>fullAdder(true)},
 {id:'register',title:'记住上一拍',tag:'07 · 时序逻辑',text:'把 D 和 EN 接到寄存器。EN 为 1 时，在下一拍保存 D；EN 为 0 时保持。改变输入后再点“下一拍”观察。',
 inputs:['D','EN'],outputs:['Q'],allowed:['IN','REG','NOT','NAND'],sequence:[{D:1,EN:1,Q:1},{D:0,EN:0,Q:1},{D:0,EN:1,Q:0},{D:1,EN:0,Q:0}],
 build:()=>{const d=terminals(['D','EN'],['Q']);d.nodes.push(node('reg','REG',470,220,'一位寄存器'));return d;}},
 {id:'counter',title:'八位计数器',tag:'08 · 状态与反馈',text:'运行已接好的计数器。REG8 的旧值经过加一，再在每拍写回。组合环通过寄存器被隔开。',
 build:()=>({nodes:[node('one','CONST',230,100,'步长',1),node('enable','IN',230,450,'EN',1),node('r','REG8',560,230,'计数寄存器'),node('add','ADD8',350,230,'加一'),node('q','OUT8',850,230,'计数')],
 wires:[wire('r','add',0),wire('one','add',1),wire('add','r',0),wire('enable','r',1),wire('r','q',0)]})},
 {id:'sandbox',title:'自由实验室',tag:'自由搭建',text:'搭建自己的组合或时序电路。8 位端口需要连接 8 位总线。RAM 的写操作在下一拍提交。',
 build:()=>({nodes:[node('a','IN',100,160,'A'),node('q','OUT',920,160,'Q')],wires:[]})},
 {id:'cpu',title:'让电路执行程序',tag:'09 · CM8 计算机',text:'这台参考计算机由 PC、ROM、译码器、ALU、ACC 和 RAM 连接而成。点击汇编加载，再单步观察；ST 255 将 ACC 的值写入终端。',
 build:cpu,program:'; 65 是字符 A\nLDI 65\nloop:\nST 255\nADD 1\nJMP loop'}
];
function fullAdder(broken=false){
 const d=terminals(['A','B','Cin'],['S','C']);
 d.nodes.push(node('x','XOR',310,100,'A XOR B'),node('s','XOR',650,110,'求和'),node('g','AND',310,350,'第一路进位'),node('p',broken?'OR':'AND',500,270,'第二路进位'),node('o','OR',720,350,'合并进位'));
 d.wires=[wire('A','x',0),wire('B','x',1),wire('x','s',0),wire('Cin','s',1),wire('s','S',0),wire('A','g',0),wire('B','g',1),wire('x','p',0),wire('Cin','p',1),wire('g','o',0),wire('p','o',1),wire('o','C',0)];
 return d;
}
function cpu(){
 const d={nodes:[node('pc','REG8',80,120,'PC'),node('rom','ROM16',270,120,'程序 ROM'),
 node('ctrl','CONTROL',470,110,'指令译码'),node('acc','REG8',940,390,'ACC'),
 node('alu','ALU8',700,290,'ALU'),node('ram','RAM8',700,550,'RAM · 256 B'),node('result','MUX8',920,550,'写回选择'),
 node('one','CONST',80,410,'常数 1',1),node('inc','ADD8',270,390,'PC + 1'),node('branch','MUX8',270,550,'跳转选择'),
 node('output','OUT8',1130,390,'ACC 观察')],wires:[]};
 const w=(a,b,p,o=0)=>d.wires.push(wire(a,b,p,o));
 w('pc','rom',0);w('rom','ctrl',0);w('acc','ctrl',1);
 w('acc','alu',0);w('ctrl','alu',1,0);w('ctrl','alu',2,1);
 w('alu','result',0);w('ram','result',1);w('ctrl','result',2,5);
 w('result','acc',0);w('ctrl','acc',1,2);
 w('ctrl','ram',0,0);w('acc','ram',1);w('ctrl','ram',2,4);
 w('pc','inc',0);w('one','inc',1);w('inc','branch',0);w('ctrl','branch',1,0);w('ctrl','branch',2,3);
 w('branch','pc',0);w('ctrl','pc',1,6);w('acc','output',0);
 d.nodes.find(n=>n.id==='rom').program=Circuit.assemble(levels.find(l=>l.id==='cpu').program).words;
 return d;
}
function minesProgram(){
 let text='; 3×3 固定雷区，中心为雷。规则在此程序中执行。\npoll:\nLD 254\nJZ poll\nST 253\nLDI 0\nST 254\n';
 for(let i=0;i<9;i++)text+='LD 253\nSUB '+(i+1)+'\nJZ cell'+i+'\n';
 text+='JMP poll\n';
 for(let i=0;i<9;i++){
  text+='cell'+i+':\nLD '+(32+i)+'\nJZ reveal'+i+'\nJMP poll\nreveal'+i+':\n';
  if(i===4)text+='LDI 42\nST 36\nLDI 1\nST 250\nHLT\n';
  else text+='LDI 49\nST '+(32+i)+'\nLD 252\nADD 1\nST 252\nSUB 8\nJZ victory\nJMP poll\n';
 }
 return text+'victory:\nLDI 2\nST 250\nHLT\n';
}
levels.push({id:'mines',title:'CPU 上的迷你扫雷',tag:'10 · 应用运行',text:'点击九宫格发出输入事件，再运行电路。CPU 程序负责揭格、计数和输赢。固定布局用于核对指令轨迹，中心格是雷。',
 program:minesProgram(),build:()=>{const d=cpu();d.nodes.find(n=>n.id==='rom').program=Circuit.assemble(minesProgram()).words;return d;}});
root.Game={levels,node,wire,fullAdder};
})(globalThis);

