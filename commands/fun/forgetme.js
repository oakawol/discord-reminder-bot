/**
 * commands/fun/forgetme.js
 * Quick command to wipe all memory and personal conversation history.
 */
const db = require("../../utils/database");
const { successEmbed } = require("../../utils/embeds");

module.exports = {
  name: "forgetme",
  description: "Wipe all your saved facts, preferred name, and chat history.",
  async execute(interaction) {
    const user = interaction.user || interaction.author;
    db.clearUserMemory(user.id);
    return interaction.reply({
      embeds: [
        successEmbed(
          "Memory Wiped",
          "I have completely erased your personal memory profile, facts, and conversation history. 🌱"
        ),
      ],
      ephemeral: true,
    });
  },
};
