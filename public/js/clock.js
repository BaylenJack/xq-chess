/* 服务端权威步时：客户端只负责平滑显示与到期上报。 */
(function (root) {
  'use strict';
  let deadline=0, running=false, reported=false, raf=0, expireHandler=null;
  const display=()=>document.getElementById('clock-main');
  function paint() {
    const el=display(); if(!el) return;
    const seconds=Math.max(0,Math.ceil((deadline-Date.now())/1000));
    el.textContent=String(seconds); el.classList.toggle('danger',running&&seconds<=10);
  }
  function frame() {
    paint();
    if (!running) return;
    if (Date.now()>=deadline) {
      running=false; raf=0;
      if(!reported){reported=true;expireHandler?.();}
      return;
    }
    raf=requestAnimationFrame(frame);
  }
  function sync(nextDeadline,on) {
    deadline=Number(nextDeadline)||0; running=!!on; reported=false;
    if(raf) cancelAnimationFrame(raf); raf=0; paint();
    if(running) raf=requestAnimationFrame(frame);
  }
  function stop(){running=false;if(raf)cancelAnimationFrame(raf);raf=0;paint();}
  root.XQ=root.XQ||{};
  root.XQ.clock={sync,stop,onExpire(fn){expireHandler=fn;},get running(){return running;}};
})(globalThis);
