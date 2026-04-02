---
name: setup
description: Set up auth expiry notifications for Claude Code (Discord, Slack, Telegram, or custom webhook)
---

# Claude Auth Notification — Setup

Help the user configure auth expiry notifications. Guide them through the process interactively.

## Steps

1. Ask which notification channel they want to use:
   - **Discord** — Easiest. Just needs a webhook URL.
   - **Slack** — Needs an Incoming Webhook URL.
   - **Telegram** — Needs a Bot Token and Chat ID.
   - **Custom** — Any URL that accepts POST JSON.

2. Once they provide the credentials, run:
   ```bash
   node "$CLAUDE_PLUGIN_ROOT/scripts/setup.mjs" setup <provider> <args...>
   ```

3. Test the notification:
   ```bash
   node "$CLAUDE_PLUGIN_ROOT/scripts/setup.mjs" test
   ```

4. Confirm it's working and let them know they'll automatically receive notifications when auth expires.

## Quick Setup Commands

```bash
# Discord (easiest)
node "$CLAUDE_PLUGIN_ROOT/scripts/setup.mjs" setup discord https://discord.com/api/webhooks/...

# Slack
node "$CLAUDE_PLUGIN_ROOT/scripts/setup.mjs" setup slack https://hooks.slack.com/services/...

# Telegram
node "$CLAUDE_PLUGIN_ROOT/scripts/setup.mjs" setup telegram <BOT_TOKEN> <CHAT_ID>

# Custom webhook
node "$CLAUDE_PLUGIN_ROOT/scripts/setup.mjs" setup custom https://your-endpoint.com/webhook
```
