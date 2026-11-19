(function () {
  const C = window.cps;
  const S = C.state;
  const h = C.h;
  S.clientView = S.clientView || 'all';

  // the open folder: the one picked, else the first client with bills, else the first client
  const selected = () => {
    const rows = C.rows('client_counts');
    if (S.client && rows.some((r) => r.client === S.client)) return S.client;
    return ((rows.find((r) => r.bills > 0) || rows[0]) || {}).client || null;
  };
  C.selectedClient = selected;
  const DRAWS = ['client-folders', 'cl-head', 'cl-crumb', 'client-bills', 'side-clients'];
  C.openClient = function (name) {
    S.client = name;
    C.showTab('clients');
    DRAWS.forEach((n) => dash.draw(n));
  };
  document.addEventListener('click', (e) => {
    if (!e.target.closest) return;
    const f = e.target.closest('#cps [data-open-client]');
    if (f) { C.openClient(f.getAttribute('data-open-client')); return; }
    if (e.target.closest('#cps [data-new-folder]')) {
      const input = document.querySelector('#client-name');
      if (input) input.focus();
    }
    const seg = e.target.closest('#cps [data-cl-view]');
    if (seg) {
      S.clientView = seg.getAttribute('data-cl-view');
      document.querySelectorAll('#cps [data-cl-view]').forEach((b) => b.setAttribute('aria-pressed', String(b === seg)));
      dash.draw('client-bills');
    }
  });

  const initials = (name) => {
    const words = String(name).split(/\s+/).filter(Boolean);
    return (words.length > 1 ? words[0][0] + words[1][0] : String(name).slice(0, 2)).toUpperCase();
  };
  const folderSvg = () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', 'M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z');
    svg.append(p);
    return svg;
  };

  function eyeSvg() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    for (const [tag, attrs] of [['path', { d: 'M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12z' }], ['circle', { cx: '12', cy: '12', r: '2.8' }]]) {
      const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
      svg.append(e);
    }
    return svg;
  }
  C.eyeSvg = eyeSvg;

  dash.draw('nav-clients', (el) => { el.textContent = C.status('client_counts') === 'ok' ? String(C.rows('client_counts').length) : '—'; });
  dash.draw('cl-crumb', (el) => { el.textContent = selected() || '—'; });

  dash.draw('side-clients', (el) => {
    const rows = C.rows('client_counts');
    const cur = selected();
    const onClients = !(document.querySelector('#clients') || {}).hidden;
    C.fill(el, ...rows.map((r) => h('li', {},
      h('button', { type: 'button', class: onClients && r.client === cur ? 'is-on' : '', 'data-open-client': r.client },
        r.general ? eyeSvg() : folderSvg(), h('span', { text: r.client }), h('em', { text: r.bills })))));
  });

  dash.draw('client-folders', (el) => {
    const st = C.status('client_counts');
    if (st !== 'ok') { C.fill(el, h('div', { class: 'cps-loading', text: st === 'loading' ? 'Loading clients…' : '—' })); return; }
    const L = new Map(C.rows('legislators').map((r) => [r.id, r]));
    const cur = selected();
    const folders = C.rows('client_counts').map((r) => {
      const ids = C.split(r.sponsor_ids);
      const shown = ids.slice(0, 3);
      return h('button', { type: 'button', class: 'cps-folder' + (r.general ? ' cps-folder-general' : '') + (r.client === cur ? ' is-on' : ''), 'data-open-client': r.client, 'aria-pressed': String(r.client === cur) },
        h('div', { class: 'cps-folder-body' },
          r.general ? h('span', { class: 'cps-folder-ic', 'aria-hidden': 'true' }, eyeSvg()) : h('span', { class: 'cps-folder-ic', 'aria-hidden': 'true', text: initials(r.client) }),
          h('span', { class: 'cps-folder-n', text: r.client }),
          r.general ? h('span', { class: 'cps-folder-tag', text: 'Monitoring only' }) : null,
          h('span', { class: 'cps-folder-m' },
            h('span', { 'data-source': 'client_counts', 'data-field': 'bills', 'data-where': C.where('client', r.client), text: r.bills }),
            ` bill${r.bills === 1 ? '' : 's'}, `,
            h('span', { 'data-source': 'client_counts', 'data-field': 'hearings', 'data-where': C.where('client', r.client), text: r.hearings }),
            ` hearing${r.hearings === 1 ? '' : 's'} set`),
          h('div', { class: 'cps-folder-foot' },
            ids.length
              ? h('span', { class: 'cps-stack' }, ...shown.map((id) => { const p = L.get(id) || {}; return C.avatar(p.name || id, p.party, null, id); }), ids.length > 3 ? h('span', { class: 'cps-stack-more', text: `+${ids.length - 3}` }) : null)
              : h('span', { class: 'cps-folder-m', text: 'No bills tagged yet' }),
            null)));
    });
    const add = h('button', { type: 'button', class: 'cps-folder cps-folder-new', 'data-new-folder': '' },
      h('div', { class: 'cps-folder-body' }, h('b', { 'aria-hidden': 'true', text: '+' }), h('span', { text: 'New client folder' })));
    C.fill(el, ...folders, add);
  });

  dash.draw('cl-head', (el) => {
    const name = selected();
    const r = C.rows('client_counts').find((x) => x.client === name);
    if (!r) { C.fill(el, h('h2', { text: 'No clients yet' }), h('p', { class: 'cps-card-sub', text: 'Add a client folder to start tagging bills.' })); return; }
    C.fill(el,
      h('h2', {}, folderSvgSmall(), r.client),
      h('p', { class: 'cps-card-sub', text: (r.general ? 'Major legislation the team is following that doesn’t directly affect a client.' : `Bills the team has tagged for ${r.client}.`) + (r.added_by && r.added_by !== 'CPS' ? ` Folder added by ${r.added_by}.` : '') }));
  });
  function folderSvgSmall() {
    const s = folderSvg();
    s.setAttribute('width', '18');
    s.setAttribute('height', '18');
    s.style.cssText = 'fill:none;stroke:var(--accent);stroke-width:1.8;stroke-linejoin:round';
    return s;
  }

  dash.draw('client-bills', (tbody) => {
    const name = selected();
    const B = dash.data('bills');
    if (B.status !== 'ok') { C.fill(tbody, h('tr', {}, h('td', { colspan: '5', class: 'cps-loading', text: B.status === 'loading' ? 'Loading…' : '—' }))); return; }
    const track = new Map(C.rows('bill_tracking').map((r) => [r.key, r]));
    let rows = B.data.filter((b) => name && C.split((track.get(b.key) || {}).clients).includes(name));
    if (S.clientView === 'watch') rows = rows.filter((b) => (track.get(b.key) || {}).watch);
    if (S.clientView === 'hearing') rows = rows.filter((b) => { const t = track.get(b.key) || {}; return t.committee || t.hearing_date; });
    rows.sort((a, b) => {
      const ta = track.get(a.key) || {};
      const tb = track.get(b.key) || {};
      return String(ta.hearing_date || '9999').localeCompare(String(tb.hearing_date || '9999')) || String(b.filed_date).localeCompare(String(a.filed_date));
    });
    if (!rows.length) {
      const msg = !name ? 'Add a client folder to start.'
        : S.clientView === 'all' ? `No bills tagged to ${name} yet. On the Bills page, open a bill and choose Edit clients, note & hearing.`
          : `None of ${name}’s bills match this view yet.`;
      C.fill(tbody, h('tr', {}, h('td', { colspan: '5', class: 'cps-loading', text: msg })));
      return;
    }
    C.fill(tbody, ...rows.map((b) => {
      const t = track.get(b.key) || {};
      const others = C.split(t.clients).filter((c) => c !== name);
      const sponsors = [[b.house_sponsor_id, b.house_sponsor, b.house_party], [b.senate_sponsor_id, b.senate_sponsor, b.senate_party]].filter((x) => x[0]);
      return h('tr', { class: 'cps-row', 'data-goto-bill': b.key, tabindex: '0' },
        h('td', {}, h('div', { style: 'display:flex;align-items:center;gap:8px' }, C.billCell(b)),
          t.tagged_by ? h('div', { class: 'cps-by', text: `Tagged by ${t.tagged_by}` }) : null),
        h('td', {}, h('div', { class: 'cps-person' },
          h('span', { class: 'cps-stack' }, ...sponsors.map(([id, n, p]) => C.avatar(n, p, null, id))),
          h('div', { class: 'cps-person-t' }, ...sponsors.map(([id, n, p]) => C.memberBtn(id, n, p))))),
        h('td', {}, C.stageCell(b)),
        h('td', {}, C.hearingCell(t)),
        h('td', {}, others.length ? h('div', { class: 'cps-tags' }, ...others.map(C.clientChip)) : h('span', { class: 'cps-none', text: '—' })));
    }));
  });

  // new client folder
  const form = document.querySelector('#client-form');
  if (form) form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = document.querySelector('#client-name');
    const name = input ? input.value.trim() : '';
    if (!name) return;
    C.busy(form, true);
    try {
      const saved = await C.addClient(name);
      if (input) input.value = '';
      S.client = saved;
      C.showErr(form, false);
    } catch (err) {
      C.showErr(form, true);
    } finally {
      C.busy(form, false);
    }
  });
})();
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const tr = e.target.closest && e.target.closest('#cps tr[data-goto-bill]');
  if (tr && e.target === tr) { e.preventDefault(); window.cps.goToBill(tr.getAttribute('data-goto-bill')); }
});
