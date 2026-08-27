'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createHintAuth}=require('../src/security');
const request=cookie=>({headers:{cookie},socket:{encrypted:false}});
test('hint cookie is signed and cannot be forged with a boolean flag',()=>{const auth=createHintAuth('correct-horse-battery-staple');assert.equal(auth.verifyKey('wrong'),false);assert.equal(auth.verifyKey('correct-horse-battery-staple'),true);assert.equal(auth.verifyCookie(request('xq_hint=1')),false);const header=auth.cookie(request(''));const pair=header.split(';')[0];assert.equal(auth.verifyCookie(request(pair)),true);});
test('secure cookie is used behind HTTPS proxy',()=>{const auth=createHintAuth('secret');const req={headers:{'x-forwarded-proto':'https'},socket:{encrypted:false}};assert.match(auth.cookie(req),/; Secure$/);});
