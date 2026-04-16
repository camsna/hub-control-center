#!/usr/bin/env python3
"""
EventTemple API Scraper — no Playwright, no browser, just HTTP.
Uses session cookies from auth.json (still need Playwright for initial login).
"""

import json
import os
import sys
import time
import requests
from datetime import datetime, timedelta
from pathlib import Path
import pandas as pd

# Configuration
AUTH_FILE = '/app/data/auth.json'
OUTPUT_DIR = '/app/data/weeks'
LATEST_CSV = '/app/data/latest.csv'
BASE_URL = 'https://app.eventtemple.com'
TZ = 'Europe/Oslo'

# How far ahead/behind to export
MONTHS_BACK = 3
MONTHS_FORWARD = 12

# Venue to floor mapping
VENUE_FLOOR_MAP = {
    "Central Park": "1st", "Frognerparken": "1st", "Hyde Park A": "1st", "Hyde Park B": "1st",
    "Hyde Park C": "1st", "Hyde Park B-C": "1st", "Prado Park": "1st", "Ueno Park": "1st",
    "Freedom Square": "1st", "Mingle 1": "1st", "Lobby": "1st",
    "Federation Square": "2nd", "Mingle 2": "2nd", "Jernbanetorget A": "2nd",
    "Jernbanetorget B": "2nd", "Jernbanetorget C": "2nd", "Jernbanetorget A-B": "2nd",
    "Jernbanetorget": "2nd", "Green Room": "2nd",
    "Mingle 3": "3rd", "Taksim Square": "3rd", "Nyhavn": "3rd", "Festplassen": "3rd",
    "Alexanderplatz": "3rd", "Darling Harbour": "3rd", "Piazza Navona": "3rd",
    "Trafalgar Square": "3rd", "Grand Place": "3rd", "Stureplan": "3rd",
    "The Latin Quarters": "3rd", "Senate Square": "3rd", "Shibuya": "3rd",
    "Red Square": "3rd", "Times Square": "3rd", "Think Outside the Box": "3rd",
    "Norda": "13th", "Norda Cocktail Bar": "13th", "Hub Bar": "13th"
}

FLOOR_ORDER = ["2nd", "1st", "3rd", "13th"]

EXCLUDED_VENUES = [
    'Restaurant 2 Etasje', 'Lobby', 'Green Room', 'Green room',
    'Mingle 1', 'Mingle 2', 'Mingle 3'
]

def log(msg):
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    print(f'[{timestamp}] {msg}', flush=True)

def load_session():
    """Load cookies from auth.json and build a requests session"""
    if not os.path.exists(AUTH_FILE):
        raise FileNotFoundError(f'auth.json not found at {AUTH_FILE}')

    with open(AUTH_FILE, 'r') as f:
        data = json.load(f)

    session = requests.Session()
    session.headers.update({
        'Accept': 'application/json, text/plain, */*',
        'Content-Type': 'application/json;charset=UTF-8',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Referer': 'https://app.eventtemple.com/event_spaces/list',
    })

    # Load cookies
    if 'cookies' in data:
        for cookie in data['cookies']:
            session.cookies.set(
                cookie['name'],
                cookie['value'],
                domain=cookie.get('domain', '.eventtemple.com'),
                path=cookie.get('path', '/')
            )

    # Extract XSRF token from cookies
    xsrf = None
    for cookie in session.cookies:
        if cookie.name == "XSRF-TOKEN":
            xsrf = cookie.value
            break
    if xsrf:
        # URL-decode the token (cookies often have %XX encoding)
        import urllib.parse
        session.headers['X-XSRF-TOKEN'] = urllib.parse.unquote(xsrf)

    return session

def check_session(session):
    """Verify session is valid"""
    r = session.get(f'{BASE_URL}/api/v1/stats/user?format=json', timeout=15)
    if r.status_code == 200:
        return True
    log(f'Session check failed: {r.status_code}')
    return False

def trigger_export(session):
    """POST to create an export job, return export ID"""
    now = datetime.now()
    start_date = (now - timedelta(days=30 * MONTHS_BACK)).strftime('%Y-%m-%d')
    end_date = (now + timedelta(days=30 * MONTHS_FORWARD)).strftime('%Y-%m-%d')

    start_label = (now - timedelta(days=30 * MONTHS_BACK)).strftime('%-d %b %Y')
    end_label = (now + timedelta(days=30 * MONTHS_FORWARD)).strftime('%-d %b %Y')

    payload = {
        "export_model": {
            "export_format": "csv",
            "export_class": "Export::EventExport",
            "params": {
                "show_column_picker_modal": True,
                "columns": [
                    "name", "booking", "contact", "event_type", "date",
                    "start_time", "end_time", "space",
                    "c67adfe5998f3f5b31eb9776d57c8ddc",
                    "05002dc1bc49ada7a506cb619d39c93b",
                    "notes"
                ],
                "filter_string": f"Event Status is Definite, Event Date is between {start_label} and {end_label}",
                "report_title": "Events Listing",
                "query_params": {
                    "status": "definite",
                    "date": {
                        "start_date": start_date,
                        "end_date": end_date,
                        "label": "Custom range"
                    },
                    "order": "start_datetime,end_datetime",
                    "order_dir": "asc,asc"
                },
                "all_columns": False,
                "time_zone": TZ,
                "currency": "NOK",
                "use24_hour_time": True,
                "orientation": "landscape",
                "browser_timestamp": now.strftime('%Y-%m-%dT%H:%M:%S+01:00'),
                "browser_short_timezone": "CET"
            }
        }
    }

    r = session.post(f'{BASE_URL}/api/v1/export_models', json=payload, timeout=30)

    if r.status_code not in (200, 201):
        log(f'Export trigger failed: {r.status_code} {r.text[:200]}')
        return None

    data = r.json()
    export_id = data.get("export_model", {}).get("id") or data.get("data", {}).get("id")

    if not export_id:
        # Try to extract from response
        log(f'Could not find export ID in response: {json.dumps(data)[:300]}')
        return None

    log(f'Export triggered, ID: {export_id}')
    return export_id

def poll_export(session, export_id, max_wait=300):
    """Poll until export is ready, return download URL"""
    url = f'{BASE_URL}/api/v1/export_models/{export_id}'
    start = time.time()

    while time.time() - start < max_wait:
        r = session.get(url, timeout=15)
        if r.status_code != 200:
            log(f'Poll failed: {r.status_code}')
            time.sleep(3)
            continue

        data = r.json()
        em = data.get("export_model", data.get("data", {}).get("attributes", {}))
        file_url = em.get("file_url")
        if not file_url and isinstance(em.get("file"), dict):
            file_url = em["file"].get("url")
        status = em.get("status", "")

        if file_url:
            log(f'Export ready after {int(time.time()-start)}s')
            return file_url

        if status == 'failed':
            log(f'Export failed on server side')
            return None

        time.sleep(2)

    log(f'Export timed out after {max_wait}s')
    return None

def download_csv(url):
    """Download the CSV from S3 presigned URL"""
    r = requests.get(url, timeout=60)
    if r.status_code != 200:
        log(f'Download failed: {r.status_code}')
        return False

    with open(LATEST_CSV, 'wb') as f:
        f.write(r.content)

    log(f'Downloaded {len(r.content)} bytes to {LATEST_CSV}')
    return True

def get_monday(date):
    days_since_monday = date.weekday()
    return date - timedelta(days=days_since_monday)

def format_time(start_time, end_time):
    def fmt(t):
        if pd.isna(t): return '--'
        if isinstance(t, str): return t.replace(':', '')
        return t.strftime('%H%M')
    s, e = fmt(start_time), fmt(end_time)
    return ' -- -- ' if s == '--' and e == '--' else f'{s} - {e}'

def get_floor(venue):
    if not venue or pd.isna(venue): return 'Unknown'
    v = str(venue).strip()
    if v in VENUE_FLOOR_MAP: return VENUE_FLOOR_MAP[v]
    if 'Jernbanetorget' in v: return '2nd'
    if 'Central Park' in v: return '1st'
    if 'Hyde Park' in v: return '1st'
    return 'Unknown'

def merge_equipment_fields(tech_equipment, setup_rigg):
    tech = str(tech_equipment).strip() if pd.notna(tech_equipment) else ''
    rigg = str(setup_rigg).strip() if pd.notna(setup_rigg) else ''
    if tech.lower() in ('nan', 'none', ''): tech = ''
    if rigg.lower() in ('nan', 'none', ''): rigg = ''
    if tech and rigg: return f"{tech}\n\n{rigg}"
    return tech or rigg or ''

def process_weekly_csvs():
    log('Processing CSV into weekly files...')
    df = pd.read_csv(LATEST_CSV)
    log(f'CSV columns: {list(df.columns)}')

    has_setup_rigg = 'Setup/Rigg' in df.columns
    df['Event Dates'] = df['Event Dates'].str.split('\n').str[0]
    df['Event Dates'] = pd.to_datetime(df['Event Dates'], format='%a, %d %b, %Y', errors='coerce')
    df = df[~df['Space'].isin(EXCLUDED_VENUES)]
    df = df.dropna(subset=['Event Dates'])

    if has_setup_rigg:
        df['Equipment'] = df.apply(
            lambda row: merge_equipment_fields(row.get('Tech. Equipment', ''), row.get('Setup/Rigg', '')), axis=1)
    else:
        df['Equipment'] = df['Tech. Equipment'].fillna('')

    df['Monday'] = df['Event Dates'].apply(get_monday)
    df['WeekKey'] = df['Monday'].dt.strftime('%Y-%m-%d')
    df['DayName'] = df['Event Dates'].dt.strftime('%A')
    df['DateFormatted'] = df['Event Dates'].dt.strftime('%A, %d %B, %Y')
    df['Floor'] = df['Space'].apply(get_floor)
    df['Time'] = df.apply(lambda row: format_time(row['Start Time'], row['End Time']), axis=1)
    df['ClientClean'] = df['Booking'].apply(lambda b: '' if pd.isna(b) else str(b))

    floor_order_map = {f: i for i, f in enumerate(FLOOR_ORDER)}
    df['FloorOrder'] = df['Floor'].map(lambda x: floor_order_map.get(x, 999))
    df = df.sort_values(['FloorOrder', 'Time'])

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    weeks = df['WeekKey'].unique()
    log(f'Found {len(weeks)} weeks')

    for week_key in sorted(weeks):
        week_df = df[df['WeekKey'] == week_key].copy()
        output_df = week_df[['DayName', 'DateFormatted', 'Time', 'Space', 'ClientClean', 'Contact', 'Name', 'Equipment', 'Notes', 'Floor']].rename(columns={
            'DayName': 'Day', 'DateFormatted': 'Date', 'Space': 'Venue', 'ClientClean': 'Client', 'Name': 'Event'
        })
        output_file = os.path.join(OUTPUT_DIR, f'week_{week_key}.csv')
        output_df.to_csv(output_file, index=False)

    weeks_list = []
    for week_key in sorted(weeks):
        monday = pd.to_datetime(week_key)
        sunday = monday + timedelta(days=6)
        sm, em = monday.strftime('%b'), sunday.strftime('%b')
        sd, ed = monday.strftime('%-d'), sunday.strftime('%-d')
        year = monday.strftime('%Y')
        label = f'Week of {sm} {sd}-{ed}, {year}' if sm == em else f'Week of {sm} {sd} - {em} {ed}, {year}'
        weeks_list.append({'Key': week_key, 'Label': label})

    pd.DataFrame(weeks_list).to_csv(os.path.join(OUTPUT_DIR, 'weeks_index.csv'), index=False)
    log(f'Processed {len(weeks)} weeks')

    # Clear reauth flag if it exists
    reauth_file = '/app/data/NEEDS_REAUTH'
    if os.path.exists(reauth_file):
        os.remove(reauth_file)

def main():
    try:
        log('Starting API-based scraper...')

        session = load_session()

        if not check_session(session):
            log('Session expired - needs re-authentication')
            with open('/app/data/NEEDS_REAUTH', 'w') as f:
                f.write(f'Session expired on {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}\n')
            return 2

        log('Session valid')

        export_id = trigger_export(session)
        if not export_id:
            log('Failed to trigger export')
            return 1

        download_url = poll_export(session, export_id)
        if not download_url:
            log('Failed to get download URL')
            return 1

        if not download_csv(download_url):
            log('Failed to download CSV')
            return 1

        process_weekly_csvs()
        log('Scraper completed successfully')
        return 0

    except Exception as e:
        log(f'Error: {str(e)}')
        import traceback
        traceback.print_exc()
        return 1

if __name__ == '__main__':
    sys.exit(main())
