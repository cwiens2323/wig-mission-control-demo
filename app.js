const state = { dashboard: null, meeting: null, selectedMetric: 'open_quotes' };
const drillMetrics = new Set(['clients_waiting', 'new_leads', 'open_quotes', 'assessments']);
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = (value = '') => String(value).replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const fmtDate = value => value ? new Date(value).toLocaleString([], {month:'short', day:'numeric', hour:'numeric', minute:'2-digit'}) : 'Not set';
const monday = (date = new Date()) => { const d = new Date(date); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
const addDays = (iso, days) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };

function localArray(key) {
  try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
}

async function api(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const payload = options.body ? JSON.parse(options.body) : {};

  if (method === 'POST' && path === '/api/closeouts') {
    const saved = localArray('wig-demo-closeouts');
    const identity = String(payload.staff_label || '').trim().toLowerCase();
    const existing = saved.findIndex(item => item.entry_date === payload.entry_date && String(item.staff_label || '').trim().toLowerCase() === identity);
    const record = {...payload, submitted_at: new Date().toISOString()};
    if (existing >= 0) saved[existing] = record; else saved.push(record);
    localStorage.setItem('wig-demo-closeouts', JSON.stringify(saved));
    return {ok: true, demo_local: true, corrected: existing >= 0};
  }
  if (method === 'POST' && path === '/api/focus') {
    const prior = JSON.parse(localStorage.getItem('wig-demo-focus') || 'null') || state.meeting?.current_focus;
    const history = localArray('wig-demo-focus-history');
    if (prior && !history.some(item => item.week_of === prior.week_of && item.title === prior.title)) {
      history.unshift({...prior, status: prior.status === 'active' ? 'completed' : prior.status, completion_note: prior.completion_note || 'Reviewed at Tuesday meeting'});
    }
    const current = {...payload, status: 'active', updated_at: new Date().toISOString()};
    localStorage.setItem('wig-demo-focus-history', JSON.stringify(history.slice(0, 12)));
    localStorage.setItem('wig-demo-focus', JSON.stringify(current));
    return {ok: true, demo_local: true};
  }
  if (method === 'POST' && path === '/api/feedback') {
    const feedback = localArray('wig-demo-feedback');
    feedback.unshift({...payload, saved_at: new Date().toISOString()});
    localStorage.setItem('wig-demo-feedback', JSON.stringify(feedback.slice(0, 30)));
    return {ok: true, demo_local: true};
  }
  if (method === 'PUT' && path.startsWith('/api/settings/')) {
    const settings = JSON.parse(localStorage.getItem('wig-demo-settings') || '{}');
    settings[decodeURIComponent(path.split('/').pop())] = payload;
    localStorage.setItem('wig-demo-settings', JSON.stringify(settings));
    return {ok: true, demo_local: true};
  }

  let fixture;
  if (path === '/api/dashboard') fixture = 'dashboard';
  else if (path === '/api/meeting') fixture = 'meeting';
  else if (path === '/api/settings') fixture = 'settings';
  else if (path.startsWith('/api/work-items?metric=')) fixture = decodeURIComponent(path.split('=').pop());
  else throw new Error('This public demo supports synthetic review data only.');

  const response = await fetch(`fixtures/${fixture}.json`, {cache: 'no-store'});
  if (!response.ok) throw new Error('Demo fixture unavailable');
  const body = await response.json();
  const focus = JSON.parse(localStorage.getItem('wig-demo-focus') || 'null');
  if (focus && fixture === 'dashboard') body.focus = focus;
  if (focus && fixture === 'meeting') body.current_focus = focus;
  if (fixture === 'meeting') body.focus_history = [...localArray('wig-demo-focus-history'), ...(body.focus_history || [])];
  if (fixture === 'dashboard') body.generated_at = new Date().toISOString();
  if (fixture === 'settings') {
    const saved = JSON.parse(localStorage.getItem('wig-demo-settings') || '{}');
    body.items.forEach(item => { if (saved[item.key]) Object.assign(item, saved[item.key]); });
  }
  return body;
}

function toast(message) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.add('show');
  setTimeout(() => element.classList.remove('show'), 2600);
}

function showView(name) {
  $$('.view').forEach(view => view.classList.toggle('active', view.id === `view-${name}`));
  $$('.main-nav button').forEach(button => button.classList.toggle('active', button.dataset.view === name));
  location.hash = name;
  if (name === 'meeting') loadMeeting();
  if (name === 'settings') loadSettings();
  if (name === 'drilldown') loadDrilldown(state.selectedMetric);
}

function renderDashboard(data) {
  state.dashboard = data;
  $('#dashboard-updated').textContent = `Updated ${fmtDate(data.generated_at)}`;
  $('#dashboard-tiles').innerHTML = data.tiles.map(tile => `<button class="status-tile ${esc(tile.state)}" data-tile="${esc(tile.key)}">
    <span class="tile-top"><span class="tile-label">${esc(tile.label)}</span><span class="state-pill">${esc(tile.state.toUpperCase())}</span></span>
    <span class="tile-value">${esc(tile.headline)}</span><span class="tile-detail">${esc(tile.detail)}</span>
    <span class="tile-action">${tile.state === 'green' ? 'Maintain / review detail' : esc(tile.action)} →</span>
    <span class="tile-meta"><b>Source:</b> ${esc(tile.source)}<br><b>Freshness:</b> ${esc(fmtDate(tile.last_updated))}</span></button>`).join('');
  const focus = data.focus;
  $('#focus-strip').innerHTML = focus ? `<div><small>THIS WEEK’S ONE OFFICE FOCUS</small><br><strong>${esc(focus.title)}</strong></div><div><small>OWNER</small><br>${esc(focus.owner)} · due ${esc(focus.due_date)}</div>` : '<strong>Choose exactly one Office Focus on Tuesday.</strong>';
  $$('[data-tile]').forEach(button => button.addEventListener('click', () => {
    const key = button.dataset.tile;
    if (drillMetrics.has(key)) { state.selectedMetric = key; showView('drilldown'); }
    else if (key === 'growth_through_service') showGrowthDetail();
    else if (key === 'capacity') showCapacityDetail();
    else if (key === 'focus') showView('meeting');
  }));
}

async function loadDashboard() {
  try { renderDashboard(await api('/api/dashboard')); } catch (error) { toast(error.message); }
}

function showGrowthDetail() {
  const tile = state.dashboard?.tiles.find(item => item.key === 'growth_through_service');
  if (!tile) return;
  let dialog = $('#growth-dialog');
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.id = 'growth-dialog';
    dialog.className = 'metric-dialog';
    document.body.append(dialog);
  }
  const stats = tile.stats;
  dialog.innerHTML = `<form method="dialog"><button class="dialog-close" aria-label="Close">×</button><p class="eyebrow">Great advice → trust → reputation → growth</p><h2>Growth Through Service</h2>
    <div class="growth-grid"><div><b>${esc(stats.seeds)}</b><span>Seeds identified</span></div><div><b>${esc(stats.review_requests)}</b><span>Review requests</span></div><div><b>${esc(stats.reviews_received)}</b><span>Reviews received</span></div><div><b>${esc(stats.referrals)}</b><span>Referrals</span></div><div><b>${esc(stats.average_rating)} ★</b><span>Rating · ${esc(stats.rating_trend)}</span></div></div>
    <p>No individual rankings or quotas. Recognize authentic service stories and follow up naturally.</p><p class="source-note"><b>Source:</b> ${esc(tile.source)} · <b>Freshness:</b> ${esc(fmtDate(tile.last_updated))}</p></form>`;
  dialog.showModal();
}

function showCapacityDetail() {
  const tile = state.dashboard?.tiles.find(item => item.key === 'capacity');
  if (!tile) return;
  let dialog = $('#capacity-dialog');
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.id = 'capacity-dialog';
    dialog.className = 'metric-dialog';
    document.body.append(dialog);
  }
  const bottlenecks = tile.stats?.bottlenecks || [];
  dialog.innerHTML = `<form method="dialog"><button class="dialog-close" aria-label="Close">×</button><p class="eyebrow">Tomorrow readiness · help signal only</p><h2>Capacity</h2><p><strong>${esc(tile.headline)}</strong> · ${esc(tile.detail)}</p><p>This must never be used as an employee performance score. The manager action is to offer help, clarify the bottleneck, and rebalance work.</p><h3>Current help request</h3>${bottlenecks.length ? `<ul>${bottlenecks.map(item => `<li>${esc(item)}</li>`).join('')}</ul>` : '<p>No bottleneck note was submitted.</p>'}<button class="secondary" type="button" id="capacity-meeting">Take to Tuesday screen</button><p class="source-note"><b>Source:</b> ${esc(tile.source)} · <b>Freshness:</b> ${esc(fmtDate(tile.last_updated))}</p></form>`;
  $('#capacity-meeting', dialog).addEventListener('click', () => { dialog.close(); showView('meeting'); });
  dialog.showModal();
}

async function saveCloseout(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  data.client_waiting_exception = data.waiting_yesno === '1' ? Number(data.client_waiting_exception || 1) : 0;
  delete data.waiting_yesno;
  const message = $('#closeout-message');
  message.textContent = 'Saving…';
  try {
    const result = await api('/api/closeouts', {method: 'POST', body: JSON.stringify(data)});
    message.textContent = result.corrected ? 'Same-day closeout corrected in this browser.' : 'Closeout saved in this browser.';
    toast(result.corrected ? 'Same-day correction saved' : 'Daily closeout complete');
    await loadDashboard();
  } catch (error) { message.textContent = error.message; }
}

function renderFocusHistory(items = []) {
  const unique = items.filter((item, index, all) => index === all.findIndex(other => other.week_of === item.week_of && other.title === item.title));
  $('#focus-history').innerHTML = unique.length ? unique.slice(0, 6).map(item => `<div class="history-row"><div><strong>${esc(item.title)}</strong><small>Week of ${esc(item.week_of)}</small></div><div>${esc(item.owner)} · due ${esc(item.due_date)}</div><div><span class="state-pill">${esc((item.status || 'open').toUpperCase())}</span><small>${esc(item.completion_note || 'Outcome pending')}</small></div></div>`).join('') : '<p>No earlier Office Focus is recorded yet.</p>';
}

function renderMeeting(data) {
  state.meeting = data;
  const prior = data.previous_focus || data.current_focus;
  $('#previous-focus').innerHTML = prior ? `<div class="panel-heading"><div><p class="eyebrow">Start here · prior Office Focus</p><h2>${esc(prior.title)}</h2></div><span class="state-pill">${esc((prior.status || 'open').toUpperCase())}</span></div><p>Owner: <strong>${esc(prior.owner)}</strong> · due ${esc(prior.due_date)}</p><p>Ask: completed, still relevant, or what was learned?</p>` : '<h2>Prior Office Focus</h2><p>No previous focus is recorded yet.</p>';
  $('#meeting-exceptions').innerHTML = data.exceptions.length ? data.exceptions.map(tile => `<div class="exception-row ${esc(tile.state)}"><strong>${esc(tile.label)} · ${esc(tile.state.toUpperCase())}</strong><p>${esc(tile.detail)}<br><b>${esc(tile.action)}</b><br><small>${esc(tile.source)} · ${esc(fmtDate(tile.last_updated))}</small></p><button class="icon-btn meeting-drill" data-metric="${esc(tile.key)}" type="button">Open</button></div>`).join('') : '<p>All tiles are green. Recognize what is working and maintain it.</p>';
  $$('.meeting-drill').forEach(button => button.addEventListener('click', () => {
    if (drillMetrics.has(button.dataset.metric)) { state.selectedMetric = button.dataset.metric; showView('drilldown'); }
    else if (button.dataset.metric === 'growth_through_service') showGrowthDetail();
  }));
  const growth = data.dashboard?.tiles?.find(tile => tile.key === 'growth_through_service');
  $('#meeting-growth').innerHTML = growth ? `<div class="panel-heading"><div><p class="eyebrow">4 minutes · no rankings</p><h2>Growth Through Service</h2></div><span class="state-pill">TEAM</span></div><p>${esc(growth.detail)}</p><p><strong>Prompt:</strong> Which helpful seed, review, or referral story should the office learn from?</p><button class="secondary" type="button" id="meeting-growth-detail">Review service metrics</button>` : '<h2>Growth Through Service</h2><p>Summary unavailable.</p>';
  $('#meeting-growth-detail')?.addEventListener('click', showGrowthDetail);
  renderFocusHistory(data.focus_history || []);
}

async function loadMeeting() {
  try { renderMeeting(await api('/api/meeting')); } catch (error) { toast(error.message); }
}

async function saveFocus(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  const message = $('#focus-message');
  message.textContent = 'Saving one focus…';
  try {
    await api('/api/focus', {method: 'POST', body: JSON.stringify(data)});
    message.textContent = 'This week’s one Office Focus is set.';
    toast('Office Focus saved');
    await Promise.all([loadDashboard(), loadMeeting()]);
  } catch (error) { message.textContent = error.message; }
}

function workStatus(item) {
  const due = item.due_at ? new Date(item.due_at) : null;
  if (item.state === 'complete') return 'complete';
  if (!item.next_action || !due) return 'exception';
  if (due < new Date()) return 'overdue';
  return 'open';
}

async function loadDrilldown(metric = state.selectedMetric) {
  state.selectedMetric = metric;
  $$('#drill-tabs button').forEach(button => button.classList.toggle('active', button.dataset.metric === metric));
  $('#drill-items').innerHTML = '<p>Loading work items…</p>';
  try {
    const data = await api(`/api/work-items?metric=${encodeURIComponent(metric)}`);
    const rank = {exception: 0, overdue: 1, open: 2, complete: 3};
    const items = [...data.items].sort((a, b) => rank[workStatus(a)] - rank[workStatus(b)] || new Date(a.due_at || '9999-12-31') - new Date(b.due_at || '9999-12-31'));
    const open = items.filter(item => item.state === 'open');
    const missing = open.filter(item => !item.next_action || !item.due_at).length;
    $('#drill-summary').innerHTML = `<strong>${open.length} open item(s).</strong> ${missing ? `${missing} missing a next action or due date.` : 'Every open item exposes its next commitment.'} Exceptions are sorted first. Ownership remains in Salesforce/PolicyCenter or the stated source.`;
    $('#drill-items').innerHTML = items.map(item => {
      const status = workStatus(item);
      return `<article class="work-card ${status}"><div><h3>${esc(item.client_ref)}</h3><p>${esc(item.summary)}</p><p><b>Age:</b> ${esc(item.age_label)} · ${esc(status)}</p></div><dl><dt>Owner</dt><dd>${esc(item.owner || 'Missing — action required')}</dd><dt>Due</dt><dd>${esc(item.due_at ? fmtDate(item.due_at) : 'Missing — action required')}</dd></dl><dl><dt>Next action</dt><dd>${esc(item.next_action || 'Missing — confirm next action')}</dd><dt>Trigger</dt><dd>${esc(item.trigger_type || 'Not applicable')}</dd></dl><dl><dt>Source</dt><dd>${esc(item.source)}</dd><dt>Last updated</dt><dd>${esc(fmtDate(item.source_updated_at))}</dd></dl></article>`;
    }).join('') || '<p>No items found.</p>';
  } catch (error) { $('#drill-items').innerHTML = `<p>${esc(error.message)}</p>`; }
}

function valueInput(item) {
  if (typeof item.value === 'boolean') return `<select data-value><option value="true" ${item.value ? 'selected' : ''}>Enabled</option><option value="false" ${!item.value ? 'selected' : ''}>Disabled</option></select>`;
  return `<input data-value type="${typeof item.value === 'number' ? 'number' : 'text'}" value="${item.value ?? ''}" placeholder="TBD">`;
}

function settingMarkup(item) {
  return `<article class="setting-row" data-key="${esc(item.key)}"><div><h3>${esc(item.label)}</h3><p>${esc(item.rationale)}</p></div><div class="setting-value">${valueInput(item)}<small>${esc(item.unit || '')}</small></div><select data-status><option value="confirmed" ${item.decision_status === 'confirmed' ? 'selected' : ''}>Approved WIG Standard</option><option value="draft" ${item.decision_status === 'draft' ? 'selected' : ''}>Draft / Pilot</option><option value="TBD" ${item.decision_status === 'TBD' ? 'selected' : ''}>TBD</option></select><button class="primary save-setting" type="button">Save</button></article>`;
}

async function loadSettings() {
  try {
    const data = await api('/api/settings');
    ['confirmed', 'draft', 'TBD'].forEach(status => {
      const group = $(`.settings-group [data-settings-status="${status}"]`);
      group.innerHTML = data.items.filter(item => item.decision_status === status).map(settingMarkup).join('') || '<p>No settings in this state.</p>';
    });
    $$('.save-setting').forEach(button => button.addEventListener('click', () => saveSetting(button.closest('.setting-row'))));
  } catch (error) { toast(error.message); }
}

async function saveSetting(row) {
  const input = $('[data-value]', row);
  let value = input.value;
  if (input.tagName === 'SELECT') value = value === 'true';
  else if (input.type === 'number') value = value === '' ? null : Number(value);
  try {
    await api(`/api/settings/${encodeURIComponent(row.dataset.key)}`, {method: 'PUT', body: JSON.stringify({value, decision_status: $('[data-status]', row).value})});
    toast('Setting saved in this browser');
    await Promise.all([loadSettings(), loadDashboard()]);
  } catch (error) { toast(error.message); }
}

async function saveFeedback(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const message = $('#feedback-message');
  try {
    await api('/api/feedback', {method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form)))});
    form.reset();
    message.textContent = 'Feedback saved only in this browser for pilot review.';
    toast('Pilot feedback saved');
  } catch (error) { message.textContent = error.message; }
}

function init() {
  const today = new Date().toISOString().slice(0, 10);
  $('[name=entry_date]').value = today;
  $('[name=week_of]').value = monday();
  $('[name=due_date]').value = addDays(monday(), 7);
  $$('.main-nav button').forEach(button => button.addEventListener('click', () => showView(button.dataset.view)));
  $('#refresh-btn').addEventListener('click', () => { loadDashboard(); toast('Refreshing source data'); });
  $('#tv-btn').addEventListener('click', () => window.open(`${location.pathname}?view=tv`, '_blank'));
  $('#closeout-form').addEventListener('submit', saveCloseout);
  $('#focus-form').addEventListener('submit', saveFocus);
  $('#feedback-form').addEventListener('submit', saveFeedback);
  $$('[name=waiting_yesno]').forEach(radio => radio.addEventListener('change', () => $('#waiting-count-wrap').classList.toggle('hidden', radio.value !== '1' || !radio.checked)));
  $$('#drill-tabs button').forEach(button => button.addEventListener('click', () => loadDrilldown(button.dataset.metric)));
  const params = new URLSearchParams(location.search);
  if (params.get('view') === 'tv') { document.body.classList.add('tv-mode'); showView('dashboard'); setInterval(loadDashboard, 60000); }
  else showView(location.hash.slice(1) || 'dashboard');
  loadDashboard();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js');
}

document.addEventListener('DOMContentLoaded', init);
