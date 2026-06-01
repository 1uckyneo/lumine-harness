# Drafts

`docs/drafts/` 用于把粗略想法逐步收敛成可进入 design/spec/plan 的确认版 draft。

## Draft 优化循环

```text
这个 draft 需要优化。你看我还需要交代什么上下文？还有什么决策点需要确认？
```

```text
我补充一下：…… 你继续帮我更新 draft，并告诉我还缺什么。
```

Codex 只更新当前 draft 文件，不生成 `DESIGN.md`、HTML、图片、product spec 或 active plan。

## 可选设计方向讨论

```text
我们先讨论页面设计方向。先只更新 draft，不生成设计稿。
```

这一阶段只把页面气质、信息层级、关键交互、参考对象、不要的风格、需要确认的视口和设计决策点写回 draft。

## Draft 确认

```text
这个 draft 可以进入下一步。
```

Codex 根据 draft 判断下一步：不需要设计确认的事项进入 spec/plan；需要先看页面效果的事项进入 `harness-design`。

## 设计稿生成与修改

```text
基于这个 draft 生成设计稿，先不要生成 spec/plan。
```

```text
这个设计稿需要调整：……
```

```text
设计稿确认，可以基于 draft 和设计生成 product spec 和 active exec plan，先不要实施。
```

## 开始实施

```text
按这个 active exec plan 开始实施。
```
