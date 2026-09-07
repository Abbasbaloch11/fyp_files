# Registrar Desk — University Multi-Agent RAG System

A Supervisor agent routes questions to six specialist agents (Admission,
Examination, Attendance, Finance, Admin, Analytics), each backed by its
own FAISS index over `data/<domain>_agent_data/`. This adds a FastAPI
backend and a browser frontend on top of your existing agent code — no
changes to your RAG logic itself.

## What changed / was added

**Fixed (bugs in the uploaded project):**
- `main_agent.py.py` and `multi_agents.py.py` had a double `.py.py`
  extension, which meant `from multi_agents import ...` could never
  actually work. Renamed to `main_agent.py` / `multi_agents.py`.
- `test_single_agent.py` imported `from src.utils import extract_text`,
  but `src/utils.py` didn't exist in the project — added it.
- Both agent files now use `extract_text()` when reading
  `result["messages"][-1].content`, since LangChain/Gemini responses can
  return either a plain string or a list of content blocks; calling
  `.content` directly on a list would previously crash the UI layer.

**Added (new):**
- `backend/api.py` — FastAPI server exposing `/api/agents` and
  `/api/chat`, and serving the frontend.
- `frontend/` — a plain HTML/CSS/JS chat UI (no build step required).
- `requirements.txt` — consolidated dependency list (none existed
  before).

## Project layout

```
RAG/
├── backend/
│   └── api.py          # FastAPI app: /api/agents, /api/chat, serves frontend/
├── frontend/
│   ├── index.html
│   ├── style.css
│   └── script.js
├── src/
│   ├── data_loader.py
│   ├── embedding.py
│   ├── vectorstore.py
│   ├── search.py
│   └── utils.py         # NEW: extract_text() helper
├── data/                 # unchanged
├── faiss_store/          # unchanged
├── faiss_store_agents/   # unchanged
├── main_agent.py         # renamed, Supervisor agent
├── multi_agents.py       # renamed, 6 domain agents
├── requirements.txt      # NEW
└── .env                  # your GOOGLE_API_KEY
```

## Run it

```bash
cd RAG
pip install -r requirements.txt

# make sure .env has:
# GOOGLE_API_KEY=your_key_here

uvicorn backend.api:app --reload --port 8000
```

Open **http://localhost:8000** — the frontend is served directly by the
same server (no separate frontend process, no CORS issues).

## How the API works

`POST /api/chat`
```json
{
  "message": "What is the CGPA of Zain Hassan?",
  "history": [{"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}],
  "agent": "auto"
}
```
- `agent: "auto"` (or omitted) → goes through the **Supervisor**, which
  decides which specialist(s) to call — exactly like `main_agent.py`
  does today.
- `agent: "examination"` (or `admission`/`attendance`/`finance`/`admin`/
  `analytics`) → talks to that one domain agent directly, bypassing the
  Supervisor's routing call (fewer Gemini calls, useful for testing —
  same idea as `test_single_agent.py`).
- `history` is optional; the frontend sends the full visible thread each
  turn so the agent has conversational context.

Response:
```json
{ "response": "...", "agent_used": "examination", "latency_ms": 812 }
```

## Frontend design notes

The UI is framed as a "registrar's desk": a directory of specialist
desks on the left (each with a two-letter mark instead of a generic
icon), and a correspondence thread on the right showing which desk
answered. Palette is ink-navy / aged-paper / brass, set in Newsreader
(serif, headings) and IBM Plex Sans/Mono (body/data) — meant to feel
like an institutional records system rather than a generic chat widget.

Everything is vanilla HTML/CSS/JS so you can drop it into any static
host, or keep it served by FastAPI as configured.

## Known limitations carried over from the original project

- Each agent call still costs multiple Gemini calls internally (routing
  decision + tool call + final answer), same as noted in
  `test_single_agent.py`. Watch your free-tier quota.
- `search.py`'s structured search loads only the **first** CSV file in
  each domain's data folder (`csv_files[0]`) — fine while each domain
  has one CSV, but worth knowing if you add more.
