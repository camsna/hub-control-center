#!/usr/bin/env python3
"""
Session Heartbeat - Visits EventTemple to keep session alive
Runs daily at 3 AM to prevent session expiration
"""

import json
import os
from datetime import datetime
from playwright.sync_api import sync_playwright

AUTH_FILE = '/app/data/auth.json'
HEARTBEAT_URL = 'https://app.eventtemple.com/event_spaces/list?viewKey=21ec1571'

def log(msg):
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    print(f'[{timestamp}] [HEARTBEAT] {msg}', flush=True)

def load_session():
    """Load authentication session from file"""
    if not os.path.exists(AUTH_FILE):
        raise FileNotFoundError(f'auth.json not found at {AUTH_FILE}')
    
    with open(AUTH_FILE, 'r') as f:
        return json.load(f)

def heartbeat():
    """Visit EventTemple to keep session alive"""
    log('Starting session heartbeat...')
    
    try:
        session_data = load_session()
        
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context()
            
            # Load cookies
            if 'cookies' in session_data:
                context.add_cookies(session_data['cookies'])
            
            page = context.new_page()
            
            log('Visiting EventTemple to keep session alive...')
            page.goto(HEARTBEAT_URL, wait_until='domcontentloaded', timeout=30000)
            
            # Check if we're still logged in by looking for the Events page elements
            try:
                # Look for something that only exists when logged in
                page.wait_for_selector('text=Events', timeout=5000)
                log('✅ Session is still active')
            except Exception:
                log('⚠️  Session has expired during heartbeat')
            
            browser.close()
            log('Heartbeat completed')
            
    except Exception as e:
        log(f'❌ Heartbeat error: {str(e)}')
        # Don't fail - heartbeat is best effort

if __name__ == '__main__':
    heartbeat()
