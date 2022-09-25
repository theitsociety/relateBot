const _ = require("lodash");

class BaseHelper {

  constructor(config) {
    this.config = config
  }

  logger(message, options = {}) {

    if (options.consoleOnly && _.get(this.config,'logging.console')) {
      console.log((typeof message === 'object' && message !== null) ? JSON.stringify(message, null, " ") : message);
    } else if (_.get(this.config,'logging.discord') && _.get(this.config,'channels.logChannel')) {
      try {
        const logChannel = this.client.channels.cache.find(channel => channel.id === _.get(this.config,'channels.logChannel'));
        if (logChannel) {
          logChannel.send(message);
        }
      } catch (e) {
        console.log(`Unable to log to Discod: ${e}`);
      }
    }
  }
}

module.exports = BaseHelper;