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
let mineFlags=false,deviceScreen=[],pendingKeys=[],peripheral=null;
let round=null;
let guided=false;
try{guided=localStorage.getItem('cm-guided')==='true';}catch{}
function locked(l){
 const prior=Game.prerequisite(l);
 return guided&&!completed[l.id]&&prior&&!completed[prior.id];
}
$('guided').checked=guided;
$('guided').onchange=()=>{
 guided=$('guided').checked;
 try{localStorage.setItem('cm-guided',String(guided));}catch{}
 if(locked(level))openLevel(Game.levels.find(l=>Game.isGraded(l)&&!completed[l.id]).id);else renderNav();
};
$('next-level').onclick=()=>{
 const next=Game.levels[Game.levels.indexOf(level)+1];
 if(next&&!locked(next))openLevel(next.id);
};
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
 if(reset){ticks=0;records=[];terminal='';deviceScreen=[];pendingKeys=[];peripheral=level.createDevice?.(0)??null;state=net.error?{}:net.initial();}
 if(!net.error)values=net.evaluate(state).values;else values={};
}
function edit(){stop();focused=null;testCases=[];testIndex=-1;compileCurrent();persist();draw();renderTests();renderTrace();}
function openLevel(id,fresh=false,keepContext=false){
 if(!keepContext)inspectionStack=[];multi.clear();
 stop();round=null;level=Game.levels.find(l=>l.id===id)||Game.levels[0];
 doc=clone(!fresh&&saved[level.id]?saved[level.id]:level.build());
 if(level.machine&&!saved[level.id]&&!fresh&&!level.id.startsWith('wire-')&&saved['machine-'+level.machine]){
  const base=doc,own=clone(saved['machine-'+level.machine]);
  const rom=own.nodes.find(n=>n.id==='rom'),image=base.nodes.find(n=>n.id==='rom');
  if(rom&&image&&rom.type===image.type){
   rom.program=clone(image.program);own.source=base.source;delete own.draftSource;delete own.draftIsa;
   if(level.id==='mines32'){
    const seed=own.nodes.find(n=>n.id==='input');if(seed)seed.value=base.nodes.find(n=>n.id==='input').value;
   }
   doc=own;
  }
 }
 try{validate(doc);}catch{doc=level.build();}
 selected=null;pending=null;focused=null;history=[];future=[];testCases=[];testIndex=-1;
 compileCurrent();camera={x:0,y:0,scale:1};
 $('tag').textContent=level.tag;$('title').textContent=level.title;$('description').textContent=level.text;
 $('drill-panel').hidden=!level.drill;
 if(level.drill)document.body.classList.add('drill-mode');else document.body.classList.remove('drill-mode');
 if(level.drill){$('drill-question').textContent=doc.bestTime?'最佳 '+(doc.bestTime/1000).toFixed(2)+' 秒':'';$('drill-answer').hidden=true;$('drill-submit').hidden=true;}
 breakpoints.clear();
 $('program-panel').hidden=!Game.isComputer(level);$('program').value=doc.draftSource??doc.source??level.program??'';
 syncProgramPanel();
 $('test').disabled=!level.expect&&!level.sequence&&!level.vectors&&!level.verify;
 $('exhaustive').hidden=!exhaustiveWidths();
 $('test-title').textContent=Game.isComputer(level)?'机器与终端':level.id==='sandbox'||level.id==='counter'?'电路状态':'验证你的电路';
 $('hint').textContent=level.machine?level.text:Game.isComputer(level)?'ROM 取指 → 译码 → ALU / RAM → 写回 ACC。每一拍会同时更新 PC 和 ACC。':level.text;
 $('mines-panel').hidden=!['mines','mines32'].includes(level.id);
 $('mine-mode').hidden=level.id!=='mines32';mineFlags=false;
 $('mine-heading').textContent=level.id==='mines32'?'扫雷 · 8 × 8':'CPU 屏幕 · 3 × 3';
 renderNav();renderPalette();if(level.machine)$('fit').click();else draw();renderTests();renderTrace();
}
function renderNav(){
 $('levels').replaceChildren();
 let chapter='';
 for(const l of Game.levels){
  if(l.chapter!==chapter){chapter=l.chapter;const h=document.createElement('h3');h.textContent=chapter;h.className='chapter-title';$('levels').append(h);}
  const b=button((completed[l.id]?'✓ ':'')+l.title,()=>openLevel(l.id),l.id===level.id?'active':'');
  b.disabled=!!locked(l);if(b.disabled)b.title='先完成「'+Game.prerequisite(l).title+'」';
  b.setAttribute('aria-current',l.id===level.id?'page':'false');$('levels').append(b);
 }
 const count=Game.levels.filter(Game.isGraded).length;
 $('progress').textContent=Game.levels.filter(l=>completed[l.id]&&Game.isGraded(l)).length+' / '+count+' 项实验已验证';
 const next=Game.levels[Game.levels.indexOf(level)+1];
 $('next-level').hidden=!next||!!locked(next)||(!completed[level.id]&&Game.isGraded(level));
}
function showQuestion(){
 $('drill-answer').value='';$('drill-question').textContent=(round.index+1)+' / '+round.items.length+'　'+round.items[round.index].prompt;
 $('drill-answer').focus();
}
$('drill-start').onclick=()=>{
 round={items:level.drill(),index:0,start:performance.now()};
 $('drill-answer').hidden=false;$('drill-submit').hidden=false;showQuestion();
};
$('drill-submit').onclick=()=>{
 if(!round)return;
 const q=round.items[round.index],answer=$('drill-answer').value.trim().toUpperCase();
 if(!(q.radix===2?/^[01]+$/:/^[0-9A-F]+$/).test(answer)||parseInt(answer,q.radix)!==parseInt(q.answer,q.radix)){notify('再检查一下位权或真值表');return;}
 if(++round.index<round.items.length){showQuestion();return;}
 const elapsed=Math.round(performance.now()-round.start);doc.bestTime=Math.min(doc.bestTime??Infinity,elapsed);
 completed[level.id]=true;round=null;persist();renderNav();$('drill-answer').hidden=true;$('drill-submit').hidden=true;
 $('drill-question').textContent='八题全对 · 本次 '+(elapsed/1000).toFixed(2)+' 秒 · 最佳 '+(doc.bestTime/1000).toFixed(2)+' 秒';
};
$('drill-answer').onkeydown=e=>{if(e.key==='Enter')$('drill-submit').click();};
function renderPalette(){
 $('palette').replaceChildren();
  const allowed=level.allowed||Object.keys(types).filter(t=>!t.startsWith('BUF'));
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
  if(response.status===401){$('ask-mentor').click();return;}
  const result=await response.json();if(!response.ok)throw Error(result.error||'接口请求失败');
  const evidence={levelId:level.id,tick:ticks,tool,result};
  if(result.error){$('hint').textContent='后端仿真检查：'+result.error;if(result.node)selected=result.node;draw();}
  else if(tool==='test'){$('hint').textContent='后端测试通过 '+result.passed+' / '+result.total+'。'+(result.passed===result.total?'全部用例符合预期。':'存在失败用例，已下载真实测试证据。');}
  else $('hint').textContent='后端结构检查通过，展开 '+result.expandedCount+' 个基础元件。';
  download(evidence,'CircuitMind-evidence.json');notify('已调用本机仿真 API；这一步尚未调用 AI 导师');
 }catch(e){notify('工具调用失败：'+e.message+'。请通过 start.cmd 打开游戏。');}finally{control.disabled=false;}
};
let mentorSession;
function showMentorAccess(joined){
 $('mentor-form').hidden=!joined;
 $('mentor-join').hidden=joined;
 if(!joined&&$('mentor-dialog').open)$('mentor-code').focus();
}
$('ask-mentor').onclick=async()=>{
 const fileMode=location.protocol==='file:';
 const staticSite=location.hostname.endsWith('.github.io');
 $('mentor-form').hidden=true;
 $('mentor-join').hidden=true;
 $('mentor-file-help').hidden=!fileMode;
 if(mentorSession?.levelId!==level.id){
  mentorSession={levelId:level.id};
  $('mentor-log').replaceChildren();
  $('mentor-question').value='';
  $('mentor-send').disabled=false;
  $('mentor-status').textContent='';
 }
 if(staticSite)$('mentor-status').textContent='这个 GitHub Pages 版本暂未连接导师，请使用本地游戏。';
 $('mentor-dialog').showModal();
 if(fileMode||staticSite)return;
 if($('mentor-send').disabled){showMentorAccess(true);return;}
 const status=$('mentor-status');
 status.textContent='正在连接导师…';
 try{
  const response=await fetch('/api/classroom',{signal:AbortSignal.timeout(15000)});
  if(response.status===404){showMentorAccess(true);status.textContent='';return;}
  if(!response.ok)throw Error('暂时无法连接导师，请关闭窗口后重试。');
  const access=await response.json();
  showMentorAccess(!access.required||access.joined);
  status.textContent='';
 }catch(e){status.textContent=e.message;}
};
$('close-mentor').onclick=()=>$('mentor-dialog').close();

$('mentor-join').onsubmit=async event=>{
 event.preventDefault();
 const control=$('mentor-join-button'),field=$('mentor-code'),status=$('mentor-status');
 if(control.disabled)return;
 control.disabled=true;
 try{
  const response=await fetch('/api/classroom',{
   method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:field.value.trim()}),
   signal:AbortSignal.timeout(15000)
  });
  const access=await response.json();
  if(!response.ok||!access.joined)throw Error(access.error||'暂时无法加入班级。');
  field.value='';
  showMentorAccess(true);
  $('mentor-question').focus();
  status.textContent='';
 }catch(e){status.textContent=e.message;}finally{control.disabled=false;}
};

function appendMentorMessage(label,text,className){
 const message=document.createElement('p');
 message.className=className;
 message.textContent=label+'\n'+text;
 const log=$('mentor-log');
 log.append(message);
 log.scrollTop=log.scrollHeight;
}

function renderMentorEvidence(evidence){
 if(!evidence)return;
 if(evidence.kind==='tests'){
  const summary=`关卡用例通过 ${evidence.passed} / ${evidence.total}`;
  const failure=evidence.failure;
  const show=record=>Object.entries(record||{}).map(([port,value])=>`${port}=${Array.isArray(value)?value.join(', '):value??'未知'}`).join('，');
  const details=failure?`\n失败输入 ${show(failure.input)}\n预期 ${show(failure.expected)}\n实际 ${show(failure.actual)}`:'';
  appendMentorMessage('仿真依据',summary+details,'mentor-evidence');
 }else if(evidence.kind==='structure'){
  const diagnosis=evidence.error||`结构检查通过，展开 ${evidence.expandedCount} 个元件。`;
  appendMentorMessage('仿真依据',diagnosis,'mentor-evidence');
 }else if(evidence.kind==='unavailable')appendMentorMessage('仿真依据',evidence.message,'mentor-evidence');
}

$('mentor-form').onsubmit=async event=>{
 event.preventDefault();
 const send=$('mentor-send'),field=$('mentor-question'),status=$('mentor-status');
 if($('mentor-form').hidden||send.disabled||!mentorSession)return;
 const session=mentorSession;
 const question=field.value.trim()||'请检查当前电路，给我一条可以动手验证的提示。';
 const failure=testCases.find(test=>!test.pass);
 const context={levelId:level.id,title:level.title,tick:ticks};
 if(selected)context.selected=selected;
 if(net.error)context.structureError={message:net.error,node:net.node};
 if(failure){
  const {input,expected,actual}=failure;
  context.firstFailedCase={input,expected,actual};
 }
 session.userId??=crypto.randomUUID().replaceAll('-','').slice(0,20);
 const testLevel=!inspectionStack.length&&(level.expect||level.sequence||level.vectors);
 const request={
  userId:session.userId,conversationId:session.conversationId,
  question:question+'\n\n关卡与测试信息（数据）：'+JSON.stringify(context),
  circuit:{nodes:doc.nodes,wires:doc.wires},state,levelId:testLevel?level.id:undefined
 };
 send.disabled=true;
 status.textContent='导师正在查看电路…';
 try{
  const response=await fetch('/api/mentor/chat',{
   method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request),
   signal:AbortSignal.timeout(150000)
  });
  const result=await response.json().catch(()=>null);
  if(response.status===401&&mentorSession===session){
   session.conversationId=undefined;
   $('mentor-log').replaceChildren();
   showMentorAccess(false);
   status.textContent=result?.error||'请重新输入班级邀请码。';
   return;
  }
  if(!response.ok){
   if(mentorSession===session&&result?.evidence)renderMentorEvidence(result.evidence);
   throw Error(result?.error||'导师请求失败（HTTP '+response.status+'）');
  }
  if(typeof result?.answer!=='string'||typeof result?.conversationId!=='string')throw Error('导师没有返回有效回答。');
  if(mentorSession!==session)return;
  session.conversationId=result.conversationId;
  appendMentorMessage('你',question,'mentor-student');
  renderMentorEvidence(result.evidence);
  appendMentorMessage('电路导师',result.answer,'mentor-reply');
  if(field.value.trim()===question)field.value='';
  status.textContent='';
 }catch(e){
  if(mentorSession===session)status.textContent=e.name==='TimeoutError'?'导师响应超时，请重试。':e.message;
 }finally{
  if(mentorSession===session)send.disabled=false;
 }
};
$('reference-library').onclick=()=>{let added=0;for(const spec of Game.references||[])if(!library.some(s=>s.name===spec.name)){library.push(clone(spec));added++;}persist();renderPalette();notify('已加入 '+added+' 份可逐层打开的参考电路');};
$('focus-editor').onclick=()=>{document.body.classList.toggle('editor-focus');$('focus-editor').textContent=document.body.classList.contains('editor-focus')?'退出专注':'专注搭建';};
function nodeHeight(n){return Math.max(74,38+Math.max(definition(n).inputs.length,definition(n).outputs.length)*23);}
function portPosition(n,index,output){return [n.x+(output?146:0),n.y+42+index*23];}
function wireValue(w){return values[w.from]?.[w.output??0];}
function sourceOf(id,pin){return doc.wires.find(w=>w.to===id&&w.pin===pin);}
function fmt(v,width=1){if(v===null)return 'Z';if(v==='X')return 'X';return v===undefined?'—':width>1?'0x'+v.toString(16).toUpperCase().padStart(Math.ceil(width/4),'0'):String(v);}
function draw(){
 $('back-circuit').hidden=!inspectionStack.length;
 scene.replaceChildren();scene.setAttribute('transform',`translate(${camera.x} ${camera.y}) scale(${camera.scale})`);
 const nodes=new Map(doc.nodes.map(n=>[n.id,n])),traced=new Set(),visited=new Set();
 function trace(id){if(visited.has(id))return;visited.add(id);for(const w of doc.wires.filter(w=>w.to===id)){traced.add(w.id);if(!['REG','REG8','REG32'].includes(nodes.get(w.from)?.type))trace(w.from);}}
 if(focused)trace(focused);
 for(const w of doc.wires){
  const a=nodes.get(w.from),b=nodes.get(w.to);if(!a||!b)continue;
  const [x,y]=portPosition(a,w.output??0,true),[tx,ty]=portPosition(b,w.pin,false);
  const bend=tx>x+30?(tx+x)/2:Math.max(x,tx)+38;
  const path=w.points?.length?`M${x},${y} `+w.points.map(p=>`H${p.x} V${p.y}`).join(' ')+` H${tx-20} V${ty} H${tx}`:`M${x},${y} H${bend} V${ty} H${tx}`,value=wireValue(w);
 const cls=`wire ${value==='X'?'conflict':value===null?'floating':value?'high':''} ${selected===w.id?'selected':''} ${traced.has(w.id)?'traced':''}`;
  const hit=svg('path',{d:path,class:'wire-hit'});hit.addEventListener('pointerdown',e=>e.stopPropagation());hit.onclick=e=>{e.stopPropagation();multi.clear();selected=w.id;draw();};
  svg('path',{d:path,class:cls});
  if(typeof value==='number'&&value){const dot=svg('circle',{r:3.2,class:'signal-dot'});svg('animateMotion',{path,dur:Math.max(.7,(Math.abs(tx-x)+Math.abs(ty-y))/190)+'s',repeatCount:'indefinite'},dot);}
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
 if(drag?.kind==='box'&&drag.end){
  const {start,end}=drag;svg('rect',{x:Math.min(start.x,end.x),y:Math.min(start.y,end.y),width:Math.abs(start.x-end.x),height:Math.abs(start.y-end.y),class:'selection-box'});
 }
 $('status').textContent=pending?(pending.route?'点击空白处放置拐点 · Esc 取消':'选择目标输入端 · Esc 取消'):net.error||`${doc.nodes.length} 个元件 · ${doc.wires.length} 条连线 · 展开 ${net.expandedCount} 个基础元件 · ${net.engine}`;
 $('status').className=net.error?'error':'';
 $('tick').textContent='周期 '+ticks;
 $('undo').disabled=!history.length;$('redo').disabled=!future.length;
 renderInspector();
 if(level.id==='mines32')renderMineDevice();else if(level.id==='mines')renderMines();
 if(Game.isComputer(level)){
  const o8=level.machine==='overture';
  const s32=level.machine==='symphony';
  $('terminal').textContent=terminal||(level.machine?'等待 OUT 输出…':'等待 ST 255 输出…');
  $('device-state').hidden=!peripheral;
  if(peripheral)$('device-state').textContent=peripheral.describe()+(peripheral.done?(peripheral.pass?'\n通过':'\n挑战结束'):'');
  const registers=s32?Game.symphony.names.slice(1).map((name,i)=>name+' '+fmt(values['r'+(i+1)]?.[0],32)).join('   '):o8?Array.from({length:6},(_,i)=>'R'+i+' '+fmt(values['r'+i]?.[0],8)).join('   '):'ACC '+fmt(values.acc?.[0],8);
  $('cpu-state').textContent='PC '+fmt(values.pc?.[0],s32?32:8)+'   '+registers+'   IR '+fmt(values.rom?.[0],s32?32:o8?8:16);
  renderDebugger();if(o8)display.hidden=true;else renderScreen();
 }
}
function renderMines(){
 const memory=state.ram||[];
 $('mines-grid').className='';
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
function renderMineDevice(){
 const device=Game.mineDevice,memory=state.ram||{},grid=$('mines-grid');
 grid.replaceChildren();grid.className='large-board';
 $('mine-mode').textContent=mineFlags?'操作：插旗 / 取旗':'操作：揭格';
 $('mine-mode').onclick=()=>{mineFlags=!mineFlags;renderMineDevice();};
 for(let i=0;i<64;i++){
  const cell=memory[device.base+i]||0,ended=memory[device.status];
  const mark=ended===1&&(cell&128)?'✹':cell&64?'⚑':cell&32?(cell&15)||'·':'';
  const b=button(String(mark),()=>{
   if(net.error||!state.ram){notify(net.error||'请连接 RAM');return;}
   if(state.ram[device.command])return;
   state.ram={...state.ram,[device.command]:i+(mineFlags?65:1)};
   if(!timer){
    let budget=60000;
    timer=setInterval(()=>{
     const deadline=performance.now()+12;
     try{
      while(state.ram[device.command]&&budget>0&&performance.now()<deadline){
       if(breakpoints.has(values.pc?.[0])){stop();break;}
       const result=net.tick(state);state=result.state;values=result.values;ticks++;budget--;
      }
      if(!state.ram[device.command]||budget<=0){stop();if(!budget)notify('程序尚未确认输入，可单步检查。');}
      if(!timer){draw();renderTrace();}
     }catch(e){stop();notify(e.message);}
    },16);
    $('run').textContent='Ⅱ 暂停';
   }
   renderMineDevice();
  },cell&32?'revealed':'covered');
  b.disabled=!!ended||!!memory[device.command];b.setAttribute('aria-label','第 '+(1+Math.floor(i/8))+' 行第 '+(1+i%8)+' 列 '+(mark||'未揭开'));grid.append(b);
 }
 $('mines-status').textContent=memory[device.status]===1?'踩雷':memory[device.status]===2?'胜利':memory[device.command]?'CPU 正在处理输入':'已揭开 '+(memory[device.count]||0)+' / 56';
}
function renderInspector(){
 const el=$('inspector');el.replaceChildren();const n=doc.nodes.find(n=>n.id===selected);
 if(!n){
  const wire=doc.wires.find(w=>w.id===selected);
  el.textContent=wire?'已选中导线。':'点击元件查看引脚和数值。';
  if(wire){
   el.append(button('添加拐点',()=>{pending={route:wire.id};$('status').textContent='点击画布空白处放置拐点';}));
   if(wire.points?.length)el.append(button('撤回一个拐点',()=>{checkpoint();wire.points.pop();persist();draw();}));
   el.append(button('删除连线',removeSelected,'danger'));
  }
  return;
 }
 const title=document.createElement('h3');title.textContent=n.label;el.append(title);
 const name=document.createElement('input');name.value=n.label;name.setAttribute('aria-label','元件名称');
 name.onchange=()=>{checkpoint();n.label=name.value.slice(0,32)||n.type;persist();draw();};el.append(name);
 if(['IN','IN8','IN16','IN32','CONST','BIT'].includes(n.type)){
  const input=document.createElement('input');input.type='number';input.min=0;input.max=2**definition(n).outputs[0].width-1;input.value=n.value;
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
 if(n.type==='RAM32'&&state[n.id]){
  const bytes=state[n.id],addresses=Object.keys(bytes).map(Number).sort((a,b)=>a-b);
  const memory=document.createElement('pre');memory.className='memory';memory.textContent=addresses.length?addresses.slice(-48).map(a=>fmt(a,16)+'  '+fmt(bytes[a],8)).join('\n'):'尚未写入内存';el.append(memory);
 }else if(n.type==='RAM8'&&Array.isArray(state[n.id])){
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
 if(pending?.route){
  const wire=doc.wires.find(w=>w.id===pending.route);
  if(wire&&(wire.points?.length||0)<64){checkpoint();(wire.points??=[]).push(worldPoint(e));persist();}
  pending=null;draw();return;
 }
 if(e.shiftKey){drag={kind:'box',start:worldPoint(e),original:new Set(multi)};board.setPointerCapture(e.pointerId);return;}
 const p=boardPoint(e);drag={kind:'pan',start:p,left:camera.x,top:camera.y,moved:false};board.setPointerCapture(e.pointerId);
});
board.addEventListener('pointermove',e=>{
 if(!drag)return;
 const p=drag.kind==='pan'?boardPoint(e):worldPoint(e);
 if(!drag.moved&&Math.hypot(p.x-drag.start.x,p.y-drag.start.y)<3)return;
 drag.moved=true;
 if(drag.kind==='pan'){camera.x=drag.left+p.x-drag.start.x;camera.y=drag.top+p.y-drag.start.y;}
 else if(drag.kind==='box'){
  drag.end=p;multi=new Set(drag.original);selected=null;
  const x=Math.min(p.x,drag.start.x),right=Math.max(p.x,drag.start.x),y=Math.min(p.y,drag.start.y),bottom=Math.max(p.y,drag.start.y);
  for(const n of doc.nodes)if(n.x<=right&&n.x+146>=x&&n.y<=bottom&&n.y+nodeHeight(n)>=y)multi.add(n.id);
 }
 else{for(const old of drag.positions){const n=doc.nodes.find(n=>n.id===old.id);if(n){n.x=Math.round((old.x+p.x-drag.start.x)/12)*12;n.y=Math.round((old.y+p.y-drag.start.y)/12)*12;}}}
 draw();
});
function finishDrag(){
 if(!drag)return;
 if(drag.kind==='node'&&drag.moved){history.push(drag.before);future=[];persist();}
 if(drag.kind==='pan'&&!drag.moved){selected=null;pending=null;multi.clear();draw();}
 const box=drag.kind==='box';drag=null;if(box)draw();
}
for(const event of ['pointerup','pointercancel','lostpointercapture'])board.addEventListener(event,finishDrag);
board.addEventListener('wheel',e=>{
 e.preventDefault();const p=boardPoint(e),world=worldPoint(e),scale=Math.max(.35,Math.min(2.5,camera.scale*(e.deltaY<0?1.1:.9)));
 camera={scale,x:p.x-world.x*scale,y:p.y-world.y*scale};draw();
},{passive:false});
function step(render=true){
 if(net.error){stop();selected=net.node;notify(net.error);draw();return;}
 try{
  if(peripheral?.done){stop();return;}
  const overrides=level.machine==='symphony'&&pendingKeys.length?{keyboard:pendingKeys[0]}:{};
  if(peripheral)overrides.input=peripheral.input;
  if(level.machine&&net.incoming.has('strobe')&&net.incoming.has('output')){
   const before=net.evaluate(state,overrides);
   if(before.inputs('strobe')[0]){
    const value=before.inputs('output')[0];terminal=(terminal+' '+value).trim().slice(-500);
    if(peripheral){peripheral.write(value);if(peripheral.done)stop();}
   }
   if(level.machine==='symphony'&&before.values.screen&&before.inputs('screen')[0]){
    const setting=before.values.b?.[0];if(setting<5)deviceScreen[setting]=before.values.operand?.[0]||0;
   }
   if((before.values.rom?.[0]>>>24)===3&&pendingKeys.length)pendingKeys.shift();
  }
  const result=net.tick(state,overrides);state=result.state;values=result.values;ticks++;
  if(Game.isComputer(level)){
   for(const w of result.writes)if(!level.machine&&w.id==='ram'&&w.address===255)terminal=(terminal+(w.value===10?'\n':String.fromCharCode(w.value))).slice(-500);
   if(values.ctrl?.[6]===0)stop();
  }
  records.push({tick:ticks,values:doc.nodes.filter(n=>definition(n).stateful||!definition(n).outputs.length).map(n=>n.label+'='+fmt(definition(n).outputs.length?values[n.id]?.[0]:result.inputs(n.id)[0],definition(n).outputs[0]?.width||definition(n).inputs[0]?.width))});
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
 if(level.verify){renderTests();$('hint').textContent='本组输入 '+Object.entries(c.input).map(([k,v])=>k+'='+v).join('，')+'。预期输出 ['+c.expected.join(', ')+']，实际输出 ['+c.actual.join(', ')+']。可设置断点，观察发生分歧时的寄存器和输出。';return;}
 if(c.state)state=clone(c.state);
 for(const n of doc.nodes)if(Object.hasOwn(c.input,n.id))n.value=c.input[n.id];
 values=net.evaluate(state).values;
 const bad=c.actual.findIndex((v,j)=>v!==c.expected[j]);focused=bad>=0?level.outputs[bad]:null;selected=focused;
 $('hint').textContent=bad>=0?`${Object.entries(c.input).map(([k,v])=>k+'='+v).join('，')} 时，${focused} 预期为 ${c.expected[bad]}，实际为 ${c.actual[bad]}。上游连线已标出，请检查各支路。`:'这一组符合预期。继续比较其他输入，解释信号变化。';
 draw();renderTests();
}
let testAttempt=0;
function exhaustiveWidths(){
 if(!level.expect||level.clocked||!level.inputs?.length)return null;
 const widths=level.inputs.map(id=>definition(doc.nodes.find(n=>n.id===id)||{type:'OUT'}).outputs[0]?.width||0);
 const total=widths.reduce((a,b)=>a+b,0);
 return widths.every(Boolean)&&total<=16?widths:null;
}
function recordPass(){
 completed[level.id]=true;focused=null;
 if(level.inputs&&level.outputs){
  try{
   const spec=Circuit.encapsulate(doc,level.title);spec.courseId=level.id;
   const index=library.findIndex(item=>item.courseId===level.id);
   if(index>=0)library[index]=spec;else if(library.length<100)library.push(spec);
   renderPalette();
  }catch{/* A valid large interface may exceed the chip packaging limit. */}
 }
 if(level.id.endsWith('-budget'))doc.bestArea=Math.min(doc.bestArea??Infinity,net.expandedCount);
 persist();renderNav();renderTests();
 $('hint').textContent=level.id.endsWith('-budget')?'已通过全部预算测试。最小通过规模：'+doc.bestArea+' 个展开元件。':'全部通过。可进入下一关，或打开世界地图选择实验。';
}
$('exhaustive').onclick=async()=>{
 const widths=exhaustiveWidths();if(!widths)return;
 if(net.error){notify(net.error);return;}
 if(!level.outputs.every(id=>net.incoming.has(id)&&net.incoming.get(id).length)){notify('请保留关卡输出端口');return;}
 stop();const attempt=++testAttempt,testingNet=net,total=2**widths.reduce((a,b)=>a+b,0),initial=net.initial();
 let last;
 for(let row=0;row<total;row++){
  if(row%256===0){
   $('results').textContent='正在穷举 '+row+' / '+total;
   await new Promise(resolve=>setTimeout(resolve,0));
   if(testingNet!==net||attempt!==testAttempt)return;
  }
  let packed=row;
  const args=widths.map(width=>{const v=packed%(2**width);packed=Math.floor(packed/2**width);return v;});
  const input=Object.fromEntries(level.inputs.map((id,i)=>[id,args[i]]));
  const r=net.evaluate(initial,input),actual=level.outputs.map(id=>r.inputs(id)[0]),expected=level.expect(args);
  last={input,actual,expected,pass:actual.every((v,i)=>v===expected[i])};
  if(!last.pass){testCases=[last];replay(0);notify('找到反例，已检查 '+(row+1)+' 组输入');return;}
 }
 testCases=[last];recordPass();
 $('results').textContent='全部 '+total+' 组输入符合预期。';
};
$('test').onclick=async()=>{
 const attempt=++testAttempt,testingNet=net;
 stop();
 if(net.error){selected=net.node;draw();notify(net.error);return;}
 if(![...(level.inputs||[]),...(level.outputs||[])].every(id=>doc.nodes.some(n=>n.id===id))){notify('缺少实验端口，请恢复关卡或保留原输入输出。');return;}
 testCases=[];let testState=net.initial();
 const inputs=level.verify?[]:level.vectors?level.vectors.map(v=>v.input):level.sequence||Array.from({length:2**(level.inputs||[]).length},(_,i)=>Object.fromEntries((level.inputs||[]).map((id,k)=>[id,(i>>(level.inputs.length-1-k))&1])));
 if(level.verify){
  try{
   if(level.trials){
    const steps=level.trials(net);$('results').textContent='正在运行场景…';
    let r;do{
     r=steps.next();if(!r.done)await new Promise(resolve=>setTimeout(resolve,0));
     if(net!==testingNet||attempt!==testAttempt)return;
    }while(!r.done);testCases=r.value;
   }else testCases=level.verify(net,doc);
  }catch(e){notify('验证需要完整的关卡端口：'+e.message);return;}
 }
 else for(const [index,input] of inputs.entries()){
  let result;
  try{
   if(level.sequence||level.clocked){result=net.tick(testState,input);testState=result.state;}
   else result=net.evaluate(testState,input);
  }catch(e){notify(e.message);return;}
  const expected=level.vectors?level.vectors[index].expected:level.sequence?[input.Q]:level.expect(level.inputs.map(id=>input[id]));
  const actual=level.outputs.map(id=>result.inputs(id)[0]);
  testCases.push({input:Object.fromEntries(level.inputs.map(id=>[id,input[id]])),expected,actual,pass:actual.every((v,i)=>v===expected[i]),state:clone(testState)});
 }
 const failure=testCases.findIndex(c=>!c.pass);
 if(failure<0){
  recordPass();notify('✓ 实验验证通过');
 }
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
  const o8=level.machine==='overture';
  const result=o8?Game.overture.assemble($('program').value,$('isa-rules').value):level.machine==='symphony'?Game.symphony.assemble($('program').value):Circuit.assemble($('program').value);
  const rom=doc.nodes.find(n=>n.id==='rom'&&['ROM16','ROM32'].includes(n.type));if(!rom)throw Error('缺少程序 ROM');
  checkpoint();rom.program=result.words;doc.source=$('program').value;delete doc.draftSource;if(o8){doc.isa=$('isa-rules').value;delete doc.draftIsa;}edit();notify('已加载 '+result.words.length+' 条指令，状态已复位');
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
  const b=button((completed[l.id]?'✓ ':'○ ')+l.title,()=>{$('world').close();openLevel(l.id);},completed[l.id]?'done':'');b.disabled=!!locked(l);if(b.disabled)b.title='先完成「'+Game.prerequisite(l).title+'」';section.append(b);
 }
 $('world').showModal();
}
$('home').onclick=showWorld;$('close-world').onclick=()=>$('world').close();
// ROM disassembly with live PC and breakpoints.
const debug=document.createElement('div');debug.id='debugger';$('program-panel').append(debug);
const display=document.createElement('canvas');display.id='cpu-screen';display.width=8;display.height=8;display.setAttribute('aria-label','RGB332 显存屏幕');$('program-panel').append(display);
function syncProgramPanel(){
 const o8=level.machine==='overture';
 $('isa-panel').hidden=!o8;
 $('keyboard-input').hidden=level.machine!=='symphony';
 $('use-machine').hidden=!level.machine;
 $('program-heading').textContent=o8?'Overture 汇编程序':level.machine==='symphony'?'Symphony 汇编程序':'CM8 汇编程序';
 $('instruction-guide').textContent=o8?'IMM 常数，MOV 目的, 来源。ALU 用 R1、R2 计算，存入 R3。跳转读取 R0。DB 可直接装入一个字节。':'LDI / ADD / SUB / AND / OR / XOR / LD / ST / JMP / JZ / HLT。立即数与数据均为 8 位。';
 if(o8)$('isa-rules').value=doc.draftIsa??doc.isa??Game.overture.defaultRules;
 if(level.machine==='symphony')$('instruction-guide').textContent='MOV / ADD / SUB / CMP / JE / JMP / LOAD_8、16、32 / STORE_8、16、32 / PUSH / POP / CALL / RET。寄存器 ZR、R1～R13、SP、FLAGS。标签使用字节地址。';
}
$('use-machine').onclick=()=>{
 if(!level.machine||net.error){notify(net.error||'请选择处理器关卡');return;}
 const rom=doc.nodes.find(n=>n.id==='rom'),cpu32=level.machine==='symphony';
 if(rom?.type!==(cpu32?'ROM32':'ROM16')||!['pc','input','output','strobe'].every(id=>net.incoming.has(id))){notify('保留本架构的 PC、程序 ROM、输入、输出与输出有效端口后再登记。');return;}
 saved['machine-'+level.machine]=clone(doc);persist();notify('已登记。首次进入本架构的编程关卡时，会将关卡程序装入这台机器。');
};
$('program').oninput=()=>{doc.draftSource=$('program').value;persist();};
$('isa-rules').oninput=()=>{doc.draftIsa=$('isa-rules').value;persist();};
function renderDebugger(){
 const rom=doc.nodes.find(n=>n.id==='rom');debug.replaceChildren();if(!rom)return;
 const title=document.createElement('h3');title.textContent='机器指令 · 点击设置断点';debug.append(title);
 const stride=rom.type==='ROM32'?4:1;
 const instructions=rom.program||[],pc=Math.floor((values.pc?.[0]||0)/stride),names=Object.fromEntries(Object.entries(Circuit.opcodes).map(([k,v])=>[v,k]));
 let rules;if(level.machine==='overture'){try{rules=Game.overture.parseRules(doc.isa??Game.overture.defaultRules);}catch{return;}}
 for(let i=Math.max(0,pc-3);i<Math.min(instructions.length,pc+7);i++){
  const address=i*stride;
  const word=instructions[i],decoded=stride===4?'0x'+word.toString(16).padStart(8,'0'):rules?Game.overture.disassemble(word,rules):(names[word>>>8]||'???')+' '+(word&255);
  const b=button((breakpoints.has(address)?'● ':'  ')+address.toString(16).padStart(2,'0')+'  '+decoded,()=>{breakpoints.has(address)?breakpoints.delete(address):breakpoints.add(address);renderDebugger();},i===pc?'current-instruction':'');debug.append(b);
 }
}
function renderScreen(){
 display.hidden=['mines','mines32'].includes(level.id);if(display.hidden)return;
 const ctx=display.getContext('2d');if(!ctx)return;
 if(level.machine==='symphony'){
  const ram=state.ram||{},mode=deviceScreen[0]||0,offset=(deviceScreen[1]||0)&65535;
  const rgb=v=>'rgb('+((v>>>5)*255/7)+','+(((v>>>2)&7)*255/7)+','+((v&3)*85)+')';
  if(mode===2||mode===3){
   const scale=Math.min(256,(deviceScreen[2]??1)+1);
   display.width=4*scale;display.height=3*scale;
   for(let i=0;i<display.width*display.height;i++){
    const a=(offset+i*(mode===2?1:4))&65535;
    ctx.fillStyle=mode===2?rgb(ram[a]||0):'rgb('+[0,1,2].map(k=>ram[(a+k)&65535]||0).join(',')+')';
    ctx.fillRect(i%display.width,Math.floor(i/display.width),1,1);
   }
  }else{
   display.width=768;display.height=480;ctx.fillStyle='#111';ctx.fillRect(0,0,768,480);
   ctx.font='12px monospace';
   for(let row=0;row<40;row++)for(let col=0;col<96;col++){
    const a=(offset+(row*96+col)*(mode===1?4:1))&65535,code=ram[a]||0;
    if(mode===1){ctx.fillStyle=rgb(ram[(a+2)&65535]||0);ctx.fillRect(col*8,row*12,8,12);}
    if(code>=32){ctx.fillStyle=mode===1?rgb(ram[(a+1)&65535]||0):'#cde';ctx.fillText(String.fromCharCode(code),col*8,row*12+11);}
   }
  }
  return;
 }
 if(display.width!==8||display.height!==8){display.width=8;display.height=8;}
 const memory=state.ram||[];for(let i=0;i<64;i++){const v=memory[128+i]||0;ctx.fillStyle='rgb('+((v>>>5)*255/7)+','+(((v>>>2)&7)*255/7)+','+((v&3)*85)+')';ctx.fillRect(i%8,Math.floor(i/8),1,1);}
}
$('keyboard-input').onkeydown=e=>{
 const codes={ArrowLeft:0,ArrowUp:1,ArrowRight:2,ArrowDown:3,Enter:13,Escape:27,Backspace:8};
 const code=codes[e.key]??(e.key.length===1?e.key.charCodeAt(0):undefined);
 if(code!==undefined){e.preventDefault();e.stopPropagation();pendingKeys.push(256|(code&255));}
};
$('keyboard-input').onkeyup=e=>{
 const codes={ArrowLeft:0,ArrowUp:1,ArrowRight:2,ArrowDown:3,Enter:13,Escape:27,Backspace:8};
 const code=codes[e.key]??(e.key.length===1?e.key.charCodeAt(0):undefined);
 if(code!==undefined){e.preventDefault();pendingKeys.push(code&255);}
};
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

