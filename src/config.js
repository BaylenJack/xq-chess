'use strict';
const fs=require('node:fs'),path=require('node:path');

function readSecret(root){
  if(process.env.HINT_KEY?.trim())return process.env.HINT_KEY.trim();
  try{return fs.readFileSync(path.join(root,'secret.txt'),'utf8').split(/\r?\n/).map(v=>v.trim()).find(v=>v&&!v.startsWith('#'))||'';}catch(_){return '';}
}
function number(name,fallback,min,max){const value=Number(process.env[name]);return Number.isFinite(value)?Math.min(max,Math.max(min,value)):fallback;}
function loadConfig(root){return Object.freeze({
  root,
  publicDir:path.join(root,'public'),
  port:number('PORT',8280,1,65535),
  clockSeconds:number('CLOCK_SECONDS',60,5,3600),
  seatHoldMs:number('SEAT_HOLD_MS',60000,5000,10*60*1000),
  roomIdleMs:number('ROOM_IDLE_MS',30*60*1000,60000,24*60*60*1000),
  hintSecret:readSecret(root),
});}
module.exports={loadConfig};
