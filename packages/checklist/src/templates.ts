import { randomUUID } from "node:crypto";
import type { ChecklistTemplate, ChecklistItemDef } from "@atc/types";

/**
 * Input for creating a new checklist template.
 */
export interface CreateTemplateInput {
  readonly name: string;
  readonly description?: string;
  readonly items: readonly ChecklistItemDef[];
}

/**
 * Input for updating an existing checklist template.
 */
export interface UpdateTemplateInput {
  readonly name?: string;
  readonly description?: string;
  readonly items?: readonly ChecklistItemDef[];
}

/**
 * Creates an in-memory checklist template registry.
 *
 * @returns Registry with CRUD operations for templates.
 * @see RULE-CHKL-1, RULE-CHKL-2
 */
export function createTemplateRegistry() {
  const templates = new Map<string, ChecklistTemplate>();

  return {
    create(input: CreateTemplateInput): ChecklistTemplate {
      const template: ChecklistTemplate = {
        id: randomUUID(),
        name: input.name,
        description: input.description,
        items: [...input.items],
      };
      templates.set(template.id, template);
      return template;
    },

    get(id: string): ChecklistTemplate | undefined {
      return templates.get(id);
    },

    list(): readonly ChecklistTemplate[] {
      return [...templates.values()];
    },

    update(id: string, input: UpdateTemplateInput): ChecklistTemplate | undefined {
      const existing = templates.get(id);
      if (!existing) return undefined;

      const updated: ChecklistTemplate = {
        ...existing,
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.items !== undefined && { items: [...input.items] }),
      };
      templates.set(id, updated);
      return updated;
    },

    delete(id: string): boolean {
      return templates.delete(id);
    },
  };
}
