const _ = require('lodash');
const fs = require('fs');
const config = require('./util/config');

exports = module.exports = _config();

function _config() {
    let params = _args({
        config: '-c'
    });

    if (_.isEmpty(params.config)) {
        console.error('use -c to specify the config file path.');
        process.exit(1);
    }

    if (!fs.existsSync(params.config)) {
        console.error('config file not exists:', params.config);
        process.exit(1);
    }

    return config.load(params.config);

    function _args(options) {
        let result = {};
        let argNames = _.values(options);

        _.each(process.argv, function (item, index) {
            if (!_.includes(argNames, item)) {
                return;
            }

            let key = _.findKey(options, value => {
                return value === item;
            });

            if (_.startsWith(key, '--')) {
                result[key] = true;
                return;
            }

            result[key] = process.argv[index + 1];
        });

        return result;
    }
}
