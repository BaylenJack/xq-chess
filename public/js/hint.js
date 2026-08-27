/* 专属提示控制器：8 秒预算、搜索进度、局面变化即时取消。 */
(function(root){
  'use strict';
  let worker=null,active=false,poll=0,seq=0,busy=false,getState=null,getSide=null,onMove=null,onProgress=null,lastKey='',jobKey='';
  function destroyWorker(){if(worker){worker.terminate();worker=null;}busy=false;jobKey='';seq++;}
  function ensureWorker(){
    if(worker)return true;
    try{
      worker=new Worker('/js/ai-worker.js?v=3');
      worker.onmessage=event=>{
        const data=event.data||{};if(data.id!==seq)return;
        if(data.type==='progress'){onProgress?.({...data.progress,state:'searching'});return;}
        busy=false;
        if(data.type==='error'){onProgress?.({state:'error'});onMove?.(null);return;}
        if(active){lastKey=jobKey;onMove?.(data.move||null);onProgress?.({state:'ready',...(data.move?.stats||{})});}
      };
      worker.onerror=()=>{busy=false;onProgress?.({state:'error'});onMove?.(null);};return true;
    }catch(_){return false;}
  }
  function positionKey(state,side){return `${state.history?.length||0}:${state.turn}:${side}:${state.lastMove?.mv?.fr?.r??'-'}:${state.lastMove?.mv?.to?.r??'-'}`;}
  function tick(){
    if(!active)return;const state=getState?.(),side=getSide?.();
    if(!state||state.status!=='playing'||state.turn!==side){onProgress?.({state:'standby'});return;}
    const key=positionKey(state,side);
    if(busy&&key!==jobKey){destroyWorker();onMove?.(null);}
    if(busy||key===lastKey)return;
    if(!ensureWorker()){stop();onProgress?.({state:'error'});return;}
    busy=true;jobKey=key;seq++;onProgress?.({state:'starting',depth:0,elapsedMs:0});worker.postMessage({id:seq,board:state.board,side});
  }
  function start(stateGetter,sideGetter,moveCallback,progressCallback){active=true;getState=stateGetter;getSide=sideGetter;onMove=moveCallback;onProgress=progressCallback;lastKey='';clearInterval(poll);tick();poll=setInterval(tick,180);}
  function stop(){active=false;clearInterval(poll);poll=0;lastKey='';destroyWorker();onMove?.(null);onProgress?.({state:'off'});}
  root.XQ=root.XQ||{};root.XQ.hint={start,stop,get active(){return active;},get busy(){return busy;}};
})(globalThis);
