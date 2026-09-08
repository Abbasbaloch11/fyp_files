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
  // Insights panel (real data from /api/stats)
  // ---------------------------------------------------------
  const NS = "http://www.w3.org/2000/svg";
  const COLORS = {
    gold: "#c9a25f",
    teal: "#4f8a7e",
    rose: "#a05a52",
    dim: "#a7a394",
  };
  const RISK_COLOR = { Low: COLORS.teal, Medium: COLORS.gold, High: COLORS.rose };

  function svgEl(tag, attrs) {
    const node = document.createElementNS(NS, tag);
    Object.entries(attrs || {}).forEach(([k, v]) => node.setAttribute(k, v));
    return node;
  }

  async function loadStats() {
    try {
      const res = await fetch(`${API_BASE}/api/stats`);
      if (!res.ok) throw new Error("stats unavailable");
      const stats = await res.json();
      renderStatRow(stats);
      renderEnrollment(stats.enrollment_by_program);
      renderCgpaTrend(stats.cgpa_trend);
      renderAttendance(stats.attendance);
      renderRisk(stats.risk_breakdown);
    } catch (err) {
      document.getElementById("insights").innerHTML =
        '<p class="insights__empty">Insights unavailable — check that the backend is running.</p>';
    }
  }

  function renderStatRow(stats) {
    const row = document.getElementById("statRow");
    const tiles = [
      { value: stats.student_count, label: "Students on file" },
      { value: `${stats.finance.collected_pct}%`, label: "Fees collected" },
    ];
    row.innerHTML = tiles
      .map(
        (t) => `
      <div class="stat-tile">
        <div class="stat-tile__value">${t.value}</div>
        <div class="stat-tile__label">${t.label}</div>
      </div>`
      )
      .join("");
  }

  function renderEnrollment(programs) {
    const host = document.getElementById("chartEnrollment");
    if (!programs || !programs.length) {
      host.innerHTML = '<p class="insights__empty">No admission records</p>';
      return;
    }
    const w = 280, h = 130, padBottom = 20, padTop = 14, barGap = 10;
    const max = Math.max(...programs.map((p) => p.value));
    const barW = (w - barGap * (programs.length - 1)) / programs.length;

    const svg = svgEl("svg", { viewBox: `0 0 ${w} ${h}` });
    programs.forEach((p, i) => {
      const barH = Math.max(4, ((h - padBottom - padTop) * p.value) / max);
      const x = i * (barW + barGap);
      const y = h - padBottom - barH;

      svg.appendChild(
        svgEl("rect", {
          x, y, width: barW, height: barH, rx: 2,
          fill: i % 2 === 0 ? COLORS.teal : COLORS.gold,
          opacity: 0.85,
        })
      );
      const val = svgEl("text", {
        x: x + barW / 2, y: y - 5, "text-anchor": "middle", class: "bar-value",
      });
      val.textContent = p.value;
      svg.appendChild(val);

      const label = svgEl("text", {
        x: x + barW / 2, y: h - 6, "text-anchor": "middle", class: "bar-label",
      });
      label.textContent = p.label;
      svg.appendChild(label);
    });

    host.innerHTML = "";
    host.appendChild(svg);
  }

  function renderCgpaTrend(trend) {
    const host = document.getElementById("chartCgpa");
    if (!trend || !trend.values || !trend.values.length) {
      host.innerHTML = '<p class="insights__empty">No examination records</p>';
      return;
    }
    const w = 280, h = 130, padX = 10, padTop = 14, padBottom = 20;
    const min = Math.min(...trend.values) - 0.15;
    const max = Math.max(...trend.values) + 0.15;
    const innerW = w - padX * 2;
    const innerH = h - padTop - padBottom;
    const stepX = innerW / (trend.values.length - 1 || 1);

    const points = trend.values.map((v, i) => {
      const x = padX + stepX * i;
      const y = padTop + innerH - ((v - min) / (max - min)) * innerH;
      return [x, y];
    });

    const linePath = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`).join(" ");
    const areaPath =
      `M${points[0][0]},${padTop + innerH} ` +
      points.map(([x, y]) => `L${x},${y}`).join(" ") +
      ` L${points[points.length - 1][0]},${padTop + innerH} Z`;

    const svg = svgEl("svg", { viewBox: `0 0 ${w} ${h}` });

    const gradId = "cgpaGrad";
    const defs = svgEl("defs", {});
    const grad = svgEl("linearGradient", { id: gradId, x1: 0, y1: 0, x2: 0, y2: 1 });
    grad.appendChild(svgEl("stop", { offset: "0%", "stop-color": COLORS.teal, "stop-opacity": 0.35 }));
    grad.appendChild(svgEl("stop", { offset: "100%", "stop-color": COLORS.teal, "stop-opacity": 0 }));
    defs.appendChild(grad);
    svg.appendChild(defs);

    svg.appendChild(svgEl("path", { d: areaPath, fill: `url(#${gradId})` }));
    svg.appendChild(svgEl("path", { d: linePath, fill: "none", stroke: COLORS.teal, "stroke-width": 1.8 }));

    points.forEach(([x, y], i) => {
      svg.appendChild(svgEl("circle", { cx: x, cy: y, r: 2.2, fill: COLORS.gold }));
      const label = svgEl("text", {
        x, y: h - 6, "text-anchor": "middle", class: "bar-label",
      });
      label.textContent = trend.labels[i];
      svg.appendChild(label);
    });

    host.innerHTML = "";
    host.appendChild(svg);
  }

  function renderAttendance(att) {
    const host = document.getElementById("chartAttendance");
    if (!att || !att.total_records) {
      host.innerHTML = '<p class="insights__empty">No attendance records</p>';
      return;
    }
    const gauges = [
      { value: att.average_pct, label: "Average", color: COLORS.teal },
      { value: att.above_75_pct, label: "≥ 75% mark", color: COLORS.gold },
      { value: att.shortage_pct, label: "In shortage", color: COLORS.rose },
    ];

    host.innerHTML = "";
    gauges.forEach((g) => {
      const size = 78, r = 30, stroke = 6;
      const c = 2 * Math.PI * r;
      const offset = c - (Math.min(g.value, 100) / 100) * c;

      const svg = svgEl("svg", { viewBox: `0 0 ${size} ${size}`, width: size, height: size });
      svg.appendChild(
        svgEl("circle", {
          cx: size / 2, cy: size / 2, r, fill: "none",
          stroke: "rgba(231,227,216,0.12)", "stroke-width": stroke,
        })
      );
      const arc = svgEl("circle", {
        cx: size / 2, cy: size / 2, r, fill: "none",
        stroke: g.color, "stroke-width": stroke, "stroke-linecap": "round",
        "stroke-dasharray": c, "stroke-dashoffset": offset,
        transform: `rotate(-90 ${size / 2} ${size / 2})`,
      });
      svg.appendChild(arc);

      const text = svgEl("text", {
        x: size / 2, y: size / 2 + 4, "text-anchor": "middle", class: "gauge__value",
      });
      text.textContent = `${g.value}%`;
      svg.appendChild(text);

      const wrap = document.createElement("div");
      wrap.className = "gauge";
      wrap.appendChild(svg);
      const label = document.createElement("span");
      label.className = "gauge__label";
      label.textContent = g.label;
      wrap.appendChild(label);
      host.appendChild(wrap);
    });
  }

  function renderRisk(breakdown) {
    const host = document.getElementById("chartRisk");
    if (!breakdown || !breakdown.length) {
      host.innerHTML = '<p class="insights__empty">No analytics records</p>';
      return;
    }
    const total = breakdown.reduce((sum, b) => sum + b.value, 0);
    const size = 130, r = 42, stroke = 14;
    const c = 2 * Math.PI * r;
    let offsetAcc = 0;

    const svg = svgEl("svg", { viewBox: `0 0 ${size} ${size}`, width: size, height: size });
    svg.appendChild(
      svgEl("circle", {
        cx: size / 2, cy: size / 2, r, fill: "none",
        stroke: "rgba(231,227,216,0.10)", "stroke-width": stroke,
      })
    );

    breakdown.forEach((b) => {
      const frac = total ? b.value / total : 0;
      const dash = frac * c;
      const circle = svgEl("circle", {
        cx: size / 2, cy: size / 2, r, fill: "none",
        stroke: RISK_COLOR[b.label] || COLORS.dim, "stroke-width": stroke,
        "stroke-dasharray": `${dash} ${c - dash}`,
        "stroke-dashoffset": -offsetAcc,
        transform: `rotate(-90 ${size / 2} ${size / 2})`,
      });
      svg.appendChild(circle);
      offsetAcc += dash;
    });

    const label = svgEl("text", {
      x: size / 2, y: size / 2 - 3, "text-anchor": "middle", class: "gauge__value",
    });
    label.textContent = total;
    svg.appendChild(label);
    const sub = svgEl("text", {
      x: size / 2, y: size / 2 + 12, "text-anchor": "middle", class: "bar-label",
    });
    sub.textContent = "students";
    svg.appendChild(sub);

    host.innerHTML = "";
    host.appendChild(svg);

    const legend = document.createElement("div");
    legend.className = "legend";
    breakdown.forEach((b) => {
      const item = document.createElement("span");
      item.className = "legend__item";
      item.innerHTML = `<span class="legend__dot" style="background:${RISK_COLOR[b.label] || COLORS.dim}"></span>${b.label} (${b.value})`;
      legend.appendChild(item);
    });
    host.parentElement.appendChild(legend);
  }

  // ---------------------------------------------------------
  // Init
  // ---------------------------------------------------------
  loadAgents();
  loadStats();
})();
