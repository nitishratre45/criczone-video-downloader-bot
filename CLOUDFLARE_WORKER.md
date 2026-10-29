# CricZone Video Downloader Bot (Cloudflare Workers)

This repository includes a Cloudflare Workers webhook implementation. It does **not** run the Python polling bot in `bot.py`; the Worker uses Telegram webhooks and the EasyDown Instagram parsing API.

## Required Cloudflare Worker secrets

In Cloudflare Dashboard → Workers & Pages → your Worker → Settings → Variables and Secrets, add these as **secrets** (not plain text variables):

- `BOT_TOKEN`: your newly rotated Telegram bot token from @BotFather
- `DOWNLOADER_API_TOKEN`: API token from https://docs.easydown.org/
- `TELEGRAM_WEBHOOK_SECRET`: a random string using only A-Z, a-z, 0-9, underscore, or hyphen (at least 32 characters recommended)

Never put real tokens in GitHub or send them in chat.

## Deploy as a Worker (not Pages)

1. Open Cloudflare Dashboard → Workers & Pages → Create → Worker.
2. Connect the GitHub repository `nitishratre45/criczone-video-downloader-bot` if Git integration is available, or create a Worker and deploy `worker.js` with Wrangler.
3. Ensure the Worker uses the root `wrangler.toml` configuration and `worker.js` entry point.
4. Add the three secrets listed above and deploy.
5. Visit the Worker URL in a browser. It should say: `CricZone Telegram Worker is running.`

The existing Pages project is a static site and will not run this Worker automatically. Deploy this as a separate **Worker**.

## Configure the Telegram webhook

After deployment, call Telegram's setWebhook API from a trusted terminal or API client. Replace the placeholders locally; do not post the token or secret publicly:

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://<YOUR_WORKER_SUBDOMAIN>.workers.dev/telegram","secret_token":"<YOUR_TELEGRAM_WEBHOOK_SECRET>","allowed_updates":["message"]}'
```

Then check the webhook:

```bash
curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo"
```

The response should show your Worker URL and no recent webhook error.

## How it works / limitations

- `/start` and `/help` are supported.
- Public Instagram Reel and video-post links are parsed through EasyDown; the Worker sends the returned direct video URL through Telegram's `sendVideo` API.
- The downloader API may require paid credits. Check its current pricing before use.
- Private, login-restricted, removed, age-restricted, or unsupported posts may fail.
- This implementation sends a direct URL to Telegram instead of downloading the entire video into Worker memory. Telegram must be able to fetch the returned media URL.
- Use only media you own or have permission to download.
