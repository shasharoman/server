const Router = require('./router');
const AppModule = require('./module');
const logger = require(process.env.lib).logger;
const rpc = require('./rpc');

exports = module.exports = class Application {
    constructor(options) {
        this.modules = _.map(options.modules, item => {
            return new AppModule(item.name, item.manifest);
        });

        this.component = options.component;
        this.router = new Router();
    }

    setup() {
        logger.debug('application setup start');

        _.each(this.component.converters, item => {
            this.router.convert(item.path, item.executor, item.methods);
        });
        _.each(this.component.redirectors, item => {
            this.router.redirect(item.path, item.executor, item.methods);
        });
        _.each(this.component.interceptors, item => {
            this.router.intercept(item.path, item.executor, item.methods);
        });
        _.each(this.component.interferes, item => {
            this.router.interfere(item.path, item.executor, item.methods);
        });

        return Promise.mapSeries(this.modules, item => item.setup()).then((routers) => {
            _.each(routers, item => {
                item.mount(this.router);
            });

            _.each(this.modules, item => {
                _.each(item.links(), item => {
                    this.router.link(item.path, item.target);
                });
            });

            logger.debug('application setup end');

            return Promise.resolve(this.router);
        });
    }

    existsModule(module) {
        return !_.isEmpty(_.find(this.modules, item => item.name === module));
    }

    serviceCall(moduleName) {
        let module = _.find(this.modules, item => item.name === moduleName);
        let args = Array.prototype.slice.call(arguments);

        if (_.isEmpty(module)) {
            return rpc.send(moduleName, args[1], _.slice(args, 2));
        }

        return module.serviceCall.apply(module, _.slice(args, 1));
    }
};
