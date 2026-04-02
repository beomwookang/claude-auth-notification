#!/usr/bin/env node

/**
 * claude-auth-notification — Webhook notification sender
 *
 * Usage: node notify.mjs <event_type>
 * Events: auth_expired, billing_error, auth_restored
 *
 * For auth_expired: spawns a relay server (relay.mjs) in the background
 * that provides a login URL + a web form for remote code submission.
 */

import { readFileSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";

const CONFIG_DIR = join(homedir(), ".claude-auth-notification");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");
const SCRIPT_DIR = new URL(".", import.meta.url).pathname;

const EVENT_MESSAGES = {
  auth_expired: {
    title: "🔐 Claude Code Auth Expired",
    body: "Your Claude Code authentication has expired.",
    color: 0xff4444,
    emoji: "🔐",
  },
  billing_error: {
    title: "💳 Claude Code Billing Error",
    body: "A billing error occurred with your Claude Code subscription. Please check your account.",
    color: 0xff8800,
    emoji: "💳",
  },
  auth_restored: {
    title: "✅ Claude Code Auth Restored",
    body: "Your Claude Code authentication has been successfully restored.",
    color: 0x44ff44,
    emoji: "✅",
  },
};

function loadConfig() {
  if (!existsSync(CONFIG_FILE)) {
    console.error(
      `[claude-auth-notification] No config found at ${CONFIG_FILE}. Run setup first.`
    );
    process.exit(0);
  }
  return JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
}

/**
 * Spawns relay.mjs in the background and waits for URLs.
 * Returns { loginUrl, relayUrl } or null.
 */
async function startRelay() {
  const urlsFile = join(
    tmpdir(),
    `claude-auth-relay-${randomBytes(8).toString("hex")}.json`
  );

  const relay = spawn(
    "node",
    [join(SCRIPT_DIR, "relay.mjs"), CONFIG_FILE, urlsFile],
    {
      stdio: ["ignore", "ignore", "pipe"],
      detached: true,
    }
  );

  relay.stderr.on("data", (d) => {
    console.error(d.toString().trim());
  });

  // Detach so it survives after we exit
  relay.unref();

  // Poll for URLs file (relay writes it when ready)
  const maxWait = 25000; // 25s max
  const interval = 500;
  let waited = 0;

  while (waited < maxWait) {
    await new Promise((r) => setTimeout(r, interval));
    waited += interval;

    if (existsSync(urlsFile)) {
      try {
        const data = JSON.parse(readFileSync(urlsFile, "utf-8"));
        // Clean up temp file
        try {
          unlinkSync(urlsFile);
        } catch {}
        return data;
      } catch {
        // File not fully written yet, keep polling
      }
    }
  }

  return { loginUrl: null, relayUrl: null };
}

async function sendDiscord(webhookUrl, event) {
  const payload = {
    embeds: [
      {
        title: event.title,
        description: event.body,
        color: event.color,
        timestamp: new Date().toISOString(),
        footer: { text: "claude-auth-notification" },
      },
    ],
  };

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`Discord webhook failed: ${res.status} ${res.statusText}`);
  }
}

async function sendSlack(webhookUrl, event) {
  const payload = {
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: event.title },
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: event.body },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `_claude-auth-notification • ${new Date().toLocaleString()}_`,
          },
        ],
      },
    ],
  };

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`Slack webhook failed: ${res.status} ${res.statusText}`);
  }
}

async function sendTelegram(config, event) {
  const { botToken, chatId } = config;
  const text = `${event.emoji} *${event.title}*\n\n${event.body}`;
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
    }),
  });

  if (!res.ok) {
    throw new Error(`Telegram API failed: ${res.status} ${res.statusText}`);
  }
}

async function sendCustomWebhook(webhookUrl, event) {
  const payload = {
    event: process.argv[2],
    title: event.title,
    message: event.body,
    loginUrl: event.loginUrl || null,
    relayUrl: event.relayUrl || null,
    timestamp: new Date().toISOString(),
    source: "claude-auth-notification",
  };

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`Custom webhook failed: ${res.status} ${res.statusText}`);
  }
}

async function main() {
  const eventType = process.argv[2];
  if (!eventType || !EVENT_MESSAGES[eventType]) {
    console.error(`Unknown event type: ${eventType}`);
    process.exit(1);
  }

  const config = loadConfig();
  const event = { ...EVENT_MESSAGES[eventType] };

  // For auth_expired: start relay and get URLs
  if (eventType === "auth_expired") {
    const urls = await startRelay();

    if (urls.loginUrl) {
      event.loginUrl = urls.loginUrl;
      event.body += `\n\n**Step 1** — Login here:\n${urls.loginUrl}`;
    }

    if (urls.relayUrl) {
      event.relayUrl = urls.relayUrl;
      event.body += `\n\n**Step 2** — Paste the code here:\n${urls.relayUrl}`;
      event.body += `\n\n_The relay server auto-closes in 5 minutes._`;
    } else if (urls.loginUrl) {
      event.body += `\n\n⚠️ Remote relay unavailable. Run \`claude auth login\` on your machine.`;
    } else {
      event.body += `\n\n⚠️ Could not start login flow. Run \`claude auth login\` manually.`;
    }
  }

  // Append machine/hostname info
  const hostname = process.env.HOSTNAME || process.env.HOST || "unknown";
  event.body += `\n\n🖥️ Host: ${hostname}\n🕐 Time: ${new Date().toLocaleString()}`;

  const senders = {
    discord: () => sendDiscord(config.url, event),
    slack: () => sendSlack(config.url, event),
    telegram: () => sendTelegram(config, event),
    custom: () => sendCustomWebhook(config.url, event),
  };

  const sender = senders[config.type];
  if (!sender) {
    console.error(`Unknown notification type: ${config.type}`);
    process.exit(1);
  }

  try {
    await sender();
  } catch (err) {
    console.error(`[claude-auth-notification] Failed to send: ${err.message}`);
  }
}

main();
