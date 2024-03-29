const _ = require("lodash");

class BaseHelper {

  constructor(config) {
    this.config = config
  }

/**
 * 
 * @param {*} message 
 * @param {*} options 
 * consoleOnly: Log only to console
 * logChannel:log to this channel instead of default channel
 */
  logger(message, options = {}) {

    if (options.consoleOnly && _.get(this.config,'logging.console')) {
      console.log((typeof message === 'object' && message !== null) ? JSON.stringify(message, null, " ") : message);
    } else {
      const logChannelId = options.logChannel || _.get(this.config,'channels.logChannel');
      if (_.get(this.config,'logging.discord') && logChannelId) {
        try {
          const logChannel = this.client.channels.cache.find(channel => channel.id === logChannelId);
          if (logChannel) {
            logChannel.send(message);
          }
        } catch (e) {
          console.log(`Unable to log to Discod: ${e}`);
        }
      }
    }
  }
}

module.exports = BaseHelper;