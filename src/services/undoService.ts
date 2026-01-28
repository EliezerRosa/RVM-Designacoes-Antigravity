import type { WorkbookPart } from '../types';
import { workbookService } from './workbookService';

export interface UndoItem {
    id: string; // UUID
    timestamp: number;
    description: string;
    affectedParts: WorkbookPart[]; // The state of the parts BEFORE the change
}

type UndoListener = (canUndo: boolean, description?: string) => void;

class UndoService {
    private stack: UndoItem[] = [];
    private listeners: UndoListener[] = [];
    private maxStackSize = 20;

    constructor() { }

    /**
     * Add an action to the undo stack.
     * MUST be called BEFORE the change is applied to the DB.
     */
    public push(description: string, partsBeforeChange: WorkbookPart[]) {
        // Create a deep copy to avoid reference issues
        const snapshot = JSON.parse(JSON.stringify(partsBeforeChange));

        const item: UndoItem = {
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            description,
            affectedParts: snapshot
        };

        this.stack.push(item);

        if (this.stack.length > this.maxStackSize) {
            this.stack.shift(); // Remove oldest
        }

        this.notify();
        console.log(`[UndoService] Pushed: ${description} (${partsBeforeChange.length} parts)`);
    }

    /**
     * Undo the last action.
     * Restores the parts to their state stored in the stack.
     */
    public async undo(): Promise<boolean> {
        if (this.stack.length === 0) return false;

        const item = this.stack.pop();
        if (!item) return false;

        console.log(`[UndoService] Reverting: ${item.description}`);

        try {
            // Restore each part to its previous state
            // We interpret "snapshot" as the source of truth for properties like:
            // publisherId, publisherName, status, etc.
            // Note: We deliberately do NOT revert "preassignmentId" linkage here unless we want to,
            // but primarily we care about the assignment field.

            for (const oldPart of item.affectedParts) {
                // We construct an update object.
                // We basically want to revert to the old state.
                await workbookService.updatePart(oldPart.id, {
                    resolvedPublisherName: oldPart.resolvedPublisherName,
                    status: oldPart.status,
                    // If we need to revert other fields (like title for NL), add them here
                    // For now, let's include title just in case (e.g. NL theme)
                    tituloParte: oldPart.tituloParte
                });
            }

            this.notify();
            return true;
        } catch (error) {
            console.error('[UndoService] Failed to undo:', error);
            // If failed, we might want to push it back? Or just lost it.
            // For now, let's assume it's gone.
            this.notify();
            return false;
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
        // Initial call
        listener(this.canUndo(), this.getLastDescription());

        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    private notify() {
        const canUndo = this.canUndo();
        const desc = this.getLastDescription();
        this.listeners.forEach(l => l(canUndo, desc));
    }

    // Helper to capture a single part before change
    public captureSingle(part: WorkbookPart, description: string) {
        this.push(description, [part]);
    }

    // Helper to capture multiple parts (batch)
    public captureBatch(parts: WorkbookPart[], description: string) {
        this.push(description, parts);
    }
}

export const undoService = new UndoService();
