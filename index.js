const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    delay,
    downloadMediaMessage
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const express = require("express");
const path = require("path");
const axios = require("axios");
const { Sticker, StickerTypes } = require('wa-sticker-formatter');
const readline = require("readline");

const menuCmd = require('./menu.js');

const app = express();
const PORT = process.env.PORT || 3000;

const botLogoUrl = "https://i.ibb.co/271whBpp/c9d0b775835a.jpg";

// Console එකෙන් අංකය ලබාගන්නා Function එක
const question = (text) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => rl.question(text, (answer) => { rl.close(); resolve(answer); }));
};

// ===== COBALT API HELPER =====
async function cobaltDownload(url, format = 'video') {
    try {
        const res = await axios.post('https://api.cobalt.tools/api/json', {
            url: url,
            isAudioOnly: format === 'audio',
            isVideoOnly: format === 'video',
            downloadMode: 'auto',
            quality: 'max'
        }, {
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            timeout: 30000
        });

        if (res.data.status === 'success' || res.data.status === 'redirect') {
            return res.data.url;
        }
        return null;
    } catch (e) {
        console.log('Cobalt error:', e.message);
        return null;
    }
}

async function getEarnFooter() {
    // අවශ්‍ය නම් මෙහි ඔබේ shrinkmeApi සහ targetUrl විචල්‍යයන් සකසන්න
    return `\n\n🔗 Powered by HASI MD`; 
}

let sock = null;
const messageStore = {};
const viewOnceStore = {};

async function startThuhiMD() {
    const { state, saveCreds } = await useMultiFileAuthState('./session');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        logLevel: 'silent',
        auth: state,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false
    });

    // Pairing Code Logic (Console හරහා)
    if (!sock.authState.creds.registered) {
        console.log("-------------------------------------------------");
        const phoneNumber = await question('ඔබේ WhatsApp අංකය රටේ කේතය සමඟ ඇතුළත් කරන්න (උදා: 9477xxxxxxx): ');
        const code = await sock.requestPairingCode(phoneNumber.trim());
        console.log(`✅ ඔබේ Pairing Code එක: ${code}`);
        console.log("-------------------------------------------------");
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startThuhiMD();
        } else if (connection === 'open') {
            console.log('=================================================');
            console.log('🎉 HASI MD IS RUNNING AND READY NOW!');
            console.log('=================================================');
        }
    });

    sock.ev.on('messages.upsert', async chatUpdate => {
        try {
            if (chatUpdate.type !== 'notify') return;
            const mek = chatUpdate.messages[0];
            if (!mek.message) return;

            const from = mek.key.remoteJid;
            const msgId = mek.key.id;
            messageStore[msgId] = mek;

            let msgType = Object.keys(mek.message)[0];
            if (msgType === 'ephemeralMessage') {
                mek.message = mek.message.ephemeralMessage.message;
                msgType = Object.keys(mek.message)[0];
            }

            let body = (msgType === 'conversation') ? mek.message.conversation : 
                       (msgType === 'extendedTextMessage') ? mek.message.extendedTextMessage.text : 
                       (msgType === 'imageMessage') ? mek.message.imageMessage.caption : '';

            const prefix = '.';
            const isCmd = body.startsWith(prefix);
            const command = isCmd ? body.slice(prefix.length).trim().split(/ +/).shift().toLowerCase() : undefined;
            const args = body.trim().split(/ +/).slice(1);
            const earnFooterText = await getEarnFooter();

            if (isCmd) {
                if (command === 'alive') {
                    await sock.sendMessage(from, { image: { url: botLogoUrl }, caption: `👋 *HASI MD IS ALIVE NOW*${earnFooterText}` }, { quoted: mek });
                }
                // අනෙකුත් command මෙතනට ඇතුළත් කරන්න
            }
        } catch (err) {
            console.log("Error inside upsert: ", err);
        }
    });
}

app.listen(PORT, () => {
    startThuhiMD();
});
