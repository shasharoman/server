const treeify = require('treeify');
const TreeNode = require('./treeNode');
const RootNode = require('./rootNode');
const EndNode = require('./endNode');
const LinkNode = require('./linkNode');
const logger = require(process.env.lib).logger;

exports = module.exports = class PathTree {
    constructor() {
        this.root = new RootNode();
    }

    makeMiddle(path) {
        if (this.exists(path)) {
            throw new Error('path already existed:\n' + this.toString() + 'exists path: ' + path);
        }

        let names = this._schemasByPath(path);
        let parentPath = _.slice(names, 0, names.length - 1).join('/') || '/';

        if (!this.exists(parentPath)) {
            this.makeMiddle(parentPath);
        }

        let node = new TreeNode(_.last(names));
        return node.mount(this.nodeByPath(parentPath));
    }

    makeEnd(path) {
        if (this.exists(path)) {
            throw new Error('path already existed:\n' + this.toString() + 'exists path:' + path);
        }

        let names = this._schemasByPath(path);
        let parentPath = _.slice(names, 0, names.length - 1).join('/') || '/';

        if (!this.exists(parentPath)) {
            this.makeMiddle(parentPath);
        }

        let node = new EndNode(_.last(names));
        return node.mount(this.nodeByPath(parentPath));
    }

    makeLink(path, targetPath) {
        if (this.exists(path)) {
            throw new Error('\n' + this.toString() + path + ' already existed.');
        }

        if (!this.exists(targetPath)) {
            throw new Error('\n' + this.toString() + targetPath + ' not existed.');
        }

        let names = this._schemasByPath(path);
        let parentPath = _.slice(names, 0, names.length - 1).join('/') || '/';

        if (!this.exists(parentPath)) {
            this.makeMiddle(parentPath);
        }

        let node = new LinkNode(_.last(names), this.nodeByPath(targetPath));
        return node.mount(this.nodeByPath(parentPath));
    }

    searchNodeList(path, skip) {
        if (!path) {
            throw new Error('path can not be empty.');
        }

        let names = this._namesByPath(path);
        let nodePath = [
            [this.root]
        ]; // all matched node-path

        let ends = [this.root];
        let remaining = _.dropWhile(names, name => {
            let matchEnds = [];

            _.each(ends, item => {
                let match = _.filter(item.endpoint().children, item => item.isMatch(name));

                nodePath = _.map(nodePath, item => {
                    let last = _.last(item);
                    let child = _.find(last.endpoint().children, item => _.includes(match, item));

                    if (_.isEmpty(child)) {
                        return [];
                    }

                    item.push(child);
                    return item;
                });
                nodePath = _.filter(nodePath, item => !_.isEmpty(item));

                matchEnds = _.concat(matchEnds, match);
            });

            ends = matchEnds;
            return !_.isEmpty(ends);
        });

        if (!_.isEmpty(remaining)) {
            return [];
        }

        nodePath = _.sortBy(nodePath, item => _.sumBy(item, one => one.matchPriority()));

        let result = _.last(nodePath);
        if (_.isEmpty(result)) {
            return [];
        }

        skip = skip ? this.searchNodeList(skip) : [];

        return _.filter(result, item => !_.includes(skip, item));
    }

    // keep all item's parent element in the list, except root & skiped.
    searchFullNodeList(path, skip) {
        let endpoints = _.map(this.searchNodeList(path, skip), item => {
            return item.endpoint();
        });
        skip = skip ? this.searchNodeList(skip) : [];

        return _.reduce(endpoints, (list, item) => {
            let cursor = item;
            let expand = [cursor];
            let parentInList = cursor.parent && _.find(list, one => one === cursor.parent);

            while (cursor.parent && !parentInList) {
                if (_.includes(skip, cursor.parent)) {
                    break;
                }

                expand.unshift(cursor.parent);

                cursor = cursor.parent;
                parentInList = cursor.parent && _.find(list, one => one === cursor.parent);
            }

            return list.concat(expand);
        }, []);
    }

    nodeListByPath(path) {
        if (!path) {
            throw new Error('path can not be empty.');
        }

        let names = this._namesByPath(path);
        let list = [this.root];

        _.dropWhile(names, name => {
            let exists = _.find(_.last(list).endpoint().children, item => item.name === name);

            list.push(exists);

            return !_.isEmpty(exists);
        });

        return _.isEmpty(_.last(list)) ? [] : list;
    }

    nodeByPath(path) {
        return _.last(this.nodeListByPath(path)) || null;
    }

    endpointByPath(path) {
        let node = this.nodeByPath(path);

        return _.isEmpty(node) ? null : node.endpoint();
    }

    exists(path) {
        if (!path) {
            return false;
        }

        let names = this._namesByPath(path);
        let p = this.root;

        _.dropWhile(names, name => {
            p = _.find(p.endpoint().children, item => item.name === name);

            return !_.isEmpty(p);
        });

        return !_.isEmpty(p);
    }

    searchEnd(path) {
        let node = _.last(this.searchNodeList(path));

        if (_.isEmpty(node)) {
            return false;
        }

        return !node.endpoint().canMountOthers();
    }

    addConverterByPath(path, type, converter) {
        this.nodeByPath(path).addConverter(type, converter);

        return this;
    }

    addRedirectorByPath(path, type, redirector) {
        this.nodeByPath(path).addRedirector(type, redirector);

        return this;
    }

    addInterceptorByPath(path, type, interceptor) {
        this.nodeByPath(path).addInterceptor(type, interceptor);

        return this;
    }

    addInterfererByPath(path, type, interferer) {
        this.nodeByPath(path).addInterferer(type, interferer);

        return this;
    }

    addHandlerByPath(path, type, handler) {
        this.nodeByPath(path).addHandler(type, handler);

        return this;
    }

    async process(path, type, ctx, skip) {
        let nodeList = this.searchFullNodeList(path, skip);

        return Promise.mapSeries(nodeList, async item => {
            logger.debug(item.name, 'start process');

            let ret = await item.process(type, ctx);
            logger.debug(item.name, 'process result:', ret);

            if (ret.type !== 'continue') {
                throw {
                    isBreak: true,
                    result: ret
                };
            }
        }).catch(err => {
            if (err && err.isBreak) {
                return err.result;
            }

            throw err;
        });
    }

    mount(parent) {
        this.root.mount(parent);
    }

    pathsByPath(path) {
        let start = this.nodeByPath(path);

        return _pathsOfNode(start);

        function _pathsOfNode(node) {
            if (node instanceof EndNode || node instanceof LinkNode) {
                return [node.name];
            }

            return _.flattenDeep(_.map(node.children, item => {
                return _.map(_pathsOfNode(item), one => node.toString() + one.toString());
            }));
        }
    }

    toString() {
        return treeify.asTree(_toObject(this.root));

        function _toObject(node) {
            let tmp = {};

            if (_.isEmpty(node.children)) {
                tmp[node.toString()] = null;
                return tmp;
            }

            tmp[node.toString()] = {};
            _.each(node.children, item => {
                tmp[node.toString()] = _.assign(tmp[node.toString()], _toObject(item));
            });

            return tmp;
        }
    }

    _namesByPath(path) {
        if (!path) {
            return [];
        }

        return _.map(_.filter(path.split('/'), item => item !== ''), item => {
            return item.replace(/(.*):.*/g, '$1');
        });
    }

    _schemasByPath(path) {
        if (!path) {
            return [];
        }

        return _.filter(path.split('/'), item => item !== '');
    }
};
