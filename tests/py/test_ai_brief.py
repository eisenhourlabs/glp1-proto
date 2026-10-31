import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts"))
import import_ai_brief as b  # noqa: E402


class BriefTests(unittest.TestCase):
    def test_check(self):
        self.assertEqual(b.check_brief("Celebrate consistency. Keep it warm."), [])
        self.assertIn("empty", b.check_brief("  ")[0])
        self.assertIn("characters", b.check_brief("x" * (b.MAX_CHARS + 1))[0])
        self.assertIn("Ozempic", b.check_brief("Ask about Ozempic")[0])

    def test_check_only_run(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "brief.md"
            p.write_text("Be specific and kind.", encoding="utf-8")
            b.main(["--file", str(p), "--check"])
            p.write_text("", encoding="utf-8")
            with self.assertRaises(SystemExit):
                b.main(["--file", str(p), "--check"])


if __name__ == "__main__":
    unittest.main()
