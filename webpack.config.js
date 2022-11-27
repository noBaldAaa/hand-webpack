const path = require("path");
const {
  WebpackRunPlugin,
  WebpackDonePlugin,
  loader1,
  loader2,
} = require("./webpack");
module.exports = {
  mode: "development", //防止代码被压缩
  entry: "./src/index.js", //入口文件
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "[name].js",
  },
  devtool: "source-map", //防止干扰源文件
  plugins: [new WebpackRunPlugin(), new WebpackDonePlugin()],
  module: {
    rules: [
      {
        test: /\.js$/,
        use: [loader1, loader2],
      },
    ],
  },
  //第七步加
  resolve: {
    extensions: ["", ".js", ".jsx"],
  },
};
