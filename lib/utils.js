const ClientFactory = require('./clients');
const _ = require('lodash');
const BaseHelper = require('./baseHelper');
const utils = require('axios/lib/utils');

class Utils extends BaseHelper {
  constructor(client, config) {
    super(config);
    this.client = client;
    this.config = config;
    this.invites = new Map();
    this.members = new Map();
    const clientFactory = new ClientFactory(config);
    this.dataPartnerClient = clientFactory.getClient(config.dataPartner);
    this.emailPartnerClient = clientFactory.getClient(config.emailPartner); 
  }

  allReplace (retStr, obj) {
    for (var x in obj) {
        retStr = retStr.replace(new RegExp(x, 'g'), obj[x]);
    }
    return retStr;
  };

  purify (input) {
    return this.allReplace(input.replace(/[\s-_]+/g, '').toLowerCase(), { "ü": "u", "ğ": "g", "ı": "i", "ş":"s", "ç": "c", "ö": "o"});
  }

  async correlateDiscordvsNotion () {

    this.logger(`Correlation analysis started at ${new Date}`, { consoleOnly: true});

    const guild = this.client.guilds.cache.get(this.config.guildId);
    await guild.members.fetch();

    const members = guild.members.cache.filter(member => !member.user.bot);

    const allRegistrations = await this.dataPartnerClient.fetchAll();
    const registrationsNotCorrelated = allRegistrations.filter(user => !user.id);
    const registrationIndex = _.keyBy(allRegistrations, 'id');
    let newCorrelationCount = 0;
    members.forEach(async (member) => {
      const nickname = member.nickname || member.user.username || member.user.tag.split("#"[0]); 
      const purifiedNickname = this.purify(nickname)
      const match = registrationsNotCorrelated.find( user => this.purify(user["Full Name"]) === purifiedNickname);
      if (match) {
        newCorrelationCount++;
        const userInfo = _.pick(member.user, ["id", "tag"]);
        userInfo.nickname = member.nickname || member.user.username;
        userInfo.groups = [];
        await this.dataPartnerClient.update({ ..._.pick(match, 'Email Address', 'partnerId'), ...userInfo});
        this.logger(`Correlating **${nickname}** account with registation for **${match["Full Name"]}**`)
        this.members.set(member.user.id, { ...match, ...userInfo})
      } else if (!registrationIndex[member.user.id]) {
        this.logger(`No match: ${nickname},${member.user.id}`, { consoleOnly: true});
      }
    });
  
    this.logger(`Correlation analysis ended at ${new Date}`, { consoleOnly: true});

    this.logger(this.generateEmbed("Correlation Results", {
      "Discord Members": members.size,
      "Registrations": allRegistrations.length,
      "Existing Correlations": allRegistrations.length - registrationsNotCorrelated.length,
      "Unrelated Discord Members": members.size - (allRegistrations.length - (registrationsNotCorrelated.length - newCorrelationCount)),
      "Unrelated Registrations": registrationsNotCorrelated.length - newCorrelationCount,
      "New Correlations": newCorrelationCount
    }));
    

  }

  async synMemberData() {
    try {
      const guild = this.client.guilds.cache.get(this.config.guildId);
      await guild.members.fetch();

      this.logger(`Member data sync started at ${new Date}`, { consoleOnly: true});

      // we will fetch group updates
      this.members.forEach(member => {
        _.set(member, 'groups', []);
      });
    
      // this.logger(this.members.get('815246962555224064'), { consoleOnly: true});
      
      // Get users only with active roles
      for (const arole of Object.values(this.config.roles) ) {
        const roleDetails = guild.roles.cache.find(role => role.name === arole);
        if (!roleDetails) {
          this.logger(`Unable to find role ${arole}`);
          continue; 
        }
        roleDetails.members.forEach(member => {
          let userInfo = this.members.get(member.user.id); 
          if (member.user.bot) {
            return;
          }
          if (!userInfo) {
            userInfo = _.pick(member.user, ["id", "tag"]);
            userInfo.nickname = member.nickname || member.user.username;
            this.members.set(member.user.id, userInfo);
          }
          userInfo.groups = userInfo.groups || [];
          userInfo.groups.push(arole);
        });
      }
      // this.logger(this.members.get('815246962555224064'), { consoleOnly: true});
      
      // Fetch PII data
      const userData = await this.dataPartnerClient.fetchAll();
      const groupUpdates = [];
      for ( const data of userData) {
        // User already joined
        if (data.id) {
          const amember = this.members.get(data.id);
          if (amember) {
            if (!_.isEqual(_.sortBy(amember.groups), _.sortBy(data.groups))) {
              groupUpdates.push({ ..._.pick(data, ['Email Address', 'partnerId']), ..._.pick(amember, [ "id", "tag", "nickname", "groups" ])});
              this.logger(`Updating groups for **${data["Full Name"]}**: **${amember.groups.join(", ")}**`)
            }
            _.assign(amember, _.omit(data, [ "id", "tag", "nickname", "groups" ]));
            
          }
        } else if (data.invite) {
          this.invites[data.invite] = _.pick(data, ['Email Address', 'partnerId']);
        }
      }
    
      if (!_.isEmpty(groupUpdates)){
        await this.dataPartnerClient.update(groupUpdates);
      }

      this.logger(`Member data sync ended at ${new Date}`, { consoleOnly: true});

    } catch (e) {
      this.logger(`Member data sync failed but will retry: ${e}`)
    } finally {
      if (this.config.syncPeriod) {
        setTimeout(() => this.synMemberData(), this.config.syncPeriod);
      }
    }
  }

  async collectRoleSelections() {
    const roleChannel = this.client.channels.cache.get(this.config.channels.roleSelectionChannel);
    const roleMessage = (await roleChannel.messages.fetch({ limit: 1 })).first();
    const filter = (reaction, user) => _.keys(this.config.roles).includes(reaction.emoji.name) && !user.bot;
    // const reactions = await roleMessage.awaitReactions({ filter });
    const collector = await roleMessage.createReactionCollector({ filter, dispose: true });

    collector.on('collect', async (reaction, user) => {
      const member = this.members.get(user.id);
      const role = this.config.roles[reaction.emoji.name];
      if (!member || !role) {
        return 
      }
      this.logger(`**${user.username}** (${user.tag}) selected ${reaction.emoji.name} **${role}** role.`);
      member.groups = member.groups || [];
      if (member.groups.includes(role)) {
        return 
      }
      member.groups.push(role);
      if (member["Email Address"]) {
        await this.dataPartnerClient.update(_.pick(member, ['Email Address','groups', 'partnerId', 'id', 'tag', 'nickname']));
        this.logger(`Updating groups for **${user.username}**: **${member.groups.join(", ")}**`)
      }
    });
  
    collector.on('remove', async (reaction, user) => {
      const member = this.members.get(user.id);
      const role = this.config.roles[reaction.emoji.name];
      if (!member || !role) {
        return 
      }
      this.logger(`**${user.username}** (${user.tag}) revoked ${reaction.emoji.name} **${role}** role.`);
      member.groups = member.groups || [];
      if (!member.groups.includes(role)) {
        return 
      }
      _.remove(member.groups, group => group === role);
      if (member["Email Address"]) {
        await this.dataPartnerClient.update(_.pick(member, ['Email Address','groups', 'partnerId', 'id', 'tag']));
        this.logger(`Updating groups for **${user.username}**: **${member.groups.join(", ")}**`)
      }
    });
  
  }
 
  async createInvite(email) {
    const member = await this.dataPartnerClient.fetch(email);
    const result = {};
    if (!member) {
      result.error = `Unable to find registration for this email: ${email}`;
    } else if (member.id){
      result.error = `${email} already joined Discord`;      
    } else {
      // "👋welcome-and-rules channel by id
      const channel = this.client.channels.cache.get(this.config.channels.welcomeChannel);
      result.newInvite = await channel.createInvite({
        maxUses: 1, // After one use it will be void
        unique: true, // That tells the bot not to use an existing invite so that this will be unique
        maxAge: 86400 * 7 // Invites last 7 days. If you want to change that, modify this (0 = lasts forever, time in seconds)
      });

      this.invites.set(result.newInvite.code, _.pick(member, ["partnerId", "Email Address"]));
      this.logger(`Invite created for **${email}** ${result.newInvite.url}`);
      let inviteSent = "Yes";
      this.emailPartnerClient.sendInvite({ email, invite: result.newInvite.url }).then( messageId => {
        this.logger(`Invitation e-mail sent to **${email}**: ${messageId}`);
      }).catch(e => {
        inviteSent = "No";
        this.logger(`Unable to send invitation e-mail sent to **${email}**: ${e}`);
      }).finally( () => {
        this.dataPartnerClient.update({ ..._.pick(member, ["partnerId", "Email Address"]), invite: result.newInvite.code, "Invite Sent": inviteSent});
      });
    } 
    return result;
  }

  setRecentlyConsumedInviteCode(code) {
    this.recentlyConsumedInviteCode = code;
  }

  async relateRecentlyConsumedInviteCode(member) {
    try {
      if (this.recentlyConsumedInviteCode && this.invites.get(this.recentlyConsumedInviteCode)) {
        const userInfo = {
          id: member.user.id,
          nickname: member.nickname || member.user.username || member.user.tag.split("#"[0]),
          invite: this.recentlyConsumedInviteCode,
          ...this.invites.get(this.recentlyConsumedInviteCode),
          tag: member.user.tag
        }
        this.members.set(userInfo.id, _.omit(userInfo, 'id'));
        this.logger(`New member **${userInfo.nickname || userInfo.tag}** is related to **${userInfo["Email Address"]}** by using invite code **${this.recentlyConsumedInviteCode}**`);
        this.recentlyConsumedInviteCode = undefined;
        await this.dataPartnerClient.update(userInfo);  
      } else {
        this.logger(`New member **${member.user.nickname}**. Unable to find invite code / email`);
      }  
    } catch (e) {
      this.logger(`Failed to relate invite code: ${e}`)
    }
  }

  async purgeMemberData(member) {
    const amember = this.members.get(member.user.id);
    if (amember) {
      if (amember.partnerId) {
        await this.dataPartnerClient.update({
          partnerId: amember.partnerId,
          id: "",
          nickname: "",
          invite: "",
          tag: "",
          groups: []
        });
      }
      this.members.delete(member.user.id);
    }
  }

  getEmailsByRoles(role) {
    if (!Object.values(this.config.roles).includes(role)) {
      return "Not a correlated role";
    }
    return Array.from(this.members.values())
      .filter(member => (member.groups || []).includes(role))
      .map(member => member["Email Address"])
      .filter(item => item)
      .join('\n');
  }

  generateUserInfo (userInfo) {
    const fields = [];
    this._addFields(fields, { "Discord Info": "\u200B" });
    this._addFields(fields, _.pick(userInfo, ["nickname", "invite", "tag", "groups"]), true);
    this._addFields(fields, { "\u200B": "\u200B" });
    this._addFields(fields, { "Registration Info": "\u200B" });
    this._addFields(fields, _.omit(userInfo, ["nickname", "invite", "tag", "groups", "id", "partnerId", "Skills"]), true);
    return this.generateEmbed("User Detail", fields);
  }

  generateEmbed(title, input) {
    let fields = [];
    if (_.isArray(input)) {
      fields = input;
    } else {
      this._addFields(fields, input, true);
    }  

    return {
      "embeds": [
        {
          "type": "rich",
          title,
          "description": "",
          "color": 0x00FFFF,
          fields,
          "thumbnail": {
            "url": `https://static.wixstatic.com/media/9e2e73_1e88b4e794da46969fe0dcb9dc7981e1~mv2.png/v1/fill/w_216,h_162,al_c,q_85,usm_0.66_1.00_0.01,enc_auto/IT_society_logo_edited.png`,
            "proxy_url": `https://itsociety.org`,
            "height": 0,
            "width": 0
          },
          "author": {
            "name": `IT Society`,
            "url": `https://itsociety.org`
          }
        }
      ]
    }
  }

  _addFields (fields, source, inline = false) {
    for (const key in source) {
      const value = _.isArray(source[key]) ? source[key].join(', ') : (source[key] || "\u200B");
      fields.push({
        "name": key === "\u200B" ? key : _.startCase(key),
        value,
        inline: value.length > 40 ? false : inline
      })
    }
  }

}

module.exports = Utils;