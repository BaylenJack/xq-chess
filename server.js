'use strict';
const http=require('node:http'),path=require('node:path');
const {loadConfig}=require('./src/config');
const {createApp}=require('./src/app');

function createServer(overrides={}){
  const config={...loadConfig(__dirname),...overrides};
  const app=createApp(config),server=http.createServer(app.handler);
  server.on('clientError',(_error,socket)=>{if(socket.writable)socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');});
  server.on('close',app.close);
  return {server,app,config};
}
if(require.main===module){
  const {server,config}=createServer();
  server.listen(config.port,'127.0.0.1',()=>{
    console.log(`青黛棋院已启动 · http://127.0.0.1:${config.port}`);
    console.log(`专属推演 · ${config.hintSecret?'已启用':'未配置'}`);
  });
  const shutdown=()=>server.close(()=>process.exit(0));process.once('SIGTERM',shutdown);process.once('SIGINT',shutdown);
}
module.exports={createServer};
