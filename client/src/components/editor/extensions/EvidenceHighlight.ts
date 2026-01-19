import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { DecorationSet } from '@tiptap/pm/view';

export const evidencePluginKey = new PluginKey('evidence-highlight');

export const EvidenceHighlightExtension = Extension.create({
  name: 'evidenceHighlight',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: evidencePluginKey,
        state: {
          init() {
            return DecorationSet.empty;
          },
          apply(tr, oldSet) {
            const meta = tr.getMeta(evidencePluginKey);
            if (meta?.action === 'set') {
              return DecorationSet.create(tr.doc, meta.decorations);
            }
            if (meta?.action === 'clear') {
              return DecorationSet.empty;
            }
            // Map positions on document changes
            return oldSet.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
    ];
  }
});
