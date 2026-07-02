import os
import re
import time
import json
import logging
import openai
import google.generativeai as genai

OPENAI_KEY = os.environ.get("OPENAI_API_KEY")
GEMINI_KEY = os.environ.get("GEMINI_API_KEY")

logger = logging.getLogger(__name__)

if OPENAI_KEY:
    openai.api_key = OPENAI_KEY
if GEMINI_KEY:
    genai.configure(api_key=GEMINI_KEY)

PROMPT_TEMPLATE = (
    "You are an expert evaluator. Given a reference and a model response, score the response 0-100 for correctness, faithfulness, and relevance.\n"
    "Return only valid JSON with keys: score (number 0-100) and reason (string).\n\n"
    "Reference:\n{reference}\n\n"
    "Response:\n{response}\n"
)


def parse_json_or_fallback(text: str):
    if not text:
        return {"score": 0.0, "reason": ""}

    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)

    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, dict):
            return {"score": float(parsed.get("score", 0.0)), "reason": str(parsed.get("reason", ""))}
    except Exception:
        pass

    try:
        m = re.search(r"\{.*\}", cleaned, flags=re.DOTALL)
        if m:
            obj = json.loads(m.group(0))
            if isinstance(obj, dict):
                return {"score": float(obj.get("score", 0.0)), "reason": str(obj.get("reason", ""))}
    except Exception:
        pass

    try:
        m2 = re.search(r"(\d{1,3}(?:\.\d+)?)", cleaned)
        if m2:
            return {"score": float(m2.group(1)), "reason": cleaned}
    except Exception:
        pass

    return {"score": 0.0, "reason": cleaned}

def call_openai(prompt: str, model: str):
    start = time.time()
    res = openai.ChatCompletion.create(model=model, messages=[{"role":"user","content":prompt}])
    latency = time.time() - start
    text = res.choices[0].message.content
    return text, latency

def call_gemini(prompt: str, model: str):
    start = time.time()
    resp = genai.generate_text(model=model, prompt=prompt)
    latency = time.time() - start
    return resp.text, latency

def score_response(judge_model: str, response: str, reference: str):
    prompt = PROMPT_TEMPLATE.format(
        reference=reference or "",
        response=response or "",
    )
    if judge_model.startswith("gpt") and OPENAI_KEY:
        try:
            text, latency = call_openai(prompt, judge_model)
        except Exception:
            logger.exception("judge call (OpenAI) failed for model=%s", judge_model)
            text, latency = "", 0.0
    elif judge_model.startswith("gemini") and GEMINI_KEY:
        try:
            text, latency = call_gemini(prompt, judge_model)
        except Exception:
            logger.exception("judge call (Gemini) failed for model=%s", judge_model)
            text, latency = "", 0.0
    else:
        ref_set = set((reference or "").lower().split())
        resp_set = set((response or "").lower().split())
        score = len(ref_set & resp_set) / max(1, len(ref_set)) * 100 if ref_set else 50.0
        return float(score), "heuristic overlap", 0.0

    parsed = parse_json_or_fallback(text)
    return float(parsed.get("score", 0.0)), parsed.get("reason", ""), float(latency)
