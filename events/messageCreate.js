/**
 * events/messageCreate.js
 * Handles link detection inside ticket channels and AI chat.
 * Primary engine: Groq  |  Fallback: Multi-model (Cerebras, OpenRouter, Pollinations)
 */
const { PermissionFlagsBits, PermissionsBitField, EmbedBuilder } = require("discord.js");
const db = require("../utils/database");
const { REDDIT_REGEX, LOADING_EMOJI, CHECK_EMOJI } = require("../commands/admin/verify");
const { aiToolDefinitions, executeTool } = require("../utils/aiTools");
const { cancelTaskPingTimeout } = require("../utils/timerManager");
const { taskCompletedEmbed } = require("../utils/embeds");

const URL_REGEX = /https?:\/\/[^\s]+/;

async function verifyLinkStatus(url) {
  try {
    // Check for Discord Invite links
    const inviteMatch = url.match(/(?:https?:\/\/)?(?:[a-zA-Z0-9\-]+\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/([a-zA-Z0-9\-]+)/i);
    if (inviteMatch) {
      const inviteCode = inviteMatch[1];
      const inviteRes = await fetch(`https://discord.com/api/v10/invites/${inviteCode}?with_counts=true`).catch(() => null);
      if (!inviteRes || !inviteRes.ok) {
        return { working: false, reason: 'Invalid or expired Discord invite.' };
      }
      return { working: true, isInvite: true };
    }

    // Check for YouTube links
    const youtubeMatch = url.match(/(?:https?:\/\/)?(?:[a-zA-Z0-9\-]+\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9\-_]+)/i);
    if (youtubeMatch) {
      const videoId = youtubeMatch[1];
      const oembedRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`).catch(() => null);
      if (!oembedRes || !oembedRes.ok) {
        return { working: false, reason: 'Video not found or private.' };
      }
      return { working: true, isYouTube: true };
    }

    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      }
    });
    
    if (!response.ok) {
      return { working: false, reason: `HTTP status ${response.status}` };
    }
    
    const finalUrl = response.url;
    
    const isReddit = /reddit\.com|redd\.it/i.test(finalUrl);
    if (!isReddit) {
      return { working: true, isReddit: false };
    }
    
    const urlObj = new URL(finalUrl);
    urlObj.search = '';
    let jsonUrl = urlObj.toString();
    if (!jsonUrl.endsWith('.json')) {
      if (jsonUrl.endsWith('/')) {
        jsonUrl = jsonUrl.slice(0, -1) + '.json';
      } else {
        jsonUrl = jsonUrl + '.json';
      }
    }
    
    const jsonRes = await fetch(jsonUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    
    if (!jsonRes.ok) {
      return { working: true, isReddit: true, removed: false };
    }
    
    const data = await jsonRes.json();
    const commentMatch = finalUrl.match(/\/comments\/[a-z0-9]+\/[^\/]+\/([a-z0-9]+)/i) || 
                        finalUrl.match(/\/comments\/[a-z0-9]+\/_\/([a-z0-9]+)/i);
    const commentId = commentMatch ? commentMatch[1] : null;
    
    let isRemoved = false;
    
    if (commentId) {
      let targetComment = null;
      
      function findComment(node, targetId) {
        if (!node) return null;
        if (node.kind === 't1' && node.data && node.data.id === targetId) {
          return node.data;
        }
        if (node.data && node.data.replies && node.data.replies.data && node.data.replies.data.children) {
          for (const child of node.data.replies.data.children) {
            const found = findComment(child, targetId);
            if (found) return found;
          }
        }
        return null;
      }
      
      if (Array.isArray(data) && data[1]?.data?.children) {
        for (const child of data[1].data.children) {
          targetComment = findComment(child, commentId);
          if (targetComment) break;
        }
      }
      
      if (targetComment) {
        isRemoved = targetComment.body === '[removed]' || 
                    targetComment.body === '[deleted]' || 
                    targetComment.author === '[deleted]';
      } else {
        isRemoved = true;
      }
    } else {
      const post = data[0]?.data?.children?.[0]?.data;
      if (post) {
        isRemoved = post.selftext === '[removed]' || 
                    post.selftext === '[deleted]' || 
                    !!post.removed_by_category;
      }
    }
    
    return { working: true, isReddit: true, removed: isRemoved };
  } catch (error) {
    console.error('[verifyLinkStatus] Error checking link:', error);
    return { working: false, reason: error.message };
  }
}

// Provider configurations and failover model hierarchy
const AI_MODELS = [
  // Primary High-Intelligence: Google Gemini API (Most stable production models first)
  { provider: "gemini",       model: process.env.GEMINI_MODEL || "gemini-2.5-flash", supportsTools: true },
  { provider: "gemini",       model: "gemini-2.5-flash",                 supportsTools: true },
  { provider: "gemini",       model: "gemini-2.0-flash",                 supportsTools: true },
  { provider: "gemini",       model: "gemini-2.5-pro",                   supportsTools: true },
  { provider: "gemini",       model: "gemini-3.5-flash-lite",            supportsTools: true },
  // High-Speed: Groq (ultra-fast, active production models with high TPM limits)
  { provider: "groq",         model: "qwen/qwen3.6-27b",                 supportsTools: true },
  { provider: "groq",         model: "openai/gpt-oss-120b",              supportsTools: true },
  { provider: "groq",         model: "openai/gpt-oss-20b",               supportsTools: true },
  // Fallbacks: OpenRouter & Pollinations
  { provider: "openrouter",   model: "google/gemini-2.5-flash",          supportsTools: true },
  { provider: "pollinations", model: "openai-fast",                      supportsTools: true },
];

function getProviderConfig(provider) {
  if (provider === "gemini") {
    return {
      url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      key: process.env.GEMINI_API_KEY,
    };
  }
  if (provider === "pollinations") {
    return {
      url: "https://gen.pollinations.ai/v1/chat/completions",
      key: process.env.POLLINATIONS_API_KEY,
    };
  }
  if (provider === "groq") {
    return {
      url: "https://api.groq.com/openai/v1/chat/completions",
      key: process.env.GROQ_API_KEY,
    };
  }
  if (provider === "cerebras") {
    return {
      url: "https://api.cerebras.ai/v1/chat/completions",
      key: process.env.CEREBRAS_API_KEY,
    };
  }
  if (provider === "openrouter") {
    return {
      url: "https://openrouter.ai/api/v1/chat/completions",
      key: process.env.OPENROUTER_API_KEY,
    };
  }
  return { url: null, key: null };
}

module.exports = async function onMessageCreate(message) {
  if (message.author.bot) return;

  // ----- CHECK TASK PINGS -----
  // If this user has active task ping(s) in this channel, any response resolves/stops them.
  const activeTaskPings = db.getActiveTaskPingsForUserInChannel(message.author.id, message.channel.id);
  if (activeTaskPings && activeTaskPings.length > 0) {
    const removedTasks = db.removeTaskPingsByUserAndChannel(message.author.id, message.channel.id);
    for (const taskItem of removedTasks) {
      cancelTaskPingTimeout(taskItem.id);
    }
    const completionEmbed = taskCompletedEmbed(message.author, removedTasks);
    message.reply({ embeds: [completionEmbed] }).catch(() => {});
  }

  // ----- PREFIX COMMAND HANDLER -----
  const prefix = "!";
  if (message.content.startsWith(prefix)) {
    let args = message.content.slice(prefix.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    const command = message.client.commands?.get(commandName);
    if (command) {
      const mockInteraction = {
        client: message.client,
        user: message.author,
        member: message.member,
        memberPermissions: message.member?.permissions || null,
        guild: message.guild,
        guildId: message.guild?.id || null,
        channel: message.channel,
        channelId: message.channel.id,
        commandName: commandName,
        isChatInputCommand: () => true,
        deferReply: async () => {
          await message.channel.sendTyping();
        },
        reply: async (data) => {
          if (typeof data === "string") return message.reply(data);
          return message.reply(data);
        },
        editReply: async (data) => message.channel.send(data),
        followUp: async (data) => message.channel.send(data),
        options: {
          getSubcommand: () => {
            if (args.length > 0) {
              return args.shift().toLowerCase();
            }
            return null;
          },
          getString: (name) => {
            if (["prompt", "message", "description", "title", "task"].includes(name)) {
              const res = args.join(" ");
              args.length = 0;
              return res || null;
            }
            return args.shift() || null;
          },
          getUser: (name) => {
            if (!args[0]) return null;
            const match = args[0].match(/(?:<@!?)?(\d{17,20})>?/);
            if (match) {
              args.shift();
              return message.client.users.cache.get(match[1]) || null;
            }
            return null;
          },
          getChannel: (name) => {
            if (!args[0]) return null;
            const match = args[0].match(/<#(\d+)>/);
            if (match) {
              args.shift();
              return message.guild?.channels.cache.get(match[1]) || null;
            }
            return null;
          },
          getRole: () => null,
          getInteger: () => {
            const vals = args.join(" ").match(/-?\b\d+(?:\.\d+)?\b/g) || [];
            const val = vals[0];
            if (val) {
              args = args.filter((a) => !a.includes(val));
              return parseInt(val);
            }
            return null;
          },
          getNumber: () => {
            const vals = args.join(" ").match(/-?\b\d+(?:\.\d+)?\b/g) || [];
            const val = vals[0];
            if (val) {
              args = args.filter((a) => !a.includes(val));
              return parseFloat(val);
            }
            return null;
          },
          getBoolean: () => null,
        },
      };

      try {
        await command.execute(mockInteraction);
        return;
      } catch (error) {
        console.error(`[Prefix Error] Error executing ${commandName}:`, error);
        message
          .reply("There was an error running that command. Please try again.")
          .catch(() => {});
        return;
      }
    }
  }

  const isDM = !message.guild;
  const isChatRequest = isDM || message.mentions.has(message.client.user);

  // ----- TICKET LINK CHECKER -----
  if (!isDM) {
    const ticket = db.getTicket(message.channel.id);
    if (ticket) {
      const config = db.getGuildConfig(message.guild.id);
      const isAdmin = message.member && (
        message.member.permissions.has(PermissionFlagsBits.Administrator) ||
        (config.adminRoleId &&
          message.member.roles.cache.has(config.adminRoleId))
      );
      if (!isAdmin) {
        const urlMatch = message.content.match(URL_REGEX);
        if (urlMatch) {
          (async () => {
            const url = urlMatch[0];
            try {
              // React with loading icon
              await message.react(LOADING_EMOJI).catch(() => {});
              
              // Verify the link status
              const result = await verifyLinkStatus(url);
              
              // Remove the loading reaction
              const loadingReaction = message.reactions.cache.get(LOADING_EMOJI);
              if (loadingReaction) {
                await loadingReaction.users.remove(message.client.user.id).catch(() => {});
              }
              
              if (result.working && (!result.isReddit || !result.removed)) {
                // React with check mark with 8 second delay
                setTimeout(() => {
                  message.react(CHECK_EMOJI).catch(() => {});
                }, 8000);
              } else {
                // React with cross mark
                await message.react('❌').catch(() => {});
              }
            } catch (err) {
              console.error('[Ticket Link Checker Error]', err);
              const loadingReaction = message.reactions.cache.get(LOADING_EMOJI);
              if (loadingReaction) {
                await loadingReaction.users.remove(message.client.user.id).catch(() => {});
              }
              await message.react('❌').catch(() => {});
            }
          })();
        }
      }
    }
  }

  if (!isChatRequest) return;

  // ----- AI CHAT HANDLER -----
  const availableAiKeys = ["GEMINI_API_KEY", "GROQ_API_KEY", "OPENROUTER_API_KEY", "CEREBRAS_API_KEY", "POLLINATIONS_API_KEY"];
  const hasAiKey = availableAiKeys.some(key => !!process.env[key]);
  if (!hasAiKey) {
    return message
      .reply(
        "I'm not set up for AI chat yet. An admin needs to add an API key (`GEMINI_API_KEY`, `GROQ_API_KEY`, or similar) to the `.env` file.",
      )
      .catch(() => {});
  }

  const prompt = message.content
    .replace(new RegExp(`<@!?${message.client.user.id}>`, "g"), "")
    .trim();

  if (!prompt) {
    return message.reply("Hey! What can I help you with? 👋").catch(() => {});
  }

  // Signal bot is busy → DND
  if (message.client.setActivity) message.client.setActivity(true);

  // Automatic fast name detection heuristic (e.g. "my name is Alex", "call me Sam", "i go by Alex")
  const nameIntroMatch = prompt.match(/\b(?:my name is|call me|i go by|i'm called|im called)\s+([A-Za-z0-9_-]{2,20})\b/i);
  if (nameIntroMatch) {
    db.updateUserProfile(message.author.id, { preferredName: nameIntroMatch[1] });
  }

  // Retrieve user profile and cross-session conversation memory
  const userProfile = db.getUserProfile(message.author.id);
  const userConversationHistory = db.getUserConversation(message.author.id, 8);

  // Fetch conversation history for context
  let conversationHistory = [];
  try {
    const fetched = await message.channel.messages.fetch({ limit: 30 });
    
    Array.from(fetched.values()).forEach(msg => {
      if (msg.id === message.id) return;
      if (!msg.content) return;
      if (msg.content.startsWith("!")) return;
      
      let textContent = msg.content.replace(new RegExp(`<@!?${message.client.user.id}>`, "g"), "").trim();
      if (!textContent) return;
      
      if (msg.author.id === message.client.user.id) {
        conversationHistory.unshift({ role: "assistant", content: textContent });
      } else {
        conversationHistory.unshift({ role: "user", content: `${msg.author.username}: ${textContent}` });
      }
    });

    if (conversationHistory.length > 25) {
      conversationHistory = conversationHistory.slice(conversationHistory.length - 25);
    }
  } catch (error) {
    console.warn("Could not fetch conversation history:", error);
  }

  // If current channel has few recent messages, blend in persistent cross-session history
  let activeHistory = conversationHistory.slice(-4);
  if (activeHistory.length === 0 && userConversationHistory.length > 0) {
    activeHistory = userConversationHistory.slice(-6).map(turn => ({
      role: turn.role,
      content: turn.content,
    }));
  }

  try {
    await message.channel.sendTyping();
    let reply = null;

    // Fetch brain memories
    const brainMemories = db.getAllRelevantBrainMemories(message.author.id, message.guild?.id);
    let memoryPrompt = "";
    if (brainMemories && brainMemories.length > 0) {
      memoryPrompt = "\n\n--- LONG-TERM MEMORY (BRAIN) ---\n" + 
        brainMemories.map(m => {
          const scopeLabel = m.scope === 'user' ? `User ${message.author.username}` : (m.scope === 'server' ? 'Server' : 'Global');
          return `[${scopeLabel}]: ${m.content}`;
        }).join('\n') +
        "\n---------------------------------";
    }

    // Build user profile text
    let userProfilePrompt = `\n\n--- USER PROFILE & MEMORY (@${message.author.username}) ---`;
    userProfilePrompt += `\nDiscord Username: ${message.author.username} (ID: ${message.author.id})`;
    if (userProfile.preferredName) {
      userProfilePrompt += `\nPreferred Name: ${userProfile.preferredName} (Always greet and refer to them as ${userProfile.preferredName}!)`;
    }
    if (userProfile.facts && userProfile.facts.length > 0) {
      userProfilePrompt += `\nKnown Facts & Details about ${userProfile.preferredName || message.author.username}:\n` +
        userProfile.facts.map(f => `• ${f}`).join('\n');
    }
    if (userProfile.summary) {
      userProfilePrompt += `\nSummary of Past Conversations:\n${userProfile.summary}`;
    }
    userProfilePrompt += `\n-----------------------------------------------------------`;

    // Build tool list (built-in tools + cmd tools)
    const dynamicTools = [...aiToolDefinitions];
    
    // Explicitly add command tools so Groq and Gemini tool validation passes
    const cmdTools = [
      "add_money", "remove_money", "balance", "history", "imagine", "remind",
      "taskping", "text", "verify", "memory", "cd", "remove_cd"
    ];
    for (const cmdName of cmdTools) {
      dynamicTools.push({
        type: "function",
        function: {
          name: `cmd_${cmdName}`,
          description: `Executes the built-in command '${cmdName}' with full Administrator authority.`,
          parameters: {
            type: "object",
            properties: {
              args: {
                type: "string",
                description: 'Arguments for the command (e.g. "50 <@user>" or description)',
              },
            },
          },
        },
      });
    }

    // Deduplicate models in case GEMINI_MODEL is already one of the fallbacks
    const seenModels = new Set();
    const availableModels = AI_MODELS.filter(({ provider, model }) => {
      if (!getProviderConfig(provider).key) return false;
      const key = `${provider}:${model}`;
      if (seenModels.has(key)) return false;
      seenModels.add(key);
      return true;
    });

    const isUserAdmin = Boolean(
      message.member && (
        message.member.permissions.has(PermissionFlagsBits.Administrator) ||
        (message.guild && db.getGuildConfig(message.guild.id)?.adminRoleId && message.member.roles.cache.has(db.getGuildConfig(message.guild.id).adminRoleId))
      )
    );

    for (const { provider, model, supportsTools } of availableModels) {
      const { url: apiUrl, key: apiKey } = getProviderConfig(provider);
      try {
        const messages = [
          {
            role: "system",
            content: `You are Oakawol Bot, an intelligent, highly capable Discord server assistant powered by advanced reasoning. Write in simple, clear, and friendly English. Use the tools provided — never refuse an action if a matching tool exists.

USER PERMISSIONS & ACCESS CONTROL:
- Current user: @${message.author.username} (Role: ${isUserAdmin ? "ADMINISTRATOR" : "REGULAR MEMBER"}).
- Regular members CANNOT use admin actions (such as adding/removing coins, timeout/ban/kick, server configuration). If a regular member asks you to add money to their balance or moderate other users, politely tell them that only server administrators can perform that action.
- Only administrators are authorized to use admin tools and commands.

REAL-TIME DATA & EXTERNAL APIS:
- Open-Meteo Weather: Query live worldwide weather with 'get_weather'.
- PopCat API: You have fun and meme generation capabilities via:
  • 'popcat_fun': fetch jokes, facts, shower thoughts, and pickup lines.
  • 'popcat_meme': generate meme images (achievements, tweets, wanted posters, jail, pooh).
  • 'popcat_lyrics': look up song lyrics and artist info.
- Web Intelligence & Tavily: You HAVE real-time web search capabilities via 'tavily_search' (powered by Tavily AI, use this first for questions, news, and deep research), 'search_google', 'fetch_webpage', 'search_reddit', and 'get_crypto_price'. Always search for live info, news, or current events!${userProfilePrompt}${memoryPrompt}

MEMORY & PERSONALIZATION:
- You have persistent memory across all Discord servers and DMs! You remember who users are and past discussions.
- If the user introduces themselves or asks to be called something (e.g. "My name is Alex", "Call me Sam"), call 'set_user_name' with their name.
- If the user shares personal details, hobbies, likes, dislikes, or instructions (e.g. "I love cats", "I'm learning JavaScript"), call 'remember_fact' with scope 'user'.
- Always address the user naturally by their preferred name whenever known.

Available bot commands (use via cmd_ tools):
- cmd_add_money / cmd_remove_money: Manage a user's server balance (Admin only). Pass args as "<number> <userId>"
- cmd_balance: View a user's balance. Pass args as "<userId>"
- cmd_history: View a user's transaction history. Pass args as "<userId>"
- cmd_taskping: Assign a task and ping user every 30m until done (Admin only). Pass args as "<userId> <task description>"
- cmd_cd / cmd_remove_cd: Check or manage cooldowns. Pass args as "<userId> <time>"
- cmd_text: Send a message in channel as the bot (Admin only). Pass args as "<message>"
- cmd_verify: Verify if a link is working (Admin only).
- cmd_imagine: Create AI art. Pass args as the image description.
- cmd_remind: Schedule a reminder. Pass args as "<duration> <note>" (e.g. "10m check oven")

User messages are prefixed with their username (e.g. Username: message) so you know who is speaking.
Always extract the user's Discord ID from mentions like <@123456789> and include it in args.
Reply concisely, simply, and politely. Do not include any reasoning or thinking in your response.`,
          },
          ...activeHistory,
          { role: "user", content: `${message.author.username}: ${prompt}` },
        ];

        const requestBody = {
          model: model,
          messages: messages,
          max_tokens: 1000,
        };

        // Only pass tools to models that support them
        if (supportsTools) {
          requestBody.tools = dynamicTools;
          requestBody.tool_choice = "auto";
        }

        const headers = {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        };
        if (provider === "openrouter") {
          headers["HTTP-Referer"] = "https://github.com/toodos/discord-reminder-bot";
          headers["X-Title"] = "Oakawol Bot";
        }

        const response = await fetch(apiUrl, {
          method: "POST",
          headers: headers,
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const errBody = await response.text();
          const is5xx = response.status >= 500 && response.status < 600;
          const isRateOrTokenLimit = response.status === 429 || response.status === 413;
          const providerTag = provider.charAt(0).toUpperCase() + provider.slice(1);
          const err = new Error(
            `${providerTag} API failed (${model}): ${response.status} ${errBody}`,
          );
          if (isRateOrTokenLimit) {
            console.warn(
              `[${providerTag}] ⚠️  Model ${model} hit token/rate limit (${response.status}) — failing over to next model...`,
            );
          } else if (is5xx) {
            console.warn(
              `[${providerTag}] ⚠️  Model ${model} returned ${response.status} (gateway issue) — trying next model...`,
            );
          } else {
            console.warn(
              `[${providerTag}] ❌ Model ${model} returned ${response.status} — trying next model...`,
            );
          }
          throw err;
        }

        const completion = await response.json();
        const responseMessage = completion.choices[0]?.message;

        if (responseMessage?.tool_calls) {
          messages.push(responseMessage);

          let executedSilently = false;

          for (const toolCall of responseMessage.tool_calls) {
            let argsObj;
            try {
              argsObj = JSON.parse(toolCall.function.arguments || "{}");
            } catch (err) {
              console.warn(`[AI Orchestrator] Failed to parse tool arguments:`, err.message);
              argsObj = {};
            }
            const tName = toolCall.function.name;
            let toolResult = "";

            if (tName.startsWith("cmd_")) {
              const cmdName = tName.replace("cmd_", "");
              const command = message.client.commands?.get(cmdName);
              if (command) {
                let commandReplied = false;
                const mockInteraction = {
                  client: message.client,
                  user: message.author,
                  member: message.member,
                  memberPermissions: message.member?.permissions || null,
                  guild: message.guild,
                  guildId: message.guild?.id || null,
                  channel: message.channel,
                  channelId: message.channel.id,
                  commandName: cmdName,
                  isChatInputCommand: () => true,
                  deferReply: async () => {
                    await message.channel.sendTyping();
                  },
                  reply: async (data) => {
                    commandReplied = true;
                    return message.reply(data);
                  },
                  editReply: async (data) => {
                    commandReplied = true;
                    return message.channel.send(data);
                  },
                  followUp: async (data) => {
                    commandReplied = true;
                    return message.channel.send(data);
                  },
                  options: {
                    getSubcommand: () => {
                      if (argsObj.args) {
                        const argArr = argsObj.args.trim().split(/\s+/);
                        if (argArr.length > 0) {
                          const sub = argArr.shift().toLowerCase();
                          argsObj.args = argArr.join(" ");
                          return sub;
                        }
                      }
                      return null;
                    },
                    getString: (name) => {
                      if (name === "time") {
                        const match = (argsObj.args || "").match(
                          /\b(?:\d+[smhd])+\b/i,
                        );
                        if (match) {
                          argsObj.args = argsObj.args
                            .replace(match[0], "")
                            .trim();
                          return match[0];
                        }
                      }
                      if (
                        ["prompt", "message", "description", "title"].includes(
                          name,
                        )
                      ) {
                        const res = argsObj.args;
                        argsObj.args = "";
                        return res || null;
                      }
                      const argArr = argsObj.args
                        ? argsObj.args.split(" ")
                        : [];
                      const res = argArr.shift();
                      argsObj.args = argArr.join(" ");
                      return res || null;
                    },
                    getUser: () => {
                      const matches = [
                        ...(argsObj.args || "").matchAll(
                          /(?:<@!?)?(\d{17,20})>?/g,
                        ),
                      ];
                      for (const match of matches) {
                        const user =
                          message.client.users.cache.get(match[1]) ||
                          message.guild?.members.cache.get(match[1])?.user;
                        if (user) {
                          argsObj.args = argsObj.args.replace(match[0], "");
                          return user;
                        }
                      }
                      return null;
                    },
                    getChannel: () => {
                      const matches = [
                        ...(argsObj.args || "").matchAll(/<#(\d+)>/g),
                      ];
                      for (const match of matches) {
                        const channel = message.guild?.channels.cache.get(
                          match[1],
                        );
                        if (channel) {
                          argsObj.args = argsObj.args.replace(match[0], "");
                          return channel;
                        }
                      }
                      return null;
                    },
                    getRole: () => null,
                    getInteger: () => {
                      const vals =
                        (argsObj.args || "").match(/-?\b\d+(?:\.\d+)?\b/g) ||
                        [];
                      const val = vals[0];
                      if (val) {
                        argsObj.args = argsObj.args.replace(val, "");
                        return parseInt(val);
                      }
                      return null;
                    },
                    getNumber: () => {
                      const vals =
                        (argsObj.args || "").match(/-?\b\d+(?:\.\d+)?\b/g) ||
                        [];
                      const val = vals[0];
                      if (val) {
                        argsObj.args = argsObj.args.replace(val, "");
                        return parseFloat(val);
                      }
                      return null;
                    },
                    getBoolean: () => null,
                  },
                };
                try {
                  await command.execute(mockInteraction);
                  if (commandReplied) executedSilently = true;
                  toolResult = commandReplied
                    ? "SYSTEM NOTE: Command executed and shown to the user. Just briefly acknowledge it."
                    : "I have executed the command for you.";
                } catch (err) {
                  console.error(`[AI Cmd Error]`, err);
                  toolResult = `There was an error executing that command.`;
                }
              } else {
                toolResult = "Command not found.";
              }
            } else {
              toolResult = await executeTool(tName, argsObj, message);
            }

            messages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              name: tName,
              content: String(toolResult),
            });
          }

          // IMPORTANT: Tools were executed — we MUST break after this regardless of whether
          // the second call succeeds. If we don't, the next model will re-run the same tools!
          let secondReply = executedSilently
            ? "COMMAND_EXECUTED_SILENTLY"
            : null;

          // Compact messages payload for 2nd API call to consume minimal tokens (<500 tokens)
          const secondMessagesPayload = [
            { role: "system", content: "Summarize the tool output into a friendly, simple English response for the user. Keep it concise. Do not mention system tools or internal formatting." },
            { role: "user", content: prompt },
            { role: "assistant", content: `Tool Output: ${secondReply || "Action completed successfully."}` }
          ];

          // Attempt second API call to get final text response after tool execution with failover
          for (const retryModel of availableModels) {
            const { url: rUrl, key: rKey } = getProviderConfig(retryModel.provider);
            try {
              const rHeaders = {
                "Content-Type": "application/json",
                Authorization: `Bearer ${rKey}`,
              };
              if (retryModel.provider === "openrouter") {
                rHeaders["HTTP-Referer"] = "https://github.com/toodos/discord-reminder-bot";
                rHeaders["X-Title"] = "Oakawol Bot";
              }

              const secondResponse = await fetch(rUrl, {
                method: "POST",
                headers: rHeaders,
                body: JSON.stringify({ model: retryModel.model, messages: secondMessagesPayload, max_tokens: 1000 }),
              });

              if (secondResponse.ok) {
                const secondCompletion = await secondResponse.json();
                let rawReply = secondCompletion.choices[0]?.message?.content;
                if (rawReply) {
                  rawReply = rawReply
                    .replace(/<think>[\s\S]*?<\/think>/gi, "")
                    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
                    .replace(/<reflection>[\s\S]*?<\/reflection>/gi, "")
                    .replace(/<output>([\s\S]*?)<\/output>/gi, "$1")
                    .trim();
                }
                if (rawReply) {
                  secondReply = rawReply;
                  break;
                }
              } else {
                const rTag = retryModel.provider.charAt(0).toUpperCase() + retryModel.provider.slice(1);
                console.warn(
                  `[${rTag}] Second call model ${retryModel.model} returned ${secondResponse.status} — trying next fallback model...`,
                );
              }
            } catch (rErr) {
              // try next model
            }
          }

          // Set reply and ALWAYS break — tools already ran, do not retry with another model
          reply = secondReply || "Done! ✅";
          break;
        } else if (responseMessage?.content) {
          reply = responseMessage.content;
        }

        if (reply) break;
      } catch (err) {
        const providerTag = provider.charAt(0).toUpperCase() + provider.slice(1);
        const knownApiErr = err.message.includes("Pollinations API failed");
        const isRateOrTokenLimit = err.message.includes("429") || err.message.includes("413");
        const isGatewayErr =
          err.message.includes("502") ||
          err.message.includes("503") ||
          err.message.includes("504") ||
          err.message.includes("high demand") ||
          err.message.includes("UNAVAILABLE");

        // Only log actual unexpected failures, not temporary 503 high-demand or rate-limits
        if (!knownApiErr && !isRateOrTokenLimit && !isGatewayErr) {
          console.error(
            `[${providerTag}] ❌ Unexpected error with model ${model}:`,
            err.message,
          );
        }
        // Minimal pause so failover to the next working model is instant
        await new Promise((r) => setTimeout(r, 150));
      }
    }

    if (!reply) {
      if (message.client.setActivity) message.client.setActivity(false);
      return;
    }

    if (
      reply === "COMMAND_EXECUTED_SILENTLY" ||
      reply.trim().toUpperCase() === "IGNORE"
    ) {
      if (message.client.setActivity) message.client.setActivity(false);
      return;
    }

    // Strip reasoning model thinking tags (DeepSeek, Llama, Nova, etc.)
    reply = reply
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
      .replace(/<reflection>[\s\S]*?<\/reflection>/gi, "")
      .replace(/<output>([\s\S]*?)<\/output>/gi, "$1")
      .trim();

    if (!reply) {
      if (message.client.setActivity) message.client.setActivity(false);
      return;
    }

    if (reply.length > 2000) {
      reply = reply.substring(0, 1997) + "...";
    }
    const result = await message.reply(reply).catch(() => {});
    if (result) {
      // Persist dialogue turns to cross-session user memory
      db.appendUserConversation(message.author.id, "user", `${message.author.username}: ${prompt}`);
      db.appendUserConversation(message.author.id, "assistant", reply);
    }
    if (message.client.setActivity) message.client.setActivity(false);
    return result;
  } catch (error) {
    console.error("[AI Unexpected Error]", error);
    if (message.client.setActivity) message.client.setActivity(false);
  }
};
