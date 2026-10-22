/* Daily sales dashboard: totals, charts, payment mix, best sellers. */

function niceMax(v){ if (v<=0) return 100; const p = Math.pow(10, Math.floor(Math.log10(v))), m = v/p; return (m<=1?1:m<=2?2:m<=2.5?2.5:m<=5?5:10)*p; }
function barChart(labels, values, hi, every=1){
  const W=640,H=190,L=50,R=8,T=12,B=26, ih=H-T-B, max=niceMax(Math.max(...values)), cw=(W-L-R)/values.length;
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">`;
  [0,.5,1].forEach(f => { const y=T+ih*(1-f); s+=`<line class="grid" x1="${L}" x2="${W-R}" y1="${y}" y2="${y}"/><text class="axis" x="${L-8}" y="${y+4}" text-anchor="end">${esc(moneyShort(max*f))}</text>`; });
  values.forEach((v,i) => { const bh=ih*v/max, x=L+i*cw+cw*.16, w=cw*.68;
    s+=`<rect class="bar${i===hi?' hi':''}" x="${x}" y="${T+ih-bh}" width="${w}" height="${bh}" rx="3"><title>${labels[i]}: ${esc(money(v))}</title></rect>`;
    if (i%every===0) s+=`<text class="axis" x="${x+w/2}" y="${H-8}" text-anchor="middle">${labels[i]}</text>`; });
  return s + '</svg>';
}

function viewToday(){
  const tk = todayKey();
  let key = state.dashDate, fallback = false;
  if (!key) { key = tk; if (!daySales(tk).length) { const last = storeSales().filter(s=>!s.voided).at(-1); if (last) { key = dayKey(last.ts); fallback = true; } } }
  const sales = daySales(key), all = daySales(key, true);
  const total = r2(sales.reduce((s,x)=>s+x.total,0)), n = sales.length;
  const hours = [...Array(15)].map((_,i)=>i+6);
  const hv = hours.map(h => r2(sales.filter(s=>new Date(s.ts).getHours()===h).reduce((a,x)=>a+x.total,0)));
  const peak = hv.indexOf(Math.max(...hv));
  const days = [...Array(7)].map((_,i)=>shiftDay(key, i-6));
  const dv = days.map(d => r2(daySales(d).reduce((a,x)=>a+x.total,0)));
  const agg = {}; sales.forEach(s => s.items.forEach(it => { const a = agg[it.name] ||= {q:0,v:0,u:it.unit}; a.q+=it.qty; a.v+=it.price*it.qty; }));
  const top = Object.entries(agg).sort((a,b)=>b[1].v-a[1].v).slice(0,5);
  const late = all.filter(s=>s.late).length, voids = all.filter(s=>s.voided).length;
  const unpaid = storeSales().filter(s=>kindOf(s.method)==='credit' && !s.paidTs && !s.voided);
  const unpaidAmt = r2(unpaid.reduce((a,x)=>a+x.total,0));
  const shown = db.methods.filter(m => m.active!==false || sales.some(s=>s.method===m.id));
  const hl = h => (h%12||12) + (h<12?'a':'p');
  return `
  <div class="sec-head" style="margin-bottom:0">
    <div><div class="eyebrow">${esc(store().name)} · Daily sales</div>
      ${fallback?`<p class="notice">No sales recorded yet today. Showing the most recent day with sales.</p>`:''}</div>
    <div class="datebar">
      <button class="btn" data-act="dprev" aria-label="Previous day">‹</button>
      <span class="d">${key===tk?'Today, ':''}${fmtDate(key)}</span>
      <button class="btn" data-act="dnext" aria-label="Next day" ${key>=tk?'disabled':''}>›</button>
      ${key!==tk?`<button class="btn ghost" data-act="dtoday">Go to today</button>`:''}
    </div>
  </div>
  <div class="kpis">
    <div class="card kpi main"><div class="eyebrow">Total sales</div><div class="v">${money(total)}</div></div>
    <div class="card kpi"><div class="eyebrow">Transactions</div><div class="v">${n}</div></div>
    <div class="card kpi"><div class="eyebrow">Average sale</div><div class="v">${money(n?total/n:0)}</div></div>
    <div class="card kpi"><div class="eyebrow">Cash sales</div><div class="v">${money(cashOf(sales))}</div></div>
  </div>
  <div class="flags">
    <div class="card flag"><span class="pill p-late">Late</span><b>${late}</b> entered after the fact</div>
    <div class="card flag"><span class="pill p-void">Void</span><b>${voids}</b> cancelled with a reason</div>
    <div class="card flag"><span class="pill p-utang">Unpaid</span><b>${money(unpaidAmt)}</b> still to collect · ${unpaid.length} sale${unpaid.length===1?'':'s'}</div>
  </div>
  <div class="two">
    <div class="card panel"><h3>Sales by hour${n?` · busiest at ${hl(hours[peak])}`:''}</h3>${barChart(hours.map(hl), hv, n?peak:-1, 2)}</div>
    <div class="card panel"><h3>Last 7 days</h3>${barChart(days.map(d=>new Date(d+'T12:00').toLocaleDateString(loc(),{weekday:'short'})), dv, 6)}</div>
    <div class="card panel"><h3>How customers paid</h3>
      ${shown.map((m,i)=>{const v=sumBy(sales, s=>s.method===m.id);return `<div class="hbar"><span>${esc(m.name)}</span><div class="track"><div class="fill" style="width:${total?v/total*100:0}%;background:${PALETTE[i%PALETTE.length]}"></div></div><span class="amt">${money(v)}</span></div>`}).join('')}
    </div>
    <div class="card panel"><h3>Best sellers</h3>
      ${top.length?`<ol class="top5">${top.map(([nm,a])=>`<li><span>${esc(nm)}<br><span class="q">${fmtQty(r2(a.q),a.u)} sold</span></span><span class="mono">${money(a.v)}</span></li>`).join('')}</ol>`:'<p class="muted">No sales on this day.</p>'}
    </div>
  </div>`;
}

/* ---------- actions ---------- */
function currentDash(){
  if (state.dashDate) return state.dashDate;
  const tk = todayKey(); if (daySales(tk).length) return tk;
  const last = storeSales().filter(s=>!s.voided).at(-1); return last ? dayKey(last.ts) : tk;
}
function dashPrev(){ state.dashDate = shiftDay(currentDash(), -1); }
function dashNext(){ state.dashDate = shiftDay(currentDash(), 1); if (state.dashDate >= todayKey()) state.dashDate = todayKey(); }
