require('dotenv').config();
const fs = require('fs');
const path = require('path');

const DBL_TOKEN = process.env.DBL_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

if (!DBL_TOKEN || !CLIENT_ID) {
    console.error("HATA: .env dosyasında DBL_TOKEN veya CLIENT_ID bulunamadı.");
    console.error("Lütfen DiscordBotList'den aldığınız bot API Token'ını DBL_TOKEN olarak .env dosyasına ekleyin.");
    process.exit(1);
}

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

const commandsPayload = [];

for (const file of commandFiles) {
    const command = require(path.join(commandsPath, file));
    if (command.data && command.data.name && command.data.description) {
        commandsPayload.push({
            name: command.data.name,
            description: command.data.description,
            type: 1 // 1 is for CHAT_INPUT (slash command)
        });
    }
}

console.log(`Yuklenecek komut sayisi: ${commandsPayload.length} komut bulundu.`);

// Upload commands to DiscordBotList.com
fetch(`https://discordbotlist.com/api/v1/bots/${CLIENT_ID}/commands`, {
    method: 'POST',
    headers: {
        'Authorization': `Bot ${DBL_TOKEN}`,
        'Content-Type': 'application/json'
    },
    body: JSON.stringify(commandsPayload)
})
.then(async res => {
    if (res.ok) {
        console.log("✅ Komutlar DiscordBotList'e başarıyla yüklendi!");
    } else {
        const text = await res.text();
        console.error(`❌ Hata (${res.status}): ${text}`);
    }
})
.catch(err => {
    console.error("Erişim hatası:", err.message);
});
