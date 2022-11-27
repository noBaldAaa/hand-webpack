const { webpack } = require("./webpack.js"); //后面自己手写
//const { webpack } = require("webpack");
const webpackOptions = require("./webpack.config.js");
const compiler = webpack(webpackOptions);

compiler.run((err, stats) => {
  console.log(err);
  console.log(
    stats.toJson({
      assets: true, //打印本次编译产出的资源
      chunks: true, //打印本次编译产出的代码块
      modules: true, //打印本次编译产出的模块
    })
  );
});
