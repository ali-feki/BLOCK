const { gmd, commands } = require("../black_hat/gmdCmds");
const {
  getSetting,
  setSetting,
  getAllSettings,
  resetSetting,
  resetAllSettings,
} = require("../black_hat/database/settings");
const {
  getGroupSetting,
  setGroupSetting,
  getEnabledGroupSettings,
  resetAllGroupSettings,
  getAllGroupSettings,
} = require("../black_hat/database/groupSettings");
const { getSudoNumbers, clearAllSudo } = require("../black_hat/database/sudo");
const {
  getAllUsersNotes,
  deleteNoteById,
  updateNoteById,
  deleteAllNotes,
  NotesDB,
} = require("../black_hat/database/notes");
const { getProfilePic, extractMedia, sendGroupEvent } = require("../black_hat/connection/groupEvents");
// ─── WELCOME ──────────────────────────────────────────────────────────────────
gmd(
{
    pattern: "welcome",
    aliases: ["setwelcome", "welcomemsg"],
    react: "👋",
    category: "group",
    description: "Manage welcome message",
},
async (from, Gifted, conText) => {

    const { reply, react, isSuperUser, isGroup, isAdmin } = conText;

    if (!isGroup) return reply("❌ Groups only!");
    if (!isSuperUser && !isAdmin) return reply("❌ Admin only!");

    // ✅ ORIGINAL MULTILINE MESSAGE FETCH
    const rawText =
        conText?.body ||
        conText?.text ||
        conText?.message?.conversation ||
        conText?.message?.extendedTextMessage?.text ||
        "";

    // ✅ REMOVE COMMAND NAME ONLY
    const arg = rawText
        .replace(/^\.?(welcome)\s*/i, "")
        .replace(/\r/g, "");

    // ✅ FIRST LINE FOR COMMANDS
    const firstLine = arg
        .split("\n")[0]
        .trim()
        .toLowerCase();

    // ─── ON ─────────────────────────────────────────────────────────────
    if (["on", "enable", "true"].includes(firstLine)) {
        await setGroupSetting(from, "WELCOME_MESSAGE", "true");
        await react("✅");
        return reply("✅ Welcome message enabled.");
    }

    // ─── OFF ────────────────────────────────────────────────────────────
    if (["off", "disable", "false"].includes(firstLine)) {
        await setGroupSetting(from, "WELCOME_MESSAGE", "false");
        await react("✅");
        return reply("❌ Welcome message disabled.");
    }

    // ─── GET ────────────────────────────────────────────────────────────
    if (firstLine === "get") {

        const status =
            (await getGroupSetting(from, "WELCOME_MESSAGE")) || "false";

        const raw =
            (await getGroupSetting(from, "WELCOME_MESSAGE_TEXT")) ||
            "Not set.";

        const msg = raw.replace(/\\n/g, "\n");

        return reply(
`*WELCOME:* ${status}

*Message:*
${msg}

*Commands:*
.welcome on
.welcome off
.welcome get
.welcome test
.welcome <message>

*Placeholders:*
&mention
&gname
&desc
&size

*Image Placeholders:*
&pp   ← user profile picture
&gpp  ← group profile picture

⚠️ IMPORTANT:
&pp / &gpp should be ALONE on their own line`
        );
    }

    // ─── TEST ───────────────────────────────────────────────────────────
    if (firstLine === "test") {

        const raw =
            (await getGroupSetting(from, "WELCOME_MESSAGE_TEXT")) ||
            "&mention Welcome to &gname 🎉";

        const metadata = await Gifted.groupMetadata(from);

        const userJid = conText.sender;
        const userNumber = userJid.split("@")[0];

        const [userPP, groupPP] = await Promise.all([
            getProfilePic(Gifted, userJid),
            getProfilePic(Gifted, from),
        ]);

        const ctx = {
            mention: `@${userNumber}`,
            gname: metadata.subject || "Unknown Group",
            desc: metadata.desc || "No description",
            size: metadata.participants?.length || 0,
            pp: userPP,
            gpp: groupPP,
        };

        const { text, image } = extractMedia(raw, ctx);

        return sendGroupEvent(
            Gifted,
            from,
            text,
            image,
            [userJid]
        );
    }

    // ─── EMPTY ──────────────────────────────────────────────────────────
    if (!arg.trim()) {
        return reply(
`❌ Usage:

.welcome on
.welcome off
.welcome get
.welcome test
.welcome <message>`
        );
    }

    // ─── SAVE MULTILINE ────────────────────────────────────────────────
    const normalized = arg.trim();

    console.log("RAW (JSON):", JSON.stringify(normalized));
    console.log("TOTAL LINES:", normalized.split("\n").length);

    // ✅ SAVE \n AS STRING
    const toSave = normalized.replace(/\n/g, "\\n");

    console.log("SAVE:", JSON.stringify(toSave));

    await setGroupSetting(
        from,
        "WELCOME_MESSAGE_TEXT",
        toSave
    );

    await react("✅");

    return reply(
`✅ Welcome message saved!

📌 Lines: ${normalized.split("\n").length}

🧪 Test:
.welcome test`
    );
}
);

// ─── GOODBYE ─────────────────────────────────────────────────────────────────
gmd(
{
    pattern: "goodbye",
    aliases: ["setgoodbye", "goodbyemsg", "bye"],
    react: "👋",
    category: "group",
    description: "Manage goodbye message",
},
async (from, Gifted, conText) => {

    const { reply, react, isSuperUser, isGroup, isAdmin } = conText;

    if (!isGroup) return reply("❌ Groups only!");
    if (!isSuperUser && !isAdmin) return reply("❌ Admin only!");

    // ✅ ORIGINAL MULTILINE MESSAGE FETCH
    const rawText =
        conText?.body ||
        conText?.text ||
        conText?.message?.conversation ||
        conText?.message?.extendedTextMessage?.text ||
        "";

    // ✅ REMOVE COMMAND NAME ONLY
    const arg = rawText
        .replace(/^\.?(goodbye|bye)\s*/i, "")
        .replace(/\r/g, "");

    // ✅ FIRST LINE
    const firstLine = arg
        .split("\n")[0]
        .trim()
        .toLowerCase();

    // ─── ON ─────────────────────────────────────────────────────────────
    if (["on", "enable", "true"].includes(firstLine)) {
        await setGroupSetting(from, "GOODBYE_MESSAGE", "true");
        await react("✅");
        return reply("✅ Goodbye message enabled.");
    }

    // ─── OFF ────────────────────────────────────────────────────────────
    if (["off", "disable", "false"].includes(firstLine)) {
        await setGroupSetting(from, "GOODBYE_MESSAGE", "false");
        await react("✅");
        return reply("❌ Goodbye message disabled.");
    }

    // ─── GET ────────────────────────────────────────────────────────────
    if (firstLine === "get") {

        const status =
            (await getGroupSetting(from, "GOODBYE_MESSAGE")) || "false";

        const raw =
            (await getGroupSetting(from, "GOODBYE_MESSAGE_TEXT")) ||
            "Not set.";

        const msg = raw.replace(/\\n/g, "\n");

        return reply(
`*GOODBYE:* ${status}

*Message:*
${msg}

*Commands:*
.goodbye on
.goodbye off
.goodbye get
.goodbye test
.goodbye <message>

*Placeholders:*
&mention
&gname
&desc
&size

*Image Placeholders:*
&pp   ← user profile picture
&gpp  ← group profile picture

⚠️ IMPORTANT:
&pp / &gpp should be ALONE on their own line`
        );
    }

    // ─── TEST ───────────────────────────────────────────────────────────
    if (firstLine === "test") {

        const raw =
            (await getGroupSetting(from, "GOODBYE_MESSAGE_TEXT")) ||
            "&mention left &gname 👋";

        const metadata = await Gifted.groupMetadata(from);

        const userJid = conText.sender;
        const userNumber = userJid.split("@")[0];

        const [userPP, groupPP] = await Promise.all([
            getProfilePic(Gifted, userJid),
            getProfilePic(Gifted, from),
        ]);

        const ctx = {
            mention: `@${userNumber}`,
            gname: metadata.subject || "Unknown Group",
            desc: metadata.desc || "No description",
            size: metadata.participants?.length || 0,
            pp: userPP,
            gpp: groupPP,
        };

        const { text, image } = extractMedia(raw, ctx);

        return sendGroupEvent(
            Gifted,
            from,
            text,
            image,
            [userJid]
        );
    }

    // ─── EMPTY ──────────────────────────────────────────────────────────
    if (!arg.trim()) {
        return reply(
`❌ Usage:

.goodbye on
.goodbye off
.goodbye get
.goodbye test
.goodbye <message>`
        );
    }

    // ─── SAVE MULTILINE ────────────────────────────────────────────────
    const normalized = arg.trim();

    console.log("RAW (JSON):", JSON.stringify(normalized));
    console.log("TOTAL LINES:", normalized.split("\n").length);

    // ✅ SAVE \n AS STRING
    const toSave = normalized.replace(/\n/g, "\\n");

    console.log("SAVE:", JSON.stringify(toSave));

    await setGroupSetting(
        from,
        "GOODBYE_MESSAGE_TEXT",
        toSave
    );

    await react("✅");

    return reply(
`✅ Goodbye message saved!

📌 Lines: ${normalized.split("\n").length}

🧪 Test:
.goodbye test`
    );
}
);
