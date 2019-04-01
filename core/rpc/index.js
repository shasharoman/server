const config = require(process.env.config);

const http = require('./http');
const pb = require('./pb');
const instance = config.grpc ? pb : http;

exports.init = init;
exports.send = send;

async function init(server) {
    if (config.grpc) {
        pb.init(server);
    }

    if (config.rpc) {
        http.init(server);
    }
}

async function send(...args) {
    return await instance.send.apply(null, args);
}
