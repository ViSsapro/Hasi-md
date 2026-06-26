const speed = require('performance-now'); // npm i performance-now

module.exports = {
    name: "ping",
    alias: ["speed", "pong"],
    desc: "Check bot speed",
    category: "Main",
    use: ".ping",

    async execute(sock, m) {
        const start = speed();
        let msg = await sock.sendMessage(m.chat, { text: '🏓 Pinging...' }, { quoted: m });
        const end = speed();
        const latency = Math.round(end - start);

        await sock.sendMessage(m.chat, { 
            text: `🏓 *PONG!*\n\n⚡ Speed: ${latency}ms\n📡 Status: Online\n🤖 Bot: ${global.botname}`,
            edit: msg.key 
        });
    }
}