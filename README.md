# CricZone Video Downloader Bot

A Telegram bot that accepts public Instagram Reel/post links and attempts to send the video back to the chat using `yt-dlp`.

## Features

- `/start` and `/help` commands
- Validates Instagram URL host and common post paths
- Temporary downloads; files are removed after processing
- Friendly failure message for private, unavailable, blocked, unsupported, or oversized posts
- Reads the Telegram token from the `BOT_TOKEN` environment variable

## Run locally

Python 3.10+ is recommended.

```bash
pip install -r requirements.txt
```

Set `BOT_TOKEN` in your environment, then run:

```bash
python bot.py
```

Never commit your real token to GitHub. If it has been exposed, revoke it through BotFather and create a new one.

## Deploy on Render

1. Create a **Background Worker** and connect this repository, or use the included `render.yaml`.
2. Add an environment variable named `BOT_TOKEN` with the token from BotFather.
3. Deploy and check the worker logs.
4. Open the bot in Telegram and send `/start`.

## Limitations

Instagram may block automated access or change its site. Private, login-restricted, deleted, or unsupported posts can fail. Telegram upload limits also apply. Use this bot only for content you own or have permission to download, and follow Instagram's terms and applicable law.
