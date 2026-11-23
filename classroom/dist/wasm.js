(function(root){
'use strict';
// One i32 slot per output pin. ROMs and the current RAM snapshot follow
// those slots in linear memory. The exported function evaluates one phase.
const supported=new Set(('IN IN8 IN16 IN32 BIT CONST OUT OUT8 OUT16 OUT32 REG REG8 REG32 RAM8 ROM16 BUF BUF8 BUF16 BUF32 NAND AND OR NOT NOR XOR XNOR MUX MUX8 ADD8 AND8 OR8 XOR8 NOT8 SUB8 EQ8 LT8 SHL8 SHR8 SPLIT8 JOIN8 SPLIT16 JOIN16').split(' '));
function unsigned(n){
 const bytes=[];do{let b=n&127;n>>>=7;if(n)b|=128;bytes.push(b);}while(n);return bytes;
}
function signed(n){
 const bytes=[];let more;
 do{let b=n&127;n>>=7;more=!((n===0&&!(b&64))||(n===-1&&(b&64)));bytes.push(more?b|128:b);}while(more);
 return bytes;
}
function kernel(steps,incoming){
 if(typeof WebAssembly==='undefined'||steps.length<96||steps.some(s=>!supported.has(s.n.type)))return null;
 const slots=new Map(),layout=new Map(),sources=[],registers=[],rams=[],roms=[];
 let length=0;
 for(const {id,d,n} of steps){
  slots.set(id,length);length+=d.outputs.length*4;
  if(['IN','IN8','IN16','IN32','BIT','CONST'].includes(n.type))sources.push({id,n,width:d.outputs[0].width});
  if(['REG','REG8','REG32'].includes(n.type))registers.push(id);
 }
 for(const {id,n} of steps){
  if(n.type==='ROM16'){layout.set(id,length);roms.push(n);length+=512;}
  if(n.type==='RAM8'){layout.set(id,length);rams.push(id);length+=256;}
 }
 const memory=new WebAssembly.Memory({initial:Math.ceil(length/65536)||1});
 const bytes=new Uint8Array(memory.buffer),words=new Uint32Array(memory.buffer);
 for(const rom of roms){
  const buffer=new DataView(memory.buffer,layout.get(rom.id),512);
  (rom.program||[]).forEach((v,i)=>buffer.setUint16(i*2,v,true));
 }
 const code=[];
 const imm=n=>code.push(0x41,...signed(n));
 function load(address){imm(address);code.push(0x28,2,0);}
 for(const {id,n,d} of steps){
  const t=n.type;
  if(!d.outputs.length||['REG','REG8','REG32','IN','IN8','IN16','IN32','BIT','CONST'].includes(t))continue;
  const pins=incoming.get(id).map(w=>slots.get(w.from)+4*(w.output??0));
  const pin=i=>load(pins[i]);
  for(let i=0;i<d.outputs.length;i++){
   imm(slots.get(id)+4*i);
   if(t.startsWith('BUF'))pin(0);
   else if(t.startsWith('SPLIT')){pin(0);imm(i);code.push(0x76);imm(1);code.push(0x71);}
   else if(t.startsWith('JOIN')){
    pin(0);for(let j=1;j<pins.length;j++){pin(j);imm(j);code.push(0x74,0x72);}
   }else if(t==='MUX'||t==='MUX8'){pin(1);pin(0);pin(2);code.push(0x1b);}
   else if(t==='RAM8'||t==='ROM16'){
    imm(layout.get(id));pin(0);
    if(t==='ROM16'){imm(1);code.push(0x74);}
    code.push(0x6a,t==='ROM16'?0x2f:0x2d,t==='ROM16'?1:0,0);
   }else if(['NOT','NOT8','SHL8','SHR8'].includes(t)){
    pin(0);imm(t==='NOT8'?255:1);code.push(t==='SHL8'?0x74:t==='SHR8'?0x76:0x73);
   }else{
    const opcode={AND:0x71,AND8:0x71,NAND:0x71,OR:0x72,OR8:0x72,NOR:0x72,XOR:0x73,XOR8:0x73,XNOR:0x73,ADD8:0x6a,SUB8:0x6b,EQ8:0x46,LT8:0x49}[t];
    if(opcode===undefined)return null;
    pin(0);pin(1);code.push(opcode);
    if(['NAND','XNOR','NOR'].includes(t)){imm(1);code.push(0x73);}
   }
   if(d.outputs[i].width===8){imm(255);code.push(0x71);}
   code.push(0x36,2,0);
  }
 }
 const section=(id,data)=>[id,...unsigned(data.length),...data];
 const body=[0,...code,0x0b];
 const binary=Uint8Array.from([0,97,115,109,1,0,0,0,
  ...section(1,[1,0x60,0,0]),...section(2,[1,1,109,1,109,2,0,1]),
  ...section(3,[1,0]),...section(7,[1,1,102,0,0]),
  ...section(10,[1,...unsigned(body.length),...body])]);
 const run=new WebAssembly.Instance(new WebAssembly.Module(binary),{m:{m:memory}}).exports.f;
 return (state,overrides)=>{
  for(const {id,n,width} of sources){
   const value=overrides[id]??n.value??0;
   words[slots.get(id)/4]=width===32?value>>>0:value&(2**width-1);
  }
  for(const id of registers)words[slots.get(id)/4]=state[id]??0;
  for(const id of rams)bytes.set(state[id],layout.get(id));
  run();
  const values=Object.create(null);
  for(const {id,d} of steps){
   const start=slots.get(id)/4;
   values[id]=Array.from(words.subarray(start,start+d.outputs.length));
  }
  return {values,inputs:id=>incoming.get(id).map(w=>values[w.from][w.output??0])};
 };
}
root.CircuitWasm={kernel};
if(typeof module!=='undefined')module.exports=root.CircuitWasm;
})(globalThis);
