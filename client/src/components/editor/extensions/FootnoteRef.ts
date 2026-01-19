import { Node } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

export const FootnoteRefNode = Node.create({
  name: 'footnoteRef',
  group: 'inline',
  inline: true,
  atom: true, // Makes it delete as a single unit

  addAttributes() {
    return {
      target: {
        default: null,
      },
      number: {
        default: 1,
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-footnote-target]',
        getAttrs: (element) => {
          const el = element as HTMLElement;
          return {
            target: el.getAttribute('data-footnote-target'),
            number: parseInt(el.textContent?.replace(/[\[\]]/g, '') || '1', 10),
          };
        },
      },
    ]
  },

  renderHTML({ node }) {
    return [
      'span',
      {
        'data-footnote-target': node.attrs.target,
        class: 'footnote-ref text-blue-500 cursor-pointer font-medium align-super text-xs',
      },
      `[${node.attrs.number}]`,
    ]
  },

  addProseMirrorPlugins() {
    const nodeType = this.type;

    return [
      new Plugin({
        key: new PluginKey('footnote-cleanup'),
        appendTransaction(_transactions, oldState, newState) {
          // Check if any footnoteRef nodes were deleted
          const deletedFootnotes: string[] = [];

          // Find footnoteRef nodes in old state
          const oldFootnotes: { target: string; pos: number }[] = [];
          oldState.doc.descendants((node, pos) => {
            if (node.type === nodeType && node.attrs.target) {
              oldFootnotes.push({ target: node.attrs.target, pos });
            }
          });

          // Find footnoteRef nodes in new state
          const newFootnotes = new Set<string>();
          newState.doc.descendants((node) => {
            if (node.type === nodeType && node.attrs.target) {
              newFootnotes.add(node.attrs.target);
            }
          });

          // Find deleted footnotes
          for (const old of oldFootnotes) {
            if (!newFootnotes.has(old.target)) {
              deletedFootnotes.push(old.target);
            }
          }

          if (deletedFootnotes.length === 0) return null;

          // Create transaction to delete corresponding footnote paragraphs
          let tr = newState.tr;
          let hasChanges = false;

          // Collect positions to delete (in reverse order to avoid position shifts)
          const toDelete: { from: number; to: number }[] = [];

          newState.doc.descendants((node, pos) => {
            if (node.type.name === 'paragraph' && deletedFootnotes.includes(node.attrs.id)) {
              toDelete.push({ from: pos, to: pos + node.nodeSize });
            }
          });

          // Delete in reverse order
          toDelete.reverse().forEach(({ from, to }) => {
            tr = tr.delete(from, to);
            hasChanges = true;
          });

          // Check if there are any remaining footnotes
          if (hasChanges) {
            let remainingFootnotes = 0;
            tr.doc.descendants((node) => {
              if (node.type === nodeType) {
                remainingFootnotes++;
              }
            });

            // If no more footnotes, remove the horizontal rule separator
            if (remainingFootnotes === 0) {
              tr.doc.descendants((node, pos) => {
                if (node.type.name === 'horizontalRule') {
                  // Check if this is near the end (footnote area)
                  const docSize = tr.doc.content.size;
                  if (pos > docSize * 0.5) { // In the latter half of document
                    tr = tr.delete(pos, pos + node.nodeSize);
                  }
                }
              });
            }
          }

          return hasChanges ? tr : null;
        }
      })
    ];
  },
});
