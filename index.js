const config = require(`./config${process.env['NODE_ENV'] ? '_' + process.env['NODE_ENV'] : ''}.json`);
const Utils = require('./lib/utils');
const { Client, GatewayIntentBits } = require('discord.js');
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessageReactions
  ]
});
const utils = new Utils(client, config);
// A pretty useful method to create a delay without blocking the whole script.
const wait = require("timers/promises").setTimeout;

// Sync member data when the bot is ready, bind to the role reactions
client.on('ready', async () => {
  utils.logger(`Logged in as ${client.user.tag}!`, { consoleOnly: true});
  if (config.startUpCorrelatation) {
    await utils.correlateDiscordvsNotion();
    // to make sure Partner has updated data
    await wait(1000);  
  }
  await utils.synMemberData();
  await utils.collectRoleSelections();
})

// We will correlate this with recently added user
client.on("inviteDelete", (invite) => {
  utils.setRecentlyConsumedInviteCode (invite.code);
});

// Use recently consumed invite to correlate Discord member and registered user. 
client.on("guildMemberAdd", async (member) => {
  // wait until single use invite is deleted
  await wait(1000);
  await utils.relateRecentlyConsumedInviteCode(member);
});

client.on("guildMemberRemove", async (member) => {
  await utils.purgeMemberData(member);
});

// Register an event to log bot messages
client.on('messageCreate', async msg => {
  if (!msg.author.bot || msg.author.username != 'relateBot') {
    return
  } 
  utils.logger(`Message sent to ${client.channels.cache.get(msg.channelId).name}: ${msg.content}`, { consoleOnly: true});
})

// All bot commands are handled here
client.on('interactionCreate', async interaction => {
  const user = await interaction.guild.members.fetch(interaction.user.id);
  const nickname = utils.getNickname(user);
  if (!interaction.isChatInputCommand()){
    return;
  } 

  let { commandName } = interaction;

  try {

    // Only Admins can use private commands
    if ( !config.publicCommands.includes(commandName) && !user.roles.cache.find(role => Object.values(config.allowedRoles).includes(role.id)) ) {
      utils.logger(`**${nickname}** does not have permission to execute command **${commandName}**`);
      interaction.reply({ content: `You don't have permission`, ephemeral: true });
      return;
    }
    utils.logger(`**${nickname}** executed command **${commandName}**`);

    if (commandName === 'invite') {
      const email = interaction.options.get('email').value;
      const emailRegExp = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
      // Check if option is a valid email
      if (!emailRegExp.test(email)) {
        interaction.reply({ content: `Not a valid email ${email}`, ephemeral: true });
        return;
      }
      const result = await utils.createInvite(email);

      if (result.error) {
        interaction.reply({ content: result.error, ephemeral: true });
      } else {
        interaction.reply(`${email} ${result.newInvite.url}`);
      }
    }

    else if (commandName === 'email') {
      const userInfo = utils.members.get(user.id);
      if (!userInfo) {
        interaction.reply({ content: `Email not found for **${nickname}**`, ephemeral: true });
      } else {
        interaction.reply(`Email of **${nickname}** is found as **${userInfo['Email Address']}**`);
      }
    }

    else if (commandName === 'emails') {
      const role = interaction.options.get('role').role.name;
      interaction.reply(utils.generateEmbed( `Email List`, { role, emails: utils.getEmailsByRoles(role)}));
    }

    else if (commandName === 'info' || commandName === 'aboutmyself') {
      const profile =  commandName == 'aboutmyself' ? { user } : interaction.options.get('user');
      const userInfo = utils.members.get(profile.user.id);
      if (!userInfo || !userInfo.partnerId) {
        interaction.reply({ content: `Registration not found for **${utils.getNickname(profile)}**`, ephemeral: true });
      } else {
        // console.log(JSON.stringify(utils.generateUserInfo(userInfo), null, ' '))
        interaction.reply({ ...utils.generateUserInfo(userInfo), ephemeral: true });
        // interaction.reply(JSON.stringify(userInfo, null, ' '));
      }
    }

    else if (commandName === 'correlate') {
      interaction.reply(`Correlation started, please check logs`);
      await utils.correlateDiscordvsNotion();
    }
  } catch (e) {
    utils.logger(`Unable to complete command **${commandName}**: ${e}`)
  }
}); 

// client.login logs the bot in and sets it up for use.
client.login(config.token);