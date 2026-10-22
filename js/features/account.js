/* "My account" dialog: name, password (email accounts only), switch shop, sign out. */

function accountModal(){
  const google = me.provider==='google', shops = state.memberships.filter(m => m.status==='active');
  return `<form id="accountForm" class="card sheet" data-stop role="dialog" aria-label="My account" novalidate>
    <div class="cart-head"><h2>My account</h2><button type="button" class="btn ghost" data-act="closeModal">Close</button></div>
    <div class="who">${avatarHtml(me.name, me.avatar)}<div>${esc(me.email)}<small>${ROLES[me.role]} at ${esc(db.workspace.name)} · ${google ? 'Signs in with Google' : 'Signs in with email'}</small></div></div>
    <label class="field">Full name<input id="aName" value="${esc(me.name)}" maxlength="60" autocomplete="name"></label>
    ${google ? '<p class="note">Your password is managed by Google.</p>' : `
    <div class="eyebrow" style="margin-top:4px">Change password <span class="hint" style="text-transform:none;letter-spacing:0">Leave blank to keep it</span></div>
    <div class="row2">
      <label class="field">New password${pwInput('aNew','new-password')}</label>
      <label class="field">Confirm new password${pwInput('aNew2','new-password')}</label>
    </div>`}
    <p class="err" id="mErr" role="alert"></p>
    <div class="actions"><button class="btn primary" type="submit">Save</button></div>
    <div class="eyebrow" style="margin-top:6px">Shops</div>
    ${shops.length > 1 ? `<label class="field">Open shop<select id="aShop">${shops.map(m=>`<option value="${m.workspace_id}" ${m.workspace_id===db.workspace.id?'selected':''}>${esc(m.workspaces ? m.workspaces.name : 'Shop')}</option>`).join('')}</select></label>` : ''}
    <div class="actions"><button type="button" class="btn" data-act="otherShop">Create or join another shop</button><button type="button" class="btn" data-act="logout">Sign out</button></div>
  </form>`;
}

/* ---------- actions ---------- */
async function saveAccount(e){
  const name = $('#aName').value.trim(), errEl = $('#mErr'), nw = $('#aNew') ? $('#aNew').value : '', nw2 = $('#aNew2') ? $('#aNew2').value : '';
  if (name.length < 2) { errEl.textContent = 'Enter your full name.'; return false; }
  if (nw || nw2) {
    if (nw.length < 6) { errEl.textContent = 'New password must be at least 6 characters.'; return false; }
    if (nw !== nw2) { errEl.textContent = 'The new passwords don’t match.'; return false; }
  }
  const ok = await attempt(async () => {
    if (name !== me.name) await api.updateMyName(me.id, name);
    if (nw) await api.setPassword(nw);
  }, {btn:e.submitter, errEl});
  if (!ok) return false;
  me.name = name; const m = db.members.find(x => x.id===me.id); if (m) m.name = name;
  state.modal = null; toast(nw ? 'Password changed' : 'Account saved');
}

async function switchShop(id){
  if (id===db.workspace.id) return;
  state.modal = null;
  await enterShop(id);
}
