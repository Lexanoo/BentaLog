/* Startup and session flow:
   page load -> Supabase restores the session -> onAuth()
     no session          -> sign-in screen
     signed in           -> enterShop(): find the user's shops
       no active shop    -> onboarding (create one or join with a code)
       has a shop        -> openShop(): load its data, subscribe to live updates, show the app */

const SHOP_KEY = 'bentalog-shop';

async function onAuth(event, session){
  if (event==='PASSWORD_RECOVERY') { state.phase = 'auth'; state.authTab = 'newpw'; return rerender(); }
  if (!session) {
    api.unsubscribe(); me = null; db = emptyDb();
    if (state.phase!=='auth') { state.phase = 'auth'; rerender(); }
    return;
  }
  state.user = session.user;
  if (event==='USER_UPDATED' || event==='TOKEN_REFRESHED') return;
  if (state.phase==='app' && me && me.id===session.user.id) return;   // already open (e.g. tab regained focus)
  if (state.authTab==='newpw') return;                                 // finishing a password reset first
  await enterShop();
}

/* Picks a shop to open: `preferId`, else the last one used on this device, else the first. */
async function enterShop(preferId, view){
  state.phase = 'loading'; rerender();
  try {
    state.memberships = await api.myMemberships(state.user.id);
    const active = state.memberships.filter(m => m.status==='active');
    let last = null; try { last = localStorage.getItem(SHOP_KEY); } catch(e) {}
    const pick = active.find(m => m.workspace_id===preferId) || active.find(m => m.workspace_id===last) || active[0];
    if (!pick) { state.phase = 'onboard'; return rerender(); }
    await openShop(pick.workspace_id, view);
  } catch (e) {
    console.error(e);
    state.phase = 'error'; state.error = friendly(e); rerender();
  }
}

async function openShop(wsId, view){
  db = await api.loadShop(wsId);
  setMe();
  try { localStorage.setItem(SHOP_KEY, wsId); } catch(e) {}
  Object.assign(state, {
    phase:'app', view: view || 'sell', store: db.stores[0] && db.stores[0].id, cart:[], method:null, tendered:'', customer:'',
    late:false, lastId:null, dashDate:null, openId:null, modal:null, cat:'all', sellQ:'', prodQ:'', prodF:'all',
    histDate: todayKey(), float: fmtNum(db.settings.float), counted:'',
  });
  api.touch(wsId);
  api.subscribe(wsId, scheduleReload);
  rerender();
}

/* me = this user's membership in the open shop, plus details from their sign-in */
function setMe(){
  const u = state.user, mine = db.members.find(m => m.id===u.id) || {};
  const meta = u.user_metadata || {};
  me = {
    id: u.id, email: u.email, role: mine.role, status: mine.status,
    name: mine.name || meta.full_name || meta.name || (u.email || '').split('@')[0],
    avatar: mine.avatar || meta.avatar_url || null,
    provider: (u.app_metadata && u.app_metadata.provider) || 'email',
  };
}

/* ---------- live updates: another phone changed something -> reload quietly ---------- */
let reloadT;
function scheduleReload(){ clearTimeout(reloadT); reloadT = setTimeout(() => reloadShop().then(softRender), 600); }

async function reloadShop(){
  if (!db.workspace || !state.user) return;
  try {
    const fresh = await api.loadShop(db.workspace.id);
    const mine = fresh.members.find(m => m.id===state.user.id);
    if (!mine || mine.status!=='active') {           // the owner removed or turned off this user
      api.unsubscribe(); toast('Your access to this shop was changed by the owner.');
      return enterShop();
    }
    // keep older days that History fetched on request
    const have = new Set(fresh.sales.map(s => s.uuid));
    fresh.sales = db.sales.filter(s => dayKey(s.ts) < fresh.loadedFrom && !have.has(s.uuid)).concat(fresh.sales).sort((a,b) => a.ts-b.ts);
    fresh.fetchedDays = db.fetchedDays;
    db = fresh; setMe();
  } catch (e) { console.warn('Reload failed', e); }
}

/* ---------- start ---------- */
(function boot(){
  if (!sb) { state.phase = 'setup'; return rerender(); }
  // invite links look like index.html?join=ABC123
  const code = new URLSearchParams(location.search).get('join');
  if (code) {
    try { sessionStorage.setItem(JOIN_KEY, code.toUpperCase()); } catch(e) {}
    history.replaceState(null, '', appUrl() + location.hash);
  }
  rerender();
  // Supabase calls this once on load (INITIAL_SESSION) and on every sign-in / sign-out.
  // setTimeout: Supabase advises not to await other Supabase calls inside this callback.
  sb.auth.onAuthStateChange((event, session) => setTimeout(() => onAuth(event, session), 0));
})();
