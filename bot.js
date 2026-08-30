require('dotenv').config();

const { Client, GatewayIntentBits, Options } = require('discord.js');

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
  addcargo: '1543688837203501239', // canal de addcargo
  remcargo: '1543688920569479238', // canal de remcargo
};

client.once('ready', () => {
  console.log(`✅ Bot conectado como ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  // Ignorar mensajes de bots o que no empiecen con el prefijo
  if (message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  // Dividir el comando en argumentos
  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  // Roles que pueden usar los comandos (staff autorizado)
  const STAFF_ROLES = [
    // Roles de staff principales
    '1540867366911483996', // Resp
    '1540867367716921444', // Sênior
    '1540867368442400818', // Auxiliar
    // Roles adicionales de staff
    '1540867365968023632',
    '1540867365179359283',
    '1540867364479049808',
    '1540867363682123856',
    '1540867362973294612',
    '1540867361924710531',
    '1540867361475924028',
    '1540867360074899616',
    '1540867359340765335',
    '1540867358586052708',
    '1540867357851783168',
    '1540867357138751579',
    '1540867353695223969',
    '1540867352768413726',
    '1540867352021958686',
    '1540867351203815506',
    '1540867350310682654',
    '1540867333340528710',
    '1540867332593819758',
    '1540867331922853908',
    '1540867331226468536',
    '1540867328332537967',
    '1540867327967494224',
    '1540867325878730893',
    '1540867324997799956',
    '1540867324276645969',
  ];

  // Verificar que el miembro tenga uno de los roles de staff autorizados
  const member = message.member;
  const hasStaffRole = member.roles.cache.some((role) => STAFF_ROLES.includes(role.id));

  if (!hasStaffRole) {
    return message.reply('❌ No tienes permisos para usar comandos de roles (solo Resp, Sênior o Auxiliar).');
  }

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

  // Registrar en el canal de log opuesto (mensaje fijo, no se borra)
  function logToChannel(logChannelId, text) {
    const channel = message.guild.channels.cache.get(logChannelId);
    if (channel) {
      channel.send(text).catch(() => {});
    }
  }

  // Comando: !addcargo @rol @usuario
  if (command === 'addcargo') {
    if (args.length < 2) {
      return sendAndDelete(
        '❌ Uso correcto: `!addcargo <@rol o ID de rol> <@usuario o ID de usuario>`'
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
      // Log fijo en el canal de addcargo indicando en qué canal se usó el comando
      logToChannel(
        CHANNELS.addcargo,
        `📝 **LOG ADDCARGO** — ${member.user.tag} asignó **${role.name}** a **${target.user.tag}** en el canal <#${message.channel.id}>`
      );
    } catch (error) {
      console.error(error);
      sendAndDelete('❌ Ocurrió un error al asignar el rol.');
    }
  }

  // Comando: !remcargo @rol @usuario
  if (command === 'remcargo') {
    if (args.length < 2) {
      return sendAndDelete(
        '❌ Uso correcto: `!remcargo <@rol o ID de rol> <@usuario o ID de usuario>`'
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
      // Log fijo en el canal de remcargo indicando en qué canal se usó el comando
      logToChannel(
        CHANNELS.remcargo,
        `📝 **LOG REMCARGO** — ${member.user.tag} quitó **${role.name}** a **${target.user.tag}** en el canal <#${message.channel.id}>`
      );
    } catch (error) {
      console.error(error);
      sendAndDelete('❌ Ocurrió un error al quitar el rol.');
    }
  }
});

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
