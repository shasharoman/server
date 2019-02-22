const logger = require(process.env.lib).logger;
const fs = require('fs');
const nPath = require('path');

exports.load = load;
exports.trimRoutes = trimRoutes;

function load(path, appComponent) {
    let dirname = nPath.dirname(path);

    logger.debug('read manifest', path);
    let manifest = JSON.parse(fs.readFileSync(path).toString());

    manifest = _load(manifest);

    return _.assign({
        name: '',
        path: '/',
        init: null,
        converters: [],
        redirectors: [],
        interceptors: [],
        interferers: [],
        routes: [],
        links: [],
        services: []
    }, manifest);

    function _load(manifest) {
        manifest = trimRoutes(manifest, dirname);
        let handler = _.isEmpty(manifest.routes) ? {} : require(nPath.join(dirname, 'handler'));
        manifest.routes = _.map(manifest.routes, item => {
            item.handler = _.get(handler, item.handler);

            return item;
        });

        _formatComponent(manifest);
        _assignComponent(manifest, dirname, appComponent);

        let init = manifest.init ? require(nPath.join(dirname, 'init')) : {};
        manifest.init = _.get(init, manifest.init) || function () {
            return Promise.resolve();
        };

        manifest.links = _.map(manifest.links, item => {
            return {
                path: _.startsWith(item.path, '/') ? item.path : nPath.join(manifest.path, item.path),
                target: _.startsWith(item.target, '/') ? item.target : nPath.join(manifest.path, item.target)
            };
        });

        let service = _.isEmpty(manifest.services) ? {} : require(nPath.join(dirname, 'service'));
        manifest.services = _.map(manifest.services, item => {
            return {
                name: item.name,
                impl: _.get(service, item.impl)
            };
        });

        manifest.child = _.map(manifest.child, item => {
            if (!_.startsWith(item.path, '/')) {
                item.path = nPath.join(manifest.path, item.path);
            }

            return _load(item);
        });

        return manifest;
    }
}

function trimRoutes(manifest, dirname) {
    manifest.path = _trimPath(manifest.path);

    let routes = _.flatten(_.map(manifest.routes, item => {
        if (!_.isString(item)) {
            return item;
        }

        // load sub route file
        let path = nPath.join(dirname, 'route', item + '.json');
        if (!fs.existsSync(path)) {
            throw new Error('route file not exists:' + path);
        }

        logger.debug('read route file:', path);

        let route = JSON.parse(fs.readFileSync(path).toString());

        route.path = _trimPath(route.path);

        return _.map(route.routes, item => {
            if (!_.startsWith(item.path, '/')) {
                item.path = route.path + item.path;
            }

            _.each(['converters', 'redirectors', 'interceptors', 'interferers'], one => {
                if (_.isEmpty(route[one])) {
                    return;
                }

                item[one] = _.concat(route[one], item[one] || []);
            });

            return item;
        });
    }));

    manifest.routes = _.map(routes, item => {
        if (!_.startsWith(item.path, '/')) {
            item.path = manifest.path + item.path;
        }
        if (_.endsWith(item.path, '/')) {
            item.path += 'index';
        }

        item.methods = _.isString(item.method) ? item.method.split(',') : (item.method || ['GET', 'POST', 'PUT', 'DELETE']);
        item.methods = _.map(item.methods, item => _.toUpper(_.trim(item)));

        return item;
    });

    return manifest;
}

function _tryRequire(dirname, name) {
    let path = nPath.join(dirname, name);
    if (!fs.existsSync(path)) {
        return {};
    }

    try {
        return require(path);
    }
    catch (e) {
        logger.info(e);
        return {};
    }
}

function _trimPath(path) {
    if (!path) {
        return '';
    }

    if (!_.endsWith(path, '/')) {
        return path + '/';
    }

    return path;
}

function _formatComponent(manifest) {
    _.each(['converters', 'redirectors', 'interceptors', 'interferers'], item => {
        manifest[item] = _.filter(_.map(manifest[item], _trim), item => {
            return !item.mode || item.mode === process.env.mode || _.includes(item.mode, process.env.mode);
        });

        _.each(manifest.routes, one => {
            one[item] = _.filter(_.map(one[item], _trim), item => {
                return !item.mode || item.mode === process.env.mode || _.includes(item.mode, process.env.mode);
            });
        });
    });

    function _trim(item) {
        if (_.isString(item)) {
            return {
                name: item,
                options: {}
            };
        }

        return item;
    }
}

function _assignComponent(manifest, dirname, appComponent) {
    let impl = {
        converter: {},
        redirector: {},
        interceptor: {},
        interferer: {}
    };
    impl = _.mapValues(impl, (item, key) => {
        return _tryRequire(nPath.join(dirname, 'component'), key);
    });

    let magicMap = {
        converters: 'converter',
        redirectors: 'redirector',
        interceptors: 'interceptor',
        interferers: 'interferer'
    };

    let componentKeys = _.keys(magicMap);

    _assign(manifest, componentKeys);

    _.each(manifest.routes, item => {
        _assign(item, componentKeys);
    });

    function _assign(entity, items) {
        _.each(items, item => {
            entity[item] = _.map(entity[item], one => {
                let fn = (_.get(impl[magicMap[item]], one.name) || _.get(appComponent[magicMap[item]], one.name));
                if (_.isFunction(fn)) {
                    return fn(one.options);
                }

                throw new Error(`no component named as ${one.name}`);
            });
        });
    }
}
