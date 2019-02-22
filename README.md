README
======

my own server, do what I think is reasonable.

将server抽象成一棵树，每个request对应树中唯一的一条节点路径，路径中的每个树节点按序分阶段（convert, redirect, intercept, handle, finish）进行处理，最终得到响应结果，完成一次请求

[document](./doc/index.md)
--------------------------
