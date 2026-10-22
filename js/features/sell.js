/* Sell screen: product grid, cart, payment and recording a sale. */

function nudge(){
  const now = new Date(), h = now.getHours();
  if (h < 8 || h >= 20) return '';
  const last = daySales(todayKey(), true).at(-1);
  const since = last ? (Date.now() - last.ts)/60000 : (h-7)*60;
  if (since < 60) return '';
  return `<div class="nudge"><p><strong>${last?`No sale recorded since ${fmtTime(last.ts)}.`:'No sales recorded yet today.'}</strong> If you served a customer and forgot to log it, add it now as a late entry.</p>
    <button class="btn" data-act="lateOn">Add a late entry</button></div>`;
}

function sellGrid(){
  const q = state.sellQ.trim().toLowerCase();
  const list = products().filter(p => p.active!==false && (state.cat==='all' || p.category===state.cat) &&
    (!q || p.name.toLowerCase().includes(q) || (p.sku||'').toLowerCase().includes(q) || (p.category||'').toLowerCase().includes(q)));
  if (!list.length) return `<div class="empty card" style="grid-column:1/-1">${products().some(p=>p.active!==false) ? 'No products match.' : 'No products on sale in ' + esc(store().name) + ' yet.' + (isOwner()?'<div style="margin-top:10px"><button class="btn primary" data-act="goProducts">+ Add products</button></div>':' Ask the owner to add some.')}</div>`;
  return list.map(p=>{ const st = stockState(p); return `
    <div class="tag-wrap${isOwner()?' own':''}"><button class="tag" data-act="add" data-id="${p.id}" ${st==='out'?'disabled':''}><span class="tag-price">${money0(p.price)}</span><span class="tag-name">${esc(p.name)}</span><span class="tag-unit">per ${esc(p.unit)}${st==='out'?' · <span class="low">Out of stock</span>':st?` · <span class="${st==='low'?'low':''}">${fmtQty(p.stock,p.unit)} left</span>`:''}</span></button>${isOwner()?`<button class="tag-edit" data-act="editProduct" data-id="${p.id}" aria-label="Edit ${esc(p.name)}" title="Edit product">${PENCIL}</button>`:''}</div>`}).join('');
}
function viewSell(){
  const total = cartTotal(), last = db.sales.find(s=>s.id===state.lastId), cats = categories(), m = method(state.method);
  return `<div class="sell">
  <section style="min-width:0">
    ${nudge()}
    <div class="sec-head"><h2>Tap an item to add it</h2><span class="muted" style="font-size:14px">${esc(store().name)}</span></div>
    ${products().length > 8 ? `<label class="field" style="margin-bottom:10px"><span class="sr">Find a product</span><input id="sellQ" type="search" placeholder="Search name, category or SKU" value="${esc(state.sellQ)}"></label>` : ''}
    ${cats.length > 1 ? `<div class="chips" style="margin-bottom:12px">${['all',...cats].map(c=>`<button class="chip" data-act="cat" data-v="${esc(c)}" aria-pressed="${state.cat===c}">${c==='all'?'All':esc(c)}</button>`).join('')}</div>` : ''}
    <div class="grid" id="sellGrid">${sellGrid()}</div>
    <form id="customForm" class="custom card">
      <label class="field">Other item<input id="cName" placeholder="e.g. Special order" maxlength="40"></label>
      <label class="field">Price (${esc(cfg().currency)})<input id="cPrice" type="text" inputmode="decimal" data-num="2" autocomplete="off" placeholder="0.00"></label>
      <button class="btn" type="submit">Add item</button>
    </form>
  </section>
  <aside class="cart card" aria-label="Current sale">
    <div class="cart-head"><h2>Current sale</h2><span class="mono muted" style="font-size:13px">${nextId()}</span></div>
    <div class="lines">${state.cart.length ? state.cart.map((l,i)=>`
      <div class="line">
        <div style="min-width:0"><div class="nm">${esc(l.name)}</div><div class="sub">${money(l.price)} per ${esc(l.unit)}</div></div>
        <div class="lt">${money(l.price*l.qty)}</div>
        <div class="step"><button data-act="dec" data-i="${i}" aria-label="Less">−</button><span>${fmtQty(l.qty,l.unit)}</span><button data-act="inc" data-i="${i}" aria-label="More">+</button></div>
        <button class="rm" data-act="rm" data-i="${i}">Remove</button>
      </div>`).join('') : `<div class="empty">No items yet. Tap a product to start a sale.</div>`}
    </div>
    <div class="total"><span class="eyebrow">Total</span><strong>${money(total)}</strong></div>
    <div><div class="eyebrow" style="margin-bottom:6px">Payment</div>
      ${methodsOn().length ? `<div class="chips">${methodsOn().map(x=>`<button class="chip" data-act="method" data-v="${x.id}" aria-pressed="${state.method===x.id}">${esc(x.name)}</button>`).join('')}</div>`
        : `<p class="err">No payment methods are turned on.${isOwner()?' Add one under Settings.':''}</p>`}
    </div>
    ${m.kind==='cash'?`<label class="field">Cash received<input id="tendered" type="text" inputmode="decimal" data-num="2" autocomplete="off" placeholder="Exact amount" value="${esc(state.tendered)}"></label>
      <div class="change"><span>Change</span><span class="mono" id="changeOut"></span></div>`:''}
    ${m.kind==='credit'?`<label class="field">Customer name<input id="customer" placeholder="Who will pay later?" value="${esc(state.customer)}" maxlength="40"></label>`:''}
    ${m.kind==='digital'?`<label class="field">${esc(m.name)} reference no. (optional)<input id="gref" placeholder="Reference or approval no." maxlength="30"></label>`:''}
    <label class="check"><input type="checkbox" id="lateChk" ${state.late?'checked':''}><span>This sale happened earlier and I forgot to record it</span></label>
    ${state.late?`<label class="field">Time the sale happened<input id="lateTime" type="time" value="${esc(state.lateTime)}"></label>`:''}
    <p class="err" id="err"></p>
    <button class="btn primary record" id="recordBtn" data-act="record">Record sale</button>
    ${last?`<div class="last">Saved <span class="mono">${last.id}</span> · ${money(last.total)} · ${esc(method(last.method).name)} · ${fmtTime(last.ts)}${last.late?' (late entry)':''}</div>`:''}
  </aside></div>`;
}

function checkoutErr(){
  const t = cartTotal(), k = kindOf(state.method);
  if (!state.cart.length || !state.method) return {msg:'', block:true};
  for (const l of state.cart) { const p = findProduct(l.pid);
    if (p && p.stock!=null && l.qty > p.stock) return {msg:`Only ${fmtQty(p.stock,p.unit)} of ${p.name} left in stock.`, block:true}; }
  if (k==='cash' && state.tendered!=='' && num(state.tendered) < t) return {msg:'Cash received is less than the total.', block:true};
  if (k==='credit' && !state.customer.trim()) return {msg:'Enter the customer’s name so this can be collected later.', block:true};
  if (state.late) {
    if (!state.lateTime) return {msg:'Enter the time the sale happened.', block:true};
    const ts = new Date(todayKey()+'T'+state.lateTime).getTime();
    if (ts > Date.now()) return {msg:'A late entry must be earlier than the current time.', block:true};
  }
  return {msg:'', block:false};
}
function updateCheckout(){
  const t = cartTotal(), c = $('#changeOut');
  if (c) c.textContent = state.tendered==='' ? '—' : money(Math.max(0, (num(state.tendered)||0) - t));
  const e = checkoutErr(); $('#err').textContent = e.msg;
  const b = $('#recordBtn'); b.disabled = e.block; b.textContent = state.cart.length ? 'Record sale · ' + money(t) : 'Record sale';
}

/* ---------- actions ---------- */
function addToCart(el){
  const p = findProduct(el.dataset.id), l = state.cart.find(x=>x.pid===p.id);
  if (l) l.qty = r2(l.qty + Math.max(1, p.step)); else state.cart.push({pid:p.id, name:p.name, price:p.price, unit:p.unit, step:p.step, qty:1});
}
function changeQty(el, dir){
  const i = +el.dataset.i, l = state.cart[i];
  l.qty = r2(l.qty + dir*l.step);
  if (l.qty <= 0) state.cart.splice(i, 1);
}
function addCustomItem(){
  const n = $('#cName').value.trim(), p = num($('#cPrice').value);
  if (!n || !(p>0)) { toast('Enter an item name and a price above ' + money0(0)); return false; }
  state.cart.push({pid:null, name:n, price:r2(p), unit:'pc', step:1, qty:1});
}

/* Saves the sale in Supabase. The database assigns the receipt number and takes the items out of stock. */
async function recordSale(btn){
  const e = checkoutErr(); if (e.block) { updateCheckout(); return false; }
  const total = cartTotal(), k = kindOf(state.method), cart = state.cart;
  const args = {
    store: state.store, method: state.method, byName: me.name,
    items: cart.map(({pid,name,price,qty,unit}) => ({pid, name, price, qty, unit})),
    tendered: k==='cash' ? (state.tendered==='' ? total : num(state.tendered)) : null,
    customer: k==='credit' ? state.customer.trim() : null,
    ref: k==='digital' && $('#gref') ? $('#gref').value.trim() : null,
    ts: state.late ? new Date(todayKey()+'T'+state.lateTime).getTime() : null, late: state.late,
  };
  let sale;
  const ok = await attempt(async () => { sale = await api.recordSale(args); }, {btn, errEl:$('#err')});
  if (!ok) return false;
  db.sales.push(sale); db.sales.sort((a,b) => a.ts-b.ts);
  cart.forEach(l => { const p = findProduct(l.pid); if (p && p.stock!=null) p.stock = r2(p.stock - l.qty); });
  const st = store(), n = +sale.id.split('-').pop(); if (n > (st.seq||0)) st.seq = n;
  Object.assign(state, {cart:[], tendered:'', customer:'', late:false, lateTime:'', method:(methodsOn()[0]||{}).id, lastId:sale.id});
  toast('Sale ' + sale.id + ' recorded · ' + money(total));
}
