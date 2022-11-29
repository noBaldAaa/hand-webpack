/**
 * 描述本次打包的结果
 */

class Stats {
  constructor(compilation) {
    this.entries = compilation.entries; //入口
    this.modules = compilation.modules; //模块
    this.chunks = compilation.chunks; //代码块
    this.files = compilation.files; //文件名数组
  }

  toJson() {
    return this;
  }
}

module.exports = Stats;
