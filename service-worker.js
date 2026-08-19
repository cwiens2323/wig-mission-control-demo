const CACHE='wig-mission-control-public-demo-v10-sales-workflow';
const SHELL=['./','index.html','styles.css','app.js','manifest.webmanifest','icon.svg','fixtures/dashboard.json','fixtures/meeting.json','fixtures/settings.json','fixtures/clients_waiting.json','fixtures/new_leads.json','fixtures/open_quotes.json','fixtures/assessments.json'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener('fetch',event=>{if(event.request.method!=='GET')return;event.respondWith(fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return response}).catch(()=>caches.match(event.request)));});
