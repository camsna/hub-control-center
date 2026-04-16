#!/usr/bin/env python3
"""
Re-authenticate EventTemple session.
Run this on any machine with a browser. Cookies are pushed to the Pi automatically.
Usage: python3 <(curl -s http://PI_ADDRESS:8090/reauth.py)
"""
import sys, os, json

# Detect Pi address from how this script was fetched, or use Tailscale
PI_URL = os.environ.get("HCC_URL", "http://100.98.118.40:8090")

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print("Playwright not installed. Installing...")
    os.system(f"{sys.executable} -m pip install playwright")
    os.system(f"{sys.executable} -m playwright install chromium")
    from playwright.sync_api import sync_playwright

LOGIN_URL = "https://app.eventtemple.com/login"

def main():
    print("=" * 50)
    print("  EventTemple Re-authentication")
    print("=" * 50)
    print()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context()
        page = context.new_page()

        print("Opening EventTemple login page...")
        page.goto(LOGIN_URL, wait_until="domcontentloaded")

        print()
        print("  Log in to EventTemple in the browser window.")
        print("  When you see the dashboard, press ENTER here.")
        print()
        input("  Press ENTER after logging in... ")

        # Save session state
        state = context.storage_state()
        browser.close()

    # Push to Pi
    print()
    print(f"Pushing session to Hub Control Center ({PI_URL})...")

    import urllib.request
    req = urllib.request.Request(
        f"{PI_URL}/api/auth",
        data=json.dumps(state).encode(),
        headers={"Content-Type": "application/json"},
        method="POST"
    )

    try:
        resp = urllib.request.urlopen(req, timeout=10)
        result = json.loads(resp.read())
        if result.get("ok"):
            print()
            print("  Session updated successfully!")
            print("  The scraper will use the new session on its next run.")
            print()
        else:
            print(f"  Error: {result}")
    except Exception as e:
        print(f"  Failed to push to Pi: {e}")
        print(f"  Saving locally as auth.json instead...")
        with open("auth.json", "w") as f:
            json.dump(state, f)
        print(f"  Saved. Copy manually: scp auth.json thehub@100.98.118.40:~/hub-control-center/services/schedule/data/")

if __name__ == "__main__":
    main()
