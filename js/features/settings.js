/* Settings (owners only): business details, businesses (tabs), payment methods, data tools. */

function viewSettings(){
  const c = cfg(), used = id => db.sales.some(s=>s.method===id);
  return `<div class="sec-head"><h2>Settings</h2><span class="muted" style="font-size:14px">Set the app up for your kind of business</span></div>
  <div class="settings">
    <form id="bizForm" class="card panel set-card" novalidate>
      <h3>Business</h3>
      <label class="field">Business name<input id="bName" value="${esc(c.business)}" maxlength="40"></label>
      <div class="row2">
        <label class="field">Currency symbol<input id="bCur" value="${esc(c.currency)}" maxlength="4" placeholder="e.g. $, €, ₱"></label>
        <label class="field">Number & date format<select id="bLoc">${LOCALES.map(([k,v])=>`<option value="${k}" ${k===c.locale?'selected':''}>${v}</option>`).join('')}</select></label>
      </div>
      <div class="row2">
        <label class="field"><span>Low-stock alert <span class="hint">at or below</span></span><input id="bLow" type="text" inputmode="decimal" data-num="2" autocomplete="off" value="${esc(c.lowStock)}"></label>
        <label class="field"><span>Starting cash <span class="hint">default for Close the day</span></span><input id="bFloat" type="text" inputmode="decimal" data-num="2" autocomplete="off" value="${esc(c.float)}"></label>
      </div>
      <p class="note">Preview: ${esc(money(1234.5))} · ${fmtDate(todayKey())}, ${fmtTime(Date.now())}</p>
      <p class="err" id="bErr" role="alert"></p>
      <div><button class="btn primary" type="submit">Save business details</button></div>
    </form>

    <div class="card panel set-card">
      <div class="sec-head" style="margin:0"><h3 style="margin:0">Businesses</h3><button class="btn sm" data-act="newStore">+ Add business</button></div>
      <p class="muted" style="margin:0;font-size:14px">Each business has its own tab at the top, with its own products, receipts and cash drawer. The receipt prefix starts every receipt number.</p>
      <ul class="set-list">${db.stores.map(s=>{ const n = db.sales.filter(x=>x.store===s.id).length; return `
        <li><div><strong>${esc(s.name)}</strong><small>Receipts ${esc(s.prefix)}-0001 · ${(db.products[s.id]||[]).length} products · ${n} sales</small></div>
          <button class="btn sm" data-act="editStore" data-id="${s.id}">Edit</button></li>`}).join('')}</ul>
    </div>

    <div class="card panel set-card">
      <div class="sec-head" style="margin:0"><h3 style="margin:0">Payment methods</h3><button class="btn sm" data-act="newMethod">+ Add method</button></div>
      <p class="muted" style="margin:0;font-size:14px">The type decides what the Sell screen asks for: change for cash, a reference no. for digital, a customer name for pay later.</p>
      <ul class="set-list">${db.methods.map(m=>`
        <li class="${m.active===false?'dim':''}"><div><strong>${esc(m.name)}</strong> <span class="pill ${KINDS[m.kind].pill}">${KINDS[m.kind].label}</span>${m.active===false?' <span class="pill p-paid">Off</span>':''}<small>${used(m.id)?'Used in past sales':'Not used yet'}</small></div>
          <button class="btn sm" data-act="editMethod" data-id="${m.id}">Edit</button></li>`).join('')}</ul>
    </div>

    <div class="card panel set-card">
      <h3>Data</h3>
      <p class="muted" style="margin:0;font-size:14px">Everything is saved in your Firebase database and synced to every signed-in device. A backup file is a copy you keep yourself. Restoring adds a backup’s data to this shop, including backups from the old browser-only version.</p>
      <div class="actions">
        <button class="btn" data-act="export">Download backup</button>
        <button class="btn" data-act="import">Restore from backup</button>
        <input type="file" id="importFile" accept="application/json,.json" hidden>
      </div>
      <div class="actions">
        ${db.sales.length
          ? `<button class="btn ${state.resetArm?'danger':''}" data-act="reset">${state.resetArm?'Tap again to delete every sale':'Delete all sales and closings'}</button>`
          : `<button class="btn ${state.resetArm?'primary':''}" data-act="reset">${state.resetArm?'Tap again to add sample sales':'Add sample sales to try things out'}</button>`}
      </div>
      <p class="muted" style="margin:0;font-size:13px">${db.sales.length ? 'Deleting removes sales and closings for every business, for everyone. Businesses, products, payment methods and users stay.' : 'Makes 14 days of made-up sales from your products, so you can explore the reports. Delete them later with the same button.'}</p>
    </div>
  </div>`;
}
function storeModal(){
  const s = state.modal.id ? db.stores.find(x=>x.id===state.modal.id) : null;
  return `<form id="storeForm" class="card sheet" data-stop role="dialog" aria-label="${s?'Edit store':'Add store'}" novalidate>
    <div class="cart-head"><h2>${s?'Edit business':'Add a business'}</h2><button type="button" class="btn ghost" data-act="closeModal">Close</button></div>
    ${s?'':'<p class="muted" style="margin:0;font-size:14px">It gets its own tab at the top, with its own products, receipts, daily sales and cash drawer. Everything else works the same.</p>'}
    <label class="field">Business name<input id="stName" value="${s?esc(s.name):''}" maxlength="30" placeholder="e.g. Coffee shop, Hardware, Salon"></label>
    <label class="field"><span>Receipt prefix <span class="hint">${s?'2–4 letters or numbers':'Optional. Made from the name if left blank'}</span></span><input id="stPrefix" value="${s?esc(s.prefix):''}" maxlength="4" autocapitalize="characters" placeholder="e.g. CS"></label>
    ${!s && db.stores.length ? `<label class="field">Products<select id="stCopy"><option value="">Start empty. I'll add my own products</option>${db.stores.map(x=>`<option value="${x.id}">Copy products from ${esc(x.name)}</option>`).join('')}</select></label>` : ''}
    <p class="err" id="mErr" role="alert"></p>
    <div class="actions"><button class="btn primary" type="submit">${s?'Save changes':'Create business'}</button>${s?`<button type="button" class="btn" data-act="delStore" data-confirm="Tap again to delete">Delete business</button>`:''}</div>
  </form>`;
}
function methodModal(){
  const m = state.modal.id ? db.methods.find(x=>x.id===state.modal.id) : null, kind = m ? m.kind : 'digital';
  return `<form id="methodForm" class="card sheet" data-stop role="dialog" aria-label="${m?'Edit payment method':'Add payment method'}" novalidate>
    <div class="cart-head"><h2>${m?'Edit payment method':'Add a payment method'}</h2><button type="button" class="btn ghost" data-act="closeModal">Close</button></div>
    <label class="field">Name shown to staff<input id="mName" value="${m?esc(m.name):''}" maxlength="24" placeholder="e.g. Bank transfer"></label>
    <fieldset class="kinds"><legend class="eyebrow">Type</legend>
      ${Object.entries(KINDS).map(([k,v])=>`<label class="check"><input type="radio" name="mKind" value="${k}" ${k===kind?'checked':''}><span><strong>${v.label}</strong><br><span class="muted" style="font-size:13px">${v.help}</span></span></label>`).join('')}
    </fieldset>
    <label class="check"><input type="checkbox" id="mActive" ${!m||m.active!==false?'checked':''}><span>Show on the Sell screen</span></label>
    <p class="err" id="mErr" role="alert"></p>
    <div class="actions"><button class="btn primary" type="submit">${m?'Save changes':'Add method'}</button>${m?`<button type="button" class="btn" data-act="delMethod" data-confirm="Tap again to delete">Delete</button>`:''}</div>
  </form>`;
}

/* ---------- actions ---------- */
async function saveBiz(e){
  const errEl = $('#bErr'), err = m => { errEl.textContent = m; return false; };
  const business = $('#bName').value.trim(), currency = $('#bCur').value.trim(), low = $('#bLow').value, fl = $('#bFloat').value;
  if (!business) return err('Enter the business name.');
  if (!currency) return err('Enter a currency symbol.');
  const settings = {...db.settings, business, currency, locale: $('#bLoc').value, lowStock: low==='' ? 0 : Math.max(0, num(low)||0), float: fl==='' ? 0 : Math.max(0, num(fl)||0)};
  if (!await attempt(() => api.saveSettings(db.workspace.id, settings), {btn:e.submitter, errEl})) return false;
  db.settings = settings; db.workspace.name = business; state.float = fmtNum(settings.float);
  toast('Business details saved');
}

async function saveStore(e){
  const s = state.modal.id ? db.stores.find(x=>x.id===state.modal.id) : null, errEl = $('#mErr'), err = m => { errEl.textContent = m; return false; };
  const name = $('#stName').value.trim();
  if (!name) return err('Enter a business name.');
  const prefix = $('#stPrefix').value.trim().toUpperCase() || (s ? s.prefix : autoPrefix(name));
  if (!/^[A-Z0-9]{2,4}$/.test(prefix)) return err('The receipt prefix must be 2–4 letters or numbers.');
  if (db.stores.some(x => x.prefix===prefix && x!==s)) return err('Another business already uses that prefix.');
  const from = !s && $('#stCopy') ? $('#stCopy').value : '';
  let created;
  const ok = await attempt(async () => {
    if (s) { await api.updateStore(s.id, {name, prefix}); Object.assign(s, {name, prefix}); return; }
    created = await api.addStore(db.workspace.id, name, prefix);
    db.stores.push(created);
    db.products[created.id] = from ? await api.addProducts(db.workspace.id, created.id, db.products[from].map(p => ({...p, id:null, created_at:null, stock: p.stock==null ? null : 0}))) : [];
  }, {btn:e.submitter, errEl});
  if (!ok) return false;
  if (created) Object.assign(state, {store:created.id, cart:[], lastId:null, dashDate:null, cat:'all', sellQ:'', prodQ:'', prodF:'all', view: db.products[created.id].length ? 'sell' : 'products'});
  state.modal = null;
  toast(s ? 'Saved ' + name : name + ' created' + (db.products[state.store].length ? '' : '. Add its products here.'));
}

async function deleteStore(el){
  const s = db.stores.find(x=>x.id===state.modal.id), errEl = $('#mErr');
  if (db.stores.length<=1) { errEl.textContent = 'You need at least one business.'; return false; }
  if (db.sales.some(x=>x.store===s.id)) { errEl.textContent = 'This business has recorded sales, so it can’t be deleted. Rename it instead.'; return false; }
  if (!arm(el)) return false;
  if (!await attempt(() => api.deleteStore(s.id), {btn:el, errEl})) return false;
  db.stores = db.stores.filter(x=>x!==s); delete db.products[s.id]; state.modal = null; toast(s.name + ' deleted');
}

async function saveMethod(e){
  const m = state.modal.id ? db.methods.find(x=>x.id===state.modal.id) : null, errEl = $('#mErr'), err = t => { errEl.textContent = t; return false; };
  const name = $('#mName').value.trim(), kind = (document.querySelector('input[name=mKind]:checked')||{}).value, active = $('#mActive').checked;
  if (!name) return err('Enter a name.');
  if (db.methods.some(x => x.name.toLowerCase()===name.toLowerCase() && x!==m)) return err('A payment method with that name already exists.');
  if (!active && !db.methods.some(x => x!==m && x.active!==false)) return err('Keep at least one payment method turned on.');
  if (m && m.kind!==kind && db.sales.some(s=>s.method===m.id)) return err('This method is used in past sales, so its type can’t change. Add a new method instead.');
  const ok = await attempt(async () => {
    if (m) { await api.updateMethod(m.id, {name, kind, active}); Object.assign(m, {name, kind, active}); }
    else db.methods.push(await api.addMethod(db.workspace.id, {name, kind, active}));
  }, {btn:e.submitter, errEl});
  if (!ok) return false;
  state.modal = null; toast(m ? 'Saved ' + name : name + ' added');
}

async function deleteMethod(el){
  const m = db.methods.find(x=>x.id===state.modal.id), errEl = $('#mErr');
  if (db.sales.some(x=>x.method===m.id)) { errEl.textContent = 'This method is used in past sales. Turn it off instead so old receipts still show it.'; return false; }
  if (!db.methods.some(x=>x!==m && x.active!==false)) { errEl.textContent = 'Keep at least one payment method turned on.'; return false; }
  if (!arm(el)) return false;
  if (!await attempt(() => api.deleteMethod(m.id), {btn:el, errEl})) return false;
  db.methods = db.methods.filter(x=>x!==m); state.modal = null; toast(m.name + ' deleted');
}

/* Settings → Data: sample sales when there are none, otherwise delete every sale (two taps either way) */
async function resetSales(el){
  if (!state.resetArm) { state.resetArm = true; return; }
  state.resetArm = false;
  const adding = !db.sales.length;
  let n = 0;
  const ok = await attempt(async () => { if (adding) n = await addSampleSales(); else await api.clearSales(db.workspace.id); }, {btn:el, label: adding ? 'Adding…' : 'Deleting…'});
  if (!ok) return;
  await reloadShop();
  Object.assign(state, {cart:[], lastId:null, dashDate:null, openId:null});
  toast(adding ? n + ' sample sales added' : 'All sales deleted');
}

async function downloadBackup(el){
  if (await attempt(exportData, {btn:el, label:'Preparing…'})) toast('Backup downloaded');
  return false;
}
async function restoreBackup(file){
  let n = 0;
  if (!await attempt(async () => { n = await importBackup(file); })) return;
  await reloadShop(); toast('Backup restored · ' + n + ' sales checked'); rerender();
}
