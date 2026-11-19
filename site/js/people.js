(function () {
  const C = window.cps;
  const S = C.state;
  const h = C.h;
  const member = () => C.rows('legislators').find((r) => r.id === S.member);

  // ================= THEMES =================
  dash.draw('topic-chart', {
    mount(el) {
      const tip = h('div', { class: 'cps-tip', hidden: true });
      el.append(tip);
      return { tip, first: true };
    },
    update(el, m) {
      const d = dash.data('topic_counts');
      el.querySelectorAll('svg, .cps-loading').forEach((n) => n.remove());
      m.tip.hidden = true;
      if (d.status !== 'ok') {
        el.append(h('div', { class: 'cps-loading', text: d.status === 'error' ? 'Failed to load' : (d.status === 'loading' ? 'Loading…' : '—') }));
        return;
      }
      const rows = d.data.filter((r) => r.bills > 0 || r.cps_watch);
      const W = Math.max(280, el.clientWidth || 320);
      const rowH = 26;
      const H = rows.length * rowH + 8;
      const svg = d3.select(el).append('svg').attr('width', '100%').attr('height', H).attr('viewBox', `0 0 ${W} ${H}`)
        .attr('role', 'img').attr('aria-label', 'Bar chart of bills filed per topic, split by sponsor party');
      // measure the widest label
      const probe = svg.append('text').attr('font-size', 12).style('font-family', 'var(--sans)');
      let lw = 0;
      rows.forEach((r) => { probe.text((r.cps_watch ? '★ ' : '') + r.topic); lw = Math.max(lw, probe.node().getComputedTextLength() || r.topic.length * 6.5); });
      probe.remove();
      const left = Math.min(lw + 12, W * 0.48);
      const max = Math.max(1, d3.max(rows, (r) => r.bills));
      const x = d3.scaleLinear().domain([0, max]).range([left, W - 28]);
      const y = d3.scaleBand().domain(rows.map((r) => r.topic)).range([4, H - 4]).padding(0.28);
      const g = svg.append('g');
      const row = g.selectAll('g').data(rows).join('g').attr('transform', (r) => `translate(0,${y(r.topic)})`);
      row.append('text').attr('x', left - 10).attr('y', y.bandwidth() / 2).attr('dy', '0.35em').attr('text-anchor', 'end')
        .attr('font-size', 12).style('font-family', 'var(--sans)').style('fill', 'var(--color-fg)')
        .style('font-weight', (r) => (r.cps_watch ? 700 : 400))
        .text((r) => (r.cps_watch ? '★ ' : '') + r.topic);
      const parts = [['republican', 'var(--rep)'], ['democrat', 'var(--dem)'], ['bipartisan', 'var(--bip)']];
      row.each(function (r) {
        let x0 = 0;
        const gg = d3.select(this);
        parts.forEach(([k, color]) => {
          const v = r[k] || 0;
          if (!v) return;
          gg.append('rect').attr('x', x(x0)).attr('y', 0).attr('height', y.bandwidth()).attr('rx', 3)
            .attr('width', Math.max(0, x(x0 + v) - x(x0) - 1)).style('fill', color);
          x0 += v;
        });
        if (!r.bills) {
          gg.append('line').attr('x1', left).attr('x2', left).attr('y1', 0).attr('y2', y.bandwidth()).style('stroke', 'var(--cds-chart-axis)');
        }
        gg.append('text').attr('x', x(r.bills) + 6).attr('y', y.bandwidth() / 2).attr('dy', '0.35em').attr('font-size', 12)
          .style('font-family', 'var(--sans)').style('font-weight', 700).style('fill', r.bills ? 'var(--color-fg)' : 'var(--cds-text-secondary)')
          .attr('data-source', 'topic_counts').attr('data-field', 'bills').attr('data-where', C.where('topic', r.topic))
          .text(r.bills);
      });
      row.append('rect').attr('x', 0).attr('y', -3).attr('width', W).attr('height', y.bandwidth() + 6).style('fill', 'transparent')
        .on('mousemove', (event, r) => {
          const [mx, my] = d3.pointer(event, el);
          const split = [r.republican && `${r.republican} Republican`, r.democrat && `${r.democrat} Democrat`, r.bipartisan && `${r.bipartisan} bipartisan`].filter(Boolean).join(', ');
          C.fill(m.tip, h('b', { text: `${r.topic}: ${r.bills} bill${r.bills === 1 ? '' : 's'}` }), h('span', { text: r.bills ? `${split}. ${r.bill_list}` : 'Nothing filed yet' }));
          m.tip.hidden = false;
          const tw = m.tip.offsetWidth;
          m.tip.style.left = `${Math.min(mx + 12, el.clientWidth - tw - 4)}px`;
          m.tip.style.top = `${my + 14}px`;
        })
        .on('mouseleave', () => { m.tip.hidden = true; });
    },
  });

  dash.draw('sponsor-list', (el) => {
    const d = dash.data('sponsors');
    if (d.status !== 'ok') { C.fill(el, h('li', { class: 'cps-muted', text: d.status === 'loading' ? 'Loading…' : '—' })); return; }
    const rows = d.data.filter((r) => r.bills_sponsored > 0).slice(0, 8);
    C.fill(el, ...rows.map((r, i) => h('li', {},
      h('span', { class: 'cps-rank', text: i + 1 }),
      C.avatar(r.name, r.party, 'sm', r.id),
      h('div', {}, C.memberBtn(r.id, r.name, r.party), h('span', { class: 'cps-sp-meta', text: `${r.chamber} District ${r.district}` })),
      h('div', { class: 'cps-sp-n' }, h('span', { 'data-source': 'sponsors', 'data-field': 'bills_sponsored', 'data-where': `id=${r.id}`, text: r.bills_sponsored }), h('small', { text: r.bills_sponsored === 1 ? 'BILL' : 'BILLS' })))));
  });

  // Committees that have heard each CPS issue in past sessions (a fixed reference, not data).
  const VENUES = [
    { issue: 'Health care', house: 'Health', senate: 'Health & Welfare' },
    { issue: 'PBMs & pharmacy', house: 'Insurance', senate: 'Commerce & Labor' },
    { issue: 'AI & technology', house: 'Commerce', senate: 'Commerce & Labor' },
    { issue: 'Recycling & waste', house: 'Agriculture & Natural Resources', senate: 'Energy, Agriculture & Natural Resources' },
  ];
  dash.draw('venue-rows', (tb) => {
    const L = C.rows('legislators');
    const F = C.rows('focus_areas');
    if (!L.length) { C.fill(tb, h('tr', {}, h('td', { colspan: '4', class: 'cps-loading', text: C.status('legislators') === 'loading' ? 'Loading…' : '—' }))); return; }
    const chair = (chamber, comm) => L.find((r) => r.chamber === chamber && C.split(r.committees).includes(`Chair, ${comm}`));
    const cell = (chamber, comm) => {
      const c = chair(chamber, comm);
      return h('td', {}, h('span', { class: 'cps-cname', text: `${chamber} ${comm} Committee` }),
        c ? h('span', {}, h('span', { class: 'cps-muted', text: 'Chair ' }), C.memberBtn(c.id, c.name, c.party)) : h('span', { class: 'cps-muted', text: 'Chair not listed' }));
    };
    C.fill(tb, ...VENUES.map((v) => {
      const f = F.find((r) => r.area === v.issue) || {};
      return h('tr', {},
        h('td', { class: 'cps-issue', text: v.issue }),
        cell('House', v.house),
        cell('Senate', v.senate),
        h('td', {}, h('span', { class: 'cps-cn', 'data-source': 'focus_areas', 'data-field': 'bills', 'data-where': C.where('area', v.issue), text: f.bills ?? '—' }),
          f.bill_list ? h('div', { class: 'cps-muted', text: f.bill_list }) : null));
    }));
  });

  // ================= LAWMAKERS =================
  C.text('nav-members', 'legislators', (r) => r.length);
  dash.draw('composition', (el) => {
    const d = dash.data('composition');
    if (d.status !== 'ok') { C.fill(el, h('div', { class: 'cps-comp-card cps-muted', text: d.status === 'loading' ? 'Loading…' : '—' })); return; }
    const card = (r) => {
      const mk = (f, v, style) => h('b', { 'data-source': 'composition', 'data-field': f, 'data-where': `chamber=${r.chamber}`, style, text: v });
      return h('article', { class: 'cps-comp-card', id: `comp-${r.chamber.toLowerCase()}` },
        h('div', { class: 'cps-comp-top' }, h('h3', { text: r.chamber }), h('span', { text: `${r.seats} seats` })),
        h('p', { class: 'cps-comp-v' }, mk('republicans', r.republicans, 'color:var(--rep)'), h('small', { text: ' R  ' }), mk('democrats', r.democrats, 'color:var(--dem)'), h('small', { text: ' D' })),
        h('div', { class: 'cps-seatbar', role: 'img', 'aria-label': `${r.chamber}: ${r.republicans} Republicans, ${r.democrats} Democrats, ${r.vacant} vacant` },
          h('i', { class: 'r', style: `width:${(100 * r.republicans) / r.seats}%` }),
          h('i', { class: 'd', style: `width:${(100 * r.democrats) / r.seats}%` }),
          r.vacant ? h('i', { class: 'v', style: `width:${(100 * r.vacant) / r.seats}%` }) : null),
        h('div', { class: 'cps-comp-legend' },
          h('span', {}, mk('new_members', r.new_members), ' new members'),
          r.vacant ? h('span', {}, mk('vacant', r.vacant), ' vacant') : null));
    };
    C.fill(el, ...d.data.map(card));
  });

  const lmCtl = () => ({
    chamber: (document.querySelector('#lm-chamber') || {}).value || '',
    party: (document.querySelector('#lm-party') || {}).value || '',
    q: ((document.querySelector('#lm-search') || {}).value || '').trim().toLowerCase(),
    cps: Boolean((document.querySelector('#lm-cps') || {}).checked),
  });
  function lmFilter() {
    const f = lmCtl();
    const contacts = new Set(C.rows('contacts').filter((r) => r.team || r.note).map((r) => r.id));
    return C.rows('legislators').filter((r) => {
      if (f.chamber && r.chamber !== f.chamber) return false;
      if (f.party && r.party !== f.party) return false;
      if (f.cps && !contacts.has(r.id)) return false;
      if (f.q) {
        const hay = [r.name, r.city, r.area, r.seat, r.committees, r.leadership].join(' ').toLowerCase();
        if (!hay.includes(f.q)) return false;
      }
      return true;
    });
  }
  ['#lm-chamber', '#lm-party', '#lm-cps'].forEach((s) => { const n = document.querySelector(s); if (n) n.addEventListener('change', () => { dash.draw('member-grid'); dash.draw('lm-shown'); }); });
  const search = document.querySelector('#lm-search');
  if (search) search.addEventListener('input', () => { dash.draw('member-grid'); dash.draw('lm-shown'); });

  dash.draw('lm-shown', (el) => { el.textContent = C.status('legislators') === 'ok' ? String(lmFilter().length) : '—'; });

  dash.draw('member-grid', (el) => {
    const st = C.status('legislators');
    if (st !== 'ok') { C.fill(el, h('tr', {}, h('td', { colspan: '6', class: 'cps-loading', text: st === 'loading' ? 'Loading lawmakers…' : (st === 'error' ? 'Lawmakers failed to load.' : '—') }))); return; }
    const contacts = new Map(C.rows('contacts').map((r) => [r.id, r]));
    const logs = d3.group(C.rows('outreach'), (r) => r.member_id);
    const rows = lmFilter().sort((a, b) => (a.chamber === b.chamber ? a.district - b.district : a.chamber === 'House' ? -1 : 1));
    if (!rows.length) { C.fill(el, h('tr', {}, h('td', { colspan: '6', class: 'cps-loading', text: 'No lawmakers match.' }))); return; }
    C.fill(el, ...rows.map((r) => {
      const vacant = r.status === 'Vacant';
      const c = contacts.get(r.id);
      const log = [...(logs.get(r.id) || [])].sort((a, b) => String(b.date).localeCompare(String(a.date)));
      const role = C.split(r.leadership).filter((x) => !/General Assembl|\bGA\b/.test(x))[0];
      return h('tr', { class: 'cps-mrow', 'data-member': r.id, tabindex: '0' },
        h('td', {}, h('div', { class: 'cps-person' }, C.avatar(vacant ? '?' : r.name, r.party, 'sm', vacant ? null : r.id),
          h('div', { class: 'cps-person-t' },
            h('span', { class: 'cps-mname' }, h('span', { text: vacant ? 'Vacant seat' : `${r.title} ${r.name}` }), C.partyBadge(r.party), r.first_term ? h('span', { class: 'cps-badge cps-badge-new', text: 'New' }) : null),
            vacant ? h('span', { class: 'cps-sub', text: 'Shelby County appointment pending' }) : (r.since_year && !r.first_term ? h('span', { class: 'cps-sub', text: `Since ${r.since_year}` }) : null)))),
        h('td', {}, h('span', { text: `${r.chamber} ${r.district}` })),
        h('td', { class: 'cps-area' }, r.city ? h('div', { text: r.city }) : null, h('div', { class: 'cps-sub', text: r.area })),
        h('td', {}, role ? h('span', { class: 'cps-badge', text: role }) : h('span', { class: 'cps-none', text: '—' })),
        h('td', {}, c && c.team ? h('span', { class: 'cps-badge cps-badge-cps', text: c.team }) : h('span', { class: 'cps-none', text: '—' })),
        h('td', {}, log.length ? h('div', { class: 'cps-hear' }, resultBadge(log[0].result), h('span', { class: 'cps-sub', text: `${log.length} note${log.length > 1 ? 's' : ''}, last on ${C.day(log[0].date)}` })) : h('span', { class: 'cps-none', text: '—' })));
    }));
  });

  const RESULT_CLASS = { 'Supportive': 'good', 'Meeting scheduled': 'good', 'Follow-up needed': 'warn', 'No response yet': 'neutral', 'Neutral / listening': 'neutral', 'Opposed': 'bad' };
  const resultBadge = (r) => (r ? h('span', { class: `cps-res cps-res-${RESULT_CLASS[r] || 'neutral'}`, text: r }) : null);

  dash.draw('recent-outreach', (el) => {
    const st = C.status('outreach');
    const L = new Map(C.rows('legislators').map((r) => [r.id, r]));
    const rows = [...C.rows('outreach')].sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.logged_at).localeCompare(String(a.logged_at))).slice(0, 6);
    document.querySelectorAll('#cps [data-variant="nooutreach"]').forEach((p) => { p.hidden = st !== 'ok' || rows.length > 0; });
    C.fill(el, ...rows.map((r) => {
      const p = L.get(r.member_id) || {};
      return h('li', {},
        h('div', { class: 'cps-r-top' }, h('span', { class: 'cps-r-who' }, C.avatar(p.name || r.member_id, p.party, 'xs', r.member_id), C.memberBtn(r.member_id, p.name || r.member_id, p.party)), h('span', { class: 'cps-r-date', text: C.day(r.date) })),
        h('div', {}, resultBadge(r.result), ' ', h('span', { class: 'cps-muted', text: [r.by, r.topic ? `on ${r.topic}` : ''].filter(Boolean).join(' ') })));
    }));
  });

  // ================= PROFILE =================
  dash.draw('pf-head', (el) => {
    const r = member();
    if (!r) { C.fill(el); return; }
    const vacant = r.status === 'Vacant';
    C.fill(el, h('div', { class: 'cps-pf-id' },
      C.avatar(vacant ? '?' : r.name, r.party, 'lg', vacant ? null : r.id),
      h('div', {},
        h('h2', { class: 'cps-pf-name', 'data-source': 'legislators', 'data-field': 'name', 'data-where': `id=${r.id}`, text: vacant ? `Vacant seat, ${r.seat}` : `${r.title} ${r.name}` }),
        h('p', { class: 'cps-pf-line' },
          C.partyBadge(r.party),
          h('span', { text: `${r.seat}${r.city ? `, ${r.city}` : ''}` })),
        h('p', { class: 'cps-pf-line', text: r.area }))));
  });

  dash.draw('pf-note', (el) => {
    const r = member();
    C.fill(el, ...(r && r.note ? [h('p', { class: 'cps-pf-callout', text: r.note })] : []));
  });

  dash.draw('pf-stats', (el) => {
    const r = member();
    if (!r || r.status === 'Vacant') { C.fill(el); return; }
    const sp = C.rows('sponsors').find((x) => x.id === r.id) || {};
    const stat = (big, small, mark) => h('div', { class: 'cps-stat' }, h('b', mark || {}, big), h('span', { text: small }));
    C.fill(el, 
      stat(r.first_term ? 'New' : (r.since_year ? String(r.since_year) : '—'), r.first_term ? 'First term, 2027' : 'In office since'),
      r.years_in_office ? stat(String(r.years_in_office), 'Years by Jan. 2027', { 'data-source': 'legislators', 'data-field': 'years_in_office', 'data-where': `id=${r.id}` }) : null,
      stat(String(sp.bills_sponsored || 0), 'Bills filed so far'),
      sp.bills_cosponsored ? stat(String(sp.bills_cosponsored), 'Co-sponsored') : null,
      serviceNote(r) ? h('div', { class: 'cps-stat cps-stat-wide' }, h('span', { text: 'Earlier service' }), h('div', { style: 'font-size:13px;margin-top:2px', text: serviceNote(r) })) : null);
  });

  // The TGA service line only adds something when a member served earlier
  // terms or in the other chamber; the start year already shows above.
  function serviceNote(r) {
    const parts = String(r.service || '').split(/\s*\u00b7\s*/);
    if (parts.length < 2 || /^New member/.test(parts[0])) return '';
    return parts.slice(1).join(', ').replace(/^also served /, '').replace(/^earlier /, '').replace(/ service \(\d+\w* GA, (.+)\)$/, ', $1').replace(/^./, (c) => c.toUpperCase());
  }

  dash.draw('pf-bills', (el) => {
    const r = member();
    if (!r) { C.fill(el); return; }
    const mine = C.rows('bills').filter((b) => b.house_sponsor_id === r.id || b.senate_sponsor_id === r.id || C.split(b.house_cosponsor_ids).includes(r.id));
    if (!mine.length) { C.fill(el, h('p', { class: 'cps-muted', text: 'No bills filed yet this session.' })); return; }
    const topics = d3.rollups(mine.flatMap((b) => C.split(b.topics)), (v) => v.length, (t) => t).sort((a, b) => b[1] - a[1]);
    C.fill(el, 
      h('div', { class: 'cps-chips', style: 'margin-bottom:10px' }, ...topics.map(([t, n]) => C.chip(n > 1 ? `${t} ×${n}` : t, C.WATCH.includes(t) ? 'focus' : ''))),
      h('ul', { class: 'cps-pf-bills' }, ...mine.map((b) => h('li', {},
        h('span', { class: 'cps-bn', text: b.bill_numbers }),
        h('div', {}, h('div', { style: 'font-weight:600', text: b.title }),
          h('div', { class: 'cps-muted', text: (b.house_sponsor_id === r.id || b.senate_sponsor_id === r.id ? 'Prime sponsor' : 'Co-sponsor') + `, filed ${C.day(b.filed_date)}` }))))));
  });

  dash.draw('pf-lead', (el) => {
    const r = member();
    const items = r ? C.split(r.leadership) : [];
    C.fill(el, items.length ? h('div', { class: 'cps-chips' }, ...items.map((t) => C.chip(t))) : h('p', { class: 'cps-muted', text: 'None listed' }));
  });

  dash.draw('pf-committees', (el) => {
    const r = member();
    const items = r ? C.split(r.committees) : [];
    C.fill(el, ...(items.length ? items.map((t) => C.chip(t, /^(Chair|Vice-Chair|2nd Vice-Chair|Co-Chair),/.test(t) ? 'focus' : '')) : [h('span', { class: 'cps-muted', text: 'None listed yet' })]));
  });

  dash.draw('pf-bio', (el) => {
    const r = member();
    const items = r ? C.split(r.bio) : [];
    C.fill(el, ...(items.length ? items.map((t) => h('li', { text: t })) : [h('li', { class: 'cps-muted', text: 'Not yet posted on the TGA site' })]));
  });

  dash.draw('pf-contact', (el) => {
    const r = member();
    if (!r) { C.fill(el); return; }
    const out = [];
    if (r.email) out.push(h('a', { href: `mailto:${r.email}`, text: r.email }));
    if (r.phone) out.push(h('a', { href: `tel:${r.phone.replace(/[^\d]/g, '')}`, text: r.phone }));
    if (r.office) out.push(h('span', { text: `${r.office}, 425 Rep. John Lewis Way N., Nashville` }));
    C.fill(el, ...(out.length ? out : [h('span', { class: 'cps-muted', text: 'Not yet posted on the TGA site' })]));
  });

  dash.draw('pf-links', (el) => {
    const r = member();
    if (!r) { C.fill(el); return; }
    const L = [['website', 'Campaign site', 'W'], ['facebook', 'Facebook', 'f'], ['x', 'X', 'X'], ['instagram', 'Instagram', 'IG'], ['youtube', 'YouTube', '▶'], ['tiktok', 'TikTok', 'T'], ['ballotpedia', 'Ballotpedia', 'B'], ['tga_url', 'TGA profile', 'TN']];
    const links = L.filter(([k]) => r[k]).map(([k, label, icon]) => h('a', { href: r[k], target: '_blank', rel: 'noopener' }, h('i', { text: icon }), label));
    C.fill(el, ...(links.length ? links : [h('span', { class: 'cps-muted', text: 'No links on file' })]));
  });

  dash.draw('pf-connection', (el) => {
    const r = member();
    if (!r) { C.fill(el); return; }
    const c = C.rows('contacts').find((x) => x.id === r.id);
    if (!c || (!c.team && !c.note)) { C.fill(el, h('p', { class: 'cps-muted', style: 'margin:0', text: 'No CPS connection recorded yet.' })); return; }
    C.fill(el, 
      c.team ? h('div', { class: 'cps-conn-team', text: c.team }) : null,
      c.note ? h('p', { class: 'cps-conn-note', text: c.note }) : null,
      c.updated_at ? h('p', { class: 'cps-conn-when', text: c.updated_by ? `Updated by ${c.updated_by} on ${C.dayFull(c.updated_at)}` : `Updated ${C.dayFull(c.updated_at)}` }) : null);
  });

  dash.draw('pf-outreach', {
    mount() { return { armed: null }; },
    update(el, m) {
      const r = member();
      if (!r) { C.fill(el); return; }
      const rows = C.rows('outreach').filter((x) => x.member_id === r.id)
        .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.logged_at).localeCompare(String(a.logged_at)));
      if (!rows.length) { C.fill(el, h('li', { class: 'cps-muted', style: 'border:0;padding:0', text: 'No outreach logged yet.' })); return; }
      C.fill(el, ...rows.map((x) => {
        const del = h('button', { type: 'button', class: 'cps-del' + (m.armed === x.id ? ' is-armed' : ''), text: m.armed === x.id ? 'Confirm remove' : 'Remove' });
        del.addEventListener('click', async () => {
          if (m.armed !== x.id) { m.armed = x.id; del.classList.add('is-armed'); del.textContent = 'Confirm remove'; return; }
          m.armed = null;
          try { const db = await C.db(); await db.doc(`data/team/outreach/${x.id}`).delete(); }
          catch (err) { del.textContent = 'Only editors can remove'; }
        });
        return h('li', {},
          h('div', { class: 'cps-log-top' }, h('span', { class: 'cps-log-date', text: C.dayFull(x.date) }), resultBadge(x.result), del),
          h('div', { class: 'cps-log-meta', text: `${x.by || 'The team'} ${x.contact ? `spoke with ${x.contact}` : 'reached out'}${x.topic ? ` about ${x.topic}` : ''}.` }),
          x.notes ? h('p', { text: x.notes }) : null,
          x.added_by ? h('div', { class: 'cps-by', text: `Logged by ${x.added_by}` }) : null);
      }));
    },
  });

  // ---------- profile forms ----------
  const connForm = document.querySelector('#conn-form');
  if (connForm) connForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = S.member;
    if (!id) return;
    const team = connForm.elements.team.value.trim();
    const note = connForm.elements.note.value.trim();
    C.busy(connForm, true);
    try {
      const db = await C.db();
      if (team || note) await db.doc(`data/team/contacts/${id}`).set({ team, note, updated_at: new Date().toISOString() });
      else if (C.rows('contacts').some((r) => r.id === id)) await db.doc(`data/team/contacts/${id}`).delete();
      C.showErr(connForm, false);
      const d = document.querySelector('#conn-details');
      if (d) d.open = false;
    } catch (err) {
      C.showErr(connForm, true);
    } finally {
      C.busy(connForm, false);
    }
  });

  const logForm = document.querySelector('#log-form');
  if (logForm) logForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = S.member;
    if (!id) return;
    const f = logForm.elements;
    if (!(f.date.value && f.date.validity.valid) || !f.by.value.trim()) { f.date.reportValidity(); f.by.reportValidity(); return; }
    const row = {
      member_id: id,
      date: f.date.value,
      by: f.by.value.trim(),
      contact: f.contact.value.trim(),
      topic: f.topic.value.trim(),
      result: f.result.value,
      notes: f.notes.value.trim(),
      logged_at: new Date().toISOString(),
    };
    C.busy(logForm, true);
    try {
      const db = await C.db();
      const docId = `${id}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      await db.doc(`data/team/outreach/${docId}`).set(row);
      ['contact', 'topic', 'notes'].forEach((n) => { f[n].value = ''; });
      C.showErr(logForm, false);
      const d = document.querySelector('#log-details');
      if (d) d.open = false;
    } catch (err) {
      C.showErr(logForm, true);
    } finally {
      C.busy(logForm, false);
    }
  });
})();
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const tr = e.target.closest && e.target.closest('#cps tr.cps-mrow[data-member]');
  if (tr && e.target === tr) { e.preventDefault(); window.cps.openMember(tr.getAttribute('data-member')); }
});
