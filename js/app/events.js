/* Wires the page to the feature code.
   Buttons carry data-act="name"; ACTIONS maps each name to a function(el, event).
   A handler that returns false skips the redraw; async handlers redraw when they finish. */

const ACTIONS = {
  /* sign in */
  authTab:      el => { state.authTab = el.dataset.v; state.authMsg = ''; },
  google:       el => doGoogle(el),
  logout:       () => logout(),
  retry:        () => enterShop(),
  pwToggle:     el => { const i = el.parentElement.querySelector('input'), show = i.type==='password';
                        i.type = show ? 'text' : 'password'; el.textContent = show ? 'Hide' : 'Show'; el.setAttribute('aria-pressed', show); return false; },
  /* onboarding / account */
  recheck:      () => enterShop(),
  backToShop:   () => enterShop(),
  otherShop:    () => { state.modal = null; api.unsubscribe(); state.phase = 'onboard'; },
  account:      () => { state.modal = {type:'account'}; },

  /* navigation */
  view:         el => { state.view = el.dataset.v; state.openId = null; },
  store:        el => { Object.assign(state, {store:el.dataset.v, cart:[], dashDate:null, lastId:null, openId:null, cat:'all', sellQ:''}); },
  closeModal:   () => { state.modal = null; },
  closeSheet:   () => { state.openId = null; },
  undo:         () => { const f = undoFn; undoFn = null; $('#toast').hidden = true; if (f) f(); return false; },

  /* sell */
  add:          el => addToCart(el),
  inc:          el => changeQty(el, 1),
  dec:          el => changeQty(el, -1),
  rm:           el => { state.cart.splice(+el.dataset.i, 1); },
  method:       el => { state.method = el.dataset.v; },
  cat:          el => { state.cat = el.dataset.v; },
  lateOn:       () => { state.view = 'sell'; state.late = true; },
  record:       el => recordSale(el),
  goProducts:   () => { state.view = 'products'; state.modal = {type:'product', id:null}; },

  /* daily sales */
  dprev:        () => dashPrev(),
  dnext:        () => dashNext(),
  dtoday:       () => { state.dashDate = todayKey(); },

  /* history + receipt */
  open:         el => { state.openId = el.dataset.id; state.voidMode = false; state.voidReason = ''; },
  voidMode:     () => { state.voidMode = true; },
  cancelVoid:   () => { state.voidMode = false; },
  confirmVoid:  el => confirmVoid(el),
  paid:         el => markPaid(el),

  /* close the day */
  saveClose:    el => saveClosing(el),

  /* products */
  newProduct:   () => { state.modal = {type:'product', id:null}; },
  editProduct:  el => { state.modal = {type:'product', id:el.dataset.id}; },
  toggleProduct:el => toggleProduct(el),
  dupProduct:   el => duplicateProduct(el),
  delProduct:   el => arm(el) ? deleteProduct(state.modal.id, el) : false,
  delProductRow:el => arm(el) ? deleteProduct(el.dataset.id, el) : false,
  stockAdj:     el => { const i = $('#pStock'); i.value = fmtNum(Math.max(0, (num(i.value)||0) + +el.dataset.v)); return false; },

  /* users */
  editUser:     el => { state.modal = {type:'user', id:el.dataset.id}; },
  approve:      el => approveUser(el),
  decline:      el => arm(el) ? declineUser(el) : false,
  removeUser:   el => arm(el) ? removeUser(el) : false,
  newCode:      el => arm(el) ? newInviteCode(el) : false,
  copyCode:     () => copyText(db.workspace.joinCode, 'Invite code'),
  copyLink:     () => copyText(inviteLink(), 'Invite link'),

  /* settings */
  newStore:     () => { state.modal = {type:'store', id:null}; },
  editStore:    el => { state.modal = {type:'store', id:el.dataset.id}; },
  delStore:     el => deleteStore(el),
  newMethod:    () => { state.modal = {type:'method', id:null}; },
  editMethod:   el => { state.modal = {type:'method', id:el.dataset.id}; },
  delMethod:    el => deleteMethod(el),
  reset:        el => resetSales(el),
  export:       el => downloadBackup(el),
  import:       () => { $('#importFile').click(); return false; },
};

/* form id -> submit handler(event) */
const FORMS = {
  loginForm:doLogin, signupForm:doSignup, forgotForm:doForgot,
  createShopForm:doCreateShop, joinShopForm:doJoinShop,
  productForm:saveProduct, userForm:saveUser, accountForm:saveAccount,
  bizForm:saveBiz, storeForm:saveStore, methodForm:saveMethod,
  customForm:addCustomItem,
};

/* runs a handler and redraws afterwards unless it returned false */
function runAction(fn, ...args){
  let r;
  try { r = fn(...args); } catch (err) { console.error(err); toast(friendly(err)); return; }
  if (r && typeof r.then==='function') r.then(v => { if (v!==false) rerender(); }, err => { console.error(err); toast(friendly(err)); rerender(); });
  else if (r!==false) rerender();
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const a = el.dataset.act;
  // clicks inside a dialog bubble up to its backdrop; only a click on the backdrop itself closes it
  if ((a==='closeSheet' || a==='closeModal') && el.classList.contains('overlay') && e.target.closest('[data-stop]')) return;
  if (a!=='reset') state.resetArm = false;
  if (!ACTIONS[a]) return console.warn('No action named', a);
  runAction(ACTIONS[a], el, e);
});

document.addEventListener('submit', e => {
  const fn = FORMS[e.target.id]; if (!fn) return;
  e.preventDefault();
  runAction(fn, e);
});

/* live formatting of number inputs; runs before the handler below reads the value */
document.addEventListener('input', e => { if (e.target.matches('input[data-num]')) fmtNumInput(e.target, true); });

/* typing updates only the part of the page that depends on it, so the field keeps focus */
document.addEventListener('input', e => {
  const t = e.target;
  switch (t.id) {
    case 'tendered':   state.tendered = t.value; updateCheckout(); break;
    case 'customer':   state.customer = t.value; updateCheckout(); break;
    case 'lateTime':   state.lateTime = t.value; updateCheckout(); break;
    case 'hQ':         state.histQ = t.value; $('#hList').innerHTML = histRows(); break;
    case 'voidReason': state.voidReason = t.value; $('#cvBtn').disabled = !t.value.trim(); break;
    case 'float':      state.float = t.value; $('#closeOut').innerHTML = closeOut(); break;
    case 'counted':    state.counted = t.value; $('#closeOut').innerHTML = closeOut(); break;
    case 'pQ':         state.prodQ = t.value; $('#pList').innerHTML = prodRows(); break;
    case 'uQ':         state.userQ = t.value; $('#uList').innerHTML = userRows(); break;
    case 'sellQ':      state.sellQ = t.value; $('#sellGrid').innerHTML = sellGrid(); break;
  }
});

document.addEventListener('change', e => {
  const t = e.target;
  switch (t.id) {
    case 'pF':      state.prodF = t.value; $('#pList').innerHTML = prodRows(); break;
    case 'uF':      state.userF = t.value; $('#uList').innerHTML = userRows(); break;
    case 'hDate':   pickHistDate(t.value); break;
    case 'hM':      state.histM = t.value; $('#hList').innerHTML = histRows(); break;
    case 'aShop':   switchShop(t.value); break;
    case 'importFile': if (t.files[0]) restoreBackup(t.files[0]); break;
    case 'lateChk':
      state.late = t.checked;
      if (t.checked && !state.lateTime) { const d = new Date(Date.now()-30*60000); state.lateTime = pad(d.getHours())+':'+pad(d.getMinutes()); }
      rerender(); break;
  }
});

document.addEventListener('keydown', e => {
  if (e.key==='Escape' && (state.openId || state.modal)) { state.openId = null; state.modal = null; rerender(); }
});

window.addEventListener('online',  () => { state.online = true;  if (state.phase==='app') { reloadShop(); softRender(); } });
window.addEventListener('offline', () => { state.online = false; if (state.phase==='app') softRender(); });
