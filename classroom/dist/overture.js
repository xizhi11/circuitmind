(function () {
'use strict';
// Each pattern describes one byte on the ROM bus. d/s are destination/source
// selectors, i is an unsigned integer or a label. The decoder is independent.
const defaultRules = [
 'IMM 00iiiiii', 'MOV 10dddsss', 'NAND 01000000', 'OR 01000001',
 'AND 01000010', 'NOR 01000011', 'ADD 01000100', 'SUB 01000101',
 'NOP 11000000', 'JMP 11000001', 'JZ 11000010', 'JNZ 11000011',
 'JL 11000100', 'JGE 11000101', 'JLE 11000110', 'JG 11000111'
].join('\n');

function parseRules(source) {
 const rules = new Map();
 for (const line of source.split(/\r?\n/)) {
  const text = line.split(';')[0].trim();
  if (!text) continue;
  const match = /^(\w+)\s+([01ids]{8})$/i.exec(text);
  if (!match) throw Error('编码规则需要一个指令名和八位编码，例如 MOV 10dddsss');
  const name = match[1].toUpperCase(), bits = match[2].toLowerCase();
  if (rules.has(name) || name === 'DB') throw Error('指令名重复或保留：' + name);
  const fields = [...new Set([...bits].filter(c => 'ids'.includes(c)))];
  for (const field of fields) {
   if (field !== 'i' && [...bits].filter(c => c === field).length !== 3) throw Error('寄存器字段需要三位');
  }
  for (const old of rules.values()) {
   if (![...bits].some((c,i) => /[01]/.test(c) && /[01]/.test(old.bits[i]) && c !== old.bits[i]))
    throw Error('指令编码重叠：' + name + '、' + old.name);
  }
  rules.set(name,{name,bits,fields});
 }
 if (!rules.size) throw Error('请填写至少一条指令编码规则');
 return rules;
}
function assemble(source, spec = defaultRules) {
 const rules = parseRules(spec), labels = new Map(), rows = [];
 for (const [index,line] of source.split(/\r?\n/).entries()) {
  let text = line.split(';')[0].trim();
  const label = /^([a-z_]\w*):/i.exec(text);
  if (label) {
   if (labels.has(label[1])) throw Error('标签重复：' + label[1]);
   labels.set(label[1],rows.length);
   text = text.slice(label[0].length).trim();
  }
  if (text) rows.push({text,line:index+1});
 }
 if (rows.length > 256) throw Error('程序 ROM 最多装入 256 字节');
 const words = rows.map(({text,line}) => {
  const [mnemonic,...args] = text.split(/[\s,]+/), name = mnemonic.toUpperCase();
  const fail = msg => { throw Error('第 ' + line + ' 行：' + msg); };
  const raw = name === 'DB';
  const rule = raw ? {bits:'iiiiiiii',fields:['i']} : rules.get(name);
  if (!rule) fail('未知指令 ' + name);
  if (args.length !== rule.fields.length) fail('操作数数量错误');
  const fields = {};
  rule.fields.forEach((field,index) => {
   const arg = args[index], width = [...rule.bits].filter(c=>c===field).length;
   let value;
   if (field === 'i') value = labels.has(arg) ? labels.get(arg) : Number(arg);
   else if (/^r[0-5]$/i.test(arg)) value = Number(arg[1]);
   else if (arg.toUpperCase() === (field === 'd' ? 'OUT' : 'IN')) value = 6;
   if (!Number.isInteger(value) || value < 0 || value >= 2**width) fail('操作数不适用于字段 ' + field + '：' + arg);
   fields[field] = value.toString(2).padStart(width,'0').split('');
  });
  return parseInt([...rule.bits].map(c=>fields[c] ? fields[c].shift() : c).join(''),2);
 });
 return {words,lines:rows.map(r=>r.line)};
}
function disassemble(word,rules) {
 for (const {name,bits,fields} of rules.values()) {
  const binary = word.toString(2).padStart(8,'0');
  if ([...bits].some((c,i)=>/[01]/.test(c) && c!==binary[i])) continue;
  const args = fields.map(field=>{
   const value = parseInt([...bits].map((c,i)=>c===field?binary[i]:'').join(''),2);
   if (field === 'i') return value;
   return value === 6 ? (field==='s'?'IN':'OUT') : 'R'+value;
  });
  return [name,args.join(', ')].join(' ').trim();
 }
 return 'DB '+word;
}

// The machine below is a netlist. All six registers and the PC sample
// simultaneously in Circuit.tick; no JavaScript instruction dispatcher runs it.
function wiring() {
 const board = {nodes:[],wires:[]};
 function add(id,type,label,...pins) {
  const i=board.nodes.length;
  board.nodes.push(Game.node(id,type,80+(i%7)*205,60+Math.floor(i/7)*200,label));
  pins.forEach((pin,j)=>connect(pin,id,j));
  return id;
 }
 function connect(pin,id,index) {
  const [from,out=0]=Array.isArray(pin)?pin:[pin];
  board.wires.push(Game.wire(from,id,index,out));
 }
 return {board,add,connect};
}
function machine(source) {
 const {board,add,connect}=wiring();
 add('pc','REG8','PC');
 add('rom','ROM16','程序 ROM','pc');
 board.nodes[1].program=assemble(source).words;
 add('word','SPLIT16','指令字段','rom');
 add('input','IN8','输入端口');
 for(let i=0;i<6;i++) add('r'+i,'REG8','R'+i);
 add('low','BIT','0'); add('high','BIT','1');
 board.nodes.find(n=>n.id==='high').value=1;
 add('zero','CONST','零');add('one','CONST','步长');
 board.nodes.find(n=>n.id==='one').value=1;
 const bit=i=>['word',i];
 function group(name,offset,count) {
  return add(name,'JOIN8',name,...Array.from({length:8},(_,i)=>i<count?bit(offset+i):'low'));
 }
 group('imm6',0,6);
 const not6=add('not6','NOT','低半区',bit(6)),not7=add('not7','NOT','非传送区',bit(7));
 add('immediate','AND','立即数写回',not6,not7);
 add('compute','AND','运算写回',bit(6),not7);
 add('move','AND','数据传送',not6,bit(7));
 add('branch','AND','条件指令',bit(6),bit(7));
 function select(name,options,offset,type='MUX8') {
  let layer=options;
  for(let b=0;layer.length>1;b++) {
   const next=[];
   for(let i=0;i<layer.length;i+=2) next.push(add(name+'-'+b+'-'+i,type,name,layer[i],layer[i+1],bit(b+offset)));
   layer=next;
  }
  return layer[0];
 }
 const src=select('读寄存器',['r0','r1','r2','r3','r4','r5','input','zero'],0);
 const and=add('and','AND8','与','r1','r2'),or=add('or','OR8','或','r1','r2');
 const alu=select('ALU',[add('nand','NOT8','与非',and),or,and,add('nor','NOT8','或非',or),
  add('add','ADD8','加','r1','r2'),add('sub','SUB8','减','r1','r2'),'zero','zero'],0);
 const write=add('writeMux','MUX8','传送 / 运算',src,alu,'compute');
 const data=add('data','MUX8','写回总线',write,'imm6','immediate');
 group('destination',3,3);
 for(let i=0;i<=6;i++) {
  const literal=add('index'+i,'CONST','编号 '+i);
  board.nodes.at(-1).value=i;
  const match=add('match'+i,'EQ8','选择 '+i,'destination',literal);
  let enable=add('we'+i,'AND','写使能 '+i,match,'move');
  if(i===6) {add('strobe','OUT','输出有效',enable);break;}
  if(i===0||i===3) enable=add('special'+i,'OR','专用写回 '+i,enable,i===0?'immediate':'compute');
  connect(data,'r'+i,0);connect(enable,'r'+i,1);
 }
 add('output','OUT8','输出字节',src);
 const eq=add('eq','EQ8','R3 等于零','r3','zero');
 add('sign','SPLIT8','R3 符号位','r3');
 const neg=['sign',7], ne=add('ne','NOT','非零',eq), ge=add('ge','NOT','非负',neg);
 const le=add('le','OR','非正',eq,neg),gt=add('gt','NOT','正数',le);
 const condition=select('条件',['low','high',eq,ne,neg,ge,le,gt],0,'MUX');
 const take=add('take','AND','跳转使能',condition,'branch');
 const inc=add('inc','ADD8','下一地址','pc','one');
 const address=add('address','MUX8','取指地址',inc,'r0',take);
 connect(address,'pc',0);connect('high','pc',1);
 board.source=source;board.isa=defaultRules;
 return board;
}
const example='IMM 32\nMOV R1, R0\nIMM 33\nMOV R2, R0\nADD\nMOV OUT, R3\nIMM end\nend: JMP';
const chapter='07 字节寄存器机';
const guide='R0 接收六位立即数和跳转目标。ALU 读取 R1、R2，写回 R3。MOV 先写目的端，再写来源。IN 和 OUT 通过 MOV 访问。';
function mission(id,title,text,examples,starter='; 在这里写程序\nNOP') {
 return {id,title,chapter,tag:'Overture · 单字节指令',machine:'overture',text,program:starter,
  build:()=>machine(starter),verify:net=>examples.map(([input,expected])=>{
   let state=net.initial(),actual=[];
   // Input is a stable external byte. Capture output on the write edge,
   // before the PC advances to the next instruction.
   for(let cycle=0;cycle<80;cycle++) {
    const before=net.evaluate(state,{input});
    if(before.inputs('strobe')[0]) actual.push(before.inputs('output')[0]);
    state=net.tick(state,{input}).state;
   }
   return {input:{IN:input,周期:80},expected,actual,replay:{inputs:{input},steps:80},pass:actual.length===expected.length&&actual.every((v,i)=>v===expected[i])};
  })};
}
const byteMachine={id:'overture',title:'六寄存器计算机',chapter,tag:'可拆线的 Overture 数据通路',machine:'overture',text:guide,program:example,build:()=>machine(example)};
const missions=[
 byteMachine,
 mission('o8-binary','直接写机器码','只用 DB 字节也能编程。将 42 写入 R0，然后从 OUT 发送一次。后续周期保持输出有效线关闭。',[[0,[42]]],'DB 0b00000000\nDB 0b10110000'),
 mission('o8-echo','寄存器与端口','把 IN 的原字节送至 OUT，依次通过四组独立复位的输入。',[[0,[0]],[17,[17]],[128,[128]],[255,[255]]]),
 mission('o8-double','算术写回','输出 IN 的两倍，超过 255 的部分舍去。先安排 R1 和 R2 的来源。',[[0,[0]],[9,[18]],[128,[0]],[200,[144]]]),
 mission('o8-branch','按符号分流','将输入看作八位补码。负数输出 1，其余输出 0，每次运行只输出一个字节。',[[0,[0]],[1,[0]],[127,[0]],[128,[1]],[255,[1]]]),
 mission('o8-repeat','循环倒计数','输入 1 至 5，依次输出从输入值到 1 的每个字节。用标签和 JNZ 构造循环。',[[1,[1]],[3,[3,2,1]],[5,[5,4,3,2,1]]])
];
Game.levels.splice(Game.levels.findIndex(l=>l.id==='sandbox'),0,...missions);
const previous=Game.isComputer;Game.isComputer=l=>l.machine==='overture'||previous(l);
Game.overture={defaultRules,parseRules,assemble,disassemble,machine};
})();
