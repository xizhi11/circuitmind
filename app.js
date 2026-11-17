'use strict';
const $=id=>document.getElementById(id);
const {types,definition,compile,clone,validate}=Circuit;
const board=$('board'),scene=$('scene');
let level=Game.levels[0],doc,net,state,values={},selected=null,pending=null,drag=null;
let timer=null,ticks=0,history=[],future=[],records=[],focused=null,testCases=[],testIndex=-1,terminal='';
let camera={x:0,y:0,scale:1},serial=0;
let inspectionStack=[],multi=new Set(),clipboard=null;
let completed={},saved={},library=[],breakpoints=new Set();
let storageDatabase=null;
try{completed=JSON.parse(localStorage.getItem('cm-completed')||'{}');saved=JSON.parse(localStorage.getItem('cm-circuits')||'{}');library=JSON.parse(localStorage.getItem('cm-library')||'[]');if(!Array.isArray(library))library=[];}catch{}
function persist(){try{
 if(!inspectionStack.length)saved[level.id]=clone(doc);
 const last=inspectionStack.length?inspectionStack[0].levelId:level.id;
 if(storageDatabase){
  const tx=storageDatabase.transaction('save','readwrite');tx.objectStore('save').put({saved,completed,library,last},'profile');
  tx.onerror=()=>notify('浏览器存储失败，请备份全部进度到文件。');
 }else{localStorage.setItem('cm-circuits',JSON.stringify(saved));localStorage.setItem('cm-completed',JSON.stringify(completed));localStorage.setItem('cm-library',JSON.stringify(library));localStorage.setItem('cm-last-level',last);}
 }catch{notify('浏览器存储空间不足，请备份全部进度到文件。');}}
function notify(text){$('toast').textContent=text;$('toast').classList.add('show');clearTimeout(notify.timeout);notify.timeout=setTimeout(()=>$('toast').classList.remove('show'),3500);}
function svg(tag,attrs={},parent=scene){const el=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v] of Object.entries(attrs))el.setAttribute(k,String(v));parent.append(el);return el;}
function button(text,action,className=''){const b=document.createElement('button');b.textContent=text;b.className=className;b.onclick=action;return b;}
function checkpoint(){history.push(clone(doc));if(history.length>60)history.shift();future=[];}
function stop(){clearInterval(timer);timer=null;$('run').textContent='▶ 运行';}
function compileCurrent(reset=true){
 net=compile(doc.nodes,doc.wires);
 if(reset){ticks=0;records=[];terminal='';state=net.error?{}:net.initial();}
 if(!net.error)values=net.evaluate(state).values;else values={};
}
function edit(){stop();focused=null;testCases=[];testIndex=-1;compileCurrent();persist();draw();renderTests();renderTrace();}
function openLevel(id,fresh=false,keepContext=false){
 if(!keepContext)inspectionStack=[];multi.clear();
 stop();level=Game.levels.find(l=>l.id===id)||Game.levels[0];
 doc=clone(!fresh&&saved[level.id]?saved[level.id]:level.build());
 try{validate(doc);}catch{doc=level.build();}
 selected=null;pending=null;focused=null;history=[];future=[];testCases=[];testIndex=-1;
 compileCurrent();camera={x:0,y:0,scale:1};
 $('tag').textContent=level.tag;$('title').textContent=level.title;$('description').textContent=level.text;
 breakpoints.clear();
 $('program-panel').hidden=!Game.isComputer(level);$('program').value=doc.source||level.program||'';
 $('test').disabled=!level.expect&&!level.sequence&&!level.vectors&&!level.verify;
 $('test-title').textContent=Game.isComputer(level)?'机器与终端':level.id==='sandbox'||level.id==='counter'?'电路状态':'验证你的电路';
 $('hint').textContent=Game.isComputer(level)?'ROM 取指 → 译码 → ALU / RAM → 写回 ACC。每一拍会同时更新 PC 和 ACC。':level.text;
 $('mines-panel').hidden=level.id!=='mines';
 renderNav();renderPalette();draw();renderTests();renderTrace();
}
function renderNav(){
 $('levels').replaceChildren();
 let chapter='';
 for(const l of Game.levels){
  if(l.chapter!==chapter){chapter=l.chapter;const h=document.createElement('h3');h.textContent=chapter;h.className='chapter-title';$('levels').append(h);}
  const b=button((completed[l.id]?'✓ ':'')+l.title,()=>openLevel(l.id),l.id===level.id?'active':'');
  b.setAttribute('aria-current',l.id===level.id?'page':'false');$('levels').append(b);
 }
 const count=Game.levels.filter(l=>l.expect||l.sequence||l.vectors||l.verify).length;
 $('progress').textContent=Game.levels.filter(l=>completed[l.id]&&(l.expect||l.sequence||l.vectors||l.verify)).length+' / '+count+' 项实验已验证';
}
function renderPalette(){
 $('palette').replaceChildren();
 const allowed=level.allowed||Object.keys(types).filter(t=>!['BUF','BUF8','BUF16'].includes(t));
 for(const type of allowed){
  const b=button('+ '+type,()=>{
   checkpoint();const id='n'+Date.now()+'-'+serial++;
   const offset=(doc.nodes.length%6)*25;
   doc.nodes.push(Game.node(id,type,390+offset,220+offset,type));
   multi.clear();selected=id;edit();
  });b.title=definition({type}).inputs.map(p=>p.name+' '+p.width+' 位').join('，')||'输入信号源';$('palette').append(b);
 }
 if(library.length){
  const label=document.createElement('span');label.className='library-label';label.textContent='我的元件';$('palette').append(label);
  for(const spec of library){const b=button('◈ '+spec.name,()=>{
   checkpoint();const id='custom'+Date.now()+'-'+serial++;
   doc.nodes.push({...Game.node(id,'CUSTOM',400,180,spec.name),spec:clone(spec)});multi.clear();selected=id;edit();
  });b.title=spec.inputs.map(p=>p.name+':'+p.width).join(' / ')+' → '+spec.outputs.map(p=>p.name+':'+p.width).join(' / ');$('palette').append(b);}
 }
 filterPalette();
}
function filterPalette(){const query=$('component-search').value.trim().toLowerCase();for(const child of $('palette').children)if(child.tagName==='BUTTON')child.hidden=!!query&&!((child.textContent+' '+child.title).toLowerCase().includes(query));}
$('component-search').oninput=filterPalette;
$('tool-check').onclick=async()=>{
 if(location.hostname.endsWith('.github.io')){notify('当前为 GitHub Pages 游戏版。导师 API 尚未部署，电路搭建与本地仿真可正常使用。');return;}
 const control=$('tool-check');control.disabled=true;
 try{
  const payload={circuit:clone(doc)},tool=level.expect||level.sequence||level.vectors||level.verify?'test':'inspect';
  if(tool==='test')payload.levelId=level.id;
  const response=await fetch('/api/tools/'+tool,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});
  const result=await response.json();if(!response.ok)throw Error(result.error||'接口请求失败');
  const evidence={levelId:level.id,tick:ticks,tool,result};
  if(result.error){$('hint').textContent='后端仿真检查：'+result.error;if(result.node)selected=result.node;draw();}
  else if(tool==='test'){$('hint').textContent='后端测试通过 '+result.passed+' / '+result.total+'。'+(result.passed===result.total?'全部用例符合预期。':'存在失败用例，已下载真实测试证据。');}
  else $('hint').textContent='后端结构检查通过，展开 '+result.expandedCount+' 个基础元件。';
  download(evidence,'CircuitMind-evidence.json');notify('已调用本机仿真 API；这一步尚未调用 AI 导师');
 }catch(e){notify('工具调用失败：'+e.message+'。请通过 start.cmd 打开游戏。');}finally{control.disabled=false;}
};
$('reference-library').onclick=()=>{let added=0;for(const spec of Game.references||[])if(!library.some(s=>s.name===spec.name)){library.push(clone(spec));added++;}persist();renderPalette();notify('已加入 '+added+' 份可逐层打开的参考电路');};
$('focus-editor').onclick=()=>{document.body.classList.toggle('editor-focus');$('focus-editor').textContent=document.body.classList.contains('editor-focus')?'退出专注':'专注搭建';};
function nodeHeight(n){return Math.max(74,38+Math.max(definition(n).inputs.length,definition(n).outputs.length)*23);}
function portPosition(n,index,output){return [n.x+(output?146:0),n.y+42+index*23];}
function wireValue(w){return values[w.from]?.[w.output??0];}
function sourceOf(id,pin){return doc.wires.find(w=>w.to===id&&w.pin===pin);}
function fmt(v,width=1){return v===undefined?'—':width>1?'0x'+v.toString(16).toUpperCase().padStart(width===16?4:2,'0'):String(v);}
function draw(){
 $('back-circuit').hidden=!inspectionStack.length;
 scene.replaceChildren();scene.setAttribute('transform',`translate(${camera.x} ${camera.y}) scale(${camera.scale})`);
 const nodes=new Map(doc.nodes.map(n=>[n.id,n])),traced=new Set(),visited=new Set();
 function trace(id){if(visited.has(id))return;visited.add(id);for(const w of doc.wires.filter(w=>w.to===id)){traced.add(w.id);if(!['REG','REG8'].includes(nodes.get(w.from)?.type))trace(w.from);}}
 if(focused)trace(focused);
 for(const w of doc.wires){
  const a=nodes.get(w.from),b=nodes.get(w.to);if(!a||!b)continue;
  const [x,y]=portPosition(a,w.output??0,true),[tx,ty]=portPosition(b,w.pin,false);
  const bend=tx>x+30?(tx+x)/2:Math.max(x,tx)+38;
  const path=`M${x},${y} H${bend} V${ty} H${tx}`,value=wireValue(w);
  const cls=`wire ${value?'high':''} ${selected===w.id?'selected':''} ${traced.has(w.id)?'traced':''}`;
  const hit=svg('path',{d:path,class:'wire-hit'});hit.addEventListener('pointerdown',e=>e.stopPropagation());hit.onclick=e=>{e.stopPropagation();multi.clear();selected=w.id;draw();};
  svg('path',{d:path,class:cls});
  if(value){const dot=svg('circle',{r:3.2,class:'signal-dot'});svg('animateMotion',{path,dur:Math.max(.7,(Math.abs(tx-x)+Math.abs(ty-y))/190)+'s',repeatCount:'indefinite'},dot);}
  if(selected===w.id)svg('text',{x:(x+tx)/2,y:(y+ty)/2-9,class:'wire-label'}).textContent=fmt(value,definition(a).outputs[w.output??0]?.width);
 }
 for(const n of doc.nodes){
  const d=definition(n),g=svg('g',{class:`node ${selected===n.id||multi.has(n.id)?'selected':''} ${focused===n.id?'failed':''}`,'data-id':n.id});
  const rect=svg('rect',{x:n.x,y:n.y,width:146,height:nodeHeight(n),rx:9},g);
  svg('text',{x:n.x+12,y:n.y+22,class:'node-title'},g).textContent=n.label;
  svg('text',{x:n.x+134,y:n.y+22,'text-anchor':'end',class:'node-kind'},g).textContent=n.type;
  rect.addEventListener('pointerdown',e=>{
   if(e.button!==0)return;e.stopPropagation();const pt=worldPoint(e);
   if(e.shiftKey){multi.has(n.id)?multi.delete(n.id):multi.add(n.id);selected=n.id;draw();return;}
   if(!multi.has(n.id)){multi.clear();multi.add(n.id);}
   drag={kind:'node',id:n.id,start:pt,left:n.x,top:n.y,before:clone(doc),positions:doc.nodes.filter(t=>multi.has(t.id)).map(t=>({id:t.id,x:t.x,y:t.y})),moved:false};
   selected=n.id;board.setPointerCapture(e.pointerId);draw();
  });
  for(const output of [false,true]){
   const ports=output?d.outputs:d.inputs;
   ports.forEach((p,i)=>{
    const [cx,cy]=portPosition(n,i,output);const w=output?null:sourceOf(n.id,i);const v=output?values[n.id]?.[i]:w?wireValue(w):undefined;
    const circle=svg('circle',{cx,cy,r:6.5,class:`pin ${v?'high':''} ${pending?.id===n.id&&pending?.output===i&&output?'pending':''}`,tabindex:0,role:'button','aria-label':n.label+' '+(output?'输出 ':'输入 ')+p.name},g);
    svg('text',{x:cx+(output?-11:11),y:cy+4,'text-anchor':output?'end':'start',class:'pin-label'},g).textContent=p.name+(p.width>1?' · '+p.width:'')+' '+fmt(v,p.width);
    const activate=()=>{
     if(output){pending=pending?.id===n.id&&pending?.output===i?null:{id:n.id,output:i,width:p.width};selected=n.id;draw();return;}
     if(!pending){multi.clear();selected=w?.id||n.id;draw();return;}
     if(pending.width!==p.width){notify('位宽不一致，请连接 '+p.width+' 位输出。');return;}
     checkpoint();doc.wires=doc.wires.filter(w=>!(w.to===n.id&&w.pin===i));
     doc.wires.push({id:'w'+Date.now()+'-'+serial++,from:pending.id,output:pending.output,to:n.id,pin:i});pending=null;edit();
    };
    circle.addEventListener('pointerdown',e=>e.stopPropagation());circle.onclick=e=>{e.stopPropagation();activate();};
    circle.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();activate();}};
   });
  }
 }
 $('status').textContent=pending?'选择目标输入端 · Esc 取消':net.error||`${doc.nodes.length} 个元件 · ${doc.wires.length} 条连线 · 展开 ${net.expandedCount} 个基础元件 · 电路就绪`;
 $('status').className=net.error?'error':'';
 $('tick').textContent='周期 '+ticks;
 $('undo').disabled=!history.length;$('redo').disabled=!future.length;
 renderInspector();
 if(level.id==='mines')renderMines();
 if(Game.isComputer(level)){
  $('terminal').textContent=terminal||'等待 ST 255 输出…';
  $('cpu-state').textContent='PC '+fmt(values.pc?.[0],8)+'   ACC '+fmt(values.acc?.[0],8)+'   IR '+fmt(values.rom?.[0],16);
  renderDebugger();renderScreen();
 }
}
function renderMines(){
 const memory=state.ram||[];
 $('mines-grid').replaceChildren();
 for(let i=0;i<9;i++){
  const b=button(memory[32+i]?String.fromCharCode(memory[32+i]):'·',()=>{
   if(net.error){notify(net.error);return;}
   if(state.ram[254]){notify('CPU 尚未读取上一条输入，请继续运行。');return;}
   state.ram=[...state.ram];state.ram[254]=i+1;values=net.evaluate(state).values;draw();
   notify('输入 '+(i+1)+' 已写入 0xFE，运行电路处理');
  });
  b.setAttribute('aria-label','格子 '+(i+1));$('mines-grid').append(b);
  b.disabled=!!memory[250];
 }
 $('mines-status').textContent=memory[250]===1?'CPU 状态：踩雷，程序停机':memory[250]===2?'CPU 状态：胜利，程序停机':'已揭开 '+(memory[252]||0)+' / 8 · 每个输入需多个周期处理';
}
function renderInspector(){
 const el=$('inspector');el.replaceChildren();const n=doc.nodes.find(n=>n.id===selected);
 if(!n){el.textContent=selected?'已选中导线。':'点击元件查看引脚和数值。';if(selected)el.append(button('删除连线',removeSelected,'danger'));return;}
 const title=document.createElement('h3');title.textContent=n.label;el.append(title);
 const name=document.createElement('input');name.value=n.label;name.setAttribute('aria-label','元件名称');
 name.onchange=()=>{checkpoint();n.label=name.value.slice(0,32)||n.type;persist();draw();};el.append(name);
 if(['IN','IN8','IN16','CONST','BIT'].includes(n.type)){
  const input=document.createElement('input');input.type='number';input.min=0;input.max=['IN','BIT'].includes(n.type)?1:n.type==='IN16'?65535:255;input.value=n.value;
  input.setAttribute('aria-label','输入值');
  input.onchange=()=>{const v=Number(input.value);if(!Number.isInteger(v)||v<0||v>Number(input.max)){notify('输入值超出范围');return;}checkpoint();n.value=v;focused=null;compileCurrent(false);persist();draw();};
  el.append(input);
  if(['IN','BIT'].includes(n.type))el.append(button('切换 0 / 1',()=>{checkpoint();n.value=1-n.value;focused=null;compileCurrent(false);persist();draw();}));
 }
 if(n.type==='CUSTOM'){
  const info=document.createElement('p');info.textContent=n.spec.circuit.nodes.length+' 个内部元件 · '+n.spec.circuit.wires.length+' 条内部连线';el.append(info);
  el.append(button('打开内部电路副本',()=>{
   persist();const internal=clone(n.spec.circuit);
   inspectionStack.push({levelId:level.id,doc:clone(doc),state:clone(state),ticks,records:clone(records),camera:{...camera},selected});
   openLevel('sandbox',false,true);doc=internal;edit();$('title').textContent=n.label+' · 内部电路副本';$('description').textContent='可继续逐层打开。这里的编辑可另行封装或导出，返回时保留上层电路及运行状态。';$('fit').click();notify('已打开内部电路，第 '+inspectionStack.length+' 层');
  }));
 }
 if(['NAND','AND','OR','XOR','NOR','XNOR'].includes(n.type)){
  const select=document.createElement('select');select.setAttribute('aria-label','替换逻辑门');
  for(const type of (level.allowed||Object.keys(types)).filter(t=>types[t]?.inputs.length===2&&types[t].outputs[0]?.width===1&&!types[t].stateful)){
   const option=document.createElement('option');option.value=type;option.textContent=type;option.selected=type===n.type;select.append(option);
  }
  select.onchange=()=>{checkpoint();n.type=select.value;edit();};el.append(select);
 }
 for(const [i,p] of definition(n).inputs.entries()){
  const row=document.createElement('p');const w=sourceOf(n.id,i);row.textContent=p.name+' ← '+(w?fmt(wireValue(w),p.width):'未连接');el.append(row);
 }
 for(const [i,p] of definition(n).outputs.entries()){const row=document.createElement('p');row.textContent=p.name+' → '+fmt(values[n.id]?.[i],p.width);el.append(row);}
 if(n.type==='RAM8'&&Array.isArray(state[n.id])){
  const memory=document.createElement('pre');memory.className='memory';memory.textContent=Array.from({length:8},(_,r)=>state[n.id].slice(r*8,r*8+8).map(x=>x.toString(16).padStart(2,'0')).join(' ')).join('\n');el.append(memory);
 }
 el.append(button('删除元件',removeSelected,'danger'));
}
function removeSelected(){
 if(!selected)return;checkpoint();const ids=new Set(multi);ids.add(selected);doc.nodes=doc.nodes.filter(n=>!ids.has(n.id));doc.wires=doc.wires.filter(w=>![w.id,w.from,w.to].some(id=>ids.has(id)));selected=null;pending=null;multi.clear();edit();
}
function boardPoint(e){const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(board.getScreenCTM().inverse());return {x:p.x,y:p.y};}
function worldPoint(e){const p=boardPoint(e);return {x:(p.x-camera.x)/camera.scale,y:(p.y-camera.y)/camera.scale};}
board.addEventListener('pointerdown',e=>{
 if(e.button!==0||!['board','background'].includes(e.target.id))return;
 const p=boardPoint(e);drag={kind:'pan',start:p,left:camera.x,top:camera.y,moved:false};board.setPointerCapture(e.pointerId);
});
board.addEventListener('pointermove',e=>{
 if(!drag)return;
 const p=drag.kind==='pan'?boardPoint(e):worldPoint(e);
 if(!drag.moved&&Math.hypot(p.x-drag.start.x,p.y-drag.start.y)<3)return;
 drag.moved=true;
 if(drag.kind==='pan'){camera.x=drag.left+p.x-drag.start.x;camera.y=drag.top+p.y-drag.start.y;}
 else{for(const old of drag.positions){const n=doc.nodes.find(n=>n.id===old.id);if(n){n.x=Math.round((old.x+p.x-drag.start.x)/12)*12;n.y=Math.round((old.y+p.y-drag.start.y)/12)*12;}}}
 draw();
});
function finishDrag(){
 if(!drag)return;
 if(drag.kind==='node'&&drag.moved){history.push(drag.before);future=[];persist();}
 if(drag.kind==='pan'&&!drag.moved){selected=null;pending=null;multi.clear();draw();}
 drag=null;
}
for(const event of ['pointerup','pointercancel','lostpointercapture'])board.addEventListener(event,finishDrag);
board.addEventListener('wheel',e=>{
 e.preventDefault();const p=boardPoint(e),world=worldPoint(e),scale=Math.max(.35,Math.min(2.5,camera.scale*(e.deltaY<0?1.1:.9)));
 camera={scale,x:p.x-world.x*scale,y:p.y-world.y*scale};draw();
},{passive:false});
function step(render=true){
 if(net.error){stop();selected=net.node;notify(net.error);draw();return;}
 try{
  const result=net.tick(state);state=result.state;values=result.values;ticks++;
  if(Game.isComputer(level)){
   for(const w of result.writes)if(w.id==='ram'&&w.address===255)terminal=(terminal+(w.value===10?'\n':String.fromCharCode(w.value))).slice(-500);
   if(values.ctrl?.[6]===0)stop();
  }
  records.push({tick:ticks,values:doc.nodes.filter(n=>definition(n).stateful||!definition(n).outputs.length).map(n=>n.label+'='+fmt(definition(n).outputs.length?values[n.id]?.[0]:net.evaluate(state).inputs(n.id)[0],definition(n).outputs[0]?.width||definition(n).inputs[0]?.width))});
  if(records.length>10)records.shift();if(render){draw();renderTrace();}
 }catch(e){stop();notify(e.message);}
}
function renderTrace(){
 $('trace').replaceChildren();
 if(!records.length){$('trace').textContent='点击“下一拍”开始记录寄存器与输出。';return;}
 for(const r of [...records].reverse()){const row=document.createElement('div');row.className='trace-row';row.textContent='#'+r.tick+'  '+r.values.join('  ');$('trace').append(row);}
}
function renderTests(){
 const el=$('results');el.replaceChildren();
 if(!testCases.length){el.textContent=level.expect||level.sequence||level.vectors||level.verify?'连接完成后运行测试。失败用例可以逐行回放。':'运行或单步，观察电路中信号的变化。';return;}
 const passed=testCases.filter(c=>c.pass).length;
 const summary=document.createElement('p');summary.className=passed===testCases.length?'success':'error';summary.textContent='通过 '+passed+' / '+testCases.length;el.append(summary);
 const table=document.createElement('table'),head=document.createElement('tr');
 for(const text of ['输入 / 操作','预期','实际','回放']){const th=document.createElement('th');th.textContent=text;head.append(th);}table.append(head);
 testCases.forEach((c,i)=>{
  const row=document.createElement('tr');row.className=(c.pass?'success':'error')+(testIndex===i?' replaying':'');
  for(const text of [Object.entries(c.input).map(([k,v])=>k+'='+v).join(' '),c.expected.join(' / '),c.actual.join(' / ')]){const td=document.createElement('td');td.textContent=text;row.append(td);}
  const td=document.createElement('td');td.append(button(c.pass?'查看':'定位',()=>replay(i)));row.append(td);table.append(row);
 });el.append(table);
}
function replay(i){
 stop();const c=testCases[i];testIndex=i;
 if(level.verify){renderTests();$('hint').textContent='预期终端输出 A B C D E；请核对 PC、译码器、数据通路与写回连线。';return;}
 if(c.state)state=clone(c.state);
 for(const n of doc.nodes)if(Object.hasOwn(c.input,n.id))n.value=c.input[n.id];
 values=net.evaluate(state).values;
 const bad=c.actual.findIndex((v,j)=>v!==c.expected[j]);focused=bad>=0?level.outputs[bad]:null;selected=focused;
 $('hint').textContent=bad>=0?`${Object.entries(c.input).map(([k,v])=>k+'='+v).join('，')} 时，${focused} 预期为 ${c.expected[bad]}，实际为 ${c.actual[bad]}。上游连线已标出，请检查各支路。`:'这一组符合预期。继续比较其他输入，解释信号变化。';
 draw();renderTests();
}
$('test').onclick=()=>{
 stop();
 if(net.error){selected=net.node;draw();notify(net.error);return;}
 if(![...(level.inputs||[]),...(level.outputs||[])].every(id=>doc.nodes.some(n=>n.id===id))){notify('缺少实验端口，请恢复关卡或保留原输入输出。');return;}
 testCases=[];let testState=net.initial();
 const inputs=level.verify?[]:level.vectors?level.vectors.map(v=>v.input):level.sequence||Array.from({length:2**(level.inputs||[]).length},(_,i)=>Object.fromEntries((level.inputs||[]).map((id,k)=>[id,(i>>(level.inputs.length-1-k))&1])));
 if(level.verify)testCases=level.verify(net,doc);
 else for(const [index,input] of inputs.entries()){
  let result;
  if(level.sequence||level.clocked){result=net.tick(testState,input);testState=result.state;}
  else result=net.evaluate(testState,input);
  const expected=level.vectors?level.vectors[index].expected:level.sequence?[input.Q]:level.expect(level.inputs.map(id=>input[id]));
  const actual=level.outputs.map(id=>result.inputs(id)[0]);
  testCases.push({input:Object.fromEntries(level.inputs.map(id=>[id,input[id]])),expected,actual,pass:actual.every((v,i)=>v===expected[i]),state:clone(testState)});
 }
 const failure=testCases.findIndex(c=>!c.pass);
 if(failure<0){completed[level.id]=true;persist();renderNav();focused=null;renderTests();$('hint').textContent='全部通过！试着不用答案解释这份电路，再进入下一关。';notify('✓ 实验验证通过');}
 else replay(failure);
};
$('step').onclick=()=>step();
$('run').onclick=()=>{
 if(timer){stop();return;}
 if(net.error){notify(net.error);return;}
 const speed=Number($('speed').value),batch=Math.max(1,Math.round(speed/30));
 timer=setInterval(()=>{
  for(let i=0;i<batch;i++){
   if(Game.isComputer(level)&&breakpoints.has(values.pc?.[0])){stop();notify('断点：PC '+values.pc[0]);break;}
   step(false);if(!timer)break;
  }
  draw();renderTrace();
 },Math.max(1000/30,1000/speed));$('run').textContent='Ⅱ 暂停';
};
$('speed').onchange=()=>{if(timer){stop();$('run').click();}};
$('reset-state').onclick=()=>{stop();focused=null;compileCurrent();draw();renderTrace();notify('状态已复位');};
$('restart').onclick=()=>{if(confirm('恢复关卡的初始电路？当前电路可先导出保存。')){openLevel(level.id,true);persist();}};
$('undo').onclick=()=>{if(!history.length)return;future.push(clone(doc));doc=history.pop();selected=null;pending=null;multi.clear();edit();};
$('redo').onclick=()=>{if(!future.length)return;history.push(clone(doc));doc=future.pop();selected=null;pending=null;multi.clear();edit();};
$('fit').onclick=()=>{
 if(!doc.nodes.length){camera={x:0,y:0,scale:1};draw();return;}
 const minX=Math.min(...doc.nodes.map(n=>n.x)),maxX=Math.max(...doc.nodes.map(n=>n.x+146));
 const minY=Math.min(...doc.nodes.map(n=>n.y)),maxY=Math.max(...doc.nodes.map(n=>n.y+nodeHeight(n)));
 const scale=Math.min(1.6,1160/(maxX-minX),650/(maxY-minY));
 camera={scale,x:(1280-(maxX-minX)*scale)/2-minX*scale,y:(760-(maxY-minY)*scale)/2-minY*scale};draw();
};
$('assemble').onclick=()=>{
 try{
  const result=Circuit.assemble($('program').value);
  const rom=doc.nodes.find(n=>n.id==='rom'&&n.type==='ROM16');if(!rom)throw Error('缺少程序 ROM');
  checkpoint();rom.program=result.words;doc.source=$('program').value;edit();notify('已加载 '+result.words.length+' 条指令，状态已复位');
 }catch(e){notify(e.message);}
};
$('export').onclick=()=>{
 const blob=new Blob([JSON.stringify({version:2,level:level.id,circuit:doc},null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='CircuitMind-'+level.id+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
$('import').onclick=()=>$('file').click();
$('file').onchange=async()=>{
 const file=$('file').files[0];if(!file)return;
 try{
  if(file.size>32*1024*1024)throw Error('存档文件需小于 32 MiB');
  const data=JSON.parse(await file.text());
  if(data.kind==='CircuitMind-save'){
   if(!data.saved||typeof data.saved!=='object'||!Array.isArray(data.library)||data.library.length>100)throw Error('存档格式无效');
   for(const d of Object.values(data.saved))validate(d);
   for(const spec of data.library)validate({nodes:[{id:'check',type:'CUSTOM',x:0,y:0,spec}],wires:[]});
   saved=clone(data.saved);completed=Object.fromEntries(Game.levels.filter(l=>data.completed?.[l.id]===true).map(l=>[l.id,true]));library=clone(data.library);
   openLevel(data.last||'nand');persist();notify('全部电路、元件库与关卡进度已恢复');return;
  }
  validate(data.circuit);
  const checked=compile(data.circuit.nodes,data.circuit.wires);
  if(checked.error&&!checked.error.includes('未连接')&&!checked.error.includes('组合反馈'))throw Error(checked.error);
  openLevel(Game.levels.some(l=>l.id===data.level)?data.level:'sandbox');checkpoint();doc=clone(data.circuit);edit();notify('蓝图已导入');
 }catch(e){notify('导入失败：'+e.message);}
 $('file').value='';
};
document.addEventListener('keydown',e=>{
 if(['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName))return;
 if(e.key==='Escape'){pending=null;selected=null;multi.clear();draw();}
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='c'){
  const ids=new Set(multi);if(selected)ids.add(selected);clipboard={nodes:clone(doc.nodes.filter(n=>ids.has(n.id))),wires:clone(doc.wires.filter(w=>ids.has(w.from)&&ids.has(w.to)))};if(clipboard.nodes.length){e.preventDefault();notify('已复制 '+clipboard.nodes.length+' 个元件及内部连线');}
 }
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='v'&&clipboard?.nodes.length){
  e.preventDefault();if(doc.nodes.length+clipboard.nodes.length>500){notify('画布最多 500 个元件');return;}checkpoint();const ids=new Map();multi.clear();
  for(const n of clipboard.nodes){const id='copy'+Date.now()+'-'+serial++;ids.set(n.id,id);doc.nodes.push({...clone(n),id,x:n.x+48,y:n.y+48});multi.add(id);}
  for(const w of clipboard.wires)doc.wires.push({...clone(w),id:'copywire'+Date.now()+'-'+serial++,from:ids.get(w.from),to:ids.get(w.to)});selected=[...multi][0];edit();
 }
 if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();removeSelected();}
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?$('redo').click():$('undo').click();}
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();$('redo').click();}
 if(e.code==='Space'){e.preventDefault();step();}
});
$('back-circuit').onclick=()=>{
 if(!inspectionStack.length)return;const parent=inspectionStack.pop();openLevel(parent.levelId,false,true);doc=parent.doc;compileCurrent();state=parent.state;ticks=parent.ticks;records=parent.records;camera=parent.camera;selected=parent.selected;if(!net.error)values=net.evaluate(state).values;draw();renderTrace();notify('已返回上层电路');
};
// The component library holds snapshots, so editing a blueprint cannot silently
// change circuits that already instantiate it.
$('package').onclick=()=>{
 if(net.error){notify('请先修复电路：'+net.error);return;}
 $('package-name').value=level.id==='sandbox'?'我的元件':level.title;
 $('package-ports').textContent='输入 / 输出按照当前电路中的端口顺序生成。';$('package-dialog').showModal();
};
$('cancel-package').onclick=()=>$('package-dialog').close();
$('save-package').onclick=()=>{
 try{if(library.length>=100)throw Error('元件库最多 100 项，请先导出备份');const spec=Circuit.encapsulate(doc,$('package-name').value);library.push(spec);persist();renderPalette();$('package-dialog').close();notify('已保存 '+spec.name+'，现在可在元件栏复用');}catch(e){notify(e.message);}
};
function download(data,name){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('backup').onclick=()=>{persist();download({kind:'CircuitMind-save',version:3,saved,completed,library,last:level.id},'CircuitMind-save.json');};
function showWorld(){
 const container=$('world-map');container.replaceChildren();let chapter='',section;
 for(const l of Game.levels){
  if(l.chapter!==chapter){chapter=l.chapter;section=document.createElement('section');const h=document.createElement('h2');h.textContent=chapter;section.append(h);container.append(section);}
  const b=button((completed[l.id]?'✓ ':'○ ')+l.title,()=>{$('world').close();openLevel(l.id);},completed[l.id]?'done':'');section.append(b);
 }
 $('world').showModal();
}
$('home').onclick=showWorld;$('close-world').onclick=()=>$('world').close();
// ROM disassembly with live PC and breakpoints.
const debug=document.createElement('div');debug.id='debugger';$('program-panel').append(debug);
const display=document.createElement('canvas');display.id='cpu-screen';display.width=8;display.height=8;display.setAttribute('aria-label','RGB332 显存屏幕');$('program-panel').append(display);
function renderDebugger(){
 const rom=doc.nodes.find(n=>n.id==='rom');debug.replaceChildren();if(!rom)return;
 const title=document.createElement('h3');title.textContent='机器指令 · 点击设置断点';debug.append(title);
 const instructions=rom.program||[],pc=values.pc?.[0]||0,names=Object.fromEntries(Object.entries(Circuit.opcodes).map(([k,v])=>[v,k]));
 for(let i=Math.max(0,pc-3);i<Math.min(instructions.length,pc+7);i++){
  const word=instructions[i],b=button((breakpoints.has(i)?'● ':'  ')+i.toString(16).padStart(2,'0')+'  '+(names[word>>>8]||'???')+' '+(word&255),()=>{breakpoints.has(i)?breakpoints.delete(i):breakpoints.add(i);renderDebugger();},i===pc?'current-instruction':'');debug.append(b);
 }
}
function renderScreen(){
 display.hidden=level.id==='mines';const ctx=display.getContext('2d');if(!ctx)return;
 const memory=state.ram||[];for(let i=0;i<64;i++){const v=memory[128+i]||0;ctx.fillStyle='rgb('+((v>>>5)*255/7)+','+(((v>>>2)&7)*255/7)+','+((v&3)*85)+')';ctx.fillRect(i%8,Math.floor(i/8),1,1);}
}
async function boot(){
 let last='nand';try{last=localStorage.getItem('cm-last-level')||'nand';}catch{}
 if(typeof indexedDB!=='undefined'){
  try{
   storageDatabase=await new Promise((resolve,reject)=>{const request=indexedDB.open('CircuitMind',1);request.onupgradeneeded=()=>request.result.createObjectStore('save');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('存档数据库被其他标签页阻止'));});
   const profile=await new Promise((resolve,reject)=>{const request=storageDatabase.transaction('save').objectStore('save').get('profile');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
   if(profile){saved=profile.saved||{};completed=profile.completed||{};library=Array.isArray(profile.library)?profile.library:[];last=profile.last||last;}
   storageDatabase.onversionchange=()=>{storageDatabase.close();storageDatabase=null;};
  }catch{notify('高级存档不可用，改用浏览器基础存储。请定期导出备份。');}
 }
 openLevel(last);
}
boot();

