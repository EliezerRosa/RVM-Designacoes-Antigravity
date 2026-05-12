import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { installDom } from '../../test/componentTestUtils';
import { LeftPanelActions } from './LeftPanelActions';
import type { ChatActionChipItem } from './ChatActionChips';
import type { PostResponseActionItem } from './PostResponseActions';
import type { SlashCommandItem } from './SlashCommandMenu';
void React;

const chips: ChatActionChipItem[] = [
    { id: 'c1', label: 'Gerar S-89', onClick: () => {} },
    { id: 'c2', label: 'Aprovar tudo', onClick: () => {}, tone: 'accent' },
];
const actions: PostResponseActionItem[] = [
    { id: 'a1', label: 'Confirmar', onClick: () => {}, variant: 'primary' },
];
const slashes: SlashCommandItem[] = [
    { command: '/aprovar', description: 'Aprovar proposta' } as SlashCommandItem,
];

test('LeftPanelActions: emite badgeCount = chips + actions', () => {
    const dom = installDom();
    try {
        let received = -1;
        render(
            <LeftPanelActions
                chips={chips}
                suggestedActions={actions}
                slashCommands={slashes}
                onBadgeCountChange={n => { received = n; }}
            />
        );
        assert.equal(received, chips.length + actions.length);
    } finally {
        dom.cleanup();
    }
});

test('LeftPanelActions: bloco "Comandos rápidos" começa colapsado e abre ao clicar', () => {
    const dom = installDom();
    try {
        const view = render(
            <LeftPanelActions
                chips={[]}
                suggestedActions={[]}
                slashCommands={slashes}
                onBadgeCountChange={() => {}}
            />
        );
        // Header presente
        const header = view.getByText(/Comandos rápidos/i);
        assert.ok(header);
        // Slash NÃO visível inicialmente
        assert.equal(view.queryByText('/aprovar'), null);
        fireEvent.click(header);
        assert.ok(view.queryByText('/aprovar'), 'expandiu após clique');
    } finally {
        dom.cleanup();
    }
});

test('LeftPanelActions: blocos vazios não renderizam', () => {
    const dom = installDom();
    try {
        const view = render(
            <LeftPanelActions
                chips={[]}
                suggestedActions={[]}
                slashCommands={[]}
                onBadgeCountChange={() => {}}
            />
        );
        assert.equal(view.queryByText(/Para esta semana/i), null);
        assert.equal(view.queryByText(/Ações sugeridas/i), null);
        assert.equal(view.queryByText(/Comandos rápidos/i), null);
    } finally {
        dom.cleanup();
    }
});
