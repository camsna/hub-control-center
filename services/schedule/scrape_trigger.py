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
        elif self.path == "/check-auth":
            result = check_auth()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(result).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        pass  # quiet

def check_auth():
    """Check if EventTemple session is valid by verifying JSON response."""
    try:
        result = subprocess.run(
            ["python3", "-c", """
import json, sys
from scrape_api import load_session, BASE_URL

session = load_session()
cookie_count = len(list(session.cookies))
if cookie_count == 0:
    print(json.dumps({"valid": False, "reason": "No cookies loaded"}))
    sys.exit(0)

r = session.get(f'{BASE_URL}/api/v1/stats/user?format=json', timeout=15)
content_type = r.headers.get('content-type', '')
if 'json' in content_type and r.status_code == 200:
    print(json.dumps({"valid": True, "cookies": cookie_count}))
else:
    print(json.dumps({"valid": False, "reason": "Session expired", "status": r.status_code}))
"""],
            capture_output=True, text=True, timeout=30
        )
        if result.returncode == 0 and result.stdout.strip():
            return json.loads(result.stdout.strip())
        return {"valid": False, "reason": f"Check failed: {result.stderr[-200:]}"}
    except Exception as e:
        return {"valid": False, "reason": str(e)}

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
