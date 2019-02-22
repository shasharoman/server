const TreeNode = require('./treeNode');
const logger = require(process.env.lib).logger;

exports = module.exports = class EndNode extends TreeNode {
    constructor(name) {
        super(name);

        this.handler = {};
    }

    canMountOthers() {
        return false;
    }

    addHandler(type, handler) {
        this.endpoint().handler[type] = handler;

        return this;
    }

    handle(type, ctx) {
        let handler = this.endpoint().handler[type];

        if (!_.isFunction(handler)) {
            if (type === 'OPTIONS') {
                ctx.end(_.keys(this.handler).join(', '));
                return Promise.resolve();
            }

            return Promise.resolve(405);
        }

        return handler.apply(ctx, [ctx]);
    }

    process(type, ctx) {
        return super.process(type, ctx).then(result => {
            if (result.type !== 'continue') {
                return Promise.resolve(result);
            }

            return this.handle(type, ctx).then(result => {
                logger.debug(this.name, 'handle result', result);

                return Promise.resolve({
                    type: 'done',
                    result: result
                });
            });
        });
    }

    toString() {
        let s = super.toString();
        let methods = _.keys(this.handler).join(', ');

        return s.replace(/\/(.*?)$/g, '$1') + ': ' + methods;
    }
};
