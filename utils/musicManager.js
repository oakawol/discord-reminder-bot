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
        await ensureSoundCloud();
        const scStream = await play.stream(song.url);
        audioStream = scStream.stream;
        streamType = scStream.type;
      } else {
        // Try play-dl stream; if YouTube blocked by datacenter IP, fallback to SoundCloud
        try {
          const ytStream = await play.stream(song.url);
          audioStream = ytStream.stream;
          streamType = ytStream.type;
        } catch (ytErr) {
          await ensureSoundCloud();
          const fallbackResults = await play.search(song.title, { source: { soundcloud: "tracks" }, limit: 1 }).catch(() => []);
          if (fallbackResults && fallbackResults[0]) {
            const scStream = await play.stream(fallbackResults[0].url);
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

    // 2. Search SoundCloud tracks (Fast, lightweight, no datacenter IP bot-check)
    const scResults = await play.search(query, { source: { soundcloud: "tracks" }, limit: 5 }).catch(() => []);
    if (scResults && scResults.length > 0) {
      const best = scResults.find((t) => t.durationInSec > 60) || scResults[0];
      const mins = Math.floor(best.durationInSec / 60);
      const secs = String(best.durationInSec % 60).padStart(2, "0");
      return {
        title: best.name,
        url: best.url,
        duration: `${mins}:${secs}`,
        thumbnail: best.thumbnail || null,
        source: "soundcloud",
      };
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
