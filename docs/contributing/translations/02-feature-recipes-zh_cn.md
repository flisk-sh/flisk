# 2. 按照改动类型的指南操作

> 本页是 [02-feature-recipes.md](../02-feature-recipes.md) 的翻译。如有差异，以英文版为准。

这些指南只是起点。如果找不到某个文件，请在仓库中搜索命令、配置项或生成的文件名，并在 issue 中提问。

## 修改 CLI 命令

1. 在 `cli/src/commands/` 下找到该命令。
2. 在 `cli/src/commands/__tests__/` 下或其源文件旁边查找它的测试。
3. 做最小的改动，修复问题或添加选项。
4. 如果命令或其选项对用户可见，更新 `cli/README.md`。
5. 在仓库根目录运行 `bun run typecheck`、`bun run lint` 和 `bun run test`。

对于前端框架，请遵循专门的[前端 provider 指南](../../frontend-framework-providers.md)。它说明了 React/Vue provider 的边界、引擎模板、兼容性检查和 PR 清单。

## 添加数据库或基础设施工具

首先确定你要添加的是什么：

- **服务使用的数据库**可能会影响服务 manifest、数据库 URL 生成、迁移设置和就绪检查。
- **共享的本地工具**（例如 Redis 或 NATS）可能会影响可选功能配置、生成的 Compose 文件、Tilt 资源注册、依赖项和健康检查。

把现有代码当作地图来使用：

1. 从 `engine/topologies/tilt/resources/infra-loader.star` 开始，了解共享基础设施如何被加载和注册。
2. 查看 `engine/topologies/tilt/resources/databases.star` 中的数据库生命周期示例，以及 `engine/topologies/platform/docker/compose/` 中的 Compose 生成代码。
3. 找到相关的功能或 manifest 设置，并沿着它找到验证和启用的位置。用 `rg` 搜索设置名称。
4. 跟踪完整的生命周期：配置、生成的文件、启动顺序、健康/就绪状态、环境变量或机密、关闭/清理，以及工具被禁用时会发生什么。
5. 为你修改的行为添加检查。CLI 和 Starlark 生成器的测试位于 `cli/src/commands/__tests__/`，Python 引擎测试位于 `tests/tilt-engine/`。
6. 更新面向用户的功能或 CLI 文档，例如 `docs/FEATURES.md` 或 `cli/README.md`。

不要假设新工具需要上面所有的文件。请遵循与你的功能最接近的现有实现，并保持共享服务的行为正常。

## 不使用 Docker 尝试 Starlark 改动

只要安装了 Tilt，就可以运行任何引擎函数并查看其输出。在仓库根目录创建 `try.Tiltfile`（该文件被 git 忽略）：

```python
load("engine/topologies/platform/docker/compose/compose.star", "generate_backend_compose_entry")

manifest = {"appType": "backend", "stack": "shop", "port": 4000, "appName": "orders-api"}
resource = {"name": "orders-api", "_resource_path": "services/shop/orders-api"}
manifest["_resource_path"] = resource["_resource_path"]

entry = generate_backend_compose_entry("services/shop", "orders-api", resource, manifest)
fail("OUTPUT\n" + entry)  # fail() 是 Tiltfile 在不使用 Docker 的情况下打印字符串的方式
```

```bash
tilt alpha tiltfile-result -f try.Tiltfile
```

生成的 Compose 条目会在 `Error in fail: OUTPUT` 之后打印。`load()` 中的路径相对于 Tiltfile，因此请把它保存在仓库根目录。修改 manifest、再次运行并比较结果。`cli/src/commands/__tests__/` 中的 Starlark 测试（例如 `stack-routers.test.ts`）也是用同样的方式检查生成器输出的；添加测试时可以复制其中一个。

## 修改引擎或服务发现

1. 对于 Tilt 资源编排，从 `engine/topologies/tilt/resources/` 开始。
2. 对于 Docker、网络或持久化状态，从 `engine/topologies/platform/` 开始。
3. 对于 manifest 扫描和依赖图，从 `discovery/` 开始。
4. 搜索受影响的输出文件或 manifest 字段，找到其生成器和测试。CLI 测试包含 Starlark 生成器检查。
5. 检查现有的 manifest 和生成的项目是否仍然正常工作。行为改变时，更新 schema、示例或 CLI 文档。
6. 如果改动涉及契约或多个模块，请先编写 [OpenSpec 提案](01-first-change-zh_cn.md#何时编写变更提案)。

`engine/AGENTS.md` 以及其他 `AGENTS.md` 文件是面向智能体的工作笔记。它们有助于解释本地代码，但在把它们当作产品文档使用之前，请先对照当前源码和测试检查其路径和建议。

## 修改文档

1. 找到最接近的现有页面并更新它，而不是另建副本。
2. 使用简短的标题、编号步骤和可直接复制的命令。
3. 检查你所编辑文件中的相对链接。
4. 只运行相关的检查。对于仅涉及文档的改动，检查你修改过的链接和命令即可，无需运行 CLI 测试套件。
