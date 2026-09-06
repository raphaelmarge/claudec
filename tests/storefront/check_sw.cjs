/* Offline routing must not turn a public page into the seller app. */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const events={},deleted=[],root=path.resolve(__dirname,'../..');
let networkFails=true,installed=[];
const context={URL,Response,Promise,self:{location:{origin:'https://local.test'},addEventListener:(name,fn)=>events[name]=fn,skipWaiting:()=>Promise.resolve(),clients:{claim:()=>Promise.resolve()}},
 caches:{open:async()=>({addAll:async items=>{installed=items;},put:async()=>{}}),keys:async()=>['torque-app-v3','other-project-cache','torque-app-v4-premium'],delete:async name=>deleted.push(name),match:async key=>typeof key==='string'?new Response(key):undefined},
 fetch:async()=>{if(networkFails)throw Error('offline');return new Response('fresh');}};
vm.runInNewContext(fs.readFileSync(path.join(root,'sw.js'),'utf8'),context);
(async()=>{
 let pending;events.install({waitUntil:p=>pending=p});await pending;
 for(const item of installed)assert(fs.existsSync(path.join(root,item.split('?')[0])),`Missing shell asset: ${item}`);
 assert(installed.includes('./index.html'));assert(installed.includes('./js/premium.js?v=20260905'));
 assert(installed.includes('./css/premium.css?v=20260905b'));assert(installed.includes('./assets/hero-torque-fitness.jpg'));
 events.activate({waitUntil:p=>pending=p});await pending;assert.deepEqual(deleted,['torque-app-v3','torque-app-v4-premium']);
 async function request(url,method='GET',mode='navigate'){let response;events.fetch({request:{url,method,mode},respondWith:p=>response=p});return response?await (await response).text():null;}
 assert.equal(await request('https://local.test/sobre.html'),'./index.html');
 assert.equal(await request('https://local.test/app.html'),'./app.html');
 assert.equal(await request('https://db.example/rest/v1/orcamentos','POST'),null);
 assert.equal(await request('https://db.example/catalog.json'),null);
 networkFails=false;assert.equal(await request('https://local.test/index.html'),'fresh');
 console.log('PASS service worker: shell assets, scoped cache cleanup, public/seller offline fallback, external and POST bypass, fresh network response');
})().catch(e=>{console.error(e);process.exit(1);});
