(function () {
  'use strict';
  const form=document.getElementById('joinForm'), nameInput=document.getElementById('nickname'), roomInput=document.getElementById('roomname');
  const error=document.getElementById('formError'), toast=document.getElementById('toast');
  let toastTimer=0;
  function showToast(message){toast.textContent=message;toast.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove('show'),2600);}
  function showEngineReady(){const node=document.getElementById('engineStatus');if(node){node.classList.add('privileged');node.innerHTML='<i></i>专属推演 · 已就绪';}}
  async function loadEngineStatus(){try{const res=await fetch('/api/hint/status',{cache:'no-store'}),data=await res.json();if(data.authorized)showEngineReady();}catch(_){ }}
  function restore(){
    try{nameInput.value=localStorage.getItem('xq:last-name')||'';roomInput.value=localStorage.getItem('xq:last-room')||'';}catch(_){ }
    const q=new URLSearchParams(location.search); if(q.get('room')) roomInput.value=q.get('room').slice(0,24);
  }
  async function unlockHintFromFragment(){
    const hash=new URLSearchParams(location.hash.replace(/^#/,'')), key=hash.get('hint'); if(!key)return;
    history.replaceState(null,'',location.pathname+location.search);
    try{
      const res=await fetch('/api/hint/unlock',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({key})});
      if(!res.ok)throw new Error(); showEngineReady();showToast('专属推演已解锁 · 进入棋局后自动开启');
    }catch(_){showToast('专属密钥无效');}
  }
  form.addEventListener('submit',event=>{
    event.preventDefault(); const room=roomInput.value.trim(), name=nameInput.value.trim()||'棋友';
    roomInput.closest('.input-group').classList.remove('invalid'); roomInput.removeAttribute('aria-invalid'); error.textContent='';
    if(!room){roomInput.closest('.input-group').classList.add('invalid');roomInput.setAttribute('aria-invalid','true');error.textContent='请先写下房间名';roomInput.focus();return;}
    try{localStorage.setItem('xq:last-name',name);localStorage.setItem('xq:last-room',room);}catch(_){ }
    location.href='/game.html?'+new URLSearchParams({room,name}).toString();
  });
  restore(); loadEngineStatus();unlockHintFromFragment();
})();
