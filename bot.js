require('dotenv').config();

const { Client, GatewayIntentBits, Options, EmbedBuilder } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  makeCache: Options.cacheWithLimits({
    // Limitar el caché de members y messages para ahorrar memoria
    MessageManager: 50,
    GuildMemberManager: 200,
  }),
  sweepers: {
    ...Options.DefaultSweeperSettings,
    messages: {
      interval: 300,
      lifetime: 300,
    },
    guildMembers: {
      interval: 300,
      filter: () => (member) => !member.roles.cache.size,
    },
  },
});

const PREFIX = '!';

// Canales específicos por comando (y su canal de log opuesto)
const CHANNELS = {
  addrol: '1544532897455808643', // canal de addrol
  remrol: '1544532940711526530', // canal de remrol
};

// Canal antiraid: si alguien manda un mensaje aquí, se activa el aislamiento
const ANTIRAID_CHANNEL = '1543930758434127975';
const ANTIRAID_TIMEOUT = 2 * 60 * 60 * 1000; // 2 horas de aislamiento
const ANTIRAID_DELETE_MS = 60 * 60 * 1000; // borrar mensajes de la última hora
// Canal de logs de antiraid (aislamientos)
const ANTIRAID_LOG_CHANNEL = '1544553248026009620';

client.once('ready', () => {
  console.log(`✅ Bot conectado como ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  // Ignorar mensajes de bots o que no empiecen con el prefijo
  if (message.author.bot) return;

  // ANTIRAID: si alguien manda un mensaje en el canal antiraid, se aísla
  if (message.channel.id === ANTIRAID_CHANNEL) {
    await handleAntiRaid(message);
    return;
  }

  if (!message.content.startsWith(PREFIX)) return;

  // Dividir el comando en argumentos
  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  // Roles que pueden usar los comandos (staff autorizado) - Nuevo server
  const STAFF_ROLES = [
    '1543930402077417513', // Alta Cupula
    '1543930404195672205', // Master
    '1543930405030334527', // Master Staff
    '1543930406209069127', // Master WallStreet
    '1543930407110709269', // Master Orgs/LGL
    '1543930407937122334', // Master TL
    '1543930408796684318', // Master AFL
    '1543930415398526986', // Resp Conducta
    '1543930416195436654', // Resp Administrativo
    '1543930417000747030', // Resp Comunidad
    '1543930418363895919', // Resp AFL
    '1543930419391635597', // Resp AntiTrolls
    '1543930420134027366', // Resp Llamados
    '1543930420876415048', // Resp WallStreet
    '1543930421727993856', // Resp ORGs
    '1543930422512320623', // Resp Legal
    '1543930423338336356', // Resp RH
    '1543930424974377010', // Resp Interaccion
    '1543930425838145606', // Resp TL
    '1543930427348090911', // Tier 5
    '1543930428774285353', // Tier 4
    '1543930429583663115', // Tier 3
    '1543930430850601092', // Tier 2
    '1543930431710302208', // Tier 1
    '1543930432519807008', // Tier 0
    '1543930434994438206', // Resp
    '1543930438211604630', // ADM
    '1543930439054393475', // Auxiliar
  ];

  // Verificar que el miembro tenga uno de los roles de staff autorizados
  const member = message.member;

  // Borrar el mensaje del comando al instante
  try {
    await message.delete();
  } catch {
    // Si no se puede borrar (sin permiso), se ignora
  }

  // Responder y borrar el mensaje después de unos segundos
  async function sendAndDelete(text, deleteAfter = 3000) {
    const msg = await message.channel.send(text);
    setTimeout(() => msg.delete().catch(() => {}), deleteAfter);
    return msg;
  }

  const hasStaffRole = member.roles.cache.some((role) => STAFF_ROLES.includes(role.id));

  if (!hasStaffRole) {
    return sendAndDelete('❌ No tienes permisos.');
  }

  // Registrar log en el canal correspondiente como embed
  function logToChannel(logChannelId, { title, color, target, role, executor, channel }) {
    const logChannel = message.guild.channels.cache.get(logChannelId);
    if (!logChannel) return;

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setColor(color)
      .addFields(
        { name: 'Usuario', value: `${target} (${target.id})`, inline: true },
        { name: 'Rol', value: `${role}`, inline: true },
        { name: 'Por', value: `${executor} (${executor.id})`, inline: true },
        { name: 'Canal', value: `${channel}`, inline: true }
      )
      .setTimestamp();

    logChannel.send({ embeds: [embed] }).catch(() => {});
  }

  // Comando: !addrol @rol @usuario
  if (command === 'addrol') {
    if (args.length < 2) {
      return sendAndDelete(
        '❌ Uso correcto: `!addrol <@rol o ID de rol> <@usuario o ID de usuario>`'
      );
    }

    const role = await resolveRole(message, args[0]);
    const target = await resolveMember(message, args[1]);

    if (!role) {
      return sendAndDelete('❌ No se pudo encontrar el rol. Usa una mención de rol o su ID.');
    }
    if (!target) {
      return sendAndDelete('❌ No se pudo encontrar al usuario. Usa una mención o su ID.');
    }

    try {
      // Verificar que el bot pueda gestionar ese rol (posición del rol del bot)
      if (role.position >= message.guild.members.me.roles.highest.position) {
        return sendAndDelete('❌ El bot no tiene permisos para asignar ese rol (el rol está por encima del bot).');
      }

      // Verificar que el staff solo pueda gestionar roles por debajo de su rol más alto
      if (role.position >= member.roles.highest.position) {
        return sendAndDelete('❌ No puedes gestionar ese rol porque está igual o por encima de tu rol más alto.');
      }

      if (target.roles.cache.has(role.id)) {
        return sendAndDelete(`ℹ️ ${target.user.tag} ya tiene el rol ${role.name}.`);
      }

      await target.roles.add(role);
      sendAndDelete(`✅ Se le asignó el rol **${role.name}** a ${target.user.tag}.`);
      logToChannel(CHANNELS.addrol, {
        title: 'Rol Añadido',
        color: 0x57f287,
        target,
        role,
        executor: member,
        channel: message.channel,
      });
    } catch (error) {
      console.error(error);
      sendAndDelete('❌ Ocurrió un error al asignar el rol.');
    }
  }

  // Comando: !remrol @rol @usuario
  if (command === 'remrol') {
    if (args.length < 2) {
      return sendAndDelete(
        '❌ Uso correcto: `!remrol <@rol o ID de rol> <@usuario o ID de usuario>`'
      );
    }

    const role = await resolveRole(message, args[0]);
    const target = await resolveMember(message, args[1]);

    if (!role) {
      return sendAndDelete('❌ No se pudo encontrar el rol. Usa una mención de rol o su ID.');
    }
    if (!target) {
      return sendAndDelete('❌ No se pudo encontrar al usuario. Usa una mención o su ID.');
    }

    try {
      if (role.position >= message.guild.members.me.roles.highest.position) {
        return sendAndDelete('❌ El bot no tiene permisos para quitar ese rol (el rol está por encima del bot).');
      }

      // Verificar que el staff solo pueda gestionar roles por debajo de su rol más alto
      if (role.position >= member.roles.highest.position) {
        return sendAndDelete('❌ No puedes gestionar ese rol porque está igual o por encima de tu rol más alto.');
      }

      if (!target.roles.cache.has(role.id)) {
        return sendAndDelete(`ℹ️ ${target.user.tag} no tiene el rol ${role.name}.`);
      }

      await target.roles.remove(role);
      sendAndDelete(`✅ Se le quitó el rol **${role.name}** a ${target.user.tag}.`);
      logToChannel(CHANNELS.remrol, {
        title: 'Rol Quitado',
        color: 0xed4245,
        target,
        role,
        executor: member,
        channel: message.channel,
      });
    } catch (error) {
      console.error(error);
      sendAndDelete('❌ Ocurrió un error al quitar el rol.');
    }
  }
});

// Función antiraid: aísla al usuario por 2h y borra sus mensajes de la última hora
async function handleAntiRaid(message) {
  const target = message.member;
  if (!target) return;

  try {
    // 1. Borrar el mensaje disparador al instante
    message.delete().catch(() => {});

    // 2. Aislar (silencio) por 2 horas
    await target.timeout(ANTIRAID_TIMEOUT, 'Cuenta comprometida / anti-raid');

    // 3. Log de aislamiento inmediato en el canal de logs antiraid
    const embed = new EmbedBuilder()
      .setTitle('Usuario aislado (Don\'t Type)')
      .setColor(0xed4245)
      .setDescription(
        `${target} ha sido aislado 2 hora(s) por escribir en el canal ${message.channel}.\n\n` +
          `Motivo: Canal Don't Type (posible cuenta comprometida).\nMensajes borrados: Sí`
      )
      .addFields(
        { name: 'Usuario', value: `${target} (${target.id})`, inline: false },
        { name: 'Canal', value: `${message.channel}`, inline: false },
        { name: 'Tiempo', value: '2 hora(s)', inline: false }
      )
      .setTimestamp();

    const logChannel = message.guild.channels.cache.get(ANTIRAID_LOG_CHANNEL);
    if (logChannel) logChannel.send({ embeds: [embed] }).catch(() => {});

    console.log(`🚨 Anti-raid: ${target.user.tag} aislado 2h por mensaje en canal antiraid`);

    // 4. Borrar los mensajes del usuario de la última hora en segundo plano (sin bloquear la log)
    setTimeout(() => {
      purgeRecentMessages(target, message.guild);
    }, 0);
  } catch (error) {
    console.error('Error en anti-raid:', error);
  }
}

// Borra los mensajes del usuario de la última hora en todos los canales
async function purgeRecentMessages(target, guild) {
  const limit = Date.now() - ANTIRAID_DELETE_MS;
  const channels = guild.channels.cache.filter((c) => c.isTextBased());

  for (const channel of channels.values()) {
    try {
      const messages = await channel.messages.fetch({ limit: 100 });
      const targets = messages.filter(
        (m) => !m.author.bot && m.author.id === target.id && m.createdTimestamp >= limit
      );
      if (targets.size > 0) {
        await channel.bulkDelete(targets);
      }
    } catch {
      // Sin permisos en ese canal, se ignora
    }
  }
}

// Función para resolver rol por mención o ID
async function resolveRole(message, str) {
  let roleId = str.replace(/[<@&>]/g, '');
  const role = message.guild.roles.cache.get(roleId);
  return role || null;
}

// Función para resolver miembro por mención o ID
async function resolveMember(message, str) {
  let memberId = str.replace(/[<@!>]/g, '');
  try {
    const member = await message.guild.members.fetch(memberId);
    return member || null;
  } catch {
    return null;
  }
}

const TOKEN = process.env.DISCORD_TOKEN;
if (!TOKEN) {
  console.error('❌ No se encontró el token. Revisa tu archivo .env (DISCORD_TOKEN).');
  process.exit(1);
}

client.login(TOKEN);

// Servidor HTTP mínimo para que Render no mate el proceso por falta de puerto
const http = require('http');
http
  .createServer((req, res) => {
    res.writeHead(200);
    res.end('ok');
  })
  .listen(process.env.PORT || 10000, () => {
    console.log('HTTP server up');
  });
