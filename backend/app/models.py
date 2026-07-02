from sqlalchemy import Column, Integer, String, DateTime, Float, ForeignKey, Text
from sqlalchemy.orm import relationship
from .db import Base
import datetime

class Dataset(Base):
    __tablename__ = "datasets"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    file_name = Column(String, nullable=False)
    rows = Column(Integer, default=0)
    uploaded_at = Column(DateTime, default=datetime.datetime.utcnow)
    samples = relationship("DatasetSample", back_populates="dataset")

class DatasetSample(Base):
    __tablename__ = "dataset_samples"
    id = Column(Integer, primary_key=True, index=True)
    dataset_id = Column(Integer, ForeignKey("datasets.id"), nullable=False)
    input = Column(Text, nullable=False)
    expected_output = Column(Text, nullable=True)
    context = Column(Text, nullable=True)
    task_type = Column(String, nullable=True)
    sample_metadata = Column("metadata", Text, nullable=True)
    dataset = relationship("Dataset", back_populates="samples")

class ModelConfiguration(Base):
    __tablename__ = "model_configurations"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    provider = Column(String, nullable=False)
    model = Column(String, nullable=False)
    params = Column(Text, nullable=True)

class Experiment(Base):
    __tablename__ = "experiments"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    dataset_id = Column(Integer, ForeignKey("datasets.id"))
    prompt_template = Column(Text)
    eval_model = Column(String)
    judges = Column(Text)
    status = Column(String, default="running")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    score = Column(Float, default=0.0)

class EvaluationRun(Base):
    __tablename__ = "evaluation_runs"
    id = Column(Integer, primary_key=True, index=True)
    experiment_id = Column(Integer, ForeignKey("experiments.id"))
    started_at = Column(DateTime, default=datetime.datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    status = Column(String, default="running")

class EvaluationResult(Base):
    __tablename__ = "evaluation_results"
    id = Column(Integer, primary_key=True, index=True)
    run_id = Column(Integer, ForeignKey("evaluation_runs.id"))
    sample_id = Column(Integer, ForeignKey("dataset_samples.id"))
    model = Column(String)
    response = Column(Text)
    judge_score = Column(Float)
    verdict = Column(String)
    latency = Column(Float)
    cost = Column(Float, default=0.0)

class MetricScore(Base):
    __tablename__ = "metric_scores"
    id = Column(Integer, primary_key=True, index=True)
    result_id = Column(Integer, ForeignKey("evaluation_results.id"))
    metric = Column(String)
    score = Column(Float)
