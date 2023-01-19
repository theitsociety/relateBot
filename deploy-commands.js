const { SlashCommandBuilder, Routes } = require('discord.js');
const { REST } = require('@discordjs/rest');
const { clientId, guildId, token } = require(`./configs/service/config${process.env['NODE_ENV'] ? '_' + process.env['NODE_ENV'] : ''}.json`);

const commands = [
  new SlashCommandBuilder()
    .setName('register')
    .setDescription('Registers a user!')
    .addStringOption(option =>
      option.setName('email')
        .setDescription('User email')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('name')
        .setDescription('Full Name')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('company')
        .setDescription('Company')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('title')
        .setDescription('Job Title')
        .setRequired(false)),

  new SlashCommandBuilder()
    .setName('invite')
    .setDescription('Creates Discord invite for an email address!')
    .addStringOption(option =>
      option.setName('email')
        .setDescription('User email')
        .setRequired(true)),

  new SlashCommandBuilder()
    .setName('info')
    .setDescription('Returns all available info about user')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user')
        .setRequired(true)),
  
  new SlashCommandBuilder()
    .setName('myprofile')
    .setDescription('Shows, redeems or creates your IT Society profile')
    .addStringOption(option =>
      option.setName('email')
        .setDescription('Used only to redeem or create IT Society profile')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('name')
        .setDescription('Full Name')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('company')
        .setDescription('Company')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('title')
        .setDescription('Job Title')
        .setRequired(false)),

  new SlashCommandBuilder()
    .setName('emails')
    .setDescription('Returns email list for a role')
    .addRoleOption(option =>
      option.setName('role')
        .setDescription('The role')
        .setRequired(false)),

  new SlashCommandBuilder()
    .setName('correlate')
    .setDescription('Correlates Discord members and registrations via server nickname'),
    
  new SlashCommandBuilder()
    .setName('skills')
    .setDescription('Show strong skills of IT Society members'),

  new SlashCommandBuilder()
    .setName('assign')
    .setDescription('Assign a member to community builder / mentor')
    .addSubcommand(subcommand =>
      subcommand
        .setName('mentor')
        .setDescription('Assign a mentor')
        .addUserOption(option =>
          option.setName('mentee')
            .setDescription('Mentee user')
            .setRequired(true))
        .addUserOption(option =>
          option.setName('mentor')
            .setDescription('Mentor user')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('category')
            .setDescription('Mentorship category such as qa, se, security, data, mobile, devops, sf')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('page')
            .setDescription('Link to Notion page created for the mentorship service')
            .setRequired(false)))     
    .addSubcommand(subcommand =>
      subcommand
        .setName('community-builder')
        .setDescription('Assign a community-builder')
        .addStringOption(option =>
          option.setName('email')
            .setDescription('The member\'s email to be assigned')
            .setRequired(true))
        .addUserOption(option =>
          option.setName('user')
            .setDescription('Community Builder user')
            .setRequired(true))) 

].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands })
	.then((data) => console.log(`Successfully registered ${data.length} application commands.`))
	.catch(console.error);