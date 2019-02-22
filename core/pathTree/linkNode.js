const TreeNode = require('./treeNode');

exports = module.exports = class LinkNode extends TreeNode {
    constructor(name, link) {
        super(name);

        this.link = link;
    }

    endpoint() {
        return this.link.endpoint();
    }

    canTakeOver() {
        return false;
    }

    toString() {
        return this.name + '->' + this.endpoint().pathWithRoot();
    }
};
