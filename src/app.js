'use strict';
const fs=require('node:fs'),path=require('node:path');
const {MIME,json,text,body,safePublicPath,securityHeaders}=require('./http');
const {createHintAuth}=require('./security');
const {RoomService,RoomError}=require('./rooms');

function createApp(config){
  const rooms=new RoomService(config),hint=createHintAuth(config.hintSecret),protectedAssets=new Set(['js/hint.js','js/ai.js','js/ai-worker.js']);
  const baseHeaders=securityHeaders();
  async function handler(req,res){
    Object.entries(baseHeaders).forEach(([key,value])=>res.setHeader(key,value));
    try{await route(req,res);}catch(error){if(error instanceof RoomError)return json(res,error.status,{error:error.message});const status=error.status||500;if(status===500)console.error('[request-error]',req.method,req.url,error.stack||error.message);if(!res.headersSent)json(res,status,{error:status===500?'服务器内部错误':error.message});else res.end();}
  }
  async function route(req,res){
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/api/health'&&req.method==='GET')return json(res,200,{ok:true,version:'2.1.0',...rooms.stats()});
    if(url.pathname==='/api/hint/status'&&req.method==='GET')return json(res,200,{enabled:hint.enabled,authorized:hint.verifyCookie(req)});
    if(url.pathname==='/api/hint/unlock'&&req.method==='POST'){
      const data=await body(req);if(!hint.verifyKey(data.key))return json(res,403,{error:'专属密钥无效'});
      return json(res,200,{ok:true},{'set-cookie':hint.cookie(req)});
    }
    if(url.pathname==='/api/hint/lock'&&req.method==='POST')return json(res,200,{ok:true},{'set-cookie':hint.clearCookie(req)});
    if(url.pathname.startsWith('/api/'))return api(req,res,url);

    // 兼容旧专属链接：验证后立即清理地址栏中的密钥，不写入应用日志。
    if(req.method==='GET'&&url.searchParams.has('hint')){
      if(!hint.verifyKey(url.searchParams.get('hint')))return text(res,403,'专属密钥无效');
      url.searchParams.delete('hint');const target=url.pathname+(url.searchParams.size?'?'+url.searchParams.toString():'');
      res.writeHead(302,{location:target,'set-cookie':hint.cookie(req),'cache-control':'no-store',...baseHeaders});return res.end();
    }
    if(req.method!=='GET'&&req.method!=='HEAD')return text(res,405,'Method Not Allowed',{'allow':'GET, HEAD'});
    const resolved=safePublicPath(config.publicDir,url.pathname);if(!resolved)return text(res,403,'Forbidden');
    if(protectedAssets.has(resolved.relative)&&!hint.verifyCookie(req))return text(res,404,'Not Found');
    let data;try{data=await fs.promises.readFile(resolved.full);}catch(_){return text(res,404,'Not Found');}
    if(resolved.relative==='game.html'&&hint.verifyCookie(req))data=Buffer.from(data.toString('utf8').replace('</body>','<script src="/js/hint.js?v=3"></script></body>'));
    const ext=path.extname(resolved.full).toLowerCase();res.writeHead(200,{'content-type':MIME[ext]||'application/octet-stream','cache-control':ext==='.html'?'no-store':'no-cache',...baseHeaders});if(req.method==='HEAD')return res.end();res.end(data);
  }
  async function api(req,res,url){
    const data=req.method==='POST'?await body(req):{};
    if(req.method!=='POST'&&url.pathname!=='/api/stream')return text(res,405,'Method Not Allowed',{'allow':'POST'});
    if(url.pathname==='/api/join')return json(res,200,rooms.join(data));
    if(url.pathname==='/api/stream'&&req.method==='GET'){
      const room=url.searchParams.get('room'),sid=url.searchParams.get('sid');rooms.requirePlayer(room,sid);
      res.writeHead(200,{'content-type':'text/event-stream; charset=utf-8','cache-control':'no-store, no-transform','connection':'keep-alive','x-accel-buffering':'no',...baseHeaders});res.write('retry: 2000\n\n');const detach=rooms.attachStream(room,sid,res);req.once('close',detach);return;
    }
    const methods={
      '/api/move':()=>rooms.move(data),
      '/api/clock/toggle':()=>rooms.toggleClock(data),
      '/api/timeout':()=>rooms.timeout(data),
      '/api/undo/request':()=>rooms.undoRequest(data),
      '/api/undo/accept':()=>rooms.undoAccept(data),
      '/api/undo/reject':()=>rooms.undoReject(data),
      '/api/restart':()=>rooms.restart(data),
    };
    if(!methods[url.pathname])return json(res,404,{error:'未知接口'});
    return json(res,200,methods[url.pathname]());
  }
  return {handler,rooms,hint,close:()=>rooms.close()};
}
module.exports={createApp};
