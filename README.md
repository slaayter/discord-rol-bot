# Discord Rol Bot

Bot de Discord para que el staff gestione roles usando comandos con prefijo `!`.

## Requisitos

- [Node.js](https://nodejs.org/) v16.9.0 o superior (recomendado v18+).
- Un bot creado en el [Portal de Desarrolladores de Discord](https://discord.com/developers/applications).

## Instalación

1. Instala las dependencias:

```
npm install
```

2. Copia el token de tu bot al archivo `.env`:

```
DISCORD_TOKEN=tu_token_aqui
```

3. Inicia el bot:

```
npm start
```

## Comandos

Todos los comandos solo pueden usarlos los miembros que tengan uno de los roles de staff: **Resp**, **Sênior** o **Auxiliar**.

| Comando | Descripción |
|---------|-------------|
| `!addcargo <@rol o ID> <@usuario o ID>` | Asigna un rol a un usuario |
| `!remcargo <@rol o ID> <@usuario o ID>` | Quita un rol a un usuario |

### Ejemplos

```
!addcargo @Moderador @Juan
!addcargo 123456789012345678 987654321098765432
!remcargo @Vip @Maria
```

## Notas

- Solo los miembros con los roles **Resp**, **Sênior** o **Auxiliar** pueden usar los comandos.
- El bot únicamente puede gestionar roles que estén **por debajo** de su propio rol más alto en la jerarquía del servidor. Coloca el rol del bot por encima de los roles que quiere asignar/quitar.
- El bot necesita el permiso de **Gestionar Roles** en el servidor para poder asignar/quitar roles.
