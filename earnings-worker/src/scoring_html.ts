export const SCORING_HTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Portfolio Scoring Framework</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f4f6f8; margin: 0; padding: 20px; color: #333; }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
        .card { background: white; border-radius: 8px; padding: 20px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
        h1 { font-size: 24px; font-weight: 600; margin: 0; }
        h2 { font-size: 18px; margin-top: 0; margin-bottom: 16px; border-bottom: 1px solid #eee; padding-bottom: 8px; }
        
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        @media (max-width: 768px) { .grid { grid-template-columns: 1fr; } }
        
        .score-display { text-align: center; padding: 20px; }
        .total-score { font-size: 48px; font-weight: 800; color: #2563eb; }
        .score-label { font-size: 14px; color: #666; text-transform: uppercase; letter-spacing: 1px; }
        
        .control-panel { display: flex; gap: 10px; align-items: center; margin-bottom: 20px; }
        select { padding: 8px 12px; border-radius: 6px; border: 1px solid #ddd; font-size: 14px; }
        button { background: #2563eb; color: white; border: none; padding: 10px 20px; border-radius: 6px; font-weight: 600; cursor: pointer; transition: background 0.2s; }
        button:hover { background: #1d4ed8; }
        button:disabled { background: #ccc; cursor: not-allowed; }

        .metric-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f0f0f0; }
        .metric-row:last-child { border: none; }
        .metric-name { color: #555; }
        .metric-val { font-weight: 600; }

        .opt-table { width: 100%; border-collapse: collapse; font-size: 14px; }
        .opt-table th { text-align: left; padding: 8px; background: #f8fafc; color: #64748b; font-weight: 600; }
        .opt-table td { padding: 8px; border-bottom: 1px solid #eee; }
        .text-up { color: #10b981; }
        .text-down { color: #ef4444; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Dual-Dimension Portfolio Scoring</h1>
            <a href="/" style="text-decoration: none; color: #666; font-size: 14px;">&larr; Back to Dashboard</a>
        </div>

        <!-- Controls -->
        <div class="card control-panel">
            <label>Select Portfolio:</label>
            <select id="portfolioSelect">
                <!-- Populated via JS -->
            </select>
            <button onclick="calculateScore()">Calculate Score</button>
        </div>

        <div class="grid">
            <!-- Score Card -->
            <div class="card">
                <!-- Header: Title + Score + Label -->
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #eee; padding-bottom: 10px; margin-bottom: 10px;">
                    <h2 style="margin:0; border:none; padding:0;">Total Score</h2>
                    <div style="display: flex; align-items: baseline; gap: 10px;">
                        <div id="totalScore" style="font-size: 2.2rem; font-weight: 700; color: #2563eb; line-height: 1;">--</div>
                        <div id="scoreLabel" style="font-size: 1rem; font-weight: 600; color: #10b981;">--</div>
                    </div>
                </div>
                
                <!-- CSS Grid Layout -->
                <div style="display: grid; grid-template-columns: 200px 1fr; gap: 0px; align-items: start;">
                    
                    <!-- Left Column: Gauge Only -->
                    <div style="text-align: center; border-right: 1px solid #eee; padding-right: 10px;">
                        <div style="height: 160px; display: flex; justify-content: center; align-items: center; overflow:hidden;">
                             <canvas id="gaugeChart" style="max-height:100%; max-width:100%;"></canvas>
                        </div>
                    </div>

                    <!-- Right Column: Sectioned Table -->
                    <div style="padding-left: 15px;">
                        <table class="opt-table" style="margin-top: 0; width: 100%; font-size: 13px;">
                            <thead>
                                <tr>
                                    <th style="padding: 6px;">Metric</th>
                                    <th style="padding: 6px;">Max</th>
                                    <th style="padding: 6px;">Cur</th>
                                    <th style="padding: 6px;">Opt</th>
                                </tr>
                            </thead>
                            <tbody id="scoreBreakdownBody">
                                <tr><td colspan="4" style="text-align: center; color: #999;">Loading...</td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- Dimensions Radar -->
            <div class="card">
                <h2>Dimensions Breakdown</h2>
                <div style="height: 300px;">
                    <canvas id="radarChart"></canvas>
                </div>
            </div>
        </div>

        <!-- Optimization -->
        <div class="card">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <h2>Weight Optimization</h2>
                <button onclick="runOptimization()" id="optBtn">Optimize</button>
            </div>
            
            <p style="font-size: 14px; color: #666; margin-bottom: 16px;">
                Maximize Forward Score (Profit + Industry) subject to Risk Constraints (Max Pos 18%).
                <br>
                <small>Note: Optimization focuses on Forward metrics. Total Score may drop if concentration increases (HHI Penalty) or if historical metrics are lower.</small>
            </p>

            <div style="margin-bottom: 20px;">
                <div>
                    <h3>Weight Changes</h3>
                    <table class="opt-table">
                        <thead>
                            <tr>
                                <th>Symbol</th>
                                <th>Industry</th>
                                <th>Growth</th>
                                <th>Current</th>
                                <th>Optimized</th>
                                <th>Change</th>
                            </tr>
                        </thead>
                        <tbody id="optBody">
                            <tr><td colspan="6" style="text-align: center; color: #999;">Run optimization to see results</td></tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>

    <script>
        // Init Charts
        let radarChart, gaugeChart;
        let currentDataFull = null; // Store full response for breakdown
        
        function initCharts() {
            // Radar
            const ctxR = document.getElementById('radarChart').getContext('2d');
            radarChart = new Chart(ctxR, {
                type: 'radar',
                data: {
                    labels: ['Profit Growth', 'Industry', 'Valuation', 'Macro', 'Calmar', 'HHI', 'Diversification'],
                    datasets: [{
                        label: 'Current Score',
                        data: [0, 0, 0, 0, 0, 0, 0],
                        fill: true,
                        backgroundColor: 'rgba(37, 99, 235, 0.2)',
                        borderColor: 'rgb(37, 99, 235)',
                        pointBackgroundColor: 'rgb(37, 99, 235)',
                    }]
                },
                options: {
                    scales: { r: { min: 0, max: 25, ticks: { display: false } } } // Approx scale max
                }
            });
        }
        
        /* Renders the Sectioned Breakdown Table */
        function renderBreakdownTable(current, optimized = null, optRaw = null) {
            const body = document.getElementById('scoreBreakdownBody');
            body.innerHTML = '';
            
            const f = (n) => n ? n.toFixed(1) : '0.0';
            const fRaw = (n, type) => {
                 if(n === undefined || n === null) return '-';
                 if(type === 'pct') return (n * 100).toFixed(1) + '%';
                 return n.toFixed(2);
            };

            const curComps = current.components;
            const curRaw = current.raw_metrics || {}; 
            const optComps = optimized || { forward: {}, history: {} };
            const isOpt = !!optimized;

            // Define Categories
            const categories = [
                {
                    title: "Forward Metrics (Growth)",
                    items: [
                        { n: 'Profit Growth', max: 15, key: 'profit', region: 'forward' },
                        { n: 'Industry Trend', max: 10, key: 'industry', region: 'forward' },
                        { n: 'Valuation', max: 10, key: 'valuation', region: 'forward' },
                        { n: 'Macro Policy', max: 5, key: 'macro', region: 'forward' }
                    ]
                },
                {
                    title: "Historical Metrics (Risk)",
                    items: [
                        { n: 'Calmar Ratio', max: 20, key: 'calmar', region: 'history', rawVal: curRaw.calmar, optRaw: optRaw?.calmar },
                        { n: 'HHI (Concentration)', max: 25, key: 'hhi', region: 'history', rawVal: curRaw.hhi, optRaw: optRaw?.hhi, type: 'pct' },
                        { n: 'Diversification', max: 15, key: 'dr', region: 'history', rawVal: curRaw.dr, optRaw: optRaw?.dr }
                    ]
                }
            ];

            categories.forEach(cat => {
                // 1. Calculate Sub-Sum
                let curSum = 0; 
                let optSum = 0;
                let maxSum = 0;

                cat.items.forEach(item => {
                    curSum += curComps[item.region][item.key] || 0;
                    if(isOpt) optSum += optComps[item.region][item.key] || 0;
                    maxSum += item.max;
                });

                // 2. Render Header Row
                // 2. Render Header Row
                const headRow = document.createElement('tr');
                headRow.style.background = '#f8fafc';
                headRow.style.fontWeight = '600';
                
                let headOptText = isOpt ? f(optSum) : '-';
                let headColor = '';
                if(isOpt && optSum > curSum) headColor = 'text-up';
                if(isOpt && optSum < curSum) headColor = 'text-down';

                headRow.innerHTML = \`
                    <td style="padding: 8px;">\${cat.title}</td>
                    <td style="color:#666">/\${maxSum}</td>
                    <td>\${f(curSum)}</td>
                    <td class="\${headColor}">\${headOptText}</td>
                \`;
                body.appendChild(headRow);

                // 3. Render Items
                cat.items.forEach(d => {
                    const tr = document.createElement('tr');
                    
                    const curPts = curComps[d.region][d.key] || 0;
                    const optPts = isOpt ? (optComps[d.region][d.key] || 0) : 0;

                    let curText = f(curPts);
                    if (d.rawVal !== undefined && d.rawVal !== null) {
                        curText += \` <span style="font-size:11px; color:#999">(\${fRaw(d.rawVal, d.type)})</span>\`;
                    }

                    let optText = '-';
                    let diffClass = '';
                    if (isOpt) {
                        optText = f(optPts);
                        if (d.optRaw !== undefined) {
                            optText += \` <span style="font-size:11px; color:#999">(\${fRaw(d.optRaw, d.type)})</span>\`;
                        }
                        if (optPts > curPts + 0.05) diffClass = 'text-up';
                        else if (optPts < curPts - 0.05) diffClass = 'text-down';
                    }

                    tr.innerHTML = \`
                       <td style="padding-left: 20px; color: #444;">\${d.n}</td>
                       <td style="color:#bbb">/\${d.max}</td>
                       <td>\${curText}</td>
                       <td class="\${diffClass}">\${optText}</td>
                    \`;
                    body.appendChild(tr);
                });
            });
        }

async function loadPortfolios() {
    try {
        const res = await fetch('/api/portfolios');
        const portfolios = await res.json();

        const select = document.getElementById('portfolioSelect');
        select.innerHTML = ''; // Clear default

        if (portfolios.length === 0) {
            const option = document.createElement('option');
            option.text = "No portfolios found";
            select.add(option);
            return;
        }

        portfolios.forEach(p => {
            const option = document.createElement('option');
            option.value = p.id;
            option.text = p.name;
            select.add(option);
        });

        // Bind Change Event to Clear UI
        select.addEventListener('change', clearOptimization);

    } catch (e) {
        console.error("Failed to load portfolios", e);
    }
}

function clearOptimization() {
    // Reset Charts/Tables when portfolio changes
    document.getElementById('totalScore').textContent = '--';
    document.getElementById('fwdScore').textContent = '--';
    document.getElementById('histScore').textContent = '--';
    document.getElementById('optBody').innerHTML = '<tr><td colspan="6" style="text-align: center; color: #999;">Run optimization to see results</td></tr>';
    document.getElementById('scoreBreakdownBody').innerHTML = '<tr><td colspan="4" style="text-align: center; color: #999;">Run optimization to see comparison</td></tr>';

    currentDataFull = null;

    // Reset Radar
    radarChart.data.datasets[0].data = [0, 0, 0, 0, 0, 0, 0];
    if (radarChart.data.datasets[1]) {
        radarChart.data.datasets.pop(); // Remove optimized set
    }
    radarChart.update();
}

// Load on start
window.addEventListener('DOMContentLoaded', loadPortfolios);

async function calculateScore() {
    const gid = document.getElementById('portfolioSelect').value;
    const btn = document.querySelector('button');
    btn.disabled = true;
    btn.textContent = 'Calculating...';

    try {
        const res = await fetch(\`/api/scoring/\${gid}\`);
        const data = await res.json();

        if (data.error) { alert(data.error); return; }

        // Update UI
        const tsEl = document.getElementById('totalScore');
        const slEl = document.getElementById('scoreLabel'); // New ID
        
        // FIX: Backend returns 'total_score', not 'score.total'
        const totalScore = data.total_score !== undefined ? data.total_score : data.score?.total;
        
        tsEl.textContent = totalScore.toFixed(1);

        // Determine Label
        const s = totalScore;
        let label = 'Neutral';
        let color = '#666';
        if (s >= 80) { label = 'Elite'; color = '#10b981'; } // Green
        else if (s >= 65) { label = 'Excellent'; color = '#10b981'; }
        else if (s >= 50) { label = 'Good'; color = '#3b82f6'; } // Blue
        else if (s >= 35) { label = 'Fair'; color = '#f59e0b'; } // Orange
        else { label = 'Poor'; color = '#ef4444'; } // Red

        slEl.textContent = label;
        slEl.style.color = color;
        tsEl.style.color = color; // Match score color to label

        updateGauge(totalScore);
        // Update Radar
        const comps = data.components;
        currentDataFull = data; // Save full for breakdown

        radarChart.data.datasets[0].data = [
            comps.forward.profit * 0.6,
            comps.forward.profit * 0.4,
            comps.forward.valuation,
            comps.forward.macro,
            comps.history.calmar,
            comps.history.hhi,
            comps.history.dr
        ];
        radarChart.update();

        // Show Breakdown Immediately
        renderBreakdownTable(data);

    } catch (e) {
        console.error(e);
        alert('Error calculating score: ' + e.message); // Improve error visibility
    } finally {
        btn.disabled = false;
        btn.textContent = 'Calculate Score';
    }
}

async function runOptimization() {
    const gid = document.getElementById('portfolioSelect').value;
    const btn = document.getElementById('optBtn');
    btn.disabled = true;

    try {
        const res = await fetch(\`/api/scoring/\${gid}/optimize\`, { method: 'POST' });
const data = await res.json();

const tbody = document.getElementById('optBody');
tbody.innerHTML = '';

// Process detailed changes list
if (data.changes && data.changes.length > 0) {
    for (const c of data.changes) {
        const tr = document.createElement('tr');
        
        const diffVal = parseFloat(c.diff);
        let diffClass = '';
        let diffText = c.diff + '%';
        if(diffVal > 0) { diffClass = 'text-up'; diffText = '+' + diffText; }
        else if (diffVal < 0) { diffClass = 'text-down'; }
        else { diffText = '-'; }
        
        tr.innerHTML = \`
           <td>\${c.symbol}</td>
           <td style="font-size:12px; color:#666">\${c.industry || '-'}</td>
           <td style="font-size:12px">\${c.growth || '-'}%</td>
           <td>\${c.currentWeight}%</td>
           <td style="font-weight:600">\${c.newWeight}%</td>
           <td class="\${diffClass}">\${diffText}</td>
        \`;
        tbody.appendChild(tr);
    }
}

// FIX: Use total_score or score.total safely
const curScoreVal = (typeof currentDataFull !== 'undefined' && currentDataFull) ? (currentDataFull.total_score || currentDataFull.score?.total) : 0;
const optScore = data.optimizedScore || data.total_score; // Optimizer returns 'optimizedScore' usually, or check API logic

const tsEl = document.getElementById('totalScore');
const slEl = document.getElementById('scoreLabel');

// Show transition: "62.4 -> 71.5"
// Using single quotes to avoid template literal nesting issues
tsEl.innerHTML = curScoreVal.toFixed(1) + ' <span style="font-size: 1.5rem; color:#999;">➔</span> <span style="color:#10b981">' + optScore.toFixed(1) + '</span>';

// Update Label for Optimized Score
let label = 'Neutral';
let color = '#666';
if (optScore >= 80) { label = 'Elite'; color = '#10b981'; }
else if (optScore >= 65) { label = 'Excellent'; color = '#10b981'; }
else if (optScore >= 50) { label = 'Good'; color = '#3b82f6'; }
else if (optScore >= 35) { label = 'Fair'; color = '#f59e0b'; }
else { label = 'Poor'; color = '#ef4444'; }

slEl.textContent = label;
slEl.style.color = color;

// Update Radar with Optimized Dataset
if (data.optimizedComponents) {
    const comps = data.optimizedComponents;
    const optData = [
        comps.forward.profit * 0.6,
        comps.forward.profit * 0.4,
        comps.forward.valuation,
        comps.forward.macro,
        comps.history.calmar,
        comps.history.hhi,
        comps.history.dr
    ];

    // Check if dataset exists
    if (radarChart.data.datasets.length < 2) {
        radarChart.data.datasets.push({
            label: 'Optimized Score',
            data: optData,
            fill: true,
            backgroundColor: 'rgba(16, 185, 129, 0.2)', // Green
            borderColor: 'rgb(16, 185, 129)',
            pointBackgroundColor: 'rgb(16, 185, 129)',
        });
    } else {
        radarChart.data.datasets[1].data = optData;
    }
    radarChart.update();

    // Populate Breakdown Table
    if (typeof currentDataFull !== 'undefined') {
        renderBreakdownTable(currentDataFull, data.optimizedComponents, data.optimizedRawMetrics);
    }
}
                
            } catch (e) {
    console.error(e);
    alert('Optimization failed: ' + e.message);
} finally {
    btn.disabled = false;
}
        }

// Helper: Update Gauge Chart
function updateGauge(score) {
    if (gaugeChart) {
        const diff = 100 - score;
        gaugeChart.data.datasets[0].data = [score, diff];
        gaugeChart.update();
    }
}

initCharts();
</script>
    </body>
    </html>
        `;
