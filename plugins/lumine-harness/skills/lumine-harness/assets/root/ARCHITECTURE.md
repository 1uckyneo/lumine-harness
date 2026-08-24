# {{project_name}} 架构地图

本文件描述系统结构、实现路径和架构不变量。`AGENTS.md` 负责行动入口，`docs/generated/**` 只提供导航索引；三者职责不同。

## 仓库形态

- topology：`{{topology}}`
- implementation surfaces：`{{implementation_surfaces}}`
- primary languages / frameworks：`{{tech_signals}}`

## 目录与模块关系

{{detailed_directory_map}}

## 主要实现路径

{{implementation_paths}}

## 业务域

{{domain_map}}

## 架构不变量

{{architecture_invariants}}

这里只记录从现有源码、测试、运行配置或用户确认中得到的项目事实。不为所有项目预设 Controller、Service、租户、权限、审计、导入导出或其他特定架构。

## 运行与验证入口

{{verification_entry_points}}

## 已知缺口

{{known_gaps}}
