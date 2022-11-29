const SingleEntryPlugin = require("./SingleEntryPlugin");

class EntryOptionPlugin {
  apply(compiler) {
    compiler.hooks.entryOption.tap("EntryOptionPlugin", (context, entry) => {
      if (typeof entry == "string") {
        //单入口插件
        new SingleEntryPlugin(context, entry, "main").apply(compiler);
      } else {
        // 处理多入口
        for (let entryName in entry) {
          new SingleEntryPlugin(context, entry[entryName], entryName).apply(
            compiler
          );
        }
      }
    });
  }
}

module.exports = EntryOptionPlugin;
