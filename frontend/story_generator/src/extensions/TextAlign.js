import { Extension } from '@tiptap/core';

const TextAlign = Extension.create({
  name: 'textAlign',

  addOptions() {
    return {
      types: ['heading', 'paragraph'],
      defaultAlignment: 'left',
      alignments: ['left', 'center', 'right', 'justify'],
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          textAlign: {
            default: this.options.defaultAlignment,
            parseHTML: element => element.style.textAlign || this.options.defaultAlignment,
            renderHTML: attributes => {
              if (!attributes.textAlign || attributes.textAlign === this.options.defaultAlignment) {
                return {};
              }
              return {
                style: `text-align: ${attributes.textAlign}`,
              };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setTextAlign: (alignment) => ({ commands }) => {
        if (!this.options.alignments.includes(alignment)) {
          return false;
        }
        return this.options.types.every(type => commands.updateAttributes(type, { textAlign: alignment }));
      },
      unsetTextAlign: () => ({ commands }) => {
        return this.options.types.every(type => commands.resetAttributes(type, 'textAlign'));
      },
    };
  },
});

export default TextAlign;

