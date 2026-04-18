import { useCallback, useEffect, useRef, useState } from 'react';
import type { HistoryRecord, Publisher, WorkbookPart } from '../types';
import { api } from '../services/api';
import { loadCompletedParticipations } from '../services/historyAdapter';
import { supabase } from '../lib/supabase';
import { updateRotationConfig } from '../services/unifiedRotationService';
import { publisherDirectoryService } from '../services/publisherDirectoryService';
import { workbookQueryService } from '../services/workbookQueryService';

export type AppActiveTab = 'workbook' | 'approvals' | 'publishers' | 'territories' | 'backup' | 'agent' | 'admin' | 'communication';

const VALID_TABS: AppActiveTab[] = ['workbook', 'approvals', 'publishers', 'territories', 'backup', 'agent', 'admin', 'communication'];

interface UseAuthenticatedAppDataOptions {
  onInitialTabResolved?: (tab: AppActiveTab) => void;
  onCriticalError?: (message: string) => void;
}

const computePublisherHash = (publishers: Publisher[]) =>
  publishers.map(p => `${p.id}:${p.name}:${p.gender}:${p.condition}:${p.isServing}`).join('|');

const computePartsHash = (parts: WorkbookPart[]) =>
  `${parts.length}:${parts.slice(0, 50).map(p => `${p.id}:${p.resolvedPublisherName || ''}:${p.status}`).join('|')}`;

export function useAuthenticatedAppData({ onInitialTabResolved, onCriticalError }: UseAuthenticatedAppDataOptions = {}) {
  const [publishers, setPublishers] = useState<Publisher[]>([]);
  const [workbookParts, setWorkbookParts] = useState<WorkbookPart[]>([]);
  const [historyRecords, setHistoryRecords] = useState<HistoryRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorkbookLoading, setIsWorkbookLoading] = useState(false);
  const [, setLastPartsRefresh] = useState(0);
  const isWorkbookLoadingRef = useRef(false);
  const publisherHashRef = useRef('');
  const partsHashRef = useRef('INIT');

  const refreshWorkbookParts = useCallback(async (options?: { forceRefresh?: boolean }) => {
    if (isWorkbookLoadingRef.current) {
      return;
    }

    isWorkbookLoadingRef.current = true;
    setIsWorkbookLoading(true);

    try {
      const data = await workbookQueryService.getAllParts(undefined, options);
      setWorkbookParts(data);
      setLastPartsRefresh(Date.now());
    } catch (err) {
      console.error('[App] Error refreshing workbook parts:', err);
    } finally {
      isWorkbookLoadingRef.current = false;
      setIsWorkbookLoading(false);
    }
  }, []);

  const refreshAllData = useCallback(async () => {
    try {
      const [parts, pubs] = await Promise.all([
        workbookQueryService.getAllParts(),
        publisherDirectoryService.loadAllPublishers(),
      ]);
      setWorkbookParts(parts);
      setPublishers(pubs);
    } catch (err) {
      console.warn('[App] Error refreshing all data:', err);
    }
  }, []);

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        console.log('Loading data from Supabase...');

        const [pubs, savedTab, history, engineConfig] = await Promise.all([
          publisherDirectoryService.loadAllPublishers().catch(err => {
            console.warn('Failed to load publishers', err);
            return [] as Publisher[];
          }),
          api.getSetting<AppActiveTab>('activeTab', 'workbook').catch(() => 'workbook' as AppActiveTab),
          loadCompletedParticipations().catch(() => [] as HistoryRecord[]),
          api.getSetting<any>('engine_config', null).catch(() => null),
        ]);

        if (engineConfig) {
          console.log('[App] Applying custom engine config from DB:', engineConfig);
          updateRotationConfig(engineConfig);
        }

        setHistoryRecords(history);
        setPublishers(pubs);
        publisherHashRef.current = computePublisherHash(pubs);
        console.log(`[App] Loaded ${pubs.length} publishers from DB`);

        onInitialTabResolved?.(VALID_TABS.includes(savedTab) ? savedTab : 'workbook');
      } catch (error) {
        console.error('Critical error loading data', error);
        onCriticalError?.('Erro crítico ao carregar dados.');
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [onCriticalError, onInitialTabResolved]);

  useEffect(() => {
    console.log('[REALTIME] Setting up subscriptions...');
    let pollingInterval: ReturnType<typeof setInterval> | null = null;

    const unsubPublishers = api.subscribeToPublishers((newPubs) => {
      console.log(`[REALTIME] Publishers updated: ${newPubs.length}`);
      publisherHashRef.current = computePublisherHash(newPubs);
      setPublishers(newPubs);
    });

    pollingInterval = setInterval(async () => {
      try {
        const freshPubs = await publisherDirectoryService.loadAllPublishers();
        const newHash = computePublisherHash(freshPubs);

        if (newHash !== publisherHashRef.current) {
          console.log('[POLLING] Change detected, refreshing publishers...');
          publisherHashRef.current = newHash;
          setPublishers(freshPubs);
        }
      } catch (e) {
        console.warn('[POLLING] Error checking publishers:', e);
      }
    }, 30000);

    return () => {
      console.log('[REALTIME] Cleaning up subscriptions...');
      unsubPublishers();
      if (pollingInterval) clearInterval(pollingInterval);
    };
  }, []);

  useEffect(() => {
    console.log('[REALTIME] Setting up workbook_parts sync...');
    let partsPollingInterval: ReturnType<typeof setInterval> | null = null;
    let partsDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    let isPartsProcessing = false;

    const partsChannel = supabase
      .channel('parts-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'workbook_parts' },
        async () => {
          if (isPartsProcessing) return;
          if (partsDebounceTimer) clearTimeout(partsDebounceTimer);
          partsDebounceTimer = setTimeout(async () => {
            try {
              isPartsProcessing = true;
              const freshParts = await workbookQueryService.getAllParts(undefined, { forceRefresh: true });
              partsHashRef.current = computePartsHash(freshParts);
              setWorkbookParts(freshParts);
            } catch (err) {
              console.warn('[REALTIME] Failed to reload parts:', err);
            } finally {
              isPartsProcessing = false;
            }
          }, 3000);
        },
      )
      .subscribe();

    workbookQueryService.getAllParts().then(parts => {
      partsHashRef.current = computePartsHash(parts);
    }).catch(() => {});

    partsPollingInterval = setInterval(async () => {
      try {
        const freshParts = await workbookQueryService.getAllParts(undefined, { forceRefresh: true });
        const newHash = computePartsHash(freshParts);
        if (newHash !== partsHashRef.current) {
          console.log('[POLLING] Parts change detected, refreshing...');
          partsHashRef.current = newHash;
          setWorkbookParts(freshParts);
        }
      } catch (e) {
        console.warn('[POLLING] Error checking parts:', e);
      }
    }, 60000);

    return () => {
      console.log('[REALTIME] Cleaning up parts sync...');
      if (partsDebounceTimer) clearTimeout(partsDebounceTimer);
      if (partsPollingInterval) clearInterval(partsPollingInterval);
      supabase.removeChannel(partsChannel);
    };
  }, []);

  return {
    publishers,
    setPublishers,
    workbookParts,
    setWorkbookParts,
    historyRecords,
    isLoading,
    isWorkbookLoading,
    refreshWorkbookParts,
    refreshAllData,
  };
}