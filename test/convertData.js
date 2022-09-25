const _ = require('lodash');
const sample = {
  "object": "list",
  "results": [
    {
      "object": "page",
      "id": "8a0a9c45-eca0-482b-baf0-a16d70a6e361",
      "created_time": "2022-09-11T05:08:00.000Z",
      "last_edited_time": "2022-09-24T08:44:00.000Z",
      "created_by": {
        "object": "user",
        "id": "c5c2c4c7-a0f5-49d9-bdbe-b3ddb3f1511e"
      },
      "last_edited_by": {
        "object": "user",
        "id": "6a76f28f-13f7-4c9a-922b-1b0859dfac98"
      },
      "cover": null,
      "icon": null,
      "parent": {
        "type": "database_id",
        "database_id": "bfcaf5b3-f0b3-44b5-b4a4-4a985035a5d9"
      },
      "archived": false,
      "properties": {
        "Contribution Preference": {
          "id": "E%3Dzu",
          "type": "multi_select",
          "multi_select": [
            {
              "id": "6de85fcf-9da5-430c-b761-6d4b734aa4c9",
              "name": "Coaching other members on topics I am experienced in",
              "color": "brown"
            },
            {
              "id": "ef4a609c-f0dd-46e3-8c0a-d0533930ee70",
              "name": "Handle some sessions of training events on topics I am experienced in",
              "color": "gray"
            },
            {
              "id": "2b0a4d9a-5386-4bc9-8b35-45a8b66c063a",
              "name": "Guide college and/or high school students to step into the IT domain in a most effective way",
              "color": "purple"
            }
          ]
        },
        "Skills": {
          "id": "O%60ap",
          "type": "relation",
          "relation": []
        },
        "Company": {
          "id": "Opge",
          "type": "rich_text",
          "rich_text": [
            {
              "type": "text",
              "text": {
                "content": "eHealth",
                "link": null
              },
              "annotations": {
                "bold": false,
                "italic": false,
                "strikethrough": false,
                "underline": false,
                "code": false,
                "color": "default"
              },
              "plain_text": "eHealth",
              "href": null
            }
          ]
        },
        "Referral": {
          "id": "TC%5Bo",
          "type": "rich_text",
          "rich_text": [
            {
              "type": "text",
              "text": {
                "content": "",
                "link": null
              },
              "annotations": {
                "bold": false,
                "italic": false,
                "strikethrough": false,
                "underline": false,
                "code": false,
                "color": "default"
              },
              "plain_text": "",
              "href": null
            }
          ]
        },
        "Discord Nickname": {
          "id": "_%3DfF",
          "type": "rich_text",
          "rich_text": [
            {
              "type": "text",
              "text": {
                "content": "Some nick ",
                "link": null
              },
              "annotations": {
                "bold": false,
                "italic": false,
                "strikethrough": false,
                "underline": false,
                "code": false,
                "color": "default"
              },
              "plain_text": "Some nick ",
              "href": null
            }
          ]
        },
        "Discord Tag": {
          "id": "%60%3A%5EC",
          "type": "rich_text",
          "rich_text": [
            {
              "type": "text",
              "text": {
                "content": "Some tag ",
                "link": null
              },
              "annotations": {
                "bold": false,
                "italic": false,
                "strikethrough": false,
                "underline": false,
                "code": false,
                "color": "default"
              },
              "plain_text": "Some tag ",
              "href": null
            }
          ]
        },
        "Email Address": {
          "id": "aEuW",
          "type": "email",
          "email": "ealparslan@gmail.com"
        },
        "Job Title": {
          "id": "byKh",
          "type": "rich_text",
          "rich_text": [
            {
              "type": "text",
              "text": {
                "content": "Principal Software Engineer",
                "link": null
              },
              "annotations": {
                "bold": false,
                "italic": false,
                "strikethrough": false,
                "underline": false,
                "code": false,
                "color": "default"
              },
              "plain_text": "Principal Software Engineer",
              "href": null
            }
          ]
        },
        "Registered": {
          "id": "cbzh",
          "type": "select",
          "select": {
            "id": "R[I:",
            "name": "Yes",
            "color": "green"
          }
        },
        "Groups": {
          "id": "iX%7CT",
          "type": "multi_select",
          "multi_select": [
            {
              "id": "f58d0f49-f4a1-4fa9-b0b9-967e82a1566e",
              "name": "leetcode-medium",
              "color": "gray"
            },
            {
              "id": "273a7e72-ea55-4671-a515-ebb3aae73f3d",
              "name": "bookclub",
              "color": "default"
            }
          ]
        },
        "LinkedIn Account": {
          "id": "jYta",
          "type": "url",
          "url": "https://www.linkedin.com/in/ealparslan/"
        },
        "Country": {
          "id": "kO~%3C",
          "type": "rich_text",
          "rich_text": [
            {
              "type": "text",
              "text": {
                "content": "United States",
                "link": null
              },
              "annotations": {
                "bold": false,
                "italic": false,
                "strikethrough": false,
                "underline": false,
                "code": false,
                "color": "default"
              },
              "plain_text": "United States",
              "href": null
            }
          ]
        },
        "Discord Id": {
          "id": "p%5E%3Fg",
          "type": "rich_text",
          "rich_text": [
            {
              "type": "text",
              "text": {
                "content": "Some id ",
                "link": null
              },
              "annotations": {
                "bold": false,
                "italic": false,
                "strikethrough": false,
                "underline": false,
                "code": false,
                "color": "default"
              },
              "plain_text": "Some id ",
              "href": null
            }
          ]
        },
        "Communication Preferences": {
          "id": "tLJx",
          "type": "multi_select",
          "multi_select": []
        },
        "Where did you hear us?": {
          "id": "xdom",
          "type": "multi_select",
          "multi_select": [
            {
              "id": "f273f9cb-e40a-414a-a923-2c73891bbeb8",
              "name": "Personal network",
              "color": "red"
            }
          ]
        },
        "Create Date": {
          "id": "%7D%40u%60",
          "type": "created_time",
          "created_time": "2022-09-11T05:08:00.000Z"
        },
        "Full Name": {
          "id": "title",
          "type": "title",
          "title": [
            {
              "type": "text",
              "text": {
                "content": "Erdem Alparslan",
                "link": null
              },
              "annotations": {
                "bold": false,
                "italic": false,
                "strikethrough": false,
                "underline": false,
                "code": false,
                "color": "default"
              },
              "plain_text": "Erdem Alparslan",
              "href": null
            }
          ]
        }
      },
      "url": "https://www.notion.so/Erdem-Alparslan-8a0a9c45eca0482bbaf0a16d70a6e361"
    }
  ],
  "next_cursor": null,
  "has_more": false,
  "type": "page",
  "page": {}
}


function normalizeResponse(input) {
  return input.map(result => _.keys(result.properties).reduce( (acc, key) => {
    let value;
    const type = result.properties[key].type;
    switch (type) {
      case "multi_select":
        value = result.properties[key][type].map(el => el.name);
        break;
      case "select": 
        value = result.properties[key][type].name
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
    acc[key] = _.castArray(value).join(", ") || "";
    return acc;
  }, {}));
}

console.log(JSON.stringify(normalizeResponse(sample.results), null, " "));