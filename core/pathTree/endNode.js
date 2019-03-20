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

    async handle(type, ctx) {
        let handler = this.endpoint().handler[type];

        if (!_.isFunction(handler)) {
            if (type === 'OPTIONS') {
                ctx.end(_.keys(this.handler).join(', '));
                return;
            }

            return 405;
        }

        return await handler.apply(ctx, [ctx]);
    }

    async process(type, ctx) {
        let ret = await super.process(type, ctx);
        if (ret.type !== 'continue') {
            return ret;
        }

        ret = await this.handle(type, ctx);

        logger.debug(this.name, 'handle result', ret);
        return Promise.resolve({
            type: 'done',
            result: ret
        });
    }

    toString() {
        let s = super.toString();
        let methods = _.keys(this.handler).join(', ');

        return s.replace(/\/(.*?)$/g, '$1') + ': ' + methods;
    }
};
