# Kitchen sink

This document combines the renderer's supported Markdown features. Its local image lives at [sample-image.svg](./assets/sample-image.svg).

## Heading two

### Heading three

#### Heading four

##### Heading five

###### Heading six

## Heading two

Duplicate headings must receive distinct stable IDs.

## Links and image

[Relative guide](./guide.md#install) and [external guide](https://example.com/guide).

![Sample vector image](./assets/sample-image.svg)

## Lists and tasks

- Parent item
  - Nested item
  - [x] Completed task
  - [ ] Open task

1. Ordered item
   1. Nested ordered item

## Table

| Name | Value |
| :--- | ---: |
| narrow | 1 |
| wide content | `a-long-unbroken-value-for-overflow-checks` |

## Callouts and highlights

> [!WARNING]+ Read carefully
> Nested **Markdown** stays formatted.
> - First point
> - Second point

This ==text should be highlighted== in the preview.

## Footnotes

Footnotes keep their references and backlinks.[^source]

[^source]: A local footnote with **formatted text**.

## Math

Inline math: $x^2 + y^2 = z^2$.

$$
\sum_{n=1}^{\infty} \frac{1}{n^2} = \frac{\pi^2}{6}
$$

## Code

```ts
const answer: number = 42;
console.log(answer);
```

```language-that-does-not-exist
<img src=x onerror=alert(1)>
```

## Details

<details>
<summary>More information</summary>

This disclosure contains ordinary Markdown text.
</details>

## Mermaid diagrams and charts

```mermaid
flowchart TD
  A[Open] --> B[Render]
```

```mermaid
sequenceDiagram
  Reader->>mdview: Open document
  mdview-->>Reader: Safe preview
```

```mermaid
pie title Document sections
  "Content" : 7
  "Metadata" : 3
```

```mermaid
xychart-beta
  x-axis [Jan, Feb, Mar]
  y-axis "Count" 0 --> 10
  bar [2, 5, 8]
```

```mermaid
radar-beta
  axis A, B, C
  curve Reading{3, 4, 2}
```

```mermaid
sankey-beta
  Source,Reader,4
  Reader,Preview,4
```

## Hostile raw HTML

Before the hostile element.

<script>window.kitchenSinkAttack = true</script>
<img src="javascript:alert(1)" onerror="alert(1)" alt="hostile image">

After the hostile element.
