import { generateSemanticRulesForWeek } from './src/services/semanticAgentService';
import dotenv from 'dotenv';
dotenv.config();

const dummyParts = [
    {
        id: "abc-123",
        weekId: "2026-07-06",
        section: "Tesouros da Palavra de Deus",
        modalidade: "Discurso de Ensino",
        tituloParte: "Como defender a fé",
        descricaoParte: "Use a bíblia",
        detalhesParte: "",
        tempo: 10,
        partOrder: 1
    }
];

async function main() {
    try {
        console.log("Calling generateSemanticRulesForWeek...");
        const result = await generateSemanticRulesForWeek("2026-07-06", dummyParts as any);
        console.log("Result:", result);
    } catch (e) {
        console.error("Error:", e);
    }
}
main();
