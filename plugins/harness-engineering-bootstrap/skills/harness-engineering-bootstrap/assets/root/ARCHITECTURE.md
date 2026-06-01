# {{project_name}} Architecture Map

本文件是人工整理后的详细架构地图。`docs/generated/**` 只提供导航索引，不能替代本文件、源码、运行态验证或测试。

## Repository Shape

- topology：`{{topology}}`
- implementation surfaces：`{{implementation_surfaces}}`
- primary languages / frameworks：`{{tech_signals}}`

## Context Entry Points

{{context_entry_points}}

## Directory Map

{{detailed_directory_map}}

## Implementation Paths

### Backend

{{backend_path}}

### Frontend

{{frontend_path}}

### Mobile / Other Clients

{{mobile_path}}

### Data / Scripts

{{data_path}}

## Domain Map

{{domain_map}}

## Architecture Invariants / Check Rules

- Controller/router/page 层不应直接绕过 service/domain 层访问底层数据，除非项目架构明确允许。
- 用户可见 UI 文案不得出现 TODO、mock、placeholder、待开发、开发中、测试文案、这里填写等未清理内容。
- 新数据表、统计、导入导出和后台查询默认考虑权限边界、租户/组织/用户隔离和审计追踪；不适用时写明原因。
- 业务实现前先看本文件和相关 generated 索引，再回到源码确认。

## Startup And Verification

{{verification_entry_points}}

## Known Gaps

- TODO：bootstrap 后由 `harness-navigate` 或人工继续补充真实模块关系。
