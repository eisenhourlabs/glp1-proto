import sys
import unittest
from datetime import date
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
import demo  # noqa: E402


class FakeQuery:
    def __init__(self, db, table):
        self.db, self.table, self.rows, self.filters, self.op = db, table, None, [], "select"

    def insert(self, rows):
        self.op, self.rows = "insert", rows
        return self

    def select(self, *_):
        return self

    def eq(self, col, val):
        self.filters.append((col, val))
        return self

    def execute(self):
        t = self.db.tables.setdefault(self.table, [])
        if self.op == "insert":
            out = []
            for r in self.rows:
                row = {"id": self.db.next_id(), **r}
                t.append(row); out.append(row)
            return SimpleNamespace(data=out)
        return SimpleNamespace(data=[r for r in t if all(r.get(c) == v for c, v in self.filters)])


class FakeDb:
    def __init__(self):
        self.tables, self._id, self.users = {}, 100, []
        db = self

        class Admin:
            def create_user(self, attrs):
                u = SimpleNamespace(id=f"user-{len(db.users) + 1}", email=attrs["email"], password=attrs["password"])
                db.users.append(u)
                return SimpleNamespace(user=u)

            def list_users(self, page=1, per_page=200):
                return db.users[(page - 1) * per_page: page * per_page]

            def delete_user(self, uid):
                db.users = [u for u in db.users if u.id != uid]

        self.auth = SimpleNamespace(admin=Admin())

    def next_id(self):
        self._id += 1
        return self._id

    def table(self, name):
        return FakeQuery(self, name)

    def rpc(self, name):
        return SimpleNamespace(execute=lambda: SimpleNamespace(data=7))


PERSONA = {
    "key": "P1", "login": "dana", "name": "Dana", "story": "x", "joined_day": -10, "start_day": -9,
    "patient": {"status": "active", "screening_flag": "none", "days_per_week": 3},
    "documents": [{"doc_type": "consent", "doc_version": "c1", "day": -10, "answers": None}],
    "cycles": [{"cycle_no": 1, "cycle_type": "C1", "template_id": "C1-3D", "start_day": -9, "session_minutes": 45, "status": "active",
                "week_modes": {}, "items": [{"session": "A", "slot": "P1", "ord": 1, "role": "P", "pattern": "SQ", "exercise_id": "SQ01", "reasons": []}]}],
    "session_logs": [
        {"ref": 2, "cycle_no": 1, "week": 2, "session": None, "day": -1, "status": "skipped", "skip_reason": "busy"},
        {"ref": 1, "cycle_no": 1, "week": 1, "session": "A", "day": -9, "status": "done", "energy": "ok", "scaled": False, "feel": "too_hard",
         "soreness": "none", "sore_areas": [], "workaround_areas": [], "skip_reason": None, "note": None},
    ],
    "exercise_logs": [{"log_ref": 1, "cycle_no": 1, "slot": "P1", "exercise_id": "SQ01", "sets": [{"reps": 10}], "rating": "good",
                       "skipped": False, "day": -9, "time": "17:10"}],
    "flags": [{"type": "dizzy", "detail": {"session_log_ref": 1}, "day": -9, "resolved": True}],
    "adjustments": [{"cycle_no": 1, "type": "hold_and_trim", "reason": "too_hard_twice", "detail": {"sessions": 3, "after_log_ref": 1}, "day": -9}],
    "proposals": [],
}
DATA = {"format": 1, "clinic": {"name": "Lakeside", "short_name": "L", "accent_color": "#6b4fa0", "code": "LAKESIDE"},
        "staff": [{"login": "brad", "name": "Brad", "role": "admin"}, {"login": "frontdesk", "name": "Desk", "role": "clinic_viewer"}],
        "personas": [PERSONA, {**PERSONA, "key": "C01", "login": None, "name": "Erin W."}]}


class DemoTests(unittest.TestCase):
    def test_dates_and_emails(self):
        t = date(2026, 11, 2)
        self.assertEqual(demo.day(t, -9), "2026-10-24")
        self.assertIsNone(demo.day(t, None))
        self.assertEqual(demo.stamp(t, -1, "17:10"), "2026-11-01T17:10:00+00:00")
        self.assertEqual(demo.email_for("C01"), "c01@glp1demo.example")

    def test_check_dataset(self):
        self.assertEqual(demo.check_dataset(DATA, {"SQ01"}, {"C1-3D"}), [])
        problems = demo.check_dataset(DATA, set(), {"C2-3D"})
        self.assertTrue(any("template" in p for p in problems) and any("SQ01" in p for p in problems))
        self.assertIn("unknown dataset format", demo.check_dataset({**DATA, "format": 9}, {"SQ01"}, {"C1-3D"})[0])

    def test_seed_maps_refs_dates_and_passwords(self):
        db = FakeDb()
        demo.Seeder(db, date(2026, 11, 2), "demo-pass-123", log=lambda *_: None).seed(DATA)
        t = db.tables
        self.assertEqual(len(db.users), 4)
        dana = next(u for u in db.users if u.email == "dana@glp1demo.example")
        erin = next(u for u in db.users if u.email == "c01@glp1demo.example")
        self.assertEqual(dana.password, "demo-pass-123")
        self.assertNotEqual(erin.password, "demo-pass-123", "crowd logins get random passwords")
        self.assertIsNone(next(p for p in t["profiles"] if p["role"] == "admin")["clinic_id"])
        logs = [l for l in t["session_logs"] if l["patient_id"] == dana.id]
        self.assertEqual([l["log_date"] for l in logs], ["2026-10-24", "2026-11-01"], "chronological")
        done = next(l for l in logs if l["status"] == "done")
        ex = next(e for e in t["exercise_logs"] if e["patient_id"] == dana.id)
        self.assertEqual(ex["session_log_id"], done["id"])
        self.assertEqual(ex["created_at"], "2026-10-24T17:10:00+00:00")
        flag = next(f for f in t["flags"] if f["patient_id"] == dana.id)
        self.assertEqual(flag["detail"], {"session_log_id": done["id"]})
        self.assertIsNotNone(flag["resolved_at"])
        adj = next(a for a in t["adjustments"] if a["patient_id"] == dana.id)
        self.assertEqual(adj["detail"], {"sessions": 3, "after_log_id": done["id"]})
        self.assertEqual(next(c for c in t["cycles"] if c["patient_id"] == dana.id)["content_version"], 7)
        self.assertEqual(next(p for p in t["patients"] if p["id"] == dana.id)["start_date"], "2026-10-24")
        self.assertEqual(len(t["clinic_codes"]), 1)

    def test_existing_clinic_is_reused(self):
        db = FakeDb()
        db.tables["clinics"] = [{"id": "c-1", "name": "Lakeside"}]
        db.tables["clinic_codes"] = [{"code": "LAKESIDE", "clinic_id": "c-1"}]
        demo.Seeder(db, date(2026, 11, 2), "demo-pass-123", log=lambda *_: None).seed(DATA)
        self.assertEqual(len(db.tables["clinics"]), 1)
        self.assertTrue(all(p["clinic_id"] == "c-1" for p in db.tables["profiles"] if p["role"] != "admin"))

    def test_remove_only_demo_logins(self):
        db = FakeDb()
        db.users.append(SimpleNamespace(id="real", email="troy@example.com"))
        demo.Seeder(db, date(2026, 11, 2), "demo-pass-123", log=lambda *_: None).seed(DATA)
        self.assertEqual(demo.remove(db, check=True, log=lambda *_: None), 4)
        self.assertEqual(len(db.users), 5, "--check changes nothing")
        demo.remove(db, check=False, log=lambda *_: None)
        self.assertEqual([u.id for u in db.users], ["real"])


if __name__ == "__main__":
    unittest.main()
