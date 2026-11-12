/**
 * utils/ticketLogic.js
 * All ticket creation, closing, and management logic.
 */
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  UserSelectMenuBuilder,
} = require("discord.js");
const transcript = require("discord-html-transcripts");
const db         = require("./database");
const { ticketWelcomeEmbed, C, divider, footerQuip, errorEmbed, successEmbed } = require("./embeds");

function safeArray(val) {
  if (Array.isArray(val)) return val;
  if (typeof val === "string") {
    try {
      const p = JSON.parse(val);
      return Array.isArray(p) ? p : [];
    } catch { return []; }
  }
  return [];
}

// ── Create ticket ─────────────────────────────────────────────────────────────

async function createTicket(interaction, category, answers) {
  if (!interaction.deferred) await interaction.deferReply({ ephemeral: true });

  if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)) {
    return interaction.editReply({
      content: "I need the **Manage Channels** permission to create tickets. Please fix my role permissions.",
    });
  }

  const count      = db.incrementTicketCount(interaction.guildId);
  const padded     = count.toString().padStart(4, "0");
  const staffRoles = safeArray(category?.roles);

  let channel;
  try {
    channel = await interaction.guild.channels.create({
      name: `ticket-${padded}`,
      type: ChannelType.GuildText,
      parent: category.categoryId,
      permissionOverwrites: [
        { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        {
          id: interaction.user.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles],
        },
        ...staffRoles.map((roleId) => ({
          id: roleId,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles],
        })),
      ],
    });
  } catch (err) {
    const msg =
      err.code === 50035
        ? "Invalid channel category. Please update the ticket category in settings."
        : `Could not create the ticket channel: ${err.message}`;
    return interaction.editReply({ content: msg });
  }

  db.createTicket({
    channelId:  channel.id,
    guildId:    interaction.guildId,
    userId:     interaction.user.id,
    categoryId: category.id,
    createdAt:  Date.now(),
    answers,
  });

  const embed = ticketWelcomeEmbed(interaction.user, padded, category, answers);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ticket_claim").setLabel("Claim").setEmoji("✋").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("ticket_manage_users").setLabel("Manage users").setEmoji("👥").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("ticket_close_prompt").setLabel("Close ticket").setEmoji("🔒").setStyle(ButtonStyle.Danger)
  );

  const roleMention = staffRoles[0] ? `<@&${staffRoles[0]}>` : "";
  await channel.send({
    content: `${interaction.user} ${roleMention}`.trim(),
    embeds:  [embed],
    components: [row],
  });

  await interaction.editReply({
    content: `✅ Your ticket is open! Head to ${channel}.`,
  });
}

// ── Claim ticket ──────────────────────────────────────────────────────────────

async function claimTicket(interaction) {
  const ticket = db.getTicket(interaction.channelId);
  if (!ticket) {
    return interaction.reply({ content: "This channel isn't a ticket.", ephemeral: true });
  }
  if (ticket.claimantId) {
    return interaction.reply({
      content: `This ticket was already claimed by <@${ticket.claimantId}>.`,
      ephemeral: true,
    });
  }

  db.updateTicket(interaction.channelId, { claimantId: interaction.user.id });

  const oldRow = interaction.message.components[0];
  const newRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder(oldRow.components[0].data)
      .setLabel(`Claimed by ${interaction.user.username}`)
      .setDisabled(true),
    new ButtonBuilder(oldRow.components[1].data),
    new ButtonBuilder(oldRow.components[2].data)
  );

  await interaction.update({ components: [newRow] });
  await interaction.followUp({
    content: `✋ Claimed by ${interaction.user}!`,
    allowedMentions: { parse: [] },
  });
}

// ── Close prompt ──────────────────────────────────────────────────────────────

async function closePrompt(interaction) {
  const embed = new EmbedBuilder()
    .setColor(C.warning)
    .setTitle("🔒  Close this ticket?")
    .setDescription(
      "Are you sure? A chat transcript will be saved and the channel will be deleted.\n\n" +
      "*This can't be undone.*"
    )
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("ticket_close_confirm").setLabel("Yes, close it").setEmoji("🔒").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("ticket_close_cancel").setLabel("Cancel").setStyle(ButtonStyle.Secondary)
  );

  await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}

// ── Close ticket ──────────────────────────────────────────────────────────────

async function closeTicket(interaction) {
  const ticket = db.getTicket(interaction.channelId);
  if (!ticket) {
    return interaction.reply({ embeds: [errorEmbed("This channel isn't an active ticket.")], ephemeral: true });
  }

  const config = db.getGuildConfig(interaction.guildId);

  const closingEmbed = new EmbedBuilder()
    .setColor(C.primary)
    .setTitle("⏳  Closing ticket…")
    .setDescription("Saving the transcript and closing the channel. One moment…")
    .setFooter({ text: footerQuip() })
    .setTimestamp();

  const isReply = interaction.replied || interaction.deferred;
  const replyFn = isReply ? "followUp" : "reply";
  await interaction[replyFn]({ embeds: [closingEmbed] }).catch(() => {});

  let file;
  try {
    file = await transcript.createTranscript(interaction.channel, {
      limit:    -1,
      fileName: `transcript-${interaction.channel.name}.html`,
    });
  } catch (err) {
    console.error("[Ticket] Transcript error:", err.message);
  }

  db.updateTicket(interaction.channelId, { status: "closed", closedAt: Date.now() });

  const payload = { content: `📄 Transcript for **${interaction.channel.name}** — closed by ${interaction.user}.` };
  if (file) payload.files = [file];

  if (config.logChannelId) {
    const logCh = interaction.guild.channels.cache.get(config.logChannelId);
    if (logCh) await logCh.send(payload).catch(() => {});
  }

  if (config.transcriptChannelId) {
    const tCh = interaction.guild.channels.cache.get(config.transcriptChannelId);
    if (tCh) await tCh.send(payload).catch(() => {});
  }

  try {
    const opener = await interaction.client.users.fetch(ticket.userId);
    await opener.send({
      content: `Your ticket **${interaction.channel.name}** was closed. Here's your transcript:`,
      ...(file ? { files: [file] } : {}),
    });
  } catch { /* DMs closed */ }

  await interaction.channel.delete().catch(() => {});
}

// ── Manage users ──────────────────────────────────────────────────────────────

async function manageUsers(interaction) {
  const config  = db.getGuildConfig(interaction.guildId);
  const isAdmin =
    interaction.member.permissions.has(PermissionFlagsBits.Administrator) ||
    (config.adminRoleId && interaction.member.roles.cache.has(config.adminRoleId));

  if (!isAdmin) {
    return interaction.reply({ content: "Only admins can manage ticket users.", ephemeral: true });
  }

  const select = new UserSelectMenuBuilder()
    .setCustomId("ticket_user_select")
    .setPlaceholder("Pick members to add or remove…")
    .setMinValues(0)
    .setMaxValues(10);

  const embed = new EmbedBuilder()
    .setColor(C.primary)
    .setTitle("👥  Manage ticket access")
    .setDescription(
      "Select members to **add** them to this ticket.\n" +
      "Deselecting a member will **remove** their access.\n\n" +
      `*${divider()}*`
    )
    .setFooter({ text: "Changes take effect right away." })
    .setTimestamp();

  await interaction.reply({
    embeds:     [embed],
    components: [new ActionRowBuilder().addComponents(select)],
    ephemeral:  true,
  });
}

// ── Handle user select ────────────────────────────────────────────────────────

async function handleUserUpdate(interaction) {
  const config  = db.getGuildConfig(interaction.guildId);
  const isAdmin =
    interaction.member.permissions.has(PermissionFlagsBits.Administrator) ||
    (config.adminRoleId && interaction.member.roles.cache.has(config.adminRoleId));

  if (!isAdmin) {
    return interaction.reply({ content: "Only admins can manage ticket users.", ephemeral: true });
  }

  const ticket = db.getTicket(interaction.channelId);
  if (!ticket) {
    return interaction.update({ embeds: [errorEmbed("Could not find the ticket record.")], components: [] });
  }

  const category     = db.getCategory(ticket.categoryId);
  const staffRoles   = safeArray(category?.roles);
  const selectedUsers = interaction.values;

  await interaction.deferUpdate();

  const overwrites = [
    { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: ticket.userId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles],
    },
    ...staffRoles.map((roleId) => ({
      id: roleId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles],
    })),
    ...selectedUsers.map((userId) => ({
      id: userId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles],
    })),
  ];

  await interaction.channel.permissionOverwrites.set(overwrites);

  await interaction.followUp({
    embeds:    [successEmbed("Access updated", `Updated access for **${selectedUsers.length}** member(s).`)],
    ephemeral: true,
  });
}

module.exports = { createTicket, claimTicket, closePrompt, closeTicket, manageUsers, handleUserUpdate };
