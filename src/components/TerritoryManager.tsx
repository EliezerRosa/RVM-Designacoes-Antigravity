import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function TerritoryManager() {
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        // Component Mount Setup
        setIsLoading(false);
    }, []);

    return (
        <div className="territory-manager">
            <div className="page-header">
                <h2>Controle de Territórios</h2>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button className="btn-primary">
                        + Novo Território
                    </button>
                </div>
            </div>

            {isLoading ? (
                <div className="loading-screen" style={{ position: 'relative', height: '200px' }}>
                    <div className="spinner"></div>
                </div>
            ) : (
                <div className="territory-content" style={{ padding: '20px', background: '#1e1e2d', borderRadius: '8px', marginTop: '20px' }}>
                    <p style={{ color: '#9ca3af', textAlign: 'center', padding: '40px' }}>
                        🌍 Módulo de Territórios em construção. Aqui listaremos os bairros, quadras e o mapa geral.
                    </p>
                </div>
            )}
        </div>
    );
}
