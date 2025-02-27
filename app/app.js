import express from 'express';
import { Client } from "whatsapp-web.js";
import pkg from "qrcode-terminal";
import path from "path";
import { fileURLToPath } from "url";
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sessionDir = path.join(__dirname, 'session');

const app = express();
const PORT = process.env.PORT || 3000;

const client = new Client({
    puppeteer: {
        userDataDir: sessionDir
    }
});

let db;
(async () => {
    db = await open({
        filename: './database.db',
        driver: sqlite3.Database
    });
    await db.exec(`
      CREATE TABLE IF NOT EXISTS users (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         whatsapp_id TEXT UNIQUE,
         balance INTEGER DEFAULT 0
      );
    `);
    await db.exec(`
      CREATE TABLE IF NOT EXISTS transactions (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         user_id INTEGER,
         value INTEGER,
         type TEXT,
         date TEXT,
         FOREIGN KEY(user_id) REFERENCES users(id)
      );
    `);
})();

client.on("qr", (qr) => {
    console.log("QR code:", qr);
    pkg.generate(qr, { small: true });
});

client.on("ready", () => {
    console.log("WhatsApp client is ready!");
});

client.on("message", async (message) => {
    const msgBody = message.body;
    const whatsappId = message.from;
    const lowerMsg = msgBody.toLowerCase();

    let user = await db.get("SELECT * FROM users WHERE whatsapp_id = ?", whatsappId);
    if (!user) {
        const result = await db.run("INSERT INTO users (whatsapp_id, balance) VALUES (?, 0)", whatsappId);
        user = { id: result.lastID, whatsapp_id: whatsappId, balance: 0 };
    }

    async function addTransaction(value, type) {
       await db.run(
         "INSERT INTO transactions (user_id, value, type, date) VALUES (?, ?, ?, ?)",
         user.id,
         value,
         type,
         new Date().toLocaleString()
       );
    }

    async function formatExtract() {
       let extract = "Extrato Atual:\n\n";
       extract += `Saldo atual: R$${user.balance}\n\n`;
       extract += "Histórico de transações:\n";
       const transactions = await db.all("SELECT * FROM transactions WHERE user_id = ? ORDER BY id", user.id);
       transactions.forEach((transaction, index) => {
           extract += `${index + 1}. ${transaction.type} R$${transaction.value} - ${transaction.date}\n`;
       });
       return extract;
    }

    if (lowerMsg.startsWith("ganhei") || lowerMsg.startsWith("recebi")) {
        const parts = msgBody.split(" ");
        if (parts.length < 2) {
            message.reply("Por favor, informe o valor após o comando (ex.: 'ganhei 100').");
            return;
        }
        const value = parseInt(parts[1]);
        if (isNaN(value)) {
            message.reply("Valor inválido! Certifique-se de informar um número válido após o comando.");
            return;
        }
        user.balance += value;
        await db.run("UPDATE users SET balance = ? WHERE id = ?", user.balance, user.id);
        await addTransaction(value, 'Receita');
        message.reply(`Recebi uma receita de R$${value} com sucesso!\nNovo saldo: R$${user.balance}`);
    }
    else if (lowerMsg.startsWith("gastei") || lowerMsg.startsWith("paguei")) {
        const parts = msgBody.split(" ");
        if (parts.length < 2) {
            message.reply("Por favor, informe o valor após o comando (ex.: 'gastei 50').");
            return;
        }
        const value = parseInt(parts[1]);
        if (isNaN(value)) {
            message.reply("Valor inválido! Certifique-se de informar um número válido após o comando.");
            return;
        }
        if (value > user.balance) {
            message.reply("Valor da despesa maior que o saldo disponível!");
            return;
        }
        user.balance -= value;
        await db.run("UPDATE users SET balance = ? WHERE id = ?", user.balance, user.id);
        await addTransaction(value, 'Despesa');
        message.reply(`Despesa de R$${value} registrada com sucesso!\nNovo saldo: R$${user.balance}`);
    }
    else if (msgBody === "!total") {
        message.reply(`Seu saldo atual é de R$${user.balance}`);
    } 
    else if (msgBody === "!extrato") {
        message.reply(await formatExtract());
    }
    else if (msgBody === "!ajuda") {
        const helpMessage = "Comandos disponíveis:\n\n" +
                            "ganhei [valor] ou recebi [valor] - Adicionar receita\n" +
                            "gastei [valor] ou paguei [valor] - Registrar despesa\n" +
                            "!total - Ver saldo atual\n" +
                            "!extrato - Ver histórico completo\n" +
                            "!ajuda - Ver esta lista de comandos\n" +
                            "!teste - Testar o bot";
        message.reply(helpMessage);
    }
    else if (msgBody === "!teste") {
        message.reply("testado");
    }
});

client.on("authenticated", (session) => {
    console.log("Authenticated");
});

client.on("auth_failure", (msg) => {
    console.error("Authentication failed:", msg);
});

client.initialize();

client.on("ready", () => {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
});
