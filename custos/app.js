/* Restricted, standalone workspace. Never writes to settings, Storage, products or quotations. */
(function () {
  'use strict';
  const M = window.TorqueCost;
  const $ = id => document.getElementById(id);
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = value => value == null ? '—' : new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value);
  const pct = value => value == null ? '—' : value.toLocaleString('pt-BR',{maximumFractionDigits:1}) + '%';
  const fold = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const date = value => { const d = new Date(value); return !value || !Number.isFinite(d.getTime()) ? 'data não informada' : d.toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}); };
  let sb, epoch = 0, userId = null, records = new Map(), products = [], filtered = [], shown = 50;
  let sourceLabel = '', editCode = '', editVersion = null, mutation = false;
  function notice(text, error = false) { $('notice').textContent = text; $('notice').classList.toggle('error', error); }
  function wipe() {
    epoch++; userId = null; records = new Map(); products = []; filtered = []; editCode = '';
    $('workspace').hidden = true; $('logout').hidden = true; $('login').hidden = false;
    $('rows').replaceChildren(); $('editorFields').replaceChildren(); $('preview').textContent = '';
    $('editorError').textContent = ''; $('importMessage').textContent = ''; $('vaultPassword').value = '';
    $('password').value = ''; ['mProducts','mComplete','mPending','mLoss'].forEach(id => { $(id).textContent = '—'; });
    ['editor','importer'].forEach(id => { if ($(id).open) $(id).close(); });
  }
  function busy(value) {
    mutation = value;
    document.querySelectorAll('button:not(#logout):not([data-close])').forEach(b => { b.disabled = value; });
  }
  async function access() {
    const {data, error} = await sb.auth.getUser();
    if (error || !data || !data.user) throw new Error('Entre com a conta administradora autorizada.');
    const result = await sb.from('equipment_cost_access').select('enabled').eq('user_id',data.user.id).maybeSingle();
    if (result.error) throw new Error('Não foi possível validar a permissão de custos. Confira a conexão e a instalação do banco privado.');
    if (!result.data || result.data.enabled !== true) throw new Error('Esta conta não está autorizada a consultar custos. Use a conta administradora autorizada.');
    return data.user;
  }
  async function loadRecords() {
    const result = new Map();
    for (let from = 0; ; from += 500) {
      const {data,error} = await sb.from('equipment_cost_records').select('codigo,payload,version,updated_at').order('codigo').range(from,from+499);
      if (error) throw error;
      for (const row of data || []) result.set(row.codigo,row);
      if (!data || data.length < 500) break;
    }
    return result;
  }
  function normalizeCatalog(list) {
    const names = window.TORQUE_NOMES_PT || {};
    const seen = new Set();
    return list.filter(p => p && p.codigo != null && !p.oculto).map(p => ({...p,codigo:String(p.codigo)})).filter(p => {
      if (seen.has(p.codigo) || p.codigo === '__defaults__') return false;
      seen.add(p.codigo); return true;
    }).map(p => ({...p,nome:names[String(p.nome || '').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()] || p.nome,preco:Number(p.preco)}));
  }
  async function loadCatalog() {
    const base = (window.TORQUE_PUBLIC && window.TORQUE_PUBLIC.products) || [];
    const url = sb.storage.from('produtos').getPublicUrl('catalog.json').data.publicUrl;
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(),15000);
    try {
      const response = await fetch(url + '?costCheck=' + Date.now(),{cache:'no-store',signal:controller.signal});
      if (!response.ok) throw new Error('Catálogo indisponível');
      const data = await response.json();
      if (!data || !Array.isArray(data.products) || !data.products.length) throw new Error('Catálogo vazio');
      return {products:normalizeCatalog(data.products),label:'Catálogo público no Supabase • publicado em ' + date(data.at) + ' • consultado em ' + date(new Date())};
    } catch (_) {
      if (!base.length) throw new Error('Não foi possível carregar preços. Nenhum preço foi inventado.');
      return {products:normalizeCatalog(base),label:'ATENÇÃO: leitura online indisponível. Exibindo a base embarcada do site; preços atuais não confirmados. Consultado em ' + date(new Date())};
    } finally { clearTimeout(timeout); }
  }
  async function loadWorkspace() {
    if (mutation) return;
    const token = ++epoch;
    notice('Verificando permissão e atualizando dados…');
    try {
      const user = await access(); if (token !== epoch) return;
      const [costs,catalog] = await Promise.all([loadRecords(),loadCatalog()]);
      if (token !== epoch) return;
      userId = user.id; records = costs; products = catalog.products; sourceLabel = catalog.label;
      $('login').hidden = true; $('workspace').hidden = false; $('logout').hidden = false;
      const selected = $('series').value;
      $('series').innerHTML = '<option value="">Todas as linhas</option>' + Array.from(new Set(products.map(p => p.serie || 'Geral'))).sort((a,b)=>a.localeCompare(b,'pt-BR')).map(s=>'<option value="'+esc(s)+'">'+esc(s)+'</option>').join('');
      if (Array.from($('series').options).some(o=>o.value===selected)) $('series').value = selected;
      $('source').textContent = sourceLabel;
      render();
      notice('Acesso autorizado. Alterações de custo não modificam o catálogo nem os orçamentos.');
    } catch (error) { if (token === epoch) { wipe(); notice(error.message || 'Não foi possível abrir o painel.',true); } }
  }
  const defaults = () => (records.get('__defaults__') || {}).payload || {};
  function resultFor(p) { return M.calculate(p,defaults(),(records.get(p.codigo) || {}).payload || {}); }
  function imageURL(value) {
    try { const url = new URL(value,new URL('../',location.href)); return /^https?:$/.test(url.protocol) ? url.href : ''; } catch (_) { return ''; }
  }
  function render() {
    if (!userId) return;
    const q = fold($('search').value), series = $('series').value, status = $('status').value;
    filtered = products.filter(p => (!series || (p.serie || 'Geral')===series) && fold([p.nome,p.codigo,p.serie].join(' ')).includes(q)).map(p=>({p,r:resultFor(p)})).filter(({r})=>!status || (status==='pending' && !r.complete) || (status==='complete' && r.complete) || (status==='loss' && r.complete && r.difference<0));
    const sort = $('sort').value;
    filtered.sort((a,b) => {
      if (sort==='price') return (b.p.preco || 0)-(a.p.preco || 0);
      if (sort==='margin' || sort==='difference') { const key=sort==='margin'?'margin':'difference'; const av=a.r[key],bv=b.r[key]; if(av==null && bv!=null)return 1;if(bv==null && av!=null)return -1;if(av!=null && bv!=null && av!==bv)return av-bv; }
      return String(a.p.nome).localeCompare(String(b.p.nome),'pt-BR');
    });
    $('mProducts').textContent = filtered.length;
    $('mComplete').textContent = filtered.filter(x=>x.r.complete).length;
    $('mPending').textContent = filtered.filter(x=>!x.r.complete).length;
    $('mLoss').textContent = filtered.filter(x=>x.r.complete && x.r.difference<0).length;
    $('rows').innerHTML = filtered.slice(0,shown).map(({p,r}) => {
      const img = p.imagem ? imageURL(p.imagem) : '';
      const label = r.error ? 'Revisar valores' : !r.complete ? 'Pendente' : r.difference<0 ? (r.method==='estimado'?'Estimado · abaixo':'Abaixo do custo') : (r.method==='estimado'?'Estimado':'Base documentada');
      const css = !r.complete ? 'pending' : r.difference<0 ? 'loss' : '';
      return '<tr><td><div class="product">'+(img?'<img src="'+esc(img)+'" alt="" loading="lazy">':'')+'<div><strong>'+esc(p.nome)+'</strong><small>'+esc(p.codigo)+' · '+esc(p.serie || 'Geral')+'</small></div></div></td><td class="numeric muted">'+money(r.base)+'</td><td class="numeric">'+money(r.total)+'</td><td class="numeric price">'+(p.preco>0?money(p.preco):'Sob consulta')+'</td><td class="numeric '+(r.difference<0?'loss-text':'positive')+'">'+money(r.difference)+'</td><td class="numeric">'+pct(r.margin)+'</td><td><span class="badge '+css+'" title="'+esc(r.error || (r.missing.length?'Campos pendentes: '+r.missing.join(', '):'Base '+r.method+'; ver composição'))+'">'+label+'</span></td><td><button class="edit" data-edit="'+esc(p.codigo)+'" aria-label="Editar custo de '+esc(p.codigo)+'">Detalhar ↗</button></td></tr>';
    }).join('') || '<tr><td colspan="8" class="empty">Nenhum equipamento corresponde aos filtros.</td></tr>';
    $('count').textContent = Math.min(shown,filtered.length)+' de '+filtered.length+' equipamentos';
    $('more').hidden = shown>=filtered.length;
  }
  function field(key,label,own,isGlobal) {
    const val = own[key]; const inherited = defaults()[key];
    const value = val==null?'':String(val).replace('.',',');
    const hint = !isGlobal && inherited!=null && !['fobUSD','landedBRL'].includes(key) ? 'Em branco: geral = '+String(inherited).replace('.',',') : 'Em branco: pendente';
    return '<label>'+esc(label)+'<input data-cost="'+key+'" inputmode="decimal" value="'+esc(value)+'" placeholder="'+esc(hint)+'"><small>'+esc(hint)+'</small></label>';
  }
  function fieldset(title,fields,own,isGlobal) { return '<fieldset><legend>'+title+'</legend><div class="field-grid">'+fields.map(([k,l])=>field(k,l,own,isGlobal)).join('')+'</div></fieldset>'; }
  function formPayload() {
    const value = {};
    document.querySelectorAll('#editorFields [data-cost]').forEach(input => { const n=M.parse(input.value); if(n!=null)value[input.dataset.cost]=n; });
    value.source=$('costSource').value.trim();
    return M.validate(value);
  }
  function preview() {
    if (!editCode || !userId) return;
    try {
      const payload=formPayload();
      if(editCode==='__defaults__') { $('preview').textContent='Aplicado como padrão por unidade. Campos específicos de um equipamento têm prioridade. Nenhuma margem de lucro será adicionada.'; return; }
      const p=products.find(p=>p.codigo===editCode); if(!p)return;
      const r=M.calculate(p,defaults(),payload);
      $('preview').textContent=r.error || (!r.complete?'Dados pendentes: '+r.missing.join(', ')+'. Base disponível: '+money(r.base)+'.':'Custo total: '+money(r.total)+' · Venda publicada: '+money(p.preco)+' · Diferença: '+money(r.difference)+' · Margem sobre a venda: '+pct(r.margin)+' · Acréscimo sobre o custo: '+pct(r.markup)+' · Preço de equilíbrio (sem lucro): '+money(r.breakEven));
    } catch(e) { $('preview').textContent=e.message; }
  }
  function openEditor(code) {
    if (!userId || mutation) return;
    editCode=code; const row=records.get(code), own=row?row.payload:{}; editVersion=row?row.version:null;
    const global=code==='__defaults__', p=products.find(p=>p.codigo===code);
    if(!global && !p)return;
    $('editorTitle').textContent=global?'Parâmetros gerais de custo':p.nome;
    $('editorCode').textContent=global?'PADRÕES POR UNIDADE':p.codigo+' · '+p.serie;
    $('editorHelp').textContent=(global?'Informe valores por equipamento, já rateados. Campos vazios permanecem pendentes.':'Campos vazios herdam os parâmetros gerais. O custo nacionalizado documentado substitui apenas a fórmula legada de compra, tributos de importação e fretes até o estoque. Não some novamente uma despesa já incluída: registre zero na despesa complementar correspondente.')+(row?' Última alteração: '+date(row.updated_at)+'.':'');
    $('editorFields').innerHTML=(!global?fieldset('1. Compra / base documentada', [['fobUSD','FOB por equipamento (US$)'],['landedBRL','Base nacionalizada documentada (R$)']],own,false):'')+fieldset('Importação — estimativa legada',M.IMPORT,own,global)+fieldset('Despesas complementares por unidade',M.EXTRA,own,global)+fieldset('Despesas sobre a venda atual',M.SALE,own,global)+'<label>Fonte / referência / observações<textarea id="costSource" maxlength="1500" placeholder="Invoice, nota, data da cotação ou premissas utilizadas">'+esc(own.source || '')+'</textarea></label>';
    $('editorError').textContent='';preview();$('editor').showModal();
  }
  async function saveCost(event) {
    event.preventDefault(); if(mutation || !userId)return;
    const token=epoch,code=editCode,version=editVersion;
    try {
      const payload=formPayload();
      if(!payload.source)throw new Error('Informe a fonte ou as premissas utilizadas.');
      const check=code==='__defaults__'?null:M.calculate(products.find(p=>p.codigo===code),defaults(),payload);
      if(check && check.error)throw new Error(check.error);
      const rates=M.SALE.reduce((sum,[k])=>sum+(payload[k]||0),0);if(rates>=100)throw new Error('As despesas sobre a venda devem somar menos de 100%.');
      busy(true);
      const user=await access(); if(token!==epoch || user.id!==userId)return;
      let response;
      if(version==null)response=await sb.from('equipment_cost_records').insert({codigo:code,payload}).select('codigo,payload,version,updated_at').single();
      else {
        response=await sb.from('equipment_cost_records').update({payload}).eq('codigo',code).eq('version',version).select('codigo,payload,version,updated_at');
        if(!response.error && (!response.data || response.data.length!==1))throw new Error('Este registro mudou em outra sessão. Feche o editor, atualize os dados e revise antes de salvar.');
        if(!response.error)response.data=response.data[0];
      }
      if(response.error)throw new Error(response.error.code==='23505'?'Já existe um registro salvo por outra sessão. Atualize antes de editar.':response.error.message);
      if(token!==epoch)return;
      records.set(code,response.data);$('editor').close();render();notice('Custo salvo no banco privado. Nenhum preço público foi alterado.');
    } catch(e) { if(token===epoch)$('editorError').textContent=e.message || 'Falha ao salvar. Seus valores continuam no formulário.'; }
    finally { busy(false); }
  }
  async function loadVault() {
    if(window.TORQUE_SECURE)return;
    await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='../js/secure.js?costImport='+Date.now();script.onload=resolve;script.onerror=()=>reject(new Error('Não foi possível abrir o cofre existente.'));document.head.append(script);});
  }
  async function importVault(event) {
    event.preventDefault();if(mutation || !userId)return;
    const token=epoch;
    let password=$('vaultPassword').value;$('vaultPassword').value='';
    busy(true);$('importMessage').textContent='Desbloqueando o cofre neste navegador…';
    try {
      const user=await access();if(token!==epoch || user.id!==userId)return;
      await loadVault();if(token!==epoch)return;
      const blob=window.TORQUE_SECURE;if(!blob)throw new Error('Base protegida não encontrada.');
      const b64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
      const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveKey']);password='';
      const derived=await crypto.subtle.deriveKey({name:'PBKDF2',salt:b64(blob.salt),iterations:blob.iter||150000,hash:'SHA-256'},key,{name:'AES-GCM',length:256},false,['decrypt']);
      let plain;
      try {plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:b64(blob.iv)},derived,b64(blob.data));}catch(_){throw new Error('Não foi possível desbloquear: confira a senha do cofre de custos.');}
      if(token!==epoch)return;
      const imported=M.legacyImport(JSON.parse(new TextDecoder().decode(plain)),products);plain=null;
      const pending=[{codigo:'__defaults__',payload:imported.defaults},...imported.items].filter(row=>!records.has(row.codigo));
      let inserted=0;
      for(let from=0;from<pending.length;from+=100) {
        if(token!==epoch)return;
        $('importMessage').textContent='Salvando custos na área privada: '+Math.min(from+100,pending.length)+' de '+pending.length+' registros…';
        // ON CONFLICT DO NOTHING: never overwrites a user's edited cost.
        const {data,error}=await sb.from('equipment_cost_records').upsert(pending.slice(from,from+100),{onConflict:'codigo',ignoreDuplicates:true}).select('codigo');
        if(error)throw new Error('A importação parou após '+inserted+' novos registros. Os anteriores foram preservados. '+error.message);
        inserted+=(data || []).length;
      }
      if(token!==epoch)return;
      const loaded=await loadRecords();if(token!==epoch)return;records=loaded;
      $('importMessage').textContent=inserted+' novos registros adicionados. Custos existentes preservados. Complete as despesas complementares nos parâmetros gerais; zero apenas onde não se aplica.';
      render();notice('Base protegida importada. Valores legados são estimativas até revisão das despesas e documentos.');
    } catch(e) {if(token===epoch)$('importMessage').textContent=e.message || 'Falha ao importar.';}
    finally {password='';busy(false);}
  }
  function exportCSV() {
    if(!userId || !filtered.length || !confirm('Este arquivo contém custos confidenciais. Exportar os equipamentos do filtro atual?'))return;
    const header=['Código','Equipamento','Linha','Base importação BRL','Custo total BRL','Venda publicada BRL','Diferença BRL','Margem sobre venda %','Acréscimo sobre custo %','Preço equilíbrio BRL','Método','Pendências','Fonte do preço'];
    const lines=[header,...filtered.map(({p,r})=>[p.codigo,p.nome,p.serie,r.base,r.total,p.preco>0?p.preco:null,r.difference,r.margin,r.markup,r.breakEven,r.method,r.error || r.missing.join(', '),sourceLabel])];
    const csv='\uFEFF'+lines.map(row=>row.map(value=>typeof value==='number'?'"'+String(M.round(value)).replace('.',',')+'"':M.csvCell(value)).join(';')).join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download='torque-custos-venda-'+new Date().toISOString().slice(0,10)+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  $('loginForm').addEventListener('submit',async event=>{
    event.preventDefault();if(mutation)return;busy(true);
    let password=$('password').value;$('password').value='';
    try {const {error}=await sb.auth.signInWithPassword({email:$('email').value.trim(),password});password='';if(error)throw new Error('Não foi possível entrar. Confira o e-mail e a senha.');}
    catch(e){notice(e.message,true);}finally{password='';busy(false);if(sb)await loadWorkspace();}
  });
  $('logout').addEventListener('click',async()=>{wipe();notice('Painel bloqueado.');if(sb){const {error}=await sb.auth.signOut({scope:'local'});if(error)notice('Painel bloqueado, mas não foi possível encerrar a sessão no servidor. Confira a conexão.',true);}});
  $('refresh').addEventListener('click',loadWorkspace);
  ['search','series','status','sort'].forEach(id=>$(id).addEventListener(id==='search'?'input':'change',()=>{shown=50;render();}));
  $('more').addEventListener('click',()=>{shown+=50;render();});
  $('rows').addEventListener('click',event=>{const b=event.target.closest('[data-edit]');if(b)openEditor(b.dataset.edit);});
  $('defaults').addEventListener('click',()=>openEditor('__defaults__'));
  $('costForm').addEventListener('submit',saveCost);$('editorFields').addEventListener('input',preview);
  $('zeroExtras').addEventListener('click',()=>{
    if(!confirm('Confirme: despesas complementares vazias NÃO se aplicam. Elas receberão zero, inclusive no lugar de parâmetros gerais herdados. Custos desconhecidos devem permanecer vazios.'))return;
    [...M.EXTRA,...M.SALE].forEach(([key])=>{const input=document.querySelector('[data-cost="'+key+'"]');if(input && input.value.trim()==='')input.value='0';});preview();
  });
  $('export').addEventListener('click',exportCSV);
  $('importOpen').addEventListener('click',()=>{if(!userId || mutation)return;$('importMessage').textContent='';$('importer').showModal();});
  $('importForm').addEventListener('submit',importVault);
  document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>$(b.dataset.close).close()));
  $('importer').addEventListener('close',()=>{$('vaultPassword').value='';});
  $('rows').addEventListener('error',event=>{if(event.target.tagName==='IMG')event.target.hidden=true;},true);
  window.addEventListener('pagehide',wipe);
  window.addEventListener('pageshow',event=>{if(event.persisted && sb)loadWorkspace();});
  document.addEventListener('visibilitychange',async()=>{
    if(document.hidden || !userId || !sb)return;
    const token=epoch;
    try{const user=await access();if(token===epoch && user.id!==userId){wipe();loadWorkspace();}}
    catch(e){if(token===epoch){wipe();notice(e.message,true);}}
  });
  try {
    sb=window.Cloud && window.Cloud.init();if(!sb)throw new Error('A conexão segura não carregou. Reabra com internet; nenhum custo é disponibilizado sem autenticação.');
    sb.auth.onAuthStateChange((event,session)=>{
      // Do not await Supabase calls inside its auth callback.
      if(event==='SIGNED_OUT' || (userId && session && session.user.id!==userId)){wipe();notice('Sessão alterada. Faça login novamente.');}
      if(event==='SIGNED_IN' && (!userId || session.user.id!==userId))setTimeout(()=>loadWorkspace(),0);
    });
    loadWorkspace();
  } catch(e) {wipe();notice(e.message,true);}
})();
