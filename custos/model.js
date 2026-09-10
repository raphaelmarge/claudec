/* Torque Fitness — cost model. No selling markup is ever an input. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TorqueCost = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const IMPORT = [
    ['cambio', 'Câmbio efetivo (R$/US$)'], ['freteIntlUSD', 'Frete internacional por unidade (US$)'],
    ['seguroPct', 'Seguro sobre FOB (%)'], ['iof', 'IOF — modelo legado (%)'],
    ['ii', 'II — modelo legado (%)'], ['ipi', 'IPI — modelo legado (%)'],
    ['pisCofins', 'PIS/COFINS — modelo legado (%)'], ['icms', 'ICMS — modelo legado (%)'],
    ['freteNacionalBRL', 'Frete até o estoque por unidade (R$)']
  ];
  const EXTRA = [
    ['despachanteBRL', 'Despachante / desembaraço (R$)'], ['portoBRL', 'Porto, capatazia e taxas (R$)'],
    ['armazenagemBRL', 'Armazenagem / demurrage (R$)'], ['certificacaoBRL', 'Inspeção e certificação (R$)'],
    ['montagemBRL', 'Montagem / instalação (R$)'], ['entregaBRL', 'Entrega ao cliente (R$)'],
    ['garantiaBRL', 'Provisão de garantia (R$)'], ['operacaoBRL', 'Rateio operacional / administrativo (R$)'],
    ['financeiroBRL', 'Custo financeiro / câmbio adicional (R$)'], ['outrosBRL', 'Outras despesas (R$)'],
    ['creditosBRL', 'Créditos recuperáveis confirmados (R$)']
  ];
  const SALE = [
    ['tributosVendaPct', 'Tributos sobre a venda (%)'], ['comissaoPct', 'Comissão de venda (%)'],
    ['pagamentoPct', 'Taxas de recebimento / cartão (%)']
  ];
  const FIELDS = [...IMPORT, ...EXTRA, ...SALE];
  const KEYS = new Set(['fobUSD', 'landedBRL', ...FIELDS.map(x => x[0])]);
  const round = n => Math.round((n + Number.EPSILON) * 100) / 100;
  const present = n => typeof n === 'number' && Number.isFinite(n);
  function parse(s) {
    if (s == null || String(s).trim() === '') return null;
    if (typeof s === 'number') { if (!Number.isFinite(s)) throw new Error('Número inválido.'); return s; }
    let text = String(s).trim();
    if (text.includes(',')) {
      if (!/^\d{1,3}(\.\d{3})*,\d+$/.test(text) && !/^\d+,\d+$/.test(text)) throw new Error('Use um número válido, como 1.234,56.');
      text = text.replace(/\./g, '').replace(',', '.');
    }
    if (!/^\d+(\.\d+)?$/.test(text)) throw new Error('Use um número positivo, sem símbolo de moeda.');
    const value = Number(text);
    if (!Number.isFinite(value)) throw new Error('Número inválido.');
    return value;
  }
  function validate(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Registro inválido.');
    const out = {};
    for (const [key, value] of Object.entries(payload)) {
      if (KEYS.has(key)) {
        if (value == null) continue;
        if (!present(value) || value < 0 || value > 1e10) throw new Error('Valor inválido: ' + key);
        if (['cambio', 'fobUSD', 'landedBRL'].includes(key) && value <= 0) throw new Error('O valor deve ser maior que zero: ' + key);
        if ((key === 'icms' || SALE.some(x => x[0] === key)) && value >= 100) throw new Error('Percentual deve ser inferior a 100: ' + key);
        out[key] = value;
      } else if (key === 'source') {
        if (typeof value !== 'string' || value.length > 1500) throw new Error('Fonte inválida.');
        out.source = value;
      } else { throw new Error('Campo não permitido no custo: ' + key); }
    }
    return out;
  }
  function calculate(product, defaults = {}, item = {}) {
    const data = { ...defaults, ...Object.fromEntries(Object.entries(item).filter(([,v]) => v != null)) };
    // A landed override belongs to one product, never to global defaults.
    delete data.landedBRL;
    if (present(item.landedBRL)) data.landedBRL = item.landedBRL;
    const missing = [];
    const need = key => { if (!present(data[key])) { missing.push(key); return null; } return data[key]; };
    const sale = Number(product.preco);
    let base = null;
    let method = 'estimado';
    try { validate(defaults); validate(item); } catch (e) { return { complete:false, missing:[], error:e.message, base:null, total:null, difference:null, margin:null, markup:null, breakEven:null }; }
    if (present(data.landedBRL)) { base = data.landedBRL; method = 'documentado'; }
    else {
      ['fobUSD', ...IMPORT.map(x => x[0])].forEach(need);
      if (!missing.length) {
        const cif = data.fobUSD + data.freteIntlUSD + data.fobUSD * data.seguroPct / 100;
        // Compatibility estimate copied from js/app.js, not a fiscal assessment.
        base = cif * (1 + (data.iof + data.ii + data.ipi + data.pisCofins) / 100) / (1 - data.icms / 100) * data.cambio + data.freteNacionalBRL;
      }
    }
    let extra = 0;
    for (const [key] of EXTRA) {
      const value = need(key);
      if (value != null) extra += (key === 'creditosBRL' ? -value : value);
    }
    let rate = 0;
    for (const [key] of SALE) { const value = need(key); if (value != null) rate += value / 100; }
    const fixed = base == null ? null : base + extra;
    const result = { complete:false, missing, method, base:base == null ? null : round(base), fixed:fixed == null ? null : round(fixed), total:null, difference:null, margin:null, markup:null, breakEven:null, saleRate:rate, error:null };
    if (rate >= 1) { result.error = 'As despesas percentuais da venda somam 100% ou mais.'; return result; }
    if (fixed != null && fixed < 0) { result.error = 'Créditos excedem os custos informados.'; return result; }
    if (missing.length || fixed == null) return result;
    result.breakEven = round(fixed / (1-rate));
    if (!Number.isFinite(sale) || sale <= 0) { result.missing.push('precoPublicado'); return result; }
    result.complete = true;
    result.total = round(fixed + sale * rate);
    result.difference = round(sale - result.total);
    result.margin = result.difference / sale * 100;
    result.markup = result.total > 0 ? result.difference / result.total * 100 : null;
    return result;
  }
  function legacyImport(secret, products) {
    if (!secret || !Array.isArray(secret.items) || !secret.params) throw new Error('Base protegida inválida.');
    const defaults = {};
    IMPORT.forEach(([key]) => { if (secret.params[key] != null) defaults[key] = Number(secret.params[key]); });
    defaults.source = 'Parâmetros da base protegida legada; estimativa a revisar.';
    validate(defaults);
    const codes = new Set(products.map(p => String(p.codigo)));
    const seen = new Set();
    const items = [];
    for (const item of secret.items) {
      const code = String(item.codigo || '');
      if (!codes.has(code) || seen.has(code) || !present(Number(item.fob)) || Number(item.fob) <= 0) continue;
      seen.add(code);
      items.push({ codigo:code, payload:validate({fobUSD:Number(item.fob), source:'FOB da base protegida legada; confirmar com fornecedor.'}) });
    }
    return { defaults, items };
  }
  function csvCell(value) {
    let text = value == null ? '' : String(value);
    // Formula-injection prevention for untrusted names, codes and source notes.
    if (typeof value !== 'number' && /^[\s]*[=+\-@\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }
  return { IMPORT, EXTRA, SALE, FIELDS, parse, validate, calculate, legacyImport, csvCell, round };
});
