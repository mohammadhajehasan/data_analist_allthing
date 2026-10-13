@echo off
REM start-ollama-local.bat - Windows version of start-ollama-local.sh
REM Starts Ollama, pulls models, and keeps running.

set ROOT=%~dp0
set DATA_DIR=%ROOT%..\..\freebuff\ollama-data
mkdir "%DATA_DIR%" 2>nul

echo 🚀 Starting Ollama local daemon...

REM Start Ollama in background
start /B cmd /c "ollama serve --host 0.0.0.0:11434 > \"%DATA_DIR%\ollama.log\" 2>&1"
echo Waiting for Ollama to be ready...

for /L %%i in (1,1,30) do (
  curl -sf http://localhost:11434/api/tags >nul 2>&1 && goto :ready
  echo ⏳ Waiting for Ollama... (%%i/30)
  timeout /t 2 /nobreak >nul
)

:ready
echo ✅ Ollama is ready

REM Pull key models
echo 📦 Pulling models...
ollama pull qwen2.5-coder:7b
ollama pull llama3.2:3b

echo ✅ Ollama ready with models at http://localhost:11434
echo.
echo To start the analytics platform:
echo   cd %ROOT%..\.. && npm run dev
echo.
pause
