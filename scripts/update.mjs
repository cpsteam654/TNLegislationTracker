// CPS Legislation Tracker: scheduled bill update.
//
// GitHub Actions runs this at 9am, noon and 5pm Central. It pulls Tennessee
// bills from LegiScan, keeps the team's hand-written short titles, topics and
// notes, pairs House and Senate companions, picks up hearings from the
// committee calendar, writes the files the site reads (site/data), and lists
// the important changes for the alert email.
//
// Needs the LEGISCAN_API_KEY secret. SUPABASE_URL and SUPABASE_SECRET_KEY are
// optional: with them, alerts also cover bills the team has tagged.
// TEAMS_WEBHOOK_URL (optional) is where the alert card gets posted.
// Plain Node 20, no packages to install.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'site', 'data');
const CACHE = path.join(ROOT, 'cache', 'legiscan.json');
const KEY = process.env.LEGISCAN_API_KEY || '';
const BASE = process.env.LEGISCAN_BASE || 'https://api.legiscan.com/';
const YEAR = Number(process.env.SESSION_YEAR || 2027);
const GA = 115 + Math.floor((YEAR - 2027) / 2);
const MAX_BILL_CALLS = Number(process.env.MAX_BILL_CALLS || 300);
const WATCH = ['Health care', 'AI & technology', 'PBMs & pharmacy', 'Recycling & waste'];
const STAGES = ['Filed', 'In committee', 'Passed one chamber', 'Passed both chambers', 'Signed into law'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

let queries = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJson = (p, fallback) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; } };
const writeJson = (p, obj) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(obj, null, 1) + '\n'); };
const todayCentral = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
const day = (d) => { const m = String(d || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${MON[Number(m[2]) - 1]} ${Number(m[3])}` : ''; };
const time12 = (t) => { const m = String(t || '').match(/^(\d{1,2}):(\d{2})/); if (!m) return ''; const h = Number(m[1]); return `${((h + 11) % 12) + 1}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`; };

// ---------- LegiScan ----------
async function api(op, params = {}) {
  const u = new URL(BASE);
  u.searchParams.set('key', KEY);
  u.searchParams.set('op', op);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  for (let attempt = 1; ; attempt += 1) {
    try {
      const r = await fetch(u);
      if (!r.ok) throw new Error(`LegiScan ${op} answered ${r.status}`);
      const j = await r.json();
      queries += 1;
      if (j.status !== 'OK') throw new Error(`LegiScan ${op}: ${JSON.stringify(j.alert || j).slice(0, 200)}`);
      return j;
    } catch (err) {
      if (attempt >= 3) throw err;
      await sleep(1500 * attempt);
    }
  }
}

function slim(b) {
  const hist = [...(b.history || [])].sort((x, y) => String(x.date).localeCompare(String(y.date)));
  const last = hist[hist.length - 1] || {};
  const texts = b.texts || [];
  return {
    bill_id: b.bill_id,
    change_hash: b.change_hash,
    number: String(b.bill_number || '').toUpperCase(),
    title: b.title || '',
    description: b.description || '',
    subjects: (b.subjects || []).map((s) => s.subject_name).filter(Boolean),
    status: Number(b.status) || 0,
    introduced: (hist[0] || {}).date || b.status_date || '',
    last_action: last.action || '',
    last_action_date: last.date || b.status_date || '',
    in_committee: hist.some((h) => /assigned to|ref(\.|erred)? to|placed on .*calendar|recommended|subcommittee/i.test(h.action || '')),
    signed: hist.some((h) => /signed by (the )?governor|pub\.? ?ch\.|public chapter/i.test(h.action || '')),
    committee: (b.committee && b.committee.name) || '',
    sponsors: (b.sponsors || []).map((s) => ({ name: s.name || '', party: s.party || '', district: s.district || '', type: Number(s.sponsor_type_id), order: Number(s.sponsor_order) || 99 })),
    same_as: String(((b.sasts || []).find((x) => /same as/i.test(x.type || '')) || {}).sast_bill_number || '').toUpperCase(),
    hearings: (b.calendar || []).filter((c) => /hearing/i.test(c.type || '')).map((c) => ({ date: c.date || '', time: c.time || '', room: c.location || '', committee: String(c.description || '').replace(/^hearing\s*/i, '') })),
    text_url: (texts[texts.length - 1] || {}).state_link || '',
    fiscal_url: ((b.supplements || []).find((s) => /fiscal/i.test(s.type || '')) || {}).state_link || '',
  };
}

async function fromDataset(sessionId) {
  const { datasetlist } = await api('getDatasetList', { state: 'TN' });
  const ds = (datasetlist || []).find((d) => d.session_id === sessionId);
  if (!ds) return [];
  const { dataset } = await api('getDataset', { id: ds.session_id, access_key: ds.access_key });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'legiscan-'));
  const zip = path.join(dir, 'dataset.zip');
  fs.writeFileSync(zip, Buffer.from(dataset.zip, 'base64'));
  execFileSync('unzip', ['-q', '-o', zip, '-d', dir]);
  const out = [];
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\/bill\/[^/]+\.json$/.test(p)) { const j = readJson(p, null); if (j && j.bill) out.push(j.bill); }
  });
  walk(dir);
  return out;
}

// ---------- topics for new bills (hand-set topics on existing bills are kept) ----------
const TOPIC_RULES = [
  ['PBMs & pharmacy', /pharmacy benefit|\bpbms?\b|pharmac|prescription drug|drug pric/i],
  ['Health care', /health|medical|hospital|physician|nurs(e|ing)|medicaid|tenncare|patient|abortion|mental|dental|insurance.{0,30}(coverage|benefit)/i],
  ['AI & technology', /artificial intelligence|\bai\b|algorithm|deepfake|data privacy|personal data|cyber|technolog|internet|social media|broadband|software|digital/i],
  ['Recycling & waste', /recycl|solid waste|landfill|plastic|packaging|litter|trash|garbage|\bwaste\b/i],
  ['Ceremonial', /designat\w* .{0,60}(day|week|month)|honoring|commemorat|memorial (highway|bridge)/i],
  ['Taxes & revenue', /\btax|revenue|franchise|excise|tariff/i],
  ['Cost of living', /grocer|utilit|housing|rent\b|afford|price|cost of/i],
  ['Criminal justice', /criminal|crime|offense|felon|misdemeanor|sentenc|prison|parole|police|law enforcement/i],
  ['Courts & liability', /court|liabilit|damages|civil action|tort|judge|lawsuit/i],
  ['Education', /school|education|teacher|student|universit|college/i],
  ['Elections', /election|voter|ballot|campaign finance/i],
  ['Environment', /environment|water quality|air quality|conservation|wildlife|emission|pollut/i],
  ['Transportation & licensing', /vehicle|driver|license plate|highway|road|transportation|motor|traffic/i],
  ['Alcohol & tobacco', /alcohol|beer|wine|liquor|tobacco|vapor|nicotine|hemp|cannabis|marijuana/i],
  ['Agriculture', /agricultur|farm|livestock|crop/i],
  ['Immigration', /immigra|\balien/i],
  ['Business & labor', /employ|labor|wage|business|commerce|contractor/i],
];
function classify(text) {
  const hits = TOPIC_RULES.filter(([, re]) => re.test(text)).map(([t]) => t);
  const topics = [...hits.filter((t) => WATCH.includes(t)), ...hits.filter((t) => !WATCH.includes(t))].slice(0, 2);
  return topics.length ? topics : ['Government operations'];
}

// ---------- shaping a row for the site ----------
const keyOf = (num) => { const m = String(num).match(/^(HB|SB)0*(\d+)$/i); return m ? `${m[1].toUpperCase()}${m[2].padStart(4, '0')}` : String(num); };
const pretty = (num) => { const m = String(num).match(/^(HB|SB)0*(\d+)$/i); return m ? `${m[1].toUpperCase()} ${Number(m[2])}` : String(num); };
const stageOf = (x) => (!x ? -1 : x.signed || x.status === 4 ? 4 : x.status === 3 ? 3 : x.status === 2 ? 2 : x.in_committee ? 1 : 0);
function shortTitle(x) {
  let s = String(x.description || x.title || '').replace(/^as (introduced|enacted|amended),?\s*/i, '').trim();
  s = s.charAt(0).toUpperCase() + s.slice(1);
  s = s.split(/(?<=[a-z0-9)])\.\s|;\s/)[0];
  if (s.length > 96) s = s.slice(0, 96).replace(/\s+\S*$/, '') + '…';
  return s || pretty(x.number);
}
function primeOf(x) {
  if (!x) return null;
  const sorted = [...x.sponsors].sort((a, b) => (a.type === 1 ? 0 : 1) - (b.type === 1 ? 0 : 1) || a.order - b.order);
  return sorted[0] || null;
}

function main() {
  return run().catch((err) => {
    console.error(err.message || err);
    const prev = readJson(path.join(DATA, 'refresh.json'), { rows: [{}] }).rows[0] || {};
    writeJson(path.join(DATA, 'refresh.json'), { rows: [{ ...prev, id: 'latest', status: 'error', message: 'The last update could not reach LegiScan', last_run: new Date().toISOString() }] });
    process.exitCode = 1;
  });
}

async function run() {
  const legs = readJson(path.join(DATA, 'legislators.json'), { rows: [] }).rows;
  const prevFile = readJson(path.join(DATA, 'bills.json'), { rows: [] });
  const prevRows = prevFile.rows || [];
  const prevByKey = new Map(prevRows.map((r) => [r.key, r]));
  const prevRefresh = readJson(path.join(DATA, 'refresh.json'), { rows: [{}] }).rows[0] || {};
  const cache = readJson(CACHE, { session_id: null, bills: {} });

  if (!KEY) {
    writeJson(path.join(DATA, 'refresh.json'), { rows: [{ ...prevRefresh, id: 'latest', status: 'waiting', message: 'Waiting for the LegiScan key', last_run: new Date().toISOString() }] });
    console.log('No LEGISCAN_API_KEY yet, so the bill list was left as it is.');
    return;
  }

  // the 2027–2028 regular session (the 115th General Assembly)
  const { sessions } = await api('getSessionList', { state: 'TN' });
  const session = (sessions || []).find((s) => Number(s.year_start) === YEAR && !Number(s.special));
  if (!session) {
    writeJson(path.join(DATA, 'refresh.json'), { rows: [{ ...prevRefresh, id: 'latest', status: 'waiting', message: `LegiScan hasn't opened the ${YEAR} session yet`, last_run: new Date().toISOString() }] });
    console.log(`LegiScan has no ${YEAR} Tennessee session yet; nothing changed.`);
    return;
  }
  if (cache.session_id !== session.session_id) { cache.session_id = session.session_id; cache.bills = {}; }

  // what changed since the last run
  const ml = (await api('getMasterListRaw', { id: session.session_id })).masterlist || {};
  const entries = Object.values(ml).filter((x) => x && x.bill_id && /^(HB|SB)\d+$/i.test(String(x.number)));
  let changed = entries.filter((x) => !cache.bills[x.bill_id] || cache.bills[x.bill_id].change_hash !== x.change_hash);
  console.log(`${entries.length} bills in the session, ${changed.length} new or changed.`);

  if (changed.length > MAX_BILL_CALLS) {
    console.log('Large change: loading the full session dataset.');
    for (const b of await fromDataset(session.session_id)) cache.bills[b.bill_id] = slim(b);
    changed = entries.filter((x) => !cache.bills[x.bill_id] || cache.bills[x.bill_id].change_hash !== x.change_hash);
  }
  for (const x of changed.slice(0, MAX_BILL_CALLS)) {
    const { bill } = await api('getBill', { id: x.bill_id });
    cache.bills[x.bill_id] = slim(bill);
  }
  const live = new Set(entries.map((x) => x.bill_id));
  for (const id of Object.keys(cache.bills)) if (!live.has(Number(id)) && !live.has(id)) delete cache.bills[id];
  writeJson(CACHE, cache);

  // pair House bills with their Senate companions
  const byNum = new Map(Object.values(cache.bills).map((b) => [b.number, b]));
  const paired = new Set();
  const groups = [];
  for (const b of Object.values(cache.bills).filter((x) => x.number.startsWith('HB'))) {
    const prev = prevByKey.get(keyOf(b.number)) || {};
    const prevSenate = prev.senate_bill ? prev.senate_bill.replace(/\s+/g, '') : '';
    const sb = byNum.get(b.same_as) || byNum.get(prevSenate) || null;
    if (sb && sb.number.startsWith('SB') && !paired.has(sb.number)) paired.add(sb.number);
    groups.push([b, sb && sb.number.startsWith('SB') ? sb : null]);
  }
  for (const b of Object.values(cache.bills).filter((x) => x.number.startsWith('SB') && !paired.has(x.number))) groups.push([null, b]);

  const leg = (sp) => {
    if (!sp) return null;
    const m = String(sp.district).match(/^(HD|SD)-?0*(\d+)/i);
    const id = m ? `${m[1].toUpperCase() === 'HD' ? 'H' : 'S'}${Number(m[2])}` : '';
    return legs.find((l) => l.id === id) || legs.find((l) => l.name.toLowerCase() === String(sp.name).toLowerCase()) || { id, name: sp.name, party: sp.party };
  };
  const today = todayCentral();

  const rows = groups.map(([hb, sb]) => {
    const main = hb || sb;
    const key = keyOf(main.number);
    const prev = prevByKey.get(key) || {};
    const hp = leg(primeOf(hb));
    const sp = leg(primeOf(sb));
    const cos = hb ? hb.sponsors.filter((s) => s !== primeOf(hb) && s.type !== 1).map(leg).filter(Boolean) : [];
    const parties = new Set([hp && hp.party, sp && sp.party].filter(Boolean));
    const text = [main.title, main.description, ...(main.subjects || [])].join(' ');
    const topics = prev.topics ? prev.topics.split(';').map((t) => t.trim()).filter(Boolean) : classify(text);
    const stageN = Math.max(stageOf(hb), stageOf(sb), 0);
    const lastOf = [hb, sb].filter(Boolean).sort((a, b) => String(b.last_action_date).localeCompare(String(a.last_action_date)))[0];
    const next = [...(hb ? hb.hearings : []), ...(sb ? sb.hearings : [])].filter((h) => h.date >= today).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0];
    const caption = /^an act/i.test(main.title) ? main.title : prev.caption || '';
    return {
      key,
      house_bill: hb ? pretty(hb.number) : '',
      senate_bill: sb ? pretty(sb.number) : '',
      bill_numbers: [hb && pretty(hb.number), sb && pretty(sb.number)].filter(Boolean).join(' / '),
      title: prev.title || shortTitle(main),
      subject: (main.subjects || [])[0] || prev.subject || '',
      summary: main.description || prev.summary || '',
      caption,
      topics: topics.join('; '),
      primary_topic: topics[0],
      cps_focus: topics.filter((t) => WATCH.includes(t)).join('; '),
      cps_note: prev.cps_note || '',
      house_sponsor: hp ? hp.name : '',
      house_sponsor_id: hp ? hp.id : '',
      house_party: hp ? hp.party : '',
      house_cosponsors: cos.map((c) => c.name).join('; '),
      house_cosponsor_ids: cos.map((c) => c.id).filter(Boolean).join('; '),
      senate_sponsor: sp ? sp.name : '',
      senate_sponsor_id: sp ? sp.id : '',
      senate_party: sp ? sp.party : '',
      sponsor_party: parties.size > 1 ? 'Bipartisan' : parties.has('D') ? 'Democrat' : 'Republican',
      companion: hb && sb ? 'Companion filed' : hb ? 'No Senate companion yet' : 'No House companion yet',
      status: lastOf.last_action || 'Filed for introduction',
      stage: STAGES[stageN],
      filed_date: [hb, sb].filter(Boolean).map((x) => x.introduced).filter(Boolean).sort()[0] || prev.filed_date || '',
      last_action: lastOf.last_action || '',
      last_action_date: lastOf.last_action_date || '',
      fiscal_note: (hb && hb.fiscal_url) || (sb && sb.fiscal_url) ? 'Posted on the TGA bill page' : prev.fiscal_note || 'Not yet available',
      house_url: hb ? `https://wapp.capitol.tn.gov/apps/BillInfo/Default?BillNumber=${keyOf(hb.number)}&ga=${GA}` : '',
      senate_url: sb ? `https://wapp.capitol.tn.gov/apps/BillInfo/Default?BillNumber=${keyOf(sb.number)}&ga=${GA}` : '',
      bill_text_url: main.text_url || `https://capitol.tn.gov/Bills/${GA}/Bill/${key}.pdf`,
      hearing_committee: next ? next.committee : '',
      hearing_date: next ? next.date : '',
      hearing_time: next ? next.time : '',
      hearing_room: next ? next.room : '',
    };
  }).sort((a, b) => String(b.filed_date).localeCompare(String(a.filed_date)) || a.key.localeCompare(b.key));

  const out = rows.length ? rows : prevRows;
  const newKeys = out.filter((r) => !prevByKey.has(r.key)).map((r) => r.key);
  const updated = out.filter((r) => { const p = prevByKey.get(r.key); return p && (p.last_action_date !== r.last_action_date || p.stage !== r.stage || p.hearing_date !== r.hearing_date); });

  writeJson(path.join(DATA, 'bills.json'), {
    rows: out,
    meta: [
      { label: 'Source', value: `LegiScan (CC BY 4.0), ${session.session_name || session.session_title || 'Tennessee General Assembly'}` },
      { label: 'Updated', value: new Date().toISOString() },
    ],
  });
  writeJson(path.join(DATA, 'refresh.json'), { rows: [{
    id: 'latest', status: 'ok',
    message: `${newKeys.length} new and ${updated.length} updated bills`,
    last_success: new Date().toISOString(), last_run: new Date().toISOString(),
    new_bills: newKeys.length, updated_bills: updated.length, queries,
  }] });
  console.log(`Saved ${out.length} bills: ${newKeys.length} new, ${updated.length} updated, ${queries} LegiScan queries.`);

  await alerts(out, prevByKey, newKeys);
}

// ---------- important finds for the email ----------
async function teamTags() {
  const url = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SECRET_KEY || '';
  if (!url || !key) return new Map();
  const headers = { apikey: key };
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
  try {
    const r = await fetch(`${url}/rest/v1/team_docs?coll=eq.bill_clients&select=id,data`, { headers });
    if (!r.ok) throw new Error(`Supabase answered ${r.status}`);
    const rows = await r.json();
    return new Map(rows.map((x) => [x.id, String((x.data || {}).clients || '').split(';').map((s) => s.trim()).filter(Boolean)]).filter(([, c]) => c.length));
  } catch (err) {
    console.log('Could not read the team’s client tags:', err.message);
    return new Map();
  }
}

async function alerts(rows, prevByKey, newKeys) {
  const tags = await teamTags();
  const lines = [];
  for (const r of rows.filter((x) => newKeys.includes(x.key) && x.cps_focus)) {
    lines.push(`New bill on ${r.cps_focus.replace(/; /g, ' and ')}: ${r.bill_numbers}, ${r.title}`);
  }
  for (const r of rows) {
    const clients = tags.get(r.key);
    const p = prevByKey.get(r.key);
    if (!clients || !p) continue;
    const who = clients.join(', ');
    if (p.stage !== r.stage) lines.push(`${r.bill_numbers} (${who}) moved to ${r.stage.toLowerCase()}: ${r.last_action}`);
    if (r.hearing_date && (p.hearing_date !== r.hearing_date || p.hearing_time !== r.hearing_time)) {
      lines.push(`${r.bill_numbers} (${who}) is on the calendar: ${[r.hearing_committee, `${day(r.hearing_date)}${r.hearing_time ? ' at ' + time12(r.hearing_time) : ''}`, r.hearing_room].filter(Boolean).join(', ')}`);
    }
  }
  const outFile = process.env.GITHUB_OUTPUT;
  if (!lines.length) { if (outFile) fs.appendFileSync(outFile, 'alert=false\n'); console.log('Nothing important to report.'); return; }
  const repo = process.env.GITHUB_REPOSITORY || '';
  const site = process.env.SITE_URL || (repo ? `https://${repo.split('/')[0].toLowerCase()}.github.io/${repo.split('/')[1]}/` : '');
  const title = `Legislation Tracker: ${lines.length} important update${lines.length === 1 ? '' : 's'}`;
  const body = [title, '', ...lines.map((l) => `- ${l}`), '', site ? `Open the tracker: ${site}` : '', 'Bill data from LegiScan (CC BY 4.0).'].join('\n');
  fs.writeFileSync(path.join(ROOT, 'alert.txt'), body);
  if (outFile) fs.appendFileSync(outFile, `alert=true\nsubject=${title}\n`);
  console.log(body);
  await postToTeams(title, lines, site);
}

// The Teams channel's "Post to a channel when a webhook request is received" workflow
// expects one or more Adaptive Cards in an attachments list.
async function postToTeams(title, lines, site) {
  const url = process.env.TEAMS_WEBHOOK_URL || '';
  if (!url) { console.log('No TEAMS_WEBHOOK_URL, so no Teams post.'); return; }
  const card = {
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    type: 'AdaptiveCard',
    version: '1.2',
    body: [
      { type: 'TextBlock', text: title, weight: 'Bolder', size: 'Medium', wrap: true },
      ...lines.map((l) => ({ type: 'TextBlock', text: `- ${l}`, wrap: true, spacing: 'Small' })),
      { type: 'TextBlock', text: 'Bill data from LegiScan (CC BY 4.0)', isSubtle: true, size: 'Small', wrap: true, spacing: 'Medium' },
    ],
    actions: site ? [{ type: 'Action.OpenUrl', title: 'Open the tracker', url: site }] : [],
  };
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'message', attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', contentUrl: null, content: card }] }),
    });
    if (!r.ok) throw new Error(`Teams answered ${r.status}`);
    console.log('Posted the alert to Teams.');
  } catch (err) {
    console.log('Could not post to Teams:', err.message);
  }
}

main();
