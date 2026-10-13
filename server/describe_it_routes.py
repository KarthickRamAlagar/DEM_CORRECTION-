"""
Describe-It Endpoint - Technical User's Fast Path

Takes a plain-language description and uses the SAME LLM fallback
chain already proven in Ask Your Data to estimate reasonable values
for whichever of the 44 features the description implies.

Returned values PRE-FILL the technical form - the user still reviews
before running the actual prediction, and the same safety check from
predict.py still applies regardless of how the values got there.
"""

import sys
import json
import re
from pathlib import Path

from fastapi import APIRouter
from pydantic import BaseModel

sys.path.insert(0, str(Path(__file__).parent))
from llm_service import generate_with_fallback, AllProvidersFailedError

sys.path.insert(0, str(Path(__file__).parent.parent / "eda"))
from feature_dictionary import FEATURE_DICTIONARY

sys.path.insert(0, str(Path(__file__).parent.parent / "model" / "helpers"))
from feature_selection import get_model_features

router = APIRouter(prefix="/api/predict", tags=["prediction"])


def build_describe_it_prompt():
    # FIX (real bug, caught by testing): only show the LLM the 44
    # features actually used by the model - FEATURE_DICTIONARY has 55
    # entries (includes duplicates/near-constant features dropped
    # during feature selection). A real test returned
    # "elevation_gradient", which the model never uses at all (it's a
    # dropped duplicate of slope_deg) - wasted LLM effort estimating a
    # value nothing will ever read.
    model_features = set(get_model_features())
    lines = [
        "You are helping estimate terrain feature values from a plain-language description.",
        "Available features and their meanings:",
    ]
    for name, info in FEATURE_DICTIONARY.items():
        if name in model_features:
            lines.append(f"  {name}: {info['meaning']}")
    lines.append(
        "\nGiven the user's description, output ONLY a JSON object mapping feature names "
        "to reasonable estimated numeric values, using ONLY the exact feature names listed "
        "above. Only include features the description gives you a genuine basis to estimate - "
        "omit any feature you have no real information about, rather than guessing randomly. "
        "Output raw JSON only, no markdown formatting, no explanation."
    )
    return "\n".join(lines)


class DescribeItRequest(BaseModel):
    description: str


@router.post("/describe-it")
def describe_it(request: DescribeItRequest):
    system_prompt = build_describe_it_prompt()

    try:
        raw_response, provider = generate_with_fallback(system_prompt, request.description)
    except AllProvidersFailedError:
        return {"feature_values": {}, "provider": None,
                "warning": "All LLM providers are currently unavailable - try the manual form instead."}

    cleaned = re.sub(r"```json|```", "", raw_response).strip()

    try:
        feature_values = json.loads(cleaned)
    except json.JSONDecodeError:
        return {"feature_values": {}, "provider": provider,
                "warning": "Could not parse a valid response - try rephrasing your description."}

    valid_features = set(get_model_features())
    feature_values = {
        k: v for k, v in feature_values.items()
        if k in valid_features and isinstance(v, (int, float))
    }

    return {"feature_values": feature_values, "provider": provider}