const ClientFactory = require('./clients');
const _ = require('lodash');
const BaseHelper = require('./baseHelper');
const utils = require('axios/lib/utils');
const Enum = require('./enum');
const { ChannelType , PermissionsBitField} = require('discord.js');
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

  purify (input, spaceChar = '') {
    return this.allReplace(input.replace(/[\s-_]+/g, spaceChar).toLowerCase(), { "ü": "u", "ğ": "g", "ı": "i", "ş":"s", "ç": "c", "ö": "o"});
  }

  getNickname(member) {
    return member.nickname || member.user.username || member.user.tag.split("#"[0]);
  }
  async correlateDiscordWithPartner () {

    this.logger(`Correlation analysis started at ${new Date}`, { consoleOnly: true});

    const guild = this.client.guilds.cache.get(this.config.guildId);
    await guild.members.fetch();

    const members = guild.members.cache.filter(member => !member.user.bot);

    const allRegistrations = await this.dataPartnerClient.fetchAll();
    const registrationsNotCorrelated = allRegistrations.filter(user => !user.id);
    const registrationsCanBeCorrelated = allRegistrations.filter(user => !user.Status);
    const registrationIndex = _.keyBy(allRegistrations, 'id');
    let newCorrelationCount = 0;
    members.forEach(async (member) => {
      const nickname = this.getNickname(member); 
      const purifiedNickname = this.purify(nickname)
      const match = registrationsNotCorrelated.find( user => this.purify(user["Full Name"]) === purifiedNickname);
      if (match) {
        newCorrelationCount++;
        const userInfo = _.pick(member.user, ["id", "tag"]);
        userInfo.nickname = nickname;
        userInfo.groups = [];
        userInfo.Status = Enum.Status.LANDED_ON_DISCORD;
        await this.dataPartnerClient.update({ ..._.pick(match, 'Email Address', 'partnerId'), ...userInfo});
        this.logger(`Correlating **${nickname}** account with registation for **${match["Full Name"]}**`)
        this.members.set(member.user.id, { ...match, ...userInfo})
      } else if (!registrationIndex[member.user.id]) {
        this.logger(`No match: ${nickname},${member.user.id}`, { consoleOnly: true});
      }
    });
  
    this.logger(`Correlation analysis ended at ${new Date}`, { consoleOnly: true});

    const output = this.generateEmbed("Correlation Results", {
      "Discord Members": members.size,
      "Registrations": allRegistrations.length,
      "Existing Correlations": allRegistrations.length - registrationsNotCorrelated.length,
      "Unrelated Discord Members": members.size - (allRegistrations.length - (registrationsNotCorrelated.length - newCorrelationCount)),
      "Unrelated Registrations": `${registrationsCanBeCorrelated.length - newCorrelationCount} of ${registrationsNotCorrelated.length - newCorrelationCount}`,
      "New Correlations": newCorrelationCount
    }, true);
    
    this.logger(output);
    return output;

  }

  async checActivityInMentorshipChannels() { 
    try {
      this.logger(`Checking activity in mentorship channels at ${new Date}`, { consoleOnly: true});
      const guild = this.client.guilds.cache.get(this.config.guildId);
      await guild.members.fetch();

      const mentorshipCategory = this.client.channels.cache.get(this.config.channels.mentorshipCategory);
      await mentorshipCategory.children.cache.forEach(async mentorshipChannel => {
        const lastMessage = (await mentorshipChannel.messages.fetch({ limit: 1 }) || []).first() || {};
        if (lastMessage.createdTimestamp && Date.now() - lastMessage.createdTimestamp > this.config.mentorship.remindAfter) {
          this.logger(`Sending follow-up message to <#${mentorshipChannel.id}>`);
          // console.log(`Sending follow-up message to #${mentorshipChannel.name}`);
          let users = ""; 
          for (let [guildMember] of mentorshipChannel.members) {
            const member = guild.members.cache.get(guildMember);
            // Exclude admins and mentor-relation group member in the follow-up message
            if (!member.user.bot && !member.permissionsIn(mentorshipChannel).has("Administrator") && !member.roles.cache.some(role => role.name === 'mentor-relations')){
              users += `<@${member.id}>, `;
              // users += `<@${member.displayName}>, `;
            }
          }
          // console.log(users);
          mentorshipChannel.send(`Hello ${users}
          \nThis is IT Society mentorship service. We are reaching out to check on the status of the mentorship service. Can you please provide us with an update on the following:\n * The overall progress\n * Any challenges or issues that have arisen in the service.\n * Any upcoming milestones
          \nThank you for your time and assistance in keeping the mentorship service running smoothly.`);
        }
      });
    }  catch (e) {
      this.logger(`Checking activity in mentorship channels failed but will retry: ${e}`)
    } finally {
      if (this.config.syncPeriodActivityInMentorshipChannels) {
        setTimeout(() => this.synMemberData(), this.config.syncPeriodActivityInMentorshipChannels);
      }
    }
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
          
      // Get users only with active roles
      for (const arole of Object.values(this.config.roles) ) {
        const roleDetails = guild.roles.cache.find(role => role.name === arole);
        if (!roleDetails) {
          continue; 
        }
        roleDetails.members.forEach(member => {
          let userInfo = this.members.get(member.user.id); 
          if (member.user.bot) {
            return;
          }
          if (!userInfo) {
            userInfo = _.pick(member.user, ["id", "tag"]);
            userInfo.nickname = this.getNickname(member);
            this.members.set(member.user.id, userInfo);
          }
          userInfo.groups = userInfo.groups || [];
          userInfo.groups.push(arole);
          userInfo.Status = Enum.Status.ROLE_SELECTED;
        });
      }
      
      // Fetch PII data
      const userData = await this.dataPartnerClient.fetchAll();
      const groupUpdates = [];
      for ( const data of userData) {
        // User already joined
        if (data.id) {
          const amember = this.members.get(data.id) || this.generateUserInfo(guild.members.cache.get(data.id));
          if (!amember) {
            continue;
          }          
          if (!_.isEqual(_.sortBy(amember.groups), _.sortBy(data.groups))) {
            groupUpdates.push({ ..._.pick(data, ['Email Address', 'partnerId']), ..._.pick(amember, [ "id", "tag", "nickname", "groups", "Status" ])});
            this.logger(`Updating groups for **${data["Full Name"]}**: **${amember.groups.join(", ")}**`)
            await this.manageEmailGroupsMembership(data, amember.groups, data.groups);
          }
          _.assign(amember, _.omit(data, [ "id", "tag", "nickname", "groups" ]));
        } else if (data.invite) {
          if (Date.now() - new Date(data["Last edited time"]) > this.config.registrations.remindAfter) {
            if (data.Status == Enum.Status.INVITATION_SENT) {
              await this.createInvite(data["Email Address"], data, true);
            } else if (data.Status == Enum.Status.INVITATION_RESENT) {
              await this.dataPartnerClient.update({ 
                ..._.pick(data, ["partnerId", "Email Address"]), 
                Status: Enum.Status.DORMANT,
                "Onboarding Status": Enum.Status.READY_TO_ASSIGN,
                "Discord Invite": ""
              });
              this.logger(`**${data["Full Name"]}** did not land on Discord even after reinvitation. Updating registration as dormant...`);
              this.logger(`Member with email **${data["Email Address"]}** did not land on Discord even after reinvitation. It is ready to assign to a community builder...`, { logChannel: this.config.channels.communityBuildersChannel});
            }
          } else {
            this.invites.set(data.invite, _.pick(data, ['Email Address', 'partnerId', 'Communication Preferences']));
          }
        }
        if (data["Onboarding Status"] == Enum.Status.ASSIGNED && 
            Date.now() - new Date(data["Last edited time"]) > this.config.onboarding.remindAfter) {
          await this.dataPartnerClient.update({ 
            ..._.pick(data, ["partnerId", "Email Address"]), 
            "Onboarding Status": Enum.Status.COMMUNICATION_PENDING
          });
          // TODO: Send email to community builder
          const communityBuilder = await this.dataPartnerClient.fetchById(data["Assigned Community Builder"]);
          if (communityBuilder) {
            this.emailPartnerClient.sendOnboardingReminderEmail({ 
              email: communityBuilder["Email Address"], 
              member: data["Full Name"],
              communityBuilder: communityBuilder["Full Name"]
            }).then( messageId => {
              this.logger(`Onboarding reminder email sent to **${communityBuilder["Full Name"]} (${communityBuilder["Email Address"]})**: ${messageId}`, { logChannel: this.config.channels.communityBuildersChannel});
            }).catch(e => {
              this.logger(`Unable to send onboarding reminder e-mail to **${communityBuilder["Email Address"]}**: ${e}`);
            })
          }
        }
      }
    
      if (!_.isEmpty(groupUpdates)){
        await this.dataPartnerClient.update(groupUpdates);
        this.logger(`Number of user profiles updated: ${groupUpdates.length}`, { consoleOnly: true});
      }

      this.logger(`Number of invites fetched: ${this.invites.size}`, { consoleOnly: true});
      this.logger(`Member data sync ended at ${new Date}`, { consoleOnly: true});

      this.logger(`Fetching awaiting referrings`, { consoleOnly: true});   
      const reinvitedReferrals = await this.dataPartnerClient.fetchByStatus(Enum.Status.INVITATION_RESENT, _.get(this.dataPartnerClient, `partnerConfig.request.referralDatabase`));
      for ( const referral of reinvitedReferrals) {
        if (Date.now() - new Date(referral["Last edited time"]) > this.config.referrals.remindAfter) {
          await this.dataPartnerClient.update({ ..._.pick(referral, ["partnerId", "Email Address"]), Status: Enum.Status.DORMANT});
          this.logger(`**${referral["Referral Name"]}** did not register even after reinvitation. Updating invitation as dormant..`);
          const referralsChannel = this.client.channels.cache.get(this.config.channels.referralsChannel);
          const message = (await referralsChannel.messages.fetch(referral.messageId));
          await message.react(this.config.referrals.dormantEmoji);
        }
      }   
      const pendingReferrals = await this.dataPartnerClient.fetchByStatus(Enum.Status.INVITATION_SENT, _.get(this.dataPartnerClient, `partnerConfig.request.referralDatabase`));
      for ( const referral of pendingReferrals) {
        if (Date.now() - new Date(referral["Last edited time"]) > this.config.referrals.remindAfter) {
          await this.inviteReferral(referral["Email Address"], referral.messageId, true, referral);
        }
      }
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
    if (roleMessage.partial) {
      // If the message this reaction belongs to was removed, the fetching might result in an API error which should be handled
      try {
        await roleMessage.fetch();
      } catch (error) {
        this.logger(`Something went wrong when fetching message: ${error}`);
        return;
      }
    }

    for (const [ emoji, reaction ] of roleMessage.reactions.cache) {
      if (reaction.partial) {
        try {
          await reaction.fetch();
        } catch (error) {
          this.logger(`Something went wrong when fetching message reactions: ${error}`);
          return;
        }
      }
    }

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
        member.Status = Enum.Status.ROLE_SELECTED
        this.logger(`Updating groups for **${user.username}**: **${member.groups.join(", ")}**`)
        await this.dataPartnerClient.update(_.pick(member, ['Email Address','groups', 'partnerId', 'id', 'tag', 'nickname', 'Status']));
        await this.manageEmailGroupsMembership(member, role);
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
        this.logger(`Updating groups for **${user.username}**: **${member.groups.join(", ")}**`)
        await this.dataPartnerClient.update(_.pick(member, ['Email Address','groups', 'partnerId', 'id', 'tag', 'nickname']));
        await this.manageEmailGroupsMembership(member, undefined, role);
      }
    });
  
  }
 
  async manageEmailGroupsMembership(member, newRoles = [] , oldRoles = []) {
    try {
      if (!this.shouldSendEmail(member)) {
        return;
      }
      newRoles = _.castArray(newRoles);
      oldRoles = _.castArray(oldRoles);
      const name = member['Full Name'] || member['nickname'] || "member";
      const groupsToBeAdded = _.difference(newRoles, oldRoles).map( role => `${role}@${this.emailPartnerClient.partnerConfig.email.domain}`);
      if (!_.isEmpty(groupsToBeAdded)) {
        this.logger(`Adding **${name}** to **${groupsToBeAdded.join(", ")}** email group(s)`);  
        await this.emailPartnerClient.addMemberToGroups(groupsToBeAdded, member['Email Address'], name);
      }
      const groupsToBeRemoved = _.difference(oldRoles, newRoles).map( role => `${role}@${this.emailPartnerClient.partnerConfig.email.domain}`);
      if (!_.isEmpty(groupsToBeRemoved)) {
        this.logger(`Removing **${name}** from **${groupsToBeRemoved.join(", ")}** email group(s)`);  
        await this.emailPartnerClient.deleteMemberFromGroups(groupsToBeRemoved, member['Email Address']);
      }
    } catch(e) {
      this.logger(`Error: ${_.get(e, "errors.0.message", e)}`);
    }
  }

  async inviteReferral(email, messageId, renewInvite = false, referral) {
    referral = referral || await this.dataPartnerClient.fetchReferral(email);
    const result = {};
    if (!referral) {
      result.error = `There is no referral with email address **${email}**.`;
    } else if (referral.Status === Enum.Status.REGISTERED ){
      result.error = `${email} already registered to IT Society`;           
    } else {
      if (!renewInvite) {
        this.logger(`**${referral["Referrer Name"]}** invited **${email}** to IT Society`);
      }
      let Status;
      await this.emailPartnerClient.sendReferralInvite({ 
        email, 
        referrer: referral["Referrer Name"],
        referral: referral["Referral Name"],
        notes: referral["Notes to Referral"]        
      }, renewInvite).then( mailId => {
        Status = renewInvite ? Enum.Status.INVITATION_RESENT: Enum.Status.INVITATION_SENT;
        this.logger(`${renewInvite ? "Reinvitation" : "Invitation"} e-mail sent to **${email}**: ${mailId}`);
      }).catch(e => {
        result.error = `Unable to send invitation e-mail sent to **${email}**: ${e}`;
      });
      if (Status) {
        await this.dataPartnerClient.update({ ..._.pick(referral, ["partnerId", "Email Address"]), Status, messageId});
        const referralsChannel = this.client.channels.cache.get(this.config.channels.referralsChannel);
        const message = (await referralsChannel.messages.fetch(messageId));
        await message.react(Status == Enum.Status.INVITATION_SENT ? this.config.referrals.inviteEmoji : this.config.referrals.remindEmoji);
      }
    }
    return result;
  }
  async finalizeReferral(email) {
    const referral = await this.dataPartnerClient.fetchReferral(email);
    if (!referral) {
      return;
    }
    await this.dataPartnerClient.update({ 
      ..._.pick(referral, ["partnerId", "Email Address"]), 
      Status: Enum.Status.REGISTERED
    });
    const referralsChannel = this.client.channels.cache.get(this.config.channels.referralsChannel);
    const message = await referralsChannel.messages.fetch(referral.messageId);
    if (message) {
      await message.react(this.config.referrals.registeredEmoji);
    }
    this.logger(`Referral record for **${referral["Referral Name"]}** moved to ${Enum.Status.REGISTERED}`);
    await this.emailPartnerClient.sendreferrerAckEmail({ 
      email: referral["Referrer Email"],
      referral: referral["Referral Name"]
    }).then( messageId => {
      this.logger(`Invitation accepted e-mail sent to **${referral["Referrer Name"]}**: **${messageId}**`);
    });
  }

  getValueFromEmbed(message, attribute) {
    return _.chain(message)
    .get("embeds.0.data.fields", {})
    .find( el => _.castArray(attribute).includes(el.name))
    .get('value')
    .value();
  }

  async createInvite(email, member, renewInvite) {
    member = member || await this.dataPartnerClient.fetch(email);
    const result = {};
    if (!member) {
      result.error = `There is no registration for **${email}**. Register first with \`/register\`command or through web site`;
    } else if (member.id){
      result.error = `${email} already joined Discord`;      
    } else if (!renewInvite && member.invite) {
      result.error = `${email} already invited`;      
    } else {
      // "👋welcome-and-rules channel by id
      const channel = this.client.channels.cache.get(this.config.channels.welcomeChannel);
      result.newInvite = await channel.createInvite({
        maxUses: 1, // After one use it will be void
        unique: true, // That tells the bot not to use an existing invite so that this will be unique
        maxAge: 86400 * 7 // Invites last 7 days. If you want to change that, modify this (0 = lasts forever, time in seconds)
      });

      this.invites.set(result.newInvite.code, _.pick(member, ["partnerId", "Email Address", "Communication Preferences"]));
      this.logger(`Invite created for **${email}** ${result.newInvite.url}`);
      let Status = Enum.Status.INVITATION_CREATED;
      this.emailPartnerClient.sendInvite({ email, invite: result.newInvite.url }, renewInvite).then( messageId => {
        Status = renewInvite ? Enum.Status.INVITATION_RESENT : Enum.Status.INVITATION_SENT;
        this.logger(`${renewInvite ? "Reinvitation" : "Invitation"} e-mail sent to **${email}**: ${messageId}`);
      }).catch(e => {
        this.logger(`Unable to send invitation e-mail sent to **${email}**: ${e}`);
      }).finally( () => {
        this.dataPartnerClient.update({ ..._.pick(member, ["partnerId", "Email Address"]), invite: result.newInvite.code, Status});
      });
    } 
    return result;
  }

  setRecentlyConsumedInviteCode(code) {
    const createdFor = this.invites.get(code);
    if (!createdFor) { 
      return
    }    
    this.logger(`Invite code consumed or expired: ${code}. Initially created for **${createdFor["Email Address"]}**`);
    this.recentlyConsumedInviteCode = code;
  }

  async relateRecentlyConsumedInviteCode(member) {
    try {
      const nickname = this.getNickname(member);
      if (this.recentlyConsumedInviteCode && this.invites.get(this.recentlyConsumedInviteCode)) {
        const userInfo = {
          id: member.user.id,
          nickname,
          invite: this.recentlyConsumedInviteCode,
          ...this.invites.get(this.recentlyConsumedInviteCode),
          tag: member.user.tag,
          Status: Enum.Status.LANDED_ON_DISCORD
        }
        const memberOnPartner = await this.dataPartnerClient.fetch(userInfo["Email Address"]);
        if (memberOnPartner["Onboarding Status"] == Enum.Status.PENDING) {
          userInfo["Onboarding Status"] = Enum.Status.READY_TO_ASSIGN;
          this.logger(`Member with email **${userInfo["Email Address"]}** landed on Discord. It is ready to assign to a community builder...`, { logChannel: this.config.channels.communityBuildersChannel});
        } else if ([Enum.Status.ASSIGNED, Enum.Status.COMMUNICATION_PENDING,  Enum.Status.COMMUNICATED].includes(memberOnPartner["Onboarding Status"]) && memberOnPartner["Assigned Community Builder"]) {
          const communityBuilder = await this.dataPartnerClient.fetchById(memberOnPartner["Assigned Community Builder"]);
          if (communityBuilder) {
            const channelName = await this.createOnboardingChannel({ id: userInfo.id, "Full Name": memberOnPartner["Full Name"] }, communityBuilder);  
            this.logger(`Member with email **${userInfo["Email Address"]}** landed on Discord. Community builder already assigned. Creating **${channelName}** channel for communication...`, { logChannel: this.config.channels.communityBuildersChannel});
          }
        }
        this.members.set(userInfo.id, _.omit(userInfo, 'id'));
        this.logger(`New member **${nickname}** is related to **${userInfo["Email Address"]}** by using invite code **${this.recentlyConsumedInviteCode}**`);
        this.invites.delete(this.recentlyConsumedInviteCode);
        this.recentlyConsumedInviteCode = undefined;
        await this.dataPartnerClient.update(userInfo);  
        await this.manageEmailGroupsMembership(userInfo, this.config.roles.all);
        if (!this.shouldSendEmail(userInfo)) {
          this.logger(`Landing email is skipped for  **${nickname}**`);
        } else {
          await this.emailPartnerClient.sendLandingEmail({ email: userInfo['Email Address'] }).then( messageId => {
            this.logger(`Landing e-mail sent to **${nickname}**: **${messageId}**`);
          });
        }
      } else {
        this.logger(`New member **${nickname}**. Unable to find invite code / email`);
      }  
    } catch (e) {
      this.logger(`Failed to relate invite code: ${e}`)
    }
  }

  async purgeMemberData(member) {
    const amember = this.members.get(member.user.id);
    this.logger(`**${this.getNickname(member)}** left IT Society Discord Server`);
    if (amember) {
      if (amember.partnerId) {
        await this.dataPartnerClient.update({
          partnerId: amember.partnerId,
          id: "",
          nickname: "",
          invite: "",
          tag: "",
          groups: [],
          Status: Enum.Status.LEFT_DISCORD 
        });
      }
      const groups = amember.groups || [];
      groups.push(this.config.roles.all);
      await this.manageEmailGroupsMembership(amember, undefined, groups);
      this.members.delete(member.user.id);
    }
  }

  shouldSendEmail(member) {
    return _.get(member, "Communication Preferences", []).includes("Do you want to be informed about event schedules?"); 
  }

  getEmailsByRoles(role) {
    if (!Object.values(this.config.roles).includes(role)) {
      return "Not a correlated role";
    }
    const allGroupMembers = Array.from(this.members.values())
      .filter(member => role == this.config.roles.all || _.get(member, "groups", []).includes(role));

    const optedIn = [], optedOut = []; 
    allGroupMembers.forEach(member => {
      if (!member["Email Address"]) {
        return;
      }
      if (this.shouldSendEmail(member)) {
        optedIn.push(_.pick(member, ["Email Address", "Full Name"]));
      } else {
        optedOut.push(_.pick(member, ["Email Address", "Full Name"]))
      } 
    });

    return {optedIn, optedOut};
  }

  prepareEmailBulkUploadFile(role, results, withHeader) {
    const output = [];
    if (withHeader) {
      output.push("Group Email [Required],Member Email,Member Name,Member Role,Member Type");
    }
    results.forEach(el => {
      output.push(`${role}@itsociety.org,${el["Email Address"]},${el["Full Name"]},MEMBER,USER`);
    });
    return output.join("\n");
  }

  generateUserInfoEmbed (userInfo) {
    const fields = [];
    this._addFields(fields, { "Discord Info": "\u200B" });
    this._addFields(fields, _.pick(userInfo, ["nickname", "tag", "groups"]), true);
    this._addFields(fields, { "\u200B": "\u200B" });
    this._addFields(fields, { "Registration Info": "\u200B" });
    this._addFields(fields, _.pick(userInfo, ["Full Name", "Job Title", "Company", "Country", "Email Address", "LinkedIn Account", "Referral", "Where did you hear us?", "Status", "Create Date", "Communication Preferences", "Contribution Preference"]), true);
    const skills = _.omitBy(_.pick(userInfo, _.get(this.dataPartnerClient, `partnerConfig.skills`, [])), _.isEmpty);
    if (!_.isEmpty(skills)) {
      this._addFields(fields, { "\u200B": "\u200B" });
      this._addFields(fields, { "Skills": "\u200B" });
      this._addFields(fields, skills);
    } 

    return this.generateEmbed("User Profile", fields, true);
  }


  getEmailGroupStatsEmbed() {
    const roles = Object.values(this.config.roles);
    const guild = this.client.guilds.cache.get(this.config.guildId);
    const fields = [];
    roles.forEach(arole => {
      const roleDetails = guild.roles.cache.find(role => role.name === arole);
      if (!roleDetails) {
        return;
      }
      const results = this.getEmailsByRoles(arole);
      fields.push([
        this.fixSize(arole, 16),
        this.fixSize(roleDetails.members.size, 7),
        this.fixSize(roleDetails.members.size - _.get(results, 'optedIn.length', 0) - _.get(results, 'optedOut.length', 0), 9),
        this.fixSize(_.get(results, 'optedIn.length', 0) + _.get(results, 'optedOut.length', 0), 9),
        this.fixSize(_.get(results, 'optedIn.length', 0), 7)
      ].join(""));
    });

    return this.generateEmbed("Email Groups", [{ 
      name: [
        this.fixSize("Role", 42),
        this.fixSize("Users", 10),
        this.fixSize("No Email", 11),
        this.fixSize("Found Email", 16),
        "Opted In",
      ].join(""),
      value: "```" + fields.join("\n") + "```"
    }]);
  }

  fixSize(input, size) {
    if (_.isInteger(input)) {
      input = _.padStart(input, 3, ' ');
    }
    return _.chain(input).
      truncate({
         'length': size - 3,
         'omission': '...'
      }).
      padEnd(size,' ').
      value();
  } 

  generateEmbed(title, input, inline = false) {
    let fields = [];
    if (_.isArray(input)) {
      fields = input;
    } else {
      this._addFields(fields, input, inline);
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
      const value = !_.isArray(source[key]) ? (source[key] || "\u200B") : source[key].join(_.get(source[key],'0.length', 0) > 25 ? '\n' : ', ');
      fields.push({
        "name": key === "\u200B" ? key : _.startCase(key),
        value: (value || "\u200B"),
        inline: value.length > 40 ? false : inline
      })
    }
  }

  isEmail (email) {
    const emailRegExp = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
    return emailRegExp.test(email);
  }

  mapOptions (data) {
    const options = {};
    _.forEach( data, el => {
      options[_.get(this.dataPartnerClient, `partnerConfig.optionMappings.${el.name}`, el.name)] = el.value;
    });
    return options;
  }

  isCorrelatedProfile(userInfo) {
    return userInfo && userInfo.partnerId;
  }
  async updateProfile(userInfo, updates = {}) {
    _.extend(userInfo, updates);
    await this.dataPartnerClient.update({ ...userInfo });
  }

  async createProfile(userInfo) {
    const member = await this.dataPartnerClient.fetch(userInfo["Email Address"]);
    if (member) {
      throw `**${userInfo["Email Address"]}** already registered`;
    }
    userInfo.Status = Enum.Status.REGISTERED;
    userInfo["Communication Preferences"] = [
      "Do you want to be informed about event schedules?",
      "Do you want us to share with you additional opportunities that The IT Society members can benefit fr"
    ];
    await this.dataPartnerClient.insert({ ...userInfo });
    return this.generateEmbed("New Registration", _.pick(userInfo, ["Full Name", "Email Address", "Job Title", "Company", "Communication Preferences"]), false);
  }

  async createPrivateChannel (name, users = [], topic, parent) {
    const options = {
      name,
      type: ChannelType.GuildText,
      topic,
      parent
    };
    const guild = this.client.guilds.cache.get(this.config.guildId);
    if (!_.isEmpty(users)) {
      options.permissionOverwrites = [{
        id: guild.roles.everyone.id, // shortcut for @everyone role ID
        deny: PermissionsBitField.Flags.ViewChannel
      }];

      for(const id of users) {
        options.permissionOverwrites.push({
          id,
          allow: [ PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ManageRoles]
        });
      };
    }
   return guild.channels.create(options);
  }

  async createOnboardingChannel(member, communityBuilder) {
    const channelName = this.purify(member["Full Name"]);
    const channel = await this.createPrivateChannel(channelName, [member.id, communityBuilder.id], `Onboarding ${member["Full Name"]}`, this.config.channels.onboardingCategory);
    await channel.send(`<@${member.id}> welcome to IT Society Discord Server. \n\n<@${communityBuilder.id}> will assist in your onboarding process. Please use this private channel to reach out for any questions you might have.`);  
    return channel;
  }

  async createMentorChannel(category, mentor, mentee, topic) {
    const channelName = category + "-" + this.purify(mentee["Full Name"], '-');
    const channel = await this.createPrivateChannel(channelName, [mentor.id, mentee.id], topic || `Mentoring ${mentee["Full Name"]}`, this.config.channels.mentorshipCategory);
    await channel.send(`**Welcome onboard <@${mentee.id}>,**
    \nThis is your private channel for your mentorship service. You, your mentor, and the admins can see the messages posted.\n\nEvery mentorship is unique, however, successful mentorships share some characteristics. Mutual respect, a two-way professional relationship, communication and listening, constructive feedback and active listening, honest effort and commitment, showing up and trying your hardest, and realistic expectations are essential in setting up a successful mentorship.
    \nPlease align with the following steps during the mentorship service.
    \n**1) Using Discord as a Communication Tool:**\na) IT Society uses DISCORD as its communication tool.\nb) Please do not use any other platform for mentor/mentee communication.\nc) There are multiple channels available for use such as “mentor-room-1”, and “mentor-room-2” under VOICE CHANNELS which can be used for meetings.\nd) Mentee should not request Mentor's private communication info.\ne) When using Discord, please use your mentorship channel rather than direct messaging. This is important for tracking mentorship service quality.
    \n**2) Adjusting Notification Settings:**\na) Please click the name of this channel while you are inside the channel\nb) Click "Notifications" from the upper bar\nc) Click "Notification Settings"\nd) Select "All Messages"
    \n**3) Message Responses:**\na) Mentors and mentees should quickly respond to channel messages in order to continue the engagement. Late responses might decrease the energy level.
    \n**4) Meeting Times:**\na) Meeting times and periods depend on need, but weekly scheduled/standup meetings are recommended.\nb) Meeting action items should be posted in the channel and due dates should be included, alternatively, you can use the notion page for your meeting notes. The address of the notion page can be seen in the Discord “channel topic”.\n`);  
    await channel.send(`** **\n**5) The Scope of Mentorship Service:**\na) Mentorship service only includes support of your professional development/progress in your work-life\nb) Any kind of personnel issues/problems/supports are beyond the current scope of the mentorship service. Please avoid opening discussions related to your personal/private life.
    \n**6) Archiving Channel:**\na) The channel will be archived when the service is no longer needed.\nb) If there are no new messages in the channel for a period of 30 days, the channel will be archived after confirming with the mentor and the mentee.\n\n**7) Feedback:**\na) Feel free to contact us for any kind of problems or feedback via **info@itsociety.org**
    \n\n<@${mentor.id}> has been assigned as your mentor, please start asking your questions and set up a kickoff meeting.`);
    return channel;
  }

  async assignCommunityBuilder(options) {
    const result = {};
    const member = await this.dataPartnerClient.fetch(options["Email Address"]);
    if (!member) {
      result.error = `Unable to find registration for **${options["Email Address"]}**`;
    } else if (![Enum.Status.READY_TO_ASSIGN, Enum.Status.DORMANT].includes(member["Onboarding Status"])){
      result.error = `Unable to assign. **${options["Email Address"]}**'s onboarding status: **${member["Onboarding Status"]}**.`;
    } else {
      const communityBuilder = await this.getUserInfo(options.communityBuilder);
      if (!communityBuilder|| !communityBuilder.partnerId) {
        result.error = `Registration not found for **${this.getNickname(options.communityBuilder)}**`;
      } else {
        member["Onboarding Status"] = Enum.Status.ASSIGNED;
        member["Assigned Community Builder"] = communityBuilder.partnerId;
        result.success = `**${member["Full Name"]}** assigned to Community Builder <@${communityBuilder.id}> successfully.`;

        if (member.id && communityBuilder.id) {
          const channel = await this.createOnboardingChannel(member, communityBuilder);
          member["Onboarding Channel"] = channel.id;
          result.success += `\nCreated <#${channel.id}> channel for communication.`;
        }
        await this.dataPartnerClient.update({ ...member });
  
        await this.emailPartnerClient.sendOnboardingAssignmentEmail({ 
          email: [ member["Email Address"], communityBuilder["Email Address"] ], 
          member: member["Full Name"],
          communityBuilder: communityBuilder["Full Name"]
        }).then( messageId => {
          result.success += `\nOnboarding assigment email sent to **${communityBuilder["Email Address"]}** and **${member["Email Address"]}**: ${messageId}`;
        }).catch(e => {
          this.logger(`Unable to send onboarding reminder e-mail to **${communityBuilder["Email Address"]}** and **${member["Email Address"]}**: ${e}`);
        });
      }
    }    
    return result;
  }

  async assignMentor(options) {
    const result = {
      success: ""
    };
    const [ mentor, mentee ] = await Promise.all([ this.getUserInfo(options.mentor), this.getUserInfo(options.mentee) ]);
    if (!mentor || !mentor["Email Address"]) {
      result.error = `Registration not found for **${this.getNickname(options.mentor)}**`;
    } else if (!mentee || !mentee["Email Address"]) {
      result.error = `Registration not found for **${this.getNickname(options.mentee)}**`;
    } else if (!this.config.mentorship.domains[options.category]){
      result.error = `${options.category} is not one of supported categories: ${_.keys(options.category).join(", ")}`;
    }else {
      if (!options.page) {
        options.page = _.get(await this.dataPartnerClient.insert({ 
          Name: mentee["Full Name"],
          Domain: this.config.mentorship.domains[options.category],
          Mentor: mentor.partnerId,
          Status: Enum.Status.ONGOING,
          "Mentor Assignment Date": new Date().toISOString().split('T')[0]
        }, _.get(this.dataPartnerClient, `partnerConfig.request.mentorshipDatabase`)), "url");
        result.success += `Notion page is created. Please visit the page and grant access to mentor/mentee.\n${options.page}\n`;
      }
      const channel = await this.createMentorChannel(options.category, mentor, mentee, options.page);
      result.success += `**${mentor["Full Name"]}** assigned as **${mentee["Full Name"]}**'s mentor.\nCreated private <#${channel.id}> channel for communication.`;

      await this.emailPartnerClient.sendMentorAssignmentEmail({ 
        email: [ mentor["Email Address"], mentee["Email Address"] ], 
        mentor: mentor["Full Name"],
        mentee: mentee["Full Name"],
        channel: channel.name
      }).then( messageId => {
        result.success += `\nMentor assigment email sent to **${mentor["Email Address"]}** and **${mentee["Email Address"]}**: ${messageId}`;
      }).catch(e => {
        this.logger(`Unable to send onboarding reminder e-mail to **${mentor["Email Address"]}** and **${mentee["Email Address"]}**: ${e}`);
      });
    }
    return result;
  }

  getRoles(member) {
    return member.roles.cache.filter(role => Object.values(this.config.roles).includes(role.name)).map(role => role.name)
  }

  generateUserInfo(member) {
    if (!member) {
      return 
    }
    const userInfo = {
      id: member.id,
      nickname: this.getNickname(member),
      tag: member.user.tag,
      groups: this.getRoles(member)
    }
    userInfo.Status = _.isEmpty(userInfo.groups) ? Enum.Status.LANDED_ON_DISCORD : Enum.Status.ROLE_SELECTED;
    this.members.set(userInfo.id, _.omit(userInfo, 'id'));
    return this.members.get(userInfo.id);
  }
  
  async getUserInfo(member) {
    let userInfo = this.members.get(member.id) || this.generateUserInfo(member);
    userInfo.id = userInfo.id || member.id;
    if (userInfo["Email Address"]) {
      const data = await this.dataPartnerClient.fetchWithSkills(userInfo["Email Address"]);  
      if (data) {
        _.extend(userInfo, _.omit(data, _.values(this.dataPartnerClient.partnerConfig.keymappings)));
      }
    }
    return userInfo;
  }
      
  async redeemProfile(userInfo, updates, email) {
    const result = {};
    const data = await this.dataPartnerClient.fetch(email);
    if (_.get(data, 'id') && _.get(data, 'id') != userInfo.id) {
      result.error = `**${email}** already redeemed by another user`;
    } 
    else {
      userInfo.Status = _.isEmpty(userInfo.groups) ? Enum.Status.LANDED_ON_DISCORD : Enum.Status.ROLE_SELECTED;
      if (data) {
        _.extend(userInfo, updates);
        _.defaults(userInfo, data);
        await this.dataPartnerClient.update({ ...userInfo });
        result.success = "Profile redeemed";
      }
      else if (!updates["Full Name"] || !updates["Email Address"]){ 
        result.error = `Name and email are required to create profile`;
      } else {
        _.extend(userInfo, updates);
        userInfo["Communication Preferences"] = [
          "Do you want to be informed about event schedules?",
          "Do you want us to share with you additional opportunities that The IT Society members can benefit fr"
        ];
        userInfo.partnerId = _.get(await this.dataPartnerClient.insert({ ...userInfo }), 'id');
        result.success = "Profile created"; 
      }  
    }
    return result;
  }

  async evaluateSkills() {
    let allSkills = await this.dataPartnerClient.fetchAll(_.get(this.dataPartnerClient, `partnerConfig.request.skillDatabase`));
    const skillCategories = _.get(this.dataPartnerClient, `partnerConfig.skills`, []);
    allSkills = _.map(allSkills,  el => _.chain(el)
      .pick(skillCategories)
      .mapValues( sk => sk.split(', '))
      .value());
    
    const fields = [];
    for (const name of skillCategories) {
      fields.push({
        name, 
        value: "```" + _.chain(allSkills)
          .flatMap(name)
          .countBy()
          .toPairs()
          .orderBy([1], ['desc'])
          .map( pair => pair[0] ? (this.fixSize(pair[0], 30) + pair[1]) : undefined)
          .compact()
          .join("\n")
          .value() + "```"
      });
    }
    return this.generateEmbed("Skills", fields);
  }


}

module.exports = Utils;