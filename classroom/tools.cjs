'use strict';
const C=require('./dist/circuit.js');
global.Circuit=C;require('./dist/levels.js');require('./dist/campaign.js');require('./dist/references.js');require('./dist/overture.js');require('./dist/symphony.js');require('./dist/mines32.js');require('./dist/course.js');require('./dist/devices.js');
function execute(tool,request){
 const {circuit,inputs={},state}=request;
 C.validate(circuit);
 const nodes=new Map(circuit.nodes.map(n=>[n.id,n]));
 if(!inputs||typeof inputs!=='object'||Array.isArray(inputs))throw Error('inputs 必须是对象');
 for(const [id,value] of Object.entries(inputs)){
  const n=nodes.get(id);if(!n||!['IN','IN8','IN16','IN32','BIT','CONST'].includes(n.type))throw Error('输入源不存在：'+id);
  const width=C.definition(n).outputs[0].width;if(!Number.isInteger(value)||value<0||value>2**width-1)throw Error('输入超出位宽：'+id);
 }
 const net=C.compile(circuit.nodes,circuit.wires);
 if(tool==='inspect')return {valid:!net.error,error:net.error||null,node:net.node||null,wire:net.wire||null,expandedCount:net.expandedCount||0,nodes:circuit.nodes.map(n=>({id:n.id,label:n.label,type:n.type,inputs:C.definition(n).inputs,outputs:C.definition(n).outputs})),wires:circuit.wires};
 if(net.error)return {valid:false,error:net.error,node:net.node||null,wire:net.wire||null};
 let current=net.initial();
 if(state!==undefined){
  if(!state||typeof state!=='object'||Array.isArray(state))throw Error('state 必须是状态对象');
  if(Object.keys(state).some(k=>!Object.hasOwn(current,k)))throw Error('state 包含未知状态元件');
  for(const key of Object.keys(current)){
   if(!Object.hasOwn(state,key))throw Error('state 缺少 '+key);
   const value=state[key],initial=current[key];
   if(Array.isArray(initial)){if(!Array.isArray(value)||value.length!==256||value.some(v=>!Number.isInteger(v)||v<0||v>255))throw Error('RAM 状态无效');}
   else if(initial&&typeof initial==='object'){
    if(!value||typeof value!=='object'||Array.isArray(value)||Object.entries(value).some(([address,byte])=>!/^(0|[1-9]\d*)$/.test(address)||Number(address)>65535||!Number.isInteger(byte)||byte<0||byte>255))throw Error('32 位机器内存快照无效');
   }else {
    let scope=circuit,node;for(const part of key.split('/')){node=scope.nodes.find(n=>n.id===part);if(node?.type==='CUSTOM')scope=node.spec.circuit;}
    if(!Number.isInteger(value)||value<0||value>(node?.type==='REG'?1:node?.type==='REG32'?0xffffffff:255))throw Error('寄存器状态无效');
   }
  }
  current=C.clone(state);
 }
 const view=r=>({values:Object.fromEntries(circuit.nodes.map(n=>[n.id,r.values[n.id]])),outputs:Object.fromEntries(circuit.nodes.filter(n=>!C.definition(n).outputs.length).map(n=>[n.id,r.inputs(n.id)]))});
 if(tool==='evaluate')return {valid:true,...view(net.evaluate(current,inputs))};
 if(tool==='step'){
  const ticks=request.ticks??1;if(!Number.isInteger(ticks)||ticks<1||ticks>256)throw Error('ticks 必须是 1 至 256');
  const writes=[];let result;
  for(let i=0;i<ticks;i++){result=net.tick(current,inputs);current=result.state;writes.push(...result.writes.map(w=>({...w,tick:i+1})));}
  return {valid:true,ticks,state:current,writes,...view(result)};
 }
 if(tool==='trace'){
  if(!nodes.has(request.target))throw Error('target 元件不存在');
  const visited=new Set(),wires=new Set();
  function walk(id){if(visited.has(id))return;visited.add(id);if(['REG','REG8','REG32'].includes(nodes.get(id).type))return;for(const w of circuit.wires.filter(w=>w.to===id)){wires.add(w.id);walk(w.from);}}
  walk(request.target);return {valid:true,target:request.target,nodes:[...visited],wires:[...wires],boundary:'寄存器停止追踪；自定义元件按外部接口追踪，内部依赖可能被保守包含'};
 }
 if(tool==='test'){
  const level=Game.levels.find(l=>l.id===request.levelId);
  let cases=request.cases,clocked=request.clocked===true;
  if(request.levelId&&!level)throw Error('关卡不存在');
  if(level?.verify){const results=level.verify(net,circuit);return {valid:true,passed:results.filter(r=>r.pass).length,total:results.length,cases:results};}
  if(level){
   if(level.vectors){cases=level.vectors;clocked=!!level.clocked;}
   else if(level.sequence){clocked=true;cases=level.sequence.map(input=>({input:Object.fromEntries(level.inputs.map(id=>[id,input[id]])),expected:{[level.outputs[0]]:input.Q}}));}
   else if(level.expect)cases=Array.from({length:2**level.inputs.length},(_,i)=>{const values=level.inputs.map((_,k)=>(i>>(level.inputs.length-1-k))&1);return {input:Object.fromEntries(level.inputs.map((id,k)=>[id,values[k]])),expected:level.expect(values)};});
   else throw Error('此关卡没有自动测试，请提供 cases 并省略 levelId');
   if(![...(level.inputs||[]),...(level.outputs||[])].every(id=>nodes.has(id)))throw Error('缺少关卡输入输出端口');
  }
  if(!Array.isArray(cases)||!cases.length||cases.length>256)throw Error('cases 需要 1 至 256 项');
  const results=cases.map(test=>{
   // Reuse input validation, but execute the same compiled graph and clock state.
   for(const [id,value] of Object.entries(test.input||{})){const n=nodes.get(id);if(!n||!['IN','IN8','IN16','IN32'].includes(n.type)||!Number.isInteger(value)||value<0||value>2**C.definition(n).outputs[0].width-1)throw Error('测试输入无效');}
   const r=clocked?net.tick(current,test.input):net.evaluate(current,test.input);if(clocked)current=r.state;
   const expected=Array.isArray(test.expected)?Object.fromEntries((level?.outputs||[]).map((id,i)=>[id,test.expected[i]])):test.expected;
   if(!expected||typeof expected!=='object'||!Object.keys(expected).length)throw Error('expected 必须包含输出元件及期望值');
   const actual={};for(const id of Object.keys(expected)){const n=nodes.get(id);if(!n||C.definition(n).outputs.length||!Number.isInteger(expected[id]))throw Error('测试输出无效');actual[id]=r.inputs(id)[0];}
   return {input:test.input,expected,actual,pass:Object.entries(expected).every(([id,v])=>actual[id]===v)};
  });
  return {valid:true,clocked,passed:results.filter(r=>r.pass).length,total:results.length,cases:results};
 }
 throw Error('未知工具');
}
module.exports={execute};
if(require('node:worker_threads').parentPort){const {parentPort,workerData}=require('node:worker_threads');try{parentPort.postMessage({result:execute(workerData.tool,workerData.request)});}catch(e){parentPort.postMessage({error:e.message});}}
