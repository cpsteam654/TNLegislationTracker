/* CPS Legislation Tracker: the opening page.
   Pick your name, then prove it's you with a 6-digit code sent to your work
   email (or a password, if the tracker is set up that way). You stay signed
   in on that device, and everything you add is stamped with your name. */
(function () {
  const APP = window.CPS_APP;
  const sb = APP.sb;
  const CFG = APP.cfg;
  const MODE = CFG.signIn === 'password' ? 'password' : 'code';
  const $ = (s) => document.querySelector(s);
  const gate = $('#cps-gate');
  const pick = $('#gate-pick');
  const codeForm = $('#gate-code');
  const nameSel = $('#gate-name');
  const passFld = $('#gate-pass-fld');
  const goBtn = $('#gate-go');
  const msg = $('#gate-msg');
  const msg2 = $('#gate-msg2');
  const wait = $('#gate-wait');
  let team = [];
  let chosen = null;

  const say = (el, text, bad) => { el.textContent = text || ''; el.classList.toggle('is-bad', Boolean(bad)); };
  const busy = (form, on) => form.querySelectorAll('button, input, select').forEach((b) => { b.disabled = on; });
  const show = (which) => {
    wait.hidden = which !== 'wait';
    pick.hidden = which !== 'pick';
    codeForm.hidden = which !== 'code';
  };
  const friendly = (err) => {
    const m = String((err && (err.message || err.error_description)) || err || '');
    if (/rate|seconds|too many/i.test(m)) return 'Too many tries in a short time. Wait a minute, then try again.';
    if (/credentials|password/i.test(m)) return 'That password didn’t work. Check it with ' + (CFG.adminContact || 'the tracker admin') + ' and try again.';
    if (/expired|invalid|token/i.test(m)) return 'That code didn’t work. Use the newest email, or send a new code.';
    if (/not authorized|signups? not allowed/i.test(m)) return 'This email can’t receive sign-in codes yet. Ask ' + (CFG.adminContact || 'the tracker admin') + ' to finish the email setup.';
    return 'Something went wrong. Try again in a moment.';
  };

  function enter(me) {
    APP.me = me;
    document.body.classList.remove('is-locked');
    gate.hidden = true;
    const who = $('#cps-who-name');
    if (who) who.textContent = me.short_name;
    const C = window.cps;
    C.state.viewer = String(me.full_name).trim().split(/\s+/)[0];
    C.state.viewerFull = me.full_name;
    if (team.length) C.TEAM = team.map((t) => t.full_name);
    APP.loadTeam();
    APP.listen();
    APP.redraw();
  }

  async function afterSession() {
    const { data, error } = await sb.rpc('my_profile');
    const me = Array.isArray(data) ? data[0] : data;
    if (error || !me) {
      await sb.auth.signOut();
      show('pick');
      say(msg, 'That email isn’t on the tracker’s team list. Ask ' + (CFG.adminContact || 'the tracker admin') + ' to add you.', true);
      return;
    }
    enter(me);
  }

  async function loadTeam() {
    const { data, error } = await sb.rpc('team_directory');
    if (error) throw error;
    team = data || [];
    const last = localStorage.getItem('cps-member') || '';
    nameSel.replaceChildren(new Option('Choose your name', ''), ...team.map((t) => new Option(t.full_name, t.id, false, t.id === last)));
  }

  pick.addEventListener('submit', async (e) => {
    e.preventDefault();
    chosen = team.find((t) => t.id === nameSel.value);
    if (!chosen) { say(msg, 'Choose your name first.', true); return; }
    try { localStorage.setItem('cps-member', chosen.id); } catch (err) { /* private browsing */ }
    say(msg, '');
    busy(pick, true);
    try {
      if (MODE === 'password') {
        if (!$('#gate-pass').value) { say(msg, 'Enter the password.', true); return; }
        const { error } = await sb.auth.signInWithPassword({ email: chosen.email, password: $('#gate-pass').value });
        $('#gate-pass').value = '';
        if (error) throw error;
        await afterSession();
      } else {
        const { error } = await sb.auth.signInWithOtp({ email: chosen.email, options: { shouldCreateUser: true } });
        if (error) throw error;
        $('#gate-email').textContent = chosen.email;
        $('#gate-otp').value = '';
        say(msg2, '');
        show('code');
        $('#gate-otp').focus();
      }
    } catch (err) {
      console.warn(err);
      say(msg, friendly(err), true);
    } finally {
      busy(pick, false);
    }
  });

  codeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const token = $('#gate-otp').value.replace(/\D/g, '');
    if (token.length < 6) { say(msg2, 'Enter the 6-digit code from the email.', true); return; }
    busy(codeForm, true);
    try {
      const { error } = await sb.auth.verifyOtp({ email: chosen.email, token, type: 'email' });
      if (error) throw error;
      await afterSession();
    } catch (err) {
      console.warn(err);
      say(msg2, friendly(err), true);
    } finally {
      busy(codeForm, false);
    }
  });
  $('#gate-resend').addEventListener('click', async () => {
    try {
      const { error } = await sb.auth.signInWithOtp({ email: chosen.email, options: { shouldCreateUser: true } });
      if (error) throw error;
      say(msg2, 'A new code is on its way.');
    } catch (err) { say(msg2, friendly(err), true); }
  });
  $('#gate-back').addEventListener('click', () => { show('pick'); say(msg, ''); });

  const out = $('#cps-signout');
  if (out) out.addEventListener('click', async () => { if (sb) await sb.auth.signOut(); location.reload(); });

  async function start() {
    document.body.classList.add('is-locked');
    gate.hidden = false;
    passFld.hidden = MODE !== 'password';
    const passLabel = passFld.querySelector('span');
    if (passLabel && CFG.passwordLabel) passLabel.textContent = CFG.passwordLabel;
    goBtn.textContent = MODE === 'password' ? 'Sign in' : 'Email me a sign-in code';
    if (!sb) {
      show('wait');
      say(wait, 'This copy of the tracker isn’t connected to its database yet. Add the Supabase details to config.js (see the setup guide).', true);
      return;
    }
    show('wait');
    sb.auth.onAuthStateChange((event) => { if (event === 'SIGNED_OUT' && APP.me) location.reload(); });
    try {
      const { data } = await sb.auth.getSession();
      await loadTeam();
      if (data && data.session) { await afterSession(); return; }
      show('pick');
    } catch (err) {
      console.error(err);
      say(wait, 'The tracker couldn’t reach its database. Check your connection and reload the page.', true);
    }
  }
  start();
})();
