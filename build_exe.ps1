Write-Host "Checking PyInstaller installation..." -ForegroundColor DarkGreen
if (-not (Get-Command pyinstaller -ErrorAction SilentlyContinue)) {
    Write-Host "Installing PyInstaller..." -ForegroundColor Yellow
    pip install pyinstaller
}

Write-Host "Compiling Don't Share into standalone executable..." -ForegroundColor DarkGreen
pyinstaller --noconsole --onefile --name "dont_share" --add-data "app/templates;app/templates" --add-data "static;static" run_app.py

Write-Host "Compilation complete! The executable is located in: .\dist\dont_share.exe" -ForegroundColor Green
