#!/usr/bin/env python3
"""Tiny HTTP server to trigger scrapes on demand."""
import subprocess
import threading
import json
from http.server import HTTPServer, BaseHTTPRequestHandler
from datetime import datetime

scrape_lock = threading.Lock()
scrape_status = {"running": False, "last_run": None, "last_result": None}

class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path == "/trigger":
            if not scrape_lock.acquire(blocking=False):
                self.send_response(409)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"ok": False, "error": "Scrape already running"}).encode())
                return
            scrape_status["running"] = True
            self.send_response(202)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"ok": True, "message": "Scrape started"}).encode())
            threading.Thread(target=run_scrape, daemon=True).start()
        else:
            self.send_response(404)
            self.end_headers()

    def do_GET(self):
        if self.path == "/status":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(scrape_status).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        pass  # quiet

def run_scrape():
    try:
        result = subprocess.run(
            ["python3", "/app/scrape_api.py"],
            capture_output=True, text=True, timeout=600
        )
        scrape_status["last_result"] = "success" if result.returncode == 0 else f"failed (exit {result.returncode})"
        scrape_status["last_output"] = (result.stdout + result.stderr)[-500:]
    except Exception as e:
        scrape_status["last_result"] = f"error: {str(e)}"
    finally:
        scrape_status["running"] = False
        scrape_status["last_run"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        scrape_lock.release()

if __name__ == "__main__":
    server = HTTPServer(("0.0.0.0", 8091), Handler)
    print("Scrape trigger listening on :8091", flush=True)
    server.serve_forever()
