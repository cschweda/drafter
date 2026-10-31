import type { InjectionKey, Ref } from 'vue';

/**
 * Whether the Inspector's header has put its tools icon-only (fresh-look design §3.3): provided
 * by each copy of InspectorTools, read by ToolButton for its tooltip.
 */
export const TOOLS_COMPACT: InjectionKey<Readonly<Ref<boolean>>> = Symbol('tools-compact');
