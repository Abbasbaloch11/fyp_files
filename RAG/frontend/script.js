(() => {
  "use strict";

  const API_BASE = ""; // same-origin (backend serves this file too)

  const el = {
    thread: document.getElementById("thread"),
    emptyState: document.getElementById("emptyState"),
    form: document.getElementById("composerForm"),
    input: document.getElementById("composerInput"),
    sendBtn: document.getElementById("sendBtn"),
    agentList: document.getElementById("agentList"),
    routedVia: document.getElementById("routedVia"),
    clearThread: document.getElementById("clearThread"),
    statusPill: document.getElementById("statusPill"),
    statusText: document.getElementById("statusText"),
  };

  /** @type {{role: "user"|"assistant", content: string}[]} */
  let history = [];
  let activeAgent = "auto";
  let isSending = false;

  const AGENT_LABELS = { supervisor: "Supervisor" };

  // ---------------------------------------------------------
  // Directory
  // ---------------------------------------------------------
  async function loadAgents() {
    try {
      const res = await fetch(`${API_BASE}/api/agents`);
      if (!res.ok) throw new Error("bad status");
      const data = await res.json();

      data.agents.forEach((agent) => {
        AGENT_LABELS[agent.key] = agent.label;

        const row = document.createElement("button");
        row.className = "directory__row";
        row.dataset.agent = agent.key;
        row.innerHTML = `
          <span class="mark">${agent.mark}</span>
          <span class="row-text">
            <span class="row-title">${agent.label}</span>
            <span class="row-desc">${agent.desc}</span>
          </span>
        `;
        row.addEventListener("click", () => selectAgent(agent.key));
        el.agentList.appendChild(row);
      });

      setStatus("ready", "desks online");
    } catch (err) {
      setStatus("error", "directory unavailable");
    }
  }

  function setStatus(state, text) {
    el.statusPill.classList.remove("is-ready", "is-error");
    if (state) el.statusPill.classList.add(`is-${state}`);
    el.statusText.textContent = text;
  }

  function selectAgent(key) {
    activeAgent = key;
    document.querySelectorAll(".directory__row").forEach((row) => {
      row.classList.toggle("is-active", row.dataset.agent === key);
    });
    el.routedVia.textContent =
      key === "auto" ? "Supervisor" : AGENT_LABELS[key] || key;
  }

  document
    .querySelector('[data-agent="auto"]')
    .addEventListener("click", () => selectAgent("auto"));

  // ---------------------------------------------------------
  // Thread rendering
  // ---------------------------------------------------------
  function hideEmptyState() {
    if (el.emptyState) el.emptyState.remove();
  }

  function addMessage({ role, who, text, isError }) {
    hideEmptyState();

    const wrap = document.createElement("div");
    wrap.className = `msg msg--${role}${isError ? " msg--error" : ""}`;

    const time = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    wrap.innerHTML = `
      <div class="msg__meta">
        <span class="who">${who}</span>
        <span>${time}</span>
      </div>
      <div class="msg__body"></div>
    `;
    wrap.querySelector(".msg__body").textContent = text;

    el.thread.appendChild(wrap);
    el.thread.scrollTop = el.thread.scrollHeight;
    return wrap;
  }

  function addThinking(who) {
    hideEmptyState();
    const wrap = document.createElement("div");
    wrap.className = "msg msg--agent";
    wrap.innerHTML = `
      <div class="msg__meta"><span class="who">${who}</span><span>…</span></div>
      <div class="msg__body">
        <div class="thinking"><span></span><span></span><span></span></div>
      </div>
    `;
    el.thread.appendChild(wrap);
    el.thread.scrollTop = el.thread.scrollHeight;
    return wrap;
  }

  // ---------------------------------------------------------
  // Sending
  // ---------------------------------------------------------
  async function sendMessage(text) {
    isSending = true;
    el.sendBtn.disabled = true;

    addMessage({ role: "user", who: "You", text });
    history.push({ role: "user", content: text });

    const thinkingLabel =
      activeAgent === "auto" ? "Supervisor" : AGENT_LABELS[activeAgent] || activeAgent;
    const thinkingEl = addThinking(thinkingLabel);

    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: history.slice(0, -1), // everything before this turn
          agent: activeAgent,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || "The desk could not be reached.");
      }

      thinkingEl.remove();
      const label = AGENT_LABELS[data.agent_used] || data.agent_used;
      addMessage({ role: "agent", who: label, text: data.response });
      history.push({ role: "assistant", content: data.response });
    } catch (err) {
      thinkingEl.remove();
      addMessage({
        role: "agent",
        who: "System",
        text: err.message || "Something went wrong reaching the backend.",
        isError: true,
      });
    } finally {
      isSending = false;
      el.sendBtn.disabled = false;
    }
  }

  // ---------------------------------------------------------
  // Composer events
  // ---------------------------------------------------------
  el.form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = el.input.value.trim();
    if (!text || isSending) return;
    el.input.value = "";
    el.input.style.height = "auto";
    sendMessage(text);
  });

  el.input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      el.form.requestSubmit();
    }
  });

  el.input.addEventListener("input", () => {
    el.input.style.height = "auto";
    el.input.style.height = `${Math.min(el.input.scrollHeight, 160)}px`;
  });

  el.clearThread.addEventListener("click", () => {
    history = [];
    el.thread.innerHTML = `
      <div class="empty-state" id="emptyState">
        <p class="empty-state__title">No correspondence yet</p>
        <p class="empty-state__body">
          Ask about a student's admission, results, attendance, fees, faculty
          record, or risk outlook — the Supervisor will route it, or pick a
          desk from the directory to ask directly.
        </p>
      </div>
    `;
    el.emptyState = document.getElementById("emptyState");
  });

  // ---------------------------------------------------------
  // Init
  // ---------------------------------------------------------
  loadAgents();
})();
