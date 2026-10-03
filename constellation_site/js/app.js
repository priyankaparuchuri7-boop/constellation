/* Constellation: multiple habits, a mood with every check-in, and analytics. Data stays in this browser. */
(function () {
'use strict';
var KEY = 'constellation.habits.v1', OLD_KEY = 'constellation.v2', DAY = 864e5;
var MOODS = [{v: 1, e: '😞', l: 'Awful'}, {v: 2, e: '😕', l: 'Low'}, {v: 3, e: '😐', l: 'Okay'}, {v: 4, e: '🙂', l: 'Good'}, {v: 5, e: '😄', l: 'Great'}];
var $ = function (s, r) { return (r || document).querySelector(s); };
var pad = function (n) { return String(n).padStart(2, '0'); };
var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]; }); };
var state = {tab: 'today', logging: null, removing: null, filter: 'all', confirmReset: false, flash: '', justLogged: null, storageOK: true};

/* ---------- dates ---------- */
function keyOf(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function utc(k) { var a = k.split('-').map(Number); return Date.UTC(a[0], a[1] - 1, a[2]); }
function addDays(k, n) { var t = new Date(utc(k) + n * DAY); return t.getUTCFullYear() + '-' + pad(t.getUTCMonth() + 1) + '-' + pad(t.getUTCDate()); }
function dayDiff(a, b) { return Math.round((utc(a) - utc(b)) / DAY); }
function today() { return keyOf(new Date()); }
function hhmm(d) { return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
function weekday(k) { return (new Date(utc(k)).getUTCDay() + 6) % 7; } /* Monday = 0 */
function nice(k) { return new Date(utc(k)).toLocaleDateString(undefined, {weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC'}); }

/* ---------- storage ---------- */
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function fresh() { return {habits: [], logs: []}; }
function migrate() {
  /* Carry over the single habit from the earlier study version, if there is one. */
  try {
    var r = localStorage.getItem(OLD_KEY); if (!r) return null;
    var o = JSON.parse(r); if (!o || !o.profile || !o.profile.habit) return null;
    var h = {id: uid(), name: o.profile.habit, created: o.profile.startDate || today()}, logs = [];
    Object.keys(o.checkins || {}).forEach(function (d) {
      var c = o.checkins[d]; logs.push({id: uid(), habitId: h.id, date: d, time: c.time || '', mood: 0, note: ''});
    });
    return {habits: [h], logs: logs};
  } catch (e) { return null; }
}
function load() {
  try {
    var r = localStorage.getItem(KEY);
    if (r) { var o = JSON.parse(r); return {habits: o.habits || [], logs: o.logs || []}; }
    return migrate() || fresh();
  } catch (e) { state.storageOK = false; return fresh(); }
}
var S = load();
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { state.storageOK = false; } }
/* Check that this browser really keeps data, and ask it not to evict ours. */
(function () {
  try { localStorage.setItem('__probe', '1'); if (localStorage.getItem('__probe') !== '1') throw new Error('x'); localStorage.removeItem('__probe'); }
  catch (e) { state.storageOK = false; }
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
})();

/* ---------- data helpers ---------- */
function habitById(id) { return S.habits.filter(function (h) { return h.id === id; })[0]; }
function logOf(id, date) { return S.logs.filter(function (l) { return l.habitId === id && l.date === date; })[0]; }
function logsFor(id) { return S.logs.filter(function (l) { return l.habitId === id; }); }
function scoped(filter) { return filter === 'all' ? S.logs : logsFor(filter); }
function mean(a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : null; }
function moodsOf(logs) { return logs.filter(function (l) { return l.mood > 0; }).map(function (l) { return l.mood; }); }
function f1(x) { return x == null ? 'n/a' : x.toFixed(1); }
function isDone(l) { return l.done !== false; }
function doneOnly(a) { return a.filter(isDone); }
function hashStr(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { var a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function moodFace(v) { var m = MOODS[Math.round(v) - 1]; return m ? m.e : ''; }

function streaks(id) {
  var set = {}; doneOnly(logsFor(id)).forEach(function (l) { set[l.date] = 1; });
  var dates = Object.keys(set).sort(), best = 0, run = 0, prev = null;
  dates.forEach(function (d) { run = (prev && dayDiff(d, prev) === 1) ? run + 1 : 1; best = Math.max(best, run); prev = d; });
  var t = today(), d = set[t] ? t : addDays(t, -1), cur = 0;
  while (set[d]) { cur++; d = addDays(d, -1); }
  return {cur: cur, best: best};
}
function rate30(h) {
  var t = today(), span = Math.min(30, Math.max(1, dayDiff(t, h.created) + 1)), from = addDays(t, -(span - 1));
  var n = doneOnly(logsFor(h.id)).filter(function (l) { return l.date >= from && l.date <= t; }).length;
  return Math.round(100 * Math.min(1, n / span));
}

/* ---------- shell ---------- */
function shell(body) {
  var tabs = [['today', 'Today'], ['sky', 'Constellation'], ['analytics', 'Analytics']].map(function (t) {
    return '<button class="tab" role="tab" data-act="tab" data-tab="' + t[0] + '" aria-selected="' + (state.tab === t[0]) + '">' + t[1] + '</button>';
  }).join('');
  return '<div class="bar"><div class="bar-in"><span class="brand">Constellation</span><span class="status">' + esc(nice(today())) + '</span></div>' +
    '<nav class="tabs" role="tablist" aria-label="Sections">' + tabs + '</nav></div>' +
    '<main class="app" id="main" tabindex="-1">' + (state.storageOK ? '' : '<div class="banner" role="alert"><b>Your entries are not being saved.</b> This browser is blocking storage, which usually means a private or incognito window, or a setting that clears site data. Open the site in a normal window, then add your habits again. Until then, use Download backup in Analytics.</div>') + body + '</main>' +
    '<footer class="foot">' + (state.storageOK ? 'Everything stays in this browser on this device. Use Export or Backup in Analytics to keep a copy.' : 'This browser is blocking storage, so entries will be lost when you close the page. Download a backup from Analytics before leaving.') + '</footer>';
}
function render(keepScroll) {
  var y = window.scrollY;
  $('#app').innerHTML = shell(state.tab === 'today' ? viewToday() : state.tab === 'sky' ? viewSky() : viewAnalytics());
  if (keepScroll) window.scrollTo(0, y);
}

/* ---------- today ---------- */
function addForm() {
  var ideas = ['Exercise', 'Read', 'Drink water', 'Meditate', 'Sleep by 11'].filter(function (i) { return !S.habits.some(function (h) { return h.name.toLowerCase() === i.toLowerCase(); }); });
  return '<form class="panel" data-form="addhabit"><h3>Add a habit</h3>' +
    '<label class="f">Habit name<input type="text" id="hb-name" autocomplete="off" maxlength="60" placeholder="Walk for 20 minutes"></label>' +
    (ideas.length ? '<div class="chips" aria-label="Ideas">' + ideas.map(function (i) { return '<button type="button" class="chip" data-act="idea" data-h="' + esc(i) + '">' + esc(i) + '</button>'; }).join('') + '</div>' : '') +
    '<div class="err" id="hb-err" role="alert"></div><button class="btn primary" type="submit">Add habit</button></form>';
}
function logForm(h, existing) {
  var picks = MOODS.map(function (m) {
    return '<label class="mood"><input type="radio" name="mood" value="' + m.v + '"' + (existing && existing.mood === m.v ? ' checked' : '') + '><span><b>' + m.e + '</b>' + m.l + '</span></label>';
  }).join('');
  var wasDone = !existing || isDone(existing);
  return '<form class="logform" data-form="log" data-id="' + h.id + '" style="display:flex;flex-direction:column;gap:12px">' +
    '<fieldset><legend>Did you do it today?</legend><div class="pick">' +
    '<label class="mood"><input type="radio" name="done" value="1"' + (wasDone ? ' checked' : '') + '><span><b>⭐</b>Done</span></label>' +
    '<label class="mood"><input type="radio" name="done" value="0"' + (wasDone ? '' : ' checked') + '><span><b>🌑</b>Not today</span></label></div></fieldset>' +
    '<fieldset><legend>How do you feel right now?</legend><div class="moods">' + picks + '</div></fieldset>' +
    '<label class="f">Note (optional)<textarea name="note" maxlength="500" placeholder="What was it like?">' + esc(existing ? existing.note : '') + '</textarea></label>' +
    '<div class="err" role="alert"></div><div class="row"><button class="btn primary" type="submit">' + (existing ? 'Save changes' : 'Save check-in') + '</button><button class="btn link" type="button" data-act="cancel">Cancel</button></div></form>';
}
function habitCard(h) {
  var t = today(), rec = logOf(h.id, t), st = streaks(h.id), body;
  if (state.logging === h.id) body = logForm(h, rec);
  else if (rec) {
    body = '<div class="logged"><span class="face' + (state.justLogged === h.id ? ' pop' : '') + '">' + (rec.mood ? moodFace(rec.mood) : (isDone(rec) ? '✓' : '–')) + '</span><div><p>' + (isDone(rec) ? 'Done' : 'Not done') + ' · logged at ' + esc(rec.time) + (rec.mood ? ' · feeling ' + esc(MOODS[rec.mood - 1].l.toLowerCase()) : '') + '</p>' + (rec.note ? '<p>' + esc(rec.note) + '</p>' : '') + '</div></div>' +
      '<div class="row"><button class="btn" data-act="edit" data-id="' + h.id + '">Edit</button><button class="btn link" data-act="undo" data-id="' + h.id + '">Undo</button></div>';
  } else body = '<button class="btn primary" data-act="start" data-id="' + h.id + '">Log it</button>';
  var rm = state.removing === h.id
    ? '<div class="row"><span class="note">Delete this habit and all its history?</span><button class="btn danger" data-act="rmgo" data-id="' + h.id + '">Delete</button><button class="btn" data-act="rmno">Keep</button></div>'
    : '<div class="row"><button class="btn link" data-act="rmask" data-id="' + h.id + '">Remove habit</button></div>';
  return '<section class="habit' + (rec && isDone(rec) ? ' done' : '') + (rec && !isDone(rec) ? ' skipped' : '') + '"><div class="row spread"><h3 class="name">' + esc(h.name) + '</h3><span class="streak">' + st.cur + (st.cur === 1 ? ' day' : ' days') + ' in a row</span></div>' + body + (state.logging === h.id ? '' : rm) + '</section>';
}
function viewToday() {
  var h = '';
  if (state.flash) { h += '<p class="ok" role="status">' + esc(state.flash) + '</p>'; state.flash = ''; }
  if (!S.habits.length) {
    return h + '<section class="sect"><h2>What habits do you want to build?</h2><p class="lede">Add as many as you like. Each time you log one, you also record how you feel, so you can see later which habits lift your mood.</p></section>' + addForm();
  }
  var t = today(), doneCount = S.habits.filter(function (x) { var r = logOf(x.id, t); return r && isDone(r); }).length;
  h += '<section class="sect"><h2>' + (doneCount === S.habits.length ? 'All done for today.' : doneCount + ' of ' + S.habits.length + ' done today') + '</h2></section>';
  h += S.habits.map(habitCard).join('');
  return h + addForm();
}

/* ---------- analytics ---------- */
function heatmap(filter) {
  var t = today(), weeks = 12, cell = 18, gap = 4, left = 26, top = 4;
  var start = addDays(addDays(t, -weekday(t)), -(weeks - 1) * 7), n = S.habits.length || 1;
  var byDay = {}; scoped(filter).forEach(function (l) { (byDay[l.date] = byDay[l.date] || []).push(l); });
  var out = '', w = left + weeks * (cell + gap), hgt = top + 7 * (cell + gap);
  ['M', 'T', 'W', 'T', 'F', 'S', 'S'].forEach(function (d, i) { out += '<text x="0" y="' + (top + i * (cell + gap) + 13) + '" font-size="10" fill="var(--ink-dim)">' + d + '</text>'; });
  for (var c = 0; c < weeks; c++) {
    for (var r = 0; r < 7; r++) {
      var date = addDays(start, c * 7 + r); if (date > t) continue;
      var all = byDay[date] || [], list = doneOnly(all), op = 0, tip = nice(date) + ': ', fill = 'var(--sky-2)';
      if (list.length) {
        fill = 'var(--star)';
        if (filter === 'all') { op = .3 + .7 * Math.min(1, list.length / n); tip += list.length + ' of ' + n + ' habits'; }
        else { var m = list[0].mood; op = m ? .3 + .7 * (m - 1) / 4 : .6; tip += 'done' + (m ? ', ' + MOODS[m - 1].l.toLowerCase() : ''); }
      } else if (all.length) { fill = 'var(--ember)'; op = .55; tip += 'not done'; }
      else { op = .55; tip += 'nothing logged'; }
      out += '<rect x="' + (left + c * (cell + gap)) + '" y="' + (top + r * (cell + gap)) + '" width="' + cell + '" height="' + cell + '" rx="4" fill="' + fill + '" opacity="' + op.toFixed(2) + '"><title>' + esc(tip) + '</title></rect>';
    }
  }
  return '<svg viewBox="0 0 ' + w + ' ' + hgt + '" role="img" aria-label="Check-ins over the last 12 weeks">' + out + '</svg>';
}
function moodTrend(filter) {
  var t = today(), days = 30, W = 600, H = 190, L = 34, R = 10, T = 10, B = 24;
  var by = {}; scoped(filter).forEach(function (l) { if (l.mood > 0) (by[l.date] = by[l.date] || []).push(l.mood); });
  var pts = [];
  for (var i = 0; i < days; i++) { var d = addDays(t, -(days - 1 - i)); if (by[d]) pts.push({i: i, v: mean(by[d]), d: d}); }
  if (!pts.length) return '';
  var x = function (i) { return L + (W - L - R) * i / (days - 1); }, y = function (v) { return T + (H - T - B) * (5 - v) / 4; }, out = '';
  MOODS.forEach(function (m) { out += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(m.v) + '" y2="' + y(m.v) + '" stroke="var(--sky-2)" stroke-width="1"/><text x="2" y="' + (y(m.v) + 5) + '" font-size="14">' + m.e + '</text>'; });
  out += '<text x="' + L + '" y="' + (H - 6) + '" font-size="10" fill="var(--ink-dim)">30 days ago</text><text x="' + (W - R) + '" y="' + (H - 6) + '" font-size="10" fill="var(--ink-dim)" text-anchor="end">today</text>';
  if (pts.length > 1) out += '<polyline fill="none" stroke="var(--thread)" stroke-width="1.6" points="' + pts.map(function (p) { return x(p.i).toFixed(1) + ',' + y(p.v).toFixed(1); }).join(' ') + '"/>';
  pts.forEach(function (p) { out += '<circle cx="' + x(p.i).toFixed(1) + '" cy="' + y(p.v).toFixed(1) + '" r="4" fill="var(--star)"><title>' + esc(nice(p.d)) + ': ' + p.v.toFixed(1) + ' / 5</title></circle>'; });
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Average mood per day over the last 30 days">' + out + '</svg>';
}
function insight() {
  var dm = moodsOf(doneOnly(S.logs)), sm = moodsOf(S.logs.filter(function (l) { return !isDone(l); }));
  if (dm.length >= 3 && sm.length >= 3 && mean(dm) - mean(sm) >= .3) return '<p class="insight">You feel better on days you do your habits (' + f1(mean(dm)) + ' / 5) than on days you skip them (' + f1(mean(sm)) + ' / 5).</p>';
  var rows = S.habits.map(function (h) { var m = moodsOf(doneOnly(logsFor(h.id))); return {name: h.name, avg: mean(m), n: m.length}; }).filter(function (r) { return r.n >= 3; });
  if (rows.length < 2) return '';
  rows.sort(function (a, b) { return b.avg - a.avg; });
  var hi = rows[0], lo = rows[rows.length - 1];
  if (hi.avg - lo.avg < .3) return '<p class="insight">You feel about the same after all your habits so far.</p>';
  return '<p class="insight">You tend to feel best after <b>' + esc(hi.name) + '</b> (' + f1(hi.avg) + ' / 5) and least good after <b>' + esc(lo.name) + '</b> (' + f1(lo.avg) + ' / 5).</p>';
}
function viewAnalytics() {
  if (!S.habits.length) return '<section class="sect"><h2>Analytics</h2></section><div class="empty">Add a habit on the Today tab and log it a few times. Your streaks and mood patterns appear here.</div>' + dataSection();
  if (state.filter !== 'all' && !habitById(state.filter)) state.filter = 'all';
  var f = state.filter, logs = scoped(f), t = today(), weekFrom = addDays(t, -6), h = '';
  var moods = moodsOf(logs.filter(function (l) { return l.date >= addDays(t, -29); }));
  var weekN = doneOnly(logs).filter(function (l) { return l.date >= weekFrom; }).length;
  var bestCur = Math.max.apply(null, S.habits.map(function (x) { return streaks(x.id).cur; }));
  h += '<section class="sect"><h2>Analytics</h2>' + filterChips(f) + '</section>';
  var single = f === 'all' ? null : streaks(f);
  h += '<dl class="tiles">' +
    '<div class="tile"><dt>Check-ins, 7 days</dt><dd>' + weekN + '</dd></div>' +
    '<div class="tile"><dt>' + (single ? 'Current streak' : 'Longest streak now') + '</dt><dd>' + (single ? single.cur : bestCur) + '</dd></div>' +
    (single ? '<div class="tile"><dt>Best streak</dt><dd>' + single.best + '</dd></div>' : '<div class="tile"><dt>Days done</dt><dd>' + doneOnly(logs).length + '</dd></div>') +
    '<div class="tile"><dt>Mood, 30 days</dt><dd>' + (moods.length ? moodFace(mean(moods)) + ' ' + f1(mean(moods)) : 'n/a') + '</dd></div></dl>';
  if (f === 'all') h += insight();
  h += '<section class="sect"><h3>Last 12 weeks</h3><div class="plate">' + heatmap(f) + '<p class="cap">' + (f === 'all' ? 'Gold: habits done (brighter = more of them). Orange: logged as not done.' : 'Gold: done (brighter = you felt better). Orange: logged as not done.') + '</p></div></section>';
  var trend = moodTrend(f);
  h += '<section class="sect"><h3>Mood over the last 30 days</h3>' + (trend ? '<div class="plate">' + trend + '</div>' : '<p class="note">Log a habit with a mood to see your trend.</p>') + '</section>';
  var all = moodsOf(logs);
  if (all.length) {
    var counts = MOODS.map(function (m) { return all.filter(function (v) { return v === m.v; }).length; }), mx = Math.max.apply(null, counts.concat([1]));
    h += '<section class="sect"><h3>How you feel when you log</h3><div class="bars">' + MOODS.map(function (m, i) {
      return '<div class="bar-row"><span>' + m.e + ' ' + m.l + '</span><i style="width:' + Math.round(100 * counts[i] / mx) + '%"></i><span class="mono">' + counts[i] + '</span></div>';
    }).join('') + '</div></section>';
  }
  h += '<section class="sect"><h3>By habit</h3><div class="tbl"><table><thead><tr><th>Habit</th><th class="num">Streak</th><th class="num">Best</th><th class="num">30 days</th><th class="num">Mood</th><th class="num">Done</th></tr></thead><tbody>' +
    S.habits.map(function (x) {
      var st = streaks(x.id), m = mean(moodsOf(logsFor(x.id)));
      return '<tr><td>' + esc(x.name) + '</td><td class="num">' + st.cur + '</td><td class="num">' + st.best + '</td><td class="num">' + rate30(x) + '%</td><td class="num">' + (m == null ? 'n/a' : moodFace(m) + ' ' + f1(m)) + '</td><td class="num">' + doneOnly(logsFor(x.id)).length + '</td></tr>';
    }).join('') + '</tbody></table></div></section>';
  var recent = logs.slice().sort(function (a, b) { return (b.date + b.time) < (a.date + a.time) ? -1 : 1; }).filter(function (l) { return l.note; }).slice(0, 5);
  if (recent.length) h += '<section class="sect"><h3>Recent notes</h3>' + recent.map(function (l) { var x = habitById(l.habitId); return '<div class="recent"><span class="meta">' + esc(nice(l.date)) + ' · ' + esc(x ? x.name : '') + (l.mood ? ' · ' + moodFace(l.mood) : '') + (isDone(l) ? '' : ' · not done') + '</span><p>' + esc(l.note) + '</p></div>'; }).join('') + '</section>';
  return h + dataSection();
}
/* ---------- constellation ---------- */
var SPARK = 'M0,-12 L2.4,-2.4 L12,0 L2.4,2.4 L0,12 L-2.4,2.4 L-12,0 L-2.4,-2.4Z';
function dayState(filter, date) {
  var rel = dayDiff(date, today());
  if (rel > 0) return {s: 'future'};
  var list = scoped(filter).filter(function (l) { return l.date === date; }), done = doneOnly(list), n = filter === 'all' ? Math.max(1, S.habits.length) : 1, m = mean(moodsOf(list));
  if (done.length) return {s: 'done', frac: Math.min(1, done.length / n), mood: m, count: done.length, n: n};
  if (list.length) return {s: 'skipped', mood: m};
  return {s: rel === 0 ? 'today' : 'none'};
}
function skySVG(filter) {
  var L = 28, W = 600, H = 420, t = today(), r = rng(hashStr(filter)), pts = [], p0 = r() * 6.28, amp = 70 + r() * 40, out = '', i, j;
  for (i = 0; i < L; i++) {
    var u = i / (L - 1), px = 44 + u * 512 + (r() - .5) * 28, py = 210 + Math.sin(u * 5.2 + p0) * amp + (r() - .5) * 60;
    pts.push([Math.round(px), Math.round(Math.max(46, Math.min(374, py)))]);
  }
  var bg = rng(777);
  for (i = 0; i < 90; i++) {
    var x = bg() * W, y = bg() * H, rad = .4 + bg() * 1, o = .2 + bg() * .5, tw = bg() < .3;
    out += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + rad.toFixed(2) + '" fill="var(--ink)" opacity="' + o.toFixed(2) + '"' + (tw ? ' class="tw" style="animation-delay:' + (bg() * 4).toFixed(1) + 's"' : '') + '/>';
  }
  var days = [];
  for (i = 0; i < L; i++) { var date = addDays(t, -(L - 1 - i)); days.push({date: date, st: dayState(filter, date)}); }
  for (i = 1; i < L; i++) {
    var a = days[i - 1].st, b = days[i].st; if (b.s === 'future') continue;
    var both = a.s === 'done' && b.s === 'done';
    out += '<line x1="' + pts[i - 1][0] + '" y1="' + pts[i - 1][1] + '" x2="' + pts[i][0] + '" y2="' + pts[i][1] + '" stroke="var(--thread)" stroke-width="' + (both ? 1.5 : 1.1) + '" ' + (both ? 'opacity=".9"' : 'stroke-dasharray="3 6" opacity=".4"') + '/>';
  }
  for (j = 0; j < L; j++) {
    var d = days[j], st = d.st, cx = pts[j][0], cy = pts[j][1], tip = nice(d.date) + ': ';
    if (st.s === 'future') { out += '<circle cx="' + cx + '" cy="' + cy + '" r="1.8" fill="var(--thread)" opacity=".28"/>'; continue; }
    if (st.s === 'done') {
      var rr = 2.4 + .7 * (st.mood || 3), big = weekday(d.date) === 6;
      tip += (filter === 'all' ? st.count + ' of ' + st.n + ' habits done' : 'done') + (st.mood ? ', felt ' + MOODS[Math.round(st.mood) - 1].l.toLowerCase() : '');
      out += '<g opacity="' + (.55 + .45 * st.frac).toFixed(2) + '"><title>' + esc(tip) + '</title><circle cx="' + cx + '" cy="' + cy + '" r="' + (big ? 30 : 12 + rr * 2.2).toFixed(1) + '" fill="url(#cs-glow)"/>' +
        (big ? '<path d="' + SPARK + '" transform="translate(' + cx + ' ' + cy + ') scale(' + (.8 + .1 * (st.mood || 3)).toFixed(2) + ')" fill="var(--star)"/>' : '<circle cx="' + cx + '" cy="' + cy + '" r="' + rr.toFixed(1) + '" fill="var(--star)"/>') + '</g>';
    } else if (st.s === 'skipped') {
      tip += 'not done' + (st.mood ? ', felt ' + MOODS[Math.round(st.mood) - 1].l.toLowerCase() : '');
      out += '<circle cx="' + cx + '" cy="' + cy + '" r="6.5" fill="none" stroke="var(--ember)" stroke-width="1.3" stroke-dasharray="2 3" opacity=".9"><title>' + esc(tip) + '</title></circle>';
    } else if (st.s === 'today') {
      out += '<circle class="pulse" cx="' + cx + '" cy="' + cy + '" r="7" fill="none" stroke="var(--star)" stroke-width="1.4" stroke-dasharray="2 3"><title>' + esc(nice(d.date) + ': today, not logged yet') + '</title></circle>';
    } else out += '<circle cx="' + cx + '" cy="' + cy + '" r="2" fill="var(--ink-dim)" opacity=".5"><title>' + esc(tip + 'nothing logged') + '</title></circle>';
  }
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Your last 28 days as a constellation. Lit stars are days you did it, brighter and bigger when you felt better.">' +
    '<defs><radialGradient id="cs-glow"><stop offset="0" style="stop-color:var(--star);stop-opacity:.85"/><stop offset=".35" style="stop-color:var(--star);stop-opacity:.22"/><stop offset="1" style="stop-color:var(--star);stop-opacity:0"/></radialGradient></defs>' + out + '</svg>';
}
function skyLegend() {
  var dot = function (inner) { return '<svg width="22" height="22" viewBox="-11 -11 22 22" aria-hidden="true">' + inner + '</svg>'; };
  return '<div class="legend"><span>' + dot('<circle r="9" fill="url(#cs-glow)"/><circle r="3.3" fill="var(--star)"/>') + 'Done (bigger = better mood)</span>' +
    '<span>' + dot('<circle r="6" fill="none" stroke="var(--ember)" stroke-width="1.3" stroke-dasharray="2 3"/>') + 'Not done</span>' +
    '<span>' + dot('<circle r="2" fill="var(--ink-dim)" opacity=".6"/>') + 'No entry</span>' +
    '<span>' + dot('<path d="' + SPARK + '" transform="scale(.8)" fill="var(--star)"/>') + 'Sunday</span></div>';
}
function filterChips(f) {
  return '<div class="chips" role="group" aria-label="Habit filter"><button class="chip" data-act="filter" data-id="all" aria-pressed="' + (f === 'all') + '">All habits</button>' + S.habits.map(function (x) { return '<button class="chip" data-act="filter" data-id="' + x.id + '" aria-pressed="' + (f === x.id) + '">' + esc(x.name) + '</button>'; }).join('') + '</div>';
}
function viewSky() {
  if (!S.habits.length) return '<section class="sect"><h2>Your constellation</h2></section><div class="empty">Add a habit on the Today tab and log it. Each day you do it lights a star, and a day you skip leaves a gap.</div>';
  if (state.filter !== 'all' && !habitById(state.filter)) state.filter = 'all';
  var f = state.filter, t = today(), lit = 0, miss = 0, i;
  for (i = 0; i < 28; i++) { var s2 = dayState(f, addDays(t, -i)); if (s2.s === 'done') lit++; else if (s2.s === 'skipped') miss++; }
  return '<section class="sect"><h2>Your constellation</h2><p class="lede">Every check-in draws a star. Days you did it light up, brighter and larger when you felt good. Days you logged as not done stay as an empty ring.</p>' + filterChips(f) + '</section>' +
    '<div class="plate">' + skySVG(f) + skyLegend() + '</div><p class="note">Last 28 days: ' + lit + ' lit, ' + miss + ' not done.</p>';
}
function dataSection() {
  var h = '<details><summary>Export, backup and reset</summary><div class="sect"><p class="note" id="datamsg" role="status"></p><div class="row">' +
    (S.logs.length ? '<button class="btn" data-act="csv">Export CSV</button>' : '') +
    (S.habits.length ? '<button class="btn" data-act="backup">Download backup</button>' : '') +
    '<label class="btn" style="cursor:pointer">Restore backup<input type="file" id="restore" accept=".json,application/json" hidden></label></div>';
  if (!state.confirmReset) h += '<div class="row"><button class="btn danger" data-act="resetask">Delete all data</button></div>';
  else h += '<p>This removes every habit and check-in from this browser. It cannot be undone.</p><div class="row"><button class="btn danger" data-act="resetgo">Delete everything</button><button class="btn" data-act="resetno">Keep my data</button></div>';
  return h + '</div></details>';
}
function msg(t) { var el = $('#datamsg'); if (el) el.textContent = t; }

/* ---------- export ---------- */
function download(name, text, type) {
  var b = new Blob([text], {type: type || 'text/plain'}), u = URL.createObjectURL(b), a = document.createElement('a');
  a.href = u; a.download = name; document.body.appendChild(a); a.click();
  setTimeout(function () { URL.revokeObjectURL(u); a.remove(); }, 600);
}
function csvCell(v) { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
function csv() {
  var rows = ['habit,date,time,done,mood,mood_label,note'];
  S.logs.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; }).forEach(function (l) {
    var h = habitById(l.habitId); rows.push([h ? h.name : '', l.date, l.time, isDone(l) ? 'yes' : 'no', l.mood || '', l.mood ? MOODS[l.mood - 1].l : '', l.note].map(csvCell).join(','));
  });
  return rows.join('\n');
}

/* ---------- actions ---------- */
var actions = {
  tab: function (b) { state.tab = b.dataset.tab; state.logging = null; state.removing = null; state.confirmReset = false; render(); window.scrollTo(0, 0); },
  idea: function (b) { var el = $('#hb-name'); if (el) { el.value = b.dataset.h; el.focus(); } },
  start: function (b) { state.logging = b.dataset.id; state.removing = null; render(true); },
  edit: function (b) { state.logging = b.dataset.id; render(true); },
  cancel: function () { state.logging = null; render(true); },
  undo: function (b) { S.logs = S.logs.filter(function (l) { return !(l.habitId === b.dataset.id && l.date === today()); }); save(); render(true); },
  rmask: function (b) { state.removing = b.dataset.id; state.logging = null; render(true); },
  rmno: function () { state.removing = null; render(true); },
  rmgo: function (b) { var id = b.dataset.id; S.habits = S.habits.filter(function (h) { return h.id !== id; }); S.logs = S.logs.filter(function (l) { return l.habitId !== id; }); state.removing = null; save(); render(true); },
  filter: function (b) { state.filter = b.dataset.id; render(true); },
  csv: function () { download('constellation-' + today() + '.csv', csv(), 'text/csv'); msg('CSV downloaded.'); },
  backup: function () { download('constellation-backup-' + today() + '.json', JSON.stringify(S), 'application/json'); msg('Backup downloaded.'); },
  resetask: function () { state.confirmReset = true; render(true); },
  resetno: function () { state.confirmReset = false; render(true); },
  resetgo: function () { S = fresh(); try { localStorage.removeItem(KEY); } catch (e) {} state.confirmReset = false; state.filter = 'all'; render(); window.scrollTo(0, 0); }
};
var forms = {
  addhabit: function () {
    var name = $('#hb-name').value.trim(), err = $('#hb-err');
    if (!name) { err.textContent = 'Give your habit a name.'; return; }
    if (S.habits.some(function (h) { return h.name.toLowerCase() === name.toLowerCase(); })) { err.textContent = 'You already have a habit with that name.'; return; }
    S.habits.push({id: uid(), name: name, created: today()}); save(); state.flash = '"' + name + '" added.'; render();
  },
  log: function (f) {
    var id = f.dataset.id, pick = f.querySelector('input[name=mood]:checked'), err = f.querySelector('.err');
    if (!pick) { err.textContent = 'Pick how you feel.'; return; }
    var now = new Date(), note = f.querySelector('textarea').value.trim(), ex = logOf(id, today()), dn = f.querySelector('input[name=done]:checked').value === '1';
    if (ex) { ex.mood = +pick.value; ex.note = note; ex.done = dn; }
    else S.logs.push({id: uid(), habitId: id, date: today(), time: hhmm(now), mood: +pick.value, done: dn, note: note});
    state.logging = null; state.justLogged = id; save(); render(true);
    setTimeout(function () { state.justLogged = null; }, 800);
  }
};

document.addEventListener('click', function (e) { var b = e.target.closest('[data-act]'); if (!b) return; var fn = actions[b.dataset.act]; if (fn) fn(b, e); });
document.addEventListener('submit', function (e) { e.preventDefault(); var fn = forms[e.target.dataset.form]; if (fn) fn(e.target); });
document.addEventListener('change', function (e) {
  var t = e.target;
  if (t.id === 'restore' && t.files && t.files[0]) {
    var fr = new FileReader();
    fr.onload = function () {
      try {
        var o = JSON.parse(fr.result);
        if (!o || !Array.isArray(o.habits) || !Array.isArray(o.logs)) throw new Error('bad');
        S = {habits: o.habits, logs: o.logs}; save(); state.filter = 'all'; state.tab = 'today'; render(); window.scrollTo(0, 0);
      } catch (er) { msg('That file is not a Constellation backup.'); }
    };
    fr.readAsText(t.files[0]);
  }
});

if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
  window.addEventListener('load', function () { navigator.serviceWorker.register('/sw.js').catch(function () {}); });
}
render();
})();
