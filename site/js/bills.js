(function () {
  const C = window.cps;
  const S = C.state;
  const h = C.h;
  S.q = S.q || '';
  S.limit = S.limit || 100;
  const STAGES = ['Filed', 'In committee', 'Passed one chamber', 'Passed both chambers', 'Signed into law'];

  // ---------- header, nav and KPI numbers ----------
  const first = (rows) => rows[0] || {};
  const where = (rows, k, v) => rows.find((r) => r[k] === v) || {};
  const leadIssue = (rows) => [...rows].sort((a, b) => b.bills - a.bills)[0] || {};
  C.text('nav-bills', 'summary', (r) => first(r).bills);
  C.text('c-bills', 'summary', (r) => first(r).bills);
  C.text('c-pairs', 'summary', (r) => first(r).pairs);
  C.text('c-newest', 'summary', (r) => first(r).newest_bill);
  C.text('c-theme', 'topic_counts', (r) => first(r).topic);
  C.text('c-theme-n', 'topic_counts', (r) => first(r).bills);
  C.text('c-theme-total', 'summary', (r) => first(r).bills);
  C.text('c-col-n', 'topic_counts', (r) => where(r, 'topic', 'Cost of living').bills ?? 0);
  C.text('c-priority', 'summary', (r) => first(r).priority_bills);
  C.text('c-watched', 'tracking_summary', (r) => first(r).tracked);
  C.text('bill-total', 'summary', (r) => first(r).bills);
  C.text('t-gaps', 'focus_areas', (r) => {
    const gaps = r.filter((x) => x.bills === 0).map((x) => x.area);
    if (gaps.length < 2) return gaps.join('');
    return gaps.slice(0, -1).join(', ') + ' or ' + gaps[gaps.length - 1];
  });
  C.text('t-lead', 'focus_areas', (r) => leadIssue(r).area);
  C.text('t-lead-n', 'focus_areas', (r) => leadIssue(r).bills);

  dash.draw('c-spark', (el) => {
    const rows = C.rows('filing_days');
    const max = Math.max(1, ...rows.map((r) => r.bills));
    C.fill(el, ...rows.map((r, i) => h('i', {
      class: i === rows.length - 1 ? 'is-last' : '',
      style: `height:${Math.max(12, (100 * r.bills) / max)}%`,
      title: `${C.day(r.date)}: ${r.bills}`,
      'data-source': 'filing_days', 'data-field': 'bills', 'data-where': C.where('date', r.date),
    })));
  });

  dash.draw('c-theme-ring', (el) => {
    const r = first(C.rows('topic_counts'));
    const p = Number(r.share_pct) || 0;
    el.style.setProperty('--p', String(p));
    C.fill(el, h('span', { class: 'cps-ring-in' }, h('b', { 'data-source': 'topic_counts', 'data-field': 'share_pct', 'data-row': '0', text: C.rows('topic_counts').length ? p : '—' }), '%'));
  });

  dash.draw('c-watch', (el) => {
    const d = dash.data('focus_areas');
    if (d.status !== 'ok') { C.fill(el, h('li', { class: 'cps-muted', text: d.status === 'loading' ? 'Loading…' : '—' })); return; }
    const max = Math.max(1, ...d.data.map((r) => r.bills));
    C.fill(el, ...d.data.map((r) => h('li', { class: r.bills ? '' : 'is-zero' },
      h('span', { text: r.area }),
      h('span', { class: 'cps-mini-bar' }, h('i', { style: `width:${(100 * r.bills) / max}%` })),
      h('span', { class: 'cps-mini-n', 'data-source': 'focus_areas', 'data-field': 'bills', 'data-where': C.where('area', r.area), text: r.bills }))));
  });

  dash.draw('c-clients', (el) => {
    const rows = C.rows('client_counts');
    C.fill(el, ...rows.map((r) => h('li', {},
      h('button', { type: 'button', 'data-open-client': r.client, 'aria-label': `Open the ${r.client} folder` },
        r.client,
        h('b', { class: r.bills ? 'is-on' : '', 'data-source': 'client_counts', 'data-field': 'bills', 'data-where': C.where('client', r.client), text: r.bills })))));
  });

  // sentence variants and control state that depend on data or filters
  dash.onData(() => {
    const fa = dash.data('focus_areas');
    if (fa.status === 'ok') {
      const gaps = fa.data.filter((x) => x.bills === 0).length;
      document.querySelectorAll('#cps [data-variant="gaps"]').forEach((s) => { s.hidden = gaps === 0; });
      document.querySelectorAll('#cps [data-variant="nogaps"]').forEach((s) => { s.hidden = gaps > 0; });
    }
    const p = params();
    const party = document.querySelector('#f-party');
    if (party && document.activeElement !== party) party.value = p.party;
    const w = document.querySelector('#f-watch');
    if (w) w.setAttribute('aria-pressed', String(p.watch === 'yes'));
    document.querySelectorAll('#th-bill, #th-filed').forEach((th) => th.removeAttribute('aria-sort'));
    const th = document.querySelector(S.sort === 'bill' ? '#th-bill' : '#th-filed');
    if (th) th.setAttribute('aria-sort', S.sort === 'bill' ? 'ascending' : 'descending');
  });

  // ---------- filters ----------
  function params() {
    const p = dash.params() || {};
    return { topic: p.topic || '', client: p.client || '', party: p.party || '', member: p.member || '', watch: p.watch || '' };
  }
  C.params = params;
  const setP = (k, v) => dash.setParams({ [k]: v || '' });
  const CLEAR = { topic: '', client: '', party: '', member: '', watch: '' };

  dash.draw('f-topic', (sel) => {
    const rows = C.rows('topic_counts');
    const pri = C.WATCH.map((t) => rows.find((r) => r.topic === t) || { topic: t, bills: 0 });
    const other = rows.filter((r) => !C.WATCH.includes(r.topic));
    C.fill(sel,
      h('option', { value: '', text: 'All topics' }),
      h('optgroup', { label: 'Priority issues' }, h('option', { value: '__priority', text: 'All priority issues' }), ...pri.map((r) => h('option', { value: r.topic, text: `${r.topic} (${r.bills})` }))),
      h('optgroup', { label: 'Other topics' }, ...other.map((r) => h('option', { value: r.topic, text: `${r.topic} (${r.bills})` }))));
    sel.value = params().topic;
    sel.onchange = () => setP('topic', sel.value);
  });

  dash.draw('f-client', (sel) => {
    const rows = C.rows('client_counts');
    C.fill(sel, h('option', { value: '', text: 'All clients' }), ...rows.map((r) => h('option', { value: r.client, text: r.general ? `${r.client}: monitoring (${r.bills})` : `${r.client} (${r.bills})` })));
    const cur = params().client;
    if (cur && !rows.some((r) => r.client === cur)) sel.append(h('option', { value: cur, text: cur }));
    sel.value = cur;
    sel.onchange = () => setP('client', sel.value);
  });

  dash.draw('f-member', (sel) => {
    const rows = C.rows('sponsors');
    const label = (r) => { const parts = String(r.name).split(' '); const last = parts.pop(); return `${last}, ${parts.join(' ')} (${r.party})`; };
    const grp = (ch) => h('optgroup', { label: ch }, ...rows.filter((r) => r.chamber === ch)
      .sort((a, b) => label(a).localeCompare(label(b)))
      .map((r) => h('option', { value: r.id, text: label(r) })));
    C.fill(sel, h('option', { value: '', text: 'All lawmakers' }), grp('House'), grp('Senate'));
    sel.value = params().member;
    sel.onchange = () => setP('member', sel.value);
  });

  const party = document.querySelector('#f-party');
  if (party) party.addEventListener('change', () => setP('party', party.value));
  const search = document.querySelector('#bill-search');
  if (search) search.addEventListener('input', () => { S.q = search.value.trim().toLowerCase(); dash.draw('bill-rows'); dash.draw('bill-shown'); });
  const scrollToTable = () => { const t = document.querySelector('#bill-card'); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  document.addEventListener('click', (e) => {
    if (!e.target.closest) return;
    if (e.target.closest('#cps #f-clear, #cps [data-clear-filters]')) {
      dash.setParams(CLEAR);
      S.q = '';
      if (search) search.value = '';
    }
    if (e.target.closest('#cps #f-watch')) setP('watch', params().watch === 'yes' ? '' : 'yes');
    if (e.target.closest('#cps [data-show-priority]')) { dash.setParams({ ...CLEAR, topic: '__priority' }); scrollToTable(); }
    const sb = e.target.closest('#cps .cps-sort');
    if (sb) { S.sort = sb.dataset.sort; dash.draw('bill-rows'); }
  });

  function matches(b, t, p) {
    const topics = C.split(b.topics);
    if (p.topic === '__priority' && !topics.some((x) => C.WATCH.includes(x))) return false;
    if (p.topic && p.topic !== '__priority' && !topics.includes(p.topic)) return false;
    if (p.client && !C.split(t && t.clients).includes(p.client)) return false;
    if (p.watch === 'yes' && !(t && t.watch)) return false;
    if (p.party === 'Bipartisan' && b.sponsor_party !== 'Bipartisan') return false;
    if ((p.party === 'Republican' || p.party === 'Democrat') && b.sponsor_party !== p.party && b.sponsor_party !== 'Bipartisan') return false;
    if (p.member) {
      const ids = [b.house_sponsor_id, b.senate_sponsor_id, ...C.split(b.house_cosponsor_ids)];
      if (!ids.includes(p.member)) return false;
    }
    if (S.q) {
      const hay = [b.bill_numbers, b.bill_numbers.replace(/ /g, ''), b.title, b.subject, b.summary, b.house_sponsor, b.senate_sponsor, b.house_cosponsors, b.topics, t && t.clients].join(' ').toLowerCase();
      if (!hay.includes(S.q)) return false;
    }
    return true;
  }
  const billNo = (b) => {
    const m = String(b.key).match(/^(HB|SB)(\d+)/);
    return m ? (m[1] === 'HB' ? 0 : 100000) + Number(m[2]) : 0;
  };

  // ---------- cells (shared with the client folders) ----------
  C.billCell = function (b) {
    const num = (b.house_bill || b.senate_bill).split(' ');
    const other = b.house_bill && b.senate_bill ? b.senate_bill : '';
    return h('div', { class: 'cps-bill' },
      h('span', { class: 'cps-tile' + (num[0] === 'SB' ? ' is-senate' : ''), 'aria-hidden': 'true' }, h('small', { text: num[0] }), h('b', { text: num[1] })),
      h('div', {}, h('span', { class: 'cps-sr', text: b.bill_numbers }), h('div', { class: 'cps-bill-t', text: b.title }), other ? h('div', { class: 'cps-bill-m', text: `Companion ${other}` }) : null));
  };
  C.personCell = function (id, name, party, sub) {
    if (!id) return h('span', { class: 'cps-none', text: 'None filed yet' });
    return h('div', { class: 'cps-person' }, C.avatar(name, party, 'sm', id),
      h('div', { class: 'cps-person-t' }, C.memberBtn(id, name, party), sub ? h('span', { class: 'cps-sub', text: sub }) : null));
  };
  C.sponsorsCell = function (b) {
    const cos = C.split(b.house_cosponsor_ids).length;
    const line = (label, id, name, party, extra) => h('div', { class: 'cps-sline' },
      h('span', { class: 'cps-sline-l', text: label }),
      id ? C.avatar(name, party, 'xs', id) : null,
      id ? C.memberBtn(id, name, party) : h('span', { class: 'cps-none', text: 'None yet' }),
      extra ? h('span', { class: 'cps-sub', text: extra }) : null);
    return h('div', { class: 'cps-slines' },
      line('House', b.house_sponsor_id, b.house_sponsor, b.house_party, cos ? `+${cos}` : ''),
      line('Senate', b.senate_sponsor_id, b.senate_sponsor, b.senate_party, ''));
  };
  C.stageCell = function (b) {
    const i = Math.max(0, STAGES.indexOf(b.stage));
    return h('div', { class: 'cps-stage' },
      h('div', { class: 'cps-stage-top' }, h('b', { text: b.stage }), h('span', { text: C.day(b.last_action_date || b.filed_date) })),
      h('div', { class: 'cps-track', role: 'img', 'aria-label': `Stage ${i + 1} of ${STAGES.length}: ${b.stage}` }, ...STAGES.map((_, k) => h('i', { class: k <= i ? 'on' : '' }))));
  };
  C.hearingCell = function (t) {
    if (t && (t.committee || t.hearing_date)) {
      let soon = null;
      if (t.hearing_date) {
        const now = new Date();
        const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
        const [y, m, d] = t.hearing_date.split('-').map(Number);
        const days = Math.round((Date.UTC(y, m - 1, d) - today) / 86400000);
        if (days >= 0 && days <= 7) soon = days === 0 ? 'Today' : (days === 1 ? 'Tomorrow' : `In ${days} days`);
      }
      return h('div', { class: 'cps-hear' },
        t.hearing_date ? h('span', { class: 'cps-slot', text: C.dayWk(t.hearing_date).replace(/, \d{4}$/, '') }) : null,
        t.committee || t.hearing_time ? h('span', { class: 'cps-hear-c', text: [C.time12(t.hearing_time), t.committee].filter(Boolean).join(', ') }) : null,
        soon ? h('span', { class: 'cps-soon', text: soon }) : null);
    }
    return h('div', { class: 'cps-hear' }, h('span', { class: 'cps-slot cps-muted', text: 'Not scheduled' }));
  };

  function starBtn(b, t) {
    const on = Boolean(t && t.watch);
    const btn = h('button', { type: 'button', class: 'cps-star', 'aria-pressed': String(on), 'aria-label': on ? `Remove ${b.bill_numbers} from the CPS watch list` : `Add ${b.bill_numbers} to the CPS watch list`, title: on ? 'On CPS watch' : 'Add to CPS watch', text: on ? '★' : '☆' });
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const next = btn.getAttribute('aria-pressed') !== 'true';
      btn.setAttribute('aria-pressed', String(next));
      btn.textContent = next ? '★' : '☆';
      const toast = document.querySelector('#cps-toast');
      try {
        const cur = C.rows('bill_tracking').find((r) => r.key === b.key) || {};
        const db = await C.db();
        await db.doc(`data/team/bill_clients/${b.key}`).set({ clients: cur.clients || '', watch: next, watch_note: cur.watch_note || '', updated_at: new Date().toISOString() });
        if (toast) toast.hidden = true;
      } catch (err) {
        btn.setAttribute('aria-pressed', String(!next));
        btn.textContent = next ? '☆' : '★';
        if (toast) toast.hidden = false;
      }
    });
    return btn;
  }

  function detailRow(b, t) {
    const tpl = document.querySelector('#tpl-detail');
    if (!tpl) return null;
    const tr = tpl.content.cloneNode(true).querySelector('tr');
    const slot = (n) => tr.querySelector(`[data-slot="${n}"]`);
    slot('summary').textContent = b.summary || '';
    const note = (t && t.watch_note) || b.cps_note;
    if (note) slot('note').textContent = note; else slot('note-wrap').remove();
    slot('caption').textContent = b.caption || '';
    slot('companion').textContent = b.house_bill && b.senate_bill ? `${b.house_bill} / ${b.senate_bill}` : b.companion;
    slot('last').textContent = `${b.last_action} on ${C.dayFull(b.last_action_date)}`;
    const cosIds = C.split(b.house_cosponsor_ids);
    const L = new Map(C.rows('legislators').map((r) => [r.id, r]));
    if (cosIds.length) C.fill(slot('cos'), ...cosIds.map((id) => { const p = L.get(id) || {}; return C.memberBtn(id, p.name || id, p.party); }));
    else slot('cos').textContent = 'None yet';
    const cl = C.split(t && t.clients);
    const by = t && t.tagged_by ? h('span', { class: 'cps-by', text: `Tagged by ${t.tagged_by}${t.tagged_at ? ' on ' + C.day(t.tagged_at) : ''}` }) : null;
    if (cl.length) C.fill(slot('clients'), ...cl.map(C.clientChip), by); else slot('clients').textContent = 'None tagged';
    if (!cl.length && by && note && slot('note')) slot('note').after(by);
    slot('hearing').textContent = t && (t.committee || t.hearing_date)
      ? [t.committee, [C.dayWk(t.hearing_date), t.hearing_time ? `at ${C.time12(t.hearing_time)}` : ''].filter(Boolean).join(' '), t.room ? `in ${t.room}` : ''].filter(Boolean).join(', ') + (t.hearing_note ? ` (${t.hearing_note})` : '')
        + (t.hearing_by ? `. Added by ${t.hearing_by}.` : (t.hearing_source === 'calendar' ? '. From the TGA committee calendar.' : ''))
      : 'Not scheduled';
    slot('fiscal').textContent = b.fiscal_note || '';
    const link = (n, url) => { const a = slot(n); if (url) a.setAttribute('href', url); else a.remove(); };
    link('house-url', b.house_url);
    link('senate-url', b.senate_url);
    link('pdf', b.bill_text_url);
    const btn = tr.querySelector('[data-edit-bill]');
    if (btn) btn.setAttribute('data-edit-bill', b.key);
    return tr;
  }

  function billRow(b, t) {
    const open = S.open.has(b.key);
    const tr = h('tr', { class: 'cps-row' + (open ? ' is-open' : ''), 'data-key': b.key, tabindex: '0', 'aria-expanded': String(open) });
    const cos = C.split(b.house_cosponsor_ids).length;
    tr.append(
      h('td', {}, C.billCell(b)),
      h('td', {}, h('div', { class: 'cps-tags' }, ...C.split(t && t.clients).map(C.clientChip), ...C.split(b.topics).map(C.topicChip))),
      h('td', {}, C.sponsorsCell(b)),
      h('td', {}, C.stageCell(b)),
      h('td', {}, C.hearingCell(t)));
    return tr;
  }

  function visibleBills() {
    const B = dash.data('bills');
    if (B.status !== 'ok') return null;
    const track = new Map(C.rows('bill_tracking').map((r) => [r.key, r]));
    const p = params();
    return { track, rows: B.data.filter((b) => matches(b, track.get(b.key), p)) };
  }

  dash.draw('bill-rows', (tbody) => {
    const B = dash.data('bills');
    const empty = document.querySelector('#bills-empty');
    const v = visibleBills();
    if (!v) {
      C.fill(tbody, h('tr', {}, h('td', { colspan: '5', class: 'cps-loading', text: B.status === 'loading' ? 'Loading bills…' : (B.status === 'error' ? 'The bill list failed to load.' : '—') })));
      if (empty) empty.hidden = true;
      return;
    }
    const rows = [...v.rows].sort(S.sort === 'bill'
      ? (a, b) => billNo(a) - billNo(b)
      : (a, b) => String(b.filed_date).localeCompare(String(a.filed_date)) || billNo(a) - billNo(b));
    const out = [];
    for (const b of rows.slice(0, S.limit)) {
      const t = v.track.get(b.key);
      out.push(billRow(b, t));
      if (S.open.has(b.key)) { const d = detailRow(b, t); if (d) out.push(d); }
    }
    if (rows.length > S.limit) {
      const left = rows.length - S.limit;
      out.push(h('tr', { class: 'cps-more-row' }, h('td', { colspan: '5' },
        h('button', { type: 'button', class: 'cps-btn', 'data-more-bills': '' }, `Show ${Math.min(100, left)} more bills`))));
    }
    C.fill(tbody, ...out);
    if (empty) empty.hidden = rows.length > 0;
  });

  dash.draw('bill-shown', (el) => {
    const v = visibleBills();
    el.textContent = v ? String(v.rows.length) : '—';
  });

  // sidebar: starred bills
  dash.draw('pins', (el) => {
    const B = new Map(C.rows('bills').map((b) => [b.key, b]));
    const starred = C.rows('bill_tracking').filter((t) => t.watch && B.has(t.key));
    if (!starred.length) { C.fill(el, h('li', { class: 'cps-pin-empty', text: 'Star a bill to pin it here.' })); return; }
    C.fill(el, ...starred.map((t) => {
      const b = B.get(t.key);
      return h('li', {}, h('button', { type: 'button', 'data-goto-bill': b.key, title: b.title }, h('b', { text: b.house_bill || b.senate_bill }), h('span', { text: b.title })));
    }));
  });

  // jump to one bill on the Bills page, opened
  C.goToBill = function (key) {
    C.showTab('bills');
    S.open.add(key);
    S.limit = 1e6;
    const v = visibleBills();
    if (v && !v.rows.some((b) => b.key === key)) {
      S.q = '';
      if (search) search.value = '';
      dash.setParams(CLEAR);
    }
    dash.draw('bill-rows');
    dash.draw('bill-shown');
    setTimeout(() => {
      const row = document.querySelector(`#bill-table tr[data-key="${key}"]`);
      if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 60);
  };
  document.addEventListener('click', (e) => {
    const g = e.target.closest && e.target.closest('#cps [data-goto-bill]');
    if (g && !e.target.closest('[data-member]')) C.goToBill(g.getAttribute('data-goto-bill'));
  });

  document.addEventListener('click', (e) => {
    if (e.target.closest && e.target.closest('#cps [data-more-bills]')) { S.limit += 100; dash.draw('bill-rows'); }
  });

  // when the bill data was last refreshed (written by the scheduled update)
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  C.updatedText = () => {
    const d = dash.data('refresh');
    const r = d.status === 'ok' ? ((d.data || []).find((x) => x.id === 'latest') || {}) : {};
    const t = r.last_success ? new Date(r.last_success) : null;
    if (t && !Number.isNaN(t.getTime())) {
      const hr = t.getHours();
      return `Bill data updated ${MON[t.getMonth()]} ${t.getDate()} at ${((hr + 11) % 12) + 1}:${String(t.getMinutes()).padStart(2, '0')} ${hr < 12 ? 'AM' : 'PM'}. Source: LegiScan (CC BY 4.0).`;
    }
    return 'Bill data comes from capitol.tn.gov. Automatic updates start once LegiScan is connected.';
  };
  dash.draw('hh-updated', (el) => { const t = C.updatedText(); el.textContent = t; el.setAttribute('data-state', t.startsWith('Bill data updated') ? 'live' : 'wait'); });

  // expand / collapse a bill
  function toggleRow(tr) {
    const key = tr.getAttribute('data-key');
    if (!key) return;
    if (S.open.has(key)) S.open.delete(key); else S.open.add(key);
    dash.draw('bill-rows');
  }
  document.addEventListener('click', (e) => {
    if (!e.target.closest) return;
    const tr = e.target.closest('#bill-table tr.cps-row');
    if (!tr || e.target.closest('button, a, input, select, label')) return;
    toggleRow(tr);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const tr = e.target.closest && e.target.closest('#bill-table tr.cps-row');
    if (!tr || e.target !== tr) return;
    e.preventDefault();
    toggleRow(tr);
  });

  // ---------- bill dialog: watch, client tags, hearing ----------
  function openBill(key) {
    S.bill = key;
    const t = C.rows('bill_tracking').find((r) => r.key === key) || {};
    const b = C.rows('bills').find((r) => r.key === key) || {};
    S.pending = new Set(C.split(t.clients));
    const f = document.querySelector('#bill-form');
    if (f) {
      f.elements.watch_note.value = t.watch_note || b.cps_note || '';
      f.elements.committee.value = t.committee || '';
      f.elements.date.value = t.hearing_date || '';
      f.elements.time.value = t.hearing_time || '';
      f.elements.room.value = t.room || '';
      f.elements.note.value = t.hearing_note || '';
      const nc = document.querySelector('#new-client');
      if (nc) nc.value = '';
      C.showErr(f, false);
    }
    dash.draw('bd-head');
    dash.draw('bd-clients');
    C.openDialog(document.querySelector('#bill-dialog'));
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('#cps [data-edit-bill]');
    if (b && b.getAttribute('data-edit-bill')) openBill(b.getAttribute('data-edit-bill'));
  });

  dash.draw('bd-head', (el) => {
    const b = C.rows('bills').find((r) => r.key === S.bill);
    if (!b) { C.fill(el); return; }
    C.fill(el, h('p', { class: 'cps-bd-num', text: b.bill_numbers }), h('h2', { class: 'cps-bd-title', text: b.title }));
  });

  dash.draw('bd-clients', (el) => {
    const names = C.rows('client_counts').map((r) => r.client);
    for (const n of S.pending) if (!names.includes(n)) names.push(n);
    names.sort((a, b) => (C.isGeneral(b) ? 1 : 0) - (C.isGeneral(a) ? 1 : 0) || a.localeCompare(b));
    C.fill(el, ...names.map((n) => {
      const on = S.pending.has(n);
      const gen = C.isGeneral(n);
      const box = h('input', { type: 'checkbox', value: n });
      box.checked = on;
      const lab = h('label', { class: 'cps-pick' + (gen ? ' cps-pick-general' : '') + (on ? ' is-on' : ''), title: gen ? 'Major legislation we monitor that doesn’t directly affect a client' : null }, box, h('span', { text: n }), gen ? h('small', { text: 'monitor only' }) : null);
      box.addEventListener('change', () => {
        if (box.checked) S.pending.add(n); else S.pending.delete(n);
        lab.classList.toggle('is-on', box.checked);
      });
      return lab;
    }));
  });

  C.addClient = async function (name) {
    const clean = String(name || '').trim().replace(/;/g, ',');
    if (!clean) return false;
    const db = await C.db();
    await db.doc(`data/team/clients/${C.slug(clean) || 'client'}`).set({ name: clean });
    return clean;
  };
  const addBtn = document.querySelector('#add-client');
  const addFromDialog = async () => {
    const input = document.querySelector('#new-client');
    const name = input ? input.value.trim().replace(/;/g, ',') : '';
    if (!name) return;
    S.pending.add(name);
    input.value = '';
    dash.draw('bd-clients');
    const f = document.querySelector('#bill-form');
    try { await C.addClient(name); C.showErr(f, false); } catch (err) { C.showErr(f, true); }
  };
  if (addBtn) addBtn.addEventListener('click', addFromDialog);
  const nc = document.querySelector('#new-client');
  if (nc) nc.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addFromDialog(); } });

  const billForm = document.querySelector('#bill-form');
  if (billForm) billForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const key = S.bill;
    if (!key) return;
    const f = billForm.elements;
    const hearing = { committee: f.committee.value.trim(), date: f.date.validity.valid ? f.date.value : '', time: f.time.value, room: f.room.value.trim(), note: f.note.value.trim() };
    C.busy(billForm, true);
    try {
      const db = await C.db();
      await db.doc(`data/team/bill_clients/${key}`).set({ clients: [...S.pending].sort().join(';'), watch_note: f.watch_note.value.trim(), updated_at: new Date().toISOString() });
      if (Object.values(hearing).some(Boolean)) await db.doc(`data/team/hearings/${key}`).set({ ...hearing, updated_at: new Date().toISOString() });
      else if (C.rows('hearings').some((r) => r.id === key)) await db.doc(`data/team/hearings/${key}`).delete();
      C.showErr(billForm, false);
      const d = document.querySelector('#bill-dialog');
      if (d) d.close();
    } catch (err) {
      C.showErr(billForm, true);
    } finally {
      C.busy(billForm, false);
    }
  });

  // committee suggestions for the hearing form
  dash.draw('committee-list', (el) => {
    const names = new Set();
    for (const r of C.rows('legislators')) {
      for (const c of C.split(r.committees)) {
        const name = c.replace(/^(Chair|Vice-Chair|2nd Vice-Chair|Co-Chair),\s*/, '').trim();
        if (/^(Joint|Council|Fiscal Review|Select|Ad Hoc)/.test(name)) continue;
        names.add(`${r.chamber} ${name}${/Subcommittee$/.test(name) ? '' : ' Committee'}`);
      }
    }
    C.fill(el, ...[...names].sort().map((n) => h('option', { value: n })));
  });
})();
