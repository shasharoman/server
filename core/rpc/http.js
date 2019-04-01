const config = require(process.env.config);
const fw = require(process.env.fw);
const crypto = require('crypto');
const rp = require('request-promise');

exports.init = init;
exports.send = send;
exports.receive = receive;

function init(server) {
    let path = (config.prefix || '') + '/rpc/module:(.+)/service:(.+)';

    server.makeEnd(path);
    server.intercept(path, function (ctx) {
        let module = ctx.params.module[0];
        if (!fw.existsModule(module)) {
            return new Error(`service all, ${module} not exists`);
        }

        return null;
    }, ['POST']);

    server.post(path, async (ctx) => {
        let module = ctx.params.module[0];
        let service = ctx.params.service[0];

        if (!module || !service) {
            throw new Error('module and service is required.');
        }

        let timestamp = ctx.headers['x-timestamp'];
        let sign = ctx.headers['x-sign'];

        return await receive(module, service, ctx.body, timestamp, sign);
    });
}

async function send(module, service, args) {
    if (_.isEmpty(config.rpc) || !config.rpc.key) {
        throw new Error('no rpc config, ' + [module, service].join(', '));
    }

    let now = Date.now();
    let sign = _sign(module, service, now);

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

    try {
        let body = await rp(options);
        if (Buffer.isBuffer(body)) {
            return body;
        }

        if (body.code !== 0) {
            throw new Error(body.msg);
        }

        return body.result;
    }
    catch (err) {
        delete err.response; // this info is too much and useless
        throw err;
    }
}

async function receive(module, service, args, timestamp, sign) {
    let pass = _sign(module, service, timestamp) === sign;
    if (!pass || Math.abs(Date.now() - timestamp) > 30000) {
        throw new Error('invalid sign or timestamp');
    }

    return await fw.serviceCall.apply(fw, [module, service].concat(args));
}

function _sign(module, service, timestamp) {
    let s = `${module}${service}${timestamp}${config.rpc.key}`;
    let sign = crypto.createHash('md5').update(s).digest('hex');

    return sign;
}
