#!/usr/bin/env bash
# start-ollama-local.sh — Start Ollama, pull key models, and keep running.
# Intended for local development or small VPS deployments where the user wants
# Ollama and the analytics platform co-located on the same machine.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="${ROOT}/.freebuff/ollama-data"

echo "🚀 Starting Ollama local daemon..."
mkdir -p "$DATA_DIR"

# Start Ollama in background with persistent data directory
ollama serve --host 0.0.0.0:11434 > "$DATA_DIR/ollama.log" 2>&1 &
OLLAMA_PID=$!
echo "Ollama PID: $OLLAMA_PID"
echo "Logs: $DATA_DIR/ollama.log"

# Wait for Ollama to be ready
for i in $(seq 1 30); do
  if curl -sf http://localhost:11434/api/tags > /dev/null 2>&1; then
    echo "✅ Ollama is ready"
    break
  fi
  echo "⏳ Waiting for Ollama... ($i/30)"
  sleep 2
done

# Pull key models for analytics workloads
echo "📦 Pulling models (this may take several minutes)..."
for model in qwen2.5-coder:7b llama3.2:3b; do
  echo "  → Pulling $model..."
  ollama pull "$model" 2>&1 || echo "  ⚠️ Skipped $model"
done

echo "✅ Ollama ready with models at http://localhost:11434"
echo ""
echo "To start the analytics platform:"
echo "  cd $ROOT && npm run dev"
echo ""
echo "Press Ctrl+C to stop Ollama"

# Keep script alive so Ollama keeps running
wait $OLLAMA_PID
