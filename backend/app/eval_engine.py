import time
import os
import re
from typing import List
from . import models
from .db import SessionLocal
from .crud import create_evaluation_run, complete_evaluation_run
import openai
import google.generativeai as genai
from sqlalchemy.orm import Session
from .judge_chain import score_response
import logging

OPENAI_KEY = os.environ.get("OPENAI_API_KEY")
GEMINI_KEY = os.environ.get("GEMINI_API_KEY")

logger = logging.getLogger(__name__)

if OPENAI_KEY:
    openai.api_key = OPENAI_KEY
if GEMINI_KEY:
    genai.configure(api_key=GEMINI_KEY)

PRICE_PER_1K = {
    # rough estimates (USD per 1k tokens) for cost estimation
    "gpt-4o-mini": 0.03,
    "gpt-4o": 0.06,
    "gpt-4.1": 0.12,
}

def estimate_cost_from_usage(usage: dict, model: str) -> float:
    total = usage.get("total_tokens") if isinstance(usage, dict) else None
    if not total:
        return 0.0
    price = PRICE_PER_1K.get(model, 0.03)
    return float(total) / 1000.0 * price

def sentence_similarity(a: str, b: str) -> float:
    # simple bag-of-words cosine similarity
    if not a or not b:
        return 0.0
    aw = a.lower().split()
    bw = b.lower().split()
    vocab = list(set(aw + bw))
    va = [aw.count(w) for w in vocab]
    vb = [bw.count(w) for w in vocab]
    norm_a = sum(x * x for x in va) ** 0.5
    norm_b = sum(x * x for x in vb) ** 0.5
    if norm_a == 0 or norm_b == 0:
        return 0.0
    dot = sum(x * y for x, y in zip(va, vb))
    return (dot / (norm_a * norm_b)) * 100.0

def rule_based_scores(reference: str, response: str) -> dict:
    ref_tokens = set(reference.lower().split()) if reference else set()
    resp_tokens = set(response.lower().split())
    keyword_overlap = len(ref_tokens & resp_tokens) / max(1, len(ref_tokens)) * 100 if ref_tokens else 0.0
    length_diff = abs(len(response.split()) - (len(reference.split()) if reference else 0))
    length_score = max(0.0, 100 - length_diff)
    similarity = sentence_similarity(reference or "", response or "")
    toxicity = 0.0
    for bad in ["hate", "kill", "stupid", "idiot"]:
        if bad in response.lower():
            toxicity += 50.0
    toxicity_score = max(0.0, 100 - toxicity)
    # unsupported claims detection (simple heuristic): numbers or named tokens in response not in reference
    unsupported = 0.0
    ref_set = set(re.findall(r"\w+", (reference or "").lower()))
    resp_tokens = re.findall(r"\w+", (response or "").lower())
    extra = [t for t in resp_tokens if t not in ref_set]
    if reference:
        unsupported = min(100.0, len(extra) / max(1, len(resp_tokens)) * 100.0)
    missing_context = 0.0
    # missing context: mentions of entities 'who/where/when' without source — heuristic
    if any(q in response.lower() for q in ["according to", "reported", "studies show"]) and not reference:
        missing_context = 80.0
    return {
        "keyword_overlap": keyword_overlap,
        "length": length_score,
        "similarity": similarity,
        "toxicity": toxicity_score,
        "unsupported_claims": 100.0 - unsupported,
        "missing_context": 100.0 - missing_context,
    }

def call_openai_chat(prompt: str, model: str = "gpt-4o-mini") -> dict:
    start = time.time()
    res = openai.ChatCompletion.create(model=model, messages=[{"role":"user","content":prompt}])
    latency = time.time() - start
    content = res.choices[0].message.content
    usage = res.usage if isinstance(res, dict) or hasattr(res, "usage") else {}
    # openai library returns object; handle both
    usage_dict = res.usage if hasattr(res, "usage") else (res.get("usage") if isinstance(res, dict) else {})
    cost = estimate_cost_from_usage(usage_dict or {}, model)
    # estimate tokens roughly if usage missing
    if not usage_dict:
        approx_tokens = int(len(content.split()))
        usage_dict = {"total_tokens": approx_tokens}
        cost = estimate_cost_from_usage(usage_dict, model)
    return {"response": content, "latency": latency, "usage": usage_dict or {}, "cost": cost}

def call_gemini(prompt: str, model: str = "gemini-2.5-mini") -> dict:
    start = time.time()
    resp = genai.generate_text(model=model, prompt=prompt)
    latency = time.time() - start
    content = resp.text
    return {"response": content, "latency": latency, "usage": {}, "cost": 0.0}

def parse_score_from_text(text: str) -> float:
    # try to find a number between 0 and 100
    if not text:
        return 0.0
    m = re.search(r"(\d{1,3}(?:\.\d+)?)", text)
    if not m:
        return 0.0
    try:
        v = float(m.group(1))
        return max(0.0, min(100.0, v))
    except Exception:
        return 0.0

def judge_with_model(judge_model: str, response: str, reference: str):
    try:
        score, reason, latency = score_response(judge_model, response, reference)
        return float(score)
    except Exception:
        logger.exception("judge_with_model failed for model=%s", judge_model)
        # on failure, skip judge rather than returning an arbitrary default
        return None

def aggregate_scores(scores: List[float]) -> dict:
    if not scores:
        return {"mean": 0.0, "median": 0.0, "variance": 0.0, "stddev": 0.0, "count": 0}
    mean = sum(scores) / len(scores)
    sorted_scores = sorted(scores)
    mid = len(scores) // 2
    median = sorted_scores[mid] if len(scores) % 2 == 1 else (sorted_scores[mid - 1] + sorted_scores[mid]) / 2
    variance = sum((x - mean) ** 2 for x in scores) / len(scores)
    stddev = variance ** 0.5
    return {"mean": float(mean), "median": float(median), "variance": float(variance), "stddev": float(stddev), "count": len(scores)}

def render_prompt_template(template: str | None, input_text: str) -> str:
    if not template:
        return input_text
    try:
        return template.format(input=input_text)
    except Exception:
        return template.replace("{input}", input_text)


def run_evaluation(run_id: int):
    db: Session = SessionLocal()
    run = db.query(models.EvaluationRun).filter(models.EvaluationRun.id == run_id).first()
    if not run:
        db.close()
        return
    try:
        run.status = "running"
        db.commit()

        exp = db.query(models.Experiment).filter(models.Experiment.id == run.experiment_id).first()
        if not exp:
            run.status = "failed"
            db.commit()
            return

        ds = db.query(models.Dataset).filter(models.Dataset.id == exp.dataset_id).first()
        if not ds:
            run.status = "failed"
            db.commit()
            return

        samples = db.query(models.DatasetSample).filter(models.DatasetSample.dataset_id == ds.id).limit(50).all()
        scores = []
        for s in samples:
            input_text = s.input or ""
            prompt = render_prompt_template(exp.prompt_template, input_text)
            if exp.eval_model.startswith("gpt") and OPENAI_KEY:
                out = call_openai_chat(prompt, model=exp.eval_model)
            elif exp.eval_model.startswith("gemini") and GEMINI_KEY:
                out = call_gemini(prompt, model=exp.eval_model)
            else:
                out = {"response": "", "latency": 0.0, "usage": {}, "cost": 0.0}

            response = out.get("response", "")
            latency = out.get("latency", 0.0)
            cost = out.get("cost", 0.0)
            reference = s.expected_output or ""
            rb = rule_based_scores(reference, response)
            judge_scores = []
            for jm in (exp.judges or "").split(","):
                jm = jm.strip()
                if not jm or jm == exp.eval_model:
                    continue
                js = judge_with_model(jm, response, reference)
                judge_scores.append(js)
            # filter out failed/None judge results
            valid_judge_scores = [s for s in judge_scores if s is not None]
            judge_part = (sum(valid_judge_scores) / len(valid_judge_scores)) if valid_judge_scores else None
            rule_part_list = [
                rb.get("similarity", 0.0),
                rb.get("keyword_overlap", 0.0),
                rb.get("unsupported_claims", 0.0),
                rb.get("missing_context", 0.0),
                rb.get("toxicity", 0.0),
            ]
            rule_part = sum(rule_part_list) / len(rule_part_list)
            avg_score = float(0.6 * judge_part + 0.4 * rule_part) if judge_part is not None else float(rule_part)
            scores.append(avg_score)

            res = models.EvaluationResult(
                run_id=run.id,
                sample_id=s.id,
                model=exp.eval_model,
                response=response,
                judge_score=avg_score,
                verdict=("pass" if avg_score >= 70 else "fail"),
                latency=latency,
                cost=cost,
            )
            db.add(res)
            db.commit()

            metrics_to_save = {
                "faithfulness": rb.get("similarity", 0.0),
                "relevance": rb.get("keyword_overlap", 0.0),
                "coherence": rb.get("similarity", 0.0),
                "hallucination": 100.0 - rb.get("unsupported_claims", 0.0),
                "toxicity": 100.0 - rb.get("toxicity", 0.0),
                "latency": latency,
                "cost": cost,
            }
            for k, v in metrics_to_save.items():
                ms = models.MetricScore(result_id=res.id, metric=k, score=float(v))
                db.add(ms)
            db.commit()

        agg = aggregate_scores(scores)
        exp.score = agg.get("mean", 0.0)
        exp.status = "completed"
        db.commit()
        complete_evaluation_run(db, run.id)
    except Exception:
        run.status = "failed"
        db.commit()
        raise
    finally:
        db.close()
