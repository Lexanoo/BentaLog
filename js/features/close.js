/* Close the day: count the cash drawer against recorded cash sales. */

function viewClose(){
  const key = todayKey(), sales = daySales(key), total = r2(sales.reduce((a,x)=>a+x.total,0)), cash = cashOf(sales);
  const closings = db.closings.filter(c=>c.store===state.store).slice(-5).reverse();
  const others = db.methods.filter(m => m.kind!=='cash' && (m.active!==false || sales.some(s=>s.method===m.id)));
  return `<div class="sec-head"><h2>Close the day · ${fmtDate(key)}</h2><span class="muted" style="font-size:14px">Count the cash drawer and compare it with what was recorded</span></div>
  <div class="close">
    <div class="card panel">
      <div class="recon">
        <div class="r"><span>Transactions recorded</span><span>${sales.length}</span></div>
        <div class="r"><span>Total sales</span><span>${money(total)}</span></div>
        ${others.map(m=>`<div class="r"><span>${esc(m.name)}${m.kind==='credit'?' (to collect)':''}</span><span>${money(sumBy(sales, s=>s.method===m.id))}</span></div>`).join('')}
        <div class="r"><span>Cash sales</span><span>${money(cash)}</span></div>
      </div>
      <div class="row2" style="margin-top:16px">
        <label class="field">Starting cash in drawer<input id="float" type="text" inputmode="decimal" data-num="2" autocomplete="off" value="${esc(state.float)}"></label>
        <label class="field">Cash counted in drawer<input id="counted" type="text" inputmode="decimal" data-num="2" autocomplete="off" placeholder="0.00" value="${esc(state.counted)}"></label>
      </div>
    </div>
    <div class="card panel" style="display:grid;gap:12px;align-content:start" id="closeOut">${closeOut(cash)}</div>
  </div>
  <div class="card panel" style="margin-top:16px"><h3>Previous closings</h3>
    ${closings.length?`<div class="tbl-wrap"><table style="min-width:480px"><thead><tr><th>Date</th><th class="amt">Expected</th><th class="amt">Counted</th><th class="amt">Difference</th></tr></thead><tbody>
    ${closings.map(c=>`<tr style="cursor:default"><td>${fmtDate(c.date)}</td><td class="amt">${money(c.expected)}</td><td class="amt">${money(c.counted)}</td><td class="amt" style="color:${c.diff<0?'var(--red)':'inherit'}">${c.diff>0?'+':c.diff<0?'−':''}${money(Math.abs(c.diff))}</td></tr>`).join('')}</tbody></table></div>`
    :'<p class="muted" style="margin:0">No closings saved yet. Save one at the end of each business day.</p>'}
  </div>`;
}
function closeOut(cash){
  if (cash===undefined) cash = cashOf(daySales(todayKey()));
  const expected = r2((num(state.float)||0) + cash), counted = state.counted===''?null:(num(state.counted)||0), diff = counted===null?null:r2(counted-expected);
  let verdict = `<div class="verdict" style="background:var(--sunk)">Enter the cash you counted to check it against the records.</div>`;
  if (diff!==null) verdict = diff===0 ? `<div class="verdict v-ok"><strong>Balanced.</strong> The drawer matches the recorded cash sales.</div>`
    : diff<0 ? `<div class="verdict v-short"><strong>Short by ${money(-diff)}.</strong> Check for change given by mistake, or cash taken out for expenses.</div>`
    : `<div class="verdict v-over"><strong>Over by ${money(diff)}.</strong> A cash sale was probably not recorded. Add it as a late entry so today's total is correct.
       <div style="margin-top:8px"><button class="btn" data-act="lateOn">Add a late entry</button></div></div>`;
  return `<div class="recon"><div class="r"><span>Starting cash</span><span>${money(num(state.float)||0)}</span></div>
    <div class="r"><span>+ Cash sales</span><span>${money(cash)}</span></div>
    <div class="r big"><span>Expected in drawer</span><span>${money(expected)}</span></div>
    <div class="r"><span>Counted</span><span>${counted===null?'—':money(counted)}</span></div></div>
    ${verdict}
    ${isOwner()?`<button class="btn primary" data-act="saveClose" ${counted===null?'disabled':''}>Save closing for today</button>`:`<div class="lock">Only the owner can save the day's closing.</div>`}`;
}

/* ---------- actions ---------- */
async function saveClosing(btn){
  const cash = cashOf(daySales(todayKey())), exp = r2((num(state.float)||0) + cash), cnt = num(state.counted)||0;
  let saved;
  const ok = await attempt(async () => {
    saved = await api.saveClosing(db.workspace.id, {store:state.store, date:todayKey(), expected:exp, counted:cnt, diff:r2(cnt-exp), by:me.name});
  }, {btn});
  if (!ok) return false;
  db.closings = db.closings.filter(c => !(c.store===state.store && c.date===todayKey())).concat(saved);
  toast('Closing saved for ' + fmtDate(todayKey()));
}
