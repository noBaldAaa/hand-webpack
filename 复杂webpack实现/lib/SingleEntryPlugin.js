class SingleEntryPlugin {
  constructor(context, entry, name) {
    this.context = context; //入口的上下文绝对路径
    this.entry = entry; //入口模块路径 ./src/index.js
    this.name = name; //入口的名字 main
  }

  apply(compiler) {
    //注册插件
    compiler.hooks.make.tapAsync(
      "SingleEntryPlugin",
      (compilation, callback) => {
        //callback是make钩子完成的回调事件
        const { context, entry, name } = this;
        //从此入口开始编译 编译入口文件和它的依赖
        console.log("SingleEntryPlugin make");
        //开始编译一个新的入口
        compilation.addEntry(context, entry, name, callback);
      }
    );
  }
}

module.exports = SingleEntryPlugin;
