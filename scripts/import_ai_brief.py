"""Load the AI coach brief (private content) into app_settings key `ai.coach_brief`.

The brief is extra guidance for the end-of-cycle AI review (tone, priorities, how to read the summary). It lives in the
private content folder next to the master workbook, never in this public repo. The hard rules are enforced in code
(web/engine/review_validate.js) whatever the brief says.

  python scripts/import_ai_brief.py --check          # validate only
  python scripts/import_ai_brief.py                  # upload  (default file: $GLP1_CONTENT_DIR/AI_Coach_Brief.md)
  python scripts/import_ai_brief.py --file path.md
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _env import load_env  # noqa: E402

DEFAULT_NAME = "AI_Coach_Brief.md"
MAX_CHARS = 8000
# The brief must not steer the AI toward topics the validator rejects.
BANNED = re.compile(r"\b(bmi|calorie|ozempic|wegovy|semaglutide|tirzepatide|mounjaro|zepbound|diagnos\w*)\b", re.I)


def check_brief(text: str) -> list[str]:
    problems = []
    if not text.strip():
        problems.append("the brief is empty")
    if len(text) > MAX_CHARS:
        problems.append(f"the brief is {len(text)} characters (limit {MAX_CHARS})")
    m = BANNED.search(text)
    if m:
        problems.append(f'the brief mentions "{m.group(0)}"')
    return problems


def main(argv=None) -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--file"); ap.add_argument("--check", action="store_true")
    args = ap.parse_args(argv)
    if args.file:
        path = Path(args.file)
    else:
        d = load_env().get("GLP1_CONTENT_DIR")
        if not d:
            sys.exit("Give --file, or set GLP1_CONTENT_DIR in .env to the folder holding " + DEFAULT_NAME)
        path = Path(d) / DEFAULT_NAME
    if not path.exists():
        sys.exit(f"Brief not found: {path}")
    text = path.read_text(encoding="utf-8")
    problems = check_brief(text)
    if problems:
        for p in problems: print(f"✗ {p}")
        sys.exit(1)
    print(f"✓ {path.name}: {len(text)} characters")
    if args.check:
        return
    from _env import admin_client
    admin_client().table("app_settings").upsert({"key": "ai.coach_brief", "value": text, "note": f"from {path.name}"}).execute()
    print("✓ ai.coach_brief updated")


if __name__ == "__main__":
    main()
