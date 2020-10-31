const Discord = require('discord.js');
const client = new Discord.Client();
const schedule = require('node-schedule');
const fs = require('fs');
const readline = require('readline');
const { google } = require('googleapis');
const crypto = require("crypto");
const util = require('util')
var express = require('express');

let token, spreadsheet_ID, time_added, prefix, guild_ID, admins, port;
let num_roles;
let app = express();
let queue = [];
process.setMaxListeners(0);

fs.readFile('settings.json', (err, content) => {
  if (err) return console.log('Error loading settings:', err);
  // Authorize a client with credentials, then call the Google Sheets API.
  var settings = JSON.parse(content);
  token = settings.token;
  spreadsheet_ID = settings.spreadsheet_ID;
  time_added = settings.time_added;
  prefix = settings.prefix;
  guild_ID = settings.guild_ID;
  port = settings.port;
  
  app.listen(port);
  var msg = 'Listening at http://localhost:' + port;
  timeLog(msg.green.bold);

  client.login(token);
});

client.on('ready', async () => {
  timeLog(`Logged in as ${client.user.tag}!`);
  await getNumberedRoles();
});

client.on('message', msg => {
  if (msg.author.bot || !msg.content.startsWith(prefix) || msg.guild !== null) { return; }
  const args = msg.content.slice(prefix.length).split(' ');
  const command = args.shift().toLowerCase();
  for (var i = 0; i < args.length; i++) {
    args[i] = args[i].toLowerCase();
  }
  const sheets = google.sheets({ version: 'v4', auth });
  let range = 'Sheet1';
  let spreadsheetId = spreadsheet_ID;
  sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  }, async (err, result) => {
    if (err) {
      // Handle error
      timeLog(err);
    } else {
      let values = result.data.values;

      switch (command) {
        case 'link':
          let changed = false;
          for (var i = 0; i < values.length; i++) {
            if (!values[i][1]) continue;
            if (values[i][1].toLowerCase() == args[0]) {
              if (values[i][0]) {
                msg.reply('That email has already been linked');
                return;
              }
              changed = true;
              if (values[i][2]) {
                setValues(auth, [[msg.author.id, null, null, null, null, msg.author.tag]], i + 1);
              } else {
                var d = new Date();
                var month = d.getMonth() + 1;
                var year = d.getFullYear();
                var days = numDays(month, year);
                var hours = days * 24;
                setValues(auth, [[msg.author.id, null, hours, null, null, msg.author.tag, days.toString() + " days"]], i + 1);
              }

              let role_name = values[i][4];
              let role_id = await findRoleID(role_name);

              if (role_id)
                addRoles(msg.author, role_id);
              break;
            }
          }
          if (changed) {
            msg.reply('Discord linked successfully');
          } else {
            msg.reply('Invalid email provided');
          }
          break;
        case 'time':
          for (var i = 0; i < values.length; i++) {
            if (values[i][0] == msg.author.id) {
              msg.reply(`You have ${values[i][2]} hours left`);
              return;
            }
          }
          msg.reply('You are not currently in the database');
          break;
        // case 'update':
        //   for (var i = 0; i < values.length; i++) {
        //     if (values[i][0] == msg.author.id) {
        //       try {
        //         if (parseInt(values[i][2]) > 0) {
        //           addRoles(msg.author);
        //           msg.reply('Roles updated');
        //           return;
        //           break;
        //         } else {
        //           msg.reply('You have not renewed your membership');
        //           return;
        //         }
        //       } catch (e) {
        //         timeLog(e);
        //       }
        //     }
        //   }
        //   msg.reply('You are not currently in the database');
        //   break;
        case 'help':
          let commands = 'Possible commands:\n';
          commands += '\t!link {email} - links your discord to your email\n';
          //commands += '\t!update - refreshes roles in case of late renewal\n';
          commands += '\t!time - tells you how many hours you have left in your membership';
          msg.reply(commands);
          break;
        case 'refresh_roles':
          await getNumberedRoles();
          msg.reply(`Refreshing roles from the spreadsheet... Please wait up to 5 seconds for changes to take effect.`);
          break;
        default:
          msg.reply('Command not found');
      }
    }
  });
});

client.on('error', doNothing);

function doNothing(e) {

}

function addRoles(author, role_id) {
  let guild = client.guilds.get(guild_ID);
  if (guild) {
    try {
      guild.fetchMember(author).then((user) => {
        if (user) {
          let role;
          role = guild.roles.find(r => r.id === role_id);
          user.addRole(role).then((success) => {
            timeLog(success.displayName + ' renewed their membership!');
          }).catch((e) => { });
        }
      });
    } catch {
      timeLog('Error occured in renewals...');
    }
  }
}

var querystring = require('querystring');
var request = require('request');
var colors = require('colors');
var bodyParser = require('body-parser');

colors.setTheme({
  silly: 'rainbow',
  input: 'grey',
  verbose: 'cyan',
  prompt: 'grey',
  info: 'green',
  data: 'grey',
  help: 'cyan',
  warn: 'yellow',
  debug: 'blue',
  error: 'red'
});

app.use(bodyParser.urlencoded());

app.get('/', function (req, res) {
  res.status(200).send("Paypal IPN Listener");
  res.end('Response will be available on console, nothing to look here!');
});

app.post('/', function (req, res) {
  //timeLog('Received POST /'.bold);
  //console.log(req.body['payer_email']);
  //	console.log('\n\n');

  if (req.headers['x-shopify-topic'] == "orders/paid") {
    req.body = req.body || {};
    req.body = JSON.parse(JSON.stringify(req.body));
    for (let i = 0; i < req.body.line_items.length; i++) {
      if (!req.body.line_items[i].sku) continue;
      if (req.body.line_items[i].sku == 1001 || req.body.line_items[i].sku == 1002) {
        getValues(auth, req.body['email'], true);
        timeLog(`Verified membership for ${req.body['email']}`);
      }
    }

    res.status(200).send('OK');
    res.end();
    return;
  }

  // STEP 1: read POST data
  req.body = req.body || {};
  res.status(200).send('OK');
  res.end();

  req.body = JSON.parse(JSON.stringify(req.body));
  // read the IPN message sent from PayPal and prepend 'cmd=_notify-validate'
  var postreq = 'cmd=_notify-validate';
  for (var key in req.body) {
    if (req.body.hasOwnProperty(key)) {
      var value = querystring.escape(req.body[key]);
      postreq = postreq + "&" + key + "=" + value;
    }
  }

  // Step 2: POST IPN data back to PayPal to validate
  //console.log('Posting back to paypal'.bold);
  //console.log(postreq);
  //console.log('\n\n');
  var options = {
    url: 'https://ipnpb.paypal.com/cgi-bin/webscr',
    method: 'POST',
    headers: {
      'Connection': 'close'
    },
    body: postreq,
    strictSSL: true,
    rejectUnauthorized: false,
    requestCert: true,
    agent: false
  };

  request(options, async function callback(error, response, body) {
    if (!error && response.statusCode === 200) {

      // inspect IPN validation result and act accordingly
      // if (body.substring(0, 8) === 'VERIFIED') {
      // The IPN is verified, process it
      //timeLog('Verified IPN message!'.green);
      //console.log('\n\n');

      // assign posted variables to local variables
      var payment_status = req.body['payment_status'];

      //Lets check a variable
      //console.log("Checking variable".bold);
      if (payment_status) {
        timeLog(`Verified IPN message for ${req.body['payer_email']} with payment_status: ${payment_status}`.bgGreen, payment_status)
      }//console.log('\n\n');

      // IPN message values depend upon the type of notification sent.
      // To loop through the &_POST array and print the NV pairs to the screen:
      // console.log('Printing all key-value pairs...'.bold)

      if (payment_status == 'Completed') {
        
	// DANGER LINE
        //if (!req.body['next_payment_date']) {return;}
        // if (req.body['item_number'] == "member") {
        //   timeLog(`Verified membership for ${req.body['payer_email']}`);
        //   getValues(auth, req.body['payer_email'], true);
        // } else {
        //   timeLog(`A payment was made by ${req.body['payer_email']}, but the subscription ID, ${req.body['item_number']}, did not match the requirements`.red);
        // } 
        let item_name = req.body['product_name'];
        let business = req.body['business'];
        //console.log(business);
        getValues(auth, req.body['payer_email'], item_name);
      // } else if (body.substring(0, 7) === 'INVALID') {
      //   timeLog('Fail: ' + util.inspect(body, { showHidden: false, depth: null }));
      //   // IPN invalid, log for manual investigation
      //   timeLog('Invalid IPN!'.error);
      //   //console.log('\n\n');
      // }
    }
  }
  });
});

async function email_paid(payer_email, values, item_name) {
  
  let data = await findRoleDataFromPlan(item_name);
  let type = data[0];
  let lifetime = data[1];

  payer_email = payer_email.toLowerCase();
  //client.channels.get(discord_Channel_ID).send(values);
  var d = new Date();
  var month = d.getMonth() + 1;
  var year = d.getFullYear();
  var days = numDays(month, year);
  var hours = days * 24;
  
  var contained = false;
  for (var i = 0; i < values.length; i++) {
    if (!values[i][1]) continue;
    if (values[i][1].toLowerCase() == payer_email) {
      contained = true;
      setValues(auth, [[null, null, parseInt(values[i][2]) + hours, null,    null,    null,   null, new Date()]], i + 1);
    }
  }
  if (!contained) {
    setValues(auth, [[null,    payer_email, null,                 lifetime, type,    null,   null, new Date()]], values.length + 1);
  }
}

var oAuth2Client;
let auth;

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const TOKEN_PATH = 'token.json';

// Load client secrets from a local file.
fs.readFile('credentials.json', (err, content) => {
  if (err) return console.log('Error loading client secret file:', err);
  // Authorize a client with credentials, then call the Google Sheets API.
  authorize(JSON.parse(content));
});
function authorize(credentials, callback) {
  const { client_secret, client_id, redirect_uris } = credentials.installed;
  oAuth2Client = new google.auth.OAuth2(
    client_id, client_secret, redirect_uris[0]);

  // Check if we have previously stored a token.
  fs.readFile(TOKEN_PATH, (err, token) => {
    if (err) return getNewToken(oAuth2Client, callback);
    oAuth2Client.setCredentials(JSON.parse(token));
    auth = oAuth2Client;
  });
}
function getNewToken(oAuth2Client, callback) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  console.log('Authorize this app by visiting this url:', authUrl);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.question('Enter the code from that page here: ', (code) => {
    rl.close();
    oAuth2Client.getToken(code, (err, token) => {
      if (err) return console.error('Error while trying to retrieve access token', err);
      oAuth2Client.setCredentials(token);
      // Store the token to disk for later program executions
      fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
        if (err) console.error(err);
        console.log('Token stored to', TOKEN_PATH);
      });
      callback(oAuth2Client);
    });
  });
}
function getValues(auth, email, item_name) {
  const sheets = google.sheets({ version: 'v4', auth });
  let range = 'Sheet1';
  let spreadsheetId = spreadsheet_ID;
  sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  }, (err, result) => {
    if (err) {
      queue.add([email, item_name]);
      throw new Error("Problem in receiving sheet data from google");
      // Handle error
      //console.log(err);
    } else {
      email_paid(email, result.data.values, item_name);
    }
  });
}

function setValues(auth, values, index) {
  const sheets = google.sheets({ version: 'v4', auth });
  const resource = {
    values,
  };
  let range;
  if (index) {
    range = 'Sheet1!' + index + ':' + index;
  } else {
    range = 'Sheet1!A1:ZZ';
  }
  let spreadsheetId = spreadsheet_ID;
  var valueInputOption = 'RAW';
  sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption,
    resource,
  }, (err, result) => {
    if (err) {
      // Handle error
      //console.log(err);
    } else {
      //console.log('%d cells updated.', result.updatedCells);
    }
  });
}

function numDays(month, year) {
  // Here January is 1 based
  //Day 0 is the last day in the previous month
  return new Date(year, month, 0).getDate();
  // Here January is 0 based
  // return new Date(year, month+1, 0).getDate();
}

var hourtick = schedule.scheduleJob('0 * * * *', async function () {
  try {
    const sheets = google.sheets({ version: 'v4', auth });
    let range = 'Sheet1';
    let spreadsheetId = spreadsheet_ID;
    sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    }, async (err, result) => {
      if (err) {
        // Handle error
        console.log(err);
      } else {
        let values = result.data.values;
        let guild = client.guilds.get(guild_ID);
        for (var i = 1; i < values.length; i++) {
          if (values[i][3] != 'TRUE') {
            if (parseInt(values[i][2]) > 0) {
              let time = parseInt(values[i][2]);
              time = time - 1;
              values[i][2] = time;
              values[i][6] = `${Math.floor(time / 24)} days, ${time % 24} hours`;
            } else {
              if (guild) {
                try {
                  client.fetchUser(values[i][0]).then((member) => {
                    guild.fetchMember(member).then(async (user) => {
                      if (user) {
                        let role_name = values[i][4];
                        let role_id = await findRoleID(role_name);

                        let role = guild.roles.find(r => r.id === role_id);
                        user.removeRole(role).then((success) => {
                          timeLog(success.displayName + ' did not renew. Their role has been removed.');
                        }).catch();
                        values.splice(i);
                      }
                    }).catch(e => { });
                  }).catch(e => { });
                } catch {
                  timeLog('Error occured in renewals...');
                }
              }
            }
          }
        }
        setValues(auth, values, null);
      }
    });

    for (let i = 0; i < queue.length; i++) {
      let data = queue.shift();
      let email = data[0];
      let item_name = data[1];
      try {
        getValues(auth, email, item_name);
      } catch {
        queue.add([email, item_name]);
      }
    }
  } catch (e) {

  }
  //timeLog('Times updated');
});

async function findRoleDataFromPlan(item_name) {
  let role_name = 'dabarkads';
  let lifetime = false;
  console.log("The item name is: " + item_name);
  try {
    //num_roles = await getNumberedRoles();
    for (let i = 0; i < num_roles.length; i++) {
      if (num_roles[i][2].toLowerCase() == item_name.toLowerCase()) {
        role_name = num_roles[i][0];
        if (num_roles[i][3].toLowerCase() == "lifetime") {
          lifetime = true;
        }
      }
    }
  } catch {
    
  }
  return [role_name, lifetime];
}

async function findRoleID(role_name) {
  let role_id;

  switch (role_name) {
    default:
      try {
      //num_roles = await getNumberedRoles();
      for (let i = 0; i < num_roles.length; i++) {
        if (num_roles[i][0].toLowerCase() == role_name.toLowerCase()) {
          role_id = num_roles[i][1];
        }
      }
    } catch {
    }
  }

  return role_id;
}

// Updates New roles created after paypal banned accounts
async function getNumberedRoles() {
  const sheets = google.sheets({ version: 'v4', auth });
  let range = 'Roles';
  let spreadsheetId = spreadsheet_ID;
  let req = {
    spreadsheetId: spreadsheetId,
    range: range,
    auth: auth
  };
  try {
    let result = await sheets.spreadsheets.values.get(req, (err, res) => {
      let values = res.data.values;
      if (values) {
      values.shift();
      num_roles = values;
      }
    });
    return num_roles;
  } catch (err) {
    //console.log(err);
    return null;
  }
}

var minutetick = schedule.scheduleJob('* * * * *', async function () {
  try {
    const sheets = google.sheets({ version: 'v4', auth });
    let range = 'Sheet1';
    let spreadsheetId = spreadsheet_ID;
    sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    }, async (err, result) => {
      if (err) {
        // Handle error
        console.log(err);
      } else {
        let values = result.data.values;
        let guild = client.guilds.get(guild_ID);
        for (var i = 1; i < values.length; i++) {
          try {
            if (values[i][3] != 'TRUE') {
              let role_name = values[i][4];
              let role_id = await findRoleID(role_name);
              let role = guild.roles.find(r => r.id === role_id);
              let discord_id = values[i][0];
              let hours_left = parseInt(values[i][2]);
              if (discord_id != "") {
                if (hours_left > 0) {
                  if (guild) {
                    client.fetchUser(discord_id).then((member) => {
                      if (member) {
                        guild.fetchMember(member).then((user) => {
                          if (user) {
                            user.addRole(role).then((success) => {
                              //timeLog(success.displayName + ' has had their roles updated!');
                            }).catch((e) => { });
                          }
                        }).catch(e => { });
                      }
                    }).catch(e => { });
                  }
                } else {
                  try {
                    client.fetchUser(discord_id).then((member) => {
                      if (member)
                        guild.fetchMember(member).then((user) => {
                          if (user) {
                            user.removeRole(role).then((success) => {
                              //timeLog(success.displayName + ' did not renew. Their role has been removed.');
                            }).catch(e => { });
                            //values.splice(i);
                          }
                        }).catch(e => { });
                    }).catch(e => { });
                  } catch (e) { }
                }
              }
            }
          } catch (e) {

          }
        }
        //setValues(auth, values, null);
      }
    });
  } catch (e) { }

  if (new Date().getMinutes() % 10 == 0) {
    getNumberedRoles();
  }

  //timeLog('Times updated');
});

var rule = new schedule.RecurrenceRule();
rule.hour = 5;

var j = schedule.scheduleJob(rule, function () {
  fs.writeFile('restart.js', new Date(), function (err) {
    if (err) {
      return console.log(err);
    }
    //console.log("Restarted!");
  });
});

function timeLog(message) {
  console.log(new Date() + '] ' + message);
}

