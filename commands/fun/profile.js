/**
 * commands/fun/profile.js
 * View or manage what the bot remembers about you across servers and DMs.
 */
const { EmbedBuilder } = require("discord.js");
const db = require("../../utils/database");
const { C, errorEmbed, successEmbed, footerQuip } = require("../../utils/embeds");

module.exports = {
  name: "profile",
  description: "View or manage what the bot remembers about you.",
  async execute(interaction) {
    const user = interaction.user || interaction.author;
    const sub = interaction.options?.getSubcommand?.() || "view";

    if (sub === "wipe" || sub === "clear" || sub === "forget") {
      db.clearUserMemory(user.id);
      return interaction.reply({
        embeds: [
          successEmbed(
            "Memory Cleared",
            "I have completely forgotten your preferred name, stored facts, and past conversations. Fresh start! 🌱"
          ),
        ],
        ephemeral: true,
      });
    }

    // Default: view profile
    const profile = db.getUserProfile(user.id);
    const conversation = db.getUserConversation(user.id, 20);

    const preferredName = profile.preferredName || "*Not set yet (just tell me your name in chat!)*";
    const factsList = (profile.facts && profile.facts.length > 0)
      ? profile.facts.map((f, i) => `\`${i + 1}.\` ${f}`).join("\n")
      : "*No specific facts stored yet. Tell me about your hobbies or interests!*";

    const embed = new EmbedBuilder()
      .setColor(C.primary)
      .setTitle(`🧠  Memory Profile: ${user.username}`)
      .setDescription(
        `Here is everything I automatically remember about you across all servers and DMs.\n\n` +
        `**Preferred Name:**\n> **${preferredName}**\n\n` +
        `**Known Facts & Preferences:**\n${factsList}\n\n` +
        `**Stored Conversation Turns:** \`${conversation.length}\` messages in active memory\n\n` +
        `*Tip: To wipe your memory, use \`/profile wipe\` or \`!forgetme\`.*`
      )
      .setFooter({ text: footerQuip("Personalized bot memory") })
      .setTimestamp();

    return interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
