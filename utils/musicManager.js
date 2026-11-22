/**
 * utils/musicManager.js
 * Ultra-lightweight, memory-efficient voice music player for Discord.
 * Uses JioSaavn as Primary Engine (free, unlimited, pristine 160kbps AAC, full song catalog)
 * with SoundCloud and YouTube as intelligent fallbacks.
 */
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  NoSubscriberBehavior,
  StreamType,
  entersState,
} = require("@discordjs/voice");
const play = require("play-dl");
const yts = require("yt-search");
const CryptoJS = require("crypto-js");
const https = require("https");
const http = require("http");
const fs = require("fs");
const { execSync } = require("child_process");
const { EmbedBuilder } = require("discord.js");

// Ensure FFmpeg is available on the container even if npm blocked install-scripts
function ensureFfmpeg() {
  try {
    const ffmpegPath = require("ffmpeg-static");
    if (ffmpegPath) {
      process.env.FFMPEG_PATH = ffmpegPath;
      if (!fs.existsSync(ffmpegPath)) {
        console.log("[Audio Init] ffmpeg binary missing on disk. Auto-installing ffmpeg-static...");
        execSync("node node_modules/ffmpeg-static/install.js", { stdio: "inherit" });
      }
      if (fs.existsSync(ffmpegPath)) {
        try {
          fs.chmodSync(ffmpegPath, 0o755);
        } catch (e) {}
        console.log(`[Audio Init] ✅ FFmpeg binary verified: ${ffmpegPath}`);
      }
    }
  } catch (err) {
    console.warn("[Audio Init Warning]:", err.message);
  }
}
ensureFfmpeg();

const queues = new Map();
let soundCloudReady = false;

function decodeHtml(html) {
  if (!html) return "";
  return html
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function decryptMediaUrl(encrypted) {
  try {
    const key = CryptoJS.enc.Utf8.parse("38346591");
    const decrypted = CryptoJS.DES.decrypt(
      { ciphertext: CryptoJS.enc.Base64.parse(encrypted) },
      key,
      { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 }
    );
    return decrypted.toString(CryptoJS.enc.Utf8);
  } catch (e) {
    return null;
  }
}

async function searchJioSaavn(query) {
  try {
    const url =
      "https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&api_version=4&ctx=web6dot0&q=" +
      encodeURIComponent(query) +
      "&n=8&p=1";
    const headers = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Referer: "https://www.jiosaavn.com/",
    };
    const res = await fetch(url, { headers });
    if (!res.ok) return null;
    const json = await res.json();
    const results = json.results || [];
    for (const song of results) {
      const enc = song.more_info?.encrypted_media_url;
      if (!enc) continue;
      const rawUrl = decryptMediaUrl(enc);
      if (!rawUrl) continue;
      // 160kbps AAC provides CD quality while consuming minimal CPU & bandwidth
      const streamUrl = rawUrl.replace("_96.", "_160.").replace("_320.", "_160.");
      const durationSec = parseInt(song.more_info?.duration || 0);
      const mins = Math.floor(durationSec / 60);
      const secs = String(durationSec % 60).padStart(2, "0");
      const thumb = (song.image || "").replace("150x150", "500x500");
      const artist = decodeHtml(
        song.more_info?.artistMap?.primary_artists?.[0]?.name || song.subtitle || ""
      );
      return {
        title: decodeHtml(song.title),
        artist: artist,
        url: song.perma_url || streamUrl,
        streamUrl: streamUrl,
        duration: `${mins}:${secs}`,
        thumbnail: thumb || null,
        source: "jiosaavn",
      };
    }
  } catch (err) {
    console.warn("[JioSaavn Search Warning]:", err.message);
  }
  return null;
}

function getHttpAudioStream(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    client
      .get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          if (maxRedirects <= 0) return reject(new Error("Too many redirects"));
          return resolve(getHttpAudioStream(res.headers.location, maxRedirects - 1));
        }
        if (res.statusCode !== 200) {
          return reject(new Error("HTTP status " + res.statusCode));
        }
        resolve(res);
      })
      .on("error", reject);
  });
}

async function ensureSoundCloud() {
  if (soundCloudReady) return true;
  try {
    const clientId = await play.getFreeClientID();
    await play.setToken({ soundcloud: { client_id: clientId } });
    soundCloudReady = true;
    return true;
  } catch (err) {
    console.warn("[SoundCloud Auth Warning]:", err.message);
    return false;
  }
}

async function getSafeSoundCloudStream(url) {
  await ensureSoundCloud();
  let lastError = null;
  for (const quality of [0, 1]) {
    try {
      const stream = await play.stream(url, { quality });
      if (stream && stream.stream) {
        return stream;
      }
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError || new Error("Failed to extract playable audio stream");
}

class GuildQueue {
  constructor(guildId, voiceChannel, textChannel) {
    this.guildId = guildId;
    this.voiceChannel = voiceChannel;
    this.textChannel = textChannel;
    this.songs = [];
    this.currentSong = null;
    this.isPlaying = false;
    this.player = createAudioPlayer({
      behaviors: {
        noSubscriber: NoSubscriberBehavior.Play,
        maxMissedFrames: 100,
      },
    });
    this.connection = null;
    this.idleTimer = null;

    this.player.on(AudioPlayerStatus.Idle, () => {
      console.log(`[Music Player ${this.guildId}] Player became Idle, playing next track...`);
      this.playNext();
    });

    this.player.on("stateChange", (oldState, newState) => {
      console.log(`[Music Player ${this.guildId}] State: ${oldState.status} -> ${newState.status}`);
      if (newState.status === AudioPlayerStatus.AutoPaused) {
        console.log(`[Music Player ${this.guildId}] AutoPaused detected, unpausing...`);
        this.player.unpause();
      }
    });

    this.player.on("error", (error) => {
      console.error(`[Music Player Error in ${guildId}]:`, error.message);
      this.textChannel
        ?.send({
          embeds: [
            new EmbedBuilder()
              .setTitle("⚠️ Playback Issue")
              .setDescription(`Failed to stream current track: ${error.message}`)
              .setColor("#FF0000"),
          ],
        })
        .catch(() => {});
      this.playNext();
    });
  }

  connect() {
    if (
      !this.connection ||
      this.connection.state.status === VoiceConnectionStatus.Destroyed
    ) {
      this.connection = joinVoiceChannel({
        channelId: this.voiceChannel.id,
        guildId: this.guildId,
        adapterCreator: this.voiceChannel.guild.voiceAdapterCreator,
        selfDeaf: false,
        selfMute: false,
      });

      this.connection.on("stateChange", (oldState, newState) => {
        console.log(`[Voice Connection ${this.guildId}] State: ${oldState.status} -> ${newState.status}`);
      });

      this.connection.on("error", (err) => {
        console.error(`[Voice Connection Error in ${this.guildId}]:`, err.message);
      });

      this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
        try {
          await Promise.race([
            entersState(this.connection, VoiceConnectionStatus.Signalling, 5_000),
            entersState(this.connection, VoiceConnectionStatus.Connecting, 5_000),
          ]);
        } catch (error) {
          this.destroy();
        }
      });
    }
  }

  resetIdleTimer() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      if (this.songs.length === 0 && !this.isPlaying) {
        this.textChannel
          ?.send({
            embeds: [
              new EmbedBuilder()
                .setTitle("👋 Left Voice Channel")
                .setDescription("Queue empty and inactive for 3 minutes. Disconnected to save bandwidth.")
                .setColor("#7289DA"),
            ],
          })
          .catch(() => {});
        this.destroy();
      }
    }, 3 * 60 * 1000);
  }

  async playNext() {
    if (this.songs.length === 0) {
      this.isPlaying = false;
      this.currentSong = null;
      this.resetIdleTimer();
      return;
    }

    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }

    const song = this.songs.shift();
    this.currentSong = song;
    this.isPlaying = true;

    try {
      this.connect();

      // Ensure voice connection is completely Ready before streaming audio packets
      if (this.connection.state.status !== VoiceConnectionStatus.Ready) {
        try {
          await entersState(this.connection, VoiceConnectionStatus.Ready, 15_000);
        } catch (connErr) {
          console.warn(`[Voice Warning] Connection did not reach Ready within 15s: ${connErr.message}`);
        }
      }

      if (!this.subscription || this.subscription.connection !== this.connection) {
        this.subscription = this.connection.subscribe(this.player);
      }

      let audioStream = null;
      let streamType = StreamType.Arbitrary;

      if (song.source === "jiosaavn" && song.streamUrl) {
        audioStream = await getHttpAudioStream(song.streamUrl);
        streamType = StreamType.Arbitrary;
      } else if (song.source === "soundcloud" || song.url.includes("soundcloud.com")) {
        const scStream = await getSafeSoundCloudStream(song.url);
        audioStream = scStream.stream;
        streamType = scStream.type;
      } else {
        try {
          const ytStream = await play.stream(song.url);
          audioStream = ytStream.stream;
          streamType = ytStream.type;
        } catch (ytErr) {
          const saavnFallback = await searchJioSaavn(song.title);
          if (saavnFallback) {
            audioStream = await getHttpAudioStream(saavnFallback.streamUrl);
            streamType = StreamType.Arbitrary;
          } else {
            throw ytErr;
          }
        }
      }

      const resource = createAudioResource(audioStream, {
        inputType: streamType,
        inlineVolume: true,
      });

      resource.playStream.on("error", (streamErr) => {
        console.error(`[Resource PlayStream Error in ${this.guildId}]:`, streamErr.message);
      });

      if (resource.volume) {
        resource.volume.setVolume(1.0);
      }

      this.player.play(resource);

      if (this.player.state.status === AudioPlayerStatus.AutoPaused) {
        this.player.unpause();
      }

      const embed = new EmbedBuilder()
        .setTitle("🎶 Now Playing")
        .setDescription(`**[${song.title}](${song.url})**${song.artist ? `\n*${song.artist}*` : ""}`)
        .addFields(
          { name: "⏱️ Duration", value: song.duration || "Unknown", inline: true },
          { name: "👤 Requested By", value: `<@${song.requestedBy.id}>`, inline: true },
          { name: "🔊 Voice Channel", value: `<#${this.voiceChannel.id}>`, inline: true }
        )
        .setThumbnail(song.thumbnail || null)
        .setColor("#FF0055");

      this.textChannel?.send({ embeds: [embed] }).catch(() => {});
    } catch (err) {
      console.error("[playNext error]:", err);
      this.textChannel
        ?.send(`❌ Error playing **${song.title}**: ${err.message}`)
        .catch(() => {});
      this.playNext();
    }
  }

  destroy() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.songs = [];
    this.currentSong = null;
    this.isPlaying = false;
    if (this.subscription) {
      try {
        this.subscription.unsubscribe();
      } catch (e) {}
      this.subscription = null;
    }
    try {
      this.player.stop();
    } catch (e) {}
    if (this.connection) {
      try {
        this.connection.destroy();
      } catch (e) {}
      this.connection = null;
    }
    queues.delete(this.guildId);
  }
}

async function searchTrack(query) {
  // 1. Direct SoundCloud URL
  if (query.includes("soundcloud.com")) {
    await ensureSoundCloud();
    const info = await play.soundcloud(query).catch(() => null);
    if (info) {
      const testStream = await getSafeSoundCloudStream(info.url).catch(() => null);
      if (testStream) {
        const mins = Math.floor(info.durationInSec / 60);
        const secs = String(info.durationInSec % 60).padStart(2, "0");
        return {
          title: info.name,
          url: info.url,
          duration: `${mins}:${secs}`,
          thumbnail: info.thumbnail || null,
          source: "soundcloud",
        };
      }
    }
  }

  // 2. Direct YouTube URL
  if (query.includes("youtube.com") || query.includes("youtu.be")) {
    const searchResult = await yts(query).catch(() => null);
    const video = searchResult?.videos?.[0];
    if (video) {
      const saavnMatch = await searchJioSaavn(video.title);
      if (saavnMatch) return saavnMatch;
      return {
        title: video.title,
        url: video.url,
        duration: video.timestamp,
        thumbnail: video.thumbnail,
        source: "youtube",
      };
    }
  }

  // 3. Primary Music Engine: JioSaavn (Fast, high-fidelity 160k AAC, full song catalog, no bot blocks)
  const saavnSong = await searchJioSaavn(query);
  if (saavnSong) {
    return saavnSong;
  }

  // 4. Secondary Fallback: SoundCloud
  await ensureSoundCloud();
  const scResults = await play.search(query, { source: { soundcloud: "tracks" }, limit: 10 }).catch(() => []);
  if (scResults && scResults.length > 0) {
    const fullTracks = scResults.filter((t) => t.durationInSec > 60);
    const candidates = fullTracks.length > 0 ? [...fullTracks, ...scResults] : scResults;
    for (const candidate of candidates) {
      try {
        const testStream = await getSafeSoundCloudStream(candidate.url);
        if (testStream) {
          const mins = Math.floor(candidate.durationInSec / 60);
          const secs = String(candidate.durationInSec % 60).padStart(2, "0");
          return {
            title: candidate.name,
            url: candidate.url,
            duration: `${mins}:${secs}`,
            thumbnail: candidate.thumbnail || null,
            source: "soundcloud",
          };
        }
      } catch (e) {
        continue;
      }
    }
  }

  // 5. Final Fallback: YouTube Search
  const ytsRes = await yts(query).catch(() => null);
  const v = ytsRes?.videos?.[0];
  if (v) {
    return {
      title: v.title,
      url: v.url,
      duration: v.timestamp,
      thumbnail: v.thumbnail,
      source: "youtube",
    };
  }

  return null;
}

function getQueue(guildId) {
  return queues.get(guildId) || null;
}

function createOrGetQueue(guildId, voiceChannel, textChannel) {
  let q = queues.get(guildId);
  if (!q) {
    q = new GuildQueue(guildId, voiceChannel, textChannel);
    queues.set(guildId, q);
  } else {
    q.voiceChannel = voiceChannel;
    q.textChannel = textChannel;
  }
  return q;
}

module.exports = {
  searchTrack,
  getQueue,
  createOrGetQueue,
};
