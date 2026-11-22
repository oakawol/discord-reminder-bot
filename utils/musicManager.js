/**
 * utils/musicManager.js
 * High-performance voice channel music player using @discordjs/voice, @distube/ytdl-core, and yt-search.
 */
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  demuxProbe,
  StreamType,
} = require("@discordjs/voice");
const { Ytdl, Client } = require("@distube/ytdl-core");
const yts = require("yt-search");
const { EmbedBuilder } = require("discord.js");

// Initialize Ytdl with VisionOS and Tv clients to bypass player solver errors
const ytdl = new Ytdl({
  clients: [Client.VisionOS, Client.Tv, Client.WebEmbedded, Client.Mweb],
});
const queues = new Map();

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
      } catch (e) {
        // Continue if connection is already transitioning
      }

      const stream = ytdl.download(song.url, {
        filter: { hasAudio: true, hasVideo: false },
        quality: "highestaudio",
        highWaterMark: 1 << 25,
      });

      // Use demuxProbe to detect audio format (e.g. webm/opus) and create crystal clear audio resource
      const { stream: probedStream, type } = await demuxProbe(stream);
      const resource = createAudioResource(probedStream, {
        inputType: type,
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
  try {
    if (query.startsWith("http://") || query.startsWith("https://")) {
      const res = await yts({ videoId: query.split("v=")[1]?.split("&")[0] || "" }).catch(() => null);
      if (res) {
        return {
          title: res.title,
          url: res.url,
          duration: res.timestamp,
          thumbnail: res.thumbnail,
        };
      }
    }
    const searchResult = await yts(query);
    const video = searchResult.videos[0];
    if (!video) return null;
    return {
      title: video.title,
      url: video.url,
      duration: video.timestamp,
      thumbnail: video.thumbnail,
    };
  } catch (err) {
    console.error("[searchTrack error]:", err);
    return null;
  }
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
