---
id: overflow-fixture
title: 宽内容阅读检查
summary: 验证代码和表格可在正文内滚动，长路径可完整阅读。
type: mechanism
status: current
locale: zh-CN
---
# 宽内容阅读检查

## 长代码

以下代码保留单行格式。左右滚动应仅作用于代码区域。

```typescript
const deliberatelyWideExample = "continuous_identifier_continuous_identifier_continuous_identifier_continuous_identifier_continuous_identifier_continuous_identifier_continuous_identifier_continuous_identifier_continuous_identifier_continuous_identifier_continuous_identifier_continuous_identifier_continuous_identifier_continuous_identifier_continuous_identifier_continuous_identifier_continuous_identifier_continuous_identifier_continuous_identifier_continuous_identifier_continuous_identifier_continuous_identifier_continuous_identifier_continuous_identifier_continuous_identifier_continuous_identifier_continuous_identifier_continuous_identifier_continuous_identifier_continuous_identifier_continuous_identifier_continuous_identifier_continuous_identifier_continuous_identifier_continuous_identifier_continuous_identifier_continuous_identifier_continuous_identifier_continuous_identifier_continuous_identifier_continuous_identifier_continuous_identifier_continuous_identifier_continuous_identifier_continuous_identifier_continuous_identifier_continuous_identifier_continuous_identifier_continuous_identifier_continuous_identifier_continuous_identifier_continuous_identifier_continuous_identifier_continuous_identifier_continuous_identifier_";
```

## 宽表格

|字段1|字段2|字段3|字段4|字段5|字段6|字段7|字段8|字段9|字段10|字段11|字段12|字段13|字段14|字段15|字段16|字段17|字段18|
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
|column_1_value_with_long_identifier|column_2_value_with_long_identifier|column_3_value_with_long_identifier|column_4_value_with_long_identifier|column_5_value_with_long_identifier|column_6_value_with_long_identifier|column_7_value_with_long_identifier|column_8_value_with_long_identifier|column_9_value_with_long_identifier|column_10_value_with_long_identifier|column_11_value_with_long_identifier|column_12_value_with_long_identifier|column_13_value_with_long_identifier|column_14_value_with_long_identifier|column_15_value_with_long_identifier|column_16_value_with_long_identifier|column_17_value_with_long_identifier|column_18_value_with_long_identifier|

## 长路径

`src/long-readable-directory-name-0/long-readable-directory-name-1/long-readable-directory-name-2/long-readable-directory-name-3/long-readable-directory-name-4/long-readable-directory-name-5/long-readable-directory-name-6/long-readable-directory-name-7/long-readable-directory-name-8/long-readable-directory-name-9/long-readable-directory-name-10/long-readable-directory-name-11/long-readable-directory-name-12/long-readable-directory-name-13/long-readable-directory-name-14/long-readable-directory-name-15/long-readable-directory-name-16/long-readable-directory-name-17/long-readable-directory-name-18/long-readable-directory-name-19/long-readable-directory-name-20/long-readable-directory-name-21/long-readable-directory-name-22/long-readable-directory-name-23/long-readable-directory-name-24/long-readable-directory-name-25/long-readable-directory-name-26/long-readable-directory-name-27/long-readable-directory-name-28/long-readable-directory-name-29/implementation-with-a-long-stable-name.ts`

## 短表格

| 项目 | 状态 |
| --- | --- |
| 正文 | 可读 |
| 来源 | 待核对 |

## 阅读完成

正文和页面操作在宽内容之后仍应可访问。
