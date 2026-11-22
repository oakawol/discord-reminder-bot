/**
 * commands/fun/roast.js
 * Generates witty, hilarious desi Hinglish roasts.
 */
const { EmbedBuilder } = require("discord.js");

const FALLBACK_ROASTS = {
  savage: [
    "Bhai ka confidence dekho jaise 1 GB RAM wale phone mein GTA V chalane ki koshish kar raha ho 😂💀",
    "Teri baaton mein utna hi wazan hai jitna Lays ke packet mein chips ka hota hai—sirf hawa! 💨😂",
    "Bhai tu jab bolta hai na, background mein automatically clown music bajne lagta hai 🤡💀",
    "Tera IQ dekh ke lagta hai ki school mein attendence bhi proxy se lagti thi aur dimaag bhi proxy pe hi chhod aaya! 😭🔥",
    "Aapki profile dekh ke lagta hai ki aap bhagwan ka rough draft the jo galti se publish ho gaya! 💀🚀",
    "Bhai tu itna slow hai ki agar race lagaye toh 2G network bhi tujhse aage nikal jaye! 😂🐢",
    "Tujhe dekh ke lagta hai ki smartness tera peecha karti rahi, par tu hamesha usse tez bhaag gaya! 🏃‍♂️💨",
    "Tera opinion maangne kisne bola tha? Google pe bhi koi aisi cheez search nahi karta jitna tu fokat ka gyaan deta hai! 💀🔥"
  ],
  college: [
    "Bhai tu hostel ke us mess ke daal jaisa hai jisme sirf paani aur haldi dikhti hai, koi substance nahi! 🍲💀",
    "Attendance 65% se upar nahi aati aur akad aisi hai jaise placement drive ka CEO yahi ho! 😂🎓",
    "Exam se ek raat pehle syllabus dekh ke bolta hai 'Bhai bas pass karwa de', aur yaha server pe sher ban raha hai! 🦁💀",
    "Assignment copy karne mein bhi jo banda doosre ka naam copy kar le, wo tu hi lagta hai bhai! 😂📄"
  ],
  gaming: [
    "Bhai tere aim ko dekh ke stormtroopers bhi bolte hain: 'Arey humse bhi bura koi hai duniya mein!' 🎯💀",
    "Valorant mein bottom frag karke bolta hai 'Bhai mouse ka DPI set nahi tha'. Abey haath ka setting kharab hai tera! 😂🎮",
    "Free Fire ke bots bhi tere se better clutch kar lete hain yaar! 💀🔥",
    "Respawn hone se zyada time tu spectator mode mein bitaata hai, gaming chhod commentary shuru kar le! 🎙️😂"
  ]
};

module.exports = {
  name: "roast",
  description: "Cook someone with a savage, witty desi Hinglish roast! 🔥",
  options: [
    {
      name: "user",
      description: "The user you want to roast",
      type: 6,
      required: true,
    },
    {
      name: "style",
      description: "Roast flavour / style",
      type: 3,
      required: false,
      choices: [
        { name: "🔥 Savage Desi (Full Tabahi)", value: "savage" },
        { name: "🎓 College & Hostel Vibe", value: "college" },
        { name: "🎮 Gaming Noob", value: "gaming" },
      ],
    },
  ],

  async execute(interaction) {
    const targetUser = interaction.options.getUser("user");
    const style = interaction.options.getString("style") || "savage";
    const author = interaction.user;

    if (targetUser.id === interaction.client.user.id) {
      return interaction.reply({
        content: "Arre bhai! Bot ko roast karne chala hai? Mere circuits itne sharp hain ki tera motherboard pighal jayega 😂🔥",
      });
    }

    if (targetUser.id === author.id) {
      return interaction.reply({
        content: "Khud ko roast kar raha hai bhai? Itna self-damage toh COD ke grenade se bhi nahi hota! 😂💀",
      });
    }

    // Try AI generation if configured
    let roastText = "";
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
                  "You are Oakawol Bot, an Indian Discord server homie. Write a short, punchy, hilarious, and savage roast of a friend in natural Hinglish with expressive emojis (🔥, 💀, 😂, 😭). Keep it lighthearted Discord server banter (no hate speech, no slurs, no NSFW). Do NOT use bullet points or dashes (-). 2 to 3 sentences max.",
              },
              {
                role: "user",
                content: `Roast @${targetUser.username} in "${style}" style. Mention them humorously.`,
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
            if (raw.length > 20) roastText = raw;
          }
        }
      } catch (err) {
        // Fallback to presets
      }
    }

    if (!roastText) {
      const list = FALLBACK_ROASTS[style] || FALLBACK_ROASTS.savage;
      const pick = list[Math.floor(Math.random() * list.length)];
      roastText = `<@${targetUser.id}>, ${pick}`;
    }

    const embed = new EmbedBuilder()
      .setTitle("🔥 Roasted & Cooked!")
      .setDescription(roastText)
      .setFooter({ text: `Cooked by ${author.username} • Call the fire brigade 🚒` })
      .setColor("#FF4500");

    return interaction.reply({
      content: `<@${targetUser.id}> bhai ke liye fresh roast hazir hai:`,
      embeds: [embed],
    });
  },
};
