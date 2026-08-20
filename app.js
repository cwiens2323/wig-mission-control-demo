const state = { dashboard: null, meeting: null, selectedMetric: 'open_quotes' };
const drillMetrics = new Set(['clients_waiting', 'new_leads', 'open_quotes', 'assessments']);
const PIPELINE_KEY = 'wig-demo-sales-pipeline';
const PIPELINE_STAGES = {
  new_received: 'New / received',
  first_response: 'First response made',
  discovery_cpa: 'Discovery / CPA',
  quote_in_progress: 'Quote in progress',
  quote_delivered: 'Quote delivered',
  follow_up: 'Follow-up',
  waiting: 'Waiting',
  resolved: 'Resolved'
};
const PIPELINE_OWNERS = ['Chad', 'Jeff', 'Suzanne', 'Paul', 'Andrea', 'Nicole'];
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = (value = '') => String(value).replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const fmtDate = value => value ? new Date(value).toLocaleString([], {month:'short', day:'numeric', hour:'numeric', minute:'2-digit'}) : 'Not set';
const monday = (date = new Date()) => { const d = new Date(date); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
const addDays = (iso, days) => { const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); };
const localDateTime = value => { const d = value ? new Date(value) : new Date(); const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return local.toISOString().slice(0, 16); };
const plusHours = (value, hours) => localDateTime(new Date(value).getTime() + hours * 3600000);
const validClientName = value => {
  const name = String(value || '').trim();
  return name.length <= 100 && /\p{L}/u.test(name) && /^[\p{L}\p{M}.'’ -]+$/u.test(name);
};
function validDate(value) {
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  if (typeof value !== 'string') return false;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z)?$/);
  if (!match) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText = '0', milliText = '0', utc] = match;
  const [year, month, day, hour, minute, second, milli] = [yearText, monthText, dayText, hourText, minuteText, secondText, milliText.padEnd(3, '0')].map(Number);
  if (year < 2000 || year > 2100) return false;
  const date = utc ? new Date(Date.UTC(year, month - 1, day, hour, minute, second, milli)) : new Date(year, month - 1, day, hour, minute, second, milli);
  const read = part => utc ? date[`getUTC${part}`]() : date[`get${part}`]();
  return !Number.isNaN(date.getTime()) && read('FullYear') === year && read('Month') === month - 1 && read('Date') === day && read('Hours') === hour && read('Minutes') === minute && read('Seconds') === second && read('Milliseconds') === milli;
}
function deadlineIso(value, milliseconds) {
  if (!validDate(value)) return null;
  const deadline = new Date(new Date(value).getTime() + milliseconds);
  try { return Number.isNaN(deadline.getTime()) ? null : deadline.toISOString(); } catch { return null; }
}

function localArray(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
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
  if (name === 'pipeline') renderPipeline();
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

function pipelineSeed() {
  const now = Date.now();
  const samDeliveredAt = new Date(now - 50 * 3600000).toISOString();
  return [
    {id: 'demo-jordan', client_name: 'Jordan Miller', source: 'Website', received_at: new Date(now - 25 * 60000).toISOString(), owner: 'Chad', stage: 'new_received', next_action: 'Make first response', due_at: new Date(now + 35 * 60000).toISOString(), quote_delivered_at: null, cpa_discovery_complete: false, recommendations_presented: false, quote_decision: 'pending', cpa_summary_delivered: false, schema_version: 3, updated_at: new Date().toISOString()},
    {id: 'demo-sam', client_name: 'Sam Roberts', source: 'Referral', received_at: new Date(now - 3 * 86400000).toISOString(), owner: 'Jeff', stage: 'quote_delivered', next_action: 'Follow up on quote questions', due_at: new Date(now - 2 * 3600000).toISOString(), quote_delivered_at: samDeliveredAt, cpa_discovery_complete: true, recommendations_presented: true, quote_decision: 'pending', cpa_summary_delivered: false, schema_version: 3, updated_at: new Date().toISOString()}
  ];
}

function normalisePipelineItem(item) {
  const clientName = String(item?.client_name || item?.first_name || '').trim();
  if (!item || typeof item !== 'object' || !validClientName(clientName) || !validDate(item.received_at)) return null;
  const stage = Object.hasOwn(PIPELINE_STAGES, item.stage) ? item.stage : 'new_received';
  const receivedAt = new Date(item.received_at).toISOString();
  const quoteDeliveredAt = validDate(item.quote_delivered_at) ? new Date(item.quote_delivered_at).toISOString() : null;
  const cpaDiscovery = Boolean(item.cpa_discovery_complete);
  const recommendations = cpaDiscovery && Boolean(item.recommendations_presented);
  let quoteDecision = ['pending', 'accepted', 'declined'].includes(item.quote_decision) ? item.quote_decision : (item.quote_accepted ? 'accepted' : 'pending');
  if (!recommendations) quoteDecision = 'pending';
  const summaryDelivered = recommendations && quoteDecision === 'accepted' && Boolean(item.cpa_summary_delivered);
  let dueAt = validDate(item.due_at) ? new Date(item.due_at).toISOString() : null;
  if (stage === 'new_received') dueAt = deadlineIso(receivedAt, 60 * 60000);
  if (['quote_delivered', 'follow_up'].includes(stage)) dueAt = quoteDeliveredAt ? deadlineIso(quoteDeliveredAt, 48 * 60 * 60000) : null;
  return {
    id: String(item.id || `lead-${Date.now()}`),
    client_name: clientName,
    source: ['Phone', 'Website', 'Referral', 'Walk-in', 'Other'].includes(item.source) ? item.source : 'Other',
    received_at: receivedAt,
    owner: PIPELINE_OWNERS.includes(item.owner) ? item.owner : 'Unassigned',
    stage,
    next_action: String(item.next_action || '').slice(0, 140),
    due_at: dueAt,
    quote_delivered_at: quoteDeliveredAt,
    cpa_discovery_complete: cpaDiscovery,
    recommendations_presented: recommendations,
    quote_decision: quoteDecision,
    cpa_summary_delivered: summaryDelivered,
    schema_version: 3,
    updated_at: validDate(item.updated_at) ? new Date(item.updated_at).toISOString() : new Date().toISOString()
  };
}

function pipelineItems() {
  const raw = localStorage.getItem(PIPELINE_KEY);
  if (raw === null) {
    const seeded = pipelineSeed();
    localStorage.setItem(PIPELINE_KEY, JSON.stringify(seeded));
    return seeded;
  }
  const normalised = localArray(PIPELINE_KEY).map(normalisePipelineItem).filter(Boolean);
  localStorage.setItem(PIPELINE_KEY, JSON.stringify(normalised));
  return normalised;
}

function pipelineStatus(item) {
  if (item.stage === 'resolved') return 'complete';
  if (['quote_delivered', 'follow_up'].includes(item.stage) && !item.quote_delivered_at) return 'exception';
  if (!item.next_action || !item.due_at) return 'exception';
  if (new Date(item.due_at) < new Date()) return 'overdue';
  return 'open';
}

function cpaProgress(item) {
  const decisionMade = ['accepted', 'declined'].includes(item.quote_decision);
  const total = item.quote_decision === 'declined' ? 3 : 4;
  const done = [item.cpa_discovery_complete, item.recommendations_presented, decisionMade, item.cpa_summary_delivered].filter(Boolean).length;
  return {done: Math.min(done, total), total};
}

function cpaWorkflowStatus(item) {
  if (item.quote_decision === 'accepted') return item.cpa_summary_delivered ? 'complete' : 'exception';
  if (item.quote_decision === 'declined') return 'complete';
  if (item.stage === 'resolved') return item.cpa_discovery_complete || item.recommendations_presented ? 'exception' : 'complete';
  return pipelineStatus(item);
}

function renderPipeline() {
  const rank = {exception: 0, overdue: 1, open: 2, complete: 3};
  const items = pipelineItems().sort((a, b) => rank[pipelineStatus(a)] - rank[pipelineStatus(b)] || new Date(a.due_at) - new Date(b.due_at));
  const active = items.filter(item => item.stage !== 'resolved');
  $('#pipeline-count').textContent = `${active.length} ACTIVE`;
  $('#pipeline-items').innerHTML = items.map(item => {
    const status = pipelineStatus(item);
    const progress = cpaProgress(item);
    return `<article class="pipeline-card ${status}">
      <div class="pipeline-card-top"><div><h3>${esc(item.client_name)}</h3><span class="stage-pill">${esc(PIPELINE_STAGES[item.stage] || item.stage)}</span></div><span class="state-pill">${esc(status.toUpperCase())}</span></div>
      <p><b>Next:</b> ${esc(item.next_action)}<br><b>Due:</b> ${esc(fmtDate(item.due_at))}</p>
      <p class="pipeline-meta">${esc(item.source)} · ${esc(item.owner)} · received ${esc(fmtDate(item.received_at))}</p>
      <div class="cpa-progress"><span style="width:${progress.done / progress.total * 100}%"></span></div><small>CPA / quote milestones: ${progress.done} of ${progress.total}${item.quote_decision === 'declined' ? ' · declined' : ''}</small>
      <div class="pipeline-actions"><button class="secondary edit-lead" data-id="${esc(item.id)}" type="button">Edit</button><button class="text-button remove-lead" data-id="${esc(item.id)}" type="button">Remove demo item</button></div>
    </article>`;
  }).join('') || '<p>No opportunities are recorded in this browser.</p>';
  $$('.edit-lead').forEach(button => button.addEventListener('click', () => editLead(button.dataset.id)));
  $$('.remove-lead').forEach(button => button.addEventListener('click', () => removeLead(button.dataset.id)));
}

function resetLeadForm() {
  const form = $('#lead-form');
  form.reset();
  form.elements.lead_id.value = '';
  form.elements.received_at.value = localDateTime();
  form.elements.quote_delivered_at.value = '';
  form.elements.quote_delivered_at.readOnly = false;
  enforceDueStandard(form);
  $('#lead-message').textContent = '';
}

function editLead(id) {
  const item = pipelineItems().find(entry => entry.id === id);
  if (!item) return;
  const form = $('#lead-form');
  ['lead_id', 'client_name', 'source', 'owner', 'stage', 'next_action'].forEach(key => { form.elements[key].value = key === 'lead_id' ? item.id : item[key]; });
  form.elements.quote_decision.value = item.quote_decision;
  form.elements.received_at.value = localDateTime(item.received_at);
  form.elements.quote_delivered_at.value = item.quote_delivered_at ? localDateTime(item.quote_delivered_at) : '';
  form.elements.quote_delivered_at.readOnly = Boolean(item.quote_delivered_at);
  form.elements.due_at.value = item.due_at ? localDateTime(item.due_at) : '';
  ['cpa_discovery_complete', 'recommendations_presented', 'cpa_summary_delivered'].forEach(key => { form.elements[key].checked = Boolean(item[key]); });
  enforceDueStandard(form);
  $('#lead-message').textContent = `Editing ${item.client_name}.`;
  form.scrollIntoView({behavior: 'smooth', block: 'start'});
}

function removeLead(id) {
  localStorage.setItem(PIPELINE_KEY, JSON.stringify(pipelineItems().filter(item => item.id !== id)));
  renderPipeline();
  toast('Demo opportunity removed');
}

function enforceDueStandard(form = $('#lead-form')) {
  const stage = form.elements.stage.value;
  const due = form.elements.due_at;
  const note = $('#due-standard-note');
  due.readOnly = false;
  note.textContent = '';
  if (stage === 'new_received' && validDate(form.elements.received_at.value)) {
    due.value = localDateTime(new Date(form.elements.received_at.value).getTime() + 60 * 60000);
    due.readOnly = true;
    note.textContent = 'Locked to 1 hour after receipt.';
  }
  if (['quote_delivered', 'follow_up'].includes(stage)) {
    due.readOnly = true;
    if (validDate(form.elements.quote_delivered_at.value)) {
      due.value = localDateTime(new Date(form.elements.quote_delivered_at.value).getTime() + 48 * 60 * 60000);
      note.textContent = 'Locked to 48 hours after quote delivery.';
    } else {
      due.value = '';
      note.textContent = 'Enter the quote delivery time to set the 48-hour deadline.';
    }
  }
}

function saveLead(event) {
  event.preventDefault();
  const form = event.currentTarget;
  enforceDueStandard(form);
  const data = Object.fromEntries(new FormData(form));
  data.client_name = String(data.client_name || '').trim();
  const milestones = ['cpa_discovery_complete', 'recommendations_presented', 'cpa_summary_delivered'];
  milestones.forEach(key => { data[key] = form.elements[key].checked; });
  const items = pipelineItems();
  const id = data.lead_id || `lead-${Date.now()}`;
  const existingIndex = items.findIndex(item => item.id === id);
  const existingItem = existingIndex >= 0 ? items[existingIndex] : null;
  if (existingItem?.quote_delivered_at) {
    data.quote_delivered_at = existingItem.quote_delivered_at;
    if (['quote_delivered', 'follow_up'].includes(data.stage)) data.due_at = deadlineIso(existingItem.quote_delivered_at, 48 * 60 * 60000);
  }
  if (!validClientName(data.client_name)) {
    $('#lead-message').textContent = 'Enter the client’s full name using letters, spaces, apostrophes, hyphens or periods.';
    return;
  }
  if (!PIPELINE_OWNERS.includes(data.owner)) {
    $('#lead-message').textContent = 'Choose an owner from the approved team list.';
    return;
  }
  if (!validDate(data.received_at) || !validDate(data.due_at)) {
    $('#lead-message').textContent = 'Received time and due time are required.';
    return;
  }
  if (['quote_delivered', 'follow_up'].includes(data.stage) && !validDate(data.quote_delivered_at)) {
    $('#lead-message').textContent = 'Enter when the quote was delivered so the 48-hour deadline cannot be restarted.';
    return;
  }
  if (data.recommendations_presented && !data.cpa_discovery_complete) {
    $('#lead-message').textContent = 'Complete CPA discovery before marking recommendations presented.';
    return;
  }
  if (data.quote_decision !== 'pending' && !data.recommendations_presented) {
    $('#lead-message').textContent = 'Present relevant recommendations before recording the quote decision.';
    return;
  }
  if (data.cpa_summary_delivered && data.quote_decision !== 'accepted') {
    $('#lead-message').textContent = 'The formal CPA summary is delivered after quote acceptance.';
    return;
  }
  const record = normalisePipelineItem({...data, id, updated_at: new Date().toISOString()});
  if (!record) {
    $('#lead-message').textContent = 'This opportunity could not be saved safely.';
    return;
  }
  if (existingIndex >= 0) items[existingIndex] = record; else items.unshift(record);
  localStorage.setItem(PIPELINE_KEY, JSON.stringify(items));
  resetLeadForm();
  renderPipeline();
  $('#lead-message').textContent = existingIndex >= 0 ? 'Opportunity updated in this browser.' : 'Opportunity saved in this browser.';
  toast(existingIndex >= 0 ? 'Opportunity updated' : 'Opportunity saved');
}

function updateLeadDueForStage() {
  const form = $('#lead-form');
  if (['quote_delivered', 'follow_up'].includes(form.elements.stage.value) && !form.elements.quote_delivered_at.value) {
    form.elements.quote_delivered_at.value = localDateTime();
  }
  enforceDueStandard(form);
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

function renderCpaDrilldown() {
  const rank = {exception: 0, overdue: 1, open: 2, complete: 3};
  const items = pipelineItems().sort((a, b) => rank[cpaWorkflowStatus(a)] - rank[cpaWorkflowStatus(b)] || new Date(a.due_at || '9999-12-31') - new Date(b.due_at || '9999-12-31'));
  const completed = items.filter(item => cpaWorkflowStatus(item) === 'complete').length;
  const exceptions = items.filter(item => ['exception', 'overdue'].includes(cpaWorkflowStatus(item))).length;
  $('#drill-summary').innerHTML = `<strong>${items.length} pipeline client(s).</strong> ${completed} CPA / quote workflow(s) complete and ${exceptions} needing attention. This view reads the browser-local Sales Pipeline; enter and edit CPA milestones there.`;
  $('#drill-items').innerHTML = items.map(item => {
    const status = cpaWorkflowStatus(item);
    const progress = cpaProgress(item);
    const milestone = value => value ? 'Complete' : 'Pending';
    return `<article class="work-card ${status}"><div><h3>${esc(item.client_name)}</h3><p>${esc(PIPELINE_STAGES[item.stage])} · ${esc(status)}</p><p><b>CPA progress:</b> ${progress.done} of ${progress.total}</p></div><dl><dt>Owner</dt><dd>${esc(item.owner)}</dd><dt>Due</dt><dd>${esc(item.due_at ? fmtDate(item.due_at) : 'Missing — action required')}</dd></dl><dl><dt>Discovery</dt><dd>${milestone(item.cpa_discovery_complete)}</dd><dt>Recommendations</dt><dd>${milestone(item.recommendations_presented)}</dd></dl><dl><dt>Quote decision</dt><dd>${esc(item.quote_decision)}</dd><dt>CPA summary</dt><dd>${milestone(item.cpa_summary_delivered)}</dd></dl></article>`;
  }).join('') || '<p>No Sales Pipeline clients are recorded in this browser.</p>';
}

async function loadDrilldown(metric = state.selectedMetric) {
  state.selectedMetric = metric;
  $$('#drill-tabs button').forEach(button => button.classList.toggle('active', button.dataset.metric === metric));
  if (metric === 'pipeline_cpa') { renderCpaDrilldown(); return; }
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
  resetLeadForm();
  $$('.main-nav button').forEach(button => button.addEventListener('click', () => showView(button.dataset.view)));
  $('#refresh-btn').addEventListener('click', () => { loadDashboard(); toast('Refreshing source data'); });
  $('#tv-btn').addEventListener('click', () => window.open(`${location.pathname}?view=tv`, '_blank'));
  $('#closeout-form').addEventListener('submit', saveCloseout);
  $('#lead-form').addEventListener('submit', saveLead);
  $('#open-cpa-drill').addEventListener('click', () => { state.selectedMetric = 'pipeline_cpa'; showView('drilldown'); });
  $('#lead-reset').addEventListener('click', resetLeadForm);
  $('#lead-form [name=stage]').addEventListener('change', updateLeadDueForStage);
  $('#lead-form [name=received_at]').addEventListener('change', () => { if ($('#lead-form [name=stage]').value === 'new_received') enforceDueStandard($('#lead-form')); });
  $('#lead-form [name=quote_delivered_at]').addEventListener('change', () => enforceDueStandard($('#lead-form')));
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
