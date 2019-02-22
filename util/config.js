const fs = require('fs');
const nPath = require('path');

exports.load = load;

function load(path, cover) {
    let parent = {};
    let config = _.assign(JSON.parse(fs.readFileSync(path).toString('utf8')), cover);

    if (config.parent) {
        config.parent = _path(nPath.dirname(path), config.parent);
    }

    if (fs.existsSync(config.parent)) {
        parent = JSON.parse(fs.readFileSync(config.parent).toString('utf8'));
        delete config.parent;
    }
    config = _.assign(parent, config);
    config.path = nPath.resolve(config.path);
    config.fwPath = nPath.resolve(config.fwPath);

    config.viewPath = _path(config.path, config.viewPath || 'view');
    config.assetPath = _path(config.path, config.assetPath || 'static');

    _.each(['appPath', 'libPath', 'utilPath', 'componentPath'], item => {
        if (config[item]) {
            config[item] = _path(config.path, config[item]);
        }
    });

    return _.assign({
        host: '0.0.0.0',
        port: 10000,
        path: process.cwd(),
        modules: [],
        component: {},
        appPath: _path(config.path, 'app'),
        logPath: _path(config.path, 'log'),
        libPath: _path(config.path, 'lib'),
        utilPath: _path(config.path, 'util'),
        componentPath: _path(config.path, 'component')
    }, config);

    function _path(base, path) {
        if (nPath.isAbsolute(path)) {
            return path;
        }

        return nPath.join(base, path);
    }
}
