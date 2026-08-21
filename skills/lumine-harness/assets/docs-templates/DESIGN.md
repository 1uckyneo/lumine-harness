---
slug: ""
source_draft: ""
prototype_mode: html
design_status: draft
approved_at: ""
approved_by: ""
approved_scope: ""
visual_direction_images: []
selected_visual_direction: ""
prototypes:
  - id: main
    title: ""
    app_route: ""
    prototype: prototypes/main.html
    component_map: component-maps/main.md
    handoff: handoff/main.md
    design_data: handoff/main.design.json
    screenshots:
      - screenshots/main/desktop-main.png
---

# {{title}} DESIGN.md

## 本文件用途

页面级 `DESIGN.md` 同时承担页面设计说明、`prototypes[]` 原型索引、截图清单和 design gate。`design_status: approved` 前不得进入真实页面实现。

## Source

- core beliefs：`docs/design-docs/core-beliefs.md`
- source draft：

## Visual Theme

## Visual Direction Images

- mode：
- candidates：
- selected：
- notes：

## Colors

| Token | Usage | Value |
| --- | --- | --- |
| `--color-bg` | 页面背景 |  |
| `--color-surface` | 主内容区域 |  |
| `--color-primary` | 主操作 |  |
| `--color-danger` | 危险操作 |  |

## Typography

- 页面标题：
- 区块标题：
- 正文：
- 辅助信息：

## Layout

- 页面结构：
- 筛选/导航：
- 主内容：
- 详情/编辑：
- 批量操作：

## Components

| 原型元素 | 实现组件 | 状态 | 备注 |
| --- | --- | --- | --- |
|  |  |  |  |

## Prototype Index

所有 HTML handoff 都使用 frontmatter 中的 `prototypes[]`。单页面任务保留一个页面项，多页面任务逐页增加：

| Page ID | 页面 | 目标应用路由 | Prototype | Component Map | Handoff | Design Data | Screenshots |
| --- | --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |  |

## Interaction

- 加载：
- 空状态：
- 错误状态：
- 危险操作：
- 权限不可见/不可用：

## Do / Don't

### Do

- 保持信息层级、关键操作和状态反馈清晰。

### Don't

- 不出现占位、开发提示或代码注释式文案。
- 不用无业务意义的装饰卡片、渐变背景或营销式 hero。

## Responsive

- 桌面：
- 窄屏：
- 移动端：

## Agent Prompt Guide

后续 agent 将原型转成真实页面时必须读取本文件的 `prototypes[]`、对应 component map、`handoff/*.md` 和 `handoff/*.design.json`，保留 `approved_scope` 内的信息层级和交互路径，并按截图清单确认实现范围。
