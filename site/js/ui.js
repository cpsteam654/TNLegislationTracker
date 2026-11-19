(function () {
  const C = (window.cps = window.cps || {});
  C.state = C.state || { open: new Set(), sort: 'filed', member: null, bill: null, pending: new Set() };
  C.WATCH = ['Health care', 'AI & technology', 'PBMs & pharmacy', 'Recycling & waste'];
  C.SESSION = '2027-01-12';
  C.TEAM = ['Dave Cooley', 'Connor Rose', 'Emily Bryan', 'Melodie Shrader'];

  C.split = (s) => String(s || '').split(';').map((x) => x.trim()).filter(Boolean);
  C.rows = (id) => {
    const d = dash.data(id);
    return d.status === 'ok' && Array.isArray(d.data) ? d.data : [];
  };
  C.status = (id) => dash.data(id).status;

  // element helper: text only ever goes in through textContent
  C.h = function (tag, attrs, ...kids) {
    const e = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'text') e.textContent = v;
        else if (k === 'class') e.className = v;
        else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
        else e.setAttribute(k, v === true ? '' : String(v));
      }
    }
    for (const k of kids.flat()) {
      if (k == null || k === false || k === '') continue;
      e.append(k instanceof Node ? k : document.createTextNode(String(k)));
    }
    return e;
  };
  const h = C.h;
  C.fill = (el, ...kids) => el.replaceChildren(...kids.flat().filter((k) => k != null && k !== false && k !== ''));
  // data-where value with &, = and % percent-encoded
  C.where = (k, v) => `${k}=${String(v).replace(/%/g, '%25').replace(/&/g, '%26').replace(/=/g, '%3D')}`;

  const parseDay = d3.utcParse('%Y-%m-%d');
  const fmt = (f) => (s) => { const d = s && parseDay(String(s).slice(0, 10)); return d ? d3.utcFormat(f)(d) : ''; };
  C.day = fmt('%b %-d');
  C.dayFull = fmt('%b %-d, %Y');
  C.dayWk = fmt('%a, %b %-d, %Y');
  C.time12 = (t) => {
    if (!t) return '';
    const [H, M] = String(t).split(':').map(Number);
    if (Number.isNaN(H)) return String(t);
    return `${((H + 11) % 12) + 1}:${String(M || 0).padStart(2, '0')} ${H < 12 ? 'AM' : 'PM'}`;
  };
  C.today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  C.initials = (name) => {
    const parts = String(name || '').replace(/,?\s+(Jr|Sr|II|III)\.?$/i, '').replace(/'[^']*'/g, '').split(/\s+/).filter(Boolean);
    if (!parts.length) return '–';
    return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  };
  // lawmaker photos: one sprite image, 12 across; each lawmaker row carries its tile number (or -1)
  C.SPRITE = { cols: 12, rows: 11 };
  let photoCache = { src: null, map: new Map() };
  C.photoOf = (id) => {
    if (!id) return -1;
    const rows = C.rows('legislators');
    if (photoCache.src !== rows) photoCache = { src: rows, map: new Map(rows.map((r) => [r.id, Number(r.photo)])) };
    const n = photoCache.map.get(id);
    return Number.isInteger(n) && n >= 0 ? n : -1;
  };
  C.avatar = (name, party, size, id) => {
    const cls = `cps-av cps-av-${party || 'x'}${size ? ' cps-av-' + size : ''}`;
    const n = C.photoOf(id);
    if (n < 0) return h('span', { class: cls, 'aria-hidden': 'true', text: C.initials(name) });
    const col = n % C.SPRITE.cols;
    const row = Math.floor(n / C.SPRITE.cols);
    const x = (100 * col) / (C.SPRITE.cols - 1);
    const y = (100 * row) / (C.SPRITE.rows - 1);
    return h('span', { class: cls + ' cps-av-photo', 'aria-hidden': 'true', style: `background-position:${x.toFixed(3)}% ${y.toFixed(3)}%` });
  };
  C.partyBadge = (p) => (p === 'R' || p === 'D')
    ? h('span', { class: `cps-pb cps-pb-${p}`, title: p === 'R' ? 'Republican' : 'Democrat', 'aria-label': p === 'R' ? 'Republican' : 'Democrat', text: p })
    : null;
  C.memberBtn = (id, name, party) => h('button', { type: 'button', class: 'cps-sp', 'data-member': id, 'aria-label': `Open profile of ${name}` },
    C.partyBadge(party), h('span', { class: 'cps-sp-name', text: name }));
  C.chip = (text, kind) => h('span', { class: 'cps-chip' + (kind ? ' cps-chip-' + kind : ''), text });
  C.topicChip = (t) => C.chip(t, C.WATCH.includes(t) ? 'focus' : '');
  // "General" = major legislation the team monitors that doesn't directly affect a client
  C.isGeneral = (name) => String(name || '').trim().toLowerCase() === 'general';
  C.clientChip = (c) => C.isGeneral(c)
    ? h('span', { class: 'cps-chip cps-chip-general', title: 'General: monitoring, no direct client impact', text: c })
    : C.chip(c, 'client');

  C.text = function (name, src, fn) {
    dash.draw(name, (el) => {
      const d = dash.data(src);
      if (d.status !== 'ok') {
        el.textContent = '—';
        if (d.status !== 'loading') el.classList.remove('dash-skeleton');
        return;
      }
      el.classList.remove('dash-skeleton');
      const v = fn(d.data);
      el.textContent = v == null || v === '' ? '—' : String(v);
    });
  };

  // ---------- saving ----------
  C.db = async () => {
    const db = await claude.use('db');
    if (!db) throw new Error('no db');
    return db;
  };
  C.slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  C.showErr = (form, on) => form.querySelectorAll('.cps-err').forEach((p) => { p.hidden = !on; });
  C.busy = (form, on) => form.querySelectorAll('button[type="submit"]').forEach((b) => { b.disabled = on; });

  // ---------- tabs ----------
  const TABS = ['home', 'bills', 'clients', 'themes', 'lawmakers'];
  C.showTab = function (id) {
    if (!TABS.includes(id)) return;
    document.querySelectorAll('#cps [data-panel]').forEach((s) => { s.hidden = s.id !== id; });
    document.querySelectorAll('#cps .cps-tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === id)));
    dash.setLink(id);
    try { dash.draw('side-clients'); } catch (err) { /* drawn once clients.js loads */ }
    const main = document.querySelector('#cps .cps-main');
    if (main && main.getBoundingClientRect().top < 0) main.scrollIntoView({ block: 'start' });
  };
  // any [data-go="tab"] button jumps to that page
  document.addEventListener('click', (e) => {
    const g = e.target.closest && e.target.closest('#cps [data-go]');
    if (!g) return;
    const p = g.getAttribute('data-go-params');
    if (p) { try { dash.setParams({ topic: '', client: '', party: '', member: '', watch: '', ...JSON.parse(p) }); } catch (err) { /* ignore */ } }
    C.showTab(g.getAttribute('data-go'));
  });
  document.addEventListener('click', (e) => {
    const t = e.target.closest && e.target.closest('#cps .cps-tab');
    if (t) C.showTab(t.dataset.tab);
  });
  const startTab = (location.hash || '').replace('#', '');
  if (TABS.includes(startTab)) C.showTab(startTab);

  // ---------- dialogs ----------
  C.openDialog = (d) => {
    if (!d) return;
    if (d.open) return;
    try { d.showModal(); } catch (err) { d.setAttribute('open', ''); }
  };
  document.addEventListener('click', (e) => {
    const closer = e.target.closest && e.target.closest('#cps [data-close]');
    if (closer) { const d = closer.closest('dialog'); if (d) d.close(); return; }
    if (e.target.tagName === 'DIALOG' && e.target.classList.contains('cps-dialog')) e.target.close();
  });

  // ---------- open a lawmaker profile from anywhere ----------
  C.openMember = function (id) {
    C.state.member = id;
    const contact = C.rows('contacts').find((r) => r.id === id) || {};
    const cf = document.querySelector('#conn-form');
    if (cf) {
      cf.elements.team.value = contact.team || '';
      cf.elements.note.value = contact.note || '';
      C.showErr(cf, false);
    }
    const lf = document.querySelector('#log-form');
    if (lf) {
      ['contact', 'topic', 'notes'].forEach((n) => { lf.elements[n].value = ''; });
      lf.elements.by.value = C.state.viewerFull || '';
      lf.elements.date.value = C.today();
      lf.elements.result.value = 'Neutral / listening';
      C.showErr(lf, false);
    }
    document.querySelectorAll('#conn-details, #log-details').forEach((d) => { d.open = false; });
    ['pf-head', 'pf-note', 'pf-stats', 'pf-bills', 'pf-lead', 'pf-committees', 'pf-bio', 'pf-contact', 'pf-links', 'pf-connection', 'pf-outreach'].forEach((n) => dash.draw(n));
    const d = document.querySelector('#profile-dialog');
    C.openDialog(d);
    const body = d && d.querySelector('.cps-pf-cols');
    if (body) body.scrollTop = 0;
  };
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('#cps [data-member]');
    if (!b) return;
    e.preventDefault();
    C.openMember(b.getAttribute('data-member'));
  });

  // ---------- countdown to gavel-in (plain date arithmetic, no data) ----------
  C.daysToSession = () => {
    const now = new Date();
    return Math.round((Date.UTC(2027, 0, 12) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
  };
  const countdown = (el) => {
    const days = C.daysToSession();
    el.textContent = String(Math.abs(days));
    document.querySelectorAll('#cps [data-cd]').forEach((s) => { s.hidden = (s.dataset.cd === 'before') !== (days >= 0); });
  };
  dash.draw('countdown', countdown);
  dash.draw('h-countdown', countdown);

  // team-member suggestions for the connection and outreach forms
  dash.draw('team-list', (el) => {
    const names = new Set(C.TEAM);
    C.rows('contacts').forEach((r) => C.split(String(r.team || '').replace(/,/g, ';')).forEach((n) => names.add(n)));
    C.rows('outreach').forEach((r) => { if (r.by) names.add(String(r.by).trim()); });
    C.fill(el, ...[...names].sort().map((n) => h('option', { value: n })));
  });

  // print every tab
  window.addEventListener('beforeprint', () => {
    document.querySelectorAll('#cps [data-panel]').forEach((s) => { s.hidden = false; });
  });
  window.addEventListener('afterprint', () => {
    const cur = document.querySelector('#cps .cps-tab[aria-selected="true"]');
    C.showTab(cur ? cur.dataset.tab : 'home');
  });
})();
