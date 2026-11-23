'use strict';
const {Worker}=require('node:worker_threads');
const crypto=require('node:crypto');
const {createMentor}=require('./mentor.cjs');
const tools=['inspect','evaluate','step','test','trace'];
const circuitSchema={type:'object',required:['nodes','wires'],properties:{nodes:{type:'array',items:{type:'object',additionalProperties:true}},wires:{type:'array',items:{type:'object',additionalProperties:true}}}};
const integers={type:'object',additionalProperties:{type:'integer'}};
const bodySchema={type:'object',required:['circuit'],properties:{
 circuit:circuitSchema,inputs:integers,state:{type:'object',additionalProperties:true},
 ticks:{type:'integer',minimum:1,maximum:256},target:{type:'string'},levelId:{type:'string'},clocked:{type:'boolean'},
 cases:{type:'array',maxItems:256,items:{type:'object',required:['input','expected'],properties:{input:integers,expected:integers}}}
}};
function specification(){return {openapi:'3.0.3',info:{title:'CircuitMind 电路仿真工具',version:'1.0.0',description:'确定性电路工具。请求显式携带电路快照；不会自动读取用户浏览器。'},servers:[{url:'/'}],components:{securitySchemes:{BearerAuth:{type:'http',scheme:'bearer'}}},paths:Object.fromEntries(tools.map(tool=>['/api/tools/'+tool,{post:{operationId:'circuit_'+tool,summary:{inspect:'检查电路结构',evaluate:'计算组合输出',step:'推进时钟并返回新状态',test:'执行关卡或自定义测试',trace:'追踪输出上游线路'}[tool],description:'使用原始电路 JSON。省略 state 时从初始状态执行。',security:[{BearerAuth:[]}],requestBody:{required:true,content:{'application/json':{schema:bodySchema}}},responses:{200:{description:'真实仿真结果或电路错误',content:{'application/json':{schema:{type:'object',additionalProperties:true}}}},400:{description:'请求格式无效'},401:{description:'认证失败'},413:{description:'请求过大'},503:{description:'工具繁忙或超时'}}}}]))};}
function requestError(status,message){return Object.assign(Error(message),{status});}

function readJson(req,maxBytes){
 if(!/^application\/json(?:\s*;|$)/i.test(String(req.headers['content-type']||'')))throw requestError(415,'需要 application/json');
 return new Promise((resolve,reject)=>{
  const chunks=[];
  let bytes=0;
  req.on('data',chunk=>{
   bytes+=chunk.length;
   if(bytes>maxBytes){chunks.length=0;reject(requestError(413,'请求内容过大'));return;}
   chunks.push(chunk);
  });
  req.on('end',()=>{
   if(bytes>maxBytes)return;
   try{
    const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(!body||typeof body!=='object'||Array.isArray(body))return reject(Error('请求必须是对象'));
    resolve(body);
   }catch{reject(Error('JSON 格式无效'));}
  });
  req.on('error',reject);
  req.on('aborted',()=>reject(Error('请求已中断')));
 });
}

function runTool(tool,request){
 return new Promise((resolve,reject)=>{
  const worker=new Worker(require.resolve('./tools.cjs'),{workerData:{tool,request},resourceLimits:{maxOldGenerationSizeMb:192}});
  const timer=setTimeout(()=>{worker.terminate();reject(requestError(503,'仿真超过 8 秒限制'));},8000);
  worker.once('message',message=>{clearTimeout(timer);worker.terminate();message.error?reject(Error(message.error)):resolve(message.result);});
  worker.once('error',e=>{clearTimeout(timer);reject(e);});
  worker.once('exit',code=>{clearTimeout(timer);if(code!==0)reject(Error('仿真进程已终止'));});
 });
}

async function mentorEvidence({circuit,levelId}){
 if(!circuit)return undefined;
 const tool=typeof levelId==='string'?'test':'inspect';
 try{
  const result=await runTool(tool,{circuit,levelId});
  if(!result.valid)return {kind:'structure',error:result.error,node:result.node};
  if(tool==='test'){
   const failure=result.cases.find(row=>!row.pass);
   return {kind:'tests',passed:result.passed,total:result.total,
    failure:failure&&{input:failure.input,expected:failure.expected,actual:failure.actual}};
  }
  return {kind:'structure',valid:true,expandedCount:result.expandedCount};
 }catch(err){
  if(err.status===503)return {kind:'unavailable',message:'仿真暂时无法完成，请稍后重试。'};
  return {kind:'unavailable',message:'当前电路或关卡无法生成仿真结果。'};
 }
}

function createApi({token=process.env.CIRCUITMIND_API_TOKEN||'',mentor=createMentor(),classroom=null}={}){
 let active=0;
 return async function api(req,res,pathname){
  if(!['/health','/openapi.json','/api/example'].includes(pathname)&&!pathname.startsWith('/api/'))return false;
  const send=(status,data,headers={})=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers});res.end(JSON.stringify(data));};
  if(req.method==='GET'&&pathname==='/health'){send(200,{ok:true,service:'CircuitMind',version:'1.0.0'});return true;}
  if(req.method==='GET'&&pathname==='/openapi.json'){send(200,specification());return true;}
  if(token){const provided=String(req.headers.authorization||''),expected='Bearer '+token;if(Buffer.byteLength(provided)!==Buffer.byteLength(expected)||!crypto.timingSafeEqual(Buffer.from(provided),Buffer.from(expected))){send(401,{error:'需要有效的 Bearer Token'});return true;}}
  const session=classroom?.session(req);
  if(classroom&&req.method==='POST'&&req.headers.origin!==classroom.origin){send(403,{error:'请从班级试玩页面发起请求。'});return true;}
  if(pathname==='/api/classroom'){
   if(req.method==='GET'){send(200,{required:!!classroom,joined:!!session});return true;}
   if(!classroom||req.method!=='POST'){send(405,{error:'此入口仅用于加入班级试玩。'});return true;}
   try{
    if(session){send(200,{joined:true});return true;}
    const {code}=await readJson(req,1024);
    send(200,{joined:true},{'Set-Cookie':classroom.join(typeof code==='string'?code.trim():code)});
   }catch(err){send(err.status||400,{error:err.message});}
   return true;
  }
  if(req.method==='GET'&&pathname==='/api/example'){const n=(id,type,x)=>({id,type,x,y:0,label:id,value:0}),w=(from,to,pin)=>({id:from+to+pin,from,to,pin});send(200,{circuit:{nodes:[n('A','IN',0),n('B','IN',0),n('N','NAND',200),n('Q','OUT',400)],wires:[w('A','N',0),w('B','N',1),w('N','Q',0)]},inputs:{A:1,B:1}});return true;}
  const isMentor=pathname==='/api/mentor/chat';
  const tool=pathname.split('/')[3];if(!isMentor&&(!tools.includes(tool)||pathname!=='/api/tools/'+tool)){send(404,{error:'接口不存在'});return true;}
  if(req.method!=='POST'){send(405,{error:'请使用 POST'});return true;}
  if(classroom&&!session){send(401,{error:'请输入班级邀请码。'});return true;}
  if(isMentor&&classroom){
   let finish;
   try{
    const request=await readJson(req,512*1024);
    if(typeof request.question!=='string'||!request.question.trim()||request.question.length>8000)throw Error('问题需要为 1–8000 个字符');
    finish=classroom.begin(session,request.conversationId);
    let evidence;
    if(request.circuit){
     if(active>=2)evidence={kind:'unavailable',message:'仿真正在处理其他请求，请稍后重试。'};
     else{
      active++;
      try{evidence=await mentorEvidence(request);}finally{active--;}
     }
    }
    const result=await mentor({...request,userId:session.userId,evidence});
    session.conversations.add(result.conversationId);
    send(200,{...result,evidence});
   }catch(err){send(err.status||400,{error:err.message});}finally{finish?.();}
   return true;
  }
  if(active>=2){send(503,{error:'工具繁忙，请稍后重试'});return true;}
  active++;
  try{
   const request=await readJson(req,4*1024*1024);
   if(isMentor){send(200,await mentor(request));return true;}
   send(200,await runTool(tool,request));
  }catch(e){send(e.status||400,{error:e.message});}finally{active--;}
  return true;
 };
}
module.exports={createApi,specification};
