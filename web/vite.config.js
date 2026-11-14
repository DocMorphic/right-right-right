import { defineConfig } from 'vite';
export default defineConfig({server:{host:'0.0.0.0',proxy:{'/ws':{target:'ws://127.0.0.1:8787',ws:true},'/health':'http://127.0.0.1:8787','/api':'http://127.0.0.1:8787'}},build:{target:'es2022',sourcemap:true}});
