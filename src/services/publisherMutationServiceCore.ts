import type { Publisher } from '../types';

const getPublisherFieldValue = <K extends keyof Publisher>(publisher: Publisher, key: K) => publisher[key];

export interface SavePublisherResult {
    publisher: Publisher;
    operation: 'create' | 'update';
    propagatedParts: number;
    renamed: boolean;
}

export interface PublisherMutationPreview {
    operation: 'create' | 'update';
    renamed: boolean;
    changedFields: string[];
    renameImpact: {
        resolvedParts: number;
        rawParts: number;
        totalParts: number;
    };
}

interface PublisherMutationDependencies {
    apiClient: {
        createPublisher: (publisher: Publisher) => Promise<Publisher>;
        updatePublisher: (publisher: Publisher) => Promise<Publisher>;
    };
    workbookClient: {
        propagateNameChange: (oldName: string, newName: string) => Promise<number>;
    };
    countPublisherNameImpacts: (oldName: string) => Promise<{ resolvedParts: number; rawParts: number }>;
}

export function createPublisherMutationService(dependencies: PublisherMutationDependencies) {
    return {
        async previewSavePublisher(
            publisher: Publisher,
            previousPublisher?: Publisher | null
        ): Promise<PublisherMutationPreview> {
            const isUpdate = Boolean(previousPublisher);
            const oldName = previousPublisher?.name?.trim() || '';
            const newName = publisher.name.trim();
            const renamed = isUpdate && oldName !== '' && oldName !== newName;
            const changedFields = previousPublisher
                ? (Object.keys(publisher) as Array<keyof Publisher>).filter(key => getPublisherFieldValue(publisher, key) !== getPublisherFieldValue(previousPublisher, key))
                : Object.keys(publisher);

            let resolvedParts = 0;
            let rawParts = 0;

            if (renamed) {
                const counts = await dependencies.countPublisherNameImpacts(oldName);
                resolvedParts = counts.resolvedParts;
                rawParts = counts.rawParts;
            }

            return {
                operation: isUpdate ? 'update' : 'create',
                renamed,
                changedFields,
                renameImpact: {
                    resolvedParts,
                    rawParts,
                    totalParts: resolvedParts + rawParts,
                },
            };
        },

        async savePublisherWithPropagation(
            publisher: Publisher,
            previousPublisher?: Publisher | null
        ): Promise<SavePublisherResult> {
            const isUpdate = Boolean(previousPublisher);

            if (!isUpdate) {
                const createdPublisher = await dependencies.apiClient.createPublisher(publisher);
                return {
                    publisher: createdPublisher,
                    operation: 'create',
                    propagatedParts: 0,
                    renamed: false,
                };
            }

            const oldName = previousPublisher?.name?.trim() || '';
            const newName = publisher.name.trim();
            const renamed = oldName !== '' && oldName !== newName;

            const updatedPublisher = await dependencies.apiClient.updatePublisher(publisher);
            let propagatedParts = 0;

            if (renamed) {
                propagatedParts = await dependencies.workbookClient.propagateNameChange(oldName, newName);
            }

            return {
                publisher: updatedPublisher,
                operation: 'update',
                propagatedParts,
                renamed,
            };
        }
    };
}