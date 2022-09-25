const _ = require('lodash');
const BaseHelper = require('../baseHelper');

class BaseClient extends BaseHelper {

  constructor(partnerConfig, serviceConfig) {
   super(serviceConfig);
   this.partnerConfig = partnerConfig;
   this.sampleData = require('../../data/sample-data.json');
  }

  async fetchAll () {
    return _.cloneDeep(this.sampleData);
  }
  async fetch (email) {
    return _.cloneDeep(_.find(this.sampleData, entry => entry['Email Address'] == email));
  }
  async update (updates) {
    
    _.forEach(_.castArray(updates), data => {
      const record = _.find(this.sampleData, _.pick(data, 'Email Address'));
      if (record) {
        this.logger("Updating record", { consoleOnly: true });
        this.logger("Before:", { consoleOnly: true });
        this.logger(record, { consoleOnly: true });
        // omit will keep referance. Let's clone
        _.assign(record, _.cloneDeep(_.omit(data,'Email Address')));
        this.logger("After:", { consoleOnly: true });
        this.logger(record, { consoleOnly: true });
      }
    });
  }

}

module.exports = BaseClient;