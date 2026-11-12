/**
 * commands/fun/imagine.js
 */
const { EmbedBuilder, AttachmentBuilder } = require("discord.js");
const { C, errorEmbed } = require("../../utils/embeds");

module.exports = {
  name: "imagine",
  description: "Generate an AI image from a text description.",
  async execute(interaction) {
    const prompt = interaction.options.getString("prompt");
    if (!prompt) {
      return interaction.reply({
        embeds: [errorEmbed("Please describe what you want to generate.")],
        ephemeral: true,
      });
    }

    if (interaction.deferReply)         await interaction.deferReply();
    else if (interaction.channel?.sendTyping) await interaction.channel.sendTyping();

    try {
      const encoded  = encodeURIComponent(prompt);
      const seed     = Math.floor(Math.random() * 1_000_000);
      const url      = `https://image.pollinations.ai/prompt/${encoded}?width=1024&height=1024&nologo=true&model=flux&seed=${seed}`;
      const response = await fetch(url);

      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);

      const buffer     = await response.arrayBuffer();
      const attachment = new AttachmentBuilder(Buffer.from(buffer), { name: "imagine.jpeg" });

      const embed = new EmbedBuilder()
        .setColor(C.primary)
        .setTitle("🎨  Here's your image")
        .setDescription(`> *${prompt}*`)
        .setImage("attachment://imagine.jpeg")
        .setFooter({ text: "Made with Pollinations AI" })
        .setTimestamp();

      const payload = { embeds: [embed], files: [attachment] };
      if (interaction.editReply) await interaction.editReply(payload);
      else                       await interaction.reply(payload);

    } catch (error) {
      console.error("[Imagine]", error);
      const errPayload = {
        embeds: [errorEmbed("Could not generate the image right now. Please try again later.")],
      };
      if (interaction.editReply) await interaction.editReply(errPayload);
      else                       await interaction.reply(errPayload);
    }
  },
};
