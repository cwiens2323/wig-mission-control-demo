import asyncio
import json
import socket
import subprocess
import tempfile
import threading
import time
import unittest
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CHROME = Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe")

try:
    import websockets
except ImportError:  # pragma: no cover - optional local browser test dependency
    websockets = None


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


async def evaluate(ws_url, expression):
    async with websockets.connect(ws_url, max_size=2_000_000) as ws:
        await ws.send(json.dumps({
            "id": 1,
            "method": "Runtime.evaluate",
            "params": {"expression": expression, "returnByValue": True},
        }))
        while True:
            message = json.loads(await ws.recv())
            if message.get("id") == 1:
                return message["result"]["result"].get("value")


class PipelineBrowserBehaviorTests(unittest.TestCase):
    def test_privacy_deadlines_and_storage_migration(self):
        self.assertTrue(CHROME.exists(), "Chrome is required for release-gating browser tests")
        self.assertIsNotNone(websockets, "websockets is required for release-gating browser tests")
        web_port = free_port()
        debug_port = free_port()
        server = ThreadingHTTPServer(
            ("127.0.0.1", web_port),
            lambda *args, **kwargs: QuietHandler(*args, directory=str(ROOT), **kwargs),
        )
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()

        with tempfile.TemporaryDirectory() as profile:
            flags = subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0
            chrome = subprocess.Popen(
                [
                    str(CHROME),
                    "--headless=new",
                    "--disable-gpu",
                    "--no-first-run",
                    "--remote-allow-origins=*",
                    f"--remote-debugging-port={debug_port}",
                    f"--user-data-dir={profile}",
                    f"http://127.0.0.1:{web_port}/#pipeline",
                ],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                creationflags=flags,
            )
            try:
                pages = None
                for _ in range(80):
                    try:
                        with urllib.request.urlopen(f"http://127.0.0.1:{debug_port}/json/list", timeout=1) as response:
                            pages = json.load(response)
                        if pages:
                            break
                    except OSError:
                        time.sleep(0.1)
                self.assertTrue(pages, "Chrome DevTools endpoint did not start")
                ws_url = next(page["webSocketDebuggerUrl"] for page in pages if page["type"] == "page")
                expression = r"""(() => {
                  const results = {};
                  results.expected_page = document.title === 'WIG Mission Control' && Boolean(document.querySelector('#lead-form'));
                  localStorage.setItem(PIPELINE_KEY, '{}');
                  results.malformed_safe = Array.isArray(pipelineItems()) && pipelineItems().length === 0 && localStorage.getItem(PIPELINE_KEY) === '[]';

                  const updated = '2026-08-10T10:00:00.000Z';
                  localStorage.setItem(PIPELINE_KEY, JSON.stringify([
                    {id:'full-name',client_name:'Jordan Smith',stage:'new_received',received_at:updated,due_at:updated},
                    {id:'legacy',first_name:'Anne-Marie',source:'Referral',owner:'Team',stage:'quote_delivered',next_action:'Follow up',received_at:updated,due_at:updated,updated_at:updated,cpa_discovery_complete:false,recommendations_presented:true,quote_accepted:true,cpa_summary_delivered:true}
                  ]));
                  const migrated = pipelineItems();
                  results.full_name_and_legacy_migration = migrated.length === 2 && migrated.some(item => item.client_name === 'Jordan Smith') && migrated.some(item => item.client_name === 'Anne-Marie');
                  const legacy = migrated.find(item => item.id === 'legacy');
                  results.cpa_migration = !legacy.recommendations_presented && legacy.quote_decision === 'pending' && !legacy.cpa_summary_delivered;
                  results.timestamp_migration = legacy.quote_delivered_at === null && legacy.due_at === null && pipelineStatus(legacy) === 'exception';
                  results.name_validation = ['---', '.', "'", '   ', '<img src=x onerror=alert(1)>', 'A'.repeat(101)].every(name => !validClientName(name))
                    && ["Anne-Marie O'Neill", 'José García', '李 小明'].every(name => validClientName(name));
                  const unassigned = normalisePipelineItem({id:'owner-legacy',client_name:'Legacy Client',source:'Phone',owner:'Legacy Team',stage:'new_received',next_action:'Call',received_at:updated,due_at:updated});
                  results.owner_migration_unassigned = unassigned?.owner === 'Unassigned';
                  const incompleteCpa = normalisePipelineItem({id:'cpa-incomplete',client_name:'Incomplete CPA',source:'Phone',owner:'Nicole',stage:'resolved',next_action:'Closed',received_at:updated,due_at:updated,cpa_discovery_complete:true,recommendations_presented:true,quote_decision:'accepted',cpa_summary_delivered:false});
                  results.resolved_incomplete_cpa_exception = cpaWorkflowStatus(incompleteCpa) === 'exception';
                  results.impossible_date_rejected = normalisePipelineItem({id:'date-bad',first_name:'Taylor',source:'Phone',owner:'Team',stage:'new_received',next_action:'Call',received_at:'2026-02-30T10:00',due_at:'2026-03-01T10:00'}) === null;

                  localStorage.setItem(PIPELINE_KEY, '[]');
                  const form = document.querySelector('#lead-form');
                  const fill = (name, stage) => {
                    form.reset();
                    form.elements.client_name.value = name;
                    form.elements.source.value = 'Phone';
                    form.elements.owner.value = 'Chad';
                    form.elements.stage.value = stage;
                    form.elements.next_action.value = 'Call back';
                    form.elements.received_at.value = '2026-08-19T10:00';
                    form.elements.due_at.value = '2026-08-30T10:00';
                    form.elements.quote_decision.value = 'pending';
                  };
                  const submit = () => form.dispatchEvent(new Event('submit', {bubbles:true, cancelable:true}));

                  fill('Jordan Smith', 'new_received');
                  submit();
                  results.full_name_accepted = pipelineItems().some(item => item.client_name === 'Jordan Smith' && item.owner === 'Chad');

                  fill('Taylor', 'new_received');
                  submit();
                  const lead = pipelineItems().find(item => item.client_name === 'Taylor');
                  results.one_hour_locked = Boolean(lead) && new Date(lead.due_at) - new Date(lead.received_at) === 60 * 60000;

                  fill('Casey', 'quote_delivered');
                  form.elements.quote_delivered_at.value = '2026-08-19T11:00';
                  submit();
                  let quote = pipelineItems().find(item => item.client_name === 'Casey');
                  const deliveredAt = quote?.quote_delivered_at;
                  results.quote_48h_locked = Boolean(quote) && new Date(quote.due_at) - new Date(deliveredAt) === 48 * 60 * 60000;
                  editLead(quote.id);
                  form.elements.quote_delivered_at.readOnly = false;
                  form.elements.quote_delivered_at.value = '2026-08-21T11:00';
                  form.elements.due_at.value = '2026-09-30T10:00';
                  submit();
                  quote = pipelineItems().find(item => item.id === quote.id);
                  results.quote_timestamp_persisted = quote.quote_delivered_at === deliveredAt && new Date(quote.due_at) - new Date(deliveredAt) === 48 * 60 * 60000;
                  renderCpaDrilldown();
                  results.manager_cpa_drilldown = document.querySelector('#drill-items').textContent.includes('Casey');
                  return results;
                })()"""
                results = asyncio.run(evaluate(ws_url, expression))
                self.assertTrue(results)
                self.assertTrue(all(results.values()), results)
            finally:
                chrome.terminate()
                try:
                    chrome.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    chrome.kill()
                server.shutdown()
                server.server_close()


if __name__ == "__main__":
    unittest.main()
