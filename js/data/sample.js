/* Sample sales (to try the app) and backup files (download / restore).
   Restore also accepts backups from the old single-file BentaLog that saved in the browser. */

function rng(seed){ return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/* 14 days of made-up sales built from the shop's real businesses, products and payment methods */
function buildSampleSales(){
  const ws = db.workspace.id, rand = rng(Date.now() % 100000), pick = a => a[Math.floor(rand()*a.length)];
  const now = Date.now(), rows = [], seq = {};
  const names = ['Nena','Rudy','Joy','Ben','Luz','Mark'];
  const methods = methodsOn(), ofKind = k => methods.filter(m=>m.kind===k);
  for (const st of db.stores) {
    const prods = (db.products[st.id]||[]).filter(p=>p.active!==false), list = [];
    seq[st.id] = 0;
    if (!prods.length || !methods.length) continue;
    for (let d = 13; d >= 0; d--) {
      const key = shiftDay(todayKey(), -d), n = 10 + Math.floor(rand()*15);
      for (let i = 0; i < n; i++) {
        const ts = new Date(key+'T'+pad(7 + Math.floor(Math.pow(rand(), .9) * 12))+':'+pad(Math.floor(rand()*60))+':00').getTime();
        if (ts > now) continue;
        const items = [];
        for (let j = 0, k = 1 + Math.floor(rand()*2.5); j < k; j++) {
          const p = pick(prods), qty = p.step < 1 ? pick([.5,1,1,2,2,3]) : 1 + Math.floor(rand()*2);
          const ex = items.find(x=>x.pid===p.id); if (ex) ex.qty += qty; else items.push({pid:p.id, name:p.name, price:p.price, qty, unit:p.unit});
        }
        const total = r2(items.reduce((s,x)=>s+x.price*x.qty,0));
        const m = rand(), want = m<.68 ? 'cash' : m<.88 ? 'digital' : 'credit';
        const meth = pick(ofKind(want).length ? ofKind(want) : methods);
        const row = {workspace_id:ws, store_id:st.id, ts:new Date(ts).toISOString(), items, total, method_id:meth.id,
          by_name: rand()<.6 ? 'Staff' : me.name, recorded_at:new Date(ts).toISOString()};
        if (meth.kind==='cash') row.tendered = Math.ceil(total/100)*100;
        if (meth.kind==='credit') { row.customer = pick(names); if (d>2 || rand()<.3) row.paid_at = new Date(ts + 2*864e5).toISOString(); }
        if (rand() < .06) { row.late = true; row.recorded_at = new Date(ts + (40+Math.floor(rand()*150))*60000).toISOString(); }
        if (rand() < .025) row.voided = {reason:'Wrong item entered', ts:new Date(ts+300000).toISOString(), by:me.name};
        list.push(row);
      }
    }
    list.sort((a,b)=>a.ts<b.ts?-1:1).forEach(r => { r.receipt_no = st.prefix + '-' + pad(++seq[st.id],4); rows.push(r); });
  }
  return {rows, seq};
}

async function addSampleSales(){
  const {rows, seq} = buildSampleSales();
  if (!rows.length) throw new Error('Add some products first. Sample sales are made from your products.');
  await api.insertSales(rows);
  for (const st of db.stores) if (seq[st.id]) await api.updateStore(st.id, {seq:seq[st.id]});
  return rows.length;
}

/* ---------- backups ---------- */
async function exportData(){
  const sales = await api.allSales(db.workspace.id);
  const data = {settings:db.settings, stores:db.stores, methods:db.methods, products:db.products, sales, closings:db.closings};
  const blob = new Blob([JSON.stringify({app:'BentaLog', version:3, exported:new Date().toISOString(), shop:db.workspace.name, data}, null, 1)], {type:'application/json'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'bentalog-backup-' + todayKey() + '.json'; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* Adds a backup's data to this shop. Matches businesses by receipt prefix and payment methods by name;
   skips products that already exist (same name in the same business) and receipts that already exist. */
async function importBackup(file){
  const j = JSON.parse(await file.text()), d = j.data || j;
  if (!d || !Array.isArray(d.sales) || typeof d.products!=='object') throw new Error('That file is not a BentaLog backup.');
  const ws = db.workspace.id;

  // old single-file versions had no stores/methods lists
  const oldStores = d.stores || Object.keys(d.products).map(id => ({id, name:({ukay:'Ukay-ukay', bigas:'Bigasan'})[id] || id, prefix:({ukay:'UK', bigas:'BG'})[id] || id.slice(0,2).toUpperCase()}));
  const oldMethods = d.methods || [{id:'cash',name:'Cash',kind:'cash'},{id:'gcash',name:'GCash',kind:'digital'},{id:'utang',name:'Utang',kind:'credit'}];

  const storeMap = {}, methodMap = {}, productMap = {};
  for (const s of oldStores) {
    const prefix = String(s.prefix||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,4) || autoPrefix(s.name);
    let mine = db.stores.find(x => x.prefix===prefix);
    if (!mine) { mine = await api.addStore(ws, s.name, prefix.length < 2 ? autoPrefix(s.name) : prefix); db.stores.push(mine); db.products[mine.id] = []; }
    storeMap[s.id] = mine.id;
  }
  for (const m of oldMethods) {
    let mine = db.methods.find(x => x.name.toLowerCase()===String(m.name).toLowerCase());
    if (!mine) { mine = await api.addMethod(ws, {name:m.name, kind:KINDS[m.kind] ? m.kind : 'digital', active:m.active!==false}); db.methods.push(mine); }
    methodMap[m.id] = mine.id;
  }
  for (const [oldStoreId, list] of Object.entries(d.products)) {
    const sid = storeMap[oldStoreId]; if (!sid) continue;
    const have = db.products[sid] || [];
    const fresh = (list||[]).filter(p => p && p.name && +p.price > 0 && !have.some(x => x.name.toLowerCase()===p.name.toLowerCase()));
    const saved = await api.addProducts(ws, sid, fresh.map(p => ({name:p.name, category:p.category||'', sku:p.sku||'', price:+p.price, unit:p.unit||'pc', step:+p.step||1, stock:p.stock==null ? null : Math.max(0,+p.stock), active:p.active!==false})));
    fresh.forEach((p, i) => productMap[p.id] = saved[i].id);
    (list||[]).forEach(p => { const ex = have.find(x => x.name.toLowerCase()===String(p.name).toLowerCase()); if (ex) productMap[p.id] = ex.id; });
  }
  const iso = v => new Date(typeof v==='number' ? v : Date.parse(v)).toISOString();
  const rows = d.sales.filter(s => storeMap[s.store] && methodMap[s.method] && s.id).map(s => ({
    workspace_id:ws, store_id:storeMap[s.store], receipt_no:String(s.id), ts:iso(s.ts),
    items:(s.items||[]).map(it => ({...it, pid: productMap[it.pid] || (UUID.test(it.pid||'') ? it.pid : null)})),
    total:+s.total, method_id:methodMap[s.method], tendered:s.tendered ?? null, customer:s.customer || null, ref:s.gref || null,
    late:!!s.late, recorded_at:iso(s.recordedTs || s.ts), paid_at:s.paidTs ? iso(s.paidTs) : null,
    voided: s.voided ? {...s.voided, ts:iso(s.voided.ts)} : null, by_name:s.by || ''}));
  await api.insertSales(rows);
  for (const c of (d.closings||[])) if (storeMap[c.store]) await api.saveClosing(ws, {...c, store:storeMap[c.store]});
  // continue receipt numbers after the highest imported one
  for (const sid of new Set(Object.values(storeMap))) {
    const st = db.stores.find(x => x.id===sid);
    const top = Math.max(0, ...rows.filter(r => r.store_id===sid).map(r => +(r.receipt_no.split('-').pop()) || 0));
    if (top > st.seq) await api.updateStore(sid, {seq:top});
  }
  if (d.settings) {
    const {currency, locale, lowStock, float} = d.settings;
    await api.saveSettings(ws, {...db.settings, ...(currency ? {currency} : {}), ...(locale ? {locale} : {}), ...(lowStock!=null ? {lowStock} : {}), ...(float!=null ? {float} : {})});
  }
  return rows.length;
}
