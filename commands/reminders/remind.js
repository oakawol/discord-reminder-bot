/**
 * commands/reminders/remind.js
 */
const db = require("../../utils/database");
const { parseTime } = require("../../utils/timer");
const { scheduleReminder } = require("../../utils/timerManager");
const { reminderSetEmbed, errorEmbed } = require("../../utils/embeds");

module.exports = {
  name: "remind",
  description: "Set a reminder for yourself or someone else.",
  async execute(interaction) {
    const timeStr       = interaction.options.getString("time");
    const message       = interaction.options.getString("message");
    const targetChannel = interaction.options.getChannel("channel") || interaction.channel;
    const targetUser    = interaction.options.getUser("user") || interaction.user;

    const durationMs = parseTime(timeStr);
    if (!durationMs) {
      return interaction.reply({
        embeds: [errorEmbed("I didn't understand that time. Try something like `10m`, `2h`, or `1d`.")],
        ephemeral: true,
      });
    }

    const endTime    = Date.now() + durationMs;
    const reminderId = db.addReminder(targetUser.id, targetChannel.id, message, endTime, interaction.user.id);
    const data       = { id: reminderId, userId: targetUser.id, channelId: targetChannel.id, message, endTime, initiatorId: interaction.user.id };

    scheduleReminder(data);

    const { file, embed } = reminderSetEmbed(targetUser, message, timeStr, targetChannel);
    await interaction.reply({ embeds: [embed], files: [file], ephemeral: true });
  },
};
