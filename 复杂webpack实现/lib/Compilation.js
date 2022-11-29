const { SyncHook } = require("tapable");
const NormalModuleFactory = require("./NormalModuleFactory");
const Parser = require("../Parser");
const path = require("path");
const async = require("neo-async");
const Chunk = require("./Chunk");
const ejs = require("ejs");
const fs = require("fs");

//拿到main模版
// const mainTemplate = fs.readFileSync(
//   path.join(__dirname, "template", "async_main.ejs"),
//   "utf8"
// );
const mainTemplate = fs.readFileSync(
  path.join(__dirname, "template", "mainDeferTemplate.ejs"),
  "utf8"
);

//拿到异步加载模块
const chunkTemplate = fs.readFileSync(
  path.join(__dirname, "template", "chunk.ejs"),
  "utf8"
);

const mainRender = ejs.compile(mainTemplate);
const chunkRender = ejs.compile(chunkTemplate);

const normalModuleFactory = new NormalModuleFactory();
const parser = new Parser();

class Compilation {
  constructor(compiler) {
    this.compiler = compiler;
    this.options = compiler.options;
    this.context = compiler.context;
    this.inputFileSystem = compiler.inputFileSystem; //读取文件模块fs
    this.outputFileSystem = compiler.outputFileSystem; //写入文件的模块fs
    this.entries = []; //入口模块的数组，这里放着所有的入口模块
    this.modules = []; //模块的数组，这里放着所有的模块
    this.chunks = []; //这里放着所有的代码块
    this.files = []; //这里放着本次编译所有的产出的文件名
    this.assets = {}; //存放着生成资源 key是文件名 value是文件的内容
    this.vendors = []; //存放第三方模块
    this.commons = []; //不在node_modules,但调用次数大于1的模块
    this.commonsCountMap = {}; //key 是模块id，value是{ count: 1, module } 用来计算该模块被引用了多少次，方便后面做代码分割
    // this._modules = {}; //key是模块ID,值是模块的源代码对象
    this.hooks = {
      succeedModule: new SyncHook(["module"]),
      seal: new SyncHook(), //封装开始
      beforeChunks: new SyncHook(), //生成代码块之前
      afterChunks: new SyncHook(), //生成代码块之后
    };
  }
  /**
   * 开始编译一个新的入口
   * @param {*} context  根目录
   * @param {*} entry 入口模块的相对路径 ./src/index.js
   * @param {*} name  入口的名字 main
   * @param {*} finalCallback 编译完成的回调
   */
  addEntry(context, entry, name, finalCallback) {
    this._addModuleChain(context, entry, name, false, (err, module) => {
      finalCallback(err, module);
    });
  }

  _addModuleChain(context, rawRequest, name, async, callback) {
    this.createModule(
      {
        name,
        context,
        rawRequest, //入口的相对路径 也就是entry
        resource: path.posix.join(context, rawRequest), //入口的绝对路径
        parser,
        moduleId:
          "./" +
          path.posix.relative(context, path.posix.join(context, rawRequest)), // ./src/index.js
        async,
      },
      (entryModule) => this.entries.push(entryModule),
      callback
    );
  }

  /**
   * 创建并编译一个模块
   * @param {*} data  要编译的模块信息
   * @param {*} addEntry //可选的增加入口的方法 如果这个模块是入口模块就this.entries.push，如果不是就什么都不做
   * @param {*} callback 编译完之后可以调用callback回调
   */
  createModule(data, addEntry, callback) {
    //通过模块工厂创建一个模块
    let module = normalModuleFactory.create(data);

    //   this._modules[module.moduleId] = module; //保存一下对应的信息

    addEntry && addEntry(module); //如果是入口模块就给入口模块数组添加一个模块
    this.modules.push(module); //给普通模块数组添加一个模块 入口模块也属于普通模块

    const afterBuild = (err, module) => {
      //编译依赖的模块 如果模块的依赖大于0，说明有依赖
      if (module.dependencies.length > 0) {
        this.processModuleDependencies(module, (err) => {
          callback(err, module);
        });
      } else {
        //如果没有依赖
        return callback(err, module);
      }
    };

    //开始编译模块 编译完之后调用afterBuild
    this.buildModule(module, afterBuild);
  }

  processModuleDependencies(module, callback) {
    let dependencies = module.dependencies; //1.先获取当前模块的依赖模块
    //遍历依赖模块，全部开始编译，当所有的依赖模块全部编译完成后才调用callback
    async.forEach(
      dependencies,
      (dependencie, done) => {
        let { name, context, rawRequest, resource, moduleId } = dependencie;
        this.createModule(
          {
            name,
            context,
            rawRequest,
            resource,
            parser,
            moduleId,
          },
          null, //走到这里就不是入口模块了，因此传null
          done
        );
      },
      callback
    );
  }

  /**
   * 编译模块
   * @param {*} module 要编译的模块
   * @param {*} afterBuild 编译完成后的回调
   */
  buildModule(module, afterBuild) {
    // 模块真正的编辑逻辑其实是放在module内部完成的 this就是Compilation
    module.build(this, (err) => {
      //走到这里意味着一个module模块已经编译完成了
      this.hooks.succeedModule.call(module);
      afterBuild(err, module);
    });
  }

  seal(callback) {
    this.hooks.seal.call();
    this.hooks.beforeChunks.call(); //开始准备生成代码块

    for (const module of this.modules) {
      //循环modules 如果该模块是node_modules中的，就直接放到vendors中去
      if (/node_modules/.test(module.moduleId)) {
        module.name = "vendors";
        this.vendors.push(module);
      } else {
        //如果是我们自己开发的模块
        //如果之前已经加载过该模块，就增加该模块的count，表示被引用次数+1
        if (this.commonsCountMap[module.moduleId]) {
          this.commonsCountMap[module.moduleId].count++;
        } else {
          //如果是第一次加载该模块，就在commonsCountMap中设置初始值
          this.commonsCountMap[module.moduleId] = { count: 1, module };
        }
      }
    }
    //遍历我们我们自己开发的模块
    for (let moduleId in this.commonsCountMap) {
      const moduleCount = this.commonsCountMap[moduleId]; //拿到每个模块的被引用次数
      let { module, count } = moduleCount;
      if (count >= 2) {
        //如果被引用次数超过两次，就放到commons中去
        module.name = "commons";
        this.commons.push(module);
      }
    }
    let excludeModuleIds = [...this.vendors, ...this.commons].map(
      (item) => item.moduleId
    );
    //找出剩余的模块，此时this.modules中排出了vendors和commons
    this.modules = this.modules.filter(
      (item) => !excludeModuleIds.includes(item.moduleId)
    );

    //循环入口模块，一般来说，默认情况下，每一个入口生成一个代码块
    for (const entryModule of this.entries) {
      const chunk = new Chunk(entryModule);
      this.chunks.push(chunk);
      //对所有模块进行过滤，找出来那些名称跟这个chunk一样的模块，组成一个数组赋给chunk.modules
      chunk.modules = this.modules.filter(
        (module) => module.name === chunk.name
      );
    }

    if (this.vendors.length) {
      const chunk = new Chunk(this.vendors[0]);
      chunk.async = true; //设置为异步 单独打包成一个chunk
      this.chunks.push(chunk);
      chunk.modules = this.vendors;
    }
    if (this.commons.length) {
      const chunk = new Chunk(this.commons[0]);
      chunk.async = true;
      this.chunks.push(chunk);
      chunk.modules = this.commons;
    }

    this.hooks.afterChunks.call(this.chunks);
    this.createChunkAssets(); //生成代码块之后，要生成代码块对应资源
    callback();
  }

  createChunkAssets() {
    for (let i = 0; i < this.chunks.length; i++) {
      const chunk = this.chunks[i];
      const file = chunk.name + ".js"; //拿到文件名
      chunk.files.push(file);
      let source;
      if (chunk.async) {
        source = chunkRender({
          chunkName: chunk.name, // 异步代码块
          modules: chunk.modules,
        });
      } else {
        let deferredChunks = [];
        if (this.commons.length) deferredChunks.push("commons");
        if (this.vendors.length) deferredChunks.push("vendors");
        source = mainRender({
          entryId: chunk.entryModule.moduleId,
          modules: chunk.modules,
          deferredChunks,
        });
      }

      this.emitAssets(file, source);
    }
  }

  emitAssets(file, source) {
    this.assets[file] = source;
    this.files.push(file);
  }
}
module.exports = Compilation;
