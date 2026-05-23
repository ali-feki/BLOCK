const { DATABASE } = require("./database");
const { DataTypes } = require("sequelize");
const path = require("path");
const config = require("../../config");

const packageJson = require("../../package.json");

const SettingsDB = DATABASE.define(
    "BotSettings",
    {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        key: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
        },
        value: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
    },
    {
        tableName: "bot_settings",
        timestamps: true,
    },
);

const DEFAULT_SETTINGS = {
    PREFIX: config.PREFIX || ".",

    OWNER_NAME: config.OWNER_NAME || "ᬊ͜͡𝐀ɭīī 𝐈𝐍𝅦𝐗īī𝐃𝐄 ꫂ⃟🇺🇸",
    OWNER_NUMBER: config.OWNER_NUMBER || "923147725823",

    BOT_NAME: config.BOT_NAME || "𝐀ɭīī-𝐌𝐃",

    FOOTER: config.FOOTER || "ᴘᴏᴡᴇʀᴇᴅ ʙʏ 𝑨𝒏𝒐𝒏𝒚𝒎𝒐𝒖𝒔 𝒖𝒔𝒆𝒓🥷",
    CAPTION: config.CAPTION || "©2025 𝐀ɭīī-𝐌𝐃",

    BOT_PIC: config.BOT_PIC || "https://files.catbox.moe/m8t72a.jpg",

    VERSION: packageJson?.version ?? "10.0.0",

    MODE: config.MODE || "public",

    WARN_COUNT: config.WARN_COUNT || "3",

    TIME_ZONE: config.TIME_ZONE || "Asia/Karachi",

    DM_PRESENCE: config.DM_PRESENCE || "offline",
    GC_PRESENCE: config.GC_PRESENCE || "offline",

    CHATBOT: config.CHATBOT || "false",
    CHATBOT_MODE: config.CHATBOT_MODE || "inbox",

    STARTING_MESSAGE: config.STARTING_MESSAGE || "true",

    ANTIDELETE: config.ANTIDELETE || "indm",
    ANTI_EDIT: config.ANTI_EDIT || "indm",

    ANTICALL: config.ANTICALL || "false",
    ANTICALL_MSG:
        config.ANTICALL_MSG ||
        "*_📞 Auto Call Reject Mode Active. 📵 No Calls Allowed!_*",

    AUTO_LIKE_STATUS: config.AUTO_LIKE_STATUS || "true",
    AUTO_READ_STATUS: config.AUTO_READ_STATUS || "true",

    STATUS_LIKE_EMOJIS:
        config.STATUS_LIKE_EMOJIS || "💛,❤️,💜,🤍,💙",

    AUTO_REPLY_STATUS: config.AUTO_REPLY_STATUS || "false",

    STATUS_REPLY_TEXT:
        config.STATUS_REPLY_TEXT ||
        "*ʏᴏᴜʀ sᴛᴀᴛᴜs ᴠɪᴇᴡᴇᴅ sᴜᴄᴄᴇssғᴜʟʟʏ ✅*",

    AUTO_REACT: config.AUTO_REACT || "off",
    AUTO_REPLY: config.AUTO_REPLY || "false",
    AUTO_READ_MESSAGES: config.AUTO_READ_MESSAGES || "off",

    AUTO_BIO: config.AUTO_BIO || "false",

    AUTO_BLOCK: config.AUTO_BLOCK || "",

    YT: config.YT || "youtube.com/@ali-inxide",

    NEWSLETTER_JID:
        config.NEWSLETTER_JID ||
        "120363422524788798@newsletter",

    GC_JID: config.GC_JID || "Hw5Am0eSXMZDubYHLzO4JZ",

    NEWSLETTER_URL:
        config.NEWSLETTER_URL ||
        "https://whatsapp.com/channel/0029VaoRxGmJpe8lgCqT1T2h",

    BOT_REPO: config.BOT_REPO || "ALI-INXIDE/ALI-MD",

    PACK_NAME: config.PACK_NAME || "",

    PACK_AUTHOR:
        config.PACK_AUTHOR ||
        "ᬊ͜͡𝐀ɭīī-𝐌𝐃 𝐁𝚯𝐓 ꫂ⃟🇦🇱",

    SUDO_NUMBERS: config.SUDO_NUMBERS || "",

    PM_PERMIT: config.PM_PERMIT || "false",

    ANTIVIEWONCE: config.ANTIVIEWONCE || "indm",
};

let initialized = false;

const GROUP_ONLY_SETTINGS = [
    "WELCOME_MESSAGE",
    "GOODBYE_MESSAGE",
    "GROUP_EVENTS",
    "ANTILINK",
];

async function initializeSettings() {
    if (initialized) return;

    await SettingsDB.sync();

    await SettingsDB.destroy({
        where: { key: GROUP_ONLY_SETTINGS },
    });

    for (const [key, defaultValue] of Object.entries(DEFAULT_SETTINGS)) {
        await SettingsDB.findOrCreate({
            where: { key },
            defaults: { key, value: defaultValue },
        });
    }

    initialized = true;
    console.log("✅ Bot Settings Initialized");
}

async function getSetting(key) {
    if (!initialized) await initializeSettings();

    const record = await SettingsDB.findOne({ where: { key } });
    if (record) {
        return record.value;
    }

    return DEFAULT_SETTINGS[key] || null;
}

async function setSetting(key, value) {
    if (!initialized) await initializeSettings();

    const [record, created] = await SettingsDB.findOrCreate({
        where: { key },
        defaults: { key, value },
    });

    if (!created) {
        record.value = value;
        await record.save();
    }

    return true;
}

async function getAllSettings() {
    if (!initialized) await initializeSettings();

    const records = await SettingsDB.findAll();
    const settings = {};
    for (const record of records) {
        settings[record.key] = record.value;
    }
    return settings;
}

async function resetSetting(key) {
    if (!initialized) await initializeSettings();

    const defaultValue = DEFAULT_SETTINGS[key];
    if (defaultValue !== undefined) {
        await setSetting(key, defaultValue);
        return defaultValue;
    }
    return null;
}

async function resetAllSettings() {
    if (!initialized) await initializeSettings();

    for (const [key, defaultValue] of Object.entries(DEFAULT_SETTINGS)) {
        await setSetting(key, defaultValue);
    }
    return true;
}

module.exports = {
    SettingsDB,
    DEFAULT_SETTINGS,
    initializeSettings,
    getSetting,
    setSetting,
    getAllSettings,
    resetSetting,
    resetAllSettings,
};
