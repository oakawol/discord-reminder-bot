/**
 * commands/admin/memory.js
 */
const { PermissionFlagsBits } = require("discord.js");
const db = require("../../utils/database");
const { memoryListEmbed, errorEmbed, successEmbed } = require("../../utils/embeds");

module.exports = {
  name: "memory",
  description: "View or change the bot's saved memory slots.",
  async execute(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        embeds: [errorEmbed("Only admins can use memory slots.")],
        ephemeral: true,
      });
    }

    const sub = interaction.options.getSubcommand();

    if (sub === "set") {
      const slot    = interaction.options.getInteger("slot");
      const message = interaction.options.getString("message");
      db.setMemory(slot, message);
      return interaction.reply({
        embeds: [successEmbed("Saved", `Slot **${slot}** has been updated.`)],
        ephemeral: true,
      });
    }

    if (sub === "get") {
      const slot    = interaction.options.getInteger("slot");
      const message = db.getMemory(slot);
      if (!message) {
        return interaction.reply({
          embeds: [errorEmbed(`Slot **${slot}** is empty. Save something with \`/memory set\`.`)],
          ephemeral: true,
        });
      }
      await interaction.reply({
        embeds: [successEmbed("Sending…", `Posting slot **${slot}** to this channel.`)],
        ephemeral: true,
      });
      await interaction.channel.send(message);
    }

    if (sub === "list") {
      const allMemory = db.getAllMemory();
      return interaction.reply({ embeds: [memoryListEmbed(allMemory)], ephemeral: true });
    }
  },
};
