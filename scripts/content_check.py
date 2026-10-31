"""Validate parsed content (content_model.load_workbook_content) against the Framework's rules.

Returns (errors, warnings, summary). Errors block an import; warnings are reported only.
Framework references: S1/S7/S9 safety rules, §4 coverage, §5 levels, §7 dose, §11.3 restrictions, §16 contract.
"""
from __future__ import annotations

import re
from collections import defaultdict
from itertools import product

from content_model import AREAS, PATTERNS, RESTRICTIONS

LOAD_TYPES = {"bodyweight", "dumbbell", "kettlebell", "band", "machine", "cable", "barbell"}
MEASURES = {"reps", "time", "steps"}
MAJOR = ["Quads", "Glutes", "Hamstrings", "Chest", "Upper back", "Lats", "Shoulders"]
# Typical hard-set credit of each pattern toward the major groups (template dose check; Framework §7.1).
PATTERN_MUSCLES = {
    "SQ": {"Quads": 1, "Glutes": .5}, "HI": {"Glutes": 1, "Hamstrings": 1}, "SL": {"Quads": 1, "Glutes": .5},
    "HP": {"Chest": 1, "Shoulders": .5}, "VP": {"Shoulders": 1}, "HR": {"Upper back": 1, "Lats": .5},
    "VR": {"Lats": 1, "Upper back": .5}, "HA": {}, "CA": {}, "CO": {}, "BA": {}, "AR": {},
}
COVER_MIN = {"SQ": 1, "HI": 1, "HP": 1, "VP": 1, "HR": 1, "VR": 1, "CA": 1, "CO": 2, "BA": 1}
OPTIONAL_PATTERN_CEILING = {"AR": 3, "HA": 3}
RANGE_RE = re.compile(r"^(\d+)-(\d+)$")
RIR_RE = re.compile(r"^(\d)(?:-(\d))?$")


def equip_ok(req: str, have: set[str]) -> bool:
    return all(any(alt in have for alt in grp.split("|")) for grp in req.split(";") if grp)


def eligible(ex: dict, have: set[str], level: int, workaround: str | None = None,
             restriction: str | None = None, floor_ok: bool = False) -> bool:
    """Could this exercise fill a slot for a patient with this setup/level/work-around/restriction? (Framework §5, §9, §11)"""
    if ex["active"] != "Y" or ex["level"] > level or not equip_ok(ex["equipment"], have):
        return False
    if restriction and restriction in ex["restrictions"]:
        return False
    if ex["floor"] == "Y" and not floor_ok and level < 3:
        return False
    if workaround and int(ex["area_load"][workaround]) > 1:
        return False
    return True


def _check_exercises(c, err, warn):
    codes = {e["code"] for e in c["equipment"]}
    ids = defaultdict(list)
    for e in c["exercises"]:
        where = f"exercises row {e['_row']} ({e['id'] or '?'})"
        ids[e["id"]].append(e["_row"])
        if not re.match(r"^[A-Z]{2}\d{2,3}$", e["id"]): err.append(f"{where}: id must look like SQ01")
        elif e["id"][:2] != e["pattern"]: err.append(f"{where}: id prefix doesn't match pattern {e['pattern']}")
        if not e["name"]: err.append(f"{where}: name is empty")
        if e["pattern"] not in PATTERNS: err.append(f"{where}: unknown pattern {e['pattern']!r}")
        if e["level"] not in (1, 2, 3, 4): err.append(f"{where}: level must be 1–4"); e["level"] = 9
        for grp in e["equipment"].split(";"):
            for alt in grp.split("|"):
                if alt not in codes: err.append(f"{where}: unknown equipment code {alt!r}")
        if e["load_type"] not in LOAD_TYPES: err.append(f"{where}: unknown load_type {e['load_type']!r}")
        if e["measure"] not in MEASURES: err.append(f"{where}: unknown measure {e['measure']!r}")
        for a, v in e["area_load"].items():
            if v not in (0, 1, 2): err.append(f"{where}: load_{a} must be 0, 1 or 2"); e["area_load"][a] = 2
        for flag in ("floor", "unilateral", "active"):
            if e[flag] not in ("Y", "N"): err.append(f"{where}: {flag} must be Y or N")
        bad = [r for r in e["restrictions"] if r not in RESTRICTIONS]
        if bad: err.append(f"{where}: unknown restriction(s) {bad}")
        if e["floor"] == "Y":
            if e["level"] < 3: err.append(f"{where}: floor exercise below level 3 (Framework S7)")
            if "floor" not in e["restrictions"]: err.append(f"{where}: floor=Y but no 'floor' restriction tag")
        if e["load_type"] == "barbell" and e["level"] != 4:
            err.append(f"{where}: barbell exercises are level 4 only (Gate 1 decision)")
        if not e["cues"]: warn.append(f"{where}: no cues")
        if not e["muscles_primary"]: warn.append(f"{where}: no primary muscles")
    by_id = {e["id"]: e for e in c["exercises"]}
    for i, rows in ids.items():
        if len(rows) > 1: err.append(f"exercise id {i} is used on rows {rows}; ids must be unique")
    for e in c["exercises"]:
        for s in e["pinned_substitutes"]:
            if s not in by_id: err.append(f"exercises row {e['_row']} ({e['id']}): pinned substitute {s} doesn't exist")
            elif by_id[s]["pattern"] != e["pattern"]: warn.append(f"{e['id']}: pinned substitute {s} is a different pattern")


def _check_library_coverage(c, err):
    active = [e for e in c["exercises"] if e["active"] == "Y" and e["level"] in (1, 2, 3, 4)]
    for s in c["setups"]:
        have = set(s["equipment"])
        for p in PATTERNS:
            ceil = min(s["level_ceiling"] or 4, OPTIONAL_PATTERN_CEILING.get(p, 4), s["pattern_ceilings"].get(p, 4))
            levels = {e["level"] for e in active if e["pattern"] == p and equip_ok(e["equipment"], have)}
            missing = [lv for lv in range(1, ceil + 1) if lv not in levels]
            if missing: err.append(f"setup {s['setup']}: pattern {p} has no exercise at level(s) {missing}")
            for a in AREAS:
                if not any(eligible(e, have, 2, workaround=a) for e in active if e["pattern"] == p):
                    err.append(f"setup {s['setup']}: pattern {p} has no level 1–2 option easy on {a}")
            for r in RESTRICTIONS:
                if not any(eligible(e, have, 4, restriction=r, floor_ok=True) for e in active if e["pattern"] == p):
                    err.append(f"setup {s['setup']}: every {p} option has restriction {r}")


def _check_templates(c, err, settings):
    tids = defaultdict(list)
    for t in c["templates"]:
        tids[t["template_id"]].append(t["_row"])
        if t["cycle_type"] not in ("C1", "C2", "C3"): err.append(f"templates row {t['_row']}: cycle_type must be C1/C2/C3")
        if t["days_per_week"] not in (2, 3, 4): err.append(f"templates row {t['_row']}: days_per_week must be 2–4")
        elif len(t["sessions"]) != t["days_per_week"]: err.append(f"template {t['template_id']}: {len(t['sessions'])} sessions for {t['days_per_week']} days")
    for t, rows in tids.items():
        if len(rows) > 1: err.append(f"template id {t} is on rows {rows}")
    tmpl = {t["template_id"]: t for t in c["templates"]}
    by_id = {e["id"]: e for e in c["exercises"]}
    seen = set()
    for s in c["slots"]:
        where = f"slots row {s['_row']} ({s['template_id']} {s['session']} {s['slot']})"
        t = tmpl.get(s["template_id"])
        if not t: err.append(f"{where}: unknown template"); continue
        if s["session"] not in {x["session"] for x in t["sessions"]}: err.append(f"{where}: session not listed in the template")
        key = (s["template_id"], s["session"], s["slot"])
        if key in seen: err.append(f"{where}: duplicate slot")
        seen.add(key)
        if not re.match(r"^[PSFO]\d$", s["slot"]): err.append(f"{where}: slot must look like P1/S2/F1/O1")
        if s["role"] not in ("P", "S", "F", "O"): err.append(f"{where}: role must be P/S/F/O")
        if s["pattern"] not in PATTERNS: err.append(f"{where}: unknown pattern")
        if s["min_minutes"] not in (30, 45, 60): err.append(f"{where}: min_minutes must be 30, 45 or 60")
        for col in ("sets_by_week", "reps_by_week", "rir_by_week"):
            if len(s[col]) != 8: err.append(f"{where}: {col} needs 8 values (weeks 1–8)")
        if any(not x.isdigit() or not 1 <= int(x) <= 5 for x in s["sets_by_week"]): err.append(f"{where}: sets must be whole numbers 1–5")
        for x in s["reps_by_week"]:
            m = RANGE_RE.match(x)
            if not m or int(m.group(1)) >= int(m.group(2)): err.append(f"{where}: reps {x!r} must look like 8-12"); break
        for x in s["rir_by_week"]:
            m = RIR_RE.match(x)
            if not m: err.append(f"{where}: RIR {x!r} must look like 2 or 2-3"); break
            if int(m.group(1)) < 2: err.append(f"{where}: RIR below 2 breaks Framework S1"); break
        if s["time_range_sec"] and not RANGE_RE.match(s["time_range_sec"]): err.append(f"{where}: time_range_sec must look like 20-30")
        for pid in s["prefer_ids"]:
            if pid not in by_id: err.append(f"{where}: prefer id {pid} doesn't exist")
            elif by_id[pid]["pattern"] != s["pattern"]: err.append(f"{where}: prefer id {pid} is not a {s['pattern']} exercise")
    for s in c["slots"]:
        if s["pair_with"] and (s["template_id"], s["session"], s["pair_with"]) not in seen:
            err.append(f"slots row {s['_row']}: pair_with {s['pair_with']} isn't a slot in that session")
    if err: return
    # coverage + dose per template
    for t in c["templates"]:
        sl = [s for s in c["slots"] if s["template_id"] == t["template_id"]]
        at30 = defaultdict(int)
        for s in sl:
            if s["min_minutes"] <= 30: at30[s["pattern"]] += 1
        for p, n in COVER_MIN.items():
            if at30[p] < n: err.append(f"template {t['template_id']}: {p} appears {at30[p]}× at 30 min; Framework §4 needs {n}")
        if at30["SQ"] + at30["HI"] + at30["SL"] < 3: err.append(f"template {t['template_id']}: fewer than 3 lower-body slots at 30 min")
        if at30["HR"] + at30["VR"] < at30["HP"] + at30["VP"]: err.append(f"template {t['template_id']}: less pulling than pushing at 30 min")
        ceiling = settings.get("volume.ceiling_c3", 14) if t["cycle_type"] == "C3" else settings.get("volume.ceiling_c1_c2", 12)
        floor = 3 if t["days_per_week"] == 2 else settings.get("volume.minimum", 4)
        for mins, week in product((30, 45, 60), range(8)):
            hs = defaultdict(float)
            for s in sl:
                if s["min_minutes"] <= mins:
                    for m, cr in PATTERN_MUSCLES[s["pattern"]].items(): hs[m] += int(s["sets_by_week"][week]) * cr
            for m in MAJOR:
                if hs[m] > ceiling: err.append(f"template {t['template_id']} {mins} min week {week + 1}: {m} {hs[m]:g} hard sets > ceiling {ceiling}")
                if mins == 30 and week >= 2 and hs[m] < floor: err.append(f"template {t['template_id']} 30 min week {week + 1}: {m} {hs[m]:g} hard sets < minimum {floor}")


def _check_resolvability(c, err, warn, summary):
    """Every slot pattern must resolve for every setup at every level with no special needs (error), and we count
    the combinations with one work-around or restriction where a slot has no option (warning; engine falls back)."""
    active = [e for e in c["exercises"] if e["active"] == "Y" and e["level"] in (1, 2, 3, 4)]
    patterns_used = sorted({s["pattern"] for s in c["slots"]})
    gaps = defaultdict(int)
    combos = 0
    for st, p, lvl in product(c["setups"], patterns_used, (1, 2, 3, 4)):
        have = set(st["equipment"])
        pool = [e for e in active if e["pattern"] == p]
        if not any(eligible(e, have, lvl) for e in pool):
            err.append(f"setup {st['setup']}: a level-{lvl} patient has no {p} exercise at all")
        for need in [("workaround", a) for a in AREAS] + [("restriction", r) for r in RESTRICTIONS]:
            combos += 1
            kw = {need[0]: need[1]}
            if not any(eligible(e, have, lvl, **kw) for e in pool):
                gaps[(p, need[1])] += 1
    summary["resolvability_combinations"] = combos
    summary["resolvability_gaps"] = sum(gaps.values())
    for (p, need), n in sorted(gaps.items()):
        warn.append(f"{p} with '{need}': no option in {n} setup/level combination(s); the engine skips or swaps that slot")


def validate(c: dict) -> tuple[list[str], list[str], dict]:
    err: list[str] = []
    warn: list[str] = []
    settings = {}
    for s in c["settings"]:
        if not s["key"]: err.append(f"settings row {s['_row']}: empty key")
        elif s["key"] in settings: err.append(f"settings key {s['key']} appears twice")
        elif not isinstance(s["value"], (int, float)): err.append(f"settings {s['key']}: value must be a number")
        else: settings[s["key"]] = s["value"]
    codes = [e["code"] for e in c["equipment"]]
    if len(codes) != len(set(codes)): err.append("equipment: duplicate codes")
    for s in c["setups"]:
        if not s["equipment"]: err.append(f"setup {s['setup']}: no equipment marked Y")
        if s["level_ceiling"] not in (1, 2, 3, 4): err.append(f"setup {s['setup']}: level_ceiling must be 1–4")
        for p in s["pattern_ceilings"]:
            if p not in PATTERNS: err.append(f"setup {s['setup']}: pattern ceiling for unknown pattern {p}")
    for w in c["warmups"]:
        if not w["moves"]: err.append(f"warm-up {w['warmup_id']}: no moves")
    _check_exercises(c, err, warn)
    if not err:
        _check_library_coverage(c, err)
    _check_templates(c, err, settings)
    summary = {"exercises": len(c["exercises"]), "templates": len(c["templates"]), "slots": len(c["slots"]),
               "warmups": len(c["warmups"]), "settings": len(c["settings"]), "setups": len(c["setups"])}
    if not err:
        _check_resolvability(c, err, warn, summary)
    return err, warn, summary
