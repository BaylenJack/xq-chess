/* 中文纵线记谱：纯函数，可在浏览器和 Node 中复用。 */
(function (root) {
  'use strict';
  root.XQ = root.XQ || {};
  if (!root.XQ.rules && typeof require === 'function') root.XQ.rules = require('./rules.js').rules;
  const R=root.XQ.rules, HAN='一二三四五六七八九', STRAIGHT=new Set(['R','C','P','K']);
  const column = (side,c) => side===R.RED ? HAN[8-c] : String(c+1);

  function describe(board,mv) {
    const side=R.sideOf(mv.piece), type=R.typeOf(mv.piece), name=R.charOf(mv.piece);
    const peers=[];
    for (let r=0;r<R.ROWS;r++) if (board[r][mv.fr.c] && R.sideOf(board[r][mv.fr.c])===side && R.typeOf(board[r][mv.fr.c])===type) peers.push(r);
    peers.sort((a,b)=>side===R.RED?b-a:a-b);
    let head;
    if (peers.length>1) {
      const labels=peers.length===2?['前','後']:peers.length===3?['前','中','後']:peers.map((_,i)=>HAN[i]);
      head=labels[peers.indexOf(mv.fr.r)]+name;
    } else head=name+column(side,mv.fr.c);
    if (mv.fr.r===mv.to.r) return head+'平'+column(side,mv.to.c);
    const forward=side===R.RED ? mv.to.r>mv.fr.r : mv.to.r<mv.fr.r;
    const target=STRAIGHT.has(type) ? (side===R.RED?HAN[Math.abs(mv.to.r-mv.fr.r)-1]:String(Math.abs(mv.to.r-mv.fr.r))) : column(side,mv.to.c);
    return head+(forward?'进':'退')+target;
  }
  function toRecord(history) {
    const board=R.initialBoard();
    return (history||[]).map((entry,index)=>{
      const item={seq:index+1,red:R.sideOf(entry.mv.piece)===R.RED,text:describe(board,entry.mv)};
      R.applyMove(board,entry.mv); return item;
    });
  }
  const notation={describe,toRecord}; root.XQ.notation=notation;
  if (typeof module!=='undefined'&&module.exports) module.exports={notation};
})(typeof globalThis!=='undefined'?globalThis:this);
