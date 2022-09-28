const config = require(`./config${process.env['NODE_ENV'] ? '_' + process.env['NODE_ENV'] : ''}.json`);
const Utils = require('./lib/utils');
const { Client, GatewayIntentBits } = require('discord.js');
const _ = require('lodash');
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
    await utils.correlateDiscordWithPartner();
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

  if (!interaction.isChatInputCommand()){
    return;
  } 
  // deferReply & editReply prevents crashes and timeouts
  await interaction.deferReply();

  let { commandName } = interaction;

  try {
    const user = await interaction.guild.members.fetch(interaction.user.id);
    const nickname = utils.getNickname(user);

    // Only Admins can use private commands
    if ( !config.publicCommands.includes(commandName) && !user.roles.cache.find(role => Object.values(config.allowedRoles).includes(role.id)) ) {
      utils.logger(`**${nickname}** does not have permission to execute command **${commandName}**`);
      interaction.reply({ content: `You don't have permission`, ephemeral: true });
      return;
    }
    // utils.logger(`**${nickname}** executed command **${commandName}**`);

    if (commandName === 'invite') {
      const email = interaction.options.get('email').value;
      // Check if option is a valid email
      if (!utils.isEmail(email)) {
        await interaction.editReply({ content: `Not a valid email ${email}`, ephemeral: true });
        return;
      }
      const result = await utils.createInvite(email);

      if (result.error) {
        await interaction.editReply({ content: result.error, ephemeral: true });
      } else {
        await interaction.editReply(`${email} ${result.newInvite.url}`);
      }
    }

    else if (commandName === 'email') {
      const userInfo = utils.members.get(user.id);
      if (!userInfo) {
        await interaction.editReply({ content: `Email not found for **${nickname}**`, ephemeral: true });
      } else {
        await interaction.editReply(`Email of **${nickname}** is found as **${userInfo['Email Address']}**`);
      }
    }

    else if (commandName === 'emails') {
      const role = interaction.options.get('role').role.name;
      await interaction.editReply(utils.generateEmbed( `Email List`, { role, emails: utils.getEmailsByRoles(role)}));
    }

    else if (commandName === 'info' || commandName === 'aboutmyself') {
      const profile =  commandName == 'aboutmyself' ? user : interaction.options.get('user');
      const userInfo = utils.members.get(profile.id);
      if (!userInfo || !userInfo.partnerId) {
        await interaction.editReply({ content: `Registration not found for **${utils.getNickname(profile)}**`, ephemeral: true });
      } else {
        await interaction.editReply({ ...utils.generateUserInfo(userInfo), ephemeral: true });
      }
    }

    else if (commandName === 'correlate') {
      await interaction.editReply(`Correlation started, please check logs`);
      await utils.correlateDiscordWithPartner();
    }

    else if (commandName === 'updatemyself') {
      if (_.isEmpty(interaction.options.data)) {
        await interaction.editReply({ content: `Requires one of the options`, ephemeral: true });
        return;        
      }
      const updates = utils.mapOptions(interaction.options.data);
      const userInfo = utils.members.get(user.id);
      const email = _.get(interaction.options.get('email'), 'value');

      if (email && !utils.isEmail(email)) {
        await interaction.editReply({ content: `Not a valid email **${email}**`, ephemeral: true });
        return;
      } 

      // update existing user
      if (utils.isCorrelatedProfile(userInfo)) {
        updates["Full Name"] = updates["Full Name"] || userInfo.nickname;
        await utils.updateProfile(userInfo, updates);
        await interaction.editReply({ ...utils.generateUserInfo(userInfo), ephemeral: true });
      } 
      // redeem email address
      else {
        const result = await utils.redeemProfile(userInfo, updates);
        await interaction.editReply({ content: result, ephemeral: true });
        await interaction.editReply({ ...utils.generateUserInfo(userInfo), ephemeral: true });
      }
    }

  } catch (e) {
    await interaction.editReply({ content: `Unable to complete command **${commandName}**: ${e}`, ephemeral: true });
  }
}); 

// client.login logs the bot in and sets it up for use.
client.login(config.token);