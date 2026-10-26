import { shallowRef } from 'vue';

// The question a module asks the writer with `ctx.confirm`, shown by `ModuleConfirmDialog.vue`. One
// is open at a time: a new question answers the one before it No. It is answered No too when the
// script it was asked in is closed, or its module is turned off, while it is open.

export interface ModuleQuestion {
  /** The module that asks, whose name is the dialog's heading. */
  moduleId: string;
  moduleName: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  /** Answers the question and takes it away; a second answer does nothing. */
  answer(yes: boolean): void;
}

export interface ConfirmOptions {
  /** The button that says yes; "OK" when left out. */
  confirmLabel?: string;
  /** The button that says no, and where focus starts; "Cancel" when left out. */
  cancelLabel?: string;
}

export const moduleQuestion = shallowRef<ModuleQuestion | null>(null);

/** Asks `message` in a modal dialog on behalf of a module; resolves true only for a Yes. */
export function askModule(
  moduleId: string,
  moduleName: string,
  message: string,
  options: ConfirmOptions = {},
): Promise<boolean> {
  moduleQuestion.value?.answer(false);
  return new Promise<boolean>((resolve) => {
    let done = false;
    const question: ModuleQuestion = {
      moduleId,
      moduleName,
      message,
      confirmLabel: options.confirmLabel?.trim() || 'OK',
      cancelLabel: options.cancelLabel?.trim() || 'Cancel',
      answer(yes) {
        if (done) return;
        done = true;
        if (moduleQuestion.value === question) moduleQuestion.value = null;
        resolve(yes);
      },
    };
    moduleQuestion.value = question;
  });
}

/** Answers No to the open question: another script was opened, or `moduleId` was turned off. */
export function dropQuestion(moduleId?: string): void {
  const open = moduleQuestion.value;
  if (open && (moduleId === undefined || open.moduleId === moduleId)) open.answer(false);
}
