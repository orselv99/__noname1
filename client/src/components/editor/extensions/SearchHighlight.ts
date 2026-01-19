import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { DecorationSet } from '@tiptap/pm/view';

export const searchPluginKey = new PluginKey('search-highlight');

export const SearchHighlightExtension = Extension.create({
  name: 'searchHighlight',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: searchPluginKey,
        state: {
          init() {
            return { decorations: DecorationSet.empty, matches: [] };
          },
          apply(tr, oldState) {
            const meta = tr.getMeta(searchPluginKey);
            if (meta?.action === 'set') {
              return {
                decorations: DecorationSet.create(tr.doc, meta.decorations),
                matches: meta.matches || []
              };
            }
            if (meta?.action === 'clear') {
              return { decorations: DecorationSet.empty, matches: [] };
            }
            // Map positions on document changes
            return {
              decorations: oldState.decorations.map(tr.mapping, tr.doc),
              matches: oldState.matches
            };
          },
        },
        props: {
          decorations(state) {
            return this.getState(state)?.decorations || DecorationSet.empty;
          },
        },
      }),
    ];
  }
});
