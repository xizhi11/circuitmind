'use strict';

const {createHash, randomBytes, timingSafeEqual}=require('node:crypto');

const sessionAge=8*60*60*1000;
const quotaWindow=5*60*1000;
const cookieName='cm_classroom';

function error(status,message){
 return Object.assign(Error(message),{status});
}

function useQuota(record,now,limit){
 if(now-record.since>=quotaWindow){record.since=now;record.count=0;}
 if(record.count>=limit)throw error(429,'问答次数已达本轮上限，请几分钟后重试。');
 record.count++;
}

function createClassroom({inviteCode,origin}){
 if(!inviteCode)return null;
 if(!/^[\x21-\x7e]{12,64}$/.test(inviteCode))throw Error('班级邀请码需要为 12 至 64 位可见 ASCII 字符');
 const site=new URL(origin);
 const inviteDigest=createHash('sha256').update(inviteCode).digest();
 const sessions=new Map();
 const classroomQuota={since:0,count:0};
 let active=0;

 function session(req){
  const token=String(req.headers.cookie||'').match(/(?:^|;\s*)cm_classroom=([a-f0-9]{48})(?:;|$)/)?.[1];
  const current=sessions.get(token);
  if(!current)return null;
  if(current.expires<=Date.now()){sessions.delete(token);return null;}
  return current;
 }

 function join(code){
  if(typeof code!=='string'||code.length>64||!timingSafeEqual(inviteDigest,createHash('sha256').update(code).digest())){
   throw error(403,'邀请码无效，请向老师或同学核对。');
  }
  const now=Date.now();
  for(const [token,current] of sessions)if(current.expires<=now)sessions.delete(token);
  if(sessions.size>=120)throw error(503,'本轮班级试玩人数已满，请稍后重试。');
  const token=randomBytes(24).toString('hex');
  sessions.set(token,{userId:randomBytes(10).toString('hex'),expires:now+sessionAge,conversations:new Set(),since:now,count:0,busy:false});
  const secure=site.protocol==='https:'?'; Secure':'';
  return `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${sessionAge/1000}${secure}`;
 }

 function begin(current,conversationId){
  if(conversationId!==undefined&&!current.conversations.has(conversationId)){
   throw error(403,'这段导师会话不属于当前浏览器，请在这里重新提问。');
  }
  if(current.busy)throw error(429,'上一条提问还在处理，请等待导师回复。');
  if(active>=4)throw error(503,'导师正在为其他同学答疑，请稍后重试。');
  const now=Date.now();
  useQuota(current,now,8);
  useQuota(classroomQuota,now,60);
  current.busy=true;
  active++;
  return ()=>{current.busy=false;active--;};
 }

 return {origin:site.origin,session,join,begin};
}

module.exports={createClassroom};
