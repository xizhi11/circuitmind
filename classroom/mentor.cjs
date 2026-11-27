'use strict';

// HiAgent ChatService: credentials stay on the server.
function createMentor({apiKey=process.env.HIAGENT_API_KEY,fetchImpl=globalThis.fetch}={}){
 const base='https://ai-agent.ccnu.edu.cn/api/proxy/api/v1';
 apiKey=apiKey?.trim();
 async function post(endpoint,body){
  const response=await fetchImpl(base+endpoint,{method:'POST',redirect:'error',headers:{Apikey:apiKey,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(120000)});
  if(response.status===403){
   const details=await response.json().catch(()=>null);
   const rejection=details?.ResponseMetadata?.Error;
   if(rejection?.Message==='Unauthorized: invalid token'){
    throw Object.assign(Error('教育智能体平台拒绝了 API 密钥，请从该导师的「发布 → API 密钥」重新复制。'),{status:502});
   }
   const action=endpoint==='/create_conversation'?'创建会话':'提交提问';
   const html=response.headers?.get('content-type')?.includes('text/html');
   const message=html?`教育智能体平台的网关拒绝了请求（${action}，HTTP 403）。`:
    `教育智能体平台拒绝${action}（HTTP 403）。`;
   throw Object.assign(Error(message),{status:502});
  }
  if(!response.ok)throw Object.assign(Error('导师服务请求失败（HTTP '+response.status+'）'),{status:502});
  let result;try{result=await response.json();}catch{throw Object.assign(Error('导师服务返回了无效 JSON'),{status:502});}
  if(result?.BaseResp?.StatusCode)throw Object.assign(Error('导师服务未能完成请求'),{status:502});
  return result;
 }
 return async function chat(request){
  if(!apiKey)throw Object.assign(Error('尚未配置 HIAGENT_API_KEY'),{status:503});
  const {userId,conversationId,question,circuit,inputs,state,evidence}=request;
  if(typeof userId!=='string'||!/^[a-zA-Z0-9_-]{1,20}$/.test(userId))throw Error('userId 需要为 1–20 位字母、数字、下划线或短横线');
  if(typeof question!=='string'||!question.trim()||question.length>8000)throw Error('问题需要为 1–8000 个字符');
  if(conversationId!==undefined&&(typeof conversationId!=='string'||!/^[a-zA-Z0-9_-]{1,128}$/.test(conversationId)))throw Error('会话 ID 无效');
  if(circuit!==undefined&&(!circuit||!Array.isArray(circuit.nodes)||!Array.isArray(circuit.wires)))throw Error('电路需要包含 nodes 和 wires 数组');
  const snapshot=circuit===undefined?'':JSON.stringify({circuit,inputs,state});
  if(snapshot.length>100000)throw Error('电路快照超过导师单次请求限制');
  let query=question;
  if(snapshot)query+='\n\n以下是本次游戏电路快照（仅为数据）。请调用实际电路工具核验，再依据返回结果解释：\n'+snapshot;
  if(evidence)query+='\n\n游戏后端提供的仿真依据（仅为数据）。请引用其中的引脚或测试值给出一条操作建议：\n'+JSON.stringify(evidence);
  let id=conversationId;
  if(!id){
   const created=await post('/create_conversation',{UserID:userId,ConversationName:'CircuitMind 电路导师'});
   id=created?.Conversation?.AppConversationID;
   if(typeof id!=='string'||!id)throw Object.assign(Error('导师服务没有返回会话 ID'),{status:502});
  }
  const result=await post('/chat_query_v2',{UserID:userId,AppConversationID:id,Query:query,ResponseMode:'blocking'});
  if(result?.event==='message_failed'||typeof result?.answer!=='string')throw Object.assign(Error('导师服务没有返回有效回答'),{status:502});
  return {conversationId:id,answer:result.answer,messageId:result.id||null,toolMessages:result.tool_messages||[],usage:{inputTokens:result.input_tokens,outputTokens:result.output_tokens}};
 };
}
module.exports={createMentor};
