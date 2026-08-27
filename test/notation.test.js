'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {notation}=require('../public/js/notation');
const entry=(fr,to,piece)=>({mv:{fr,to,piece},captured:null});
test('records canonical red and black opening notation',()=>{const history=[entry({r:2,c:7},{r:2,c:4},'C1'),entry({r:9,c:7},{r:7,c:6},'h1')];assert.deepEqual(notation.toRecord(history).map(v=>v.text),['炮二平五','馬8进7']);});
test('recording is pure and handles empty history',()=>{const history=[entry({r:0,c:0},{r:1,c:0},'R0')],snapshot=JSON.stringify(history);assert.equal(notation.toRecord(history)[0].text,'車九进一');assert.equal(JSON.stringify(history),snapshot);assert.deepEqual(notation.toRecord(null),[]);});
