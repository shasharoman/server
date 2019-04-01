const config = require(process.env.config);
const fw = require(process.env.fw);
const logger = require(process.env.lib).logger.createLogger('core-grpc');
const nPath = require('path');
const grpc = require('grpc');
const fs = require('fs');
const protoLoader = require('@grpc/proto-loader');
const util = require('../../util');

const namespace = config.name;
const client = {}; // module:client

let modules = [];

exports.init = init;
exports.send = send;

// exports.register = register; // 服务注册
// exports.heartbeat = heartbeat; // 上报心跳

async function init(server) {
    modules = trim(server.application.modules);
    modules = _.filter(modules, item => !_.isEmpty(item.services));
    if (_.isEmpty(modules)) {
        return;
    }

    // TODO 注册服务
    // TODO 保持心跳

    const GS = new grpc.Server();
    _.each(modules, item => {
        item.def = protoLoader.loadSync(item.path, {
            keepCase: true,
            longs: String,
            enums: String,
            defaults: true,
            oneofs: true
        });

        let call = {};
        _.each(item.services, item => {
            call[item.name] = async (input, callback) => {
                try {
                    let ret = await item.impl.apply(null, decode(input.request));
                    callback(null, {
                        output: ret
                    });
                }
                catch (err) {
                    logger.error(err);
                    callback(err);
                }
            };
        });
        GS.addService(_.get(grpc.loadPackageDefinition(item.def), namespace)[item.name].service, call);
    });

    let {
        host,
        port
    } = config.grpc.server;
    GS.bind(`${host}:${port}`, grpc.ServerCredentials.createInsecure());

    await GS.start();

    // TODO 依赖动态拉取的服务配置
    _.each(modules, item => {
        let proto = _.get(grpc.loadPackageDefinition(item.def), namespace);
        client[item.name] = new proto[item.name](`${host}:${port}`, grpc.credentials.createInsecure());
    });
}

async function send(module, service, args) {
    module = normalizedName(module);
    if (_.isEmpty(client[module])) {
        throw new Error(`no client for module: ${module}`);
    }
    args = encode(args);

    try {
        let instance = client[module];
        let ret = await Promise.promisify(instance[service], {
            context: instance
        })(args);
        return ret.output;
    }
    catch (err) {
        logger.error(err);
        throw err;
    }
}

function makeProtoPath() {
    if (!fs.existsSync(config.runtimePath)) {
        fs.mkdirSync(config.runtimePath);
    }

    let path = nPath.join(config.runtimePath, 'grpc');
    if (!fs.existsSync(path)) {
        fs.mkdirSync(path);
    }

    return path;
}

function trim(modules) {
    let protoPath = makeProtoPath();

    modules = _.map(modules, item => {
        let name = normalizedName(item.name);
        let services = _.map(item.services, item => {
            if (_.isEmpty(item.grpc)) {
                return {};
            }

            let input = item.grpc.input;
            if (!_.isArray(input)) {
                input = [input];
            }
            input = encode(input);
            let output = {
                '1:output': item.grpc.output
            };

            return {
                name: item.name,
                impl: item.impl,
                input,
                output
            };
        });

        return {
            name,
            services: _.filter(services, item => !_.isEmpty(item)),
            path: nPath.join(protoPath, `${name}.proto`),
        };
    });

    _.each(modules, item => {
        fs.writeFileSync(item.path, util.grpc.proto(namespace, item), 'utf8');
    });

    return modules;
}

// grpc service name can't contain -
function normalizedName(name) {
    return name.replace(/-/g, '');
}

// trans array to protobuf o
function encode(array) {
    let o = {};
    _.each(array, (item, index) => {
        o[`${index + 1}:args${index}`] = item;
    });
    return o;
}

// trans protobuf o to array
function decode(o) {
    let array = [];
    _.each(o, (value, key) => {
        let [id] = key.split(':');
        array[Number(id) - 1] = value;
    });

    return array;
}
