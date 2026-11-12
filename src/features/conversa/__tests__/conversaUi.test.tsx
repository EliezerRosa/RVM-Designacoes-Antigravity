import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { JSDOM } from 'jsdom';
import type { UserBriefingData } from '../ports/briefingPort';

let bootstrapDom: JSDOM | null = null;

after(() => {
  bootstrapDom?.window.close();
  bootstrapDom = null;
});

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

    assert.ok(view.getByText(/Semana de 16\/11\/2026/));
    assert.ok(view.getByText(/Semana de 23\/11\/2026/));

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
    assert.ok(view.getByText(/1 de 2 · 16\/11\/2026/));
    assert.equal(view.container.innerHTML.includes('overflow: auto'), false);
    assert.ok(view.container.querySelector('.cv-form-frame'));
    assert.ok(view.container.querySelector('.cv-form-canvas'));

    fireEvent.click(view.getByTitle('Próxima semana / Documento'));
    assert.ok(view.getByText('S-140 Semana 2'));
    assert.ok(view.getByText(/2 de 2 · 23\/11\/2026/));

    // Swipe horizontal (esquerda -> volta ou avança)
    const track = view.container.querySelector('.cv-carousel-track')!;
    fireEvent.touchStart(track, { touches: [{ clientX: 220, clientY: 100 }] });
    fireEvent.touchEnd(track, { changedTouches: [{ clientX: 90, clientY: 102 }] });
    assert.ok(view.getByText('S-140 Semana 1'));

    // Tela cheia + Escape para sair
    fireEvent.click(view.getByTitle('Expandir tela cheia'));
    assert.ok(view.container.querySelector('.cv-carousel-fullscreen'));
    fireEvent.keyDown(window, { key: 'Escape' });
    assert.equal(view.container.querySelector('.cv-carousel-fullscreen'), null);

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
    const nextBtn = view.getByTitle('Próxima semana / Documento') as HTMLButtonElement;
    assert.equal(nextBtn.disabled, true);
  });
});

test('DocumentCarousel: scales forms proportionally to fit mobile and desktop viewports', async () => {
  await withDomTesting(({ rtl: { render, fireEvent }, DocumentCarousel }) => {
    const origClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
    const origScrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight');
    const origScrollWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollWidth');
    const origInnerW = window.innerWidth;
    const origInnerH = window.innerHeight;

    let mockTrackWidth = 320; // Celular estreito

    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get() {
        return (this as HTMLElement).classList?.contains('cv-carousel-track') ? mockTrackWidth : 0;
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
      configurable: true,
      get() {
        return (this as HTMLElement).classList?.contains('cv-form-canvas') ? 1000 : 0;
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
      configurable: true,
      get() {
        return (this as HTMLElement).classList?.contains('cv-form-canvas') ? 800 : 0;
      },
    });

    try {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 360 });
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: 780 });

      const view = render(
        React.createElement(DocumentCarousel, {
          items: [
            {
              id: 's140-fit',
              docType: 's140',
              title: 'S-140 Mobile',
              subtitle: '12 partes',
              dateStr: '16/11/2026',
              naturalWidth: 800,
              htmlContent: '<div>Folha S-140</div>',
              isInitialFocus: true,
            },
          ],
        })
      );

      fireEvent(window, new Event('resize'));

      const frame = view.container.querySelector('.cv-form-frame') as HTMLElement;
      const canvas = view.container.querySelector('.cv-form-canvas') as HTMLElement;
      assert.equal(frame.style.width, '320px');
      assert.equal(frame.style.height, '400px');
      assert.equal(canvas.style.width, '800px');
      assert.match(canvas.style.transform, /scale\(0\.4\)/);

      // Simula redimensionamento para desktop
      mockTrackWidth = 640;
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1366 });
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: 768 });
      fireEvent(window, new Event('resize'));

      // Em laptop 1366x768, availH = min(768 - 230, 660) = 538 -> scale limitado pela altura (0.538)
      assert.equal(frame.style.height, '538px');
      assert.equal(frame.style.width, '430px');
    } finally {
      if (origClientWidth) Object.defineProperty(HTMLElement.prototype, 'clientWidth', origClientWidth);
      else Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth');
      if (origScrollHeight) Object.defineProperty(HTMLElement.prototype, 'scrollHeight', origScrollHeight);
      else Reflect.deleteProperty(HTMLElement.prototype, 'scrollHeight');
      if (origScrollWidth) Object.defineProperty(HTMLElement.prototype, 'scrollWidth', origScrollWidth);
      else Reflect.deleteProperty(HTMLElement.prototype, 'scrollWidth');
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: origInnerW });
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: origInnerH });
    }
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
