"""Build the SYNTHETIC test content used by the browser tests in CI (backlog A18).

  python scripts/make_synthetic_content.py            # writes tests/fixtures/content.synthetic.json
  python scripts/make_synthetic_content.py --check    # fails if the committed fixture is out of date

Everything here is made up so the public repo can run the browser tests without the private workbook: exercise
names are "Sample <pattern> · L<level> · <equipment>", cues and warm-up moves are placeholders, and the templates
are a simple even split that satisfies content_check (coverage, safety rules, dose ceilings). It is NOT a training
program and must never be imported into a real database. The real content lives only in the private folder.

The generator writes a throwaway workbook in the master workbook's sheet format and runs it through the same
loader, check and export as the real content (content_model → content_check → rows_for_upload).
"""
from __future__ import annotations

import argparse
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from content_check import validate  # noqa: E402
from content_model import AREAS, SHEETS, load_workbook_content  # noqa: E402
from import_content import rows_for_upload  # noqa: E402

OUT = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "content.synthetic.json"
NOTICE = ("SYNTHETIC TEST CONTENT. Every name, cue and number here is made up for automated tests. "
          "Not a training program; never import it into a real database.")

EQUIPMENT = [("none", "No equipment"), ("chair", "Sturdy chair"), ("wall", "A wall"), ("counter", "Counter or table"),
             ("step", "Step"), ("bench", "Bench"), ("db", "Dumbbells"), ("kb", "Kettlebell"), ("band", "Resistance band"),
             ("mini_band", "Mini band"), ("cable", "Cable machine"), ("m_legpress", "Leg press machine"),
             ("m_chest", "Chest press machine"), ("m_row", "Row machine"), ("m_pulldown", "Pulldown machine"), ("bb", "Barbell"),
             ("m_sample", "Sample gym-only machine")]
GYM = [c for c, _ in EQUIPMENT]
ONLY = {"m_sample": "commercial_gym,barbell_gym"}  # onboarding offers it for these setups only (equipment.only_setups)
SETUPS = [  # ids and labels are app vocabulary (onboarding shows the labels); equipment lists are made up
    ("commercial_gym", "Traditional / commercial gym", 4, "", GYM),
    ("barbell_gym", "Barbell-focused gym (CrossFit-style)", 4, "",
     ["none", "chair", "wall", "counter", "step", "bench", "db", "kb", "band", "mini_band", "bb"]),
    ("home_gym", "Home gym", 4, "", ["none", "chair", "wall", "counter", "step", "bench", "db", "kb", "band", "mini_band"]),
    ("minimal_home", "Home, minimal equipment", 3, "", ["none", "chair", "wall", "counter", "step", "db", "band", "mini_band"]),
]
WORD = {"SQ": "Squat", "HI": "Hinge", "SL": "Split Stance", "HP": "Press", "VP": "Overhead Press", "HR": "Row",
        "VR": "Pulldown", "CA": "Carry", "CO": "Core Hold", "BA": "Balance", "HA": "Hip Accessory", "AR": "Arm Accessory"}
MAIN_AREA = {"SQ": "knees", "HI": "low_back", "SL": "knees", "HP": "shoulders", "VP": "shoulders", "HR": "upper_back_neck",
             "VR": "shoulders", "CA": "elbows_wrists", "CO": "low_back", "BA": "hips", "HA": "hips", "AR": "elbows_wrists"}
MUSCLE = {"SQ": "Quads", "HI": "Hamstrings", "SL": "Quads", "HP": "Chest", "VP": "Shoulders", "HR": "Upper back",
          "VR": "Lats", "CA": "Core", "CO": "Core", "BA": "Core", "HA": "Glutes", "AR": "Arms"}
TIMED = {"CA", "CO", "BA"}
MACHINE = {"SQ": "m_legpress", "HP": "m_chest", "HR": "m_row", "VR": "m_pulldown", "HI": "cable", "VP": "cable", "CO": "cable"}
# (equipment, load_type, label, levels)
VARIANTS = [("none", "bodyweight", "bodyweight", (1, 2, 3)), ("db", "dumbbell", "dumbbells", (1, 2, 3, 4)),
            ("band", "band", "band", (1, 2, 3))]


def exercises() -> list[list]:
    rows = []
    for p, word in WORD.items():
        n = 0
        top = 3 if p in ("HA", "AR") else 4
        variants = list(VARIANTS)
        if p in MACHINE:
            variants.append((MACHINE[p], "cable" if MACHINE[p] == "cable" else "machine", "machine", (2, 3)))
        if p in ("SQ", "HI", "HP"):
            variants.append(("bb", "barbell", "barbell", (4,)))
        for equip, load_type, label, levels in variants:
            for lvl in levels:
                if lvl > top:
                    continue
                n += 1
                loads = {a: 0 for a in AREAS}
                loads[MAIN_AREA[p]] = 2 if lvl >= 3 and load_type != "bodyweight" else 1
                restrictions = []
                if load_type == "barbell":
                    restrictions = ["heavy"] + (["bend_load"] if p == "HI" else [])
                if p == "VP" and load_type in ("dumbbell", "barbell"):
                    restrictions.append("overhead")
                if p == "HP" and load_type == "dumbbell":
                    restrictions.append("supine")
                measure = "time" if p in TIMED else "reps"
                equipment = "chair" if (p == "SQ" and lvl == 1 and equip == "none") else equip
                rows.append([f"{p}{n:02d}", f"Sample {word} · L{lvl} · {label}", p, lvl, equipment, load_type, measure,
                             *[loads[a] for a in AREAS], "N", ";".join(restrictions), "Y" if p == "SL" else "N",
                             MUSCLE[p], "Core", "Sample cue one", "Sample cue two", "Sample cue three",
                             "needed", None, "Y", "synthetic"])
    # one floor exercise so floor handling is exercised (Framework S7: floor work is level 3+)
    loads = {a: 0 for a in AREAS}
    rows.append(["CO90", "Sample Core Hold · L3 · floor", "CO", 3, "none", "bodyweight", "time", *[loads[a] for a in AREAS],
                 "Y", "floor;supine", "N", "Core", "", "Sample cue one", "Sample cue two", "Sample cue three",
                 "needed", None, "Y", "synthetic"])
    return rows


def _slot(t, s, slot, pattern, minutes=30, sets="2,2,3,3,3,3,3,3"):
    role = slot[0]
    timed = pattern in TIMED
    return [t, s, slot, role, pattern, minutes, sets, ",".join(["8-12"] * 8), "3,3,3,2-3,2-3,2-3,2-3,2-3",
            "20-30" if timed else None, 60 if role == "F" else 90, None, None, None]


# sessions per day count: list of (session, [(slot, pattern)]) at 30 minutes; extras added at 45 and 60
DAYS = {
    2: [("A", [("P1", "SQ"), ("P2", "HR"), ("S1", "HP"), ("S2", "HI"), ("F1", "CO"), ("F2", "CA")]),
        ("B", [("P1", "SQ"), ("P2", "VR"), ("S1", "VP"), ("S2", "HI"), ("F1", "CO"), ("F2", "BA")])],
    3: [("A", [("P1", "SQ"), ("P2", "HR"), ("S1", "HP"), ("S2", "HI"), ("F1", "CO")]),
        ("B", [("P1", "SQ"), ("P2", "VR"), ("S1", "VP"), ("F1", "CO"), ("F2", "BA")]),
        ("C", [("P1", "HI"), ("P2", "HR"), ("S1", "HP"), ("S2", "SQ"), ("F1", "CA")])],
    4: [("A", [("P1", "SQ"), ("P2", "HI"), ("S1", "SL"), ("F1", "CO")]),
        ("B", [("P1", "HP"), ("P2", "HR"), ("S1", "VR"), ("F1", "CA")]),
        ("C", [("P1", "SQ"), ("P2", "HI"), ("F1", "CO"), ("F2", "BA")]),
        ("D", [("P1", "HP"), ("P2", "HR"), ("S1", "VP"), ("S2", "VR")])],
}


SESSION_NAMES = {2: ["Full body A", "Full body B"], 3: ["Full body A", "Full body B", "Full body C"],
                 4: ["Lower A", "Upper A", "Lower B", "Upper B"]}


def templates_and_slots():
    templates, slots = [], []
    # cycle names are the app's own (web/engine/review.js CYCLE_NAMES)
    for ct, label, days in (("C1", "Foundations", (2, 3)), ("C2", "Building", (2, 3, 4)), ("C3", "Strong & Consistent", (2, 3, 4))):
        for d in days:
            tid = f"{ct}-{d}D"
            sessions = DAYS[d]
            templates.append([tid, ct, d, f"{label} · {d} days", ",".join(f"{s}:{SESSION_NAMES[d][i]}" for i, (s, _) in enumerate(sessions)),
                              "synthetic", 1, "Y"])
            for s, lst in sessions:
                for slot, pattern in lst:
                    slots.append(_slot(tid, s, slot, pattern))
                slots.append(_slot(tid, s, "O1", "SL" if s == "A" else "AR", 45, "2,2,2,2,2,2,2,2"))
                slots.append(_slot(tid, s, "O2", "HA", 60, "2,2,2,2,2,2,2,2"))
    return templates, slots


def warmups():
    rows = []
    for wid, setups, band in (("W1", "commercial_gym,barbell_gym", "40-59"), ("W2", "home_gym,minimal_home", "40-59"),
                              ("W3", "all", "60+"), ("W4", "all", "all")):
        for i in range(1, 6):
            rows.append([wid, f"Sample warm-up {wid}", setups, band, i, f"Sample move {i}", "30 s", "Easy pace"])
    return rows


def build_workbook(path: Path) -> None:
    from openpyxl import Workbook
    wb = Workbook()
    wb.remove(wb.active)
    sheets = {
        "exercises": (["id", "name", "pattern", "level", "equipment", "load_type", "measure", *[f"load_{a}" for a in AREAS],
                       "floor", "restrictions", "unilateral", "muscles_primary", "muscles_secondary", "cue_1", "cue_2", "cue_3",
                       "media_status", "pinned_substitutes", "active", "notes"], exercises()),
        "equipment": (["code", "label", "only_setups"], [[c, lab, ONLY.get(c)] for c, lab in EQUIPMENT]),
        "setups": (["setup", "label", "level_ceiling", "pattern_ceiling_exceptions", *GYM],
                   [[s, lab, ceil, exc, *["Y" if c in eq else None for c in GYM]] for s, lab, ceil, exc, eq in SETUPS]),
        "templates": (["template_id", "cycle_type", "days_per_week", "name", "sessions", "entry_rule", "version", "active"], []),
        "slots": (["template_id", "session", "slot", "role", "pattern", "min_minutes", "sets_by_week", "reps_by_week",
                   "rir_by_week", "time_range_sec", "rest_sec", "pair_with", "prefer_ids", "note"], []),
        "warmups": (["warmup_id", "name", "setups", "age_band", "order", "move", "dose", "cue"], warmups()),
        # Only the one key the admin test edits; the engine's built-in defaults cover the rest.
        "settings": (["key", "value", "note"], [["scale_today.load_cut_pct", 10, "synthetic"]]),
    }
    t, s = templates_and_slots()
    sheets["templates"] = (sheets["templates"][0], t)
    sheets["slots"] = (sheets["slots"][0], s)
    for name in SHEETS:
        head, rows = sheets[name]
        ws = wb.create_sheet(name)
        ws.append(head)
        for r in rows:
            ws.append(r)
    wb.save(path)


def build() -> dict:
    with tempfile.TemporaryDirectory() as d:
        path = Path(d) / "synthetic.xlsx"
        build_workbook(path)
        content = load_workbook_content(path)
    errors, _, _ = validate(content)
    if errors:
        raise SystemExit("Synthetic content fails content_check:\n  " + "\n  ".join(errors[:30]))
    rows = rows_for_upload(content, 0)
    return {"_synthetic": NOTICE, "library": rows["content_exercises"], "templates": rows["content_templates"],
            "slots": rows["content_slots"], "setups": rows["content_setups"], "warmups": rows["content_warmups"],
            "equipment": rows["content_equipment"], "settings": {s["key"]: s["value"] for s in content["settings"]}}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true", help="fail if the committed fixture differs from a fresh build")
    args = ap.parse_args(argv)
    text = json.dumps(build(), indent=1, ensure_ascii=False) + "\n"
    if args.check:
        if not OUT.exists() or OUT.read_text(encoding="utf-8") != text:
            sys.exit(f"{OUT} is out of date: run python scripts/make_synthetic_content.py")
        print("synthetic fixture is up to date")
        return
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(text, encoding="utf-8")
    c = json.loads(text)
    print(f"wrote {OUT}: {len(c['library'])} exercises, {len(c['templates'])} templates, {len(c['slots'])} slots")


if __name__ == "__main__":
    main()
