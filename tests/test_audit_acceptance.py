import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class AuditAcceptanceTests(unittest.TestCase):
    def test_office_health_matches_audit_language_and_growth_summary(self):
        dashboard = json.loads((ROOT / "fixtures" / "dashboard.json").read_text(encoding="utf-8"))
        tiles = {tile["key"]: tile for tile in dashboard["tiles"]}
        self.assertIn("growth_through_service", tiles)
        self.assertEqual(tiles["assessments"]["label"], "Client Protection Assessment")
        growth = tiles["growth_through_service"]["stats"]
        self.assertTrue({"seeds", "review_requests", "reviews_received", "referrals", "average_rating", "rating_trend"} <= set(growth))
        self.assertNotIn("seeds", tiles)
        self.assertNotIn("reputation", tiles)

    def test_every_non_green_tile_has_a_workflow_or_facilitator_drillthrough(self):
        app = (ROOT / "app.js").read_text(encoding="utf-8")
        self.assertIn("growth_through_service", app)
        self.assertIn("showView('meeting')", app)
        self.assertIn("showGrowthDetail", app)
        self.assertIn("showCapacityDetail", app)

    def test_tooltips_explain_cpa_and_seeds_without_sales_pressure(self):
        html = (ROOT / "index.html").read_text(encoding="utf-8")
        self.assertIn("Completion means the protection check occurred—not that a sale occurred", html)
        self.assertIn("A seed is a helpful future need or conversation—not a sales quota", html)
        for category in ["Protection", "Financial", "Business/Farm", "Relationship", "Reputation"]:
            self.assertIn(category, html)

    def test_tuesday_screen_includes_growth_and_focus_history(self):
        html = (ROOT / "index.html").read_text(encoding="utf-8")
        self.assertIn('id="meeting-growth"', html)
        self.assertIn('id="focus-history"', html)
        app = (ROOT / "app.js").read_text(encoding="utf-8")
        self.assertIn("renderFocusHistory", app)

    def test_settings_present_approved_draft_and_tbd_groups(self):
        html = (ROOT / "index.html").read_text(encoding="utf-8")
        self.assertIn("Approved WIG Standards", html)
        self.assertIn("Draft / Pilot", html)
        self.assertIn("TBD — Decision Required", html)
        app = (ROOT / "app.js").read_text(encoding="utf-8")
        self.assertIn("settings-group", app)

    def test_public_demo_has_browser_local_feedback_and_same_day_closeout_correction(self):
        html = (ROOT / "index.html").read_text(encoding="utf-8")
        self.assertIn('id="feedback-form"', html)
        app = (ROOT / "app.js").read_text(encoding="utf-8")
        self.assertIn("wig-demo-feedback", app)
        self.assertIn("findIndex", app)
        self.assertIn("entry_date", app)

    def test_service_worker_cache_is_bumped_for_audit_release(self):
        sw = (ROOT / "service-worker.js").read_text(encoding="utf-8")
        self.assertIn("public-demo-v3-audit", sw)


if __name__ == "__main__":
    unittest.main()
