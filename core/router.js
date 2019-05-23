const PathTree = require('./pathTree');
const supportMethods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'];
const logger = require(process.env.lib).logger;
const http = require('http');
const stream = require('stream');
const result = require('./result');

exports = module.exports = class Router {
    constructor() {
        this.pathTree = new PathTree();
    }

    convert(path, converters, methods) {
        if (!this.pathTree.exists(path)) {
            this.pathTree.makeMiddle(path);
        }

        converters = _.isArray(converters) ? converters : [converters];

        if (_.some(converters, item => !_.isFunction(item))) {
            throw new Error('converter must bu function.');
        }

        methods = methods || supportMethods;
        if (!_.isArray(methods)) {
            methods = [methods];
        }

        _.each(converters, item => {
            _.each(methods, method => {
                this.pathTree.addConverterByPath(path, method, item);
            });
        });

        return this;
    }

    redirect(path, redirectors, methods) {
        if (!this.pathTree.exists(path)) {
            this.pathTree.makeMiddle(path);
        }

        redirectors = _.isArray(redirectors) ? redirectors : [redirectors];

        if (_.some(redirectors, item => !_.isFunction(item))) {
            throw new Error('redirector must bu function.');
        }

        methods = methods || supportMethods;
        if (!_.isArray(methods)) {
            methods = [methods];
        }

        _.each(redirectors, item => {
            _.each(methods, method => {
                this.pathTree.addRedirectorByPath(path, method, item);
            });
        });

        return this;
    }

    intercept(path, interceptors, methods) {
        if (!this.pathTree.exists(path)) {
            this.pathTree.makeMiddle(path);
        }

        interceptors = _.isArray(interceptors) ? interceptors : [interceptors];

        if (_.some(interceptors, item => !_.isFunction(item))) {
            throw new Error('interceoptor must bu function.');
        }

        methods = methods || _.without(supportMethods, 'OPTIONS');
        if (!_.isArray(methods)) {
            methods = [methods];
        }

        _.each(interceptors, item => {
            _.each(methods, method => {
                this.pathTree.addInterceptorByPath(path, method, item);
            });
        });

        return this;
    }

    interfere(path, interferer, methods) {
        if (!this.pathTree.exists(path)) {
            this.pathTree.makeMiddle(path);
        }

        interferer = _.isArray(interferer) ? interferer : [interferer];

        if (_.some(interferer, item => !_.isFunction(item))) {
            throw new Error('interferer must be function.');
        }

        methods = methods || supportMethods;
        if (!_.isArray(methods)) {
            methods = [methods];
        }

        _.each(interferer, item => {
            _.each(methods, method => {
                this.pathTree.addInterfererByPath(path, method, item);
            });
        });

        return this;
    }

    get(path, handler) {
        return this._addHandler('GET', path, handler);
    }

    post(path, handler) {
        return this._addHandler('POST', path, handler);
    }

    put(path, handler) {
        return this._addHandler('PUT', path, handler);
    }

    delete(path, handler) {
        return this._addHandler('DELETE', path, handler);
    }

    all(path, handler) {
        _.each(supportMethods, method => {
            this._addHandler(method, path, handler);
        });

        return this;
    }

    link(path, targetPath) {
        this.pathTree.makeLink(path, targetPath);

        return this;
    }

    makeEnd(path) {
        if (!this.pathTree.exists(path)) {
            this.pathTree.makeEnd(path);
        }

        return this;
    }

    makeMiddle(path) {
        this.pathTree.makeMiddle(path);

        return this;
    }

    // process request
    async process(ctx, skip) {
        await ctx.start();

        let ret = await this._process(ctx, skip);
        if (ctx.finished) {
            return;
        }

        if (!result.canBeNormalized(ret)) {
            logger.error(ret);
            throw new Error('result can not be normalized');
        }
        ret = result.normalized(ret);

        ctx.statusCode = ret.statusCode;
        ctx.statusMessage = ret.statusMessage;
        ctx.setHeader('content-type', ret.contentType);

        if (ret.isStream) {
            ret.body.pipe(ctx);

            return await new Promise(resolve => {
                ctx.hook('post-res-end', resolve);
            });
        }

        return await ctx.end(ret.body);
    }

    async _process(ctx, skip) {
        logger.debug('router process start.');

        let path = ctx.pathname;
        let method = ctx.method;

        if (!this.pathTree.searchEnd(path)) {
            path = path + (_.endsWith(path, '/') ? 'index' : '/index');
        }
        // handle 404 
        if (!this.pathTree.searchEnd(path)) {
            let match = path.match(/^\/([^/]+).*$/);
            let app = match ? match[1] : 'common';
            let notFoundPath = `/${app}/404`;

            if (this.pathTree.searchEnd(notFoundPath)) {
                ctx.setUrl(notFoundPath);
                return await this.process(ctx);
            }

            if (app !== 'common' && this.pathTree.searchEnd('/common/404')) {
                ctx.setUrl('/common/404');
                return await this.process(ctx);
            }

            return 404;
        }

        let ret = await this.pathTree.process(path, method, ctx, skip);

        /* eslint-disable */
        switch (ret.type) {
            case 'redirect':
                ctx.setUrl(ret.path);
                return await this.process(ctx, ret.skip);
            case 'intercept':
                throw ret.reason;
            case 'done':
                return ret.result;
            default:
                return 404
        }
        /* eslint-enable */
    }

    mount(parent, path) {
        this.pathTree.mount(parent.pathTree.nodeByPath(path || '/'));

        return this;
    }

    toString() {
        return this.pathTree.toString();
    }

    _addHandler(method, path, handler) {
        if (!_.isFunction(handler)) {
            throw new Error('handler must be function.');
        }

        if (!this.pathTree.exists(path)) {
            this.pathTree.makeEnd(path);
        }

        this.pathTree.addHandlerByPath(path, method, handler);

        return this;
    }
};
