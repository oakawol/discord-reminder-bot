/**
 * commands/reminders/cd.js
 */
const db = require("../../utils/database");
const { parseTime } = require("../../utils/timer");
const { scheduleCooldown } = require("../../utils/timerManager");
const { cooldownSetEmbed, errorEmbed } = require("../../utils/embeds");

module.exports = {
  name: "cd",
  description: "Put a user on cooldown so they can't be assigned tasks for a while.",
  async execute(interaction) {
    const targetUser = interaction.options.getUser("user");
    const timeStr    = interaction.options.getString("time") || "24h";

    if (!targetUser) {
      return interaction.reply({
        embeds: [errorEmbed("Please pick a valid user.")],
        ephemeral: true,
      });
    }

    const existing = db.getCooldown(targetUser.id);
    if (existing) {
      const unix = Math.floor(existing.endTime / 1000);
      return interaction.reply({
        embeds: [errorEmbed(`**${targetUser.username}** already has a cooldown.\nIt ends <t:${unix}:R>.`)],
        ephemeral: true,
      });
    }

    const duration = parseTime(timeStr);
    if (!duration) {
      return interaction.reply({
        embeds: [errorEmbed("I didn't understand that time. Try something like `24h`, `1d`, or `12h`.")],
        ephemeral: true,
      });
    }

    const endTime = Date.now() + duration;
    db.setCooldown(targetUser.id, interaction.channelId, endTime, interaction.user.id);

    const cdData = { userId: targetUser.id, channelId: interaction.channelId, endTime, initiatorId: interaction.user.id };
    scheduleCooldown(cdData);

    const { file, embed } = cooldownSetEmbed(targetUser, timeStr, endTime, interaction.user);
    await interaction.reply({ embeds: [embed], files: [file] });
  },
};
