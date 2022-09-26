const Enum = require('../enum');
const BaseClient = require('./base');
const GoogleClient = require('./google');
const NotionClient = require('./notion');

class ClientFactory {

  constructor(config) {
    this.config = config;
  }

  getClient (partner){
    switch (partner) {
      case Enum.clients.NOTION:
        return new NotionClient(this.config.partnerConfig[partner], this.config);
      case Enum.clients.BASE:
        return new BaseClient(this.config.partnerConfig[partner], this.config);
      case Enum.clients.GOOGLE:
        return new GoogleClient(this.config.partnerConfig[partner], this.config)
      default:
        throw Error("Not a valid partner");
    }    
  }
}

module.exports = ClientFactory;