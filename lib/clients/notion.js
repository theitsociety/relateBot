const BaseClient = require('./base');
const _ = require('lodash');
const { default: axios } = require('axios');

class NotionClient extends BaseClient {
  constructor(partnerConfig, serviceConfig) {
    super(partnerConfig, serviceConfig);
    this.sampleData = require('../../data/notion-data.json');
  }
  async fetch(equals, start_cursor) {
    const data = start_cursor ? { start_cursor } : equals ?  {
      "filter": {
        "property": "Email Address",
        "rich_text": { equals }
      }
    } : {};
    return axios({
      url: `${this.partnerConfig.request.baseURL}/databases/${this.partnerConfig.request.database}/query`,
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
            return equals ? _.get(resp, 'results.0') : resp;
          } else {
            throw Error(`Request failed with reason -  ${data}`);
          }
        },
      ]
    }).then(response => Promise.resolve(response.data));
  }

  async fetchAll () {
    let results = [], page;
    do {
      page = await this.fetch(undefined, _.get(page, "next_cursor"));
      results = [ ...results, ...page.results ];
    } while (_.get(page, "has_more"));
    return results;
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
          "database_id": this.partnerConfig.request.database
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
    return input.map(result => _.keys(result.properties).reduce( (acc, key) => {
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
      if (![ "groups", "Communication Preferences" ].includes(localKey)) {
        acc[localKey] = acc[localKey].join("\n") || "";
      }
      return acc;
    }, {partnerId: result.id}));
  }

  _prepareUpdateData(update) {
    const data = {
      "properties": {
      }
    };
    if (update.tag || update.tag === "") {
      data.properties["Discord Tag"] = {
        "rich_text": [{
          "type": "text",
          "text": {
            "content": update.tag
          }
        }]
      }
    }
    if (update.id || update.id === "") {
      data.properties["Discord Id"] = {
        "rich_text": [{
          "type": "text",
          "text": {
            "content": update.id
          }
        }]
      }
    }
    if (update.nickname || update.nickname === "") {
      data.properties["Discord Nickname"] = {
        "rich_text": [{
          "type": "text",
          "text": {
            "content": update.nickname
          }
        }]
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
    if (update.invite || update.invite === "") {
      data.properties["Discord Invite"] = {
        "rich_text": [{
          "type": "text",
          "text": {
            "content": update.invite
          }
        }]
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
    if (update["Company"] || update["Company"] === "") {
      data.properties["Company"] = {
        "rich_text": [{
          "type": "text",
          "text": {
            "content": update["Company"]
          }
        }]
      }
    }
    if (update["Job Title"] || update["Job Title"] === "") {
      data.properties["Job Title"] = {
        "rich_text": [{
          "type": "text",
          "text": {
            "content": update["Job Title"]
          }
        }]
      }
    }
    return data;
  }
}

module.exports = NotionClient;