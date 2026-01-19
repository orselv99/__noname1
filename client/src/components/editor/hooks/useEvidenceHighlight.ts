import { useEffect } from 'react';
import { Editor } from '@tiptap/react';
import { Decoration } from '@tiptap/pm/view';
import { evidencePluginKey } from '../extensions';

export function useEvidenceHighlight(editor: Editor | null, isActive: boolean, highlightedEvidence: string | null) {
  // Handle highlighting evidence (only when active)
  useEffect(() => {
    if (!editor || !isActive) return;

    if (highlightedEvidence) {
      const editorDoc = editor.state.doc;
      const segments: { from: number; to: number; text: string; nodePos: number }[] = [];
      let stringAccumulator = "";

      editorDoc.descendants((node, pos) => {
        if (node.isText) {
          const text = node.text || "";
          segments.push({
            from: stringAccumulator.length,
            to: stringAccumulator.length + text.length,
            text: text,
            nodePos: pos
          });
          stringAccumulator += text;
        } else if (node.isBlock) {
          if (stringAccumulator.length > 0 && !stringAccumulator.endsWith(" ")) {
            stringAccumulator += " ";
          }
        }
      });

      let matchIndex = stringAccumulator.indexOf(highlightedEvidence);
      let matchLen = highlightedEvidence.length;

      // Fallback 1: Try trimmed version
      if (matchIndex === -1) {
        const trimmed = highlightedEvidence.trim();
        matchIndex = stringAccumulator.indexOf(trimmed);
        matchLen = trimmed.length;
      }

      // Fallback 2: Normalized search ignoring whitespace differences
      // This handles cases where AI-generated evidence has different spacing than the original
      if (matchIndex === -1) {
        // Normalize both strings by collapsing all whitespace to single spaces
        const normalizeText = (text: string) => text.replace(/\s+/g, ' ').trim();
        const normalizedEvidence = normalizeText(highlightedEvidence);
        const normalizedAccumulator = normalizeText(stringAccumulator);

        const normalizedMatchIndex = normalizedAccumulator.indexOf(normalizedEvidence);
        if (normalizedMatchIndex !== -1) {
          console.log('Found via normalized search at index:', normalizedMatchIndex);

          // Map normalized index back to original index
          // Count how much whitespace was removed before this position
          let originalIndex = 0;
          let normalizedIndex = 0;

          // Skip leading whitespace in original
          while (originalIndex < stringAccumulator.length && /\s/.test(stringAccumulator[originalIndex])) {
            originalIndex++;
          }

          // Walk through to find the original position
          while (normalizedIndex < normalizedMatchIndex && originalIndex < stringAccumulator.length) {
            if (/\s/.test(stringAccumulator[originalIndex])) {
              // Skip extra whitespace
              while (originalIndex < stringAccumulator.length && /\s/.test(stringAccumulator[originalIndex])) {
                originalIndex++;
              }
              normalizedIndex++; // Count as one space in normalized
            } else {
              originalIndex++;
              normalizedIndex++;
            }
          }

          matchIndex = originalIndex;

          // Calculate match length in original text
          let endOriginalIndex = originalIndex;
          let normalizedLen = 0;
          while (normalizedLen < normalizedEvidence.length && endOriginalIndex < stringAccumulator.length) {
            if (/\s/.test(stringAccumulator[endOriginalIndex])) {
              // Skip extra whitespace
              while (endOriginalIndex < stringAccumulator.length && /\s/.test(stringAccumulator[endOriginalIndex])) {
                endOriginalIndex++;
              }
              normalizedLen++; // Count as one space
            } else {
              endOriginalIndex++;
              normalizedLen++;
            }
          }

          matchLen = endOriginalIndex - matchIndex;
        }
      }

      // Fallback 3: Try fuzzy matching - find significant words
      if (matchIndex === -1) {
        // Extract significant words (3+ chars, exclude common Korean particles)
        const words = highlightedEvidence
          .split(/[\s.,!?;:'"()\[\]{}]+/)
          .filter(w => w.length >= 3)
          .filter(w => !['이다', '있다', '하다', '되다', '이며', '있으며', '한다', '된다'].includes(w))
          .slice(0, 8);

        console.log('Fuzzy search words:', words);

        for (const word of words) {
          const wordIndex = stringAccumulator.indexOf(word);
          if (wordIndex !== -1) {
            console.log(`Found word "${word}" at index ${wordIndex}`);
            matchIndex = wordIndex;
            matchLen = Math.min(100, highlightedEvidence.length);
            break;
          }
        }
      }

      // Fallback 4: If still not found, try to find the tag name itself
      if (matchIndex === -1) {
        // The highlightedEvidence might be the evidence, but we can also search for any Korean proper noun
        const koreanWords = highlightedEvidence.match(/[가-힣]{2,}/g) || [];
        for (const word of koreanWords) {
          if (word.length >= 2) {
            const wordIndex = stringAccumulator.indexOf(word);
            if (wordIndex !== -1) {
              console.log(`Found Korean word "${word}" at index ${wordIndex}`);
              matchIndex = wordIndex;
              matchLen = word.length + 30;
              break;
            }
          }
        }
      }

      console.log(`Final match: index=${matchIndex}, len=${matchLen}`);

      if (matchIndex !== -1) {
        const matchEnd = matchIndex + matchLen;
        const getDocPos = (strIndex: number) => {
          for (const seg of segments) {
            if (strIndex >= seg.from && strIndex < seg.to) {
              return seg.nodePos + (strIndex - seg.from);
            }
          }
          for (let i = segments.length - 1; i >= 0; i--) {
            if (segments[i].to === strIndex) {
              return segments[i].nodePos + segments[i].text.length;
            }
            if (segments[i].to < strIndex) break;
          }
          if (strIndex === 0 && segments.length > 0) return segments[0].nodePos;
          return 0;
        };

        const from = getDocPos(matchIndex);
        const to = getDocPos(matchEnd);

        console.log(`[Highlight Debug] from=${from}, to=${to}, matchIndex=${matchIndex}, matchEnd=${matchEnd}`);

        if (from !== to) {
          const decoration = Decoration.inline(from, to, {
            class: 'bg-yellow-500/30 border-b-2 border-yellow-500/50 rounded-sm'
          });

          console.log('[Highlight Debug] Dispatching decoration');
          editor.view.dispatch(
            editor.view.state.tr.setMeta(evidencePluginKey, {
              action: 'set',
              decorations: [decoration]
            })
          );

          setTimeout(() => {
            // Find the highlighted element by its class and scroll to it
            const highlightedEl = document.querySelector('.bg-yellow-500\\/30');
            if (highlightedEl) {
              console.log('[Highlight Debug] Found highlighted element, scrolling');
              highlightedEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else {
              // Fallback: use editor's built-in scroll
              console.log('[Highlight Debug] No highlighted element found, using editor scroll');
              editor.chain().focus().setTextSelection(from).scrollIntoView().run();
            }
          }, 100);
        } else {
          console.log('[Highlight Debug] from === to, skipping');
        }
      } else {
        editor.view.dispatch(
          editor.view.state.tr.setMeta(evidencePluginKey, {
            action: 'clear'
          })
        );
      }
    } else {
      editor.view.dispatch(
        editor.view.state.tr.setMeta(evidencePluginKey, {
          action: 'clear'
        })
      );
    }
  }, [highlightedEvidence, editor, isActive]);
}
