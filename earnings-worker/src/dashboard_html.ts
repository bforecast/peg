// Dashboard HTML exported as string
export const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Earnings Beats</title>
    <style>
        :root {
            --bg-color: #FAFAFA;
            --text-color: #111;
            --table-header-bg: #F0F0F0;
            --border-color: #DDD;
            --positive-bg: #4CAF50;
            --positive-text: #006400;
            --negative-bg: #F44336;
            --negative-text: #8B0000;
            --warning-bg: #FF9800;
            --highlight-green: #00FF00; 
        }

        body {
            font-family: 'Courier New', Courier, monospace; 
            background-color: var(--bg-color);
            color: var(--text-color);
            margin: 0;
            padding: 5px; /* Reduced from 20px */
        }

        h1 {
            text-align: center;
            font-size: 2rem; /* Reduce header size */
            margin-bottom: 15px;
            font-family: 'Courier New', Courier, monospace;
            font-weight: bold;
        }

        .container {
            max-width: 100%; /* Fill available width */
            margin: 0 auto;
            overflow-x: auto;
            background: white;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            border-radius: 4px;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; 
            font-size: 11px; /* Reduced from 13px */
        }

        th {
            background-color: var(--table-header-bg);
            padding: 8px 4px; /* Reduced padding */
            text-align: right; 
            font-weight: 600;
            white-space: nowrap;
            border-bottom: 2px solid var(--border-color);
            color: #555;
            user-select: none;
            font-size: 11px;
        }
        
        /* Sortable Headers */
        th.sortable {
            cursor: pointer;
            text-decoration: underline dotted;
        }
        th.sortable:hover {
            background-color: #E0E0E0;
            color: #000;
        }
        
        th:nth-child(1), th:nth-child(2) {
            text-align: left; 
        }

        /* Chart column center */
        th:nth-child(8), td:nth-child(8) {
            text-align: center;
            width: 80px; /* Reduced from 120px */
        }
        
        /* RS Rank column center */
        th:nth-child(11), td:nth-child(11) {
            text-align: center;
            width: 60px; /* Reduced from 80px */
        }
        
        /* SMA columns center */
        th:nth-child(12), th:nth-child(13), th:nth-child(14),
        td:nth-child(12), td:nth-child(13), td:nth-child(14) {
            text-align: center;
            width: 30px; /* Reduced from 40px */
            padding: 0;
        }

        td {
            padding: 6px 4px; /* Reduced padding */
            border-bottom: 1px solid #EEE;
            text-align: right;
            vertical-align: middle;
            font-weight: 600; /* Bold numbers */
        }
        
        td:nth-child(1), td:nth-child(2) {
            text-align: left;
        }
        
        /* Company Name: Truncate if too long */
        td:nth-child(2) {
            max-width: 140px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        /* Ticker column */
        .ticker-cell {
            font-weight: bold;
            display: flex;
            align-items: center;
            gap: 4px; /* Reduced gap */
        }
        .ticker-icon {
            width: 16px; /* Reduced size */
            height: 16px;
            /* background: #EEE; Removed to prevent flash of gray box */
            border-radius: 4px;
            display: none; /* Hidden by default */
            object-fit: contain;
        }

        /* Sparkline */
        .sparkline {
            width: 80px; /* Match column width */
            height: 25px; /* Slightly shorter */
            display: block;
            margin: 0 auto;
        }
        .sparkline path {
            fill: none;
            stroke: #4CAF50;
            stroke-width: 1.5;
        }
        .sparkline.down path {
            stroke: #F44336;
        }

        /* Heatmap cells */
        .heatmap-cell {
            color: black;
            font-weight: 500;
        }
        .heatmap-pos-high { background-color: #00C853; color: white; }
        .heatmap-pos-med { background-color: #69F0AE; color: black; }
        .heatmap-pos-low { background-color: #B9F6CA; color: black; }
        .heatmap-neg-low { background-color: #FFCDD2; color: black; }
        .heatmap-neg-high { background-color: #EF5350; color: white; }

        /* Delta 52w High bars */
        .delta-bar-container {
            display: flex;
            align-items: center;
            justify-content: flex-end;
            gap: 5px;
        }
        .delta-bar {
            height: 12px;
            background-color: #FF9800;
            border-radius: 2px;
        }
        .delta-bar.red { background-color: #F44336; }

        /* RS Rank Bars */
        .rs-rank-bar {
            display: flex;
            align-items: flex-end;
            height: 20px;
            gap: 2px;
            justify-content: center;
        }
        .rs-bar-segment {
            width: 3px;
            background-color: #E0E0E0;
        }
        .rs-bar-segment.filled {
            background-color: #4CAF50;
        }

        /* SMA Arrows */
        .sma-arrow {
            font-size: 12px;
        }
        .sma-up { color: #4CAF50; }
        .sma-down { color: #F44336; }

        /* Footer */
        .footer {
            margin-top: 20px;
            display: flex;
            justify-content: space-between;
            color: #666;
            font-size: 0.9rem;
        }
        
        .loading-overlay {
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(255,255,255,0.9);
            display: flex;
            justify-content: center;
            align-items: center;
            font-size: 1.5rem;
            z-index: 100;
            flex-direction: column;
        }
        
        .spinner {
            border: 4px solid #f3f3f3;
            border-top: 4px solid #333;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin-bottom: 15px;
        }
        
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }

    </style>
</head>
<body>
    <h1>AI Earnings Beats</h1>

    <div class="container">
        <table>
            <thead>
                <tr>
                    <th>Ticker</th>
                    <th>Company</th>
                    <th>Price</th>
                    <th>Market Cap</th>
                    <th class="sortable" onclick="sortData('ps')">P/S <span id="sort-ps"></span></th>
                    <th class="sortable" onclick="sortData('pe')">P/E <span id="sort-pe"></span></th>
                    <th class="sortable" onclick="sortData('changeYTD')">% YTD <span id="sort-changeYTD"></span></th>
                    <th>Chart 1Y</th>
                    <th class="sortable" onclick="sortData('change1Y')">% 1Y <span id="sort-change1Y"></span></th>
                    <th>Δ 52w High</th>
                    <th>RS Rank 1M</th>
                    <th>20SMA</th>
                    <th>50SMA</th>
                    <th>200SMA</th>
                </tr>
            </thead>
            <tbody id="tableBody">
                <!-- Rows will be injected here -->
            </tbody>
            <tfoot>
                <tr style="background: #F9F9F9; font-weight: bold;">
                    <td colspan="4" style="text-align: right;">Avg.</td>
                    <td id="avgPS">-</td>
                    <td id="avgPE">-</td>
                    <td colspan="8"></td>
                </tr>
            </tfoot>
        </table>
    </div>

    <div class="footer">
        <div>
            <span style="font-weight: bold;">by Forward PEG System</span>
        </div>
        <div id="currentDate">December 11, 2025</div>
    </div>

    <div id="loading" class="loading-overlay">
        <div class="spinner"></div>
        <div>Loading Market Data...</div>
    </div>

    <script>
        const AI_TICKERS = [
            "SNDK", "LITE", "WDC", "CLS", "STX", 
            "CIEN", "FN", "SANM", "CRDO", "VICR", 
            "COHR", "APH", "AVGO", "GOOGL", "TER", 
            "NVT", "VRT", "TSM", "ALAB", "NVDA"
        ];

        let dashboardData = []; // Store data for sorting
        let currentSort = { key: null, dir: 'desc' };

        // Fetch data on load
        window.addEventListener('load', async () => {
            const dateEl = document.getElementById('currentDate');
            const now = new Date();
            dateEl.textContent = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

            try {
                const response = await fetch('/api/dashboard-data');
                const data = await response.json();
                dashboardData = data;
                
                // Default Sort: % YTD (Desc)
                sortData('changeYTD');
                
                document.getElementById('loading').style.display = 'none';
            } catch (e) {
                console.error(e);
                document.getElementById('loading').innerHTML = 'Error loading data. Please refresh.';
            }
        });
        
        function sortData(key) {
            // Toggle direction if same key, else default to 'desc'
            if (currentSort.key === key) {
                currentSort.dir = currentSort.dir === 'desc' ? 'asc' : 'desc';
            } else {
                currentSort.key = key;
                currentSort.dir = 'desc'; // Default high to low often useful? Or low to high for P/E? 
                // Let's stick to toggle.
            }
            
            // Update Icons
            document.querySelectorAll('thead th span').forEach(sp => sp.textContent = '');
            const arrow = currentSort.dir === 'asc' ? '▲' : '▼';
            const iconId = 'sort-' + key;
            const iconEl = document.getElementById(iconId);
            if(iconEl) iconEl.textContent = arrow;

            // Sort
            dashboardData.sort((a, b) => {
                let valA = a[key];
                let valB = b[key];
                
                // Handling for P/E and P/S: N/A is "Worst" (Infinity)
                // This means in Descending sort (Worst first), N/A appears at top.
                // In Ascending sort (Best first), N/A appears at bottom.
                if (key === 'pe' || key === 'ps') {
                    if (valA === null || valA === undefined) valA = Infinity;
                    if (valB === null || valB === undefined) valB = Infinity;
                }
                
                // Handle equality (including Infinity vs Infinity)
                if (valA === valB) return 0;
                
                // Handle nulls for other columns (push to bottom)
                const isNullA = (valA === null || valA === undefined);
                const isNullB = (valB === null || valB === undefined);
                
                if (isNullA) return 1; 
                if (isNullB) return -1;
                
                // Standard Numeric Sort
                return currentSort.dir === 'asc' ? (valA - valB) : (valB - valA);
            });
            
            renderTable(dashboardData);
        }

        function formatMarketCap(num) {
            if (!num) return '-';
            if (num >= 1e12) return '$' + (num / 1e12).toFixed(1) + 'T';
            if (num >= 1e9) return '$' + (num / 1e9).toFixed(1) + 'B';
            if (num >= 1e6) return '$' + (num / 1e6).toFixed(1) + 'M';
            return '$' + num.toLocaleString();
        }

        // Color Logic for P/S and P/E
        function getValuationColor(value, type) {
            // Font always balck
            const baseStyle = 'color: black; font-weight: bold; border-radius: 4px; padding: 2px 6px;';
            
            let score = 0; // 0.0 (Good) to 1.0 (Bad)
            
            if (!value && value !== 0) {
                // N/A -> Worst -> Score 1.0 (Darkest Brown)
                score = 1.0;
            } else {
                if (type === 'ps') {
                    // Range 0 to 20
                    if (value <= 2) score = 0;
                    else if (value >= 15) score = 1;
                    else score = (value - 2) / 13;
                } else { // pe
                    // Range 0 to 60
                    if (value <= 10) score = 0;
                    else if (value >= 60) score = 1;
                    else score = (value - 10) / 50;
                }
            }
            
            const sr=255, sg=250, sb=230;
            const er=210, eg=160, eb=100; // Brownish
            
            const r = Math.round(sr + score * (er - sr));
            const g = Math.round(sg + score * (eg - sg));
            const b = Math.round(sb + score * (eb - sb));
            
            // return \`background-color: rgb(\${r}, \${g}, \${b}); \${baseStyle}\`;
            return ''; // We use getGradientColor in renderTable now
        }

        // Gradient Helper
        function getGradientColor(value, min, max, r, g, b) {
            if (value === null || value === undefined) return ''; // Handle separately
            if (min === max) return '';
            
            let ratio = (value - min) / (max - min);
            if (ratio < 0) ratio = 0;
            if (ratio > 1) ratio = 1;
            
            // White (255,255,255) to Target (r,g,b)
            const nr = Math.round(255 + ratio * (r - 255));
            const ng = Math.round(255 + ratio * (g - 255));
            const nb = Math.round(255 + ratio * (b - 255));
            
            return \`background-color: rgb(\${nr}, \${ng}, \${nb}); color: black;\`;
        }

        function createSparkline(prices) {
            if (!prices || prices.length < 2) return '';
            const min = Math.min(...prices);
            const max = Math.max(...prices);
            const range = max - min;
            const width = 100;
            const height = 30;
            
            // Normalize
            const points = prices.map((p, i) => {
                const x = (i / (prices.length - 1)) * width;
                const y = height - ((p - min) / range) * height;
                return \`\${x},\${y}\`;
            }).join(' ');

            const isDown = prices[prices.length-1] < prices[0];
            const className = isDown ? 'sparkline down' : 'sparkline';

            return \`<svg class="\${className}" viewBox="0 0 100 30">
                <path d="M\${points}" />
            </svg>\`;
        }

        function renderTable(data) {
            const tbody = document.getElementById('tableBody');
            let totalPE = 0, totalPS = 0, countPE = 0, countPS = 0;
            
            // 1. Calculate Ranges for Gradients
            // Filter valid numbers
            const psVals = data.map(d => d.ps).filter(v => v !== null && v > 0);
            const peVals = data.map(d => d.pe).filter(v => v !== null && v > 0);
            const ytdVals = data.map(d => d.changeYTD).filter(v => v !== null);
            const oneYVals = data.map(d => d.change1Y).filter(v => v !== null);

            // Min/Max
            const minPS = psVals.length ? Math.min(...psVals) : 0;
            const maxPS = psVals.length ? Math.max(...psVals) : 20; 
            
            const minPE = peVals.length ? Math.min(...peVals) : 0;
            const maxPE = peVals.length ? Math.max(...peVals) : 60;
            
            // % YTD, 1Y: White -> Green
            const minYTD = 0; 
            const maxYTD = ytdVals.length ? Math.max(...ytdVals) : 100;
            const min1Y = 0;
            const max1Y = oneYVals.length ? Math.max(...oneYVals) : 100;


            const rows = data.map(stock => {
                if (stock.pe) { totalPE += stock.pe; countPE++; }
                if (stock.ps) { totalPS += stock.ps; countPS++; }

                const price = stock.price || 0;
                const changeYTD = stock.changeYTD || 0;
                const change1Y = stock.change1Y || 0;
                const deltaHigh = stock.delta52wHigh || 0; 
                
                const deltaWidth = Math.min(Math.abs(deltaHigh) * 2, 80); 
                const deltaColorClass = Math.abs(deltaHigh) > 20 ? 'red' : '';

                // Styles
                // P/S, P/E: Orange (255, 152, 0)
                const psStyle = getGradientColor(stock.ps, minPS, maxPS, 255, 200, 100); 
                let peStyle = getGradientColor(stock.pe, minPE, maxPE, 255, 200, 100);
                
                // N/A P/E Fix: "Worst" -> Solid Color (Max Intensity)
                if (!stock.pe && stock.pe !== 0) {
                     peStyle = 'background-color: rgb(255, 180, 100); color: black;'; 
                }

                // % YTD, 1Y: White -> Green (76, 175, 80) #4CAF50
                const ytdStyle = getGradientColor(stock.changeYTD, minYTD, maxYTD, 76, 175, 80);
                const oneYStyle = getGradientColor(stock.change1Y, min1Y, max1Y, 76, 175, 80);

                // RS Rank Bars
                const rankHistory = stock.rsRankHistory || [];
                const barWidth = 3;
                const gap = 1;
                const h = 20; 
                
                const rsBars = rankHistory.map((rank, i) => {
                    const height = (rank / 100) * h;
                    const y = h - height;
                    const x = i * (barWidth + gap);
                    let barColor = '#4CAF50'; 
                    if (rank >= 99) barColor = '#006400';
                    return \`<rect x="\${x}" y="\${y}" width="\${barWidth}" height="\${height}" fill="\${barColor}" />\`;
                }).join('');
                const width = rankHistory.length * (barWidth + gap);

                return \`
                <tr>
                    <td class="ticker-cell">
                        <img src="https://logo.clearbit.com/\${stock.symbol.toLowerCase()}.com" 
                             onload="this.style.display='inline-block'"
                             onerror="this.remove()" 
                             class="ticker-icon">
                        \${stock.symbol}
                    </td>
                    <td>\${stock.name}</td>
                    <td>$\${price.toFixed(2)}</td>
                    <td>\${formatMarketCap(stock.marketCap)}</td>
                    <td style="\${psStyle}">\${stock.ps ? stock.ps.toFixed(2) : '-'}</td>
                    <td style="\${peStyle}">\${stock.pe ? stock.pe.toFixed(2) : 'n/a'}</td>
                    <td style="\${ytdStyle}">+\${changeYTD.toFixed(2)}%</td>
                    <td>\${createSparkline(stock.history)}</td>
                    <td style="\${oneYStyle}">+\${change1Y.toFixed(2)}%</td>
                    <td>
                        <div class="delta-bar-container">
                            <div class="delta-bar \${deltaColorClass}" style="width: \${deltaWidth}px;"></div>
                            <div>\${deltaHigh.toFixed(2)}%</div>
                        </div>
                    </td>
                    <td>
                        <svg width="\${width}" height="20">
                            \${rsBars}
                        </svg>
                    </td>
                    <td>\${stock.sma20 ? '<span class="sma-arrow sma-up">▲</span>' : '<span class="sma-arrow sma-down">▼</span>'}</td>
                    <td>\${stock.sma50 ? '<span class="sma-arrow sma-up">▲</span>' : '<span class="sma-arrow sma-down">▼</span>'}</td>
                    <td>\${stock.sma200 ? '<span class="sma-arrow sma-up">▲</span>' : '<span class="sma-arrow sma-down">▼</span>'}</td>
                </tr>
                \`;
            }).join('');

            tbody.innerHTML = rows;

            document.getElementById('avgPS').textContent = countPS ? (totalPS / countPS).toFixed(2) : '-';
            document.getElementById('avgPE').textContent = countPE ? (totalPE / countPE).toFixed(2) : '-';
        }
    </script>
</body>
</html>`;
