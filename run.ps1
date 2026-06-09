Write-Host "Starting Don't Share PII Cleaner..." -ForegroundColor DarkBlue
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
