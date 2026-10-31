"""Export the master workbook to JSON in the same shape as the database content tables (for offline simulation).

  python scripts/export_content_json.py --file <workbook> --out content.json

The output contains private programming content: keep it out of this repo (it's gitignored as *.local.*;
use a name like content.local.json or write it outside the repo).
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from content_check import validate  # noqa: E402
from content_model import load_workbook_content  # noqa: E402
from import_content import resolve_path, rows_for_upload  # noqa: E402


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--file"); ap.add_argument("--out", required=True)
    args = ap.parse_args(argv)
    path = resolve_path(args.file)
    content = load_workbook_content(path)
    errors, _, _ = validate(content)
    if errors:
        sys.exit(f"Workbook has {len(errors)} problem(s); run import_content.py --check first.")
    rows = rows_for_upload(content, 0)
    settings = {s["key"]: s["value"] for s in content["settings"]}
    out = {"library": rows["content_exercises"], "templates": rows["content_templates"], "slots": rows["content_slots"],
           "setups": rows["content_setups"], "warmups": rows["content_warmups"],
           "equipment": rows["content_equipment"], "settings": settings}
    Path(args.out).write_text(json.dumps(out, indent=1), encoding="utf-8")
    print(f"wrote {args.out}: {len(out['library'])} exercises, {len(out['slots'])} slots")


if __name__ == "__main__":
    main()
