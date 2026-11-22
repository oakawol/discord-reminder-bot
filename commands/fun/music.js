/**
 * commands/fun/music.js
 * Comprehensive slash command for voice channel music playback.
 */
const { EmbedBuilder } = require("discord.js");
const { searchTrack, getQueue, createOrGetQueue } = require("../../utils/musicManager");

module.exports = {
  name: "music",
  description: "Play music in voice channels, manage playback, and queue up songs.",
  options: [
    {
      name: "play",
      description: "Play a song or add it to the queue in your voice channel.",
      type: 1,
      options: [
        {
          name: "song",
          description: "Song title, artist, or YouTube URL (e.g. 'aankho se' or 'tum hi ho')",
          type: 3,
          required: true,
        },
      ],
    },
    {
      name: "pause",
      description: "Pause the currently playing song.",
      type: 1,
    },
    {
      name: "resume",
      description: "Resume playback of the paused song.",
      type: 1,
    },
    {
      name: "skip",
      description: "Skip to the next song in the queue.",
      type: 1,
    },
    {
      name: "stop",
      description: "Stop music playback, clear the queue, and leave voice channel.",
      type: 1,
    },
    {
      name: "queue",
      description: "View the list of upcoming songs in the server queue.",
      type: 1,
    },
    {
      name: "nowplaying",
      description: "Show information about the currently playing song.",
      type: 1,
    },
  ],

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    if (!guildId) {
      return interaction.reply({
        content: "❌ Music commands can only be used inside a Discord server voice channel.",
        ephemeral: true,
      });
    }

    const member = interaction.member;
    const voiceChannel = member?.voice?.channel;

    if (sub === "play") {
      await interaction.deferReply();

      if (!voiceChannel) {
        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle("🎧 Voice Channel Required")
              .setDescription("Arre bhai, pehle kisi voice channel mein aao tabhi toh gaana bajega! Join a voice channel first.")
              .setColor("#FFA500"),
          ],
        });
      }

      const permissions = voiceChannel.permissionsFor(interaction.client.user);
      if (!permissions.has("Connect") || !permissions.has("Speak")) {
        return interaction.editReply({
          content: "❌ Mere paas is voice channel mein aane ya bolne ki permission nahi hai! Please grant `Connect` and `Speak` permissions.",
        });
      }

      const query = interaction.options.getString("song");
      const track = await searchTrack(query);

      if (!track) {
        return interaction.editReply({
          embeds: [
            new EmbedBuilder()
              .setTitle("🔍 Song Not Found")
              .setDescription(`Could not find any tracks matching: **${query}**`)
              .setColor("#FF0000"),
          ],
        });
      }

      track.requestedBy = interaction.user;

      const queue = createOrGetQueue(guildId, voiceChannel, interaction.channel);

      if (queue.isPlaying) {
        queue.songs.push(track);
        const embed = new EmbedBuilder()
          .setTitle("📋 Added to Queue")
          .setDescription(`**[${track.title}](${track.url})**`)
          .addFields(
            { name: "⏱️ Duration", value: track.duration || "Unknown", inline: true },
            { name: "🔢 Position in Queue", value: `#${queue.songs.length}`, inline: true },
            { name: "👤 Added By", value: `<@${interaction.user.id}>`, inline: true }
          )
          .setThumbnail(track.thumbnail || null)
          .setColor("#00FF88");
        return interaction.editReply({ embeds: [embed] });
      } else {
        queue.songs.push(track);
        await queue.playNext();
        return interaction.editReply({
          content: `🎶 Starting playback for **${track.title}** in <#${voiceChannel.id}>! 🔥`,
        });
      }
    }

    const queue = getQueue(guildId);
    if (!queue || (!queue.currentSong && queue.songs.length === 0)) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("🔇 No Music Playing")
            .setDescription("Abhi server mein koi gaana nahi chal raha hai! Use `/music play <song>` to start playing.")
            .setColor("#808080"),
        ],
        ephemeral: true,
      });
    }

    if (sub === "pause") {
      if (queue.player.state.status === "paused") {
        return interaction.reply({ content: "⏸️ Song is already paused bhai!", ephemeral: true });
      }
      queue.player.pause();
      return interaction.reply("⏸️ Song paused! Use `/music resume` jab sunna ho.");
    }

    if (sub === "resume") {
      if (queue.player.state.status !== "paused") {
        return interaction.reply({ content: "▶️ Song is already playing bhai!", ephemeral: true });
      }
      queue.player.unpause();
      return interaction.reply("▶️ Resumed music playback! Full vibe chalu 🔥");
    }

    if (sub === "skip") {
      const skipped = queue.currentSong?.title || "current track";
      queue.player.stop();
      return interaction.reply(`⏭️ Skipped **${skipped}**! Playing next in queue...`);
    }

    if (sub === "stop") {
      queue.destroy();
      return interaction.reply("⏹️ Music stopped, queue cleared, and disconnected from voice channel! 👋");
    }

    if (sub === "nowplaying" || sub === "np") {
      const s = queue.currentSong;
      if (!s) {
        return interaction.reply({ content: "No song currently playing.", ephemeral: true });
      }
      const embed = new EmbedBuilder()
        .setTitle("🎶 Currently Playing Track")
        .setDescription(`**[${s.title}](${s.url})**`)
        .addFields(
          { name: "⏱️ Duration", value: s.duration || "Unknown", inline: true },
          { name: "👤 Requested By", value: `<@${s.requestedBy?.id}>`, inline: true },
          { name: "🔊 Voice Channel", value: `<#${queue.voiceChannel.id}>`, inline: true }
        )
        .setThumbnail(s.thumbnail || null)
        .setColor("#FF0055");
      return interaction.reply({ embeds: [embed] });
    }

    if (sub === "queue") {
      const current = queue.currentSong;
      const upcoming = queue.songs;
      let desc = current ? `**Currently Playing:**\n🎶 [${current.title}](${current.url}) (${current.duration || "?"})\n\n` : "";

      if (upcoming.length === 0) {
        desc += "*Queue is currently empty! Use `/music play` to add more tracks.*";
      } else {
        desc += "**Upcoming Songs in Queue:**\n";
        desc += upcoming
          .slice(0, 10)
          .map((song, i) => `${i + 1}. **[${song.title}](${song.url})** (${song.duration || "?"}) • <@${song.requestedBy?.id}>`)
          .join("\n");
        if (upcoming.length > 10) {
          desc += `\n*...and ${upcoming.length - 10} more song(s) in queue.*`;
        }
      }

      const embed = new EmbedBuilder()
        .setTitle(`🎵 Music Queue for ${interaction.guild.name}`)
        .setDescription(desc)
        .setColor("#5865F2");

      return interaction.reply({ embeds: [embed] });
    }
  },
};
