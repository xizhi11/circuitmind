'use strict';
const assert=require('node:assert/strict');
const {createMentor}=require('./mentor.cjs');
(async()=>{
 const calls=[];
 const chat=createMentor({apiKey:'test-only-key',fetchImpl:async(url,options)=>{
  calls.push({url,options,body:JSON.parse(options.body)});
  return {ok:true,json:async()=>url.endsWith('create_conversation')?{Conversation:{AppConversationID:'conversation_1'}}:{event:'message_end',answer:'Q=0',id:'message_1',tool_messages:['实际工具结果']}};
 }});
 const first=await chat({userId:'student_1',question:'检查输出',circuit:{nodes:[],wires:[]}});
 assert.equal(first.conversationId,'conversation_1');
 assert.equal(first.answer,'Q=0');
 assert.equal(first.toolMessages.length,1);
 assert.equal(calls[0].url,'https://ai-agent.ccnu.edu.cn/api/proxy/api/v1/create_conversation');
 assert.equal(calls[1].url,'https://ai-agent.ccnu.edu.cn/api/proxy/api/v1/chat_query_v2');
 assert.deepEqual(calls[0].body,{UserID:'student_1',ConversationName:'CircuitMind 电路导师'});
 for(const {options,body} of calls){
  assert.equal(options.headers.Apikey,'test-only-key');
  assert.equal(options.headers['Content-Type'],'application/json');
  assert.equal(Object.hasOwn(body,'AppKey'),false);
 }
 assert.equal(calls[1].body.ResponseMode,'blocking');
 assert.equal(calls[1].body.AppConversationID,'conversation_1');
 assert.ok(calls[1].body.Query.includes('"nodes":[]'));
 assert.ok(!JSON.stringify(first).includes('test-only-key'));
 await chat({userId:'student_1',conversationId:first.conversationId,question:'为什么？',evidence:{kind:'tests',passed:3,total:4}});
 assert.equal(calls.length,3);
 assert.match(calls[2].body.Query,/无需再次调用仿真插件/);
 assert.match(calls[2].body.Query,/"passed":3/);
 assert.ok(!calls[2].body.Query.includes('游戏电路快照'));
 const timedOut=createMentor({apiKey:'test-only-key',fetchImpl:async()=>{throw new DOMException('Timeout','TimeoutError');}});
 await assert.rejects(timedOut({userId:'x',question:'test'}),e=>e.status===504&&e.message.includes('导师回复超时')); // Continuing a conversation must not create another one.
 await assert.rejects(chat({userId:'x'.repeat(21),question:'test'}),/userId/);
 await assert.rejects(chat({userId:'x',question:'test',circuit:{}}),/nodes/);
 assert.equal(calls.length,3);
 const failure=createMentor({apiKey:'test-only-key',fetchImpl:async()=>({ok:false,status:401})});
 await assert.rejects(failure({userId:'x',question:'test'}),e=>e.status===502&&!e.message.includes('test-only-key'));
 const rejected=createMentor({apiKey:'test-only-key',fetchImpl:async()=>({ok:false,status:403,json:async()=>({ResponseMetadata:{Error:{Message:'Unauthorized: invalid token'}}})})});
 await assert.rejects(rejected({userId:'x',question:'test'}),e=>e.status===502&&e.message.includes('重新复制')&&!e.message.includes('test-only-key'));
 const blocked=createMentor({apiKey:'test-only-key',fetchImpl:async()=>new Response('<html>Forbidden</html>',{status:403,headers:{'Content-Type':'text/html'}})});
 await assert.rejects(blocked({userId:'x',question:'test'}),/网关.*创建会话.*403/);
 const invalid=createMentor({apiKey:'test-only-key',fetchImpl:async()=>({ok:true,json:async()=>({})})});
 await assert.rejects(invalid({userId:'x',conversationId:'c',question:'test'}),/有效回答/);
 console.log('Mentor checks passed: authentication header, conversation reuse, circuit snapshot, response parsing, validation and upstream failures.');
})().catch(e=>{console.error(e);process.exitCode=1;});
