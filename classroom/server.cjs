const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {parseEnv} = require('node:util');
const {createApi}=require('./api.cjs');
const {createClassroom}=require('./classroom.cjs');
const host=process.env.CIRCUITMIND_HOST||'127.0.0.1';
const port=Number(process.env.PORT||4173);
const loopback=host==='127.0.0.1'||host==='localhost';
const classroom=createClassroom({
  inviteCode:process.env.CIRCUITMIND_CLASSROOM_CODE,
  origin:process.env.CIRCUITMIND_PUBLIC_ORIGIN||process.env.RENDER_EXTERNAL_URL||(loopback?`http://${host}:${port}`:undefined)
});
if(!loopback&&!classroom&&!process.env.CIRCUITMIND_API_TOKEN)throw Error('对外监听需要配置班级邀请码或服务端 Bearer Token');
if(!loopback&&classroom&&!classroom.origin.startsWith('https://'))throw Error('公网班级试玩需要配置 HTTPS 地址');
if(classroom&&!process.env.HIAGENT_API_KEY?.trim())throw Error('班级试玩需要配置 HIAGENT_API_KEY');
const api=createApi({mentor:localRenderMentor(),classroom,...(classroom?{token:''}:{})});
const root = path.join(__dirname, 'dist');
const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
function localRenderMentor(){
  if(!loopback||process.env.HIAGENT_API_KEY)return undefined;
  const config=path.join(__dirname,'.env.backend');
  if(!fs.existsSync(config))return undefined;
  const {CIRCUITMIND_API_TOKEN:renderToken}=parseEnv(fs.readFileSync(config,'utf8'));
  if(!renderToken)return undefined;
  return async request=>{
    let response, result;
    try{
      response=await fetch('https://circuitmind-api-0qtu.onrender.com/api/mentor/chat',{
        method:'POST',redirect:'error',signal:AbortSignal.timeout(145000),
        headers:{Authorization:'Bearer '+renderToken,'Content-Type':'application/json'},
        body:JSON.stringify(request)
      });
      result=await response.json();
    }catch{
      throw Object.assign(Error('暂时连不上线上导师，请稍后重试。'),{status:502});
    }
    if(!response.ok){
      const message=response.status===401?'本地后端的 Render 授权已失效。':result?.error;
      throw Object.assign(Error(message||'线上导师暂时无法回答。'),{status:response.status===401?502:response.status});
    }
    if(typeof result?.answer!=='string'||typeof result?.conversationId!=='string'){
      throw Object.assign(Error('线上导师没有返回有效回答。'),{status:502});
    }
    return result;
  };
}

const server=http.createServer(async (request, response) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
  catch { response.writeHead(400).end(); return; }
  if(loopback&&pathname==='/api/mentor/chat'){
    const authority=request.headers.host||'';
    const origin=request.headers.origin;
    if(!/^(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(authority)||(origin&&origin!=='http://'+authority)){
      response.writeHead(403,{'Content-Type':'application/json; charset=utf-8'}).end(JSON.stringify({error:'请通过本地游戏页面访问导师。'}));
      return;
    }
  }
  if(await api(request,response,pathname))return;
  if(!['GET','HEAD'].includes(request.method)){response.writeHead(405).end();return;}
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
  fs.readFile(file, (error, data) => {
    if (error) { response.writeHead(404).end('Not found'); return; }
    response.writeHead(200, { 'Content-Type': contentTypes[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(data);
  });
});
server.requestTimeout=15000;server.headersTimeout=10000;
if(require.main===module)server.listen(port,host,()=>process.stdout.write('CircuitMind http://'+host+':'+port+'\n'));
module.exports=server;
