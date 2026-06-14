import { Extension } from '@tiptap/core';
import { TextStyle } from '@tiptap/extension-text-style';

const Highlight = Extension.create({
  name: 'highlight',

  addOptions() {
    return {
      types: ['textStyle'],
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          backgroundColor: {
            default: null,
            parseHTML: element => element.style.backgroundColor,
            renderHTML: attributes => {
              if (!attributes.backgroundColor) {
                return {};
              }

              return {
                style: `background-color: ${attributes.backgroundColor}`,
              };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setHighlight: (backgroundColor) => ({ chain }) => {
        return chain()
          .setMark('textStyle', { backgroundColor })
          .run();
      },
      unsetHighlight: () => ({ chain }) => {
        return chain()
          .setMark('textStyle', { backgroundColor: null })
          .removeEmptyTextStyle()
          .run();
      },
    };
  },
});

export default Highlight;

