/**
 * commands/tickets/setup.js
 */
const { EmbedBuilder } = require("discord.js");
const db = require("../../utils/database");
const { errorEmbed, C, footerQuip } = require("../../utils/embeds");

module.exports = {
  name: "setup",
  description: "Set up the ticket system for this server.",
  async execute(interaction) {
    const adminRole         = interaction.options.getRole("admin_role");
    const logChannel        = interaction.options.getChannel("log_channel");
    const transcriptChannel = interaction.options.getChannel("transcript_channel");

    db.setGuildConfig(interaction.guildId, {
      adminRoleId:         adminRole.id,
      logChannelId:        logChannel.id,
      transcriptChannelId: transcriptChannel.id,
    });

    const embed = new EmbedBuilder()
      .setColor(C.success)
      .setTitle("✅  Ticket system ready")
      .setDescription("All done! Here's what was saved:")
      .addFields(
        { name: "👤  Admin role",          value: `${adminRole}`,         inline: true },
        { name: "📝  Log channel",          value: `${logChannel}`,        inline: true },
        { name: "📄  Transcripts channel",  value: `${transcriptChannel}`, inline: true }
      )
      .setFooter({ text: "Next: use /category create to add ticket types." })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
