/**
 * commands/tickets/category.js
 */
const db = require("../../utils/database");
const { categoryListEmbed, errorEmbed, successEmbed } = require("../../utils/embeds");

module.exports = {
  name: "category",
  description: "Create, list, or delete ticket categories.",
  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    if (sub === "create") {
      const name     = interaction.options.getString("name");
      const emoji    = interaction.options.getString("emoji");
      const category = interaction.options.getChannel("category");
      const role     = interaction.options.getRole("support_role");
      const id       = Math.random().toString(36).slice(2, 9);

      db.createCategory({
        id,
        guildId:    interaction.guildId,
        name,
        emoji,
        roles:      role ? [role.id] : [],
        categoryId: category.id,
        maxTickets: 1,
        questions:  [],
      });

      return interaction.reply({
        embeds: [successEmbed("Category created", `**${emoji} ${name}** is ready.\nUse \`/panel create\` to add it to a ticket panel.`)],
        ephemeral: true,
      });
    }

    if (sub === "list") {
      const categories = db.getCategories(interaction.guildId);
      if (categories.length === 0) {
        return interaction.reply({
          embeds: [errorEmbed("No ticket categories yet. Create one with `/category create`.")],
          ephemeral: true,
        });
      }
      return interaction.reply({ embeds: [categoryListEmbed(categories)], ephemeral: true });
    }

    if (sub === "delete") {
      const id       = interaction.options.getString("id");
      const category = db.getCategory(id);

      if (!category || category.guildId !== interaction.guildId) {
        return interaction.reply({
          embeds: [errorEmbed("Category not found. Use `/category list` to see valid IDs.")],
          ephemeral: true,
        });
      }

      db.deleteCategory(id);
      return interaction.reply({
        embeds: [successEmbed("Category deleted", `**${category.name}** has been removed.`)],
        ephemeral: true,
      });
    }
  },

  async autocomplete(interaction) {
    const focused    = interaction.options.getFocused();
    const categories = db.getCategories(interaction.guildId);
    const filtered   = categories.filter(
      (c) =>
        c.name.toLowerCase().includes(focused.toLowerCase()) ||
        c.id.toLowerCase().includes(focused.toLowerCase())
    );
    await interaction.respond(
      filtered.slice(0, 25).map((c) => ({ name: `${c.emoji} ${c.name}`, value: c.id }))
    );
  },
};
