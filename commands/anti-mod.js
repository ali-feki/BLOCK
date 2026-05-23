const { gmd, getGroupMetadata, getLidMapping } = require("../black_hat");

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
  getBadWords,
  addBadWord,
  removeBadWord,
  clearBadWords,
  initializeDefaultBadWords,
  DEFAULT_BAD_WORDS,
} = require("../black_hat/database/groupSettings");

const {
  getSudoNumbers,
  clearAllSudo,
} = require("../black_hat/database/sudo");

const {
  getAllUsersNotes,
  deleteNoteById,
  updateNoteById,
  deleteAllNotes,
  NotesDB,
} = require("../black_hat/database/notes");

/* ──────────────────────────────────────────────
   ANTI STICKER
────────────────────────────────────────────── */
gmd(
{
    pattern: "antisticker",
    react: "🛡️",
    aliases: [
        "antistiker",
        "nosticker",
        "antist",
        "stickerblock",
    ],
    category: "group",
    description: "Manage anti-sticker system",
},
async (from, Gifted, conText) => {

    const {
        q,
        reply,
        react,
        isGroup,
        isAdmin,
        isSuperAdmin,
        isBotAdmin,
        botPrefix,
    } = conText;

    if (!isGroup)
        return reply("*Wrong place. This command works in groups only!* 🍀");

    if (!isAdmin && !isSuperAdmin)
        return reply("*This command is only for group admins!* 🍉");

    if (!isBotAdmin)
        return reply("*Bot must be an admin to use this command!* 🛡️");

    const input = (q || "").toLowerCase().trim();

    const modeMap = {
        on: "delete",
        delete: "delete",
        warn: "warn",
        kick: "kick",
        null: "null",
        off: "off",
        false: "off",
    };

    if (!input) {

        const current =
            await getGroupSetting(from, "ANTISTICKER");

        const status =
            !current || current === "off"
                ? "OFF"
                : current.toUpperCase();

        return reply(
`*Anti-Sticker Panel*

Current Mode: *${status}*

Available Modes
- ${botPrefix}antisticker on
- ${botPrefix}antisticker delete
- ${botPrefix}antisticker warn
- ${botPrefix}antisticker kick
- ${botPrefix}antisticker null
- ${botPrefix}antisticker off`
        );
    }

    const mode = modeMap[input];

    if (!mode)
        return reply("Invalid mode! Use: on/delete/warn/kick/null/off");

    try {

        if (mode === "off") {

            await setGroupSetting(from, "ANTISTICKER", "off");
            await react("✅");

            return reply("Anti-Sticker disabled. Group sticker protection turned OFF.");
        }

        await setGroupSetting(from, "ANTISTICKER", mode);
        await react("✅");

        const messages = {
            delete: `Anti-Sticker enabled.\nMode: *DELETE*\nStickers will be deleted automatically.`,
            warn:   `Anti-Sticker enabled.\nMode: *WARN*\nUsers will receive warnings for stickers.`,
            kick:   `Anti-Sticker enabled.\nMode: *KICK*\nSticker senders will be removed instantly.`,
            null:   `Anti-Sticker enabled.\nMode: *SILENT DELETE*\nStickers deleted silently.`,
        };

        return reply(messages[mode]);

    } catch (e) {
        console.error(e);
        return reply(`Error: ${e.message}`);
    }
});

/* ──────────────────────────────────────────────
   ANTI STATUS MENTION
────────────────────────────────────────────── */
gmd(
{
    pattern: "antistatusmention",
    react: "🛡️",
    aliases: [
        "antigroupmention",
        "antigcmention",
        "agm",
        "statusmention",
    ],
    category: "group",
    description: "Protect group from status mentions",
},
async (from, Gifted, conText) => {

    const {
        q,
        reply,
        react,
        isGroup,
        isAdmin,
        isSuperAdmin,
        isBotAdmin,
        botPrefix,
    } = conText;

    if (!isGroup)
        return reply("*Wrong place. This command works in groups only!* 🍀");

    if (!isAdmin && !isSuperAdmin)
        return reply("*This command is only for group admins!* 🍉");

    if (!isBotAdmin)
        return reply("*Bot must be an admin to use this command!* 🛡️");

    const input = (q || "").toLowerCase().trim();

    const modeMap = {
        on: "warn",
        warn: "warn",
        delete: "delete",
        kick: "kick",
        null: "null",
        off: "off",
        false: "off",
    };

    if (!input) {

        const current =
            await getGroupSetting(from, "ANTISTATUSMENTION");

        const status =
            !current || current === "off"
                ? "OFF"
                : current.toUpperCase();

        return reply(
`*Anti-Status-Mention Panel*

Current Mode: *${status}*

Available Modes
- ${botPrefix}antistatusmention on
- ${botPrefix}antistatusmention warn
- ${botPrefix}antistatusmention delete
- ${botPrefix}antistatusmention kick
- ${botPrefix}antistatusmention null
- ${botPrefix}antistatusmention off`
        );
    }

    const mode = modeMap[input];

    if (!mode)
        return reply("Invalid mode! Use: on/warn/delete/kick/null/off");

    try {

        if (mode === "off") {

            await setGroupSetting(from, "ANTISTATUSMENTION", "off");
            await react("✅");

            return reply("Anti-Status-Mention disabled. Status mention protection OFF.");
        }

        await setGroupSetting(from, "ANTISTATUSMENTION", mode);
        await react("✅");

        const messages = {
            warn:   `Anti-Status-Mention enabled.\nMode: *WARN*\nUsers mentioning group in status will be warned.`,
            delete: `Anti-Status-Mention enabled.\nMode: *DELETE*\nStatus mentions will be removed automatically.`,
            kick:   `Anti-Status-Mention enabled.\nMode: *KICK*\nUsers mentioning group in status will be removed.`,
            null:   `Anti-Status-Mention enabled.\nMode: *SILENT DELETE*\nStatus mentions deleted silently.`,
        };

        return reply(messages[mode]);

    } catch (e) {
        console.error(e);
        return reply(`Error: ${e.message}`);
    }
});

/* ──────────────────────────────────────────────
   ANTI LINK
────────────────────────────────────────────── */
gmd(
{
    pattern: "antilink",
    react: "🛡️",
    aliases: [
        "setantilink",
        "linkblock",
        "antilinks",
    ],
    category: "group",
    description: "Manage anti-link protection",
},
async (from, Gifted, conText) => {

    const {
        q,
        reply,
        react,
        isGroup,
        isAdmin,
        isSuperAdmin,
        isBotAdmin,
        botPrefix,
    } = conText;

    if (!isGroup)
        return reply("*Wrong place. This command works in groups only!* 🍀");

    if (!isAdmin && !isSuperAdmin)
        return reply("*This command is only for group admins!* 🍉");

    if (!isBotAdmin)
        return reply("*Bot must be an admin to use this command!* 🛡️");

    const input = (q || "").toLowerCase().trim();

    const modeMap = {
        on: "delete",
        delete: "delete",
        warn: "warn",
        kick: "kick",
        null: "null",
        off: "off",
        false: "off",
    };

    if (!input) {

        const current =
            await getGroupSetting(from, "ANTILINK");

        const status =
            !current || current === "off"
                ? "OFF"
                : current.toUpperCase();

        const warnCount =
            (await getGroupSetting(from, "ANTILINK_WARN_COUNT")) || 3;

        return reply(
`*Anti-Link Panel*

Current Mode: *${status}*
Warn Limit: *${warnCount}*

Available Modes
- ${botPrefix}antilink on
- ${botPrefix}antilink delete
- ${botPrefix}antilink warn
- ${botPrefix}antilink kick
- ${botPrefix}antilink null
- ${botPrefix}antilink off

Whitelist / Blacklist
- ${botPrefix}antilink allowed youtube.com,wa.me
- ${botPrefix}antilink disallowed t.me,bit.ly
- ${botPrefix}antilink reset
- ${botPrefix}antilink status`
        );
    }

    // ── whitelist ─────────────────────────────────────────────────────────────
    if (input.startsWith("allowed") || input.startsWith("whitelist")) {
        const rest = input.replace(/^(allowed|whitelist)\s*/, "").trim();
        if (!rest) {
            const raw = await getGroupSetting(from, "ANTILINK_ALLOWED");
            const list = raw && raw !== "0"
                ? raw.split(",").map(d => d.trim()).filter(Boolean)
                : [];
            return reply(
                list.length
                    ? `Allowed domains (whitelist):\n${list.map(d => `- ${d}`).join("\n")}`
                    : "No domains in whitelist."
            );
        }
        const incoming = rest.split(",").map(d => d.trim().toLowerCase()).filter(Boolean);
        const raw = await getGroupSetting(from, "ANTILINK_ALLOWED");
        const existing = raw && raw !== "0" ? raw.split(",").map(d => d.trim()).filter(Boolean) : [];
        const merged = [...new Set([...existing, ...incoming])];
        await setGroupSetting(from, "ANTILINK_ALLOWED", merged.join(","));
        await react("✅");
        return reply(`Whitelist updated:\n${merged.map(d => `- ${d}`).join("\n")}\n\nThese links will never be blocked.`);
    }

    // ── blacklist ─────────────────────────────────────────────────────────────
    if (input.startsWith("disallowed") || input.startsWith("blacklist")) {
        const rest = input.replace(/^(disallowed|blacklist)\s*/, "").trim();
        if (!rest) {
            const raw = await getGroupSetting(from, "ANTILINK_DISALLOWED");
            const list = raw && raw !== "0"
                ? raw.split(",").map(d => d.trim()).filter(Boolean)
                : [];
            return reply(
                list.length
                    ? `Blocked domains (blacklist):\n${list.map(d => `- ${d}`).join("\n")}`
                    : "No domains in blacklist."
            );
        }
        const incoming = rest.split(",").map(d => d.trim().toLowerCase()).filter(Boolean);
        const raw = await getGroupSetting(from, "ANTILINK_DISALLOWED");
        const existing = raw && raw !== "0" ? raw.split(",").map(d => d.trim()).filter(Boolean) : [];
        const merged = [...new Set([...existing, ...incoming])];
        await setGroupSetting(from, "ANTILINK_DISALLOWED", merged.join(","));
        await react("✅");
        return reply(`Blacklist updated:\n${merged.map(d => `- ${d}`).join("\n")}\n\nThese links will always be blocked.`);
    }

    // ── reset ─────────────────────────────────────────────────────────────────
    if (input === "reset" || input === "clear") {
        await setGroupSetting(from, "ANTILINK_ALLOWED", "0");
        await setGroupSetting(from, "ANTILINK_DISALLOWED", "0");
        await react("✅");
        return reply("Antilink rules reset. Whitelist and blacklist cleared.");
    }

    // ── status ────────────────────────────────────────────────────────────────
    if (input === "status") {
        const mode = (await getGroupSetting(from, "ANTILINK")) || "off";
        const warnCount = (await getGroupSetting(from, "ANTILINK_WARN_COUNT")) || 3;
        const allowedRaw = await getGroupSetting(from, "ANTILINK_ALLOWED");
        const blockedRaw = await getGroupSetting(from, "ANTILINK_DISALLOWED");
        const allowed = allowedRaw && allowedRaw !== "0" ? allowedRaw.split(",").map(d => d.trim()).filter(Boolean) : [];
        const blocked = blockedRaw && blockedRaw !== "0" ? blockedRaw.split(",").map(d => d.trim()).filter(Boolean) : [];
        return reply(
`*Antilink Status*

Mode: *${mode === "off" ? "OFF" : mode.toUpperCase()}*
Warn limit: *${warnCount}*

Whitelist (${allowed.length}):
${allowed.length ? allowed.map(d => `- ${d}`).join("\n") : "None"}

Blacklist (${blocked.length}):
${blocked.length ? blocked.map(d => `- ${d}`).join("\n") : "None"}`
        );
    }

    const mode = modeMap[input];

    if (!mode)
        return reply("Invalid mode! Use: on/delete/warn/kick/null/off");

    try {

        if (mode === "off") {

            await setGroupSetting(from, "ANTILINK", "off");
            await react("✅");

            return reply("Anti-Link disabled. Group link protection turned OFF.");
        }

        await setGroupSetting(from, "ANTILINK", mode);
        await react("✅");

        const warnCount =
            (await getGroupSetting(from, "ANTILINK_WARN_COUNT")) || 3;

        const messages = {
            delete: `Anti-Link enabled.\nMode: *DELETE*\nLinks will be deleted automatically.`,
            warn:   `Anti-Link enabled.\nMode: *WARN*\nUsers will be warned for links.\nKick after *${warnCount}* warnings.`,
            kick:   `Anti-Link enabled.\nMode: *KICK*\nUsers sending links will be removed instantly.`,
            null:   `Anti-Link enabled.\nMode: *SILENT DELETE*\nLinks deleted silently.`,
        };

        return reply(messages[mode]);

    } catch (e) {
        console.error(e);
        return reply(`Error: ${e.message}`);
    }
});

/* ──────────────────────────────────────────────
   ANTI BADWORDS
────────────────────────────────────────────── */
gmd(
{
    pattern: "antibad",
    react: "🛡️",
    aliases: [
        "setantibad",
        "badwords",
        "badwordfilter",
        "antibadwords",
    ],
    category: "group",
    description: "Manage anti-badwords protection",
},
async (from, Gifted, conText) => {

    const {
        q,
        reply,
        react,
        isGroup,
        isAdmin,
        isSuperAdmin,
        isBotAdmin,
        botPrefix,
    } = conText;

    if (!isGroup)
        return reply("*Wrong place. This command works in groups only!* 🍀");

    if (!isAdmin && !isSuperAdmin)
        return reply("*This command is only for group admins!* 🍉");

    if (!isBotAdmin)
        return reply("*Bot must be an admin to use this command!* 🛡️");

    const input = (q || "").toLowerCase().trim();

    const modeMap = {
        on: "delete",
        delete: "delete",
        warn: "warn",
        kick: "kick",
        null: "null",
        off: "off",
        false: "off",
    };

    if (!input) {

        const current =
            await getGroupSetting(from, "ANTIBAD");

        const status =
            !current || current === "off"
                ? "OFF"
                : current.toUpperCase();

        const warnCount =
            (await getGroupSetting(from, "ANTIBAD_WARN_COUNT")) || 3;
        
        const badWords = await getBadWords(from);

        return reply(
`*Anti-Badwords Panel*

Current Mode: *${status}*
Warn Limit: *${warnCount}*
BadWords: *${badWords.length}*

Available Modes
- ${botPrefix}antibad on
- ${botPrefix}antibad delete
- ${botPrefix}antibad warn
- ${botPrefix}antibad kick
- ${botPrefix}antibad null
- ${botPrefix}antibad off

Use:
- ${botPrefix}badwords add <word>
- ${botPrefix}badwords del <word>`
        );
    }

    const mode = modeMap[input];

    if (!mode)
        return reply("Invalid mode! Use: on/delete/warn/kick/null/off");

    try {

        if (mode === "off") {

            await setGroupSetting(from, "ANTIBAD", "off");
            await react("✅");

            return reply("Anti-Badwords disabled. BadWords filter turned OFF.");
        }

        await setGroupSetting(from, "ANTIBAD", mode);
        await react("✅");

        const warnCount =
            (await getGroupSetting(from, "ANTIBAD_WARN_COUNT")) || 3;

        const messages = {
            delete: `Anti-Badwords enabled.\nMode: *DELETE*\nBad words will be deleted automatically.`,
            warn:   `Anti-Badwords enabled.\nMode: *WARN*\nUsers will receive warnings.\nKick after *${warnCount}* warnings.`,
            kick:   `Anti-Badwords enabled.\nMode: *KICK*\nUsers using bad words will be removed instantly.`,
            null:   `Anti-Badwords enabled.\nMode: *SILENT DELETE*\nBad words deleted silently.`,
        };

        return reply(messages[mode]);

    } catch (e) {
        console.error(e);
        return reply(`Error: ${e.message}`);
    }
});

/* ──────────────────────────────────────────────
   ANTI EDIT
────────────────────────────────────────────── */
gmd(
{
    pattern: "setantiedit",
    aliases: [
        "antiedit",
        "editdetect",
        "noedit",
    ],
    react: "🛡️",
    category: "owner",
    description: "Manage anti-edit system",
},
async (from, Gifted, conText) => {

    const {
        q,
        reply,
        react,
        isSuperUser,
        botPrefix,
    } = conText;

    if (!isSuperUser)
        return reply("*This area is reserved for the bot owner only.* 🕷️");

    const input = (q || "").trim().toLowerCase();

    const modeMap = {
        on: "on",
        off: "off",
        false: "off",
        indm: "indm",
        pm: "indm",
        inchat: "inchat",
        chats: "on",
    };

    let value;

    if (modeMap[input] !== undefined) {

        value = modeMap[input];

    } else if (
        input.endsWith("@s.whatsapp.net") ||
        input.endsWith("@g.us")
    ) {

        value = input;

    } else {

        const current = await getSetting("ANTI_EDIT");

        return reply(
`*Anti-Edit Panel*

Current Mode: *${current || "indm"}*

Available Modes
- ${botPrefix}antiedit on
- ${botPrefix}antiedit off
- ${botPrefix}antiedit indm
- ${botPrefix}antiedit pm
- ${botPrefix}antiedit inchat
- ${botPrefix}antiedit chats
- ${botPrefix}antiedit <jid>

Examples:
- 923xx@s.whatsapp.net
- 120363xx@g.us`
        );
    }

    try {

        const current = await getSetting("ANTI_EDIT");

        if (current === value)
            return reply(`Anti-edit already set to *${value.toUpperCase()}*`);

        await setSetting("ANTI_EDIT", value);
        await react("✅");

        const messages = {
            off:    `Anti-Edit disabled. Edit detection turned OFF.`,
            indm:   `Anti-Edit enabled.\nMode: *OWNER DM*\nEdited messages will be forwarded to inbox.`,
            inchat: `Anti-Edit enabled.\nMode: *SAME CHAT*\nEdited messages will appear in same chat.`,
            on:     `Anti-Edit enabled.\nMode: *GLOBAL*\nProtection active in all chats.`,
        };

        return reply(
            messages[value] ||
            `Anti-Edit enabled.\nMode: *CUSTOM CHAT*\nTarget: ${value}`
        );

    } catch (e) {
        console.error(e);
        return reply(`Error: ${e.message}`);
    }
});

/* ──────────────────────────────────────────────
   ANTI DELETE
────────────────────────────────────────────── */
gmd(
{
    pattern: "setantidelete",
    aliases: [
        "antidelete",
        "antidel",
        "deletedetect",
    ],
    react: "🛡️",
    category: "owner",
    description: "Manage anti-delete system",
},
async (from, Gifted, conText) => {

    const {
        q,
        reply,
        react,
        isSuperUser,
        botPrefix,
    } = conText;

    if (!isSuperUser)
        return reply("*This area is reserved for the bot owner only.* 🕷️");

    const input = (q || "").trim().toLowerCase();

    const modeMap = {
        on: "indm",
        off: "off",
        false: "off",
        indm: "indm",
        pm: "indm",
        inchat: "inchat",
        chats: "inchat",
    };

    let value;

    if (modeMap[input] !== undefined) {

        value = modeMap[input];

    } else if (
        input.endsWith("@s.whatsapp.net") ||
        input.endsWith("@g.us")
    ) {

        value = input;

    } else {

        const current = await getSetting("ANTIDELETE");

        return reply(
`*Anti-Delete Panel*

Current Mode: *${current || "indm"}*

Available Modes
- ${botPrefix}antidelete indm
- ${botPrefix}antidelete pm
- ${botPrefix}antidelete inchat
- ${botPrefix}antidelete chats
- ${botPrefix}antidelete off
- ${botPrefix}antidelete <jid>

Examples:
- 923xx@s.whatsapp.net
- 120363xx@g.us`
        );
    }

    try {

        const current = await getSetting("ANTIDELETE");

        if (current === value) {
            const displayVal = value === "off" ? "OFF" : value.toUpperCase();
            return reply(`Anti-delete already set to *${displayVal}*`);
        }

        await setSetting("ANTIDELETE", value);
        await react("✅");

        const messages = {
            off:    `Anti-Delete disabled. Delete recovery turned OFF.`,
            indm:   `Anti-Delete enabled.\nMode: *OWNER DM*\nDeleted messages forwarded to inbox.`,
            inchat: `Anti-Delete enabled.\nMode: *SAME CHAT*\nDeleted messages will reappear in chat.`,
        };

        return reply(
            messages[value] ||
            `Anti-Delete enabled.\nMode: *CUSTOM CHAT*\nTarget: ${value}`
        );

    } catch (e) {
        console.error(e);
        return reply(`Error: ${e.message}`);
    }
});

gmd(
  {
    pattern: "badwords",
    aliases: ["setbadwords", "badword", "profanity"],
    react: "🚫",
    category: "group",
    description:
      "Manage bad words list. Usage: .badwords add/remove/list/clear/default",
  },
  async (from, Gifted, conText) => {
    const { q, reply, react, isSuperUser, isGroup, isAdmin, args } = conText;
    if (!isGroup) return reply("*Wrong place. This command works in groups only!* 🍀");
    if (!isSuperUser && !isAdmin) return reply("*This command is only for group admins!* 🍉");

    const action = (args[0] || "").toLowerCase();
    const words = args.slice(1);

    if (
      !action ||
      ![
        "add",
        "remove",
        "del",
        "delete",
        "list",
        "clear",
        "reset",
        "default",
        "defaults",
      ].includes(action)
    ) {
      const badWords = await getBadWords(from);
      return reply(`📋 *Bad Words Management*

*Usage:*
• *.badwords add <word>* - Add a bad word
• *.badwords add <word1> <word2>* - Add multiple words
• *.badwords remove <word>* - Remove a word
• *.badwords list* - Show all bad words
• *.badwords clear* - Remove all bad words
• *.badwords default* - Load default offensive words (${DEFAULT_BAD_WORDS.length})

*Current list (${badWords.length}):*
${
  badWords.length > 0
    ? badWords
        .slice(0, 15)
        .map((w, i) => `${i + 1}. ${w}`)
        .join("\n") +
      (badWords.length > 15 ? `\n... and ${badWords.length - 15} more` : "")
    : "_No bad words set_"
}`);
    }

    try {
      if (action === "add") {
        if (words.length === 0) {
          return reply(
            "❌ Please provide word(s) to add!\nUsage: .badwords add word1 word2",
          );
        }

        let added = 0;
        for (const word of words) {
          if (word.length >= 2) {
            await addBadWord(from, word);
            added++;
          }
        }

        await react("✅");
        await reply(`✅ Added *${added}* bad word(s) to the filter.`);
      } else if (["remove", "del", "delete"].includes(action)) {
        if (words.length === 0) {
          return reply(
            "❌ Please provide word(s) to remove!\nUsage: .badwords remove word1",
          );
        }

        let removed = 0;
        for (const word of words) {
          const success = await removeBadWord(from, word);
          if (success) removed++;
        }

        await react("✅");
        await reply(`✅ Removed *${removed}* word(s) from the filter.`);
      } else if (action === "list") {
        const badWords = await getBadWords(from);
        if (badWords.length === 0) {
          return reply(
            "📭 No bad words set for this group.\nUse *.badwords add <word>* to add words.",
          );
        }

        const chunks = [];
        for (let i = 0; i < badWords.length; i += 20) {
          chunks.push(badWords.slice(i, i + 20));
        }

        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const startIdx = i * 20;
          let msg =
            i === 0
              ? `🚫 *BAD WORDS LIST* (${badWords.length} total)\n\n`
              : `🚫 *BAD WORDS* (continued)\n\n`;
          msg += chunk
            .map((w, idx) => `${startIdx + idx + 1}. ${w}`)
            .join("\n");
          await Gifted.sendMessage(from, { text: msg });
        }
        await react("✅");
      } else if (["clear", "reset"].includes(action)) {
        await clearBadWords(from);
        await react("✅");
        await reply("✅ All bad words have been cleared for this group.");
      } else if (["default", "defaults"].includes(action)) {
        const added = await initializeDefaultBadWords(from);
        await react("✅");
        const total = await getBadWords(from);
        await reply(
          `✅ Default bad words loaded!\n\n*Added:* ${added} new words\n*Total:* ${total.length} bad words`,
        );
      }
    } catch (error) {
      await reply(`❌ Error: ${error.message}`);
    }
  },
);


gmd(
  {
    pattern: "antilinkwarn",
    aliases: ["setwarncount", "warncount", "antilinkwarncount", "warnlimit"],
    react: "⚙️",
    category: "group",
    description: "Set antilink warning count before kick (default 3)",
  },
  async (from, Gifted, conText) => {
    const { q, reply, react, isSuperUser, isGroup, isAdmin } = conText;
    if (!isGroup) return reply("*Wrong place. This command works in groups only!* 🍀");
    if (!isSuperUser && !isAdmin) return reply("*This command is only for group admins!* 🍉");

    const count = parseInt(q);
    if (!q) {
      const current =
        (await getGroupSetting(from, "ANTILINK_WARN_COUNT")) || "3";
      return reply(
        `⚠️ Current warn count for this group: *${current}*\nUsage: .antilinkwarn 3`,
      );
    }

    if (isNaN(count) || count < 1 || count > 10) {
      return reply("❌ Please provide a number between 1-10");
    }

    try {
      const currentWarnCount = (await getGroupSetting(from, "ANTILINK_WARN_COUNT")) || "3";
      if (currentWarnCount === count.toString()) {
        return reply(`⚠️ Antilink warn count is already set to: *${count}*`);
      }
      await setGroupSetting(from, "ANTILINK_WARN_COUNT", count.toString());
      await react("✅");
      await reply(
        `✅ Antilink warn count set to: *${count}* for this group.\nUsers will be kicked after ${count} warnings.`,
      );
    } catch (error) {
      await reply(`❌ Error: ${error.message}`);
    }
  },
);

gmd(
  {
    pattern: "setantibad",
    aliases: ["antibad", "antibadwords", "badwordfilter"],
    react: "⚙️",
    category: "group",
    description: "Set anti-badwords for this group (on/warn/delete/kick/off)",
  },
  async (from, Gifted, conText) => {
    const { q, reply, react, isSuperUser, isGroup, isAdmin } = conText;
    if (!isGroup) return reply("*Wrong place. This command works in groups only!* 🍀");
    if (!isSuperUser && !isAdmin) return reply("*This command is only for group admins!* 🍉");

    const input = (q || "").toLowerCase().trim();
    const modeMap = {
      on: "delete",
      off: "false",
      true: "delete",
      false: "false",
      delete: "delete",
      kick: "kick",
      warn: "warn",
    };

    const value = modeMap[input];
    if (!value) {
      const warnCount = await getGroupSetting(from, "ANTIBAD_WARN_COUNT");
      const badWords = await getBadWords(from);
      return reply(`❌ Please specify a mode:
• *on/delete* - Delete bad word messages
• *warn* - Warn user, kick after ${warnCount} warnings
• *kick* - Delete & immediately kick user
• *off* - Disable anti-badwords

Current bad words (${badWords.length}): ${badWords.length > 0 ? badWords.slice(0, 10).join(", ") + (badWords.length > 10 ? "..." : "") : "None set"}`);
    }

    try {
      const current = await getGroupSetting(from, "ANTIBAD");
      if (current === value) {
        const displayVal = value === "false" ? "OFF" : value.toUpperCase();
        return reply(`⚠️ Anti-badwords is already: *${displayVal}*`);
      }
      await setGroupSetting(from, "ANTIBAD", value);
      await react("✅");
      const displayVal = value === "false" ? "OFF" : value.toUpperCase();
      let msg = `✅ Anti-BadWords: *${displayVal}*`;
      if (value === "warn") {
        const warnCount = await getGroupSetting(from, "ANTIBAD_WARN_COUNT");
        msg += `\nKick after *${warnCount}* warnings`;
      }
      if (value !== "false") {
        msg += `\n\nUse *.badwords add <word>* to add prohibited words`;
      }
      await reply(msg);
    } catch (error) {
      await reply(`❌ Error: ${error.message}`);
    }
  },
);

gmd(
  {
    pattern: "antibadwarn",
    aliases: ["badwarncount", "antibadwarncount", "setbadwarn"],
    react: "⚙️",
    category: "group",
    description: "Set anti-badwords warning count before kick (default 3)",
  },
  async (from, Gifted, conText) => {
    const { q, reply, react, isSuperUser, isGroup, isAdmin } = conText;
    if (!isGroup) return reply("*Wrong place. This command works in groups only!* 🍀");
    if (!isSuperUser && !isAdmin) return reply("*This command is only for group admins!* 🍉");

    const count = parseInt(q);
    if (!q) {
      const current =
        (await getGroupSetting(from, "ANTIBAD_WARN_COUNT")) || "3";
      return reply(
        `⚠️ Current bad word warn count: *${current}*\nUsage: .antibadwarn 3`,
      );
    }

    if (isNaN(count) || count < 1 || count > 10) {
      return reply("❌ Please provide a number between 1-10");
    }

    try {
      const currentBadCount = (await getGroupSetting(from, "ANTIBAD_WARN_COUNT")) || "3";
      if (currentBadCount === count.toString()) {
        return reply(`⚠️ Anti-badwords warn count is already set to: *${count}*`);
      }
      await setGroupSetting(from, "ANTIBAD_WARN_COUNT", count.toString());
      await react("✅");
      await reply(
        `✅ Anti-badwords warn count set to: *${count}*\nUsers will be kicked after ${count} warnings.`,
      );
    } catch (error) {
      await reply(`❌ Error: ${error.message}`);
    }
  },
);
