import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {assetUrl} from './asset-url.js';
import {loadNativeDetails} from './native-details.js';

test('game assets follow the HTML directory on root, nested CDN and query-string pages',()=>{
 assert.equal(assetUrl('/assets/car.glb','https://game.example/'),'https://game.example/assets/car.glb');
 assert.equal(assetUrl('/assets/sounds/wind sound car.wav','https://html.example/1234/index.html?room=ABC#play'),'https://html.example/1234/assets/sounds/wind%20sound%20car.wav');
 assert.equal(assetUrl('assets/car.glb','https://html.example/uploads/1234/'),'https://html.example/uploads/1234/assets/car.glb');
 assert.equal(assetUrl('https://other.example/tree.glb','https://html.example/1234/'),'https://other.example/tree.glb');
 assert.equal(assetUrl('data:image/png;base64,YQ==','https://html.example/1234/'),'data:image/png;base64,YQ==');
 assert.equal(assetUrl('blob:https://html.example/abc','https://html.example/1234/'),'blob:https://html.example/abc');
});

test('nested grass JSON, coverage and textures use the page folder without changing manifest lookup keys',async t=>{
 const oldDocument=globalThis.document,oldFetch=globalThis.fetch,calls=[],base='https://html.example/uploads/1234/';
 t.after(()=>{if(oldDocument===undefined)delete globalThis.document;else globalThis.document=oldDocument;globalThis.fetch=oldFetch;});
 globalThis.document={baseURI:base+'index.html'};
 const layer={coverageUrl:'/assets/scenery/coverage.bin',textureUrl:'/assets/scenery/grass.png',textureSha256:'same'};
 globalThis.fetch=async url=>{calls.push(url);return String(url).endsWith('.json')?Response.json({resolution:2,layers:[layer]}):new Response(new Uint8Array(4));};
 const loaded=await loadNativeDetails(1,{async loadAsync(url){calls.push(url);return new THREE.Texture();}});
 assert.deepEqual(calls,[base+'assets/scenery/native-01.details.json',base+'assets/scenery/coverage.bin',base+'assets/scenery/grass.png']);
 assert.equal(loaded.coverages[0].length,4);assert.ok(loaded.textures.has(layer.textureUrl));
 assert.equal(loaded.textures.has(base+'assets/scenery/grass.png'),false,'renderer still looks up the unchanged source URL');
});
