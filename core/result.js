const nUtil = require('util');
const http = require('http');

exports.normalized = normalized;
exports.canBeNormalized = canBeNormalized;

class R {
    constructor(code, msg, body, contentType) {
        if (_.isUndefined(code)) {
            throw new Error('code can not be empty');
        }

        let isStandardized = code !== 0 && code !== 1 && !!http.STATUS_CODES[code];

        this.statusCode = isStandardized ? code : 200;
        this.statusMessage = isStandardized ? http.STATUS_CODES[code] : 'OK';
        this.body = body;
        this.contentType = contentType;

        if (!this.contentType) {
            this.contentType = isStandardized ? 'text/plain' : (_.isBuffer(this.body) ? 'application/octet-stream' : 'application/json');
        }

        if (this.contentType === 'text/plain') {
            this.body = Buffer.from(isStandardized ? this.statusMessage : (this.body ? this.body.toString() : ''));
        }

        if (this.contentType === 'application/json') {
            this.body = Buffer.from(JSON.stringify({
                code: code || 0,
                msg: msg || '-',
                result: this.body
            }));
        }
    }
}

function normalized(o) {
    if (!canBeNormalized(o)) {
        return o;
    }

    if (o instanceof R) {
        return o;
    }

    if (_.isNumber(o)) {
        return new R(o, http.STATUS_CODES[o], http.STATUS_CODES[o], 'text/plain');
    }
    if (_.isUndefined(o) || _.isString(o)) {
        return new R(0, 'OK', o || {});
    }
    if (_.isPlainObject(o)) {
        if (o.code === 0 || o.code === 1) {
            return new R(o.code, o.msg.o.result);
        }
        return new R(0, 'OK', o);
    }
    if (_.isArray(o) && _.isNumber(o[0])) {
        return new R(...o);
    }
    if (Buffer.isBuffer(o)) {
        return new R(200, 'OK', o);
    }

    throw new Error('normalized exception');
}

function canBeNormalized(o) {
    if (o instanceof R) {
        return true;
    }
    if (_.isNumber(o)) {
        return true;
    }
    if (_.isUndefined(o) || _.isString(o)) {
        return true;
    }
    if (_.isPlainObject(o)) {
        return true;
    }
    if (_.isArray(o) && _.isNumber(o[0])) {
        return true;
    }
    if (Buffer.isBuffer(o)) {
        return true;
    }

    return false;
}
