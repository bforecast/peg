export const STOCK_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Stock Analysis</title>
    <link rel="icon" type="image/x-icon" href="/favicon.ico">
    <script src="https://unpkg.com/lightweight-charts@4.1.3/dist/lightweight-charts.standalone.production.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/numeric/1.2.6/numeric.min.js"></script>
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

        /* Period Buttons */
        .chart-periods {
            display: flex;
            gap: 4px;
            overflow-x: auto;
            scrollbar-width: none;
        }
        .period-btn {
            background: transparent;
            border: none;
            cursor: pointer;
            padding: 4px 10px;
            font-size: 14px;
            color: #111827;
            border-radius: 4px;
            font-weight: 500;
        }
        .period-btn:hover {
            background: #E5E7EB;
        }
        .period-btn.active {
            background: #E5E7EB;
            color: #000;
        }

        /* Layout */
        .container {
            max-width: 100%;
            margin: 0;
            padding: 10px 20px;
            display: grid;
            grid-template-columns: 1fr;
            grid-template-areas: 
                "header"
                "chart"
                "metrics"
                "health"
                "earnings"
                "holdings";
            gap: 20px;
        }

        /* Responsive overrides for wider screens */
        @media (min-width: 1200px) {
            .container {
                grid-template-columns: 1fr 1fr;
                grid-template-areas: 
                    "header header"
                    "chart chart"
                    "metrics health"
                    "earnings holdings";
            }
        }

        .symbol-header { grid-area: header; }
        .chart-section { grid-area: chart; }
        .metrics-section { grid-area: metrics; }
        .health-section { grid-area: health; }
        .earnings-section { grid-area: earnings; }
        .holdings-section { grid-area: holdings; }

        @media (max-width: 1024px) {
            .container { 
                padding: 5px 10px;
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
            min-width: 0; /* Important for grid item shrinking */
            overflow: hidden; 
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
            width: 100%;
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
        .chat-container { position: fixed; bottom: 80px; right: 20px; width: 600px; max-width: calc(100vw - 40px); height: 800px; max-height: 90vh; background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border: 1px solid rgba(255, 255, 255, 0.5); border-radius: 20px; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15); display: flex; flex-direction: column; overflow: hidden; z-index: 2000; display: none; }
        .chat-header { padding: 20px; background: rgba(255, 255, 255, 0.8); border-bottom: 1px solid rgba(0, 0, 0, 0.05); display: flex; justify-content: space-between; align-items: center; }
        .header-title { font-weight: 600; font-size: 16px; color: #111827; display: flex; flex-direction: column; gap: 2px; }
        .header-subtitle { font-size: 11px; color: #6B7280; font-weight: 500; display: flex; align-items: center; gap: 6px; }
        .status-dot { width: 8px; height: 8px; background: #10B981; border-radius: 50%; }
        .chat-messages { flex: 1; padding: 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 16px; }
        .chat-messages table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 0.85rem; display: block; overflow-x: auto; -webkit-overflow-scrolling: touch; border-radius: 8px; background: #ffffff; border: 1px solid rgba(0, 0, 0, 0.08); box-shadow: 0 1px 3px rgba(0,0,0,0.02); }
        .chat-messages th, .chat-messages td { border: 1px solid rgba(0, 0, 0, 0.08); padding: 8px 12px; text-align: left; min-width: 80px; }
        .chat-messages th { background: rgba(0, 0, 0, 0.03); color: #374151; font-weight: 600; white-space: nowrap; }
        .chat-messages tr:nth-child(even) { background: rgba(0, 0, 0, 0.01); }
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
                    Context: <span id="chatContext">Loading...</span>
                </div>
            </div>
            <div style="display:flex; align-items:center; gap:10px;">
                <select id="modelSelector" style="padding:4px 8px; border-radius:4px; border:1px solid #ddd; font-size:0.8rem; background:white;">
                    <option value="nemotron-3-super-120b-a12b" selected>Nemotron-3 Super 120B</option>
                    <option value="llama-3.3-nemotron-super-49b-v1">Llama 3.3 Nemotron 49B</option>
                    <option value="nemotron-4-340b-instruct">Nemotron-4 340B</option>
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
            <div class="message bot" id="welcomeMessage">
                Hello! I can analyze this stock for you. Ask about earnings, valuation, or technical trends.
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
                <input type="text" id="chatInput" class="chat-input" placeholder="Ask about this stock..." onkeydown="handleChatInput(event)">
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

    // Xueqiu Deep Link Handler - tries app first on mobile, falls back to web
    function openXueqiu(sym) {
        const webUrl = 'https://xueqiu.com/S/' + sym;
        // Try format matching web URL: xueqiu://S/{symbol}
        const deepLink = 'xueqiu://S/' + sym;
        
        // Check if mobile device
        const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
        const isAndroid = /Android/i.test(navigator.userAgent);
        
        if (!isMobile) {
            // Desktop: just open in new tab
            window.open(webUrl, '_blank');
            return false;
        }
        
        // Mobile: try deep link first
        const startTime = Date.now();
        
        // Create hidden iframe to try deep link (avoids blank page on failure)
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = deepLink;
        document.body.appendChild(iframe);
        
        // Also try location change for iOS
        window.location.href = deepLink;
        
        // Fallback: if still here after 1.5s, app likely not installed
        setTimeout(function() {
            // If we're still on this page (didn't switch to app), open web
            if (Date.now() - startTime < 2000) {
                window.open(webUrl, '_blank');
            }
            // Cleanup iframe
            if (iframe.parentNode) {
                iframe.parentNode.removeChild(iframe);
            }
        }, 1500);
        
        return false; // Prevent default link behavior
    }


    // -- CHAT LOGIC --
    let chatOpen = false;
    let isMaximized = false;
    let chatHistory = [];
    const chatContainer = document.getElementById('chatContainer');
    const fabBtn = document.getElementById('fabBtn');
    
    function escapeHtml(text) {
        if (!text) return '';
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Add simple markdown parser if marked is missing
    function parseMarkdown(text) {
        const escaped = escapeHtml(text);
        if(window.marked) return window.marked.parse(escaped);
        return escaped.replace(/\\n/g, '<br>').replace(/\\*\\*(.*?)\\*\\*/g, '<b>$1</b>');
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
        if (role === 'user') {
            div.textContent = content;
        } else {
            div.innerHTML = parseMarkdown(content);
        }
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
        const selectedModel = modelSelector ? modelSelector.value : 'nemotron-3-super-120b-a12b';
        
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
        // Update Static Chat Elements with Symbol
        document.getElementById('chatContext').innerText = '@' + symbol;
        document.getElementById('welcomeMessage').innerText = 'Hello! I can analyze ' + symbol + ' for you. Ask about earnings, valuation, or technical trends.';
        document.getElementById('chatInput').placeholder = 'Ask about ' + symbol + '...';
        
        try {
            console.log('Fetching stock data...');
            const res = await fetch('/api/stock-details/' + symbol);
            if(!res.ok) throw new Error(res.statusText);
            const data = await res.json();
            
            // 1. Initial calculation on FULL historical data for stability
            if (data.history && data.history.length > 0) {
                preCalculateAll(data.history);
            }
            
            // 2. Render Page Sections
            render(data);
            
            // 3. Set Initial View Period to 1Y
            const btn1Y = Array.from(document.querySelectorAll('.period-btn')).find(b => b.innerText === '1Y');
            if (btn1Y) {
                setChartPeriod('1Y', btn1Y);
            }
        } catch(e) {
            console.error('Init error:', e);
            if (loadEl) loadEl.style.display = 'none';
            container.innerHTML = \`<div class="full-width error-msg">Error loading data: \${e.message}</div>\`;
        }
    }

    function fmtNum(n, decimals=2, suffix='') {
        if (n === null || n === undefined || isNaN(n)) return '-';
        try {
            const val = typeof n === 'number' ? n : Number(n);
            if (isNaN(val)) return '-';
            return val.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix;
        } catch (e) {
            return '-';
        }
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
                    <a href="https://xueqiu.com/S/\${q.symbol}" onclick="return openXueqiu('\${q.symbol}')" style="display:flex; align-items:center; justify-content:center; text-decoration:none; background:#f5f8fa; padding:4px 8px; border-radius:12px; transition:background 0.2s; margin-left:4px;" onmouseover="this.style.background='#e1e8ed'" onmouseout="this.style.background='#f5f8fa'" title="View on Xueqiu">
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
                <!-- Header with Period Buttons -->
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; margin-bottom: 10px; gap: 10px;">
                    <h3 style="margin: 0;">Price History</h3>
                    <div class="chart-periods">
                        <button class="period-btn" onclick="setChartPeriod('5D', this)">5D</button>
                        <button class="period-btn" onclick="setChartPeriod('1M', this)">1M</button>
                        <button class="period-btn" onclick="setChartPeriod('3M', this)">3M</button>
                        <button class="period-btn" onclick="setChartPeriod('6M', this)">6M</button>
                        <button class="period-btn" onclick="setChartPeriod('YTD', this)">YTD</button>
                        <button class="period-btn active" onclick="setChartPeriod('1Y', this)">1Y</button>
                        <button class="period-btn" onclick="setChartPeriod('5Y', this)">5Y</button>
                        <button class="period-btn" onclick="setChartPeriod('All', this)">All</button>
                    </div>
                </div>

                <!-- Main Price Chart -->
                <div id="priceChartWrap" style="position: relative;">
                    <div id="mainLegend" style="position: absolute; z-index: 10; font-size: 11px; padding: 4px 8px; font-family: sans-serif; pointer-events: none; display: flex; gap: 8px; flex-wrap: wrap;"></div>
                    <div class="chart-container" id="priceChart" style="height: 300px;"></div>
                </div>

                <!-- Stacked Subchart Panes -->
                <div id="volPane" class="sub-pane" style="position: relative; margin-top: 2px;">
                    <div id="volLegend" class="sub-legend" style="position: absolute; z-index: 10; font-size: 11px; padding: 2px 8px; font-family: sans-serif; pointer-events: none; display: flex; gap: 8px;"></div>
                    <div id="volChart" style="height: 100px;"></div>
                </div>
                <div id="macdPane" class="sub-pane" style="position: relative; margin-top: 2px; display: none;">
                    <div id="macdLegend" class="sub-legend" style="position: absolute; z-index: 10; font-size: 11px; padding: 2px 8px; font-family: sans-serif; pointer-events: none; display: flex; gap: 8px;"></div>
                    <div id="macdChart" style="height: 100px;"></div>
                </div>
                <div id="rsiPane" class="sub-pane" style="position: relative; margin-top: 2px; display: none;">
                    <div id="rsiLegend" class="sub-legend" style="position: absolute; z-index: 10; font-size: 11px; padding: 2px 8px; font-family: sans-serif; pointer-events: none; display: flex; gap: 8px;"></div>
                    <div id="rsiChart" style="height: 100px;"></div>
                </div>
                <div id="kdjPane" class="sub-pane" style="position: relative; margin-top: 2px; display: none;">
                    <div id="kdjLegend" class="sub-legend" style="position: absolute; z-index: 10; font-size: 11px; padding: 2px 8px; font-family: sans-serif; pointer-events: none; display: flex; gap: 8px;"></div>
                    <div id="kdjChart" style="height: 100px;"></div>
                </div>
                <div id="entPane" class="sub-pane" style="position: relative; margin-top: 2px; display: none;">
                    <div id="entLegend" class="sub-legend" style="position: absolute; z-index: 10; font-size: 11px; padding: 2px 8px; font-family: sans-serif; pointer-events: none; display: flex; gap: 8px;"></div>
                    <div id="entChart" style="height: 100px;"></div>
                </div>

                <!-- Indicator Selection Bar (below all charts) -->
                <div class="indicator-bar" style="display: flex; align-items: center; font-size: 0.85rem; border-top: 1px solid #eff3f4; padding: 6px 0; margin-top: 2px; position: relative;">
                    <button id="indScrollLeft" onclick="scrollIndicators(-1)" style="display:none; background:none; border:none; cursor:pointer; font-size:16px; color:#536471; padding:0 4px;">&laquo;</button>
                    <div id="indBarInner" style="display: flex; gap: 0; overflow: hidden; flex: 1;">
                        <a href="javascript:void(0)" class="ind-toggle active" id="ind_MA" onclick="toggleIndicator('MA')" style="padding: 4px 12px; text-decoration: none; font-weight: bold; color: #1D9BF0;">MA</a>
                        <a href="javascript:void(0)" class="ind-toggle" id="ind_BOLL" onclick="toggleIndicator('BOLL')" style="padding: 4px 12px; text-decoration: none; color: #536471;">BOLL</a>
                        <a href="javascript:void(0)" class="ind-toggle active" id="ind_VOL" onclick="toggleIndicator('VOL')" style="padding: 4px 12px; text-decoration: none; font-weight: bold; color: #1D9BF0;">VOLUME</a>
                        <a href="javascript:void(0)" class="ind-toggle" id="ind_MACD" onclick="toggleIndicator('MACD')" style="padding: 4px 12px; text-decoration: none; color: #536471;">MACD</a>
                        <a href="javascript:void(0)" class="ind-toggle" id="ind_RSI" onclick="toggleIndicator('RSI')" style="padding: 4px 12px; text-decoration: none; color: #536471;">RSI</a>
                        <a href="javascript:void(0)" class="ind-toggle" id="ind_KDJ" onclick="toggleIndicator('KDJ')" style="padding: 4px 12px; text-decoration: none; color: #536471;">KDJ</a>
                        <a href="javascript:void(0)" class="ind-toggle" id="ind_ENT" onclick="toggleIndicator('ENT')" style="padding: 4px 12px; text-decoration: none; color: #536471;">ENT</a>
                    </div>
                    <button id="indScrollRight" onclick="scrollIndicators(1)" style="background:none; border:none; cursor:pointer; font-size:16px; color:#536471; padding:0 4px; display:none;">&raquo;</button>
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

    let chart;
    let candleSeries, ma5Series, ma10Series, ma20Series, ma60Series, ma200Series, bollUpper, bollMid, bollLower;
    let fullHistoryData = [];
    let lastHoveredTime = null;
    let computedDataCache = {};

    // Each subchart is an independent LightweightCharts instance
    const subCharts = {}; // { VOL: {chart, series...}, MACD: {chart, series...}, RSI: {chart, series...} }
    const indicatorState = { MA: true, BOLL: false, VOL: true, MACD: false, RSI: false, KDJ: false, ENT: false };
    // Order matters for determining which is the bottom chart
    const subChartOrder = ['VOL', 'MACD', 'RSI', 'KDJ', 'ENT'];
    
    const group1 = ['MA', 'BOLL'];
    const group2 = ['VOL', 'MACD', 'RSI', 'KDJ', 'ENT'];
    let g2ActiveQueue = ['VOL']; // Tracks the order of Group 2 indicators to enforce the max of 2

    // ── Calculation helpers ──
    function calculateSMA(data, period) {
        let sma = new Array(data.length).fill(null);
        if (data.length < period) return sma;
        let sum = 0;
        for (let i = 0; i < period; i++) sum += data[i];
        sma[period - 1] = sum / period;
        for (let i = period; i < data.length; i++) {
            sum = sum - data[i - period] + data[i];
            sma[i] = sum / period;
        }
        return sma;
    }

    function calculateEMA(data, period) {
        const ema = new Array(data.length).fill(null);
        if (data.length < period) return ema;

        const k = 2 / (period + 1);
        let sum = 0;
        let count = 0;
        let startIdx = -1;

        // Find the starting SMA over the first 'period' non-null bars
        for (let i = 0; i < data.length; i++) {
            const val = data[i];
            if (val !== null && val !== undefined) {
                sum += val;
                count++;
                if (count === period) {
                    startIdx = i;
                    break;
                }
            }
        }
        
        if (startIdx === -1) return ema;
        
        let currentEma = sum / period;
        ema[startIdx] = currentEma;
        
        // Compute EMA for subsequent bars
        for (let i = startIdx + 1; i < data.length; i++) {
            const val = data[i];
            if (val === null || val === undefined) {
                ema[i] = ema[i - 1]; // carry forward
            } else {
                currentEma = (val - currentEma) * k + currentEma;
                ema[i] = currentEma;
            }
        }

        return ema;
    }

    function calculateRSI(data, period = 14) {
        const rsi = new Array(data.length).fill(null);
        if (data.length <= period) return rsi;
        
        let gains = 0;
        let losses = 0;

        // Calculate initial SMA of gains and losses
        for (let i = 1; i <= period; i++) {
            const diff = data[i] - data[i - 1];
            if (diff > 0) gains += diff; 
            else losses -= diff;
        }
        
        let avgGain = gains / period;
        let avgLoss = losses / period;
        
        const calcRSI = (g, l) => (l === 0 ? 100 : (g === 0 ? 0 : 100 - (100 / (1 + g / l))));
        rsi[period] = calcRSI(avgGain, avgLoss);
        
        // Apply Wilder's Smoothing
        for (let i = period + 1; i < data.length; i++) {
            const diff = data[i] - data[i - 1];
            const gain = diff > 0 ? diff : 0;
            const loss = diff < 0 ? -diff : 0;
            
            avgGain = (avgGain * (period - 1) + gain) / period;
            avgLoss = (avgLoss * (period - 1) + loss) / period;
            rsi[i] = calcRSI(avgGain, avgLoss);
        }

        return rsi;
    }

    function calculateBOLL(data, period = 20, multiplier = 2) {
        const mid = calculateSMA(data, period);
        const upper = new Array(data.length).fill(null);
        const lower = new Array(data.length).fill(null);
        for (let i = period - 1; i < data.length; i++) {
            let slice = data.slice(i - period + 1, i + 1);
            let avg = mid[i];
            let squareDiffs = slice.map(v => Math.pow(v - avg, 2));
            let variance = squareDiffs.reduce((a, b) => a + b, 0) / period;
            let sd = Math.sqrt(variance);
            upper[i] = avg + multiplier * sd;
            lower[i] = avg - multiplier * sd;
        }
        return { upper, mid, lower };
    }

    function calculateKDJ(data, n = 9, m1 = 3, m2 = 3) {
        let k = new Array(data.length).fill(null);
        let d = new Array(data.length).fill(null);
        let j = new Array(data.length).fill(null);
        if (data.length < n) return { k, d, j };
        
        let currK = 50, currD = 50;
        for (let i = 0; i < data.length; i++) {
            let slice = data.slice(Math.max(0, i - n + 1), i + 1);
            let low = Math.min(...slice.map(h => h.lo));
            let high = Math.max(...slice.map(h => h.hi));
            let close = data[i].c;
            let rsv = (high === low) ? 50 : ((close - low) / (high - low)) * 100;
            
            currK = (rsv + (m1 - 1) * currK) / m1;
            currD = (currK + (m2 - 1) * currD) / m2;
            k[i] = currK;
            d[i] = currD;
            j[i] = 3 * currK - 2 * currD;
        }
        return { k, d, j };
    }

    function calculateMACD(data, fast = 12, slow = 26, signal = 9) {
        const emaFast = calculateEMA(data, fast);
        const emaSlow = calculateEMA(data, slow);
        const macdLine = emaFast.map((f, i) => (f !== null && emaSlow[i] !== null) ? f - emaSlow[i] : null);
        
        // Seed signal line from the first valid MACD point
        const signalLine = calculateEMA(macdLine, signal);
        
        const histogram = macdLine.map((m, i) => {
            const s = signalLine[i];
            return (m !== null && s !== null) ? (m - s) * 2 : null;
        });
        return { macd: macdLine, signal: signalLine, histogram };
    }

    function calculateENT(data) {
        const N = data.length;
        let res = new Array(N).fill(null);
        if (N < 30) return res;

        let f1 = new Array(N).fill(null);
        let f2 = new Array(N).fill(null);
        let f3 = new Array(N).fill(null);
        let f4 = new Array(N).fill(null);
        let f5 = new Array(N).fill(null);

        let gains = new Array(N).fill(0), losses = new Array(N).fill(0);
        for (let i = 1; i < N; i++) {
            let diff = data[i].c - data[i-1].c;
            gains[i] = diff > 0 ? diff : 0;
            losses[i] = diff < 0 ? -diff : 0;
        }
        for (let i = 14; i < N; i++) {
            let sg = 0, sl = 0;
            for (let j = 0; j < 14; j++) { sg += gains[i-j]; sl += losses[i-j]; }
            let g = sg/14, ls = sl/14;
            f1[i] = 100 - (100 / (1 + g/(ls + 1e-9)));
        }

        for (let i = 19; i < N; i++) {
            let sum = 0;
            for (let j = 0; j < 20; j++) sum += data[i-j].c;
            let mean = sum/20, diffSq = 0;
            for (let j = 0; j < 20; j++) diffSq += Math.pow(data[i-j].c - mean, 2);
            let std = Math.sqrt(diffSq / 19);
            f2[i] = (4 * std) / (mean + 1e-9);
        }

        let tr = new Array(N).fill(0);
        for (let i = 1; i < N; i++) {
             tr[i] = Math.max( data[i].hi - data[i].lo, Math.abs(data[i].hi - data[i-1].c), Math.abs(data[i].lo - data[i-1].c) );
        }
        for (let i = 14; i < N; i++) {
             let sTR = 0;
             for (let j = 0; j < 14; j++) sTR += tr[i-j];
             f3[i] = (sTR/14) / (data[i].c + 1e-9);
        }

        for(let i = 19; i < N; i++) {
             let s5 = 0, s20 = 0;
             for(let j=0; j<5; j++) s5 += data[i-j].v;
             for(let j=0; j<20; j++) s20 += data[i-j].v;
             f4[i] = (s5/5 - s20/20) / (s20/20 + 1e-9);
        }

        let mfv = new Array(N).fill(0);
        for(let i=0; i<N; i++) {
             let HL = data[i].hi - data[i].lo;
             let m = ((data[i].c - data[i].lo) - (data[i].hi - data[i].c)) / (HL + 1e-9);
             mfv[i] = m * data[i].v;
        }
        for(let i = 19; i < N; i++) {
             let sM = 0, sV = 0;
             for(let j=0; j<20; j++) { sM += mfv[i-j]; sV += data[i-j].v; }
             f5[i] = sM / (sV + 1e-9);
        }

        // Helper for normalization (Z-score)
        const normalize = (arr) => {
            const valid = arr.filter(v => v !== null);
            if (valid.length < 2) return arr.map(() => 0);
            const sum = valid.reduce((a, b) => a + b, 0);
            const mean = sum / valid.length;
            const sqDiff = valid.reduce((a, b) => a + Math.pow(b - mean, 2), 0);
            const std = Math.sqrt(sqDiff / (valid.length - 1)) + 1e-9;
            return arr.map(v => v === null ? 0 : (v - mean) / std);
        };

        // Standardize features before rolling correlation
        f1 = normalize(f1); f2 = normalize(f2); f3 = normalize(f3); f4 = normalize(f4); f5 = normalize(f5);

        for (let i = 48; i < N; i++) {
             let w1=[], w2=[], w3=[], w4=[], w5=[];
             // Looking back 'window' (30) days
             for(let j=0; j<30; j++) {
                 let idx = i - 29 + j;
                 w1.push(f1[idx]); w2.push(f2[idx]); w3.push(f3[idx]);
                 w4.push(f4[idx]); w5.push(f5[idx]);
             }
             const getCorr = (A,B) => {
                 let mA=0, mB=0;
                 for(let z=0; z<30; z++) { mA+=A[z]; mB+=B[z]; }
                 mA/=30; mB/=30;
                 let cov=0, vA=0, vB=0;
                 for(let z=0; z<30; z++) {
                     let dA=A[z]-mA, dB=B[z]-mB;
                     cov+=dA*dB; vA+=dA*dA; vB+=dB*dB;
                 }
                 if(vA===0 || vB===0) return 0;
                 return cov/Math.sqrt(vA*vB);
             };

             let cols = [w1, w2, w3, w4, w5];
             let C = [], hasNaN=false;
             for(let r=0; r<5; r++) {
                 C[r]=[];
                 for(let c=0; c<5; c++) {
                     if(r===c) C[r][c]=1;
                     else if(r<c) { let v = getCorr(cols[r], cols[c]); if(isNaN(v)) hasNaN=true; C[r][c]=v; }
                     else C[r][c]=C[c][r];
                 }
             }
             if(hasNaN || isNaN(C[0][0])) { res[i] = null; continue; }
             
             let evs;
             try { evs = numeric.eig(C).lambda.x; } catch(e) { res[i] = null; continue; }
             
             let sumEig = 0;
             for(let k=0; k<5; k++) { evs[k] = Math.abs(evs[k]); sumEig += evs[k]; }
             if(sumEig === 0) { res[i] = 0; continue; }
             
             let H = 0;
             for(let k=0; k<5; k++) {
                 let p = evs[k] / sumEig;
                 if(p > 1e-12) H -= p * Math.log2(p);
             }
             let score = Math.max(0, Math.min(1, H / Math.log2(5))) * 100;
             res[i] = score;
        }
        return res;
    }

    let isSyncingCrosshair = false;
    function syncCrosshair(sourceChart, param) {
        if (isSyncingCrosshair) return;
        isSyncingCrosshair = true;

        const targets = [{ c: chart, s: candleSeries }];
        
        for (const k of subChartOrder) {
            if (indicatorState[k] && subCharts[k]) {
                const entry = subCharts[k];
                targets.push({ 
                    c: entry.chart, 
                    s: entry.series || entry.macd || entry.rsi6 || entry.k 
                });
            }
        }

        for (const item of targets) {
            if (item.c === sourceChart) continue;

            try {
                if (!param?.point || !param?.time) {
                    item.c.clearCrosshairPosition();
                } else {
                    item.c.setCrosshairPosition(undefined, param.time, item.s);
                }
            } catch (e) {
                // Ignore sync errors for charts that might be improperly initialized
            }
        }

        isSyncingCrosshair = false;
    }

    // ── Shared chart options factory ──
    function makeChartOpts(el, showTimeAxis) {
        return {
            width: el.clientWidth,
            height: el.clientHeight,
            layout: { background: { type: 'solid', color: '#ffffff' }, textColor: '#333', fontSize: 11 },
            grid: { vertLines: { color: '#f0f3fa' }, horzLines: { color: '#f0f3fa' } },
            localization: { locale: 'en-US', dateFormat: 'yyyy-MM-dd' },
            timeScale: { visible: showTimeAxis, timeVisible: false, borderColor: '#D1D4DC', borderVisible: true, shiftVisibleRangeOnNewBar: true },
            rightPriceScale: { borderColor: '#D1D4DC', minimumWidth: 85, borderVisible: true },
            crosshair: { mode: LightweightCharts.CrosshairMode.Normal }
        };
    }

    // ── Timescale sync helpers ──
    let isSyncing = false;
    function syncLogicalRange(sourceChart) {
        if (isSyncing || !sourceChart) return;
        isSyncing = true;
        try {
            const ts = sourceChart.timeScale();
            const range = ts.getVisibleLogicalRange();
            if (range) {
                // Determine target charts (main chart + visible sub-charts)
                const targets = [chart];
                subChartOrder.forEach(k => {
                    if (indicatorState[k] && subCharts[k]) targets.push(subCharts[k].chart);
                });

                targets.forEach(c => {
                    if (c !== sourceChart) {
                        c.timeScale().setVisibleLogicalRange(range);
                    }
                });
            }
        } catch (e) {}
        isSyncing = false;
    }

    // ── X-axis visibility: only the bottom-most visible chart shows dates ──
    function updateTimeAxisVisibility() {
        // Determine which chart is at the very bottom
        var bottomKey = null;
        for (var i = subChartOrder.length - 1; i >= 0; i--) {
            if (indicatorState[subChartOrder[i]] && subCharts[subChartOrder[i]]) {
                bottomKey = subChartOrder[i];
                break;
            }
        }

        // Hide time on main chart unless no subcharts visible
        chart.applyOptions({ timeScale: { visible: !bottomKey } });
        // Show/hide time on each subchart
        for (var j = 0; j < subChartOrder.length; j++) {
            var k = subChartOrder[j];
            if (subCharts[k]) {
                subCharts[k].chart.applyOptions({ timeScale: { visible: (k === bottomKey) } });
            }
        }
    }

    // ── Init main chart ──
    function initChart(history) {
        if (!history || history.length === 0) return;
        fullHistoryData = history;

        const priceEl = document.getElementById('priceChart');
        chart = LightweightCharts.createChart(priceEl, makeChartOpts(priceEl, false));

        candleSeries = chart.addCandlestickSeries({
            upColor: '#00BA7C', downColor: '#F91880', borderVisible: false,
            wickUpColor: '#00BA7C', wickDownColor: '#F91880',
            priceLineVisible: false
        });
        ma5Series = chart.addLineSeries({ color: '#E5C158', lineWidth: 1.5, crosshairMarkerVisible: false, visible: true, priceLineVisible: false });
        ma10Series = chart.addLineSeries({ color: '#2962FF', lineWidth: 1.5, crosshairMarkerVisible: false, visible: true, priceLineVisible: false });
        ma20Series = chart.addLineSeries({ color: '#FF6D00', lineWidth: 1.5, crosshairMarkerVisible: false, visible: true, priceLineVisible: false });
        ma60Series = chart.addLineSeries({ color: '#7E57C2', lineWidth: 1.5, crosshairMarkerVisible: false, visible: true, priceLineVisible: false });
        ma200Series = chart.addLineSeries({ color: '#26a69a', lineWidth: 1.5, crosshairMarkerVisible: false, visible: true, priceLineVisible: false });
        bollUpper = chart.addLineSeries({ color: '#7E57C2', lineWidth: 1, lineStyle: 2, crosshairMarkerVisible: false, visible: false, priceLineVisible: false });
        bollMid = chart.addLineSeries({ color: '#26a69a', lineWidth: 1, crosshairMarkerVisible: false, visible: false, priceLineVisible: false });
        bollLower = chart.addLineSeries({ color: '#7E57C2', lineWidth: 1, lineStyle: 2, crosshairMarkerVisible: false, visible: false, priceLineVisible: false });

        chart.timeScale().subscribeVisibleLogicalRangeChange(() => syncLogicalRange(chart));
        chart.subscribeCrosshairMove(p => { 
            syncCrosshair(chart, p);
            if (p.time) { lastHoveredTime = p.time; updateLegends(p.time); } 
        });

        // Create subcharts
        createSubChart('VOL', 'volChart');
        createSubChart('MACD', 'macdChart');
        createSubChart('RSI', 'rsiChart');
        createSubChart('KDJ', 'kdjChart');
        createSubChart('ENT', 'entChart');

        seedAllData(history);
        updateTimeAxisVisibility();

        window.addEventListener('resize', () => {
            const w = priceEl.clientWidth;
            chart.applyOptions({ width: w });
            Object.values(subCharts).forEach(sc => sc.chart.applyOptions({ width: w }));
            updateScrollArrows();
        });

        // Initialize scroll arrows after small delay to ensure rendering
        setTimeout(updateScrollArrows, 500);
        document.getElementById('indBarInner').addEventListener('scroll', updateScrollArrows);

        // Set initial period to 1Y
        var btn1Y = Array.from(document.querySelectorAll('.period-btn')).find(b => b.innerText === '1Y');
        if (btn1Y) {
            setChartPeriod('1Y', btn1Y);
        } else {
            chart.timeScale().fitContent();
        }
    }

    function createSubChart(key, elId) {
        const el = document.getElementById(elId);
        if (!el) return;
        const sc = LightweightCharts.createChart(el, makeChartOpts(el, false));
        sc.timeScale().subscribeVisibleLogicalRangeChange(() => syncLogicalRange(sc));
        sc.subscribeCrosshairMove(p => { 
            syncCrosshair(sc, p);
            if (p.time) { lastHoveredTime = p.time; updateLegends(p.time); } 
        });

        const entry = { chart: sc };
        if (key === 'VOL') {
            entry.series = sc.addHistogramSeries({ 
                priceFormat: { type: 'volume' },
                priceLineVisible: false,
                lastValueVisible: true,
                priceScaleId: 'right'
            });
        } else if (key === 'MACD') {
            entry.hist = sc.addHistogramSeries({ 
                priceFormat: { type: 'custom', minMove: 0.01, formatter: v => v.toFixed(2) },
                priceLineVisible: false
            });
            entry.macd = sc.addLineSeries({ color: '#2962FF', lineWidth: 1.5, priceLineVisible: false });
            entry.signal = sc.addLineSeries({ color: '#FF6D00', lineWidth: 1.5, priceLineVisible: false });
        } else if (key === 'RSI') {
            entry.rsi6 = sc.addLineSeries({ color: '#E5C158', lineWidth: 1.5, priceLineVisible: false });
            entry.rsi12 = sc.addLineSeries({ color: '#2962FF', lineWidth: 1.5, priceLineVisible: false });
            entry.rsi24 = sc.addLineSeries({ color: '#FF6D00', lineWidth: 1.5, priceLineVisible: false });
        } else if (key === 'KDJ') {
            entry.k = sc.addLineSeries({ color: '#E5C158', lineWidth: 1.5, priceLineVisible: false });
            entry.d = sc.addLineSeries({ color: '#2962FF', lineWidth: 1.5, priceLineVisible: false });
            entry.j = sc.addLineSeries({ color: '#FF6D00', lineWidth: 1.5, priceLineVisible: false });
        } else if (key === 'ENT') {
            // Background Zones using AreaSeries to simulate fill_between
            const zoneRisk = sc.addAreaSeries({ 
                topColor: 'rgba(249, 24, 128, 0.08)', bottomColor: 'rgba(249, 24, 128, 0.08)', 
                lineVisible: false, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false 
            });
            const zoneAttn = sc.addAreaSeries({ 
                topColor: 'rgba(255, 109, 0, 0.08)', bottomColor: 'rgba(255, 109, 0, 0.08)', 
                lineVisible: false, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false 
            });
            const zoneHealth = sc.addAreaSeries({ 
                topColor: 'rgba(0, 186, 124, 0.08)', bottomColor: 'rgba(0, 186, 124, 0.08)', 
                lineVisible: false, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false 
            });

            entry.series = sc.addLineSeries({ color: '#26a69a', lineWidth: 2 });
            entry.series.createPriceLine({ price: 50, color: '#00BA7C', lineStyle: LightweightCharts.LineStyle.Dashed, lineWidth: 1, title: 'HEALTHY' });
            entry.series.createPriceLine({ price: 30, color: '#F91880', lineStyle: LightweightCharts.LineStyle.Dashed, lineWidth: 1, title: 'RISK' });
            
            entry.series.applyOptions({ 
                autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }),
                lastValueVisible: true,
                priceLineVisible: false
            });

            // Store zones to push data during seed
            entry.zones = { risk: zoneRisk, attn: zoneAttn, health: zoneHealth };
        }
        subCharts[key] = entry;
        console.log('Created subChart:', key, Object.keys(entry));
    }

    // -- Pre-calculate indicators on FULL dataset once --
    let fullComputedMap = {}; 
    function preCalculateAll(history) {
        // Explicitly cast all history data once to avoid concatenation bugs
        const hNum = history.map(h => ({
            t: h.date,
            o: Number(h.open || 0),
            hi: Number(h.high || 0),
            lo: Number(h.low || 0),
            c: Number(h.close || 0),
            v: Number(h.volume || 0)
        }));
        
        const closes = hNum.map(h => h.c);
        const ma5 = calculateSMA(closes, 5);
        const ma10 = calculateSMA(closes, 10);
        const ma20 = calculateSMA(closes, 20);
        const ma60 = calculateSMA(closes, 60);
        const ma200 = calculateSMA(closes, 200);
        const boll = calculateBOLL(closes, 20, 2);
        const macd = calculateMACD(closes, 12, 26, 9);
        const rsi6 = calculateRSI(closes, 6);
        const rsi12 = calculateRSI(closes, 12);
        const rsi24 = calculateRSI(closes, 24);
        const kdj = calculateKDJ(hNum, 9, 3, 3);
        const ent = calculateENT(hNum);

        fullComputedMap = {};
        hNum.forEach((h, i) => {
            fullComputedMap[h.t] = {
                ...h,
                ma5: ma5[i], ma10: ma10[i], ma20: ma20[i], ma60: ma60[i], ma200: ma200[i],
                bu: boll.upper[i], bm: boll.mid[i], bl: boll.lower[i],
                macd: macd.macd[i], signal: macd.signal[i], hist: macd.histogram[i],
                rsi6: rsi6[i], rsi12: rsi12[i], rsi24: rsi24[i],
                k: kdj.k[i], d: kdj.d[i], j: kdj.j[i],
                ent: ent[i]
            };
        });
    }

    function seedAllData(history) {
        // history provided here is already filtered by period (3M, 1Y etc.)
        // We Pull pre-calculated values from fullComputedMap for stability
        const cd=[], vd=[], m5d=[], m10d=[], m20d=[], m60d=[], m200d=[], bud=[], bmd=[], bld=[];
        const macdD=[], sigD=[], histD=[], rsi6D=[], rsi12D=[], rsi24D=[], kd=[], dd=[], jd=[], entD=[];

        history.forEach(h => {
                const d = fullComputedMap[h.date] || {};
                const date = h.date;
                computedDataCache[date] = d; // for legend
                
                cd.push({ time: date, open: h.open, high: h.high, low: h.low, close: h.close });
                
                if (d.ma5 !== undefined) m5d.push({ time: date, value: d.ma5 });
                if (d.ma10 !== undefined) m10d.push({ time: date, value: d.ma10 });
                if (d.ma20 !== undefined) m20d.push({ time: date, value: d.ma20 });
                if (d.ma60 !== undefined) m60d.push({ time: date, value: d.ma60 });
                if (d.ma200 !== undefined) m200d.push({ time: date, value: d.ma200 });
                if (d.bm !== undefined) { // Check for mid-band as an indicator of BOLL data presence
                    bmd.push({ time: date, value: d.bm });
                    bud.push({ time: date, value: d.bu });
                    bld.push({ time: date, value: d.bl });
                }

                // Subcharts: Use null for missing data to maintain identical indexing for sync
                vd.push({ time: date, value: h.volume, color: (h.close >= h.open ? '#00BA7C88' : '#F9188088') });

                macdD.push({ time: date, value: d.macd !== undefined ? d.macd : null });
                sigD.push({ time: date, value: d.signal !== undefined ? d.signal : null });
                histD.push({ time: date, value: d.hist !== undefined ? d.hist : null, color: (d.hist >= 0 ? '#00BA7C' : '#F91880') });

                rsi6D.push({ time: date, value: d.rsi6 !== undefined ? d.rsi6 : null });
                rsi12D.push({ time: date, value: d.rsi12 !== undefined ? d.rsi12 : null });
                rsi24D.push({ time: date, value: d.rsi24 !== undefined ? d.rsi24 : null });

                kd.push({ time: date, value: d.k !== undefined ? d.k : null });
                dd.push({ time: date, value: d.d !== undefined ? d.d : null });
                jd.push({ time: date, value: d.j !== undefined ? d.j : null });
                entD.push({ time: date, value: d.ent !== undefined ? d.ent : null });
        });


        candleSeries.setData(cd);
        ma5Series.setData(m5d);
        ma10Series.setData(m10d);
        ma20Series.setData(m20d);
        ma60Series.setData(m60d);
        ma200Series.setData(m200d);
        bollUpper.setData(bud);
        bollMid.setData(bmd);
        bollLower.setData(bld);
        
        console.log('Seeding subcharts...', {
            VOL: vd.length, 
            MACD: macdD.length, 
            RSI: rsi6D.length, 
            KDJ: kd.length
        });

        if (subCharts.VOL) subCharts.VOL.series.setData(vd);
        if (subCharts.MACD) {
            subCharts.MACD.hist.setData(histD);
            subCharts.MACD.macd.setData(macdD);
            subCharts.MACD.signal.setData(sigD);
        }
        if (subCharts.RSI) {
            subCharts.RSI.rsi6.setData(rsi6D);
            subCharts.RSI.rsi12.setData(rsi12D);
            subCharts.RSI.rsi24.setData(rsi24D);
        }
        if (subCharts.KDJ) {
            subCharts.KDJ.k.setData(kd);
            subCharts.KDJ.d.setData(dd);
            subCharts.KDJ.j.setData(jd);
        }
        if (subCharts.ENT) {
            subCharts.ENT.series.setData(entD);
            // Populate background health zones
            const zd_risk = entD.map(d => ({ time: d.time, value: 30 }));
            const zd_attn = entD.map(d => ({ time: d.time, value: 50 }));
            const zd_health = entD.map(d => ({ time: d.time, value: 100 }));
            subCharts.ENT.zones.risk.setData(zd_risk);
            subCharts.ENT.zones.attn.setData(zd_attn);
            subCharts.ENT.zones.health.setData(zd_health);
        }
        lastHoveredTime = history[history.length - 1].date;
        updateLegends(lastHoveredTime);
    }

    function updateLegends(time) {
        const d = computedDataCache[time];
        if (!d) return;
        const ml = document.getElementById('mainLegend');
        let mh = '';
        if (indicatorState.MA) {
            mh += '<span style="font-weight:bold;">MA</span> ';
            if (d.ma5 != null) mh += '<span style="color:#E5C158">MA5:' + d.ma5.toFixed(2) + '</span> ';
            if (d.ma10 != null) mh += '<span style="color:#2962FF">MA10:' + d.ma10.toFixed(2) + '</span> ';
            if (d.ma20 != null) mh += '<span style="color:#FF6D00">MA20:' + d.ma20.toFixed(2) + '</span> ';
            if (d.ma60 != null) mh += '<span style="color:#7E57C2">MA60:' + d.ma60.toFixed(2) + '</span> ';
            if (d.ma200 != null) mh += '<span style="color:#26a69a">MA200:' + d.ma200.toFixed(2) + '</span> ';
        }
        if (indicatorState.BOLL) {
            if (d.bm != null) mh += '<span style="color:#26a69a">BOLL(20,2) MID:' + d.bm.toFixed(2) + '</span> ';
            if (d.bu != null) mh += '<span style="color:#7E57C2">UP:' + d.bu.toFixed(2) + '</span> ';
            if (d.bl != null) mh += '<span style="color:#7E57C2">LOW:' + d.bl.toFixed(2) + '</span> ';
        }
        ml.innerHTML = mh;

        var vl = document.getElementById('volLegend');
        if (vl) {
            let vStr = '-';
            if (d && d.v != null && !isNaN(d.v)) {
                try { vStr = d.v.toLocaleString(); } catch(e) {}
            }
            const color = (d.c >= d.o) ? '#00BA7C' : '#F91880';
            vl.innerHTML = '<span>VOLUME</span> <span style="color:' + color + '">' + vStr + '</span>';
        }

        var ml2 = document.getElementById('macdLegend');
        if (ml2) ml2.innerHTML = '<span>MACD(12,26,9)</span> ' + 
            '<span style="color:#2962FF">DIF:' + (d.macd != null ? d.macd.toFixed(2) : '-') + '</span> ' +
            '<span style="color:#FF6D00">DEA:' + (d.signal != null ? d.signal.toFixed(2) : '-') + '</span> ' +
            '<span style="color:' + (d.hist >= 0 ? '#00BA7C' : '#F91880') + '">MACD:' + (d.hist != null ? d.hist.toFixed(2) : '-') + '</span>';

        var rl = document.getElementById('rsiLegend');
        if (rl) rl.innerHTML = '<span>RSI(6,12,24)</span> ' + 
            '<span style="color:#E5C158">6:' + (d.rsi6 != null ? d.rsi6.toFixed(2) : '-') + '</span> ' +
            '<span style="color:#2962FF">12:' + (d.rsi12 != null ? d.rsi12.toFixed(2) : '-') + '</span> ' +
            '<span style="color:#FF6D00">24:' + (d.rsi24 != null ? d.rsi24.toFixed(2) : '-') + '</span>';

        var kl = document.getElementById('kdjLegend');
        if (kl) kl.innerHTML = '<span>KDJ(9,3,3)</span> ' +
            '<span style="color:#E5C158">K:' + (d.k != null ? d.k.toFixed(2) : '-') + '</span> ' +
            '<span style="color:#2962FF">D:' + (d.d != null ? d.d.toFixed(2) : '-') + '</span> ' +
            '<span style="color:#FF6D00">J:' + (d.j != null ? d.j.toFixed(2) : '-') + '</span>';
            
        var el = document.getElementById('entLegend');
        if (el) {
            let entVal = d.ent != null ? d.ent.toFixed(2) : '-';
            let entColor = '#536471';
            let status = 'Calculating...';
            if (d.ent != null) {
                if (d.ent >= 50) { entColor = '#00BA7C'; status = 'Healthy'; }
                else if (d.ent >= 30) { entColor = '#FF6D00'; status = 'Attention'; }
                else { entColor = '#F91880'; status = 'High Risk'; }
            }
            el.innerHTML = '<span>ENT(Health)</span> ' +
            '<span style="color:' + entColor + '; font-weight:bold;">' + entVal + ' (' + status + ')</span>';
        }
    }

    // ── Public toggle function: lights on / lights off ──
    function setIndicatorState(key, state) {
        if (indicatorState[key] === state) return;
        indicatorState[key] = state;
        
        const btn = document.getElementById('ind_' + key);
        if (btn) {
            if (state) {
                btn.style.color = '#1D9BF0';
                btn.style.fontWeight = 'bold';
                btn.classList.add('active');
            } else {
                btn.style.color = '#536471';
                btn.style.fontWeight = 'normal';
                btn.classList.remove('active');
            }
        }
        
        // Apply overlay visibility
        if (key === 'MA') {
            ma5Series.applyOptions({ visible: state });
            ma10Series.applyOptions({ visible: state });
            ma20Series.applyOptions({ visible: state });
            ma60Series.applyOptions({ visible: state });
            ma200Series.applyOptions({ visible: state });
        } else if (key === 'BOLL') {
            bollUpper.applyOptions({ visible: state });
            bollMid.applyOptions({ visible: state });
            bollLower.applyOptions({ visible: state });
        } else if (subCharts[key]) {
            // Toggle subchart pane visibility
            const pane = document.getElementById(key.toLowerCase() + 'Pane');
            if (pane) pane.style.display = state ? 'block' : 'none';
            // Resize the chart after making it visible
            if (state) {
                const el = document.getElementById(key.toLowerCase() + 'Chart');
                if (el) {
                    subCharts[key].chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
                }
            }
        }
    }

    window.toggleIndicator = function(key) {
        const isTurningOn = !indicatorState[key];
        
        if (isTurningOn) {
            if (group1.includes(key)) {
                // Max 1 out of Group 1
                group1.forEach(k => {
                    if (k !== key && indicatorState[k]) {
                        setIndicatorState(k, false);
                    }
                });
            } else if (group2.includes(key)) {
                // Max 2 out of Group 2
                if (g2ActiveQueue.length >= 2) {
                    const toEvict = g2ActiveQueue.shift();
                    setIndicatorState(toEvict, false);
                }
                g2ActiveQueue.push(key);
            }
        } else {
            // Turning off
            if (group2.includes(key)) {
                g2ActiveQueue = g2ActiveQueue.filter(k => k !== key);
            }
        }

        setIndicatorState(key, isTurningOn);

        updateTimeAxisVisibility();
        // Sync timescale from main chart to all visible subcharts
        const ts = chart.timeScale();
        const mainRange = ts.getVisibleLogicalRange();
        const scrollPos = ts.scrollPosition();
        if (mainRange) {
            for (const sk of subChartOrder) {
                if (indicatorState[sk] && subCharts[sk]) {
                    try { 
                        const sts = subCharts[sk].chart.timeScale();
                        sts.setVisibleLogicalRange(mainRange);
                        sts.scrollToPosition(scrollPos, false);
                    } catch(e) {}
                }
            }
        }
        updateLegends(lastHoveredTime);
    };

    window.scrollIndicators = function(dir) {
        var bar = document.getElementById('indBarInner');
        if (bar) bar.scrollBy({ left: dir * 120, behavior: 'smooth' });
    };

    function updateScrollArrows() {
        const bar = document.getElementById('indBarInner');
        const leftBtn = document.getElementById('indScrollLeft');
        const rightBtn = document.getElementById('indScrollRight');
        if (!bar || !leftBtn || !rightBtn) return;
        
        const hasOverflow = bar.scrollWidth > bar.clientWidth;
        leftBtn.style.display = hasOverflow ? 'block' : 'none';
        rightBtn.style.display = hasOverflow ? 'block' : 'none';
        
        leftBtn.style.opacity = bar.scrollLeft > 5 ? '1' : '0.3';
        rightBtn.style.opacity = (bar.scrollLeft + bar.clientWidth < bar.scrollWidth - 5) ? '1' : '0.3';
    }

    window.setChartPeriod = function(period, btn) {
        document.querySelectorAll('.period-btn').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        if (!fullHistoryData || fullHistoryData.length === 0) return;

        var lastDate = new Date(fullHistoryData[fullHistoryData.length - 1].date);
        var startDate = new Date(lastDate);

        switch (period) {
            case '5D': startDate.setDate(lastDate.getDate() - 5); break;
            case '1M': startDate.setMonth(lastDate.getMonth() - 1); break;
            case '3M': startDate.setMonth(lastDate.getMonth() - 3); break;
            case '6M': startDate.setMonth(lastDate.getMonth() - 6); break;
            case 'YTD': startDate = new Date(lastDate.getFullYear(), 0, 1); break;
            case '1Y': startDate.setFullYear(lastDate.getFullYear() - 1); break;
            case '5Y': startDate.setFullYear(lastDate.getFullYear() - 5); break;
            case 'All':
                chart.timeScale().fitContent();
                return;
        }

        const startTimestamp = startDate.toISOString().split('T')[0];
        const endTimestamp = lastDate.toISOString().split('T')[0];
        const firstAvailableDate = fullHistoryData[0].date;
        const validStart = startTimestamp < firstAvailableDate ? firstAvailableDate : startTimestamp;
        
        // Apply to main chart
        chart.timeScale().setVisibleRange({ from: validStart, to: endTimestamp });
        
        // Force immediate sync to visible subcharts
        setTimeout(() => {
            const range = chart.timeScale().getVisibleLogicalRange();
            if (range) {
                subChartOrder.forEach(k => {
                    if (indicatorState[k] && subCharts[k]) {
                        subCharts[k].chart.timeScale().setVisibleLogicalRange(range);
                    }
                });
            }
        }, 50);
    };

    init();
</script>
</body>
</html>`;
