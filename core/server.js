const http = require('http');
const Router = require('./router');
const Context = require('./context');
const events = require('events');
const config = require(process.env.config);
const fw = require(process.env.fw);
const rpc = require('./rpc');

exports = module.exports = class Server extends Router {
    constructor() {
        super();

        this.emiter = new events();

        this.server = http.createServer();
        this.server.on('request', (req, res) => {
            let ctx = new Context(req, res);
            super.process(ctx).catch(err => {
                this.emiter.emit('fw-process-error', err, ctx, req, res);
            });
        });
    }

    appendRouter(router) {
        if (config.prefix) {
            this.makeMiddle(config.prefix);
        }

        router.mount(this, config.prefix || '/');

        return this;
    }

    registerRpc() {
        let path = (config.prefix || '') + '/rpc/module:(.+)/service:(.+)';

        this.makeEnd(path);

        this.intercept(path, function (ctx) {
            let module = ctx.params.module[0];
            if (!fw.existsModule(module)) {
                return new Error(`service all, ${module} not exists`);
            }

            return null;
        }, ['POST']);

        this.post(path, function (ctx) {
            let module = ctx.params.module[0];
            let service = ctx.params.service[0];

            if (!module || !service) {
                return Promise.reject('module and service is required.');
            }

            let timestamp = ctx.headers['x-timestamp'];
            let sign = ctx.headers['x-sign'];

            return rpc.receive(module, service, ctx.body, timestamp, sign).then(result => {
                if (Buffer.isBuffer(result)) {
                    ctx.setHeader('content-type', 'application/octet-stream');
                    return ctx.end(result);
                }

                ctx.setHeader('content-type', 'application/json');
                return Promise.resolve([200, 'OK', JSON.stringify({
                    code: 0,
                    msg: 'ok',
                    result: _.isUndefined(result) ? {} : result
                })]);
            });
        });

        return this;
    }

    listen() {
        this.server.listen.apply(this.server, Array.prototype.slice.call(arguments));

        return this;
    }

    close() {
        this.server.close.apply(this.server, Array.prototype.slice.call(arguments));

        return this;
    }

    on(eventName) {
        let defaultEvents = [
            'checkContinue',
            'checkExpectation',
            'clientError',
            'close',
            'connect',
            'connection',
            'upgrade'
        ];
        if (_.includes(defaultEvents, eventName)) {
            this.server.on.apply(this.server, Array.prototype.slice.call(arguments));
            return;
        }

        this.emiter.on.apply(this.emiter, Array.prototype.slice.call(arguments));

        return this;
    }
};
