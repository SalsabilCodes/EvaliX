from sqlalchemy.orm import Session
from . import models
from .schemas import DatasetCreate, ExperimentCreate
import datetime
import json
import os
import csv
from typing import Optional, Any
from .models import DatasetSample

def create_dataset(db: Session, name: str, file_name: str, rows: int = 0):
    ds = models.Dataset(name=name, file_name=file_name, rows=rows, uploaded_at=datetime.datetime.utcnow())
    db.add(ds)
    db.commit()
    db.refresh(ds)
    return ds

def get_datasets(db: Session):
    return db.query(models.Dataset).order_by(models.Dataset.uploaded_at.desc()).all()

def get_dataset(db: Session, dataset_id: int):
    return db.query(models.Dataset).filter(models.Dataset.id == dataset_id).first()

def delete_dataset(db: Session, dataset_id: int):
    ds = get_dataset(db, dataset_id)
    if ds:
        db.delete(ds)
        db.commit()
    return ds

def create_experiment(db: Session, exp: ExperimentCreate):
    e = models.Experiment(
        name=exp.name,
        dataset_id=exp.dataset_id,
        prompt_template=exp.prompt_template,
        judges=",".join(exp.judges),
        eval_model=exp.eval_model,
        status="running",
        created_at=datetime.datetime.utcnow(),
    )
    db.add(e)
    db.commit()
    db.refresh(e)
    return e

def list_experiments(db: Session):
    return db.query(models.Experiment).order_by(models.Experiment.created_at.desc()).all()

def create_evaluation_run(db: Session, experiment_id: int):
    run = models.EvaluationRun(experiment_id=experiment_id, started_at=datetime.datetime.utcnow(), status="running")
    db.add(run)
    db.commit()
    db.refresh(run)
    return run

def complete_evaluation_run(db: Session, run_id: int):
    run = db.query(models.EvaluationRun).filter(models.EvaluationRun.id == run_id).first()
    if run:
        run.status = "completed"
        run.completed_at = datetime.datetime.utcnow()
        db.commit()
        db.refresh(run)
    return run


def ingest_dataset_samples(db: Session, dataset_id: int, file_path: str) -> int:
    """Parse CSV / JSON / JSONL files and insert DatasetSample rows.

    The function attempts to detect common field names for `input` and `target`.
    Returns the number of rows inserted.
    """
    inserted = 0
    _, ext = os.path.splitext(file_path.lower())

    def extract_fields(obj: dict) -> tuple[str, Optional[str], dict]:
        # heuristics for input/prompt and target/response
        input_keys = [k for k in obj.keys() if k.lower() in ("input", "prompt", "instruction", "question", "text")]
        target_keys = [k for k in obj.keys() if k.lower() in ("target", "output", "response", "label", "answer")]
        inp = obj.get(input_keys[0]) if input_keys else None
        tgt = obj.get(target_keys[0]) if target_keys else None
        return inp, tgt, obj

    samples = []
    try:
        if ext in (".csv", ".tsv"):
            delimiter = "," if ext == ".csv" else "\t"
            with open(file_path, "r", encoding="utf-8", newline="") as fh:
                reader = csv.DictReader(fh, delimiter=delimiter)
                # validate presence of at least one input-like column in header
                headers = [h.lower() for h in (reader.fieldnames or [])]
                if not any(h in headers for h in ("input", "prompt", "instruction", "question", "text")):
                    raise ValueError("Invalid dataset: missing required column 'input' (or equivalent: prompt/instruction/question/text)")
                for obj in reader:
                    inp, tgt, meta = extract_fields(obj)
                    samples.append((inp, tgt, json.dumps(meta)))
        elif ext == ".jsonl":
            with open(file_path, "r", encoding="utf-8") as fh:
                for line in fh:
                    if not line.strip():
                        continue
                    obj = json.loads(line)
                    inp, tgt, meta = extract_fields(obj if isinstance(obj, dict) else {"data": obj})
                    samples.append((inp, tgt, json.dumps(meta)))
        elif ext == ".json":
            with open(file_path, "r", encoding="utf-8") as fh:
                data = json.load(fh)
                # if it's a list of examples
                if isinstance(data, list):
                    # ensure at least one entry has an input-like field
                    found_input = False
                    for obj in data:
                        if not isinstance(obj, dict):
                            obj = {"value": obj}
                        inp, tgt, meta = extract_fields(obj)
                        if inp is not None:
                            found_input = True
                        samples.append((inp, tgt, json.dumps(meta)))
                    if not found_input:
                        raise ValueError("Invalid dataset: JSON list contains no entries with an 'input' field (or equivalent)")
                elif isinstance(data, dict):
                    # if top-level object has a 'data' or 'examples' key
                    list_like = None
                    for k in ("data", "examples", "items"):
                        if k in data and isinstance(data[k], list):
                            list_like = data[k]
                            break
                    if list_like is None:
                        # single object
                        inp, tgt, meta = extract_fields(data)
                        if inp is None:
                            raise ValueError("Invalid dataset: JSON object does not contain an 'input' field (or equivalent)")
                        samples.append((inp, tgt, json.dumps(meta)))
                    else:
                        found_input = False
                        for obj in list_like:
                            if not isinstance(obj, dict):
                                obj = {"value": obj}
                            inp, tgt, meta = extract_fields(obj)
                            if inp is not None:
                                found_input = True
                            samples.append((inp, tgt, json.dumps(meta)))
                        if not found_input:
                            raise ValueError("Invalid dataset: JSON list under 'data/examples/items' contains no 'input' fields")
        else:
            # unknown extension - attempt JSONL then CSV
            with open(file_path, "r", encoding="utf-8", newline="") as fh:
                lines = [line for line in fh if line.strip()]
            if lines:
                try:
                    for line in lines:
                        obj = json.loads(line)
                        inp, tgt, meta = extract_fields(obj if isinstance(obj, dict) else {"value": obj})
                        samples.append((inp, tgt, json.dumps(meta)))
                except json.JSONDecodeError:
                    delimiter = ","
                    if "\t" in lines[0] and len(lines[0].split("\t")) > 1:
                        delimiter = "\t"
                    reader = csv.DictReader(lines, delimiter=delimiter)
                    for obj in reader:
                        inp, tgt, meta = extract_fields(obj)
                        samples.append((inp, tgt, json.dumps(meta)))
    except ValueError:
        # bubble up validation errors to caller
        raise
    except Exception:
        # other parsing failures
        raise ValueError("Failed to parse uploaded dataset file; ensure it's valid CSV, JSON, or JSONL")

    # if no samples extracted, signal invalid dataset
    if not samples:
        raise ValueError("No valid samples found in uploaded dataset")

    # bulk insert
    for inp, tgt, meta in samples:
        s = DatasetSample(
            dataset_id=dataset_id,
            input=(None if inp is None else str(inp)),
            expected_output=(None if tgt is None else str(tgt)),
            context=(meta.get("context") if isinstance(meta, dict) else None),
            task_type=(meta.get("task_type") if isinstance(meta, dict) else None),
            sample_metadata=(json.dumps(meta) if isinstance(meta, dict) else (meta if meta else None)),
        )
        db.add(s)
        inserted += 1
    db.commit()
    return inserted
