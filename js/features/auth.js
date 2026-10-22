/* Sign in, create account, Google, forgot / new password, and the "not configured yet" screen.
   Session changes are handled in js/app/main.js (onAuth). */

function viewSetup(){
  return `<div class="screen"><div class="card setup">
    <h1 class="logo" style="font-size:34px">Benta<b>Log</b></h1>
    <h2 style="font-size:20px">Connect your Supabase project</h2>
    <ol>
      <li>Create a free project at <a href="https://supabase.com" target="_blank" rel="noopener">supabase.com</a>.</li>
      <li>In the project, open <b>SQL Editor</b>, paste everything from <code>supabase/schema.sql</code>, and click <b>Run</b>.</li>
      <li>Open <b>Project Settings → API</b>. Copy the <b>Project URL</b> and the <b>anon public</b> key into <code>js/config.js</code>.</li>
      <li>Reload this page.</li>
    </ol>
    <p class="note">The full guide, including Google sign-in, is in <code>README.md</code>. ${window.supabase ? '' : '<br><strong>The Supabase library didn’t load.</strong> Check your internet connection.'}</p>
  </div></div>`;
}

function viewAuth(){
  const t = state.authTab;
  const tabs = `<div class="seg auth-tabs" role="group" aria-label="Account">
      <button data-act="authTab" data-v="login" aria-pressed="${t==='login'}">Sign in</button>
      <button data-act="authTab" data-v="signup" aria-pressed="${t==='signup'}">Create account</button>
    </div>`;
  const google = `<button type="button" class="btn google" data-act="google">${GOOGLE_G}<span>Continue with Google</span></button><div class="or">or</div>`;
  const forms = {
    login: `<form id="loginForm" class="auth-form" novalidate>
        <div><h2>Welcome back</h2><p class="muted lede">Sign in to record and review sales.</p></div>
        <p class="ok" role="status">${esc(state.authMsg)}</p>
        ${google}
        <label class="field">Email<input id="lEmail" type="email" autocomplete="email" autocapitalize="none" spellcheck="false"></label>
        <label class="field">Password${pwInput('lPass','current-password')}</label>
        <div style="text-align:right;margin-top:-6px"><button type="button" class="linkbtn" data-act="authTab" data-v="forgot" style="font-size:13px">Forgot password?</button></div>
        <p class="err" id="authErr" role="alert"></p>
        <button class="btn primary record" type="submit">Sign in</button>
      </form>`,
    signup: `<form id="signupForm" class="auth-form" novalidate>
        <div><h2>Create your account</h2><p class="muted lede">Then set up your shop, or join one with an invite code.</p></div>
        ${google}
        <label class="field">Full name<input id="sName" autocomplete="name" maxlength="60"></label>
        <label class="field">Email<input id="sEmail" type="email" autocomplete="email" autocapitalize="none" spellcheck="false"></label>
        <div class="row2">
          <label class="field"><span>Password <span class="hint">6+ characters</span></span>${pwInput('sPass','new-password')}</label>
          <label class="field">Confirm password${pwInput('sPass2','new-password')}</label>
        </div>
        <p class="err" id="authErr" role="alert"></p>
        <button class="btn primary record" type="submit">Create account</button>
      </form>`,
    forgot: `<form id="forgotForm" class="auth-form" novalidate>
        <div><h2>Reset your password</h2><p class="muted lede">We’ll email you a link to set a new one.</p></div>
        <p class="ok" role="status">${esc(state.authMsg)}</p>
        <label class="field">Email<input id="fEmail" type="email" autocomplete="email" autocapitalize="none"></label>
        <p class="err" id="authErr" role="alert"></p>
        <button class="btn primary record" type="submit">Send reset link</button>
        <p class="muted" style="margin:0;text-align:center;font-size:14px"><button type="button" class="linkbtn" data-act="authTab" data-v="login">Back to sign in</button></p>
      </form>`,
    newpw: `<form id="newPwForm" class="auth-form" novalidate>
        <div><h2>Set a new password</h2><p class="muted lede">You opened a password reset link. Choose your new password.</p></div>
        <div class="row2">
          <label class="field">New password${pwInput('nPass','new-password')}</label>
          <label class="field">Confirm${pwInput('nPass2','new-password')}</label>
        </div>
        <p class="err" id="authErr" role="alert"></p>
        <button class="btn primary record" type="submit">Save new password</button>
      </form>`,
  };
  return `<div class="auth">
    <div class="auth-side">
      <h1 class="logo">Benta<b>Log</b></h1>
      <p>Sales recording & monitoring for any shop, stall or branch.</p>
      <ul class="auth-points"><li>Record every sale in a few taps</li><li>See daily totals, unpaid accounts and best sellers</li><li>Your team signs in on their own phones, synced in real time</li></ul>
    </div>
    <div class="card auth-card">${t==='login'||t==='signup' ? tabs : ''}${forms[t] || forms.login}</div>
  </div>`;
}

/* ---------- actions ---------- */
const authErr = m => { const e = $('#authErr'); if (e) e.textContent = m; return false; };

async function doLogin(e){
  const email = $('#lEmail').value.trim(), pw = $('#lPass').value;
  if (!isEmail(email)) return authErr('Enter your email address.');
  if (!pw) return authErr('Enter your password.');
  if (!await attempt(() => api.signIn(email, pw), {btn:e.submitter, errEl:$('#authErr'), label:'Signing in…'})) return false;
  // success continues in onAuth (main.js)
}

async function doSignup(e){
  const name = $('#sName').value.trim(), email = $('#sEmail').value.trim(), pw = $('#sPass').value, pw2 = $('#sPass2').value;
  if (name.length < 2) return authErr('Enter your full name.');
  if (!isEmail(email)) return authErr('Enter a valid email address.');
  if (pw.length < 6) return authErr('Password must be at least 6 characters.');
  if (pw !== pw2) return authErr('The two passwords don’t match.');
  let res;
  if (!await attempt(async () => { res = await api.signUp(name, email, pw); }, {btn:e.submitter, errEl:$('#authErr'), label:'Creating…'})) return false;
  if (!res.session) {   // email confirmation is on in Supabase
    state.authTab = 'login'; state.authMsg = `Almost done. We sent a confirmation link to ${email}. Open it, then sign in.`;
    rerender(); $('#lEmail').value = email;
  }
  return false;          // with a session, onAuth (main.js) takes over
}

async function doGoogle(el){
  await attempt(() => api.google(), {btn:el, errEl:$('#authErr'), label:'Opening Google…'});
  return false; // the browser leaves for Google; nothing to redraw
}

async function doForgot(e){
  const email = $('#fEmail').value.trim();
  if (!isEmail(email)) return authErr('Enter the email you signed up with.');
  if (!await attempt(() => api.sendReset(email), {btn:e.submitter, errEl:$('#authErr'), label:'Sending…'})) return false;
  state.authMsg = `If ${email} has an account, a reset link is on its way. Check your inbox.`;
}

async function doNewPassword(e){
  const pw = $('#nPass').value, pw2 = $('#nPass2').value;
  if (pw.length < 6) return authErr('Password must be at least 6 characters.');
  if (pw !== pw2) return authErr('The two passwords don’t match.');
  if (!await attempt(() => api.setPassword(pw), {btn:e.submitter, errEl:$('#authErr')})) return false;
  state.authTab = 'login'; toast('Password updated');
  const {data} = await sb.auth.getSession();
  if (data.session) { state.user = data.session.user; await enterShop(); }
  return false;
}

async function logout(){
  api.unsubscribe(); await api.signOut();
  me = null; db = emptyDb();
  Object.assign(state, {phase:'auth', authTab:'login', authMsg:'', cart:[], modal:null, openId:null, lastId:null, view:'sell'});
  rerender();
}
