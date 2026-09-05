/* Run: NODE_PATH=<installed modules> node scripts/test-public.cjs
   Optional BROWSER_CHANNEL=msedge and TEST_OUTPUT=<artifact directory>.
   All external traffic is intercepted. No production writes are possible. */
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),vm=require('node:vm'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),out=path.resolve(process.env.TEST_OUTPUT || path.join(root,'test-results'));
fs.mkdirSync(out,{recursive:true});
const seed={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'js/products.js'),'utf8'),seed);
const products=JSON.parse(JSON.stringify(seed.window.TORQUE_PUBLIC.products));
const fixture={products,site:{faq:[{q:'Como escolher os equipamentos?',a:'Compare as linhas e monte seu orçamento de teste.'}],cupons:[{codigo:'QA10',desconto:10,ativo:true}],depoimentos:[],obras:[]}};
const results=[],errors=[],writes=[],mockLeads=[];
const server=http.createServer((req,res)=>{
 const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 const file=path.resolve(root,'.'+(name==='/'?'/index.html':name));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.readFile(file,(e,data)=>{if(e){res.writeHead(404).end();return;}const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png'};res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(data);});
});
let browser;
async function run(name,fn){if(process.env.TEST_ONLY && !name.includes(process.env.TEST_ONLY))return;try{await fn();results.push({name,status:'PASS'});console.log('PASS',name);}catch(e){results.push({name,status:'FAIL',error:e.message});console.error('FAIL',name,e.message);}}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 browser=await chromium.launch({headless:true,...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{})});
 const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block',reducedMotion:'reduce',acceptDownloads:true});
 await context.route('**/*',route=>{
   const req=route.request(),u=new URL(req.url());
   if(u.origin===base)return route.continue();
   if(!['GET','HEAD'].includes(req.method())){
     if(u.pathname==='/rest/v1/orcamentos' && req.method()==='POST') mockLeads.push(req.postDataJSON());
     else writes.push(req.url());
     return route.fulfill({status:201,contentType:'application/json',body:'[]'});
   }
   if(process.env.PDF_TEST_LIBS && /\/(html2canvas.min.js|jspdf.umd.min.js)$/.test(u.pathname))return route.fulfill({status:200,contentType:'text/javascript',body:fs.readFileSync(path.join(process.env.PDF_TEST_LIBS,path.basename(u.pathname)))});
   if(u.pathname.endsWith('/catalog.json'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(fixture)});
   return route.abort();
 });
 const p=await context.newPage();p.setDefaultTimeout(8000);p.on('pageerror',e=>errors.push({url:p.url(),message:e.message}));
 const goto=async(route='/')=>{await p.goto(base+route,{waitUntil:'networkidle'});};
 const visible=async(sel)=>assert(await p.locator(sel).isVisible(),sel+' should be visible');
 await run('Live fixture, real seed counts and carousel',async()=>{await goto();assert.equal(await p.locator('.slide').count(),4);assert.equal(await p.locator('#statProdutos').textContent(),String(products.length));assert.equal(await p.locator('h1').count(),1);await p.locator('#carNext').click();assert.equal(await p.locator('.slide--active .slide__title').textContent(),'Linha HM');await p.locator('#carPrev').click();assert.equal(await p.locator('.slide:not(.slide--active):not([inert])').count(),0);});
 await run('Open catalog, search Portuguese, empty state and reset',async()=>{await p.locator('.tf-hero-actions [data-catalog]').click();await visible('#prodGrid');await p.locator('#search').fill('supino');assert(await p.locator('.pcard').count()>0);await p.locator('#search').fill('qa-nonexistent-xyz');await visible('#empty');assert.equal(await p.locator('.pcard').count(),0);await p.locator('#clearFilters').click();assert.equal(await p.locator('.pcard').count(),24);});
 await run('Line buttons, muscle filter, price and sort',async()=>{await p.locator('#chips [data-serie="Cardio"]').click();assert(await p.locator('.pcard').count()>0);assert((await p.locator('.pcard__serie').allTextContents()).every(x=>x==='Cardio'));await p.locator('#clearFilters').click();await p.locator('#grupoFilter').selectOption({label:'Pernas e glúteos'});assert(await p.locator('.pcard').count()>0);await p.locator('#clearFilters').click();await p.locator('#priceBand').selectOption('10000-20000');await p.locator('#sortBy').selectOption('price-asc');const codes=await p.locator('.pcard').evaluateAll(es=>es.map(e=>e.dataset.code));const prices=codes.map(c=>products.find(p=>p.codigo===c).preco);assert(prices.every(x=>x>=10000 && x<=20000));assert(prices.every((x,i)=>!i||x>=prices[i-1]));await p.locator('#clearFilters').click();await p.locator('#loadMore').click();assert.equal(await p.locator('.pcard').count(),48);});
 await run('Quantity, totals, coupon and persistence',async()=>{const card=p.locator('.pcard').first();const code=await card.getAttribute('data-code');const price=products.find(p=>p.codigo===code).preco;await card.locator('[data-act=add]').click();await card.locator('[data-act=inc]').click();assert.equal(await p.locator('#cartCount').textContent(),'2');await p.locator('#navCart').click();const brl=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n);assert.equal(await p.locator('#drawerTotal').textContent(),brl(price*2));await p.locator('#cupomInput').fill('QA10');await p.locator('#cupomApply').click();assert.equal(await p.locator('#drawerTotal').textContent(),brl(price*2-Math.round(price*2*.1*100)/100));await p.locator('#cupomRemove').click();await p.locator('.drawer__x').click();await p.reload({waitUntil:'networkidle'});assert.equal(await p.locator('#cartCount').textContent(),'2');await p.locator('#navCart').click();await p.locator('.ditem [data-act=qty]').fill('3');assert.equal(await p.locator('#drawerTotal').textContent(),brl(price*3));await p.locator('.ditem [data-act=dec]').click();await p.locator('.ditem [data-act=dec]').click();await p.locator('.ditem [data-act=dec]').click();assert.equal(await p.locator('#cartCount').textContent(),'0');assert(await p.locator('#btnSolicitar').isDisabled());await p.locator('.drawer__x').click();});
 await run('Product keyboard link, gallery, metadata and focus trap',async()=>{await goto('/?qa=keyboard#produtos');await p.locator('.pcard__name').first().focus();await p.keyboard.press('Enter');await visible('#prodModal');assert(p.url().includes('?p='));assert(await p.locator('#pmMedia img').count()>0);const canonical=await p.locator('link[rel=canonical]').getAttribute('href');assert(canonical.includes('?p='));await p.locator('.pmodal__x').focus();await p.keyboard.press('Shift+Tab');assert(await p.locator('#prodModal').evaluate(el=>el.contains(document.activeElement)));await p.keyboard.press('Escape');assert(await p.locator('#prodModal').isHidden());assert(await p.locator('.pcard__name').first().evaluate(el=>el===document.activeElement));});
 await run('Favorites, compare, lead validation without submission',async()=>{await goto('/?qa=favorites#produtos');await p.locator('.pcard [data-act=fav]').first().click();await visible('#favToggle');await p.locator('.pcard [data-act=cmp]').nth(0).click();await p.locator('.pcard [data-act=cmp]').nth(1).click();await p.locator('#cmpGo').click();await visible('#cmpModal');await p.locator('[data-cmpclose]').last().click();await p.locator('.pcard [data-act=add]').first().click();await p.locator('#navCart').click();await p.locator('#btnSolicitar').click();await visible('#leadModal');await p.locator('#btnEnviarLead').click();await visible('#leadErr');await p.keyboard.press('Escape');});
 if(process.env.PDF_TEST_LIBS) await run('Catalog PDF and quote PDF with intercepted lead fixture',async()=>{
   await goto('/?qa=pdf#produtos');await p.locator('#search').fill('HM01');
   let pending=p.waitForEvent('download',{timeout:20000});await p.locator('#btnCatalogoPdf').click();let download=await pending;await download.saveAs(path.join(out,'catalog-test.pdf'));assert(fs.readFileSync(path.join(out,'catalog-test.pdf')).subarray(0,4).toString()==='%PDF');
   await p.locator('#navCart').click();await p.locator('#btnSolicitar').click();await p.locator('#leadNome').fill('TESTE LOCAL NAO CONTATAR');await p.locator('#leadTel').fill('00000000000');await p.locator('#leadEmail').fill('teste@example.invalid');
   pending=p.waitForEvent('download',{timeout:30000});await p.locator('#btnEnviarLead').click();download=await pending;await download.saveAs(path.join(out,'quote-test.pdf'));assert(fs.readFileSync(path.join(out,'quote-test.pdf')).subarray(0,4).toString()==='%PDF');
   assert.equal(mockLeads.length,1);assert.equal(mockLeads[0].cliente_nome,'TESTE LOCAL NAO CONTATAR');assert.equal(mockLeads[0].total,mockLeads[0].itens.reduce((sum,i)=>sum+i.qtd*i.unitario,0));assert.equal(await p.locator('#cartCount').textContent(),'0');
 });
 await run('Responsive routes: 360, 390, 768 and 1440',async()=>{
   const proposal=Buffer.from(JSON.stringify({n:'QA local',c:'Cliente de teste',it:[{n:'Equipamento de teste',q:2,u:1000}],s:2000,t:2000})).toString('base64url');
   for(const width of [360,390,768,1440]) {
    await p.setViewportSize({width,height:1000});
    for(const route of ['/','/?linha=Cardio','/sobre.html','/solucoes.html','/guia-linhas.html','/ct.html','/faq.html','/blog.html','/projeto.html','/proposta.html#d='+proposal,'/404.html']) {
      await goto(route);const measure=await p.evaluate(()=>({w:innerWidth,sw:document.documentElement.scrollWidth}));assert(measure.sw<=measure.w+1,route+' overflow at '+width+': '+measure.sw);
      if(route==='/' || (width===390 || width===1440) && ['/sobre.html','/guia-linhas.html','/projeto.html','/solucoes.html','/faq.html','/blog.html','/ct.html','/?linha=Cardio','/proposta.html#d='+proposal].includes(route)) {
        const name=route==='/'?'home':route.startsWith('/?')?'catalog':route.split('/')[1].split('.')[0];await p.screenshot({path:path.join(out,`${name}-${width}.png`),fullPage:false});
      }
    }
   }
 });
 await run('Mobile menu, line navigation and touch budget',async()=>{await p.setViewportSize({width:360,height:800});await goto();await p.evaluate(()=>{const e=new Event('beforeinstallprompt',{cancelable:true});e.prompt=async()=>{window.__installPrompted=true};e.userChoice=Promise.resolve({outcome:'dismissed'});window.dispatchEvent(e)});await p.locator('#navBurger').click();await visible('#mmenu');await visible('#mmenu #installBtn');await p.locator('#installBtn').click();assert(await p.evaluate(()=>window.__installPrompted));await p.locator('#mmenu [data-tipo="acessorio"]').click();assert(await p.locator('#mmenu').isHidden());await visible('#produtos');assert(p.url().includes('tipo=acessorio'));await p.locator('#navCart').click();await visible('#drawer');await p.keyboard.press('Escape');assert(await p.locator('#drawer').isHidden());});
 await run('Planner draws seeded cart and exports PNG',async()=>{await p.evaluate(()=>localStorage.setItem('torque_site_cart',JSON.stringify({HM01:2})));await goto('/projeto.html');await p.locator('#plGo').click();assert(await p.locator('#plSvg').evaluate(el=>el.children.length>0));const dl=p.waitForEvent('download');await p.locator('#plPng').click();const d=await dl;await d.saveAs(path.join(out,'planner-export.png'));});
 await run('No JS content and reduced motion',async()=>{assert.equal(await p.evaluate(()=>getComputedStyle(document.documentElement).scrollBehavior),'auto');const nojs=await browser.newContext({javaScriptEnabled:false,serviceWorkers:'block'});await nojs.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());const np=await nojs.newPage();await np.goto(base);assert(await np.locator('h1').isVisible());assert(await np.locator('.series').isVisible());await nojs.close();});
 await run('Offline catalog fallback and proportional product media',async()=>{const off=await browser.newContext({serviceWorkers:'block',reducedMotion:'reduce'});await off.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());const op=await off.newPage();await op.goto(base+'/#produtos',{waitUntil:'networkidle'});assert(await op.locator('#catalogStatus').isVisible());assert.equal(await op.locator('.pcard').count(),24);assert(await op.locator('.pcard__media img').evaluateAll(es=>es.every(el=>getComputedStyle(el).objectFit==='contain')));await off.close();});
 await run('No runtime exceptions or attempted external writes',async()=>{assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);});
 await run('Motion preference persists and paused carousel stays still',async()=>{
   await p.emulateMedia({reducedMotion:'no-preference'});await p.setViewportSize({width:1440,height:1000});await goto('/?qa=motion');
   await p.locator('.tf-hero-bottom [data-tf-motion]').click();assert(await p.locator('html').evaluate(el=>el.classList.contains('tf-motion-paused')));
   await p.reload({waitUntil:'networkidle'});assert(await p.locator('#carPause').isDisabled());await p.locator('.tf-hero-bottom [data-tf-motion]').click();assert(await p.locator('#carPause').isEnabled());
   await p.locator('#carNext').click();await p.locator('#carPause').click();const current=await p.locator('#carDots [aria-current=true]').getAttribute('data-cdot');await p.waitForTimeout(7250);assert.equal(await p.locator('#carDots [aria-current=true]').getAttribute('data-cdot'),current);
   await p.emulateMedia({reducedMotion:'reduce'});await p.waitForFunction(()=>document.getElementById('carPause').disabled);assert(await p.locator('#carPause').isDisabled());assert.equal(await p.locator('.tf-showcase').evaluate(el=>getComputedStyle(el).transform),'none');
 });
 fs.writeFileSync(path.join(out,'test-results.json'),JSON.stringify({results,errors,writes,interceptedLeadCount:mockLeads.length},null,2));
 if(results.some(r=>r.status==='FAIL'))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();server.close();});
