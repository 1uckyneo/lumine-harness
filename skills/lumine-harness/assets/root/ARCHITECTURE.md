# {{project_name}} 架构地图

本文件是人工整理后的架构地图。`docs/generated/**` 只提供导航索引，不能替代本文件、源码、运行态验证或测试。

## 仓库形态

- topology：`{{topology}}`
- implementation surfaces：`{{implementation_surfaces}}`
- primary languages / frameworks：`{{tech_signals}}`

## 目录地图

{{detailed_directory_map}}

## 实现路径

### 后端

{{backend_path}}

### 前端

{{frontend_path}}

### 移动端 / 其他客户端

{{mobile_path}}

### 数据 / 脚本

{{data_path}}

## 业务域地图

{{domain_map}}

## 架构不变量

- Controller/router/page 层不应直接绕过 service/domain 层访问底层数据，除非项目架构明确允许。
- 新数据表、统计、导入导出和后台查询默认考虑权限边界、租户/组织/用户隔离和审计追踪；不适用时写明原因。
- 业务实现前先看本文件和相关 generated 索引，再回到源码确认。

## 运行面拓扑

{{verification_entry_points}}

## 已知缺口

- TODO：bootstrap 后由 `lumine-harness-navigate` 或人工继续补充真实模块关系。
