'use strict';
const crypto=require('node:crypto');
const COOKIE='xq_hint';
const COOKIE_VALUE='authorized-v2';

function constantEqual(a,b){
  const left=crypto.createHash('sha256').update(String(a||'')).digest();
  const right=crypto.createHash('sha256').update(String(b||'')).digest();
  return crypto.timingSafeEqual(left,right);
}
function parseCookies(header){return Object.fromEntries(String(header||'').split(';').map(v=>v.trim()).filter(Boolean).map(v=>{const i=v.indexOf('=');return i<0?[v,'']:[v.slice(0,i),decodeURIComponent(v.slice(i+1))];}));}
function createHintAuth(secret){
  const enabled=Boolean(secret);
  const token=enabled?crypto.createHmac('sha256',secret).update(COOKIE_VALUE).digest('base64url'):'';
  const verifyKey=key=>enabled&&constantEqual(key,secret);
  const verifyCookie=req=>enabled&&constantEqual(parseCookies(req.headers.cookie)[COOKIE],token);
  const isAuthorized=(req,url)=>verifyCookie(req)||verifyKey(url?.searchParams?.get('hint'));
  function cookie(req,maxAge=30*24*60*60){
    const forwarded=String(req.headers['x-forwarded-proto']||'').split(',')[0].trim();
    const secure=req.socket.encrypted||forwarded==='https';
    return `${COOKIE}=${maxAge?encodeURIComponent(token):''}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Strict${secure?'; Secure':''}`;
  }
  return {enabled,verifyKey,verifyCookie,isAuthorized,cookie,clearCookie:req=>cookie(req,0)};
}
module.exports={createHintAuth,constantEqual};
