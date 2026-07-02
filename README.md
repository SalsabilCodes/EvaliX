# Evalix — LLM Evaluation Platform

Evalix is an LLM evaluation platform built for AI engineers, ML engineers, and product teams to benchmark, compare, and analyze large language models on structured evaluation datasets.

## Overview

Evalix provides:

- dataset upload and management
- automated evaluation pipelines
- multi-model benchmarking
- rule-based and judge-driven metrics
- result persistence and dashboard reporting
- support for QA, summarization, RAG, and instruction-following tasks

This repository contains:

- `backend/` — Python FastAPI backend, SQLite persistence, evaluation engine
- `src/` — React + TypeScript frontend dashboard and user flow

## Project Goals

Evalix is designed to answer:

- Which model or prompt performs best?
- How grounded and faithful are model outputs?
- How do cost, latency, and quality trade off?
- How can teams iterate on prompts and datasets?

## Key Features

- Dataset upload (CSV / JSON / JSONL)
- Dataset schema validation
- Evaluation experiment creation
- Batch evaluation runs against multiple LLMs
- Rule-based scoring and judge-based scoring
- Aggregate metrics and dashboards
- Persistence with SQLite

## Architecture

Evalix follows this flow:

1. Dataset ingestion
2. Experiment configuration
3. Inference with selected LLMs
4. Metric scoring
5. Result storage
6. Dashboard reporting

## Dataset Schema

Each row in the dataset should map to the following sample schema:

| Field | Description |
|---|---|
| `id` | Unique identifier |
| `input` | Prompt or query |
| `expected_output` | Reference answer (optional) |
| `context` | Supporting context for RAG tasks |
| `task_type` | QA / summarization / etc. |
| `metadata` | Extra tags, difficulty, or labels |

The backend stores per-sample metadata and extracts the required fields automatically from uploaded files.

## Getting Started

### Prerequisites

- Node.js
- pnpm (or npm/yarn)
- Python 3.11+
- `.env` with required API keys

### Required environment variables

Create a local `.env` file with:

```env
OPENAI_API_KEY=<your-openai-key>
GEMINI_API_KEY=<your-gemini-key>
```

Do not commit `.env`. Use `.env.example` as the template.

### Install dependencies

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r backend/requirements.txt
pnpm install
```

### Run backend

```bash
.venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
```

### Run frontend

```bash
pnpm dev --host 127.0.0.1 --port 5173
```

The frontend expects the backend at `http://localhost:8000`.

## API Endpoints

- `POST /datasets/upload`
  - Upload a dataset file with form fields: `name`, `file`
- `GET /datasets`
  - List uploaded datasets
- `DELETE /datasets/{id}`
  - Delete a dataset
- `GET /experiments`
  - List evaluation experiments
- `POST /evaluation/run`
  - Start an evaluation run with JSON body: `name`, `dataset_id`, `prompt_template`, `judges`, `eval_model`
- `GET /dashboard`
  - Retrieve dashboard statistics and recent results

## Backend Structure

- `backend/app/main.py` — API routes and upload handling
- `backend/app/db.py` — SQLite engine and session management
- `backend/app/models.py` — SQLAlchemy models for datasets, samples, experiments, and results
- `backend/app/crud.py` — persistence and ingestion logic
- `backend/app/eval_engine.py` — evaluation orchestration and scoring
- `backend/app/judge_chain.py` — judge prompt generation and model scoring
- `backend/app/schemas.py` — Pydantic request/response models

## Frontend Structure

- `src/app/App.tsx` — main dashboard and dataset/experiment UI
- `src/app/components/` — reusable UI components
- `src/styles/` — styling and theme files

## Evaluation Metrics

Evalix supports a mix of scoring methods:

- **Faithfulness** — output grounded in reference
- **Relevance** — answer addresses the query
- **Coherence** — logical flow and readability
- **Hallucination** — unsupported or incorrect claims
- **Toxicity** — harmful language
- **Latency** — response time
- **Cost** — token-based cost estimate

The platform combines rule-based scores with judge-model scores when available.

## Typical Workflow

1. Upload an evaluation dataset
2. Create a new experiment with prompt template and judge models
3. Run evaluation
4. Review aggregate scores and per-sample results
5. Iterate on prompts or dataset content

## Notes

- Evalix is evaluation-first, not a full production LLM serving system.
- It is built for benchmarking, metric design, and observability.
- The UI is intentionally lightweight to focus on evaluation workflows.

## Future Improvements

Potential next steps for Evalix:

- model configuration persistence
- dataset and experiment versioning
- RAG-specific evaluation support
- custom metrics plugins
- improved experiment reporting and plots
- fine-tuning feedback loop

## License

Use this project as a starting point for LLM evaluation research and prototype development.
  