import type { WorkbookPart } from '../types';

export interface UndoItem {
    id: string;
    timestamp: number;
    description: string;
    affectedParts: WorkbookPart[];
}

type UndoListener = (canUndo: boolean, description?: string) => void;

interface UndoServiceDependencies {
    idFactory?: () => string;
    clock?: () => number;
    workbookMutations: {
        updatePart: (partId: string, updates: Record<string, unknown>) => Promise<unknown>;
    };
}

class UndoServiceCore {
    private stack: UndoItem[] = [];
    private listeners: UndoListener[] = [];
    private maxStackSize = 20;
    private readonly dependencies: Required<UndoServiceDependencies>;

    constructor(dependencies: Required<UndoServiceDependencies>) {
        this.dependencies = dependencies;
    }

    public push(description: string, partsBeforeChange: WorkbookPart[]) {
        const snapshot = JSON.parse(JSON.stringify(partsBeforeChange));

        const item: UndoItem = {
            id: this.dependencies.idFactory(),
            timestamp: this.dependencies.clock(),
            description,
            affectedParts: snapshot,
        };

        this.stack.push(item);
        if (this.stack.length > this.maxStackSize) {
            this.stack.shift();
        }

        this.notify();
    }

    public async undo(): Promise<{ success: boolean; description?: string }> {
        if (this.stack.length === 0) return { success: false };

        const item = this.stack.pop();
        if (!item) return { success: false };

        try {
            for (const oldPart of item.affectedParts) {
                await this.dependencies.workbookMutations.updatePart(oldPart.id, {
                    resolvedPublisherName: oldPart.resolvedPublisherName,
                    status: oldPart.status,
                    tituloParte: oldPart.tituloParte,
                });
            }

            this.notify();
            return { success: true, description: item.description };
        } catch (_error) {
            this.notify();
            return { success: false, description: item.description };
        }
    }

    public canUndo(): boolean {
        return this.stack.length > 0;
    }

    public getLastDescription(): string | undefined {
        return this.stack[this.stack.length - 1]?.description;
    }

    public subscribe(listener: UndoListener): () => void {
        this.listeners.push(listener);
        listener(this.canUndo(), this.getLastDescription());

        return () => {
            this.listeners = this.listeners.filter(candidate => candidate !== listener);
        };
    }

    public captureSingle(part: WorkbookPart, description: string) {
        this.push(description, [part]);
    }

    public captureBatch(parts: WorkbookPart[], description: string) {
        this.push(description, parts);
    }

    private notify() {
        const canUndo = this.canUndo();
        const desc = this.getLastDescription();
        this.listeners.forEach(listener => listener(canUndo, desc));
    }
}

export function createUndoService(dependencies: UndoServiceDependencies) {
    return new UndoServiceCore({
        idFactory: dependencies.idFactory || (() => crypto.randomUUID()),
        clock: dependencies.clock || (() => Date.now()),
        workbookMutations: dependencies.workbookMutations,
    });
}