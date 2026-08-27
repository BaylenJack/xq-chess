'use strict';
importScripts('/js/rules.js?v=3','/js/ai.js?v=3');
self.onmessage=event=>{
  const {id,board,side}=event.data||{};
  try{
    const move=self.XQ.ai.bestMove(board,side,{maxDepth:12,timeMs:7800,onProgress:progress=>self.postMessage({id,type:'progress',progress})});
    self.postMessage({id,type:'result',move});
  }catch(error){self.postMessage({id,type:'error',error:error?.message||String(error)});}
};
