const nUrl = require('url');
const stream = require('stream');

// initialized, servicing, finished 
const STATUS = {
    INITIALIZED: 1,
    SERVICING: 2,
    FINISHED: 3
};

class Context extends stream.Duplex {
    constructor(req, res) {
        super();

        this._req = req;
        this._res = res;

        this._init();
    }

    // impl for duplex stream read
    _read(size) {
        if (_.includes(['GET', 'HEAD', 'OPTIONS'], this.method)) {
            this.push(null);
            this.emitHook('req-end');
            return;
        }

        let chunk = this._req.read(size);
        if (!chunk) {
            if (this.reqState.ended) {
                this.push(null);
                this.emitHook('req-end');
                return;
            }

            this._req.once('readable', () => {
                this._read(size);
            });
            return;
        }

        this.push(chunk);
        this.emitHook('req-read', chunk);
        if (chunk.length < size) {
            this.push(null);
            this.emitHook('req-end', chunk);
            return;
        }
    }

    // impl for duplex stream write
    _write() {
        if (this.finished) {
            return true;
        }

        let args = Array.prototype.slice.call(arguments);

        return this._res.write.apply(this._res, args);
    }

    start() {
        if (this.status !== STATUS.INITIALIZED) {
            return Promise.resolve();
        }

        return this.emitHook('pre-start').then(() => {
            return this._start();
        }).then(() => {
            return this.emitHook('post-start');
        }).then(() => {
            return Promise.resolve(this);
        });
    }

    destroy() {}

    setUrl(url) {
        this.url = url;
        this.parsedUrl = nUrl.parse(this.url, true);
        this.originUrl = this.originUrl || this.url;

        this.pathname = this.parsedUrl.pathname;
        this.query = this.parsedUrl.query;
        this.search = this.parsedUrl.search;
        this.params = {};

        this.paths = _.concat(['/'], _.filter(this.pathname.split('/'), item => item !== ''));

        return this;
    }

    hook(name, fn) {
        if (!this.hooks[name]) {
            this.hooks[name] = [];
        }

        this.hooks[name].push(fn);
        return this;
    }

    emitHook(name) {
        let args = Array.prototype.slice.apply(arguments).slice(1);
        let fnItems = this.hooks[name];
        if (_.isEmpty(fnItems)) {
            return Promise.resolve();
        }

        return Promise.each(fnItems, item => {
            return item.apply(this, [this, ...args]);
        });
    }

    pass(node) {
        let index = _.findIndex(this.paths, item => node.isMatch(item));
        if (index === -1) {
            return this;
        }

        let path = _.pullAt(this.paths, index)[0];
        let params = node.extractParams(path);
        if (params) {
            this.params[node.name] = params;
        }

        return this;
    }

    setHeader(name, value, cover) {
        if (this.finished) {
            return;
        }

        if (cover) {
            return this._res.setHeader(name, value);
        }

        let exists = this._res.getHeader(name);
        if (_.isEmpty(exists)) {
            return this._res.setHeader(name, value);
        }

        if (!_.isArray(exists)) {
            exists = [exists];
        }
        exists.push(value);

        return this._res.setHeader(name, exists);
    }

    redirect(statusCode, url) {
        if (_.isUndefined(url)) {
            url = statusCode;
            statusCode = 302;
        }

        this._res.writeHead(statusCode, {
            'location': url,
            'content-type': 'text/plain'
        });

        return this.end();
    }

    end() {
        if (this.finished) {
            return Promise.resolve();
        }

        this.status = STATUS.FINISHED;

        let args = Array.prototype.slice.call(arguments);
        return this.emitHook('pre-res-end', ...args).then(() => {
            this._res.end.apply(this._res, args);
            return this.emitHook('post-res-end');
        });
    }

    html(s) {
        this.setHeader('content-type', 'text/html; charset=UTF-8');
        return this.end(s);
    }

    _start() {
        this.status = STATUS.SERVICING;
        this.setUrl(this._req.url);

        return Promise.resolve();
    }

    _init() {
        this.hooks = {};

        this.method = this._req.method;
        this.httpVersion = this._req.httpVersion;
        this.headers = this._req.headers;

        // url relate begin
        this.url = '';
        this.parsedUrl = null;
        this.originUrl = '';
        this.pathname = '';
        this.query = {};
        this.search = '';
        this.params = {};
        this.paths = [];
        // url relate end 

        this.status = STATUS.INITIALIZED;

        this._res.on('close', () => {
            this.statusCode = 499;
            this.statusMessage = 'Connection Closed';
            this.end();
        });
    }

    get statusCode() {
        return this._res.statusCode;
    }

    set statusCode(code) {
        this._res.statusCode = code;
    }

    get statusMessage() {
        return this._res.statusMessage;
    }

    set statusMessage(msg) {
        this._res.statusMessage = msg;
    }

    get reqState() {
        return _.pick(this._req.readableState, ['ended']);
    }

    get finished() {
        return this.status === STATUS.FINISHED || this._res.finished;
    }
}

exports = module.exports = Context;
