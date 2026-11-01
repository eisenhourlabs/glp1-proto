"""Demo data for Brad's walkthrough (Phase 6): a demo clinic full of synthetic patients with weeks of history.

  python scripts/demo.py status                 # what demo data is in the database now
  python scripts/demo.py seed --check           # check the dataset against the database; change nothing
  python scripts/demo.py seed                   # load it (dates are anchored to today)
  python scripts/demo.py reset                  # remove + seed: run this the morning of a demo so "today" lines up
  python scripts/demo.py remove [--check]       # delete every demo login and everything under it

The dataset (demo_seed.local.json) is built from the private content and lives in the content folder
($GLP1_CONTENT_DIR), not in this repo. Every demo login uses the @glp1demo.example domain, so removing is exact:
those logins are deleted and the database cascades their profiles, programs, logs, flags and reviews. The demo
clinic itself is kept (it's harmless and keeps its sign-up code); delete it in Admin if you want it gone.
Logins you can sign in with (Dana, Maria, Lisa, the front desk and Brad) use GLP1_DEMO_PASSWORD from .env, or the
password you type when asked. Everyone else gets a random password nobody knows.
"""
from __future__ import annotations

import argparse
import getpass
import json
import secrets
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _env import load_env  # noqa: E402

DOMAIN = "glp1demo.example"
DEFAULT_NAME = "demo_seed.local.json"
CHUNK = 400


def email_for(login_or_key: str) -> str:
    return f"{login_or_key.lower()}@{DOMAIN}"


def day(today: date, offset: int | None) -> str | None:
    return None if offset is None else (today + timedelta(days=offset)).isoformat()


def stamp(today: date, offset: int, clock: str = "12:00") -> str:
    return f"{day(today, offset)}T{clock}:00+00:00"


def check_dataset(data: dict, exercise_ids: set[str], template_ids: set[str]) -> list[str]:
    """Problems that would make the seed fail or look wrong. Empty list = fine."""
    problems = []
    if data.get("format") != 1:
        problems.append("unknown dataset format (rebuild it with scripts/demo_data.mjs)")
    for p in data.get("personas", []):
        for c in p["cycles"]:
            if c["template_id"] not in template_ids:
                problems.append(f"{p['key']}: template {c['template_id']} is not in the current content")
            missing = {i["exercise_id"] for i in c["items"] if i["exercise_id"]} - exercise_ids
            if missing:
                problems.append(f"{p['key']}: exercises not in the current content: {', '.join(sorted(missing))}")
        refs = {l["ref"] for l in p["session_logs"]}
        if any(e["log_ref"] not in refs for e in p["exercise_logs"]):
            problems.append(f"{p['key']}: exercise logs point at missing sessions")
        if any(l["day"] > 0 for l in p["session_logs"]):
            problems.append(f"{p['key']}: sessions in the future")
    return problems


def chunks(rows: list, n: int = CHUNK):
    for i in range(0, len(rows), n):
        yield rows[i:i + n]


class Seeder:
    """Loads the dataset through a service-role client. `db` is a supabase client (or a test fake)."""

    def __init__(self, db, today: date, password: str, log=print):
        self.db, self.today, self.password, self.log = db, today, password, log
        self.version = None
        self.clinic_id = None

    # ── helpers ──
    def insert(self, table: str, rows: list[dict]) -> list[dict]:
        out = []
        for part in chunks(rows):
            out.extend(self.db.table(table).insert(part).execute().data)
        return out

    def user(self, email: str, login: bool) -> str:
        pw = self.password if login else secrets.token_urlsafe(18)
        res = self.db.auth.admin.create_user({"email": email, "password": pw, "email_confirm": True})
        return res.user.id

    # ── steps ──
    def clinic(self, c: dict) -> str:
        found = self.db.table("clinics").select("id").eq("name", c["name"]).execute().data
        if found:
            self.clinic_id = found[0]["id"]
        else:
            self.clinic_id = self.insert("clinics", [{"name": c["name"], "short_name": c["short_name"],
                                                     "accent_color": c["accent_color"], "is_demo": True}])[0]["id"]
        if not self.db.table("clinic_codes").select("code").eq("code", c["code"]).execute().data:
            self.insert("clinic_codes", [{"code": c["code"], "clinic_id": self.clinic_id, "note": "demo"}])
        return self.clinic_id

    def staff(self, s: dict) -> None:
        uid = self.user(email_for(s["login"]), True)
        self.insert("profiles", [{"id": uid, "role": s["role"], "display_name": s["name"], "is_demo": True,
                                  "clinic_id": self.clinic_id if s["role"] != "admin" else None}])

    def persona(self, p: dict) -> None:
        t = self.today
        uid = self.user(email_for(p["login"] or p["key"]), bool(p["login"]))
        self.insert("profiles", [{"id": uid, "role": "patient", "clinic_id": self.clinic_id, "display_name": p["name"],
                                  "is_demo": True, "created_at": stamp(t, p["joined_day"], "09:00")}])
        self.insert("patients", [{"id": uid, **p["patient"], "start_date": day(t, p.get("start_day"))}])
        if p["documents"]:
            self.insert("patient_documents", [{"patient_id": uid, "doc_type": d["doc_type"], "doc_version": d["doc_version"],
                                               "signed_name": p["name"], "answers": d.get("answers"),
                                               "signed_at": stamp(t, d["day"], "09:05")} for d in p["documents"]])
        cycles = {}
        for c in p["cycles"]:
            row = self.insert("cycles", [{"patient_id": uid, "cycle_no": c["cycle_no"], "template_id": c["template_id"],
                                          "content_version": self.version, "cycle_type": c["cycle_type"],
                                          "start_date": day(t, c["start_day"]), "session_minutes": c["session_minutes"],
                                          "status": c["status"], "week_modes": c["week_modes"]}])[0]
            cycles[c["cycle_no"]] = row["id"]
            self.insert("cycle_items", [{"cycle_id": row["id"], "patient_id": uid, **i} for i in c["items"]])
        logs = sorted(p["session_logs"], key=lambda l: (l["day"], l["ref"]))
        saved = self.insert("session_logs", [{
            "patient_id": uid, "cycle_id": cycles[l["cycle_no"]], "week": l["week"], "session": l["session"],
            "log_date": day(t, l["day"]), "status": l["status"], "energy": l.get("energy"), "scaled": bool(l.get("scaled")),
            "feel": l.get("feel"), "soreness": l.get("soreness"), "sore_areas": l.get("sore_areas") or [],
            "workaround_areas": l.get("workaround_areas") or [], "skip_reason": l.get("skip_reason"), "note": l.get("note"),
            "started_at": stamp(t, l["day"], "17:00") if l["status"] == "done" else None,
            "finished_at": stamp(t, l["day"], "17:45") if l["status"] == "done" else None} for l in logs])
        if len(saved) != len(logs) or any(s["log_date"] != day(t, l["day"]) or s["status"] != l["status"] for l, s in zip(logs, saved)):
            raise RuntimeError("session logs came back in an unexpected order; nothing after this point was loaded")
        ids = {l["ref"]: s["id"] for l, s in zip(logs, saved)}       # PostgREST returns rows in insert order (checked above)
        self.insert("exercise_logs", [{"session_log_id": ids[e["log_ref"]], "patient_id": uid, "slot": e["slot"],
                                       "exercise_id": e["exercise_id"], "sets": e["sets"], "rating": e["rating"],
                                       "skipped": e["skipped"], "created_at": stamp(t, e["day"], e["time"])} for e in p["exercise_logs"]])
        flags = []
        for f in p["flags"]:
            detail = dict(f["detail"])
            if "session_log_ref" in detail:
                detail["session_log_id"] = ids.get(detail.pop("session_log_ref"))
            flags.append({"patient_id": uid, "type": f["type"], "detail": detail, "created_at": stamp(t, f["day"], "18:00"),
                          "resolved_at": stamp(t, min(0, f["day"] + 1), "10:00") if f["resolved"] else None})
        if flags:
            self.insert("flags", flags)
        adjustments = []
        for a in p["adjustments"]:
            detail = dict(a["detail"])
            if "after_log_ref" in detail:
                detail["after_log_id"] = ids.get(detail.pop("after_log_ref"))
            adjustments.append({"patient_id": uid, "cycle_id": cycles[a["cycle_no"]], "type": a["type"], "reason": a["reason"],
                                "detail": detail, "created_at": stamp(t, a["day"], "18:05")})
        if adjustments:
            self.insert("adjustments", adjustments)
        if p["proposals"]:
            self.insert("ai_proposals", [{
                "patient_id": uid, "cycle_id": cycles[r["cycle_no"]], "applied_cycle_id": cycles.get(r.get("applied_cycle_no")),
                "reflection": r["reflection"], "input_summary": r["input_summary"], "source": r["source"], "output": r["output"],
                "default_output": r["default_output"], "final": r["final"], "status": r["status"],
                "created_at": stamp(t, r["day"], "08:00")} for r in p["proposals"]])

    def seed(self, data: dict) -> None:
        self.version = self.db.rpc("content_current_version").execute().data
        self.clinic(data["clinic"])
        for s in data["staff"]:
            self.staff(s)
        for i, p in enumerate(data["personas"], 1):
            self.persona(p)
            self.log(f"  {i:>2}/{len(data['personas'])} {p['name']}")


def demo_users(db) -> list:
    users, page = [], 1
    while True:
        batch = db.auth.admin.list_users(page=page, per_page=200)
        users += [u for u in batch if (u.email or "").endswith("@" + DOMAIN)]
        if len(batch) < 200:
            return users
        page += 1


def remove(db, check: bool, log=print) -> int:
    users = demo_users(db)
    staff = [u for u in users if u.email.split("@")[0] in ("brad", "frontdesk")]
    patients = [u for u in users if u not in staff]
    log(f"{len(users)} demo login(s): {len(patients)} patients, {len(staff)} staff")
    if check:
        return len(users)
    for u in patients + staff:                 # patients first: staff may be referenced by flags they resolved
        db.auth.admin.delete_user(u.id)
    log("✓ demo logins removed (their data went with them)")
    return len(users)


def load_dataset(path_arg: str | None) -> tuple[dict, Path]:
    if path_arg:
        path = Path(path_arg)
    else:
        d = load_env().get("GLP1_CONTENT_DIR")
        if not d:
            sys.exit("Give --file, or set GLP1_CONTENT_DIR in .env to the folder holding " + DEFAULT_NAME)
        path = Path(d) / DEFAULT_NAME
    if not path.exists():
        sys.exit(f"Dataset not found: {path}")
    return json.loads(path.read_text(encoding="utf-8")), path


def demo_password() -> str:
    pw = load_env().get("GLP1_DEMO_PASSWORD") or getpass.getpass("Password for the demo logins (typing is hidden): ")
    if len(pw) < 8:
        sys.exit("The demo password needs at least 8 characters.")
    return pw


def main(argv=None) -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("command", choices=["status", "seed", "reset", "remove"])
    ap.add_argument("--file"); ap.add_argument("--check", action="store_true")
    args = ap.parse_args(argv)
    from _env import admin_client
    db = admin_client()

    if args.command in ("status", "remove", "reset"):
        remove(db, check=args.command == "status" or args.check)
        if args.command != "reset":
            return
    data, path = load_dataset(args.file)
    version = db.rpc("content_current_version").execute().data
    ex = {r["id"] for r in db.table("content_exercises").select("id").eq("version", version).execute().data}
    tp = {r["template_id"] for r in db.table("content_templates").select("template_id").eq("version", version).execute().data}
    problems = check_dataset(data, ex, tp)
    n_logs = sum(len(p["session_logs"]) for p in data["personas"])
    print(f"{path.name}: {len(data['personas'])} patients, {n_logs} sessions, content version {version}")
    if problems:
        print(f"✗ {len(problems)} problem(s):")
        for pr in problems[:30]: print(f"    · {pr}")
        sys.exit(1)
    if args.command == "seed" and demo_users(db):
        sys.exit("Demo data is already loaded. Use `reset` to reload it with today's dates, or `remove` first.")
    if args.check:
        print("✓ dataset matches the current content (nothing changed)")
        return
    Seeder(db, date.today(), demo_password()).seed(data)
    print("✓ demo loaded. Sign in with these (password: the one you chose):")
    for p in data["personas"]:
        if p["login"]:
            print(f"    {email_for(p['login']):<32} {p['name']}: {p.get('story') or ''}")
    for s in data["staff"]:
        print(f"    {email_for(s['login']):<32} {s['name']}")


if __name__ == "__main__":
    main()
