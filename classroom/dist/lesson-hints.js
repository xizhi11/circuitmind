(() => {
 'use strict';
 const panel=$('lesson-hint-dialog'), steps=$('lesson-hint-steps'), further=$('lesson-hint-more');
 const preview=$('lesson-demo'), generate=$('lesson-demo-open');
 const revealed=new Map();
 let active, hints, shown, model, liveDevice, cycle, overrides, candidate;
 let drawing,outputs,trace=[];

 function renderHints(){
  $('lesson-hint-title').textContent=active.title+' · 提示';
  $('lesson-hint-count').textContent='已查看 '+shown+' / '+hints.length+' 层';
  steps.replaceChildren(...hints.slice(0,shown).map(text=>{
   const item=document.createElement('li');item.textContent=text;return item;
  }));
  further.hidden=shown===hints.length;
  generate.hidden=shown<hints.length;
 }
 $('lesson-hint-open').onclick=()=>{
  active=level;hints=Game.lessonGuide.hints(active);shown=revealed.get(active.id)??1;
  renderHints();
  panel.showModal();
 };
 further.onclick=()=>{
  shown++;revealed.set(active.id,shown);renderHints();
  if(further.hidden)generate.focus();
 };
 $('lesson-hint-close').onclick=()=>panel.close();
 panel.addEventListener('close',()=>{
  $('lesson-hint-content').hidden=false;preview.hidden=true;panel.classList.remove('show-demo');
  $('lesson-hint-title').textContent='';
  $('lesson-demo-code').textContent='';$('lesson-demo-summary').textContent='';
  for(const id of ['lesson-demo-inputs','lesson-demo-outputs','lesson-demo-svg'])$(id).replaceChildren();
  candidate=model=liveDevice=drawing=outputs=null;
 });

 function setDiagramFit(fit){
  $('lesson-demo-svg').setAttribute('data-fit',String(fit));
  $('lesson-demo-fit').textContent=fit?'原始大小':'适应画布';
 }
 $('lesson-demo-fit').onclick=()=>setDiagramFit($('lesson-demo-svg').getAttribute('data-fit')!=='true');
 function drawCircuit(board){
  const diagram=$('lesson-demo-svg'),parts=new Map(board.nodes.map(n=>[n.id,{...n,d:Circuit.definition(n)}]));
  const pins=(part,index,right)=>{
   const y=part.y+47+index*16;
   return [part.x+(right?150:0),y];
  };
  diagram.replaceChildren();
  const minX=Math.min(...board.nodes.map(n=>n.x)),minY=Math.min(...board.nodes.map(n=>n.y));
  const height=part=>Math.max(65,46+16*Math.max(part.d.inputs.length,part.d.outputs.length));
  const right=Math.max(...[...parts.values()].map(part=>part.x+150)),bottom=Math.max(...[...parts.values()].map(part=>part.y+height(part)));
  const viewWidth=right-minX+32;
  diagram.setAttribute('viewBox',[minX-16,minY-16,viewWidth,bottom-minY+32].join(' '));
  diagram.style.setProperty('--demo-diagram-width',Math.min(viewWidth,3400)+'px');
  setDiagramFit(window.innerWidth>=741&&viewWidth<=1500);
  const wires=board.wires.map(w=>{
   const [x,y]=pins(parts.get(w.from),w.output??0,true),[tx,ty]=pins(parts.get(w.to),w.pin,false);
   const mid=(x+tx)/2;
   const route=w.points?.map(point=>' L'+point.x+','+point.y).join('')||(' H'+mid+' V'+ty);
   return {wire:w,mark:svg('path',{d:'M'+x+','+y+route+' L'+tx+','+ty},diagram)};
  });
  for(const part of parts.values()){
   const group=svg('g',{'class':'lesson-demo-part'},diagram);
   svg('title',{},group).textContent=part.label+' · '+part.type;
   svg('rect',{x:part.x,y:part.y,width:150,height:height(part),rx:5},group);
   svg('text',{x:part.x+8,y:part.y+22},group).textContent=(part.label||part.type).slice(0,12);
   for(const [list,rightSide] of [[part.d.inputs,false],[part.d.outputs,true]]){
    list.forEach((port,i)=>{
     const [x,y]=pins(part,i,rightSide);
     svg('circle',{cx:x,cy:y,r:3},group);
     svg('text',{x:x+(rightSide?-6:6),y:y+3,'text-anchor':rightSide?'end':'start','class':'lesson-demo-pin'},group).textContent=port.name.slice(0,7);
    });
   }
  }
  return wires;
 }
 const signalText=(value,width)=>value===null?'Z':value==='X'||value===undefined?'X':width===1?String(value):'0x'+value.toString(16).toUpperCase().padStart(width/4,'0');
 function renderSignals(){
  const signals=liveDevice?{...overrides,input:liveDevice.input}:overrides;
  const result=model.evaluate(modelState,signals);
  for(const {wire,mark} of drawing){
   const value=result.values[wire.from]?.[wire.output??0];
   mark.setAttribute('data-signal',value===null?'z':value==='X'?'x':value?'on':'off');
  }
  for(const {part,field} of outputs)field.textContent=signalText(result.inputs(part.id)[0],Circuit.definition(part).inputs[0].width);
  $('lesson-demo-summary').textContent='周期 '+cycle+' · '+candidate.nodes.length+' 个元件 · '+candidate.wires.length+' 条连线'+
   (trace.length?' · 已输出 '+trace.slice(-12).join('、'):'');
  $('lesson-demo-device').hidden=!liveDevice;
  if(liveDevice)$('lesson-demo-device').textContent=liveDevice.describe();
  $('lesson-demo-step').disabled=!!liveDevice?.done;
 }
 let modelState;
 function reset(){
  modelState=model.initial();cycle=0;trace=[];
  liveDevice=active.createDevice?.(0);
  if(active.id==='cm8-loop')modelState.ram[0]=4;
  renderSignals();
 }
 generate.onclick=()=>{
  const failure=$('lesson-demo-error');
  failure.textContent='';
  try{
   candidate=Game.lessonGuide.example(active);
   model=Circuit.compile(candidate.nodes,candidate.wires);
   if(model.error)throw Error(model.error);
   stop();
   drawing=drawCircuit(candidate);overrides={};
   const inputs=$('lesson-demo-inputs');inputs.replaceChildren();
   for(const part of candidate.nodes.filter(n=>/^IN(?:8|16|32)?$/.test(n.type)&&(!active.createDevice||n.id!=='input'))){
    const width=Circuit.definition(part).outputs[0].width,max=2**width-1;
    const name=document.createElement('label');name.textContent=part.label||part.id;
    const input=document.createElement('input');input.type='number';input.min='0';input.max=String(max);
    input.value=String(part.value||0);input.step='1';
    input.oninput=()=>{
     const value=input.valueAsNumber;
     if(Number.isInteger(value)&&value>=0&&value<=max){
      overrides[part.id]=value;renderSignals();
     }
    };
    name.append(input);inputs.append(name);
   }
   const readout=$('lesson-demo-outputs');readout.replaceChildren();
   outputs=candidate.nodes.filter(n=>/^OUT(?:8|16|32)?$/.test(n.type)).map(part=>{
    const pair=document.createElement('div'),name=document.createElement('span'),field=document.createElement('output');
    name.textContent=part.label||part.id;pair.append(name,field);readout.append(pair);
    return {part,field};
   });
   $('lesson-demo-code').textContent=candidate.source||active.program||'';
   $('lesson-demo-program').hidden=!$('lesson-demo-code').textContent;
   reset();
   $('lesson-hint-content').hidden=true;preview.hidden=false;panel.classList.add('show-demo');
   $('lesson-demo-back').focus();
  }catch(error){
   failure.textContent='无法打开示范：'+error.message;
  }
 };
 $('lesson-demo-step').onclick=()=>{
  try{
   const inputs=liveDevice?{...overrides,input:liveDevice.input}:overrides;
   const prior=model.evaluate(modelState,inputs);
   if(model.incoming.has('strobe')&&model.incoming.has('output')&&prior.inputs('strobe')[0]){
    const value=prior.inputs('output')[0];liveDevice?.write(value);trace.push(value);
   }
   const next=model.tick(modelState,inputs);
   if(!active.machine)for(const write of next.writes)if(write.address===255&&write.id==='ram')trace.push(write.value);
   if(trace.length>100)trace.splice(0,trace.length-100);
   modelState=next.state;cycle++;renderSignals();
  }catch(error){
   $('lesson-demo-summary').textContent=error.message;
  }
 };
 $('lesson-demo-reset').onclick=reset;
 $('lesson-demo-back').onclick=()=>{
  preview.hidden=true;$('lesson-hint-content').hidden=false;panel.classList.remove('show-demo');generate.focus();
 };
})();
