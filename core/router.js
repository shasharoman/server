const PathTree = require('./pathTree');
const supportMethods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'];
const logger = require(process.env.lib).logger;
const http = require('http');

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
            throw new Error('interferer must bu function.');
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

        let [
            statusCode,
            statusMessage,
            body,
            contentType
        ] = this._trim(await this._process(ctx, skip));

        if (ctx.finished) {
            return;
        }
        if (contentType) {
            ctx.setHeader('content-type', contentType);
        }
        ctx.statusCode = statusCode;
        ctx.statusMessage = statusMessage;

        return await ctx.end(body);
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

    _trim(result) {
        if (_.isNumber(result)) {
            return [result, http.STATUS_CODES[result], http.STATUS_CODES[result], 'text/plain'];
        }

        if (!_.isArray(result) && _.isObject(result)) {
            if (_.isUndefined(result.code)) {
                result = JSON.stringify({
                    code: 0,
                    msg: 'ok',
                    result: result
                });
            }

            return [200, 'OK', result, 'application/json'];
        }

        if (_.isEmpty(result) || _.isString(result)) {
            result = JSON.stringify({
                code: 0,
                msg: 'ok',
                result: result || {}
            });

            return [200, 'OK', result, 'application/json'];
        }

        let normalized = _.isArray(result) &&
            _.isNumber(result[0]) &&
            _.isString(result[1]) &&
            (_.isBuffer(result[2]) || _.isString(result[2]));
        if (!normalized) {
            result = JSON.stringify({
                code: 0,
                msg: 'ok',
                result: result
            });

            return [200, 'OK', result, 'application/json'];
        }

        return result;
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
