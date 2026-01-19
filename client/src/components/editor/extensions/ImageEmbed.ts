import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { invoke } from '@tauri-apps/api/core';

export const ImageEmbedExtension = Extension.create({
  name: 'imageEmbed',

  addProseMirrorPlugins() {
    const editor = this.editor;

    return [
      new Plugin({
        key: new PluginKey('image-embed'),
        props: {
          // Handle paste events
          handlePaste: (_view, event) => {
            // First check for pasted files (e.g., screenshot from clipboard)
            const files = event.clipboardData?.files;
            if (files && files.length > 0) {
              const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
              if (imageFiles.length > 0) {
                event.preventDefault();

                imageFiles.forEach(file => {
                  const reader = new FileReader();
                  reader.onload = () => {
                    const dataUrl = reader.result as string;
                    editor.chain().focus().setImage({ src: dataUrl }).run();
                  };
                  reader.readAsDataURL(file);
                });

                return true;
              }
            }

            // For HTML paste with external images, let paste happen normally,
            // then scan and replace external URLs
            const html = event.clipboardData?.getData('text/html');
            if (!html) return false;

            // Check if there are external images
            const hasExternalImages = /src=["']https?:\/\/[^"']+["']/i.test(html);
            if (!hasExternalImages) return false;

            console.log('Detected external images in pasted HTML, will process after paste');

            // Let the paste happen normally (return false), 
            // then process after a short delay
            setTimeout(async () => {
              console.log('Scanning editor for external images to embed...');

              const { state } = editor;
              let hasChanges = false;

              const imagesToProcess: { pos: number; src: string }[] = [];

              // Scan document for external images
              state.doc.descendants((node, pos) => {
                if (node.type.name === 'image') {
                  const src = node.attrs.src;
                  if (src && !src.startsWith('data:') && (src.startsWith('http://') || src.startsWith('https://'))) {
                    imagesToProcess.push({ pos, src });
                  }
                }
              });

              if (imagesToProcess.length === 0) return;

              console.log(`Found ${imagesToProcess.length} images to process`);

              // Process images one by one to avoid race conditions
              for (const { pos, src } of imagesToProcess) {
                try {
                  console.log('Downloading image:', src);
                  const dataUrl = await invoke<string>('download_image', { url: src });

                  if (dataUrl && dataUrl.startsWith('data:')) {
                    console.log('Image downloaded, updating node at pos:', pos);

                    // Always get fresh transaction/state to avoid mapping issues
                    editor.view.dispatch(
                      editor.state.tr.setNodeMarkup(pos, undefined, {
                        ...editor.state.doc.nodeAt(pos)?.attrs,
                        src: dataUrl
                      })
                    );
                    hasChanges = true;
                  }
                } catch (error) {
                  console.error('Failed to embed:', src, error);
                }
              }

              if (hasChanges) {
                console.log('All images processed and updated');
              }
            }, 100);

            // Let the paste happen normally
            return false;
          },

          // Handle drag-drop events
          handleDrop: (_view, event, _slice, moved) => {
            console.log('handleDrop triggered - moved:', moved);

            // Only handle if not moved from within editor
            if (moved) return false;

            const files = event.dataTransfer?.files;
            console.log('Drop files count:', files?.length, 'types:', event.dataTransfer?.types);

            if (!files || files.length === 0) return false;

            const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
            console.log('Image files to process:', imageFiles.length, imageFiles.map(f => f.name));

            if (imageFiles.length === 0) return false;

            event.preventDefault();

            imageFiles.forEach(file => {
              console.log('Reading file:', file.name, file.type, file.size);
              const reader = new FileReader();
              reader.onload = () => {
                const dataUrl = reader.result as string;
                console.log('FileReader complete, inserting image');
                editor.chain().focus().setImage({ src: dataUrl }).run();
                console.log('Image inserted via drag-drop');
              };
              reader.onerror = (e) => console.error('FileReader error:', e);
              reader.readAsDataURL(file);
            });

            return true;
          }
        }
      })
    ];
  }
});
