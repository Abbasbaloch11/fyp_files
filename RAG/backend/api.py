"""
FastAPI backend for the University Multi-Agent RAG system.

This wraps the EXISTING agents defined in main_agent.py (the Supervisor)
and multi_agents.py (the six domain specialists) with a small HTTP API,
and serves the static frontend from ../frontend.

Run from the RAG/ project root:

    uvicorn backend.api:app --reload --port 8000

Then open http://localhost:8000 in your browser.
"""

import os
import sys
import time
from pathlib import Path
from typing import List, Optional

# Make the project root (RAG/) importable regardless of where uvicorn
# is launched from, so `import main_agent` / `import multi_agents` works.
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from src.utils import extract_text

# =========================================================
# STATIC AGENT METADATA (for the sidebar / directory UI)
# =========================================================

AGENT_INFO = {
    "admission": {
        "label": "Admission & Registrar",
        "mark": "AD",
        "desc": "Eligibility, enrollment status, academic history",
    },
    "examination": {
        "label": "Examination",
        "mark": "EX",
        "desc": "Results, GPA / CGPA, transcripts",
    },
    "attendance": {
        "label": "Attendance",
        "mark": "AT",
        "desc": "Attendance records and shortage cases",
    },
    "finance": {
        "label": "Finance",
        "mark": "FN",
        "desc": "Fees, challans, dues, payment history",
    },
    "admin": {
        "label": "Admin",
        "mark": "AM",
        "desc": "Faculty records, staff management",
    },
    "analytics": {
        "label": "Analytics",
        "mark": "AN",
        "desc": "Performance prediction, risk analysis",
    },
}

# =========================================================
# APP + AGENTS (lazy-loaded — importing them builds FAISS
# indexes / loads embedding models, which is slow, so we
# only pay that cost once, on first request, not at import
# time / test-collection time)
# =========================================================

app = FastAPI(title="University RAG Multi-Agent API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_supervisor_agent = None
_domain_agents = None
_load_error: Optional[str] = None


def get_agents():
    """Import and cache the agents on first use."""
    global _supervisor_agent, _domain_agents, _load_error

    if _supervisor_agent is not None or _load_error is not None:
        return _supervisor_agent, _domain_agents

    try:
        from main_agent import supervisor_agent
        from multi_agents import AGENTS

        _supervisor_agent = supervisor_agent
        _domain_agents = AGENTS
    except Exception as exc:  # noqa: BLE001 - surface any startup error to the API
        _load_error = str(exc)
        raise

    return _supervisor_agent, _domain_agents


# =========================================================
# SCHEMAS
# =========================================================

class Message(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1)
    history: List[Message] = Field(default_factory=list)
    agent: Optional[str] = None  # None / "auto" -> Supervisor routes it


class ChatResponse(BaseModel):
    response: str
    agent_used: str
    latency_ms: int


# =========================================================
# ROUTES
# =========================================================

@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/agents")
def list_agents():
    return {
        "agents": [
            {"key": key, **info} for key, info in AGENT_INFO.items()
        ]
    }


@app.post("/api/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    message = req.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    try:
        supervisor_agent, domain_agents = get_agents()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=500,
            detail=(
                "Agents failed to initialize. Check that GOOGLE_API_KEY is set "
                f"in your .env file and dependencies are installed. Detail: {exc}"
            ),
        ) from exc

    # Build the full conversation for multi-turn context
    conversation = [{"role": m.role, "content": m.content} for m in req.history]
    conversation.append({"role": "user", "content": message})

    agent_key = (req.agent or "auto").lower()

    if agent_key != "auto" and agent_key in domain_agents:
        target_agent = domain_agents[agent_key]
        agent_used = agent_key
    else:
        target_agent = supervisor_agent
        agent_used = "supervisor"

    start = time.time()

    try:
        result = target_agent.invoke({"messages": conversation})
        answer = extract_text(result["messages"][-1].content)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Agent error: {exc}") from exc

    latency_ms = int((time.time() - start) * 1000)

    return ChatResponse(
        response=answer or "The agent returned no content.",
        agent_used=agent_used,
        latency_ms=latency_ms,
    )


# =========================================================
# SERVE FRONTEND (static SPA)
# =========================================================

FRONTEND_DIR = PROJECT_ROOT / "frontend"
if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
