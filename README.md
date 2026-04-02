# claude-auth-notification

Never miss a Claude Code session again. Get notified instantly when your auth expires — via Discord, Slack, Telegram, or any custom webhook. **Re-authenticate remotely from your phone.**

## Why?

When running long Claude Code sessions, your authentication can expire silently. You come back to find your session stalled, waiting for re-login. This plugin detects auth failures automatically, sends you a notification with a login link, and lets you re-authenticate from anywhere.

## How it works

```
Claude Code auth expires
    ↓
StopFailure hook fires (authentication_failed)
    ↓
Plugin starts login flow + relay server + SSH tunnel
    ↓
Notification sent to your channel:
  📎 Step 1: Login link (Anthropic OAuth)
  📎 Step 2: Code relay form (public URL via tunnel)
    ↓
You open links on your phone:
  1. Login → get auth code
  2. Paste code in relay form
    ↓
Relay pipes code to CLI → auth restored!
    ↓
✅ "Auth Restored" notification sent
```

This plugin uses Claude Code's official [hooks system](https://docs.anthropic.com/en/docs/claude-code/hooks) — no token scraping, no API proxying, no ToS violations.

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
2. Click **Edit Channel** (gear icon) → **Integrations** → **Webhooks**
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
  "message": "Your Claude Code authentication has expired.",
  "loginUrl": "https://claude.com/cai/oauth/authorize?...",
  "relayUrl": "https://abc123.lhr.life/?token=...",
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

## Remote Re-authentication

The killer feature: when auth expires, you don't just get a notification — you get everything needed to re-login from your phone.

### How the relay works

1. **Auth expires** → Hook fires `notify.mjs auth_expired`
2. **Login flow starts** → `claude auth login` spawns in background, captures OAuth URL
3. **Relay server starts** → Local HTTP server with a mobile-friendly code input form
4. **SSH tunnel opens** → `localhost.run` creates a public URL (e.g., `https://abc123.lhr.life`)
5. **Notification sent** → Discord/Slack/Telegram message with both links
6. **You act from phone**:
   - Click link 1 → Login on Anthropic → Copy the auth code
   - Click link 2 → Paste code in form → Submit
7. **Relay pipes code** → `claude auth login` completes → credentials updated
8. **Success notification** → Only sent after verifying auth actually worked
9. **Auto-cleanup** → Relay server + tunnel shut down (5 min timeout)

### Security

| Concern | Mitigation |
|---------|------------|
| Relay URL guessable? | Random URL + one-time token parameter |
| Auth code intercepted? | PKCE protects the OAuth flow — code alone isn't enough |
| Relay stays open forever? | Auto-closes after 5 minutes or after successful auth |
| Invalid code submitted? | `claude auth login` rejects it; user can retry |

## Events

| Event | When | Notification |
|-------|------|--------------|
| `auth_expired` | Authentication token expires | Login link + relay form |
| `billing_error` | Billing/subscription issue | Warning notification |
| `auth_restored` | Successfully re-authenticated (verified) | Success notification |

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
- Use your subscription token programmatically
- Proxy or intercept API calls
- Bypass any rate limits or billing
- Require any API keys

It **only**:
- Listens for Claude Code's built-in `StopFailure` hook events
- Runs `claude auth login` (official CLI) to generate login URLs
- Creates a temporary relay for remote code submission
- Sends webhook notifications
- Uses zero external dependencies (Node.js built-ins + SSH)

## Do I even need this?

Claude Code has **built-in automatic token refresh** — it uses a refresh token to silently renew your access token before it expires. In most cases, you'll never notice token expiry.

However, this plugin is useful when:

- **The refresh token itself expires or is revoked** — Claude Code can no longer auto-renew, and a full browser-based re-login is required
- **A billing error occurs** — subscription issues can't be solved by token refresh
- **You're away from your machine** — the relay feature lets you re-authenticate from your phone

## Requirements

- Claude Code with hooks support
- Node.js >= 18
- SSH client (pre-installed on macOS/Linux)

## License

MIT
