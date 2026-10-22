/* Startup and session flow:
   page load -> Firebase restores the signed-in user -> onAuth()
     signed out          -> sign-in screen
     signed in           -> enterShop(): find the user's shops
       no active shop    -> onboarding (create one or join with a code)
       has a shop        -> openShop(): load its data, keep it in sync live, show the app */

const SHOP_KEY = 'bentalog-shop';

async function onAuth(user){
  if (!user) {
    api.unsubscribe(); me = null; db = emptyDb(); state.user = null;
    if (state.phase!=='auth') { state.phase = 'auth'; rerender(); }
    return;
  }
  const same = state.user && state.user.id===user.id;
  state.user = user;
  if (same && state.phase==='app') return;
  api.saveProfile();
  await enterShop();
}

/* Picks a shop to open: `preferId`, else the last one used on this device, else the first. */
async function enterShop(preferId, view){
  state.phase = 'loading'; rerender();
  try {
    state.memberships = await api.myMemberships(state.user.id);
    const active = state.memberships.filter(m => m.status==='active');
    let last = null; try { last = localStorage.getItem(SHOP_KEY); } catch(e) {}
    const pick = active.find(m => m.workspaceId===preferId) || active.find(m => m.workspaceId===last) || active[0];
    if (!pick) { api.unsubscribe(); state.phase = 'onboard'; return rerender(); }
    await openShop(pick.workspaceId, view);
  } catch (e) {
    console.error(e);
    state.phase = 'error'; state.error = friendly(e); rerender();
  }
}

async function openShop(wsId, view){
  db = await api.watchShop(wsId, onShopChange);
  setMe();
  try { localStorage.setItem(SHOP_KEY, wsId); } catch(e) {}
  Object.assign(state, {
    phase:'app', view: view || 'sell', store: db.stores[0] && db.stores[0].id, cart:[], method:null, tendered:'', customer:'',
    late:false, lastId:null, dashDate:null, openId:null, modal:null, cat:'all', sellQ:'', prodQ:'', prodF:'all',
    histDate: todayKey(), float: fmtNum(db.settings.float), counted:'',
  });
  api.touch(wsId);
  rerender();
}

/* me = this user's membership in the open shop, plus details from their sign-in */
function setMe(){
  const u = state.user, mine = db.members.find(m => m.id===u.id) || {};
  me = {id:u.id, email:u.email, role:mine.role, status:mine.status, name:mine.name || u.name, avatar:mine.avatar || u.avatar, provider:u.provider};
}

/* ---------- live updates: another phone changed something -> redraw quietly ---------- */
let changeT;
function onShopChange(fresh){
  clearTimeout(changeT);
  if (!fresh) return lostAccess();
  changeT = setTimeout(() => { applyShop(fresh); softRender(); }, 300);
}

/* brings in the listeners' latest copy now (after bulk changes such as restoring a backup) */
function reloadShop(){ const fresh = api.currentShop(); if (fresh) applyShop(fresh); }

function applyShop(fresh){
  if (!db.workspace || !state.user || fresh.workspace.id!==db.workspace.id) return;
  const mine = fresh.members.find(m => m.id===state.user.id);
  if (!mine || mine.status!=='active') return lostAccess();   // the owner removed or turned off this user
  // keep older days that History fetched on request
  const have = new Set(fresh.sales.map(s => s.uuid));
  fresh.sales = db.sales.filter(s => dayKey(s.ts) < fresh.loadedFrom && !have.has(s.uuid)).concat(fresh.sales).sort((a,b) => a.ts-b.ts);
  fresh.fetchedDays = db.fetchedDays;
  db = fresh; setMe();
}

function lostAccess(){
  api.unsubscribe(); toast('Your access to this shop was changed by the owner.');
  enterShop();
}

/* ---------- start ---------- */
(function boot(){
  if (!fb) { state.phase = 'setup'; return rerender(); }
  // invite links look like index.html?join=ABC123
  const code = new URLSearchParams(location.search).get('join');
  if (code) {
    try { sessionStorage.setItem(JOIN_KEY, code.toUpperCase()); } catch(e) {}
    history.replaceState(null, '', appUrl() + location.hash);
  }
  rerender();
  // Firebase calls this once on load and on every sign-in / sign-out
  api.onAuth(onAuth);
})();
