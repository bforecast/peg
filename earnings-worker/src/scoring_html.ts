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
        
        .section-header { background: #f0f9ff; font-weight: 600; }
        .sub-item td:first-child { padding-left: 24px; color: #666; }
        
        .info-icon { 
            display: inline-flex; align-items: center; justify-content: center;
            width: 20px; height: 20px; border-radius: 50%; 
            background: #e0e7ff; color: #4f46e5; font-size: 12px; 
            cursor: pointer; margin-left: 8px; font-weight: bold;
        }
        .info-icon:hover { background: #c7d2fe; }
        .tooltip { 
            position: relative; display: inline-block;
        }
        .tooltip .tooltip-content {
            visibility: hidden; opacity: 0;
            width: 320px; background: #1e293b; color: #fff;
            text-align: left; border-radius: 8px; padding: 12px;
            position: absolute; z-index: 100; top: 30px; left: 0;
            font-size: 12px; line-height: 1.5; font-weight: normal;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            transition: opacity 0.2s;
        }
        .tooltip:hover .tooltip-content { visibility: visible; opacity: 1; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div style="display: flex; align-items: center;">
                <h1>Dual-Dimension Portfolio Scoring</h1>
                <div class="tooltip">
                    <span class="info-icon">i</span>
                    <div class="tooltip-content">
                        <strong>Scoring Formula:</strong><br>
                        <b>Total</b> = 65% Performance + 35% Holdings<br><br>
                        <b>Stock Score</b> = 40% Value + 25% Momentum + 35% Risk<br>
                        • Value: 70% PEG + 30% PE<br>
                        • Momentum: 1Y Return<br>
                        • Risk: Vol + MaxDD + Sharpe<br><br>
                        <b>Performance</b> = Return + Vol + MaxDD + Sharpe + DR
                    </div>
                </div>
            </div>
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
                
                <!-- Breakdown Table -->
                <table class="opt-table" style="font-size: 13px;">
                    <thead>
                        <tr>
                            <th style="padding: 6px;">Metric</th>
                            <th style="padding: 6px;">Raw Value</th>
                            <th style="padding: 6px;">Score</th>
                            <th id="optColHeader" style="padding: 6px; color: #10b981; display: none;">Optimized</th>
                        </tr>
                    </thead>
                    <tbody id="scoreBreakdownBody">
                        <tr><td colspan="4" style="text-align: center; color: #999;">Select a portfolio and calculate score</td></tr>
                    </tbody>
                </table>
            </div>

            <!-- Dimensions Radar -->
            <div class="card">
                <h2>Dimensions Breakdown</h2>
                <div style="height: 300px;">
                    <canvas id="radarChart"></canvas>
                </div>
            </div>
        </div>

        <!-- Stock Details -->
        <div class="card">
            <h2>Holdings Details</h2>
            <table class="opt-table">
                <thead>
                    <tr>
                        <th>Symbol</th>
                        <th>Weight</th>
                        <th>Value</th>
                        <th>Momentum</th>
                        <th>Risk</th>
                        <th>Total</th>
                    </tr>
                </thead>
                <tbody id="stockDetailsBody">
                    <tr><td colspan="6" style="text-align: center; color: #999;">--</td></tr>
                </tbody>
            </table>
        </div>

        <!-- Optimization -->
        <div class="card">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <h2>Weight Optimization</h2>
                <button onclick="runOptimization()" id="optBtn">Optimize</button>
            </div>
            
            <p style="font-size: 14px; color: #666; margin-bottom: 16px;">
                Softmax-based weight optimization with constraints.
                <br>
                <small>Position Cap: 40% | Rebalance Limit: ±15% | Min Position: 1%</small>
            </p>
            
            <!-- Decision Summary -->
            <div id="optDecision" style="display: none; padding: 12px; border-radius: 8px; margin-bottom: 16px;"></div>

            <table class="opt-table">
                <thead>
                    <tr>
                        <th>Symbol</th>
                        <th>Score</th>
                        <th>Current</th>
                        <th>Optimized</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody id="optBody">
                    <tr><td colspan="5" style="text-align: center; color: #999;">Run optimization to see results</td></tr>
                </tbody>
            </table>
        </div>
    </div>

    <script>
        // Init Charts
        let radarChart;
        let currentData = null;
        
        function initCharts() {
            const ctxR = document.getElementById('radarChart').getContext('2d');
            radarChart = new Chart(ctxR, {
                type: 'radar',
                data: {
                    labels: ['Value', 'Momentum', 'Stock Risk', 'Return', 'Volatility', 'Max Drawdown', 'Sharpe', 'Diversification'],
                    datasets: [{
                        label: 'Current Score',
                        data: [0, 0, 0, 0, 0, 0, 0, 0],
                        fill: true,
                        backgroundColor: 'rgba(37, 99, 235, 0.2)',
                        borderColor: 'rgb(37, 99, 235)',
                        pointBackgroundColor: 'rgb(37, 99, 235)',
                    }]
                },
                options: {
                    scales: { r: { min: 0, max: 100, ticks: { stepSize: 20 } } }
                }
            });
        }
        
        // Store original data for comparison (global scope)
        let originalBreakdownData = null;
        
        function renderBreakdownTable(data, optimizedData = null) {
            const body = document.getElementById('scoreBreakdownBody');
            const optHeader = document.getElementById('optColHeader');
            body.innerHTML = '';
            
            const f = (n) => typeof n === 'number' ? n.toFixed(1) : '-';
            const pct = (n) => typeof n === 'number' ? (n * 100).toFixed(1) + '%' : '-';
            
            const perf = data.components.performance;
            const hold = data.components.holdings;
            const raw = data.raw_metrics;
            
            // Check if we have optimized data
            const hasOptimized = optimizedData !== null;
            optHeader.style.display = hasOptimized ? 'table-cell' : 'none';
            
            if (hasOptimized) {
               const perfDiff = optimizedData.performance_score - data.performance_score;
               const hqDiff = optimizedData.holdings_score - data.holdings_score;
               const totalDiff = (perfDiff * 0.65) + (hqDiff * 0.35);
               optHeader.style.color = totalDiff >= -0.01 ? '#10b981' : '#ef4444';
            }
            
            const optPerf = hasOptimized ? optimizedData.components.performance : null;
            const optHold = hasOptimized ? optimizedData.components.holdings : null;
            
            const sections = [
                {
                    title: 'Portfolio Performance (65%)',
                    score: data.performance_score,
                    optScore: hasOptimized ? optimizedData.performance_score : null,
                    items: [
                        { name: 'Return (1Y)', raw: pct(raw.return1Y), score: perf.return, optScore: optPerf?.return },
                        { name: 'Volatility', raw: pct(raw.volatility), score: perf.volatility, optScore: optPerf?.volatility },
                        { name: 'Max Drawdown', raw: pct(raw.maxDrawdown), score: perf.maxDrawdown, optScore: optPerf?.maxDrawdown },
                        { name: 'Sharpe Ratio', raw: f(raw.sharpe), score: perf.sharpe, optScore: optPerf?.sharpe },
                        { name: 'Diversification Ratio', raw: f(raw.dr), score: perf.dr, optScore: optPerf?.dr },
                    ]
                },
                {
                    title: 'Holdings Quality (35%)',
                    score: data.holdings_score,
                    optScore: hasOptimized ? optimizedData.holdings_score : null,
                    items: [
                        { name: 'Avg Value Score', raw: '-', score: hold.avgValue, optScore: optHold?.avgValue },
                        { name: 'Avg Momentum Score', raw: '-', score: hold.avgMomentum, optScore: optHold?.avgMomentum },
                        { name: 'Avg Risk Score', raw: '-', score: hold.avgRisk, optScore: optHold?.avgRisk },
                    ]
                }
            ];
            
            sections.forEach(sec => {
                // Section Header
                const headerRow = document.createElement('tr');
                headerRow.className = 'section-header';
                const optScoreCell = hasOptimized ? \`<td style="font-weight: 700; color: #10b981;">\${f(sec.optScore)}</td>\` : '';
                headerRow.innerHTML = \`
                    <td style="padding: 8px;">\${sec.title}</td>
                    <td></td>
                    <td style="font-weight: 700;">\${f(sec.score)}</td>
                    \${optScoreCell}
                \`;
                body.appendChild(headerRow);
                
                // Items
                sec.items.forEach(item => {
                    const tr = document.createElement('tr');
                    tr.className = 'sub-item';
                    
                    let optCell = '';
                    if (hasOptimized) {
                        const diff = item.optScore - item.score;
                        const color = diff > 0.1 ? '#10b981' : diff < -0.1 ? '#ef4444' : '#666';
                        optCell = \`<td style="color: \${color}; font-weight: 500;">\${f(item.optScore)}</td>\`;
                    }
                    
                    tr.innerHTML = \`
                        <td>\${item.name}</td>
                        <td style="color: #999;">\${item.raw}</td>
                        <td>\${f(item.score)}</td>
                        \${optCell}
                    \`;
                    body.appendChild(tr);
                });
            });
            
            // Store for comparison if this is original data
            if (!optimizedData) {
                originalBreakdownData = data;
            }
        }
        
        function renderStockDetails(stocks) {
            const body = document.getElementById('stockDetailsBody');
            body.innerHTML = '';
            
            if (!stocks || stocks.length === 0) {
                body.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #999;">No data</td></tr>';
                return;
            }
            
            const f = (n) => typeof n === 'number' ? n.toFixed(1) : '-';
            const pct = (n) => typeof n === 'number' ? (n * 100).toFixed(1) + '%' : '-';
            
            stocks.sort((a, b) => b.score - a.score);
            
            stocks.forEach(s => {
                const tr = document.createElement('tr');
                const scoreColor = s.score >= 70 ? '#10b981' : s.score >= 50 ? '#3b82f6' : '#ef4444';
                tr.innerHTML = \`
                    <td><strong>\${s.symbol}</strong></td>
                    <td>\${pct(s.weight)}</td>
                    <td>\${f(s.components.value)}</td>
                    <td>\${f(s.components.momentum)}</td>
                    <td>\${f(s.components.risk)}</td>
                    <td style="font-weight: 700; color: \${scoreColor}">\${f(s.score)}</td>
                \`;
                body.appendChild(tr);
            });
        }

        async function loadPortfolios() {
            try {
                const res = await fetch('/api/portfolios');
                const portfolios = await res.json();

                const select = document.getElementById('portfolioSelect');
                select.innerHTML = '';

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
            } catch (e) {
                console.error("Failed to load portfolios", e);
            }
        }

        async function calculateScore() {
            const gid = document.getElementById('portfolioSelect').value;
            const btn = document.querySelector('button');
            btn.disabled = true;
            btn.textContent = 'Calculating...';

            try {
                const res = await fetch(\`/api/scoring/\${gid}\`);
                const data = await res.json();

                if (data.error) { alert(data.error); return; }

                currentData = data;
                
                // Update Total Score
                const tsEl = document.getElementById('totalScore');
                const slEl = document.getElementById('scoreLabel');
                
                const totalScore = data.total_score;
                tsEl.textContent = totalScore.toFixed(1);

                // Determine Label
                let label = 'Fair';
                let color = '#666';
                if (totalScore >= 80) { label = 'Elite'; color = '#10b981'; }
                else if (totalScore >= 65) { label = 'Excellent'; color = '#10b981'; }
                else if (totalScore >= 50) { label = 'Good'; color = '#3b82f6'; }
                else if (totalScore >= 35) { label = 'Fair'; color = '#f59e0b'; }
                else { label = 'Poor'; color = '#ef4444'; }

                slEl.textContent = label;
                slEl.style.color = color;
                tsEl.style.color = color;

                // Clear any previous optimized data from radar chart
                if (radarChart.data.datasets.length > 1) {
                    radarChart.data.datasets.pop();
                }
                
                // Hide optimization decision banner
                const decisionEl = document.getElementById('optDecision');
                if (decisionEl) decisionEl.style.display = 'none';
                
                // Hide Optimized column header
                const optHeader = document.getElementById('optColHeader');
                if (optHeader) optHeader.style.display = 'none';
                
                // Clear Weight Optimization table
                const optBody = document.getElementById('optBody');
                if (optBody) optBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #999;">Run optimization to see results</td></tr>';

                // Update Radar
                const hold = data.components.holdings;
                const perf = data.components.performance;
                
                radarChart.data.datasets[0].data = [
                    hold.avgValue,
                    hold.avgMomentum,
                    hold.avgRisk,
                    perf.return,
                    perf.volatility,
                    perf.maxDrawdown,
                    perf.sharpe,
                    perf.dr
                ];
                radarChart.update();

                // Render Breakdown (original only, no optimized comparison)
                renderBreakdownTable(data);
                
                // Render Stock Details
                renderStockDetails(data.stock_details);

            } catch (e) {
                console.error(e);
                alert('Error calculating score: ' + e.message);
            } finally {
                btn.disabled = false;
                btn.textContent = 'Calculate Score';
            }
        }

        async function runOptimization() {
            const gid = document.getElementById('portfolioSelect').value;
            const btn = document.getElementById('optBtn');
            btn.disabled = true;
            btn.textContent = 'Optimizing...';

            try {
                const res = await fetch(\`/api/scoring/\${gid}/optimize\`, { method: 'POST' });
                const data = await res.json();

                if (data.error) { alert(data.error); return; }

                // Show Decision Summary (Scheme B format)
                const decisionEl = document.getElementById('optDecision');
                const recommendation = data.recommendation;
                const reason = data.reason || '';
                const hqGain = data.hqGain || 0;
                const totalChange = data.totalScoreChange || 0;
                
                decisionEl.style.display = 'block';
                
                if (recommendation === 'REBALANCE') {
                    decisionEl.style.background = '#ecfdf5';
                    decisionEl.style.border = '1px solid #10b981';
                    decisionEl.innerHTML = \`
                        <strong style="color: #10b981;">✓ REBALANCE RECOMMENDED</strong><br>
                        <small>Total: \${totalChange >= 0 ? '+' : ''}\${totalChange.toFixed(2)} pts | HQ: +\${hqGain.toFixed(2)} pts</small><br>
                        <small style="color: #666;">\${reason}</small>
                    \`;
                } else if (recommendation === 'PROTECT') {
                    decisionEl.style.background = '#fef2f2';
                    decisionEl.style.border = '1px solid #ef4444';
                    decisionEl.innerHTML = \`
                        <strong style="color: #ef4444;">⚠ PROTECTION MODE</strong><br>
                        <small style="color: #666;">\${reason}</small>
                    \`;
                } else {
                    decisionEl.style.background = '#fef3c7';
                    decisionEl.style.border = '1px solid #f59e0b';
                    decisionEl.innerHTML = \`
                        <strong style="color: #f59e0b;">○ HOLD CURRENT</strong><br>
                        <small>Total: \${totalChange >= 0 ? '+' : ''}\${totalChange.toFixed(2)} pts (below threshold)</small><br>
                        <small style="color: #666;">\${reason}</small>
                    \`;
                }

                const tbody = document.getElementById('optBody');
                tbody.innerHTML = '';

                if (data.changes && data.changes.length > 0) {
                    for (const c of data.changes) {
                        const tr = document.createElement('tr');
                        
                        let actionText = c.action;
                        let actionClass = '';
                        if (c.action === 'INC') { actionText = '↑ INC'; actionClass = 'text-up'; }
                        else if (c.action === 'DEC') { actionText = '↓ DEC'; actionClass = 'text-down'; }
                        else { actionText = '→ HOLD'; }
                        
                        tr.innerHTML = \`
                           <td><strong>\${c.symbol}</strong></td>
                           <td>\${c.score}</td>
                           <td>\${c.currentWeight}%</td>
                           <td style="font-weight:600">\${c.newWeight}%</td>
                           <td class="\${actionClass}">\${actionText}</td>
                        \`;
                        tbody.appendChild(tr);
                    }
                }

                // Show score change
                const tsEl = document.getElementById('totalScore');
                const origScore = data.originalScore;
                const optScore = data.optimizedScore;
                
                const improvement = optScore > origScore;
                const changeColor = improvement ? '#10b981' : '#ef4444';
                
                tsEl.innerHTML = origScore.toFixed(1) + ' <span style="font-size: 1.5rem; color:#999;">➔</span> <span style="color:' + changeColor + '">' + optScore.toFixed(1) + '</span>';
                
                // Update Score Label with optimized score
                const slEl = document.getElementById('scoreLabel');
                if (slEl) {
                    let label = 'Fair';
                    let color = '#666';
                    if (optScore >= 80) { label = 'Elite'; color = '#10b981'; }
                    else if (optScore >= 65) { label = 'Excellent'; color = '#10b981'; }
                    else if (optScore >= 50) { label = 'Good'; color = '#3b82f6'; }
                    else if (optScore >= 35) { label = 'Fair'; color = '#f59e0b'; }
                    else { label = 'Poor'; color = '#ef4444'; }
                    
                    slEl.textContent = label;
                    slEl.style.color = color;
                }

                // Update Radar with optimized data
                if (data.optimizedComponents) {
                    const hold = data.optimizedComponents.holdings;
                    const perf = data.optimizedComponents.performance;
                    
                    if (radarChart.data.datasets.length < 2) {
                        radarChart.data.datasets.push({
                            label: 'Optimized',
                            data: [hold.avgValue, hold.avgMomentum, hold.avgRisk, perf.return, perf.volatility, perf.maxDrawdown, perf.sharpe, perf.dr],
                            fill: true,
                            backgroundColor: 'rgba(16, 185, 129, 0.2)',
                            borderColor: 'rgb(16, 185, 129)',
                            pointBackgroundColor: 'rgb(16, 185, 129)',
                        });
                    } else {
                        radarChart.data.datasets[1].data = [hold.avgValue, hold.avgMomentum, hold.avgRisk, perf.return, perf.volatility, perf.maxDrawdown, perf.sharpe, perf.dr];
                    }
                    radarChart.update();
                    
                    // Update breakdown table with BOTH original and optimized data for comparison
                    if (originalBreakdownData) {
                        const optimizedData = {
                            performance_score: data.optimizedPerfScore,
                            holdings_score: data.optimizedHqScore,
                            components: data.optimizedComponents,
                            raw_metrics: data.optimizedRawMetrics
                        };
                        renderBreakdownTable(originalBreakdownData, optimizedData);
                    }
                }
                    
            } catch (e) {
                console.error(e);
                alert('Optimization failed: ' + e.message);
            } finally {
                btn.disabled = false;
                btn.textContent = 'Optimize';
            }
        }

        // Init
        window.addEventListener('DOMContentLoaded', async () => {
            initCharts();
            await loadPortfolios();
            
            // Auto Select from URL
            const params = new URLSearchParams(window.location.search);
            const pid = params.get('portfolioId');
            if(pid) {
                const sel = document.getElementById('portfolioSelect');
                if(sel && sel.querySelector('option[value="' + pid + '"]')) {
                    sel.value = pid;
                    calculateScore();
                }
            }
        });
    </script>
</body>
</html>
    `;
