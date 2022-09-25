const Enum = require('../enum');
const BaseClient = require('./base');
const NotionClient = require('./notion');

class ClientFactory {

  constructor(config, partner) {
    this.client = partner;
    this.partnerConfig = config.partnerConfig[partner] || {};
    this.config = config;
  }

  getClient (){
    switch (this.client) {
      case Enum.clients.NOTION:
        return new NotionClient(this.partnerConfig, this.config);
      case Enum.clients.BASE:
        return new BaseClient(this.partnerConfig, this.config);
      default:
        throw Error("Not a valid partner");
    }    
  }
}

module.exports = ClientFactory;