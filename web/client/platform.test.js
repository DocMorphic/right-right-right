import test from 'node:test';
import assert from 'node:assert/strict';
import {isPhoneOrTablet} from './platform.js';

test('phone and tablet identities are gated, including iPadOS desktop mode',()=>{
  for(const device of [
    {userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'},
    {userAgent:'Mozilla/5.0 (Linux; Android 15; Pixel 9) Mobile'},
    {userAgent:'Mozilla/5.0 (Linux; Android 15; SM-X710)'},
    {userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)',platform:'MacIntel',maxTouchPoints:5},
    {userAgent:'',userAgentData:{mobile:true}},
  ])assert.equal(isPhoneOrTablet(device),true);
});

test('keyboard laptops and desktops stay supported regardless of touch or viewport size',()=>{
  for(const device of [
    {userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',platform:'Win32',maxTouchPoints:10},
    {userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)',platform:'MacIntel',maxTouchPoints:0},
    {userAgent:'Mozilla/5.0 (X11; Linux x86_64)',platform:'Linux x86_64',maxTouchPoints:0},
  ])assert.equal(isPhoneOrTablet({...device,innerWidth:400}),false);
});
