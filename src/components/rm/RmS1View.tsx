import { useEffect, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { rmService, type RmCongregation, type RmMonthlyReport, type RmPublisher, type RmFieldGroup } from '../../services/rm/rmService';
import { RmS1PrintTemplate, type S1PrintData } from './RmS1PrintTemplate';
import { RmS1ReportEditModal } from './RmS1ReportEditModal';

interface Props {
    congregation: RmCongregation;
    year: number;
    month: number;
}

const MONTHS_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export function RmS1View({ congregation, year, month }: Props) {
    const [publishers, setPublishers] = useState<RmPublisher[]>([]);
    const [reports, setReports] = useState<RmMonthlyReport[]>([]);
    const [fieldGroups, setFieldGroups] = useState<RmFieldGroup[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [printing, setPrinting] = useState(false);
    
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});
    const [editingPublisher, setEditingPublisher] = useState<RmPublisher | null>(null);
    const [editingReport, setEditingReport] = useState<RmMonthlyReport | null>(null);

    const printRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            setError(null);
            try {
                const [pubs, reps, fGroups] = await Promise.all([
                    rmService.listPublishers(congregation.id),
                    rmService.listReports({
                        reference_year: year,
                        reference_month: month,
                        congregation_id: congregation.id
                    }),
                    rmService.listFieldGroups(congregation.id)
                ]);
                setPublishers(pubs);
                setReports(reps);
                setFieldGroups(fGroups);
            } catch (err) {
                setError(String((err as Error).message ?? err));
            } finally {
                setLoading(false);
            }
        };
        void load();
    }, [congregation.id, year, month]);

    // O Glide mostra "(-2 PE's)", então a contagem de congregados na view da congregação não os inclui
    const congregadosSemPe = publishers.filter(p => p.is_congregated && !p.is_special_pioneer);
    
    const validReports = reports.filter(r => !r.is_special_pioneer);
    const reportedPubIds = new Set(validReports.map(r => r.publisher_id));
    
    // Inativos Estruturais = Congregados (sem PEs) com status de INATIVO (0/6 meses)
    const inactivePubs = congregadosSemPe.filter(p => p.field_service_status === 'INATIVO');
    
    // Não Relataram no Mês = Congregados que não entregaram relatório, mas NÃO estão inativos estruturalmente
    const missedReportPubs = congregadosSemPe.filter(p => !reportedPubIds.has(p.id) && p.field_service_status !== 'INATIVO');
    
    // Não Congregados = false
    const notCongregatedPubs = publishers.filter(p => !p.is_congregated && !p.is_special_pioneer);
    
    // Modalidades
    const auxReports = validReports.filter(r => r.is_auxiliary_pioneer);
    const regReports = validReports.filter(r => r.is_regular_pioneer);
    const pubReports = validReports.filter(r => !r.is_auxiliary_pioneer && !r.is_regular_pioneer);

    const pubList = publishers.filter(p => pubReports.some(r => r.publisher_id === p.id));
    const auxList = publishers.filter(p => auxReports.some(r => r.publisher_id === p.id));
    const regList = publishers.filter(p => regReports.some(r => r.publisher_id === p.id));

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

    const handleSaveReport = (report: RmMonthlyReport) => {
        setReports(prev => {
            const idx = prev.findIndex(r => r.id === report.id || r.publisher_id === report.publisher_id);
            if (idx >= 0) {
                const copy = [...prev];
                copy[idx] = report;
                return copy;
            }
            return [...prev, report];
        });
        setEditingPublisher(null);
        setEditingReport(null);
    };

    const toggleExpand = (section: string) => {
        setExpanded(prev => ({ ...prev, [section]: !prev[section] }));
    };

    const renderList = (pubs: RmPublisher[], title: string, section: string, color: string) => {
        const isExp = expanded[section];

        const grouped = pubs.reduce((acc, p) => {
            const groupId = p.current_group_id || 'unassigned';
            if (!acc[groupId]) acc[groupId] = [];
            acc[groupId].push(p);
            return acc;
        }, {} as Record<string, RmPublisher[]>);

        const sortedGroups = Object.keys(grouped).sort((a, b) => {
            if (a === 'unassigned') return 1;
            if (b === 'unassigned') return -1;
            const ga = fieldGroups.find(g => g.id === a);
            const gb = fieldGroups.find(g => g.id === b);
            return (ga?.name || '').localeCompare(gb?.name || '');
        });

        return (
            <div style={{ marginTop: 12, borderTop: `1px solid ${color}40`, paddingTop: 12 }}>
                <button onClick={() => toggleExpand(section)} style={{ background: 'transparent', border: 'none', color, cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 6, padding: 0 }}>
                    {isExp ? '▼' : '▶'} {title}
                </button>
                {isExp && (
                    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 16 }}>
                        {sortedGroups.map(groupId => {
                            const groupName = groupId === 'unassigned' ? 'Sem Grupo' : (fieldGroups.find(g => g.id === groupId)?.name || 'Grupo Desconhecido');
                            const groupPubs = grouped[groupId].sort((a, b) => a.name.localeCompare(b.name));
                            
                            return (
                                <div key={groupId}>
                                    <div style={{ fontSize: '0.8rem', color: color, marginBottom: 4, fontWeight: 'bold', textTransform: 'uppercase' }}>
                                        {groupName} ({groupPubs.length})
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {groupPubs.map(p => {
                                            const r = validReports.find(rep => rep.publisher_id === p.id);
                                            return (
                                                <div 
                                                    key={p.id} 
                                                    onClick={() => { setEditingPublisher(p); setEditingReport(r || null); }}
                                                    style={{ 
                                                        padding: '8px 12px', background: 'rgba(255,255,255,0.05)', borderRadius: 6, cursor: 'pointer',
                                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9rem'
                                                    }}
                                                >
                                                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        {p.name}
                                                        {p.field_service_status && <span style={{ fontSize: '0.65rem', padding: '2px 4px', borderRadius: 4, background: 'rgba(255,255,255,0.1)' }}>{p.field_service_status}</span>}
                                                    </span>
                                                    <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>
                                                        {r ? `${r.hours ? r.hours + 'h • ' : ''}${r.bible_studies || 0}est` : 'Sem relatório'}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    };

    if (loading) return <div style={{ padding: 20 }}>Carregando dados granulares do S-1...</div>;
    if (error) return <div style={{ padding: 20, color: 'red' }}>{error}</div>;

    const totalAtrasados = metrics.pub.atrasados + metrics.aux.atrasados + metrics.reg.atrasados;

    const printData: S1PrintData = {
        congregationName: congregation.name,
        city: 'Cidade',
        state: 'Estado',
        congregationNumber: congregation.number || '_____',
        monthYear: `${MONTHS_PT[month - 1]}/${year}`,
        publicadores: { relataram: metrics.pub.relataram, estudos: metrics.pub.estudos },
        auxiliares: { relataram: metrics.aux.relataram, estudos: metrics.aux.estudos, horas: metrics.aux.horas },
        regulares: { relataram: metrics.reg.relataram, estudos: metrics.reg.estudos, horas: metrics.reg.horas },
        publicadoresAtivos: validReports.length
    };

    return (
        <div>
            {editingPublisher && (
                <RmS1ReportEditModal
                    publisher={editingPublisher}
                    report={editingReport}
                    year={year}
                    month={month}
                    congregationId={congregation.id}
                    onClose={() => { setEditingPublisher(null); setEditingReport(null); }}
                    onSave={handleSaveReport}
                />
            )}

            {/* Cabeçalho de Controle */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                <div>
                    <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                        <div>
                            <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Publicadores ativos</div>
                            <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{validReports.length}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Número de relatórios</div>
                            <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{validReports.length}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Total Atrasados Incluídos</div>
                            <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{totalAtrasados}</div>
                        </div>
                    </div>

                    <div style={{ color: '#94a3b8', fontSize: '0.9rem', marginBottom: 8 }}>Métricas e Anomalias</div>
                    <div style={{ background: '#1e293b', padding: '12px 16px', borderRadius: 8, marginBottom: 8, minWidth: 300 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>CONGREGADOS INATIVOS</span>
                            <span style={{ fontWeight: 'bold' }}>{inactivePubs.length}</span>
                        </div>
                        {renderList(inactivePubs, 'Ver inativos estruturais', 'inativos', '#94a3b8')}
                    </div>
                    <div style={{ background: '#1e293b', padding: '12px 16px', borderRadius: 8, marginBottom: 8, minWidth: 300 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>NÃO RELATARAM NO MÊS</span>
                            <span style={{ fontWeight: 'bold' }}>{missedReportPubs.length}</span>
                        </div>
                        {renderList(missedReportPubs, 'Ver quem não relatou', 'nao_relataram', '#f59e0b')}
                    </div>
                    <div style={{ background: '#1e293b', padding: '12px 16px', borderRadius: 8, marginBottom: 8, minWidth: 300 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>NÃO CONGREGADOS</span>
                            <span style={{ fontWeight: 'bold' }}>{notCongregatedPubs.length}</span>
                        </div>
                        {renderList(notCongregatedPubs, 'Ver não congregados', 'nao_congregados', '#94a3b8')}
                    </div>
                    <div style={{ fontSize: '0.9rem', color: '#94a3b8', marginTop: 12 }}>
                        Cartões de Congregados (sem PE): <strong style={{ color: '#fff' }}>{congregadosSemPe.length}</strong>
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
                    <div style={{ padding: 16 }}>
                        <div style={{ display: 'flex', gap: 32 }}>
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
                        {renderList(pubList, `Lista dos ${pubList.length} Publicadores Não Pioneiros`, 'lista_pub', '#4ade80')}
                    </div>
                </div>

                {/* AUXILIARES */}
                <div style={{ background: '#1e293b', borderRadius: 8, overflow: 'hidden' }}>
                    <div style={{ background: '#fef08a', color: '#854d0e', padding: '12px', textAlign: 'center', fontWeight: 'bold', letterSpacing: 1 }}>
                        PIONEIROS AUXILIARES
                    </div>
                    <div style={{ padding: 16 }}>
                        <div style={{ display: 'flex', gap: 32 }}>
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
                        {renderList(auxList, `Lista dos ${auxList.length} Pioneiros Auxiliares`, 'lista_aux', '#facc15')}
                    </div>
                </div>

                {/* REGULARES */}
                <div style={{ background: '#1e293b', borderRadius: 8, overflow: 'hidden' }}>
                    <div style={{ background: '#fca5a5', color: '#991b1b', padding: '12px', textAlign: 'center', fontWeight: 'bold', letterSpacing: 1 }}>
                        PIONEIROS REGULARES
                    </div>
                    <div style={{ padding: 16 }}>
                        <div style={{ display: 'flex', gap: 32 }}>
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
                        {renderList(regList, `Lista dos ${regList.length} Pioneiros Regulares`, 'lista_reg', '#f87171')}
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
