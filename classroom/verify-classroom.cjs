'use strict';

const assert=require('node:assert/strict');
const http=require('node:http');
const {createApi}=require('./api.cjs');
const {createClassroom}=require('./classroom.cjs');

async function main(){
 const origin='https://classroom.example.com';
 const inviteCode='test-invite-123456';
 const mentorCalls=[];
 let mentorUnavailable=false;
 const classroom=createClassroom({inviteCode,origin});
 const api=createApi({token:'',classroom,mentor:async request=>{
  if(mentorUnavailable)throw Object.assign(Error('导师服务暂时不可用'),{status:502});
  mentorCalls.push(request);
  return {answer:'请检查 NAND 的第二个输入。',conversationId:'conversation-'+request.userId};
 }});
 const server=http.createServer(async(req,res)=>{
  if(!await api(req,res,new URL(req.url,origin).pathname))res.writeHead(404).end();
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 async function call(path,{body,cookie,requestOrigin=origin}={}){
  const headers={Origin:requestOrigin};
  if(cookie)headers.Cookie=cookie;
  if(body)headers['Content-Type']='application/json';
  const response=await fetch(base+path,{headers,method:body?'POST':'GET',body:body&&JSON.stringify(body)});
  return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')};
 }
 const join='/api/classroom',chat='/api/mentor/chat';
 const question='我的 NAND 为什么没通过？';
 try{
  assert.deepEqual((await call(join)).data,{required:true,joined:false});
  assert.equal((await call(chat,{body:{question}})).status,401);
  assert.equal((await call(join,{body:{code:'incorrect-code'}})).status,403);
  assert.equal((await call(join,{body:{code:inviteCode},requestOrigin:'https://other.example.com'})).status,403);
  const firstJoin=await call(join,{body:{code:inviteCode}});
  assert.equal(firstJoin.status,200);
  assert.match(firstJoin.cookie,/HttpOnly; SameSite=Strict; Max-Age=28800; Secure$/);
  const first=firstJoin.cookie.split(';')[0];
  const second=(await call(join,{body:{code:inviteCode}})).cookie.split(';')[0];
  assert.notEqual(first,second);
  assert.deepEqual((await call(join,{cookie:first})).data,{required:true,joined:true});
  const circuit=(await call('/api/example')).data.circuit;
  circuit.wires[1].from='A';
  const wrong=await call(chat,{cookie:first,body:{question,circuit,levelId:'nand',userId:'claimed-id'}});
  assert.equal(wrong.status,200);
  assert.deepEqual(wrong.data.evidence,{kind:'tests',passed:3,total:4,
   failure:{input:{A:1,B:0},expected:{Q:1},actual:{Q:0}}});
  assert.notEqual(mentorCalls[0].userId,'claimed-id');
  assert.equal((await call(chat,{cookie:second,body:{question,conversationId:wrong.data.conversationId}})).status,403);
  const other=await call(chat,{cookie:second,body:{question}});
  assert.equal(other.status,200);
  assert.notEqual(mentorCalls[1].userId,mentorCalls[0].userId);
  circuit.wires[1].from='B';
  const fixed=await call(chat,{cookie:first,body:{question,circuit,levelId:'nand',conversationId:wrong.data.conversationId}});
  assert.deepEqual(fixed.data.evidence,{kind:'tests',passed:4,total:4});
  assert.equal(fixed.data.conversationId,wrong.data.conversationId);
  mentorUnavailable=true;
  const unavailable=await call(chat,{cookie:second,body:{question,circuit,levelId:'nand'}});
  assert.equal(unavailable.status,502);
  assert.deepEqual(unavailable.data.evidence,{kind:'tests',passed:4,total:4});
  mentorUnavailable=false;
  for(let index=0;index<6;index++)assert.equal((await call(chat,{cookie:first,body:{question}})).status,200);
  assert.equal((await call(chat,{cookie:first,body:{question}})).status,429);
  console.log('PASS classroom invite, two isolated mentor conversations, quotas, and broken/repaired NAND evidence');
 }finally{await new Promise(resolve=>server.close(resolve));}
}

main().catch(err=>{console.error(err);process.exitCode=1;});
