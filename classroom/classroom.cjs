'use strict';

const {randomBytes}=require('node:crypto');

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

function createClassroom({origin}){
 const site=new URL(origin);
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

 function begin(existing,conversationId){
  if(conversationId!==undefined&&!existing?.conversations.has(conversationId)){
   throw error(409,'原导师会话已失效，请重新发送问题。');
  }
  if(existing?.busy)throw error(429,'上一条提问还在处理，请等待导师回复。');
  if(active>=4)throw error(503,'导师正在为其他同学答疑，请稍后重试。');
  const now=Date.now();
  const current=existing||{userId:randomBytes(10).toString('hex'),expires:now+sessionAge,conversations:new Set(),since:now,count:0,busy:false};
  useQuota(current,now,8);
  useQuota(classroomQuota,now,60);
  let cookie;
  if(!existing){
   for(const [token,current] of sessions)if(current.expires<=now)sessions.delete(token);
   if(sessions.size>=1024)throw error(503,'导师会话已满，请稍后重试。');
   const token=randomBytes(24).toString('hex');
   sessions.set(token,current);
   const secure=site.protocol==='https:'?'; Secure':'';
   cookie=`${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${sessionAge/1000}${secure}`;
  }
  current.busy=true;
  active++;
  return {current,cookie,finish:()=>{current.busy=false;active--;}};
 }

 return {origin:site.origin,session,begin};
}

module.exports={createClassroom};
