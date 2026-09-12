"""Bundle launcher — prepend dynamic runtime paths, then start main."""
from __future__ import annotations

import os
import sys


def _prepend_env_paths() -> None:
    raw = os.environ.get("LUMINA_PYTHONPATH", "")
    if not raw:
        return
    for d in reversed([p for p in raw.split(os.pathsep) if p]):
        if d not in sys.path:
            sys.path.insert(0, d)


_prepend_env_paths()

if __name__ == "__main__":
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import main

    main.main()
