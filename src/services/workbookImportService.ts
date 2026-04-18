import { workbookService } from './workbookService';
import { createWorkbookImportService } from './workbookImportServiceCore';

export const workbookImportService = createWorkbookImportService({
    workbookClient: workbookService,
});