from fastapi import FastAPI, UploadFile, File, Form, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from .db import init_db, SessionLocal
from . import crud, models
from .schemas import DatasetOut, ExperimentOut, ExperimentCreate, EvaluationRunOut
import shutil
import os
from .eval_engine import run_evaluation

app = FastAPI(title="EvalKit Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

@app.on_event("startup")
def startup():
    init_db()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.post("/datasets/upload", response_model=DatasetOut)
async def upload_dataset(name: str = Form(...), file: UploadFile = File(...)):
    # save file
    dest = os.path.join(UPLOAD_DIR, file.filename)
    with open(dest, "wb") as out:
        shutil.copyfileobj(file.file, out)
    db = SessionLocal()
    ds = crud.create_dataset(db, name=name, file_name=file.filename, rows=0)
    # attempt to ingest samples from the uploaded file
    try:
        inserted = crud.ingest_dataset_samples(db, ds.id, dest)
        # update row count
        ds.rows = inserted
        db.add(ds)
        db.commit()
        db.refresh(ds)
    except ValueError as e:
        # validation error from ingestion -> return 400 with message
        db.close()
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        # ingestion failures should not block upload; leave rows as 0
        pass
    db.close()
    return ds

@app.get("/datasets")
def list_datasets():
    db = SessionLocal()
    ds = crud.get_datasets(db)
    db.close()
    return ds

@app.delete("/datasets/{dataset_id}")
def delete_dataset(dataset_id: int):
    db = SessionLocal()
    ds = crud.delete_dataset(db, dataset_id)
    db.close()
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found")
    return {"ok": True}

@app.get("/experiments")
def get_experiments():
    db = SessionLocal()
    exps = crud.list_experiments(db)
    db.close()
    return exps


@app.get("/evaluation/{run_id}")
def get_evaluation(run_id: int):
    db = SessionLocal()
    run = db.query(models.EvaluationRun).filter(models.EvaluationRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    results = db.query(models.EvaluationResult).filter(models.EvaluationResult.run_id == run_id).all()
    db.close()
    return {"run": {"id": run.id, "status": run.status, "started_at": run.started_at, "completed_at": run.completed_at}, "results": [{"id": r.id, "sample_id": r.sample_id, "model": r.model, "judge_score": r.judge_score, "verdict": r.verdict, "latency": r.latency} for r in results]}


@app.get("/metrics")
def metrics():
    return ["faithfulness", "relevance", "coherence", "hallucination", "toxicity", "latency", "cost"]

@app.post("/evaluation/run", response_model=EvaluationRunOut)
def start_evaluation(experiment: ExperimentCreate, background_tasks: BackgroundTasks):
    db = SessionLocal()
    exp = crud.create_experiment(db, experiment)
    run = crud.create_evaluation_run(db, exp.id)
    db.close()
    background_tasks.add_task(run_evaluation, run.id)
    return run

@app.get("/dashboard")
def dashboard():
    db = SessionLocal()
    # basic stats
    datasets = crud.get_datasets(db)
    exps = crud.list_experiments(db)
    # recent results
    results = db.query(models.EvaluationResult).order_by(models.EvaluationResult.id.desc()).limit(50).all()
    # aggregate score over runs (group by run id)
    runs = db.query(models.EvaluationRun).order_by(models.EvaluationRun.id.desc()).limit(20).all()
    score_over_runs = []
    for i, r in enumerate(reversed(runs)):
        res = db.query(models.EvaluationResult).filter(models.EvaluationResult.run_id == r.id).all()
        avg = sum([rr.judge_score for rr in res]) / max(1, len(res))
        score_over_runs.append({"run": f"Run {i+1}", "score": avg})

    # criteria scores: compute mean per metric across recent results
    metrics = ["faithfulness", "relevance", "coherence", "hallucination", "toxicity"]
    criteria_scores = []
    for m in metrics:
        vals = [ms.score for ms in db.query(models.MetricScore).filter(models.MetricScore.metric == m).all()]
        criteria_scores.append({"criterion": m, "value": (sum(vals) / max(1, len(vals))) if vals else 0})

    out_results = []
    for r in results:
        sample = db.query(models.DatasetSample).filter(models.DatasetSample.id == r.sample_id).first()
        out_results.append({"id": r.id, "prompt": sample.input if sample else None, "model": r.model, "judge_score": r.judge_score, "verdict": r.verdict, "latency": r.latency})

    db.close()
    return {"datasets": len(datasets), "experiments": len(exps), "results": out_results, "score_over_runs": score_over_runs, "criteria_scores": criteria_scores }
