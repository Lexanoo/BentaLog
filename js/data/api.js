/* Every Supabase call lives in this file.
   Each function returns plain app objects (see the "to…" mappers) or throws an Error.
   Table and function definitions: supabase/schema.sql */

const CONFIG = window.BENTALOG_CONFIG || {};
const SALES_DAYS = +CONFIG.salesDays || 180;
const isConfigured = () => /^https:\/\/\S+$/.test(CONFIG.supabaseUrl || '') && (CONFIG.supabaseAnonKey || '').length > 20;
const sb = isConfigured() && window.supabase
  ? window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, {auth:{persistSession:true, autoRefreshToken:true, detectSessionInUrl:true}})
  : null;
const appUrl = () => location.origin + location.pathname;

/* unwrap {data, error} */
async function q(promise){ const {data, error} = await promise; if (error) throw error; return data; }
/* Supabase returns at most 1000 rows per request; this keeps asking until everything is in */
async function qAll(makeQuery){
  const out = [];
  for (let from = 0; ; from += 1000) {
    const rows = await q(makeQuery().range(from, from + 999));
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* ---------- database rows -> app objects ---------- */
const toStore = r => ({id:r.id, name:r.name, prefix:r.prefix, seq:r.seq});
const toMethod = r => ({id:r.id, name:r.name, kind:r.kind, active:r.active});
const toProduct = r => ({id:r.id, store:r.store_id, name:r.name, category:r.category||'', sku:r.sku||'', price:+r.price, unit:r.unit,
  step:+r.step, stock:r.stock==null ? null : +r.stock, active:r.active, created_at:r.created_at});
const toSale = r => ({uuid:r.id, id:r.receipt_no, store:r.store_id, ts:Date.parse(r.ts), items:r.items || [], total:+r.total, method:r.method_id,
  tendered: r.tendered==null ? undefined : +r.tendered, customer: r.customer || undefined, gref: r.ref || undefined,
  late: r.late, recordedTs: Date.parse(r.recorded_at), paidTs: r.paid_at ? Date.parse(r.paid_at) : undefined,
  voided: r.voided ? {...r.voided, ts:Date.parse(r.voided.ts)} : undefined, by: r.by_name || ''});
const toClosing = r => ({id:r.id, store:r.store_id, date:r.day, expected:+r.expected, counted:+r.counted, diff:+r.diff, by:r.by_name});
const toMember = r => ({id:r.user_id, role:r.role, status:r.status, created:Date.parse(r.created_at),
  lastLogin: r.last_seen ? Date.parse(r.last_seen) : null,
  name: (r.profiles && r.profiles.full_name) || '', email: r.profiles && r.profiles.email, avatar: r.profiles && r.profiles.avatar_url});
/* app product -> row columns */
const productRow = p => ({name:p.name, category:p.category||'', sku:p.sku||'', price:p.price, unit:p.unit, step:p.step, stock:p.stock, active:p.active!==false});

let channel = null;

const api = {
  /* ---------- sign in ---------- */
  signIn: (email, password) => q(sb.auth.signInWithPassword({email, password})),
  signUp: (name, email, password) => q(sb.auth.signUp({email, password, options:{data:{full_name:name}, emailRedirectTo:appUrl()}})),
  google: () => q(sb.auth.signInWithOAuth({provider:'google', options:{redirectTo:appUrl()}})),
  sendReset: email => q(sb.auth.resetPasswordForEmail(email, {redirectTo:appUrl()})),
  setPassword: password => q(sb.auth.updateUser({password})),
  signOut: () => sb.auth.signOut(),

  /* ---------- shops (workspaces) and membership ---------- */
  myMemberships: userId => q(sb.from('members').select('workspace_id, role, status, workspaces(name)').eq('user_id', userId)),
  createShop: (name, storeName, prefix) => q(sb.rpc('create_workspace', {p_name:name, p_store:storeName, p_prefix:prefix})),
  joinShop: code => q(sb.rpc('join_workspace', {p_code:code})),
  touch: ws => sb.rpc('touch_member', {p_ws:ws}).then(() => {}, () => {}),
  newJoinCode: ws => q(sb.rpc('new_join_code', {p_ws:ws})),
  saveSettings: (ws, settings) => q(sb.from('workspaces').update({settings, name:settings.business}).eq('id', ws)),

  /* Loads everything the app needs for one shop. Sales: the last `days` days, plus older unpaid pay-later sales. */
  async loadShop(ws, days = SALES_DAYS){
    const since = new Date(); since.setHours(0,0,0,0); since.setDate(since.getDate() - days);
    const [w, stores, methods, prods, closings, members] = await Promise.all([
      q(sb.from('workspaces').select('*').eq('id', ws).single()),
      q(sb.from('stores').select('*').eq('workspace_id', ws).order('created_at')),
      q(sb.from('payment_methods').select('*').eq('workspace_id', ws).order('created_at')),
      qAll(() => sb.from('products').select('*').eq('workspace_id', ws).order('created_at').order('id')),
      qAll(() => sb.from('closings').select('*').eq('workspace_id', ws).order('day')),
      q(sb.from('members').select('*, profiles(full_name, email, avatar_url)').eq('workspace_id', ws).order('created_at')),
    ]);
    const credit = methods.filter(m => m.kind==='credit').map(m => m.id);
    const [recent, oldUnpaid] = await Promise.all([
      qAll(() => sb.from('sales').select('*').eq('workspace_id', ws).gte('ts', since.toISOString()).order('ts').order('id')),
      credit.length ? qAll(() => sb.from('sales').select('*').eq('workspace_id', ws).lt('ts', since.toISOString())
        .in('method_id', credit).is('paid_at', null).is('voided', null).order('ts')) : [],
    ]);
    const byStore = {};
    stores.forEach(s => byStore[s.id] = []);
    prods.forEach(p => (byStore[p.store_id] ||= []).push(toProduct(p)));
    return {
      workspace: {id:w.id, name:w.name, joinCode:w.join_code},
      settings: {...DEFAULT_SETTINGS, ...(w.settings || {})},
      stores: stores.map(toStore), methods: methods.map(toMethod), products: byStore,
      sales: [...oldUnpaid, ...recent].map(toSale), closings: closings.map(toClosing), members: members.map(toMember),
      loadedFrom: dayKey(since), fetchedDays: [],
    };
  },
  /* one older day for History */
  async salesForDay(ws, key){
    const a = new Date(key + 'T00:00'), b = new Date(a); b.setDate(b.getDate() + 1);
    return (await qAll(() => sb.from('sales').select('*').eq('workspace_id', ws).gte('ts', a.toISOString()).lt('ts', b.toISOString()).order('ts'))).map(toSale);
  },
  /* every sale ever, for backups */
  allSales: ws => qAll(() => sb.from('sales').select('*').eq('workspace_id', ws).order('ts').order('id')).then(r => r.map(toSale)),

  /* ---------- businesses (stores) ---------- */
  addStore: (ws, name, prefix) => q(sb.from('stores').insert({workspace_id:ws, name, prefix}).select().single()).then(toStore),
  updateStore: (id, patch) => q(sb.from('stores').update(patch).eq('id', id)),
  deleteStore: id => q(sb.from('stores').delete().eq('id', id)),

  /* ---------- payment methods ---------- */
  addMethod: (ws, m) => q(sb.from('payment_methods').insert({workspace_id:ws, name:m.name, kind:m.kind, active:m.active}).select().single()).then(toMethod),
  updateMethod: (id, m) => q(sb.from('payment_methods').update({name:m.name, kind:m.kind, active:m.active}).eq('id', id)),
  deleteMethod: id => q(sb.from('payment_methods').delete().eq('id', id)),

  /* ---------- products ---------- */
  /* list items may carry id/created_at (used by Undo to put a deleted product back exactly) */
  addProducts: (ws, storeId, list) => list.length ? q(sb.from('products').insert(list.map(p => ({
      workspace_id:ws, store_id:storeId, ...productRow(p), ...(p.id ? {id:p.id} : {}), ...(p.created_at ? {created_at:p.created_at} : {})
    }))).select()).then(rows => rows.map(toProduct)) : Promise.resolve([]),
  updateProduct: (id, p) => q(sb.from('products').update(productRow(p)).eq('id', id).select().single()).then(toProduct),
  deleteProduct: id => q(sb.from('products').delete().eq('id', id)),

  /* ---------- sales ---------- */
  /* The database gives the receipt number and takes items out of stock (record_sale in schema.sql) */
  recordSale: ({store, items, method, tendered, customer, ref, ts, late, byName}) => q(sb.rpc('record_sale', {
      p_store:store, p_items:items, p_method:method, p_tendered:tendered ?? null, p_customer:customer ?? null, p_ref:ref ?? null,
      p_ts: ts ? new Date(ts).toISOString() : null, p_late:!!late, p_by_name:byName || ''})).then(toSale),
  voidSale: (saleUuid, reason, byName) => q(sb.rpc('void_sale', {p_sale:saleUuid, p_reason:reason, p_by_name:byName})).then(toSale),
  markPaid: saleUuid => q(sb.from('sales').update({paid_at:new Date().toISOString()}).eq('id', saleUuid).select().single()).then(toSale),
  /* owner-only bulk insert (sample data, restoring a backup); skips receipt numbers that already exist */
  async insertSales(rows){
    for (let i = 0; i < rows.length; i += 500)
      await q(sb.from('sales').upsert(rows.slice(i, i + 500), {onConflict:'workspace_id,receipt_no', ignoreDuplicates:true}));
  },
  async clearSales(ws){
    await q(sb.from('closings').delete().eq('workspace_id', ws));
    await q(sb.from('sales').delete().eq('workspace_id', ws));
    await q(sb.from('stores').update({seq:0}).eq('workspace_id', ws));
  },
  saveClosing: (ws, c) => q(sb.from('closings').upsert({workspace_id:ws, store_id:c.store, day:c.date, expected:c.expected, counted:c.counted, diff:c.diff, by_name:c.by || ''},
    {onConflict:'store_id,day'}).select().single()).then(toClosing),

  /* ---------- people ---------- */
  setMember: (ws, userId, role, status) => q(sb.rpc('set_member', {p_ws:ws, p_user:userId, p_role:role, p_status:status})),
  removeMember: (ws, userId) => q(sb.rpc('remove_member', {p_ws:ws, p_user:userId})),
  async updateMyName(userId, name){
    await q(sb.from('profiles').update({full_name:name}).eq('id', userId));
    await q(sb.auth.updateUser({data:{full_name:name}}));
  },

  /* ---------- live updates from other devices ---------- */
  subscribe(ws, onChange){
    api.unsubscribe();
    channel = sb.channel('shop-' + ws);
    for (const t of ['workspaces','members','stores','payment_methods','products','sales','closings'])
      channel.on('postgres_changes', {event:'*', schema:'public', table:t, filter:(t==='workspaces' ? 'id=eq.' : 'workspace_id=eq.') + ws}, onChange);
    channel.subscribe();
  },
  unsubscribe(){ if (channel) { sb.removeChannel(channel); channel = null; } },
};
