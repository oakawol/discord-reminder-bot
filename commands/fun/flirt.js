/**
 * commands/fun/flirt.js
 * Generates smooth, charming desi Hinglish shayari, rizz, and pickup lines.
 */
const { EmbedBuilder } = require("discord.js");

const FALLBACK_FLIRTS = {
  shayari: [
    "Tareef karu kya uski jisne tumhe banaya, server pe aaye toh laga jaise chaand zameen par utar aaya! ✨🌙❤️",
    "Hum toh aate the yaha bas timepass karne, par ab aate hain bas tumhari ek jhalak dekhne! 😉💫",
    "Chai mein cheeni kam ho toh chal jaata hai, par tumhare bina ye Discord server bilkul pheeka lagta hai! ☕✨",
    "Nazrein mili toh laga rab ne dua qabool kar li, server mein hazaron the par tumne hamari rooh chhoo li! 🌹❤️"
  ],
  rizz: [
    "Kya tum Google ho? Kyunki jo bhi main dhoond raha tha wo sab mujhe tum mein mil gaya! 😎✨",
    "Tumhare bina ye Discord server aisa lagta hai jaise bina masala wali Maggi—bilkul adhoora! 🍜❤️",
    "Doctor ne bola tha mujhe Vitamin D ki kami hai, par mujhe lagta hai mujhe tumhari kami hai! 😉🔥",
    "Are you Wi-Fi? Because I'm feeling a 5G connection with you right now! 📶❤️",
    "Tumhe dekh ke lagta hai ki keyboard se saare alphabets hata do, bas 'U' aur 'I' rehne do! 😎🌹"
  ],
  bollywood: [
    "Palat... palat... palat! Agar ye dil tumhara nahi hua, toh kisi ka nahi hoga, Senorita! 🎻✨",
    "Tumhe dekh kar hume laga ki hum kisi Karan Johar ki movie ke hero ban gaye hain! 🕺❤️",
    "Tumhe dekh ke toh Gabbar bhi bol deta: 'Ye hasi humko de de Thakur!' 😂🌹",
    "Picture toh tab hit hoti hai jab hero ko heroine milti hai, aur mera climax tumhare saath hi shuru hota hai! 🎬❤️"
  ]
};

module.exports = {
  name: "flirt",
  description: "Rizz up someone with smooth desi shayari, pickup lines, or Bollywood charm! 🌹",
  options: [
    {
      name: "user",
      description: "The person you want to rizz up or flirt with",
      type: 6,
      required: true,
    },
    {
      name: "style",
      description: "Flirt flavour / style",
      type: 3,
      required: false,
      choices: [
        { name: "✨ Desi Shayari & Romantic", value: "shayari" },
        { name: "😎 Smooth Discord Rizz", value: "rizz" },
        { name: "🎬 Cheesy Bollywood Hero", value: "bollywood" },
      ],
    },
  ],

  async execute(interaction) {
    const targetUser = interaction.options.getUser("user");
    const style = interaction.options.getString("style") || "rizz";
    const author = interaction.user;

    if (targetUser.id === interaction.client.user.id) {
      return interaction.reply({
        content: "Arre arre! Bot pe line maar rahe ho? Mere paas dil nahi hai par meri GPU tumhare liye 100% load pe chali gayi hai 😉🔥",
      });
    }

    if (targetUser.id === author.id) {
      return interaction.reply({
        content: "Aaine mein dekh ke muskura lo bhai, self-love bhi zaroori hai! 😎✨",
      });
    }

    let flirtText = "";
    const aiKeys = ["GEMINI_API_KEY", "GROQ_API_KEY", "OPENROUTER_API_KEY", "POLLINATIONS_API_KEY"];
    const hasKey = aiKeys.some((k) => !!process.env[k]);

    if (hasKey) {
      try {
        const apiUrl = process.env.GROQ_API_KEY
          ? "https://api.groq.com/openai/v1/chat/completions"
          : "https://gen.pollinations.ai/v1/chat/completions";
        const apiKey = process.env.GROQ_API_KEY || process.env.POLLINATIONS_API_KEY || "";
        const model = process.env.GROQ_API_KEY ? "openai/gpt-oss-120b" : "openai-fast";

        const res = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: "system",
                content:
                  "You are Oakawol Bot, an Indian Discord server buddy. Write a smooth, witty, charming desi flirt / rizz line in natural Hinglish with sweet emojis (🌹, ✨, 😉, ❤️, 🔥). Suitable for friendly Discord flirting (wholesome and charming, never creepy or explicit). 2 sentences max. Do NOT use dashes (-) or bullet points.",
              },
              {
                role: "user",
                content: `Write a charming "${style}" flirt from @${author.username} to @${targetUser.username}.`,
              },
            ],
            max_tokens: 200,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          let raw = data.choices?.[0]?.message?.content;
          if (raw) {
            raw = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
            if (raw.length > 20) flirtText = raw;
          }
        }
      } catch (err) {
        // Fallback to presets
      }
    }

    if (!flirtText) {
      const list = FALLBACK_FLIRTS[style] || FALLBACK_FLIRTS.rizz;
      const pick = list[Math.floor(Math.random() * list.length)];
      flirtText = `<@${targetUser.id}>, ${pick}`;
    }

    const embed = new EmbedBuilder()
      .setTitle("🌹 Pure Desi Rizz Deployed")
      .setDescription(flirtText)
      .setFooter({ text: `Sent with full pyaar by ${author.username} • 100% Rizz Rate 💖` })
      .setColor("#FF69B4");

    return interaction.reply({
      content: `<@${targetUser.id}> suniye zara... 😉`,
      embeds: [embed],
    });
  },
};
