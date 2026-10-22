/* App memory.
   db    = the open shop's data, loaded from Supabase (see js/data/api.js loadShop)
   me    = the signed-in user in this shop: {id, name, email, avatar, provider, role, status}
   state = what's on screen right now (current tab, cart, filters, open dialog…) */

const emptyDb = () => ({
  workspace: null,                 // {id, name, joinCode}
  settings: {...DEFAULT_SETTINGS},
  stores: [],                      // business tabs: {id, name, prefix, seq}
  methods: [],                     // payment methods: {id, name, kind, active}
  products: {},                    // {storeId: [{id, name, category, sku, price, unit, step, stock, active}]}
  sales: [],                       // {uuid, id (receipt no.), store, ts, items, total, method, ...}
  closings: [],
  members: [],                     // {id, name, email, role, status, lastLogin}
  loadedFrom: null,                // sales before this day are loaded only on request
  fetchedDays: [],
});
let db = emptyDb();
let me = null;

const state = {
  phase: 'boot',                   // boot | setup | auth | loading | onboard | app | error
  user: null,                      // Supabase auth user
  memberships: [],                 // every shop this user belongs to
  error: '',
  authTab: 'login', authMsg: '',   // login | signup | forgot | newpw
  store: null, view: 'sell', cart: [], method: null, tendered: '', customer: '',
  late: false, lateTime: '', lastId: null, dashDate: null, sellQ: '', cat: 'all',
  histDate: todayKey(), histQ: '', histM: 'all', histLoading: false,
  openId: null, voidMode: false, voidReason: '',
  float: '', counted: '', resetArm: false,
  modal: null, prodQ: '', prodF: 'all', userQ: '', userF: 'all',
  online: navigator.onLine, stale: false,
};

/* ---------- selectors: read-only views of db for the current business tab ---------- */
const isOwner = () => !!me && me.role==='owner';
const store = () => db.stores.find(s => s.id===state.store) || db.stores[0];
const products = () => (db.products[state.store] ||= []);
const findProduct = id => products().find(p => p.id===id);
const categories = () => [...new Set(products().map(p=>p.category).filter(Boolean))].sort();
const stockState = p => p.stock==null ? '' : p.stock<=0 ? 'out' : p.stock<=(+cfg().lowStock||0) ? 'low' : 'ok';
const method = id => db.methods.find(m => m.id===id) || {id, name:'Unknown', kind:'digital'};
const methodsOn = () => db.methods.filter(m => m.active!==false);
const kindOf = id => method(id).kind;
const pillFor = id => KINDS[kindOf(id)].pill;
const sumBy = (list, f) => r2(list.filter(f).reduce((a,x)=>a+x.total,0));
const storeSales = () => db.sales.filter(s => s.store===state.store);
const daySales = (key, incVoid) => storeSales().filter(s => dayKey(s.ts)===key && (incVoid || !s.voided));
const cashOf = sales => sumBy(sales, s => kindOf(s.method)==='cash');
const cartTotal = () => r2(state.cart.reduce((s,l)=>s+l.price*l.qty,0));
/* preview of the next receipt number; the database assigns the real one */
const nextId = () => store().prefix + '-' + pad((store().seq||0)+1,4);
const pendingMembers = () => db.members.filter(m => m.status==='pending');

/* "Coffee Shop" -> "CS", "Hardware" -> "HAR"; adds a number if taken */
function autoPrefix(name){
  const w = name.toUpperCase().replace(/[^A-Z0-9 ]/g,'').split(/\s+/).filter(Boolean);
  let base = (w.length > 1 ? w.map(x=>x[0]).join('') : (w[0]||'BZ')).slice(0,3);
  if (base.length < 2) base = (base + 'X').slice(0,2);
  let p = base, n = 2; while (db.stores.some(s=>s.prefix===p)) p = base + n++;
  return p.slice(0,4);
}

/* keeps the current tab / payment method valid after data changes */
function normalize(){
  if (!db.stores.some(s => s.id===state.store)) { state.store = db.stores[0] && db.stores[0].id; state.cart = []; }
  if (!methodsOn().some(m => m.id===state.method)) state.method = (methodsOn()[0] || {}).id;
  if (state.cat!=='all' && !categories().includes(state.cat)) state.cat = 'all';
  if (!isOwner() && ['products','users','settings'].includes(state.view)) state.view = 'sell';
}
