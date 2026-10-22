/* Products: list, add / edit form, hide, duplicate, delete with undo. One list per business tab. */

function viewProducts(){
  const list = products(), tracked = list.filter(p=>p.stock!=null), cats = categories();
  const low = tracked.filter(p=>stockState(p)==='low').length, out = tracked.filter(p=>stockState(p)==='out').length;
  const opts = [['all','All products'],['active','On Sell screen'],['hidden','Hidden'],['low','Low or out of stock'], ...cats.map(c=>['cat:'+c, 'Category: '+c])];
  return `<div class="sec-head"><h2>Products · ${esc(store().name)}</h2><button class="btn primary" data-act="newProduct">+ Add product</button></div>
  <div class="kpis" style="margin-top:0">
    <div class="card kpi"><div class="eyebrow">Products</div><div class="v">${list.length}</div></div>
    <div class="card kpi"><div class="eyebrow">On Sell screen</div><div class="v">${list.filter(p=>p.active!==false).length}</div></div>
    <div class="card kpi"><div class="eyebrow">Low stock</div><div class="v" style="color:${low?'var(--gold)':'inherit'}">${low}</div></div>
    <div class="card kpi"><div class="eyebrow">Out of stock</div><div class="v" style="color:${out?'var(--red)':'inherit'}">${out}</div></div>
  </div>
  <div class="filters f2">
    <label class="field q">Search<input id="pQ" placeholder="Name, category or SKU" value="${esc(state.prodQ)}"></label>
    <label class="field">Show<select id="pF">${opts.map(([k,v])=>`<option value="${esc(k)}" ${state.prodF===k?'selected':''}>${esc(v)}</option>`).join('')}</select></label>
  </div>
  <div class="card" id="pList">${prodRows()}</div>
  <p class="notice">Stock goes down automatically when a sale is recorded, and back up when a sale is voided. Leave stock blank for items you don't count. Each business has its own product list. Switch businesses with the tabs at the top.</p>`;
}
function prodRows(){
  const q = state.prodQ.trim().toLowerCase(), f = state.prodF;
  const rows = products().filter(p => (!q || [p.name, p.category, p.sku].some(v => (v||'').toLowerCase().includes(q))) &&
    (f==='all' || (f==='active' && p.active!==false) || (f==='hidden' && p.active===false) || (f==='low' && ['low','out'].includes(stockState(p))) || f==='cat:'+p.category));
  if (!products().length) return `<div class="empty" style="padding:32px 16px;display:grid;gap:12px;justify-items:center"><strong style="color:var(--ink);font-size:16px">${esc(store().name)} has no products yet</strong><span>Add what this business sells: name, price, and how it's sold (per piece, kg, hour…).</span><button class="btn primary" data-act="newProduct">+ Add the first product</button></div>`;
  if (!rows.length) return `<div class="empty" style="padding:28px">No products match.</div>`;
  return `<div class="tbl-wrap"><table class="rtable"><thead><tr><th>Product</th><th class="amt">Price</th><th>Stock</th><th>Status</th><th></th></tr></thead><tbody>
    ${rows.map(p=>{ const st = stockState(p), hidden = p.active===false; return `<tr class="${hidden?'dim':''}">
      <td class="main"><strong>${esc(p.name)}</strong>${p.category||p.sku?`<small class="muted" style="display:block;font-size:12px">${[p.category, p.sku && 'SKU '+p.sku].filter(Boolean).map(esc).join(' · ')}</small>`:''}</td>
      <td class="amt" data-label="Price">${money(p.price)} <span class="muted" style="font-family:var(--f-body)">/ ${esc(p.unit)}</span></td>
      <td data-label="Stock">${p.stock==null?'<span class="muted">Not tracked</span>':`<span class="mono">${fmtQty(p.stock,p.unit)}</span> ${st==='out'?'<span class="pill p-void">Out</span>':st==='low'?'<span class="pill p-late">Low</span>':''}`}</td>
      <td data-label="Status">${hidden?'<span class="pill p-paid">Hidden</span>':'<span class="pill p-cash">On sale</span>'}</td>
      <td class="act"><button class="btn sm" data-act="editProduct" data-id="${p.id}">Edit</button><button class="btn sm" data-act="toggleProduct" data-id="${p.id}">${hidden?'Show':'Hide'}</button><button class="btn sm" data-act="delProductRow" data-id="${p.id}" data-confirm="Confirm delete">Delete</button></td>
    </tr>`}).join('')}
  </tbody></table></div>`;
}
function productModal(){
  const p = state.modal.id ? findProduct(state.modal.id) : null, step = p ? p.step : 1;
  const units = [...new Set([...UNITS, ...products().map(x=>x.unit)])];
  return `<form id="productForm" class="card sheet" data-stop role="dialog" aria-label="${p?'Edit product':'Add product'}" novalidate>
    <div class="cart-head"><h2>${p?'Edit product':'Add a product'}</h2><button type="button" class="btn ghost" data-act="closeModal">Close</button></div>
    <p class="note">${p?'Business':'Adding to'}: <strong>${esc(store().name)}</strong></p>
    ${p ? (st => `<div class="pstats"><div><span class="eyebrow">Sold · 30 days</span><b>${fmtQty(st.q,p.unit)}</b></div><div><span class="eyebrow">Revenue · 30 days</span><b>${money(st.v)}</b></div><div><span class="eyebrow">Last sold</span><b>${st.last?fmtDate(dayKey(st.last)):'Never'}</b></div></div>`)(productStats(p)) : ''}
    <label class="field">Product name<input id="pName" value="${p?esc(p.name):''}" maxlength="60" placeholder="e.g. Iced coffee, 16 oz"></label>
    <div class="row2">
      <label class="field"><span>Category <span class="hint">Optional</span></span><input id="pCat" list="catList" value="${p?esc(p.category||''):''}" maxlength="30" placeholder="e.g. Drinks"></label>
      <label class="field"><span>SKU or barcode <span class="hint">Optional</span></span><input id="pSku" value="${p?esc(p.sku||''):''}" maxlength="30" autocapitalize="characters"></label>
    </div>
    <datalist id="catList">${categories().map(c=>`<option value="${esc(c)}">`).join('')}</datalist>
    <div class="row2">
      <label class="field">Price (${esc(cfg().currency)})<input id="pPrice" type="text" inputmode="decimal" data-num="2" autocomplete="off" value="${p?p.price:''}" placeholder="0.00"></label>
      <label class="field"><span>Sold per <span class="hint">pc, kg, hour…</span></span><input id="pUnit" list="unitList" value="${esc(p ? p.unit : 'pc')}" maxlength="12"></label>
    </div>
    <datalist id="unitList">${units.map(u=>`<option value="${esc(u)}">`).join('')}</datalist>
    <label class="field">Quantity can be sold in<select id="pStep">${STEPS.map(([v,l])=>`<option value="${v}" ${v===step?'selected':''}>${l}</option>`).join('')}</select></label>
    <label class="field"><span>Stock on hand <span class="hint">Leave blank if you don't count it</span></span><input id="pStock" type="text" inputmode="decimal" data-num="2" autocomplete="off" value="${p&&p.stock!=null?p.stock:''}" placeholder="Not tracked"></label>
    <div class="qadj" aria-label="Adjust stock">${[-10,-1,1,10].map(v=>`<button type="button" class="btn" data-act="stockAdj" data-v="${v}">${v>0?'+':'−'}${Math.abs(v)}</button>`).join('')}<span class="muted" style="font-size:12px;align-self:center">Quick adjust, e.g. for new deliveries</span></div>
    <label class="check"><input type="checkbox" id="pActive" ${!p||p.active!==false?'checked':''}><span>Show on the Sell screen</span></label>
    <p class="err" id="mErr" role="alert"></p>
    <div class="actions"><button class="btn primary" type="submit">${p?'Save changes':'Add product'}</button>${p?`<button type="button" class="btn" data-act="dupProduct">Duplicate</button><button type="button" class="btn" data-act="delProduct" data-confirm="Tap again to delete">Delete product</button>`:''}</div>
  </form>`;
}
function productStats(p){
  const since = Date.now() - 30*864e5; let q = 0, v = 0, last = 0;
  db.sales.forEach(s => { if (s.store!==state.store || s.voided) return;
    s.items.forEach(it => { if (it.pid!==p.id) return; if (s.ts>=since) { q += it.qty; v += it.price*it.qty; } if (s.ts>last) last = s.ts; }); });
  return {q:r2(q), v:r2(v), last};
}

/* ---------- actions (each one saves to Supabase first, then updates the screen) ---------- */
async function saveProduct(e){
  const p = state.modal.id ? findProduct(state.modal.id) : null, errEl = $('#mErr'), err = m => { errEl.textContent = m; return false; };
  const name = $('#pName').value.trim(), price = num($('#pPrice').value), unit = $('#pUnit').value.trim().toLowerCase(), sv = $('#pStock').value.trim();
  const sku = $('#pSku').value.trim(), category = $('#pCat').value.trim();
  if (!name) return err('Enter a product name.');
  if (products().some(x => x.name.toLowerCase()===name.toLowerCase() && x!==p)) return err('A product with that name already exists in this business.');
  if (sku && products().some(x => (x.sku||'').toLowerCase()===sku.toLowerCase() && x!==p)) return err('Another product already uses that SKU.');
  if (!(price > 0)) return err('Enter a price above ' + money0(0) + '.');
  if (!unit) return err('Enter what the product is sold per, such as pc or kg.');
  if (sv!=='' && !(num(sv) >= 0)) return err('Stock can’t be negative.');
  const data = {name, category, sku, price:r2(price), unit, step:+$('#pStep').value, stock: sv==='' ? null : r2(num(sv)), active: $('#pActive').checked};
  const ok = await attempt(async () => {
    if (p) {
      Object.assign(p, await api.updateProduct(p.id, data));
      state.cart.forEach(l => { if (l.pid===p.id) Object.assign(l, {name, price:data.price, unit, step:data.step}); });
    } else products().push(...await api.addProducts(db.workspace.id, state.store, [data]));
  }, {btn:e.submitter, errEl});
  if (!ok) return false;
  state.modal = null; toast(p ? 'Saved changes to ' + name : name + ' added');
}

async function toggleProduct(el){
  const p = findProduct(el.dataset.id), active = p.active===false;
  if (!await attempt(async () => Object.assign(p, await api.updateProduct(p.id, {...p, active})), {btn:el, label:'…'})) return false;
  toast(p.name + (active ? ' is back on the Sell screen' : ' hidden from the Sell screen'));
}

async function duplicateProduct(el){
  const p = findProduct(state.modal.id), list = products();
  let n = p.name + ' (copy)', k = 2; while (list.some(x => x.name.toLowerCase()===n.toLowerCase())) n = p.name + ' (copy ' + k++ + ')';
  let copy;
  if (!await attempt(async () => { [copy] = await api.addProducts(db.workspace.id, state.store, [{...p, id:null, created_at:null, name:n, sku:''}]); }, {btn:el, errEl:$('#mErr')})) return false;
  list.push(copy); state.modal = {type:'product', id:copy.id}; toast('Copy created. Change what you need and save.');
}

/* Deletes, then offers Undo for 6 seconds (puts the same product back with the same id) */
async function deleteProduct(id, btn){
  const sid = state.store, list = db.products[sid], p = list.find(x => x.id===id);
  if (!await attempt(() => api.deleteProduct(id), {btn, errEl:$('#mErr'), label:'Deleting…'})) return false;
  list.splice(list.indexOf(p), 1); state.cart = state.cart.filter(l => l.pid!==id); state.modal = null;
  toast(p.name + ' deleted', async () => {
    if (!await attempt(async () => { const [back] = await api.addProducts(db.workspace.id, sid, [p]); (db.products[sid] ||= []).push(back); })) return;
    db.products[sid].sort((a,b) => (a.created_at||'') < (b.created_at||'') ? -1 : 1);
    toast(p.name + ' restored'); rerender();
  });
}
