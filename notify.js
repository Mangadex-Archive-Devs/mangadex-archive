const request = require('request');
const RateLimiter = require('limiter').RateLimiter;
const limiter = new RateLimiter(1, 1000); // x requests every y ms

const sendMsg = function (msg, url, color) {
    let pl = {
        "embeds": [
            {
                "title": "",
                "color": color,
                "fields": [
                    {
                        "name": "LOG ENTRY",
                        "value": msg
                    },
                ]
            },
        ]
    };

    request.post({
        url: url,
        headers: {
            'Content-Type': 'application/json',
            'Length': JSON.stringify(pl).length
        },
        json: pl
    });
};

const webHook = {
    info: process.env.DISCORD_WEBHOOK_INFO || null,
    warning: process.env.DISCORD_WEBHOOK_WARNING || null,
    error: process.env.DISCORD_WEBHOOK_ERROR || null,
};

module.exports = {

    info: function (message) {
        limiter.removeTokens(1, () => {
            sendMsg(message, webHook.info, 0xd3eeef);
        })
    },

    warn: function (message) {
        limiter.removeTokens(1, () => {
            sendMsg(message, webHook.warning, 0xfff206);
        })
    },

    err: function (message) {
        limiter.removeTokens(1, () => {
            sendMsg(message, webHook.error, 0xff0606);
        })
    }

};
