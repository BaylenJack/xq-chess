'use strict';
const crypto=require('node:crypto');
const {rules:R}=require('../public/js/rules.js');

class RoomError extends Error{constructor(message,status=400){super(message);this.status=status;}}
class RoomService{
  constructor(options={}){this.clockSeconds=options.clockSeconds||60;this.seatHoldMs=options.seatHoldMs||60000;this.roomIdleMs=options.roomIdleMs||1800000;this.rooms=new Map();this.sweepTimer=setInterval(()=>this.sweep(),60000);this.sweepTimer.unref?.();}
  clean(value,max,fallback=''){return String(value??fallback).replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,max);}
  create(name){const room={name,players:new Map(),board:R.initialBoard(),turn:R.RED,status:'playing',check:false,history:[],lastMove:null,reason:null,started:false,pendingUndo:null,pendingTimer:null,clock:{enabled:false,on:false,deadline:0},clockTimer:null,lastActivity:Date.now()};this.rooms.set(name,room);return room;}
  get(name){return this.rooms.get(this.clean(name,24));}
  requirePlayer(name,sid){const room=this.get(name),player=room?.players.get(String(sid||''));if(!room||!player)throw new RoomError('未加入房间或席位已失效',403);room.lastActivity=Date.now();return {room,player};}
  players(room){return [...room.players.values()].sort((a,b)=>b.side-a.side).map(p=>({name:p.name,side:p.side,online:p.online}));}
  onlineCount(room){return [...room.players.values()].filter(p=>p.online).length;}
  join(input){
    const name=this.clean(input.name,12,'棋友')||'棋友',roomName=this.clean(input.room,24);if(!roomName)throw new RoomError('请填写房间名');
    const room=this.get(roomName)||this.create(roomName),requested=String(input.sid||'');
    if(requested&&room.players.has(requested)){const player=room.players.get(requested);player.name=name;clearTimeout(player.leaveTimer);player.leaveTimer=null;room.lastActivity=Date.now();return {sid:player.sid,side:player.side,room:room.name,players:this.players(room),restored:true};}
    if(room.players.size>=2)throw new RoomError('房间已满',409);
    const occupied=new Set([...room.players.values()].map(p=>p.side)),side=occupied.has(R.RED)?R.BLACK:R.RED,sid=crypto.randomBytes(16).toString('base64url');
    room.players.set(sid,{sid,name,side,online:false,stream:null,heartbeat:null,leaveTimer:null});room.lastActivity=Date.now();
    return {sid,side,room:room.name,players:this.players(room),restored:false};
  }
  view(room,sid,extra={}){const player=room.players.get(sid);return {room:room.name,board:room.board,turn:room.turn,status:room.status,check:room.check,history:room.history,lastMove:room.lastMove,players:this.players(room),you:{side:player?.side||0},clock:{...room.clock},reason:room.reason,...extra};}
  write(player,event,data){if(!player.online||!player.stream||player.stream.writableEnded)return;try{player.stream.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);}catch(_){this.disconnectPlayer(player);}}
  broadcast(room,event,data){for(const player of room.players.values())this.write(player,event,typeof data==='function'?data(player):data);}
  broadcastState(room,extra={}){for(const player of room.players.values())this.write(player,'state',this.view(room,player.sid,extra));}
  attachStream(name,sid,res){
    const {room,player}=this.requirePlayer(name,sid),wasAllOnline=this.onlineCount(room)===room.players.size&&room.players.size===2;
    if(player.stream&&player.stream!==res){try{player.stream.end();}catch(_){}}
    clearInterval(player.heartbeat);clearTimeout(player.leaveTimer);player.stream=res;player.online=true;player.leaveTimer=null;
    player.heartbeat=setInterval(()=>{try{res.write(': heartbeat\n\n');}catch(_){clearInterval(player.heartbeat);}},20000);player.heartbeat.unref?.();
    this.write(player,'state',this.view(room,sid));this.broadcast(room,'players',()=>({players:this.players(room)}));
    const allOnline=this.onlineCount(room)===2;
    if(allOnline&&!wasAllOnline){if(!room.started){room.started=true;this.resetClock(room);this.broadcast(room,'start',{resumed:false});}else{this.resetClock(room);this.broadcast(room,'start',{resumed:true});}this.broadcastState(room);}
    return ()=>this.detachStream(room,player,res);
  }
  detachStream(room,player,res){if(player.stream!==res)return;clearInterval(player.heartbeat);player.heartbeat=null;player.stream=null;player.online=false;this.pauseClock(room);this.cancelUndo(room,true);this.broadcast(room,'peer_left',{message:'对手暂时离席'});this.broadcastState(room);clearTimeout(player.leaveTimer);player.leaveTimer=setTimeout(()=>{if(player.online)return;room.players.delete(player.sid);this.broadcastState(room);room.lastActivity=Date.now();},this.seatHoldMs);player.leaveTimer.unref?.();}
  disconnectPlayer(player){try{player.stream?.end();}catch(_){}}
  requirePlayable(room){if(this.onlineCount(room)<2)throw new RoomError('请等待对手上线',409);if(room.status!=='playing')throw new RoomError('本局已经结束');}
  move(input){const {room,player}=this.requirePlayer(input.room,input.sid);this.requirePlayable(room);if(room.turn!==player.side)throw new RoomError('还没轮到你');const fr=input.mv?.fr,to=input.mv?.to;if(![fr?.r,fr?.c,to?.r,to?.c].every(Number.isInteger))throw new RoomError('走法参数错误');if(!R.inBoard(fr.r,fr.c)||!R.inBoard(to.r,to.c))throw new RoomError('坐标越界');const found=R.legalMovesFrom(room.board,fr).find(m=>m.to.r===to.r&&m.to.c===to.c);if(!found||R.sideOf(found.piece)!==player.side)throw new RoomError('这一步不合规则');const captured=R.applyMove(room.board,found);room.history.push({mv:found,captured});room.lastMove={mv:found,captured};room.turn=-player.side;const checked=R.inCheck(room.board,room.turn);room.status=R.resultFor(room.board,room.turn);room.check=room.status==='playing'&&checked;room.reason=room.status==='playing'?null:(checked?'checkmate':'stalemate');if(room.status==='playing')this.resetClock(room);else this.pauseClock(room);room.lastActivity=Date.now();this.broadcastState(room);return {ok:true};}
  resetClock(room){this.pauseClock(room);if(!room.clock.enabled||room.status!=='playing'||this.onlineCount(room)<2)return;room.clock.on=true;room.clock.deadline=Date.now()+this.clockSeconds*1000;room.clockTimer=setTimeout(()=>this.expire(room),this.clockSeconds*1000+100);room.clockTimer.unref?.();}
  pauseClock(room){clearTimeout(room.clockTimer);room.clockTimer=null;room.clock.on=false;room.clock.deadline=0;}
  expire(room){if(!room.clock.enabled||!room.clock.on||Date.now()<room.clock.deadline||room.status!=='playing')return;const winner=-room.turn;room.status=winner===R.RED?'red_win':'black_win';room.reason='timeout';this.pauseClock(room);this.broadcastState(room,{reason:'timeout'});}
  toggleClock(input){const {room}=this.requirePlayer(input.room,input.sid);room.clock.enabled=!room.clock.enabled;if(room.clock.enabled)this.resetClock(room);else this.pauseClock(room);this.broadcastState(room);return {enabled:room.clock.enabled};}
  timeout(input){const {room,player}=this.requirePlayer(input.room,input.sid);if(room.turn!==player.side)throw new RoomError('还没轮到你');if(!room.clock.enabled||!room.clock.on||Date.now()<room.clock.deadline)throw new RoomError('步时尚未结束');this.expire(room);return {ok:true};}
  undoRequest(input){const {room,player}=this.requirePlayer(input.room,input.sid);if(!room.history.length)throw new RoomError('还没有可以撤回的着法');if(room.pendingUndo)throw new RoomError('已有悔棋请求在等待回应',409);if(this.onlineCount(room)<2){this.executeUndo(room,player.side);this.broadcastState(room);return {ok:true,automatic:true};}room.pendingUndo={sid:player.sid,side:player.side};room.pendingTimer=setTimeout(()=>{this.cancelUndo(room,true);},30000);room.pendingTimer.unref?.();this.broadcast(room,'undo_request',p=>({self:p.sid===player.sid,ts:Date.now()}));return {ok:true,pending:true};}
  undoAccept(input){const {room,player}=this.requirePlayer(input.room,input.sid);if(!room.pendingUndo)throw new RoomError('悔棋请求已经失效');if(room.pendingUndo.sid===player.sid)throw new RoomError('请等待对方回应');const side=room.pendingUndo.side;this.clearPending(room);this.executeUndo(room,side);this.broadcastState(room);return {ok:true};}
  undoReject(input){const {room,player}=this.requirePlayer(input.room,input.sid);if(!room.pendingUndo)throw new RoomError('悔棋请求已经失效');if(room.pendingUndo.sid===player.sid)throw new RoomError('请等待对方回应');this.cancelUndo(room,false);return {ok:true};}
  clearPending(room){clearTimeout(room.pendingTimer);room.pendingTimer=null;room.pendingUndo=null;}
  cancelUndo(room,timeout){if(!room.pendingUndo)return;this.clearPending(room);this.broadcast(room,'undo_rejected',{timeout:!!timeout});}
  executeUndo(room,side){let index=room.history.length-1;if(index>=0&&R.sideOf(room.history[index].mv.piece)!==side){const rec=room.history.pop();R.undoMove(room.board,rec.mv,rec.captured);index--;}if(index>=0&&R.sideOf(room.history[index].mv.piece)===side){const rec=room.history.pop();R.undoMove(room.board,rec.mv,rec.captured);}room.turn=side;room.status='playing';room.check=R.inCheck(room.board,side);room.lastMove=room.history.at(-1)||null;room.reason=null;this.resetClock(room);}
  restart(input){const {room}=this.requirePlayer(input.room,input.sid);this.clearPending(room);for(const player of room.players.values())player.side=-player.side;room.board=R.initialBoard();room.turn=R.RED;room.status='playing';room.check=false;room.history=[];room.lastMove=null;room.reason=null;room.started=this.onlineCount(room)===2;this.resetClock(room);this.broadcast(room,'start',{resumed:false,restarted:true});this.broadcastState(room);return {ok:true};}
  sweep(){const now=Date.now();for(const [name,room] of this.rooms){if(room.players.size===0||now-room.lastActivity>this.roomIdleMs){this.destroyRoom(room);this.rooms.delete(name);}}}
  destroyRoom(room){clearTimeout(room.clockTimer);clearTimeout(room.pendingTimer);for(const player of room.players.values()){clearTimeout(player.leaveTimer);clearInterval(player.heartbeat);try{player.stream?.end();}catch(_){}}}
  close(){clearInterval(this.sweepTimer);for(const room of this.rooms.values())this.destroyRoom(room);this.rooms.clear();}
  stats(){return {rooms:this.rooms.size,players:[...this.rooms.values()].reduce((n,r)=>n+r.players.size,0)};}
}
module.exports={RoomService,RoomError};
