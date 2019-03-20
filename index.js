global.Promise = require('bluebird');
global._ = require('lodash');

const fs = require('fs');
const path = require('path');
const config = require('./config');
const http = require('http');
const util = require('util');

process.env.mode = config.env || 'dev'; // dev demo prod
process.env.fw = __dirname;
process.env.config = path.join(__dirname, 'config');
process.env.lib = config.libPath || path.join(__dirname, 'lib');

if (fs.existsSync(config.utilPath)) {
    process.env.util = config.utilPath;
}

const lib = require(process.env.lib);
const logger = lib.logger;

(async() => {
    lib.init && await lib.init();

    try {
        let server = await require('./core').bootstrap();

        exports.serviceCall = server.application.serviceCall.bind(server.application);
        exports.existsModule = server.application.existsModule.bind(server.application);

        process.on('SIGINT', () => {
            server.close();

            setTimeout(() => {
                process.exit(0);
            }, 1000);
        });

        server.on('fw-process-error', (err, ctx) => {
            let isCaptured = _.isArray(err) && (/^\d{6}$/).test(err[0]);
            if (isCaptured) {
                logger.warn(err);
            }

            if (!isCaptured && !http.STATUS_CODES[err]) {
                logger.error(err);
            }

            if (ctx.finished) {
                return;
            }

            if (_.isNumber(err) && http.STATUS_CODES[err]) {
                ctx.setHeader('content-type', 'text/plain');
                ctx.statusCode = err;
                ctx.statusMessage = http.STATUS_CODES[err];
                return ctx.end(ctx.statusMessage);
            }

            err = _.isArray(err) ? err : [1, err, err];

            let [code, msg, result] = err;
            if (_.isUndefined(msg)) {
                msg = '-';
            }
            if (_.isUndefined(result)) {
                result = msg;
            }

            ctx.setHeader('content-type', 'application/json');

            return ctx.end(JSON.stringify({
                code: code,
                msg: msg.toString(),
                result: result instanceof Error ? result.toString() : util.inspect(result, {
                    depth: 1
                })
            }));
        });
    }
    catch (err) {
        logger.error(err);

        process.exit(1);
    }
})();
