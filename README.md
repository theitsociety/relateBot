# relateBot
This Discord bot correlates Discord Server Members with external Registration database by 
 * Creating unique invite
 * Saving invite in registration database
 * Relating used invite with user email in registration database 
 * Synchronizing member data to registration database
 * Keep synchronizing changes and members' role selection
 
## How to Set up 
 
### Create your own application 
at https://discord.com/developers/applications 
For more info, please visit https://discordpy.readthedocs.io/en/stable/discord.html 
 
### Install Node and packages
```
➜  relateBot git:(main) node -v
v18.9.0
➜  relateBot git:(main) npm -v
8.19.1
➜  relateBot git:(main) npm i
```

### Prepare Config File
Generate `config_prod.json` file. `config.json` will help guide you. 

### Deploy the commands
```
➜  relateBot git:(main) node run deploy
```

### Run Your Bot
```
➜  relateBot git:(main) node run prod
```

### For pm2 users
Update config file to point correct npm path
```
➜  relateBot git:(main) pm2 start configs/pm2/prod.yml
```

### Extend for your needs
Currently **relateBot** has **Notion** DB integration and **in-memory** data management option. Factory structure defined in `lib/clients/index.js` file can be enhanced by adding new integrations.  

