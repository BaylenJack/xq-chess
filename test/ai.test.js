'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {rules:R}=require('../public/js/rules');
const {ai}=require('../public/js/ai');
const empty=()=>Array.from({length:10},()=>Array(9).fill(null));
const same=(a,b)=>a.fr.r===b.fr.r&&a.fr.c===b.fr.c&&a.to.r===b.to.r&&a.to.c===b.to.c;

test('engine finds an immediate king capture',()=>{const board=empty();board[0][4]='K0';board[9][4]='k0';board[8][4]='R0';const result=ai.bestMove(board,R.RED,{timeMs:240,maxDepth:5});assert.deepEqual(result.fr,{r:8,c:4});assert.deepEqual(result.to,{r:9,c:4});assert.ok(result.score>ai.MATE-1000);});
test('engine always returns a legal move without mutating the board',()=>{const board=R.initialBoard(),snapshot=JSON.stringify(board),legal=R.legalMoves(board,R.RED),result=ai.bestMove(board,R.RED,{timeMs:260,maxDepth:10});assert.ok(legal.some(move=>same(move,result)));assert.equal(JSON.stringify(board),snapshot);assert.ok(result.depth>=1);assert.ok(result.stats.nodes>0);});
test('time-controlled search respects its budget with a small scheduling margin',()=>{const board=R.initialBoard(),start=performance.now(),progress=[];const result=ai.bestMove(board,R.RED,{timeMs:320,maxDepth:12,onProgress:item=>progress.push(item)}),wall=performance.now()-start;assert.ok(wall>=250,`returned too early: ${wall}ms`);assert.ok(wall<650,`budget overrun: ${wall}ms`);assert.ok(progress.length>=1);assert.equal(result.depth,progress.at(-1).depth);});
