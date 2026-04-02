#!/usr/bin/env node

/**
 * claude-auth-notification — Interactive setup CLI
 *
 * Usage:
 *   npx claude-auth-notification setup
 *   npx claude-auth-notification setup discord <webhook_url>
 *   npx claude-auth-notification setup slack <webhook_url>
 *   npx claude-auth-notification setup telegram <bot_token> <chat_id>
 *   npx claude-auth-notification setup custom <webhook_url>
 *   npx claude-auth-notification test
 *   npx claude-auth-notification status
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { createInterface } from "node:readline";

const CONFIG_DIR = join(homedir(), ".claude-auth-notification");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

function ensureConfigDir() {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function saveConfig(config) {
  ensureConfigDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  console.log(`\n✅ Config saved to ${CONFIG_FILE}`);
}

function loadConfig() {
  if (!existsSync(CONFIG_FILE)) {
    return null;
  }
  return JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
}

function ask(question) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function setupDiscord(url) {
  if (!url) {
    console.log("\n📋 Discord Setup");
    console.log("─".repeat(40));
    console.log("1. Open Discord → Server Settings → Integrations → Webhooks");
    console.log("2. Click 'New Webhook' → Copy Webhook URL\n");
    url = await ask("Paste your Discord webhook URL: ");
  }

  if (!url.startsWith("https://discord.com/api/webhooks/")) {
    console.error("❌ Invalid Discord webhook URL");
    process.exit(1);
  }

  saveConfig({ type: "discord", url });
}

async function setupSlack(url) {
  if (!url) {
    console.log("\n📋 Slack Setup");
    console.log("─".repeat(40));
    console.log("1. Go to https://api.slack.com/apps → Create New App");
    console.log("2. Enable Incoming Webhooks → Add New Webhook to Workspace");
    console.log("3. Copy the Webhook URL\n");
    url = await ask("Paste your Slack webhook URL: ");
  }

  if (!url.startsWith("https://hooks.slack.com/")) {
    console.error("❌ Invalid Slack webhook URL");
    process.exit(1);
  }

  saveConfig({ type: "slack", url });
}

async function setupTelegram(botToken, chatId) {
  if (!botToken) {
    console.log("\n📋 Telegram Setup");
    console.log("─".repeat(40));
    console.log("1. Message @BotFather on Telegram → /newbot");
    console.log("2. Copy the Bot Token");
    console.log("3. Start a chat with your bot, then send any message");
    console.log(
      '4. Visit https://api.telegram.org/bot<TOKEN>/getUpdates to find your Chat ID\n'
    );
    botToken = await ask("Bot Token: ");
    chatId = await ask("Chat ID: ");
  }

  if (!botToken || !chatId) {
    console.error("❌ Both Bot Token and Chat ID are required");
    process.exit(1);
  }

  saveConfig({ type: "telegram", botToken, chatId });
}

async function setupCustom(url) {
  if (!url) {
    console.log("\n📋 Custom Webhook Setup");
    console.log("─".repeat(40));
    console.log("Any URL that accepts POST with JSON body.\n");
    url = await ask("Webhook URL: ");
  }

  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    console.error("❌ Invalid URL");
    process.exit(1);
  }

  saveConfig({ type: "custom", url });
}

async function interactiveSetup() {
  console.log("\n🔔 claude-auth-notification Setup");
  console.log("═".repeat(40));
  console.log("\nWhere would you like to receive notifications?\n");
  console.log("  1. Discord  (webhook URL)");
  console.log("  2. Slack    (webhook URL)");
  console.log("  3. Telegram (bot token + chat ID)");
  console.log("  4. Custom   (any webhook URL)");

  const choice = await ask("\nChoose (1-4): ");

  const handlers = {
    1: setupDiscord,
    2: setupSlack,
    3: setupTelegram,
    4: setupCustom,
  };

  const handler = handlers[choice];
  if (!handler) {
    console.error("❌ Invalid choice");
    process.exit(1);
  }

  await handler();
  console.log("\n🎉 Setup complete! You'll be notified when auth expires.");
  console.log("   Run `npx claude-auth-notification test` to verify.\n");
}

async function testNotification() {
  const config = loadConfig();
  if (!config) {
    console.error("❌ No config found. Run setup first.");
    process.exit(1);
  }

  console.log(`\n📤 Sending test notification via ${config.type}...`);

  // Dynamically import and run notify
  const { execSync } = await import("node:child_process");
  const scriptDir = new URL(".", import.meta.url).pathname;
  try {
    execSync(`node "${join(scriptDir, "notify.mjs")}" auth_expired`, {
      stdio: "inherit",
    });
    console.log("✅ Test notification sent! Check your channel.\n");
  } catch {
    console.error("❌ Failed to send test notification.\n");
    process.exit(1);
  }
}

function showStatus() {
  const config = loadConfig();
  if (!config) {
    console.log("\n📊 Status: Not configured");
    console.log("   Run `npx claude-auth-notification setup` to get started.\n");
    return;
  }

  console.log("\n📊 claude-auth-notification Status");
  console.log("─".repeat(40));
  console.log(`  Type:   ${config.type}`);

  if (config.type === "telegram") {
    console.log(`  Bot:    ${config.botToken.slice(0, 8)}...`);
    console.log(`  Chat:   ${config.chatId}`);
  } else {
    console.log(`  URL:    ${config.url.slice(0, 40)}...`);
  }

  console.log(`  Config: ${CONFIG_FILE}\n`);
}

// --- CLI entry point ---
const command = process.argv[2];
const arg1 = process.argv[3];
const arg2 = process.argv[4];
const arg3 = process.argv[5];

switch (command) {
  case "setup": {
    const providers = { discord: setupDiscord, slack: setupSlack, telegram: setupTelegram, custom: setupCustom };
    if (arg1 && providers[arg1]) {
      await providers[arg1](arg2, arg3);
    } else if (arg1) {
      console.error(`❌ Unknown provider: ${arg1}`);
      console.log("Available: discord, slack, telegram, custom");
      process.exit(1);
    } else {
      await interactiveSetup();
    }
    break;
  }
  case "test":
    await testNotification();
    break;
  case "status":
    showStatus();
    break;
  default:
    console.log("\n🔔 claude-auth-notification");
    console.log("─".repeat(40));
    console.log("  setup              Interactive setup");
    console.log("  setup discord <url>   Quick Discord setup");
    console.log("  setup slack <url>     Quick Slack setup");
    console.log("  setup telegram <token> <chat_id>  Quick Telegram setup");
    console.log("  setup custom <url>    Quick custom webhook setup");
    console.log("  test               Send test notification");
    console.log("  status             Show current config");
    console.log("");
    break;
}
