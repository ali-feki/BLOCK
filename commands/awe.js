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
        const { q, reply, react, isSuperUser, isGroup, isAdmin } = conText;

        if (!isGroup) return reply("❌ Groups only!");
        if (!isSuperUser && !isAdmin) return reply("❌ Admin only!");

        const arg = (q || "").trim();

        // cmd sirf pehli line se lo — baaki message ho sakta hai
        const firstLine = arg.split("\n")[0].trim().toLowerCase();

        if (firstLine === "on" || firstLine === "enable" || firstLine === "true") {
            await setGroupSetting(from, "WELCOME_MESSAGE", "true");
            await react("✅");
            return reply("✅ Welcome message enabled.");
        }

        if (firstLine === "off" || firstLine === "disable" || firstLine === "false") {
            await setGroupSetting(from, "WELCOME_MESSAGE", "false");
            await react("✅");
            return reply("❌ Welcome message disabled.");
        }

        if (firstLine === "get") {
            const status = (await getGroupSetting(from, "WELCOME_MESSAGE")) || "false";
            // DB se parhke display ke liye \\n wapas \n karo
            const raw = (await getGroupSetting(from, "WELCOME_MESSAGE_TEXT")) || "Not set.";
            const msg = raw.replace(/\\n/g, "\n");
            return reply(
`*WELCOME:* ${status}

*Message:*
${msg}

*Commands:*
.welcome on / off / get / test
.welcome <message>

*Placeholders:*
&mention &gname &desc &size

*Image:*
&pp  ← user pic (akeli line pe)
&gpp ← group pic (akeli line pe)`
            );
        }

        if (firstLine === "test") {
            const raw = (await getGroupSetting(from, "WELCOME_MESSAGE_TEXT"))
                || "&mention Welcome to &gname 🎉";
            const metadata   = await Gifted.groupMetadata(from);
            const userJid    = conText.sender;
            const userNumber = userJid.split("@")[0];
            const [userPP, groupPP] = await Promise.all([
                getProfilePic(Gifted, userJid),
                getProfilePic(Gifted, from),
            ]);
            const ctx = {
                mention: `@${userNumber}`,
                gname:   metadata.subject || "Unknown Group",
                desc:    metadata.desc    || "No description",
                size:    metadata.participants?.length || 0,
                pp:      userPP,
                gpp:     groupPP,
            };
            const { text, image } = extractMedia(raw, ctx);
            return sendGroupEvent(Gifted, from, text, image, [userJid]);
        }

        if (!arg || ["on","off","get","test"].includes(firstLine)) {
            return reply("❌ Usage: .welcome on/off/get/test/<message>");
        }

        // ─── KEY FIX: newlines escape karke save karo ───────────────────
        // WhatsApp se jo q aata hai usme real \n hoti hain
        // DB string mein ye disappear ho jati hain — isliye \\n save karo
        const toSave = arg.replace(/\n/g, "\\n");
        console.log("[welcome SET] saving to DB:", JSON.stringify(toSave));
        await setGroupSetting(from, "WELCOME_MESSAGE_TEXT", toSave);
        await react("✅");
        return reply(`✅ Welcome message saved!\n\nTest: .welcome test\n\nSaved:\n${arg}`);
    }
);

// ─── GOODBYE ──────────────────────────────────────────────────────────────────
gmd(
    {
        pattern: "goodbye",
        aliases: ["setgoodbye", "goodbyemsg", "bye"],
        react: "👋",
        category: "group",
        description: "Manage goodbye message",
    },
    async (from, Gifted, conText) => {
        const { q, reply, react, isSuperUser, isGroup, isAdmin } = conText;

        if (!isGroup) return reply("❌ Groups only!");
        if (!isSuperUser && !isAdmin) return reply("❌ Admin only!");

        const arg = (q || "").trim();
        const firstLine = arg.split("\n")[0].trim().toLowerCase();

        if (firstLine === "on" || firstLine === "enable" || firstLine === "true") {
            await setGroupSetting(from, "GOODBYE_MESSAGE", "true");
            await react("✅");
            return reply("✅ Goodbye message enabled.");
        }

        if (firstLine === "off" || firstLine === "disable" || firstLine === "false") {
            await setGroupSetting(from, "GOODBYE_MESSAGE", "false");
            await react("✅");
            return reply("❌ Goodbye message disabled.");
        }

        if (firstLine === "get") {
            const status = (await getGroupSetting(from, "GOODBYE_MESSAGE")) || "false";
            const raw = (await getGroupSetting(from, "GOODBYE_MESSAGE_TEXT")) || "Not set.";
            const msg = raw.replace(/\\n/g, "\n");
            return reply(
`*GOODBYE:* ${status}

*Message:*
${msg}

*Commands:*
.goodbye on / off / get / test
.goodbye <message>

*Placeholders:*
&mention &gname &desc &size

*Image:*
&pp  ← user pic (akeli line pe)
&gpp ← group pic (akeli line pe)`
            );
        }

        if (firstLine === "test") {
            const raw = (await getGroupSetting(from, "GOODBYE_MESSAGE_TEXT"))
                || "&mention left &gname 👋";
            const metadata   = await Gifted.groupMetadata(from);
            const userJid    = conText.sender;
            const userNumber = userJid.split("@")[0];
            const [userPP, groupPP] = await Promise.all([
                getProfilePic(Gifted, userJid),
                getProfilePic(Gifted, from),
            ]);
            const ctx = {
                mention: `@${userNumber}`,
                gname:   metadata.subject || "Unknown Group",
                desc:    metadata.desc    || "No description",
                size:    metadata.participants?.length || 0,
                pp:      userPP,
                gpp:     groupPP,
            };
            const { text, image } = extractMedia(raw, ctx);
            return sendGroupEvent(Gifted, from, text, image, [userJid]);
        }

        if (!arg || ["on","off","get","test"].includes(firstLine)) {
            return reply("❌ Usage: .goodbye on/off/get/test/<message>");
        }

        // ─── KEY FIX: newlines escape karke save karo ───────────────────
        const toSave = arg.replace(/\n/g, "\\n");
        console.log("[goodbye SET] saving to DB:", JSON.stringify(toSave));
        await setGroupSetting(from, "GOODBYE_MESSAGE_TEXT", toSave);
        await react("✅");
        return reply(`✅ Goodbye message saved!\n\nTest: .goodbye test\n\nSaved:\n${arg}`);
    }
);
