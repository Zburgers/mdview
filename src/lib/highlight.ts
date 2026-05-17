export function highlightText(root: HTMLElement, query: string): void {
  clearHighlights(root);

  const needle = query.trim();
  if (!needle) {
    return;
  }

  const matcher = new RegExp(escapeRegExp(needle), "gi");
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.textContent?.match(matcher)) {
        return NodeFilter.FILTER_REJECT;
      }
      if (node.parentElement?.closest("script, style, mark")) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  const nodes: Text[] = [];
  while (walker.nextNode()) {
    nodes.push(walker.currentNode as Text);
  }

  for (const node of nodes) {
    const fragment = document.createDocumentFragment();
    const text = node.textContent ?? "";
    let lastIndex = 0;
    matcher.lastIndex = 0;

    for (const match of text.matchAll(matcher)) {
      const index = match.index ?? 0;
      if (index > lastIndex) {
        fragment.append(document.createTextNode(text.slice(lastIndex, index)));
      }

      const mark = document.createElement("mark");
      mark.textContent = match[0];
      fragment.append(mark);
      lastIndex = index + match[0].length;
    }

    if (lastIndex < text.length) {
      fragment.append(document.createTextNode(text.slice(lastIndex)));
    }

    node.replaceWith(fragment);
  }
}

function clearHighlights(root: HTMLElement): void {
  root.querySelectorAll("mark").forEach((mark) => {
    mark.replaceWith(document.createTextNode(mark.textContent ?? ""));
  });
  root.normalize();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
