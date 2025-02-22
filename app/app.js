import express from 'express';
import { Client } from "whatsapp-web.js";
import pkg from "qrcode-terminal";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sessionDir = path.join(__dirname, 'session');

const app = express();
const PORT = process.env.PORT || 3000;

let balance = 0;
let transactionHistory = [];

const client = new Client({
    puppeteer: {
        userDataDir: sessionDir
    }
});

function addTransaction(value, type) {
    transactionHistory.push({
        value: value,
        type: type,
        date: new Date().toLocaleString()
    });
}

function formatExtract() {
    let message = "Extrato Atual:\n\n";
    message += `Saldo atual: R$${balance}\n\n`;
    message += "Histórico de transações:\n";
    transactionHistory.forEach((transaction, index) => {
        message += `${index + 1}. ${transaction.type} R$${transaction.value} - ${transaction.date}\n`;
    });
    return message;
}

client.on("qr", (qr) => {
    console.log("QR code:", qr);
    pkg.generate(qr, { small: true });
});

client.on("ready", () => {
    console.log("WhatsApp client is ready!");
});

client.on("message", (message) => {
    const msgBody = message.body;
    console.log(message.from, msgBody);

    if (msgBody.startsWith('+') || msgBody.startsWith('-')) {
        try {
            const value = parseInt(msgBody.slice(1));
            if (isNaN(value)) {
                message.reply("Valor inválido! Por favor, use o formato correto: + ou - seguido de um número.");
                return;
            }
            if (msgBody.startsWith('+')) {
                balance += value;
                addTransaction(value, 'Receita');
                message.reply(`Receita de R$${value} adicionada com sucesso!\nNovo saldo: R$${balance}`);
            } else if (msgBody.startsWith('-')) {
                if (value > balance) {
                    message.reply("Valor da despesa maior que o saldo disponível!");
                    return;
                }
                balance -= value;
                addTransaction(value, 'Despesa');
                message.reply(`Despesa de R$${value} registrada com sucesso!\nNovo saldo: R$${balance}`);
            }
        } catch (error) {
            message.reply("Valor inválido! Por favor, use o formato correto: + ou - seguido de um número.");
        }
    }
    // Other commands
    else if (msgBody === "!total") {
        message.reply(`Seu saldo atual é de R$${balance}`);
    } 
    else if (msgBody === "!extrato") {
        message.reply(formatExtract());
    }
    else if (msgBody === "!ajuda") {
        const helpMessage = "Comandos disponíveis:\n\n" +
                            "+[valor] - Adicionar receita\n" +
                            "-[valor] - Registrar despesa\n" +
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
