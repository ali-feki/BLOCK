const { gmd, getGroupMetadata, getLidMapping } = require("../black_hat");
const { getGroupSetting, setGroupSetting } = require("../black_hat/database/groupSettings");
const { isSuperUser } = require("../black_hat/database/sudo");

gmd(
  {
    pattern: "unmute",
    react: "⏳",
    aliases: ["open", "groupopen", "gcopen", "adminonly", "adminsonly"],
    category: "group",
    description: "Open Group Chat.",
  },
  async (from, Gifted, conText) => {
    const { reply, isAdmin, isSuperAdmin, isGroup, isBotAdmin, mek, sender } = conText;

    if (!isGroup) return reply("Groups only command!");
    if (!isBotAdmin) return reply("Bot is not an admin!");
    if (!isAdmin && !isSuperAdmin) return reply("Admin only command!");

    try {
      await Gifted.groupSettingUpdate(from, "not_announcement");
      const num = sender.split("@")[0];
      await Gifted.sendMessage(from, {
        text: `Group successfully unmuted!`,
        mentions: [sender],
      }, { quoted: mek });
    } catch (e) {
      return reply(`Failed to unmute group: ${e.message}`);
    }
  },
);

gmd(
  {
    pattern: "mute",
    react: "⏳",
    aliases: ["close", "groupmute", "gcmute", "gcclose"],
    category: "group",
    description: "Close Group Chat",
  },
  async (from, Gifted, conText) => {
    const { reply, isAdmin, isSuperAdmin, isGroup, isBotAdmin, mek, sender } = conText;

    if (!isGroup) return reply("Groups only command!");
    if (!isBotAdmin) return reply("Bot is not an admin!");
    if (!isAdmin && !isSuperAdmin) return reply("Admin only command!");

    try {
      await Gifted.groupSettingUpdate(from, "announcement");
      const num = sender.split("@")[0];
      await Gifted.sendMessage(from, {
        text: `Group successfully muted!`,
        mentions: [sender],
      }, { quoted: mek });
    } catch (e) {
      return reply(`Failed to mute group: ${e.message}`);
    }
  },
);

gmd(
  {
    pattern: "met",
    react: "⚡",
    category: "general",
    description: "Check group metadata",
  },
  async (from, Gifted, conText) => {
    const { mek, react } = conText;
    try {
      const gInfo = await getGroupMetadata(Gifted, from);

      const formatJid = (jid) => {
        if (!jid) return "N/A";
        return `@${jid.split("@")[0]}`;
      };

      const superAdmins = [];
      const admins = [];
      const members = [];

      gInfo.participants.forEach((p) => {
        const formattedJid = formatJid(p.phoneNumber || p.pn || p.jid);
        if (p.admin === "superadmin") {
          superAdmins.push(`- ${formattedJid} - Owner`);
        } else if (p.admin === "admin") {
          admins.push(`- ${formattedJid} - Admin`);
        } else {
          members.push(`- ${formattedJid} - Member`);
        }
      });

      const allParticipants = [...superAdmins, ...admins, ...members].join("\n");
      const allAdmins = [
        ...superAdmins.map(s => s.replace(" - Owner", "")),
        ...admins.map(a => a.replace(" - Admin", "")),
      ];

      const metadataText =
        `*Group Metadata*\n\n` +
        `*ID:* ${gInfo.id}\n` +
        `*Subject:* ${gInfo.subject || "None"}\n` +
        `*Subject Owner:* ${formatJid(gInfo.subjectOwnerPn || gInfo.subjectOwnerJid)}\n` +
        `*Subject Changed:* ${new Date(gInfo.subjectTime * 1000).toLocaleString()}\n` +
        `*Owner:* ${formatJid(gInfo.ownerPn || gInfo.ownerJid)}\n` +
        `*Created:* ${new Date(gInfo.creation * 1000).toLocaleString()}\n` +
        `*Size:* ${gInfo.size} participants\n` +
        `*Description:* ${gInfo.desc || "None"}\n\n` +
        `*Admins (${superAdmins.length + admins.length})*\n` +
        `${allAdmins.join("\n") || "No admins"}\n\n` +
        `*Participants (${gInfo.participants.length})*\n` +
        `${allParticipants}\n\n` +
        `*Group Settings*\n` +
        `Restrict: ${gInfo.restrict ? "Yes" : "No"}\n` +
        `Announce: ${gInfo.announce ? "Yes" : "No"}\n` +
        `Join Approval: ${gInfo.joinApprovalMode ? "Yes" : "No"}\n` +
        `Member Add: ${gInfo.memberAddMode ? "Yes" : "No"}\n` +
        `Community: ${gInfo.isCommunity ? "Yes" : "No"}`;

      await Gifted.sendMessage(from, { text: metadataText }, { quoted: mek });
      await react("✅");
    } catch (e) {
      await react("❌");
      await Gifted.sendMessage(from, { text: "Failed to fetch group metadata." }, { quoted: mek });
    }
  },
);

gmd(
  {
    pattern: "demote",
    react: "👑",
    category: "group",
    description: "Demote a user from being an admin.",
  },
  async (from, Gifted, conText) => {
    const {
      reply, react, sender, quotedUser, superUser,
      isSuperAdmin, isAdmin, isGroup, isBotAdmin,
      q, mek, mentionedJid, groupAdmins, groupMetadata,
    } = conText;

    if (!isGroup) return reply("This command only works in groups!");
    if (!isBotAdmin) return reply("Bot is not an admin in this group!");
    if (!isAdmin && !isSuperAdmin) return reply("You must be an admin to use this command!");

    const convertLidToJid = async (lid) => {
      if (!lid || !lid.includes("@lid")) return lid;
      const cached = getLidMapping(lid);
      if (cached) return cached;
      try {
        const result = await Gifted.getJidFromLid(lid);
        if (result) return result;
      } catch (e) {}
      return lid;
    };

    let targetJid = null;

    if (mentionedJid && mentionedJid.length > 0) {
      targetJid = await convertLidToJid(mentionedJid[0]);
    } else if (quotedUser) {
      targetJid = await convertLidToJid(quotedUser);
    } else if (q) {
      const num = q.replace(/[^0-9]/g, "");
      if (num.length >= 10) targetJid = num + "@s.whatsapp.net";
    }

    if (!targetJid || targetJid.includes("@lid")) {
      if (targetJid && targetJid.includes("@lid") && groupMetadata?.participants) {
        const lidNum = targetJid.split("@")[0];
        const found = groupMetadata.participants.find(
          p => p.lid?.split("@")[0] === lidNum || p.id?.split("@")[0] === lidNum
        );
        if (found?.id) targetJid = found.id;
        else if (found?.pn) targetJid = found.pn + "@s.whatsapp.net";
      }
    }

    if (!targetJid || targetJid.includes("@lid")) {
      await react("❌");
      return reply("Could not identify user. Provide their number.\nExample: .demote <number>");
    }

    if (!targetJid.includes("@")) targetJid += "@s.whatsapp.net";

    const targetNum = targetJid.split("@")[0];
    const isTargetSuperUser = await isSuperUser(targetJid, Gifted);
    const standardizedSuperUsers = superUser.map(u => u.split("@")[0]);

    if (isTargetSuperUser || standardizedSuperUsers.includes(targetNum)) {
      await react("❌");
      return reply("Cannot demote a superuser!");
    }

    const groupSuperAdmins = conText.groupSuperAdmins || [];
    const adminNums = groupAdmins.map(a => a.split("@")[0]);
    const superAdminNums = groupSuperAdmins.map(a => a.split("@")[0]);
    const allAdminNums = [...adminNums, ...superAdminNums];

    let isTargetAdmin = allAdminNums.includes(targetNum);
    let isSuperAdminTarget = superAdminNums.includes(targetNum);

    if (groupMetadata?.participants) {
      const participant = groupMetadata.participants.find(p => {
        const pNum = (p.id || p.pn || p.phoneNumber || "").split("@")[0];
        return pNum === targetNum || (p.pn || "").split("@")[0] === targetNum;
      });
      if (participant?.admin) {
        isTargetAdmin = true;
        if (participant.admin === "superadmin") isSuperAdminTarget = true;
      }
    }

    if (!isTargetAdmin) {
      return await Gifted.sendMessage(from, {
        text: `@${targetNum} is not an admin.`,
        mentions: [targetJid],
      }, { quoted: mek });
    }

    if (isSuperAdminTarget) {
      return await Gifted.sendMessage(from, {
        text: `@${targetNum} is the group owner and cannot be demoted.`,
        mentions: [targetJid],
      }, { quoted: mek });
    }

    try {
      await Gifted.groupParticipantsUpdate(from, [targetJid], "demote");
      await react("✅");
      await Gifted.sendMessage(from, {
        text: `@${targetNum} is no longer an admin.`,
        mentions: [targetJid],
      }, { quoted: mek });
    } catch (e) {
      await react("❌");
      if (e.message?.includes("403") || e.message?.toLowerCase().includes("forbidden")) {
        await Gifted.sendMessage(from, {
          text: `Cannot demote @${targetNum}. They may be a group owner.`,
          mentions: [targetJid],
        }, { quoted: mek });
      } else {
        return reply(`Failed to demote: ${e.message}`);
      }
    }
  },
);

gmd(
  {
    pattern: "promote",
    aliases: ["toadmin"],
    react: "👑",
    category: "group",
    description: "Promote a user to admin.",
  },
  async (from, Gifted, conText) => {
    const {
      reply, react, sender, quotedUser,
      isSuperAdmin, isAdmin, isGroup, isBotAdmin,
      q, mentionedJid, groupAdmins, mek,
      groupSuperAdmins, groupMetadata,
    } = conText;

    if (!isGroup) return reply("This command only works in groups!");
    if (!isBotAdmin) return reply("Bot is not an admin in this group!");
    if (!isAdmin && !isSuperAdmin) return reply("You must be an admin to use this command!");

    const convertLidToJid = async (lid) => {
      if (!lid || !lid.includes("@lid")) return lid;
      const cached = getLidMapping(lid);
      if (cached) return cached;
      try {
        const result = await Gifted.getJidFromLid(lid);
        if (result) return result;
      } catch (e) {}
      return lid;
    };

    let targetJid = null;

    if (mentionedJid && mentionedJid.length > 0) {
      targetJid = await convertLidToJid(mentionedJid[0]);
    } else if (quotedUser) {
      targetJid = await convertLidToJid(quotedUser);
    } else if (q) {
      const num = q.replace(/[^0-9]/g, "");
      if (num.length >= 10) targetJid = num + "@s.whatsapp.net";
    }

    if (!targetJid || targetJid.includes("@lid")) {
      if (targetJid && targetJid.includes("@lid") && groupMetadata?.participants) {
        const lidNum = targetJid.split("@")[0];
        const found = groupMetadata.participants.find(
          p => p.lid?.split("@")[0] === lidNum || p.id?.split("@")[0] === lidNum
        );
        if (found?.id) targetJid = found.id;
        else if (found?.pn) targetJid = found.pn + "@s.whatsapp.net";
      }
    }

    if (!targetJid || targetJid.includes("@lid")) {
      await react("❌");
      return reply("Could not identify user. Provide their number.\nExample: .promote <number>");
    }

    if (!targetJid.includes("@")) targetJid += "@s.whatsapp.net";

    const targetNum = targetJid.split("@")[0];
    const adminNums = groupAdmins ? groupAdmins.map(a => a.split("@")[0]) : [];
    const superAdminNums = groupSuperAdmins ? groupSuperAdmins.map(a => a.split("@")[0]) : [];
    const allAdminNums = [...adminNums, ...superAdminNums];

    let isAlreadyAdmin = allAdminNums.includes(targetNum);
    let isSuperAdminTarget = superAdminNums.includes(targetNum);

    if (groupMetadata?.participants) {
      const participant = groupMetadata.participants.find(p => {
        const pNum = (p.id || p.pn || p.phoneNumber || "").split("@")[0];
        return pNum === targetNum || (p.pn || "").split("@")[0] === targetNum;
      });
      if (participant?.admin) {
        isAlreadyAdmin = true;
        if (participant.admin === "superadmin") isSuperAdminTarget = true;
      }
    }

    if (isSuperAdminTarget) {
      return await Gifted.sendMessage(from, {
        text: `@${targetNum} is the group owner and is already an admin.`,
        mentions: [targetJid],
      }, { quoted: mek });
    }

    if (isAlreadyAdmin) {
      return await Gifted.sendMessage(from, {
        text: `@${targetNum} is already an admin.`,
        mentions: [targetJid],
      }, { quoted: mek });
    }

    try {
      await Gifted.groupParticipantsUpdate(from, [targetJid], "promote");
      await react("✅");
      await Gifted.sendMessage(from, {
        text: `@${targetNum} is now an admin.`,
        mentions: [targetJid],
      }, { quoted: mek });
    } catch (e) {
      await react("❌");
      if (e.message?.includes("403") || e.message?.toLowerCase().includes("forbidden")) {
        await Gifted.sendMessage(from, {
          text: `Cannot promote @${targetNum}. They may not be a group member.`,
          mentions: [targetJid],
        }, { quoted: mek });
      } else {
        return reply(`Failed to promote: ${e.message}`);
      }
    }
  },
);

gmd(
  {
    pattern: "kick",
    aliases: ["remove"],
    react: "🚫",
    category: "group",
    description: "Remove a user from the group.",
  },
  async (from, Gifted, conText) => {
    const {
      reply, react, sender, quotedUser, superUser,
      isSuperAdmin, isAdmin, isGroup, isBotAdmin,
      q, mek, mentionedJid, groupMetadata,
    } = conText;

    if (!isGroup) return reply("This command only works in groups!");
    if (!isBotAdmin) return reply("Bot is not an admin in this group!");
    if (!isAdmin && !isSuperAdmin) return reply("You must be an admin to use this command!");

    const convertLidToJid = async (lid) => {
      if (!lid || !lid.includes("@lid")) return lid;
      const cached = getLidMapping(lid);
      if (cached) return cached;
      try {
        const result = await Gifted.getJidFromLid(lid);
        if (result) return result;
      } catch (e) {}
      return lid;
    };

    let targetJid = null;

    if (mentionedJid && mentionedJid.length > 0) {
      targetJid = await convertLidToJid(mentionedJid[0]);
    } else if (quotedUser) {
      targetJid = await convertLidToJid(quotedUser);
    } else if (q) {
      const num = q.replace(/[^0-9]/g, "");
      if (num.length >= 10) targetJid = num + "@s.whatsapp.net";
    }

    if (!targetJid || targetJid.includes("@lid")) {
      if (targetJid && targetJid.includes("@lid") && groupMetadata?.participants) {
        const lidNum = targetJid.split("@")[0];
        const found = groupMetadata.participants.find(
          p => p.lid?.split("@")[0] === lidNum || p.id?.split("@")[0] === lidNum
        );
        if (found?.id) targetJid = found.id;
        else if (found?.pn) targetJid = found.pn + "@s.whatsapp.net";
      }
    }

    if (!targetJid || targetJid.includes("@lid")) {
      await react("❌");
      return reply("Could not identify user. Provide their number.\nExample: .kick 923xxxxxxxxx");
    }

    if (!targetJid.includes("@")) targetJid += "@s.whatsapp.net";

    const targetNum = targetJid.split("@")[0];
    const standardizedSuperUsers = superUser.map(u => u.split("@")[0]);

    if (standardizedSuperUsers.includes(targetNum)) {
      await react("❌");
      return reply("Cannot kick my creator!");
    }

    const botJid = Gifted.user?.id?.split(":")[0] + "@s.whatsapp.net";
    if (targetJid.toLowerCase() === botJid.toLowerCase()) {
      await react("❌");
      return reply("Cannot kick myself!");
    }

    const groupSuperAdmins = conText.groupSuperAdmins || [];
    const superAdminNums = groupSuperAdmins.map(a => a.split("@")[0]);
    let isSuperAdminTarget = superAdminNums.includes(targetNum);

    if (groupMetadata?.participants) {
      const participant = groupMetadata.participants.find(p => {
        const pNum = (p.id || p.pn || p.phoneNumber || "").split("@")[0];
        return pNum === targetNum || (p.pn || "").split("@")[0] === targetNum;
      });
      if (participant?.admin === "superadmin") isSuperAdminTarget = true;
    }

    if (isSuperAdminTarget) {
      await react("❌");
      return await Gifted.sendMessage(from, {
        text: `@${targetNum} is the group owner and cannot be kicked.`,
        mentions: [targetJid],
      }, { quoted: mek });
    }

    try {
      await Gifted.groupParticipantsUpdate(from, [targetJid], "remove");
      await react("✅");
      await Gifted.sendMessage(from, {
        text: `@${targetNum} has been removed from the group.`,
        mentions: [targetJid],
      }, { quoted: mek });
    } catch (e) {
      await react("❌");
      if (e.message?.includes("403") || e.message?.toLowerCase().includes("forbidden")) {
        await Gifted.sendMessage(from, {
          text: `Cannot kick @${targetNum}. They may be an admin or not in the group.`,
          mentions: [targetJid],
        }, { quoted: mek });
      } else {
        return reply(`Failed to remove user: ${e.message}`);
      }
    }
  },
);

gmd(
  {
    pattern: "add",
    react: "➕",
    category: "group",
    description: "Add a user to the group.",
  },
  async (from, Gifted, conText) => {
    const {
      reply, react, isSuperAdmin, isAdmin,
      isGroup, isBotAdmin, q, mek, groupMetadata,
    } = conText;

    if (!isGroup) return reply("This command only works in groups!");
    if (!isBotAdmin) return reply("Bot is not an admin in this group!");
    if (!isAdmin && !isSuperAdmin) return reply("You must be an admin to use this command!");

    if (!q) {
      await react("❌");
      return reply("Please provide the number to add.\nExample: .add 923xxxxxxxxx");
    }

    const num = q.replace(/[^0-9]/g, "");
    if (num.length < 10) {
      await react("❌");
      return reply("Invalid number format.");
    }

    const targetJid = num + "@s.whatsapp.net";

    try {
      const [result] = await Gifted.onWhatsApp(num);
      if (!result || !result.exists) {
        await react("❌");
        return reply(`${num} is not registered on WhatsApp.`);
      }
    } catch (err) {
      await react("⚠️");
      return reply(`Could not verify if ${num} is on WhatsApp. Try again.`);
    }

    if (groupMetadata?.participants) {
      const alreadyIn = groupMetadata.participants.find(p => {
        const pNum = (p.id || p.pn || p.phoneNumber || "").split("@")[0];
        return pNum === num;
      });
      if (alreadyIn) {
        await react("❌");
        return await Gifted.sendMessage(from, {
          text: `@${num} is already in this group.`,
          mentions: [targetJid],
        }, { quoted: mek });
      }
    }

    try {
      const result = await Gifted.groupParticipantsUpdate(from, [targetJid], "add");
      const status = result[0]?.status;

      if (status === "403") {
        const meta = await Gifted.groupMetadata(from);
        const inviteCode = await Gifted.groupInviteCode(from);
        const inviteLink = `https://chat.whatsapp.com/${inviteCode}`;

        await Gifted.sendMessage(targetJid, {
          text: `You have been invited to join *${meta.subject}*\n\nInvite Link: ${inviteLink}`,
        });

        await react("⚠️");
        await Gifted.sendMessage(from, {
          text: `@${num} has privacy settings preventing direct add. Invite link sent to their DM.`,
          mentions: [targetJid],
        }, { quoted: mek });
      } else if (status === "408") {
        await react("❌");
        await Gifted.sendMessage(from, {
          text: `@${num} left this group recently and cannot be added yet.`,
          mentions: [targetJid],
        }, { quoted: mek });
      } else if (status === "409") {
        await react("❌");
        await Gifted.sendMessage(from, {
          text: `@${num} is already in this group.`,
          mentions: [targetJid],
        }, { quoted: mek });
      } else {
        await react("✅");
        await Gifted.sendMessage(from, {
          text: `@${num} has been added to the group.`,
          mentions: [targetJid],
        }, { quoted: mek });
      }
    } catch (e) {
      await react("❌");
      return reply(`Failed to add user: ${e.message}`);
    }
  },
);

gmd(
  {
    pattern: "link",
    aliases: ["gclink", "grouplink", "invitelink", "invite"],
    react: "🔗",
    category: "group",
    description: "Get the group invite link.",
  },
  async (from, Gifted, conText) => {
    const { reply, react, isAdmin, isSuperAdmin, isGroup, isBotAdmin, mek } = conText;

    if (!isGroup) return reply("This command only works in groups!");
    if (!isBotAdmin) return reply("Bot is not an admin in this group!");
    if (!isAdmin && !isSuperAdmin) return reply("You must be an admin to use this command!");

    try {
      const meta = await Gifted.groupMetadata(from);
      const inviteCode = await Gifted.groupInviteCode(from);
      const inviteLink = `https://chat.whatsapp.com/${inviteCode}`;
      const adminCount = meta.participants.filter(p => p.admin === "admin" || p.admin === "superadmin").length;

      const text =
        `*Here is Group Invite Link:*\n${inviteLink}`;

      await Gifted.sendMessage(from, { text }, { quoted: mek });
      await react("✅");
    } catch (e) {
      await react("❌");
      return reply(`Failed to get invite link: ${e.message}`);
    }
  },
);

gmd(
  {
    pattern: "newgroup",
    aliases: ["newgc", "creategroup"],
    react: "🆕",
    category: "group",
    description: "Create a new group.",
  },
  async (from, Gifted, conText) => {
    const { reply, react, sender, isSuperUser, q, mek } = conText;

    if (!isSuperUser) return reply("Owner Only Command!");

    if (!q || !q.trim()) {
      await react("❌");
      return reply("Please provide a group name.\nExample: .newgroup My Group");
    }

    try {
      const group = await Gifted.groupCreate(q.trim(), [sender]);
      const inviteCode = await Gifted.groupInviteCode(group.id);
      const inviteLink = `https://chat.whatsapp.com/${inviteCode}`;

      await Gifted.sendMessage(from, {
        text:
          `*Group Created!*\n\n` +
          `*Name:* ${q.trim()}\n` +
          `*ID:* ${group.id}\n\n` +
          `*Invite Link:* ${inviteLink}`,
      }, { quoted: mek });

      await react("✅");
    } catch (e) {
      await react("❌");
      return reply(`Failed to create group: ${e.message}`);
    }
  },
);

gmd(
  {
    pattern: "kickall",
    aliases: ["terminategc", "destroygc", "end"],
    react: "💀",
    category: "group",
    description: "Terminate group - removes all members and bot leaves.",
  },
  async (from, Gifted, conText) => {
    const { reply, react, sender, isSuperUser, isGroup, isBotAdmin, isAdmin, isSuperAdmin, mek } = conText;

    if (!isGroup) return reply("This command only works in groups!");
    if (!isSuperUser) return reply("Owner Only Command!");
    if (!isBotAdmin) return reply("Bot is not an admin in this group!");
    if (!isAdmin && !isSuperAdmin) return reply("You must be an admin to use this command!");

    try {
      await Gifted.sendMessage(from, {
        text: `*WARNING*\n\nGroup will be terminated now...\nAll members will be removed.`,
      }, { quoted: mek });

      await new Promise(r => setTimeout(r, 1000));

      const meta = await Gifted.groupMetadata(from);
      const botJid = Gifted.user?.id?.split(":")[0] + "@s.whatsapp.net";

      const membersToRemove = meta.participants
        .filter(p => p.id !== botJid && p.id !== sender)
        .map(p => p.id);

      if (membersToRemove.length > 0) {
        await Gifted.groupParticipantsUpdate(from, membersToRemove, "remove");
      }

      await Gifted.groupLeave(from);
    } catch (e) {
      await react("❌");
      return reply(`Failed to terminate group: ${e.message}`);
    }
  },
);

gmd(
  {
    pattern: "accept",
    aliases: ["approve"],
    react: "✅",
    category: "group",
    description: "Accept a pending join request.",
  },
  async (from, Gifted, conText) => {
    const { reply, react, isGroup, isBotAdmin, isAdmin, isSuperAdmin, args, botPrefix } = conText;

    if (!isGroup) return reply("This command only works in groups!");
    if (!isBotAdmin) return reply("Bot is not an admin in this group!");
    if (!isAdmin && !isSuperAdmin) return reply("You must be an admin to use this command!");
    if (!args[0]) return reply(`Please provide a phone number.\nUsage: ${botPrefix}accept 923xxxxxxxxx`);

    try {
      const number = args[0].replace(/[^0-9]/g, "");
      const userJid = `${number}@s.whatsapp.net`;

      await Gifted.groupRequestParticipantsUpdate(from, [userJid], "approve");
      await react("✅");
      await Gifted.sendMessage(from, {
        text: `@${number}'s join request approved!`,
        mentions: [userJid],
      });
    } catch (e) {
      await react("❌");
      if (e.message?.includes("not-found") || e.message?.includes("item-not-found")) {
        return reply("No pending join request found for this number.");
      }
      return reply(`Failed to accept request: ${e.message}`);
    }
  },
);

gmd(
  {
    pattern: "reject",
    aliases: ["decline"],
    react: "❌",
    category: "group",
    description: "Reject a pending join request.",
  },
  async (from, Gifted, conText) => {
    const { reply, react, isGroup, isBotAdmin, isAdmin, isSuperAdmin, args, botPrefix } = conText;

    if (!isGroup) return reply("This command only works in groups!");
    if (!isBotAdmin) return reply("Bot is not an admin in this group!");
    if (!isAdmin && !isSuperAdmin) return reply("You must be an admin to use this command!");
    if (!args[0]) return reply(`Please provide a phone number.\nUsage: ${botPrefix}reject 923xxxxxxxxx`);

    try {
      const number = args[0].replace(/[^0-9]/g, "");
      const userJid = `${number}@s.whatsapp.net`;

      await Gifted.groupRequestParticipantsUpdate(from, [userJid], "reject");
      await react("✅");
      await Gifted.sendMessage(from, {
        text: `@${number}'s join request rejected!`,
        mentions: [userJid],
      });
    } catch (e) {
      await react("❌");
      if (e.message?.includes("not-found") || e.message?.includes("item-not-found")) {
        return reply("No pending join request found for this number.");
      }
      return reply(`Failed to reject request: ${e.message}`);
    }
  },
);

gmd(
  {
    pattern: "acceptall",
    aliases: ["approveall"],
    react: "✅",
    category: "group",
    description: "Accept all pending join requests.",
  },
  async (from, Gifted, conText) => {
    const { reply, react, isGroup, isBotAdmin, isAdmin, isSuperAdmin } = conText;

    if (!isGroup) return reply("This command only works in groups!");
    if (!isBotAdmin) return reply("Bot is not an admin in this group!");
    if (!isAdmin && !isSuperAdmin) return reply("You must be an admin to use this command!");

    try {
      const pendingRequests = await Gifted.groupRequestParticipantsList(from);
      if (!pendingRequests || pendingRequests.length === 0) {
        return reply("No pending join requests in this group.");
      }

      const jids = pendingRequests.map(r => r.jid);
      await Gifted.groupRequestParticipantsUpdate(from, jids, "approve");
      await react("✅");
      return reply(`Successfully approved *${jids.length}* pending join request(s)!`);
    } catch (e) {
      await react("❌");
      return reply(`Failed to accept all requests: ${e.message}`);
    }
  },
);

gmd(
  {
    pattern: "rejectall",
    aliases: ["declineall"],
    react: "❌",
    category: "group",
    description: "Reject all pending join requests.",
  },
  async (from, Gifted, conText) => {
    const { reply, react, isGroup, isBotAdmin, isAdmin, isSuperAdmin } = conText;

    if (!isGroup) return reply("This command only works in groups!");
    if (!isBotAdmin) return reply("Bot is not an admin in this group!");
    if (!isAdmin && !isSuperAdmin) return reply("You must be an admin to use this command!");

    try {
      const pendingRequests = await Gifted.groupRequestParticipantsList(from);
      if (!pendingRequests || pendingRequests.length === 0) {
        return reply("No pending join requests in this group.");
      }

      const jids = pendingRequests.map(r => r.jid);
      await Gifted.groupRequestParticipantsUpdate(from, jids, "reject");
      await react("✅");
      return reply(`Successfully rejected *${jids.length}* pending join request(s)!`);
    } catch (e) {
      await react("❌");
      return reply(`Failed to reject all requests: ${e.message}`);
    }
  },
);

gmd(
  {
    pattern: "online",
    aliases: ["listonline", "whosonline"],
    react: "🟢",
    category: "group",
    description: "List members who are currently online in the group.",
  },
  async (from, Gifted, conText) => {
    const { reply, react, isGroup, mek } = conText;

    if (!isGroup) return reply("This command only works in groups!");

    try {
      await reply("Checking online members... Please wait...");

      const groupMeta = await Gifted.groupMetadata(from);
      const participants = groupMeta.participants;
      const onlineMembers = [];
      const presenceData = new Map();

      const presenceHandler = (update) => {
        if (update.presences) {
          for (const [jid, presence] of Object.entries(update.presences)) {
            presenceData.set(jid, presence);
            presenceData.set(jid.split("@")[0], presence);
          }
        }
      };

      Gifted.ev.on("presence.update", presenceHandler);

      try {
        const batchSize = 5;
        for (let i = 0; i < participants.length; i += batchSize) {
          const batch = participants.slice(i, i + batchSize);
          await Promise.all(batch.map(async p => {
            try { await Gifted.presenceSubscribe(p.id || p.jid); } catch (e) {}
          }));
          await new Promise(r => setTimeout(r, 500));
        }

        await new Promise(r => setTimeout(r, 2000));

        for (const p of participants) {
          const participantId = p.id || p.jid;
          const numOnly = participantId.split("@")[0];
          let presence = presenceData.get(participantId) || presenceData.get(numOnly);

          if (!presence && p.pn) {
            presence = presenceData.get(p.pn) || presenceData.get(p.pn.split("@")[0]);
          }

          if (["composing", "recording", "available"].includes(presence?.lastKnownPresence)) {
            let displayJid = participantId;
            if (participantId.endsWith("@lid")) {
              const cachedJid = getLidMapping(participantId);
              if (cachedJid) displayJid = cachedJid;
              else if (p.pn) displayJid = p.pn;
            }
            const number = displayJid.split("@")[0];
            onlineMembers.push({ jid: displayJid, name: p.notify || p.name || number, number });
          }
        }
      } finally {
        Gifted.ev.off("presence.update", presenceHandler);
      }

      if (onlineMembers.length === 0) {
        await react("😴");
        return reply("No members are currently typing or recording.");
      }

      const mentions = onlineMembers.map(m => m.jid);
      const memberList = onlineMembers.map((m, i) => `${i + 1}. @${m.number}`).join("\n");

      await react("✅");
      await Gifted.sendMessage(from, {
        text:
          `*Active Members*\n\n` +
          `${onlineMembers.length} of ${participants.length} members active\n\n` +
          `${memberList}`,
        mentions,
      }, { quoted: mek });
    } catch (e) {
      await react("❌");
      return reply(`Failed to check online members: ${e.message}`);
    }
  },
);

gmd(
  {
    pattern: "resetlink",
    aliases: ["resetgclink", "revoke", "resetgrouplink", "revokelink", "newlink"],
    react: "🔄",
    category: "group",
    description: "Reset the group invite link.",
  },
  async (from, Gifted, conText) => {
    const { reply, react, isGroup, isBotAdmin, isAdmin, isSuperAdmin, mek } = conText;

    if (!isGroup) return reply("This command only works in groups!");
    if (!isBotAdmin) return reply("Bot is not an admin in this group!");
    if (!isAdmin && !isSuperAdmin) return reply("You must be an admin to use this command!");

    try {
      await Gifted.groupRevokeInvite(from);
      const newInviteCode = await Gifted.groupInviteCode(from);
      const newLink = `https://chat.whatsapp.com/${newInviteCode}`;
      const groupMeta = await Gifted.groupMetadata(from);
      const adminCount = groupMeta.participants.filter(p => p.admin === "admin" || p.admin === "superadmin").length;

      await react("✅");
      await Gifted.sendMessage(from, {
        text:
          `*Group Link Reset*\n\n` +
          `*Group:* ${groupMeta.subject}\n` +
          `*Total Members:* ${groupMeta.participants.length}\n` +
          `*Total Admins:* ${adminCount}\n\n` +
          `*New Link:*\n${newLink}\n\n` +
          `Old invite link has been revoked.`,
      }, { quoted: mek });
    } catch (e) {
      await react("❌");
      return reply(`Failed to reset group link: ${e.message}`);
    }
  },
);

gmd(
  {
    pattern: "left",
    aliases: ["leave", "exitgroup", "exitgc"],
    react: "👋",
    category: "group",
    description: "Bot leaves the group. Owner only.",
  },
  async (from, Gifted, conText) => {
    const { reply, react, isGroup, isSuperUser, mek, botName } = conText;

    if (!isGroup) return reply("This command only works in groups!");
    if (!isSuperUser) return reply("Owner Only Command!");

    try {
      await Gifted.sendMessage(from, {
        text: `Goodbye! ${botName} is leaving this group...`,
      }, { quoted: mek });

      await new Promise(r => setTimeout(r, 1000));
      await Gifted.groupLeave(from);
    } catch (e) {
      await react("❌");
      return reply(`Failed to leave group: ${e.message}`);
    }
  },
);

gmd(
  {
    pattern: "listrequests",
    aliases: ["joinrequests", "requests", "pendingrequests"],
    react: "📋",
    category: "group",
    description: "List all pending join requests.",
  },
  async (from, Gifted, conText) => {
    const { reply, react, isGroup, isBotAdmin, isAdmin, isSuperAdmin, mek } = conText;

    if (!isGroup) return reply("This command only works in groups!");
    if (!isBotAdmin) return reply("Bot is not an admin in this group!");
    if (!isAdmin && !isSuperAdmin) return reply("You must be an admin to use this command!");

    try {
      const pendingRequests = await Gifted.groupRequestParticipantsList(from);
      if (!pendingRequests || pendingRequests.length === 0) {
        await react("📭");
        return reply("No pending join requests in this group.");
      }

      const resolvedJids = await Promise.all(
        pendingRequests.map(async r => {
          let jid = r.jid;
          if (jid.endsWith("@lid")) {
            const cachedJid = getLidMapping(jid);
            if (cachedJid) {
              jid = cachedJid;
            } else if (Gifted.getJidFromLid) {
              try {
                const resolved = await Gifted.getJidFromLid(jid);
                if (resolved) jid = resolved;
              } catch {}
            }
          }
          return jid;
        })
      );

      const requestList = resolvedJids.map((jid, i) => `${i + 1}. @${jid.split("@")[0]}`).join("\n");

      await react("✅");
      await Gifted.sendMessage(from, {
        text:
          `*Pending Join Requests*\n\n` +
          `Total: *${pendingRequests.length}* request(s)\n\n` +
          `${requestList}\n\n` +
          `Use .accept <number> or .acceptall to approve\n` +
          `Use .reject <number> or .rejectall to decline`,
        mentions: resolvedJids,
      }, { quoted: mek });
    } catch (e) {
      await react("❌");
      return reply(`Failed to list requests: ${e.message}`);
    }
  },
);

gmd(
  {
    pattern: "togroupstatus",
    aliases: ["groupstatus", "statusgroup", "togcstatus", "gs"],
    react: "📢",
    category: "group",
    description: "Send text or quoted media to group status.",
  },
  async (from, Gifted, conText) => {
    const { reply, react, isSuperUser, isGroup, q, quoted, quotedMsg, mek, formatAudio, formatVideo, botPrefix } = conText;
    const { downloadMediaMessage } = require("gifted-baileys");

    if (!isGroup) return reply("Group only command!");
    if (!isSuperUser) return reply("Owner Only Command!");

    if (!q && !quotedMsg) {
      return reply(
        `Usage:\n` +
        `${botPrefix}togroupstatus <text>\n` +
        `Reply to image/video/audio with ${botPrefix}togroupstatus`
      );
    }

    try {
      let statusPayload = {};

      if (quotedMsg) {
        if (quoted?.imageMessage) {
          const buffer = await downloadMediaMessage({ message: quotedMsg }, "buffer", {});
          statusPayload = { image: buffer, mimetype: "image/jpeg" };
          if (q) statusPayload.caption = q;
        } else if (quoted?.videoMessage) {
          let buffer = await downloadMediaMessage({ message: quotedMsg }, "buffer", {});
          buffer = await formatVideo(buffer);
          statusPayload = { video: buffer, mimetype: "video/mp4" };
          if (q) statusPayload.caption = q;
        } else if (quoted?.audioMessage) {
          let buffer = await downloadMediaMessage({ message: quotedMsg }, "buffer", {});
          buffer = await formatAudio(buffer);
          statusPayload = { audio: buffer, mimetype: "audio/mp4", ptt: true };
        } else if (quoted?.conversation || quoted?.extendedTextMessage?.text) {
          statusPayload.text = quoted.conversation || quoted.extendedTextMessage.text;
        } else {
          return reply("Unsupported media type for group status.");
        }
      } else {
        statusPayload.text = q;
      }

      await Gifted.giftedStatus.sendGroupStatus(from, statusPayload);
      await react("✅");
    } catch (e) {
      console.error("togroupstatus error:", e);
      await react("❌");
      return reply(`Error sending group status: ${e.message}`);
    }
  },
);

gmd(
  {
    pattern: "groupname",
    aliases: ["gcname", "setgcname", "setgroupname", "gcsubject", "setgcsubject"],
    react: "✏️",
    category: "group",
    description: "Change group name.",
  },
  async (from, Gifted, conText) => {
    const { reply, react, isGroup, isBotAdmin, isAdmin, isSuperAdmin, q, botPrefix } = conText;

    if (!isGroup) return reply("This command only works in groups!");
    if (!isBotAdmin) return reply("Bot is not an admin in this group!");
    if (!isAdmin && !isSuperAdmin) return reply("You must be an admin to use this command!");
    if (!q) return reply(`Please provide a new group name.\nUsage: ${botPrefix}groupname New Name`);

    try {
      await Gifted.groupUpdateSubject(from, q);
      await react("✅");
      return reply(`Group name changed to: *${q}*`);
    } catch (e) {
      await react("❌");
      return reply(`Failed to change group name: ${e.message}`);
    }
  },
);

gmd(
  {
    pattern: "gcdesc",
    aliases: ["groupdesc", "setgcdesc", "setgroupdesc", "description", "setdescription"],
    react: "📝",
    category: "group",
    description: "Change group description.",
  },
  async (from, Gifted, conText) => {
    const { reply, react, isGroup, isBotAdmin, isAdmin, isSuperAdmin, q, botPrefix } = conText;

    if (!isGroup) return reply("This command only works in groups!");
    if (!isBotAdmin) return reply("Bot is not an admin in this group!");
    if (!isAdmin && !isSuperAdmin) return reply("You must be an admin to use this command!");
    if (!q) return reply(`Please provide a new description.\nUsage: ${botPrefix}gcdesc New Description`);

    try {
      await Gifted.groupUpdateDescription(from, q);
      await react("✅");
      return reply(`Group description updated successfully!`);
    } catch (e) {
      await react("❌");
      return reply(`Failed to change group description: ${e.message}`);
    }
  },
);

gmd(
  {
    pattern: "everyone",
    react: "📢",
    aliases: ["tag", "all", "mention"],
    category: "group",
    description: "Tag everyone in the group",
  },
  async (from, Gifted, conText) => {
    const { reply, isAdmin, isSuperAdmin, isGroup, mek, q, participants, sender } = conText;

    if (!isGroup) return reply("This command can only be used in groups!");
    if (!isAdmin && !isSuperAdmin) {
      return await Gifted.sendMessage(from, {
        text: `@${sender.split("@")[0]} Only group admins can use this command!`,
        mentions: [sender],
      }, { quoted: mek });
    }

    const mentionedJids = participants.map(p => {
      const jid = typeof p === "string" ? p : p.id || p.jid || p.pn || p.phoneNumber || "";
      if (!jid) return null;
      return jid.includes("@") ? jid : `${jid}@s.whatsapp.net`;
    }).filter(Boolean);

    try {
      await Gifted.sendMessage(from, {
        text: `@${from}`,
        contextInfo: {
          mentionedJid: mentionedJids,
          groupMentions: [{ groupJid: from, groupSubject: q || "everyone" }],
        },
      }, { quoted: mek });
    } catch (e) {
      return reply(`Failed to tag everyone: ${e.message}`);
    }
  },
);

gmd(
  {
    pattern: "hidetag",
    react: "📢",
    aliases: ["htag", "hidden", "hidtag"],
    category: "group",
    description: "Send a message that secretly tags everyone",
  },
  async (from, Gifted, conText) => {
    const { reply, isAdmin, isSuperAdmin, isGroup, mek, q, participants, sender, quotedMsg, botPrefix } = conText;

    if (!isGroup) return reply("This command can only be used in groups!");
    if (!isAdmin && !isSuperAdmin) {
      return await Gifted.sendMessage(from, {
        text: `@${sender.split("@")[0]} Only group admins can use this command!`,
        mentions: [sender],
      }, { quoted: mek });
    }

    let text = q;
    if (!text && quotedMsg) {
      text = quotedMsg.conversation || quotedMsg.extendedTextMessage?.text ||
             quotedMsg.imageMessage?.caption || quotedMsg.videoMessage?.caption || "";
    }

    if (!text) return reply(`Please provide a message or reply to one.\nUsage: ${botPrefix}hidetag Your message`);

    const mentionedJids = participants.map(p => {
      const jid = typeof p === "string" ? p : p.id || p.jid || p.pn || p.phoneNumber || "";
      if (!jid) return null;
      return jid.includes("@") ? jid : `${jid}@s.whatsapp.net`;
    }).filter(Boolean);

    try {
      await Gifted.sendMessage(from, {
        text,
        contextInfo: { mentionedJid: mentionedJids },
      }, { quoted: mek });
    } catch (e) {
      return reply(`Failed to send hidden tag: ${e.message}`);
    }
  },
);

gmd(
  {
    pattern: "tagall",
    react: "📢",
    aliases: ["mentionall"],
    category: "group",
    description: "Tag all group members",
  },
  async (from, Gifted, conText) => {
    const { reply, react, isAdmin, isSuperAdmin, isGroup, isSuperUser, mek, sender, q, botName } = conText;

    if (!isGroup) return reply("This command only works in groups!");
    if (!isAdmin && !isSuperAdmin && !isSuperUser) return reply("Admin/Owner Only Command!");

    try {
      const meta = await Gifted.groupMetadata(from);
      const participants = meta.participants;

      const superAdmins = participants.filter(p => p.admin === "superadmin").map(p => p.id);
      const admins = participants.filter(p => p.admin === "admin").map(p => p.id);
      const members = participants.filter(p => !p.admin).map(p => p.id);

      const sortedParticipants = [...superAdmins, ...admins, ...members];
      const mentions = [...sortedParticipants, sender];

      let text = `*${botName} Tagall*\n\n`;
      if (q && q.trim()) text += `*Message:* ${q.trim()}\n\n`;
      text += `*Tagged By:* @${sender.split("@")[0]}\n\n*Members:*\n`;

      for (const id of superAdmins) text += `👑 @${id.split("@")[0]}\n`;
      for (const id of admins) text += `👮 @${id.split("@")[0]}\n`;
      for (const id of members) text += `👤 @${id.split("@")[0]}\n`;

      await Gifted.sendMessage(from, { text: text.trim(), mentions }, { quoted: mek });
      await react("✅");
    } catch (e) {
      return reply(`Failed to tag all: ${e.message}`);
    }
  },
);

gmd(
  {
    pattern: "tagadmins",
    react: "👮",
    aliases: ["taggcadmins", "taggroupadmins"],
    category: "group",
    description: "Tag all group admins",
  },
  async (from, Gifted, conText) => {
    const { reply, react, isAdmin, isSuperAdmin, isGroup, isSuperUser, mek, sender, q, botName } = conText;

    if (!isGroup) return reply("This command only works in groups!");
    if (!isAdmin && !isSuperAdmin && !isSuperUser) return reply("Admin/Owner Only Command!");

    try {
      const meta = await Gifted.groupMetadata(from);
      const participants = meta.participants;

      const superAdmins = participants.filter(p => p.admin === "superadmin").map(p => p.id);
      const admins = participants.filter(p => p.admin === "admin").map(p => p.id);
      const allAdmins = [...superAdmins, ...admins];

      if (allAdmins.length === 0) return reply("No admins found in this group!");

      const mentions = [...allAdmins, sender];
      let text = `*${botName} Tag Admins*\n\n`;
      if (q && q.trim()) text += `*Message:* ${q.trim()}\n\n`;
      text += `*Tagged By:* @${sender.split("@")[0]}\n\n*Admins:*\n`;

      for (const id of superAdmins) text += `👑 @${id.split("@")[0]}\n`;
      for (const id of admins) text += `👮 @${id.split("@")[0]}\n`;

      await Gifted.sendMessage(from, { text: text.trim(), mentions }, { quoted: mek });
      await react("✅");
    } catch (e) {
      return reply(`Failed to tag admins: ${e.message}`);
    }
  },
);
