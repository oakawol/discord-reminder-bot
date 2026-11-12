/**
 * commands/economy/remove_money.js
 */
const { PermissionFlagsBits } = require("discord.js");
const db = require("../../utils/database");
const { removeMoneyEmbed, errorEmbed } = require("../../utils/embeds");

module.exports = {
  name: "remove_money",
  description: "Remove coins from a user's balance.",
  async execute(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ embeds: [errorEmbed("Only admins can remove money.")], ephemeral: true });
    }

    const targetUser = interaction.options.getUser("user");
    const amount     = interaction.options.getNumber("amount");
    const reason     = interaction.options.getString("reason") || "Deducted by admin";

    if (!targetUser || !amount) {
      return interaction.reply({ embeds: [errorEmbed("Please pick a valid user and enter an amount.")], ephemeral: true });
    }

    if (amount <= 0) {
      return interaction.reply({ embeds: [errorEmbed("Amount must be more than zero.")], ephemeral: true });
    }

    const oldBalance   = db.getUser(targetUser.id).balance;
    const newBalance   = db.removeMoney(targetUser.id, amount, reason, interaction.user.id);
    const transactions = db.getTransactions(targetUser.id, 5);
    const { file, embed } = removeMoneyEmbed(targetUser, amount, oldBalance, newBalance, transactions);
    await interaction.reply({ embeds: [embed], files: [file] });
  },
};
