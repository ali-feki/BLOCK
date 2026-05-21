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
        const { q, reply, react, isSuperUser, isGroup, isAdmin } = conText;

        if (!isGroup) return reply("❌ Groups only!");
        if (!isSuperUser && !isAdmin) return reply("❌ Admin only!");

        const arg = (q || "").trim();
        const cmd = arg.split("\n")[0].toLowerCase().trim(); // sirf pehli line se cmd lo

        if (cmd === "on" || cmd === "enable" || cmd === "true") {
            await setGroupSetting(from, "WELCOME_MESSAGE", "true");
            await react("✅");
            return reply("✅ Welcome message enabled.");
        }

        if (cmd === "off" || cmd === "disable" || cmd === "false") {
            await setGroupSetting(from, "WELCOME_MESSAGE", "false");
            await react("✅");
            return reply("❌ Welcome message disabled.");
        }

        if (cmd === "get") {
            const status = (await getGroupSetting(from, "WELCOME_MESSAGE")) || "false";
            const msg = (await getGroupSetting(from, "WELCOME_MESSAGE_TEXT")) || "Not set.";
            return reply(
`*WELCOME:* ${status}

*Message:*
${msg}

*Commands:*
.welcome on / off / get / test
.welcome <message>

*Placeholders:*
&mention  &gname  &desc  &size

*Image:* Put &pp or &gpp alone on last line
Or put any image URL on last line`
            );
        }

        if (cmd === "test") {
            const raw = (await getGroupSetting(from, "WELCOME_MESSAGE_TEXT"))
                || "&mention Welcome to &gname 🎉";
            const metadata  = await Gifted.groupMetadata(from);
            const userJid   = conText.sender;
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

        // SET — q mein newlines as-is save karo, DB handle karega
        if (!q || ["on","off","get","test"].includes(cmd)) {
            return reply("❌ Usage: .welcome on/off/get/test/<message>");
        }

        // KEY FIX: newlines ko \\n mein convert karke save karo
        // taki DB string mein preserve rahein
        const toSave = q.replace(/\n/g, "\\n");
        await setGroupSetting(from, "WELCOME_MESSAGE_TEXT", toSave);
        await react("✅");
        return reply("✅ Welcome message saved.\n\nTest karo: .welcome test");
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
        const cmd = arg.split("\n")[0].toLowerCase().trim();

        if (cmd === "on" || cmd === "enable" || cmd === "true") {
            await setGroupSetting(from, "GOODBYE_MESSAGE", "true");
            await react("✅");
            return reply("✅ Goodbye message enabled.");
        }

        if (cmd === "off" || cmd === "disable" || cmd === "false") {
            await setGroupSetting(from, "GOODBYE_MESSAGE", "false");
            await react("✅");
            return reply("❌ Goodbye message disabled.");
        }

        if (cmd === "get") {
            const status = (await getGroupSetting(from, "GOODBYE_MESSAGE")) || "false";
            const msg = (await getGroupSetting(from, "GOODBYE_MESSAGE_TEXT")) || "Not set.";
            return reply(
`*GOODBYE:* ${status}

*Message:*
${msg}

*Commands:*
.goodbye on / off / get / test
.goodbye <message>

*Placeholders:*
&mention  &gname  &desc  &size

*Image:* Put &pp or &gpp alone on last line
Or put any image URL on last line`
            );
        }

        if (cmd === "test") {
            const raw = (await getGroupSetting(from, "GOODBYE_MESSAGE_TEXT"))
                || "&mention left &gname 👋";
            const metadata  = await Gifted.groupMetadata(from);
            const userJid   = conText.sender;
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

        if (!q || ["on","off","get","test"].includes(cmd)) {
            return reply("❌ Usage: .goodbye on/off/get/test/<message>");
        }

        // KEY FIX: newlines preserve karke save karo
        const toSave = q.replace(/\n/g, "\\n");
        await setGroupSetting(from, "GOODBYE_MESSAGE_TEXT", toSave);
        await react("✅");
        return reply("✅ Goodbye message saved.\n\nTest karo: .goodbye test");
    }
);
               
