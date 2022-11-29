const babylon = require("babylon");

class Parser {
  parse(source) {
    return babylon.parse(source, {
      sourceType: "module", //表示源代码是一个模块
      plugins: ["dynamicImport"], //额外一个插件，用来支持 import("./title.js") 这种语法
    });
  }
}

module.exports = Parser;
