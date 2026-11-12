/**
 * commands/admin/taskping.js
 * Admin assigns a task to a user. The bot pings that user every 30 minutes
 * until the user replies in that channel.
 */
const { PermissionFlagsBits } = require("discord.js");
const db = require("../../utils/database");
const { scheduleTaskPing } = require("../../utils/timerManager");
const { taskAssignedEmbed, errorEmbed } = require("../../utils/embeds");

module.exports = {
  name: "taskping",
  description: "Ping a user every 30 minutes about a task until they reply here.",
  async execute(interaction) {
    const isAdmin =
      interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
      (() => {
        const config = db.getGuildConfig(interaction.guildId);
        return config.adminRoleId && interaction.member?.roles?.cache?.has(config.adminRoleId);
      })();

    if (!isAdmin) {
      return interaction.reply({
        embeds: [errorEmbed("Only admins can assign task pings.")],
        ephemeral: true,
      });
    }

    const targetUser = interaction.options.getUser("user");
    const task       = interaction.options.getString("task");

    if (!targetUser) {
      return interaction.reply({
        embeds: [errorEmbed("Please mention a valid user.")],
        ephemeral: true,
      });
    }

    if (!task?.trim()) {
      return interaction.reply({
        embeds: [errorEmbed("Please describe the task.")],
        ephemeral: true,
      });
    }

    if (targetUser.bot) {
      return interaction.reply({
        embeds: [errorEmbed("You can't assign a task to a bot.")],
        ephemeral: true,
      });
    }

    const intervalMs = 30 * 60 * 1000;
    const taskPing   = db.addTaskPing(
      targetUser.id,
      interaction.channelId,
      task.trim(),
      interaction.user.id,
      intervalMs
    );

    scheduleTaskPing(taskPing);

    await interaction.reply({
      content: `${targetUser}`,
      embeds: [taskAssignedEmbed(targetUser, task.trim())],
    });
  },
};
