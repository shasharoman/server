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

exports.serviceCall = () => {
    throw new Error('serviceCall not ready');
};

(async () => {
    lib.init && await lib.init();

    try {
        let server = await require('./core/bootstrap')();

        exports.serviceCall = server.application.serviceCall.bind(server.application);
        exports.existsModule = server.application.existsModule.bind(server.application);

        process.on('SIGINT', () => {
            server.close();

            setTimeout(() => {
                process.exit(0);
            }, 1000);
        });

        server.on('fw-process-error', (err, ctx) => {
            logger.error(err);

            if (ctx.finished) {
                return;
            }

            ctx.statusCode = 200;
            ctx.statusMessage = 'OK';
            ctx.setHeader('content-type', 'application/json');
            return ctx.end(JSON.stringify({
                code: 1,
                msg: process.env.mode === 'prod' ? err.toString() : 'system error',
                result: {}
            }));
        });
    }
    catch (err) {
        console.error(err);
        logger.error(err);

        process.exit(1);
    }
})();
