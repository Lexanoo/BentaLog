/* Formatting, number inputs and small UI helpers shared by every screen. */

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
/* the shop's settings (currency, number format...) */
const cfg = () => db.settings;
const loc = () => cfg().locale || undefined;
const money = n => cfg().currency + (+n).toLocaleString(loc(),{minimumFractionDigits:2,maximumFractionDigits:2});
const money0 = n => Number.isInteger(+n) ? cfg().currency + (+n).toLocaleString(loc()) : money(n);
const moneyShort = n => n >= 1000 ? cfg().currency + (n/1000).toLocaleString(loc(),{maximumFractionDigits:1}) + 'k' : cfg().currency + Math.round(n);
const r2 = n => Math.round(n*100)/100;
const pad = (n,l=2) => String(n).padStart(l,'0');
const dayKey = ts => { const d = new Date(ts); return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); };
const todayKey = () => dayKey(Date.now());
const shiftDay = (key, n) => { const d = new Date(key+'T12:00'); d.setDate(d.getDate()+n); return dayKey(d); };
const fmtTime = ts => new Date(ts).toLocaleTimeString(loc(),{hour:'numeric',minute:'2-digit'});
const fmtDate = key => new Date(key+'T12:00').toLocaleDateString(loc(),{weekday:'short',month:'short',day:'numeric'});
const fmtQty = (q,u) => (+q).toLocaleString(loc(),{maximumFractionDigits:2}) + ' ' + u + (q!==1 && !MEASURES.includes(u) && !/s$/.test(u) && u.length>1 ? 's' : '');
/* number inputs: thousands separators while typing, in the business's number format */
function seps(){
  const parts = new Intl.NumberFormat(loc()).formatToParts(1234567.5);
  return {g:(parts.find(x=>x.type==='group')||{value:','}).value, d:(parts.find(x=>x.type==='decimal')||{value:'.'}).value};
}
const groupInt = (i, g) => i.replace(/\B(?=(\d{3})+(?!\d))/g, g);
/* reads a formatted input value ("100,000.50") back into a number; '' gives NaN */
function num(v){
  const s = String(v ?? '').trim(); if (!s) return NaN;
  const {g,d} = seps();
  return parseFloat(s.split(g).join('').split(d).join('.').replace(/[^\d.-]/g,''));
}
/* a number as an input would show it, e.g. 100000 -> "100,000" */
const fmtNum = n => { if (n==='' || n==null || isNaN(n)) return ''; const {g,d} = seps(), [i,f] = String(r2(+n)).split('.'); return groupInt(i,g) + (f ? d+f : ''); };
function fmtNumInput(el, keepCaret){
  const {g,d} = seps(), raw = el.value, max = +(el.dataset.num || 2);
  const isDec = ch => ch===d || (ch==='.' && g!=='.');
  const pos = keepCaret ? el.selectionStart : raw.length;
  let before = 0; for (let k = 0; k < pos; k++) if (/\d/.test(raw[k]) || isDec(raw[k])) before++;
  let i = '', f = null;
  for (const ch of raw) {
    if (/\d/.test(ch)) { if (f===null) i += ch; else if (f.length < max) f += ch; }
    else if (isDec(ch) && f===null && max > 0) f = '';
  }
  i = i.replace(/^0+(?=\d)/, ''); if (i==='' && f!==null) i = '0';
  const out = groupInt(i, g) + (f!==null ? d + f : '');
  if (out===raw) return;
  el.value = out;
  if (keepCaret && document.activeElement===el) {
    let c = 0, k = 0; while (k < out.length && c < before) { if (/\d/.test(out[k]) || out[k]===d) c++; k++; }
    el.setSelectionRange(k, k);
  }
}
const formatAll = () => document.querySelectorAll('input[data-num]').forEach(el => fmtNumInput(el, false));

/* ---------- small UI helpers ---------- */
const initials = n => String(n||'?').trim().split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase();
const fmtWhen = ts => ts ? new Date(ts).toLocaleString(loc(),{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}) : 'Never';
const isEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const avatarHtml = (name, url) => url ? `<span class="avatar"><img src="${esc(url)}" alt="" referrerpolicy="no-referrer"></span>` : `<span class="avatar">${esc(initials(name))}</span>`;
const pwInput = (id, ac) => `<span class="pw"><input id="${id}" type="password" autocomplete="${ac}"><button type="button" class="pw-toggle" data-act="pwToggle" aria-pressed="false">Show</button></span>`;

let toastT, undoFn = null;
/* short message at the bottom; pass a function as `undo` to show an Undo button for 6 seconds */
function toast(msg, undo){
  const t = $('#toast'); undoFn = undo || null;
  t.innerHTML = '<span>' + esc(msg) + '</span>' + (undo ? '<button class="toast-undo" data-act="undo">Undo</button>' : '');
  t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; undoFn = null; }, undo ? 6000 : 3200);
}

/* first tap changes the button to "Tap again to …"; returns true on the second tap */
function arm(el){
  if (el.dataset.armed) return true;
  el.dataset.armed = '1'; el.classList.add('danger'); el.textContent = el.dataset.confirm || 'Tap again to confirm';
  return false;
}

/* Runs a database call with a "Saving…" button and shows any error.
   Returns true if it worked, false if it failed (the error is already shown). */
async function attempt(fn, {btn, errEl, label='Saving…'} = {}){
  const old = btn && btn.textContent;
  if (btn) { btn.disabled = true; btn.textContent = label; }
  if (errEl) errEl.textContent = '';
  try { await fn(); return true; }
  catch (e) {
    console.error(e);
    const m = friendly(e);
    if (errEl && errEl.isConnected) errEl.textContent = m; else toast(m);
    return false;
  }
  finally { if (btn && btn.isConnected) { btn.disabled = false; btn.textContent = old; } }
}

/* Supabase / network errors -> sentences people can act on */
const FRIENDLY = [
  [/invalid login credentials/i, 'Email or password is incorrect.'],
  [/email not confirmed/i, 'Confirm your email first. Check your inbox for the link we sent.'],
  [/user already registered/i, 'An account with this email already exists. Sign in instead.'],
  [/password should be at least/i, 'Password must be at least 6 characters.'],
  [/same.*password|password.*different/i, 'Choose a password different from your current one.'],
  [/provider is not enabled|unsupported provider/i, 'Google sign-in is not turned on yet. In Supabase, open Authentication → Providers → Google.'],
  [/failed to fetch|networkerror|load failed|network request failed/i, 'Can’t reach the server. Check your internet connection and try again.'],
  [/rate limit|too many requests/i, 'Too many attempts. Wait a minute and try again.'],
  [/stores_workspace_id_prefix_key/i, 'Another business already uses that receipt prefix.'],
  [/violates foreign key constraint.*sales/i, 'This is used by past sales, so it can’t be deleted. Rename it or turn it off instead.'],
  [/row-level security|permission denied/i, 'You don’t have permission to do that. Only owners can change this.'],
  [/jwt expired|invalid jwt/i, 'Your session expired. Sign in again.'],
];
function friendly(e){
  const m = (e && (e.message || e.error_description || e.msg)) || String(e);
  for (const [re, text] of FRIENDLY) if (re.test(m)) return text;
  return m;
}
