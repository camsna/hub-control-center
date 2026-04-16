#!/usr/bin/env python3
"""
Run this script ONCE to create auth.json with your EventTemple session.
This must be run on your local machine with a display (not in Docker).
"""
from playwright.sync_api import sync_playwright
import os

AUTH_FILE = "auth.json"  # Local file, will be copied to Docker
LOGIN_URL = "https://app.eventtemple.com/login"

def main():
    print("=" * 60)
    print("EventTemple Session Generator")
    print("=" * 60)
    
    with sync_playwright() as p:
        # Launch browser with GUI
        browser = p.chromium.launch(headless=False)

        # Check if auth.json already exists
        if os.path.exists(AUTH_FILE):
            print(f"✓ Found existing {AUTH_FILE}")
            context = browser.new_context(storage_state=AUTH_FILE)
            print("Testing existing session...")
        else:
            print(f"No existing {AUTH_FILE} found. Creating new session...")
            context = browser.new_context()

        page = context.new_page()
        page.goto(LOGIN_URL)

        if not os.path.exists(AUTH_FILE):
            print("\n" + "=" * 60)
            print("ACTION REQUIRED:")
            print("1. Log in to EventTemple in the browser window")
            print("2. Wait until you're fully logged in")
            print("3. Press ENTER in this terminal")
            print("=" * 60 + "\n")
            input("Press ENTER after you've logged in...")
            
            # Save the session
            context.storage_state(path=AUTH_FILE)
            print(f"\n✅ Session saved to {AUTH_FILE}")
            print(f"\nNext steps:")
            print(f"1. Copy {AUTH_FILE} to your Docker project folder")
            print(f"2. Build and run the Docker container")
        else:
            print("\n✅ Existing session is valid")
            print(f"\nYour {AUTH_FILE} is ready to use.")

        browser.close()

if __name__ == "__main__":
    main()
