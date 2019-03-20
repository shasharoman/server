const nPath = require('path');
const logger = require(process.env.lib).logger;

exports = module.exports = class TreeNode {
    constructor(schema) {
        let parts = schema.split(':');

        this.name = parts[0];
        this.match = parts[1] ? new RegExp('^' + parts[1] + '$') : null;

        this.parent = null;
        this.children = [];

        this.converter = {};
        this.redirector = {};
        this.interceptor = {};
        this.interferer = {};
    }

    canBeMounted() {
        return true;
    }

    canMountOthers() {
        return true;
    }

    endpoint() {
        return this;
    }

    accept(node) {
        return this.endpoint().canMountOthers() && node.canBeMounted();
    }

    mount(parent) {
        if (this.parent) {
            _.pull(this.parent.endpoint().children, this);
        }

        let endpoint = parent.endpoint();
        if (!endpoint.accept(this)) {
            throw new Error(this.toString() + ' can not mount to ' + parent.toString());
        }

        let exists = _.find(endpoint.children, item => item === this);
        if (!_.isEmpty(exists)) {
            return parent;
        }

        let equalExists = _.find(endpoint.children, item => this.isEqual(item));
        if (!_.isEmpty(equalExists)) {
            equalExists.takeOver(this);

            let children = this.endpoint().children;
            while (!_.isEmpty(children)) {
                children[0].mount(equalExists);
            }

            return parent;
        }

        endpoint.children.push(this);
        this.parent = endpoint;

        return parent;
    }

    canTakeOver(node) {
        return (typeof this) === (typeof node);
    }

    takeOver(node) {
        if (!this.canTakeOver(node)) {
            throw new Error(this.toString() + ' can not take over ' + node.toString());
        }

        _.each(node.endpoint().converter, (items, type) => {
            _.each(items, item => {
                this.addConverter(type, item);
            });
        });
        _.each(node.endpoint().redirector, (items, type) => {
            _.each(items, item => {
                this.addRedirector(type, item);
            });
        });
        _.each(node.endpoint().interceptor, (items, type) => {
            _.each(items, item => {
                this.addInterceptor(type, item);
            });
        });
        _.each(node.endpoint().interferer, (items, type) => {
            _.each(items, item => {
                this.addInterceptor(type, item);
            });
        });

        return this;
    }

    addConverter(type, converter) {
        return this._add('converter', type, converter);
    }

    addRedirector(type, redirector) {
        return this._add('redirector', type, redirector);
    }

    addInterceptor(type, interceptor) {
        return this._add('interceptor', type, interceptor);
    }

    addInterferer(type, interferer) {
        return this._add('interferer', type, interferer);
    }

    async convert(type, ctx) {
        let converters = this.endpoint().converter[type] || [];

        if (_.isEmpty(converters)) {
            return ctx;
        }

        await Promise.mapSeries(converters, async item => {
            return await item.apply(ctx, [ctx]);
        });

        return {};
    }

    async redirect(type, ctx) {
        let redirectors = this.endpoint().redirector[type] || [];

        if (_.isEmpty(redirectors)) {
            return;
        }

        let rets = await Promise.map(redirectors, async item => {
            return await item.apply(ctx, [ctx]);
        });

        return _.first(_.filter(rets, item => !_.isEmpty(item)));
    }

    async intercept(type, ctx) {
        let interceptors = this.endpoint().interceptor[type] || [];

        if (_.isEmpty(interceptors)) {
            return;
        }

        let rets = await Promise.map(interceptors, async item => {
            return await item.apply(ctx, [ctx]);
        });

        return _.find(rets, item => !_.isUndefined(item));
    }

    async interfere(type, ctx) {
        let interferer = this.endpoint().interferer[type] || [];

        if (_.isEmpty(interferer)) {
            return;
        }

        return Promise.mapSeries(interferer, item => {
            return item.apply(ctx, [ctx]);
        });
    }

    async process(type, ctx) {
        ctx.pass(this);

        await this.convert(type, ctx);
        logger.debug(this.name, 'convert success');

        let ret = await this.redirect(type, ctx);
        logger.debug(this.name, 'redirect result', ret);

        if (!_.isEmpty(ret)) {
            ret = _.isString(ret) ? {
                path: ret
            } : ret;

            return {
                type: 'redirect',
                path: ret.path,
                skip: ret.skip || nPath.dirname(ret.path)
            };
        }

        let reason = await this.intercept(type, ctx);
        logger.debug(this.name, 'intercept result', reason);
        if (reason) {
            return {
                type: 'intercept',
                reason: reason
            };
        }

        await this.interfere(type, ctx);
        logger.debug(this.name, 'interfere success');

        return {
            type: 'continue'
        };
    }

    pathWithRoot(root) {
        let list = [this.name];
        let parent = this.parent;

        while (parent && parent !== root) {
            list.unshift(parent.name);
            parent = parent.parent;
        }

        return list.join('/').replace(/^\/\//g, '/');
    }

    isEqual(node) {
        return this.name === node.name;
    }

    // for node link selection.
    matchPriority() {
        let priority = 1;

        if (this.match) {
            priority -= 0.1;
        }

        return priority;
    }

    isMatch(pathFragment) {
        if (this.match) {
            return this.match.test(pathFragment);
        }

        return this.name === pathFragment;
    }

    extractParams(pathFragment) {
        if (!pathFragment || !this.match) {
            return null;
        }

        return Array.prototype.slice.call(pathFragment.match(this.match)) || [];
    }

    toString() {
        return this.name + '/' + (this.match ? '(' + this.match.toString() + ')' : '');
    }

    _add(stage, type, item) {
        let endpoint = this.endpoint();

        if (!endpoint[stage][type]) {
            endpoint[stage][type] = [];
        }

        endpoint[stage][type].push(item);

        return this;
    }
};
