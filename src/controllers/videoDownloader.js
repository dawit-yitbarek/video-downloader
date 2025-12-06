import { Telegraf, Markup } from "telegraf";
import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import { TELEGRAM_BOT_TOKEN } from "../config/env.js";

const tempDirectory = path.resolve("./temp");
const rateLimitFile = path.resolve("./rateLimit.json");
const channelId = "@testing_refferal";

// Ensure temp & rate-limit files exist
if (!fs.existsSync(tempDirectory)) fs.mkdirSync(tempDirectory);
if (!fs.existsSync(rateLimitFile)) fs.writeFileSync(rateLimitFile, "{}");

const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

// Helpers
const loadRateLimits = async () => {
  try {
    const raw = await fsPromises.readFile(rateLimitFile, "utf8");
    return JSON.parse(raw || "{}");
  } catch (err) {
    console.warn("Failed to load rate limits, returning empty object:", err?.message || err);
    return {};
  }
};

const saveRateLimits = async (data) => {
  try {
    const tmp = `${rateLimitFile}.tmp`;
    await fsPromises.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
    await fsPromises.rename(tmp, rateLimitFile);
  } catch (err) {
    console.error("Failed to save rate limits:", err?.message || err);
  }
};

const checkUserLimit = async (uid) => {
  const data = await loadRateLimits();
  const today = new Date().toISOString().slice(0, 10);
  if (!data[uid] || data[uid].date !== today) {
    data[uid] = { date: today, count: 0 };
    await saveRateLimits(data);
  }
  return (data[uid].count || 0) < 20;
};

const incrementUserLimit = async (uid) => {
  const data = await loadRateLimits();
  const today = new Date().toISOString().slice(0, 10);
  if (!data[uid] || data[uid].date !== today) data[uid] = { date: today, count: 0 };
  data[uid].count = (data[uid].count || 0) + 1;
  await saveRateLimits(data);
};

const safeTelegramCall = async (promise) => {
  try { return await promise; }
  catch (err) { console.log("Telegram API error:", err.message); return null; }
};

const joinedTelegram = async (ctx) => {
  try {
    const member = await ctx.telegram.getChatMember(channelId, ctx.from.id);
    if (!["creator", "administrator", "member"].includes(member.status)) {
      await ctx.reply(
        `🔐 To use this bot, you must join our official channel:\nJoin then send the link again.`,
        Markup.inlineKeyboard([[Markup.button.url("📢 Join Channel", `https://t.me/${channelId.replace("@", "")}`)]])
      );
      return false;
    }
    return true;
  } catch {
    await ctx.reply("Something went wrong. Try again.");
    return false;
  }
};

const getVideoInfo = (url) => new Promise((resolve) => {
  let out = "";
  const info = spawn("yt-dlp", ["-j", url]);
  info.stdout.on("data", (d) => out += d);
  info.stderr.on("data", (d) => console.log("stderr:", d.toString()));
  info.on("close", () => { try { resolve(JSON.parse(out)); } catch { resolve(null); } });
});

// Commands
bot.start((ctx) => ctx.reply(
  "👋 Welcome! I can download videos from TikTok, Instagram, YouTube, Facebook, Twitter, Pinterest and more.\n\n" +
  "Just send me a link and I will download it 🚀",
  { parse_mode: "Markdown" }
));

bot.command("help", (ctx) =>
  ctx.reply(
    "📘 *How to Use*\n\n" +
    "• Send any video link\n" +
    "• You must join our channel\n" +
    "• You can download up to *20 videos per day*",
    { parse_mode: "Markdown" }
  ));

bot.command("stats", async (ctx) => {
  const data = await loadRateLimits();
  const today = data[ctx.from.id]?.count || 0;
  await ctx.reply(`📈 *Your Stats*\nDownloads today: *${today}*\nRemaining: *${20 - today}*`, { parse_mode: "Markdown" });
});

// Video Download Handler
bot.hears(/(https?:\/\/[^\s]+)/, async (ctx) => {
  const userId = ctx.from.id;
  const url = ctx.match[1];

  if (!await joinedTelegram(ctx)) return;
  if (!(await checkUserLimit(userId)))
    return ctx.reply("😕 You’ve reached your daily limit of 20 downloads. Come back tomorrow 🚀");

  const loadingMsg = await ctx.reply("⏳ Downloading your video…");
  const tempPath = path.join(tempDirectory, `video_${Date.now()}.mp4`);
  try {
    const info = await getVideoInfo(url);
    if (info?.filesize_approx && info.filesize_approx / (1024 * 1024) > 50) {
      return safeTelegramCall(
        ctx.telegram.editMessageText(ctx.chat.id, loadingMsg.message_id, undefined, "⚠️ Video too large (>50MB)"));
    }

    const ytdlp = spawn("yt-dlp", [url, "-o", tempPath]);

    ytdlp.on("close", async (code) => {
      if (code !== 0 || !fs.existsSync(tempPath)) {
        return safeTelegramCall(
          ctx.telegram.editMessageText(
            ctx.chat.id,
            loadingMsg.message_id,
            undefined, "❌ Failed to download."));
      }

      const finalMB = fs.statSync(tempPath).size / (1024 * 1024);
      if (finalMB > 50) {
        return safeTelegramCall(
          ctx.telegram.editMessageText(
            ctx.chat.id,
            loadingMsg.message_id,
            undefined,
            `⚠️ Final file too large (${finalMB.toFixed(1)}MB)`));
      }

      await safeTelegramCall(
        ctx.telegram.editMessageText(ctx.chat.id, loadingMsg.message_id, undefined, "🚀 Video ready! Sending…"));
      await ctx.replyWithVideo({ source: tempPath }, { caption: "🎬 Here's your video!" });
      await incrementUserLimit(userId);
      await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsg.message_id)
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    });
  } catch (err) {
    console.log("Download error:", err.message);
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    safeTelegramCall(ctx.telegram.editMessageText(ctx.chat.id, loadingMsg.message_id, undefined, "❌ Failed to download."));
  };
});

// Catch-all text
bot.on("text", (ctx) =>
  ctx.reply("Send me any video link — I will download it 🚀")
);

export default bot;