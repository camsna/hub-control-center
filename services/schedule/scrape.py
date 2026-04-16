#!/usr/bin/env python3
"""
EventTemple Scraper - Downloads and processes event data into weekly CSVs
"""

import json
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path
import pandas as pd
from playwright.sync_api import sync_playwright

# Configuration
AUTH_FILE = '/app/data/auth.json'
OUTPUT_DIR = '/app/data/weeks'
LATEST_CSV = '/app/data/latest.csv'
EXPORT_URL = 'https://app.eventtemple.com/event_spaces/list?viewKey=21ec1571'

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
    """Load authentication session from file"""
    if not os.path.exists(AUTH_FILE):
        raise FileNotFoundError(f'auth.json not found at {AUTH_FILE}')
    
    with open(AUTH_FILE, 'r') as f:
        return json.load(f)

def download_csv(session_data):
    """Download CSV using saved session"""
    log('Starting EventTemple scraper...')
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        
        # Load cookies
        if 'cookies' in session_data:
            context.add_cookies(session_data['cookies'])
        
        page = context.new_page()
        
        log('Loaded existing session from auth.json')
        log('Navigating to EventTemple...')
        
        page.goto(EXPORT_URL, wait_until='networkidle', timeout=60000)
        
        # Check if session expired by looking for Export button
        # If logged in, Export button should be visible
        try:
            export_button = page.locator('button:has-text("Export")')
            export_button.wait_for(state='visible', timeout=5000)
            log('✅ Session is valid - Export button found')
        except Exception:
            # Export button not found = not logged in
            log('🔐 Session expired - re-authentication required!')
            
            # Write flag file to alert you
            flag_file = '/app/data/NEEDS_REAUTH'
            with open(flag_file, 'w') as f:
                f.write(f'Session expired on {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}\n')
                f.write('Run SESSION_GETTER.py on your local machine to re-authenticate.\n')
            
            # Take screenshot for debugging
            page.screenshot(path='/app/data/login_page.png')
            log('📸 Saved login page screenshot to /app/data/login_page.png')
            
            browser.close()
            
            # Exit gracefully - don't fail the whole script
            log('⚠️  Scraper stopped. Please re-authenticate.')
            return False  # Signal that scraping didn't happen
        
        log('Triggering export...')
        export_button.click(timeout=30000)
        
        log('Selecting CSV format...')
        csv_option = page.locator('text=CSV')
        csv_option.click()
        
        # Confirm the export with OK button
        log('Confirming export...')
        page.wait_for_selector('button:has-text("OK")', timeout=10000)
        page.click('button:has-text("OK")')
        
        # Wait for server to prepare the file
        log('Waiting for file preparation...')
        page.wait_for_timeout(5000)
        
        log('Downloading file...')
        with page.expect_download() as download_info:
            page.click('a:has-text("Click here to download the file")')
        
        download = download_info.value
        download.save_as(LATEST_CSV)
        
        # Close the popup
        page.click('button:has-text("Close")')
        
        browser.close()
        
        log(f'✅ File downloaded and saved to {LATEST_CSV}')
        return True  # Signal successful scraping

def get_monday(date):
    """Get the Monday of the week for a given date"""
    days_since_monday = date.weekday()
    monday = date - timedelta(days=days_since_monday)
    return monday

def format_time(start_time, end_time):
    """Format time as HHMM - HHMM"""
    def format_single(t):
        if pd.isna(t):
            return '--'
        if isinstance(t, str):
            return t.replace(':', '')
        # If it's a time object
        return t.strftime('%H%M')
    
    start = format_single(start_time)
    end = format_single(end_time)
    
    if start == '--' and end == '--':
        return ' -- -- '
    
    return f'{start} - {end}'

def get_floor(venue):
    """Get floor for a venue"""
    if not venue or pd.isna(venue):
        return 'Unknown'
    
    venue_str = str(venue).strip()
    
    if venue_str in VENUE_FLOOR_MAP:
        return VENUE_FLOOR_MAP[venue_str]
    
    if 'Jernbanetorget' in venue_str:
        return '2nd'
    if 'Central Park' in venue_str:
        return '1st'
    if 'Hyde Park' in venue_str:
        return '1st'
    
    return 'Unknown'

def clean_booking(booking):
    """Remove BK- prefix from booking"""
    if not booking or pd.isna(booking):
        return ''
    return str(booking).replace(r'BK-\d{5}\s+', '', 1)

def merge_equipment_fields(tech_equipment, setup_rigg):
    """
    Merge Tech. Equipment and Setup/Rigg columns into one field.
    Prioritizes reliability by handling all edge cases.
    
    Args:
        tech_equipment: Content from Tech. Equipment column
        setup_rigg: Content from Setup/Rigg column
    
    Returns:
        Merged string with both fields separated by double newline
    """
    # Convert to strings and strip whitespace
    tech = str(tech_equipment).strip() if pd.notna(tech_equipment) else ''
    rigg = str(setup_rigg).strip() if pd.notna(setup_rigg) else ''
    
    # Remove common "empty" indicators
    if tech.lower() in ('nan', 'none', ''):
        tech = ''
    if rigg.lower() in ('nan', 'none', ''):
        rigg = ''
    
    # Merge logic
    if tech and rigg:
        # Both have content - merge with separator
        return f"{tech}\n\n{rigg}"
    elif tech:
        # Only tech has content
        return tech
    elif rigg:
        # Only rigg has content
        return rigg
    else:
        # Both empty
        return ''

def process_weekly_csvs():
    """Process the main CSV into weekly CSVs"""
    log('Processing CSV into weekly files...')
    
    # Read the CSV
    df = pd.read_csv(LATEST_CSV)
    
    # Log column names for debugging
    log(f'CSV columns: {list(df.columns)}')
    
    # Check if Setup/Rigg column exists
    has_setup_rigg = 'Setup/Rigg' in df.columns
    if has_setup_rigg:
        log('✓ Setup/Rigg column found - will merge with Tech. Equipment')
    else:
        log('⚠ Setup/Rigg column not found - using Tech. Equipment only')
    
    # Clean Event Dates: remove newlines and extract just the date part
    df['Event Dates'] = df['Event Dates'].str.split('\n').str[0]
    
    # Parse dates
    df['Event Dates'] = pd.to_datetime(df['Event Dates'], format='%a, %d %b, %Y', errors='coerce')
    
    # Filter out excluded venues
    df = df[~df['Space'].isin(EXCLUDED_VENUES)]
    
    # Drop rows with invalid dates
    df = df.dropna(subset=['Event Dates'])
    
    # Merge equipment fields if Setup/Rigg exists
    if has_setup_rigg:
        df['Equipment'] = df.apply(
            lambda row: merge_equipment_fields(
                row.get('Tech. Equipment', ''),
                row.get('Setup/Rigg', '')
            ),
            axis=1
        )
    else:
        # Fallback: just use Tech. Equipment
        df['Equipment'] = df['Tech. Equipment'].fillna('')
    
    # Add calculated columns
    df['Monday'] = df['Event Dates'].apply(get_monday)
    df['WeekKey'] = df['Monday'].dt.strftime('%Y-%m-%d')
    df['DayName'] = df['Event Dates'].dt.strftime('%A')
    df['DateFormatted'] = df['Event Dates'].dt.strftime('%A, %d %B, %Y')
    df['Floor'] = df['Space'].apply(get_floor)
    df['Time'] = df.apply(lambda row: format_time(row['Start Time'], row['End Time']), axis=1)
    df['ClientClean'] = df['Booking'].apply(clean_booking)
    
    # Sort by floor order
    floor_order_map = {floor: i for i, floor in enumerate(FLOOR_ORDER)}
    df['FloorOrder'] = df['Floor'].map(lambda x: floor_order_map.get(x, 999))
    df = df.sort_values(['FloorOrder', 'Time'])
    
    # Create output directory
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    # Group by week and save
    weeks = df['WeekKey'].unique()
    log(f'Found {len(weeks)} weeks to process')
    
    for week_key in sorted(weeks):
        week_df = df[df['WeekKey'] == week_key].copy()
        
        # Select and rename columns for output
        # Use the merged 'Equipment' column we created
        output_df = week_df[[
            'DayName', 'DateFormatted', 'Time', 'Space',
            'ClientClean', 'Contact', 'Name', 'Equipment', 'Notes', 'Floor'
        ]].rename(columns={
            'DayName': 'Day',
            'DateFormatted': 'Date',
            'Space': 'Venue',
            'ClientClean': 'Client',
            'Name': 'Event'
        })
        
        # Save to weekly CSV
        output_file = os.path.join(OUTPUT_DIR, f'week_{week_key}.csv')
        output_df.to_csv(output_file, index=False)
        log(f'  Created {output_file} ({len(output_df)} events)')
    
    # Create weeks index file
    weeks_list = []
    for week_key in sorted(weeks):
        monday = pd.to_datetime(week_key)
        sunday = monday + timedelta(days=6)
        
        start_month = monday.strftime('%b')
        end_month = sunday.strftime('%b')
        start_day = monday.strftime('%-d')
        end_day = sunday.strftime('%-d')
        year = monday.strftime('%Y')
        
        if start_month == end_month:
            label = f'Week of {start_month} {start_day}-{end_day}, {year}'
        else:
            label = f'Week of {start_month} {start_day} - {end_month} {end_day}, {year}'
        
        weeks_list.append({'Key': week_key, 'Label': label})
    
    weeks_df = pd.DataFrame(weeks_list)
    weeks_index = os.path.join(OUTPUT_DIR, 'weeks_index.csv')
    weeks_df.to_csv(weeks_index, index=False)
    log(f'  Created {weeks_index}')
    
    log(f'✅ Processed {len(weeks)} weeks successfully')

def main():
    try:
        # Load session
        session_data = load_session()
        
        # Download CSV
        scrape_success = download_csv(session_data)
        
        # If session expired, exit gracefully
        if not scrape_success:
            log('Session expired. Check /app/data/NEEDS_REAUTH file.')
            log('Run SESSION_GETTER.py to re-authenticate, then copy auth.json to container.')
            return 2  # Exit code 2 = needs re-auth (not a failure)
        
        # Process into weekly CSVs
        process_weekly_csvs()
        
        log('Scraper completed successfully')
        return 0
        
    except Exception as e:
        log(f'❌ Error: {str(e)}')
        import traceback
        traceback.print_exc()
        return 1

if __name__ == '__main__':
    sys.exit(main())
