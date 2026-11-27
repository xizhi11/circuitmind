'use strict';
const $=id=>document.getElementById(id);
const {types,definition,compile,clone,validate}=Circuit;
const board=$('board'),scene=$('scene');
let level=Game.levels[0],doc,net,state,values={},selected=null,pending=null,drag=null;
let timer=null,ticks=0,history=[],future=[],records=[],focused=null,testCases=[],testIndex=-1,terminal='';
let replayCase=null;
let camera={x:0,y:0,scale:1},serial=0;
let viewport={width:1280,height:760},draggedPart=null;
let inspectionStack=[],multi=new Set(),clipboard=null;
let completed={},saved={},library=[],breakpoints=new Set();
let storageDatabase=null;
let mineFlags=false,deviceScreen=[],pendingKeys=[],peripheral=null,workshopEditing=false,mazeMapIndex=0;
let studio=null,studioAudio=null,programTarget='sender';
const lightKit=Game.lightWorkshop;
let light=null;
let round=null;
let guided=true,detailTab='component',paletteCategory=null,traceSignals=[];
const detailScreens={component:'detail-ports',verify:'detail-tests',signals:'detail-trace',program:'detail-code'};
try{guided=localStorage.getItem('cm-guided')!=='false';}catch{}
function showDetails(tab,open=true){
 detailTab=tab;
 for(const [name,id] of Object.entries(detailScreens)){
  $(id).hidden=name!==tab;
  $('detail-'+name).setAttribute('aria-pressed',String(name===tab));
 }
 $('detail-body').hidden=!open;
 $('detail-toggle').textContent=open?'收起':'展开';
 $('detail-toggle').setAttribute('aria-expanded',String(open));
 if(open&&tab==='signals')renderTrace();
 if(open&&tab==='component'&&doc)renderInspector();
}
for(const tab of Object.keys(detailScreens))$('detail-'+tab).onclick=()=>showDetails(tab);
$('detail-toggle').onclick=()=>showDetails(detailTab,$('detail-body').hidden);
function locked(l){
 const prior=Game.prerequisite(l);
 return guided&&!completed[l.id]&&prior&&!completed[prior.id];
}
function nextLevel(){
 if(level.workshop)return null;
 const path=guided&&Game.guidedPath.includes(level)?Game.guidedPath:Game.levels.filter(l=>!l.workshop);
 return path[path.indexOf(level)+1];
}
function firstAvailable(){
 return Game.guidedPath.find(l=>Game.isGraded(l)&&!completed[l.id]&&!locked(l))||Game.guidedPath[0];
}
function visibleLessons(){
 return guided?[...Game.guidedPath,Game.levels.find(l=>l.id==='sandbox')]:Game.levels.filter(l=>!l.workshop);
}
$('guided').checked=guided;
$('guided').onchange=()=>{
 guided=$('guided').checked;
 try{localStorage.setItem('cm-guided',String(guided));}catch{}
 openLevel(locked(level)?firstAvailable().id:level.id);
};
$('next-level').onclick=()=>{
 const next=nextLevel();
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
function syncClock(){
 const finished=replayCase&&ticks>=replayCase.end;
 $('run').disabled=!!timer||!!finished;
 $('step').disabled=!!finished;
 $('pause').disabled=!timer;
 $('run').setAttribute('aria-pressed',String(!!timer));
 const rate=Number($('speed').value)||100;
 $('clock-rate').textContent=`CLK ${rate>=1000?rate/1000+' kHz':rate+' Hz'} · ${1000/rate} ms`;
}
function stop(){clearInterval(timer);timer=null;if(studio)studio.auto=false;syncClock();}
function statefulModule(n){
 return n.type==='CUSTOM'&&['sr-latch','dff-build','register','register8','pc-build'].includes(n.spec.courseId);
}
function stateProbe(n,d){
 return (d.stateful&&!d.memory)||statefulModule(n);
}
function compileCurrent(reset=true){
 net=compile(doc.nodes,doc.wires);
 traceSignals=doc.nodes.flatMap(n=>{
  const d=definition(n);
  const port=d.outputs[0]||d.inputs[0];
  if(port&&(stateProbe(n,d)||!d.inputs.length||!d.outputs.length)){
   return [{id:n.id,label:n.label,output:!!d.outputs.length,width:port.width}];
  }
  return [];
 }).slice(0,24);
 if(reset){ticks=0;records=[];terminal='';deviceScreen=[];pendingKeys=[];$('step-summary').textContent='';peripheral=level.createDevice?.(level.workshop==='maze'?mazeMapIndex:0)??null;state=net.error?{}:net.initial();}
 if(reset){
  studio=level.demo?{auto:false,mask:0,keys:0,nextAt:0,budget:0,status:'',link:level.demo==='link'?Game.workshopKit.transport():null}:null;
  if(level.demo==='shell'&&state.storage)state.storage=Game.workshopKit.diskImage();
  light=level.workshop==='light'?{output:null,trail:[]}:null;
 }
 if(!net.error){
  const result=net.evaluate(state,peripheral?{input:peripheral.input}:{});
  values=result.values;
  if(light)sampleLight(result);
 }else{
  values={};
  if(light)light.output=null;
 }
}
function edit(){restoreLive();stop();focused=null;testCases=[];testIndex=-1;compileCurrent();persist();draw();renderPassStatus();renderTests();renderTrace();}
function starterCircuit(){
 if(level.workshopBuildOf)return {nodes:[],wires:[]};
 const build=guided&&level.courseBuild?level.courseBuild:level.build;
 const base=build();
 if(guided&&level.courseSubstitutions){
  const specs=new Map(offeredModules().map(spec=>[spec.courseId,spec]));
  base.nodes=base.nodes.flatMap(n=>{
   const courseId=level.courseSubstitutions[n.type];
   if(!courseId)return [n];
   const spec=specs.get(courseId);
   return spec?[{...n,type:'CUSTOM',spec}]:[];
  });
 }
 return base;
}
function usesMineDevice(){return level.id==='mines32'||level.workshop==='mines';}
function setWorkshopView(editing){
 workshopEditing=editing;
 const playing=level.workshop&&!editing;
 if(playing)document.body.classList.add('workshop-play');
 else document.body.classList.remove('workshop-play');
 $('workshop-play').hidden=!playing;
 $('maze-panel').hidden=level.workshop!=='maze';
 $('light-panel').hidden=level.workshop!=='light';
 $('studio-panel').hidden=!level.demo;
 $('workshop-guide').hidden=!level.workshop;
 const toggle=$('workshop-view');
 toggle.hidden=!level.workshop;
 toggle.textContent=playing?(level.workshop==='light'?'查看与编辑电路':'编辑电路与汇编'):'返回试玩';
 const host=$(playing&&level.workshop==='mines'?'workshop-play':'program-panel');
 const panel=$('mines-panel');
 if(panel.parentElement!==host)host.append(panel);
 if(editing&&level.workshop)showDetails(Game.isComputer(level)?'program':'component');
}
function openLevel(id,fresh=false,keepContext=false,editor=false){
 restoreLive();
 if($('completion-dialog').open)$('completion-dialog').close();
 if(!keepContext)inspectionStack=[];multi.clear();
 stop();round=null;level=Game.levels.find(l=>l.id===id)||Game.levels[0];
 mazeMapIndex=0;
 if(level.workshop==='maze'){
  $('maze-map').replaceChildren(...level.maps.map((name,index)=>{
   const option=document.createElement('option');option.textContent=name;option.value=index;return option;
  }));
  $('maze-map').value='0';
 }
 doc=clone(!fresh&&saved[level.id]?saved[level.id]:starterCircuit());
 const machine=level.id.startsWith('cm8-')?'cm8':level.machine;
 if(machine&&!level.workshop&&(!saved[level.id]||fresh&&machine==='cm8')&&!level.id.startsWith('wire-')&&saved['machine-'+machine]){
  const base=doc,own=clone(saved['machine-'+machine]);
  const rom=own.nodes.find(n=>n.id==='rom'),image=base.nodes.find(n=>n.id==='rom');
  if(rom&&image&&rom.type===image.type){
   rom.program=clone(image.program);own.source=base.source;delete own.draftSource;delete own.draftIsa;
   if(level.id==='mines32'){
    const seed=own.nodes.find(n=>n.id==='input');if(seed)seed.value=base.nodes.find(n=>n.id==='input').value;
   }
   doc=own;
  }
 }
 try{validate(doc);}catch{doc=clone(starterCircuit());}
 selected=null;pending=null;focused=null;history=[];future=[];testCases=[];testIndex=-1;
 compileCurrent();camera={x:0,y:0,scale:1};
 const goal=guided&&level.courseGoal||level.text;
 $('tag').textContent=level.tag;$('title').textContent=guided&&level.id==='full'?level.courseName:level.title;$('description').textContent=goal;
 $('drill-panel').hidden=!level.drill;
 if(level.drill)document.body.classList.add('drill-mode');else document.body.classList.remove('drill-mode');
 if(level.drill){$('drill-question').textContent=doc.bestTime?'最佳 '+(doc.bestTime/1000).toFixed(2)+' 秒':'';$('drill-answer').hidden=true;$('drill-submit').hidden=true;}
 breakpoints.clear();
 $('program-panel').hidden=!Game.isComputer(level);
 programTarget='sender';$('workshop-program-target').value=programTarget;
 $('workshop-program-picker').hidden=level.demo!=='link';
 syncProgramSource();
 $('detail-program').hidden=!Game.isComputer(level);
 showDetails(Game.isComputer(level)?'program':'component',true);
 syncProgramPanel();
 $('test').disabled=!level.expect&&!level.sequence&&!level.vectors&&!level.verify;
 $('exhaustive').hidden=!exhaustiveWidths();
 $('test-title').textContent=Game.isComputer(level)?'机器与终端':level.id==='sandbox'||level.id==='counter'?'电路状态':'验证你的电路';
 $('hint').textContent=goal;
 const mines=usesMineDevice();
 $('mines-panel').hidden=!mines&&level.id!=='mines';
 $('mine-mode').hidden=!mines;mineFlags=false;
 $('mine-help').hidden=level.workshop!=='mines';
 $('mine-flags').hidden=level.workshop!=='mines';
 $('mine-new-game').hidden=level.workshop!=='mines';
 $('mine-heading').textContent=mines?'扫雷 · 8 × 8':'CPU 屏幕 · 3 × 3';
 if(level.demo)prepareStudio();
 if(light)prepareLight();
 setWorkshopView(editor||!!level.workshopBuildOf);
 renderNav();renderPassStatus();renderPalette();$('fit').click();renderTests();renderTrace();
}
function renderNav(){
 $('levels').replaceChildren();
 let chapter='';
 for(const l of visibleLessons()){
  if(l.chapter!==chapter){chapter=l.chapter;const h=document.createElement('h3');h.textContent=chapter;h.className='chapter-title';$('levels').append(h);}
  const title=guided&&l.id==='full'?l.courseName:l.title;
  const b=button((completed[l.id]?'✓ ':'')+title,()=>openLevel(l.id),l.id===level.id?'active':'');
  b.disabled=!!locked(l);if(b.disabled)b.title='先完成「'+Game.prerequisite(l).title+'」';
  b.setAttribute('aria-current',l.id===level.id?'page':'false');$('levels').append(b);
 }
 const lessons=visibleLessons().filter(Game.isGraded);
 $('progress').textContent=lessons.filter(l=>completed[l.id]).length+' / '+lessons.length+' 项实验已验证';
 const next=nextLevel();
 $('next-level').hidden=!next||!!locked(next)||(!completed[level.id]&&Game.isGraded(level));
}
function renderPassStatus(detail=''){
 const status=$('completion-status');
 status.className=detail?'current':'';
 status.textContent=detail?'本次通过 · '+detail:completed[level.id]?'此前已通过':'';
}
function completeLevel(detail,reward=''){
 const first=!completed[level.id];
 const next=nextLevel(),wasLocked=next&&locked(next);
 clearTimeout(notify.timeout);
 $('toast').classList.remove('show');$('toast').textContent='';
 completed[level.id]=true;
 persist();renderNav();renderPassStatus(detail);
 const dialog=$('completion-dialog');
 if(!first||dialog.open)return;
 const canAdvance=next&&!locked(next);
 const lessons=visibleLessons().filter(Game.isGraded);
 const done=lessons.filter(l=>completed[l.id]).length;
 const finishedRoute=guided&&Game.guidedPath.at(-1)===level&&done===lessons.length;
 $('completion-title').textContent=finishedRoute?'教学路线已完成':'完成「'+$('title').textContent+'」';
 const lead=level.drill?'':Game.isComputer(level)?'程序跑通了！':'搭对了！';
 $('completion-result').textContent=lead+detail+'。';
 $('completion-reward').textContent=reward;
 $('completion-progress').hidden=!lessons.includes(level);
 $('completion-count').textContent='已完成 '+done+' / '+lessons.length+' 项实验';
 $('completion-meter').max=lessons.length;
 $('completion-meter').value=done;
 $('completion-next-name').textContent=canAdvance?(wasLocked?'已解锁「':'下一关「')+next.title+'」':
  finishedRoute?'可以去创意工坊试跑程序，观察 CPU 和外设怎么配合。':'';
 $('completion-next').textContent=canAdvance?'进入下一关':finishedRoute?'去创意工坊':'打开关卡地图';
 $('completion-next').onclick=()=>{
  dialog.close();
  if(canAdvance){openLevel(next.id);$('title').focus();}
  else $(finishedRoute?'workshop':'home').click();
 };
 dialog.showModal();
}
$('completion-stay').onclick=()=>$('completion-dialog').close();
$('completion-dialog').addEventListener('close',()=>{
 if(level.drill&&$('drill-answer').hidden&&document.activeElement===document.body)$('drill-start').focus();
});
function showQuestion(){
 $('drill-answer').value='';$('drill-question').textContent=(round.index+1)+' / '+round.items.length+'　'+round.items[round.index].prompt;
 $('drill-answer').focus();
}
$('drill-start').onclick=()=>{
 renderPassStatus();
 round={items:level.drill(),index:0,start:performance.now()};
 $('drill-answer').hidden=false;$('drill-submit').hidden=false;showQuestion();
};
$('drill-submit').onclick=()=>{
 if(!round)return;
 const q=round.items[round.index],answer=$('drill-answer').value.trim().toUpperCase();
 if(!(q.radix===2?/^[01]+$/:/^[0-9A-F]+$/).test(answer)||parseInt(answer,q.radix)!==parseInt(q.answer,q.radix)){notify('再检查一下位权或真值表');return;}
 if(++round.index<round.items.length){showQuestion();return;}
 const elapsed=Math.round(performance.now()-round.start),improved=elapsed<(doc.bestTime??Infinity),total=round.items.length;
 doc.bestTime=Math.min(doc.bestTime??Infinity,elapsed);
 round=null;$('drill-answer').hidden=true;$('drill-submit').hidden=true;
 $('drill-question').textContent='八题全对 · 本次 '+(elapsed/1000).toFixed(2)+' 秒 · 最佳 '+(doc.bestTime/1000).toFixed(2)+' 秒';
 completeLevel(total+' / '+total+' 题答对'+(improved?' · 最佳用时 '+(elapsed/1000).toFixed(2)+' 秒':''));
};
$('drill-answer').onkeydown=e=>{if(e.key==='Enter')$('drill-submit').click();};
const componentCategories=[['logic','◇','布尔'],['word','＋','整型'],['other','▱','杂项'],['io','↔','输入输出'],['custom','▣','自定义']];
function componentCategory(type){
 if(type==='CUSTOM')return 'custom';
 if(/^(IN|OUT)(8|16|32)?$/.test(type)||['BIT','SCREEN8'].includes(type))return 'io';
 if(['NAND','NOT','AND','OR','XOR','NOR','XNOR'].includes(type))return 'logic';
 if(/^(ADD|SUB|AND|OR|XOR|NOT|EQ|LT|SHL|SHR|MUX|SPLIT|JOIN|BUS|TRI)\d+$/.test(type)||type==='ALU8'||type==='CONST')return 'word';
 return 'other';
}
function placeComponent(type,spec,position){
 const offset=doc.nodes.length%6*18;
 const x=position?.x??(viewport.width/2-camera.x)/camera.scale-73+offset;
 const y=position?.y??(viewport.height/2-camera.y)/camera.scale-35+offset;
 const id='n'+Date.now()+'-'+serial++;
 const node=Game.node(id,type,Math.round(x/12)*12,Math.round(y/12)*12,spec?.name||type);
 if(spec)node.spec=clone(spec);
 checkpoint();doc.nodes.push(node);multi.clear();selected=id;edit();showDetails('component');
}
function paletteButton(type,spec){
 const category=componentCategory(type);
 const b=button('',()=>placeComponent(type,spec),'component-entry');
 b.setAttribute('data-component-category',category);
 const glyph=document.createElement('span');glyph.className='component-glyph';
 glyph.textContent=componentCategories.find(item=>item[0]===category)[1];
 glyph.setAttribute('aria-hidden','true');
 b.append(glyph,spec?.name||type);b.componentCategory=category;
 const d=spec||definition({type});
 b.title=d.inputs.map(p=>p.name+' '+p.width+' 位').join(' / ')+' → '+d.outputs.map(p=>p.name+' '+p.width+' 位').join(' / ');
 b.draggable=true;
 b.ondragstart=e=>{
  draggedPart={type,spec};e.dataTransfer.setData('text/plain',spec?.name||type);
  e.dataTransfer.effectAllowed='copy';
 };
 b.ondragend=()=>{draggedPart=null;};
 return b;
}
function allowedTypes(){return guided&&level.courseParts?level.courseParts:level.allowed||Object.keys(types).filter(t=>!t.startsWith('BUF'));}
function offeredModules(){
 if(!guided||!level.courseParts)return library;
 return library.filter(spec=>completed[spec.courseId]&&level.courseModules.includes(spec.courseId));
}
function renderPalette(){
 $('reference-library').hidden=!!(guided&&level.courseParts);
 $('palette').replaceChildren();
 const allowed=[...new Set(allowedTypes())],modules=offeredModules();
 const available=new Set(allowed.map(componentCategory));
 if(modules.length)available.add('custom');
 if(!available.has(paletteCategory))paletteCategory=available.values().next().value;
 $('palette-categories').replaceChildren();
 for(const [category,symbol,title] of componentCategories){
  const b=button('',()=>{paletteCategory=category;$('component-search').value='';filterPalette();});
  const icon=document.createElement('span');icon.className='category-symbol';icon.textContent=symbol;icon.setAttribute('aria-hidden','true');
  b.setAttribute('data-component-category',category);
  b.append(icon,title);b.componentCategory=category;b.disabled=!available.has(category);$('palette-categories').append(b);
 }
 for(const type of allowed)$('palette').append(paletteButton(type));
 for(const spec of modules)$('palette').append(paletteButton('CUSTOM',spec));
 const empty=document.createElement('p');empty.id='palette-empty';empty.className='muted';empty.textContent='没有可用元件';$('palette').append(empty);
 filterPalette();
}
function filterPalette(){
 const query=$('component-search').value.trim().toLowerCase();
 let count=0;
 for(const child of $('palette').children)if(child.tagName==='BUTTON'){
  child.hidden=query?!((child.textContent+' '+child.title).toLowerCase().includes(query)):child.componentCategory!==paletteCategory;
  if(!child.hidden)count++;
 }
 for(const child of $('palette').children)if(child.id==='palette-empty')child.hidden=count>0;
 for(const child of $('palette-categories').children)child.setAttribute('aria-pressed',String(!query&&child.componentCategory===paletteCategory));
}
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
  showDetails('verify');download(evidence,'CircuitMind-evidence.json');notify('已返回仿真检查结果');
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
function ledClass(v){return 'led '+(v===1?'on':v===0?'off':v===undefined?'':'unknown');}
function signalLed(v){
 const led=document.createElement('i');
 led.className=ledClass(v);
 led.setAttribute('aria-hidden','true');
 return led;
}
const inputTypes=new Set(['IN','IN8','IN16','IN32','BIT']);
const outputTypes=new Set(['OUT','OUT8','OUT16','OUT32']);
function externalInput(n){return !!peripheral&&n.id==='input';}
function setInputValue(n,value){
 if(externalInput(n))return;
 const max=2**definition(n).outputs[0].width-1;
 if(!Number.isInteger(value)||value<0||value>max){notify('输入值超出范围');return;}
 const wasReplaying=!!replayCase;
 restoreLive();
 if(value===(n.value??0)){if(wasReplaying)refreshReplayView();return;}
 checkpoint();n.value=value;focused=null;compileCurrent(false);persist();
 if(selected===n.id&&detailTab==='component'&&!$('detail-body').hidden)renderInspector();
 if(wasReplaying)refreshReplayView();else draw();
}
function bitAt(value,i){return typeof value==='number'?Math.floor(value/2**i)%2:value;}
function toggleInputBit(id,i){
 const n=doc.nodes.find(node=>node.id===id),value=replayCase?.inputs[id]??n?.value??0;
 if(n)setInputValue(n,value+(bitAt(value,i)===0?1:-1)*2**i);
}
const signalViews=new WeakMap();
function renderSignalList(monitor,signals,empty){
 const key=JSON.stringify(signals.map(({id,label,width,editable})=>[id,label,width,editable]));
 let view=signalViews.get(monitor);
 if(view?.key!==key){
  monitor.replaceChildren();
  if(!signals.length)monitor.textContent=empty;
  const rows=signals.map(({id,label,width,editable})=>{
   const row=document.createElement('div');row.className=width===1?'signal-row single-bit':'signal-row';
   const caption=document.createElement('div');caption.className='signal-caption';
   const name=document.createElement('span');name.textContent=label;name.title=label;
   const number=document.createElement('b');
   caption.append(name,number);row.append(caption);
   const bits=document.createElement('div');bits.className='signal-bits';
   const controls=Array.from({length:width},(_,position)=>{
    const i=width-1-position,led=signalLed();
    if(!editable){bits.append(led);return {led};}
    const toggle=button('',()=>toggleInputBit(id,i),'signal-toggle');
    const name=width===1?label:label+' 第 '+i+' 位';
    toggle.type='button';toggle.title=name+' · 点击切换';
    toggle.setAttribute('aria-label',name);toggle.append(led);bits.append(toggle);
    return {led,toggle};
   });
   row.append(bits);monitor.append(row);
   return {number,bits,controls};
  });
  view={key,rows};signalViews.set(monitor,view);
 }
 signals.forEach(({label,width,value,disconnected,editable},index)=>{
  const {number,bits,controls}=view.rows[index];
  const display=disconnected?'未连接':fmt(value,width);
  if(number.textContent===display)return;
  number.textContent=display;
  if(!editable){
   const binary=typeof value==='number'?value.toString(2).padStart(width,'0'):display;
   bits.setAttribute('role','img');bits.setAttribute('aria-label',label+' '+binary);
  }
  controls.forEach(({led,toggle},position)=>{
   const bit=bitAt(value,width-1-position);
   led.className=ledClass(bit);
   if(toggle)toggle.setAttribute('aria-pressed',String(bit===1));
  });
 });
}
function renderMonitor(){
 $('monitor-tick').textContent=String(ticks).padStart(3,'0');
 const inputs=[],outputs=[],registers=[];
 for(const n of doc.nodes){
  const d=definition(n),signal={id:n.id,label:n.label,width:d.outputs[0]?.width??d.inputs[0]?.width};
  if(inputTypes.has(n.type)){
   const editable=!externalInput(n);
   inputs.push({...signal,editable,value:values[n.id]?.[0]??(editable?(n.value??0):peripheral.input)});
  }else if(outputTypes.has(n.type)){
   const wire=net.incoming?.get(n.id)?.[0]??sourceOf(n.id,0);
   outputs.push({...signal,value:wire?wireValue(wire):undefined,disconnected:!wire});
  }else if(stateProbe(n,d)){
   const value=values[n.id]?.[0];
   registers.push({...signal,value:value===undefined?state[n.id]:value});
  }
 }
 renderSignalList($('monitor-inputs'),inputs,'暂无输入');
 renderSignalList($('monitor-outputs'),outputs,'暂无输出');
 renderSignalList($('monitor-registers'),registers,'暂无寄存器');
}
const wireColors={cyan:'青色 · 数据',orange:'橙色 · 地址',green:'绿色 · 使能',purple:'品红 · 反馈'};
function wireColor(w,target,width){
 if(Object.hasOwn(wireColors,w.color))return w.color;
 const pin=definition(target).inputs[w.pin]?.name||'';
 if(/^(EN|WE|WRITE|RUN|CLK|DIS|S)$|使能|写入/.test(pin))return 'green';
 if(/ADR|地址|PC|IR/.test(pin))return 'orange';
 return width>1?'cyan':'purple';
}
function draw(){
 if(level.workshop&&!workshopEditing){
  if(level.workshop==='maze')renderMaze();else if(usesMineDevice())renderMineDevice();else if(light)renderLight();else if(level.demo)renderStudio();
  return;
 }
 $('back-circuit').hidden=!inspectionStack.length;
 scene.replaceChildren();scene.setAttribute('transform',`translate(${camera.x} ${camera.y}) scale(${camera.scale})`);
 const nodes=new Map(doc.nodes.map(n=>[n.id,n])),traced=new Set(),visited=new Set();
 function trace(id){
  const n=nodes.get(id);
  if(!n||visited.has(id)||stateProbe(n,definition(n)))return;
  visited.add(id);
  for(const w of doc.wires.filter(w=>w.to===id)){traced.add(w.id);trace(w.from);}
 }
 if(focused)trace(focused);
 const junctions=new Map();
 for(const w of doc.wires){
  const a=nodes.get(w.from),b=nodes.get(w.to);if(!a||!b)continue;
  const [x,y]=portPosition(a,w.output??0,true),[tx,ty]=portPosition(b,w.pin,false);
  const bend=tx>x+30?(tx+x)/2:Math.max(x,tx)+38;
  const path=w.points?.length?`M${x},${y} `+w.points.map(p=>`H${p.x} V${p.y}`).join(' ')+` H${tx-20} V${ty} H${tx}`:`M${x},${y} H${bend} V${ty} H${tx}`,value=wireValue(w);
  const width=definition(a).outputs[w.output??0]?.width||1,color=wireColor(w,b,width);
  const cls=`wire ${color} ${width>1?'bus':''} ${value==='X'?'conflict':value===null?'floating':value?'high':''} ${selected===w.id?'selected':''} ${traced.has(w.id)?'traced':''}`;
  const hit=svg('path',{d:path,class:'wire-hit'});hit.addEventListener('pointerdown',e=>e.stopPropagation());hit.onclick=e=>{e.stopPropagation();multi.clear();selected=w.id;showDetails('component');draw();};
  svg('path',{d:path,class:cls});
  if(!w.points?.length||w.points[0].x>=x+12){
   const key=w.from+':'+(w.output??0),junction=junctions.get(key)||{x:x+12,y,count:0,color};
   junction.count++;junctions.set(key,junction);
  }
  if(!timer&&typeof value==='number'&&value&&doc.wires.length<140){const dot=svg('circle',{r:2.6,class:'signal-dot'});svg('animateMotion',{path,dur:Math.max(.7,(Math.abs(tx-x)+Math.abs(ty-y))/190)+'s',repeatCount:'indefinite'},dot);}
  if(selected===w.id||w.comment){svg('text',{x:(x+tx)/2,y:(y+ty)/2-9,class:'wire-label'}).textContent=w.comment||fmt(value,width);}
 }
 for(const {x,y,count,color} of junctions.values())if(count>1)svg('circle',{cx:x,cy:y,r:3.6,class:'wire-junction '+color});
 for(const n of doc.nodes){
  const d=definition(n),g=svg('g',{class:`node ${selected===n.id||multi.has(n.id)?'selected':''} ${focused===n.id?'failed':''}`,'data-id':n.id,'data-component-category':componentCategory(n.type)});
  const rect=svg('rect',{x:n.x,y:n.y,width:146,height:nodeHeight(n),rx:9},g);
  const chars=Array.from(n.label||n.type);
  svg('text',{x:n.x+12,y:n.y+22,class:'node-title'},g).textContent=chars.length>11?chars.slice(0,10).join('')+'…':chars.join('');
  if(n.label!==n.type&&chars.length<10)svg('text',{x:n.x+134,y:n.y+22,'text-anchor':'end',class:'node-kind'},g).textContent=n.type;
  rect.addEventListener('pointerdown',e=>{
   if(e.button!==0)return;e.stopPropagation();const pt=worldPoint(e);
   if(e.shiftKey){multi.has(n.id)?multi.delete(n.id):multi.add(n.id);selected=[...multi].at(-1)??null;draw();return;}
   if(!multi.has(n.id)){multi.clear();multi.add(n.id);}
   drag={kind:'node',id:n.id,start:pt,left:n.x,top:n.y,before:clone(doc),positions:doc.nodes.filter(t=>multi.has(t.id)).map(t=>({id:t.id,x:t.x,y:t.y})),moved:false};
   selected=n.id;showDetails('component');board.setPointerCapture(e.pointerId);draw();
  });
  for(const output of [false,true]){
   const ports=output?d.outputs:d.inputs;
   ports.forEach((p,i)=>{
    const [cx,cy]=portPosition(n,i,output);const w=output?null:sourceOf(n.id,i);const v=output?values[n.id]?.[i]:w?wireValue(w):undefined;
    const circle=svg('circle',{cx,cy,r:6.5,class:`pin ${typeof v==='number'?(v?'high':'low'):''} ${pending?.id===n.id&&pending?.output===i&&output?'pending':''}`,tabindex:0,role:'button','aria-label':n.label+' '+(output?'输出 ':'输入 ')+p.name+' · '+p.width+' 位'},g);
    const sharedRow=Boolean((output?d.inputs:d.outputs)[i]);
    const label=sharedRow&&p.width>1?p.name:p.name+' '+fmt(v,p.width);
    svg('text',{x:cx+(output?-11:11),y:cy+4,'text-anchor':output?'end':'start',class:'pin-label'},g).textContent=label;
    const activate=()=>{
     if(output){pending=pending?.id===n.id&&pending?.output===i?null:{id:n.id,output:i,width:p.width};multi.clear();selected=n.id;showDetails('component');draw();return;}
     if(!pending){multi.clear();selected=w?.id||n.id;showDetails('component');draw();return;}
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
 const wireSelected=doc.wires.some(w=>w.id===selected);
 const count=multi.size+Number((wireSelected||nodes.has(selected))&&!multi.has(selected));
 const remove=$('delete-selection');
 remove.disabled=count===0;
 remove.textContent=count>1?'删除 '+count+' 个元件':count===0?'删除所选':wireSelected?'删除连线':'删除元件';
 renderMonitor();
 renderReplay();
 if(detailTab==='component'&&!$('detail-body').hidden&&!$('inspector').contains?.(document.activeElement))renderInspector();
 if(usesMineDevice())renderMineDevice();else if(level.id==='mines')renderMines();
 if(Game.isComputer(level)){
  const o8=level.machine==='overture';
  const s32=level.machine==='symphony';
  $('terminal').textContent=level.demo==='shell'?studioText(state.ram||{}):terminal||(level.machine?'等待 OUT 输出…':'等待 ST 255 输出…');
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
function mazeCycleLimitReached(){
 return level.workshop==='maze'&&ticks>=level.cycleLimit;
}
function renderMaze(){
 if(!peripheral)return;
 const {map,x,y,dir,moves,lastCommand,visited,failure}=peripheral.snapshot();
 const grid=$('maze-grid'),columns=map[0].length;
 grid.style.setProperty('--maze-columns',columns);
 const tiles=[];
 for(const [row,line] of map.entries())for(const [column,type] of [...line].entries()){
  const tile=document.createElement('span');tile.className='maze-tile';tile.setAttribute('aria-hidden','true');
  if(row===y&&column===x){tile.className+=' maze-robot';tile.textContent='↑→↓←'[dir];}
  else if(type==='#')tile.className+=' maze-wall';
  else if(type==='G'){tile.className+=' maze-goal';tile.textContent='◎';}
  else if(visited.has(row*columns+column)){tile.className+=' maze-trail';tile.textContent='·';}
  tiles.push(tile);
 }
 grid.replaceChildren(...tiles);
 grid.setAttribute('aria-label',`机器人在第 ${y+1} 行、第 ${x+1} 列，面朝${'北东南西'[dir]}`);
 const input=peripheral.input;
 $('maze-sensors').replaceChildren(...['前','左','右'].map((label,index)=>{
  const sensor=document.createElement('span'),blocked=(input>>index)&1;
  sensor.className=blocked?'blocked':'';sensor.textContent=label+' '+(blocked?'有墙':'畅通');
  return sensor;
 }));
 $('maze-input').textContent='0b'+input.toString(2).padStart(3,'0');
 $('maze-output').textContent=lastCommand===null?'—':lastCommand+' · '+(['左转','前进','右转'][lastCommand]||'无效指令');
 const pc=values.pc?.[0],word=values.rom?.[0];
 let instruction='—';
 if(!net.error&&typeof pc==='number'&&typeof word==='number'){
  try{
   const rules=Game.overture.parseRules(doc.isa??Game.overture.defaultRules);
   instruction=fmt(pc,8)+' · '+Game.overture.disassemble(word,rules);
  }catch{instruction=fmt(pc,8)+' · '+fmt(word,8);}
 }
 $('maze-instruction').textContent=instruction;
 $('maze-progress').textContent=`${moves} 个动作 · ${ticks} 个周期`;
 const exhausted=mazeCycleLimitReached(),finished=peripheral.done||exhausted;
 const run=$('maze-run');
 run.disabled=!!net.error||finished;run.textContent=timer?'暂停':'运行';run.setAttribute('aria-pressed',String(!!timer));
 $('maze-step').disabled=!!net.error||finished;
 const won=!net.error&&peripheral.pass;
 const message=net.error||(won?'到达出口！机器人执行了 '+moves+' 个动作。':failure||(exhausted?'达到周期上限，请检查程序是否进入循环。':timer?'机器人运行中。':ticks?'已暂停，可以继续运行或单步。':'运行示例程序，或单步查看 CPU 指令。'));
 const status=$('maze-status');
 if(status.textContent!==message)status.textContent=message;
 status.className=won?'workshop-win':'';
}
$('maze-run').onclick=()=>{if(timer)stop();else $('run').click();draw();};
$('maze-step').onclick=()=>{stop();step();};
$('maze-reset').onclick=()=>{$('reset-state').click();};
$('maze-map').onchange=()=>{
 const index=Number($('maze-map').value);
 if(level.workshop!=='maze'||!level.maps[index])return;
 mazeMapIndex=index;stop();compileCurrent();draw();renderTrace();
};
const lightDirections=['东 →','南 ↓','西 ←','北 ↑'];
const lightVectors=[[1,0],[0,1],[-1,0],[0,-1]];
function sampleLight(result){
 light.output=lightKit.read(net,result);
 if(!light.output)return;
 const {x,y}=light.output,last=light.trail.at(-1);
 if(!last||last.x!==x||last.y!==y)light.trail.push({x,y});
}
function lightPuzzleIndex(){
 const index=doc.lightPuzzle;
 return Number.isInteger(index)&&lightKit.puzzles[index]?index:0;
}
function prepareLight(){
 $('light-puzzle').replaceChildren(...lightKit.puzzles.map(({title},i)=>{
  const option=document.createElement('option');option.textContent=title;option.value=i;return option;
 }));
 $('light-targets').replaceChildren(...Array.from({length:4},()=>{
  const target=document.createElement('span');target.textContent='◎';return target;
 }));
 $('light-grid').replaceChildren(...Array.from({length:16},(_,i)=>{
  const cell=button('',()=>{
   const mask=doc.nodes.find(n=>n.id==='mirror-mask'),orientation=doc.nodes.find(n=>n.id==='mirror-flips');
   const bit=1<<i;
   if(!orientation||!(mask?.value&bit))return;
   stop();checkpoint();orientation.value=(orientation.value??0)^bit;
   compileCurrent();persist();draw();
  });
  cell.type='button';return cell;
 }));
}
function renderLight(){
 const index=lightPuzzleIndex(),puzzle=lightKit.puzzles[index],result=light.output;
 const mirrors=doc.nodes.find(n=>n.id==='mirror-mask')?.value??0;
 const flips=doc.nodes.find(n=>n.id==='mirror-flips')?.value??0;
 const goal=doc.nodes.find(n=>n.id==='goal-row')?.value??puzzle.goal;
 const run=$('light-run');
 $('light-puzzle').value=String(index);
 run.textContent=timer?'暂停':ticks===0?'发光':'继续发光';
 run.disabled=!result||!!result.done;run.setAttribute('aria-pressed',String(!!timer));
 $('light-step').disabled=!result||!!result.done||!!timer;
 const lit=new Set(light.trail.map(({x,y})=>y*4+x));
 Array.from($('light-grid').children).forEach((cell,i)=>{
  const mirror=!!(mirrors&(1<<i)),flipped=!!(flips&(1<<i));
  cell.disabled=!mirror;
  cell.className=(mirror?'light-mirror ':'')+(lit.has(i)?'light-visited ':'')+
   (result&&i===result.y*4+result.x&&!result.done?'light-head':'');
  cell.textContent=mirror?(flipped?'╲':'╱'):'';
  cell.setAttribute('aria-label','第 '+((i>>2)+1)+' 行第 '+((i&3)+1)+' 列，'+(mirror?(flipped?'反斜镜':'斜镜'):'空格'));
 });
 Array.from($('light-targets').children).forEach((target,i)=>{
  target.className=goal===i?'light-target'+(result?.hit?' hit':''):'';
 });
 const overlay=$('light-overlay');overlay.replaceChildren();
 if(light.trail.length){
  const points=['0,.5',...light.trail.map(({x,y})=>(x+.5)+','+(y+.5))];
  if(result?.done&&!result.loop){
   const [dx,dy]=lightVectors[result.direction];
   points.push((result.x+.5+dx*.5)+','+(result.y+.5+dy*.5));
  }
  svg('polyline',{class:result?.done&&!result.hit?'light-ray dim':'light-ray',points:points.join(' ')},overlay);
 }
 $('light-cycle').textContent=ticks;
 $('light-position').textContent=result?result.x+', '+result.y:'—';
 $('light-direction').textContent=result?lightDirections[result.direction]:'—';
 const message=net.error||(!result?'请接好光路输出端口并检查信号。':
  result.hit?'接收器点亮！':result.loop?'已走满 64 拍，光束停止。':result.done?'光束射出边界，翻转镜子再试。':
  ticks?'目标在右侧第 '+(goal+1)+' 行。':'从左上角向东发光。目标在右侧第 '+(goal+1)+' 行。');
 const status=$('light-status');
 if(status.textContent!==message)status.textContent=message;
 status.className=result?.hit?'workshop-win':'';
}
$('light-puzzle').onchange=()=>{
 const index=Number($('light-puzzle').value);
 if(!lightKit.puzzles[index])return;
 stop();checkpoint();lightKit.setInputs(doc,index);compileCurrent();persist();draw();
};
$('light-run').onclick=()=>{
 if(timer){stop();draw();return;}
 if(!light.output||light.output.done)return;
 timer=setInterval(()=>step(),260);syncClock();draw();
};
$('light-step').onclick=()=>step();
$('light-reset').onclick=()=>{stop();compileCurrent();draw();};
function submitMineMove(index,flag){
 const device=Game.mineDevice,memory=state.ram;
 if(net.error||!memory){notify(net.error||'请连接扫雷所需的 RAM');return;}
 if(memory[device.command]||memory[device.status])return;
 const cell=memory[device.base+index]||0;
 if((cell&32)||(!flag&&(cell&64)))return;
 state.ram={...memory,[device.command]:index+(flag?65:1)};
 if(!timer){
  let budget=60000;
  timer=setInterval(()=>{
   const deadline=performance.now()+12;
   try{
    while(state.ram[device.command]&&budget>0&&performance.now()<deadline){
     if(breakpoints.has(values.pc?.[0])){stop();break;}
     const result=net.tick(state);state=result.state;values=result.values;ticks++;budget--;
    }
    if(!state.ram[device.command]||budget<=0){
     stop();
     if(!budget)notify('程序尚未确认输入，可切换到编辑视图单步检查。');
    }
    if(!timer){draw();renderTrace();}
   }catch(e){stop();notify(e.message);draw();}
  },16);
  syncClock();
 }
 renderMineDevice();
}
function renderMineDevice(){
 const device=Game.mineDevice,memory=state.ram||{},grid=$('mines-grid');
 if(grid.className!=='large-board'){
  grid.className='large-board';
  grid.replaceChildren(...Array.from({length:64},(_,index)=>{
   const b=button('',()=>submitMineMove(index,mineFlags));
   b.oncontextmenu=e=>{e.preventDefault();submitMineMove(index,true);};
   return b;
  }));
 }
 const toggle=$('mine-mode');
 toggle.textContent=mineFlags?'正在插旗':'插旗模式';
 toggle.setAttribute('aria-pressed',String(mineFlags));
 const ended=memory[device.status],pending=!!memory[device.command],hit=memory[device.exploded];
 let flags=0;
 for(const [i,b] of Array.from(grid.children).entries()){
  const cell=memory[device.base+i]||0;
  const revealed=!!(cell&32),flagged=!!(cell&64),mine=!!(cell&128),clue=cell&15;
  if(flagged)flags++;
  let mark='',description='未揭开',className=revealed?'revealed':'covered';
  if(ended===1&&mine&&(!flagged||hit===i+1)){
   const exploded=hit===i+1;
   mark=exploded?'✹':'●';description=exploded?'踩中的雷':'地雷';className+=' mine-hit';
  }else if(flagged){
   const wrong=ended===1&&!mine;
   mark=wrong?'×':'⚑';description=wrong?'错误标记':'已插旗';className+=wrong?' mine-hit':' mine-flag';
  }else if(revealed){
   mark=clue?String(clue):'·';description=clue?'邻雷 '+clue:'空地';
   if(clue)className+=' mine-clue-'+clue;
  }
  b.className=className;b.textContent=mark;b.disabled=!!ended||pending;
  b.setAttribute('aria-label','第 '+(1+Math.floor(i/8))+' 行第 '+(1+i%8)+' 列，'+description);
 }
 $('mine-flags').textContent='已标记 '+flags+' / 8';
 const message=net.error||(!state.ram?'缺少与扫雷设备相连的 RAM':ended===1?'踩雷了':ended===2?'胜利！已找全 56 个安全格':pending?'CPU 正在处理输入':'已揭开 '+(memory[device.count]||0)+' / 56');
 const status=$('mines-status');
 if(status.textContent!==message)status.textContent=message;
 status.className=!net.error&&ended===2?'workshop-win':'';
}
$('mine-mode').onclick=()=>{mineFlags=!mineFlags;renderMineDevice();};
$('mine-new-game').onclick=()=>{
 const seed=doc.nodes.find(n=>n.id==='input'&&n.type==='IN32');
 if(!seed){notify('需要保留 32 位种子输入 input');return;}
 stop();seed.value=((seed.value||0)+1+Math.floor(Math.random()*65535))&65535;
 mineFlags=false;compileCurrent();persist();draw();renderTrace();
};
const componentHelp={
 IN:'把设置的值送到输出引脚 Q，可以用它给电路提供输入。',
 OUT:'显示 A 引脚收到的值，用来观察电路的输出。',
 CONST:'持续输出设定的八位值。', BIT:'持续输出设定的一位值。',
 BUF:'把 A 的值原样送到 Q。',
 NAND:'与非门。只有 A、B 都为 1 时，Q 才为 0。',
 AND:'与门。只有 A、B 都为 1 时，Q 才为 1。',
 OR:'或门。A、B 至少有一个为 1 时，Q 为 1。',
 XOR:'异或门。A、B 不同时，Q 为 1。',
 NOT:'非门。Q 与 A 相反。',
 NOR:'或非门。只有 A、B 都为 0 时，Q 才为 1。',
 XNOR:'同或门。A、B 相同时，Q 为 1。',
 CLOCK:'每推进一拍，CLK 在 0 和 1 之间切换。元件仍使用同一个全局时钟采样。',
 DELAY:'在全局时钟沿采样 D，并保持到下一拍。',
 REG:'寄存器在全局时钟沿更新。两个时钟沿之间，Q 保持已保存的值。',
 DEC3:'地址由 A + 2×B + 4×C 得出，A 是最低位。',
 MUX:'S 为 0 时把 A 接到 Q，为 1 时把 B 接到 Q。',
 SPLIT:'把总线拆成独立的位。b0 是最低位。',
 JOIN:'把各位合成一条总线。b0 是最低位。',
 ADD8:'Q 输出 A + B 的低八位。', SUB8:'Q 输出 A − B 的低八位。',
 AND8:'对 A、B 的每对对应位做与运算。', OR8:'对 A、B 的每对对应位做或运算。',
 XOR8:'对 A、B 的每对对应位做异或。', NOT8:'对 A 的每个位取反。',
 EQ8:'A、B 相等时，Q 为 1。', LT8:'按无符号数比较，A 小于 B 时，Q 为 1。',
 SHL8:'A 左移一位，最低位补 0，移出的最高位舍弃。',
 SHR8:'A 右移一位，最高位补 0，移出的最低位舍弃。',
 TRI:'EN 为 1 时驱动 Q；EN 为 0 时输出浮空 Z。',
 BUS:'把 A、B 合并到 Q。两路同时驱动且值不同时，Q 为 X，冲突引脚为 1。',
 ALU8:'OP 为 0 到 5 时，依次执行传送 B、加、减、按位与、按位或、按位异或。结果保留低八位。',
 CONTROL:'从 IR 的高字节读取指令编号，再根据指令和 ACC 状态决定写回、跳转、访存和停机。',
 ROM16:'ADR 选择一条 16 位指令，由 IR 输出。',
 ROM32:'PC 是字节地址，每条指令占 4 字节。IR 输出对应的 32 位指令。',
 RAM8:'地址改变时读出对应字节，写入在全局时钟沿提交。',
 RAM32:'支持按 1、2 或 4 字节访问，写入在全局时钟沿提交。',
 SCREEN8:'地址低六位选择 8 × 8 屏幕中的像素。WE 为 1 时，时钟沿写入 RGB332 颜色。'
};
const componentRules={
 MUX8:['S','Q 跟随 A','Q 跟随 B'],
 REG:['EN','下一拍保持 Q','下一拍把 D 保存到 Q'],
 DEC3:['DIS','地址对应的 Y 为 1，其余为 0','所有 Y 均为 0'],
 RAM8:['WE','保持存储内容','下一拍把 DATA 写入 ADR'],
 RAM32:['写入','保持存储内容','下一拍写入指定字节数'],
 SCREEN8:['WE','保持像素颜色','下一拍写入该像素'],
 TRI:['EN','Q 浮空（Z）','Q 跟随 D']
};
const truthTables=new WeakMap();
function componentTruth(n,d){
 if(!d.inputs.length||d.inputs.length>3||!d.outputs.length||d.outputs.length>4
    ||[...d.inputs,...d.outputs].some(port=>port.width!==1)||d.signalAware||d.stateful)return null;
 if(truthTables.has(d))return truthTables.get(d);
 let evaluate=n.type==='CUSTOM'?null:d.evaluate;
 if(n.type==='CUSTOM'){
  const hasClockedNodes=circuit=>circuit.nodes.some(part=>part.type==='CUSTOM'?hasClockedNodes(part.spec.circuit):definition(part).stateful);
  if(!hasClockedNodes(d.circuit)){
   const model=compile(d.circuit.nodes,d.circuit.wires);
   if(!model.error){
    const initial=model.initial();
    evaluate=input=>{
     const result=model.evaluate(initial,Object.fromEntries(d.inputs.map((port,i)=>[port.id,input[i]])));
     return d.outputs.map(port=>result.inputs(port.id)[0]);
    };
   }
  }
 }
 let rows=null;
 if(evaluate)rows=Array.from({length:2**d.inputs.length},(_,index)=>{
  const input=d.inputs.map((_,i)=>(index>>(d.inputs.length-1-i))&1);
  return [...input,...evaluate(input)];
 });
 if(rows?.some(row=>row.some(value=>value!==0&&value!==1)))rows=null;
 truthTables.set(d,rows);
 return rows;
}
function principleBit(value){
 const bit=document.createElement('span');bit.className='principle-bit';
 const label=document.createElement('span');label.className='bit-value';label.textContent=fmt(value);
 bit.title=label.textContent;bit.append(signalLed(value),label);
 return bit;
}
function renderComponentPrinciple(el,n,d,inputValues){
 const section=inspectorColumn(el,'工作原理');
 section.className+=' component-principle';
 const base=n.type.replace(/\d+$/,'');
 const note=document.createElement('p');
 note.textContent=componentHelp[n.type]||componentHelp[base]||'此元件有 '+d.inputs.length+' 个输入和 '+d.outputs.length+' 个输出。可打开内部电路查看接法。';
 section.append(note);
 const truth=componentTruth(n,d),rule=componentRules[n.type]||componentRules[base];
 if(!truth&&!rule)return;
 const legend=document.createElement('div');legend.className='principle-legend';
 legend.append(principleBit(0),'低电平',principleBit(1),'高电平');
 section.append(legend);
 if(rule){
  const [pin,...behavior]=rule,index=d.inputs.findIndex(port=>port.name===pin);
  const list=document.createElement('ul');list.className='principle-rules';
  for(const [bit,description] of behavior.entries()){
   const row=document.createElement('li');
   const current=inputValues[index]===bit;
   if(current){row.className='current';row.setAttribute('aria-current','true');}
   row.append(pin,principleBit(bit),description);list.append(row);
  }
  section.append(list);
  return;
 }
 const table=document.createElement('table');table.className='truth-table';table.setAttribute('aria-label','真值表');
 const head=document.createElement('thead'),labels=document.createElement('tr'),corner=document.createElement('th');
 corner.scope='col';corner.textContent='引脚';labels.append(corner);head.append(labels);
 const current=truth.findIndex(row=>inputValues.every((value,i)=>row[i]===value));
 const key=document.createElement('span');key.className='principle-current-label';
 key.textContent=current>=0?'描边为当前输入':'当前输入不可用';
 legend.append(key);
 for(const [i] of truth.entries()){
  const th=document.createElement('th');th.scope='col';th.textContent=i+1;
  th.setAttribute('aria-label','组合 '+(i+1)+(i===current?'，当前输入':''));
  if(i===current)th.className='current';
  labels.append(th);
 }
 const body=document.createElement('tbody');
 for(const [i,port] of [...d.inputs,...d.outputs].entries()){
  const row=document.createElement('tr'),label=document.createElement('th');label.scope='row';
  const output=i>=d.inputs.length;
  if(i===d.inputs.length)row.className='truth-output';
  label.textContent=(output?'输出 ':'输入 ')+port.name;
  row.append(label);
  for(const [j,example] of truth.entries()){
   const td=document.createElement('td');
   if(j===current)td.className='current';
   td.append(principleBit(example[i]));row.append(td);
  }
  body.append(row);
 }
 table.append(head,body);section.append(table);
}
let memoryNode=null,memoryAddress=0;
function inspectorColumn(el,title){
 const col=document.createElement('div');col.className='inspector-column';
 const heading=document.createElement('h3');heading.textContent=title;col.append(heading);el.append(col);
 return col;
}
function field(label,control){
 const el=document.createElement('label');el.textContent=label;control.setAttribute('aria-label',label);
 el.append(control);return el;
}
function renderMemory(el,n){
 const memory=state[n.id];
 if(!memory||typeof memory!=='object')return;
 if(memoryNode!==n.id){memoryNode=n.id;memoryAddress=0;}
 const max=n.type==='RAM32'?65535:255,hex=n=>n.toString(16).toUpperCase().padStart(2,'0');
 const address=document.createElement('input'),data=document.createElement('input'),row=document.createElement('pre');
 address.value=hex(memoryAddress);address.maxLength=6;data.maxLength=4;row.className='memory';
 function currentAddress(){
  const value=address.value.trim().replace(/^0x/i,'');
  return /^[0-9a-f]{1,4}$/i.test(value)&&parseInt(value,16)<=max?parseInt(value,16):null;
 }
 function selectAddress(){
  const index=currentAddress();
  if(index===null){notify('地址超出范围');return;}
  memoryAddress=index;data.value=hex(state[n.id]?.[index]??0);
  const start=index&~15;
  row.textContent=Array.from({length:16},(_,i)=>{
   const a=start+i;return hex(a).padStart(n.type==='RAM32'?4:2,'0')+'  '+hex(state[n.id]?.[a]??0);
  }).join('\n');
 }
 address.onchange=selectAddress;
 el.append(field('十六进制地址',address),field('字节值',data),button('写入当前内存',()=>{
  if(replayCase){notify('退出用例回放后可写入内存。');return;}
  if(timer){notify('请暂停后写入内存');return;}
  const index=currentAddress(),value=data.value.trim().replace(/^0x/i,'');
  if(index===null||!/^[0-9a-f]{1,2}$/i.test(value)){notify('请输入有效的十六进制地址和字节');return;}
  state[n.id][index]=parseInt(value,16);values=net.evaluate(state).values;selectAddress();draw();
  notify('已写入当前仿真内存');
 }),row);
 selectAddress();
}
function renderInspector(){
 const el=$('inspector');el.replaceChildren();
 const n=doc.nodes.find(n=>n.id===selected);
 if(!n){
  const wire=doc.wires.find(w=>w.id===selected);
  if(!wire){el.textContent='选择画布上的元件或导线查看详情。';return;}
  const settings=inspectorColumn(el,'导线');
  const target=doc.nodes.find(n=>n.id===wire.to);
  const source=doc.nodes.find(n=>n.id===wire.from);
  const width=definition(source).outputs[wire.output??0]?.width||1;
  const label=document.createElement('input');label.value=wire.comment||'';label.maxLength=120;
  label.onchange=()=>{checkpoint();wire.comment=label.value.trim();persist();draw();};
  const color=document.createElement('select');
  for(const [value,text] of Object.entries({'':'自动配色',...wireColors})){
   const option=document.createElement('option');option.value=value;option.textContent=text;
   option.selected=value===(wire.color||'');color.append(option);
  }
  color.onchange=()=>{checkpoint();if(color.value)wire.color=color.value;else delete wire.color;persist();draw();};
  settings.append(field('导线注释',label),field('颜色',color));
  const pins=inspectorColumn(el,'连接');
  const status=document.createElement('p');
  status.textContent=source.label+' → '+target.label+' · '+width+' 位 · '+fmt(wireValue(wire),width);
  pins.append(status);
  const route=inspectorColumn(el,'走线路径');
  route.append(button('添加拐点',()=>{pending={route:wire.id};$('status').textContent='点击画布空白处放置拐点';}));
  if(wire.points?.length)route.append(button('撤回一个拐点',()=>{checkpoint();wire.points.pop();persist();renderInspector();draw();}));
  route.append(button('删除连线',removeSelected,'danger'));
  return;
 }
 const controls=inspectorColumn(el,n.label),d=definition(n);
 const inputWires=d.inputs.map((_,i)=>sourceOf(n.id,i));
 const inputValues=inputWires.map(w=>w?wireValue(w):undefined);
 renderComponentPrinciple(el,n,d,inputValues);
 const name=document.createElement('input');name.value=n.label;name.maxLength=32;
 name.onchange=()=>{checkpoint();n.label=name.value.slice(0,32)||n.type;name.value=n.label;persist();draw();};controls.append(field('元件名称',name));
 if((inputTypes.has(n.type)||n.type==='CONST')&&!externalInput(n)){
  const input=document.createElement('input');input.type='number';input.min=0;input.max=2**d.outputs[0].width-1;input.value=replayCase?.inputs[n.id]??n.value??0;
  input.onchange=()=>{setInputValue(n,Number(input.value));input.value=n.value??0;};
  controls.append(field('输入值',input));
  if(d.outputs[0].width===1)controls.append(button('切换 0 / 1',()=>toggleInputBit(n.id,0)));
 }
 if(n.type==='CUSTOM'){
  const summary=document.createElement('p');
  summary.textContent=d.circuit.nodes.length+' 个内部元件 · '+d.circuit.wires.length+' 条内部连线';
  controls.append(summary);
  controls.append(button('打开内部电路副本',()=>{
   restoreLive();persist();const internal=clone(n.spec.circuit);
   inspectionStack.push({levelId:level.id,doc:clone(doc),state:clone(state),ticks,records:clone(records),camera:{...camera},selected,mazeMapIndex,peripheral,light,studio});
   openLevel('sandbox',false,true);doc=internal;edit();$('title').textContent=n.label+' · 内部电路副本';$('description').textContent='可继续逐层打开。返回时保留上层电路和运行状态。';$('fit').click();
  }));
 }
 if(['NAND','AND','OR','XOR','NOR','XNOR'].includes(n.type)){
  const select=document.createElement('select');
  const available=allowedTypes().filter(t=>types[t]?.inputs.length===2&&types[t].outputs[0]?.width===1&&!types[t].stateful);
  for(const type of new Set([n.type,...available])){
   const option=document.createElement('option');option.value=type;option.textContent=type;option.selected=type===n.type;select.append(option);
  }
  if(select.children.length>1){
   select.onchange=()=>{checkpoint();n.type=select.value;edit();};controls.append(field('替换逻辑门',select));
  }
 }
 const inputs=inspectorColumn(el,'输入引脚'),outputs=inspectorColumn(el,'输出引脚');
 for(const [ports,isOutput,column] of [[d.inputs,false,inputs],[d.outputs,true,outputs]]){
  if(!ports.length){const empty=document.createElement('p');empty.textContent='无';column.append(empty);}
  for(const [i,p] of ports.entries()){
   const w=isOutput?null:inputWires[i],value=isOutput?values[n.id]?.[i]:inputValues[i];
   const row=document.createElement('div');row.className='pin-line';
   const detail=document.createElement('span');detail.textContent=p.name+' '+(isOutput?'→':'←')+' '+(w||isOutput?fmt(value,p.width):'未连接');
   const width=document.createElement('span');width.className='pin-count';width.textContent=p.width+' 位';
   row.append(signalLed(value===0?0:typeof value==='number'?1:value),detail,width);column.append(row);
  }
 }
 if(n.type==='SCREEN8'){
  const screen=document.createElement('canvas');screen.className='pixel-screen';
  screen.setAttribute('aria-label',n.label+' · 8 × 8 RGB332 屏幕');
  outputs.append(screen);paintPixels(screen,state[n.id]||[]);
 }else if(d.memory)renderMemory(outputs,n);
 controls.append(button('删除元件',removeSelected,'danger'));
}
function removeSelected(){
 const ids=new Set(multi);if(selected)ids.add(selected);
 if(!ids.size)return;
 checkpoint();
 doc.nodes=doc.nodes.filter(n=>!ids.has(n.id));
 doc.wires=doc.wires.filter(w=>![w.id,w.from,w.to].some(id=>ids.has(id)));
 selected=null;pending=null;multi.clear();edit();
}
$('delete-selection').onclick=removeSelected;
function boardPoint(e){const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(board.getScreenCTM().inverse());return {x:p.x,y:p.y};}
function worldPoint(e){const p=boardPoint(e);return {x:(p.x-camera.x)/camera.scale,y:(p.y-camera.y)/camera.scale};}
board.addEventListener('dragover',e=>{
 if(!draggedPart)return;
 e.preventDefault();e.dataTransfer.dropEffect='copy';
});
board.addEventListener('drop',e=>{
 if(!draggedPart)return;
 e.preventDefault();
 const {type,spec}=draggedPart;draggedPart=null;
 placeComponent(type,spec,worldPoint(e));
});
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
 else{
  const moved=new Map();
  for(const old of drag.positions){
   const n=doc.nodes.find(n=>n.id===old.id);
   n.x=Math.round((old.x+p.x-drag.start.x)/12)*12;
   n.y=Math.round((old.y+p.y-drag.start.y)/12)*12;
   moved.set(n.id,{x:n.x-old.x,y:n.y-old.y});
  }
  doc.wires.forEach((w,i)=>{
   const offset=moved.get(w.from),original=drag.before.wires[i].points;
   if(!offset||!moved.has(w.to)||!original?.length)return;
   w.points=original.map(p=>({x:p.x+offset.x,y:p.y+offset.y}));
  });
 }
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
 e.preventDefault();const p=boardPoint(e),world=worldPoint(e),scale=Math.max(.08,Math.min(2.5,camera.scale*(e.deltaY<0?1.1:.9)));
 camera={scale,x:p.x-world.x*scale,y:p.y-world.y*scale};draw();
},{passive:false});
function step(render=true){
 if(replayCase&&ticks>=replayCase.end){stop();return;}
 if(net.error){stop();selected=net.node;notify(net.error);draw();return;}
 try{
  if(peripheral?.done||mazeCycleLimitReached()||light?.output?.done){stop();return;}
  const pcBefore=values.pc?.[0];
  const overrides={...replayCase?.inputs};
  if(level.machine==='symphony'&&pendingKeys.length)overrides.keyboard=pendingKeys[0];
  if(peripheral)overrides.input=peripheral.input;
  if(studio?.link)Object.assign(overrides,studio.link.inputs);
  if(!records.length)saveTrace(net.evaluate(state,overrides));
  if(level.machine&&net.incoming.has('strobe')&&net.incoming.has('output')){
   const before=net.evaluate(state,overrides);
   if(before.inputs('strobe')[0]){
    const value=before.inputs('output')[0];terminal=(terminal+' '+value).trim().slice(-500);
    if(replayCase)replayCase.emitted.push(value);
    if(peripheral){peripheral.write(value);if(peripheral.done)stop();}
    if(level.demo==='rhythm'&&!workshopEditing)playStudioNotes(value);
   }
   if(studio?.link&&net.incoming.has('rx-strobe')&&net.incoming.has('rx-output'))studio.link.sample(before);
   if(level.machine==='symphony'&&before.values.screen&&before.inputs('screen')[0]){
    const setting=before.values.b?.[0];if(setting<5)deviceScreen[setting]=before.values.operand?.[0]||0;
   }
   if((before.values.rom?.[0]>>>24)===3&&pendingKeys.length)pendingKeys.shift();
  }
  const result=net.tick(state,overrides);state=result.state;ticks++;
  const live=peripheral&&overrides.input!==peripheral.input?net.evaluate(state,{...overrides,input:peripheral.input}):result;
  values=live.values;
  if(light){
   sampleLight(live);
   if(light.output?.done)stop();
  }
  if(mazeCycleLimitReached())stop();
  if(Game.isComputer(level)){
   for(const w of result.writes){
    if(level.machine||w.address!==255)continue;
    if(replayCase&&(w.id==='ram'||level.id==='cpu-build'))replayCase.emitted.push(w.value);
    if(w.id!=='ram')continue;
    if(level.id.startsWith('cm8-'))terminal=(terminal+' '+w.value).trim().slice(-500);
    else terminal=(terminal+String.fromCharCode(w.value)).slice(-500);
   }
   if(values.ctrl?.[6]===0&&!replayCase)stop();
  }
  saveTrace(live);
  if(replayCase&&ticks>=replayCase.end)stop();
  if(render){
   reportStep(pcBefore);
   draw();renderTrace();
  }
 }catch(e){stop();notify(e.message);}
}
function saveTrace(result){
 if(replayCase&&level.outputs)replayCase.result=level.outputs.map(id=>result.inputs(id)[0]);
 records.push({tick:ticks,signals:traceSignals.map(p=>p.output?result.values[p.id]?.[0]:result.inputs(p.id)[0])});
 if(records.length>32)records.shift();
}
function reportStep(pcBefore){
 if(typeof pcBefore==='number'){
  const width=level.machine==='symphony'?32:8;
  $('step-summary').textContent='第 '+ticks+' 拍 · 已执行 PC '+fmt(pcBefore,width)+' · 下一条 PC '+fmt(values.pc?.[0],width);
  return;
 }
 const previous=records.at(-2),latest=records.at(-1);
 const changes=traceSignals.flatMap(({label,width},i)=>previous&&previous.signals[i]!==latest.signals[i]
  ?[label+' '+fmt(previous.signals[i],width)+' → '+fmt(latest.signals[i],width)]:[]);
 $('step-summary').textContent='第 '+ticks+' 拍 · '+(changes.slice(0,4).join('，')||'监控信号保持原值');
}
function renderTrace(){
 const el=$('trace');
 if(detailTab!=='signals'||$('detail-body').hidden)return;
 el.replaceChildren();
 if(!records.length||!traceSignals.length){el.textContent='单步或播放后，在这里查看各周期的信号。';return;}
 const current=records.slice(-16);
 const waveRow=(label)=>{
  const row=document.createElement('div');row.className='waveform';row.style.setProperty('--samples',current.length);
  const heading=document.createElement('span');heading.className='waveform-label';heading.textContent=label;
  row.append(heading);el.append(row);return row;
 };
 const ruler=waveRow('周期');
 for(const sample of current){const tick=document.createElement('span');tick.textContent=sample.tick;ruler.append(tick);}
 for(const [index,{label,width}] of traceSignals.entries()){
  const row=waveRow(label);
  current.forEach((sample,i)=>{
   const cell=document.createElement('span'),v=sample.signals[index];
   cell.className='waveform-sample';cell.textContent=fmt(v,width);
   if(width===1&&typeof v==='number')cell.setAttribute('data-bit',v);
   if(i&&v!==current[i-1].signals[index])cell.classList.add('waveform-transition');
   row.append(cell);
  });
 }
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
  const td=document.createElement('td');td.append(button(c.replay?(c.pass?'回放':'定位'):'查看',()=>replay(i)));row.append(td);table.append(row);
 });el.append(table);
}
function restoreLive(){
 if(!replayCase)return;
 const saved=replayCase.saved;
 replayCase=null;testIndex=-1;
 ({net,state,values,ticks,records,terminal,deviceScreen,pendingKeys,peripheral,focused,selected}=saved);
 $('step-summary').textContent=saved.stepSummary;
 if(saved.programText!==undefined){
  $('program').value=saved.programText;$('program').readOnly=false;$('assemble').disabled=false;
 }
 stop();
}
function refreshReplayView(){draw();renderTests();renderTrace();}
function renderReplay(){
 $('replay-bar').hidden=!replayCase;
 if(!replayCase)return;
 const {end,emitted,row,result}=replayCase;
 const input=Object.entries(row.input).map(([name,value])=>name+'='+value).join('，');
 const observed=peripheral?[Number(peripheral.pass)]:result??emitted;
 const expected=level.outputs&&ticks<end&&row.expectedBefore?row.expectedBefore:row.expected;
 const stage=end===0?'组合逻辑':'第 '+ticks+' / '+end+' 拍';
 const ahead=level.outputs&&ticks<end&&!row.expectedBefore;
 const outputMismatch=!peripheral&&Game.isComputer(level)&&emitted.some((value,i)=>value!==expected[i]);
 const compareNow=ticks>=end||!!row.expectedBefore;
 const mismatch=outputMismatch||compareNow&&(observed.length!==expected.length||observed.some((value,i)=>value!==expected[i]));
 const summary='用例 '+(testIndex+1)+' / '+testCases.length+' · '+stage+' · '+input+
  (ahead?' · 推进后预期 [':' · 预期 [')+expected.join(', ')+'] · 当前 ['+observed.join(', ')+']'+(mismatch?' · 输出不符':'');
 if($('replay-summary').textContent!==summary)$('replay-summary').textContent=summary;
 $('replay-prev').disabled=testIndex<=0;
 $('replay-next').disabled=testIndex>=testCases.length-1;
 $('replay-detail').textContent=Game.isComputer(level)?'看指令':'看波形';
}
function replay(i){
 const row=testCases[i];if(!row)return;
 restoreLive();stop();testIndex=i;
 const asList=values=>values.join(', ');
 const input=Object.entries(row.input).map(([k,v])=>k+'='+v).join('，');
 if(!row.replay){
  $('hint').textContent='本组条件 '+input+'。预期 ['+asList(row.expected)+']，实际 ['+asList(row.actual)+']。';
  refreshReplayView();return;
 }
 const config=row.replay;
 const saved={net,state,values,ticks,records,terminal,deviceScreen,pendingKeys,peripheral,focused,selected,stepSummary:$('step-summary').textContent};
 let model=net,program;
 if(config.program){
  const board=clone(doc);
  program={source:config.program,words:Game[level.machine].assemble(config.program).words};
  board.nodes.find(n=>n.id==='rom').program=program.words;
  model=compile(board.nodes,board.wires);
  if(model.error){notify(model.error);return;}
  saved.programText=$('program').value;
  $('program').value=program.source;$('program').readOnly=true;$('assemble').disabled=true;
 }
 replayCase={saved,row,inputs:config.inputs||{},end:(config.start??0)+config.steps,emitted:[],program,result:null};
 net=model;state=config.state?clone(config.state):net.initial();ticks=config.start??0;
 if(Object.hasOwn(config,'ram0'))state.ram[0]=config.ram0;
 if(config.scenario!==undefined)peripheral=level.createDevice(config.scenario);
 records=[];terminal='';deviceScreen=[];pendingKeys=[];
 const result=net.evaluate(state,peripheral?{...replayCase.inputs,input:peripheral.input}:replayCase.inputs);
 values=result.values;
 saveTrace(result);
 const before=row.before?.findIndex((v,j)=>v!==row.expectedBefore[j])??-1;
 const bad=before>=0?before:row.actual.findIndex((v,j)=>v!==row.expected[j]);
 focused=bad>=0?level.outputs?.[bad]??null:null;selected=focused;
 $('step-summary').textContent='';
 $('hint').textContent=config.steps
  ?(config.program?'已加载该用例的临时程序。':'已回到该用例的起点。')+'点「单步」逐拍观察，也可查看波形或指令。'
  :row.pass?'这组输入符合预期。':focused+' 的预期输出为 '+row.expected[bad]+'，实际为 '+row.actual[bad]+'。已标出上游连线。';
 syncClock();refreshReplayView();
}
$('replay-prev').onclick=()=>replay(testIndex-1);
$('replay-next').onclick=()=>replay(testIndex+1);
$('replay-start').onclick=()=>replay(testIndex);
$('replay-detail').onclick=()=>showDetails(Game.isComputer(level)?'program':'signals');
$('replay-close').onclick=()=>{restoreLive();$('hint').textContent='已返回测试前的电路状态。';refreshReplayView();};
let testAttempt=0;
function exhaustiveWidths(){
 if(!level.expect||level.clocked||!level.inputs?.length)return null;
 const widths=level.inputs.map(id=>definition(doc.nodes.find(n=>n.id===id)||{type:'OUT'}).outputs[0]?.width||0);
 const total=widths.reduce((a,b)=>a+b,0);
 return widths.every(Boolean)&&total<=16?widths:null;
}
function recordPass(total,exhaustive=false){
 focused=null;
 let reward='';
 if(level.inputs&&level.outputs){
  try{
   const spec=Circuit.encapsulate(doc,level.courseName||level.title);spec.courseId=level.id;
   for(const [ports,ids] of [[spec.inputs,level.inputs],[spec.outputs,level.outputs]]){
    const order=new Map(ids.map((id,i)=>[id,i]));
    ports.sort((a,b)=>(order.get(a.id)??Infinity)-(order.get(b.id)??Infinity));
   }
   const index=library.findIndex(item=>item.courseId===level.id);
   if(index>=0||library.length<100){
    library[index>=0?index:library.length]=spec;
    reward='已封装为「'+spec.name+'」，后续允许使用它的关卡可以直接复用。';
    renderPalette();
   }
  }catch{/* A valid large interface may exceed the chip packaging limit. */}
 }
 if(level.id==='cpu-build'){
  saved['machine-cm8']=clone(doc);
  reward='你的 CM8 已保存，首次进入后续 CM8 编程关时可以用它运行程序。';
 }
 if(level.id.endsWith('-budget')){
  doc.bestArea=Math.min(doc.bestArea??Infinity,net.expandedCount);
  reward='本次使用 '+net.expandedCount+' 个展开元件，最小通过规模为 '+doc.bestArea+' 个。';
 }
 renderTests();
 const detail=total+' / '+total+(exhaustive?' 组穷举输入符合预期':' 组测试通过');
 $('hint').textContent=reward||detail+'。';
 completeLevel(detail,reward);
}
function courseViolation(){
 if(!guided||!level.courseParts)return null;
 const terminals=(level.courseBuild||level.build)().nodes.filter(n=>[...(level.inputs||[]),...(level.outputs||[])].includes(n.id));
 const terminalTypes=new Map(terminals.map(n=>[n.id,n.type]));
 const available=allowedTypes(),earned=new Set(offeredModules().map(spec=>spec.courseId));
 const invalid=doc.nodes.find(n=>{
  if(terminalTypes.has(n.id))return terminalTypes.get(n.id)!==n.type;
  return n.type==='CUSTOM'?!earned.has(n.spec.courseId):!available.includes(n.type);
 });
 return invalid?`「${invalid.label}」不在本关可用元件列表。请检查右侧元件库。`:null;
}
$('exhaustive').onclick=async()=>{
 restoreLive();testIndex=-1;showDetails('verify');
 const widths=exhaustiveWidths();if(!widths)return;
 renderPassStatus();
 if(net.error){notify(net.error);return;}
 const violation=courseViolation();if(violation){notify(violation);return;}
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
  last={input,actual,expected,replay:{inputs:input,steps:0},pass:actual.every((v,i)=>v===expected[i])};
  if(!last.pass){testCases=[last];replay(0);notify('找到反例，已检查 '+(row+1)+' 组输入');return;}
 }
 testCases=[last];recordPass(total,true);
 $('results').textContent='全部 '+total+' 组输入符合预期。';
};
$('test').onclick=async()=>{
 restoreLive();testIndex=-1;showDetails('verify');
 renderPassStatus();
 const attempt=++testAttempt,testingNet=net;
 stop();
 if(net.error){selected=net.node;draw();notify(net.error);return;}
 if(![...(level.inputs||[]),...(level.outputs||[])].every(id=>doc.nodes.some(n=>n.id===id))){notify('缺少实验端口，请恢复关卡或保留原输入输出。');return;}
 const violation=courseViolation();if(violation){notify(violation);return;}
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
  let result,before,expectedBefore;
  const initial=testState;
  try{
   if(level.checkBeforeClock){
    const prior=net.evaluate(testState,input);
    before=level.outputs.map(id=>prior.inputs(id)[0]);
    expectedBefore=index?testCases[index-1].expected:level.outputs.map(()=>0);
   }
   if(level.sequence||level.clocked){result=net.tick(testState,input);testState=result.state;}
   else result=net.evaluate(testState,input);
  }catch(e){notify(e.message);return;}
  const expected=level.vectors?level.vectors[index].expected:level.sequence?[input.Q]:level.expect(level.inputs.map(id=>input[id]));
  const actual=level.outputs.map(id=>result.inputs(id)[0]);
  const pass=actual.length===expected.length&&actual.every((v,i)=>v===expected[i])&&(!before||before.every((v,i)=>v===expectedBefore[i]));
  const sample=Object.fromEntries(level.inputs.map(id=>[id,input[id]]));
  const clocked=!!(level.sequence||level.clocked);
  testCases.push({input:sample,expected,actual,before,expectedBefore,pass,
   replay:{inputs:sample,state:initial,start:clocked?index:0,steps:clocked?1:0}});
 }
 const failure=testCases.findIndex(c=>!c.pass);
 if(failure<0){
  recordPass(testCases.length);
 }
 else replay(failure);
};
function singleStep(){stop();step();}
$('step').onclick=singleStep;
$('pause').onclick=()=>{stop();draw();};
$('run').onclick=()=>{
 if(timer){stop();return;}
 if(replayCase&&ticks>=replayCase.end)return;
 if(net.error){notify(net.error);return;}
 $('step-summary').textContent='';
 const speed=Number($('speed').value)||100;
 let previous=performance.now(),pendingTicks=0;
 timer=setInterval(()=>{
  const now=performance.now();
  pendingTicks=Math.min(pendingTicks+(now-previous)*speed/1000,Math.max(1,speed/6));
  previous=now;
  let stepped=false;
  while(pendingTicks>=1&&(!stepped||performance.now()-now<12)){
   if(Game.isComputer(level)&&breakpoints.has(values.pc?.[0])){stop();notify('断点：PC '+values.pc[0]);break;}
   pendingTicks--;stepped=true;
   step(false);if(!timer)break;
  }
  if(stepped||!timer){draw();renderTrace();}
 },1000/30);syncClock();
};
$('speed').onchange=()=>{if(timer){stop();$('run').click();}else syncClock();};
$('reset-state').onclick=()=>{if(replayCase){replay(testIndex);return;}stop();focused=null;compileCurrent();draw();renderTrace();notify('状态已复位');};
$('restart').onclick=()=>{if(confirm('恢复关卡的初始电路？当前电路可先导出保存。')){openLevel(level.id,true);persist();}};
$('undo').onclick=()=>{if(!history.length)return;future.push(clone(doc));doc=history.pop();selected=null;pending=null;multi.clear();edit();};
$('redo').onclick=()=>{if(!future.length)return;history.push(clone(doc));doc=future.pop();selected=null;pending=null;multi.clear();edit();};
function resizeViewport(){
 if(!board.clientWidth||!board.clientHeight)return false;
 const width=viewport.height*board.clientWidth/board.clientHeight;
 if(Math.abs(width-viewport.width)<1)return false;
 camera.x+=(width-viewport.width)/2;
 viewport.width=width;
 board.setAttribute('viewBox',`0 0 ${width} ${viewport.height}`);
 return true;
}
if(typeof ResizeObserver!=='undefined')new ResizeObserver(()=>{if(resizeViewport()&&doc)draw();}).observe(board);
$('fit').onclick=()=>{
 resizeViewport();
 if(!doc.nodes.length){camera={x:0,y:0,scale:1};draw();return;}
 const minX=Math.min(...doc.nodes.map(n=>n.x)),maxX=Math.max(...doc.nodes.map(n=>n.x+146));
 const minY=Math.min(...doc.nodes.map(n=>n.y)),maxY=Math.max(...doc.nodes.map(n=>n.y+nodeHeight(n)));
 const scale=Math.min(1.35,viewport.width*.87/(maxX-minX),viewport.height*.84/(maxY-minY));
 camera={scale,x:(viewport.width-(maxX-minX)*scale)/2-minX*scale,y:(viewport.height-(maxY-minY)*scale)/2-minY*scale};draw();
};
function zoomCenter(factor){
 const scale=Math.max(.08,Math.min(2.5,camera.scale*factor)),ratio=scale/camera.scale;
 const x=viewport.width/2,y=viewport.height/2;
 camera={scale,x:x-(x-camera.x)*ratio,y:y-(y-camera.y)*ratio};draw();
}
$('zoom-in').onclick=()=>zoomCenter(1.2);
$('zoom-out').onclick=()=>zoomCenter(1/1.2);
function syncProgramSource(){
 $('program').value=programTarget==='receiver'
  ?doc.receiverDraft??doc.receiverSource??level.receiver??''
  :doc.draftSource??doc.source??level.program??'';
}
$('workshop-program-target').onchange=()=>{programTarget=$('workshop-program-target').value;syncProgramSource();};
$('assemble').onclick=()=>{
 try{
  const o8=level.machine==='overture';
  const result=o8?Game.overture.assemble($('program').value,$('isa-rules').value):level.machine==='symphony'?Game.symphony.assemble($('program').value):Circuit.assemble($('program').value);
  const receiving=programTarget==='receiver',id=receiving?'rx-rom':'rom';
  const rom=doc.nodes.find(n=>n.id===id&&['ROM16','ROM32'].includes(n.type));if(!rom)throw Error('缺少程序 ROM · '+id);
  checkpoint();rom.program=result.words;
  if(receiving){doc.receiverSource=$('program').value;delete doc.receiverDraft;}
  else{doc.source=$('program').value;delete doc.draftSource;}
  if(o8){doc.isa=$('isa-rules').value;delete doc.draftIsa;}
  edit();notify('已加载 '+result.words.length+' 条指令，状态已复位');
 }catch(e){notify(e.message);}
};
$('export').onclick=()=>{
 try{
  download({kind:'CircuitMind-blueprint',version:3,level:level.id,...Circuit.packBlueprint(doc)},'CircuitMind-'+level.id+'.json');
 }catch(e){notify('导出失败：'+e.message);}
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
  const circuit=Circuit.unpackBlueprint(data);
  const checked=compile(circuit.nodes,circuit.wires);
  if(checked.error&&!checked.error.includes('未连接')&&!checked.error.includes('组合反馈'))throw Error(checked.error);
 openLevel(Game.levels.some(l=>l.id===data.level)?data.level:'sandbox');checkpoint();doc=clone(circuit);
 if(Game.isComputer(level))syncProgramSource();
 edit();$('fit').click();notify('蓝图已导入');
 }catch(e){notify('导入失败：'+e.message);}
 $('file').value='';
};
document.addEventListener('keydown',e=>{
 if(document.querySelector?.('dialog[open]'))return;
 if(['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName))return;
 if(e.key==='Escape'){pending=null;selected=null;multi.clear();draw();}
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='c'){
  const ids=new Set(multi);if(selected)ids.add(selected);clipboard={nodes:clone(doc.nodes.filter(n=>ids.has(n.id))),wires:clone(doc.wires.filter(w=>ids.has(w.from)&&ids.has(w.to)))};if(clipboard.nodes.length){e.preventDefault();notify('已复制 '+clipboard.nodes.length+' 个元件及内部连线');}
 }
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='v'&&clipboard?.nodes.length){
  e.preventDefault();if(doc.nodes.length+clipboard.nodes.length>500){notify('画布最多 500 个元件');return;}checkpoint();const ids=new Map();multi.clear();
  for(const n of clipboard.nodes){const id='copy'+Date.now()+'-'+serial++;ids.set(n.id,id);doc.nodes.push({...clone(n),id,x:n.x+48,y:n.y+48});multi.add(id);}
  for(const w of clipboard.wires){
   const wire={...clone(w),id:'copywire'+Date.now()+'-'+serial++,from:ids.get(w.from),to:ids.get(w.to)};
   if(w.points)wire.points=w.points.map(p=>({x:p.x+48,y:p.y+48}));
   doc.wires.push(wire);
  }
  selected=[...multi][0];edit();
 }
 if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();removeSelected();}
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?$('redo').click():$('undo').click();}
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();$('redo').click();}
 if(e.code==='Space'&&e.target.tagName!=='BUTTON'&&(!level.workshop||workshopEditing)){e.preventDefault();singleStep();}
});
$('back-circuit').onclick=()=>{
 if(!inspectionStack.length)return;
 const parent=inspectionStack.pop();
 openLevel(parent.levelId,false,true);
 doc=parent.doc;compileCurrent();
 ({state,ticks,records,camera,selected,mazeMapIndex,peripheral,light,studio}=parent);
 if(level.workshop==='maze')$('maze-map').value=String(mazeMapIndex);
 if(level.workshop)setWorkshopView(true);
 if(!net.error)values=net.evaluate(state,peripheral?{input:peripheral.input}:{}).values;
 draw();renderTrace();notify('已返回上层电路');
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
function downloadFile(text,name,type){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function download(data,name){downloadFile(JSON.stringify(data,null,2),name,'application/json');}
$('backup').onclick=()=>{persist();download({kind:'CircuitMind-save',version:3,saved,completed,library,last:level.id},'CircuitMind-save.json');};
function showWorld(){
 const container=$('world-map');container.replaceChildren();let chapter='',section;
 for(const l of visibleLessons()){
  if(l.chapter!==chapter){chapter=l.chapter;section=document.createElement('section');const h=document.createElement('h2');h.textContent=chapter;section.append(h);container.append(section);}
  const b=button((completed[l.id]?'✓ ':'○ ')+l.title,()=>{$('world').close();openLevel(l.id);},completed[l.id]?'done':'');b.disabled=!!locked(l);if(b.disabled)b.title='先完成「'+Game.prerequisite(l).title+'」';section.append(b);
 }
 $('world').showModal();
}
$('home').onclick=showWorld;$('close-world').onclick=()=>$('world').close();
const {originals:workshopWorks,guides:workshopGuides,markdown:workshopMarkdown,wiring:workshopWiring,buildIntro:workshopIntro}=Game.workshopGuides;
const kit=Game.workshopKit;
function studioNeeds(){
 if(net.error)return net.error;
 if(!state.ram||!doc.nodes.some(n=>n.id==='rom'))return '请接好 ROM 和 RAM 接口。';
 if(level.demo==='shell'&&!state.storage)return '请接好外存接口 storage。';
 if(level.demo==='link'&&(!state['rx-ram']||!['strobe','output','rx-strobe','rx-output'].every(id=>net.incoming.has(id))))
  return '请接好两台 CPU 各自的 RAM、输出和输出有效端口。';
 if(level.demo==='rhythm'&&!['strobe','output'].every(id=>net.incoming.has(id)))return '请接好 OUT 和输出有效端口。';
 return '';
}
function studioAutomatic(){return ['lander','cube','rhythm'].includes(level.demo);}
function studioBusy(){return !!state.ram?.[kit.command];}
function studioResult(){return level.demo==='lander'?state.ram?.[kit.model+10]||0:0;}
function queueStudio(value){
 const missing=studioNeeds();
 if(missing){studio.status=missing;renderStudio();return false;}
 if(studioBusy()||studioResult())return false;
 const memory={...state.ram,[kit.command]:value};
 if(level.demo==='cube')for(let i=0;i<kit.screenWidth*kit.screenHeight;i++)delete memory[kit.framebuffer+i];
 state.ram=memory;
 studio.budget=ticks+24000;studio.status='';
 return true;
}
function queueStudioFrame(){
 return queueStudio(level.demo==='lander'?16|(studio.mask|studio.keys):level.demo==='rhythm'?65:1);
}
function startStudio(mode='command'){
 if(timer)return;
 const missing=studioNeeds();
 if(missing){studio.status=missing;renderStudio();return;}
 studio.auto=mode==='play';
 const pendingCommand=state.ram[kit.command]||0;
 let advanceAfterEdit=mode==='frame'&&level.demo==='rhythm'&&pendingCommand>0&&pendingCommand<65;
 if(studioBusy()){studio.budget=ticks+24000;studio.status='';}
 else if(mode==='frame'&&!queueStudioFrame())return;
 timer=setInterval(()=>{
  const now=performance.now();
  if(studio.auto&&!studioBusy()&&now>=studio.nextAt&&!studioResult()){
   queueStudioFrame();
   const interval=level.demo==='rhythm'?Number($('studio-tempo').value):level.demo==='lander'?140:220;
   studio.nextAt=now+interval;
  }
  for(let i=0;i<512&&studioBusy()&&performance.now()<now+11&&timer;i++){
   const previous=ticks;step(false);
   if(ticks===previous||ticks>=studio.budget&&studioBusy()){
    studio.status='CPU 尚未清除命令。可切换到电路与汇编检查。';stop();break;
   }
  }
  if(timer&&!studioBusy()&&advanceAfterEdit){
   advanceAfterEdit=false;
   queueStudioFrame();
  }
  if(studioResult()||(!studioBusy()&&!studio.auto))stop();
  draw();
 },16);
 syncClock();renderStudio();
}
function sendStudio(value){if(queueStudio(value))startStudio();}
function tryStudioAudio(){
 try{
  const Audio=window.AudioContext||window.webkitAudioContext;
  if(!Audio)return;
  studioAudio??=new Audio();
  studioAudio.resume().catch(()=>{});
 }catch{/* The lamps still show the CPU output without an audio device. */}
}
function playStudioNotes(mask){
 if(studioAudio?.state!=='running')return;
 for(let i=0;i<8;i++)if(mask&(1<<i)){
  const voice=studioAudio.createOscillator(),gain=studioAudio.createGain(),time=studioAudio.currentTime;
  const frequency=[85,135,185,245,330,440,660,880][i];
  voice.type=i%2?'triangle':'sine';
  voice.frequency.setValueAtTime(frequency*1.65,time);
  voice.frequency.exponentialRampToValueAtTime(frequency,time+.045);
  gain.gain.setValueAtTime(.055,time);gain.gain.exponentialRampToValueAtTime(.001,time+.13);
  voice.connect(gain);gain.connect(studioAudio.destination);voice.start(time);voice.stop(time+.14);
 }
}
function studioGrid(label,interactive){
 const grid=document.createElement('div');grid.className='studio-grid';grid.setAttribute('role','group');grid.setAttribute('aria-label',label);
 for(let i=0;i<64;i++){
  const cell=interactive?button('',()=>{
   if(level.demo==='rhythm')sendStudio(i+1);
   else if(!studioBusy()){state.ram={...state.ram,[kit.data+(i>>3)]:(state.ram?.[kit.data+(i>>3)]||0)^(1<<(i&7))};draw();}
  }):document.createElement('span');
  if(interactive){cell.type='button';cell.setAttribute('aria-label','第 '+((i>>3)+1)+' 行第 '+((i&7)+1)+' 列');}
  else cell.setAttribute('aria-hidden','true');
  grid.append(cell);
 }
 return grid;
}
function prepareStudio(){
 const display=$('studio-display'),extra=$('studio-extra');
 display.replaceChildren();extra.replaceChildren();
 $('studio-next-frame').hidden=!studioAutomatic();
 if(level.demo==='lander'||level.demo==='cube'){
  const canvas=document.createElement('canvas');
  canvas.width=kit.screenWidth;canvas.height=kit.screenHeight;
  canvas.setAttribute('aria-label',level.demo==='lander'?'飞船像素屏':'立方体像素屏');
  canvas.className='studio-screen';canvas.id='studio-screen';display.append(canvas);
 }
 if(level.demo==='lander'){
  for(const [label,mask] of [['左移',2],['推力',1],['右移',4]]){
   const control=button(label,()=>{studio.mask^=mask;renderStudio();});
   control.id='studio-move-'+mask;control.type='button';extra.append(control);
  }
 }else if(level.demo==='link'){
  for(const [label,id,editable] of [['发送端','studio-image-left',true],['接收端','studio-image-right',false]]){
   const area=document.createElement('section'),heading=document.createElement('h3');
   heading.textContent=label;
   const grid=studioGrid(label,editable);grid.id=id;
   area.append(heading,grid);display.append(area);
  }
  extra.append(button('发送',()=>sendStudio(1),'primary'),button('翻转下一帧的一位',()=>{studio.link.corrupt();renderStudio();}));
 }else if(level.demo==='rhythm'){
  const grid=studioGrid('八条音轨，每行八步',true);grid.id='studio-pattern';display.append(grid);
  const speed=document.createElement('select');speed.id='studio-tempo';
  for(const [v,label] of [[150,'快'],[240,'中'],[410,'慢']]){
   const entry=document.createElement('option');entry.value=v;entry.textContent=label;speed.append(entry);
  }
  speed.value='240';extra.append(field('速度',speed));
 }else if(level.demo==='shell'){
  const terminal=document.createElement('pre');terminal.id='studio-terminal';terminal.setAttribute('aria-label','终端输出');
  const form=document.createElement('form');form.className='actions studio-command';
  const input=document.createElement('input');input.maxLength=40;input.setAttribute('aria-label','命令');input.placeholder='ls / cat readme.txt / run count.bin';input.autocomplete='off';input.spellcheck=false;
  const submit=document.createElement('button');submit.type='submit';submit.textContent='执行';
  form.append(input,submit);display.append(terminal,form);
  form.onsubmit=e=>{
   e.preventDefault();const value=input.value.trim();
   if(!/^[ -~]{1,40}$/.test(value)){studio.status='请输入 1–40 个 ASCII 字符。';renderStudio();return;}
   if(!queueStudio(value.length))return;
   Array.from(value,(c,i)=>state.ram[kit.data+i]=c.charCodeAt(0));
   input.value='';startStudio();
  };
 }
 display.className='studio-display '+(level.demo==='link'?'studio-link':'');
}
function paintStudioFrame(canvas,memory,landing){
 const {screenWidth:width,screenHeight:height,framebuffer}=kit;
 if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
 const ctx=canvas.getContext('2d');if(!ctx)return;
 ctx.fillStyle='#141d2d';ctx.fillRect(0,0,width,height);
 if(landing){
  ctx.fillStyle='#526681';
  for(let i=0;i<24;i++)ctx.fillRect((i*23+5)%width,(i*13+2)%39,1,1);
  ctx.fillStyle='#43536b';ctx.fillRect(0,45,width,3);ctx.fillStyle='#79d4a2';ctx.fillRect(24,45,17,1);
 }
 for(let i=0;i<width*height;i++){
  const pixel=memory[framebuffer+i];if(!pixel)continue;
  ctx.fillStyle='rgb('+((pixel>>>5)*255/7)+','+(((pixel>>>2)&7)*255/7)+','+((pixel&3)*85)+')';
  ctx.fillRect(i%width,Math.floor(i/width),1,1);
 }
}
function studioText(memory){
 let output='';
 for(let addr=0x5400;addr<=0x5aff&&memory[addr];addr++)output+=String.fromCharCode(memory[addr]);
 return output;
}
function renderStudio(){
 const memory=state.ram||{},model=kit.model;
 const run=$('studio-run'),next=$('studio-next-frame'),single=$('studio-step');
 run.disabled=!!studioResult()||!studioAutomatic()&&!studioBusy();
 run.textContent=timer?'暂停':studioAutomatic()?'播放':'继续处理';
 next.disabled=!!timer||!!studioResult();single.disabled=!!timer||!!studioResult();
 const status=$('studio-status'),registers=$('studio-registers');
 let detail='CPU 周期 '+ticks,message=studio.status||(studioBusy()?'CPU 正在处理输入。':'');
 if(level.demo==='lander'||level.demo==='cube')paintStudioFrame($('studio-screen'),memory,level.demo==='lander');
 if(level.demo==='lander'){
  const word=offset=>Array.from({length:4},(_,i)=>(memory[offset+i]||0)<<(i*8)).reduce((a,b)=>a|b,0);
  for(const mask of [1,2,4])$('studio-move-'+mask).setAttribute('aria-pressed',String(!!((studio.mask|studio.keys)&mask)));
  if(ticks>0)detail+=' · 高度 '+(word(model)/16).toFixed(1)+' · 下落速度 '+(word(model+4)/16).toFixed(2)+' · 燃料 '+(memory[model+8]||0);
  message=message||(studioResult()===1?'着陆成功！':studioResult()===2?'着陆失败，按复位重试。':'方向键 ← ↑ → 控制横移与推力。');
 }else if(level.demo==='cube'){
  detail+=' · 下一角度 '+(memory[model]||0)+' / 16';
  if(!studio.status&&studioBusy())message=timer?'CPU 正在绘制当前帧。':'当前帧尚未画完，点「推进一帧」继续。';
 }else if(level.demo==='rhythm'){
  const column=memory[model+64];
  Array.from($('studio-pattern').children).forEach((cell,i)=>{
   cell.className=i%8===column?'playhead':'';
   cell.setAttribute('aria-pressed',String(!!memory[model+i]));
  });
  detail+=' · 音轨掩码 '+fmt(memory[model+65]||0,8);
 }else if(level.demo==='link'){
  for(const [id,ram,editable] of [['studio-image-left',memory,true],['studio-image-right',state['rx-ram']||{},false]]){
   Array.from($(id).children).forEach((cell,i)=>{
    const lit=!!(ram[kit.data+(i>>3)]&(1<<(i&7)));
    if(editable)cell.setAttribute('aria-pressed',String(lit));else cell.className=lit?'lit':'';
   });
  }
  detail+=' · 已确认 '+(memory[model+16]||0)+' / 8 行 · 重发 '+(memory[model+17]||0)+' 次';
  message=studio.status||(studio.link.armed?'下一帧会被翻转一位。':studioBusy()?'发送中。':memory[model+16]===8?'八行已接收。':'在左屏画图，再点发送。');
 }else if(level.demo==='shell'){
  const console=$('studio-terminal');
  const output=studioText(memory);
  if(console.textContent!==output){console.textContent=output;console.scrollTop=console.scrollHeight;}
 }
 registers.textContent=detail;
 if(status.textContent!==message)status.textContent=message;
 status.className=studioResult()===1?'workshop-win':'';
}
$('studio-run').onclick=()=>{
 if(timer){stop();draw();return;}
 if(level.demo==='rhythm')tryStudioAudio();
 startStudio(studioAutomatic()?'play':'command');
};
$('studio-next-frame').onclick=()=>{if(level.demo==='rhythm')tryStudioAudio();startStudio('frame');};
$('studio-step').onclick=()=>{
 if(!studioBusy()&&studioAutomatic()&&!queueStudioFrame())return;
 if(level.demo==='rhythm')tryStudioAudio();
 step();
};
$('studio-reset').onclick=()=>{stop();compileCurrent();draw();};
function landerKey(e,pressed){
 if(level.demo!=='lander'||workshopEditing||['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)||document.querySelector?.('dialog[open]'))return;
 const mask={ArrowUp:1,ArrowLeft:2,ArrowRight:4}[e.key];if(!mask)return;
 e.preventDefault();
 studio.keys=pressed?studio.keys|mask:studio.keys&~mask;
 renderStudio();
}
document.addEventListener('keydown',e=>landerKey(e,true));
document.addEventListener('keyup',e=>landerKey(e,false));
$('workshop').onclick=()=>{
 $('workshop-works').replaceChildren(...workshopWorks.map(work=>{
  const card=document.createElement('section');card.className='panel workshop-work';
  const name=document.createElement('h3');name.textContent=work.title;
  const description=document.createElement('p');description.textContent=work.text;
  const play=button('试玩'+work.title,()=>{
   $('workshop-dialog').close();
   if(level===work){if(studio||light)stop();setWorkshopView(false);draw();}
   else openLevel(work.id);
   $('workshop-view').focus();
  },'primary');
  const actions=document.createElement('div');actions.className='actions';
  const guide=button('技术说明与搭建',()=>{$('workshop-dialog').close();showWorkshopGuide(work);});
  actions.append(play,guide);card.append(name,description,actions);return card;
 }));
 $('workshop-dialog').showModal();
};
$('close-workshop').onclick=()=>$('workshop-dialog').close();
$('close-workshop-guide').onclick=()=>$('workshop-guide-dialog').close();
$('workshop-guide').onclick=()=>{
 const work=workshopWorks.find(entry=>entry.id===(level.workshopBuildOf||level.id));
 if(work)showWorkshopGuide(work);
};
function placeWorkshopParts(work,all){
 const reserved=new Set(work.workshop==='light'?[...lightKit.inputIds,...lightKit.outputIds]:['pc','rom','ram','input','output','strobe','keyboard','storage','screen']);
 const ids=new Set(doc.nodes.map(n=>n.id));
 const nodes=work.build().nodes.filter(n=>(all||reserved.has(n.id.replace(/^rx-/,'')))&&!ids.has(n.id));
 if(!nodes.length){notify('所需元件已在画布上');return;}
 if(doc.nodes.length+nodes.length>500){notify('画布最多 500 个元件');return;}
 checkpoint();
 for(const node of nodes){
  delete node.program;
  if(all)node.label=node.id;
  doc.nodes.push(node);
 }
 edit();$('fit').click();
}
function showWorkshopGuide(work){
 const guide=workshopGuides[work.id],dialog=$('workshop-guide-dialog');
 if(!guide)return;
 $('workshop-guide-title').textContent=work.title;
 const content=$('workshop-guide-content');content.replaceChildren();
 function add(tag,text,parent=content){
  const el=document.createElement(tag);el.textContent=text;parent.append(el);return el;
 }
 add('h3','技术说明');
 const flow=add('ol','');flow.className='workshop-flow';
 guide.flow.forEach(label=>add('li',label,flow));
 add('p',guide.tech);
 const ports=add('ul','');guide.ports.forEach(item=>add('li',item,ports));
 add('h3','从空白搭建');
 add('p',guide.intro||workshopIntro);
 const steps=add('ol','');guide.steps.forEach(item=>add('li',item,steps));
 add('h3','检验结果');add('p',guide.check);
 add('h3','练习');add('p',guide.challenge);
 const connections=add('details','');
 add('summary','查看参考接线表',connections);
 add('pre',workshopWiring(work),connections);
 if(work.program){
  const notes=add('details','');
  add('summary','查看参考汇编',notes);
  if(work.receiver)add('h3','发送端',notes);
  add('pre',work.program,notes);
  if(work.receiver){add('h3','接收端',notes);add('pre',work.receiver,notes);}
 }
 const inBuild=level.workshopBuildOf===work.id;
 $('workshop-guide-actions').replaceChildren(
  button('查看作品电路',()=>{dialog.close();if(level===work){if(studio||light)stop();setWorkshopView(true);$('fit').click();}else openLevel(work.id,false,false,true);}),
  button(inBuild?'放入接口端口':'从空白画布搭建',()=>{
   dialog.close();
   if(inBuild){setWorkshopView(true);placeWorkshopParts(work,false);}
   else{openLevel(work.id+'-build',false,false,true);persist();}
  },'primary'),
  ...(inBuild?[button('放入未连线的参考元件',()=>{dialog.close();setWorkshopView(true);placeWorkshopParts(work,true);})]:[]),
  button('下载教程',()=>downloadFile(workshopMarkdown(work),'CircuitMind-'+work.id+'.md','text/markdown;charset=utf-8')),
  button('下载参考蓝图',()=>download({kind:'CircuitMind-blueprint',version:3,level:work.id,...Circuit.packBlueprint(work.build())},'CircuitMind-'+work.id+'.json'))
 );
 dialog.showModal();
}
$('workshop-view').onclick=()=>{
 if(!level.workshop)return;
 if(studio||light)stop();
 setWorkshopView(!workshopEditing);
 if(workshopEditing)$('fit').click();else draw();
};
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
$('program').oninput=()=>{
 if(programTarget==='receiver')doc.receiverDraft=$('program').value;else doc.draftSource=$('program').value;
 persist();
};
$('isa-rules').oninput=()=>{doc.draftIsa=$('isa-rules').value;persist();};
function renderDebugger(){
 const rom=doc.nodes.find(n=>n.id==='rom');debug.replaceChildren();if(!rom)return;
 const title=document.createElement('h3');title.textContent='机器指令 · 点击设置断点';debug.append(title);
 const stride=rom.type==='ROM32'?4:1;
 const instructions=replayCase?.program?.words??rom.program??[],pc=Math.floor((values.pc?.[0]||0)/stride),names=Object.fromEntries(Object.entries(Circuit.opcodes).map(([k,v])=>[v,k]));
 let rules;if(level.machine==='overture'){try{rules=Game.overture.parseRules(doc.isa??Game.overture.defaultRules);}catch{return;}}
 for(let i=Math.max(0,pc-3);i<Math.min(instructions.length,pc+7);i++){
  const address=i*stride;
  const word=instructions[i],decoded=stride===4?'0x'+word.toString(16).padStart(8,'0'):rules?Game.overture.disassemble(word,rules):(names[word>>>8]||'???')+' '+(word&255);
  const b=button((breakpoints.has(address)?'● ':'  ')+address.toString(16).padStart(2,'0')+'  '+decoded,()=>{breakpoints.has(address)?breakpoints.delete(address):breakpoints.add(address);renderDebugger();},i===pc?'current-instruction':'');debug.append(b);
 }
}
function renderScreen(){
 display.hidden=usesMineDevice()||level.id==='mines';if(display.hidden)return;
 if(level.demo==='lander'||level.demo==='cube'){paintStudioFrame(display,state.ram||{},level.demo==='lander');return;}
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
 paintPixels(display,state.ram||[],128);
}
function paintPixels(canvas,memory,offset=0){
 if(canvas.width!==8||canvas.height!==8){canvas.width=8;canvas.height=8;}
 const ctx=canvas.getContext('2d');if(!ctx)return;
 for(let i=0;i<64;i++){
  const v=memory[offset+i]||0;
  ctx.fillStyle='rgb('+((v>>>5)*255/7)+','+(((v>>>2)&7)*255/7)+','+((v&3)*85)+')';
  ctx.fillRect(i%8,Math.floor(i/8),1,1);
 }
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
 const lastLevel=Game.levels.find(l=>l.id===last);
 openLevel(lastLevel&&(!locked(lastLevel)||saved[last])?last:firstAvailable().id);
}
boot();

