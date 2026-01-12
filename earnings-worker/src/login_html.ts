export const LOGIN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
    <title>Login</title>
    <style>
        :root {
            --bg-color: #f2f2f7;
            --card-bg: #ffffff;
            --text-color: #000000;
            --input-bg: #e5e5ea;
            --primary-color: #007aff;
        }
        @media (prefers-color-scheme: dark) {
            :root {
                --bg-color: #000000;
                --card-bg: #1c1c1e;
                --text-color: #ffffff;
                --input-bg: #2c2c2e;
            }
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background-color: var(--bg-color);
            color: var(--text-color);
            margin: 0;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            -webkit-user-select: none;
            user-select: none;
        }
        .login-container {
            width: 90%;
            max-width: 320px;
            background-color: var(--card-bg);
            padding: 2rem;
            border-radius: 20px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            text-align: center;
        }
        h1 {
            margin-bottom: 2rem;
            font-weight: 600;
            font-size: 1.5rem;
        }
        input {
            width: 100%;
            box-sizing: border-box;
            padding: 16px;
            margin-bottom: 1rem;
            border: none;
            border-radius: 12px;
            background-color: var(--input-bg);
            color: var(--text-color);
            font-size: 16px; /* Prevents zoom on iOS */
            outline: none;
            -webkit-appearance: none;
        }
        button {
            width: 100%;
            padding: 16px;
            border: none;
            border-radius: 12px;
            background-color: var(--primary-color);
            color: white;
            font-size: 17px;
            font-weight: 600;
            cursor: pointer;
            transition: opacity 0.2s;
        }
        button:active {
            opacity: 0.7;
        }
        .error {
            color: #ff3b30;
            margin-bottom: 1rem;
            font-size: 14px;
            display: none;
        }
    </style>
</head>
<body>
    <div class="login-container">
        <h1>Welcome Back</h1>
        <form action="/auth" method="POST">
            <div id="error-msg" class="error">Invalid Credentials</div>
            <input type="text" name="username" placeholder="Username" required autocapitalize="none" autocomplete="username">
            <input type="password" name="password" placeholder="Password" required autocomplete="current-password">
            <button type="submit">Sign In</button>
        </form>
    </div>
    <script>
        // Check for error query param
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('error')) {
            document.getElementById('error-msg').style.display = 'block';
        }
    </script>
</body>
</html>`;
