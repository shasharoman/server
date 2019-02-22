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
    process(ctx, skip) {
        return ctx.start().then(() => {
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
                    return this.process(ctx);
                }

                if (app !== 'common' && this.pathTree.searchEnd('/common/404')) {
                    ctx.setUrl('/common/404');
                    return this.process(ctx);
                }

                return Promise.resolve(404);
            }

            return this.pathTree.process(path, method, ctx, skip).then(ret => {
                /* eslint-disable */
                switch (ret.type) {
                    case 'redirect':
                        ctx.setUrl(ret.path);
                        return this.process(ctx, ret.skip);
                    case 'intercept':
                        return Promise.reject(ret.reason)

                    case 'done':
                        return Promise.resolve(ret.result);

                    default:
                        return Promise.resolve(404);
                }
                /* eslint-enable */
            });
        }).then(result => {
            if (ctx.finished) {
                return Promise.resolve();
            }

            if (_.isNumber(result)) {
                ctx.setHeader('content-type', 'text/plain');
                result = [result, http.STATUS_CODES[result], http.STATUS_CODES[result]];
            }

            if (_.isEmpty(result) || _.isString(result)) {
                ctx.setHeader('content-type', 'application/json');
                result = [200, 'OK', JSON.stringify({
                    code: 0,
                    msg: 'ok',
                    result: result || {}
                })];
            }

            if (_.isObject(result) && !_.isArray(result)) {
                ctx.setHeader('content-type', 'application/json');
                if (_.isUndefined(result.code)) {
                    result = _.assign({
                        code: 0,
                        msg: 'ok'
                    }, {
                        result: result
                    });
                }

                result = [200, 'OK', JSON.stringify(result)];
            }

            let isConform = _.isArray(result) && _.isNumber(result[0]) && _.isString(result[1]) && (_.isBuffer(result[2]) || _.isString(result[2]));
            if (!isConform) {
                ctx.setHeader('content-type', 'application/json');
                result = [200, 'OK', JSON.stringify({
                    code: 0,
                    msg: 'ok',
                    result: result
                })];
            }

            ctx.statusCode = result[0];
            ctx.statusMessage = result[1];
            return ctx.end(result[2]);
        });
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
