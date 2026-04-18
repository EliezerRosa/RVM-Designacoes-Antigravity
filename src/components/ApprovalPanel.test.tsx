import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { workbookOverviewQueryService } from '../services/workbookOverviewQueryService';
import { workbookLifecycleService } from '../services/workbookLifecycleService';
import { installDom } from '../test/componentTestUtils';
import { WorkbookStatus, type WorkbookPart } from '../types';
void React;

const pendingPart = {
    id: 'part-1',
    weekId: '2026-05-12',
    weekDisplay: '12-18 de Maio',
    date: '2099-05-12',
    section: 'Tesouros',
    tipoParte: 'Joias Espirituais',
    modalidade: 'Discurso de Ensino',
    tituloParte: 'Tema 1',
    descricaoParte: '',
    detalhesParte: '',
    seq: 1,
    funcao: 'Titular',
    duracao: '10 min',
    horaInicio: '19:00',
    horaFim: '19:10',
    rawPublisherName: '',
    resolvedPublisherName: 'Carlos Dias',
    resolvedPublisherId: '',
    status: WorkbookStatus.PROPOSTA,
    createdAt: '2099-01-01T00:00:00.000Z',
} as WorkbookPart;

test('ApprovalPanel approves a proposed assignment through workbookLifecycleService', async () => {
    const dom = installDom();
    let approveCalls = 0;
    let statusCalls = 0;
    const originalGetPartsByStatus = workbookOverviewQueryService.getPartsByStatus;
    const originalGetAllParts = workbookOverviewQueryService.getAllParts;
    const originalGetFutureStats = workbookOverviewQueryService.getFutureStats;
    const originalApproveProposal = workbookLifecycleService.approveProposal;

    workbookOverviewQueryService.getPartsByStatus = async status => {
        statusCalls += 1;
        assert.equal(status, WorkbookStatus.PROPOSTA);
        return [pendingPart];
    };
    workbookOverviewQueryService.getAllParts = async () => [pendingPart];
    workbookOverviewQueryService.getFutureStats = async () => ({ PROPOSTA: 1 });
    workbookLifecycleService.approveProposal = async (partId, elderId) => {
        approveCalls += 1;
        assert.equal(partId, 'part-1');
        assert.equal(elderId, 'elder-1');
        return { ...pendingPart, status: WorkbookStatus.APROVADA };
    };

    try {
        const { default: ApprovalPanel } = await import('./ApprovalPanel');
        const view = render(<ApprovalPanel elderId="elder-1" publishers={[]} />);

        const approveButton = await view.findByRole('button', { name: /^✅ Aprovar$/i });
        fireEvent.click(approveButton);

        await waitFor(() => {
            assert.equal(approveCalls, 1);
            assert.ok(statusCalls >= 2);
        });
    } finally {
        workbookOverviewQueryService.getPartsByStatus = originalGetPartsByStatus;
        workbookOverviewQueryService.getAllParts = originalGetAllParts;
        workbookOverviewQueryService.getFutureStats = originalGetFutureStats;
        workbookLifecycleService.approveProposal = originalApproveProposal;
        dom.cleanup();
    }
});