const TreeNode = require('./treeNode');

exports = module.exports = class RootNode extends TreeNode {
    constructor() {
        super('/');
    }

    mount(parent) {
        let endpoint = parent.endpoint();
        if (!endpoint.accept(this)) {
            throw new Error(this.toString() + ' can not mount to ' + parent.toString());
        }

        let children = this.endpoint().children;
        while (!_.isEmpty(children)) {
            children[0].mount(parent);
        }

        parent.takeOver(this);

        return parent;
    }

    nodeListByPath(path) {
        let nodeNames = _.filter(path.split('/'), item => item !== '');

        let nodeList = [this];
        let exists = true;

        _.each(nodeNames, name => {
            let child = _.find(_.last(nodeList).children, one => one.isMatch(name));
            if (!child) {
                exists = false;
                return false;
            }

            nodeList.push(child);
        });

        return exists ? nodeList : [];
    }

    nodeByPath(path) {
        return _.last(this.nodeListByPath(path));
    }

    pathForNode(node) {
        if (!node.parent) {
            return [node.name];
        }

        return _.contact(this.pathForNode(node.parent), [node.name]).join('/');
    }

    exists(path) {
        return !_.isEmpty(this.nodeByPath(path));
    }

    toString() {
        return '/';
    }
};
