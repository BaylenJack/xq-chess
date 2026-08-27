(function(root){
  'use strict';
  const R=root.XQ.rules,N=root.XQ.notation,$=id=>document.getElementById(id);
  let state={board:R.initialBoard(),turn:R.RED,status:'playing',check:false,history:[],lastMove:null,players:[],clock:{on:false,deadline:0}};
  let sid='',room='',playerSide=null,flipped=false,stream=null,cells=[],selected=null,legal=[],illegal=[],hintMove=null,pendingMove=false;
  let audio=null,toastTimer=0,confirmState=null,resultShown=false;

  function element(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
  const viewRow=r=>flipped?9-r:r, logicRow=r=>flipped?9-r:r;
  function ensureAudio(){try{audio=audio||new(root.AudioContext||root.webkitAudioContext)();if(audio.state==='suspended')audio.resume();}catch(_){audio=null;}}
  function tone(freq,duration=.07,type='sine',volume=.055){if(!audio)return;const osc=audio.createOscillator(),gain=audio.createGain();osc.type=type;osc.frequency.value=freq;gain.gain.setValueAtTime(volume,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);osc.connect(gain).connect(audio.destination);osc.start();osc.stop(audio.currentTime+duration);}
  function sound(kind){if(kind==='select')tone(510);else if(kind==='move')tone(320,.08,'triangle');else if(kind==='capture'){tone(250,.1,'triangle');setTimeout(()=>tone(180,.1,'triangle'),65);}else if(kind==='check'){tone(680,.09,'square',.035);setTimeout(()=>tone(680,.08,'square',.035),105);}else if(kind==='join'){tone(440);setTimeout(()=>tone(660,.1),90);}else if(kind==='win')[523,659,784].forEach((f,i)=>setTimeout(()=>tone(f,.16),i*120));else if(kind==='lose')[392,320,240].forEach((f,i)=>setTimeout(()=>tone(f,.16),i*130));}

  function buildBoard(){
    const board=$('board');board.replaceChildren();board.append(element('div','board-surface'),element('div','grid-lines'));
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('class','palace-lines');svg.setAttribute('viewBox','0 0 8 9');svg.setAttribute('preserveAspectRatio','none');
    for(const coords of [[3,0,5,2],[5,0,3,2],[3,7,5,9],[5,7,3,9]]){const line=document.createElementNS('http://www.w3.org/2000/svg','line');['x1','y1','x2','y2'].forEach((key,i)=>line.setAttribute(key,coords[i]));svg.append(line);}board.append(svg);
    const river=element('div','river-band');river.innerHTML='<span>楚河&nbsp;&nbsp;汉界</span>';board.append(river);
    cells=[];
    for(let vr=0;vr<10;vr++){cells[vr]=[];for(let c=0;c<9;c++){
      const cell=element('button','cell');cell.type='button';cell.dataset.r=vr;cell.dataset.c=c;cell.addEventListener('click',()=>onCell(logicRow(vr),c));board.append(cell);cells[vr][c]={el:cell,piece:null,dot:null,x:null};
    }}
    const resize=()=>{const width=board.getBoundingClientRect().width,cell=Math.max(30,Math.floor(width/9));board.style.setProperty('--cell',cell+'px');board.style.width=cell*9+'px';};
    resize();new ResizeObserver(resize).observe(board);requestAnimationFrame(resize);
  }

  function renderPiece(vr,c,piece){const slot=cells[vr][c];slot.el.replaceChildren();slot.piece=null;slot.dot=null;slot.x=null;if(!piece)return;const disk=element('span','piece '+(R.sideOf(piece)===R.RED?'red':'black'));disk.append(element('span','glyph',R.charOf(piece)));slot.el.append(disk);slot.piece=disk;}
  function render(){
    for(let r=0;r<10;r++){const vr=viewRow(r);for(let c=0;c<9;c++){const piece=state.board[r][c],slot=cells[vr][c];if(slot.el.dataset.piece!==String(piece||'')){slot.el.dataset.piece=piece||'';renderPiece(vr,c,piece);}}}
    for(let vr=0;vr<10;vr++){const r=logicRow(vr);for(let c=0;c<9;c++){
      const slot=cells[vr][c],piece=state.board[r][c],classes=['cell'];
      const isLegal=legal.some(m=>m.to.r===r&&m.to.c===c),isIllegal=illegal.some(m=>m.to.r===r&&m.to.c===c);
      if(selected?.r===r&&selected?.c===c)classes.push('sel');if(isLegal)classes.push('legal');if(isIllegal)classes.push('illegal');
      if(state.lastMove?.mv){const mv=state.lastMove.mv;if(mv.fr.r===r&&mv.fr.c===c)classes.push('last-from');if(mv.to.r===r&&mv.to.c===c)classes.push('last-to');}
      if(state.check&&R.typeOf(piece)==='K'&&R.sideOf(piece)===state.turn)classes.push('check');
      if(hintMove?.fr.r===r&&hintMove?.fr.c===c)classes.push('hint-from');if(hintMove?.to.r===r&&hintMove?.to.c===c)classes.push('hint-to');
      slot.el.className=classes.join(' ');slot.el.disabled=pendingMove||state.status!=='playing'||state.turn!==playerSide;
      slot.el.setAttribute('aria-label',piece?`${R.sideOf(piece)===R.RED?'红':'黑'}方${R.charOf(piece)}，第${r+1}行第${c+1}列`:`空位，第${r+1}行第${c+1}列`);
      if(isLegal&&!slot.dot){slot.dot=element('span','legal-dot');slot.el.append(slot.dot);}else if(!isLegal&&slot.dot){slot.dot.remove();slot.dot=null;}
      if(isIllegal&&!slot.x){slot.x=element('span','illegal-x','×');slot.el.append(slot.x);}else if(!isIllegal&&slot.x){slot.x.remove();slot.x=null;}
    }}
    updateChrome();
  }

  function updateChrome(){
    for(const side of [R.RED,R.BLACK]){const card=document.querySelector(`.player-card[data-side="${side}"]`),p=state.players.find(x=>x.side===side);card?.classList.toggle('active',state.status==='playing'&&state.turn===side);const name=card?.querySelector('.name');if(name)name.textContent=p?.name||'等待入席';const dot=card?.querySelector('.online-dot');dot?.classList.toggle('offline',!p?.online);}
    const mine=state.turn===playerSide;let text=state.status==='red_win'?'红方胜':state.status==='black_win'?'黑方胜':state.players.filter(p=>p.online).length<2?'等待对手':state.check?(mine?'将军 · 轮到你':'将军 · 对方行棋'):(mine?'轮到你':'静候对方');
    $('status').textContent=text;$('status').dataset.state=state.status;$('undoBtn').disabled=!state.history.length||pendingMove;
    const wait=state.players.filter(p=>p.online).length<2;$('waitOverlay').classList.toggle('hidden',!wait);$('waitRoom').textContent=wait?`房间「${room}」仍空一席`:'';
    if(state.clock)root.XQ.clock.sync(state.clock.deadline,state.clock.on);$('timerDisplay').classList.toggle('hidden',!state.clock?.enabled);$('timerBtn').classList.toggle('active',!!state.clock?.enabled);$('timerBtn').setAttribute('aria-pressed',String(!!state.clock?.enabled));
    updateRecord();
  }

  function updateRecord(){const records=N.toRecord(state.history),body=$('recordBody'),last=records.at(-1);$('recordLast').textContent=last?`${Math.ceil(last.seq/2)}. ${last.text}`:'暂无着法';body.replaceChildren();if(!records.length){body.append(element('p','record-empty','落下第一子后，棋谱会记录在这里。'));return;}for(let i=0;i<records.length;i+=2){const row=element('div','record-row'),a=records[i],b=records[i+1];row.append(element('span','rec-seq',String(i/2+1)),element('span','rec-red',a.text),element('span','rec-black',b?.text||''));body.append(row);}body.scrollTop=body.scrollHeight;}
  function onCell(r,c){ensureAudio();if(pendingMove||state.status!=='playing'||state.turn!==playerSide)return;const piece=state.board[r][c];if(selected){const mv=legal.find(item=>item.to.r===r&&item.to.c===c);if(mv){sendMove(mv);return;}if(illegal.some(item=>item.to.r===r&&item.to.c===c)){showToast('这步会送将，不能走');return;}if(R.sideOf(piece)===playerSide){select(r,c);return;}clearSelection();render();return;}if(R.sideOf(piece)===playerSide)select(r,c);}
  function select(r,c){selected={r,c};legal=R.legalMovesFrom(state.board,{r,c});illegal=R.illegalMovesFrom(state.board,{r,c});sound('select');render();}
  function clearSelection(){selected=null;legal=[];illegal=[];hintMove=null;}

  async function request(path,body){const response=await fetch('/api/'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body||{})});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'请求失败');return data;}
  async function sendMove(mv){pendingMove=true;clearSelection();render();try{await request('move',{room,sid,mv:{fr:mv.fr,to:mv.to}});}catch(error){showToast(error.message);}finally{pendingMove=false;render();}}
  function inviteUrl(){return `${location.origin}/?room=${encodeURIComponent(room)}`;}
  async function copyInvite(){try{await navigator.clipboard.writeText(inviteUrl());showToast('邀请链接已复制');}catch(_){showToast('复制失败，请复制当前网址');}}
  function showToast(message){const node=$('toast');node.textContent=message;node.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.classList.remove('show'),2800);}

  function applyState(next){
    const previousLength=state.history.length,last=next.history?.at(-1);state=next;if(next.you?.side&&next.you.side!==playerSide){playerSide=next.you.side;flipped=playerSide===R.RED;for(const row of cells)for(const slot of row){slot.el.dataset.piece='__refresh__';}}
    clearSelection();render();
    if(next.history.length>previousLength&&last){sound(last.captured?'capture':'move');animateMove(last.mv);if(next.check)sound('check');}
    if(next.status!=='playing'&&!resultShown){resultShown=true;showResult(next);}else if(next.status==='playing')resultShown=false;
  }
  function animateMove(mv){const from=cells[viewRow(mv.fr.r)]?.[mv.fr.c],to=cells[viewRow(mv.to.r)]?.[mv.to.c];if(from){const dot=element('span','move-trail-dot');from.el.append(dot);setTimeout(()=>dot.remove(),700);}if(to){for(const cls of ['move-land-ring','move-ripple']){const ring=element('span',cls);to.el.append(ring);setTimeout(()=>ring.remove(),900);}to.el.querySelector('.piece')?.classList.add('landed');}}
  function connect(){stream?.close();stream=new EventSource(`/api/stream?room=${encodeURIComponent(room)}&sid=${encodeURIComponent(sid)}`);stream.addEventListener('state',event=>applyState(JSON.parse(event.data)));stream.addEventListener('start',()=>{showToast('双方入席，开局');sound('join');});stream.addEventListener('peer_left',()=>showToast('对手暂时离席，正在保留座位'));stream.addEventListener('undo_request',async event=>{const data=JSON.parse(event.data);if(data.self)return;const answer=await confirmDialog({kind:'undo-ask',title:'对方请求悔棋',sub:'同意后将退回对方上一手之前。',ok:'同意',cancel:'拒绝',seconds:30});if(answer===null)return;request(answer?'undo/accept':'undo/reject',{room,sid}).catch(e=>showToast(e.message));});stream.addEventListener('undo_rejected',event=>{closeConfirm('undo-wait');const data=JSON.parse(event.data);showToast(data.timeout?'悔棋请求已超时':'对方没有同意悔棋');});stream.onerror=()=>{$('status').textContent='连接中断 · 正在重连';};}

  async function join(){const query=new URLSearchParams(location.search);room=(query.get('room')||'').trim();const name=(query.get('name')||'棋友').trim();if(!room){location.replace('/');return;}$('roomName').textContent=room;$('waitRoom').textContent=`房间「${room}」仍空一席`;let saved='';try{saved=localStorage.getItem('xq:sid:'+room)||'';}catch(_){ }
    try{const data=await request('join',{room,name,sid:saved});sid=data.sid;playerSide=data.side;flipped=playerSide===R.RED;try{localStorage.setItem('xq:sid:'+room,sid);}catch(_){ }connect();}catch(error){showToast(error.message);setTimeout(()=>location.replace('/'),1800);}}

  function confirmDialog(options){if(confirmState)resolveConfirm(null);return new Promise(resolve=>{confirmState={resolve,kind:options.kind,timer:0};$('confirmTitle').textContent=options.title;$('confirmSub').textContent=options.sub||'';$('confirmOk').textContent=options.ok||'确定';$('confirmCancel').textContent=options.cancel||'取消';$('confirmActions').classList.toggle('hidden',!!options.hideActions);$('confirmRing').classList.toggle('hidden',!options.seconds);$('confirmModal').hidden=false;if(options.seconds){const end=Date.now()+options.seconds*1000,circ=113.1;const tick=()=>{const left=Math.max(0,end-Date.now());$('ringNum').textContent=String(Math.ceil(left/1000));$('ringFg').style.strokeDashoffset=String(circ*(1-left/(options.seconds*1000)));if(left<=0)resolveConfirm(null);};tick();if(confirmState)confirmState.timer=setInterval(tick,250);}});}
  function resolveConfirm(value){if(!confirmState)return;clearInterval(confirmState.timer);const resolve=confirmState.resolve;confirmState=null;$('confirmModal').hidden=true;resolve(value);}
  function closeConfirm(kind){if(confirmState?.kind===kind)resolveConfirm(null);}
  function showResult(next){const won=(next.status==='red_win'?R.RED:R.BLACK)===playerSide;$('resultReason').textContent=next.reason==='timeout'?(won?'对方超时':'超时判负'):next.reason==='checkmate'?'将死':next.reason==='stalemate'?'困毙':'本局终了';$('resultTitle').textContent=won?'胜局':'惜败';$('resultSub').textContent=won?'这一局，落子有声。':'复盘片刻，再来一局。';$('resultModal').hidden=false;sound(won?'win':'lose');}

  function bind(){
    $('roomBadge').addEventListener('click',copyInvite);$('waitCopyBtn').addEventListener('click',copyInvite);
    $('recordPanel').classList.add('open');$('recordHead').addEventListener('click',()=>{const open=$('recordPanel').classList.toggle('open');$('recordHead').setAttribute('aria-expanded',String(open));});
    $('timerBtn').addEventListener('click',()=>{ensureAudio();request('clock/toggle',{room,sid}).catch(e=>showToast(e.message));});
    $('undoBtn').addEventListener('click',async()=>{ensureAudio();try{const data=await request('undo/request',{room,sid});if(data.pending)confirmDialog({kind:'undo-wait',title:'已请求悔棋',sub:'等待对方回应…',hideActions:true,seconds:30});else showToast('已悔棋');}catch(error){showToast(error.message);}});
    $('restartBtn').addEventListener('click',async()=>{const yes=await confirmDialog({kind:'restart',title:'重新开局',sub:'双方将互换棋色，红方先行。',ok:'重新开局'});if(yes)request('restart',{room,sid}).catch(e=>showToast(e.message));});
    $('confirmOk').addEventListener('click',()=>resolveConfirm(true));$('confirmCancel').addEventListener('click',()=>resolveConfirm(false));
    $('resultHome').addEventListener('click',()=>location.href='/');$('resultRestart').addEventListener('click',()=>{ $('resultModal').hidden=true;request('restart',{room,sid}).catch(e=>showToast(e.message));});
    root.XQ.clock.onExpire(()=>request('timeout',{room,sid}).catch(()=>{}));
    if(root.XQ.hint){
      const button=$('thinkBtn'),label=button.querySelector('.think-label');button.classList.remove('hidden');
      const progress=info=>{
        if(info.state==='searching')label.textContent=`AI · ${Math.min(7.8,(info.elapsedMs||0)/1000).toFixed(1)}s · 深${info.depth}`;
        else if(info.state==='starting')label.textContent='AI · 起算';
        else if(info.state==='ready')label.textContent=`AI 建议 · 深${info.depth||0}`;
        else if(info.state==='standby')label.textContent='AI 提示 · 待机';
        else if(info.state==='error')label.textContent='AI 暂不可用';
        else label.textContent='AI 提示';
      };
      const enable=()=>{root.XQ.hint.start(()=>state,()=>playerSide,mv=>{hintMove=mv;render();},progress);button.classList.add('thinking');button.setAttribute('aria-pressed','true');};
      const disable=()=>{root.XQ.hint.stop();button.classList.remove('thinking');button.setAttribute('aria-pressed','false');label.textContent='AI 提示';};
      button.addEventListener('click',()=>{ensureAudio();if(root.XQ.hint.active)disable();else enable();});
      enable();
    }
  }
  function init(){buildBoard();bind();render();join();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(globalThis);
