# claude-auth-notification

Never miss a Claude Code session again. Get notified instantly when your auth expires — via Discord, Slack, Telegram, or any custom webhook.

## Why?

When running long Claude Code sessions, your authentication can expire silently. You come back to find your session stalled, waiting for re-login. This plugin detects auth failures automatically and sends you a notification so you can re-authenticate right away.

## How it works

```
Claude Code auth expires
    ↓
StopFailure hook fires (authentication_failed)
    ↓
Notification sent to your channel
    ↓
You re-login → back to work
```

This plugin uses Claude Code's official [hooks system](https://docs.anthropic.com/en/docs/claude-code/hooks) — no token scraping, no API proxying, no ToS violations. It simply listens for auth failure events and forwards a notification.

## Install

### As a Claude Code plugin (recommended)

Add to your marketplace config or install directly:

```bash
# Via GitHub marketplace
# Add to ~/.claude/settings.json:
{
  "extraKnownMarketplaces": {
    "claude-auth-notification": {
      "source": {
        "source": "github",
        "repo": "beomwookang/claude-auth-notification"
      }
    }
  }
}
```

Then in Claude Code:
```
/plugins install claude-auth-notification@claude-auth-notification
```

### Via npm (standalone CLI)

```bash
npm install -g claude-auth-notification
```

## Setup

### Option 1: Interactive setup

```bash
npx claude-auth-notification setup
```

```
🔔 claude-auth-notification Setup
════════════════════════════════════════

Where would you like to receive notifications?

  1. Discord  (webhook URL)
  2. Slack    (webhook URL)
  3. Telegram (bot token + chat ID)
  4. Custom   (any webhook URL)

Choose (1-4):
```

### Option 2: One-liner setup

#### Discord (easiest — just one URL)

```bash
npx claude-auth-notification setup discord https://discord.com/api/webhooks/1234567890/abcdef...
```

<details>
<summary>How to get a Discord webhook URL</summary>

1. Open Discord → go to the channel you want notifications in
2. Click **Edit Channel** (⚙️) → **Integrations** → **Webhooks**
3. Click **New Webhook** → **Copy Webhook URL**

</details>

#### Slack

```bash
npx claude-auth-notification setup slack https://hooks.slack.com/services/T.../B.../xxx
```

<details>
<summary>How to get a Slack webhook URL</summary>

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From scratch**
2. Go to **Incoming Webhooks** → Toggle **On**
3. Click **Add New Webhook to Workspace** → Select a channel
4. Copy the **Webhook URL**

</details>

#### Telegram

```bash
npx claude-auth-notification setup telegram <BOT_TOKEN> <CHAT_ID>
```

<details>
<summary>How to get Telegram bot credentials</summary>

1. Message [@BotFather](https://t.me/BotFather) → `/newbot` → Follow the prompts → Copy the **Bot Token**
2. Start a chat with your new bot and send any message
3. Visit `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates`
4. Find `"chat":{"id": 123456789}` — that's your **Chat ID**

</details>

#### Custom webhook

```bash
npx claude-auth-notification setup custom https://your-endpoint.com/webhook
```

Your endpoint will receive POST requests with this JSON body:

```json
{
  "event": "auth_expired",
  "title": "🔐 Claude Code Auth Expired",
  "message": "Your Claude Code authentication has expired. Please re-login to continue.",
  "timestamp": "2026-04-03T12:00:00.000Z",
  "source": "claude-auth-notification"
}
```

### Option 3: In-session setup (plugin mode)

If installed as a Claude Code plugin, you can set up inside a session:

```
/claude-auth-notification:setup
```

## Test

Send a test notification to verify your setup:

```bash
npx claude-auth-notification test
```

## Check status

```bash
npx claude-auth-notification status
```

## Events

| Event | When | Notification |
|-------|------|--------------|
| `auth_expired` | Authentication token expires | 🔐 Claude Code Auth Expired |
| `billing_error` | Billing/subscription issue | 💳 Claude Code Billing Error |
| `auth_restored` | Successfully re-authenticated | ✅ Claude Code Auth Restored |

## Config

Configuration is stored at `~/.claude-auth-notification/config.json`:

```json
{
  "type": "discord",
  "url": "https://discord.com/api/webhooks/..."
}
```

To change your notification channel, just run `setup` again.

## How is this different from...?

This plugin does **not**:
- ❌ Use your subscription token programmatically
- ❌ Proxy or intercept API calls
- ❌ Bypass any rate limits or billing
- ❌ Require any API keys

It **only**:
- ✅ Listens for Claude Code's built-in `StopFailure` hook events
- ✅ Sends a simple webhook notification
- ✅ Uses zero external dependencies (just Node.js `fetch`)

## Requirements

- Claude Code with hooks support
- Node.js >= 18

## License

MIT
