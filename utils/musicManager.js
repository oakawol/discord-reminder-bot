/**
 * utils/musicManager.js
 * Ultra-lightweight, memory-efficient voice music player using play-dl and @discordjs/voice.
 * Uses SoundCloud as primary source to bypass YouTube datacenter bot-checks and save RAM on small containers.
 */
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
} = require("@discordjs/voice");
const play = require("play-dl");
const yts = require("yt-search");
const { EmbedBuilder } = require("discord.js");

const queues = new Map();
let soundCloudReady = false;

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

// Pre-warm client ID in background
ensureSoundCloud().catch(() => {});

/**
 * Streams SoundCloud audio with quality: 0 (AAC 160kbps), avoiding deprecated abr_sq streams that return 404.
 */
async function getSafeSoundCloudStream(url) {
  await ensureSoundCloud();
  let lastError = null;
  // Quality 0 is pristine 160kbps AAC which SoundCloud servers serve reliably with HTTP 200.
  // Defaults to 0, then tries 1 (96kbps AAC) if 0 fails.
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
    this.player = createAudioPlayer();
    this.connection = null;
    this.idleTimer = null;

    this.player.on(AudioPlayerStatus.Idle, () => {
      this.playNext();
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
        selfDeaf: true,
        selfMute: false,
      });

      this.connection.subscribe(this.player);

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

      try {
        await entersState(this.connection, VoiceConnectionStatus.Ready, 5_000);
      } catch (e) {}

      let audioStream = null;
      let streamType = "arbitrary";

      if (song.source === "soundcloud" || song.url.includes("soundcloud.com")) {
        const scStream = await getSafeSoundCloudStream(song.url);
        audioStream = scStream.stream;
        streamType = scStream.type;
      } else {
        // Try play-dl stream; if YouTube blocked by datacenter IP, fallback to SoundCloud
        try {
          const ytStream = await play.stream(song.url);
          audioStream = ytStream.stream;
          streamType = ytStream.type;
        } catch (ytErr) {
          const fallbackTrack = await searchTrack(song.title);
          if (fallbackTrack && fallbackTrack.source === "soundcloud") {
            const scStream = await getSafeSoundCloudStream(fallbackTrack.url);
            audioStream = scStream.stream;
            streamType = scStream.type;
          } else {
            throw ytErr;
          }
        }
      }

      const resource = createAudioResource(audioStream, {
        inputType: streamType,
        inlineVolume: true,
      });

      if (resource.volume) {
        resource.volume.setVolume(1.0);
      }

      this.player.play(resource);

      const embed = new EmbedBuilder()
        .setTitle("🎶 Now Playing")
        .setDescription(`**[${song.title}](${song.url})**`)
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
  await ensureSoundCloud();
  try {
    // 1. Direct SoundCloud URL
    if (query.includes("soundcloud.com")) {
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

    // 2. Search SoundCloud tracks (Fast, lightweight, no datacenter IP bot-check)
    const scResults = await play.search(query, { source: { soundcloud: "tracks" }, limit: 12 }).catch(() => []);
    if (scResults && scResults.length > 0) {
      // Prioritize full tracks (> 60 seconds) over short 30-sec official previews
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
        } catch (candidateErr) {
          // Skip dead/404 tracks and test next candidate
          continue;
        }
      }
    }

    // 3. Fallback: yt-search
    const searchResult = await yts(query).catch(() => null);
    const video = searchResult?.videos?.[0];
    if (video) {
      return {
        title: video.title,
        url: video.url,
        duration: video.timestamp,
        thumbnail: video.thumbnail,
        source: "youtube",
      };
    }
  } catch (err) {
    console.error("[searchTrack error]:", err);
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
