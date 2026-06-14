import { Mark } from '@tiptap/core';

const Underline = Mark.create({
  name: 'underline',

  parseHTML() {
    return [
      {
        tag: 'u',
      },
      {
        style: 'text-decoration',
        getAttrs: value => value === 'underline' && null,
      },
    ];
  },

  renderHTML() {
    return ['u', 0];
  },

  addCommands() {
    return {
      toggleUnderline: () => ({ commands }) => {
        return commands.toggleMark(this.name);
      },
    };
  },
});

export default Underline;

