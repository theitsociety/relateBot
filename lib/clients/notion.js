const BaseClient = require('./base');
const _ = require('lodash');
const { default: axios } = require('axios');

class NotionClient extends BaseClient {
  constructor(partnerConfig, serviceConfig) {
    super(partnerConfig, serviceConfig);
    this.sampleData = require('../../data/notion-data.json');
  }
  async fetch(equals, start_cursor, database = this.partnerConfig.request.registationDatabase) {

    const data = {}; 
    if (start_cursor) {
      _.extend(data, { start_cursor });
    }
    if (equals) {
      if (typeof equals == 'string') {
        _.extend(data, {
          "filter": {
            "property": "Email Address",
            "rich_text": { equals }
          }
        });
      }
      else {
        _.extend(data, equals);
      }
    }
    return axios({
      url: `${this.partnerConfig.request.baseURL}/databases/${database}/query`,
      method: "post",
      headers: this.partnerConfig.request.headers, 
      data,
      transformResponse: [
        (data) => {
          let resp;
          try {
            resp = JSON.parse(data);
          } catch (error) {
            throw Error(`[requestClient] Error parsingJSON data - ${JSON.stringify(error)}`);
          }
          if (resp.results) {
            resp.results = this._normalizeResponse(resp.results);
            return typeof equals == 'string' ? _.get(resp, 'results.0') : resp;
          } else {
            throw Error(`Request failed with reason -  ${data}`);
          }
        },
      ]
    }).then(response => Promise.resolve(response.data));
  }

  async fetchByStatus(status, database) {
    let results = [], page;
    do {
      page = await this.fetch({
        "filter": {
          "property": "Status",
          "select": {
            "equals": status
          }
        }
      }, _.get(page, "next_cursor"), database);
      results = [ ...results, ...page.results ];
    } while (_.get(page, "has_more"));
    return results;
  }
  
  async fetchAll (database) {
    let results = [], page;
    do {
      page = await this.fetch(undefined, _.get(page, "next_cursor"), database);
      results = [ ...results, ...page.results ];
    } while (_.get(page, "has_more"));
    return results;
  }

  async fetchWithSkills(email) {
    let promises = [];
    promises.push(this.fetch(email));
    promises.push(this.fetch(email, null, this.partnerConfig.request.skillDatabase));
    const results = await Promise.all(promises);
    return _.merge(results[0], _.pick(results[1], [...this.partnerConfig.skills, "Company", "Job Title"]));
  }

  async fetchReferral(email) {
    return this.fetch(email, null, this.partnerConfig.request.referralDatabase)
  }

  async update (updates) {
    const result = [];
    for(const update of _.castArray(updates)) {
      result.push(await axios({
        url: `${this.partnerConfig.request.baseURL}/pages/${update.partnerId}`,
        method: "patch",
        headers: this.partnerConfig.request.headers, 
        data: this._prepareUpdateData(update),
        transformResponse: [
          (data) => {
            let resp;
            try {
              resp = JSON.parse(data);
            } catch (error) {
              throw Error(`[requestClient] Error parsingJSON data - ${JSON.stringify(error)}`);
            }
            if (resp.id) {
             return resp;
            } else {
              throw Error(`Request failed with reason -  ${data}`);
            }
          },
        ]
      }).then(response => Promise.resolve(response.data)))
    }
    return result.length == 1 ? result[0] : result;
  }

  async insert (updates) {
    const result = [];
    for(const update of _.castArray(updates)) {
      result.push(await axios({
        url: `${this.partnerConfig.request.baseURL}/pages`,
        method: "post",
        headers: this.partnerConfig.request.headers, 
        data: { "parent": { 
          "database_id": this.partnerConfig.request.registationDatabase
          }, 
          ...this._prepareUpdateData(update)
        },
        transformResponse: [
          (data) => {
            let resp;
            try {
              resp = JSON.parse(data);
            } catch (error) {
              throw Error(`[requestClient] Error parsingJSON data - ${JSON.stringify(error)}`);
            }
            if (resp.id) {
             return resp;
            } else {
              throw Error(`Request failed with reason -  ${data}`);
            }
          },
        ]
      }).then(response => Promise.resolve(response.data)))
    }
    return result.length == 1 ? result[0] : result;
  }

  _normalizeResponse(input) {
    return input.map(result => {
      const transformedData = _.keys(result.properties).reduce( (acc, key) => {
        let value;
        const type = result.properties[key].type;
        switch (type) {
          case "multi_select":
            value = result.properties[key][type].map(el => el.name);
            break;
          case "select": 
            value = _.get(result.properties[key][type], 'name')
            break;
          case "rich_text":
          case "title":
            value = result.properties[key][type].map(el => el.plain_text);
            break;
          case "email":
          case "url":
          case "created_time": 
            value = result.properties[key][type];
            break;
        }
        const localKey = _.get(this.partnerConfig, `keymappings.${key}`, key);
        acc[localKey] = _.castArray(value);
        if (![ "groups", "Communication Preferences"].includes(localKey)) {
          const seperator = [ "Contribution Preference"].includes(localKey) ? "\n" : ", ";
          acc[localKey] = acc[localKey].join(seperator) || "";
        }
        return acc;
      }, {partnerId: result.id});
      transformedData["Last edited time"] = result.last_edited_time;
      return transformedData;
    } );
  }

  _prepareUpdateData(update) {
    const data = {
      "properties": {
      }
    };

    const keymappings = _.get(this.partnerConfig, `keymappings`);
    const richTextKeys = _.get(this.partnerConfig, `richTextKeys`);
    for (const richTextKey of richTextKeys) {
      const discordKey = _.get(keymappings, richTextKey, richTextKey);
      if (update[discordKey] || update[discordKey] === "") {
        data.properties[richTextKey] = {
          "rich_text": [{
            "type": "text",
            "text": {
              "content": update[discordKey]
            }
          }]
        }
      }
    }
    if (update.groups) {
      data.properties["Groups"] = {
        "multi_select": (update.groups || []).map(group => {
          return { "name": group }
        })
      }
    }
    if (update["Communication Preferences"]) {
      data.properties["Communication Preferences"] = {
        "multi_select": (update["Communication Preferences"] || []).map(el => {
          return { "name": el }
        })
      }
    }
    if (update["Status"]) {
      data.properties["Status"] = {
        "select": {
          "name": update["Status"] 
        }
      }
    }
    if (update["Email Address"]) {
      data.properties["Email Address"] = {
        "email": update["Email Address"]
      }
    }
    if (update["Full Name"]) {
      data.properties["Full Name"] = {
        "title": [{
          "type": "text",
          "text": {
            "content": update["Full Name"]
          }
        }]
      }
    }
    return data;
  }
}

module.exports = NotionClient;