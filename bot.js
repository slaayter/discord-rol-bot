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
  sendDontTypeWarning(client);
});

// Envía el aviso de advertencia en el canal antiraid (solo si aún no existe)
async function sendDontTypeWarning(client) {
  const channel = client.channels.cache.get(ANTIRAID_CHANNEL);
  if (!channel) return;

  try {
    const existing = await channel.messages.fetch({ limit: 5 });
    const already = existing.some((m) => m.author.id === client.user.id && m.embeds[0]?.title?.includes('NO ESCRIBAS EN ESTE CANAL'));
    if (already) return;
  } catch {
    // si no puede leer el historial, se ignora
  }

  const embed = new EmbedBuilder()
    .setTitle('⚠️  NO ESCRIBAS EN ESTE CANAL  ⚠️')
    .setColor(0xed4245)
    .setDescription(
      `- Si escribes en este canal, **serás AISLADO durante 2 HORAS** y se te **borrarán los últimos mensajes.**\n\n` +
        `Este canal está reservado para cuentas AntiSpam. Si has sido hackeado, contacta con el staff.`
    )
    .setFooter({ text: 'Canal de control Anti Spam' })
    .setTimestamp();

  channel.send({ embeds: [embed] }).catch(() => {});
}

client.on('messageCreate', async (message) => {
  // Ignorar mensajes de bots, de DM o que no empiecen con el prefijo
  if (message.author.bot) return;
  if (!message.guild) return;

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
    '1543930391872802827', // Ceo
    '1543930393525358702', // Director General
    '1543930395572052029', // Soporte Ventas
    '1543930396532678826', // Developer
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

  const member = message.member;

  // Verificar que el miembro tenga uno de los roles de staff autorizados
  const memberRoles = member?.roles;
  const hasStaffRole = memberRoles
    ? memberRoles.cache.some((role) => STAFF_ROLES.includes(role.id))
    : false;

  // Borrar el mensaje del comando al instante
  try {
    await message.delete();
  } catch {
    // Si no se puede borrar (sin permiso), se ignora
  }

  // Responder y borrar el mensaje después de unos segundos
  async function sendAndDelete(text, deleteAfter = 3000) {
    try {
      const msg = await message.channel.send(text);
      setTimeout(() => msg.delete().catch(() => {}), deleteAfter);
      return msg;
    } catch {
      // Sin permiso para enviar en el canal, se ignora
      return null;
    }
  }

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
      // Obtener el rol más alto del bot (buscándolo si hace falta)
      let botMember = message.guild.members.me;
      if (!botMember) {
        botMember = await message.guild.members.fetchMe().catch(() => null);
      }
      const botHighest = botMember?.roles.highest?.position ?? 0;

      // Verificar que el rol no esté gestionado por una integración (Nitro, otro bot, etc.)
      if (role.managed) {
        return sendAndDelete('❌ No se puede asignar este rol porque está gestionado por una integración externa.');
      }

      // Verificar que el bot pueda gestionar ese rol (posición del rol del bot)
      if (role.position >= botHighest) {
        return sendAndDelete('❌ El bot no tiene permisos para asignar ese rol (el rol está por encima del bot).');
      }

      // Verificar que el staff solo pueda gestionar roles por debajo de su rol más alto
      if (role.position >= (member.roles.highest?.position ?? 0)) {
        return sendAndDelete('❌ No puedes gestionar ese rol porque está igual o por encima de tu rol más alto.');
      }

      if (target.roles.cache.has(role.id)) {
        return sendAndDelete(`ℹ️ ${target.user.tag} ya tiene el rol ${role}.`);
      }

      await target.roles.add(role);
      sendAndDelete(`✅ Se le asignó el rol ${role} a ${args[1]}.`);
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
      const msg = error.code === 50013
        ? '❌ El bot no tiene permisos para asignar ese rol. Asegúrate de que el rol del bot esté por encima del rol que intentas asignar en la jerarquía de Discord.'
        : `❌ Ocurrió un error al asignar el rol. (${error.name}: ${error.message})`;
      sendAndDelete(msg);
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
      // Obtener el rol más alto del bot (buscándolo si hace falta)
      let botMember = message.guild.members.me;
      if (!botMember) {
        botMember = await message.guild.members.fetchMe().catch(() => null);
      }
      const botHighest = botMember?.roles.highest?.position ?? 0;

      if (role.managed) {
        return sendAndDelete('❌ No se puede quitar este rol porque está gestionado por una integración externa.');
      }

      if (role.position >= botHighest) {
        return sendAndDelete('❌ El bot no tiene permisos para quitar ese rol (el rol está por encima del bot).');
      }

      // Verificar que el staff solo pueda gestionar roles por debajo de su rol más alto
      if (role.position >= (member.roles.highest?.position ?? 0)) {
        return sendAndDelete('❌ No puedes gestionar ese rol porque está igual o por encima de tu rol más alto.');
      }

      if (!target.roles.cache.has(role.id)) {
        return sendAndDelete(`ℹ️ ${target.user.tag} no tiene el rol ${role}.`);
      }

      await target.roles.remove(role);
      sendAndDelete(`✅ Se le quitó el rol ${role} a ${args[1]}.`);
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
      const msg = error.code === 50013
        ? '❌ El bot no tiene permisos para quitar ese rol. Asegúrate de que el rol del bot esté por encima del rol que intentas quitar en la jerarquía de Discord.'
        : `❌ Ocurrió un error al quitar el rol. (${error.name}: ${error.message})`;
      sendAndDelete(msg);
    }
  }
});

// Función antiraid: aísla al usuario por 2h y borra sus mensajes de la última hora
const activeIsolations = new Map(); // userId -> timestamp (evita logs duplicados)

async function handleAntiRaid(message) {
  const target = message.member;
  if (!target) return;

  const last = activeIsolations.get(target.id);
  if (last && Date.now() - last < 60 * 1000) return; // ya se procesó hace poco
  activeIsolations.set(target.id, Date.now());

  try {
    // 1. Borrar el mensaje disparador al instante
    message.delete().catch(() => {});

    // 2. Aislar (silencio) por 2 horas (si no se puede, igual se registra la log)
    let isolated = true;
    try {
      await target.timeout(ANTIRAID_TIMEOUT, 'Cuenta comprometida / anti-raid');
    } catch {
      isolated = false;
    }

    // 3. Log de aislamiento inmediato en el canal de logs antiraid
    const embed = new EmbedBuilder()
      .setTitle('Usuario aislado (Don\'t Type)')
      .setColor(0xed4245)
      .setDescription(
        `${target} ha sido ${isolated ? 'aislado 2 hora(s)' : 'marcado'} por escribir en el canal ${message.channel}.\n\n` +
          `Motivo: Posible cuenta de spam.\nMensajes borrados: ${isolated ? 'Sí' : 'No'}`
      )
      .addFields(
        { name: 'Usuario', value: `${target} (${target.id})`, inline: false },
        { name: 'Canal', value: `${message.channel}`, inline: false },
        { name: 'Mensaje', value: (message.content || '(sin texto)').slice(0, 1000), inline: false },
        { name: 'Tiempo', value: '2 hora(s)', inline: false }
      )
      .setTimestamp();

    const logChannel = message.guild.channels.cache.get(ANTIRAID_LOG_CHANNEL);
    if (logChannel) logChannel.send({ embeds: [embed] }).catch(() => {});

    console.log(`🚨 Anti-raid: ${target.user.tag} ${isolated ? 'aislado 2h' : 'no aislado'} por mensaje en canal antiraid`);

    // 4. Borrar los mensajes del usuario de la última hora en segundo plano (sin bloquear la log)
    setTimeout(() => {
      purgeRecentMessages(target, message.guild);
      activeIsolations.delete(target.id);
    }, 0);
  } catch (error) {
    console.error('Error en anti-raid:', error);
    activeIsolations.delete(target.id);
  }
}

// Borra los mensajes del usuario de la última hora en todos los canales
async function purgeRecentMessages(target, guild) {
  const limit = Date.now() - ANTIRAID_DELETE_MS;

  // Cargar todos los canales (no solo los que están en caché)
  let channels;
  try {
    channels = await guild.channels.fetch();
  } catch {
    channels = guild.channels.cache;
  }
  const textChannels = channels.filter((c) => c.isTextBased());

  for (const channel of textChannels.values()) {
    try {
      const messages = await channel.messages.fetch({ limit: 200 });
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
  // Buscar en caché primero, y si no está, traerlo desde Discord
  let role = message.guild.roles.cache.get(roleId);
  if (!role) {
    try {
      role = await message.guild.roles.fetch(roleId);
    } catch {
      role = null;
    }
  }
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
