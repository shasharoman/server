const http = require('http');
const Router = require('./router');
const Context = require('./context');
const result = require('./result');
const events = require('events');
const config = require(process.env.config);
const fw = require(process.env.fw);

exports = module.exports = class Server extends Router {
    constructor() {
        super();

        this.emiter = new events();

        this.server = http.createServer();
        this.server.on('request', (req, res) => {
            let ctx = new Context(req, res);
            super.process(ctx).catch(async err => {
                if (!result.canBeNormalized(err)) {
                    this.emiter.emit('fw-process-error', err, ctx, req, res);
                    return;
                }

                let ret = result.normalized(err);

                ctx.statusCode = ret.statusCode;
                ctx.statusMessage = ret.statusMessage;
                ctx.setHeader('content-type', ret.contentType);

                return await ctx.end(ret.body);
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
