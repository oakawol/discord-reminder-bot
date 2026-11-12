/**
 * utils/embeds.js
 * Premium dark-futuristic design system.
 * Neon purple + electric blue palette. Simple English throughout.
 */
const { EmbedBuilder, AttachmentBuilder } = require("discord.js");
const path = require("path");

// ── Design System ─────────────────────────────────────────────────────────────
const C = {
  // Brand
  primary:  0x7C3AED,  // Neon purple
  accent:   0x2563EB,  // Electric blue
  // States
  success:  0x10B981,  // Emerald green
  danger:   0xEF4444,  // Red
  warning:  0xF59E0B,  // Amber
  info:     0x38BDF8,  // Sky blue
  // Neutrals
  muted:    0x374151,  // Dark grey
};

// Keep old COLORS export so upi.js and other files that import COLORS still work
const COLORS = {
  ...C,
  gold:      C.primary,
  champagne: C.accent,
  obsidian:  C.muted,
  platinum:  C.success,
  bronze:    C.warning,
  emerald:   C.success,
  ruby:      C.danger,
  sapphire:  C.accent,
  amethyst:  C.primary,
  mint:      C.success,
  sky:       C.info,
  peach:     C.warning,
  lilac:     C.primary,
  pink:      0xEC4899,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function asset(name) {
  return new AttachmentBuilder(path.join(__dirname, `../assets/${name}`));
}

/** Thin bar used as a visual section break */
function divider() {
  return "┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄";
}

const FOOTER_LINES = [
  "Oakawol Bot  •  reminders · economy · support",
  "/remind to set a reminder  —  /balance for coins",
  "Oakawol Bot  •  fast and easy to use",
  "Need help? Ask a staff member.",
  "Have a good one!",
];

function footerQuip() {
  return FOOTER_LINES[Math.floor(Math.random() * FOOTER_LINES.length)];
}

/** Base embed — shared defaults */
function base(color = C.primary) {
  return new EmbedBuilder()
    .setColor(color)
    .setTimestamp()
    .setFooter({ text: footerQuip() });
}

// ── Error Embed ───────────────────────────────────────────────────────────────

function errorEmbed(content) {
  return new EmbedBuilder()
    .setColor(C.danger)
    .setTitle("Something went wrong")
    .setDescription(`${content}`)
    .setFooter({ text: "Oakawol Bot" })
    .setTimestamp();
}

// ── Success Embed (generic) ───────────────────────────────────────────────────

function successEmbed(title, content) {
  return new EmbedBuilder()
    .setColor(C.success)
    .setTitle(`✓  ${title}`)
    .setDescription(content || "")
    .setFooter({ text: footerQuip() })
    .setTimestamp();
}

// ── Tier Helper ───────────────────────────────────────────────────────────────

function getTier(balance) {
  if (balance >= 100000) return { icon: "👑", name: "Diamond" };
  if (balance >= 50000)  return { icon: "💎", name: "Platinum" };
  if (balance >= 10000)  return { icon: "🏛️", name: "Gold"     };
  if (balance >= 1000)   return { icon: "⚡", name: "Silver"   };
  return                        { icon: "🌱", name: "Bronze"   };
}

// ── Reminder Embeds ──────────────────────────────────────────────────────────

function reminderSetEmbed(targetUser, message, timeStr, targetChannel) {
  return {
    file: asset("reminder.png"),
    embed: base(C.primary)
      .setTitle("⏰  Reminder set")
      .setThumbnail("attachment://reminder.png")
      .setDescription(
        `Got it. I'll remind **${targetUser.username}** in **${timeStr}**.\n\n` +
        `\`\`\`${message}\`\`\``
      )
      .addFields(
        { name: "⏱️ In",       value: `\`${timeStr}\``,    inline: true },
        { name: "📍 Channel",  value: `${targetChannel}`,  inline: true }
      ),
  };
}

function reminderFiredEmbed(message, initiatorTag) {
  return {
    file: asset("reminder.png"),
    embed: new EmbedBuilder()
      .setColor(C.accent)
      .setTitle("⏰  Time's up — here's your reminder")
      .setThumbnail("attachment://reminder.png")
      .setDescription(`> **${message}**`)
      .setFooter({ text: `Set by ${initiatorTag}` })
      .setTimestamp(),
  };
}

// ── Cooldown Embeds ──────────────────────────────────────────────────────────

function cooldownSetEmbed(targetUser, timeStr, endTime, initiator) {
  const unix = Math.floor(endTime / 1000);
  return {
    file: asset("cooldown.png"),
    embed: base(C.primary)
      .setTitle("⏸️  Cooldown started")
      .setThumbnail("attachment://cooldown.png")
      .setDescription(
        `**${targetUser.username}** is now on cooldown and can't be assigned tasks until it ends.`
      )
      .addFields(
        { name: "⏳ Length",   value: `\`${timeStr}\``,        inline: true },
        { name: "🕐 Ends",     value: `<t:${unix}:T>`,         inline: true },
        { name: "⌛ In",       value: `<t:${unix}:R>`,         inline: true },
        { name: "👤 Set by",   value: `${initiator}`,          inline: true }
      ),
  };
}

function cooldownExpiredEmbed(mention) {
  return {
    file: asset("cooldown.png"),
    embed: base(C.success)
      .setTitle("✅  Cooldown finished")
      .setThumbnail("attachment://cooldown.png")
      .setDescription(
        `${mention}, your cooldown is over.\nYou're ready to take tasks again.`
      ),
  };
}

function cooldownRemovedEmbed(targetUser) {
  return {
    file: asset("cooldown.png"),
    embed: base(C.success)
      .setTitle("🔓  Cooldown removed")
      .setThumbnail("attachment://cooldown.png")
      .setDescription(
        `The cooldown for **${targetUser}** was removed by an admin.`
      ),
  };
}

// ── Economy Embeds ───────────────────────────────────────────────────────────

function formatTransactionHistory(transactions) {
  if (!transactions || transactions.length === 0) {
    return "*No recent transactions.*";
  }

  return transactions
    .map((tx) => {
      const isAdd     = tx.type === "ADD";
      const dot       = isAdd ? "🟢" : "🔴";
      const sign      = isAdd ? "+" : "−";
      const unix      = Math.floor(tx.timestamp / 1000);
      const reason    = tx.reason    ? ` · *${tx.reason}*`       : "";
      const executor  = tx.executorId ? ` by <@${tx.executorId}>` : "";
      return `${dot} **${sign}₹${tx.amount.toLocaleString()}** <t:${unix}:R>${reason}${executor}\n└ Balance: **₹${tx.newBalance.toLocaleString()}**`;
    })
    .join("\n");
}

function balanceEmbed(client, targetUser, balance, rank, leaderboardStr, totalEconomy, transactions = []) {
  const tier    = getTier(balance);
  const history = formatTransactionHistory(transactions);

  return {
    file: asset("balance.png"),
    embed: new EmbedBuilder()
      .setColor(C.primary)
      .setAuthor({
        name: `${targetUser.username}  ·  Balance`,
        iconURL: targetUser.displayAvatarURL({ dynamic: true }),
      })
      .setThumbnail("attachment://balance.png")
      .setDescription(
        `### 🏆  Top balances\n` +
        (leaderboardStr || "*No data yet.*") +
        `\n\n*${divider()}*`
      )
      .addFields(
        { name: "💰  Balance",       value: `\`\`\`₹${balance.toLocaleString()}\`\`\``,  inline: true },
        { name: "📈  Rank",          value: `\`\`\`#${rank}\`\`\``,                       inline: true },
        { name: "🏅  Tier",          value: `\`${tier.icon} ${tier.name}\``,               inline: true },
        { name: "📋  Recent moves",  value: history,                                       inline: false }
      )
      .setFooter({ text: `Server total: ₹${totalEconomy.toLocaleString()}  ·  ${footerQuip()}` })
      .setTimestamp(),
  };
}

function addMoneyEmbed(targetUser, amount, oldBalance, newBalance, transactions = []) {
  const tier    = getTier(newBalance);
  const oldTier = getTier(oldBalance);
  const tierUp  = oldTier.name !== tier.name;
  const history = formatTransactionHistory(transactions);

  return {
    file: asset("money.png"),
    embed: base(C.success)
      .setTitle("💰  Money added")
      .setThumbnail("attachment://money.png")
      .setDescription(
        `Added **₹${amount.toLocaleString()}** to ${targetUser}'s balance.` +
        (tierUp ? `\n\n🎉 Rank up — now **${tier.name}** tier!` : "")
      )
      .addFields(
        { name: "💳  New balance",  value: `\`₹${oldBalance.toLocaleString()}\` → **₹${newBalance.toLocaleString()}**`,  inline: true },
        { name: "🏅  Tier",         value: `${tier.icon} ${tier.name}`,                                                   inline: true },
        { name: "📋  Recent moves", value: history,                                                                        inline: false }
      ),
  };
}

function removeMoneyEmbed(targetUser, amount, oldBalance, newBalance, transactions = []) {
  const tier    = getTier(newBalance);
  const oldTier = getTier(oldBalance);
  const tierDn  = oldTier.name !== tier.name;
  const history = formatTransactionHistory(transactions);

  return {
    file: asset("money.png"),
    embed: base(C.warning)
      .setTitle("💸  Money removed")
      .setThumbnail("attachment://money.png")
      .setDescription(
        `Removed **₹${amount.toLocaleString()}** from ${targetUser}'s balance.` +
        (tierDn ? `\n\nDropped from **${oldTier.name}** to **${tier.name}** tier.` : "")
      )
      .addFields(
        { name: "💳  New balance",  value: `\`₹${oldBalance.toLocaleString()}\` → **₹${newBalance.toLocaleString()}**`,  inline: true },
        { name: "🏅  Tier",         value: `${tier.icon} ${tier.name}`,                                                   inline: true },
        { name: "📋  Recent moves", value: history,                                                                        inline: false }
      ),
  };
}

function historyEmbed(targetUser, balance, transactions = []) {
  const tier    = getTier(balance);
  const history = formatTransactionHistory(transactions);

  return {
    file: asset("money.png"),
    embed: base(C.primary)
      .setAuthor({
        name: `${targetUser.username}  ·  Transaction history`,
        iconURL: targetUser.displayAvatarURL({ dynamic: true }),
      })
      .setThumbnail("attachment://money.png")
      .setDescription(
        `Balance: **₹${balance.toLocaleString()}** · ${tier.icon} ${tier.name}\n\n*${divider()}*`
      )
      .addFields({ name: "📋  All recent moves", value: history, inline: false }),
  };
}

// ── Memory Embeds ─────────────────────────────────────────────────────────────

function memoryListEmbed(slots) {
  const nums = ["1️⃣", "2️⃣", "3️⃣", "4️⃣"];
  const lines = [1, 2, 3, 4]
    .map((slot, i) => {
      const msg     = slots[slot];
      const preview = msg
        ? (msg.length > 60 ? msg.slice(0, 57) + "…" : msg)
        : "*empty*";
      const size    = msg ? `\`${msg.length} chars\`` : "`0`";
      return `${nums[i]}  **Slot ${slot}:** ${preview} — ${size}`;
    })
    .join("\n\n");

  return new EmbedBuilder()
    .setColor(C.primary)
    .setTitle("💾  Saved memory slots")
    .setDescription(lines + `\n\n*${divider()}*`)
    .setFooter({ text: footerQuip() })
    .setTimestamp();
}

// ── Ticket Embeds ─────────────────────────────────────────────────────────────

function ticketWelcomeEmbed(user, count, category, answers) {
  const embed = new EmbedBuilder()
    .setColor(C.primary)
    .setTitle(`🎫  Support ticket #${count}`)
    .setDescription(
      `Hey ${user}! A staff member will be with you soon.\nTell us what you need help with below.\n\n*${divider()}*`
    )
    .setThumbnail(user.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: "📁  Category",   value: `${category.emoji} ${category.name}`, inline: true },
      { name: "👤  Opened by",  value: `${user}`,                            inline: true }
    )
    .setFooter({ text: "Oakawol Bot  ·  Ticket support" })
    .setTimestamp();

  const keys = Object.keys(answers || {});
  if (keys.length > 0) {
    embed.addFields({ name: "\u200B", value: `*${divider()}*\n📋 **Your answers:**` });
    embed.addFields(keys.map((k) => ({ name: k, value: `> ${answers[k]}`, inline: false })));
  }
  return embed;
}

function categoryListEmbed(categories) {
  const rows = categories
    .map((c) => `${c.emoji}  **${c.name}**  \`${c.id}\``)
    .join("\n");

  return new EmbedBuilder()
    .setColor(C.primary)
    .setTitle("📁  Ticket categories")
    .setDescription(
      (rows || "*No categories yet.*") + `\n\n*${divider()}*`
    )
    .setFooter({ text: footerQuip() })
    .setTimestamp();
}

// ── Task Ping Embeds ──────────────────────────────────────────────────────────

function taskAssignedEmbed(targetUser, task) {
  return new EmbedBuilder()
    .setColor(C.accent)
    .setTitle("📌  Task assigned")
    .setDescription(
      `${targetUser} has been given a task.\nThe bot will ping them here every **30 minutes** until they reply.`
    )
    .addFields(
      { name: "📋  Task",      value: `> ${task}`,       inline: false },
      { name: "🔁  Interval",  value: "Every 30 minutes", inline: true  }
    )
    .setFooter({ text: footerQuip() })
    .setTimestamp();
}

function taskPingEmbed(targetUser, task, initiatorId) {
  const admin = initiatorId ? `<@${initiatorId}>` : "an admin";
  return new EmbedBuilder()
    .setColor(C.warning)
    .setTitle("🔔  You have a task")
    .setDescription(
      `${targetUser ? targetUser : "Hey"} — ${admin} needs you to do something.\n\n` +
      `📋 **Task:**\n> ${task}\n\n` +
      `Reply in this channel once done and the pings will stop.`
    )
    .setFooter({ text: "Pings every 30 min · reply here to stop" })
    .setTimestamp();
}

function taskCompletedEmbed(targetUser, tasks) {
  const count    = tasks.length;
  const taskList = tasks.map((t, i) => `**${i + 1}.** ${t.task}`).join("\n");
  return new EmbedBuilder()
    .setColor(C.success)
    .setTitle("✅  Task pings stopped")
    .setDescription(
      `${targetUser} replied — pings have been turned off.\n\n` +
      (count > 1
        ? `**${count} tasks resolved:**\n${taskList}`
        : `**Task:**\n> ${tasks[0].task}`)
    )
    .setFooter({ text: footerQuip() })
    .setTimestamp();
}

module.exports = {
  // Design system exports
  COLORS,
  C,
  asset,
  divider,
  footerQuip,
  base,
  // Generic
  errorEmbed,
  successEmbed,
  getTier,
  // Reminders
  reminderSetEmbed,
  reminderFiredEmbed,
  // Cooldowns
  cooldownSetEmbed,
  cooldownExpiredEmbed,
  cooldownRemovedEmbed,
  // Economy
  balanceEmbed,
  addMoneyEmbed,
  removeMoneyEmbed,
  historyEmbed,
  formatTransactionHistory,
  // Memory
  memoryListEmbed,
  // Tickets
  ticketWelcomeEmbed,
  categoryListEmbed,
  // Tasks
  taskAssignedEmbed,
  taskPingEmbed,
  taskCompletedEmbed,
};
