#!/usr/bin/env node

/**
 * claude-auth-notification — Auth Code Relay Server
 *
 * Spawns `claude auth login`, starts a local web form + SSH tunnel,
 * so the user can paste the auth code from their phone.
 *
 * Usage: node relay.mjs <config_path> <urls_output_path>
 *
 * Writes JSON to urls_output_path when ready:
 *   { "loginUrl": "...", "relayUrl": "..." }
 *
 * On code submission: pipes to claude auth login, sends success webhook, exits.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";

const CONFIG_PATH = process.argv[2];
const URLS_OUTPUT = process.argv[3];
const RELAY_TOKEN = randomBytes(16).toString("hex");
const TIMEOUT_MS = 5 * 60 * 1000; // 5 min max lifetime

if (!CONFIG_PATH || !URLS_OUTPUT) {
  console.error("Usage: node relay.mjs <config_path> <urls_output_path>");
  process.exit(1);
}

// ── Step 1: Spawn `claude auth login` ──────────────────────────────

function spawnLogin() {
  return new Promise((resolve, reject) => {
    let output = "";
    let resolved = false;

    const child = spawn("claude", ["auth", "login"], {
      stdio: ["pipe", "pipe", "pipe"], // stdin writable, stdout/stderr readable
    });

    function tryExtract(data) {
      output += data.toString();
      const match = output.match(/visit:\s*(https:\/\/\S+)/);
      if (match && !resolved) {
        resolved = true;
        resolve({ loginUrl: match[1], loginProcess: child });
      }
    }

    child.stdout.on("data", tryExtract);
    child.stderr.on("data", tryExtract);
    child.on("error", (err) => {
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    });

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        reject(new Error("Timeout waiting for login URL"));
      }
    }, 15000);
  });
}

// ── Step 2: HTML form (mobile-friendly) ────────────────────────────

function formHtml(token) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Claude Code — Paste Auth Code</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #1a1a2e; color: #eee;
    display: flex; align-items: center; justify-content: center;
    min-height: 100vh; padding: 20px;
  }
  .card {
    background: #16213e; border-radius: 16px; padding: 32px;
    max-width: 480px; width: 100%; box-shadow: 0 8px 32px rgba(0,0,0,.3);
  }
  h1 { font-size: 24px; margin-bottom: 8px; }
  p { color: #aaa; margin-bottom: 24px; font-size: 14px; line-height: 1.5; }
  textarea {
    width: 100%; height: 120px; padding: 12px; border-radius: 8px;
    border: 2px solid #333; background: #0f0f23; color: #fff;
    font-family: monospace; font-size: 14px; resize: none;
    margin-bottom: 16px;
  }
  textarea:focus { outline: none; border-color: #e07c24; }
  button {
    width: 100%; padding: 14px; border: none; border-radius: 8px;
    background: #e07c24; color: #fff; font-size: 16px; font-weight: 600;
    cursor: pointer; transition: background 0.2s;
  }
  button:hover { background: #c96a1a; }
  button:disabled { background: #555; cursor: not-allowed; }
  .success { text-align: center; }
  .success h1 { color: #4ade80; font-size: 28px; }
  .error { color: #f87171; margin-top: 8px; font-size: 13px; }
</style>
</head>
<body>
<div class="card" id="form-card">
  <h1>🔐 Paste Auth Code</h1>
  <p>
    1. Complete login in the other link<br>
    2. Copy the code shown on the page<br>
    3. Paste it below and submit
  </p>
  <textarea id="code" placeholder="Paste your auth code here..." autofocus></textarea>
  <div class="error" id="error"></div>
  <button id="submit" onclick="submitCode()">Submit Code</button>
</div>
<div class="card success" id="success-card" style="display:none">
  <h1>✅ Success!</h1>
  <p style="margin-top:16px;color:#4ade80">
    Authentication restored.<br>You can close this page.
  </p>
</div>
<script>
async function submitCode() {
  const code = document.getElementById('code').value.trim();
  const btn = document.getElementById('submit');
  const err = document.getElementById('error');
  if (!code) { err.textContent = 'Please paste the auth code.'; return; }
  btn.disabled = true; btn.textContent = 'Submitting...'; err.textContent = '';
  try {
    const res = await fetch('/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, token: '${token}' })
    });
    const data = await res.json();
    if (data.ok) {
      document.getElementById('form-card').style.display = 'none';
      document.getElementById('success-card').style.display = 'block';
    } else {
      err.textContent = data.error || 'Failed. Try again.';
      btn.disabled = false; btn.textContent = 'Submit Code';
    }
  } catch(e) {
    err.textContent = 'Network error. Try again.';
    btn.disabled = false; btn.textContent = 'Submit Code';
  }
}
</script>
</body>
</html>`;
}

// ── Step 3: Local HTTP server ──────────────────────────────────────

function startServer(loginProcess) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      if (req.method === "GET" && req.url?.startsWith("/?token=")) {
        const url = new URL(req.url, "http://localhost");
        if (url.searchParams.get("token") !== RELAY_TOKEN) {
          res.writeHead(403);
          res.end("Forbidden");
          return;
        }
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(formHtml(RELAY_TOKEN));
        return;
      }

      if (req.method === "POST" && req.url === "/submit") {
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", async () => {
          try {
            const { code, token } = JSON.parse(body);
            if (token !== RELAY_TOKEN) {
              res.writeHead(403);
              res.end(JSON.stringify({ ok: false, error: "Invalid token" }));
              return;
            }

            // Pipe code to claude auth login stdin
            loginProcess.stdin.write(code + "\n");

            // Wait for claude auth login to finish and check result
            const authSuccess = await new Promise((resolve) => {
              let exitHandled = false;

              // Listen for process exit
              loginProcess.on("close", (exitCode) => {
                if (!exitHandled) {
                  exitHandled = true;
                  resolve(exitCode === 0);
                }
              });

              // Also check auth status after a delay as fallback
              setTimeout(async () => {
                if (!exitHandled) {
                  exitHandled = true;
                  try {
                    const { execSync } = await import("node:child_process");
                    const status = execSync("claude auth status --json 2>/dev/null", {
                      encoding: "utf-8",
                    });
                    const parsed = JSON.parse(status);
                    resolve(parsed.loggedIn === true);
                  } catch {
                    resolve(false);
                  }
                }
              }, 8000);
            });

            if (authSuccess) {
              // Send success notification
              try {
                await sendSuccessWebhook();
              } catch {}
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ ok: true }));
            } else {
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(
                JSON.stringify({
                  ok: false,
                  error: "Auth code was invalid. Please try again with the correct code.",
                })
              );
              return; // Don't shut down — let user retry
            }

            // Clean up after a short delay
            setTimeout(() => {
              loginProcess.kill();
              server.close();
              process.exit(0);
            }, 2000);
          } catch {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: "Invalid request" }));
          }
        });
        return;
      }

      // Anything else → 404
      res.writeHead(404);
      res.end("Not found");
    });

    // Listen on random port
    server.listen(0, () => {
      const port = server.address().port;
      resolve({ server, port });
    });
  });
}

// ── Step 4: SSH tunnel ─────────────────────────────────────────────

function createTunnel(port) {
  return new Promise((resolve) => {
    let resolved = false;
    let output = "";

    // Try localhost.run first (most reliable, no account needed)
    const tunnel = spawn(
      "ssh",
      [
        "-o", "StrictHostKeyChecking=no",
        "-o", "ServerAliveInterval=30",
        "-R", `80:localhost:${port}`,
        "nokey@localhost.run",
      ],
      { stdio: ["ignore", "pipe", "pipe"] }
    );

    function tryExtract(data) {
      output += data.toString();
      // localhost.run outputs: https://xxxx.lhr.life
      const match = output.match(/(https:\/\/[a-z0-9]+\.lhr\.life)/);
      if (match && !resolved) {
        resolved = true;
        resolve({ tunnelUrl: match[1], tunnelProcess: tunnel });
      }
    }

    tunnel.stdout.on("data", tryExtract);
    tunnel.stderr.on("data", tryExtract);

    tunnel.on("error", () => {
      if (!resolved) {
        resolved = true;
        resolve({ tunnelUrl: null, tunnelProcess: null });
      }
    });

    // Timeout: 15s for tunnel to establish
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        tunnel.kill();
        resolve({ tunnelUrl: null, tunnelProcess: null });
      }
    }, 15000);
  });
}

// ── Step 5: Success webhook ────────────────────────────────────────

async function sendSuccessWebhook() {
  if (!existsSync(CONFIG_PATH)) return;
  const config = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));

  const event = {
    title: "✅ Claude Code Auth Restored",
    body: "Authentication was successfully restored via remote login!",
    color: 0x44ff44,
    emoji: "✅",
  };

  const hostname = process.env.HOSTNAME || process.env.HOST || "unknown";
  event.body += `\n\n🖥️ Host: ${hostname}\n🕐 Time: ${new Date().toLocaleString()}`;

  if (config.type === "discord") {
    await fetch(config.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [
          {
            title: event.title,
            description: event.body,
            color: event.color,
            timestamp: new Date().toISOString(),
            footer: { text: "claude-auth-notification" },
          },
        ],
      }),
    });
  } else if (config.type === "slack") {
    await fetch(config.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        blocks: [
          { type: "header", text: { type: "plain_text", text: event.title } },
          { type: "section", text: { type: "mrkdwn", text: event.body } },
        ],
      }),
    });
  } else if (config.type === "telegram") {
    await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: config.chatId,
        text: `${event.emoji} *${event.title}*\n\n${event.body}`,
        parse_mode: "Markdown",
      }),
    });
  } else if (config.type === "custom") {
    await fetch(config.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "auth_restored",
        title: event.title,
        message: event.body,
        timestamp: new Date().toISOString(),
        source: "claude-auth-notification",
      }),
    });
  }
}

// ── Main ───────────────────────────────────────────────────────────

async function main() {
  try {
    // 1. Spawn login
    const { loginUrl, loginProcess } = await spawnLogin();
    console.error(`[relay] Login URL captured`);

    // 2. Start local server
    const { server, port } = await startServer(loginProcess);
    console.error(`[relay] Server listening on port ${port}`);

    // 3. Create tunnel
    const { tunnelUrl, tunnelProcess } = await createTunnel(port);

    let relayUrl;
    if (tunnelUrl) {
      relayUrl = `${tunnelUrl}/?token=${RELAY_TOKEN}`;
      console.error(`[relay] Tunnel: ${tunnelUrl}`);
    } else {
      relayUrl = null;
      console.error(`[relay] Tunnel failed — relay not available`);
    }

    // 4. Write URLs for notify.mjs to read
    writeFileSync(
      URLS_OUTPUT,
      JSON.stringify({ loginUrl, relayUrl })
    );

    // 5. Auto-shutdown after timeout
    setTimeout(() => {
      console.error("[relay] Timeout reached, shutting down");
      loginProcess.kill();
      if (tunnelProcess) tunnelProcess.kill();
      server.close();
      process.exit(0);
    }, TIMEOUT_MS);
  } catch (err) {
    // Write error state so notify.mjs doesn't hang
    writeFileSync(
      URLS_OUTPUT,
      JSON.stringify({ loginUrl: null, relayUrl: null, error: err.message })
    );
    process.exit(1);
  }
}

main();
