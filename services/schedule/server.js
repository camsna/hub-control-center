const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { parse } = require('csv-parse/sync');

const app = express();
const PORT = process.env.PORT || 8090;
const WEEKS_DIR = '/app/data/weeks';
const SCRAPER_HOST = process.env.SCRAPER_HOST || 'schedule-scraper';
const SCRAPER_PORT = 8091;

app.use(express.static(path.join(__dirname, 'public')));

// API: list available weeks
app.get('/api/weeks', (req, res) => {
    try {
        const indexPath = path.join(WEEKS_DIR, 'weeks_index.csv');
        if (!fs.existsSync(indexPath)) {
            return res.json([]);
        }
        const content = fs.readFileSync(indexPath, 'utf-8');
        const rows = parse(content, { columns: true, skip_empty_lines: true });
        res.json(rows.map(r => ({ key: r.Key, label: r.Label })));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// API: get week data
app.get('/api/week/:key', (req, res) => {
    try {
        const weekKey = req.params.key;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(weekKey)) {
            return res.status(400).json({ error: 'Invalid week key' });
        }

        const filePath = path.join(WEEKS_DIR, `week_${weekKey}.csv`);
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Week not found' });
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        const rows = parse(content, { columns: true, skip_empty_lines: true });

        const monday = new Date(weekKey + 'T00:00:00');
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);

        const startMonth = monday.toLocaleDateString('en-US', { month: 'short' });
        const endMonth = sunday.toLocaleDateString('en-US', { month: 'short' });
        const startDay = monday.getDate();
        const endDay = sunday.getDate();
        const year = monday.getFullYear();

        const weekLabel = startMonth === endMonth
            ? `Week of ${startMonth} ${startDay}-${endDay}, ${year}`
            : `Week of ${startMonth} ${startDay} - ${endMonth} ${endDay}, ${year}`;

        const days = {};
        const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        dayNames.forEach(d => { days[d] = { date: '', events: [] }; });

        rows.forEach(row => {
            const day = row.Day;
            if (!days[day]) return;
            if (!days[day].date) days[day].date = row.Date;
            days[day].events.push({
                time: row.Time || '',
                venue: row.Venue || '',
                client: row.Client || '',
                contact: row.Contact || '',
                event: row.Event || '',
                equipment: row.Equipment || '',
                notes: row.Notes || '',
                floor: row.Floor || ''
            });
        });

        res.json({ weekLabel, days });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// API: data freshness
app.get('/api/status', (req, res) => {
    try {
        const indexPath = path.join(WEEKS_DIR, 'weeks_index.csv');
        let dataAsOf = '';
        if (fs.existsSync(indexPath)) {
            const stat = fs.statSync(indexPath);
            dataAsOf = stat.mtime.toLocaleString('sv-SE', { timeZone: process.env.TZ || 'Europe/Oslo' }).replace('T', ' ');
        }
        const needsReauth = fs.existsSync('/app/data/NEEDS_REAUTH');
        res.json({ dataAsOf, needsReauth });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// API: check auth status (proxied to scraper)
app.get('/api/auth/check', (req, res) => {
    const options = {
        hostname: SCRAPER_HOST,
        port: SCRAPER_PORT,
        path: '/check-auth',
        method: 'GET',
        timeout: 30000
    };
    const proxy = http.request(options, (proxyRes) => {
        let body = '';
        proxyRes.on('data', c => body += c);
        proxyRes.on('end', () => {
            try {
                res.status(proxyRes.statusCode).json(JSON.parse(body));
            } catch (e) {
                res.status(502).json({ valid: false, reason: 'Invalid response from scraper' });
            }
        });
    });
    proxy.on('error', (e) => {
        res.status(502).json({ valid: false, reason: 'Scraper unreachable: ' + e.message });
    });
    proxy.end();
});

// API: receive auth.json from extension or reauth script
app.post('/api/auth', express.json({limit: '1mb'}), (req, res) => {
    try {
        const authData = req.body;
        if (!authData || !authData.cookies) {
            return res.status(400).json({ ok: false, error: 'Invalid auth data' });
        }
        const authPath = '/app/data/auth.json';
        if (fs.existsSync(authPath)) {
            const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            fs.copyFileSync(authPath, authPath + '.bak.' + ts);
        }
        fs.writeFileSync(authPath, JSON.stringify(authData, null, 2));
        const flagPath = '/app/data/NEEDS_REAUTH';
        if (fs.existsSync(flagPath)) fs.unlinkSync(flagPath);
        console.log('Auth updated: ' + authData.cookies.length + ' cookies');
        res.json({ ok: true, cookies: authData.cookies.length });
    } catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});

// API: trigger a scrape (proxied to scraper container)
app.post('/api/scrape', (req, res) => {
    const options = {
        hostname: SCRAPER_HOST,
        port: SCRAPER_PORT,
        path: '/trigger',
        method: 'POST',
        timeout: 5000
    };
    const proxy = http.request(options, (proxyRes) => {
        let body = '';
        proxyRes.on('data', c => body += c);
        proxyRes.on('end', () => {
            res.status(proxyRes.statusCode).json(JSON.parse(body));
        });
    });
    proxy.on('error', (e) => {
        res.status(502).json({ ok: false, error: 'Scraper unreachable: ' + e.message });
    });
    proxy.end();
});

// API: scraper status (proxied to scraper container)
app.get('/api/scrape/status', (req, res) => {
    const options = {
        hostname: SCRAPER_HOST,
        port: SCRAPER_PORT,
        path: '/status',
        method: 'GET',
        timeout: 5000
    };
    const proxy = http.request(options, (proxyRes) => {
        let body = '';
        proxyRes.on('data', c => body += c);
        proxyRes.on('end', () => {
            res.status(proxyRes.statusCode).json(JSON.parse(body));
        });
    });
    proxy.on('error', (e) => {
        res.status(502).json({ running: false, error: 'Scraper unreachable: ' + e.message });
    });
    proxy.end();
});

app.listen(PORT, () => {
    console.log(`Schedule server running on port ${PORT}`);
});
