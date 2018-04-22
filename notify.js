const request = require('request');
const RateLimiter = require('limiter').RateLimiter;
const limiter = new RateLimiter(1, 2000); // x requests every y ms
const moment = require('moment');

const sendMsg = function (msg, url, color, footer = null) {
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
        ],
        "timestamp": moment(Date.now(), moment.ISO_8601).format()
    };
    if (footer) {
        pl.embeds[0].footer = {
            "text": footer
        };
    }

    request.post({
        url: url,
        headers: {
            'Content-Type': 'application/json',
            'Length': JSON.stringify(pl).length
        },
        json: pl
    }).on('error', (err) => {
        console.error("failed to send discord request", err);
    });
};

const webHook = {
    info: process.env.DISCORD_WEBHOOK_INFO || null,
    warning: process.env.DISCORD_WEBHOOK_WARNING || null,
    error: process.env.DISCORD_WEBHOOK_ERROR || null,
};

module.exports = {

    info: function (message, trace = null) {
        limiter.removeTokens(1, () => {
            sendMsg(message, webHook.info, 0xd3eeef, trace);
        })
    },

    warn: function (message, trace = null) {
        limiter.removeTokens(1, () => {
            sendMsg(message, webHook.warning, 0xfff206, trace);
        })
    },

    err: function (message, trace = null) {
        limiter.removeTokens(1, () => {
            sendMsg(message, webHook.error, 0xff0606, trace);
        })
    }

};
