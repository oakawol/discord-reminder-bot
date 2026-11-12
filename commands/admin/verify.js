/**
 * commands/admin/verify.js
 */
const { PermissionFlagsBits, EmbedBuilder } = require("discord.js");
const { errorEmbed, C } = require("../../utils/embeds");

const REDDIT_REGEX = /(?:[a-z0-9-]+\.)?(?:reddit\.com|redd\.it)\/(?:r\/[^\/]+\/)?(?:comments\/[^\/]+(?:\/[^\/]+\/[a-z0-9]+)?|s\/[a-z0-9]+)/i;
const LOADING_EMOJI = "1481725057024917715";
const CHECK_EMOJI   = "1481725300349079673";

module.exports = {
  name: "verify",
  description: "Check if a link in this channel is working.",
  async execute(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        embeds: [errorEmbed("Only admins can verify links.")],
        ephemeral: true,
      });
    }

    const link = interaction.options.getString("link");
    let targetMessage = null;

    if (link) {
      const msgId = link.match(/\d+$/)?.[0] || link;
      targetMessage = await interaction.channel.messages.fetch(msgId).catch(() => null);
      if (!targetMessage) {
        return interaction.reply({
          embeds: [errorEmbed("I couldn't find that message. Make sure the link or ID is correct.")],
          ephemeral: true,
        });
      }
    } else {
      const messages  = await interaction.channel.messages.fetch({ limit: 50 });
      targetMessage   = messages.find((m) => REDDIT_REGEX.test(m.content)) || null;
    }

    if (!targetMessage) {
      return interaction.reply({
        embeds: [errorEmbed("No recent Reddit link found in this channel.")],
        ephemeral: true,
      });
    }

    await verifyMessage(interaction, targetMessage);
  },
};

module.exports.verifyMessage  = verifyMessage;
module.exports.REDDIT_REGEX   = REDDIT_REGEX;
module.exports.LOADING_EMOJI  = LOADING_EMOJI;
module.exports.CHECK_EMOJI    = CHECK_EMOJI;

async function verifyMessage(interaction, message) {
  try {
    const loading = message.reactions.cache.get(LOADING_EMOJI);
    if (loading) await loading.users.remove(interaction.client.user.id).catch(() => {});
    await message.react(CHECK_EMOJI);
  } catch (err) {
    console.error("[Verify]", err.message);
  }
}
