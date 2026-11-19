dash.calc('summary', {
  inputs: ['bills'],
  title: 'Filing summary',
  description: 'Bills filed so far (a House–Senate pair counts once), bill numbers by chamber, bills on a CPS priority issue, and the newest filing.',
  fn: (bills) => {
    const priority = ['Health care', 'AI & technology', 'PBMs & pharmacy', 'Recycling & waste'];
    const topicsOf = (b) => String(b.topics || '').split(';').map((t) => t.trim()).filter(Boolean);
    const newest = [...bills].sort((a, b) => String(b.filed_date).localeCompare(String(a.filed_date)) || String(b.key).localeCompare(String(a.key)));
    const n = newest[0] || {};
    return [{
      bills: bills.length,
      house_numbers: bills.filter((b) => b.house_bill).length,
      senate_numbers: bills.filter((b) => b.senate_bill).length,
      pairs: bills.filter((b) => b.house_bill && b.senate_bill).length,
      priority_bills: bills.filter((b) => topicsOf(b).some((t) => priority.includes(t))).length,
      republican_bills: bills.filter((b) => b.sponsor_party === 'Republican').length,
      democrat_bills: bills.filter((b) => b.sponsor_party === 'Democrat').length,
      bipartisan_bills: bills.filter((b) => b.sponsor_party === 'Bipartisan').length,
      newest_bill: n.bill_numbers || '',
      newest_title: n.title || '',
      newest_date: n.filed_date || '',
    }];
  },
});

dash.calc('filing_days', {
  inputs: ['bills'],
  title: 'Bills filed by day',
  description: 'How many bills were filed for introduction on each filing day so far.',
  fn: (bills) => {
    const byDay = new Map();
    for (const b of bills) byDay.set(b.filed_date, (byDay.get(b.filed_date) || 0) + 1);
    return [...byDay.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]))).map(([date, n]) => ({ date, bills: n }));
  },
});

dash.calc('topic_counts', {
  inputs: ['bills'],
  title: 'Bills by topic',
  description: 'How many bills carry each topic, split by the sponsors’ party. A bill can carry two topics, so shares can add to more than 100%.',
  fn: (bills) => {
    const priority = ['Health care', 'AI & technology', 'PBMs & pharmacy', 'Recycling & waste'];
    const blank = (topic) => ({ topic, bills: 0, republican: 0, democrat: 0, bipartisan: 0, list: [] });
    const byTopic = new Map(priority.map((t) => [t, blank(t)]));
    for (const b of bills) {
      for (const t of String(b.topics || '').split(';').map((s) => s.trim()).filter(Boolean)) {
        if (!byTopic.has(t)) byTopic.set(t, blank(t));
        const r = byTopic.get(t);
        r.bills += 1;
        r.list.push(b.bill_numbers);
        if (b.sponsor_party === 'Republican') r.republican += 1;
        else if (b.sponsor_party === 'Democrat') r.democrat += 1;
        else r.bipartisan += 1;
      }
    }
    return [...byTopic.values()]
      .map((r) => ({
        topic: r.topic,
        cps_watch: priority.includes(r.topic),
        bills: r.bills,
        share_pct: bills.length ? Math.round((100 * r.bills) / bills.length) : 0,
        republican: r.republican,
        democrat: r.democrat,
        bipartisan: r.bipartisan,
        bill_list: r.list.join(', '),
      }))
      .sort((a, b) => b.bills - a.bills || a.topic.localeCompare(b.topic));
  },
});

dash.calc('focus_areas', {
  inputs: ['bills'],
  title: 'Priority issues',
  description: 'Bills filed on each of CPS’s four priority issues: health care, AI and technology, PBMs and pharmacy, and recycling and waste.',
  fn: (bills) => {
    const priority = ['Health care', 'AI & technology', 'PBMs & pharmacy', 'Recycling & waste'];
    return priority.map((area) => {
      const hits = bills
        .filter((b) => String(b.topics || '').split(';').map((t) => t.trim()).includes(area))
        .sort((a, b) => String(b.filed_date).localeCompare(String(a.filed_date)));
      return {
        area,
        bills: hits.length,
        bill_list: hits.map((b) => b.bill_numbers).join(', '),
        newest_bill: hits[0] ? hits[0].bill_numbers : '',
        newest_date: hits[0] ? hits[0].filed_date : '',
      };
    });
  },
});

dash.calc('sponsors', {
  inputs: ['bills', 'legislators'],
  title: 'Sponsors so far',
  description: 'Every lawmaker on a filed bill, with how many they filed as prime sponsor and how many they co-sponsor.',
  fn: (bills, legislators) => {
    const people = new Map(legislators.map((r) => [r.id, r]));
    const tally = new Map();
    const add = (id, role, b) => {
      if (!id) return;
      const p = people.get(id) || {};
      const r = tally.get(id) || { id, name: p.name || id, party: p.party || '', chamber: p.chamber || '', district: p.district || '', sponsored: 0, cosponsored: 0, list: [], topics: new Map() };
      if (role === 'prime') {
        r.sponsored += 1;
        r.list.push(b.bill_numbers);
        for (const t of String(b.topics || '').split(';').map((s) => s.trim()).filter(Boolean)) r.topics.set(t, (r.topics.get(t) || 0) + 1);
      } else {
        r.cosponsored += 1;
      }
      tally.set(id, r);
    };
    for (const b of bills) {
      add(b.house_sponsor_id, 'prime', b);
      add(b.senate_sponsor_id, 'prime', b);
      for (const id of String(b.house_cosponsor_ids || '').split(';').map((s) => s.trim()).filter(Boolean)) add(id, 'co', b);
    }
    return [...tally.values()]
      .map((r) => ({
        id: r.id, name: r.name, party: r.party, chamber: r.chamber, district: r.district,
        bills_sponsored: r.sponsored, bills_cosponsored: r.cosponsored, bill_list: r.list.join(', '),
        top_topics: [...r.topics.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map((x) => x[0]).join('; '),
      }))
      .sort((a, b) => b.bills_sponsored - a.bills_sponsored || b.bills_cosponsored - a.bills_cosponsored || a.name.localeCompare(b.name));
  },
});

dash.calc('composition', {
  inputs: ['legislators'],
  title: 'Seats by party',
  description: 'Seats held by each party in each chamber, vacancies, and members starting their first term in January 2027.',
  fn: (legislators) => ['House', 'Senate'].map((chamber) => {
    const seats = legislators.filter((r) => r.chamber === chamber);
    const serving = seats.filter((r) => r.status !== 'Vacant');
    return {
      chamber,
      seats: seats.length,
      republicans: serving.filter((r) => r.party === 'R').length,
      democrats: serving.filter((r) => r.party === 'D').length,
      vacant: seats.length - serving.length,
      new_members: serving.filter((r) => r.first_term === true || r.first_term === 'true').length,
    };
  }),
});

dash.calc('bill_tracking', {
  inputs: ['bills', 'bill_clients', 'hearings'],
  title: 'CPS tracking by bill',
  description: 'For each bill: whether the team put it on the CPS watch list and why, the clients tagged on it, and the committee hearing the team entered.',
  fn: (bills, bill_clients, hearings) => {
    const tags = new Map(bill_clients.map((r) => [r.id, r]));
    const heard = new Map(hearings.map((r) => [r.id, r]));
    return bills.map((b) => {
      const c = tags.get(b.key) || {};
      const h = heard.get(b.key) || {};
      // a hearing the team entered wins; otherwise use one from the TGA calendar, if the bill file has it
      const team = Boolean(h.committee || h.date);
      const committee = team ? h.committee || '' : b.hearing_committee || '';
      const date = team ? h.date || '' : b.hearing_date || '';
      const time = team ? h.time || '' : b.hearing_time || '';
      const room = team ? h.room || '' : b.hearing_room || '';
      const scheduled = Boolean(committee || date);
      return {
        key: b.key,
        watch: c.watch === true || c.watch === 'true',
        watch_note: c.watch_note || '',
        clients: String(c.clients || ''),
        tagged_by: c.updated_by || c.added_by || '',
        tagged_at: String(c.updated_at || ''),
        committee,
        hearing_date: date,
        hearing_time: time,
        room,
        hearing_note: team ? h.note || '' : '',
        hearing_by: team ? h.updated_by || h.added_by || '' : '',
        hearing_source: team ? 'team' : (scheduled ? 'calendar' : ''),
        hearing: scheduled ? [committee, date, time, room].filter(Boolean).join(', ') : 'Not scheduled',
      };
    });
  },
});

dash.calc('tracking_summary', {
  inputs: ['bills', 'bill_clients', 'hearings'],
  title: 'CPS watch list size',
  description: 'How many filed bills the team has starred for the CPS watch list, how many carry a client tag or the General monitoring tag, and how many have a committee hearing set, with the next one.',
  fn: (bills, bill_clients, hearings) => {
    const byKey = new Map(bills.map((b) => [b.key, b]));
    const mine = bill_clients.filter((r) => byKey.has(r.id));
    const tags = (r) => String(r.clients || '').split(';').map((s) => s.trim()).filter(Boolean);
    const set = hearings.filter((h) => byKey.has(h.id) && (h.committee || h.date));
    const today = new Date().toISOString().slice(0, 10);
    const next = set.filter((h) => h.date && h.date >= today).sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.time || '').localeCompare(String(b.time || '')))[0];
    return [{
      watched: mine.filter((r) => r.watch === true || r.watch === 'true').length,
      tracked: mine.filter((r) => tags(r).length > 0).length,
      tagged: mine.filter((r) => tags(r).some((t) => t.toLowerCase() !== 'general')).length,
      general: mine.filter((r) => tags(r).some((t) => t.toLowerCase() === 'general')).length,
      hearings: set.length,
      next_hearing_bill: next ? byKey.get(next.id).bill_numbers : '',
      next_hearing_date: next ? next.date : '',
      next_hearing_time: next ? next.time || '' : '',
      next_hearing_committee: next ? next.committee || '' : '',
    }];
  },
});

dash.calc('client_counts', {
  inputs: ['bills', 'bill_clients', 'clients', 'hearings'],
  title: 'Bills per client',
  description: 'For each CPS client folder: how many filed bills the team tagged to it, how many of those are on the watch list or have a hearing set, and their sponsors. "General" is the folder for major legislation the team monitors that does not directly affect a client; it is listed first.',
  fn: (bills, bill_clients, clients, hearings) => {
    const byKey = new Map(bills.map((b) => [b.key, b]));
    const heard = new Set(hearings.filter((h) => h.committee || h.date).map((h) => h.id));
    const names = [];
    const general = new Set();
    const addedBy = new Map();
    for (const c of clients) {
      const n = String(c.name || '').trim();
      if (!n) continue;
      if (c.added_by) addedBy.set(n, c.added_by);
      if (!names.includes(n)) names.push(n);
      if (c.kind === 'general' || n.toLowerCase() === 'general') general.add(n);
    }
    const tagged = bill_clients
      .filter((r) => byKey.has(r.id))
      .map((r) => ({ key: r.id, watch: r.watch === true || r.watch === 'true', list: String(r.clients || '').split(';').map((s) => s.trim()).filter(Boolean) }));
    for (const t of tagged) for (const n of t.list) {
      if (!names.includes(n)) names.push(n);
      if (n.toLowerCase() === 'general') general.add(n);
    }
    return names
      .sort((a, b) => (general.has(b) ? 1 : 0) - (general.has(a) ? 1 : 0) || a.localeCompare(b))
      .map((client) => {
        const mine = tagged.filter((t) => t.list.includes(client));
        const sponsors = [];
        for (const t of mine) {
          const b = byKey.get(t.key);
          for (const id of [b.house_sponsor_id, b.senate_sponsor_id]) if (id && !sponsors.includes(id)) sponsors.push(id);
        }
        return {
          client,
          general: general.has(client),
          added_by: addedBy.get(client) || '',
          bills: mine.length,
          watched: mine.filter((t) => t.watch).length,
          hearings: mine.filter((t) => heard.has(t.key)).length,
          bill_list: mine.map((t) => byKey.get(t.key).bill_numbers).join(', '),
          sponsor_ids: sponsors.join(';'),
        };
      });
  },
});

dash.calc('activity', {
  inputs: ['bills', 'legislators', 'outreach', 'bill_clients', 'hearings'],
  title: 'Recent activity',
  description: 'One timeline across the tracker: bills filed, outreach the team logged, bills added to the CPS watch list or tagged to a client, and hearings the team set. Newest first.',
  fn: (bills, legislators, outreach, bill_clients, hearings) => {
    const byKey = new Map(bills.map((b) => [b.key, b]));
    const people = new Map(legislators.map((r) => [r.id, r]));
    const who = (id) => { const p = people.get(id) || {}; return p.name ? `${p.title || ''} ${p.name}`.trim() : ''; };
    const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const day = (d) => { const m = String(d || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${MON[Number(m[2]) - 1]} ${Number(m[3])}` : String(d || ''); };
    const out = [];
    for (const b of bills) {
      const id = b.house_sponsor_id || b.senate_sponsor_id;
      out.push({ at: String(b.filed_date || ''), kind: 'Filed', member_id: id || '', bill_key: b.key,
        headline: `${who(id) || 'A lawmaker'} filed ${b.house_bill || b.senate_bill}`, detail: b.title || '' });
    }
    for (const r of outreach) {
      if (!r.member_id) continue;
      out.push({ at: String(r.logged_at || r.date || ''), kind: 'Outreach', member_id: r.member_id, bill_key: '',
        headline: `${r.by || 'CPS'} reached ${who(r.member_id) || r.member_id}`, detail: [r.result, r.topic ? `on ${r.topic}` : ''].filter(Boolean).join(' ') });
    }
    for (const r of bill_clients) {
      const b = byKey.get(r.id);
      if (!b || !r.updated_at) continue;
      const tags = String(r.clients || '').split(';').map((s) => s.trim()).filter(Boolean);
      const watch = r.watch === true || r.watch === 'true';
      if (!tags.length) continue;
      const who = r.updated_by || r.added_by || '';
      out.push({ at: String(r.updated_at), kind: 'Tagged', member_id: '', bill_key: r.id, who,
        headline: who ? `${who} tagged ${b.bill_numbers} for ${tags.join(', ')}` : `${b.bill_numbers} tagged ${tags.join(', ')}`, detail: b.title || '' });
    }
    for (const h of hearings) {
      const b = byKey.get(h.id);
      if (!b || !(h.committee || h.date) || !h.updated_at) continue;
      const who = h.updated_by || h.added_by || '';
      out.push({ at: String(h.updated_at), kind: 'Hearing', member_id: '', bill_key: h.id, who,
        headline: who ? `${who} set a hearing for ${b.bill_numbers}` : `${b.bill_numbers} hearing set`, detail: [h.committee, h.date ? `on ${day(h.date)}` : ''].filter(Boolean).join(' ') });
    }
    return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 40);
  },
});
