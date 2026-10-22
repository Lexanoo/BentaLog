/* Draws the whole screen from `state` and `db`. Every change calls rerender(). */

const VIEWS = {sell:viewSell, today:viewToday, history:viewHistory, close:viewClose, products:viewProducts, users:viewUsers, settings:viewSettings};
const MODALS = {product:productModal, user:userModal, account:accountModal, store:storeModal, method:methodModal};

function render(){
  const app = $('#app');
  switch (state.phase) {
    case 'setup':   app.innerHTML = viewSetup(); return;
    case 'auth':    app.innerHTML = viewAuth(); return;
    case 'onboard': app.innerHTML = viewOnboard(); return;
    case 'error':   app.innerHTML = viewError(); return;
    case 'app':     app.innerHTML = viewShell(); formatAll(); return;
    default:        app.innerHTML = viewLoading();
  }
}

function rerender(){
  render();
  state.stale = false;
  if (state.phase==='app' && state.view==='sell') updateCheckout();
}

/* Redraw after background changes (live updates) without wiping what someone is typing */
function softRender(){
  const a = document.activeElement;
  if (state.modal || state.openId || (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.closest('#app'))) { state.stale = true; return; }
  rerender();
}

const viewLoading = () => `<div class="screen"><div><div class="spinner"></div><p class="muted">${state.phase==='boot' ? 'Starting…' : 'Loading your shop…'}</p></div></div>`;
const viewError = () => `<div class="screen"><div class="card">
    <h2 style="font-size:20px">Something went wrong</h2><p class="err" style="margin:0">${esc(state.error)}</p>
    <div class="actions"><button class="btn primary" data-act="retry">Try again</button><button class="btn" data-act="logout">Sign out</button></div>
  </div></div>`;

function viewShell(){
  normalize();
  const pend = pendingMembers().length;
  const tabs = [['sell','Sell'],['today','Daily sales'],['history','Transaction history'],['close','Close the day']];
  if (isOwner()) tabs.push(['products','Products'],['users','Users'],['settings','Settings']);
  return `
  <header><div class="wrap">
    <div class="top">
      <div class="brand"><h1>Benta<b>Log</b></h1><span>${esc(cfg().business)}</span></div>
      ${db.stores.length > 1 || isOwner() ? `<div class="seg" role="group" aria-label="Business">
        ${db.stores.map(s=>`<button data-act="store" data-v="${s.id}" aria-pressed="${state.store===s.id}">${esc(s.name)}</button>`).join('')}
        ${isOwner() ? `<button class="seg-add" data-act="newStore" title="Add another business with its own products">+ Add</button>` : ''}
      </div>` : ''}
      <div class="me">
        <button class="me-btn" data-act="account" aria-label="My account: ${esc(me.name)}">${avatarHtml(me.name, me.avatar)}<span class="me-txt"><b>${esc(me.name)}</b><small>${ROLES[me.role]}</small></span></button>
        <button class="btn ghost sm" data-act="logout">Sign out</button>
      </div>
    </div>
    <nav>${tabs.map(([k,l])=>`<button data-act="view" data-v="${k}" ${state.view===k?'aria-current="page"':''}>${l}${k==='users'&&pend?`<span class="badge" aria-label="${pend} waiting">${pend}</span>`:''}</button>`).join('')}</nav>
  </div></header>
  <main class="wrap">${VIEWS[state.view]()}
    <footer>
      <span class="sync ${state.online?'':'off'}">${state.online ? 'Saved online · live updates on' : 'Offline. Changes can’t be saved until you reconnect.'}</span>
      <span>· ${esc(me.email || '')}</span>
    </footer>
  </main>
  ${state.openId ? sheet() : ''}${state.modal ? modal() : ''}`;
}

function modal(){
  return `<div class="overlay" data-act="closeModal">${MODALS[state.modal.type]()}</div>`;
}
