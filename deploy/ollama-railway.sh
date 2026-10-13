#!/usr/bin/env bash
# ollama-railway.sh — Deploy Ollama on Railway.app alongside the analytics platform
# Railway supports separate services that can communicate over the internal network.
set -euo pipefail

echo "🚂 Deploying Ollama on Railway..."
echo ""
echo "Step 1: Create Ollama service on Railway"
echo "  1. Go to https://railway.app"
echo "  2. New → GitHub Repo → Select: $(git remote get-url origin 2>/dev/null || echo 'your-repo')"
echo "  3. Add service → Deploy Template → Docker"
echo "  4. Set Image: ollama/ollama:latest"
echo "  5. Set Command: ollama serve --host 0.0.0.0 --port 11434"
echo ""
echo "Step 2: After Ollama is deployed, note its internal URL"
echo "  Example: http://ollama-prod-1234.up.railway.app"
echo ""
echo "Step 3: Add environment variable to analytics platform"
echo "  OLLAMA_ENDPOINT_URL=<railway-ollama-internal-url>"
echo ""
echo "For FreeLLMAPI, repeat with:"
echo "  Image: ghcr.io/freellmapi/freellmapi:latest"
echo "  Command: node server.js"
echo "  Port: 31415"
echo ""
echo "✅ Done! Your Render/any platform can now reach Ollama over the internet."
