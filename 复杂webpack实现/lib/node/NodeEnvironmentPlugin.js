let fs = require("fs");

class NodeEnvironmentPlugin {
  constructor(options) {
    this.options = options || {};
  }

  apply(compiler) {
    compiler.inputFileSystem = fs; //读文件用哪个模块 fs.readFile
    compiler.outputFileSystem = fs; //写文件用哪个模块 fs.writeFile
  }
}

module.exports = NodeEnvironmentPlugin;
