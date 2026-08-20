import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class SalesPipelineAcceptanceTests(unittest.TestCase):
    def test_sales_pipeline_collects_full_name_and_uses_approved_owner_dropdown(self):
        html = (ROOT / "index.html").read_text(encoding="utf-8")
        self.assertIn('data-view="pipeline"', html)
        self.assertIn('id="view-pipeline"', html)
        self.assertIn('id="lead-form"', html)
        self.assertIn('name="client_name"', html)
        self.assertNotIn('name="last_name"', html)
        self.assertNotIn('name="first_name"', html)
        self.assertIn('<select name="owner" required>', html)
        for owner in ["Chad", "Jeff", "Suzanne", "Paul", "Andrea", "Nicole"]:
            self.assertIn(f'<option>{owner}</option>', html)
        for forbidden in ["email", "phone", "address", "policy_number", "date_of_birth"]:
            self.assertNotIn(f'name="{forbidden}"', html)
        for field in ["received_at", "owner", "stage", "next_action", "due_at", "quote_delivered_at"]:
            self.assertIn(f'name="{field}"', html)
        app = (ROOT / "app.js").read_text(encoding="utf-8")
        self.assertIn("PIPELINE_OWNERS.includes(data.owner)", app)
        self.assertIn("owner: PIPELINE_OWNERS.includes(item.owner) ? item.owner : 'Unassigned'", app)

    def test_pipeline_uses_browser_local_demo_storage_and_supports_approved_stages(self):
        app = (ROOT / "app.js").read_text(encoding="utf-8")
        self.assertIn("wig-demo-sales-pipeline", app)
        for stage in [
            "new_received",
            "first_response",
            "discovery_cpa",
            "quote_in_progress",
            "quote_delivered",
            "follow_up",
            "waiting",
            "resolved",
        ]:
            self.assertIn(stage, app)
        self.assertIn("renderPipeline", app)
        self.assertIn("saveLead", app)

    def test_pipeline_enforces_timing_and_normalizes_browser_storage(self):
        app = (ROOT / "app.js").read_text(encoding="utf-8")
        self.assertIn("Array.isArray", app)
        self.assertIn("normalisePipelineItem", app)
        self.assertIn("enforceDueStandard", app)
        self.assertIn("deadlineIso", app)
        self.assertIn("FullYear", app)
        self.assertIn("quote_delivered_at", app)
        self.assertIn("60 * 60000", app)
        self.assertIn("48 * 60 * 60000", app)

    def test_approved_timing_standards_are_exposed_as_confirmed_settings(self):
        settings = json.loads((ROOT / "fixtures" / "settings.json").read_text(encoding="utf-8"))
        by_key = {item["key"]: item for item in settings["items"]}
        expected = {
            "new_lead_response_minutes": 60,
            "clients_waiting_standard_hours": 24,
            "quote_followup_hours": 48,
            "client_review_months": 36,
            "policy_change_same_day": True,
            "claims_followup_days": 30,
        }
        for key, value in expected.items():
            self.assertIn(key, by_key)
            self.assertEqual(by_key[key]["value"], value)
            self.assertEqual(by_key[key]["decision_status"], "confirmed")
        self.assertNotIn("after_hours_response_rule", by_key)

    def test_cpa_milestones_match_approved_quote_workflow(self):
        html = (ROOT / "index.html").read_text(encoding="utf-8")
        app = (ROOT / "app.js").read_text(encoding="utf-8")
        for milestone in ["CPA discovery complete", "Recommendations presented", "Quote decision", "Accepted", "Declined", "CPA summary delivered"]:
            self.assertIn(milestone, html)
        self.assertIn("cpa_discovery_complete", app)
        self.assertIn("recommendations_presented", app)
        self.assertIn("quote_decision", app)
        self.assertIn("accepted", app)
        self.assertIn("declined", app)
        self.assertIn("cpa_summary_delivered", app)
        self.assertIn('data-metric="pipeline_cpa"', html)
        self.assertIn("renderCpaDrilldown", app)
        self.assertIn("cpaWorkflowStatus", app)
        self.assertIn("Saved CPA milestones also appear in Manager Drill-Down", html)

    def test_service_worker_is_bumped_for_pipeline_release(self):
        sw = (ROOT / "service-worker.js").read_text(encoding="utf-8")
        self.assertIn("public-demo-v11-sales-workflow", sw)


if __name__ == "__main__":
    unittest.main()
