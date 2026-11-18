import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { installDom } from '../../test/componentTestUtils';
import { WeekConflictQueueBanner } from './WeekConflictQueueBanner';
import { buildWorkbookPart } from '../../test/factories';
import { WorkbookStatus } from '../../types';
import * as reassignmentService from '../../services/reassignmentService';
void React;

test('WeekConflictQueueBanner: retorna null quando lista de conflitos está vazia', () => {
    installDom();
    const { container } = render(
        <WeekConflictQueueBanner
            weekId="2026-11-23"
            conflictParts={[]}
            publishers={[]}
            allParts={[]}
        />
    );
    assert.equal(container.firstChild, null);
});

test('WeekConflictQueueBanner: renderiza banner contextual com os dados do conflito', () => {
    installDom();
    const part = buildWorkbookPart({
        id: 'part-conf-1',
        weekId: '2026-11-23',
        tipoParte: 'Leitura da Bíblia',
        funcao: 'Titular',
        resolvedPublisherName: 'Carlos Silva',
        needsReassignment: true,
        reassignmentReason: 'Publicador informou ausência no HG',
        status: WorkbookStatus.DESIGNADA,
    });

    const { getByText } = render(
        <WeekConflictQueueBanner
            weekId="2026-11-23"
            conflictParts={[part]}
            publishers={[]}
            allParts={[part]}
        />
    );

    assert.ok(getByText(/Fila de Conflitos de Disponibilidade na Semana \(1 parte pendente\)/));
    assert.ok(getByText(/Carlos Silva/));
    assert.ok(getByText(/Publicador informou ausência no HG/));
});

test('WeekConflictQueueBanner: dispensar chama callback onDismissConflict', async () => {
    installDom();
    const part = buildWorkbookPart({
        id: 'part-conf-2',
        weekId: '2026-11-23',
        tipoParte: 'Discurso de Estudante',
        funcao: 'Titular',
        resolvedPublisherName: 'João Santos',
        needsReassignment: true,
        reassignmentReason: 'Férias',
        status: WorkbookStatus.DESIGNADA,
    });

    let dismissedPartId = '';
    const { getByText } = render(
        <WeekConflictQueueBanner
            weekId="2026-11-23"
            conflictParts={[part]}
            publishers={[]}
            allParts={[part]}
            onDismissConflict={(id) => {
                dismissedPartId = id;
            }}
        />
    );

    const dismissBtn = getByText('✕ Dispensar');
    fireEvent.click(dismissBtn);

    await waitFor(() => {
        assert.equal(dismissedPartId, 'part-conf-2');
    });
});
