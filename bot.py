import asyncio
import logging
import os
import re
import tempfile
from pathlib import Path
from urllib.parse import urlparse

import yt_dlp
from telegram import Update
from telegram.ext import (
    Application,
    CommandHandler,
    MessageHandler,
    ContextTypes,
    filters,
)

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logging.getLogger("httpx").setLevel(logging.WARNING)
logger = logging.getLogger("criczone")

BOT_TOKEN = os.getenv("BOT_TOKEN")
MAX_SIZE_BYTES = 45 * 1024 * 1024


def is_instagram_url(url: str) -> bool:
    try:
        parsed = urlparse(url.strip())
        host = (parsed.hostname or "").lower()
        return (
            parsed.scheme in ("http", "https")
            and (host == "instagram.com" or host.endswith(".instagram.com"))
            and parsed.path.startswith(("/reel/", "/p/", "/tv/", "/share/"))
        )
    except ValueError:
        return False


def download_video(url: str, folder: str) -> Path:
    output_template = str(Path(folder) / "%(id)s.%(ext)s")
    options = {
        "outtmpl": output_template,
        "format": "best[ext=mp4]/best",
        "noplaylist": True,
        "max_filesize": MAX_SIZE_BYTES,
        "quiet": True,
        "no_warnings": True,
        "retries": 2,
        "socket_timeout": 30,
    }

    with yt_dlp.YoutubeDL(options) as ydl:
        ydl.download([url])

    candidates = [
        path for path in Path(folder).iterdir()
        if path.is_file() and not path.name.endswith((".part", ".ytdl"))
    ]
    if not candidates:
        raise RuntimeError("No video file was created.")

    result = max(candidates, key=lambda path: path.stat().st_size)
    if result.stat().st_size > MAX_SIZE_BYTES:
        raise RuntimeError("Video exceeds the configured upload size limit.")
    return result


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.effective_message.reply_text(
        "👋 Welcome to CricZone Video Downloader!\n\n"
        "Send a public Instagram Reel or post link and I'll try to send "
        "the video back here.\n\n"
        "Use only content you own or have permission to download."
    )


async def help_command(
    update: Update, context: ContextTypes.DEFAULT_TYPE
) -> None:
    await update.effective_message.reply_text(
        "📥 Send a public Instagram Reel/post URL.\n"
        "Private, login-restricted, deleted, or unsupported posts may fail.\n"
        "Maximum configured video size: about 45 MB."
    )


async def handle_link(
    update: Update, context: ContextTypes.DEFAULT_TYPE
) -> None:
    message = update.effective_message
    if message is None or not message.text:
        return

    url = message.text.strip()
    if not is_instagram_url(url):
        await message.reply_text(
            "❌ Please send a valid Instagram Reel or post URL."
        )
        return

    status = await message.reply_text("⏳ CricZone is fetching the video…")

    try:
        with tempfile.TemporaryDirectory(prefix="criczone_") as folder:
            path = await asyncio.to_thread(download_video, url, folder)

            await status.edit_text("📤 Download complete. Uploading to Telegram…")
            with path.open("rb") as video:
                if path.suffix.lower() == ".mp4":
                    await message.reply_video(
                        video=video,
                        caption="✅ Downloaded by CricZone",
                        read_timeout=120,
                        write_timeout=120,
                        connect_timeout=30,
                    )
                else:
                    await message.reply_document(
                        document=video,
                        caption="✅ Downloaded by CricZone",
                        read_timeout=120,
                        write_timeout=120,
                        connect_timeout=30,
                    )
        await status.delete()
    except Exception as exc:
        logger.warning("Video download failed: %s", exc)
        await status.edit_text(
            "❌ I couldn't download this video. It may be private, unavailable, "
            "unsupported, too large, or blocked by Instagram. Please try a "
            "public link that you have permission to download."
        )


async def error_handler(
    update: object, context: ContextTypes.DEFAULT_TYPE
) -> None:
    logger.error("Unhandled bot error", exc_info=context.error)


def main() -> None:
    if not BOT_TOKEN:
        raise RuntimeError(
            "BOT_TOKEN is missing. Set it in your hosting provider's environment variables."
        )

    app = Application.builder().token(BOT_TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("help", help_command))
    app.add_handler(
        MessageHandler(filters.TEXT & ~filters.COMMAND, handle_link)
    )
    app.add_error_handler(error_handler)

    logger.info("CricZone Video Downloader bot is starting.")
    app.run_polling(drop_pending_updates=True)


if __name__ == "__main__":
    main()
