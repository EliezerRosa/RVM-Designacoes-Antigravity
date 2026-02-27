import { generateWhatsAppMessage } from '../src/services/s89Generator';
import { communicationService } from '../src/services/communicationService';
import { WorkbookPart, WorkbookStatus } from '../src/types';

// Mock WorkbookPart
const mockPart: WorkbookPart = {
    id: 'test-id',
    weekId: '2026-03-05',
    weekDisplay: '5 de março de 2026',
    date: '2026-03-05',
    section: 'Faça Seu Melhor no Ministério',
    tipoParte: 'Iniciando Conversas (Vídeo)',
    modalidade: 'Demostração (Sala B)',
    tituloParte: 'Como encontrar a verdade',
    descricaoParte: '',
    detalhesParte: '',
    seq: 1,
    funcao: 'Titular',
    duracao: '5',
    horaInicio: '19:45',
    horaFim: '19:50',
    rawPublisherName: 'João Silva',
    resolvedPublisherName: 'João Silva',
    status: 'DESIGNADA' as WorkbookStatus,
    createdAt: new Date().toISOString()
};

const mockAssistantPart: WorkbookPart = {
    ...mockPart,
    funcao: 'Ajudante',
    rawPublisherName: 'Maria Oliveira',
    resolvedPublisherName: 'Maria Oliveira'
};

console.log('--- TEST: Individual Message (Titular, Sala B) ---');
console.log(generateWhatsAppMessage(mockPart, 'brother', 'Maria Oliveira', '5511999999999'));

console.log('\n--- TEST: Individual Message (Ajudante, Sala B) ---');
console.log(generateWhatsAppMessage(mockAssistantPart, 'sister', 'João Silva', '5511888888888', true));

console.log('\n--- TEST: Program Message (S-140) ---');
console.log(communicationService.prepareS140Message('2026-03-05', [mockPart]));
