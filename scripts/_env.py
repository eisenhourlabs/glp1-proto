"""Load settings for operator scripts from the repo's .env file (never from the strength project).

Only the GLP1_* names are read, so nothing here can pick up another project's credentials by accident.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = REPO_ROOT / ".env"


def load_env() -> dict[str, str]:
    values: dict[str, str] = {}
    if ENV_FILE.exists():
        for raw in ENV_FILE.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            values[key.strip()] = val.strip().strip('"').strip("'")
    # real environment variables win (useful in CI)
    for key in list(values) + [k for k in os.environ if k.startswith("GLP1_")]:
        if os.environ.get(key):
            values[key] = os.environ[key]
    return values


def require(*keys: str) -> dict[str, str]:
    env = load_env()
    missing = [k for k in keys if not env.get(k)]
    if missing:
        sys.exit(f"Missing in {ENV_FILE}: {', '.join(missing)}  (copy .env.example to .env and fill it in)")
    url = env.get("GLP1_SUPABASE_URL", "")
    if url and not (url.startswith("https://") and url.endswith(".supabase.co")):
        sys.exit(f"GLP1_SUPABASE_URL doesn't look like a Supabase project URL: {url}")
    return env


def admin_client():
    """Supabase client with the service key (full access). Operator machine only."""
    env = require("GLP1_SUPABASE_URL", "GLP1_SUPABASE_SERVICE_KEY")
    try:
        from supabase import create_client
    except ImportError:
        sys.exit("Python package 'supabase' is missing:  pip install -r scripts/requirements.txt")
    return create_client(env["GLP1_SUPABASE_URL"], env["GLP1_SUPABASE_SERVICE_KEY"])
