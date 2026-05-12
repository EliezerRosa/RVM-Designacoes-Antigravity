import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { installDom } from '../../test/componentTestUtils';
import { ChatMessageBubble } from './ChatMessageBubble';
void React;

const SHORT = 'Resposta curta do agente.';
const LONG = 'Intro do agente.\n\n## Seção 1\n\n' + 'a'.repeat(50) + '\n\n## Seção 2\n\n' + 'b'.repeat(50);

test('ChatMessageBubble: respostas curtas renderizam inline sem botão "Abrir"', () => {
    const dom = installDom();
    try {
        const view = render(<ChatMessageBubble role="assistant" content={SHORT} />);
        assert.ok(view.container.textContent?.includes(SHORT));
        assert.equal(view.queryByText(/Abrir resposta completa/i), null);
    } finally {
        dom.cleanup();
    }
});

test('ChatMessageBubble: long-mode (com "## ") mostra resumo + botão e abre modal', () => {
    const dom = installDom();
    try {
        const view = render(<ChatMessageBubble role="assistant" content={LONG} />);
        const btn = view.getByRole('button', { name: /Abrir resposta completa/i });
        // Modal não está renderizado inicialmente
        assert.equal(view.queryByRole('dialog'), null);
        fireEvent.click(btn);
        const dialog = view.getByRole('dialog');
        assert.ok(dialog);
        // Conteúdo completo (ambas seções) deve aparecer dentro do modal
        assert.ok(dialog.textContent?.includes('Seção 1'));
        assert.ok(dialog.textContent?.includes('Seção 2'));
    } finally {
        dom.cleanup();
    }
});

test('ChatMessageBubble: usuário nunca entra em long-mode', () => {
    const dom = installDom();
    try {
        const view = render(<ChatMessageBubble role="user" content={LONG} />);
        assert.equal(view.queryByText(/Abrir resposta completa/i), null);
    } finally {
        dom.cleanup();
    }
});
