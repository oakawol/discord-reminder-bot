const { EmbedBuilder, AttachmentBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('./database');
const { searchTrack, getQueue, createOrGetQueue } = require('./musicManager');

const aiToolDefinitions = [
    // Moderation & Interaction
    {
        type: 'function',
        function: {
            name: 'react_to_recent_messages',
            description: 'Reacts to the most recent messages in the current channel with a specific emoji.',
            parameters: {
                type: 'object',
                properties: {
                    emoji: { type: 'string', description: 'The emoji to react with (e.g. ✅, 💀, 🔥, or a custom emoji string)' },
                    count: { type: 'integer', description: 'The number of recent messages to react to (default: 3, max: 20)' }
                },
                required: ['emoji']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'delete_recent_messages',
            description: 'Deletes a specified number of recent messages in the current channel.',
            parameters: {
                type: 'object',
                properties: {
                    count: { type: 'integer', description: 'The number of messages to delete (max 100)' }
                },
                required: ['count']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'timeout_user',
            description: 'Time out or mute a member in the server for a given number of minutes.',
            parameters: {
                type: 'object',
                properties: {
                    userId: { type: 'string', description: 'The Discord user ID (snowflake) of the person to timeout.' },
                    minutes: { type: 'integer', description: 'Duration in minutes to time them out (1 to 40320)' },
                    reason: { type: 'string', description: 'The reason for the timeout.' }
                },
                required: ['userId', 'minutes']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'kick_user',
            description: 'Kicks a member from the server.',
            parameters: {
                type: 'object',
                properties: {
                    userId: { type: 'string', description: 'The Discord user ID (snowflake) of the person to kick.' },
                    reason: { type: 'string', description: 'The reason for kicking the user.' }
                },
                required: ['userId']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'ban_user',
            description: 'Bans a member from the server.',
            parameters: {
                type: 'object',
                properties: {
                    userId: { type: 'string', description: 'The Discord user ID of the person to ban.' },
                    reason: { type: 'string', description: 'Reason for the ban.' }
                },
                required: ['userId']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'send_embed',
            description: 'Sends a beautifully styled embed message to the current channel.',
            parameters: {
                type: 'object',
                properties: {
                    title: { type: 'string', description: 'The title of the embed' },
                    description: { type: 'string', description: 'The main body/description of the embed' },
                    color: { type: 'string', description: 'A hex color code (e.g. #FF5733) or a standard color name like "Red"' }
                },
                required: ['title', 'description']
            }
        }
    },
    // Channel & Server Management
    {
        type: 'function',
        function: {
            name: 'lock_channel',
            description: 'Locks the current channel so regular members cannot send messages.',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'unlock_channel',
            description: 'Unlocks the current channel so regular members can send messages again.',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'create_channel',
            description: 'Creates a new text channel in the server.',
            parameters: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'The name of the new channel' }
                },
                required: ['name']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'change_bot_nickname',
            description: 'Changes the bot\'s nickname in the server.',
            parameters: {
                type: 'object',
                properties: {
                    nickname: { type: 'string', description: 'The new nickname' }
                },
                required: ['nickname']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'set_slowmode',
            description: 'Sets the slowmode for the current channel.',
            parameters: {
                type: 'object',
                properties: {
                    seconds: { type: 'integer', description: 'Slowmode delay in seconds (0 to disable)' }
                },
                required: ['seconds']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_user_info',
            description: 'Gets stats and info about a user in the server (join date, roles, etc).',
            parameters: {
                type: 'object',
                properties: {
                    userId: { type: 'string', description: 'The user ID to fetch info for.' }
                },
                required: ['userId']
            }
        }
    },
    // Web & External APIs
    {
        type: 'function',
        function: {
            name: 'tavily_search',
            description: 'Advanced AI research & web search engine powered by Tavily. Returns direct answers, factual summaries, and clean extracted article snippets for any question, current event, or topic.',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'The comprehensive research or search query to look up.' }
                },
                required: ['query']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'search_google',
            description: 'Searches Google, news feeds, and the live web for real-time information, articles, and current events. ALWAYS use this tool whenever the user asks for real-time news, current events, recent updates, or facts beyond your training cutoff.',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'The search query to look up (e.g. "latest tech news", "world news today", "current events")' }
                },
                required: ['query']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'search_reddit',
            description: 'Fetches the top hot posts from a requested subreddit.',
            parameters: {
                type: 'object',
                properties: {
                    subreddit: { type: 'string', description: 'The name of the subreddit without r/ (e.g. perfectlycutscreams)' }
                },
                required: ['subreddit']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_random_joke',
            description: 'Fetches a random joke to tell the user.',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_cat_fact',
            description: 'Fetches a random interesting cat fact.',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_dog_image',
            description: 'Fetches a random cute dog image URL.',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_urban_dictionary',
            description: 'Searches Urban Dictionary for a slang term definition.',
            parameters: {
                type: 'object',
                properties: {
                    term: { type: 'string', description: 'The slang word to search' }
                },
                required: ['term']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_crypto_price',
            description: 'Fetches the current price of a cryptocurrency.',
            parameters: {
                type: 'object',
                properties: {
                    coin: { type: 'string', description: 'The coin id (e.g. bitcoin, ethereum, dogecoin)' }
                },
                required: ['coin']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'generate_image',
            description: 'Generates a custom AI image based on a text prompt.',
            parameters: {
                type: 'object',
                properties: {
                    prompt: { type: 'string', description: 'The detailed description of the image to generate' }
                },
                required: ['prompt']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_trivia_question',
            description: 'Fetches a random trivia question to quiz the users.',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_random_quote',
            description: 'Fetches a random inspirational or interesting quote.',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'search_github_user',
            description: 'Fetches basic public repository count and followers for a GitHub user.',
            parameters: {
                type: 'object',
                properties: {
                    username: { type: 'string', description: 'The GitHub username' }
                },
                required: ['username']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_name_stats',
            description: 'Guesses a person\'s age based on their first name.',
            parameters: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'The first name to analyze' }
                },
                required: ['name']
            }
        }
    },
    // ---- SERVER MANAGEMENT ----
    {
        type: 'function',
        function: {
            name: 'delete_channel',
            description: 'Deletes a channel from the server by channel ID or the current channel if none specified.',
            parameters: {
                type: 'object',
                properties: {
                    channelId: { type: 'string', description: 'The channel ID to delete. Leave empty to delete the current channel.' }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'rename_channel',
            description: 'Renames the current channel.',
            parameters: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'The new channel name' }
                },
                required: ['name']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'set_channel_topic',
            description: 'Sets the topic/description of the current channel.',
            parameters: {
                type: 'object',
                properties: {
                    topic: { type: 'string', description: 'The new channel topic' }
                },
                required: ['topic']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'create_role',
            description: 'Creates a new role in the server with a given name and optional color.',
            parameters: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'Name of the role' },
                    color: { type: 'string', description: 'Hex color (e.g. #FF5733). Optional.' }
                },
                required: ['name']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'assign_role',
            description: 'Assigns an existing role to a server member by user ID and role name.',
            parameters: {
                type: 'object',
                properties: {
                    userId: { type: 'string', description: 'The Discord user ID' },
                    roleName: { type: 'string', description: 'The exact name of the role to assign' }
                },
                required: ['userId', 'roleName']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'remove_role',
            description: 'Removes a role from a server member.',
            parameters: {
                type: 'object',
                properties: {
                    userId: { type: 'string', description: 'The Discord user ID' },
                    roleName: { type: 'string', description: 'The exact name of the role to remove' }
                },
                required: ['userId', 'roleName']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'unban_user',
            description: 'Unbans a previously banned user from the server.',
            parameters: {
                type: 'object',
                properties: {
                    userId: { type: 'string', description: 'The Discord user ID to unban.' }
                },
                required: ['userId']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_server_info',
            description: 'Fetches info about the current server (member count, owner, boost level, etc).',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'list_roles',
            description: 'Lists all roles in the server.',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'list_channels',
            description: 'Lists all text channels in the server.',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'dm_user',
            description: 'Sends a private Direct Message (DM) to a specific user.',
            parameters: {
                type: 'object',
                properties: {
                    userId: { type: 'string', description: 'The Discord user ID' },
                    content: { type: 'string', description: 'The message content to DM them' }
                },
                required: ['userId', 'content']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'send_to_channel',
            description: 'Sends a message to a specific channel by ID (not the current one).',
            parameters: {
                type: 'object',
                properties: {
                    channelId: { type: 'string', description: 'The target channel ID' },
                    content: { type: 'string', description: 'The message to send' }
                },
                required: ['channelId', 'content']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'pin_message',
            description: 'Pins the most recent message in the current channel.',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'announce',
            description: 'Sends a bolded @here announcement to the current channel.',
            parameters: {
                type: 'object',
                properties: {
                    message: { type: 'string', description: 'The announcement message to send' }
                },
                required: ['message']
            }
        }
    },
    // ---- POLLS & FUN ----
    {
        type: 'function',
        function: {
            name: 'create_poll',
            description: 'Creates a simple yes/no poll or multiple-choice reaction poll in the channel.',
            parameters: {
                type: 'object',
                properties: {
                    question: { type: 'string', description: 'The poll question' },
                    options: { type: 'string', description: 'Comma-separated options (up to 5). Leave empty for yes/no poll.' }
                },
                required: ['question']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'roll_dice',
            description: 'Rolls one or more dice (e.g. 2d6, 1d20). Returns the result.',
            parameters: {
                type: 'object',
                properties: {
                    dice: { type: 'string', description: 'Dice notation like 1d6, 2d20, 3d8. Default is 1d6.' }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'pick_random',
            description: 'Picks a random item from a list of provided choices.',
            parameters: {
                type: 'object',
                properties: {
                    choices: { type: 'string', description: 'Comma-separated list of choices.' }
                },
                required: ['choices']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'coinflip',
            description: 'Flips a virtual coin and returns Heads or Tails.',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_meme',
            description: 'Fetches a random trending, viral meme from Reddit (dankmemes, memes, wholesomememes) to post in the chat. Use this whenever the user asks for a meme, another meme ("aur koi meme"), or something funny!',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_weather',
            description: 'Gets current weather info and forecasts for a city using the Open-Meteo API (free, highly accurate).',
            parameters: {
                type: 'object',
                properties: {
                    city: { type: 'string', description: 'The city name to get weather for (e.g. London, Tokyo, New York)' }
                },
                required: ['city']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'popcat_fun',
            description: 'Gets random jokes, fun facts, shower thoughts, or pickup lines using the PopCat API.',
            parameters: {
                type: 'object',
                properties: {
                    type: {
                        type: 'string',
                        enum: ['joke', 'fact', 'showerthought', 'pickupline'],
                        description: 'The type of fun content to retrieve.'
                    }
                },
                required: ['type']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'popcat_meme',
            description: 'Generates custom meme images: drake, pooh, pikachu, oogway, sadcat, unforgivable, or avatar overlays (pet, jail, wanted, clown, gun, communism).',
            parameters: {
                type: 'object',
                properties: {
                    template: {
                        type: 'string',
                        enum: ['drake', 'pooh', 'pikachu', 'oogway', 'sadcat', 'unforgivable', 'pet', 'jail', 'wanted', 'clown', 'gun', 'communism'],
                        description: 'The meme template to generate.'
                    },
                    text: {
                        type: 'string',
                        description: 'Text for the meme. For drake or pooh use "top text | bottom text".'
                    },
                    text1: {
                        type: 'string',
                        description: 'Top/First line for drake or pooh.'
                    },
                    text2: {
                        type: 'string',
                        description: 'Bottom/Second line for drake or pooh.'
                    },
                    targetUserId: {
                        type: 'string',
                        description: 'Discord user ID of the person for avatar templates (pet, jail, wanted, clown, gun, communism). Defaults to author.'
                    }
                },
                required: ['template']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'popcat_lyrics',
            description: 'Searches and retrieves song lyrics and artist info using PopCat API.',
            parameters: {
                type: 'object',
                properties: {
                    song: { type: 'string', description: 'Title of the song to search' }
                },
                required: ['song']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'translate_text',
            description: 'Translates a piece of text to any language using the MyMemory free API.',
            parameters: {
                type: 'object',
                properties: {
                    text: { type: 'string', description: 'The text to translate' },
                    target_lang: { type: 'string', description: 'Target language code like EN, ES, FR, DE, JA, KO, AR' }
                },
                required: ['text', 'target_lang']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_minecraft_server',
            description: 'Fetches info about a Minecraft Java server (online status, player count).',
            parameters: {
                type: 'object',
                properties: {
                    host: { type: 'string', description: 'The Minecraft server address (e.g. hypixel.net)' }
                },
                required: ['host']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'read_channel_history',
            description: 'Reads the last N messages from the current channel and returns their content.',
            parameters: {
                type: 'object',
                properties: {
                    count: { type: 'integer', description: 'How many recent messages to read (max 20)' }
                }
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_user_avatar',
            description: 'Fetches and posts the avatar/profile picture of a user.',
            parameters: {
                type: 'object',
                properties: {
                    userId: { type: 'string', description: 'The Discord user ID' }
                },
                required: ['userId']
            }
        }
    },
    // ---- MEMORY TOOLS ----
    {
        type: 'function',
        function: {
            name: 'set_memory',
            description: 'Stores a piece of information in the long-term memory. Use this to remember user details, facts, or instructions.',
            parameters: {
                type: 'object',
                properties: {
                    slot: { type: 'integer', description: 'The memory slot index (0 to 99). Use different slots for different facts.' },
                    message: { type: 'string', description: 'The information to remember.' }
                },
                required: ['slot', 'message']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_memory',
            description: 'Retrieves a piece of information from a specific memory slot.',
            parameters: {
                type: 'object',
                properties: {
                    slot: { type: 'integer', description: 'The memory slot index to retrieve (0 to 99).' }
                },
                required: ['slot']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'list_memory',
            description: 'Lists all currently stored memories and their slot numbers.',
            parameters: { type: 'object', properties: {} }
        }
    },
    // ---- BRAIN MEMORY TOOLS ----
    {
        type: 'function',
        function: {
            name: 'set_user_name',
            description: 'Saves or updates the user\'s preferred name or nickname so the bot addresses them by this name across all channels, servers, and DMs.',
            parameters: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'The preferred name or nickname (e.g. Alex, Sam, etc.)' }
                },
                required: ['name']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'remember_fact',
            description: 'Saves an important fact or instruction into the bot\'s long-term memory (brain). Use "user" (specific to the user speaking), "server" (specific to the current Discord server), or "global" (bot-wide). Use this to remember user details, server preferences, or bot-wide instructions. ONLY use "server" or "global" if you are an Administrator.',
            parameters: {
                type: 'object',
                properties: {
                    scope: { type: 'string', enum: ['user', 'server', 'global'], description: 'The scope/target of the memory.' },
                    fact: { type: 'string', description: 'The fact, preference, detail, or instruction to remember.' }
                },
                required: ['scope', 'fact']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'forget_fact',
            description: 'Removes or clears matching facts from the bot\'s long-term memory (brain). Specify the scope and a keyword that matches the fact to delete.',
            parameters: {
                type: 'object',
                properties: {
                    scope: { type: 'string', enum: ['user', 'server', 'global'], description: 'The scope where the memory is saved.' },
                    keyword: { type: 'string', description: 'A keyword or snippet matching the fact to be deleted.' }
                },
                required: ['scope', 'keyword']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'list_brain_memories',
            description: 'Lists stored facts and instructions in the bot\'s long-term memory (brain) for a specific scope.',
            parameters: {
                type: 'object',
                properties: {
                    scope: { type: 'string', enum: ['user', 'server', 'global', 'all'], description: 'The scope to list memories for.' }
                },
                required: ['scope']
            }
        }
    },
    // ---- WEBPAGE READER ----
    {
        type: 'function',
        function: {
            name: 'fetch_webpage',
            description: 'Fetches the main readable text content of a specified webpage/URL. Use this to read documentation, articles, or links shared by users.',
            parameters: {
                type: 'object',
                properties: {
                    url: { type: 'string', description: 'The absolute HTTP/HTTPS URL of the webpage to fetch.' }
                },
                required: ['url']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_user_tickets',
            description: 'Retrieves all support tickets opened by a user in the server, showing current status and history.',
            parameters: {
                type: 'object',
                properties: {
                    userId: { type: 'string', description: 'The Discord user ID to look up.' }
                },
                required: ['userId']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'lookup_discord_user',
            description: 'Looks up a Discord user profile by their ID (snowflake), fetching account creation date, server roles, and joined date.',
            parameters: {
                type: 'object',
                properties: {
                    userId: { type: 'string', description: 'The Discord user ID to look up.' }
                },
                required: ['userId']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'list_guild_emojis',
            description: 'Lists all custom guild emojis available in the server, showing name and format so you can use them in your replies.',
            parameters: { type: 'object', properties: {} }
        }
    },
    // Music & Voice Controls
    {
        type: 'function',
        function: {
            name: 'music_play',
            description: 'Plays a song in the voice channel. Can search by song title, artist, or music query. Set playNow to true if user wants to play it immediately / right now, or wants to skip the current playing song to play this one right away.',
            parameters: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'The song name, artist, or music search query' },
                    playNow: { type: 'boolean', description: 'Set to true if user wants to play this song NOW / immediately, or wants to skip the current song to hear this one right now.' }
                },
                required: ['query']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'music_now_playing',
            description: 'Gets live info about the song currently playing in the voice channel (title, artist, duration, voice channel, requested by).',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'music_pause',
            description: 'Pauses the currently playing song in the voice channel.',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'music_resume',
            description: 'Resumes playback of the paused music in the voice channel.',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'music_skip',
            description: 'Skips the currently playing song in the voice channel and immediately starts playing the next track in the queue. Use whenever the user asks to "skip", "purana wala skip kardo", "next gana", "skip this song", "ye bajao ab".',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'music_stop',
            description: 'Stops music playback, clears the queue, and leaves the voice channel.',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'music_queue',
            description: 'Lists all upcoming tracks currently in the server\'s music queue.',
            parameters: { type: 'object', properties: {} }
        }
    }
];

async function executeTool(tName, args, message) {
    try {
        const adminOnlyTools = [
            'delete_recent_messages', 'timeout_user', 'kick_user', 'ban_user',
            'lock_channel', 'unlock_channel', 'create_channel', 'change_bot_nickname',
            'set_slowmode', 'delete_channel', 'rename_channel', 'set_channel_topic',
            'create_role', 'assign_role', 'remove_role', 'unban_user', 'get_server_info',
            'list_roles', 'list_channels', 'send_to_channel', 'pin_message', 'announce',
            'read_channel_history', 'dm_user', 'set_memory', 'get_memory', 'list_memory',
            'send_embed', 'get_user_info', 'react_to_recent_messages', 'get_user_tickets', 'lookup_discord_user'
        ];

        if (adminOnlyTools.includes(tName)) {
            if (!message.guild) return `Error: This tool can only be used in a server.`;
            
            const config = db.getGuildConfig(message.guild.id);
            const isAdmin = message.member && (
                message.member.permissions.has(PermissionFlagsBits.Administrator) ||
                (config.adminRoleId && message.member.roles.cache.has(config.adminRoleId))
            );
            
            if (!isAdmin) {
                return `Error: Action denied. The user does not have administrator permissions. You are not allowed to give sensitive information or channel names or make announcements to non-admins.`;
            }
        }

        if (['remember_fact', 'forget_fact', 'list_brain_memories'].includes(tName)) {
            const scope = args.scope;
            if (scope === 'server' || scope === 'global' || scope === 'all') {
                if (!message.guild) return `Error: Server/global memories can only be managed in a server.`;
                const config = db.getGuildConfig(message.guild.id);
                const isAdmin = message.member && (
                    message.member.permissions.has(PermissionFlagsBits.Administrator) ||
                    (config.adminRoleId && message.member.roles.cache.has(config.adminRoleId))
                );
                
                if (!isAdmin) {
                    return `Error: Action denied. Only Administrators can manage server-wide or global memories.`;
                }
            }
        }

        switch (tName) {
            case 'react_to_recent_messages': {
                const count = Math.min(args.count || 3, 20);
                const emoji = args.emoji;
                const msgs = await message.channel.messages.fetch({ limit: count + 1 });
                let reacted = 0;
                for (const msg of msgs.values()) {
                    if (msg.id !== message.id && reacted < count) {
                        await msg.react(emoji).catch(() => {});
                        reacted++;
                    }
                }
                return `Done! I've reacted to the last ${reacted} messages with ${emoji}.`;
            }
            case 'delete_recent_messages': {
                const count = Math.min(args.count || 5, 100);
                await message.channel.bulkDelete(count, true);
                return `Done! I've deleted the last ${count} messages. ✨`;
            }
            case 'timeout_user': {
                const member = await message.guild.members.fetch(args.userId).catch(() => null);
                if (!member) return `I couldn't find that user.`;
                const ms = (args.minutes || 10) * 60 * 1000;
                await member.timeout(ms, args.reason || 'AI Requested');
                return `Successfully timed out <@${args.userId}> for ${args.minutes} minutes. 🧊`;
            }
            case 'kick_user': {
                const member = await message.guild.members.fetch(args.userId).catch(() => null);
                if (!member) return `I couldn't find that user.`;
                await member.kick(args.reason || 'AI Requested');
                return `Successfully kicked <@${args.userId}>. 👢`;
            }
            case 'ban_user': {
                const member = await message.guild.members.fetch(args.userId).catch(() => null);
                if (!member) return `I couldn't find that user.`;
                await member.ban({ reason: args.reason || 'AI Requested' });
                return `Successfully banned <@${args.userId}>. 🔨`;
            }
            case 'send_embed': {
                const embed = new EmbedBuilder()
                    .setTitle(args.title)
                    .setDescription(args.description)
                    .setColor(args.color || '#FFB6C1')
                    .setTimestamp();
                await message.channel.send({ embeds: [embed] });
                return `Embed successfully synthesized! 💖`;
            }
            case 'lock_channel': {
                await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: false });
                return `Channel has been locked down. 🔒`;
            }
            case 'unlock_channel': {
                await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: null });
                return `Channel has been unlocked. 🔓`;
            }
            case 'create_channel': {
                const channel = await message.guild.channels.create({ name: args.name });
                return `I created a new channel: <#${channel.id}>! ✨`;
            }
            case 'change_bot_nickname': {
                await message.guild.members.me.setNickname(args.nickname);
                return `My nickname is now **${args.nickname}**! 🌸`;
            }
            case 'set_slowmode': {
                await message.channel.setRateLimitPerUser(args.seconds || 0);
                return args.seconds === 0 ? `Slowmode disabled! 🐇` : `Slowmode set to ${args.seconds} seconds! 🐢`;
            }
            case 'get_user_info': {
                const member = await message.guild.members.fetch(args.userId).catch(() => null);
                if (!member) return `I couldn't find that user.`;
                const embed = new EmbedBuilder()
                    .setTitle(`User Info: ${member.user.tag}`)
                    .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                    .addFields(
                        { name: 'Joined Server', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`, inline: true },
                        { name: 'Account Created', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
                        { name: 'Roles', value: `${member.roles.cache.size - 1}`, inline: true }
                    )
                    .setColor('#FFB6C1');
                await message.channel.send({ embeds: [embed] });
                return `Here is the information you requested!`;
            }
            // WEB TOOLS
            case 'tavily_search':
            case 'search_google': {
                const query = args.query;
                
                // 1. Tavily AI Search (Highest quality structured intelligence if key is configured)
                if (process.env.TAVILY_API_KEY) {
                    try {
                        const response = await fetch('https://api.tavily.com/search', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                api_key: process.env.TAVILY_API_KEY,
                                query: query,
                                search_depth: 'basic',
                                include_answer: true,
                                max_results: 5,
                            })
                        });
                        if (response.ok) {
                            const data = await response.json();
                            let out = `🔎 **Tavily Intelligence for "${query}":**\n\n`;
                            if (data.answer) out += `**AI Summary:** ${data.answer}\n\n`;
                            if (data.results && data.results.length > 0) {
                                out += data.results.map((r, i) => `**${i + 1}. [${r.title}](${r.url})**\n${r.content}`).join('\n\n');
                                return out;
                            }
                        }
                    } catch (err) {
                        console.warn('[Tavily Search Fallback]', err.message);
                    }
                }

                // 2. Google News Live Feed (India + World: movies, cinema, box office, cricket, politics, current events)
                try {
                    const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`;
                    const res = await fetch(rssUrl);
                    if (res.ok) {
                        const xml = await res.text();
                        const items = [];
                        const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
                        let match;
                        while ((match = itemRegex.exec(xml)) !== null && items.length < 5) {
                            const itemXml = match[1];
                            const title = (itemXml.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '';
                            const link = (itemXml.match(/<link>([\s\S]*?)<\/link>/i) || [])[1] || '';
                            const pubDate = (itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/i) || [])[1] || '';
                            if (title && !title.toLowerCase().startsWith('google news')) {
                                const cleanTitle = title.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').replace(/&amp;/g, '&');
                                items.push(`• **${cleanTitle}** (${pubDate})\n<${link}>`);
                            }
                        }
                        if (items.length > 0) {
                            return `Live search & news results for "${query}":\n\n` + items.join('\n\n');
                        }
                    }
                } catch (e) {
                    console.warn("Google News RSS Search failed:", e.message);
                }

                // 3. DuckDuckGo HTML Fallback
                try {
                    const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
                    const ddgRes = await fetch(ddgUrl, {
                        headers: { 
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
                        }
                    });
                    if (ddgRes.ok) {
                        const html = await ddgRes.text();
                        const results = [];
                        const linkRegex = /<a class="result__url" href="([^"]+)"[^>]*>\s*([\s\S]*?)\s*<\/a>/gi;
                        const snippetRegex = /<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>|<div class="result__snippet"[^>]*>([\s\S]*?)<\/div>/gi;
                        const titleRegex = /<a class="result__a"[^>]*>([\s\S]*?)<\/a>/gi;

                        const links = [...html.matchAll(linkRegex)];
                        const titles = [...html.matchAll(titleRegex)];
                        const snippets = [...html.matchAll(snippetRegex)];

                        for (let i = 0; i < Math.min(links.length, 4); i++) {
                            let rawUrl = links[i][1];
                            if (rawUrl.includes('uddg=')) {
                                const match = rawUrl.match(/uddg=([^&]+)/);
                                if (match) rawUrl = decodeURIComponent(match[1]);
                            }
                            const title = (titles[i] ? titles[i][1] : 'Result').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim();
                            const snippet = (snippets[i] ? (snippets[i][1] || snippets[i][2]) : '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim();

                            if (rawUrl && title) {
                                results.push(`**${title}**\n${snippet}\n<${rawUrl}>`);
                            }
                        }

                        if (results.length > 0) {
                            return `Top live web results for "${query}":\n\n` + results.join('\n\n');
                        }
                    }
                } catch (ddgErr) {
                    console.error("DuckDuckGo Fallback Search Error:", ddgErr);
                }

                return `Could not find live web results for "${query}".`;
            }
            case 'search_reddit': {
                const res = await fetch(`https://www.reddit.com/r/${args.subreddit}/hot.json?limit=3`).then(r => r.json()).catch(() => null);
                if (!res || !res.data || !res.data.children) return `I couldn't fetch from r/${args.subreddit}. It might not exist or be private. 🧊`;
                const posts = res.data.children.map(p => `**${p.data.title}**\n<https://reddit.com${p.data.permalink}>`).join('\n\n');
                return `Here are the top posts from r/${args.subreddit}:\n\n${posts}`;
            }

            case 'get_random_joke': {
                const res = await fetch(`https://official-joke-api.appspot.com/random_joke`).then(r => r.json()).catch(() => null);
                if (!res) return `I forgot the joke I was going to tell... 🧊`;
                return `${res.setup}\n\n||${res.punchline}|| 😂`;
            }
            case 'get_cat_fact': {
                const res = await fetch(`https://catfact.ninja/fact`).then(r => r.json()).catch(() => null);
                if (!res) return `Cats are mysterious... 🐈`;
                return `Did you know? ${res.fact} 🐾`;
            }
            case 'get_dog_image': {
                const res = await fetch(`https://dog.ceo/api/breeds/image/random`).then(r => r.json()).catch(() => null);
                if (!res || !res.message) return `Who let the dogs out? 🐕`;
                return `Here's a cute dog for you! 🐶\n${res.message}`;
            }
            case 'get_urban_dictionary': {
                const query = encodeURIComponent(args.term);
                const res = await fetch(`https://api.urbandictionary.com/v0/define?term=${query}`).then(r => r.json()).catch(() => null);
                if (!res || !res.list || res.list.length === 0) return `I couldn't find that slang in the dictionary. 🧊`;
                const def = res.list[0].definition.replace(/\[|\]/g, ''); // UD wraps links in brackets
                return `**${args.term}**: ${def}`;
            }
            case 'get_crypto_price': {
                const coin = args.coin.toLowerCase();
                const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coin}&vs_currencies=usd`).then(r => r.json()).catch(() => null);
                if (!res || !res[coin]) return `I couldn't find the price for ${args.coin}. Make sure you use the full name (like 'bitcoin' not 'btc'). 🧊`;
                return `The current price of **${args.coin}** is **$${res[coin].usd}**. 💸`;
            }
            case 'generate_image': {
                await message.channel.sendTyping();
                // Image generation on Pollinations is free - do NOT send API key to avoid 401/402 errors
                const imagePrompt = encodeURIComponent(args.prompt || 'abstract art');
                const imageUrl = `https://image.pollinations.ai/prompt/${imagePrompt}?width=1024&height=1024&nologo=true&model=flux&seed=${Math.floor(Math.random() * 1000000)}`;
                const res = await fetch(imageUrl).catch(() => null);
                if (!res || !res.ok) return `I couldn't imagine that properly right now! 🧊`;
                const buffer = await res.arrayBuffer();
                const attachment = new AttachmentBuilder(Buffer.from(buffer), { name: 'imagine.jpeg' });
                await message.channel.send({ content: `🎨 **Imagined:** *${args.prompt}*`, files: [attachment] });
                return `Successfully generated the image!`;
            }
            case 'get_trivia_question': {
                const res = await fetch(`https://opentdb.com/api.php?amount=1&type=multiple`).then(r => r.json()).catch(() => null);
                if (!res || !res.results || !res.results[0]) return `I couldn't think of a trivia question. 🧊`;
                const t = res.results[0];
                return `**Trivia Category: ${t.category}**\n*Difficulty: ${t.difficulty}*\n\n**Q:** ${t.question.replace(/&quot;/g, '"').replace(/&#039;/g, "'")}\n\n||**A:** ${t.correct_answer.replace(/&quot;/g, '"').replace(/&#039;/g, "'")}||`;
            }
            case 'get_random_quote': {
                const res = await fetch(`https://zenquotes.io/api/random`).then(r => r.json()).catch(() => null);
                if (!res || !res[0] || !res[0].q) return `I couldn't find a quote. 🧊`;
                return `"${res[0].q}" \n- **${res[0].a}**`;
            }
            case 'search_github_user': {
                const res = await fetch(`https://api.github.com/users/${encodeURIComponent(args.username)}`).then(r => r.json()).catch(() => null);
                if (!res || res.message === 'Not Found') return `I couldn't find a GitHub user named ${args.username}. 🧊`;
                const embed = new EmbedBuilder()
                    .setTitle(`GitHub: ${res.login}`)
                    .setURL(res.html_url)
                    .setThumbnail(res.avatar_url)
                    .setDescription(res.bio || 'No bio provided.')
                    .addFields(
                        { name: 'Public Repos', value: `${res.public_repos}`, inline: true },
                        { name: 'Followers', value: `${res.followers}`, inline: true }
                    )
                    .setColor('#2b3137');
                await message.channel.send({ embeds: [embed] });
                return `Here is the GitHub info for ${args.username}!`;
            }
            case 'get_name_stats': {
                const name = encodeURIComponent(args.name);
                const ageRes = await fetch(`https://api.agify.io?name=${name}`).then(r => r.json()).catch(() => null);
                if (!ageRes || !ageRes.age) return `I couldn't find any stats for the name ${args.name}. 🧊`;
                return `Based on my dataset, people named **${args.name}** are typically around **${ageRes.age}** years old! 🤯`;
            }
            // ---- SERVER MANAGEMENT ----
            case 'delete_channel': {
                const ch = args.channelId ? message.guild.channels.cache.get(args.channelId) : message.channel;
                if (!ch) return `I couldn't find that channel. 🧊`;
                await ch.delete();
                return `Channel deleted successfully. 🗑️`;
            }
            case 'rename_channel': {
                await message.channel.setName(args.name);
                return `Channel renamed to **${args.name}**! ✏️`;
            }
            case 'set_channel_topic': {
                await message.channel.setTopic(args.topic);
                return `Channel topic set to: *${args.topic}* 📌`;
            }
            case 'create_role': {
                const role = await message.guild.roles.create({ name: args.name, color: args.color || null });
                return `Created new role **${role.name}**! 🎭`;
            }
            case 'assign_role': {
                const member = await message.guild.members.fetch(args.userId).catch(() => null);
                if (!member) return `I couldn't find that user. 🧊`;
                const role = message.guild.roles.cache.find(r => r.name.toLowerCase() === args.roleName.toLowerCase());
                if (!role) return `I couldn't find a role named **${args.roleName}**. 🧊`;
                await member.roles.add(role);
                return `Assigned **${role.name}** to <@${args.userId}>! ✅`;
            }
            case 'remove_role': {
                const member = await message.guild.members.fetch(args.userId).catch(() => null);
                if (!member) return `I couldn't find that user. 🧊`;
                const role = message.guild.roles.cache.find(r => r.name.toLowerCase() === args.roleName.toLowerCase());
                if (!role) return `I couldn't find a role named **${args.roleName}**. 🧊`;
                await member.roles.remove(role);
                return `Removed **${role.name}** from <@${args.userId}>! ✅`;
            }
            case 'unban_user': {
                await message.guild.bans.remove(args.userId).catch(() => null);
                return `<@${args.userId}> has been unbanned. 🕊️`;
            }
            case 'get_server_info': {
                const g = message.guild;
                await g.fetchOwner();
                const embed = new EmbedBuilder()
                    .setTitle(`📊 ${g.name}`)
                    .setThumbnail(g.iconURL({ dynamic: true }))
                    .addFields(
                        { name: '👑 Owner', value: `<@${g.ownerId}>`, inline: true },
                        { name: '👥 Members', value: `${g.memberCount}`, inline: true },
                        { name: '✨ Boost Level', value: `${g.premiumTier}`, inline: true },
                        { name: '📅 Created', value: `<t:${Math.floor(g.createdTimestamp / 1000)}:R>`, inline: true },
                        { name: '🔧 Channels', value: `${g.channels.cache.size}`, inline: true },
                        { name: '🎭 Roles', value: `${g.roles.cache.size}`, inline: true }
                    )
                    .setColor('#5865F2');
                await message.channel.send({ embeds: [embed] });
                return `Here is the server info!`;
            }
            case 'list_roles': {
                const roles = message.guild.roles.cache
                    .filter(r => r.id !== message.guild.id)
                    .sort((a, b) => b.position - a.position)
                    .map(r => `• **${r.name}** (${r.members.size} members)`)
                    .slice(0, 20);
                const embed = new EmbedBuilder().setTitle('🎭 Server Roles').setDescription(roles.join('\n')).setColor('#FFB6C1');
                await message.channel.send({ embeds: [embed] });
                return `Listed ${roles.length} roles!`;
            }
            case 'list_channels': {
                const channels = message.guild.channels.cache
                    .filter(c => c.isTextBased())
                    .map(c => `• <#${c.id}> — ${c.name}`)
                    .slice(0, 20);
                const embed = new EmbedBuilder().setTitle('📋 Text Channels').setDescription(channels.join('\n')).setColor('#5865F2');
                await message.channel.send({ embeds: [embed] });
                return `Listed ${channels.length} text channels!`;
            }
            case 'dm_user': {
                const user = await message.client.users.fetch(args.userId).catch(() => null);
                if (!user) return `I couldn't find that user. 🧊`;
                await user.send(args.content).catch(() => null);
                return `📬 DM sent to <@${args.userId}>!`;
            }
            case 'send_to_channel': {
                const ch = message.guild.channels.cache.get(args.channelId);
                if (!ch) return `I couldn't find that channel. 🧊`;
                await ch.send(args.content);
                return `✅ Message sent to <#${args.channelId}>!`;
            }
            case 'pin_message': {
                const msgs = await message.channel.messages.fetch({ limit: 2 });
                const target = msgs.find(m => m.id !== message.id);
                if (!target) return `No message to pin. 🧊`;
                await target.pin();
                return `📌 Message pinned!`;
            }
            case 'announce': {
                await message.channel.send(`@here\n\n📣 **ANNOUNCEMENT**\n\n${args.message}`);
                return `Announcement sent! 📣`;
            }
            // ---- POLLS & FUN ----
            case 'create_poll': {
                const opts = args.options ? args.options.split(',').map(o => o.trim()).filter(Boolean).slice(0, 5) : null;
                const numberEmojis = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣'];
                const embed = new EmbedBuilder()
                    .setTitle(`📊 Poll: ${args.question}`)
                    .setColor('#FFB6C1')
                    .setFooter({ text: 'React below to vote!' });
                if (opts && opts.length > 1) {
                    embed.setDescription(opts.map((o, i) => `${numberEmojis[i]} ${o}`).join('\n'));
                } else {
                    embed.setDescription('React with ✅ for Yes or ❌ for No!');
                }
                const pollMsg = await message.channel.send({ embeds: [embed] });
                if (opts && opts.length > 1) {
                    for (let i = 0; i < opts.length; i++) await pollMsg.react(numberEmojis[i]);
                } else {
                    await pollMsg.react('✅');
                    await pollMsg.react('❌');
                }
                return `Poll created! 🗳️`;
            }
            case 'roll_dice': {
                const notation = (args.dice || '1d6').toLowerCase();
                const match = notation.match(/^(\d+)d(\d+)$/);
                if (!match) return `Invalid dice notation. Use formats like 1d6, 2d20, 3d8. 🧊`;
                const count = Math.min(parseInt(match[1]), 20);
                const sides = parseInt(match[2]);
                const rolls = Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1);
                const total = rolls.reduce((a, b) => a + b, 0);
                return `🎲 Rolled **${notation}**: [${rolls.join(', ')}] = **${total}**`;
            }
            case 'pick_random': {
                const choices = args.choices.split(',').map(c => c.trim()).filter(Boolean);
                if (choices.length === 0) return `No choices given! 🧊`;
                const pick = choices[Math.floor(Math.random() * choices.length)];
                return `🎯 I pick: **${pick}**`;
            }
            case 'coinflip': {
                const result = Math.random() < 0.5 ? 'Heads 🪙' : 'Tails 🪙';
                return `I flipped a coin... it's **${result}**!`;
            }
            case 'get_meme': {
                try {
                    const subreddits = ['memes', 'dankmemes', 'wholesomememes', 'me_irl'];
                    const chosenSub = subreddits[Math.floor(Math.random() * subreddits.length)];
                    const res = await fetch(`https://meme-api.com/gimme/${chosenSub}`).then(r => r.json()).catch(() => null);
                    if (res && res.url && !res.nsfw) {
                        const embed = new EmbedBuilder()
                            .setTitle(res.title || 'Fresh Meme 😂')
                            .setImage(res.url)
                            .setURL(res.postLink || 'https://reddit.com')
                            .setFooter({ text: `r/${res.subreddit} • 👍 ${res.ups || 0}` })
                            .setColor('#FF4500');
                        await message.channel.send({ embeds: [embed] });
                        return `Here is a fresh trending meme from r/${res.subreddit}: "${res.title}"!`;
                    }
                } catch (e) {
                    console.warn('[get_meme Error]', e.message);
                }
                return `Couldn't load a meme right now. 🧊`;
            }
            case 'get_weather': {
                const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(args.city)}&count=1`).then(r => r.json()).catch(() => null);
                if (!geoRes?.results?.[0]) return `I couldn't find the city "${args.city}". 🧊`;
                const { latitude, longitude, name, country } = geoRes.results[0];
                const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weathercode,windspeed_10m,relativehumidity_2m`).then(r => r.json()).catch(() => null);
                if (!weatherRes?.current) return `Couldn't fetch weather data. 🧊`;
                const c = weatherRes.current;
                const codes = { 0:'☀️ Clear', 1:'🌤️ Mainly Clear', 2:'⛅ Partly Cloudy', 3:'☁️ Overcast', 45:'🌫️ Foggy', 48:'🌫️ Icy Fog', 51:'🌦️ Light Drizzle', 61:'🌧️ Light Rain', 63:'🌧️ Moderate Rain', 65:'🌧️ Heavy Rain', 71:'🌨️ Snow', 80:'🌦️ Showers', 95:'⛈️ Thunderstorm' };
                const condition = codes[c.weathercode] || `Code ${c.weathercode}`;
                const embed = new EmbedBuilder()
                    .setTitle(`🌍 Weather in ${name}, ${country}`)
                    .addFields(
                        { name: 'Condition', value: condition, inline: true },
                        { name: '🌡️ Temperature', value: `${c.temperature_2m}°C`, inline: true },
                        { name: '💧 Humidity', value: `${c.relativehumidity_2m}%`, inline: true },
                        { name: '💨 Wind Speed', value: `${c.windspeed_10m} km/h`, inline: true }
                    )
                    .setColor('#87CEEB');
                await message.channel.send({ embeds: [embed] });
                return `Weather data retrieved!`;
            }
            case 'popcat_fun': {
                let endpoint = 'https://api.popcat.xyz/joke';
                if (args.type === 'fact') endpoint = 'https://api.popcat.xyz/fact';
                else if (args.type === 'showerthought') endpoint = 'https://api.popcat.xyz/showerthoughts';
                else if (args.type === 'pickupline') endpoint = 'https://api.popcat.xyz/pickuplines';

                const data = await fetch(endpoint).then(r => r.json()).catch(() => null);
                if (!data) return `Failed to fetch from PopCat API. 🧊`;

                const text = data.joke || data.fact || data.result || data.thought || data.pickupline;
                const embed = new EmbedBuilder()
                    .setTitle(`🐱 PopCat ${args.type.toUpperCase()}`)
                    .setDescription(`> ${text}`)
                    .setColor('#FF69B4');
                await message.channel.send({ embeds: [embed] });
                return `Sent a ${args.type}: "${text}"`;
            }
            case 'popcat_meme': {
                let imgUrl = '';
                const titleMap = {
                    drake: '🦆 Drake Meme',
                    pooh: '🐻 Tuxedo Pooh',
                    pikachu: '⚡ Surprised Pikachu',
                    oogway: '🐢 Master Oogway Wisdom',
                    sadcat: '😿 Sad Cat',
                    unforgivable: '💀 Unforgivable Sin',
                    pet: '🐾 Pet Pet!',
                    jail: '🚔 Off to Jail!',
                    wanted: '🤠 WANTED: Dead or Alive',
                    clown: '🤡 Certified Clown',
                    gun: '🔫 Hold Up!',
                    communism: '☭ Our Meme Comrade',
                };

                let targetUser = message.author;
                if (args.targetUserId) {
                    targetUser = message.client.users.cache.get(args.targetUserId) ||
                        message.guild?.members.cache.get(args.targetUserId)?.user ||
                        message.author;
                }
                const avatar = targetUser.displayAvatarURL({ extension: 'png', size: 512 });

                // Split text helper for multi-line memes like Drake or Pooh
                let text1 = args.text1 || '';
                let text2 = args.text2 || '';
                if (args.text && (!text1 || !text2)) {
                    const parts = args.text.split('|');
                    if (parts.length >= 2) {
                        text1 = text1 || parts[0].trim();
                        text2 = text2 || parts[1].trim();
                    } else {
                        text1 = text1 || args.text.trim();
                        text2 = text2 || 'Doing it anyway';
                    }
                }

                const t = (args.template || 'drake').toLowerCase();
                if (t === 'drake') {
                    imgUrl = `https://api.popcat.xyz/drake?text1=${encodeURIComponent(text1 || 'Nah')}&text2=${encodeURIComponent(text2 || 'Yeah')}`;
                } else if (t === 'pooh') {
                    imgUrl = `https://api.popcat.xyz/pooh?text1=${encodeURIComponent(text1 || 'Normal')}&text2=${encodeURIComponent(text2 || 'Tuxedo')}`;
                } else if (t === 'pikachu') {
                    imgUrl = `https://api.popcat.xyz/pikachu?text=${encodeURIComponent(args.text || text1 || 'Wait, what?!')}`;
                } else if (t === 'oogway') {
                    imgUrl = `https://api.popcat.xyz/oogway?text=${encodeURIComponent(args.text || text1 || 'Yesterday is history, tomorrow is a mystery...')}`;
                } else if (t === 'sadcat') {
                    imgUrl = `https://api.popcat.xyz/sadcat?text=${encodeURIComponent(args.text || text1 || 'Why is life like this?')}`;
                } else if (t === 'unforgivable') {
                    imgUrl = `https://api.popcat.xyz/unforgivable?text=${encodeURIComponent(args.text || text1 || 'Some sins can never be forgiven')}`;
                } else if (t === 'pet') {
                    imgUrl = `https://api.popcat.xyz/pet?image=${encodeURIComponent(avatar)}`;
                } else if (t === 'jail') {
                    imgUrl = `https://api.popcat.xyz/jail?image=${encodeURIComponent(avatar)}`;
                } else if (t === 'wanted') {
                    imgUrl = `https://api.popcat.xyz/wanted?image=${encodeURIComponent(avatar)}`;
                } else if (t === 'clown') {
                    imgUrl = `https://api.popcat.xyz/clown?image=${encodeURIComponent(avatar)}`;
                } else if (t === 'gun') {
                    imgUrl = `https://api.popcat.xyz/gun?image=${encodeURIComponent(avatar)}`;
                } else if (t === 'communism') {
                    imgUrl = `https://api.popcat.xyz/communism?image=${encodeURIComponent(avatar)}`;
                } else {
                    // Default fallback to drake or pooh
                    imgUrl = `https://api.popcat.xyz/drake?text1=${encodeURIComponent(text1 || 'Nah')}&text2=${encodeURIComponent(text2 || 'Yeah')}`;
                }

                if (!imgUrl) return 'Could not generate meme image.';

                const embed = new EmbedBuilder()
                    .setTitle(titleMap[t] || 'Meme Generated 😂')
                    .setImage(imgUrl)
                    .setColor('#FF4500');
                await message.channel.send({ embeds: [embed] });
                return `Generated ${t} meme successfully!`;
            }
            case 'popcat_lyrics': {
                const song = args.song;
                let lyricsData = null;

                // 1. Try Popcat API
                try {
                    const popData = await fetch(`https://api.popcat.xyz/lyrics?song=${encodeURIComponent(song)}`).then(r => r.json()).catch(() => null);
                    if (popData && !popData.error && popData.lyrics) {
                        lyricsData = {
                            title: popData.title || song,
                            artist: popData.artist || 'Unknown Artist',
                            lyrics: popData.lyrics,
                            image: popData.image || null
                        };
                    }
                } catch (e) {}

                // 2. High-reliability fallback to LRCLIB (covers English, Hindi, Bollywood, Global)
                if (!lyricsData) {
                    try {
                        const lrcRes = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(song)}`, {
                            headers: { 'User-Agent': 'OakawolBot/1.0' }
                        }).then(r => r.json()).catch(() => null);

                        if (Array.isArray(lrcRes) && lrcRes.length > 0) {
                            const match = lrcRes.find(s => s.plainLyrics) || lrcRes[0];
                            if (match && match.plainLyrics) {
                                lyricsData = {
                                    title: match.trackName,
                                    artist: match.artistName,
                                    lyrics: match.plainLyrics,
                                    image: null
                                };
                            }
                        }
                    } catch (e) {}
                }

                if (!lyricsData) {
                    return `Could not find lyrics for "${song}". 🧊`;
                }

                const trimmedLyrics = lyricsData.lyrics.length > 2000 ? lyricsData.lyrics.substring(0, 1990) + '...' : lyricsData.lyrics;
                const embed = new EmbedBuilder()
                    .setTitle(`🎵 ${lyricsData.title} - ${lyricsData.artist}`)
                    .setDescription(trimmedLyrics)
                    .setColor('#1DB954');
                if (lyricsData.image) embed.setThumbnail(lyricsData.image);

                await message.channel.send({ embeds: [embed] });
                return `Found lyrics for "${lyricsData.title}" by ${lyricsData.artist}!`;
            }
            case 'translate_text': {
                const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(args.text)}&langpair=en|${args.target_lang}`).then(r => r.json()).catch(() => null);
                if (!res?.responseData?.translatedText) return `Translation failed. 🧊`;
                return `🌐 **Translation (→${args.target_lang}):**\n${res.responseData.translatedText}`;
            }
            case 'get_minecraft_server': {
                const res = await fetch(`https://api.mcsrvstat.us/2/${encodeURIComponent(args.host)}`).then(r => r.json()).catch(() => null);
                if (!res) return `Couldn't query that server. 🧊`;
                if (!res.online) return `🔴 **${args.host}** is **offline** or not a valid server.`;
                const embed = new EmbedBuilder()
                    .setTitle(`⛏️ ${args.host}`)
                    .addFields(
                        { name: '🟢 Status', value: 'Online', inline: true },
                        { name: '👥 Players', value: `${res.players?.online ?? 0}/${res.players?.max ?? 0}`, inline: true },
                        { name: '🏷️ Version', value: res.version || 'Unknown', inline: true },
                        { name: '📝 MOTD', value: res.motd?.clean?.[0] || 'None', inline: false }
                    )
                    .setColor('#5c8a00');
                await message.channel.send({ embeds: [embed] });
                return `Server info retrieved!`;
            }
            case 'read_channel_history': {
                const count = Math.min(args.count || 10, 20);
                const msgs = await message.channel.messages.fetch({ limit: count + 1 });
                const history = [...msgs.values()]
                    .filter(m => m.id !== message.id)
                    .slice(0, count)
                    .reverse()
                    .map(m => `[${m.author.username}]: ${m.content || '(embed/attachment)'}`)
                    .join('\n');
                return `Here are the last ${count} messages:\n\`\`\`\n${history}\n\`\`\``;
            }
            case 'get_user_avatar': {
                const user = await message.client.users.fetch(args.userId).catch(() => null);
                if (!user) return `I couldn't find that user. 🧊`;
                const avatarUrl = user.displayAvatarURL({ size: 512, extension: 'png' });
                const embed = new EmbedBuilder()
                    .setTitle(`🖼️ ${user.username}'s Avatar`)
                    .setImage(avatarUrl)
                    .setColor('#FFB6C1');
                await message.channel.send({ embeds: [embed] });
                return `Avatar displayed!`;
            }
            // ---- MEMORY TOOLS ----
            case 'set_memory': {
                const db = require('./database');
                db.setMemory(args.slot, args.message);
                return `Done! I've saved that information to memory slot #${args.slot}. 🧠`;
            }
            case 'get_memory': {
                const db = require('./database');
                const mem = db.getMemory(args.slot);
                if (!mem) return `Memory slot #${args.slot} is currently empty. 🧊`;
                return `Here's what I remember in slot #${args.slot}:\n\n${mem}`;
            }
            case 'list_memory': {
                const db = require('./database');
                const all = db.getAllMemory();
                const keys = Object.keys(all);
                if (keys.length === 0) return `My long-term memory is currently empty. 🌱`;
                const list = keys.map(slot => `• **Slot ${slot}**: ${all[slot].substring(0, 50)}${all[slot].length > 50 ? '...' : ''}`).join('\n');
                return `Here are my stored memories:\n\n${list}`;
            }
            // ---- BRAIN MEMORY TOOLS ----
            case 'set_user_name': {
                const db = require('./database');
                db.updateUserProfile(message.author.id, { preferredName: args.name });
                return `Got it! I will remember to call you ${args.name}! ✨`;
            }
            case 'remember_fact': {
                const scopeId = args.scope === 'user' ? message.author.id : (args.scope === 'server' ? message.guild?.id : null);
                db.addBrainMemory(args.scope, scopeId, args.fact);
                if (args.scope === 'user') {
                    db.addUserFact(message.author.id, args.fact);
                }
                return `Successfully saved to ${args.scope} long-term memory! 🧠✨`;
            }
            case 'forget_fact': {
                const scopeId = args.scope === 'user' ? message.author.id : (args.scope === 'server' ? message.guild?.id : null);
                const deleted = db.deleteBrainMemoryByKeyword(args.scope, scopeId, args.keyword);
                if (args.scope === 'user') {
                    db.removeUserFact(message.author.id, args.keyword);
                }
                if (deleted.changes === 0) {
                    return `I couldn't find any memories in the ${args.scope} scope matching "${args.keyword}". 🧊`;
                }
                return `Successfully deleted ${deleted.changes} matching memories from ${args.scope} scope! 🗑️✨`;
            }
            case 'list_brain_memories': {
                if (args.scope === 'all') {
                    const userM = db.getBrainMemories('user', message.author.id);
                    const serverM = message.guild ? db.getBrainMemories('server', message.guild.id) : [];
                    const globalM = db.getBrainMemories('global', null);
                    
                    let out = "🧠 **My Stored Brain Memories:**\n\n";
                    if (globalM.length > 0) out += `**[Global]:**\n${globalM.map(m => `• ${m.content}`).join('\n')}\n\n`;
                    if (serverM.length > 0) out += `**[Server]:**\n${serverM.map(m => `• ${m.content}`).join('\n')}\n\n`;
                    if (userM.length > 0) out += `**[User (${message.author.username})]:**\n${userM.map(m => `• ${m.content}`).join('\n')}\n\n`;
                    
                    if (globalM.length === 0 && serverM.length === 0 && userM.length === 0) {
                        return "My brain is currently empty! 🌱";
                    }
                    return out.trim();
                } else {
                    const scopeId = args.scope === 'user' ? message.author.id : (args.scope === 'server' ? message.guild?.id : null);
                    const list = db.getBrainMemories(args.scope, scopeId);
                    if (list.length === 0) {
                        return `I have no memories stored in the ${args.scope} scope. 🌱`;
                    }
                    const scopeLabel = args.scope === 'user' ? `User (${message.author.username})` : (args.scope === 'server' ? 'Server' : 'Global');
                    return `🧠 **My Stored ${scopeLabel} Memories:**\n\n` + list.map(m => `• ${m.content}`).join('\n');
                }
            }
            // ---- WEBPAGE READER ----
            case 'fetch_webpage': {
                try {
                    const url = args.url;
                    const parsedUrl = new URL(url);
                    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
                        return "Error: Invalid protocol. Only http and https URLs can be read.";
                    }
                    
                    await message.channel.sendTyping();
                    
                    const response = await fetch(url, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
                        }
                    });
                    
                    if (!response.ok) {
                        return `Error: Failed to fetch webpage. Status code: ${response.status} ${response.statusText}`;
                    }
                    
                    const html = await response.text();
                    let cleaned = html
                        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
                        .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '')
                        .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
                        .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '')
                        .replace(/<\/h[1-6]>/gi, '\n\n')
                        .replace(/<\/p>/gi, '\n\n')
                        .replace(/<\/div>/gi, '\n')
                        .replace(/<\/li>/gi, '\n')
                        .replace(/<br\s*\/?>/gi, '\n')
                        .replace(/<[^>]+>/g, '')
                        .replace(/&nbsp;/g, ' ')
                        .replace(/&amp;/g, '&')
                        .replace(/&lt;/g, '<')
                        .replace(/&gt;/g, '>')
                        .replace(/&quot;/g, '"')
                        .replace(/&#39;/g, "'")
                        .replace(/[ \t]+/g, ' ')
                        .replace(/\n\s*\n+/g, '\n\n')
                        .trim();
                    
                    if (cleaned.length === 0) {
                        return "The webpage fetched successfully, but no readable text could be extracted.";
                    }
                    
                    if (cleaned.length > 4000) {
                        cleaned = cleaned.substring(0, 4000) + "\n\n[Content truncated due to length limits...]";
                    }
                    
                    return `--- Content of webpage <${url}> ---\n\n${cleaned}`;
                } catch (err) {
                    console.error("fetch_webpage error:", err);
                    return `Error reading webpage: ${err.message}`;
                }
            }
            // ---- USER TICKETS LOOKUP ----
            case 'get_user_tickets': {
                if (!message.guild) return `Error: This tool can only be used in a server.`;
                const userId = args.userId;
                const tickets = db.getUserTickets(userId, message.guild.id);
                
                if (tickets.length === 0) {
                    return `This user has not opened any tickets in this server.`;
                }
                
                const lines = tickets.map(t => {
                    const statusEmoji = t.status === 'open' ? '🟢' : '🔴';
                    const createdStr = new Date(t.createdAt).toLocaleDateString();
                    const claimant = t.claimantId ? `<@${t.claimantId}>` : 'Unclaimed';
                    const closedStr = t.closedAt ? ` (Closed: ${new Date(t.closedAt).toLocaleDateString()})` : '';
                    return `• ${statusEmoji} Channel: <#${t.channelId}> | Created: ${createdStr} | Staff: ${claimant}${closedStr} | Status: **${t.status}**`;
                });
                
                return `Tickets history for <@${userId}>:\n\n${lines.join('\n')}`;
            }
            // ---- USER PROFILE LOOKUP ----
            case 'lookup_discord_user': {
                try {
                    const user = await message.client.users.fetch(args.userId);
                    if (!user) return `I couldn't find a user with ID ${args.userId}.`;
                    
                    const member = message.guild ? await message.guild.members.fetch(args.userId).catch(() => null) : null;
                    const createdDate = new Date(user.createdTimestamp).toUTCString();
                    const joinedDate = member ? new Date(member.joinedTimestamp).toUTCString() : 'Not in server';
                    const rolesStr = member ? member.roles.cache.map(r => r.name).filter(n => n !== '@everyone').join(', ') || 'No roles' : 'N/A';
                    
                    let reply = `**User Profile Lookup for <@${user.id}>**:\n` +
                                  `• **Username**: ${user.tag}\n` +
                                  `• **ID**: ${user.id}\n` +
                                  `• **Bot?**: ${user.bot ? 'Yes' : 'No'}\n` +
                                  `• **Created Account**: ${createdDate}\n` +
                                  `• **Joined Server**: ${joinedDate}\n`;
                    if (member) {
                        reply += `• **Server Roles**: ${rolesStr}\n`;
                    }
                    return reply;
                } catch (err) {
                    return `Error looking up user profile: ${err.message}`;
                }
            }
            // ---- GUILD EMOJIS LIST ----
            case 'list_guild_emojis': {
                if (!message.guild) return `Error: This tool can only be used within a server.`;
                const emojis = message.guild.emojis.cache.map(e => `${e.name}: <${e.animated ? 'a' : ''}:${e.name}:${e.id}>`);
                if (emojis.length === 0) return `This server has no custom emojis.`;
                return `Here are the custom emojis available in this server:\n` + emojis.slice(0, 50).join('\n') + (emojis.length > 50 ? `\n*(and ${emojis.length - 50} more...)*` : '');
            }
            // ---- MUSIC TOOLS ----
            case 'music_play': {
                if (!message.guild) return 'Error: Music can only be played inside a Discord server.';
                const rawQuery = (args.query || '').trim();
                const playNow = Boolean(args.playNow);

                let targetVoiceChannel = message.member?.voice?.channel;
                const existingQueue = getQueue(message.guild.id);

                if (!targetVoiceChannel && existingQueue?.voiceChannel) {
                    targetVoiceChannel = existingQueue.voiceChannel;
                }

                if (!targetVoiceChannel) {
                    return 'User is not in any voice channel. Tell them: "Arre bhai pehle kisi voice channel mein aao tabhi toh gaana baja paunga! 🎧 Join a voice channel first!"';
                }

                const queue = createOrGetQueue(message.guild.id, targetVoiceChannel, message.channel);

                // If user said "play this song", "ye bajao ab", "skip karke ye bajao" without specifying a different title, and there is already an upcoming track in queue:
                const isGenericNextSong = !rawQuery || /^(this(\s+song)?|ye(\s+gana|\s+song)?|is(\s+ko)?|current|purana\s+wala)$/i.test(rawQuery);
                if (isGenericNextSong && queue.songs.length > 0) {
                    const skipped = queue.currentSong?.title || 'current song';
                    const nextSong = queue.songs[0];
                    queue.player.stop();
                    return `Skipped "${skipped}" and started playing "${nextSong.title}"${nextSong.artist ? ` by ${nextSong.artist}` : ''} immediately! 🔥`;
                }

                const query = isGenericNextSong && queue.songs.length > 0 ? queue.songs[0].title : (rawQuery || 'top hits');

                const permissions = targetVoiceChannel.permissionsFor(message.client.user);
                if (permissions && (!permissions.has(PermissionFlagsBits.Connect) || !permissions.has(PermissionFlagsBits.Speak))) {
                    return `Error: I don't have permissions to connect or speak in #${targetVoiceChannel.name}. Please grant Connect and Speak permissions.`;
                }

                const track = await searchTrack(query);
                if (!track) {
                    return `Could not find any song matching "${query}". Try another title or artist!`;
                }

                track.requestedBy = message.author;

                if (queue.isPlaying) {
                    if (playNow) {
                        // User requested to play this track immediately! Put at the top of queue and stop current playback to play right now
                        queue.songs.unshift(track);
                        const previousTitle = queue.currentSong?.title || 'current song';
                        queue.player.stop();
                        return `Immediately skipped "${previousTitle}" and started playing "${track.title}"${track.artist ? ` by ${track.artist}` : ""} in voice channel #${targetVoiceChannel.name}! 🔥`;
                    }

                    queue.songs.push(track);
                    const embed = new EmbedBuilder()
                        .setTitle("📋 Added to Queue")
                        .setDescription(`**[${track.title}](${track.url})**${track.artist ? `\n*${track.artist}*` : ""}`)
                        .addFields(
                            { name: "⏱️ Duration", value: track.duration || "Unknown", inline: true },
                            { name: "🔢 Position", value: `#${queue.songs.length}`, inline: true },
                            { name: "👤 Added By", value: `<@${message.author.id}>`, inline: true }
                        )
                        .setThumbnail(track.thumbnail || null)
                        .setColor("#00FF88");
                    message.channel.send({ embeds: [embed] }).catch(() => {});
                    return `Added "${track.title}"${track.artist ? ` by ${track.artist}` : ""} to the queue at position #${queue.songs.length}! (If the user wants to play it immediately right now, tell them you can skip to it with "skip kardo" or "ye abhi bajao")`;
                } else {
                    queue.songs.push(track);
                    await queue.playNext();
                    return `Now playing "${track.title}"${track.artist ? ` by ${track.artist}` : ""} in voice channel #${targetVoiceChannel.name}! 🔥`;
                }
            }
            case 'music_now_playing': {
                if (!message.guild) return 'Error: Music is only available inside a Discord server.';
                const queue = getQueue(message.guild.id);
                if (!queue || (!queue.currentSong && !queue.isPlaying)) {
                    return 'No music is currently playing in this server. Voice queue is empty.';
                }
                const s = queue.currentSong;
                const isPaused = queue.player.state.status === 'paused';
                return `Currently ${isPaused ? 'paused' : 'playing'}: "${s?.title || 'Unknown'}"${s?.artist ? ` by ${s.artist}` : ''} (Duration: ${s?.duration || 'Unknown'}) in #${queue.voiceChannel?.name || 'voice'}. Requested by @${s?.requestedBy?.username || 'user'}.`;
            }
            case 'music_pause': {
                if (!message.guild) return 'Error: Music is only available inside a Discord server.';
                const queue = getQueue(message.guild.id);
                if (!queue || (!queue.currentSong && !queue.isPlaying)) {
                    return 'No music is currently playing in this server to pause.';
                }
                if (queue.player.state.status === 'paused') {
                    return 'The music is already paused!';
                }
                queue.player.pause();
                return `Paused playback for "${queue.currentSong?.title || 'current song'}".`;
            }
            case 'music_resume': {
                if (!message.guild) return 'Error: Music is only available inside a Discord server.';
                const queue = getQueue(message.guild.id);
                if (!queue || (!queue.currentSong && !queue.isPlaying)) {
                    return 'No paused music found to resume.';
                }
                if (queue.player.state.status !== 'paused') {
                    return 'Music is already playing, not paused.';
                }
                queue.player.unpause();
                return `Resumed playback for "${queue.currentSong?.title || 'current song'}".`;
            }
            case 'music_skip': {
                if (!message.guild) return 'Error: Music is only available inside a Discord server.';
                const queue = getQueue(message.guild.id);
                if (!queue || (!queue.currentSong && !queue.isPlaying)) {
                    return 'No song is currently playing to skip.';
                }
                const skippedTitle = queue.currentSong?.title || 'current song';
                queue.player.stop();
                return `Skipped "${skippedTitle}". Playing next track in queue.`;
            }
            case 'music_stop': {
                if (!message.guild) return 'Error: Music is only available inside a Discord server.';
                const queue = getQueue(message.guild.id);
                if (!queue || (!queue.currentSong && !queue.isPlaying)) {
                    return 'No active music playback to stop.';
                }
                queue.destroy();
                return 'Stopped music, cleared the queue, and disconnected from the voice channel.';
            }
            case 'music_queue': {
                if (!message.guild) return 'Error: Music is only available inside a Discord server.';
                const queue = getQueue(message.guild.id);
                if (!queue || (!queue.currentSong && queue.songs.length === 0)) {
                    return 'The music queue is currently empty.';
                }
                const current = queue.currentSong;
                const upcoming = queue.songs;
                let text = `Current: "${current?.title || 'None'}"${current?.artist ? ` by ${current.artist}` : ''} (${current?.duration || '?'})\n`;
                if (upcoming.length === 0) {
                    text += 'No upcoming songs in queue.';
                } else {
                    text += `Upcoming (${upcoming.length}):\n` + upcoming.slice(0, 5).map((t, i) => `${i + 1}. "${t.title}" (${t.duration || '?'})`).join('\n');
                }
                return text;
            }
            default:
                return `I tried to use a tool but didn't recognize it.`;
        }
    } catch (err) {
        console.error(`[Tool execution failed: ${tName}]`, err);
        return `I tried to run an action but hit an error! Make sure I have Administrator permissions. 🧊`;
    }
}

module.exports = {
    aiToolDefinitions,
    executeTool
};
