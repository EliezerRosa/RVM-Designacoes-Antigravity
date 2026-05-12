import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { installDom } from '../../test/componentTestUtils';
import { RightPanelDetails } from './RightPanelDetails';
import type { FloatingMicroUiItem } from './FloatingMicroUiHost';
void React;

const items: FloatingMicroUiItem[] = [
    { id: 'm1', title: 'Aprovação', accent: '#6366F1', content: <div>conteúdo m1</div> },
    { id: 'm2', title: 'Disponibilidade', accent: '#10B981', content: <div>conteúdo m2</div> },
];

test('RightPanelDetails: empty state quando items=[]', () => {
    const dom = installDom();
    try {
        const view = render(<RightPanelDetails items={[]} activeId={null} />);
        assert.ok(view.container.textContent?.includes('Nenhuma micro-UI'));
    } finally {
        dom.cleanup();
    }
});

test('RightPanelDetails: expande automaticamente o activeId', () => {
    const dom = installDom();
    try {
        const view = render(<RightPanelDetails items={items} activeId="m2" />);
        // O conteúdo do m2 deve estar visível, m1 colapsado.
        assert.ok(view.queryByText('conteúdo m2'), 'm2 expandido por activeId');
    } finally {
        dom.cleanup();
    }
});

test('RightPanelDetails: clique no header alterna expansão (sem activeId fixo)', () => {
    const dom = installDom();
    try {
        const view = render(<RightPanelDetails items={items} activeId={null} />);
        // Default: primeiro item expandido
        assert.ok(view.queryByText('conteúdo m1'));
        assert.equal(view.queryByText('conteúdo m2'), null);
        const headerM2 = view.getByText('Disponibilidade');
        fireEvent.click(headerM2);
        assert.ok(view.queryByText('conteúdo m2'), 'm2 expandiu após clique');
    } finally {
        dom.cleanup();
    }
});
