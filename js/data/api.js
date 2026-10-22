/* Every Firebase call lives in this file (Firebase Auth + Cloud Firestore).
   Each function returns plain app objects (see the "to…" mappers) or throws an Error.
   Who may read and write what: firebase/firestore.rules

   Firestore layout
     users/{uid}                      profile: name, email, avatar, provider, lastLogin
     joinCodes/{code}                 invite code -> {workspaceId, name}
     workspaces/{ws}                  shop: name, settings, joinCode, createdBy
       members/{uid}                  uid, role, status, name, email, avatar, lastSeen
       stores/{id}                    business tabs: name, prefix, seq (last receipt number)
       methods/{id}                   payment methods: name, kind, active
       products/{id}                  storeId, name, category, sku, price, unit, step, stock, active
       sales/{receiptNo}              storeId, ts, items, total, methodId, …, unpaid (pay-later not yet collected)
       closings/{storeId_day}         storeId, day, expected, counted, diff
   Times are stored as milliseconds (Date.now()). */

const CONFIG = window.BENTALOG_CONFIG || {};
const SALES_DAYS = +CONFIG.salesDays || 180;
const FB = CONFIG.firebase || {};
const isConfigured = () => !!(FB.apiKey && FB.projectId && FB.appId);
const fb = isConfigured() && window.firebase ? firebase.initializeApp(FB) : null;
const fbAuth = fb && firebase.auth();
const fdb = fb && firebase.firestore();
// keeps a copy on the device so the app opens faster and reads cost less; fails quietly in private windows
if (fdb) fdb.enablePersistence({synchronizeTabs:true}).catch(() => {});
const appUrl = () => location.origin + location.pathname;

/* ---------- paths and helpers ---------- */
const W = ws => fdb.collection('workspaces').doc(ws);
const col = (ws, name) => W(ws).collection(name);
const curWs = () => db.workspace.id;          // the open shop, for calls that only pass a record id
const uid = () => { const u = fbAuth.currentUser; if (!u) throw new Error('You need to sign in first.'); return u.uid; };
const docsOf = snap => snap.docs.map(d => ({id:d.id, ...d.data()}));
const byCreated = (a, b) => (a.createdAt||0) - (b.createdAt||0);
const saleId = receiptNo => String(receiptNo).replace(/\//g, '_');
const makeCode = () => { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', r = crypto.getRandomValues(new Uint32Array(6)); return [...r].map(n => A[n % A.length]).join(''); };
/* deletes or writes in chunks; Firestore allows 500 writes per batch */
async function inBatches(items, write){
  for (let i = 0; i < items.length; i += 450) { const b = fdb.batch(); items.slice(i, i + 450).forEach(x => write(b, x)); await b.commit(); }
}

/* ---------- Firestore documents -> app objects ---------- */
const toUser = u => ({id:u.uid, email:u.email || '', name:u.displayName || (u.email || '').split('@')[0], avatar:u.photoURL || null,
  provider: u.providerData.some(p => p.providerId==='google.com') ? 'google' : 'email'});
const toStore = r => ({id:r.id, name:r.name, prefix:r.prefix, seq:r.seq || 0});
const toMethod = r => ({id:r.id, name:r.name, kind:r.kind, active:r.active!==false});
const toProduct = r => ({id:r.id, store:r.storeId, name:r.name, category:r.category||'', sku:r.sku||'', price:+r.price, unit:r.unit,
  step:+r.step, stock:r.stock==null ? null : +r.stock, active:r.active!==false, created_at:r.createdAt});
const toSale = r => ({uuid:r.id, id:r.receiptNo, store:r.storeId, ts:r.ts, items:r.items || [], total:+r.total, method:r.methodId,
  tendered: r.tendered==null ? undefined : +r.tendered, customer: r.customer || undefined, gref: r.ref || undefined,
  late: !!r.late, recordedTs: r.recordedTs || r.ts, paidTs: r.paidTs || undefined, voided: r.voided || undefined, by: r.byName || ''});
const toClosing = r => ({id:r.id, store:r.storeId, date:r.day, expected:+r.expected, counted:+r.counted, diff:+r.diff, by:r.byName || ''});
const toMember = r => ({id:r.id, role:r.role, status:r.status, created:r.createdAt, lastLogin:r.lastSeen || null,
  name:r.name || '', email:r.email || '', avatar:r.avatar || null});
/* app product -> document fields */
const productDoc = p => ({name:p.name, category:p.category||'', sku:p.sku||'', price:p.price, unit:p.unit, step:p.step, stock:p.stock ?? null, active:p.active!==false});
/* the signed-in user's details copied onto their membership, so teammates can see them */
const memberProfile = u => { const x = toUser(u); return {name:x.name, email:x.email, avatar:x.avatar}; };

/* builds the app's shop data from the latest listener snapshots */
function assembleShop(ws, parts, loadedFrom){
  const w = parts.workspace.data() || {};
  const stores = docsOf(parts.stores).sort(byCreated), methods = docsOf(parts.methods).sort(byCreated);
  const byStore = {};
  stores.forEach(s => byStore[s.id] = []);
  docsOf(parts.products).sort(byCreated).forEach(p => (byStore[p.storeId] ||= []).push(toProduct(p)));
  const sales = new Map();
  for (const s of [...docsOf(parts.unpaid), ...docsOf(parts.recent)]) sales.set(s.id, toSale(s));
  return {
    workspace: {id:ws, name:w.name, joinCode:w.joinCode},
    settings: {...DEFAULT_SETTINGS, ...(w.settings || {})},
    stores: stores.map(toStore), methods: methods.map(toMethod), products: byStore,
    sales: [...sales.values()].sort((a,b) => a.ts-b.ts),
    closings: docsOf(parts.closings).map(toClosing).sort((a,b) => a.date < b.date ? -1 : 1),
    members: docsOf(parts.members).sort(byCreated).map(toMember),
    loadedFrom, fetchedDays: [],
  };
}

let unsubs = [], latest = null;

const api = {
  /* ---------- sign in ---------- */
  onAuth: fn => fbAuth.onAuthStateChanged(u => fn(u ? toUser(u) : null)),
  signIn: (email, password) => fbAuth.signInWithEmailAndPassword(email, password),
  async signUp(name, email, password){
    const {user} = await fbAuth.createUserWithEmailAndPassword(email, password);
    await user.updateProfile({displayName:name});
    await api.saveProfile();
    return toUser(user);
  },
  /* popup first; falls back to a full-page redirect when the browser blocks popups */
  async google(){
    const provider = new firebase.auth.GoogleAuthProvider();
    try { await fbAuth.signInWithPopup(provider); }
    catch (e) {
      if (e.code==='auth/popup-blocked') return fbAuth.signInWithRedirect(provider);
      if (e.code==='auth/popup-closed-by-user' || e.code==='auth/cancelled-popup-request') return;
      throw e;
    }
  },
  /* Firebase emails a link to its own page where the new password is set */
  sendReset: email => fbAuth.sendPasswordResetEmail(email, {url:appUrl()}).catch(e => { if (e.code!=='auth/user-not-found') throw e; }),
  setPassword: password => fbAuth.currentUser.updatePassword(password),
  signOut: () => fbAuth.signOut(),
  /* users/{uid}: one profile per person, kept up to date at every sign-in */
  saveProfile(){
    const u = fbAuth.currentUser; if (!u) return Promise.resolve();
    const x = toUser(u);
    return fdb.collection('users').doc(u.uid).set({name:x.name, email:x.email, avatar:x.avatar, provider:x.provider, lastLogin:Date.now()}, {merge:true})
      .catch(e => console.warn('Profile not saved', e));
  },

  /* ---------- shops (workspaces) and membership ---------- */
  /* every shop this user belongs to: [{workspaceId, name, role, status}] */
  async myMemberships(userId){
    const snap = await fdb.collectionGroup('members').where('uid', '==', userId).get();
    return Promise.all(snap.docs.map(async d => {
      const ws = d.ref.parent.parent.id, w = await W(ws).get().catch(() => null);
      return {workspaceId:ws, name:(w && w.exists && w.get('name')) || 'Shop', role:d.get('role'), status:d.get('status')};
    }));
  },
  /* the caller becomes the owner; comes with one business and 4 payment methods */
  async createShop(name, storeName, prefix){
    const me = uid(), u = fbAuth.currentUser, t = Date.now();
    name = name.trim(); if (!name) throw new Error('Enter a shop name.');
    const wsRef = fdb.collection('workspaces').doc(), ws = wsRef.id, code = makeCode(), b = fdb.batch();
    b.set(wsRef, {name, settings:{...DEFAULT_SETTINGS, business:name}, joinCode:code, createdBy:me, createdAt:t});
    b.set(col(ws, 'members').doc(me), {uid:me, role:'owner', status:'active', ...memberProfile(u), lastSeen:t, createdAt:t});
    b.set(fdb.collection('joinCodes').doc(code), {workspaceId:ws, name});
    b.set(col(ws, 'stores').doc(), {name:storeName || 'Main store', prefix:prefix || 'MS', seq:0, createdAt:t});
    [['Cash','cash'], ['E-wallet','digital'], ['Card','digital'], ['Pay later','credit']]
      .forEach(([n, kind], i) => b.set(col(ws, 'methods').doc(), {name:n, kind, active:true, createdAt:t + i}));
    await b.commit();
    return ws;
  },
  /* asks to join with an invite code; the owner approves under Users */
  async joinShop(code){
    const me = uid(), c = await fdb.collection('joinCodes').doc(code.toUpperCase().trim()).get();
    if (!c.exists) throw new Error('No shop uses that invite code. Check it with the owner.');
    const {workspaceId, name} = c.data(), ref = col(workspaceId, 'members').doc(me);
    if (!(await ref.get()).exists)
      await ref.set({uid:me, role:'staff', status:'pending', code:c.id, ...memberProfile(fbAuth.currentUser), lastSeen:null, createdAt:Date.now()});
    return {workspaceId, name};
  },
  touch: ws => { try { return col(ws, 'members').doc(uid()).update({lastSeen:Date.now()}).catch(() => {}); } catch(e) { return Promise.resolve(); } },
  async newJoinCode(ws){
    const code = makeCode(), old = (await W(ws).get()).get('joinCode'), b = fdb.batch();
    b.set(fdb.collection('joinCodes').doc(code), {workspaceId:ws, name:db.workspace.name});
    if (old) b.delete(fdb.collection('joinCodes').doc(old));
    b.update(W(ws), {joinCode:code});
    await b.commit();
    return code;
  },
  async saveSettings(ws, settings){
    const code = (await W(ws).get()).get('joinCode'), b = fdb.batch();
    b.update(W(ws), {settings, name:settings.business});
    if (code) b.update(fdb.collection('joinCodes').doc(code), {name:settings.business});   // the name people see when they join
    await b.commit();
  },

  /* Opens a shop and keeps it in sync. Resolves with the shop's data once everything has loaded;
     after that, onChange(shop) runs whenever anything changes on any device,
     and onChange(null) if this user loses access. Sales: the last `days` days, plus older unpaid pay-later sales. */
  watchShop(ws, onChange, days = SALES_DAYS){
    api.unsubscribe();
    const since = new Date(); since.setHours(0,0,0,0); since.setDate(since.getDate() - days);
    const loadedFrom = dayKey(since);
    const sources = {
      workspace: W(ws), stores: col(ws, 'stores'), methods: col(ws, 'methods'), products: col(ws, 'products'),
      closings: col(ws, 'closings'), members: col(ws, 'members'),
      recent: col(ws, 'sales').where('ts', '>=', +since),
      unpaid: col(ws, 'sales').where('unpaid', '==', true),
    };
    const parts = {}, need = Object.keys(sources).length;
    return new Promise((resolve, reject) => {
      let ready = false;
      for (const [k, ref] of Object.entries(sources)) unsubs.push(ref.onSnapshot(snap => {
        parts[k] = snap;
        if (Object.keys(parts).length < need) return;
        latest = () => assembleShop(ws, parts, loadedFrom);
        if (!ready) { ready = true; resolve(latest()); } else onChange(latest());
      }, err => {
        if (!ready) { api.unsubscribe(); reject(err); }
        else if (err.code==='permission-denied') { api.unsubscribe(); onChange(null); }
        else console.warn('Live update stopped', err);
      }));
    });
  },
  /* the open shop as the listeners last saw it (includes this device's own unsaved writes) */
  currentShop: () => latest ? latest() : null,
  unsubscribe(){ unsubs.forEach(f => f()); unsubs = []; latest = null; },

  /* one older day for History */
  async salesForDay(ws, key){
    const a = new Date(key + 'T00:00'), b = new Date(a); b.setDate(b.getDate() + 1);
    const snap = await col(ws, 'sales').where('ts', '>=', +a).where('ts', '<', +b).get();
    return docsOf(snap).map(toSale).sort((x,y) => x.ts-y.ts);
  },
  /* every sale ever, for backups */
  allSales: async ws => docsOf(await col(ws, 'sales').get()).map(toSale).sort((a,b) => a.ts-b.ts),

  /* ---------- businesses (stores) ---------- */
  async addStore(ws, name, prefix){
    if (!(await col(ws, 'stores').where('prefix', '==', prefix).limit(1).get()).empty) throw new Error('Another business already uses that receipt prefix.');
    const ref = col(ws, 'stores').doc(), row = {name, prefix, seq:0, createdAt:Date.now()};
    await ref.set(row);
    return toStore({id:ref.id, ...row});
  },
  async updateStore(id, patch){
    if (patch.prefix) {
      const same = await col(curWs(), 'stores').where('prefix', '==', patch.prefix).get();
      if (same.docs.some(d => d.id!==id)) throw new Error('Another business already uses that receipt prefix.');
    }
    await col(curWs(), 'stores').doc(id).update(patch);
  },
  /* takes the business's products and closings with it; refused if it has sales */
  async deleteStore(id){
    const ws = curWs();
    if (!(await col(ws, 'sales').where('storeId', '==', id).limit(1).get()).empty) throw new Error('This business has recorded sales, so it can’t be deleted. Rename it instead.');
    const [prods, closes] = await Promise.all([col(ws, 'products').where('storeId', '==', id).get(), col(ws, 'closings').where('storeId', '==', id).get()]);
    await inBatches([...prods.docs, ...closes.docs].map(d => d.ref), (b, ref) => b.delete(ref));
    await col(ws, 'stores').doc(id).delete();
  },

  /* ---------- payment methods ---------- */
  async addMethod(ws, m){
    const ref = col(ws, 'methods').doc(), row = {name:m.name, kind:m.kind, active:m.active!==false, createdAt:Date.now()};
    await ref.set(row);
    return toMethod({id:ref.id, ...row});
  },
  updateMethod: (id, m) => col(curWs(), 'methods').doc(id).update({name:m.name, kind:m.kind, active:m.active}),
  async deleteMethod(id){
    const ws = curWs();
    if (!(await col(ws, 'sales').where('methodId', '==', id).limit(1).get()).empty) throw new Error('This method is used in past sales. Turn it off instead so old receipts still show it.');
    await col(ws, 'methods').doc(id).delete();
  },

  /* ---------- products ---------- */
  /* list items may carry id/created_at (used by Undo to put a deleted product back exactly) */
  async addProducts(ws, storeId, list){
    const t = Date.now();
    const rows = list.map((p, i) => ({id: p.id || col(ws, 'products').doc().id, storeId, ...productDoc(p), createdAt: p.created_at || t + i}));
    await inBatches(rows, (b, {id, ...row}) => b.set(col(ws, 'products').doc(id), row));
    return rows.map(toProduct);
  },
  async updateProduct(id, p){
    const ref = col(curWs(), 'products').doc(id);
    await ref.update(productDoc(p));
    return toProduct({id, ...(await ref.get()).data()});
  },
  deleteProduct: id => col(curWs(), 'products').doc(id).delete(),

  /* ---------- sales ---------- */
  /* One transaction gives the next receipt number and takes items out of stock,
     so two phones selling at once can't get the same receipt number or oversell. */
  recordSale({store, items, method, tendered, customer, ref, ts, late, byName}){
    const ws = curWs(), me = uid();
    if (!items || !items.length) return Promise.reject(new Error('The sale has no items.'));
    return fdb.runTransaction(async tx => {
      const stRef = col(ws, 'stores').doc(store), pids = [...new Set(items.map(it => it.pid).filter(Boolean))];
      const [st, pm, ...prods] = await Promise.all([tx.get(stRef), tx.get(col(ws, 'methods').doc(method)), ...pids.map(id => tx.get(col(ws, 'products').doc(id)))]);
      if (!st.exists) throw new Error('You are not allowed to record sales here.');
      if (!pm.exists) throw new Error('Pick a payment method.');
      const credit = pm.get('kind')==='credit';
      if (credit && !(customer || '').trim()) throw new Error('Enter the customer’s name.');
      let total = 0; const qty = {};
      for (const it of items) {
        const q = +it.qty;
        if (!(q > 0)) throw new Error('Each item needs a quantity above 0.');
        total += it.price * q;
        if (it.pid) qty[it.pid] = (qty[it.pid] || 0) + q;
      }
      const stock = prods.filter(p => p.exists && p.get('storeId')===store && p.get('stock')!=null);
      for (const p of stock) if (p.get('stock') < qty[p.id]) throw new Error(`Only ${p.get('stock')} ${p.get('unit')} of ${p.get('name')} left in stock.`);
      const seq = (st.get('seq') || 0) + 1, receiptNo = st.get('prefix') + '-' + pad(seq, 4), saleRef = col(ws, 'sales').doc(saleId(receiptNo));
      if ((await tx.get(saleRef)).exists) throw new Error('Receipt ' + receiptNo + ' already exists. Change this business’s receipt prefix in Settings.');
      const now = Date.now(), sale = {
        storeId:store, receiptNo, ts: ts || now, items, total:r2(total), methodId:method,
        tendered: tendered ?? null, customer: (customer || '').trim() || null, ref: (ref || '').trim() || null,
        late:!!late, recordedTs:now, paidTs:null, voided:null, unpaid:credit, byName:byName || '', byUser:me,
      };
      stock.forEach(p => tx.update(p.ref, {stock:r2(p.get('stock') - qty[p.id])}));
      tx.update(stRef, {seq});
      tx.set(saleRef, sale);
      return toSale({id:saleRef.id, ...sale});
    });
  },
  /* owner: void with a reason and put the items back in stock */
  voidSale(saleUuid, reason, byName){
    const ws = curWs();
    return fdb.runTransaction(async tx => {
      const ref = col(ws, 'sales').doc(saleUuid), s = await tx.get(ref);
      if (!s.exists) throw new Error('That sale no longer exists.');
      if (s.get('voided')) throw new Error('This sale is already voided.');
      if (!(reason || '').trim()) throw new Error('Enter a reason for voiding.');
      const items = s.get('items') || [], pids = [...new Set(items.map(it => it.pid).filter(Boolean))];
      const prods = (await Promise.all(pids.map(id => tx.get(col(ws, 'products').doc(id))))).filter(p => p.exists && p.get('stock')!=null);
      for (const p of prods) tx.update(p.ref, {stock:r2(p.get('stock') + items.filter(it => it.pid===p.id).reduce((a, it) => a + +it.qty, 0))});
      const patch = {voided:{reason:reason.trim(), ts:Date.now(), by:byName || ''}, unpaid:false};
      tx.update(ref, patch);
      return toSale({id:ref.id, ...s.data(), ...patch});
    });
  },
  async markPaid(saleUuid){
    const ref = col(curWs(), 'sales').doc(saleUuid), patch = {paidTs:Date.now(), unpaid:false};
    await ref.update(patch);
    return toSale({id:ref.id, ...(await ref.get()).data(), ...patch});
  },
  /* owner-only bulk insert (sample data, restoring a backup); skips receipt numbers that already exist.
     rows use the sales document fields: {storeId, receiptNo, ts, items, total, methodId, …} */
  async insertSales(ws, rows){
    const me = uid(), fresh = [];
    for (let i = 0; i < rows.length; i += 30) {
      const chunk = rows.slice(i, i + 30), ids = chunk.map(r => saleId(r.receiptNo));
      const have = new Set((await col(ws, 'sales').where(firebase.firestore.FieldPath.documentId(), 'in', ids).get()).docs.map(d => d.id));
      fresh.push(...chunk.filter((r, j) => !have.has(ids[j])));
    }
    await inBatches(fresh, (b, r) => b.set(col(ws, 'sales').doc(saleId(r.receiptNo)), {
      tendered:null, customer:null, ref:null, late:false, paidTs:null, voided:null, byName:'', ...r,
      recordedTs: r.recordedTs || r.ts, unpaid: kindOf(r.methodId)==='credit' && !r.paidTs && !r.voided, byUser:me}));
  },
  async clearSales(ws){
    const [sales, closes, stores] = await Promise.all([col(ws, 'sales').get(), col(ws, 'closings').get(), col(ws, 'stores').get()]);
    await inBatches([...closes.docs, ...sales.docs].map(d => d.ref), (b, ref) => b.delete(ref));
    await inBatches(stores.docs.map(d => d.ref), (b, ref) => b.update(ref, {seq:0}));
  },
  async saveClosing(ws, c){
    const id = c.store + '_' + c.date, row = {storeId:c.store, day:c.date, expected:c.expected, counted:c.counted, diff:c.diff, byName:c.by || '', createdAt:Date.now()};
    await col(ws, 'closings').doc(id).set(row);
    return toClosing({id, ...row});
  },

  /* ---------- people ---------- */
  setMember(ws, userId, role, status){
    if (userId===uid()) return Promise.reject(new Error('You can’t change your own role or status. Ask another owner.'));
    return col(ws, 'members').doc(userId).update({role, status});
  },
  removeMember(ws, userId){
    if (userId===uid()) return Promise.reject(new Error('You can’t remove yourself.'));
    return col(ws, 'members').doc(userId).delete();
  },
  /* renames the sign-in account, the profile, and every shop membership */
  async updateMyName(userId, name){
    await fbAuth.currentUser.updateProfile({displayName:name});
    await fdb.collection('users').doc(userId).set({name}, {merge:true});
    const mine = await fdb.collectionGroup('members').where('uid', '==', userId).get();
    await Promise.all(mine.docs.map(d => d.ref.update({name})));
  },
};
