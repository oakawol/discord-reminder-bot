/**
 * commands/economy/history.js
 */
const db = require("../../utils/database");
const { historyEmbed, errorEmbed } = require("../../utils/embeds");

module.exports = {
  name: "history",
  description: "See recent coin transactions for yourself or someone else.",
  async execute(interaction) {
    const targetUser = interaction.options.getUser("user") || interaction.user;

    if (!targetUser) {
      return interaction.reply({ embeds: [errorEmbed("Could not find that user.")], ephemeral: true });
    }

    const userData     = db.getUser(targetUser.id);
    const transactions = db.getTransactions(targetUser.id, 10);
    const { file, embed } = historyEmbed(targetUser, userData.balance, transactions);
    await interaction.reply({ embeds: [embed], files: [file] });
  },
};
