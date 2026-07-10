import { useEffect, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { rmService, type RmCongregation, type RmMonthlyReport, type RmPublisher } from '../../services/rm/rmService';
import { RmS1PrintTemplate, type S1PrintData } from './RmS1PrintTemplate';

interface Props {
    congregation: RmCongregation;
    year: number;
    month: number;
}

const MONTHS_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export function RmS1View({ congregation, year, month }: Props) {
    const [publishers, setPublishers] = useState<RmPublisher[]>([]);
    const [reports, setReports] = useState<RmMonthlyReport[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [printing, setPrinting] = useState(false);
    
    const printRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            setError(null);
            try {
                const [pubs, reps] = await Promise.all([
                    rmService.listPublishers(congregation.id),
                    rmService.listReports({
                        reference_year: year,
                        reference_month: month,
                        congregation_id: congregation.id
                    })
                ]);
                setPublishers(pubs);
                setReports(reps);
            } catch (err) {
                setError(String((err as Error).message ?? err));
            } finally {
                setLoading(false);
            }
        };
        void load();
    }, [congregation.id, year, month]);

    // Calcular KPIs
    // 1. Inativos no mês = Congregados (is_congregated = true) que NÃO possuem relatório no mês
    const congregated = publishers.filter(p => p.is_congregated);
    
    // IDs de quem entregou
    const reportedPubIds = new Set(reports.map(r => r.publisher_id));
    const inactiveInMonth = congregated.filter(p => !reportedPubIds.has(p.id)).length;
    
    // 2. Não Congregados = is_congregated = false
    const notCongregated = publishers.filter(p => !p.is_congregated).length;
    
    // 3. Cartões de congregados (total = congregated)
    // O Glide mostra "(-2 PE's)", aqui vamos manter o número líquido de publicadores que entram na conta
    // P.E. relatórios vão p/ Filial, então seus cartões "oficiais" na cong podem ser subtraídos dessa conta principal.
    // Para simplificar e bater, vamos contar apenas quem NÃO é PE.
    const cartoesCongregados = congregated.filter(p => !p.is_special_pioneer).length;

    // 4. Modalidades (Lembrando: PE's são EXCLUÍDOS do S-1 congregacional, conforme Opção A)
    const validReports = reports.filter(r => !r.is_special_pioneer);

    const auxReports = validReports.filter(r => r.is_auxiliary_pioneer);
    const regReports = validReports.filter(r => r.is_regular_pioneer);
    const pubReports = validReports.filter(r => !r.is_auxiliary_pioneer && !r.is_regular_pioneer);

    const calcGroup = (group: RmMonthlyReport[]) => ({
        relataram: group.length,
        estudos: group.reduce((sum, r) => sum + (r.bible_studies || 0), 0),
        horas: group.reduce((sum, r) => sum + (r.hours || 0), 0),
        atrasados: group.filter(r => r.is_late_report).length
    });

    const metrics = {
        pub: calcGroup(pubReports),
        aux: calcGroup(auxReports),
        reg: calcGroup(regReports)
    };

    // O publicadoresAtivos será o tamanho do validReports

    const handlePrint = async () => {
        if (!printRef.current) return;
        setPrinting(true);
        try {
            const canvas = await html2canvas(printRef.current, { scale: 2 });
            const imgData = canvas.toDataURL('image/png');
            
            const link = document.createElement('a');
            link.href = imgData;
            link.download = `S-1_${congregation.name}_${MONTHS_PT[month - 1]}_${year}.png`;
            link.click();
        } catch (e) {
            console.error('Failed to generate image', e);
            alert('Erro ao gerar imagem.');
        } finally {
            setPrinting(false);
        }
    };

    if (loading) return <div style={{ padding: 20 }}>Carregando dados granulares do S-1...</div>;
    if (error) return <div style={{ padding: 20, color: 'red' }}>{error}</div>;

    const printData: S1PrintData = {
        congregationName: congregation.name,
        city: 'Cidade', // To do: add to DB if needed, or leave generic
        state: 'Estado', // To do: add to DB
        congregationNumber: congregation.number || '_____',
        monthYear: `${MONTHS_PT[month - 1]}/${year}`,
        publicadores: { relataram: metrics.pub.relataram, estudos: metrics.pub.estudos },
        auxiliares: { relataram: metrics.aux.relataram, estudos: metrics.aux.estudos, horas: metrics.aux.horas },
        regulares: { relataram: metrics.reg.relataram, estudos: metrics.reg.estudos, horas: metrics.reg.horas },
        publicadoresAtivos: validReports.length
    };

    return (
        <div>
            {/* Cabeçalho de Controle */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                    <div style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: 8 }}>Métricas e Anomalias</div>
                    <div style={{ background: '#1e293b', padding: '12px 16px', borderRadius: 8, marginBottom: 8, display: 'flex', justifyContent: 'space-between', minWidth: 300 }}>
                        <span>CONGREGADOS INATIVOS NO MÊS</span>
                        <span style={{ fontWeight: 'bold' }}>{inactiveInMonth}</span>
                    </div>
                    <div style={{ background: '#1e293b', padding: '12px 16px', borderRadius: 8, marginBottom: 8, display: 'flex', justifyContent: 'space-between', minWidth: 300 }}>
                        <span>NÃO CONGREGADOS</span>
                        <span style={{ fontWeight: 'bold' }}>{notCongregated}</span>
                    </div>
                    <div style={{ fontSize: '0.9rem', color: '#94a3b8', marginTop: 12 }}>
                        Cartões de Congregados (sem PE): <strong style={{ color: '#fff' }}>{cartoesCongregados}</strong>
                    </div>
                </div>

                <div>
                    <button 
                        onClick={handlePrint}
                        disabled={printing}
                        style={{
                            background: '#3b82f6', color: '#fff', border: 'none', 
                            padding: '12px 24px', borderRadius: 8, fontWeight: 'bold',
                            cursor: printing ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', gap: 8
                        }}
                    >
                        {printing ? 'Gerando...' : '📷 Gerar Imagem do S-1'}
                    </button>
                    <div style={{ textAlign: 'right', fontSize: '0.8rem', color: '#94a3b8', marginTop: 8 }}>
                        (Formato padrão em papel)
                    </div>
                </div>
            </div>

            {/* Blocos de Modalidade */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                
                {/* PUBLICADORES */}
                <div style={{ background: '#1e293b', borderRadius: 8, overflow: 'hidden' }}>
                    <div style={{ background: '#bbf7d0', color: '#166534', padding: '12px', textAlign: 'center', fontWeight: 'bold', letterSpacing: 1 }}>
                        PUBLICADORES
                    </div>
                    <div style={{ display: 'flex', padding: 16, gap: 32 }}>
                        <div>
                            <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Número de relatórios</div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{metrics.pub.relataram}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Estudos bíblicos</div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{metrics.pub.estudos}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Atrasados</div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{metrics.pub.atrasados}</div>
                        </div>
                    </div>
                </div>

                {/* AUXILIARES */}
                <div style={{ background: '#1e293b', borderRadius: 8, overflow: 'hidden' }}>
                    <div style={{ background: '#fef08a', color: '#854d0e', padding: '12px', textAlign: 'center', fontWeight: 'bold', letterSpacing: 1 }}>
                        PIONEIROS AUXILIARES
                    </div>
                    <div style={{ display: 'flex', padding: 16, gap: 32 }}>
                        <div>
                            <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Número de relatórios</div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{metrics.aux.relataram}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Horas</div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{metrics.aux.horas}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Estudos bíblicos</div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{metrics.aux.estudos}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Atrasados</div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{metrics.aux.atrasados}</div>
                        </div>
                    </div>
                </div>

                {/* REGULARES */}
                <div style={{ background: '#1e293b', borderRadius: 8, overflow: 'hidden' }}>
                    <div style={{ background: '#fca5a5', color: '#991b1b', padding: '12px', textAlign: 'center', fontWeight: 'bold', letterSpacing: 1 }}>
                        PIONEIROS REGULARES
                    </div>
                    <div style={{ display: 'flex', padding: 16, gap: 32 }}>
                        <div>
                            <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Número de relatórios</div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{metrics.reg.relataram}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Horas</div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{metrics.reg.horas}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Estudos bíblicos</div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{metrics.reg.estudos}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Atrasados</div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{metrics.reg.atrasados}</div>
                        </div>
                    </div>
                </div>

            </div>

            {/* Container Oculto para o Template de Impressão */}
            <div style={{ position: 'absolute', top: -9999, left: -9999 }}>
                <RmS1PrintTemplate ref={printRef} data={printData} />
            </div>

        </div>
    );
}
