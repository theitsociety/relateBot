const config = require(`./config${process.env['NODE_ENV'] ? '_' + process.env['NODE_ENV'] : ''}.json`);
const Utils = require('./lib/utils');
const { Client, GatewayIntentBits, Partials } = require('discord.js');
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
  ], 
  partials: [
    Partials.Message, 
    Partials.Channel, 
    Partials.Reaction
  ],
});

const utils = new Utils(client, config);
// A pretty useful method to create a delay without blocking the whole script.
const wait = require("timers/promises").setTimeout;

// Sync member data when the bot is ready, bind to the role reactions
client.on('ready', async () => {
  utils.logger(`Logged in as ${client.user.tag}!`, { consoleOnly: true});
  const guild = client.guilds.cache.get(config.guildId);
  await guild.members.fetch();

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
  if (invite.guild.id !== config.guildId) {
    return;
  }
  utils.setRecentlyConsumedInviteCode (invite.code);
});

// Use recently consumed invite to correlate Discord member and registered user. 
client.on("guildMemberAdd", async (member) => {
  if (member.guild.id !== config.guildId) {
    return;
  }
  // wait until single use invite is deleted
  await wait(1000);
  await utils.relateRecentlyConsumedInviteCode(member);
});

client.on("guildMemberRemove", async (member) => {
  if (member.guild.id !== config.guildId) {
    return;
  }
  await utils.purgeMemberData(member);
});

// Register an event to log bot messages
client.on('messageCreate', async msg => {
  if (msg.guildId !== config.guildId) {
    return;
  }
  if (!msg.author.bot || msg.author.username != 'relateBot') {
    return
  } 
  utils.logger(`Message sent to ${client.channels.cache.get(msg.channelId).name}: ${msg.content}`, { consoleOnly: true});
})

client.on('messageReactionAdd', async (reaction, user) => {
  if (reaction.message.guildId !== config.guildId) {
    return;
  }
  // When a reaction is received, check if the structure is partial
  if (reaction.partial) {
      // If the message this reaction belongs to was removed, the fetching might result in an API error which should be handled
      try {
        await reaction.fetch();
      } catch (error) {
        utils.logger(`Something went wrong when fetching message reactions: ${error}`);
        return;
      }
  }
  if (config.registrations.autoInvite &&
    _.get(reaction.message, 'embeds.0.title') == config.registrations.title &&
    reaction.message.channelId == config.channels.registrationChannel &&
    reaction.emoji.name == config.registrations.inviteEmoji) {

    const email = _.chain(reaction.message)
      .get("embeds.0.data.fields", {})
      .find( el => config.registrations.email.includes(el.name))
      .get('value')
      .value();
    if (!email || !utils.isEmail(email)) {
      await reaction.message.reply({ content: `Not a valid email ${email}` });
      return;
    }

    try {
      const result = await utils.createInvite(email);
      await reaction.message.reply({ content: result.error ? result.error : `${email} ${result.newInvite.url}` });
    } catch (e) {
      await reaction.message.reply({ content: `Unable to invite: ${e}`});
    }
  }
});

// All bot commands are handled here
client.on('interactionCreate', async interaction => {
  if (interaction.guildId !== config.guildId) {
    return;
  }
  if (!interaction.isChatInputCommand()){
    return;
  } 
  let { commandName } = interaction;

  // deferReply & editReply prevents crashes and timeouts
  await interaction.deferReply({ephemeral: ["invite", "register"].includes(commandName) ? false : true });

  try {
    const user = await interaction.guild.members.fetch(interaction.user.id);
    const nickname = utils.getNickname(user);

    // Only Admins can use private commands
    if ( !config.publicCommands.includes(commandName) && !user.roles.cache.find(role => Object.values(config.allowedRoles).includes(role.id)) ) {
      utils.logger(`**${nickname}** does not have permission to execute command **${commandName}**`);
      interaction.editReply({ content: `You don't have permission`, ephemeral: true });
      return;
    }
    utils.logger(`**${nickname}** executed command **${commandName}**`);

    if (commandName === 'invite') {
      const email = interaction.options.get('email').value;
      // Check if option is a valid email
      if (!utils.isEmail(email)) {
        await interaction.editReply({ content: `Not a valid email ${email}`, ephemeral: true });
        return;
      }
      const result = await utils.createInvite(email, true);

      if (result.error) {
        await interaction.editReply({ content: result.error, ephemeral: true });
      } else {
        await interaction.editReply(`${email} ${result.newInvite.url}`);
      }
    }

    else if (commandName === 'emails') {
      const role = _.get(interaction.options.get('role'), 'role.name');
      if (role) {
        const results = utils.getEmailsByRoles(role);
        await interaction.editReply({ ...utils.generateEmbed( `Email List`, { 
          role, 
          assignedUsers: interaction.options.get('role').role.members.size, 
          emailsRelated: _.get(results, 'optedIn.length', 0) + _.get(results, 'optedOut.length', 0), 
          optedIn: _.get(results, 'optedIn.length', 0),
          optedOut:  _.get(results, 'optedOut.length', 0),
          emails: results.optedIn.map(el => el['Email Address']).join('\n')
        }), files: [{
          attachment: Buffer.from(utils.prepareEmailBulkUploadFile(role, results.optedIn, true), "utf-8"),
          name: `bulkUploadMe-${new Date().toISOString()}.csv`
        }] });  
      } else {
        const allRoles = _.cloneDeep(_.values(config.roles));
        const bulkUploadContent = [];
        let withHeader = true;
        allRoles.forEach(role => {
          const results = utils.getEmailsByRoles(role);
          bulkUploadContent.push(utils.prepareEmailBulkUploadFile(role, results.optedIn, withHeader));
          withHeader = false;
        });
        await interaction.editReply({ 
          ...utils.getEmailGroupStatsEmbed(),
          files: [{
            attachment: Buffer.from(bulkUploadContent.join('\n'), "utf-8"),
            name: `bulkUploadMe-${new Date().toISOString()}.csv`
          }]
        });
      }
    }

    else if (commandName === 'info') {
      const profile =  interaction.options.get('user').member;
      const userInfo = await utils.getUserInfo(profile);
      if (!userInfo || !userInfo.partnerId) {
        await interaction.editReply(`Registration not found for **${utils.getNickname(profile)}**`);
      } else {
        await interaction.editReply(utils.generateUserInfoEmbed(userInfo));
      }
    }

    else if (commandName === 'correlate') {
      await interaction.editReply(`Correlation started`);
      await interaction.editReply(await utils.correlateDiscordWithPartner());
      await interaction.editReply(`Correlation ended`);

    }

    else if (commandName === 'register') {
      const options = utils.mapOptions(interaction.options.data);
      const profileOutput = await utils.createProfile(options);
      await interaction.editReply(profileOutput);
    }

    else if (commandName === 'myprofile') {
      const updates = _.omit(utils.mapOptions(interaction.options.data), 'Email Address');
      const email = _.get(interaction.options.get('email'), 'value');
      const userInfo = await utils.getUserInfo(user);

      if (utils.isCorrelatedProfile(userInfo)) {
        if (!_.isEmpty(updates)) { 
          await utils.updateProfile(userInfo, updates);
          await interaction.editReply(`Profile updated`);
        }
        return await interaction.editReply(utils.generateUserInfoEmbed(userInfo));
      }

      if (!email){
        return await interaction.editReply(`Unable to locate your profile. Please redeem or generate with your email address first`);
      }

      if (!utils.isEmail(email)) {
        return await interaction.editReply(`Not a valid email **${email}**`);
      }

      const result = await utils.redeemProfile(userInfo, updates, email);
      if (result.success) {
        await interaction.editReply(result.success);
        await interaction.editReply(utils.generateUserInfoEmbed(userInfo));
      } else {
        await interaction.editReply(result.error);
      }
    }

  } catch (e) {
    await interaction.editReply({ content: `Unable to complete command **${commandName}**: ${e}`, ephemeral: true });
  }
}); 

// client.login logs the bot in and sets it up for use.
client.login(config.token);