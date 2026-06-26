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

const menuCmd = require('./menu.js');

const app = express();
const PORT = process.env.PORT || 3000;

const botLogoUrl = "https://i.ibb.co/271whBpp/c9d0b775835a.jpg";


// ===== COBALT API HELPER - 100% FREE =====
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
        return null; // <-- < මකලා දැම්මා
    } catch (e) {
        console.log('Cobalt error:', e.message);
        return null;
    }
}

async function getEarnFooter() {
    let shortUrl = targetUrl;
    try {
        const shortRes = await axios.get(`https://shrinkme.io/api?api=${shrinkmeApi}&url=${encodeURIComponent(targetUrl)}`);
        if (shortRes.data && shortRes.data.status === "success") {
            shortUrl = shortRes.data.shortenedUrl;
        }
    } catch (shortErr) {
        // Error උනත් වැඩ කරන්නේ මේකයි
    }
    return `\n\n🔗 ${shortUrl}`; // Footer Text Return කරා
}

let sock = null;
const messageStore = {};
const viewOnceStore = {};

app.use(express.static(path.join(__dirname)));

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

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode!== DisconnectReason.loggedOut;
            if (shouldReconnect) startThuhiMD();
        } else if (connection === 'open') {
            console.log('=================================================');
            console.log('🎉 HASI MD IS RUNNING AND READY NOW!');
            console.log('=================================================');
            try {
                const myNumber = sock.user.id.split(':')[0] + '@s.whatsapp.net';
                const welcomeMsg = `✨ *HASI MD සම්බන්ධ වෙමින් පවතී...*\n\nදැන් ඔබගේ inbox එකෙහි \`.alive\` ලෙස Type කර බෝට් ක්‍රියාකාරීදැයි පරීක්ෂා කරන්න!\n\n_Powered by Vimukthi Thuhina_`;
                await sock.sendMessage(myNumber, { image: { url: botLogoUrl }, caption: welcomeMsg });
            } catch (e) {
                console.log("Error sending welcome message: ", e);
            }
        }
    });

    sock.ev.on('messages.upsert', async chatUpdate => {
        try {
            if (chatUpdate.type!== 'notify') return;
            const mek = chatUpdate.messages[0];
            if (!mek.message) return;

            const from = mek.key.remoteJid;
            const msgId = mek.key.id;

            messageStore[msgId] = mek;

            const isViewOnce = mek.message.viewOnceMessageV2 || mek.message.viewOnceMessage;
            if (isViewOnce) {
                viewOnceStore[msgId] = mek;
            }

            let msgType = Object.keys(mek.message)[0];
            if (msgType === 'ephemeralMessage') {
                mek.message = mek.message.ephemeralMessage.message;
                msgType = Object.keys(mek.message)[0];
            }

            let body = '';
            if (msgType === 'conversation') body = mek.message.conversation;
            else if (msgType === 'extendedTextMessage') body = mek.message.extendedTextMessage.text;
            else if (msgType === 'imageMessage') body = mek.message.imageMessage.caption;
            else if (msgType === 'videoMessage') body = mek.message.videoMessage.caption;

            const prefix = '.';
            const isCmd = body.startsWith(prefix);
            const command = isCmd? body.slice(prefix.length).trim().split(/ +/).shift().toLowerCase() : undefined;
            const args = body.trim().split(/ +/).slice(1);

            // Menu reply system
            if (!isCmd && ['1','2','3','4','5','6','7','8','9'].includes(body.trim())) {
                const earnFooterText = await getEarnFooter();
                await menuCmd.execute(sock, mek, from, botLogoUrl, earnFooterText);
                return;
            }

            if (isCmd) {
                const earnFooterText = await getEarnFooter();

                // ALIVE
                if (command === 'alive') {
                    const aliveMsg = `👋 *HASI MD IS ALIVE NOW*\n\n*OWNER* - HASI MD\n*VERSION* - 1.0.0\n*PREFIX* - [. ]\n\n💬 සියලුම විධානයන් බැලීමට \`.menu\` ලෙස ටයිප් කරන්න!${earnFooterText}`;
                    await sock.sendMessage(from, { image: { url: botLogoUrl }, caption: aliveMsg }, { quoted: mek });
                    return;
                }

                // MENU
                if (command === 'menu' || command === 'help' || command === 'dp') {
                    await menuCmd.execute(sock, mek, from, botLogoUrl, earnFooterText);
                    return;
                }

                // ===== SYSTEM MENU =====
                if (command === 'ping') {
                    const start = Date.now();
                    const msg = await sock.sendMessage(from, { text: '🏓 Pinging...' }, { quoted: mek });
                    const speed = Date.now() - start;
                    await sock.sendMessage(from, { text: `🏓 *PONG!*\n\n⚡ Speed: ${speed}ms\n📡 Status: Online\n🤖 Bot: HASI MD${earnFooterText}`, edit: msg.key });
                    return;
                }

                if (command === 'owner') {
                    const ownerNumber = '9477XXXXXXXX'; // << මේක උඹේ number එකට මාරු කරපන්
                    await sock.sendMessage(from, {
                        contacts: {
                            displayName: 'HASI MD Owner',
                            contacts: [{ vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:HASI MD Owner\nTEL;type=CELL;type=VOICE;waid=${ownerNumber}:+${ownerNumber}\nEND:VCARD` }]
                        },
                        caption: `👑 *Bot Owner Contact*${earnFooterText}`
                    }, { quoted: mek });
                    return;
                }

                if (command === 'jid') {
                    await sock.sendMessage(from, { text: `🆔 *Your WhatsApp ID*\n\n📱 ${from}${earnFooterText}` }, { quoted: mek });
                    return;
                }

                // ===== GROUP MENU =====
                if (command === 'add') {
                    if (!from.endsWith('@g.us')) return await sock.sendMessage(from, { text: '❌ Group එකේ විතරක් වැඩ' }, { quoted: mek });
                    const num = args[0]?.replace(/[^0-9]/g, '');
                    if (!num) return await sock.sendMessage(from, { text: '❌ Number එක දාපන්:.add 94XXXXXXXXX' }, { quoted: mek });
                    await sock.groupParticipantsUpdate(from, [num + '@s.whatsapp.net'], 'add');
                    await sock.sendMessage(from, { text: '✅ Member add කරන ලදී' }, { quoted: mek });
                    return;
                }

                if (command === 'kick') {
                    if (!from.endsWith('@g.us')) return await sock.sendMessage(from, { text: '❌ Group එකේ විතරක් වැඩ' }, { quoted: mek });
                    const mentioned = mek.message.extendedTextMessage?.contextInfo?.mentionedJid;
                    if (!mentioned) return await sock.sendMessage(from, { text: '❌ Member කෙනෙක් tag කරන්න' }, { quoted: mek });
                    await sock.groupParticipantsUpdate(from, mentioned, 'remove');
                    await sock.sendMessage(from, { text: '✅ Kick කරන ලදී' }, { quoted: mek });
                    return;
                }

                if (command === 'promote') {
                    if (!from.endsWith('@g.us')) return await sock.sendMessage(from, { text: '❌ Group එකේ විතරක් වැඩ' }, { quoted: mek });
                    const mentioned = mek.message.extendedTextMessage?.contextInfo?.mentionedJid;
                    if (!mentioned) return await sock.sendMessage(from, { text: '❌ Member කෙනෙක් tag කරන්න' }, { quoted: mek });
                    await sock.groupParticipantsUpdate(from, mentioned, 'promote');
                    await sock.sendMessage(from, { text: '✅ Promote කරන ලදී' }, { quoted: mek });
                    return;
                }

                if (command === 'demote') {
                    if (!from.endsWith('@g.us')) return await sock.sendMessage(from, { text: '❌ Group එකේ විතරක් වැඩ' }, { quoted: mek });
                    const mentioned = mek.message.extendedTextMessage?.contextInfo?.mentionedJid;
                    if (!mentioned) return await sock.sendMessage(from, { text: '❌ Member කෙනෙක් tag කරන්න' }, { quoted: mek });
                    await sock.groupParticipantsUpdate(from, mentioned, 'demote');
                    await sock.sendMessage(from, { text: '✅ Demote කරන ලදී' }, { quoted: mek });
                    return;
                }

                if (command === 'group' && args[0] === 'open') {
                    if (!from.endsWith('@g.us')) return await sock.sendMessage(from, { text: '❌ Group එකේ විතරක් වැඩ' }, { quoted: mek });
                    await sock.groupSettingUpdate(from, 'not_announcement');
                    await sock.sendMessage(from, { text: '🔓 Group එක open කරන ලදී' }, { quoted: mek });
                    return;
                }

                if (command === 'group' && args[0] === 'close') {
                    if (!from.endsWith('@g.us')) return await sock.sendMessage(from, { text: '❌ Group එකේ විතරක් වැඩ' }, { quoted: mek });
                    await sock.groupSettingUpdate(from, 'announcement');
                    await sock.sendMessage(from, { text: '🔒 Group එක close කරන ලදී' }, { quoted: mek });
                    return;
                }

                if (command === 'tagall') {
                    if (!from.endsWith('@g.us')) return await sock.sendMessage(from, { text: '❌ Group එකේ විතරක් වැඩ' }, { quoted: mek });
                    const metadata = await sock.groupMetadata(from);
                    let members = metadata.participants.map(p => `@${p.id.split('@')[0]}`).join('\n');
                    await sock.sendMessage(from, { text: `📢 *HASI MD Tag All*\n\n${members}${earnFooterText}`, mentions: metadata.participants.map(p => p.id) }, { quoted: mek });
                    return;
                }

                // ===== MEDIA MENU =====
                if (command === 'sticker' || command === 's') {
                    const isQuotedImage = msgType === 'extendedTextMessage' && mek.message.extendedTextMessage.contextInfo?.quotedMessage?.imageMessage;
                    const isImage = msgType === 'imageMessage';
                    if (isImage || isQuotedImage) {
                        await sock.sendMessage(from, { text: "⏳ *ස්ටිකරය සාදමින් පවතී...*" }, { quoted: mek });
                        let targetMekForSticker = mek;
                        if (isQuotedImage) {
                            targetMekForSticker = { message: mek.message.extendedTextMessage.contextInfo.quotedMessage };
                        }
                        const buffer = await downloadMediaMessage(targetMekForSticker, 'buffer', {}, { logger: pino() });
                        const sticker = new Sticker(buffer, { pack: 'HASI MD Pack', author: 'Vimukthi Thuhina', type: StickerTypes.FULL, quality: 70 });
                        const stickerBuffer = await sticker.toBuffer();
                        await sock.sendMessage(from, { sticker: stickerBuffer }, { quoted: mek });
                        await sock.sendMessage(from, { text: `🎉 *ඔබේ ස්ටිකරය සාර්ථකව සකසා ඇත!*${earnFooterText}` }, { quoted: mek });
                    } else {
                        await sock.sendMessage(from, { text: `❌ ඡායාරූපයකට reply කරන්න${earnFooterText}` }, { quoted: mek });
                    }
                    return;
                }

                // ===== OVP FIXED FOR VIEW ONCE V2 & V2EXTENSION =====
                if (command === 'ovp') {
                    const quoted = mek.message.extendedTextMessage?.contextInfo?.quotedMessage;
                    if (!quoted) return await sock.sendMessage(from, { text: `❌ View Once එකට reply කර.ovp ගහන්න${earnFooterText}` }, { quoted: mek });

                    let viewOnceMsg = null;
                    if (quoted.viewOnceMessageV2Extension) {
                        viewOnceMsg = quoted.viewOnceMessageV2Extension.message;
                    } else if (quoted.viewOnceMessageV2) {
                        viewOnceMsg = quoted.viewOnceMessageV2.message;
                    } else if (quoted.viewOnceMessage) {
                        viewOnceMsg = quoted.viewOnceMessage.message;
                    }

                    if (!viewOnceMsg) return await sock.sendMessage(from, { text: `❌ View Once නෙමෙයි. Open කරලා බලලා තියෙනවා නම් වැඩ කරන්නේ නෑ${earnFooterText}` }, { quoted: mek });

                    await sock.sendMessage(from, { text: "⏳ View Once save කරනවා..." }, { quoted: mek });

                    try {
                        const buffer = await downloadMediaMessage({ message: viewOnceMsg }, 'buffer', {}, { logger: pino() });
                        const msgType = Object.keys(viewOnceMsg)[0];

                        if (msgType === 'imageMessage') {
                            await sock.sendMessage(from, {
                                image: buffer,
                                caption: '🔓 View Once Photo Saved!\n⚡ HASI MD' + earnFooterText
                            }, { quoted: mek });
                        }
                        else if (msgType === 'videoMessage') {
                            await sock.sendMessage(from, {
                                video: buffer,
                                caption: '🔓 View Once Video Saved!\n⚡ HASI MD' + earnFooterText
                            }, { quoted: mek });
                        }
                        else {
                            await sock.sendMessage(from, { text: `❌ මේ type එක support කරන්නේ නෑ` }, { quoted: mek });
                        }
                    } catch (e) {
                        console.log('OVP Error:', e);
                        await sock.sendMessage(from, { text: `❌ Save කරන්න බැරි වුණා. View Once එක open කරලා බලලා තියෙනවා නම් වැඩ කරන්නේ නෑ${earnFooterText}` }, { quoted: mek });
                    }
                    return;
                }

                if (command === 'toimg') {
                    const isSticker = msgType === 'stickerMessage' || (msgType === 'extendedTextMessage' && mek.message.extendedTextMessage.contextInfo?.quotedMessage?.stickerMessage);
                    if (!isSticker) return await sock.sendMessage(from, { text: `❌ Sticker එකකට reply කර.toimg ගහන්න${earnFooterText}` }, { quoted: mek });
                    await sock.sendMessage(from, { text: "⏳ Image එකට convert කරනවා..." }, { quoted: mek });
                    let targetMek = msgType === 'stickerMessage'? mek : { message: mek.message.extendedTextMessage.contextInfo.quotedMessage };
                    const buffer = await downloadMediaMessage(targetMek, 'buffer', {}, { logger: pino() });
                    await sock.sendMessage(from, { image: buffer, caption: '📷 Converted!' + earnFooterText }, { quoted: mek });
                    return;
                }

                // ===== DOWNLOAD MENU - COBALT API 100% FREE =====

                // FACEBOOK
                if (command === 'facebook' || command === 'fb') {
                    const url = args[0];
                    if (!url) return await sock.sendMessage(from, { text: '❌ FB link එක දාපන්:.fb https://facebook.com/watch?v=...' }, { quoted: mek });
                    await sock.sendMessage(from, { text: "⏳ Cobalt එකෙන් download කරනවා..." }, { quoted: mek });

                    const dlUrl = await cobaltDownload(url, 'video');
                    if (dlUrl) {
                        await sock.sendMessage(from, { video: { url: dlUrl }, caption: '📥 FB Video Downloaded!\n⚡ Powered by Cobalt.tools' + earnFooterText }, { quoted: mek });
                    } else {
                        await sock.sendMessage(from, { text: '❌ Video එක හොයාගන්න බැරි වුණා. Private post එකක් වෙන්න ඇති' + earnFooterText }, { quoted: mek });
                    }
                    return;
                }

                // TIKTOK
                if (command === 'tiktok' || command === 'tt') {
                    const url = args[0];
                    if (!url) return await sock.sendMessage(from, { text: '❌ TikTok link එක දාපන්:.tt https://tiktok.com/@user/video/...' }, { quoted: mek });
                    await sock.sendMessage(from, { text: "⏳ Cobalt එකෙන් download කරනවා..." }, { quoted: mek });

                    const dlUrl = await cobaltDownload(url, 'video');
                    if (dlUrl) {
                        await sock.sendMessage(from, { video: { url: dlUrl }, caption: '📥 TikTok No Watermark!\n⚡ Powered by Cobalt.tools' + earnFooterText }, { quoted: mek });
                    } else {
                        await sock.sendMessage(from, { text: '❌ Video එක download වුණේ නෑ' + earnFooterText }, { quoted: mek });
                    }
                    return;
                }

                // INSTAGRAM
                if (command === 'instagram' || command === 'ig') {
                    const url = args[0];
                    if (!url) return await sock.sendMessage(from, { text: '❌ IG link එක දාපන්:.ig https://instagram.com/reel/...' }, { quoted: mek });
                    await sock.sendMessage(from, { text: "⏳ Cobalt එකෙන් download කරනවා..." }, { quoted: mek });

                    const dlUrl = await cobaltDownload(url, 'video');
                    if (dlUrl) {
                        await sock.sendMessage(from, { video: { url: dlUrl }, caption: '📥 IG Reel Downloaded!\n⚡ Powered by Cobalt.tools' + earnFooterText }, { quoted: mek });
                    } else {
                        await sock.sendMessage(from, { text: '❌ Reel/Story එක download වුණේ නෑ' + earnFooterText }, { quoted: mek });
                    }
                    return;
                }

                // YOUTUBE SONG
                if (command === 'song' || command === 'play') {
                    const query = args.join(' ');
                    if (!query) return await sock.sendMessage(from, { text: '❌ Song name එක දාපන්:.song Despacito' }, { quoted: mek });
                    await sock.sendMessage(from, { text: "⏳ YouTube එකෙන් හොයනවා..." }, { quoted: mek });

                    try {
                        const searchRes = await axios.get(`https://api.dreaded.site/api/youtube/search?q=${encodeURIComponent(query)}`);
                        const videoUrl = `https://youtube.com/watch?v=${searchRes.data.result[0].videoId}`;
                        const title = searchRes.data.result[0].title;

                        const dlUrl = await cobaltDownload(videoUrl, 'audio');
                        if (dlUrl) {
                            await sock.sendMessage(from, { audio: { url: dlUrl }, mimetype: 'audio/mpeg', caption: `🎵 ${title}\n⚡ Powered by Cobalt.tools` + earnFooterText }, { quoted: mek });
                        } else {
                            await sock.sendMessage(from, { text: '❌ Audio download වුණේ නෑ' + earnFooterText }, { quoted: mek });
                        }
                    } catch {
                        await sock.sendMessage(from, { text: '❌ Error occurred' + earnFooterText }, { quoted: mek });
                    }
                    return;
                }

                // YOUTUBE VIDEO
                if (command === 'video' || command === 'yt') {
                    const query = args.join(' ');
                    if (!query) return await sock.sendMessage(from, { text: '❌ Video name එක දාපන්:.video funny cats' }, { quoted: mek });
                    await sock.sendMessage(from, { text: "⏳ YouTube එකෙන් හොයනවා..." }, { quoted: mek });

                    try {
                        const searchRes = await axios.get(`https://api.dreaded.site/api/youtube/search?q=${encodeURIComponent(query)}`);
                        const videoUrl = `https://youtube.com/watch?v=${searchRes.data.result[0].videoId}`;
                        const title = searchRes.data.result[0].title;

                        const dlUrl = await cobaltDownload(videoUrl, 'video');
                        if (dlUrl) {
                            await sock.sendMessage(from, { video: { url: dlUrl }, caption: `🎬 ${title}\n⚡ Powered by Cobalt.tools` + earnFooterText }, { quoted: mek });
                        } else {
                            await sock.sendMessage(from, { text: '❌ Video download වුණේ නෑ' + earnFooterText }, { quoted: mek });
                        }
                    } catch {
                        await sock.sendMessage(from, { text: '❌ Error occurred' + earnFooterText }, { quoted: mek });
                    }
                    return;
                }

                if (command === 'csend') {
                    const url = args[0];
                    if (!url) return await sock.sendMessage(from, { text: '❌ Link එක දාපන්' }, { quoted: mek });
                    await sock.sendMessage(from, { text: `🔗 *Copy Link*\n\n${url}${earnFooterText}` }, { quoted: mek });
                    return;
                }

                if (command === 'apk') {
                    await sock.sendMessage(from, { text: `📦 APK downloader soon...${earnFooterText}` }, { quoted: mek });
                    return;
                }

                if (command === 'comicdl') {
                    await sock.sendMessage(from, { text: `📎 Comic downloader soon...${earnFooterText}` }, { quoted: mek });
                    return;
                }

                if (command === 'mangadl') {
                    await sock.sendMessage(from, { text: `🏷️ Manga downloader soon...${earnFooterText}` }, { quoted: mek });
                    return;
                }

                // ===== ANIME MENU =====
                if (command === 'neko') {
                    try {
                        const res = await axios.get('https://api.waifu.pics/sfw/neko');
                        await sock.sendMessage(from, { image: { url: res.data.url }, caption: '🐱 Neko!' + earnFooterText }, { quoted: mek });
                    } catch { await sock.sendMessage(from, { text: '❌ Error' }, { quoted: mek }); }
                    return;
                }

                if (command === 'waifu') {
                    try {
                        const res = await axios.get('https://api.waifu.pics/sfw/waifu');
                        await sock.sendMessage(from, { image: { url: res.data.url }, caption: '🦊 Waifu!' + earnFooterText }, { quoted: mek });
                    } catch { await sock.sendMessage(from, { text: '❌ Error' }, { quoted: mek }); }
                    return;
                }

                if (command === 'anime') {
                    try {
                        const res = await axios.get('https://api.waifu.pics/sfw/anime');
                        await sock.sendMessage(from, { image: { url: res.data.url }, caption: '🌸 Anime!' + earnFooterText }, { quoted: mek });
                    } catch { await sock.sendMessage(from, { text: '❌ Error' }, { quoted: mek }); }
                    return;
                }

                if (command === 'cosplay') {
                    try {
                        const res = await axios.get('https://api.waifu.pics/sfw/cosplay');
                        await sock.sendMessage(from, { image: { url: res.data.url }, caption: '🎭 Cosplay!' + earnFooterText }, { quoted: mek });
                    } catch { await sock.sendMessage(from, { text: '❌ Error' }, { quoted: mek }); }
                    return;
                }

                // ===== INFO MENU =====
                if (command === 'botinfo') {
                    const uptime = process.uptime();
                    const hours = Math.floor(uptime / 3600);
                    const minutes = Math.floor((uptime % 3600) / 60);
                    await sock.sendMessage(from, { text: `ℹ️ *HASI MD Bot Info*\n\n👑 Owner: Vimukthi Thuhina\n📦 Version: 1.0.0\n⏱️ Uptime: ${hours}h ${minutes}m\n📡 Status: Online${earnFooterText}` }, { quoted: mek });
                    return;
                }

                if (command === 'status') {
                    const mem = process.memoryUsage();
                    const rss = Math.round(mem.rss / 1024 / 1024);
                    await sock.sendMessage(from, { text: `📊 *Bot Status*\n\n💾 Memory: ${rss} MB\n⚡ Speed: Fast\n🔋 Status: Active${earnFooterText}` }, { quoted: mek });
                    return;
                }

                if (command === 'runtime') {
                    const uptime = process.uptime();
                    const hours = Math.floor(uptime / 3600);
                    const minutes = Math.floor((uptime % 3600) / 60);
                    const seconds = Math.floor(uptime % 60);
                    await sock.sendMessage(from, { text: `🕐 *Bot Runtime*\n\n⏱️ ${hours}h ${minutes}m ${seconds}s${earnFooterText}` }, { quoted: mek });
                    return;
                }

                if (command === 'ip') {
                    try {
                        const res = await axios.get('https://api.ipify.org?format=json');
                        await sock.sendMessage(from, { text: `🌍 *Server IP*\n\n📡 ${res.data.ip}${earnFooterText}` }, { quoted: mek });
                    } catch { await sock.sendMessage(from, { text: '❌ Error' }, { quoted: mek }); }
                    return;
                }

                // ===== FUN MENU =====
                if (command === 'dice') {
                    const roll = Math.floor(Math.random() * 6) + 1;
                    await sock.sendMessage(from, { text: `🎲 *Dice Roll*\n\nResult: ${roll} 🎉${earnFooterText}` }, { quoted: mek });
                    return;
                }

                if (command === 'coinflip') {
                    const result = Math.random() > 0.5? 'Heads 🪙' : 'Tails 🪙';
                    await sock.sendMessage(from, { text: `🪙 *Coin Flip*\n\nResult: ${result}${earnFooterText}` }, { quoted: mek });
                    return;
                }

                if (command === 'joke') {
                    const jokes = ['Why did the bot cross the road? To get to the other server! 😂', 'I am not lazy, I am on energy saving mode 😴', '404 Error: Joke not found... Just kidding! 😂'];
                    await sock.sendMessage(from, { text: `😂 *Joke*\n\n${jokes[Math.floor(Math.random() * jokes.length)]}${earnFooterText}` }, { quoted: mek });
                    return;
                }

                if (command === 'truth') {
                    const truths = ['ඔයාගේ crush කවුද?', 'අන්තිමට බොරු කිව්වේ කවදාද?', 'ඔයාගේ secret talent එක මොකක්ද?'];
                    await sock.sendMessage(from, { text: `🎮 *TRUTH*\n\n${truths[Math.floor(Math.random() * truths.length)]}${earnFooterText}` }, { quoted: mek });
                    return;
                }

                // ===== NSFW MENU =====
                if (command === 'nsfw1' || command === 'nsfw2') {
                    await sock.sendMessage(from, { text: `🔞 *NSFW content disabled*\n\nPrivate use only. API key ඕන.${earnFooterText}` }, { quoted: mek });
                    return;
                }

                // ===== MOVIE MENU =====
                if (command === 'movie') {
                    const query = args.join(' ');
                    if (!query) return await sock.sendMessage(from, { text: '❌ Movie name එක දාපන්' }, { quoted: mek });
                    try {
                        const res = await axios.get(`http://www.omdbapi.com/?t=${encodeURIComponent(query)}&apikey=YOUR_OMDB_KEY`);
                        if (res.data.Response === 'False') return await sock.sendMessage(from, { text: '❌ Movie හොයාගන්න බැරි වුණා' }, { quoted: mek });
                        await sock.sendMessage(from, {
                            image: { url: res.data.Poster },
                            caption: `🎬 *${res.data.Title}*\n⭐ Rating: ${res.data.imdbRating}\n📅 Year: ${res.data.Year}\n🎭 Genre: ${res.data.Genre}\n📝 Plot: ${res.data.Plot}${earnFooterText}`
                        }, { quoted: mek });
                    } catch { await sock.sendMessage(from, { text: '❌ OMDB API key එක දාපන්' }, { quoted: mek }); }
                    return;
                }

                if (command === 'rating') {
                    const query = args.join(' ');
                    if (!query) return await sock.sendMessage(from, { text: '❌ Movie name එක දාපන්' }, { quoted: mek });
                    try {
                        const res = await axios.get(`http://www.omdbapi.com/?t=${encodeURIComponent(query)}&apikey=YOUR_OMDB_KEY`);
                        await sock.sendMessage(from, { text: `⭐ *${res.data.Title}*\n\nIMDB: ${res.data.imdbRating}/10${earnFooterText}` }, { quoted: mek });
                    } catch { await sock.sendMessage(from, { text: '❌ API key ඕන' }, { quoted: mek }); }
                    return;
                }

                if (command === 'upcoming') {
                    await sock.sendMessage(from, { text: `📅 *Upcoming Movies*\n\nAPI key එක දාන්න ඕන${earnFooterText}` }, { quoted: mek });
                    return;
                }

                if (command === 'genre') {
                    const genre = args[0];
                    if (!genre) return await sock.sendMessage(from, { text: '❌ Genre එක දාපන්:.genre action' }, { quoted: mek });
                    await sock.sendMessage(from, { text: `🎭 *${genre} Movies*\n\nAPI key එක දාන්න ඕන${earnFooterText}` }, { quoted: mek });
                    return;
                }
            }
        } catch (err) {
            console.log("Error inside upsert: ", err);
        }
    });

    sock.ev.on('messages.update', async chatUpdate => {
        for (const { key, update } of chatUpdate) {
            if (update.messageStubType === 68 || update.revoke) {
                const deletedMsgId = key.id;
                const oldMessage = messageStore[deletedMsgId];
                if (oldMessage) {
                    const from = key.remoteJid;
                    const participant = key.participant || key.remoteJid;
                    const senderNum = participant.split('@')[0];
                    let innerMsg = oldMessage.message;
                    let innerType = Object.keys(innerMsg)[0];
                    if (innerType === 'ephemeralMessage') {
                        innerMsg = innerMsg.ephemeralMessage.message;
                        innerType = Object.keys(innerMsg)[0];
                    }
                    let deletedText = '';
                    if (innerType === 'conversation') deletedText = innerMsg.conversation;
                    else if (innerType === 'extendedTextMessage') deletedText = innerMsg.extendedTextMessage.text;
                    else if (innerType === 'imageMessage') deletedText = innerMsg.imageMessage.caption || '🖼️ (caption නැත)';
                    else if (innerType === 'videoMessage') deletedText = innerMsg.videoMessage.caption || '📹 (caption නැත)';
                    else deletedText = '📦 Media';
                    const earnFooterText = await getEarnFooter();
                    const antiDeleteAlert = `*°❤️🛑 ANTI DELETE DETECTED 🛑❤️°*\n\n• *Deleted By:* @${senderNum}\n💬 *Message:* ${deletedText}\n\n| © *HASI MD MINI BOT*${earnFooterText}`;
                    await sock.sendMessage(from, { text: antiDeleteAlert, mentions: [participant] });
                    const hasMedia = ['imageMessage', 'videoMessage'].includes(innerType);
                    if (hasMedia) {
                        try {
                            const buffer = await downloadMediaMessage(oldMessage, 'buffer', {}, { logger: pino() });
                            if (innerType === 'imageMessage') {
                                await sock.sendMessage(from, { image: buffer, caption: '🔺 *මකාදැමූ ඡායාරූපය*' });
                            } else if (innerType === 'videoMessage') {
                                await sock.sendMessage(from, { video: buffer, caption: '🔺 *මකාදැමූ වීඩියෝව*' });
                            }
                        } catch (mediaErr) {}
                    }
                }
            }
        }
    });
}

app.get('/code', async (req, res) => {
    let num = req.query.number;
    if (!num) return res.status(400).json({ error: "Number is required" });
    num = num.replace(/[^0-9]/g, "");
    try {
        if (!sock) return res.status(500).json({ error: "Server not ready" });
        await delay(2000);
        let code = await sock.requestPairingCode(num.trim());
        return res.json({ code: code });
    } catch (error) {
        return res.status(500).json({ error: "Error getting code" });
    }
});

app.listen(PORT, () => {
    startThuhiMD();
});
