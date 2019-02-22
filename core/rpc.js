const rp = require('request-promise');
const config = require(process.env.config);
const fw = require(process.env.fw);
const logger = require(process.env.lib).logger;
const crypto = require('crypto');

exports.send = send;
exports.receive = receive;

// args must be json stringify able
function send(module, service, args) {
    if (_.isEmpty(config.rpc) || !config.rpc.key) {
        return Promise.reject(new Error('no rpc config, ' + [module, service].join(', ')));
    }

    let now = Date.now();
    let s = `${module}${service}${now}${config.rpc.key}`;
    let sign = crypto.createHash('md5').update(s).digest('hex');

    let options = {
        url: config.rpc.url + '/rpc/' + encodeURIComponent(module) + '/' + encodeURIComponent(service),
        method: 'POST',
        headers: {
            host: config.rpc.host,
            'x-timestamp': now.toString(),
            'x-sign': sign
        },
        body: args,
        json: true,
        encoding: null
    };

    let start = Date.now();
    return rp(options).then(body => {
        let delta = Date.now() - start;
        if (delta > 1000) {
            logger.warn('rpc spend too much time:', delta + 'ms');
        }

        if (Buffer.isBuffer(body)) {
            return body;
        }

        if (body.code !== 0) {
            return Promise.reject(new Error(body.msg));
        }

        return body.result;
    }).catch(err => {
        delete err.response; // this info is too much and useless

        return Promise.reject(err);
    });
}

function receive(module, service, args, timestamp, sign) {
    let s = `${module}${service}${timestamp}${config.rpc.key}`;
    let pass = crypto.createHash('md5').update(s).digest('hex') === sign;
    if (!pass || Math.abs(Date.now() - timestamp) > 30000) {
        return Promise.reject('invalid sign or timestamp');
    }

    return fw.serviceCall.apply(fw, [module, service].concat(args));
}
