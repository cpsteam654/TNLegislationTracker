(function () {
  const C = window.cps;
  const S = C.state;
  const h = C.h;
  const first = (rows) => rows[0] || {};
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const loading = (el, src, tag) => {
    const st = C.status(src);
    C.fill(el, h(tag || 'p', { class: 'cps-hempty', text: st === 'loading' ? 'Loading…' : (st === 'error' ? 'This didn’t load.' : '—') }));
  };
  const SVG = 'http://www.w3.org/2000/svg';
  const sv = (tag, attrs, ...kids) => {
    const e = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, String(v));
    kids.forEach((k) => { if (k) e.append(k); });
    return e;
  };

  // ---------- greeting ----------
  const period = () => { const hr = new Date().getHours(); return hr < 12 ? 'morning' : (hr < 17 ? 'afternoon' : 'evening'); };
  S.viewer = S.viewer || '';
  (async () => {
    try {
      const u = window.claude && claude.use ? await claude.use('user') : null;
      if (!u) return;
      let name = '';
      try { const me = await u.me(); name = (me && me.name) || ''; } catch (err) { /* names not available */ }
      if (!name) { try { if (await u.isOwner()) name = 'Kathryn'; } catch (err) { /* not told */ } }
      S.viewer = String(name).trim().split(/\s+/)[0] || '';
      if (S.viewer) dash.draw('h-greet');
    } catch (err) { /* greet without a name */ }
  })();
  dash.draw('h-greet', (el) => {
    dash.data('summary');
    C.fill(el, S.viewer ? `Good ${period()}, ` : `Good ${period()}!`, S.viewer ? h('span', { class: 'cps-name', text: `${S.viewer}!` }) : null);
  });

  // solid glyphs: a sun by day, a crescent moon and stars by evening
  const star = (cx, cy, r) => {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = (Math.PI / 5) * i - Math.PI / 2;
      const rr = i % 2 ? r * 0.45 : r;
      pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`);
    }
    return sv('polygon', { points: pts.join(' ') });
  };
  const sun = () => sv('svg', { viewBox: '0 0 64 64', fill: 'currentColor' },
    sv('circle', { cx: 32, cy: 32, r: 12.5 }),
    ...Array.from({ length: 12 }, (_, i) => sv('rect', { x: 30.6, y: 4, width: 2.8, height: i % 2 ? 6.5 : 9, rx: 1.4, transform: `rotate(${i * 30} 32 32)` })));
  const moon = () => sv('svg', { viewBox: '0 0 64 64', fill: 'currentColor' },
    sv('path', { d: 'M40 9a24 24 0 1 0 17 37A19.5 19.5 0 0 1 40 9z' }),
    star(14, 13, 5), star(54, 20, 4), star(19, 52, 3.4));
  dash.draw('h-sky', (el) => {
    dash.data('summary');
    const p = period();
    el.setAttribute('data-period', p);
    C.fill(el, p === 'evening' ? moon() : sun(), h('span', { class: 'cps-sr', text: p === 'evening' ? 'Evening' : 'Daytime' }));
  });

  // ---------- tiles ----------
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const monday = (shiftWeekend) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const dow = d.getDay();
    if (shiftWeekend && (dow === 6 || dow === 0)) return addDays(d, dow === 6 ? 2 : 1);
    return addDays(d, dow === 0 ? -6 : 1 - dow);
  };
  C.text('hk-bills', 'summary', (r) => first(r).bills);
  C.text('hk-tracked', 'tracking_summary', (r) => first(r).tracked);
  C.text('hk-week', 'bills', (rows) => { const since = iso(monday(false)); return rows.filter((b) => String(b.filed_date) >= since).length; });

  // ---------- latest bills ----------
  const PILL = { 'Filed': '', 'In committee': ' cps-pill-committee' };
  dash.draw('h-filings', (el) => {
    const B = dash.data('bills');
    if (B.status !== 'ok') { C.fill(el, h('tr', {}, h('td', { colspan: '5', class: 'cps-hempty', text: B.status === 'loading' ? 'Loading…' : '—' }))); return; }
    const rows = [...B.data]
      .sort((a, b) => String(b.filed_date).localeCompare(String(a.filed_date)) || String(b.key).localeCompare(String(a.key)))
      .slice(0, 7);
    C.fill(el, ...rows.map((b) => {
      const house = Boolean(b.house_sponsor_id);
      const id = house ? b.house_sponsor_id : b.senate_sponsor_id;
      const name = house ? b.house_sponsor : b.senate_sponsor;
      const party = house ? b.house_party : b.senate_party;
      return h('tr', { 'data-goto-bill': b.key, tabindex: '0' },
        h('td', { class: 'cps-hnum', text: b.house_bill || b.senate_bill }),
        h('td', { class: 'cps-htitle' }, h('span', { text: b.title })),
        h('td', { class: 'cps-hwho' }, id ? C.memberBtn(id, name, party) : h('span', { class: 'cps-none', text: 'None yet' })),
        h('td', { class: 'cps-hdate', text: C.day(b.filed_date) }),
        h('td', {}, h('span', { class: 'cps-pill' + (PILL[b.stage] ?? ' cps-pill-passed'), text: b.stage })));
    }));
  });

  // ---------- this week's committee calendar for tracked bills ----------
  dash.draw('h-week-range', (el) => {
    dash.data('bill_tracking');
    const s = monday(true);
    const e = addDays(s, 4);
    el.textContent = `${MON[s.getMonth()]} ${s.getDate()} to ${s.getMonth() === e.getMonth() ? '' : MON[e.getMonth()] + ' '}${e.getDate()}`;
  });
  dash.draw('h-week', (el) => {
    const T = dash.data('bill_tracking');
    const B = new Map(C.rows('bills').map((b) => [b.key, b]));
    const tracked = (T.status === 'ok' ? T.data : []).filter((t) => C.split(t.clients).length && t.hearing_date);
    const s = monday(true);
    const today = iso(new Date());
    const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    let count = 0;
    const rows = DAYS.map((label, i) => {
      const d = addDays(s, i);
      const key = iso(d);
      const items = tracked.filter((t) => t.hearing_date === key).sort((a, b) => String(a.hearing_time).localeCompare(String(b.hearing_time)));
      count += items.length;
      return h('div', { class: 'cps-cal-row' + (key === today ? ' is-today' : '') },
        h('div', { class: 'cps-cal-day' }, h('span', { text: label }), h('b', { text: d.getDate() })),
        h('div', { class: 'cps-cal-items' },
          ...(items.length ? items.map((t) => {
            const b = B.get(t.key) || {};
            const when = [C.time12(t.hearing_time), t.committee].filter(Boolean).join(', ');
            return h('button', { type: 'button', class: 'cps-cal-item', 'data-goto-bill': t.key, title: when },
              h('b', { text: b.house_bill || b.senate_bill || t.key }), h('span', { text: when || 'Time to be announced' }));
          }) : [h('span', { class: 'cps-cal-none', text: 'No meetings' })])));
    });
    let note = null;
    if (!count) {
      const end = iso(addDays(s, 4));
      const next = tracked.filter((t) => t.hearing_date > end).sort((a, b) => a.hearing_date.localeCompare(b.hearing_date))[0];
      if (next) {
        const nb = B.get(next.key) || {};
        note = h('p', { class: 'cps-cal-note', text: `The next hearing for a tracked bill is ${nb.house_bill || nb.senate_bill || next.key} on ${C.dayFull(next.hearing_date)}.` });
      }
    }
    C.fill(el, h('div', { class: 'cps-cal' }, ...rows), note);
  });

  // ---------- bill progress ----------
  dash.draw('h-progress', (el) => {
    const B = dash.data('bills');
    if (B.status !== 'ok') { loading(el, 'bills'); return; }
    const n = B.data.length;
    const filed = B.data.filter((b) => b.stage === 'Filed').length;
    const committee = B.data.filter((b) => b.stage === 'In committee').length;
    const passed = n - filed - committee;
    const seg = (cls, v, label) => (v ? h('div', { class: `cps-prog-${cls}`, style: `flex:${v}`, title: `${v} ${label}` }, h('span', { text: `${v} ${label}` })) : null);
    const note = !committee && !passed
      ? `All ${n} bills are filed and waiting to be referred to a committee.`
      : `${filed} filed, ${committee} in committee and ${passed} past a floor vote.`;
    C.fill(el,
      h('div', { class: 'cps-prog', role: 'img', 'aria-label': note }, seg('a', filed, 'filed'), seg('b', committee, 'in committee'), seg('c', passed, 'passed')),
      h('p', { class: 'cps-prog-note', text: note }));
  });

  // ---------- sponsors ----------
  dash.draw('h-sponsors', (el) => {
    const d = dash.data('sponsors');
    if (d.status !== 'ok') { loading(el, 'sponsors', 'li'); return; }
    const rows = d.data.filter((r) => r.bills_sponsored > 0).slice(0, 5);
    const max = Math.max(1, ...rows.map((r) => r.bills_sponsored));
    C.fill(el, ...rows.map((r) => h('li', {},
      C.avatar(r.name, r.party, 'md', r.id),
      h('div', { class: 'cps-person-t' }, C.memberBtn(r.id, r.name, r.party), h('span', { class: 'cps-sub', text: `${r.chamber} District ${r.district}` })),
      h('span', { class: 'cps-hp-bar' }, h('i', { style: `width:${(100 * r.bills_sponsored) / max}%` })),
      h('span', { class: 'cps-hp-n' },
        h('b', { 'data-source': 'sponsors', 'data-field': 'bills_sponsored', 'data-where': C.where('id', r.id), text: r.bills_sponsored }),
        r.bills_sponsored === 1 ? ' bill' : ' bills'))));
  });

  // ---------- themes ----------
  dash.draw('h-themes', (el) => {
    const d = dash.data('topic_counts');
    if (d.status !== 'ok') { loading(el, 'topic_counts', 'li'); return; }
    const rows = d.data.filter((r) => r.bills > 0).slice(0, 5);
    const max = Math.max(1, ...rows.map((r) => r.share_pct));
    C.fill(el, ...rows.map((r) => h('li', { class: r.cps_watch ? 'is-pri' : '' },
      h('span', { class: 'cps-hb-l' }, r.topic, r.cps_watch ? h('span', { class: 'cps-hb-star', title: 'CPS priority issue', text: ' ★' }) : null),
      h('span', { class: 'cps-hb-v' },
        h('b', { 'data-source': 'topic_counts', 'data-field': 'share_pct', 'data-where': C.where('topic', r.topic), text: r.share_pct }), '%'),
      h('span', { class: 'cps-hb-bar' }, h('i', { style: `width:${(100 * r.share_pct) / max}%` })))));
  });

  // ---------- activity across the tracker ----------
  const ICONS = {
    Tagged: 'M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z',
    Hearing: 'M4.5 6.5h15v13h-15z M4.5 10.5h15 M8.5 4v4 M15.5 4v4',
    Filed: 'M7 3.5h7l4.5 4.5v12.5h-11.5z M14 3.5V8h4.5',
  };
  const icon = (d) => sv('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, sv('path', { d }));
  const when = (at) => {
    const s = String(at || '');
    if (s.length > 10) {
      const t = Date.parse(s);
      if (!Number.isNaN(t)) {
        const mins = Math.round((Date.now() - t) / 60000);
        if (mins < 1) return 'Just now';
        if (mins < 60) return `${mins}m ago`;
        if (mins < 24 * 60) return `${Math.round(mins / 60)}h ago`;
      }
    }
    return C.day(s.slice(0, 10));
  };
  dash.draw('h-feed', (el) => {
    const d = dash.data('activity');
    if (d.status !== 'ok') { loading(el, 'activity', 'li'); return; }
    const L = new Map(C.rows('legislators').map((r) => [r.id, r]));
    const rows = d.data.slice(0, 5);
    if (!rows.length) { C.fill(el, h('li', { class: 'cps-hempty', text: 'Nothing yet.' })); return; }
    C.fill(el, ...rows.map((r, i) => {
      const p = L.get(r.member_id);
      const face = p ? C.avatar(p.name, p.party, 'md', p.id) : h('span', { class: 'cps-fi-ic' }, icon(ICONS[r.kind] || ICONS.Filed));
      const attrs = { class: 'cps-fi' };
      if (r.bill_key) { attrs['data-goto-bill'] = r.bill_key; attrs.tabindex = '0'; }
      return h('li', attrs,
        h('div', { class: 'cps-fi-card' },
          r.member_id && p ? h('button', { type: 'button', class: 'cps-fi-face', 'data-member': r.member_id, 'aria-label': `Open profile of ${p.name}` }, face) : face,
          h('div', { class: 'cps-fi-txt' },
            h('b', { 'data-source': 'activity', 'data-field': 'headline', 'data-row': String(i), text: r.headline }),
            h('span', { class: 'cps-fi-time', text: when(r.at) }))));
    }));
  });
})();
