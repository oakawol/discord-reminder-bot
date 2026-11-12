/**
 * commands/admin/upi.js
 * Save and look up UPI IDs and QR codes per user.
 */
const { EmbedBuilder, AttachmentBuilder, PermissionFlagsBits } = require("discord.js");
const db = require("../../utils/database");
const { C, divider, footerQuip, errorEmbed, successEmbed } = require("../../utils/embeds");
const fs   = require("fs");
const path = require("path");

module.exports = {
  name: "upi",
  description: "Save or look up a user's UPI ID and QR code.",
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    // ── SET ───────────────────────────────────────────────────────────────────
    if (sub === "set") {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({
          embeds: [errorEmbed("Only admins can save UPI details.")],
          ephemeral: true,
        });
      }

      const targetUser = interaction.options.getUser("user");
      const upiId      = interaction.options.getString("upi_id");
      const attachment = interaction.options.getAttachment("qr_code");

      if (!upiId.includes("@")) {
        return interaction.reply({
          embeds: [errorEmbed("That doesn't look like a valid UPI ID.\nIt should contain `@` — for example: `name@upi`.")],
          ephemeral: true,
        });
      }

      let qrDataUri = null;
      if (attachment) {
        const ext = attachment.name.split(".").pop() || "png";
        try {
          const res    = await fetch(attachment.url);
          if (!res.ok) throw new Error(`Fetch failed: ${res.statusText}`);
          const buffer = await res.arrayBuffer();
          qrDataUri    = `data:image/${ext};base64,${Buffer.from(buffer).toString("base64")}`;
        } catch (err) {
          console.error("[UPI] QR fetch error:", err);
          return interaction.reply({
            embeds: [errorEmbed("Could not read the QR code image. Please try again.")],
            ephemeral: true,
          });
        }
      }

      db.setUpi(targetUser.id, interaction.guildId, upiId, qrDataUri);

      const embed = new EmbedBuilder()
        .setColor(C.success)
        .setTitle("💳  UPI details saved")
        .setDescription(`Payment details for ${targetUser} have been saved.`)
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
        .addFields(
          { name: "👤  User",    value: `${targetUser}`,  inline: true },
          { name: "💳  UPI ID",  value: `\`${upiId}\``,   inline: true }
        )
        .setFooter({ text: footerQuip() })
        .setTimestamp();

      const files = [];
      if (qrDataUri) {
        const matches = qrDataUri.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
        if (matches) {
          const file = new AttachmentBuilder(Buffer.from(matches[2], "base64"), {
            name: `qr_${targetUser.id}_${interaction.guildId}.${matches[1]}`,
          });
          embed.setImage(`attachment://${file.name}`);
          files.push(file);
        }
      }

      return interaction.reply({ embeds: [embed], files });
    }

    // ── GET ───────────────────────────────────────────────────────────────────
    if (sub === "get") {
      const targetUser = interaction.options.getUser("user") || interaction.user;
      const record     = db.getUpi(targetUser.id, interaction.guildId);

      if (!record) {
        return interaction.reply({
          embeds: [errorEmbed(`No UPI details found for **${targetUser.username}**.\nAn admin can add them with \`/upi set\`.`)],
          ephemeral: true,
        });
      }

      const embed = new EmbedBuilder()
        .setColor(C.primary)
        .setTitle(`💳  ${targetUser.username}'s payment details`)
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
        .addFields(
          { name: "👤  User",    value: `${targetUser}`,                                      inline: true },
          { name: "💳  UPI ID",  value: `\`${record.upiId}\``,                                inline: true },
          { name: "🗓️  Saved",   value: `<t:${Math.floor(record.savedAt / 1000)}:R>`,         inline: true }
        )
        .setFooter({ text: `Copy the UPI ID above to pay  ·  ${footerQuip()}` })
        .setTimestamp();

      const files = [];
      if (record.qrUrl) {
        if (record.qrUrl.startsWith("data:image")) {
          const matches = record.qrUrl.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
          if (matches) {
            const fname = `qr_${record.userId}_${interaction.guildId}.${matches[1]}`;
            const file  = new AttachmentBuilder(Buffer.from(matches[2], "base64"), { name: fname });
            embed.setImage(`attachment://${fname}`);
            embed.addFields({ name: "🖼️  QR code", value: "Scan to pay", inline: false });
            files.push(file);
          }
        } else if (record.qrUrl.startsWith("http")) {
          embed.setImage(record.qrUrl);
          embed.addFields({ name: "🖼️  QR code", value: "Scan to pay", inline: false });
        } else {
          const qrPath = path.join(__dirname, "../../assets/qr", record.qrUrl);
          if (fs.existsSync(qrPath)) {
            const file = new AttachmentBuilder(qrPath, { name: record.qrUrl });
            embed.setImage(`attachment://${record.qrUrl}`);
            embed.addFields({ name: "🖼️  QR code", value: "Scan to pay", inline: false });
            files.push(file);
          }
        }
      } else {
        embed.addFields({ name: "🖼️  QR code", value: "*Not saved yet.*", inline: false });
      }

      return interaction.reply({ embeds: [embed], files });
    }

    // ── DELETE ────────────────────────────────────────────────────────────────
    if (sub === "delete") {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({
          embeds: [errorEmbed("Only admins can delete UPI details.")],
          ephemeral: true,
        });
      }

      const targetUser = interaction.options.getUser("user");
      const existing   = db.getUpi(targetUser.id, interaction.guildId);

      if (!existing) {
        return interaction.reply({
          embeds: [errorEmbed(`No UPI details found for **${targetUser.username}**.`)],
          ephemeral: true,
        });
      }

      db.deleteUpi(targetUser.id, interaction.guildId);
      return interaction.reply({
        embeds: [successEmbed("Deleted", `UPI details for **${targetUser.username}** have been removed.`)],
        ephemeral: true,
      });
    }

    // ── LIST ──────────────────────────────────────────────────────────────────
    if (sub === "list") {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({
          embeds: [errorEmbed("Only admins can view all UPI records.")],
          ephemeral: true,
        });
      }

      const records = db.getAllUpi(interaction.guildId);
      if (!records.length) {
        return interaction.reply({
          embeds: [errorEmbed("No UPI records saved on this server yet.")],
          ephemeral: true,
        });
      }

      const lines = records
        .map((r) => `<@${r.userId}>  ·  \`${r.upiId}\` ${r.qrUrl ? "🖼️" : ""}`)
        .join("\n");

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(C.primary)
            .setTitle("💳  UPI records")
            .setDescription(`${lines}\n\n*${divider()}*`)
            .setFooter({ text: `${records.length} record(s)  ·  ${footerQuip()}` })
            .setTimestamp(),
        ],
        ephemeral: true,
      });
    }
  },
};
