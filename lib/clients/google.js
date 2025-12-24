

const { google } = require('googleapis');
const MailComposer = require('nodemailer/lib/mail-composer');
const BaseHelper = require('../baseHelper');
const fs = require('fs');
const path = require('path');
const _ = require('lodash');

class GoogleClient extends BaseHelper {

  constructor(partnerConfig, serviceConfig) {
    super(serviceConfig);
    this.partnerConfig = partnerConfig;
    const { client_secret, client_id, redirect_uris } = partnerConfig.credentials;
    this.oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
    // Load templates
    this.templates = {};
    _.forEach(this.partnerConfig.email.templates, (value, key) => {
      this.templates[key] = _.template(fs.readFileSync(path.join(__dirname, '../../data/templates/', value)))
    });
  }

  async _getTokensWithCode() {
    const { code } = credentials.credentials;
    return await this.oAuth2Client.getToken(code);  
  }

  async _getTokenWithRefresh () {
    const { tokens: { refresh_token } } = this.partnerConfig.credentials;
    this.oAuth2Client.setCredentials({
      refresh_token: refresh_token
    });
    return this.oAuth2Client.refreshAccessToken().then(response => {
      this.partnerConfig.credentials.tokens = response.credentials;
    }).catch(e => {
      throw Error("Unable to get token:", e);
    });
}

  async _getGmailService() {
    await this._getTokenWithRefresh();
    this.oAuth2Client.setCredentials(this.partnerConfig.credentials.tokens);
    const gmail = google.gmail({ version: 'v1', auth: this.oAuth2Client });
    return gmail;
  }

  async _getDirectoryService() {
    await this._getTokenWithRefresh();
    const service = google.admin({version: 'directory_v1', auth: this.oAuth2Client});
    return service;
  }

  async listGroup(groupKey) {
    const service = await this._getDirectoryService();
    return await service.members.list({
      groupKey
    });
  }

  async addMemberToGroups(groups, email, member) {
    const service = await this._getDirectoryService();
    const calls = [];

    _.castArray(groups).forEach( groupKey => {
      calls.push(service.members.insert({
        groupKey,
        requestBody: {
          email,
          member,
          role: 'MEMBER',
          type: 'USER'
        }
      }));
    });
    return Promise.all(calls);
  }

  async deleteMemberFromGroups(groups, memberKey) {
    const service = await this._getDirectoryService();
    const calls = [];

    _.castArray(groups).forEach( groupKey => {
      calls.push(service.members.delete({
        groupKey,
        memberKey
      }));
    });
    return Promise.all(calls);
  }


  _encode(message) {
    return Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  
  async _create(options) {
    const mailComposer = new MailComposer(options);
    const message = await mailComposer.compile().build();
    return this._encode(message);
  }
  
  async sendMail(options) {
    const gmail = await this._getGmailService();
    const rawMessage = await this._create(options);
    const { data: { id } = {} } = await gmail.users.messages.send({
      userId: 'me',
      resource: {
        raw: rawMessage,
      },
    });
    return id;
  };

  async sendEmailWithTemplate(template, options) {
    const content = {
      ...this.partnerConfig.email.defaults,
      to: options.email,
      subject:`${this.config.platform.name}: `
    };
    const footerOptions = {
      disclaimer: ""
    };
    _.extend(options, _.pick(this.config, ['channels', 'references', 'platform']));
    // Customize this block for each template
    if (template == "donationReceipt") {
    footerOptions.disclaimer =  `You are receiving this email because you donated to ${this.config.platform.name}`;
    content.subject += `Donation Received for Invoice #${options.invoiceNumber} 🧾`;
    } else if (template == "landingEmail") {
      footerOptions.disclaimer = "You are receiving this email because you opted in via registration form.";
      content.subject += `Welcome to Discord Server 👋`;
    } else if (template == "referralEmail") {
      if (options.renewInvite) {
        content.subject += `Reminder for the invite 🎗`
        template = "referralReminderEmail";
      } else {
        content.subject += `You are invited!! 🫵`;
      }
    } else if (template == 'welcomeEmail') {
      if (options.type == 'joinBackInvite') {
        content.subject += 'Action Needed! ⚠️';
        template = "joinBackEmail";
      } else {
        content.subject += `Welcome! 🤗`;
        if (options.type == 'renewInvite') {
          template = "reInviteEmail";
        }
      }
    } else if (template == 'referrerAckEmail') {
      content.subject += `Invitation accepted ✔️`;
    } else if (template == 'mentorAssignmentEmail') {
      content.subject += `You have a mentor 👨‍🏫`;
    } else if (template == 'onboardingAssignmentEmail') {
      content.subject += `We got your back 👍`;
    } else if (template == 'onboardingReminderEmail') {
      content.subject += `Reach out to the assigned member ✔️`;
    } else if (template == 'onboardingSecondReminderEmail') {
      content.subject += `Follow up with the assigned member ✔️`;
    }

    options.footer = this.templates.footer({ ...this.config.platform, footerOptions });
    content.html = this.templates[template](options);
    return this.sendMail(content);
  }
}

module.exports = GoogleClient;