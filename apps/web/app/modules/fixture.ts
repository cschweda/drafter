import type { Component } from 'vue';
import { h } from 'vue';
import type { ModuleContext, ScriptModule } from './types';

// The test module: a stand-in for a real one, so the host can be tried end to end. It is imported
// only when the build sets DRAFTER_TEST_MODULES=1, so a production bundle never has it.

// A plain options object, not `defineComponent(...)`: a call at the top level could keep this file
// in a bundle that doesn't use it.
const FixtureTab: Component = {
  props: { context: { type: Object, required: true } },
  setup(props) {
    const ctx = props.context as ModuleContext;
    return () =>
      h('div', { class: 'fixture-tab', style: 'padding: 16px' }, [
        h('p', { style: 'margin: 0 0 8px' }, 'Title of this script'),
        h('ul', { style: 'margin: 0; padding-left: 20px' }, [h('li', ctx.title())]),
      ]);
  },
};

export const fixture: ScriptModule = {
  id: 'fixture',
  name: 'Fixture',
  description: 'A module only test builds have, for trying the module host.',
  icon: 'i-lucide-list-checks',
  permissions: { network: ['https://example.invalid'] },
  action: {
    label: 'Count scenes',
    run(ctx) {
      const headings = ctx.doc().blocks.filter((block) => block.kind === 'scene_heading');
      ctx.setProblems(
        headings.map((block, i) => ({
          message: `Scene ${i + 1}`,
          from: block.span.from,
          to: block.span.to,
          severity: 'info' as const,
        })),
      );
    },
  },
  tab: { id: 'fixture', label: 'Fixture', component: FixtureTab },
  commands: (ctx) => [
    {
      id: 'add-note',
      title: 'Fixture: add a note',
      group: 'Edit',
      run() {
        const at = ctx.cursor();
        ctx.applyChanges([{ from: at, to: at, insert: '[[fixture]]' }]);
      },
    },
    {
      id: 'fail',
      title: 'Fixture: fail on purpose',
      group: 'Edit',
      run() {
        throw new Error('this module always fails');
      },
    },
  ],
};
