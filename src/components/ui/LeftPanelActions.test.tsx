import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { installDom } from '../../test/componentTestUtils';
import { LeftPanelActions } from './LeftPanelActions';
import type { ChatActionChipItem } from './ChatActionChips';
import type { PostResponseActionItem } from './PostResponseActions';
void React;

const chips: ChatActionChipItem[] = [
    { id: 'c1', label: 'Gerar S-89', onClick: () => {} },
    { id: 'c2', label: 'Aprovar tudo', onClick: () => {}, tone: 'accent' },
];
const actions: PostResponseActionItem[] = [
    { id: 'a1', label: 'Confirmar', onClick: () => {}, variant: 'primary' },
];
test('LeftPanelActions: emite badgeCount = chips + actions', () => {
    const dom = installDom();
    try {
        let received = -1;
        render(
            <LeftPanelActions
                chips={chips}
                suggestedActions={actions}
                onBadgeCountChange={n => { received = n; }}
            />
        );
        assert.equal(received, chips.length + actions.length);
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
                onBadgeCountChange={() => {}}
            />
        );
        assert.equal(view.queryByText(/Para esta semana/i), null);
        assert.equal(view.queryByText(/Ações sugeridas/i), null);
    } finally {
        dom.cleanup();
    }
});
