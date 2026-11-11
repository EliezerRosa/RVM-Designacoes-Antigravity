import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';
import type { UserBriefingData } from '../ports/briefingPort';

let bootstrapDom: JSDOM | null = null;

async function withDomTesting<T>(
  fn: (deps: {
    rtl: typeof import('@testing-library/react');
    BriefingModal: typeof import('../ui/BriefingModal').BriefingModal;
    MicroPanel: typeof import('../ui/MicroPanel').MicroPanel;
    DocumentCarousel: typeof import('../ui/DocumentCarousel').DocumentCarousel;
    ConversaShell: typeof import('../ui/ConversaShell').ConversaShell;
  }) => Promise<T> | T
): Promise<T> {
  if (!bootstrapDom) {
    bootstrapDom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'http://localhost/conversa.html',
    });
    Object.defineProperties(globalThis, {
      window: { value: bootstrapDom.window, configurable: true },
      document: { value: bootstrapDom.window.document, configurable: true },
      self: { value: bootstrapDom.window, configurable: true },
      navigator: { value: bootstrapDom.window.navigator, configurable: true },
      HTMLElement: { value: bootstrapDom.window.HTMLElement, configurable: true },
      Node: { value: bootstrapDom.window.Node, configurable: true },
      Event: { value: bootstrapDom.window.Event, configurable: true },
      CustomEvent: { value: bootstrapDom.window.CustomEvent, configurable: true },
      MouseEvent: { value: bootstrapDom.window.MouseEvent, configurable: true },
      localStorage: { value: bootstrapDom.window.localStorage, configurable: true },
      sessionStorage: { value: bootstrapDom.window.sessionStorage, configurable: true },
      getComputedStyle: {
        value: bootstrapDom.window.getComputedStyle.bind(bootstrapDom.window),
        configurable: true,
      },
    });
  }

  const { installDom } = await import('../../../test/componentTestUtils');
  const dom = installDom('http://localhost/conversa.html');
  try {
    const [rtl, briefingMod, panelMod, carouselMod, shellMod] = await Promise.all([
      import('@testing-library/react'),
      import('../ui/BriefingModal'),
      import('../ui/MicroPanel'),
      import('../ui/DocumentCarousel'),
      import('../ui/ConversaShell'),
    ]);
    return await fn({
      rtl,
      BriefingModal: briefingMod.BriefingModal,
      MicroPanel: panelMod.MicroPanel,
      DocumentCarousel: carouselMod.DocumentCarousel,
      ConversaShell: shellMod.ConversaShell,
    });
  } finally {
    dom.cleanup();
  }
}

test('BriefingModal: confirms assignment and submits inline refusal reason', async () => {
  await withDomTesting(async ({ rtl: { render, fireEvent, waitFor }, BriefingModal }) => {
    let confirmedId: string | null = null;
    let refusedPayload: { id: string; reason: string } | null = null;

    const briefing: UserBriefingData = {
      userName: 'João',
      writtenGreeting: 'Olá João, você tem 1 designação aguardando confirmação.',
      spokenSummary: 'Você tem 1 designação aguardando confirmação.',
      hasPendingItems: true,
      assignmentsToFulfill: [],
      upcomingEvents: [
        {
          id: 'ev-1',
          name: 'Assembleia de Circuito',
          startDate: '2026-12-06',
          endDate: '2026-12-06',
          type: 'assembly',
        },
      ],
      assignmentsToConfirm: [
        {
          partId: 'part-101',
          weekId: '2026-11-23',
          tipoParte: 'Leitura da Bíblia',
          role: 'titular',
          status: 'DESIGNADA',
          dateStr: '2026-11-23',
        },
      ],
    };

    const view = render(
      React.createElement(BriefingModal, {
        briefing,
        onClose: () => undefined,
        onConfirmAssignment: async (partId) => {
          confirmedId = partId;
        },
        onRefuseAssignment: async (partId, reason) => {
          refusedPayload = { id: partId, reason };
        },
      })
    );

    fireEvent.click(view.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => {
      assert.equal(confirmedId, 'part-101');
    });

    fireEvent.click(view.getByRole('button', { name: 'Não poderei' }));
    const input = view.getByPlaceholderText(/Motivo da recusa/i);
    fireEvent.change(input, { target: { value: 'Viagem a trabalho' } });
    fireEvent.click(view.getByRole('button', { name: 'Enviar recusa' }));

    await waitFor(() => {
      assert.deepEqual(refusedPayload, {
        id: 'part-101',
        reason: 'Viagem a trabalho',
      });
    });
  });
});

test('MicroPanel: renders pending-weeks-list, success/error states, and status badge variants', async () => {
  await withDomTesting(({ rtl: { render }, MicroPanel }) => {
    const view = render(
      React.createElement(MicroPanel, {
        cardData: {
          type: 'pending-weeks-list',
          title: 'Semanas Pendentes',
          items: [{ weekId: '2026-11-16' }, { weekId: '2026-11-23' }],
        },
      })
    );

    assert.ok(view.getByText(/Semana de 2026-11-16/));
    assert.ok(view.getByText(/Semana de 2026-11-23/));

    view.rerender(
      React.createElement(MicroPanel, {
        cardData: {
          type: 'assignments-list',
          title: 'Minhas Designações',
          items: [
            {
              partId: 'p1',
              weekId: '2026-11-16',
              tipoParte: 'Oração Inicial',
              role: 'titular',
              status: 'DESIGNADA',
              dateStr: '2026-11-16',
            },
            {
              partId: 'p2',
              weekId: '2026-11-23',
              tipoParte: 'Leitura',
              role: 'titular',
              status: 'recusada',
              dateStr: '2026-11-23',
            },
          ],
        },
      })
    );

    assert.ok(view.container.querySelector('.cv-badge-success'));
    assert.ok(view.container.querySelector('.cv-badge-danger'));

    view.rerender(
      React.createElement(MicroPanel, {
        cardData: {
          status: 'error',
          title: 'Registro de Ausência',
          description: 'Data inválida informada.',
        },
      })
    );

    assert.ok(view.getByText(/Data inválida informada\./));
  });
});

test('DocumentCarousel: navigates chronologically and toggles fullscreen safely', async () => {
  await withDomTesting(({ rtl: { render, fireEvent }, DocumentCarousel }) => {
    const view = render(
      React.createElement(DocumentCarousel, {
        items: [
          {
            id: 's140-1',
            docType: 's140',
            title: 'S-140 Semana 1',
            subtitle: 'Congregação',
            dateStr: '2026-11-16',
            htmlContent: '<p>Conteudo 1</p>',
            isInitialFocus: true,
          },
          {
            id: 's140-2',
            docType: 's140',
            title: 'S-140 Semana 2',
            subtitle: 'Congregação',
            dateStr: '2026-11-23',
            htmlContent: '<p>Conteudo 2</p>',
          },
        ],
      })
    );

    assert.ok(view.getByText('S-140 Semana 1'));
    fireEvent.click(view.getByTitle('Próxima semana / Documento'));
    assert.ok(view.getByText('S-140 Semana 2'));

    fireEvent.click(view.getByTitle('Expandir tela cheia'));
    assert.ok(view.container.querySelector('.cv-carousel-fullscreen'));

    view.rerender(
      React.createElement(DocumentCarousel, {
        items: [
          {
            id: 's140-only',
            docType: 's140',
            title: 'S-140 Unica',
            subtitle: 'Congregação',
            dateStr: '2026-11-30',
            htmlContent: '<p>Unica</p>',
          },
        ],
      })
    );
    assert.ok(view.getByText('S-140 Unica'));
  });
});

test('ConversaShell: wires header actions, clarify card selection, and composer submit', async () => {
  await withDomTesting(({ rtl: { render, fireEvent }, ConversaShell }) => {
    let signedOut = false;
    let cleared = false;
    let sentText = '';
    let pickedIndex = -1;

    const view = render(
      React.createElement(ConversaShell, {
        userLabel: 'João Silva',
        isProcessing: false,
        isBriefingOpen: false,
        briefingData: {
          userName: 'João Silva',
          writtenGreeting: 'Tudo em dia.',
          spokenSummary: 'Tudo em dia.',
          hasPendingItems: false,
          assignmentsToConfirm: [],
          assignmentsToFulfill: [],
          upcomingEvents: [],
        },
        messages: [
          {
            id: 'm1',
            sender: 'assistant',
            text: 'Qual João?',
            timestamp: 1000,
            cardType: 'clarify',
            cardData: {
              title: 'Escolha um irmão',
              candidates: [
                { id: '1', label: 'João Pedro' },
                { id: '2', label: 'João Paulo' },
              ],
            },
          },
        ],
        onCloseBriefing: () => undefined,
        onOpenBriefing: () => undefined,
        onSendMessage: (t) => {
          sentText = t;
        },
        onSelectCandidate: (_c, idx) => {
          pickedIndex = idx;
        },
        onClearHistory: () => {
          cleared = true;
        },
        onSignOut: () => {
          signedOut = true;
        },
      })
    );

    fireEvent.click(view.getByRole('button', { name: /João Pedro/i }));
    assert.equal(pickedIndex, 0);

    fireEvent.click(view.getByRole('button', { name: 'Sair' }));
    assert.equal(signedOut, true);

    fireEvent.click(view.getByTitle('Limpar conversa'));
    assert.equal(cleared, true);

    const input = view.getByPlaceholderText(/Escreva ou fale sua pergunta/i);
    fireEvent.change(input, { target: { value: 'ver S-140' } });
    fireEvent.submit(input.closest('form')!);
    assert.equal(sentText, 'ver S-140');
  });
});
