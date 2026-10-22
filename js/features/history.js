/* Transaction history list and the receipt sheet (void a sale, mark pay-later as paid). */

function filteredHist(){
  const q = state.histQ.trim().toLowerCase();
  return daySales(state.histDate, true).filter(s =>
    (state.histM==='all' || state.histM===s.method || (state.histM==='late'&&s.late) || (state.histM==='void'&&s.voided)) &&
    (!q || s.id.toLowerCase().includes(q) || (s.customer||'').toLowerCase().includes(q) || s.items.some(i=>i.name.toLowerCase().includes(q)))
  ).reverse();
}
function histRows(){
  if (state.histLoading) return `<div class="empty" style="padding:28px">Loading sales for ${fmtDate(state.histDate)}…</div>`;
  const rows = filteredHist(), valid = rows.filter(s=>!s.voided);
  if (!rows.length) return `<div class="empty" style="padding:28px">No transactions match. Try another date or clear the search.</div>`;
  return `<div class="tbl-wrap"><table><thead><tr><th>Receipt</th><th>Time</th><th>Items</th><th>Payment</th><th class="amt">Total</th></tr></thead><tbody>
    ${rows.map(s=>`<tr data-act="open" data-id="${s.id}" class="${s.voided?'voided':''}">
      <td class="mono">${s.id}</td><td>${fmtTime(s.ts)}</td>
      <td>${esc(s.items.map(i=>i.name).join(', '))} ${s.late?'<span class="pill p-late">Late</span>':''} ${s.voided?'<span class="pill p-void">Void</span>':''}</td>
      <td><span class="pill ${pillFor(s.method)}">${esc(method(s.method).name)}</span>${s.customer?`<div class="muted" style="font-size:12px">${esc(s.customer)}</div>`:''}</td>
      <td class="amt">${money(s.total)}</td></tr>`).join('')}
  </tbody></table></div>
  <div class="sumrow"><span>${valid.length} valid of ${rows.length} shown</span><strong class="mono">${money(valid.reduce((a,x)=>a+x.total,0))}</strong></div>`;
}
function viewHistory(){
  const opts = [['all','All'], ...db.methods.map(m=>[m.id, m.name]), ['late','Late entries'], ['void','Voided']];
  return `<div class="sec-head"><h2>Transaction history</h2><span class="muted" style="font-size:14px">Tap a row to see the full receipt</span></div>
  <div class="filters">
    <label class="field">Date<input type="date" id="hDate" value="${state.histDate}" max="${todayKey()}"></label>
    <label class="field q">Search<input id="hQ" placeholder="Receipt no., item, or customer" value="${esc(state.histQ)}"></label>
    <label class="field">Show<select id="hM">${opts.map(([k,v])=>`<option value="${esc(k)}" ${state.histM===k?'selected':''}>${esc(v)}</option>`).join('')}</select></label>
  </div>
  <div class="card" id="hList">${histRows()}</div>`;
}

function sheet(){
  const s = db.sales.find(x=>x.id===state.openId); if (!s) return '';
  const owner = isOwner(), credit = kindOf(s.method)==='credit';
  return `<div class="overlay" data-act="closeSheet"><div class="card sheet" role="dialog" aria-label="Receipt ${s.id}" data-stop>
    <div class="cart-head"><h2 class="mono" style="font-size:20px">${s.id}</h2><button class="btn ghost" data-act="closeSheet">Close</button></div>
    <div class="receipt">
      ${s.items.map(i=>`<div class="r"><span>${esc(i.name)} × ${fmtQty(i.qty,i.unit)}</span><span>${money(i.price*i.qty)}</span></div>`).join('')}
      <div class="r tot"><span>TOTAL</span><span>${money(s.total)}</span></div>
      ${s.tendered?`<div class="r"><span>Cash</span><span>${money(s.tendered)}</span></div><div class="r"><span>Change</span><span>${money(s.tendered-s.total)}</span></div>`:''}
    </div>
    <dl class="meta">
      <dt>Sale time</dt><dd>${fmtDate(dayKey(s.ts))}, ${fmtTime(s.ts)}</dd>
      ${s.late?`<dt>Recorded at</dt><dd>${fmtTime(s.recordedTs)} <span class="pill p-late">Late entry</span></dd>`:''}
      <dt>Payment</dt><dd>${esc(method(s.method).name)}${s.gref?' · ref '+esc(s.gref):''}${s.customer?' · '+esc(s.customer):''} ${credit?(s.paidTs?'<span class="pill p-paid">Paid</span>':'<span class="pill p-utang">Unpaid</span>'):''}</dd>
      <dt>Recorded by</dt><dd>${esc(s.by)}</dd>
      ${s.voided?`<dt>Voided</dt><dd>${esc(s.voided.reason)} · ${esc(s.voided.by)}, ${fmtTime(s.voided.ts)}</dd>`:''}
    </dl>
    ${s.voided?'':(owner?`
      ${state.voidMode?`<label class="field">Reason for voiding<input id="voidReason" placeholder="e.g. Customer returned item" value="${esc(state.voidReason)}"></label>
        <div class="actions"><button class="btn danger" data-act="confirmVoid" ${state.voidReason.trim()?'':'disabled'} id="cvBtn">Void ${s.id}</button><button class="btn" data-act="cancelVoid">Keep sale</button></div>`
      :`<div class="actions">${credit&&!s.paidTs?`<button class="btn primary" data-act="paid">Mark as paid</button>`:''}<button class="btn" data-act="voidMode">Void this sale</button></div>`}`
      :`<div class="lock">Only the owner can void a sale or mark it as paid. The record stays in history either way.</div>`)}
  </div></div>`;
}

/* ---------- actions ---------- */
/* Days older than the first load are fetched when picked */
async function pickHistDate(key){
  state.histDate = key || todayKey();
  if (state.histDate < db.loadedFrom && !db.fetchedDays.includes(state.histDate)) {
    state.histLoading = true; $('#hList').innerHTML = histRows();
    await attempt(async () => {
      const day = await api.salesForDay(db.workspace.id, state.histDate);
      const have = new Set(db.sales.map(s => s.uuid));
      db.sales.push(...day.filter(s => !have.has(s.uuid))); db.sales.sort((a,b) => a.ts-b.ts);
      db.fetchedDays.push(state.histDate);
    });
    state.histLoading = false;
  }
  $('#hList').innerHTML = histRows();
}
const openSale = id => db.sales.find(x => x.id===id);
function replaceSale(s){ const i = db.sales.findIndex(x => x.uuid===s.uuid); if (i >= 0) db.sales[i] = s; }

async function confirmVoid(btn){
  const s = openSale(state.openId), reason = state.voidReason.trim();
  let saved;
  if (!await attempt(async () => { saved = await api.voidSale(s.uuid, reason, me.name); }, {btn})) return false;
  replaceSale(saved);
  s.items.forEach(it => { const p = it.pid && (db.products[s.store]||[]).find(x => x.id===it.pid); if (p && p.stock!=null) p.stock = r2(p.stock + it.qty); });
  state.voidMode = false; toast(s.id + ' voided. It stays in history.');
}
async function markPaid(btn){
  const s = openSale(state.openId);
  let saved;
  if (!await attempt(async () => { saved = await api.markPaid(s.uuid); }, {btn})) return false;
  replaceSale(saved); toast((s.customer || s.id) + ' marked as paid');
}
