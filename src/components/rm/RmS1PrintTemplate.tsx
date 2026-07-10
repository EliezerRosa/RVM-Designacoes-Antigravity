import { forwardRef } from 'react';

export interface S1PrintData {
    congregationName: string;
    city: string;
    state: string;
    congregationNumber: string;
    monthYear: string;
    publicadores: { relataram: number; estudos: number };
    auxiliares: { relataram: number; estudos: number; horas: number };
    regulares: { relataram: number; estudos: number; horas: number };
    publicadoresAtivos: number;
}

interface Props {
    data: S1PrintData;
}

export const RmS1PrintTemplate = forwardRef<HTMLDivElement, Props>(({ data }, ref) => {
    return (
        <div 
            ref={ref}
            style={{
                width: '800px',
                padding: '40px 50px',
                backgroundColor: '#ffffff',
                color: '#000000',
                fontFamily: 'Arial, sans-serif',
                position: 'relative',
                boxSizing: 'border-box'
            }}
        >
            <h1 style={{ textAlign: 'center', fontSize: '20px', fontWeight: 'bold', margin: '0 0 5px 0' }}>
                RELATÓRIO DE SERVIÇO DE CAMPO E DE ASSISTÊNCIA
            </h1>
            <h2 style={{ textAlign: 'center', fontSize: '20px', fontWeight: 'bold', margin: '0 0 30px 0' }}>
                ÀS REUNIÕES DA CONGREGAÇÃO
            </h2>

            {/* Header info */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
                <div style={{ flex: 1, borderBottom: '1px dotted #000', textAlign: 'center', margin: '0 10px', paddingBottom: '2px' }}>
                    {data.congregationName}
                </div>
                <div style={{ flex: 1, borderBottom: '1px dotted #000', textAlign: 'center', margin: '0 10px', paddingBottom: '2px' }}>
                    {data.city}
                </div>
                <div style={{ flex: 1, borderBottom: '1px dotted #000', textAlign: 'center', margin: '0 10px', paddingBottom: '2px' }}>
                    {data.state}
                </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '25px', color: '#555' }}>
                <div style={{ flex: 1, textAlign: 'center' }}>(Nome da congregação)</div>
                <div style={{ flex: 1, textAlign: 'center' }}>(Cidade)</div>
                <div style={{ flex: 1, textAlign: 'center' }}>(Província ou estado)</div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '30px' }}>
                <div style={{ display: 'flex', flex: 1 }}>
                    <span style={{ marginRight: '10px' }}>Relatório de</span>
                    <div style={{ flex: 1, borderBottom: '1px dotted #000', textAlign: 'center', paddingBottom: '2px' }}>
                        {data.monthYear}
                    </div>
                </div>
                <div style={{ flex: 0.1 }}></div>
                <div style={{ display: 'flex', flex: 1 }}>
                    <span style={{ marginRight: '10px' }}>Número da congregação:</span>
                    <div style={{ flex: 1, borderBottom: '1px dotted #000', textAlign: 'center', paddingBottom: '2px' }}>
                        {data.congregationNumber}
                    </div>
                </div>
            </div>

            {/* Main Table */}
            <table style={{ width: '100%', borderCollapse: 'collapse', border: '2px solid #000', marginBottom: '20px' }}>
                <thead>
                    <tr>
                        <th style={{ width: '34%', border: '1px solid #000', padding: '10px', borderBottom: '2px solid #000' }}></th>
                        <th style={{ width: '22%', border: '1px solid #000', padding: '10px', fontWeight: 'normal', textAlign: 'center', borderBottom: '2px solid #000' }}>Quantos<br/>relataram</th>
                        <th style={{ width: '22%', border: '1px solid #000', padding: '10px', fontWeight: 'normal', textAlign: 'center', borderBottom: '2px solid #000' }}>Estudos<br/>bíblicos</th>
                        <th style={{ width: '22%', border: '1px solid #000', padding: '10px', fontWeight: 'normal', textAlign: 'center', borderBottom: '2px solid #000' }}>Horas</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td style={{ border: '1px solid #000', padding: '12px 10px', fontSize: '15px' }}>Publicadores</td>
                        <td style={{ border: '1px solid #000', padding: '12px 10px', textAlign: 'center', fontSize: '16px' }}>{data.publicadores.relataram || ''}</td>
                        <td style={{ border: '1px solid #000', padding: '12px 10px', textAlign: 'center', fontSize: '16px' }}>{data.publicadores.estudos || ''}</td>
                        <td style={{ border: '1px solid #000', padding: '12px 10px', backgroundColor: '#808080' }}></td>
                    </tr>
                    <tr>
                        <td style={{ border: '1px solid #000', padding: '12px 10px', fontSize: '15px' }}>Pioneiros auxiliares</td>
                        <td style={{ border: '1px solid #000', padding: '12px 10px', textAlign: 'center', fontSize: '16px' }}>{data.auxiliares.relataram || ''}</td>
                        <td style={{ border: '1px solid #000', padding: '12px 10px', textAlign: 'center', fontSize: '16px' }}>{data.auxiliares.estudos || ''}</td>
                        <td style={{ border: '1px solid #000', padding: '12px 10px', textAlign: 'center', fontSize: '16px' }}>{data.auxiliares.horas || ''}</td>
                    </tr>
                    <tr>
                        <td style={{ border: '1px solid #000', padding: '12px 10px', fontSize: '15px' }}>Pioneiros regulares</td>
                        <td style={{ border: '1px solid #000', padding: '12px 10px', textAlign: 'center', fontSize: '16px' }}>{data.regulares.relataram || ''}</td>
                        <td style={{ border: '1px solid #000', padding: '12px 10px', textAlign: 'center', fontSize: '16px' }}>{data.regulares.estudos || ''}</td>
                        <td style={{ border: '1px solid #000', padding: '12px 10px', textAlign: 'center', fontSize: '16px' }}>{data.regulares.horas || ''}</td>
                    </tr>
                </tbody>
            </table>

            {/* Bottom Section */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '50px' }}>
                <div style={{ display: 'flex', border: '2px solid #000', width: '32%' }}>
                    <div style={{ padding: '8px 10px', borderRight: '1px solid #000', flex: 1, fontSize: '14px' }}>Publicadores<br/>ativos</div>
                    <div style={{ width: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>
                        {data.publicadoresAtivos || ''}
                    </div>
                </div>

                <div style={{ display: 'flex', border: '2px solid #000', width: '50%' }}>
                    <div style={{ padding: '8px 10px', borderRight: '1px solid #000', flex: 1, fontSize: '14px' }}>Média da assistência da<br/>reunião do fim de semana</div>
                    <div style={{ width: '100px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {/* Empty box */}
                    </div>
                </div>
            </div>

            {/* Footer Signature */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
                <div style={{ width: '350px', borderTop: '1px dotted #000', textAlign: 'center', paddingTop: '5px', fontSize: '13px' }}>
                    (Secretário)
                </div>
            </div>

            <div style={{ fontSize: '13px' }}>
                S-1-T  11/23
            </div>
        </div>
    );
});
