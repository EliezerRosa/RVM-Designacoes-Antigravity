import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import * as XLSX from 'xlsx';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { workbookManagementService } from '../services/workbookManagementService';
import { workbookImportService } from '../services/workbookImportService';
import { workbookQueryService } from '../services/workbookQueryService';
import { workbookService } from '../services/workbookService';
import { installDom } from '../test/componentTestUtils';
import type { WorkbookExcelRow } from '../services/workbookService';
import { WorkbookStatus, type WorkbookPart } from '../types';
import { buildWorkbookPart } from '../test/factories';
void React;

const basePart: WorkbookPart = buildWorkbookPart({
    id: 'part-1',
    weekId: '2099-05-12',
    weekDisplay: '12-18 de Maio',
    year: 2099,
    date: '2099-05-12',
    section: 'Tesouros da Palavra de Deus',
    tipoParte: 'Joias Espirituais',
    modalidade: 'Discurso de Ensino',
    tituloParte: 'Tema de Teste',
    descricaoParte: 'Descricao',
    duracao: '10 min',
    horaInicio: '19:00',
    horaFim: '19:10',
    status: WorkbookStatus.PENDENTE,
});

function createWorkbookFile(rows: WorkbookExcelRow[], fileName = 'apostila.xlsx') {
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Apostila');
    const data = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
    return new File([data], fileName, {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
}

test('WorkbookManager loads parts through workbookQueryService when active', async () => {
    const dom = installDom();
    let getAllCalls = 0;
    const originalGetAllParts = workbookQueryService.getAllParts;

    workbookQueryService.getAllParts = async () => {
        getAllCalls += 1;
        return [basePart];
    };

    try {
        const { default: WorkbookManager } = await import('./WorkbookManager');
        const view = render(<WorkbookManager publishers={[]} isActive={true} />);

        await view.findByText('Tema de Teste');

        const refreshButton = await view.findByRole('button', { name: /atualizar/i });
        fireEvent.click(refreshButton);

        await waitFor(() => {
            assert.ok(getAllCalls >= 2);
        });
    } finally {
        workbookQueryService.getAllParts = originalGetAllParts;
        dom.cleanup();
    }
});

test('WorkbookManager imports workbook files through workbookImportService and refreshes the list', async () => {
    const dom = installDom();
    let queryCalls = 0;
    let importCallCount = 0;
    let importedRows: WorkbookExcelRow[] = [];
    const uploadedPart: WorkbookPart = {
        ...basePart,
        id: 'part-2',
        tituloParte: 'Parte Importada',
        status: WorkbookStatus.PROPOSTA,
    };
    const originalGetAllParts = workbookQueryService.getAllParts;
    const originalImportBatch = workbookImportService.importBatch;

    workbookQueryService.getAllParts = async () => {
        queryCalls += 1;
        return queryCalls >= 2 ? [uploadedPart] : [];
    };
    workbookImportService.importBatch = async (fileName, rows) => {
        importCallCount += 1;
        importedRows = rows;
        assert.equal(fileName, 'apostila.xlsx');
        return { id: 'batch-1', fileName, importedAt: new Date().toISOString() } as any;
    };

    try {
        const { default: WorkbookManager } = await import('./WorkbookManager');
        const view = render(<WorkbookManager publishers={[]} isActive={true} />);

        const uploadInput = view.container.querySelector('#workbook-excel-upload') as HTMLInputElement | null;
        assert.ok(uploadInput, 'workbook upload input should exist');

        const file = createWorkbookFile([
            {
                id: 'import-row-1',
                year: 2099,
                weekId: '2099-05-19',
                weekDisplay: '19-25 de Maio',
                date: '2099-05-19',
                section: 'Tesouros da Palavra de Deus',
                tipoParte: 'Joias Espirituais',
                modalidade: 'Discurso de Ensino',
                tituloParte: 'Parte Importada',
                descricaoParte: 'Descricao importada',
                detalhesParte: '',
                seq: 1,
                funcao: 'Titular',
                duracao: '10 min',
                horaInicio: '19:00',
                horaFim: '19:10',
                rawPublisherName: '',
                status: 'PENDENTE',
            },
        ]);

        fireEvent.change(uploadInput!, { target: { files: [file] } });

        await waitFor(() => {
            assert.equal(importCallCount, 1);
            assert.equal(importedRows.length, 1);
        });
        await view.findByText(/Importadas 1 partes de "apostila\.xlsx"/i);
        await view.findByText('Parte Importada');
    } finally {
        workbookQueryService.getAllParts = originalGetAllParts;
        workbookImportService.importBatch = originalImportBatch;
        dom.cleanup();
    }
});

test('WorkbookManager saves edited parts through workbookManagementService and updates the rendered row', async () => {
    const dom = installDom();
    let queryCalls = 0;
    let updateCalls = 0;
    const savedPart = { ...basePart, tituloParte: 'Tema atualizado' };
    const originalGetAllParts = workbookQueryService.getAllParts;
    const originalUpdatePart = workbookManagementService.updatePart;

    workbookQueryService.getAllParts = async () => {
        queryCalls += 1;
        return queryCalls >= 2 ? [savedPart] : [basePart];
    };
    workbookManagementService.updatePart = async (partId, _updates) => {
        updateCalls += 1;
        assert.equal(partId, 'part-1');
        return savedPart;
    };

    try {
        const { default: WorkbookManager } = await import('./WorkbookManager');
        const view = render(<WorkbookManager publishers={[]} isActive={true} />);

        await view.findByText('Tema de Teste');
        fireEvent.click(await view.findByTitle('Editar Parte'));

        const titleInput = await view.findByDisplayValue('Tema de Teste');
        fireEvent.change(titleInput, { target: { value: 'Tema atualizado' } });
        await waitFor(() => {
            assert.equal((titleInput as HTMLInputElement).value, 'Tema atualizado');
        });
        fireEvent.click(view.getByRole('button', { name: /salvar alterações/i }));

        await view.findByText('Tema atualizado');
        await waitFor(() => {
            assert.equal(updateCalls, 1);
            assert.ok(queryCalls >= 2);
        });
    } finally {
        workbookQueryService.getAllParts = originalGetAllParts;
        workbookManagementService.updatePart = originalUpdatePart;
        dom.cleanup();
    }
});

test('WorkbookManager refreshes parts after saving time-related edits in the modal', async () => {
    const dom = installDom();
    let queryCalls = 0;
    let updateCalls = 0;
    const refreshedPart = { ...basePart, tituloParte: 'Tema recalculado', duracao: '15 min', horaFim: '19:15' };
    const originalGetAllParts = workbookQueryService.getAllParts;
    const originalUpdatePart = workbookManagementService.updatePart;
    const originalUpdateWeekStatus = workbookService.updateWeekStatus;

    workbookQueryService.getAllParts = async () => {
        queryCalls += 1;
        return queryCalls >= 2 ? [refreshedPart] : [basePart];
    };
    workbookManagementService.updatePart = async (_partId, updates) => {
        updateCalls += 1;
        return { ...basePart, ...updates } as WorkbookPart;
    };
    workbookService.updateWeekStatus = async () => undefined;

    try {
        const { default: WorkbookManager } = await import('./WorkbookManager');
        const view = render(<WorkbookManager publishers={[]} isActive={true} />);

        await view.findByText('Tema de Teste');
        fireEvent.click(await view.findByTitle('Editar Parte'));

        const durationInput = await view.findByDisplayValue('10 min');
        fireEvent.change(durationInput, { target: { value: '15 min' } });
        await waitFor(() => {
            assert.equal((durationInput as HTMLInputElement).value, '15 min');
        });
        fireEvent.click(view.getByRole('button', { name: /salvar alterações/i }));

        await waitFor(() => {
            assert.equal(updateCalls, 1);
            assert.ok(queryCalls >= 2);
        });
        await view.findByText('Tema recalculado');
    } finally {
        workbookQueryService.getAllParts = originalGetAllParts;
        workbookManagementService.updatePart = originalUpdatePart;
        workbookService.updateWeekStatus = originalUpdateWeekStatus;
        dom.cleanup();
    }
});