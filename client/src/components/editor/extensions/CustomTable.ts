import Table from '@tiptap/extension-table';
import { findParentNode } from '@tiptap/core';

export const CustomTable = Table.extend({
  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      ArrowDown: ({ editor }) => {
        const { selection } = editor.state;
        const table = findParentNode((node) => node.type.name === 'table')(selection);

        if (!table) return false;

        const tableNode = table.node;
        const lastRowIndex = tableNode.childCount - 1;

        let currentRowIndex = -1;
        let offset = table.start;

        for (let i = 0; i < tableNode.childCount; i++) {
          const row = tableNode.child(i);
          const rowStart = offset;
          const rowEnd = offset + row.nodeSize;

          if (selection.from >= rowStart && selection.from < rowEnd) {
            currentRowIndex = i;
            break;
          }
          offset = rowEnd;
        }

        if (currentRowIndex === lastRowIndex) {
          const tableEnd = table.start + table.node.nodeSize;
          const { doc } = editor.state;
          const nodeAfterTable = doc.nodeAt(tableEnd);

          if (!nodeAfterTable || nodeAfterTable.type.name !== 'paragraph') {
            editor.chain()
              .insertContentAt(tableEnd, { type: 'paragraph' })
              .setTextSelection(tableEnd + 1)
              .focus()
              .run();
          } else {
            editor.chain()
              .setTextSelection(tableEnd + 1)
              .focus()
              .run();
          }
          return true;
        }

        return false;
      },
      ArrowUp: ({ editor }) => {
        const { selection } = editor.state;
        const table = findParentNode((node) => node.type.name === 'table')(selection);

        if (!table) return false;

        const tableNode = table.node;

        let currentRowIndex = -1;
        let offset = table.start;

        for (let i = 0; i < tableNode.childCount; i++) {
          const row = tableNode.child(i);
          const rowStart = offset;
          const rowEnd = offset + row.nodeSize;

          if (selection.from >= rowStart && selection.from < rowEnd) {
            currentRowIndex = i;
            break;
          }
          offset = rowEnd;
        }

        if (currentRowIndex === 0) {
          const tableStart = table.start;

          if (tableStart > 1) {
            editor.chain()
              .setTextSelection(tableStart - 1)
              .focus()
              .run();
            return true;
          }
        }

        return false;
      },
    };
  },
});
