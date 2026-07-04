require('dotenv').config();
const {
  Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder,
  ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits
} = require('discord.js');
const fs = require('fs');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

// ─── VOITURES PAR CATÉGORIE ───────────────────────────────────────────────────
const CATEGORIES_VOITURES = {
  'Hypercar': [
    'Alpine A424', 'Aston Martin Valkyrie', 'BMW M Hybrid V8',
    'Cadillac V-Series.R', 'Ferrari 499P', 'Glickenhaus 007',
    'Isotta Fraschini Tipo6', 'Lamborghini SC63', 'Peugeot 9X8',
    'Porsche 963', 'Toyota GR010', 'Vanwall Vandervell 680'
  ],
  'LMP2': ['Oreca 07'],
  'LMP3': ['Ligier JS P320'],
  'LMGT3': [
    'Aston Martin Vantage GT3', 'BMW M4 GT3', 'Chevrolet Corvette Z06 GT3.R',
    'Ferrari 296 GT3', 'Lamborghini Huracán GT3 EVO2', 'Lexus RC F GT3',
    'McLaren 720S GT3 EVO', 'Mercedes-AMG GT3', 'Ford Mustang GT3', 'Porsche 911 GT3 R'
  ],
};

const DISPONIBILITES_OPTIONS = [
  { label: '🌅 Vendredi 9h00',   value: 'Vendredi 9h00'   },
  { label: '🌇 Vendredi 16h00',  value: 'Vendredi 16h00'  },
  { label: '🌙 Vendredi 22h00',  value: 'Vendredi 22h00'  },
  { label: '🌅 Samedi 9h00',     value: 'Samedi 9h00'     },
  { label: '🌇 Samedi 16h00',    value: 'Samedi 16h00'    },
  { label: '🌙 Samedi 22h00',    value: 'Samedi 22h00'    },
  { label: '🌅 Dimanche 9h00',   value: 'Dimanche 9h00'   },
  { label: '🌇 Dimanche 16h00',  value: 'Dimanche 16h00'  },
];

// ─── DATA STORE ───────────────────────────────────────────────────────────────
const DATA_FILE = './data.json';

function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ events: {}, registrations: {} }, null, 2));
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ─── COULEURS KRONOS ──────────────────────────────────────────────────────────
const COLOR_MAIN    = 0xC0392B; // Rouge Kronos
const COLOR_SUCCESS = 0x27AE60;
const COLOR_ADMIN   = 0xF39C12;
const COLOR_INFO    = 0x2C3E50;

// ─── SLASH COMMANDS ───────────────────────────────────────────────────────────
const commands = [
  // ADMIN
  new SlashCommandBuilder()
    .setName('kronos-event')
    .setDescription('🔧 [Admin] Créer un événement de la semaine')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents)
    .addStringOption(o => o.setName('nom').setDescription('Nom de la course (ex: 24H du Mans WEC 2024)').setRequired(true))
    .addStringOption(o => o.setName('date').setDescription('Date (ex: 22-23 Juin 2024)').setRequired(true))
    .addStringOption(o => o.setName('heure').setDescription('Heure de départ (ex: Samedi 20h00)').setRequired(true))
    .addStringOption(o => o.setName('circuit').setDescription('Circuit (ex: Circuit de la Sarthe)').setRequired(true))
    .addStringOption(o => o.setName('duree').setDescription('Durée (ex: 24 heures)').setRequired(true))
    .addStringOption(o => o.setName('deadline').setDescription('Date limite d\'inscription (ex: Vendredi 18h00)').setRequired(true)),

  new SlashCommandBuilder()
    .setName('kronos-voir')
    .setDescription('📋 [Admin] Voir les inscriptions d\'un événement')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents)
    .addStringOption(o => o.setName('event_id').setDescription('ID de l\'événement').setRequired(true)),

  new SlashCommandBuilder()
    .setName('kronos-exporter')
    .setDescription('📊 [Admin] Exporter les inscriptions')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents)
    .addStringOption(o => o.setName('event_id').setDescription('ID de l\'événement').setRequired(true)),

  new SlashCommandBuilder()
    .setName('kronos-fermer')
    .setDescription('🔒 [Admin] Fermer les inscriptions d\'un événement')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents)
    .addStringOption(o => o.setName('event_id').setDescription('ID de l\'événement').setRequired(true)),

  new SlashCommandBuilder()
    .setName('kronos-supprimer')
    .setDescription('🗑️ [Admin] Supprimer un événement')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageEvents)
    .addStringOption(o => o.setName('event_id').setDescription('ID de l\'événement').setRequired(true)),

  // PILOTES
  new SlashCommandBuilder()
    .setName('events')
    .setDescription('🏁 Voir les courses ouvertes à l\'inscription'),

  new SlashCommandBuilder()
    .setName('inscrire')
    .setDescription('🏎️ S\'inscrire à une course Kronos'),

  new SlashCommandBuilder()
    .setName('mon-profil')
    .setDescription('👤 Voir mes inscriptions en cours'),

  new SlashCommandBuilder()
    .setName('desinscrire')
    .setDescription('❌ Annuler une inscription')
    .addStringOption(o => o.setName('event_id').setDescription('ID de l\'événement').setRequired(true)),
];

// ─── BOT READY ────────────────────────────────────────────────────────────────
client.once('ready', async () => {
  console.log(`\n🏁 ========================================`);
  console.log(`   KRONOS Racing Bot — ${client.user.tag}`);
  console.log(`🏁 ========================================\n`);
  await client.application.commands.set(commands);
  console.log('✅ Commandes slash enregistrées\n');
});

// ─── ROUTER INTERACTIONS ──────────────────────────────────────────────────────
client.on('interactionCreate', async interaction => {
  try {
    if (interaction.isChatInputCommand())   await handleCommand(interaction);
    else if (interaction.isStringSelectMenu()) await handleSelect(interaction);
    else if (interaction.isButton())           await handleButton(interaction);
    else if (interaction.isModalSubmit())      await handleModal(interaction);
  } catch (err) {
    console.error('Erreur:', err);
    const reply = { content: '❌ Une erreur est survenue. Contacte un admin.', ephemeral: true };
    if (interaction.replied || interaction.deferred) await interaction.followUp(reply).catch(() => {});
    else await interaction.reply(reply).catch(() => {});
  }
});

// ─── COMMANDS ─────────────────────────────────────────────────────────────────
async function handleCommand(interaction) {
  const data = loadData();

  // ╔══════════════════════════════╗
  // ║   /kronos-event              ║
  // ╚══════════════════════════════╝
  if (interaction.commandName === 'kronos-event') {
    const nom      = interaction.options.getString('nom');
    const date     = interaction.options.getString('date');
    const heure    = interaction.options.getString('heure');
    const circuit  = interaction.options.getString('circuit');
    const duree    = interaction.options.getString('duree');
    const deadline = interaction.options.getString('deadline');

    const eventId = `evt_${Date.now()}`;
    data.events[eventId] = {
      id: eventId, nom, date, heure, circuit, duree, deadline,
      ouvert: true,
      creePar: interaction.user.id,
      creeAt: new Date().toISOString()
    };
    saveData(data);

    const embed = new EmbedBuilder()
      .setColor(COLOR_ADMIN)
      .setTitle('✅ Événement Kronos créé')
      .setThumbnail('https://i.imgur.com/4M34hi2.png')
      .addFields(
        { name: '🏁 Course', value: nom, inline: false },
        { name: '📅 Date', value: date, inline: true },
        { name: '⏰ Départ', value: heure, inline: true },
        { name: '🏟️ Circuit', value: circuit, inline: true },
        { name: '⏱️ Durée', value: duree, inline: true },
        { name: '📌 Deadline inscription', value: deadline, inline: true },
        { name: '🔑 ID Événement', value: `\`${eventId}\``, inline: false },
      )
      .setFooter({ text: 'Kronos Racing • Les pilotes peuvent s\'inscrire avec /inscrire' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }

  // ╔══════════════════════════════╗
  // ║   /kronos-voir               ║
  // ╚══════════════════════════════╝
  else if (interaction.commandName === 'kronos-voir') {
    const eventId = interaction.options.getString('event_id');
    const evt = data.events[eventId];
    if (!evt) return interaction.reply({ content: '❌ Événement introuvable.', ephemeral: true });

    const regs = Object.values(data.registrations).filter(r => r.eventId === eventId);
    if (regs.length === 0) {
      return interaction.reply({ content: `📭 Aucune inscription pour **${evt.nom}** pour l'instant.`, ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setColor(COLOR_ADMIN)
      .setTitle(`📋 Inscriptions — ${evt.nom}`)
      .setDescription(`📅 ${evt.date} | ⏰ ${evt.heure} | 🏟️ ${evt.circuit}\n👥 **${regs.length} pilote(s) inscrit(s)**`)
      .setFooter({ text: 'Kronos Racing' })
      .setTimestamp();

    // Grouper par catégorie
    const byCat = {};
    for (const reg of regs) {
      if (!byCat[reg.categorie]) byCat[reg.categorie] = [];
      byCat[reg.categorie].push(reg);
    }

    const catOrder = ['Hypercar', 'LMP2', 'LMP3', 'LMGT3'];
    for (const cat of catOrder) {
      if (!byCat[cat]) continue;
      const lines = byCat[cat].map(p =>
        `• **${p.pseudo}** — ${p.voiture}\n  🕐 ${p.disponibilites.join(' · ')}`
      );
      embed.addFields({ name: `🏆 ${cat} — ${byCat[cat].length} pilote(s)`, value: lines.join('\n'), inline: false });
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // ╔══════════════════════════════╗
  // ║   /kronos-exporter           ║
  // ╚══════════════════════════════╝
  else if (interaction.commandName === 'kronos-exporter') {
    const eventId = interaction.options.getString('event_id');
    const evt = data.events[eventId];
    if (!evt) return interaction.reply({ content: '❌ Événement introuvable.', ephemeral: true });

    const regs = Object.values(data.registrations).filter(r => r.eventId === eventId);

    const line = '═'.repeat(50);
    let txt = `${line}\n  KRONOS RACING — INSCRIPTIONS\n${line}\n`;
    txt += `  Course  : ${evt.nom}\n`;
    txt += `  Date    : ${evt.date}\n`;
    txt += `  Départ  : ${evt.heure}\n`;
    txt += `  Circuit : ${evt.circuit}\n`;
    txt += `  Durée   : ${evt.duree}\n`;
    txt += `  Pilotes : ${regs.length}\n`;
    txt += `${line}\n\n`;

    const byCat = {};
    for (const reg of regs) {
      if (!byCat[reg.categorie]) byCat[reg.categorie] = [];
      byCat[reg.categorie].push(reg);
    }

    for (const [cat, pilotes] of Object.entries(byCat)) {
      txt += `▶ ${cat} (${pilotes.length} pilote(s))\n${'─'.repeat(40)}\n`;
      for (const p of pilotes) {
        txt += `  Pilote       : ${p.pseudo}\n`;
        txt += `  Voiture      : ${p.voiture}\n`;
        txt += `  Disponible   : ${p.disponibilites.join(', ')}\n`;
        txt += '\n';
      }
      txt += '\n';
    }

    txt += `${line}\n  Exporté le ${new Date().toLocaleString('fr-FR')}\n${line}`;

    const buffer = Buffer.from(txt, 'utf8');
    await interaction.reply({
      content: `📊 Export **${evt.nom}** — ${regs.length} pilote(s)`,
      files: [{ attachment: buffer, name: `Kronos_${evt.nom.replace(/\s/g,'_')}_inscriptions.txt` }],
      ephemeral: true
    });
  }

  // ╔══════════════════════════════╗
  // ║   /kronos-fermer             ║
  // ╚══════════════════════════════╝
  else if (interaction.commandName === 'kronos-fermer') {
    const eventId = interaction.options.getString('event_id');
    const evt = data.events[eventId];
    if (!evt) return interaction.reply({ content: '❌ Événement introuvable.', ephemeral: true });

    data.events[eventId].ouvert = false;
    saveData(data);
    await interaction.reply({ content: `🔒 Les inscriptions pour **${evt.nom}** sont maintenant **fermées**.`, ephemeral: true });
  }

  // ╔══════════════════════════════╗
  // ║   /kronos-supprimer          ║
  // ╚══════════════════════════════╝
  else if (interaction.commandName === 'kronos-supprimer') {
    const eventId = interaction.options.getString('event_id');
    const evt = data.events[eventId];
    if (!evt) return interaction.reply({ content: '❌ Événement introuvable.', ephemeral: true });

    delete data.events[eventId];
    for (const [key, reg] of Object.entries(data.registrations)) {
      if (reg.eventId === eventId) delete data.registrations[key];
    }
    saveData(data);
    await interaction.reply({ content: `🗑️ Événement **${evt.nom}** supprimé avec toutes ses inscriptions.`, ephemeral: true });
  }

  // ╔══════════════════════════════╗
  // ║   /events                    ║
  // ╚══════════════════════════════╝
  else if (interaction.commandName === 'events') {
    const events = Object.values(data.events).filter(e => e.ouvert);
    if (events.length === 0) {
      return interaction.reply({
        embeds: [new EmbedBuilder()
          .setColor(COLOR_INFO)
          .setTitle('🏁 Kronos Racing')
          .setDescription('Aucune course ouverte à l\'inscription pour le moment.\nReviens bientôt !')
          .setFooter({ text: 'Kronos Racing' })],
        ephemeral: true
      });
    }

    const embed = new EmbedBuilder()
      .setColor(COLOR_MAIN)
      .setTitle('🏁 Kronos Racing — Courses ouvertes')
      .setDescription('Utilise `/inscrire` pour t\'engager sur une course.')
      .setFooter({ text: 'Kronos Racing' })
      .setTimestamp();

    for (const evt of events) {
      const regs = Object.values(data.registrations).filter(r => r.eventId === evt.id);
      embed.addFields({
        name: `🏎️ ${evt.nom}`,
        value: `📅 ${evt.date} | ⏰ ${evt.heure}\n🏟️ ${evt.circuit} | ⏱️ ${evt.duree}\n📌 Deadline : ${evt.deadline}\n👥 ${regs.length} inscrit(s) | 🔑 \`${evt.id}\``,
        inline: false
      });
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // ╔══════════════════════════════╗
  // ║   /inscrire                  ║
  // ╚══════════════════════════════╝
  else if (interaction.commandName === 'inscrire') {
    const events = Object.values(data.events).filter(e => e.ouvert);
    if (events.length === 0) {
      return interaction.reply({ content: '📭 Aucune course ouverte à l\'inscription pour le moment.', ephemeral: true });
    }

    // Si un seul événement, on saute l'étape de sélection
    if (events.length === 1) {
      const evt = events[0];
      return await showCategorieStep(interaction, evt, true);
    }

    const select = new StringSelectMenuBuilder()
      .setCustomId('kronos_select_event')
      .setPlaceholder('Choisir la course...')
      .addOptions(events.map(e => ({
        label: e.nom.substring(0, 100),
        description: `${e.date} | ${e.circuit}`.substring(0, 100),
        value: e.id
      })));

    const embed = new EmbedBuilder()
      .setColor(COLOR_MAIN)
      .setTitle('🏁 Inscription Kronos — Étape 1/4')
      .setDescription('Sélectionne la course pour laquelle tu souhaites t\'inscrire.')
      .setFooter({ text: 'Kronos Racing' });

    await interaction.reply({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(select)],
      ephemeral: true
    });
  }

  // ╔══════════════════════════════╗
  // ║   /mon-profil                ║
  // ╚══════════════════════════════╝
  else if (interaction.commandName === 'mon-profil') {
    const myRegs = Object.values(data.registrations).filter(r => r.userId === interaction.user.id);
    if (myRegs.length === 0) {
      return interaction.reply({ content: '📭 Tu n\'as aucune inscription en cours.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setColor(COLOR_MAIN)
      .setTitle('👤 Mon Profil Pilote — Kronos Racing')
      .setFooter({ text: 'Kronos Racing' })
      .setTimestamp();

    for (const reg of myRegs) {
      const evt = data.events[reg.eventId];
      const evtName = evt ? `${evt.nom} — ${evt.date}` : '(event supprimé)';
      embed.addFields({
        name: `🏎️ ${evtName}`,
        value: `🏆 **${reg.categorie}** | 🚗 ${reg.voiture}\n🕐 ${reg.disponibilites.join(' · ')}\n🔑 \`${reg.eventId}\``,
        inline: false
      });
    }

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // ╔══════════════════════════════╗
  // ║   /desinscrire               ║
  // ╚══════════════════════════════╝
  else if (interaction.commandName === 'desinscrire') {
    const eventId = interaction.options.getString('event_id');
    const regKey = `${interaction.user.id}_${eventId}`;
    if (!data.registrations[regKey]) {
      return interaction.reply({ content: '❌ Aucune inscription trouvée pour cet événement.', ephemeral: true });
    }
    const reg = data.registrations[regKey];
    const evt = data.events[eventId];
    delete data.registrations[regKey];
    saveData(data);

    await interaction.reply({
      content: `✅ Ta désinscription de **${evt?.nom || eventId}** (${reg.categorie} — ${reg.voiture}) a bien été enregistrée.`,
      ephemeral: true
    });
  }
}

// ─── HELPER : Afficher l'étape catégorie ─────────────────────────────────────
async function showCategorieStep(interaction, evt, isUpdate = false) {
  const cats = Object.keys(CATEGORIES_VOITURES);
  const select = new StringSelectMenuBuilder()
    .setCustomId(`kronos_select_cat__${evt.id}`)
    .setPlaceholder('Choisir la catégorie...')
    .addOptions(cats.map(c => ({ label: c, value: c })));

  const embed = new EmbedBuilder()
    .setColor(COLOR_MAIN)
    .setTitle('🏁 Inscription Kronos — Étape 2/4')
    .setDescription(`**${evt.nom}** — ${evt.date}\n🏟️ ${evt.circuit} | ⏱️ ${evt.duree}\n\nChoisis ta **catégorie** :`)
    .addFields({ name: '🏆 Catégories disponibles', value: cats.join('\n') })
    .setFooter({ text: 'Kronos Racing' });

  const payload = { embeds: [embed], components: [new ActionRowBuilder().addComponents(select)], ephemeral: true };

  if (isUpdate) await interaction.reply(payload);
  else await interaction.update(payload);
}

// ─── SELECT MENUS ─────────────────────────────────────────────────────────────
async function handleSelect(interaction) {
  const data = loadData();

  // Étape 1 → 2 : sélection event
  if (interaction.customId === 'kronos_select_event') {
    const eventId = interaction.values[0];
    const evt = data.events[eventId];
    await showCategorieStep(interaction, evt, false);
  }

  // Étape 2 → 3 : sélection catégorie
  else if (interaction.customId.startsWith('kronos_select_cat__')) {
    const eventId = interaction.customId.split('__')[1];
    const categorie = interaction.values[0];
    const evt = data.events[eventId];
    const voitures = CATEGORIES_VOITURES[categorie];

    const select = new StringSelectMenuBuilder()
      .setCustomId(`kronos_select_voiture__${eventId}__${categorie}`)
      .setPlaceholder('Choisir ta voiture...')
      .addOptions(voitures.map(v => ({ label: v, value: v })));

    const embed = new EmbedBuilder()
      .setColor(COLOR_MAIN)
      .setTitle('🏁 Inscription Kronos — Étape 3/4')
      .setDescription(`**${evt.nom}**\n🏆 Catégorie : **${categorie}**\n\nChoisis ta voiture de préférence :`)
      .setFooter({ text: 'Kronos Racing' });

    await interaction.update({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(select)],
    });
  }

  // Étape 3 → 4 : sélection voiture → disponibilités
  else if (interaction.customId.startsWith('kronos_select_voiture__')) {
    const [, eventId, categorie] = interaction.customId.split('__');
    const voiture = interaction.values[0];
    const evt = data.events[eventId];

    // Cases à cocher disponibilités (multi-select)
    const selectDispo = new StringSelectMenuBuilder()
      .setCustomId(`kronos_select_dispo__${eventId}__${categorie}__${encodeURIComponent(voiture)}`)
      .setPlaceholder('Sélectionne tes créneaux disponibles...')
      .setMinValues(1)
      .setMaxValues(DISPONIBILITES_OPTIONS.length)
      .addOptions(DISPONIBILITES_OPTIONS);

    const embed = new EmbedBuilder()
      .setColor(COLOR_MAIN)
      .setTitle('🏁 Inscription Kronos — Étape 4/4')
      .setDescription(`**${evt.nom}**\n🏆 **${categorie}** | 🚗 **${voiture}**\n\nIndique tes **créneaux de disponibilité** (plusieurs choix possibles) :`)
      .setFooter({ text: 'Kronos Racing' });

    await interaction.update({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(selectDispo)],
    });
  }

  // Étape 4 : disponibilités → modal pseudo
  else if (interaction.customId.startsWith('kronos_select_dispo__')) {
    const parts = interaction.customId.split('__');
    const eventId  = parts[1];
    const categorie = parts[2];
    const voiture  = decodeURIComponent(parts[3]);
    const dispos   = interaction.values;

    // Modal pour le pseudo uniquement
    const modal = new ModalBuilder()
      .setCustomId(`kronos_modal__${eventId}__${categorie}__${encodeURIComponent(voiture)}__${encodeURIComponent(dispos.join('|'))}`)
      .setTitle('Kronos — Finaliser l\'inscription');

    const pseudoInput = new TextInputBuilder()
      .setCustomId('pseudo')
      .setLabel('Ton pseudo / nom de pilote')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setPlaceholder('Ex: Max_Verstappen42')
      .setMaxLength(50);

    modal.addComponents(new ActionRowBuilder().addComponents(pseudoInput));
    await interaction.showModal(modal);
  }
}

// ─── MODAL ────────────────────────────────────────────────────────────────────
async function handleModal(interaction) {
  const data = loadData();

  if (interaction.customId.startsWith('kronos_modal__')) {
    const parts     = interaction.customId.split('__');
    const eventId   = parts[1];
    const categorie = parts[2];
    const voiture   = decodeURIComponent(parts[3]);
    const dispos    = decodeURIComponent(parts[4]).split('|');
    const pseudo    = interaction.fields.getTextInputValue('pseudo');

    const evt = data.events[eventId];
    if (!evt) return interaction.reply({ content: '❌ L\'événement n\'existe plus.', ephemeral: true });

    // Sauvegarder (écrase si déjà inscrit = mise à jour)
    const regKey = `${interaction.user.id}_${eventId}`;
    const isUpdate = !!data.registrations[regKey];

    data.registrations[regKey] = {
      userId: interaction.user.id,
      discordTag: interaction.user.tag,
      pseudo,
      eventId,
      categorie,
      voiture,
      disponibilites: dispos,
      inscritAt: new Date().toISOString(),
    };
    saveData(data);

    // Embed de confirmation
    const embed = new EmbedBuilder()
      .setColor(COLOR_SUCCESS)
      .setTitle(isUpdate ? '🔄 Inscription mise à jour !' : '✅ Inscription confirmée !')
      .setDescription(`Bienvenue dans la grille **${categorie}**, **${pseudo}** ! 🏎️`)
      .addFields(
        { name: '🏁 Course',        value: evt.nom,         inline: false },
        { name: '📅 Date',          value: evt.date,         inline: true  },
        { name: '🏟️ Circuit',       value: evt.circuit,      inline: true  },
        { name: '⏱️ Durée',         value: evt.duree,        inline: true  },
        { name: '🏆 Catégorie',     value: categorie,        inline: true  },
        { name: '🚗 Voiture',       value: voiture,          inline: true  },
        { name: '🕐 Disponibilités',value: dispos.join('\n'), inline: false },
      )
      .setFooter({ text: 'Kronos Racing • Pour modifier : relance /inscrire sur le même event' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
}

// ─── BUTTON (extensible) ──────────────────────────────────────────────────────
async function handleButton(interaction) {
  // Réservé pour extensions futures
}

// ─── LAUNCH ───────────────────────────────────────────────────────────────────
const TOKEN = process.env.DISCORD_TOKEN;
if (!TOKEN) {
  console.error('❌ Variable DISCORD_TOKEN manquante dans le fichier .env');
  process.exit(1);
}
client.login(TOKEN);

