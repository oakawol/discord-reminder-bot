/**
 * deploy-commands.js
 * Registers all slash commands with Discord.
 * Run: node deploy-commands.js
 */
require("dotenv").config();
const { REST, Routes, PermissionFlagsBits } = require("discord.js");

const commands = [

  // ── Reminders & Cooldowns ──────────────────────────────────────────────────
  {
    name: "remind",
    description: "Set a reminder for yourself or someone else.",
    options: [
      { name: "time",    description: "When to remind you (e.g. 10m, 2h, 1d)",       type: 3, required: true  },
      { name: "message", description: "What to remind about",                          type: 3, required: true  },
      { name: "channel", description: "Where to send the reminder (default: here)",   type: 7, required: false },
      { name: "user",    description: "Who to remind (default: you)",                  type: 6, required: false },
    ],
  },
  {
    name: "cd",
    description: "Put a user on cooldown so they can't be assigned tasks for a while.",
    options: [
      { name: "user", description: "The user to put on cooldown",                     type: 6, required: true  },
      { name: "time", description: "How long (e.g. 12h, 1d). Default is 24h",         type: 3, required: false },
    ],
  },
  {
    name: "remove_cd",
    description: "Remove a cooldown from a user early.",
    default_member_permissions: PermissionFlagsBits.Administrator.toString(),
    options: [
      { name: "user", description: "The user to remove the cooldown from",            type: 6, required: true },
    ],
  },
  {
    name: "taskping",
    description: "Assign a task to a user and ping them every 30 min until they reply.",
    default_member_permissions: PermissionFlagsBits.Administrator.toString(),
    options: [
      { name: "user", description: "The user to assign the task to",                  type: 6, required: true },
      { name: "task", description: "What the task is",                                type: 3, required: true },
    ],
  },

  // ── Economy ────────────────────────────────────────────────────────────────
  {
    name: "balance",
    description: "Check your coins, rank, and recent transactions.",
    options: [
      { name: "user", description: "The user to check (default: you)",                type: 6, required: false },
    ],
  },
  {
    name: "add_money",
    description: "Add coins to a user's balance.",
    default_member_permissions: PermissionFlagsBits.Administrator.toString(),
    options: [
      { name: "user",   description: "The user to give coins to",                     type: 6,  required: true  },
      { name: "amount", description: "How much to add",                               type: 10, required: true  },
      { name: "reason", description: "Why you're adding coins",                       type: 3,  required: false },
    ],
  },
  {
    name: "remove_money",
    description: "Remove coins from a user's balance.",
    default_member_permissions: PermissionFlagsBits.Administrator.toString(),
    options: [
      { name: "user",   description: "The user to remove coins from",                 type: 6,  required: true  },
      { name: "amount", description: "How much to remove",                            type: 10, required: true  },
      { name: "reason", description: "Why you're removing coins",                     type: 3,  required: false },
    ],
  },
  {
    name: "history",
    description: "See recent coin transactions for yourself or someone else.",
    options: [
      { name: "user", description: "The user to check (default: you)",                type: 6, required: false },
    ],
  },

  // ── Admin Utilities ────────────────────────────────────────────────────────
  {
    name: "verify",
    description: "Check if a link in this channel is working.",
    default_member_permissions: PermissionFlagsBits.Administrator.toString(),
    options: [
      { name: "link", description: "Message ID or link to check (default: finds a recent one)", type: 3, required: false },
    ],
  },
  {
    name: "text",
    description: "Post a message in this channel through the bot.",
    default_member_permissions: PermissionFlagsBits.Administrator.toString(),
    options: [
      { name: "message", description: "What to say",                                  type: 3, required: true },
    ],
  },
  {
    name: "memory",
    description: "Save or send messages from the bot's memory slots.",
    default_member_permissions: PermissionFlagsBits.Administrator.toString(),
    options: [
      {
        name: "set", description: "Save a message to a slot", type: 1,
        options: [
          { name: "slot",    description: "Slot number (1–4)", type: 4, required: true, choices: [1,2,3,4].map((n) => ({ name: `Slot ${n}`, value: n })) },
          { name: "message", description: "The message to save", type: 3, required: true },
        ],
      },
      {
        name: "get", description: "Post a saved message from a slot", type: 1,
        options: [
          { name: "slot", description: "Slot number (1–4)", type: 4, required: true, choices: [1,2,3,4].map((n) => ({ name: `Slot ${n}`, value: n })) },
        ],
      },
      { name: "list", description: "See all saved memory slots", type: 1 },
    ],
  },

  // ── Fun ────────────────────────────────────────────────────────────────────
  {
    name: "imagine",
    description: "Generate an AI image from a text description.",
    options: [
      { name: "prompt", description: "What do you want to create?",                   type: 3, required: true },
    ],
  },
  {
    name: "profile",
    description: "View or clear what the bot remembers about you.",
    options: [
      { name: "view", description: "View your memory profile", type: 1 },
      { name: "wipe", description: "Wipe all your saved facts and memory", type: 1 },
    ],
  },
  {
    name: "forgetme",
    description: "Wipe all your saved facts, preferred name, and chat history.",
  },

  // ── Context Menus ──────────────────────────────────────────────────────────
  {
    name: "Verify Link",
    type: 3,
    default_member_permissions: PermissionFlagsBits.Administrator.toString(),
  },

  // ── Ticket System ──────────────────────────────────────────────────────────
  {
    name: "setup",
    description: "Set up the ticket system for this server.",
    default_member_permissions: PermissionFlagsBits.Administrator.toString(),
    options: [
      { name: "admin_role",         description: "Role that manages tickets",         type: 8, required: true },
      { name: "log_channel",        description: "Channel for ticket logs",           type: 7, required: true },
      { name: "transcript_channel", description: "Channel for chat transcripts",      type: 7, required: true },
    ],
  },
  {
    name: "panel",
    description: "Post a ticket panel in a channel.",
    default_member_permissions: PermissionFlagsBits.Administrator.toString(),
    options: [
      {
        name: "create", description: "Post a ticket panel", type: 1,
        options: [
          { name: "title",       description: "Panel title",                          type: 3, required: true  },
          { name: "description", description: "Short description shown on the panel", type: 3, required: true  },
          { name: "channel",     description: "Where to post the panel (default: here)", type: 7, required: false },
        ],
      },
    ],
  },
  {
    name: "category",
    description: "Create, list, or delete ticket categories.",
    default_member_permissions: PermissionFlagsBits.Administrator.toString(),
    options: [
      {
        name: "create", description: "Create a new ticket category", type: 1,
        options: [
          { name: "name",         description: "Category name",                       type: 3, required: true },
          { name: "emoji",        description: "Emoji for the button",                type: 3, required: true },
          { name: "category",     description: "Discord channel category to use",     type: 7, required: true },
          { name: "support_role", description: "Staff role that handles these tickets", type: 8, required: true },
        ],
      },
      { name: "list",   description: "See all ticket categories", type: 1 },
      {
        name: "delete", description: "Delete a ticket category", type: 1,
        options: [
          { name: "id", description: "Category ID (from /category list)", type: 3, required: true, autocomplete: true },
        ],
      },
    ],
  },
  {
    name: "close",
    description: "Close the current ticket.",
    options: [
      { name: "reason", description: "Why you're closing this ticket",                type: 3, required: false },
    ],
  },

  // ── UPI Payments ───────────────────────────────────────────────────────────
  {
    name: "upi",
    description: "Save or look up a user's UPI ID and QR code.",
    options: [
      {
        name: "set", description: "Save a user's UPI ID (and optional QR code)", type: 1,
        options: [
          { name: "user",    description: "The user to save details for",              type: 6,  required: true  },
          { name: "upi_id",  description: "Their UPI ID (e.g. name@upi)",             type: 3,  required: true  },
          { name: "qr_code", description: "QR code image to upload",                  type: 11, required: false },
        ],
      },
      {
        name: "get", description: "Look up a user's saved UPI details", type: 1,
        options: [
          { name: "user", description: "The user to check (default: you)",             type: 6, required: false },
        ],
      },
      {
        name: "delete", description: "Delete a user's saved UPI details", type: 1,
        options: [
          { name: "user", description: "The user whose details to delete",             type: 6, required: true },
        ],
      },
      { name: "list", description: "See all saved UPI records on this server", type: 1 },
    ],
  },
];

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    if (process.env.GUILD_ID) {
      console.log(`[Deploy] Deploying ${commands.length} commands to guild ${process.env.GUILD_ID}…`);
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
        { body: commands }
      );
      console.log("[Deploy] Done! Commands available instantly.");
    } else {
      console.log(`[Deploy] Deploying ${commands.length} commands globally (up to 1 hour)…`);
      await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
      console.log("[Deploy] Done!");
    }
  } catch (error) {
    console.error("[Deploy] Failed:", error);
  }
})();
