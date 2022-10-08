// auth.js

const { google } = require('googleapis');
const config = require('../../config_prod.json');
const { client_secret, client_id, redirect_uris } = config.partnerConfig.google.credentials;

const readline = require('readline/promises');
const { stdin: input, stdout: output } = require('process');

(async  () => {

  const rl = readline.createInterface({ input, output });
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  
  const scope = [
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/admin.directory.group'
  ];
  
  const url = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope,
  });
  
  console.log('Authorize this app by visiting this url:')
  console.log();
  console.log(url);
  console.log();

  const answer = await rl.question('Copy the redirection URL from your browser and paste here: \n\n');

  const code = answer.replace(/^http.*\?/,'').split("&")[0].replace(/^code=/, '');

  const response = await oAuth2Client.getToken(code);
  console.log();
  console.log('Access token and refresh token. Put refresh_token in your config file along with other credentials');
  console.log(JSON.stringify(response.tokens, null, " "));
  console.log();

  Promise.resolve();
})()



