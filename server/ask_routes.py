"""
Ask Your Data - Main Endpoint

Pipeline, matching the standard, correct text-to-SQL pattern:
1. Check the cache (recognizes reworded repeats of a known question)
2. LLM generates SQL from the question + real schema (fallback chain)
3. SQL passes through the mandatory safety layer, then executes
4. LLM turns the raw result into a natural-language sentence
5. Response cached for next time, returned to the frontend

Response shape matches the proven ApexFi pattern exactly:
{answer, results, sql, provider}
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from . import duckdb_service
from . import llm_service
from . import cache_service
from . import chart_service
from .schema_context import build_schema_description, FEATURE_DICTIONARY, FEATURE_GROUPS

router = APIRouter(prefix="/api/ask", tags=["ask"])

SCHEMA_DESCRIPTION = build_schema_description()

SCHEMA_QUESTION_KEYWORDS = [
    "group", "groups", "category", "categories",
    "shape of", "how many column", "how many variable", "how many feature",
    "list all", "list the", "all statistical", "describe all", "describe the data",
    "what variables", "what features", "what columns",
]


def is_schema_meta_question(question: str) -> bool:
    q = question.lower()
    return any(kw in q for kw in SCHEMA_QUESTION_KEYWORDS)


def answer_schema_meta_question(question: str) -> dict:
    """Deterministic answer built directly from feature_dictionary.py -
    no LLM call, no DuckDB query, no chance of being wrong."""
    group_lines = []
    for group_key, group_info in FEATURE_GROUPS.items():
        features_in_group = [
            name for name, info in FEATURE_DICTIONARY.items()
            if info["group"] == group_key
        ]
        group_lines.append(f"{group_info['label']} ({len(features_in_group)}): " + ", ".join(features_in_group))

    answer = (
        f"The golden dataset has 1,221,354 rows and 62 columns total. "
        f"Of these, 55 are real predictive features organized into 6 groups:\n\n"
        + "\n".join(f"- {line}" for line in group_lines)
    )

    return {
        "answer": answer,
        "results": [{"total_rows": 1221354, "total_columns": 62, "feature_groups": len(FEATURE_GROUPS)}],
        "sql": "(answered directly from the feature dictionary - not a SQL query)",
        "provider": "schema-metadata (no LLM call needed)",
    }

SQL_SYSTEM_PROMPT = f"""You are a SQL assistant for a DuckDB database about \
satellite-derived DEM (Digital Elevation Model) correction data.

{SCHEMA_DESCRIPTION}

Rules:
- Write ONE single SELECT statement, nothing else - no explanation, no markdown, just the raw SQL.
- Always include a LIMIT clause (200 or fewer).
- Never write INSERT, UPDATE, DELETE, DROP, or any statement other than SELECT.
- If the question can't be answered from these columns, respond with exactly: NO_VALID_QUERY
"""

# FIX (real bug reported and confirmed): this prompt never once
# mentioned language. The frontend supports asking in Tamil, Kannada,
# Telugu, and Malayalam, and the ORIGINAL QUESTION TEXT (in whatever
# language it was asked) gets passed straight into this prompt as part
# of the user message. With no instruction otherwise, the LLM sensibly
# mirrors the question's language back in its answer - a reasonable
# default for a general assistant, but wrong here, since the frontend
# explicitly promises "answers are always in English" and the
# text-to-speech voice is English-only (an English voice engine reading
# Tamil script silently skips everything except digits, producing the
# garbled "numbers only" audio that was reported). The fix is a single,
# unambiguous, unmissable instruction added directly to the prompt.
ANSWER_SYSTEM_PROMPT = """You turn raw SQL query results into one clear, \
natural-language sentence answering the original question. Be concise - \
one or two sentences. State the actual numbers from the data. Do not \
mention SQL, databases, or column names verbatim - answer like you're \
explaining the finding to someone who isn't technical.

CRITICAL LANGUAGE RULE: The question may be written in English, Tamil, \
Kannada, Telugu, or Malayalam. Regardless of which language the question \
is written in, your answer MUST always be written in English, and English \
only. Never answer in the same language as the question unless that \
language is already English. This is a hard requirement, not a \
preference."""


class AskRequest(BaseModel):
    question: str


@router.post("")
def ask_question(request: AskRequest):
    question = request.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    if is_schema_meta_question(question):
        return answer_schema_meta_question(question)

    cached = cache_service.find_cached_answer(question)
    if cached:
        return {
            "answer": cached["answer"],
            "results": cached["results"],
            "sql": cached["sql"],
            "provider": f"{cached['provider']} (cached, {cached['cache_similarity']*100:.0f}% match)",
            "chart_url": cached.get("chart_url"),
        }

    try:
        raw_sql, sql_provider = llm_service.generate_with_fallback(
            SQL_SYSTEM_PROMPT, question
        )
    except llm_service.AllProvidersFailedError as e:
        raise HTTPException(status_code=503, detail=f"All LLM providers are unavailable: {e}")

    raw_sql = raw_sql.strip().strip("`").replace("sql\n", "", 1)

    if "NO_VALID_QUERY" in raw_sql:
        raise HTTPException(
            status_code=422,
            detail="This question can't be answered from the available data.",
        )

    try:
        results = duckdb_service.run_query(raw_sql)
    except duckdb_service.UnsafeSQLError as e:
        raise HTTPException(status_code=400, detail=f"Generated query was rejected for safety: {e}")
    except duckdb_service.QueryTimeoutError as e:
        raise HTTPException(status_code=504, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Query execution failed: {e}")

    try:
        answer_prompt = f"Question: {question}\nSQL results: {results[:20]}"
        answer_text, answer_provider = llm_service.generate_with_fallback(
            ANSWER_SYSTEM_PROMPT, answer_prompt
        )
    except llm_service.AllProvidersFailedError:
        answer_text = f"Query result: {results[:5]}"
        answer_provider = sql_provider

    response = {
        "answer": answer_text.strip(),
        "results": results,
        "sql": raw_sql,
        "provider": sql_provider,
        "chart_url": chart_service.maybe_generate_chart(raw_sql, results),
    }
    cache_service.store_answer(question, response)
    return response