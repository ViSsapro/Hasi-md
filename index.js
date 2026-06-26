const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    jidNormalizedUser,
    delay
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const fs = require("fs");
const path = require("path");
const chalk = require("chalk");
const express = require("express");
const readline = require("readline");
const config = require("./config");
const { smsg } = require("./lib/message");

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => res.send(`✅ ${config.botname} IS RUNNING`));
app.listen(PORT, () => console.log(chalk.green(`🌐 Web: ${PORT}`)));

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

class HasiMD {
    constructor() {
        this.sock = null;
        this.commands = new Map();
        this.aliases = new Map();
        this.start();
    }

    async start() {
        const { state, saveCreds } = await useMultiFileAuthState('./session');
        const { version } = await fetchLatestBaileysVersion();

        this.sock = makeWASocket({
            version,
            logLevel: 'silent',
            auth: state,
            logger: pino({ level: 'silent' }),
            browser: [config.botname, 'Chrome', '1.0.0'],
            printQRInTerminal: false
        });

        this.sock.ev.on('creds.update', saveCreds);
        this.loadPlugins();

        if (!this.sock.authState.creds.registered) {
            await delay(2000);
            const phoneNumber = await question(chalk.yellow('📲 Enter your WhatsApp number with country code. Ex: 9477xxxxxxx : '));
            const code = await this.sock.requestPairingCode(phoneNumber.replace(/[^0-9]/g, ''));
            console.log(chalk.green(`\n🔑 Your Pairing Code: ${code?.match(/.{1,4}/g)?.join('-')}\n`));
            console.log(chalk.yellow(`WhatsApp > Linked Devices > Link with phone number code`));
        }

        this.sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            if (connection === 'close') {
                const code = lastDisconnect.error?.output?.statusCode;
                if (code!== DisconnectReason.loggedOut) {
                    console.log(chalk.red('Reconnecting...'));
                    this.start();
                }
            } else if (connection === 'open') { // <-- එක පාරයි තියෙන්නේ
                console.log(chalk.green(`✅ ${config.botname} CONNECTED!`));
                console.log(chalk.green(`✅ Loaded ${this.commands.size} Plugins`));

                await delay(2000);
                const myNumber = jidNormalizedUser(this.sock.user.id);

                const welcomeMsg = `👋 *${global.botname} SUCCESSFULLY LINKED* ✅

*STATUS:* Online
*VERSION:* ${global.version}
*PREFIX:* ${global.prefix}
*PLUGINS:* ${this.commands.size} Loaded

Type ${global.prefix}menu to start`

                await this.sock.sendMessage(myNumber, {
                    image: { url: global.thumb },
                    caption: welcomeMsg
                });

                rl.close();
            }
        });

        this.sock.ev.on('messages.upsert', async chatUpdate => {
            try {
                if (chatUpdate.type!== 'notify') return;
                let m = chatUpdate.messages[0];
                if (!m.message || m.key.fromMe) return;
                m = smsg(this.sock, m);
                if (!m) return;

                const prefixRegex = new RegExp(`^(${config.prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`);
                if (!prefixRegex.test(m.body)) return;

                const [cmdName,...args] = m.body.slice(config.prefix.length).trim().split(/ +/);
                const command = cmdName.toLowerCase();
                const cmd = this.commands.get(command) || this.commands.get(this.aliases.get(command));
                if (!cmd) return;

                if (cmd.owner &&!config.owner.includes(m.sender.split('@')[0])) return m.reply(config.mess.owner);
                await cmd.execute(this.sock, m, args);
            } catch (err) {
                console.log(err);
            }
        });
    }

    loadPlugins() {
        const pluginFolder = path.join(__dirname, 'plugins');
        if(!fs.existsSync(pluginFolder)) fs.mkdirSync(pluginFolder);
        const pluginFiles = fs.readdirSync(pluginFolder).filter(file => file.endsWith('.js'));
        for (const file of pluginFiles) {
            try {
                delete require.cache[require.resolve(path.join(pluginFolder, file))];
                const plugin = require(path.join(pluginFolder, file));
                if (!plugin.name ||!plugin.execute) continue;
                this.commands.set(plugin.name, plugin);
                if (plugin.alias) plugin.alias.forEach(alias => this.aliases.set(alias, plugin.name));
                console.log(chalk.cyan(`✅ Loaded: ${plugin.name}`));
            } catch (e) {
                console.log(chalk.red(`❌ ${file}: ${e.message}`));
            }
        }
    }
}

new HasiMD();