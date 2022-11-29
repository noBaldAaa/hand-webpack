class Chunk {
  constructor(entryModule) {
    this.entryModule = entryModule; //此代码的入口模块
    this.async = entryModule.async; //同步还是异步
    this.name = entryModule.name; //代码块的名称 main
    this.files = []; //这个代码生成了哪些文件
    this.modules = []; //这个代码块包含了哪些模块
  }
}

module.exports = Chunk;
