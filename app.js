const MAX_STEPS = 10;
const MIN_QUBITS = 1;
const MAX_QUBITS = 64;
const MAX_ACTIVE_STATES = 65536;
const MAX_DISPLAY_STATES = 96;
const EPSILON = 1e-12;
const SQRT1_2 = Math.SQRT1_2;

const gateMatrices = {
  H: [
    [c(SQRT1_2, 0), c(SQRT1_2, 0)],
    [c(SQRT1_2, 0), c(-SQRT1_2, 0)],
  ],
  X: [
    [c(0, 0), c(1, 0)],
    [c(1, 0), c(0, 0)],
  ],
  Y: [
    [c(0, 0), c(0, -1)],
    [c(0, 1), c(0, 0)],
  ],
  Z: [
    [c(1, 0), c(0, 0)],
    [c(0, 0), c(-1, 0)],
  ],
  S: [
    [c(1, 0), c(0, 0)],
    [c(0, 0), c(0, 1)],
  ],
  T: [
    [c(1, 0), c(0, 0)],
    [c(0, 0), c(Math.SQRT1_2, Math.SQRT1_2)],
  ],
};

const app = {
  qubits: 3,
  steps: MAX_STEPS,
  selectedGate: "H",
  pendingCnot: null,
  circuit: [],
  state: new Map(),
  shots: {},
  simulationMessage: "",
};

const els = {
  fieldCanvas: document.querySelector("#fieldCanvas"),
  heroAmplitude: document.querySelector("#heroAmplitude"),
  qubitCount: document.querySelector("#qubitCount"),
  qubitInput: document.querySelector("#qubitInput"),
  qubitCountLabel: document.querySelector("#qubitCountLabel"),
  decreaseQubits: document.querySelector("#decreaseQubits"),
  increaseQubits: document.querySelector("#increaseQubits"),
  shotCount: document.querySelector("#shotCount"),
  gateButtons: [...document.querySelectorAll(".gate-button")],
  presetButtons: [...document.querySelectorAll("[data-preset]")],
  runCircuit: document.querySelector("#runCircuit"),
  measureCircuit: document.querySelector("#measureCircuit"),
  clearCircuit: document.querySelector("#clearCircuit"),
  selectionStatus: document.querySelector("#selectionStatus"),
  stateSummary: document.querySelector("#stateSummary"),
  circuitGrid: document.querySelector("#circuitGrid"),
  probabilityChart: document.querySelector("#probabilityChart"),
  dominantState: document.querySelector("#dominantState"),
  blochCanvas: document.querySelector("#blochCanvas"),
  blochVector: document.querySelector("#blochVector"),
  stateVector: document.querySelector("#stateVector"),
  normalization: document.querySelector("#normalization"),
  shotResults: document.querySelector("#shotResults"),
  measurementResult: document.querySelector("#measurementResult"),
  qiskitCode: document.querySelector("#qiskitCode"),
  qiskitStatus: document.querySelector("#qiskitStatus"),
  copyQiskit: document.querySelector("#copyQiskit"),
  downloadQiskit: document.querySelector("#downloadQiskit"),
};

function c(re, im) {
  return { re, im };
}

function add(a, b) {
  return c(a.re + b.re, a.im + b.im);
}

function mul(a, b) {
  return c(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
}

function mag2(a) {
  return a.re * a.re + a.im * a.im;
}

function formatComplex(z) {
  const re = Math.abs(z.re) < 0.0005 ? 0 : z.re;
  const im = Math.abs(z.im) < 0.0005 ? 0 : z.im;
  const sign = im >= 0 ? "+" : "-";
  return `${re.toFixed(3)} ${sign} ${Math.abs(im).toFixed(3)}i`;
}

function toIndex(value) {
  return typeof value === "bigint" ? value : BigInt(value);
}

function indexKey(index) {
  return toIndex(index).toString();
}

function basisLabel(index, qubits = app.qubits) {
  return `|${toIndex(index).toString(2).padStart(qubits, "0")}>`;
}

function bitMaskForQubit(qubit) {
  return 1n << BigInt(app.qubits - qubit - 1);
}

function getAmplitude(state, index) {
  return state.get(indexKey(index)) || c(0, 0);
}

function setAmplitude(state, index, value) {
  const key = indexKey(index);
  if (mag2(value) > EPSILON) state.set(key, value);
  else state.delete(key);
}

function formatDimension() {
  if (app.qubits <= 20) return String(2 ** app.qubits);
  return `2^${app.qubits}`;
}

function blankCircuit() {
  return Array.from({ length: app.steps }, () => []);
}

function resetState() {
  app.state = new Map([["0", c(1, 0)]]);
  app.simulationMessage = "";
}

function buildGrid() {
  els.circuitGrid.innerHTML = "";
  els.circuitGrid.style.gridTemplateColumns = `72px repeat(${app.steps}, 74px)`;
  els.circuitGrid.appendChild(gridLabel(""));

  for (let step = 0; step < app.steps; step += 1) {
    els.circuitGrid.appendChild(gridLabel(String(step + 1), "column-label"));
  }

  for (let q = 0; q < app.qubits; q += 1) {
    els.circuitGrid.appendChild(gridLabel(`q${q}`, "wire-label"));
    for (let step = 0; step < app.steps; step += 1) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "circuit-cell";
      cell.dataset.step = step;
      cell.dataset.qubit = q;
      cell.setAttribute("aria-label", `q${q}, column ${step + 1}`);
      cell.addEventListener("click", () => handleCellClick(step, q));
      els.circuitGrid.appendChild(cell);
    }
  }

  renderCircuit();
}

function gridLabel(text, className = "column-label") {
  const label = document.createElement("div");
  label.className = className;
  label.textContent = text;
  return label;
}

function handleCellClick(step, qubit) {
  if (app.selectedGate === "CNOT") {
    if (!app.pendingCnot || app.pendingCnot.step !== step) {
      app.pendingCnot = { step, control: qubit };
      setStatus(`CNOT control q${qubit}; choose target in column ${step + 1}`);
      renderCircuit();
      return;
    }

    if (app.pendingCnot.control === qubit) {
      app.pendingCnot = null;
      setStatus("CNOT cancelled");
      renderCircuit();
      return;
    }

    app.circuit[step] = app.circuit[step].filter((gate) => gate.type !== "CNOT");
    app.circuit[step].push({ type: "CNOT", control: app.pendingCnot.control, target: qubit });
    app.pendingCnot = null;
  } else {
    app.circuit[step] = app.circuit[step].filter((gate) => gate.target !== qubit);
    app.circuit[step].push({ type: app.selectedGate, target: qubit });
  }

  runCircuit();
}

function renderCircuit() {
  document.querySelectorAll(".circuit-cell").forEach((cell) => {
    cell.className = "circuit-cell";
    cell.innerHTML = "";
  });

  app.circuit.forEach((gates, step) => {
    gates.forEach((gate) => {
      if (gate.type === "CNOT") {
        renderCnot(step, gate.control, gate.target);
      } else {
        const cell = getCell(step, gate.target);
        if (!cell) return;
        cell.classList.add("has-gate");
        cell.appendChild(gateChip(gate.type));
      }
    });
  });

  if (app.pendingCnot) {
    const cell = getCell(app.pendingCnot.step, app.pendingCnot.control);
    if (!cell) return;
    cell.classList.add("cnot-control");
    cell.appendChild(gateChip("C"));
  }
}

function renderCnot(step, control, target) {
  const controlCell = getCell(step, control);
  const targetCell = getCell(step, target);
  if (!controlCell || !targetCell) return;
  const top = Math.min(control, target);
  const bottom = Math.max(control, target);

  controlCell.classList.add("cnot-control");
  targetCell.classList.add("cnot-target");
  controlCell.appendChild(gateChip("C"));
  targetCell.appendChild(gateChip("X"));

  const link = document.createElement("span");
  link.className = "cnot-link";
  link.style.top = control < target ? "50%" : `${-((control - target) * 58 - 26)}px`;
  link.style.height = `${(bottom - top) * 58}px`;
  if (control > target) {
    link.style.top = `${-((control - target) * 58) + 26}px`;
  }
  controlCell.appendChild(link);
}

function getCell(step, qubit) {
  return els.circuitGrid.querySelector(`[data-step="${step}"][data-qubit="${qubit}"]`);
}

function gateChip(text) {
  const chip = document.createElement("span");
  chip.className = "gate-chip";
  if (["X", "Y"].includes(text)) chip.classList.add("bit");
  if (["Z", "S", "T"].includes(text)) chip.classList.add("phase");
  chip.textContent = text;
  return chip;
}

function runCircuit() {
  resetState();

  try {
    app.circuit.forEach((gates) => {
      gates.forEach((gate) => {
        if (gate.type === "CNOT") applyCnot(gate.control, gate.target);
        else applySingleGate(gate.type, gate.target);
      });
    });
  } catch (error) {
    app.simulationMessage = error.message;
  }

  app.shots = {};
  renderAll();
}

function applySingleGate(type, qubit) {
  const matrix = gateMatrices[type];
  const bit = bitMaskForQubit(qubit);
  const seen = new Set();
  const next = new Map();

  for (const key of app.state.keys()) {
    const index = BigInt(key);
    const base = index & ~bit;
    const baseKey = indexKey(base);
    if (seen.has(baseKey)) continue;
    seen.add(baseKey);

    const paired = base | bit;
    const a0 = getAmplitude(app.state, base);
    const a1 = getAmplitude(app.state, paired);
    const next0 = add(mul(matrix[0][0], a0), mul(matrix[0][1], a1));
    const next1 = add(mul(matrix[1][0], a0), mul(matrix[1][1], a1));
    setAmplitude(next, base, next0);
    setAmplitude(next, paired, next1);

    if (next.size > MAX_ACTIVE_STATES) {
      throw new Error(`Exact sparse state reached ${next.size.toLocaleString()} active amplitudes. Remove some H gates or export to Qiskit for larger experiments.`);
    }
  }

  app.state = next;
}

function applyCnot(control, target) {
  const controlBit = bitMaskForQubit(control);
  const targetBit = bitMaskForQubit(target);
  const next = new Map();

  for (const [key, amp] of app.state.entries()) {
    const index = BigInt(key);
    const shouldFlip = (index & controlBit) !== 0n;
    const nextIndex = shouldFlip ? index ^ targetBit : index;
    setAmplitude(next, nextIndex, amp);
  }

  app.state = next;
}

function measureCircuit() {
  const shots = clamp(Number(els.shotCount.value) || 512, 32, 4096);
  els.shotCount.value = shots;
  const probabilities = probabilityRows(false);
  const counts = {};

  if (!probabilities.length) {
    renderShots();
    return;
  }

  for (let shot = 0; shot < shots; shot += 1) {
    let roll = Math.random();
    let measured = probabilities[probabilities.length - 1].index;
    for (const row of probabilities) {
      roll -= row.probability;
      if (roll <= 0) {
        measured = row.index;
        break;
      }
    }
    const label = basisLabel(measured);
    counts[label] = (counts[label] || 0) + 1;
  }

  app.shots = counts;
  renderQiskitCode();
  renderShots();
}

function renderAll() {
  renderCircuit();
  renderProbabilityChart();
  renderStateVector();
  renderBloch();
  renderShots();
  renderQiskitCode();
  updateSummary();
}

function probabilityRows(sorted = true) {
  const rows = [...app.state.entries()]
    .map(([key, amp]) => ({ index: BigInt(key), label: basisLabel(key), amplitude: amp, probability: mag2(amp) }))
    .filter((row) => row.probability > EPSILON);

  if (sorted) rows.sort((a, b) => b.probability - a.probability);
  return rows;
}

function renderProbabilityChart() {
  const rows = probabilityRows();
  const displayed = rows.slice(0, MAX_DISPLAY_STATES);

  els.probabilityChart.innerHTML = displayed
    .map(
      (row) => `
        <div class="probability-row">
          <strong>${row.label}</strong>
          <span class="bar-track"><span class="bar-fill" style="width:${(row.probability * 100).toFixed(3)}%"></span></span>
          <span>${(row.probability * 100).toFixed(1)}%</span>
        </div>
      `
    )
    .join("");

  if (rows.length > displayed.length) {
    els.probabilityChart.insertAdjacentHTML(
      "beforeend",
      `<div class="truncated-row">Showing top ${displayed.length} of ${rows.length.toLocaleString()} active basis states</div>`
    );
  }

  const dominant = rows[0] || { label: basisLabel(0n), probability: 1, amplitude: c(1, 0) };
  els.dominantState.textContent = `${dominant.label} ${(dominant.probability * 100).toFixed(1)}%`;
  els.heroAmplitude.textContent = formatComplex(dominant.amplitude);
}

function renderStateVector() {
  let norm = 0;
  const rows = probabilityRows();
  rows.forEach((row) => {
    norm += row.probability;
  });

  const displayed = rows.slice(0, MAX_DISPLAY_STATES);
  els.stateVector.innerHTML = displayed
    .map(
      (row) => `
        <div class="amplitude-row">
          <strong>${row.label}</strong>
          <span>${formatComplex(row.amplitude)}</span>
          <span>${(row.probability * 100).toFixed(1)}%</span>
        </div>
      `
    )
    .join("");

  if (rows.length > displayed.length) {
    els.stateVector.insertAdjacentHTML(
      "beforeend",
      `<div class="truncated-row">Showing top ${displayed.length} of ${rows.length.toLocaleString()} active amplitudes</div>`
    );
  }

  els.normalization.textContent = `norm ${norm.toFixed(3)}`;
}

function renderShots() {
  const entries = Object.entries(app.shots).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, [, count]) => sum + count, 0);

  if (!total) {
    els.measurementResult.textContent = app.simulationMessage ? "limited" : "ready";
    els.shotResults.innerHTML = app.simulationMessage
      ? `<div class="shot-row"><strong>limit</strong><span>${app.simulationMessage}</span><span>--</span></div>`
      : `<div class="shot-row"><strong>--</strong><span>No samples yet</span><span>0</span></div>`;
    return;
  }

  els.measurementResult.textContent = `${total} shots`;
  els.shotResults.innerHTML = entries
    .map(
      ([label, count]) => `
        <div class="shot-row">
          <strong>${label}</strong>
          <span>${((count / total) * 100).toFixed(1)}%</span>
          <span>${count}</span>
        </div>
      `
    )
    .join("");
}

function renderQiskitCode() {
  els.qiskitCode.value = generateQiskitCode();
  els.qiskitStatus.textContent = "ready to copy";
}

function generateQiskitCode() {
  const shots = clamp(Number(els.shotCount.value) || 512, 32, 4096);
  const lines = [
    "from qiskit import QuantumCircuit, transpile",
    "",
    "try:",
    "    from qiskit_aer import AerSimulator",
    "except ImportError:",
    "    AerSimulator = None",
    "",
    `shots = ${shots}`,
    `qc = QuantumCircuit(${app.qubits}, ${app.qubits})`,
    "",
    "# Simulator row q0 maps to Qiskit qubit 0.",
    "# Large qubit counts may require real hardware or specialized simulators.",
  ];

  const gateLines = app.circuit.flatMap((gates, step) =>
    gates.map((gate) => qiskitGateLine(gate, step)).filter(Boolean)
  );

  if (gateLines.length) {
    lines.push(...gateLines);
  } else {
    lines.push("# Empty circuit: all qubits start in |0>.");
  }

  lines.push(
    "",
    "qc.measure(range(qc.num_qubits), range(qc.num_clbits))",
    "",
    "print(qc.draw(output=\"text\"))",
    "",
    "if AerSimulator is None:",
    "    print(\"Install qiskit-aer to run local shot simulation: pip install qiskit-aer\")",
    "else:",
    "    simulator = AerSimulator()",
    "    compiled = transpile(qc, simulator)",
    "    result = simulator.run(compiled, shots=shots).result()",
    "    print(result.get_counts())",
    ""
  );

  return lines.join("\n");
}

function qiskitGateLine(gate, step) {
  const note = `  # column ${step + 1}`;
  const methodByGate = {
    H: "h",
    X: "x",
    Y: "y",
    Z: "z",
    S: "s",
    T: "t",
  };

  if (gate.type === "CNOT") {
    return `qc.cx(${gate.control}, ${gate.target})${note}`;
  }

  const method = methodByGate[gate.type];
  if (!method) return "";
  return `qc.${method}(${gate.target})${note}`;
}

async function copyQiskitCode() {
  const code = els.qiskitCode.value;

  try {
    await navigator.clipboard.writeText(code);
    els.qiskitStatus.textContent = "copied";
  } catch {
    els.qiskitCode.focus();
    els.qiskitCode.select();
    document.execCommand("copy");
    els.qiskitStatus.textContent = "copied";
  }

  els.qiskitCode.setSelectionRange(0, 0);
  els.copyQiskit.focus();
}

function downloadQiskitCode() {
  const blob = new Blob([els.qiskitCode.value], { type: "text/x-python" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "quantum_circuit_qiskit.py";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  els.qiskitStatus.textContent = "downloaded";
}

function renderBloch() {
  const canvas = els.blochCanvas;
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);

  const vector = blochForQubit(0);
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.34;

  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(169, 193, 192, 0.28)";
  ctx.beginPath();
  ctx.ellipse(cx, cy, radius, radius * 0.42, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  drawAxis(ctx, cx, cy, cx + radius * 1.18, cy, "x", "#5dc4ff");
  drawAxis(ctx, cx, cy, cx, cy - radius * 1.18, "z", "#5ee1a2");
  drawAxis(ctx, cx, cy, cx - radius * 0.72, cy + radius * 0.52, "y", "#ff6fae");

  const px = cx + vector.x * radius + vector.y * -radius * 0.42;
  const py = cy - vector.z * radius + vector.y * radius * 0.3;
  ctx.strokeStyle = "#ffd166";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(px, py);
  ctx.stroke();

  ctx.fillStyle = "#ffd166";
  ctx.beginPath();
  ctx.arc(px, py, 8, 0, Math.PI * 2);
  ctx.fill();

  els.blochVector.textContent = `x ${vector.x.toFixed(2)}, y ${vector.y.toFixed(2)}, z ${vector.z.toFixed(2)}`;
}

function drawAxis(ctx, x1, y1, x2, y2, label, color) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.font = "700 15px JetBrains Mono";
  ctx.fillText(label, x2 + 8, y2 + 4);
}

function blochForQubit(qubit) {
  const bit = bitMaskForQubit(qubit);
  const seen = new Set();
  let rho00 = 0;
  let rho11 = 0;
  let rho01 = c(0, 0);

  for (const key of app.state.keys()) {
    const index = BigInt(key);
    const base = index & ~bit;
    const baseKey = indexKey(base);
    if (seen.has(baseKey)) continue;
    seen.add(baseKey);

    const paired = base | bit;
    const a0 = getAmplitude(app.state, base);
    const a1 = getAmplitude(app.state, paired);
    rho00 += mag2(a0);
    rho11 += mag2(a1);
    rho01 = add(rho01, mul(a0, c(a1.re, -a1.im)));
  }

  return {
    x: clamp(2 * rho01.re, -1, 1),
    y: clamp(-2 * rho01.im, -1, 1),
    z: clamp(rho00 - rho11, -1, 1),
  };
}

function updateSummary() {
  els.qubitCount.value = app.qubits;
  els.qubitInput.value = app.qubits;
  els.qubitCountLabel.textContent = app.qubits;
  const active = app.state.size.toLocaleString();
  const dimension = formatDimension();
  els.stateSummary.textContent = app.simulationMessage
    ? `Limited at ${active} active amplitudes out of ${dimension}`
    : `Sparse state: ${active} active amplitudes out of ${dimension}`;
  if (!app.pendingCnot) setStatus(app.simulationMessage || `Selected gate: ${app.selectedGate}`);
}

function setStatus(text) {
  els.selectionStatus.textContent = text;
}

function setQubits(nextQubits) {
  app.qubits = clamp(Math.round(nextQubits), MIN_QUBITS, MAX_QUBITS);
  app.circuit = blankCircuit();
  app.pendingCnot = null;
  resetState();
  buildGrid();
  renderAll();
}

function setGate(gate) {
  app.selectedGate = gate;
  app.pendingCnot = null;
  els.gateButtons.forEach((button) => {
    const isActive = button.dataset.gate === gate;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
  renderAll();
}

function applyPreset(name) {
  app.circuit = blankCircuit();
  app.pendingCnot = null;

  if (name === "reset") {
    runCircuit();
    return;
  }

  if (name === "bell") {
    if (app.qubits < 2) app.qubits = 2;
    app.circuit = blankCircuit();
    app.circuit[0].push({ type: "H", target: 0 });
    app.circuit[1].push({ type: "CNOT", control: 0, target: 1 });
  }

  if (name === "ghz") {
    if (app.qubits < 3) app.qubits = 3;
    app.circuit = blankCircuit();
    app.circuit[0].push({ type: "H", target: 0 });
    app.circuit[1].push({ type: "CNOT", control: 0, target: 1 });
    app.circuit[2].push({ type: "CNOT", control: 1, target: 2 });
  }

  if (name === "phase") {
    app.circuit[0].push({ type: "H", target: 0 });
    app.circuit[1].push({ type: "T", target: 0 });
    app.circuit[2].push({ type: "S", target: 0 });
    app.circuit[3].push({ type: "H", target: 0 });
  }

  buildGrid();
  runCircuit();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function startFieldAnimation() {
  const canvas = els.fieldCanvas;
  const ctx = canvas.getContext("2d");
  const particles = Array.from({ length: 72 }, (_, index) => ({
    angle: (index / 72) * Math.PI * 2,
    radius: 90 + (index % 12) * 34,
    speed: 0.0004 + (index % 7) * 0.00012,
    phase: index * 0.37,
  }));

  function resize() {
    canvas.width = window.innerWidth * window.devicePixelRatio;
    canvas.height = window.innerHeight * window.devicePixelRatio;
    ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
  }

  function draw(time) {
    const width = window.innerWidth;
    const height = window.innerHeight;
    ctx.clearRect(0, 0, width, height);
    ctx.lineWidth = 1;

    particles.forEach((p, index) => {
      const cx = width * (0.5 + Math.sin(time * 0.00008 + p.phase) * 0.06);
      const cy = height * (0.5 + Math.cos(time * 0.00007 + p.phase) * 0.05);
      const a = p.angle + time * p.speed;
      const x = cx + Math.cos(a) * p.radius;
      const y = cy + Math.sin(a * 1.4) * p.radius * 0.42;
      ctx.fillStyle = index % 3 === 0 ? "rgba(93, 196, 255, 0.35)" : "rgba(94, 225, 162, 0.28)";
      ctx.beginPath();
      ctx.arc(x, y, 1.4, 0, Math.PI * 2);
      ctx.fill();

      if (index % 4 === 0) {
        ctx.strokeStyle = "rgba(169, 193, 192, 0.08)";
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
    });

    requestAnimationFrame(draw);
  }

  window.addEventListener("resize", resize);
  resize();
  requestAnimationFrame(draw);
}

function bindEvents() {
  els.decreaseQubits.addEventListener("click", () => setQubits(app.qubits - 1));
  els.increaseQubits.addEventListener("click", () => setQubits(app.qubits + 1));
  els.qubitCount.addEventListener("input", (event) => setQubits(Number(event.target.value)));
  els.qubitInput.addEventListener("input", (event) => {
    if (event.target.value) setQubits(Number(event.target.value));
  });
  els.shotCount.addEventListener("input", renderQiskitCode);
  els.gateButtons.forEach((button) => button.addEventListener("click", () => setGate(button.dataset.gate)));
  els.presetButtons.forEach((button) => button.addEventListener("click", () => applyPreset(button.dataset.preset)));
  els.runCircuit.addEventListener("click", runCircuit);
  els.measureCircuit.addEventListener("click", measureCircuit);
  els.clearCircuit.addEventListener("click", () => applyPreset("reset"));
  els.copyQiskit.addEventListener("click", copyQiskitCode);
  els.downloadQiskit.addEventListener("click", downloadQiskitCode);
}

function init() {
  app.circuit = blankCircuit();
  resetState();
  bindEvents();
  buildGrid();
  applyPreset("bell");
  startFieldAnimation();
}

init();
