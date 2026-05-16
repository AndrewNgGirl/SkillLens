from pydantic import BaseModel
from typing import List, Literal

class ReviewReport(BaseModel):
    comments: List[str]
    severity: Literal["low", "medium", "high"]
    suggestions: List[str] = []

class DigestReport(BaseModel):
    title: str
    bullets: List[str]
