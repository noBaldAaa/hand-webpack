const {
  AsyncSeriesHook,
  SyncBailHook,
  AsyncParallelHook,
  SyncHook,
} = require("tapable");
const NormalModuleFactory = require("./NormalModuleFactory");
const Compilation = require("./Compilation");
const Stats = require("./Stats");
const mkdirp = require("mkdirp"); //递归的创建新的文件夹
const path = require("path");

class Compiler {
  constructor(context) {
    this.context = context;
    this.hooks = {
      entryOption: new SyncBailHook(["context", "entry"]), //context 是项目根目录的绝对路径 entry是入口文件路径
      beforeRun: new AsyncSeriesHook(["compiler"]), //运行前
      run: new AsyncSeriesHook(["compiler"]), //运行
      beforeCompile: new AsyncSeriesHook(["params"]), //编译前
      compile: new SyncHook(["params"]), //编译
      make: new AsyncParallelHook(["compilation"]), //异步并行钩子 make构建
      thisComplation: new SyncHook(["compilation", "params"]), //开始一次新的编译
      complation: new SyncHook(["compilation", "params"]), //创建完成一个欣的compilation
      afterCompile: new AsyncSeriesHook(["compilation"]), //编译完成
      emit: new AsyncSeriesHook(["compilation"]), //发射或者说写入文件
      done: new AsyncSeriesHook(["stats"]), //所有的编译全部完成
    };
  }

  emitAssets(compilation, callback) {
    let outputPath = this.options.output.path; //dist
    console.log(outputPath, "outputPath");
    //把chunk变成文件，写入硬盘
    const emitFiles = (err) => {
      const assets = compilation.assets;
      for (let file in assets) {
        let source = assets[file]; //拿到模块内容
        // /Users/ethan/Desktop/学习/手写webpack/dist/main.js
        let targetPath = path.posix.join(outputPath, file); //是输出文件的绝对路径
        this.outputFileSystem.writeFileSync(targetPath, source, "utf8");
      }
      callback();
    };

    //先出发emit的回调,在写插件的时候emit用的很多，因为它是我们修改输出内容的最后机会
    this.hooks.emit.callAsync(compilation, (err) => {
      mkdirp(outputPath).then(emitFiles); //dist
    });
  }

  run(callback) {
    console.log("开始编译，执行Compiler中的run方法");

    const onCompiled = (err, compilation) => {
      this.emitAssets(compilation, (err) => {
        //先收集编译信息 chunks entries modules files
        let stats = new Stats(compilation);
        //再触发done这个钩子执行
        this.hooks.done.callAsync(stats, (err) => {
          //这是编译完成后最终的回调函数;
          callback(err, stats);
        });
      });
      // finalCallback(err, new Stats(compilation));
    };

    //先执行beforeRun的钩子，执行完之后再执行run钩子
    this.hooks.beforeRun.callAsync(this, (err) => {
      this.hooks.run.callAsync(this, (err) => {
        this.compile(onCompiled);
      });
    });
  }

  compile(onCompiled) {
    const params = this.newCompilationParams();
    //编译前先执行beforeCompile钩子
    this.hooks.beforeCompile.callAsync(params, (err) => {
      //执行完beforeCompile钩子后，再执行compile钩子
      this.hooks.compile.call(params);
      //创建一个新的compilation对象
      const compilation = this.newCompilation(params);
      //触发make钩子的回调函数执行
      this.hooks.make.callAsync(compilation, (err) => {
        console.log("make完成");
        //封装代码块之后编译就完成了
        compilation.seal((err) => {
          //触发编译完成的钩子
          this.hooks.afterCompile.callAsync(compilation, (err) => {
            onCompiled(err, compilation);
          });
        });
      });
    });
  }

  createCompilation() {
    return new Compilation(this);
  }

  newCompilation(params) {
    const compilation = this.createCompilation();
    this.hooks.thisComplation.call(compilation, params);
    this.hooks.complation.call(compilation, params);
    return compilation;
  }

  newCompilationParams() {
    const params = {
      normalModuleFactory: new NormalModuleFactory(), //在创建compilation之前已经建了一个普通模块工厂
    };
    return params;
  }
}

module.exports = Compiler;
