export const STOCK_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Stock Analysis</title>
    <link rel="icon" type="image/x-icon" href="/favicon.ico">
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        :root {
            --bg-color: #f8f9fa;
            --card-bg: #ffffff;
            --text-main: #0F1419;
            --text-secondary: #536471;
            --accent-green: #00BA7C;
            --accent-red: #F91880;
            --accent-blue: #1D9BF0;
            --border-color: #eff3f4;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            margin: 0;
            padding: 0;
            background: var(--bg-color);
            color: var(--text-main);
            box-sizing: border-box;
        }
        *, *:before, *:after { box-sizing: inherit; }
        
        /* Header */
        header {
            background: #111;
            color: white;
            padding: 12px 20px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .logo { 
            font-weight: 700; 
            text-decoration: none; 
            color: white; 
            font-size: 1.1rem;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        /* Layout */
        .container {
            max-width: 1200px;
            margin: 20px auto;
            padding: 0 20px;
            display: grid;
            grid-template-columns: 2fr 1fr;
            grid-template-areas: 
                "header header"
                "chart metrics"
                "earnings holdings";
            gap: 20px;
        }

        .symbol-header { grid-area: header; }
        .chart-section { grid-area: chart; }
        .metrics-section { grid-area: metrics; }
        .earnings-section { grid-area: earnings; }
        .holdings-section { grid-area: holdings; }

        @media (max-width: 1024px) {
            .container { 
                display: flex !important; 
                flex-direction: column !important; 
            }
            .chart-section { order: 1; }
            .metrics-section { order: 2; }
            .earnings-section { order: 3; }
            .holdings-section { order: 4; }
            
            /* Compact Header for Mobile: Ticker + Price + Change + Link in one line */
            .symbol-header { 
                flex-direction: row !important; 
                align-items: center !important; 
                gap: 4px; 
                flex-wrap: nowrap; 
                width: 100%;
                justify-content: flex-start;
            }
            .ticker { font-size: 1.2rem !important; margin-right: 2px; white-space: nowrap; }
            .price-info { display: flex !important; align-items: center !important; gap: 4px; flex-wrap: nowrap; }
            .current-price { font-size: 1.1rem !important; white-space: nowrap; }
            .change-pill { font-size: 0.8rem !important; padding: 2px 6px !important; white-space: nowrap; }
            .badge-container { width: auto; margin-left: 0; display:flex; align-items:center; }
            
            /* Flatten Metrics Grid if needed */
            .metrics-grid { grid-template-columns: 1fr 1fr; gap: 10px; }
        }
        @media (max-width: 480px) {
            .metrics-grid { grid-template-columns: 1fr; }
            .ticker { font-size: 2rem; }
        }

        .card {
            background: var(--card-bg);
            border-radius: 12px;
            padding: 20px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.05);
            margin-bottom: 20px;
        }
        .full-width { grid-column: 1 / -1; }

        /* Typography */
        h1, h2, h3 { margin: 0 0 10px 0; }
        .symbol-header {
            display: flex;
            align-items: baseline;
            gap: 15px;
            margin-bottom: 20px;
        }
        .ticker { font-size: 2.5rem; font-weight: 800; letter-spacing: -0.5px; }
        .price-info { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .current-price { font-size: 1.8rem; font-weight: 600; }
        .change-pill {
            padding: 4px 10px;
            border-radius: 20px;
            font-size: 0.9rem;
            font-weight: 700;
        }
        .badge-container { display: flex; gap: 10px; margin-left: auto; }
        .metric-badge {
            padding: 6px 12px;
            border-radius: 6px;
            font-size: 0.9rem;
            font-weight: 600;
        }
        .badge-green { background: #e6fcf5; color: #008f5d; border: 1px solid #b7ebcf; }
        .badge-blue { background: #e8f5fd; color: #0c7abf; border: 1px solid #bde3f9; }

        /* Chart */
        .chart-container {
            position: relative;
            height: 400px;
            width: 100%;
        }
        canvas {
            width: 100% !important;
            height: 100% !important;
        }

        /* Metrics Grid */
        .metrics-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 1px;
            background: var(--border-color); /* For grid border effect */
            border-radius: 8px;
            overflow: hidden;
            border: 1px solid var(--border-color);
        }
        .metric-item {
            background: white;
            padding: 15px;
            display: flex;
            flex-direction: column;
        }
        .metric-label { font-size: 0.85rem; color: var(--text-secondary); margin-bottom: 4px; }
        .metric-value { font-size: 1.1rem; font-weight: 600; }

        /* Tables */
        .data-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 0.9rem;
        }
        .data-table th { text-align: left; color: var(--text-secondary); padding: 8px; border-bottom: 1px solid var(--border-color); font-weight: 600; }
        .data-table td { padding: 8px; border-bottom: 1px solid var(--border-color); }
        .data-table tr:last-child td { border-bottom: none; }
        
        .loading { text-align: center; padding: 40px; color: var(--text-secondary); font-style: italic; }
        .error-msg { text-align: center; padding: 40px; color: var(--accent-red); }

        /* Portfolio Cards */
        .portfolio-list { display: flex; flex-direction: column; gap: 10px; }
        .port-card {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px;
            background: #f8f9fa;
            border-radius: 8px;
            text-decoration: none;
            color: inherit;
            transition: background 0.2s;
        }
        .port-card:hover { background: #eff3f4; }
        .alloc-badge { font-family: monospace; font-weight: 700; background: #ddd; padding: 2px 6px; border-radius: 4px; }

    </style>
</head>
<body>

<header>
    <a href="/" class="logo">
        <svg  xmlns="http://www.w3.org/2000/svg"  width="24"  height="24"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"  class="icon icon-tabler icons-tabler-outline icon-tabler-chart-line"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M4 19l16 0" /><path d="M4 15l4 -6l4 2l4 -5l4 4" /></svg>
        Brilliant Forecast Portfolios
    </a>
</header>

<div class="container" id="mainContent">
    <div class="full-width loading" id="loading">Loading stock data...</div>
</div>

<script>
    const symbol = window.location.pathname.split('/').pop();
    const container = document.getElementById('mainContent');
    const loadEl = document.getElementById('loading');

    // Utility for colors
    const GREEN = '#00BA7C';
    const RED = '#F91880';

    async function init() {
        try {
            const res = await fetch('/api/stock-details/' + symbol);
            if(!res.ok) throw new Error(res.statusText);
            const data = await res.json();
            render(data);
        } catch(e) {
            loadEl.style.display = 'none';
            container.innerHTML = \`<div class="full-width error-msg">Error loading data: \${e.message}</div>\`;
        }
    }

    function fmtNum(n, decimals=2, suffix='') {
        if(n == null) return '-';
        return n.toLocaleString(undefined, {minimumFractionDigits: decimals, maximumFractionDigits: decimals}) + suffix;
    }

    function render(data) {
        loadEl.remove();
        const q = data.quote;
        
        // Calculate Derived Metrics
        const epsC = q.eps_current_year || 0;
        const epsN = q.eps_next_year || 0;
        const growth = epsC !== 0 ? ((epsN - epsC) / Math.abs(epsC)) * 100 : 0;
        const peg = (growth > 0 && q.forward_pe > 0) ? (q.forward_pe / growth) : null;
        
        // Scale Percentages (DB stores decimals 0.01 = 1%)
        const priceChange = (q.change_percent || 0) * 100;
        const offHigh = (q.fifty_two_week_high_change_percent || 0) * 100;
        const divYield = (q.dividend_yield || 0) * 100;

        const changeColor = priceChange >= 0 ? GREEN : RED;
        const arrow = priceChange >= 0 ? '&#8599;' : '&#8600;';

        // 1. Header & Quote Section
        const headerHtml = \`
            <div class="full-width symbol-header">
                <div class="ticker">\${q.symbol}</div>
                <div class="price-info">
                    <span class="current-price">\$\${fmtNum(q.price)}</span>
                    <span class="change-pill" style="background:\${changeColor}20; color:\${changeColor}">
                        \${arrow} \${fmtNum(Math.abs(priceChange), 2, '%')}
                    </span>
                    <a href="https://xueqiu.com/S/\${q.symbol}" target="_blank" style="display:flex; align-items:center; justify-content:center; text-decoration:none; background:#f5f8fa; padding:4px 8px; border-radius:12px; transition:background 0.2s; margin-left:4px;" onmouseover="this.style.background='#e1e8ed'" onmouseout="this.style.background='#f5f8fa'" title="View on Xueqiu">
                        <img src="https://xueqiu.com/favicon.ico" width="16" height="16" alt="xueqiu" style="border-radius:2px;">
                    </a>
                </div>
                <div class="badge-container">
                    \${q.rs_rank ? \`<div class="metric-badge badge-green">RS Rank: \${q.rs_rank}</div>\` : ''}
                </div>
            </div>
        \`;

        const chartHtml = \`
            <div class="card chart-section">
                <h3>Price History (1Y)</h3>
                <div class="chart-container">
                    <canvas id="priceChart"></canvas>
                </div>
            </div>
        \`;

        // Calculate YTD Change
        // Find price at start of current year (e.g. 2024-01-01)
        const currentYear = new Date().getFullYear();
        // Use first trading day of current year
        const startOfYearPrice = data.history.find(h => h.date >= \`\${currentYear}-01-01\`)?.close;
        const ytdChange = startOfYearPrice ? ((q.price - startOfYearPrice) / startOfYearPrice) * 100 : 0;
        const ytdColor = ytdChange >= 0 ? GREEN : RED;

        // 3. Metrics Grid (Valuation Left, Stats Right)
        // We arrange them in pairs: [Valuation Item, Stats Item] so they fill Row 1, Row 2...
        const metricsHtml = \`
            <div class="card metrics-section">
                <h3>Valuation & Stats</h3>
                <div class="metrics-grid">
                    <!-- Row 1 -->
                    <div class="metric-item">
                        <span class="metric-label">Market Cap</span>
                        <span class="metric-value">\$\${fmtNum(q.market_cap / 1000000000, 2, 'B')}</span>
                    </div>
                    <div class="metric-item">
                        <span class="metric-label">EPS (TTM)</span>
                         <span class="metric-value">\$\${fmtNum(q.eps_current_year)}</span>
                    </div>

                    <!-- Row 2 -->
                    <div class="metric-item">
                        <span class="metric-label">Forward PE</span>
                        <span class="metric-value">\${fmtNum(q.forward_pe)}</span>
                    </div>
                    <div class="metric-item">
                        <span class="metric-label">% YTD</span>
                        <span class="metric-value" style="color:\${ytdColor} !important">\${fmtNum(ytdChange, 2, '%')}</span>
                    </div>

                    <!-- Row 3 -->
                    <div class="metric-item">
                        <span class="metric-label">Trailing PE</span>
                        <span class="metric-value">\${fmtNum(q.pe_ratio)}</span>
                    </div>
                    <div class="metric-item">
                        <span class="metric-label">52W High</span>
                         <span class="metric-value">\${fmtNum(q.fifty_two_week_high)}</span>
                    </div>

                    <!-- Row 4 -->
                    <div class="metric-item">
                        <span class="metric-label">PEG Ratio</span>
                        <span class="metric-value" style="color:#0c7abf">\${peg ? peg.toFixed(2) : '-'}</span>
                    </div>
                     <div class="metric-item">
                        <span class="metric-label">% 52w High</span>
                         <span class="metric-value" style="color:red">\${fmtNum(offHigh, 2, '%')}</span>
                    </div>

                    <!-- Row 5 -->
                    <div class="metric-item">
                        <span class="metric-label">PS Ratio</span>
                        <span class="metric-value">\${fmtNum(q.ps_ratio)}</span>
                    </div>
                     <div class="metric-item">
                        <span class="metric-label">Div Yield</span>
                         <span class="metric-value">\${fmtNum(divYield, 2, '%')}</span>
                    </div>
                </div>
            </div>
        \`;

        // 4. Earnings
        let earningsRows = '';
        data.earnings.forEach(e => {
            const beat = (e.surprise_percentage || 0) > 0;
            const surpriseClass = beat ? 'color:'+GREEN : (e.surprise_percentage < 0 ? 'color:'+RED : '');
            
            earningsRows += \`<tr>
                <td>\${e.fiscal_date_ending}</td>
                <td>\$\${fmtNum(e.estimated_eps)}</td>
                <td>\$\${fmtNum(e.reported_eps)}</td>
                <td style="\${surpriseClass}">\${e.surprise_percentage != null ? fmtNum(e.surprise_percentage, 1, '%') : '-'}</td>
            </tr>\`;
        });
        
        const earningsHtml = \`
            <div class="card earnings-section">
                <h3>Earnings History</h3>
                <table class="data-table">
                    <thead><tr><th>Period Ends</th><th>Est</th><th>Rep</th><th>Surprise</th></tr></thead>
                    <tbody>\${earningsRows || '<tr><td colspan="4">No data</td></tr>'}</tbody>
                </table>
            </div>
        \`;

        // 5. Holdings
        let portRows = '';
        data.holdings.forEach(h => {
            portRows += \`<a href="/portfolio/\${h.id}" class="port-card">
                <span>\${h.name}</span>
                <span class="alloc-badge">\${fmtNum(h.allocation, 1, '%')}</span>
            </a>\`;
        });
        
         const holdingsHtml = \`
            <div class="card holdings-section">
                <h3>Portfolio Ownership</h3>
                <div class="portfolio-list">
                    \${portRows || '<div style="color:#888">Not held in any active portfolios.</div>'}
                </div>
            </div>
        \`;

        // Assemble Layout
        container.innerHTML = \`
            \${headerHtml}
            \${chartHtml}
            \${metricsHtml}
            \${earningsHtml}
            \${holdingsHtml}
        \`;

        // Init Chart
        initChart(data.history);
    }

    function initChart(history) {
        if(!history || history.length === 0) return;
        
        const ctx = document.getElementById('priceChart').getContext('2d');
        const prices = history.map(h => h.close);
        const dates = history.map(h => h.date);
        
        // Gradient
        const gradient = ctx.createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, 'rgba(0, 186, 124, 0.2)');
        gradient.addColorStop(1, 'rgba(0, 186, 124, 0)');

        new Chart(ctx, {
            type: 'line',
            data: {
                labels: dates,
                datasets: [{
                    label: 'Price',
                    data: prices,
                    borderColor: '#00BA7C',
                    backgroundColor: gradient,
                    borderWidth: 2,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    fill: true,
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => '$' + ctx.parsed.y.toFixed(2)
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { maxTicksLimit: 6, maxRotation: 0 }
                    },
                    y: {
                        border: { display: false },
                        grid: { color: '#f0f0f0' }
                    }
                }
            }
        });
    }

    init();
</script>
</body>
</html>`;
