/* After signing in, someone with no active shop either creates a shop (becomes owner)
   or asks to join one with the owner's invite code (waits for approval). */

const JOIN_KEY = 'bentalog-join';
const savedJoinCode = () => { try { return sessionStorage.getItem(JOIN_KEY) || ''; } catch(e) { return ''; } };

function viewOnboard(){
  const u = state.user, pending = state.memberships.filter(m => m.status==='pending'), disabled = state.memberships.filter(m => m.status==='disabled');
  const hasShop = state.memberships.some(m => m.status==='active');
  const name = (u.user_metadata && (u.user_metadata.full_name || u.user_metadata.name)) || '';
  return `<div class="onboard">
    <div class="ob-top">
      <h1 class="logo" style="font-size:30px">Benta<b>Log</b></h1>
      <div class="actions" style="align-items:center"><span class="muted" style="font-size:14px">${esc(u.email)}</span>
        ${hasShop ? '<button class="btn sm" data-act="backToShop">Back to my shop</button>' : ''}
        <button class="btn ghost sm" data-act="logout">Sign out</button></div>
    </div>
    <div><h2 style="font-size:26px">${name ? 'Hi ' + esc(name.split(' ')[0]) + '!' : 'Welcome!'} Let’s get you into a shop.</h2>
      <p class="muted" style="margin:6px 0 0">Owners set up the shop. Staff join with the owner’s invite code.</p></div>
    ${pending.map(m => `<div class="card pending"><div><strong>Waiting for approval from ${esc(m.workspaces ? m.workspaces.name : 'the shop')}</strong>
        <div class="muted" style="font-size:14px">The owner will see your request under Users. This page opens the shop once you’re approved.</div></div>
        <div><button class="btn sm" data-act="recheck">Check again</button></div></div>`).join('')}
    ${disabled.map(m => `<div class="card pending" style="background:var(--red-soft);border-color:var(--red)"><strong>Your access to ${esc(m.workspaces ? m.workspaces.name : 'a shop')} is turned off.</strong><span class="muted" style="font-size:14px">Ask the owner to turn it back on.</span></div>`).join('')}
    <div class="ob-grid">
      <form id="createShopForm" class="card ob-card" novalidate>
        <h2>Set up a new shop</h2>
        <p class="muted" style="margin:0;font-size:14px">You’ll be the owner. You can add more businesses, products and staff later.</p>
        <label class="field">Shop name<input id="oShop" maxlength="40" placeholder="e.g. Santos Trading"></label>
        <label class="field"><span>First business <span class="hint">You can add more as tabs later</span></span><input id="oStore" maxlength="30" placeholder="e.g. Coffee shop, Hardware, Main store"></label>
        <p class="err" id="oErr" role="alert"></p>
        <button class="btn primary" type="submit">Create shop</button>
      </form>
      <form id="joinShopForm" class="card ob-card" novalidate>
        <h2>Join a shop</h2>
        <p class="muted" style="margin:0;font-size:14px">Ask the owner for the 6-character invite code. It’s under Users in their app.</p>
        <label class="field">Invite code<input id="oCode" maxlength="6" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="7K2QXA" value="${esc(savedJoinCode())}" style="font-family:var(--f-mono);letter-spacing:.15em;text-transform:uppercase"></label>
        <p class="err" id="jErr" role="alert"></p>
        <button class="btn primary" type="submit">Ask to join</button>
      </form>
    </div>
  </div>`;
}

/* ---------- actions ---------- */
async function doCreateShop(e){
  const shop = $('#oShop').value.trim(), storeName = $('#oStore').value.trim() || 'Main store';
  if (!shop) { $('#oErr').textContent = 'Enter a shop name.'; return false; }
  let ws;
  if (!await attempt(async () => { ws = await api.createShop(shop, storeName, autoPrefix(storeName)); }, {btn:e.submitter, errEl:$('#oErr'), label:'Creating…'})) return false;
  toast(shop + ' is ready. Add your products to start selling.');
  await enterShop(ws, 'products');
  return false;   // enterShop already drew the screen
}

async function doJoinShop(e){
  const code = $('#oCode').value.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) { $('#jErr').textContent = 'The invite code has 6 letters and numbers.'; return false; }
  let res;
  if (!await attempt(async () => { res = await api.joinShop(code); }, {btn:e.submitter, errEl:$('#jErr'), label:'Sending…'})) return false;
  try { sessionStorage.removeItem(JOIN_KEY); } catch(err) {}
  toast('Request sent to ' + res.name + '. The owner needs to approve it.');
  await enterShop();
  return false;
}
