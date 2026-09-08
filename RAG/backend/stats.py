"""
Computes the numbers shown in the dashboard's Insights panel directly
from the same CSV files the agents search over (data/<domain>_agent_data/).

Deliberately does NOT go through the LLM agents — this is plain pandas
aggregation, so it's instant and works even before GOOGLE_API_KEY is
configured.
"""

from pathlib import Path
from typing import Any, Dict

import pandas as pd

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

SEMESTER_COLUMNS = [
    "1st Semester CGPA",
    "2nd Semester CGPA",
    "3rd Semester CGPA",
    "4th Semester CGPA",
    "5th Semester CGPA",
    "6th Semester CGPA",
    "7th Semester CGPA",
    "8th Semester CGPA",
]


def _read_csv(domain: str, filename: str) -> pd.DataFrame:
    path = DATA_DIR / f"{domain}_agent_data" / filename
    if not path.exists():
        return pd.DataFrame()
    return pd.read_csv(path)


def compute_stats() -> Dict[str, Any]:
    admission = _read_csv("admission", "admission_data.csv")
    examination = _read_csv("examination", "examination_data.csv")
    attendance = _read_csv("attendance", "attendance_data.csv")
    analytics = _read_csv("analytics", "analytics_data.csv")
    finance = _read_csv("finance", "finance_data.csv")

    # ---------------------------------------------------
    # Enrollment by program
    # ---------------------------------------------------
    programs = []
    if not admission.empty and "Program" in admission.columns:
        counts = admission["Program"].value_counts()
        programs = [
            {"label": _short_program(name), "value": int(count)}
            for name, count in counts.items()
        ]

    # ---------------------------------------------------
    # Average CGPA per semester (across all students who have that column)
    # ---------------------------------------------------
    cgpa_trend = {"labels": [], "values": []}
    if not examination.empty:
        for col in SEMESTER_COLUMNS:
            if col in examination.columns:
                series = pd.to_numeric(examination[col], errors="coerce").dropna()
                if len(series) > 0:
                    cgpa_trend["labels"].append(col.replace(" Semester CGPA", ""))
                    cgpa_trend["values"].append(round(float(series.mean()), 2))

    # ---------------------------------------------------
    # Attendance summary
    # ---------------------------------------------------
    attendance_summary = {
        "average_pct": 0.0,
        "above_75_pct": 0.0,
        "shortage_pct": 0.0,
        "total_records": 0,
    }
    if not attendance.empty and "Attendance Percentage" in attendance.columns:
        pct = pd.to_numeric(attendance["Attendance Percentage"], errors="coerce").dropna()
        total = len(pct)
        if total > 0:
            above_75 = (pct >= 75).sum()
            shortage = total - above_75
            attendance_summary = {
                "average_pct": round(float(pct.mean()), 1),
                "above_75_pct": round(above_75 / total * 100, 1),
                "shortage_pct": round(shortage / total * 100, 1),
                "total_records": int(total),
            }

    # ---------------------------------------------------
    # Risk breakdown (from Analytics agent's data)
    # ---------------------------------------------------
    risk_breakdown = []
    if not analytics.empty and "Risk Level" in analytics.columns:
        counts = analytics["Risk Level"].value_counts()
        order = ["Low", "Medium", "High"]
        risk_breakdown = [
            {"label": level, "value": int(counts.get(level, 0))}
            for level in order
            if level in counts.index
        ]
        # include any risk labels not in the expected order too
        for level, count in counts.items():
            if level not in order:
                risk_breakdown.append({"label": str(level), "value": int(count)})

    # ---------------------------------------------------
    # Finance summary
    # ---------------------------------------------------
    finance_summary = {"collected_pct": 0.0, "total_due": 0}
    if not finance.empty and {"Fee Amount", "Amount Paid", "Due Amount"}.issubset(finance.columns):
        fee = pd.to_numeric(finance["Fee Amount"], errors="coerce").fillna(0)
        paid = pd.to_numeric(finance["Amount Paid"], errors="coerce").fillna(0)
        due = pd.to_numeric(finance["Due Amount"], errors="coerce").fillna(0)
        total_fee = fee.sum()
        finance_summary = {
            "collected_pct": round((paid.sum() / total_fee * 100), 1) if total_fee else 0.0,
            "total_due": int(due.sum()),
        }

    return {
        "enrollment_by_program": programs,
        "cgpa_trend": cgpa_trend,
        "attendance": attendance_summary,
        "risk_breakdown": risk_breakdown,
        "finance": finance_summary,
        "student_count": int(len(admission)) if not admission.empty else 0,
    }


def _short_program(name: str) -> str:
    """'BS Computer Science' -> 'BS CS' so bar labels stay compact."""
    words = str(name).split()
    if len(words) <= 2:
        return name
    head, rest = words[0], words[1:]
    initials = "".join(w[0] for w in rest if w[0].isupper())
    return f"{head} {initials}" if initials else name
