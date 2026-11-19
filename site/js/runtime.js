/* CPS Legislation Tracker: standalone runtime.
   Stands in for the Claude dashboard runtime so the same tracker code runs
   on any web host. It loads the bill files, keeps the team's shared records
   in sync with Supabase, works out the calculations, and redraws the page
   whenever anything changes. */
(function () {
  const CFG = window.CPS_CONFIG || {};
  const STORE = ['clients', 'bill_clients', 'hearings', 'contacts', 'outreach'];
  const FILES = { bills: 'data/bills.json', legislators: 'data/legislators.json', refresh: 'data/refresh.json' };
  const PARAMS0 = { topic: '', client: '', party: '', member: '', watch: '' };

  const src = {};
  [...STORE, ...Object.keys(FILES)].forEach((id) => { src[id] = { status: 'loading', data: [] }; });
  const calcs = {};
  const draws = {};
  const hooks = [];
  let params = { ...PARAMS0 };

  // ---------- data and calculations ----------
  function data(id) {
    if (src[id]) return src[id];
    const c = calcs[id];
    if (!c) return { status: 'missing', data: [] };
    const ins = c.inputs.map(data);
    const notReady = ins.find((d) => d.status !== 'ok');
    if (notReady) return { status: notReady.status === 'error' ? 'error' : 'loading', data: [] };
    const refs = ins.map((d) => d.data);
    if (c.memo && c.memo.refs.every((r, i) => r === refs[i])) return c.memo.out;
    let out;
    try { out = { status: 'ok', data: c.fn(...refs) }; } catch (err) { console.error('calc ' + id, err); out = { status: 'error', data: [] }; }
    c.memo = { refs, out };
    return out;
  }

  // ---------- drawing ----------
  function runOne(name, el) {
    const d = draws[name];
    if (!d) return;
    try {
      if (typeof d === 'function') d(el);
      else {
        if (!el.__cpsMade) el.__cpsMade = (d.mount && d.mount(el)) || {};
        if (d.update) d.update(el, el.__cpsMade);
      }
    } catch (err) { console.error('draw ' + name, err); }
  }
  function drawName(name) { document.querySelectorAll(`[data-draw="${name}"]`).forEach((el) => runOne(name, el)); }
  let queued = false;
  function redraw() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      hooks.forEach((f) => { try { f(); } catch (err) { console.error(err); } });
      Object.keys(draws).forEach(drawName);
    });
  }

  window.dash = {
    data,
    calc: (id, c) => { calcs[id] = { inputs: c.inputs || [], fn: c.fn }; },
    draw: (name, f) => { if (f === undefined) { drawName(name); return; } draws[name] = f; redraw(); },
    onData: (f) => { hooks.push(f); },
    params: () => ({ ...params }),
    setParams: (p) => { params = { ...params, ...p }; redraw(); },
    resetParams: () => { params = { ...PARAMS0 }; redraw(); },
    setLink: (tab) => { try { history.replaceState(null, '', '#' + tab); } catch (err) { /* ignore */ } },
    refresh: () => { loadFiles(); loadTeam(); },
    loader: () => {},
    colors: ['#083995', '#53A2EF', '#9CD7F7'],
  };

  // a page that was hidden while drawing gets drawn again once it shows
  document.addEventListener('DOMContentLoaded', () => {
    const panels = document.querySelectorAll('[data-panel]');
    const mo = new MutationObserver((list) => {
      if (list.some((m) => m.oldValue !== m.target.getAttribute('hidden'))) redraw();
    });
    panels.forEach((el) => mo.observe(el, { attributes: true, attributeFilter: ['hidden'], attributeOldValue: true }));
  });

  // ---------- bill and lawmaker files (public, updated by the scheduled job) ----------
  async function loadFile(id, url) {
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) throw new Error(url + ' ' + r.status);
      const j = await r.json();
      src[id] = { status: 'ok', data: Array.isArray(j) ? j : (j.rows || []) };
    } catch (err) {
      console.error(err);
      if (src[id].status !== 'ok') src[id] = { status: 'error', data: [] };
    }
    redraw();
  }
  function loadFiles() { return Promise.all(Object.entries(FILES).map(([id, url]) => loadFile(id, url))); }

  // ---------- the team's shared records (Supabase) ----------
  const sb = CFG.supabaseUrl && CFG.supabaseKey && window.supabase && !/YOUR-/.test(CFG.supabaseUrl + CFG.supabaseKey)
    ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'cps-tracker-auth' } })
    : null;
  const rowOf = (r) => ({ ...(r.data || {}), id: r.id, added_by: r.added_by || '', updated_by: r.updated_by || '', created_at: r.created_at || '', updated_at: r.updated_at || (r.data || {}).updated_at || '' });

  async function loadTeam() {
    if (!sb || !CPS.me) return;
    const by = Object.fromEntries(STORE.map((c) => [c, []]));
    try {
      for (let from = 0; ; from += 1000) {
        const { data: rows, error } = await sb.from('team_docs').select('coll,id,data,added_by,updated_by,created_at,updated_at').order('coll').order('id').range(from, from + 999);
        if (error) throw error;
        rows.forEach((r) => { if (by[r.coll]) by[r.coll].push(rowOf(r)); });
        if (rows.length < 1000) break;
      }
      STORE.forEach((c) => { src[c] = { status: 'ok', data: by[c] }; });
    } catch (err) {
      console.error(err);
      STORE.forEach((c) => { if (src[c].status !== 'ok') src[c] = { status: 'error', data: [] }; });
    }
    redraw();
  }
  let teamTimer = null;
  const soon = () => { clearTimeout(teamTimer); teamTimer = setTimeout(loadTeam, 250); };
  let channel = null;
  function listen() {
    if (!sb || channel) return;
    channel = sb.channel('team-docs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'team_docs' }, soon)
      .subscribe();
  }

  // keep the local copy in step right away, before the database answers back
  function putLocal(coll, id, row) {
    if (!src[coll] || src[coll].status !== 'ok') return;
    const rows = src[coll].data.filter((r) => r.id !== id);
    const prev = src[coll].data.find((r) => r.id === id) || {};
    if (row) rows.push({ ...row, id, added_by: prev.added_by || CPS.me.short_name, updated_by: CPS.me.short_name, updated_at: new Date().toISOString() });
    src[coll] = { status: 'ok', data: rows };
    redraw();
  }

  const DB = {
    doc(path) {
      const [, , coll, id] = String(path).split('/');
      return {
        async set(row) {
          if (!STORE.includes(coll) || !id) throw new Error('Unknown record ' + path);
          const { error } = await sb.from('team_docs').upsert({ coll, id, data: row }, { onConflict: 'coll,id' });
          if (error) throw error;
          putLocal(coll, id, row);
          soon();
        },
        async delete() {
          const { error } = await sb.from('team_docs').delete().match({ coll, id });
          if (error) throw error;
          putLocal(coll, id, null);
          soon();
        },
      };
    },
  };
  const USER = {
    me: async () => (CPS.me ? { id: CPS.me.id, name: CPS.me.full_name } : null),
    isOwner: async () => false,
  };
  window.claude = { use: async (cap) => (cap === 'db' ? (sb && CPS.me ? DB : null) : cap === 'user' ? USER : null) };

  // ---------- shared with the sign-in page ----------
  const CPS = (window.CPS_APP = { me: null, sb, cfg: CFG, loadFiles, loadTeam, listen, redraw });

  loadFiles();
  // pick up new bill data and teammates' edits without a reload
  setInterval(loadFiles, 15 * 60 * 1000);
  setInterval(loadTeam, 3 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { loadTeam(); } });
})();
