import uvicorn
import webview
import threading
import sys
import os

def start_server():
    """Starts the FastAPI uvicorn server in a background daemon thread."""
    # Disable uvicorn reload and access logging for native packaging execution
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=False, access_log=False)

if __name__ == "__main__":
    # 1. Start the FastAPI server in a background thread
    server_thread = threading.Thread(target=start_server, daemon=True)
    server_thread.start()
    
    # 2. Start a native desktop window frame loading the web server
    webview.create_window(
        title="Don't Share",
        url="http://127.0.0.1:8000",
        width=1280,
        height=800,
        min_size=(1024, 768),
        background_color="#0f0f11"
    )
    
    # 3. Start the pywebview GUI loop (this blocks execution until the window is closed)
    webview.start()
