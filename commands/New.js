const { gmd } = require("../black_hat");

async function toggleGroupHistory(Gifted, jid, enable = true) {
    if (!Gifted || !jid) return false;

    try {
        await Gifted.query({
            tag: "iq",
            attrs: {
                type: "get",
                to: "s.whatsapp.net",
                xmlns: "w:mex",
            },
            content: [
                {
                    tag: "query",
                    attrs: {
                        query_id: "24688994337458819",
                    },
                    content: Buffer.from(
                        JSON.stringify({
                            variables: {
                                group_id: jid,
                                input: {
                                    member_share_group_history_mode:
                                        enable
                                            ? "ALL_MEMBER_SHARE"
                                            : "ADMIN_SHARE",
                                },
                            },
                        }),
                        "utf-8"
                    ),
                },
            ],
        });

        return true;
    } catch (err) {
        console.error("Group History Error:", err);
        return false;
    }
}

gmd(
{
    pattern: "history",
    react: "🕘",
    category: "group",
    description: "Toggle group history sharing",
},
async (from, Gifted, conText) => {
    const {
        reply,
        isGroup,
        isAdmin,
        isBotAdmin,
        args,
    } = conText;

    if (!isGroup) {
        return reply("❌ This command works only in groups.");
    }

    if (!isAdmin) {
        return reply("❌ Admin only command.");
    }

    if (!isBotAdmin) {
        return reply("❌ Bot must be admin.");
    }

    const option = (args[0] || "").toLowerCase();

    if (!["on", "off"].includes(option)) {
        return reply(
            `Example:\n.history on\n.history off`
        );
    }

    const enable = option === "on";

    const success = await toggleGroupHistory(
        Gifted,
        from,
        enable
    );

    if (!success) {
        return reply("❌ Failed to update group history.");
    }

    return reply(
        enable
            ? "✅ Group history enabled for all members."
            : "✅ Only admins can share group history now."
    );
});
