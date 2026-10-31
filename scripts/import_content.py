"""Validate the master content workbook and load it into Supabase as a new content version.

  python scripts/import_content.py --check                    # validate only; never connects
  python scripts/import_content.py                            # validate, upload as a new version, make it current
  python scripts/import_content.py --no-activate              # upload but keep the current version live
  python scripts/import_content.py --file path\\to\\workbook.xlsx

The workbook defaults to GLP1_CONTENT_DIR\\GLP1_Program_Master.xlsx from .env.
Settings: keys missing from the database are added; existing values (which an admin may have tuned) are kept
unless --reset-settings is given.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from _env import load_env
from content_check import validate
from content_model import file_hash, load_workbook_content

DEFAULT_NAME = "GLP1_Program_Master.xlsx"


def resolve_path(arg: str | None) -> Path:
    if arg:
        return Path(arg)
    d = load_env().get("GLP1_CONTENT_DIR")
    if not d:
        sys.exit("Give --file, or set GLP1_CONTENT_DIR in .env to the folder holding " + DEFAULT_NAME)
    return Path(d) / DEFAULT_NAME


def rows_for_upload(c: dict, version: int) -> dict[str, list[dict]]:
    yn = lambda v: v == "Y"
    return {
        "content_equipment": [{"version": version, "code": e["code"], "label": e["label"]} for e in c["equipment"]],
        "content_setups": [{"version": version, "setup": s["setup"], "label": s["label"], "level_ceiling": s["level_ceiling"],
                            "pattern_ceilings": s["pattern_ceilings"], "equipment": s["equipment"]} for s in c["setups"]],
        "content_exercises": [{
            "version": version, "id": e["id"], "name": e["name"], "pattern": e["pattern"], "level": e["level"],
            "equipment": e["equipment"], "load_type": e["load_type"], "measure": e["measure"],
            "area_load": {k: int(v) for k, v in e["area_load"].items()}, "floor": yn(e["floor"]),
            "restrictions": e["restrictions"], "unilateral": yn(e["unilateral"]),
            "muscles_primary": e["muscles_primary"], "muscles_secondary": e["muscles_secondary"], "cues": e["cues"],
            "media_status": e["media_status"], "pinned_substitutes": e["pinned_substitutes"], "active": yn(e["active"]),
            "notes": e["notes"]} for e in c["exercises"]],
        "content_templates": [{"version": version, "template_id": t["template_id"], "cycle_type": t["cycle_type"],
                               "days_per_week": t["days_per_week"], "name": t["name"], "sessions": t["sessions"],
                               "entry_rule": t["entry_rule"], "active": yn(t["active"])} for t in c["templates"]],
        "content_slots": [{"version": version, "template_id": s["template_id"], "session": s["session"], "slot": s["slot"],
                           "ord": s["ord"], "role": s["role"], "pattern": s["pattern"], "min_minutes": s["min_minutes"],
                           "sets_by_week": [int(x) for x in s["sets_by_week"]], "reps_by_week": s["reps_by_week"],
                           "rir_by_week": s["rir_by_week"], "time_range_sec": s["time_range_sec"], "rest_sec": s["rest_sec"],
                           "pair_with": s["pair_with"], "prefer_ids": s["prefer_ids"], "note": s["note"]} for s in c["slots"]],
        "content_warmups": [{"version": version, "warmup_id": w["warmup_id"], "name": w["name"], "setups": w["setups"],
                             "age_band": w["age_band"], "moves": w["moves"]} for w in c["warmups"]],
    }


def upload(c: dict, path: Path, summary: dict, note: str | None, activate: bool, reset_settings: bool) -> None:
    from _env import admin_client
    db = admin_client()
    v = db.table("content_versions").insert({
        "source_file": path.name, "source_hash": file_hash(path), "note": note, "summary": summary,
    }).execute().data[0]["version"]
    print(f"  created content version {v}")
    order = ["content_equipment", "content_setups", "content_exercises", "content_templates", "content_slots", "content_warmups"]
    rows = rows_for_upload(c, v)
    for table in order:
        batch = rows[table]
        for i in range(0, len(batch), 200):
            db.table(table).insert(batch[i:i + 200]).execute()
        print(f"  {table}: {len(batch)} rows")
    existing = {r["key"] for r in db.table("app_settings").select("key").execute().data}
    added = 0
    for s in c["settings"]:
        if reset_settings or s["key"] not in existing:
            db.table("app_settings").upsert({"key": s["key"], "value": s["value"], "note": s["note"]}).execute()
            added += 1
    print(f"  app_settings: {added} written ({'reset' if reset_settings else 'new keys only'})")
    if activate:
        db.rpc("content_activate", {"p_version": v}).execute()
        print(f"✓ content version {v} is now current")
    else:
        print(f"✓ content version {v} uploaded (not current; activate later with --activate {v})")


def main(argv=None) -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--file"); ap.add_argument("--check", action="store_true", help="validate only")
    ap.add_argument("--note"); ap.add_argument("--no-activate", action="store_true")
    ap.add_argument("--activate", type=int, metavar="VERSION", help="only make an already-uploaded version current")
    ap.add_argument("--reset-settings", action="store_true")
    ap.add_argument("--show-warnings", action="store_true")
    args = ap.parse_args(argv)

    if args.activate:
        from _env import admin_client
        admin_client().rpc("content_activate", {"p_version": args.activate}).execute()
        print(f"✓ content version {args.activate} is now current"); return

    path = resolve_path(args.file)
    if not path.exists():
        sys.exit(f"Workbook not found: {path}")
    print(f"Checking {path} …")
    content = load_workbook_content(path)
    errors, warnings, summary = validate(content)
    print("  " + ", ".join(f"{k}: {v}" for k, v in summary.items()))
    if warnings:
        print(f"  {len(warnings)} warning(s)" + ("" if args.show_warnings else " (add --show-warnings to list them)"))
        if args.show_warnings:
            for w in warnings: print(f"    · {w}")
    if errors:
        print(f"✗ {len(errors)} problem(s) — nothing was uploaded:")
        for e in errors[:60]: print(f"    · {e}")
        if len(errors) > 60: print(f"    … and {len(errors) - 60} more")
        sys.exit(1)
    print("✓ workbook passes every check")
    if args.check:
        return
    upload(content, path, summary, args.note, not args.no_activate, args.reset_settings)


if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    main()
