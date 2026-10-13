"""
LLM Service - Fallback Chain for Text-to-SQL

Tries providers in order: Groq -> Mistral -> OpenRouter -> Cerebras.
The moment one succeeds, its result is used and the rest are skipped.
Only moves to the next provider on a genuine failure (network error,
missing API key, rate limit, timeout) - not just because the first
one is technically working.

All 4 providers expose OpenAI-compatible chat completion APIs, so one
shared request function handles all of them - only the base URL,
model name, and API key differ per provider.
"""

import os
import httpx

PROVIDERS = [
    {
        "name": "groq",
        "base_url": "https://api.groq.com/openai/v1/chat/completions",
        # FIX (confirmed real, dated deprecation): llama-3.3-70b-versatile
        # was decommissioned by Groq on Aug 16, 2026 - before today. This
        # is why the first real test returned 404, not 401 (auth was
        # fine, the model itself just no longer exists on Free/Developer
        # tier). gpt-oss-120b is Groq's current, actively-supported
        # large model as of this fix.
        "model": "openai/gpt-oss-120b",
        "api_key_env": "GROQ_API_KEY",
    },
    {
        "name": "mistral",
        "base_url": "https://api.mistral.ai/v1/chat/completions",
        # Left as-is - "latest" is a rolling alias Mistral maintains
        # themselves, not a dated snapshot, so it isn't at risk of the
        # same deprecation pattern hitting the other 3 providers above.
        "model": "mistral-large-latest",
        "api_key_env": "MISTRAL_API_KEY",
    },
    {
        "name": "openrouter",
        "base_url": "https://openrouter.ai/api/v1/chat/completions",
        # Updated to match the same currently-active model family used
        # for Groq/Cerebras above, given the widespread llama-3.3-70b
        # deprecation pattern found across providers this year.
        "model": "openai/gpt-oss-120b",
        "api_key_env": "OPENROUTER_API_KEY",
    },
    {
        "name": "cerebras",
        "base_url": "https://api.cerebras.ai/v1/chat/completions",
        # FIX: llama-3.3-70b was ALSO deprecated on Cerebras specifically
        # (Feb 16, 2026) - same model family, same industry-wide
        # replacement Cerebras' own docs recommend: gpt-oss-120b.
        "model": "gpt-oss-120b",
        "api_key_env": "CEREBRAS_API_KEY",
    },
]


class AllProvidersFailedError(Exception):
    pass


def _call_provider(provider, system_prompt, user_prompt):
    api_key = os.environ.get(provider["api_key_env"])
    if not api_key:
        raise ValueError(f"{provider['api_key_env']} is not set")

    response = httpx.post(
        provider["base_url"],
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json={
            "model": provider["model"],
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.1,  # low temperature - we want consistent SQL, not creative variety
        },
        timeout=15.0,
    )
    response.raise_for_status()
    data = response.json()
    return data["choices"][0]["message"]["content"]


def generate_with_fallback(system_prompt: str, user_prompt: str):
    """
    Tries each provider in order. Returns (content, provider_name) on
    the first success. Raises AllProvidersFailedError only if every
    single provider fails - with details on each failure for debugging.
    """
    errors = []
    for provider in PROVIDERS:
        try:
            content = _call_provider(provider, system_prompt, user_prompt)
            return content, provider["name"]
        except Exception as e:
            errors.append(f"{provider['name']}: {e}")
            print(f"[LLM] {provider['name']} failed, trying next provider: {e}")
            continue

    raise AllProvidersFailedError(
        "All LLM providers failed:\n" + "\n".join(errors)
    )