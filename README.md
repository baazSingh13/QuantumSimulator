# Quantum Simulator

An interactive, dependency-free quantum circuit simulator that runs entirely in the browser.

## Features

- State-vector simulation for 1 to 5 qubits
- Gates: H, X, Y, Z, S, T, and CNOT
- Circuit grid editor with preset Bell, GHZ, and phase circuits
- Probability chart, state vector readout, Bloch-style view for qubit 0
- Measurement sampling with configurable shot count
- Responsive static website ready for GitHub Pages

## Run Locally

Open `index.html` directly in a browser, or serve the folder with any static server:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## GitHub Pages

This site is static. In the GitHub repository settings, enable Pages from the default branch root to publish it.
