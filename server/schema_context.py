"""
Builds a compact schema description for the LLM's system prompt, reusing
the SAME feature_dictionary.py already built and verified for the EDA
page - so the LLM gets real column names and real meanings, not guesses,
and there's only one source of truth for what each column means.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "eda"))
from feature_dictionary import FEATURE_DICTIONARY, FEATURE_GROUPS


def build_schema_description() -> str:
    lines = ["Table name: golden_dataset", "Columns:"]
    for name, info in FEATURE_DICTIONARY.items():
        lines.append(f"  - {name}: {info['full_name']} - {info['meaning']}")
    lines.append("  - latitude, longitude: coordinates (Float)")
    lines.append("  - source_year: the year this point's satellite data is from (Integer)")
    return "\n".join(lines)