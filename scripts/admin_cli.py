"""Operator commands for the glp1-proto Supabase project.

Run from the repo root:

  python scripts/admin_cli.py whoami
  python scripts/admin_cli.py create-clinic --name "Lakeside Weight & Wellness" --accent "#2f6f68" --demo --check
  python scripts/admin_cli.py add-code --clinic "Lakeside Weight & Wellness" --code LAKESIDE --check
  python scripts/admin_cli.py create-user --email you@example.com --role admin --name Troy --check
  python scripts/admin_cli.py create-user --email pat@example.com --role patient --clinic "Lakeside Weight & Wellness" --name Dana --demo
  python scripts/admin_cli.py list
  python scripts/admin_cli.py migrations        # which supabase/migrations files are applied vs still to paste

--check prints what would happen and changes nothing.
create-user asks for the password interactively (or generates one with --generate-password).
"""
from __future__ import annotations

import argparse
import getpass
import re
import secrets
import string
import sys

from _env import REPO_ROOT, admin_client, require

ROLES = ("patient", "admin", "clinic_viewer")
CODE_RE = re.compile(r"^[A-Z0-9-]{4,24}$")
HEX_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")


def _clinic_id(db, name: str) -> str:
    rows = db.table("clinics").select("id, name").eq("name", name).execute().data
    if not rows:
        sys.exit(f"No clinic named {name!r}. Create it first (create-clinic) or check the spelling (list).")
    return rows[0]["id"]


def cmd_whoami(args) -> None:
    env = require("GLP1_SUPABASE_URL", "GLP1_SUPABASE_SERVICE_KEY")
    print(f"Supabase project: {env['GLP1_SUPABASE_URL']}")
    if args.check:
        print("(--check: not connecting)")
        return
    db = admin_client()
    n = len(db.table("clinics").select("id").execute().data)
    print(f"Connected. clinics: {n}")


def cmd_create_clinic(args) -> None:
    if args.accent and not HEX_RE.match(args.accent):
        sys.exit("--accent must look like #2f6f68")
    row = {"name": args.name.strip(), "short_name": args.short, "accent_color": args.accent, "is_demo": args.demo}
    print("Would create clinic:" if args.check else "Creating clinic:", row)
    if args.check:
        return
    db = admin_client()
    if db.table("clinics").select("id").eq("name", row["name"]).execute().data:
        sys.exit("A clinic with that name already exists.")
    out = db.table("clinics").insert(row).execute().data[0]
    print(f"✓ clinic id {out['id']}")


def cmd_add_code(args) -> None:
    code = args.code.strip().upper()
    if not CODE_RE.match(code):
        sys.exit("Code must be 4–24 characters: A–Z, 0–9 and dashes.")
    print(("Would add" if args.check else "Adding") + f" code {code} → clinic {args.clinic!r}")
    if args.check:
        return
    db = admin_client()
    db.table("clinic_codes").insert({"code": code, "clinic_id": _clinic_id(db, args.clinic), "note": args.note}).execute()
    print("✓ code added")


def _password(args) -> str:
    if args.generate_password:
        alphabet = string.ascii_letters + string.digits
        pw = "".join(secrets.choice(alphabet) for _ in range(14))
        print(f"Generated password: {pw}   (store it; it won't be shown again)")
        return pw
    print("Type the password and press Enter. Nothing appears while you type, which is normal.")
    print("(Pasting with Ctrl+V often doesn't work in this prompt; type it, or rerun with --generate-password.)")
    for _ in range(3):
        pw = getpass.getpass("Password for the new login (min 8 chars): ")
        if len(pw) < 8:
            print(f"  That was {len(pw)} characters; it needs at least 8. Try again.")
            continue
        if pw != getpass.getpass("Repeat password: "):
            print("  The two entries didn't match. Try again.")
            continue
        return pw
    sys.exit("No password set after 3 tries; nothing was created.")


def cmd_create_user(args) -> None:
    if args.role != "admin" and not args.clinic:
        sys.exit("--clinic is required for patient and clinic_viewer logins.")
    plan = {"email": args.email, "role": args.role, "clinic": args.clinic, "display_name": args.name, "is_demo": args.demo}
    print("Would create login + profile:" if args.check else "Creating login + profile:", plan)
    if args.check:
        return
    db = admin_client()
    clinic_id = _clinic_id(db, args.clinic) if args.clinic else None
    res = db.auth.admin.create_user({"email": args.email, "password": _password(args), "email_confirm": True})
    uid = res.user.id
    try:
        db.table("profiles").insert({
            "id": uid, "role": args.role, "clinic_id": clinic_id,
            "display_name": args.name, "is_demo": args.demo,
        }).execute()
    except Exception:
        db.auth.admin.delete_user(uid)   # don't leave a login without a profile
        raise
    print(f"✓ user {uid}")


def cmd_list(args) -> None:
    db = admin_client()
    clinics = db.table("clinics").select("name, status, is_demo, clinic_codes(code, active)").order("name").execute().data
    print("Clinics:")
    for c in clinics:
        codes = ", ".join(k["code"] for k in c.get("clinic_codes") or [] if k["active"]) or "—"
        print(f"  {c['name']}{' (demo)' if c['is_demo'] else ''} · {c['status']} · codes: {codes}")
    people = db.table("profiles").select("display_name, role, is_demo, clinics(name)").order("role").execute().data
    print("Profiles:")
    for p in people:
        clinic = (p.get("clinics") or {}).get("name", "—")
        print(f"  {p['role']:<13} {p.get('display_name') or '—'}{' (demo)' if p['is_demo'] else ''} · {clinic}")


def migration_files() -> list[tuple[str, str]]:
    """(version, filename) for every migration file, in apply order."""
    out = []
    for f in sorted((REPO_ROOT / "supabase" / "migrations").glob("*.sql")):
        m = re.match(r"^(\d{14})_.+\.sql$", f.name)
        if m:
            out.append((m.group(1), f.name))
    return out


def cmd_migrations(args) -> None:
    files = migration_files()
    db = admin_client()
    try:
        applied = {r["version"] for r in db.table("app_migrations").select("version").execute().data}
    except Exception:
        applied = None
    if applied is None:
        print("The migration log table doesn't exist yet. Apply 20261031000200_migration_log.sql first")
        print("(it also records 20261031000100_core_access.sql as applied).")
        return
    pending = [(v, n) for v, n in files if v not in applied]
    for v, n in files:
        print(f"  {'applied ' if v in applied else 'PENDING '} {n}")
    unknown = sorted(applied - {v for v, _ in files})
    if unknown:
        print(f"  ! applied in the database but no file in this folder (git pull?): {', '.join(unknown)}")
    if pending:
        print("\nTo apply: Supabase → SQL Editor → New query → paste each PENDING file's full contents → Run, in the order above.")
    else:
        print("\nDatabase is up to date.")


def main(argv=None) -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("whoami"); s.add_argument("--check", action="store_true"); s.set_defaults(fn=cmd_whoami)

    s = sub.add_parser("create-clinic")
    s.add_argument("--name", required=True); s.add_argument("--short"); s.add_argument("--accent")
    s.add_argument("--demo", action="store_true"); s.add_argument("--check", action="store_true")
    s.set_defaults(fn=cmd_create_clinic)

    s = sub.add_parser("add-code")
    s.add_argument("--clinic", required=True); s.add_argument("--code", required=True); s.add_argument("--note")
    s.add_argument("--check", action="store_true"); s.set_defaults(fn=cmd_add_code)

    s = sub.add_parser("create-user")
    s.add_argument("--email", required=True); s.add_argument("--role", choices=ROLES, required=True)
    s.add_argument("--clinic"); s.add_argument("--name"); s.add_argument("--demo", action="store_true")
    s.add_argument("--generate-password", action="store_true"); s.add_argument("--check", action="store_true")
    s.set_defaults(fn=cmd_create_user)

    s = sub.add_parser("list"); s.set_defaults(fn=cmd_list)

    s = sub.add_parser("migrations"); s.set_defaults(fn=cmd_migrations)

    args = ap.parse_args(argv)
    args.fn(args)


if __name__ == "__main__":
    main()
