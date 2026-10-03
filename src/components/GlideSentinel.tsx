import React, { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { workbookQueryService } from '../services/workbookQueryService';
import { isWeekPublished } from '../services/weekPublishService';
import { getWeekMondayId } from '../services/eligibilityService';
import type { Publisher } from '../types';

interface GlideSentinelProps {
    publishers: Publisher[];
}

export function GlideSentinel({ publishers }: GlideSentinelProps) {
    useEffect(() => {
        let channel: any;
        let isMounted = true;

        const setupSentinel = async () => {
            if (!isMounted) return;

            const triggerSync = (reason: string) => {
                console.log(`[Sentinel] ${reason} detectada. Aguardando 60 segundos...`);
                if ((window as any).sentinelTimer) clearTimeout((window as any).sentinelTimer);
                (window as any).sentinelTimer = setTimeout(async () => {
                    try {
                        const freshParts = await workbookQueryService.getAllParts();
                        const { exportGlideInvisible } = await import('../services/glideExportService');
                        await exportGlideInvisible(freshParts, publishers);
                        console.log('[Sentinel] Sincronização invisível concluída com sucesso!');
                    } catch (e) {
                        console.error('[Sentinel] Falha na sincronização invisível:', e);
                    }
                }, 60000); // Regra 2: Espera de 60 segundos
            };

            channel = supabase
                .channel('sentinel-glide-sync')
                // 1. Escuta mudanças físicas nas partes
                .on('postgres_changes', { event: '*', schema: 'public', table: 'workbook_parts' }, async (payload) => {
                    const record = payload.new || payload.old;
                    const recordWeekId = record?.week_id;
                    if (!recordWeekId) return;

                    try {
                        const todayStr = new Date().toISOString().slice(0, 10);
                        const currentMonday = getWeekMondayId(todayStr);

                        // Regra 1: Sentinela só atua nas 4 semanas (Atual + 3)
                        const limitDateObj = new Date(currentMonday);
                        limitDateObj.setDate(limitDateObj.getDate() + 28); // +4 semanas
                        const limitDateStr = limitDateObj.toISOString().slice(0, 10);

                        if (recordWeekId < currentMonday || recordWeekId >= limitDateStr) {
                            return; // Ignora se for passada ou se for além da 4ª semana
                        }

                        const published = await isWeekPublished(recordWeekId);
                        if (published) {
                            triggerSync(`Mudança na parte da semana ${recordWeekId}`);
                        }
                    } catch (err) {
                        console.error('[Sentinel] Erro ao verificar se semana está publicada:', err);
                    }
                })
                // 2. Escuta mudanças no selo de publicação global
                .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings', filter: 'key=eq.week_published' }, async (payload) => {
                    triggerSync('Mudança no status de publicação global (semana publicada)');
                })
                .subscribe();
        };

        if (publishers.length > 0) {
            setupSentinel();
        }

        return () => {
            isMounted = false;
            if ((window as any).sentinelTimer) clearTimeout((window as any).sentinelTimer);
            if (channel) {
                supabase.removeChannel(channel);
            }
        };
    }, [publishers]);

    return null; // Componente invisível
}
