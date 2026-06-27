# Table.vue

`Table.vue` 是 `table.tsx` 的 Vue 版本实现，保持了原表格的核心行为，并把 `ink` 替换成了 `@vue-tui/runtime`。

这次接口也按 Vue 的习惯做了调整：

- 不再通过 `header`、`cell`、`skeleton` 这类组件 props 传渲染器
- 改为使用具名插槽来自定义表头、单元格和边框

## 功能

- `data`：表格数据
- `columns`：可选，显式指定列顺序
- `padding`：单元格左右留白
- `header` 插槽：自定义表头单元格
- `cell` 插槽：自定义数据单元格
- `skeleton` 插槽：自定义边框和分隔符

## 基本用法

```vue
<template>
  <Table :data="rows" :columns="columns" :padding="1" />
</template>

<script setup lang="ts">
import Table from "./Table.vue";

const columns = ["name", "age", "active"];

const rows = [
  { name: "Alice", age: 18, active: true },
  { name: "Bob", age: 24, active: false },
];
</script>
```

如果不传 `columns`，组件会自动从 `data` 中收集列：

```vue
<template>
  <Table :data="rows" />
</template>

<script setup lang="ts">
import Table from "./Table.vue";

const rows = [
  { name: "Alice", age: 18 },
  { name: "Bob", age: 24, city: "Shanghai" },
];
</script>
```

## 插槽用法

### `header` 插槽

用于自定义表头单元格。

插槽参数：

- `text`：已经按列宽补齐后的最终文本
- `column`：当前列名
- `columnIndex`：当前列下标
- `width`：当前列宽

示例：

```vue
<template>
  <Table :data="rows">
    <template #header="{ text }">
      <Text color="yellow" bold>{{ text.toUpperCase() }}</Text>
    </template>
  </Table>
</template>

<script setup lang="ts">
import { Text } from "@vue-tui/runtime";
import Table from "./Table.vue";

const rows = [{ name: "Alice", age: 18 }];
</script>
```

### `cell` 插槽

用于自定义数据单元格。

插槽参数：

- `text`：已经按列宽补齐后的最终文本
- `value`：当前单元格原始值
- `column`：当前列名
- `columnIndex`：当前列下标
- `width`：当前列宽
- `row`：当前行对象
- `rowIndex`：当前行下标

示例：

```vue
<template>
  <Table :data="rows">
    <template #cell="{ text, column, value }">
      <Text v-if="column === 'active'" :color="value ? 'green' : 'red'">
        {{ value ? " YES " : " NO  " }}
      </Text>
      <Text v-else>{{ text }}</Text>
    </template>
  </Table>
</template>

<script setup lang="ts">
import { Text } from "@vue-tui/runtime";
import Table from "./Table.vue";

const rows = [
  { name: "Alice", age: 18, active: true },
  { name: "Bob", age: 24, active: false },
];
</script>
```

### `skeleton` 插槽

用于自定义边框、分隔符和竖线。

插槽参数：

- `text`：当前要输出的边框文本
- `kind`：所在行类型，可能值为 `top`、`header`、`separator`、`data`、`bottom`
- `part`：当前边框片段类型，可能值为 `left`、`line`、`cross`、`right`

示例：

```vue
<template>
  <Table :data="rows">
    <template #skeleton="{ text }">
      <Text bold color="cyan">{{ text }}</Text>
    </template>
  </Table>
</template>

<script setup lang="ts">
import { Text } from "@vue-tui/runtime";
import Table from "./Table.vue";

const rows = [{ name: "Alice", age: 18 }];
</script>
```

## Props

| 属性      | 类型                                                                 | 默认值             | 说明           |
| --------- | -------------------------------------------------------------------- | ------------------ | -------------- |
| `data`    | `Record<string, string \| number \| boolean \| null \| undefined>[]` | 必填               | 表格数据       |
| `columns` | `string[]`                                                           | 从 `data` 自动推导 | 需要显示的列   |
| `padding` | `number`                                                             | `1`                | 单元格左右留白 |

## 默认行为

- 列宽取表头长度和该列最长内容长度中的最大值
- 单元格内容会根据 `padding` 自动补足左右空白
- `null` 和 `undefined` 会按空单元格处理
- 顶边框、行分隔线和底边框会自动生成
