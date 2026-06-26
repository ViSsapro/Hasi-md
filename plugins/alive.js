module.exports = {
    name: "alive",
    alias: ["on"],
    desc: "Bot status",
    async execute(sock, m) {
        await sock.sendMessage(m.chat, {
            image: { url: global.thumb },
            caption: `👋 *HASI MD IS ALIVE* ✅\n\nVersion: 1.0.0\nPrefix:.`
        }, { quoted: m });
    }
}