/**
 * commands/admin/text.js
 */
const { PermissionFlagsBits } = require("discord.js");
const { errorEmbed, successEmbed } = require("../../utils/embeds");

module.exports = {
  name: "text",
  description: "Send a message in this channel through the bot.",
  async execute(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        embeds: [errorEmbed("Only admins can use this command.")],
        ephemeral: true,
      });
    }

    const message = interaction.options.getString("message");
    await interaction.reply({
      embeds: [successEmbed("Sent", "Your message was posted below.")],
      ephemeral: true,
    });
    await interaction.channel.send(message);
  },
};
