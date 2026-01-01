export const STOCK_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Stock Analysis</title>
    <link rel="icon" type="image/x-icon" href="/favicon.ico">
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
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
            background: white;
            color: #333;
            padding: 12px 20px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .logo { 
            font-weight: 700; 
            text-decoration: none; 
            color: #333; 
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
                padding: 0 10px;
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
            /* Removed flattening to force horizontal scroll for 4 cols */
        }
        @media (max-width: 480px) {
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
        .metrics-grid-wrapper {
            position: relative;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch; /* Smooth scroll */
            margin: 0 -15px; /* Negative margin to pull to edges on mobile */
            padding: 0 15px; /* Padding to compensate */
        }
        @media (max-width: 1024px) {
            .metrics-grid-wrapper { margin: 0; padding: 0; }
        }

        .metrics-grid {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr 1fr;
            gap: 1px;
            background: var(--border-color); /* For grid border effect */
            border-radius: 8px;
            overflow: hidden;
            border: 1px solid var(--border-color);
            min-width: 600px; /* Force scroll on small screens */
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


        /* Chat UI Styles */
        .fab-btn { position: fixed; bottom: 30px; right: 30px; background: linear-gradient(135deg, #2563EB, #1D4ED8); color: white; width: 60px; height: 60px; border-radius: 30px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 15px rgba(37, 99, 235, 0.3); cursor: pointer; transition: transform 0.2s, box-shadow 0.2s; z-index: 2000; }
        .fab-btn:hover { transform: scale(1.05); box-shadow: 0 6px 20px rgba(37, 99, 235, 0.4); }
        .chat-container { position: fixed; bottom: 80px; right: 20px; width: 600px; height: 800px; max-height: 90vh; background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border: 1px solid rgba(255, 255, 255, 0.5); border-radius: 20px; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15); display: flex; flex-direction: column; overflow: hidden; z-index: 2000; display: none; }
        .chat-header { padding: 20px; background: rgba(255, 255, 255, 0.8); border-bottom: 1px solid rgba(0, 0, 0, 0.05); display: flex; justify-content: space-between; align-items: center; }
        .header-title { font-weight: 600; font-size: 16px; color: #111827; display: flex; flex-direction: column; gap: 2px; }
        .header-subtitle { font-size: 11px; color: #6B7280; font-weight: 500; display: flex; align-items: center; gap: 6px; }
        .status-dot { width: 8px; height: 8px; background: #10B981; border-radius: 50%; }
        .chat-messages { flex: 1; padding: 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 16px; }
        .message { max-width: 85%; padding: 12px 16px; border-radius: 16px; font-size: 0.95rem; line-height: 1.5; position: relative; }
        .message.bot { background: #F3F4F6; color: #1F2937; border-bottom-left-radius: 4px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); align-self: flex-start; }
        .message.user { background: #2563EB; color: white; border-bottom-right-radius: 4px; align-self: flex-end; box-shadow: 0 2px 4px rgba(37, 99, 235, 0.2); }
        .typing-indicator { display: flex; gap: 4px; padding: 12px 16px; background: #F3F4F6; border-radius: 16px; border-bottom-left-radius: 4px; width: fit-content; margin-bottom: 8px; align-self: flex-start; }
        .dot { width: 6px; height: 6px; background: #9CA3AF; border-radius: 50%; animation: bounce 1.4s infinite ease-in-out; }
        .dot:nth-child(1) { animation-delay: -0.32s; }
        .dot:nth-child(2) { animation-delay: -0.16s; }
        @keyframes bounce { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); } }
        .input-area { padding: 12px 16px; background: rgba(255, 255, 255, 0.95); border-top: 1px solid rgba(0, 0, 0, 0.05); display: flex; flex-direction: column; gap: 10px; }
        .chips-row { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; scrollbar-width: none; }
        .chip { background: #EFF6FF; color: #2563EB; font-size: 11px; font-weight: 500; padding: 4px 10px; border-radius: 12px; white-space: nowrap; cursor: pointer; border: 1px solid rgba(37, 99, 235, 0.1); transition: all 0.2s; }
        .chip:hover { background: #DBEAFE; transform: translateY(-1px); }
        .input-wrapper { display: flex; gap: 10px; align-items: center; }
        .chat-input { flex: 1; padding: 10px 14px; border-radius: 12px; border: 1px solid #E5E7EB; outline: none; font-family: inherit; font-size: 14px; transition: border-color 0.2s; }
        .chat-input:focus { border-color: #2563EB; }
        .send-btn { background: #2563EB; color: white; border: none; border-radius: 12px; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: background 0.2s; flex-shrink: 0; }
        .send-btn:hover { background: #1D4ED8; }
        @media (max-width: 480px) { .chat-container { width: 100%; height: 100%; max-height: 100%; bottom: 0; right: 0; border-radius: 0; } }
    </style>
</head>
<body>

<header>
    <a href="/" class="logo">
        Brilliant Forecast Portfolios
    </a>
</header>

<div class="container" id="mainContent">
    <div class="full-width loading" id="loading">Loading stock data...</div>
</div>


    <!-- Floating Action Button -->
    <div id="fabBtn" class="fab-btn" onclick="toggleChat()">
        <svg  xmlns="http://www.w3.org/2000/svg"  width="24"  height="24"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M18 4a3 3 0 0 1 3 3v8a3 3 0 0 1 -3 3h-5l-5 3v-3h-2a3 3 0 0 1 -3 -3v-8a3 3 0 0 1 3 -3h12z" /><path d="M9.5 9h.01" /><path d="M14.5 9h.01" /><path d="M9.5 13a3.5 3.5 0 0 0 5 0" /></svg>
    </div>

    <!-- Chat Interface -->
    <div id="chatContainer" class="chat-container">
        <div class="chat-header">
            <div class="header-title">
                Forward PEG AI Expert
                <div class="header-subtitle">
                    <span class="status-dot"></span>
                    Context: <span id="chatContext">@\${symbol}</span>
                </div>
            </div>
            <div style="display:flex; align-items:center; gap:10px;">
                <select id="modelSelector" style="padding:4px 8px; border-radius:4px; border:1px solid #ddd; font-size:0.8rem; background:white;">
                    <option value="perplexity" selected>Perplexity (Pro)</option>
                    <option value="gemini">Gemini</option>
                </select>
                <button onclick="toggleMaximize()" style="background:none; border:none; cursor:pointer;" title="Maximize">
                    <svg id="maxIcon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    </svg>
                    <svg id="restoreIcon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display:none;">
                       <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
                    </svg>
                </button>
                <button onclick="toggleChat()" style="background:none; border:none; cursor:pointer;">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
        </div>
        
        <div id="chatMessages" class="chat-messages">
            <div class="message bot">
                Hello! I can analyze \${symbol} for you. Ask about earnings, valuation, or technical trends.
            </div>
        </div>

        <div class="input-area">
            <div class="chips-row">
                <div class="chip" onclick="setContextQuestion('✨ Analyze this stock')">✨ Analyze this</div>
                <div class="chip" onclick="setContextQuestion('📈 Technical Analysis for '+symbol)">📈 Technical Trend</div>
                <div class="chip" onclick="setContextQuestion('💰 Valuation Check for '+symbol)">💰 Valuation Check</div>
                 <div class="chip" onclick="setContextQuestion('📊 Earnings History for '+symbol)">📊 Earnings</div>
            </div>
            <div class="input-wrapper">
                 <button class="translate-btn" onclick="requestTranslation()" title="Translate last reply to Chinese" style="background:none; border:none; cursor:pointer; padding:0 8px; color:#666;">
                    <span style="font-size: 1.2rem;">文</span>
                </button>
                <input type="text" id="chatInput" class="chat-input" placeholder="Ask about \${symbol}..." onkeydown="handleChatInput(event)">
                <button class="send-btn" onclick="sendChat()">
                    <svg  xmlns="http://www.w3.org/2000/svg"  width="20"  height="20"  viewBox="0 0 24 24"  fill="none"  stroke="currentColor"  stroke-width="2"  stroke-linecap="round"  stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M10 14l11 -11" /><path d="M21 3l-6.5 18a.55 .55 0 0 1 -1 0l-3.5 -7l-7 -3.5a.55 .55 0 0 1 0 -1l18 -6.5" /></svg>
                </button>
            </div>
        </div>
    </div>
    
<script>
    const symbol = window.location.pathname.split('/').pop();
    const container = document.getElementById('mainContent');
    const loadEl = document.getElementById('loading');

    // Utility for colors
    const GREEN = '#00BA7C';
    const RED = '#F91880';


    // -- CHAT LOGIC --
    let chatOpen = false;
    let isMaximized = false;
    let chatHistory = [];
    const chatContainer = document.getElementById('chatContainer');
    const fabBtn = document.getElementById('fabBtn');
    
    // Add simple markdown parser if marked is missing
    function parseMarkdown(text) {
        if(window.marked) return window.marked.parse(text);
        return text.replace(/\\n/g, '<br>').replace(/\\*\\*(.*?)\\*\\*/g, '<b>$1</b>');
    }

    function toggleChat() {
        chatOpen = !chatOpen;
        if(chatOpen) {
            chatContainer.style.display = 'flex';
            fabBtn.style.display = 'none';
             setTimeout(() => document.getElementById('chatInput').focus(), 100);
        } else {
            chatContainer.style.display = 'none';
            fabBtn.style.display = 'flex';
        }
    }
    
    function toggleMaximize() {
        isMaximized = !isMaximized;
        const iconMax = document.getElementById('maxIcon');
        const iconRestore = document.getElementById('restoreIcon');
        
        if (isMaximized) {
            chatContainer.style.width = '95%';
            chatContainer.style.height = '95%';
            chatContainer.style.bottom = '2.5%';
            chatContainer.style.right = '2.5%';
            chatContainer.style.borderRadius = '8px';
            iconMax.style.display = 'none';
            iconRestore.style.display = 'block';
        } else {
            chatContainer.style.width = '600px';
            chatContainer.style.height = '800px';
            chatContainer.style.bottom = '80px';
            chatContainer.style.right = '20px';
            chatContainer.style.borderRadius = '20px';
            iconMax.style.display = 'block';
            iconRestore.style.display = 'none';
        }
    }

    function addMessage(role, content) {
        const div = document.createElement('div');
        div.className = 'message ' + (role === 'user' ? 'user' : 'bot');
        div.innerHTML = role === 'user' ? content : parseMarkdown(content);
        document.getElementById('chatMessages').appendChild(div);
        
        const msgs = document.getElementById('chatMessages');
        msgs.scrollTop = msgs.scrollHeight;
        
        chatHistory.push({ role, content });
        if(chatHistory.length > 20) chatHistory.shift();
    }
    
    function showTyping() {
        const div = document.createElement('div');
        div.id = 'typingIndicator';
        div.className = 'typing-indicator';
        div.innerHTML = '<div class="dot"></div><div class="dot"></div><div class="dot"></div>';
        document.getElementById('chatMessages').appendChild(div);
        const msgs = document.getElementById('chatMessages');
        msgs.scrollTop = msgs.scrollHeight;
    }

    function hideTyping() {
        const el = document.getElementById('typingIndicator');
        if(el) el.remove();
    }

    async function sendChat() {
        const input = document.getElementById('chatInput');
        const text = input.value.trim();
        if (!text) return;

        addMessage('user', text);
        input.value = '';
        showTyping();

        const context = {
            symbol: symbol, 
            portfolioName: 'Stock Analysis: ' + symbol,
            isSingleStock: true
        };

        const modelSelector = document.getElementById('modelSelector');
        const selectedModel = modelSelector ? modelSelector.value : 'perplexity';
        
        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: text, context, history: chatHistory, model: selectedModel })
            });
            
            const data = await res.json();
            hideTyping();
            
            if (data.error) {
                addMessage('assistant', 'Error: ' + data.error);
            } else {
                addMessage('assistant', data.response);
            }
        } catch (e) {
            hideTyping();
            addMessage('assistant', 'Network Error: ' + e.message);
        }
    }

    function handleChatInput(e) {
        if (e.key === 'Enter') sendChat();
    }

    function requestTranslation() {
        const input = document.getElementById('chatInput');
        input.value = "Please translate your PREVIOUS response into Simplified Chinese. Do NOT search the web or provide new analysis -- strictly translate the text.";
        sendChat();
    }
    
    function setContextQuestion(q) {
        if(!chatOpen) toggleChat();
        const input = document.getElementById('chatInput');
        input.value = q;
        sendChat();
    }

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

        // 3. Metrics Grid (Valuation Left 2 Cols, Stats Right 2 Cols)
        const change1Y = q.change_1y || 0;
        const color1Y = change1Y >= 0 ? GREEN : RED;
        
        // Helper for SMA Arrows
        const getSmaDisplay = (price, sma) => {
            if (!sma) return '-';
            const isBullish = price >= sma;
            const color = isBullish ? GREEN : RED;
            const arrow = isBullish ? '&#9650;' : '&#9660;';
            return '<span style="color:' + color + '; margin-right:4px;">' + arrow + '</span>' + fmtNum(sma);
        };

        const metricsHtml = \`
            <div class="card metrics-section">
                <h3>Valuation & Stats</h3>
                <div class="metrics-grid-wrapper">
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
                        <div class="metric-item">
                            <span class="metric-label">% 1Y</span>
                            <span class="metric-value" style="color:\${color1Y} !important">\${fmtNum(change1Y, 1, '%')}</span>
                        </div>
                        <div class="metric-item">
                            <span class="metric-label">% YTD</span>
                            <span class="metric-value" style="color:\${ytdColor} !important">\${fmtNum(ytdChange, 2, '%')}</span>
                        </div>

                        <!-- Row 2 -->
                        <div class="metric-item">
                            <span class="metric-label">Trailing PE</span>
                            <span class="metric-value">\${fmtNum(q.pe_ratio)}</span>
                        </div>
                        <div class="metric-item">
                            <span class="metric-label">Forward PE</span>
                            <span class="metric-value">\${fmtNum(q.forward_pe)}</span>
                        </div>
                        <div class="metric-item">
                            <span class="metric-label">RS Rank 1M</span>
                             <span class="metric-value">\${q.rs_rank_1m || '-'}</span>
                        </div>
                         <div class="metric-item">
                            <span class="metric-label">52W High</span>
                             <span class="metric-value">\${fmtNum(q.fifty_two_week_high)}</span>
                        </div>

                        <!-- Row 3 -->
                        <div class="metric-item">
                            <span class="metric-label">% Growth</span>
                            <span class="metric-value" style="color:\${growth>0?GREEN:RED}">\${fmtNum(growth, 1, '%')}</span>
                        </div>
                        <div class="metric-item">
                            <span class="metric-label">Forward PEG</span>
                            <span class="metric-value" style="color:#0c7abf">\${peg ? peg.toFixed(2) : '-'}</span>
                        </div>
                         <div class="metric-item">
                            <span class="metric-label">% 52w High</span>
                             <span class="metric-value" style="color:red">\${fmtNum(offHigh, 2, '%')}</span>
                        </div>
                         <div class="metric-item">
                            <span class="metric-label">20 SMA</span>
                            <span class="metric-value">\${getSmaDisplay(q.price, q.sma_20)}</span>
                        </div>

                        <!-- Row 4 -->
                        <div class="metric-item">
                            <span class="metric-label">PS Ratio</span>
                            <span class="metric-value">\${fmtNum(q.ps_ratio)}</span>
                        </div>
                         <div class="metric-item">
                            <span class="metric-label">Div Yield</span>
                             <span class="metric-value">\${fmtNum(divYield, 2, '%')}</span>
                        </div>
                        <div class="metric-item">
                            <span class="metric-label">50 SMA</span>
                            <span class="metric-value">\${getSmaDisplay(q.price, q.sma_50)}</span>
                        </div>
                         <div class="metric-item">
                            <span class="metric-label">200 SMA</span>
                             <span class="metric-value">\${getSmaDisplay(q.price, q.sma_200)}</span>
                        </div>
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
