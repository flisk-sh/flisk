# 第一次为 TDK 做贡献

[English](../README.md) | 简体中文 | [繁體中文](README-zh_tw.md) | [日本語](README-ja.md) | [한국어](README-ko.md)

> 本页是 [docs/contributing/README.md](../README.md) 的翻译。如有差异，以英文版为准。

你不需要了解整个仓库。选一个小改动，按照对应的指南操作；如果某一步不清楚，可以在 issue 中提问。

<p align="center">
  <img src="../assets/contribution-path.svg" alt="四个步骤：找到任务、做一个改动、检查、提交 pull request" width="720" />
</p>

## 选择最接近的项目

| 我想…… | 从这里开始 |
|---|---|
| 修复 CLI 命令或添加选项 | [CLI 指南](02-feature-recipes-zh_cn.md#修改-cli-命令) |
| 添加 Vue 之类的前端框架 | [前端 provider 指南](../../frontend-framework-providers.md) |
| 添加数据库或基础设施工具 | [数据库与工具指南](02-feature-recipes-zh_cn.md#添加数据库或基础设施工具) |
| 修改 TDK 发现服务或生成配置的方式 | [引擎与发现指南](02-feature-recipes-zh_cn.md#修改引擎或服务发现) |
| 修正文字、链接或拼写 | [文档指南](02-feature-recipes-zh_cn.md#修改文档) |
| 无需代码，试用 TDK 或示例并告诉我们结果 | [试用并报告](try-and-report-zh_cn.md) |
| 无需代码，查找并报告 bug | [查找 bug](../finding-bugs.md) |
| 审查别人的 pull request | [审查 PR](04-review-a-pr-zh_cn.md) |

## 完整流程

1. [准备仓库](01-first-change-zh_cn.md)。
2. 做一个聚焦的改动。遇到困难可以寻求帮助。
3. 运行与你的改动相匹配的检查。指南会说明需要哪些检查。
4. [提交 pull request](03-open-a-pr-zh_cn.md)，并说明你检查过的内容。
5. [审查其他 pull request](04-review-a-pr-zh_cn.md)。每个 PR 上的 AI 按钮可以提供第一轮审查。

**不确定代码在哪里？** 在仓库中搜索你看到的命令、配置项、生成的文件名或服务名，然后找到它的测试。仍然不确定的话，请先开一个 issue 再进行大的改动。

**要修改面向用户的契约或 TDK 的多个部分？** 编码前先遵循 [OpenSpec 指南](01-first-change-zh_cn.md#何时编写变更提案)。小的拼写和文档修正不需要提案。

## 需要帮助？

请写明你尝试了什么、期望什么、实际发生了什么，然后[开一个 issue](https://github.com/tdk-landscape/tdk-cli-core/issues/new/choose)。提问前不必先解决问题。
