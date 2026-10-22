/* Users (owners only): invite code, join requests, roles and access.
   People sign up themselves (email or Google), then join with the invite code; an owner approves them here. */

const inviteLink = () => appUrl() + '?join=' + db.workspace.joinCode;

function viewUsers(){
  const pend = pendingMembers();
  return `<div class="sec-head"><h2>Users</h2><span class="muted" style="font-size:14px">${db.members.filter(m=>m.status==='active').length} with access</span></div>
  <div class="card invite">
    <div><strong>Invite your staff</strong><div class="muted" style="font-size:14px">They create an account (email or Google), then enter this code or open the link. You approve them below.</div></div>
    <div class="invite-row">
      <span class="code" aria-label="Invite code">${esc(db.workspace.joinCode)}</span>
      <button class="btn sm" data-act="copyCode">Copy code</button>
      <button class="btn sm" data-act="copyLink">Copy invite link</button>
      <button class="btn sm ghost" data-act="newCode" data-confirm="Tap again: old code stops working">New code</button>
    </div>
  </div>
  ${pend.length?`<div class="card pending"><div><strong>${pend.length} ${pend.length===1?'person wants':'people want'} to join</strong><div class="muted" style="font-size:14px">They can’t see anything until you approve them.</div></div>
    ${pend.map(u=>`<div class="pending-row"><div class="who">${avatarHtml(u.name, u.avatar)}<div>${esc(u.name || u.email)}<small>${esc(u.email||'')} · asked ${fmtWhen(u.created)}</small></div></div>
      <div class="actions"><button class="btn primary sm" data-act="approve" data-id="${u.id}">Approve</button><button class="btn sm" data-act="decline" data-id="${u.id}" data-confirm="Tap again to decline">Decline</button></div></div>`).join('')}</div>`:''}
  <div class="filters f2">
    <label class="field q">Search<input id="uQ" placeholder="Name or email" value="${esc(state.userQ)}"></label>
    <label class="field">Show<select id="uF">${[['all','Everyone'],['owner','Owners'],['staff','Staff'],['disabled','Deactivated']].map(([k,v])=>`<option value="${k}" ${state.userF===k?'selected':''}>${v}</option>`).join('')}</select></label>
  </div>
  <div class="card" id="uList">${userRows()}</div>
  <p class="notice">Staff can record sales and view reports. Owners can also void sales, save the day's closing, and manage products, businesses, settings and users.</p>`;
}

function userRows(){
  const q = state.userQ.trim().toLowerCase(), f = state.userF;
  const rows = db.members.filter(u => u.status!=='pending' && (!q || (u.name||'').toLowerCase().includes(q) || (u.email||'').toLowerCase().includes(q)) &&
    (f==='all' || (f==='disabled' ? u.status==='disabled' : u.role===f))).sort((a,b) => (a.role===b.role ? (a.name||'').localeCompare(b.name||'') : a.role==='owner' ? -1 : 1));
  if (!rows.length) return `<div class="empty" style="padding:28px">No users match.</div>`;
  return `<div class="tbl-wrap"><table class="rtable"><thead><tr><th>User</th><th>Role</th><th>Status</th><th>Last active</th><th></th></tr></thead><tbody>
    ${rows.map(u=>`<tr class="${u.status==='disabled'?'dim':''}">
      <td class="main"><div class="who">${avatarHtml(u.name, u.avatar)}<div>${esc(u.name || u.email)}${u.id===me.id?' <span class="pill p-paid">You</span>':''}<small>${esc(u.email||'')}</small></div></div></td>
      <td data-label="Role"><span class="pill ${u.role==='owner'?'p-gcash':'p-paid'}">${ROLES[u.role]}</span></td>
      <td data-label="Status"><span class="pill ${STATUS[u.status][1]}">${STATUS[u.status][0]}</span></td>
      <td data-label="Last active">${fmtWhen(u.lastLogin)}</td>
      <td class="act">${u.id===me.id ? '' : `<button class="btn sm" data-act="editUser" data-id="${u.id}">Edit</button>`}</td>
    </tr>`).join('')}
  </tbody></table></div>`;
}

function userModal(){
  const u = db.members.find(x => x.id===state.modal.id);
  return `<form id="userForm" class="card sheet" data-stop role="dialog" aria-label="Edit user" novalidate>
    <div class="cart-head"><h2>Edit user</h2><button type="button" class="btn ghost" data-act="closeModal">Close</button></div>
    <div class="who">${avatarHtml(u.name, u.avatar)}<div>${esc(u.name || u.email)}<small>${esc(u.email||'')}</small></div></div>
    <div class="row2">
      <label class="field">Role<select id="uRole">${Object.entries(ROLES).map(([k,v])=>`<option value="${k}" ${k===u.role?'selected':''}>${v}</option>`).join('')}</select></label>
      <label class="field">Access<select id="uStatus">${[['active','Active'],['disabled','Deactivated']].map(([k,v])=>`<option value="${k}" ${k===u.status?'selected':''}>${v}</option>`).join('')}</select></label>
    </div>
    <p class="note">Deactivated users can still sign in, but they can’t see or change anything in this shop.</p>
    <p class="err" id="mErr" role="alert"></p>
    <div class="actions"><button class="btn primary" type="submit">Save changes</button><button type="button" class="btn" data-act="removeUser" data-confirm="Tap again to remove">Remove from shop</button></div>
  </form>`;
}

/* ---------- actions ---------- */
const member = id => db.members.find(m => m.id===id);

async function approveUser(el){
  const u = member(el.dataset.id);
  if (!await attempt(() => api.setMember(db.workspace.id, u.id, u.role, 'active'), {btn:el})) return false;
  u.status = 'active'; toast((u.name || u.email) + ' can now use the shop');
}
async function declineUser(el){
  const u = member(el.dataset.id);
  if (!await attempt(() => api.removeMember(db.workspace.id, u.id), {btn:el})) return false;
  db.members = db.members.filter(m => m!==u); toast('Request from ' + (u.name || u.email) + ' declined');
}
async function saveUser(e){
  const u = member(state.modal.id), role = $('#uRole').value, status = $('#uStatus').value;
  if (!await attempt(() => api.setMember(db.workspace.id, u.id, role, status), {btn:e.submitter, errEl:$('#mErr')})) return false;
  Object.assign(u, {role, status}); state.modal = null; toast('Saved changes to ' + (u.name || u.email));
}
async function removeUser(el){
  const u = member(state.modal.id);
  if (!await attempt(() => api.removeMember(db.workspace.id, u.id), {btn:el, errEl:$('#mErr')})) return false;
  db.members = db.members.filter(m => m!==u); state.modal = null; toast((u.name || u.email) + ' removed from the shop');
}
async function newInviteCode(el){
  let code;
  if (!await attempt(async () => { code = await api.newJoinCode(db.workspace.id); }, {btn:el})) return false;
  db.workspace.joinCode = code; toast('New invite code: ' + code + '. The old one no longer works.');
}
async function copyText(text, what){
  try { await navigator.clipboard.writeText(text); toast(what + ' copied'); }
  catch (e) { prompt('Copy this ' + what.toLowerCase() + ':', text); }
  return false;
}
