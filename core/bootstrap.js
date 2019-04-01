const nPath = require('path');
const fs = require('fs');
const Server = require('./server');
const Application = require('./application');
const config = require('../config');
const logger = require(process.env.lib).logger;
const util = require('../util');
const rpc = require('./rpc');

exports = module.exports = async function () {
    const appOptions = _.pick(config, [
        'host',
        'port',
        'path',
        'modules',
        'component',
        'componentPath',
        'appPath',
        'routes'
    ]);

    let appComponent = {};
    _.each(['converter', 'redirector', 'interceptor', 'interferer'], item => {
        let path = nPath.join(appOptions.componentPath, item);
        appComponent[item] = fs.existsSync(path) ? require(path) : {};
    });

    logger.debug('bootstrap start');
    logger.debug('path:', appOptions.path);
    logger.debug('modules:', appOptions.modules);

    let server = new Server();
    let modules = _.map(appOptions.modules, item => {
        return {
            name: item,
            manifest: util.manifest.load(nPath.join(appOptions.appPath, item, 'manifest.json'), appComponent)
        };
    });

    let options = _.assign({
        modules: modules,
        component: _trimComponent(appOptions.component, appComponent)
    });

    server.application = new Application(options);
    server.appendRouter(await server.application.setup());
    await rpc.init(server);

    server.listen(appOptions.port, appOptions.host);

    logger.debug('bootstrap end');
    logger.info('server listen on', appOptions.port);
    logger.info(server.toString());

    return server;
};

function _trimComponent(origin, appComponent) {
    return _.mapValues(origin, (items, type) => {
        let accessor = {};

        /* eslint-disable */
        switch (type) {
            case 'converters':
                accessor = appComponent.converter;
                break;

            case 'redirectors':
                accessor = appComponent.redirector;
                break;

            case 'interceptors':
                accessor = appComponent.interceptor;
                break;

            case 'interferes':
                accessor = appComponent.interferer;
                break;
        }
        /* eslint-enable */

        items = _.map(items, item => {
            if (_.isString(item)) {
                // like 'xxx:GET,POST:/:dev'
                let list = item.split(':');

                return {
                    name: list[0],
                    options: {},
                    method: list[1] || null,
                    path: list[2] || '/',
                    mode: list[3] || ''
                };
            }

            return item;
        });

        items = _.filter(items, item => {
            return !item.mode || item.mode === process.env.mode || _.includes(item.mode, process.env.mode);
        });

        return _.map(items, item => {
            return {
                executor: _.get(accessor, item.name)(item.options),
                methods: item.menthod ? _.map(item.method.split(','), one => _.trim(_.toUpperCase(one))) : null,
                path: item.path || '/'
            };
        });
    });
}
