const API_BASE = "https://api.easydown.org/api/v1/platforms/instagram/parse";
const MAX_URL_LENGTH = 2000;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function validInstagramUrl(value) {
  try {
    const u = new URL(value);
    const host = u.hostname.toLowerCase();
    return ["http:", "https:"].includes(u.protocol) &&
      (host === "instagram.com" || host.endsWith(".instagram.com")) &&
      /^\/(reel|reels|p|tv|share)\//.test(u.pathname);
  } catch {
    return false;
  }
}

async function telegram(env, method, payload) {
  const response = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.ok === false) {
    throw new Error(`Telegram API failed: ${method} (${response.status})`);
  }
  return result;
}

async function sendText(env, chatId, text, replyToMessageId) {
  return telegram(env, "sendMessage", {
    chat_id: chatId,
    text,
    ...(replyToMessageId ? { reply_to_message_id: replyToMessageId } : {}),
  });
}

async function handleMessage(update, env) {
  const message = update.message;
  if (!message || !message.chat || typeof message.text !== "string") return;

  const chatId = message.chat.id;
  const text = message.text.trim();

  if (text === "/start" || text.startsWith("/start ")) {
    await sendText(env, chatId,
      "👋 Welcome to CricZone Video Downloader!\n\n" +
      "Send a public Instagram Reel or video post link and I’ll try to send the video here.\n\n" +
      "Private or restricted posts may fail. Use only content you own or have permission to download.");
    return;
  }

  if (text === "/help") {
    await sendText(env, chatId,
      "📥 Send a public Instagram Reel or post URL.\n" +
      "Private, deleted, login-restricted, or unsupported posts may fail.\n" +
      "Only download content you own or have permission to use.");
    return;
  }

  if (text.length > MAX_URL_LENGTH || !validInstagramUrl(text)) {
    await sendText(env, chatId, "❌ Please send a valid public Instagram Reel/post link.");
    return;
  }

  const status = await telegram(env, "sendMessage", {
    chat_id: chatId,
    text: "⏳ CricZone is fetching the video…",
    ...(message.message_id ? { reply_to_message_id: message.message_id } : {}),
  });

  try {
    const parsedResponse = await fetch(API_BASE, {
      method: "POST",
      headers: {
        "authorization": `Bearer ${env.DOWNLOADER_API_TOKEN}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ url: text }),
      signal: AbortSignal.timeout(25000),
    });

    if (!parsedResponse.ok) {
      throw new Error(`Downloader API returned ${parsedResponse.status}`);
    }
    const parsed = await parsedResponse.json();
    const videos = parsed?.data?.media?.videos || parsed?.data?.videos || [];
    const video = videos.find((item) =>
      typeof item?.url === "string" &&
      item.url.startsWith("https://") &&
      (!item.mimeType || item.mimeType.toLowerCase().includes("video"))
    );

    if (!video) throw new Error("No downloadable video returned");

    await telegram(env, "sendVideo", {
      chat_id: chatId,
      video: video.url,
      caption: "✅ Downloaded by CricZone",
      supports_streaming: true,
      ...(message.message_id ? { reply_to_message_id: message.message_id } : {}),
    });

    await telegram(env, "deleteMessage", {
      chat_id: chatId,
      message_id: status.result.message_id,
    }).catch(() => {});
  } catch (error) {
    console.error("Reel processing failed:", String(error).slice(0, 300));
    await telegram(env, "editMessageText", {
      chat_id: chatId,
      message_id: status.result.message_id,
      text: "❌ I couldn't fetch this video. It may be private, unavailable, too large, or temporarily blocked. Please try a public Reel link you have permission to download.",
    }).catch(() => {});
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/") {
      return new Response("CricZone Telegram Worker is running.", {
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }

    if (url.pathname !== "/telegram") return json({ error: "Not found" }, 404);
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const providedSecret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
    if (!env.TELEGRAM_WEBHOOK_SECRET ||
        providedSecret !== env.TELEGRAM_WEBHOOK_SECRET) {
      return json({ error: "Unauthorized" }, 401);
    }

    let update;
    try {
      update = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }

    // Telegram expects a fast HTTP acknowledgement; process the update in the Worker event.
    const task = handleMessage(update, env).catch((error) => {
      console.error("Update handler failed:", String(error).slice(0, 300));
    });
    if (typeof globalThis.waitUntil === "function") {
      globalThis.waitUntil(task);
    } else {
      await task;
    }
    return json({ ok: true });
  },
};
