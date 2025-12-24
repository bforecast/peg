
// Auto-generated from settings.html
export const SETTINGS_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>System Status - Forward PEG Analysis</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #F6F6F6; color: #0F1419; margin: 0; padding: 0; }
        .header { background: #0F1419; color: white; padding: 16px 24px; display: flex; align-items: center; justify-content: space-between; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .header h1 { font-size: 18px; margin: 0; font-weight: 600; }
        .btn-back { color: white; text-decoration: none; font-size: 14px; background: rgba(255,255,255,0.1); padding: 8px 16px; border-radius: 4px; transition: background 0.2s; }
        .btn-back:hover { background: rgba(255,255,255,0.2); }
        
        .container { max-width: 1000px; margin: 24px auto; padding: 0 24px; }
        
        /* Health Cards */
        .health-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin-bottom: 24px; }
        .card { background: white; border-radius: 8px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        .card-label { font-size: 12px; text-transform: uppercase; color: #536471; font-weight: 600; margin-bottom: 8px; letter-spacing: 0.5px; }
        .card-value { font-size: 18px; font-weight: 700; color: #0F1419; display: flex; align-items: center; gap: 8px; }
        
        .status-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
        .status-dot.ok { background: #00BA7C; }
        .status-dot.warn { background: #FFD400; }
        .status-dot.error { background: #F91880; }

        /* Summary Stats */
        .summary-card { background: white; border-radius: 8px; padding: 24px; margin-bottom: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 24px; }
        .stat-item { border-left: 3px solid #EFF3F4; padding-left: 16px; }
        .stat-num { font-size: 24px; font-weight: 800; color: #0F1419; line-height: 1.2; }
        .stat-num.text-warn { color: #FFD400 !important; } /* Warning Color */
        .stat-sub { font-size: 13px; color: #536471; margin-top: 4px; }
        
        /* Logs Table */
        .logs-section { background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
        .section-header { padding: 16px 24px; border-bottom: 1px solid #EFF3F4; display: flex; justify-content: space-between; align-items: center; }
        .section-title { font-size: 16px; font-weight: 700; margin: 0; }
        .refresh-btn { background: none; border: 1px solid #EFF3F4; padding: 6px 12px; border-radius: 4px; cursor: pointer; color: #536471; font-size: 13px; }
        .refresh-btn:hover { background: #F7F9F9; color: #0F1419; }

        table { width: 100%; border-collapse: collapse; font-size: 14px; }
        th { background: #F7F9F9; color: #536471; font-weight: 600; text-align: left; padding: 12px 24px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #EFF3F4; }
        td { padding: 14px 24px; border-bottom: 1px solid #EFF3F4; color: #0F1419; }
        tr:last-child td { border-bottom: none; }
        tr:hover { background: #F7F9F9; }
        
        .badge { padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; text-transform: uppercase; display: inline-block; }
        .badge.started { background: #EFF3F4; color: #536471; }
        .badge.success { background: #E7F9F0; color: #00BA7C; }
        .badge.failed { background: #FEE7EF; color: #F91880; }
        .badge.warning { background: #FFF7D6; color: #997813; }
        .badge.skipped { background: #E1E8ED; color: #536471; }
        
        .msg-text { font-family: monospace; font-size: 13px; color: #0F1419; }
        .detail-text { color: #536471; font-size: 13px; }

        .spinner { animation: spin 1s linear infinite; display: inline-block; width: 14px; height: 14px; border: 2px solid #ccc; border-top-color: #333; border-radius: 50%; vertical-align: middle; margin-right: 5px; }
        @keyframes spin { to { transform: rotate(360deg); } }
    </style>
</head>
<body>
    <div class="header">
        <h1>Forward PEG Analysis - System Status</h1>
        <a href="/" class="btn-back">← Back to Dashboard</a>
    </div>

    <div class="container">
        <!-- Health Section -->
        <h2 style="font-size: 14px; color: #536471; margin: 0 0 12px 4px; font-weight: 600;">SYSTEM HEALTH</h2>
        <div class="health-grid">
            <div class="card">
                <div class="card-label">Database Status</div>
                <div class="card-value" id="dbStatus"><div class="spinner"></div> Checking...</div>
            </div>
            <div class="card">
                <div class="card-label">Environment</div>
                <div class="card-value" id="envStatus"><div class="spinner"></div> Checking...</div>
            </div>
            <div class="card">
                <div class="card-label">Last Cron Run</div>
                <div class="card-value" id="lastRunTime">...</div>
            </div>
        </div>

        <!-- Daily Summary (New) -->
        <h2 style="font-size: 14px; color: #536471; margin: 0 0 12px 4px; font-weight: 600;">DAILY PERFORMANCE (LAST 24h)</h2>
        <div class="summary-card">
            <div class="summary-grid">
                <div class="stat-item">
                    <div class="stat-num" id="quotesUpdated">-</div>
                    <div class="stat-sub">QUOTES UPDATED</div>
                </div>
                <div class="stat-item">
                    <div class="stat-num" id="statsProcessed">-</div>
                    <div class="stat-sub">STATS PROCESSED</div>
                </div>
                <div class="stat-item">
                    <div class="stat-num" id="successRate">-</div>
                    <div class="stat-sub">JOB SUCCESS RATE</div>
                </div>
                <div class="stat-item">
                    <div class="stat-num" id="completionTime" style="color: #1D9BF0;">-</div>
                    <div class="stat-sub">COMPLETION TIME</div>
                </div>
            </div>

        </div>



        <!-- Logs Section -->
        <h2 style="font-size: 14px; color: #536471; margin: 0 0 12px 4px; font-weight: 600;">EXECUTION LOGS</h2>
        <div class="logs-section">
            <div class="section-header">
                <h3 class="section-title">Last 50 Runs</h3>
                <button class="refresh-btn" onclick="fetchData()">↻ Refresh</button>
            </div>
            <table>
                <thead>
                    <tr>
                        <th style="width: 150px;">Timestamp</th>
                        <th style="width: 100px;">Status</th>
                        <th>Message</th>
                        <th>Details</th>
                    </tr>
                </thead>
                <tbody id="logsBody">
                    <tr><td colspan="4" style="text-align:center; padding: 40px; color: #999;">Loading logs...</td></tr>
                </tbody>
            </table>
        </div>
    </div>

    <script>
        async function fetchData() {
            // Parallel Fetch
            try {
                const [healthRes, logsRes, summaryRes] = await Promise.all([
                    fetch('/api/health'),
                    fetch('/api/cron-logs'),
                    fetch('/api/cron-summary')
                ]);

                const health = await healthRes.json();
                const logs = await logsRes.json();
                const summary = await summaryRes.json();

                renderHealth(health);
                renderLogs(logs.logs || []);
                renderSummary(summary);

            } catch (e) {
                console.error(e);
                alert('Failed to load system data');
            }
        }

        function renderHealth(data) {
            const dbEl = document.getElementById('dbStatus');
            const envEl = document.getElementById('envStatus');
            const lastRunEl = document.getElementById('lastRunTime');

            // DB
            if (data.status === 'healthy' || data.checks.db === 'ok') {
                dbEl.innerHTML = '<span class="status-dot ok"></span> Connected';
            } else {
                dbEl.innerHTML = '<span class="status-dot error"></span> Error';
            }

            // Env
            if (data.checks.env.ALPHA_VANTAGE === 'set') {
                envEl.innerHTML = 'Alpha Vantage Set';
                envEl.style.color = '#00BA7C';
            } else {
                envEl.innerHTML = 'Key Missing';
                envEl.style.color = '#F91880';
            }

            // Last Run
            lastRunEl.textContent = data.checks.cron + ' EST';
        }

        function renderSummary(data) {
            const total = data.totalTracked || 0;
            const updated = data.quotesUpdated || 0;
            const processed = data.statsProcessed || 0;
            
            // Quotes Updated
            const qEl = document.getElementById('quotesUpdated');
            qEl.textContent = updated + ' of ' + (total || '?');
            if (total > 0 && updated < total) {
                qEl.classList.add('text-warn');
            } else {
                qEl.classList.remove('text-warn');
            }

            // Stats Processed
            const sEl = document.getElementById('statsProcessed');
            sEl.textContent = processed + ' of ' + (total || '?');
             if (total > 0 && processed < total) {
                sEl.classList.add('text-warn');
            } else {
                sEl.classList.remove('text-warn');
            }
            
            const rateEl = document.getElementById('successRate');
            rateEl.textContent = data.successRate + '%';
            rateEl.style.color = data.successRate == 100 ? '#00BA7C' : (data.successRate > 90 ? '#FFD400' : '#F91880');

            document.getElementById('completionTime').textContent = data.lastCompletion || '-';
        }

        function renderLogs(logs) {
            const tbody = document.getElementById('logsBody');
            tbody.innerHTML = '';
            
            if (logs.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 20px;">No logs found</td></tr>';
                return;
            }

            logs.forEach(log => {
                const tr = document.createElement('tr');
                let statusClass = log.status.toLowerCase();
                if (log.status === 'STARTED') statusClass = 'started';
                
                tr.innerHTML = \`
                    <td><span class="msg-text">\${log.timestamp.split(' ')[1]}</span></td>
                    <td><span class="badge \${statusClass}">\${log.status}</span></td>
                    <td class="msg-text">\${log.message}</td>
                    <td class="detail-text">\${log.details || '-'}</td>
                \`;
                tbody.appendChild(tr);
            });
        }



        // Initial Load
        fetchData();
        // Auto-refresh logs every 60s
        setInterval(fetchData, 60000);
    </script>
</body>
</html>`;
