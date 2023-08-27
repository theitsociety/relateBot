

const { google, admin_directory_v1 } = require('googleapis');
const MailComposer = require('nodemailer/lib/mail-composer');
const BaseHelper = require('../../lib/baseHelper');
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

  async sendInvite(options) {
    const content = {
      ...this.partnerConfig.email.defaults,
      to: options.email,
      subject: 'Welcome to IT Society! 🙋‍♂️',
      html: this.templates.welcomeEmail(options),
    };
    return this.sendMail(content);
  };

  async sendInvite(options, type) {
    const content = {
      ...this.partnerConfig.email.defaults,
      to: options.email,
      subject: type == "joinBackInvite" ? 'Action Needed! 🙋‍♂️' : 'Welcome to IT Society! 🙋‍♂️',
      html: type == "renewInvite" ? this.templates.reInviteEmail(options) : type == "joinBackInvite" ? this.templates.joinBackEmail(options) : this.templates.welcomeEmail(options),
    };
    return this.sendMail(content);
  };

  async sendLandingEmail(options) {
    const content = {
      ...this.partnerConfig.email.defaults,
      to: options.email,
      subject: 'IT Society > Welcome to Discord Server 👋',
      html: this.templates.landingEmail(options),
    };
    return this.sendMail(content);
  };

  async sendReferralInvite(options, renewInvite) {
    const content = {
      ...this.partnerConfig.email.defaults,
      to: options.email,
      subject: renewInvite ? 'IT Society: Reminder for the invite 🎗' : 'IT Society: You are invited!! 🫵',
      html: renewInvite ? this.templates.referralReminderEmail(options) : this.templates.referralEmail(options),
    };
    return this.sendMail(content);
  };
}



module.exports = GoogleClient;

const partnerConfig = require('../../configs/service/config_prod.json').partnerConfig.google;

const main = async () => {
  
  const googleClient = new GoogleClient(partnerConfig);
  // return await googleClient.sendReferralInvite({ email: "turkoz@gmail.com", referral: "Jane Doe", referrer: "John Doe", notes: "Nice community to give back to society" });
  // return await googleClient.sendLandingEmail({ email: "turkoz@gmail.com" });
  // return  _.get(await googleClient.listGroup(), 'data.members');
  // return await googleClient.deleteMemberFromGroups("all@itsociety.org", "tysonturkoz1977@gmail.com");
  // return await googleClient.addMemberToGroups("all@itsociety.org", "tysonturkoz1977@gmail.com", "TT");
  return await googleClient.sendInvite({ email: "turkoz@gmail.com", invite: "https://yahoo.com" });
  const allPromises = [];
  const list = fs.readFileSync(path.join(__dirname, 'list.csv'),{ encoding: 'utf8', flag: 'r' }).split('\n');
  let fields;
  for (const line of list) {
    // console.log(line);
    if (!fields) {
      fields = line.split(",").map(el => el.trim());
    } else {
      const values = line.split(",").map(el => el.trim());
      const obj = {};
      for (const ind in values) {
        obj[ fields[ind] ] = values[ind];
      }
      console.log(obj);
      await googleClient.sendInvite(obj, "joinBackInvite").then(messageId => {
        console.log('Message sent successfully:', messageId)
        return new Promise(resolve => setTimeout(resolve, 1000));
      });
    }
  }
  return list.length - 1;
};

main()
  .then((messageId) => console.log('Message sent successfully:', messageId))
  .catch((err) => console.error(err));