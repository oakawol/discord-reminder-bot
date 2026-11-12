/**
 * commands/economy/balance.js
 */
const db = require("../../utils/database");
const { balanceEmbed, errorEmbed } = require("../../utils/embeds");

module.exports = {
  name: "balance",
  description: "Check your coins, rank, and recent transactions.",
  async execute(interaction) {
    const targetUser = interaction.options.getUser("user") || interaction.user;

    if (!targetUser) {
      return interaction.reply({ embeds: [errorEmbed("Could not find that user.")], ephemeral: true });
    }

    const userData     = db.getUser(targetUser.id);
    const allUsers     = db.getAllUsers();
    const trophies     = ["🥇", "🥈", "🥉"];
    const top3         = allUsers.slice(0, 3);
    const rank         = allUsers.findIndex((u) => u.userId === targetUser.id) + 1;
    const totalEconomy = allUsers.reduce((s, u) => s + u.balance, 0);
    const transactions = db.getTransactions(targetUser.id, 5);

    const leaderboardStr = top3
      .map((u, i) => `${trophies[i]}  <@${u.userId}>  **₹${u.balance.toLocaleString()}**`)
      .join("\n")
      + (rank > 3 ? `\n\n…Your rank: **#${rank}**` : "");

    const { file, embed } = balanceEmbed(interaction.client, targetUser, userData.balance, rank, leaderboardStr, totalEconomy, transactions);
    await interaction.reply({ embeds: [embed], files: [file] });
  },
};
