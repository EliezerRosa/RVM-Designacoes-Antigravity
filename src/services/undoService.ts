import { workbookManagementService } from './workbookManagementService';
import { createUndoService } from './undoServiceCore';

export { createUndoService } from './undoServiceCore';
export type { UndoItem } from './undoServiceCore';

export const undoService = createUndoService({
    workbookMutations: workbookManagementService,
});
