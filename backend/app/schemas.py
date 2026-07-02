from pydantic import BaseModel
from typing import List, Optional
import datetime

class DatasetCreate(BaseModel):
    name: str

class DatasetOut(BaseModel):
    id: int
    name: str
    file_name: str
    rows: int
    uploaded_at: datetime.datetime
    class Config:
        orm_mode = True

class ExperimentCreate(BaseModel):
    name: str
    dataset_id: int
    prompt_template: str
    judges: List[str]
    eval_model: str

class ExperimentOut(BaseModel):
    id: int
    name: str
    dataset_id: Optional[int]
    prompt_template: Optional[str]
    eval_model: Optional[str]
    judges: Optional[str]
    status: str
    created_at: datetime.datetime
    score: float
    class Config:
        orm_mode = True

class EvaluationRunOut(BaseModel):
    id: int
    experiment_id: int
    status: str
    started_at: datetime.datetime
    completed_at: Optional[datetime.datetime]
    class Config:
        orm_mode = True
