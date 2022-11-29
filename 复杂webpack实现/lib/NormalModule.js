/**
 * 编译的逻辑
 * 1.从硬盘上把模块内容读出去，读成一个文本
 * 2.可能它不是一个JS模块，所以会可能要走loader的转换，最终肯定要得到一个JS模块代码，得不到就报错了
 * 3.把这个JS模块经过parser处理转成抽象语法书AST
 * 4.分析AST里面的依赖，也就是找require import节点，分析依赖的模块
 * 5.递归编译依赖的模块
 * 6.不停的一次递归执行上面5步，直到所有的模块都编译完成
 *
 * 非常重要的问题
 * 模块的ID的问题
 * 不管是本地模块，还是第三方的模块，最后它的moduleId全部都是一个相对于项目根目录相对路径
 * 我们自己的本地模块：./src/title.js  ./src/index.js
 * 第三方的模块id: ./node_modules/lodash/utils
 * 而且路径分隔符一定是linux系统的 / ，而非window中的 \ 使用 path.posix即可
 */

/**
 * 如何处理懒加载
 * 1.先把代码转成AST语法树
 * 2.找出动态import节点
 */

const path = require("path");
const types = require("babel-types");
const generate = require("babel-generator").default;
const traverse = require("babel-traverse").default;
const async = require("neo-async");
const { runLoaders } = require("./loader-runner");

class NormalModule {
  constructor({
    name,
    context,
    rawRequest,
    resource,
    parser,
    moduleId,
    async,
  }) {
    this.name = name;
    this.context = context;
    this.rawRequest = rawRequest;
    this.resource = resource;
    this.parser = parser; //这是一个AST解析器 可以把源代码转成AST抽象语法树
    this.moduleId = moduleId || "./" + path.posix.relative(context, resource);
    this._source; //此模块对应的源代码
    this._ast; //此模块对应的AST抽象语法树
    this.dependencies = []; //当前模块依赖的模块信息
    this.blocks = []; //当前模块依赖哪些异步模块 import(xx)语法
    this.async = async; //表示当前模块是属于一个异步代码块，还是同步代码块 默认是false
  }
  /**
   * 编译本模块
   * @param {*} compilation
   * @param {*} callback
   */
  build(compilation, callback) {
    this.doBuild(compilation, (err) => {
      //得到AST语法树 放在_ast属性中
      this._ast = this.parser.parse(this._source);
      //遍历语法树，找到里面的依赖进行收集依赖
      traverse(this._ast, {
        CallExpression: (nodePath) => {
          let node = nodePath.node; //获取节点
          if (node.callee.name === "require") {
            //如果方法名是require方法的话
            node.callee.name = "__webpack_require__"; //将源代码中的require改为__webpack_require__

            let moduleName = node.arguments[0].value; //1.模块的名称
            let depResource; //依赖的绝对路径
            //如果模块以.开头，说明是一个本地模块，或者说用户自定义模块
            if (moduleName.startsWith(".")) {
              //2.获取了可能的后缀名 如果没有后缀名则默认是.js
              let extName =
                moduleName.split(path.posix.sep).pop().indexOf(".") == -1
                  ? ".js"
                  : "";
              //3.获取依赖模块的绝对路径 得到结果：/Users/ethan/Desktop/学习/手写webpack/src/title.js
              depResource = path.posix.join(
                path.posix.dirname(this.resource),
                moduleName + extName
              );
            } else {
              //否则是一个第三方模块，也就是node_modules中的
              ///Users/ethan/Desktop/学习/手写webpack/node_modules/isarray/index.js
              depResource = require.resolve(
                path.posix.join(this.context, "node_modules", moduleName)
              );
              //防止window系统 统一转成 /
              depResource = depResource.replace(/\\/g, path.posix.sep);
            }

            //4.获取依赖的模块id => ./ + 根目录出发到依赖模块的绝对路径的相对路径
            //拿到结果：./src/title.js
            // let depModuleId =
            //   "./" + path.posix.relative(this.context, depResource);

            //原路径：/Users/ethan/Desktop/学习/手写webpack/node_modules/isarray/index.js
            //然后截取掉 /Users/ethan/Desktop/学习/手写webpack
            //然后还剩下 /node_modules/isarray/index.js 加个点拼接就是路径的
            let depModuleId = "." + depResource.slice(this.context.length);
            node.arguments = [types.stringLiteral(depModuleId)]; //把require模块路径从./title.js变成./src/title/js
            this.dependencies.push({
              name: this.name, //main
              context: this.context, //根目录
              rawRequest: moduleName, //模块的相对路径 原始路径 ./title.js
              moduleId: depModuleId, //模块ID 它是一个相对于根目录的相对路径 以 ./开头 ./src/title.js
              resource: depResource, //依赖模块的绝对路径 /Users/ethan/Desktop/学习/手写webpack/src/title.js
            });
          } else if (types.isImport(nodePath.node.callee)) {
            //判断这个节点它的callee是不是import动态导入类型
            let moduleName = node.arguments[0].value; //1.模块的名称 ./title.js
            //2.获取了可能的后缀名 如果没有后缀名则默认是.js
            let extName =
              moduleName.split(path.posix.sep).pop().indexOf(".") == -1
                ? ".js"
                : "";
            //3.获取依赖模块的绝对路径 得到结果：/Users/ethan/Desktop/学习/手写webpack/src/title.js
            let depResource = path.posix.join(
              path.posix.dirname(this.resource),
              moduleName + extName
            );
            //4.拿到结果：./src/title.js
            let depModuleId =
              "./" + path.posix.relative(this.context, depResource);

            let chunkName = "0"; //如果没有写魔法注释就是一个递增的数字
            if (
              Array.isArray(node.arguments[0].leadingComments) &&
              node.arguments[0].leadingComments.length > 0
            ) {
              let leadingComments = node.arguments[0].leadingComments[0].value; //webpackChunkName: 'title'
              let regexp = /webpackChunkName:\s*['"]([^'"]+)['"]/;
              chunkName = leadingComments.match(regexp)[1]; //拿到魔法注释 title
            }
            /**
             * 将 import(/*webpackChunkName: 'title'***)/ "./title")
             * 替换成
             *   __webpack_require__.e("title").then(__webpack_require__.t.bind(__webpack_require__, "./src/title.js", 23))
             */
            nodePath.replaceWithSourceString(
              `__webpack_require__.e("${chunkName}").then(__webpack_require__.t.bind(null,"${depModuleId}", 23))`
            );
            //该模块依赖这些异步代码块
            this.blocks.push({
              context: this.context,
              entry: depModuleId,
              name: chunkName,
              async: true, //异步的代码块
            });
          }
        },
      });

      //把转换后的语法树重新生成源代码
      let { code } = generate(this._ast);
      this._source = code;

      //遇到同步代码块，先放到dependencies中去，遇到异步代码块，先处理异步代码
      //循环构建每一个异步代码块，都构建完才会代表当前的模块编译完成
      async.forEach(
        this.blocks,
        (block, done) => {
          let { context, entry, name, async } = block;
          debugger;
          compilation._addModuleChain(context, entry, name, async, done);
        },
        callback
      );
    });
  }

  doBuild(compilation, callback) {
    //1.读取模块的源代码
    this.getSource(compilation, (err, source) => {
      // source为fs输出的结果，把最原始的代码存放在当前模块的_source属性上
      //在这里把硬盘的内容读出来，读出来之后交给loadRunner进行转换
      let {
        module: { rules },
      } = compilation.options;
      let loaders = [];
      for (let i = 0; i < rules.length; i++) {
        let rule = rules[i];
        if (rule.test.test(this.resource)) {
          let useLoaders = rule.use;
          loaders = [...loaders, ...useLoaders];
        }
      }
      //loader的绝对路径的数组
      loaders = loaders.map((loader) =>
        require.resolve(path.posix.join(this.context, "loaders", loader))
      );

      runLoaders(
        {
          resource: this.resource,
          loaders,
        },
        (err, { result, resourceBuffer }) => {
          this._source = result.toString();
          callback();
        }
      );
    });
  }

  //读取真正的源代码
  getSource(compilation, callback) {
    compilation.inputFileSystem.readFile(this.resource, "utf8", callback);
  }
}

module.exports = NormalModule;
