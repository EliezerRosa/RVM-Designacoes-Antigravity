import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, fireEvent, act } from '@testing-library/react';
import { installDom } from '../../test/componentTestUtils';
import { ChatDrawerShell, type DrawerSlot } from './ChatDrawerShell';
void React;

const leftSlots: DrawerSlot[] = [
    { id: 'a', title: 'Ações', icon: '💡', content: <div>conteúdo esquerdo</div>, badgeCount: 2 },
];
const rightSlots: DrawerSlot[] = [
    { id: 'b', title: 'Detalhes', icon: '📋', content: <div>conteúdo direito</div> },
];

test('ChatDrawerShell: trilhos visíveis e abrem painéis ao clicar', () => {
    const dom = installDom();
    try {
        const view = render(
            <ChatDrawerShell leftSlots={leftSlots} rightSlots={rightSlots} storageKey="test-shell-1">
                <div>chat</div>
            </ChatDrawerShell>
        );
        const railLeft = view.getByRole('button', { name: /Abrir painel ações/i });
        const railRight = view.getByRole('button', { name: /Abrir painel detalhes/i });
        assert.ok(railLeft);
        assert.ok(railRight);

        fireEvent.click(railLeft);
        assert.ok(view.queryByText('conteúdo esquerdo'), 'painel esquerdo abre');
        assert.equal(view.queryByText('conteúdo direito'), null, 'direito fechado (mutex)');
    } finally {
        dom.cleanup();
    }
});

test('ChatDrawerShell: Ctrl+[ alterna esquerdo e Esc fecha', () => {
    const dom = installDom();
    try {
        const view = render(
            <ChatDrawerShell leftSlots={leftSlots} storageKey="test-shell-2">
                <div>chat</div>
            </ChatDrawerShell>
        );
        act(() => {
            window.dispatchEvent(new (globalThis.KeyboardEvent ?? window.KeyboardEvent)('keydown', { key: '[', ctrlKey: true }));
        });
        assert.ok(view.queryByText('conteúdo esquerdo'), 'abriu via Ctrl+[');

        act(() => {
            window.dispatchEvent(new (globalThis.KeyboardEvent ?? window.KeyboardEvent)('keydown', { key: 'Escape' }));
        });
        assert.equal(view.queryByText('conteúdo esquerdo'), null, 'fechou via Esc');
    } finally {
        dom.cleanup();
    }
});

test('ChatDrawerShell: forceOpen com bump de nonce abre o lado solicitado', () => {
    const dom = installDom();
    try {
        const view = render(
            <ChatDrawerShell
                leftSlots={leftSlots}
                rightSlots={rightSlots}
                storageKey="test-shell-3"
                forceOpen={null}
            >
                <div>chat</div>
            </ChatDrawerShell>
        );
        assert.equal(view.queryByText('conteúdo direito'), null);
        view.rerender(
            <ChatDrawerShell
                leftSlots={leftSlots}
                rightSlots={rightSlots}
                storageKey="test-shell-3"
                forceOpen={{ side: 'right', nonce: 1 }}
            >
                <div>chat</div>
            </ChatDrawerShell>
        );
        assert.ok(view.queryByText('conteúdo direito'), 'forceOpen abriu o direito');
    } finally {
        dom.cleanup();
    }
});

test('ChatDrawerShell: badge agrega badgeCount dos slots', () => {
    const dom = installDom();
    try {
        const slots: DrawerSlot[] = [
            { id: '1', title: 'A', content: <span />, badgeCount: 3 },
            { id: '2', title: 'B', content: <span />, badgeCount: 4 },
        ];
        const view = render(
            <ChatDrawerShell leftSlots={slots} storageKey="test-shell-4">
                <div>chat</div>
            </ChatDrawerShell>
        );
        // Trilho fechado mostra "7" como badge.
        assert.ok(view.container.textContent?.includes('7'));
    } finally {
        dom.cleanup();
    }
});
