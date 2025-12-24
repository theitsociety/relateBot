const { SlashCommandBuilder, Routes } = require('discord.js');
const _ = require('lodash');
const { REST } = require('@discordjs/rest');
const { clientId, guildId, token, publicCommands, privateCommands, mentorship, partnerConfig } = require(`./configs/service/config${process.env['NODE_ENV'] ? '_' + process.env['NODE_ENV'] : ''}.json`);

const commands = [];
const enabledCommands = { ... publicCommands, ...privateCommands };

if (_.keys(enabledCommands).includes('register')) {
  const optionMappings = _.get(partnerConfig, `notion.optionMappings`);
  const command = new SlashCommandBuilder()
    .setName('register')
    .setDescription(enabledCommands['register'])
  // required fields
  command
    .addStringOption(option =>
      option.setName('email')
        .setDescription(optionMappings['email'])
        .setRequired(true))
    .addStringOption(option =>
      option.setName('name')
        .setDescription(optionMappings['name'])
        .setRequired(true));
  // Optional fields
  for ( option in  _.omit(optionMappings, ["email", "name" ])) {
    command.addStringOption(o =>
      o.setName(option)
        .setDescription(optionMappings[option])
        .setRequired(false));
  }
  commands.push(command);
}

if (_.keys(enabledCommands).includes('invite')) {
  commands.push(new SlashCommandBuilder()
    .setName('invite')
    .setDescription(enabledCommands['invite'])
    .addStringOption(option =>
      option.setName('email')
        .setDescription('User email')
        .setRequired(true)));
}

if (_.keys(enabledCommands).includes('info')) {
  commands.push(new SlashCommandBuilder()
    .setName('info')
    .setDescription(enabledCommands['info'])
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user')
        .setRequired(true)));
}
  
if (_.keys(enabledCommands).includes('myprofile')) {
  commands.push(new SlashCommandBuilder()
    .setName('myprofile')
    .setDescription(enabledCommands['myprofile'])
    .addStringOption(option =>
      option.setName('email')
        .setDescription('Used only to redeem or create platform profile')
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
        .setRequired(false)));
}

if (_.keys(enabledCommands).includes('emails')) {
  commands.push(new SlashCommandBuilder()
    .setName('emails')
    .setDescription(enabledCommands['emails'])
    .addRoleOption(option =>
      option.setName('role')
        .setDescription('The role')
        .setRequired(false)));
}

if (_.keys(enabledCommands).includes('correlate')) {
  commands.push(new SlashCommandBuilder()
    .setName('correlate')
    .setDescription(enabledCommands['correlate']));
}
    
if (_.keys(enabledCommands).includes('references')) {
  commands.push(new SlashCommandBuilder()
    .setName('references')
    .setDescription(enabledCommands['references']));
}
    
if (_.keys(enabledCommands).includes('skills')) {
  commands.push(new SlashCommandBuilder()
    .setName('skills')
    .setDescription(enabledCommands['skills']));
}

if (_.some(_.keys(enabledCommands), ec => ec.startsWith('assign'))) {
  const newCommmand = new SlashCommandBuilder()
    .setName('assign')
    .setDescription("One-on-one assignments");
    
  if (_.keys(enabledCommands).includes('assign mentor')) {
    newCommmand.addSubcommand(subcommand =>
      subcommand
        .setName('mentor')
        .setDescription(enabledCommands['assign mentor'])
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
            .setDescription(`Mentorship category such as ${_.keys(mentorship.domains).slice(0, 13).join(', ')}`)
            .setRequired(true))
        .addStringOption(option =>
          option.setName('page')
            .setDescription('Link to the page created for this mentorship service')
            .setRequired(false)));
  }
  if (_.keys(enabledCommands).includes('assign community-builder')) {
    newCommmand.addSubcommand(subcommand =>
      subcommand
        .setName('community-builder')
        .setDescription(enabledCommands['assign community-builder'])
        .addStringOption(option =>
          option.setName('email')
            .setDescription('The member\'s email to be assigned')
            .setRequired(true))
        .addUserOption(option =>
          option.setName('user')
            .setDescription('Community Builder user')
            .setRequired(true)));
  }
  commands.push(newCommmand);
} 

const body = commands.map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

rest.put(Routes.applicationGuildCommands(clientId, guildId), { body })
	.then((data) => console.log(`Successfully registered ${data.length} application commands.`))
	.catch(console.error);