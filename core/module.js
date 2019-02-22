const Router = require('./router');
const logger = require(process.env.lib).logger;

exports = module.exports = class AppModule {
    constructor(name, manifest) {
        this.name = name;
        this.manifest = manifest;

        this.services = this.manifest.services || [];
    }

    setup() {
        this.router = new Router();

        logger.debug(this.name, 'setup start');
        logger.debug('init start');

        return this.manifest.init().then(() => {
            logger.debug('init end');

            logger.debug('routes register start');
            this._register(this.router, this.manifest);
            logger.debug('routes register end');

            logger.debug(this.name, 'setup end');
            return Promise.resolve(this.router);
        });
    }

    links() {
        return this.manifest.links;
    }

    serviceCall(serviceName) {
        let service = _.find(this.services, item => item.name === serviceName);
        if (_.isEmpty(service)) {
            return Promise.reject(new Error('service call, ' + [this.name, serviceName].join('.') + ' not exists'));
        }

        return service.impl.apply(null, _.slice(Array.prototype.slice.call(arguments), 1)).catch(err => {
            logger.error(`${this.name}-${serviceName} service call error`);
            logger.error(err);

            return Promise.reject(err);
        });
    }

    _register(router, manifest) {
        // setup router
        _.each(manifest.routes, item => {
            router.makeEnd(item.path);

            _.each(item.methods, method => {
                let fn = router[method.toLowerCase()];
                if (!_.isFunction(fn)) {
                    throw new Error('unsupport method: ' + method);
                }
                if (item.handler) {
                    fn.apply(router, [item.path, item.handler]);
                }

                router.convert(item.path, item.converters, method);
                router.redirect(item.path, item.redirectors, method);
                router.intercept(item.path, item.interceptors, method);
                router.interfere(item.path, item.interferers, method);
            });
        });

        router.convert(manifest.path, manifest.converters);
        router.redirect(manifest.path, manifest.redirectors);
        router.intercept(manifest.path, manifest.interceptors);
        router.interfere(manifest.path, manifest.interferers);

        _.each(manifest.child, item => {
            this._register(router, item);
        });
    }
};
