"""The synthetic browser-test content (A18) is current, passes content_check, and is clearly made up."""
import json
import re
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
import make_synthetic_content as m  # noqa: E402


class SyntheticContentTests(unittest.TestCase):
    def test_fixture_is_current(self):
        fresh = json.dumps(m.build(), indent=1, ensure_ascii=False) + "\n"   # build() raises if content_check fails
        self.assertEqual(m.OUT.read_text(encoding="utf-8"), fresh, "run python scripts/make_synthetic_content.py")

    def test_marked_synthetic_with_invented_names(self):
        c = json.loads(m.OUT.read_text(encoding="utf-8"))
        self.assertEqual(next(iter(c)), "_synthetic", "the first field says the content is synthetic")
        for e in c["library"]:
            self.assertRegex(e["name"], r"^Sample .+ · L[1-4] · .+$", e["id"])
            self.assertTrue(all(cue.startswith("Sample cue") for cue in e["cues"]), e["id"])
        for w in c["warmups"]:
            self.assertTrue(all(re.match(r"^Sample move \d+$", mv["move"]) for mv in w["moves"]), w["warmup_id"])


if __name__ == "__main__":
    unittest.main()
