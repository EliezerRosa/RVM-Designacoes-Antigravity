import { useState, useEffect, useCallback } from 'react';

/**
 * Hook reutilizável para estado persistido no localStorage.
 * Mantém o estado sincronizado entre abas do navegador.
 * 
 * @param key Chave única no localStorage
 * @param defaultValue Valor padrão se não existir no storage
 * @returns [value, setValue, clearValue]
 */
export function usePersistedState<T>(
    key: string,
    defaultValue: T
): [T, (value: T | ((prev: T) => T)) => void, () => void] {
    // Inicializa com valor do localStorage ou default
    const [state, setState] = useState<T>(() => {
        try {
            const stored = localStorage.getItem(key);
            if (stored !== null) {
                return JSON.parse(stored) as T;
            }
        } catch (e) {
            console.warn(`[usePersistedState] Erro ao ler '${key}':`, e);
        }
        return defaultValue;
    });

    // Persiste no localStorage quando state muda
    useEffect(() => {
        try {
            localStorage.setItem(key, JSON.stringify(state));
        } catch (e) {
            console.warn(`[usePersistedState] Erro ao salvar '${key}':`, e);
        }
    }, [key, state]);

    // Função para limpar o valor
    const clearValue = useCallback(() => {
        try {
            localStorage.removeItem(key);
            setState(defaultValue);
        } catch (e) {
            console.warn(`[usePersistedState] Erro ao limpar '${key}':`, e);
        }
    }, [key, defaultValue]);

    return [state, setState, clearValue];
}

/**
 * Hook para múltiplos valores persistidos com prefixo comum.
 * Útil para persistir estado de componente inteiro.
 * 
 * @param prefix Prefixo para todas as chaves (ex: 'publisherList_')
 * @param defaults Objeto com chaves e valores padrão
 */
export function usePersistedStateGroup<T extends Record<string, unknown>>(
    prefix: string,
    defaults: T
): {
    values: T;
    setValue: <K extends keyof T>(key: K, value: T[K]) => void;
    clearAll: () => void;
} {
    // Inicializa todos os valores
    const [values, setValues] = useState<T>(() => {
        const result = { ...defaults };
        for (const key of Object.keys(defaults)) {
            try {
                const stored = localStorage.getItem(`${prefix}${key}`);
                if (stored !== null) {
                    (result as Record<string, unknown>)[key] = JSON.parse(stored);
                }
            } catch (e) {
                // Ignora erros, usa default
            }
        }
        return result;
    });

    // Função para atualizar um valor específico
    const setValue = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
        setValues(prev => {
            const next = { ...prev, [key]: value };
            try {
                localStorage.setItem(`${prefix}${String(key)}`, JSON.stringify(value));
            } catch (e) {
                console.warn(`[usePersistedStateGroup] Erro ao salvar '${prefix}${String(key)}':`, e);
            }
            return next;
        });
    }, [prefix]);

    // Função para limpar todos os valores
    const clearAll = useCallback(() => {
        for (const key of Object.keys(defaults)) {
            try {
                localStorage.removeItem(`${prefix}${key}`);
            } catch (e) {
                // Ignora erros
            }
        }
        setValues(defaults);
    }, [prefix, defaults]);

    return { values, setValue, clearAll };
}

export default usePersistedState;
