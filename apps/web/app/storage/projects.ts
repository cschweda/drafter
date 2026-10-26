import { type DrafterMeta, parse } from '@drafter/fountain';
import { type TemplateId, templateIdOf } from '../editor/template';
import { db } from './db';
import type { FileRef } from './files';
import { fileBaseName, titleOf } from './text';

export interface Project {
  id: string; // crypto.randomUUID()
  title: string;
  templateId: TemplateId;
  /** The recovery copy, with `\n` line breaks. */
  source: string;
  /** The file's line break, used when writing it. */
  lineBreak: '\n' | '\r\n';
  meta: DrafterMeta | null;
  /** Set on the two samples (Phase 1 design §4.2). */
  sample?: 'screenplay' | 'stage-play';
  createdAt: number;
  updatedAt: number;
  savedHash?: string;
  savedAt?: number;
  /** The file began with a byte-order mark, which writing it restores; absent on a script that came from no file. Unindexed, so it needed no new version. */
  bom?: boolean;
  /**
   * The text a new script started from. Until the script has a file, "changed" means different
   * from this, so a new script nobody has typed in is not changed. Unindexed, so it needed no
   * new version; a script that came from no template has none.
   */
  baseline?: string;
  /** The file's name, for the Source pane's slim bar. */
  fileName?: string;
  fsHandleId?: string;
}

/** `title`, `templateId`, and `meta` are caches of `source`; when they disagree, `source` wins (technical design §8.1). */
function derive(source: string, fileName?: string): Pick<Project, 'title' | 'templateId' | 'meta'> {
  const doc = parse(source);
  // A script with no title is called after its file, when it has one.
  return {
    title: titleOf(doc, fileBaseName(fileName)),
    templateId: templateIdOf(doc),
    meta: doc.meta,
  };
}

export async function createProject(
  init: { source: string } & Partial<Omit<Project, 'id' | 'createdAt' | 'updatedAt'>>,
): Promise<Project> {
  const now = Date.now();
  const project: Project = {
    lineBreak: '\n',
    ...init,
    ...derive(init.source, init.fileName),
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  };
  await db.projects.add(project);
  return project;
}

export function getProject(id: string): Promise<Project | undefined> {
  return db.projects.get(id);
}

/** Most recently updated first. */
export function listProjects(): Promise<Project[]> {
  return db.projects.orderBy('updatedAt').reverse().toArray();
}

/**
 * Also derives `title`, `templateId`, and `meta` from `source` when it's given
 * (technical design §8.1), and stamps `updatedAt`. A project that's gone
 * (removed in another tab) is left alone.
 */
export async function updateProject(
  id: string,
  patch: Partial<Omit<Project, 'id' | 'createdAt'>>,
): Promise<void> {
  await db.transaction('rw', db.projects, async () => {
    const current = await db.projects.get(id);
    if (!current) return;
    const next: Project = {
      ...current,
      updatedAt: Date.now(),
      ...patch,
      ...(patch.source === undefined
        ? {}
        : derive(patch.source, patch.fileName ?? current.fileName)),
      id,
      createdAt: current.createdAt,
    };
    await db.projects.put(next);
  });
}

/**
 * The recovery copy's write: the stored project with a new `source` (and what derives from it,
 * and `updatedAt`), in one transaction. Nothing else is taken from `current`, so a change another
 * tab made to the stored project meanwhile (a save recorded from a read-only tab) is kept; it is
 * the stored project's own fields that the result carries, and `current` stands in only for a
 * project that has gone from the database.
 */
export async function writeSource(current: Project, source: string): Promise<Project> {
  return db.transaction('rw', db.projects, async () => {
    const stored = await db.projects.get(current.id);
    const base = stored ?? current;
    const next: Project = {
      ...base,
      ...derive(source, base.fileName),
      source,
      updatedAt: Date.now(),
    };
    await db.projects.put(next);
    return next;
  });
}

/** Also deletes its snapshot and its file handle; never touches the file. */
export async function removeProject(id: string): Promise<void> {
  await db.transaction('rw', db.projects, db.snapshots, db.handles, async () => {
    const project = await db.projects.get(id);
    if (project?.fsHandleId) await db.handles.delete(project.fsHandleId);
    await db.snapshots.where('projectId').equals(id).delete();
    await db.projects.delete(id);
  });
}

// The text as last saved to its file (technical design §8.4): one snapshot a
// project, replaced at every save, which "Revert to Saved" reads.
const savedId = (projectId: string) => `saved:${projectId}`;

export async function getSavedText(id: string): Promise<string | undefined> {
  return (await db.snapshots.get(savedId(id)))?.source;
}

export async function setSavedText(id: string, source: string): Promise<void> {
  await db.snapshots.put({
    id: savedId(id),
    projectId: id,
    createdAt: Date.now(),
    source,
    label: 'Saved',
  });
}

/** Keeps `ref` under `id` (the project's `fsHandleId`) and returns the id. */
export async function putHandle(id: string, ref: FileRef): Promise<string> {
  await db.handles.put({ id, ref });
  return id;
}

export async function getHandle(id: string): Promise<FileRef | undefined> {
  return (await db.handles.get(id))?.ref;
}
