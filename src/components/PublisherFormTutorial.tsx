/**
 * PublisherFormTutorial — Tour guiado do formulário de Atualização de Publicadores.
 * Wrapper fino sobre <GuidedTour /> com o roteiro de 13 passos específico.
 */

import { GuidedTour, tourSeenKey, type TourStep } from './GuidedTour';
import type { PublisherFormRole } from './PublisherStatusForm';

type Role = PublisherFormRole | 'admin';

interface TutorialProps {
    role: Role;
    open: boolean;
    onClose: () => void;
    /** Callback p/ trocar a sub-aba antes de destacar o seletor. */
    onRequireSection?: (section: 'status' | 'privileges' | 'sections') => void;
}

export function PublisherFormTutorial({ role, open, onClose, onRequireSection }: TutorialProps) {
    const STEPS: TourStep[] = [
        {
            title: 'Boas-vindas 👋',
            body: 'Este formulário concentra a atualização de publicadores da congregação. Vou te mostrar, em cerca de dois minutos, como cada parte funciona — e quais campos você pode editar de acordo com seu papel.',
        },
        {
            selector: '[data-tour="role-badge"]',
            title: 'Seu papel',
            body: 'Aqui aparece o papel do link que você está usando — CCA, SEC, SS, SRVM ou Aj SRVM. As permissões dentro do formulário dependem desse papel.',
        },
        {
            selector: '[data-tour="search"]',
            title: 'Filtro de busca',
            body: 'Digite parte do nome do publicador para localizá-lo rapidamente. A lista é atualizada em tempo real.',
        },
        {
            selector: '[data-tour="tabs"]',
            title: 'Três sub-abas',
            body: 'Status de Participação, Privilégios e Por Seção. Cada uma agrupa um conjunto de campos. Vamos passar por todas.',
        },
        {
            selector: '[data-tour="col-isServing"]',
            requireSetup: () => onRequireSection?.('status'),
            title: 'Em Serviço',
            body: 'Marca se o publicador está atualmente em serviço ativo. CCA e SEC podem editar; SRVM, Aj SRVM e SS apenas visualizam.',
            editorRoles: ['admin', 'CCA', 'SEC'],
        },
        {
            selector: '[data-tour="col-notQualified"]',
            requireSetup: () => onRequireSection?.('status'),
            title: 'Não Apto e Motivo',
            body: 'Quando ativado, abre o campo de motivo ao lado. CCA e SEC podem editar; demais papéis apenas visualizam.',
            editorRoles: ['admin', 'CCA', 'SEC'],
        },
        {
            selector: '[data-tour="col-noParticip"]',
            requireSetup: () => onRequireSection?.('status'),
            title: 'Pediu Não Participar e Motivo',
            body: 'Indica que o publicador pediu para não participar de designações por um período. Apenas SRVM e Aj SRVM podem editar essas colunas; CCA, SEC e SS apenas visualizam.',
            editorRoles: ['admin', 'SRVM', 'AjSRVM'],
        },
        {
            selector: '[data-tour="col-helperOnly"]',
            requireSetup: () => onRequireSection?.('status'),
            title: 'Só Ajudante',
            body: 'Marca o publicador como elegível somente para o papel de ajudante em demonstrações. Apenas SRVM e Aj SRVM podem editar; demais papéis apenas visualizam.',
            editorRoles: ['admin', 'SRVM', 'AjSRVM'],
        },
        {
            selector: '[data-tour="tabs"]',
            requireSetup: () => onRequireSection?.('privileges'),
            title: 'Aba Privilégios',
            body: 'Aqui você define quem pode presidir, dar discursos, orar, ler e dirigir o EBC. CCA e SEC editam; SRVM, Aj SRVM e SS apenas visualizam.',
            editorRoles: ['admin', 'CCA', 'SEC'],
        },
        {
            selector: '[data-tour="tabs"]',
            requireSetup: () => onRequireSection?.('sections'),
            title: 'Aba Por Seção',
            body: 'Define se o publicador participa de Tesouros, Ministério ou Vida Cristã. CCA e SEC editam; demais papéis apenas visualizam.',
            editorRoles: ['admin', 'CCA', 'SEC'],
        },
        {
            selector: '[data-tour="btn-localneeds"]',
            title: 'Necessidades Locais',
            body: 'Abre o gerenciador da fila de Necessidades Locais. Todos podem entrar; CCA e SEC têm CRUD completo, demais papéis abrem em modo somente leitura. Há um tutorial dedicado dentro do modal.',
            editorRoles: ['admin', 'CCA', 'SEC'],
        },
        {
            selector: '[data-tour="btn-events"]',
            title: 'Eventos Especiais',
            body: 'Abre o gerenciador de Eventos Especiais — assembleias, visitas, congressos. Todos podem entrar; CCA e SEC têm CRUD, demais apenas visualizam. Também tem tutorial dentro.',
            editorRoles: ['admin', 'CCA', 'SEC'],
        },
        {
            selector: '[data-tour="btn-save"]',
            title: 'Salvar em lote',
            body: 'Suas alterações ficam pendentes até você clicar em Salvar. O contador laranja mostra quantos publicadores foram modificados. Pronto, é isso! Você pode revisitar este tutorial pelo botão de interrogação no cabeçalho.',
        },
    ];

    return (
        <GuidedTour
            open={open}
            onClose={onClose}
            role={role}
            steps={STEPS}
            contextLabel="Atualização de Publicadores"
        />
    );
}

// Re-export do helper para manter compat com PublisherStatusForm.
export function tutorialSeenKey(role: Role): string {
    return tourSeenKey('publisher_form', role);
}
