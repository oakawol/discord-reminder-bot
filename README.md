# 🤖 Oakawol Bot

A versatile, easy-to-use Discord bot featuring AI chat, server economy, support tickets, and reminders.

---

## ✨ Features

### 🤖 AI Chat
Chat naturally with the bot by mentioning it or sending it a Direct Message.
- **Smart Actions**: The bot can run built-in commands when asked (for example, checking balances, adding coins, or scheduling reminders).
- **Web Search & Tools**: Real-time Google search, weather lookups, Reddit browsing, translations, and more.
- **Memory**: Remembers details about users and servers across conversations.
- **Admin Security**: Sensitive actions (moderation, balance changes, server management) require administrator permissions.

### 💰 Economy System
Track coins and manage a server-wide economy.
- **Check Balance**: Use `/balance` to see your coins, ranking, and server top 3.
- **Transaction History**: Use `/history` to review recent additions or deductions.
- **Admin Controls**: Add or remove coins using `/add_money` and `/remove_money`.

### 💳 UPI & QR Payments
Save and look up user UPI IDs and QR code images.
- **Save Details**: Admins can use `/upi set` to save a user's UPI ID and upload their QR code.
- **Look Up Details**: Anyone can use `/upi get` to quickly look up payment information.
- **Manage**: Admins can list or delete saved payment details with `/upi list` and `/upi delete`.

### 🎫 Support Ticket System
Organized support channels for your server.
- **Ticket Categories**: Create departments (Support, Questions, etc.) with `/category create`.
- **Panels**: Post an interactive button panel in any channel using `/panel create`.
- **Transcripts**: Automatically saves an HTML transcript when a ticket is closed with `/close`.
- **User Management**: Add or remove members from tickets with interactive menus.

### ⏰ Reminders, Tasks & Cooldowns
Keep track of time with automated pings and DMs.
- **Reminders**: Schedule a reminder using `/remind` (for example, `10m`, `2h`, `1d`).
- **Cooldowns**: Set a task cooldown for a member with `/cd`.
- **Remove Cooldowns**: Admins can end an active cooldown early with `/remove_cd`.
- **Task Ping**: Admins can assign a task using `/taskping user:@username task:<task>` (or `!taskping @username <task>`). The bot pings the user every 30 minutes until they reply in that channel.

### 🎨 Fun & Utilities
- **AI Art**: Generate images from text prompts using `/imagine`.
- **Send Text**: Admins can send a message through the bot using `/text`.
- **Memory Slots**: Admins can save and retrieve custom messages with `/memory`.

---

## 🛠️ Setup Instructions

### 1. Discord Developer Portal
1. Go to the [Discord Developer Portal](https://discord.com/developers/applications).
2. Create an application and add a bot.
3. Under the **Bot** tab, enable **Message Content Intent**, **Server Members Intent**, and **Presence Intent**.
4. Copy your **Bot Token** and **Client ID**.

### 2. Configuration (`.env`)
Create a `.env` file in the root directory:
```env
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_client_id_here
GUILD_ID=your_server_id_here  # Optional: For instant command registration on your server
GROQ_API_KEY=your_groq_api_key_here # For AI chat features (https://console.groq.com)
```

### 3. Installation & Running
```bash
# Install dependencies
npm install

# Register slash commands
npm run deploy

# Start the bot
npm start
```

---

## 📋 Slash Commands List

### ⏰ Reminders & Cooldowns
| Command | Description |
| :--- | :--- |
| `/remind` | Set a reminder for yourself or someone else |
| `/cd` | Set a cooldown timer for a user |
| `/remove_cd` | Remove a user's active cooldown (Admin Only) |
| `/verify` | Manually verify a link in the channel (Admin Only) |
| `Verify Link` | (Right-click message context menu) Verify a link (Admin Only) |

### 💰 Economy & UPI
| Command | Description |
| :--- | :--- |
| `/balance` | Check your own or another user's balance and ranking |
| `/add_money` | Add money to a user's balance (Admin Only) |
| `/remove_money` | Remove money from a user's balance (Admin Only) |
| `/history` | View recent transaction history |
| `/upi` | Save, look up, list, or delete UPI details |

### 🎫 Tickets (Admin Only)
| Command | Description |
| :--- | :--- |
| `/setup` | Configure ticket log and transcript channels |
| `/category create` | Create a new ticket category |
| `/category list` | View all ticket categories |
| `/category delete` | Delete a ticket category |
| `/panel create` | Send a ticket panel with buttons to a channel |
| `/close` | Close the current ticket and save a transcript |

### 🎨 Fun & Tools
| Command | Description |
| :--- | :--- |
| `/imagine` | Generate an image from a prompt |
| `/text` | Send a message as the bot (Admin Only) |
| `/memory` | Save, get, or list memory slot messages (Admin Only) |
