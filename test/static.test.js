'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
test('game markup keeps every DOM contract used by game-page',()=>{const html=read('public/game.html');for(const id of ['board','roomBadge','roomName','waitOverlay','waitCopyBtn','status','clock-main','timerBtn','thinkBtn','undoBtn','restartBtn','recordPanel','recordBody','confirmModal','resultModal','toast'])assert.match(html,new RegExp(`id="${id}"`),id);});
test('pages have no inline executable scripts and CSS braces are balanced',()=>{for(const file of ['public/index.html','public/game.html'])assert.doesNotMatch(read(file),/<script(?![^>]*\bsrc=)[^>]*>/i);const css=read('public/css/app.css');assert.equal((css.match(/{/g)||[]).length,(css.match(/}/g)||[]).length);});
