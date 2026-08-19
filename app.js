const state = { dashboard: null, meeting: null, selectedMetric: 'open_quotes' };
const countFields = [
  ['new_leads_handled','New leads handled'],['open_quotes_created','Open quotes created/delivered'],
  ['quote_followups_completed','Quote follow-ups completed'],['assessments_completed','Client Protection Assessments'],
  ['seeds_planted','Seeds planted'],['advisor_introductions','Financial-advisor introductions'],
  ['business_farm_opportunities','Business / farm opportunities'],['review_requests','Google review requests'],
  ['referrals_received','Referrals received']
];
const drillMetrics = new Set(['clients_waiting','new_leads','open_quotes','assessments']);
const $ = (selector, root=document) => root.querySelector(selector);
const $$ = (selector, root=document) => [...root.querySelectorAll(selector)];
const esc = (value='') => String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const fmtDate = value => value ? new Date(value).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}) : 'Not set';
const monday = (d=new Date()) => { const x=new Date(d); const day=(x.getDay()+6)%7; x.setDate(x.getDate()-day); return x.toISOString().slice(0,10); };
const addDays = (iso, days) => { const x=new Date(`${iso}T12:00:00`); x.setDate(x.getDate()+days); return x.toISOString().slice(0,10); };

async function api(path, options={}) {
  const method=(options.method||'GET').toUpperCase();
  const payload=options.body?JSON.parse(options.body):{};
  if(method==='POST' && path==='/api/closeouts'){
    const saved=JSON.parse(localStorage.getItem('wig-demo-closeouts')||'[]');
    saved.push({...payload,submitted_at:new Date().toISOString()});
    localStorage.setItem('wig-demo-closeouts',JSON.stringify(saved));
    return {ok:true,demo_local:true};
  }
  if(method==='POST' && path==='/api/focus'){
    localStorage.setItem('wig-demo-focus',JSON.stringify({...payload,status:'active'}));
    return {ok:true,demo_local:true};
  }
  if(method==='PUT' && path.startsWith('/api/settings/')){
    const settings=JSON.parse(localStorage.getItem('wig-demo-settings')||'{}');
    settings[decodeURIComponent(path.split('/').pop())]=payload;
    localStorage.setItem('wig-demo-settings',JSON.stringify(settings));
    return {ok:true,demo_local:true};
  }
  let fixture;
  if(path==='/api/dashboard') fixture='dashboard';
  else if(path==='/api/meeting') fixture='meeting';
  else if(path==='/api/settings') fixture='settings';
  else if(path.startsWith('/api/work-items?metric=')) fixture=decodeURIComponent(path.split('=').pop());
  else throw new Error('This public demo supports synthetic review data only.');
  const response=await fetch(`fixtures/${fixture}.json`);
  if(!response.ok) throw new Error('Demo fixture unavailable');
  const body=await response.json();
  const focus=JSON.parse(localStorage.getItem('wig-demo-focus')||'null');
  if(focus && fixture==='dashboard') body.focus=focus;
  if(focus && fixture==='meeting') body.current_focus=focus;
  if(fixture==='dashboard') body.generated_at=new Date().toISOString();
  if(fixture==='settings'){
    const saved=JSON.parse(localStorage.getItem('wig-demo-settings')||'{}');
    body.items.forEach(item=>{if(saved[item.key]) Object.assign(item,saved[item.key]);});
  }
  return body;
}
function toast(message) { const el=$('#toast'); el.textContent=message; el.classList.add('show'); setTimeout(()=>el.classList.remove('show'),2600); }
function showView(name) {
  $$('.view').forEach(v=>v.classList.toggle('active', v.id===`view-${name}`));
  $$('.main-nav button').forEach(b=>b.classList.toggle('active', b.dataset.view===name));
  location.hash=name;
  if (name==='meeting') loadMeeting();
  if (name==='settings') loadSettings();
  if (name==='drilldown') loadDrilldown(state.selectedMetric);
}

function renderDashboard(data) {
  state.dashboard=data;
  $('#dashboard-updated').textContent=`Updated ${fmtDate(data.generated_at)}`;
  $('#dashboard-tiles').innerHTML=data.tiles.map(t=>`<button class="status-tile ${esc(t.state)}" data-tile="${esc(t.key)}">
    <span class="tile-top"><span class="tile-label">${esc(t.label)}</span><span class="state-pill">${esc(t.state.toUpperCase())}</span></span>
    <span class="tile-value">${esc(t.headline)}</span><span class="tile-detail">${esc(t.detail)}</span>
    <span class="tile-action">${t.state==='green'?'Maintain':esc(t.action)} →</span>
    <span class="tile-meta">${esc(t.source)} · ${esc(fmtDate(t.last_updated))}</span></button>`).join('');
  const f=data.focus;
  $('#focus-strip').innerHTML=f?`<div><small>THIS WEEK’S ONE OFFICE FOCUS</small><br><strong>${esc(f.title)}</strong></div><div><small>OWNER</small><br>${esc(f.owner)} · due ${esc(f.due_date)}</div>`:`<strong>Choose exactly one Office Focus on Tuesday.</strong>`;
  $$('[data-tile]').forEach(btn=>btn.addEventListener('click',()=>{
    const key=btn.dataset.tile;
    if (drillMetrics.has(key)) { state.selectedMetric=key; showView('drilldown'); }
    else if (key==='focus') showView('meeting');
    else toast('This tile is summarized from weekly events and daily closeouts.');
  }));
}
async function loadDashboard() { try { renderDashboard(await api('/api/dashboard')); } catch(e) { toast(e.message); } }

function buildCounters() {
  $('#count-fields').innerHTML=countFields.map(([name,label])=>`<div class="counter"><label for="${name}">${label}</label><button type="button" data-step="-1" aria-label="Decrease ${esc(label)}">−</button><output>0</output><button type="button" data-step="1" aria-label="Increase ${esc(label)}">+</button><input id="${name}" name="${name}" type="number" min="0" value="0"></div>`).join('');
  $$('.counter').forEach(row=>row.addEventListener('click',event=>{
    const button=event.target.closest('button'); if(!button) return;
    const input=$('input',row); input.value=Math.max(0,Number(input.value)+Number(button.dataset.step)); $('output',row).textContent=input.value;
  }));
}
async function saveCloseout(event) {
  event.preventDefault(); const form=event.currentTarget; const data=Object.fromEntries(new FormData(form));
  countFields.forEach(([name])=>data[name]=Number(data[name]||0));
  data.client_waiting_exception=data.waiting_yesno==='1'?Number(data.client_waiting_exception||1):0; delete data.waiting_yesno;
  const msg=$('#closeout-message'); msg.textContent='Saving…';
  try { await api('/api/closeouts',{method:'POST',body:JSON.stringify(data)}); msg.textContent='Closeout saved. Thank you for helping the office see clearly.'; toast('Daily closeout complete'); await loadDashboard(); }
  catch(e){ msg.textContent=e.message; }
}

function renderMeeting(data) {
  state.meeting=data; const prior=data.previous_focus || data.current_focus;
  $('#previous-focus').innerHTML=prior?`<div class="panel-heading"><div><p class="eyebrow">Start here · last Office Focus</p><h2>${esc(prior.title)}</h2></div><span class="state-pill">${esc(prior.status.toUpperCase())}</span></div><p>Owner: <strong>${esc(prior.owner)}</strong> · due ${esc(prior.due_date)}</p><p>Ask: completed, still relevant, or what was learned?</p>`:`<h2>Last Office Focus</h2><p>No previous focus is recorded yet.</p>`;
  $('#meeting-exceptions').innerHTML=data.exceptions.length?data.exceptions.map(t=>`<div class="exception-row ${esc(t.state)}"><strong>${esc(t.label)} · ${esc(t.state.toUpperCase())}</strong><p>${esc(t.detail)}<br><b>${esc(t.action)}</b></p><button class="icon-btn meeting-drill" data-metric="${esc(t.key)}" type="button">Open</button></div>`).join(''):'<p>All tiles are green. Recognize what is working and maintain it.</p>';
  $$('.meeting-drill').forEach(btn=>btn.addEventListener('click',()=>{if(drillMetrics.has(btn.dataset.metric)){state.selectedMetric=btn.dataset.metric;showView('drilldown')}else toast('Review this summary as a team.')}));
}
async function loadMeeting(){ try { renderMeeting(await api('/api/meeting')); } catch(e){ toast(e.message); } }
async function saveFocus(event){event.preventDefault();const form=event.currentTarget;const data=Object.fromEntries(new FormData(form));const msg=$('#focus-message');msg.textContent='Saving one focus…';try{await api('/api/focus',{method:'POST',body:JSON.stringify(data)});msg.textContent='This week’s one Office Focus is set.';toast('Office Focus saved');await Promise.all([loadDashboard(),loadMeeting()]);}catch(e){msg.textContent=e.message;}}

function workStatus(item){const due=item.due_at?new Date(item.due_at):null;if(item.state==='complete')return'complete';if(!item.next_action||!due)return'exception';if(due<new Date())return'overdue';return'open'}
async function loadDrilldown(metric=state.selectedMetric){state.selectedMetric=metric;$$('#drill-tabs button').forEach(b=>b.classList.toggle('active',b.dataset.metric===metric));$('#drill-items').innerHTML='<p>Loading work items…</p>';try{const data=await api(`/api/work-items?metric=${encodeURIComponent(metric)}`);const open=data.items.filter(x=>x.state==='open');const missing=open.filter(x=>!x.next_action||!x.due_at).length;$('#drill-summary').innerHTML=`<strong>${open.length} open item(s).</strong> ${missing?`${missing} missing a next action or due date.`:'Every open item exposes its next commitment.'} Ownership is shown from the source—not reassigned here.`;$('#drill-items').innerHTML=data.items.map(item=>{const status=workStatus(item);return`<article class="work-card ${status}"><div><h3>${esc(item.client_ref)}</h3><p>${esc(item.summary)}</p><p>${esc(item.age_label)} old · ${esc(item.state)}</p></div><dl><dt>Owner</dt><dd>${esc(item.owner||'Missing — action required')}</dd><dt>Due</dt><dd>${esc(item.due_at?fmtDate(item.due_at):'Missing — action required')}</dd></dl><dl><dt>Next action</dt><dd>${esc(item.next_action||'Missing — confirm next action')}</dd><dt>Trigger</dt><dd>${esc(item.trigger_type||'Not applicable')}</dd></dl><dl><dt>Source</dt><dd>${esc(item.source)}</dd><dt>Last updated</dt><dd>${esc(fmtDate(item.source_updated_at))}</dd></dl></article>`}).join('')||'<p>No items found.</p>';}catch(e){$('#drill-items').innerHTML=`<p>${esc(e.message)}</p>`;}}

function valueInput(item){if(typeof item.value==='boolean')return`<select data-value><option value="true" ${item.value?'selected':''}>Enabled</option><option value="false" ${!item.value?'selected':''}>Disabled</option></select>`;return`<input data-value type="${typeof item.value==='number'?'number':'text'}" value="${item.value??''}" placeholder="TBD">`;}
async function loadSettings(){try{const data=await api('/api/settings');$('#settings-list').innerHTML=data.items.map(item=>`<article class="setting-row" data-key="${esc(item.key)}"><div><h3>${esc(item.label)}</h3><p>${esc(item.rationale)}</p></div><div class="setting-value">${valueInput(item)}<small>${esc(item.unit||'')}</small></div><select data-status><option ${item.decision_status==='confirmed'?'selected':''}>confirmed</option><option ${item.decision_status==='draft'?'selected':''}>draft</option><option ${item.decision_status==='TBD'?'selected':''}>TBD</option></select><button class="primary save-setting" type="button">Save</button></article>`).join('');$$('.save-setting').forEach(btn=>btn.addEventListener('click',()=>saveSetting(btn.closest('.setting-row'))));}catch(e){toast(e.message)}}
async function saveSetting(row){const input=$('[data-value]',row);let value=input.value;if(input.tagName==='SELECT')value=value==='true';else if(input.type==='number')value=value===''?null:Number(value);try{await api(`/api/settings/${encodeURIComponent(row.dataset.key)}`,{method:'PUT',body:JSON.stringify({value,decision_status:$('[data-status]',row).value})});toast('Setting saved; dashboard recalculated');await loadDashboard();}catch(e){toast(e.message)}}

function init(){buildCounters();const today=new Date().toISOString().slice(0,10);$('[name=entry_date]').value=today;$('[name=week_of]').value=monday();$('[name=due_date]').value=addDays(monday(),7);
  $$('.main-nav button').forEach(btn=>btn.addEventListener('click',()=>showView(btn.dataset.view)));
  $('#refresh-btn').addEventListener('click',()=>{loadDashboard();toast('Refreshing source data')});
  $('#tv-btn').addEventListener('click',()=>window.open(`${location.pathname}?view=tv`,'_blank'));
  $('#closeout-form').addEventListener('submit',saveCloseout);$('#focus-form').addEventListener('submit',saveFocus);
  $$('[name=waiting_yesno]').forEach(r=>r.addEventListener('change',()=>$('#waiting-count-wrap').classList.toggle('hidden',r.value!=='1'||!r.checked)));
  $$('#drill-tabs button').forEach(btn=>btn.addEventListener('click',()=>loadDrilldown(btn.dataset.metric)));
  const params=new URLSearchParams(location.search);if(params.get('view')==='tv'){document.body.classList.add('tv-mode');showView('dashboard');setInterval(loadDashboard,60000)}else showView(location.hash.slice(1)||'dashboard');
  loadDashboard();
  if('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js');
}
document.addEventListener('DOMContentLoaded',init);
